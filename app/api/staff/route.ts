import { NextResponse } from 'next/server'
import { supaAdmin, supaServer } from '@/lib/supabase/server'
import { failWith as fail, readJson, sameOrigin } from '@/lib/apiGuard'
import { passwordProblem } from '@/lib/password'
// Owner-only: create staff logins, and reset a password. Uses the server-side service key, which never reaches the browser.
async function ownerOnly() {
  const { data: { user } } = await (await supaServer()).auth.getUser(); if (!user) return false
  const { data } = await (await supaServer()).from('staff').select('role,active').eq('user_id', user.id).maybeSingle()
  return data?.role === 'owner' && data.active === true
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail('Not allowed.', 403)
  if (!(await ownerOnly())) return fail('Only the owner can add staff.', 403)
  const b = (await readJson(req)) ?? {}, name = String(b.name || '').trim(), email = String(b.email || '').trim().toLowerCase(), password = String(b.password || ''), role = b.role
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || role !== 'manager') return fail('Enter a name, a valid email and a role.')
  const weak = passwordProblem(password, email); if (weak) return fail(weak)
  const admin = supaAdmin()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { must_change_password: true } })   // no confirmation email needed; the person picks their own password at first sign-in
  if (error || !data.user) return fail(/already|registered|exists/i.test(error?.message || '') ? 'That email already has a login.' : 'Could not create the login.')
  const { error: e2 } = await admin.from('staff').insert({ user_id: data.user.id, role, name, email })
  if (e2) { await admin.auth.admin.deleteUser(data.user.id); return fail('Could not save the staff member.', 500) }
  return NextResponse.json({ ok: true })
}
export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return fail('Not allowed.', 403)
  if (!(await ownerOnly())) return fail('Only the owner can reset passwords.', 403)
  const b = (await readJson(req)) ?? {}, id = String(b.user_id || ''), password = String(b.password || '')
  const { data: row } = await supaAdmin().from('staff').select('role,email').eq('user_id', id).maybeSingle()
  if (!row || row.role === 'owner') return fail('That account cannot be changed here.', 403)
  const weak = passwordProblem(password, row.email ?? undefined); if (weak) return fail(weak)
  const { error } = await supaAdmin().auth.admin.updateUserById(id, { password, app_metadata: { must_change_password: true } })   // a reset is temporary too: they choose their own at next sign-in
  return error ? fail('Could not change the password.', 500) : NextResponse.json({ ok: true })
}
// Delete a person: they can never sign in again, but every record they made keeps their name.
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return fail('Not allowed.', 403)
  if (!(await ownerOnly())) return fail('Only the owner can delete staff.', 403)
  const b = (await readJson(req)) ?? {}, id = String(b.user_id || '')
  const admin = supaAdmin(), { data: row } = await admin.from('staff').select('role').eq('user_id', id).maybeSingle()
  if (!row || row.role === 'owner') return fail('That account cannot be deleted.', 403)
  const { error } = await admin.from('staff').update({ active: false, deleted_at: new Date().toISOString() }).eq('user_id', id)   // the row stays so history still shows the name
  if (error) return fail('Could not delete the person.', 500)
  // Lock the login itself: scramble the password, ban it, and free the email address for someone else.
  const junk = crypto.randomUUID() + crypto.randomUUID()
  const r = await admin.auth.admin.updateUserById(id, { password: junk, ban_duration: '876000h' })
  if (r.error) return fail('The person was removed from the site, but the login lock could not be finished. Their access is already off.', 500)
  await admin.auth.admin.updateUserById(id, { email: `deleted-${id}@example.com`, email_confirm: true })           // best effort
  return NextResponse.json({ ok: true })
}
