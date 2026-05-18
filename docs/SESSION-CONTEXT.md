# Session Context — Cycling Analysis Build (handoff)

**Last updated:** 2026-05-17. **Status:** cycling-analysis arc **PAUSED 2026-05-17** — correctness pass complete, moving to a new app section (see §6 for the resumable state). **Scope:** the cycling-analysis arc — running→cycling parity, intent-aware analysis, segment intelligence, Arc integration. This is the live handoff doc; pair with `docs/CYCLING-ANALYSIS-DESIGN.md` (the work order) and `docs/RUNNING-CYCLING-DELTA.md` (the upstream 31-item delta).

---

## 1. What was built (commit hashes, newest first)

**2026-05-17 — INSIGHTS plain-language polish**
- `98c04e2f` cycling ai_summary prompt rule set: never print IF/VI/HR-decoupling/EF labels-or-numbers (translate to plain language keyed off the packet value); "answer so what?" context (what drove NP/trend; whether the intensity fit the ride type; what the HR-vs-power read means for fitness); 2 → 3–4 sentences; voice = training partner, not a data readout. INSIGHTS only — TREND/POWER/HR rows unchanged. Lede/Arc/PR/numeric-validator behavior preserved.
- `d6da072c` + `d02abfe4` deterministic `summaryHasJargon` guard (prompt-only held only ~70%): bans IF/VI/EF/HR-decoupling + ACWR/TSB/workload-% — labels OR numbers (abbrev check case-sensitive so English "if" never trips); training-load HARD BAN in prose. Wired into the existing combined retry alongside the numeric + lede guards. cycling-v1 +2 tests (96 pass). Wide backfill ×3 → final **jargon 0/30, Arc-lede 0/30, ≤4 sentences 30/30**, IF/VI 26/26 consistent.

