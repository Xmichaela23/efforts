# Decisions Log

Append-only record of architecture / design decisions worth preserving across sessions. Each entry captures **why** the call was made, what was rejected, and what tradeoff is being lived with — so the next session doesn't re-debate (or worse, undo) settled choices.

Numbered D-001, D-002, … in order of recording. Entries are not removed; if a decision is reversed, add a new entry that supersedes the old one and reference it.

---

## D-001 — Option B coefficient = 0.75hr

- **Date:** 2026-05-13 (commit cf68cf43)
- **Decision:** Strength wall-clock deduction in `session-frequency-defaults.ts` uses **0.75 hr/session** as the canonical strength workout time. Endurance hours = `declared - strength_count × 0.75`.
- **Alternatives considered:**
  - 0.5hr (lower bound; ignores warmup + accessories)
  - 1.0hr (upper bound; over-aggressive deduction would re-tier athletes who actually have headroom)
  - Pull from per-session emit data dynamically (no single number; matrix lookup needs a constant)
- **Why this one:** Plan #59 emit shows actual strength sessions at 35-50min (Build Lower 48m, Build Upper 45m, M+P Lower 50m, M+P Upper 35m). 0.75hr is the conservative midpoint. Slight overcautious favors fit-in-budget — better to under-promise tier than over-promise.
- **Tradeoff accepted:** athletes whose strength sessions actually run shorter (e.g., taper-week 25-30min) get a small under-shoot in endurance allocation. Bounded; doesn't compound; matrix is hour-tier-coarse anyway. Excludes commute time by convention (matrix budget is workout time, not door-to-door).
- **Scales by count:** future 3× tiers deduct 2.25hr without code change to the tier-lookup arithmetic.

---

## D-002 — Soft -1 signal vs hard clamp for `swim_experience`

- **Date:** 2026-05-13 (commit 0fd17ad9)
- **Decision:** Wizard `swim_experience='learning'` applies a soft `score -= 1` signal in `inferTrainingFitnessLevel`, mirroring the existing `training_background_beginner_hint` pattern at line ~168. NOT a hard clamp to `level = 'beginner'`.
- **Alternatives considered:**
  - Hard clamp (`if (swimExp === 'learning') level = 'beginner'`) — original Explore agent recommendation.
  - Separate `swim_fitness` tier threaded through swim consumers, leaving global `training_fitness` untouched.
- **Why this one:**
  - Hard clamp would override strong CTL/FTP/race-history signals — a masters athlete with high CTL who declares "learning swim" would get beginner-tier swim volume regardless. Excessive.
  - Hard clamp would also propagate via `create-goal-and-materialize-plan/index.ts:1494` (`currentCTL = { beginner: 20, ... }[level]`) when `recentLoads.length === 0`, which affects non-swim downstream consumers via the CTL fallback.
  - Separate `swim_fitness` tier is architecturally cleaner but multi-file (would need to thread through every swim consumer). Out of scope for the Phase 3 ~30-line budget.
  - Soft signal matches an existing precedent in the same function — symmetric, bounded, predictable.
- **Tradeoff accepted:** an athlete who declares "learning" and has high CTL will land at intermediate, not beginner — for swim purposes. This is by design; see Q-006. The protective effect of the cap kicks in for the population it should protect (borderline athletes, low-history athletes) without over-clamping strong-elsewhere athletes.

---

## D-003 — Render-time AM/PM ordering, not persisted as `workout_metadata` column

- **Date:** 2026-05-13 (commits ba77872b, e41e7781, 3770ad41)
- **Decision:** Lower + endurance pair ordering is computed at render time from `(sessions, athlete's strength_ordering_preference)` via `computeDayTimings()` in `_shared/pairing-timing.ts`. Not stored on the workout row.
- **Alternatives considered:**
  - Persist `timing: 'AM' | 'PM'` on every `planned_workout` row at materialize time. The earlier broken pipeline did this; the column was never properly created on planned_workouts so the persistence quietly failed end-to-end.
  - Mutate `w.timing` at render time and re-sort.
- **Why this one:**
  - The earlier "mutate w.timing" approach didn't take in the deployed bundle for the markdown export — TodaysEffort (which read `timings.get(w)` directly) worked while the export still sorted by discipline rank. Cause is unconfirmed but a closure-based read bypasses any object-freeze / proxy stripping that could explain the divergence.
  - Render-time computation has a single source of truth (the helper) shared across every consumer.
  - No schema migration needed; the field that was supposed to hold this state never properly existed and trying to add it correctly would block on RLS + migration coordination.
