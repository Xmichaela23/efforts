# Complete Understanding: Calendar & Dashboard Architecture

## Overview

The main screen consists of two stacked components:
1. **TodaysEffort** (top) - Shows selected day's workouts + weather
2. **WorkoutCalendar** (bottom) - 7-day week grid view

Both components use the **same data source**: `useWeekUnified()` hook → `get-week` edge function.

---

## Data Flow Architecture

### Single Source of Truth: `get-week` Edge Function

**Location:** `supabase/functions/get-week/index.ts`

**Purpose:** Returns unified workout data combining:
- `planned_workouts` table (what's scheduled)
- `workouts` table (what was completed)

**Input:**
```typescript
POST { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
```

**Output:**
```typescript
{
  items: UnifiedItem[],  // Array of unified items
  weekly_stats: {
    planned: number,     // Total planned workload
    completed: number,   // Total completed workload
    distances: {         // Distance totals by type
      run_meters: number,
      cycling_meters: number,
      swim_meters: number
    }
  },
  training_plan_context: { ... },  // Active plan info
  weekly_ai: { ... }               // AI insights
}
```

**UnifiedItem Structure:**
```typescript
{
  id: string,
  date: string,           // YYYY-MM-DD
  type: string,           // 'run', 'ride', 'strength', etc.
  status: string,         // 'planned' or 'completed'
  planned: { ... },       // Planned workout data (if exists)
  executed: { ... },      // Completed workout data (if exists)
  planned_id?: string     // Links completed to planned
}
```

### Client Hook: `useWeekUnified`

**Location:** `src/hooks/useWeekUnified.ts`

**Architecture:** DUMB CLIENT - just calls server, no client-side merging

**Usage:**
```typescript
const { items, weeklyStats, trainingPlanContext, loading } = useWeekUnified(fromISO, toISO);
```

**Features:**
- Caches with React Query
- Invalidates on `week:invalidate` event
- Returns unified items ready for display

---

## Component 1: TodaysEffort

**Location:** `src/components/TodaysEffort.tsx`

### Purpose
Displays workouts for the selected date (defaults to today) with:
- Weather information (geolocation-based)
- Workout cards with metrics
- Expandable details
- Send to Garmin/Watch functionality

### Data Flow

1. **Calculate Week Range:**
   ```typescript
   const activeDate = selectedDate || today;
   const weekStart = startOfWeek(activeDateObj);
   const weekEnd = addDays(weekStart, 6);
   const fromISO = toDateOnlyString(weekStart);
   const toISO = toDateOnlyString(weekEnd);
   ```

2. **Fetch Unified Data:**
   ```typescript
   const { items: allUnifiedItems } = useWeekUnified(fromISO, toISO);
   ```

3. **Filter to Active Date:**
   ```typescript
   const unifiedItems = allUnifiedItems.filter((item: any) => {
     const itemDate = String(item?.date || '').slice(0, 10);
     return itemDate === activeDate;
   });
   ```

4. **Map to Display Format:**
   - Completed workouts → `mapUnifiedItemToCompleted()`
   - Planned workouts → `mapUnifiedItemToPlanned()`

### Display Logic

**Workout Cards:**
- Shows workout type, duration, distance
- Expandable to show detailed metrics
- Color-coded by discipline (run=teal, strength=orange, mobility=purple)

**Weather:**
- Only fetched for today (not historical dates)
- Uses browser geolocation (ephemeral, not persisted)
- Reverse geocodes to get city name

**Week Navigation:**
- Left/right arrows to navigate weeks
- Dispatches `week:navigate` event to sync with calendar

---

## Component 2: WorkoutCalendar

**Location:** `src/components/WorkoutCalendar.tsx`

### Purpose
Displays 7-day week grid (Mon-Sun) with:
- Workout pills per day
- Checkmarks for completed workouts
- Total workload summary
- Distance/volume metrics

### Data Flow

1. **Calculate Week Range:**
   ```typescript
   const weekStart = startOfWeek(referenceDate);
   const weekEnd = addDays(weekStart, 6);
   const fromISO = toDateOnlyString(weekStart);
   const toISO = toDateOnlyString(weekEnd);
   ```

2. **Fetch Unified Data:**
   ```typescript
   const { items: unifiedItems, weeklyStats, trainingPlanContext } = useWeekUnified(fromISO, toISO);
   ```

3. **Transform for Display:**
   ```typescript
   // Planned workouts
   const unifiedPlanned = unifiedItems
     .filter((it:any) => !!it?.planned)
     .map((it:any) => mapUnifiedItemToPlanned(it));
   
   // Completed workouts
   const unifiedWorkouts = unifiedItems
     .filter((it:any) => it?.executed && it.status === 'completed')
     .map((it:any) => ({ ... }));
   ```

4. **Deduplication Logic:**
   - If a planned workout is linked to a completed workout (via `planned_id`), hide the planned version
   - Show only the completed workout with checkmark

### Cell Rendering

**Day Cells (7 cells, Mon-Sun):**
- Each cell shows day name + date
- Workout pills with labels (e.g., "RN 60:00", "ST ✓")
- Checkmarks for completed workouts
- Color-coded by discipline

**Label Derivation:**
- Planned workouts: `derivePlannedCellLabel()` function
  - Analyzes `steps_preset` tokens
  - Determines workout subtype (VO2, Threshold, Long Run, etc.)
  - Adds duration if available
- Completed workouts: Shows distance (e.g., "RN 4.6m")

**Workload Cell (last 2 cells merged):**
- Total Workload: Planned / Completed
- Distance totals: Run, Bike, Swim
- Strength volume: Total lbs/kg
- Pilates/Yoga hours

### Workload Calculation

**Server-Side (in `get-week`):**
```typescript
// Formula: duration_hours × intensity² × 100

// Run/Ride/Swim:
const intensity = getStepsIntensity(stepsPreset, type);
workload = (durationSec / 3600) × intensity² × 100;

// Strength:
const volume = sum(weight × reps for all sets);
const volumeFactor = max(volume / 10000, 0.1);
workload = volumeFactor × 0.80² × 100;

// Mobility:
workload = 10; // Fixed low value

// Pilates/Yoga:
workload = (durationHours) × 0.75² × 100;
```

**Intensity Factors:**
- Easy pace: 0.65
- 5K pace: 0.95
- Threshold: 1.00
- VO2 Max: 1.15
- Sweet Spot (bike): 0.90

### Touch Gestures

- **Swipe left:** Next week
- **Swipe right:** Previous week
- **Tap day cell:** Selects date (updates `TodaysEffort`)
- **Tap workout pill:** Opens workout detail view

---

## State Synchronization

### Week Navigation

**TodaysEffort → WorkoutCalendar:**
```typescript
// TodaysEffort dispatches event
window.dispatchEvent(new CustomEvent('week:navigate', { 
  detail: { date: toDateOnlyString(newDate) } 
}));

// WorkoutCalendar listens
useEffect(() => {
  const handler = (e: CustomEvent) => {
    const date = e.detail?.date;
    if (date) {
      setReferenceDate(new Date(date + 'T12:00:00'));
    }
  };
  window.addEventListener('week:navigate', handler);
  return () => window.removeEventListener('week:navigate', handler);
}, []);
```

### Data Invalidation

**Events that trigger refresh:**
- `week:invalidate` - Invalidates week data cache
- `workout:invalidate` - Invalidates workout data
- `workouts:invalidate` - Invalidates all workouts

**Sources:**
- Workout completion
- Workout updates (RPE, gear, etc.)
- Plan changes
- Manual refresh (pull-to-refresh)

---

## Key Functions

### `derivePlannedCellLabel(workout)`
**Location:** `src/components/WorkoutCalendar.tsx:88`

Analyzes planned workout to generate calendar cell label:
- Checks `steps_preset` tokens
- Checks `description` text
- Determines workout subtype
- Adds duration if available
- Handles optional workouts

**Examples:**
- `["interval_5kpace"]` → "RN-VO2 30:00"
- `["longrun_easypace"]` → "RN-LR 100:00"
- `["bike_vo2_"]` → "BK-VO2 45:00"
- Optional → "OPT RN 30:00"

### `mapUnifiedItemToPlanned(item)`
**Location:** `src/utils/workout-mappers.ts:17`

Transforms unified item to PlannedWorkout format:
- Extracts planned data
- Sets workout_status to 'planned'
- Preserves all metadata (tags, exercises, etc.)

### `mapUnifiedItemToCompleted(item)`
**Location:** `src/utils/workout-mappers.ts:74`

Transforms unified item to completed workout format:
- Extracts executed data
- Sets workout_status to 'completed'
- Spreads all executed metrics

### `resolveMovingSeconds(workout)`
**Location:** `src/utils/resolveMovingSeconds.ts`

Determines workout duration from various sources:
1. `total_duration_seconds` (planned)
2. `duration_s_moving` (executed)
3. `duration_s` (executed fallback)
4. Calculated from intervals

---

## Performance Optimizations

1. **Single API Call:** Both components share the same `useWeekUnified` call
2. **React Query Caching:** Data cached with 5-60min stale time
3. **Debounced Loading:** 180ms debounce to prevent flicker
4. **Prefetching Disabled:** Avoids extra work on first paint
5. **Server-Side Materialization:** `sweep-week` runs once per week to ensure data is ready

---

## Data Mappers (Single Source of Truth)

**Location:** `src/utils/workout-mappers.ts`

All components should use these mappers instead of manually transforming unified items:

- `mapUnifiedItemToPlanned()` - For planned workouts
- `mapUnifiedItemToCompleted()` - For completed workouts

This ensures consistency across the app.

---

## Summary

**Architecture Pattern:** Smart Server, Dumb Client
- Server (`get-week`) does all merging, matching, computation
- Client just renders what server returns
- No client-side data manipulation

**Data Flow:**
```
User Action
  ↓
Component calls useWeekUnified(fromISO, toISO)
  ↓
Hook calls supabase.functions.invoke('get-week', { from, to })
  ↓
Edge function queries planned_workouts + workouts tables
  ↓
Server merges, matches, calculates workload
  ↓
Returns unified items array
  ↓
Client maps to display format
  ↓
Renders in TodaysEffort + WorkoutCalendar
```

**Key Principles:**
1. Single source of truth: `get-week` edge function
2. Unified data structure: `{ planned, executed }` per item
3. Mapper functions: Consistent transformation
4. Event-driven sync: `week:navigate`, `week:invalidate`
5. Server-side computation: Workload, distances, stats
