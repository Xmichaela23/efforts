# Plan Architecture & Authoring System Analysis

## Overview
This document analyzes the sophisticated plan architecture and authoring system that processes JSON plans through a multi-layered token system, DSL, and computation engine.

## Plan Data Flow

```
JSON Plan → Schema Validation → DSL Processing → Token Expansion → Computation → UI Display
```

## 1. JSON Plan Schema

### Universal Plan Schema (`universal_plan.schema.json`)
**Core Structure:**
```json
{
  "name": "string",
  "duration_weeks": "integer",
  "sessions_by_week": {
    "1": [session],
    "2": [session],
    ...
  },
  "export_hints": {
    "pace_tolerance_quality": 0.04,
    "pace_tolerance_easy": 0.06,
    "power_tolerance_SS_thr": 0.05,
    "power_tolerance_VO2": 0.10
  }
}
```

**Session Structure:**
```json
{
  "day": "Monday|Tuesday|...",
  "discipline": "run|bike|ride|swim|strength|brick|walk",
  "steps_preset": ["token1", "token2", ...],
  "main": "dsl_string",
  "extra": "dsl_string",
  "strength_exercises": [...],
  "intervals": [...],
  "tags": ["optional", "idprefix:custom", "expand:reps=5"]
}
```

## 2. Token System

### Token Categories

#### **Running Tokens**
**Intervals:**
- `interval_6x800m_5kpace_R2min` - 6×800m @ 5K pace, 2min rest
- `interval_6x1mi_5kpace_R2min` - 6×1mi @ 5K pace, 2min rest
- `cruise_4x1_5mi_5kpace_plus0:10_R3min` - Cruise intervals with pace offset

**Tempo:**
- `tempo_4mi_5kpace_plus0:45` - 4mi tempo @ 5K+45s
- `tempo_6mi_5kpace_plus0:40` - 6mi tempo @ 5K+40s

**Long Runs:**
- `longrun_90min_easypace_last10steady` - 90min easy with last 10 steady
- `longrun_150min_easypace_3x20min_MP` - 150min with 3×20min MP

**Warmup/Cooldown:**
- `warmup_run_quality_12min` - 12min warmup
- `cooldown_easy_10min` - 10min cooldown

**Drills/Speed:**
- `strides_6x20s` - 6×20s strides
- `speed_8x20s_R60s` - 8×20s speed with 60s rest

#### **Cycling Tokens**
**Power Intervals:**
- `bike_vo2_6x3min_R3min` - 6×3min VO2 max
- `bike_thr_4x8min_R5min` - 4×8min threshold
- `bike_ss_2x20min_R6min` - 2×20min sweet spot

**Endurance:**
- `bike_endurance_120min_Z2` - 120min Z2 endurance
- `bike_recovery_35min_Z1` - 35min recovery

#### **Swimming Tokens**
**Drills:**
- `swim_drills_4x50yd_catchup` - 4×50yd catchup drill
- `swim_drills_2x100yd_singlearm` - 2×100yd single arm
- `swim_drill_catchup_4x50yd_r15_fins` - With equipment modifiers

**Pull/Kick:**
- `swim_pull_2x100yd` - 2×100yd pull
- `swim_kick_4x50yd` - 4×50yd kick
- `swim_pull_300yd_steady` - 300yd steady pull

**Aerobic:**
- `swim_aerobic_6x100yd` - 6×100yd aerobic
- `swim_technique_1200yd` - 1200yd technique

**Equipment Modifiers:**
- `_fins` - Fins
- `_paddles` - Hand paddles
- `_snorkel` - Center-mount snorkel
- `_buoy` - Pull buoy
- `_board` - Kickboard

#### **Strength Tokens**
**Main Blocks:**
- `strength_main_50min` - 50min strength session
- `strength_main_40min` - 40min strength session

**Exercise-Specific:**
- `st_main_back_squat_5x5_@pct70_rest150` - 5×5 @ 70% 1RM, 150s rest
- `st_acc_barbell_row_4x6_rest75` - 4×6 accessory work
- `st_core_rollouts_3x15_rest45` - 3×15 core work

