# System Architecture Diagram

## The Four Systems in Efforts App

```
┌─────────────────────────────────────────────────────────────────┐
│                        EFFORTS APP SYSTEMS                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │   PLANNED       │    │   COMPLETED     │    │   OPTIONAL   │ │
│  │   WORKOUTS      │    │   WORKOUTS      │    │   WORKOUTS   │ │
│  │                 │    │                 │    │              │ │
│  │ • Base layer    │    │ • User logs     │    │ • Hidden     │ │
│  │ • Training plan │    │ • Garmin sync   │    │ • Until      │ │
│  │ • All types     │    │ • All types     │    │   activated  │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
│           │                       │                       │     │
│           │                       │                       │     │
│           ▼                       ▼                       ▼     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              AUTO-ATTACHMENT SYSTEM                        │ │
│  │                                                             │ │
│  │  When workout completed:                                    │ │
│  │  1. Find matching planned workout (±2 days, same type)     │ │
│  │  2. Link both ways: planned_id ↔ completed_workout_id     │ │
│  │  3. Trigger backend math: compute-workout-summary          │ │
│  │  4. Generate comparison: Planned vs Executed segments      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                │                                │
│                                ▼                                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                BACKEND MATH SYSTEM                         │ │
│  │                                                             │ │
│  │  compute-workout-summary:                                   │ │
│  │  • Segment matching (warm-up, intervals, cool-down)        │ │
│  │  • Pace comparison (planned vs executed)                   │ │
│  │  • Time analysis (planned vs actual duration)             │ │
│  │  • Heart rate zones (planned vs actual BPM)               │ │
│  │                                                             │ │
│  │  Result: Summary tab shows side-by-side comparison         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                │                                │
│                                ▼                                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    UI SYSTEMS                              │ │
│  │                                                             │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │ │
│  │  │   TODAY'S   │  │  CALENDAR   │  │   STRENGTH LOGGER   │  │ │
│  │  │   EFFORTS   │  │             │  │                     │  │ │
│  │  │             │  │             │  │                     │  │ │
│  │  │ • Shows     │  │ • Shows     │  │ • Shows planned     │  │ │
│  │  │   activated │  │   activated │  │   workouts for      │  │ │
│  │  │   workouts  │  │   workouts  │  │   scheduling        │  │ │
│  │  │ • Hides     │  │ • Hides     │  │ • Populates logger  │  │ │
│  │  │   optional  │  │   optional  │  │   with exercises    │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Plan Creation
```
JSON Plan → Plan Baker → planned_workouts table
├── Regular workouts: Always visible
├── Optional workouts: Tagged 'optional' (hidden)
└── Strength workouts: Available for scheduling
```

### 2. Workout Completion
```
User Completes Workout → Auto-Attachment System
├── Find matching planned workout
├── Link planned ↔ completed
├── Trigger backend math
└── Generate comparison data
```

### 3. Optional Workout Activation
```
User Clicks "Add to week" → Optional System
├── Remove 'optional' tag
├── Add 'opt_active' tag
├── Show in Today's Efforts
└── Show in Calendar
```

### 4. Strength Workout Scheduling
```
User Opens Strength Logger → Scheduling System
├── Show planned workouts in dropdown
├── User selects workout
├── Populate logger with exercises
└── Allow logging on different day
```

## Critical Dependencies

### Auto-Attachment Requires:
- ✅ Completed planned workouts in `usePlannedWorkouts()` context
- ✅ Matching date/type within ±2 days
- ✅ Both records exist in database
- ✅ Edge Functions working (`compute-workout-summary`)

### Summary Comparison Requires:
- ✅ Auto-attachment completed successfully
- ✅ Backend math system triggered
- ✅ Database has comparison data
- ✅ UI can access linked planned workout

### Optional Workouts Require:
- ✅ `usePlannedWorkouts()` filters out 'optional' tag
- ✅ `TodaysEffort` only shows activated workouts
- ✅ `WorkoutCalendar` hides optional workouts
- ✅ Activation system working

## Common Issues & Solutions

### "Source: waiting for server"
**Cause**: Auto-attachment not working
**Fix**: Check `usePlannedWorkouts()` includes completed planned workouts

### Empty Comparison Table
**Cause**: Backend math system failed
**Fix**: Check Edge Functions are running, auto-attachment completed

### Optional Workouts Showing
**Cause**: Filtering not working
**Fix**: Check 'optional' tag filtering in all components

### Strength Logger Empty
**Cause**: No planned workouts in context
**Fix**: Check `usePlannedWorkouts()` is loading data

---

**This diagram shows how the four systems work together to create the complete planned workout experience in Efforts.**
