# TRIATHLON TRAINING SYSTEM - COMPLETE CONTEXT

## PROJECT OVERVIEW
Building a personalized triathlon training plan generator using **template-based approach** with polarized training principles (80/20 ratio) and scientific soundness. System currently generates plans for Sprint triathlon with plans to extend to Olympic, 70.3, and Ironman distances.

## CURRENT ARCHITECTURE

### Core Files
- `src/services/SimpleTrainingService.ts` - Template-based algorithm for Sprint triathlon
- `src/components/SimplePlanBuilder.tsx` - Main UI component with 4-step assessment
- `src/contexts/AppContext.tsx` - User baseline management
- `src/components/TrainingBaselines.tsx` - Baseline data collection

### Key Functions (from SimpleTrainingService.ts)
```typescript
// Core template functions
generateSprintPlan() - Main entry point for plan generation
createPersonalizedTemplate() - Creates base template with user baselines
scaleSessions() - Applies time multipliers based on user commitment
addStrengthSessions() - Integrates strength based on user preference
adjustLongSessionDays() - Distributes sessions around user's chosen long day
createWeeklyProgression() - Creates 12-week progressive plans
```

## SCIENTIFIC FOUNDATION

### 5-Zone Training System
- Zone 1: Recovery
- Zone 2: Endurance (80% of training)
- Zone 3: Tempo/Threshold
- Zone 4: VO2max
- Zone 5: Anaerobic (20% of training)

### Polarized Distribution
- 80% easy sessions (Zone 1-2)
- 20% hard sessions (Zone 3-5)
- Maintained across all strength options

### Strength Integration Options
- `none` - 0 sessions, pure endurance
- `traditional` - 2 sessions, traditional strength training
- `compound` - 2 sessions, compound lifts with evidence-based percentages
- `cowboy_endurance` - 3 sessions, traditional + upper body focus
- `cowboy_compound` - 3 sessions, compound + upper body focus

## CURRENT STATUS

### ✅ WORKING SYSTEM
- **Sprint Triathlon**: Fully functional with template-based approach
- **Template System**: Proven and ready for expansion
- **UI/UX**: Clean, minimal interface with professional workout details
- **Personalization**: All targets based on user baseline data
- **Scientific Validation**: Evidence-based training principles maintained

### 🏆 What We've Achieved
1. **Template-based approach** using base templates + multipliers
2. **4-step assessment flow** (Distance → Strength → Time → Long Session Day)
3. **Personalized targets** based on user baselines (FTP, paces, 1RM)
4. **12-week progressive plans** with proper phase progression
5. **Professional workout details** with warm-ups, cool-downs, and target ranges
6. **Clean, minimal UI** with tabbed week navigation

## CURRENT SPRINT TEMPLATE

### Base Template (6 hours/week, 5 days, polarized)
```typescript
const SPRINT_BASE_TEMPLATE: SimpleSession[] = [
  {
    day: 'TBD', // Distributed by reverse engineering logic
    discipline: 'swim',
    type: 'recovery',
    duration: 30,
    intensity: 'Zone 1 (Recovery - <75% HR)',
    zones: [1]
  },
  {
    day: 'TBD',
    discipline: 'strength',
    type: 'endurance',
    duration: 45,
    intensity: 'Traditional strength',
    zones: [2]
  },
  // ... additional sessions
]
```

### Time Multipliers
```typescript
const SPRINT_TIME_MULTIPLIERS = {
  minimum: 0.8,   // 4.8 hours/week
  moderate: 1.0,  // 6.0 hours/week
  serious: 1.2,   // 7.2 hours/week
  hardcore: 1.4   // 8.4 hours/week
}
```

### Strength Additions
```typescript
const SPRINT_STRENGTH_ADDITIONS = {
  none: 0,
  traditional: 1.5,      // +1.5 hours
  compound: 2.0,         // +2.0 hours
  cowboy_endurance: 3.0, // +3.0 hours
  cowboy_compound: 3.5   // +3.5 hours
}
```

## PERSONALIZATION SYSTEM

### User Baseline Integration
- **FTP**: Bike power targets (65-85% FTP for endurance)
- **5K Pace**: Run pace targets (tempo and threshold paces)
- **Easy Pace**: Recovery and endurance run paces
- **Swim Pace**: Swim targets (recovery and endurance)
- **1RM Values**: Strength workout weights (80-85% 1RM for compounds)
- **Age**: Heart rate zone calculations (220-age formula)

### Target Calculation Examples
```typescript
// Bike power targets
const easyBikePower = userBaselines.ftp ? Math.round(userBaselines.ftp * 0.65) : 160;
const enduranceBikePower = userBaselines.ftp ? Math.round(userBaselines.ftp * 0.75) : 185;

// Run pace targets
const easyRunPace = this.calculateEasyRunPace(userBaselines);
const tempoRunPace = this.calculateTempoRunPace(userBaselines);

// Strength weights
const squat = Math.round(userBaselines.squat1RM * 0.8 / 5) * 5; // 80% 1RM, rounded to 5s
```

## RESEARCH FOUNDATION

### Evidence-Based Training
- **Lauersen et al. (2014)**: Injury prevention
- **Rønnestad & Mujika (2014)**: Cycling performance
- **Beattie et al. (2014)**: Running economy
- **Seiler & Tønnessen**: Polarized training model

### Strength Training Percentages
- **80-85% 1RM**: Standard strength training protocols
- **3-4 minute rest**: Appropriate for compound lifts
- **Progressive overload**: Systematic increases across training phases
- **Recovery spacing**: Proper session distribution prevents overtraining

## UI/UX DESIGN

### Assessment Flow
1. **Distance**: Sprint Triathlon (currently implemented)
2. **Strength**: 5 options from none to cowboy compound
3. **Time**: 4 levels (minimum to hardcore) with clear hour ranges
4. **Long Session Day**: User picks their preferred long workout day

### Plan Display
- **Professional Layout**: Clean, minimal design with tabbed weeks
- **Detailed Workouts**: Warm-ups, main sets, cool-downs with target ranges
- **Personalized Targets**: All based on user's actual baseline data
- **Rounded Weights**: Easy plate math for strength workouts
- **Proper Spacing**: Sessions distributed around long day with recovery

## NEXT STEPS

### Immediate Priorities
1. **Extend to Olympic distance** using the same template approach
2. **Enhance strength workouts** with more detailed prescriptions
3. **Add advanced features** like plan comparison and analytics
4. **Improve real-time sync** for better data integration

### Development Guidelines
1. **Maintain simplicity**: Keep the template-based approach
2. **Preserve personalization**: All plans must use user baselines
3. **Follow science**: Maintain evidence-based training principles
4. **Keep UI clean**: Minimal design with professional presentation

## SUCCESS METRICS

### Technical Success
- ✅ **Template system working**: Clean, scalable approach
- ✅ **Personalization working**: All targets based on user data
- ✅ **UI/UX working**: Professional, minimal interface
- ✅ **Scientific validation**: Evidence-based training principles

### User Success
- ✅ **Professional plans**: Detailed, realistic workouts
- ✅ **Easy to use**: Simple 4-step assessment flow
- ✅ **Personalized**: All targets match user's actual fitness
- ✅ **Scalable**: Template approach works for different users

**The system is working well with a clean, template-based approach that generates professional, personalized training plans!** 🎯 