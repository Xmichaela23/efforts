# Planned Workouts System - Complete Guide

## Overview
The planned workouts system manages training plans, workout associations, and data flow between planned and completed workouts. This document explains how the entire system works after recent architectural improvements.

## Core Architecture

### The Different "Options" in Efforts App

#### 1. **Optional Workouts** (Plan-Level Choices)
**What they are**: Workouts in your training plan marked as optional
**Examples**: 
- "Optional — Endurance 50 min (Z2) Active recovery"
- "Optional — Technique Swim"
- Future strength workouts (when added)

**How they work**:
- **Hidden by default** - Don't appear in Today's Efforts or Calendar
- **Activation**: User clicks "Add to week" → removes 'optional' tag → becomes visible
- **Deactivation**: User clicks "Remove" → adds 'optional' tag back → hidden again
- **Tag system**: `optional` (hidden) ↔ `opt_active` (visible)

**Purpose**: Let users customize their week by choosing which optional sessions to include

#### 2. **Strength Logger "Workouts • Add-ons" Dropdown** (Scheduling Choices)
**What they are**: Planned strength workouts you can select to do on different days
**Examples**:
- "Tuesday — Squat & Bench" (scheduled for Tuesday)
- "Thursday — Deadlift & OHP" (scheduled for Thursday)

**How they work**:
- **Shows planned workouts** from your training plan
- **Purpose**: Schedule strength workouts on different days than planned
- **Function**: Populates the logger with exercises and weight loads
- **Not about completion** - it's about scheduling/rescheduling

**Example flow**:
1. You have a strength workout planned for Tuesday
2. You want to do it on Friday instead
3. Open Strength Logger on Friday
4. Click "Workouts • Add-ons"
5. Select "Tuesday — Squat & Bench"
6. Logger populates with exercises and weights
7. You log the workout on Friday

#### 3. **XOR Options** (Either/Or Choices)
**What they are**: Mutually exclusive workout choices
**Example**: "Swim OR Quality Bike" - you can choose one, not both

**How they work**:
- **Swim selection**: Hides quality bike, shows swim
- **Quality bike selection**: Hides swim, shows quality bike
- **Reversible**: You can switch between choices
- **Weekly cap**: Maximum 1 quality bike per week

#### 4. **Workout Status Options** (Completion States)
**What they are**: Different states a planned workout can be in
**States**:
- **`planned`**: Default state, ready to do
- **`completed`**: Done and linked to a completed workout
- **`in_progress`**: Currently being logged
- **`skipped`**: User chose to skip this workout

#### 5. **Association Options** (Linking Completed to Planned)
**What they are**: Ways to link completed workouts to planned workouts
**Types**:
- **Auto-attachment**: Automatic linking when workout is completed
- **Manual association**: User manually links via AssociatePlannedDialog
- **Re-association**: Changing which planned workout a completed workout is linked to

### The Four Systems (How They Work Together)

#### 1. **Planned Workout System** (Base Layer)
- **Purpose**: Store training plan sessions
- **Data**: `planned_workouts` table with workout details
- **Status**: `planned`, `completed`, `in_progress`, `skipped`

#### 2. **Auto-Attachment System** (Critical Math Layer)
- **Purpose**: Link completed workouts to planned workouts for comparison
- **Trigger**: When workout is completed (Garmin sync, manual logging)
- **Result**: Enables segment-by-segment comparison in Summary tab
- **Backend**: Triggers `compute-workout-summary` and `compute-workout-analysis`

#### 3. **Optional Workout System** (UI Layer)
- **Purpose**: Hide optional workouts until user activates them
- **Tag**: `optional` (hidden) → `opt_active` (visible)
- **Scope**: Rides, swims, future strength workouts
- **UI**: Only appears in Today's Efforts and Calendar when activated

#### 4. **Strength Logger System** (Scheduling Layer)
- **Purpose**: Allow users to select planned workouts for different days
- **Function**: Populates logger with exercises and weight loads
- **Scope**: Strength workouts only (currently)
- **Future**: Will expand to endurance workouts

