# Context Screen Redesign Specification

## Overview

The Context Screen answers: **"How does today's workout fit into my training?"**

This is different from workout analysis (which answers "How well did I execute this workout?"). Context provides the bigger picture: training load, fatigue accumulation, sport balance, and actionable insights.

---

## Architecture

### Current System (Being Replaced)
```
Daily Tab: Individual workout analysis (AI narratives about single workouts)
Weekly Tab: Completion rates, discipline breakdown (metrics dump)
Block Tab: 4-week trends (too zoomed out)
```

### New System
```
Tab 1: "Workouts" (keep existing)
  - Individual workout analysis
  - Execution narratives
  - Interval breakdowns

Tab 2: "Context" (redesign Weekly tab)
  - 14-day timeline
  - Training load chart (7-day acute window)
  - ACWR gauge
  - Sport breakdown
  - Smart insights
```

---

## New Edge Function

### `supabase/functions/generate-training-context/index.ts`

**Purpose:** Calculate training context for a given date

**Input:**
```typescript
{
  user_id: string;
  date: string;           // YYYY-MM-DD (the "focus" date)
  workout_id?: string;    // Optional - for workout-specific insights
}
```

**Output:**
```typescript
interface TrainingContextResponse {
  // ACWR Calculation
  acwr: {
    ratio: number;                    // e.g., 1.18
    status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk';
    acute_daily_avg: number;          // 7-day average workload per day
    chronic_daily_avg: number;        // 28-day average workload per day
    acute_total: number;              // Sum of last 7 days
    chronic_total: number;            // Sum of last 28 days
    data_days: number;                // How many days of data (for progressive disclosure)
    projected?: {                     // Only if planned workout exists for focus date
      ratio: number;
      status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk';
      planned_workload: number;
    };
  };

  // Sport Breakdown (last 7 days)
  sport_breakdown: {
    run: { workload: number; percent: number; sessions: number };
    bike: { workload: number; percent: number; sessions: number };
    swim: { workload: number; percent: number; sessions: number };
    strength: { workload: number; percent: number; sessions: number };
    mobility: { workload: number; percent: number; sessions: number };
    total_workload: number;
  };

  // 14-Day Timeline (reverse chronological)
  timeline: Array<{
    date: string;
    workouts: Array<{
      id: string;
      type: string;
      name: string;
      workload_actual: number;
      duration: number;
      status: 'completed' | 'planned' | 'skipped';
    }>;
    daily_total: number;
    is_acute_window: boolean;  // true for last 7 days
  }>;

  // Week-over-Week Comparison
  week_comparison: {
    current_week_total: number;
    previous_week_total: number;
    change_percent: number;
    change_direction: 'increase' | 'decrease' | 'stable';
  };

  // Smart Insights (max 3, prioritized)
  insights: Array<{
    type: 'acwr_high' | 'consecutive_hard' | 'sport_imbalance' | 'weekly_jump';
    severity: 'critical' | 'warning' | 'info';
    message: string;
    data?: any;  // Supporting data for the insight
  }>;
}
```

---

## Workload Calculation

### Formula

**Cardio (run/bike/swim):**
```
workload = duration (hours) × intensity² × 100
```

**Strength:**
```
workload = volume_factor × intensity² × 100
where volume_factor = total_volume / 10000
      total_volume = Σ(weight × reps) across all completed sets
```

### Intensity Factors

| Sport | Token | Intensity |
|-------|-------|-----------|
| Run | `easypace` | 0.65 |
| Run | `longrun_easypace` | 0.70 |
| Run | `tempo` | 0.88 |
| Run | `5kpace` | 0.95 |
| Run | `interval` | 0.95 |
| Run | `speed` | 1.10 |
| Bike | `Z1` / `recovery` | 0.55 |
| Bike | `Z2` / `endurance` | 0.70 |
| Bike | `tempo` | 0.80 |
| Bike | `ss` | 0.90 |
| Bike | `thr` | 1.00 |
| Bike | `vo2` | 1.15 |
| Swim | `easy` | 0.65 |
| Swim | `aerobic` | 0.75 |
| Swim | `threshold` | 0.95 |
| Swim | `interval` | 1.00 |

