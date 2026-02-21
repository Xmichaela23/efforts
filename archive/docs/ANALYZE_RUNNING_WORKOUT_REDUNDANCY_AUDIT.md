# analyze-running-workout — Redundancy & Unused Code Audit

**Purpose:** Identify redundancies, dead code, and code no longer used so you can clean up safely. No code changes in this audit.

---

## 0. Why ~7,300 lines is excessive (structural bloat)

**Yes — 7k lines is excessive for a single “analyze workout” entrypoint.** The ~150 lines of obvious dead code is only a small part. Most of the bulk is **everything living in one place** instead of being split into lib modules, plus **duplicate “build intervals” paths** in the main handler.

### Where the lines actually go

| Location | Lines (approx) | What |
|----------|----------------|------|
| **index.ts** | **4,311** | Single file: interfaces, Garmin execution scoring, main handler (fetch + 4 ways to build intervals), granular adherence (interval + steady-state), detailed chart analysis, mile-by-mile terrain, plan context fetch, adherence summary (verdict + templates), dead helpers. |
| **lib/intervals/interval-breakdown.ts** | 1,082 | Interval breakdown (labels, pacing, etc.). |
| **lib/narrative/prompt-builders.ts** | 880 | AI prompt building. |
| **token-parser.ts** | 412 | Running token parsing (duplicated in compute-workout-analysis). |
| **lib/analysis/heart-rate-drift.ts** | 240 | HR drift. |
| **lib/adherence/pace-adherence.ts** | 157 | Pace range adherence scoring. |
| **lib/narrative/ai-generator.ts** | 98 | AI narrative entry. |
| **lib/analysis/elevation.ts** | 81 | Elevation. |
| **lib/analysis/heart-rate.ts** | 52 | Interval HR. |
| **Total** | **~7,313** | |

### Structural bloat inside index.ts

Rough breakdown of the **4,311-line index.ts**:

| Block | Lines (approx) | Could move to |
|-------|----------------|----------------|
| Comments + interfaces (incl. unused HeartRate*, EnhancedAdherence) | ~165 | Types file or delete unused. |
| Garmin execution (inferSegmentType → calculateGarminExecutionScore, SEGMENT_CONFIG) | ~300 | e.g. `lib/adherence/garmin-execution.ts`. |
| Main handler: fetch workout, baselines, **four different paths** to build intervals | ~550 | e.g. `lib/load-and-enrich.ts` or `lib/intervals/build-intervals.ts` — one function, four strategies. |
| calculatePrescribedRangeAdherenceGranular + calculateIntervalPaceAdherence + calculateSteadyStatePaceAdherence + analyzeIntervalPace + small helpers | ~1,100 | e.g. `lib/adherence/granular-pace.ts`. |
| generateDetailedChartAnalysis + analyzeSpeedFluctuations + analyzeHeartRateRecovery | ~210 | e.g. `lib/analysis/detailed-chart.ts` (or split). |
| generateMileByMileTerrainBreakdown | ~418 | e.g. `lib/analysis/mile-by-mile-terrain.ts`. |
| fetchPlanContextForWorkout | ~191 | e.g. `lib/plan-context.ts`. |
| generateAdherenceSummary (verdict + technical_insights + plan_impact template strings) | ~377 | e.g. `lib/narrative/adherence-summary.ts`. |
| Dead: generateScoreExplanation, calculatePaceFromGPS, calculateTimeInRangeAdherence | ~100 | Remove. |
| Rest (merge, write, re-read, minimalComputed, etc.) | ~900 | Stays in index as orchestration (can shrink once above move). |

