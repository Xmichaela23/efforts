# Session Context — Cycling Analysis Build (handoff)

**Last updated:** 2026-05-17. **Scope:** the cycling-analysis arc — running→cycling parity, intent-aware analysis, segment intelligence, Arc integration. This is the live handoff doc; pair with `docs/CYCLING-ANALYSIS-DESIGN.md` (the work order) and `docs/RUNNING-CYCLING-DELTA.md` (the upstream 31-item delta).

---

## 1. What was built (commit hashes, newest first)

**2026-05-17 (later) — VI-gate elevation source + wide backfill**
- `bdf2cde2` classifier's elevation-density gate now sources ascent from total `workouts.elevation_gain` (passed as `elevationGainM`), not `computed.analysis.climbing.climb_ascent_m` (grade≥3% climb-segment ascent — under-reported on rolling terrain, straddled the 40 ft/mi gate wrong). `elevation_gain` added to the analyze-cycling-workout workout SELECT; climb_ascent_m kept as fallback. **Supersedes D-011's elevation-source tradeoff → D-016.** `build.test.ts` +3 (86 suite pass). Deployed. Verified: May-10 `60304656` recomputed → `tempo` → `climbing`.
- `83d07fdb` `scripts/verify-cycling-vi-if-fix.mjs --all` wide-backfill mode. Ran wide (180 d, 30 rides, 0 failed): 16 historical `null → type`, 26/26 cap-present consistent, every in-window ride now has a stored `classified_type` (recovery/threshold/climbing/endurance/tempo each ≥3 → pwr20-eligible). **Closes open item #2 / Q-008.**

**2026-05-17 — fact-packet IF/VI canonical-source fix**
- `6941a236` cycling fact packet now sources IF/VI from `computed.analysis.power.{intensity_factor,variability_index}` (the source `compute-facts:1124` trusts) instead of recomputing from NP/avg resolved via `computed.overall.*` — which `compute-workout-summary` never writes at the overall level, so it fell through to provider/device power and the classifier's VI/IF gate reasoned over numbers disconnected from the ride. `analyze-cycling-workout` extracts canonical VI/IF + prefers `analysis.power.normalized_power` for NP; `buildCyclingFactPacketV1` takes optional `variabilityIndexOverride`/`intensityFactorOverride` (finite & positive win for facts + classifier + `executed_intensity`, else per-metric recompute). `build.test.ts` added (4 tests); cycling-v1 suite green (83). Deployed `analyze-cycling-workout`.
- `fae293e7` `scripts/verify-cycling-vi-if-fix.mjs` — selects rides by the actual fact-packet-vs-canonical divergence, replays the recompute chain via service role, asserts convergence. Doubles as the Q-008 / item-#2 backfill. Verified run: 8 affected rides (120 d) all reconverged to exact match; `60304656` vo2→tempo, `4375a709` endurance_long→threshold reclassified. (Decision D-015.)

**2026-05-16 — design Build Order + classifier + display polish**
- `a739961f` distance/duration/temperature on the cycling Performance tab — stat line above INSIGHTS + `· {N}°F` on TERRAIN (contract extension: `session_detail_v1.weather`).
- `fd16ef5a` VI gate lowered 1.15→1.10; fixed client stale-display (UnifiedWorkoutView post-recompute refresh now selects `workout_analysis`).
- `d6832a6b` VI gate added to ride classifier (`fallbackClassifyIntent`) + new `'climbing'` `CyclingIntentV1`.
- `71e82dbb` design #1b — HR dashed line on cycling TREND (pace+HR dual-line parity).
- `04eb2b52` TREND `pwr20` series type-filtered to the ride's `classified_type`.
- `f2cb068c` Build Order #9 (three-part) — `athlete_snapshot` ctl/atl/tsb migration + compute-snapshot guarded write + `arc-context.ts` `cycling_fitness`.
- `41d1582d` fix — added `achievements` to the analyze-cycling-workout SELECT (segment history was starved).
- `66dad9d9` Build Order #9 (slice) — CTL/ATL/TSB into the INSIGHTS narrative via cross-workout channel.
- `a42331cc` Build Order #7 — CTL/ATL/TSB PMC model (`workout_analysis.fitness_v1`).
- `685987cb` Build Order #6 — segment ingestion + `cycling_segment_history` table/migration + Garmin GPS climb detection.
- `a5947290` Build Order #3 — NP-based TSS (`computed.analysis.power.tss`).
- `beaa73b9` EFFICIENCY + CLIMBING analysis_details rows.

