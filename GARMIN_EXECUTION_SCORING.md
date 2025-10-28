# 🏃‍♂️ Garmin-Style Execution Scoring System

## Overview

The system now uses **penalty-based execution scoring** instead of simple averaging, providing honest assessment of workout compliance that matches Garmin Connect's philosophy.

**Key Principle**: You can't score >100% - perfection is 100%. Deviations in either direction (too fast OR too slow) reduce your score.

---

## 🎯 The Problem We Solved

### Before (Misleading)
- **103% execution** for a workout with:
  - Intervals 4-8% too fast (overreaching)
  - Recovery jogs 25-35% too slow (poor execution)  
  - Cooldown cut in half
- **Message**: "Great job!" (false positive)

### After (Honest)
- **~71% execution** for the same workout
- **Message**: "Intervals too fast, recovery poorly executed, cooldown incomplete"
- **Actionable feedback**: Shows exactly what needs improvement

---

## ⚙️ How It Works

### 1. Segment Type Detection

The system automatically categorizes each interval:

```typescript
// Token-based detection
if (token.includes('interval_')) return 'work_interval';
if (token.includes('tempo_')) return 'tempo';
if (token.includes('cruise_')) return 'cruise_interval';

// Duration-based fallback
if (durationMin <= 8) return 'work_interval';  // Short = interval
else return 'tempo';                            // Long = tempo

// Role-based detection
if (role === 'recovery') return 'recovery_jog';
if (role === 'warmup') return 'warmup';
if (role === 'cooldown') return 'cooldown';
```

### 2. Tolerance Thresholds by Segment Type

Each segment type has different acceptable deviation ranges:

```typescript
const SEGMENT_CONFIG = {
  warmup: { tolerance: 10, weight: 0.5 },        // ±10% acceptable
  cooldown: { tolerance: 10, weight: 0.3 },       // ±10% acceptable  
  work_interval: { tolerance: 5, weight: 1.0 },  // ±5% acceptable (tightest)
  tempo: { tolerance: 4, weight: 1.0 },          // ±4% acceptable (tightest)
  cruise_interval: { tolerance: 5, weight: 0.9 }, // ±5% acceptable
  recovery_jog: { tolerance: 15, weight: 0.7 },   // ±15% acceptable (widest)
  easy_run: { tolerance: 8, weight: 0.6 }        // ±8% acceptable
};
```

**Why different tolerances?**
- **Work intervals**: Tight tolerance (5%) - precision matters for training stimulus
- **Recovery jogs**: Wide tolerance (15%) - but still matters for recovery quality
- **Warmup/Cooldown**: Medium tolerance (10%) - important but not critical

### 3. Penalty Calculation

For each segment, calculate deviation from 100%:

```typescript
function calculateSegmentPenalty(segment, config) {
  const adherence = segment.executed.adherence_percentage; // e.g., 106%
  const deviation = Math.abs(adherence - 100);            // 6%
  
  // Within tolerance = no penalty
  if (deviation <= config.tolerance) {
    return 0;
  }
  
  // Penalty for excess deviation
  const excessDeviation = deviation - config.tolerance;   // 6% - 5% = 1%
  const basePenalty = excessDeviation * config.weight;    // 1% × 1.0 = 1.0
  
  // Directional penalty for wrong stimulus
  const directionPenalty = getDirectionalPenalty(segment, adherence);
  
  return basePenalty + directionPenalty;
}
```

### 4. Directional Penalties

Extra penalties for "wrong stimulus" direction:

```typescript
function getDirectionalPenalty(segment, adherence) {
  const type = segment.type;
  
  // Too slow on work = missed training stimulus
  if (['work_interval', 'tempo'].includes(type) && adherence < 95) {
    return 5; // "You didn't work hard enough"
  }
  
  // Too fast on work = overreaching risk  
  if (['work_interval', 'tempo'].includes(type) && adherence > 110) {
    return 3; // "You went too hard"
  }
  
  // Too slow on recovery = poor execution
  if (type === 'recovery_jog' && adherence < 85) {
    return 3; // "You walked instead of jogging"
  }
  
  return 0; // No directional penalty
}
```

### 5. Overall Execution Score

```typescript
// Sum all penalties
const totalPenalty = penalties.reduce((sum, p) => sum + p.total_penalty, 0);

// Execution score: 100 minus penalties, floor at 0
const executionScore = Math.max(0, Math.round(100 - totalPenalty));
```

---

## 📊 Example Calculation

### Sample Workout: 4x1mi intervals with 2min recovery

