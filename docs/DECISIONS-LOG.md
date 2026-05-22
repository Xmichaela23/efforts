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
- **Tradeoff accepted:** the taxonomy still lacks a true terrain/unstructured distinction beyond climbing/tempo; elevation density is sourced from `computed.analysis.climbing.climb_ascent_m` (grade≥3% climb-segment ascent, not total gain) so it under-reports on rolling terrain — directionally correct, the spec-named source. **[Superseded in part by D-016 (2026-05-17): the elevation-density source changed to total `workouts.elevation_gain`; the under-report was not benign.]**

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

## D-016 — VI-gate elevation density from total `workouts.elevation_gain` (supersedes D-011's elevation-source tradeoff)

- **Date:** 2026-05-17 (commit bdf2cde2)
- **Supersedes:** the elevation-source tradeoff in D-011. D-011's other calls (VI cut 1.10, IF floor 0.85, the `'climbing'` type, gate ordering) stand unchanged.
- **Decision:** the classifier's elevation-density gate (`elevationGainPerMi` in `_shared/cycling-v1/build.ts`) now sources ascent from **total ride elevation gain** — `workouts.elevation_gain` (metres), passed through as `elevationGainM` from `analyze-cycling-workout` (added to that function's workout SELECT). `computed.analysis.climbing.climb_ascent_m` (grade≥3% climb-segment ascent) is kept only as a fallback when total gain is absent.
- **Why the reversal:** D-011 accepted climb-segment ascent as "directionally correct, the spec-named source" and called the rolling-terrain under-report benign. It is not benign near the 40 ft/mi threshold. Concrete case: May-10 ride `60304656` — 22.9 mi, **325 m total gain → 46.5 ft/mi (→ climbing)** vs **249 m climb-segment → 35.6 ft/mi (→ tempo)**. VI 1.13 / IF 1.075 already fire the gate post-D-015; only the elevation branch was misclassifying the ride. The under-report straddles the gate exactly on the rides the gate exists to catch (rolling climbs that aren't single sustained grades).
- **Alternatives considered:**
  - **Lower the 40 ft/mi threshold to compensate for the under-report.** Rejected — re-tunes a clean threshold to paper over a wrong input; would over-capture genuinely flat rolling rides whose climb-segment density is coincidentally low.
  - **Sum climb-segment ascent differently / lower the 3% grade floor.** Rejected — reconstructs total gain badly; `workouts.elevation_gain` already is total gain.
  - **Keep climb_ascent_m primary, total gain as tiebreaker only near the threshold.** Rejected — two-source threshold logic is harder to reason about than "total gain is the density numerator."
- **Tradeoff accepted:** `workouts.elevation_gain` is provider-reported (Garmin/Strava barometric or GPS-derived) and carries the usual barometric drift / GPS-elevation noise; total gain can be inflated by sensor noise on flat rides. Net still better than systematically under-reporting on the exact rides the gate targets. climb_ascent_m fallback preserves behavior on rows missing total gain (degrade, not regress). Rides classified before this ship keep their stored type until re-analyzed (same backfill caveat as D-015; `scripts/verify-cycling-vi-if-fix.mjs` is the mechanism).

---

## D-017 — Strength schedule provenance split: `strength_preferred_days` = wizard pin ONLY; engine placement = `strength_optimizer_slots`

- **Date:** 2026-05-17 (commit 71611501; POLISH §4 #131 / "Bugs first" 1 & 2)
- **Decision:** the optimizer's *chosen* strength days are NEVER written to `strength_preferred_days` or `preferred_days.strength` (the genuine wizard-pin surfaces). Engine placement travels solely in `strength_optimizer_slots`. Enforced at two points: (a) `reconcile-athlete-state-week-optimizer.ts:276` no longer writes `merged.strength_preferred_days` from engine `strength_slots`; (b) `create-goal-and-materialize-plan/index.ts:~904` strips engine `optimal.preferred_days.strength` from the persisted `preferred_days` and persists it as `trainingPrefs.strength_optimizer_slots`. The client export renders the latter as "Strength (scheduled by app):"; `strength_preferred_days` stays the athlete-pin path.
- **Alternatives considered / rejected:**
  - New `strength_optimizer_days: string[]` threaded through `CombinedSchedulePrefs` + `mergeCombinedSchedulePrefs` (original #131 wording). Rejected — `strength_optimizer_slots` already exists/typed/threaded; reuse is smaller surface.
  - Threading the engine field via the gcp response + the 3 create-goal `freshCombinedPrefs` sites. Rejected after tracing that `freshCombinedPrefs` is re-derived from `goal.training_prefs`, NOT the gcp response — so the `:904` strip makes those sites wizard-only automatically; no edit needed.
  - Composer-side suppression of engine "preferred rejected" trade-offs (`plan-generation-trade-offs.ts`). Rejected — the root fix stops the optimizer being fed phantom strength prefs, so those lines are never emitted; a composer suppress would also swallow *legitimate* wizard-pin-rejection messages.
- **Why:** conflating engine output with the athlete-pin field made exports present engine defaults as "Athlete preference" and emitted incoherent "preferred day rejected" trade-offs for placement the athlete never chose.
- **Tradeoff accepted:** pre-fix goals keep stale engine strength in `training_prefs` until regenerated (clean-on-regenerate; no migration — product-approved). The wizard still has no strength-day pin question (deferred per #131), so `strength_preferred_days` is rarely set today — which is now correct, not a bug.
- **Footgun:** never re-add an engine→`strength_preferred_days` / engine→`preferred_days.strength` write "for convenience" (reconcile:276 *was* exactly that bug). Engine strength = `strength_optimizer_slots`. See ENGINE-STATE Solid.

---

## D-018 — QR+lower consolidation trade-off: builder realized-grid collector is sole owner; optimizer must not emit it

- **Date:** 2026-05-18 (Slice 1 `60338100`; Slice 2 `1fff344b`; POLISH "Bugs first" 1 / Piece B)
- **Decision:** the same-day quality-run + lower-body-strength consolidation trade-off line is emitted ONLY by the builder's realized-grid `collectQualityRunLowerBodyTradeOffs` (`generate-combined-plan/week-builder.ts:~2109`). The optimizer's copies are deleted (`week-optimizer.ts:1237` in Slice 1; the two surviving siblings `:1604-1606` live + `:1756-1758` dead in Slice 2). The optimizer copy fired at canonical-pattern time, before the builder can split the day (`enforceHardEasy(grid, allowConsolidatedHardException=false)`), so it could name a consolidation that never realizes — duplicate AND potentially day-stale vs the builder's realized-accurate line.
- **Precondition method (reusable):** before deleting any optimizer trade-off the builder also emits, run the **builder-coverage gate** — prove B ⊇ (optimizer-emit condition set). For Slice 2: the builder predicate (realized-grid same-day `quality`-tagged run + `lower_body`-tagged strength, coupled to `hasConsolidatedQualityRunWithLowerBody` `week-builder.ts:173-181`) ⊇ C1 (the live `:1604` co-equal-2× branch); C2 (`:1756`) is provably dead (`stacking` needs `isCoEq` true; its enclosing `else` is reached only when `isCoEq` false).
- **Alternatives considered / rejected:**
  - Composer-side semantic dedup of the two differently-worded lines (`plan-generation-trade-offs.ts`). Rejected — every pipeline dedup is exact-string Set membership; an equivalence-class dedup is fragile and risks collapsing legitimately-distinct lines. Root deletion is cleaner — the same single-owner principle as D-017.
  - Preserve the consolidation hint in `arc-setup-chat`'s LLM system-prompt context (the one non-`week_trade_offs` consumer of the optimizer pushes). Rejected — Arc-setup has no realized `sessions_by_week`, so it could only assert the may-not-realize canonical-pattern claim; omitting beats feeding a stale hint. Consistent with "builder realized-grid is the only authority."
  - Slice 2 also excising the entire dead inner `if (stacking)` block in the non-co-equal branch. Rejected — surgical/symmetric only (one concern per slice); the dead-block cleanup is deferred and recorded as Q-013 (zero runtime effect; dead).
- **Why:** the athlete-visible "Schedule adjustments" list showed the QR+lower consolidation twice (optimizer canonical-pattern wording + builder realized wording); the optimizer copy is non-authoritative and can name a day that won't realize.
- **Tradeoff accepted:** `arc-setup-chat` LLM context loses the two prose lines for co-equal-2× weeks (no realized-grid replacement there). The remainder of the dead inner `if (stacking)` block (non-co-equal branch, ~`week-optimizer.ts:1755`) stays in code (Q-013).
- **Footgun:** never re-introduce a QR+lower consolidation `trade_offs.push` in `week-optimizer.ts` "for parity" — the builder collector is the sole owner. The builder-coverage gate is mandatory before any future optimizer↔builder trade-off de-duplication. See ENGINE-STATE Solid "Bug 1 Piece B", Q-013.

---

## D-019 — Race-week protocol: priority-driven A/B, inviolable A-taper, hard-fail over silent degradation, soft validator guards

- **Date:** 2026-05-18 (RACE-WEEK-PROTOCOL §8; Phases 1–4 — `4a63f44e`/`9c393119`/`7221b8d5`/`f7580ec5`/`3076ba72`/`0b54318d`/`95bd017e`)
- **Decision:** the race week is a first-class concept. (1) **§8.1** A/B is **priority-driven** (`goal.priority`), not calendar-order; the genuine priority-A tri is the A-race, captured BEFORE the no-A `sortedGoals[0].priority='A'` mutation; if the priority-A race is not the chronologically-last tri → **hard-fail** (chronology guard), never silently mis-plan. (2) **§8.2** the A-race taper takes its full distance-driven `taperWeeks` and is **never compressed**; the two-tri handoff allocates backward (A-taper reserved first); rebuild/recovery/base absorb tight windows. (3) **§8.5** ≥1 rebuild week always between post-B recovery and the A-race. (4) **Decision A:** an infeasible B→A window **hard-fails** with an actionable `[race-week §8.2/§8.5]` message rather than silently shipping a degraded A-taper. (5) **§8.3** race-day session is distance-aware (no event-name string match); **§8.4** it must always materialize (hard-fail `findMissingRaceDaySessions`). (6) **§8.6** activation-swim substitution scoped to the actual race week only; race-week structural invariants get **soft** validator guards — only race-day-presence is hard-fail.
- **Alternatives considered / rejected:**
  - Calendar-order A/B (status quo). Rejected — mis-plans when priority and chronology disagree; priority is the user's stated intent. The chronology guard surfaces misconfig instead of guessing.
  - Silent A-taper compression on a too-tight B→A window (status quo). Rejected (Decision A) — degrading the A-race taper without telling the athlete is worse than an actionable error; symmetric with the §8.1 guard.
  - Hard-fail for the Gap-9 b/c/d structural checks. Rejected — they guard already-enforced invariants; soft (advisory `console.warn`) avoids destabilizing generation. Only the unshippable case (no race-day session, §8.4 / Gap-9a) is hard.
  - Touch `TAPER_WEEKS_BY_PRIORITY.B` to force IM-B ≤1wk taper. Rejected (Decision B) — out of canonical-70.3 scope; 70.3-B is already 1wk so §8.1-B is a no-op there.
- **Why:** race weeks were an emergent intersection of `raceThisWeek` + a plain `taper` block + a hardcoded overlay — no A/B differentiation, A-taper silently compressible, race day event-name-string-driven and droppable on a rest slot. The locked spec makes the A-race the protected season goal and converts silent failure modes into actionable hard-fails.
- **Tradeoff accepted:** infeasible/misconfigured two-race plans now error (intended); a multi-week A-taper's earlier week keeps Race-Spec Light (no early swim de-load); the synthetic test-fixture geometry (B=14/A=18) differs from the realized contract (B=13/A=17) — documented, do not conflate.
- **Footgun:** A/B priority-driven + chronology guard; A-taper inviolable; Decision-A hard-fail; Gap-9 b/c/d soft / 9a hard. `bikeOpeners` over-broad `phase==='taper'` gate (`week-builder.ts:1298`) is the same class as the fixed Gap-6 sub but deliberately OUT of §8.6 (POLISH backlog). See ENGINE-STATE Solid "Race-week protocol (Phases 1–4)", RACE-WEEK-PROTOCOL §8.

---

## D-020 — Swim arc Phases 0-3: band-as-envelope ramp, §5 over §6.3 hierarchy, additive §6.2 pools, conservative scull gating, optional tri-generator threading

- **Date:** 2026-05-19 (SWIM-PROTOCOL §4.1 / §6.2 / §6.3; commits `95c9b13f` / `c1c94cec` / `ef91c2ee` / `e723d246` / `95b94aba` / `f53bbf34`; plus side-channel Q-014 `ff9600e9`)
- **Decision:**
  1. **§4.1 ramp = band-as-envelope (Option A), NOT floor/ceil rewrite (Option B).** `resolveSwimSlotYardsWithBudget`'s per-slot clamp replaced with `roundYards(lerp(band_floor, band_ceil, phaseProgress(weekInPhase, rampWeeks)))` for base/build/race_specific; taper/recovery skip the ramp (taper uses its own scaled band; recovery returns its band). `getProtocolFloor` / `getProtocolCeiling` are deliberately untouched — the band itself IS the envelope; `*_START_YDS` / `*_PEAK_YDS` per-slot constants remain the upstream preliminary template.
  2. **`weekInPhase` MUST be `weekInPhaseForTimeline(phaseBlocks, weekNum, block)`** — never `weekNum - block.startWeek + 1` (always 1 per ADR-0002 → silently flattens the ramp). 6 wiring edits in `week-builder.ts` thread the recovery-non-resetting in-phase index through `getSwimSlotTemplates`, `resolveSwimSlotYardsWithBudget`, `apply703SlowSwimmerWeeklyFloors`, `applyOverdistanceIfApplicable`.
  3. **§5 per-type drill counts are AUTHORITATIVE; §6.3's "rotates 2-3 drills" is the GLOBAL DEFAULT.** "Rotates" means temporal variation across sessions, not multiple drills within one session. §5.1 Technique Aerobic → 2-3 (Path A); §5.2/§5.3/§5.4/§5.7/§5.10 → 1 (Path B). In-code citations on `pickSwimDrillInset` doc + Path A guard + Path B comment lock the contract.
  4. **§6.2 pool additions are ADDITIVE — pre-existing extras retained.** singlearm/616 added to base; scull/scullfront/zipper added to build; singlearm added to peak (race rotation); fingertipdrag added to taper. fist/kick/snorkel_freeswim retained in base (spec lists "primary" drills per phase but doesn't say "only these"). All seven added tokens pre-exist in `SWIM_DRILL_TOKEN_POOL`/`SWIM_DRILL_ALIAS`/`DRILL_EQUIPMENT_MAP`.
  5. **scull/scullfront require pull buoy (DRILL_EQUIPMENT_MAP) — coaching-conservative, diverges from §6.1 column 4 "None" by design.** Real-world sculling without a buoy lets the legs sink and masks the catch-feel work; standard coaching practice uses a buoy. The gear filter (`swimDrillTokenAllowedByGear`) excludes scull/scullfront from build sessions for athletes without buoy → they get other build drills (catchup/fist/zipper); per-step `step.equipment='buoy'` populated by `inferEquipFromDrillName`'s `/scull/` branch.
  6. **§6.3 distinct-phase pairing (Path A only).** New `SWIM_DRILL_STROKE_PHASE` map per §6.1 column 2 (timing/recovery/catch/rotation/body_position/race_specific). Path A picker enforces all-distinct phases across 2-3 chosen drills. **Permissive fallback** when pool diversity (or gear filtering) starves the count below 2 — the §5.1 2-3 count is the bigger training lever; pairing is variety polish.
  7. **§6.3 fitness-tier biasing (Path A + Path B).** Beginner: foundation bias toward §6.2 base primaries (catchup/fingertipdrag/singlearm/616) — strictly the four; zipper is a build-phase refinement drill per §6.2, NOT foundation. Advanced: race-specific bias toward sighting (fires only in peak phase where sighting is in the pool); singlearm NOT included in the race-spec set (rotation-foundation in non-peak phases). Bias is the **primary** sort key; smallest-yards-first is **secondary**. Intermediate / undefined preserves prior behavior exactly — locked by a no-regression test.
  8. **Tri-generator threading deferred.** `generate-triathlon-plan/generators/tri-generator.ts` has 6 `pickSwimDrillInset` call sites and no `athleteFitness` in scope. `pickSwimDrillInset.athleteFitness` is optional → those call sites preserve intermediate-equivalent behavior. Threading through tri-generator is a separate scoping decision (CLAUDE.md notes tri-generator is a legacy path that "does not yet route through the optimizer").
- **Alternatives considered / rejected:**
  - **Phase 1 — Option B (per-week scaled floor/ceiling functions).** Rejected (user-locked Option A). Larger blast radius — rewrites two functions that other code already depends on. Option A localizes the change to the resolve path's clamp; floor/ceiling functions stay invariant.
  - **§6.3 reading (a): "each session contains 2-3 drills"** (would force Path B to emit 2-3 for threshold). Rejected — conflicts with §5.3's explicit "1 drill (100yd)" prescription. The hierarchy under Option 3 (§5 authoritative, §6.3 global default) reconciles cleanly.
  - **§6.2 prune** — removing fist/kick/snorkel_freeswim from base because §6.2 lists them as Build/non-primary. Rejected (user-locked additive-only). Smaller blast radius; pre-existing pool extras aren't harmful, just non-canonical.
  - **scull/scullfront posture relaxed to `optional` pull buoy** (faithful to §6.1 column 4 "None"). Rejected — sculling without a buoy loses most of its catch-feel value; coaching-conservative posture is the right call.
  - **Race-spec bias including singlearm** (mirrors §6.2 peak primaries). Rejected — singlearm is rotation-foundation in non-peak phases; including it would over-bias against rotation drills for advanced athletes outside peak.
  - **Recent-pick memory (Slice 3c)** — track previous-week drills to harden §6.3 "never repeat across consecutive sessions". Deferred (Q-015) — accepted collision risk at adversarial salts; pool sizes post-Phase 2 make collisions infrequent.
  - **§2 ratio scaling (Slice 3e)** — drill yardage by `(intent, experience)` matrix. Deferred (Q-016) — needs investigate-first arc; per-token drill yards are aerobically inconsequential vs band-volume layer.
  - **Wire `swimDrillEquipmentFromTokens` into `inferSwimEquipmentPack`** to fix `computed.swim_equipment_suggested` for non-pull_focused sessions with pull-buoy drills. Rejected (Q-014) — belt-and-suspenders; Garmin/Form don't read the field, and the only in-app reader already derives the same data from `steps_preset` independently.
- **Why:** swim was the protocol whose volume curve was dormant (designed `phaseProgress(weekInPhase, rampWeeks)` curve, never advanced because of `weekInBlock≡1` per ADR-0002) and whose drill rotation was both spec-noncompliant (missing §6.2 primaries) and spec-ambiguous (§6.3's "2-3 drills" reading). The arc ratifies the dormant ramp via Option A's localized clamp replacement, fills the §6.2 gaps additively, resolves the §6.3↔§5 tension by codifying the hierarchy in-code so a future session can't re-litigate, and adds the missing §6.1 stroke-phase pairing and §6.3 tier-biasing rules — all in incremental slices, each gated and shipped independently.
- **Tradeoff accepted:** scull/scullfront diverge from §6.1 column 4 (coaching-conservative, surfaced in Phase 2 audit); fist/kick/snorkel_freeswim retained in base despite not being §6.2 primaries (additive scope); tri-generator's swim drill picks unaffected by tier biasing (legacy path); 3c/3e deferred (Q-015/Q-016) — known collision risk and unimplemented ratio scaling, both documented; server-side `swim_equipment_suggested` left incomplete (Q-014, redundant channel).
- **Footgun:** weekInPhase MUST come from `weekInPhaseForTimeline` (ADR-0002); §5 counts authoritative over §6.3 default; scull/scullfront stay pull-buoy-required; tri-generator's intermediate-equivalent behavior is intentional; band-as-envelope (Option A) is locked — do NOT rewrite floor/ceiling functions. See ENGINE-STATE Solid "Swim protocol arc (Phases 0-3)", SWIM-PROTOCOL.md §4.1 / §6.2 / §6.3, ADR-0002, Q-014 / Q-015 / Q-016.

---

## D-021 — Q-005 scaledWeeklyTSS budgets on endurance hours, not declared hours

- **Date:** 2026-05-20 (commit will be appended at ship; Q-005 originally filed in `docs/POLISH-PUNCH-LIST.md §4` and `docs/ENGINE-STATE.md` Known Broken; mirror `docs/OPEN-QUESTIONS.md` Q-005)
- **Decision:** `scaledWeeklyTSS` (`generate-combined-plan/week-builder.ts:677`) now budgets on **endurance hours** (post-§2.1 strength-load deduction) rather than declared hours. The plumbing path:
  1. `SessionFrequencyDefaults` (`src/lib/session-frequency-defaults.ts:93-118`) gains a new `endurance_hours: number` field exposed from the existing local `enduranceHours` at `:284` (`Math.max(0, hours - strengthCountForDeduction * 0.75)`).
  2. `week-builder.ts` reads `athleteState.session_frequency_defaults?.endurance_hours ?? athleteState.weekly_hours_available`. The defensive fallback preserves legacy behavior when the reconciler short-circuits (no-`long_run_day` path → `session_frequency_defaults` undefined).
  3. `generate-combined-plan/index.ts:481` (`plan_contract_v1.weekly_tss_target`) mirrors the swap so the persisted contract value matches the actual per-week budget.
- **Effect:** hybrid 11hr/7d × 2× perf-strength athlete budgets on 9.5hr endurance vs prior 11hr declared. `scaledWeeklyTSS`'s `hourFactor` moves from 1.1 to 0.95 → ~15-20% TSS budget reduction at the tier boundary (build week: ~700-800 → ~550-650). Endurance-only athletes: zero change (`endurance_hours === hours_per_week`). Plan #60 W6 build week predicted to land ~11h flat vs the documented 11h55m overflow.
- **Alternatives considered / rejected:**
  - **Pass `weekly_hours_available` minus strength_count × 0.75 directly at the call site** (no new field on `SessionFrequencyDefaults`). Rejected — duplicates the deduction logic, drifts if the §2.1 formula ever changes, and the deduction is already a load-bearing intermediate in `computeSessionFrequencyDefaults`. Pure data-flow extension is cleaner.
  - **Replace `weekly_hours_available` everywhere with `endurance_hours`.** Rejected — the wizard UX still presents declared hours; downstream display surfaces (`plan_contract_v1.weekly_hours`, narrative copy) need the original value. Renaming the budgeting axis is the right narrow change.
  - **Touch `scaledWeeklyTSS`'s `hourFactor` formula directly.** Rejected — that math is shared across phases and CTL bands; changing the formula has bigger blast radius than swapping the input.
  - **Backfill / re-materialize affected plans.** Rejected — production plans are frozen JSON; behavior change is opt-in via next regenerate. No silent rewrite.
- **Why:** Plan #60 build week landed 24min/week over budget — frequency matrix correctly dropped a swim slot but the TSS budget stayed at the 10-12 tier (matching declared hours, not endurance hours), so remaining sessions absorbed the freed TSS and grew longer. Compounds across 12+ build/peak weeks. Below the ship-blocking threshold, but a real systemic mismatch between frequency-side and intensity-side budgeting axes. The §2.1 deduction commit (`cf68cf43`) split `enduranceHours` from `hours` deliberately to enable this fix — the rail was prebuilt; this Q closes it.
- **Tradeoff accepted:** hybrid athletes regenerating post-deploy see ~15-20% TSS reduction at the tier boundary (intended). Endurance-only athletes unaffected. The defensive `??` fallback path preserves legacy behavior for the no-long-run reconciler short-circuit case. The optional `index.ts:481` consistency edit was applied — without it, persisted `plan_contract_v1.weekly_tss_target` would over-report for hybrids.
- **Footgun:** do NOT conflate `endurance_hours` with `hours_per_week`. Declared hours stay the user-facing wizard value and the canonical workout-time budget; endurance hours are the TSS-budgeting axis only. Anyone re-implementing `scaledWeeklyTSS` or adding new TSS-scaled budgets MUST use `endurance_hours` (with the same `??` fallback for the reconciler short-circuit path), not `weekly_hours_available`. The §2.1 deduction at `session-frequency-defaults.ts:284` is the SINGLE SOURCE OF TRUTH — do not duplicate the formula. See Q-005 (resolved), ENGINE-STATE Solid "scaledWeeklyTSS endurance-hours-based budget (2026-05-20 fix)".

---

## D-022 — Ticket B learner per-session ceiling cap (70.3/full beginners only, OD window gated)

- **Date:** 2026-05-20 (commit will be appended at ship; original Ticket B filing in `docs/POLISH-PUNCH-LIST.md §4 item #133`; mirrored as ENGINE-STATE Known Broken `swim-protocol-volumes.ts per-band ceilings...`; Task 3 audit 2026-05-20 confirmed still applicable post-recent-arcs)
- **Decision:** add a learner per-session yardage ceiling cap in `getProtocolCeiling()` (`generate-combined-plan/swim-protocol-volumes.ts`). For `fitness === 'beginner' && distance ∈ {'70.3', 'full'}`:
  - **Aerobic** (`css_aerobic`, `race_specific_aerobic`, `technique_aerobic`, `endurance`, `kick_focused`, `pull_focused`): cap at **2500yd**.
  - **Threshold** (`threshold`, `speed`): cap at **2000yd**.
  - **`easy`**: no learner cap (the existing `raceYd × 0.5` cap is already well below 2500 — 1050 for 70.3, 2000 for full).
  - Implementation: `learnerSessionCap()` helper returns the cap or null; applied via `Math.min(ceiling, snapProtocolYards(learnerCap, sessionType))` AFTER the base ceiling switch, so the endurance OD window's 4600yd is also gated (beginner 70.3/full athletes never hit OD volume regardless of phase). Intermediate/advanced and sprint/olympic athletes pass through unchanged.
- **Effect (per band table snapshot):**
  - 70.3 beginner aerobic: 2800-3000 → 2500 (−4% to −17%).
  - Full beginner aerobic: 3200-4000 → 2500 (−22% to −38%).
  - 70.3/full beginner threshold: typically 200-800yd reduction.
  - 70.3/full beginner endurance OD window: 4600 → 2500 (gated).
  - Intermediate/advanced / sprint/olympic / easy: **zero change**.
- **Alternatives considered / rejected:**
  - **Extend to Olympic distance** (beginner Olympic build bmax 2600, race-spec 2800 — borderline over 2500). Rejected (user-locked documented-scope). Faithful to ENGINE-STATE filing + POLISH-PUNCH-LIST `{'70.3', 'full'}` language; marginal benefit (100-300yd) over Ticket B target. Easier to justify scope in DECISIONS-LOG. Extend if Olympic athlete complaints surface.
  - **Lower the band-table `bmax` values** for beginner 70.3/full instead of adding a per-session ceiling clamp. Rejected — the band table is used by `getProtocolFloor` and `floorsFor()` / `shrinkDiscretionary()` for weekly aggregation. Lowering bmax would tighten floors too, double-counting the constraint. Per-session ceiling clamp is the surgical change.
  - **Apply the cap to the band-lerp's ceil endpoint** in `resolveSwimSlotYardsWithBudget`'s clamp instead of `getProtocolCeiling`. Rejected — same effect but spreads the policy across two functions. `getProtocolCeiling` is the canonical per-session-ceiling source of truth; the lerp reads from it.
  - **Extend the cap to intermediate tier** (would close Plan #60 W6 directly — the documented athlete resolves to intermediate, not beginner, per Q-006). Rejected — Plan #60 W6's specific population is a Q-006 concern (high-CTL learner with `swim_experience='learning'` resolving to intermediate because CTL+2 + learning-1 = +1 score). The proper closure of that case is Q-006's structural fix (separate `swim_fitness` tier override), NOT extending the Ticket B cap to all intermediate athletes (which would over-tighten real intermediate athletes who legitimately train at 3000+yd aerobic).
- **Why:** beginner 70.3/full athletes were getting up to 3200-4000yd aerobic sessions in build/race-spec — well above the Ticket B coaching target (≤2500yd aerobic / ≤2000yd threshold per session). The 0fd17ad9 `swim_experience='learning'` wiring + 2026-05-20 swims90 fix (`3b228dc8`) closed the score-arithmetic path (genuine beginners now correctly resolve to beginner tier), but the per-band ceilings themselves were never the target of those fixes. Ticket B's residual concern was always the per-session yardage; this Q closes it.
- **Tradeoff accepted:** Plan #60 W6's documented athlete (high-CTL learner resolving to intermediate) is NOT closed by this fix — that case is Q-006's territory. The Ticket B cap closes the population that DOES resolve to beginner. Olympic beginners (band 2600-2800) are marginally over the Ticket B target but excluded per documented scope; defer to follow-up if needed.
- **Footgun:** the learner cap is a `Math.min` overlay applied AFTER the base ceiling — it cannot RAISE the ceiling, only lower it. If a future band table lowers 70.3/full beginner bmax below 2500/2000, the cap becomes a no-op naturally (correct behavior; the cap is a ceiling, not a target). Do NOT change the helper to set the ceiling unconditionally — it must remain a clamp. Endurance OD window is intentionally gated for beginners; do NOT re-elevate beginners into the OD path on the assumption they need 4600yd weeks (the protocol explicitly prescribes lower per-session yards for learners). See Q-005 / D-021 (companion intensity-budget fix), ENGINE-STATE Solid "swim-protocol-volumes Ticket B learner per-session cap (2026-05-20 fix)".

---

## D-023 — Run arc Phases 0-3: within-phase ramp, strides as first-class easy-run modifier, 70.3 peak lift, conservative race-week stride gate

- **Date:** 2026-05-21 (P0 spec `50921629`; P1 ramp wiring `60c23de2`; P2 strides ship + P3 70.3 peak lift / brick comment correction this session; arc close-out — mirrors swim arc D-020 pattern: one D-NNN covers all phases cohesively rather than per-phase D-NNNs)
- **Decision:**
  1. **§4.1/§4.5 within-phase ramp = band-as-envelope lerp (Option A), NOT a floor/ceiling rewrite (Option B).** `longRunMilesForWeek` / `brickRunMilesForWeek` / interval rep ramp / VO2max rep ramp / race-pace miles ramp all lerp `START × peak → PEAK × peak` across `rampWeeks` via `phaseProgress(weekInPhase, rampWeeks)`. Taper / recovery skip the ramp (peak-of-phase floor with explicit external caps). Same Option-A pattern that closed the swim flat-volume bug.
  2. **`weekInPhase` MUST be `weekInPhaseForTimeline(phaseBlocks, weekNum, block)`** — never `weekNum − block.startWeek + 1` (always 1 per ADR-0002 → silently flattens the ramp). 6 wiring edits in `week-builder.ts` thread the recovery-non-resetting in-phase index through every ramp consumer.
  3. **Legacy `longRunFloorMiles` / `brickRunTargetMiles` PRESERVED unchanged** for validator + rebuild-test backward compat (peak-of-phase semantics) — do NOT replace those call sites with the lerp helpers. The two peak-source tables (`longRunPeakTarget` for the lerp, `longRunFloorMiles`'s internal `peakTarget` for the validator) MUST move in lockstep at every distance — Phase 3's 70.3 lift moved both together; Phase 1 deliberately deferred the lift to keep the validator + rebuild-test pin tests intact.
  4. **P0 spec patch (bundled in `60c23de2`):** §4.5 taper/recovery multipliers corrected to engine reality — taper `0.40 → 0.45`, recovery `0.55 → 0.40`. Draft had recovery > taper, which is backwards (recovery should be deload-lighter; the engine is correct).
  5. **70.3 long-run peak = 13mi (was 11mi).** Appropriate for 5:56 finisher targeting a PR; 15mi is marathon territory + IM injury-risk overlap. Realized 70.3 progression: base 8.5 → 10mi, build 10 → 11mi, RS 11 → 13mi (peak-week endpoint exactly 13). Full IM stays at 18mi — spec §4.5 documents 20mi (Friel typical 18-22) but Phase 3 explicitly only lifts 70.3; IM 18→20 deliberately out of scope.
  6. **Strides are a first-class easy-run modifier.** `addStridesToEasyRun(session)` returns a NEW PlannedSession (pure; mutate-in-place was rejected for unit-testability). +5min wall-clock add (mirrors legacy tri-generator at `tri-generator.ts:596` convention). Intensity stays EASY — strides are accelerations, not speedwork; TSS re-derived from the longer duration via the same `estimateSessionTSS`/`weightedTSS` helpers the engine uses (no per-stride TSS premium). The `strides_${reps}x${sec}s` token was already resolved end-to-end pre-Phase 2 (materialize-plan / Garmin / analyzer); Phase 2 is purely a week-builder emission gap fix.
  7. **Stride gate: `performance` intent only, never race-week, never recovery / rebuild, with late-base allowance (wip ≥ 4).** `shouldInjectStridesOnEasyRun(...)` is the sole owner of the gate. Computed once per `buildWeek` as `stridesOnEasyRun`; applied at the three easy-run emission sites (taper Wed `:~1407`, run-only Thursday `:~1546`, mid-week Friday `:~1595`).
  8. **Race-week strides hard-gated OFF — §5.8 wins over §9.1.** RUN-PROTOCOL §5.8 says NEVER race-week (interference with taper); §9.1 says "optional 1× short strides (race-day priming, not a workout)". Phase 2 resolved the conflict in §5.8's favor: cleaner gate, simpler test surface, conservative posture. The §9.1 "race-day priming" reading would be a separate race-week-protocol slice (a 2×20s dose tied to race day, not the weekly Wed easy run); deferred — see Q-017 for the open spec-edit.
  9. **`limiter_sport='run'` deliberately NOT consulted in Phase 2's gate.** §5.8's "Run-limiter dial: Phase 4 of future arc — additional strides on easy days for limiter_sport='run' athletes" makes this the natural extension. Phase 4 ADDS on top of the Phase 2 base; it does NOT gate Phase 2 OFF for non-limiter athletes.
  10. **Brick-run "≤25 min transition" comment removed (Phase 3).** Per §5.7 the 70.3 race-spec brick run is 5.5mi / ~55min — a meaningful run stimulus. The `maxLongRideMinutes` function is bike-leg-only because it measures *long-ride* volume, not because the run is short. Replacement comment makes the framing explicit; no code change (the code was always correct).
- **Alternatives considered / rejected:**
  - **Per-phase D-NNNs (one per slice).** Rejected — adds noise to DECISIONS-LOG without adding context; the arc's phases are cohesive design slices, not independent decisions. Matches swim arc D-020.
  - **Strides via inline `easyRun(...)` overload with `{ withStrides: { reps, sec } }`** instead of a separate `addStridesToEasyRun` helper. Rejected — overloading `easyRun` couples the modifier to the constructor; the helper composes more cleanly with future easy-run variants and is unit-testable in isolation.
  - **Mutating helper** (`addStridesToEasyRun(s)` with void return). Rejected — pure-function style matches the `vo2Run`-style Phase 1 pattern and the swim arc's pickers; small diff at call sites costs nothing.
  - **Strides gate on `limiter_sport='run'` IN Phase 2** (one-shot dial). Rejected — would conflate the Phase 2 baseline (all performance athletes get strides per spec) with the Phase 4 incremental allocation (limiter athletes get MORE). Spec §5.8 distinguishes them explicitly.
  - **§9.1 "race-day priming strides" emitted on the race-week Wed easy run.** Rejected — would override §5.8's explicit "NEVER race week" and re-create an in-week stride session right when the athlete should be tapering. The §9.1 priming concept (if it lands) belongs in a race-week-day-specific dose, not the existing weekly easy-run modifier path. See Q-017 for the deferred spec-edit.
  - **Lift 70.3 peak to 15mi.** Rejected — marathon territory; injury-risk overlap with IM training volume; targeting a 5:56 PR doesn't need that mileage. 13mi is the spec-locked value (RUN-PROTOCOL §4.5 LOCKED 2026-05-20).
  - **Lift Full IM peak from 18 → 20mi (spec §4.5 documents 20).** Deferred — Phase 3 scope was explicitly 70.3 only per §10.4 / §12 sub-decision 1. Not blocking; can be a later one-line slice.
  - **Touch validator semantics to lerp instead of peak-of-phase.** Rejected — `longRunFloorMiles` returning peak-of-phase is the deliberate validator contract; the lerp helper is the schedule-side computation. Two functions, two semantics, two consumers — preserved.
- **Why:** the run protocol was the last endurance protocol whose within-phase volume curve was dormant (designed `phaseProgress(weekInPhase, rampWeeks)` curve, silently flat-lined by `weekInBlock ≡ 1` per ADR-0002) and whose neuromuscular dose (strides) was effectively absent from weekly programs. The arc ratifies the dormant ramp via the localized lerp swap (Phase 1), lifts the 70.3 peak to the spec-locked 13mi (Phase 3), adds strides as a first-class easy-run modifier with a performance-intent / non-race-week gate (Phase 2), and removes the obsolete brick-run "≤25 min" framing comment that contradicted §5.7 (Phase 3). Same incremental-slice pattern as the swim arc (D-020), each phase gated and shipped independently.
- **Tradeoff accepted:**
  - **§5.8/§9.1 spec conflict:** resolved in §5.8's favor at the engine; spec edit deferred (Q-017). If the §9.1 priming reading ever wins, the change is in RACE-WEEK-PROTOCOL — not the strides modifier path.
  - **§4.5 realized-progression table drift:** engine outputs differ from the spec table at a few interior weeks by ±0.5mi due to half-mile rounding granularity (Q-018). Endpoints exactly match the locked spec; spec table will be updated next time it's edited.
  - **Full IM peak stays 18 (spec says 20).** Out-of-scope for this arc; not blocking. One-line follow-up.
  - **Test fixtures touched:** 17 tests had hardcoded 70.3 floor values (9.5mi base, 11mi RS) that depended on the pre-Phase-3 peak. All updated to the new floors (10mi base, 11mi build, 13mi RS); regression locks remain at full strength. `run-volume-ramp.test.ts` `later` selector bumped to wip ≥ 3 (new endpoint band rounds wip 1+2 both to 8.5mi; wip 3 lifts to 9.0mi — still locks the ramp mechanism end-to-end).
  - **Production plans frozen JSON; behavior is opt-in via next regenerate.** Same pattern as every other Phase 1+ engine ship.
- **Footgun (don't re-litigate):** see ENGINE-STATE "Run protocol arc Phases 0-3 (closed 2026-05-21 — D-023)" Solid entry for the full list. Compact summary: (a) `weekInPhaseForTimeline` is the canonical index — NEVER `weekInBlock`. (b) Two-peak-source rule: `longRunPeakTarget` + `longRunFloorMiles` move in lockstep. (c) `shouldInjectStridesOnEasyRun` is the sole gate owner. (d) `limiter_sport='run'` is Phase 4 territory, NOT in the Phase 2 gate. (e) `maxLongRideMinutes` is bike-leg-only because of WHAT it measures, not because the run is short. (f) §5.8 wins over §9.1 in race week (Q-017). (g) §4.5 table drift is cosmetic (Q-018) — match engine, not table.

---

## D-024 — Q-006 closure: swim-only fitness tier (`swim_fitness`) hard clamp on `swim_experience`

- **Date:** 2026-05-21 (commit `8d1315af`; supersedes D-002's "swim experience as soft signal only" stance — the soft signal STAYS, this is the additive explicit-signal hard clamp that the original Q-006 entry already named as the "proper closure")
- **Decision:** new optional field `AthleteState.swim_fitness` populated by a new pure helper `deriveSwimFitness(trainingFitness, swimExperience)` in `_shared/infer-training-fitness.ts`. Hard clamp at the swim tier:
  - `swim_experience === 'learning'` → `'beginner'`
  - `swim_experience === 'strong'` → `'advanced'`
  - `'steady'` / unset / unrecognized → inherits `training_fitness`
  Case-insensitive defensive normalize. `create-goal-and-materialize-plan/index.ts:1681-1687` populates the field alongside `training_fitness`. `generate-combined-plan/week-builder.ts:1169` derives `swimFitness = athleteState.swim_fitness ?? trainFitness` and threads it through **exactly five** swim-specific call sites: `getSwimSlotTemplates` (`:1216`), `resolveSwimSlotYardsWithBudget` (`:1260`), `applyOverdistanceIfApplicable` (`:1302`), `swimFromTplOpts.athleteFitness` (`:1313`), and the Full IM `enduranceOverdistanceNote` gate (`:1319`). All non-swim consumers (bike / run / strength / loading pattern / CTL fallback / weekly-hours bucket / run band selection) continue to read `training_fitness` unchanged.
- **Alternatives considered / rejected:**
  - **Hard global clamp** (`if swim_experience === 'learning' then training_fitness = 'beginner'`). Rejected per D-002 — over-clamps masters-cyclist learners on bike/run downstream consumers (CTL fallback 65→20, weekly hours 14→6, loading pattern, run band selection). Was the original "rejected" alternative when D-002 chose the soft signal.
  - **Extend the Ticket-B cap to intermediate athletes** (`fitness === 'beginner' || fitness === 'intermediate'` in `learnerSessionCap`). Rejected per D-022's footgun — would over-tighten genuine intermediate athletes who legitimately train at 3000+yd aerobic. The cap targets a population the global tier already identifies; the bug was that this population doesn't reach the cap, not that the cap is too narrow.
  - **Composer-side override in `getProtocolCeiling`** reading `swim_experience` directly. Rejected — would force the cap function to consume an additional parameter for an orthogonal concern; the right factoring is to express "swim-only tier" upstream and let downstream consumers stay as-is.
  - **Asymmetric clamp (down-only)** — only `'learning'` clamps; ignore `'strong'`. Rejected — wizard captures `'strong'` as an explicit signal too; respecting it for caps + bands + OD window is the symmetric reading. A beginner-tier athlete who declares strong swim background SHOULD get the higher swim ceilings.
  - **Touch `shouldMaintainTwoSwimsInRecovery` to read `swimFitness`** (`week-builder.ts:1197`). Out of scope — that helper already takes `swim_experience` directly and has internal learner-awareness; threading `swimFitness` there would be a parallel signal with no behavior change.
- **Why:** Plan #60 W6 (filed in D-022's footgun) and Plan #78 (filed in this audit) are the same shape — high-CTL learner whose `swim_experience='learning'` soft `-1` was outweighed by `ctl_ge_42` / `ctl_ge_58` / FTP / race-history signals, resolving to `training_fitness='intermediate'`. The Ticket-B cap in `learnerSessionCap` gates on `fitness === 'beginner'` (D-022); intermediate-resolving learners passed the cap silently and received 2800-3200yd threshold sessions. The structural gap was always "no swim-specific tier" — D-022's footgun explicitly named "separate `swim_fitness` tier override" as the proper closure. This commit ships exactly that path with the explicit-signal symmetry on both ends.
- **Tradeoff accepted:**
  - **Two-tier mental model** — engineers must remember `training_fitness` (global) ≠ `swim_fitness` (swim-only). Mitigated by: optional field with `?? trainFitness` fallback at the consumer (legacy `athleteState` payloads keep working); concentrated threading (5 sites, all in one file); type-system enforcement (same enum, distinct field).
  - **Hard clamp can over-down-shift on the learning side** — an experienced cyclist who has actually done a fair amount of swim training but still self-describes as "learning" (rare honesty bias) gets beginner-tier swim. Acceptable: the Plan 78 risk is over-prescription, not under-prescription, and the wizard text is clear about what "learning" means.
  - **Symmetric strong-side clamp lifts ceilings** — an explicitly-declared strong swimmer at global beginner tier now unlocks `advanced` bands. By design — symmetric with the down-clamp; matches what an explicit wizard signal should mean.
  - **Issue 1 (Plan 78 learner getting `[threshold, race_specific_aerobic]` rotation) is NOT closed** — `raceTwoSwimRotationSlotMeta` is a pure function of `planWeek % 4` and doesn't consult `swimFitness`. That's a separate spec-first swim arc slice (`docs/SWIM-PROTOCOL.md §X` fitness-tier session-type selection, then beginner rotation variant — option C in the audit). D-024 only closes the cap path; Issue 1 closure is its own D-NNN at swim-arc-slice close-out.
- **Footgun (don't re-litigate):**
  - **5-site threading is exact** — `shouldMaintainTwoSwimsInRecovery` (`:1197`) is deliberately NOT swapped (takes `swim_experience` directly already). Don't "complete" the threading by swapping it; that's redundant and breaks the careful scope.
  - **`?? trainFitness` fallback at consumer is load-bearing** — legacy athleteState payloads or external test fixtures that don't populate `swim_fitness` keep working at the intermediate tier. Removing the fallback would break tests that construct athleteState directly.
  - **Soft `-1` signal in `inferTrainingFitnessLevel` STAYS** — D-024 supplements it, doesn't replace it. The soft signal handles borderline athletes where the global tier SHOULD also nudge (low-CTL learner). The hard clamp handles explicit-signal cases where global tier should NOT change but swim should.
  - **The new field is optional, not required** — if a future refactor makes `swim_fitness` non-optional, the `??` fallback must be removed in lockstep across week-builder + all test fixtures.
  - **Issue 1 is NOT bundled into D-024** — Plan #78's "wrong session types for a learner" symptom is Issue 1, a separate spec-and-code slice. D-024 closes the cap path (Issue 2). Don't merge them retroactively.

---

## D-025 — Swim arc §10: fitness-tier session-type selection (Plan #78 Issue 1 closure)

- **Date:** 2026-05-21 (spec commit `656dc039`; engine commit `6ad97ee2`)
- **Decision:** `swim_fitness === 'beginner'` athletes get **type-substituted** swim sessions at template selection time, per the substitution map codified in `docs/SWIM-PROTOCOL.md §10.3`:
  - `threshold` → `css_aerobic`
  - `race_specific_aerobic` → `technique_aerobic`
  - `speed` → `technique_aerobic`
  - `pull_focused` / `kick_focused` / `technique_aerobic` / `css_aerobic` / `recovery` — pass through unchanged (§10.2-allowed for beginners).
  
  Implementation is **purely additive** per §10.6 — `RACE_70_3_SLOT_META`, `FOCUS_70_3_SLOT_META`, `raceTwoSwimRotationSlotMeta`, `raceTemplatesFromYards`, `focusTemplatesFromYards` stay UNTOUCHED. New parallel constants (`RACE_70_3_SLOT_META_BEGINNER`, `FOCUS_70_3_SLOT_META_BEGINNER`) and emitters (`raceTemplatesFromYardsBeginner`, `focusTemplatesFromYardsBeginner`, `raceTwoSwimRotationSlotMetaForBeginner`) live in the same file. Dispatch is a ternary on `athleteFitness === 'beginner'` at four entry points in `getSwimSlotTemplates` (focus taper, focus non-taper, race taper, race non-taper rotation).
- **Realized beginner rotations:**
  - **Race intent (`planWeek % 4`):** `1 → [css_aerobic, technique_aerobic]`; `2 → [css_aerobic, pull_focused]`; `3 → [technique_aerobic, technique_aerobic]`; `0 → [css_aerobic, technique_aerobic]`.
  - **Focus intent (3-slot):** `[css_aerobic, technique_aerobic, recovery]`. Slot 1 pull/kick phase alternation (build kick / RS pull) preserved unchanged — both types §10.2-allowed for beginners.
  - **Taper bypass:** dispatches through the same beginner emitters; race-taper for beginners is `[css_aerobic, technique_aerobic]` instead of `[threshold, race_specific_aerobic]`.
- **Alternatives considered / rejected:**
  - **Pure substitution helper** applied to the existing meta output. Rejected — couples the existing functions to the substitution path; the parallel-constant + dispatch approach honors §10.6's "must stay untouched" rule literally.
  - **Branch in `focusTemplatesFromYards` with an optional meta arg.** Rejected for the same reason — adding a parameter is a touch on the existing function. The parallel `focusTemplatesFromYardsBeginner` keeps the existing function bit-identical.
  - **Beginner-specific phase definitions in §4.1-§4.4.** Rejected (§10.7) — phases describe slot mix, not session types. Type substitution lives at template selection.
  - **Limiting substitution to the race-intent path.** Rejected — focus-intent slot 0 also defaults to `threshold` and slot 2 to `css_aerobic` (which we demote to `recovery` for beginners since the third weekly touch is most usefully a low-stress technique reinforcement, not a third density block).
  - **Comeback-specific variant.** Out of scope (§10.7). Comeback athletes resolve via the soft `training_intent` signal in `inferTrainingFitnessLevel` and aren't touched by `swim_fitness`. Separate slice if a real need surfaces.
  - **Strong-swimmer variant.** No change needed — `swim_fitness === 'advanced'` already uses the full intermediate/advanced rotation; D-024's symmetric clamp routes strong swimmers there regardless of global tier.
- **Why:** Plan #78 Week 1 (and the audit's "Issue 1") showed a learning swimmer getting `[threshold, race_specific_aerobic]` — race-pace and threshold sessions for someone who lacks calibrated CSS and stroke economy. The rotation was a pure function of `planWeek % 4` (race-intent) or fixed slot meta (focus-intent); `athleteFitness` only modulated yardage. D-022 (Ticket-B cap) + D-024 (`swim_fitness` clamp) closed the **volume** axis for this population; D-025 closes the **type** axis. Both compose without coordination — type substitution at template selection, yardage capping at the resolver.
- **Tradeoff accepted:**
  - **Two parallel constants per intent path** (`*_SLOT_META` + `*_SLOT_META_BEGINNER`). Cost: duplication. Benefit: zero risk to the existing path; future spec changes can move the constants in lockstep with explicit-substitution-diff visibility.
  - **Beginner focus-intent slot 2 = `recovery`**, not a lower-density `css_aerobic`. The third weekly touch trades aerobic density for technique reinforcement — chose the more conservative reading consistent with §10.4's "low-stress technique reinforcement, not a third density block" rationale.
  - **Mixed/Fartlek (§5.7) banned for beginners.** The session type with Z3-Z4 segments isn't appropriate for athletes without threshold fluency. A Z2-only beginner-Fartlek variant could exist — explicitly out of scope; revisit if a real need surfaces.
  - **Open Water Skills (§5.9) deferred to Masters coach.** §2 already recommends a Masters program for learning-tier athletes; algorithmic prescription of OW skills before stroke economy stabilizes trains compensatory patterns. Spec-level call.
  - **Comeback athletes not differentiated.** Tier-only framing per §10.7. Comeback resolution flows through `inferTrainingFitnessLevel`'s soft signal; if comeback-specific session types surface as a real need, a separate D-NNN handles it.
- **Footgun (don't re-litigate):**
  - **§10.6 anti-regression rule is load-bearing.** `RACE_70_3_SLOT_META`, `FOCUS_70_3_SLOT_META`, `raceTwoSwimRotationSlotMeta`, and the template emitters stay BIT-IDENTICAL for intermediate/advanced. The pin tests at `swim-slot-templates.test.ts` lock both paths; do NOT delete the no-regression assertions for intermediate / advanced (3 of the 9 new tests are pure no-regression locks).
  - **Dispatch is on `athleteFitness === 'beginner'`** — the parameter name in `getSwimSlotTemplates` opts. Upstream (`week-builder.ts:1216`) passes `swimFitness` (D-024) which already routes the Q-006 population to `'beginner'`. Don't change the parameter name; don't add a separate `swimFitness` opt.
  - **Slot 1 pull/kick alternation runs for both paths.** The existing `if ((ph === 'build' || ph === 'race_specific') && slots[1])` block mutates `slots[1]` regardless of which template emitter produced the base slot. For beginners that mutation routes through `pull_focused` / `kick_focused` — both §10.2-allowed.
  - **Full IM advanced endurance carve-out at slot 2** (`enduranceOverdistanceWindowActive` path at `swim-program-templates.ts:467-481`) gates on `athleteFitness === 'advanced'`. Beginners never hit it. Don't extend the carve-out to beginners — the §10.4 `recovery` substitution is the right slot-2 behavior for the learner population.
  - **D-022 / D-024 / D-025 compose; do NOT collapse them.** D-022 caps per-session yards for `fitness === 'beginner'`. D-024 clamps `swim_fitness === 'beginner'` based on wizard `swim_experience`. D-025 substitutes session types for `swim_fitness === 'beginner'`. Three layers, three different concerns; together they close the Plan #78 / #60 W6 population end-to-end.
  - **Plan #78 Issue 1 is closed by D-025; Issue 2 was closed by D-024.** Both shipped same day, separate commits. Don't conflate them in future refactors — the type axis and volume axis are deliberately separate.

---

## D-026 — `longRunMilesForWeek` is canonical for base/build/race_specific (not a `Math.max` floor)

- **Date:** 2026-05-21 (commit `0b983f07`; supersedes the Phase 1 wiring's `Math.max(longRunMiles, longRunFloor)` semantics at `week-builder.ts:863-864`, originally shipped in `60c23de2`)
- **Decision:** `longRunMilesForWeek(distance, phase, weekInPhase, rampWeeks)` is the **canonical** source of long-run mileage for base / build / race_specific phases. The week-builder assigns its output directly to `longRunMiles` instead of taking `Math.max(tssDerived, lerpOutput)`. The lerp's realized progression (per RUN-PROTOCOL §4.5: 70.3 base 8.5 → 10mi, build 10 → 11mi, RS 11 → 13mi) IS the prescribed mileage. The TSS-derived value computed at `week-builder.ts:832` is still used as a sizing proxy for other downstream uses but no longer participates in long-run mileage selection for the three ramping phases.
- **Alternatives considered / rejected:**
  - **Keep `Math.max` floor; cap the TSS-derived value to the lerp PEAK.** Rejected — spreads the policy across two sites (the TSS proxy at `:832` and the floor at `:864`); the lerp is the canonical contract per §4.5 and should drive directly.
  - **Lower the §4.5 LOCKED lerp endpoints so the natural TSS-derived value sits above them.** Rejected — would break the protocol's documented realized progression. The §4.5 endpoints are the contract; the engine should honor them, not work around them.
  - **Per-athlete-tier scaling of the lerp endpoints.** Rejected — long-run mileage is anchored to **race distance**, not athlete tier. An advanced athlete and an intermediate athlete at the same race distance get the same long-run prescription per Friel / Daniels coaching consensus. Tier affects intensity, frequency, and recovery — not race-distance long-run volume.
  - **Apply the canonical assignment to all phases (including rebuild/taper/recovery).** Rejected as redundant — `longRunMilesForWeek` already internally delegates to `longRunFloorMiles` for non-ramping phases, and the explicit `Math.min` clamps at `:868-882` handle the phase-specific external caps. Keeping the canonical assignment scoped to `hasTri && !raceThisWeek && !isRecovery` (the existing guard) leaves the other paths unchanged.
- **Why:** Plan #78 audit revealed that for high-budget athletes (CTL 60, 11hr/wk, intermediate, performance/race_peak — Plan #78 demographics), the TSS-derived `longRunMiles` (line 832) naturally lands at ~10mi every base week. The post-Phase-3-lift lerp endpoint for 70.3 base is also 10mi. So the lerp's lower values (8.5 → 9.5 across wks 1-5) sat BELOW the TSS-derived 10 and `Math.max` rendered them invisible — the realized output was flat 10mi every base week, then flat 11mi every build week, then flat 13mi every RS week. The §4.5 LOCKED progression was dormant in production. The Phase 1 wiring (`60c23de2`) intended `longRunMilesForWeek` as canonical (the comment at `:860-862` literally said "Lerps START → PEAK"); the `Math.max` was a safety hedge that turned into a silent contract violation.
- **Tradeoff accepted:**
  - **High-budget athletes lose ~1-2mi of early-phase long-run volume** that the prior floor-semantics silently added. By design — the protocol's realized progression becomes engine reality. The "saved" budget flows to other sessions (more easy run miles, more bike volume, more swim density), which the per-session sizing logic handles.
  - **`run-volume-ramp.test.ts` existing "ramps week-over-week" test was passing by accident** on a low-TSS fixture. It still passes post-fix (mileage monotonic increase still holds), but a NEW canonical-contract test asserts EXACT 8.5mi at base wip=1 — fails pre-fix regardless of fixture TSS, locks the contract.
  - **Production plans frozen JSON; behavior is opt-in via next regenerate.** Standard ship posture.
- **Footgun (don't re-litigate):**
  - **Never re-introduce a `Math.max` or any floor-style clamp** between `longRunMilesForWeek` and `longRunMiles` at `week-builder.ts:~864`. The lerp IS canonical. If a future need arises to bump above the lerp (e.g., athlete-supplied "I want longer runs"), that override belongs at the lerp endpoints themselves (RUN-PROTOCOL §4.5 amendment + D-NNN), not at the assignment site.
  - **Two long-run functions, two semantics, two consumers** — must move in lockstep at the source (D-023 footgun) but do NOT interchange at the consumer:
    1. `longRunMilesForWeek` (this commit's canonical source) — drives PRESCRIBED mileage in `week-builder.ts`.
    2. `longRunFloorMiles` — drives WARNING THRESHOLDS in `validate-training-floors.ts` (`evaluateLongDayVolumeFloors`, history-aware `effectiveLongRunFloorMiles`, `enforceLongDayFloors`). Returns peak-of-phase values for the validator path.
    Conflating them collapses both contracts.
  - **Rebuild/taper/recovery short-circuit through `longRunMilesForWeek`'s internal delegation** (returns `longRunFloorMiles(distance, phase)`); the external Math.min clamps at `:868-882` still apply on top. Removing either the internal delegation OR the external clamps breaks short-phase mileage caps.
  - **Brick-run does NOT have this defect.** `brickRunMilesForWeek` at `:1012` already uses canonical assignment (no Math.max layer). Don't apply this fix again there or anywhere else without verifying the prior call site actually had the floor pattern.
  - **The Phase 1 wiring's comment at `:860-862`** ("Lerps START → PEAK for base/build/race_specific") was the spec intent all along — D-026 makes the code match the comment. If a future refactor regresses, the comment is the canonical guide.

---

## D-027 — Validator long-run floor is within-phase-aware (completes the D-026 canonical contract)

- **Date:** 2026-05-21 (commit `d1fd0745`; extends D-026 — D-026 made `week-builder.ts:864` canonical; D-027 makes the post-build validator floor follow the same lerp instead of bumping the realized output up to peak-of-phase)
- **Decision:** `effectiveLongRunFloorMiles` (`validate-training-floors.ts:361`) accepts optional `weekInPhase` and `rampWeeks` parameters. When BOTH are provided, the spec floor routes through `longRunMilesForWeek` (the same canonical lerp the week-builder uses per D-026); when either is omitted, falls back to `longRunFloorMiles` (peak-of-phase) for backward compat. `EvaluateLongDayFloorsOpts` and `EnforceLongDayFloorsOpts` gain optional `phaseBlocks: PhaseBlock[]`; both validator loops compute `weekInPhase` per week (via an inlined `weekInPhaseInline` helper that mirrors `week-builder.ts:weekInPhaseForTimeline` — inlined to avoid the circular import) and thread through. `index.ts` passes `phaseBlocks: blocks` into both opts objects; the rebuild loop reassigns `blocks` after each `tightenPhaseBlocksForFloorRebuild` so `longDayFloorOpts.phaseBlocks` is refreshed at each iteration. History-aware `recentLongestRunMi × 0.5` path is **unchanged** — the protective layer for experienced athletes is preserved.
- **Alternatives considered / rejected:**
  - **Move `weekInPhaseForTimeline` to `phase-structure.ts`** (a non-circular module) and import normally from both consumers. Rejected for D-027 scope — the export site change has wider blast radius (week-builder + all test files referencing the function). Inlined mirror is contained and the docstring captures the duplication intent.
  - **Compute `weekInPhase` from the weeks array iteratively** (forward-pass counter, reset on phase change, skip recovery). Rejected — `GeneratedWeek` doesn't carry `primaryGoalId`, so disambiguating phase boundaries across multi-goal plans (e.g. goal-A base → goal-B base) requires `PhaseBlock` lookup anyway.
  - **Make `weekInPhase` mandatory in `effectiveLongRunFloorMiles`.** Rejected — would force every existing test that consumes the function to update; backward-compat fallback preserves the 15+ existing `long-day-volume-floors.test.ts` assertions untouched.
  - **Lower the validator's peak-of-phase floor** so the lerp's lower-wip values aren't bumped. Rejected — peak-of-phase is the correct WARNING THRESHOLD for high-recent athletes (recent=42mi → floor 11mi, capped at build); making the validator's *threshold* within-phase-aware is the right targeted fix, not lowering it globally.
  - **Skip enforcement for base/build/race_specific weeks entirely** (let the week-builder lerp drive directly; validator only enforces rebuild/taper/recovery). Rejected — loses the history-aware bump path that protects high-recent-volume athletes.
  - **Extend the same fix to `effectiveLongRideFloorHours`** in D-027 scope. Rejected — cycling within-phase lerp doesn't exist yet (CYCLING-PROTOCOL Phase 1 work). The bike-side parity fix lands when Phase 1 ships `longRideHoursForWeek`.
- **Why:** Bundle B (D-026) made `week-builder.ts:864` canonical — the lerp emits 8.5mi for 70.3 base wip=1. But the post-build `enforceLongDayFloors` immediately bumped that 8.5mi UP to 10mi because `effectiveLongRunFloorMiles('70.3', 'base', 0)` returned `longRunFloorMiles('70.3', 'base') = 10`. Two `Math.max` floors at two different layers; D-026 fixed the first; D-027 fixes the second. Plan #78 audit showed flat 10mi across base wks 1-6 in production even after Bundle B deploy — that was D-027 territory, not Bundle B incomplete deploy.
- **Tradeoff accepted:**
  - **Two parameters added to a load-bearing public function** (`effectiveLongRunFloorMiles`). Optional — every existing caller works unchanged. Future callers that want within-phase-aware behavior must pass both `weekInPhase` AND `rampWeeks` (the latter is trivially derived via `rampWeeksForPhase(phase)`).
  - **Inlined `weekInPhaseInline` helper duplicates `week-builder.ts:weekInPhaseForTimeline`.** Net +13 lines of mirror code. Required to break the circular import (`week-builder.ts` imports from this file). Docstring captures the constraint; future refactor that moves `weekInPhaseForTimeline` to `phase-structure.ts` can eliminate the dupe.
  - **`longDayFloorOpts.phaseBlocks` reassignment in the rebuild loop** is a `const`-object-mutable-field pattern. The opts object reference is const; the `phaseBlocks` field is reassigned each iteration after `tightenPhaseBlocksForFloorRebuild`. Documented inline.
  - **High-budget athletes lose ~1-2mi of early-phase long-run volume** that D-026 deploy already shipped but the validator was silently restoring. Now the §4.5 contract fully delivered.
  - **Production plans frozen JSON; behavior is opt-in via next regenerate.** Standard ship posture.
- **Footgun (don't re-litigate):**
  - **`weekInPhase` AND `rampWeeks` are both required to engage the within-phase-aware path.** Passing one without the other falls back to peak-of-phase. The optional-parameter design is deliberate — callers that don't have phase block context (e.g. test fixtures constructing a single `GeneratedWeek`) get the legacy behavior.
  - **`weekInPhaseInline` is a mirror of `week-builder.ts:weekInPhaseForTimeline`.** Any change to the canonical (week-builder) function MUST be mirrored here. Documented in the helper's docstring; the two functions must stay in lockstep until a future refactor consolidates them in `phase-structure.ts`.
  - **`longDayFloorOpts.phaseBlocks` must be REFRESHED after every `tightenPhaseBlocksForFloorRebuild`** reassignment. The current code refreshes at both rebuild call sites (`index.ts:260` normal pass, `:267` deep pass). Adding new rebuild call sites without the refresh would cause the enforcer to use stale phaseBlocks.
  - **Cycling parity is pending** — `effectiveLongRideFloorHours` still uses peak-of-phase `longRideFloorHours`. When CYCLING-PROTOCOL Phase 1 ships `longRideHoursForWeek` (the bike lerp helper), apply the same fix-shape there: add optional `weekInPhase` + `rampWeeks` parameters, route through the new helper when provided. Same fallback semantics. Same `phaseBlocks` threading. Same circular-import constraint (likely needs the same inlined mirror or a `phase-structure.ts` consolidation).
  - **Three-layer Plan #78 closure now fully end-to-end:** D-022 (Ticket-B cap) + D-024 (swim_fitness clamp) + D-025 (type substitution) — the swim axes — composed with **D-026 (week-builder canonical) + D-027 (validator within-phase-aware)** on the run axis. All five layers required.
- **Decision:** D-027 (companion to D-026; both close the §4.5 LOCKED progression end-to-end).

---

## D-028 — Cycling arc Phase 1: within-phase volume ramp + validator parity (bundled, no production observation drove the split that ran arc needed)

- **Date:** 2026-05-21 (commit `61faf828`; CYCLING-PROTOCOL Phase 1 implementation; ships `longRideHoursForWeek` lerp + rep ramps for sweet spot / threshold / VO2max + validator within-phase-aware floor, in a single bundled slice — parallel to the run-arc Phase 1 + Bundle C combo (`60c23de2` + `d1fd0745`, D-026 + D-027) but bundled because cycling has no Plan-#78-equivalent production observation that drove the run-side split).
- **Decision:** Cycling session generation gains a full within-phase ramp matching the run-side §4.5 contract. Three layers shipped together:
  1. **Long-ride lerp source** (`science.ts:longRideHoursForWeek`): mirrors `longRunMilesForWeek` exactly. `LONG_RIDE_RAMP_ENDPOINTS` table: base 0.65→0.75, build 0.75→0.85, race_specific 0.85→1.00 (per CYCLING-PROTOCOL §4.5 LOCKED 2026-05-21). Peak target reuses `expectedBikeDurationHours` so a 70.3 in race_specific lands at 3.0hr, a full IM at 6.0hr. Rounded to 0.25hr precision (matches `longRideFloorHours` granularity). Non-ramp phases (rebuild/taper/recovery) delegate to `longRideFloorHours` — same delegation semantics as `longRunMilesForWeek`.
  2. **Rep-count ramps** (`session-factory.ts:groupRideQualityBikeSession`): signature gains `weekInPhase: number`. Sweet spot (base) + threshold (build) use the slow-ramp formula `clamp(2, 4, 2 + floor((wip-1)/2))` — 2 reps for wips 1-2, 3 reps for wips 3-4, 4 reps for wips 5+. VO2max (race_specific) uses the faster formula `clamp(3, 6, 3 + (wip-1))` — 3→4→5→6 across the four ramp weeks. The 5-min duration on VO2 reps stays hardcoded in the name + token template (`Bike VO2max — ${reps}×5 min` / `bike_vo2_${reps}x5min_r3min`); CYCLING-PROTOCOL §5.6 locks duration at 5 min, only `reps` ramps.
  3. **Validator parity** (`validate-training-floors.ts:effectiveLongRideFloorHours`): gains optional `weekInPhase?: number, rampWeeks?: number` parameters. When BOTH provided, spec floor routes through `longRideHoursForWeek`. When either omitted, falls back to `longRideFloorHours` (peak-of-phase) for backward compat. Both call sites — soft `evaluateLongDayVolumeFloors` and hard `enforceLongDayFloors` — thread the same `wipSoft`/`rwSoft` / `wipHard`/`rwHard` they already compute for the run-side D-027 path; cycling reuses the existing `opts.phaseBlocks` plumbing without changes. The `weekInPhaseInline` mirror helper introduced for D-027 services this cycling path with zero additional duplication.
  - **Wiring:** `week-builder.ts` exports a sport-agnostic `bikeWeekInPhase` (aliased to the existing `runWeekInPhase` — same calendar-week-based `weekInPhaseForTimeline` output). Long-ride hours derivation at `:912-940` now routes through `longRideHoursForWeek` for base/build/race_specific (non-recovery), with existing TSS caps (race-week 1.0hr ceiling, hasTri cap, return-from-recovery 0.85× compress, recovery-rebuild-wk1 caps) applied AFTER the lerp via `Math.min`. Rebuild/taper/recovery keep the legacy TSS-derived path. Single `groupRideQualityBikeSession` call site at `:1414` now passes `bikeWeekInPhase`.
- **Alternatives considered / rejected:**
  - **Split run-style into Phase 1 (lerp) + Bundle C-equivalent (validator).** Rejected — the run-side split was driven by Plan #78's production observation that the validator was silently restoring the lerp's lower-wip values to peak-of-phase even after Bundle B fixed the week-builder. Cycling has no comparable observation; bundling is cleaner (one D-NNN, one deploy, one regression test file). The validator-parity-only path was footgunned explicitly in D-027's "Cycling parity is pending" entry so this bundle was pre-decided.
  - **Faster sweet-spot ramp** (mirror VO2 formula: `clamp(2, 4, 2 + (wip-1))` × 15 → 2→3→4→4 across base weeks 1-3). Rejected — sweet spot is not supposed to spike early; longer plateau at 3 reps fits the base-phase progressive-build coaching intent. Slower ramp matches threshold's outer shape (both are sub-VO2 work).
  - **Make `weekInPhase` mandatory in `groupRideQualityBikeSession`.** Rejected — no current ad-hoc callers, but mandatory makes the function harder to use from tests that don't carry a `phaseBlocks` context. The single production call site already threads the value; the parameter is fully load-bearing.
  - **Move `weekInPhaseForTimeline` to `phase-structure.ts`** to eliminate the `weekInPhaseInline` mirror that D-027 introduced and D-028 now also depends on. Deferred — same blast-radius argument as D-027: the consolidation is its own ticket; the mirror is contained and documented in both consumer files.
  - **Distinct `bikeRampWeeks` from `runRampWeeks`.** Rejected — both sports share the same `rampWeeksForPhase(phase)` helper (base 6, build 4, race_specific 4) per CYCLING-PROTOCOL §10.4 + RUN-PROTOCOL §4.5. If they ever diverge, the helper splits at that point.
- **Why:** CYCLING-PROTOCOL.md Phase 0 spec (commit `42b2d2c3`, 2026-05-21) documented the within-phase ramp endpoints (§4.5 LOCKED) and rep formulas (§5.6, §10.4) but the code emitted flat sessions every week within each phase: long_ride flat at peak-of-phase share of TSS budget, sweet spot flat 2×15 every base week, threshold flat 3×20 every build week, VO2max flat 6×5 every race-specific week. The legitimate phase-distinction was preserved (base ≠ build ≠ RS) but the *within-phase ramp* — which provides the progressive overload signal — was structurally absent. Cycling parallel to the swim Phase 1 + run Phase 1 + Bundle C bundle. Phase 1 bundling matches what the run-side did NOT do; cycling can do it because we ship pre-observation rather than post-observation.
- **Tradeoff accepted:**
  - **Existing TSS caps still bind in some athlete configurations.** The lerp is canonical-not-floor: if the athlete's weekly TSS budget can't sustain the spec ride (e.g. an under-9hr/wk 70.3 athlete in race-specific with the lerp emitting 3.0hr), the `hasTri` cap brings it back down. This is the right semantics — same as the run-side where TSS budget can cap a long-run lerp below the spec value. The lerp guarantees the *spec*, not the *actual*; cap interaction is preserved.
  - **No history-aware path for cycling.** `effectiveLongRideFloorHours` accepts `recentLongestRideHr` and computes `× 0.5` as a min-floor against history (parallel to the run side), but cycling has no equivalent of the `× 0.5` rationale — the bike-leg lerp uses calendar phase not athlete history. Pre-existing behavior preserved; this is not a regression Phase 1 introduces.
  - **Production plans frozen JSON; behavior is opt-in via next regenerate.** Standard ship posture, same as D-023 / D-024 / D-025 / D-026 / D-027.
  - **Bundled commit blast radius.** 4 production files + 1 new test file changed; 285 tests in `generate-combined-plan/` (was 270 — +15 new bike-volume-ramp pins). The bundled-not-split posture means a Phase 1 regression discovered post-deploy bisects to one commit, not two — slight ergonomic loss against the gain of fewer commits in flight.
- **Footgun (don't re-litigate):**
  - **`weekInPhase` AND `rampWeeks` are both required to engage validator within-phase-aware behavior.** Same constraint as D-027 for the run side: passing one without the other falls back to peak-of-phase. Test fixtures that construct a single `GeneratedWeek` without `phaseBlocks` see legacy 3-arg behavior — locked by the "no-regression" test in `bike-volume-ramp.test.ts`.
  - **`bikeWeekInPhase` aliases `runWeekInPhase` in week-builder.** Calendar week is sport-agnostic — same `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` output. If a future change introduces sport-specific phase boundaries, this aliasing breaks; the alias is a deliberate "if they ever diverge, split here" marker rather than a permanent name.
  - **Caps apply on TOP of the lerp, not under it.** Existing race-week 1.0hr ceiling and `hasTri` cap remain unchanged; they `Math.min` against the lerp output. Don't "fix" the caps to be floor-only — they're upper bounds for TSS-budget protection, not lower bounds.
  - **VO2 5-min duration is hardcoded in the function body.** Per CYCLING-PROTOCOL §5.6, only `reps` ramps; duration locked. Don't parameterize duration without updating the spec.
  - **CYCLING-PROTOCOL Phase 2+** — race-spec brick-bike race-pace closing block (§4.4) + `bikeOpeners` race-week-only gating (§9.1 footgun) + `limiter_sport='bike'` intensity dial (Phase 4, deferred). Phase 1 is the volume axis; Phase 2 is the intensity/structure axis. Same phased pattern as the swim and run arcs.
- **Decision:** D-028 (cycling arc Phase 1 bundle; mirrors the run-side Phase 1 + Bundle C combo into a single slice; the four-axes Plan-#78-equivalent closure for cycling is now scaffolded — Phase 2 will close the intensity/structure axis).

---

## D-029 — Swim arc 2026-05-22: tier rest + within-phase rest lerp + fins/paddles split + drill-equipment map + sculling hard-gate + per-step effort-tier export propagation

- **Date:** 2026-05-22 (spec commit `c1492b15`; Slice 1 `92af2072`; Slice 2 `fc517e12`; Slice 3 `130de4b2`; arc-wide research-backed revision of §5.2 / §6 / §8 — five fixes shipped, one (Q-020 ankle band) deferred. Coaching sources: Better Triathlete, Organic Coaching, MyMottiv, Tri Training Harder, 220 Triathlon, Triathlete, Swim Smooth.)
- **Decision:** Five distinct fixes implemented across three slices, all hardening §5.2 (CSS Aerobic) + §6 (drill philosophy) + §8 (equipment) per research-backed coaching consensus. Each slice was scoped independently and tested independently; the arc closes Plan #78-equivalent gaps on the swim-rest, equipment-surfacing, and drill-selection axes.
  - **Fix 3 — Tier-adjusted CSS Aerobic rest** (Slice 1, `92af2072`): replaces flat 15s rest with per-tier START values. Beginner 25s (per §5.2.1 START; Slice 2 lerps to 20s), Intermediate 15s, Advanced 15s (matches intermediate at START; Slice 2 lerps to 12s/10s). Token grammar varies — `swim_aerobic_css_*x100yd_r25` for beginners — not a fixed `_r15`. Race-Specific Aerobic substitution (`raceSupport=true`) stays at 15s (Slice 1 scope decision; Slice 2 lerp does NOT route through that branch).
  - **Fix 4 — Within-phase CSS rest-interval lerp** (Slice 2, `fc517e12`): `cssRestSecByPhaseWeek(tier, phase, weekInPhase, rampWeeks)` helper. Rest tightens across the phase ramp per 220 Triathlon CSS progression. Endpoints: beginner base 25→20 (6-wk ramp), intermediate/advanced base 15→12 (6-wk), intermediate/advanced build 12→10 (4-wk), intermediate/advanced race_spec 10 flat. Same `phaseProgress` mechanism as the run-arc §4.5 volume ramp (D-026 / D-027) + swim-arc §4.1 volume ramp (c1c94cec); same ADR-0002 footgun (NEVER `weekInBlock` — always 1; MUST be `weekInPhaseForTimeline`). Trajectory is continuous: beginner base PEAK=20 == build START=20; intermediate base PEAK=12 == build START=12; intermediate build PEAK=10 == race-spec=10 — no discontinuities across phase boundaries. Validator-floor implication: swim rest is a within-session prescription, NOT a weekly-volume floor; no D-027-style two-layer Math.max trap; single-layer fix only.
  - **Per-step effort-tier export propagation** (Slice 1 bundle, `92af2072`): `materialize-plan: swimTokenIntensity` helper maps each swim token kind to `easy` / `moderate` / `hard`. CSS Aerobic + Pull → moderate; Threshold → hard; plain aerobic + Kick + Drill + WU/CD → easy. Unrecognized tokens fall back to easy (conservative — under-prescribing is safer than over-prescribing). Each swim step gains an `intensity` field. Garmin export (`send-workout-to-garmin`) prefers `st.intensity` for effortLabel — athletes see "moderate" / "hard" / "easy" on the watch face, not "css" / "threshold". Form Goggles narrator (`src/utils/formGogglesSwimScript.ts`) prefers `st.intensity`. Both surfaces fall back to legacy label regex for steps without the new field (back-compat with pre-arc materialized plans).
  - **Fix 1 — Fins/paddles split for beginners** (Slice 3, `130de4b2`): fins are SURFACED as `recommended:fins` for beginner Technique Aerobic + beginner CSS Aerobic when the athlete owns fins (body-position aid lets the learner focus on arm mechanics without fighting drift). Paddles remain SUPPRESSED for beginners — exactly opposite the fins rule (paddles amplify catch error and shoulder load on an undeveloped stroke). Intermediate / advanced see nothing new — they don't need the body-position aid; §8.4 optional surfacing (snorkel / buoy / paddles) covers their gear story. §5.5 Pull-Focused beginner explicitly does NOT surface fins (pull-focused is leg-isolated by design); §5.11 Recovery stays gear-free for all tiers (movement-quality intent).
  - **Fix 2 — Drill-level equipment recommendations (§6.6)** (Slice 3, `130de4b2`): DRILL_EQUIPMENT_MAP gains `recommended` field. Fingertip Drag → recommended:fins (all tiers); Fist Drill → recommended:fins (all tiers; the prior snorkel-optional was deliberately dropped per §6.6 — the table prescribes fins only); 6-3-6 → recommended:fins for beginners only (tier-gated dispatch via `SWIM_DRILL_RECOMMENDED_FINS_BEGINNER_ONLY` set). Catch-Up / Single-Arm / Sculling / Sighting / Zipper / Kick-on-Side / Pull-with-Buoy unchanged. `swimDrillEquipmentFromTokens` accepts optional `athleteFitness` for tier-gated rules.
  - **NEW `recommended:*` tag class** (Slice 3, `130de4b2`): parallel to `optional:*` with distinct semantics ("this helps, grab it" vs "fine either way"). Pool gear line renders Required / Recommended / Optional as three ordered sections. Dedupe priority: required > recommended > optional. `materialize-plan: inferSwimEquipmentPack` recognizes `recommended:*` tags and merges them into `suggestedOptional` on the chip surface (space-constrained binary view); the prose preserves the distinction.
  - **Sculling hard-gate** (Slice 3, `130de4b2`): sculling is HARD-banned from the beginner inset — previously soft foundation-bias only, which let sculling leak through when foundation drills didn't fit. Now post-filtered from `phaseDrillCandidates` output when `athleteFitness === 'beginner'`. Intermediate / advanced still see sculling in their inset (anti-regression pin tests confirm).
  - **Deferred — Q-020 ankle band** (Slice 4, NOT shipped): pull buoy + ankle band as beginner body-position teaching tool documented in §6.4 prose but not engine-surfaced. Engine enum extension blocked on a wizard scope decision (separate ankle-band chip vs grouped with Pull buoy). Filed as Q-020 in OPEN-QUESTIONS.md.
- **Alternatives considered / rejected:**
  - **Fold CSS terminology strip into this arc.** Rejected — user parked it as a separate decision. The strip is a clean copy change with its own coaching implications; mixing it with the research-backed §5.2 / §6 / §8 revision conflates two independent decisions. Reopen later.
  - **Make 6-3-6 fins recommendation tier-agnostic** (all tiers when owned). Rejected per Slice 3 spec — research suggests beginners specifically benefit from the body-position aid; intermediate+ rotation work doesn't need it. Static `SWIM_DRILL_RECOMMENDED_FINS_BEGINNER_ONLY` set is the simplest gate.
  - **Allow Sculling for intermediate beginners** (some catch fluency). Rejected — the hard gate is intentional per the user: "A beginner has no business in a sculling drill." Soft foundation-bias was insufficient; the post-filter at `phaseDrillCandidates` output is the right tier control.
  - **Route Slice 2 lerp through the race-spec branch** (`raceSupport=true`). Rejected — per Slice 1 scope decision, the race-spec branch keeps its inline 15s string. Slice 2's lerp routes only the non-race-spec CSS Aerobic main set. Revisit if §5.2.1 ever extends to race-spec substitution copy.
  - **Add ankle band to the equipment enum in this arc.** Rejected — bigger blast radius than the rest of the revision (wizard + normalization + drill-token map + chip surface) and depends on a wizard scope decision. Filed as Q-020 for a separate slice.
  - **Bundle Slices 1-3 into one commit.** Rejected — slicing keeps the bisect surface small and each test pass scoped. Three commits + three deploys cost slightly more but each is independently audit-able.
  - **Use `intensity:` field on each step vs replacing the `label:` field outright.** Chose the additive approach (new field, fall back to label for legacy steps) — preserves all session-type context for downstream consumers that care about it, and avoids breaking the chip-renderer / coach-engine assumptions about step labels.
- **Why:** Multi-fix research-backed revision driven by user-supplied coaching sources (Better Triathlete, Organic Coaching, MyMottiv, Tri Training Harder, 220 Triathlon, Triathlete, Swim Smooth). Pre-arc state: CSS Aerobic rest was flat 15s for every tier across every week (no adaptive progression); fins were suppressed for beginners exactly like paddles (despite serving opposite purposes — fins AID stroke acquisition, paddles AMPLIFY catch error); drill-level fins recommendations weren't surfaced at all; sculling could leak into the beginner inset despite the drill teaching nothing without baseline catch fluency; per-step Garmin / Form Goggles exports labeled steps with internal session-type tags (`css`, `threshold`) instead of athlete-facing effort tiers (`moderate`, `hard`). All five gaps closed in one arc.
- **Tradeoff accepted:**
  - **Recommended-tag bundle into Optional on the chip surface.** The prose carries the recommended/optional distinction; the chip is space-constrained and binary. Athlete sees "Fins" in optional gear on the calendar drawer; clicks through to the prose for the "Recommended" framing. Lossy at the chip level by design.
  - **Per-step intensity propagation defaults to 'easy' for unrecognized tokens.** Conservative — a step labeled 'easy' when intent was harder is safer than the opposite (no overprescription).
  - **Single-layer fix for the within-phase rest lerp** (no validator-floor parity). Swim rest is a within-session prescription, not a weekly-volume floor; no D-027-style two-layer Math.max trap applies. If a future audit reveals a downstream layer that flattens rest back to peak-of-phase, file a follow-up.
  - **Effort-tier mapping is keyed on token-kind, not phase/tier.** A single `swim_aerobic_css_*` token always maps to 'moderate', regardless of athlete tier or week — the per-step Garmin label doesn't differentiate "moderate-for-beginner" vs "moderate-for-advanced". Acceptable today (the existing pace targets + drill copy carry tier context); revisit if exports need tier-aware step labels.
  - **`recommended:*` tag class adds a third gear-channel** (req / optional / recommended). Net +1 channel; renderers / parsers must handle three. Doc-locked in §8.4 + §6.6 + materialize-plan + send-workout-to-garmin + formGogglesSwimScript. Future gear-classification changes have to update all four surfaces.
  - **Sculling hard-gate is a hard tier filter, not a soft penalty.** Intentional — soft foundation-bias was insufficient. If a future spec change wants to expose sculling to advanced-beginner-near-intermediate athletes, the filter has to move (not just adjust the bias score).
  - **`recommended:fins` for beginners only.** The user's coaching judgment is that intermediate / advanced athletes don't need the body-position aid. If a future audit reveals advanced athletes asking for fins explicitly, surface as `optional:fins` (existing channel), not `recommended:fins` (the recommendation is a tier signal).
  - **Production plans frozen JSON; behavior is opt-in via next regenerate.** Standard ship posture (D-022 / D-024 / D-025 / D-026 / D-027 / D-028).
- **Footgun (don't re-litigate):**
  - **`weekInPhase` AND `rampWeeks` must both be threaded for the §5.2.1 lerp to engage.** Same constraint as D-027 (run side). Test fixtures constructing isolated cssAerobicSwim calls without these get the Slice 1 tier-START fallback. Pin tests assert this back-compat.
  - **Race-spec substitution (`raceSupport=true`) bypasses BOTH the Slice 1 tier helper AND the Slice 2 lerp.** Inline 15s string in the raceSupport main-set is the source of truth. Slice 1 scope guard test pins this — if a future change wants race-spec phase progression to lerp too, route it explicitly; don't fall through the css_aerobic branch.
  - **`recommended:*` tag class is NEW.** Any consumer that reads tags (week-optimizer, validators, render surfaces) must handle the three-class taxonomy (req / optional / recommended). Currently handled in: `appendPoolGearLine` / `buildSwimGearLine` (prose); `materialize-plan: inferSwimEquipmentPack` (chip surface, merges into optional bundle); render path on the client is unchanged (consumes the same chip surface). NEW gear-surfacing rules must touch the same matrix.
  - **`swimDrillEquipmentFromTokens` token suffix regex strip** — pre-fix it didn't strip trailing `_r\d+` or `_<gear>` markers; lookup failed for tokens like `swim_drills_3x100yd_fingertipdrag_r15`. Bundled fix into Slice 3 commit `130de4b2`. Anti-regression: if you add new drill-token formats, mirror the strip pattern (same shape as `swimDrillStrokePhase`).
  - **Sculling hard-gate is post-filter on `phaseDrillCandidates`, not a separate phase pool.** If a future change moves the gate to phase-pool selection, ensure intermediate / advanced still get sculling in their inset (the anti-regression test exercises both paths).
  - **6-3-6 tier-gated fins recommendation lives in `SWIM_DRILL_RECOMMENDED_FINS_BEGINNER_ONLY` set** (single source of truth). If more drills join the tier-gated list (e.g. catchup → fins for beginners), add them to that set; do NOT add tier conditionals inline at every call site.
  - **Per-step intensity falls back to 'easy' for unknown tokens.** If a new swim token kind is added (e.g. a hypothetical `swim_lactate_*`), explicitly add it to `swimTokenIntensity` so it doesn't silently emit 'easy'.
  - **§5.2.1 lerp endpoints are LOCKED 2026-05-22.** Coefficients chosen deliberately per the 220 Triathlon CSS progression; changing them requires a new D-NNN with research justification.
  - **Q-020 (ankle band) blocks on a wizard scope decision.** Don't ship the engine surface piecemeal — the prose value in §6.4 stays unreferenced until the enum extension lands. If a future contributor sees the §6.4 mention and "fixes" the missing engine surface, they'll have to make the wizard scope decision first.
- **Decision:** D-029 (swim arc 2026-05-22; five research-backed fixes shipped across three slices; one fix deferred as Q-020 — ankle band — pending wizard scope decision; CSS terminology strip remains separately parked per user direction).

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