**2026-05-15 — Performance-tab parity + analysis-mode tier**
- `1c841615` / `82c68fe9` Build Order #1 — mode-aware TREND + `pwr20_trend_v1` 20-min-power series.
- `61851fba` Build Order #4 + #5 — HR-at-power, aerobic decoupling, VAM (`ride-physiology.ts`).
- `7a2fed7f` Build Order #2 — `analysis-mode.ts` mode-detection primitive.
- `a7508755` created `docs/CYCLING-ANALYSIS-DESIGN.md` (the work order).
- `d47a11bd` strip markdown from cycling ai_summary.
- `66cf619e` / `f9efb893` np_trend NP-resolution + SELECT-projection fixes.
- `6afddd99` tighten cycling ai_summary prompt + broaden np_trend NP sourcing.
- `e5c695a6` thread `arc_narrative_context` into cycling + strength analyzers.
- `235aabab` unblock cycling LLM narrative (validator) + add PACING row.
- `837d59e5` surface cross-workout results in display + ai_summary.
- `904aae7c` elevation from laps fallback.
- `f283abfa` phase/transition-aware ACWR fatigue flag.
- `25167b90` Performance-tab buildout to running parity.
- `cead4e9e` `normalized_power_w` field-name fix (dead NP/IF insight).

**2026-05-14 — cycling parity tiers (delta map)**
- `2e0c52c8` Power row; `dc0427da`/`0a358d49` sport-guard run pacing copy + cross-sport key scrub; `25debc8c` cross-workout queries (Tier 3 #10); `04bfdd5f` coach-prompt parity (Tier 4 #11/12/14/15); `d18e4d4f`/`6eb26c59` goal-race + structured adherence verdict; `5a1ec5ea` ride snapshot aggregates; `e18b3d56` snapshot-pin FTP/paces; `48cff4d0` delta map + ingest audit.

---

## 2. State of every major system

- **Arc context** — bike side now non-trivial: `ArcContext.cycling_fitness {ctl,atl,tsb,form}` derived from snapshot columns (`f2cb068c`); `arc_narrative_context` threaded into cycling+strength analyzers (`e5c695a6`); fitness also surfaced into the per-workout INSIGHTS narrative (`66dad9d9`). Power-curve-trend / HR-at-power-trend into Arc are NOT wired (deferred slice of #9).
- **Cycling pipeline** — full running parity for Performance tab: Insights (LLM, arc-aware), TREND (mode-aware, type-filtered, dual pace+HR line), EFFICIENCY, CLIMBING (VAM), POWER ZONES, PACING, TERRAIN (elev + temp), vs-similar, stat line (dist/dur/temp). NP/IF/TSS/efficiency/VAM all in `computed.analysis.*`.
- **Segment history** — `cycling_segment_history` table created (migration applied via SQL editor, confirmed). analyze-cycling-workout non-fatally upserts Strava `segment_efforts` + Garmin synthetic climbs. **Cross-ride trending/race-course matching NOT built** (#8 blocked).
- **Classifier** — `fallbackClassifyIntent` now has a VI gate (VI≥1.10 ∧ IF≥0.85 → `climbing` if ≥40 ft/mi else `tempo`) ahead of the IF branches; `'climbing'` added to `CyclingIntentV1`. Plan-linked rides still use `plan_intent`. **The VI/IF the gate reads are now the canonical `computed.analysis.power.*` values (D-015), not a fact-packet recompute** — pre-2026-05-17 stored classifications were gated on provider/device power and are only corrected on re-analyze.
- **CTL/ATL/TSB** — PMC model (`computeCtlAtl`, 42d/7d EWMA) in `ride-physiology.ts`; per-ride `workout_analysis.fitness_v1`; mirrored into `athlete_snapshot.{ctl,atl,tsb}` (guarded write) and `ArcContext.cycling_fitness`. Migration applied.

---

## 3. Open items (priority order)

1. **avg_hr historical field bug (P1, code defect).** `pwr20`/`np_trend` historical loop reads `r.computed.overall.avg_hr` (frequently null) — should resolve `computed.overall.avg_hr ?? workout_analysis.fact_packet_v1.facts.avg_hr ?? r.avg_heart_rate`, and add `avg_heart_rate` to the SELECT (`analyze-cycling-workout:2077`). Until fixed, the TREND dashed HR line never draws (≥3-HR-point gate in `TrendSparkline`).
2. **pwr20 type-filter backfill — ✅ RESOLVED 2026-05-17.** `scripts/verify-cycling-vi-if-fix.mjs --all` (`83d07fdb`) run wide (180 d, 30 rides, 0 failed): every in-window ride now has a stored `classified_type`; recovery/threshold/climbing/endurance/tempo each ≥3 (pwr20-eligible). Re-run `--all` after any future classifier-input change. See Q-008.
3. **#8 race-course segment matching (P2, blocked).** Needs course-segment geometry from race-course GPX (Data-Dependency ❌); not in the unblock decisions. `cycling_segment_history.race_course_relevant` hook is in place.
4. **#9 remainder (P3).** Power-curve-trend + HR-at-power-trend into Arc/snapshot (the non-CTL slice of #9).
5. **#10 / #11 (deferred — product).** Segment leaderboards; W′ depletion modelling.

---

## 4. Known bugs & workarounds

- **TREND HR line not drawing** → root cause = open item #1 (historical `avg_hr` resolves null). Workaround: none; label still shows current-ride bpm. Fix = broaden the read + SELECT.
- **pwr20_trend_v1 null on reclassified rides** → root cause = open item #2 (single recompute insufficient). Workaround: recompute multiple same-type rides so ≥3 have the new stored `classified_type`.
- **Migration-tracking divergence** → never `supabase db push`; apply new migrations via the SQL editor. Both new tables/columns this session (`cycling_segment_history`, `athlete_snapshot.ctl/atl/tsb`) applied manually; all code touching them is non-fatal/guarded so functions deploy safely pre-migration.
- **Pre-existing unrelated test fail:** `inferTrainingFitnessLevel` (`infer-training-fitness.test.ts`) — fails independent of all this work; suite is "green" at 628 pass / 1 fail.

---

## 5. Key decisions (why)

- **VI-gate IF floor = 0.85 (not spec's 0.88).** Resolved with product via question — 0.88 was logically irreconcilable with the spec's own "VI 1.2, IF 0.85 → tempo" acceptance case. 0.85 keeps all cases consistent and still blocks over-capture of easy variable rides.
- **VI cut lowered 1.15 → 1.10.** Lida/Flintridge climb (VI 1.11) was still mislabeled `threshold` at 1.15.
- **TSS = NP-based Coggan, not xPower/BikeScore.** Resolved in-doc ("consistency over precision for the CTL/ATL trend").
- **Segment history = its own table** (`cycling_segment_history`), per product decision unblocking #6 (workout_analysis would force cross-workout scatter-gather).
- **Temperature via contract extension**, sourced from `weather_data.temperature_start_f ?? temperature` (product-confirmed) — it was not previously in `session_detail_v1`.
- **#8 not fabricated.** Race-course matching left blocked rather than guessing a name-match heuristic the doc says needs GPX geometry.
- Full design rationale: `docs/DECISIONS-LOG.md` (D-009, D-010) + commit bodies.

---

## 6. Next session — immediate steps

1. **Fix open item #1** (avg_hr historical resolution + SELECT) — small, well-scoped, unblocks the TREND HR line. Same pattern as the `normalized_power_w` / `achievements` / np_trend SELECT fixes.
2. **Run the #2 backfill** — re-analyze the athlete's recent rides so type-filtered `pwr20_trend_v1` populates; then verify the climbing TREND on `0dbfd4e4` / the Lida ride.
3. Verify end-to-end on a recomputed ride: `classified_type='climbing'`, fresh narrative (not stale), stat line + TERRAIN temp, dual-line TREND.
4. Then reassess #8 (GPX) and the #9 remainder against product priorities.

---

## 7. Footguns & gotchas

- **`normalized_power` vs `normalized_power_w`** — canonical ride NP is `computed.analysis.power.normalized_power` per `compute-facts:1124`; the `_w` vs non-`_w` divergence has bitten the trend resolver 3×. Use `rideComputedNp` (the established resolver).
- **`computed.overall.*` has no overall power for rides** — `compute-workout-summary` writes `avg_power_w`/`normalized_power_w` only per-interval/segment, never on the `computed.overall` object. Any resolver that leads with `computed.overall.normalized_power_w ?? computed.overall.avg_power_w` silently falls through to provider/device fields. This caused the fact-packet IF/VI bug (D-015); fact-packet IF/VI now come from `computed.analysis.power.*` overrides. Don't reintroduce a `computed.overall.*`-first power resolver.
- **`climb_ascent_m` ≠ total elevation gain** — `computed.analysis.climbing.climb_ascent_m` is grade≥3% climb-segment ascent only; it under-reports total gain on rolling terrain. Total ride gain is `workouts.elevation_gain` (metres). The classifier's elevation-density gate uses total gain (D-016); don't revert it to climb_ascent_m. If you read `elevation_gain` in analyze-cycling-workout, confirm it's in the workout SELECT (projection footgun).
- **SELECT-projection bugs** — repeatedly, code reads a column the query didn't fetch (`achievements`, `np_trend`, now `avg_heart_rate`). When adding a field read in analyze-cycling-workout's cross-workout loop, **check the `.select(...)` includes it**. PostgREST 400s the *entire* query if any selected column is unknown.
- **`Number(null) === 0`** — guard `x == null` BEFORE `Number(x)`/`Number.isFinite` (bit `vs_similar.np_delta_w`, `aerobic_decoupling_pct`, classifier null-IF).
- **classified_type location** — canonical is `workout_analysis.fact_packet_v1.facts.classified_type`; top-level `workout_analysis.classified_type` is the scrub-affected fallback; NOT in `computed`.
- **Cross-sport key scrub** — `runOnlyKeyScrub()` nulls run-only keys in the cycling analyzer payload; the explicit `classified_type` write happens AFTER the spread so it wins.
- **Per-workout vs cross-workout** — `achievements_v1` is *by design* 90-day/all-time PRs attributed to their source ride; "May-13 PRs in today's narrative" is correct PR semantics, not a bleed (the perceived bleed was the stale-display bug `fd16ef5a` fixed).
- **Deploy bundling** — `_shared/session-detail/build.ts` is bundled ONLY into `workout-detail`; `_shared/cycling-v1/*` into `analyze-cycling-workout`; `arc-context.ts` into `get-arc-context`/`coach`. Client = Vite/Netlify (auto-deploys on `git push`).
- **analyze-cycling-workout type baseline = 8; workout-detail = 25** — pre-existing; "zero net new" means matching these via stash-compare, not zero.
