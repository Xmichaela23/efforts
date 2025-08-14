# Database Schema Reference

## Table: `workouts` (Main Workout Table)

### Core Workout Fields
| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | Primary key |
| `user_id` | uuid | YES | null | User reference (foreign key to users) |
| `name` | text | NO | null | Workout name |
| `type` | text | NO | null | Workout type: run, ride, swim, strength, mobility |
| `date` | date | NO | null | Scheduled date |
| `duration` | integer | NO | null | Duration in minutes |
| `description` | text | YES | null | Workout description |
| `usercomments` | text | YES | null | User notes |
| `completedmanually` | boolean | YES | false | Manually marked complete |
| `workout_status` | text | YES | 'planned' | Status: planned, completed, skipped, in_progress |

### Performance Metrics
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `distance` | numeric | YES | Distance in kilometers |
| `elapsed_time` | integer | YES | Total elapsed time in minutes |
| `moving_time` | integer | YES | Moving time in minutes |
| `avg_speed` | numeric | YES | Average speed in km/h |
| `max_speed` | numeric | YES | Maximum speed in km/h |
| `avg_pace` | numeric | YES | Average pace in minutes per km |
| `max_pace` | numeric | YES | Maximum pace in minutes per km |
| `avg_heart_rate` | integer | YES | Average heart rate (BPM) |
| `max_heart_rate` | integer | YES | Maximum heart rate (BPM) |
| `avg_power` | integer | YES | Average power (W) |
| `max_power` | integer | YES | Maximum power (W) |
| `avg_cadence` | integer | YES | Average cadence (RPM/steps per min) |
| `max_cadence` | integer | YES | Maximum cadence (RPM/steps per min) |
| `elevation_gain` | integer | YES | Total elevation gain in meters |
| `elevation_loss` | integer | YES | Total elevation loss in meters |
| `calories` | integer | YES | Calories burned |

### Advanced Metrics
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `hrv` | numeric | YES | Heart rate variability |
| `normalized_power` | integer | YES | Normalized power (W) |
| `tss` | numeric | YES | Training stress score |
| `intensity_factor` | numeric | YES | Intensity factor |
| `heart_rate_zones` | jsonb | YES | Heart rate zone breakdown |
| `time_series_data` | jsonb | YES | Time series sensor data |

### GPS & Location Data
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `gps_trackpoints` | text | YES | GPS track polyline string |
| `gps_track` | jsonb | YES | **GPS coordinates and elevation over time** |
| `start_position_lat` | numeric | YES | Starting latitude |
| `start_position_long` | numeric | YES | Starting longitude |

### Data Source & Integration
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `source` | text | YES | 'manual' | Data source: manual, garmin, strava, etc. |
| `is_strava_imported` | boolean | YES | false | Flag for Strava imports |
| `strava_activity_id` | bigint | YES | null | Strava's activity ID |
| `strava_data` | jsonb | YES | null | Original Strava activity data |
| `garmin_data` | jsonb | YES | null | Original Garmin activity data |

### Structured Data
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `intervals` | jsonb | YES | '[]' | Interval workout data |
| `strength_exercises` | jsonb | YES | '[]' | Strength exercise data |
| `swim_data` | jsonb | YES | null | Swim-specific metrics |

### Metadata
| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `created_at` | timestamptz | YES | now() | Record creation time |
| `updated_at` | timestamptz | YES | now() | Last update time |
| `timestamp` | timestamptz | YES | null | Activity timestamp |
| `friendly_name` | text | YES | null | User-friendly workout name |

### Garmin-Specific Fields
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `total_timer_time` | integer | YES | Total timer time in seconds |
| `total_elapsed_time` | integer | YES | Total elapsed time in seconds |
| `avg_temperature` | numeric | YES | Average temperature |
| `max_temperature` | numeric | YES | Maximum temperature |
| `total_work` | integer | YES | Total work in joules |
| `total_descent` | integer | YES | Total descent in meters |
| `avg_vam` | numeric | YES | Average VAM (vertical ascent per hour) |
| `total_training_effect` | numeric | YES | Training effect score |
| `total_anaerobic_effect` | numeric | YES | Anaerobic effect score |
| `functional_threshold_power` | integer | YES | Functional threshold power |
| `threshold_heart_rate` | integer | YES | Threshold heart rate |
| `hr_calc_type` | text | YES | Heart rate calculation type |
| `pwr_calc_type` | text | YES | Power calculation type |
| `age` | integer | YES | User age |
| `weight` | numeric | YES | User weight |
| `height` | integer | YES | User height |
| `gender` | text | YES | User gender |
| `default_max_heart_rate` | integer | YES | Default max heart rate |
| `resting_heart_rate` | integer | YES | Resting heart rate |
| `dist_setting` | text | YES | Distance setting |
| `weight_setting` | text | YES | Weight setting |
| `avg_fractional_cadence` | numeric | YES | Average fractional cadence |
| `avg_left_pedal_smoothness` | numeric | YES | Average left pedal smoothness |
| `avg_left_torque_effectiveness` | numeric | YES | Average left torque effectiveness |
| `max_fractional_cadence` | numeric | YES | Maximum fractional cadence |
| `left_right_balance` | numeric | YES | Left-right balance |
| `threshold_power` | integer | YES | Threshold power |
| `total_cycles` | integer | YES | Total cycles |
| `device_info` | jsonb | YES | Device information |

## Table: `device_connections` (OAuth Connections)

### Connection Fields
| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | Primary key |
| `user_id` | uuid | NO | null | User reference |
| `provider` | text | NO | null | Provider: strava, garmin, etc. |
| `provider_user_id` | text | NO | null | Provider's user ID |
| `access_token` | text | YES | null | OAuth access token |
| `refresh_token` | text | YES | null | OAuth refresh token |
| `expires_at` | timestamptz | YES | null | Token expiration time |
| `connection_data` | jsonb | YES | '{}' | Additional connection metadata |
| `is_active` | boolean | YES | true | Connection status |
| `last_sync` | timestamptz | YES | null | Last synchronization time |
| `webhook_active` | boolean | YES | null | Webhook subscription status |
| `webhook_id` | bigint | YES | null | Webhook subscription ID |

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
