# Complete Workout Import Flow & Race Conditions Analysis

## Complete Flow: Endurance Workout from Hook

### Visual Timeline

```
T0: Webhook → ingest-activity
    ├─ Upsert workout (computed: object or null)
    ├─ [FIRE-AND-FORGET] auto-attach-planned ──┐
    ├─ [AWAITED] compute-workout-summary ──────┤
    ├─ [AWAITED] compute-workout-analysis ─────┤  Race conditions here!
    ├─ [AWAITED] calculate-workout-metrics ────┤
    └─ [FIRE-AND-FORGET] analyze-running-workout┘

T0+100ms: auto-attach-planned (if linked)
    ├─ Wait 1s
    ├─ [AWAITED] compute-workout-summary ──────┐
    ├─ Wait 1s                                  │  Duplicate calls!
    ├─ [AWAITED] compute-workout-analysis ────┤
    └─ [FIRE-AND-FORGET] analyze-running-workout┘

Potential Conflicts:
- compute-workout-summary called TWICE (from ingest + auto-attach)
- analyze-running-workout called TWICE (from ingest + auto-attach)
- Functions might read/write computed simultaneously
```

### 1. Webhook Receives Activity
**Function:** `strava-webhook` or `garmin-webhook-activities`
- Receives webhook event
- Fetches detailed activity data from provider
- Calls `ingest-activity` with enriched data

### 2. Ingest Activity (`ingest-activity`)
**Timeline:** T0

**Step 2a: Build Workout Row**
- Maps provider data to workout structure
- Calls `computeComputedFromActivity()` if sensor data exists (≥2 samples)
- **WRITES:** `computed: computedJsonObj || null` (✅ FIXED - no stringify, stores as JSONB object)
- **WRITES:** `sensor_data`, `gps_track`, raw metrics

**Step 2b: Upsert to Database** (Line 1217)
```typescript
await supabase.from('workouts').upsert(row, { onConflict })
```
- **WRITES:** Initial workout row with `computed` (if `computeComputedFromActivity` returned data)

**Step 2c: Trigger Processing Functions** (Lines 1322-1400)
Functions are called in this order:

1. **`auto-attach-planned`** (Line 1324) - **FIRE-AND-FORGET** (not awaited) ⚠️
2. **`compute-workout-summary`** (Line 1338) - **AWAITED** ✅
3. **`compute-workout-analysis`** (Line 1354) - **AWAITED** ✅
4. **`calculate-workout-metrics`** (Line 1377) - **AWAITED** ✅
5. **`analyze-running-workout`** (Line 1396) - **FIRE-AND-FORGET** (not awaited) ⚠️

### 3. Auto-Attach Planned (`auto-attach-planned`)
**Timeline:** T0 + ~100ms (runs concurrently)

**Step 3a: Find Matching Planned Workout**
- Queries `planned_workouts` by date, type, duration
- Links workout if match found

**Step 3b: If Linked, Trigger Functions** (Lines 227-250)
- **AWAITS:** `compute-workout-summary` (with 1s delay)
- **AWAITS:** `compute-workout-analysis` (with 1s delay)
- **TRIGGERS:** `analyze-running-workout` (fire-and-forget)

### 4. Compute Workout Summary (`compute-workout-summary`)
**Timeline:** T0 + ~200ms (from ingest-activity) OR T0 + ~1100ms (from auto-attach)

**What it does:**
- Reads `sensor_data` from database
- Normalizes samples
- Creates `intervals` array
- Calculates `overall` metrics (distance_m, duration_s_moving, pace, etc.)
- **WRITES:** `merge_computed({ intervals, overall })`

**Race Condition #1:** 
- If `ingest-activity` wrote `computed` as object AND `compute-workout-summary` runs immediately, both might write simultaneously
- **Mitigation:** `merge_computed` RPC uses atomic JSONB merge (`||` operator)

### 5. Compute Workout Analysis (`compute-workout-analysis`)
**Timeline:** T0 + ~300ms (from ingest-activity) OR T0 + ~2100ms (from auto-attach)

**What it does:**
- Reads `sensor_data` and `computed.intervals`
- Generates time-series arrays for charts (`analysis.series`)
- **WRITES:** `merge_computed({ analysis: { series: [...] } })`

**Race Condition #2:**
- If `compute-workout-summary` hasn't finished writing `overall`, `compute-workout-analysis` might read incomplete data
- **Mitigation:** `compute-workout-analysis` preserves existing `overall` if present

**Race Condition #3:**
- If `compute-workout-summary` runs AFTER `compute-workout-analysis`, it might overwrite `analysis.series`
- **Mitigation:** `compute-workout-summary` now preserves existing `analysis` if present

### 6. Analyze Running Workout (`analyze-running-workout`)
**Timeline:** T0 + ~400ms (from ingest-activity) OR T0 + ~3100ms (from auto-attach)

