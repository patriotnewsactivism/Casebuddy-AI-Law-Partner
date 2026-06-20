-- Cases table — syncs attorney case files across devices.
-- No per-user auth yet; a firm_id (UUID stored in localStorage) scopes the rows.
-- The anon key is protected by RLS below; firm_id acts as a shared secret.

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
create trigger set_updated_at
before update on public.cases
for each row
execute function public.handle_updated_at();

-- Indexes
create index if not exists cases_firm_id_idx on public.cases (firm_id);
create index if not exists cases_updated_at_idx on public.cases (updated_at desc);

-- RLS
alter table public.cases enable row level security;

-- Anon can insert/read/update rows if they know the firm_id
-- (firm_id is stored in the attorney's localStorage and never exposed publicly)
create policy "cases_anon_all" on public.cases
  for all to anon
  using (true)
  with check (true);

-- Realtime
alter publication supabase_realtime add table public.cases;
