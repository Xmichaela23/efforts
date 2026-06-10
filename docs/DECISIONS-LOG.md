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

**Context:** Bench Press set 1 showed a 1:30 rest timer, set 2 showed 2:30 — same lift, same 4-rep target, on a deload session. Rest should be uniform across sets of one lift.

**Root cause (render, not data):** the logger never stores rest — it's always computed from reps via `calculateRestTime` (`:115`). The rest-timer block derived each row's value from the **previous** set's reps (`exercise.sets[setIndex - 1]`), the "rest after set N-1" model that `startAutoRestForNextSet` also writes to (key `${exerciseId}-${completedSetIndex + 1}`). Set 0 has no previous set, so it hit a hardcoded `: 90` (1:30) fallback; set 1 computed `calculateRestTime(Bench, 4)` = 150 (2:30) — a compound at 3-5 reps. Both numbers were "correct" under the model; the inconsistency was set 0's missing-previous fallback.

**Decision:** set 0 renders **no rest row at all** (`showRestTimer` now requires `setIndex > 0`), and the hardcoded 90s default is removed rather than swapped for a less-wrong default. Rationale (physiology over tidy uniformity): rest is the recovery gap *between* sets — you don't rest before your first working set. Forcing a uniform 2:30 onto set 1 would imply a pre-set rest that doesn't exist, and with D-114 auto-advance it would start a phantom timer before the athlete has lifted anything. No row is the honest representation. Sets 1+ keep the existing previous-set computation unchanged.

**Verified safe against auto-rest:** suppressing set 0's *rendered* row does not touch `startAutoRestForNextSet` — it writes the `+1` key, so completing set 0 still starts **set 1's** timer (it never writes a `-0` key). Confirmed at `:459`.

**Footgun (recurring bug class) — index-0 hardcoded fallback defaults.** When a per-item value is derived from the *previous* item, item 0 has no predecessor and tends to get a silent hardcoded default (here `: 90`) that diverges from every real value and reads as a bug. Same family as the failure-to-zero / truthy-coercion footgun behind D-112 (0W coasting samples coerced to null): both are "the boundary element silently gets a wrong default." When a per-set/per-sample default is only hit by the first (or zeroth) element, ask whether that element should carry the value at all — don't pick a less-wrong default to paper it over.

**Files:** `src/components/StrengthLogger.tsx:~3210` (`showRestTimer` gate). Commit `ce83b9b0`.

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
