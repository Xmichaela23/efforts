# Efforts App - Component Architecture Guide

## 🏗️ Core Application Structure

### **AppLayout** (`src/components/AppLayout.tsx`)
- **Main container** for the entire app
- **Manages state**: `selectedWorkout`, `activeTab`, `selectedDate`
- **Smart tab routing logic**: Determines which tab to open based on workout type/status
- **Handlers**: `handleWorkoutSelect`, `handleDateSelect`, `handleEditEffort`
- **Bottom Navigation**: Build/Log/Plans/Completed tabs at bottom of screen

### **TodaysEffort** (`src/components/TodaysEffort.tsx`)
- **Purpose**: Shows workouts for the selected date with rich metrics display
- **Display**: 
  - **Compact Mode**: Simple format - workout type + duration (e.g., "Walk 45min")
  - **Expanded Mode**: Rich metrics including pace, speed, heart rate, elevation
- **Interaction**: Click workout → calls `onEditEffort` → opens `UnifiedWorkoutView`
- **Key functions**: `getDisciplineName`, `getIcon`, `getIconColor`
- **Metrics Display**: Shows primary metrics (duration, distance) and secondary metrics (pace, heart rate) based on workout type

### **WorkoutCalendar** (`src/components/WorkoutCalendar.tsx`)
- **Purpose**: Monthly calendar grid with workout tags on dates
- **Display**: Small colored tags showing workout type (e.g., "Walk", "Run", "Ride")
- **Interaction**: Click date → updates `TodaysEffort` (doesn't directly open workouts)
- **Key functions**: `getWorkoutsForDate`, `getDisciplineName`, `getDisciplineColor`

## 🔄 Workout Detail Flow

### **UnifiedWorkoutView** (`src/components/UnifiedWorkoutView.tsx`)
- **Purpose**: Main workout detail container with tabs
- **Header**: Shows location-based title (e.g., "Los Angeles Walking")
- **Tabs**: Planned, Summary, Completed
- **Key functions**: 
  - `getWorkoutType()`: Maps Garmin activity types to app types
  - `generateWorkoutTitle()`: Creates location-based titles from GPS

### **CompletedTab** (`src/components/CompletedTab.tsx`)
- **Purpose**: Shows completed workout metrics and analytics
- **Activity-specific logic**: Different metrics based on `workoutType`
- **Walking**: Duration, Distance, Heart Rate, Calories, Elevation (simplified)
- **Running/Cycling**: Full metrics including power, pace, cadence
- **Key functions**: `getPrimaryMetrics()`, `getAdvancedMetrics()`

## 📱 Bottom Navigation System

### **Bottom Navigation Bar**
- **Location**: Fixed at bottom of screen for mobile-native feel
- **Tabs**: Build, Log, Plans, Completed
- **Styling**: Dark theme with active tab highlighting
- **Responsive**: Adapts to different screen sizes

### **Build Dropup Menu**
- **Purpose**: Quick access to workout creation tools
- **Options**: Run, Ride, Swim, Strength, Mobility
- **Positioning**: Opens upward to avoid covering calendar content

### **Log Dropup Menu**
- **Purpose**: Quick activity logging
- **Options**: Log Effort, Import FIT File, Garmin Sync
- **Integration**: Connects to existing logging workflows

### **Plans Dropup Menu**
- **Purpose**: Access to training plans and AI plan builder
- **Options**: View Plans, Create Plan, AI Builder

### **Completed Dropup Menu**
- **Purpose**: View completed workouts and analytics
- **Options**: Today's Efforts, History, Analytics

## 📊 Data Flow & Mapping

### **Activity Type Mapping**
```
Garmin → App Type → Display Color
WALKING → walk → yellow
RUNNING → run → green  
CYCLING → ride → blue
SWIMMING → swim → cyan
STRENGTH_TRAINING → strength → orange
```

### **Smart Tab Routing Logic** (`AppLayout.tsx`)
```
if (workout.type === 'strength') → Completed tab
else if (workout_status === 'completed') {
  if (hasPlannedData) → Summary tab (shows planned vs actual)
  else → Completed tab (just show data)
} else → Planned tab
```

### **Location-Based Titles** (`generateWorkoutTitle()`)
- **GPS coordinates** → City detection (Los Angeles, Pasadena, San Francisco)
- **Format**: "City + Activity Type" (e.g., "Los Angeles Walking")
- **Fallback**: Uses original workout name or generic type

## 🏃‍♂️ Pace & Speed Calculations

### **Data Field Transformations** (`useWorkouts.ts`)
- **Raw Garmin Fields** → **Transformed App Fields**
- `max_pace` → `max_pace` (seconds per km from Garmin)
- `max_speed` → `max_speed` (meters per second from Garmin)
- `avg_pace` → `avg_pace` (seconds per km from Garmin)
- `avg_speed` → `avg_speed` (meters per second from Garmin)

### **Pace Conversion Formulas**
```typescript
// Convert seconds per km to seconds per mile
const kmToMileRatio = 1.60934;
const paceSecondsPerMile = paceSecondsPerKm * kmToMileRatio;

// Convert meters per second to mph
const speedMph = speedMps * 2.23694;
```

### **Speed Conversion Formulas**
```typescript
// Convert meters per second to mph
const speedMph = speedMps * 2.23694;

// Convert km/h to mph
const speedMph = speedKmh * 0.621371;
```

### **Field Mapping in CompletedTab**
- **Max Pace**: Uses `workout.max_pace` (transformed field) for running/walking
- **Max Speed**: Uses `workout.max_speed` (transformed field) for cycling
- **Average Pace**: Uses `workout.avg_pace` (transformed field) for running/walking
- **Average Speed**: Uses `workout.avg_speed` (transformed field) for cycling

**Important**: The `formatSpeed` function is actually misnamed - it returns:
- **For running/walking**: Best pace (fastest pace = lowest time per km) in min:sec/mi format
- **For cycling**: Fastest speed in mph format

## 🔗 Garmin Integration

### **Data Sources**
- **`garmin_activities` table**: Raw Garmin data with GPS, metrics, samples
- **`workouts` table**: Processed workout data for app display
- **Webhooks**: `garmin-webhook-activities-working.ts` - receives new activities

### **Edge Functions**
- **`swift-task`**: CORS proxy for Garmin API calls
- **`enrich-history`**: Fetches detailed activity data
- **`import-garmin-history`**: Bulk historical data import

### **Key Data Processing** (`useWorkouts.ts`)
- **`importGarminActivities()`**: Converts garmin_activities → workouts
- **`getWorkoutType()`**: Maps Garmin activity types
- **`generateLocationTitle()`**: Creates GPS-based titles
- **Field Transformation**: Converts Garmin field names to app field names

### **Garmin Field Mappings**
```typescript
// Activity type mappings
'RUNNING' → 'run'
'WALKING' → 'walk'
'CYCLING' → 'ride'
'SWIMMING' → 'swim'
'STRENGTH_TRAINING' → 'strength'

// Metric field mappings
'max_pace' → 'max_pace' (seconds per km)
'max_speed' → 'max_speed' (m/s)
'avg_pace' → 'avg_pace' (seconds per km)
'avg_speed' → 'avg_speed' (m/s)
```

## 🎨 UI Components & Styling

### **Color Coding**
- **Walking**: Yellow (`bg-yellow-100 text-yellow-800`)
- **Running**: Green (`bg-green-100 text-green-800`)
- **Cycling**: Blue (`bg-blue-100 text-blue-800`)
- **Swimming**: Cyan (`bg-cyan-100 text-cyan-800`)
- **Strength**: Orange (`bg-orange-100 text-orange-800`)

### **Compact Design Principles**
- **TodaysEffort**: Minimal height (`h-24`), simple workout display
- **Calendar**: Small workout tags, clear date grid
- **Walking metrics**: Simplified to essentials only
- **Bottom Navigation**: Fixed positioning, mobile-optimized

### **Typography & Icons**
- **Text-Only Design**: Removed icons for cleaner, more readable interface
- **Consistent Font Sizes**: Uses Tailwind's text scale for hierarchy
- **Color Contrast**: High contrast for accessibility

## 🔧 Key Functions Reference

### **Activity Type Detection**
```typescript
// Priority order:
1. workout.type (if explicitly set)
2. workout.activity_type (from Garmin)
3. workout.name (fallback to name parsing)
```

### **Calendar Interaction Flow**
```
Click Calendar Date → onDateSelect() → Updates TodaysEffort
Click Workout in TodaysEffort → onEditEffort() → Opens UnifiedWorkoutView
Smart Tab Routing → Determines initial tab based on workout data
```

### **GPS Title Generation**
```typescript
// Coordinate bounds for city detection:
Los Angeles: lat 33.7-34.5, lng -118.9--117.9
Pasadena: lat 34.1-34.2, lng -118.2--118.0  
San Francisco: lat 37.4-37.8, lng -122.5--122.0
```

### **Pace Display Logic**
```typescript
// Format pace for display
const formatPace = (paceSeconds: number) => {
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = paceSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}/mi`;
};