### Workload Ranges

| Level | Workload | Example |
|-------|----------|---------|
| Light | 20-50 | Easy 30min run, recovery swim |
| Moderate | 50-100 | 1hr tempo, strength session |
| Hard | 100-200 | Long run, VO2max intervals |
| Very Hard | 200+ | Race, breakthrough workout |

---

## ACWR Calculation

### Formula

```javascript
// Rolling 7-day daily average
acuteLoad = sum(workload_actual for days D-6 to D) / 7

// Rolling 28-day daily average
chronicLoad = sum(workload_actual for days D-27 to D) / 28

// Ratio
ACWR = acuteLoad / chronicLoad
```

### Status Thresholds

| ACWR Range | Status | Color | Description |
|------------|--------|-------|-------------|
| < 0.80 | `undertrained` | Blue | Deload week or ramp-up phase |
| 0.80 - 1.30 | `optimal` | Green | Sweet spot for adaptation |
| 1.30 - 1.50 | `elevated` | Yellow | High load, monitor fatigue |
| > 1.50 | `high_risk` | Red | Overreaching, injury risk |

### Progressive Disclosure

| Days of Data | Display |
|--------------|---------|
| 0-6 | Hide ACWR, show "Train 7+ days to unlock training load insights" |
| 7-13 | Show ACWR with "(preliminary - 7 days)" caveat |
| 14-27 | Show ACWR with "(14 days of data)" caveat |
| 28+ | Show full ACWR, no caveat |

### Projected ACWR

Show only when:
- Focus date is today
- There's a planned workout for today
- That workout is not yet completed

```typescript
if (focusDate === today && plannedWorkoutExists && !completed) {
  const projectedAcute = (acuteTotal + plannedWorkload) / 7;
  const projectedACWR = projectedAcute / chronicDailyAvg;
  
  // Show:
  // "Current ACWR: 1.18 (optimal)"
  // "If you complete today's run: 1.24 (optimal)"
}
```

---

## Smart Insights (v1)

### Priority Order (show max 3)

1. **High ACWR Warning** (severity: critical)
   - Trigger: ACWR > 1.30
   - Message: "ACWR at {ratio} - consider reducing load or adding recovery"

2. **Consecutive Hard Days** (severity: warning)
   - Trigger: 3+ consecutive days with workload > 80
   - Message: "3 consecutive quality days - prioritize recovery"

3. **Large Weekly Jump** (severity: warning)
   - Trigger: Week-over-week increase > 30%
   - Message: "Weekly load increased {percent}% - monitor for fatigue signals"

4. **Sport Imbalance** (severity: info)
   - Trigger: One sport > 65% of load for 2+ weeks
   - Message: "{Sport} volume at {percent}% - ensure adequate cross-training"

### Implementation

```typescript
function generateInsights(context: TrainingContextData): Insight[] {
  const insights: Insight[] = [];
  
  // 1. High ACWR
  if (context.acwr.ratio > 1.30) {
    insights.push({
      type: 'acwr_high',
      severity: context.acwr.ratio > 1.50 ? 'critical' : 'warning',
      message: `ACWR at ${context.acwr.ratio.toFixed(2)} - consider reducing load or adding recovery`,
      data: { ratio: context.acwr.ratio }
    });
  }
  
  // 2. Consecutive hard days
  const consecutiveHardDays = calculateConsecutiveHardDays(context.timeline);
  if (consecutiveHardDays >= 3) {
    insights.push({
      type: 'consecutive_hard',
      severity: 'warning',
      message: `${consecutiveHardDays} consecutive quality days - prioritize recovery`,
      data: { days: consecutiveHardDays }
    });
  }
  
  // 3. Large weekly jump
  if (context.week_comparison.change_percent > 30) {
    insights.push({
      type: 'weekly_jump',
      severity: 'warning',
      message: `Weekly load increased ${Math.round(context.week_comparison.change_percent)}% - monitor for fatigue signals`,
      data: { change: context.week_comparison.change_percent }
    });
  }
  
  // 4. Sport imbalance (if 2+ weeks of data)
  const imbalancedSport = detectSportImbalance(context.sport_breakdown);
  if (imbalancedSport) {
    insights.push({
      type: 'sport_imbalance',
      severity: 'info',
      message: `${imbalancedSport.sport} volume at ${imbalancedSport.percent}% - ensure adequate cross-training`,
      data: imbalancedSport
    });
  }
  
  // Return top 3 by severity
  return insights
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 3);
}

const severityOrder = { critical: 0, warning: 1, info: 2 };
```

