# Workout Data Architecture Analysis

## Overview
This document analyzes the complex workout data flow from external providers (Garmin, Strava) through edge functions to the database, and how it's processed and displayed in the completed tab.

## Data Sources & Ingestion

### 1. External Providers
- **Garmin Connect** - Primary data source for GPS, sensor data, and advanced metrics
- **Strava** - Secondary data source with different data structure
- **Manual Entry** - User-created workouts via UI

### 2. Data Ingestion Pipeline
```
External Provider → Edge Function → Database → Analysis → UI Display
```

#### Garmin Data Flow
```
Garmin Connect → garmin-webhook-activities-working.ts → ingest-activity → workouts table
```

#### Strava Data Flow
```
Strava API → strava-webhook → ingest-activity → workouts table
```

## Database Schema

### Core Tables
1. **`workouts`** - Main workout data
2. **`garmin_activities`** - Raw Garmin data
3. **`device_connections`** - Provider authentication
4. **`planned_workouts`** - Training plan data

### Key Fields in `workouts` Table
```sql
-- Basic Info
id, user_id, name, type, date, timestamp, source

-- Provider IDs
garmin_activity_id, strava_activity_id

-- Raw Data (JSONB)
gps_track, sensor_data, swim_data, laps, computed

-- Metrics
distance, duration, avg_heart_rate, max_heart_rate
avg_speed, max_speed, avg_power, max_power
elevation_gain, calories, steps

-- Advanced Metrics
normalized_power, training_stress_score, intensity_factor
avg_cadence, max_cadence, avg_pace, max_pace

-- Computed Analysis
computed (JSONB) - Contains analysis results from edge functions
```

## Edge Functions Processing

### 1. `ingest-activity` - Data Ingestion
**Purpose:** Convert provider data to standardized format
**Key Functions:**
- Normalize timestamps and dates
- Convert units (meters/km, seconds/minutes)
- Extract GPS tracks and sensor data
- Handle provider-specific data structures

**Data Transformation:**
```typescript
// Garmin specific
- startTimeInSeconds → timestamp
- localStartTimeInSeconds → date
- gps_track: [{lat, lng, elevation, timestamp}]
- sensor_data: [{hr_bpm, power, cadence, speed}]

// Strava specific  
- start_date → timestamp
- distance (meters) → distance (km)
- polyline → gps_track
```

### 2. `compute-workout-analysis` - Advanced Processing
**Purpose:** Generate computed metrics and analysis
**Key Functions:**
- Smooth elevation and pace data
- Calculate VAM, GAP, power zones
- Generate heart rate zones
- Create time series data

**Output Structure:**
```typescript
computed: {
  analysis: {
    series: {
      time_s: number[],
      distance_m: number[],
      elevation_m: number[],
      pace_s_per_km: number[],
      hr_bpm: number[]
    },
    zones: {
      hr: { bins: [], schema: string },
      pace: { bins: [], schema: string },
      power: { bins: [], schema: string }
    },
    bests: {
      pace_s_per_km: [{ duration_s: number, value: number }]
    },
    events: {
      splits: { km: [], mi: [] }
    }
  }
}
```

## Completed Tab Complexity

### 1. Data Hydration Process
The `CompletedTab` component has a complex data hydration system:

```typescript
// Development-only hydration from garmin_activities
useEffect(() => {
  if (isDev && !hasSamples && garminId) {
    // Load rich fields from garmin_activities table
    // Merge with workout data
    // Update state with hydrated data
  }
}, [workoutData]);
```

### 2. Multiple Data Sources
The component tries multiple data sources for each metric:

```typescript
// Example: Heart Rate
const heartRate = 
  workoutData.avg_heart_rate || 
  workoutData.metrics?.avg_heart_rate ||
  hydrated.avg_heart_rate ||
  garminData.avg_heart_rate;
```

### 3. Workout Type Specific Logic
Different workout types have different metric calculations:

#### Running/Walking
- Pace calculations (min/mi, min/km)
- Cadence (steps per minute)
- Stride length calculations
- GAP (Grade Adjusted Pace)
- Running dynamics (ground contact time, vertical oscillation)

#### Cycling
- Power metrics (avg, max, normalized)
- Cadence (rpm)
- Speed calculations
- VAM (Vertical Ascent per Minute)
- Training metrics (TSS, IF)

#### Swimming
- Pool length detection (25m, 25yd, 50m)
- Pace per 100m/100yd
- Length counting
- Stroke rate calculations

### 4. Chart and Visualization Components
The completed tab includes multiple visualization components:

- **`EffortsViewerMapbox`** - Interactive map with GPS track, splits display, and metric charts
- **`CleanElevationChart`** - Elevation profile
- **`HRZoneChart`** - Heart rate zone distribution
- **`PowerCadenceChart`** - Power and cadence over time
- **`ActivityMap`** - Static map display

#### EffortsViewerMapbox - The Main Chart Component
This is the most complex visualization component, handling:

