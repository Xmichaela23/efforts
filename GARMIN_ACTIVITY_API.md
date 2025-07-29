# Garmin Activity API Documentation

## Overview
The Garmin Activity API allows you to receive completed activity data captured on Garmin wearable devices and cycling computers. This API is for **pulling data FROM Garmin devices** - it does NOT support pushing workouts TO devices.

## Key Points
- **Data Types**: Activity Summaries, Activity Details, Activity Files, Move IQ, Manually Updated Activities
- **Integration Methods**: Ping Service (Garmin notifies partner), Push Service (Garmin sends data directly), Pull Service (partner queries data - not recommended)
- **Data Fields**: GPS, HR, cadence, distance, duration, pace, calories, elevation
- **Limitations**: This API is for *pulling* data *from* Garmin devices; it does *not* support pushing workouts *to* devices

## Integration Methods

### 1. Ping Service (Recommended)
- Garmin sends HTTPS POST ping notifications when new data is available
- Partner responds with HTTP 200, then calls callback URL to fetch data
- Maintains near-real-time consistency without wasted queries

### 2. Push Service
- Garmin sends HTTPS POST with data directly embedded
- Same retry logic as Ping Service
- Data is identical to what would be returned via Ping callbacks

### 3. Pull Service (Not Recommended)
- Partner queries data on regular intervals
- Inefficient and may miss data

## Data Types

### Activity Summaries
High-level information from discrete fitness activities (running, swimming, etc.)

**Endpoint**: `GET https://apis.garmin.com/wellness-api/rest/activities`

**Key Fields**:
- `summaryId`, `activityId`, `activityType`
- `startTimeInSeconds`, `durationInSeconds`
- `distanceInMeters`, `activeKilocalories`
- `averageSpeedInMetersPerSecond`, `averagePaceInMinutesPerKilometer`
- `averageHeartRateInBeatsPerMinute`, `maxHeartRateInBeatsPerMinute`
- `deviceName`, `isParent`, `parentSummaryId`
- `manual`, `isWebUpload`

### Activity Details
Detailed information including GPS coordinates and sensor data

**Endpoint**: `GET https://apis.garmin.com/wellness-api/rest/activityDetails`

**Limitations**: 24-hour duration limit for activities

### Activity Files
For activities exceeding 24 hours in duration

### Move IQ Activities
Automatically detected activities (not full-featured discrete activities)

### Manually Updated Activities
Activities edited by users directly on Garmin Connect

## Rate Limiting

### Evaluation Limits
- 100 API call requests per partner per minute
- 200 API call requests per user per day

### Production Limits
- 3000 API call requests per partner per minute
- 1000 API call requests per user per day

## Error Handling
- HTTP 429: Too many requests (rate limiting)
- Failed notifications are re-attempted with exponential back-off
- "On Hold" functionality available for maintenance

## Web Tools
- **Data Viewer**: View user's Activity API data
- **Backfill**: Initiate historic data requests
- **Summary Resender**: Regenerate notifications
- **Data Generator**: Simulate user data sync
- **Partner Verification**: Check production requirements

## Important Notes
- All timestamps are UTC in seconds (Unix Time)
- Maximum query range is 24 hours by upload time
- CORS pre-flight requests (OPTIONS) are not supported
- Consumer key credentials created via Developer Portal
- Production access requires app review and approval

## Use Cases
- Fitness tracking platforms
- Training analysis
- Health monitoring
- Performance tracking
- Data aggregation and analytics

## Limitations
- **No workout pushing**: Cannot send workouts TO devices
- **Read-only**: Only pulls completed activities
- **Device dependency**: Requires user to sync devices
- **Time constraints**: 24-hour query limits
- **Rate limits**: API call restrictions apply 