---

## UI Components

### Discipline Colors (Glassmorphism Theme)

| Discipline | Tailwind Color | Hex | Usage |
|------------|----------------|-----|-------|
| Run | `teal-500` | `#14b8a6` | Timeline dots, chart bars, pills |
| Bike | `green-500` | `#22c55e` | Timeline dots, chart bars, pills |
| Swim | `blue-500` | `#3b82f6` | Timeline dots, chart bars, pills |
| Strength | `orange-500` | `#f97316` | Timeline dots, chart bars, pills |
| Mobility | `purple-500` | `#a855f7` | Timeline dots, chart bars, pills |

### ACWR Status Colors

| Status | Tailwind | Usage |
|--------|----------|-------|
| Undertrained | `blue-500` | Gauge fill, status text |
| Optimal | `green-500` | Gauge fill, status text |
| Elevated | `yellow-500` | Gauge fill, status text |
| High Risk | `red-500` | Gauge fill, status text |

### UI Layout

```
┌─────────────────────────────────────────┐
│ Context                                 │
│ Training Load & Insights                │
├─────────────────────────────────────────┤
│                                         │
│  ACWR: 1.18 ●────────○──────────────    │
│        optimal                          │
│                                         │
│  Acute (7d): 520    Chronic (28d): 441  │
│                                         │
│  If you complete today's run: 1.24      │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  7-Day Training Load                    │
│  ┌──┬──┬──┬──┬──┬──┬──┐                │
│  │▓▓│▓▓│░░│▓▓│░░│▓▓│░░│  520 total     │
│  │▓▓│▓▓│▓▓│▓▓│░░│▓▓│░░│                │
│  │▓▓│▓▓│▓▓│▓▓│▓▓│▓▓│░░│                │
│  └──┴──┴──┴──┴──┴──┴──┘                │
│   M  T  W  T  F  S  S                   │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  Sport Breakdown (7 days)               │
│  ████████████████░░░░ Run    234 (45%)  │
│  █████████████████░░░ Bike   208 (40%)  │
│  ██████░░░░░░░░░░░░░░ Strength 78 (15%) │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ⚠️ ACWR at 1.42 - consider reducing    │
│     load or adding recovery             │
│                                         │
│  ℹ️ 3 consecutive quality days -        │
│     prioritize recovery this weekend    │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  Recent Activity (14 days)              │
│                                         │
│  Today          ○ Planned: 45min run    │
│  Yesterday      ● Run 5.2mi   82 wl     │
│  Jan 1          ● Strength    48 wl     │
│  Dec 31         ● Bike 1:15   95 wl     │
│  Dec 30         ○ Rest day              │
│  Dec 29         ● Run 8.1mi  124 wl     │
│  ...                                    │
│                                         │
└─────────────────────────────────────────┘
```

---

## Data Queries

### Main Context Query

```sql
-- Get last 28 days of completed workouts for ACWR
SELECT 
  id, 
  type, 
  name, 
  date, 
  workload_actual,
  workload_planned,
  duration,
  moving_time,
  workout_status
FROM workouts
WHERE user_id = $1
  AND date >= $2::date - INTERVAL '27 days'
  AND date <= $2::date
  AND workout_status = 'completed'
ORDER BY date DESC;

-- Get planned workout for focus date (if not completed)
SELECT 
  id,
  type,
  name,
  date,
  workload_planned,
  duration
FROM planned_workouts
WHERE user_id = $1
  AND date = $2
  AND workout_status = 'planned';
```

### ACWR Calculation

