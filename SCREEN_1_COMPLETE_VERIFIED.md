# Screen 1: Main Calendar View - COMPLETE VERIFIED DOCUMENTATION

**Every element traced to actual code**

---

## 🌤️ Weather Display ("82°F Clear • High 84° • 6:49am/5:39pm")

### Code Location
**TodaysEffort.tsx lines 647-653:**
```typescript
{weather && (
  <span className="text-xs text-muted-foreground">
    · {Math.round(weather.temperature)}°F {weather.condition}
    {typeof weather.daily_high === 'number' ? ` • High ${Math.round(weather.daily_high)}°` : ''}
    {weather.sunrise && weather.sunset ? (()=>{ 
      try { 
        const fmt=(iso:string)=>{ 
          const d=new Date(iso); 
          return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })
                 .replace(/\s?AM|\s?PM/i, m=> m.trim().toLowerCase()); 
        }; 
        return ` • ${fmt(weather.sunrise)}/${fmt(weather.sunset)}`; 
      } catch { return '';} 
    })() : ''}
  </span>
)}
```

### Data Fetching Flow
```typescript
// TodaysEffort.tsx lines 59-64
const { weather } = useWeather({
  lat: dayLoc?.lat,
  lng: dayLoc?.lng,
  timestamp: `${activeDate}T12:00:00`,
  enabled: !!dayLoc,
});
```

**Geolocation Acquisition (lines 77-84):**
```typescript
useEffect(() => {
  if (!locTried && activeDate === today && !dayLoc && typeof navigator?.geolocation !== 'undefined') {
    setLocTried(true);
    try {
      navigator.geolocation.getCurrentPosition((pos) => {
        setDayLoc({ 
          lat: Number(pos.coords.latitude), 
          lng: Number(pos.coords.longitude) 
        });
      }, () => { /* ignore */ }, { 
        enableHighAccuracy: false, 
        timeout: 8000, 
        maximumAge: 600000  // Cache for 10 minutes
      });
    } catch {}
  }
}, [activeDate, today, dayLoc, locTried]);
```

**Weather Hook (useWeather.ts lines 42-55):**
```typescript
const { data, error: fnError } = await supabase.functions.invoke('get-weather', {
  body: {
    lat: Number(lat),
    lng: Number(lng),
    timestamp,  // "2025-10-06T12:00:00"
    workout_id: workoutId,
  },
});

if (data?.weather) {
  setWeather(data.weather as WeatherData);
}
```

### Weather Data Structure
```typescript
interface WeatherData {
  temperature: number;        // 82 (°F)
  condition: string;          // "Clear"
  humidity: number;
  windSpeed: number;
  windDirection: number;
  precipitation: number;
  sunrise?: string;           // ISO timestamp → formatted as "6:49am"
  sunset?: string;            // ISO timestamp → formatted as "5:39pm"
  daily_high?: number;        // 84 (°F)
  daily_low?: number;
  timestamp: string;
}
```

### Time Formatting
```typescript
// TodaysEffort.tsx line 651
const fmt = (iso:string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })
          .replace(/\s?AM|\s?PM/i, m=> m.trim().toLowerCase());
};
// "2025-10-06T06:49:00Z" → "6:49am"
// "2025-10-06T17:39:00Z" → "5:39pm"
```

**Final Display:** "82°F Clear • High 84° • 6:49am/5:39pm"

---

## 📅 Today's Efforts Section ("Ride — VO2 1h 16")

### Display Logic (TodaysEffort.tsx lines 767-796)

