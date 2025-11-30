# Three Screens: Complete Understanding of Duties & Utility

## Purpose
This document ensures complete understanding of what each screen does, what data it needs, and what it displays before refactoring the analysis functions.

---

## 🎯 Screen 1: Details Screen

### Component Location
- **Primary**: `src/components/CompletedTab.tsx`
- **Wrapper**: `src/components/UnifiedWorkoutView.tsx` (renders CompletedTab in "Details" tab)
- **Hook**: `src/hooks/useWorkoutDetail.ts` (fetches full workout data)

### Purpose
**Deep dive into raw workout data and metrics** - No AI analysis, just data visualization

### What It Displays

#### 1. **Basic Metrics Grid** (3-column layout)
- **Distance** (km/mi or m/yd for swims)
- **Duration** (elapsed time)
- **Moving Time** (active time)
- **Avg Pace** (min/mi or min/km for runs, /100m or /100yd for swims)
- **Max Pace** (fastest pace)
- **Avg HR** (bpm)
- **Max HR** (bpm)
- **Elevation Gain** (m/ft)
- **Cadence** (spm for runs, rpm for rides)
- **Calories**
- **Swim-specific**: Lengths, stroke rate, pool length, SWOLF

#### 2. **Interactive Map**
- GPS route visualization (Mapbox)
- Route line with elevation coloring
- Interactive puck that moves along route
- Elevation profile chart below map

#### 3. **Time-Series Charts**
- **Pace/Speed chart** (over time)
- **Heart Rate chart** (over time)
- **Power chart** (for rides, over time)
- **Elevation chart** (over distance)
- **Cadence chart** (over time)
- All charts are interactive and synced

#### 4. **Splits Table**
- Mile/km splits (for runs/rides)
- Shows: Split number, avg pace, avg HR, avg cadence
- Format: `1: 6:45/km, 145 bpm, 180 spm`

#### 5. **Zone Distributions**
- **HR Zones** (pie chart + time distribution)
  - Zone 1-5 time spent
  - Visual pie chart
- **Power Zones** (for rides, pie chart + time distribution)
  - Zone 1-6 time spent
  - Visual pie chart

#### 6. **Advanced Metrics** (if available)
- Normalized Power (rides)
- Training Stress Score (TSS)
- Total Work (kJ)
- VAM (Vertical Ascent Meters/hour)
- Grade Adjusted Pace (GAP)

### Data Sources (ALL from `compute-workout-analysis`)

| Field | Purpose | Used For |
|-------|---------|----------|
| `workouts.computed.series` | Time-series arrays | Charts (pace, HR, power, elevation over time) |
| `workouts.computed.overall` | Summary totals | Basic metrics display (distance, duration, avg pace) |
| `workouts.computed.analysis.splits` | Mile/km splits | Splits table |
| `workouts.computed.analysis.zones.hr` | HR zone distribution | HR zone chart |
| `workouts.computed.analysis.zones.power` | Power zone distribution | Power zone chart (rides) |
| `workouts.gps_track` | GPS coordinates | Map visualization |
| `workouts.sensor_data` | Raw sensor samples | Fallback for charts if series missing |

### Key Formulas Used

#### Pace Calculation (for charts)
**Source**: `compute-workout-analysis/index.ts` lines 1086-1092
```typescript
// Calculate from distance delta and time delta
const dt = rows[i].t - rows[i-1].t; // time delta (seconds)
const dd = rows[i].d - rows[i-1].d; // distance delta (meters)
if (dt > 0 && dd > 2.5) { // filter GPS noise
  pace_s_per_km = dt / (dd / 1000); // seconds per km
}
```

#### Speed Calculation (for cycling)
```typescript
speed_mps = dd / dt; // meters per second
```

#### Splits Calculation
**Source**: `compute-workout-analysis/index.ts` lines 1170-1190
- Groups samples by distance milestones (1 mile or 1 km)
- Calculates avg pace, HR, cadence per split

#### Zone Histograms
**Source**: `compute-workout-analysis/index.ts` lines 1237-1359
- Counts time spent in each HR/power zone
- Creates bins for visualization

### What It Does NOT Do
- ❌ No AI analysis
- ❌ No execution scoring
- ❌ No adherence calculations
- ❌ No planned vs completed comparison
- ❌ No narrative insights

### Triggered By
- User clicks workout from calendar/dashboard
- User opens "Details" tab in `UnifiedWorkoutView`

### Dependencies
- **Edge Function**: `compute-workout-analysis` (generates all computed data)
- **Hook**: `useWorkoutDetail` (fetches workout with GPS + sensor data)
- **Components**: `CleanElevationChart`, `EffortsViewerMapbox`, `HRZoneChart`, `PowerZoneChart`

