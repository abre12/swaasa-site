// The staff app's menu and the colours of a booking's state. Kept out of AdminApp.tsx so the main file is only the app itself.
import { todayIST } from '@/lib/util'

export const today = todayIST
export const ALL_TIME = '0000-01-01' // ensureFrom(ALL_TIME) = load every booking ever
/** A booking that is out and past its end date counts as overdue. */
export const state = (b: any) => (b.status === 'out' && b.end_date < today() ? 'overdue' : b.status)
export const COL: any = {
  pending: '#c58a2b',
  confirmed: '#4d6d9a',
  out: '#7a5aa6',
  returned: '#4f8a5b',
  overdue: '#b4493f',
  block: '#8c8c8c',
  dc: '#4a8a9c',
}
/** [key, label, icon, roles that see it] */
export const NAV: [string, string, string, string[]][] = [
  ['dashboard', 'Dashboard', 'home', ['owner', 'manager']],
  ['bookings', 'Bookings', 'calcheck', ['owner', 'manager']],
  ['calendar', 'Calendar', 'calendar', ['owner', 'manager']],
  ['dresses', 'Inventory', 'dress', ['owner', 'manager']],
  ['alterations', 'Alterations', 'scissors', ['owner', 'manager']],
  ['drycleaning', 'Dry Cleaning', 'sparkle', ['owner', 'manager']],
  ['cash', 'Cash & Transactions', 'wallet', ['owner', 'manager']],
  ['confidence', 'Delivery Confidence', 'truck', ['owner']],
  ['insights', 'Insights', 'chart', ['owner']],
  ['customers', 'Customers', 'user', ['owner']],
  ['approvals', 'Approvals', 'bell', ['owner']],
  ['reports', 'Reports & Analytics', 'chart', ['owner']],
  ['settings', 'Settings', 'gear', ['owner']],
  ['prep', 'Alterations to Complete', 'scissors', ['preparation']],
]