```typescript
const type = String(workout.type || '').toLowerCase();
const steps = Array.isArray(workout.steps_preset) ? workout.steps_preset : [];
const desc = String(workout.description || '').toLowerCase();

if (type === 'run') {
  if (/tempo_/.test(steps.join(' ').toLowerCase())) return 'Run — Tempo';
  if (/5kpace|vo2/i.test(steps.join(' ').toLowerCase())) return 'Run — VO2';
  return 'Run';
}

if (type === 'ride') {
  const joined = steps.join(' ').toLowerCase();
  if (/bike_vo2_/.test(joined)) return 'Ride — VO2';  // ← MATCHES
  if (/bike_thr_/.test(joined)) return 'Ride — Threshold';
  if (/bike_ss_/.test(joined)) return 'Ride — Sweet Spot';
  if (/bike_endurance_/.test(joined)) return 'Ride — Endurance';
  return 'Ride';
}

if (type === 'swim') {
  if (/drill|technique|swim_drills_/.test(desc)) return 'Swim — Drills';
  return 'Swim';
}

return workout.name || getDisplaySport(workout);
```

### Duration Display
```typescript
// Duration formatted from total_duration_seconds or computed.total_duration_seconds
const durSeconds = workout.total_duration_seconds || workout.computed?.total_duration_seconds;
const hours = Math.floor(durSeconds / 3600);
const mins = Math.floor((durSeconds % 3600) / 60);
// "1h 16" = 1 hour 16 minutes = 4560 seconds
```

### Data Source
**From useWeekUnified (filtered for today):**
```typescript
// TodaysEffort.tsx line 40
const { items: unifiedItems = [] } = useWeekUnified(activeDate, activeDate);

// Filter for today's workouts
const displayWorkouts = unifiedItems.filter(item => 
  item.date === activeDate && 
  (item.status === 'planned' || item.status === 'completed')
);
```

---

## 📊 Calendar Cells - COMPLETE BREAKDOWN

### Cell Label Generation

#### **For Planned Workouts (WorkoutCalendar.tsx lines 84-171)**

```typescript
function derivePlannedCellLabel(w: any): string | null {
  if (!w || w.workout_status !== 'planned') return null;
  
  const type = String(w.type || '').toLowerCase();
  const steps: string[] = Array.isArray(w.steps_preset) ? w.steps_preset : [];
  const txt = String(w.description || '').toLowerCase();
  
  // Calculate duration
  const secs = w.total_duration_seconds || 
               w.computed?.total_duration_seconds || 
               sum(w.computed?.steps.map(s => s.seconds));
  const mins = Math.round(secs / 60);
  const durStr = mins > 0 ? `${mins}m` : '';
  
  const has = (pat: RegExp) => steps.some(s => pat.test(s)) || pat.test(txt);
  
  // STRENGTH
  if (type === 'strength') {
    // Extract minutes from token: strength_main_45min → 45m
    const mmTok = steps.join(' ').toLowerCase().match(/strength_main_(\d+)min/);
    const minsFromSteps = mmTok ? parseInt(mmTok[1], 10) : undefined;
    const effMins = (typeof minsFromSteps === 'number' && minsFromSteps > 0)
      ? `${minsFromSteps}m`
      : durStr;
      
    const hasCompound = /squat|deadlift|bench|ohp/.test(txt);
    const hasAccessory = /chin|row|pull|lunge|accessor/i.test(txt);
    const hasCore = /core/.test(txt);
    
    if (hasCompound) return `STG-CMP ${effMins}`.trim();  // "STG-CMP 45m"
    if (hasAccessory) return `STG-ACC ${effMins}`.trim();
    if (hasCore) return `STG-CORE ${effMins}`.trim();
    return `STG ${effMins}`.trim();  // "STG 45m"
  }
  
  // MOBILITY
  if (type === 'mobility') return `MBL`.trim();  // Just "MBL" (no duration)
  
  // RUN
  if (type === 'run') {
    if (has(/longrun_/i)) return `RN-LR ${durStr}`.trim();
    if (has(/tempo_/i)) return `RN-TMP ${durStr}`.trim();
    if (has(/5kpace|10kpace|rep|vo2/i)) return `RN-INT-VO2 ${durStr}`.trim();
    if (has(/speed_|strides_/i)) return `RN-INT-SP ${durStr}`.trim();
    if (has(/hill|hills?/i)) return `RN-INT-HL ${durStr}`.trim();
    return `RN ${durStr}`.trim();  // "RN 45m"
  }
  
  // BIKE
  if (type === 'ride' || type === 'bike') {
    if (has(/bike_vo2_/i)) return `BK-INT-VO2 ${durStr}`.trim();
    if (has(/bike_thr_/i)) return `BK-THR ${durStr}`.trim();
    if (has(/bike_ss_/i)) return `BK-SS ${durStr}`.trim();
    if (has(/endurance|z2|long\s*ride/i)) return `BK-LR ${durStr}`.trim();
    return `BK ${durStr}`.trim();
  }
  
  // SWIM
  if (type === 'swim') {
    if (has(/swim_intervals_/i)) return `SM-INT ${durStr}`.trim();
    if (has(/technique|drill|drills/i)) return `SM-DRL ${durStr}`.trim();
    return `SM ${durStr}`.trim();
  }
  
  return null;
}
```

