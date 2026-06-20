-- Tightens RLS now that real attorney accounts exist (Supabase Auth).
-- Run this once in the Supabase SQL editor, or via `supabase db push`.
--
-- Before this migration, both `cases` and `intake_cases` were readable and
-- writable by anyone holding the public anon key (by design, that key ships
-- in the client bundle) — there was no login, so RLS couldn't require one.
-- Now that attorneys sign in, we require an authenticated session for
-- anything sensitive, and for `cases` we additionally bind rows to the
-- signed-in user's firm_id JWT claim so one firm can never see another's.

-- ── cases ────────────────────────────────────────────────────────────────
drop policy if exists "cases_anon_all" on public.cases;

create policy "cases_same_firm_authenticated"
  on public.cases for all
  to authenticated
  using (firm_id = (auth.jwt() -> 'user_metadata' ->> 'firm_id'))
  with check (firm_id = (auth.jwt() -> 'user_metadata' ->> 'firm_id'));

-- ── intake_cases ─────────────────────────────────────────────────────────
drop policy if exists "read intakes" on public.intake_cases;
create policy "read intakes"
  on public.intake_cases for select
  to authenticated
  using (true);

drop policy if exists "update intake status" on public.intake_cases;
create policy "update intake status"
  on public.intake_cases for update
  to authenticated
  using (true)
  with check (true);

-- Note: the original "anon can submit intake" INSERT policy on intake_cases
-- is deliberately left untouched/open so the public intake link continues
-- to work for anonymous prospects.
