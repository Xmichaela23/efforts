# Efforts App - Complete System Blueprint

## Overview
This is the definitive blueprint of how the entire Efforts fitness tracking system works - from data ingestion through mathematical processing to UI display.

## System Architecture

### High-Level Data Flow
```
External Providers → Webhooks → Edge Functions → Database → Analysis → UI
     ↓                ↓           ↓              ↓         ↓        ↓
  Garmin/Strava → ingest-activity → workouts → compute-* → CompletedTab
```

## Data Ingestion Pipeline

### 1. External Data Sources
- **Garmin Connect** - OAuth 2.0 + PKCE, webhook subscriptions
- **Strava** - OAuth 2.0, webhook subscriptions  
- **Manual Entry** - Direct user input via UI

### 2. Webhook Processing
- **Garmin Webhook** → `garmin-webhook-activities-working` → `ingest-activity`
- **Strava Webhook** → `strava-webhook` → `ingest-activity`
- **Real-time sync** - Activities appear immediately after completion

### 3. Data Normalization (`ingest-activity` Edge Function)

#### Provider Data Mapping
**Strava → Workouts:**
```typescript
// Core metrics
duration: Math.round(activity.moving_time / 60)  // seconds → minutes
distance: (activity.distance / 1000).toFixed(3)  // meters → km
avg_speed: (activity.average_speed * 3.6).toFixed(2)  // m/s → km/h
avg_pace: Math.round(1000 / activity.average_speed)  // m/s → sec/km

// Heart rate
avg_heart_rate: Math.round(activity.average_heartrate)
max_heart_rate: Math.round(activity.max_heartrate)

// Cadence (running/cycling)
avg_cadence: Math.round(activity.average_cadence)
max_cadence: Math.round(activity.max_cadence)

// Elevation
elevation_gain: Math.round(activity.total_elevation_gain)
```

**Garmin → Workouts:**
```typescript
// Core metrics
duration: Math.round(activity.duration_seconds / 60)  // seconds → minutes
distance: (activity.distance_meters / 1000).toFixed(3)  // meters → km
avg_speed: (activity.avg_speed_mps * 3.6).toFixed(2)  // m/s → km/h

// Heart rate
avg_heart_rate: Math.round(activity.avg_heart_rate)
max_heart_rate: Math.round(activity.max_heart_rate)

// Cadence (sport-specific)
avg_cadence: activity.avg_swim_cadence ?? activity.avg_running_cadence ?? 
             activity.avg_run_cadence ?? activity.avg_bike_cadence
max_cadence: activity.max_running_cadence ?? activity.max_run_cadence ?? 
             activity.max_bike_cadence

// Power (cycling)
avg_power: Math.round(activity.average_watts ?? activity.avg_power)
max_power: Math.round(activity.max_watts ?? activity.max_power)

// Swimming
strokes: activity.strokes
pool_length: activity.pool_length
number_of_active_lengths: activity.number_of_active_lengths
```

#### Advanced Data Processing
**Computed Summary Generation:**
```typescript
// From sensor_data samples - computes GAP, cadence, intervals
function computeComputedFromActivity(activity) {
  // Normalize samples to {ts, t, hr, v, d, elev, cad}
  // Calculate moving time (filter <0.3 m/s)
  // Compute overall pace: movingSec / ((totalMeters/1000) * 0.621371)
  // Calculate GAP using Minetti energy cost model
  // Generate interval analysis from laps
}
```

**GAP (Grade Adjusted Pace) Calculation:**
```typescript
// Minetti energy cost model
const minetti = (g) => {
  const x = Math.max(-0.30, Math.min(0.30, g));  // Clamp grade to ±30%
  return (((155.4*x - 30.4)*x - 43.3)*x + 46.3)*x*x + 19.5*x + 3.6;
};

// EMA smoothing for elevation (~10-15s at 1Hz)
const alpha = 0.1;
elevSm[i] = ema == null ? e : (alpha * e + (1 - alpha) * ema);

// Equivalent flat speed using Minetti cost ratio
const v_eq = v * (minetti(g) / 3.6);  // 3.6 = flat cost C(0)
```

