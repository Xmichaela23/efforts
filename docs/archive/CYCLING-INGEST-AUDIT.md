# Cycling Ingest + Performance + Arc + FTP Audit

Date: 2026-05-13. Audit of the cycling data flow end-to-end:

1. **Ingest pipeline** — Garmin/Strava/manual → persisted state.
2. **Performance screen** — what cycling renders for the athlete (planned vs unplanned).
3. **Arc integration** — how cycling state flows into long-term context.
4. **FTP determination** — every site that computes/stores/reads FTP.
5. **Cross-cutting:** single-source-of-truth + legacy-code check.

**Methodology:** static code audit. No live data inspection. Four parallel Explore agents traced one surface each; this doc consolidates findings + cohesive-flow verdict. No fixes proposed (read-only audit).

---

## TL;DR — Cohesive flow verdict

The user's question was: *"is there a cohesive flow of data and interpretation that has a single source of truth and doesn't bump up against legacy code?"*

**Answer: partially yes, partially no.**

| Surface | Verdict | Why |
|---|---|---|
| Per-workout cycling metrics (NP, IF, EF) | ✓ Coherent, single source | Each metric computed once in a specific layer; downstream layers propagate, never recompute. |
| FTP determination | ✓ Closed (2026-05-13) | Multi-source drift risk eliminated. `resolveCurrentFtp()` (`src/lib/resolve-current-ftp.ts`) is the single source of truth across 8 consumers; precedence rule enforced (`learned ≥medium → manual → learned-low → null`). Dead fallback path removed. Shipped in commit `76d94120`. |
| Performance screen rendering | ⚠ Thin + decoupled | Reads `workouts` table directly (flagged anti-pattern), shows only FTP + longest ride. Skips the entire `workout_facts` / `workout_analysis` analysis layer. |
| Arc cycling exposure | ⚠ Thinner than running | Cycling gets two snapshot fields (avg power, efficiency factor); running gets pace + duration + interval adherence + efficiency index. No FTP-trend or volume-trend longitudinal signal. |
| Plan-generation FTP reads | ⚠ Partially mitigated (2026-05-13) | `materialize-plan` now reads via `resolveCurrentFtp()` (commit `76d94120`) — plan baking uses the canonical learned-or-manual value instead of manual-only. **Mid-plan drift is NOT yet fully closed** because `bike.ftp_w` snapshot pin is still in progress (athlete-snapshot.ts:163 still returns null). Until snapshot pin lands, baselines change → plan still re-reads live FTP at next materialization. |
| TSS for cycling | ⚠ Not computed | No layer in the cycling pipeline computes TSS. Workload calculations use other proxies (TRIMP, IF). May be intentional but worth confirming. |
| Legacy code surfaces | ✓ Closed (2026-05-13) | Dead `learned_fitness.cycling.ftp` fallback at `compute-facts:1115` removed. Routing dead synonyms (`'cycling' \| 'bike'`) stripped from dispatch sites in `ingest-activity`, `recompute-workout`, `bulk-reanalyze-workouts` (preserved on the query-side `getWorkoutTypesForFilter` per defensive intent). `send-workout-to-garmin` broken column query (`select('units, ftp')` referenced a non-existent top-level column) fixed — Garmin power targets now actually send. Shipped in commit `76d94120`. FIT-file/Garmin device FTP previews still extracted but never persisted (separate item — not yet wired). |

**Headline:** the **per-workout pipeline is clean** (NP/IF computed once, no recomputation). The **FTP layer is fragmented** (manual vs learned, no precedence rule, dead code in fallbacks, plan-time freeze without re-materialization). The **Performance screen is decoupled** from the analysis pipeline it sits on top of. **Cycling is consistently a thinner slice than running** across snapshot, longitudinal signals, coach prompts, and athlete-facing displays.

---

## 1. Ingest pipeline

Five-layer flow: provider → workouts.computed → workout_facts.ride_facts → workouts.workout_analysis → athlete_snapshot.

### Entry points (all converge cleanly)

| Source | File | Normalized to |
|---|---|---|
| Strava webhook | `ingest-activity/index.ts:193-230` (`mapStravaToWorkout`) | `type='ride'` |
| Garmin webhook | `ingest-activity/index.ts:797-826` (`mapGarminToWorkout`) | `type='ride'` |
| FIT file upload | `FitFileImporter.tsx:115-131` (`mapFitSportToAppType`) | `type='ride'` |

