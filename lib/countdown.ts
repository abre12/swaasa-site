import { activeCleaning } from './bookingAction'

// SU-1: the home screen as a countdown. Every delivery in the next few days, labelled D-0 / D-1 / D-2 / D-3, with how far its preparation has got.
export type StepState = 'done' | 'doing' | 'todo' | 'na'
export const STEP_COL: Record<StepState, string> = { done: '#2f7d4f', doing: '#c58a2b', todo: '#c9bfc2', na: '#e6dfe1' }

/** Four steps: measured, at the tailor, back and checked, cleaned. A step that does not apply to this dress shows as "not needed". */
export function prepSteps(ctx: any, b: any): { label: string; state: StepState }[] {
  const job = (ctx.AJ || []).filter((j: any) => j.booking_id === b.id && j.source !== 'damage' && j.status !== 'cancelled').sort((x: any, y: any) => String(y.created_at).localeCompare(String(x.created_at)))[0]
  const cr = activeCleaning(ctx, b)
  const none = !job
  const st = job?.status
  return [
    { label: 'Measured', state: none ? 'na' : job.measurements_pending ? 'todo' : 'done' },
    { label: 'At tailor', state: none ? 'na' : st === 'pending_dispatch' ? 'todo' : st === 'at_unit' ? 'doing' : 'done' },
    { label: 'Back & checked', state: none ? 'na' : st === 'ready' ? 'done' : st === 'quality_check' ? 'doing' : 'todo' },
    { label: 'Cleaned', state: cr ? (cr.status === 'sent' ? 'doing' : 'todo') : 'done' },
  ]
}

