# Root Cause Fix: Unified Interval Data Structure

## The Real Problem

**Summary and Context screens are fighting over the same data source** because:
1. The interval matching logic is complex and fragile
2. Multiple ways to identify intervals (by ID, by type, by count)
3. Data structure doesn't clearly map planned steps → executed intervals
4. When one screen breaks, we fix it and break the other

## The Solution: Fix the Data Structure First

Instead of refactoring the entire function, let's fix the **data contract** between backend and frontend.

### Current Problem Flow

```
Backend generates: interval_breakdown.intervals[]
  ↓
Frontend tries to match: step.id → interval.interval_id
Frontend tries to match: step.kind → interval.interval_type  
Frontend tries to match: count work steps → interval.interval_number
  ↓
❌ Matching fails → pace shows "—"
```

### Proposed Solution: Explicit Mapping

**Backend should generate intervals with clear, unambiguous identifiers:**

```typescript
interface IntervalData {
  // PRIMARY IDENTIFIER: Maps directly to planned step
  planned_step_id: string | null; // Direct link to planned_workouts.computed.steps[].id
  
  // SECONDARY IDENTIFIERS (for fallback matching)
  interval_type: 'warmup' | 'work' | 'recovery' | 'cooldown';
  interval_number?: number; // For work intervals (1-indexed)
  recovery_number?: number; // For recovery intervals (1-indexed)
  
  // DATA (single source of truth)
  actual_pace_min_per_mi: number; // Always populated from executed data
  actual_duration_s: number;
  // ... rest of fields
}
```

**Frontend matching becomes trivial:**

```typescript
// Match by planned_step_id first (most reliable)
const matchingInterval = intervals.find(iv => iv.planned_step_id === step.id);

// If no ID match, fall back to type + number
if (!matchingInterval && step.kind === 'work') {
  const workIndex = countWorkStepsBefore(step);
  matchingInterval = intervals.find(iv => 
    iv.interval_type === 'work' && iv.interval_number === workIndex + 1
  );
}
```

## Implementation Plan

### Step 1: Fix Backend to Always Include `planned_step_id`

**File**: `supabase/functions/analyze-running-workout/index.ts`

**Change**: Ensure every interval in `completeBreakdown` has `planned_step_id` populated from the planned step.

**Current code** (line ~3345):
```typescript
interval_id: interval.planned_step_id || null,
```

**Problem**: `interval.planned_step_id` might not exist if interval matching failed.

**Fix**: Look up planned step explicitly:
```typescript
// For work intervals
const plannedStep = plannedWorkout?.computed?.steps?.find(
  (s: any) => s.kind === 'work' && /* match by order or other criteria */
);
interval_id: plannedStep?.id || null,
```

### Step 2: Simplify Frontend Matching

**File**: `src/components/MobileSummary.tsx`

**Change**: Simplify `getDisplayPace` to prioritize `planned_step_id` matching.

**Current**: Complex logic with multiple fallbacks
**New**: Simple lookup by ID, then type+number fallback

### Step 3: Ensure Consistency

**Both Summary and Context** use the same matching logic (extract to shared utility if needed).

## Why This Approach?

1. **Fixes root cause**: Makes matching unambiguous
2. **Low risk**: We're just ensuring data is populated correctly
3. **Fast**: Can be done in one focused session
4. **No breaking changes**: Existing code still works, just becomes more reliable

## Alternative: Big Refactor

If you want to do a bigger refactor, we could:

1. **Create a new "interval-mapper" service** that handles all planned → executed matching
2. **Refactor both Summary and Context** to use the same mapper
3. **Simplify the backend** to just generate data, let mapper handle matching

But this is higher risk and takes longer.

## Recommendation

**Do the root cause fix first** (ensure `planned_step_id` is always populated). This should fix the immediate issue. Then we can refactor incrementally with confidence that the data contract is solid.

What do you think? Root cause fix first, or go straight to big refactor?



