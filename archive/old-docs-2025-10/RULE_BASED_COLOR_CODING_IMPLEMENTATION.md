# Rule-Based Color Coding Implementation

## Overview
Implemented intelligent, context-aware color coding for workout summary percentages in `MobileSummary.tsx`. The system determines workout intent from tokens, tags, and description, then applies specific color logic and contextual messages based on the session type.

## Implementation Date
October 7, 2025

## Core Components

### 1. Workout Intent Detection (`determineWorkoutIntent`)
**Priority Hierarchy:**
1. **Intensity** (Rule C) - threshold, vo2, interval, tempo tokens
2. **Recovery/Easy** (Rule A) - recovery, easypace, z1, z2, longrun tokens
3. **Technique/Drill** (Rule B) - drill, technique tokens
4. **Neutral** - fallback for unclassified workouts

**Detection Logic:**
```typescript
// Checks tokens from steps_preset, tags, and description
// Returns: 'RULE_A_RECOVERY' | 'RULE_B_TECHNIQUE' | 'RULE_C_INTENSITY' | 'NEUTRAL'
```

### 2. Rule-Based Color Logic (`getRuleBasedColor`)

#### Rule A: Recovery/Easy Sessions
**Intent:** Maintain prescribed easy zone, avoid going too hard or too long

| Metric   | Range      | Color  | Meaning                    |
|----------|------------|--------|----------------------------|
| Duration | <90%       | 🟢 Green | Faster (acceptable)      |
| Duration | 90-110%    | 🟢 Green | On target                |
| Duration | >110%      | 🔴 Red   | Too long                 |
| Distance | <95%       | 🟡 Yellow | Short                   |
| Distance | 95-115%    | 🟢 Green | On target                |
| Distance | >115%      | 🔴 Red   | Too far                  |
| Pace     | <90%       | 🟡 Yellow | Too slow                |
| Pace     | 90-110%    | 🟢 Green | In zone                  |
| Pace     | >110%      | 🔴 Red   | Too fast (zone violation)|

#### Rule B: Technique/Drill Sessions
**Intent:** Complete prescribed sets, pace not prescribed

| Metric   | Range      | Color  | Meaning                    |
|----------|------------|--------|----------------------------|
| Duration | <80%       | ⚪ Gray  | Significantly shorter     |
| Duration | 80-120%    | 🟢 Green | Acceptable range         |
| Duration | >120%      | 🟡 Yellow | Took much longer        |
| Distance | <95%       | 🟡 Yellow | Short                   |
| Distance | 95-125%    | 🟢 Green | Acceptable range         |
| Distance | >125%      | ⚪ Gray  | Extra volume (neutral)   |
| Pace     | Any        | ⚪ Gray  | No pace prescription     |

#### Rule C: Intensity Sessions
**Intent:** Hit or exceed target intensity, faster is better

| Metric   | Range      | Color  | Meaning                    |
|----------|------------|--------|----------------------------|
| Duration | <90%       | 🟢 Green | Faster (good)            |
| Duration | 90-110%    | 🟢 Green | On target                |
| Duration | >110%      | 🟡 Yellow | Took too long           |
| Distance | <95%       | 🟡 Yellow | Short                   |
| Distance | 95-115%    | 🟢 Green | On target                |
| Distance | >115%      | 🟢 Green | Extra distance (good)    |
| Pace     | <95%       | 🟡 Yellow | Slower than target      |
| Pace     | 95-100%    | 🟢 Green | On target                |
| Pace     | >100%      | 🟢 Green | Faster than target (good)|

### 3. Contextual Messages (`getContextualMessage`)

Messages are displayed below the chips with icon + text format.

#### Rule A Messages:
- ⚠️ "Pace too fast for prescribed recovery zone" (pace >110%)
- ⚠️ "Distance exceeded recovery zone prescription" (distance >115%)
- ⚠️ "Duration longer than prescribed recovery zone" (duration >110%)
- ✓ "Recovery zone maintained" (all metrics in range)

#### Rule B Messages:
- ⚠️ "Drill session took significantly longer than planned" (duration >120%)
- ✓ "Workout completed - all prescribed sets done" (default)

#### Rule C Messages:
- 💪 "Averaged faster than target pace" (pace >100%)
- 💪 "Completed intervals faster than planned" (duration <95%)
- ⚠️ "Pace slower than intensity target" (pace <95%)
- ⚠️ "Intervals took longer than prescribed" (duration >110%)
- ✓ "Intensity targets achieved" (on target)

