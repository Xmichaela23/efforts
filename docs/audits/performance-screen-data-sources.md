# Phase 1 audit: Performance screen data sources

**Scope:** What the user actually sees on a **completed** workout’s **Performance** tab (`summary` in code) and related **Details** tab (`completed`), plus hydration hooks. Aligned with ADR `docs/adr/0001-performance-attach-and-session-detail-v1.md` and `.cursor/rules/performance-session-contract.mdc`.

**Primary entry (mobile / main app):** `AppLayout` → `UnifiedWorkoutView`.

**Secondary / legacy entry:** `WorkoutSummary` → `WorkoutDetail` + `CompletedTab` **without** `useWorkoutDetail` or `session_detail_v1` (documented under forks).

---

## 1. Component tree

```
AppLayout
└── UnifiedWorkoutView  (src/components/UnifiedWorkoutView.tsx)
    ├── useWeekUnified(dateIso, dateIso)          → unified week slice (planned context)
    ├── usePlannedWorkouts()                      → attach/reschedule mutations
    ├── useWorkoutDetail(workoutId, opts)        → Edge: workout-detail (+ merge in hook)
    ├── useEffect + supabase.from('workouts')     → refresh row on invalidate (workout_analysis, etc.)
    ├── useEffect + supabase.from('planned_workouts') → linked planned row by planned_id
    ├── Optional: materialize planned steps / invoke compute/analyze (summary-tab effects)
    └── Tabs
        ├── Tab "summary" (UI: Performance)
        │   └── MobileSummary
        │         props: planned, completed, session_detail_v1
        └── Tab "completed" (UI: Details)
            ├── Endurance / ride / run / swim / walk → CompletedTab
            │     props: workoutData, workoutType, isHydrating (= detailLoading)
            └── strength / mobility / pilates_yoga → StrengthCompletedView
                  props: workoutData, plannedWorkout, session_detail_v1
```

`UnifiedWorkoutView` **does not** pass `detailLoading` into `MobileSummary`, only into `CompletedTab`.

---

## 2. Data source map