### Database Tables

#### `planned_workouts` Table
```sql
-- Core planned workout data
id, user_id, name, type, date, description, duration
workout_status ('planned' | 'completed' | 'in_progress' | 'skipped')
training_plan_id, week_number, day_number
strength_exercises (JSONB), intervals (JSONB), tags (JSONB)
computed (JSONB), completed_workout_id (UUID)
created_at, updated_at
```

#### `workouts` Table  
```sql
-- Completed workout data
id, user_id, name, type, date, description, duration
workout_status ('planned' | 'completed' | 'in_progress' | 'skipped')
planned_id (UUID), strength_exercises (JSONB), intervals (JSONB)
computed (JSONB), sensor_data (JSONB), gps_track (JSONB)
created_at, updated_at
```

### Key Relationships
- **One-to-One**: `planned_workouts.completed_workout_id` ↔ `workouts.id`
- **One-to-One**: `workouts.planned_id` ↔ `planned_workouts.id`
- **One-to-Many**: `training_plans` → `planned_workouts` (via `training_plan_id`)

## Data Flow Architecture

### 1. Plan Creation & Baking
```
JSON Plan → Plan Baker → planned_workouts table
├── Week-by-week materialization
├── User baseline integration
├── Computed data generation
└── Status: 'planned'
```

### 2. Workout Association Flow
```
User Completes Workout → Association Logic
├── autoAttachPlannedSession() runs
├── Finds matching planned workout by date/type
├── Updates planned_workouts.workout_status = 'completed'
├── Sets planned_workouts.completed_workout_id = workout.id
├── Sets workouts.planned_id = planned_workout.id
└── Triggers cache invalidation
```

### 3. UI Data Sources
```
Multiple Hooks & Contexts
├── usePlannedWorkouts() - Global planned workout context
├── usePlannedRange() - Calendar-specific planned workouts  
├── useWorkouts() - Completed workout management
└── Cache invalidation events
```

## Core Hooks & Contexts

### `usePlannedWorkouts` Hook
**Purpose**: Global context for all planned workouts
**Data Source**: `planned_workouts` table
**Filtering**: Excludes `optional` and `completed` workouts by default
**Caching**: React Query with 6-hour TTL
**Usage**: StrengthLogger dropdown, workout selection

```typescript
const { plannedWorkouts, loading } = usePlannedWorkouts();
// Returns: Planned workouts available for selection
```

### `usePlannedRange` Hook  
**Purpose**: Calendar-specific planned workouts for date ranges
**Data Source**: `planned_workouts` + `workouts` tables (merged)
**Filtering**: Shows completed workouts as "completed" status
**Caching**: Memory cache + localStorage with TTL
**Usage**: Calendar display, Today's Efforts

```typescript
const { rows: plannedWeekRows } = usePlannedRange(fromISO, toISO);
// Returns: Merged planned + completed workouts for calendar
```

### `useWorkouts` Hook
**Purpose**: Completed workout management and auto-association
**Data Source**: `workouts` table
**Features**: CRUD operations, auto-attach logic, cache invalidation
**Usage**: Workout logging, summary displays

```typescript
const { workouts, addWorkout, updateWorkout, deleteWorkout } = useWorkouts();
// Returns: Completed workouts with auto-association
```

## Auto-Association Logic (Critical Backend Math System)

### `autoAttachPlannedSession` Function
**Location**: `src/hooks/useWorkouts.ts`
**Purpose**: Links completed workouts to planned workouts for comparison
**Trigger**: After workout completion (Garmin sync, manual logging)
**Process**:
1. Query `planned_workouts` for matching date/type within ±2 days
2. Filter out already-linked completed workouts
3. Update planned workout status to 'completed'
4. Link planned ↔ completed workout records both ways
5. **Trigger backend math system** for segment-by-segment comparison
6. Dispatch cache invalidation events

