# Component Dependency Map

## Critical Integration Points

### AppContext (Central State Manager)
**Dependencies:**
- All components consume AppContext
- Manages: workouts, plans, user baselines, units, sidebar state

**Critical Functions:**
- `addWorkout()` - Used by: WorkoutForm, FitFileImporter, StravaPreview, GarminPreview
- `updateWorkout()` - Used by: WorkoutDetail, CompletedTab
- `saveUserBaselines()` - Used by: TrainingBaselines, PlanBuilder
- `loadUserBaselines()` - Used by: PlanBuilder, TrainingBaselines

**⚠️ Breaking Changes:**
- Modifying AppContext interfaces affects ALL components
- State structure changes require coordinated updates

### PlanBuilder (AI Integration Hub)
**Dependencies:**
- RealTrainingAI service
- TrainingBaselines data
- AppContext for plan storage

**Data Flow:**
```
User Assessment → PlanBuilder → RealTrainingAI → Generated Plan → AppContext → UI Display
```

**⚠️ Critical Points:**
- Assessment interface changes affect AI prompt generation
- Plan structure must match AppContext expectations
- TrainingBaselines integration is complex

### FitFileImporter (Data Processing)
**Dependencies:**
- AppLayout (receives imported data)
- AppContext (adds workouts to state)
- CompletedTab (displays imported workouts)

**Data Flow:**
```
FIT File → FitFileImporter → Processed Data → AppLayout → AppContext → CompletedTab
```

**⚠️ Critical Points:**
- Data structure must match Workout interface
- All metrics must be properly extracted and normalized
- UI updates depend on correct data flow

### External API Integrations

#### Strava Integration
**Components:**
- StravaCallback (OAuth)
- StravaPreview (data preview)
- StravaDataService (API calls)

**Dependencies:**
- AppContext for storing imported workouts
- Workout interface compatibility

#### Garmin Integration
**Components:**
- GarminCallback (OAuth)
- GarminPreview (data preview)
- GarminDataService (API calls)
- GarminAutoSync (webhook processing)

**Dependencies:**
- AppContext for storing imported workouts
- Webhook endpoint handling
- Real-time data sync

## Integration Complexity Matrix

| Component | Strava | Garmin | FIT Files | AI Plans | Manual Entry |
|-----------|--------|--------|-----------|----------|--------------|
| AppContext | ✅ | 🔄 | ✅ | ✅ | ✅ |
| PlanBuilder | ❌ | ❌ | ❌ | ✅ | ❌ |
| FitFileImporter | ❌ | ❌ | ✅ | ❌ | ❌ |
| StravaPreview | ✅ | ❌ | ❌ | ❌ | ❌ |
| GarminPreview | ❌ | 🔄 | ❌ | ❌ | ❌ |
| WorkoutForm | ❌ | ❌ | ❌ | ❌ | ✅ |

**Legend:**
- ✅ Fully integrated
- 🔄 In progress
- ❌ No integration

## Change Impact Assessment

### High Impact Changes
1. **AppContext interface modifications** - Affects ALL components
2. **Workout data structure changes** - Breaks imports and displays
3. **API integration modifications** - Affects data flow chains
4. **Plan structure changes** - Breaks AI generation pipeline

### Medium Impact Changes
1. **UI component modifications** - May affect data display
2. **Service layer changes** - Affects specific integrations
3. **Database schema changes** - Requires migration coordination

### Low Impact Changes
1. **Styling updates** - Minimal cross-component effects
2. **Utility function additions** - Usually isolated
3. **Documentation updates** - No functional impact

## Testing Strategy for Changes

### Before Making Changes
1. **Identify affected components** using this dependency map
2. **Test data flow** through all integration points
3. **Verify API integrations** still function
4. **Check UI consistency** across all displays

### After Making Changes
1. **Test all import flows** (Strava, Garmin, FIT files)
2. **Verify plan generation** still works
3. **Check manual entry** functionality
4. **Validate data display** in all views

## Session Continuity Protocol

### When Starting New Session
1. **Reference this dependency map** for context
2. **Check DEVELOPMENT_STATUS.md** for current state
3. **Identify integration points** that might be affected
4. **Plan testing strategy** before making changes

### When Ending Session
1. **Update dependency map** if new integrations added
2. **Document breaking changes** made
3. **Note next integration priorities**
4. **Update session continuity notes** 