// Format speed for display
const formatSpeed = (speedMps: number) => {
  const speedMph = speedMps * 2.23694;
  return `${speedMph.toFixed(1)} mph`;
};
```

## 🚀 Recent Enhancements

1. **Bottom Navigation**: Moved Build/Log/Plans/Completed to bottom for mobile-native feel
2. **Pace Calculations**: Fixed pace and speed calculations using transformed Garmin fields
3. **Data Field Transformations**: Proper mapping of Garmin fields to app fields
4. **Rich Metrics Display**: Enhanced TodaysEffort with detailed workout metrics
5. **Text-Only UI**: Removed icons for cleaner, more readable interface
6. **Mobile Optimization**: Bottom navigation with proper dropup positioning
7. **Unit Conversions**: Proper conversion from metric (km) to imperial (miles) units

## 📝 Development Notes

- **RLS (Row Level Security)**: `garmin_activities` requires server-side access
- **Client-side imports**: Use `workouts` table for browser accessibility
- **Activity deduplication**: Based on `garmin_activity_id`
- **Date format**: ISO format (`YYYY-MM-DD`) for consistency
- **Debug logging**: Available in browser console for troubleshooting
- **Field Transformations**: All Garmin data goes through `useWorkouts.ts` transformation
- **Pace Units**: App displays pace in seconds per mile (converted from Garmin's seconds per km)
- **Speed Units**: App displays speed in mph (converted from Garmin's m/s)

## 🔍 Debugging & Troubleshooting

### **Common Issues**
1. **Pace Display**: Ensure `max_pace` and `avg_pace` are properly transformed
2. **Speed Display**: Check `max_speed` and `avg_speed` field mappings
3. **Bottom Navigation**: Verify dropup positioning doesn't cover calendar content
4. **Data Import**: Check browser console for Garmin data transformation logs

### **Data Validation**
- **Pace Values**: Should be positive numbers (seconds)
- **Speed Values**: Should be positive numbers (m/s)
- **GPS Coordinates**: Should be valid latitude/longitude ranges
- **Activity Types**: Should map to valid app workout types

This architecture supports both planned workouts (created in app) and completed activities (imported from Garmin) with intelligent routing, proper data transformations, and mobile-optimized navigation.