---

## 🎯 Screen 2: Summary Screen

### Component Location
- **Primary**: `src/components/MobileSummary.tsx`
- **Used in**: Calendar view, Today's workout view

### Purpose
**Planned vs Completed comparison with execution scoring** - Shows how well user executed the planned workout

### What It Displays

#### 1. **Planned Workout Structure**
- Workout name/description
- Planned intervals/steps:
  - Step type (warmup, work, recovery, cooldown)
  - Target pace/power range
  - Target duration
  - Target distance (if applicable)

#### 2. **Completed Workout Data**
- Executed intervals (matched to planned steps):
  - Actual pace/power
  - Actual duration
  - Actual distance
  - Adherence percentage per interval

#### 3. **Execution Scores** (Top Section)
Three chips showing:
- **Execution Score** (0-100%)
  - Overall adherence score
  - Combines pace + duration adherence
  - Color-coded: Green (≥80%), Yellow (60-79%), Red (<60%)
- **Pace Adherence** (0-100%)
  - How well user hit target pace ranges
  - Based on time-in-range analysis
- **Duration Adherence** (0-100%)
  - How well user hit target durations
  - Based on actual vs planned duration

#### 4. **Performance Assessment**
- Text description: "Excellent", "Good", "Fair", "Poor"
- Contextual message explaining the scores

#### 5. **"View context" Button**
- Navigates to Context screen
- Passes workout ID to focus on that workout

### Data Sources

| Field | Purpose | Used For |
|-------|---------|----------|
| `planned_workouts.computed.steps` | Planned structure | Planned intervals display |
| `workouts.computed.intervals[]` | Completed intervals | Executed intervals display |
| `workouts.computed.intervals[].granular_metrics` | Enhanced metrics | Per-interval adherence (from `analyze-running-workout`) |
| `workouts.workout_analysis.performance` | Execution scores | Top adherence chips |
| `workouts.computed.overall` | Summary totals | Fallback for metrics if intervals missing |

### Key Data Structure

#### Performance Object (from `analyze-running-workout`)
```typescript
workout_analysis.performance = {
  execution_adherence: 71,      // Overall score (0-100)
  pace_adherence: 71,           // Pace adherence (0-100)
  duration_adherence: 89,       // Duration adherence (0-100)
  completed_steps: 4,           // Number of completed intervals
  total_steps: 5,               // Total planned intervals
  performance_assessment: "Good" // Text description
}
```

#### Granular Metrics (per interval)
```typescript
computed.intervals[].granular_metrics = {
  time_in_target_pct: 85,       // % of time in target pace range
  pace_variation_pct: 5,        // Pace variability
  hr_drift_bpm: 3,              // HR drift during interval
  adherence_percentage: 82      // Overall interval adherence
}
```

### Key Formulas Used

#### Execution Adherence (from `analyze-running-workout`)
**Source**: `analyze-running-workout/index.ts` lines 1102-1151
```typescript
// For range workouts (intervals with pace ranges)
execution_adherence = 
  (0.4 * avg_pace_adherence) +      // 40% weight
  (0.3 * time_in_range_pct) +        // 30% weight
  (0.3 * duration_adherence);        // 30% weight

// For single-target workouts
execution_adherence = 
  (0.5 * pace_adherence) +           // 50% weight
  (0.5 * duration_adherence);         // 50% weight
```

#### Pace Adherence (from `analyze-running-workout`)
**Source**: `analyze-running-workout/index.ts` lines 1121-1137
```typescript
// Uses granular time-in-range analysis
pace_adherence = time_in_target_pct; // % of time spent in prescribed pace range
```

#### Duration Adherence (from `analyze-running-workout`)
**Source**: `analyze-running-workout/index.ts` lines 1126-1138
```typescript
// Compares actual duration to planned duration
duration_adherence = Math.min(100, (planned_duration / actual_duration) * 100);
```

### What It Does NOT Do
- ❌ No AI narrative insights
- ❌ No detailed analysis breakdown
- ❌ No mile-by-mile terrain analysis
- ❌ No charts or visualizations
- ❌ No raw sensor data display

### Triggered By
- User views today's workout
- User clicks on completed workout in calendar
- User navigates to workout detail view

### Dependencies
- **Edge Function**: `analyze-running-workout` (calculates execution scores)
- **Edge Function**: `compute-workout-summary` (creates intervals from sensor data)
- **Component**: `MobileSummary` (renders planned vs completed comparison)

---

## 🎯 Screen 3: Context Screen

### Component Location
- **Primary**: `src/components/context/TodaysWorkoutsTab.tsx`
- **Wrapper**: `src/components/ContextTabs.tsx` (tab container)
- **Service**: `src/services/workoutAnalysisService.ts` (triggers analysis)

