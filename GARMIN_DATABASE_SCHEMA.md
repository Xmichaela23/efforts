# Garmin Database Schema Reference

## Table: `garmin_activities`

### Core Activity Fields
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | bigint | NO | Primary key |
| `user_id` | uuid | NO | User reference |
| `garmin_activity_id` | text | NO | Garmin's activity ID |
| `garmin_user_id` | text | NO | Garmin's user ID |
| `activity_type` | text | YES | Type of activity (run, ride, swim, etc.) |
| `start_time` | timestamp with time zone | YES | Activity start time |
| `start_time_offset_seconds` | integer | YES | Timezone offset |
| `duration_seconds` | integer | YES | Total duration |
| `distance_meters` | real | YES | Total distance |

### Performance Metrics (Summary)
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `avg_speed_mps` | real | YES | Average speed (m/s) |
| `max_speed_mps` | double precision | YES | Max speed (m/s) |
| `avg_pace_min_per_km` | real | YES | Average pace (min/km) |
| `max_pace_min_per_km` | double precision | YES | Max pace (min/km) |
| `avg_heart_rate` | integer | YES | Average heart rate (BPM) |
| `max_heart_rate` | integer | YES | Max heart rate (BPM) |
| `avg_power` | integer | YES | Average power (W) |
| `max_power` | integer | YES | Max power (W) |

### Cadence & Movement
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `avg_bike_cadence` | double precision | YES | Average bike cadence (RPM) |
| `max_bike_cadence` | double precision | YES | Max bike cadence (RPM) |
| `avg_run_cadence` | double precision | YES | Average run cadence (steps/min) |
| `max_run_cadence` | double precision | YES | Max run cadence (steps/min) |
| `avg_swim_cadence` | double precision | YES | Average swim cadence (strokes/min) |
| `avg_push_cadence` | double precision | YES | Average push cadence (pushes/min) |
| `max_push_cadence` | double precision | YES | Max push cadence (pushes/min) |

### Elevation & Location
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `elevation_gain_meters` | real | YES | Total elevation gain |
| `elevation_loss_meters` | real | YES | Total elevation loss |
| `starting_latitude` | double precision | YES | Start location lat |
| `starting_longitude` | double precision | YES | Start location lng |

### Time Series Data (JSONB)
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `sensor_data` | jsonb | YES | **Heart rate, power, cadence over time** |
| `gps_track` | jsonb | YES | **GPS coordinates and elevation over time** |
| `samples_data` | jsonb | YES | Raw Garmin samples |
| `power_samples` | jsonb | YES | Power-specific samples |

### Training Metrics
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `training_stress_score` | numeric | YES | TSS score |
| `intensity_factor` | numeric | YES | IF score |
| `normalized_power` | integer | YES | Normalized power (W) |
| `avg_vam` | numeric | YES | Average VAM (m/h) |

### Other Fields
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `calories` | integer | YES | Calories burned |
| `steps` | integer | YES | Step count |
| `pushes` | integer | YES | Push count (wheelchair) |
| `number_of_active_lengths` | integer | YES | Swim lengths |
| `device_name` | text | YES | Device used |
| `raw_data` | jsonb | YES | Complete Garmin response |
| `created_at` | timestamp with time zone | YES | Record creation time |

## Key Data Flow

### 1. Webhook Processing
- Receives Garmin `samples[]` array
- Extracts individual sensor readings
- Stores in `sensor_data` JSONB field

### 2. Frontend Usage
- **Summary metrics**: Use direct columns (avg_heart_rate, max_power, etc.)
- **Time series charts**: Use `sensor_data` JSONB for BPM/power over time
- **GPS maps**: Use `gps_track` JSONB for route visualization

### 3. JSONB Structure Examples

#### `sensor_data` (Heart Rate Over Time)
```json
[
  {
    "timestamp": 1754231873,
    "heartRate": 145,
    "power": 180,
    "elevation": 351.6
  },
  {
    "timestamp": 1754231874,
    "heartRate": 147,
    "power": 185,
    "elevation": 351.8
  }
]
```

#### `gps_track` (GPS Coordinates)
```json
[
  {
    "timestamp": 1754231873,
    "lat": 34.203492,
    "lng": -118.166226,
    "elevation": 351.6
  }
]
```

## Frontend Integration

### Chart Data Source
- **Elevation Profile**: Use `gps_track` for terrain
- **Heart Rate Line**: Use `sensor_data` for BPM over time
- **Power Line**: Use `sensor_data` for watts over time
- **Speed/Pace**: Calculate from GPS coordinates in `gps_track`

### Data Correlation
- Match `sensor_data` timestamps with `gps_track` timestamps
- Use `startTimeInSeconds` for time alignment
- Combine GPS location with performance metrics for terrain correlation
