# Optional Workouts System - Complete Architecture

## Overview
The optional workouts system allows users to selectively activate optional training sessions from their plans. Optional workouts are hidden by default and only appear in Today's Efforts and Calendar when explicitly selected by the user.

## Core Architecture

### Database Schema
```sql
-- planned_workouts table
planned_workouts {
  id, user_id, name, type, date, description, duration
  workout_status ('planned' | 'completed' | 'in_progress' | 'skipped')
  tags (JSONB) -- Contains 'optional' tag for optional workouts
  training_plan_id, week_number, day_number
  strength_exercises (JSONB), intervals (JSONB)
  computed (JSONB), completed_workout_id (UUID)
}
```

### Tag System
- **`optional`**: Workout is optional and hidden by default
- **`opt_active`**: Optional workout has been activated by user
- **`xor:swim_or_quality_bike`**: XOR group for swim vs quality bike selection
- **`bike_intensity`**: Quality bike workout tag
- **`recovery`**: Recovery workout tag

## Data Flow Architecture

### 1. Plan Creation
```
JSON Plan → Plan Baker → planned_workouts table
├── Optional workouts tagged with 'optional'
├── XOR groups tagged with 'xor:swim_or_quality_bike'
├── Quality workouts tagged with 'bike_intensity'
└── Status: 'planned'
```

### 2. Optional Workout Activation
```
User Clicks "Add to week" → activateOptional()
├── Remove 'optional' tag
├── Add 'opt_active' tag
├── Apply weekly quality cap (1 quality bike/week)
├── Apply spacing guards (24h before long run/ride)
├── Handle XOR swaps (swim ↔ quality bike)
└── Update database + local state
```

### 3. Optional Workout Deactivation
```
User Clicks "Remove" → deactivateOptional()
├── Remove 'opt_active' tag
├── Add 'optional' tag back
├── Reverse XOR swaps if applicable
└── Update database + local state
```

## Component Architecture

### 1. AllPlansInterface Component
**Purpose**: Plan selection and optional workout management
**Key Functions**:
- `activateOptional(workout)`: Activates optional workout
- `deactivateOptional(workout)`: Deactivates optional workout
- Handles XOR logic and spacing constraints
- Manages weekly quality caps

**Activation Logic**:
```typescript
async function activateOptional(workout: any) {
  // 1. Remove 'optional' tag, add 'opt_active'
  // 2. Check weekly quality cap (1 quality bike/week)
  // 3. Apply spacing guards (24h before long run/ride)
  // 4. Handle XOR swaps (swim ↔ quality bike)
  // 5. Update database
  // 6. Dispatch invalidation events
}
```

### 2. WorkoutCalendar Component
**Purpose**: Calendar display with optional workout filtering
**Key Logic**:
```typescript
// Filter out optional planned rows entirely
const allFiltered = all.filter((w: any) => {
  const tags = parseTags(w.tags);
  // Hide optional planned rows entirely
  if (tags.includes('optional')) return false;
  return true;
});
```

**Behavior**:
- **Optional workouts**: Hidden from calendar until activated
- **Activated workouts**: Show in calendar with normal styling
- **Completed workouts**: Show with checkmark

### 3. TodaysEffort Component
**Purpose**: Today's workout display with optional workout handling
**Key Logic**:
```typescript
// Split into activated (no 'optional') and optional
const activated = dateWorkoutsMemo.filter((w:any)=> 
  !(Array.isArray(w?.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional'))
);
const optionals = dateWorkoutsMemo.filter((w:any)=> 
  Array.isArray(w?.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional')
);
setDisplayWorkouts([...activated, ...optionals]);
```

**Behavior**:
- **Activated workouts**: Show in Today's Efforts
- **Optional workouts**: Show in Today's Efforts (but shouldn't appear unless activated)
- **Completed workouts**: Show with completion status

### 4. usePlannedWorkouts Hook
**Purpose**: Global planned workout context
**Current State**: **BROKEN** - Shows all workouts including optional ones
**Should Be**: Filter out optional workouts from global context

**Current Code** (Line 49):
```typescript
// Don't filter anything - show all planned workouts
const transformedWorkouts: PlannedWorkout[] = (data || [])
```

**Should Be**:
```typescript
// Filter out optional workouts from global context
const transformedWorkouts: PlannedWorkout[] = (data || [])
  .filter(workout => {
    const tags = parseTags(workout.tags);
    return !tags.includes('optional');
  })
```

### 5. usePlannedRange Hook
**Purpose**: Calendar-specific planned workouts
**Current State**: **CORRECT** - Filters out optional workouts
**Behavior**: Only shows activated workouts in calendar

## The Current Problem

### Issue 1: usePlannedWorkouts Shows Optional Workouts
**Problem**: `usePlannedWorkouts` hook shows all workouts including optional ones
**Impact**: Optional workouts appear in StrengthLogger dropdown and other UI components
**Fix**: Add filtering to exclude optional workouts from global context

### Issue 2: TodaysEffort Shows Optional Workouts
**Problem**: `TodaysEffort` shows optional workouts even when not activated
**Impact**: Optional workouts appear in Today's Efforts without being selected
**Fix**: Only show activated workouts in Today's Efforts

### Issue 3: Inconsistent Filtering
**Problem**: Different components have different filtering logic
**Impact**: Optional workouts appear in some places but not others
**Fix**: Standardize filtering logic across all components

