# Efforts App - Architectural Blueprint

## Overview
This is a comprehensive architectural analysis of the Efforts fitness tracking app, focusing on data flow, component relationships, and system integration points.

## High-Level Architecture

### App Structure
```
App.tsx
├── AuthWrapper (Authentication & User Management)
│   ├── LoginForm / RegisterForm
│   └── AppLayout (Main Application)
│       ├── WorkoutCalendar (Calendar View)
│       ├── TodaysEffort (Today's Summary)
│       ├── AllPlansInterface (Plans Management)
│       ├── UnifiedWorkoutView (Workout Details)
│       └── Various Loggers (Strength, Mobility, etc.)
```

### Context Providers
1. **AppContext** - Main app state (workouts, plans, user data)
2. **useWorkouts** - Workout data management and CRUD operations
3. **usePlannedWorkouts** - Planned workout data and management
4. **QueryClient** - React Query for data fetching and caching

## Data Flow Patterns

### 1. Authentication Flow
```
User → AuthWrapper → LoginForm/RegisterForm → AppLayout
```

### 2. Workout Data Flow
```
User Action → Component → Context Hook → Supabase → UI Update
```

### 3. Planned Workout Flow
```
Plan Selection → AllPlansInterface → Planned Workout → Association → Completed Workout
```

## Component Categories

### Core UI Components
- **AppLayout** - Main application shell
- **WorkoutCalendar** - Calendar display and navigation
- **TodaysEffort** - Today's workout summary
- **UnifiedWorkoutView** - Workout detail view with tabs

### Workout Management
- **WorkoutBuilder** - Create new workouts
- **StrengthLogger** - Log strength workouts
- **MobilityLogger** - Log mobility workouts
- **WorkoutDetail** - View workout details

### Plan Management
- **AllPlansInterface** - Plan selection and management
- **PlanBuilder** - Create custom plans
- **PlannedWorkoutView** - View planned workouts

### Data Display
- **CompletedTab** - Show completed workouts
- **WorkoutSummary** - Workout summary and metrics
- **MobileSummary** - Mobile-optimized summary
- **StrengthCompletedView** - Strength workout completion view

### Integration Components
- **GarminConnect** - Garmin OAuth and data integration
- **GarminCallback** - Garmin OAuth callback handling
- **StravaCallback** - Strava OAuth callback
- **StravaWebhookManager** - Strava webhook processing
- **Connections** - Manage external connections
- **TrainingBaselines** - User fitness profiling and data import

## Key Data Flows

### Strength Workout Flow (Example)
1. **User selects planned workout** → AllPlansInterface
2. **Opens StrengthLogger** → Pre-populates with planned data
3. **User logs workout** → StrengthLogger saves to database
4. **Workout appears in TodaysEffort** → Calendar updates
5. **Association happens** → Planned workout marked as completed
6. **Summary shows comparison** → Planned vs actual numbers

### Data Sources
- **Supabase Database** - Primary data store (PostgreSQL)
- **Garmin Connect API** - External workout data via OAuth 2.0 + PKCE
- **Strava API** - External workout data via OAuth 2.0
- **Local Storage** - Session persistence and user preferences
- **Edge Functions** - Server-side data processing and API proxying

## Integration Points

### External Provider Integration
- **Garmin OAuth 2.0 + PKCE** → Token storage in `user_connections`
- **Strava OAuth 2.0** → Token storage in `device_connections`
- **Webhook processing** → Real-time data sync via edge functions
- **API proxying** → Secure external API calls via `swift-task` function

### Data Ingestion Pipeline
- **Provider webhook** → `ingest-activity` edge function
- **Data normalization** → Unified workout format across providers
- **Auto-attachment** → `auto-attach-planned` links completed to planned
- **Analysis computation** → `compute-workout-analysis` generates metrics

### Planned ↔ Completed Workout Association
- **planned_workouts.completed_workout_id** → **workouts.id**
- **workouts.planned_id** → **planned_workouts.id**
- **Status updates** → planned_workouts.workout_status = 'completed'

### Training Baselines Integration
- **User profiling** → Multi-discipline fitness assessment
- **Performance detection** → Automatic baseline extraction from activity data
- **Data import** → Strava/Garmin data analysis for baseline population
- **Plan personalization** → Baselines used for workout target calculation

### Calendar Updates
- **Workout completion** → Calendar cell updates
- **Plan association** → Calendar shows completed status
- **Date changes** → Calendar reflects new dates

### Summary Data
- **Completed workout** + **Associated planned workout** → Comparison table
- **Strength exercises** → Planned vs actual comparison
- **Metrics** → Performance analysis

## State Management

