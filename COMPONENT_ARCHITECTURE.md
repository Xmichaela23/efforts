# Efforts App - Component Architecture Guide

## 🏗️ Core Application Structure

### **AppLayout** (`src/components/AppLayout.tsx`)
- **Main container** for the entire app
- **Manages state**: `selectedWorkout`, `activeTab`, `selectedDate`
- **Smart tab routing logic**: Determines which tab to open based on workout type/status
- **Handlers**: `handleWorkoutSelect`, `handleDateSelect`, `handleEditEffort`

### **TodaysEffort** (`src/components/TodaysEffort.tsx`)
- **Purpose**: Shows workouts for the selected date (compact view)
- **Display**: Simple format - workout type + duration (e.g., "Walk 45min")
- **Interaction**: Click workout → calls `onEditEffort` → opens `UnifiedWorkoutView`
- **Key functions**: `getDisciplineName`, `getIcon`, `getIconColor`

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

## 🚀 Recent Enhancements

1. **Walking Activity Support**: Full walking workout type with appropriate metrics
2. **GPS-Based Titles**: Auto-generate location names from coordinates
3. **Smart Tab Routing**: Intelligent tab selection based on workout data
4. **Simplified Metrics**: Activity-specific metric displays
5. **Compact UI**: Optimized for mobile with reduced space usage

## 📝 Development Notes

- **RLS (Row Level Security)**: `garmin_activities` requires server-side access
- **Client-side imports**: Use `workouts` table for browser accessibility
- **Activity deduplication**: Based on `garmin_activity_id`
- **Date format**: ISO format (`YYYY-MM-DD`) for consistency
- **Debug logging**: Available in browser console for troubleshooting

This architecture supports both planned workouts (created in app) and completed activities (imported from Garmin) with intelligent routing and display logic.
