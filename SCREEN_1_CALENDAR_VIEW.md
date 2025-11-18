# Screen 1: Main Calendar/Week View

**Component:** `AppLayout.tsx` → `WorkoutCalendar.tsx`  
**Primary Data Hook:** `useWeekUnified(fromISO, toISO)`  
**Edge Function Called:** `get-week`

---

## Visual Elements (Top to Bottom)

### 1. Header
- Hamburger menu (left)
- "efforts" branding (center)
- No additional elements

### 2. Today Section
**Component:** `TodaysEffort.tsx`

**Display Logic:**
```typescript
// Lines 767-796 in TodaysEffort.tsx
const type = String(workout.type || '').toLowerCase();
const steps = Array.isArray(workout.steps_preset) ? workout.steps_preset : [];
const desc = String(workout.description || '').toLowerCase();

if (type === 'ride') {
  const joined = steps.join(' ').toLowerCase();
  if (/bike_vo2_/.test(joined)) return 'Ride — VO2';
  if (/bike_thr_/.test(joined)) return 'Ride — Threshold';
  if (/bike_ss_/.test(joined)) return 'Ride — Sweet Spot';
  if (/bike_endurance_/.test(joined)) return 'Ride — Endurance';
  return 'Ride';
}
```

**Shown:**
- Weather info (fetched from external API)
- Workout name with type suffix (e.g., "Ride — VO2")
- Duration (e.g., "1h 16")
- "Show details" link

**Data Source:**
- Filtered from `workouts` or `planned_workouts` for today's date
- Uses `steps_preset` tokens to determine workout subtype

### 3. Week Navigation
- Week range display: "Week of Oct 6 – Oct 12"
- Left/right arrows to navigate weeks
- Updates `fromISO` and `toISO` state

### 4. Calendar Grid (7 days + workload cell)

#### Cell Rendering Logic

**Planned Workouts:**
```typescript
// WorkoutCalendar.tsx lines 84-171: derivePlannedCellLabel()
function derivePlannedCellLabel(w: any): string | null {
  const type = String(w.type || '').toLowerCase();
  const steps: string[] = Array.isArray(w.steps_preset) ? w.steps_preset : [];
  
  // Calculate duration
  const secs = w.total_duration_seconds || w.computed?.total_duration_seconds || 
               sum(w.computed?.steps.map(s => s.seconds));
  const mins = Math.round(secs / 60);
  const durStr = mins > 0 ? `${mins}m` : '';
  
  // Run
  if (type === 'run') {
    if (has(/longrun_/i)) return `RN-LR ${durStr}`;
    if (has(/tempo_/i)) return `RN-TMP ${durStr}`;
    if (has(/interval_/i) && has(/5kpace|vo2/i)) return `RN-INT-VO2 ${durStr}`;
    return `RN ${durStr}`;
  }
  
  // Bike
  if (type === 'ride') {
    if (has(/bike_vo2_/i)) return `BK-INT-VO2 ${durStr}`;
    if (has(/bike_thr_/i)) return `BK-THR ${durStr}`;
    if (has(/bike_ss_/i)) return `BK-SS ${durStr}`;
    return `BK ${durStr}`;
  }
  
  // Swim
  if (type === 'swim') {
    if (has(/swim_intervals_/i)) return `SM-INT ${durStr}`;
    return `SM ${durStr}`;
  }
  
  // Strength
  if (type === 'strength') {
    if (hasCompound) return `STG-CMP ${durStr}`;
    if (hasAccessory) return `STG-ACC ${durStr}`;
    return `STG ${durStr}`;
  }
  
  // Mobility
  if (type === 'mobility') return `MBL`;
}
```

**Display Transformation:**
```typescript
// WorkoutCalendar.tsx line 376 + utils.ts lines 76-85
const plannedLabel = derivePlannedCellLabel(w); // e.g., "STG 45m"
const t = typeAbbrev(w.type); // Transforms to short form

function typeAbbrev(typeLike: string): string {
  const t = typeLike.toLowerCase();
  if (t.includes('strength')) return 'ST';  // STG → ST
  if (t.includes('ride') || t.includes('bike')) return 'BK';
  if (t.includes('run')) return 'RN';
  if (t.includes('swim')) return 'SW';
  if (t.includes('mobility')) return 'MBL';
  return 'WO';
}
```

**Completed Workouts:**
```typescript
// WorkoutCalendar.tsx lines 372-388
const miles = normalizeDistanceMiles(w);
const milesText = formatMilesShort(miles, 1); // e.g., "4.2m"

// Checkmarks
let checkmark = '';
if (isCompleted) {
  if (isPlannedLinked) {
    checkmark = ' ✓✓'; // Double checkmark: completed + attached to plan
  } else {
    checkmark = ' ✓';  // Single checkmark: completed but not attached
  }
}

const label = plannedLabel || [t, milesText].filter(Boolean).join(' ');
// Result: "RN 4.2m ✓" or "BK ✓✓"
```

