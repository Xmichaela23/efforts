# How to Recalculate Workload for Jan 12-13 Workouts

## Option 1: Supabase Dashboard (Easiest)

1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions** → **calculate-workload**
3. Click **Invoke**
4. For **Workout 1 (Jan 12)**:
   ```json
   {
     "workout_id": "27924333-da3f-4c43-885c-bcfc8673fa53"
   }
   ```
5. Click **Invoke Function**
6. For **Workout 2 (Jan 13)**:
   ```json
   {
     "workout_id": "0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5"
   }
   ```
7. Click **Invoke Function** again

## Option 2: Using curl (Terminal)

```bash
# Set your environment variables first
export SUPABASE_URL="your_supabase_url"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"

# Workout 1 (Jan 12)
curl -X POST "${SUPABASE_URL}/functions/v1/calculate-workload" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -d '{"workout_id": "27924333-da3f-4c43-885c-bcfc8673fa53"}'

# Workout 2 (Jan 13)
curl -X POST "${SUPABASE_URL}/functions/v1/calculate-workload" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -d '{"workout_id": "0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5"}'
```

## Option 3: Using Deno Script

```bash
deno run --allow-net --allow-env recalculate_jan_12_13.ts
```

(Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables)

## After Recalculation

1. Refresh your context screen
2. The workouts should now appear in the 7-day training load graph
3. Verify with:
   ```sql
   SELECT id, name, date, workload_actual 
   FROM workouts 
   WHERE id IN ('0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5', '27924333-da3f-4c43-885c-bcfc8673fa53');
   ```