### Purpose
**AI-powered insights and training analysis** - Provides detailed insights about workout performance

### What It Displays

#### 1. **Recent Workouts List** (Last 14 days)
- List of recent workouts
- "Tap to analyze" button for workouts without analysis
- Spinner during analysis
- Error messages if analysis fails

#### 2. **AI-Generated Insights** (Primary Content)
- **Narrative Insights** (3-4 bullet points)
  - AI-generated observations about the workout
  - Examples:
    - "You completed 4.2 miles in 32 minutes with an average pace of 7:37 min/mi"
    - "Your heart rate averaged 165 bpm, indicating you maintained a strong aerobic effort"
    - "Pace consistency was excellent, with minimal variation across work intervals"

#### 3. **Mile-by-Mile Terrain Breakdown** (Continuous runs only)
- For continuous runs (not interval workouts)
- Shows each mile with:
  - Pace for that mile
  - Elevation gain/loss
  - Comparison to target pace range
  - Terrain categorization (flat, rolling, hilly)

#### 4. **Interval-by-Interval Breakdown** (Interval workouts only)
- For interval workouts
- Shows each interval with:
  - Pace adherence
  - Duration adherence
  - HR drift
  - Segment type (warmup/work/recovery/cooldown)
  - Coaching insights

#### 5. **Red Flags** (Areas for Improvement)
- List of specific issues identified:
  - "Recovery jogs too slow"
  - "Fading in final intervals"
  - "Started too fast"

#### 6. **Strengths** (What Went Well)
- Positive patterns identified:
  - "Excellent consistency across work intervals"
  - "Strong finish"
  - "Proper recovery discipline"

### Data Sources

| Field | Purpose | Used For |
|-------|---------|----------|
| `workouts.workout_analysis.narrative_insights` | AI-generated insights | Primary insights display |
| `workouts.workout_analysis.detailed_analysis` | Structured breakdown | Mile-by-mile, interval breakdown |
| `workouts.workout_analysis.detailed_analysis.mile_by_mile_terrain` | Mile splits analysis | Mile-by-mile terrain breakdown |
| `workouts.workout_analysis.detailed_analysis.interval_breakdown` | Interval analysis | Interval-by-interval breakdown |
| `workouts.workout_analysis.performance` | Execution scores | Also displayed (same as Summary) |
| `workouts.workout_analysis.strengths` | Positive patterns | Strengths section |
| `workouts.workout_analysis.primary_issues` | Problems identified | Red flags section |
| `workouts.workout_analysis.granular_analysis` | Raw metrics | Used for calculations |

### Key Data Structure

#### Narrative Insights (from `analyze-running-workout`)
```typescript
workout_analysis.narrative_insights = [
  "You completed 4.2 miles in 32 minutes...",
  "Your heart rate averaged 165 bpm...",
  "Pace consistency was excellent..."
]
```

#### Detailed Analysis (from `analyze-running-workout`)
```typescript
workout_analysis.detailed_analysis = {
  speed_fluctuations: { ... },
  heart_rate_recovery: { ... },
  interval_breakdown: {
    available: true,
    section: "Interval 1: 1 mile @ 5K pace\nPace: 6:45/mi (target: 6:30-7:00/mi) ✅\n..."
  },
  pacing_consistency: { ... },
  mile_by_mile_terrain: {
    available: true,
    section: "Mile 1: 7:15/mi, +50ft elevation, within target range ✅\n..."
  }
}
```

### Key Functions Used

#### AI Narrative Generation (from `analyze-running-workout`)
**Source**: `analyze-running-workout/index.ts` lines 4245-5201 (~950 lines)
- Builds comprehensive prompt with:
  - Workout metrics (duration, distance, pace, HR)
  - Weather and terrain data
  - Plan context (if part of training plan)
  - Adherence metrics
  - Pre-calculated mile/interval categorizations
- Sends to OpenAI GPT-4o-mini
- Returns 3-4 factual observations

#### Detailed Chart Analysis (from `analyze-running-workout`)
**Source**: `analyze-running-workout/index.ts` lines 3128-3192
- Orchestrates generation of:
  - Speed fluctuation analysis
  - HR recovery analysis
  - Interval breakdown
  - Pacing consistency
  - Mile-by-mile terrain (continuous runs only)

### What It Does NOT Do
- ❌ No raw data visualization (no charts)
- ❌ No GPS map display
- ❌ No splits table
- ❌ No zone distributions
- ❌ No planned vs completed comparison table

### Triggered By
- User clicks "View context" from Summary screen
- User navigates to Context tab
- User clicks workout in recent list
- User clicks "Tap to analyze" button

