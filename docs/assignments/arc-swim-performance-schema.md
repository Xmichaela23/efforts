# Assignment: Arc Swim Performance Schema

**Status:** Planned — not implemented.  
**Purpose:** Single backlog/spec for Arc swim analysis, derivation, persistence, ArcContext integration, and plan generation hooks.

---

## 1. Workout Ingestion Layer

When Arc processes a completed swim workout:

```typescript
// When Arc processes a completed swim workout
interface SwimWorkoutAnalysis {
  workout_id: string;
  completed_at: timestamp;

  // Equipment detection
  equipment_used: {
    pull_buoy: boolean;
    fins: boolean;
    paddles: boolean;
    kickboard: boolean;
    snorkel: boolean;
  };

  // Extracted from tags, tokens, and copy
  detection_sources: {
    tags: string[]; // ['req:buoy', 'pull_focus_swim']
    tokens: string[]; // ['swim_pull_6x100yd_r20_buoy']
    copy_keywords: string[]; // ['with pull buoy', 'fins optional']
  };

  // Session classification
  is_baseline_eligible: boolean; // No equipment used
  session_type: SwimSessionType; // 'threshold', 'pull_focused', etc.

  // Effort extraction
  efforts: SwimEffort[];
}

interface SwimEffort {
  distance_yards: number;
  duration_seconds: number;
  pace_per_100yd: number; // Calculated: (duration / distance) * 100

  // Intensity classification
  zone: "Z1" | "Z2" | "Z3" | "Z4" | "Z5";
  intensity_signal: "aerobic" | "tempo" | "threshold" | "vo2max";

  // Context
  effort_type: "continuous" | "interval" | "warmup" | "cooldown";
  rest_before: number; // Seconds

  // Equipment state for this specific effort
  equipment_free: boolean;
}
```

---

## 2. Equipment Detection Logic

```typescript
function analyzeSwimWorkout(workout: CompletedWorkout): SwimWorkoutAnalysis {
  const equipment = {
    pull_buoy: false,
    fins: false,
    paddles: false,
    kickboard: false,
    snorkel: false,
  };

  const sources = {
    tags: [],
    tokens: [],
    copy_keywords: [],
  };

  // Check tags
  const equipmentTags = {
    "req:buoy": "pull_buoy",
    "req:fins": "fins",
    "req:paddles": "paddles",
    "req:kickboard": "kickboard",
    "pull_focus_swim": "pull_buoy", // Implies buoy
  };

  workout.tags?.forEach((tag) => {
    if (equipmentTags[tag]) {
      equipment[equipmentTags[tag]] = true;
      sources.tags.push(tag);
    }
  });

  // Check tokens
  workout.steps?.forEach((step) => {
    step.tokens?.forEach((token) => {
      if (token.includes("_buoy")) {
        equipment.pull_buoy = true;
        sources.tokens.push(token);
      }
      if (token.includes("_fins")) {
        equipment.fins = true;
        sources.tokens.push(token);
      }
      if (token.includes("_paddles")) {
        equipment.paddles = true;
        sources.tokens.push(token);
      }
      if (token.includes("_board")) {
        equipment.kickboard = true;
        sources.tokens.push(token);
      }
    });
  });

  // Check copy/description
  const copyText = (workout.description || "").toLowerCase();
  const keywords = {
    "pull buoy": "pull_buoy",
    "with buoy": "pull_buoy",
    fins: "fins",
    paddles: "paddles",
    kickboard: "kickboard",
    snorkel: "snorkel",
  };

  Object.entries(keywords).forEach(([phrase, equip]) => {
    if (copyText.includes(phrase)) {
      equipment[equip] = true;
      sources.copy_keywords.push(phrase);
    }
  });

  // Baseline eligibility: no equipment at all
  const is_baseline_eligible = !Object.values(equipment).some((v) => v);

  return {
    workout_id: workout.id,
    completed_at: workout.completed_at,
    equipment_used: equipment,
    detection_sources: sources,
    is_baseline_eligible,
    session_type: workout.session_type,
    efforts: extractEfforts(workout, is_baseline_eligible),
  };
}
```

---

## 3. Effort Extraction from Steps

