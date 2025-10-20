# Edge Functions Reference

## Overview
This document provides a quick reference for all edge functions in the workout analysis system, organized by purpose and responsibility.

## 🎯 Core Analysis Functions

### 1. `analyze-workout` - Master Orchestrator
**Purpose:** Master orchestrator for all workout analysis  
**Status:** ✅ IMPLEMENTED  
**Client Usage:** `supabase.functions.invoke('analyze-workout', { body: { workout_id } })`

**What it does:**
- Routes workouts to appropriate sport-specific analyzers
- Orchestrates compute-workout-summary and calculate-workout-metrics
- Handles all business logic server-side (smart server architecture)
- Formats responses consistently across all workout types

**Supported Types:**
- `run/running` → `analyze-running-workout`
- `ride/cycling/bike` → `analyze-cycling-workout` (future)
- `swim/swimming` → `analyze-swimming-workout` (future)
- `strength/strength_training` → `analyze-strength-workout`

**Data Flow:**
```
Client → analyze-workout → compute-workout-summary → calculate-workout-metrics → sport-specific-analyzer → workouts.workout_analysis
```

---

### 2. `analyze-running-workout` - Running Analysis
**Purpose:** Granular adherence analysis for running workouts  
**Status:** ✅ IMPLEMENTED  
**Called by:** `analyze-workout` (master orchestrator)

**What it does:**
- Analyzes running workouts with prescribed pace/power ranges
- Calculates time-in-prescribed-range (not just averages)
- Provides interval-by-interval execution breakdown
- Detects patterns: too fast, fading, inconsistent pacing
- Generates honest execution grades (A/B/C/D/F)

**Key Features:**
- Uses prescribed ranges from `planned_workouts.intervals`
- Time-based analysis (how much TIME spent in range)
- Context-aware grading (stricter for intervals, lenient for warmup)
- GPS spike and outlier detection
- Gap handling and interpolation for sensor data

**Output:**
- `adherence_percentage`: % of time spent in prescribed ranges
- `interval_breakdown`: per-interval execution quality
- `execution_grade`: honest A-F grade
- `primary_issues`: specific problems identified
- `strengths`: positive execution patterns

---

### 3. `analyze-strength-workout` - Strength Analysis
**Purpose:** Comprehensive strength workout analysis  
**Status:** ✅ IMPLEMENTED  
**Called by:** `analyze-workout` (master orchestrator)

**What it does:**
- Analyzes strength exercises with RIR, weight, and reps
- Compares executed vs planned workout targets
- Provides historical progression analysis
- Handles unit conversion (kg/lbs) based on user preferences
- Generates plan-focused insights using GPT-4

**Key Features:**
- Enhanced plan context integration
- Phase-based progression understanding
- Endurance integration context
- Exercise rotation and deload week handling

---

## 📊 Data Processing Functions

### 4. `compute-workout-summary` - Data Foundation
**Purpose:** Normalize sensor data and compute basic metrics  
**Status:** ✅ EXISTING (kept as-is)  
**Called by:** `analyze-workout` (master orchestrator)

**What it does:**
- Normalizes sensor data from Garmin/Strava/manual
- Handles missing/corrupted samples
- Interpolates gaps < 10 seconds
- Filters GPS spikes
- Calculates basic metrics (distance, duration, pace, power, HR)
- Stores results in `workouts.computed`

**Data Flow:**
```
Raw Sensor Data → compute-workout-summary → workouts.computed
```

---

### 5. `calculate-workout-metrics` - Metrics Calculator
**Purpose:** Server-side calculation of all workout metrics and comparisons  
**Status:** ✅ IMPLEMENTED  
**Called by:** `analyze-workout` (master orchestrator)

**What it does:**
- Calculates comprehensive workout metrics server-side
- Computes planned vs executed comparisons (percentages, deltas)
- Handles all mathematical operations (no client-side math)
- Supports all workout types (run, bike, swim, strength)
- Stores results in `workouts.calculated_metrics`

