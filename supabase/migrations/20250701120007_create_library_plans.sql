-- Create library_plans for published templates shown in catalog
create table if not exists public.library_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  discipline text not null check (discipline in ('run','ride','swim','strength','hybrid')),
  duration_weeks integer not null check (duration_weeks > 0),
  tags text[] default array[]::text[],
  status text not null default 'published' check (status in ('published','draft')),
  template jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.library_plans enable row level security;

-- For development: allow authenticated users to read/create; tighten later
create policy "Library plans are readable by all authenticated"
on public.library_plans for select
to authenticated
using (true);

create policy "Library plans can be created by authenticated"
on public.library_plans for insert
to authenticated
with check (true);

create index if not exists idx_library_plans_status on public.library_plans(status);
create index if not exists idx_library_plans_discipline on public.library_plans(discipline);
create index if not exists idx_library_plans_created_at on public.library_plans(created_at);


