-- Swaasa migration 8: say what a deposit was applied to (damage, late fee, unpaid rent...). Run ONCE in Supabase > SQL Editor, AFTER migration-v7.sql. Safe to run again.
-- ADDITIVE: one optional text column. No existing booking, payment, refund or expense is changed.
alter table payments add column if not exists remarks text;
-- Old "Deposit applied to dues" rows have no detail; they simply show without one.