| Field / section | Primary source | Fallback source(s) | Fallback condition | Notes |
|-----------------|----------------|----------------------|--------------------|-------|
| **Workout row base** | `workout-detail` response `workout` merged with context row | `workouts` list from `AppContext` | `useWorkoutDetail` skips fetch when `fromContext` has GPS/sensors | See §3 — **session_detail_v1 forced null** when `fromContext` path is used |
| **Execution / pace / duration / power chips (run)** | `session_detail_v1.execution` | `workout_analysis.performance`, then `workout_analysis.session_state_v1.glance.execution_score` | `session_detail_v1` missing or field null | `MobileSummary.tsx` ~1544–1557 |
| **Execution chips (ride)** | `session_detail_v1.execution` | `workout_analysis.performance` | same | ~1794–1806 |
| **Execution chips (open-water swim)** | `workout_analysis.performance` / `session_state_v1` | — | **Does not use `session_detail_v1.execution` in the same branch** | ~1730–1735 |
| **Adherence chip visibility (run)** | `session_detail_v1.display.show_adherence_chips` | — | When `hasSessionDetail` | If false, chips hidden ~1574–1575 |
| **“Plan modified” / assessed against actual** | `session_detail_v1.execution.assessed_against` | `workout_analysis.fact_packet_v1.derived.execution.assessed_against` | When no `session_detail` | ~1564–1571 |
| **Weekly intent label** (above chips) | `workout_analysis.fact_packet_v1` (plan week/focus) | — | Parsed client-side from `completed` row | `getWeeklyIntentLabel` ~276–292 |
| **Narrative paragraph (“Insights”)** | `session_detail_v1.narrative_text` | `session_state_v1.narrative.text` | sd missing or empty string | ~2466–2467 |
| **Insight bullets** | `session_detail_v1.observations[]` | `session_state_v1.summary.bullets` | sd missing or empty observations | ~2461–2465 |
| **Plan context line** | `session_detail_v1.plan_context.match.summary` | `adherence_summary.plan_impact.outlook` | sd missing or empty | ~2500–2502 |
| **Technical insights / structured blocks** | `session_state_v1.details.adherence_summary` (+ filters) | `fact_packet_v1` / flags via session_state | Mixed with bullets | ~2470–2505 |
| **Fact packet UI block** | `session_state_v1.details.fact_packet_v1` | — | version-gated | ~2470–2478 |
| **Interval table — planned labels** | `planned.computed.steps`, tokens, `joinPlannedLabel` client helper | `planned_steps_light` on completed | Various | Heavy client labeling ~45–61, ~301–303 |
| **Interval table — actual rows** | `completed.computed.intervals`, `computed_detail_steps` | `workout_analysis.detailed_analysis.interval_breakdown` (unplanned) | `hasServerComputed` false | ~583–620, ~665–688 |
| **Interval row HR / pace cells** | `session_detail_v1.intervals[]` when present | Per-interval from `computed` / breakdown | Branching in render | Multiple row builders ~2200+ |
| **Pacing variability ⚠️ in table** | `workout_analysis.analysis.pacing_analysis` | — | | ~2405–2421 |
| **Strength / mobility compare (Performance tab)** | `planned.computed.steps` (strength in steps) | `planned.strength_exercises` / `mobility_exercises` | If computed empty | ~441–478 |
| **Samples for HR stream in summary** | `completed.samples` | `sensor_data` samples built client-side | | `buildSamples` ~70–118 |
| **Planned session object** | `hydratedPlanned \|\| linkedPlanned` from DB / materialization | `workout` for planned-only | | `UnifiedWorkoutView` |
| **completed object for Performance** | `updatedWorkoutData \|\| hydratedCompleted \|\| workout` | | | May lag behind `workout-detail` merge for `workout_analysis` until invalidate |
| **RPE / notes (Details)** | `workout_metadata`, top-level `rpe` via `getSessionRPE` | | | `CompletedTab`, metadata utils |
| **Readouts grid (Details)** | `workoutData` scalars, `metrics`, `computed.overall`, `useWorkoutData` | | | Derived pacing/power in hook |
| **Weather (Details)** | `workoutData` / `metrics` temperature fields | | | `CompletedTab` ~740+ |
| **Elevation / VAM / GAP (Details)** | `elevation_gain`, distance, duration on row | | | **Client-side GAP-style math** in `CompletedTab` ~1251+ |
| **Maps / charts (Details)** | `gps_track`, `computed.analysis.series`, sensor series | DB poll for `computed` | | `CompletedTab` + charts |
| **Strength deviation prompt (Details)** | `session_detail_v1` volume/weight deviation | Client: planned vs best set weight +5% | `session_detail_v1` null | `StrengthCompletedView.tsx` ~205–224 |
| **Strength totals / table** | `workoutData` exercises, `completedForDay` from `AppContext.workouts` | | | Client volume math ~73–200 |

---

## 3. Loading / error / stale behavior

| Source | Loading UI | Error / null | Stale / mixed state |
|--------|------------|--------------|---------------------|
| **`useWorkoutDetail` / `workout-detail`** | `loading` is true while query pending; **not shown on Performance tab** | If no session, query disabled; merge errors surface via React Query | **`fromContext` optimization:** if context workout already has GPS or sensor array, **the edge function is never called** and `session_detail_v1` is **always `null`** (`useWorkoutDetail.ts` ~35–48, ~151–154). Same workout can show **full map in list** but **no server contract** on Performance. |
| **`session_detail_v1` prop** | No dedicated spinner in `MobileSummary` | Falls back to `workout_analysis` / `session_state_v1` for many fields | **Yes:** chips can come from sd while narrative falls back to `session_state_v1` if `narrative_text` empty; or opposite if partial sd. |
| **`updatedWorkoutData` (post-attach refresh)** | — | | Refreshes `workouts` row from DB; **does not** by itself refetch `workout-detail`. `planned_id` can update before `session_detail_v1` catches up → **mixed planned chip vs old analysis** until invalidate/refetch. |
| **Recompute button (`MobileSummary`)** | `recomputing` disables button | `recomputeError` text | Invokes `compute-workout-analysis` + discipline `analyze-*`, then `select` workout row — **does not** call `workout-detail`; **session_detail_v1 from parent may stay stale** until separate refetch. |
| **Server `stale` flag** | | | **`workout-detail` response does not expose a dedicated `stale: true` in the audited code** (ADR target not fully wired in client). |