```typescript
function extractEfforts(
  workout: CompletedWorkout,
  baseline_eligible: boolean
): SwimEffort[] {
  const efforts: SwimEffort[] = [];

  workout.steps?.forEach((step, idx) => {
    // Parse step for distance/duration
    const parsed = parseSwimStep(step);
    if (!parsed) return;

    // Classify intensity from token/zone
    const zone = inferZoneFromToken(step.token);
    const intensity = classifyIntensity(zone, step.token);

    // Determine effort type
    const effort_type = classifyEffortType(step.token, idx);

    // Skip warmup/cooldown for pace extraction
    if (effort_type === "warmup" || effort_type === "cooldown") {
      return;
    }

    // Calculate rest before this effort
    const rest_before =
      idx > 0 ? calculateRestBetween(workout.steps[idx - 1], step) : 0;

    efforts.push({
      distance_yards: parsed.distance,
      duration_seconds: parsed.duration,
      pace_per_100yd: (parsed.duration / parsed.distance) * 100,
      zone,
      intensity_signal: intensity,
      effort_type,
      rest_before,
      equipment_free: baseline_eligible,
    });
  });

  return efforts;
}

function classifyIntensity(
  zone: string,
  token: string
): "aerobic" | "tempo" | "threshold" | "vo2max" {
  // Z1-Z2 = aerobic
  if (zone === "Z1" || zone === "Z2") return "aerobic";

  // Z3 = tempo
  if (zone === "Z3") return "tempo";

  // Z4 or CSS/threshold keywords = threshold
  if (zone === "Z4" || token.includes("threshold") || token.includes("css")) {
    return "threshold";
  }

  // Z5 = vo2max
  if (zone === "Z5") return "vo2max";

  // Default to aerobic
  return "aerobic";
}

function classifyEffortType(
  token: string,
  stepIndex: number
): "continuous" | "interval" | "warmup" | "cooldown" {
  if (token.includes("warmup")) return "warmup";
  if (token.includes("cooldown")) return "cooldown";

  // Intervals have rep structure (e.g., 6x100yd)
  if (/\d+x\d+/.test(token)) return "interval";

  // Continuous (e.g., 1x1000yd or swim_aerobic_*)
  return "continuous";
}
```

---

## 4. Arc Performance Derivation

