create table if not exists user_locations (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  accuracy_m integer,
  source text check (source in ('browser','home','workout')) default 'browser',
  consent_version text,
  captured_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table user_locations enable row level security;

create policy user_locations_select on user_locations
  for select using (auth.uid() = user_id);

create policy user_locations_upsert on user_locations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Optional cleanup job can enforce retention; documented at app level

