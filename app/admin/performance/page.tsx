import { redirect } from 'next/navigation'
import { supaServer } from '@/lib/supabase/server'
import AdminApp from '@/components/AdminApp'

export const dynamic = 'force-dynamic'

export default async function DressPerformancePage() {
  const sb = supaServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')
  const { data: staff } = await sb.from('staff').select('role,name,active').eq('user_id', user.id).single()
  if (!staff?.active || staff.role !== 'owner') redirect('/admin')
  return <AdminApp role="owner" name={staff.name || user.email || 'Owner'} initialTab="performance" />
}
