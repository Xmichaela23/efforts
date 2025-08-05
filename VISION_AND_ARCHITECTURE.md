# Efforts - Vision & Architecture

## Core Philosophy

**"Simple unassuming Scandinavian minimalist that burns the planet down in tokens of information"**

### Design Principles
- **Scandinavian Minimalism**: Clean, functional, no visual clutter
- **Data-Driven Insights**: Let the information speak for itself
- **User-Focused**: Intuitive interface, no learning curve
- **Powerful Underneath**: Complex analytics hidden behind simple UI

## App Overview

**Efforts** is a comprehensive fitness training platform that combines:
- 🏃‍♂️ **Multi-sport activity tracking** (Garmin, Strava integration)
- 🏋️‍♂️ **Advanced strength logging** (plate math, RIR tracking)
- 🧮 **Template-based training plans** (SimpleTrainingService)
- 📊 **Professional-level analytics** (power curves, training zones)
- 🎯 **Personalized coaching insights** (cross-training correlations)

## Technical Architecture

### Frontend
- **React + TypeScript** - Modern, type-safe development
- **Tailwind CSS** - Utility-first styling for rapid development
- **Shadcn/ui** - High-quality, accessible components
- **Vite** - Fast development and build tooling

### Backend
- **Supabase** - Database, authentication, real-time features
- **Edge Functions** - Serverless webhook processing
- **Row Level Security (RLS)** - Secure data access
- **PostgreSQL** - Robust relational database

### Integrations
- **Garmin Connect API** - Activity data, webhooks, real-time sync
- **Strava API** - Additional fitness data sources
- **SimpleTrainingService** - Template-based training plan generation

## Current State (July 2025)

### ✅ Working Features
- **Garmin Integration**: Complete webhook processing with 10k+ samples per workout
- **Database Schema**: Comprehensive `garmin_activities` table with rich sensor data
- **Template-Based Training Plans**: SimpleTrainingService with proven polarized training
- **Strength Logger**: Advanced features (plate math, RIR tracking, exercise autocomplete)
- **Calendar Interface**: Date-based workout planning and viewing
- **Completed Tab**: Detailed workout analysis with sensor data visualization

### 🔧 Recently Fixed
- **Garmin Webhook Processing**: Successfully implemented API calls to fetch detailed activity data
- **Sample Data Integration**: Now receiving power, heart rate, GPS, temperature data
- **User Lookup**: Fixed database queries for proper user association
- **Payload Structure**: Corrected activity detail processing
- **Template Architecture**: Implemented proven polarized training with distance-appropriate templates

### 📊 Data Flow
1. **Garmin Device** → Records activity with sensor data
2. **Garmin Webhook** → Sends basic activity summary to Supabase Edge Function
3. **Edge Function** → Makes API call to fetch detailed samples
4. **Database** → Stores rich sensor data (10k+ points per workout)
5. **Frontend** → Displays comprehensive analytics and insights

## Training Plan Scope & Validation Framework

### Target Athlete Profile
**"You're fit, you want to challenge yourself, you want to improve, you want to track multisport and strength"**

- **Age Range**: 35-55 years old
- **Fitness Level**: Already fit with basic endurance
- **Experience**: Not "couch to Ironman" - has base fitness
- **Goals**: Challenge, improve, track multisport and strength
- **Health Status**: Healthy, no injuries, cleared for exercise

### Distances Supported
- **Sprint Triathlon**: 4-7 hours/week (3-5 hours base + 1-2 hours strength)
- **Olympic Triathlon**: 6-10 hours/week (5-8 hours base + 1-2 hours strength)  
- **70.3 Triathlon**: 8-15 hours/week (7-13 hours base + 1-2 hours strength)

### Scientific Foundation
**Polarized Training (80/20 Rule) - Proven Science for Endurance Athletes**

- **Low Intensity (75-85%)**: Zone 1-2, aerobic base building, recovery
- **High Intensity (15-25%)**: Zone 3-5, threshold improvement, VO2max
- **Progressive Overload**: Gradual volume and intensity increases across phases
- **Recovery Spacing**: Age-appropriate recovery between quality sessions

### Validation Framework

#### High Confidence Validation (90%+)
```typescript
interface HighConfidenceValidation {
  polarizedTraining: '80/20_rule_proven_science';
  progressiveOverload: 'phase_based_progression';
  sessionBalance: 'swim_bike_run_strength_distribution';
  baselineIntegration: 'user_data_personalization';
  recoverySpacing: 'age_appropriate_recovery';
}
```

#### Validation Parameters
- **Polarized Distribution**: 75-85% low intensity, 15-25% high intensity
- **Progressive Overload**: 10-30% volume increase between phases
- **Session Balance**: 2-3 swim, 2-3 bike, 2-3 run, 1-2 strength sessions/week
- **Recovery Spacing**: Minimum 2 days between quality sessions
- **Equipment Compatibility**: Exercises match available equipment

#### Internal Validation Process
1. **Pre-Generation**: Validate athlete profile and baseline data
2. **Generation**: Validate template creation and personalization
3. **Post-Generation**: Validate polarized training, progressive overload, session balance
4. **Auto-Correction**: Automatically fix validation issues when possible
5. **Confidence Scoring**: Rate plan quality (85%+ = guaranteed)

