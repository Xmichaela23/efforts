# EFFORTS APP BIBLE 📚

## 🎯 APP OVERVIEW

**Efforts** is a comprehensive training app that creates personalized training plans based on individual fitness assessments and goals. The app integrates with Garmin/Strava for data import and uses intelligent analysis to generate unique training plans.

## 🎨 PRODUCTION DESIGN RULES

### **Minimal Scandinavian Design:**
- **No Cards**: Eliminate card containers and frames
- **No Borders**: Remove all borders and frames
- **No Frames**: Clean, borderless design
- **Tab Language**: Simple underline under active tab (established in CompletedTab)
- **Typography**: Inter font family
- **Minimal**: Clean, uncluttered interface

### **Button Design:**
- **Text Only**: Buttons should be words, not icons
- **No Emojis**: Professional, clean appearance
- **Icons**: Lucide or Font Awesome only (still working out)
- **Simple**: Minimal button styling

### **Color Palette:**
- **Primary**: Black text on white background
- **Secondary**: Gray (#666666) for secondary text
- **Accents**: Minimal color usage
- **Clean**: Scandinavian minimalist approach

## 🚀 COMPLETE USER JOURNEY

### **1. First-Time User Onboarding**
- **Gentle Nudge**: Guide users to fill out baseline metrics
- **Two Paths**:
  - **Assessment**: Manual entry of fitness data
  - **Data Import**: Pull from Garmin/Strava (with manual supplementation)

### **2. Baseline Data Collection**
- **Current Issue**: 5K metric extraction problems from longer runs
- **Garmin Integration**: Working well
- **Strava Integration**: Local API only, needs webhook implementation
- **Manual Supplementation**: Users still need to add some metrics manually

### **3. Plan Building**
- **AI Plans**: Automated plan generation (70.3, Half Marathon, Century, etc.)
- **Manual Plans**: Coach-friendly workout creation
- **Both**: Reference baseline data for intensity setting

### **4. Training Execution**
- **Auto-Population**: Plans with strength/mobility auto-fill log fields
- **Log Interface**: Click "Log" to see planned workouts ready to track
- **Edit Capability**: Users can modify before logging

### **5. Advanced Logging Features**
- **Plate Math**: Already implemented in strength logger
- **Powerlifter Timer**: Need to implement
- **Strength Logger**: "Pretty great" - working well with RIR tracking

## 🏗️ ARCHITECTURE OVERVIEW

### Frontend Stack
- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** + **shadcn/ui** for styling
- **Supabase** for backend (database + edge functions)

### Backend Stack
- **Supabase** (PostgreSQL database)
- **Supabase Edge Functions** (AI analysis, plan generation)
- **OpenAI API** (via edge functions)
- **Row Level Security (RLS)** for data protection

## 📊 DATA FLOW ARCHITECTURE

```
User Flow:
1. Training Baselines (Fitness Assessment) → user_baselines table
2. Plan Builder (Goal Assessment) → AI Analysis → plan generation
3. PlanEngine → Creates unique training plans
4. Workout Execution → Logging & tracking
```

## 🎯 USER INTERFACE FLOW

### Main App Interface
**Entry Point**: Calendar view showing today's date
**Primary Navigation**: Swipe gestures for date selection

### Navigation Restructuring (TO BE IMPLEMENTED)

#### **Current State (Calendar Page Dropdowns):**
- **Build** dropdown - AI plans and manual builders
- **Log** dropdown - Strength and mobility logging
- **Plans** dropdown - Current and completed plans
- **Completed** dropdown - Workout analytics

#### **Desired State (Bottom Navigation):**
- **Build** button - Plan generation and manual workout creation
- **Log** button - Manual workout logging (strength, mobility)
- **Plans** button - View and manage training plans
- **Insights** button - Overall performance dashboard (like Strava)

#### **Completed Workout Access:**
- **Swipe Panels**: Access completed workout analytics from date swipes
- **Today's Efforts**: Access completed workout when workout is done
- **Insights**: Overall performance trends and multi-sport analytics

### Today's Efforts View
**Location**: Top of calendar interface
**Purpose**: Shows planned workouts for selected date
**Content**: 
- Workout names and types
- Planned duration and intensity
- Training status (planned/completed/skipped)

### Swipe Navigation
**Action**: Swipe right on any date
**Result**: Detailed summary of planned workouts for that date
**Content**:
- Workout breakdowns
- Intervals and sets
- Equipment needed
- Notes and instructions

### Swipe Panel Integration (TO BE IMPLEMENTED)
**Current State**: Swipe shows basic workout summary
**Desired State**: Swipe shows tabbed interface with:
- **Summary Tab**: Planned workout details
- **Completed Tab**: Professional analytics (current CompletedTab.tsx content)
- **Comparison Tab**: Planned vs actual performance

**Integration Points**:
- `src/components/WorkoutSummary.tsx` - Current swipe panel
- `src/components/CompletedTab.tsx` - Professional analytics
- `src/components/WorkoutDetail.tsx` - Tab navigation system

### Current Tab Structure (WORKING WELL)
**Current State**: 
- **Summary Tab**: Shows workout metrics and comments
- **Completed Tab**: Professional-level analytics with multi-sport overview

**Current Completed Tab Features**:
- **15+ Performance Metrics**: Power, HR, speed, cadence, TSS, etc.
- **GPS/Elevation Visualization**: Interactive charts and maps
- **Advanced Analytics**: Power curves, zones, pedal metrics
- **Multi-Sport Overview**: Cross-training correlations and trends
- **Recovery Analysis**: Training stress balance and adaptation

### Swipe Panel Enhancement (TO BE IMPLEMENTED)
**Current State**: Basic workout summary in swipe panel
**Desired State**: Full tabbed interface in swipe panel
- **Summary Tab**: Planned workout details
- **Completed Tab**: Professional analytics (current CompletedTab.tsx content)
- **Comparison Tab**: Planned vs actual performance

**Implementation Strategy**:
- Integrate tab navigation from `WorkoutDetail.tsx` into `WorkoutSummary.tsx`
- Move `CompletedTab.tsx` analytics into swipe panel
- Create comparison logic for planned vs actual

## 🗄️ DATABASE SCHEMA

### Core Tables

#### `user_baselines`
Stores user's fitness assessment data:
```sql
- user_id (UUID, primary key)
- age (integer)
- birthday (date)
- height (integer)
- weight (integer)
- gender (text)
- units (text)
- disciplines (text[]) -- ['running', 'cycling', 'swimming', 'strength']
- performance_numbers (jsonb) -- {
    ftp: number,
    squat: number,
    bench: number,
    deadlift: number,
    fiveK: string,
    tenK: string,
    easyPace: string,
    swimPace100: string
  }
- injury_history (text)
- injury_regions (text[])
- equipment (jsonb)
- training_background (text)
```

#### `plans`
Stores generated training plans:
```sql
- id (UUID, primary key)
- user_id (UUID, foreign key)
- name (text)
- description (text)
- training_philosophy (text)
- weeks (jsonb) -- Array of Week objects
- created_at (timestamp)
- approved (boolean)
```

#### `workouts`
Stores individual workout logs:
```sql
- id (UUID, primary key)
- user_id (UUID, foreign key)
- plan_id (UUID, foreign key)
- week_number (integer)
- day (text)
- type (text) -- 'swim', 'bike', 'run', 'strength'
- duration (text)
- main (text)
- warmup (text)
- cooldown (text)
- notes (text)
- completed (boolean)
- completed_at (timestamp)
```

#### `garmin_activities`
Stores imported Garmin activity data:
```sql
- id (UUID, primary key)
- user_id (UUID, foreign key)
- garmin_activity_id (text, unique)
- activity_type (text)
- start_time (timestamp)
- duration_seconds (integer)
- distance_meters (float)
- calories (integer)
- avg_heart_rate (integer)
- max_heart_rate (integer)
- avg_power (integer)
- max_power (integer)
- avg_speed_mps (float)
- max_speed_mps (float)
- elevation_gain_meters (float)
- elevation_loss_meters (float)
- gps_track (jsonb) -- Array of GPS coordinates
- sensor_data (jsonb) -- HR, power, cadence data
- samples_data (jsonb) -- Raw sensor samples
- raw_data (jsonb) -- Complete Garmin response
- created_at (timestamp)
```

#### `user_connections`
Stores OAuth connections to external services:
```sql
- id (UUID, primary key)
- user_id (UUID, foreign key)
- provider (text) -- 'garmin', 'strava'
- access_token (text)
- refresh_token (text)
- expires_at (timestamp)
- last_sync (timestamp)
- connection_data (jsonb) -- Additional OAuth data
- created_at (timestamp)
```

## 🔄 CORE COMPONENTS & FLOW

### 1. Training Baselines (`src/components/TrainingBaselines.tsx`)
**Purpose**: Collect user's current fitness level
**Data Collected**:
- Basic info (age, height, weight, gender)
- Selected disciplines (running, cycling, swimming, strength)
- Performance numbers for each discipline
- Injury history and equipment access
- Training background and current volume

**Key Functions**:
- `saveUserBaselines()` - Saves to `user_baselines` table
- `loadUserBaselines()` - Loads existing baseline data
- Discipline-specific performance number collection

### 2. Build System (`src/components/AIPlanBuilder.tsx` + Manual Builders)
**Purpose**: Create training plans using AI or manual methods
**Two Approaches**:

#### **AI Plan Builder** (`src/components/AIPlanBuilder.tsx`)
**Purpose**: AI-generated training plans based on user goals
**Supported Events**:
- **70.3 Triathlon** - Half Ironman distance
- **Half Marathon** - 13.1 mile running
- **Century** - 100 mile cycling
- **Speed/Endurance Improvement** - General fitness goals

**Key Features**:
- Always references user baseline data for intensity setting
- Customizable training philosophy (pyramid, polarized, balanced)
- Strength training integration
- Event-specific customization (course, climate, conditions)
- `generatePlan()` - Triggers AI analysis and plan generation
- `buildPlanPrompt()` - Creates AI prompt with user data

#### **Manual Workout Builders** (Multiple Components)
**Purpose**: Coach-friendly manual workout creation
**Components**:
- `src/components/WorkoutBuilder.tsx` - General workout builder
- `src/components/RunIntervalBuilder.tsx` - Running intervals
- `src/components/RideIntervalBuilder.tsx` - Cycling intervals  
- `src/components/SwimIntervalBuilder.tsx` - Swimming intervals
- `src/components/StrengthExerciseBuilder.tsx` - Strength training

**Features**:
- Beautiful UI for manual workout creation
- Interval-based workout design
- Exercise library integration
- Export to Garmin devices
- Coach-friendly interface

### 3. AI Analysis (`src/services/RealTrainingAI.ts`)
**Purpose**: Analyze user profile and generate training recommendations
**Process**:
1. Validates baseline data (discipline-based validation)
2. Calls OpenAI via Supabase Edge Function
3. Returns structured analysis with training philosophy, volume, intensity distribution

**Key Methods**:
- `analyzeUserProfile()` - Main analysis function
- `transformAIResponse()` - Converts AI response to structured data

### 4. Plan Engine (`src/services/PlanEngine.ts`)
**Purpose**: Generate unique training plans using AI analysis and user data
**Process**:
1. Validates required performance data (discipline-based)
2. Uses AI analysis to determine training structure
3. Generates 4-week preview with detailed workouts

**Key Methods**:
- `generatePreviewPlan()` - Main plan generation
- `generateWeeks()` - Creates week structure
- `generateWorkouts()` - Creates individual workouts
- `getWorkoutIntensity()` - Sets intensity based on baseline data

## 🔐 AUTHENTICATION & SECURITY

### Supabase Auth
- Email/password authentication
- Row Level Security (RLS) policies
- User-specific data access

### RLS Policies
```sql
-- Users can only access their own data
CREATE POLICY "Users can view own baselines" ON user_baselines
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own baselines" ON user_baselines
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own baselines" ON user_baselines
FOR UPDATE USING (auth.uid() = user_id);
```

## 🤖 AI INTEGRATION

### Edge Functions (`supabase/functions/`)

#### `analyze-user-profile/`
- Analyzes user baseline data and responses
- Returns training philosophy, volume, intensity distribution
- Uses OpenAI GPT-4 for analysis

#### `generate-plan/`
- Generates complete training plans
- Uses AI analysis results
- Returns structured plan data

### AI Analysis Flow
```
User Data → Edge Function → OpenAI → Structured Analysis → PlanEngine → Training Plan
```

## 🔄 GARMIN INTEGRATION FLOW

### Data Import Flow
```
Garmin Device → Garmin Connect → Webhook → Supabase → Workout Logging
```

### Workout Export Flow
```
PlanEngine → Structured Workout → FIT File → Garmin Device
```

### OAuth2 PKCE Flow
```
1. App generates PKCE challenge
2. User authorizes on Garmin Connect
3. Garmin returns authorization code
4. App exchanges code for access token
5. App stores token in user_connections table
6. App can now pull/push data
```

### Webhook Processing
- **Endpoint**: `/api/garmin-webhook`
- **Purpose**: Real-time activity notifications
- **Process**: 
  1. Garmin sends activity notification
  2. Webhook fetches activity details
  3. Data processed and stored in `garmin_activities`
  4. Workout automatically created in logging system

## 📱 KEY COMPONENTS

### Context Management (`src/contexts/AppContext.tsx`)
**Purpose**: Global state management for user data
**Key Functions**:
- `saveUserBaselines()` - Save fitness assessment
- `loadUserBaselines()` - Load existing data
- `hasUserBaselines()` - Check if user has completed assessment

### Data Services
- `src/services/GarminDataService.ts` - Garmin API integration
- `src/services/StravaDataService.ts` - Strava API integration
- `src/services/PlanEngine.ts` - Plan generation logic
- `src/services/RealTrainingAI.ts` - AI analysis service

### Workout Logging System (`src/hooks/useWorkouts.ts`)
**Purpose**: Complete workout management and logging
**Key Features**:
- **Workout CRUD**: Create, read, update, delete workouts
- **Multi-sport Support**: Running, cycling, swimming, strength
- **Interval Tracking**: Complex interval workouts with repeats
- **Strength Logging**: Sets, reps, weight, RIR tracking
- **Garmin Import**: Automatic workout import from Garmin devices
- **Progress Tracking**: Historical data and analytics

**Workout Types**:
```typescript
interface Workout {
  id: string;
  name: string;
  type: "run" | "ride" | "swim" | "strength";
  duration: number;
  date: string;
  workout_status?: "planned" | "completed" | "skipped" | "in_progress";
  intervals?: RunInterval[] | RideInterval[] | SwimInterval[];
  strength_exercises?: StrengthExercise[];
  // ... extensive metrics tracking
}
```

### Garmin Integration System

#### **Data Import** (`src/components/GarminConnect.tsx`)
**Purpose**: Pull workout data FROM Garmin devices
**Features**:
- OAuth2 PKCE authentication
- Automatic activity sync
- Real-time workout import
- Activity details with GPS, HR, power data

#### **Workout Export** (`src/components/GarminExport.tsx`)
**Purpose**: Push structured workouts TO Garmin devices
**Features**:
- FIT file generation
- Interval workout export
- Multi-sport workout support
- Device-specific formatting

#### **Webhook Processing** (`garmin-webhook-activities-working.ts`)
**Purpose**: Real-time activity processing
**Features**:
- Webhook endpoint for Garmin notifications
- Automatic activity processing
- GPS track and sensor data storage
- Power and heart rate analysis

### Workout Logging Components

#### **Strength Logger** (`src/components/StrengthLogger.tsx`)
**Purpose**: Log strength training workouts
**Features**:
- Exercise database with 50+ exercises
- Set/rep/weight tracking
- RIR (Reps in Reserve) tracking
- Plate calculator
- Progress tracking
- Auto-load planned workouts

#### **Mobility Logger** (`src/components/MobilityLogger.tsx`)
**Purpose**: Log mobility and flexibility workouts
**Features**:
- Mobility exercise tracking
- Completion status
- Duration tracking
- Integration with strength plans

#### **Workout Builder** (`src/components/WorkoutBuilder.tsx`)
**Purpose**: Create structured workouts
**Features**:
- Interval builder for running/cycling/swimming
- Strength exercise builder
- Workout templates
- Export to Garmin devices

### Core UI Components

#### **Calendar Interface** (`src/components/WorkoutCalendar.tsx`)
**Purpose**: Main app interface and date navigation
**Features**:
- Today's efforts display at top
- Date selection with swipe navigation
- Planned workout preview
- Integration with workout logging

#### **Today's Efforts** (`src/components/TodaysEffort.tsx`)
**Purpose**: Shows planned workouts for selected date
**Features**:
- Workout list for current date
- Status indicators (planned/completed/skipped)
- Quick access to workout details
- Integration with swipe navigation

#### **Workout Detail** (`src/components/WorkoutDetail.tsx`)
**Purpose**: Individual workout analysis with tab navigation
**Current Features**:
- **Summary Tab**: Workout metrics and comments
- **Completed Tab**: Comprehensive workout analytics (see below)
- Delete functionality
- Comments editing

**Completed Tab Analytics** (`src/components/CompletedTab.tsx`):
**Purpose**: Professional-level workout analysis with multi-sport overview
**Features**:
- **Comprehensive Metrics**: 15+ performance metrics (power, HR, speed, cadence, TSS, etc.)
- **GPS/Elevation Visualization**: Interactive charts and route maps
- **Advanced Analytics Tabs**:
  - **Power Curve**: FTP analysis and power distribution
  - **Power Details**: Pedal metrics, torque effectiveness, stroke data
  - **Zones**: HR and power zone analysis
  - **User Profile**: Physical data and device settings
  - **Norwegian Method**: Advanced training analysis
- **Multi-Sport Overview**:
  - **7-Day Training Load**: Cross-sport TSS tracking
  - **6-Week Progression**: FTP, HR, VO2 max trends
  - **Recovery Status**: Training stress balance analysis
  - **Cross-Training Correlations**: Sport-to-sport performance relationships

#### **Workout Summary** (`src/components/WorkoutSummary.tsx`)
**Purpose**: Swipe panel workout summary
**Features**:
- Quick workout overview
- Basic metrics display
- Delete functionality
- Back to calendar navigation

### Supporting UI Components
- `src/components/ui/` - shadcn/ui components
- `src/components/WorkoutBuilder.tsx` - Workout creation
- `src/components/StrengthTracker.tsx` - Strength tracking
- `src/components/WorkoutList.tsx` - Workout listing

## 🏗️ COMPONENT ARCHITECTURE

### **Plan Building Flow Components:**

#### **Entry Point:**
- **Calendar Interface** (`src/components/WorkoutCalendar.tsx`)
  - Contains "Build" dropdown/button
  - Triggers plan building flow

#### **Plan Builder Components:**
- **AIPlanBuilder** (`src/components/AIPlanBuilder.tsx`)
  - Main plan building interface
  - Collects user goals and preferences
  - Calls RealTrainingAI service

#### **Data Services:**
- **RealTrainingAI** (`src/services/RealTrainingAI.ts`)
  - Analyzes user profile
  - Calls Supabase Edge Function
  - Returns structured analysis

#### **Edge Functions:**
- **analyze-user-profile** (`supabase/functions/analyze-user-profile/`)
  - Processes user baseline data
  - Returns training recommendations

#### **Data Flow:**
```
Calendar → AIPlanBuilder → RealTrainingAI → Edge Function → Plan Generation
```

### **Data Structure Mapping Issues:**

#### **Frontend (TrainingBaselines.tsx):**
```typescript
interface BaselineData {
  performanceNumbers: {
    ftp?: number;
    fiveK?: string;
    tenK?: string;
    squat?: number;
    // etc.
  };
  disciplines: string[];
  // etc.
}
```

#### **Database Tables (Supabase):**
```sql
-- Core Tables
user_baselines          -- User fitness assessment data
plans                   -- Generated training plans
workouts                -- Individual workout logs
garmin_activities       -- Imported Garmin activity data
user_connections        -- OAuth connections (Garmin, Strava)

-- Supporting Tables
device_connections      -- Device integration data
plan_assessments        -- Plan assessment responses
routines               -- Workout routines
training_plans         -- Training plan templates
users                  -- User accounts
workout_data           -- Detailed workout metrics
workout_intervals      -- Interval workout data
```

#### **user_baselines Table Structure:**
```sql
-- Table exists but creation migration not found in files
-- Based on usage patterns and comments:

CREATE TABLE user_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  performance_numbers JSONB,  -- Contains: fiveK, easyPace, tenK, halfMarathon, marathon, ftp, avgSpeed, swimPace100, swim200Time, swim400Time, squat, deadlift, bench
  disciplines TEXT[],         -- Array of selected disciplines
  -- other baseline fields (structure needs verification)
);
```

#### **API Access (RealTrainingAI.ts):**
```typescript
// Tries to access: userBaselines.performanceNumbers
// But database returns: userBaselines.performance_numbers
```

#### **The Problem:**
- **Field naming mismatch**: Frontend uses `performanceNumbers`, database uses `performance_numbers`
- **Data transformation**: Need to map between frontend and database structures
- **Reference issues**: RealTrainingAI expects specific field names

## 🔧 DEVELOPMENT WORKFLOW

### Local Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

### Database Migrations
```bash
supabase db reset    # Reset local database
supabase db push     # Push migrations to remote
supabase functions deploy  # Deploy edge functions
```

### Key Environment Variables
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_key
```

## 🐛 COMMON ISSUES & SOLUTIONS

### 1. "MISSING: 10K pace" Error
**Cause**: PlanEngine requires ALL performance numbers regardless of selected disciplines
**Solution**: Implement discipline-based validation in PlanEngine.ts

### 2. 406 (Not Acceptable) Error
**Cause**: Supabase query using `single()` when no data exists
**Solution**: Use `maybeSingle()` for optional data queries

### 3. Baseline Data Not Loading
**Cause**: RLS policies or missing user authentication
**Solution**: Check auth state and RLS policies

### 4. 5K Metric Extraction Issues
**Cause**: Neither Garmin nor Strava can extract 5K pace from longer runs
**Solution**: Implement pace calculation from longer run data or manual entry

### 5. Strava Webhook Implementation
**Cause**: Currently only local API, no webhook processing
**Solution**: Implement webhook endpoints for real-time data sync

### 6. Navigation Restructuring
**Cause**: Dropdown navigation on calendar page is not optimal
**Solution**: Move to bottom navigation with Build, Log, Plans, Overview buttons

### 7. Insights Dashboard Implementation
**Cause**: Need Strava-like insights for overall performance
**Solution**: Create comprehensive dashboard with TSS, performance trends, multi-sport analytics

### 8. Auto-Population from Plans
**Cause**: Plans don't automatically populate log fields
**Solution**: Implement plan-to-logger data flow

### 9. Powerlifter Timer
**Cause**: Missing rest timer functionality
**Solution**: Implement timer for rest periods between sets

### 8. Garmin Connection Issues
**Cause**: OAuth token expired or invalid
**Solution**: Implement token refresh logic in GarminConnect.tsx

### 9. Workout Import Failures
**Cause**: Webhook processing errors or data format issues
**Solution**: Check webhook logs and validate data structure

### 10. Device Push Failures
**Cause**: FIT file format issues or device compatibility
**Solution**: Validate FIT file structure and device support

## 🎯 TRAINING PLAN ARCHITECTURE

### Plan Structure
```typescript
interface TrainingPlan {
  name: string;
  description: string;
  phase: string;
  trainingPhilosophy: 'pyramid' | 'polarized' | 'balanced';
  weeks: Week[];
}

interface Week {
  weekNumber: number;
  focus: string;
  phase: 'Base' | 'Build' | 'Peak' | 'Taper' | 'Recovery';
  workouts: Workout[];
}

interface Workout {
  day: string;
  type: 'swim' | 'bike' | 'run' | 'strength' | 'rest';
  duration: string;
  warmup?: string;
  main: string;
  cooldown?: string;
  notes?: string;
}
```

### Intensity Calculation
- **Running**: Based on 5K/10K paces from baseline data
- **Cycling**: Based on FTP from baseline data
- **Swimming**: Based on 100m pace from baseline data
- **Strength**: Based on 1RM data from baseline data

## 🔄 DATA VALIDATION RULES

### Training Baselines Validation
- Required: Age, selected disciplines, performance numbers for selected disciplines
- Optional: Height, weight, injury history, equipment

### Plan Builder Validation
- Required: Event type, training philosophy, goals
- Optional: Specific event details, course information

### AI Analysis Validation
- Validates baseline data based on user's selected disciplines
- Only requires performance numbers for disciplines user is training

## 🚀 DEPLOYMENT

### Vercel Deployment
- Automatic deployment from main branch
- Environment variables configured in Vercel dashboard
- Supabase integration for database and edge functions

### Production Checklist
- [ ] Environment variables set
- [ ] Supabase RLS policies configured
- [ ] Edge functions deployed
- [ ] Database migrations applied
- [ ] OpenAI API key configured

## 📈 FUTURE ENHANCEMENTS

### Planned Features
- **Auto-Population**: Plans automatically populate log fields
- **Powerlifter Timer**: Rest timer between sets
- **5K Pace Calculation**: Extract from longer run data
- **Strava Webhooks**: Real-time data sync
- **Advanced Analytics**: Multi-sport correlation insights
- **Mobile App**: Native mobile development
- **Social Features**: Sharing and community
- **Advanced AI Coaching**: Personalized insights

### Technical Improvements
- **Performance Optimization**: Faster data processing
- **Enhanced Error Handling**: Better user feedback
- **Data Validation**: Improved baseline collection
- **AI Prompt Engineering**: Better plan generation
- **Webhook Processing**: Real-time data integration

---

## 🆘 TROUBLESHOOTING GUIDE

### Debugging Steps
1. Check browser console for errors
2. Verify Supabase connection
3. Check RLS policies
4. Validate data structure
5. Test edge functions locally

### Common Commands
```bash
# Check git status
git status

# View recent changes
git diff

# Revert file to deployed state
git restore src/services/PlanEngine.ts

# Check Supabase logs
supabase logs
```

---

*This bible should be updated as the app evolves. Last updated: [Current Date]* 