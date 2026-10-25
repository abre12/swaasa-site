import { NextResponse } from 'next/server'
import { supaAdmin, supaServer } from '@/lib/supabase/server'
// Owner-only: create staff logins, and reset a password. Uses the server-side service key, which never reaches the browser.
async function ownerOnly() {
  const { data: { user } } = await supaServer().auth.getUser(); if (!user) return false
  const { data } = await supaServer().from('staff').select('role,active').eq('user_id', user.id).maybeSingle()
  return data?.role === 'owner' && data.active === true
}
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })
export async function POST(req: Request) {
  if (!(await ownerOnly())) return fail('Only the owner can add staff.', 403)
  const b = await req.json().catch(() => ({})), name = String(b.name || '').trim(), email = String(b.email || '').trim().toLowerCase(), password = String(b.password || ''), role = b.role
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !['manager', 'preparation'].includes(role)) return fail('Enter a name, a valid email, a password of at least 8 characters and a role.')
  const admin = supaAdmin()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })   // no confirmation email needed
  if (error || !data.user) return fail(/already|registered|exists/i.test(error?.message || '') ? 'That email already has a login.' : 'Could not create the login.')
  const { error: e2 } = await admin.from('staff').insert({ user_id: data.user.id, role, name, email })
  if (e2) { await admin.auth.admin.deleteUser(data.user.id); return fail('Could not save the staff member.', 500) }
  return NextResponse.json({ ok: true })
}
export async function PATCH(req: Request) {
  if (!(await ownerOnly())) return fail('Only the owner can reset passwords.', 403)
  const b = await req.json().catch(() => ({})), id = String(b.user_id || ''), password = String(b.password || '')
  if (password.length < 8) return fail('The password must be at least 8 characters.')
  const { data: row } = await supaAdmin().from('staff').select('role').eq('user_id', id).maybeSingle()
  if (!row || row.role === 'owner') return fail('That account cannot be changed here.', 403)
  const { error } = await supaAdmin().auth.admin.updateUserById(id, { password })
  return error ? fail('Could not change the password.', 500) : NextResponse.json({ ok: true })
}
