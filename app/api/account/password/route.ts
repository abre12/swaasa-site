import { NextResponse } from 'next/server'
import { supaAdmin, supaServer } from '@/lib/supabase/server'
import { failWith as fail, readJson, sameOrigin } from '@/lib/apiGuard'
import { passwordProblem } from '@/lib/password'
export const dynamic = 'force-dynamic'

// A signed-in staff member chooses their own password. This is what clears "must change password" (set when the owner creates a login or resets
// a password). It uses the server key because that flag lives in app_metadata, which the person cannot edit from the browser.
// The middleware has already checked the person is signed in, active staff, and through two-step login; this checks the session again.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail('Not allowed.', 403)
  const { data: { user } } = await (await supaServer()).auth.getUser()
  if (!user) return fail('Please sign in.', 401)
  const b = await readJson(req)
  const password = typeof b?.password === 'string' ? b.password : ''
  const problem = passwordProblem(password, user.email ?? undefined)
  if (problem) return fail(problem)
  const { error } = await supaAdmin().auth.admin.updateUserById(user.id, { password, app_metadata: { must_change_password: false } })
  if (error) return fail('Could not change the password. Please try again.', 500)
  return NextResponse.json({ ok: true })
}