**Warmup/Cooldown:**
- `st_wu_8` - 8min warmup
- `st_cool_5` - 5min cooldown

## 3. DSL (Domain Specific Language)

### Plan DSL (`plan_dsl.ts`)
**Purpose:** Convert human-readable workout descriptions to tokens

**Swim DSL Examples:**
```typescript
// Input: "drills(catchup,singlearm); pull2x100; kick2x100"
// Output: ["swim_drills_4x50yd_catchup", "swim_drills_4x50yd_singlearm", "swim_pull_2x100yd", "swim_kick_2x100yd"]

// Input: "aerobic(6x100)"
// Output: ["swim_aerobic_6x100yd_easysteady"]
```

**Run DSL Examples:**
```typescript
// Input: "6x800m@5k R2"
// Output: ["interval_6x800m_5kpace_R2min"]

// Input: "tempo 4mi@5k+0:45"
// Output: ["tempo_4mi_5kpace_plus0:45"]
```

**Bike DSL Examples:**
```typescript
// Input: "vo2 6x3 r3"
// Output: ["bike_vo2_6x3min_R3min"]

// Input: "thr 4x8 r5"
// Output: ["bike_thr_4x8min_R5min"]
```

## 4. Token Expansion System

### Expander (`expander.ts`)
**Purpose:** Convert tokens to atomic steps with detailed parameters

**Expansion Process:**
1. **Parse tokens** from `steps_preset` array
2. **Look up presets** in `PRESETS` catalog
3. **Generate atomic steps** with IDs, durations, targets
4. **Handle overrides** from tags (e.g., `expand:reps=5`)

**Atomic Step Types:**
```typescript
type AtomicStep = 
  | { type: 'warmup'|'cooldown'|'steady'; duration_s?: number; distance_m?: number; target?: string }
  | { type: 'interval_work'|'interval_rest'; duration_s?: number; distance_m?: number; target?: string }
  | { type: 'strength_work'|'strength_rest'; exercise?: string; set?: number; reps?: number|string; intensity?: string }
  | { type: 'swim_drill'|'swim_pull'|'swim_kick'|'swim_aerobic'; distance_yd?: number; equipment?: string; cue?: string }
```

## 5. Preset Catalog

### Presets (`presets.ts`)
**Purpose:** Define concrete workout parameters for each token

**Run Presets:**
```typescript
interval_6x800m_5kpace_R2min: { 
  kind: 'interval', 
  reps: 6, 
  work: { dist_m: 800, target: '{5k_pace}' }, 
  rest: { duration_s: 120 } 
}
```

**Bike Presets:**
```typescript
bike_vo2_6x3min_R3min: { 
  kind: 'interval', 
  reps: 6, 
  work: { duration_s: 180, target: '{VO2_power}' }, 
  rest: { duration_s: 180 } 
}
```

**Swim Presets:**
```typescript
swim_drills_4x50yd_catchup: { 
  type: 'swim_drill', 
  label: 'Drill — Catch-up', 
  cue: 'Touch hands in front; long glide', 
  equipment: 'none' 
}
```

## 6. Normalization System

### Normalizer (`normalizer.ts`)
**Purpose:** Convert tokens to human-readable summaries with pace/power ranges

**Key Functions:**
- **Resolve pace tokens** using user baselines (`{5k_pace}`, `{easy_pace}`)
- **Calculate pace ranges** with tolerances (quality: ±4%, easy: ±6%)
- **Generate friendly summaries** with target ranges
- **Compute total duration** from all steps

**Example Output:**
```
"6 × 800 m @ 6:45/mi (6:29–7:01) w 2 min jog @ 8:45/mi (8:13–9:17)"
```

## 7. Plan Baking & Computation

### Plan Bake (`plan_bake_and_compute.ts`)
**Purpose:** Advanced computation and augmentation of plans

**Key Features:**
- **Pace derivation** from 5K time (10K = 5K + 3%, MP = 5K + 15%)
- **Power calculation** from FTP (VO2 = 110%, Threshold = 98%, Sweet Spot = 91%)
- **Duration computation** with rest intervals
- **Tolerance ranges** for pace/power targets
- **Swim pace calculation** from per-100 baseline

