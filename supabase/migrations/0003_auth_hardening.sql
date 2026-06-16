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
-- Replace the open "anyone with the anon key" policy with one that requires
-- a signed-in user whose firm_id (in their JWT user_metadata) matches the row.
drop policy if exists "cases_anon_all" on public.cases;

create policy "cases_same_firm_authenticated"
  on public.cases for all
  to authenticated
  using (firm_id = (auth.jwt() -> 'user_metadata' ->> 'firm_id'))
  with check (firm_id = (auth.jwt() -> 'user_metadata' ->> 'firm_id'));

-- ── intake_cases ─────────────────────────────────────────────────────────
-- Prospects must still be able to submit an intake anonymously (that's the
-- whole point of the public intake link) — leave INSERT open. Reading and
-- updating prospect data (names, contact info, case summaries) must require
-- a signed-in attorney.
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