**Actual Display:**
- Screenshot shows **single checkmarks only** (✓)
- Checkmarks appear when `workout_status === 'completed'`
- Double checkmarks (✓✓) when workout is both completed AND linked to planned workout via `planned_id`

#### Workload Cell (Bottom Right)

**Location:** Last cell in calendar grid (spans 2 cells)

**Display:**
```typescript
// WorkoutCalendar.tsx lines 631-642
<div className="flex items-center gap-2">
  <span className="text-sm font-medium">Total Workload</span>
  <div className="flex items-center gap-1">
    <Calendar className="w-3 h-3" /> {/* 📅 icon */}
    <span className="text-sm">{weeklyStats.planned}</span>
  </div>
  <div className="flex items-center gap-1">
    <CheckCircle className="w-3 h-3" /> {/* ⊘ icon */}
    <span className="text-sm">{weeklyStats.completed}</span>
  </div>
</div>
```

**Screenshot shows:** "Total Workload 📅 211 ⊘ 276"
- 211 = Planned workload points
- 276 = Completed workload points

**Data Source:**
```typescript
// From useWeekUnified hook → get-week edge function
const { weeklyStats } = useWeekUnified(fromISO, toISO);
// weeklyStats = { planned: 211, completed: 276 }
```

### 5. Bottom Navigation

**Four Buttons:**
1. **Build** (dropdown) - Create new workout
2. **Log** (dropdown) - Log completed workout
3. **Plans** (dropdown) - View/manage training plans
4. **Context** - Opens Context screen with recent workouts and analysis

---

## Data Flow

### On Screen Load

```
1. User opens app
   ↓
2. AppLayout renders
   ↓
3. WorkoutCalendar calls useWeekUnified(mondayISO, sundayISO)
   ↓
4. useWeekUnified calls edge function:
   await supabase.functions.invoke('get-week', {
     body: { from: mondayISO, to: sundayISO }
   })
   ↓
5. get-week edge function:
   - Checks for active plans
   - On-demand materializes missing planned_workouts rows
   - Fetches workouts in range
   - Merges planned + executed by date+type
   - Calculates weekly workload stats
   ↓
6. Returns unified items:
   {
     items: [
       {
         id: "uuid",
         date: "2025-10-06",
         type: "strength",
         status: "completed",
         planned: {
           id: "planned-uuid",
           steps: [...],
           total_duration_seconds: 2700,
           ...
         },
         executed: {
           intervals: [...],
           overall: { distance_m, duration_s_moving, ... }
         }
       }
     ],
     weekly_stats: { planned: 211, completed: 276 },
     training_plan_context: { planName, currentWeek, focus, ... }
   }
   ↓
7. WorkoutCalendar renders cells:
   - For each item, derive label from planned or executed data
   - Apply type abbreviations
   - Add checkmarks for completed
   - Display in calendar grid
```

### Week Navigation

```
1. User clicks left/right arrow
   ↓
2. Update fromISO and toISO (shift by 7 days)
   ↓
3. useWeekUnified re-fetches with new date range
   ↓
4. get-week processes new week
   ↓
5. Calendar re-renders with new data
```

---

## User Interactions

### 1. Click Workout Cell

**Code:**
```typescript
// WorkoutCalendar.tsx
onClick={() => {
  if (onSelectWorkout) {
    onSelectWorkout(event._src); // Pass full workout object
  }
}}
```

**Result:**
- Opens `UnifiedWorkoutView` component
- Shows Details/Summary/Context tabs
- Documented in SCREEN_2_WORKOUT_DETAIL.md

### 2. Click "Show details" (Today section)

**Code:**
```typescript
// TodaysEffort.tsx
<button onClick={() => {
  if (onViewCompleted && workout.id) {
    onViewCompleted(workout);
  }
}}>
  Show details
</button>
```

**Result:**
- Same as clicking workout cell
- Opens workout detail view

### 3. Bottom Nav Buttons

**Build Dropdown:**
- Opens `NewEffortDropdown` component
- Options: Run, Ride, Swim, Strength, Mobility, Walk
- Each opens appropriate workout builder

**Log Dropdown:**
- Opens `LogEffortDropdown` component
- Quick log for completed workouts

**Plans Dropdown:**
- Opens `PlansDropdown` component
- Options: View Active Plans, Browse Catalog, Create Custom

**Context Button:**
- Opens `ContextTabs` component
- Shows recent workouts with analysis
- Documented in SCREEN_3_CONTEXT.md