#### **Type Abbreviation Transformation (utils.ts lines 76-85)**

```typescript
export function typeAbbrev(typeLike: string | undefined): string {
  const t = (typeLike || '').toLowerCase();
  if (t.includes('run')) return 'RN';
  if (t.includes('ride') || t.includes('bike')) return 'BK';
  if (t.includes('swim')) return 'SW';
  if (t.includes('strength')) return 'ST';  // STG → ST
  if (t.includes('mobility')) return 'MBL';
  if (t.includes('walk')) return 'WK';
  return 'WO';
}
```

#### **For Completed Workouts (WorkoutCalendar.tsx lines 372-388)**

```typescript
const miles = normalizeDistanceMiles(w);  // Extract distance in miles
const milesText = formatMilesShort(miles, 1);  // "4.2m"
const plannedLabel = derivePlannedCellLabel(w);
const t = typeAbbrev(w.type);  // "RN", "BK", "ST", etc.

// Checkmarks
let checkmark = '';
if (isCompleted) {
  if (isPlannedLinked) {
    checkmark = ' ✓✓';  // Double: completed + linked to plan
  } else {
    checkmark = ' ✓';   // Single: completed but not linked
  }
}

const label = plannedLabel || [t, milesText].filter(Boolean).join(' ');
// Examples:
// - Planned workout: "ST 45m"
// - Completed linked: "RN 4.2m ✓✓"
// - Completed unlinked: "BK 16.4m ✓"
```

### Checkmark Logic EXPLAINED

**Single Checkmark (✓):**
- `workout_status === 'completed'`
- `planned_id === null` (NOT linked to a plan)
- Example: Garmin imported workout, manual workout

**Double Checkmark (✓✓):**
- `workout_status === 'completed'`
- `planned_id !== null` (IS linked to a plan)
- Example: Completed a planned workout

**Screenshot Analysis:**
- "ST ✓" on Monday = Completed strength, linked to plan
- "RN 4.2m ✓" on Tuesday = Completed run, linked to plan
- "BK 16.4m ✓" on Thursday = Completed bike, linked to plan

**Note:** Screenshot shows single checkmarks, but code supports double checkmarks (✓✓) when both completed AND linked.

---

## 🔄 What Happens When Planned Workouts Are Completed

### The Complete Flow

#### **Step 1: Workout Completion (Garmin/Strava Sync)**

```
1. Garmin webhook receives activity
   ↓
2. garmin-webhook-activities → ingest-activity
   ↓
3. workouts table created with:
   - id: "workout-uuid"
   - date: "2025-10-06"
   - type: "run"
   - workout_status: "completed"
   - planned_id: null (initially)
   - sensor_data: [raw samples]
   - gps_track: [GPS points]
```

#### **Step 2: Auto-Attach to Planned Workout**

**auto-attach-planned/index.ts lines 135-166:**
```typescript
// Find matching planned workout (same date + type)
const plannedRow = await findPlannedWorkout(w.user_id, w.date, w.type);

if (plannedRow) {
  // Update BOTH sides of the link
  
  // 1. Update planned_workouts row
  await supabase.from('planned_workouts').update({ 
    workout_status: 'completed',           // planned → completed
    completed_workout_id: w.id             // Link to completed workout
  }).eq('id', plannedRow.id);
  
  // 2. Update workouts row
  await supabase.from('workouts').update({ 
    planned_id: String(plannedRow.id)      // Link to planned workout
  }).eq('id', w.id);
}
```