**Key Features:**
- Smart server, dumb client architecture
- All percentage calculations server-side
- All delta calculations server-side
- All unit conversions server-side
- Planned vs executed adherence metrics

**Metrics Calculated:**
- Basic: distance, duration, elevation, speed, pace
- Power: avg, max, normalized, intensity factor, variability
- Heart rate: avg, max, zones
- Cadence: avg, max (running/cycling)
- Execution: adherence percentages, deltas, scores

---

## 🧠 Context Analysis Functions

### 6. `generate-overall-context` - Multi-Discipline Analysis
**Purpose:** Generate AI-powered overall training analysis for Context view  
**Status:** ✅ EXISTING (kept as-is)  
**Called by:** Context tabs (Daily, Weekly, Block)

**What it does:**
- Queries last N weeks of completed workouts and planned workouts
- Aggregates data by week and discipline (runs, bikes, swims, strength)
- Tracks strength lift progression and compares to 1RM baselines
- Calculates performance trends and plan adherence metrics
- Calls GPT-4 to generate three-section analysis

**Analysis Sections:**
1. **Performance Trends** - pace/power/strength progression over time
2. **Plan Adherence** - completion rates and consistency
3. **Weekly Summary** - most recent week performance vs plan

**Multi-Discipline Support:**
- Automatically includes all disciplines the athlete trains
- Adapts prompts based on available data
- Handles planned vs unplanned workout scenarios

---

## 🔄 Future Functions (Ready for Implementation)

### 7. `analyze-cycling-workout` - Cycling Analysis
**Purpose:** Granular adherence analysis for cycling workouts  
**Status:** 🔄 READY (needs implementation)  
**Will be called by:** `analyze-workout` (master orchestrator)

**Planned Features:**
- Power-based adherence analysis
- Cadence analysis
- Heart rate zone analysis
- Climbing vs flat performance
- Power distribution analysis

---

### 8. `analyze-swimming-workout` - Swimming Analysis
**Purpose:** Granular adherence analysis for swimming workouts  
**Status:** 🔄 READY (needs implementation)  
**Will be called by:** `analyze-workout` (master orchestrator)

**Planned Features:**
- Pace-based adherence analysis
- Stroke rate analysis
- Heart rate zone analysis
- Pool vs open water analysis
- Technique metrics analysis

---

## 🏗️ Architecture Summary

### Smart Server, Dumb Client
- **Client:** Only calls `analyze-workout` (one function call)
- **Server:** All business logic, routing, orchestration, calculations

### Data Flow
```
Raw Sensor Data → compute-workout-summary → workouts.computed
workouts.computed → calculate-workout-metrics → workouts.calculated_metrics
workouts.computed → analyze-running-workout → workouts.workout_analysis
Client → analyze-workout → routes to appropriate analyzer
```

### Function Dependencies
```
analyze-workout (master)
├── compute-workout-summary (foundation)
├── calculate-workout-metrics (metrics)
└── sport-specific-analyzer
    ├── analyze-running-workout ✅
    ├── analyze-strength-workout ✅
    ├── analyze-cycling-workout 🔄
    └── analyze-swimming-workout 🔄
```

## 🚀 Deployment Order

1. **Deploy core functions:**
   ```bash
   supabase functions deploy analyze-workout
   supabase functions deploy analyze-running-workout
   supabase functions deploy calculate-workout-metrics
   ```

2. **Verify existing functions:**
   ```bash
   supabase functions deploy compute-workout-summary
   supabase functions deploy analyze-strength-workout
   supabase functions deploy generate-overall-context
   ```

3. **Future deployments:**
   ```bash
   supabase functions deploy analyze-cycling-workout
   supabase functions deploy analyze-swimming-workout
   ```

## 📝 Notes

- All functions follow "smart server, dumb client" architecture
- Client only calls `analyze-workout` (master orchestrator)
- All business logic happens server-side
- Functions are designed to be independent and testable
- Easy to add new disciplines by creating new analyzer functions
