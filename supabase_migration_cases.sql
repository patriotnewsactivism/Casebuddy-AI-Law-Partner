-- CaseBuddy — create the `cases` table if it doesn't exist.
-- Run this in Supabase SQL Editor.

create table if not exists public.cases (
  id text primary key,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  firm_id text not null default 'default',
  data jsonb not null
);

-- Function to handle updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for cases
drop trigger if exists set_updated_at on public.cases;
create trigger set_updated_at
before update on public.cases
for each row
execute function public.handle_updated_at();

create index if not exists cases_firm_id_idx on public.cases (firm_id);
create index if not exists cases_updated_at_idx on public.cases (updated_at desc);

alter table public.cases enable row level security;

-- Allow authenticated users to manage their firm's cases
create policy if not exists "cases_same_firm_authenticated"
  on public.cases for all
  to authenticated
  using (firm_id = (auth.jwt() -> 'user_metadata' ->> 'firm_id'))
  with check (firm_id = (auth.jwt() -> 'user_metadata' ->> 'firm_id'));

-- Realtime
alter publication supabase_realtime add table public.cases;

-- Tighten intake_cases policies for authenticated users (idempotent)
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