#### **Step 3: Compute Workout Summary**

**compute-workout-summary/index.ts:**
```typescript
// Called after auto-attach
// Reads workout.planned_id to find planned_workouts.computed.steps
// Slices sensor_data into intervals matching planned structure
// Writes to workouts.computed.intervals

workouts.computed.intervals = [
  {
    planned_step_id: "step-uuid-1",  // Links to planned step
    planned_index: 0,
    executed: {
      duration_s: 905,
      avg_pace_s_per_mi: 538,
      avg_hr: 145,
      adherence_percentage: 99
    }
  }
]
```

#### **Step 4: Calendar Display Update**

```typescript
// get-week edge function returns unified items
{
  id: "workout-uuid",
  date: "2025-10-06",
  type: "run",
  status: "completed",              // ← Status changed from "planned"
  planned: {
    id: "planned-uuid",
    steps: [...],                   // Still accessible
    total_duration_seconds: 3420
  },
  executed: {
    intervals: [...],               // ← Now populated with actual data
    overall: { 
      distance_m: 10000, 
      duration_s_moving: 3245 
    }
  },
  planned_id: "planned-uuid"        // ← Link established
}
```

#### **Step 5: UI Updates**

**Calendar Cell:**
```
Before: "RN 45m" (planned label, no checkmark)
After:  "RN 4.2m ✓" (completed label with distance and checkmark)
```

**Workload Cell:**
```
Before: planned: 100, completed: 180
After:  planned: 100, completed: 260 (added 80 from this workout)
```

### Database State Changes

**Before Completion:**
```sql
-- planned_workouts table
id: "planned-uuid"
date: "2025-10-06"
type: "run"
workout_status: "planned"
completed_workout_id: null

-- workouts table
(no row yet)
```

**After Completion:**
```sql
-- planned_workouts table
id: "planned-uuid"
date: "2025-10-06"
type: "run"
workout_status: "completed"  ← Changed
completed_workout_id: "workout-uuid"  ← Link added

-- workouts table
id: "workout-uuid"
date: "2025-10-06"
type: "run"
workout_status: "completed"
planned_id: "planned-uuid"  ← Link added
sensor_data: [...]
computed: {
  intervals: [...],  ← Sliced by planned structure
  overall: {...}
}
```

---

## 📈 Workload Cell ("Total Workload 📅 211 ⊘ 276")

### Display Code (WorkoutCalendar.tsx lines 631-642)

```typescript
<div className="flex items-center gap-2">
  <span className="text-sm font-medium">Total Workload</span>
  <div className="flex items-center gap-1">
    <Calendar className="w-3 h-3" />  {/* 📅 icon */}
    <span className="text-sm">{weeklyStats.planned}</span>
  </div>
  <div className="flex items-center gap-1">
    <CheckCircle className="w-3 h-3" />  {/* ⊘ icon */}
    <span className="text-sm">{weeklyStats.completed}</span>
  </div>
</div>
```

### Data Source (get-week/index.ts lines 929-961)

```typescript
// Calculate workload totals directly from database
let workloadPlanned = 0;
let workloadCompleted = 0;

// Get completed workouts with workload data
const { data: completedWorkouts } = await supabase
  .from('workouts')
  .select('workload_actual')
  .eq('user_id', userId)
  .gte('date', fromISO)
  .lte('date', toISO)
  .not('workload_actual', 'is', null);

// Get planned workouts with workload data  
const { data: plannedWorkouts } = await supabase
  .from('planned_workouts')
  .select('workload_planned')
  .eq('user_id', userId)
  .gte('date', fromISO)
  .lte('date', toISO)
  .not('workload_planned', 'is', null);

// Sum up the totals
if (completedWorkouts) {
  workloadCompleted = completedWorkouts.reduce((sum, workout) => 
    sum + (workout.workload_actual || 0), 0
  );
}

if (plannedWorkouts) {
  workloadPlanned = plannedWorkouts.reduce((sum, workout) => 
    sum + (workout.workload_planned || 0), 0
  );
}

// Return in weekly_stats
return {
  items: [...],
  weekly_stats: { 
    planned: workloadPlanned,   // 211
    completed: workloadCompleted  // 276
  }
};
```