### Context Providers
1. **AppContext** - Global app state
2. **useWorkouts** - Workout CRUD operations
3. **usePlannedWorkouts** - Planned workout management

### Local State
- Component-level state for UI interactions
- Form state for user input
- Modal/dialog state

### External State
- Supabase real-time subscriptions
- React Query cache
- Local storage for persistence

## Data Transformation

### Database → UI
- **snake_case** → **camelCase** conversion
- **JSONB fields** → Parsed objects
- **Date formatting** → User-friendly display

### UI → Database
- **camelCase** → **snake_case** conversion
- **Objects** → JSONB storage
- **User input** → Validated data

## Edge Functions Architecture

### Core Processing Functions
- **`ingest-activity`** - Idempotent workout ingestion from Strava/Garmin
- **`swift-task`** - Secure Garmin API proxy with whitelisted endpoints
- **`strava-token-exchange`** - OAuth token exchange for Strava
- **`auto-attach-planned`** - Automatic planned/completed workout association
- **`compute-workout-analysis`** - Advanced workout metrics computation
- **`compute-workout-summary`** - Workout summary generation

### Webhook Processing
- **`strava-webhook`** - Real-time Strava activity processing
- **`garmin-webhook-activities-working`** - Garmin webhook handling
- **Token refresh** - Automatic token renewal for expired connections

### Data Services
- **`GarminDataService`** - Garmin API integration and data analysis
- **`StravaDataService`** - Strava API integration and baseline detection
- **`TrainingBaselines`** - User fitness profiling and performance analysis

## Current Issues & Bottlenecks

### Data Flow Issues
1. **Planned workout data not reaching summary** - Context vs direct fetch mismatch
2. **Association logic complexity** - Multiple ways to link planned/completed
3. **State synchronization** - Multiple sources of truth

### Component Complexity
1. **UnifiedWorkoutView** - Doing too many things
2. **AppLayout** - Large component with many responsibilities
3. **Data transformation** - Inconsistent patterns

### Integration Challenges
1. **Garmin + Strava conflicts** - Duplicate data handling
2. **Session persistence** - Inconsistent patterns
3. **Calendar updates** - Complex state management
4. **Token management** - OAuth token refresh and expiration handling
5. **Webhook reliability** - Ensuring data consistency across providers

## Recommendations

### Immediate Fixes
1. **Standardize data flow** - Use context consistently
2. **Simplify association logic** - Single source of truth
3. **Fix data transformation** - Consistent patterns

### Architectural Improvements
1. **Component separation** - Break down large components
2. **State management** - Centralize related state
3. **Data layer** - Abstract database operations

### Future Considerations
1. **AI integration** - Clean data foundation needed
2. **Performance optimization** - Reduce unnecessary re-renders
3. **Testing strategy** - Component isolation needed
4. **OAuth security** - Token rotation and secure storage
5. **Webhook scaling** - Handle high-volume data ingestion
6. **Baseline accuracy** - Improve performance detection algorithms

## Component Dependencies

### Critical Paths
- **Authentication** → **AppLayout** → **Workout Management**
- **Plan Selection** → **Workout Logging** → **Summary Display**
- **Data Integration** → **Calendar Updates** → **User Feedback**
- **OAuth Flow** → **Token Storage** → **Webhook Processing** → **Data Ingestion**
- **Baseline Detection** → **Plan Personalization** → **Workout Targets**

### Data Dependencies
- **Workouts** depend on **Planned Workouts** for association
- **Calendar** depends on **Workouts** for display
- **Summary** depends on **both** for comparison
- **Training Baselines** depend on **Activity Data** for performance detection
- **Plan Targets** depend on **User Baselines** for personalization

### Integration Dependencies
- **Garmin/Strava** → **Edge Functions** → **Database** → **UI**
- **Webhook Data** → **Normalization** → **Auto-attachment** → **Analysis**
- **User Profiling** → **Baseline Detection** → **Plan Customization**

## Security & OAuth Architecture

### Authentication Flow
1. **User initiates OAuth** → Provider authorization page
2. **Authorization code** → Edge function token exchange
3. **Access/Refresh tokens** → Secure database storage
4. **API calls** → Token-based authentication
5. **Token refresh** → Automatic renewal before expiration

### Data Security
- **PKCE for Garmin** - Enhanced OAuth 2.0 security
- **Token encryption** - Sensitive data encrypted at rest
- **API proxying** - No direct client-to-provider API calls
- **Webhook validation** - Secure webhook processing

This blueprint provides a comprehensive foundation for understanding the current architecture, including the sophisticated integration and authentication systems, and planning improvements for the final 10% of development.
