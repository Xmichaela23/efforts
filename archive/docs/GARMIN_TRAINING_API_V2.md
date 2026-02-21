# Garmin Training API V2 Documentation

## Overview
The Garmin Connect Training API V2 allows users to import workouts and workout schedules from third-party platforms into their Garmin Connect account. This is the **key API for pushing workouts TO Garmin devices**.

## Key Points
- **Purpose**: Import workouts and schedules TO Garmin devices
- **Data Types**: Workouts and Workout Schedules
- **Operations**: Full CRUD (Create, Read, Update, Delete)
- **Multi-sport Support**: Triathlon, running, cycling, swimming, strength training
- **Complex Workouts**: Intervals, repeats, targets, zones

## Supported Sports

### Single Sport Workouts
- **RUNNING**: Running workouts
- **CYCLING**: Cycling workouts  
- **LAP_SWIMMING**: Swimming workouts
- **STRENGTH_TRAINING**: Strength training
- **CARDIO_TRAINING**: Cardio workouts
- **YOGA**: Yoga sessions
- **PILATES**: Pilates sessions
- **GENERIC**: Generic workouts (limited device support)

### Multi-Sport Workouts
- **MULTI_SPORT**: Triathlon and multi-sport workouts
- **Limit**: 25 segments, 250 steps total
- **Transitions**: Supported between sports

## Workout Structure

### Workout Fields
```json
{
  "workoutId": "Long",
  "ownerId": "Long", 
  "workoutName": "String",
  "description": "String (max 1024 chars)",
  "sport": "String",
  "estimatedDurationInSecs": "Integer",
  "estimatedDistanceInMeters": "Double",
  "poolLength": "Double",
  "poolLengthUnit": "String (YARD/METER)",
  "workoutProvider": "String (max 20 chars)",
  "workoutSourceId": "String (max 20 chars)",
  "isSessionTransitionEnabled": "Boolean",
  "segments": "List<Segment>"
}
```

### Segment Fields
```json
{
  "segmentOrder": "Integer",
  "sport": "String",
  "estimatedDurationInSecs": "Integer",
  "estimatedDistanceInMeters": "Double",
  "poolLength": "Double",
  "poolLengthUnit": "String",
  "steps": "List<Step>"
}
```

### Step Types

#### WorkoutStep
Individual workout steps with specific parameters.

#### WorkoutRepeatStep
Repeating blocks of steps with conditions.

**Repeat Types**:
- `REPEAT_UNTIL_STEPS_CMPLT`
- `REPEAT_UNTIL_TIME`
- `REPEAT_UNTIL_DISTANCE`
- `REPEAT_UNTIL_CALORIES`
- `REPEAT_UNTIL_HR_LESS_THAN`
- `REPEAT_UNTIL_HR_GREATER_THAN`
- `REPEAT_UNTIL_POWER_LESS_THAN`
- `REPEAT_UNTIL_POWER_GREATER_THAN`
- `REPEAT_UNTIL_POWER_LAST_LAP_LESS_THAN`
- `REPEAT_UNTIL_MAX_POWER_LAST_LAP_LESS_THAN`

### Step Fields
```json
{
  "type": "String (WorkoutStep/WorkoutRepeatStep)",
  "stepId": "Long",
  "stepOrder": "Integer",
  "intensity": "String",
  "description": "String (max 512 chars)",
  "durationType": "String",
  "durationValue": "Double",
  "durationValueType": "String",
  "targetType": "String",
  "targetValue": "Double",
  "targetValueLow": "Double",
  "targetValueHigh": "Double",
  "targetValueType": "String",
  "secondaryTargetType": "String",
  "secondaryTargetValue": "Double",
  "secondaryTargetValueLow": "Double",
  "secondaryTargetValueHigh": "Double",
  "secondaryTargetValueType": "String",
  "strokeType": "String",
  "drillType": "String",
  "equipmentType": "String",
  "exerciseCategory": "String",
  "exerciseName": "String",
  "weightValue": "Double",
  "weightDisplayUnit": "String"
}
```

## Intensity Levels
- `REST`: Rest periods
- `WARMUP`: Warm-up phases
- `COOLDOWN`: Cool-down phases
- `RECOVERY`: Recovery intervals
- `ACTIVE`: Active training
- `INTERVAL`: Interval training
- `MAIN`: Main set (swimming only)