| Segment | Planned | Executed | Adherence | Type | Tolerance | Penalty |
|---------|---------|----------|-----------|------|-----------|---------|
| Warmup | 15:00 | 15:54 | 106% | warmup | ±10% | 0 (within tolerance) |
| Interval 1 | 1.00mi | 1.00mi | 107% | work_interval | ±5% | 2.0 (2% excess × 1.0 weight) |
| Recovery 1 | 2:00 | 2:00 | 107% | recovery_jog | ±15% | 0 (within tolerance) |
| Interval 2 | 1.00mi | 1.00mi | 104% | work_interval | ±5% | 0 (within tolerance) |
| Recovery 2 | 2:00 | 2:00 | 66% | recovery_jog | ±15% | 16.3 (19% excess × 0.7 weight + 3 direction) |
| Interval 3 | 1.00mi | 1.00mi | 99% | work_interval | ±5% | 0 (within tolerance) |
| Recovery 3 | 2:00 | 2:00 | 75% | recovery_jog | ±15% | 10.0 (10% excess × 0.7 weight + 3 direction) |
| Interval 4 | 1.00mi | 1.00mi | 106% | work_interval | ±5% | 1.0 (1% excess × 1.0 weight) |
| Cooldown | 10:00 | 5:00 | 50% duration | cooldown | ±10% | 0 (duration penalty separate) |

**Total Penalties**: 2.0 + 16.3 + 10.0 + 1.0 = **29.3**

**Execution Score**: 100 - 29.3 = **71%**

---

## 🎯 What Each Score Means

### Execution Score (Overall)
- **90-100%**: Excellent execution - followed plan precisely
- **80-89%**: Good execution - minor deviations
- **70-79%**: Fair execution - some issues, room for improvement  
- **60-69%**: Poor execution - significant deviations
- **<60%**: Very poor execution - major issues

### Pace Execution
- Same as overall execution (pace is the main factor)
- Reflects how well you hit target paces across all segments

### Duration Adherence  
- Separate metric for time compliance
- Capped at 100% (going longer isn't better)
- Example: 58/65 minutes = 89%

---

## 📈 Segment Summaries

The system generates detailed breakdowns:

```json
{
  "segment_summary": {
    "work_intervals": {
      "completed": 4,
      "total": 4, 
      "avg_adherence": 104,
      "within_tolerance": 2  // 2 of 4 intervals within ±5%
    },
    "recovery_jogs": {
      "completed": 3,
      "total": 3,
      "avg_adherence": 83,
      "below_target": 2      // 2 of 3 recovery jogs too slow
    },
    "warmup": {
      "adherence": 106,
      "status": "good"
    },
    "cooldown": {
      "adherence": 108,
      "duration_pct": 50,    // Cut short by half
      "status": "poor"
    }
  }
}
```

---

## 🔄 Data Flow

### 1. Workout Analysis Trigger
```
User re-attaches workout
    ↓
auto-attach-planned updates planned_id
    ↓
Calls compute-workout-summary (regenerates intervals)
    ↓
Calls analyze-running-workout (calculates penalties)
    ↓
Stores execution scores in workout_analysis.performance
```

### 2. Frontend Display
```
MobileSummary reads workout_analysis.performance
    ↓
Displays execution scores directly
    ↓
No client-side calculations (smart server, dumb client)
```

---

## 🎯 Key Benefits

### 1. **Honest Assessment**
- No more inflated scores from averaging
- Reflects actual workout compliance
- Shows exactly what needs improvement

### 2. **Actionable Feedback**
- "Intervals too fast" vs "Great job!"
- "Recovery poorly executed" vs generic praise
- Specific guidance for improvement

### 3. **Training Quality Focus**
- Penalizes overreaching (too fast on work)
- Penalizes poor recovery (too slow on recovery)
- Rewards proper execution within tolerance bands

### 4. **Garmin Compatibility**
- Matches Garmin Connect's scoring philosophy
- Familiar scoring system for users
- Industry-standard approach

---

## 🧪 Testing the System

### Test Case: Poor Execution Workout
1. **Re-attach** a workout with known issues
2. **Check execution score** - should be <80% if there are problems
3. **Verify penalties** - server logs show detailed penalty breakdown
4. **Confirm frontend** - displays new scores immediately

### Expected Results
- **Before**: 103% execution (misleading)
- **After**: ~71% execution (honest)
- **Penalties**: Detailed breakdown of what went wrong
- **Feedback**: Specific guidance for improvement

---

## 📋 Implementation Details

### Files Modified
- `supabase/functions/analyze-running-workout/index.ts`
  - Added `calculateGarminExecutionScore()` function
  - Added segment type inference logic
  - Added penalty calculation system
  - Replaced duration-weighted averaging

### Data Storage
- **Execution scores**: Stored in `workout_analysis.performance`
- **Segment summaries**: Stored in `workout_analysis.granular_analysis`
- **Penalty details**: Available in server logs for debugging

### Frontend Integration
- **No changes needed**: Frontend already reads from `workout_analysis.performance`
- **Automatic refresh**: Event-based system updates display after analysis
- **Backward compatible**: Existing workouts get new scores on next analysis

---

## 🎯 Summary

The Garmin-style execution scoring system transforms misleading inflated scores into honest, actionable feedback that helps athletes understand their actual workout compliance and identify specific areas for improvement.

**Key transformation**: 103% → 71% execution score that accurately reflects workout quality and provides clear guidance for better training execution.