## Applied To All Workout Types

### 1. Run/Walk
- **Metrics:** Pace, Duration
- **Display:** Chips with pace delta (e.g., "28s/mi faster") and duration delta (e.g., "+1:54")
- **Message:** Below chips, contextual to intent

### 2. Open Water Swim
- **Metrics:** Pace (per 100yd/m), Duration
- **Display:** Chips with pace delta (e.g., "15s/100yd faster") and duration delta
- **Message:** Below chips, contextual to intent

### 3. Bike/Ride
- **Metrics:** Watts (treated as pace), Duration
- **Display:** Chips with power delta (e.g., "+15 W") and duration delta
- **Message:** Below chips, contextual to intent

### 4. Pool Swim
- **Metrics:** Distance, Duration
- **Display:** Chips with distance delta (e.g., "+149 yd") and duration delta
- **Message:** Below chips, contextual to intent
- **Note:** No pace chip (Garmin API limitation)

## Example Outcomes

### Example 1: Recovery Technique Swim (Rule B)
**Workout:** `swim_drill_catchup_4x50yd_r15` + `swim_aerobic_6x100yd_r15`
**Metrics:** 115% distance, 92% duration, 125% pace
**Colors:** 
- Distance: 🟢 Green (95-125% range)
- Duration: 🟢 Green (80-120% range)
- Pace: ⚪ Gray (no prescription)
**Message:** ✓ "Workout completed - all prescribed sets done"

### Example 2: Easy Long Run (Rule A)
**Workout:** `longrun_90min_easypace`
**Metrics:** 118% distance, 98% duration, 112% pace
**Colors:**
- Distance: 🔴 Red (>115%)
- Duration: 🟢 Green (90-110%)
- Pace: 🔴 Red (>110%)
**Message:** ⚠️ "Pace too fast for prescribed recovery zone"

### Example 3: Threshold Intervals (Rule C)
**Workout:** `swim_threshold_6x100yd_r10`
**Metrics:** 105% distance, 94% duration, 108% pace
**Colors:**
- Distance: 🟢 Green (95-115%)
- Duration: 🟢 Green (90-110%)
- Pace: 🟢 Green (>100%)
**Message:** 💪 "Averaged faster than target pace"

## Token Detection Examples

### Intensity Tokens (Rule C):
- `swim_threshold_6x100yd_r10`
- `bike_thr_4x8min_R5min`
- `bike_vo2_5x5min_R5min`
- `interval_6x800m_5kpace_r90s`
- `tempo_30min_5kpace_plus0:50`

### Recovery Tokens (Rule A):
- `longrun_90min_easypace`
- `run_easy_60min`
- `bike_endurance_120min_Z2`
- Tags: `recovery`, `easy_run`, `z1`, `z2`, `endurance`

### Technique Tokens (Rule B):
- `swim_drill_catchup_4x50yd_r15`
- `swim_drill_616_6x50yd_r15_fins`
- Tags: `technique`
- Description contains: "drill", "technique"

## Architecture Principles

1. **Single Rule Per Workout:** One intent determination applies to ALL metrics
2. **Token Priority:** Intensity > Recovery > Technique > Neutral
3. **Athlete-Centric:** Colors and messages reflect training intent, not arbitrary thresholds
4. **Consistent Display:** Message always below chips, icon + text format
5. **Gray = Not Applicable:** Used for Rule B pace (no prescription) and neutral outcomes

## Files Modified

- `src/components/MobileSummary.tsx` (lines 781-985, 1460-1507, 1574-1617, 1708-1751, 1828-1906)

## Testing Recommendations

1. **Rule B (Technique):** Test with drill-heavy swim workout (e.g., Week 4, Day 5)
2. **Rule A (Recovery):** Test with easy long run (e.g., Week 4, Day 7)
3. **Rule C (Intensity):** Test with threshold intervals (e.g., Week 3, Day 2)
4. **Mixed Workout:** Test with drill warmup + threshold main set (should use Rule C)

## Future Enhancements

- Add strength workout support (currently uses NEUTRAL)
- Consider adding "close to target" messages for near-perfect execution
- Add user preference to disable/customize messages
- Consider adding color-blind friendly mode

## Notes

- Legacy `getPercentageColor()` function retained for backward compatibility with interval tables
- All chip rendering now uses `getRuleBasedColor()` with explicit `metricType` parameter
- Messages are optional and only render when non-null
- Gray color (`text-gray-400`) indicates "not applicable" or "neutral" outcomes
