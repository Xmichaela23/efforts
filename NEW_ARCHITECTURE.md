# Current Architecture: JSON Rules Engine Training Plan System

## Overview

This document outlines our current **JSON Rules Engine approach** that generates personalized, science-based training plans using json-rules-engine (2,874 stars), user baseline data, and scalable rule-based architecture.

## 🚨 CRITICAL RULE: NO FALLBACKS - REAL USER BASELINE DATA ONLY

### **⚠️ ABSOLUTE REQUIREMENT: User Baseline Data Must Be Complete**
The JSON Rules Engine **WILL NOT WORK** without complete user baseline data. This is by design to ensure scientific accuracy.

#### **✅ REQUIRED BASELINE DATA:**
- **FTP (Functional Threshold Power)** - Required for bike power calculations
- **Run Paces** - Either `easyPace` OR `fiveKPace` (for run pace calculations)
- **Swim Pace** - `swimPace100` (for swim pace calculations)
- **Strength 1RM Values** - `squat1RM`, `deadlift1RM`, `bench1RM` (for strength calculations)

#### **❌ NO FALLBACKS ALLOWED:**
- **No age-based estimates** - Only real performance data
- **No hardcoded defaults** - Everything must come from user baselines
- **No AI-generated values** - Only actual test results
- **No placeholder data** - Complete baseline data required

#### **🔒 SYSTEM BEHAVIOR:**
- **Throws clear errors** when baseline data is missing
- **Fails fast** - No silent failures or hidden assumptions
- **Requires validation** before plan generation
- **No partial plans** - Complete data or no plan

### **🎯 WHY THIS MATTERS:**
We switched from AI-based generation to a **reliable, science-based JSON Rules Engine** specifically because:
- **AI was unreliable** - Generated inconsistent, non-scientific plans
- **Fallbacks were dangerous** - Led to inappropriate training loads
- **User safety is paramount** - Only real baseline data ensures safe training
- **Scientific accuracy** - Every calculation must be based on actual performance

## Core Philosophy

### **"Scalable and Science-Based" Instead of "Complex and Over-Engineered"**
- **JSON Rules Engine** using json-rules-engine (2,874 stars)
- **Personalized targets** based on user baseline data
- **Scientific validation** with evidence-based training principles
- **Clean, minimal UI** with professional presentation
- **Infinitely scalable** for new distances and preferences

### **Rules-Based Instead of Template-Based**
- **Dynamic rule generation** with scientific foundation
- **User baseline integration** for personalized targets
- **Scalable architecture** for new distances and preferences
- **Evidence-based training** with research-backed principles

## Architecture Components

### **1. JSON Rules Engine (`TrainingRulesEngine.ts`)**
**Core Service**: Science-based plan generation using json-rules-engine

#### **Key Features:**
- **Distance Rules**: Sprint (12 weeks) and 70.3 (16 weeks) with appropriate volumes
- **Philosophy Rules**: Polarized training with 80/20 easy/hard distribution
- **Strength Rules**: 5 strength options with complete workout generation
- **Personalization**: User baselines drive all targets and weights
- **Progressive Overload**: 12-week plans with Base → Build → Peak → Taper phases
- **Smart Distribution**: Polarized training principles with proper session placement
- **Session Generation**: Complete rules for swim, bike, run, strength, and brick sessions

#### **Rule Categories:**
```typescript
// Distance-specific rules
sprint_distance_rules: { totalWeeks: 12, baseVolume: 6, peakVolume: 8 }
seventy3_distance_rules: { totalWeeks: 16, baseVolume: 10, peakVolume: 14 }

// Philosophy-specific rules
polarized_rules: { easyRatio: 0.8, hardRatio: 0.2, easyZones: [1, 2], hardZones: [4, 5] }
threshold_rules: { thresholdRatio: 0.6, tempoRatio: 0.4, thresholdZones: [3, 4], tempoZones: [2, 3] }

// Strength integration rules
traditional_strength: { strengthSessions: 2, strengthHours: 2, focus: 'muscle_building' }
cowboy_compound: { strengthSessions: 3, strengthHours: 3, focus: 'endurance_strength' }
```

