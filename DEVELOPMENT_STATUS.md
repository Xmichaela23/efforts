# Development Status & Integration Guide

## Current App Complexity Level
- **Multi-sport training platform** with AI-powered plan generation
- **External API integrations**: Strava, Garmin Connect
- **Real-time data processing**: FIT files, workout metrics
- **Complex state management**: AppContext with nested data structures
- **Backend integration**: Supabase with custom migrations

## Core System Architecture

### Frontend Components
- **AppContext**: Central state management for workouts, plans, user baselines
- **PlanBuilder**: AI-powered training plan generation with assessment flows
- **Workout tracking**: Manual entry + imported data (Strava/Garmin/FIT files)
- **Training baselines**: Comprehensive user profiling system
- **Multi-sport support**: Running, cycling, swimming, strength, triathlon

### Backend Services
- **Supabase**: Database, authentication, real-time subscriptions
- **RealTrainingAI**: AI service for personalized plan generation
- **External APIs**: Strava Data Service, Garmin Data Service

### Data Flow Complexity
```
User Input → Assessment → AI Plan Generation → Plan Storage → Workout Execution → Data Import → Metrics Processing → UI Updates
```

## Integration Status

### ✅ Working Integrations
- **Strava**: OAuth flow, workout import, data preview
- **FIT File Import**: Complete workout data extraction
- **Manual Workout Entry**: All sports supported
- **AI Plan Generation**: Assessment-based personalized plans
- **User Baselines**: Comprehensive fitness profiling

### 🔄 In Progress
- **Garmin Connect**: OAuth flow implemented, data import in development
- **Real-time sync**: Webhook processing for live data updates

### 🚧 Known Complexity Points
- **Garmin webhook handling**: Requires robust error handling and retry logic
- **AI integration scaling**: Plan generation with complex user profiles
- **Multi-sport data normalization**: Different metrics across disciplines
- **State synchronization**: Keeping UI in sync with imported data

## Critical Dependencies

### Component Interdependencies
- **AppContext** ↔ **All components**: Central state management
- **FitFileImporter** ↔ **AppLayout** ↔ **CompletedTab**: Data flow chain
- **PlanBuilder** ↔ **RealTrainingAI** ↔ **AppContext**: Plan generation pipeline
- **TrainingBaselines** ↔ **PlanBuilder**: User profile integration

### External Dependencies
- **Supabase migrations**: Database schema changes
- **API rate limits**: Strava/Garmin usage constraints
- **FIT file parsing**: Complex binary data structure

## Development Guidelines

### When Making Changes
1. **Check component dependencies** before modifying shared state
2. **Test data flow** from import → processing → display
3. **Verify API integrations** still work after changes
4. **Update this document** when adding new integrations

### Integration Complexity Factors
- **OAuth flows**: Require proper error handling and state management
- **Data normalization**: Different APIs return different formats
- **Real-time updates**: Webhooks need robust processing
- **User experience**: Complex flows need clear feedback

## Next Development Priorities
1. **Complete Garmin integration** with webhook processing
2. **Enhance AI plan generation** with more sophisticated training science
3. **Improve real-time data sync** across all integrations
4. **Add advanced analytics** for training progress tracking

## Session Continuity Notes
- **Current focus**: Garmin webhook implementation
- **Recent changes**: Enhanced FIT file data extraction
- **Known issues**: None currently blocking
- **Next session goals**: [Update this section as needed] 