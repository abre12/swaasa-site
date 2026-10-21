import { supaServer } from '@/lib/supabase/server'
import AdminApp from '@/components/AdminApp'
export const dynamic = 'force-dynamic'
export default async function Admin() {
  const sb = supaServer(); const { data: { user } } = await sb.auth.getUser()
  const { data: st } = await sb.from('staff').select('role,name').eq('user_id', user!.id).single()
  return <AdminApp role={st!.role} name={st!.name || user!.email!} />
}