All three providers normalize to `type='ride'` (not `bike` or `cycling`). First-state value is consistent.

### Routing fan-out (consistent across 3 registration sites)

Per CLAUDE.md, any new cache or downstream system MUST register at all three routing sites or it goes stale. Cycling is consistent at all three:

- `ingest-activity/index.ts:1466-1467` — accepts `'ride' | 'cycling' | 'bike'` → `analyze-cycling-workout`
- `recompute-workout/index.ts:22` — same accept set
- `bulk-reanalyze-workouts/index.ts:44-46` — same accept set

The `cycling`/`bike` synonyms are defensive (production data is normalized to `ride` upstream), but they don't drift.

### Per-layer compute (no recomputation)

| Layer | File | Cycling-specific output | Source data |
|---|---|---|---|
| `compute-workout-summary` | (named in CLAUDE.md, `@ts-nocheck`) | `computed.overall.normalized_power` (Coggan), `computed.overall.avg_power_w`, `computed.analysis.power_curve`, `computed.analysis.zones.hr` | Sample data from device; written for ALL ride rows (null if no power samples) |
| `compute-facts` | `compute-facts/index.ts:1110-1169` (`buildRideFacts`) | `workout_facts.ride_facts.{avg_power, normalized_power, intensity_factor, efficiency_factor, time_in_zone, hr_drift_pct, power_curve}` | Reads from `workouts.computed`; computes IF = NP/FTP, EF = NP/avg_HR |
| `analyze-cycling-workout` | `_shared/cycling-v1/build.ts:68-200` | `workout_analysis.fact_packet_v1.facts.{normalized_power, intensity_factor, classified_type, ftp_bins}` + `flags_v1` + `ai_summary` + `session_state_v1` + `granular_analysis` + `adherence_analysis` | Reads from computed + facts; no recomputation of NP or IF |
| `compute-snapshot` | `compute-snapshot/index.ts:135-147` | `athlete_snapshot.{ride_avg_power, ride_efficiency_factor, workload_by_discipline.ride, intensity_distribution}` | Aggregates from `workout_facts.ride_facts` |

**Single source of truth (per-workout):** ✓ NP computed once in `compute-workout-summary`; IF computed once in `compute-facts`. Downstream layers propagate, never recompute. Same formula not duplicated across files.