**2026-05-17 — Performance-tab display polish**
- `91ea2078` sport-aware TREND legend — "power" for rides, "pace" for runs (was hardcoded "pace"). Distinguishes via `trend.unit === 'W'`; `RouteSparkline` left as pace (running route). Client-only.
- `6bf574d4` cycling TREND requires ≥5 same-type rides for the chart; 3–4 → one-line text ("N {type} rides · {first}W → {last}W · HR improving|declining|consistent"). Cycling-only (`trend.unit==='W'`); running keeps ≥3. build.ts adds `ride_type`; <3 floor kept so 3–4 still reach the client. workout-detail + client.
- `80b4c285` + `8e83e5df` POWER ZONES shows all zones (was top-4 → total didn't sum to ride). Bands >2 min individually + "+Xm other" anchored to `facts.total_duration_min` so the row accounts for un-binned coasting (`computeFtpBinsMinutes` skips pw≤0). Display-time only (workout-detail); no backfill.

**2026-05-17 (latest) — narrative trend-series match + Arc-secondary lede guard**
- `36a7e792` INSIGHTS trend now mirrors the TREND row's series: `cyclingCrossWorkoutDisplay` prefers type-filtered `pwr20Trend` (→ `cross_workout.trend.ride_count`/`ride_type`, e.g. "3 climbing rides") else `np_trend` (full count, no type) — the same selection as `pickCyclingTrendSeries`. Was always np_trend → narrative said "11 rides" while the row showed "3 climbing rides". `pwr20TrendV1` threaded into the cross-workout payload; display key `np_trend` → `trend`.
- `dcaa9f08` + `da7dbce8` Arc context no longer the bike-ride lede. Prompt hardened (HARD CONSTRAINT overriding the shared `arcModeSystemAddon`'s "open with the comeback frame"), plus a deterministic `ledeOpensWithArcFrame` guard wired into the existing 2-attempt retry (folds with the numeric validator into one corrective retry). Sentence 1 must open on a power/fitness signal from this ride; Arc → trailing clause in sentence 2.
- ai-summary +4 tests (trend pwr20-preference; lede-guard incl. the power-lede+Arc-trailing false-positive guard); cycling-v1 green (94). Deployed analyze-cycling-workout ×3; wide backfill re-run after each — final 30/30, **0/30 Arc-lede offenders**; `60304656` verified power-first lede + "three climbs" trend + Arc demoted.

**2026-05-17 — PR attribution + Efforts-scoped AI-summary language**
- `a0ca4158` cycling AI-summary PR fix. `fetchCyclingPRs` excludes the current workout (`.neq`), so `recent_pr`/`all_time_pr` are PRIOR-ride bests — but the prompt's #1 lede was "a power PR set this ride", so the LLM claimed prior bests were set today. `fetchCyclingPRs` now takes the current ride's `computed.power_curve` and adds per-duration `current_value` + `set_on_current_ride` (current ≥ prior best, or no prior best); `cyclingCrossWorkoutDisplay` splits `power_prs_set_this_ride` vs `power_bests_in_efforts`; the prompt may only claim "set THIS ride" for the former. Language de-overstated: "best in Efforts"/"recorded best", never "all-time"/"personal best"/"lifetime" (Efforts only sees synced rides). Additive type (`CyclingPRDurationEntry`); no external consumers. ai-summary +2 / cross-workout-queries +4 tests; cycling-v1 green (91). Deployed.
- Wide backfill re-run (`--all --days 180`, 30/30, 0 failed) propagated the corrected narratives. Verified: 0/30 summaries contain banned phrasing; the 1 ride asserting a best (`54e8fd86`, 5-min 224W) confirmed correctly attributed (`set_on_current_ride=true`, current 224 ≥ prior 207).

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

1. **avg_hr historical field bug — ✅ RESOLVED 2026-05-17 (`4177c05c`).** Loop SELECT now fetches `avg_heart_rate`; `hrH` resolves `computed.overall.avg_hr ?? workout_analysis.fact_packet_v1.facts.avg_hr ?? r.avg_heart_rate`. Wide backfill verified 26/26 rides-with-a-trend have ≥3 HR points → the dashed HR line draws. (Q-007 closed.)
2. **pwr20 type-filter backfill — ✅ RESOLVED 2026-05-17.** `scripts/verify-cycling-vi-if-fix.mjs --all` (`83d07fdb`) run wide (180 d, 30 rides, 0 failed): every in-window ride now has a stored `classified_type`; recovery/threshold/climbing/endurance/tempo each ≥3 (pwr20-eligible). Re-run `--all` after any future classifier-input change. See Q-008.
3. **#8 race-course segment matching (P2, blocked).** Needs course-segment geometry from race-course GPX (Data-Dependency ❌); not in the unblock decisions. `cycling_segment_history.race_course_relevant` hook is in place.
4. **#9 remainder (P3).** Power-curve-trend + HR-at-power-trend into Arc/snapshot (the non-CTL slice of #9).
5. **#10 / #11 (deferred — product).** Segment leaderboards; W′ depletion modelling.

---

## 4. Known bugs & workarounds

- **TREND HR line not drawing** → RESOLVED 2026-05-17 (`4177c05c`): loop SELECT + `hrH` broadened (Q-007 / §3 #1); backfill verified 26/26 rides-with-a-trend now draw the dashed line.
- **pwr20_trend_v1 null on reclassified rides** → RESOLVED 2026-05-17: wide backfill (`verify-cycling-vi-if-fix.mjs --all`, `83d07fdb`) re-derived every in-window ride's stored `classified_type`; ≥3 same-type exist per common type. Re-run `--all` after any future classifier-input change.
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

## 6. Arc status & resumable handoff (PAUSED 2026-05-17)

The correctness pass is **complete and verified** and there are now **ZERO open code items**: IF/VI canonical-source (D-015), VI-gate elevation source (D-016), PR attribution + Efforts-scoped language, narrative trend-series match + deterministic Arc-lede guard, TREND ≥5/text gate, POWER-ZONES full-duration, sport-aware legend, the historical `avg_hr` / TREND HR-line fix (Q-007, `4177c05c`), and INSIGHTS plain-language + the deterministic jargon guard (`98c04e2f`/`d6da072c`/`d02abfe4`) — all shipped, deployed, and propagated by the wide backfill (final: 30/30, **0/30 Arc-lede**, **jargon 0/30**, IF/VI 26/26 consistent, banned-language 0/30, **26/26 trends draw the dashed HR line**). Build Order #1–#7 + #9 done.

**When the arc resumes, only PRODUCT-DEFERRED items remain (no code defects):**
1. **#8 race-course segment matching (P2, blocked):** needs race-course GPX geometry — product decision owed (GPS-track matcher vs Strava-only). Q-009.
2. **#9 remainder (P3):** power-curve-trend + HR-at-power-trend into Arc/snapshot (non-CTL slice).
3. **#10 / #11 (product-deferred):** segment leaderboards; W′ depletion modelling.

**Known cosmetic (deferred, not a code defect — so "zero open code items" still holds):** EFFICIENCY/POWER dashboard rows keep technical jargon (IF/EF/decoupling), now inconsistent with the plain-language INSIGHTS; + a hedgy INSIGHTS closing clause. INSIGHTS-only was the deliberate brief boundary. Tracked in Q-010 / POLISH (P3 cosmetic). Not urgent.

**Tooling:** `scripts/verify-cycling-vi-if-fix.mjs --all [--days N]` is the committed mechanism to re-propagate ANY future analyzer/classifier-input change across ride history (recompute chain via service role; reports reclassifications + IF/VI convergence). Re-run it after touching the analyzer.

---

## 7. Footguns & gotchas

- **`normalized_power` vs `normalized_power_w`** — canonical ride NP is `computed.analysis.power.normalized_power` per `compute-facts:1124`; the `_w` vs non-`_w` divergence has bitten the trend resolver 3×. Use `rideComputedNp` (the established resolver).
- **`computed.overall.*` has no overall power for rides** — `compute-workout-summary` writes `avg_power_w`/`normalized_power_w` only per-interval/segment, never on the `computed.overall` object. Any resolver that leads with `computed.overall.normalized_power_w ?? computed.overall.avg_power_w` silently falls through to provider/device fields. This caused the fact-packet IF/VI bug (D-015); fact-packet IF/VI now come from `computed.analysis.power.*` overrides. Don't reintroduce a `computed.overall.*`-first power resolver.
- **`climb_ascent_m` ≠ total elevation gain** — `computed.analysis.climbing.climb_ascent_m` is grade≥3% climb-segment ascent only; it under-reports total gain on rolling terrain. Total ride gain is `workouts.elevation_gain` (metres). The classifier's elevation-density gate uses total gain (D-016); don't revert it to climb_ascent_m. If you read `elevation_gain` in analyze-cycling-workout, confirm it's in the workout SELECT (projection footgun).
- **SELECT-projection bugs** — repeatedly, code reads a column the query didn't fetch (`achievements`, `np_trend`, now `avg_heart_rate`). When adding a field read in analyze-cycling-workout's cross-workout loop, **check the `.select(...)` includes it**. PostgREST 400s the *entire* query if any selected column is unknown.
- **`Number(null) === 0`** — guard `x == null` BEFORE `Number(x)`/`Number.isFinite` (bit `vs_similar.np_delta_w`, `aerobic_decoupling_pct`, classifier null-IF).
- **classified_type location** — canonical is `workout_analysis.fact_packet_v1.facts.classified_type`; top-level `workout_analysis.classified_type` is the scrub-affected fallback; NOT in `computed`.
- **Cross-sport key scrub** — `runOnlyKeyScrub()` nulls run-only keys in the cycling analyzer payload; the explicit `classified_type` write happens AFTER the spread so it wins.
- **`achievements_v1` PRs are PRIOR-ride bests** — `fetchCyclingPRs` queries with `.neq(currentWorkoutId)`, so `recent_pr`/`all_time_pr` NEVER include the ride being analyzed. The ONLY "set this ride" signals are `durations.*.set_on_current_ride` / `current_value` (added `a0ca4158`). Any narrative/UI that claims "PR set today" off `recent_pr`/`all_time_pr` alone is the attribution bug — gate on `set_on_current_ride`. Language is Efforts-scoped ("best in Efforts"), never "all-time"/"personal best" — Efforts only sees synced rides. (The older "May-13 PRs in today's narrative" concern was the separate `fd16ef5a` stale-display bug, since fixed — not a PR bleed.)
- **Narrative trend MUST mirror `pickCyclingTrendSeries`** — `cyclingCrossWorkoutDisplay` (ai-summary.ts) selects pwr20 (type-filtered, ≥3 same-type → `trend.ride_count`/`ride_type`) else np_trend (all rides, no type), identical to the TREND row's selector in `_shared/session-detail/build.ts`. Don't revert to always-np_trend — that desyncs the narrative ("11 rides") from the row ("3 climbing rides"). `np_trend`'s "N rides" phrasing (no type) is CORRECT when the ride's type has <3 pwr20 points (legit fallback), not a bug. Display key is `cross_workout.trend` (renamed from `np_trend`).
- **Cycling lede must open on power; Arc is secondary (deterministic)** — the shared `arcModeSystemAddon` (system prompt, also used by running) forces a comeback/taper frame in the "FIRST or SECOND sentence". For rides, `ledeOpensWithArcFrame` + the corrective retry in `generateCyclingAISummaryV1` deterministically demote that to sentence 2. Don't "simplify" by deleting the guard and trusting prompt wording — prompt-only left 1/30 rides Arc-led. Do NOT edit `arc-narrative-ai-appendix.ts` to fix this — it's shared and would change running.
- **INSIGHTS narrative quality = a 3-guard stack sharing ONE retry** — `generateCyclingAISummaryV1` runs three deterministic guards on attempt 1: `validateNoNewNumbers` (numeric drift), `ledeOpensWithArcFrame` (power-first lede), `summaryHasJargon` (no IF/VI/EF/HR-decoupling/ACWR/TSB labels-or-numbers; abbrev check is case-sensitive so the English word "if" is safe — don't add an `i` flag). They are **not one-retry-each**: every failing guard folds its correction into a SINGLE combined retry (attempt 2), which is then soft-accepted (a grounded paragraph beats template fallback). **Dependency footgun:** if you cut the attempt budget, split per-guard retries, or make any guard a hard-reject thinking "one guard = one retry", you silently degrade the others — the shared retry is what drives all three to ~0 (prompt wording alone was ~70% jargon-clean and 1/30 Arc-led). Don't delete `summaryHasJargon` and trust prompt rules — same rationale as the lede guard above. ACWR/TSB/workload-% are in-scope by design: they're data-readout jargon and the prompt already banned the math.
- **Deploy bundling** — `_shared/session-detail/build.ts` is bundled ONLY into `workout-detail`; `_shared/cycling-v1/*` into `analyze-cycling-workout`; `arc-context.ts` into `get-arc-context`/`coach`. Client = Vite/Netlify (auto-deploys on `git push`).
- **analyze-cycling-workout type baseline = 8; workout-detail = 25** — pre-existing; "zero net new" means matching these via stash-compare, not zero.
