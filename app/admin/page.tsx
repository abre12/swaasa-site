import { redirect } from 'next/navigation'
import { supaServer } from '@/lib/supabase/server'
import AdminApp from '@/components/AdminApp'
export const dynamic = 'force-dynamic'
export default async function Admin() {
  const sb = supaServer(); const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')
  // N-4: a login with no staff row (or a deactivated one) gets a clear message instead of a crash.
  const { data: st, error } = await sb.from('staff').select('role,name,active').eq('user_id', user.id).maybeSingle()
  if (error) throw new Error('Could not read your staff record. Please try again.')
  if (!st || st.active === false) return <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
    <div style={{ maxWidth: 420 }}><h1 style={{ margin: '0 0 8px', fontSize: 22 }}>This login does not have access</h1>
      <p style={{ margin: '0 0 16px', color: 'var(--mut, #6b6169)' }}>{user.email} is signed in but is not an active member of the staff. Ask the owner to add or re-activate you.</p>
      <a className="btn alt" href="/login" style={{ display: 'inline-block' }}>Sign in with a different login</a></div></main>
  return <AdminApp role={st.role} name={st.name || user.email!} />
}