**Notable absence: TSS.** No layer computes Training Stress Score for cycling. `IF² × duration_hours × 100` is missing. `calculate-workload` uses TRIMP (HR-based) for workload. May be intentional (the codebase's workload abstraction is sport-agnostic via `workload_by_discipline`), but it's a deviation from the standard cycling-coach mental model.

### Legacy / dead code

- **`@ts-nocheck` on `ingest-activity` and `compute-workout-summary`.** Per CLAUDE.md, both are critical paths with type errors only surfacing at runtime. Defensive but worth flagging as a fragility surface.
- **Type synonyms (`bike`/`cycling`)** in routing are defensive, not dead — won't fire in production but won't break either.
- No orphaned `analyze-bike-workout` or unhyphenated variants.

---

## 2. Performance screen (`AthleticRecordPage.tsx`)

### What it actually shows for cycling

**Two metrics. That's it:**

1. **FTP (best)** — `AthleticRecordPage.tsx:288, 114-118`. Sources from `performance_numbers.ftp` (preferred) or `learned_fitness.ride_ftp_estimated.value` (fallback). See §4 for the dual-source issue.
2. **Longest ride duration** — line 125, derived by iterating completed rides + calling `actualFinishSecondsPreferElapsed()`.

**What's NOT rendered:** NP, IF, TSS, time-in-zone, intervals, planned-vs-actual adherence, weekly volume trend, recent-ride summary. The entire output of `compute-facts.ride_facts`, `workout_analysis.fact_packet_v1`, and the snapshot's cycling fields is **invisible to the athlete** on this screen.

### Direct table query (anti-pattern flagged in CLAUDE.md)

`AthleticRecordPage.tsx:102-106` directly queries:
```ts
supabase.from('workouts').select('id, date, type, workout_status, ...').eq('type', 'ride')
```

Reads `computed` field but ignores `workout_analysis` and skips `workout_facts` entirely. CLAUDE.md flags this file at line 102 as a known exception to "smart server, dumb client" — it's not dead code, just intentional anti-pattern.

### No planned-vs-completed reconciliation

The screen has no integration with `usePlannedWorkoutLink.ts`. When a cycling workout is both planned and completed, the reconciliation lives server-side in `analyze-cycling-workout` (`session_state_v1.match` and `adherence` fields), but `AthleticRecordPage` never calls `workout-detail` / `session_detail_v1` to surface it.

### No power-vs-HR fallback

Because the screen renders no power metrics beyond FTP, there's nothing to fall back from. The architecture handles power-vs-HR fallback at lower layers (compute-workout-summary leaves NP null when no power samples, compute-facts conditionally computes IF and EF), but the Performance screen never benefits.

### Verdict for §5 of the user's question (data-shape divergence pattern)

The "Run — Tempo" vs "Run Intervals 4×1000m" pattern from earlier sessions does **not** apply to cycling on the Performance screen because the screen renders no titles. It's a stats-only display. The label-divergence risk is in `AllPlansInterface.tsx` and `PlannedWorkoutSummary.tsx` (filed in `docs/ENGINE-STATE.md` "Known broken").

### Single source of truth check on this screen

| Metric | Origin | Risk |
|---|---|---|
| FTP | Dual-sourced (manual primary, learned fallback) | **Medium** — silently picks one if both present (line 298) |
| Longest ride duration | `workouts[type=ride].computed.overall.duration_s_elapsed` | Low — single source |
| Last updated timestamp | `user_baselines.updated_at` | Low |

Only one real risk on this surface; FTP is the recurring footgun (see §4).

---

## 3. Arc integration

### What `arc-context.ts` exposes for cycling

| Field | Line | Type | Source |
|---|---|---|---|
| `learned_fitness.ride_ftp_estimated` | 153 | `{value, confidence, sample_count, source}` | `learn-fitness-profile/index.ts:265` |
| `performance_numbers.ftp` | 166 | number (watts) | Wizard manual entry |
| `latest_snapshot.ride_avg_power` | 184 (via snapshot) | number (watts, weekly) | `compute-snapshot:511` |
| `latest_snapshot.ride_efficiency_factor` | 184 (via snapshot) | number (NP/HR) | `compute-snapshot:512` |
| `latest_snapshot.workload_by_discipline.ride` | 184 (via snapshot) | TSS-equivalent | `compute-snapshot:107` |
| `latest_snapshot.intensity_distribution` | 184 (via snapshot) | zone-seconds breakdown | `compute-snapshot:142-167` |
| `gear.bikes` | 194 | array of bike entries | `user_baselines.gear` |
| `active_goals[].courses[].bike` | 41-45 | distance + GPX context | Race course data |

**Notable absences vs running:**
- No `ride_long_ride_duration` (running has `run_long_run_duration`)
- No weekly NP aggregate (only avg power)
- No planned-vs-actual adherence (running has `run_interval_adherence`)
- No FTP confidence warning surfaced at the top level (running has `_unit_note`)
- No FTP-trend longitudinal signal (only `ride_efficiency_downtrend` + `hr_drift_up`)
- No bike-volume trend (running has `run_easy_hr_trend`)

Cycling is **a consistently thinner slice** than running across the snapshot + Arc layers. Strength gets the top-4-lifts + volume-trend treatment; cycling gets two rolling metrics.

### `learned_fitness.ride_ftp_estimated` derivation

Computed by `learn-fitness-profile/index.ts:838-971` (`analyzeRides`) with a 4-tier hierarchy:

1. **Best 20-min power** × 0.95 (priority 1; high confidence ≥3 efforts, medium if 2)
2. **Best NP from hard efforts** (HR>80% max OR power>P75) × 0.95 (priority 2)
3. **Best avg power from hard efforts** × 1.05 × 0.95 (priority 3)
4. **Best overall NP** × 0.95 (fallback, low confidence)

Returns `null` if <3 rides total. Confidence-tagged: `low | medium | high`. Multiple downstream consumers gate on confidence threshold.

### Plan-generation cycling input

**Critical drift risk:** `generate-combined-plan/index.ts` does NOT route through Arc. It reads `user_baselines.performance_numbers.ftp` **live at plan-build time**.

`athlete-snapshot.ts:68` defines a `bike: { ftp_w?: number } | null` field intended to pin FTP to the plan, but **currently returns `null`** (line 163 — explicitly deferred).

**Consequence:** if athlete updates FTP mid-plan (manually OR via auto-learned re-estimation), planned-workout descriptions still reference the old value while delivered absolute-watts targets (post `materialize-plan` + `send-workout-to-garmin`) use whatever is current at materialization time. Different planned workouts in the same plan can use different FTP values depending on when they were materialized.

**Running and strength have snapshot immutability** for their respective baselines. Cycling does not.

### Coach surface

Coach prompts include manual `performance_numbers.ftp` (line 3943: `Bike FTP: XXX W`), discipline routing for `bike|ride|cycling` types (lines 1881, 2289, 4539), and brick-leg acknowledgment. **Coach does NOT receive:**
- Learned FTP confidence
- Time-in-power-zones (Z1-Z5)
- Longitudinal efficiency trend
- Planned bike intent (`sweet_spot`, `vo2`, etc.) from `cycling-v1`

Coach can talk about FTP but can't reason about how the athlete spent time in zones, how efficiency is trending, or whether a planned threshold ride actually hit threshold power.

---

## 4. FTP machinery — the architectural fragmentation point

### Storage layers (3 live + 1 dead + 2 dormant)

| # | Path | Type | Writer | Status |
|---|---|---|---|---|
| 1 | `user_baselines.performance_numbers.ftp` | number (watts) | Wizard via `AppContext.tsx:380` | **Live primary (manual)** |
| 2 | `user_baselines.learned_fitness.ride_ftp_estimated` | `{value, confidence, sample_count, source}` | `learn-fitness-profile/index.ts:265` | **Live secondary (auto-learned)** |
| 3 | `plan.config.athlete_snapshot.bike.ftp_w` | number (watts) | (designed) | **Dormant — returns null at line 163** |
| 4 | `learned_fitness.cycling.ftp` | (would be number) | (none) | **DEAD — never written, but read at `compute-facts/index.ts:1115`** |
| 5 | FIT-file `functional_threshold_power` / `threshold_power` | number (watts) | `FitFileImporter.tsx:59` | Extracted, displayed in preview, **never persisted** |
| 6 | Garmin `functionalThresholdPower` | number (watts) | `GarminDataService.ts:52, 711-744` | Extracted, displayed in preview, **never persisted** |

### Consumer reads (each picks differently)

| Reader | File:line | Reads | Fallback |
|---|---|---|---|
| `compute-facts` | `compute-facts/index.ts:1115` | `perf.ftp` ?? `learned.cycling.ftp` (DEAD) | None — IF unset if missing |
| `calculate-workload` | `calculate-workload/index.ts:297-298` | `learned.ride_ftp_estimated.value` (primary) ?? `perf.ftp` (fallback) | Yes |
| `send-workout-to-garmin` | `send-workout-to-garmin/index.ts:428-472` | `perf.ftp` only | **Hardcoded 300W default** if missing |
| `race-projections` | `race-projections.ts:370` | `learned.ride_ftp_estimated` only | Age-group defaults |
| `infer-training-fitness` | `infer-training-fitness.ts:26-34` | `learned.ride_ftp_estimated` only (confidence ≥medium) | Inferred tier |
| `AthleticRecordPage` | `AthleticRecordPage.tsx:114-118, 298` | `perf.ftp` (primary) ?? `learned.ride_ftp_estimated` (fallback) | UI shows whichever |
| `enrichArcGoalTrainingPrefs` | `enrichArcGoalTrainingPrefs.ts:11-14` | `learned.ride_ftp_estimated` | Falls back to run limiter |
| `materialize-plan` | `materialize-plan/index.ts:2290-2317` | `perf.ftp` (used for `%FTP` → watts expansion) | Critical — frozen at materialization |

### Single-source-of-truth violations enumerated

1. **No enforced precedence rule.** Different consumers pick differently:
   - `calculate-workload` prefers learned, falls back to manual.
   - `AthleticRecordPage` prefers manual, falls back to learned.
   - `compute-facts` prefers manual, falls back to dead path (effectively manual-only).
   - `materialize-plan` and `send-workout-to-garmin` use manual only (latter with hardcoded fallback).
   - `race-projections`, `infer-training-fitness`, `enrichArcGoalTrainingPrefs` use learned only.
   
   Result: athlete's "current FTP" can be a different number depending on which code path looks. If manual=250W and learned=247W, calculate-workload uses 247W, AthleticRecordPage shows 250W, materialize-plan bakes 250W into ride targets, infer-training-fitness scores fitness from 247W.

2. **Dead fallback path.** `compute-facts:1115` reads `learned_fitness.cycling.ftp` which no writer populates. Schema migration mid-flight (the live field is `learned_fitness.ride_ftp_estimated`); cleanup never landed.

3. **Materialized plans freeze FTP at creation time.** `materialize-plan` bakes `%FTP` targets to absolute watts using the manual FTP at materialization. Athlete updates FTP later → plan is NOT re-materialized; old wattages stick. No staleness flag, no re-bake trigger.

4. **Device-imported FTP is purely advisory.** FIT files and Garmin previews extract threshold power and surface it in the UI, but never write to `user_baselines`. Athletes who upload a FIT file with a recently-set Garmin FTP will see it displayed but it doesn't affect any plan generation or workout analysis.

### Units / definitions footgun

- All FTP values consistently in **watts**. No `_unit_note` warning to Arc prompts (running pace has one for sec/km vs sec/mi; cycling has none — even though there's no current ambiguity, the convention is missing).
- No distinction between **CP (critical power)** vs **FTP (Coggan)** vs **threshold power** anywhere. Estimation code treats 20-min × 0.95 as FTP (Coggan-style), but doesn't document that this is what it means. An LLM coach reading the value can't tell which protocol generated it.
- No sanity validation on imported values. Garmin/FIT could supply 50W or 600W and the system would accept either.

---

## 5. Cross-cutting findings

### Where the architecture is coherent

- **Per-workout pipeline.** Five layers, each with a clear write surface and clear consumers. NP computed once, IF computed once, propagated downstream. No duplicate formulas across files.
- **Routing.** Three registration sites (`ingest-activity`, `recompute-workout`, `bulk-reanalyze-workouts`) all dispatch cycling consistently. No drift.
- **Type normalization.** All providers converge to `workouts.type='ride'`. No string-shape divergence between Garmin/Strava/FIT.

### Where it bumps up against legacy code

- **`learned_fitness.cycling.ftp` dead path.** Schema migration cleanup never finished. Trivial to delete the fallback in `compute-facts:1115`.
- **FIT-file and Garmin device FTP extraction.** Code that pulls these from device data exists but doesn't write to baselines. Either complete the wiring or remove the extraction code (currently misleads — the preview suggests it'll be saved).
- **Plan-snapshot `bike.ftp_w` field.** Schema field exists but writer always returns null. Either implement the snapshot pin (matching running/strength pattern) or remove the field declaration.
- **Two `@ts-nocheck` files in the cycling pipeline** (`ingest-activity`, `compute-workout-summary`). Not legacy in the dead-code sense, but architectural debt — type errors surface at runtime only.
- **Hardcoded 300W fallback in `send-workout-to-garmin`.** A specific number for an athlete whose FTP is missing is worse than refusing to send a power target. Unclear whether this fires in production today.

### Where the user sees the gap

The **Performance screen (`AthleticRecordPage`) is the visible symptom** of the deeper issue. It renders FTP + longest ride and calls it cycling performance. The system computes:

- NP per workout
- IF per workout
- EF per workout
- Time-in-zone per workout
- Power curve per workout
- HR drift per workout
- Weekly avg power
- Weekly EF
- Weekly time-in-zone
- Ride efficiency longitudinal trend
- HR drift longitudinal trend
- Adherence per planned ride
- Classified type per ride (sweet_spot, threshold, vo2)

…and the athlete sees none of it. The mismatch between "what the engine knows" and "what the screen shows" is wide. Whether that's the right product call (keep the screen minimal) or a missed opportunity (the data is right there) is a product decision, not a wiring fix.

---

## 6. Recommended pickup order

Ordered by signal strength (single-source-of-truth violations and drift risks are blockers; surfacing decisions are deferred):

1. ✅ **DONE (2026-05-13, commit `76d94120`)** — FTP precedence rule shipped. `resolveCurrentFtp()` at `src/lib/resolve-current-ftp.ts` returns `{value, source}` with 3-tier precedence (`learned ≥medium → manual → learned-low → null`). 8 consumers migrated: `compute-facts`, `calculate-workload`, `send-workout-to-garmin` (with bug fix for the broken column query), `_shared/race-projections`, `_shared/infer-training-fitness`, `AthleticRecordPage`, `enrichArcGoalTrainingPrefs`, `materialize-plan`. 8 resolver tests cover all branches. 18 affected edge functions deployed across 2 batches.
2. 🔄 **IN PROGRESS** — `bike.ftp_w` snapshot pin in `athlete-snapshot.ts:163`. Match the running/strength pattern. Pin at plan-creation time so plan descriptions and delivered targets stay in sync even if baselines change. Bonus: re-materialization trigger if pinned FTP drifts >X% from current. Until this lands, mid-plan FTP drift is only partially mitigated (the resolver picks a single value at materialization time but doesn't freeze it for the plan's lifetime).
3. ✅ **DONE (2026-05-13, commit `76d94120`)** — Dead `learned_fitness.cycling.ftp` fallback at `compute-facts:1115` removed as part of the consumer migration in item 1. The line now calls `resolveCurrentFtp()` directly, no fallback chain.
4. **(legacy cleanup, medium risk)** Decide on FIT-file / Garmin device FTP extraction: either complete the wiring (write to learned_fitness as a high-confidence source) or remove the extraction code so the preview doesn't mislead.
5. **(architectural question)** Decide if cycling needs a TSS computation. The pipeline currently uses TRIMP and IF; explicit TSS may be worth adding for consistency with cycling-coach mental models, but it's a real product call, not a bug.
6. **(product question)** Decide what cycling data should surface on the Performance screen. The compute layer has rich output; the screen renders ~5% of it. This is not a bug — it's a deliberate scoping. Re-evaluate after closing the FTP architectural items.
7. **(symmetry gap)** Add cycling longitudinal signals matching the running treatment: weekly NP trend, bike volume vs 90d mean, FTP-progression signal. Increases coach quality + Arc richness for cycling.
8. **(footgun)** Add `_unit_note` for FTP definitions in arc-context exposure. Prevents LLM coach mis-labeling (Coggan FTP vs CP vs threshold power; watts vs W/kg).

---

## 7. Test coverage gaps

What's tested today (audit-relevant subset):
- `analyze-cycling-workout` builds `fact_packet_v1`. No dedicated test file located in this audit.
- `compute-facts` ride-facts assembly. Test coverage not enumerated here.
- `learn-fitness-profile` FTP estimation hierarchy. Tests not enumerated here.

What's NOT tested:
- ~~The dual-source FTP fallback chains. No test asserts which value wins when both manual and learned are present with different values.~~ ✅ **DONE (2026-05-13, commit `76d94120`)** — `src/lib/resolve-current-ftp.test.ts` adds 8 tests covering every precedence branch: `learned ≥medium wins over manual`, `learned high wins over manual`, `learned <medium falls back to manual`, `both null returns null`, `learned-low source when no manual`, `null/undefined/empty inputs`, `invalid values (zero, negative, non-numeric)`, `only learned_fitness key present`. All passing.
- Materialized-plan FTP staleness behavior. No test asserts what happens to a plan when baselines change post-materialization.
- The dead `learned_fitness.cycling.ftp` path. Tests would catch this if they covered the fallback scenarios.

---

## 8. Open questions worth recording

If this audit produces decisions worth preserving, they should land in `docs/DECISIONS-LOG.md` (D-NNN) and `docs/OPEN-QUESTIONS.md` (Q-NNN) per the context-tracking system established this session. Candidates:

- **Q-007 candidate:** No TSS in cycling pipeline — intentional product call or a real gap?
- **Q-008 candidate:** Performance screen shows ~5% of computed cycling data — intentional minimalism or oversight?
- **Q-009 candidate:** Dead `learned_fitness.cycling.ftp` fallback — should this be deleted or filled?
- **D-007 candidate:** FTP precedence rule (when manual + learned both present, which wins?)
- **D-008 candidate:** Materialization-time FTP freeze — accept the staleness or implement re-materialization triggers?

These are recommendations for the next session to formalize; not entered now per the audit-only scope.
