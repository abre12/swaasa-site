-- Run once in Supabase > SQL Editor. Lets the booking page tell "inside the cleaning gap" apart from "already booked".
drop function if exists dress_busy(uuid);
create function dress_busy(p_dress uuid) returns table(start_date date, hold_end date, end_date date)
language sql security definer stable set search_path=public as $$
  select start_date, (upper(hold)-1), end_date from bookings where dress_id=p_dress and status<>'cancelled' and upper(hold)>=current_date
  union all select start_date, end_date, end_date from blocks where dress_id=p_dress and end_date>=current_date $$;
revoke execute on function dress_busy(uuid) from public;
grant execute on function dress_busy(uuid) to anon, authenticated;
