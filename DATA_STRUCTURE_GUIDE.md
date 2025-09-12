# Data Structure Guide

## Overview
This document maps where different types of workout data are stored in the database and how to access them in the frontend.

## Database Tables

### `workouts` table
Main workout data with both normalized fields and raw JSON data.

#### Normalized Fields (Direct Columns)
```sql
-- Basic workout info
id, name, type, duration, date, description, user_id

-- Performance metrics (averages/maximums)
avg_heart_rate, max_heart_rate
avg_power, max_power, normalized_power
avg_speed, max_speed, avg_pace, max_pace
avg_cadence, max_cadence
elevation_gain, elevation_loss
calories, tss, intensity_factor

-- Time data
elapsed_time, moving_time, total_timer_time, total_elapsed_time

-- Advanced metrics
avg_vam, total_training_effect, total_anaerobic_effect
functional_threshold_power, threshold_heart_rate
hrv, hrv_rmssd

-- User profile data
age, weight, height, gender
default_max_heart_rate, resting_heart_rate

-- Device info
device_name, device_info, provider_sport, category
```

### `user_baselines` table
User fitness assessment and baseline data.

#### Structure
```sql
-- User baseline data
id, user_id, created_at, updated_at

-- Performance numbers (camelCase in JSONB)
performance_numbers: {
  ftp: number,                    -- Functional Threshold Power
  fiveK: string,                  -- 5K time
  tenK: string,                   -- 10K time
  halfMarathon: string,           -- Half marathon time
  marathon: string,               -- Marathon time
  easyPace: string,               -- Easy run pace
  avgSpeed: number,               -- Average cycling speed
  swimPace100: string,            -- 100m swim pace
  swim200Time: string,            -- 200m swim time
  swim400Time: string,            -- 400m swim time
  squat: number,                  -- Squat 1RM
  deadlift: number,               -- Deadlift 1RM
  bench: number,                  -- Bench press 1RM
  overheadPress1RM: number        -- Overhead press 1RM
}

-- Root level fields (snake_case) - LEGACY
fivek_pace, fivek_time, tenk_pace, tenk_time
half_marathon_pace, half_marathon_time
marathon_pace, marathon_time
ftp, squat, deadlift, bench, overhead_press_1rm

-- Disciplines
disciplines: string[]             -- Array of selected sports
```

#### JSON Data Columns
```sql
-- Raw provider data
garmin_data          -- Original Garmin activity JSON
strava_data          -- Original Strava activity JSON

-- Processed time series data
sensor_data          -- Heart rate, power, cadence over time
gps_track           -- GPS coordinates and elevation over time
time_series_data    -- Alternative time series storage

-- Structured workout data
intervals           -- Interval workout definitions
strength_exercises  -- Strength training exercises
swim_data          -- Swim-specific metrics and lengths
laps               -- Lap data
computed           -- Computed analysis and derived metrics
```

## Power & FTP Data Sources

### Power Data Storage
Power data is stored in **multiple locations** depending on the source:

#### 1. Workout-Level Power (Normalized Fields)
```sql
-- In workouts table (direct columns)
avg_power              -- Average power in watts
max_power              -- Maximum power in watts  
normalized_power       -- Normalized power (NP) in watts
functional_threshold_power  -- FTP for this workout
```

#### 2. Time Series Power Data
```sql
-- In sensor_data JSON array
sensor_data: [
  {
    power: number,                    -- Power in watts
    power_watts: number,              -- Alternative field name
    powerInWatts: number,             -- Garmin field name
    normalized_power: number,         -- NP for this sample
    power_balance: number,            -- Left/right power balance
    left_power_phase: number,         -- Left leg power phase
    right_power_phase: number         -- Right leg power phase
  }
]
```

#### 3. User FTP (Baseline Data)
```sql
-- In user_baselines table
performance_numbers: {
  ftp: 220  -- User's current FTP
}
-- OR legacy root level:
ftp: 220
```

### Frontend Data Access Patterns

### 1. Basic Workout Data
```typescript
// Direct access to normalized fields
const workout = workoutData;
const avgHR = workout.avg_heart_rate;
const distance = workout.distance;
const duration = workout.duration;

// Power data
const avgPower = workout.avg_power;
const maxPower = workout.max_power;
const normalizedPower = workout.normalized_power;
const ftp = workout.functional_threshold_power;
```

