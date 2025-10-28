# Database "Unhealthy" Investigation Summary

**Date:** October 10, 2025  
**Issue:** Intermittent "Database Unhealthy" status and app loading failures over past 24 hours

## What We Know

### ✅ Confirmed Facts
1. **Database is responding** - PostgREST API returns 401 (correct for unauthenticated requests)
2. **RLS is properly configured** - All tables have row-level security enabled
3. **Recent changes** - Moved computations to server-side over past 24 hours
4. **30 Edge Functions deployed** - Large serverless footprint
5. **Hourly cron job** - `backfill-week-summaries` runs every hour
6. **Recent migration** - `20251001_sticky_attach_triggers.sql` (9 days ago)

### 🔍 Need to Investigate

#### 1. **Most Recent Migration Triggers**
The `20251001_sticky_attach_triggers.sql` migration adds database triggers that:
- Fire on every UPDATE to `workouts` table
- Fire on every UPDATE to `planned_workouts` table
- Perform additional UPDATE queries within the trigger

**Potential Issues:**
- Trigger loops (trigger fires → UPDATE → trigger fires again)
- Deadlocks if multiple workouts update simultaneously
- Connection pool exhaustion from nested queries

#### 2. **Computation Cascade**
Multiple code paths trigger expensive computations:

**Webhook Path (Garmin/Strava sync):**
```
New activity → ingest-activity → auto-attach-planned → compute-workout-summary → compute-workout-analysis
```

**Frontend Path (User opens workout):**
```
Open workout → useWorkoutDetail → compute-workout-analysis (polls 6 times)
Open Summary tab → compute-workout-summary
Race condition check → compute-workout-summary (again)
```

**Cron Path:**
```
Every hour → backfill-week-summaries → processes ALL workouts from current week
```

#### 3. **Edge Function Resource Limits**
Each compute function:
- `compute-workout-analysis`: 714 lines, GPS processing, power calculations
- `compute-workout-summary`: 1,656 lines, interval mapping, GAP calculations
- No visible rate limiting or queue system
- No timeout handling beyond Supabase defaults

#### 4. **Database Connection Pool**
- Multiple concurrent edge functions
- Each creates its own Supabase client
- Nested queries (workout → garmin_activities → user_baselines)
- JSONB operations on `computed` column (can be slow)

## Recommended Next Steps

### Immediate (Investigation)
1. **Check Supabase Dashboard Logs**
   - Navigate to: https://supabase.com/dashboard/project/yyriamwvtvzlkumqrvpm
   - View: Logs → Edge Functions
   - Look for: timeouts, errors, patterns around hour marks

2. **Check Database Metrics**
   - Navigate to: Database → Reports
   - Look for: connection spikes, slow queries, locks

3. **Review Recent Trigger Activity**
   - Check if triggers are causing loops or deadlocks
   - Verify trigger exception handling is working

### Short-term Fixes (If Investigation Confirms)

**If Cron Job is the Issue:**
- Change cron frequency from hourly to daily
- Or disable temporarily to test

**If Triggers are the Issue:**
- Add more defensive checks in trigger logic
- Consider removing triggers temporarily
- Add logging to understand trigger behavior

**If Computation Load is the Issue:**
- Add idempotency checks (don't recompute if already done)
- Implement debouncing on frontend calls
- Add queue system for batch operations

### Long-term Solutions
1. Implement job queue system (e.g., pg_cron or external queue)
2. Add computation result caching
3. Batch database operations
4. Add explicit timeout and retry logic
5. Monitor edge function execution times
6. Add database indices on frequently queried columns

## Questions for User

1. Are you on Supabase Free Tier or paid plan?
2. Approximately how many workouts do you have in your database?
3. How many users are actively using the app?
4. Did the issues start around October 1st (when the trigger migration was added)?
5. Can you access Supabase dashboard logs to check for errors?