### 4. Database Storage
**`workouts` table** - Canonical source of truth for all workout data
- **Unified schema** across all providers
- **JSONB fields** for complex data (gps_track, sensor_data, computed)
- **Normalized metrics** in standard columns

## Backend Analysis Pipeline

### 1. Auto-Attachment (`auto-attach-planned`)
- **Links completed workouts** to planned workouts
- **Updates planned_workouts.completed_workout_id**
- **Sets planned_workouts.workout_status = 'completed'**

### 2. Workout Analysis (`compute-workout-analysis`)
**Advanced Metrics Computation:**
- **Pace smoothing** - EMA smoothing of pace data
- **Heart rate zones** - Zone distribution analysis
- **Power analysis** - Cycling power metrics and zones
- **Splits analysis** - Kilometer/mile split times
- **Elevation analysis** - Climb categorization and VAM

**Data Processing:**
```typescript
// Smooth pace data using EMA
function smoothEMA(data, alpha = 0.1) {
  let smoothed = data[0];
  for (let i = 1; i < data.length; i++) {
    smoothed = alpha * data[i] + (1 - alpha) * smoothed;
  }
  return smoothed;
}

// Calculate heart rate zones
const zones = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map(z => maxHR * z);

// VAM (Vertical Ascent per Minute) for cycling
const vam = (elevationGain * 1000) / (duration / 60);  // m/h
```

### 3. Workout Summary (`compute-workout-summary`)
**Summary Generation:**
- **Overall metrics** - Duration, distance, pace, power
- **Interval breakdown** - Lap-by-lap analysis
- **Training load** - TSS, IF, NP for cycling
- **Environmental data** - Temperature, conditions

## Training Plan Architecture

### 1. Plan Ingestion
**JSON Plan Processing:**
- **Universal schema** - Standardized plan format
- **Token system** - 100+ workout presets and tokens
- **DSL parsing** - Human-readable workout descriptions

### 2. Plan Compilation
**`plan_bake_and_compute.ts`:**
- **Baseline resolution** - User fitness levels → workout targets
- **Token expansion** - DSL → atomic workout steps
- **Target calculation** - Pace/power ranges from baselines
- **Duration computation** - Total workout time calculation

**Target Calculation Examples:**
```typescript
// Running pace from 5K time
const fiveKPace = parseTime(userBaselines.fiveK_pace);
const easyPace = fiveKPace + 60;  // +1 min/mile
const intervalPace = fiveKPace - 30;  // -30 sec/mile

// Cycling power from FTP
const ftp = userBaselines.ftp;
const easyPower = ftp * 0.65;  // 65% FTP
const thresholdPower = ftp * 0.95;  // 95% FTP
```

### 3. Plan Execution
**Workout Association:**
- **Planned workout** → User selects → **StrengthLogger** pre-populates
- **Workout completion** → **Auto-attachment** → **Calendar updates**
- **Summary display** → **Planned vs actual** comparison

## User Baseline System

### 1. Baseline Collection (`TrainingBaselines`)
**Multi-Discipline Profiling:**
- **Personal details** - Age, height, weight, gender
- **Performance metrics** - 5K times, FTP, swim paces, 1RMs
- **Training status** - Volume, frequency, consistency
- **Equipment access** - Available gear and facilities

### 2. Data Import & Analysis
**Strava Data Analysis:**
- **5K time extraction** - From longer runs using first 5K pace
- **FTP estimation** - From power data using 95% of best 20min effort
- **Volume analysis** - Weekly training hours calculation

**Garmin Data Analysis:**
- **Performance detection** - Automatic baseline extraction
- **Sport classification** - Running vs cycling vs swimming
- **Metric confidence** - High/medium/low confidence scoring

## UI Data Flow

### 1. Data Fetching
**React Query Hooks:**
- **`useWorkouts`** - Fetches completed workouts
- **`usePlannedWorkouts`** - Fetches planned workouts
- **`useAppContext`** - Global state management

