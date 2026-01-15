# Week Number Calculation Audit

## Problem
When navigating between weeks, the week description (e.g., "Week 4 • Recovery Week") shows incorrect week numbers. For example, Week 4 shows correctly, but the following week shows "Week 2" instead of "Week 5".

## Root Cause Analysis

### Two Different Week Number Calculations

There are **two separate calculations** for week numbers in the system:

1. **Materializer Week Number** (`weekNumberFor` function)
   - Location: `supabase/functions/get-week/index.ts:220-228`
   - Used when: Creating planned workouts in the database
   - Formula: `Math.floor((date - startDate) / 7) + 1`
   - Uses: `startIso` (normalized to Monday in materializer)

2. **Training Plan Context Week Number** (for display)
   - Location: `supabase/functions/get-week/index.ts:1067-1085`
   - Used when: Displaying week description in UI
   - Formula: `Math.floor((fromISO - startDateStr) / 7) + 1`
   - Uses: `config.user_selected_start_date || config.start_date` (may NOT be normalized)

### The Issue

**In `activate-plan` (line 228):**
```typescript
const anchorMonday: string = mondayOf(startDate);  // Normalized to Monday
// But stores: config.user_selected_start_date = startDate (original, not normalized)
```

**In `get-week` materializer (line 263):**
```typescript
let startIso = String((cfg?.user_selected_start_date || cfg?.start_date || '').toString().slice(0, 10));
// Uses raw user_selected_start_date, but then normalizes via fallback to planned_workouts
```

**In `get-week` training plan context (line 1070):**
```typescript
const startDateStr = config.user_selected_start_date || config.start_date;
// Uses raw date - NOT normalized to Monday!
```

### The Mismatch

1. **Materializer** uses `startIso` which gets normalized (either from config or via fallback to planned_workouts anchor)
2. **Training Plan Context** uses raw `user_selected_start_date` which may NOT be a Monday
3. If `user_selected_start_date` is not a Monday, the two calculations will diverge

### Example Scenario

- Plan start date: `2025-01-15` (Wednesday)
- `activate-plan` normalizes to Monday: `2025-01-13` (Monday)
- Materializer creates workouts with week_number based on Monday anchor
- Training plan context uses `2025-01-15` (Wednesday) for calculation
- Result: Week numbers are off by ~2-3 days worth of calculation

### Code Locations

1. **Materializer week calculation:**
   - `supabase/functions/get-week/index.ts:220-228` - `weekNumberFor` function
   - `supabase/functions/get-week/index.ts:292` - Uses `weekNumberFor(iso, startIso)`
   - `supabase/functions/get-week/index.ts:371` - Sets `week_number: wk` in database

2. **Training plan context week calculation:**
   - `supabase/functions/get-week/index.ts:1070-1080` - Calculates `currentWeek` for display
   - `supabase/functions/get-week/index.ts:1094` - Returns `currentWeek` in context

3. **Start date normalization:**
   - `supabase/functions/activate-plan/index.ts:228` - Normalizes to Monday anchor
   - `supabase/functions/activate-plan/index.ts:33-44` - `mondayOf` function

## Solution

**Normalize the start date in training plan context calculation to match the materializer:**

In `supabase/functions/get-week/index.ts:1070-1080`, normalize `startDateStr` to Monday before calculating:

```typescript
const startDateStr = config.user_selected_start_date || config.start_date;
if (startDateStr && fromISO) {
  // Normalize start date to Monday (matching materializer anchor)
  const startDateMonday = mondayOf(startDateStr);
  const startDate = new Date(startDateMonday);
  const viewedDate = new Date(fromISO);
  // ... rest of calculation
}
```

**OR** ensure `user_selected_start_date` is always stored as Monday in `activate-plan`:

In `supabase/functions/activate-plan/index.ts`, store the normalized Monday date:

```typescript
const anchorMonday: string = mondayOf(startDate);
// Store normalized date in config
config.user_selected_start_date = anchorMonday;  // Store Monday, not original date
```

## Recommended Fix

**Option 1 (Preferred):** Normalize in `get-week` training plan context calculation
- Pros: Works with existing data, no migration needed
- Cons: Requires adding `mondayOf` function to `get-week`

**Option 2:** Store normalized date in `activate-plan`
- Pros: Fixes at source, ensures consistency
- Cons: Requires data migration for existing plans

**Option 3:** Both (defense in depth)
- Normalize in both places to ensure consistency

## Testing

After fix, verify:
1. Week 4 shows "Week 4" correctly
2. Week 5 shows "Week 5" (not "Week 2")
3. Week numbers are consistent across all weeks
4. Week numbers match the `week_number` stored in `planned_workouts` table
