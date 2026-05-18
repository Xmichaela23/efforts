# Engine State

A current snapshot of what's load-bearing, what's known broken, and what's believed-working but unverified. Read this BEFORE proposing changes — most "obvious" bugs were either already fixed (don't re-litigate), already filed (don't re-discover), or intentionally left in place (don't "fix").

Last updated: 2026-05-17.

---

## Solid (don't re-litigate)

Verified-working architecture and fixes. If you think one of these is broken, the bug is probably elsewhere — read the verification method before changing anything.

### §6.1 cycling/running asymmetry — heavy Lower placement
- **Spec:** `docs/STRENGTH-PROTOCOL.md` §6.1 (4f106a78), §6.1.5 consolidation gate widening (b189e7ca), phase-aware adjacency messaging (7715ff5d).
- **Files:** `supabase/functions/_shared/schedule-session-constraints.ts`, `_shared/week-optimizer.ts`, `_shared/plan-generation-trade-offs.ts`.
- **Behavior:** Heavy Lower (Strength Build 78-85%, Maintenance + Power 70-75%, Rebuild 72-80%) is never 24h-adjacent to Quality Run or Long Run; 48h gap minimum from Long Run on both sides; permitted 24h-adjacent to bike sessions per Wilson 2012 (running ES≈0.94 vs cycling ES≈0.32). Hypertrophy / Deload sub-maximal Lower has relaxed adjacency.
- **Verification:** §6.1 conformance contract W-004..W-008 in STRENGTH-PROTOCOL.md §3.8. Test coverage in `supabase/functions/generate-combined-plan/same-day-pairing.test.ts`. Verified manually against multiple plan exports during the §6.1 pass.
- **Open question:** is the heavy-Lower classification protocol-gated to performance, or load-magnitude-gated? See Q-003.

### §7.3 post-race recovery week SKIP
- **Spec:** `docs/STRENGTH-PROTOCOL.md` §7.3.
- **File:** `supabase/functions/generate-combined-plan/week-builder.ts:~1569` — `if (phase === 'recovery') strFreq = 0`.
- **Behavior:** Both hybrid REDUCE-default and durability SKIP-default mid-block 3:1 deloads keep their parent phase (`base` / `build` / `race_specific`) and emit reduced strength sessions. The dedicated post-race recovery week (`phase === 'recovery'` from `phase-structure.ts:289-309 insertRecoveryBlock`) is the only path that triggers the unconditional SKIP. Protocol-agnostic — works for hybrid AND durability.
- **Verification:** Plan #59 W14 went from emitting Hypertrophy Deload Lower to SKIPPED post-fix (commit d42c1079). W4/W8/W12 mid-block deloads still emit reduced sessions as designed.

