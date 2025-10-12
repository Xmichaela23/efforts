# Workload Scoring System

A comprehensive server-side workload scoring system for tracking training load across all workout types.

## 🏗️ Architecture

### Server-Side Processing
- **Edge Functions**: Calculate workload on Supabase
- **Database Triggers**: Automatic calculation on workout changes
- **Batch Processing**: Historical data sweep capabilities

### Client-Side Display
- **UI Components**: Display pre-calculated workload scores
- **Service Layer**: API calls to Edge Functions
- **Admin Tools**: Manual calculation and statistics

## 📊 Workload Formula

```
workload = duration (hours) × intensity² × 100
```

### Intensity Factors

#### Running
- Easy pace: 0.65
- 5K pace: 0.95
- Interval: 0.95
- Speed: 1.10

#### Cycling
- Z1: 0.55
- Z2: 0.70
- Threshold: 1.00
- VO2: 1.15

#### Swimming
- Easy: 0.65
- Threshold: 0.95
- Interval: 1.00

#### Strength
- @pct60: 0.70
- @pct80: 0.90
- @pct90: 1.00
- Bodyweight: 0.65

## 🚀 Edge Functions

### `calculate-workload`
- **Purpose**: Calculate workload for individual workouts
- **Trigger**: Database triggers or manual API calls
- **Input**: Workout data (type, duration, exercises, steps)
- **Output**: Calculated workload scores

### `sweep-user-history`
- **Purpose**: Calculate workload for all existing workouts
- **Trigger**: Manual admin action
- **Features**: Batch processing, dry run mode, progress tracking
- **Output**: Processing statistics

## 🗄️ Database Schema

### New Columns
```sql
ALTER TABLE workouts 
ADD COLUMN workload_planned INTEGER,
ADD COLUMN workload_actual INTEGER,
ADD COLUMN intensity_factor DECIMAL(3,2);
```

### Indexes
- `idx_workouts_workload_planned`
- `idx_workouts_workload_actual`
- `idx_workouts_user_date_workload`

## 🔄 Workflow

### New Workouts
1. Workout created/updated → Database trigger
2. Edge Function calculates workload
3. Database updated with scores
4. UI displays pre-calculated values

### Historical Data
1. Admin triggers sweep function
2. Batch processing of existing workouts
3. Progress tracking and error handling
4. All historical data gets workload scores

## 🎯 UI Components

### Calendar Display
- Small gray workload numbers on session cards
- Weekly total in bottom right corner
- Hybrid calculation: actual if completed, planned if not

### Admin Panel
- Historical sweep controls
- Statistics and analytics
- Manual calculation triggers

## 📈 Features

### Real-time Calculation
- Automatic workload calculation on workout changes
- Server-side processing for consistency
- No client-side calculation errors

### Historical Sweep
- Process thousands of existing workouts
- Batch processing with rate limiting
- Dry run mode for testing
- Progress tracking and error handling

### Analytics
- Weekly workload summaries
- User statistics and trends
- Peak week identification
- Training load monitoring

## 🔧 Usage

### Automatic (Recommended)
Workload is calculated automatically when workouts are created or updated.

### Manual Calculation
```typescript
import { calculateWorkloadForWorkout } from '@/services/workloadService';

const result = await calculateWorkloadForWorkout({
  workout_id: 'uuid',
  workout_data: {
    type: 'run',
    duration: 45,
    steps_preset: ['warmup_run_easy', '5kpace_4x1mi_R2min'],
    workout_status: 'completed'
  }
});
```

### Historical Sweep
```typescript
import { sweepUserHistory } from '@/services/workloadService';

const result = await sweepUserHistory({
  user_id: 'uuid',
  batch_size: 100,
  dry_run: false
});
```

## 🎨 Display Rules

- **Planned workouts**: Show `workload_planned`
- **Completed workouts**: Show `workload_actual`
- **Weekly total**: Hybrid calculation (actual if completed, planned if not)
- **Visual style**: Small gray numbers, no color coding
- **Position**: Right-aligned, consistent with existing UI

## 🚀 Deployment

1. Deploy Edge Functions to Supabase
2. Run database migrations
3. Configure database triggers
4. Update client-side components
5. Test with historical sweep

## 📊 Benefits

- **Consistent**: All calculations happen server-side
- **Scalable**: Handles thousands of workouts efficiently
- **Accurate**: Centralized business logic
- **Flexible**: Supports all workout types
- **Historical**: Can process existing data
- **Real-time**: Automatic updates on changes
