# Zero Complexity Elegant Solution (Fixed)

## Critical Fixes Identified

### 1. Planned-Attach Ordering (CRITICAL)

**Problem:** `analyze-running-workout` depends on `planned_id` (line 594 checks `if (workout.planned_id)`). If `auto-attach-planned` is fire-and-forget, analysis runs before linkage and never re-runs.

**Solution:** Make attach happen **deterministically before analysis**.

**Option A (Cleanest):** Inline attach logic in `ingest-activity`
**Option B (Still Fine):** Await `auto-attach-planned` in `ingest-activity` before triggering analysis

**Chosen:** Option B (await) - minimal code change, preserves separation of concerns

### 2. Advisory Lock Implementation (CRITICAL)

**Problem:** Can't call `pg_try_advisory_xact_lock` directly via RPC - need wrapper function.

**Solution:** Create tiny DB helper function:

```sql
CREATE OR REPLACE FUNCTION public.try_advisory_lock(lock_key text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT pg_try_advisory_xact_lock(hashtext(lock_key));
$$;
```

Then in edge functions:
```typescript
const { data: gotLock } = await supabase.rpc('try_advisory_lock', {
  lock_key: `compute-summary:${workout_id}`
});
if (!gotLock) return; // Already running
```

### 3. Row-Level Locking in `merge_computed` (CRITICAL)

**Problem:** `merge_computed` does read-modify-write (reads into variable, then updates). Need `FOR UPDATE` to prevent lost updates.

**Current code:**
```sql
SELECT computed INTO v_existing_computed
FROM workouts
WHERE id = p_workout_id;
```

**Fixed:**
```sql
SELECT computed INTO v_existing_computed
FROM workouts
WHERE id = p_workout_id
FOR UPDATE;  -- Lock row until transaction commits
```

## Complete Solution

### A. Background Processing ✅

**YES** - Webhook returns immediately, processing happens async:

```
Webhook → ingest-activity → Returns 200 OK immediately
                          → Functions run in background
                          → Status columns update
                          → Frontend polls/reads status
```

### B. Single Source of Truth ✅

**YES** - `ingest-activity` is the ONLY orchestrator:

- `ingest-activity` awaits `auto-attach-planned` (deterministic ordering)
- `ingest-activity` triggers all processing functions
- `auto-attach-planned` ONLY links workouts (no function triggers)
- No duplicate orchestration

### C. Dumb Client, Smart Server ✅

**YES** - Client just reads status:

- Client checks: `computed.overall`, `computed.analysis.series`, `analysis_status`
- Server does all computation
- Client displays what server provides

### E. New Components/Edge Functions/Columns?

**MINIMAL CHANGES:**

#### New Database Functions (1):
1. `try_advisory_lock(lock_key text) returns boolean`

#### New Status Columns (3 + timestamps):
1. `summary_status` TEXT (pending, processing, complete, failed)
2. `metrics_status` TEXT (pending, processing, complete, failed)
3. `summary_error`, `metrics_error` TEXT (optional, for debugging)
4. `summary_updated_at`, `metrics_updated_at`, `analysis_updated_at` TIMESTAMPTZ (debugging)

#### Code Changes (No New Edge Functions):
- `ingest-activity`: Await `auto-attach-planned`, set status, trigger functions
- `auto-attach-planned`: Remove ALL function triggers, only link
- `compute-workout-summary`: Add advisory lock, update `summary_status`
- `compute-workout-analysis`: Add advisory lock (already has `analysis_status`)
- `calculate-workout-metrics`: Add advisory lock, update `metrics_status`
- `merge_computed`: Add `FOR UPDATE` lock

## Implementation Details

### 1. Migration: Add Status Columns + Helper Function

```sql
-- Add status columns
ALTER TABLE workouts
ADD COLUMN IF NOT EXISTS summary_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS metrics_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS summary_error TEXT,
ADD COLUMN IF NOT EXISTS metrics_error TEXT,
ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMPTZ;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_workouts_summary_status ON workouts(summary_status);
CREATE INDEX IF NOT EXISTS idx_workouts_metrics_status ON workouts(metrics_status);

-- Advisory lock helper function
CREATE OR REPLACE FUNCTION public.try_advisory_lock(lock_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_try_advisory_xact_lock(hashtext(lock_key));
$$;

COMMENT ON FUNCTION public.try_advisory_lock IS 'Acquires transaction-level advisory lock. Returns true if lock acquired, false if already locked.';
```

### 2. Update `merge_computed` with Row Locking

```sql
CREATE OR REPLACE FUNCTION merge_computed(
  p_workout_id uuid,
  p_partial_computed jsonb,
  p_computed_version_int integer DEFAULT NULL,
  p_computed_at timestamp with time zone DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_rows_affected integer;
  v_existing_computed jsonb;
  v_normalized_partial jsonb;
BEGIN
  -- FIX: Lock row before reading to prevent lost updates
  SELECT computed INTO v_existing_computed
  FROM workouts
  WHERE id = p_workout_id
  FOR UPDATE;  -- Lock row until transaction commits
  
  -- ... (existing normalization logic for corrupted data) ...
  
  -- Perform the merge
  UPDATE workouts
  SET 
    computed = COALESCE(v_existing_computed, '{}'::jsonb) || v_normalized_partial,
    computed_version = COALESCE(p_computed_version_int, workouts.computed_version),
    computed_at = COALESCE(p_computed_at, workouts.computed_at, NOW())
  WHERE workouts.id = p_workout_id;
  
  -- ... (existing error handling) ...
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3. Update `ingest-activity`: Deterministic Ordering

```typescript
// After upsert workout
const { data: workout } = await supabase.from('workouts')
  .select('id')
  .eq('id', workout_id)
  .single();