So **well over 3,000 lines** in index.ts are **extractable into lib/** (Garmin execution, interval building, granular adherence, detailed chart, mile-by-mile, plan context, adherence summary). After that, index could be a **thin orchestrator** (~300–600 lines): load → call lib → merge → write.

### Redundancy that adds bulk

1. **Four ways to build intervals** in the main handler (lines ~606–~1060): `planned_steps_light` snapshot, `computed.steps` materialized, `plannedWorkout.intervals`, `steps_preset` + token parser. Same goal, four big branches. Could be one function that picks strategy and returns one structure.
2. **Two scoring systems** in one file: (a) Garmin-style penalty execution score, (b) granular time-in-range pace adherence. Both are used; putting (a) in `lib/adherence/garmin-execution.ts` and (b) in `lib/adherence/granular-pace.ts` would shrink index and clarify roles.
3. **Token parser duplicated** in compute-workout-analysis (see §2.1) — hundreds of lines duplicated.

### Bottom line

- **Removing only the ~150 lines of dead code** barely touches the problem.
- **Moving 3k+ lines from index.ts into lib/** would make the function much easier to work on and test.
- **Unifying “build intervals”** into one place and **deduplicating the token parser** would cut redundancy and total line count.

So yes — 7k lines is excessive; the main lever is **extraction into lib/** and **fewer duplicate paths**, not just deleting a handful of dead functions.

---

## 1. Dead code (defined but never called)

### 1.1 In `index.ts`

| Item | Location (approx) | Notes |
|------|-------------------|--------|
| **generateScoreExplanation** | ~4293–4290 | Function is **defined** but **never called**. Score explanation is set directly from `adherenceSummary?.verdict` (line ~1680). Safe to remove the function. |
| **calculatePaceFromGPS** | ~2778–2825 | **Never called.** Haversine-based pace-from-GPS helper. Pace is computed elsewhere (e.g. from sensor_data / computed). Safe to remove. |
| **calculateTimeInRangeAdherence** | ~2832–2861 | **Never called.** Duplicate of logic that lives inside `analyzeIntervalPace` (sample-by-sample time-in-range). Safe to remove. |

### 1.2 In `lib/adherence/pace-adherence.ts`

| Item | Notes |
|------|--------|
| **calculatePaceRangeAdherenceLegacy** | Exported, marked `@deprecated`. **Never imported or called** anywhere in the repo. All callers use `calculatePaceRangeAdherence` with `intervalType`. Safe to remove. |

### 1.3 Unused interfaces / types in `index.ts`

| Interface | Notes |
|-----------|--------|
| **HeartRateZone**, **HeartRateZones**, **HeartRateAdherence** | Defined at top (~49–74). Only referenced inside **HeartRateAdherence** (nested). No variable or return type in the file uses these; they appear to be leftovers from removed HR-zone adherence code. |
| **PacingVariability**, **EnhancedAdherence** | Defined at top (~77–96). Same — no usages as types. Comment at ~3085 mentions removed `calculateEnhancedAdherence`. Safe to remove these interfaces if nothing external expects them (they are not exported). |

---

## 2. Redundancies (duplicate logic or two implementations of the same idea)

### 2.1 Running token parser — duplicated in two functions

| Location | What |
|----------|------|
| **analyze-running-workout/token-parser.ts** | Full token parser: `parseRunningTokens`, `parseToken`, `parseWarmupToken`, `parseCooldownToken`, `parseIntervalToken`, `parseTempoToken`, `parseLongRunToken`, `parseEasyRunToken`, pace helpers (~412 lines). Used in **analyze-running-workout** when building intervals from `steps_preset` (dynamic import ~762). |
| **compute-workout-analysis/index.ts** | **Inline duplicate** of the same idea: `parseRunningTokens`, `parseToken`, `parseWarmupToken`, `parseCooldownToken`, etc. (~hundreds of lines). Same purpose: turn `steps_preset` + baselines into run segments. |

**Recommendation:** One source of truth. Either (a) compute-workout-analysis imports and uses `token-parser.ts` from analyze-running-workout (or a shared lib), or (b) token parsing lives in a shared Supabase lib and both functions use it. Right now the two can drift.

### 2.2 Two adherence/pace paths in the same file

The main flow uses:

1. **calculatePrescribedRangeAdherenceGranular** → which calls either **calculateIntervalPaceAdherence** (intervals) or **calculateSteadyStatePaceAdherence** (single steady-state).
2. **calculateGarminExecutionScore** (segment penalties) for **execution_adherence** only.

So there are two parallel concepts: (a) time-in-range / granular pace adherence, and (b) Garmin-style penalty execution score. Both are used; not redundant, but the file mixes them and the naming (“adherence” vs “execution”) can be confusing. No removal suggested; just be aware when refactoring.

### 2.3 Verdict / summary: two ways to get “one line”

- **generateAdherenceSummary** returns `{ verdict, technical_insights, plan_impact }`. The code uses `adherenceSummary.verdict` for `score_explanation`.
- **generateScoreExplanation** would produce the same verdict from the same inputs but is **never called**. So the “single verdict line” is produced only via `generateAdherenceSummary` + `.verdict`. The separate `generateScoreExplanation` is redundant dead code (see 1.1).

---

## 3. Code written by backend but not read by frontend (or read in wrong place)

| Written by backend | Read by frontend? | Note |
|--------------------|-------------------|------|
| **workout_analysis.performance** (execution_adherence, pace_adherence, duration_adherence) | Yes — MobileSummary, TodaysWorkoutsTab, useExecutionScore (deprecated) | Used. |
| **workout_analysis.detailed_analysis** (interval_breakdown, etc.) | Yes — MobileSummary, TodaysWorkoutsTab | Used. |
| **workout_analysis.granular_analysis** | Referenced in deprecated adherence.ts; MobileSummary doesn’t use it directly | Largely superseded by performance + detailed_analysis. |
| **workout_analysis.adherence_summary** | Yes — MobileSummary | Used. |
| **workout_analysis.narrative_insights** | Yes — MobileSummary; TodaysWorkoutsTab (unused component) | Used. |
| **workout_analysis.score_explanation** | Yes — MobileSummary | Used. |
| **workout_analysis.mile_by_mile_terrain** | Yes — TodaysWorkoutsTab (in analysisMetrics) | Used. |
| **workout_analysis.performance_assessment** | TodaysWorkoutsTab reads **w.workout_analysis?.performance_assessment** (top-level) | Backend does **not** set top-level `workout_analysis.performance_assessment`; it sets `workout_analysis.performance` and `granular_analysis.performance_assessment`. So TodaysWorkoutsTab may be reading an old/empty path. |

---

## 4. Deprecated / legacy call sites (frontend)

| File | What | Note |
|------|------|------|
| **useExecutionScore.ts** | Deprecated; tells callers to use `workout_analysis.performance` | **Never imported** anywhere in `src`. Dead. |
| **services/metrics/adherence.ts** | Deprecated; only imported by **useExecutionScore.ts** | Dead if useExecutionScore is removed. |

So **useExecutionScore** and **calculateExecutionPercentage** are unused; safe to remove both (or keep as deprecated stubs).

---

## 5. Summary: safe-to-remove checklist

| Category | Item | Action |
|----------|------|--------|
| Dead function | **generateScoreExplanation** (index.ts) | Remove function; keep using `adherenceSummary?.verdict` for score_explanation. |
| Dead functions | **calculatePaceFromGPS**, **calculateTimeInRangeAdherence** (index.ts) | Remove (~55 + ~30 lines). |
| Dead export | **calculatePaceRangeAdherenceLegacy** (pace-adherence.ts) | Remove (or keep and document as deprecated compat stub). |
| Unused types | **HeartRateZone**, **HeartRateZones**, **HeartRateAdherence**, **PacingVariability**, **EnhancedAdherence** (index.ts) | Remove if confirmed no external types depend on them. |
| Redundancy | **Token parser** in compute-workout-analysis | Replace inline implementation with shared token-parser (e.g. from analyze-running-workout or a lib) to avoid drift. |
| Frontend dead | **useExecutionScore.ts** | Never imported; remove or keep as deprecated stub. |
| Frontend dead | **services/metrics/adherence.ts** | Only used by useExecutionScore; remove with it or keep as stub. |

---

## 6. Line-count impact (approximate)

| Change | Lines (approx) |
|--------|----------------|
| **Dead code only** (generateScoreExplanation, calculatePaceFromGPS, calculateTimeInRangeAdherence, calculatePaceRangeAdherenceLegacy, unused interfaces) | **~150** — small. |
| **Deduplicating token parser** (compute-workout-analysis) | Replace hundreds of lines with import; net reduction depends on shared module location. |
| **Extracting from index.ts into lib/** (Garmin execution, granular adherence, detailed chart, mile-by-mile, plan context, adherence summary, interval building) | **~3,000+** lines moved out of index; index shrinks to ~300–600 line orchestrator. Total repo lines similar until you delete duplicates; maintainability and testability improve a lot. |

---

## 7. Files to touch when cleaning (reference)

- **supabase/functions/analyze-running-workout/index.ts** — dead functions and unused interfaces.
- **supabase/functions/analyze-running-workout/lib/adherence/pace-adherence.ts** — legacy export.
- **supabase/functions/compute-workout-analysis/index.ts** — token parser deduplication (use shared parser).
- **src/hooks/useExecutionScore.ts** — never imported; remove or keep as deprecated stub.
- **src/services/metrics/adherence.ts** — only imported by useExecutionScore; remove with it or keep as stub.

No code was changed in this audit; this file is for reference when you perform the cleanup.
