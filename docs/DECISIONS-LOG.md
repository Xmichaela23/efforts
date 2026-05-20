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