### Option B endurance-hours deduction
- **Spec:** `docs/SESSION-FREQUENCY-DEFAULTS.md` §2.1.
- **File:** `src/lib/session-frequency-defaults.ts:228-236` (`strengthCountFromIntent`) + line 282-285 (deduction applied before tier lookup).
- **Behavior:** Tier lookup uses endurance-adjusted hours (`declared - strength_count × 0.75hr`); §7 strength count keeps reading declared hours. Hybrid 11hr athlete re-tiers from `10-12` to `8-10` (Plan #59 regression fix, commit cf68cf43).
- **Verification:** 7 deno tests in `supabase/functions/_shared/session-frequency-defaults.test.ts` covering hybrid 11hr/7d, hybrid 11.5hr/7d boundary, hybrid 10hr/7d boundary, hybrid 9.99hr/7d (no §7 discontinuity), endurance-only 11hr/7d (no regression), support 11hr/7d, performance 14hr/7d. All passing.
- **Constant rationale:** see D-001.

### `useStrengthOrderingPreference` hook + `orderDayWorkoutsByTimingThenDiscipline` helper
- **Files:** `src/lib/use-strength-ordering-preference.ts` (hook + module-level cache + in-flight dedupe), `src/components/AllPlansInterface.tsx` (helper at top of file, plus two consumer call sites — markdown export at line ~1785 + weekly view at line ~2369), `src/components/TodaysEffort.tsx` (top cards at line ~693-704).
- **Behavior:** One fetch path for `goals.training_prefs.strength_ordering_preference` (per planId). One sort helper. Three consumers (TodaysEffort top cards, AllPlansInterface weekly view, AllPlansInterface markdown export) all read from the same cache and apply the same sort. Dep-churn-proof — hook depends on the planId string only.
- **Verification:** consolidation shipped in commits e41e7781 (hook) + 3770ad41 (weekly view fourth-consumer fix) on 2026-05-13. Verified manually that all three surfaces render Lower above Run on Thursday for strength_first hybrid athletes; markdown export and on-screen view cannot diverge by construction.
- **Decisions:** see D-003, D-004, D-005, D-006.

### `swim_experience='learning'` → soft -1 in `inferTrainingFitnessLevel`
- **File:** `supabase/functions/_shared/infer-training-fitness.ts:~178` (`if (swimExp === 'learning') score -= 1`).
- **Behavior:** Wizard-collected `training_prefs.swim_experience` is consulted by the training_fitness inference. Soft signal (-1), not hard clamp — bounded by score thresholds, won't over-clamp a strong cyclist/runner who's new to swim. Cascades into swim volume bands and per-session rep caps via existing consumers of `training_fitness`.
- **Verification:** 2 new deno tests in `supabase/functions/_shared/infer-training-fitness.test.ts` (commit 0fd17ad9). 6 of 7 tests pass; the 1 failure is pre-existing on main, unrelated — see Q-006 / D-002.
- **Decision:** see D-002.

### Cycling Performance tab at running parity
- **Files:** `_shared/session-detail/build.ts`, `_shared/cycling-v1/*`, `analyze-cycling-workout`, `workout-detail` (+ client `SessionNarrative.tsx`). Commits `25167b90`→`a739961f` (2026-05-14→16).
- **Behavior:** Cycling INSIGHTS (arc-aware LLM), mode-aware + classified_type-filtered TREND with dual pace+HR line, EFFICIENCY, CLIMBING/VAM, POWER ZONES, PACING, TERRAIN (+temp), vs-similar, and a dist/dur/temp stat line — at parity with running's Performance tab.
- **Verification:** recompute a ride → reload Performance tab; confirm rows render and `classified_type` reflects the VI gate. Pure helpers unit-tested (`classify-intent`, `ride-physiology`, `cycling-trend`, `segments`, `analysis-mode`); suite 628 pass / 1 pre-existing-unrelated fail.
- **Decision:** see D-011..D-014; design `docs/CYCLING-ANALYSIS-DESIGN.md`.

### Intent-aware cycling analysis (Build Order #1–#7, #9)
- **Files/data:** NP-TSS `computed.analysis.power.tss`; CTL/ATL/TSB `workout_analysis.fitness_v1` + `athlete_snapshot.{ctl,atl,tsb}` + `ArcContext.cycling_fitness`; HR-at-power/decoupling + VAM in `computed.analysis.{efficiency,climbing}`; segment ingestion `cycling_segment_history`.
- **Behavior:** per-ride TSS, PMC fitness/fatigue/form, aerobic efficiency + climbing-rate metrics, Strava+Garmin-climb segment history. Both migrations applied via SQL editor; all table access guarded.
- **Verification:** `docs/SESSION-CONTEXT.md` §6 checklist.
- **Decision:** D-011..D-014.

### Cycling fact-packet IF/VI sourced from canonical `computed.analysis.power.*`
- **Files:** `analyze-cycling-workout/index.ts:~1790` (NP resolver now prefers `computed.analysis.power.normalized_power`; new canonical VI/IF extraction passed as overrides), `_shared/cycling-v1/build.ts` (`buildCyclingFactPacketV1` optional `variabilityIndexOverride`/`intensityFactorOverride` — finite & positive overrides win for `facts`, the classifier gate, and `executed_intensity`, else per-metric recompute). Commits `6941a236` (fix) + `fae293e7` (verify/backfill script), 2026-05-17.
- **Behavior:** the packet previously recomputed IF (NP/FTP) and VI (NP/avg) from NP/avg resolved via `computed.overall.*` — which `compute-workout-summary` never writes at the overall level (power is written only per-interval/segment), so it fell through to provider/device power and disagreed with the analyzer. IF/VI now come from `computed.analysis.power.{intensity_factor,variability_index}` (the source `compute-facts:1124` trusts); the classifier's VI≥1.10 ∧ IF≥0.85 gate and downstream TSS/executed_intensity reason over the analyzer's full-series numbers.
- **Verification:** `scripts/verify-cycling-vi-if-fix.mjs` selects rides by the actual fact-packet-vs-canonical divergence and replays the recompute chain. Verified run 2026-05-17: 8 affected rides (120 d), all converged to exact match; `60304656` vo2→tempo and `4375a709` endurance_long→threshold reclassified on the corrected numbers. `_shared/cycling-v1/build.test.ts` (4 tests) + full cycling-v1 suite green (83 pass).
- **Decision:** see D-015.

### Cycling VI-gate elevation density from total `workouts.elevation_gain`
- **Files:** `_shared/cycling-v1/build.ts` (`elevationGainPerMi` now uses `elevationGainM`; climb_ascent_m fallback only), `analyze-cycling-workout/index.ts` (`elevation_gain` added to workout SELECT + passed through). Commit `bdf2cde2`, 2026-05-17.
- **Behavior:** the classifier's ≥40 ft/mi elevation-density gate sources ascent from total ride elevation gain, not grade≥3% climb-segment ascent (which under-reported on rolling terrain and straddled the gate wrong). Supersedes D-011's elevation-source tradeoff.
- **Verification:** May-10 ride `60304656` recomputed post-deploy → reclassified `tempo` → `climbing` (325 m total → 46.5 ft/mi; was 249 m climb-seg → 35.6 ft/mi); VI/IF stayed canonical (fpVI 1.13 = capVI). `build.test.ts` +3 (60304656 fix / climb-seg fallback / total-gain precedence); cycling-v1 suite green (86 pass).
- **Decision:** see D-016 (supersedes D-011 elevation-source only).

### Cycling Performance-tab display & narrative correctness (2026-05-17 — arc close-out)
- **Files/commits:** sport-aware TREND legend `91ea2078`; TREND ≥5-or-text gate `6bf574d4`; POWER-ZONES all-zones + duration-anchored total `80b4c285`/`8e83e5df`; PR attribution + Efforts-scoped language `a0ca4158`; narrative trend-series match + deterministic Arc-lede guard `36a7e792`/`dcaa9f08`/`da7dbce8`; INSIGHTS plain-language + deterministic jargon guard `98c04e2f`/`d6da072c`/`d02abfe4`. Touch `_shared/cycling-v1/ai-summary.ts` + `cross-workout-{types,queries}.ts`, `_shared/session-detail/build.ts`, `src/components/SessionNarrative.tsx`, `analyze-cycling-workout`.
- **Behavior:** TREND legend says "power" for rides; the chart needs ≥5 same-type rides (3–4 → text), cycling-only (running unchanged); POWER-ZONES shows every zone with the total accounting for full ride duration (un-binned coasting → "+Xm other"); the narrative cites the SAME trend series the TREND row shows, never leads with PR/recovery/taper framing, and is plain-language (no IF/VI/EF/HR-decoupling/ACWR/TSB labels-or-numbers; "so what" context; 3–4 sentences). Enforced by a 3-guard stack on the ai_summary — `validateNoNewNumbers` + `ledeOpensWithArcFrame` + `summaryHasJargon` — sharing ONE combined corrective retry (plus `set_on_current_ride` gating "set this ride"; Efforts-scoped language).
- **Verification:** `scripts/verify-cycling-vi-if-fix.mjs --all` (180 d / 30 rides) re-run after each change — final 30/30, 0 failed, **0/30 Arc-lede**, **jargon 0/30**, ≤4 sentences 30/30, IF/VI 26/26 consistent, banned-language 0/30, the 1 PR claim correctly attributed (`60304656`/`54e8fd86`). cycling-v1 suite 96 pass; session-detail 24 pass.
- **Footguns (don't re-litigate):** `docs/SESSION-CONTEXT.md` §7 — narrative trend MUST mirror `pickCyclingTrendSeries` (don't revert to always-np_trend); the lede + jargon guards are deterministic by design (don't delete them / don't "fix" the lede in the shared `arc-narrative-ai-appendix.ts` — would change running); the 3-guard stack shares ONE retry budget (don't split per-guard or cut the attempt count — degrades the others); `achievements_v1` PRs are prior-ride; `computed.overall.*` has no overall power; `climb_ascent_m` ≠ total gain.
- **Decision:** D-015, D-016 (no new D-NNN — display/narrative fixes were single-sane-implementation).

### Plan-gen strength provenance split (Bugs 1&2 / #131)
- **Files/commits:** `reconcile-athlete-state-week-optimizer.ts:276` (stop engine→`strength_preferred_days`), `create-goal-and-materialize-plan/index.ts:~904` (strip engine `preferred_days.strength`, persist `trainingPrefs.strength_optimizer_slots`), `src/lib/format-wizard-prefs-export.ts` ("Strength (scheduled by app):" path). Commit `71611501`, 2026-05-17. D-017.
- **Behavior:** `strength_preferred_days` / `preferred_days.strength` carry ONLY a genuine wizard pin; engine-chosen strength placement lives ONLY in `strength_optimizer_slots` and exports as "scheduled by app", never as an athlete preference. The optimizer is no longer fed phantom strength prefs → no bogus "preferred day rejected" strength trade-offs (root-fixed at source, not composer-suppressed).
- **Verification:** export test +2 (engine→scheduled-by-app; genuine pin still surfaces) flipped from the leak-encoding test; suites green — format-wizard-prefs-export 6, plan-generation-trade-offs 30, week-optimizer.anchor-contract 25, generate-combined-plan 158, all 0 failed; client build clean. End-to-end (live multi-sport regen) NOT yet observed.
- **Footgun (don't re-litigate):** never re-introduce an engine→`strength_preferred_days` or engine→`preferred_days.strength` write (reconcile:276 *was* exactly that bug). Engine strength = `strength_optimizer_slots`. `freshCombinedPrefs` is re-derived from `goal.training_prefs` (NOT the gcp response) — the `:904` strip is what keeps it wizard-only; don't "thread the gcp response" thinking it matters.
- **Decision:** D-017.

---

## Known broken (filed, not blocking)

Behaviors that are demonstrably wrong but intentionally deferred. Don't propose fixes unless you have new information — the deferral was a scoping call, and the list below documents the cost so the next implementer can pick up cleanly.

### `scaledWeeklyTSS` reads declared hours, not endurance-adjusted
- **Symptom:** Plan #60 (hybrid 11hr/7d build week) emit landed at 11h55m vs 11hr declared budget — 24min over after the §2.1 swim drop. Frequency matrix correctly drops a swim slot, but TSS budget remains at the 10-12 tier value, so remaining sessions absorb the freed TSS and grow longer (Friday swim was 1000yd pre-§2.1 → 3200yd CSS aerobic post-§2.1, redistributing freed budget into one larger swim).
- **File:** `supabase/functions/generate-combined-plan/week-builder.ts:~674` (`scaledWeeklyTSS(phase, current_ctl, weekly_hours_available, tssMultiplier)`).
- **Fix shape:** plumb `endurance_hours` out of `computeSessionFrequencyDefaults` as a new field on `SessionFrequencyDefaults`, pass it to `scaledWeeklyTSS` instead of declared hours.
- **Predicted effect:** TSS budget scales to 8-10 tier (~550-650 build TSS, was ~700-800), session durations shorten proportionally, hybrid 11hr athlete lands at ~11h flat instead of 11h55m.
- **Why deferred:** 24min/week overflow compounds across 12 build/peak weeks but is below the ship-blocking threshold. Filed in `docs/POLISH-PUNCH-LIST.md` §4.

### `swim-protocol-volumes.ts` per-band ceilings may still be generous for beginners (Ticket B residual)
- **Symptom:** Plan #60 W6 Friday CSS Aerobic 3200yd (51min); W7 Friday Technique Aerobic 3150yd (1h23m). Learner athlete; target is ≤2500yd aerobic / ≤2000yd threshold per session per Ticket B.
- **Status post-2026-05-13:** swim_experience now flows through to `training_fitness` inference (commit 0fd17ad9), which feeds the band selection. This pulls the band selection toward beginner-tier when wizard explicitly says learning AND CTL signals are not strongly conflicting. Whether per-band ceilings are themselves tight enough for true learners is a separate, residual question — needs spot-check after deploy.
- **Fix shape (if confirmed needed):** per-session ceiling logic in swim slot sizer — learner cap at ~2500 yd per session for aerobic, ~2000 yd for threshold.
- **Why deferred:** new wiring's deploy-time effect not yet measured. Filed in `docs/POLISH-PUNCH-LIST.md` §4 item #133.

### `limiter_sport` intensity-side handling not implemented
- **Symptom:** spec at `docs/SESSION-FREQUENCY-DEFAULTS.md §4` says "Run limiter is handled through intensity, not frequency. Adding run sessions increases injury risk disproportionately. The engine addresses a run limiter by making existing run sessions more productive (longer long run, higher-quality intervals, strides on easy days) rather than adding a 4th session." Implementation today: frequency side is correctly a no-op for run limiter; intensity side has zero implementation. The +7% TSS allocation bump in `science.ts:268-278 getBaseDistribution()` is a percentage shift across all phases, not a per-session intensity boost.
- **Files (where wiring would land):** `supabase/functions/generate-combined-plan/science.ts` (extend `brickRunTargetMiles()` and `longRunFloorHours()` to accept `limiterSport`), `session-factory.ts` (interval modulation), `week-builder.ts` (stride logic).
- **Predicted effect:** ~+65-70 TSS/week for run-limiter athlete (long run +15-20%, quality run +1 tempo interval, strides on 1-2 easy runs).
- **Why deferred:** multi-file medium-risk change; needs an architectural decision on whether the +7% TSS allocation stays additive with the new intensity dial or gets replaced by it. Documented in `docs/TICKET-B-WIRING-AUDIT.md` Field 2.

### "Run — Tempo" vs "Run Intervals 4×1000m" label divergence
- **Symptom:** Same workout renders with two different titles across surfaces. Today's Efforts uses the workout's stored `name` directly. `AllPlansInterface.tsx:881-885` and `PlannedWorkoutSummary.tsx:34-66` both use regex against `description`/`tags` but with slightly different heuristics. Compounded by Monday-May-18 swim title case ("Swim — Drills" vs "Race-Specific Aerobic Swim") which suggests the surfaces also read different upstream data shapes.
- **Files:** `src/components/PlannedWorkoutSummary.tsx:34-66`, `src/components/AllPlansInterface.tsx:881-885`, `src/components/TodaysEffort.tsx` (uses `workout.name` directly).
- **Fix shape:** consolidate the title-derivation into a single shared utility — same architectural pattern as the `useStrengthOrderingPreference` consolidation. Solving at the data layer (one canonical session name per workout, derived once at materialize time) is cleaner than patching label-by-label downstream.
- **Why deferred:** predates the universal fixes; cosmetic, not protocol-violating; queued behind higher-signal work.

### Cycling TREND dashed HR line never draws (historical `avg_hr` null)
- **Symptom:** cycling TREND shows the power line + current-ride "· {bpm}" label but no dashed HR line.
- **File:** `analyze-cycling-workout/index.ts:~2108` reads `r.computed.overall.avg_hr` (frequently null); SELECT at `:2077` omits the reliable `workouts.avg_heart_rate` column. → all historical TREND points `avg_hr: null` → `SessionNarrative.tsx` `TrendSparkline` `hasHr (≥3)` gate fails.
- **Fix shape:** add `avg_heart_rate` to the SELECT; resolve `computed.overall.avg_hr ?? workout_analysis.fact_packet_v1.facts.avg_hr ?? r.avg_heart_rate`. Same projection/field-source footgun class as `cead4e9e`/`41d1582d`/`f9efb893`.
- **RESOLVED (2026-05-17, `4177c05c`):** added `avg_heart_rate` to the loop SELECT; `hrH` resolves `computed.overall.avg_hr ?? fact_packet_v1.facts.avg_hr ?? r.avg_heart_rate` (each candidate guarded). Wide backfill verified 26/26 rides-with-a-trend now have ≥3 HR points → dashed line draws. Kept here as the was-broken record (Known-broken doubles as the fix log, per the pwr20 precedent). Q-007 closed.

### Type-filtered `pwr20_trend_v1` won't populate from a single recompute
- **Symptom:** `pwr20_trend_v1` null on a reclassified ride despite `computed.power_curve['20min']` existing.
- **Cause:** the series filters historical rides by their **stored** `classified_type`; post-VI-gate, a single recompute re-derives only the current ride — historical rides keep stale stored types until re-analyzed. Not a code defect.
- **Fix shape:** historical re-analysis backfill across recent rides. See Q-008 / SESSION-CONTEXT open item #2.
- **RESOLVED (2026-05-17):** one-off script, run wide. `scripts/verify-cycling-vi-if-fix.mjs --all` (`fae293e7` + `--all` `83d07fdb`) replays the full recompute chain via service role. Wide run: 180 d / 30 rides, 0 failed, 26/26 cap-present consistent; 16 historical `null → type`; post-backfill every ride in-window has a stored type and recovery/threshold/climbing/endurance/tempo each ≥3 (pwr20-eligible). No longer broken; kept here as the data-caveat record (a fresh single recompute still only re-derives one ride — re-run `--all` after future classifier-input changes). See Q-008.

### #8 race-course segment matching — blocked on GPX dependency
- **Symptom:** no race-course-relevant tagging on segment history.
- **Cause:** needs course-segment geometry from race-course GPX (Data-Dependency ❌); not in the #6 unblock decisions. Forward hook `cycling_segment_history.race_course_relevant` is in place.
- **Why deferred:** documented blocker; product decision owed (GPS-track matcher vs Strava-only). See Q-009 / `docs/CYCLING-ANALYSIS-DESIGN.md`.

---

## Questioned (worth verifying)

Believed-working but never explicitly verified. Listed here so the next session can pick up the verification cheaply, not so anyone re-implements.

### §6.1 scoping — protocol-gated or load-gated?
- **Question:** Does the heavy-Lower adjacency widening apply to **performance protocol** phases (Strength Build / M+P / Rebuild) only, or to **all sub-maximal-or-above Lower lifts** including durability MS phase (75-85% × 6-10 reps, equivalent load profile but different protocol path)?
- **Why it matters:** if protocol-gated, durability MS Lower could land 24h-adjacent to a quality run without trade-off message. Affects every durability-protocol athlete.
- **Verification approach:** read `_shared/week-optimizer.ts` heavy-Lower classifier; trace whether it reads protocol name or load magnitude. Probably ~30 minutes to confirm.
- **Cross-ref:** `docs/COVERAGE-AUDIT-2026-05-13.md` Profile 1 / Q-003.

### Full IM §3.7 race-spec strength scaling
- **Question:** Per `docs/STRENGTH-PROTOCOL.md §3.7`, Full IM race-specific phase strength drops to 1× upper-only at maintenance load, with halved power volume and no depth jumps. Race-spec frequency is `1` for Full IM (vs `2` for 70.3). Build phase is `1-2`. Commit cf5867fa claims "v2.1 close-out — Full IM scaling" but the implementation is not verified by static read.
- **Why it matters:** Full IM hybrid athletes in race-spec phase. If the §3.7 modifier isn't actually wired, they get over-prescribed strength volume during race-spec — exactly when endurance recovery matters most.
- **Verification approach:** read `_shared/strength-profiles.ts` (or wherever distance-aware session-factory branching lives); confirm race-distance × phase branching exists. Probably ~30 minutes.
- **Cross-ref:** `docs/COVERAGE-AUDIT-2026-05-13.md` Profile 4 / Q-004.

---

## When to update this doc

Append to **Solid** when a fix ships and is verified.
Append to **Known broken** when a bug surfaces and is intentionally deferred.
Append to **Questioned** when a session ends with an unverified claim.
Move items between sections as their state changes — promotion (Questioned → Solid) requires a verification method documented inline.