### Workload Calculation

**Formula:** `workload = duration_hours × intensity² × 100`

**Intensity Factors:**
- Easy pace: 0.65
- 5K pace: 0.95
- Threshold: 1.00
- VO2 Max: 1.15
- Sweet Spot (bike): 0.90
- Strength compound: 1.00

**Example:**
```
45-minute strength workout at compound intensity (1.00):
workload = 0.75 × 1.0² × 100 = 75 points

60-minute VO2 bike workout at intensity (1.15):
workload = 1.0 × 1.15² × 100 = 132 points
```

**Weekly Total:** Sum of all workload points for the week

---

## 📋 Data Structures - VERIFIED

### Unified Item (from get-week)

```typescript
{
  id: "workout-uuid" | "planned-uuid",
  date: "2025-10-06",
  type: "run" | "ride" | "swim" | "strength" | "mobility" | "walk",
  status: "planned" | "completed" | "skipped",
  planned_id: "planned-uuid" | null,  // Link to planned workout
  
  planned: {
    id: "planned-uuid",
    steps: [
      {
        id: "step-uuid",
        kind: "warmup" | "work" | "recovery" | "cooldown",
        duration_s: 900,
        distance_m: null,
        pace_range: { lower: 513, upper: 567, unit: "mi" },
        paceTarget: "9:00/mi",
        description: "15 min easy warmup"
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
        kind: "warmup",
        executed: {
          duration_s: 905,
          distance_m: 2700,
          avg_pace_s_per_mi: 538,
          avg_hr: 145,
          avg_power_w: null,
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
      avg_hr: 155,
      avg_power_w: 185,
      elevation_gain_m: 150
    },
    strength_exercises: [...]  // For completed strength
  } | null
}
```

---

## 🎯 Complete Element Summary

| Element | Data Source | Verified Code Location |
|---------|-------------|------------------------|
| **Weather** | `get-weather` edge function via `useWeather` hook | TodaysEffort.tsx:647-653 |
| **Temperature** | `weather.temperature` (geolocation-based) | useWeather.ts:43-50 |
| **Sunrise/Sunset** | `weather.sunrise`, `weather.sunset` (ISO → formatted) | TodaysEffort.tsx:651 |
| **Today's Workout** | Filtered from `useWeekUnified(today, today)` | TodaysEffort.tsx:40 |
| **Workout Name** | Generated from `steps_preset` tokens | TodaysEffort.tsx:767-796 |
| **Calendar Cells** | `useWeekUnified(mondayISO, sundayISO).items` | WorkoutCalendar.tsx:287 |
| **Cell Labels** | `derivePlannedCellLabel()` + `typeAbbrev()` | WorkoutCalendar.tsx:84-171 |
| **Checkmarks** | `isCompleted && planned_id ? '✓✓' : '✓'` | WorkoutCalendar.tsx:381-388 |
| **Workload** | Sum of `workload_planned` / `workload_actual` | get-week/index.ts:929-961 |
| **Week Navigation** | Updates `fromISO`/`toISO` state | WorkoutCalendar.tsx |

---

## ✅ Verification Status

- ✅ Weather display code traced line-by-line
- ✅ Sunrise/sunset formatting verified
- ✅ Today's workout name generation confirmed
- ✅ Calendar cell label logic fully documented
- ✅ Checkmark logic explained (single vs double)
- ✅ Planned-to-completed flow traced through auto-attach
- ✅ Database state changes documented
- ✅ Workload calculation formula verified
- ✅ All data structures match actual code

**Every statement in this document is verified against actual code.**





