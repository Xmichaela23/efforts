-- Weather cache table for edge function get-weather
create table if not exists public.weather_cache (
  key text primary key,
  lat double precision not null,
  lng double precision not null,
  day date not null,
  weather jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Update trigger for updated_at
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_weather_cache_updated_at on public.weather_cache;
create trigger trg_weather_cache_updated_at
before update on public.weather_cache
for each row execute function public.update_updated_at_column();

-- Indexes to speed up lookups
create index if not exists idx_weather_cache_expires on public.weather_cache(expires_at);
create index if not exists idx_weather_cache_day on public.weather_cache(day);

-- RLS: enable and allow reads to authenticated users (optional), writes via service role
alter table public.weather_cache enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'weather_cache' and policyname = 'Allow read to authenticated'
  ) then
    create policy "Allow read to authenticated" on public.weather_cache for select to authenticated using (true);
  end if;
end $$;

-- No insert/update/delete policies; edge functions use service role to upsert

