import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { supaServer } from '@/lib/supabase/server'
import { mustChangePassword } from '@/lib/passwordGate'
import ChangePassword from '@/components/ChangePassword'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Choose your password', robots: { index: false, follow: false } }

export default async function PasswordPage() {
  const { data: { user } } = await (await supaServer()).auth.getUser()
  if (!user) redirect('/login')
  return <ChangePassword forced={mustChangePassword(user)} email={user.email ?? ''} />
}