## Duration Types
- `TIME`: Time-based duration
- `DISTANCE`: Distance-based duration
- `HR_LESS_THAN`: Heart rate below threshold
- `HR_GREATER_THAN`: Heart rate above threshold
- `CALORIES`: Calorie-based duration
- `OPEN`: Open-ended duration
- `POWER_LESS_THAN`: Power below threshold
- `POWER_GREATER_THAN`: Power above threshold
- `TIME_AT_VALID_CDA`: Time at valid CDA
- `FIXED_REST`: Fixed rest periods
- `REPS`: Repetitions (HIIT, CARDIO, STRENGTH_TRAINING only)

## Target Types
- `SPEED`: Speed targets
- `HEART_RATE`: Heart rate targets
- `CADENCE`: Cadence targets
- `POWER`: Power targets
- `GRADE`: Grade targets
- `RESISTANCE`: Resistance targets
- `POWER_3S`: 3-second power
- `POWER_10S`: 10-second power
- `POWER_30S`: 30-second power
- `POWER_LAP`: Lap power
- `SPEED_LAP`: Lap speed
- `HEART_RATE_LAP`: Lap heart rate
- `OPEN`: Open targets
- `PACE`: Pace targets (speed in m/s)

## Swimming-Specific Features

### Stroke Types
- `BACKSTROKE`, `BREASTSTROKE`, `BUTTERFLY`, `FREESTYLE`
- `MIXED`, `IM`, `RIMO`, `CHOICE`

### Drill Types
- `KICK`, `PULL`, `BUTTERFLY`

### Equipment Types
- `NONE`, `SWIM_FINS`, `SWIM_KICKBOARD`, `SWIM_PADDLES`
- `SWIM_PULL_BUOY`, `SWIM_SNORKEL`

### Swimming Targets
- `SWIM_INSTRUCTION`: Text-based intensity (1-10)
- `SWIM_CSS_OFFSET`: CSS-based target pace (-60 to 60 seconds)
- `PACE_ZONE`: Pace zone in m/s

## API Endpoints

### Workouts

#### Create Workout
```
POST https://apis.garmin.com/workoutportal/workout/v2
Content-Type: application/json
```

#### Retrieve Workout
```
GET https://apis.garmin.com/training-api/workout/v2/{workoutId}
```

#### Update Workout
```
PUT https://apis.garmin.com/training-api/workout/v2/{workoutId}
Content-Type: application/json
```

#### Delete Workout
```
DELETE https://apis.garmin.com/training-api/workout/v2/{workoutId}
```

### Workout Schedules

#### Create Schedule
```
POST https://apis.garmin.com/training-api/schedule/
Content-Type: application/json
```

#### Retrieve Schedule
```
GET https://apis.garmin.com/training-api/schedule/{workoutScheduleId}
```

#### Update Schedule
```
PUT https://apis.garmin.com/training-api/schedule/{workoutScheduleId}
Content-Type: application/json
```

#### Delete Schedule
```
DELETE https://apis.garmin.com/training-api/schedule/{workoutScheduleId}
```

#### Retrieve by Date Range
```
GET https://apis.garmin.com/training-api/schedule?startDate=YYYY-mm-dd&endDate=YYYY-mm-dd
```

## Response Codes
- `200/204`: Success
- `400`: Bad Request
- `401`: User Access Token doesn't exist
- `403`: Not allowed
- `412`: User Permission error
- `429`: Quota violation / rate limiting

## Rate Limiting

### Evaluation Limits
- 100 API call requests per partner per minute
- 200 API call requests per user per day

### Production Limits
- 3000 API call requests per partner per minute
- 1000 API call requests per user per day

## Device Support
- List of devices supporting each workout sport types available at:
  https://support.garmin.com/en-US/?faq=lLvhWrmlMv0vGmyGpWjOX6

## Workout Limits
- **Multi-sport**: 25 segments, 250 steps total
- **Single sport**: 100 steps
- **Pool length**: Can be null for undefined pools

## Implementation Notes

### Authentication
- Requires OAuth2.0 PKCE authentication
- User must grant `WORKOUT_IMPORT` permission
- Access token required for all API calls

### Error Handling
- Implement proper error handling for rate limits
- Handle permission errors gracefully
- Validate workout structure before submission

### Production Requirements
- First consumer key is evaluation key (rate-limited)
- Production access requires app review and approval
- Must demonstrate proper user experience
- Compliance with Garmin brand guidelines required

## Use Cases
- Training plan integration
- Workout scheduling
- Multi-sport training (triathlon)
- Interval training
- Strength training programs
- Swimming workouts
- Device synchronization

## Integration with Your App
This API enables your app to:
- Generate AI-powered training plans
- Push structured workouts to Garmin devices
- Schedule complete training programs
- Create triathlon-specific workouts
- Integrate with your plan builder
- Provide seamless device experience 