### **2. Integration Service (`SimpleTrainingService.ts`)**
**Orchestration Layer**: Connects UI to JSON Rules Engine

#### **Key Responsibilities:**
- **Rules Engine Integration**: Connects UI to JSON Rules Engine
- **User Baseline Management**: Loads and validates user performance data
- **Plan Generation**: Orchestrates rules engine for complete plan generation
- **Error Handling**: Comprehensive validation and error management
- **Validation**: Ensures complete baseline data before plan generation

#### **Baseline Data Requirements:**
```typescript
interface UserBaselines {
  ftp: number;              // Required for bike power calculations
  fiveKPace?: string;       // OR easyPace for run calculations
  easyPace?: string;        // OR fiveKPace for run calculations
  swimPace100: string;      // Required for swim calculations
  squat1RM?: number;        // Required for strength calculations
  deadlift1RM?: number;     // Required for strength calculations
  bench1RM?: number;        // Required for strength calculations
  age: number;              // For heart rate calculations
}
```

### **3. UI Integration (`SimplePlanBuilder.tsx`)**
**User Interface**: 4-step assessment with swipe navigation

#### **Key Features:**
- **4-Step Assessment**: Distance → Strength → Time → Long Session Day
- **Swipe Interface**: Clean dot indicators and smooth week navigation
- **User Baselines**: Loaded from user profile (no manual input)
- **Validation**: Strict enforcement of required baseline data
- **Updated Language**: More conversational and clear strength integration messaging

#### **Assessment Flow:**
1. **Distance Selection**: Sprint Triathlon or 70.3 Triathlon
2. **Strength Integration**: 5 options from none to cowboy compound
3. **Time Commitment**: 4 levels (minimum to hardcore)
4. **Long Session Day**: User picks preferred long workout day

## Scientific Foundation

### **Training Principles**
- **Polarized Training**: 80/20 easy/hard ratio enforcement
- **Research-Based**: Uses actual coaching data (Lauersen et al., Rønnestad & Mujika, Beattie et al.)
- **Strength Percentages**: 80-85% 1RM for compound strength (evidence-based)
- **Recovery Spacing**: Proper session distribution to prevent overtraining
- **Progressive Overload**: Systematic volume and intensity increases
- **Session Generation**: Complete rules for all session types and intensities
- **Workout Science**: Complete exercise prescriptions with proper sets, reps, and rest

### **Evidence-Based Percentages**
```typescript
// Bike power targets (based on FTP)
const easyBikePower = Math.round(userBaselines.ftp * 0.65);      // 65% FTP
const enduranceBikePower = Math.round(userBaselines.ftp * 0.75);  // 75% FTP
const tempoBikePower = Math.round(userBaselines.ftp * 0.85);      // 85% FTP

// Strength weights (based on 1RM)
const squatWeight = Math.round(userBaselines.squat1RM * 0.8 / 5) * 5;  // 80% 1RM
const deadliftWeight = Math.round(userBaselines.deadlift1RM * 0.8 / 5) * 5;  // 80% 1RM
const benchWeight = Math.round(userBaselines.bench1RM * 0.8 / 5) * 5;  // 80% 1RM
```

## Scalability Design

### **Distance Scalability**
- **Sprint**: 12 weeks, 6-8 hours/week, 6-8 sessions/week
- **70.3**: 16 weeks, 10-14 hours/week, 8-10 sessions/week
- **Olympic**: 14 weeks, 8-12 hours/week, 7-9 sessions/week
- **Ironman**: 20+ weeks, 12-18 hours/week, 8-12 sessions/week

### **Strength Integration Scalability**
- **None**: 0 strength sessions
- **Traditional**: 2 strength sessions (muscle building focus)
- **Compound**: 2 strength sessions (functional strength focus)
- **Cowboy Endurance**: 3 strength sessions (endurance + upper body)
- **Cowboy Compound**: 3 strength sessions (compound + upper body)

### **Time Level Scalability**
```typescript
const timeMultipliers = {
  minimum: 0.8,   // 4.8 hours/week (Sprint)
  moderate: 1.0,  // 6.0 hours/week (Sprint)
  serious: 1.2,   // 7.2 hours/week (Sprint)
  hardcore: 1.4   // 8.4 hours/week (Sprint)
}
```