---

## Data Structures Used

### Unified Item (from get-week)

```typescript
{
  id: "workout-uuid" | "planned-uuid",
  date: "2025-10-06",
  type: "run" | "ride" | "swim" | "strength" | "mobility",
  status: "planned" | "completed" | "skipped",
  
  planned: {
    id: "planned-uuid",
    steps: [
      {
        id: "step-uuid",
        kind: "warmup" | "work" | "recovery" | "cooldown",
        duration_s: 900,
        distance_m: null,
        pace_range: { lower: 513, upper: 567, unit: "mi" },
        paceTarget: "9:00/mi"
      }
    ],
    total_duration_seconds: 3420,
    description: "Easy run with strides",
    steps_preset: ["warmup_run_easy_15min", "5kpace_4x1mi_R2min"],
    strength_exercises: [...],
    mobility_exercises: [...]
  } | null,
  
  executed: {
    intervals: [
      {
        planned_step_id: "step-uuid",
        planned_index: 0,
        executed: {
          duration_s: 905,
          distance_m: 2700,
          avg_pace_s_per_mi: 538,
          avg_hr: 145,
          adherence_percentage: 99
        },
        granular_metrics: {
          pace_variation_pct: 3.2,
          hr_drift_bpm: 2.1,
          time_in_target_pct: 98
        }
      }
    ],
    overall: {
      distance_m: 10000,
      duration_s_moving: 3245,
      avg_pace_s_per_mi: 521,
      avg_hr: 155
    }
  } | null
}
```

### Weekly Stats

```typescript
{
  planned: 211,   // Total planned workload points
  completed: 276  // Total completed workload points
}
```

**Workload Formula:** `duration_hours × intensity² × 100`

**Intensity Factors:**
- Easy pace: 0.65
- 5K pace: 0.95
- Threshold: 1.00
- VO2: 1.15

---

## Abbreviation Reference

### Type Abbreviations (Final Display)
- **ST** = Strength
- **MBL** = Mobility
- **RN** = Run
- **BK** = Bike/Ride
- **SW** = Swim
- **WK** = Walk

### Workout Subtypes
**Run:**
- RN = General run
- RN-LR = Long run
- RN-TMP = Tempo run
- RN-INT-VO2 = VO2 intervals
- RN-INT-SP = Speed work
- RN-INT-HL = Hill repeats

**Bike:**
- BK = General ride
- BK-INT-VO2 = VO2 intervals
- BK-THR = Threshold
- BK-SS = Sweet Spot
- BK-LR = Long ride

**Swim:**
- SW = General swim
- SM-INT = Swim intervals
- SM-DRL = Swim drills

**Strength:**
- ST = General strength
- STG-CMP = Compound lifts (squat, deadlift, bench, OHP)
- STG-ACC = Accessory work (rows, pull-ups, lunges)
- STG-CORE = Core-focused

---

## Key Code Locations

**Component Files:**
- `src/components/AppLayout.tsx` - Main layout orchestrator
- `src/components/WorkoutCalendar.tsx` - Calendar grid rendering
- `src/components/TodaysEffort.tsx` - Today's workout display

**Hooks:**
- `src/hooks/useWeekUnified.ts` - Fetches unified week data

**Edge Functions:**
- `supabase/functions/get-week/index.ts` - THE unified view endpoint

**Utilities:**
- `src/lib/utils.ts` - Type abbreviations and formatting

---

## Verified Against Code

✅ **Today Section:** Lines 767-796 in TodaysEffort.tsx  
✅ **Type Abbreviations:** Lines 76-85 in lib/utils.ts  
✅ **Checkmarks:** Lines 381-388 in WorkoutCalendar.tsx  
✅ **Workload Display:** Lines 631-642 in WorkoutCalendar.tsx  
✅ **Data Fetching:** useWeekUnified hook calling get-week  
✅ **Cell Labels:** derivePlannedCellLabel() function lines 84-171

---

## Notes

1. **Calendar shows different views:**
   - Planned workouts: Full label (e.g., "ST 45m")
   - Completed workouts: Abbreviated type + distance (e.g., "RN 4.2m ✓")
   - Double checkmark (✓✓) when completed AND linked to plan

2. **On-demand materialization:**
   - get-week creates planned_workouts rows as needed
   - Happens automatically when viewing calendar
   - No upfront creation of thousands of rows

3. **Workload tracking:**
   - Server-calculated via calculate-workload function
   - Displayed as planned vs completed
   - Formula accounts for duration and intensity

4. **Smart abbreviations:**
   - Planned workouts show detailed labels from steps_preset tokens
   - Completed workouts show simple type + distance
   - Consistent with CALENDAR_CELL_ABBREVIATIONS.md