### Backend Math System (Segment Comparison)
**Purpose**: Compare each portion of endurance workouts to planned portions
**Edge Functions Triggered**:
- **`compute-workout-summary`**: Compares planned vs executed segments
- **`compute-workout-analysis`**: Generates analytics and derived metrics

**What It Does**:
- **Segment Matching**: Matches warm-up, intervals, cool-down segments
- **Pace Comparison**: Planned pace vs executed pace for each segment
- **Time Analysis**: Planned duration vs actual duration
- **Heart Rate Zones**: Planned vs actual BPM for each segment
- **Summary Table**: Shows side-by-side comparison in Summary tab

**Example Output**:
```
Planned Pace    | Executed Pace | Time  | BPM
Warm-up         | 10:30/mi     | 12:00 | 140
7:43/mi         | 7:45/mi      | 3:52  | 165
Jog             | 10:15/mi     | 2:00  | 145
7:43/mi         | 7:40/mi      | 3:50  | 168
...
```

**Critical**: This system only works when completed workouts are properly linked to planned workouts via auto-attachment.

```typescript
// Query includes completed planned workouts for association
const { data: planned } = await supabase
  .from('planned_workouts')
  .select('id,user_id,type,date,name,workout_status,completed_workout_id')
  .eq('user_id', user.id)
  .eq('type', workout.type)
  .gte('date', searchStart)
  .lte('date', searchEnd)
  .in('workout_status', ['planned', 'in_progress', 'completed']);
```

## Cache Management

### Cache Layers
1. **React Query Cache**: Global planned workouts context
2. **Memory Cache**: `usePlannedRange` hook caching
3. **localStorage**: Persistent planned range cache
4. **Service Worker Cache**: Browser-level caching

### Cache Invalidation Events
```typescript
// Global invalidation
window.dispatchEvent(new CustomEvent('planned:invalidate'));
window.dispatchEvent(new CustomEvent('workouts:invalidate'));

// Specific cache clearing
const keys = Object.keys(localStorage);
keys.forEach(key => {
  if (key.includes('plannedRange')) {
    localStorage.removeItem(key);
  }
});
```

### Cache Invalidation Triggers
- Workout completion/deletion
- Planned workout status changes
- Manual cache clear operations
- User authentication changes

## Component Integration

### StrengthLogger Component
**Planned Workout Selection**:
- Uses `usePlannedWorkouts()` context
- Filters to strength workouts in current week
- Excludes completed workouts from dropdown
- Pre-fills exercise data from planned workout

**Data Flow**:
```
StrengthLogger → usePlannedWorkouts → planned_workouts table
├── Filter: type='strength', date=current_week
├── Filter: workout_status != 'completed'  
├── Display in "Workouts • Add-ons" dropdown
└── Pre-fill exercise data on selection
```

### Calendar Component
**Planned Workout Display**:
- Uses `usePlannedRange()` for week-specific data
- Shows planned workouts as "planned" status
- Shows completed workouts as "completed" status
- Handles week navigation and caching

**Data Flow**:
```
WorkoutCalendar → usePlannedRange → planned_workouts + workouts
├── Query: date range for visible week
├── Merge: planned + completed workouts
├── Display: status-based styling
└── Cache: week-specific data
```

### Today's Efforts Component
**Planned Workout Summary**:
- Uses `usePlannedWorkouts()` context
- Filters to current date
- Shows planned workouts for today
- Integrates with calendar navigation

## Status Management

### Planned Workout Statuses
- **`planned`**: Default status, available for selection
- **`completed`**: Linked to completed workout, hidden from selection
- **`in_progress`**: Currently being logged
- **`skipped`**: User skipped this planned workout

### Status Transitions
```
planned → in_progress (user starts logging)
in_progress → completed (workout saved)
planned → skipped (user skips workout)
completed → planned (unlink from completed workout)
```

## Recent Fixes & Improvements

### 1. Auto-Association Fix
**Problem**: Completed planned workouts weren't being found for association
**Solution**: Updated query to include `'completed'` status in planned workout search
**Files**: `src/hooks/useWorkouts.ts`