**Data Processing:**
- Normalizes samples from multiple data sources
- Converts GPS coordinates to display format
- Calculates splits (mile/km segments)
- Processes pace/speed data for different workout types

**Interactive Features:**
- Scrub-synced charts (drag to see data at specific points)
- Tab switching (PACE, BPM, VAM, ELEV)
- Split highlighting and selection
- Lock/unlock chart interaction

**Workout Type Specific Logic:**
- **Running/Walking:** Shows pace (min/mi, min/km)
- **Cycling:** Shows speed (mph, km/h) - converts from pace data
- **Swimming:** Shows pace per 100m/100yd

**Splits Display:**
- Mile or kilometer segments based on user preference
- Shows time, pace/speed, elevation gain, grade for each split
- Dynamic column headers (Pace vs Speed)
- Real-time data pills showing current values

**Data Sources:**
- Primary: `workoutData.computed.analysis.events.splits`
- Fallback: Calculated from raw sensor data
- GPS: `workoutData.gps_track` for map display

#### Data Flow to Charts
```
Workout Data → CompletedTab → EffortsViewerMapbox
    ↓
1. Data Hydration (dev mode: load from garmin_activities)
2. Sample Normalization (convert to standard format)
3. Split Calculation (mile/km segments)
4. Metric Processing (pace/speed conversion)
5. Chart Rendering (interactive visualization)
```

#### Key Data Transformations
- **Pace → Speed:** `3600 / secPerKm * 0.621371` for mph
- **GPS Normalization:** Multiple coordinate formats → `{lat, lng, elevation}`
- **Split Processing:** Raw samples → `{time_s, dist_m, avgPace_s_per_km, gain_m}`
- **Metric Formatting:** Raw values → display strings with units

### 5. Data Format Challenges

#### GPS Track Data
```typescript
// Multiple formats supported
gps_track: [
  { lat: number, lng: number, elevation?: number },
  { latitude: number, longitude: number, altitude?: number },
  { latitudeInDegree: number, longitudeInDegree: number }
]
```

#### Sensor Data
```typescript
// Nested structure
sensor_data: {
  samples: [
    {
      hr_bpm: number,
      power: number,
      cadence: number,
      speed: number,
      timestamp: number
    }
  ]
}
```

#### Computed Analysis
```typescript
// Complex nested structure
computed: {
  analysis: {
    series: { /* time series data */ },
    zones: { /* zone distributions */ },
    bests: { /* best efforts */ },
    events: { /* splits and segments */ }
  }
}
```

## Current Issues & Complexity

### 1. Data Inconsistency
- Multiple data sources with different formats
- Inconsistent field names across providers
- Missing data handling varies by component

### 2. Performance Issues
- Large JSONB fields slow queries
- Complex data transformation in components
- Multiple API calls for data hydration

### 3. Code Complexity
- 1800+ lines in `CompletedTab.tsx`
- Complex conditional logic for different workout types
- Multiple data transformation functions
- Inconsistent error handling

### 4. Provider Conflicts
- Garmin vs Strava data conflicts
- Duplicate workout handling
- Different metric calculations

## Recommendations

### 1. Data Standardization
- Create unified data models
- Standardize field names across providers
- Implement consistent data validation

### 2. Component Refactoring
- Break down `CompletedTab` into smaller components
- Create workout-type-specific components
- Implement consistent data transformation patterns

### 3. Performance Optimization
- Implement data caching
- Optimize JSONB queries
- Lazy load chart components

### 4. Error Handling
- Implement consistent error boundaries
- Add fallback data sources
- Improve loading states

## Data Flow Summary

```
1. External Provider (Garmin/Strava)
   ↓
2. Edge Function (ingest-activity)
   ↓
3. Database (workouts table)
   ↓
4. Analysis Function (compute-workout-analysis)
   ↓
5. UI Component (CompletedTab)
   ↓
6. Visualization Components (Charts, Maps)
```

This architecture handles complex workout data from multiple sources, processes it through edge functions, and displays it in a rich, interactive interface. The complexity comes from supporting multiple workout types, providers, and data formats while maintaining performance and user experience.

---

## Plans: Acceptance Metadata and Date Policy

### `plans.config.tri_acceptance`
Stored alongside a user plan to capture acceptance inputs and the baked blueprint snapshot:
```
tri_acceptance: {
  race_date: string,            // YYYY-MM-DD (local date)
  weeks_to_race: number,        // derived at acceptance
  strength_track: string|null,  // optional, from template.strength_tracks
  phase_blueprint: object|null, // snapshot from template
  phases_by_week: string[]      // e.g., [Build, …, Peak, Taper]
}
```

### Date math policy
- All week alignment uses the user’s local timezone.
- Weeks anchor on Monday; race week is the final baked week.
- Acceptance shows a soft warning if outside the template’s `min_weeks..max_weeks`, but saving is allowed if a race date is set.