**What it does:**
- Reads `computed.intervals` and `computed.overall`
- Calculates adherence, execution score, performance metrics
- **WRITES:** `merge_computed({ intervals: enhancedIntervals })` + `workout_analysis` column

**Race Condition #4:**
- If `compute-workout-analysis` hasn't finished writing `analysis.series`, `analyze-running-workout` might overwrite it
- **Mitigation:** `analyze-running-workout` now re-reads workout and preserves `computed.overall` and `computed.analysis`

## Remaining Race Conditions

### Race Condition #1: Duplicate Function Calls
**Problem:**
- `ingest-activity` calls `compute-workout-summary` immediately (line 1338)
- `auto-attach-planned` also calls `compute-workout-summary` after 1s delay (line 230)
- **Result:** `compute-workout-summary` runs TWICE for the same workout
- **Impact:** Wastes resources, but functions are idempotent so it's safe

**Fix:** Check if `computed.overall` exists before calling, or remove duplicate call

### Race Condition #2: Multiple `merge_computed` Calls Simultaneously
**Problem:** If multiple functions call `merge_computed` at the exact same time:
- Function A reads `computed = { overall: {...} }`
- Function B reads `computed = { overall: {...} }`
- Function A writes `computed = { overall: {...}, intervals: [...] }`
- Function B writes `computed = { overall: {...}, analysis: {...} }`
- **Result:** PostgreSQL's `||` operator merges correctly, BUT if both read the same state, last write wins for conflicting keys

**Current Mitigation:** 
- ✅ `merge_computed` uses atomic JSONB merge (`||` operator)
- ✅ Functions preserve existing data (e.g., `compute-workout-summary` preserves `analysis`)
- ⚠️ **Still vulnerable:** If two functions write to the same key simultaneously, last write wins

**Better Fix:** Add row-level locking:
```sql
SELECT computed INTO v_existing_computed
FROM workouts
WHERE id = p_workout_id
FOR UPDATE;  -- Lock the row
```

### Race Condition #3: `ingest-activity` Upsert vs `merge_computed`
**Problem:** 
- `ingest-activity` upserts with `computed: object` (now fixed)
- `compute-workout-summary` immediately calls `merge_computed`
- If upsert hasn't committed, `merge_computed` might read `computed = NULL`
- Then upsert commits with `computed = object`
- Then `merge_computed` writes, potentially overwriting

**Current Mitigation:** 
- ✅ `merge_computed` uses `COALESCE(workouts.computed, '{}'::jsonb)`, handles NULL gracefully
- ✅ `merge_computed` now auto-fixes corrupted data (array/string → object)

### Race Condition #4: Function Execution Order
**Problem:**
- `ingest-activity` calls functions in order: summary → analysis → analyze-running
- `auto-attach-planned` calls functions in order: summary → analysis → analyze-running (with delays)
- If both run, functions might execute in wrong order
- **Example:** `analyze-running-workout` might run before `compute-workout-analysis` finishes

**Current Mitigation:**
- ✅ `analyze-running-workout` re-reads workout before writing (preserves latest data)
- ✅ Functions preserve existing data they don't generate
- ⚠️ **Still vulnerable:** If `analyze-running-workout` runs before `compute-workout-analysis`, it won't have `analysis.series` yet

### Race Condition #5: Fire-and-Forget Functions
**Problem:**
- `auto-attach-planned` is fire-and-forget from `ingest-activity`
- `analyze-running-workout` is fire-and-forget from `ingest-activity`
- If these fail silently, no error is reported
- **Impact:** Workout might appear "stuck processing" if functions fail

**Current Mitigation:** Functions log errors, but `ingest-activity` doesn't wait for them

## Recommended Fixes (Priority Order)

### Priority 1: Remove Duplicate Function Calls
**Fix:** Make `auto-attach-planned` check if `computed.overall` exists before calling `compute-workout-summary`:
```typescript
// In auto-attach-planned, before calling compute-workout-summary:
const { data: check } = await supabase
  .from('workouts')
  .select('computed')
  .eq('id', w.id)
  .single();
  
if (check?.computed?.overall) {
  console.log('[auto-attach-planned] computed.overall already exists, skipping compute-workout-summary');
} else {
  // Call compute-workout-summary
}
```

### Priority 2: Add Row-Level Locking to `merge_computed`
**Fix:** Lock the row before reading to prevent lost updates:
```sql
SELECT computed INTO v_existing_computed
FROM workouts
WHERE id = p_workout_id
FOR UPDATE;  -- Lock the row until transaction commits
```

### Priority 3: Make Fire-and-Forget Functions Awaited (or at least log failures)
**Fix:** Either await them or add proper error handling/logging

### Priority 4: Add Function Execution Guards
**Fix:** Use database flags or advisory locks to prevent duplicate execution:
```sql
-- Before calling function, check if it's already running
SELECT pg_try_advisory_xact_lock(hashtext('compute-workout-summary-' || workout_id));
-- If lock acquired, proceed; if not, skip (another instance is running)
```