---

## 4. Hook / query inventory

| Hook / call | What it calls | Merge / derive on client? |
|-------------|---------------|-------------------------|
| **`useWorkoutDetail`** | `supabase.functions.invoke('workout-detail', { body: { id, include_gps, include_sensors, … } })` | Merges returned `workout` over context row; extracts `session_detail_v1`. **Skips entirely** when `fromContext` hydrated. |
| **`useWeekUnified`** | Unified week API (planned + completed for date range) | Used for planned workout shape / tabs |
| **UnifiedWorkoutView refresh listener** | `supabase.from('workouts').select('*, workout_analysis, …').eq('id', …)` | JSON parse `workout_analysis` / `computed` |
| **Linked planned fetch** | `supabase.from('planned_workouts').select('*').eq('id', planned_id)` | — |
| **MobileSummary `recomputeAnalysis`** | `compute-workout-analysis` → `analyze-{running,cycling,strength,swim}-workout` → `workouts.select('computed,workout_analysis,…')` | Updates local `hydratedCompleted` state |
| **CompletedTab** | Multiple `workouts.select` for `computed` / series; gear tables; optional invocations | `useWorkoutData` derives display metrics from `computed` |
| **`useWorkoutData`** | N/A (pure transform) | Derives km pace, max speed, reads `computed.analysis.*` |

---

## 5. Discipline forks

| Discipline | Performance (`MobileSummary`) | Details (`CompletedTab` / other) |
|------------|--------------------------------|-----------------------------------|
| **Run / endurance** | Full interval machinery; chips prefer `session_detail_v1` then `workout_analysis` | Charts, map, HR zones, GAP-style client calc |
| **Ride** | Chip path uses sd → `performance` | Power charts, zone charts |
| **Swim (pool vs open water)** | **Open water:** chips from `workout_analysis` only (not sd execution branch). Pool: different handling in file | Pool vs OW UI branches |
| **Strength / mobility** | `StrengthCompareTable` + planned from `computed.steps` or raw exercises | `StrengthCompletedView`: compare table + **client volume stats** + sd deviation prompt with fallback |
| **Walk** | Treated with endurance-style paths where type matches | Same `CompletedTab` branch as run-like types |

**Legacy alternate UI:** `WorkoutSummary.tsx` uses **no** `session_detail_v1`; `WorkoutDetail` still contains `WorkoutAIDisplay` over `workout_analysis` / `ai_analysis` — separate from unified mobile path.

---

## 6. Legacy tentacles (cut list for Phase 2)

Non-`session_detail_v1` sources still read on the primary Performance / Details path. Line numbers refer to current `src/` tree.

### A. `useWorkoutDetail` — skips contract when context “looks hydrated” *(PR-1 fixed, 2026-03)*

- ~~`fromContext` disabled `workout-detail` and forced `session_detail_v1` null~~ — **removed:** query always runs; `contextPreview` only seeds UI until the edge returns; merge preserves GPS/sensors when edge payload is empty.
- Re-audit this section after PR-2+ if any new short-circuits appear.

### B. `MobileSummary.tsx` — parallel contracts