```typescript
function calculateACWR(workouts: Workout[], focusDate: Date): ACWRData {
  const sevenDaysAgo = subDays(focusDate, 6);
  const twentyEightDaysAgo = subDays(focusDate, 27);
  
  // Filter to completed only
  const completed = workouts.filter(w => w.workout_status === 'completed');
  
  // Acute: last 7 days
  const acuteWorkouts = completed.filter(w => 
    new Date(w.date) >= sevenDaysAgo && new Date(w.date) <= focusDate
  );
  const acuteTotal = acuteWorkouts.reduce((sum, w) => sum + (w.workload_actual || 0), 0);
  
  // Chronic: last 28 days
  const chronicWorkouts = completed.filter(w => 
    new Date(w.date) >= twentyEightDaysAgo && new Date(w.date) <= focusDate
  );
  const chronicTotal = chronicWorkouts.reduce((sum, w) => sum + (w.workload_actual || 0), 0);
  
  // Daily averages
  const acuteDailyAvg = acuteTotal / 7;
  const chronicDailyAvg = chronicTotal / 28;
  
  // ACWR ratio
  const ratio = chronicDailyAvg > 0 ? acuteDailyAvg / chronicDailyAvg : 0;
  
  // Status
  let status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk';
  if (ratio < 0.80) status = 'undertrained';
  else if (ratio <= 1.30) status = 'optimal';
  else if (ratio <= 1.50) status = 'elevated';
  else status = 'high_risk';
  
  return {
    ratio: Math.round(ratio * 100) / 100,
    status,
    acute_daily_avg: Math.round(acuteDailyAvg * 10) / 10,
    chronic_daily_avg: Math.round(chronicDailyAvg * 10) / 10,
    acute_total: acuteTotal,
    chronic_total: chronicTotal,
    data_days: chronicWorkouts.length
  };
}
```

---

## Implementation Phases

### Phase 1 (Week 1): Edge Function Skeleton

- [ ] Create `generate-training-context` edge function
- [ ] Implement workload queries (last 28 days)
- [ ] Return basic timeline and sport breakdown
- [ ] No ACWR yet (just data aggregation)

### Phase 2 (Week 2): ACWR + Training Load

- [ ] Implement ACWR calculation with rolling windows
- [ ] Add progressive disclosure logic
- [ ] Add projected ACWR for planned workouts
- [ ] Implement week-over-week comparison

### Phase 3 (Week 3): Smart Insights Engine

- [ ] Implement high ACWR warning
- [ ] Implement consecutive hard days detection
- [ ] Implement large weekly jump detection
- [ ] Implement sport imbalance detection
- [ ] Prioritization and limit to 3 insights

### Phase 4 (Week 4): UI Integration

- [ ] Create `useTrainingContext` hook
- [ ] Redesign WeeklyAnalysisTab → TrainingContextTab
- [ ] Build ACWR gauge component
- [ ] Build training load chart (7-day bars)
- [ ] Build sport breakdown bars
- [ ] Build insights display
- [ ] Build 14-day timeline

---

## Cache Strategy

**Cache Key:** `context:${userId}:${date}`

**TTL:** Until invalidated (up to 24 hours)

**Invalidation Triggers:**
- New workout completed → invalidate today's cache
- Workout edited → invalidate that workout's date cache
- Strava/Garmin import → invalidate all caches for user

**Implementation:**
```typescript
// In edge function
const cacheKey = `context:${userId}:${date}`;

// Check cache first
const cached = await redis.get(cacheKey);
if (cached && !forceRefresh) {
  return JSON.parse(cached);
}

// Calculate fresh context
const context = await calculateTrainingContext(userId, date);

// Cache result (expire at midnight or 24h, whichever is sooner)
const ttl = Math.min(getSecondsUntilMidnight(), 86400);
await redis.set(cacheKey, JSON.stringify(context), { ex: ttl });

return context;
```

---

## Success Metrics

1. **Engagement:** Users visit Context tab at least 3x/week
2. **Action Rate:** >20% of high ACWR warnings lead to workout modification
3. **Retention:** Context tab users have 15% higher 30-day retention
4. **Feedback:** <5% negative feedback on insight accuracy

---

## Future Enhancements (v2+)

- [ ] HR:power relationship analysis
- [ ] Missing recovery day detection
- [ ] Race-specific taper recommendations
- [ ] EWMA for ACWR (exponentially weighted)
- [ ] Performance trends over time
- [ ] Injury risk prediction model