## Correct System Behavior

### 1. Optional Workouts (Not Activated)
- **Hidden from**: Calendar, Today's Efforts, StrengthLogger dropdown
- **Visible in**: AllPlansInterface plan view (with "Add to week" button)
- **Status**: Tagged with 'optional', not 'opt_active'

### 2. Optional Workouts (Activated)
- **Visible in**: Calendar, Today's Efforts, StrengthLogger dropdown
- **Status**: Tagged with 'opt_active', not 'optional'
- **Behavior**: Same as regular planned workouts

### 3. Regular Planned Workouts
- **Visible in**: Calendar, Today's Efforts, StrengthLogger dropdown
- **Status**: No 'optional' or 'opt_active' tags
- **Behavior**: Always visible

## Required Fixes

### 1. Fix usePlannedWorkouts Hook
```typescript
// Add filtering to exclude optional workouts
const transformedWorkouts: PlannedWorkout[] = (data || [])
  .filter(workout => {
    const tags = parseTags(workout.tags);
    return !tags.includes('optional');
  })
  .map(workout => {
    // ... existing transformation logic
  });
```

### 2. Fix TodaysEffort Component
```typescript
// Only show activated workouts
const activated = dateWorkoutsMemo.filter((w:any)=> 
  !(Array.isArray(w?.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional'))
);
// Don't show optional workouts at all
setDisplayWorkouts([...activated]);
```

### 3. Fix StrengthLogger Component
```typescript
// Filter out optional workouts from dropdown
const notOptional = inWeek.filter(w=> 
  !(Array.isArray(w?.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional'))
);
```

## XOR System (Swim vs Quality Bike)

### XOR Logic
- **XOR Tag**: `xor:swim_or_quality_bike`
- **Swim Selection**: Hides quality bike, shows swim
- **Quality Bike Selection**: Hides swim, shows quality bike
- **Reversible**: User can switch between options

### XOR Implementation
```typescript
// When swim is selected
if (workout.tags.includes('xor:swim_or_quality_bike')) {
  // Hide quality bike workouts
  // Show swim workouts
}

// When quality bike is selected
if (workout.tags.includes('bike_intensity')) {
  // Hide swim workouts
  // Show quality bike workouts
}
```

## Weekly Quality Cap

### Quality Cap Logic
- **Limit**: 1 quality bike workout per week
- **Enforcement**: When activating quality bike, check if already have one
- **Fallback**: Move to next available day if cap exceeded

### Quality Cap Implementation
```typescript
// Check weekly quality cap
const weeklyQualityCount = weekRows.filter(w => 
  w.tags.includes('bike_intensity') && w.tags.includes('opt_active')
).length;

if (weeklyQualityCount >= 1) {
  // Move to next day or show error
}
```

## Spacing Guards

### Spacing Logic
- **Minimum**: 24 hours before long run/ride
- **Preferred**: 48 hours before long run/ride
- **Enforcement**: When activating workout, check spacing against long days

### Spacing Implementation
```typescript
// Check spacing before long run/ride
const longDays = weekRows.filter(w => 
  w.tags.includes('long_run') || w.tags.includes('long_ride')
);

const spacingViolation = longDays.some(longDay => 
  Math.abs(dayDifference(workout.date, longDay.date)) < 24
);

if (spacingViolation) {
  // Move to next available day
}
```

## Cache Invalidation

### Invalidation Events
```typescript
// When optional workout is activated/deactivated
window.dispatchEvent(new CustomEvent('planned:invalidate'));

// When workout is completed/deleted
window.dispatchEvent(new CustomEvent('workouts:invalidate'));
```

### Cache Layers
1. **React Query Cache**: Global planned workouts context
2. **Memory Cache**: `usePlannedRange` hook caching
3. **localStorage**: Persistent planned range cache
4. **Component State**: Local component state updates

## Testing the System

### Test Cases
1. **Optional workout not activated**: Should not appear in calendar or Today's Efforts
2. **Optional workout activated**: Should appear in calendar and Today's Efforts
3. **XOR selection**: Selecting swim should hide quality bike and vice versa
4. **Weekly quality cap**: Should not allow more than 1 quality bike per week
5. **Spacing guards**: Should enforce 24h minimum before long run/ride
6. **Cache invalidation**: Changes should propagate to all components

### Debug Commands
```typescript
// Check optional workout tags
console.log('Workout tags:', workout.tags);

// Check if workout is optional
const isOptional = workout.tags.includes('optional');
const isActivated = workout.tags.includes('opt_active');

// Check XOR group
const isXOR = workout.tags.includes('xor:swim_or_quality_bike');
```

## Summary

The optional workouts system is a sophisticated feature that allows users to selectively activate optional training sessions. The current implementation has some filtering issues that cause optional workouts to appear in places they shouldn't. The fixes involve:

1. **Filtering optional workouts** from global context
2. **Only showing activated workouts** in Today's Efforts
3. **Standardizing filtering logic** across all components
4. **Maintaining XOR and spacing logic** for proper workout management

Once these fixes are applied, the system will work as intended: optional workouts are hidden by default and only appear when explicitly activated by the user.

---

**Last Updated**: January 2025
**Status**: 🔧 Needs Fixes
**Next Steps**: Apply filtering fixes to usePlannedWorkouts and TodaysEffort components
