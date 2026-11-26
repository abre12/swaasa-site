// The five scheduled reminders and when each is due (India time). Keep these in step with the cron lines in .github/workflows/reminders.yml.
export const REMINDER_SLOTS = ['morning', 'dminus1', 'noon', 'afternoon', 'evening'] as const
export type ReminderSlot = typeof REMINDER_SLOTS[number]

export const SLOT_DUE_MINUTES: Record<ReminderSlot, number> = { morning: 8 * 60 + 5, dminus1: 10 * 60 + 5, noon: 12 * 60 + 5, afternoon: 16 * 60 + 5, evening: 17 * 60 + 5 }
export const SLOT_LABEL: Record<ReminderSlot, string> = { morning: 'Morning briefing (8:05 AM)', dminus1: 'Tomorrow check (10:05 AM)', noon: 'Midday check (12:05 PM)', afternoon: '4 PM check (4:05 PM)', evening: 'Evening summary (5:05 PM)' }

/** GitHub can start a run a few minutes late; a reminder is only called missing after this long past its time. */
export const GRACE_MINUTES = 90

/** Reminders whose time plus the grace period has passed with no successful run today. ("Nothing to report" counts as a success.) */
export function missedSlots(runs: { slot: string; outcome: string }[], nowMinutesIST: number): ReminderSlot[] {
  const done = new Set(runs.filter(r => r.outcome === 'sent' || r.outcome === 'nothing').map(r => r.slot))
  return REMINDER_SLOTS.filter(s => nowMinutesIST >= SLOT_DUE_MINUTES[s] + GRACE_MINUTES && !done.has(s))
}