- **Tradeoff accepted:** every consumer must call the helper. There's no "just read the column" shortcut. The consolidation in D-004 + D-005 pays this back by giving consumers a single function to call.

---

## D-004 — `useStrengthOrderingPreference` hook scoped to orderingPref fetch only

- **Date:** 2026-05-13 (commit e41e7781)
- **Decision:** The new shared hook in `src/lib/use-strength-ordering-preference.ts` is purpose-built for resolving `strength_ordering_preference` per planId. Not generalized into a "useTrainingPref(field)" generic.
- **Alternatives considered:**
  - Generic `useTrainingPref<T>(planId, field)` hook that any wizard field could read through.
  - Inline fetch in each consumer (the prior broken state — caused the original dep-churn bug).
- **Why this one:**
  - Generic hook would force premature abstraction. Each training_prefs field has its own fetch shape (some need joins through goals, others through plans, others read from cached AthleteState). One-size-fits-all hides the real divergence.
  - Today there are exactly two callers: TodaysEffort + AllPlansInterface (markdown export AND weekly view). They share fetch semantics. A purpose-built hook is right-sized.
  - When the next training_prefs field needs the same architecture, copy-paste the hook structure (~50 lines) for that field rather than retro-fit a generic. The hook file's docstring documents the pattern.
- **Tradeoff accepted:** if 5+ training_prefs fields end up needing this pattern, the duplication will warrant abstraction. Today's count is 1; abstracting would be premature.

---

## D-005 — Helper extraction over inline closure copy

- **Date:** 2026-05-13 (commit 3770ad41)
- **Decision:** When the `AllPlansInterface.tsx` weekly-view fix needed the same sort closure that was already inline in the markdown export 600 lines above, **extract** to a module-level helper `orderDayWorkoutsByTimingThenDiscipline(workouts, orderingPref)` and replace both call sites — instead of copy-paste-inlining the second closure.
- **Alternatives considered:**
  - Inline-copy the 25-line sort closure into the weekly view. Smallest diff. Two copies in same file.
- **Why this one:**
  - Same single-source-of-truth principle behind the hook consolidation in D-004. Two copies of identical sort logic in one file is the same fragmentation pattern at smaller scale.
  - The "don't touch working markdown export code" argument doesn't hold — the export is on the verification path anyway. Refactoring code you immediately re-verify is the safest refactor possible.
  - Future sort-rule changes (next phase, new discipline tiebreaker) need one edit instead of two — and the file already has two known-divergent display paths (D-002 / "Run — Tempo" issue), so structural cohesion matters.
- **Tradeoff accepted:** ~25 extra lines of refactor diff in the consolidation commit. Small price.

---

## D-006 — §6.1 mandates AM/PM ordering only for run+lower pairings

- **Date:** 2026-05-13 (after Monday May 18 swim+upper divergence diagnosis)
- **Decision:** `computeDayTimings()` returns distinct AM/PM ranks **only** for run+lower pairings (the interference asymmetry vector per Wilson 2012). Other same-day stacks — swim+upper, swim+lower, upper+bike — fall through to the discipline-rank tiebreaker.
- **Alternatives considered:**
  - Extend AM/PM ordering to all same-day pairs that include strength (swim+upper, swim+lower, etc.).
  - Add a "training-priority preference" question to the wizard that sets ordering for all stacks.
- **Why this one:**
  - The protocol's evidence base for ordering is the eccentric-impact concurrent-training interference identified in Wilson 2012 (ES≈0.94 for run, ES≈0.32 for cycling). Swim has near-zero overlap with the upper-body strength musculature; the literature doesn't establish meaningful interference between them.
  - Adding cosmetic ordering for protocol-irrelevant pairs would (a) require collecting more wizard input the athlete shouldn't need to supply, (b) make the engine emit ordering metadata it can't justify on training-science grounds.
  - The diagnosed cosmetic ("swim renders above upper for strength_first hybrid on Monday") is honest insertion-order rendering with discipline-rank fallback (swim=0, strength=3). Documented as cosmetic, not protocol-violating.
- **Tradeoff accepted:** strength_first hybrid athletes will occasionally see endurance disciplines render above strength on stacked days that aren't run+lower. Cosmetic. Logged as Q-001.