- ~63–66 — `getAvgHR` from raw `completed`  
- ~70–118 — `buildSamples` from `samples` / `sensor_data` / swim lengths (client)  
- ~276–292 — `getWeeklyIntentLabel` from **`workout_analysis.fact_packet_v1`**  
- ~301–303 — `completed.computed.planned_steps_light`  
- ~379–437 — **`recomputeAnalysis`** → compute + analyze + **`workouts` select** (not `workout-detail`)  
- ~441–478 — strength planned extraction from **`computed.steps`** / direct JSON fields  
- ~583–620 — **`session_state_v1`**, **`computed.intervals`**, **`detailed_analysis.interval_breakdown`**, **`fact_packet_v1`** for step display  
- ~665–807 — `computed_detail_steps`, **`fact_packet_v1`** fallback for “show details”  
- ~960–988 — comments referencing **`workout_analysis.detailed_analysis.interval_breakdown`**  
- ~1544–1608 — chips: **`workout_analysis.performance`**, **`session_state_v1`**, **`granular_analysis`**, **`adherence_summary`**, **`fact_packet_v1`** for plan-modified  
- ~1608 — **`adherence_summary`** (separate from sd)  
- ~1730–1735 — **swim chips: `performance` / `session_state` only**  
- ~1794–1806 — ride: fall back to **`workout_analysis.performance`**  
- ~2058+ — **`fact_packet_v1`** in table / narrative paths  
- ~2405–2421 — **`workout_analysis.analysis.pacing_analysis`** (⚠️ indicators)  
- ~2456–2505 — narrative: **`session_state_v1`**, **`adherence_summary`**, **`fact_packet_v1`**, **`session_state.details.*`**

### C. `UnifiedWorkoutView.tsx`

- ~98–139 — direct **`workouts`** refresh (parallel to `workout-detail` payload)  
- ~205–220 — direct **`planned_workouts`** fetch  
- ~250+ — materialization / **`compute-workout-summary`** / analysis triggers (summary tab effects)  
- ~1246–1251 — passes **`session_detail_v1`** but **no loading** to `MobileSummary`

### D. `StrengthCompletedView.tsx`

- ~73–109 — **`getExerciseComparison`** client volume vs planned  
- ~182–200 — **`workoutStats`** client aggregation  
- ~205–224 — deviation prompt fallback when **`session_detail_v1` null**  
- ~246–252 — **`workload_actual` / `workload_planned`** from row  

### E. `CompletedTab.tsx` (Details tab)

- ~115 — **`useWorkoutData(hydrated||workoutData)`** — display derivations  
- ~20 — **`computeDistanceKm`** import (derivation util)  
- ~291+ — **`computed.analysis.series`** polling / merge  
- ~740+ — temperature from **raw workout/metrics**  
- ~1202+ — **elevation / VAM**  
- ~1251+ — **client GAP-style adjustment** from elevation + distance + duration  

### F. `WorkoutSummary.tsx` / `WorkoutDetail.tsx` (secondary entry)

- `WorkoutSummary.tsx` ~225–239 — **`WorkoutDetail`** + **`CompletedTab`** without `session_detail_v1`  
- `WorkoutDetail.tsx` ~229–232 — **`WorkoutAIDisplay`** → **`ai_analysis` / `workout_analysis`**

---

## Summary (for Phase 2)

1. **Single biggest leak:** `useWorkoutDetail`’s **`fromContext` short-circuit** drops **`session_detail_v1` entirely** while the UI still renders Performance from **`workout_analysis` / `computed`**.  
2. **Second leak:** `MobileSummary` implements **many fallbacks** (`session_state_v1`, `performance`, `fact_packet_v1`, `adherence_summary`, unplanned `interval_breakdown`) — correct per ADR means **extend sd or show loading**, not fall back.  
3. **Third leak:** **Swim open-water** chip path **ignores `session_detail_v1.execution`** today.  
4. **Recompute** path refreshes **DB analysis** but **not** necessarily the **`workout-detail`** contract the parent uses for `session_detail_v1`.  
5. **Details tab** remains a **separate pipeline** (`computed`, client GAP, raw weather) — out of scope for “Performance-only” Phase 2 but part of full “dumb client” vision.

---

**Phase 2 execution:** PR-sized tasks mapped to this audit → [phase-2-performance-pr-checklist.md](./phase-2-performance-pr-checklist.md)

---

*Generated as Phase 1 audit. Update this file when Phase 2 removes fallbacks or changes hooks.*
