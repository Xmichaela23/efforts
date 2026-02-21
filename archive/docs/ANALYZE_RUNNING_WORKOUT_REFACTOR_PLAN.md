# analyze-running-workout — Refactor Plan (Modularization Strategy)

This document is the **canonical logic map** for extracting logic from `index.ts` into `lib/` so the refactor maintains integrity and avoids broken imports. Use it as the reference when implementing the extraction.

---

## 1. Garmin Execution & Tolerance (`lib/adherence/garmin-execution.ts`)

**Role:** Foundational adherence module — other parts depend on its ability to classify segments and compute tolerance.

**Move as a single block:**
- `SEGMENT_CONFIG`
- `inferSegmentType`
- `getPaceToleranceForSegment`
- `getDirectionalPenalty`
- `calculateSegmentPenalty`
- `generatePenaltyReason`
- `calculateGarminExecutionScore`

**Types to move (and export):**
- `SegmentType`
- `SegmentConfig`
- `SegmentPenalty`
- `WorkoutExecutionAnalysis`

**Exports:**
- Export **`getPaceToleranceForSegment`** so it can be used by both `index.ts` and the granular pace module.
- Export **`calculateGarminExecutionScore`** (and any other entry points needed by index).

---

## 2. Granular Pace Adherence (`lib/adherence/granular-pace.ts`)

**Role:** High-resolution “time in range” math.

**Main functions (move and export):**
- `calculatePrescribedRangeAdherenceGranular`
- `calculateIntervalPaceAdherence`
- `calculateSteadyStatePaceAdherence`
- `analyzeIntervalPace`

**Internal helpers (move, do not export):**
- `createEmptyAdherence`
- `calculateAveragePace`
- `calculateStandardDeviation`

**External dependency:**
- Import **`getPaceToleranceForSegment`** from `./garmin-execution.ts` (or `../garmin-execution` depending on path).

**Types to move (and export):**
- `PrescribedRangeAdherence`
- `IntervalAnalysis`
- `SampleTiming`

**Note:** This module will also need `calculatePaceRangeAdherence` and `getIntervalType` from existing `lib/adherence/pace-adherence.ts` (already there). No change to pace-adherence.ts unless you consolidate further.

---

## 3. Mile-by-Mile Terrain (`lib/analysis/mile-by-mile-terrain.ts`)

**Role:** Self-contained terrain breakdown.

**Move:**
- `generateMileByMileTerrainBreakdown`

**Data:** Receives `sensorData`, `intervals`, `granularAnalysis`, `plannedPaceInfo`, `workoutAvgPaceSeconds` from the orchestrator. No dependency on other index-only helpers.

**Types:** Define or re-export any interfaces used only by this function in the same file (or in a shared types module if you add one).

---

## 4. Plan Context (`lib/plan-context.ts`)

**Role:** Fetch plan/phase context for a workout.

**Move:**
- `fetchPlanContextForWorkout`

**Data:** Takes Supabase client, `userId`, `planId`, `workoutDate`. Self-contained.

---

## 5. Shared Types (optional but recommended)

To avoid circular or scattered imports:

- **Option A:** Create `lib/types/analysis-types.ts` and move types used by more than one lib file (e.g. if both granular-pace and index need `PrescribedRangeAdherence`).
- **Option B:** Each lib file exports its primary interfaces; index and other libs import from the module that “owns” the type (e.g. `PrescribedRangeAdherence` from `granular-pace.ts`, `WorkoutExecutionAnalysis` from `garmin-execution.ts`).

**Export from granular-pace:** `PrescribedRangeAdherence`, `IntervalAnalysis`, `SampleTiming`.  
**Export from garmin-execution:** `SegmentType`, `SegmentConfig`, `SegmentPenalty`, `WorkoutExecutionAnalysis`.

---

## 6. Target shape of `index.ts` (orchestrator)

After extraction, `index.ts` should read like a high-level table of contents:

```typescript
// Example of the new, elegant index.ts structure
const planContext = await fetchPlanContextForWorkout(...);
const intervals = getWorkIntervals(...);  // or keep interval building in index until a later “build intervals” extraction
const executionScore = calculateGarminExecutionScore(...);
const paceAdherence = calculatePrescribedRangeAdherenceGranular(...);
const terrain = generateMileByMileTerrainBreakdown(...);
const summary = generateAdherenceSummary(...);
// ... merge, write, etc.
```

The code will match the intended flow: physiological vs. tactical coaching insights without the bulk of implementation living in one file.

---

## 7. Implementation order (recommended)

1. **Garmin execution** (`lib/adherence/garmin-execution.ts`) — first, because granular-pace depends on `getPaceToleranceForSegment`.
2. **Granular pace** (`lib/adherence/granular-pace.ts`) — depends on garmin-execution.
3. **Mile-by-mile terrain** (`lib/analysis/mile-by-mile-terrain.ts`) — no dependency on the above.
4. **Plan context** (`lib/plan-context.ts`) — no dependency on the above.
5. **Update index.ts** — replace in-file logic with imports and calls; keep orchestration, interval building (unless extracted later), merge, and write.

---

## 8. What stays in `index.ts` (for now)

- Deno.serve handler, CORS, Supabase client.
- Loading workout, baselines, planned workout.
- **Building intervals** (four paths: planned_steps_light, computed.steps, plannedWorkout.intervals, steps_preset) — can be extracted later into e.g. `lib/intervals/build-intervals.ts`.
- Calling the new lib modules and wiring their outputs into `enhancedAnalysis`, `detailedAnalysis`, `performance`, `adherenceSummary`.
- **generateAdherenceSummary** and **generateDetailedChartAnalysis** — can be extracted in a follow-up (e.g. `lib/narrative/adherence-summary.ts`, `lib/analysis/detailed-chart.ts`).
- Merge computed, update `workout_analysis`, re-read verify.

This plan ensures the refactor preserves logic and dependencies while moving toward an orchestrator-style `index.ts`.