### Disclaimers & Transparency
- **Medical**: Not medical advice - consult doctor before training
- **Individual**: Results may vary - designed for healthy 35-55 year olds
- **Responsibility**: Athlete owns their training and safety
- **Science**: Based on proven polarized training principles
- **Scope**: Sprint, Olympic, 70.3 distances only

## Algorithm Training Plan Architecture

### Template-Based Architecture
- **Step 1**: Template Selection - Distance-appropriate base templates
- **Step 2**: Polarized Distribution - 80% easy, 20% hard intensity
- **Step 3**: Strength Integration - Non-consecutive placement
- **Step 4**: Discipline Focus - Volume adjustments
- **Step 5**: Long Session Preferences - User timing
- **Step 6**: Final Scaling & Detailed Workouts - User-specific paces and FTP

### Distance-Based Templates
- **Sprint**: 4-6 days, 6-8 hours/week
- **Olympic**: 5-6 days, 8-12 hours/week
- **70.3**: 5-7 days, 10-15 hours/week
- **Ironman**: 6-7 days, 12-20 hours/week

### Strength Integration Options
- **Power Development**: Plyometrics, explosive movements (2x/week)
- **Stability Focus**: Single-leg stability, core work (2x/week)
- **Compound Strength**: Heavy compound lifts (2x/week)
- **Cowboy Endurance**: Endurance strength + aesthetics (3x/week)
- **Cowboy Compound**: Heavy compounds + aesthetics (3x/week)

## UI/UX Vision

### Navigation Flow
- **Calendar View** → Primary interface for date selection
- **Swipe Navigation** → Smooth transitions between planned activities
- **Completed Activities** → Accessible from calendar with detailed analytics
- **Strength Logger** → Manual entry with algorithm plan integration

### Key Screens
- **Overview Dashboard**: 7-day training load, 6-week progression, recovery status
- **Power Curve Analysis**: FTP tracking, training zones, performance trends
- **Elevation Charts**: Dynamic switching between HR, Speed, Power, VAM
- **Strength Completed View**: Planned vs actual comparison, volume calculations

### Design Language
- **Minimalist Interface**: Clean lines, ample white space
- **Data Visualization**: Charts and graphs that tell stories
- **Progressive Disclosure**: Show essential info first, details on demand
- **Consistent Typography**: Clear hierarchy, readable at all sizes

## Development Roadmap

### Phase 1: UI Streamlining (Current)
- [ ] **Remove redundant "Completed" tab** - Access via calendar
- [ ] **Enhance elevation charts** - Dynamic metric switching
- [ ] **Polish strength logger** - Better plate math, plan integration
- [ ] **Optimize mobile experience** - Swipe gestures, responsive design

### Phase 2: Analytics Implementation
- [ ] **Power Curve Analysis** - FTP calculations, training stress
- [ ] **Zone Analysis** - Time in zones, training load distribution
- [ ] **User Profile** - Training baselines, algorithm plan customization
- [ ] **Comparative Analytics** - Progress tracking, trend analysis

### Phase 3: Algorithm Enhancement
- [ ] **Advanced Insights** - Cross-training correlations, recovery optimization
- [ ] **Predictive Analytics** - Performance forecasting, injury prevention
- [ ] **Personalized Coaching** - Dynamic plan adjustments based on data
- [ ] **Social Features** - Training groups, leaderboards (optional)

## Technical Challenges Solved

### Garmin Integration Complexity
- **Problem**: Webhooks only send basic summaries, not detailed samples
- **Solution**: Implemented API calls within webhook handler to fetch rich data
- **Result**: Now receiving 10k+ data points per workout with full sensor data

### Data Architecture
- **Problem**: Complex fitness data requires flexible schema
- **Solution**: JSONB columns for sensor data, structured columns for analytics
- **Result**: Efficient storage and querying of time-series data

### Algorithm Integration
- **Problem**: Training plans need user baseline data
- **Solution**: Training baselines component with manual and data-driven options
- **Result**: Personalized algorithm-generated training plans

## Success Metrics

### User Experience
- **Zero Learning Curve**: Users can navigate intuitively
- **Rich Data Display**: Comprehensive workout analytics
- **Fast Performance**: Smooth interactions, quick data loading
- **Mobile-First**: Optimized for on-the-go use

### Technical Performance
- **Data Accuracy**: Reliable sensor data processing
- **Real-Time Sync**: Immediate workout updates
- **Scalability**: Handle multiple users and high data volumes
- **Reliability**: Robust error handling and recovery

## Vision Statement

**Efforts** aims to be the definitive training platform for serious athletes who want:
- **Professional-level analytics** without the complexity
- **Algorithm-powered coaching** that adapts to their data
- **Multi-sport integration** that sees the bigger picture
- **Beautiful, intuitive interface** that gets out of the way

**The goal**: Make advanced training intelligence accessible to every athlete through elegant, minimalist design and powerful underlying technology.

---

*This document serves as the source of truth for development decisions and architectural choices. It should be updated as the platform evolves.* 