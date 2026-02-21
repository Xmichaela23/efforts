# Refactoring Plan: analyze-running-workout Edge Function

## Current State
- **File Size**: 5,703 lines
- **Functions**: ~29 functions
- **Main Issues**:
  1. Too many responsibilities in one file
  2. Complex data flow (hard to trace)
  3. Fragile matching logic between intervals
  4. Multiple sources of truth for pace calculations
  5. Difficult to test individual components
  6. Hard to debug when things break

## Core Responsibilities (What It Should Do)

1. **Calculate Adherence Metrics**
   - Pace adherence (interval averages + time-in-range)
   - Duration adherence
   - Performance scores (70/30 weighting)

2. **Generate Interval Breakdown**
   - Work intervals
   - Warmup/Cooldown
   - Recovery periods
   - Each with: pace, duration, HR, elevation, adherence

3. **Calculate Overall Execution Score**
   - Weighted average: Warmup 15%, Work 60%, Recovery 10%, Cooldown 15%

4. **Generate AI Narrative**
   - Summary insights
   - Coaching feedback
   - Context about terrain/conditions

## Proposed Structure

### New File Organization

```
supabase/functions/analyze-running-workout/
├── index.ts (main handler, ~200 lines)
├── lib/
│   ├── adherence/
│   │   ├── pace-adherence.ts (pace calculations)
│   │   ├── duration-adherence.ts (duration calculations)
│   │   └── execution-score.ts (overall score calculation)
│   ├── intervals/
│   │   ├── interval-breakdown.ts (generate breakdown structure)
│   │   ├── interval-matcher.ts (match planned to executed)
│   │   └── interval-formatter.ts (format for display)
│   ├── analysis/
│   │   ├── heart-rate.ts (HR analysis)
│   │   ├── elevation.ts (elevation/terrain)
│   │   └── pacing-consistency.ts (variability analysis)
│   └── narrative/
│       └── ai-insights.ts (AI narrative generation)
└── types.ts (shared TypeScript interfaces)
```

## Refactoring Steps

### Phase 1: Extract Core Calculations (Low Risk)
1. Extract pace adherence calculation → `lib/adherence/pace-adherence.ts`
2. Extract duration adherence calculation → `lib/adherence/duration-adherence.ts`
3. Extract execution score calculation → `lib/adherence/execution-score.ts`
4. **Test**: Verify calculations match current output

### Phase 2: Extract Interval Processing (Medium Risk)
1. Extract interval breakdown generation → `lib/intervals/interval-breakdown.ts`
2. Extract interval matching logic → `lib/intervals/interval-matcher.ts`
3. Extract formatting logic → `lib/intervals/interval-formatter.ts`
4. **Test**: Verify interval structure matches current output

### Phase 3: Extract Analysis Components (Low Risk)
1. Extract HR analysis → `lib/analysis/heart-rate.ts`
2. Extract elevation analysis → `lib/analysis/elevation.ts`
3. Extract pacing consistency → `lib/analysis/pacing-consistency.ts`
4. **Test**: Verify analysis metrics match

### Phase 4: Extract AI Narrative (Low Risk)
1. Extract AI prompt building → `lib/narrative/ai-insights.ts`
2. Simplify prompt structure
3. **Test**: Verify narrative quality

### Phase 5: Simplify Main Handler (High Risk - Do Last)
1. Refactor `index.ts` to orchestrate extracted functions
2. Simplify data flow
3. Add comprehensive error handling
4. **Test**: End-to-end with real workout

## Key Principles

1. **Single Responsibility**: Each function does ONE thing
2. **Pure Functions**: Calculations should be pure (no side effects)
3. **Clear Data Flow**: Input → Process → Output (no hidden state)
4. **Testable**: Each function can be tested independently
5. **Type Safety**: Strong TypeScript interfaces for all data structures

## Data Structure (Single Source of Truth)

```typescript
interface IntervalBreakdown {
  available: boolean;
  intervals: IntervalData[];
  section?: string; // Formatted text for UI
  summary?: {
    average_performance_score: number;
    total_intervals: number;
    high_performance_intervals: number;
    good_performance_intervals: number;
    fair_performance_intervals: number;
    poor_performance_intervals: number;
  };
}

interface IntervalData {
  interval_id: string | null;
  interval_type: 'warmup' | 'work' | 'recovery' | 'cooldown';
  interval_number?: number; // For work intervals
  recovery_number?: number; // For recovery intervals
  
  // Planned values
  planned_duration_s: number;
  planned_pace_range_lower?: number; // seconds per mile
  planned_pace_range_upper?: number; // seconds per mile
  planned_pace_min_per_mi?: number | null; // minutes per mile (if single target)
  
  // Actual values
  actual_duration_s: number;
  actual_pace_min_per_mi: number; // minutes per mile
  
  // Adherence
  pace_adherence_percent: number;
  duration_adherence_percent: number;
  performance_score: number; // (pace * 0.7) + (duration * 0.3)
  
  // Metrics
  avg_heart_rate_bpm: number | null;
  max_heart_rate_bpm: number | null;
  min_heart_rate_bpm: number | null;
  elevation_start_m: number | null;
  elevation_end_m: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  net_elevation_change_m: number | null;
  avg_grade_percent: number | null;
}
```

## Migration Strategy

1. **Create new structure** alongside existing code
2. **Migrate one component at a time**
3. **Test each migration** before moving to next
4. **Keep old code** until new code is verified
5. **Switch over** when confident
6. **Remove old code** after verification

## Success Criteria

- [ ] File size reduced to < 1,500 lines (main handler)
- [ ] Each extracted file < 300 lines
- [ ] All tests pass
- [ ] Pace displays correctly in Summary screen
- [ ] Adherence scores match current output
- [ ] No 503 errors
- [ ] Clear error messages when things fail

## Questions to Answer Before Starting

1. **What's the minimum viable refactor?** (What's the smallest change that fixes the main issues?)
2. **What can we keep as-is?** (What's actually working fine?)
3. **What's the biggest pain point?** (Where do bugs keep happening?)
4. **What's the testing strategy?** (How do we verify nothing breaks?)








