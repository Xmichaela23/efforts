# Discipline-Specific Analysis Architecture

## Overview
This document outlines the unified architecture for handling analysis across all workout disciplines (running, cycling, swimming, strength, etc.).

## Core Principles

### 1. **Single Source of Truth**
- **Data Source**: `workouts.workout_analysis.granular_analysis`
- **No Legacy Systems**: No `calculated_metrics` dependencies
- **Consistent Structure**: All disciplines use the same data format

### 2. **Smart Server, Dumb Client**
- **Server**: All business logic, analysis, and calculations
- **Client**: Only displays data and triggers analysis
- **No Client-Side Logic**: No percentage calculations, no routing logic

### 3. **Discipline-Specific Analyzers**
Each discipline has its own dedicated analysis function:

```
analyze-running-workout    → Running analysis
analyze-cycling-workout    → Cycling analysis  
analyze-swimming-workout   → Swimming analysis
analyze-strength-workout   → Strength analysis
```

### 4. **Master Orchestrator**
The `analyze-workout` function routes to appropriate analyzers:

```typescript
switch (workout.type) {
  case 'run':
  case 'running':
    return analyze-running-workout(workout_id);
  case 'ride':
  case 'cycling':
    return analyze-cycling-workout(workout_id);
  case 'swim':
  case 'swimming':
    return analyze-swimming-workout(workout_id);
  case 'strength':
  case 'strength_training':
    return analyze-strength-workout(workout_id);
}
```

## Data Flow Architecture

### **Unified Data Flow**
```
User Action → UnifiedWorkoutView → analyze-workout → discipline-specific-analyzer → workout_analysis.granular_analysis → All Components
```

### **Single Analysis Trigger**
- **Trigger**: User opens Summary tab
- **Location**: `UnifiedWorkoutView.tsx`
- **Function**: `analyze-running-workout` (or discipline-specific)
- **Result**: Data stored in `workout_analysis.granular_analysis`

### **No Race Conditions**
- **One Trigger**: Only when Summary tab opens
- **No Auto-Triggers**: No background analysis
- **No Duplicates**: No multiple analysis calls

## Discipline-Specific Implementation

### **Running Analysis** ✅ IMPLEMENTED
```typescript
// analyze-running-workout
- Pace adherence analysis
- Time-in-prescribed-range
- Interval-by-interval breakdown
- GPS spike detection
- Heart rate zone analysis
- Duration adherence
- Performance assessment (Fair, Good, Excellent)
```

### **Cycling Analysis** 🔄 FUTURE
```typescript
// analyze-cycling-workout
- Power adherence analysis
- Cadence analysis
- Heart rate zone analysis
- Duration adherence
- Performance assessment
```

### **Swimming Analysis** 🔄 FUTURE
```typescript
// analyze-swimming-workout
- Pace adherence analysis
- Stroke rate analysis
- Heart rate zone analysis
- Duration adherence
- Performance assessment
```

### **Strength Analysis** 🔄 FUTURE
```typescript
// analyze-strength-workout
- Exercise adherence analysis
- Set/rep completion
- Load progression analysis
- Rest time adherence
- Performance assessment
```

## Component Architecture

### **All Components Use Same Data Source**
```typescript
// MobileSummary.tsx
const workoutAnalysis = completed?.workout_analysis;
const granularAnalysis = workoutAnalysis?.granular_analysis;

// TodaysWorkoutsTab.tsx  
const workoutAnalysis = workout?.workout_analysis;
const granularAnalysis = workoutAnalysis?.granular_analysis;

// WorkoutAIDisplay.tsx
const workoutAnalysis = workout?.workout_analysis;
const granularAnalysis = workoutAnalysis?.granular_analysis;
```

### **Consistent Data Structure**
```typescript
interface GranularAnalysis {
  overall_adherence: number;           // 0.0 - 1.0
  duration_adherence: {
    adherence_percentage: number;      // 0.0 - 1.0
    planned_duration_s: number;
    actual_duration_s: number;
    delta_seconds: number;
  };
  performance_assessment: string;      // "Excellent", "Good", "Fair", "Poor"
  pacing_analysis: {
    time_in_range_score: number;      // 0.0 - 1.0
    variability_score: number;         // 0.0 - 1.0
    smoothness_score: number;         // 0.0 - 1.0
  };
  heart_rate_analysis: {
    average_heart_rate: number;
    hr_consistency_percent: number;
    zone_analysis: any;
  };
  primary_issues: string[];
  strengths: string[];
}
```

## Implementation Status

### ✅ **Completed (Running)**
- [x] `analyze-running-workout` function
- [x] Unified data structure
- [x] Single analysis trigger
- [x] All components using enhanced system
- [x] No race conditions
- [x] No legacy dependencies

### 🔄 **Future Disciplines**
- [ ] `analyze-cycling-workout` function
- [ ] `analyze-swimming-workout` function  
- [ ] `analyze-strength-workout` function
- [ ] Discipline-specific metrics
- [ ] Discipline-specific insights

## Benefits of This Architecture

### **1. Scalability**
- Easy to add new disciplines
- Consistent data structure across all sports
- No client-side changes needed for new disciplines

### **2. Maintainability**
- Single source of truth
- No duplicate logic
- Clear separation of concerns

### **3. Performance**
- No race conditions
- No duplicate analysis calls
- Efficient data flow

### **4. User Experience**
- Consistent interface across all disciplines
- Reliable data display
- No undefined values or missing metrics

## Migration Path for New Disciplines

### **Step 1: Create Discipline-Specific Analyzer**
```typescript
// supabase/functions/analyze-cycling-workout/index.ts
export default async function handler(req: Request) {
  // Discipline-specific analysis logic
  // Return same data structure as running
}
```

### **Step 2: Update Master Orchestrator**
```typescript
// supabase/functions/analyze-workout/index.ts
case 'ride':
case 'cycling':
  return analyze-cycling-workout(workout_id);
```

### **Step 3: No Client Changes Needed**
- All components already use `workout_analysis.granular_analysis`
- Same data structure across all disciplines
- Automatic support for new disciplines

## Conclusion

This architecture provides a **scalable, maintainable, and consistent** approach to handling analysis across all workout disciplines. The running implementation serves as the template for all future disciplines, ensuring consistency and reliability across the entire system.