### 2. Data Display
**`CompletedTab` Component:**
- **Workout details** - Distance, duration, pace, power
- **Charts and graphs** - Pace, heart rate, power curves
- **Map display** - GPS track visualization
- **Comparison tables** - Planned vs actual metrics

**Data Transformation:**
```typescript
// Database → UI conversion
const formatPace = (secondsPerKm) => {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatPower = (watts) => `${watts}W`;
const formatHeartRate = (bpm) => `${bpm} bpm`;
```

## Integration Points

### 1. OAuth & Authentication
**Garmin Integration:**
- **OAuth 2.0 + PKCE** - Enhanced security
- **Token storage** - `user_connections` table
- **API proxying** - `swift-task` edge function

**Strava Integration:**
- **OAuth 2.0** - Standard authorization flow
- **Token storage** - `device_connections` table
- **Direct API calls** - Client-side integration

### 2. Real-time Updates
**Webhook Processing:**
- **Garmin webhooks** - Activity completion notifications
- **Strava webhooks** - Real-time activity sync
- **Auto-processing** - Immediate data ingestion and analysis

### 3. Data Consistency
**Idempotent Operations:**
- **Duplicate prevention** - Provider activity ID tracking
- **Conflict resolution** - Last-write-wins for updates
- **Data validation** - Schema enforcement and type checking

## Mathematical Models

### 1. Pace Calculations
```typescript
// Basic pace (seconds per kilometer)
const pace = duration / (distance / 1000);

// Grade Adjusted Pace (GAP)
const gap = pace * (minettiCost / flatCost);

// Equivalent flat pace
const flatPace = pace * (1 + gradeAdjustment);
```

### 2. Power Analysis
```typescript
// Functional Threshold Power estimation
const ftp = best20minPower * 0.95;

// Training Stress Score
const tss = (duration * power * if) / (ftp * 3600) * 100;

// Normalized Power
const np = Math.pow(avgPower^4, 0.25);
```

### 3. Heart Rate Zones
```typescript
// Zone calculation from max HR
const zones = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map(z => maxHR * z);

// Time in zone
const timeInZone = samples.filter(s => s.hr >= zoneMin && s.hr < zoneMax).length;
```

## Data Storage Schema

### 1. Core Tables
**`workouts`** - Canonical workout data
- **Standard metrics** - duration, distance, pace, power, HR
- **Provider data** - strava_activity_id, garmin_activity_id
- **Computed fields** - JSONB for complex analysis

**`planned_workouts`** - Training plan sessions
- **Plan structure** - week_number, day_number, type
- **Target data** - pace, power, duration targets
- **Association** - completed_workout_id linkage

**`user_connections`** - OAuth tokens
- **Provider tokens** - access_token, refresh_token
- **Expiration** - expires_at, last_sync
- **Connection data** - JSONB for provider-specific data

### 2. JSONB Fields
**`computed`** - Advanced analysis results
- **Intervals** - Lap-by-lap breakdown
- **Overall metrics** - GAP, zones, training load
- **Analysis version** - For cache invalidation

**`sensor_data`** - Raw sensor samples
- **Time series** - timestamp, heart_rate, speed, distance
- **GPS data** - latitude, longitude, elevation
- **Device data** - cadence, power, temperature

## Performance Considerations

### 1. Data Processing
- **Batch processing** - Multiple activities in single operation
- **Incremental updates** - Only process new/changed data
- **Caching** - Analysis results stored in computed fields

### 2. UI Optimization
- **React Query** - Client-side caching and background updates
- **Lazy loading** - Load workout details on demand
- **Virtual scrolling** - Handle large activity lists

### 3. Database Optimization
- **Indexes** - On user_id, date, type for fast queries
- **Partitioning** - By date for large datasets
- **JSONB queries** - Efficient JSON field access

This blueprint provides the complete understanding of how the entire system works - from raw provider data through mathematical processing to UI display. Every component, calculation, and data flow is documented here.
