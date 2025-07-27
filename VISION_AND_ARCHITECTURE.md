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
- 🧠 **AI-powered training plans** (RealTrainingAI)
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
- **RealTrainingAI** - AI-powered training plan generation

## Current State (July 2025)

### ✅ Working Features
- **Garmin Integration**: Complete webhook processing with 10k+ samples per workout
- **Database Schema**: Comprehensive `garmin_activities` table with rich sensor data
- **AI Training Plans**: RealTrainingAI integration for personalized workouts
- **Strength Logger**: Advanced features (plate math, RIR tracking, exercise autocomplete)
- **Calendar Interface**: Date-based workout planning and viewing
- **Completed Tab**: Detailed workout analysis with sensor data visualization

### 🔧 Recently Fixed
- **Garmin Webhook Processing**: Successfully implemented API calls to fetch detailed activity data
- **Sample Data Integration**: Now receiving power, heart rate, GPS, temperature data
- **User Lookup**: Fixed database queries for proper user association
- **Payload Structure**: Corrected activity detail processing

### 📊 Data Flow
1. **Garmin Device** → Records activity with sensor data
2. **Garmin Webhook** → Sends basic activity summary to Supabase Edge Function
3. **Edge Function** → Makes API call to fetch detailed samples
4. **Database** → Stores rich sensor data (10k+ points per workout)
5. **Frontend** → Displays comprehensive analytics and insights

## UI/UX Vision

### Navigation Flow
- **Calendar View** → Primary interface for date selection
- **Swipe Navigation** → Smooth transitions between planned activities
- **Completed Activities** → Accessible from calendar with detailed analytics
- **Strength Logger** → Manual entry with AI plan integration

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
- [ ] **User Profile** - Training baselines, AI plan customization
- [ ] **Comparative Analytics** - Progress tracking, trend analysis

### Phase 3: AI Enhancement
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

### AI Integration
- **Problem**: Training plans need user baseline data
- **Solution**: Training baselines component with manual and data-driven options
- **Result**: Personalized AI-generated training plans

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
- **AI-powered coaching** that adapts to their data
- **Multi-sport integration** that sees the bigger picture
- **Beautiful, intuitive interface** that gets out of the way

**The goal**: Make advanced training intelligence accessible to every athlete through elegant, minimalist design and powerful underlying technology.

---

*This document serves as the source of truth for development decisions and architectural choices. It should be updated as the platform evolves.* 