---

## D-009 — Cycling easy power baseline definition

- **Date:** 2026-05-14
- **Decision:** Cycling easy-power baseline is derived from FTP using the **lower half of Coggan Zone 2 (56-65% of FTP)**. No separate estimation pipeline; computed directly from `resolveCurrentFtp()` output.
- **Alternatives considered:**
  - Net-new estimation tier in `learn-fitness-profile/analyzeRides` that infers easy-power from observed rides at easy HR (mirrors how running's `run_easy_pace_at_hr` is derived from observed easy-pace samples).
  - Use full Coggan Zone 2 (56-75%) as the easy band.
  - Use a single percentage anchor (e.g., 65% of FTP).
- **Why this one:**
  - **Industry standard.** Coggan / TrainingPeaks / TrainerRoad all anchor cycling zones to FTP. Athletes already understand "Z2 power" in terms of % FTP; no new mental model required.
  - **Lower half of Zone 2 specifically.** Keeps athletes safely below LT1 (San Millán threshold), preserving the aerobic-only training stimulus that makes Z2 work. Upper Z2 (66-75%) creeps into "tempo gray zone" for many athletes; using only the lower half is more conservative and matches the "all-day pace" intent.
  - **No new estimation pipeline.** Mirrors the FTP precedence resolver pattern (D-007 territory): one canonical resolver, derived value, no parallel infrastructure. Avoids the design risk that would come with inferring easy-power from observed HR-gated samples (sample-count thresholds, HR-zone calibration, confidence tiers — all unanswered questions in cycling-power data the way they're answered in running-pace data).
- **Tradeoff accepted:**
  - Athletes whose actual aerobic threshold doesn't sit at 56-65% of their FTP get a slightly miscalibrated easy band (e.g., a fat-adapted aerobic specialist may handle 70% FTP at zone-2 RPE; a power-oriented athlete may need 50% to truly stay aerobic). Acceptable: the FTP-derived band is a defensible default, and the engine can revisit per-athlete personalization via lactate-test data later if it ever lands.
  - Reclassifies Tier 2 item 5 in `docs/RUNNING-CYCLING-DELTA.md` from net-new (N) to direct port (D) — same precedence/derived-value pattern as the existing FTP resolver. Implementation becomes ~1 helper function returning `{lower: ftp * 0.56, upper: ftp * 0.65}` plus snapshot wiring; no new estimation pipeline.

---

## D-010 — Cycling cross-workout query semantics (Tier 3 item 10)

- **Date:** 2026-05-14
- **Decision:** Cycling cross-workout queries (running's `_shared/fact-packet/` equivalent) use **power-curve PRs + classified-type-matched "vs similar" + W/kg-vs-age-group-norms limiter** — anchoring to data the cycling pipeline already computes rather than building parallel infrastructure.

  Specifically:
  1. **Achievements:** Power-curve PRs from existing `computed.power_curve` field. Three durations: best 20-min (FTP proxy), best 5-min (VO2max proxy), best 1-min (neuromuscular). 90-day rolling window for "recent PR"; all-time for "personal best"; surface both.
  2. **`vs_similar_v1`:** Match this workout against prior workouts on `classified_type` (sweet_spot / threshold / vo2 / etc.) + duration within ±20%. Compare against the last 3 matching workouts. Cycling-native; uses the richer cycling classified_type taxonomy that already exists.
  3. **Limiter (triathletes):** W/kg ratio vs age-group norms by race distance. Low W/kg relative to run-pace-equivalent → bike is the limiter.
  4. **Limiter (non-triathlon cyclists):** Power trend vs 90-day mean instead of W/kg-vs-norms.

- **Alternatives considered:**
  - **Segment climb PRs.** Rejected — Strava already does this best; reproducing it is wasted effort.
  - **VAM (vertical ascent meters/hour).** Rejected — too niche; useful for climbing specialists but not actionable for the typical triathlete.
  - **Pace + distance proximity for vs-similar (running's approach).** Rejected — doesn't translate cleanly to cycling. Cycling speed varies wildly with terrain/wind/draft; intensity profile is the cleaner cycling-native signal.
  - **Single all-time PR window.** Rejected — recent (90d) PR is more actionable for current-form context; all-time is for season highlights. Cheap to surface both.

- **Why this one:**
  - **All four anchor to existing data.** `power_curve` is already populated per ride by `compute-workout-analysis`; `classified_type` is already populated by `_shared/cycling-v1/build.ts` (with a richer taxonomy than running). No new estimation pipeline, no new tables.
  - **Triathlon-specific limiter via W/kg-vs-norms is concretely actionable.** Tells the athlete "your bike is below age-group W/kg for 70.3" — direct route to changing training.
  - **Reclassifies Tier 2 item 10 from N → D** in the delta map. Implementation becomes a port (rolling-window aggregation, comparison logic) with cycling-specific semantics rather than a design effort.

- **Tradeoff accepted:**
  - Athletes whose `classified_type` distribution skews heavily toward one bucket (e.g., always rides at endurance pace) won't get useful "vs similar" comparisons because the matching pool is shallow. Same limitation running has when an athlete only does easy runs.
  - W/kg-vs-norms requires the athlete's bodyweight. Falls back to power-only metrics when bodyweight is missing.
  - 90-day window is a heuristic that works for in-season athletes but may be wrong for athletes returning from injury (recent best is well below all-time best). Showing both PRs surfaces the gap honestly.
  - Power-curve PRs are computed from indoor + outdoor rides indistinguishably. A peak 20-min indoor on a smart-trainer at constant resistance will read higher than the same effort outdoors with terrain variation. Acceptable for now; could add an indoor/outdoor flag later if it confuses athletes.

---

## D-011 — Cycling ride-classifier VI gate (+ `'climbing'` type)

- **Date:** 2026-05-16
- **Decision:** Added `'climbing'` to `CyclingIntentV1`. `fallbackClassifyIntent` (`_shared/cycling-v1/build.ts`) now runs a VI gate **before** the IF-based branches: `VI ≥ 1.10 AND IF ≥ 0.85` → `'climbing'` if elevation density ≥ 40 ft/mi, else `'tempo'`. Structured rides (VI < 1.10) keep the existing IF logic. Plan-linked rides still use `plan_intent`.
- **Why:** On a high-variability terrain ride NP ≫ avg power, so IF (= NP/FTP) is inflated by climbs/surges and is **not** a valid structured-intensity proxy — terrain rides were being mislabeled `threshold`/`vo2`. VI is the discriminator (steady threshold ≈ 1.0–1.05).
- **IF floor 0.85 (not the spec's 0.88):** product-resolved via question — 0.88 was logically irreconcilable with the spec's own acceptance case "VI 1.2, IF 0.85 → tempo". 0.85 keeps all cases consistent and still prevents over-capture of easy variable rides (they fall through to recovery/endurance).
- **VI cut 1.10 (lowered from 1.15):** the Lida/Flintridge climb (1,629 ft / 21.6 mi, IF 1.02) has VI 1.11 and stayed mislabeled `threshold` at the 1.15 cut.
- **Tradeoff accepted:** the taxonomy still lacks a true terrain/unstructured distinction beyond climbing/tempo; elevation density is sourced from `computed.analysis.climbing.climb_ascent_m` (grade≥3% climb-segment ascent, not total gain) so it under-reports on rolling terrain — directionally correct, the spec-named source.

---

## D-012 — Cycling TSS is NP-based Coggan; CTL/ATL is standard PMC

- **Date:** 2026-05-16
- **Decision:** TSS = standard Coggan NP-based formula (`(dur_s/3600)·IF²·100`), written to `computed.analysis.power.tss`. CTL/ATL/TSB = standard Performance-Management-Chart 42-day / 7-day exponential moving averages of daily TSS (`computeCtlAtl`), persisted as `workout_analysis.fitness_v1` and mirrored to `athlete_snapshot.{ctl,atl,tsb}` + `ArcContext.cycling_fitness`.
- **Why:** the doc's own Open Questions resolved it — "NP-based is sufficient for the CTL/ATL trend; precision matters less than consistency." xPower/BikeScore rejected as unnecessary precision for a trend signal.
- **Tradeoff accepted:** 90-day seed window means CTL warms up within it (trend-accurate, not absolute-accurate); acceptable for the trend use.

---

## D-013 — Cycling segment history is its own table

- **Date:** 2026-05-16
- **Decision:** `cycling_segment_history` is a dedicated table (migration `20260516_create_cycling_segment_history.sql`), not stored in `workout_analysis`. analyze-cycling-workout non-fatally upserts Strava `segment_efforts` + Garmin synthetic climbs.
- **Why:** product-confirmed when unblocking Build Order #6 — segment history is cross-workout and queried by segment over time; `workout_analysis` is per-workout and would force scatter-gather. Apply via SQL editor (migration-tracking divergence); all table access is guarded so functions deploy safely pre-migration.
- **Tradeoff accepted:** Garmin has no native segments — synthetic climbs use a coarse gain/length fingerprint (no GPS lat/lng in the series); precise cross-ride Garmin-climb identity deferred.

---

## D-014 — Temperature surfaced via `session_detail_v1` contract extension

- **Date:** 2026-05-16
- **Decision:** Added `weather: { temperature_f } | null` to the `session_detail_v1` contract; workout-detail resolves it from `workouts.weather_data` (`temperature_start_f ?? temperature`) and build.ts surfaces it in the Performance stat line + TERRAIN row.
- **Why:** temperature was not in the contract (lived only in `weather_data`, read only for the run race-narrative). Product-confirmed: extend the contract + use ride-start temp. Distance/duration were already in `completed_totals`.
- **Tradeoff accepted:** TERRAIN-row temp only renders when the elevation row renders (elev > 15 m); flat rides show temp only in the stat line.

---

## D-015 — Cycling fact-packet IF/VI come from `computed.analysis.power.*`, not a recompute

- **Date:** 2026-05-17 (commits 6941a236, fae293e7)
- **Decision:** `buildCyclingFactPacketV1` no longer recomputes IF/VI as its primary path. `analyze-cycling-workout` passes the analyzer's canonical `computed.analysis.power.{intensity_factor,variability_index}` straight through as `intensityFactorOverride`/`variabilityIndexOverride`; the packet uses them for `facts`, the classifier gate, and `executed_intensity`. The NP resolver also prefers `computed.analysis.power.normalized_power`. This is the same source `compute-facts:1124` trusts.
- **Alternatives considered:**
  - **Keep recomputing in build.ts but fix the NP/avg source** (point the `computed.overall.*` chain at the right keys). Rejected — `compute-workout-summary` writes power only per-interval/segment, never at `computed.overall` for rides; there is no overall NP/avg to point at, and re-deriving avg-power-including-coasting to match the analyzer's VI denominator would duplicate analyzer logic in a second place (drift risk).
  - **All-or-nothing override** (use overrides only if both IF and VI are present). Rejected — FTP-missing rides have a canonical VI but no canonical IF; per-metric fallback keeps VI canonical while IF degrades to the NP/FTP recompute.
  - **Read the values in build.ts directly from `workout.computed`.** Rejected — build.ts already takes resolved scalars; threading the resolution through the caller keeps the source-precedence logic in one place (`analyze-cycling-workout`, alongside the NP/avg resolvers) and keeps `buildCyclingFactPacketV1` a pure function of its args (unit-testable — see `build.test.ts`).
- **Why this one:** the recompute fed off `computed.overall.*`, which is unpopulated at the overall level, so it silently fell back to provider/device power. Result: the fact packet — and the classifier's VI≥1.10 ∧ IF≥0.85 gate, TSS, and `executed_intensity` — reasoned over numbers disconnected from the actual ride. Divergence ran both directions (observed: fact-packet VI 2.33 vs canonical 1.23; IF 1.28 vs 1.07). One source of truth (`computed.analysis.power.*`) for every downstream consumer.
- **Tradeoff accepted:** the fact packet is now coupled to `compute-workout-analysis` having run first and populated `computed.analysis.power.*`. This is already the pipeline order (`recompute-workout`: compute-workout-analysis → compute-facts → analyze-*); rides analyzed before the analyzer populated those fields need a re-analyze (the committed `scripts/verify-cycling-vi-if-fix.mjs` is that backfill — it doubles as the Q-008 mechanism). When the analyzer's fields are absent, the packet still recomputes per-metric, so it degrades rather than nulls.

---

## When to add an entry

Add a new D-NNN when:
- A non-trivial design choice was made that someone could reasonably reverse later.
- A coefficient or threshold was picked deliberately (not just the default).
- An architectural pattern was rejected — record what was rejected and why.
- A scoping call was made (e.g., "ship narrow now, generalize later" — D-004).

Don't add entries for:
- Routine bug fixes where there's only one sane fix.
- Choices documented adequately in the protocol spec already (link to it instead).
- Tactical implementation details (file layout, variable names) — those live in commit messages.
