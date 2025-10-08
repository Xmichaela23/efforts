# Component Interaction Map

## Main User Journeys

### 1. Strength Workout Journey
```
User opens app → AppLayout
├── Clicks "Plans" → AllPlansInterface
│   ├── Selects plan → Shows planned workouts
│   └── Clicks strength workout → Opens StrengthLogger
│       ├── Pre-populates with planned data
│       ├── User logs sets/reps/weight
│       └── Saves workout → Updates database
├── Workout appears in TodaysEffort
├── Calendar updates to show completed
└── User can view summary → UnifiedWorkoutView
    ├── Shows planned vs actual comparison
    └── Displays strength exercise details
```

### 2. Plan Management Journey
```
User opens app → AppLayout
├── Clicks "Plans" → AllPlansInterface
│   ├── Shows available plans
│   ├── User selects plan → Loads planned workouts
│   └── User can view plan details
└── Plan data flows to calendar and workout loggers
```

### 3. Workout Viewing Journey
```
User clicks workout → UnifiedWorkoutView
├── Planned tab → PlannedWorkoutView
├── Summary tab → WorkoutSummary
│   ├── Shows metrics and charts
│   └── For strength: Shows planned vs actual
└── Completed tab → CompletedTab
    └── Shows completed workout details
```

## Component Relationships

### AppLayout (Main Hub)
**Dependencies:**
- useAppContext (workouts, plans, user data)
- usePlannedWorkouts (planned workout data)
- Various UI components

**Manages:**
- Sidebar state
- Selected workout state
- Modal/dialog state
- Navigation between views

**Key Interactions:**
- Opens/closes workout loggers
- Shows/hides plan interface
- Manages workout selection
- Handles workout updates

### AllPlansInterface
**Dependencies:**
- usePlannedWorkouts
- Plan data from context

**Manages:**
- Plan selection
- Week navigation
- Planned workout display
- Plan details

**Key Interactions:**
- Loads planned workouts for selected plan
- Calculates current week based on start date
- Opens workout loggers with planned data
- Updates plan status

### StrengthLogger
**Dependencies:**
- useAppContext (addWorkout)
- usePlannedWorkouts (for pre-population)
- Planned workout data (optional)

**Manages:**
- Exercise logging
- Set/rep/weight tracking
- Session persistence
- Workout saving

**Key Interactions:**
- Pre-populates from planned workout
- Saves completed workout to database
- Triggers calendar updates
- Associates with planned workout

### UnifiedWorkoutView
**Dependencies:**
- usePlannedWorkouts (for planned data)
- Workout data from props
- Association logic

**Manages:**
- Tab navigation (Planned/Summary/Completed)
- Workout association
- Data display

**Key Interactions:**
- Fetches linked planned workout
- Passes data to child components
- Handles association/unassociation
- Updates workout status

### WorkoutCalendar
**Dependencies:**
- useAppContext (workouts)
- usePlannedWorkouts (planned workouts)
- Date navigation

**Manages:**
- Calendar display
- Workout indicators
- Date selection
- Navigation

**Key Interactions:**
- Shows planned workouts
- Shows completed workouts
- Updates when workouts change
- Handles date selection

## Data Flow Patterns

### 1. Planned Workout Selection
```
AllPlansInterface → StrengthLogger
├── Passes planned workout data
├── Pre-populates exercise list
└── Sets up association
```

### 2. Workout Completion
```
StrengthLogger → Database
├── Saves completed workout
├── Updates planned workout status
└── Triggers UI updates
```

### 3. Association Management
```
UnifiedWorkoutView → Database
├── Links planned to completed
├── Updates both records
└── Refreshes data
```

### 4. Summary Display
```
UnifiedWorkoutView → StrengthCompletedView
├── Passes completed workout
├── Passes planned workout
└── Shows comparison
```

## State Management Patterns

### Global State (Context)
- **Workouts** - All completed workouts
- **Planned Workouts** - All planned workouts
- **Plans** - Training plans
- **User Data** - User preferences and settings

### Local State
- **UI State** - Modals, dropdowns, forms
- **Selection State** - Selected workouts, plans
- **Form State** - User input, validation

### Derived State
- **Calendar Data** - Computed from workouts + planned
- **Summary Data** - Computed from completed + planned
- **Association Data** - Computed from both sources

## Integration Points

### Database Operations
- **CRUD Operations** - useWorkouts hook
- **Planned Workouts** - usePlannedWorkouts hook
- **Real-time Updates** - Supabase subscriptions

### External Integrations
- **Garmin** - GarminAutoSync component
- **Strava** - StravaCallback component
- **File Import** - FitFileImporter component

### UI Updates
- **Calendar** - Updates when workouts change
- **Today's Effort** - Updates when workouts complete
- **Summary** - Updates when associations change

## Current Issues

### Data Flow Issues
1. **Context vs Direct Fetch** - Inconsistent data sources
2. **Association Logic** - Complex and error-prone
3. **State Synchronization** - Multiple sources of truth

### Component Issues
1. **Large Components** - Doing too many things
2. **Tight Coupling** - Hard to test and maintain
3. **State Management** - Scattered and inconsistent

### Integration Issues
1. **Provider Conflicts** - Garmin vs Strava data
2. **Session Persistence** - Inconsistent patterns
3. **Error Handling** - Incomplete error states

## Recommendations

### Immediate Fixes
1. **Standardize Data Flow** - Use context consistently
2. **Simplify Association** - Single source of truth
3. **Fix State Management** - Centralize related state

### Architectural Improvements
1. **Component Separation** - Break down large components
2. **Data Layer** - Abstract database operations
3. **Error Boundaries** - Better error handling

### Future Considerations
1. **Testing Strategy** - Component isolation
2. **Performance** - Reduce unnecessary re-renders
3. **AI Integration** - Clean data foundation

This map provides a detailed view of how components interact and where the current issues lie.