### 2. User Baseline Data (FTP, Personal Records)
```typescript
// Access user's baseline data (FTP, PRs, etc.)
const baselines = userBaselines; // From AppContext

// CORRECT - Use performance_numbers object (camelCase)
const ftp = baselines?.performanceNumbers?.ftp;
const fiveK = baselines?.performanceNumbers?.fiveK;
const squat = baselines?.performanceNumbers?.squat;

// WRONG - Don't use root level snake_case fields
// const ftp = baselines?.ftp;  // This might work but is legacy
// const fiveK = baselines?.fivek_pace;  // This won't work
```

### 3. Time Series Data (Charts/Maps)
```typescript
// Sensor data (heart rate, power, cadence over time)
const samples = Array.isArray(workout.sensor_data?.samples)
  ? workout.sensor_data.samples
  : Array.isArray(workout.sensor_data) 
    ? workout.sensor_data 
    : Array.isArray(workout.time_series_data)
      ? workout.time_series_data
      : [];

// Common field names in sensor samples:
const hr = sample.hr_bpm || sample.heartRate || sample.heart_rate || sample.hr || sample.bpm;
const power = sample.power || sample.power_watts || sample.powerInWatts;
const cadence = sample.cadence || sample.cadence_rpm || sample.cadenceInRpm;
const speed = sample.speed || sample.speed_mps || sample.speedInMetersPerSecond;
```

### 3. GPS Track Data (Maps)
```typescript
// GPS coordinates and elevation
const gpsTrack = Array.isArray(workout.gps_track) ? workout.gps_track : [];

// Common field names in GPS track:
const lat = point.lat || point.latitude || point.latitudeInDegree;
const lng = point.lng || point.longitude || point.longitudeInDegree;
const elev = point.elev || point.elevation || point.elevationInMeters;
const timestamp = point.timestamp || point.startTimeInSeconds || point.elapsed_s;
```

### 4. Computed Analysis Data
```typescript
// Derived metrics and analysis
const computed = workout.computed || {};
const analysis = computed.analysis || {};
const zones = analysis.zones || {};
const events = analysis.events || {};
const splits = events.splits || {};
```

## Component-Specific Data Access

### CompletedTab.tsx
- **Basic metrics**: Direct field access (`avg_heart_rate`, `distance`, etc.)
- **Time series charts**: `sensor_data` array with field name variations
- **GPS maps**: `gps_track` array
- **Computed analysis**: `computed.analysis` object

### EffortsViewerMapbox.tsx
- **Chart data**: `sensor_data` samples with `hr_bpm`, `pace_s_per_km`, etc.
- **Map data**: `gps_track` with lat/lng coordinates
- **Elevation**: `elev_m_sm` (smoothed elevation) in samples

### HRZoneChart.tsx
- **Heart rate samples**: `sensor_data` array with `hr_bpm` field
- **Time mapping**: Uses array index as time (assuming 1 sample/second)

## Data Flow

1. **Ingestion**: Raw provider data → `garmin_data`/`strava_data`
2. **Normalization**: Key metrics extracted → normalized columns
3. **Processing**: Time series data → `sensor_data`/`gps_track`
4. **Analysis**: Computed metrics → `computed` JSON
5. **Frontend**: Components read from appropriate sources

## Common Issues & Solutions

### Heart Rate Data Not Showing
- Check `sensor_data` vs `time_series_data`
- Try multiple field names: `hr_bpm`, `heartRate`, `heart_rate`, `hr`, `bpm`
- Verify data is array, not object

### GPS Data Missing
- Check `gps_track` array exists
- Verify lat/lng field names match expected format
- Check for coordinate transformation issues

### Computed Analysis Missing
- Ensure `compute-workout-analysis` function ran successfully
- Check `computed` JSON structure
- Verify analysis version compatibility

## Debugging Tips

1. **Check data structure first**:
   ```typescript
   console.log('Data type:', typeof workout.sensor_data);
   console.log('Is array:', Array.isArray(workout.sensor_data));
   console.log('Length:', workout.sensor_data?.length);
   console.log('First sample:', workout.sensor_data?.[0]);
   ```

2. **Log field names**:
   ```typescript
   if (samples.length > 0) {
     console.log('Sample keys:', Object.keys(samples[0]));
   }
   ```

3. **Check multiple sources**:
   ```typescript
   console.log('sensor_data:', workout.sensor_data);
   console.log('time_series_data:', workout.time_series_data);
   console.log('gps_track:', workout.gps_track);
   ```