```typescript
interface ArcSwimPerformance {
  // Baseline (equipment-free) performance
  baseline: {
    css_pace_100yd: number | null; // Median threshold pace, no equipment
    aerobic_pace_100yd: number | null; // Median Z2 pace, no equipment
    tempo_pace_100yd: number | null; // Median Z3 pace, no equipment

    // Sample metadata
    threshold_samples: number; // # of qualifying threshold efforts
    aerobic_samples: number;
    last_baseline_threshold: timestamp | null;
    last_baseline_aerobic: timestamp | null;

    // Confidence
    confidence: "none" | "low" | "medium" | "high";
  };

  // Equipment-assisted tracking (for monitoring/comparison)
  equipment_assisted: {
    pull_buoy_threshold_pace: number | null; // Typically 3-8% faster
    fins_aerobic_pace: number | null; // Significantly faster
    // Could add more if useful
  };

  // Recent trend
  recent_baseline_efforts: SwimEffort[]; // Last 20 equipment-free threshold efforts
  trend: "improving" | "stable" | "declining" | "insufficient_data";
}

function deriveSwimPerformance(
  workouts: SwimWorkoutAnalysis[],
  lookback_days: number = 90
): ArcSwimPerformance {
  const cutoff = Date.now() - lookback_days * 24 * 60 * 60 * 1000;
  const recent = workouts.filter((w) => w.completed_at >= cutoff);

  // Extract baseline efforts only
  const baselineEfforts = recent
    .filter((w) => w.is_baseline_eligible)
    .flatMap((w) => w.efforts)
    .filter((e) => e.equipment_free);

  // Threshold efforts (Z4, 100-400 yd, adequate rest)
  const thresholdEfforts = baselineEfforts.filter(
    (e) =>
      e.intensity_signal === "threshold" &&
      e.distance_yards >= 100 &&
      e.distance_yards <= 400 &&
      e.rest_before >= 10 // At least 10 sec rest (real interval)
  );

  // Aerobic efforts (Z2, 100+ yd continuous or long intervals)
  const aerobicEfforts = baselineEfforts.filter(
    (e) =>
      e.intensity_signal === "aerobic" &&
      e.distance_yards >= 100
  );

  // Tempo efforts (Z3, 100+ yd)
  const tempoEfforts = baselineEfforts.filter(
    (e) =>
      e.intensity_signal === "tempo" &&
      e.distance_yards >= 100
  );

  // Calculate medians
  const css_pace =
    thresholdEfforts.length >= 3
      ? median(thresholdEfforts.map((e) => e.pace_per_100yd))
      : null;

  const aerobic_pace =
    aerobicEfforts.length >= 5
      ? median(aerobicEfforts.map((e) => e.pace_per_100yd))
      : null;

  const tempo_pace =
    tempoEfforts.length >= 3
      ? median(tempoEfforts.map((e) => e.pace_per_100yd))
      : null;

  // Confidence based on sample size
  const confidence = calculateConfidence(
    thresholdEfforts.length,
    aerobicEfforts.length
  );

  // Equipment-assisted paces (for comparison)
  const pullBuoyThresholdEfforts = recent
    .filter((w) => w.equipment_used.pull_buoy)
    .flatMap((w) => w.efforts)
    .filter(
      (e) =>
        e.intensity_signal === "threshold" && e.distance_yards >= 100
    );

  const pull_buoy_pace =
    pullBuoyThresholdEfforts.length >= 3
      ? median(pullBuoyThresholdEfforts.map((e) => e.pace_per_100yd))
      : null;

  // Trend analysis
  const trend = analyzeTrend(thresholdEfforts);

  return {
    baseline: {
      css_pace_100yd: css_pace,
      aerobic_pace_100yd: aerobic_pace,
      tempo_pace_100yd: tempo_pace,
      threshold_samples: thresholdEfforts.length,
      aerobic_samples: aerobicEfforts.length,
      last_baseline_threshold: thresholdEfforts[0]?.completed_at || null,
      last_baseline_aerobic: aerobicEfforts[0]?.completed_at || null,
      confidence,
    },
    equipment_assisted: {
      pull_buoy_threshold_pace: pull_buoy_pace,
      fins_aerobic_pace: null, // Could add if useful
    },
    recent_baseline_efforts: thresholdEfforts.slice(0, 20),
    trend,
  };
}

function calculateConfidence(
  thresholdSamples: number,
  aerobicSamples: number
): "none" | "low" | "medium" | "high" {
  if (thresholdSamples === 0) return "none";
  if (thresholdSamples < 3) return "low";
  if (thresholdSamples < 6 || aerobicSamples < 10) return "medium";
  return "high";
}

function analyzeTrend(
  efforts: SwimEffort[]
): "improving" | "stable" | "declining" | "insufficient_data" {
  if (efforts.length < 6) return "insufficient_data";

  // Sort by date
  const sorted = [...efforts].sort((a, b) =>
    a.completed_at - b.completed_at
  );

  // Split into early/late halves
  const mid = Math.floor(sorted.length / 2);
  const early = sorted.slice(0, mid);
  const late = sorted.slice(mid);

  const earlyMedian = median(early.map((e) => e.pace_per_100yd));
  const lateMedian = median(late.map((e) => e.pace_per_100yd));

  // Pace decreasing = improving (faster)
  const delta = lateMedian - earlyMedian;

  if (delta < -2) return "improving"; // 2+ sec/100 yd faster
  if (delta > 2) return "declining"; // 2+ sec/100 yd slower
  return "stable";
}
```

### Implementation notes (from spec vs. pseudocode gap)

- `SwimEffort` in §1 lacks `completed_at`; `analyzeTrend` sorts by date — tie `completed_at` from the parent workout to each stored effort row (or attach workout id only and join when deriving trend).
- `last_baseline_threshold` / `last_baseline_aerobic` imply ordering by workout/effort time after filtering, not array index `[0]` unless explicit sort is applied.

---

## 5. Integration with Arc Context

```typescript
// In getArcContext response
interface ArcContext {
  // ... existing fields

  swim_performance: ArcSwimPerformance;

  // Derived thresholds for plan generation
  swim_thresholds: {
    css_pace_100yd: number | null; // From baseline.css_pace_100yd
    css_pace_source: "arc_derived" | "user_input" | "default";
    css_last_updated: timestamp | null;
    confidence: "none" | "low" | "medium" | "high";
  };
}
```