## Data Flow Architecture

### **1. User Baseline Collection**
- **FTP Test**: Functional Threshold Power for bike calculations
- **5K Time**: Run pace calculations and training zones
- **Swim 100m Time**: Swim pace calculations and training zones
- **1RM Tests**: Strength workout weight calculations
- **Age**: Heart rate zone calculations

### **2. Plan Generation Process**
```typescript
// 1. Load user baselines
const userBaselines = await loadUserBaselines(userId);

// 2. Validate complete baseline data
if (!validateBaselineData(userBaselines)) {
  throw new Error('Missing required baseline data');
}

// 3. Generate training facts
const trainingFacts = createTrainingFacts(userBaselines, userChoices);

// 4. Generate plan using rules engine
const plan = await rulesEngine.generateFullPlan(trainingFacts);

// 5. Validate generated plan
const validation = validatePlan(plan, userBaselines);
```

### **3. Plan Validation**
- **Polarized Training**: 80/20 easy/hard ratio validation
- **Progressive Overload**: Volume and intensity progression validation
- **Session Balance**: Proper distribution across disciplines
- **Recovery Spacing**: Adequate recovery between hard sessions
- **Baseline Integration**: All targets based on user data

## Error Handling Strategy

### **Baseline Data Validation**
- **Required Fields**: FTP, run paces, swim pace, strength 1RM values
- **Clear Error Messages**: Specific guidance on missing data
- **Fail Fast**: No plan generation without complete data
- **No Fallbacks**: No age-based estimates or hardcoded defaults

### **Plan Generation Validation**
- **Session Count**: Appropriate for distance and time level
- **Volume Distribution**: Proper polarized training ratios
- **Progressive Overload**: Systematic increases across phases
- **Recovery Spacing**: Adequate recovery between hard sessions

## Performance Optimization

### **Rules Engine Optimization**
- **Rule Caching**: Pre-compiled rules for faster execution
- **Event Processing**: Efficient event handling for complex rules
- **Memory Management**: Proper cleanup of rule instances
- **Error Recovery**: Graceful handling of rule failures

### **UI Performance**
- **Swipe Optimization**: Smooth 60fps animations
- **Lazy Loading**: Progressive plan loading
- **Caching**: Plan data caching for faster navigation
- **Responsive Design**: Mobile-optimized interface

## Security Considerations

### **Data Protection**
- **Row Level Security**: Supabase RLS for user data isolation
- **Input Validation**: Comprehensive validation of all user inputs
- **Error Sanitization**: No sensitive data in error messages
- **Audit Logging**: Track plan generation and user interactions

### **Baseline Data Security**
- **Encrypted Storage**: Sensitive baseline data encrypted at rest
- **Access Control**: User-specific data access controls
- **Data Retention**: Appropriate data retention policies
- **Privacy Compliance**: GDPR and privacy regulation compliance

## Future Architecture Considerations

### **Scalability Enhancements**
- **Microservices**: Potential service decomposition
- **Caching Layer**: Redis for plan caching
- **CDN Integration**: Global content delivery
- **Real-time Updates**: WebSocket integration for live updates

### **Advanced Features**
- **AI Integration**: Machine learning for plan optimization
- **Real-time Analytics**: Live training progress tracking
- **Social Features**: Community and sharing capabilities
- **Mobile App**: Native mobile development

## Development Guidelines

### **Code Standards**
- **TypeScript**: Strict typing throughout
- **Console Logging**: Extensive logging for debugging
- **Validation**: Comprehensive plan validation
- **Testing**: Systematic testing of all combinations
- **Error Handling**: Clear error messages for missing data

### **Architecture Principles**
- **Scalability**: Rules-based approach for easy expansion
- **Science-Based**: Evidence-based training principles
- **User Safety**: Complete baseline data requirements
- **Performance**: Optimized for fast plan generation
- **Maintainability**: Clear rule structure for easy updates

---

**This architecture provides a scalable, science-based foundation for training plan generation with NO FALLBACKS and complete user baseline data requirements.** 