### Dependencies
- **Edge Function**: `analyze-running-workout` (generates all insights)
- **Service**: `workoutAnalysisService.ts` (triggers analysis with retry logic)
- **Component**: `TodaysWorkoutsTab` (displays insights, handles polling)

---

## 🔄 Data Flow Summary

### Details Screen Flow
```
User opens Details tab
  ↓
useWorkoutDetail hook fetches workout
  ↓
If computed.series missing → triggers compute-workout-analysis
  ↓
compute-workout-analysis generates:
  - computed.series (time-series arrays)
  - computed.analysis.splits (mile/km splits)
  - computed.analysis.zones (HR/power zones)
  ↓
CompletedTab displays charts, splits, zones
```

### Summary Screen Flow
```
User views workout in calendar/today
  ↓
MobileSummary reads:
  - planned_workouts.computed.steps (planned structure)
  - workouts.computed.intervals (completed intervals)
  - workouts.workout_analysis.performance (execution scores)
  ↓
If workout_analysis.performance missing → no scores shown
  ↓
Displays planned vs completed table + execution chips
```

### Context Screen Flow
```
User clicks "View context" or navigates to Context tab
  ↓
TodaysWorkoutsTab loads recent workouts
  ↓
If workout_analysis missing or incomplete → triggers analyze-running-workout
  ↓
analyze-running-workout generates:
  - workout_analysis.performance (execution scores)
  - workout_analysis.narrative_insights (AI insights)
  - workout_analysis.detailed_analysis (structured breakdown)
  ↓
TodaysWorkoutsTab displays insights, mile-by-mile, intervals, red flags
```

---

## ✅ Key Requirements to Maintain During Refactoring

### Details Screen Requirements
1. ✅ Must continue to read from `computed.series` for charts
2. ✅ Must continue to read from `computed.analysis.splits` for splits table
3. ✅ Must continue to read from `computed.analysis.zones` for zone charts
4. ✅ Pace calculation formula must remain: `dt / (dd / 1000)` (distance/time delta)
5. ✅ No changes to data structure - all fields must remain compatible

### Summary Screen Requirements
1. ✅ Must continue to read from `workout_analysis.performance` for execution scores
2. ✅ Must continue to read from `computed.intervals` for planned vs completed table
3. ✅ Execution scores must remain: `execution_adherence`, `pace_adherence`, `duration_adherence`
4. ✅ Score calculation formulas must remain unchanged (40/30/30 or 50/50 weighting)
5. ✅ Performance assessment text must remain: "Excellent", "Good", "Fair", "Poor"

### Context Screen Requirements
1. ✅ Must continue to read from `workout_analysis.narrative_insights` for AI insights
2. ✅ Must continue to read from `workout_analysis.detailed_analysis` for structured breakdown
3. ✅ Must continue to read from `workout_analysis.detailed_analysis.mile_by_mile_terrain` for terrain breakdown
4. ✅ Must continue to read from `workout_analysis.detailed_analysis.interval_breakdown` for interval breakdown
5. ✅ AI narrative generation must continue to produce 3-4 factual observations
6. ✅ Mile-by-mile breakdown must only appear for continuous runs (not intervals)

---

## 🎯 Refactoring Goals

### What We're Refactoring
- Extract shared logic from `analyze-running-workout` into shared library
- Remove duplicate code between `analyze-running-workout` and `compute-workout-analysis`
- Create single source of truth for pace/duration calculations
- Split monolithic functions into smaller, testable modules

### What We're NOT Changing
- ❌ Data structures (all fields remain the same)
- ❌ Calculation formulas (all formulas remain the same)
- ❌ Screen display logic (all screens continue to work as-is)
- ❌ API contracts (all edge functions maintain same inputs/outputs)

---

## 📋 Verification Checklist

Before starting refactoring, verify:
- [x] Details screen reads from `computed.series`, `computed.analysis.splits`, `computed.analysis.zones`
- [x] Summary screen reads from `workout_analysis.performance`, `computed.intervals`
- [x] Context screen reads from `workout_analysis.narrative_insights`, `workout_analysis.detailed_analysis`
- [x] All three screens have distinct purposes and data sources
- [x] No screen depends on another screen's data (they're independent)
- [x] All formulas are documented and understood
- [x] All data structures are documented and understood

---

## ✅ Conclusion

**All three screens are independent and serve distinct purposes:**

1. **Details** = Raw data visualization (charts, splits, zones)
2. **Summary** = Execution scoring (planned vs completed)
3. **Context** = AI insights (narrative, detailed analysis)

**During refactoring, we will:**
- Extract shared utilities (sensor data extraction, pace calculation)
- Maintain all existing data structures
- Maintain all existing calculation formulas
- Ensure all screens continue to work exactly as before

**Ready to proceed with refactoring!** ✅