**Computation Rules:**
```typescript
// Pace derivation
tenK_pace = fiveK_pace * 1.03
mp_pace = fiveK_pace * 1.15
easy_pace = fiveK_pace * 1.30

// Power zones
VO2_power = ftp * 1.10
threshold_power = ftp * 0.98
sweetspot_power = ftp * 0.91
```

## 8. Tag System

### Expansion Tags
**Purpose:** Override default parameters without changing tokens

**Examples:**
- `idprefix:custom` - Custom ID prefix for steps
- `expand:reps=5` - Override rep count
- `expand:work=3min` - Override work duration
- `expand:rest=90s` - Override rest duration
- `expand:omit_last_rest=1` - Skip last rest interval

### Optional Tags
- `optional` - Mark session as optional
- `[optional]` - Alternative optional syntax

## 9. User Baselines Integration

### Baseline Requirements
**Running:**
- `fiveK_pace` - 5K race pace (required)
- `easy_pace` - Easy training pace (derived if missing)

**Cycling:**
- `ftp` - Functional Threshold Power (required)

**Swimming:**
- `swimPace100` - Pace per 100m/yd (required)

### Baseline Resolution
```typescript
// Pace token resolution
{5k_pace} → user.fiveK_pace
{easy_pace} → user.easy_pace || user.fiveK_pace * 1.30
{10k_pace} → user.tenK_pace || user.fiveK_pace * 1.03

// Power token resolution  
{VO2_power} → user.ftp * 1.10
{threshold_power} → user.ftp * 0.98
{sweetspot_power} → user.ftp * 0.91
```

## 10. Export Hints

### Tolerance Configuration
```json
{
  "pace_tolerance_quality": 0.04,  // ±4% for intervals/tempo
  "pace_tolerance_easy": 0.06,     // ±6% for easy pace
  "power_tolerance_SS_thr": 0.05,  // ±5% for sweet spot/threshold
  "power_tolerance_VO2": 0.10      // ±10% for VO2 max
}
```

## 11. Plan Processing Pipeline

### Complete Flow
```
1. JSON Plan Input
   ↓
2. Schema Validation (universal_plan.schema.json)
   ↓
3. DSL Processing (plan_dsl.ts)
   ↓
4. Token Expansion (expander.ts)
   ↓
5. Preset Lookup (presets.ts)
   ↓
6. Normalization (normalizer.ts)
   ↓
7. Plan Baking (plan_bake_and_compute.ts)
   ↓
8. UI Display (AllPlansInterface.tsx)
```

## 12. Advanced Features

### Dynamic Token Generation
- **Regex-based parsing** for new token formats
- **Equipment modifiers** for swim drills
- **Pace offsets** with `plus` syntax
- **Rest interval overrides** with `R` syntax

### Swim-Specific Features
- **Pool length detection** (25m, 25yd, 50m)
- **Equipment integration** (fins, paddles, snorkel)
- **Drill catalogs** with cues and instructions
- **Rest heuristics** based on drill type

### Strength-Specific Features
- **Exercise categorization** (main, accessory, core)
- **Intensity notation** (%1RM, AMRAP)
- **Rest period specification** (seconds/minutes)
- **Duration estimation** from sets/reps

## 13. Error Handling

### Validation Points
- **Schema validation** for JSON structure
- **Token validation** for unknown presets
- **Baseline validation** for required user data
- **Range validation** for pace/power targets

### Fallback Mechanisms
- **Description parsing** when tokens fail
- **Default durations** when computation fails
- **Baseline derivation** when missing
- **Tolerance fallbacks** for edge cases

## 14. Performance Considerations

### Optimization Strategies
- **Token caching** for repeated lookups
- **Lazy computation** for complex calculations
- **Memoization** for expensive operations
- **Batch processing** for multiple sessions

### Memory Management
- **Streaming processing** for large plans
- **Garbage collection** for temporary objects
- **Reference optimization** for shared data

This architecture provides a sophisticated, flexible system for creating and processing training plans with rich metadata, precise calculations, and extensive customization options. The token system allows for concise plan authoring while the expansion and computation layers provide detailed workout specifications for the UI.