Align with workspace rule: **Arc** is deterministic truth loaded via **`getArcContext()`** — extend ArcContext and loaders rather than scattering swim logic in plans only.

---

## 6. Usage in Plan Generation

```typescript
// In create-goal-and-materialize-plan
const arcContext = await getArcContext(userId);

const athlete_state = {
  // ... other fields

  swim_threshold_pace:
    arcContext.swim_thresholds.css_pace_100yd || // Arc-derived baseline
    user_input_css || // Manual entry
    DEFAULT_CSS_PACE, // Fallback

  swim_threshold_source: arcContext.swim_thresholds.css_pace_source,
  swim_threshold_confidence: arcContext.swim_thresholds.confidence,
};

// Combined-plan uses athlete_state.swim_threshold_pace for zone calculations
```

---

## 7. Data Storage (Supabase)

```sql
-- New table: arc_swim_performance
CREATE TABLE arc_swim_performance (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),

  -- Baseline performance
  css_pace_100yd numeric,
  aerobic_pace_100yd numeric,
  tempo_pace_100yd numeric,
  threshold_samples integer DEFAULT 0,
  aerobic_samples integer DEFAULT 0,
  last_baseline_threshold timestamptz,
  last_baseline_aerobic timestamptz,
  confidence text CHECK (confidence IN ('none', 'low', 'medium', 'high')),

  -- Equipment-assisted tracking
  pull_buoy_threshold_pace numeric,
  fins_aerobic_pace numeric,

  -- Metadata
  trend text CHECK (trend IN ('improving', 'stable', 'declining', 'insufficient_data')),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT valid_paces CHECK (
    css_pace_100yd IS NULL OR css_pace_100yd BETWEEN 30 AND 300
  )
);

-- Index for quick lookups
CREATE INDEX idx_arc_swim_perf_user ON arc_swim_performance(user_id);

-- New table: arc_swim_efforts (for trend analysis)
CREATE TABLE arc_swim_efforts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  workout_id uuid REFERENCES workouts(id),

  -- Effort details
  distance_yards integer NOT NULL,
  duration_seconds integer NOT NULL,
  pace_per_100yd numeric NOT NULL,
  zone text,
  intensity_signal text,
  effort_type text,

  -- Context
  equipment_free boolean DEFAULT true,
  equipment_used jsonb, -- { pull_buoy: true, fins: false, ... }
  completed_at timestamptz NOT NULL,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_arc_swim_efforts_user_time ON arc_swim_efforts(user_id, completed_at DESC);
CREATE INDEX idx_arc_swim_efforts_baseline ON arc_swim_efforts(user_id, equipment_free) WHERE equipment_free = true;
```

---

## 8. Arc Update Trigger

```typescript
// When a swim workout is completed
async function onSwimWorkoutCompleted(workout: CompletedWorkout) {
  // 1. Analyze workout for equipment and efforts
  const analysis = analyzeSwimWorkout(workout);

  // 2. Store efforts in arc_swim_efforts
  await storeSwimEfforts(analysis);

  // 3. Re-derive performance from last 90 days
  const performance = await deriveSwimPerformance(
    userId,
    lookback_days = 90
  );

  // 4. Update arc_swim_performance table
  await upsertSwimPerformance(userId, performance);

  // 5. Invalidate Arc context cache
  await invalidateArcCache(userId);
}
```

---

## Summary

**What Arc learns**

- Equipment detection from tags, tokens, and copy
- Baseline pace (equipment-free threshold efforts only)
- Aerobic/tempo paces for zone validation
- Equipment-assisted paces for comparison
- Confidence based on sample size
- Performance trend (improving/stable/declining)

**What plan generation gets**

- Clean CSS pace from baseline efforts only
- Confidence level (affects whether to use Arc vs fallback)
- Source tracking (Arc-derived vs user input)

**Data quality**

- Minimum 3 threshold efforts for CSS pace
- Minimum 5 aerobic efforts for Z2 pace
- 90-day lookback window
- Trend requires 6+ efforts

**Equipment isolation**

- Pull buoy pace tracked separately
- Fins pace tracked separately
- Only equipment-free efforts used for baseline zones

**Outcome:** accurate threshold pacing independent of equipment usage.