// Set initial status
await supabase.from('workouts').update({
  summary_status: 'pending',
  analysis_status: 'pending',
  metrics_status: 'pending'
}).eq('id', workout_id);

// FIX: Await auto-attach-planned BEFORE triggering analysis
// This ensures planned_id exists before analyze-running-workout runs
const attachUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/auto-attach-planned`;
const attachResponse = await fetch(attachUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`,
    'apikey': key
  },
  body: JSON.stringify({ workout_id: workout.id })
});

// Now trigger processing functions (planned_id is set if match found)
// All fire-and-forget (background processing)
fetch(compute-workout-summary).catch(...);
fetch(compute-workout-analysis).catch(...);
fetch(calculate-workout-metrics).catch(...);
fetch(analyze-running-workout).catch(...);

// Return immediately
return new Response('OK', { status: 200 });
```

### 4. Update `auto-attach-planned`: Remove Function Triggers

```typescript
// Only link the workout
await supabase.from('planned_workouts').update({
  completed_workout_id: workout_id,
  workout_status: 'completed'
}).eq('id', planned_id);

await supabase.from('workouts').update({
  planned_id: planned_id
}).eq('id', workout_id);

// NO function triggers - ingest-activity handles orchestration
return new Response(JSON.stringify({ success: true, attached: true }), {
  headers: { ...cors, 'Content-Type': 'application/json' }
});
```

### 5. Add Advisory Locks to Processing Functions

**Example: `compute-workout-summary`**

```typescript
// Check advisory lock
const { data: gotLock } = await supabase.rpc('try_advisory_lock', {
  lock_key: `compute-summary:${workout_id}`
});

if (!gotLock) {
  console.log(`[compute-workout-summary] Already running for ${workout_id}, skipping`);
  return new Response(JSON.stringify({ skipped: true }), { status: 200 });
}

try {
  // Update status
  await supabase.from('workouts').update({
    summary_status: 'processing',
    summary_updated_at: new Date().toISOString()
  }).eq('id', workout_id);

  // Do work...
  await supabase.rpc('merge_computed', {
    p_workout_id: workout_id,
    p_partial_computed: { intervals, overall }
  });

  // Update status on success
  await supabase.from('workouts').update({
    summary_status: 'complete',
    summary_updated_at: new Date().toISOString()
  }).eq('id', workout_id);
} catch (error) {
  // Update status on failure
  await supabase.from('workouts').update({
    summary_status: 'failed',
    summary_error: error.message,
    summary_updated_at: new Date().toISOString()
  }).eq('id', workout_id);
  throw error;
}
```

## Why This is Zero Complexity

1. **Single orchestrator** - `ingest-activity` owns everything
2. **Deterministic ordering** - attach happens before analysis
3. **Explicit status** - no heuristics, just read columns
4. **Simple locks** - advisory locks prevent duplicates, row locks prevent lost updates
5. **No new infrastructure** - uses existing columns, functions, patterns
6. **Easy to debug** - status columns + timestamps show exactly what's happening

## Why This is Elegant

1. **Clear ownership** - each function owns its status
2. **Idempotent** - functions can run multiple times safely
3. **Explicit state** - no hidden state, no sleeps, no heuristics
4. **Deterministic** - planned_id exists before analysis runs
5. **Scalable** - locks serialize contention
6. **Fixable** - clear execution path, easy to trace

## Why This is Scalable

1. **Locks prevent contention** - advisory locks serialize duplicate calls
2. **Row locks serialize writes** - no lost updates
3. **Status columns enable retries** - can retry failed stages
4. **Idempotent functions** - safe to retry

## Why This is Fixable

1. **Single execution path** - `ingest-activity` → await attach → functions
2. **Explicit status** - can see exactly what's stuck
3. **Timestamps** - can see when things last updated
4. **No hidden state** - everything in database columns
5. **Easy to trace** - logs show status transitions
6. **Easy to retry** - just call function again (idempotent)

## Summary of Changes

### Database (1 migration):
- Add status columns + timestamps
- Add `try_advisory_lock` helper function
- Update `merge_computed` with `FOR UPDATE`

### Edge Functions (5 files):
- `ingest-activity`: Await `auto-attach-planned`, set status, trigger functions
- `auto-attach-planned`: Remove ALL function triggers
- `compute-workout-summary`: Add advisory lock, update `summary_status`
- `compute-workout-analysis`: Add advisory lock (already has `analysis_status`)
- `calculate-workout-metrics`: Add advisory lock, update `metrics_status`

### No New:
- ❌ No new edge functions
- ❌ No new frontend components
- ❌ No new database tables
- ❌ No queues/job systems
- ❌ No state machines
