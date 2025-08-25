# Security & RLS (Quick Reference)

## Core Principle
Users can only see and modify their own rows. All tables storing user data must enforce this with RLS.

## Example Policies

### user_baselines
```sql
alter table public.user_baselines enable row level security;

create policy "baseline_select_own" on public.user_baselines
for select using (auth.uid() = user_id);

create policy "baseline_insert_own" on public.user_baselines
for insert with check (auth.uid() = user_id);

create policy "baseline_update_own" on public.user_baselines
for update using (auth.uid() = user_id);
```

### workouts
```sql
alter table public.workouts enable row level security;

create policy "workouts_select_own" on public.workouts
for select using (auth.uid() = user_id);

create policy "workouts_insert_own" on public.workouts
for insert with check (auth.uid() = user_id);

create policy "workouts_update_own" on public.workouts
for update using (auth.uid() = user_id);
```

### planned_workouts
```sql
alter table public.planned_workouts enable row level security;

create policy "planned_select_own" on public.planned_workouts
for select using (auth.uid() = user_id);
```

## Notes
- Webhooks (Strava/Garmin) run with service role and bypass RLS by design.
- Prefer `maybeSingle()` on optional selects to avoid 406 errors.
- Add selective indexes for large tables (e.g., `workouts(user_id, date desc)`).
