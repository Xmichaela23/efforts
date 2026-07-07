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

## D-030 — Swim arc 2026-05-22 (CSS-kill + per-step drill equipment): athlete-facing vocabulary is easy / moderate / hard; internal session-type words never reach athlete copy

- **Date:** 2026-05-22 (spec `3833024f`; Step 2 `22642fa4`; Steps 3+4 `9d178ca9`. Companion to D-029. The user un-parked the previously-deferred CSS-terminology strip and added per-step drill-equipment surfacing to the same arc.)
- **Decision:** Internal session-type identifiers — `css_aerobic`, `threshold`, `aerobic`, `pull`, `kick`, the word **"CSS"** itself, "Critical Swim Speed" — are banned from every athlete-facing surface (session names, descriptions, trade-off messages, wizard hints, Garmin step labels, Form Goggles narrator, zone strings). Athlete-facing copy uses the three-tier vocabulary defined in SWIM-PROTOCOL §0.5 (LOCKED 2026-05-22): **easy / moderate / hard**. Internal identifiers stay untouched in code — function names (`cssAerobicSwim`), discriminators (`css_aerobic` session kind), token grammar keys (`swim_aerobic_css_*x100yd_r*`), tags (`'css_aerobic'`), athlete-state fields (`swim_threshold_pace`), helper names (`cssRestSecByTier`, `cssRestSecByPhaseWeek`), code comments.
  - **SWIM-PROTOCOL.md §0.5 — three-tier vocabulary** (spec commit `3833024f`): canonical mapping table per session type. easy = Z1–Z2 aerobic; moderate = Z3 sustainable race-effort rhythm + CSS-anchored work; hard = Z4–Z5 threshold + speed work. Anti-regression rule lists every athlete-facing surface that must stay free of internal names. Wizard implication: §7.5 calibration prompt points at the per-100yd pace baseline (the user-facing input), not at a "CSS test" (the engineering term).
  - **Step 2 — Athlete-facing strings stripped** (commit `22642fa4`):
    - `cssAerobicSwim` session name: `CSS Aerobic Swim — N yd` → `Moderate Aerobic Swim — N yd`.
    - `cssAerobicSwim` description: `comfortable CSS pace` → `moderate effort — sustainable and conversational`; `high-volume CSS blocks` → `high-volume aerobic blocks`.
    - `cssAerobicSwim` zone string: `Z3 CSS aerobic` → `Z3 moderate aerobic`.
    - `swimCssFallbackCue` text: `If you don't have a CSS pace yet` → `If you don't have a 100yd pace baseline yet`.
    - `no_swim_threshold_pace` trade-off template: old framing pointed at "CSS pace targets" + "200yd time trial"; new framing points at the athlete-facing 100yd pace baseline field and the next plan regenerate.
    - `ArcSetupWizard.tsx` §7.5 learning-swimmer hint: `No CSS test? ... starting CSS pace` → `No swim pace baseline? ... starting 100yd pace`.
    - `src/utils/swimPlanTokens.ts` aerobic-css display string: `CSS Nxdist` → `Nxdist` (the renderer at L258 prefixes "Aerobic " separately).
    - `src/utils/formGogglesSwimScript.ts` narrator: dropped the "moderate CSS pace" / "moderate aerobic" branches in favor of tier-word output via the existing intensity-preference path.
  - **Step 3 — Export step labels in tier vocabulary** (commit `9d178ca9`):
    - `materialize-plan: swimTokenIntensity(token, sessionTags?)` refactored — now session-tag-aware. Step-kind rules (WU/CD/drill → easy) always win. Token-keyed work-step rules cover css / threshold tokens deterministically. Plain aerobic / pull / kick tokens consult session tags (`css_aerobic` / `endurance_swim` / `pull_focused` / `kick_focused` / `technique_swim` → moderate; `threshold` / `speed_swim` / `race_specific_swim` / `time_trial` / `race_pace_sustained` → hard; `recovery_swim` → easy). 1-arg back-compat call path preserved.
    - `materialize-plan` step.label renamed from session-type identifiers (`'css'` / `'threshold'` / `'aerobic'` / `'pull'` / `'kick'`) to the tier word — same value as `step.intensity`. Closes the leak from any consumer that reads `label` without checking `intensity`.
    - `send-workout-to-garmin` already preferred `st.intensity` for swim effortLabel (Slice 1 in D-029). With label rename, the fallback path also surfaces tier words. Double-safe.
    - `formGogglesSwimScript: describeSwimStep` already preferred `intensity`; regex fallback updated to drop "CSS" branch.
  - **Step 4 — Per-step drill equipment hint** (commit `9d178ca9`):
    - `materialize-plan` drill push sites compute a `drillLabelWithGear` helper. Looks up §6.6 recommended equipment via `swimDrillEquipmentFromTokens([token])`, filters against athlete-owned swim gear (`baselines.equipment.swimming` normalized once per row), appends a parenthetical hint to the drill step's label.
    - Format: `Drill — Fingertip Drag (fins)` when athlete owns fins; `Drill — Fingertip Drag` otherwise. Lowercase gear inside parens (Garmin-friendly + Form Goggles-consistent).
    - Applies to BOTH drill token shapes: `swim_drill_<name>_*` and `swim_drills_*x*yd_<name>`.
    - Required equipment still flows through the separate `step.equipment` field (attachSwimMeta in Garmin export; formatEquipment in Form Goggles narrator). Hint is purely recommended-side.
    - Tier-gated 616 → fins beginner-only is NOT surfaced at drill-label level (the helper is called tier-agnostically). The SESSION-level `recommended:fins` tag from D-029 Slice 3 carries the tier context for the Pool gear line; this complement is intentional.
- **Alternatives considered / rejected:**
  - **Keep "CSS" in athlete copy and just add a tier-word prefix.** Rejected — the user explicitly directed kill (not coexist). "CSS" is engineering jargon; athletes shouldn't need to learn it. The mechanism stays (internal `swim_threshold_pace`); the surface vocabulary shifts to plain effort words.
  - **Keep step.label as the session-type identifier and add a separate `tier_label` field.** Rejected — would require every consumer to know about both fields. Renaming label to be the tier value is cleaner; consumers reading label get the right thing automatically.
  - **Render Race-Specific Aerobic at "hard" tier in step labels** (matches §0.5 mapping table). Rejected — Race-Spec Aerobic is dispatched through `cssAerobicSwim` with `raceSupport=true` and uses the `swim_aerobic_css_*x100yd_r*` token shape. Token-keyed rule fires first (→ moderate); session tag `race_specific_swim` would override to hard, but the dispatcher's existing token-priority precedence keeps it moderate. The §5.4 physiology is Z3 race-rhythm density, not threshold Z4. Documented in pin test; the surface label is intentionally "moderate" while the description prose carries the race-specific framing.
  - **Surface optional gear (e.g. snorkel on catchup) in the drill-step label hint.** Rejected — user instruction said "recommended equipment" only. Optional gear stays in the Pool gear line at the session level (Slice 3 of D-029). Drill labels are tighter.
  - **Tier-gate the 616 → fins beginner-only rule at the drill-label level too.** Rejected — calling `swimDrillEquipmentFromTokens` with the athlete's tier would require deriving tier from row context (not on the row directly). The session-level `recommended:fins` tag already handles tier; drill labels stay tier-agnostic to keep the helper simple. If a future audit reveals 616 leaking fins-hint for intermediate/advanced beginners-near-intermediate athletes, the fix shape is a tier-gate in the helper.
  - **Bundle all three steps + spec into one commit.** Rejected — the user explicitly directed separate commits per step. Spec + Step 2 split cleanly across different files; Step 3 + Step 4 had to bundle because both modify materialize-plan's `expandTokensForRow` flow with tightly-coupled changes (intensity refactor + label rename + drill-label helper all share the same row context). Bundling 3+4 is the right judgment call to avoid an intermediate broken state.
- **Why:** User feedback on the swim wizard: "should I still see ... 'No CSS test?'" The CSS-strip was previously parked as a separate decision (after the user added §5.2.1 / §6.6 / §8.4 research-backed fixes in D-029). The user un-parked it and extended scope to include per-step drill equipment surfacing in exports. The strip kills jargon that athletes shouldn't have to learn; the drill-equipment hint surfaces gear context in the same way Garmin / Form Goggles surface other prescriptions — at the per-step granularity athletes consume during the actual session.
- **Tradeoff accepted:**
  - **Two-source-of-truth for step intensity** — `step.label` AND `step.intensity` now both carry the tier word. Slight redundancy. Trade for: any consumer reading either field gets the right athlete-facing value; no risk of internal-jargon leak through unchecked label paths.
  - **Race-Specific Aerobic step label is "moderate" not "hard"** — token-keyed rule wins for the substitution path. §5.4 physiology supports the call (Z3 race-rhythm); description prose carries the race-specific framing. If athletes find the moderate label undersells the effort, revisit by routing `race_specific_swim` tag to override.
  - **Drill-equipment hint is tier-agnostic** at the label level. Beginner-specific 616 → fins context lives in the session-level `recommended:*` tag from D-029. Two surfaces, two purposes — chip-level / Pool gear line carries tier context, drill-label hint carries per-drill ownership-filtered context.
  - **`swimTokenIntensity` second argument optional for back-compat.** New code should always pass session tags; legacy fixtures without tags fall back to token-only path. Future deprecation candidate.
  - **Step.label semantic shift** — previously a session-type free-form tag (`'css'` / `'threshold'`); now constrained to the tier vocabulary (`'easy'` / `'moderate'` / `'hard'`). Any downstream code that relied on the old session-type values would break (none found via grep audit, but document the contract change).
  - **Production plans frozen JSON; behavior is opt-in via next regenerate.** Standard ship posture.
- **Footgun (don't re-litigate):**
  - **Internal identifiers stay in code.** The `css_aerobic` discriminator, `cssAerobicSwim` function name, `swim_aerobic_css_*` token grammar, `'css_aerobic'` tags — all unchanged. The strip applies to athlete-facing STRINGS, not engineering identifiers. Don't rename the function in a future cleanup; downstream parsers (`materialize-plan: swimDrillEquipmentFromTokens` token regex, etc.) key on the literal `swim_aerobic_css_`.
  - **Wizard prompt mentions "100yd pace" not "CSS test".** Athletes enter a 100yd pace via the TrainingBaselines screen (`performanceNumbers.swimPace100`). The internal `swim_threshold_pace` derives from this at materialize time via `swimSecPer100YdFromArcSwimInputs`. Don't expose the engineering term in the prompt path.
  - **`swimTokenIntensity` session-tag rules apply BELOW the token-keyed rules.** `swim_threshold_*` → hard regardless of session tags; `swim_aerobic_css_*` → moderate regardless. This protects against malformed tag arrays. If a future change needs a session-tag to OVERRIDE a token (e.g. race_specific_swim forces hard on css tokens), the rule order has to flip — currently token wins.
  - **Race-Specific Aerobic step labels read "moderate" via the css-token rule.** Documented + pin-tested. If you want the label to read "hard" for race_specific_swim sessions, you have to route the session-tag rule ABOVE the token rule. Don't do it as a one-line tweak — bake into the spec.
  - **Drill-label equipment hint surfaces ONLY recommended gear** (§6.6 `recommended` field on `DRILL_EQUIPMENT_MAP`). Optional gear (snorkel on catchup, etc.) stays in the session-level Pool gear line, NOT the per-drill step label.
  - **Athlete-owned gear derivation reads `baselines.equipment.swimming`** — the SAME structure session-factory reads at plan generation time. If a future refactor changes the baselines shape, both sides need to be updated.
  - **Step.label is now the tier word, not the session-type identifier.** Any consumer doing label-based session-type detection (none currently — verified via grep) would break. The label field is now constrained to {`easy`, `moderate`, `hard`} for swim work steps, drill names with optional gear parenthetical for drill steps, and the existing WU/CD/recovery values for those step kinds.
  - **§0.5 anti-regression rule is the authoritative surface inventory.** Any new athlete-facing surface (new trade-off message, new chip, new export channel) MUST audit for internal swim jargon before shipping.
- **Decision:** D-030 (CSS-kill + per-step drill equipment; companion to D-029; both arcs together close the swim-vocabulary + research-backed-fixes work for 2026-05-22).

---

## D-031 — Rebuild-mode lerp throttle with peak-of-base floor: canonical-lerp contract gets a documented exception when the rebuild loop runs

- **Date:** 2026-05-22 (commit `0badf064`; amends D-026 / D-028 / D-029. Issue 1 of the user-reported plan-generation failure investigation. Issue 2 — delete-goal idempotent on 404 — shipped in `5ccfdcdc`.)
- **Decision:** The rebuild loop (`tightenPhaseBlocksForFloorRebuild`) now throttles the canonical lerp sources in lockstep with the rest of the budget. The lerps gain an optional `loadThrottle` parameter (default 1.0 preserves all existing D-026 / D-028 / D-029 behavior); when `loadThrottle < 1.0`, the lerp output is multiplied by the throttle and FLOORED at the distance-aware peak-of-base value. The throttle is sourced from `Math.min(1.0, block.tssMultiplier)` for base/build/race_specific phases only (taper/recovery/rebuild phases keep their existing phase-multiplier logic unchanged — they don't compound).
  - **Throttle source.** Per phase rules: `loadThrottle = (phase ∈ {base, build, race_specific}) ? Math.min(1.0, block.tssMultiplier) : 1.0`. For the 3:1 loading pattern (multipliers `[1.00, 1.08, 1.15, 0.65]`), the cap at 1.0 means weeks in normal generation with weekInBlock=2 or 3 get throttle=1.0 (no effect). After `tightenPhaseBlocksForFloorRebuild` × 0.87 per pass, the multipliers shrink below 1.0 for load phases → throttle engages.
  - **Floor source.** Distance-aware peak-of-base for each canonical lerp: `longRunFloorMiles(distance, 'base')` / `longRideFloorHours(distance, 'base')` / `brickRunTargetMiles(distance, 'base')` / `BASE_VS_BUILD_YARD_SCALE × build_START_YDS` per swim anchor (intent-aware). Concrete values: 70.3 → 10mi long-run + 2.25h long-ride + 2.5mi brick-run + focus swim `[1760, 1600, 1440]yd`; full IM → 13.5mi / 4.5h / 5.0mi; Olympic → 5.5mi / 1.25h / 1.5mi; Sprint → 3.0mi / 0.75h / 1.5mi. **Distance-awareness is critical** — a full IM athlete must not be squeezed to 70.3's floor; the spec's per-distance peaks define what counts as a "real" long session for that race.
  - **Removed line.** The previous `week-builder.ts` rebuild-mode floor at the long-run site — `longRunMiles = Math.max(longRunFloorMiles(distance, phase), Math.round(longRunMiles * 0.86))` — was the root cause of the convergence failure. Its floor was peak-of-CURRENT-phase (e.g. 70.3 race_specific → 13mi), which prevented the rebuild loop from shrinking the long-run AT ALL during race_specific weeks. Replaced by the D-031 path where the floor is peak-of-BASE (10mi for 70.3 race_specific), giving the rebuild loop meaningful headroom to throttle while protecting the durability anchor. TSS-share cap in the same block (`FLOOR_REBUILD_LONG_RUN_SHARE_OF_BUDGET`) stays — it's a separate share-of-budget invariant orthogonal to the absolute floor.
  - **Validator parity.** `effectiveLongRunFloorMiles` and `effectiveLongRideFloorHours` gain `loadThrottle` (sixth param). Both soft (`evaluateLongDayVolumeFloors`) and hard (`enforceLongDayFloors`) compute the throttle from `block.tssMultiplier` per week (same source as week-builder) and thread it through. The validator agrees with the throttled builder output — without this parity, the validator would re-bump the throttled long sessions back to peak-of-phase, defeating the rebuild loop.
- **Alternatives considered / rejected:**
  - **Stagger within-phase lerps so they don't all step on the same calendar week.** Rejected — more complex; would require amending the spec (RUN-PROTOCOL §4.5, CYCLING-PROTOCOL §4.5, SWIM §4.1 endpoints) to non-overlap. The throttle path solves the convergence problem WITHOUT spec changes.
  - **Allow Week 9→10 ramp computation to recognize "post-recovery rebound" specially.** Skip the FIRST normal-load week after a recovery against its post-recovery successor. Rejected — weakens the guardrail; legitimately steep ramps after recovery weeks would slip past.
  - **Tighten the 20% WoW limit dynamically based on athlete CTL.** Rejected — the 20% guardrail is a research-backed safety limit; the right fix is to bring the engine within it, not to expand the limit.
  - **Floor at peak-of-current-phase (the prior behavior of the removed line).** Rejected — that's exactly what caused the convergence failure. Peak-of-base is the correct floor: distance-aware, defensible-minimum-only, gives the rebuild loop meaningful traction.
  - **Floor at zero (no minimum during rebuild).** Rejected — would let plans ship with degenerate 4mi long-runs for 70.3 athletes. The user's explicit constraint: "Long sessions must not shrink below a defensible minimum — a 70.3 plan still needs a real long run/ride even when throttled."
  - **Throttle cycling rep counts (sweet spot / threshold / VO2 reps).** Rejected — reps are integer-clamped formulas, different shape than mileage/hours/yards lerps. The throttled long sessions plus already-shrinking non-long sessions cover the budget reduction sufficiently. Confirmed by the e2e convergence test passing in 1 rebuild pass.
  - **Bundle Issue 1 (this fix) and Issue 2 (delete-goal idempotent) into one commit.** Rejected — different surface areas, different bug classes; shipping separately keeps the bisect surface small.
- **Why:** User-reported "Plan generation failed: 'Week 10: weekly raw TSS increased 25.5% vs prior week (limit 20%).'" The investigation traced the failure to D-026 + D-028 + D-029 making long-session miles/hours/yards CANONICAL (not floors) — independent of `block.tssMultiplier`. The 3:1 multiplier sized the budget for non-long sessions but the canonical lerps emitted spec values regardless. When the rebuild loop tightened `tssMultiplier × 0.87` per pass, only the non-long sessions shrank; the long sessions stayed at their spec values. After 12 passes the WoW guardrail still failed because the long-session step from Week N to Week N+1 was constant (lerp-driven, not budget-driven). The rebuild loop couldn't converge. D-031 fixes this by giving the rebuild loop traction on the long sessions while preserving the durability anchor.
- **Tradeoff accepted:**
  - **D-026 / D-028 / D-029 contract amended (not broken).** Normal generation: lerps are canonical, no budget anchoring (the original contract). Rebuild mode: lerps throttle alongside the budget. The amendment is documented + tested + bounded to rebuild mode.
  - **Two-layer floor for the long-day enforcer.** The validator's `effectiveLongRunFloorMiles` peak-cap (`nextPhaseForLongDayFloorCap`) AND the lerp-internal peak-of-base floor both apply. They interact correctly: throttled lerp → peak-of-base floor (D-031) → peakCap check (existing D-027). The composition is order-independent for the cases tested.
  - **Throttle cap at 1.0.** `Math.min(1.0, block.tssMultiplier)` means the 3:1 multipliers `[1.08, 1.15]` are clamped to 1.0 → no throttle effect. This means rebuild passes also implicitly clamp upward steps — the multiplier can shrink BELOW 1.0 across multiple passes, but the lerp never gets a >1.0 amplification from the 3:1 multiplier. This is correct: the lerp's spec value is the maximum.
  - **`loadThrottle = block.tssMultiplier` is a per-week derived value.** Each week's throttle reflects ITS OWN block's multiplier. After a rebuild pass that shrinks all multipliers by 0.87, every base/build/RS week sees throttle < 1.0. The throttle is calendar-week-keyed via `block.tssMultiplier`, not phase-keyed — matches the rebuild loop's per-block shrinkage shape.
  - **Production plans frozen JSON; behavior is opt-in via next regenerate.** Standard ship posture.
  - **Removed line had no test coverage protecting its peak-of-current-phase semantic.** All 796 existing tests passed after removal. Documented inline in week-builder.ts why it was removed (convergence root cause).
- **Footgun (don't re-litigate):**
  - **`loadThrottle` default is 1.0.** All existing callers (D-026 / D-027 / D-028 / D-029 paths) get unchanged behavior. New callers that want throttling must explicitly pass the throttle value. Don't change the default to 0.87 or "auto-detect rebuild mode" — the explicit-opt-in pattern keeps the canonical-lerp contract clear for normal generation.
  - **Throttle source MUST be `block.tssMultiplier` (per-week)**, not a single `options.physiologicalFloorRebuild` flag. Per-week ensures the rebuild loop's incremental shrinkage maps directly to incremental lerp throttling.
  - **Floor source MUST be peak-of-BASE, not peak-of-current-phase.** Peak-of-current-phase was the convergence-failure root cause. Peak-of-base is the smallest "real" long session per the spec.
  - **Floor is distance-aware via the spec functions.** Don't hardcode 10mi / 2.25h — those are 70.3 values. Full IM needs 13.5mi / 4.5h. Always derive from `*FloorMiles/Hours(distance, 'base')`.
  - **Throttle only fires for base/build/race_specific phases.** Taper / recovery / rebuild keep their phase-multiplier logic unchanged. If you add a new phase type, decide explicitly whether it joins the throttle path.
  - **Validator parity is load-bearing.** Both soft and hard validators must thread the throttle. If a future validator path is added that uses `effectiveLongRunFloorMiles` / `effectiveLongRideFloorHours` but doesn't pass `loadThrottle`, the validator will read un-throttled values and re-bump throttled sessions back up, defeating D-031.
  - **The removed `Math.max(longRunFloorMiles(distance, phase), longRunMiles * 0.86)` line at the long-run rebuild site MUST stay removed.** Restoring it would re-introduce the convergence-failure root cause. The TSS-share cap below it in the same block stays — that's a separate invariant.
  - **The e2e fixture is the canary** — Olympic 13-wk close (CTL=65, 11hr/wk, advanced race_peak) genuinely reproduces the pre-fix WoW spike (Week 8 = 22.9%). The headline test asserts the FIXTURE FAILS pre-rebuild AND THE LOOP RESOLVES IT. Refuses to silently pass if either half stops holding. Don't change the fixture without re-verifying it still triggers the spike.
  - **Issue 2 (delete-goal idempotent on 404) shipped separately at `5ccfdcdc`.** Both Issue 1 and Issue 2 stem from the same user-reported "Plan generation failed: Week 10: 25.5%" investigation but resolve different concerns. The architectural follow-up to Issue 2 (backend tracks all wizard-inserted goals atomically vs. wizard-side rollback) remains filed but unscheduled.
- **Decision:** D-031 (amends D-026 + D-028 + D-029; closes Issue 1 of the 2026-05-22 plan-generation-failure investigation; companion to `5ccfdcdc` which closed Issue 2).

---

## D-032 — Phase 0 Arc channel: dynamic Arc data threaded into `generate-combined-plan` (behavior-neutral foundation for Phases 1-4)

- **Date:** 2026-05-22 (spec `30e88008`; implementation `ad4102f8`; Phase 0 of the feedback-loop closure work order documented in `docs/FEEDBACK-LOOP-WORKORDER.md` + spec doc `docs/PHASE-0-ARC-CHANNEL-SPEC.md`. Prerequisite for Phases 1-4 — D-033 through D-036.)
- **Decision:** `generate-combined-plan` now accepts an optional `arc?: ArcChannelPayload` field on `CombinedPlanRequest`. The wrapper (`create-goal-and-materialize-plan`) already fetches `getArcContext()` for its own use; it now also channels a **curated 4-field dynamic subset** into the engine. **Phase 0 is behavior-neutral by contract:** no engine code path reads `options.arc` in this phase. Consumers belong to Phases 1-4. A SHA-256 byte-identical hash gate on 5 plan-generation fixtures × 2 modes (arc=undefined vs. arc=populated) verifies the engine produces identical output regardless of whether the field is provided.
  - **The curated 4-field subset:** `latest_snapshot`, `cycling_fitness`, `swim_training_from_workouts`, `longitudinal_signals`. Each field tied to a Phase 1-4 consumer per the work order — `latest_snapshot` for Phases 1/3/4, `cycling_fitness` for Phase 3, `swim_training_from_workouts` for Phase 4 (limited; full swim aggregation in Phase 4 itself), `longitudinal_signals` cross-cutting. Forward-looking fields (`recent_completed_events`, `arc_narrative_context`, `five_k_nudge`) deliberately excluded — added when their first consumer ships, keeping every payload field traceable to a reason.
  - **Wrapper owns the fetch.** The engine never calls `getArcContext()` directly. The wrapper's existing `arcForCombined = await getArcContext(...)` (create-goal:1201) is the single fetch site; it now also populates the new `arc` field at the existing `invokeFunction('generate-combined-plan', { ... })` call site (~line 1567). Engine receives Arc data in the request body, preserving its pure-function-of-inputs property + the preview-mode contract that test fixtures depend on.
  - **Engine read pattern (LOCKED).** Phase 1+ consumers MUST use the optional-chain: `arc?.latest_snapshot?.run_threshold_pace_sec_per_km`; never `arc.latest_snapshot.run_*` without `?.`. When undefined, fall back to baselines (`athlete_state.learned_fitness`). Documented in the `buildWeek` options shape docstring.
  - **Test contract (LOCKED).** `arc-channel.test.ts` runs 5 fixtures × 2 modes; stable-key JSON serialization + SHA-256 hash. Hashes MUST match. The test is the entire definition of "behavior-neutral." Phase 1+ consumers MUST update this test to reflect that `arc: populated` and `arc: undefined` now produce different outputs FOR THE CONSUMED FIELD — explicit additions, not silent regressions.
- **Alternatives considered / rejected:**
  - **Full `ArcContext` pass-through (~20 fields)** vs. curated subset. Rejected — engine signature stays grokkable; subtracting fields from a full pass-through is breaking, adding to a curated subset is additive. Curated starts small + grows.
  - **Forward-looking 7-field subset** (curated + recent_completed_events + arc_narrative_context + five_k_nudge) vs. conservative 4. Rejected per user direction — "curated payloads should expose exactly what's consumed and nothing more." Speculative fields would do nothing and slightly weaken Phase 0's behavior-neutral guarantee (more surface area that could accidentally get read).
  - **Engine re-fetches Arc** instead of receiving in request body. Rejected — would double the Arc query cost, couple the engine to Supabase service-role auth, and violate the existing "engine is a pure function of its inputs" property that supports preview-mode + test fixtures.
  - **`arc: ArcChannelPayload = {}` (empty-object default)** vs. `arc?: ArcChannelPayload` (optional). Rejected — empty default silently turns "consumer accidentally reads a field" into a runtime error; optional + the `arc?.field?.subfield` pattern is more explicit and testable. The hash gate proves byte-identical regardless of default.
  - **Implementation bundled with Phase 1.** Rejected per work order — Phase 0 is the architectural foundation, must ship before Phases 1-4, and stays separately commitable to keep the bisect surface small.
- **Why:** The feedback-loop audit (in-conversation, 2026-05-22) confirmed `generate-combined-plan/index.ts` does not call `getArcContext()`. Plan generation reads `user_baselines` (manual entries) instead of Arc-aggregated workout data. Even where the upstream analyze→snapshot→Arc loop closes (cycling CTL/ATL/TSB), the planner doesn't read the result. Phase 0 wires the channel so Phases 1-4 can close their respective loops without each phase re-inventing the Arc-fetch path. **The whole feedback-loop closure work depends on this.**
- **Tradeoff accepted:**
  - **Wrapper owns Arc fetch responsibility.** Future callers of `generate-combined-plan` (none today) would need to fetch Arc themselves OR pass `undefined` and accept baseline-only behavior. Documented.
  - **Wrapper / engine type drift.** `ArcChannelPayload` lives in engine types; wrapper builds it manually. If Arc adds a new field that Phase 1+ wants, both sides must be updated. Caught by TypeScript compile errors when consumers add fields not supplied by wrapper.
  - **Hash test is the only behavior-neutral verification.** Stable-key JSON serialization + SHA-256 catches accidental consumption but cannot catch (a) code that reads `arc` and uses it for logging without affecting output (harmless), or (b) refactor that's behaviorally equivalent but technically different code paths (harmless). Acceptable.
  - **Curated subset means schema churn per phase.** Phase 1 will add a run-observed-fitness field (likely via `latest_snapshot.run_*` exposure or a new top-level field — spec decides); Phase 4 will replace the placeholder `swim_training_from_workouts` with richer aggregation. Adding fields is a one-line type extension; the trade-off is the type changes ship with each phase rather than once upfront.
- **Footgun (don't re-litigate):**
  - **`arc?: ArcChannelPayload` stays optional.** Don't change the default to `arc: ArcChannelPayload = {...}`. The explicit-undefined pattern is what keeps consumers honest about the back-compat path.
  - **Curated subset stays curated.** Adding a field to `ArcChannelPayload` requires the field's purpose to be documented (which phase consumes it, what for). Don't accidentally bloat into "pass everything Arc has." Conservative-4 is the starting point; phases extend deliberately.
  - **Hash test stays load-bearing.** Phase 1+ tests adding consumers MUST update the hash test to reflect that `arc: populated` and `arc: undefined` now produce different outputs FOR THE CONSUMED FIELD. The Phase 0 hash test is the contract; consumers are explicit additions to it. Don't silently regress to byte-identical without verifying the new consumer is actually wired.
  - **No re-fetch inside the engine.** `generate-combined-plan` never calls `getArcContext()` directly. The wrapper fetches; engine consumes from request body. Protects engine's pure-function-of-inputs property + preview-mode contract. If a future audit reveals the engine needs Arc fields the wrapper doesn't channel, EXTEND the curated subset; don't refetch.
  - **Engine read pattern is `arc?.field?.subfield`** (optional chain throughout). Phase 1+ consumers fall back to baselines when undefined. Never `arc.latest_snapshot.run_*` without `?.`. Lint-enforceable if needed.
  - **Phase 0 hash test runs in non-rebuild mode** (no `physiologicalFloorRebuild` flag). It exercises the byte-identical contract for normal generation. Phase 1+ may need to add rebuild-mode variants if their consumers fire during rebuild iterations.
  - **`generate-combined-plan/types.ts` imports from `_shared/arc-context.ts`** for `AthleteSnapshot` and `SwimTrainingFromWorkouts`. No circular import today (verified pre-implementation). If Arc adds an engine-types import, breakage is immediate at compile time.
  - **Wrapper builds the `arc` object manually with the 4 curated fields.** Don't pass `arcForCombined` directly — that would smuggle non-curated fields through. The explicit object construction is the curation enforcement point.
- **Decision:** D-032 (Phase 0 of the feedback-loop closure work order; foundation; behavior-neutral; gates Phases 1-4 — D-033 run pace, D-034 strength progression, D-035 cycling Arc-to-plan, D-036 swim aggregation).

---

## D-033 — Phase 1 run pace feedback loop: reconcile `learned_fitness.run_easy_pace_sec_per_km` against observed sub-threshold pace under streak + median + ACWR gates

- **Date:** 2026-05-22 (spec `b8f1e626` / `d87be8ef`; Path B amendment + implementation in this commit. Phase 1 of the feedback-loop closure work order. Builds on D-032 — Phase 0 Arc channel — which provided the architectural prerequisite.)
- **Decision:** The engine's `state.learned_fitness.run_easy_pace_sec_per_km.value` can be displaced in-memory at request-handler entry by a pure reconciler `resolveRunEasyPace(baseline, observed)` that compares the baseline against the last 4 weeks of `athlete_snapshot.run_easy_pace_at_hr` data. The override is local to the request — no write to `user_baselines`. Three independent anti-volatility gates must all clear before worsening engagement; both first gates plus a streak gate must clear for improving engagement.
  - **The 4-week trailing window.** Matches the run-arc within-phase ramp granularity (D-026). Wrapper's `buildRunObservedFitness` rejects (`null`) when fewer than 3 of 4 weeks have qualifying `run_easy_pace_at_hr` samples.
  - **Divergence threshold: 4% sustained.** Below 3% is noise (terrain / weather / HR drift / GPS); above 5% is real fitness shift per coaching literature. 4% is the conservative middle. Both the per-week streak gate and the 4-week median gate use the same 4% band, but apply it differently.
  - **Asymmetric ratchet: streak threshold 2 (worsening) vs 4 (improving).** Safety-favored bias — fatigue / illness / regression engage at 2-week streaks; fitness gains require 4-week sustained signal (protects against PR weeks / favorable conditions auto-prescribing harder paces). 2× ratio.
  - **Both streak AND median required for engagement (Path B, locked).** Resolved a §5.3 vs §4.3 spec contradiction in §5.3's favor: streak alone was not sufficient because under moderate ACWR (1.1–1.2, sports-science "optimal training zone"), a 2-week 5%-slow noise streak with median in-band would have displaced baseline. The median gate is the second independent anti-volatility layer alongside the streak gate. ACWR ≤ 1.3 stays as the third independent check, evaluated only when streak + median both fire. The `'baseline_acwr_gated'` source value is reserved for the case where streak + median fire but ACWR fails — it is NOT used when median or streak alone fail.
  - **ACWR gate on worsening only.** Per spec §4.3.1, easy pace slowing at HR can mean fitness loss OR accumulated fatigue from a hard training block. The gate uses `athlete_snapshot.acwr` (computed at `compute-snapshot:357-359` from `current_workload / 4-week_chronic_load`); engagement requires every week in the 2-week worsening window to have `acwr ≤ 1.3` (partial-data tolerance: one null permitted if the other is ≤ 1.3; both null blocks). Improving path is gate-free — fitness gains under high load are unambiguous and engaging is correct.
  - **Per-distance scoping: easy pace only.** Reconciliation touches ONLY `learned_fitness.run_easy_pace_sec_per_km` — derived threshold prescriptions inherit via Daniels-style ratios. `performance_numbers.fiveK_pace` is untouched; race-pace + interval-pace prescriptions stay anchored to manual athlete entries (athlete-controlled goal targets). Anti-cross-pollination rule.
  - **Confidence gating.** Mirrors `arc-context.ts:learnedThresholdPaceUsable` — baseline is unusable when `confidence === 'low'` or `sample_count < 2`. When baseline unusable + observed sufficient → `observed_no_baseline`. When both insufficient → `null` (caller falls back to existing default).
- **Alternatives considered / rejected:**
  - **Threshold pace as the signal, not easy pace.** Rejected — `compute-snapshot` doesn't aggregate threshold pace (it lives only in per-workout interval analysis). Easy pace at HR is the cleanest read on aerobic fitness; threshold prescriptions inherit via Daniels ratios anyway. A future Phase 1.5 could add threshold-pace aggregation if needed.
  - **Reconcile `performance_numbers.fiveK_pace` instead.** Rejected — `performance_numbers` is athlete-controlled goal-target territory; auto-displacing race-pace would contaminate goal-setting. Reconciler is scoped to `learned_fitness` (the engine-only baseline layer).
  - **Streak alone triggers engagement (original spec §4.3 + §6.2 wording).** Rejected during implementation. Demonstrated failure mode: 2-week 5%-slow streak at moderate ACWR (1.1–1.2) with median in-band → engagement under the ACWR-only filter. Two weeks of moderate noise displacing baseline is more aggressive than the anti-volatility intent. Resolution: Path B (streak AND median both required).
  - **Median alone triggers engagement.** Rejected — without the leading-edge streak, engagement lags by ~1 extra week (a single late-window slow week can pull the median across the band, but waiting for that crossing misses the leading-edge signal). Requiring the streak ensures the displacement target (the new pace) is meaningful — worsening is concentrated at the leading edge, not noise spread across the window.
  - **Symmetric ratchet (same streak threshold both directions).** Rejected — fast worsening engagement is the safety-favored bias for a training plan. Locking in a PR-driven fitness gain to harder paces too quickly is unsafe; locking in fatigue-driven regression slower is unsafe.
  - **Persist the reconciled pace to `user_baselines`.** Rejected — the override is in-memory only, scoped to the current plan generation. Each regen re-evaluates against current observed data; if observed normalizes, the override stops happening on the next regen. This makes the reconciler genuinely transient and recoverable.
  - **Direct engine call to `getArcContext()` instead of wrapper aggregation.** Rejected — D-032 established the wrapper-owns-the-fetch contract. The wrapper's `buildRunObservedFitness` queries the snapshot table once and channels the aggregate; engine stays pure (preview-mode + test-fixture pattern preserved).
- **Why:** D-032 Phase 0 wired the architectural channel. Phase 1 closes the first feedback loop: the engine now reads observed run easy pace from `athlete_snapshot` (the upstream telemetry pipeline already writes weekly `run_easy_pace_at_hr` at `compute-snapshot:528`), reconciles against the baseline under three independent anti-volatility gates, and produces a transient in-memory override. The loop is closed end-to-end for the first discipline.
- **Tradeoff accepted:**
  - **Three-gate design has many "no engagement" branches.** Path B + ACWR gate means a 2-week worsening streak with median in-band returns `baseline` (gate 2 fails); a 2-week streak + crossed median + elevated ACWR returns `baseline_acwr_gated` (gate 3 fails); a 4-week streak + crossed median returns `reconciled_better` (improving path, no ACWR gate). The `source` enum has 5 values reflecting these branches. Accepted for debug telemetry distinguishability.
  - **No persistence means each plan generation re-evaluates.** A user who generates a plan, then 30 minutes later regenerates with no new workouts ingested, gets the same reconciled value both times (same input data). Acceptable — reconciler is pure-function-of-inputs.
  - **The wrapper does the DB query.** `buildRunObservedFitness` adds one `athlete_snapshot` SELECT per `generate-combined-plan` invocation. The wrapper already queries `athlete_snapshot` at line 1089 (6 rows for CTL); the new query selects 4 different rows for the run aggregate. Cost: one additional small query. Failure tolerant: any DB error or unexpected shape returns `null`; reconciler short-circuits to baseline.
  - **`run_efficiency` field is `null` on the wrapper-built payload.** Snapshot doesn't store `run_efficiency` at week-aggregate granularity (only internal compute aggregator). Reserved for future compute-snapshot extension. Reconciler doesn't depend on it; field is display-only per spec §4.5.
- **Footgun (don't re-litigate):**
  - **Engagement requires BOTH streak AND median (Path B is locked).** Don't "simplify" to streak-alone. The `run-pace-feedback.test.ts` §6.10 regression pin (`[380, 378, 360, 358]` weekly + `[1.10, 1.15, 1.05, 1.00]` ACWR → must return `baseline`) catches this. The test assertion message specifically calls out the two regression modes — `'reconciled_worse'` (Path B regressed) or `'baseline_acwr_gated'` (gate ordering regressed). Either fails the suite.
  - **ACWR gate fires AFTER streak + median both fire.** If either of the first two gates fails, the result is `'baseline'`, NOT `'baseline_acwr_gated'`. The latter is reserved for the case where pace evidence is unambiguous but workload evidence suggests fatigue. Don't fold the ACWR check into the median-or-streak short-circuit.
  - **Per-distance scoping is athlete-controlled.** `performance_numbers.fiveK_pace` is NEVER touched by the reconciler. Race-pace prescriptions, interval-pace anchors (5K-pace strides, 1600m repeats at threshold) all derive from `performance_numbers`, not `learned_fitness`. Don't extend the reconciler to other run-pace fields without re-litigating the anti-cross-pollination rule.
  - **Improving path has NO ACWR gate by design.** A faster pace signal during a hard block is unambiguous: fitness improving despite high load. Don't add an ACWR gate to the improving path "for symmetry" — would block legitimate fitness gain signals.
  - **`run_observed_fitness === null` from the wrapper means insufficient data.** Engine treats it as a no-op (no displacement). Don't infer "observed is null because reconciler hasn't run yet" — null is the wrapper's explicit signal that there aren't 3 of 4 weeks of qualifying samples. The reconciler short-circuits cleanly.
  - **The override is in-memory only.** Don't add a write to `user_baselines` to "persist" the reconciled value. Each regen re-evaluates against current observed data; that's the recovery mechanism if the override turns out to be wrong.
  - **The reconciler is pure.** No DB reads, no env reads, no side effects. Don't add caching, logging that mutates state, or DB calls. Pure-function-of-inputs is what makes it unit-testable (22 pin tests in `run-pace-feedback.test.ts`).
- **Decision:** D-033 (Phase 1 of the feedback-loop closure work order — `docs/FEEDBACK-LOOP-WORKORDER.md`. Run pace loop closed end-to-end. Phase 2 strength progression / Phase 3 cycling Arc-to-plan / Phase 4 swim aggregation remain queued — D-034 / D-035 / D-036 — but the work order pauses after Phase 1 per user direction.)

---

## D-034 — `is_mixed_effort` is the canonical variance flag; plan intent is never overwritten; cross-workout pace comparisons prefer GAP

- **Date:** 2026-05-23 (spec `docs/PERF-INTERVAL-INTERPRETATION-SPEC.md` v2; implementation this commit. Bug A + Bug B + cycling-B bundled per spec.)
- **Decision:** One persistent boolean per workout — `workout_analysis.session_state_v1.glance.is_mixed_effort` — computed deterministically by the run and cycling analyzers. Mixed-effort sessions are excluded from steady-effort comparison pools (vs_similar, TREND) and the LLM input shape is swapped (vs_similar dropped, `interval_summary` block added) so INSIGHTS interprets the intervals rather than comparing whole-workout averages to easy history. Plan intent is **never** overwritten when the gate trips — `classified_type_variance_override: true` is set instead. All cross-workout pace comparisons (vs_similar, trend_points) prefer grade-adjusted pace (GAP) when both rows have it and never mix bases within a single comparison set.
  - **Run predicate (any one of, first-match priority):** `interval_execution.total_steps ≥ 2` (linked plan), plan-intent classified as interval-like (intervals/tempo/threshold/vo2/fartlek/speed/track), `detectWorkoutTypeFromIntervals` returns non-easy/non-steady (unlinked), or pace CV ≥ 8% on a basis-trusted series.
  - **CV basis policy (run):** CV is grade-adjusted whenever `granular-pace.ts:hasUsableElevation(sensorData)` is true (the GAP enrichment at `:874-885` substitutes GAP into the sample series before CV is computed). Raw CV is trusted only when terrain is `flat`; on rolling/hilly terrain without GAP the predicate is silently skipped (conservative — missed detection > false flag).
  - **Cycling predicate:** Variability Index ≥ 1.05 (textbook non-steady threshold), OR power CV ≥ 12%, OR plan intent classified as interval-like. No GAP analog needed — NP already smooths terrain via 4th-power rolling average.
  - **Thresholds:** Run CV 8% (sits between PACING's 5% Mastery / 10% uneven bands). Cycling VI 1.05 / power CV 12%. All values subject to tuning after 2 weeks of production observation.
- **Bug A bundled in the same slice:** the analyzer's `overall_only` fallback no longer collapses unlinked interval sessions to a single "Overall" row when ≥2 measured breakdown intervals exist (new `buildRowsFromBreakdown` path). The literal string `'Overall session'` is no longer emitted at any of the three analyzer sites (now `null`). `humanizePlannedSegmentLabel` (`_shared/session-detail/build.ts:41-65`) gained a defense-in-depth `'overall session' → 'Overall'` guard and synthesizes `Interval N` / `Recovery N` from `interval_type` + numbering when raw label is empty/bare — so stale rows render correctly immediately on next `workout-detail` fetch, no backfill needed.
- **Alternatives considered / rejected:**
  - **Client-side variance detection in `SessionNarrative.tsx`.** Rejected — the flag must be persisted to break the type-contagion feedback loop in vs_similar/trend pools, which is a server concern. Per-user constraint: no client-side CV/variance math anywhere in the diff.
  - **Overwrite `classified_type` when variance disagrees with plan intent.** Rejected — plan intent is the athlete's stated goal for the session and load-bearing for adapt-plan, coach narrative, and execution-grade comparisons. Mutating it would silently corrupt the plan-adherence story. Override flag carries the same information for pool filters without the side effects.
  - **Include `pace_spread_s_per_mi` as a separate predicate** (per spec §3.3 rule 2). Dropped during implementation — segment-level pace_spread is computed on RAW per-interval pace (`computed.intervals[].executed.avg_pace_s_per_mi`), not GAP, so it has the same terrain confound that the GAP-corrected CV resolves. CV already covers the same signal class. Predicate suppressed to avoid the apples-to-pomegranates trap.
  - **Backfill via `bulk-reanalyze-workouts` over the last 60 days.** Rejected per user direction — lazy stale-until-touched is sufficient. The display-layer `'Overall session'` guard catches old rows immediately; `is_mixed_effort === undefined` is treated as false by the pool filter (older rows stay in easy pools until re-ingested, a known temporary skew that decays naturally).
  - **Mixing GAP from one row with raw from another in vs_similar comparisons.** Rejected — averaging grade-adjusted values with raw values is apples + pomegranates and worse than the raw-only baseline. The two-tier resolver (`resolvePaceForComparison`) requires both sides have the same basis to use GAP; otherwise both fall back to raw. New `pace_basis` field on `derived.comparisons.vs_similar` reports which basis fed the delta.
- **Why:** Production observation — INSIGHTS narrated fartleks and structured intervals as if they were steady efforts ("HR ran 16 bpm higher than recent similar efforts on this route" on a 7-segment fartlek). Root cause: the variance signals existed (CV, VI, pace spread) but were consumed only by PACING/SMOOTHNESS rows, never by the comparison pool filter or the narrative LLM input. Compounding: vs_similar used raw pace, so hilly historical sessions polluted flat comparisons even when correctly classified. POLISH-PUNCH-LIST.md line 242 documented the bug; this entry ships the fix.
- **Tradeoff accepted:**
  - **Stale-until-touched means old fartleks stay in easy pools temporarily.** Acceptable per user direction — decays naturally as new workouts are logged; backfill cost > benefit for a self-healing condition.
  - **Cycling has no Bug A analog** (no `buildSessionIntervalRows` in `analyze-cycling-workout`) — only Bug B for cycling. Bundled in the same ship to keep symmetry on the narrative/comparison surfaces.
  - **No direct test file for `analyze-running-workout`.** The variance gate logic is covered transitively through `_shared` tests (humanize labels, GAP-aware resolver, pool filter, isMixedEffortRow). End-to-end coverage of the gate computation in the analyzer itself is a known gap — logged in POLISH-PUNCH-LIST.md as a follow-up.
- **Footgun (don't re-litigate):**
  - **Plan intent is sacred.** A linked-plan `'easy'` run that trips the gate keeps `classified_type:'easy'` and sets `classified_type_variance_override: true`. Pool filters key off `is_mixed_effort` and the override flag, NOT the primary classification. Don't "simplify" by overwriting classified_type.
  - **Raw CV on non-flat terrain is silently skipped by design.** A hilly easy run with raw pace 6:00 → 9:00/mi has high raw CV but low GAP CV (terrain-driven, not effort-driven). Trusting raw CV on rolling/hilly terrain would mis-flag legitimate easy runs as intervals. The conservative-skip policy means a flat fartlek without GAP still trips (basis is trustworthy), but a hilly easy run without GAP is left alone (basis is not). Don't add a "fallback" raw-CV check for non-flat terrain.
  - **Never mix GAP and raw within a single vs_similar comparison.** If the current workout has GAP but only 2 historical candidates do, the pool falls back to raw across all rows. Mixing bases would mean averaging a GAP value (terrain-neutralized) with raw values (terrain-affected) — the comparison would lose all interpretability. The two-pass resolver in `queries.ts` enforces this; don't "optimize" by per-row basis-switching.
  - **`is_mixed_effort` is server-computed and persisted; client never recomputes.** The flag lands on `session_detail_v1.classification.is_mixed_effort` for the client to render off. No client-side CV/pace-variance math anywhere. If a future UI surface needs more granularity (e.g., per-interval execution display), extend the server contract first.
  - **The fact-packet pool filter excludes mixed-effort rows from easy queries, not the other way around.** Mixed-effort rows ARE eligible for interval-pool queries (when the current workout is interval-like). The filter is asymmetric to break contagion in one direction: protect easy pools from fartlek pollution, but let interval pools include detected variation regardless of `classified_type`.
  - **`humanizePlannedSegmentLabel` has the defense-in-depth `'Overall session' → 'Overall'` guard for a reason.** Stale `workout_analysis` rows from before this ship still carry the literal. Don't remove the guard until backfill happens (and we're not planning backfill).
- **Decision:** D-034 (Bug A + Bug B + cycling-B per `docs/PERF-INTERVAL-INTERPRETATION-SPEC.md` v2. All three bugs closed in one ship: 9 new Deno tests, all green; zero regressions across 391 `_shared` + 19 cycling analyzer tests. No client changes. Redeploys: `analyze-running-workout`, `analyze-cycling-workout`, `workout-detail`, `recompute-workout`, `bulk-reanalyze-workouts`, `ingest-activity`.)

---

## D-035 — Unlinked workouts return null adherence (not synthesized targets, not 0, not 100); INSIGHTS interprets them on their own terms with terrain-aware variance reading

- **Date:** 2026-05-23 (spec `docs/UNLINKED-WORKOUT-INTERPRETATION-SPEC.md`; implementation this commit. Bundled all three analyzers in one ship.)
- **Decision:** Adherence means "vs what was prescribed." Without a plan link, there is nothing to be measured against — so all three analyzers (run, cycling, swim) now return `null` for `execution_adherence`, `pace_adherence`, `duration_adherence`, `completed_steps`, `total_steps` when no linked plan exists. A new server-side `classification.is_unplanned` flag on `session_detail_v1` is the canonical signal for the client, the LLM input, and any future consumer. The LLM input shape swaps when unplanned: the prescribed-range signal block (`signals.execution`, `signals.interval_execution`) is dropped, an "UNPLANNED SESSION" top-line is emitted in `buildUserMessage`, and a new UNPLANNED MODE prompt rule fires that tells the LLM to interpret the workout on its own terms — HR-to-pace efficiency, terrain via GAP, conditions, route history — rather than scoring adherence to a target the athlete never set. The terrain-aware variance reading is explicit: when raw pace swings track the elevation profile, that is terrain, not effort variation; the GAP value is the truth.
  - **Run-side mechanism:** Deleted the duration-derived fake-target synthesis at `analyze-running-workout/index.ts:504-538` (which invented `tempo_run @ 10K pace` for any 30-60 min run, `long_run @ marathon pace` for >60 min, etc.). Added a post-finalization null-override after `performance` is built (`:~1460`) that nulls all adherence fields when `!isLinkedPlanSession`. Required because `calculatePrescribedRangeAdherenceGranular`'s no-mainsegments fallback returns `paceAdherence: 1.0` by default — without the override, the bug would shift from "fake target with low adherence" to "fake 100% adherence."
  - **Cycling-side mechanism:** No synthesis was happening, but the `performance` object emitted `execution_score: 0` / `power_adherence: 0` because `calculateSteadyStatePowerAdherence` returns adherence 0 when `plannedPowerRange` is null. Now `performance` is a null-fields object when `!plannedWorkout`. `power_variability` (NP, CV, VI) keeps computing — those are honest single-workout signals that still feed the D-034 variance gate.
  - **Swim-side mechanism:** Replaced the `100` default on `overallAdherence` at `analyze-swim-workout/index.ts:342-344` with `null`. Killed the hardcoded `duration_adherence: 100` (which was a TODO that lied about every swim — linked or unlinked — having perfect duration adherence). Linked swims now get a real ratio-based `duration_adherence` from planned vs actual moving time, using the same asymmetric clamp as the run analyzer (`granular-pace.ts:471-482`). `execution_adherence` for linked swims blends pace + duration when both are present; uses the single available component when only one is.
  - **`assessed_against` flips to `'actual'` when unplanned** (`_shared/fact-packet/build.ts:776`). Defense-in-depth: the existing client guard at `AdherenceChips.tsx:60` already hides chips when `assessed_against === 'actual'`, so unlinked workouts now disappear from chip display via two redundant paths (null per-chip + assessed_against flag).
  - **`workout_type` stays a descriptive label only.** The duration-derived `workout_type` at `_shared/fact-packet/build.ts:340-345` is preserved as a soft hint for the LLM ("this looked like a long run"). It MUST NEVER be turned back into a pace target, an adherence baseline, or any other quantitative anchor. The UNPLANNED MODE prompt rule states this explicitly. Any future change that would resurrect a synthesized target from this label needs to supersede this entry with a new D-NNN.
  - **vs_similar stays populated for unlinked workouts.** Per user direction — same-classified-type history is honest signal, not prescription. The LLM may lead with it when sample size is sufficient. The variance-gate pool filter from D-034 already excludes mixed-effort rows from the easy pool, so the comparison is type-coherent.
  - **Cycling cross_workout stays populated for unlinked rides.** Per user direction — NP-vs-typical and power trend are history, not prescription. Same legitimate-history logic as run's vs_similar.
- **Alternatives considered / rejected:**
  - **Keep synthesizing targets but flag them as "estimated."** Rejected — the synthesized target IS the bug. There is no honest way to grade adherence to a target the athlete never set. Returning null is the right shape; the LLM still has plenty of signals (GAP, HR drift, variability, vs_similar) to interpret the workout.
  - **Client-side hiding of synthesized-target chips via a new flag.** Rejected — the bug is in the data, not the display. Fixing it at the source means the LLM input is also honest, which fixes the INSIGHTS narrative as a side effect. Per the D-034 precedent (server computes, client renders).
  - **Drop swim's `duration_adherence` TODO to a follow-up spec.** Rejected per user direction 2026-05-23: a hardcoded fake `100` is the exact bug this spec exists to kill; leaving it in is incoherent. Fixed here for linked swims (real calculation) and unlinked swims (null).
  - **Drop cycling cross_workout in unplanned mode (parallel to mixed-effort gate).** Rejected — NP-vs-typical is legitimate history even when the ride was unplanned; same logic as keeping run's vs_similar. Mixed-effort mode drops it because the *current* workout's NP doesn't represent a steady effort; unplanned mode keeps it because the comparison itself is still honest.
  - **Overwrite the duration-derived `workout_type` label to `'run'` / `'unknown'` for unlinked workouts.** Rejected — it's a useful soft hint for the LLM and an existing classification field for vs_similar pool matching. Just need to prevent it from being treated as a target. Done via the explicit UNPLANNED MODE rule.
- **Why:** Production observation — three different analyzers handled the no-linked-plan case three different wrong ways. Run synthesized a fake target (`tempo_run @ 10K pace` for a 30-60 min run, etc.) and scored against it, then INSIGHTS scolded the athlete for "missing the target." Cycling emitted 0% adherence (hidden by a client `allZero` short-circuit, but the LLM still saw zeros). Swim defaulted to 100% adherence — perfect score for any unlinked swim, regardless of execution. All three lies stopped the LLM from honest interpretation and broke the chip display.
- **Tradeoff accepted:**
  - **Stale-until-touched means old rows still carry the synthesized adherence numbers until next ingest/recompute touches them.** Acceptable per D-034 precedent — decays naturally as workouts are re-analyzed. The `assessed_against = 'actual'` flag in the rebuilt `session_detail_v1` catches the display side for older rows on next workout-detail fetch (which rebuilds per request).
  - **The duration-derived `workout_type` label remains visible to the LLM.** A future LLM regression could in principle interpret it as a prescription. Mitigated by the explicit UNPLANNED MODE prompt rule that says "this is a descriptive label only, not a target the athlete chose." If this rule ever proves insufficient, the next step is dropping the label entirely (separate D-NNN, document the regression that drove it).
  - **Cycling-unlinked-with-no-cross_workout-data renders a sparse INSIGHTS narrative.** When the rider has fewer than 3 same-classified-type historical rides, cross_workout has no signal to compare against. The LLM falls back to single-workout signals (NP, IF, VI, terrain) — which is honest but less rich. Accepted; the alternative (faking a comparison) is worse.
- **Footgun (don't re-litigate):**
  - **Adherence requires a prescription. No exceptions.** If a future feature needs an "adherence number" for an unlinked workout, the right move is to introduce a different metric (efficiency score, consistency score, etc.) — NOT to resurrect synthesized targets. Adherence-against-a-fiction is the original bug.
  - **`workout_type` is a descriptive label, never a target.** Any code path that reads `workout_type` and uses it to set a pace_range, power_range, or adherence baseline reintroduces this bug. The UNPLANNED MODE prompt rule states this for the LLM; the analyzer code paths must enforce it too.
  - **`assessed_against = 'actual'` has two trigger conditions:** intentional deviation from a real plan (`|distance_deviation_pct| >= 30`) AND no planned workout at all. They're conceptually different — one says "you modified the plan", the other says "there was no plan." The client guard at `AdherenceChips.tsx:60` treats them the same (hide chips) because the right behavior is identical. If you split the two cases in the future, make sure both still hide chips.
  - **Swim's linked-swim `duration_adherence` formula matches the run analyzer's** (`granular-pace.ts:471-482`). If you change one, change the other — and update both test suites. The asymmetric clamp (ratio < 0.9 → linear, ratio > 1.1 → planned/actual) penalizes over-duration harder than under-duration, which is intentional.
  - **No client-side variance / adherence math anywhere.** D-034 precedent. Client renders off the server contract; if a future UI surface needs more granularity, extend `session_detail_v1` first.
  - **The UNPLANNED MODE prompt rule is the only thing standing between the LLM and treating `workout_type` as a target.** If anti-jargon retry or any other guard mutates the prompt, preserve this rule. It's load-bearing.
- **Decision:** D-035 (Run + cycling + swim analyzers ship together. Spec `docs/UNLINKED-WORKOUT-INTERPRETATION-SPEC.md` approved 2026-05-23. 9 new Deno tests, 400 _shared + 19 cycling tests all green, zero regressions. No client changes. Redeploys: `analyze-running-workout`, `analyze-cycling-workout`, `analyze-swim-workout`, `workout-detail`, `recompute-workout`, `bulk-reanalyze-workouts`, `ingest-activity`.)

---

## D-036 — Run aerobic decoupling is computed on grade-adjusted pace; INSIGHTS surfaces it as a real fitness signal only when basis is GAP

- **Date:** 2026-05-23 (spec `docs/RUN-HR-DRIFT-SPEC.md` approved this session; implementation this commit. Third spec shipped today after D-034 and D-035; same underlying correction — stop interpreting signals through raw pace.)
- **Decision:** Lift GAP enrichment out of `calculatePrescribedRangeAdherenceGranular` to the top of `analyze-running-workout/index.ts` (Option α), via a new idempotent shared helper `enrichSamplesWithGAP` in `_shared/gap.ts`. Both the pace-adherence calculator and `analyzeHeartRate` now consume the same grade-adjusted sample series. `calculateEfficiency` reads `pace_s_per_mi` from those samples and produces a terrain-neutral decoupling number; the new `decoupling.basis: 'gap' | 'raw'` field reports which series fed the ratio. Sample-level decoupling (warmup-skipped, 20-min minimum, sample-granularity) replaces the segment-level value as the source of truth for runs — `derived.cardiac_decoupling_pct` is overwritten in the analyzer after the HR analyzer runs; `derived.decoupling_basis` + `derived.decoupling_assessment` are persisted alongside. A new AEROBIC DECOUPLING (RUN) prompt rule in `COACHING_SYSTEM_PROMPT` gives the LLM a translation table for `basis === 'gap'` (excellent < 3%, good < 5%, moderate < 8%, high ≥ 8%) and an explicit "treat as inconclusive, don't claim fitness" rule for `basis === 'raw'`. The contract surface is `session_detail_v1.classification.decoupling: { pct, basis, assessment } | null` — server computes, client renders per D-034 / D-035.
  - **Idempotent helper.** `enrichSamplesWithGAP` checks `samples[0].raw_pace_s_per_mi` as a marker; when present, returns input unchanged. Necessary because the lift means two consumers run through the same sample stream and the inner `calculatePrescribedRangeAdherenceGranular` still calls the enrichment defensively. Without the marker check, pace would be GAP-corrected twice and the ratio would collapse.
  - **Run-only.** Cycling untouched; NP already smooths terrain (4th-power rolling average). The new prompt rule gates on `signals.decoupling_basis === 'gap'`, which only the run analyzer sets. Cycling narratives unaffected.
- **Alternatives considered / rejected:**
  - **Option β — return the enriched series from `calculatePrescribedRangeAdherenceGranular` alongside the adherence result, thread into `analyzeHeartRate`.** Rejected — smaller diff but awkward shape (returning a sample array as a side channel from an adherence function), and locks GAP enrichment as a private concern of pace-adherence even though the HR analyzer needs it too. Option α treats GAP enrichment as a top-level sample-series transform, which is what it conceptually is.
  - **Keep raw-pace decoupling with a "terrain noisy" caveat in the prompt.** Rejected — the number itself is wrong. No caveat in the world makes a contaminated input read honestly. Either fix the input or drop the claim; the spec does both (fix input when GAP available, drop claim when not).
  - **Compute decoupling on segment-level GAP via `segment_progress_metrics`.** Rejected — the underlying writer chain is broken (Q-022); 3 workouts of historical data exists, none after 2026-03-01. Fixing it is a separate piece of work and unrelated to within-workout decoupling, which the sample-level calculation handles cleanly without the segments table.
  - **Add a new field `grade_adjusted_decoupling_pct` alongside the existing `cardiac_decoupling_pct`.** Rejected — splits the signal across two fields, downstream consumers would have to pick. Replacing the run-side value with the GAP-corrected sample-level value is the right move; segment-level `calculateCardiacDecouplingPct` stays in `_shared/fact-packet/utils.ts` for cycling's own path (cycling builds its own fact packet via `_shared/cycling-v1/build.ts` which doesn't call this analyzer's override).
  - **Tune the 3/5/8% assessment thresholds while we're in there.** Rejected per user direction — change one variable at a time. GAP input shifts the numbers down on hilly routes; old "moderate" might become "good." Two weeks of production data first, then retune in a separate D-NNN.
- **Why:** Run decoupling exists in two places (sample-level in `efficiency.calculateEfficiency`, segment-level in `_shared/fact-packet/utils.ts:calculateCardiacDecouplingPct`); both consumed raw pace; INSIGHTS surfaced the segment-level value to the LLM with no run-specific decoupling prompt rule. On hilly terrain, decoupling read high not because efficiency dropped but because raw pace slowed up the climbs in the second half. INSIGHTS made a fitness claim about a terrain artifact. Third occurrence today of the same root mistake the Performance screen has been making — reading signals through raw pace, then asserting a confident interpretation built on a contaminated input. D-034 fixed it for steady-vs-mixed-effort comparison; D-035 fixed it for unplanned-workout adherence; D-036 fixes it for within-workout HR drift.
- **Tradeoff accepted:**
  - **No backfill.** Stale `workout_analysis` rows from before D-036 carry segment-level decoupling values until next recompute. The basis flag suppresses false fitness claims for stale rows (older rows lack `decoupling_basis`, prompt rule doesn't fire). Per D-034 / D-035 precedent — decays naturally as workouts are re-analyzed.
  - **The duration-derived `workout_type` label on the fact packet remains untouched.** Out of scope for D-036; the decoupling rule doesn't read it.
  - **`run_easy_hr_trend` rename stays out of scope.** Flagged in spec §6 as a standalone follow-up. The misnamed weekly snapshot field is a separate cleanup that propagates through D-033's `resolveRunEasyPace` reconciler and any State consumer; not a one-liner.
  - **Per-segment HR-vs-history is OUT.** The discarded-GAP wiring is small but useless until Q-022 (segment_progress_metrics writer chain) is fixed and segments are backfilled. Filed separately.
- **Footgun (don't re-litigate):**
  - **`enrichSamplesWithGAP` must stay idempotent.** Two callers now share its output. Remove the `raw_pace_s_per_mi` marker check and pace gets corrected twice — the second `paceToGAP` call would apply the inverse grade correction on top of an already-corrected value and the decoupling ratio would collapse. Test `D-036: enrichSamplesWithGAP is idempotent` pins this.
  - **Don't synthesize a fitness claim from `basis === 'raw'`.** The AEROBIC DECOUPLING (RUN) prompt rule has two branches for a reason: GAP basis = honest fitness signal, raw basis = inconclusive. If a future prompt change folds the two branches together, decoupling claims on flat-shoes / no-GPS / indoor-treadmill runs become contaminated again. Same discipline as D-035 unplanned-workout fix and D-034 mixed-effort fix: don't assert what you can't actually know.
  - **`workout_type` is a descriptive label, never a target / threshold input.** Carry-over from D-035. Decoupling thresholds (3/5/8%) are NOT derived from `workout_type`; they're fixed bands in `efficiency.ts`. Don't introduce a "tempo runs get stricter decoupling thresholds" rule keyed off the descriptive label — that's the same anti-pattern as the synthesized-target bug D-035 killed.
  - **Cycling decoupling stays on its own path.** D-036 overrides `derived.cardiac_decoupling_pct` ONLY in the run analyzer. The shared `calculateCardiacDecouplingPct` segment-level function is still called by `_shared/fact-packet/build.ts:422` for any non-run fact-packet build. Cycling builds its own fact packet via `_shared/cycling-v1/build.ts`; do not unify the decoupling computation across sports without re-evaluating cycling's NP-vs-pace concept.
  - **The `cardiac_decoupling_pct` field name in `derived` is preserved.** Don't rename to `aerobic_decoupling_pct` or similar; the field is consumed by the existing ai-summary line at `:834` and by older LLM-eval test fixtures. Sample-level value replaces segment-level value in the same slot.
- **Decision:** D-036 (Run aerobic decoupling computed on GAP, surfaced with basis flag, AEROBIC DECOUPLING prompt rule added, contract surface on session_detail_v1. Third spec shipped 2026-05-23 — D-034 / D-035 / D-036, same root correction. 7 new Deno tests, 407 _shared + 19 cycling tests all green, zero regressions. No client changes. Redeploys: `analyze-running-workout`, `workout-detail`, `recompute-workout`, `bulk-reanalyze-workouts`, `ingest-activity`.)

---

## D-037 — Mixed-effort / unplanned run sessions: decoupling + HR signals restored

Shipped: 2026-05-23 / commits 2fac3e4d + 7226f90e

Problem: Two gaps left unaddressed by D-034/035/036:
(a) calculateEfficiency's steady-state guard prevented decoupling from running
on any interval/mixed/fartlek path. D-036's override no-ops'd for these sessions
— efficiency was never computed so there was nothing to override.
(b) D-034's isMixedEffort null gate correctly killed pace comparisons but also
killed hr_delta_bpm, drift_delta_bpm, and vs_similar.trend — valid signals
regardless of effort type. LLM had zero historical HR context for mixed-effort
sessions.

Fixes:
- efficiency.ts: forMixedEffort flag bypasses steady-state early-return, forces
  basis='raw' on result. Whole-session decoupling across random hard/easy efforts
  is less conclusive than steady-state; raw-branch prompt rule fires correctly
  ("describe what HR did, don't claim fitness").
- lib/heart-rate/index.ts: analyzeMixedWorkout calls calculateEfficiency with
  forMixedEffort:true; analyzeIntervalWorkout same, gated on isUnplanned only.
  Planned interval sessions keep the existing skip.
- ai-summary.ts: HR fields (hr_delta_bpm, drift_delta_bpm, trend direction)
  removed from isMixedEffort null gate. Pace fields stay gated (correct).
- arc-narrative-state.ts: new is_first_post_race_run boolean
  (runs_since_last_race <= 1 AND days_since_last_goal_race <= 60).
- arc-narrative-ai-appendix.ts: POST-RACE COMPARISON prompt rule — when
  is_first_post_race_run, do not interpret hr_delta_bpm as fatigue/regression;
  frame pool as pre-race runs at peak fitness; hard-ban "aerobic system elevated"
  language.

Arc confirmed independent — nothing in Arc pipeline touches modified surfaces.
aerobic_direction noted as unwired into workout INSIGHTS (Q-023).
Taper-mode × vs_similar.trend interaction widened — existing hard-ban guards
cover it; logged for monitoring.

Planned interval sessions: decoupling stays null (intentional). HR historical
surfaces for planned intervals — D-034 pool filter ensures correct pooling.

---

## D-038 — Pool composition + detection widening for run comparisons

Shipped: 2026-05-24 / commit fef52335

Problem: Diagnosed on session b70658b0 (unplanned fartlek, 3.5mi, 33min).
Two-layer failure:
(a) HR analyzer detectWorkoutType routed the session as steady_state because it
    only recognizes planned-side signals (role='work'/'recovery' literals, planned
    paceRange, 'fartlek' in description). Unplanned executed-variance fartleks
    with role='lap' and no description slip through to steady_state default.
    D-037's forMixedEffort path never engaged.
(b) vs_similar pool matched type + duration but not intensity. Pool contained
    11-13 min/mi recovery jogs; current session ran 9:24/mi avg (109 sec/mi
    faster). +16 bpm HR delta was pace-explained, not fatigue. LLM had no
    context for the pace gap and constructed post-race recalibration framing.

Spec: docs/PERF-COMPARISON-POOL-SPEC.md

Fixes (3 pieces):
1. Detection widening — detectWorkoutType gains executed-pace fallback:
   hasAlternatingPattern falls back to executed.avgPaceSPerMi when paceRange is
   null. _varGate.is_mixed_effort threaded into HR analyzer as narrow one-way
   override → routes to 'fartlek'. Unplanned executed-variance sessions now
   engage D-037's forMixedEffort path correctly.
2. Pool intensity filter — 15% pace-proximity band added to vs_similar pool
   builder. 3-hit fallback mirrors existing terrain/route pattern. Diagnostic
   pool_intensity_filter field on output. Decisions: 15% threshold (not 10/20),
   3-hit fallback, 'fartlek' override target (not 'mixed').
3. Pool pace context — new pool_pace_context.intensity_match enum
   ('matched'/'current_much_faster'/'current_much_slower'), always-on (not gated
   on isMixedEffort). Boundary at 10% (bumped from spec's 8%). New POOL
   INTENSITY CONTEXT prompt rule: when current_much_faster, pace gap explains HR
   gap — do not reach for fatigue/recalibration framing.

Verified post-deploy on b70658b0:
- heart_rate_summary.workoutType: steady_state → fartlek ✓
- decoupling.basis: gap → raw ✓
- pool_intensity_filter: applied:false, fell back (none of 7 pool rows within
  ±15% — confirms pool was genuinely wrong intensity class)
- pool_pace_context.intensity_match: current_much_faster, delta_pct: -16.1 ✓
- Narrative: describes workout on its own terms, no post-race framing, no false
  fitness claim from decoupling ✓

Follow-up: hr_delta_bpm returned null post-recompute despite sample_size=7.
build.ts:387 currentAvgHr may be resolving null for this row. Not blocking
(prompt rules already suppress the misinterpretation that depended on it) but
needs investigation.

Tests: 456/0 _shared (was 446 + 10 new); 19/0 cycling. New:
detect-workout-type.test.ts (6 pins), queries.test.ts (16 pins). Extended:
decoupling.test.ts (+8 pins). First analyzer-side test file — opens the
POLISH-PUNCH-LIST coverage gap.

Alternatives rejected: see PERF-COMPARISON-POOL-SPEC.md §3. Key: pace_delta
un-suppression explicitly rejected — pool_pace_context is the right surface for
intensity context, not reopening pace-delta-as-verdict.

---

## D-039 — Performance screen polish batch 1: CV hygiene, route naming, Arc forward-bias, decoupling surface split, HR-aware TREND, route minimum, segment label

Shipped: 2026-05-24 / commits 87c0d15e + 53b0cfe7 + e1d568f7 + fefd6204 +
dfb1b06e + edb97d75 + f18bd201

Seven fixes in one session, all Performance screen display layer:

1. CV outlier hygiene — clipped pace samples >1800 sec/mi before computing CV.
   A single stationary sample (stoplight, GPS dropout) was blowing CV to 908%,
   tripping the variance gate and misrouting steady long runs as fartlek.
2. Route naming — dropped route_runs.name (server-auto-generated "Route 53"
   counter) from fact packet. LLM now receives times_run only and phrases
   generically. Same defect class as D-035 workout_type literal.
3. Arc plan phase + forward-bias — fixed arc-context.ts returning 'unspecified'
   on active plans. Added forward-bias rule to unstructured_read and build_read:
   when active plan + next goal within 6 months, temporal anchor must be
   forward-looking. Hard ban on days_since_last_goal_race as lede frame.
4. Decoupling surface split — split raw-basis decoupling prompt rule into two
   branches: is_mixed_effort=false (steady raw) → surface drift number with
   plain description; is_mixed_effort=true → inconclusive, describe HR behavior
   only. Fixes "no drift info" on steady sessions.
5. HR-aware TREND label — TREND direction label now accounts for HR. When pace
   declines but HR also declines proportionally, label is neutralized. Prevents
   red "slower" framing on sessions where efficiency held.
6. TREND route minimum — bumped from 6 to 8 intensity-matched comparable runs
   before showing route chart. Below 8, text only.
7. Segment label — single-segment steady sessions show "Steady" not raw pace
   range string. Client-side, workout_type === 'long_run' || 'easy_run' +
   intervals.length === 1.

---

## D-040 — Performance screen polish batch 2: backward anchor hard ban, unplanned phase-label ban, segment label via workout_type, HR-aware TREND gate fix, route minimum bump

Shipped: 2026-05-24 / commits 9c4d5f36 + 3d26917c + 289c46d0 + ff25a614 +
df642b0d

Five follow-up fixes after D-039 recompute verification:

1. Backward anchor hard ban — shared backwardAnchorHardBan helper added to
   both build_read and unstructured_read modes. Explicit forbidden-pattern
   enumeration. D-039.3 only covered unstructured_read; build_read had no ban.
2. Unplanned phase-label ban — UNPLANNED MODE now explicitly bans phase label
   assertions (taper/base/build/peak) when is_unplanned=true and no plan link.
   LLM was confabulating "taper phase" without prompt support.
3. Segment label via workout_type — Fix C condition expanded from
   !is_mixed_effort to workout_type === 'long_run' || 'easy_run'. Variance gate
   trips on rolling-terrain pace CV but label decision uses workout_type as the
   signal. Decouples display from effort classification.
4. HR-aware TREND gate relaxed — gate was requiring ≥2 HR points per half;
   one null point per half drops a 5-point trend below threshold. Relaxed to
   ≥3 total + ≥1/half.
5. Route minimum — confirmed 8 is correct threshold post-D-039 verification.

---

## D-041 — Phase-aware TREND pool + Fix C segment label via workout_type

Shipped: 2026-05-24 / commits 2f4e04a4 + a6d34002

Two fixes after D-040 recompute:

1. Fix C final — client segment label condition expanded to include
   workout_type === 'long_run' || 'easy_run' when intervals.length === 1.
   is_mixed_effort gate was preventing "Steady" from firing on rolling-terrain
   long runs where pace CV tripped the variance gate.

2. Phase-aware TREND pool — when days_since_last_goal_race < 60 AND
   last_goal_race_date known, trend pool excludes points dated before the race.
   Pre-race taper runs (peak fitness, fast pace) were pooling against
   post-race re-entry runs, making TREND show "slower" when it was just a
   different training phase. Fallback: if exclusion drops pool below 3 points,
   include all with trend_pool_crosses_race_boundary: true flag. New prompt
   rule: when flag set, do not assert trend direction as fitness signal.

---

## D-042 — Wire run_easy_hr_trend into workout INSIGHTS (Q-023 resolved)

Shipped: 2026-05-24 / commit b83a7c8d

Problem: run_easy_hr_trend (pace-at-easy-HR delta vs chronic average) was
computed weekly in compute-snapshot, stored in athlete_snapshot, and consumed
by the conversational coach and plan generation — but never reached workout
INSIGHTS. The "are you getting fitter at the same heart rate" signal was
dead-coded into the session narrative surface.

Fix (Path A — minimal wire, ~4 files):
- analyze-running-workout/index.ts — extracts arc.latest_snapshot.
  run_easy_hr_trend alongside arc_narrative_context at the getArcContext call
- generateAISummaryV1 — new 8th arg runEasyHrTrendPct
- ai-summary.ts signals block — two new fields:
  aerobic_efficiency_trend_pct (raw number | null)
  aerobic_direction ('improving' | 'stable' | 'declining' | null)
  Thresholds: <-2% → improving, >+2% → declining, else stable (matches
  compute-snapshot:409)
- New AEROBIC EFFICIENCY TREND prompt rule: fires when aerobic_direction
  non-null; translates to plain language; never quotes the percentage; frames
  as weekly longitudinal background context, not a per-session verdict

Verified: "Your aerobic base is responding well" surfacing on linked easy run
session with populated athlete_snapshot. Rule self-gates on hard/interval
sessions (contextually irrelevant).

Q-023 resolved. run_easy_hr_trend rename still open (separate cleanup —
naming only, wire works against existing name).

7 new tests covering improving/stable/declining/boundary/null/omitted/NaN
inputs. 478/0 _shared + lib; 19/0 cycling.

---

## D-043 — Autonomous batch: 10-item punch list sweep

Shipped: 2026-05-25 / commits 87c0d15e through 141423ef

10 items, 7 functions deployed. Results:

Shipped functional code (5 items):
1. CV outlier hygiene — clip pace >1800 sec/mi before CV computation. Fixes
   misclassification of steady long runs as fartlek when GPS dropout or
   stationary sample blows up the coefficient of variation.
2. Route naming — dropped route_runs.name (server-auto-generated counter) from
   fact packet. LLM receives times_run only, phrases generically.
3. Arc plan phase + unstructured_read forward-bias — fixed arc-context.ts
   returning 'unspecified' on active plans. Forward-bias rule added to
   unstructured_read: active plan + next goal within 6 months → temporal anchor
   must be forward-looking.
4. Swim equipment line duplicate — client-side suppression when description
   already contains Pool gear line.
5. Tri-generator beginner swim rotation — swim_fitness === 'beginner' routes to
   css_aerobic instead of threshold on race_peak race-spec.
6. bikeOpeners taper gate — scoped from phase==='taper' to
   phase==='taper' && raceThisWeek. Mirrors swim-activation gate pattern.

Verified already resolved (3 items):
- Recovery week strength load (createPerfRecoverySession deadlift hardcode gone)
- Tradeoff message filtering (isInternalOptimizerTelemetry + scheduleSignalsNonEmpty already live)
- Brick session in plan export (tags emit → persist → client merge intact)

Partial / deferred (2 items):
- Q-015 drill repeat-pick memory — picker capability shipped (ca1e6cd0) but
  orchestrator harvest bug meant memory Set was always empty. Fixed in D-045.
- analyze-running-workout test coverage — _varGate extraction prerequisite;
  shipped in D-044.

---

## D-044 — Autonomous batch tail: drill caller wiring + varGate extraction + tests

Shipped: 2026-05-25 / commits ca1e6cd0 + dee5d9a4 + 9f6ea120

Item 6 — Drill repeat-pick caller wiring (Q-015 partial close):
prevWeekDrillTokens threaded end-to-end: generateAllWeeks rolling-Set
orchestration → buildWeek opts → swimSessionFromTemplate opts → 7 swim creators
(speedSwim, thresholdSwim, cssAerobicSwim, recoveryEasySwim, easySwim,
pullFocusedSwim, enduranceSwim) → pickSwimDrillInset. Back-compat: picker
no-ops when prevWeekDrillTokens undefined/empty. Marked partial — harvest bug
discovered in D-045.

Item 7 — _varGate extraction + 14 pin tests:
_varGate IIFE (~75 lines) extracted to lib/variance-gate.ts as exported pure
function computeVarianceGate. detectWorkoutTypeFromIntervals passed as function
arg to keep helper pure. 5 user-spec scenarios + 9 predicate-priority/boundary
pins. POLISH coverage-gap entry closed for variance-gate path. 891/0.

---

## D-045 — Drill token harvest bug fix (Q-015 fully closed)

Shipped: 2026-05-25 / commit 5b39865e

Problem: The orchestrator harvest loop in generate-combined-plan/index.ts:286-301
was reading week.days[].sessions[] but buildWeek returns week.sessions[] (flat
array, no .days wrapper). Array.isArray(undefined) === false → harvest loop never
ran → prevWeekDrillTokens reset to empty Set every week → picker filter was
effectively dead. Q-015 was marked closed in D-044 but the integration-level
behavior hadn't changed.

Fix: extracted harvest to drill-token-harvest.ts helper, replaced .days walk
with direct week.sessions[] walk. Token format (/^swim_drills?_/i) confirmed
correct — only the property path was wrong.

6 pin tests: harvest contract, non-swim filtering, plural/singular prefix,
OLD-shape regression sentinel (ensures the pre-fix .days path stays broken as
a canary), N→N+1 Catch-Up exclusion integration, baseline filter proof.

Verified: regenerated plan shows distinct drill families week-over-week.
W1 Fri Fingertip Drag → W2 Fri 6-3-6 Rotation + Single-Arm → W3 Mon Fingertip
Drag (different from W2). Cross-week repeat prevention confirmed live.

Q-015 marked RESOLVED.

---

## D-050 — Pace-at-HR percentile-classifier trend (Q-025 closed)

Shipped: 2026-05-25 / commits e95b3c94 → 1f11555e

Q-025 filed the misleading-direction-label bug on the TREND row: raw-pace
slope was mathematically honest but contextually wrong when the trend
pool spanned a pre-race peak-fitness taper vs post-race re-entry runs.
The athlete saw red "32s/mi slower" labels that were neither a fitness
regression nor a coaching signal — they were a pool composition artifact.

PACE-AT-HR-TREND-SPEC.md (D-047 Item 6, 2026-05-25) prescribed pace-at-HR
(sec/mi per 100bpm) as the normalized signal: faster pace at the same HR
= genuine aerobic-efficiency improvement, robust to fitness-state context.
Single-user calibration (D-047 batch) confirmed the formula scale + GAP-
basis preference + minimum-point-count ≥ 6, and recommended the percentile
classifier over the fixed ±15 cutoff for per-athlete adaptation.

Implementation (D-050, 5 pieces):

  Piece 1 (e95b3c94) — `pace_at_hr` field on each trend point in
  `fact-packet/queries.ts` (pool) + `build.ts` (current workout append).
  Formula: `pace_sec_per_mi * 100 / avg_hr`, basis-aligned with the pool's
  uniform pace_basis (GAP when useGapForTrend, raw otherwise). Null when
  avg_hr is missing.

  Piece 2 (6dc3ab5a) — percentile classifier in new helper
  `fact-packet/pace-at-hr-direction.ts`. GAP coverage ≥60% → restrict to
  gap-basis points; ≥6 points required or insufficient_data. Wired into
  fact-packet/build.ts; emits `pace_at_hr_direction` + `pace_at_hr_basis`
  on vs_similar.

  Piece 3 (36cec623) — session_detail_v1.trend contract surface:
  `points[].pace_at_hr` + `pace_at_hr_direction` + `pace_at_hr_basis`.
  Backward-compatible (all optional). session-detail/build.ts wires
  through from vs_similar.

  Piece 4 (f041619b) — client `SessionNarrative.tsx` plots pace_at_hr as
  primary line when usable (`pace_at_hr_direction` non-null + non-
  insufficient + ≥6 points + running unit). Athlete-facing labels:
  improving → "getting more efficient", stable → "holding steady",
  declining → "worth watching". Red color ONLY on declining; stable +
  improving never red. Falls back to raw-pace + server `summary` when
  classifier reports null / insufficient_data.

  Piece 5 (1f11555e) — 18 pin tests + responsiveness fix. While writing
  tests, discovered the original whole-window LR-slope classifier was
  structurally biased toward 'stable': linear regression slope ≈ mean of
  per-pair slopes, so the overall almost always landed in the middle
  third of the per-pair percentile distribution. Improving/declining
  effectively never fired on realistic data.

Classifier responsiveness fix (Piece 5 — locked):

  Session signal is now the MEAN OF THE LAST K=3 PAIR-SLOPES (smoothed
  recent trend), classified against the same p33 / p67 boundaries derived
  from the full pair-slope distribution within the window. This tracks
  the athlete's CURRENT direction (responsive) while smoothing single-
  session noise (the K=3 average suppresses one-shot outliers). Stable
  bias preserved for degenerate distributions (p33 === p67 — all pairs
  effectively equal → no session can be "unusually fast/slow vs typical").

  Verified behavior:
    back-heavy acceleration negative → improving
    back-heavy acceleration positive → declining
    front-heavy improvement then plateau → declining (recent trend
      reversal correctly surfaced even when cumulative window is net-
      negative)
    steady decline (uniform deltas) → stable (degenerate distribution
      suppresses signal — a perfectly steady trend isn't a NEW direction)
    wide-variance noise around zero → stable
    single outlier delta → stable (K=3 smooths)

Deploy scope: `analyze-running-workout`, `workout-detail`,
`recompute-workout`, `bulk-reanalyze-workouts`, `ingest-activity` — the
5-function fact-packet/analyzer fan-out. No plan-generation functions
touched.

Q-025 marked RESOLVED. PACE-AT-HR-TREND-SPEC.md §4 gates 1, 3, 4, 5 all
green; gate 2 (slope cutoffs) now obsoleted by the percentile classifier;
gate 6 (pin tests) satisfied by `pace-at-hr-direction.test.ts` 18/0.
Multi-user validation still warranted on production — the classifier's
behavior was calibrated on one athlete (D-047 batch); broader observation
may surface tuning opportunities (e.g. K=3 vs K=2 vs K=4 smoothing).

---

## D-051 — Race-Specific Aerobic 1500→2500 ramp (SWIM-PROTOCOL §5.4)

Shipped: 2026-05-25 / commit dc7470d3

Race-specific-phase lerp at `swim-program-templates.ts` inherited
`RACE_70_3_BUILD_*_YDS` endpoints (slot 1 = 2000→2400), under-scaling vs
spec target of 1500→2500. Added `RACE_70_3_RACE_SPEC_START_YDS` /
`RACE_70_3_RACE_SPEC_PEAK_YDS` constants and switched the race_specific
lerp to those. Build-phase slot 1 still uses `BUILD_*_YDS` (2000→2400) —
race-spec aerobic isn't part of build phase per §4.2; template
substitution exists but endpoint preserved. 24/0 swim tests green.

---

## D-052 — Four new swim session types (SWIM-PROTOCOL §5.7-§5.10)

Shipped: 2026-05-25 / commit 6049bcc1

Time Trial / Open Water Skills / Mixed-Fartlek / Race-Pace Sustained.
Each creator follows existing session-factory conventions:
appendPoolGearLine, structured steps_preset, tier-appropriate intensity.
`phaseSpecificMetaSubstitution` in swim-program-templates.ts swaps
slot[1] of the race-intent rotation per phase + weekInPhase:

  build phase  weekInPhase 2 → Mixed/Fartlek
  build phase  weekInPhase 4 → Time Trial (mid-build CSS test)
  race-spec    weekInPhase 1 → Race-Pace Sustained
  race-spec    weekInPhase 2 → Open Water Skills
  race-spec    weekInPhase 3 → Time Trial (pre-taper CSS test)

Beginner-banned per §10.2 — substitution no-ops for beginners. 91/0 swim
suite green.

---

## D-053 — Strip internal terms from athlete-facing swim copy (§0.5)

Shipped: 2026-05-25 / commit 3e47b58b

§0.5 athlete vocabulary is easy/moderate/hard ONLY. Internal jargon
(Z-codes, "threshold" word, "CSS pace") was leaking into descriptions:

  thresholdSwim       — "Zone 4 — maximal sustainable" → "hard effort"
  raceWeekActivation  — "NOT threshold" → "NOT a hard interval"
  recoveryEasySwim    — "Z1" / "Z1–Z2" → "easy effort"
  pullFocusedSwim     — "(Z3; ...)" → "(...)"
  enduranceSwim       — "easy aerobic (Z2)" → "easy aerobic"
  timeTrialSwim       — "your CSS pace" → "your 100yd pace target"

`zone_targets` field (internal, never client-facing per session-detail
audit) keeps Z-code summaries; steps_preset token grammar unchanged.
76/0 swim tests green.

---

## D-054 — WIZARD-AUDIT.md (no UI changes)

Shipped: 2026-05-25 / commit 8d8f1681

Read-only audit of every step in `ArcSetupWizard.tsx` (2951 lines).
Step-by-step findings plus 7 global findings (engine vocab leaks,
missing inline conflict warnings, no "I don't know" path, training_intent
promises vs reality, no mid-wizard jump-back, A/B/C priority labels
load-bearing without inline definition, plan-start picker only at Step 9).
Priority recommendations table for follow-up.

---

## D-055 — Items shipped: wizard training_intent softening + Q-026
unplanned backward anchor + Q-024 hr_delta_bpm + POLISH §1 trade-offs +
Cycling §4.3 brick close + Q-016 audit (deferral confirmed) + Q-027 filed

Shipped: 2026-05-25 / commits across the autonomous batch.

D-055 (umbrella decision number assigned at end-of-session) tracks the
13-item autonomous batch from 2026-05-25 that mixed item-level decisions
into a single end-of-session sweep. Individual entries: D-046 through
D-050 covered the prior shipment; this entry tracks items 11 (wizard
training_intent copy softening) + 12 (Q-027 days_since semantics audit).
See per-item commits + WIZARD-AUDIT.md G4 / OPEN-QUESTIONS Q-027.

---

## D-056 — Wizard polish batch (Items 1–8 of 2026-05-25 second autonomous batch)

Shipped: 2026-05-25 / commits 2d9764b0, 3bd83102, fe578215, 29262487, 2796c0b9, c8937ec0, 1da695ae

Eight wizard-side improvements from the WIZARD-AUDIT.md findings:

  Item 1 (2d9764b0) — engine vocabulary copy pass: replaced
    anchor/contract/standalone/blend/intent/phase-as-label/quality-as-label
    in athlete-facing copy across StepTriRunQualityPlacement,
    StepTriBikeQualityPlacement, Step3Swim, Step9Confirm, hint helpers.
    State field names + value enums unchanged.

  Item 2 (3bd83102) — A/B/C priority explainer chips in Step1Races:
    "A = main goal race / B = secondary / C = practice race".

  Item 3 (fe578215) — renamed "Hybrid Strength Athlete" to "Strength as
    a training priority (2× weekly compound lifting)" with expanded
    description.

  Items 4 + 5 (29262487) — Step7BHours hours-inclusion note;
    Step8bStrengthOrdering "only matters when same-day" inline lede.

  Item 6 (2796c0b9) — Step9Confirm building-progress indicator with
    estimated-time copy and animated sweep bar.

  Item 7 (c8937ec0) — "Not sure — use the recommended default" option
    on Step3Swim experience (→ 'steady'), Step8Strength intent
    (→ 'performance'), Step8bStrengthOrdering (→ 'endurance_first').

  Item 8 (1da695ae) — Step6LongDays inline non-blocking warning when
    long ride and long run pinned to the same day.

No engine logic changes — copy and inline UX only.

---

## D-057 — Q-016 experience-tier drill ratio (Path A only)

Shipped: 2026-05-25 / commit 0246c07f

Per Q-016 §2 spec but LOCKED at conservative 30/20/10 instead of §2's
aspirational 75/30/10 (calibration-driven decision to avoid double-
counting with session-count + band-volume layers per Q-016 audit).

  beginner    → 30% of total session yards
  intermediate → 20%
  advanced    → 10%

Wired into `pickSwimDrillInset` Path A (technique_aerobic 2-3 drills)
ONLY. Path B (single-drill css_aerobic/threshold/etc.) and beginner
one-focus path UNCHANGED — spec-fixed drill counts there. 350yd main-set
floor remains the hard floor; drill cap is a SOFT cap (overshoots up
to dy/2 allowed to avoid emitting zero drills). Secondary ranking now
tier-aware: beginners prefer larger tokens; advanced prefers smallest.
58/0 swim tests green.

---

## D-058 — Q-020 ankle band beginner body-position tool

Shipped: 2026-05-25 / commit b20d1aaa

Per SWIM-PROTOCOL §6.4 pull buoy + ankle band pairing. Three coordinated
changes:

  1. TrainingBaselines.tsx chip list — "Ankle band" added adjacent to
     "Pull buoy" so the pairing is visually obvious.
  2. swimGearNormalized — "Ankle band" / any "ankle" substring
     normalizes to canonical 'ankle band' key.
  3. pullFocusedSwim — when athleteFitness === 'beginner' AND ankle band
     is owned, emits `optional:ankle_band` alongside the existing
     `req:buoy`.

Beginner-gated per §6.4 (body-position teaching tool); intermediate /
advanced athletes don't surface the option. No drill-token integration —
fires at the session-tag level matching §6.4's pull-focused-session note.
41/0 swim tests green.

---

## D-059 — Q-022 segment_progress_metrics writer chain

Shipped: 2026-05-25 / commit 0adfc948

Per Q-022 audit: segment_progress_metrics hadn't received writes since
~2026-03-01 because the payload used wrong column names (`_sec_per_km`
suffix instead of live schema's `_s_per_km`; included non-existent
`metric_date` column from sibling route_progress_metrics table).
PostgREST returned 42703 column-does-not-exist; the three-variant
try/catch swallowed every error silently.

Fix:
  - Caller payload: renamed avg_pace_sec_per_km → avg_pace_s_per_km;
    grade_adjusted_pace_sec_per_km → grade_adjusted_pace_s_per_km;
    removed metric_date.
  - Variant C minimal payload: same column-name correction; removed
    metric_date.
  - Error handling: every Variant's try/catch now logs to console.warn
    with Postgres error code + workout_id + segment_id. Future schema
    drifts will surface instead of silently rotting.

Side-table `route_progress_metrics` unchanged — it correctly uses
`_sec_per_km` and `metric_date` per its own schema. Comment added at
the call site to flag the asymmetry.

Backfill of pre-fix workouts is OUT of scope (Q-022 audit point c) —
this fix gets new writes flowing; backfill is a separate decision.

---

## D-060 — run_easy_hr_trend DB column rename

Shipped: 2026-05-25 / commit cddea208

D-043 renamed the variable + types to runEasyPaceAtHrTrend but kept the
DB column at the old name. D-060 closes the cosmetic gap.

Migration `20260525_rename_run_easy_hr_trend.sql`: single ALTER TABLE
RENAME COLUMN (instant metadata-only operation; no row rewrite).

Coordinated consumer updates (same commit):
  - compute-snapshot/index.ts:537 — WRITE site
  - coach/index.ts:2628 — SELECT column list
  - analyze-running-workout/index.ts:2101 — snapshot field read
  - _shared/longitudinal-signals.ts — type field + SELECT + 2 evidence
    strings + doc comment
  - src/hooks/useAthleteSnapshot.ts — client TS interface

Not touched: ai-summary.ts (comment only), decoupling.test.ts (D-042
lineage test name string literals, not field access), arc-context.ts
(no refs).

IMPORTANT: migration MUST be applied BEFORE deploying the function
bundle that reads the new column name. ALTER TABLE RENAME is instant;
in-flight old code may briefly hit 42703 errors until functions bounce.
Acceptable for this low-write-rate snapshot table per the user's batch
authorization. Build + 33/0 decoupling tests green.

Historical note: prior session (2026-05-25 earlier batch) had the user
explicitly DROP the rename per "skip it — leaving the DB column name
alone is fine". This second batch (D-055/D-060 day) explicitly
authorized the rename. Memory updated.

---

## D-061 — Wire training_intent into combined-plan recovery + quality gates

Shipped: 2026-05-26 / commit a5762100

The WIZARD-AUDIT G4 / 2026-05-26 training_intent audit confirmed
`completion` and `first_race` produced identical combined-plan output
despite the wizard promising distinct prescriptions. D-061 closes the
gap on three differentiation axes:

Recovery cadence (loading pattern, overrides athlete pin):
  performance → '3:1' (every 4th week)
  completion  → '2:1' (every 3rd week)  NEW
  first_race  → '1:1' (every 2nd week)  NEW
  comeback    → '1:1'

Base-phase interval reps (run quality):
  performance / completion → standard 4→8 rep ramp
  first_race / comeback    → 80% cap (max 6 reps)

Build-phase VO2 gating (race_peak path, defensive):
  performance               → full VO2 ramp
  completion                → NO VO2 (downgrade to tempo)
  first_race / comeback     → no VO2 until weekInPhase ≥ 4

Implementation:
  - `loadingPatternForIntent()` helper in phase-structure.ts
  - applyLoadingPattern() + blockWeekMultiplier() extended with '1:1'
  - LoadingPattern type widened to '3:1' | '2:1' | '1:1'
  - Run-quality emission sites in week-builder.ts gain intent-aware
    branches for base-phase rep cap + build-phase VO2 gating

13 pin tests in training-intent-differentiation.test.ts lock the
contract (3-way recovery-week counts: 3 vs 4 vs 6 across performance /
completion / first_race in a 12-week build). 77/0 existing rebuild +
race-week tests still green.

Out of scope: swim and strength intent-wiring (separate Ticket B items
per user direction).

---

## D-062 — Cycling dashboard rows plain-language (Q-010 partial)

Shipped: 2026-05-26 / commit c2c32517

Per SESSION-CONTEXT.md §3 cosmetic-deferred note + Q-010: cycling
EFFICIENCY and POWER dashboard rows still carried technical
abbreviations the INSIGHTS prose was already jargon-banned from. Two
row translations in session-detail/build.ts:

  POWER:      "175W at IF 0.85" → "175W (85% of threshold)"
  EFFICIENCY: "EF 1.87 · 4.2% HR decoupling" → "Watts per heartbeat
              1.87 · HR drift 4.2%"

Wording change only — numeric values + gate logic unchanged. INSIGHTS
narrative side already jargon-clean via `summaryHasJargon` guard.

Not shipped: cycling LLM prompt closing-clause hedge softening — the
SESSION-CONTEXT §7 3-guard-stack footgun warns against modifying the
prompt without concrete reproducer; risk of degrading existing guard
interactions. Q-010 stays partially open for the hedge-softening half.

---

## D-064 — Swim placed on rest_day silently dropped

Shipped: 2026-05-26 / commit 1ac5ae30

486-combo plan-generation matrix surfaced a silent-drop pattern in two
swim placement layers of `week-optimizer.ts`:

  1. `masters_swim` anchor (lines ~1124-1141): when `state.swim_easy_day`
     was promoted to a masters_swim anchor by the reconciler AND
     `rest_days` included the same day, the anchor placed on the rest
     day. Week-builder then defensively skipped emission via
     `!swimSlot?.isRest`. Net: 1 swim/wk instead of 2.

  2. Preference-driven swim placement loop (lines ~1850-1905): the
     candidate `orderedRaw` filter chain checked spread + matrix but
     not rest_days; `preferredSwimDay` was also honored even when it
     collided with a rest_day.

  3. Loop seeding via `swimSlots.push({ day: mastersSwim.day, ... })` at
     line ~1830 used the raw input rather than `mastersSwimAnchor`
     (the result of actual placement), so when the anchor was rejected
     the loop still under-counted and emitted swimsPerWeek-1 swims.

Three-line fix: hoist `restDaySet`, filter it out of `orderedRaw`,
reject `preferredSwimDay` that collides, gate masters_swim anchor
placement on rest-day collision (push conflict, skip place()), and seed
the loop from `mastersSwimAnchor` not `mastersSwim`.

Matrix impact: swim_freq_build cluster 237 → 54 (-77%). Remaining 54
were a separate harness-side bug (D-067). Three regression tests in
`week-optimizer.anchor-contract.test.ts` lock the contract.

Co-fix surface: D-066 extended the same pattern to strength placement
and the load balancer.

---

## D-065 — Z-zone leak in downgradedHardToModerateFrom swim path

Shipped: 2026-05-26 / commit b0eec615

D-053 cleaned the swim creator descriptions to comply with SWIM-PROTOCOL
§0.5 (athlete-facing easy/moderate/hard vocabulary only). But the
generic HARD → MODERATE downgrade wrapper (`downgradedHardToModerateFrom`
at session-factory.ts:2136) prepended `"Moderate sustained effort (Z3 —
comfortably hard). "` to the underlying description — leaking the Z3
code to athletes. This fires on the Time Trial swim in build weeks when
the auto-downgrade pass replaces a HARD swim with MODERATE.

One-word fix: drop the `"Z3 — "` phrasing. `zone_targets` (internal
field, never client-facing per D-053) kept the Z-code unchanged.

Matrix impact: swim_jargon_Z 72 → 0.

---

## D-066 — Strength placed on rest_day silently dropped (extends D-064)

Shipped: 2026-05-26 / commit 8284ff93

Same silent-drop pattern as D-064 in three more places. Two surfaces:

  1. **Four strength placement candidate orders** in `week-optimizer.ts`:
     co-eq upper (line ~1498), co-eq lower-base (~1558), non-co-eq upper
     (~1687), non-co-eq lower (~1730). All used a hardcoded weekday list
     without rest_days filter. The non-co-eq path picked Monday first
     (rest_day) and the builder dropped it. Net for the
     `durability + cap=1` cluster: 0 strength sessions across 17 weeks.

  2. **Weekly load balancer** (`balanceWeeklySessionLoad` →
     `mutatingBalancerMove`): freely moved sessions INTO underloaded
     days, including rest days (which are by construction underloaded).
     Even when placement avoided Monday, the balancer would later move
     strength / swim / easy_run onto it, recreating the drop.

Fix: hoist `restDaySet` from D-064's swim section to the top of
`deriveOptimalWeek` so all placement layers share one source. Filter
rest_days out of all four strength candidate orders. Add
`restDays?: Set<DayName>` to `BalancerContext`; `mutatingBalancerMove`
refuses moves whose target day is in the set.

Matrix impact: strength_present 108 → 0 (-100%); pass rate 135 → 201
(post-D-065 → post-D-066).

Two regression tests added (durability+cap=1 and co-equal 2×).

---

## D-067 — Plan-matrix harness recovery detector uses peak instead of median

Shipped: 2026-05-26 / commit c91269bb · TEST HARNESS ONLY (no engine deploy)

`scripts/plan-generation-matrix.mjs` recovery-week detector used
`TSS < 0.75 × buildMedian`. For `1:1` loading patterns (first_race /
comeback intents per D-061), every-other-week recovery pushes the median
to fall between build and recovery TSS — recovery weeks then test as
above the 0.75 × median threshold and get treated as build weeks,
producing false-positive `swim_freq_build` failures on a 54-combo
`first_race/intermediate/*/*/70.3` cluster.

Fix: `0.75 × buildPeak` instead of median. Spec recovery multiplier is
0.65, which is always < 0.75 × peak regardless of loading-pattern
density. The detector is now robust to 1:1, 2:1, and 3:1 patterns.

Matrix impact: swim_freq_build_w8 54 → 0 (false positives only — no
real engine bug remained). Pass rate 201 → 255.

---

## D-068 — WoW TSS ramp ceiling calibration for distance-aware tri

Shipped: 2026-05-26 / commit d42dea90

The 20% week-over-week composite raw-TSS ceiling
(`WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX_TRI` in
`validate-training-floors.ts`) was calibrated when swim/strength
sessions were being silently dropped (D-064/D-066). With those dropped
sessions now correctly emitted, the legitimate composite ramp is
10-50 raw TSS higher per build week. Result: 231 HTTP 400 violations
in the matrix after D-066 shipped, concentrated at phase transitions
and race-specific peaks.

Two calibration adjustments (Approach A from the overnight batch):

  - Half-IM / sprint / olympic (`MAX_TRI`): 0.20 → 0.24. Observed max
    ramp 23.2% on 70.3 / 8hr / completion at build→race_specific.
  - Full-IM (new `MAX_FULL_TRI`): 0.30. Observed max ramp 28% on
    full / 8hr / completion at race-specific peak. Selected via
    `opts.primaryDistance === 'full'` in the validator, threaded from
    `floorOpts` in `generate-combined-plan/index.ts`.

Validator and its rebuild-loop machinery stay in place — the ceiling
still protects against pathological doubles, just calibrated for
distance-appropriate composite volume rather than the
post-D-064-bug baseline. Coaching literature (Friel, EnduranceNation,
Daniels) supports 20-25% for half-IM and 20-30% for full-IM
race-specific phases.

Matrix impact: HTTP 400 errors 231 → 0; final pass 486/486.

Approach B (phase-shaper TSS smoothing) was NOT taken — Approach A is
strictly less invasive and the resulting ceilings remain in defensible
coaching range.

---

## D-069 — first_race base phase emits sweet-spot, not intervals

Shipped: 2026-05-26 / commit 5b3de8f5

Plan-review finding: athletes with `training_intent='first_race'` or
`'comeback'` were seeing `"Run Intervals — 4×1000m at 10K/tempo pace"`
in base phase week 1. D-061's 80% rep cap on first_race base intervals
reduced dosage but not stimulus type — reps-reduced intervals are still
intervals, and the conservative-build philosophy that motivated D-061
calls for sustained sweet-spot tempo (not interval surges) until
athletes cross into build phase.

Two changes:

  - New `sweetSpotRun` helper in `session-factory.ts` — Z3 MODERATE
    effort at sweet-spot pace (RPE 6, "meaningfully harder than easy
    but not threshold"), 2-6 mi configurable. Tagged
    `['quality', 'sweet_spot', 'run']`, distinct from `threshold` tag.
  - Both base-phase quality-run branches in `week-builder.ts`
    (base_first AND race_peak tri_approach paths) gate on `isFirstRace`
    to emit `sweetSpotRun` instead of `intervalRun`.
    `performance` and `completion` intents keep the interval-base path.

Build-phase D-061 gate (no VO2 until weekInPhase ≥ 4 → downgrades to
tempoRun) intentionally unchanged — build-phase tempo is the on-ramp
toward race-specific threshold, appropriate at that point.

Matrix impact: no change (486/486 — assertion battery does not check
session label content). Verification by direct plan inspection:
first_race/intermediate/performance/full_barbell/70.3/11hr W1 quality
run is now "Sweet-Spot Run — 3 mi at moderate effort".

---

## D-070 — Swim equipment chip "what this unlocks" tooltips

**Date:** 2026-05-26
**Files:** `src/components/TrainingBaselines.tsx`.

Each swim equipment chip (Pool access, Open water access, Paddles, Pull buoy,
Ankle band, Kickboard, Fins, Snorkel) gets a one-line `title`-attribute
tooltip explaining what selecting it unlocks downstream in plan generation.
Copy lifted from SWIM-PROTOCOL §6.6 + §8.4 surface mappings: Fins → drill
sets; Paddles → CSS/threshold sets non-beginner only; Ankle band → pull+band
beginner stability work; etc.

Considered: a Popover/Tooltip React component with formatted multi-line
content. Rejected — title-attribute is zero-JS, works on desktop hover,
mobile-acceptable because chip labels are already self-descriptive. The
tooltip is the marginal "I want one more line of context" surface, not the
primary affordance.

`ArcSetupWizard.tsx` checked — no swim equipment chips live there; copy
lives solely in TrainingBaselines. Strength equipment chip tooltips
deferred (separate scope).

**Verification:** zero engine changes; visual inspection of TrainingBaselines
chip hover.

---

## D-071 — Materialize-plan fallback when "% 1RM" string can't resolve to a weight

**Date:** 2026-05-26
**Files:** `supabase/functions/materialize-plan/index.ts` (new
  `fallbackUnresolvedPercentDisplay` helper + wiring at both strength call
  sites), `supabase/functions/materialize-plan/index.test.ts` (5 pin tests).

Materialize-plan's strength resolution chain bailed silently when an
athlete's `performance_numbers` lacked the relevant 1RM baseline. The
strength object emitted with `weight: null` and `weight_display: undefined`,
and the client UI fell back to displaying the raw `strength_exercises[].
weight` string — `"65% 1RM (DB ≈ 70% barbell load)"` shown verbatim to
athletes. The string is engine-internal grammar from the protocol dispatcher
(triathlon_performance, minimum-dose, etc.), not athlete-facing copy.

Item 1's 6-tier sweep surfaced this: all three performance × {full_barbell,
dumbbell_based, bodyweight_bands} combos showed 35 `% 1RM` hits across 20
strength sessions. All three durability combos were clean (durability uses
bodyweight + band by spec, no `% 1RM` resolution needed).

Fix: new `fallbackUnresolvedPercentDisplay(weight, reps)` helper returns an
RIR-anchored coaching cue (`"Pick a weight you can do for 8 reps with 2 in
reserve"`) when the resolution chain bails on a `% 1RM` input. Wired into
both materialize-plan call sites (lines ~1697 and ~1859); fires only when
`finalWeightDisplay` is still null, so numeric weights computed upstream are
preserved.

Considered: refusing to materialize the session and surfacing a wizard
prompt to capture the missing 1RM. Rejected — too disruptive for athletes
mid-plan, and the RIR cue is a real coaching primitive (Rate of Perceived
Exertion at Reps In Reserve) athletes can act on without leaving the screen.
The 1RM gap remains a wizard-side improvement (separate ticket).

**Verification:** 5 pin tests in `index.test.ts` lock the contract:
`% 1RM` with numeric reps → RIR cue; `% 1RM (DB ≈ 70% ...)` modifier still
matches; `8-10` rep range picks the first integer; undefined reps →
generic moderate cue; non-`%` inputs (Bodyweight, qualitative, numeric)
return undefined so other branches own them. 17/17 materialize-plan tests
pass.

---

## D-072 — Per-week trade-offs thread through the athlete-facing filter

**Date:** 2026-05-26
**Files:** `supabase/functions/generate-combined-plan/index.ts` (per-week
  pipeline at lines 624-643), `supabase/functions/_shared/
  plan-generation-trade-offs.test.ts` (4 pin tests).

`filterAthleteFacingTradeOffs` was wired into the `generation_trade_offs`
aggregator at `plan-generation-trade-offs.ts:241` but NOT into the per-week
`week_trade_offs` pipeline in `generate-combined-plan/index.ts`. Result:
internal optimizer telemetry leaked into the per-week display — "Strength:
default Monday upper moved...", "Weekly load balance: moved quality_bike
from Tuesday to Wednesday...", "Weekly layout: moved easy_bike..." — all
surfaced to athletes as if they were tradeoffs. Anchor-reference messages
("adjust pinned long or group-ride days...") also surfaced unconditionally,
including on plans where the athlete pinned nothing — a false reference
that asked athletes to adjust pins they never set.

Fix: thread `week_trade_offs` through the same filter pipeline at
`index.ts:624-643`. The athlete-pins boolean is derived from `state` via
`hasAthletePinsFromPrefs` so anchor-reference messages survive when
they're actionable and drop when they aren't. Weeks that filter to empty
are dropped from the per-week dict (vs surfacing an empty list).

Considered: a second filter strictness level for the per-week pipeline (more
aggressive than the aggregator). Rejected — the leak class is identical;
single filter wins on simplicity. The aggregator's existing pin-detection
logic is reused intact via the `state` pass-through.

**Verification:** 4 pin tests in `plan-generation-trade-offs.test.ts`
(D-072 section): pure-internal-telemetry list filters to empty;
real-constraint messages survive (swim freq reduced, strength moved by
anchor rules, race-spec phase compressed); anchor-reference dropped when no
pins; anchor-reference KEPT when athlete pinned anchors. 34/34 _shared
trade-offs tests pass.

---

## D-073 — Cycling parity port: D-038 pool intensity filter + D-038/D-047 HR deltas

**Date:** 2026-05-26
**Files:** `supabase/functions/_shared/cycling-v1/cross-workout-queries.ts`
  (filter constants + `isIfWithinTolerance` + `classifyCyclingPoolIntensity
  Match` + extended `fetchCyclingVsSimilar`),
  `supabase/functions/_shared/cycling-v1/cross-workout-types.ts`
  (`CyclingPoolIntensityFilter`, `CyclingPoolPowerContext`, extended
  `CyclingVsSimilarV1`), `supabase/functions/_shared/cycling-v1/
  ai-summary.ts` (display surface + POOL INTENSITY CONTEXT prompt rule
  mirror), `supabase/functions/_shared/fact-packet/queries.ts` (export
  `getHrDriftBpmFromAnalysis`), `supabase/functions/analyze-cycling-workout/
  index.ts` (thread `currentAvgHr` + `currentHrDriftBpm`).

Cycling parity audit (2026-05-26) found four areas where the cycling
analyzer was running circa pre-D-034 relative to the run analyzer. This
ships Area 3 (pool intensity filter) and the Area 4 HR-delta slice — exact
mirrors of the run-side D-038 / D-047 implementations. Decoupling,
longitudinal trend, post-race flag, and the mixed-effort consequences were
deferred per user direction ("mirror the D-038 run implementation exactly.
Use the same field names, same fallback pattern, same prompt rule
structure. Do not invent new approaches").

Implementation: `POOL_IF_TOLERANCE_PCT = 15` and `POOL_INTENSITY_MATCH_PCT
= 10` constants match the run side. `fetchCyclingVsSimilar` extended to
collect all type+duration matches (instead of early-breaking at 3) so the
IF filter has candidates to narrow; applies the filter with 3-hit fallback;
computes HR + drift averages via the shared D-047 helpers; populates two
new diagnostic / context fields. `CyclingPoolPowerContext` parallels the
run's `pool_pace_context` with cycling-domain naming since pace and power
are different metrics; same `matched` / `current_much_harder` /
`current_much_easier` trichotomy. The POOL INTENSITY CONTEXT prompt rule
composes with UNPLANNED MODE and MIXED-EFFORT MODE per the run analogue.

Considered: shared cross-sport pool helpers in `_shared/`. Rejected for now
— the parity port favours sport-specific mirrors so changes to one
analyzer's pool semantics don't silently move the other. A consolidation
pass is fair follow-up after both sides stabilize.

**Verification:** rationale partially reconstructed from commit message —
no per-workout end-to-end verification was logged. Cycling parity audit
(per ENGINE-STATE) confirmed Area 3 / Area 4 shipped; downstream cycling
LLM consumes the new fields per the prompt rule.

---

## D-074 — `plans.start_date` phantom column reverted; `environment` default no longer leaks to non-swim planned rows

**Date:** 2026-05-26
**Files:** `supabase/functions/generate-combined-plan/index.ts` (hoisted
  `planStartDate` local — INSERT into `plans.start_date` reverted),
  `supabase/functions/activate-plan/index.ts` (baseRow:540 gains
  `environment: mapped === 'swim' ? 'pool' : null`).

Two related cleanups surfaced by the May 23 ride attach audit. Initial
investigation attempted to set `plans.start_date` via INSERT — PostgREST
returned `PGRST204 schema error: column does not exist`. The canonical
anchor for a plan's start lives at `plan.config.user_selected_start_date`;
there is no top-level `start_date` column on `plans`. INSERT attempt
reverted. The hoisted `planStartDate` local in `generate-combined-plan/
index.ts` was kept (single source of truth for `plan_contract_v1.start_date`
+ `plan_config.user_selected_start_date`).

Separately, `activate-plan/index.ts:540` baseRow construction did not set
`environment`, so the swim-only `DEFAULT 'pool'` column was surfacing on
ride / run / strength planned rows. Fixed by passing `environment: mapped
=== 'swim' ? 'pool' : null`.

Considered: adding a `start_date` column via migration. Rejected — the
config field is already the canonical anchor; an additional column would
duplicate state and risk drift.

**Verification:** rationale partially reconstructed from commit body. The
`activate-plan` change is unit-verifiable; the `plans.start_date` revert
is a no-op fix (returning to known-good state).

---

## D-075 — `analyze-cycling-workout` planned_workouts SELECT used phantom column names; silent 42703 broke every linked cycling ride

**Date:** 2026-05-26
**Files:** `supabase/functions/analyze-cycling-workout/index.ts` (lines
  ~1534-1539 + error capture).

The SELECT statement listed `workout_type` and `workout_name` — columns
don't exist on `planned_workouts`; the correct names are `type` and
`name`. PostgREST returned `42703` silently because the destructure did
not capture `error` and the code did not check it; `single()` returned
null. Net effect: `plannedWorkout: null` for **every** linked cycling
ride; `intervals = []`, performance null-fields, `_hasLinkedPlan = false`,
and the cycling LLM ran UNPLANNED MODE for every planned ride.

Fix mirrors the run-side pattern (`analyze-running-workout/index.ts:455-
466`): SELECT only existing columns AND capture + check `plannedError`.
After fix, the analyzer correctly reads the linked plan; downstream
consumers (vs_similar pool, INSIGHTS narrative, adherence chips) all
receive real plan data.

Considered: adding generated-types check at build time. Deferred — broader
infra work; the immediate fix is the SELECT + error check pattern. Run-
side analyzer already follows the pattern; cycling now matches.

**Verification:** May 23 ride (id `7679f3a8`): recompute post-fix produced
non-null `plannedWorkout`, intervals populated, `_hasLinkedPlan: true`,
LLM no longer in UNPLANNED MODE for this planned ride.

**Footgun:** any new SELECT against `planned_workouts` MUST capture and
check `error`. Service-role queries with phantom columns return null data
silently; downstream null-or-undefined handling masks the failure. Two of
the May 26 cascade's bugs were this exact class (the other is D-081).

---

## D-076 — HARD BAN on route / course / GPX language in cycling LLM prompt

**Date:** 2026-05-26
**Files:** `supabase/functions/_shared/cycling-v1/ai-summary.ts` (HARD BAN
  rule appended after UNPLANNED MODE; "climbing route" seed word removed
  from the SO-WHAT example at line 389).

Cycling LLM was synthesizing the phrase `"unplanned route"` by combining
`is_unplanned: true` with the prompt's "climbing route" example in the
SO-WHAT rule. The packet carries NO route, course, or GPX data — Efforts
has no signal for whether the athlete chose a route. Conflating
`is_unplanned` (= no linked plan workout) with route planning is wrong on
both counts.

Two-part fix:
- **A. HARD BAN rule** appended after the UNPLANNED MODE block. Rule text
  explicitly forbids route-planning concepts in any form (planned route /
  unplanned route / route choice / mapped route / off-route / etc.).
  Describes terrain through data that IS in the packet: VAM, total ascent,
  climbing signals, and the existing "climbing day" / "rolling day" /
  "flat day" terrain-class vocabulary.
- **B. Seed-word removal.** `"climbing route"` → `"climbing day"` in the
  SO-WHAT example at line 389. The model was pattern-matching on the
  example token; removing it eliminates the synthesis path even if rule A
  were somehow skipped.

Together: A blocks the synthesis path with a hard rule; B removes the
substrate the synthesis was drawing on. Defense in depth.

Considered: a deterministic validator that rejects responses containing
"route" / "course" / "GPX". Deferred — the prompt edits should suffice
for the dominant case; a validator can be added if regression-in-wild
reveals leakage.

**Verification:** 23/23 cycling-v1 ai-summary tests pass post-edit; no
production-output regression on the May 23 ride.

---

## D-077 — Cycling FTP "Edit to override" tap handler + FTP-COLD-START-SPEC.md saved

**Date:** 2026-05-26
**Files:** `src/components/TrainingBaselines.tsx` (`ftpInputRef` +
  `focusFtpInput` helper + `<button>` wrap), `docs/FTP-COLD-START-SPEC.md`
  (new).

**UI half (D-077).** `TrainingBaselines.tsx` cycling section's "Auto-learned
N W ([Edit to override])" hint was a non-interactive `<span>`. Athletes
read it as an instruction (the word "Edit" implies tappability) and tapped
with no result. Fix: `ftpInputRef` + `focusFtpInput()` helper focuses and
selects the FTP input on tap; "Edit to override" wrapped in a `<button>`
calling the helper. The static "Manual" / "Manual (auto-learned improved
to N W)" hints remain unchanged (display-only).

**Docs half (FTP-COLD-START-SPEC.md, new).** Cold-start FTP seeding design:
W/kg-by-tier midpoints × bodyweight × 0.90 discount, stored at
`learned_fitness.ride_ftp_estimated` with `confidence: 'low'`, source
`'wizard_estimated'`. Quality-gated consumers (race projections, fitness
inference) still treat low-confidence estimates appropriately per the
existing `resolveCurrentFtp` 3-tier precedence (learned≥medium → manual →
learned-low → null). Spec doc preserved for future wizard FTP-seeding
work; no code change yet.

Considered: a Tooltip ("tap the input above to edit"). Rejected — the
existing input is right next to the hint; a tooltip adds friction. The
focus + select is the canonical iOS / mobile pattern.

**Verification:** UI tap focuses the FTP input on the visible
`TrainingBaselines` cycling section.

---

## D-078 — `recompute-workout` force-regenerates `ai_summary`; preservation fallback gated on `!forceRegenerate`

**Date:** 2026-05-26
**Files:** `supabase/functions/recompute-workout/index.ts` (passes
  `force_regenerate_ai_summary: true`),
  `supabase/functions/analyze-running-workout/index.ts` (reads body flag,
  gates preservation), `supabase/functions/analyze-cycling-workout/index.ts`
  (same).

Audit of the May 23 ride after D-076 deployed found `ai_summary` STILL
showing pre-D-076 narrative. The analyzer ran cleanly (deterministic fields
refreshed) but the LLM call returned null and the existing preservation
logic kicked in (`analyze-cycling-workout:2506` preserves the prior
`ai_summary` on LLM failure). Preservation is correct default behavior for
ingest-activity transient errors — but wrong for user-triggered recompute,
where the athlete explicitly asked for fresh analysis after the prompt
itself changed.

Fix: `recompute-workout` passes `force_regenerate_ai_summary: true` in the
analyzer invoke body; both analyzers read it and gate the preservation
fallback on `!forceRegenerateAiSummary`. ingest-activity and compute-facts
paths unchanged so transient sync-time LLM hiccups still preserve good
narrative; user-triggered recompute forces fresh.

Considered: making recompute always force-regenerate vs respecting an
opt-out param. The opt-in shape is cleaner — recompute is the surface
explicitly asking for fresh; everything else is auto-recompute via ingest
where preservation is the right default.

**Verification:** May 23 ride (id `7679f3a8`): direct call to recompute
post-fix forced regeneration; the LLM still returned null on this specific
packet (the next layer, D-079 / D-083, owned that root cause).

---

## D-079 — Cycling analyzer writes `recomputed_at` (run-side parity for cache-bust)

**Date:** 2026-05-26
**Files:** `supabase/functions/analyze-cycling-workout/index.ts` (one-line
  add to the `workout_analysis` update block at line ~2611).

The run analyzer at `analyze-running-workout/index.ts:2817` writes
`workout_analysis.recomputed_at = new Date().toISOString()` on every
analyzer run. The cycling analyzer didn't. `workout-detail`'s
`isSessionDetailStale` check at line 112-116 reads `recomputed_at` to
decide whether to rebuild `session_detail_v1`; without it, cached
session_detail_v1 for cycling could persist past analyzer reruns until a
secondary staleness signal tripped (`arc_performance.version` bump,
`workouts.updated_at` advance, or the 24h timeout). Run-side parity gap
independent of any single is_unplanned investigation.

Fix: one-line add to the `workout_analysis` update block — `recomputed_at:
new Date().toISOString()`.

Considered: a cross-sport shared helper that wraps every analyzer's update
block. Deferred — three call sites is too few to warrant the abstraction;
this is the "delete the old, replace inline" pattern.

**Verification:** May 23 ride: post-fix recompute produces fresh
`recomputed_at`; next `workout-detail` invocation correctly rebuilds
`session_detail_v1`.

---

## D-080 — Debug log in workout-detail for ledger-match resolution (instrumentation, since removed)

**Date:** 2026-05-26
**Files:** `supabase/functions/workout-detail/index.ts` (drop-in
  `console.log` before `buildSessionDetailV1` call at line ~598; removed
  in the D-081 commit after surfacing the data point).

Drop-in instrumentation to pinpoint why `is_unplanned: true` was
surfacing on a workout with a populated `planned_id`. Logged the resolved
ledger match alongside `plannedRows.length`, `softMatchSource`, and the
final `match?.planned_id`. Purpose: reveal whether the ledger fails to
produce the match OR whether `softMatch` Pass 4 emits `unplanned session`
because no planned rows reach the builder.

Result: surfaced `ledger_day_planned_count: 0` for a workout whose
`planned_id` was confirmed in `planned_workouts` — pinpointed D-081 (the
SELECT itself was failing silently for all sports).

Block removed in the D-081 commit; the log served its narrow diagnostic
purpose and is not a permanent surface.

Considered: keeping the log permanently behind a flag. Rejected — D-082
established the durable diagnostic surface (`workout_analysis.
ai_summary_debug` for LLM-call diagnostics). For ledger / SELECT debugging,
the right answer is more SELECT-error capture (which D-075 / D-081 / D-088
codified), not a permanent console log.

**Verification:** the log itself was the verification surface.

---

## D-081 — `workout-detail` planned_workouts SELECTs used phantom column names; silent 42703 broke linked-plan detection for ALL sports

**Date:** 2026-05-26
**Files:** `supabase/functions/workout-detail/index.ts` (3 SELECT sites at
  lines 360, 453, 492).

Three SELECT statements in `workout-detail/index.ts` listed three phantom
columns: `swim_unit`, `baselines_template`, `baselines`. None exist on
`planned_workouts`. Same silent-42703 class as D-075. Affected EVERY sport
— `plannedRows: []` → ledger saw zero planned rows → `softMatch` Pass 4
emitted `unplanned session` for every actual workout → `session-detail/
build.ts:650` `is_unplanned: !match?.planned_id` evaluated to `!null` =
`true` for every linked workout. Downstream consumers in `session-detail/
build.ts:1000-1007` reading `baselines_template` / `baselines` fields with
optional chaining had been getting `undefined` for as long as the SELECT
shape existed — swim baseline reads silently broken across the board.

Fix: removed the three phantom columns. Reads degrade gracefully (already
were) — the displayed swim-baseline-derived hints just stop populating from
that source. The actual swim baselines live on `user_baselines.performance
_numbers`, which the analyzer / display path reads separately.

Considered: keeping the phantom names for "future compatibility" if those
columns might be added. Rejected — speculative; PostgREST silently fails
on phantom columns; better to fail loud (or in this case, correctly read
nothing) than fail silent.

**Verification:** May 23 ride: post-fix, `plannedRows` populates,
`softMatch` returns the correct planned row, `is_unplanned: false`.
Cross-sport: run / swim / strength workouts also stop mis-rendering as
unplanned.

**Footgun (cross-sport):** this single SELECT defect was the root of "every
linked workout looks unplanned" across all four sports. Always capture
`error` on PostgREST destructures; never trust silent nulls.

---

## D-082 — LLM diagnostics instrumentation (`callLLM` debug sink + `workout_analysis.ai_summary_debug` field)

**Date:** 2026-05-26
**Files:** `supabase/functions/_shared/llm.ts` (`callLLM` accepts optional
  `debug` mutable object), `supabase/functions/_shared/cycling-v1/
  ai-summary.ts` (`generateCyclingAISummaryV1` threads `debug`; per-attempt
  diagnostics + validator outcomes), `supabase/functions/analyze-cycling-
  workout/index.ts` (writes captured diagnostics to `workout_analysis.
  ai_summary_debug`).

The LLM-call surface was a black box from the REST side — every cycling
LLM call returned null with no visibility into whether the API call was
even made, whether the response was empty, whether the validator rejected
it, etc. Without dashboard log access, diagnosing dormant exceptions in
the analyzer's try/catch required hand-instrumentation per investigation.

Fix: a debug-object pattern. `callLLM` accepts an optional mutable `debug`
object and populates it in-place with `has_api_key`, `http_status`,
`http_ok`, `error_message`, `response_chars`, `response_excerpt`,
`stop_reason`, etc. `generateCyclingAISummaryV1` accepts its own `debug`
sink and adds per-attempt diagnostics (model, max_tokens, normalized_chars)
+ validator outcomes (`attempt_N_validator: { ok, jargon, lede_arc, bad_
numbers }`). `analyze-cycling-workout` writes the captured diagnostics to
`workout_analysis.ai_summary_debug` for REST-side visibility.

Result: D-083's `ReferenceError` was found within 30 seconds of D-082
shipping. The instrumentation revealed `outcome: 'attempt_exception'` with
`exception: 'isUnplanned is not defined'` — exactly the dormant exception
class the analyzer's try/catch was swallowing.

Considered: removing the instrumentation after D-083 closed. Decided to
keep it — the cost is one JSONB field per row, and the next dormant
exception will be cheaper to diagnose. Removable in future cleanup once
the LLM call surface stabilizes.

Considered: structured logging to a separate observability table.
Deferred — the JSONB-on-workout pattern is queryable via REST, the
existing surface most callers already have, and doesn't introduce new
tables.

**Verification:** D-083 found within 30 seconds. Instrumentation continues
to provide the surface for future dormant-exception hunts.

**Footgun:** any reference to a variable defined inside a nested function's
scope from the outer scope WILL throw `ReferenceError` and be swallowed
by the analyzer's try/catch. The D-082 instrumentation is the existing
diagnostic surface for this class — KEEP IT until the next dormant
exception lands.

---

## D-083 — `isUnplanned` ReferenceError silently killing every cycling LLM call since D-046

**Date:** 2026-05-26
**Files:** `supabase/functions/_shared/cycling-v1/ai-summary.ts` (two-line
  fix at the top of `generateCyclingAISummaryV1`).

`_shared/cycling-v1/ai-summary.ts:426` referenced `isUnplanned` from
`generateCyclingAISummaryV1`'s outer scope — but `isUnplanned` was only
defined inside `toDisplayPacket`'s scope. Every cycling LLM call since
D-046 shipped (2026-05-25) threw `ReferenceError: isUnplanned is not
defined`. The analyzer's try/catch swallowed the exception, set
`ai_summary` to null, and the preservation fallback re-served pre-D-046
narrative on every recompute. **The cycling LLM was never actually being
contacted for ~24 hours**, and no one noticed because the displayed
narrative looked plausible (it was the pre-D-046 cached text).

Fix: two-line add at the top of `generateCyclingAISummaryV1`:
```typescript
// D-083: `isUnplanned` is defined inside toDisplayPacket's scope, NOT here.
const isUnplanned = unplannedGate?.isUnplanned === true;
```

Considered: removing the outer-scope reference entirely and threading
`isUnplanned` through a parameter. Deferred — the inline fix preserves the
existing call shape; D-046's backward-anchor addon needs the value at the
outer-scope `systemPrompt` construction.

**Verification:** D-082 instrumentation showed `outcome: 'attempt_excep
tion'` pre-fix, `outcome: 'attempt_1_accepted'` post-fix. May 23 ride's
ai_summary regenerated fresh.

**Footgun (general):** Deno's lexical scoping is sharp; a variable defined
inside a nested function (`toDisplayPacket` is a function expression
declared inside `generateCyclingAISummaryV1`) is NOT visible in the outer
function's later statements. Linting (`noImplicitAny: false` plus
`@ts-nocheck` on this file family) won't catch the reference. The
analyzer's try/catch swallows the runtime error. Three layers of silence.

---

## D-084 — "unknown effort" classifier leak + Duration chip absolute time

**Date:** 2026-05-26
**Files:** `supabase/functions/_shared/cycling-v1/build.ts` (normalizePlan
  Intent + classifier short-circuit guard), `src/components/AdherenceChips.
  tsx` (`fmtDurAbs` helper + Duration chip).

Two Performance-tab cosmetic issues, both made visible by D-075 / D-081 /
D-083 (now reaching the UI with real data):

1. **`normalizePlanIntent('ride')` returned the literal `'unknown'`** for
   discipline-only types ('bike' / 'ride' / 'cycling'). `planIntent ||
   fallbackClassifyIntent(...)` short-circuited because `'unknown'` is a
   truthy string → classifier never ran → POWER row read "unknown effort".
   Fix: return null for discipline-only types at `normalizePlanIntent`
   (so the fallback fires) + defense-in-depth `'unknown'`-aware guard at
   line 215 (`planIntent && planIntent !== 'unknown' ? planIntent : null`).
2. **Duration chip secondary line was a +/- delta** (`+3:00`) from plan.
   The adherence % above already conveyed "how close to plan"; the delta
   was confusing in absolute terms (a +3:00 on a 5-hour ride reads
   different from +3:00 on a 30-minute ride, but both render identically).
   Switched the secondary line to absolute completed duration via new
   `fmtDurAbs(s)` helper (H:MM:SS when ≥1h, else M:SS).

Considered: making `'unknown'` a sentinel that explicitly fails the
short-circuit (single test). Implemented BOTH the `normalizePlanIntent`
return-null change AND the defense-in-depth guard — the two layers protect
against future paths that might re-introduce `'unknown'` for any reason.

**Verification:** May 23 ride post-fix: POWER row renders "threshold effort"
(now "sweet spot effort" post-D-091); Duration chip shows `2:03:00`
absolute instead of `+3:00` delta.

---

## D-085 — `compute-workout-analysis` reads FTP via `resolveCurrentFtp` (was bypassing the 3-tier precedence)

**Date:** 2026-05-26
**Files:** `supabase/functions/compute-workout-analysis/index.ts` (line
  ~921; import + use `resolveCurrentFtp`).

`compute-workout-analysis/index.ts:921` was reading FTP only from
`performance_numbers.ftp` (manual entry), ignoring `learned_fitness.
ride_ftp_estimated`. The shared `resolveCurrentFtp` helper (`src/lib/
resolve-current-ftp.ts`) — used by `send-workout-to-garmin`,
`calculate-workload`, `compute-facts`, `materialize-plan`,
`athlete-snapshot`, `infer-training-fitness` — was bypassed here. Athletes
with no manual entry but a high-confidence learned FTP had their entire
ride history's `intensity_factor` / `computeRideTss` / **power-zone bins**
(line ~1568 falls back to hardcoded `200 W`) computed against 200W instead
of their actual learned threshold.

Fix: import + use `resolveCurrentFtp` like every other consumer. Precedence
preserved: learned ≥ medium confidence → manual → learned low → null.

Considered: keeping the manual-only read for backward compatibility.
Rejected — the manual-only read was the bug; every other consumer in the
codebase already uses `resolveCurrentFtp`, so this was the lone outlier.

**Verification:** May 23 ride: `compute-workout-analysis` HTTP 200,
`intensity_factor` populated from learned FTP (athlete has no manual
entry). Backfill not required — the analyzer re-derives on each compute.

---

## D-086 — Group ride anchor false `'wednesday'` fallback removed; optimizer picks best matrix-clean day

**Date:** 2026-05-26
**Files:** `supabase/functions/generate-combined-plan/reconcile-athlete-
  state-week-optimizer.ts` (line ~82).

`reconcile-athlete-state-week-optimizer.ts:82` returned `{ day:
'wednesday', intensity: 'quality' }` when `bike_quality_day` was null but
group-ride signals existed (route URL, duration estimate, or
"group/hammer/club" label keyword). Main wizard flow (`ArcSetupWizard.tsx:
601-603` writes `state.groupRideDay → preferredDays.quality_bike →
AthleteState.bike_quality_day`) was always correct for any day; the
fallback fired only on edge cases where group-ride signals existed but the
day didn't make it into `bike_quality_day` — producing a false Wednesday
anchor regardless of actual ride day.

Fix: return `undefined`; let the optimizer's `quality_bike` placement loop
pick the best matrix-clean weekday.

Considered: persisting the inferred day from the group-ride signals
themselves (e.g., parse "Sunday group ride" from a label). Rejected —
the parsing surface is too brittle; the wizard already captures the day
explicitly, and the edge case is rare. Returning undefined and trusting
the optimizer's placement is the conservative, low-blast-radius fix.

**Verification:** main wizard flow regenerates a plan with any
athlete-selected group ride day; engine respects it.

---

## D-087 — `scaledWeeklyTSS` validator parity: reads `endurance_hours`, not declared hours

**Date:** 2026-05-26
**Files:** `supabase/functions/generate-combined-plan/index.ts` (validator
  hours wiring at line ~458 + new local `validatorHours`).

The week-builder (`week-builder.ts:734-736`) and `plan_contract_v1.weekly_
tss_target` (`index.ts:601`) already used `endurance_hours ?? weekly_hours_
available` per D-021 / Q-005. The plan validator at `validator.ts:73
checkTSSWithinBudget` received `state.weekly_hours_available` (declared) at
`index.ts:458` — its TSS target was **inflated** relative to the actual
week-builder budget. The validator's `if (w.total_raw_tss > target * 1.15)
return false` check effectively had a slack ceiling for hybrid athletes;
weeks that should have tripped silently passed.

Fix: thread `validatorHours = scheduleState.session_frequency_defaults?.
endurance_hours ?? state.weekly_hours_available` and pass to `validatePlan`.
Mirrors the existing pattern at both other call sites.

Considered: re-deriving the canonical hours inside `validatePlan` instead
of plumbing through the call site. Rejected — the validator is intentionally
data-in / verdict-out; threading the canonical value at the call site keeps
the validator pure.

**Verification:** NO_CACHE=1 matrix 486/486 pass post-batch. Week-builder
TSS target now matches validator TSS target for all three consumers.

---

## D-088 — `materialize-plan` phantom column reads in swim pace lookup (same class as D-081)

**Date:** 2026-05-26
**Files:** `supabase/functions/materialize-plan/index.ts` (lines 2270 /
  2277).

Two lines in the swim pace lookup read `(row as any)?.baselines_template?.
swim_pace_per_100_sec` and `(row as any)?.baselines?.swimPace100` — both
columns don't exist on `planned_workouts` (same class as D-081). The reads
returned `undefined` silently; the working path via `user_baselines.
performance_numbers.swimPace100` was unaffected (the actual swim baseline
flow runs through `user_baselines`, not `planned_workouts`).

Fix: removed the dead phantom-column tertiary fallbacks. Code now honest
about what it reads:
```typescript
const numPace = baselines?.swim_pace_per_100_sec;
const strPace = (baselines as any)?.swimPace100;
```

Considered: leaving the dead reads as "defensive" code. Rejected — they
were silently false; the working path is the primary path and the dead
fallbacks just added phantom-column references that lint / refactor
tools could trip over.

**Verification:** NO_CACHE=1 matrix 486/486 pass post-fix. Swim pace flow
unchanged (always was reading from `user_baselines`).

---

## D-089 — Cycling analyzer interval_breakdown wraps as { available, intervals } to match the run-aligned shape every consumer expects

**Date:** 2026-05-27
**Files:** `_shared/cycling-v1/ai-summary.ts` (`avg_power_watts` alias),
  `_shared/session-detail/build.ts` (sport-neutral power-range subtitle +
  power_adherence fallback), `analyze-cycling-workout/index.ts` (wrap +
  per-type interval numbering).

Cycling's `generateIntervalBreakdown` returned a bare array; every consumer
in the codebase expected `{ available: true, intervals: [...] }`. The five
consumers — session_detail/build.ts:234, workout-detail/index.ts:1238
enrichment, _shared/cycling-v1/ai-summary.ts:259, generate-training-context/
index.ts:1669, _shared/fact-packet/build.ts:305 — all silently saw nothing
on cycling workouts. The cycling AI summary's own per-interval narrative
(`buildCyclingIntervalSummary`) had been emitting null since it landed,
because its type signature already required `{ intervals?: any[] }`.

Three companion changes shipped with the wrap:
- `avg_power_watts` field alias on each interval, because
  session_detail/build.ts:274 reads `iv?.avg_power_watts` (the sport-neutral
  field name), not cycling's local `actual_power_w`. Adding the alias keeps
  the session_detail builder cycling-agnostic.
- Per-type interval numbering (work N / recovery N) replaces global
  `index + 1`. Labels render "Interval 1/2" instead of "Interval 2/3" on a
  workout structured as warmup / work / recovery / work / recovery / cooldown.
- session_detail/build.ts derives `planned_pace_display` from
  `planned_power_range_lower/upper` as "150-167 W" when present (rides have
  no pace range; the subtitle would otherwise be empty). Falls back to
  `power_adherence_percent` for the adherence badge so the existing
  sport-neutral `pctColor` renders the right color on rides.

Considered: adding a cycling-specific code path in session_detail/build.ts
that branched on `IntervalRow` shape. Rejected — the field-alias approach
adds one line at the analyzer write site and keeps the display builder
sport-neutral, which is the existing pattern (run analyzer also uses
neutral field names). Cross-sport contracts must be shape-aligned at the
source, not branched at the consumer.

**Verification:** workout `f9fb690b` (Strava Zwift sweet spot 2×15) —
detailed_analysis.interval_breakdown now `{ available: true, intervals: [4
entries pre-D-090 / 6 entries post-D-090] }`, `avg_power_watts` populated
(109/166/162/77 W), `planned_power_range_lower/upper` populated.

---

## D-090 — Cycling recoveries render in the interval table with explicit-null adherence (not filtered out)

**Date:** 2026-05-27
**Files:** `analyze-cycling-workout/index.ts` (filter, per-interval
  null-emission, weighted-loop skip), `_shared/session-detail/build.ts`
  (explicit-null short-circuit).

Pre-D-090 the cycling interval-breakdown filter required `i.power_range`,
dropping recovery segments (which don't carry a power target). A 2×15
sweet-spot ride showed 4 rows of 6 — both rest periods were silently
missing.

Filter extended to also accept role/kind matching `/recover|rest/` so
recoveries reach `generateIntervalBreakdown`. Inside the generator, recovery
items emit with `power_adherence_percent: null`, `performance_score: null`,
`planned_power_range_lower/upper: null`, `adherence_percentage: null`,
`duration_adherence_percent: null` — explicit null carries the intent
"explicitly ungraded," distinct from missing. The weighted session-score
loop skips intervals where `power_adherence_percent == null` so recoveries
don't depress the aggregate to 0%. session_detail/build.ts short-circuits
`pace_adherence_pct` on `iv.power_adherence_percent === null` (mirroring
the existing `iv.pace_adherence_percent === null` short-circuit) so the
recovery row renders without a badge.

Considered: a `is_graded: boolean` field per interval. Rejected — adds a
new contract field that consumers would need to learn; explicit-null on
existing adherence fields is the existing pattern (D-089's pace_adherence
short-circuit already established it). Same information, fewer new
contracts.

Recoveries render: label "Recovery" (no subtitle since
`planned_pace_display` is null when no power range), duration, avg watts,
avg HR, no adherence badge.

**Verification:** workout `f9fb690b` — 6 rows render. Recovery 1: 117 W /
146 bpm / 5:00 / null adherence. Recovery 2: 100 W / 132 bpm / 5:00 / null
adherence.

---

## D-091 — Cycling plan_intent derives from layered signals (workout_type → tags → steps_preset)

**Date:** 2026-05-27
**Files:** `_shared/cycling-v1/build.ts` (new `derivePlanIntentCycling`).

Pre-D-091 the cycling fact-packet read plan_intent only from
`plannedWorkout.workout_type ?? plannedWorkout.type`. For every cycling
planned row those columns held the discipline value `'ride'`, which
`normalizePlanIntent` maps to null (per D-084 — discipline-only types
return null so the fallback classifier can fire). Net effect: **plan_intent
was null on every structured cycling session in the system**. The fallback
classifier ran IF/VI-only and labelled an 88-94% FTP sweet-spot ride as
`'threshold'` (IF 0.83 falls in the threshold band of the fallback's
IF-only logic), so the cycling LLM led every structured ride with
"sub-threshold effort" or "threshold effort" instead of the prescribed
intent.

The intent signal exists on the planned row in two reliable places the
builder never read:
- `tags`: canonical intent tags like `'sweet_spot'` / `'threshold'` /
  `'vo2'` / `'tempo'` / `'endurance_long'` / `'recovery'` / `'race_prep'` /
  `'brick'` / `'neuromuscular'` / `'anaerobic'`. Emitted by the bake +
  generator pipeline.
- `steps_preset`: token prefixes like `bike_ss_*` / `bike_thr_*` /
  `bike_vo2_*` / `bike_tempo_*` / `bike_recovery_*` / `bike_anaerobic_*` /
  `bike_race_pace_*` / `bike_openers` / `bike_only_brick` /
  `bike_endurance_*`. The token namespace is the most reliable canonical
  signal — generators emit deterministically.

New `derivePlanIntentCycling(plannedWorkout)` with layered precedence: (1)
`workout_type`/`type` (current path — wins when populated with a real
intent), (2) `tags` (looped through normalizePlanIntent), (3)
`steps_preset` (token prefix matched via small regex table).

Considered: deriving from free-text `name` / `description` ("Bike Sweet
Spot — 2×15 min" / "Sweet spot training at 88–94% FTP"). Rejected — LLM-
generated names and free-text descriptions are too noisy to classify on
without false positives. Tag + token signals are deterministic and
sufficient.

The `classified_type` cascade flips automatically because the existing
short-circuit at `cycling-v1/build.ts:228` already prefers `planIntent`
over the fallback classifier when non-null/non-`'unknown'` (per D-084).

**Verification:** workout `f9fb690b` (planned `b2e85f39`,
tags `['quality', 'sweet_spot', 'bike']`, steps_preset includes
`bike_ss_2x15min_r5min`): fact_packet_v1.facts.plan_intent flipped null →
`'sweet_spot'`. classified_type flipped `'threshold'` → `'sweet_spot'`. AI
summary lede flipped from "147 W normalized power — sub-threshold effort
with natural power variation from the terrain" to "147 W normalized power
at sweet-spot intensity".

---

## D-092 — STRUCTURED PLANNED MODE prompt rule + TREND suppression for thin type-filtered history

**Date:** 2026-05-27
**Files:** `_shared/cycling-v1/ai-summary.ts` (interval_summary data
  surface + STRUCTURED PLANNED MODE prompt rule),
  `_shared/session-detail/build.ts` (`pickCyclingTrendSeries`
  suppression).

Two display-layer cleanups, shipped together because both gate on the
structured-planned condition.

(a) **Prompt rule.** New STRUCTURED PLANNED MODE hard rule fires when
`interval_summary != null` AND `plan_intent ∈ {sweet_spot, threshold, vo2,
tempo, anaerobic, neuromuscular, race_prep}`. **Explicitly overrides** the
general LEDE rule and the HARD CONSTRAINT at `ai-summary.ts:399`. Requires
the lede to cover:
  - target-range adherence (cite `interval_summary.work_intervals[i].
    planned_power_range_w` vs actual; use `in_target_range` + `power_
    adherence_pct`)
  - completion count when partial (`completed_steps / total_steps`)
  - HR response across the set (compare first → last `hr_avg`)
NP becomes one trailing sentence of physiological context. Bans leading
with trend / vs-similar / PR signals on structured sessions — athletes
chose the session for the target, not the trend.

(b) **interval_summary data fix.** Pre-D-092 the summary exposed only
duration + HR per work interval. `avg_power_w` was a phantom key (cycling
intervals carry `actual_power_w` / `avg_power_watts` per D-089, not
`avg_power_w`) — every cycling structured-session narrative had a null
actual-wattage signal. There was no `planned_power_range` at all. The LLM
could cite "Two 15-min efforts held steady HR" but had no signal for
whether wattage hit the target. Added `planned_power_range_w: { lower_w,
upper_w }`, `power_adherence_pct`, `in_target_range: boolean` per work
interval; fixed `avg_power_w` alias so actual wattage flows.

(c) **TREND suppression.** `pickCyclingTrendSeries` returns null when
`pwr20_trend_v1` has <3 type-filtered points AND `fact_packet_v1.facts.
plan_intent` is in the structured set. A sweet-spot ride compared to an
aggregate trend across endurance + recovery + sweet-spot rides isn't a
meaningful "is the threshold work trending up?" signal; show no TREND
rather than a misleading one. Unplanned/non-structured rides keep the
np_trend fallback (no intent for the mixed series to mislead against).

Considered: keeping the np_trend fallback on structured sessions but
labelling it "mixed-type" in the summary. Rejected — the TREND row is a
visual sparkline; "mixed-type" qualification would be invisible to the
athlete who reads the line "4W lower over 12 rides" and assumes type-
filtering. Suppression is the honest default.

**Verification:** workout `f9fb690b` — `pickCyclingTrendSeries(wa)` →
`null` (direct Deno call). AI summary lede flipped to "You held the
150–167 W sweet-spot target across both 15-min blocks — 166 W on the
first rep and 162 W on the second — with steady heart rate control".

---

## D-093 — Hard 4-sentence cap on cycling clean-execution narratives

**Date:** 2026-05-27
**Files:** `_shared/cycling-v1/ai-summary.ts` (`clean_execution` signal +
  CLEAN-EXECUTION CAP sub-rule).

Pre-D-093 the D-092 structured-session narrative ran 7 sentences with HR
mentioned twice and fatigue mentioned twice. STRUCTURED PLANNED MODE asked
for interval-led content but didn't cap the rest — the LLM padded with
"this kind of work is exactly what …" closers and per-interval recovery
commentary on a clean ride that needed nothing more to say.

New `interval_summary.clean_execution: boolean` — true when every work
interval landed ≥ 95% `power_adherence_pct`. Lets the prompt know it's a
clean ride with no execution drama to explain.

CLEAN-EXECUTION CAP sub-rule inside STRUCTURED PLANNED MODE: when
`clean_execution` is true, output EXACTLY 4 sentences in order:
- S1 — Lede: target-range adherence + per-rep wattage (≤3 reps) + opening HR
- S2 — ONE physiological observation (HR-vs-power efficiency / decoupling
  / intensity match); pick one, don't list
- S3 — ONE fatigue/load context sentence (consecutive days, weekly load
  in plain words); skip if no notable signal
- S4 — ONE forward-looking sentence (race countdown OR recovery cue)

Explicit cut list: no "this kind of work is exactly what …" filler, no
"monitor how you feel" generic advice, no closing exhortation, no
per-interval recovery commentary. "Skip S3 and write 3 sentences when
there's no load signal worth saying — brevity > completeness."

Considered: dropping `max_tokens` from 220 to 140 to make 7-sentence
overflow physically harder. Rejected — the pre-D-093 7-sentence output was
715 chars (~180 tokens) and didn't hit the cap, so dropping max_tokens
wouldn't have helped on the failure case but would have truncated non-clean
(legitimately longer) cases awkwardly. Prompt strictness is the right
lever; max_tokens is the wrong one.

Considered: deterministic sentence-count validator + retry (like the
jargon-guard / lede-guard pattern). Deferred — sentence-count is fragile
to parse (em-dash, embedded periods in numerics, abbreviations), and the
prompt enforcement reduced sentence count from 7 to 4 on the only
verification case. If observed-in-wild output regresses, add a validator
in a follow-up.

**Verification:** workout `f9fb690b` — sentence count 4 (programmatic
split on `/(?<=[.!?])\s+/`). Pre-D-093: 7 sentences, HR mentioned twice,
fatigue mentioned twice. Post-D-093: 4 sentences, structure intact.
Stylistic filler still leaks ("is exactly what you need before a recovery
day", "laying the aerobic foundation you'll need for the longer efforts
ahead") — user accepted at diminishing returns and moved on.

---

## D-094 — Strength Planned column parses string rep ranges + qualitative weights (display-layer fix; data shape was correct)

**Date:** 2026-05-27
**Files:** `src/components/StrengthPerformanceSummary.tsx` (parser at lines ~62-90), `src/components/StrengthCompareTable.tsx` (interfaces + fmt guard at ~283-310).

The strength Performance tab Planned column rendered `"—"` for every set on every strength workout. Diagnosis: `planned_workouts.strength_exercises` carries aggregate values — `sets` is a number (count), `reps` is a string range like `"4-6"`, `weight` may be a qualitative string like `"Bodyweight"` / `"Heavy barbell"` / `"Band"`. The parser at `StrengthPerformanceSummary.tsx:62-66` tried to handle both shapes but the type-coercion fell through to 0 on the planned case (`typeof reps === 'number'` failed AND `setsArr.length === 0`). Then `StrengthCompareTable.tsx:284` had a guard `if (!s.reps && !s.duration_seconds && !s.weight) return '—'` — all three zero, `"—"` rendered.

Fix at the display layer (Option A — picked over Option B normalizer in `workout-detail` because the planned data is *legitimately aggregate-shaped*; coaches prescribe "3 sets × 4-6 reps @ 110 lb @ RIR 2" at the exercise level, not per-set):
- `StrengthPerformanceSummary.tsx`: parse string rep ranges via regex (`"4-6"` → midpoint 5); recognize qualitative weight strings (numeric-only strings parse to `weight`, anything else preserved as `weight_display`); fall back to per-set arrays only when present.
- `StrengthCompareTable.tsx`: extend `StrengthSet` + `StrengthExercise` interfaces with `weight_display?: string`. Construct `plannedSets` carrying replicated aggregate values across all N sets (coaches prescribe at exercise level, not per-set — all planned sets render same target). Carry `target_rir` as `rir` so `fmt()` with `showRir=true` renders `"(RIR N)"`. Fix `fmt()` guard to render when any of (numeric content, qualitative weight, target RIR) is meaningful. Pass `showRir=true` to fmt on the Planned column.

Considered Option B (server-side normalizer in `workout-detail` that converts aggregate planned shape to per-set arrays) and Option C (schema change to make planned use per-set shape). Both rejected as solving a problem that doesn't exist — the data shape is correct; the parser was wrong. Display layer is the right place to interpret aggregate prescriptions into per-set rendering.

**Verification:** 3x5 squat at 110 lb with target RIR 2 and string reps "4-6" now renders as `"5 reps @ 110 lb (RIR 2)"` across three sets on the Planned column instead of `"—"` three times.

---

## D-095 — PREVIOUS column on strength Performance tab — per-set granularity via direct workouts.strength_exercises read

**Date:** 2026-05-27
**Files:** `supabase/functions/workout-detail/index.ts` (post-`buildSessionDetailV1` augmentation, +57 lines), `src/components/StrengthPerformanceSummary.tsx` (prop pass-through), `src/components/StrengthCompareTable.tsx` (`previousByExercise` prop, row construction, conditional 3-col vs 2-col layout, header rendering).

New column on the strength Performance tab between Set and Planned showing the most recent prior session's per-set actual (weight × reps @ RIR) for the same exercise + set number. Tells the athlete the full arc: "you did X last time, plan says Y, you did Z."

Server-side: after `buildSessionDetailV1`, if `isStrengthLikePerfSession(row)` and `compStrengthArr` is non-empty, single batched query for the user's last 10 strength-class workouts before today. Walk in date-desc order; first match per exercise wins (= most recent). Skip rows with no per-set data. Break early when all current exercises have matched. Build `{ [normalizedExerciseName]: { date, days_ago, sets: [...] } }` map and attach to `sessionDetailV1.previous_strength_by_exercise`.

**Source choice:** `workouts.strength_exercises` JSONB (per-set granularity) over the `exercise_log` table. exercise_log exists but only carries per-session aggregates (`best_weight`, `best_reps`, `avg_rir`, `sets_completed`) — insufficient for the per-set-vs-set comparison the column asks for. Considered using exercise_log + replicating the aggregate across all sets (cheaper query, less per-set fidelity); rejected because the spec explicitly asks for per-set.

**Cost shape:** single batched query (last 10 workouts in one round-trip), not N+1 per exercise. Typical 6-8 exercises per session, all resolvable from a small recent window without dedicated indexes.

Client-side: extend `pair` construction to `{ planned, completed, previous }`. New 12-col grid when `r.hasPrevious`: Set (2) / Previous (3) / Planned (3) / Completed (3) / Edit (1). Falls back to original 2 / 5 / 5 layout when no prior session — first-time exercise gets the wider layout instead of an awkward "—" column. Header includes `"Previous · Nd"` badge with date in title tooltip.

**Verification:** test user 2026-05-18 strength session: Bench Press → 2026-03-30 (4 sets, 125×5 @ RIR 4 / 130×5 @ RIR 3 / ...), Pull-ups → 2026-03-30 (2 sets, 0×6 @ RIR 2 — bodyweight), Band Face Pulls → 2026-03-27.

---

## D-096 — "↑ Same as set 1" carry-forward button on strength logger (set 2+)

**Date:** 2026-05-27
**Files:** `src/components/StrengthLogger.tsx` (set row render at ~3274-3320, placed in the existing `flex-1` spacer between RIR and Done).

Highest-impact friction reduction on the strength logger. Most working sets in a strength session are identical to set 1 — same weight, same reps, similar RIR. Pre-D-096 each set required 3 separate keypad-drawer cycles (reps + weight + RIR) → 9-27 drawer animations per exercise.

New compact `"↑ Same"` pill button on set 2+, placed in the existing flex-1 spacer between the RIR and Done columns (no layout change for set 1 or for the row otherwise). One tap copies `reps / weight / rir / duration_seconds / resistance_level / barType` from `exercise.sets[0]`. Disabled + dimmed when the current set already matches set 1's values (visual confirmation, no destructive re-apply).

Drawer remains fully available for arbitrary edits — Same is additive, not a replacement.

---

## D-097 — Previous-session autofill on strength logger open (with muted display + tap-to-edit clearing)

> **SUPERSEDED (field prefill) by [D-126](#d-126) (2026-06-11).** The fields no longer prefill from last-actual; they reflect the plan prescription, and last-actual now lives only in the D-122 "last:" anchor. The fetch built here survives — it's what populates the anchor's per-set map — but the `setExercises` autofill + `from_previous` dimming path is dormant. Original entry kept for the record.

**Date:** 2026-05-27
**Files:** `src/components/StrengthLogger.tsx` (new `LoggedSet.from_previous?: boolean`, autofill useEffect at ~1294-1390, `updateSet` flag-clearing logic at ~2178-2190, muted spans on reps/weight/RIR value buttons).

On logger open, prefill empty sets with the athlete's most recent prior session's per-set actuals for the same exercise. The athlete arrives at a session where the work is mostly done — taps adjust only what changed since last time. Most common case: tap Done on set 1 (values already match last session), tap "Same" on set 2 + 3 (D-096), tap Done. Three taps per exercise instead of nine.

Client-side mirror of D-095's server fetch: D-095 added `previous_strength_by_exercise` to `session_detail_v1` for the completed-workout Performance tab. That data isn't available pre-completion — the logger fires before workout-detail. So the autofill here is a client-side query: last 10 strength workouts via Supabase client, build the same per-exercise map, prefill empties. Reuses the same `normalizeExerciseName` helper pattern (lowercase, strip `(Left)/(Right)`) for stable matching across spelling variants.

"Untouched" gate: `weight === 0 AND no reps/duration_seconds/rir/resistance AND not completed`. Sets already loaded from a saved-session restore or from the planned prescription are NOT overwritten.

Display: new `LoggedSet.from_previous: boolean` flag carries the "this came from history" signal forward. Value text on reps / weight / RIR buttons renders in muted `text-white/35` when `from_previous && !completed`. Athlete reads it as a suggestion.

State-clearing: `updateSet` auto-clears `from_previous: false` on any update unless the caller passes `from_previous` explicitly. Single point of truth. The autofill itself passes `from_previous: true` explicitly to preserve the flag.

---

## D-098 — Inline ±2.5 / ±5 weight stepper on strength logger (barbell / dumbbell / goblet only)

**Date:** 2026-05-27
**Files:** `src/components/StrengthLogger.tsx` (3 weight cells: dumbbell ~3279, goblet ~3307, barbell ~3335).

Four compact chip-buttons (-5, -2.5, +2.5, +5) below the weight value on each set row for barbell / dumbbell / goblet exercises. One tap adjusts weight without opening the keypad drawer. Common cases solved: athlete drops 5 lb on a fade set, bumps +2.5 lb after hitting RIR 4 on the prior session.

Skipped for bodyweight, duration-based, and band exercises (band uses a resistance-level dropdown, no weight value). Step deltas rounded to nearest 0.5 lb so 2.5 increments stay clean across repeated taps (avoids float drift like 87.4999999 from cumulative +2.5). Weight floor clamped at 0 (no negative weight on -5 from a low set).

Weight button still opens the keypad drawer for arbitrary entry — stepper is additive. Updates flow through `updateSet`, which clears `from_previous` (D-097) on any athlete-initiated change.

Considered: extracting the stepper to a small reusable component. Rejected — three identical inline blocks keeps the diff localized + the render loop simple; no state-closure issues.

---

## D-099 — Strength logger RIR drawer-keypad replaced by 5-pill inline slider (1-5)

**Date:** 2026-05-27
**Files:** `src/components/StrengthLogger.tsx` (RIR cell at ~3405-3460, full replacement of the prior drawer-trigger button).

Replace the single drawer-trigger button for RIR with a 5-pill inline slider (1, 2, 3, 4, 5). One tap commits the value — no drawer animation. For a typical 6-exercise × 3-set strength session that's 18 drawer cycles eliminated.

RIR is the field most likely to be entered out-of-flow (post-set, head down, breathing hard) so making it a one-tap action also removes the modal context-switch.

Visual states (in priority order):
- Selected pill: bright white border + bold text. Conveys "this is my pick."
- Selected + from_previous (D-097 autofill): muted white border + dim text. Tells the athlete "this is suggested, hasn't been committed yet" — matches the visual language of the reps + weight muted spans.
- Target RIR (when the prescription specifies one): amber-tinted background + amber border. Athlete sees both the prescription and their pick in the same row.
- Other pills: subtle white-on-glass border, low-contrast text.

Hidden for mobility mode / duration-based / plyometric exercises.

Drawer-based RIR input via `handleSetComplete` (the "athlete taps Done without setting RIR first" fallback) is intentionally preserved as the safety net.

---

## D-100 — Strength logger auto rest timer made visible (header chip + Web Audio tone + dismiss)

**Date:** 2026-05-27
**Files:** `src/components/StrengthLogger.tsx` (`playRestEndTone` helper at ~421-446, tick handler tone branch at ~1985-2000, header countdown chip at ~2755-2790).

Make the existing auto-rest behavior visible. Pre-D-100 the rest timer was already auto-starting via `startAutoRestForNextSet` (called from `handleSetComplete`) and the tick handler already vibrated at zero, but there was no UI affordance — the timer ran invisibly and the athlete had no way to see "how long until set 2" or to skip the rest early.

Three additions:
1. **Session-header countdown chip.** Picks the running rest timer with the smallest remaining time (most "active right now"), renders amber pill at the top of the logger header: `"REST 1:23 [×]"`. Updates live with the existing tick. Disappears when no rest is running. Rest-timer keys are `${exerciseId}-${setIndex}` — distinct from duration-timer keys (`${exerciseId}-set-${setIndex}`) which carry a "-set-" separator. The chip filter respects that namespace split.
2. **Audible end-of-rest tone.** Web Audio API oscillator (880 Hz / A5, sine, 0.18 gain, 0.28s decay envelope). No asset file. Fires alongside the existing 50ms haptic vibrate at `ns === 0`. Isolated audio context per tone, closed after ~400ms to free resources on iOS. Triggered from a tick descended from the athlete's Done tap, so the audio context is unlocked under iOS WKWebView's gesture requirement. Duration-timer expiries are exempt — those mark a set-completion event, not a rest end.
3. **Dismiss button.** × inside the chip flips the active timer's `running` flag to false. Tone + haptic don't fire on dismiss.

No changes to the auto-start trigger — `startAutoRestForNextSet` still fires from `handleSetComplete`. Duration is calculated by the existing `calculateRestTime(exerciseName, reps)` helper (rep-band-aware: 3-5 reps → 150s, 6-8 → 120s, etc.).

---

## D-101 — iOS resume reopens strength logger when session unfinished (closes Bug B Cause 1)

**Date:** 2026-05-27
**Files:** `package.json` + `package-lock.json` (npm install `@capacitor/app@^8`), `ios/App/...` (cap sync output), `src/components/AppLayout.tsx` (resume listener useEffect after `showStrengthLogger` useState).

Closes POLISH-PUNCH-LIST Bug B Cause 1: iOS WKWebView teardown after long sleep unmounts AppLayout and `showStrengthLogger` (useState — no route, no persist) loses the `open=true` state. localStorage still holds the in-flight sets (D-097 + commit `556c4850` persistence layer), but the athlete has no path back to the logger short of manually finding the workout and re-opening.

New `@capacitor/app` resume listener:
- Subscribes to `appStateChange`.
- On `isActive === true` (foreground transition), checks the canonical `strength_logger_session_${today}` localStorage key for "real data" — at least one exercise with a non-empty sets array (the shape `StrengthLogger` writes via `saveSessionProgress`).
- If present and logger isn't already open, `setShowStrengthLogger(true)` reopens it. The existing `StrengthLogger` restore-on-mount path (useEffect line 1337) then hydrates the saved exercises / addons / notes / RPE / source-planned metadata.

Web / non-Capacitor environments silently no-op the listener attach (try/catch around addListener) — the auto-reopen is iOS-specific by design.

Plumbing: `npm install @capacitor/app@^8` (the user-authorized install — `@capacitor/{core,cli,ios}` were already present, `app` was not). `npx cap sync ios` to register the plugin in the iOS Xcode project.

**Out of scope:** Bug B Cause 2 (AuthWrapper `dc85e9d0` regression that unmounts AppLayout on every auth event) is a separate scope. D-101 covers the lifecycle gap; Cause 2 is the secondary issue that exacerbates it.

---

## D-102 — Strength INSIGHTS three-piece refactor (narrative lift + 4-sentence cap + strength_fact_packet_v1)

**Date:** 2026-05-27
**Files:** `supabase/functions/analyze-strength-workout/index.ts` (prompt rewrite at ~2228-2299, fact packet build at ~2611-2682, write payload at ~2683-2710).

Three changes to `analyze-strength-workout`, shipped together because they share the same write surface:

1. **Lift narrative to top-level `ai_summary`.** Pre-D-102 the LLM output lived only at `workout_analysis.session_state_v1.narrative.text`. Cycling and run expose it at `workout_analysis.ai_summary` for client + session-detail-builder parity. New top-level fields: `workout_analysis.ai_summary`, `workout_analysis.ai_summary_generated_at`, `workout_analysis.recomputed_at` (D-079 parity — strength was the lone analyzer missing this). The `session_state_v1.narrative.text` path stays populated (don't break existing client readers); `ai_summary` is additive.

2. **Tighten LLM prompt from 6-section structured (~2000 tokens) to 4-sentence cap (240 tokens).** Mirrors cycling D-093 CLEAN-EXECUTION CAP. New rule structure: S1 LEDE (RIR + load adherence vs target — cite specific exercises when one dominates, summarize at session level when uniform), S2 ONE physiological observation (RIR drift, readiness alignment, 1RM-trend — pick one, don't list), S3 ONE phase + endurance-load clause (skip when no notable signal and ship 3 sentences), S4 ONE forward-looking sentence (next-session target adjustment or recovery cue). HARD CUTS: no "this kind of work is exactly what...", no "monitor how you feel", no closing exhortations, no exercise re-listing that the dashboard rows already render. PLAIN LANGUAGE: never print %1RM / ACWR / TSS / target_rir as labelled values — translate to words. The pre-D-102 structured 6-section output is preserved in `detailed_analysis.exercise_breakdown` for the client to render verbatim; the narrative is supposed to *interpret*, not re-list.

3. **Add thin `strength_fact_packet_v1`.** New top-level field carrying the smallest set of facts the INSIGHTS narrative leads with. Pattern mirrors run's `fact_packet_v1` and cycling's `cyclingFactPacketV1`. Schema: `{ version: 1, discipline: 'strength', generated_at, facts: { phase, week_in_phase, plan_intent, plan_type, avg_target_rir, avg_actual_rir, rir_delta, rir_verdict: 'too_easy'|'on_target'|'too_hard'|null, total_volume_lb, exercises_completed, exercises_planned, set_completion_pct, session_rpe }, endurance_load_context: null }`. Values derived from existing analyzer outputs (`exercise_adherence`, `plan_metadata`, `volume_analysis`, `overall_adherence`, `session_rpe`) — no new computations. `rir_delta` sign convention: `actual - target` so negative = harder than planned, positive = easier. Verdict thresholds: `|delta| < 1` = on_target, `delta <= -1` = too_hard, `delta >= 1` = too_easy. `endurance_load_context: null` reserved for future wiring (fetches from `athlete_snapshot.weekly_workload` + last-long-day signals); v1 leaves it null so the prompt's S3 clause is tolerantly skipped.

Considered: separate `_shared/strength-v1/ai-summary.ts` module mirroring `_shared/cycling-v1/ai-summary.ts` structure (per STRENGTH-ANALYSIS.md §7.1). Deferred — inlined in `analyze-strength-workout/index.ts` for delivery speed. Module-extraction is a follow-up refactor with no behavior change. Also considered: outcome-specific narrative templates (clean / under-executed / PR / deload per spec §4.2). Deferred — D-102 uses one general CLEAN-EXECUTION CAP prompt; template gates can be added once observed-in-production behavior reveals which outcomes need distinct prompting.

**End-to-end verification deferred** — `analyze-strength-workout` had an in-handler user-JWT gate that rejected all internal service-role invocations (root cause closed in D-103 next).

---

## D-103 — Silent 401 cross-sport bug: removed in-handler user-JWT gate from analyze-strength-workout + analyze-swim-workout

**Date:** 2026-05-27
**Files:** `supabase/functions/analyze-strength-workout/index.ts` (removed lines 2358-2386 + 2417-2426), `supabase/functions/analyze-swim-workout/index.ts` (removed lines 126-150 + 193-202).

The strength + swim analyzers both required `supabase.auth.getUser(token)` in-handler before reaching any analysis code. Every internal invoker (`recompute-workout`, `ingest-activity`, `bulk-reanalyze-workouts`) calls with the service-role token, which has no `user.id`, so every internal call returned 401 silently. `recompute-workout` swallowed the error at `index.ts:116-119` (`return json({ ok: true, stale: true, steps })`) — the client saw a successful recompute, but no narrative ever landed.

Net effect: strength + swim narratives had been silently failing on the recompute + ingest path since the gates were added. Cycling + run analyzers don't have this check and have always worked. **Same class as D-075 / D-081 silent 42703 (PostgREST phantom columns) and D-083 swallowed ReferenceError, but at the JWT-auth layer instead of SQL or runtime.** Five-bug cluster now: silent SQL → silent runtime → silent JWT → silent JSONB shape (D-089) → silent type coercion (D-094). Each one invisible to the client; each one had failure-to-zero output for weeks/months.

**Evidence**: scanned 8 recent strength sessions for the test user. Only ONE (2026-04-02, pre-gate) had a populated narrative. All seven others had `analyzed_at` set somewhere but `workout_analysis` containing only `session_detail_v1` + `session_detail_updated_at` (written by `workout-detail`, not by the analyzer). D-102's `ai_summary` lift + 4-sentence cap + `strength_fact_packet_v1` all lived downstream of the 401 reject — never executed.

Fix (Option A — chose this over Option B forwarding the user JWT from invokers because removing the dead gate is one-and-done; forwarding would touch every invoker AND leave the gate as a footgun for future ones):
- analyze-strength-workout: removed the JWT extract + `getUser` + 401 returns + `requestingUserId` block (lines 2358-2386) and the cross-check `workout.user_id !== requestingUserId` → 403 block (lines 2417-2426). Mirrors cycling + run analyzer pattern.
- analyze-swim-workout: same removal at lines 126-150 + 193-202.

Authorization enforced upstream: `recompute-workout` validates the user JWT at `index.ts:48` AND verifies `workouts.user_id === user.id` at `:69` before invoking. `ingest-activity` runs in webhook-trusted service-role context.

**Verification:** recomputed two strength sessions via service-role REST call:
- May 18 (`cfa77692`, unplanned): analyze HTTP 200 (was 401), `analyzed_at` populated, full analyzer keys, 4-sentence narrative cites bench load + pull-up RIR drop + marathon recovery + overhead-press forward call. Fact packet present but most fields null (unplanned → no `plan_metadata`, no target_rir to compare).
- March 30 (`c09d8006`, planned): analyze HTTP 200, 3-sentence narrative (CLEAN-EXECUTION CAP correctly skipped S3), fact packet **fully populated**: phase="race prep", week_in_phase=5, plan_intent="traditional", rir_verdict="on_target", total_volume_lb=5440, set_completion_pct=137.5. The initial recompute on March 30 hit a transient Cloudflare 520 during `merge_computed`; retry cleared cleanly.

**Footgun added to the analyzer family:** any future analyzer-class function MUST NOT add an in-handler user-JWT gate. Internal callers are trusted by upstream authorization. The gate pattern looks defensive but creates a silent 401-and-swallow path that's invisible until end-to-end verification catches it. D-103's surfaced bug had been dormant for an unknown duration (only one historical narrative success, April 2 — likely pre-gate).

---

## D-104 — Render SessionNarrative on strength Performance tab (display-bug tail of the strength workstream)

**Date:** 2026-05-28
**Files:** `src/components/MobileSummary.tsx` (strength/mobility branch ~ lines 103-141, add `<SessionNarrative>` above `<StrengthPerformanceSummary>`).

Display bug surfaced after D-102 + D-103 made the strength narrative reliably reach the client: the strength + mobility branch of `MobileSummary` rendered only `<StrengthPerformanceSummary>` (the exercise table) — no `<SessionNarrative>`. The endurance branch (run/ride/swim) renders SessionNarrative at line 189. So strength sessions never showed an INSIGHTS narrative above the exercise table even when `ai_summary` was populated.

Data was reaching the right place end-to-end:
- `analyze-strength-workout` writes `workout_analysis.ai_summary` (D-102) + `workout_analysis.session_state_v1.narrative.text` (legacy).
- `workout-detail/index.ts:437-439` prefers `session_state_v1.narrative.text`, falls back to `ai_summary`, passes as `narrativeText` to `buildSessionDetailV1`.
- `session-detail/build.ts:621` exposes it as `session_detail_v1.narrative_text`.
- `SessionNarrative.tsx:493` reads `sd.narrative_text` and renders it.

But the strength branch in `MobileSummary` never invoked `SessionNarrative`. Pure tree-omission bug.

Fix: add `<SessionNarrative>` above `<StrengthPerformanceSummary>` in the strength/mobility branch with the same prop shape used in the endurance branch (`sessionDetail`, `hasSessionDetail`, `noPlannedCompare`, `planLinkNote`, `recomputing`, `recomputeError`, `onRecompute`). All props already in scope.

`SessionNarrative` is sport-agnostic at the read level — `sd.narrative_text` + `sd.summary` + `sd.adherence` are all sport-neutral, and the run/ride-specific blocks (trend sparkline, race readiness, etc.) gracefully no-op when their fields are absent on strength `session_detail_v1`.

Minor redundancy noted: `StrengthPerformanceSummary` already has its own "Recompute analysis" button. `SessionNarrative`'s recompute fallback fires only when `hasNothing === true`. In the happy path (narrative present) only one renders; in the empty path both render with the same action. No regression, worth tightening in a follow-up if it grates.

**Verification:** open any recently recomputed strength session (May 18 / March 30 — both verified via REST post-D-103). The INSIGHTS narrative now appears above the Set / Previous / Planned / Completed exercise table.

---

## D-105 — ROUTE sparkline plots GAP-adjusted pace with per-row raw fallback (display-layer fix; data was correct)

**Date:** 2026-05-29
**Files:** `supabase/functions/_shared/fact-packet/build.ts:720` (SELECT extension + row-shape addition), `supabase/functions/_shared/session-detail/types.ts:382` (history contract extension — additive), `src/components/SessionNarrative.tsx` (`RouteSparkline` derives effective_pace + adds "GAP" badge).

The ROUTE sparkline plotted raw pace, which on hilly routes made same-effort runs at different grades read as fitness variation. The grade-adjusted-pace column (`route_progress_metrics.effort_adjusted_pace_sec_per_km`) was already populated on every recent row for the test user (verified 10/10 via REST); the fact-packet SELECT just didn't pull it.

Pure SELECT-narrowing bug, same class as **D-094** (silent type coercion to 0), **D-075** + **D-081** (silent SELECT-shape gaps), **D-083** (swallowed ReferenceError) — data correct at source; the reader didn't pull/parse it correctly. Five-bug cluster now: silent SQL → silent runtime → silent JWT (D-103) → silent JSONB shape (D-089) → silent type coercion (D-094) → silent SELECT-narrowing (D-105). Each one invisible to the client; each one had failure-to-zero output until end-to-end verification caught it.

Three coordinated edits:
1. `fact-packet/build.ts:720`: extend SELECT with `effort_adjusted_pace_sec_per_km`; shape the row with `gap_pace_s_per_km` alongside existing `pace_s_per_km` (raw preserved for flat-route fallback / pre-D-105 backfill rows / rows where GAP couldn't be computed). Note: routes table column is `effort_adjusted_pace_sec_per_km`; cousin table `segment_progress_metrics` uses `grade_adjusted_pace_s_per_km` — different name, same concept (cross-table naming inconsistency).
2. `session-detail/types.ts:382`: extend history contract with `gap_pace_s_per_km: number | null`. Additive — old clients reading only `pace_s_per_km` keep working.
3. `SessionNarrative.tsx` `RouteSparkline`: per-row fallback gate `effective_pace = gap_pace_s_per_km ?? pace_s_per_km`. Plot effective. "Today's pace" cell shows effective. Subtle "GAP" badge in the header (border-pill, gray) when any plotted point uses GAP — silent otherwise so flat routes / first-time routes don't carry an irrelevant qualifier.

Considered: a route-elevation-threshold gate ("only show GAP label when route avg grade > N%"). Rejected — per-row availability is simpler and equally honest. Athletes on flat routes still get the GAP label if GAP was computed (GAP ≈ raw in that case, so the badge is informational, not misleading).

**Verification (test user May 21 run, audit reference case):** `route_runs.history` rows now carry per-row gap_pace_s_per_km. May 21 today's reading flipped from misleadingly fast 351 (raw, benefiting from downhill segments) to honest 365.5 (GAP-corrected). All 3 history rows GAP-populated → "GAP" badge renders.

**Blast radius:** very small. One SELECT line, one type field added (additive), one client read site, one badge. No backfill needed (column was already populated). No analyzer logic changes — only the SELECT and row-shape function in the existing `terrain_context` derivation.

---

## D-106 — Run TREND pool strict-intent filter + window extended 8 → 12 (vs_similar pool untouched)

**Date:** 2026-05-29
**Files:** `supabase/functions/_shared/fact-packet/queries.ts` (trend pool strict filter at ~line 499-508 + slice cap at ~line 557).

Two coupled tweaks to the run Performance tab TREND chart:

1. **Strict same-classified_type filter on the trend pool.** Pre-D-106 the trend pool inherited `typeMatch`'s `comparableKeys` bucket via `getComparableTypeKeys` — e.g. `easy_run` pooled with recovery / easy / steady_state / run / long_run. That's appropriate for the vs_similar per-session comparison (pace-proximity D-038 narrows it), but pollutes the TREND chart that visualizes aerobic adaptation OVER TIME for a single intent. An easy run "trending" against mixed recovery + long + steady_state rows shows mostly intent variance, not fitness change. New strict-type filter between `trendPoolBase` construction and `trend_points` serialization: `trendPoolBase.filter((r) => inferWorkoutTypeKey(r) === workoutTypeKey)`. Below the existing `sample_size < 3` gate, the chart suppresses entirely — better to show no trend than a mixed-intent one.

2. **Trend window extended 8 → 12 sessions** (`.slice(-8)` → `.slice(-12)`). 8 sessions dropped to ~5 visible after the pace-proximity (D-038) + race-boundary (D-041 Fix D) filters trimmed further — too short to convey aerobic adaptation. 12 covers ~6-8 weeks of regular training.

**vs_similar pool intentionally LEFT UNTOUCHED** — the per-session comparison already narrows via pace-proximity (D-038) and the broader bucket is useful there for sample size on cross-session HR-vs-pace reads.

**Scope: run-only** — `fact-packet/queries.ts` is invoked from `analyze-running-workout`. Cycling has its own `cycling-v1/cross-workout-queries.ts` module (D-073) — separate concern.

**Architecture call documented for future:** TREND answers "am I getting fitter at this intent?" → strict intent. vs_similar answers "how did THIS session compare to similar recent sessions?" → broad bucket + pace-proximity. ROUTE answers "how is this terrain getting easier?" → no intent (D-107, see below). Three different questions warrant three different filter posture; do not unify.

**Verification (test user May 27 easy run):** recent 5 runs by classified_type — 2 `easy` + 3 `steady_state`. Strict filter correctly excludes the steady_state rows from the trend pool. Post-D-106 trend_points count: 3 (Mar 26 + May 11 + May 20, all `easy`). vs_similar.sample_size: 4 (broader bucket retained for that surface).

**Caveat:** strict-type filter makes the pool more selective; for athletes who haven't logged many runs of a given intent, the trend may not render at all. That's the trade-off — better truth than misleading pace-mixing. If observed "no trend" rate becomes high in production, consider relaxing to "same broad bucket BUT filtered to single peak intent" rather than strict-exact.

---

## D-107 — Drop ROUTE intent filter + lower TREND HR threshold + restore times_run label (post-D-106 web cleanups)

**Date:** 2026-05-29
**Files:** `supabase/functions/_shared/fact-packet/build.ts` (deleted intent-filter block at original lines 746-773), `src/components/SessionNarrative.tsx:220` (`hasHr` threshold change), `src/components/SessionNarrative.tsx:374` (route-header label source change).

Three changes shipped together because they share the same release surface (post-D-106 Performance-tab cleanup batch).

1. **ROUTE intent filter REMOVED.** Pre-D-107 the route history was narrowed to same-classified_type historicals (per D-039 Fix 6.1). For today's test-user easy run that cut 8 metric rows → 5 same-intent; the `chart_eligible` gate (≥8 per D-040 Fix E) evaluated false; web rendered the text fallback ("Same route · 5 comparable runs — not enough history to trend"). iOS rendered the chart because (almost certainly) the iOS Capacitor bundle predates the chart_eligible gate addition and renders unconditionally.

   The intent filter made sense pre-D-105: intent-mixing on raw pace was noise. Post-D-105 GAP correction neutralizes effort-level variance per-point, so an easy run and a threshold run on the same hill route both contribute GAP-adjusted pace that reads as "what does this terrain cost me at this effort." Mixing intents NOW adds signal (full evolution of athlete-on-this-route) where pre-D-105 it would have added noise.

   Deleted the intent-filter block entirely. ROUTE history returns all matched-cluster metric rows.

2. **TREND HR dashed-line threshold lowered `>= 3` → `>= 2`.** Direct consequence of D-106's strict pool: thin pools (e.g. 3 trend points, only 2 with HR populated) hid the HR line entirely. New threshold renders a 2-point line as a single segment — sparse but honest. Backfills naturally as more same-intent runs land.

3. **Route-header label uses `times_run` first** instead of `comparable_runs ?? times_run`. Post-D-107 `comparable_runs` resolves to `history.length` (≤10 due to the route_progress_metrics SELECT cap), so reading it in the label says "8×" when the cluster sample_count is 43. The label should answer "how many times have I run this route" — that's `times_run` (43 for today's test-user run). iOS has been using `times_run` all along; this restores parity.

Considered: bumping the route_progress_metrics SELECT `.limit(10)` in `fact-packet/build.ts:724` to render denser sparklines. Deferred — 8-10 points is reasonable visual density today; can revisit if denser sparklines become valuable.

Considered: leaving the intent filter and lowering `chart_eligible` threshold from ≥8 to ≥5 instead. Rejected — the intent filter was solving the pre-D-105 noise problem; post-D-105 it became overcorrection. Removing it is the architecturally honest fix; lowering the threshold would just paper over the symptom.

**Verification (test user May 27 easy run, workout `fd820df6`):**
- Pre-D-107: `route_runs.history.length: 5`, `chart_eligible: false`, web renders text fallback.
- Post-D-107: `route_runs.history.length: 8` (all matched cluster rows, no intent filter), `chart_eligible: true` (8 ≥ 8), label "Same route · 43×" matches iOS, chart renders with 8 GAP + 8 HR data points.

**Sparkline architecture (carried forward; cite this when revisiting):**
| Chart | Question it answers | Intent filter posture |
|---|---|---|
| TREND | "Am I getting fitter at this intent?" | **Strict same-classified_type** (D-106) |
| ROUTE | "How is this terrain getting easier?" | **None** — GAP correction (D-105) neutralizes per-point |
| vs_similar | "How did THIS session compare to similar recent sessions?" | **Broad `comparableKeys` bucket + pace-proximity** (D-038, unchanged) |

Three different questions warrant three different filter posture. Do not unify.

---

## D-108 — Close cold-start gap in iOS strength logger resume (mount-time check; not just warm resume)

**Date:** 2026-06-03 (commit `58cc16c1`)
**Files:** `src/components/AppLayout.tsx` — added mount-time `hasUncompletedStrengthSession()` check; dropped `[showStrengthLogger]` dependency from the `@capacitor/app` listener-bind useEffect.

D-101 wired `@capacitor/app`'s `appStateChange` listener so iOS warm-resume reopens the logger when an unfinished session exists. That covered the *warm* path: app suspended in background → user re-foregrounds → `isActive === true` fires. It did NOT cover *cold* start: iOS killed the WKWebView entirely (after long sleep / memory pressure / explicit user-kill from app switcher) → React mounts fresh → `showStrengthLogger` initializes `false` → `appStateChange` never fires (no transition; the app boots into "already active"). User lost the path back to the logger despite localStorage still holding the sets.

Fix has two parts:
1. **Mount-time inspection.** On AppLayout mount, synchronously read `strength_logger_session_${todayDateString()}` from localStorage and call `setShowStrengthLogger(true)` if the exercises array has any entries. This is the cold-start equivalent of the warm-resume handler.
2. **Drop the `[showStrengthLogger]` dependency** from the listener-bind useEffect. With it, the useEffect re-fired (and re-bound a new listener) every time `showStrengthLogger` toggled — multiple listeners stacked over a session.

Considered: persist `showStrengthLogger` as a separate localStorage flag rather than inferring from session-data presence. Rejected at this step — keep the contract simple (one storage key, one source of truth). [D-109 immediately superseded this call when the data-only check turned out to conflate user intent with data presence — see D-109.]

**Verification:** rebuilt iOS bundle (`npm run build` + `npx cap sync ios` + Xcode reinstall). Cold-killed app mid-set; relaunched; logger reopened with sets intact. Bug B Cause 1 closure tightened — D-101 + D-108 together now cover both warm and cold paths.

---

## D-109 — Separate intent flag from session-data presence (AND gate on resume)

**Date:** 2026-06-03 (commit `0d466474`)
**Files:** `src/components/AppLayout.tsx` — module-level `todayDateString()` + `hasUncompletedStrengthSession()` helpers; useState lazy initializer reads BOTH `strength_logger_open` flag AND today's session data; new write-side useEffect maintains the flag; `appStateChange` handler also reads both.

Regression observed immediately post-D-108: if any uncompleted session existed in localStorage, the logger force-reopened on every warm resume AND every cold start — even when the user had deliberately navigated away to the dashboard before backgrounding. D-108's `hasUncompletedStrengthSession()` check conflated *"data exists"* with *"user wants the logger open."* The two are independent.

Fix: separate intent from data. New `localStorage['strength_logger_open']` flag stores user intent (`'1'` when open, removed when closed). Reopen requires **both** the flag set AND today's session having data — an AND gate.

```typescript
function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hasUncompletedStrengthSession(): boolean {
  try {
    const raw = localStorage.getItem(`strength_logger_session_${todayDateString()}`);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.exercises) && parsed.exercises.length > 0;
  } catch { return false; }
}

const [showStrengthLogger, setShowStrengthLogger] = useState<boolean>(() => {
  try {
    if (localStorage.getItem('strength_logger_open') !== '1') return false;
    return hasUncompletedStrengthSession();
  } catch { return false; }
});

useEffect(() => {
  try {
    if (showStrengthLogger) localStorage.setItem('strength_logger_open', '1');
    else localStorage.removeItem('strength_logger_open');
  } catch {}
}, [showStrengthLogger]);
```

useState lazy initializer runs synchronously **before** the flag-write useEffect ever fires, so there's no race where a fresh page-load momentarily sees the prior session's stale flag → no spurious auto-reopen.

The AND gate also defends against the day-rollover case: a stale `strength_logger_open=1` from yesterday's session is harmless because today's session key is empty → `hasUncompletedStrengthSession()` returns false → no reopen.

**Verification:** test cycle: open logger, add a set, close logger explicitly, navigate to dashboard, kill app. Cold-relaunch → dashboard, no auto-reopen. Reopen logger, add another set, background app (don't close). Foreground → logger reopens. Both states honored.

Considered alternatives: (a) persist `currentRoute` per AppLayout state and reopen only when last route was strength-logger. Rejected — couples logger reopen logic to routing, brittle. (b) Drop auto-reopen entirely and require user tap to resume. Rejected — that's the whole point of D-101.

---

## D-110 — Kill resurrection of deleted strength workouts (A1 delete-side cleanup + A2 restore-side fail-safe verify)

**Date:** 2026-06-03 (commit `93339e71`)
**Files:** `src/hooks/usePlannedWorkouts.ts` (A1 — capture target row date+type before delete, remove `strength_logger_session_${date}` after successful DELETE), `src/components/StrengthLogger.tsx` (A2 — verify `sourcePlannedId` still exists in DB before hydrating; fail-safe on lookup errors).

**Bug:** athlete deletes today's planned strength workout from the calendar. The DELETE succeeds (row gone from `planned_workouts`). Athlete taps "Log Strength" later — the deleted workout *resurrects* in the logger, hydrated from localStorage as if it were still planned.

**Root cause:** the StrengthLogger session JSON in localStorage is keyed by date (`strength_logger_session_2026-06-03`) and persists `sourcePlannedId` pointing at the planned row. Deleting the planned row from the DB does NOT touch the localStorage cache; the next "Log Strength" tap restores from the orphan cache. Same class as D-110's sibling silent-cluster (D-075 / D-081 / D-083 / D-089 / D-094 / D-103 / D-105) — data state in two places, mutation to one doesn't propagate.

**Fix shape: AND gate at both sides** (audit's A1 + A2 — A1 alone is insufficient because the cache can be orphaned by paths other than the calendar delete: server-side cleanup, multi-device, manual DB tinkering).

**A1 — delete-side cleanup** (`usePlannedWorkouts.ts deletePlannedWorkout`):
- Capture `targetRow = plannedWorkouts.find(w => w.id === id)` and pull `targetDate` + `targetType` BEFORE the supabase DELETE call. The in-memory state still has them at this point.
- After successful DELETE, if `targetType === 'strength'` and `targetDate` is set, `localStorage.removeItem(\`strength_logger_session_${targetDate}\`)`.
- Captures *every* delete that flows through the hook. Doesn't fire on cascade deletes or server-direct mutations.

**A2 — restore-side fail-safe verify** (`StrengthLogger.tsx` mount-time init useEffect):
- Wrap the restore path in an async IIFE.
- After parsing the localStorage session, IF the persisted `sourcePlannedId` is non-null, do a `select('id').eq('id', sourcePlannedId).maybeSingle()` to verify the row still exists in `planned_workouts`.
- **CRITICAL fail-safe**: only clear the session when the lookup returns a *definitive "no row"*:
  ```typescript
  async function plannedRowMissing(id: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('planned_workouts').select('id').eq('id', id).maybeSingle();
      return (error == null) && (data == null);
    } catch { return false; }
  }
  ```
  Errors (offline, network timeout, RLS hiccup, Supabase 5xx) → return `false` → preserve session. **Never** wipe an in-progress session because the network blinked.
- If missing: clear `strength_logger_session_${date}` + `strength_logger_open` and fall through to `runFreshInit()` (extracted local function — the existing fresh-init path).
- If present: hydrate as before.

Considered: clear on DELETE only (A1 alone, simpler). Rejected — A1 only catches orphans created through this hook. A2 catches resurrection *regardless of how the orphan was created*, because A2 guards at the restore side. Both ship together — A1 narrows the orphan window, A2 closes the resurrection vector.

Considered: clear on ANY error (no fail-safe). Rejected — would wipe in-progress logger session whenever a mid-workout phone-flake hit the verify query. The strict `(error == null) && (data == null)` check is the right safety posture.

**Out of scope (filed separate):** Leak B (`usePlannedWorkouts` per-instance React state — deletes don't invalidate sibling instances' caches, so the deleted row keeps appearing under "Pick planned" elsewhere in the UI until manual refresh). Awaiting cross-component invalidation work via `planned:invalidate` window CustomEvent.

**Verification:** delete a planned strength workout from the calendar; tap "Log Strength" → fresh logger, no resurrection. Repro flow no longer reproduces. The fail-safe was hand-tested by disabling network mid-mount: session preserved as expected.

---

## D-111 — FTP cliff guard: confidence floor (Tier 2 cap) + writer-side ratchet floor

**Date:** 2026-06-05 (commit `e46aed65`)
**Files:** `supabase/functions/learn-fitness-profile/index.ts` (Tier 2 confidence cap at 928; ratchet floor at 300-321).

**Bug:** the cycling FTP learner cascades Tier 1 (best 20-min power × 0.95) → Tier 2 (best hard-effort NP × 0.95) → Tier 3 (avg power × 1.05 × 0.95) → Tier 4 (best NP overall × 0.95). Tier 1 requires ≥2 eligible rides with a populated `power_curve['20min']`. When the 90d window slid hard rides out without replacement and the eligible count dropped to <2, Tier 2 fired with 'high' confidence (≥3 hard rides → high per pre-fix line 928). The resolver in `src/lib/resolve-current-ftp.ts` trusts 'high' learned over 'manual'. Result: 176W could cliff to 144W (32W = -18%) overnight with no real fitness change.

**Two changes, work as a pair:**

1. **Tier 2 confidence cap at 'medium'** (line 928). Was `≥3 → 'high', =2 → 'medium', =1 → 'low'`. Now `≥2 → 'medium', =1 → 'low'`. Tier 2 is a fallback estimate, not a 20-min measurement — never claim resolver-trusted 'high'. Tier 3 already capped at medium (line 958), Tier 4 always low (line 977), Tier 1 untouched.

2. **Ratchet floor in the writer** (lines 300-321). The prior FTP is already in scope as `existing.ride_ftp_estimated` (line 299, parsed from existingBaselines). Added guard: if BOTH new value < prior value AND new confidence tier-ranks lower than prior (high>medium>low), keep prior; else overwrite. No-op on INSERT path (existing parses to `{}` → priorFtp undefined → short-circuits).

**Why the two changes are coupled:** the Tier 2 cap alone doesn't dodge the cliff (resolver still trusts medium). It's what makes the ratchet's confidence-drop check meaningful — any Tier-1→Tier-2 collapse is now ALWAYS a confidence drop (high→medium), which the ratchet recognizes and blocks.

**Considered and rejected:**
- **Pure ratchet (don't overwrite if new < old):** traps inflated FTP after real detrain. A 3-month layoff with real 176→150 decline would stay at 176, leading to percentage-based intervals at 117% of actual capacity. The brutal version of this is the trap the run-pace side already had problems with.
- **Hysteresis (N consecutive runs confirm lower):** correct architecture but adds new schema (pending-drop counter field + tolerance band coefficient). Deferred.
- **Window widen (180d for FTP only):** delays the cliff by 90 days but doesn't fix the structural problem. Also leaks into other learner outputs (threshold HR, easy HR) unless we shape a second fetch.

**Tradeoff accepted:** a brand-new user with no prior FTP takes the first tier-collapse value at face. Confidence-floor still applies (Tier 2 → 'medium', Tier 3 → 'low'), but there's no prior to ratchet against. Hysteresis would close this; deferred.

**Verification:** post-deploy re-trigger of learn-fitness-profile for user 45d122e7: ride_ftp_estimated stable at `{ value: 176, confidence: high, source: "95% of 20-min best power (12 efforts)" }`. last_updated advances 04:30 → 12:57 UTC without disturbing value. Trap-door closes against any future Tier-1→Tier-2 collapse for this user as long as a 'high' anchor exists.

---

## D-112 — Preserve 0W coasting samples in the shared sensor extractor + 30s Coggan startup trim

**Date:** 2026-06-05 (commit `05b69313`)
**Files:** `supabase/lib/analysis/sensor-data/extractor.ts` (zero-preserve coercion at line 246), `supabase/functions/compute-workout-analysis/index.ts` (30s Coggan startup trim at line 1262; ANALYSIS_VERSION bumped 0.1.8 → 0.1.9 as deploy cache-bust diagnostic).

**Bug:** the shared `normalizeSamples` in the extractor coerced raw power through `(typeof s.power === 'number' && s.power) || (typeof s.watts === 'number' && s.watts) || undefined`. The `&& s.power` short-circuit treats 0 as falsy, so coasting samples (which Strava reports as `power: 0`, not null) became `undefined` → then `null` in the `power_watts` array (line 1189 of compute-workout-analysis), then stripped by the NP rolling-window filter at `p !== null && !isNaN(p)`.

Net effect: NP and VI computed over a *pedaling-only* power series. Outdoor sweet-spot ride 6bf694a6 (3,483 samples, 1,169 of them 0W = 34% coasting): Efforts read NP 169W vs Garmin's Coggan-correct 141W. That 28W cascaded into IF (0.96 vs 0.79), VI (1.13 vs 1.41), TSS (89 vs 62). Per-ride inflation ~20% on rides with significant coasting; 25% over-count of cycling load across the user's 90d block.

**Two changes:**

1. **Zero-preserve coercion** (`supabase/lib/analysis/sensor-data/extractor.ts:246`). Explicit ternary: `typeof s.power === 'number' ? s.power : typeof s.watts === 'number' ? s.watts : undefined`. 0 now survives as 0; `undefined` only for samples that genuinely lack a power field.

2. **30s Coggan startup trim** (`compute-workout-analysis/index.ts:1262`). Drop the first 29 rolling-average entries (incomplete windows of 1, 2, …, 29 samples) before the 4th-root mean. ~1-2W effect per ride; the textbook Coggan algorithm specifies it.

**Power curve unaffected by design:** `rollingMaxAverage` at `compute-workout-analysis/index.ts:51-82` filters with `v !== null && Number.isFinite(v) && v > 0` (line 56) — `v > 0` still strips zeros explicitly by design (best-of-N-min-pedaling semantic, intentionally zero-stripped). Input array now contains 0s instead of nulls; output identical. D-111's FTP learner reads `workouts.normalized_power` (top-level Strava column, never touched by this function) and `computed.power_curve['20min']` — both safe. Tier 2 fallbacks of D-111 are also safe because they too read Strava's NP, not the inflated value.

**Detour worth filing (footgun added to silent-cluster catalog):** the first edit landed inside a `/* ... */` block at `compute-workout-analysis/index.ts:1050-1095` — a dead-code duplicate of `normalizeSamples` left over from an extract-to-shared-lib refactor. The deploy succeeded, version-bumped (0.1.8 → 0.1.9 visible in the response payload), but the values didn't change. The 30s trim moved NP by 1W, which initially looked like deploy propagation lag. The ANALYSIS_VERSION bump (used here purely as a deploy-cache-bust marker) is what made the deploy-but-no-change observable — once v0.1.9 appeared in responses without value change, the dead-block hypothesis surfaced quickly. Dead block was reverted; real fix landed in the live extractor. The dead `/* */` block remains in compute-workout-analysis because removing it is a refactor not part of D-112; a future session may clean it.

**Backfill:** 20 cycling rides for user 45d122e7 re-triggered via deployed `compute-workout-analysis`. All 20 match the pre-deploy dry-run within 0-1W. Target 6bf694a6: 168→140W (within 1W of Garmin 141W). Zwift indoor rides (f9fb690b, 7f15c92f): moved 2W only — canary confirming the fix targets coast-bearing outdoor rides and isn't an across-the-board reduction. Total 90d cycling TSS: 2493 → 1865 (-628 phantom TSS).

**Considered:** rewriting line 1069 in `compute-workout-analysis/index.ts` instead of the extractor. Rejected — that's the dead `/* */` block; live path is the extractor. The discovery loop is the durable artifact.

**Diagnostic pattern worth keeping:** when a deploy succeeds and a clearly-deterministic change doesn't materialize in DB state, bump a visible version constant in the request response payload (here `ANALYSIS_VERSION`). If the new version appears without value change, the deploy reached production but the code path you edited isn't the one running.

---

## D-113 — POWER row reads executed_intensity, not classified_type

**Date:** 2026-06-05 (commit `3f9d6df3`)
**Files:** `supabase/functions/_shared/session-detail/build.ts:1342` (descriptor source swap).

**Bug:** D-091 (2026-05-27) made `classified_type` follow planned intent — correct for grouping (pwr20_trend_v1 same-type filter), cross-workout trends (np-trend), and the LLM's STRUCTURED PLANNED MODE prompt gate. But the cycling POWER row at session-detail/build.ts:1342 glued classified_type into one sentence with executed metrics: `"Normalized power ${np}W (${pctThreshold}% of threshold) — ${ct} effort"`. Result on outdoor sweet-spot ride 6bf694a6: `"Normalized power 140W (79% of threshold) — sweet spot effort"` — a contradiction (79% of threshold is endurance/tempo, not sweet spot 88-94%). The label was asserting planned intent as if it were executed reality.

**Fix:** swap descriptor source from `classified_type` (planned intent) to `derived.executed_intensity` (easy/moderate/hard, deterministically computed from IF + ftp_bins by `_shared/cycling-v1/utils.ts:65`). The four-bucket classifier was already in the packet pre-fix; nothing read it for this label. classified_type left untouched for grouping/trends. The fact packet, the LLM INSIGHTS narrative path, the resolver, the FTP learner — none touched.

**Why this is the minimal honest fix (Option A in the report):**
- Doesn't invent new thresholds or coefficients (executed_intensity is already in the packet).
- Doesn't change any grouping/trend behavior (classified_type still the authority for pwr20_trend_v1, np_trend, STRUCTURED PLANNED MODE gate).
- Doesn't require a fact-packet schema change.
- Stops the user-visible contradiction tonight without committing to the deeper architecture decision.

**Considered (Option B in the report — fully specced, deferred to Q-036):** new `derived.intent_execution_match` field, computed deterministically from planned TSS (summed Coggan from `planned_workouts.computed.steps`) vs actual TSS (`computed.analysis.power.tss`), with ±20% / ±50% bands. Both renderer AND LLM read it. The principled answer, but adds schema + LLM HARD CONSTRAINT + backfill + needs a coefficient decision (secondary IF gate). Out of scope for tonight; full spec captured in Q-036.

**Considered (Option D in the report):** override classified_type to executed category when execution diverges far enough. Rejected explicitly — it would silently change `pwr20_trend_v1`'s same-type filter and break grouping. classified_type is the planned-intent authority by design.

**Tradeoff accepted (caveats):**
- Persisted `workout_analysis.session_detail_v1` JSONB still holds old strings until the next user-JWT view triggers rebuild — service-role cannot refresh it server-side via the existing `workout-detail` endpoint (the session_detail scope requires a user token at line 1132-1134). Will refresh organically when user opens each ride.
- The LLM lede in `ai-summary.ts` can still slip into "right in the sweet-spot zone" on under-executed rides whose `interval_summary` is null (gate at ai-summary.ts:402 / D-092 STRUCTURED PLANNED MODE). Indoor structured rides have laps → interval_summary populated → adherence-aware lede fires. Outdoor "attempted intervals" without clean laps → interval_summary null → LLM defaults to whole-ride narrative + reads `classified_type` as fact. That's Option B's territory — Q-036.

**Verification:** deterministic against live fact packets (see `scripts/power-row-verify.mjs`). 6bf694a6 (IF 0.79, executed=moderate): "Normalized power 140W (79% of threshold) — **moderate effort**". f9fb690b (IF 0.83, executed=hard): "...— **hard effort**". May 26 Zwift case lost the "sweet spot" wording too — that's a small honest gap (the colour goes; the truthfulness arrives). Trade accepted.

---

## D-114 — Strength set rows are collapse/expand, not a flat width-budgeted grid (Q-034 close, 2026-06-08)

**Context:** the set row at `StrengthLogger.tsx:3256` overflowed the exercise card on ~380px viewports — Done/✕ rendered in the black gutter (Q-034). The single horizontal `flex items-start gap-2` packed set#/reps/weight+stepper/RIR/Same/Done/✕ (~470px of fixed-width children + gaps) into a ~316px content box with no width or overflow handling.

**Decision:** collapse/expand, not the 2-row `grid grid-cols-12` restructure that Q-034's recipe proposed. Only the active set (first incomplete, per exercise) renders full controls; every other set collapses to a one-line summary.
- **Per-exercise active set, UI-only state.** New `activeSetByExercise: Record<exerciseId, number>` — explicit override (a re-opened completed set) else `findIndex(!completed)`, else -1 (all collapsed). Scoped per exercise so expanding Bench doesn't collapse Row's working set. **Deliberately NOT written to the `strength_logger_session_*` localStorage key** — it's view state, not session data, so D-108/D-109 resume logic is untouched. Per-set data still persists on Done exactly as before.
- **Collapsed row** = summary line (`{weight} lb × {reps} · RIR {x}`, with duration/band/bodyweight variants) + Done/✕ inside the card. The overflow class is killed structurally: `min-w-0 + truncate` on the summary span + `shrink-0` on Done/✕ means the summary absorbs any squeeze and the action buttons can never be pushed past the border. This is the actual fix for the whole overflow family, not a one-row patch.
- **Expanded row** = controls stacked vertically (reps/weight inputs row, steppers, RIR pills, equipment, rest/Start), Done/✕ in a right-aligned footer. Nothing is packed horizontally, so no single line can exceed card width regardless of how many widgets D-096/D-098/D-099 added.
- **Auto-advance:** Done on the active set drops the explicit override → active falls through to the next incomplete set, which auto-expands.

**Rejected — the grid restructure (Q-034 recipe).** A flat 2-row 12-col grid keeps every control on screen for every set and re-budgets columns. It works, but it's a width-budget tightrope: the next widget (cadence, tempo, plate-color) re-breaks it, and it forces the RIR pills to shrink (`w-7 → w-5`), degrading the tap target. Collapse/expand removes the budget constraint entirely instead of re-balancing it, and a resting set doesn't need its full control surface visible.

**Files:** `src/components/StrengthLogger.tsx` (active-set state ~:420; per-set compute + collapsed/expanded branch inside `exercise.sets.map`). **Verification:** `scripts/verify-strength-row-380.mjs` renders the exact markup against the compiled Tailwind CSS at 380px — every control ≤344px vs the 354px card border in both states; the old horizontal layout overflowed +207px (negative control proving the harness is real). Commit `ce83b9b0`.

**Addendum (2026-06-10) — three follow-ups on the same set-row work (Q-034 stays closed; POLISH §7 overflow stays closed):**
- **Expanded-stack ordering + collapsed-summary RIR (commit `caa25da2`).** The first cut left equipment/plate/rest rendering *outside* the flex-col, so the Done/✕ footer sat mid-stack above them. Moved them inside; footer is now last. Expanded order: set#/reps/weight+steppers → RIR → Same → equipment → rest/Start → Done/✕. Collapsed summary now always shows RIR (`· RIR —` when unlogged).
- **"Target: N" RIR caption mislabel — a DISPLAY bug, distinct from the layout work (commit `e60877d4`).** The inline RIR pill row (1–5, writes `set.rir`, the real RIR input) was captioned only `Target: {target_rir}` when a target was prescribed — the word "RIR" never appeared on screen (only in the aria-label). With the deload prescribing `target_rir=4` and a 4–6 rep target, it read exactly like a target-*reps* readout, so the RIR input looked absent. Label-only fix: always-visible "RIR" heading above the pills + the prescribed target as a secondary `target N` caption; never a bare "Target: N" again. Binding (`updateSet({ rir })`), the Done-time RIR-prompt fallback, and all state untouched. Lesson: a control can be present and correctly bound yet effectively invisible because its only on-screen label describes the prescription, not the input.
- **`target_rir` is INDEPENDENT of reps — confirmed via DB read; do NOT re-investigate "reps bleeding into RIR."** Test user's planned strength sessions: Base Hypertrophy compounds = `target_rir 3` at `reps 8–10` (**0/7** exercises match rep-range low-end; accessories carry no target_rir); Hypertrophy Deload (`9bf56124`) = `target_rir 4` at `reps 4–6`. So `target_rir` is a real, independent RIR prescription (3 in base, 4 in the easier deload). The deload's `target_rir 4` equalling its rep-range low-end (4) is a coincidence — and precisely the coincidence that made the mislabel convincing. No reps-into-RIR data bug; no generator change.

## D-115 — Rest is the gap *after* set N-1; set 0 renders no rest row (Q-034 / Bug A, 2026-06-08)

> **SUPERSEDED — see [D-121](#d-121) for current behavior (2026-06-11).** Chain: D-115 (set-0 renders no rest) → [D-120](#d-120) (moved the timer to the just-finished set + auto-started it — the auto-start experiment, reverted) → **D-121** (opt-in courtesy: rest row on every set except the last, idle by default, user taps Start). The index-0 footgun note below still stands. Original reasoning kept for the record.

**Context:** Bench Press set 1 showed a 1:30 rest timer, set 2 showed 2:30 — same lift, same 4-rep target, on a deload session. Rest should be uniform across sets of one lift.

**Root cause (render, not data):** the logger never stores rest — it's always computed from reps via `calculateRestTime` (`:115`). The rest-timer block derived each row's value from the **previous** set's reps (`exercise.sets[setIndex - 1]`), the "rest after set N-1" model that `startAutoRestForNextSet` also writes to (key `${exerciseId}-${completedSetIndex + 1}`). Set 0 has no previous set, so it hit a hardcoded `: 90` (1:30) fallback; set 1 computed `calculateRestTime(Bench, 4)` = 150 (2:30) — a compound at 3-5 reps. Both numbers were "correct" under the model; the inconsistency was set 0's missing-previous fallback.

**Decision:** set 0 renders **no rest row at all** (`showRestTimer` now requires `setIndex > 0`), and the hardcoded 90s default is removed rather than swapped for a less-wrong default. Rationale (physiology over tidy uniformity): rest is the recovery gap *between* sets — you don't rest before your first working set. Forcing a uniform 2:30 onto set 1 would imply a pre-set rest that doesn't exist, and with D-114 auto-advance it would start a phantom timer before the athlete has lifted anything. No row is the honest representation. Sets 1+ keep the existing previous-set computation unchanged.

**Verified safe against auto-rest:** suppressing set 0's *rendered* row does not touch `startAutoRestForNextSet` — it writes the `+1` key, so completing set 0 still starts **set 1's** timer (it never writes a `-0` key). Confirmed at `:459`.

**Footgun (recurring bug class) — index-0 hardcoded fallback defaults.** When a per-item value is derived from the *previous* item, item 0 has no predecessor and tends to get a silent hardcoded default (here `: 90`) that diverges from every real value and reads as a bug. Same family as the failure-to-zero / truthy-coercion footgun behind D-112 (0W coasting samples coerced to null): both are "the boundary element silently gets a wrong default." When a per-set/per-sample default is only hit by the first (or zeroth) element, ask whether that element should carry the value at all — don't pick a less-wrong default to paper it over.

**Files:** `src/components/StrengthLogger.tsx:~3210` (`showRestTimer` gate). Commit `ce83b9b0`.

---

## D-116 — RIR scale 0–5+; RIR ≥5 excluded from e1RM (Q-039 steps 1+2, 2026-06-11)

> **INERT — landed on a DEAD path.** The RIR-picker-scale half (0–5+, keypad clamp) is live and correct. But the engine half (`compute-adaptation-metrics/estimate1Rm` excluding RIR ≥5) writes `workout_adaptation`, which has **0 readers** — so it has **no effect** on plans or UI. The discovery came right after (Q-040): the LIVE e1RM path is `compute-facts/brzycki1RM`, fixed separately by **[D-118](#d-118)** (RIR preference-with-fallback). Treat the e1RM/RIR rule as D-118; D-116's engine change is a no-op kept only because it's harmless. Retire-vs-wire the dead path = Q-041. The scale/clamp/`avg_rir`-preservation decisions below remain accurate.

**Context:** Q-039 set-logger refactor. The pre-check before step 1 found that RIR already feeds e1RM in `compute-adaptation-metrics/estimate1Rm` as `epley × (1 + rir/10)` — so a RIR-5 set inflates the estimate by ×1.5. The spec says RIR 5 is an autoregulation signal only, *excluded* from e1RM. Making "5+" a first-class picker option (step 1) without fixing the engine (step 2) would have spread that inflation, so per the working contract the two steps shipped together.

**Decisions:**
- **RIR picker scale 1–5 → `0, 1, 2, 3, 4, 5+`.** Added 0 (= at failure) and capped the top as "5+". The cell, the target caption, and the picker all render `5+` for values ≥5.
- **"5+" stored as integer `5`, with NO separate `rir_capped` flag.** The spec allowed "or just 5"; since the engine now branches on `rir >= 5`, a flag would be redundant. One less field to thread through storage/analyzer.
- **Engine (`estimate1Rm`): RIR ≥5 returns `null` (excluded from e1RM).** RIR 0–4 → `epley × (1 + rir/10)` (unchanged); `null` RIR → raw Epley (unchanged, no RIR data). The caller stores `estimated_1rm: null` for excluded sets; downstream `useExerciseLog` already skips `estimated_1rm ?? 0 <= 0`, so null is safe end-to-end. **`avg_rir` is still recorded** for RIR-5 sets — the autoregulation signal is preserved; only the e1RM data point is dropped.
- **Manual keypad entry clamps RIR to 0–5** (was 0–10).
- **Effective-reps:** not implemented anywhere yet (grep clean across `src` + `supabase/functions`). The spec's "RIR 0–4 usable for effective-reps" is N/A until that calc exists; only the e1RM path needed the exclusion now.

**Layout note (interim, not the final Q-039 layout):** adding the 0 pill made it 6 pills. Kept `w-9` (36px) by tightening the pill row `gap-2 → gap-1` and `paddingLeft 28 → 4`, so the group's right edge stays anchored under the RIR cell (240px) — harness `pillRight 240 == rirCellRight 240`, no border crossing. The 44px tap targets + windowed rep-circle picker + 2×2 stepper + grid are Q-039 steps 3–4, still pending.

**Files:** `src/components/StrengthLogger.tsx` (pills 0–5+ at ~:3540, cell/caption `5+`, keypad clamp ~:525), `supabase/functions/compute-adaptation-metrics/index.ts` (`estimate1Rm` exclusion at :94 + caller at :430). **Verification:** app build + 380px harness; engine change is a single call site, downstream null-safe. **Commit:** see Q-039 step-1+2 commit.

---

## D-117 — Q-039 step 3: narrow controls (rep-circle picker, 2×2 stepper, reactive entry, 2026-06-11)

**Context:** Q-039 step 3 — the "narrow controls" that make the columns viable. Pure logger UI, no e1RM dependency (so it proceeded in parallel while the Q-040 e1RM-path decision is pending).

**Decisions:**
- **Rep-circle picker** (new): a window of 5 circles `[lo … lo+4]` where `lo = max(1, center − 2)` and `center = set.reps` (current value). Tapping a circle sets reps. **Re-centers on any reps change** (pick or keypad) because the window is derived from `set.reps`. Centered on `set.reps` rather than a separate target field: reps prefills to the prescribed target (D-097), so the initial window is target-centered, and this is the simplest thing that also satisfies "re-center on manual edit". Hidden for duration-based / no-reps ("until") patterns. Left edge under the Reps cell (`paddingLeft 32` = set#24 + gap8); `w-9` circles, `gap-1`. The reps *cell* (keypad) stays the source of truth; the circles are a shortcut (same cell-vs-picker split as RIR).
- **2×2 weight stepper** (was 1×4): `grid grid-cols-2`, order `[-5, 5, -2.5, 2.5]` → −5/+5 top row, −2.5/+2.5 bottom row. Narrower footprint than the 1×4 so it sits under the Weight column without crowding.
- **Reactive manual entry:** pickers read `set.*`, so keypad-typed values reflect immediately — the rep window re-centers, RIR pill selection moves. (Already true for RIR; the rep picker makes it true for reps too.)
- **Validation:** reps keypad clamps a valid number to `Math.max(1, round(n))` (logged reps are integers ≥1); invalid/empty entry clears to 0. Weight stays `≥0` arbitrary (no snapping — dumbbells/kg). RIR clamps 0–5 (D-116).

**Layout note (interim — step 4 finalizes):** rep-circles / RIR pills / stepper are currently three separate full-width rows, each edge-anchored under its column (rep-circles left @32 under Reps, 2×2 stepper left @104 under Weight, RIR pills right-edge @240 under RIR). The 44px-min tap targets and the true 3-col grid (with the full-width-row fallback as the 380px default) are **Q-039 step 4**, still pending.

**Files:** `src/components/StrengthLogger.tsx` (rep-circle picker block ~:3523, 2×2 stepper ~:3618, reps keypad clamp ~:521). **Verification:** app build clean; 380px harness — all sets/both exercises `overflowPx -10` (no border crossing), `stepperLeftVsWeight 0`, `pillRight 240`. Commit: Q-039 step-3 commit.

---

## D-118 — RIR preference-with-fallback in the live e1RM path + strength_1rms backfill (Q-040 decision #1, 2026-06-11)

**Context:** Q-040 found the live, plan-driving e1RM path is `compute-facts` (Brzycki on reps+RIR) → `exercise_log` + `learned_fitness.strength_1rms` (consumed by coach / materialize-plan for load prescription), and it had no RIR cap — a far-from-failure (RIR ≥5) session could set an inflated `strength_1rm`. Decision #1 approved the rule below (the data showed 0 exercises would go dark; see Q-039 session report).

**Rule (in `compute-facts/updateLearnedStrengthFromExerciseLog`):** within the 12-week window, aggregate a lift's `strength_1rm` (max e1RM) from sessions with `avg_rir ≤ 4` **or no RIR data** when any such sessions exist. If a lift has **only** RIR ≥5 sessions, fall back to using them (Brzycki on reps+RIR — don't go dark) and flag the estimate **`confidence: "low"`**. **Preference-with-fallback, not blanket exclusion.** Granularity is the session's `avg_rir` (one `exercise_log` row per session), not per-set — that's the resolution `compute-facts` already computes at.
- Per-session `exercise_log.estimated_1rm` values are **unchanged** (still Brzycki on reps+RIR per session); the rule only changes which sessions feed the window aggregate.
- `confidence` is `"low" | "medium" | "high"` (`confidenceFromSamples`); fallback estimates are forced `"low"`, and excluding RIR ≥5 sessions also reduces `sample_count`, which legitimately lowers confidence for thinned lifts.

**Scope flag (NOT changed — see Q-040 follow-up):** the UI progression trend (`useExerciseLog` → StrengthSummaryView/BlockSummaryTab) still reads raw per-session `exercise_log.estimated_1rm`, so a RIR-5 session still appears as a data point in the trend and could show as the "current" point. The rule was applied to the **aggregate** (`strength_1rms`, which drives plans) per Decision #1's framing; extending the same `avg_rir ≤4` preference to the UI trend's current/peak derivation is a separate, lower-stakes follow-up (left for after on-device review of step 4).

**Backfill (re-ran the deployed `compute-facts` once for the user; `updateLearnedStrengthFromExerciseLog` re-aggregates the full window, so one trigger suffices — exercise_log rows unchanged):**
| lift | before | after | note |
|---|---|---|---|
| trap_bar_deadlift | 160 (medium) | **150 (low)** | −10; RIR≥5 session was the window-max, excluded |
| barbell_row | 130 (high) | **120 (low)** | −10; same — RIR≥5 was the max |
| bench_press | 165 (high) | 165 (medium) | value unchanged (max from a RIR≤4 session); count/confidence down |
| squat | 105 (medium) | 105 (low) | value unchanged; sample_count 3→2 after excluding a RIR≥5 session |
| overhead_press | 105 (medium) | 105 (low) | value unchanged; thinned to 1 sample |

Two lifts corrected downward (−10 each); none went dark. **Plan loads now derive from the corrected `strength_1rms`** — `materialize-plan:2612` reads `learned_fitness.strength_1rms` (then manual `performance_numbers` override, then hardcoded default), so the next plan generation uses 120/150 instead of 130/160.

Note vs the earlier spot-check: that used canonical `deadlift`'s *latest-session* e1RM (175→155); `strength_1rms` uses the *window-max* for `trap_bar_deadlift` (160→150). Different aggregation, same direction — RIR≥5 inflation removed. Also: **more than deadlift changed** (barbell_row too), because barbell_row's window-max was also a RIR≥5 session.

**Files:** `supabase/functions/compute-facts/index.ts` (`updateLearnedStrengthFromExerciseLog` ~:984). **Deployed** to `yyriamwvtvzlkumqrvpm`. **Verification:** backfill before/after above; rule is preference-with-fallback (0 lifts dark). The dead `compute-adaptation-metrics` path (D-116) is unaffected and still inert (Q-041).

---

## D-119 — Q-039 step 4: labeled full-width control rows (alignment-alone doesn't survive a 5-wide picker, 2026-06-11)

**Context:** Q-039 step 4 — the layout pass. The screenshot showed the rep-circle row and RIR-pill row as two **visually identical, overlapping** rows (both ~36px number circles), so the user couldn't tell which was which. The earlier "alignment is the labeling / no row labels" intent (Q-039) was the goal, but it **doesn't survive contact with the geometry**: a 5-circle rep picker (and a 6-pill RIR row) is ~200–240px wide, far wider than its 64px header column, so two such rows in a 308px card **cannot be positioned to not overlap** at any tappable size. Proven with the harness across the whole iteration.

**Decision (made jointly with the user):** keep the controls at a comfortable ~32px (`w-8`) as **full-width rows** (the Q-039 primary layout), and differentiate each row with a **minimal 3-char leading text label** — `Reps` / `Wt` / `RIR` — a fixed-width (`w-9`) inline row-leader, NOT a column header. The label is the cheap, honest fix that makes stacked rows legible. The 44px-min tap target lives on the **keypad cells** (the source-of-truth primary input); the circle/pill rows are smaller shortcuts. This is "closer to option B" from the fork, deliberately chosen over shrinking circles to ~20px (which would chase a column alignment that can't fully hold anyway, at the cost of tappability).
- **Captions corrected to the Q-039 spec:** the Reps row shows **`target N`** (the prescribed reps — newly plumbed as `exercise.target_reps`, e.g. "4-6", from the prescription `reps` string), and the RIR row shows **`suggested N`** (renamed from "target"; RIR is a suggestion, not a hard target). This fixes the earlier mislabel where the lone "target 4" caption (actually `target_rir`) sat under the RIR row and read like a rep target.
- Circles `w-9 → w-8`; stepper stays the 2×2 from D-117; `paddingLeft` column-anchoring removed (the label + consistent leader width is the alignment now).

**Files:** `src/components/StrengthLogger.tsx` (LoggedExercise `target_reps` field; prescription parse ~:1227; the three labeled control rows ~:3529/:3578/:3630). **Verification:** app build clean; 380px harness all sets/both exercises `overflowPx -10` (no border crossing); each row carries a `Reps`/`Wt`/`RIR` leader. **Q-039 sequence complete** (steps 1–4); the only remaining strength-logger item is the Q-040 UI-trend follow-up (RIR-5 trend points visible-but-dimmed), explicitly sequenced after this.

---

## D-120 — Rest belongs to the just-finished set, not the upcoming one (reverses D-115, 2026-06-11)

> **AUTO-START EXPERIMENT — REVERTED by [D-121](#d-121) (2026-06-11).** D-120 moved the timer to the just-finished set's card AND made it **auto-start on Done** (gated on `set.completed`). The auto-trigger was unwanted: the rest timer is a courtesy, not something that should fire itself. D-121 reverts to an **opt-in** model — the rest row appears on every set except the last, shows the duration **idle** (no auto-count), and the user taps **Start** to launch it. The Pause/Resume/Skip controls and `restDismissed` state introduced here are **kept**; the auto-start function (`startRestAfterSet`) and the `set.completed` gate are gone. Kept here for the record.

**Context:** The rest timer lived on the **upcoming** set's card: finish set 1 → the timer appeared on set 2. Backwards from how a lifter experiences it — you finish a set, *then* you rest, and the rest you just triggered showed up attached to a set you hadn't done yet. D-115's "rest is the gap after set N-1" model was internally consistent but read as a bug at the bench.

**Decision — each set owns the rest that FOLLOWS it.** The rule flips from *"timer on set N+1's card, shown for sets > 0"* to *"timer on set N's card when set N is completed AND set N is not the last set."*
- **Position:** `startRestAfterSet` (renamed from `startAutoRestForNextSet`) writes the running timer to key `${exerciseId}-${N}` (was `${N+1}`) when set N's Done is tapped. The `!nextSet` guard is unchanged — "has a next set" *is* "not the last set", so the last set still auto-starts nothing (nothing meaningful follows it).
- **Gate:** `showRestTimer = !isDurationBased && !isLastSet && set.completed && !restDismissed.has(key)`. Gating on `set.completed` (not `setIndex > 0`) means undone sets show **no idle rest row** — which preserves D-115's honesty principle (never imply a rest that hasn't happened) the right way: a fresh exercise shows zero rest rows until you start completing sets. That absence is expected, not a regression from the old idle "Rest 2:30 / Start" that used to sit on set 2.
- **Duration source:** the rendered fallback now derives from **`set.reps`** (the set just finished) instead of `exercise.sets[setIndex-1].reps` (the previous set). Each set's rest reflects its own effort. `restSeconds` inside the auto-start was already computed from the completed set's reps — unchanged.
- **Controls:** the manual **Start** button is gone (auto-starts on Done). Replaced with **Pause/Resume** (toggles `running` on the existing timer) and **Skip** (cuts it short → `seconds:0, running:false` + adds the key to a new `restDismissed` set that hides the row). A re-completed set re-arms: `startRestAfterSet` clears the dismissed key on a fresh start. The tap-to-edit time button (long-press reset) is retained.

**Files:** `src/components/StrengthLogger.tsx` — `startRestAfterSet` (~:448) + 4 callers; `restDismissed` state (~:381); `showRestTimer` gate (~:3218); footer Rest/Pause/Skip block + `set.reps` duration source (~:3838). **Verification:** app build clean; 380px harness — rest row renders on completed non-last sets with Rest+Pause+Skip (`overflowPx -10`, footer below open picker), last sets render no rest row, steppers still aligned 44→308. Device-verify steps reported to user.

---

## D-121 — Rest timer is opt-in: idle by default, user owns when it counts (reverts D-120's auto-start, 2026-06-11)

> **SUPERSEDED by [D-139](#d-139) (2026-06-11).** The opt-in model was reverted back to **auto-start** — but cleanly, surfaced only in a pinned top pill (not the in-card controls D-120 used). Saga: D-120 (auto-start, in-card) → D-121 (opt-in) → D-139 (auto-start, top-pill-only + haptics). The in-row Start/Pause/Resume/Skip controls described below are gone.

**Context:** D-120 made the rest timer auto-start the moment you tapped Done on a set. In use that's the wrong default — the rest timer is a *courtesy*, not something that should launch itself and start beeping. The right model is the simplest one: the timer exists, the user decides when (and whether) it counts.

**Decision — opt-in courtesy, minimal:**
- **Presence:** the rest row appears on **every set except the last** (no rest after the final set). `showRestTimer = !isDurationBased && !isLastSet && !restDismissed.has(key)`. **No `set.completed` gate, no auto-trigger.** A set that hasn't been done still shows its idle rest row.
- **Idle by default:** the timer displays its duration (e.g. `2:30`) but does **not** count. The auto-start function (`startRestAfterSet`) and its four call sites are **deleted** — completing a set no longer touches the timer.
- **User-launched:** a single toggle button — **Start** when never-started, **Pause** while running, **Resume** when paused mid-count (label derived from `restTimer.running` + whether `seconds < restCalcSeconds`). **Skip** cuts it short and hides the row (`restDismissed`). The tap-to-edit time button (long-press reset) is retained.
- **Kept from D-120:** the Pause/Resume/Skip controls, the `restDismissed` set, and the `set.reps` duration source (no duration-logic changes were in scope for this revert).

**Why no re-arm:** without auto-start there's nothing to re-arm — Skip simply dismisses the row for that set for the session, which is the intended "hide it" behavior.

**Doc-attribution note:** the user's request said 'mark D-115 as "auto-start experiment, reverted".' The auto-start was actually introduced by **D-120** (D-115 was the earlier set-0-no-rest decision), so the "auto-start experiment, reverted" banner is placed on D-120 for accuracy. The chain is now D-115 → D-120 (auto-start, reverted) → D-121 (opt-in, current).

**Files:** `src/components/StrengthLogger.tsx` — removed `startRestAfterSet` + 4 callers; `showRestTimer` drops the completed gate (~:3218); `restToggleLabel` (Start/Pause/Resume) computed near the gate; footer toggle uses it (~:3827). **Verification:** app build clean; 380px harness — Rest+Start+Skip on every non-last set (`overflowPx -10`, footer below open picker), last sets render no rest row, steppers aligned 44→308.

---

## D-122 — Persistent "last:" per-set anchor in the logger (Q-045, 2026-06-11)

**Context:** "What did I do last time?" is the question every lifter asks at the rack — the single most-used feature in Strong/Hevy. The logger already *had the data*: the D-097 prefill fetch (`StrengthLogger.tsx:1302`) pulls the last 10 strength sessions' per-set actuals from `workouts.strength_exercises` (JSONB) and matches them by normalized exercise name + set index. It used that data only to **prefill** fields (which clear on edit), then discarded it. The investigation confirmed no new query/table/server work was needed — `exercise_log` is aggregate-per-session (best_weight/best_reps/sets_completed), so the per-set JSONB source was already the right one.

**Decision — surface the prior session as a persistent anchor line, reusing the existing fetch:**
- **Data:** hoisted the prior-session map to component state (`previousSessionByName`, keyed by normalized name) so the **one existing fetch feeds both** the prefill and the anchor. No new query.
- **Match key:** same exercise (normalized: lowercase, strip `(Left)/(Right)`, collapse whitespace — `normalizeExerciseName`, hoisted to module scope so prefill + anchor key identically) + **same set index**.
- **Overflow sets → BLANK, not clamped (deliberate divergence from prefill).** The prefill clamps `priorSets[i] ?? priorSets[last]` for entry convenience; the anchor does **not** — `priorSets[setIndex]` only. Showing "last: 100×5" on a set index that had no real prior set is a false anchor, and the entire value of the feature is a number you can trust. A false anchor is worse than none.
- **History-less exercise → no line at all,** not "last: —" repeated on every set (that empty repetition is its own clutter). `formatLastSet` returns `null` for absent/empty prior data and the caller renders nothing.
- **Format:** `last: {weight} × {reps} @ RIR {rir}`. Handles duration sets (`last: 0:45`), bands (`resistance_level` in place of weight, e.g. `last: Heavy × 12`), and missing RIR (drops `@ RIR` cleanly). RIR ≥5 renders `5+` (consistent with D-116).
- **Coexists with prefill (both kept):** different jobs — prefill speeds entry and clears the moment you edit (`from_previous`); the anchor is the stable compare line that never clears regardless of what you type.

**Placement:** one muted full-width line (`text-[10px] text-white/40`) directly under the 3 top input cells, indented past a `w-9` spacer so it aligns under the first cell (the set-number leader column). Deliberately **not** attached to a Reps/Wt/RIR control row (it spans all three fields) and does **not** touch the row geometry balanced in Q-043/D-119.

**Files:** `src/components/StrengthLogger.tsx` — `normalizeExerciseName` hoisted to module scope (~:116); `previousSessionByName` state (~:383); `setPreviousSessionByName` in the D-097 effect (~:1370); `formatLastSet` helper (~:933); anchor render line at the top-cell seam (~:3534). **Verification:** app build clean; 380px harness — anchor line adds height, width still `overflowPx -10`, footer stays below the open RIR picker and inside the card, steppers aligned 44→308. Device-verify reported to user.

---

## D-123 — Reps vs RIR circle rows made visually distinct (2026-06-11)

**Context:** The Reps circle row and the RIR circle row were near-identical twins — both `h-9 w-9 rounded-md` number buttons with the same **white** selected state. A new user relied entirely on the left `Reps`/`RIR` label to tell them apart; it's the one spot in the logger prone to a mis-tap. Only the RIR *target* pill and "suggested" caption carried any amber today.

**Decision — differentiate by shape AND selected-color, no added text, no geometry change:**
- **RIR row → `rounded-full` (true circles)** + **amber selected state** (`bg-amber-500/25 border-amber-400/60 text-amber-100`). This completes the "RIR = amber" identity that was already half-present (target pill + caption).
- **Reps row → unchanged** (`rounded-md` rounded-squares + white selected `bg-white/[0.20] border-white/45`).
- Two always-on cues (shape) plus a selection cue (color), reinforced by the existing caption colors (neutral "target" vs amber "suggested"). Rejected adding a unit-hint/extra text (the brief said "instantly tell which is which, not more text"). Same `h-9 w-9` footprint → zero change to the Q-043/D-119 row geometry; the prefilled-from-previous muted state (D-097) is preserved on both rows.

**Files:** `src/components/StrengthLogger.tsx` (RIR `baseCls` + selected `stateCls`, ~:3644). **Verification:** app build clean; 380px harness `overflowPx -10` (shape change is footprint-neutral), footer math holds; rendered Reps-vs-RIR mockup confirmed the instant distinction.

---

## D-124 — "Deload" tag in the logger header (communication, not logic, 2026-06-11)

**Context:** On a deload week, bench prescribed 100 × 4 @ RIR 4 (target 4-6) while the new D-122 "last:" anchor showed 105 × 6 @ RIR 2 — i.e. the suggestion was *lighter and easier than last time*. Investigation (Q-047) confirmed this is **correct-by-design**: when logging a planned session, set values prefill from the **plan prescription** (`row.computed.steps` → `parseFromComputed`), and the plan generator prescribes lighter loads on a deload week. The "last:" anchor (D-122, last-actual) is intentionally heavier. No logic gap — but the screen never *said* it was a deload, so the lighter number read as confusing (it confused the app's own author).

**Decision — surface the deload context; no logic change.** A subtle amber **"Deload"** pill in the logger header next to the title, so "why is this lighter than last time?" answers itself. Detection mirrors the app's established convention — a case-insensitive name-string parse (`/deload/i` on `scheduledWorkout.name`, which already reads "…Deload…" and is already shown in the header), the same method `WorkoutCalendar`, `UnifiedWorkoutView`, `AllPlansInterface`, and `PlanSelect` use. **No new state/queries/plumbing** — surfaces what the plan already encodes in the name.

**Known limitation (accepted):** there is **no structured `week_type`/`is_deload` flag** plumbed to the logger; detection is name-based, so a deload session whose name omits "Deload" won't show the tag — the same limitation every other client surface has. Plumbing a structured phase flag (the server `WeekPhase` type exists in `athlete-snapshot/body-response.ts` but isn't wired to the client logger) would be a larger task, deliberately not taken here.

**Files:** `src/components/StrengthLogger.tsx` (header, ~:2887 — title wrapped with the conditional pill). **Verification:** app build clean; tag is header-only (does not touch the set-card layout / 380px harness scope).

**Addendum (2026-06-11) — header restructured to two rows.** The Deload pill was butting against the date field. First pass added a gap + truncated the title (one row, `justify-between`), but at 380px the date (~137px) + Pick-planned (~110px) + pill squeezed the title to ~1 char ("L…"). Final fix (per user): **two-row header** — outer `flex flex-col gap-2`; **row 1 = title + Deload pill**, **row 2 = date + Pick planned** (their own row, full room). The title row uses `items-start` and the `h1` **wraps** (no `truncate`) so the full workout name always shows — long names break to two lines rather than clipping. The Deload pill is `shrink-0 mt-1` so it top-aligns next to the title's first line. Verified at 380px: the full "Log: Tri Performance — Hypertrophy Deload (Upper)" wraps to two lines with **no clipping**; the title's right edge stays inside `px-4`; Pick-planned ends ~86px before the edge. Header height now grows with the title (1–2 lines) — fine inside the sheet.

---

## D-125 — Compact "keypad-primary" set logger: one quick-adjust strip replaces the circle rows (Q-048 step 1, 2026-06-11)

**Context:** The expanded set card had grown three full control rows — the Reps circle picker (D-117/D-119), the RIR pill row (D-123), and the 2×2/full-width weight stepper (D-117/D-043) — each ~36px tall plus a caption. A rendered A/B mockup (kept-vs-compact) showed the circles version at **336px** vs a keypad-primary variant at **180px** (46% shorter). The user chose compact.

**Decision — pre-filled keypad cells as the primary input + ONE thin quick-adjust strip:**
- **Top cells stay the primary input** — the Reps/Weight/RIR cells already open the numeric keypad on tap (`openKeypadForSet`), with the Q-042 pencil affordance signalling it. The common case ("hit your number") is now *confirm a pre-filled value, zero number-taps*.
- **Removed:** the Reps circle row, the RIR pill row, and the weight stepper row (incl. the "↑ Same" copy-set-1 button — it wasn't in the approved mockup; prescription-prefill (D-126) makes per-set carry-forward largely moot).
- **Added: one strip** — `reps −1/+1` (left) · `wt −5/−2.5/+2.5/+5` (center) · `rir −1/+1` (right), for nudging off the prescription when reality differed. **No inline labels** — the cell order above (Reps | Weight | RIR) signals which group is which; `justify-between` distributes the spare width as inter-group breathing room. reps clamps ≥1 (D-117), wt rounds to 0.5 (matches the old stepper), rir clamps 0–5 (D-116); rir nudge bases off `set.rir ?? target_rir ?? 0`.
- **Captions relocated:** `target N` now sits under the Reps cell, `suggested N` (amber) under the RIR cell — they used to live under the circle rows.
- Each strip group renders only when its field applies (reps/weight/RIR each gated like the cell above); the whole strip is hidden when none apply (e.g. mobility/duration).

**Sizing:** buttons `h-8 px-1` (height-maximized for a thin strip; width slim to fit 8 buttons). `px-2`→`px-1.5`→`px-1` tuned against the harness: `px-2` overflowed +19px, `px-1.5` fit but groups crammed (2px apart), `px-1` gives an **18px inter-group gap** at 380px (`overflowPx -10`, full p-2 clearance) — real margin, not the mockup's edge-to-edge `overflowPx 0`.

**Files:** `src/components/StrengthLogger.tsx` — captions under Reps cell (~:3414) + RIR cell (~:3569); the quick-adjust strip replacing the three rows (~:3591). `showStepper` (~:3260) is now unused but left in place. **Verification:** app build clean; 380px harness — `overflowPx -10`, inter-group gap 18px; rendered compact card confirmed. **NOTE:** this is the layout half of Q-048; the prefill-source change is D-126 (separate commit).

---

## D-126 — Logger fields prefill from the PLAN PRESCRIPTION, not last-actual (supersedes D-097's prefill; Q-048 step 2, 2026-06-11)

> **RIR-not-prefilled friction resolved by [D-134](#d-134) (2026-06-11):** RIR stays *not pre-committed* (the rationale below holds — it's assessed AFTER the set), but Done now surfaces a one-tap inline confirm-or-adjust instead of requiring manual keypad entry. The confirmed tap *is* the assessment; the suggested value is still never auto-committed.


**Context:** With the compact layout (D-125), the pre-filled cells *are* the primary input, so what they prefill with matters more. Two sources existed: the **plan prescription** (planned sessions → `parseFromComputed(computed.steps)` sets `weight`/`reps`; `target_rir` shows as a ghost) and **last-actual** (the D-097 effect overlaid the most-recent prior session's per-set values onto untouched sets, dimmed via `from_previous`). On a deload week this produced a contradiction the user hit: the box showed last-actual-ish numbers while the new "last:" anchor (D-122) *also* showed last-actual — and the plan was intentionally lighter. Two history surfaces, one of them masquerading as the prescription.

**Decision — plan in the box, history in the anchor.** Removed the last-actual **field prefill** (the `setExercises(... from_previous ...)` block in the D-097 effect). Now:
- **Planned sessions:** fields = plan prescription (`weight`/`reps` from `parseFromComputed`; `rir` stays `null` so the prescribed RIR shows as a ghost AND the honest RIR-on-Done prompt still fires). Unchanged mechanically — the prescription was always there; we just stopped overlaying last-actual on top.
- **Unplanned/fresh sessions:** fields start **empty** (no last-actual prefill). The athlete types via keypad or nudges; the `last:` anchor shows what they did last time. *(Deliberate trade — flagged. This is the one real behavior change: unplanned sessions used to prefill last-actual.)*
- **Last-actual** now appears in exactly one place: the D-122 `last:` line.
- **Kept the fetch:** the same effect still fetches prior sessions and populates `previousSessionByName` — the anchor depends on it. Only the field-writing block was removed.

**Why not prefill RIR from target as a real value:** leaving `rir = null` preserves the post-set RIR prompt (`handleSetComplete` asks when `rir` is unset) — RIR is the one value the athlete should report honestly, not inherit from the prescription. The target still shows as a ghost in the cell.

**Dormant code (left in place):** the `from_previous` flag, its muted-text rendering across the cells, and `updateSet`'s from_previous-clearing branch are now inert (nothing sets `from_previous`). Left rather than ripped out — low-risk, and a foothold if a future "prefill from last-actual" toggle is wanted.

**Files:** `src/components/StrengthLogger.tsx` — D-097 effect: removed the autofill `setExercises` block, kept `setPreviousSessionByName` (~:1396); header comment updated (~:1338). **Verification:** app build clean. Data-source change only — no layout impact (380px harness unaffected; D-125 already verified the layout). **NOTE:** prefill half of Q-048; shipped as a separate commit from D-125 per the working contract.

---

## D-127 — Unplanned-only last-actual fallback (refines D-126; never empty when we have history, 2026-06-11)

**Context:** D-126 removed the last-actual field prefill entirely, which left **unplanned** sessions (no plan) with empty boxes. The user's call: empty is worse than history when we have history. Rule = *"plan in the box whenever a plan exists; otherwise last-actual."*

**Decision — restore the last-actual prefill, but only for untouched (= unplanned/fresh) sets.** Re-added the `setExercises(... from_previous ...)` block that D-126 removed, unchanged. It naturally partitions: planned sets carry plan values (incl. `rir: null` from `parseFromComputed`, which is *not* `undefined`), so they fail the `untouched` test (`weight 0 && !reps && !duration && rir === undefined && !completed && !resistance`) and keep the prescription (D-126 intact). Unplanned/fresh sets are untouched → they get last-actual, dimmed via `from_previous`.
- **Deload contradiction stays fixed:** a deload session is *planned*, so its sets are never untouched → the box shows the (lighter) prescription, never last-actual. D-126's win is preserved; D-127 only changes the no-plan case.
- The `from_previous` dimming path (called dormant in D-126) is **live again** for unplanned sessions.

**Files:** `src/components/StrengthLogger.tsx` — re-added the autofill block after `setPreviousSessionByName` (~:1396); header comment updated (~:1338). **Verification:** app build clean. Logic-only (no layout change).

---

## D-128 — RIR ±1 nudges tinted amber to distinguish from the reps ±1 twins (2026-06-11)

**Context:** The compact strip's two `±1` pairs (reps, left; RIR, right) were visual twins — the same "identical number controls, only position/label disambiguates" problem D-123 fixed for the old circles. The weight group (4 distinct-value buttons) was never ambiguous.

**Decision — tint the RIR `±1` buttons amber** (`border-amber-400/30 bg-amber-500/[0.06] text-amber-300/75`), leave the reps `±1` neutral. Same disambiguation strategy as D-123 (RIR = amber), and it ties to the amber `suggested N` caption + the RIR cell above. Chosen over adding inline `R`/`RIR` markers because **color costs zero width** — the markers would have eaten the 18px inter-group margin (D-125) and risked re-crowding at 380px. Subtle, instant, language-independent.

**Files:** `src/components/StrengthLogger.tsx` — `nudgeClsRir` variant + applied to the RIR group (~:3600). **Verification:** app build clean; 380px harness unchanged (`overflowPx -10`, inter-group gap 18px — color-only); rendered card confirms the amber pair reads instantly distinct.

---

## D-129 — Quick-adjust strip sizes to the device, not the 380px floor (2026-06-11)

**Context:** The strip buttons (D-125/D-128) were tuned `h-8 px-1` to *survive* the 380px harness worst-case — so they shipped cramped there AND stayed cramped on real iPhones (390–430px), wasting the extra room. The ±1 pairs especially felt too small as mid-workout thumb targets. The harness can only tell "fits / doesn't"; it can't feel "cramped" — so the device surfaced this, not the test.

**Decision — let the buttons grow with available width; 380px is the floor, not the target.**
- **`flex-1` (basis-0) buttons** inside **count-weighted groups** (`reps flex-[2]` / `wt flex-[4]` / `rir flex-[2]`) → every button is ~equal width and **expands to fill the real row** on wider phones, while always summing to ≤ the row so it **never overflows at 380px**. Hidden groups (mobility/duration/band/bodyweight) are omitted and the weights redistribute.
- **`h-10` (40px) tap height** (was `h-8`/32px) — the comfort win that's free of the width budget.
- **Dropped the `w-9` leader** the strip didn't need (it only aligned under the set-#); a control bar earns that ~44px, widening every button.
- **`text-xs`** (was `text-[11px]`) — fits "−2.5" at the 380px floor (~32px buttons) and reads comfortably as they grow.

**Measured (real markup, both widths):** 380px floor → 32×40px buttons, `overflowPx -10` (no crossing), "−2.5" not clipped. 414px (typical iPhone) → ~37×40px, comfortably tappable. The harness (`verify-strength-row-380.mjs`) now asserts nudge ≥28px wide / ≥40px tall at the floor, in addition to no-overflow.

**Files:** `src/components/StrengthLogger.tsx` (strip ~:3636, `nudgeCls`/`nudgeClsRir` ~:3626). **Follow-up note:** if the ±1 pairs still want to be *bigger than* the weight buttons specifically, weighting them more (e.g. 3:4:3) trades weight-button width and risks clipping "−2.5" at 380px — not taken; equal-width was the safe call.

---

## D-130 — Strip grouping by spacing contrast, not borders (2026-06-11)

**Context:** After D-129 made the buttons equal-width with a uniform gap (within-group `gap-1.5` ≈ between-group `gap-2`), the strip read as 6–8 undifferentiated buttons — the reps / weight / RIR clusters blurred together.

**Decision — restore the three groups with spacing contrast (no per-button borders — too noisy, and no height cost):** tighten **within-group to `gap-1` (4px)** so each cluster's buttons sit close, and widen **between-group to `gap-4` (16px)** — the same gap the three top Reps/Weight/RIR cells use, so the strip clusters echo the cells above them. A 4× gap ratio (4px vs 16px) makes reps | wt | rir read as three obvious groups at a glance. Kept from D-129: the amber RIR pair (D-128), `h-10` (40px), and `flex-1` responsive width-fill.

**Measured (both widths, no overflow):** 380px → 32×40px buttons, within-gap 4px / between-gap 16px, `overflowPx -10`. 414px → 36×40px, same gap ratio. The redistribution costs ~0 button width (gaps net out).

**Files:** `src/components/StrengthLogger.tsx` (strip container `gap-4`, group divs `gap-1`, ~:3640). **Verification:** app build + 380px harness (no overflow, nudge 32×40); rendered both 380/414.

---

## D-131 — Each top cell column-aligned over its nudge group (weighted 2:4:2 columns, 2026-06-11)

**Context:** The top Reps/Weight/RIR keypad cells (3 equal columns, offset by the `w-9` set-# leader) didn't line up over the strip groups below (weighted 2:4:2, full-width after D-129) — so a column's box didn't visibly "own" the cluster beneath it.

**Decision — give the cells and the strip identical column structure** so center *i* of cell *i* = center *i* of group *i* by construction:
- **Top cells weighted `flex-[2]` (reps) / `flex-[4]` (weight, all variants — barbell/dumbbell/goblet/band/duration) / `flex-[2]` (rir)** — matching the strip groups' `2:4:2`. The **Weight box is now wider** than Reps/RIR (it has 4 controls below it) — reads as intentional (column width ∝ control count), not lopsided.
- **Re-added the `w-9` leader + `gap-2` to the strip** (which D-129 had dropped) so both rows share `[w-9][gap-2][flex-1: 2:4:2 with gap-4]` — same offset, same weights. Hidden columns (bodyweight/mobility) omit from *both* and redistribute identically, so alignment holds.
- Kept D-130 (gap-1 within / gap-4 between), the amber RIR pair (D-128), and `h-10` (40px).

**Trade-off (accepted):** re-adding the leader costs ~6px of button width vs D-129 (nudge ≈26px at the 380px floor, ≈30px on a 414px iPhone — still ≥40px tall, "−2.5" not clipped). Alignment was judged worth it; this is the deliberate counter-weight to D-129's "drop the leader for width." The harness floor assertion relaxed 28→24px to match.

**Verification (both widths):** rendered 380px + 414px and measured `cell_center − group_center = 0` for reps, weight, AND rir at both — exact column alignment. `overflowPx -10`, no clipping. **Files:** `src/components/StrengthLogger.tsx` (cells ~:3325/3401/3452/3468/3497/3525/3559 weighted; strip leader+wrapper ~:3636).

---

## D-132 — Cross-workout draft bleed: identity guard + identity-aware key + gate-on-Done (data-integrity, 2026-06-11)

**Context (live repro, survived a HARD QUIT):** poked +/- on Bench in Monday's **Upper** (never tapped Done) → hard-quit → reopened, selected today (Jun 11), opened **Lower** → Lower's card showed **Upper's** Bench at 105/100, Source "Upper", and would have saved against Upper's `planned_id`. A genuine logged-data corruption vector, not cosmetic.

**Root cause (corrected from the first static read):** the draft key was **date-only** (`strength_logger_session_${performedDate}`), and `performedDate = targetDate = selectedDate` — **the day you're *viewing*, which defaults to today and is deliberately NOT changed when you open a planned workout** (`AppLayout:245-246`; planned `.date` is for linkage/prefill only). So the workout's *planned* date never entered the key. Both the Upper poke and the Lower open happened while viewing Jun 11 → both keyed `strength_logger_session_2026-06-11` → one shared draft slot for *any two workouts opened the same day*. The restore path (`:1500`) then rehydrated that blob with **no check that it belonged to the workout being opened** — only the D-110 orphan check (does the saved plan still exist). And it persisted eagerly: a bare +/- nudge wrote the blob (`updateSet → saveSessionProgress`), so the never-completed Upper poke became a restorable phantom. Survived hard-quit because it's `localStorage`, restored on cold mount.

**Fix — three layers (each committed + independently safe):**
- **Layer 1 — Identity guard on restore.** On mount, compute `openedId` (planned id, or `null` for ad-hoc/completed) and rehydrate **only if `saved.sourcePlannedId === openedId`** (`null === null` allows genuine ad-hoc same-day resume). Mismatch → skip restore, `runFreshInit()`. This alone kills the bleed even with a colliding key (Upper's blob can't load into Lower).
- **Layer 2 — Identity-aware key.** `strength_logger_session_${date}_${plannedId || 'adhoc'}`. WRITE/CLEAR use the live `sourcePlannedId`; RESTORE reads the opened workout's id key, **falling back to the legacy date-only key** for pre-fix drafts — which still pass through the Layer-1 guard, so a legacy blob from another workout fails identity and loads fresh. Two workouts opened the same day now get separate slots (no collision in the first place).
- **Layer 3 — Gate on Done.** `saveSessionProgress` writes a restorable draft **only once ≥1 set is completed**. Bare +/- nudges and prefill edits with zero completed sets write **no** blob — "saved session" now means "I logged real work." **Edge decision (chosen): completing a set then un-completing/deleting back to zero CLEARS the draft** (the gate removes the key when the completed count hits 0). Plus a **one-time legacy cleanup** on mount: removes pre-fix date-only keys whose blob is phantom (no completed set) or >24h — proactively clears the stuck blob. **Safe:** it can only delete zero-completed-set or stale drafts; a genuine recent completed-set draft is left for the fallback+guard; identity-aware keys (trailing `_id`) never match the date-only regex.

**MUST-PRESERVE — confirmed:**
- **D-110 orphan fail-safe:** unchanged; the `(error==null)&&(data==null)` DB verify still runs, now only on the identity-matched path (reopen the same, since-deleted workout → orphan → clear → fresh).
- **24h window:** unchanged (`hoursDiff < 24`; expires the slot the blob came from).
- **Genuine same-workout resume:** identity match → key match → restore, exactly as before.

**Data safety for the already-stuck blob (no path mislogs it):** the only code that sets `sourcePlannedId` from a saved blob (`:1532`) is now behind the Layer-1 guard. Opening Lower with the stuck Upper blob present → guard fails → fresh → `sourcePlannedId = LOWER`. Opening Upper → guard matches → restores correctly (it *is* Upper's). Worst case is always "load fresh," never "log to the wrong `planned_id`."

**Files:** `src/components/StrengthLogger.tsx` — key helpers (`computeSessionKey`/`legacySessionKey`, ~:748), `saveSessionProgress` gate (~:759), `restoreSessionProgress` openedId+fallback (~:794), `clearSessionProgress` (+legacy, ~:822), legacy-cleanup effect (~:830), identity guard at mount-init (~:1499). **Verification:** `scripts/_session-trace.mjs` — 11/11 (bug repro → Lower fresh / never UPPER; gate-on-Done; un-complete clears; same-workout + ad-hoc resume; 24h expiry; cross-workout isolation) + device repro.

---

## D-133 — Suppress iOS autofill/save bubble on logger text inputs (2026-06-11)

**Context:** On device, a white iOS autofill/save bubble overlapped set 2 in the logger (first mistaken for a timer/UI bug). WebKit was treating logger text inputs as contact/credential/phone fields and offering to "save" them.

**Key diagnosis (non-obvious):** the **Reps/Weight/RIR cells are NOT inputs** — they're `<button>`s opening the custom `NumericKeypadSheet` (all buttons; its value display is a `<div>` text node, `:107`), so *number entry has no autofill surface at all*. The actual triggers were the real text inputs: the **exercise-name `<Input>`** (`:3245`, holds the lift name e.g. "Conventional Deadlift" → iOS contact/name autofill, always rendered = primary suspect), the **"Add exercise" search `<Input>`** (`:4054`), and the **rest/duration timer editors** which were `<input type="tel">` (`:3437`, `:3923`) → iOS *phone-number* autofill.

**Fix:** 
- Exercise-name + search inputs → `type="search"`, `autoComplete="off"`, `autoCorrect="off"`, `autoCapitalize="off"`, `spellCheck={false}`, `name="exercise-search"` (search semantics + non-credential name suppress the contact bar).
- Timer editors → `type="tel"` **changed to** `type="text"` + `inputMode="numeric"` (kills the phone-autofill heuristic, keeps a number keyboard; `parseTimerInput` still accepts seconds; pasted `mm:ss` still parses) + the same suppression attrs.
- Notes (`Textarea` `:4038`, session `textarea` `:4129`) → `autoComplete="off"` only (kept autocorrect/spellcheck — free prose benefits from them; the bubble is an autofill, not autocorrect, concern). RPE `<input type="number">` (`:4137`) → `inputMode="numeric"` + `autoComplete="off"`.

**Files:** `src/components/StrengthLogger.tsx`. **Verification:** build; device check (type in a search/name + open a timer editor → no save/autofill bubble). The keypad (weight/RIR) was never a trigger — no input to autofill.

---

## D-134 — RIR confirm-on-Done: one-tap confirm-or-adjust (resolves D-126's manual-entry friction, 2026-06-11)

**Context:** Reps + Weight prefill from the plan, but RIR is intentionally **not** pre-committed (D-126: RIR is assessed *after* the set, and the e1RM pipeline must not ingest an unassessed/auto-defaulted RIR). The friction: that meant manually entering RIR via the numeric keypad on every Done, even when the suggested value was right.

**Decision (option 1 — confirm-or-adjust, matches RP/Boostcamp autoregulation apps):** tapping **Done** on a set with no RIR yet surfaces a **quick inline RIR confirm** on that set's card instead of the keypad:
- A small amber **"Confirm RIR"** row with the `0,1,2,3,4,5+` pills; the **suggested value (`target_rir`) is pre-highlighted with a ring** ("tap to confirm"). One tap confirms; a different tap adjusts — **both complete the set** (`confirmRirAndComplete` → `updateSet({ rir, completed: true })`). A subtle **"skip"** completes without RIR (`skipRirAndComplete`).
- **Not a blocking modal** — inline on the card, at the moment of Done. A **second Done tap cancels** the open confirm (back out of an accidental Done).
- **If RIR was already set** (via the keypad cell or the strip ±1 before Done) → no prompt, just logs (unchanged).
- **Data integrity preserved:** the suggested value is **never auto-committed** — it requires the tap, which IS the post-set assessment. This is the whole reason RIR isn't prefilled (D-126); confirm-on-Done keeps that property while removing the keypad friction. Replaced the old `openKeypadForSet({field:'rir', secondaryLabel:'Skip RIR'})` path.

**Files:** `src/components/StrengthLogger.tsx` — `rirConfirm` state (~:409), `handleSetComplete` (sets `rirConfirm` instead of opening the keypad; second-Done-cancels), `confirmRirAndComplete`/`skipRirAndComplete` (~:2600), inline confirm row before the footer (~:3880). **Verification:** build; 380px render — pills `w-9` (36px) with 15px gaps (22px @414px), no overflow (label + skip moved to a top line so the 6 pills get the full width). Device-test reported.

---

## D-135 — Safari "Save" autofill bubble on the rest-timer input: readOnly-on-focus + PW-manager ignores (2026-06-11)

**Context:** Device-pinpointed (screenshot: the "2:30" rest-timer field amber-ringed/focused with the iOS "Save" bubble directly below). D-133 changed it off `type="tel"` (phone autofill) and added `autocomplete="off"`, but the bubble persisted — the classic "**Safari ignores `autocomplete="off"`**" case, and the "Save" wording suggests the iOS credential-save prompt **or** a password manager (1Password/LastPass save bubbles look identical).

**Decision — stop the whack-a-mole with the two reliable, attribute-only suppressions (held the nuclear "make it a non-input" option in reserve):**
- **`readOnly`-until-focus** (the reliable iOS/Safari fix): the timer editor `<input>` renders `readOnly`, so it is read-only *at the moment focus lands* → iOS/Safari won't offer AutoFill/Save for it. `onFocus` drops `readOnly` so typing still works; a `useEffect([editingTimerKey])` resets it to `true` each time an editor (re)opens. The editor is tap-to-focus (not autofocused), so UX is unchanged. State `timerEditReadOnly` is shared (only one editor open at a time).
- **Password-manager ignores:** `data-1p-ignore`, `data-lpignore="true"`, `data-form-type="other"` — suppress 1Password / LastPass / Dashlane save bubbles.
- **Neutral name:** `name="rest-seconds"` / `name="duration-seconds"` (nothing Safari pattern-matches as a credential/contact). No `<form>` wrapper exists, so it's not a form-submit save.

**Files:** `src/components/StrengthLogger.tsx` — `timerEditReadOnly` state + reset effect (~:398); both timer editor inputs (rest ~:4002, duration ~:3465). **Verification:** build; device test (tap the "2:30" field, type → no Save bubble). **Reserve (if attributes still fail):** convert the timer editor to a non-input — a tappable `<div>` opening a keypad sheet like the Reps/Weight/RIR cells (which never autofill because they're buttons, not inputs) — eliminating the autofill surface entirely. Not done unless this round fails on device.

---

## D-136 — Rest-timer footer overlaps in running/paused state; fix with shrink-0 group + label drop (2026-06-11)

**Context (device):** the footer's rest controls share one flex row with the Done/✕ cluster (D-121). In the IDLE state ("Rest · 2:30 · Start · Skip" + Done/✕) it fits, but in RUNNING/PAUSED the toggle label widens ("Pause"/"**Resume**" vs "Start", ~+18px) and the row exceeds ~308px at 380. The buttons had default `flex-shrink:1`, so they shrank below their text and the labels **bled into each other** ("Resume" over "Skip").

**Decision — no overlap in any state, by structure not by luck:**
- **`shrink-0` on every footer button** (time / toggle / Skip / Done / ✕) + `whitespace-nowrap` — a button can never shrink below its label, so text can't spill.
- **Grouped the rest controls into a `shrink-0` unit** and the Done/✕ into a `shrink-0` unit; the row is **`flex-wrap`** — if the two units genuinely can't fit, Done/✕ wraps to a second line (right-aligned via `ml-auto`) instead of overlapping. Safety net.
- **Drop the "Rest" text label once the timer is active** (`restToggleLabel !== 'Start'`) — the countdown is self-evident, and this reclaims ~36px, keeping even the "Resume" state on ONE line (no wrap needed in practice).

**Files:** `src/components/StrengthLogger.tsx` — footer row `flex-wrap` + rest-control group + Done/✕ group `shrink-0` (~:3949), conditional "Rest" label, `shrink-0 whitespace-nowrap` on time/toggle/Skip. **Verification:** rendered all 3 states (idle/running/paused) × 380px + 414px — no adjacent-button overlap, no control past the card edge, no wrap triggered. Device-test reported.

---

## D-137 — Skip button only in running/paused, not idle (our timer is opt-in, 2026-06-11)

**Context:** Hevy/Strong *auto-start* rest timers, so they need Skip to dismiss a timer the user never asked for. Ours is **opt-in** (D-121 — tap Start), so in the IDLE state there's nothing running to skip; Skip was pointless clutter.

**Decision:** gate Skip on `restToggleLabel !== 'Start'` — it appears only once the timer is **running** (Pause) or **paused** (Resume), where it does its real job (dismiss/clear an active timer = "done resting early"). Idle shows just `Rest · 2:30 · Start`.

**Contrast with Hevy/Strong (inverted model):** they surface Skip *always* because their timers auto-fire — Skip is the escape hatch from a timer that started without the user. Ours only starts on an explicit tap, so the escape hatch only needs to exist once the user has opted in. Same control, inverted trigger, because the underlying interaction model is inverted.

**Files:** `src/components/StrengthLogger.tsx` (~:4014, Skip wrapped in `restToggleLabel !== 'Start'`). **Verification:** rendered all 3 states × 380/414px — idle has 4 controls (no Skip), running/paused have 5; no overlap, no overflow, no wrap. **Side effect:** partially relieves D-136 (rest-row crowding) by dropping idle from 5 controls to 4 — noted so the D-136 layout isn't re-solved from scratch.

**Post-Skip transition — verified by code trace (the one edge not in the state table):** after running → Skip → dismiss, the *next* set's rest row returns to a clean idle. Confirmed structurally: every set reads its own per-set key `${exercise.id}-${setIndex}` for BOTH `timers` and `restDismissed` (`:3345/:3357`), so Skipping set N (adds `${id}-${N}` to `restDismissed`, writes `timers[${id}-${N}]`) cannot affect set N+1 — its `timers[${id}-${N+1}]` is `undefined` → `restToggleLabel` falls through to `'Start'` (`:3363`) → idle, no Skip. No shared cross-set state. **Caveats:** (a) the skipped set stays dismissed for the session (`restDismissed` is add-only; no re-arm since D-121 removed auto-start) and resets on a fresh logger mount (component state) — no cross-session leak; (b) the dismissed flag is keyed by `setIndex`, not set identity, so deleting/reordering sets after a Skip could re-attribute it (index-keying footgun, same family as the D-122 anchor) — out of the normal sequential path but recorded.

---

## D-138 — Unconfirmed RIR reads as "suggested" (amber), not a greyed placeholder (2026-06-11)

**Context:** the pre-confirm RIR value rendered `text-white/30` — so the prescribed suggestion looked broken/inactive. It's dim on purpose (D-126/D-134: RIR is not pre-committed; you confirm it on Done), but too-faint read as a placeholder.

**Decision:** style the unconfirmed suggested RIR as **amber + `font-medium`** (`text-amber-300/80`) — the app's RIR=amber language (matching the "suggested N" caption and the RIR pills), so it reads as an intentional *suggested* value. **Deliberately NOT** full-white-like-Reps/Weight: white is the "your logged value" weight; making an unconfirmed suggestion white would make it look committed and undercut the confirm-on-Done signal. So the three states stay distinct: **amber = suggested (not yet logged)**, **white = confirmed/logged RIR**, **Reps/Weight white = prefilled/logged**. The `—` (no prescription) stays dim grey.

**Why not the requested "bold like Reps/Weight":** Reps/Weight aren't 700-bold — they're full-opacity white; matching them literally = white, which flattens the suggested-vs-committed distinction this app relies on (D-126/D-134). Amber keeps the "prescribed but not yet assessed" meaning while giving it the active weight the greyed version lacked. (One-word swap to plain white if that's preferred.)

**Files:** `src/components/StrengthLogger.tsx` (~:3702, RIR ghost span). **Verification:** build; visual — amber suggested value vs white confirmed value vs dim `—`.

---

## D-139 — Auto-start rest on Done, top-pill-only timer, haptics (supersedes D-121's opt-in, 2026-06-11)

**Context:** the rest-timer saga came full circle — D-120 auto-started it (on the just-finished set's card) → D-121 reverted to **opt-in** (tap Start) because auto-firing-in-the-card felt wrong → here it returns to **auto-start**, but cleanly: surfaced only in a **pinned top pill**, not per-set in-row controls. This is the Hevy/Strong model the user had been circling, now with the clutter removed.

**Decision:**
- **Auto-start rest on Done** (`autoStartRestForSet`): completing a **non-last, non-duration** set starts its rest timer (`running`, keyed `${exerciseId}-${setIndex}`), re-arming a previously-Skipped set. Wired at all four completion points (mobility, RIR-already-set, confirm-RIR, skip-RIR). Reverses D-121.
- **Top pill is the SOLE timer** (the D-100 active-rest pill): shows `REST m:ss · Skip` while a rest runs; **Skip ends the rest** (clears the timer + marks the key dismissed — D-139 part 1, was a pause-only `✕`).
- **Removed the entire in-row rest block** — no Start, no in-row countdown/Pause/Resume/Skip, no editor popover. The set footer is now just **Done + delete-✕** (delete-✕ kept: it's `deleteSet`, a load-bearing function, not a timer control). The set-card margin (was `showRestTimer`-gated) is now fixed; the `showRestTimer`/`restToggleLabel`/etc. consts are left dead-but-harmless.
- **Haptics** (`@capacitor/haptics@8`, guarded/no-op on web): **light impact** on auto-start (confirms Done registered + rest running), **success notification** at rest `0:00` (added to the existing tone/vibrate zero-handler → "start the next set"). An optional silence toggle is a noted follow-up, not built.

**Rest saga (for future-me):** D-120 (auto-start, in-card) → D-121 (opt-in, in-row Start) → **D-139 (auto-start, top-pill-only + haptics)**. If reverting again, this is the chain.

**Files:** `src/components/StrengthLogger.tsx` — `autoStartRestForSet` + `hapticLight`/`hapticSuccess` (~:2540), wired at completion points (~:2594/2600/2615/2621), top-pill Skip (~:2967), zero-handler success haptic (~:2153), in-row block removed (footer now Done+✕). `package.json` (+@capacitor/haptics). **Verification:** build clean; `cap sync` registered the native plugin. Device-test reported (Xcode rebuild needed for native haptics).

---

## D-140 — Readiness check-ins get their own daily-keyed table (source of truth); avg_readiness becomes a derived rollup

- **Date:** 2026-06-12
- **Context:** SPEC-ATHLETE-STATE-CONTINUITY (Q-049) Phase 1. The Quick check-in (energy/soreness/sleep) was trapped per-workout in `workout_metadata.readiness` JSONB; the only time-series was the WEEKLY `athlete_snapshot.avg_readiness` (averaged over `workout_facts`). No per-day resolution, and the check-in was bound to a workout save.
- **Decision (Q1=C, chosen by the human):** Create a dedicated `readiness_checkins` table — `(user_id, date, energy, soreness, sleep, source)`, `UNIQUE(user_id, date)` — as the **source of truth**, decoupled from workout saves. `athlete_snapshot.avg_readiness` is **retained** and becomes a **derived weekly rollup** over this table (D-141), NOT removed. Step 1 of 4 (table → rollup → dual-write → backfill); the Arc wire (Phase 1 culmination) is deliberately NOT in this arc — it's blocked on the still-open Q2 (Arc payload shape) and Q3 (unfilled-check-in handling).
- **Alternatives considered (the Q1 options doc):**
  - **A — finish the wire on the existing weekly `avg_readiness`.** Cheapest (no schema), but weekly-only granularity forecloses day-by-day trends ("soreness climbing all week") permanently. Rejected as the ceiling.
  - **B — per-workout `workout_facts.readiness` queried by date.** No new table, but per-workout ≠ per-day: rest days / unlogged sessions are gaps, and the check-in stays welded to a workout save. Rejected.
  - **C (chosen) — new daily table.** True daily series; decouples the check-in from a workout (enables a future morning check-in with no session). Cost: schema + migration + new write path + backfill.
- **Why this one:** Q1 gates Q2/Q3 — only a per-day series unlocks daily trends, and the human picked the resolution explicitly. The weekly aggregate stays as a cheap derived view so the two existing consumers (taperSensitivity, injury flags) are untouched.
- **Schema choices:** raw sliders only (the table is lossless; any derived "readiness score" — Q2, still open — is computed at read time in arc-context, never stored). `source` is **free text, no CHECK** (it will gain a value when the non-workout daily entry point lands; a CHECK would force a migration). RLS grants authenticated users read+insert+update on their OWN rows because the check-in is written directly from the client (D-142), plus full service-role access for the rollup/backfill.
- **Tradeoff accepted:** a second readiness store now coexists with the per-workout JSONB (kept on purpose — see D-142). The table is daily-keyed, so the backfill must dedupe multiple same-day workouts (D-143). Migration applied via the Supabase SQL editor, not `supabase db push` (repo convention, docs/MAINTENANCE-DEBT.md).
- **Files:** `supabase/migrations/20260612120000_create_readiness_checkins.sql`.

---

## D-141 — avg_readiness rollup reads readiness_checkins, with a facts-based fallback

- **Date:** 2026-06-12
- **Context:** SPEC-ATHLETE-STATE-CONTINUITY (Q-049) Phase 1 step 2 of 4. With the source-of-truth table created (D-140), `compute-snapshot` must derive `athlete_snapshot.avg_readiness` from it — the user's directive: "avg_readiness becomes a rollup over the new table — do NOT rip it out."
- **Decision:** Added a guarded override in the compute-snapshot handler (section 8b), computed over the target week `[targetWeek, rangeEnd]`: select `readiness_checkins` for the user/week, average energy/soreness/sleep, and write that to `avg_readiness`. The pure `aggregateWeek` aggregator (and its facts-based `current.avgReadiness`) is **left untouched**; the override only swaps the final value at the payload.
- **Fallback (load-bearing):** the override is `try`-wrapped and only replaces the value when the query succeeds AND returns ≥1 row with ≥1 numeric slider. On a missing table (pre-migration), a query error, or an empty week, it keeps `current.avgReadiness`. This is the cycling-columns guarded-update pattern (D-… migration note) — the function **deploys safely before the migration/backfill land**, and any week with no daily check-in keeps its prior facts-based value rather than going null.
- **Why this shape:** keeping `aggregateWeek` pure means its 18-test suite stays green by construction (verified: 18/18 pass; the only `deno check` error is the pre-existing line-311 `FactRow[]` cast, present at HEAD before this change). The output shape `{energy,soreness,sleep}` is unchanged, so the two `avg_readiness` consumers in `recompute-athlete-memory` keep working unchanged: **taperSensitivity** reads `avg_readiness.energy` (same key/shape), and **injury flags** read per-workout `workout_facts.readiness` — never this field.
- **Alternatives considered:** (a) rewrite `aggregateWeek` to take readiness rows — rejected: pollutes a pure, well-tested aggregator and couples it to a DB fetch. (b) Null `avg_readiness` when the table is empty — rejected: would regress historical weeks to null before backfill and break the taperSensitivity series; fallback-to-facts preserves continuity.
- **Tradeoff accepted:** during the window between deploy and backfill, `avg_readiness` is still facts-derived (identical to today). After backfill it's table-derived; the two are equivalent for workout-day check-ins and the table additionally captures any future non-workout daily check-ins.
- **Files:** `supabase/functions/compute-snapshot/index.ts` (section 8b + payload field). Deployed `yyriamwvtvzlkumqrvpm`.

---

## D-142 — Check-in dual-writes the daily table AND keeps the workout_metadata JSONB

- **Date:** 2026-06-12
- **Context:** SPEC-ATHLETE-STATE-CONTINUITY (Q-049) Phase 1 step 3 of 4. With the table (D-140) + rollup (D-141) in place, the live check-in must start populating `readiness_checkins`. The migration plan left "in addition to / instead of" the JSONB path open.
- **Decision:** **Dual-write, not replace.** `finalizeSave` in `StrengthLogger.tsx` keeps embedding the check-in in `workout_metadata.readiness` (the existing path) **and** additionally upserts a `readiness_checkins` row keyed `(user_id, date)` with `source: 'workout_logger'`, immediately after the workout save succeeds. Direct client upsert (RLS `auth.uid() = user_id`), `onConflict: 'user_id,date'`.
- **Why dual-write was forced (not a free choice):** the guardrail requires injury-flag extraction to keep working **unchanged**, and `recompute-athlete-memory` extracts injury flags from the per-workout `workout_metadata.readiness` blob (and `compute-facts` echoes the same blob into `workout_facts`). Dropping the JSONB write would break those consumers. So the JSONB stays; the table is added alongside.
- **Fail-soft (load-bearing):** the upsert is `try/caught` and only runs when `readinessData` exists and a stored user id is present. A missing table (pre-migration), RLS hiccup, or offline state logs a non-fatal warning and the workout save proceeds untouched. This is why the client can ship **before** the migration is applied — the dual-write simply no-ops until the table exists.
- **Sub-decision flagged (not a reserved Q1–Q3 call):** `source = 'workout_logger'` for live check-ins (vs `'backfill'` for migrated rows, D-143). Free-text column, so the future non-workout daily entry point can add its own value with no migration.
- **Tradeoff accepted:** two readiness stores momentarily diverge if one write succeeds and the other fails — acceptable because the table is the go-forward source of truth and the JSONB is only still read by the injury/facts path; reconciliation isn't needed for Phase 1 (no prescription effect).
- **Files:** `src/components/StrengthLogger.tsx` (`finalizeSave`, after the workout save). Client build clean.

---

## D-143 — Backfill workout_metadata.readiness → readiness_checkins, latest-per-day

- **Date:** 2026-06-12
- **Context:** SPEC-ATHLETE-STATE-CONTINUITY (Q-049) Phase 1 step 4 of 4. The new table starts empty; historical check-ins live in `workouts.workout_metadata.readiness`. Without a backfill the rollup (D-141) only sees check-ins logged after the table came online.
- **Decision:** A one-shot SQL migration `INSERT … SELECT` from `workouts` into `readiness_checkins`, `source = 'backfill'`, `ON CONFLICT (user_id, date) DO NOTHING`.
- **Dedup sub-decision (the one real judgment call — flagged, not a reserved Q1–Q3 call):** the table is `UNIQUE(user_id, date)` but an athlete can log multiple workouts in one day, each with a check-in. The backfill keeps the **latest** workout's check-in per day (`DISTINCT ON (user_id, date) … ORDER BY created_at DESC`). Rationale: readiness is a daily ritual, not per-session; the most recent save best reflects the day's final state. (If the human prefers earliest, or an average, this is the line to change — noted in the handoff.)
- **Ordering (load-bearing):** apply **last** — after the table migration, the compute-snapshot deploy, and the client push. `ON CONFLICT DO NOTHING` makes live `'workout_logger'` rows win over backfilled ones (live data is authoritative; the backfill only fills gaps) and makes re-runs idempotent.
- **Guard:** only rows whose three sliders are all present and numeric are migrated (regex on each `->>`); a readiness blob carrying only `threshold_hr` (no sliders) is skipped. Assumes `workouts.created_at` exists (standard) for the tie-break.
- **Tradeoff accepted:** days with multiple distinct check-ins collapse to one (by design — daily key). Backfilled rows are tagged `source='backfill'` so they're distinguishable from live check-ins for any future audit.
- **Files:** `supabase/migrations/20260612130000_backfill_readiness_checkins.sql` (apply via Supabase SQL editor).

---

## D-144 — Arc reads readiness raw + distinct from readiness_checkins; absent = no-data (Q-049 Phase 1 step 5)

- **Date:** 2026-06-12
- **Context:** SPEC-ATHLETE-STATE-CONTINUITY (Q-049) Phase 1 culmination. With the table (D-140), rollup (D-141), dual-write (D-142), and backfill (D-143) in place, the last wire is `arc-context.ts` reading readiness — which it never did (confirmed: zero readiness refs pre-change). The human answered the two gating questions: **Q2 — raw, distinct** (energy/soreness/sleep kept separate, never collapsed into a single score; a derived score may sit on top later as optional convenience, but the raw three are the source of truth and stay individually readable); **Q3 — unfilled = no-data/absent**, not a neutral default (matches the engine's anti-fabrication norm). Sleep stays (only sleep signal in the app).
- **Decision:** `getArcContext` now fetches `readiness_checkins` for the trailing window and exposes `ArcContext.readiness: { latest, recent, window_days } | null`:
  - **Raw + distinct (Q2):** `ArcReadinessCheckin = { date, energy, soreness, sleep }` — the three sliders verbatim, never a composite. No derived score is written here (deferred as the explicitly-optional convenience; the mandated raw three are delivered).
  - **No-data on absent (Q3):** `recent` omits days with no check-in (never fabricates a neutral); `latest = recent[0] ?? null` (null when there's no recent check-in). The field is `null` only on a query failure (e.g. table not yet migrated) — fail-soft, so it never starves the rest of Arc.
  - **`latest` carries its `date`** so a consumer can judge staleness rather than assume "today."
- **Window = 14 days (`READINESS_WINDOW_DAYS`):** enough to surface current state + a within-week trend ("soreness climbing all week") without dragging stale weeks into `latest`. A chosen knob, documented; not a reserved decision.
- **Phase-1 guardrail (load-bearing):** this is **visible-only**. `readiness` is populated into the Arc context object but **nothing consumes it for prescription** — adapt-plan / suggested-RIR / load are untouched. Surfacing it in the coach prompt and the STATE screen is the deliberate **next increment**, not part of this step (it needs copy/UI decisions, so it wasn't guessed here).
- **Why read the table directly, not `avg_readiness`:** the directive — raw, distinct, daily, no-data-on-absent — is exactly what the weekly aggregate can't give (it's averaged + weekly). The daily table is the source of truth (D-140); Arc reads it directly.
- **Safety:** additive interface field; the only `ArcContext` literal in the tree is a test stub via `as ArcContext` (cast tolerates the new field — 13/13 pass). `deno check` on `arc-context.ts` + `get-arc-context` clean.
- **Files:** `supabase/functions/_shared/arc-context.ts` (const + `ArcReadiness`/`ArcReadinessCheckin` types + interface field + parallel fetch + computation + return + fresh-setup reset). **Deploy:** arc-context is a shared lib — its consumers (`get-arc-context`, `coach`, `workout-detail`, the analyzers, `generate-training-context`, `arc-setup-chat`, …) must be redeployed to serve the field; pending the human's go-ahead on the deploy set (no user-visible effect until a consumer surfaces it, so not auto-deployed).

---

## D-145 — Surface readiness in the coach prompt + STATE screen (Q-049 Phase 1, visible-everywhere)

- **Date:** 2026-06-12
- **Context:** D-144 populated `ArcContext.readiness` but nothing rendered it. This step makes it actually **visible** — the Phase-1 goal — in the two surfaces where a new Arc field is shown: the LLM coach prompt and the client STATE tab. Built on the human's "build it now, my judgment" call; presentation choices below are mine (review-and-adjust), not reserved decisions.
- **Coach prompt (`supabase/functions/coach/index.ts`):** coach already loads the full `ArcContext` (`arc` at `:1150`), so `arc.readiness` is read directly — no extra fetch. A `narrativeFacts` line is pushed next to the longitudinal-signals block: latest check-in (date → "today" when it's the focus day) + raw energy/soreness/sleep, plus oldest→newest sequences per signal when ≥3 check-ins exist (so the model can SEE a trend like "soreness climbing" without me labeling it). The line is explicitly tagged *"athlete-reported, raw — do not invent or rescale"* and *"do NOT change prescribed loads or RIR from this"* — reinforcing Phase-1 visible-only at the prompt level.
- **STATE screen (`src/components/context/StateTab.tsx`):** a new `READINESS` row between BODY and AERO, rendered ONLY when `latest` exists (Q3 no-data → absent rows show nothing, never a neutral placeholder). Shows raw energy/soreness/sleep + a staleness label ("today"/"yesterday"/"Nd ago" from `latest.date`) + a neutral trend arrow per signal (newest vs oldest in window) when ≥3 check-ins. **Deliberately no good/bad tone coloring** — Phase 1 encodes no judgement (unlike the cycling-form `readiness_state` row, which is a different concept; the check-in state is named `checkinReadiness` to avoid the existing `readiness` local collision that the build caught).
- **Client plumbing:** `ClientArcContext` + `ArcContextPayload` gain `readiness?: ArcReadiness | null` (mirrors of the server types); `get-arc-context` already returns the whole `{ arc }`, so no endpoint change.
- **Scope held:** strictly visible-only. Nothing here consumes readiness for prescription; adapt-plan / suggested_rir / auto-attach-planned untouched. The derived "readiness score" (Q2 optional) is still not built — raw three are surfaced as mandated.
- **Verification:** client `npm run build` clean (after the `checkinReadiness` rename fixed a symbol collision). `coach/index.ts` deno-check error count unchanged (9 at HEAD, 9 after — all pre-existing; my block adds none). Coach deploys without type-gating per repo convention.
- **Files:** `supabase/functions/coach/index.ts`, `src/lib/arc-types.ts`, `src/lib/fetch-arc-context.ts`, `src/components/context/StateTab.tsx`. **Deploy:** `coach` + `get-arc-context` (the two surfaces); other arc-context consumers don't render readiness, so they only need redeploy for lib-sync (no behavior change).

---

## D-146 — Spike-on-empty-base guard: a big single session on a thin base no longer reads "high load → back off"

- **Date:** 2026-06-12
- **Bug:** The STATE screen told an athlete who barely trained (one big Tuesday ride, ~5× planned, otherwise near-empty month) to "back off and recover" / "pull back". Discipline-agnostic ACWR (`coach/index.ts:2491`, `(acute7Load/7)/(chronic28Load/28)`, summed across all disciplines) reads one spike on an empty 28-day base as ACWR ≈ 4.0 — **undertraining maximises the signal instead of dampening it.** The gauge can't tell "one spike on a dead week" from "sustained ramping."
- **Two surfaces, corrected from the first audit:** the visible *words* ("back off and recover" title = `intent_summary` `:4663`; "pull back" bar text = `loadStatusLabel` `LoadBar.tsx:114-117`) are both driven by `load_status.status === 'high'` — **Surface 2**, set by `reconcileLoadStatus` (`:647`). ACWR only colours the gauge **dot** (Surface 1); `acwrLabel`'s "back off"/"rest now" are never rendered as text. So the fix had to cover **both**.
- **Why existing guards missed it:** `reconcileLoadStatus` escalates to 'high' from spike paths — cross-training total ACWR > 1.5 (`:750`), unplanned load > 50% of plan (`:763`), actual > 50% over plan (`:768`). Its only de-escalation (`:783`) requires `runBodyOk` = **≥2 stable/improving run sessions** (`:684`); an undertrained athlete who barely ran fails that gate, so the emptiness that should read "build more" *blocks* the rescue. And the `isAcwrDetrainedSignal` softening (`:799`) keys on *low* ACWR (<0.7) and only 'elevated' — it can't fire when a spike makes ACWR *high*.
- **Fix (one server-side change, `coach/index.ts`):**
  - **Detector at `:2491`** from data already in scope (`acute7Rows`, `acute7Load`, `chronic28Load`): `thinChronicBase = chronic28Load < CHRONIC_LOAD_FLOOR`; `oneSessionDominatesAcute = top acute session > 60% of acute load`; `isSpikeOnEmptyBase = thinChronicBase && (acuteSessionCount < 2 || oneSessionDominatesAcute)`.
  - **Surface 1 — null the ACWR on a thin base:** `acwr = thinChronicBase ? null : rawAcwr`. That one value feeds the gauge dot (`:4771`), `okTitle`/`okKicker` (`:2529`), `buildVerdict` (`:882` → returns `insufficient_data`/"Log a few sessions first", not `recover_overreaching`), and the cross-training-ACWR escalation (`:3239`, skipped on null) — **four ACWR "high load" surfaces neutralised by one null.** Principled: ACWR is unreliable without ~4 weeks of chronic data.
  - **Surface 2 — downgrade in `reconcileLoadStatus` (`:807`+):** when `spikeOnEmptyBase` and status is 'high'/'elevated' and it's **not** genuine overreaching (`nDeclining < 2`, readiness not `overreached`/`fatigued`) and not a planned easy week → `status = 'under'` → bar reads "build more". Covers the non-ACWR escalation paths (unplanned load, actual-vs-plan) defensively.
- **Thresholds (signed off):** `CHRONIC_LOAD_FLOOR = 500` (28-day workload sum), `SINGLE_SESSION_DOMINANCE = 0.60`, acute session floor `< 2`. Defensive, not tuned to the one ride.
- **Normal-week check (why the floor doesn't misfire):** workload = hours × intensity² × 100. A normal ~6-session week ≈ 300–420 pts/wk → **≈1300–1700 over 28d**, clearing the 500 floor by ≈2.7×; a light-but-consistent 4-session week ≈800 also clears. Only a genuinely thin base (≈< 125 pts/wk averaged) trips the gate — and `thinChronicBase` is a **necessary** condition, so any week clearing 500 is fully exempt regardless of how lumpy it is. (Deliberate tightening of "any one of the three" → "thin base AND spike", precisely to guarantee normal/lighter weeks never misfire.)
- **Regression — real overreaching still fires "high load → back off" (do not over-suppress):** a genuine ramp (multiple sessions on a real chronic base) clears the 500 floor → `thinChronicBase = false` → `isSpikeOnEmptyBase = false` and ACWR is computed normally, so `okKicker`/`buildVerdict`/`load_status` still escalate. And even on a thin base, the Surface-2 downgrade is gated off when `nDeclining ≥ 2` or readiness is `overreached`/`fatigued` — body-signal-driven overreaching is preserved. The guard only suppresses **spike-driven** 'high' on an **empty** base with **no** body-decline signal.
- **Scope:** server-only; `LoadBar.tsx` untouched (the label stays a dumb passthrough — fix the source). Does **not** touch adapt-plan / suggested_rir / auto-attach-planned / the D-139 rest path. **Deploy:** `coach` (held for numeric sign-off). Verified: `deno check` error count unchanged (9 pre-existing, 0 added).

---

## D-147 — Unplanned-load escalation gated on ACWR ≥ 1.0 + "off plan" wording (sibling of D-146)

- **Date:** 2026-06-12
- **Bug (case b, found by tracing real data after D-146 didn't flip the screen):** the STATE "Load is high — back off and recover" / "pull back" persisted on a week where the athlete had a **healthy** 28-day base (chronic 1544 ≫ 500 floor, so D-146 correctly stayed silent) but trained **light and off-plan** — skipped all planned runs and did one unplanned ride. The live trace (`scripts/d146-load-trace.mjs`, read-only) showed the cached `load_status.interpretation` named the trigger verbatim: *"Running load 100% below plan … unplanned load is 89% of planned week"* — i.e. `reconcileLoadStatus:763` (`unplannedPct > 50 → raise('high')`). **ACWR was 0.49** (acute 191 ≈ half a normal week): the athlete was *under* baseline, not overloaded. The unplanned-load path read a *ratio* ("89% of a small planned week") as overload.
- **Fix 1 — gate unplanned-load escalation on absolute load (`reconcileLoadStatus:758-771`):** `loadActuallyElevated = unweightedAcwr != null && unweightedAcwr >= 1.0` (ACWR ≥ 1.0 ≡ acute ≥ chronic-average). The unplanned-load-magnitude raises (both `'high'` and `'elevated'`, planned-week and no-plan branches) now fire **only** when `loadActuallyElevated`. Below baseline, an unplanned session is a *swap*, not overload → `load_status` reflects the real (low) value.
- **Fix 2 — "off plan" wording (`intent_summary`, before the race-aware overrides):** when `load_status` is low (`under`/`on_target`), running is ≥50% under plan (`run_only_week_load_pct ≤ -50`), and the intent isn't one that's *meant* to be light (`recovery`/`taper`/`deload`/`peak`) → return *"Off plan this week — planned sessions skipped. Get back on schedule before adding extra."* **Placed before the race overrides on purpose:** "final build, every session counts" is worse than useless when the sessions were skipped, so adherence takes precedence over race-phase encouragement on a genuine skip.
- **Case (c) preserved (verified in code):** genuine overload still fires "high → back off" — `loadActuallyElevated` true (ACWR ≥ 1.0) keeps the unplanned escalation, and the body-decline (`:709`) and overreached/fatigued-readiness (`:731`) paths are **independent** of this gate, so real overreaching at *any* ACWR is untouched. The off-plan wording only fires for low/normal `load_status` (high/elevated handled above).
- **Threshold:** `ACWR ≥ 1.0`. Signed off. The athlete's 0.49 has large margin; off-plan shortfall bar is `≤ -50%` (did ≤ half the planned running).
- **Trace confirmation (real account, this week):** `loadActuallyElevated = false` (ACWR 0.49) → unplanned escalation gated off → `load_status` flips `high → under` (bar "build more") → off-plan wording fires ("…Get back on schedule…"). Was "Load is high — back off and recover."
- **Cache:** bumped `COACH_PAYLOAD_VERSION 35 → 36` — D-146/D-147 change `load_status`/`intent_summary` *values*, and a coach **deploy does not invalidate `coach_cache`**; without the bump the fresh cached "high load" row would serve stale (≤24h / until next ingest). This is why D-146 alone "didn't visibly take." (`COACH_CLIENT_MIN_PAYLOAD_VERSION` left as-is — no client-required field added.)
- **Composition with D-146:** disjoint cases — D-146 = spike on *thin* base (ACWR nulled); D-147 = healthy base, *light off-plan* week. On a thin base `acwr` is null → `loadActuallyElevated` false → D-147 also won't fire unplanned-high, consistent.
- **Scope:** server-only (`coach/index.ts`). Untouched: `LoadBar.tsx`, adapt-plan/suggested_rir, auto-attach-planned, D-139. `deno check` error count unchanged (9 pre-existing, 0 added). **Deploy:** `coach` (held for sign-off).

---

## D-148 — STATE v2 per-discipline performance-trend model (shipped) + post-audit fixes

- **Date:** 2026-06-14
- **Context:** STATE screen v2 (spec `docs/SPEC-state-screen-v2-performance.md`). The screen's centerpiece becomes **per-discipline performance trend** (Improving / Holding / Sliding / Needs data), with **adherence as an honest fallback** where performance signal is thin — never blank, graduates over time. Built in steps with sign-off gates; then a read-only data audit drove three fixes.
- **Model (`src/lib/state-trend/`, pure TS, runs client or server):**
  - **One shared primitive** `classifyTrend(points, thresholds, asOf, opts)` — window membership + **noise guard** (min-session gate, 2-point endpoint averaging, dead-band) → verdict. Every discipline is a thin adapter feeding its dated metric series (architecture contract #1).
  - **Adapters:** strength (per-lift e1RM from `exercise_log`, roll-up follows primary lifts — contract #2), bike (`pwr20_trend_v1`, source-agnostic — contract #4), run (GAP pace `route_progress_metrics`), swim (pace/100 `workout_facts`). Run/swim are **`lowerIsBetter`** (pace: a decrease is improving).
  - **Hybrid resolver** `resolveDisciplineCard` — performance leads where it has a verdict, else weekly adherence. **Co-equal-ready:** `AdherenceState.context` (empty until SPEC-session-context Layer 1 tags exist) + `DISPLAY_MODE` one-spot flip fallback→co-equal (contract: adherence/performance are the same axis at two maturity levels, gated by data).
  - **Two-part headline** `synthesizeHeadline` (e.g. "Building — strength up, run sliding"). **Off-plan is NOT synthesized** — it stays authoritative on the server `intent_summary` (D-147). Untrusted disciplines are **gated out** (`HEADLINE_GATED_DISCIPLINES = {swim}`); empty state is **neutral** (`"No trend yet"`, never a fabricated direction).
  - **Deload** handled by one isolated predicate (`isDeloadWeek`, name-based per D-124) — swap to the `WeekPhase` flag is one-spot (contract #3).
- **Thresholds (signed off):** strength 6wk asymmetric (+2.5 / −2.0 / min 4); bike pwr20 8wk (±2.0 / min 3, shown as "power at threshold"); run 6wk (±2.0 / min 4); **swim 8wk (±1.5 / min 3) stays PROVISIONAL + headline-gated until Q-038 is fixed.** Adherence window 7d (weekly plan-compliance, aligns with D-147).
- **Wiring:** `useStateTrends` hook (client read-only fetches) → `StatePerformanceSection` → `StateTab` (between AERO and SIGNAL). Shipped user-visible.
- **Post-audit fixes (a read-only audit found no fresh verdict; swim showed "improving" on 13–39-day-old data):**
  1. **Staleness gate** — `classifyTrend` decays a verdict to `needs_data` (flag `stale`, `newestAgeDays`) when the newest qualifying point is older than per-discipline `freshnessDays` (strength 14 / bike 21 / run 14 / swim 10). *A stale "improving" is worse than an honest needs_data.* Window membership ≠ recency.
  2. **Run intent** — the gate read `route_progress_metrics.workout_intent`, which is **null at source** (`compute-facts:930` reads the unpopulated `computed.analysis.heart_rate.workout_type`). Real intent lives in `workout_analysis.classified_type` (5/11 runs = `easy`). Gate now joins + filters on `classified_type`, **plus a GAP-pace plausibility band (150–750 s/km)** after the audit found a corrupt 2280 s/km run that alone flipped the trend to a bogus −66.7%. Run now reads a real verdict on existing data.
  3. **Bike adapter** — `pickBestPwr20` selects the **densest in-window** pwr20 series, not merely the latest ride's (which was a lone 1-point endurance series). Type-filter sparsity itself is correct and left as-is.
- **Deliberately NOT fixed (filed for separate tracks):** RPM `workout_intent` null at source (a pipeline/compute-facts fix); the corrupt GAP-pace value's upstream root cause; **strength canonical-name split + per-lift min-4** (pre-existing); swim Q-038; the density-vs-freshness pick refinement (bike could prefer densest *among fresh* series). vo2 carries no pwr20 **by design** (short intervals → no sustained 20-min power).
- **Note (correction logged 2026-06-14):** D-144/D-145 (readiness + STATE readiness row) were found **already on `origin/main`** (ancestors of the deployed D-146/D-147) — the "hold" was moot; readiness shipped earlier, live-but-dormant (renders only with a recent check-in).
- **Commits:** `2907cfdf` (model + wiring, steps 1–3), `61152b81` (staleness gate), `d777afbf` (run fix), `be2edd7d` (bike fix), this docs entry. Verified throughout: `tsc -p tsconfig.app.json` clean, `npm run build` clean, live read-only audit/trace (`scripts/state-trend-{audit,diagnose,trace}.mjs`, untracked).
- **Scope:** client display/synthesis only. **Does NOT feed prescription** — adapt-plan / suggested_rir / auto-attach-planned / D-139 untouched. Trend verdicts must not drive autoregulation without separate sign-off.

---

## D-149 — Athlete-State Spine: architecture of record (end-of-session 2026-06-14)

- **Date:** 2026-06-14
- **Context:** Today shipped Part A of the per-ride narrative fix (D-148 — killed the `np_trend_v1` all-type-pool fallback, deployed + verified) and ran a chain of read-only audits (STATE v2 trend data, bike-options, bike-fitness, the per-ride LLM contradiction). Those audits surfaced a structural gap bigger than any one screen: **the app has no spine.** Fitness is re-derived screen-by-screen, so screens can tell four different stories about the same athlete at the same moment — which is exactly how the np_trend contamination survived (one screen fixed, another kept reading the poisoned pool).
- **Decision — two specs are now architecture of record (committed, not drafts):**
  - **`docs/SPEC-athlete-state-spine.md`** — one deterministic athlete-state layer every screen + the narrative read from instead of re-deriving. Properties (generalized from the STATE v2 primitive): deterministic / terrain-binned-not-pooled / staleness-gated / claim-grounded / honest-blank. **Spine = what's true; Arc = how it's said** — Arc becomes the narration layer bound to the spine (claim-grounding is the enforcement), not a parallel reasoner. The spine must absorb the *whole training loop* (baselines → plan → execution → computed state → records → adjustment), not just read-only views — because Training Baselines and My Record are a 3rd/4th source of truth already contradicting the computed values.
  - **`docs/BUILD-SEQUENCE-spine-foundation.md`** — the build order: P0 shared-primitive relocation (client→server, one impl) → P1 truth-reconciliation audit (read-only) → P2a bike-fitness signals (terrain-binned power + HR-at-power) → P2b per-ride HR@power read → P2c narrative→spine (Part B/C/D) → P2d load/readiness fold-in → **P3 close-loop-to-adjustment (GATED, separate sign-off — autoregulation)**.
- **Load-bearing principle:** *audit before trust, trust before adjustment.* The spine is display/synthesis only; it does NOT drive prescription (adapt-plan / suggested_rir) until Phase 3 explicit sign-off. Phase 1 (reconcile FTP 176/204, strength baseline-vs-e1RM, swim recorded-vs-computed) **gates Phase 3** — closing the loop off contradictory data would autoregulate against a lie.
- **USER-AGNOSTIC MANDATE (carried into all spine/bike/HR work):** the spine's *logic* is universal; *thresholds* are either sane constants or scale to each athlete's own baseline — **no magic numbers tuned to one athlete.** Flagged for review: HR reference band (must be per-rider, no hardcoded watt range), `CHRONIC_LOAD_FLOOR=500` (sanity-checked against one baseline — confirm/scale), freshness windows + trend thresholds (reasoned partly from one athlete's cadence — confirm they hold across low- and high-volume athletes).
- **Status of the day's work:** Part A live (D-148). Bike-fitness design approved (bins, HR@power clean metric, per-rider band, ±3%, show-both, thin-bin provisional). Per-ride HR@power read scoped. **Phase 1 truth-reconciliation audit = the next read-only task.** Parts B/C/D + bike-fitness build gated behind P0 relocation + threshold sign-off.
- **Scope:** docs/architecture only — no code shipped in this entry. Prior open questions (shared-lib core + server compute; readiness sits alongside-not-driving fitness) resolved in the spec and baked into the build sequence.

---

## D-150 — Athlete-State Spine: shipped implementation Steps 0–3 (relocation, scaling, narrative→spine, bike-fitness engine)

- **Date:** 2026-06-14
- **Context:** D-149 set the spine as architecture of record; this is the build-out from architecture to shipped vertical slices, each behind a sign-off gate.
- **Step 0 — relocation + per-athlete scaling:** moved the trend core `src/lib/state-trend/` → `supabase/functions/_shared/state-trend/` (one impl, `.ts`-extension imports for Deno + `@shared/*` client alias) so client screens and edge fns run ONE model, no drift. Added `resolveThresholds(discipline, sessionsPerWeek)` (Q-052): `windowDays` + `%` thresholds stay universal; `freshnessDays` + `minSessions` **scale to the athlete's own 90d cadence**. `REF_SPW` anchored to **measured** cohort cadence (bike 1.6 / run 2.6 / swim 0.7; strength 1.2 typical per-lift) — eyeballing REF_SPW caused a swim regression (13d read fresh → false "improving") caught in verify; measured values preserve all 4 verdicts.
- **Step 1 — reconcile the senses:** Q-051 swim pipeline fix (`learn-fitness-profile` reads `workout_facts.swim_facts.pace_per_100m`, not a raw km/min recompute that filtered every swim to null — verified publishes 199 s/100m n=9). Baseline **suggest-with-confirm** (`reconcile.ts` + My Record surface): computed-vs-typed divergence surfaces a suggestion, never auto-applies — gated ≥3 samples / ≥medium confidence / ≤42d / ≥5% divergence; sourced from learned aggregate, not raw e1RM. Verified only swim surfaced ("3:02/100yd +21.3%").
- **Step 2 — narrative→spine:** cycling per-ride LLM **describes** the deterministic verdict, never infers direction from raw numbers. `validateClaimsGrounded` (direction words must trace to `cross_workout.trend`) wired into the retry loop; `np_trend` all-type-pool fallback killed (Part A).
- **Step 3 — sport-agnostic per-session engine (bike instance):** `bike-fitness.ts` = terrain-binned 20-min power (freshest non-needs_data bin; climbing vs flat_sustained never mixed) + HR-at-power efficiency (lower=better, ±3%). **`resolveZoneBand(athlete, sport)` seam** — HR reference band from a function (Coggan Z2 default inside; personal zones drop in with zero downstream change), NOT an inline watt range (user-agnostic mandate). Per-ride `bike_fitness_v1` (w20 + hr_at_band + band_source) stored by `analyze-cycling-workout`; STATE bike row reads "Power · Efficiency" dual. Verified live: bike Power ↑+4.9% [prov] · Efficiency ↑−8.4% est(FTP).
- **Scope:** display/synthesis only — does NOT feed prescription (Step 4 plan-builder writeback GATED, separate sign-off).
- **Commits:** `ba60a8b1` (Step 0), `9a4c8ccd`+`77030dba`+`2f8d74ee` (Step 1), `2be4288e`+`3edd49c4` (Step 2), `53fba143`+`091187d1` (Step 3). deno check + tsc clean; live read-only verification each step.

---

## D-151 — Spine CACHE + single-source assembler + coach/session-detail readers (Steps 4a/4b)

- **Date:** 2026-06-14
- **Context:** Steps 0–3 each computed fitness where it was displayed. 4a/4b make it ONE cached value every surface reads — closing the fragmentation structurally (the bug class that let the np_trend lie + FTP contradiction survive).
- **4a — single source, proven structural:** extracted the STATE assembly into ONE pure `assembleStateTrends(rawRows)` (`_shared/state-trend/assemble.ts`) that **both** the client hook (`useStateTrends`) and the server (`compute-snapshot`) call. Identical model + identical fetch windows (`STATE_TREND_WINDOWS`) → identical output; equality is **structural, not coincidental** (one code path). Cached the result to **`athlete_snapshot.state_trends_v1`** (new JSONB column) — chosen over `coach_cache` because compute-snapshot already runs per-ingest with the windowed data and is already read by coach + arc + session-detail. **Verified cached==live 16/16** on real data before any reader was wired (the single-source proof gate).
- **4b — readers, REPLACE not add:** coach `fitness_direction` is now `rollupFitnessDirection(state_trends_v1)` — the **old 7d-vs-28d response-model derivation was removed, not kept alongside.** *Decision: two coexisting fitness verdicts is exactly how contradictions survived; one truth.* On real data the difference was stark — old method returned **"stable"** (a false-neutral burying a real run decline); roll-up returns **"mixed"** (bike improving + run sliding) and refuses to assert strength/swim. session-detail gained `discipline_trend` (read from the same cache in `workout-detail`, passed through `build.ts`, rendered in `MobileSummary` on all four disciplines; needs_data → honest "building").
- **Confidence framing (faithful AND honest — both):** added a per-discipline `provisional` flag to the cache (same near-floor-n / clustered-span gate the bike signals use). The coach narrative FACT **requires** naming each discipline's spine state, BUT frames any `[provisional]` trend — and any discipline whose recent sessions were largely missed — as a *signal to confirm*, citing missed sessions as co-explanation, never a confident decline; no-data disciplines are too-early. *Why required-naming: soft guidance got editorialized away under the dominant >50%-missed-adherence signal (narrative named bike-up, dropped run).* Result: "bike provisionally up 4.9%, run sliding 8.1%, swim & strength not enough sessions yet."
- **Retired the echo:** the response-model assessment's global "On the right track" / "training is producing results" `explain` strings (`weekly.ts`) scoped to RESPONSE MARKERS — that leftover was a mini-echo of the retired fitness derivation sitting next to "mixed."
- **`COACH_PAYLOAD_VERSION` 36→39** (D-147 cache-bust lesson). **pctChange semantics + sign conventions + n=3 endpoint-overlap** documented in `SPEC-athlete-state-spine.md` (all four surfaces now display it).
- **Shipped:** migration `20260614000000_add_state_trends_v1` applied; `compute-snapshot` + `coach` + `workout-detail` deployed; client pushed.
- **Commits:** `4bc089b3` (bike session-detail), `efbeee3b`+`ab6f68a8` (4a), `96c53b20`+`f6b9d679`+`4fe62ddb`+`a7327178` (4b), `185f338c`+`c33ef732` (pctChange spec).

---

## D-152 — Tier-1 honesty sweep: run pace corruption (Q-054) + zero-not-null hardening (T2) + narrative anti-speculation (T1)

- **Date:** 2026-06-14
- **Context:** first sweep off the whole-board priority order (ENGINE-STATE Tier map) — correctness/honesty bugs that mislead the athlete, sequenced data-integrity-before-voice (same reconcile-senses-before-voice discipline as the spine). All three land on `compute-facts` + the cycling narrator; none touch prescription.
- **Q-054 — run GAP/pace source corruption (`compute-facts`):**
  - **The filing's premise was wrong.** It guessed a "GPS-dropout unit bug." The trace showed the 4 corrupt `route_progress_metrics` rows were **stale residue** — written when the provider pace was garbage (source `computed.overall.avg_pace_s_per_mi` since corrected to clean), never overwritten (cluster-key churn + a NULL-`workout_id` write path left orphans). Only **one** mechanism was a live code bug.
  - **Fix 1 (the live bug):** a zero HR (no strap / treadmill) collapsed GAP to 0 — `effort_adjusted = pace × (hr/refHr)` with `hr=0`, and the guard checked `avgHr != null` (which **0 passes**). The **zero-not-null class, same family as D-112 (failure-to-zero coercion) / D-115 (index-0 hardcoded fallback)**. Now `buildRunFacts` picks the first POSITIVE hr source, and the route_progress writer treats `avgHr ≤ 0` as missing → `effort_adjusted = null` (raw pace stands), **never 0**.
  - **Fix 2 (write-side clamp):** plausibility clamp (150–750 s/km, mirrors the spine read-guard) on `avg_pace` + `effort_adjusted` at the **write** site → a garbage provider pace (path A) or any OOB value never persists; the read guards become a backstop, not load-bearing.
  - **Fix 3 (recompute, not delete):** recomputed the 4 affected workouts → all **self-healed** (2449→404, 2508→418, 24808→415; the HR-less 2026-03-26 GAP `0→null`). Recompute proved Fixes 1+2 on the real corrupt rows (the regression check); delete would have hidden them. Full scan: **0/118** OOB remaining.
- **T2 — `computed.overall.avg_power/avg_hr=0` (verified not firing; hardened):** verified **0/40** rides carried `overall.avg_power_w=0` or `avg_hr=0` (the `avg_hr` display half was already closed by Q-007's TREND HR-line fallback) — T2 does not currently mislead. But the latent zero-blind pattern (`??` passes a literal 0) is the same class, so **`buildRideFacts` avg_power/avg_hr got the same first-positive treatment** → `compute-facts` now treats 0-as-missing **across both disciplines** (symmetric with the run fix). `get-week:785/788` (`== null` fill, zero-blind) left untouched — `overall` is written clean upstream, zero payoff, higher risk to change calendar reads.
- **T1 — cycling narrative anti-speculation (`_shared/cycling-v1/ai-summary.ts`, prompt-only):**
  - **Root cause, two gaps:** (a) `validateClaimsGrounded`'s `dirRe` word list was incomplete — caught `declin*/improv*/slid*` but **missed "holding/responding/consolidating"** (fitness claims by another word); (b) **no anti-speculation rule for the trailing clause** — phase-guessing ("suggests you're in a base-building phase rather than a taper"), projection ("will pay dividends / move the needle"), and alarm leaked. **The prompt itself seeded it** (the "SO WHAT?" rule literally instructed *"aerobic efficiency is holding" / "suggests accumulated fatigue"*). Concentrated in cycling; run already constrains via prompt rules.
  - **Part A (hard guard, low-risk):** extended `validateClaimsGrounded` with a fitness-subject-anchored pattern for holding/responding/consolidating (anchored so "held the 150-167 W target" = execution is NOT flagged). This **extends an existing retry-loop guard — does not add one** (honors the SESSION-CONTEXT §7 3-guard-stack footgun).
  - **Part B (prompt-only):** fixed the seeding example + added an anti-speculation rule (phase / projection / alarm / fitness-direction) mirroring run's, plus a **targeted limiter-projection line** (state the limiter as fact, never project its fix). **Prompt-only — never touched the retry loop**, per §7 + the explicit "prompt rules generalize, regex is whack-a-mole" reasoning.
  - **Result (recorded honestly):** force-regenerated all 12 leaker rides — **11/12 fully clean, reliably** (9 immediate + 2 on re-roll); **1 ride (2026-05-19)** had its severe projection killed and the limiter grounded as fact, but retains an **intermittent soft projective tail** on ~1-in-2 rolls (rephrases — "return concentrates"). Filed as Q-058: prompt-only cannot deterministically suppress an open-ended class; closing it fully needs the retry-loop hard guard deliberately declined here. Part A fired on 0 (the prompt prevented the phrasing upstream) — it stays as a zero-cost backstop.
- **Commits:** `9c0f73d8` (Q-054 + T2, `compute-facts`, deployed + 4 recomputed); T1 (`_shared/cycling-v1/ai-summary.ts`, `analyze-cycling-workout` deployed); this docs entry.
- **Scope:** display/data-integrity only — no prescription touched. Tier-1 honesty sweep complete; Tier-2 (read-only baseline→zones flow audit) is next per the Tier map.

---

## D-153 — Load de-fragmentation: "HIGH LOAD" headline was a category leak, not LLM hallucination

- **Date:** 2026-06-14
- **Context:** STATE/coach showed "HIGH LOAD" (green) while readiness was `fresh`. Looked like an invented verdict; was **deterministic**, three conflations.
- **Root (the real one):** `readiness_label` (coach:4992) returned `'HIGH LOAD'` when `load_status.status==='high'` **before** checking `readinessState` — putting the LOAD verdict on the READINESS chip. Plus `LoadBar` + `SnapshotLoadBar` (CoachWeekTab) read `loadStatus.status` (the body-response verdict) instead of the volume verdict.
- **Fix — one verdict per axis:** LoadBar + SnapshotLoadBar read the **volume verdict** via `acwrVolumeLabel` (single source for the ACWR→band map; LoadBar imports it, so gauge label + headline can't drift). `readiness_label` reflects **readiness only** (`fresh`→`LOW FATIGUE`); load branches removed. Deterministic COMPLETED-THIS-WEEK fact (count all incl. off-plan; no undercount).
- **#3 was NOT the bug:** the body-response min-session gate (`based_on_sessions≥2`, coach:676-682) already holds and readiness was correctly `fresh` — did **not** add a redundant gate to a working computation. The fix was the category separation.
- **Class:** same fragmentation family as the spine — load finally gets **one-verdict discipline** (volume on the load axis, body-response on the readiness axis, single-sourced across 3 surfaces). This is the Tier-3 load fold-in's *label* half (D-146/147 ACWR-compute fold-into-`state_trends_v1` still remains).
- **Cache-bust:** the load-fix code shipped in `fa4e1813` at **v39**; the **v40** bump (its comment describes this fix + the completed-count) landed in the immediately-following #4 commit `a8bf025b` — **v40 is the shared handoff into D-154** (cache-busts this change AND begins #4). Coach deployed, client pushed.

---

## D-154 — STATE #4: deterministic glance + expandable narrative, credit-first voice

- **Date:** 2026-06-15
- **Context:** STATE rendered the full `week_narrative` inline, opening with a deficit ("only two of seven"). #4 = glance-first presentation, after the verdicts were made true (D-153).
- **Glance:** `buildLoadHeadline` (`src/lib/load-headline.ts`) — three slots: STATE (load verdict · readiness) · FITNESS shape (`fitness_direction`) — OBSERVATION. Observation is **state-implied, never a prescription** ("you have headroom" / "you're carrying fatigue" / muted off otherwise). `acwrVolumeLabel` single-sources the bands (shared with LoadBar). **Bounded composition now; the authored phrase bank (`SPEC-state-headline`) is the follow-on.**
- **Structure:** full narrative collapsed behind "open for more" (`StateTab`), **collapsed by default** — glance-first, detail opt-in.
- **Narrative tone (active path = `narrativePrompt` coach:~4425, which OVERRIDES `generateCoaching`/`COACHING_SYSTEM_PROMPT` — a real trap: the first prompt edited was not the one rendering):** credit-before-deficit + **hard lexical rule** — no raw "X of Y" tally anywhere; qualitative register required. Leads with state + work-done (off-plan credited, never "behind"). `max_tokens` 300→500 (was truncating mid-sentence).
- `COACH_PAYLOAD_VERSION` **40→44** (iterated live: 41 credit-first, 42 active-path-found, 43 hard-lexical, 44 sentence-4-describe + token). Continuous chain 39→44, no gaps. Commits `a8bf025b`, `a2fda91e`, `821f5552`, `0db80156`.

---

## D-155 — The prescription boundary: describe the plan freely, never change it (durable rule)

- **Date:** 2026-06-15
- **The rule (durable, governs the whole LLM-coach voice):** **Naming planned-session priorities = plan-describing → ALLOWED** (opt-in, behind the expand; same category as session-detail narration — pointing at what the plan already encodes as key sessions). **Changing the prescription** (loads, RIR, adding/cutting sessions, plan JSON) **= GATED** (Step 5 autoregulation, explicit sign-off).
- **Why the line is here:** describing the plan's existing key sessions is not *deciding for* the athlete; it's reading back what's prescribed. The gate is about *changing what's prescribed*, not *talking about it*.
- **Enforced in `narrativePrompt`:** (a) **lexical "add" ban** — "add a session"/"add one more"/"add another" forbidden (reads as extra volume even when it means a planned session); use "prioritize"/"anchor on", always referring to planned sessions. (b) **Pin to FACTS-marked key sessions** — name only sessions the FACTS mark key; don't invent a priority ranking (describe-not-decide).
- **Relation:** the read-side companion to the spine's "display-only, prescription gated" — same human-at-the-gate discipline, applied to the coach's voice. Commit `0db80156`.

---

## D-156 — Swim de-conflation: adherence ≠ trend verdict (same family as D-153, render-only)

- **Date:** 2026-06-15
- **Context:** STATE PERFORMANCE showed `swim   0/2 — falling behind` where bike/run show a trend verdict. **Spine model was already correct** (swim `headlineVerdict=null`, `primaryAxis='adherence'` — no trend); the bug was **render-only** — `StatePerformanceSection` dropped the adherence `ratioLabel` into the verdict slot. Adherence wearing a trend's clothing. Exactly the D-153 shape (model knew; render mislabeled).
- **Fix (B — demote + relabel, judgment word killed at the source):**
  - `adherence.ts`: `adherenceLabel` is now a **neutral count** ("0/2 planned"), never a judgment word. "on track"/"behind"/"falling behind" mimic trend verdicts ("falling behind"≈"sliding") and could leak into any slot — removed **at the source** (class fix, same discipline as the zero-not-null fixes D-112/D-115/Q-054).
  - `StatePerformanceSection`: no-trend disciplines render the honest **"needs data"** in the verdict slot + adherence demoted to a muted neutral count → `swim   needs data · 0/2 planned`.
- **(B) over (A) (drop adherence entirely):** (A) hides the true 0/2 fact; (B) shows the full truth in the right slots — **honest-blank over hiding**, same as the spine's blank-over-confounded discipline. Adherence stays the co-equal axis it was built for, de-conflated.
- Client-assembled (`useStateTrends`→shared module), so the rebuilt bundle carries it; compute-snapshot/coach redeployed to keep `_shared` in lockstep. Verified via deno: renders "needs data · 0/2 planned"; 1/2→"1/2 planned", 2/2→"2/2 planned". Commit `81c88047`.

---

## D-157 — HealthKit swim integration: dedup-first gate + native plugin + on-device merge

- **Date:** 2026-06-14
- **Context:** swim-audit Layer 3 — extend swim data via Apple Health, sequenced **dedup-first** (add a second source only after same-swim collisions are handled, not after).
- **Dedup gate (required first):** `mergeSameSwimIfExists` (`ingest-activity`) — 60s start-window + sport + ±10% distance + different source; **best-field-from-each merge** (HealthKit-rich `pool_length`/lengths/strokes merge onto existing Strava only where absent), **not** pick-one-source (Runna pattern, supersedes the pick-one-up-front design). Recomputes via compute-workout-summary + compute-facts. **Non-partial** unique index (a `WHERE`-partial index can't serve `ON CONFLICT` — 42P10, caught in sanity check); NOT NULL `name`/`duration` added to `mapHealthKitToWorkout` (23502, caught).
- **Native:** `HealthKitPlugin.swift` `readWorkouts` enriches swims (pool length from `HKMetadataKeyLapLength`, async stroke count + avg HR via `HKStatisticsQuery`). `App.entitlements` healthkit key pre-added (user adds +Capability in Xcode → syncs the provisioning profile).
- **Platform-split UX:** `AppleHealthSwimEnrichment` — native iOS → "Connect Apple Health" toggle (off by default); web → "richer data in the iOS app" note; download link = config (`app-links.ts`).
- **On-device verified:** Apple Health shows Connected; same-swim Strava+HealthKit → **one merged workout**, no duplicate. The "not available on this device" red herring was a **stale web bundle** (cap sync not run after the build), NOT the entitlement (`isHealthDataAvailable` is true on iPhone regardless).
- **Scope:** ingest/display + native read only — no prescription. Commits `be6894dd`, `f8e92bae`, `f814f40d`, `f9b43c4f`, `3b3891d2`, `4797f031` (design `5b4a927f`/`e814c72c`/`b9d4697c`).

---

## D-159 — Details-tab swim render: detect swims by TYPE, not by `swim_data` presence

- **Date:** 2026-06-15
- **Context:** swim-audit Layer 2 shipped the **Performance-tab** swim-native view (a44f9b2d: `build.ts` guards + `PoolSwimOverall`). The **Details tab** (`CompletedTab`) was never swim-guarded for the Strava case. On device, June 1 + June 15 pool swims still rendered the **mph speed chart, mile splits, route map, and the Grade/VAM/Cadence metric-tab row**.
- **Root cause (confirmed on device, not just code):** `CompletedTab` keyed every swim decision off **`workoutData.swim_data`**, which is **NULL for Strava swims** (Strava strips per-length/stroke data — see the audit's live-record finding). So the swim readout grid (`:1349`), the pool-swim viewer short-circuit (`:1965` `isSwim = workoutData.swim_data`), and the splits block all fell through to the land paths. Same class as Q-054/D-112/D-115 (an absent value silently selecting the wrong branch).
- **Fix (type-based, one signal):** derived `isSwimType = resolvedWorkoutType === 'swim'` (`resolvedWorkoutType` = `workoutType` prop → `type` → `norm.sport`, reliable regardless of `swim_data`) and applied it at the three decision points: readout grid gate (`isSwimType || swim_data`), viewer `isSwim` (`isSwimType || !!swim_data` → the existing pool-vs-open `isPoolSwim` logic still distinguishes), and the standalone splits block (`!isSwimType`). The swim readout grid reads `norm.avg_swim_pace_per_100m` from `computed.analysis.swim` (stored for Strava swims) + scalar distance/duration/HR; pool/lengths/strokes show N/A (honest — not captured).
- **Not touched:** HR Zones (`:2110`, data-gated, swim-safe), the open-water GPS map (legit route), the dead `getAdvancedMetrics` (`isRun = swim_data` copy-paste bug, never rendered).
- **Verification:** `tsc` clean on the file (pre-existing 814–841 errors unrelated) + `npm run build` clean. Verify on-device against the June 15 swim: Details tab shows swim readouts, no mph chart / mile splits / map.

---

## D-160 — Performance-tab swim polish: total readout, trend-sign agreement, nudge gating, rich-detail fill

- **Date:** 2026-06-15
- **Context:** four on-device swim Performance-tab papercuts reported alongside D-159, all display-only.
- **(a) Prominent total (`EnduranceIntervalTable/PoolSwimOverall`):** executed distance was legible only as a % adherence chip / inside the planned-vs-executed card — no standalone "how far did I swim." Added a distance + duration **headline** (`text-2xl`) above the adherence chips.
- **(b) Trend-sign agreement (`MobileSummary/DisciplineTrendLine` + `StatePerformanceSection` ×2):** `swim trend ↑ improving −34.6%` read as a contradiction. **The engine is correct** — `classify.ts` keeps `pctChange` RAW (so the UI knows real direction) and flips only the *verdict* for `lowerIsBetter`; a faster swim is a negative pace delta. Fix is **display-only**: a shared `verdictSignedPct(verdict, pct)` signs the magnitude by the verdict (improving → `+`, sliding → `−`, holding → raw) so the number always agrees with the arrow. Applied at all three render sites (session tab + STATE bike-dual + STATE discipline row). **Did NOT touch the classifier** (D-148/D-150 contract; the raw-sign comment at `classify.ts:76` is intentional).
- **(c) Nudge gating + relocation (`AppleHealthSwimEnrichment`, `MobileSummary`):** the "Richer swim data / Connect Apple Health" card was a near-top hero AND showed even for swims already ingested via HealthKit. Now **gated** — hidden when `source === 'healthkit'` OR `pool_length > 0` (the merge keeps `source='strava'` but fills rich fields, so the source check alone misses merged swims) — and **relocated** to the bottom of the swim view as a quiet opt-in row.
- **(d) Empty-area fill (`MobileSummary`):** the dead space below the planned/executed card = the pool-swim-suppressed `SessionNarrative` (`!is_pool_swim`, from the March a7e14381 refactor) leaving nothing after `PoolSwimOverall`. Now filled two ways: the relocated nudge (Strava swims) **or** a new **swim rich-detail block** (Pool / Lengths / Strokes, read from the `completed` workout row — these aren't in `completed_totals`) for HealthKit/merged swims that carry them. The pool-swim narrative suppression was left intact (re-enabling is a separate call — swim narrative quality is Q-038-clouded, unverified).
- **Scope:** display/synthesis only — no prescription, no analyzer, no contract change (rich-detail reads the existing workout row). **Verification:** `npm run build` clean; verify on-device against June 15 swim (headline total, `↑ improving +34.6%`, nudge absent for the HealthKit swim, rich-detail or nudge filling the lower area).

---

## D-161 — Derive HealthKit swim length-count from distance ÷ pool length

- **Date:** 2026-06-15
- **Context:** the D-160 swim rich-detail block shows Pool / Lengths / Strokes. HealthKit gives `pool_length` (`HKMetadataKeyLapLength`) + `strokes` + total distance, but **no length COUNT** — FORM writes summary-level to HealthKit (no per-length lap array), and Strava strips everything. So the "Lengths" cell was always blank even on enriched swims.
- **Fix (one derive, `mapHealthKitToWorkout`):** `number_of_active_lengths = round(distance_m / pool_length_m)` when both are non-null, **preferring an explicit count** if the plugin ever supplies one (`explicitLengths ?? derived`). Both values are already in metres. No new HealthKit read, no native change.
- **Propagates through the merge for free:** `mergeSameSwimIfExists` fills `number_of_active_lengths` onto a kept Strava row from the HealthKit side when absent — now that the HealthKit row carries the derived count, a merged FORM→Strava+HealthKit swim gets it too.
- **Honest bound:** this is a COUNT, not per-length splits / SWOLF / stroke-type — those need the FORM "Swim Breakdown" screengrab path (audit Tier B), still not built. The derive assumes uniform pool lengths (true for lap swimming); an odd final partial length rounds to nearest.
- **Scope:** ingest/display only — no prescription. `ingest-activity` deployed (`yyriamwvtvzlkumqrvpm`). Verify on the next HealthKit swim: Lengths populates ≈ distance/pool.

---

## D-162 — Swim post-workout feedback: pool length + planned-equipment confirmation (replaces the HealthKit-for-pool-length path)

- **Date:** 2026-06-15
- **Context:** the HealthKit native path (D-157) is the *automatic* way to get pool length, but the friction is high (HealthKit capability in Xcode + full native build + FORM→Apple Health toggle + the 60s merge window — surfaced live when a reimport produced a Strava-only row with no enrichment). Paused that path (**Q-060**) and instead **ask the athlete** in the existing post-workout feedback popup — a one-tap pool selection gives the same pool_length + length count with zero native work.
- **Flow (swims only; run/ride unchanged — they keep feel + RPE):**
  - Swims get the same **feel + RPE** screens as run/ride (not replaced), **no gear** section, plus two swim screens.
  - **"What pool?"** — 25 yd / 25 m / 50 m / Skip. On save: write `pool_length` (metres) to the workout row + derive `number_of_active_lengths = round(distance_m / pool_length_m)` client-side. Surfaces immediately in the Performance-tab rich-detail (Pool / Lengths wired in D-160).
  - **Equipment confirmation** — *planned-aware, not free entry.* Reads the LINKED PLANNED swim from **two** places (this was the fix that made it actually show): **per-step required** equipment (`computed.steps[].equipment`, e.g. pull→buoy, with a `step_index`) **AND session-level suggested/optional** (`computed.swim_equipment_suggested` / `swim_equipment_optional_suggested`, e.g. a catch-up drill's snorkel/fins, `step_index: null`). Shows Yes/No/Skip per prescribed item ("Catch-Up — pull buoy?", "Did you use fins?"). **Fallback:** when the plan prescribed **nothing** (or the swim is unplanned), show a simple multi-select (Fins / Pull buoy / Snorkel / Paddles) so equipment can always be logged. ⚠ Reading only `step.equipment` was the original miss — optional/recommended gear (snorkel/fins) lives at the session level, not per-step, so a Technique-Aerobic swim with a catch-up drill showed **no** equipment section. Stored in `workout_metadata.swim_steps_equipment_confirmed: [{step_index, equipment, used}]` (prescribed; `step_index` null for session-level) or `swim_equipment_unplanned: string[]` (fallback), merged without clobbering existing metadata keys.
- **Pool unit:** `pool_length` stored in **metres** (25 yd → 22.86 m) to match the HealthKit path so both sources are unit-consistent; display unit handling stays Q-059.
- **Downstream (capture-only, no filtering yet):** if any confirmed step used **fins** (or the unplanned tag includes fins), the Performance tab shows a session-level note **"· some sets with fins"**. The per-step pace exclusion from the trend is deliberately **not built** — only captured — see **Q-061** (which now has the per-step confirmed data it needs).
- **Trigger plumbing:** swims were excluded at the source — opened the gate in **all five** paths: `check-feedback-needed` (`.in('type', […,'swim'])`), the `feedbackWorkout` union, and the four AppLayout trigger predicates (`checkSpecificWorkout`, two realtime handlers, post-import) via a shared `isFeedbackType` helper. RPE-null + dismissal gating unchanged.
- **UX call:** implemented as **sections in the existing single panel** (matching the current RPE/feeling/gear layout), not a multi-screen wizard — lower risk, consistent with the component.
- **Scope:** capture/display only — no prescription, no pace filtering. `check-feedback-needed` deployed; client `npm run build` clean. Verify on the June-15 swim (open it → popup shows feel/RPE + pool + equipment) and on the next planned swim with prescribed drill equipment.
- **Verified on device (2026-06-15):** full flow persisted on the real swim — `pool_length: 50`, `number_of_active_lengths: 22` (=round(1100/50)), `rpe: 3`, `feeling: "good"`, and `workout_metadata.swim_steps_equipment_confirmed: [{snorkel,used:true},{fins,used:true}]`. The equipment two-source read (per-step + session-level) was the fix that made it show.
- **Friendly equipment names (follow-up):** the materializer normalizes equipment to terse tokens (`buoy`, `board`); the popup now maps those to athlete-facing names for the prompt only (`buoy → "pull buoy"`, `board → "kickboard"`) via `EQUIP_DISPLAY` — the stored `equipment` token is unchanged. Note pull/kick-focused sessions surface **all** plan gear (required + optional), e.g. pull → buoy + paddles + snorkel, not buoy-only — same path that correctly shows snorkel+fins on a catch-up swim.

---

## D-163 — Swim duration adherence: compare ELAPSED pool time to the planned total, not moving time

- **Date:** 2026-06-15
- **Context:** the swim Performance tab read **"77% Duration"** when the athlete swam *longer* than planned (planned 30:59, elapsed ~35 min). Audited: `analyze-swim-workout` computed `duration_adherence` from **`moving_time`** (24 min, excludes rest between sets) against the planned **`total_duration_seconds`** (1859s, which *includes* rest) → 1440/1859 = 77%. Apples-to-oranges — a swim's planned duration is whole-session time, so the comparable executed value is **elapsed**, not moving.
- **Fix:**
  - **`analyze-swim-workout`:** `duration_adherence` now uses **elapsed** (`workout.elapsed_time`, integer-minute-aware) and reports a **raw completion ratio** (`elapsed/planned`, uncapped → ~113% here, ">100% = did more", matching the distance chip's raw method). The execution-score blend **clamps it to 100** so a long session can't inflate the quality score. Also surfaces `performance.session_elapsed_s`.
  - **`build.ts` (session-detail):** the swim block's `completed_totals.duration_s` now shows **elapsed** (from `perf.session_elapsed_s`) so the planned/executed card + the D-160 headline read total pool time, not moving. **Pace stays on moving** — `swim_pace_per_100_s` is computed from `completedDurS` (moving) *before* this, untouched. Non-swims and missing-elapsed fall back to moving.
- **Why raw, not the prior symmetric closeness score:** the old formula penalized over- AND under-shoot (capped 100); for a swim "I did more time" should read as >100% like distance (+yd), not as a deduction. The quality blend keeps the bounded behavior via the clamp.
- **Residual:** Strava stores elapsed as **integer minutes** (35, not 36:42), so it reads ~113% not the athlete's exact 118% — the same integer-minute precision loss flagged in the swim audit (Layer 1), not a new bug.
- **Scope:** display/adherence only — no prescription. Deploy `analyze-swim-workout` + `workout-detail`; recompute the swim to populate `session_elapsed_s`. Verify: Duration chip ~113%, swim block shows ~35:00 executed.

---

## D-164 — Swim follow-ups: Details-tab pace (Layer-1 completeness), pool_length wiring, recompute button

- **Date:** 2026-06-15
- **Context:** three loose ends after D-162/D-163, all confirmed on real data (read-only query). Client-only.
- **Details-tab pace (Layer-1 completeness):** the Details tab read `computed.analysis.swim.avg_pace_per_100yd = 183s = 3:03/100yd` (stale, sample-derived) while the Performance tab showed `2:00/100yd` (scalar). The Layer-1 swim-pace correction (D-156/e77cb3ad) reached `workout_facts` + `session_detail` but **not** `computed.analysis.swim`. Fix: `useWorkoutData` now derives swim pace from the **authoritative scalar** (moving duration ÷ distance), matching the Performance tab; the stored analysis value is fallback-only. Client-side — no recompute needed, fixes existing swims immediately.
- **pool_length wiring:** the popup wrote `pool_length` (50), but `analyze-swim-workout` reads `pool_length_m` **directly** (was defaulting to 22.86 = 25 yd), and `resolvePoolLength`'s tier-1 is `user_corrected_pool_length_m`. The popup now writes **all** the columns readers actually use: `user_corrected_pool_length_m` (resolver tier-1 "athlete fixed it post-swim") + `pool_length_m` (analyzer direct read) + `pool_length` (display) + `pool_unit`. (Only affects the analyzer's internal SWOLF/pool calc — pace-per-100 doesn't need pool length — but closes the column split.)
- **Swim recompute button:** pool swims had no in-app recompute (the control lives in `SessionNarrative`, suppressed for pool swims). Added a "Recompute analysis" affordance to the swim Performance view in `MobileSummary` (uses the existing `recomputeAnalysis` + user JWT).
- **Garmin FIT rests/equipment — VERIFIED (no change):** audited `send-workout-to-garmin` — rest steps **are** in the payload (`intensity: 'REST'`, `durationType: 'FIXED_REST'` for pool swims, 20s preserved) and equipment is on work steps (`mapSwimEquipment` → `SWIM_PULL_BUOY`/`SWIM_FINS`/…); rest steps correctly carry no equipment, trailing rest correctly skipped. The UI display matches the FIT payload. No bug.
- **Scope:** display only — no prescription. `npm run build` clean. Verify: Details + Performance pace agree (2:00/100yd); next pool selection writes `pool_length_m`; swim Performance tab shows a Recompute control.

---

## D-165 — Planned-swim bottom sheet (home/calendar): Copy-for-FORM + pool selector + Apple Watch placeholder

- **Date:** 2026-06-15
- **Context:** tapping a planned workout from the home "Today's Effort" card / calendar opens a Radix Drawer (`TodaysEffort.tsx`) with Send-to-Garmin / Mark-Complete / Close. For swims it was a **downgraded** surface vs the Planned tab — no Copy-for-FORM-Goggles, no pool selector.
- **Added (swim-only, between the Garmin row and the Mark-Complete row):**
  - **Pool length selector** (25 yd / 25 m / 50 m) → writes `pool_unit` + `pool_length_m` + `plan_pool_length_m` to the **planned** row. `PostWorkoutFeedback` now prefills its pool from the linked planned swim's `pool_length_m` when the completed swim has none — so picking the pool here pre-selects it in the post-workout popup.
  - **"Copy for FORM Goggles"** — reuses the Planned tab's exact path (`buildFormGogglesSwimScript` + clipboard + toast), no duplicate logic.
  - **"Send to Apple Watch"** — disabled placeholder, `title="Coming soon (Q-062)"`.
- **Unchanged:** Send-to-Garmin, Mark-Complete, Close. Non-swim sheets untouched.
- **Scope:** UI + planned-row pool write — no prescription, no analyzer change. `npm run build` clean. Verify on device: tap a planned swim → sheet shows pool selector + Copy-for-FORM; selection prefills the post-workout popup.

---

## D-166 — Swim Performance/Details visual polish + the 1:60 pace-formatter bug

- **Date:** 2026-06-15
- **Context:** the swim surfaces were functionally correct (D-159..D-165) but visually off — a white card on a dark app, flat clinical chips, Pool/Lengths bolted below the card, and a real formatter bug. Pattern-matched to the existing design system; **no new design language.** (Numbering note: the bottom sheet took D-165, so this batch is D-166.)
- **Pace formatter 1:60 bug (functional):** `formatSwimPace` (the shared util) did `floor(s/60)+round(s%60)` → for 119.5s, `floor(1.99)=1` + `round(59.5)=60` = **"1:60"**. Fixed to **round total seconds first** (`v=round(s); floor(v/60):v%60`). Routed every surface through the one util — `TodaysEffort` had **three** inline copies of the bug (home card), `CompletedTab` (Details grid) one more; all now call `formatSwimPace`. `EnduranceIntervalTable`'s was already round-first but now uses the shared util too.
- **Unified dark swim card (`PoolSwimOverall`):** white `bg-gray-50` planned/executed card → dark `rounded-xl border-white/10 bg-white/[0.03]`; muted blue-tinted labels (`rgba(120,170,255,.55)`) + light values, matching the Details READOUTS card. Pool/Lengths **folded into the metrics grid** (Pace/HR/Pool/Lengths share one row) via a new `EnduranceIntervalTable.swimExtras` prop (they live on the workout row, not `session_detail`, so `MobileSummary` passes them); the separate `MobileSummary` rich-detail + fins-note blocks were **removed** (consolidated into the card). Adherence renders as **pill+dot** (green ≥ plan / amber below) instead of flat % chips.
- **Details equipment flag:** `· fins used` tag on the Avg Pace label (`CompletedTab`) when `swim_steps_equipment_confirmed` has fins=yes — honest signal the blended pace includes finned sets (Q-061 context).
- **"No route data (pool swim)" gap:** the placeholder floating in the tall map section left a large void before HR Zones → replaced with a thin muted divider.
- **Scope:** display only — no prescription, no analyzer/contract change (swimExtras reads the existing workout row). `npm run build` clean. Punch-list §9. Verify on device alongside D-159..D-165 in one rebuild: home/Details/Performance pace all read 2:00 (never 1:60); swim Performance is a dark sibling of the Details card with Pool/Lengths in-grid and dot-pills; Details shows `· fins used`; the pool-swim gap is tightened.
- **Refinements (post-device-feedback, same day):**
  - **Top adherence header dropped for swims** — it duplicated the in-card green-dot Distance/Duration pills (113% Duration showed twice). `MobileSummary` now passes `hideTopAdherence` for `type === 'swim'`; the inline pills are the single source.
  - **Discipline trend moved INSIDE the card** — "swim trend ↑ improving +34.6%" was orphaned between the header and the card; `PoolSwimOverall` now renders it as the card's top line (reads `sd.discipline_trend`, same verdict-signed-% rule as D-160), and the standalone `DisciplineTrendLine` is suppressed for swims.
  - **Pace label** — "2:00 /100yd" is now one value line with "Pace" as the label beneath (was wrapping `/100yd` under "Pace"); `whitespace-nowrap` on metric values.
  - **Dead space below the card → Q-064** — the run/ride INSIGHTS narrative is still suppressed for pool swims (Q-038-clouded); filed rather than re-enabled blind.
  - **Week/phase label kept** — dropping the top adherence header also dropped the week label ("Week 5 · Build") it carried. Restored as the card's top line (`sd.plan_context.week_label`) — week/phase context matters for every discipline, not just the ones that kept the header.

---

## D-167 — Swim narrative fixed (pace single-sourced + plain-prose prompt) → re-enabled for pool swims

- **Date:** 2026-06-15
- **Context:** Q-064 assessment found the swim INSIGHTS narrative unshippable: it led with the markdown title **"# Swim Workout Analysis"** and stated the **wrong pace** ("2:11/100yd" — per-100m mislabeled as /100yd) with a **wrong pool** (25 yd default, not the athlete's 50 m). Fixed all three, then re-enabled.
- **(1) Pace + pool single-sourced (the foundational fix):**
  - New shared helper `_shared/swim/swim-pace.ts` `swimPacePer100Seconds(movingS, distanceM, unit)` — **the one** swim-pace calc, now called by BOTH `build.ts` (Performance tab) and `analyze-swim-workout` (narrative). The analyzer was computing per-100m independently and mislabeling; single-sourcing kills the divergence at the source (same recurring class as D-156/D-164).
  - Pool length via `resolvePoolLength` (user_corrected → device → planned → default), reading the D-164 columns added to the analyzer SELECT — was hard-defaulting to 25. Pace **unit** = the plan's `swim_unit` (matches `build.ts` `plannedTotals.swim_unit`, default yd); physical pool length shown separately (50 m).
- **(2) Plain-prose prompt (over post-hoc stripping):** the prompt + system message now forbid Markdown (no `#`, no `**`, no numbered titles) and ask for 3–4 plain sentences — a prose-first prompt is more robust than a parser chasing syntax. A backstop parser still strips stray markdown and drops header-only / label-only lines.
- **(3) Re-enabled `SessionNarrative` for pool swims** (`MobileSummary` — dropped the `!is_pool_swim` suppression) only **after** verifying clean on a real recompute. Swims now get INSIGHTS like run/ride (filling the dead space below the card, Q-064), and SessionNarrative hosts recompute, so the separate D-164 pool-swim recompute button was removed.
- **Verified (real recompute, June 15 swim):** narrative.text = "The swimmer completed 1100 meters in 24 minutes, **averaging 2:00 per 100 yards**…"; bullets all plain prose (no markdown); "**50-meter pool**"; `workout_summary.average_pace_per_100: "2:00"`, `pool_length: 50`.
- **Scope:** display/narrative only — no prescription. **DEPLOYS:** `analyze-swim-workout` + `workout-detail` (build.ts consumer) — server change. Client + docs pushed. Closes Q-064.
- **D-167 continued (unit consistency):** the first cut still leaked units — distance was fed to the prompt in **metres** (`totalDistanceMeters` → "1100 meters") then "translated" to a metres pace, mixing with the yards display. Fixed: **distance is fed in the display unit** (yards → "1203 yards") and the prompt carries a hard **UNIT-CONSISTENCY rule** (every distance/pace in the display unit; never convert to or mention the other unit; pool's physical length excepted). Also caught the LLM **inventing a derived stat** ("≈26 lengths", wrong — actual 22, from mixed-unit math) → added a **NO-INVENTED-MATH rule** (state only given metrics; no estimated lengths/strokes/calories/per-minute rates). Re-verified: "The swimmer covered **1203 yards** in 24 minutes at an average pace of **2:00 per 100 yards**…" — yards throughout, no metres leak, no invented counts. This is the Q-059 unit question landing pragmatically: the narrative inherits the rest of the swim UI's unit (yards here); the canonical-unit decision stays Q-059.

---

## D-168 — Swim narrative: second-person voice + build around the data swim actually has (HR, RPE/feel, work:rest)

- **Date:** 2026-06-16
- **Context:** post-D-167 the swim narrative was clean but **third-person** ("The swimmer covered…") — mismatched the run/ride COACHING voice ("You held…") — and **thin**, because it leaned on the little data swim has (distance/pace) and ignored two strong signals it DOES have.
- **(1) Voice → second person:** prompt + system message now require "you" ("You covered…", "Your heart rate…"), matching the other analyzers. No more "the swimmer".
- **(2) Lean into available data** (swim has no power/GPS/per-length, so use what it has):
  - **Heart rate** (already stored) — prompt directs it to characterize the effort (aerobic control / how hard), the way the ride narrative uses power/HR.
  - **RPE + feel** (D-162 post-swim popup, `workouts.rpe` / `workouts.feeling`) — added to the analyzer SELECT + prompt as the swimmer's OWN read, swim's best subjective signal (the equivalent of the ride's power data). Woven in: "…at RPE 3, feeling good."
  - **Work:rest split** — moving (24 min) vs elapsed (35 min) = ~11 min rest, threaded into the prompt as a real signal. **Honesty discipline:** observe the pattern ("24 min of work across a 35-min session"), never diagnose WHY (don't claim the sets were hard / rest was deliberate / it was a technique session) — same restraint as the adherence bridge.
- **Verified (real recompute, June 15 swim):** "**You covered 1203 yards** … at **2:00 per 100 yards** … average of **119 bpm** … **roughly 11 minutes of rest** across the 35-minute total … **You rated the effort as RPE 3** … and **felt good**…" — second person, all signals, observes rest without diagnosing.
- **Scope:** narrative only — no prescription. **DEPLOYS** `analyze-swim-workout` (workout-detail already serves the narrative). The data was already captured (D-162); D-168 just threads it into the prompt.

---

## D-172 — Connections swim source matrix + honest framing (+ manual escape hatch)

- **Date:** 2026-06-16
- **Context:** swim data richness is entirely source-dependent and the source landscape is messy (Strava gated at 10 users → can't scale; Garmin the only LIVE rich source; Apple Watch in-place-but-untested; FORM only thin-via-Strava or modest-via-Apple-Health). Rather than hide it, make it legible — turn the weak data story into a trust moment.
- **Source matrix (`SwimSourceMatrix`, in Connections — Phase 1, display-only, SHIPPED):** a warm one-liner + five honest rows showing what each source actually gives. Reads connected state (garmin/strava/HealthKit) from Connections. **No source overstated.**
- **⚠ FORM honesty correction (load-bearing):** "FORM via Apple Health" is a **MODEST** bump — pool length + total stroke count + seconds-duration (→ session-average SWOLF at best) — **NOT "rich."** FORM keeps per-length splits/SWOLF in its own app; it does NOT export them to HealthKit. The genuinely rich AUTOMATIC path is **Apple Watch** (native per-length). ⇒ Q-060's payoff is smaller than "rich" implied; don't oversell it. FORM's real value = in-pool HUD + stroke-type accuracy.
- **Decisions:** (1) pending labels = **honest hybrid, truthful per-source** — Apple Watch "Needs testing" (integration exists, rides the D-157 HealthKit sync), FORM-via-Apple-Health "coming soon" (ingest unbuilt; never a connect-button-that-does-nothing). (2) FORM = **one entry**, corrected value, points to Apple Health as the somewhat-better pipe.
- **Tier-derivation function (D-169, verified):** `src/lib/swim-source-tier.ts` `deriveSwimTier()` — pure single-source (badge + tier + `isFormViaStrava` nudge flag), verified against all 24 real swims (10 Strava·basic / 12 Garmin·full / 2 Garmin·basic — honest gating: Garmin swims lacking a lengths count correctly read basic) + synthetic manual/healthkit/merged cases. Not yet wired to the card badge (next).
- **Still open under D-172:** the **manual swim escape hatch** (item 4) — a dead-simple COMPLETED-swim entry from the planned screen (distance + time, pool optional; `source='manual'`, reuses the D-162 popup for enrichment). Distinct from `WorkoutBuilder` (which makes *planned* workouts). Deferred to a focused pass — a completed-workout insert deserves care, not a tail-of-session rush. And the **card badge wiring** + the **FORM→Apple nudge** (Phase 1) on the swim card.
- **Scope:** display-only — no prescription, no ingest. `npm run build` clean. SPEC: `SPEC-swim-source-tiers.md` (strategic context + matrix + FORM correction + manual hatch). Phase 2 (Q-060 HealthKit ingest + 60s merge) remains the follow-on, now justified by SWOLF + no-doubles.
- **D-172 continued (Connections polish + dedup reconciliation):**
  - **Matrix moved** below the account cards + source preference (was leading the whole screen); now sits *with* the toggles.
  - **FORM row tightened** — one clean line ("via Apple Health: +pool, strokes (soon) · via Strava: basic"), no status chip (was wrapping into a tall narrow column).
  - **Dedup verified in code (the real fix):** source preference IS enforced at ingest (`strava-webhook` skips on pref=garmin; `garmin-webhook` skips on pref=strava) AND all swim ingests route through `ingest-activity` where `mergeSameSwimIfExists` reconciles same-swim cross-source. **Matrix and Source Preference don't contradict** — informs / chooses / protects. **Residual gap flagged:** the 60s merge window can miss when Strava's integer-minute start differs >60s from Garmin's → double (Q-060-area fix).
  - **"Richest data" = three layers** (matrix informs · preference chooses · merge protects) — documented in the SPEC.
  - **Dedup wording scoped honestly** — replaced the full no-duplicates promise with "…we aim to keep it to one — pick your source above. (FORM + Apple Health merge coming soon.)" — the HealthKit merge is Q-060-gated, framed as coming not done.
  - **Still open:** manual swim entry (item 4) + card badge wiring + FORM→Apple nudge.

---

## D-174 — Manual swim entry (the courtesy escape hatch) — SHIPPED

- **Date:** 2026-06-16
- **Context:** the swim matrix's "Log on planned session screen" badge advertised a manual entry that didn't exist yet — build it. The priority of the D-172 follow-ups.
- **What:** `ManualSwimEntry` — a dead-simple one-screen modal (distance + yd/m toggle, time mm:ss, optional pool selector, date). Inserts a **COMPLETED** swim (`type='swim', source='manual', workout_status='completed'`, distance km, `moving_time`/`elapsed_time`/`duration` in minutes — the swim storage convention; pool → `pool_length_m`+`pool_unit`+`user_corrected_pool_length_m`+derived `number_of_active_lengths`). Routed from `LogFAB`'s existing "Log Swim" option (was falling through to `WorkoutBuilder`, the full *planned* builder) via `handleSelectEffortType` `log-swim` → `ManualSwimEntry`.
- **Processing:** a direct insert doesn't fire the ingest fan-out, so after insert it invokes `recompute-workout` (user JWT, fire-and-forget) → compute-facts/summary + analyze-swim-workout populate so the Performance/Details tabs render. The D-162 post-workout popup then handles optional RPE/feel/equipment (the swim is completed + rpe-null → it fires). Badge reads `Manual` (`deriveSwimTier`).
- **Scope:** courtesy-tier, one screen — NOT a full logger. Client + a recompute invoke; `npm run build` clean. Verify on device: LogFAB → Log Swim → enter 1200 yd / 24:00 / 50 m → appears in the week, Performance tab populates, badge "Manual".

## D-173 — Garmin per-discipline swim override — SHIPPED

- **Date:** 2026-06-16
- **Badge bug fixed:** the matrix's Garmin badge read "Connect" despite Garmin being connected — it keyed off the separate `garminConnected` state while Strava used the reliable `connections` array. Now `garminConnected || connections.find(garmin)?.connected`.
- **The override:** a "Use Garmin for swim data" toggle in the matrix (off by default, shown when Garmin connected) → a Strava-global user pulls **swims** from Garmin (full: splits/strokes/SWOLF/rest) while runs/rides stay on the global source. Stored in `users.preferences.swim_source_override` ('garmin' | null) — the SAME table the webhooks read. The Garmin badge reads "Swim source" when on.
- **Webhook routing (deployed, fallback-safe):**
  - `strava-webhook` (both handlers): the existing fallback-aware garmin-pref skip now also fires for swims when the override is on — `if (sourcePreference === 'garmin' || (swimOverride === 'garmin' && isSwim))`. Reusing that tested path means a Strava swim is dropped **only when Garmin actually has it** (existence-checked) — never lost; worst case a transient double, not a loss.
  - `garmin-webhook-activities` (both handlers): the strava-only skip now EXEMPTS swims when the override is on — `if (pref === 'strava' && !(swimOverride === 'garmin' && isSwim))` — so the Garmin swim ingests for override users.
- **⚠ Verification owed:** I can't simulate a dual-source (Garmin+Strava) swim here. The edits are scoped to swims + the opt-in override and reuse the existing existence-check fallback, so blast radius is limited (worst case a double, never a lost swim, never affects runs/rides/non-override users). Verify with a real swim recorded on both Garmin + FORM→Strava: with the toggle ON → one swim, source Garmin, full data; toggle OFF → behaves as before.
- **Scope:** client toggle + 2 webhooks (deployed `yyriamwvtvzlkumqrvpm`). Build clean.

---

## D-176 — Work:rest as the universal swim signal (session readout + rest-fraction trend) — NEXT SESSION

- **Date filed:** 2026-06-16 (design recorded; build is next-session, after today's close)
- **The insight:** do NOT reconstruct per-interval rest (needs per-length data, unreliable across sources). Use the **SESSION-LEVEL work:rest ratio** — total elapsed (pool duration) − moving time — as the universal rest tell. **It's the ONE rest signal that survives every source:** Strava, Garmin, and Apple Watch ALL carry both moving + elapsed. So it works for every swim regardless of pipe — including thin Strava swims and Apple Watch swims that haven't come through Q-060. Computable TODAY, no Q-060 dependency.
- **Two layers:**
  1. **Session readout (card):** surface work:rest on the swim card/Details — e.g. "Work 24:00 · Rest 11:00" or a rest-fraction readout (24:00 moving / 35:00 elapsed = ~31% recovering). The D-168 narrative already uses it; this backs it with a real surfaced metric. **Single-source it** (shared fn, same discipline as `swimPacePer100Seconds` — don't recompute in multiple places).
  2. **Rest-fraction TREND (the part that lands for the hybrid athlete):** track the rest fraction over time, same-source, comparison-to-self. The progress signal for a non-elite swimmer grinding yardage isn't pace or SWOLF — it's **"I'm resting less to cover the same distance"**: moving time creeping toward total duration across a block at similar yardage = real, felt improvement ("your moving time is taking up more of your pool session" / shrinking rest fraction).
- **Honest constraints:** trend ONLY within comparable sessions (similar distance/intent — don't compare a sprint set to a long aerobic swim); needs **same-source consistency** (moving/elapsed definitions differ slightly across Strava/Garmin/Watch — note it); **observe the trend, don't diagnose the cause** (high rest on a technique/drill session is normal; high rest on a threshold session may mean taxing sets — same restraint as the adherence bridge). Keep it a quiet, legible read — NOT a whole analytics surface.
- **Why it's the right swim progress signal:** it's for the hybrid athlete (not the swim-first specialist chasing stroke mechanics).

---

## D-177 — Swim narrative INTERPRETS (RPE×HR coherence + work:rest context), honest downward read

- **Date:** 2026-06-16
- **Context:** post-D-168 the narrative had all the signals (RPE/feel, HR, work:rest — already in the analyzer's workout-row input, confirmed; no fact-packet threading needed) but **recited** them. Make it reason from the RELATIONSHIP.
- **Prompt change (analyze-swim-workout — no new data):** replaced the "build around the data / observe-only" rules with INTERPRET rules: (1) reason from how RPE, HR, pace, work:rest fit together, don't list; (2) **RPE×HR coherence** — low RPE + controlled HR = genuinely easy; low RPE + ELEVATED HR, or high RPE at modest pace = a harder day than the numbers alone suggest, say so; the read **may slide DOWNWARD** when the signals point to a grind — do NOT force positivity or default to "comfortable aerobic"; (3) **work:rest as effort context** — high rest fraction = more recovery, read against session intent (unremarkable on technique/easy, "effort being managed" on a moderate aerobic set). **Honesty preserved:** interpret the relationship/coherence, never diagnose the CAUSE.
- **Verified (real recompute):** "…a 2:00 per 100 yard pace with average HR 119, which aligns well with your reported RPE of 3 — this was a genuinely easy aerobic session… roughly one-third of the session was recovery, which kept the overall intensity low…" — interprets, second person, unit-consistent, no cause-diagnosis. (This swim's signals are coherent-easy so the read is "easy"; the downward path fires only on incoherent data.)
- **Scope:** narrative only. **DEPLOYS** `analyze-swim-workout` (workout-detail already serves it). Same single-source/voice/unit rules as D-167/D-168.

---

## D-178 — Manual swim whole-app awareness: verified source-agnostic + fixed the stale-snapshot gap

- **Date:** 2026-06-16
- **Verification (read-only trace — "does a `source='manual'` swim reach every state consumer?"):**
  - **No source filter excludes manual** anywhere in the completed-workout consumers (get-week, compute-facts, compute-snapshot, athlete-snapshot, state-trend, workload). The snapshot's `ActualSession` type explicitly lists `source: 'strava' | 'garmin' | 'manual'` — manual is first-class.
  - **Week view / calendar:** `get-week` reads workouts live, no source filter → ✓.
  - **Load / volume:** `workload.ts` computes swim load from **duration** with intensity from RPE (`mapRPEToIntensity`) or the swim default `0.75` when no HR → a manual swim (no HR) gets a **non-zero** load and counts → ✓.
  - **State screen:** `useStateTrends` assembles **live** client-side (`assembleStateTrends` over raw facts), not the cached snapshot → reflects the manual swim once compute-facts ran → ✓.
  - **`recompute-workout`** (which D-174's manual entry invokes) runs compute-workout-analysis → compute-facts → analyze-swim → writes workout_analysis + workout_facts (pace_per_100m) + session_load → ✓.
- **The gap found + FIXED:** a **direct insert + recompute did NOT refresh the cached `athlete_snapshot`** or invalidate the training caches the way the ingest fan-out does — so the **LOAD bar, coach, and the athlete-state spine** (all read the cached snapshot) stayed stale until the next real ingest. Fix: `recompute-workout` now, at its tail, invokes **`compute-snapshot`** (the workout's week) + **`invalidateUserTrainingCache`** (non-fatal). Benefits the manual swim AND **every** recompute (recompute changes facts that feed the snapshot; it should leave the app consistent).
- **Result:** "the entire app knows you did it" — calendar, load/volume, State (live), coach (cached, now refreshed), all source-agnostic consumers.
- **Scope:** server only (recompute-workout). **DEPLOYS** `recompute-workout`. Deno-valid (deploy clean). Verify on device: LogFAB → Log Swim → the swim shows in the week, the LOAD bar moves, the State swim card reflects it.

---

## D-179 — Swim narrative: work:rest promoted to FIRST-CLASS in the lead (was relegated to a trailing bullet)

- **Date:** 2026-06-16
- **Symptom:** the displayed INSIGHTS read "1203 yd at 2:00/100yd, HR 119, RPE 3 → genuinely easy" — the D-177 RPE×HR coherence landed, but the moving-vs-elapsed (work:rest) tell was absent from what the user saw, even though D-176/D-177 asked for it.
- **Root cause (NOT what was hypothesized — verified by reading the live narrative, not just the prompt):** work:rest was **already in the prompt input** (`workoutContext.{moving_min,elapsed_min,rest_min}`, fed at the "Work vs rest" line) AND the model was **already producing it** — but as **bullet 3**, the last/weakest of 3-4 separate observations. The displayed lead `session_state_v1.narrative.text` = `analysis.insights[0]` (build maps insights[0] → the headline), and nothing forced work:rest into that first observation, so the model spent the lead on pace+HR+RPE and appended a generic "substantial recovery fraction" read at the end. So the gap was **placement/prominence, not input threading** — the user's "maybe it was never threaded into the prompt input" hypothesis was checked and ruled out.
- **Fix (prompt-only, `analyze-swim-workout`):** two edits making work:rest first-class — (1) the WORK:REST rule now states it is a first-class signal that MUST be read on equal footing with RPE/HR/pace and **woven into the FIRST/opening observation**, not only a trailing bullet; (2) the closing instruction now requires the **first observation** to integrate every signal — RPE + HR + pace + work:rest — into one honest verdict ("do not save work:rest for last"). Kept the existing read-against-intent guidance (technique/drill → high rest unremarkable; sustained aerobic → effort managed) and the honesty discipline (observe the ratio, never diagnose the cause).
- **Verified (regenerated on the June 15 swim, real data):** the lead now reads "…HR 119 bpm and a reported RPE of just 3 out of 10, which aligns well with a controlled aerobic session. The work-to-rest ratio shows you spent 24 minutes actively swimming across a 35-minute window, meaning roughly one-third of your elapsed time was recovery, a pattern consistent with a structured set format rather than continuous swimming." → all three signals in the displayed headline; observes the pattern without diagnosing cause; unit-consistent; second-person.
- **Scope:** server only (prompt). **DEPLOYS** `analyze-swim-workout`. Note for future: because the displayed lead = `insights[0]`, any "this signal must show up" requirement has to land in the FIRST observation, not just "somewhere in the prompt" — a non-lead bullet may not render as prominently as the user reads "the narrative."

---

## D-182 — Swim pace + HR single-sourced to the RAW-column scalar across card AND narrative (computed.overall is not authoritative for swims)

- **Date:** 2026-06-16
- **Symptom:** same swim, two numbers — the Performance **card** showed Pace **3:03/100yd** + Avg HR **125**, while the **narrative** said **2:00** + **119**. The D-156/D-164/D-167 single-source divergence class, resurfaced cross-surface.
- **Root cause (confirmed by a read-only prod dump of the row, not asserted):** D-167 single-sourced pace *within* each surface (both call `swimPacePer100Seconds`) but the two surfaces fed it **different upstream layers**. Narrative read the raw `workouts` columns (`moving_time` 24 min → 1440s, `distance` 1.1 km → 1100 m, `avg_heart_rate` 119). Card (`session-detail/build.ts`) read `computed.overall` (`duration_s_moving` **2202s**, `avg_hr` **125**). `computed.overall.duration_s_moving = 2202s` is **larger than elapsed (2100s)** — physically impossible; moving cannot exceed elapsed. The sample-derived `computed.overall` layer is unreliable for swims — the exact Q-038 / D-156 lesson ("701:00 duration / 2263% adherence"). The raw provider-summary scalar (2:00 / 119) is authoritative.
- **Decision:** the **raw `workouts` columns are the authoritative swim scalar**; `computed.overall` (and `computed.analysis.swim`) are NOT for swims. Enforced via ONE shared resolver `_shared/swim/swim-scalars.ts` `resolveSwimScalars({moving_time, elapsed_time, distance, avg_heart_rate})` → `{movingSeconds, elapsedSeconds, distanceMeters, avgHr}` (handles the integer-minute storage convention; distance is km). **Both** surfaces now read swim pace + HR from this one path, so they can never re-diverge:
  - **Narrative** (`analyze-swim-workout`) — refactored to `resolveSwimScalars(workout)` (value-preserving; it already read the raw columns).
  - **Card** (`session-detail/build.ts`) — new optional input `completedSwimScalars`, populated in `workout-detail` from the raw row; swim pace/HR/distance/elapsed read it **swim-gated** (non-swims keep `computed.overall`, which is GPS-authoritative — do NOT touch run/ride).
  - **Details tab** (`workout-detail` `display_metrics`) — swim `durS`/`distM`/`avg_swim_pace_per_100m·yd` also swim-gated to the scalar (was preferring `computed.overall.duration_s_moving` + `computed.analysis.swim`, the same divergent layer).
- **Verified:** offline unit test against the REAL helpers (`scripts/_swim-scalars-test.mjs`) — raw row → moving 1440s, dist 1100 m, HR 119, pace **120s = 2:00/100yd** (all assertions PASS), and the `computed.overall` path reproduces the bug exactly (3:03 / 125). Narrative re-run post-deploy still reads 2:00 / 119 with the D-179 work:rest lead intact (refactor safe). Card re-renders on next open (workout-detail rebuilds `session_detail_v1` from the new `build.ts`).
- **Scope:** server only. **DEPLOYS** `workout-detail`, `analyze-swim-workout`, `analyze-cycling-workout` (the third bundles `build.ts`; its non-swim path is byte-for-byte unchanged — redeployed to keep the shared bundle current). The new `build.ts` input is optional → other importers (the shared barrel) stay backward-compatible.
- **Separate, NOT in this fix (Q-061):** even this now-correct blended pace is **fin-assisted** — finned drill sets pull it artificially fast. D-182 only makes the number right and consistent; the equipment exclusion/flagging is Q-061 (confirmed 0% built — `equipment_confirmed` has zero readers; see OPEN-QUESTIONS). Deliberately kept separate per the user's scoping split.

---

## D-183 — Swim narrative INTERPRETATION fix: HR read against the athlete's zones (avg, not peak) + fins flagged (direction-only)

- **Date:** 2026-06-16
- **Symptom (June 15 swim, `1c72ec75`):** the narrative manufactured RPE/HR tension that isn't there — "119 bpm with peaks near 152, working considerably harder than perceived… more taxing than the numbers imply" — and **never accounted for the fins** the card already flags ("· some sets with fins"). 119 avg HR is genuinely easy for this athlete (deep Zone 2); RPE 3 + 119 is **coherent-easy, not a conflict**.
- **Two root causes (bug 1):** (a) the prompt's RPE+HR rule primed "low RPE + ELEVATED HR = harder day", and the data line fed **avg + peak** with no athlete reference, so the LLM over-weighted the **peak (152)**; (b) HR was read in the **absolute** — no zones — so any double-digit-over-resting bpm could read as "elevated". **Bug 2:** `analyze-swim-workout` had **zero readers** of the captured equipment (`workout_metadata.swim_steps_equipment_confirmed` / `swim_equipment_unplanned`, D-162) — the analyzer was blind to it.
- **Decision:**
  - **Anchor HR to the athlete's own zones, read from the AVERAGE not the peak.** Fetch `user_baselines.{configured_hr_zones, learned_fitness}` and build zone bands the **same way the run analyzer does** (`configured_hr_zones.zones[]` → Friel %LTHR from `learned_fitness.run_threshold_hr` fallback). Classify the **avg** HR into Zone 1–5 (`recovery / easy aerobic / moderate aerobic / threshold / above threshold`) + an `easy = zone≤2` flag, and feed that + the threshold into the fact packet. Prompt rule rewritten: read effort from avg+zone, treat the peak as a **momentary high that does NOT define the session**, and **only** read "harder than the numbers suggest" when the **average** is genuinely elevated (Z3+). **Honesty floor:** when no zone/threshold is on file (`hrZoneCtx === null`), the prompt is told to **stay neutral** — never assert HR is elevated or easy without zones to judge by.
  - **Flag fin-assisted pace, direction-only.** Detect fins the **same way the Performance card does** (`MobileSummary`: `swim_steps_equipment_confirmed.used===true && /fin/` ∥ `swim_equipment_unplanned` contains fin) → `fins_used` into the packet. New EQUIPMENT prompt rule: when fins were used, note the pace "reads faster than your unaided swimming" in one plain clause; **NEVER quantify** (no per-set splits, no seconds-faster, no unaided-pace estimate).
- **Alternatives rejected:** (1) a swim-specific threshold HR — none exists; HR is cardiac, the run-derived threshold/zones are the athlete's best on-file anchor (swims read systematically lower, accepted; the guardrail doc `docs/SPEC-honest-swim-inference.md` Tier 2 makes this explicit — a run threshold is NOT a valid swim anchor, generic/neutral is safer than borrowing it). (2) Quantifying the fin pace correction — needs per-LENGTH pace (Q-038/Tier-B), and would assert precision we don't have. (3) Building the full Q-061 trend-level exclusion now — out of scope; this is narrative-only.
- **Verified (real recompute, `scripts/_d183-verify.mjs`, untracked):** athlete has **no `configured_hr_zones`** → fell back to `learned_fitness.run_threshold_hr=150` (low-confidence) → 119 classifies **Zone 2**. New narrative leads "**genuinely easy aerobic swim**, average heart rate sitting comfortably in **Zone 2** at 119 bpm against an RPE of 3/10… all three signals aligned"; explicitly de-weights the peak ("**brief … 152 bpm was a momentary spike and does not change the read**"); and flags fins ("average pace … is **flattered by fin-assisted sets**, so your true unaided swim speed reads faster"). Both bugs closed; no quantification leaked. `deno check` clean.
- **Scope:** narrative/interpretation only — **does NOT** touch the displayed pace number (still the D-182 blended scalar), the trend substrate (`compute-facts` `pace_per_100m`), or any prescription. **DEPLOYS** `analyze-swim-workout`.
- **Relation to Q-061:** this is the **narrative half** of the fins problem (honest flag in prose). The **trend-level exclusion / down-weighting** of finned pace (so the fitness signal isn't corrupted) is still **Q-061, unbuilt** — D-183 makes the displayed read honest, not the trend.
- **Guardrail on disk (hold LIFTED 2026-06-16):** the "Honest Swim Inference Boundaries" doc now lives at **`docs/SPEC-honest-swim-inference.md`** — it codifies exactly these fixes (Tier 2 zone-anchored HR + no-peak; equipment caveat direction-only; Tier 4 pace-trend honest only once fin-flagged). D-183 was scoped to two bugs while the doc was pending; **broader swim-narrative changes are now unblocked**, checked against that spec.

---

## D-184 — Dedup auto-imported swims against same-day MANUAL entries (manual noon-UTC timestamp defeated the ±60s merge)

- **Date:** 2026-06-16
- **Symptom / risk:** `mergeSameSwimIfExists` (`ingest-activity`) deduped same-swim-from-two-sources within a **±60s timestamp window** + ±10% distance. But a **manually-logged** swim (`ManualSwimEntry`) stores a **noon-UTC placeholder timestamp** (`${date}T12:00:00Z` — the athlete enters a date, not a time), so the ±60s window could **never** catch it. Net: an auto-import (Strava/Garmin/HealthKit) of a swim the athlete had also logged by hand **double-inserted** — one `manual` row, one device row. Surfaced while tracing whether a historical Strava import is safe (it funnels through the same `ingest-activity` merge gate); confirmed this hits **every new user who logs swims by hand and later imports their back-catalog**, not one migration.
- **Decision:** add a **second candidate path** — when the incoming swim has **no ±60s cross-device match**, fall back to matching a **same-`date` + ±10%-distance `source:'manual'`** row. On a manual match: **keep the manual row** (so its user-captured `rpe` / `feeling` / `user_corrected_pool_length_m` / `number_of_active_lengths` and the `workout_metadata` equipment — D-162 — all survive untouched), **upgrade its provenance** to the device source, adopt the **device-truth fields** (real `timestamp`, `distance`, `moving_time`, `elapsed_time` → honest work:rest where manual had `elapsed==moving`, `avg/max HR`), and **stamp the provider activity id** (`strava_activity_id` etc.) so a RE-import dedups via the partial unique index (idempotent). Never inserts a second row. The pre-existing ±60s HealthKit-enriches-kept-row path is unchanged.
- **Why keep-and-upgrade (vs. drop-incoming or insert-then-delete):** the manual row is the one carrying the athlete's subjective + pool capture (the whole point of the D-162 popup); the device row carries the objective truth. Keeping the manual row's id preserves those fields and any FK references with a single UPDATE, matching the existing merge philosophy (keep `match`, enrich, discard incoming, return early). Device values win for the objective fields because the manual entry's were estimates (single total time, no real rest).
- **Verified (guarded live test + cleanup, `scripts/_d184-verify.mjs`):** seed a `manual` swim (noon ts, rpe 4, pool 25, elapsed==moving) → ingest a synthetic Strava swim same-day, +2% distance, real moving≠elapsed → **1 row** (no dup), `source` manual→strava, `strava_activity_id` stamped, `timestamp` 07:00 (real), `elapsed_time` 30 ≠ `moving_time` 25 (real work:rest), `rpe`/`feeling`/`pool`/`lengths` **preserved**, HR adopted. **Repeat ingest → still 1 row** (idempotent). Test rows deleted after. `deno check` clean.
- **Scope / DEPLOYS `ingest-activity`.** Both the live webhook and historical import funnel through it, so both paths get the fix.
- **Known limitation (filed as Q-067, deliberately NOT built):** the REVERSE order — a device swim already exists, THEN the athlete logs the same swim manually — is NOT caught, because `ManualSwimEntry` does a **direct `.insert()`** that bypasses `ingest-activity`/the merge gate. Manual entry is for device-less swims, so this is the rare direction; left filed (Q-067), with a client-side pre-insert same-day check as the fix if it ever surfaces.
- **Cross-ref:** D-157/D-172 (the swim merge + "never a duplicate" guarantee D-184 hardens), D-162 (the user-captured fields it preserves), Q-066 (the SEPARATE non-swim duplication gap — historical import ignores source preference; runs/rides have no cross-source merge at all).

---

## D-180 — Swim rest-fraction norm model (DESIGNED, NOT BUILT)

- **Date filed:** 2026-06-16 (design recorded; build is a future session). Recorded after D-184 by recording order; the D-176/D-180/D-181 trio is the swim rest-fraction arc (number assigned earlier on the board).
- **Status:** **NOT BUILT — designed.** Landing spot for the next session; this captures the actual design, not just a name.
- **What it is:** give the **session-level rest fraction** (`rest = non-moving / elapsed`, single-sourced via `resolveSwimScalars` — the SAME scalar as D-176/D-182, never recomputed inline) an **expected band** so a swim can be read as in/below/above its norm. The band is keyed **PRIMARILY on session INTENTION** (the plan carries it — technique vs aerobic vs threshold vs sprint vs long-continuous), with a **light proficiency modifier** and a **very-light age modifier**. This is the model D-176's rest-fraction readout/trend is interpreted against.
- **Research-grounded bands (provisional — TUNE LATER, sign-off-gated like the trend thresholds):** technique/drill **~30–45%**, endurance/aerobic **~10–20%**, threshold **~20–35%**, speed/sprint **~30–50%**, long-continuous **~0–10%**.
- **Read logic (the honesty boundary is the whole point):** in-band → **unremarkable** (say nothing special); below band → **quietly positive** (less rest than expected for the intent); above band → **noted gently, NEVER diagnosed.** We CANNOT separate prescribed rest / equipment changes / wall-and-clock time / fatigue from one session-level number, so an above-band read describes the observation and stops — same honesty boundary as the inference doc. No cause attribution.
- **What it replaces / kills:** this is the honest successor to the **killed "structured set format" hallucination** (the analyzer inventing per-interval set structure it never had). It also continues the D-183 line — **no absolute-HR reads, no peak-driven reads** (HR is anchored to the athlete's zones from the average; the rest-fraction norm is the *effort-context* signal, not HR).
- **Depends on / relates to:** D-176 (the rest-fraction metric + trend this norms), D-183 (the HR/zone + fins honesty already shipped), `resolveSwimScalars` (the single source), the plan's session intention (band key). **Boundaries:** `docs/SPEC-honest-swim-inference.md` (on disk — authoritative for the never-diagnose line; this norm model's "above-band = noted, never diagnosed" IS Tier 2 work:rest + Hard Boundary #1).

---

## D-181 — Swim growth-reward convergence detector (DESIGNED, NOT BUILT)

- **Date filed:** 2026-06-16 (design recorded; build is a future session, AFTER Q-061). Recorded after D-184 by recording order.
- **Status:** **NOT BUILT — designed.** Landing spot for the next session.
- **Core principle — RECOGNITION ONLY, NEVER PENALTY:** a high-rest day always gets the neutral D-180 norm read, **never a scold.** The detector only ever ADDS a warm note; it never subtracts or criticizes.
- **What fires it (convergence, not a single metric):** a warm growth sentiment fires **ONLY** when recent **comparable** swims show convergence on ALL of: **rest fraction shrinking** (more moving, same/more yardage) **AND pace held or improved AND RPE held or lower** (RPE term **required when RPE is present**; when RPE is absent, lean on **rest-down + pace-held**). This is the **adult-onset progress signal** — "more swimming, less wall-hanging, and it felt easier" — and it's valuable PRECISELY BECAUSE there are no per-length splits to show mechanics; the convergence IS the visible progress.
- **Credibility gates (rare = trusted):** conservative threshold (N comparable sessions, sustained direction, a noise gate in the spirit of `classifyTrend`); **comparable sessions only** (same intent/distance bucket — don't cross a sprint set with a long aerobic swim); activates **only with enough history.** It should fire seldom and mean it.
- **Tone:** warm, specific, earned — NOT confetti, not a streak badge. One credible sentence.
- **Honesty:** credits the **observed convergence** only; **never claims mechanism** (no VO2, no physiology, no "your aerobic base improved"). Describes what the numbers did, not why.
- **⚠ DEPENDS ON Q-061 (hard dependency):** the pace term must read a **fin-flagged / fin-corrected** substrate. If Q-061 (fin exclusion from the trend substrate) is not done first, the reward can fire on **fin-inflated pace** — rewarding "growth" that is just more fin days. **Do not build D-181 before Q-061.**
- **Relates to:** D-180 (the rest-fraction norm it sits on), D-176 (rest-fraction trend), Q-061 (the fin-flagged substrate it requires), D-183 (the honesty line). **Boundaries:** `docs/SPEC-honest-swim-inference.md` (on disk — this reward IS Tier 4 "rest fraction shrinking at held pace + held/lower RPE = growth"; the Q-061 dependency IS Tier 4's "pace trend honest ONLY once fin-flagged"; the never-claim-mechanism rule IS Hard Boundary #5).

---

## D-185 — Run scalar resolver: one guarded source for run pace/HR across card, narrative, facts (continuity audit fix #1)

- **Date:** 2026-06-16
- **Fracture (continuity audit 2026-06-16, HALF 1):** run pace had THREE derivations — the **card** (`build.ts`) read the RAW `computed.overall.avg_pace_s_per_mi`; the **narrative** (fact packet) read the robust, guarded `resolveOverallPaceSecPerMi` (`_shared/fact-packet/pace-resolution.ts` — reconciles stored avg-pace vs distance+duration, rejects unit-corruption); **compute-facts** used a third, simpler `overall.avg_pace_s_per_mi × 0.6214 ?? raw` path. The swim-D-182 latent class for run: currently consistent (all trace to the same samples) but no single source, so it *could* drift — and the card read the LEAST-guarded value. Run had no resolver while ride (`rideComputedNp`) and swim (`resolveSwimScalars`) did.
- **Decision:** new `_shared/run/run-scalars.ts` `resolveRunScalars(workout)` — the ONE public entry + the ONE guard home for run pace/HR. It **delegates** to the established, narrative-trusted primitives (does NOT reimplement a 4th algorithm, which would re-introduce drift): pace ← `resolveOverallPaceSecPerMi`, HR ← `getOverallAvgHr` (the Q-054/D-112 zero-not-null guard: a literal 0 HR is MISSING, never propagated so it can't collapse a downstream GAP/effort-adjusted to 0). Authoritative layer = `computed.overall` (GPS-derived) per D-182's standing decision that non-swims keep computed.overall — **OPPOSITE order from swim** (which uses raw columns); raw columns are the fallback inside the delegated primitives.
  - **Consumers switched to the resolver:** card (`build.ts` reads `completedRunScalars` threaded from `workout-detail`, mirroring the swim `completedSwimScalars` wiring) + `compute-facts buildRunFacts` (pace+HR). The **narrative is unchanged** — it already calls `resolveOverallPaceSecPerMi`, the exact fn the resolver wraps, so card == narrative == facts by construction.
  - **GAP:** `resolveRunGap` read-through accessor — GAP is sample-derived (only the analyzer has it), so it NEVER recomputes and returns an HONEST null when no overall-GAP scalar is persisted ("make honest now, persist later" — chosen scope; do NOT fabricate from total elevation, the CompletedTab bug). Fixes the card's prior dead key (`avg_gap_s_per_mi` read where the summary wrote `gap_pace_s_per_mi`, always null).
  - **Decoupling:** already single-sourced (analyzer → `workout_analysis.heart_rate_summary`, D-036). `resolveRunDecoupling` read-through provided for the "one place reads run's signals" invariant; value-preserving, reads the same field.
- **Verified (real recompute, `scripts/_d185-verify.mjs`):** run facts `pace_avg_s_per_km` **418 → 418 unchanged**; 418 s/km ⇒ 673 s/mi == pre-fix card `computed.overall` 673 → **value-preserved** (single-source refactor, NOT a number-changer). Ride (`avg_power` 80 / NP 101) and swim (`pace_per_100m` 131) **unchanged** — no regression. Cross-surface identity is structural: card `completedRunScalars.paceSecPerMi` = `resolveOverallPaceSecPerMi`; narrative = same fn; facts = `round(same × 0.6214)`. `deno check`: my code clean (the +3 per file are pre-existing `_shared/fact-packet/queries.ts` `trend_points` errors, surfaced by the new import path, already shipped via the analyzer).
- **Scope / DEPLOYS `workout-detail` + `compute-facts`.** Narrative (`analyze-running-workout`) unchanged → no redeploy. Did NOT touch ride/swim/strength/the trend spine (confirmed unchanged). **Owed:** on-device `session_detail_v1` card render can't be built headlessly (needs a user session) — visual confirm owed, same caveat as D-182.
- **Continuity pass status:** fix #1 of 2. **Fix #2 (Details-tab `CompletedTab` consolidation) NOT started** — one at a time, per the working contract. Isolated items still out of scope (dead Epley Q-041, ride TSS not persisted, StrengthCompareTable re-sum, swim fin-blind Q-061) + run **overall-GAP persistence** (the D-185 fast-follow) remain noted in `AUDIT-continuity-2026-06-16.md`.

---

## D-186 — Details-tab (CompletedTab) consolidation: delete dead client recomputes; total-work stays client-side (server field is unit-buggy) — continuity audit fix #2

- **Date:** 2026-06-16
- **Goal (continuity audit fix #2):** enforce "smart server, dumb client — the client formats, never recomputes" on `src/components/CompletedTab.tsx` (the Details tab), the audit's flagged "biggest client-recompute" surface (GAP/VAM/SWOLF/swim-sets/total-work).
- **Map-first finding (the violation was smaller than the audit implied):** CompletedTab already consumes the server contract **`display_metrics`** (built by `workout-detail:1492`, *preferred* by `useWorkoutData:39`) for pace/HR/power/NP/IF/VI/swim-pace/distance/elevation/calories — those are **already server-sourced** (clean). The actual recomputes broke down as: GAP + VAM functions = **DEAD CODE** (defined, zero call sites); swim cluster (SWOLF / set-detection / strokes / pool-length / 100m-splits) + workout-level VAM = **NO server source**; total-work = a server field exists but is **unit-buggy**.
- **Decision (Option 1 "tight", Michael 2026-06-16):**
  - **Deleted the two dead functions** `calculateRunningVAM` + `calculateGradeAdjustedPace` (the latter a client GAP with its own 1.2/0.8 Strava-approx coefficients). Verified **zero call sites** → display-neutral; `tsc` error count unchanged (7→7, all pre-existing). GAP's authoritative source is the server (`session_detail_v1.completed_totals.avg_gap_s_per_mi` / the D-185 run resolver); the client must never re-derive it.
  - **Did NOT plumb `session_detail_v1` into CompletedTab** (rejected Option 2): `display_metrics` is already server-sourced and consistent, so re-routing the scalar reads would be busywork with no display change.
  - **Did NOT migrate total-work** — and this is the load-bearing honesty call. The "server source" `display_metrics.work_kj` is **unit-buggy**: `workout-detail:1489` sets it to `total_work` **without ÷1000**, but FIT `total_work` is **JOULES** (which is exactly why the client `calculateTotalWork` divides by 1000). So the server field is **1000× too big**; the **client calc is the correct one**. Migrating onto it would *introduce* a 1000× error and regress the dev user (null `total_work`) to N/A. Per the honest-blank discipline, the client calc **stays** (value-preserving); the server fix is filed (Q-068), not faked.
  - **Documented honest exceptions** (no usable server source — client-side by necessity): the swim cluster, workout-level VAM, and total-work. Marked in `AUDIT-continuity-2026-06-16.md`.
  - **Filed Q-068** to server-compute the swim display metrics + workout-level VAM + fix the `work_kj` unit (Option 3 — a real feature build, out of "stay tight" scope) so the Details tab can eventually read instead of recompute.
- **Verified:** dead code gone, zero remaining references, `tsc` error delta 0 (display-neutral); total-work display preserved (client calc retained, including the `avg_power × duration` fallback the dev user relies on since `total_work` is null). Client-only change — no edge deploy; Netlify auto-deploys on push.
- **Scope:** Details-tab only. Did NOT touch the D-185 run resolver, ride/swim/strength single-sources, or the trend spine (confirmed unchanged). Isolated items (Q-041 dead Epley, ride TSS, StrengthCompareTable, Q-061) remain out of scope.
- **Continuity pass COMPLETE:** D-185 (run resolver) + D-186 (Details consolidation) close the two structural fractures from the continuity audit. Remaining work is filed (Q-068 server-compute; run overall-GAP persistence; the isolated items) — see `AUDIT-continuity-2026-06-16.md`.

---

## D-187 — Shared narrative-reasoning core + RUN migration (continuity leg #3: reasoning)

- **Date:** 2026-06-16
- **What:** built `_shared/narrative-core/` — the shared 7-rule SCAFFOLD + the shared VALIDATOR SUITE, single-sourced and parameterized by per-discipline ADAPTERS (no `if discipline ==` monolith). Migrated RUN onto it (first of four). This is the same invariant as D-185/D-186 applied to *reasoning* instead of *numbers*. Standard: `SPEC-universal-narrative-inference.md`; plan: `WORK-ORDER-narrative-core.md`.
- **The core:**
  - **Scaffold** (`scaffold.ts buildReasoningScaffold(adapter, packet)`): the SAME 7-rule block for every discipline, with three adapter-driven inserts — Rule 1 lead-signals (+ this-session notables), Rule 2 atypical-signals-to-reconcile, Rule 4 established-cause allowlist — + the discipline addendum. INJECTED into each analyzer's existing prompt (run: appended to the sectional `COACHING_SYSTEM_PROMPT`); **prompt assembly NOT unified** (work-order guardrail #1).
  - **Validators** (`validate.ts validateNarrative(summary, ctx)`): `noNewNumbers`(existing, kept) + the NEW shared backstops — `noContradiction` (Rule 2: steady/easy claim while an atypical signal is unreconciled), `groundedDirection`/single-session-readiness (Rule 5), `anchorlessEffort` (Rule 3), `noCauseDiagnosis` (Rule 4). Lexical-deterministic, driven entirely by the adapter-built `NarrativeContext` (no discipline knowledge in the core). Folded into the run path's existing 2-attempt loop, retry-then-soft-accept (never regresses to no-narrative; the scaffold is the primary fix).
  - **Adapter** (`adapters/run.ts`): translates the run `FactPacketV1` → `{notableLeadSignals, atypicalSignals, anchors, hasTrendField, establishedCauses}`. The ONLY run-aware code. leadSignals = `pace + grade/terrain + heat + HR drift`.
- **RUN target (the captured triad, before→after verified on real data):** (1) **heat-silo** — `weather.temperature_f` was in the packet but the narrative dropped it on hot runs (the swim "captured-but-unconsumed-data" pattern again); (2) **"steady" over elevated+UNDECOMPOSED drift** (Apr 19: 35 bpm raw / 12% decoupling / null pace-normalized); (3) **single-session readiness verdict** ("signaling you're ready", "aerobic base is holding"). After: 82°F now reasoned with terrain+drift; the 35 bpm drift acknowledged ("rather than a fitness concern") not called steady; readiness verdicts gone. **Validators PASS on the regenerated output.**
- **Calibration / acceptance gate:** the core's validators were proven against the **swim reference FIRST** — swim's compliant narrative must PASS (no false positives) before run goes through; it does. And the atypical-drift detection is decomposed-aware: a high RAW drift the analyzer already attributes to pace/terrain (low pace-normalized — May 31) is NOT flagged (no false contradiction); only undecomposed/elevated drift is (Apr 19). **Bug found + fixed during calibration (ironic, same class I've been chasing):** the adapter's `num()` helper treated `null` as `0` (`Number(null)===0`), so `pace_normalized_drift_bpm: null` read as `0` and took the "explained" branch — the zero-not-null class (D-112/Q-054). Fixed to null-guard first.
- **Verified:** swim acceptance gate green; run before/after on 3 real hilly/hot runs (heat enters, drift acknowledged, readiness gone, validators pass); `deno check` clean on the core (the 4 ai-summary.ts errors are pre-existing, none reference the new symbols). **DEPLOYS `analyze-running-workout`.**
- **Scope / guardrails honored:** Option-1 (no prompt-assembly unification); BOTH scaffold AND validators; single-source the LOGIC (one scaffold + one validator suite, thin adapters). Did NOT touch ride/swim/strength paths or the D-185/D-186 number resolvers.
- **NEXT (per work order):** RIDE (no-regression case — swap its bespoke validators for the shared suite, prove byte-similar), then STRENGTH (wire canonical `exercise_log.estimated_1rm` into its packet FIRST — pure wiring, no schema — then migrate), then SWIM last (reference; complete the Q-061 kick/drill pessimistic-direction flag through the core).

---

## D-188 — RIDE migration onto the shared narrative core (the no-regression case)

- **Date:** 2026-06-16
- **What:** migrated RIDE onto `_shared/narrative-core/` (2nd of 4, after run D-187). Ride was the **no-regression** case — it already has the strongest bespoke validators, so the goal was to **absorb an already-compliant discipline without degrading it**, the reasoning analog of D-185's "418 unchanged." Built `adapters/ride.ts`; appended the scaffold to ride's existing prompt (assembly NOT unified) + folded `validateNarrative` into ride's loop. Ride keeps its DISCIPLINE-SPECIFIC bespoke validators (jargon ban, lede-frame) — those are addendum concerns, correctly OUTSIDE the universal suite; the shared suite covers the universal rules.
- **Result (verified on 4 real rides, before→after):** **PARITY clean** — the shared validators do NOT false-positive on any of the 4 compliant BEFORE narratives, and all 4 AFTER narratives pass. **Value preserved** — same NP-watts lede, same intensity read, same facts, power-truth + HR-secondary + structured-mode (D-092/D-093) intact (one even improved to "held the 140 W sweet-spot target"). The text was **reworded** (40–64% word-overlap, not byte-identical) — expected for an LLM narrative + an appended scaffold; substance unchanged, not degradation.
- **Two refinements the ride leg surfaced (the "investigate before shipping" paid off — wiring ride IMPROVED the shared suite):**
  1. **Rule 5 split (readiness / fitness-state / direction).** Ride legitimately says "fitness is building" when grounded by its **spine `cross_workout.trend`** (a real fitness verdict — terrain-matched 20-min power, staleness-gated); run's "aerobic base is holding" is a single-session verdict with no fitness-grade trend. A single Rule-5 check would either regress ride (block the grounded claim) or regress run (allow the ungrounded one). Fixed by adding **`hasFitnessTrend`** to the adapter context: READINESS ("you're ready") always fires; FITNESS-STATE ("fitness is holding/building") fires unless `hasFitnessTrend`; DIRECTION (improving/declining) fires unless `hasTrendField`. The **adapter** decides per discipline (ride true, run/swim false) — no discipline branch in the validator. Re-verified: run's "aerobic base is holding" still caught, ride's grounded "fitness is building" now allowed.
  2. **`noCauseDiagnosis` hedge-guard.** It false-fired on ride's honest "rolling climbs **likely** drove the surges" — the allowed plausible-contributor framing (Rule 4 permits hedged attribution). Added a hedge-guard (likely/probably/may/might/seems/suggests/partly within 28 chars before the causal connective → don't fire). This also **reduces forced retries** (the false-fire was forcing a retry, contributing to the rewording drift) — so the fix improves correctness AND no-regression.
- **Guardrails honored:** Option-1 (no prompt-assembly unification — scaffold appended like run); BOTH scaffold + validators; single-source the logic (the Rule-5 + hedge fixes live in the ONE shared validator, inherited by all four). Swim acceptance gate still green; run triad still caught after the validate.ts changes (unit-verified).
- **DEPLOYS `analyze-cycling-workout` + `analyze-running-workout`** (the latter re-deployed because `validate.ts` changed — run behavior unchanged, re-verified).
- **NEXT:** STRENGTH — wire canonical `exercise_log.estimated_1rm` into `strength_fact_packet_v1` FIRST (pure wiring, schema-confirmed-existing), then migrate; `establishedCauses: []` kills its "lower energy may have impacted" causal framing. Then SWIM last (reference; complete the Q-061 kick/drill pessimistic-direction flag through the core).

---

## D-189 — STRENGTH migration onto the shared narrative core (+ canonical e1RM packet wiring)

- **Date:** 2026-06-16
- **What:** migrated STRENGTH onto `_shared/narrative-core/` (3rd of 4). Two parts: a **data prerequisite** (wire canonical e1RM) then the migration.
- **Prerequisite — canonical e1RM wiring (fixes the rule-6 fabrication vector):** the strength narrative prompt listed "estimated-1RM trend" as an S2 option, but the packet carried NO e1RM — it read raw `workout.strength_exercises`, never `exercise_log.estimated_1rm`. So any e1RM the LLM mentioned was **fabricated**. New `getE1rmTrend(supabase, userId, workoutId, date)` reads the canonical `exercise_log.estimated_1rm` (`brzycki1RM → exercise_log`, the clean single-source written by compute-facts) — current session's e1RM per lift + the most recent PRIOR session → a per-exercise trend (up/flat/down, 2.5 lb dead-band). **No schema** (column pre-existing, confirmed). Fed into the narrative's user message as an explicit block ("use ONLY these; when no prior session, NO trend exists — do not claim one") so e1RM is real or absent, never invented.
- **Migration:** built `adapters/strength.ts` (`leadSignals=['RIR','load','e1RM-trend']`; `anchors.strength='e1rm-history'` and deliberately **no hr anchor** so endurance-framing imports trip `anchorlessEffort`; `establishedCauses:[]` so cause-of-missed-lift is never diagnosed; `hasFitnessTrend = a lift has a prior e1RM`). Appended the scaffold to strength's existing prompt and **added a 2-attempt validator loop — strength previously had NONE** (single call, no backstop). Extended the shared `FITNESS_STATE` regex with strength phrasings ("strength is building", "getting stronger").
- **Verified on 3 real strength sessions (before→after):** reads **real canonical e1RM** (matches `exercise_log`: bench 150, deadlift 120, …), **no fabricated e1RM**, **no endurance framing** (✅ none — HR/pace/zones absent), validators pass; the May-18 AFTER even dropped the BEFORE's looser "clear upward trend" framing. **Rule-5 lever confirmed:** a "getting stronger / strength is building" claim is **caught** with no e1RM trend (ungrounded_fitness_state + ungrounded_direction) and **allowed** when a per-exercise e1RM trend grounds it; an endurance HR-framing import is **caught** (anchorless_hr). Swim acceptance gate still green; run/ride unaffected.
- **Process note (transparency):** a stash-compare `mv` during type-checking corrupted the `narrative-core/` dir layout (files nested under a stray `nc-bak2/`); recovered, but the recovery first restored the stale committed versions of `validate.ts`/`index.ts` — the two D-189 edits to them (strength FITNESS_STATE phrasings + strengthAdapter export) were re-applied and the diff verified clean. The first strength deploy failed on the corruption; the post-recovery deploy succeeded.
- **Guardrails honored:** Option-1 (scaffold appended, assembly not unified); BOTH scaffold + validators; single-source the logic. **DEPLOYS `analyze-strength-workout`.** (Optional follow-up, not done: also surface `e1rm_by_exercise` in the stored `strength_fact_packet_v1` JSON for display parity — the narrative already consumes the canonical value, which is what fixes the fabrication.)
- **NEXT:** SWIM (leg 4, last of the session legs) — reference; complete the Q-061 kick/drill pessimistic-direction flag through the core. Then COACH (leg 5, week-scoped).

---

## D-190 — SWIM migration onto the shared core (the reference) + Q-061 kick/drill pessimistic flag

- **Date:** 2026-06-16
- **What:** migrated SWIM onto `_shared/narrative-core/` (4th and last of the session-scoped legs). Swim's inline honesty rules (D-167→D-183) were the SOURCE the 7 universal rules were extracted from — this brings its prompt onto the shared scaffold + validators like the other three, so it stops being a separate inline path. AND completes the **Q-061 narrative half, both directions** (the trend-substrate half stays in the held swim-cleanup work order).
- **Migration:** appended `buildReasoningScaffold(swimAdapter, …)` to swim's existing prompt (assembly NOT unified — guardrail #1; consistent with run/ride/strength), and added a **2-attempt validator loop — swim had none** (single call + Markdown-strip only). Swim is the reference, so the goal was preservation: verified on real swims the output is **unchanged in substance** — the June-15 narrative still leads with work:rest+HR+RPE reasoned TOGETHER (D-179), zone-anchored avg HR (D-183), coherent-easy, fins flagged. **Swim acceptance gate stays green AS the live path** (the core reproduces swim's compliant output — the proof the rules were right, now load-bearing).
- **Q-061 kick/drill pessimistic flag (the new behavior):** replaced the fins-only detection with **bidirectional equipment-direction** — fins/buoy/paddles → pace reads FASTER (optimistic, D-183); kick/kickboard/drill → pace reads SLOWER (pessimistic, NEW); snorkel ~neutral; both → pulled both ways, not a clean number. The shipped narrative previously flagged only the fins/optimistic direction.
- **The reliability mechanism (elegant, shared — not a swim patch):** equipment-when-present is set as a **notableLeadSignal** in the swim adapter, so the SHARED Rule-1 (`leadSignalCoverage`) validator REQUIRES the narrative to flag the direction — the exact mechanism that stops run dropping heat. First synthetic kick/drill draft OMITTED the slower flag (LLM discretion); with equipment as a notable signal, the validator caught the omission and the retry surfaced it. Verified (guarded synthetic kick/drill swim, created + deleted): narrative now flags SLOWER, never says faster. Real fins swim still flags faster; detection unit-checked (fins→FASTER, kick/drill→SLOWER, mixed→BOTH-WAYS, none→no flag).
- **Guardrails honored:** Option-1 (scaffold appended); BOTH scaffold + validators; single-source the logic (the equipment-direction enforcement rides the SHARED Rule-1 validator via the adapter, no swim-specific validator code). **DEPLOYS `analyze-swim-workout`.**
- **MILESTONE — the four session-scoped narrative legs are DONE:** run (D-187), ride (D-188), strength (D-189), swim (D-190). All four reason through ONE shared scaffold + validator suite, fed by per-discipline adapters. The per-path-in-a-vacuum era is over for session narratives. **Remaining:** COACH (leg 5, week/state-scoped — filed in the work order, not started) + the Q-061 **trend-substrate** exclusion (held swim-cleanup work order).

---

## D-191 — COACH migration onto the shared core (leg 5, the final narrative path) — consolidation complete

- **Date:** 2026-06-16
- **What:** migrated the COACH week-narrative prose (`generateCoaching` in `_shared/athlete-snapshot/coaching.ts`, shown on the State screen) onto `_shared/narrative-core/`. This is the 5th and final narrative path; with it, **all five paths reason through one shared scaffold + validator suite.** Distinct shape: **week/state-scoped**, not session-scoped — the coach adapter's context is built from the SPINE + week signals, not a single fact packet. **Numbers untouched** (`fitness_direction = rollupFitnessDirection(state_trends_v1)` stays the spine roll-up) — PROSE only.
- **Coach adapter** (`adapters/coach.ts`): context built from `{ fitness_direction, load_status, readiness_state, weekly_trends }` passed into `generateCoaching` via opts from `coach/index.ts` (where they're already computed). `leadSignals = ['readiness/load state','work done (incl. off-plan)','fitness direction']` (the credit-first opening). Scaffold appended to `COACHING_SYSTEM_PROMPT`; a 2-attempt validator loop added (coach was a single call with NO loop).
- **The two high-risk week-level levers:**
  - **Rule 5 (over-claim) — `hasFitnessTrend` pinned to the spine verdict.** A fitness-state claim ("building/holding/getting fitter") is grounded only by a DEFINITE single-direction spine verdict (improving/stable/declining); **'mixed' or none → NOT grounded → caught** (so a good single week can't read as "building" when the spine says mixed). The addendum PINS the direction to the verdict — the coach may only claim the direction the spine computed. "you're ready/primed/peaking" always caught. (Same lever as ride D-188 / strength D-189, at week scope.)
  - **Rule 4 (state-diagnosis) — `establishedCauses:[]` + a new shared `STATE_DIAGNOSIS` catch.** Unhedged "overreaching / overtrained / under-recovered / burnt out / detraining" is caught (hedge-aware via the shared `HEDGE` guard); the coach must OBSERVE the pattern ("load climbed while readiness dipped"). Generic (no discipline branch), confirmed safe for the four session analyzers (they don't use those terms; regression-checked).
  - **Rule 2 (contradiction) — conservative atypicalSignals:** fires only on a CLEAR concern (readiness fatigued/overreached AND load high), preserving the coach's credit-first voice (D-154) rather than nagging every fluctuation.
- **Folded in the coach's accumulated rules (D-154/D-155) — Option 1 (addendum + hard post-check):** D-154 (lead-with-state+credit; observation-never-prescription) and D-155 (describe-don't-prescribe) go into the coach addendum (scaffold). The **hard lexical 'add'-ban** stays as a coach-specific post-check wrapping `validateNarrative` (NOT in the shared suite — prescription-banning is coach-only; the four session analyzers legitimately give next-session guidance). The ban is **prescription-SHAPED** (`add a/another/one/more/extra/in [work]`), not a raw substring — "added load" / "add-on mobility" do not trip it (unit-verified). The deterministic load **headline** (D-154) stays deterministic (`coach:3343`, not LLM prose). Legacy fallback prose path (`coach:3578+`) is OUT of scope (degraded path; noted follow-up). `COACH_PAYLOAD_VERSION` bumped 44→45 to invalidate pre-migration cached narratives.
- **Verified:** coach unit test — Rule-5 (building+mixed→CATCH, building+improving→PASS, ready→CATCH), Rule-4 (overreaching unhedged→CATCH, hedged/observe→PASS), credit-first→PASS, add-ban prescription-shaped (no over-fire). Real week before/after: the athlete's current week is already compliant (credit-first, no over-claim) → migrated output **preserved it (no-regression), validators clean** — no real over-claim existed this week to gate, so the GATING is proven by the unit test against synthetic over-claims fed the real spine context (honest: same situation as ride's compliant case). Regression-checked: run triad + hedge + swim gate all still green after the `STATE_DIAGNOSIS`/`HEDGE` refactor. **DEPLOYS `coach`.**
- **🏁 NARRATIVE CONSOLIDATION COMPLETE — all five paths (run D-187 / ride D-188 / strength D-189 / swim D-190 / coach D-191) reason through ONE shared scaffold + validator suite, fed by per-discipline adapters.** The reasoning leg of the continuity invariant (after numbers D-185 / display D-186) is done across every narrative surface. Remaining narrative-adjacent items, all filed: coach legacy-fallback prose (follow-up), Q-061 trend-substrate exclusion (held swim-cleanup WO), the two held feature work orders (deviation-reason, swim-cleanup).

---

## D-192 — Two post-migration SWIM regressions caught on-device (fabricated equipment + rest-cause diagnosis) — fixed

- **Date:** 2026-06-16
- **Context (honesty):** D-190 declared swim "green," but two live bugs surfaced on-device AFTER it — the "swim green" claim predated them. Both are now fixed; the milestone is corrected to record them (see ENGINE-STATE).
- **Bug 1 — Rule 6 fabrication (priority):** the swim narrative said "fins, buoy, and paddles were in use" when only **fins + snorkel** were used. Root cause was in D-190's own code: the equipment prompt line literally read "fins/buoy/paddles on some sets" — it recited the **directional CATEGORY list** instead of the actual `swim_steps_equipment_confirmed` values, and the swim-adapter addendum + notableLeadSignal detail also named the category gear into the scaffold. The LLM recited the categories as fact. **Fix:** the analyzer now collects the ACTUAL equipment names (`equipmentDir.names`) and the prompt/addendum name ONLY those; the fast/slow grouping is explicitly INTERNAL direction-logic, never recited. **New swim post-check** (wraps `validateNarrative`, swim-specific like the coach add-ban): any equipment word in the prose must be a subset of the confirmed actuals → else retry.
- **Bug 2 — Rule 4 diagnose-cause:** "the substantial rest fraction… is consistent with a technique or mixed-intent structure rather than a sign of fatigue management" — diagnosed WHY the rest happened (swim SPEC hard-boundary #1, the killed "structured set format" hallucination). **Fix:** swim post-check `REST_CAUSE` catches the diagnose-the-why phrasings (technique/drill/mixed-intent structure, "fatigue management", "rather than fatigue", "structured set format") + strengthened prompt; the narrative may state the rest fraction + whether typical for a KNOWN planned intent, never assert what the rest WAS.
- **Verified (June 15 recompute):** narrative now names only "snorkel and fins" (no buoy/paddles), rest read as "typical for a sustained aerobic swim" with no cause/structure diagnosis. Swim acceptance gate green; `deno check` clean.
- **All-four cross-check (did the directional generalization introduce these elsewhere, or did any path lose a guard?):** **Class 1 (category-list-as-fact):** swim-specific — equipment is the only adapter input that's an enumerable set of physical items; run/ride/strength/coach addenda list signal TYPES (pace/HR/RIR/load/fitness-direction), nothing fabricable as "in use." **Class 2 (lost guard):** none — every migration APPENDED scaffold + validators; no bespoke guard was removed (run terrain/feeling/number validators, ride jargon/lede/grounded, coach add-ban all intact; strength had none). Swim's fins-only→bidirectional replacement was the sole guard-change and was exactly Bug 1's source, now fixed. **DEPLOYS `analyze-swim-workout`.**
- **Lesson:** a generalization (fins-only → directional categories) re-introduced a fabrication vector by putting an example LIST in prose-facing text. Category/example lists belong in INTERNAL logic, never in the model-facing prose; and "name only the actual data" needs a subset VALIDATOR, not just a prompt instruction.

---

## D-193 — Q-061 trend-substrate half: equipment/drill swims excluded from the swim pace trend (both directions) — built

- **Date:** 2026-06-17
- **Context:** D-190/D-192 made the swim NARRATIVE honestly flag equipment-distorted pace (both directions, on-device verified). The TREND-substrate half of Q-061 remained: `compute-facts.buildSwimFacts` wrote `pace_per_100m` equipment-blind, so fins/buoy/paddles (faster) and kick/drill (slower) sessions polluted the State-screen swim trend as if they were unaided fitness.
- **What was built (3 files, no migration, no client compute):**
  - New shared helper `_shared/swim/swim-equipment.ts` → `detectSwimEquipment(workout_metadata)` returns `{contaminated, direction, names}` from the D-162 capture (`swim_steps_equipment_confirmed[].used` + `swim_equipment_unplanned`). Regexes: optimistic `/fin|buoy|pull|paddle/`, pessimistic `/kick|board|drill|catch.?up|single.?arm|scull/`; snorkel neutral.
  - `compute-facts.buildSwimFacts` (index.ts:1260) now writes `swim_facts.pace_equipment_contaminated` + `pace_equipment_direction`. `pace_per_100m` itself is UNCHANGED (Details/narrative still show the real swim, honestly flagged per D-190/D-192) — only the trend excludes.
  - `compute-snapshot` (index.ts:~629) filters `pace_equipment_contaminated === true` rows out of `swimRows` before `assembleStateTrends`, logging the drop count.
- **Decision — EXCLUDE, not down-weight:** `classifyTrend` has no weighting hook; "unaided only" is the honest substrate. `swim_facts` is JSONB so no schema change. The narrative path was deliberately NOT rewired (its inline `equipmentDir`, analyze-swim:454-472, is now a duplicate of the shared helper — see follow-up).
- **Verified on real data (2026-06-17, user 45d122e7):** 10 in-window swims; the Jun-15 snorkel+fins swim flipped to `contaminated:true / optimistic` and dropped; the 9 unaided swims (all `false`) feed the trend. **Consequence (intended, surfaced):** that fin swim was the athlete's only swim in the last 16 days, so excluding it leaves the newest unaided point (Jun-1, 16d old) beyond the cadence-scaled swim freshness window → `classifyTrend` staleness gate (`classify.ts:90-95`) → swim trend decays to `needs_data`. This is the honest read ("no current unaided signal"), not a regression; reversible to down-weight if preferred. On-device confirm pending.
- **Deployed:** `compute-facts`, `compute-snapshot` (2026-06-17).
- **Follow-up (flagged, deferred):** the equipment-direction classification now lives in TWO places — the shared helper (trend) and analyze-swim's inline `equipmentDir` (narrative) — because this work order scoped out touching the on-device-verified narrative path. They MUST stay in sync; consolidating (analyze-swim imports the shared helper, deletes its inline block) is a future pass that re-verifies narrative output.

---

## D-194 — Work:rest as a swim signal: session card readout + rest-fraction trend (D-176) — built

- **Date:** 2026-06-17
- **Context:** D-176 design — for a hybrid/triathlete swimmer the progress signal isn't pace or SWOLF, it's "I'm resting less to cover the same distance." Work:rest (moving ÷ elapsed) was already in the swim narrative (D-179) but never surfaced as a metric or trended. This builds both layers. It's the one rest signal that survives every source (Strava/Garmin/Watch all carry moving + elapsed).
- **Layer 1 — card readout:** `session_detail_v1.completed_totals.swim_work_rest` — a preformatted `"Work 24:00 · Rest 11:00"` string built in `session-detail/build.ts` from `completedSwimScalars` (the SAME `resolveSwimScalars` source as pace/duration — never recomputed inline). Rendered on the swim card in `EnduranceIntervalTable` (the `completed_totals` consumer). Deployed via `workout-detail`.
- **Layer 2 — rest-fraction trend:**
  - `compute-facts.buildSwimFacts` persists `swim_facts.rest_fraction = (elapsed − moving)/elapsed` via `resolveSwimScalars` — which also brings the swim substrate ONTO the single source (the inline-pace inconsistency flagged in Q-061). Added `elapsed_time` to the `compute-facts` `WorkoutRow` + SELECT.
  - `state-trend/swim.ts` `swimRestToSeries` / `computeSwimRestState`: **comparable-session filter = swims within ±25% of the in-window MEDIAN distance** (don't compare a sprint set to a long aerobic swim); Q-061 contamination excluded upstream; same `classifyTrend` gates (min-session, staleness, dead-band); `lowerIsBetter` (shrinking rest = improving).
  - Cached as `state_trends_v1.swim.rest` (nested, mirroring bike power/efficiency); rendered as a quiet `· rest ↓ −X%` tag on the State swim row (`StatePerformanceSection`). `useStateTrends` exposes `swimRest`.
- **Decisions:** EXCLUDE (not down-weight) out-of-band/contaminated swims; ±25% distance band (intent isn't reliably stored for swims, so distance is the lever); `swim_facts` is JSONB → no schema change; card format is the human-readable time split, not a percentage (Michael's call).
- **Independent bug fix (Q-061 client parity):** the Q-061 contamination filter had landed only in `compute-snapshot`, NOT the client `useStateTrends` mirror — so the live STATE card could include contaminated swims while the cached snapshot excluded them (a single-source-guarantee drift). `useStateTrends` now applies the same filter. Real fix in its own right; see Q-061.
- **Verified on real data (2026-06-17, user 45d122e7):** `rest_fraction` persisted for all 10 in-window swims (0.25–0.44); Jun-15 fin swim excluded (Q-061); comparable-distance filter kept 4 of 9 (median 891m, band 668–1114); `state_trends_v1.swim.rest` populated. Verdict `needs_data` — honest (newest comparable point Jun-1, 16d old → staleness gate), same cause as pace. Layer-1 card confirmed at the data level: Jun-15 swim (moving 24m / elapsed 35m) → `"Work 24:00 · Rest 11:00"`. **On-device confirm pending** (client ships on merge).
- **Deployed:** `workout-detail`, `compute-facts`, `compute-snapshot` (2026-06-17). Client via Netlify on merge.
- **Source-consistency caveat (noted, not blocked):** moving/elapsed definitions differ slightly across Strava/Garmin/Watch; the trend is comparison-to-self and tolerant of this.

---

## D-195 — Swim rest-fraction NORM model: in/below/above-band read in the narrative (D-180) — built

- **Date:** 2026-06-17
- **Context:** D-176/D-194 surfaced rest fraction as a metric + trend. D-180 gives it meaning — an expected rest band per session type so the swim narrative can read a swim as in/below/above its norm. The honest successor to the killed "structured set format" hallucination.
- **Finding that changed the design (verified in DB, user 45d122e7):** the work order's stated intent source — `planned_workouts.session_type` / `hardness` — is **NULL on all 49 planned swims**; `intensity` is an empty `{}`. The intention signal that actually exists is in **tags** (`technique_swim`, `swim_drills`, `swim_maintenance`, `easy`, `aerobic`, `css_aerobic`, `quality`, `recovery_swim`). So intent is derived from tags. (Flagged as a discrepancy — the plan generator doesn't populate `session_type` for swims; see `99-SUMMARY §3`.)
- **What was built:**
  - New pure helper `_shared/swim/rest-norm.ts`: `swimIntentFromTags(tags)` + `restBandRead(restFraction, tags)`. Bands (provisional): technique 30–45%, speed 30–50%, threshold 20–35%, endurance/aerobic 10–20%, long-continuous 0–10%.
  - `analyze-swim-workout`: computes the band read from the SAME `resolveSwimScalars` scalar as pace/HR (never recomputed inline) + `plannedWorkout.tags`, and injects a one-line norm note into the narrative prompt next to the existing work:rest read. NOT a card metric — interpretive context for the narrative only.
- **Decisions (Michael):** intent from TAGS (the only populated source); **conflict rule = technique wins** (and more generally, the MORE PERMISSIVE/wider band when tags conflict) — a technique-tagged swim includes drill work, so the higher rest expectation applies; using the aerobic band on a technique session would risk a false "above band" read, the exact failure D-180 must avoid. No mapped tags → **silent** (no read), same as unplanned.
- **Honesty contract:** in_band → unremarkable (don't single out); below_band → quietly positive ("less rest than typical for this kind of session"); above_band → gentle observation only, **NEVER** a cause (one rest number can't separate prescribed rest / equipment / wall time / fatigue). Backstopped by the D-192 `REST_CAUSE` post-check.
- **Verified on real planned swims (2026-06-17):** 2026-06-15 (rest 31%, tags `technique_swim`+`swim_drills`+`easy`+`aerobic`) → technique wins → **in_band** [30–45%]; 2026-06-01 (rest 25%, technique tags) → **below_band**; untagged swims → **SILENT**. Re-ran the analyzer on the below_band swim — narrative read it as "rest is **modest** … carried **work density** … without extended recovery breaks," quietly positive with **no cause diagnosis**. **On-device confirm pending.**
- **Deployed:** `analyze-swim-workout` (2026-06-17).
- **Next:** D-181 (growth reward) depends on this — do NOT start until D-180 is confirmed on-device.

---

## D-196 — Swim workout delivery: FORM rest lines + Send to Apple Watch (WorkoutKit) + breakout equipment chip

- **Date:** 2026-06-17
- Three-item swim-delivery work order. Items 1 and 3 are TypeScript (verified, web build clean); item 2 is native Swift (first pass, **compile-pending in Xcode** — cannot be built in a headless session, per the D-175 framing).

**Item 1 — FORM Goggles rest lines (SHIPPED to main, 2026-06-17):**
- `src/utils/formGogglesSwimScript.ts` `compactRepeatedLines`: a repeated set with a per-rep rest now emits the work+rest pair once per rep (rest after every interval) instead of one trailing rest line. Rest seconds read from `computed.steps` (`restBetween` via `recoverySec`) — not hardcoded. Singles / no-rest repeats / warmup / cooldown unchanged. No `materialize-plan` change.
- Verified: 2026-06-19 Moderate Aerobic Swim — the 12×100 main now shows `21 sec rest` after each 100 yd. Shipped early (commit `15004624`) to unblock Friday.

**Item 2 — Send to Apple Watch via WorkoutKit (built, NOT yet merged — Xcode-pending):**
- New `ios/App/App/WorkoutKitPlugin.swift` (+ `.m` bridge) — Capacitor plugin (`CAPPlugin`/`CAPBridgedPlugin`, matches `WatchConnectivityPlugin`/`HealthKitPlugin` registration). `scheduleSwim` maps warmup/work/rest/cooldown `computed.steps` → a pool-swim `CustomWorkout` with `IntervalBlock`s (time-based rests; WorkoutKit can't do manual-advance), schedules via `WorkoutScheduler.shared`. Pool-swim only; `@available` iOS-17 guard (FLAGGED — version may need bumping vs the watchOS-11 target).
- Registered in `AppDelegate.swift` (guarded). New `src/services/workoutkit.ts` JS wrapper (mirrors `watchConnectivity.ts`). Handler wired in `TodaysEffort.tsx` + `StructuredPlannedView.tsx` (replaces the dead `handleSendToWatch` stub); button enabled (removed hard-disabled + "Coming soon (Q-062)"), gated on iOS + pool-swim, shown beside Send to Garmin.
- **On-device path — does NOT trust client `userId`** (the `send-workout-to-garmin` §1 item-11 flag is deliberately not inherited): no edge function, the client passes `computed.steps` straight to the on-device plugin.
- Blueprint reused (not rewritten): the `computed.steps`→warmup/work/rest/cooldown decomposition from `send-workout-to-garmin/index.ts:~619-760`.
- **COMPILE-RISK:** the WorkoutKit API surface (`CustomWorkout`/`IntervalBlock`/`IntervalStep`/`WorkoutGoal`/`WorkoutScheduler.schedule` signatures, `@available` versions, activity/location enums, pool-length attachment, capability/entitlement) is a first-pass guess — every spot is flagged inline with `COMPILE-RISK:` in `WorkoutKitPlugin.swift`. The Capacitor registration, JS wiring, and button gating match working project patterns. Must be compiled + on-device-verified in Xcode before merge.

**Item 3 — Breakout equipment chip (built, web build clean):**
- `src/components/StructuredPlannedView.tsx`: per-set swim equipment now renders as a distinct chip/badge instead of inline " with fins" text. Kept `lines: string[]` intact (so `handleDownloadWorkout` still serializes plain strings); equipment carried in a parallel `lineEquip` index→name map and rendered as a chip in the `<li>`. Drill-aware filtering preserved (it already gates `equip`). Presentation only — data path untouched.

- **Status:** item 1 merged + live; items 2 & 3 on branch `feat/d196-swim-delivery`, held from `main` until item 2 compiles in Xcode and the Watch send is confirmed on-device. Item 3 is web-verified and merges with the branch.

---

## D-197 — Per-set swim equipment assignment (`equipment_detail`) with read-time fallback

- **Date:** 2026-06-17
- **Context:** D-196 surfaced that equipment was session-level only (`swim_equipment_optional_suggested`); no step said *which sets* to use fins on, so FORM/breakout/Garmin (all per-step readers) had nothing to show. This assigns equipment per step from the drill name + session/step intent.
- **New shared module** `_shared/swim/swim-step-equipment.ts`: `resolveSwimStepEquipment(drillName, stepKind, sessionIntent) → { required: string[], optional: string[] }` (the work order's rule table — drills by keyword match, mains by intent; kick EXCEPTIONS like six-kick-switch/side-kick checked before the generic kick→kickboard rule). Plus `getStepEquipmentDetail(step)` (read-time accessor) and `formatStepEquipment`/`stepEquipmentLabel` (display: required bare, optional suffixed "(optional)").
- **Format:** new per-step `equipment_detail: { required, optional }` (object) ALONGSIDE the legacy `equipment` string (kept for back-compat). The work order's premise that the readers "pick it up automatically" was **false** — they expected a string — so all 3 readers were updated (flagged with Michael, agreed Option A).
- **No-rematerialize design (Michael's call):** readers **prefer** `equipment_detail`, and when it's absent (old plan data) **derive it at read-time** from the drill name + intensity (+ folding the legacy string in as optional). So existing plans get enriched display with no rematerialize; `materialize-plan` writes `equipment_detail` for new plans; both paths converge on the same output.
- **Files:** `materialize-plan` writes `equipment_detail` on drill + work steps (and copies it through the step out-builder); `formGogglesSwimScript.ts`, `StructuredPlannedView.tsx` (breakout chip), and `send-workout-to-garmin` (picks `required[0] || optional[0]` for the single Garmin `equipmentType`) all read via the shared helper. Session-level `swim_equipment_optional_suggested` unchanged.
- **Verified on Friday's swim (read-time fallback path, no rematerialize):** Catch-Up drill → "fins (optional), snorkel (optional)"; moderate main → "snorkel (optional)"; warmup/cooldown/recovery → none. Client build clean; `deno`-bundled deploy of `materialize-plan` + `send-workout-to-garmin` succeeded.
- **Final adjustment (Michael, 2026-06-17):** snorkel REMOVED from all main-set steps (easy/moderate/threshold/sprint all → no per-step equipment); snorkel stays optional on **drill** sets only. Per-set fins/kickboard/pull_buoy/paddles rules unchanged. Added one session-level brief line in the breakout for any swim that suggests snorkel: *"Snorkel: free on drills, occasional on main sets to reset form. Don't race-train on it."* Re-verified Friday's swim: Catch-Up drill → "fins (optional), snorkel (optional)"; moderate main → none.
- **Deployed:** `materialize-plan`, `send-workout-to-garmin` (2026-06-17). FORM/breakout ship with the client. **On-device confirm pending.**

---

## D-199 — Swim intensity = CSS-primary; swim HR un-anchored from run threshold (Layer A shipped)

- **Date:** 2026-06-17
- **Context:** The swim surface borrowed running's intensity model — the analyzer anchored swim HR to `run_threshold_hr` (and the generic run/max-derived `configured_hr_zones`), and the baselines UI rendered the run Friel %LTHR card + a per-mile run threshold pace on the swim tab. Swim HR runs ~10–15 bpm below run HR for the same effort (horizontal position, water cooling, smaller muscle mass; SPEC-honest-swim-inference), so a run anchor reads every swim as easier than it was — directionally wrong, not a shortcut. D-190/D-183 had already shipped zone-anchored swim HR, risking an analyzer/narrative contradiction.
- **Decision:** swim intensity is **CSS-primary** (Critical Swim Speed = swim analog of FTP; pace/100 is the verdict, HR demoted to soft context). Run-threshold-as-swim-anchor removed entirely. Discipline → native metric: Run → LTHR/pace, Cycle → FTP/power, **Swim → CSS/pace**.
- **Layer A (shipped this entry):**
  - `analyze-swim-workout`: removed the run-anchor `hrBands` builder + the `configured_hr_zones`/`learned_fitness` fetch that fed it → swim HR UNANCHORED → `hrZoneCtx` null → narrative neutral on HR. **Verified** by recomputing the canonical 119-bpm dev swim on the deployed fn: narrative reads HR via RPE+feel coherence and average-over-peak, ZERO run-threshold zone anchoring.
  - `TrainingBaselines.tsx`: the global HR Zones card (run+cycle rows on every tab) is now **per-active-sport** — Run→run only, Cycle→cycle only, Swim/Strength→none; swim shows a neutral "Pace zones coming soon" placeholder. Kills the run-Friel card + per-mile threshold-pace leak on swim.
- **Numbering:** D-198 is taken by the unmerged `feat/d198-cycling-intent` branch; this is D-199 to avoid collision.
- **Staged (NOT Layer A), spec'd in `docs/SPEC-intensity-baselines.md`:** Layer B (CSS-primary verdict in analyzer), Layer C (manual CSS seed FIRST → CSS learner mirroring the FTP learner), and #5 (null-honest baselines + the RPE-degrade contract). **5-zone CSS model LOCKED** (Z1–Z5, CSS-relative offsets sourced from SWIM-PROTOCOL §4–5; CSS is the only measured anchor). **OPEN:** athlete-facing labeling conflict with the 2026-05-22 anti-regression rule (no "CSS" word athlete-facing) — resolution options A/B in the spec, pending decision.
- **Deployed:** `analyze-swim-workout` (2026-06-17); UI ships with the client (`git push 8ba50fbf`). On-device eyeball confirmed swim/run/cycle/strength tabs.
- **Cross-ref:** `docs/SPEC-intensity-baselines.md` (full B/C/#5 spec + zone model + conflict), SPEC-honest-swim-inference, SWIM-PROTOCOL.md §4–5, Q-069 (session_type cosmetic), Q-070 (✓-badge items surfaced during the eyeball).

---

## D-200 — Swim threshold is a USER-ENTERED/TESTED benchmark, not computed; clean per-length passive extraction proven impossible

- **Date:** 2026-06-18
- **Context:** A long session that re-derived (and finally *proved*) why a clean swim threshold can't be computed from the data we ingest — a wall hit more than once before. Full verification in ENGINE-STATE "Swim clean per-length … UNRECOVERABLE (DO NOT RE-CHASE)". Short version: Strava reconstructs rest into lap times + plan-alignment fails; the Garmin webhook gives synthesized even-splits with no distance axis and empty `swimCadence`; real per-length lives only in the FIT file the webhook doesn't send.
- **Decision:** Swim fitness = a **user-entered/tested THRESHOLD**, the swim analog of FTP (bike) and threshold pace (run) — all three are tested/entered anchors refreshed periodically, NOT continuously reverse-engineered. The threshold IS the benchmark: it drives the 5 tiers, prescription, race-leg projections, and the cross-discipline fitness read. Found via the **CSS test** (400/200 → threshold 100 = (t400 − t200) ÷ 2; the `(i)` button in `TrainingBaselines` explains it) or a best-steady-20–30-min entry.
- **Refresh loop (BUILT 2026-06-18, `efd72f8a`):** an **honored-swim-gated re-test nudge** on the State screen (NOT Performance — a fitness-marker insight) — fires at ≥4 weeks since the last baseline update AND ≥4 honored (clean) swims AND a swim in the last ~10 days; never auto-changes the number; auto-clears when the threshold is updated/tested (the `lastUpdatedAt` moves). Pieces: `swimBaselineNudge` helper + `useSwimBaselineNudge` hook + State card (7-day snooze) + `swimPace100_updated_at` stamp in `TrainingBaselines.handleSave`. The trend markers ALSO now honor the popup uncheck — `compute-facts` writes `swim_facts.swam_as_planned`, and both trend filters (compute-snapshot + useStateTrends) exclude `=== false` (unifies the "clean" definition with the learner). Dormant until a 4-week honored window accrues.
- **Markers are SECONDARY:** the whole-swim `moving_time` trend (glitch-guarded) is the directional "trending faster?" signal between updates and the thing that motivates the re-test — it never redefines the benchmark. Improvement = the benchmark moving on re-test.
- **Resolver:** `swimSecPer100YdFromArcSwimInputs` goes **benchmark-first** (`swim_css`/tested > manual > median) — the staged `SWIM_CSS_LIVE` flip (D-199). Flip it once a real tested benchmark exists; the learned median demotes from "drives prescription" to marker substrate. (Held today only because the current manual 2:30 is stale.)
- **Entry model:** THRESHOLD ONLY (Michael, 2026-06-18) — the 5 tiers derive by offset; no separately-entered moderate.
- **Cross-ref:** D-199, D-201, ENGINE-STATE (per-length impossible), `SPEC-intensity-baselines.md`, Q-071 (hard swims — the prescription that produces something to test against).

---

## D-201 — Apple = casual/hybrid (run+lift+cycle) wearable, NOT the swim solution; surgical per-length is a future FIT/Apple project

- **Date:** 2026-06-18
- **Context:** "Build Apple to solve swim per-length" was backwards — **serious swimmers wear Garmin/Form, almost never an Apple Watch.** Apple HealthKit *does* expose clean per-length (segment events + stroke + active/rest), so it's the one source that technically *could* do surgical per-length — but the swim audience isn't on it.
- **Decision:** Apple integration is justified on the **strength + casual-endurance** pillar (the runner who wants to lift; the cyclist with a bike computer + an Apple Watch on the wrist) — literally the product identity. It is scoped and built as a **general wearable integration**, NOT the swim fix. Swim-via-Apple rides along for free for the rare Apple-swimmer; it is not a deliverable or a justification.
- **Surgical per-length swim** = a separately-scoped FUTURE project (Garmin FIT-file ingest OR Apple HealthKit native), undertaken only with a way to test it. NOT part of "solid swim v1".
- **3-lane source model (already baked in):** Garmin/Apple native = richest (computed where possible) · Strava = whole-swim + user-input (Strava API capped at 10 users anyway — 50/50 for launch) · manual = user-input. `swimSourceOverride` (D-173) already routes swim to a different source than the global `source_preference` ("Strava for everything, Garmin for swim"); `mergeSameSwimIfExists` keeps richest fields. "Richest data wins for swim" is therefore mostly built — Apple is the only missing plug (Q-060). TODO: confirm the `swimSourceOverride` is exposed in the Connections UI.
- **Cross-ref:** D-157 / D-173 (Apple / source-override), Q-060 (Apple deferred), D-200, `SPEC-swim-source-tiers.md`.

---

## D-202 — Strength logger: resume-hardening + rest-timer overlay + background away-alert (the D-139/D-132 features didn't actually work on device)

- **Date:** 2026-06-18
- **Context:** Rest-timer auto-start (D-139) and draft persistence (D-132) were documented as shipped but did NOT work on device. Xcode-console diagnostics found the real bugs — and the umbrella cause: iOS REBUILDS the logger a few times on resume (AuthWrapper/AppLayout remount churn — see Q-072), racing/wiping in-memory state.
- **Rest timer — fixed + overlaid:** D-139's auto-start DID exist (`autoStartRestForSet`), but the "ensure timers exist" prune deleted the timer the instant it armed — it parsed the key with `k.split('-')` and exercise ids contain hyphens (UUID/slug) → matched no exercise → deleted the running timer (why the overlay never showed). Fixed: parse idx from the end (`/^(.+)-(?:set-)?(\d+)$/`). The pinned pill lived INSIDE the scrolling header (`overflow-y-auto`) so it scrolled away → moved to a `sticky` overlay below the app header. Timer now PERSISTED to localStorage (`strength_rest_timer` {key, endsAt}) on arm, restored on mount with remaining seconds, cleared on rest-end/skip → survives the rebuild.
- **Away-alert (NEW plugin `@capacitor/local-notifications`):** iOS suspends the JS countdown when backgrounded, so a notification is the only away-alert. Scheduled ONLY when the app backgrounds with a running timer; canceled on foreground → in-app = haptic only (no foreground banner), away = notification buzz. One-time permission ask on login (AppLayout), only when undecided.
- **Stay-open + draft restore — the real data-loss fixes:**
  - `AppLayout.hasUncompletedStrengthSession` read the bare legacy key `strength_logger_session_<date>`, but D-132 writes the identity-aware `<date>_<id>` key → a planned-workout draft was invisible to the reopen gate and the logger NEVER reopened. Fixed: scan all today-prefixed keys.
  - The resume path set `showStrengthLogger=true` but never restored `loggerScheduledWorkout` → the reopened logger had no workout identity, the restore identity-guard failed → loaded fresh. Fixed: persist the workout, restore on cold-start + warm-resume.
  - **THE SAVE-GATE WAS DELETING GOOD DRAFTS.** During the rebuild the prescribed workout reloads/prefills → a transient "N exercises, none completed" snapshot → `saveSessionProgress`'s gate removed the draft on it (confirmed via logs: fired 5× right after a clean restore with 2 completed sets). Now it only SKIPS writing; the draft is cleared explicitly on finish/orphan, never by a passive no-completed snapshot. **This was the core resume data-loss bug.**
  - **Synchronous PRE-HYDRATE** at the top of the init effect: the async restore deferred to a microtask that lost the race vs the blank rebuild (sets flashed in then vanished). The valid same-identity draft now hydrates synchronously in the same render; the async block still runs the orphan-verify.
- **Verified live** on the dev's device: logger stays open with logged sets across resume; timer shows + persists; away-notification fires backgrounded, not foreground.
- **Cross-ref:** D-132, D-139, D-108/D-110, Q-072 (the resume-churn root — auth session expiry).

---

## D-203 — RIR capture is friction-free: Done auto-saves the suggested + a non-blocking adjust strip (supersedes D-134)

- **Date:** 2026-06-18
- **Context:** D-134's forced "CONFIRM RIR" panel read as "you MUST tap a number" and confused (Michael). RIR is load-bearing (autoregulation / e1RM / load progression), so it can't just be dropped — but the forced confirm was friction.
- **Research (RP Hypertrophy, JuggernautAI, Boostcamp, Strong/Hevy):** logging-first apps make RPE/RIR OPTIONAL; autoregulation apps PROMPT it (the value drives the algorithm) but make accepting the default a quick tap, some only after KEY sets. Takeaway: keep RIR captured, but accepting the suggestion must be one tap, never a hunt.
- **Decision:** Done SAVES the set immediately with the suggested RIR (`target_rir`, default 3) and starts rest — friction-free, no forced confirm. A small NON-BLOCKING "RIR — tap to change" strip then appears on WORKING sets (warmups skip) so the athlete adjusts only if it felt different. Tap a number → adjusts + closes; Done or "keep" → closes (keeps the suggested) — Done's strip-close is checked BEFORE the set-toggle so it doesn't un-complete. Supersedes D-134.
- **Cross-ref:** D-134 (superseded), D-126 (prefill), D-122 (last-session anchor).

---

## D-204 — RIR provenance flag: auto-filled RIR is "no effort signal," never "on target"

- **Date:** 2026-06-18
- **Context:** D-203 made "Done" auto-save the *suggested* RIR (`target_rir`, default 3) so logging is friction-free. Side effect: an auto-saved RIR is byte-identical to one the athlete actually felt and entered. Both the e1RM math (`compute-facts`) and the RIR-adherence/verdict analyzer read `set.rir` as an *observed effort signal* — so post-D-203 a lifter who never taps the adjust strip has their RIR read back as the prescription. e1RM is biased toward the plan and RIR adherence reads as **perfect by construction**; the drift detector the SPEC-strength recalibration model depends on can never fire. This blocks the strength-screens execution score + recalibration, which both require a *real* RIR signal.
- **Decision:** add `rir_autofilled?: boolean` to `LoggedSet` (mirrors `from_previous`, D-097). Provenance is stamped at every write and honored by every reader of RIR-as-signal:
  - **Write → `true` (suggestion, not observed):** D-203 auto-save Done (`StrengthLogger.tsx`); prefill-from-previous (inline — the one path that bypasses `updateSet`).
  - **Write → `false` (observed):** any athlete-initiated numeric RIR — keypad, adjust strip (`confirmRirAndComplete`), RIR modal. `updateSet` defaults this: an explicit `rir_autofilled` in the update wins; otherwise a numeric `rir` edit clears the flag. Self-clearing, no per-site edits needed.
  - **Readers exclude auto-filled:** e1RM average (`compute-facts/index.ts:1363`); RIR adherence/verdict `executedRIRSets` (`analyze-strength-workout/index.ts:652`).
  - **Baseline-capture gate kept:** in-logger baseline 1RM auto-capture (`updateSet`, ~:2578) gated on `!rir_autofilled` — a baseline must come from a *confirmed* effort, not an auto-accepted RIR that merely lands in the 2–3 gate. Behavior change accepted by design.
- **Status:** **landed, NOT deployed** — held for on-device eyeball before shipping `compute-facts` + `analyze-strength-workout` + the client. Legacy rows have no flag → treated as observed (zero retroactive contamination; D-203 only shipped today).
- **Acceptance bar (honesty — non-negotiable):** auto-filled RIR is *"no effort signal,"* never *"on target."* Execution score and recalibration read provenance-**confirmed** signal only. Same discipline as **D-189** (null e1RM → say nothing rather than fabricate); falls under the narrative-core validator rules (`noNewNumbers`, `noContradiction`). A score or adjust line built on auto-filled RIR is a spec violation, not a degraded-but-acceptable state.
- **Cross-ref:** D-203 (the auto-save this disambiguates), D-097 (`from_previous` pattern mirrored), D-189 (null-e1RM honesty parallel), Q-040/D-118 (RIR-cap — same "RIR must reflect real effort" premise), Q-073 (re-materialization, the other strength-screens prerequisite), SPEC-strength-performance-details.md (the score + recalibration this unblocks).
- **Extension (2026-06-19, `a6b5f60d` / `e3884ec1` / `e996fdf7`) — prefill provenance as the canonical "performed set" definition + data-loss hardening:** the `prefilled` provenance idea was generalized beyond RIR into the single answer to "did the athlete actually do this set?"
  - **Definition (single source):** `isPerformedStrengthSet` (`analyze-strength-workout/index.ts:83`) — a set is *performed* iff NOT (`completed !== true && prefilled === true`) AND (completed OR has reps/weight/duration > 0). Replaced **9 duplicated inline predicates** (each counted untouched plan prefills as done → fabricated volume + a "0.0 RIR vs target 3" narrative) with one helper at 9 call sites.
  - **Lifecycle:** `updateSet` (`StrengthLogger.tsx:2609`) clears `prefilled` on any athlete edit/Done unless explicitly passed — same self-clearing pattern as `from_previous`/`rir_autofilled`. So an edited-but-not-Done set (reps 8→5) is correctly *performed*; a never-touched plan prefill is not.
  - **Readers honor it:** Details receipts (`StrengthCompletedView.tsx:192/204`) drop untouched-prefill sets + empty exercises; `workout-detail` (`:220`, `:1289`) now PRESERVES `prefilled` through both set-map paths — it previously stripped it, so the client never received the flag ("Bug B").
  - **Data-loss root ("Bug A"):** the prefill effect runs once (`didComputedPrefillRef`) and the resume listener no longer mints new set objects, so backgrounding mid-session can't wipe edits. Plus delete-restore revert-by-`completed_workout_id` (`e3884ec1`).
  - **Status:** deployed; deterministic logic internally verified **16/16** (`/tmp/d204-strength-test.mjs`, 2026-06-21). On-device verification of Bug A + a reported "skipped still shows as done" symptom (**Q-076**) deferred to 2026-06-22.
  - **Acceptance bar:** same honesty discipline as the RIR half — Details volume, analyzer counts, and the narrative reflect what was *performed*, never the prescription. Counting an untouched prefill as done is a spec violation, not a rounding error.

---

## D-205 — Strength logger: totals count bodyweight/band, dedup by planned_id, draft cleared only after a confirmed save

- **Date:** 2026-06-22
- **Context:** a user hit a double-logged session (weekly Strength volume read 9,750 = 2×4,875) plus a one-off data-loss event ("came back, logger was open and empty, logged sets gone"). Three distinct save-path correctness bugs.
- **Decisions:**
  1. **Totals honest for unweighted work** (`StrengthCompletedView.tsx:215`). Total Sets / Total Reps gated counting on `set.weight > 0`, silently dropping bodyweight (pull-ups) + band (face pulls) sets — showed **11/47** for a 17/104 session. Now counts every set with `reps > 0`; **volume stays weight-gated** (a 0 lb set contributes 0 anyway).
  2. **Duplicate-session guard by `planned_id`** (`StrengthLogger.tsx` finalizeSave). `addWorkout` was an unconditional INSERT; the only dedup (`editingExisting`) fired solely when reopening an already-completed workout. After the resume churn (Q-072) reopened the logger EMPTY, re-logging a planned workout INSERTed a second identical row. Now a planned save looks up an existing completed row by `planned_id` and **updates it instead of inserting**. Keyed on planned_id so two genuinely-distinct same-day planned strength sessions stay separate; only a re-log of the SAME planned workout collapses onto its row. Best-effort: lookup error falls through to insert.
  3. **Draft cleared only after a confirmed save** (`StrengthLogger.tsx` finalizeSave). `clearSessionProgress()` ran at the TOP of finalizeSave, BEFORE the `await` save — a failed/interrupted save (network error, or the iOS resume remount killing the component mid-save) wiped the draft AND never persisted = total loss. Moved the clear to after a confirmed save; it now also runs synchronously in the same await chain (not the delayed, mount-guarded success callback), which closes the empty-reopen-after-save window too.
- **Scope / tradeoff:** does NOT fix the resume churn itself (Q-072 — auth-session/remount). These make the churn HARMLESS — it can no longer duplicate or lose work. **Supersedes the D-202 "verified working on device" claim for the save path** (D-202's draft-restore/save-gate fixes were necessary but the save itself still inserted duplicates and cleared the draft pre-await).
- **Cross-ref:** D-202 (resume hardening — partially superseded), D-132 (identity-aware draft key), Q-072 (the churn root), D-204 (the performed-set definition the totals now align with).

---

## D-206 — Strength analyzer: narrative hard-capped + truncation-guarded, execution score un-broken

- **Date:** 2026-06-22
- **Context:** the Performance screen narrative rendered as a truncated wall of text (cut mid-sentence on "…chasing the prior numbers, and"), and no execution score appeared at all.
- **Decision 1 — narrative brevity (three layers):** the D-102/D-189 prompt capped sentence COUNT but not LENGTH, so the model wrote ~180-word run-ons (clauses chained with em-dashes/colons) that blew past `maxTokens:240` and truncated mid-word. (a) Tightened the prompt: 3 sentences (4 only if S3 carries a real signal), each ≤20 words, ≤55 words total, no clause-chaining, and "don't enumerate exercises — the table below shows them." (b) Bumped `maxTokens` 240→300 for headroom. (c) Added server-side `capNarrative()` — drops a non-terminated trailing fragment (the token-ceiling cut) and caps at 4 complete sentences. **Boundary detection requires the terminator be followed by whitespace+capital or end-of-string** — bare `[.!?]` split decimals ("110.5 lb" → "110." + "5 lb") and miscounted; the whitespace+capital rule keeps decimals and "approx. 3 sets" intact. Tested across decimal/truncation/over-count cases.
- **Decision 2 — execution score wiring (one-line source fix + render):** `session_state_v1.glance.execution_score` read `performance.execution_score`, **a field that never existed on the `performance` object** → always null → the score never reached the client. Silent contract-drift, same shape as the D-202 claim D-205 just superseded. Fixed to read `execution_summary.overall_execution` (weight 30% / RIR 20% / set-completion 20% / exercise-completion 30%). `build.ts:207` already maps `glance.execution_score` → `session_detail_v1.execution.execution_score`, so no builder change. Added an **Execution % chip** (color-graded ≥85 green / ≥70 amber / else rose) above the strength compare table; the per-exercise `Vol → +N lb` deltas remain underneath (single glance number, per-lift story preserved).
- **Verified — intent-mode honesty (the one claim that could be quietly false):** load adherence is `(executed − planned) / planned` (`analyze-strength-workout/index.ts:642`). The intent-mode + phase load adjustment is **baked into the stored `planned.weight` at materialize time** — `resolveStrengthPercentForLift` clamps support mode to ≤0.6/≤0.45 of 1RM (`materialize-plan/index.ts:115-130`) at the same step that produces the number the analyzer later reads (weight computed at `:1660`/`:1688`, written `:1736`). So the score is intent-mode-respecting **by construction**: a maintenance/support lift executed to its prescribed lower load scores ~100%, not a false miss. **Caveat (blind spot, not a lie):** qualitative loads ("Light DBs") and %1RM that can't resolve (missing 1RM baseline) leave `planned.weight = 0` → `weightProgression = 0` → scored 100% by default.
- **Cross-ref:** D-102 (the narrative-cap origin this re-enforces), D-189 (narrative-core scaffold), D-093 (cycling clean-execution cap pattern), D-204 (provenance — execution score reads confirmed signal), Q-077 (the e1RM-direction misread surfaced in the same narrative).

---

## D-207 — Details tab folded into Performance for the strength family (strength/mobility/pilates); endurance keeps Details

- **Date:** 2026-06-22
- **Context:** the strength Details tab was redundant — the Performance tab's compare table already shows the full per-set Completed data (weight/reps/RIR) plus Planned + Previous + Vol deltas. Three tabs (Planned / Performance / Details) where two carry the same completed numbers.
- **Decision:** remove the Details tab **for the strength family only** (`isStrengthFamily = strength || mobility || pilates_yoga`, `UnifiedWorkoutView.tsx`). Completed strength now shows Planned + Performance (linked) or Performance only (unplanned). **Endurance (run/ride/swim/walk) KEEPS its Details tab** — there the `completed` TabsContent renders `CompletedTab` (gear, splits, etc.), which is NOT redundant with Performance. The carve-out is the entire safety of the change.
- **Pre-conditions verified before the kill (the gated trace from POLISH §7):**
  1. **Unplanned path** — `StrengthCompareTable` builds rows from `allKeys = union(plannedMap, completedMap)` (`:184`), so an ad-hoc strength session with no plan still renders completed-only rows (`status: 'swapped'`). Performance is a usable standalone receipt; killing Details doesn't strand unplanned workouts.
  2. **Totals footer** — the Total Sets/Reps/Volume footer lived ONLY in `StrengthCompletedView` (Details). Ported it into `StrengthPerformanceSummary` (below the compare table) with the **D-205 counting rule** (every `reps>0` set counts incl. bodyweight/band; volume weight-gated). Nothing lost.
- **⚠ CONSTRAINT (latent trap — read before adding navigation):** strength-family workouts can no longer land on the `'completed'` tab — there is no trigger for it, but the `completed` TabsContent STILL RENDERS (the old Details/StrengthCompletedView) if `activeTab` gets set there. So a stray `setActiveTab('completed')` shows the killed Details page with no selected tab.
- **Follow-up (2026-06-22, same day) — the missed call site + structural enforcement:** the first cut only fixed the Unattach handler inside `UnifiedWorkoutView`, but **`AppLayout`'s tab-routing effect was the real entry path** — opening a completed strength workout ran `setActiveTab('completed')` (`AppLayout.tsx` ~`:273`), so every strength session opened straight onto the dead Details content (tab bar showed Planned/Performance, body showed Details). Two fixes: (1) AppLayout routes completed strength → `'summary'`; (2) **defense-in-depth in `UnifiedWorkoutView`** — the initialTab sync coerces `'completed'`→`'summary'` for the strength family, AND a dedicated guard effect (`if (isStrengthFamily && activeTab === 'completed') setActiveTab('summary')`) catches ANY call site, present or future. The constraint is now enforced in code, not just documented. **Lesson:** "document the constraint" was necessary but not sufficient — the doc named the rule while a second call site already violated it; a structural guard is what actually holds.
- **Verification status:** endurance Details path is **structurally unchanged** (the `completed` TabsContent endurance branch and the endurance grid arm are untouched; the trigger is hidden only when `isStrengthFamily`). **On-device swim Details visual confirmation is OWED** before treating "endurance unchanged" as device-verified — do not upgrade this to "verified on device" until a completed swim session is opened and its Details tab (CompletedTab) is confirmed rendering.
- **Cross-ref:** D-205 (the totals counting rule the ported footer reuses), D-206 (the execution chip now living on the single Performance surface), POLISH §7 (the gated punch-list item this closes).

---

## D-208 — Execution score is role-weighted: a skipped accessory dings half a main lift (accessory = 0.5)

- **Date:** 2026-06-22
- **Context:** the strength Execution score's exercise-completion component counted every exercise equally (flat matched/planned). So skipping a postural/prehab accessory (Band Pull-Aparts, RIR ~10) dinged the score the *same per-exercise* as bailing on a main lift — the "score that lies" failure mode (a 97 with a skipped band and a 97 with a skipped bench read identically).
- **Decision — accessory weight = 0.5 (the coaching judgment, locked):** each planned exercise contributes its role weight to both sides of exercise-completion — **primary 1.0, secondary 1.0, accessory 0.5**. For a triathlete's strength block, prehab/postural accessories are **durability insurance, not the primary adaptation driver**; a skip should register as a *proportionate nudge*, not equivalence to dropping a main lift (1.0), nor a free pass (0.0). **0.33 was considered and rejected** as too soft to function as a signal. (`secondary` weights the same as `primary` today; it's a distinct tier for future granularity + display, not a score difference.) On the June-22 session: exercise-completion 83.3% (flat 5/6) → 90.0% (role-weighted 4.5/5.0), so the Band Pull-Aparts skip costs ~3 pts instead of ~5; score 97 → 99.
- **Why a curated table, not a per-exercise field:** role is a deterministic function of the exercise NAME, so it's classified at read-time from a curated table (`_shared/strength/exercise-role.ts`) over the protocols' KNOWN prescription vocabulary. The alternative — a declared `role` field on every emitted exercise — was **~425 edit sites** across 5 protocol files; the table is one file. Because it's curated over a *known finite vocabulary* (not free-text), it has declared-role correctness at the heuristic's blast radius. **Validated: all 110 emitted exercise names resolve (no false tripwires).**
- **Unknown-name tripwire:** a name absent from the table logs LOUDLY (`console.warn`, lands in Supabase logs) and defaults to `'primary'` (full weight = today's behavior). So a table drift can never *silently* discount — it scores as it does now and tells us to add the name. Never make the default quiet.
- **Shared foundation, one pass:** the analyzer emits `execution.component_attribution { components[], skipped[{name,role}], primary_mover }` (per-component score + weighted contribution + which component cost the most). **Both** the weighting (above) and the "what moved it" microcopy consume this one structure — not two passes. The copy is symmetric: a skipped accessory reads "accessory work, so it dings less"; a skipped main lift reads "main work, counts in full" (never explain only the accessory while a real miss gets silence).
- **Files:** `_shared/strength/exercise-role.ts` (new — the table + classifier; the coaching judgment lives here), `analyze-strength-workout` (role-weighted completion + attribution), `_shared/session-detail/build.ts` (threads attribution into `session_detail_v1.execution`), `StrengthPerformanceSummary.tsx` (dynamic copy). No protocol/materialize/DB-shape changes.
- **Footgun:** never revert the `exercise-role.ts` canonicalizer to depluralize every word — it strips singular words ending in 's' (soleus→soleu, tibialis→tibiali). Last-word-only is deliberate. (Both caught by the local completeness check pre-deploy.)
- **Cross-ref:** D-206 (the execution chip this refines), Q-078 (partial-accessory-sets — the same lie in miniature, deferred), Q-079 (unifying role into the EXERCISE_CONFIG catalog / covering the user-loggable library).

---

## D-209 — Auth resume churn fixed by check-once approval (Option B), not background re-verify

- **Date:** 2026-06-23
- **Context:** `AuthWrapper` rendered `<Loading/>` in place of `<AppLayout/>` whenever `sessionResolving` was true (line 155), and set it true on EVERY `onAuthStateChange` event (line 119). iOS fires SIGNED_IN / INITIAL_SESSION on each foreground, so every resume unmounted the entire app tree — tearing down the strength logger mid-session. This is Q-072's churn half and the root cause of the D-205 data-loss event (the logger got rebuilt out from under an in-progress save).
- **Decision (Option B — check-once):** approval is an **onboarding gate, not a per-request check**, so verify it at **cold start / genuine login only**. On resume, if the auth event re-fires for the **same already-approved user**, the handler **no-ops** — doesn't touch `user` / `approval` / `sessionResolving`, so `AppLayout` never unmounts and the logger keeps its state. **No render-gate changes** (gates 1-5 unchanged); the entire fix is the handler early-return.
- **Rejected — Option A (background re-verify):** keep re-checking on resume but in the background, swallowing transient errors, tearing down only on definitive denial. More robust to mid-session revocation, but adds real complexity (must not downgrade a live `allowed` session to the "Can't verify" screen on a network blip). Not worth it for an onboarding gate.
- **The ref (load-bearing detail):** the `onAuthStateChange` subscription is set up in a `[]`-deps effect, so its callback closes over the INITIAL `approval`/`user` (both null) forever — reading them directly is a stale closure. So `approvedUserIdRef` mirrors `(approval==='allowed' && user) ? user.id : null` via a sync effect, and the no-op branch reads the ref. The match is keyed on **user.id** — that's what keeps logout (#8) and login-as-different-user (#7) from being wrongly no-op'd back in ("too sticky / wrong user" failure directions).
- **Tradeoff (documented INLINE at the no-op branch, per request):** revoke-while-backgrounded isn't caught until next cold start. Accepted — approval isn't a security boundary that flips mid-session for this app.
- **Out of scope:** the `autoRefreshToken: false` / ~1h token-expiry half of Q-072 (latent, never bitten) is untouched. Note the churn fix means a genuinely-expired session no longer shows "Can't verify" on resume either — it keeps AppLayout mounted with a dead token (queries would fail). That's the separate expiry item; pair later with `refreshSession()`-on-resume if it ever bites.
- **Status:** shipped (`bbee4027`); #1-8 verified by logic/web; **#9-14 device rows owed before the churn is called closed** (esp. #7/#8/#10 — the regression-critical sticky/wrong-user directions).
- **Cross-ref:** Q-072 (the churn half this fixes + the expiry half it doesn't), D-205 (the data-loss event this root-causes), `AuthWrapper.tsx:130` (the no-op branch).

---

## D-210 — Per-discipline periodization: two primitives never fused; the spine stays descriptive

- **Date:** 2026-06-24
- **Context:** Investigation into supporting per-discipline training postures ("bike building, run maintaining") — the substrate for strength-led plans, per-discipline adaptation styles, and interference-cost-as-data. Full design, phasing, reusable-as-is, and do-not-touch lists: `docs/SPEC-per-discipline-periodization.md`. This entry records ONLY the two decisions a future session would otherwise re-litigate or silently violate.

- **Decision 1 — Per-discipline PHASE and INTENT/aggressiveness are TWO primitives; never fuse them into one per-discipline `{phase, intent}` object.** Per-discipline phase (base/build/race-specific posture per discipline) is the foundational one — adaptation-style and interference-cost both key off it. Intent/aggressiveness (how hard you climb) is a separate axis. **Why non-negotiable:** ramp rate is already owned by `training_intent` (the 3:1/2:1/1:1 loading patterns + VO2 gating + rep caps — D-061) and `tri_approach`; build/maintain does NOT imply a ramp rate. Bundling a build/maintain enum into the phase primitive creates a SECOND intent axis competing with `training_intent`, and every future aggressiveness feature then has to reconcile two intent models. Recorded because the natural "simplification" — one tidy per-discipline object — IS the fork; without this why on record, someone collapses them back and reintroduces it.

- **Decision 2 — Per-discipline intent/phase sits ADJACENT to the spine (`state_trends_v1`), never inside `DisciplineTrendCache`.** Intent is prescriptive; the spine is descriptive and row-derived. The primitive's source of truth is the plan contract, denormalized forward as a read-cache (the `swim_intent → SWIM_POSTURE` path), read beside the spine — not folded into it. **Why non-negotiable (two reasons):** (a) it breaks the spine's structural-equality invariant — client == server holds only because both compute from identical observed rows; intent isn't row-derived, so an intent field inside the cache forces a separate fetch and the cached==live guarantee no longer holds for it. (b) It collapses the pairing that IS the signal — "intent says *building*, spine verdict says *holding*": the disagreement between prescription and observed outcome is the coaching read, and merging them into one struct destroys it. Recorded because denormalizing intent into the spine looks convenient and a future session won't realize what it broke. (Same adjacency rule for the snapshot — per-week mirror only, authoritative block lives in the contract, per ADR-0002 — and for Arc — beside `longitudinal_signals`, not inside `active_plan`.)

- **Status:** SPEC ONLY — not built, **sign-off-gated (touches prescription).** Both primitives change session content and load distribution, so they fall under the spine's Step-4 prescription gate; do not build without that review.
- **Cross-ref:** `docs/SPEC-per-discipline-periodization.md` (full design + phasing + reusable/do-not-touch), `docs/adr/0002-phaseblock-one-week-rows.md` (the snapshot one-week-row rule), `docs/SPEC-athlete-state-spine.md` + D-150/D-151 (the descriptive-spine contract), D-061 (the `training_intent` axis Decision 1 protects).

- **PHASE 1 BUILT — per-discipline POSTURE (develop/maintain/out), 2026-06-26.** Shipped as 4 byte-identical cuts in `generate-combined-plan` — each verified events-unchanged via the deno suite, all gated on posture so the default (absent ≡ all-develop) reproduces today's plan exactly:
  - **Cut 1 — seam:** `getBaseDistribution` gains a `phase` param, recomputed **per block** (distribution can vary per block, not once-per-goal). Unused at first; the foundation for the rest.
  - **Cut 2 — substrate:** `DisciplinePosture` (`develop`/`maintain`/`out`) + `PerDisciplinePosture` (a discipline absent ≡ develop) on `AthleteState.per_discipline_posture`; `effectiveDisciplinePosture` carries the §3 collapse.
  - **Cut 3 — maintain:** a `maintain` discipline drops to its `MAINTENANCE_FLOORS.pct` floor; freed budget redistributes **zero-sum** across the develop set (revives the dead `.pct`).
  - **Cut 4 — out:** an `out` discipline → 0 share **and no sessions emitted** (week-builder post-filter, keyed on POSTURE not 0 share — keying on share would strip run-plan cross-training, which rides the `Math.max(60)` floor) **and** exempt from the validator's session floor (else a tri plan with `bike:out` fails validation). Unit + integration tested (tri `swim:out` → 0 swim share, 0 swim sessions plan-wide, plan validates).
- **The §3 collapse (locked, amended for retest):** at the whole-athlete terminals `{taper, recovery, rebuild, retest}`, `maintain → develop` (collapses to the global phase) but **`out` PERSISTS** — out is a presence flag, not a phase, so an out discipline must not reappear in the taper. (`retest` is the D-213 non-race terminal; it joined the set.)
- **`develop/maintain/out` is the user-facing face of Primitive A, NOT a new enum (Decision 1 honored):** develop = claims budget; maintain = floor posture; out = excluded/absent. It rides per-discipline phase + presence, never a parallel build/maintain ramp-rate axis competing with `training_intent`.
- **PHASE 2 — the deferred load-bearing wall (NOT built):** per-discipline PHASE DIVERGENCE (bike in `base` while run `builds`). Phase 1 keeps all `develop` disciplines on the **global** phase; divergence needs **independent per-sport TSS budgets** reconciling against one shared CTL / ramp / hours ceiling (SPEC §7). The Cut-1 seam enables it; do not attempt until commissioned. Also deferred: the builder UI surfacing + the commitment tier (SPEC §13/§14).
- **Status (updated):** Phase 1 (posture primitive) **BUILT, committed** (4 cuts, unpushed→pushing); an **engine capability** today — no UI collects posture yet, so it's exercised synthetically / by API until the builder lands. Phase 2 + builder UI deferred.

---

## D-211 — Session capture: as-planned default, deviation-gated (not always-ask)

- **Date:** 2026-06-24
- **Context:** reconciling the duplicate capture designs across `WORKORDER-deviation-reason.md` and `SPEC-session-context-behavioral-trends.md` Layer 1 — both specced the same post-session "what was this session?" tag with different trigger models. Recording the resolution as a decision rather than silently editing one spec away.

- **Decision — as-planned default, deviation-gated.** A followed planned session defaults to "as planned" — **silent, no prompt.** Capture surfaces ONLY on divergence (executed ≠ planned) or a free/unplanned ride. This **supersedes session-context Layer 1's "always-shown on the RPE popup" framing**; the capture is **built once, in deviation-reason**, and session-context Layer 2/3 read that single source.

- **Why non-negotiable (two reasons):**
  - **(a) Always-ask is friction for zero signal.** Most sessions go to plan; prompting the common case trains the user to reflexively dismiss the prompt — eroding the signal of the one prompt that matters. Recorded so no one reintroduces always-ask thinking it "captures more data": it captures noise and degrades the deviation prompt.
  - **(b) The tag must carry DIRECTION (harder vs easier), not just deviation y/n.** An accidental deload and a chased KOM both "deviate" but mean opposite things for load. Direction is what lets the Arc separate **quiet overreaching** (consistently harder than planned) from **accumulating deloads** (consistently easier). A flat deviation-y/n tag is the easy build and silently discards the exact signal the feature exists for.

- **Status:** SPEC ONLY — not built. Narrative-core gate ✅ landed; remaining gate is the integrity fast-follow **Q-061** (the swim-cleanup ↔ deviation-reason coupling). Build once, in deviation-reason.
- **Vocab status:** bike reason vocab drafted (the deviation-reason dropdown options); **run vocab TBD.**
- **Cross-ref:** `WORKORDER-deviation-reason.md` (the chosen model + build home), `SPEC-session-context-behavioral-trends.md` (Layer 1 superseded; Layer 2/3 read this single source), Q-061 (the integrity gate), D-147 (the off-plan verdict the direction-carrying tag feeds).

---

## D-212 — Fitness-verdict reconciliation: three axes, N-way adjacency, none folded

- **Date:** 2026-06-24
- **Context:** The app computes fitness three independent ways that never cross-check: the **spine** (`state_trends_v1` — per-discipline trend, backward), the **projection/readiness** (race finish time vs target, forward), and the **goal-predictor** (`block_verdict` — block adaptation rate, mid-block). Full design + the build/file split + the code anchors: `docs/SPEC-fitness-verdict-reconciliation.md`. The fix is an **N-way meeting room**: each verdict sits as a sibling and a divergence read sits *above* them. This entry records ONLY the decisions a future session would re-litigate or silently violate.

- **Decision 1 — N-way adjacency, nothing folded (D-210 extended from two to N).** The three verdicts are **mutually non-expressible**: the projection has no per-discipline verdict, the spine has no finish time, the block-rate has neither. **Why non-negotiable:** because none can be derived from another without loss, folding any into another is destructive — adjacency is the only non-destructive shape. Build the cross-check as a set of sibling verdicts with the divergence read computed over them, never a hardwired two-way diff; leave a named empty third slot from day one. Recorded because a two-way comparator is the natural first build and it would have to be torn up when the third axis arrives.

- **Decision 2 — the divergence IS the signal, not noise to resolve.** "On-track for your finish time, **but** swim fitness is sliding" is the coaching read that exists nowhere today (the projection structurally can't see per-discipline decline; the spine supplies the verdict it lacks). **Why non-negotiable:** merging the verdicts into one reconciled number destroys exactly the disagreement that is the value. The divergence read observes the mismatch (observe-don't-diagnose); it does not collapse it. Same logic as D-210's "intent says building, spine says holding."

- **Decision 3 — the third brain joins as a peer that reweights, never folds.** The goal-predictor's inputs are spine-family observed deltas, reweighted by goal profile — but sharing inputs ≠ being the same verdict (the reweighting and the rate/slope semantics are its own axis). **Why non-negotiable:** the temptation will be "just compute block-rate from the spine deltas," which loses the axis. It must read the same observed substrate and reweight it, never be computed-from or folded-into the spine.

- **⚠️ The trap (record it):** on coach and training-context, `runGoalPredictor` is called **without its `block` data** (`coach/index.ts:2451`, `generate-training-context/index.ts:946`), so `buildBlockVerdict` returns null (`goal-predictor/index.ts:292`) and only weekly *readiness* survives. **Anyone seating the goal-predictor in the third chair without first wiring the `block` arg is adding a duplicate of readiness, not the third axis.** If `block_verdict` is null in the shared scope, stop — you're about to seat a clone.

- **Scope:** Build target is **Piece 1** (spine↔projection, two verdicts seated, the N-shaped room). The **third brain is filed and gated** behind Piece 1 existing. The divergence read is **display/synthesis only** — acting on it (adjusting prescription) is a separate prescription gate, like the spine's Step-5.
- **Cross-ref:** `docs/SPEC-fitness-verdict-reconciliation.md` (full design, Piece 1/Piece 4 split, the trap, code anchors), D-210 (spine-stays-descriptive, the rule this extends from two to N), `coach/index.ts:1097` (the existing spine-into-readiness fold Piece 1 unwinds).

---

## D-213 — One engine, two output shapes: extend the engine, retire the forks, never widen them (adopted standard, pre-implementation)

> **⚠ SUPERSEDED IN PART by [D-218] (2026-06-28).** For **single-sport RUN non-race** goals, the shipped path is the `generate-run-plan` fork (the b-run retest head), NOT the combined "one engine" — because the combined engine cannot produce a single-sport week (F-9/F-12). D-213's "retire the forks / never widen" principle still holds for **non-race tri** (which does run on the combined engine). Read D-218 before assuming non-race run routes through `buildCombinedPlan`.

- **Date:** 2026-06-25
- **Nature of this entry — read first:** D-213 is **not** the same kind of entry as D-210/D-212. Those were decisions *reasoned to completion* — a problem traced, options weighed, a result locked. **D-213 is a governing principle adopted *before* the first non-race-goal build** — a standard we're committing to up front, not a battle-tested outcome. The distinction matters for how to treat it: if first contact with actual Goals work surfaces a wrinkle, the wrinkle **amends this standard** (a follow-up that refines the rule); it does **not** falsify a claimed result, because no result was claimed. Full standard: `docs/SPEC-one-engine-two-shapes.md`.

- **The standard (the load-bearing line):** **plan-gen is one engine; season and goals are two output shapes; extend the one engine and retire the legacy forks, never widen them.** Season (race-targeted) and goals (non-race / develop-and-retest) differ in **terminal shape only** (taper-to-a-date vs develop-and-retest) — both route `create-goal-and-materialize-plan → generate-combined-plan → phase-structure (one timeline) → race-date-free content`, read fitness from the D-212 adjacent siblings, and read finish from `goals.projection.total_sec`. This extends D-185/D-186 up one level: those won *numbers*-continuity (compute each value once); this is *engine*-continuity (generate through one engine; season and goals are shapes, not systems).

- **Why it's non-negotiable (the failure mode it prevents):** a future session violates this by **reaching for the path of least resistance** — extending a legacy generator (`generate-run-plan` / `generate-triathlon-plan`) for a non-race goal *because it's the nearest path* — and that reintroduces the silo problem **D-212 just resolved one level down**. The forks already exist (two legacy generators, each with its own `determinePhaseStructure`; four projection estimators; three fitness brains). Adding a goal-specific copy of any of them is how the engine fragments further. Recorded because the temptation is structural, not a one-off: **the nearest path is always the fork.**

- **The two genuine builds (extensions, not forks):** (a) a **phase-structure variant** that synthesizes a timeline + phases with **no event-date anchor** and a non-taper terminal (since `event_date` today sets `totalWeeks` and every phase boundary); (b) a **distance-equivalent capacity target** to drive volume below the seam (since `science.ts` has no race-agnostic volume anchor). Everything below the `phase-structure ↔ science.ts` seam — keyed on `(distance, phase, weekInPhase)`, no race date — is reused as-is.

- **Standing exception (named honestly):** `generate-run-plan` and `generate-triathlon-plan` are existing race-season **forks** of the engine, live today via `combine === false`; `generate-plan` is dead. Until retired they are the standing exception to "one engine." Non-race-goal work is the occasion to retire them, not to feed them.

- **Status:** ADOPTED STANDARD, not yet exercised by a build. Will be amended (not superseded) if first Goals contact adds a wrinkle. Governs *how* Goals features are built; builds nothing itself.
- **Cross-ref:** `docs/SPEC-one-engine-two-shapes.md` (the full standard + guard-rails), D-185/D-186 (numbers-continuity, the level below), D-212 (`SPEC-fitness-verdict-reconciliation.md` — the three-brains silo this prevents repeating), D-210 (`SPEC-per-discipline-periodization.md` — per-discipline phase extends the one timeline).

---

## D-214 — The non-race routing predicate: widen `buildCombinedPlan`'s event-only gates ONLY when the just-created goal is non-race (D-213 build (a) / Cut 3b)

> **⚠ SUPERSEDED IN PART by [D-218] (2026-06-28).** This predicate (route non-race through `buildCombinedPlan`) still applies to **non-race tri**, but **single-sport RUN non-race** never routes through `buildCombinedPlan` — it forks to `generate-run-plan` (D-218), because the combined engine returns no single-sport plan (F-9/F-12). The `create-goal:~2374` `if (sport === 'run')` branch is the live router, not the combined predicate.

- **Date:** 2026-06-25
- **What this decides:** how a non-race goal (`goal_type ∈ {capacity, maintenance}`) reaches the ONE engine through `buildCombinedPlan` **without** forking a separate single-goal path and **without** silently altering any event athlete's plan. This is the wrinkle D-213 anticipated ("first Goals contact AMENDS the standard") — `buildCombinedPlan` is architecturally a **combiner of 2+ goals** (`create-goal-and-materialize-plan/index.ts:1184`, `if (length < 2) return null`), and its goal-fetch is **event-only** (`:1164`, `.eq('goal_type','event')`). A lone non-race goal — the primary use case — is never even fetched, so it falls through to the legacy standalone generators (which D-213 guard-rail #1 forbids for non-race).

- **The predicate (the whole safety story — every relaxation gates on THIS, nothing else):**
  > **`newGoalIsNonRace = newGoal.goal_type === 'capacity' || newGoal.goal_type === 'maintenance'`** — computed from the **just-created goal only.**

  Every non-race relaxation fires **exclusively** when `newGoalIsNonRace` is true:
  - **E1 (the events query, `:1164`) is left UNCHANGED** — it still filters siblings to `goal_type='event'`. The non-race new goal is fetched **separately by id** (no goal_type filter) and injected as `primary` **only when `newGoalIsNonRace`**. So for event-only inputs the query result is byte-identical (an event new goal is already in `rawEventGoals`; the separate fetch + injection never runs).
  - **E2 (the `<2 → null` gate, `:1184`) relaxes ONLY for non-race:** `if (length < 2 && !newGoalIsNonRace) return null`. An event new goal with no sibling still returns null and falls through **exactly as today**; a single non-race goal proceeds with `[primary]`.
  - **E3 (the `normalizeDistance` null→'marathon' default, `:1217`/`:1231`)** is bypassed for the non-race new goal — it gets a placeholder nearest-distance by sport instead of a silently-fabricated marathon (Cut 3 generator placeholder; real capacity anchor in Cut 5).
  - **E7 (`goal_type` + `target_weeks` onto the engine payload, `goalsForCombined`/`:1670`)** — additive fields; the event path leaves them undefined, which the generator already treats as `event` (D-213 Cut 3).
  - **Entry-path gates** (`:2128`/`:2246` target_date, `:2130` run-distance, `:2249` date-norm, `:2260` sport, `combine` routing) relax on the create-path equivalent of the same predicate (the request goal's `goal_type`). All of these throw if missed (LOUD, safe).

- **Why this predicate and not a looser one:** E1/E2 are **shared input gates**, not isNonRace-branchable in isolation. A naive widening (e.g. `.eq('goal_type','event')` dropped unconditionally, or `<2` relaxed globally) would let a stray active capacity goal become an **event** build's "sibling," silently mutating an event athlete's combined plan, schedule-pref merge, and retired-plan set. Scoping every relaxation to *the new goal being non-race* is what guarantees event-only inputs produce the **identical query result, identical `<2` decision, and identical plan** as today.

- **What it explicitly is NOT:** not a separate single-goal generator (reuses all ~800 lines of `buildCombinedPlan`'s athlete_state/schedule plumbing); not a direct `generate-combined-plan` invocation that bypasses that plumbing; not an extension of the legacy generators. Routes through the ONE engine (D-213 guard-rail #1).

- **Verification posture (honest):** event-side byte-identity is proven **locally** (the generate-combined-plan deno suite + the event query/`<2`/plan being provably unchanged). The non-race **end-to-end** (a real non-race goal through the deployed wrapper+generator) is **deploy-gated** — Docker is unavailable here, so `supabase functions serve` can't run it locally. Cut 3b is therefore **inspection-verified + deploy-gated**, NOT runtime-verified; the end-to-end is logged in `DEPLOY-OWED.md`. No runtime claim is made that can't be made locally.

- **Status:** predicate adopted; Cut 3b built against it. Amends D-213 (the anticipated first-contact wrinkle), does not supersede it.
- **Amendment (2026-06-26, found by the deploy-gated end-to-end):** Cut 3b's predicate was right but its *relaxation set was incomplete* — it relaxed the early create gates but **missed the per-sport legacy build-path gates** (`:tri missing_distance/race_date`, `:run distanceApi/weeksUntilRace`) that fire *before* the combine routing. A non-race run goal passed the create gates, then threw `missing_distance` deep in the run path — only the live end-to-end caught it (no local oracle could). The fix is **guard-rail-#1-correct, not gate-by-gate**: a single non-race **short-circuit** placed right after `postRaceRecovery`, before the `if (isTri)` split, that inserts the goal (sport-agnostic) + routes straight to `buildCombinedPlan` + returns the `multi_sport`/`combined` shape — so a non-race goal **never reaches the legacy per-sport paths at all** (which #1 says it shouldn't). Confirmed: the combine call is byte-identical to the per-sport ones (they pass no per-sport setup), events stay byte-identical (gated on `resolvedIsNonRace`), null rolls back the orphan goal (no fall-through to legacy). Lesson: whack-a-mole gate relaxation invites a missed gate; making the code match the standard (route through the one engine) removes the whole class.
- **Cross-ref:** D-213 (`SPEC-one-engine-two-shapes.md`), the Cut 3 generator commit (race-date-free timeline), `DEPLOY-OWED.md` (the non-race end-to-end test), `create-goal-and-materialize-plan/index.ts:1135-1184` (`buildCombinedPlan` head + the E1/E2 gates), the non-race short-circuit (after `postRaceRecovery`, before `if (isTri)`).

---

## D-215 — Strength contract for the non-race builder: named-protocol vocabulary, posture→protocol, 5×5 the standalone default, equipment-aware (§13.1)

- **Date:** 2026-06-27
- **What this decides:** the strength options the non-race builder offers + how they map to protocols, captured in `SPEC-per-discipline-periodization.md §13.1`, grounded in the standalone-strength audit + the science sourcing pass.
- **Vocabulary:** adopt the **named-protocol** vocabulary PlanWizard already ships — "Durability" / "Upper Aesthetics" / "Neural Speed" — **+ "5×5"**. NOT new words ("hypertrophy"/"upper-focus"), NOT ArcSetupWizard's intent-role labels. **"Durability" is the cross-surface anchor** (the one term shared by both wizards + the engine). Harmonizing Arc's tri strength onto this is deferred (Q-084).
- **Posture→protocol:** maintain → `durability` (run) / `triathlon` (tri); develop → a user choice; out → excluded. **Sport-context-aware** (a tri-shaped develop → `triathlon_performance`) — falls out of the resolver's sport split for free.
- **The default developer is `five_by_five`, NOT `upper_aesthetics`** (corrected after the audit). `upper_aesthetics` is a **supplementary upper-aesthetic overlay for endurance athletes, not a standalone developer** — its lower day is maintenance-intent and the name over-promises; nothing in code stopped it being mis-assigned. `five_by_five` is the **only standalone-capable** program (full-body, balanced, honest name). Upper Aesthetics + Neural Speed stay explicit opt-ins. **Equipment-aware:** 5×5 needs loadable resistance → bodyweight/bands fall back to `durability`.
- **Roster truth (the map before building):** one standalone program (5×5), six supplementary slots; all 7 science-documented (`SCIENCE-*.md`). Strength-program *expansion* is gated on the Q-088 frequency unlock (`ROADMAP-strength-engine.md`).
- **Cross-ref:** D-210 (the per-discipline primitive this surfaces), `SPEC-per-discipline-periodization.md §13.1/§13.2/§14`, the `SCIENCE-*.md` strength docs, `non-race-goal-seeds.ts` (the unit-tested mapping), `ROADMAP-strength-engine.md`.

---

## D-216 — The strength arc's first deliberate event-behavior changes (Q-089 `runStrength` + Q-087 filter): bug fixes to shipped run plans, owned not assumed

- **Date:** 2026-06-27
- **What this decides:** how to treat two strength fixes that DO change live event run plans — the first intentional breaks of the events-byte-identical invariant the whole non-race arc otherwise held. The principle: **a bug fix that improves a shipped path is not a regression, but it IS a behavior change — so it gets a guard test (fail-on-HEAD), a fixture-change enumeration, and a deploy-gated check, NOT a byte-identical assertion.**
- **Q-089:** `generate-combined-plan` `runStrength` selected `sessions[0]` for every slot → a 2×/wk run-strength week was a duplicate (5×5 Workout A twice, no B; `upper_aesthetics` Lower twice, the Upper "gains" session dropped). Fixed by threading `sessionIndex` (mirror `triathlonStrength`). **Run-shaped COMBINED event plans change `{A,A}→{A,B}`** — strictly an improvement. The fixture-change dig confirmed **CASE 1 (true gap):** zero pre-existing gcp fixtures exercised a run-shaped strength week, so nothing to update.
- **Q-087:** `generate-run-plan/strength-overlay.ts:620` stripped the upper session from `upper_aesthetics` @ freq 2 → zero upper. **Always a bug, never legitimate** (at freq 2 the protocol emits exactly `[LOWER, UPPER]` — nothing to trim). Removed. **Single-race run goals with `upper_aesthetics` @ freq 2 change** (1 lower-only → 1 lower + 1 upper) — strictly an improvement, narrow.
- **Path consolidation (scoped + DEFERRED):** retiring the legacy run-strength path is a **snag-laden migration**, not a clean swap — `runStrength` is a content function entangled with the combined week-builder/optimizer-slot context that `generate-run-plan` (+ `adapt-plan`) lack, and legacy carries features (sensitivity-gated taper, `noDoubles`, the intent→`neural_speed` resolver upgrade) combined would lose. Best done **alongside Q-088** (rebuilding the engine's guts anyway), not before; **optional once Q-087 is fixed.**
- **Cross-ref:** Q-089/Q-087/Q-088 (`OPEN-QUESTIONS.md`), `ROADMAP-strength-engine.md` (the path-consolidation finding + the phase sequencing), `DEPLOY-OWED.md` (the deploy-gated event-behavior checks), the guard tests (`runstrength-session-index.test.ts`, `strength-overlay-q087.test.ts`).

---

## D-217 — Strength periodization authority ("the strength island"), Phase One: typed-phase classification replaces phase-name string-matching; the run retest becomes a real rested week

- **Date:** 2026-06-28
- **What this decides:** where the run engine's *terminal* periodization decision lives, and how it is made. Promote it from each engine string-matching `phase.name === 'Taper'` to a **shared typed authority** — `supabase/functions/_shared/periodization/` — that every modality (run / tri / combined / future bike) will eventually query. Phase one seeds the **classification half only** (`PhaseKind`, `canonicalizePhaseName`, `isRestedTerminal`, `protocolPhaseName`) and migrates the live run-engine terminal consumers; later phases relocate the step-down / frequency / load logic itself (see `ISLAND-PROPOSAL.md` §5).
- **The bug it fixes (at the root):** `generate-run-plan`'s `applyRetestTail` renamed `Taper→Retest`, but the terminal consumers string-matched the literal `'Taper'` — so a "retest" week kept speedwork ON, full strength load, and near-build mileage (a cosmetic retest; see `STATE-OF-BOARD.md` row 4, `STRENGTH-SCOUT-REPORT.md`). Phase one routes those consumers (`sustainable.ts:183/329`, `strength-overlay.ts:275/587` + the `convertPhase` protocol bridge) through `isRestedTerminal(canonicalizePhaseName(...))`. The retest now behaves as a **real rested week** — speedwork off, volume to taper level (proven live: 20mi vs build's 31mi), strength stepped down (2 full → 1 light session) — using the **existing** taper logic. Deliberately NOT a rename, and NOT importing `generate-combined-plan`'s retest intensity placeholders (those are equally unsourced — importing them would trade a cosmetic retest for an arbitrary one; the correct retest prescription is a sourcing question, gate-#2).
- **Invariant held:** only `generate-run-plan` files + the new shared module changed; tri and combined import none of them → **byte-identical by construction** (matrix 486/486 on combined v268). Run **races** proven structurally identical (v140 vs v141, names+tags+mileage across all 12 weeks); the only call-to-call variance is pre-existing random easy-run flavor text, unrelated to this change.
- **Architectural intent on record:** ONE strength-periodization authority every modality queries, so strength and endurance scale across run/tri/combined/bike without chasing logic through separate engines. Migrate at our pace — each phase independently shippable and revertible. **Supersedes routing-tension thread T-3:** `generate-run-plan`'s `terminalShape='retest'` path is the live non-race-run path (the (b)-run fork, D-NNN owed separately for the routing supersession of D-213/D-214).
- **Deferred (named):** Phase 2 (relocate taper logic into the authority), Phase 3 (Q-088 frequency cap becomes an authority property), Phase 4 (protocol load curves); the `"Race Week: Light Movement"` microcopy (protocol taper-session label — correct behavior, wrong word for a retest); the combined-plan retest volume-floor leak (`science.ts:608`, scout thread D2); the endurance-number sourcing debt (`ENDURANCE-PROVENANCE.md`: 0 SOURCED — a separate, larger debt this does NOT touch).
- **Cross-ref:** `SPEC-strength-island-phase1.md`, `ISLAND-PROPOSAL.md`, `STRENGTH-SCOUT-REPORT.md`, `STATE-OF-BOARD.md`; tests `retest-behavior.test.ts`, `retest-tail.test.ts`.

---

## D-218 — Single-sport RUN non-race runs on `generate-run-plan` (the b-run fork), superseding D-213/D-214's "route through the combined engine" for this case

- **Date:** 2026-06-28
- **Supersedes (in part):** **D-213** (one engine, retire the forks) and **D-214** (route non-race through `buildCombinedPlan` via the event-gate predicate) — **for single-sport run non-race only.** Both still govern **non-race tri**.
- **What this decides:** where a single-sport **run** non-race goal (`goal_type ∈ {capacity, maintenance}`, sport `run`) actually generates its plan. **Answer: `generate-run-plan` with a retest head (`terminalShape: 'retest'`), via the `create-goal-and-materialize-plan/index.ts:~2374` `if (sport === 'run')` branch — NOT `buildCombinedPlan`.**
- **Why D-213/D-214's "one engine" doesn't hold here:** the combined engine is architecturally a **multi-discipline combiner** — proven empirically (F-9/F-12, `BUILDER-SWEEP-FINDINGS.md`) to return **no plan** for a single-sport week (the optimizer pins phantom swim/bike sessions; the week-builder degenerates). The stashed F-9 provisional cut confirmed making it single-sport-capable is a real engine build, not a config. So forcing run non-race through combined produced 0/16 materialization. The b-run fork routes to the **working** single-sport run engine instead — exactly the case D-213 said a "first-contact wrinkle amends the standard."
- **The architecture this lands:** "one engine, two knobs" becomes **two engines, the same two knobs** — combined for multi-discipline (tri) non-race; the single-sport engines (`generate-run-plan` now; bike later) for single-sport non-race. The retest-vs-taper head + the shared spine (`_shared/endurance/`, `_shared/periodization/`) are the cross-engine continuity, not a single monolith.
- **Shipped:** `generate-run-plan` v143, `create-goal` v223 (commits `b10bcf9d` b-run, `94f1c58f` E3a zones, `b743edb6` retest/D-217).
- **Closes:** open thread **T-3** in `STATE-OF-BOARD.md`.
- **Cross-ref:** `ISLANDS-ORIENTATION.md`, `SPEC-non-race-run-retest.md`, D-213/D-214 (annotated superseded-in-part), the stash (`F-9 provisional combined single-sport cut` — step-1 for bike).

---

## D-219 — E3b: the hours budget sizes the non-race run week (budget-anchored volume), within RUN-PROTOCOL bounds, glass-box on excess; one budget number, strength reserved off the top

- **Date:** 2026-06-28
- **What this decides:** how much a single-sport run non-race week trains. **Answer: the athlete's weekly TIME budget (`weekly_hours`) drives the weekly target (hours→miles via pace), replacing the placeholder `WEEKLY_MILEAGE`/`LONG_RUN_PROGRESSION` tables.** Realizes `SPEC-e3b-bottom-up-volume.md` (budget-anchored model — supersedes the overturned "bottom-up from the long-run ramp" draft).
- **Part 1 — budget sizes the week, legally:** weekly target = `runHrs × 60 ÷ pace` (pace from VDOT/E3a, fitness-default fallback). Sized **within RUN-PROTOCOL's shape rules**: long run distance-precise (§4.5 spine ramp, `_shared/endurance/volume.ts`), easy runs 3–5mi (§5.2) on the **≤3 Mon/Wed/Fri slots** (`assignDaysToSessions`). Budget beyond what a legal week holds is **surfaced glass-box** (`plan.volume_notes`) — never crammed into oversized "easy" runs, never silently exceeded. **Gated on `weekly_hours` present** → races/no-budget callers hit the legacy tables (the no-budget default) and stay byte-identical. `sustainable.ts`.
- **Part 2 — one budget, no double-count:** strength reserved off the top (`strength_frequency × ~1hr`, replacing the `STRENGTH_PROGRAM_HRS` placeholder), endurance = remainder, run/ride split by `run_lean` (run-only = 1.0). `budgetSplit()` guarantees `reserveHrs + runHrs + rideHrs === weekly_hours` exactly (rideHrs is the remainder, no FP drift). `rideHrs` computed + threaded now (no consumer) so the future bike engine plugs in with zero rework.
- **Coefficient picked deliberately:** `EASY_SLOTS = 3` mirrors the Mon/Wed/Fri day grid in `assignDaysToSessions`. **Not baked as fixed-forever** — "budget drives day-count" (more hours → more days, not just a glass-box flag) is a deliberately-deferred later lever. Strength reserve = `frequency × 1.0h` (the near-fixed reservation, SPEC §1).
- **Verification:** 20/20 `generate-run-plan` tests (incl. the §4 sum-acceptance sweep, under-utilization→glass-box, no-session-violates-its-bound). **Proven in the live Deno runtime** via a preview probe (real `index.ts`, injected budget, no DB write): `8h = strength 3h + run 5h + ride 0h`, run week sized to 5h, legal sessions, glass-box on the excess — matched the engine prediction.
- **Deploy status (IMPORTANT):** committed + pushed — `4a9a63e8` (Part 1), `f7377311` (Part 2). **NOT deployed.** Live `generate-run-plan`/`create-goal` still run the old versions, **by deliberate choice (engine-first):** deploy when the budget has a real source (the intake faders supply it), so it lands on a reachable feature, not a room with no door. Proven via probe instead of prod.
- **Cross-ref:** `SPEC-e3b-bottom-up-volume.md`, `ISLANDS-ORIENTATION.md`, E3a zones (`94f1c58f`), the spine (`_shared/endurance/`). Deferred: faders supply the budget; completion-race volume move (SPEC §7); the day-count lever; bike consumes `rideHrs`. See OPEN-QUESTIONS Q-091.

---

## D-220 — Q-088 strength frequency unlock: U/L/U/L 4-day container, endurance-posture–gated strength-focus mode, two developer lanes (build/power), run-path first

- **Date:** 2026-06-29
- **What this decides:** the SHAPE, SCOPE, and SEQUENCING of the strength frequency unlock (Q-088), ahead of any builder code. Grounded in `AUDIT-strength-frequency-concurrent-matrix-2026-06-29.md` (the concurrent-matrix audit Q-088 required). **Decisions only — Tier-1.3 builders NOT started.**
- **Shape — U/L/U/L, structure only:** the 4-day container is Upper/Lower/Upper/Lower. It is a *frequency structure*, NOT an imported hypertrophy-split philosophy. The split decides when/how-many; the lane (below) decides what.
- **Sequencing:** **run-path (`generate-run-plan`) first** — the simpler single-number flow and the case Q-088 is named for. **No optimizer 4th-day placer this cut** → combined/tri stay ≤3 (audit Tier 2.7 deferred; the optimizer has no `placeFourthStrength` and won't get one here). `five_by_five` is **untouched** — stays full-body A/B 2×; it does not gain a 4-day variant.
- **Scope — endurance-posture gate (REVISES the audit §6 "standalone-only" option):** freq-4 is gated on ENDURANCE posture, because interference budget scales with endurance recovery load (Rønnestad — develop blocks pair with reduced endurance volume):
  - endurance `develop` → strength **≤3** (concurrent ceiling; tri **2**).
  - endurance `maintenance` / `parked` → strength **may reach 4**.
  This is a plan **MODE (strength-focus)**, funded by **hours-budget reallocation**, NOT a standalone-only carve-out.
- **Developer lanes — the U/L/U/L container takes exactly TWO content lanes:**
  - **build** — `five_by_five` *lineage* (compound, linear 70→85%). Borrows the lineage; realized as **net-new** upper/lower split sessions (5×5 itself stays full-body 2×).
  - **power** — `neural_speed` *lineage* (heavy / low-rep / RFD). **Reuses `performance_neural`'s existing upper + lower builders, REBALANCED to an even U/L/U/L distribution** — today neural is upper-tilted (1 lower + 2 upper); a real U/L/U/L is balanced 2 lower / 2 upper. **Components exist; the distribution is net-new work.**
  - **EXCLUDED:** aesthetic/isolation as a 4-day developer. `upper_aesthetics` stays a supplementary overlay per `SCIENCE-upper-aesthetics-hypertrophy.md`.
- **Soft sequencing link to E3b (not a hard block):** the parked-endurance posture that unlocks freq-4 is *funded* by the E3b hours-budget reallocation (`budgetSplit()` reserves `strength_frequency × ~1hr` off the top; at freq 4 the strength reserve grows and the endurance remainder shrinks) — so the two touch. But **builder work does NOT block on E3b:** the strength-focus mode scopes against the endurance **posture flag**, and the budget plumbing finishes in parallel. The freq-4 engine logic is provable independently (E3b is proven-not-deployed, D-219).
- **Status:** decisions recorded; implementation (Tier 1.3 builders) deferred to a later cut.
- **Cross-ref:** `AUDIT-strength-frequency-concurrent-matrix-2026-06-29.md`, Q-088, `ROADMAP-strength-engine.md` Phase 2, D-219 (E3b budget), `SCIENCE-upper-aesthetics-hypertrophy.md`, `SCIENCE-concurrent-training-interference.md`, `SPEC-non-race-goal-plan-contract.md`.

---

## D-221 — Strength-primary engine (Program 1): own loading, block-periodization curve, safe estimated retest, "promise + enforcing test" rule

- **Date:** 2026-06-30
- **Architecture:** a dedicated sport-agnostic strength-primary path (`generate-strength-plan` + `composeStrengthPrimaryPlan`) — strength is the SPINE, maintenance endurance underneath. Does NOT delegate to the overlay protocols (their concurrent maintenance fillers + 0.85 cap are wrong for a develop block). Reachable via the UI (Q-096 `tp` fix). **Rejected:** refine `(b)-run` (run-only stopgap, marathon-shaped), combined non-race (F-9, fragile).
- **Loading curve (block periodization, off the entered 1RM, no phase reset):** accumulate 5×5 72→82 → intensify 5×3 84→90 → **DELOAD wk7** (~50% drop — required; a block this long needs recovery every 6–8wk; the prior continuous wk1→11 ramp had none) → peak heavy **doubles** to ~94% (no near-max single — one near-max moment only) → **courtesy retest** (wk12). The **ATR arc + 12wk length + heavy-strength→economy (neural) mechanism are CITED** (Rønnestad/Mujika 2014; Piacentini 2013 = intensity+masters population, **6wk — NOT the timeline**; Filipas 2018 = the 12wk arc). The **exact %s, deload timing, retest-from-submax are CONVENTION**, calibrated by the retest. (`SCIENCE-strength-primary-loading.md`, with the explicit Piacentini-timeline guard.)
- **Materialize "smart server" fixes (scoped to `protocol:strength_primary` rows ONLY; concurrent untouched, 17/17 tests):** (1) lifted the systemic **0.85 %1RM clamp → 1.05** (`resolveStrengthPercentForLift`) — the cap that collapsed every peak/test to 85% (~145 lb); (2) **bypassed the rep-scale** (`calculateWeightFromConfig`, `applyRepScale=false`) — it double-counts an explicit %. Result: the block renders EXACT off the entered 1RM.
- **Retest — sparing courtesy, ONE near-max moment (revised from the first-cut triple):** the peak is doubles (no max single), so the single happens only here — never two consecutive near-max weeks. squat + bench = an OPTIONAL single max-CHECK (~102.5%, a small PR ABOVE the peak double → expresses the gain, fixes retest-below-peak); OHP + deadlift = **estimate** e1RM from a top working set. NOT four max-out days. Conditional: HAS-1RMs → this courtesy; NO-1RMs → required up-front baseline (both depend on Q-097). CONVENTION.
- **RULE — every program states a PROMISE + an ENFORCING TEST:** Get Strong promises a *measured* 1RM gain (modest, honest — concurrent gains ~+4–16%, not a hyped PR) and enforces it with the retest terminal. The promise lives in the plan copy; the test is the terminal. **Generalize to future programs.**
- **Tradeoff / OPEN:** the retest→1RM **write-back does NOT close yet (Q-097)** — blocks don't compound until it fires; do not call "blocks compound" done. Loads anchor to the stored max; barbell-only (Q-098).
- **Verification:** built + materialized live on `45d122e7` (bench 160): wk1 115 → wk6 145 → wk7 105 (deload) → wk11 150 (94% double) → wk12 165 (102.5% courtesy check, above the peak — expresses the gain). Commits `fd0e8e9c` → `f1337caa` → `89578531` → `2b5458d8` → `6891e902` → `fca7cbe1` (one near-max moment); deploys generate-strength-plan v5, create-goal v228, materialize-plan, generate-run-plan v147.
- **Cross-ref:** `SPEC-product-shape.md` (Program 1), `SPEC-strength-primary-shape.md`, `SCIENCE-strength-primary-loading.md`, `strength-primary-plan.ts`, Q-096 (closed), Q-097/Q-098 (open/parked).

---

## D-222 — Get Strong maintenance-mileage band: typed-miles guardrail, ceiling 180 min/wk, hinge/squat re-split, no-silent-drop

- **Date:** 2026-06-30
- **The band (typed mileage, science-guardrailed):** the athlete TYPES the weekly miles they want to hold; the engine clamps to a maintenance band (not a menu). **Floor 60 min/wk** (holds aerobic base — Hickson 1981, Spiering 2021); **ceiling 180 min/wk** (interference cap — Wilson 2012), pace-mapped to miles via the athlete's learned easy pace. Inside → build, **no note**; over → cap + note; under → bump + note. Flat, no ramp (maintenance). Wired end-to-end: builder input → `training_prefs.target_weekly_miles` → create-goal (reads it + learned easy pace) → generate-strength-plan → composer → `plans.config.volume_notes`, surfaced on the goal card.
- **Ceiling raised 150 → 180 (~2.5h → ~3h, ≈18 mi at 10:00/mi):** interference scales with **intensity/duration, not easy volume** (Wilson 2012) — all-easy zone-2 is the lowest-interference modality, so 150 over-protected an established base (capped a real 20–25 mi runner at ~14). 180 lets them sit near true maintenance while strength still clearly leads. CONVENTION on the exact minutes; the cited finding is *that* running interferes by dose. **Note copy = plain-language reason first, citation as the receipt.**
- **No silent drop (the bug this fixed):** a Get Strong plan showed 2×35 min runs against a typed 25 mi — the fixed default, NOT a cap (at the ceiling, sessions are always ~ceiling/2·pace ≈ 75–90 min regardless of pace). Root cause: the band guard required a learned easy pace AND typed miles; missing pace → typed miles silently dropped to the default. **Fix:** honor typed miles whenever they exist — if pace is unlearned, estimate at a **10:00/mi fallback + disclose** ("re-maps once you log easy runs"), never drop. Plus the note was stored in `config.volume_notes` but **nothing rendered it** — now surfaced on the goal-card plan link.
- **Squat frequency re-split (concurrent recovery):** the U/L/U/L split squatted heavy on BOTH lower days (Lower A primary + Lower B secondary) AND Lower B stacked back-squat + deadlift — too much heavy lower on untrained legs. **Fix:** Lower A = the one heavy Back Squat day (+ RDL); **Lower B = hinge day** (Conventional Deadlift low-volume + a lighter **Front Squat**) — one heavy back squat/week, no session stacks heavy back-squat + heavy deadlift. The split/progression/deadlift-volume were already sound (kept). **Mon/Tue/Thu/Fri spacing is correct** (standard U/L/U/L — back-to-back days alternate upper/lower, no muscle hit two days running) — NOT changed.
- **Verification:** 10/10 composer tests (added squat-frequency + no-silent-drop cases); proven on `45d122e7`'s real pace. **Rejected:** flat hours-band tier (retired — pace + science bound volume); dropping typed miles when pace unlearned; keeping 150 ceiling.
- **Cross-ref:** `strength-primary-plan.ts`, `SCIENCE-strength-primary-loading.md` (band section), `generate-strength-plan/index.ts`, `create-goal-and-materialize-plan/index.ts` (Hop 1), `NonRaceBuilder.tsx` (typed input), `GoalsScreen.tsx` (note surfacing), D-221 (the engine).

---

## D-223 — Get Strong retest REMOVED (broken by construction) → consolidation week; ratchet-up-only write-back guard

- **Date:** 2026-07-01
- **The bug (caught from a real materialized plan):** the wk12 "estimate" retest prescribed a **fixed `1×3 @ 88% 1RM`** for OHP + Deadlift. Epley e1RM from a triple = weight × 1.10, so 0.88 × 1.10 = **0.968 → it back-projects ~97% of the entered 1RM every time.** The estimate retest was **mathematically incapable of showing a gain** — it logged a guaranteed ~3% LOSS. In the dogfood plan: OHP peaked 105×2 then "retested" 95×3 (est ~105, below the entered 110); DL peaked 140×2 then 130×3 (est ~143, below 152). The check lifts (Bench/Squat `1×1 @ 102.5%`) had the inverse flaw — they *assumed* a +2.5% PR off the old max rather than measuring one.
- **Decision — REMOVE the retest, don't patch it.** A retest that prescribes a load off the OLD max is circular; it can't measure a new one. The block now ends on a **light Consolidation week** (3×3 @ ~80% loggable top triples, decompress from the peak) with honest copy: *"Block complete — a light consolidation week. A proper retest is coming soon; log your top sets for now."* No cliff, no fake test. **Crucially, no `1rm_test`/`estimate_1rm`/`retest` tags remain anywhere** — nothing writes a 1RM off a sub-max estimate. A real *work-up-to-max* (AMRAP/true rep-max) retest will replace it later.
- **Permanent guard (kept even with retest gone) — ratchet-UP-only write-back:** `StrengthLogger.saveBaselineResults` now only overwrites a stored 1RM when the new result **exceeds** the prior (a first-time baseline with no prior still writes freely). A test/estimate may only RAISE a 1RM, never lower it — permanent guard against the "score that lies." Honest UI: the save toast names any lift held at its higher stored max.
- **Anchor-mapping trace (squat 110 = OHP 110, squat < bench 160) — LOOKED, did not fix:** `materialize-plan` resolution is **clean** — `pickPrimary1RMAndBase` reads OHP from `overheadPress1RM/ohp/overhead_press/overhead` and squat from `squat/squat1RM/squat_1rm`; **no code path makes OHP borrow the squat value** (a missing OHP anchor renders "baseline missing," not a weight). So the equality is in the stored `performance_numbers` data, not the read. One real smell found: the OHP 1RM lives under **multiple key names** across paths (`overheadPress1RM` vs `overhead` vs `ohp`) — a read/write key-drift footgun (cf. the documented fiveK/fiveK_pace one). **Open:** confirm the stored value (DB read, needs go-ahead) before re-entering — could be a write/seed issue or the key-drift, not real numbers. Low-load rounding stalls (wk2/wk3 squat both 85 lb) noted, not fixed.
- **Kept sound (per Michael):** the arc itself — accumulate→intensify→deload→peak — and the run distribution/spread. Untouched.
- **Verification:** 11/11 composer tests (retest tests replaced by a CONSOLIDATION test asserting no test-tags + light loggable triples + honest copy). Deployed generate-strength-plan; StrengthLogger pushed.
- **Cross-ref:** `strength-primary-plan.ts` (buildArcPhases/workLoad/week-loop), `strength-primary-plan.test.ts`, `StrengthLogger.tsx` (saveBaselineResults guard), `materialize-plan/index.ts` (anchor resolution — read only), D-221 (the engine), D-222 (the band).

---

## D-224 — AMRAP retest: one reusable baseline/retest tool (entry establishes, exit re-measures), cluster e1RM, OHP-key guard

- **Date:** 2026-07-01
- **The fix for D-223's removal:** re-add the retest, correctly. **AMRAP** holds a **fixed ~88% weight** and **opens the reps** — getting stronger shows up as MORE reps → higher e1RM. It cannot force a loss the way the old fixed-`88%×3` estimate did (that back-projected 0.88×1.10 = 0.968 of the old max every time). The wk12 phase is `Retest` again (superseding the D-223 consolidation stopgap): one AMRAP session per key lift, ONE scored working set (warm-up is copy-guided so the estimate is clean), tag `1rm_test`, per-lift rep zones (squat/bench 3–5, deadlift ≤5, hard ≤10).
- **ONE tool, two jobs (the reusable-baseline framing):** the SAME guided AMRAP session both **ESTABLISHES** baselines (entry / no-1RM → athlete picks a ~5-rep weight; the composer's `baselineTestWeek` + the standalone "Baseline Test: Lower/Upper/**Full** Body" launcher in `TrainingBaselines` → `AppLayout.onOpenBaselineTest`) and **RE-MEASURES** them (exit / wk12 → ratchet-up write-back → next block compounds). Same logger flow, same math, same guard. Closes the no-1RM entry gap AND block-to-block compounding on one surface. Added the "Full Body" type (all 4 lifts) to `getBaselineTestType` + the logger rebuild.
- **Math — cluster Epley + Brzycki, ≤10 cap:** `calculate1RM` now averages Epley `w×(1+r/30)` and Brzycki `w/(1.0278−0.0278r)`, reps **capped at 10** (accuracy degrades above ~10; Brzycki's denominator collapses). A logged single returns itself. **CITED — LeSuer et al. (1997)**, *J Strength Cond Res* 11(4):211–213 (error within ~3% for 2–10 reps; Epley/Brzycki best at low reps; **all equations underestimate the deadlift** → the deadlift retest copy flags "reads conservative"). **⚠ The PMID Michael supplied (9355611) was a legal case report — 5th misattributed citation the verify-gate caught; real cite is by journal/vol/pages.**
- **Accuracy-critical copy:** the estimate assumes a set taken **to/near failure**, so the framing lands on **"stop at ~RPE 9" (≈1 rep in reserve)** — near enough to hold accuracy, safe enough solo. Not "stop early." The RIR-acceptance gate was widened: an AMRAP set (or a tag-retest) registers at **RIR 0–3** (AMRAP is near-failure); named non-AMRAP baselines keep the 2–3 sub-max gate.
- **OHP-key write guard:** `saveBaselineResults` canonicalizes any OHP variant key (`overhead`/`ohp`/`overhead_press`) → `overheadPress1RM` before writing, so a result can never drift into a key materialize doesn't read. (Anchor read confirmed the stored keys are clean: `bench/squat/deadlift/overheadPress1RM`, no duplicates; squat=OHP=110 is **real data**, not a mapping bug — safe to re-enter.)
- **Verification:** 11/11 composer tests (the CONSOLIDATION test replaced by an AMRAP-RETEST test: 4 sessions, one AMRAP set each, fixed 88%, open reps, `1rm_test`, RPE-9 + LeSuer-deadlift copy, no fixed-3). Client type-checks clean (the one TrainingBaselines error at :779 is pre-existing, unrelated). Deployed generate-strength-plan; StrengthLogger + TrainingBaselines pushed.
- **Cross-ref:** `SPEC-amrap-retest.md`, `strength-primary-plan.ts` (amrap helpers + retest week + baseline week), `StrengthLogger.tsx` (cluster math, RIR gate, OHP guard, Full type, AMRAP working set), `TrainingBaselines.tsx` (Lower/Upper/Full launcher), D-223 (removal this corrects), D-221/D-222.

---

## D-225 — Get Strong hybrid add-ons: accessory-bias engine (glute | hyrox), the Hyrox long-run→station combo, day-agnostic long-run pick (Sat/Sun)

- **Date:** 2026-07-02
- **Accessory-bias chassis (`strength-primary-plan.ts`, `accessoryBias?: 'glute' | 'hyrox'`):** a `+1` accessory slot on **Upper A** only (movement-familiarity station, qualitative loading so it needs no config entry), skipped on deload/retest. **Guard = protect the PLAIN plan, not the add-on's own days:** plain (no bias) is **byte-identical** to the pre-add-on output; glute = +1 Upper A accessory; hyrox = +1 Upper A accessory **plus** the combo below. (The byte-identical requirement is about plain vs bias under the SAME args — it was briefly mis-scoped to forbid hyrox touching its own strength days; corrected same session.)
- **Hyrox fatigued-legs = ONE long-run→station combo, on the long-run day.** The signature Hyrox stimulus (running on pre-fatigued legs) is delivered as a same-day PAIRING: the (unshortened) long run, then a fatigued-legs station appended after it (run-first via sort), tagged `fatigued_legs` + `bias:hyrox`. **Placement is the ONLY legal slot** — heavy lower is fixed at Tue (squat) + Fri (hinge); the long run already carries the day's leg load, so the station piggybacks on real fatigue instead of adding a new leg day near heavy work. Verified: no legal standalone leg-fatiguing slot exists on the 4-day U/L/U/L week (every non-lower day is inside a heavy-lower 24h-pre/48h-post window). NOT a mixed run+strength row (that needs new materialization — not forced); the real full-Hyrox engine (quality endurance + power/RFD, own arc) stays parked as **Q-103** (Q-088 lineage).
- **Day-agnostic long-run pick — Option A (chosen over B/C):** the long-run day is a **user pick CONSTRAINED to Sat/Sun** (intake picker limited; `preferred_days.long_run` → create-goal → generate-strength-plan → composer). Only the weekend clears the heavy-lower windows (Sat = 4d from Tue squat; Sun = 48h before it); a Monday pick would drop the combo 24h before the squat and there is **NO optimizer on the strength-primary path** to catch it. So: honor Sat/Sun, fall back to Saturday for anything else. **B** (add adjacency validation to the composer) and **C** (route Get Strong through the real week-optimizer) are the **Q-088-lineage upgrades** for if the fixed grid ever unfixes. Glass-box microcopy on the picker: "Sat or Sun — your heavy lower days (Tue/Fri) need clear space around them."
- **Combo clarity (copy):** the pair reads "Combo 1 of 2 — Long run" / "Combo 2 of 2 — Fatigued-legs station · start within ~10 min of finishing the run" (day-agnostic; "Saturday" removed). The grouped calendar card (one container, total duration, numbered steps, connector line) is **Q-104**, phase 2, client bundle post-Q-097.
- **Equipment substitution:** station movements route through `materialize-plan:substituteExerciseForEquipment` (home gym → Dumbbell/Walking-Lunge fallbacks; verified live). Mileage: **D-222 hard cap RETIRED** — typed miles honored (no clamp), `volume_state` emitted, honest client tradeoff copy replaces the old "Up to X" cap string (staged in the client bundle).
- **Verification:** 101/101 composer/guard tests (plain byte-identical; glute strict; hyrox = +1 Upper A + one long-run combo, run unshortened, deload/retest untouched; long-run pick: Sunday moves the combo + strength days don't move + Monday clear, illegal→Sat). Live sample plans confirmed. Deployed generate-strength-plan + create-goal-and-materialize-plan; client (NonRaceBuilder toggle/picker/copy) pushed to web, on-device only after an Xcode rebuild.
- **Cross-ref:** `SCIENCE-glute-accessory-bias.md`, `SCIENCE-hyrox-accessory-bias.md` (§7), `strength-primary-plan.ts`, Q-103 (parked full-Hyrox engine), Q-104 (grouped card), D-222 (mileage cap retired).

---

## D-226 — Never hardcode Michael's data: user state goes through the app, always

- **Date:** 2026-07-02
- **Decision:** never manually write / hardcode Michael's account data (baselines/1RMs, plans, logged sets — anything he does in the app) into Supabase / `performance_numbers`. It MUST flow through the app's real path (baseline-test / logger → `saveBaselineResults`, intake → create-goal, etc.).
- **Why:** he's dogfooding. A direct DB write bypasses the exact path he's testing, **MASKS bugs** (a write-back that isn't firing looks "fixed"), and isn't what a real user gets. He vetoed a direct PATCH of his bench 1RM hard: *"by the app! do not hardcode anything i do anywhere!!!"* Service-role DB access is for **read-only diagnosis + isolated throwaway-user verification ONLY.** If a value needs to land in his account, route it through the UI or FIX the app path — never a DB write. (Ties to the Q-097 tester fix: the real fix is making the write-back fire, not patching the row.)
- **Cross-ref:** memory `feedback-no-hardcoding-user-data`, `feedback_db_credential_access`, Q-097.

---

## D-227 — Q-097 CLOSED: 1RM write-back live-confirmed; the strength-test honesty arc

- **Date:** 2026-07-02
- **Decision / what shipped:** Q-097 is **live-confirmed CLOSED** — the baseline-test e1RM reaches `performance_numbers`, verified on device (**bench 160→150, OHP 110→100** both landed through the app). Blocks compound. The dogfood surfaced five bugs no test suite would catch; the fixes hardened the whole strength-test path into "tests are their own class":
  - **The reps field bug (the blocker):** the AMRAP working set rendered no reps input (`reps===undefined` hid it) — a 140×3 saved as "0 reps @ 140". Fixed the render gate to keep the reps field for `amrap`/`repMaxTest` sets.
  - **Down-write reconciliation prompt (supersedes D-223's silent ratchet-up-only):** a test result BELOW the stored 1RM no longer silently holds — it prompts **Keep X / Update to Y**, per lift, one-tap auto-commit. Silent-hold and silent-overwrite are equally dishonest; the athlete decides. (Bench 160→150 landed via this.)
  - **RIR removed from test sets:** the AMRAP protocol ("stop at ~RPE 9 / form break") IS the near-max signal; asking for RIR is friction. Done on an amrap/repMaxTest set completes with no RIR, no confirm strip; the populate computes e1RM from reps×weight with no RIR gate. The RIR cell + nudges are hidden entirely on a baseline test.
  - **Tests-as-a-class:** calendar/Today read **"TEST"** not a strength session; the Performance screen renders a **test-result frame** (per-lift reps×weight→e1RM, prior→now delta, kept/updated/new-baseline, deadlift-conservative note, 0-rep "retest for a number") instead of the training table + execution/volume; **no auto rest timer, no "last:" anchor, no previous-session prefill** on a test.
  - **Piece 2 backstop:** analyze-strength-workout suppresses the execution score + nulls the training narrative for a test (an 0-rep test can't be narrated as "Execution 160%").
- **Why:** the write-back was the last open thread on "blocks compound." The dogfood proved it fires; the honesty fixes ensure a test never lies (up or down) and never reads as training.
- **Cross-ref:** Q-097 (CLOSED), D-223 (superseded), D-224 (AMRAP), `SPEC-amrap-retest.md`, `StrengthLogger.tsx`, `analyze-strength-workout`, `session-detail/build.ts`, `MobileSummary.tsx`.

## D-228 — Feel-based test warmup (one shape, per-lift dosing) + Baselines launcher (one flow, two entry points)

- **Date:** 2026-07-02
- **Decision:** the baseline-test **warmup ramp** is guidance, not prescription — reps are unseeded (feel hints carry it), and weight dosing scales **per lift**: when a 1RM exists, %-of-max anchors ("~50% — easy / ~70% — moderate"); when none, per-lift add-hints (OHP `add 10–20`, bench `add 20–30`, squat/DL `add 25–50`). Generic "add 25–50 lb / 10 reps" was false precision twice over (a press is not a deadlift — Michael's OHP session was the evidence). The **Baselines launcher** (Lower/Upper/Full links on TrainingBaselines) runs the SAME guided AMRAP flow as the plan retest: seed each lift's test set ~88% off the stored 1RM when one exists, else bar-start (45 / DL 95) into the **discovery loop** ("more than ~8 clean reps? too light — rest, add, go again"). One flow, two entry points, no separate math.
- **Why:** one ramp shape, per-lift dosing; the named test and the plan retest must be the same tool. Load-timing handled by a pristine-guarded one-shot re-seed effect (performance_numbers loads async).
- **Cross-ref:** `SPEC-amrap-retest.md` (warmup-dosing + launcher sections), `StrengthLogger.tsx` (`createBaselineTestExercise`, `baselineSeedFor`), D-227.

## D-229 — Pull-ups as a 5th tracked lift: rep-based, NOT %1RM (Q-102 baseline model settled)

- **Date:** 2026-07-02
- **Decision:** `performance_numbers.pullupMaxReps` — an integer max-clean-reps baseline (0 is valid, "goal: your first pull-up"), added to the canonicalization guard. Fifth field on TrainingBaselines; a pull-up rep-max set in the baseline test (bodyweight, no e1RM, no RIR — the count IS the result). Write-back reuses the pipeline (ratchet-up auto / down-write prompt). **This settles the Q-102 baseline-model question (rep-based, not %1RM) for the BASELINE layer only** — the Pull-Up `%1RM` *plan loading* bug stays open under Q-102 (settles with the skill lane / Q-098).
- **Why:** the app was scoring pull-ups as a %1RM lift (a nonsensical "115 lb Pull Up"). A bodyweight lift is rep-based; the baseline captures reps.
- **Cross-ref:** Q-102, Q-098, Q-100; `TrainingBaselines.tsx`, `StrengthLogger.tsx`, `materialize-plan` read-side.

## D-230 — "Spine is truth, arc is voice" is ~6% enforced on the coach; finish the D-151 migration, don't re-invent

- **Date:** 2026-07-02
- **Decision / finding:** the 2026-07-02 audit stack (see `AUDIT-app-synthesis-2026-07-02.md`) established that the app's athlete-continuity bet — one deterministic spine every surface reads — is **architecturally real but ~half-wired.** The "voice" contracts (Arc, `session_detail_v1`) read the cached `state_trends_v1` faithfully; but the shared **coach engine reads the spine for ~1 of ~17 verdict families (≈6%)**, recomputing the rest in parallel (even shadowing snapshot columns it fetches), and there is **no canonical capacity truth** — the plan PRESCRIBES load off the typed baseline (150) while the coach JUDGES off the learned aggregate (125). **Direction (not yet built):** finish the migration D-151 already proved on one axis — one canonical capacity resolver (typed-anchored) that both prescribe + judge call; move the coach's verdicts onto the spine ("read the columns you already fetch"); retire the forks (D-213), don't widen them.
- **Why:** every athlete-visible "score that lies" (the bench verdict, the contradictory State rows) is the same root — a surface computing its own truth instead of reading the one source. This records the audited state + the agreed direction so the next session starts from the map.
- **Cross-ref:** `AUDIT-app-synthesis-2026-07-02.md`, `AUDIT-spine-conformance-2026-07-02.md`, `AUDIT-state-screen-2026-07-02.md`, `SCREEN-CONNECTIVITY.md`, D-149/D-150/D-151/D-213, Q-106/Q-107/Q-108.

## D-231 — Canonical Capacity Resolver: typed is SSOT, learned suggests, one resolver is the sole answer

- **Date:** 2026-07-02
- **Decision (ratified, build gated — see below):** there will be **one canonical resolver function** — the sole answer to "how strong/fast is this athlete for lift/discipline X." **Precedence:**
  1. **Typed `performance_numbers` wins when fresher than the last retest** — the athlete's declared/tested capacity is the anchor. It is what the plan already prescribes off (`materialize-plan mergeAnchor1RmLb`), and it is what judgement must also use.
  2. **`learned_fitness.strength_1rms` (and the learned pace/FTP aggregates) fill gaps** where no typed value exists, and **surface drift as a *suggestion*** when they diverge from typed (the existing `_shared/state-trend/reconcile.ts` bridge: ≥3 samples, ≥5% divergence → *suggest* updating typed). **Learned never silently overrides typed.**
  3. **Raw `exercise_log.estimated_1rm` is never truth** — per-session only, feeds learning, not resolution.
- **Enforcement:** **direct substrate reads for a capacity answer are forbidden going forward.** Both the **prescribe** path (`materialize-plan`) and the **judge** path (the coach's strength per-lift verdict, `coach/index.ts:1969`/`2275`) call the resolver. This collapses the flagship **150-vs-125 inversion** (plan loads off typed-150 while coach grades off learned-125 → the "Bench 125→115" score-that-lies), the State strength contradiction (H1/H3), and folds the key-alias (`bench_press`/`benchPress`/`ohp`) and unit (sec/km vs sec/mi) footguns into one canonicalizer.
- **Why:** the **user is the source of truth for declared capacity** — consistent with **D-213 (extend the engine, retire the forks; Arc-as-SSOT)** and the athlete-continuity bet (D-149/150/151). A learned aggregate that silently overrode the athlete's own tested number would be the engine telling the athlete they're wrong about themselves — the exact "two truths about one person" failure the spine exists to end. Typed-anchored keeps the athlete's declared reality primary while still letting the app *notice* and *offer* when logged performance has moved.
- **Build gate:** implementation is **gated on Q-097's write-back convergence fully landing** (learned↔typed cannot reconcile until the down-write path is closed). This entry ratifies the precedence + the single-resolver rule now so it's settled before code; the resolver itself is step 1 of the D-230 roadmap.
- **Cross-ref:** D-230 (the audited finding + roadmap), D-213 (retire forks / SSOT), D-151 (the proven single-axis migration), D-224 (strength write-key canon), D-226 (user data goes through the app), Q-097 (convergence gate), Q-106 (roadmap); `AUDIT-spine-conformance-2026-07-02.md` §4/§6/§7, `_shared/state-trend/reconcile.ts`, `materialize-plan`, `coach/index.ts`.

## D-232 — Glass-box verdict language: every athlete-facing verdict is a plain sentence citing its evidence

- **Date:** 2026-07-02
- **Decision (standard, applies to ALL current + future State/athlete-facing rows):** no athlete-facing surface renders a **raw engine value or a bare delta**. Every verdict is a **plain-language sentence that cites its own evidence** — the "My Record" / bench-row pattern: **what we measured, versus what, and what it means.**
  - Not `125 → 115 lbs` → **`Working ~125 vs your 150 baseline — suggest 115 this week`** (D-231, shipped).
  - Not `feels 0.9 harder` → **`Sessions feeling a bit harder than usual (avg 6.4 vs your typical 5.5)`** (the RPE-row change, this session).
  - Not `Marathon — 0w out` next to "Add a race target" → **no fabricated countdown at all** (H4, this session).
- **Why:** a bare number or delta is a **black-box assertion** — the athlete can't see what it's comparing or why, so a wrong/placeholder value (the `?? 0` countdown, the baseline-blind back-off) reads as authoritative fact. Citing the receipt makes the surface **falsifiable by the athlete** — they can see the comparison and catch the lie. This is the display-layer half of the same "single honest truth" bet the spine/resolver work serves (D-149/151/213/231): the engine computes one truth; the surface must *show its work*, not just its conclusion.
- **Scope + enforcement:** the rule the next State-row / verdict-string change is measured against. **Q-111 designs against this** — its plan/history-aware verdict strings must be glass-box (plain verdict + receipt + the plan/history context, e.g. "Bench down ~10% over the marathon block — expected. Rebuild started, Week 1 of 12"). Word-mapped magnitude buckets (tone escalates with the number) are the mechanism for turning a delta into a plain verdict without losing the receipt.
- **Extension — progressive disclosure + provenance (added 2026-07-02; standard, incrementally built):** glass-box is not just the row sentence — it's three tiers:
  1. **Row level:** verdict + a *minimal* receipt (the number's headline evidence). E.g. `Easy-run pace ↑6.5% over 6wk · 5 runs · last 4d ago` — window + sample count + recency, so a 6-week trend can't read as "now" (the RUN-row case that prompted this: a real 6-wk pace-at-effort trend the athlete misread as a volume claim because the row cited no evidence).
  2. **Expanded level:** the *full* contributing factors with values, baselines, windows, recency. The existing **"open for more"** surface is the hook. **First target: the `FATIGUED` headline** → a factor breakdown, e.g. `Why: perceived effort up (6.4 vs 5.5 typical) · load balanced · 1 signal concerning` — so the opaque catch-all (one RPE signal firing `bodySignalsConcerning`) becomes legible.
  3. **Provenance tags:** every metric declares **source + freshness** — `Garmin · via Strava · logged · estimated · last run 14d ago`. This generalizes the existing `est (FTP)` pattern into a system-wide convention (a value's trustworthiness is part of its display).
- **Why the extension:** the RUN "+6.5%" incident proved the *number* can be correct while the *surface* still misleads — the fix is showing the evidence at the depth the athlete asks for (glance → tap → provenance), never a bare assertion at any tier.
- **Extension 2 — narrative claim-grounding (added 2026-07-03; standard):** the **LLM narrative may only assert what the deterministic layer hands it** — plan state, session counts, trend verdicts, dates. **If a narrative claim can't cite a grounded deterministic fact, it doesn't ship.** First confirmed defect: the "open for more" prose said *"one week into Get Stronger"* and treated this week's off-plan sessions as the block, for a plan that **starts next week** — because `resolvePlanWeekIndex` clamps pre-start weeks to 1 (`Math.max(1,…)`) and the narrative was fed "currently in week 1". Fixed by grounding the plan line on `planHasStarted(plan_start_date)`: pre-start → narrated as pre-start ("your block starts Monday"), never in-block; the week chip's index goes null pre-start too. This is the first crack in the **LLM-narration / claim-grounding seam the app synthesis flagged as unaudited** — the full sweep is its own audit (Q-112).
- **Cross-ref:** D-231 (the bench-row exemplar), Q-107 (H1/H4 the "score that lies" catalog this ends), Q-111 (the design round that applies it to strength tone + mixed-clocks + FATIGUED breakdown), D-226 (user-facing honesty); `StateTab.tsx`, `src/lib/race-header.ts`, `_shared/response-model/weekly.ts`, `_shared/state-trend/classify.ts` (sampleCount/newestAgeDays the receipts read).

## D-233 — Efforts voice standard: what athlete-facing copy may and may not claim

- **Date:** 2026-07-03
- **Decision (consolidation — the standard all athlete-facing strings conform to; folds D-231/D-232 + the receipts/readiness work into one reference):** every verdict, receipt, label, Why, and suggestion the app shows obeys these:
  1. **Glass-box (D-232):** no bare number/delta — a verdict is a plain sentence that cites its own evidence (what we measured, versus what, over what window). Progressive disclosure: row receipt → "open for more" breakdown → provenance.
  2. **Load language, not state language.** Claim only what's **measured**. `LEGS LOADED` (a lower-body session happened — a fact) not `LEGS SORE` (an unmeasured sensation). Precedent: Whoop "muscular load"; the failure we avoid is Garmin asserting a feeling it can't detect. **Exception (typed-beats-learned, D-231 applied to sensations):** if the athlete **declares** the sensation (Q-049 soreness slider), state language becomes his own truth → `LEGS SORE`.
  3. **Cite the athlete's own logged data, never an inferred sensation.** "efforts since feeling harder (5.3 vs 4.4)" is legitimate — it quotes his logged RPEs. "you're tired" is not — we didn't measure it.
  4. **Name the fact, be surgical.** Attribute to the specific session/marker and its effect ("Monday's lower-body session → endurance efforts harder"), not a blunt state ("FATIGUED"). Reserve blunt systemic labels (`FATIGUED`) for genuinely systemic pictures (elevated ACWR / ≥2 signals); a single unattributed signal is `EFFORT UP`, not fatigue.
  5. **No redundancy.** Don't restate a receipt the athlete already sees; don't say the same signal twice ("effort up" + "1 body signal declining").
  6. **Conditional physiology, never prescription.** Generic physiology (repeated-bout effect) is phrased "expect … typically" not "will"; suggestions are one sentence, deterministic inputs only, and **never override the plan or prescribe recovery modalities** (never "skip the session", never "ice/stretch/massage").
- **Canonical examples (newest, 2026-07-03):** `Working ~125 vs your 150 baseline — suggest 115 this week` (D-231); `A bit harder than usual (avg 6.4 vs your typical 5.5)` (RPE); `↑6.5% over 6wk · 5 runs · 4d ago` (trend receipt); `Why: Monday's lower-body session — first lunges in months, RPE 9 — efforts since feeling harder (5.3 vs 4.4) · load balanced, nothing systemic` + `Expect this to ease over 2–3 days — new movements hit hardest the first time…` (loaded-legs); the `LEGS LOADED` vs `LEGS SORE` vs `EFFORT UP` vs `FATIGUED` label rule.
- **Cross-ref:** D-231, D-232 (+ extensions), Q-107/Q-111/Q-112; `loaded-legs.ts`, `readiness-receipts.ts`, `trend-receipt.ts`, `race-header.ts`.

---

## D-234 — Soreness standardized on the Hooper 1–7 scale, two-field topology, before-session provenance guard

- **Date:** 2026-07-03
- **Context:** soreness became a first-class Axis-1 (cross-domain carryover) trigger, but the app had soreness on a **1–10** scale in two places while a new post-completion popup proposed **0–3** — a scale collision (coach LEGS SORE `≥7`, snapshot averages, analyze-strength `/10`, and the carryover Z-score baseline would all silently break or corrupt).
- **Decision:**
  1. **Scale = Hooper 1–7, app-wide** (industry-standard athlete-wellness scale). Anchors: **1 = none · 4 = moderate · 7 = extremely sore**; UI shows anchor labels at 1/4/7 only.
  2. **Two soreness fields, distinct meanings, NOT duplicates** — no new column:
     - `readiness_checkins.soreness` = **DAILY** whole-body readiness check-in → coach LEGS SORE, compute-snapshot.
     - `workouts.workout_metadata.readiness.soreness` = **PER-WORKOUT** post-completion soreness → the popup (generalized from strength-only to all disciplines) + the cards' carryover.
  3. **Migration = linear rescale** of history, `round(1 + (v−1)·6/9)` (7→5 exact), NOT versioning — chosen because soreness history is sparse, so rescaling gives one coherent scale immediately vs. a baseline kept thin for weeks. `supabase/migrations/20260703120000_soreness_hooper_1to7_rescale.sql`.
  4. **Consumer retune (one pass):** coach LEGS SORE `≥7 → ≥5` (Hooper "more than moderate" = clearly sore, the exact rescale of ≥7/10); analyze-strength `/10 → /7` with internal cuts rescaled (`≤3→≤2`, `>5→>4`, Moderate band `≤5→≤4`); carryover reads the per-workout field.
  5. **BEFORE-SESSION PROVENANCE GUARD** (`resolveCarriedInSoreness`): the carryover soreness must be one the athlete **carried INTO** the session — excludes the target workout's OWN entry AND any entry from a session that didn't START before the target started. A soreness value reported *after* a session can never trigger *that* session's card. Pairs with D-233's declared-vs-inferred split: only a logged slider earns "you reported sore legs"; inferred paths stay LOAD language.
  6. **Scale guard:** the resolver drops any out-of-range (>7) value so an un-migrated 1–10 leak can never blend into a Z-score baseline.
- **Coordination note:** the client scale-switch (strength-logger dropdown + the new all-discipline popup) must ship to 1–7 with the migration; until then a legacy client could write a 1–10 value (the >7 guard catches 8–10; the 1–7-range ambiguity is low-impact given sparse logging). UI spec: `docs/DESIGN-soreness-input.md` (spec only, held for review).
- **Fixtures:** `cross-domain-carryover.test.ts` — rescale 7→5; 1–7 fires at Z≥1 & ≥mean+1; mixed-scale (9) never blends; baseline-thin silence; the provenance guard (target's own entry ignored). Coach ≥5 covered by the coach path.
- **Cross-ref:** D-233 (voice/provenance), Axis 1 (`SELF-AWARENESS-MAP.md`), `DESIGN-cross-domain-carryover.md`, Q-049 (readiness check-ins), Q-115 (recovery-positive).

---

## D-235 — Wellness set standardization: energy+soreness on Hooper 1–7, sleep stays HOURS (documented exception)

- **Date:** 2026-07-03 (extends D-234 from soreness-only to the full readiness set)
- **Context:** D-234 put soreness on Hooper 1–7. Extending to the set, a consumer trace found **sleep is not a Likert — it's HOURS** (client slider `0–12h step 0.5`, shown "Xh", thresholds `≥8/≥7/≥6h`, normalizer `sleep/12`). The linear rescale can't apply to hours, and there's no principled hours→quality map.
- **Decision:**
  1. **energy → Hooper 1–7** (was 1–10 Likert), same linear rescale `round(1+(v−1)·6/9)`. Joins soreness.
  2. **sleep STAYS hours** — objective, arguably better than a subjective quality Likert; documented exception. So the set = **two 1–7 subjective ratings (energy, soreness) + one objective measure (sleep hours)**.
  3. **Extracted `_shared/readiness-scale.ts`** (rescale + `energyLevel`/`sorenessLevel`/`sleepQuality` bands + `overallReadinessLabel`), unit-tested — because D-234 had **missed** the `calculateOverallReadiness` normalizer (still `(10−soreness)/10`), which the extraction fixes and the matrix fixture now guards against recurring for the next skipped consumer.
- **Energy consumer retune map (analyze-strength, 1–10 → 1–7):** `energy_level` `≥8/≥6` → `≥6/≥4`; displays `/10` → `/7`; `energyGood ≥7` → `≥5`; `energy-low <6` → `<4`. **Normalizer fixes** in `overallReadinessLabel`: energy `energy/10` → `(energy−1)/6`; soreness `(10−soreness)/10` → `(7−soreness)/6`; sleep `sleep/12` unchanged. compute-snapshot avg + coach raw echo: no threshold change (rescale unifies history). **Scale guard:** energy/soreness values outside 1–7 are dropped from the overall score (un-migrated 1–10 leak can't blend).
- **Fixtures:** `readiness-scale.test.ts` — rescale 7→5; band labels; `overallReadinessLabel` pinned matrix (Excellent/Good/Fair/Poor over 1–7 energy/soreness + hours sleep); mixed-scale `>7` drop; partial inputs. Plus `cross-domain-carryover.test.ts` stored-0 soreness edge (0 dropped by ≥1 guard).
- **ATOMIC SHIP (Michael applies manually — same deploy):**
  1. **Migration** `supabase/migrations/20260703120000_soreness_hooper_1to7_rescale.sql` (soreness + energy, both fields; sleep untouched). Apply via the **Supabase SQL editor** (per the `readiness_checkins` precedent — that table is created/managed via SQL editor, NOT `supabase db push`). Command if using CLI against the linked project: `supabase db execute --file supabase/migrations/20260703120000_soreness_hooper_1to7_rescale.sql` — but SQL-editor paste is the established path.
  2. **Client files that MUST land in the same deploy** (else a legacy client writes 1–10 into a rescaled world): `src/components/StrengthLogger.tsx` — energy slider `max=10`→`max=7`, soreness slider `min=0 max=10`→`min=1 max=7`; sleep slider UNCHANGED (hours). Plus the new all-discipline post-completion popup component (after spec approval, `docs/DESIGN-soreness-input.md`).
  3. Backend consumers (this pass) already deployed expecting 1–7 — so the migration + client must go together to close the window.
- **Cross-ref:** D-234, `readiness-scale.ts`, `DESIGN-soreness-input.md`.

---

## D-236 — Step 6: ACWR single-authority + `buildBodyResponse` reclassified as fact layer (not narrative) + RPE-signal dedup

- **Date:** 2026-07-03 — **STEP 6 COMPLETE** (Parts B + A + C all shipped + deployed; acceptance-verified on real data; 44 fixtures green).
- **Context:** The Step 6 trace ("retire `buildBodyResponse` + ACWR convergence") found two things. (1) **`buildBodyResponse` is not retireable into narrative-core** — it is a deterministic FACT producer (session observations, weekly trends, ACWR-gated load verdict, week-phase resolution, fatigue weights); narrative-core is a prose scaffold + validator that computes no numbers. "Retirement" was the wrong frame. (2) **Five independent ACWR implementations** disagreed on load source, window coupling, discipline weighting, thin-base handling, and thresholds — producing different numbers for the same athlete-day (divergences (i)–(vi)).
- **Decision (Michael ratified):**
  1. **Reframe accepted, full retirement rejected.** `buildBodyResponse` SURVIVES as the deterministic fact producer, to be relocated to a proper shared fact home (Part A); narrative-core stays the prose owner. The SELF-AWARENESS-MAP "start here next" pointer is corrected from "retire" → "reclassified as fact layer" so no future session inherits the wrong premise.
  2. **One shared ACWR authority** — `_shared/acwr.ts` (`computeAcwr`), with five design points: single load source; discipline-weight hook (`weightFn`); explicit window config (`acuteDays`/`chronicDays`/`includeAsOfDate`); shared `CHRONIC_LOAD_FLOOR` (500); and `acwr-state.ts` as the SOLE ratio→status classifier (thresholds never re-inlined). Returns both `ratio` (canonical 2-dp) and `ratioRaw` (unrounded, for consumers with boundary-sensitive gates). DB-agnostic — callers pass normalized rows (the `_shared/workload.ts` pattern).
  3. **Canonical load source = `workouts.workload_actual`** (Gate 1). Rationale — the **deferential-mirror argument**: `workout_facts.workload` is NOT an independent number; `compute-facts` (`index.ts:1489`) returns `workload_actual` verbatim when present and only re-derives when it's null. It is a mirror that already defers to `workload_actual`. Four of the five sites (coach total + running/cycling weighted, fact-packet, generate-training-context) already read `workload_actual`; only compute-snapshot read the mirror. Choosing `workload_actual` = the dedicated column written by the canonical `calculate-workload`, agrees with the mirror's own preference and every other site, and reads the fresher live value (a frozen fact row can go stale after an RPE edit). Steady-state identical to the mirror; differs only on the narrow null-fallback edge.
  4. **Formula A retired** (Gate 2). compute-snapshot's calendar-DECOUPLED model (`weekTotal / mean(4 prior weeks)`, chronic EXCLUDING the current week) is replaced by the shared coupled-rolling model (chronic CONTAINS acute; standard Gabbett), same source/window/floor as coach → **persisted `athlete_snapshot.acwr` == what coach computes live**. **Shift profile: coupling DAMPS the calendar-boundary swings in BOTH directions** — a ramp week's inflated decoupled value pulls down (golden fixture: 1.33 coupled vs 1.50 decoupled), and a LIGHT/deload week's deflated decoupled value pulls UP (real acceptance data 2026-07-04: **1.10 coupled vs 0.67 decoupled** — the 0.67 was a false "detraining" signal from comparing one light calendar week against 4 prior full weeks; the trailing-28d chronic baseline includes the light week so it doesn't over-punish). The decoupled model was the volatile one (whole-calendar-week vs a separate 4-week block); coupling centres it. A thin chronic base now also nulls the persisted ACWR (previously it returned a number). **Acceptance gate:** compute-snapshot's response carries a one-time `acwr_convergence` readout (`old_decoupled` vs `new_coupled`, on real data) for Michael's eyeball before this is considered closed.
- **asOf timezone mismatch — found in the acceptance run (2026-07-04), RESOLVED same day:** compute-snapshot derived its acute/chronic "as of" day from `todayISO()` = **UTC** date; coach derives `asOfDate` from the user's **timezone-local** date (`coach/index.ts:1171`). During the user's local evening (UTC already rolled to tomorrow) the two windows sat one day apart, so the persisted `athlete_snapshot.acwr` and coach's live value were not byte-identical then. **Fix:** shared `_shared/local-date.ts` (`localDateInTz`, the same `toLocaleDateString('en-CA', { timeZone })` convention as coach); compute-snapshot now resolves asOf in the athlete's tz (`body.timezone`, default `America/Los_Angeles` — a headless/ingest recompute has no client tz and the server clock is UTC). Fixture `_shared/local-date.test.ts` pins the evening boundary (5:01pm PT resolves to the local day for BOTH snapshot and coach, not the UTC tomorrow). persisted == live now exact at all hours.
- **Repoint decisions (per-caller):**
  - **compute-snapshot** → coupled-rolling helper on `workload_actual` (the numbers-mover; golden fixture `compute-snapshot/acwr-convergence.test.ts`).
  - **coach D/E** (running/cycling weighted) → `computeAcwr` with the `weightFn` hook; uses `.ratioRaw` to stay byte-identical (feeds a `< 0.85` taper gate). `chronicLoadFloor: 0` preserves the prior `weightedChronic > 0` gate — **the 500 floor is a RAW-load threshold and would over-null on discounted load**, so weighted variants intentionally keep `>0`. Proven equivalent to the old inline formula in `acwr.equivalence.test.ts`.
  - **coach C** (total ACWR) — LEFT as the REFERENCE the helper encodes. Its intermediates (`thinChronicBase`, `acute7Load`, `oneSessionDominatesAcute`) feed ~4 downstream gates; repointing is cosmetic churn with breakage risk in a ~5k-line @ts-nocheck file for zero number change. Pinned to the helper via the equivalence fixture instead.
  - **fact-packet B** (`getTrainingLoadContext`) → `computeAcwr` (`includeAsOfDate: false` — "load carried INTO this workout"; `.ratioRaw` preserves the exact `acwr_ratio`). **Behavior change (ratified, divergence (v)):** `acwr_status` now routes through `getAcwrStatus` instead of inline thresholds — the optimal ceiling moves 1.15 → 1.3, so a 1.2 week reads 'optimal' here (matching coach/response-model), not 'elevated'. Low blast radius (no direct `acwr_status` consumer found; `acwr_ratio` gate in `limiter.ts` unaffected).
  - **generate-training-context G** (`calculateACWR`) — NOT repointed; **deliberate keep**. Its variable acute denominator (days ELAPSED in the plan week, not fixed 7) is intentional plan-week alignment — arguably MORE honest mid-week — and it already classifies through the shared `getAcwrStatus`. This is the documented "variable acute window" opt-in (divergence (iv)), which the helper supports via `window.acuteDays`. Annotated in code, not silently changed.
- **Part A (fact-layer relocation) — CLOSED (option 3, 2026-07-03):** the reclassification (buildBodyResponse is a deterministic fact producer, NOT retireable into narrative-core) lives in the docs + map. **Full physical relocation of `body-response.ts` out of `athlete-snapshot/` was considered and DECLINED per the no-churn rule** — moving it updates imports across coach/workout-detail/barrel for zero behaviour change. Instead: (1) the cross-discipline fatigue weights (`getRunningFatigueWeight`/`getCyclingFatigueWeight` + their `normType`) were extracted to **`_shared/fatigue-weights.ts`** — a generic load primitive, and the ACWR helper's weight source, that coach was oddly reaching through the athlete-snapshot barrel to get; `body-response.ts` imports them for internal use and re-exports them so the barrel + `body-response.test.ts` resolve unchanged; coach now imports them direct. (2) A **golden-fixture safety net** (`body-response-golden.test.ts`) pins every emitted `session_signals` / `weekly_trends` / `load_status` string on a representative week (characterization test), so this and all future touches are drift-checked. Behaviour byte-identical (golden + existing body-response + equivalence tests all green).
- **Part C (RPE-signal dedup) — SHIPPED (2026-07-03, reviewed old-vs-new before ship):** the State BODY section rendered the same avg-RPE delta up to three times. Root cause: the "Cross-training" row's ≥2 stress-signal gate was met by `bodyConcerned` DOUBLE-COUNTING the same elevated RPE (`bodyConcerned = signals_concerning > 0`, and a declining RPE IS the concerning signal). **Fix:** extracted the row decision to `crossTrainingStressReceipt` (`_shared/response-model/readiness-receipts.ts`) — fires on ≥2 signals but returns null when RPE is the SOLE distinct signal (`rpeRising && !driftWorsening && !strengthFading && !rirDropping`). Glance-tier only: "How hard it feels" (`weekly.ts:rpeFeelVerdict`) keeps the delta; the LEGS LOADED "why" (`loaded-legs.ts`, expand-tier) keeps its RPE receipt per D-232 (Michael's ruling — receipts cite their evidence; dedup is glance-tier). **Multi-factor and non-RPE-single cases UNCHANGED.** Old→new (RPE-sole): Cross-training `Effort up (4.8 vs 4.3)` → row removed; "How hard it feels" `A bit harder than usual (avg 4.8 vs your typical 4.3)` unchanged. Fixtures: `cross-training-stress.test.ts` (RPE-sole suppressed, RPE+other fires with both, non-RPE-single unchanged, bodyConcerned can't double-count).
- **Fixtures (permanent regressions):** `_shared/acwr.test.ts` (divergences (i)–(vi)); `_shared/acwr.equivalence.test.ts` (coach D/E/C byte-equivalence + completed-only/28d filtering); `compute-snapshot/acwr-convergence.test.ts` (persisted coupled value pinned, old-vs-new shift documented). 20 tests, all green.
- **Deploy set (owed):** `compute-snapshot`, `coach`, and any function bundling `_shared/fact-packet` (fact-packet consumers) + the new `_shared/acwr.ts`. Gated on Michael's acceptance readout (compute-snapshot number shift) and the Part C string side-by-side.
- **Cross-ref:** `SELF-AWARENESS-MAP.md` (pointer corrected), `_shared/acwr.ts`, `_shared/acwr-state.ts`, `docs/ENGINE-STATE.md`.

---

## D-237 — No silent impersonation: a fabricated fallback may not flow into a user-facing verdict undeclared

- **Date:** 2026-07-03
- **Principle (ratified):** A default/reference/fallback value that stands in for **missing athlete data** may reach a user-facing **verdict, threshold, or receipt** ONLY if it **declares itself as an estimate** in that surface (e.g. "cadence estimated — thin history", "est (FTP)", "provisional", "assumed marathon", "~"). Otherwise the code MUST **refuse honestly** — null / needs_data / silence. **No fabricated value may be presented as the athlete's real data.** This is the "silent impersonation" ban. The distinction, three classes: **(a) honest refusal** (missing → null/needs_data/skip) — fine; **(b) declared estimate** (labels itself in the output) — fine; **(c) silent impersonation** (fabricated value presented as athlete data, undeclared) — BANNED.
- **Why:** surfaced by the run-cadence bug — a discipline with unknown cadence silently borrowed a made-up `REF_SPW` (2.6 runs/wk) that then set the "need N sessions" floor and the staleness gate, presented as the athlete's own cadence-scaled threshold. The athlete sees a confident, personal-sounding verdict computed from a number they never demonstrated. Same class of lie as the "taper"/"8 weeks" fabrications killed in the narrative work — just in the numeric/threshold layer instead of prose.
- **The (c) inventory found by the 2026-07-03 silent-fallback audit (3-pass, shared modules + edge functions):**
  1. **REF_SPW cadence** — `_shared/state-trend/thresholds.ts:48` (`spw = sessionsPerWeek > 0 ? sessionsPerWeek : REF_SPW[discipline]`, REF at :30). Fabricated per-discipline cadence feeds `minSessions` → the "need N" receipt AND `freshnessDays` → the staleness gate that decays a real verdict to needs_data. **HIGH** (latent). **NOTE (corrected 2026-07-03):** this was NOT the cause of Michael's run-row bug — his data showed 24 completed runs/90d (cadence 1.87/wk, real), so REF_SPW never fired and `minSessions=4` was legitimate. The run bug is a SEPARATE metric-population mismatch (floor scaled off TOTAL run cadence vs a series counting only comparable-EASY runs) + a misleading "3 runs" receipt — see the RUN-metric-mismatch entry. REF_SPW remains a real latent impersonation for genuinely-unknown-cadence athletes; fix still owed under this D.
  2. **140-bpm easy-HR norm** — `coach/index.ts:3419-3420` (`easy_hr_at_pace: 140 + hr_drift_avg_bpm`). Doubly wrong: `140` is a fabricated population constant AND it adds a within-session drift *delta* to a made-up absolute HR (dimensional nonsense). Surfaces via `body-response.ts:62-76` as "HR X bpm — N bpm above **your norm for this pace**" / "body is handling this well". **HIGH** — explicitly claims "your norm"; found independently by two audit passes. (The other `norms_28d` fields beside it are honest `?? null`; `workout-detail` passes `easy_hr_at_pace: null` correctly — coach is the lone fabricator.)
  3. **Marathon-readiness defaults** — `_shared/marathon-readiness/index.ts:104-108` (`raceDistance || 'marathon'`, `longRunMi ?? 18`, `mpw ?? 35`). Undeclared marathon assumption drives pass/fail + copy ("aim for at least 18 mi", "building toward 35"); a half-marathoner with null distance gets marathon standards. **MEDIUM** (partly mitigated by `hasPlan` branching).
  4. **restingHR = 60** — `_shared/workload.ts:263-264` TRIMP fallback → `workload_actual` → ACWR. **BORDERLINE/LOW** (buried model coefficient; relative ACWR ratio largely cancels a constant bias).
  5. **session_load model defaults** — `_shared/session-load.ts:57-94` (effortFraction 0.7 on missing RIR; zone modifier 0.8 on missing zones) → `session_load.magnitude` → LEGS-LOADED signal + carryover antecedent gate. **BORDERLINE/LOW** (load-model estimation, not a quoted metric).
- **NOT impersonation (correctly excluded):** workload model coefficients (`getDefaultIntensityForType` 0.75 etc.) are structural averaging weights, never shown as athlete data. **`cross-domain-carryover.ts` is CLEAN** — silence-on-uncertain throughout (the Axis 1 discipline holding up); the reaction receipts render a literal "?" on a missing norm (`coach/index.ts:4435` — the correct pattern, in the same file as #2).
- **Compliance plan + status:**
  - **#2 (140-HR) — ✅ FIXED + fixtured 2026-07-03 (shipped first, live lie).** `coach/index.ts:3418` now passes `easy_hr_at_pace: null` (no stored easy-HR norm exists — only a drift delta), so the observer emits a bare "HR N bpm." with no false "your norm" claim (matching `workout-detail`). Fixture `body-response-norm-honesty.test.ts` pins: null norm → no "your norm" line; real norm → the line fires (the only way it can). Deployed: coach.
  - **#1 (REF_SPW) — owed.** When cadence is unknown (`spw ≤ 0`) do NOT fabricate a cadence — use the honest base floor (`minSessions = 3`) or surface "cadence estimated — thin history". (Latent, not the run-row bug — see the REF_SPW note above.)
  - **run-row bug (separate from #1)** — Option A + copy: scale the run trend's floor/freshness off the COMPARABLE-easy-run cadence (the population the metric consumes), not total-run cadence; declare "easy-pace runs" in the genuine too-few receipt.
  - **#3/#4/#5** — tracked for declare-or-refuse (the compliance batch).
- **INGEST-FIRST WRITE-PATH SWEEP (2026-07-03, 3-agent, highest fossil density) — the (c) inventory with stored-data blast radius:** The raw device mappers (Strava/Garmin/HealthKit) are CLEAN (missing sensor → null), and the WORST class is ABSENT — no fabricated FTP/threshold/1RM/norm is written to `user_baselines` as the athlete's own. The fossil is the **effort-quantification default layer**, which lands unflagged in the ACWR load substrate:
  - **W1 (CRITICAL)** — default intensity `0.75`/`0.70` (`_shared/workload.ts:53` `getDefaultIntensityForType`) → written to `workouts.intensity_factor` + **`workouts.workload_actual`** (`calculate-workload/index.ts:505-508`) AND independently to `workout_facts.workload` (`compute-facts/index.ts:1520`). Fires on any cardio with no usable HR/power/pace pairing. **Blast radius: whole history; silently indistinguishable** — `workload_method` is computed (`calculate-workload:519-535`) then DISCARDED (returned in JSON only, never persisted) AND it doesn't even separate default from inferred (both → `'duration_intensity'`). Runs: `intensity_factor==0.75` is a recoverable tell; RIDES: `0.70` collides with a legit inferred value → UNRECOVERABLE. **Eaten by ACWR (D-236 canonical `workload_actual`), CTL, weekly trends, Arc.** This is the "score that lies" at the write layer — the D-236 ratio math is honest on top of a load substrate that can be fabricated + unflagged.
  - **W2 (HIGH)** — resting HR `60` / `thresholdHR−90` (`workload.ts:263-264`, `compute-facts:1508-1509`) → TRIMP → `workload_actual`/`workout_facts.workload` → ACWR. Blast radius: every TRIMP workload for a user with no stored resting HR; unflagged; skews magnitude even with a strap.
  - **W3 (MED)** — `effortFraction=0.7` on missing RIR (`session-load.ts:57`) → `session_load.magnitude` → readiness. **W4 (MED)** — interval adherence `?? 100` (`compute-facts:1166/1252`) counts unknown intervals as "hit" → `intervals_hit` → execution trends. **W5 (MOD)** — max-HR zone floor `180`/`÷0.90` (`analyze-running-workout/lib/heart-rate/zones.ts:142`) → `workout_analysis.heart_rate_summary`; per-workout zone verdicts only, does NOT reach trends/ACWR. **W6–W8 (LOW)** — phone `moving_time=elapsed`, phone sample distance `||0`, pool length `||25` (display-only); mostly distinguishable.
  - **Highest-leverage first move:** persist `workload_method` with a real `duration_default`/`resting_hr_assumed` distinction so every FUTURE estimated-load row self-declares (converts W1/W2 from indistinguishable → flagged). History backfill is separate (runs recoverable via `0.75`; rides need a heuristic). Then ACWR/trends can down-weight or the receipt can say "estimated load".
  - **W1/W2 FIX PLAN (ratified 2026-07-03): keep + declare** (estimated-load rows STAY in the ACWR sums — a no-HR run is real load — but the receipt discloses when a meaningful fraction of the WINDOW LOAD (not workout count — one long estimated ride can dominate) is estimated). Staged: **Stage 1 — ✅ SHIPPED + fixtured 2026-07-03.** `classifyWorkloadMethod` (`_shared/workload.ts`) tags `duration_default`/`trimp_resting_assumed` as `estimated:true`; `calculate-workload` persists `{workload_method, workload_estimated}` into the completed workout's `workout_metadata` (merged, co-located with `workload_actual`, no migration). Additive — future rows self-declare; no ACWR behavior change yet. Fixture `workload-method.test.ts`. (compute-facts:1520 fallback provenance — the rarer null-`workload_actual` path — is a Stage-1 follow-on, not yet covered.) **Stage 2 — ✅ SHIPPED + fixtured 2026-07-03/04.** `computeEstimatedLoadDisclosure` (`_shared/acwr.ts`): discloses when LOW-TRUST load ≥ **30%** of the chronic-28 window OR a single low-trust workout > **40%** of the acute-7 (load-weighted, not count — a long estimated ride can trip it). coach appends "Load ~X% estimated — N recent workouts without HR/power." to `load_status.interpretation` + a structured `load_estimated` field. Forward-looking (pre-flag rows read measured). Deployed: coach. Fixture `acwr-disclosure.test.ts`. **sRPE TIER (added same pass):** when cardio lacks HR/power/pace but has a logged RPE, intensity is RPE-derived (`mapRPEToIntensity`, scale-consistent) not the flat 0.75 — method `srpe_estimated` (field-standard, r≈0.68–0.74), which is **NOT** low-trust and does not trigger the Stage-2 disclosure; the flat `duration_default` is reserved for no-HR-AND-no-RPE. `LOW_TRUST_WORKLOAD_METHODS` = {duration_default, trimp_resting_assumed, hr_rejected_corrupt}. Deployed: calculate-workload. **Stage 3 (gated like a migration):** history backfill — LEAD WITH A CENSUS of Michael's rows (count + % of chronic load estimated; `0.75` tell for runs, heuristic for rides); if blast radius on his data is negligible, backfill may be a no-op for his account — report before repairing.
- **HR-PLAUSIBILITY FILTER — MECHANISM SHIPPED + DEPLOYED 2026-07-04; REAL-DATA CATCH UNVERIFIED (input-layer D-237 for PRESENT-but-corrupt HR).** Distinct from missing-HR: a flaky strap / optical cadence-lock produces a real-but-wrong HR that (audit found) fed TRIMP + zone ceilings with NO existing guard. `_shared/hr-plausibility.ts` (pure, 9 fixtures pass): **ceiling** = robust observed max + 15 (isolated outliers trimmed via adjacent-gap so an existing artifact can't inflate it; Tanaka 208−0.7·age +30 fallback for thin history — generous, an impossible-value guard NOT a training cap); **cadence-lock** = HR×cadence Pearson > 0.85 (THE corrupt-vs-real discriminator — a real hard interval hits high HR with flat cadence → low r; a lock tracks cadence → high r; height alone never rejects); **slew** = isolated single-sample spikes. **Treatment (D-237):** a trip → recompute workload on the estimate path → `hr_rejected_corrupt` (low-trust, flows into Stage-2 disclosure); raw avg/max HR preserved (non-destructive). **Placement:** consolidated in `compute-facts` (ingest fan-out — has the sample series AND the scalar max AND computes workload), which corrects `workouts.workload_actual` (ACWR substrate) + `workout_facts.workload` in one deterministic pass and re-runs cleanly on recompute; logs WHICH mechanism caught each rejection. Deployed: compute-facts.
  - **⚠ HONESTY CORRECTION (2026-07-04): the "194 ride caught" story was overstated. Two DIFFERENT operations were conflated:**
    1. **Ceiling COMPUTATION trimming** (verified in the pure fixtures): `robustObservedMax` trims the lone 194 as an isolated outlier so it can't inflate Michael's ceiling → ceiling resolves to **197** off the 178–182 cluster + 15. This only stops an artifact from raising the ceiling; it does **not** flag the 194 ride itself.
    2. **The 194 ride being REJECTED as corrupt** — **NOT observed.** By the code's own logic **194 < 197 → the ceiling guard does NOT reject it.** A rejection would require `cadence_lock` or `impossible_slew`, BOTH of which need a per-sample HR+cadence series — which may not even exist in `workouts.sensor_data` for that ride (Garmin rides store series elsewhere; `verify-hr-194.mjs` explicitly handles the `n===0` case). With no series, only the ceiling check runs and the 194 is **kept, not flagged.**
  - **What's actually proven:** the pure detection lib + its 9 fixtures. **What is NOT proven:** that ANY of Michael's real rides (the 194 included) is actually flagged `hr_rejected_corrupt` end-to-end. `scripts/verify-hr-194.mjs` was WRITTEN to check exactly this (which mechanism catches the 194, clean 178–182 runs pass) but **has NOT been run** — it needs `.env` service-role creds + a prod query (gated read; owed as a one-line curl+python hand-off per the D-237 process rule). Until it runs, treat the filter as "built + deployed, real-data effect unobserved."
  - **Follow-ons:** (a) **bike EFFICIENCY (HR-at-power) — ✅ DONE 2026-07-04:** the efficiency trend now excludes `hr_corrupt` rides (POWER keeps them — w20 is HR-independent); `workout_metadata.hr_corrupt` threaded through both bike-row builders; efficiency's OWN sample count is surfaced when it differs from power's (so "N rides" no longer masks a thinner efficiency sample). Fixture `bike-efficiency-hr-filter.test.ts`. (b) **still open:** zone-distribution reads the raw corrupt max (`estimateZonesFromSamples`) — the flag is available for the analyzer to skip it there too.
- **THE STANDARD (ratified 2026-07-03, inherit this): "clean = enforced, not asserted."** "We audited and it looks clean" is NOT a guarantee — an audit is scoped and a claim is only as good as the reviewer. Trust the FIXTURE or the real-data query, not the verdict. (This session: a confident REF_SPW diagnosis was wrong for 2 turns; one query against real rows disproved it.) The durable answer to silent impersonation is a **CI/lint guard** that fails the build when a numeric fallback flows into a user-facing string without declare-or-refuse — converting "I looked" into "the build won't allow it." Guard design owed for review before build; a second three-agent sweep of the un-audited ~two-thirds (prioritize athlete-facing string renderers: get-week, materialization, client components) is queued behind it.
- **Cross-ref:** D-232 (glass-box receipts — the prose analogue), D-236, `docs/ENGINE-STATE.md`, the run-cadence fix (`state_trends_v1.minSessions`).

---

## D-238 — Load is anchored on measurable outputs + effort, never fabricated physiology (TRIMP/resting-HR retired)

- **Decision (settled architectural principle — do not re-introduce):** cardio training load is anchored on **measurable outputs** — power (FTP) for the bike, pace (threshold pace / GAP) for the run — and on **effort (sRPE = RPE × duration)** as the no-output fallback. HR-based load, if used at all, keys on **threshold HR (LTHR)**, **never resting HR**. Tiers fall through on missing data; the engine **never fabricates an input to keep a tier alive**. Rationale: TrainingPeaks anchors TSS on threshold (FTP / threshold pace / LTHR), not resting HR; sRPE is the field-validated no-sensor proxy (McLaren 2018 — sRPE ≥ TRIMP for load validity); Efforts is a **non-wearable-first** app. **No future session may re-introduce resting-HR-dependent load.**
- **What was wrong (traced 2026-07-04):** RHR-based **TRIMP was the PRIMARY cardio load metric** — tier 1 in BOTH writers (`calculate-workload.calculateActivityWorkload`, `compute-facts.computeWorkload`) *and* in `classifyWorkloadMethod` — sitting **above** power and pace, the inverse of TrainingPeaks. Resting HR was fabricated (`?? 60`, or `thresholdHR−90`) whenever absent. **Impact on Michael's real data (gated count, `verify-load-ladder-impact.mjs`): 247 cardio workouts, 0 stored resting HR → EVERY TRIMP used the fabricated 60; 238 had HR (TRIMP fired on ~all); 215 had real wattage that TRIMP ignored.** Not cosmetic.
- **The fix:** deleted `calculateTRIMPWorkload` + the TRIMP-first block from both writers and every `resting_heart_rate` read; extracted the output/threshold ladder to shared `inferIntensityFromPerformance` (`_shared/workload.ts`) and gave compute-facts a power/pace tier (it previously jumped TRIMP→sRPE). New cardio ladder: **power(FTP) / pace → HR%LTHR → sRPE → duration default.** `classifyWorkloadMethod` reordered output-first (label ↔ number agree); `trimp_*` enum members kept for historical rows only, never emitted. Planned-load callers (`activate-plan`, `backfill-planned-workload`) — which fabricated an avgHR from a default `rhr=55` to run TRIMP — now score planned load from the **prescription** (duration × prescribed IF²), the same scale as actual load, so planned/actual stay comparable.
- **Run tier (option-b, chosen):** runs key on **HR%LTHR** (threshold HR, never resting HR); a dedicated threshold-pace / GAP run-TSS tier is deferred (overlaps Q-118 critical-pace). Filed as a follow-up, not a defect.
- **Scale note:** `TRIMP×0.6` and `duration×IF²×100` are both anchored to ~100 load/hr at threshold, so magnitudes agree for well-matched sessions; the corrections concentrate on HR-decoupled sessions (heat/drift/fatigue → TRIMP over-read vs real power).
- **Verification:** `_shared/workload-ladder.test.ts` (power ride → power; HR-only run → %LTHR; RPE-only → sRPE; power ride load = duration×IF², never TRIMP; classifier never emits trimp) + updated `workload-method.test.ts` (13 pass). `grep calculateTRIMPWorkload|TRIMPInput` → none; no `resting_heart_rate` read remains in the load path. **Before/after on real history shown to Michael via `verify-load-ladder-impact.mjs` BEFORE deploy** (window ACWR shift + dramatic movers) per the ACWR-readout discipline.
- **Supersedes:** the TRIMP-first cardio path and the W2 resting-HR-`?? 60` fallback (D-237 inventory) — resting HR is now gone from load entirely, not merely declared.
- **Cross-ref:** D-236 (ACWR substrate = `workload_actual`), D-237 (declare-or-refuse; W2), Q-118 (FTP/critical-pace baseline model), `verify-load-ladder-impact.mjs`.

---

## D-239 — RUN State lead = aerobic decoupling (zone-free); Friel bands are a coaching standard, not lab-validated

The RUN State row leads with within-session **pace:HR decoupling** (`heart_rate_summary.decouplingPct`, D-036 GAP-corrected), NOT `efficiency_index` (whole-run → distance-confounded) and NOT `pace_at_easy_hr` (null on real data — see the dead-code list in ENGINE-STATE). Chosen because decoupling needs **no HR baseline** (this athlete has no reliable `threshold_hr`) and has **no distance confound** (within-run drift, not a whole-run average).

- **Bands** (`frielBand`, `run.ts`): `<0 excellent · <5 strong · 5–10 base · >10 durability_gap`. A **Joe Friel / TrainingPeaks coaching convention — NOT a peer-reviewed cutoff.** Cite as coaching-standard (`docs/SCIENCE-run-decoupling-durability.md`); never as lab-validated. Band = verdict, % = receipt.
- **Gate:** steady/aerobic `workoutType` + `durationMinutes ≥ 20` + drop confirmed-`raw`. The persisted `decouplingBasis` label is unreliable (gap on 4/145) — so trust the GAP-based pct, only drop confirmed 'raw'. ~79–87 qualifying runs on real data (vs 3 for the easy-only path — that thinness was a *classification* artifact, not scarcity).
- **Direction INVERTED vs efficiency:** LOWER decoupling = better → falling = improving. Fixtures pin it (`run-decoupling.test.ts`); classifyTrend reused via +30 offset (it drops ≤0 and %-breaks near zero) so its window/floor/staleness gate carry over.
- **efficiency_index** demoted to secondary, gated to a 30–70min steady duration band.
- **Spine:** cached into `state_trends_v1.run.decoupling` (band/recentPct) + `.efficiency`, mirroring bike — so coach/Arc/LLM narrate the band, not just direction.
- **Reconcile (same arc):** coach's `runEfficiency` (`:1694`) used its own ≤3 cutoff → replaced with `frielBand` (one threshold set); the dead `run_easy_pace_at_hr_trend` longitudinal signal + its compute-snapshot aggregation retired. One run-fitness source, not three.

### D-240 — State screen "one clock, one place" cohesion restructure (2026-07-05, DEPLOYED coach v64→67 + client `52cd8eeb`→`2116e9f2`)

The top of State had grown three overlapping ways to say the same thing: a `WEEK · EFFORT UP` chip, a headline fusing two clocks (`This week: Balanced load. Over 6 weeks: fitness mixed`), and a "Why:" accordion. Whoop/Garmin UX research ([925studios WHOOP breakdown], the5krunner, Wareable) prescribes the opposite: ONE headline verdict, each score paired with its own driver, no nested accordions, strain is a supporting score never the crown. Restructured to match — **all subtractive**:

- **Chip removed.** Readiness ("effort up") is strain-class — never headline/crown material. The `readinessLabel` span in `StateTab` deleted; "WEEK" stays a plain section header.
- **Headline = THE WEEK only.** `buildLoadHeadline` drops the "Over 6 weeks: fitness" clause (removed `fitnessSlot`). One clock — the week's load verdict. Fitness is a *different* clock, handed to the PERFORMANCE discipline rows.
- **PERFORMANCE roll-up removed.** The synthesized `Building — bike up, run up` header (`synthesizeHeadline`) committed all three roll-up sins on real data: (1) **lossy** — collapses to one word; (2) **cherry-picking** — gates out "provisional" disciplines (`HEADLINE_GATED_DISCIPLINES`), so a declining-but-provisional swim (−3.6%) vanished from the headline; (3) **clock-mismatch** — averaged run's 42d/6wk window with bike's 56d/8wk. Rows now speak per-discipline, each owning its window; swim's decline is visible.
- **Why → BODY driver (Whoop pairing).** The RPE driver ("Monday's strength session (you rated it 9) pushed the week's effort up") moved from the headline accordion to a dim always-visible sub-line under BODY's "how hard it feels" verdict. New `readiness_rpe_driver` field (`bodyRpeDriver`), RPE-clause-ONLY (D-241). `buildReadinessWhy(rpeUnderBody:true)` drops the RPE clause from the Why so it never double-shows.
- **"N concerning signals" count fallback DELETED.** It generated the confusing amber "Why: 1 concerning signal" — a WHOOP-class non-answer (alarms without informing; contradicts a "Balanced load" headline). `buildReadinessWhy` now returns null when no NAMED driver. The `week_narrative` expand survives only when there IS narrative (traced LIVE: 10/11 coach_cache rows non-empty → gate, not delete). Section clock labels added: LOAD/BODY "last 7 days vs your typical"; PERFORMANCE "trends over recent weeks".

Files: `src/lib/load-headline.ts`, `StateTab.tsx`, `StatePerformanceSection.tsx`, `readiness-receipts.ts`, `coach/index.ts`. Fixtures: `load-headline.test.ts`, `readiness-receipts.test.ts`.

### D-241 — Constant-free RPE driver rule + RPE-clause-only under BODY (2026-07-05)

The Why NAMES the session that moved the week, not a restated verdict. Rule (`rpeWhyClause`/`bodyRpeDriver`, `readiness-receipts.ts`): the driver = the session whose excess over the athlete's own 28-day RPE baseline **exceeds all other positive contributors' excess COMBINED** — only when the verdict is elevated. Near-tie → receipt; not elevated → silent. **Rejected** the "≥2 points above typical" (and lowered "≥0.5") absolute thresholds: RPE is a 1–10 cross-discipline average, so a swim-3 next to a lift-9 is normal spread, not an anomaly — an absolute Δ gate is the wrong model. Validated on the real distribution: 7d `[9,5,4,3,3]` vs baseline 4.31 → the 9's +4.69 > the rest's +0.69 → names Monday.

**BODY driver = the RPE CLAUSE ONLY** (`bodyRpeDriver`): it sits under BODY's "how hard it feels" (RPE) row, so it must never borrow a non-RPE factor (execution, HR-drift) — that would be a mislabel (D-242). Returns null when rpe isn't declining. Pinned both directions (`readiness-receipts.test.ts`): execution-down + effort-up → only the effort clause; purely non-RPE → null.

### D-242 — The law: "label what's computed, never compute to match the label" (2026-07-05)

First-class principle, earned three times this arc: (1) the RUN decoupling lead (D-239 — led with the metric actually calculated, not the `pace_at_easy_hr` we wished we had); (2) **STRENGTH-B** — the State strength volume is genuinely a 42-day/6-week `classifyTrend`; when asked to label it "vs 28-day typical," we KEPT the 42d computation and labeled it honestly "over 6wk" rather than fabricate a 7d read to match an improvised label; (3) the fitness-verdict cohesion (D-240 — deleted the roll-up rather than compute a cross-discipline aggregate to justify a single-verdict headline). **The code is the source of truth; the label describes it, never the reverse.** This is the "no unexamined constants" law stated for computations. Corollary: if a label needs a computation that doesn't exist, that's NEW scope (its own decision), not a label fix.

### D-243 — Planned run load reads its prescription: token vocabulary + generator emission (Q-125 Gap B + Q-126, 2026-07-05, DEPLOYED)

- **Decision:** a planned run's `workload_planned` must reflect its prescribed intensity, not the flat 0.75 per-type default. Two coordinated changes: (Gap B) add the generator's real token families as substring keys in `INTENSITY_FACTORS.run` — `run_easy:0.65, warmup_run_quality:0.65, run_mp:0.82`; (Gap A / Q-126) make the non-race `enduranceSession()` EMIT a token (`run_easy_${mins}min`, or `longrun_${mins}min_easypace` on the long-run day), gated `sport==='run'`.
- **Why 0.65 for easy runs:** it matches the existing `easypace` factor — an easy run is an easy run. Critically, the OLD default (0.75) was HIGHER than the true easy intensity, so the bug INFLATED easy-run load (read hotter than prescribed), not just flattened it. `run_mp` → 0.82 mirrors `marathon_pace`.
- **Alternatives rejected:** (a) reuse `session-factory.easyRun` (miles-based `PlannedSession`; `enduranceSession` is minutes-native — a duration-native token helper is smaller and coupling-free); (b) force-recompute historical rows (rewrites planned-load history feeding adherence/ACWR — pre-launch, no live surface reads it, so go-forward-only); (c) add quality tokens to non-race easy runs (they're genuinely easy — no false intensity); (d) fix the `longrun_easypace:0.70` dead key / bike ride default in the same pass (scope-fenced — Gap A-bike is its own entry).
- **Tradeoff accepted:** strength sessions (no `steps_preset`, structural) and bike rides (fenced) stay on their per-type defaults for now; the long run computes 0.65 not 0.70 (the `longrun_easypace` key is shadowed by `easypace` matching first — a known, deferred refinement).
- **Guard:** spine-safety proven by a byte-identical strength-subset golden (`strength-primary-plan.q126.test.ts`), permanent regression — any future strength drift fails loudly. Token matching guarded by `workload-run-tokens.test.ts`.
- **Process lesson (banked, see ENGINE-STATE):** the Q-126 emitting site was mis-attributed twice by elimination before being found by reading the function. An attribution is pinned only when you've read the code that emits the field.

### D-244 — Narrative-honesty guard: enforce D-242 in the analyzer with belt-and-suspenders (Q-128, 2026-07-05, DEPLOYED)

The run `ai_summary` narrated a faded (positive-split) run as "clean execution / pace held steady" — a live D-242 violation contradicted by its own PACING/TREND rows. **Decision:** enforce D-242 at the ONE generator that owns the narrative (`generateAISummaryV1`), three layers: (1) PRIMARY — a deterministic within-run positive-split flag feeds a hard prompt rule (forbid clean/steady, name the slowdown), same mechanism as the D-092/D-093 structured-mode rules; (2) BACKSTOP — a validator that triggers the existing corrective-regen loop; (3) SEATBELT — a final deterministic strip/append (`execution-honesty.ts`) so the banned claim can never reach the screen and the fade is always named. **Rejected:** a post-hoc strip alone (when the lie is the whole sentence, stripping leaves a hole — worse than the lie), and keying "below-baseline" on `vs_similar.assessment` (it launders a much-slower run into "typical" — the confound). **Keyed on the within-run positive split ALONE** (threshold 20s/mi, tied to `build.ts`'s >15=real-split; general, not tuned). Split sourced from the post-analysis re-read (`workoutToUse`), not the stale pre-analysis read. **Standing rule banked:** an LLM-generator "it passes" claim requires ≥3 back-to-back clean recomputes, never one (fooled by variance twice here). Q-129 filed: generalize to a shared honesty spine across all narrative surfaces (the SUMMARY fallback + `hr_drift_interpretation` are unguarded).

### D-245 — GAP aggregated distance-weighted, not arithmetic-mean-of-pace (Q-130, 2026-07-05, DEPLOYED)

`overall.avg_gap_s_per_mi` was `gapSum/gapCount` — an arithmetic mean of per-sample GAP pace — while raw `avg_pace` is `total_time/total_distance` (harmonic/distance-weighted). `AM ≥ HM` by the variance of pace, so GAP read ~15s/mi slower than raw on ANY pace-varying run **regardless of grade** → false `gap_terrain_bias='downhill'` on flat routes. **Decision:** aggregate GAP the same way raw pace is — total flat-equivalent time / total distance (new pure `aggregateGapPace()` weighting each GAP pace by 1/pace). On a flat run GAP ≈ raw exactly; real grades still adjust. **Reproduced cold before fixing:** arithmetic-mean-of-RAW-pace alone = 769 vs true 754 (15s/mi, zero grade). **Rejected:** elevation smoothing (only moved it 3s/mi — the Minetti-asymmetry-on-noise residual, not the real bug) and a narrative terrain guard (would paper over a bad number). Matters beyond one narrative: GAP feeds `workload` (load/ACWR) + the pace-vs-norm baseline. Two smaller GAP siblings (per-split fallback, summary's `gap_pace_s_per_mi`) weight differently — deferred, don't feed the symptom.

### D-246 — Plan-phase-aware load verdict: "building on plan" via a separate label, marker stays raw (Q-122, 2026-07-05, SHIPPED)

`acwrVolumeLabel` was ACWR-only, so a high-but-on-plan build week false-alarmed as "back off." **Decision:** a NEW pure `planAwareVolumeLabel()` — ACWR in the back-off band (1.3–1.5) + `week.intent==='build'` + on-plan (`wtd_actual ≤ 120% × wtd_planned`) → "building on plan". **Option (b) coherence:** only the WORD (headline + gauge label) is plan-aware; the gauge MARKER + `acwrZone` stay RAW ACWR — honest dual read ("ACWR 1.35 · pushing" + "building on plan"). `acwrVolumeLabel` is UNTOUCHED (shared with the marker → can't desync). **Constants:** 120% overshoot (the codebase's existing threshold, not the spec's 115%); ≥1.5 redline never overridden; early-week floor (`wtd_planned_load < 150` → raw ACWR, gates Mon/Tue when the planned sum is untrustworthy). Verified the `load` object actually carries `wtd_planned_load` at runtime before building (spec claim held). Fixture-proven; live-engages once ACWR is actually in the band during a build week.

### D-247 — Narrative honesty extended to hr_drift + the SUMMARY fallback, STEADY-EFFORT gated (Q-129 point-fixes, 2026-07-06, DEPLOYED)

The 7/5 faded run lied on two more surfaces beyond `ai_summary` (Q-128): the deterministic `hr_drift_interpretation` ("Solid aerobic work") and the SUMMARY fallback (led with "Typical vs similar workouts", laundering the pace collapse). Both now guarded via the shared `execution-honesty.ts` primitive: `guardNarrativeHonesty` NAMES the fade on hr_drift while KEEPING the true HR statement (D-246 honest dual read — "Solid aerobic work" isn't a banned clean/steady EXECUTION claim); new `fadeLeadBullets` leads the fallback with the fade and drops the `vs_similar` bullet. **STEADY-EFFORT GATE:** `tripsHonestyGuard` now suppresses on `isMixedEffort` — a structured run (tempo / interval / fartlek / warmup→work→easy-cooldown) has a slower second half by design, so "fade" there would be its own lie. One gate in the primitive covers all three surfaces PLUS Q-128's `ai_summary`, closing a latent false-positive in the original guard too. Deterministic, 13 deno fixtures. Deployed `analyze-running-workout`. This is Q-129's "each point fix teaches the shared spine" step — NOT the full shared honesty spine (still Q-129).

### D-248 — Route identity is the PATH, not distance; idempotent count; runs + rides; history backfilled (2026-07-06, DEPLOYED)

The route foundation lied: "same route" was a **distance-bucket fingerprint** (200m) + distance-fuzzy match, so the SAME roads run at 4.0 vs 4.9mi split into separate "routes" (user saw "120×" / "19×"), and `sample_count` **inflated on every recompute** (non-idempotent `+1`). It read GPS but used only start/end/distance — never the path. **Rebuilt:** identity = the GPS PATH as a set of ~150m **geohash cells**, matched by overlap coefficient (`_shared/geohash.ts` + `_shared/route-match.ts`). Same roads at ANY length = one route — **full containment (overlap ≥0.9) bypasses the length guard** so out-and-back builds stay one route (Michael's "further and further out"); partial overlaps keep a 2.5× length guard. `sample_count` is now a **true recount** from `workout_route_match` (idempotent — recompute can't inflate). Honest `first_seen` = earliest RUN date. Path-created clusters carry a **path fingerprint** (`p-<hash of geohash set>`) to avoid the `user_id+fingerprint` unique-constraint collision with deactivated old clusters. Extracted to `_shared/route-intelligence.ts` (`resolveRouteCluster`) — ONE implementation for the live path (compute-facts) AND the backfill. **Rides folded into identity** (run-only efficiency metrics stay in compute-facts). **Backfilled user 45d122e7** via `backfill-routes` (batched, non-destructive — old clusters *deactivated*, not deleted; efficiency metrics re-pointed to new clusters): 225 workouts → **before** 55 fake clusters with impossible inflated counts (summed ≫225), **after** 59 real path-routes with true counts (top 40×/29×/21×, sum = 225). Deployed `compute-facts` + `backfill-routes`. **Displayed** route data on an OLD run updates on its next recompute (stored fact packet); new runs immediately. 21 fixtures (geohash + route-match + efficiency-index).

### D-249 — Efficiency direction removed from the Performance route line; State owns efficiency trends (2026-07-06, DEPLOYED)

The per-session same-route efficiency direction (raw pace-per-HR over 90 days) read **summer heat as "efficiency declining"** — same-route controls hills but NOT heat — AND **contradicted State's decoupling-led "Efficiency holding"** (scope + confound). **Removed it.** The Performance route line now shows **FAMILIARITY only** ("Same route · run 40× since 2025"), gated on the cluster total (`times_run`) not recent history (fixes the missing-line case: a route run a lot but not lately still shows). State owns efficiency trends (done carefully, decoupling-led). The honest heat-adjusted per-route trend is a REAL feature — specced separately in `DESIGN-familiar-routes.md` / Q-131, not the confounded raw version. Deployed `workout-detail` + client.

### D-250 — Route-performance TREND can't rest on path-overlap route identity; adopt the SEGMENT model (2026-07-06, SPEC — `DESIGN-segments.md`; supersedes the Q-131 route-trend approach)

Built + deployed the honest heat-adjusted per-route trend (Q-131 / Familiar Routes): `_shared/heat-adjust.ts` (`dewPointF`, `heatTerm`, `adjEfficiency`, `routeTrend` = Huber-IRLS joint regression + CI-gated verdict, `routeHeadline`), the `temp_f`/`humidity_pct`/`dew_point_f` schema add + 105-row backfill, the `RouteDoorway` UI, the server `readout` in `session-detail/build.ts`. **Then proved it out on real data and it FLIP-FLOPS** ("improving" one week, "not" the next). Audit (`route-intelligence.ts` / `route-match.ts` / `geohash.ts`) found the route IDENTITY is structurally unsound: **(1) over-merges distances** — overlap coefficient on the SMALLER run's cells (`route-match.ts:39`), threshold 0.6, distance guard **bypassed above 0.9 overlap** (`:66`), 2.5× ratio otherwise → one cluster held runs **2.9–5.0mi**; **(2) fragments one trailhead into ≥4 clusters** — unordered geohash SET (precision 7), no start/direction anchor → different directions = disjoint sets = separate clusters (real: 4 IDs at 34.087,−118.181); **(3) double-counts** — `route_progress_metrics` conflicts on `(cluster, workout)` not `workout` (`compute-facts:859`) and **nothing deletes rows**, so a re-matched workout orphans a stale row (the June-14 run appeared twice). Incumbent research: Strava + Garmin both use fixed **SEGMENTS** (defined start→path→end→distance, ORDERED match); nobody uses distance-blind unordered overlap. **DECISION:** the honest "am I faster on this" for a variable-length out-and-back runner is a fixed SEGMENT (the common sub-path every run covers), NOT a variable-length route. Full spec: `docs/DESIGN-segments.md` (8 steps; 3 hard geospatial primitives — ordered path-match, segment detection, segment-effort extraction; reuses the read engine + `RouteDoorway`). The read ENGINE (`routeHeadline`/`routeTrend`, 24 fixtures) is sound and reused; the SUBSTRATE (route identity) is replaced. Build in a FRESH session (Q-132).

### D-251 — Heat variable = air TEMPERATURE, not dew point (dry-climate proof-out) (2026-07-06, in the parked engine)

`DESIGN-familiar-routes.md` specced dew-point heat correction (dew point > temp/RH as the humidity-aware heat-stress signal — correct physiology). **Proved out on user 45d122e7's real data:** in his arid climate dew point barely clears the 55°F reference (`heatTerm` SD < 1.4°F on every route) while AIR TEMPERATURE swings 30–40°F (50→92°F, temp_sd 6–9). Dew-only made the feature a near-no-op and re-admitted the summer-decline lie. Switched the model's heat term to `max(0, temp_f − 60)` (`TEMP_REF_F=60`; endurance optima ~50–55°F). Dew point stays CAPTURED (`dewPointF`, stored) but DORMANT — the humid-climate refinement (WBGT proxy: temperature is the higher-value regressor when dew runs out of resolution, pre-registered). `k` stays HR-side (the PROHIBITION: pace-side coefficients like Vermeer's 0.025 are structurally invalid as a `k` source — only same-loop paired runs supply magnitude). Also decided: joint fit `efficiency ~ heatTerm + time` (Huber-IRLS), NOT residualize-then-trend (biased under dew/time correlation, Frisch–Waugh–Lovell).

### D-252 — The fitness metric shown to users is SAME-EFFORT PACE (min/mi), never an abstract efficiency index (2026-07-06)

Efficiency = speed/HR is the right UNDERLYING metric (= TrainingPeaks Efficiency Factor; State's `efficiency_index`, Law 1) but "1.83" means nothing to a runner ("no one understands it"). Pin HR to the athlete's typical effort and it becomes a PACE: "at ~145 bpm you'd run 10:20/mi." Same math, human units — the passive form of the **MAF test** (fixed HR, watch pace improve). UI shows two paces (Pace / Same-effort pace), both min/mi, temp-corrected, glass-box ("at ~145 bpm, temp-adj"). Rejected: raw efficiency index (abstract), index-to-100 (still a score nobody feels). Also banked (UI honesty): the chart draws a trend line ONLY for a confident direction — **never a sloped line under a "Holding" verdict** (the D-242 lie in UI form); and **no directional verdict under N≥8 comparable efforts** (the flip-flop was 4-effort verdicts owned by one outlier). Progressive disclosure (WHOOP/Strava research): glanceable headline → one toggle chart → tappable deep-dive.

### D-253 — Governance by construction: surfaces are disarmed, not trusted (2026-07-06, doctrine for the segment build + retroactive lens on the Q-106/107/108 debt)

The honor system already failed once: the superseded route-trend minted its verdict in `session-detail/build.ts` **while the CONSTITUTION forbade it** (Law 5). A law that depends on a well-behaved developer is a norm, and norms die at 11pm under deadline. **Doctrine:** don't forbid defection — make it *unrepresentable*. Three mechanisms, all structural:
1. **Render-ready payload — the client's contract carries no army.** The surface (`RouteDoorway`) receives ONLY `{ headline, familiarity, chart:{ points:{dateLabel,paceLabel,isBest}[], trendLine:{x,y}[]|null } }` — display strings + pre-computed trend geometry (null unless a confident direction). No slope, no CI, no raw pace/HR arrays. The client can't re-derive a verdict because it's handed *nothing to re-derive from*; it can't draw a slope under "Holding" because it isn't given one. Law 4 moves from rulebook to physics. Same guard on the server seam: the spine→`build.ts` contract passes a finished `SegmentVerdict`, never the efforts — so `build.ts` authors copy, it cannot assemble a verdict. No effort-array field in the input type = no re-derivation in review-visible code.
2. **Sub-floor verdict is type-unreachable.** `SegmentVerdict = { state:"still_building"; n } | { state:"settled"; direction:"improving"|"holding"|"declining"; ci:[number,number]; n }`. A discriminated union where the sub-floor branch has **no `direction` field to populate**. Under N<8 or an uncleared CI, a faked arrow isn't discouraged — it's unrepresentable. Six lines carry the whole floor (D-252 / §5).
3. **Defection fixtures pin the ABSENCE of capability.** Not just happy-path: `N=7 → state==="still_building" && !("direction" in v)`; `N=9, CI straddles 0 → still_building`; and a **payload-keys golden** asserting `SegmentReadout` has no `slope`/`ci`/`rawPace` key. Pinning the absence of a key is what stops a future edit from re-arming the province without review noticing.

**Sovereign caveat (keeps the doctrine from over-claiming):** construction governs the **surfaces**, not the **sovereign**. No payload contract stops the spine itself from computing the wrong verdict — construction only guarantees the wrong answer is the *same* wrong answer everywhere, so it's findable and fixable in one place. Construction stops defection; the glass box + audit receipts keep the center accountable. The pairing is the system — neither alone is enough, and this session needed both to catch what it caught. The general lint/CI gate that would enforce Laws 1/4/5 across the codebase (not just this feature) is filed as **Q-134**, deliberately NOT built here (scope discipline); segments build under governance-by-construction meanwhile.

### D-254 — Segment-model forks ruled against the LIVE DB, not the doc's word (2026-07-06, `DESIGN-segments.md` §8 / Q-132)

The five forks were ruled after a hand-run live-DB introspection (the route saga's lesson: every load-bearing claim taken on the doc's word hid something). Results, grounded in what the DB actually showed (420 fragmented `terrain_segments` micro-segments; `segment_progress_metrics` ~92% dead at 42/546 rows; correct idempotency keys on the segment tables vs the buggy `(route_cluster_id, workout_id)` on `route_progress_metrics`):

1. **Substrate — GREENFIELD, and this is SITUATIONAL, not a blanket stance.** Built new tracked tables `route_cores` + `core_efforts` rather than adopt/extend the pre-existing terrain trio (`terrain_segments` / `workout_segment_match` / `segment_progress_metrics`). The reason is specific to *that* substrate being the wrong shape for a sliced-effort claim: it stores **apportioned whole-run averages** (structurally cannot carry a sliced segment pace/HR), **folds reverse**, is a **within-run terrain-CHUNK profiler** (a different question), serves a **live consumer** (`fact-packet` terrain profiling), and its effort writer was **~92% dead** on real data. Adopting it would entangle this feature with terrain profiling and inherit its shape drift. **This is NOT a general "never migrate legacy / always build from empty prod" rule** — that would be a fabricated principle, broader than anything decided, and self-contradicting: the Constitution's annexation principle (*new code obeys; old code migrates*) still governs, and legacy WAS reused this same session where sound — the route tables kept for the familiarity line (fork 5), the read engine (`_shared/heat-adjust.ts` `routeHeadline`/`routeTrend`) reused verbatim, and `RouteDoorway` reused. **Greenfield here = "this legacy is the wrong shape for this claim,"** a per-substrate call, not a doctrine.
2. **Detection — AUTO-CORE, FROZEN, standalone pass.** Auto-detected (no creation UI); geometry frozen at birth; detection is a separate occasional pass (backfill + gated re-runs), NOT wired into per-ingest fan-out. Amendment = **insert-new-version** (`version`/`superseded_by`/`is_active`), never an in-place edit of geometry.
3. **Separate direction** — cores are direction-bucketed; a reverse traversal is a different core (the terrain trio folded reverse; we do not — enforced structurally by the forward-only ordered match, `core-match.ts`).
4. **Q-133 peel-back deferred** — the superseded route-trend read-path stays live for now; the peel-back is still owed (open action, see Q-133).

Verified end-to-end on real data, not just fixtures: one core frozen (1.83mi / N=15, his home out-and-back), and the born-once freeze guard proven idempotent (re-invoke → detected 1, frozen 0, skipped 1).

### D-255 — Consensus core detection, the floor-margin principle, and per-user calibration flagged non-universal (2026-07-06)

- **Consensus detection adopted** over the spec's LCS-over-cells (`DESIGN-segments.md` §4.2 proposed LCS/suffix-automaton; rejected as jitter-brittle and fragment-prone — the texture that made 420 micro-segments). A core is the arc-length sub-path a **strong majority of same-direction runs agree on within a corridor**, detected on **OUTBOUND legs only** — a non-obvious correctness point: on an out-and-back the return leg retraces the same geography, so including it lets a synchronized-turnaround majority form a **false backward consensus**. Yields exactly one core per (trailhead, direction) by construction (criterion 4 / the 420-fragment antidote).
- **Principle (general, reusable): freeze the LONGEST stretch that still clears the N≥8 verdict floor with margin.** Pace over a longer stretch averages out the GPS/pacing noise that swamps a short read; more efforts each carrying more per-effort noise is a worse trade than fewer efforts measured cleanly. Real-data sweep of his home stretch (37 same-direction runs) by coverage fraction: 2949m/15eff → 1101m/23 → 306m/25 → 170m/34. Chose **1.83mi / 15 efforts** (clears the floor with margin, best signal-to-noise, and it is his actual out-and-back).
- **Per-user calibration, flagged NON-UNIVERSAL (Law 2 — do not launder a fitted value as a measured constant):** `coverage_frac=0.4` and `min_core_distance_m=600` were fit to user 45d122e7's trailhead + GPS jitter via the sweep. They encode a real principle but the **numbers are per-profile**; encoded as request params with defaults in `detect-cores`, commented as calibrated-not-constant, with a `TODO(multi-user)` to move them to a per-user calibration record. A future user's different GPS/run profile MUST get its own sweep — today's good-fit values must not silently harden into everyone's defaults. Also decided: trailhead cluster radius **150m** (jitter spans ~140m; his distinct trailheads are ~8km apart, so no risk of merging distinct trailheads), and the **487m SW stub dropped** as sub-floor / too-short-to-trend (the 600m min encodes "too short to trend reliably" as a distance truth, not a data-count accident).

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