### 2. Cache Invalidation Fix  
**Problem**: Deleted workouts persisted in UI due to cache layers
**Solution**: Added comprehensive cache clearing and invalidation events
**Files**: `src/hooks/usePlannedRange.ts`, `src/components/StrengthLogger.tsx`

### 3. UI Filtering Fix
**Problem**: Completed workouts appeared in selection dropdowns
**Solution**: Explicit filtering to hide completed workouts from UI
**Files**: `src/components/StrengthLogger.tsx`

### 4. Data Structure Fix
**Problem**: 400 Bad Request errors during auto-attach
**Solution**: Simplified query to only select essential columns
**Files**: `src/hooks/useWorkouts.ts`

## Debugging & Troubleshooting

### Critical: Auto-Attachment System Issues

#### 1. **Summary Tab Shows "Source: waiting for server"**
**Cause**: Auto-attachment not working, completed workout not linked to planned workout
**Check**:
- Completed workout has `planned_id` field
- Planned workout has `completed_workout_id` field
- Both records exist in database
- `usePlannedWorkouts()` includes completed planned workouts

**Debug Commands**:
```typescript
// Check if workout is linked
console.log('Completed workout planned_id:', workout.planned_id);
console.log('Planned workouts in context:', plannedWorkouts.length);

// Check auto-attachment logs
// Look for: "🔍 Auto-attach debugging for workout:"
// Look for: "🔍 Auto-attach found planned workouts:"
```

#### 2. **Summary Tab Shows Empty Comparison Table**
**Cause**: Backend math system not triggered or failed
**Check**:
- Auto-attachment completed successfully
- `compute-workout-summary` Edge Function ran
- `compute-workout-analysis` Edge Function ran
- Database has comparison data

**Debug Commands**:
```typescript
// Check if Edge Functions were called
// Look for: "⚠️ compute-workout-summary invoke failed"
// Look for: "ℹ️ compute-workout-analysis invoke skipped"
```

#### 3. **Planned Workout Not Showing in Dropdown**
**Check**:
- `usePlannedWorkouts()` context loading
- Workout type matches ('strength')
- Date is within current week
- Status is not 'completed'
- **Not tagged as 'optional'**

#### 4. **Optional Workouts Showing in Today's Efforts**
**Cause**: Filtering not working properly
**Check**:
- `usePlannedWorkouts()` filters out optional workouts
- `TodaysEffort` only shows activated workouts
- Workout has 'optional' tag, not 'opt_active'

#### 5. **Cache Persistence Issues**
**Check**:
- Cache invalidation events dispatched
- localStorage cleared for plannedRange keys
- React Query cache invalidated
- Page reload after cache clear

### Debug Logging
```typescript
// Add to components for debugging
console.log('🔍 Planned workouts debug:', {
  total: plannedWorkouts?.length || 0,
  strength: allStrength.length,
  inWeek: inWeek.length,
  notCompleted: notCompleted.length
});
```

## Best Practices

### 1. Use Appropriate Hooks
- **Global planned data**: `usePlannedWorkouts()`
- **Calendar/range data**: `usePlannedRange()`
- **Completed workouts**: `useWorkouts()`

### 2. Handle Cache Invalidation
- Always dispatch invalidation events after data changes
- Clear specific cache layers when needed
- Use React Query's built-in invalidation

### 3. Filter Data Appropriately
- Hide completed workouts from selection UI
- Show all statuses in calendar/context
- Use consistent filtering logic

### 4. Error Handling
- Handle 400 Bad Request errors gracefully
- Provide fallbacks for missing data
- Log errors for debugging

## Future Improvements

### 1. Real-time Updates
- WebSocket integration for live updates
- Optimistic UI updates
- Conflict resolution

### 2. Advanced Caching
- Smarter cache invalidation
- Predictive data loading
- Offline support

### 3. Performance Optimization
- Lazy loading for large datasets
- Virtual scrolling for long lists
- Memoization for expensive operations

---

**Last Updated**: January 2025
**Status**: ✅ Production Ready
**Next Review**: After major planned workout feature additions
