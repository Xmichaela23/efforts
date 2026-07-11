# Open Questions

Behaviors that look like bugs but might be intentional, or are deferred for a deliberate reason. The point of this doc is to **prevent re-litigation**: when a future session notices one of these and starts to "fix" it, this doc explains why someone already considered it and chose to leave it.

Numbered Q-001, Q-002, … in order of recording. Each entry is tagged with status:

- **cosmetic** — visible but not functionally wrong; user-facing impact is negligible.
- **intentional** — the current behavior is the design call (often paired with a D-NNN decision entry).
- **unverified** — believed correct but never explicitly tested; verification approach noted.

---

## Q-001 — Mon swim+upper renders swim above upper on weekly view

- **Status:** cosmetic
- **Why it exists:** for a strength_first hybrid athlete, the Monday swim+upper stack renders swim above upper in the weekly plan-overview view. The `computeDayTimings()` helper assigns the same AM/PM rank to both (no AM/PM ordering for swim+upper pairings — see D-006), so the discipline-rank tiebreaker takes over (swim=0, strength=3) and swim sorts first.
- **Why not a bug:** §6.1 of `docs/STRENGTH-PROTOCOL.md` only mandates AM/PM sequencing for run+lower interference, which has the real training-science weight (Wilson 2012 ES≈0.94 for running, ≈0.32 for cycling). Swim+upper has trivial physiological interference; ordering is purely visual preference.
- **What "fixing" would require:**
  - Extend `computeDayTimings()` to assign distinct AM/PM ranks to swim+strength pairs based on the athlete's `strength_ordering_preference`.
  - Justify it on training-science grounds (you can't, today — the literature doesn't establish meaningful interference).
  - OR add a "training-priority preference" question to the wizard that sets visual ordering for all stacks regardless of physiological interference.
- **Cross-ref:** D-006.

---

## Q-002 — 14+ hour athletes get a "12-14" tier prescription

- **Status:** intentional
- **Why it exists:** an athlete who declares "14+ hours" with `strength_intent='performance'` actually needs to declare ≥15.5hr to land in the matrix's `14+` tier. At declared = 15hr: 15 - (2 strength × 0.75hr) = 13.5hr endurance → tier `12-14`. Card preview reflects this correctly (per the wizard reactive card, commit e242bec6).
- **Why not a bug:** Option B endurance-hours deduction (D-001) is correct math — it's removing strength wall-clock from the endurance-only tier lookup. The "14+ tier" matrix cell is labeled by *endurance* hours, not declared hours. An athlete training 15hr/week with 1.5hr of that being strength has 13.5hr available for swim/bike/run, which IS the 12-14 tier prescription.
- **What "fixing" would require:**
  - Either change the wizard to surface tier labels as **endurance** hours rather than total declared hours, OR
  - Refactor the matrix to use total-hours brackets and bake the deduction into per-cell prescriptions.
  - Both are wizard copy / UX decisions, not engine bugs.
- **Cross-ref:** `docs/COVERAGE-AUDIT-2026-05-13.md` Profile 3 finding #1.

---

## Q-003 — §6.1 scoping verification (protocol vs load gate) — RESOLVED 2026-05-20

- **Status:** intentional (verified 2026-05-20). Premise was incorrect — implementation is neither protocol-gated nor load-gated; it is **blanket** (all `lower_body_strength` placements treated as HIGH).
- **What was verified:** `_shared/week-optimizer.ts:464-467` defines `isHigh(k)` as `k === 'long_ride' || k === 'long_run' || k === 'quality_bike' || k === 'quality_run' || k === 'lower_body_strength'`. The classifier is **unconditional** on lower_body_strength — it doesn't read `strength_protocol`, doesn't read `repProfile`, doesn't read load magnitude. Every `lower_body_strength` placement gets the §4.7 24h-pre / 48h-post adjacency protection.
- **Implication:** durability MS phase Lower gets the **same** adjacency rules as Strength Build / M+P / Rebuild phase Lower. The implementation is MORE conservative than `STRENGTH-PROTOCOL.md §6.1`'s load-magnitude framing technically allows — the spec lets sub-maximal Hypertrophy / Deload Lower get relaxed adjacency, but the implementation doesn't apply that relaxation. Safe-conservative posture: zero risk of under-protecting heavy Lower at the cost of slightly less placement flexibility for light Lower.
- **Verdict:** no fix required. The premise that "may scope to protocol names" was wrong; the classifier is intent-blind and load-blind by design. If a future need arises (e.g., real Deload-week placement complaints), the spec's load-magnitude relaxation is the natural extension — but no observed defect today.
- **Cross-ref:** `_shared/week-optimizer.ts:464-467` (the `isHigh` classifier); `docs/COVERAGE-AUDIT-2026-05-13.md` Profile 1 question item; ENGINE-STATE.md "Solid" (moved from Questioned 2026-05-20).

---

## Q-004 — Full IM §3.7 race-spec strength scaling verification — RESOLVED 2026-05-20

- **Status:** intentional (verified 2026-05-20). The v2.1 close-out (`cf5867fa`) shipped the §3.7 frequency enforcement; count enforcement is the load-bearing piece.
- **What was verified:** `generate-combined-plan/week-builder.ts:108-128` `strFreqForPhase` has explicit Full IM branching at line 116 (`isFullIm = d === 'ironman' || d === 'full' || d.includes('iron')`):
  - **Build phase** (line 120): Full IM + `weeklyHours >= 18` → 1× strength (vs 2× for 70.3 / standard build at ≥8hr).
  - **Race-specific phase** (line 124): Full IM → 1× strength (vs 2× for 70.3 / standard race-spec).
  - `slotsPlanned = slotsOrdered.slice(0, 1)` at `:1632` takes the first slot. By the optimizer's session_index convention, slot 0 is Upper — so Full IM race-spec realizes "1× upper-only" per §3.7.
- **Partial verification — maintenance load:** §3.7 also prescribes the single race-spec session at maintenance load (halved power volume, no depth jumps). The maintenance `repProfile` is present in `triathlon_performance.ts:501/549/1408` and is the framework Full IM race-spec would consume. Exhaustive trace of `triathlonStrength()` → race_specific × Full IM → maintenance repProfile selection was outside the 30-min verification budget; the count enforcement is verified as the load-bearing constraint (over-prescribing volume is the original concern, and strFreq=1 prevents that regardless of which repProfile fires).
- **Verdict:** no fix required. cf5867fa shipped what its message claimed. Per-session repProfile selection for Full IM race-spec is an "asserted-good-by-framework" residual that would need its own slice if a defect surfaces. None observed.
- **Cross-ref:** `generate-combined-plan/week-builder.ts:108-128` (`strFreqForPhase`); `:1632` (slotsPlanned slice); commit `cf5867fa` (v2.1 close-out); `docs/COVERAGE-AUDIT-2026-05-13.md` Profile 4 question item; ENGINE-STATE.md "Solid" (moved from Questioned 2026-05-20).

---

## Q-005 — `scaledWeeklyTSS` reads declared hours — RESOLVED 2026-05-20

- **Status:** RESOLVED 2026-05-20 (`2a9deab5`, D-021). Fix shipped exactly as the documented shape — `endurance_hours` field added to `SessionFrequencyDefaults`, threaded into `scaledWeeklyTSS` at `week-builder.ts:677` with a defensive fallback for the reconciler short-circuit path; mirrored in `index.ts:481` for `plan_contract_v1.weekly_tss_target`.
- **Verification:** 3 pin tests in `_shared/session-frequency-defaults.test.ts` (hybrid 11hr→9.5; endurance-only equals declared; defensive non-negative clamp) → 71/0. Full `_shared/` sweep 369/0; `generate-combined-plan/` 194/0. Deployed `generate-combined-plan`.
- **Production effect:** hybrid athletes regenerating post-deploy see ~15-20% TSS reduction at tier boundary (intended). Endurance-only athletes unaffected.
- **Cross-ref:** D-021 (decision record); ENGINE-STATE.md Solid (moved from Known broken 2026-05-20); commit `2a9deab5`. The footgun: do NOT conflate `endurance_hours` with `hours_per_week` — declared hours stay the wizard/workout-time budget; endurance hours are the TSS-budgeting axis only.

---

## Q-006 — Athlete declares "learning swim" but has high CTL → intermediate, not beginner — RESOLVED 2026-05-21 (D-024)

- **Status:** RESOLVED 2026-05-21 (D-024 structural fix `8d1315af` + Bundle A wiring fix `370097c1`). The proper structural fix shipped exactly as Q-006's "what fixing would require" line had named — separate `swim_fitness` tier that overrides `training_fitness` for swim-specific consumers only. **Important caveat:** D-024 + D-025 alone were structurally complete but silently no-op'd in production because `mergeCombinedSchedulePrefs` dropped `swim_experience` from its output, feeding `deriveSwimFitness` an `undefined` argument that fell through to inherit `training_fitness`. The Bundle A merge-preservation fix (later same day) restored the data pipeline so the three-layer closure (D-022 cap + D-024 clamp + D-025 type substitution) actually fires for the Plan #78 / Plan #60 W6 population. The same merge bug also silenced the D-002 soft `-1` signal since 2026-05-13. Bundle A re-enables both.
- **Why it existed:** wizard `swim_experience='learning'` added a soft `score -= 1` in `inferTrainingFitnessLevel` (D-002). For high-CTL athletes the soft signal was outweighed by `ctl_ge_42` / `ctl_ge_58` (+1 / +2) — net score landed at intermediate. The Ticket-B cap (D-022) gated on `fitness === 'beginner'` and never fired for this population. Plans #60 W6 and #78 both exhibit it.
- **Resolution:** new pure helper `deriveSwimFitness(trainingFitness, swimExperience)` (`_shared/infer-training-fitness.ts`) — hard clamp at the swim tier: `learning` → `'beginner'`, `'strong'` → `'advanced'`, `'steady'` / unset → inherit. New `AthleteState.swim_fitness` field populated by `create-goal-and-materialize-plan/index.ts` alongside `training_fitness`. `generate-combined-plan/week-builder.ts:1169` reads `swimFitness = athleteState.swim_fitness ?? trainFitness` and threads it through the five swim-specific call sites (templates `:1216`, ceiling/band `:1260`, OD window `:1302`, OD note opts `:1313`, Full IM OD-note gate `:1319`). Non-swim consumers unchanged.
- **Symmetric strong-side**: a beginner-tier athlete who declares `swim_experience='strong'` gets `swim_fitness='advanced'` — unlocks the full bmax. By design; respects an explicit wizard signal on both ends.
- **Verification:** 4 new `deriveSwimFitness` pin tests + 3 Q-006 composition tests (Plan #78 chain, strong-swimmer unlock, steady inherits). `_shared/` 373/0; `generate-combined-plan/` 245/0. Combined 589/0. Deployed `generate-combined-plan` + `create-goal-and-materialize-plan` 2026-05-21.
- **What this does NOT close:** Issue 1 from the Plan #78 audit — learning swimmer still gets `[threshold, race_specific_aerobic]` Week-1 rotation because `raceTwoSwimRotationSlotMeta` is a pure function of `planWeek % 4`. That's a separate swim arc slice (spec-first per `docs/SWIM-PROTOCOL.md §X`, then beginner rotation variant). NOT bundled into D-024 by deliberate scoping.
- **Cross-ref:** D-024 (close-out decision record); D-002 (soft signal, preserved); D-022 (Ticket B cap, now actually reachable for the Q-006 population); commit `8d1315af`. ENGINE-STATE Solid "Q-006 swim_fitness tier override" entry added 2026-05-21. Earlier partial mitigation (`f53bbf34` 2026-05-19 — picker-side beginner drill biasing) remains in place; this fix supersedes its "Q-006 not closed" caveat for the cap path.

---

## Q-007 — Cycling TREND historical `avg_hr` resolves null (HR line never draws)

- **Status:** RESOLVED 2026-05-17 (`4177c05c`).
- **Why it existed:** the `pwr20`/`np_trend` historical loop read only `r.computed.overall.avg_hr`, frequently null (set only from an `hr_bpm` sample series); the loop SELECT didn't fetch the reliable `workouts.avg_heart_rate` column. All historical TREND points got `avg_hr: null` → `TrendSparkline`'s `hasHr (≥3)` gate failed → the dashed HR line never drew (label still showed current-ride bpm).
- **Resolution:** added `avg_heart_rate` to the loop SELECT; `hrH` now resolves `computed.overall.avg_hr ?? workout_analysis.fact_packet_v1.facts.avg_hr ?? r.avg_heart_rate` (each candidate guarded individually so a stored 0/null falls through — `Number(null)===0`). Same SELECT-projection class as the `normalized_power_w`/`achievements`/`elevation_gain` fixes. Wide backfill verified: **26/26 rides with a TREND series now have ≥3 HR points** → the dashed line draws on every one.
- **Cross-ref:** `docs/ENGINE-STATE.md` (resolved); `docs/SESSION-CONTEXT.md` §6.

---

## Q-008 — Type-filtered `pwr20_trend_v1` needs a historical re-analysis backfill

- **Status:** RESOLVED 2026-05-17 — one-off script, run wide.
- **Why it existed:** `pwr20_trend_v1` is filtered to rides whose **stored** `classified_type` matches the current ride's. After the VI-gate classifier change, recomputing one ride re-derives only that ride's type; historical rides keep their stale stored type until they too are re-analyzed. So a single recompute can't reach the ≥3-same-type threshold and the series stays null.
- **Resolution:** one-off script over recent rides (not a triggered job). `scripts/verify-cycling-vi-if-fix.mjs --all` (committed `fae293e7`, `--all` mode `83d07fdb`) replays the full recompute chain via the service-role token, re-deriving every stored `classified_type`. Wide run 2026-05-17 (180 d, 30 rides, 0 failed, 26/26 cap-present consistent): 16 historical rides went `null → type`; post-backfill distribution = recovery 6 / threshold 6 / climbing 6 / endurance 5 / tempo 4 (all ≥3, pwr20-eligible) / vo2 2 / sweet_spot 1, **zero null**. vo2/sweet_spot below 3 only because the athlete logged few such rides — not a backfill gap.
- **Cross-ref:** `docs/SESSION-CONTEXT.md` open item #2 (closed); D-015 (VI/IF-source) + D-016 (elevation-source), the classifier-input fixes this backfill propagated.

---

## Q-009 — Race-course segment matching: GPS-track matcher vs "Strava-only segment intelligence"

- **Status:** blocked on a product decision (Build Order #8).
- **Why it exists:** #8 needs course-segment geometry extracted from race-course GPX (Data-Dependency ❌); it was not among the decisions that unblocked #6. The doc itself flags the Garmin GPS-track matcher as the "highest-leverage open question." The forward hook (`cycling_segment_history.race_course_relevant`) is in place.
- **Open question:** build the GPS-track matcher (universal, larger) or accept "segment intelligence is a Strava-connected feature" as a permanent product boundary? Decide before #8 proceeds — do not fabricate a name-match heuristic.
- **Cross-ref:** `docs/CYCLING-ANALYSIS-DESIGN.md` Primary Constraint; `docs/SESSION-CONTEXT.md` open item #3.

---

## Q-010 — EFFICIENCY/POWER dashboard rows keep technical jargon (inconsistent with plain-language INSIGHTS) — PARTIAL CLOSURE 2026-05-26 / D-062

- **Status:** PARTIAL closure 2026-05-26 / D-062 (commit c2c32517). Dashboard row translations shipped: POWER ("IF 0.85" → "85% of threshold"); EFFICIENCY ("EF · % HR decoupling" → "Watts per heartbeat · HR drift"). Closing-clause INSIGHTS hedge NOT touched per SESSION-CONTEXT §7 3-guard-stack footgun (modifying the cycling LLM prompt without a concrete reproducer risks degrading the existing summaryHasJargon / lede / numeric-drift guard interactions that share a single retry). Hedge softening stays open as the residual half.
- **Original status (preserved):** intentional (deferred) — cosmetic, not urgent (user-flagged "future pass" 2026-05-17).
- **Why it exists:** the 2026-05-17 plain-language brief deliberately scoped the jargon translation to **INSIGHTS only**; the dashboard rows in `_shared/session-detail/build.ts` stay technical by design — POWER `"178W normalized power at IF 1.01"` (`build.ts:~474`), EFFICIENCY `"EF 1.214 · 1.3% HR decoupling"`. With INSIGHTS now plain-language, the rows read inconsistently beside it.
- **Why not a bug:** product-confirmed dashboard rows may be more technical than the narrative; the values are correct — purely a stylistic inconsistency a future session might "fix" not knowing the INSIGHTS-only scope was a deliberate boundary.
- **What "fixing" would require:** soften the POWER/EFFICIENCY row builders in `_shared/session-detail/build.ts` (terser than INSIGHTS — rows are scannable, not prose; e.g. "178 W · ~threshold", "HR held +1.3%"). workout-detail-only, no backfill (rows rebuild per request). Related minor polish: the INSIGHTS closing clause can hedge ("suggests you're in an active recovery or base-building phase rather than a formal taper") — an anti-speculation prompt line would tighten it; substantive, not a guard-worthy defect, so not added to the 3-guard stack.
- **Cross-ref:** `docs/SESSION-CONTEXT.md` §6 (cosmetic-deferred); `docs/POLISH-PUNCH-LIST.md` cycling Open (P3).

---

## Q-011 — Brick bike legs are NOT auto-extended to the long-ride floor (hard enforcer excludes bricks by design)

- **Status:** intentional (regression-guarded). Filed as "Bug 4 — Brick-as-long-ride validator"; the user-visible defect was fixed 2026-05-12, the residual is deliberate.
- **Why it exists:** `generate-combined-plan` has two long-ride-floor surfaces. The SOFT volume warning (`validate-training-floors.ts` `maxLongRideMinutes`, ~386-402) **does** count a brick's bike leg toward long-ride durability — fixed 2026-05-12 (race-prep weeks replace the standalone `long_ride` with a brick; brick bike ≥ floor → no false "no long ride scheduled (observed=0)" warning; bike leg only — the ≤25 min run-off is transition stimulus). The HARD enforcer (`findLongRideSessionInWeek`, ~512-523, used by `enforceLongDayFloors`) **deliberately skips brick-tagged sessions** (`if (tags.includes('brick')) continue;`).
- **Why not a bug:** the two surfaces answer different questions and are consistent under the design intent — *"did the athlete get long-ride durability volume?"* (yes, the brick bike counts) vs *"is there a standalone `long_ride` session to mutate up to floor?"* (a brick is a distinct stimulus and must not be force-extended; brick durability has its own dynamics). The exclusion is **test-encoded** (`long-day-volume-floors.test.ts:603-615` asserts a 90-min brick bike is not bumped) and **regression-guarded** (`rebuild-phase.test.ts:473-485` — `BRICKS_PER_WEEK['rebuild']=0` exists *because* the enforcer skips bricks; the comment calls the exclusion "correct"; reversing it reintroduces the "week-16 long ride 1.8h instead of 2.5h" regression unless that workaround is kept).
- **What reversing it would require (do NOT do casually):** invert/remove the two tests above, re-evaluate `BRICKS_PER_WEEK['rebuild']=0`, and make a training-science call on whether brick bike legs should be auto-lengthened (currently not, by design). That is a deliberate design change warranting a D-NNN that supersedes this entry — not a bug fix.
- **Note:** the fatal/hard path has **no long-*ride* volume floor at all** (only long-*run* TSS share + WoW raw-TSS ramp). The punch-list's "build/race weeks fail floor checks" framing was inaccurate — bricks never failed a hard long-ride floor because none exists. A net-new hard long-ride floor would be separately-scoped feature work, not Bug 4.
- **Cross-ref:** `supabase/functions/generate-combined-plan/validate-training-floors.ts`; tests `long-day-volume-floors.test.ts`, `rebuild-phase.test.ts`; `docs/POLISH-PUNCH-LIST.md` (Bug 4, closed).

---

## Q-012 — Easy run + Lower strength renders Strength-before-Run regardless of `strength_ordering_preference` (deload Thursdays)

- **Status:** intentional (paired with D-006). Surfaced 2026-05-18 as "calendar ordering fix failing on Week 8 deload (Jul 6–12)"; read-only diagnosis confirmed the fix is correct and the ordering is the engine's own rule.
- **Why it exists:** on a deload (or any easy) week, the same-day Lower-strength + run pair has an **easy** run, not a quality/interval run. `decideOrdering()` (`src/lib/pairing-timing.ts:94-96`) returns `{ lowerOrdering: 'AM', partnerOrdering: 'PM' }` for the `easy_run`/`easy_bike` partner kinds **before** the `strength_ordering_preference` check at `:97-98`. So for an easy partner the preference is intentionally not consulted: Lower sorts AM, easy run PM → the calendar cell shows Strength above Run even for an `endurance_first` athlete. Build-week Thursdays render Run-first only because their run is `quality`/`vo2max`/`intervals` → it routes to the preference-*sensitive* branch (`endurance_first` → partner AM, Lower PM).
- **Why not a bug:** this is the recovery-flush training-science call — lower-body strength first, then the easy run as an aerobic flush after it (rationale at `pairing-timing.ts:81-88`; `docs/STRENGTH-PROTOCOL.md §6.2/§6.5`). The client helper is a deliberate mirror of the server's `decideOrdering` (`supabase/functions/_shared/week-builder.ts:1997-2012`), so calendar and engine agree. The 2026-05-18 read-only diagnosis ruled out every wiring suspect for the deload symptom: `events.find(e => e?._src?.training_plan_id)` resolves correctly (active plan `cb0ccb6e…` → goal `8b59fc50…` → `strength_ordering_preference = "endurance_first"`); `_src` is fully populated on deload events (same `toPlannedWorkout` shape as build weeks); `planned_workouts` has no `workout_metadata`/`timing` column so the `timingRank` fallback is never exercised; every day cell goes through `orderDayWorkoutsByTimingThenDiscipline`. The calendar fix (`2ba6c68b`) is faithfully rendering the rule — not regressing it. `endurance_first` correctly does **not** override the recovery-flush ordering for easy partners.
- **What reversing it would require (do NOT do casually):** make the `easy_run`/`easy_bike` branch of `decideOrdering()` consult `strength_ordering_preference`. That reverses the recovery-flush rationale on **both** the client (`src/lib/pairing-timing.ts:94-96`) **and** the server (`supabase/functions/_shared/week-builder.ts:1997-2012` / `decideOrdering`) — it is **not** a client-only / calendar change — and it is a training-science decision that supersedes D-006's pairing logic, so it warrants a new D-NNN, not a bug fix. Note the related, still-unreconciled drift flagged in `CLAUDE.md` → "Known doc/code drifts": `.cursor/rules/lower-body-strength-pairing.mdc:13-16` lists easy run as an allowed Lower partner while the code same-day matrix says `lower_body_strength × easy_run = 0`; `docs/SCHEDULING-RULES.md §8` resolves via conditional ⚠¹. Reconcile that drift in the same pass if this is ever reopened.
- **Cross-ref:** D-006; `src/lib/pairing-timing.ts:81-99`; `supabase/functions/_shared/week-builder.ts:1997-2012`; commit `2ba6c68b` (calendar wiring — confirmed correct, not the cause); `docs/STRENGTH-PROTOCOL.md §6.2/§6.5`; `CLAUDE.md` "Known doc/code drifts" (the cursor-rule easy-run drift); Theme B Slice 5 (`20d22e63`, 2026-05-19) — the dropped B-4 fixture re-verified that `decideOrdering` does not consume `integration_mode`, structurally guaranteeing Q-012's carve-out at the code level (see commit log and `CONSOLIDATED-MODE.md §8` Q-012 row).

---

## Q-013 — Dead inner `if (stacking)` block in `week-optimizer.ts` non-co-equal branch (~:1755) — left in place by design

- **Status:** intentional (deferred cleanup, paired with D-018). Zero runtime effect — the block is provably dead.
- **Why it exists:** Slice 2 (`1fff344b`, 2026-05-18) deleted only the duplicate QR+lower consolidation `trade_offs.push` inside this block (surgical/symmetric with the live co-equal-2× site at `:1604`). The block's guard `const stacking = qualityRunDay === lowerDay && isPerf && isCoEq;` (~`:1747`) requires `isCoEq === true`, but the enclosing branch is the `else` of `if (strengthFreq >= 2 && isCoEq)` (`:1460`) further gated by `if (strengthFreq >= 2)` (`:1687`) — only reachable when `isCoEq === false`. `isCoEq` true ∧ false ⇒ `stacking` is always false here; the entire inner `if (stacking) { … }` (the now-commented push AND the pin-divergence push it wraps) never executes.
- **Why not a bug / why left:** removing dead code was deliberately out of Slice 2's scope (one concern per slice; the user chose "surgical, symmetric only" over "also remove the full dead block"). It has no runtime effect, so leaving it is safe; bundling a larger excision would have entangled dead-code cleanup with the duplicate fix and enlarged the diff.
- **What "fixing" (excising) would require:** re-confirm the `isCoEq` mutual-exclusion still holds (the `:1460`/`:1687`/`:1747` chain), then delete the inner dead `if (stacking) { … }` block (guard + commented push + the pin-divergence push it wraps), preserving the live surrounding `if (lowerDay)` placement / `place(...)` logic. A future refactor of the non-co-equal lower placement is the natural time.
- **Cross-ref:** D-018; ENGINE-STATE Solid "Bug 1 Piece B — trade-off consolidation duplicate (Slices 1 & 2)"; Slice 2 commit `1fff344b`; the live twin at `week-optimizer.ts:1604-1606`.

---

## Q-014 — `computed.swim_equipment_suggested` is incomplete on non-`pull_focused` sessions that contain pull-buoy drills — redundant channel, primary path covers it

- **Status:** intentional (don't fix). Surfaced 2026-05-19 during the Phase 2 §6.2 drill-pool spec-compliance work (`ef91c2ee`). Read-only audit traced consumers across `src/` + `supabase/`.
- **Why it exists:** `materialize-plan/index.ts:1349-1393` `inferSwimEquipmentPack` derives the session-level `computed.swim_equipment_suggested` field from `row.tags` only (`req:buoy`, `req:board`, `optional:snorkel`, …). Those tags are emitted by `session-factory.ts` for `pull_focused` (`:936` → `req:buoy`) and `kick_focused` (`:878` → `req:fins`/`req:kickboard`) sessions, but **not** for `threshold`/`css_aerobic`/`technique_aerobic` sessions whose drill inset can rotate in pull-buoy-required drills (`swim_drills_4x50yd_scull`, `_scullfront`). Result: server-side `swim_equipment_suggested` omits `'buoy'` for those sessions even though one of their drill steps needs one.
- **Why not a bug — three downstream paths, none broken:**
  - **Garmin export** (`send-workout-to-garmin/index.ts`): zero references to `computed.swim_equipment*`. Garmin sees per-step `step.equipmentType` only, populated by `materialize-plan/index.ts:1790-1794` `inferEquipFromDrillName` which has an explicit `/scull/ → 'buoy'` branch. Per-step `SWIM_BUOY` works.
  - **Form goggles export** (`src/utils/formGogglesSwimScript.ts`): zero references. Form reads `st?.equipment` per step → `formatEquipment('buoy')` → `'Pull buoy'` appended to the drill step's description. Per-step works.
  - **In-app `PlannedWorkoutSummary` / `AllPlansInterface` "Bring" chip**: consumes `swimPlannedEquipmentFromWorkout` (`src/lib/plan-tokens/swim-drill-tokens.ts:429`), which at `:457-463` independently aggregates equipment from `workout.steps_preset` via `swimDrillEquipmentFromTokens(...)` → `DRILL_EQUIPMENT_MAP` **before** reading `computed.swim_equipment_suggested`. The client-side aggregator covers the gap regardless of whether the server-side field is complete.
- **What "fixing" would require — and why it's not worth doing:** wire `swimDrillEquipmentFromTokens` into `inferSwimEquipmentPack` so `computed.swim_equipment_suggested` reflects all drill-token-implied equipment, not just `req:*`/`optional:*` tags. Pure belt-and-suspenders: zero athlete-visible behavior change because (a) Garmin/Form don't read the field at all, and (b) the only in-app reader already derives the same data from `steps_preset` independently. Cost: enlarges the diff and creates a second derivation site for the same data, increasing drift risk.
- **Cross-ref:** Phase 2 commit `ef91c2ee` (added scull/scullfront to build pool, triggered the audit); `src/lib/plan-tokens/swim-drill-tokens.ts:398` (`swimDrillEquipmentFromTokens` — the correct DRILL_EQUIPMENT_MAP-aware aggregator, used by the in-app aggregator but NOT by the server-side field); `materialize-plan/index.ts:1349-1393`, `:1790-1794`; `send-workout-to-garmin/index.ts:925-931`; `formGogglesSwimScript.ts:99-101`.

---

## Q-015 — §6.3 "never repeat across consecutive sessions" relies on rotation salts, not recent-pick memory — RESOLVED 2026-05-25 / D-043 + D-044 + D-045

- **Status:** RESOLVED 2026-05-25 / D-043 + D-044 + D-045. Picker capability, caller wiring, and harvest bug all shipped. Cross-week repeat prevention confirmed on regenerated plan (W1 Fri Fingertip Drag → W2 Fri 6-3-6 Rotation + Single-Arm → W3 Mon Fingertip Drag, distinct from W2). D-043 shipped the picker filter capability (`prevWeekDrillTokens` opt at `swim-drill-tokens.ts:521-538`); D-044 item 6 threaded the opt end-to-end through 7 swim creators; D-045 fixed the orchestrator harvest in `generate-combined-plan/index.ts` (was walking `week.days[].sessions[]` but `buildWeek` returns flat `week.sessions[]` per `computeWeekMetrics` at `week-builder.ts:593` — the wrong-shape walk silently produced an empty Set every week). Surfaced by a real-plan audit (W2 Fri Catch-Up → W3 Mon Catch-Up). D-045 extracted the harvest to `generate-combined-plan/drill-token-harvest.ts` (pure helper) and pinned the N→N+1 contract with 6 tests in `drill-token-harvest.test.ts`.
- **Original Phase 3 Slice 3c context preserved below for the why-it-existed record:**
- **Why it existed:** `pickSwimDrillInset` (`src/lib/plan-tokens/swim-drill-tokens.ts:242`) rotated the eligible pool via `(planWeek * 3 + salt) % n` where `salt = drillSlotSalt + SWIM_DRILL_KIND_SALT[sessionKind]`. Different session kinds within a week got distinct salts (easy=0, css_aerobic=5, threshold=11), and the `*3` factor distributed the start index across weeks. But there was no tracking of recently-emitted drills — at adversarial salt × pool-size combinations, the same drill could re-appear across consecutive weeks for the same session kind.
- **Why it wasn't blocking pre-fix:** pool sizes post-Phase 2 are 9 (base) / 8 (build) / 4 (peak) / 2 (taper). Collisions were infrequent in practice, and the cost was one occasional repeat — not a training-quality issue, just a §6.3 variety-rule whisper. The peak/taper pools are small enough that some repetition is unavoidable regardless (the picker falls back to the unfiltered pool when filtering would empty it — see `swim-drill-tokens.ts:534-537`).
- **Cross-ref:** D-044 item 6 (commit `ca1e6cd0`); D-045 harvest fix (this commit); `supabase/functions/generate-combined-plan/drill-token-harvest.ts` + `.test.ts`; `swim-drill-tokens.ts:475-538` (picker + filter); `docs/SWIM-PROTOCOL.md §6.3`.

---

## Q-016 — §2 drill/swim ratio scaling (drill yardage by intent × experience) not implemented (Phase 3 Slice 3e deferred)

- **Status:** intentional (Phase 3 Slice 3e, deferred 2026-05-19). Scoped out of Phase 3 as the highest-risk piece; warrants its own investigate-first arc.
- **Why it exists:** `docs/SWIM-PROTOCOL.md §2` prescribes drill/swim ratios from 75/25 (race-adequate + learning) down to 10/90 (race-adequate or performance + competitive). `pickSwimDrillInset` (`src/lib/plan-tokens/swim-drill-tokens.ts:242`) is athlete-experience-blind — drill yardage is fully token-static (4×50yd = 200yd, 2×50yd = 100yd, etc.). No `training_fitness` input to the picker; no ratio enforcement.
- **Why not blocking:** per-token drill yards (50-150yd typical) are aerobically inconsequential vs the 1500-3500yd main sets the protocol's session-count + band-volume layers already differentiate by experience (Slice 1 band-lerp at `c1c94cec`, fitness-tier band selection at `week-builder.ts:1092`). The drill block size matters for stroke-mechanic emphasis, not for training-load distribution; learners get more frequent technique aerobic sessions instead.
- **What "fixing" would require (Slice 3e, deferred):** new token variants for high-ratio learners (e.g. `swim_drills_6x50yd_<name>` at 300yd, `swim_drills_8x50yd_<name>` at 400yd); materialize-plan regex tolerance update (`materialize-plan/index.ts:1806` already accepts `\d+`); drill-yardage tier table mapping `(intent, experience) → multiplier`; threading `training_fitness` into `pickSwimDrillInset`. Investigate-first arc with its own slicing — drill-yards-by-tier intersects with the band-volume protocol and needs explicit scoping against double-counting.
- **Cross-ref:** `docs/SWIM-PROTOCOL.md §2 ratio table` (lines 46-53); Phase 3 Slice 3a commit; `src/lib/plan-tokens/swim-drill-tokens.ts:242`; `materialize-plan/index.ts:1806` (drill regex).
- **Audit 2026-05-25 (D-047 batch Item 3):** Investigate-first audit confirmed the deferral. Concrete gap on a 2000yd Learning session: spec wants 1500yd drill / 500yd swim; current picker emits ≤600yd drill (Path A 3-drill cap) or ≤200yd (Path B / beginner one-focus). Decision: **stays deferred** — the §2 ratios overlap the session-count layer (§3) and band-volume layer (Slice 1 lerp). Naively scaling within-session drill yards on top of those layers risks **double-counting** (learners already get more sessions × bigger drill block each = compounded over-prescription). A clean fix needs: new high-rep token variants, dispatcher accepting `(intent, experience) → target_drill_pct`, re-tuning of `SWIM_DRILL_MAIN_FLOOR_YD` (350yd floor becomes the binding constraint at 75% drill ratios), explicit responsibility carve-out between §2 (per-session) and §3 (per-week), and cross-layer pin tests. Multi-day arc with cross-protocol implications — not a 1-commit fix. Still warrants its own investigate-first slicing when picked up.
- **Partial closure 2026-05-25 (D-057):** Path A (technique_aerobic) tier ratio targeting LOCKED at 30/20/10 (vs §2's aspirational 75/30/10) to avoid double-counting. Path B + beginner one-focus paths unchanged. Q-016 remains OPEN for the multi-layer §2 full alignment (would still need the multi-day arc above); D-057 ships the minimal-risk subset.

---

## Q-017 — RUN-PROTOCOL §5.8 ("NEVER race week") vs §9.1 ("optional race-day priming strides") — engine picks §5.8; spec-edit deferred

- **Status:** intentional (paired with D-023). Spec internally inconsistent; engine resolved conservatively pending the next spec pass.
- **Why it exists:** RUN-PROTOCOL.md §5.8 says strides are "**NEVER** in race week (interference with taper)" — a hard ban. §9.1 (race-week protocol section) says "Easy run 2-3mi early week; optional 1× short strides (race-day priming, not a workout)" — a permissive carve-out. Both readings are present in the current spec. Phase 2 (`shouldInjectStridesOnEasyRun`) had to choose; it picked §5.8.
- **Why §5.8 wins (engine side):** the gate is a clean veto on `raceThisWeek`. Simpler test surface (race-week tests assert NO strides), simpler invariant (no special branch needed for race-week dosing), and conservatively safe (an athlete who DOES want race-day priming can do it themselves — the engine just won't prescribe it).
- **Why not a bug:** the §9.1 reading would require a different code path than the Phase 2 modifier. §9.1's "race-day priming" is a separate concept — a 2×20s dose tied to *race-day morning*, not the weekly Wed easy run. That belongs in a `RACE-WEEK-PROTOCOL §8` slice (race-day session shape), not the `addStridesToEasyRun` easy-run modifier. Bolting it onto Phase 2 would conflate two different stimuli.
- **What "fixing" would require:**
  - **Option A (favored — small):** edit `RUN-PROTOCOL.md` §5.8 to remove the "NEVER race week" wording (or scope it to "NEVER on the weekly easy run during race week"), edit §9.1 to clarify "priming strides" as a race-day-specific construct outside the weekly modifier path. No engine change. Resolves the spec inconsistency in §5.8's direction without losing the §9.1 concept.
  - **Option B (larger):** keep §9.1 as-is and ADD a race-day priming session in `science.ts:raceDaySessionSpec` (the distance-aware race-day session at `9c393119`). Engine emits a 2×20s warm-up block bundled with the race-day session. Larger blast radius — touches RACE-WEEK-PROTOCOL Gap-6/Gap-9 surfaces.
- **Cross-ref:** D-023; RUN-PROTOCOL.md §5.8 / §9.1; `_shared/week-builder.ts shouldInjectStridesOnEasyRun`; `science.ts:raceDaySessionSpec` (Option B target if pursued).

---

## Q-018 — RUN-PROTOCOL §4.5 realized-progression table drifts from engine output at interior weeks (±0.5mi); endpoints exactly match

- **Status:** cosmetic — spec drift, not engine defect. Endpoints exactly match the LOCKED 2026-05-20 spec values.
- **Why it exists:** the §4.5 "Realized progression for 70.3" table shows `Base wk 1-6: 8.5 → 9 → 9 → 9.5 → 10 → 10mi`. The actual engine output (post-Phase 3 lift, peak=13) is `8.5 → 8.5 → 9 → 9 → 9.5 → 10mi`. wk 2 differs by 0.5mi. Build wk 1-4: spec table `10 → 10 → 11 → 11`; engine `10 → 10 → 10.5 → 11`. RS wk 1-4: spec `11 → 12 → 12 → 13`; engine `11 → 11.5 → 12.5 → 13`. **Endpoints (8.5 → 10, 10 → 11, 11 → 13) match exactly in every phase.**
- **Why not a bug:** the spec was written before the lerp + `roundHalfMile` interaction was hand-computed week-by-week. The interior progression depends on half-mile rounding granularity at the lerp's output, which the spec table approximated. Engine output is mathematically correct given the locked `START × peak / PEAK × peak / phaseProgress / roundHalfMile` formula.
- **What "fixing" would require:** patch the §4.5 realized-progression block in `docs/RUN-PROTOCOL.md` with the actual engine output. One-line correction, no code change. Mirror of Phase 1's spec-correction sub-decision (taper 0.40→0.45 / recovery 0.55→0.40, recorded in D-023). Do it next time the spec is touched.
- **Footgun (don't re-litigate):** the right direction is **spec follows engine**, not engine follows spec. Tuning the engine to match the spec table would (a) lose the half-mile rounding semantics that match real-world coaching weekly-mileage prescriptions, and (b) require a new rounding function that interpolates between half-mile values — wasted complexity for a cosmetic doc fix.
- **Cross-ref:** D-023; `docs/RUN-PROTOCOL.md §4.5`; `generate-combined-plan/science.ts longRunMilesForWeek` + `LONG_RUN_RAMP_ENDPOINTS`.

---

## Q-019 — Wetsuit trade-off (§5.4 deferred to Slice 4.5)

- **Status:** intentional (deferred — Slice 4 shipped session-copy expansion only; trade-off needs new wizard / arc-context signals).
- **Why it exists:** `docs/SWIM-PROTOCOL.md §5.4` prescribes a trade-off warning when a tri A-race requires a wetsuit AND the athlete has no logged open-water access — "Race requires wetsuit; no open-water access logged. Recommend at least 2 wetsuit-on swims in lake / ocean / reservoir before race day." Slice 4 (commit appended in this session) shipped the per-session §5.4 copy expansion (bilateral breathing + drafting) for Race-Specific Aerobic sessions in race-specific phase. The trade-off was scoped OUT because the two detection signals don't yet exist:
  1. **Race-requires-wetsuit:** no `goal.training_prefs.race_requires_wetsuit` field; no race-water-temp lookup. The 78°F threshold in §5.4 is informational only — the engine has no data source for water temp at a given race location/date.
  2. **OW-access-logged:** no `arc-context` field surfaces a count of `open_water_swim` activities; no wizard question captures whether the athlete has lake/ocean/pool access. `arc.swim_training_from_workouts` tracks total session count but doesn't break out OW.
- **Why not a bug:** the trade-off without either signal would be noisy. Options like "always surface for 70.3 / full IM" generate false warnings for warm-water races; heuristics on `swim_equipment` (wetsuit ownership) are brittle. Spec compliance > false alarms.
- **What "fixing" (Slice 4.5) would require:**
  - **Wizard input:** new `arc_setup_prompt.ts` chat question + `training_prefs.race_requires_wetsuit?: boolean` persisted field, surfaced when athlete declares a tri A-race in cool-water conditions. Could also be inferred from race name / venue via a lookup table — out of scope.
  - **OW-access signal:** new `arc_setup_prompt.ts` question OR `arc-context.ts` field counting recent `open_water_swim` activities (the `session-detail/build.ts:83` reference to `refined_type === 'open_water_swim'` is the Garmin/Strava ingest classification — needs aggregation into a count field for arc-context to surface).
  - **Trade-off emission:** extend `buildCombinedPlanGenerationTradeOffs` opts with `wetsuitWithoutOpenWater?: boolean`; new `message_template_id: 'race_wetsuit_no_open_water_access'` + `PlanTradeOffKind: 'swim_race_prep'` (or reuse `'swim_calibration'`).
  - **Detection at create-goal:** check `goal.training_prefs.race_requires_wetsuit === true` AND `arc.recent_open_water_sessions === 0`.
- **Cross-ref:** SWIM-PROTOCOL §5.4 (wetsuit row); Slice 4 shipping commit (this session); Slice 3 §7.5 trade-off pattern (`swim_calibration`) — the wetsuit trade-off would follow the same shape with a new kind/template_id.

---

## Q-020 — Ankle band as a §8.1 equipment enum addition — RESOLVED 2026-05-25 / D-058

- **Status:** intentional (deferred — coaching value confirmed; engine surface requires wizard scope decision).
- **Why it exists:** Coaching research (Swim Smooth, Tri Training Harder) identifies the pull buoy + ankle band combination as a meaningful beginner body-position teaching tool — distinct from the "buoy as fitness crutch" pattern this spec rightly warns against (§5.5). With ankles bound, the swimmer cannot use a kick to compensate for poor alignment; they're FORCED to hold horizontal posture through core engagement + balanced rotation. Documented in `docs/SWIM-PROTOCOL.md §6.4` (2026-05-22) but **not surfaced in athlete copy** because `ankle_band` is not in the §8.1 equipment enum.
- **Why not fixed in the 2026-05-22 spec revision:** Adding the enum entry has wider blast radius than the rest of the revision and depends on a wizard scope decision. Required changes if approved:
  1. **Wizard:** new chip + label in `src/components/TrainingBaselines.tsx` swim equipment list (`swimmingEquipmentOptions` array) AND/OR `ArcSetupWizard.tsx` equipment step (whichever surface the wizard uses for swim gear).
  2. **Equipment normalization:** `equipment.swimming` array now carries an extra string; `swimGearNormalized` in `src/lib/plan-tokens/swim-drill-tokens.ts` needs to recognize "ankle band" / "ankle_band" / similar variants.
  3. **Drill-token equipment map:** new entry mapping the buoy+band coaching pattern to a drill modifier (e.g. `buoy_band_freeswim` or a `band:` suffix on existing pull buoy drills); engine-side surfacing path TBD with the coaching slice.
  4. **Chip surface:** `materialize-plan: inferSwimEquipmentPack` recognition for `req:band` / `optional:band` / `recommended:band` so the calendar/drawer chips render correctly.
- **Coaching judgment call deferred to wizard scope:** does the existing wizard need a separate "ankle band" chip, or should it be grouped with "Pull buoy" as "Pull buoy + ankle band" (single entry, both implied)? Bundling reduces wizard friction but limits the engine's ability to surface beginner-specific buoy+band drills only when the athlete actually owns the band.
- **Cross-ref:** SWIM-PROTOCOL §6.4 (the coaching note that surfaces the value), §8.1 (the enum hosting the deferred decision); separate from Q-019 (wetsuit) which is a different missing wizard signal.

---

## Q-021 — Run threshold pace not aggregated weekly in `compute-snapshot` (Phase 1 reconciles easy pace as the proxy)

- **Status:** intentional (deferred — Phase 1 / D-033 scope decision; revisit if easy-pace proxy proves insufficient).
- **Why it exists:** the feedback-loop workorder phrasing ("observed threshold pace") implied a weekly aggregate of Z4 / threshold-effort pace from interval sessions. `compute-facts` derives `pace_at_easy_hr` per workout (`compute-facts:1075-1083` — heart-rate-gated below threshold × 0.78), and `compute-snapshot` aggregates that into the weekly `run_easy_pace_at_hr` field. **There is no symmetric threshold-pace aggregation** — `compute-snapshot:123-138` does not extract Z4 pace from interval sessions into a `run_threshold_pace` weekly field. The data is observable in per-workout `workout_analysis` interval extracts, just not aggregated at week granularity.
- **Why not a bug:** Phase 1 (D-033) deliberately scoped to reconcile `learned_fitness.run_easy_pace_sec_per_km` instead. Per `docs/PHASE-1-RUN-PACE-SPEC.md` §2.4: easy pace at sub-threshold HR is the cleanest read on aerobic fitness; threshold prescriptions inherit via existing Daniels-style ratios applied to the reconciled easy pace. Reconciling at the input source means every downstream pace target (engine prescriptions, derived threshold, derived race pace, long-run pace) inherits naturally. Adding threshold-pace aggregation today would be a parallel pathway with no obvious additional signal.
- **What "fixing" (Phase 1.5 candidate) would require:**
  - **`compute-snapshot/index.ts`:** new aggregator pulling Z4-effort intervals (from `workout_analysis.intervals_v1` or similar) and computing weekly median Z4 pace. New `run_threshold_pace_at_z4` column on `athlete_snapshot` (migration).
  - **Wrapper:** `buildRunObservedFitness` extended to populate a new field on `RunObservedFitness` (e.g. `median_threshold_pace_sec_per_km`).
  - **Reconciler:** `resolveRunEasyPace` would either branch into a `resolveRunThresholdPace` sibling, or the reconciler shape would change to return both easy + threshold reconciliations. Spec amendment required for the per-distance / per-effort-tier map of which prescription consumes which signal — currently §4.6 anchors race pace + interval pace to `performance_numbers.fiveK_pace` (athlete-controlled). Threshold-pace reconciliation could touch that anchor or stay scoped to long-run / tempo prescriptions only.
- **Verification owed:** none today — easy-pace reconciliation is the locked Phase 1 design. Phase 1.5 (or a future open question) would re-litigate this if real-world feedback shows the easy-pace proxy + Daniels-ratio derivation isn't responsive enough at threshold prescriptions specifically.
- **Cross-ref:** D-033 (Phase 1 scope decision); `docs/PHASE-1-RUN-PACE-SPEC.md` §2.1 (data audit), §2.4 (scope decision rationale), §4.6 (per-distance scoping).

---

## Q-022 — `segment_progress_metrics` writer chain is broken; table has not been written to since ~2026-03-01 — RESOLVED 2026-05-25 / D-059

- **Status:** RESOLVED 2026-05-25 / D-059 (commit 0adfc948). Column names corrected (`_sec_per_km` → `_s_per_km`; removed non-existent `metric_date`). Error handling switched from try/catch-eat to console.warn with Postgres code + workout/segment IDs so future schema drifts surface instead of silently rotting. Original audit preserved below.
- **What was broken:** `compute-facts/index.ts:421-451 writeSegmentProgressMetric` referenced columns that don't exist on the live `segment_progress_metrics` table: `grade_adjusted_pace_sec_per_km` (`:666` — real column is `grade_adjusted_pace_s_per_km`), `metric_date` (Variant C `:446` — column doesn't exist), `avg_pace_sec_per_km` (Variant C `:447` — real column is `avg_pace_s_per_km`). PostgREST returns `42703 column does not exist`; the three-variant fallback's try/catches swallow the error silently. **All three variants are broken**, so no new writes succeed. Live query against the table (2026-05-23) returned 42 rows from 3 distinct workouts, all from 2026-02-26 through 2026-03-01 — historical backfill or older code path. No workouts after 2026-03-01 are represented.
- **Why it's not blocking D-036:** within-workout decoupling (D-036) uses sample-level data directly from the analyzer, not from `segment_progress_metrics`. The per-segment HR-vs-history feature (which would consume this table) was therefore correctly scoped out of D-036.
- **What was fixed (D-059):** (a) ✓ column names corrected in main payload + Variant C; (b) ✓ try/catch-eat replaced with console.warn surfacing Postgres code + workout_id + segment_id; (c) **NOT done — backfill of pre-fix workouts left as a separate decision** (without backfill the per-segment HR-vs-history surface would only see "new" workouts and have no comparison history for ~3 months); (d) **NOT done — GAP-adjusted segment comparison wiring (`build.ts:633-678` discards `todayGap`/`avgPastGap`) remains separate scope**.
- **Cross-ref:** RUN-HR-DRIFT-SPEC.md §6 (out-of-scope rationale).

---

## Q-023 — `aerobic_direction` unwired into workout INSIGHTS — RESOLVED 2026-05-24 / D-042

`aerobic_direction` + `aerobic_efficiency_trend_pct` wired into workout
INSIGHTS signals block. AEROBIC EFFICIENCY TREND prompt rule live. Path A
minimal wire (4 files, no schema, no client). Bands ±2% match
compute-snapshot:409. Translate-only — never quotes the percentage.

Original entry preserved below for institutional memory:

Filed: 2026-05-23

`aerobic_direction` computed weekly (compute-snapshot:407-427), stored on
`athlete_snapshot`, labelled by `longitudinal-signals.ts:135-154` as
`improving | stable | declining`. Reaches conversational coach (`coach/index.ts:4884`)
and plan generation (`create-goal/index.ts:1688`) — zero consumers in the
workout INSIGHTS pipeline.

`vs_similar.trend` (session pool, up to 8 workouts) reaches INSIGHTS and speaks
to a similar concept from a different window. Complementary, not redundant.

Not scheduled. Pick up after `run_easy_hr_trend` rename — rename first so the
field name is clean at the wire point.

---

## Q-024 — `hr_delta_bpm` null on recomputed sessions despite populated pool — RESOLVED 2026-05-25 / D-047

Filed: 2026-05-24 · Resolved: 2026-05-25 / D-047 / commit `244c22c4`

Root cause: asymmetric HR field resolution between current workout and
historical pool. Pool-side `getSimilarWorkoutComparisons()` (queries.ts:598)
called `getOverallAvgHr(r)` which checked three keys in order
(`overall.avg_hr` → `overall.avg_heart_rate` → `workouts.avg_heart_rate`).
Current-side `build.ts` checked **only** `overall.avg_hr` inline via
`coerceNumber(overall?.avg_hr)`. When a row stored HR under the alternate
key, current-side dropped to null; pool-side resolved fine; `hr_delta_bpm`
short-circuited to null.

**Fix shipped (D-047):** export `getOverallAvgHr` from `queries.ts:174-177`
and use it on the current side too — `build.ts:291` is now
`const avgHr = getOverallAvgHr(workout) ?? hrSensor.avg`. Same three-stage
chain on both sides, sensor fallback at the tail as defense-in-depth.

7 pin tests in `queries.test.ts` lock the contract. Q-024's audit
"investigate build.ts:387" had stale line numbers — the actual fix landed
in the broader build.ts:282-291 block. Audit confirmed during 2026-05-26
batch (Item 5 was a stale follow-up).
path before next HR signal ship.

---

## Q-025 — TREND pool spans training phases; direction label misleading post-race — RESOLVED 2026-05-25 / D-050

Filed: 2026-05-24

TREND pool for easy runs passes ±15% pace filter but pre-race taper points
can still appear when `days_since_last_goal_race >= 60` (outside D-041's
exclusion window). Marathon taper runs (peak fitness) pool against
week-1-build re-entry runs. "32s/mi slower" label is mathematically honest
but contextually misleading. Narrative correctly suppresses the claim via
`pool_pace_context` but TREND row label still shows red.

**Status:** RESOLVED 2026-05-25 / D-050. Pace-at-HR percentile classifier
shipped end-to-end across 5 pieces (commits `e95b3c94` → `1f11555e`).
Server emits `pace_at_hr` per trend point + `pace_at_hr_direction` +
`pace_at_hr_basis` on session_detail_v1.trend; client renders pace-at-HR
as the primary line with athlete-facing labels ("getting more efficient"
/ "holding steady" / "worth watching") when the classifier returns a
usable direction; raw-pace fallback preserved.

**Classifier shape (locked):** session signal = mean of last K=3 pair-
slopes, classified against p33 / p67 of the within-window pair-slope
distribution. Switched from whole-window LR slope (structurally biased
toward 'stable' — LR ≈ mean(pair_slopes) → always middle third) to
recent-K mean (responsive to current trend; K=3 smooths single-session
noise). Stable-bias preserved for degenerate distributions (uniform
deltas → no NEW direction). Improving/declining fire only when recent-K
mean is unusually extreme vs the athlete's internal volatility — the
~33/33/33 distribution by construction prevents the spurious-red-label
class of bug that originally filed this Q.

**Original Q-025 problem statement preserved below for the why-it-existed
record:**

TREND pool for easy runs passes ±15% pace filter but pre-race taper points
can still appear when `days_since_last_goal_race >= 60` (outside D-041's
exclusion window). Marathon taper runs (peak fitness) pool against
week-1-build re-entry runs. "32s/mi slower" label is mathematically honest
but contextually misleading. Narrative correctly suppresses the claim via
`pool_pace_context` but TREND row label still shows red.

Real fix: derive TREND direction from pace-at-HR, not raw pace. Needs
`pace_at_hr` on trend points (server) + new sparkline render (client).
Spec written 2026-05-25: `docs/PACE-AT-HR-TREND-SPEC.md`.

**What shipped (D-050):**
- `pace_at_hr` field on each trend point (queries.ts + build.ts append)
- Percentile classifier helper (`pace-at-hr-direction.ts`) — GAP coverage
  ≥60% → restrict to gap-basis points; ≥6 points or insufficient_data
- session_detail_v1.trend surface: `pace_at_hr_direction` +
  `pace_at_hr_basis`
- Client SessionNarrative.tsx: pace-at-HR as primary line when available;
  red color ONLY on declining (stable + improving never red — the exact
  class of bug Q-025 originally filed)
- 18 pin tests in `pace-at-hr-direction.test.ts` lock the contract

**Multi-user calibration note (open as follow-up, not blocking):** the
classifier was tuned + verified on one athlete's data (D-047 batch).
Production observation may surface tuning opportunities — most likely
candidates are the K=3 smoothing window (K=2 more responsive / K=4
calmer) and the GAP_COVERAGE_THRESHOLD (0.6 today). Single-athlete
tuning would over-fit; revisit after 2-4 weeks of production data.

Cross-ref: D-041 (60d exclusion window); D-047 (symmetric `getOverallAvgHr`
resolution — prerequisite); D-050 (this closure);
`docs/PACE-AT-HR-TREND-SPEC.md`; `supabase/functions/_shared/fact-packet/pace-at-hr-direction.{ts,test.ts}`.

---

## Q-026 — Backward anchor leaking on unplanned sessions with no plan link — RESOLVED 2026-05-25 / D-046

Filed: 2026-05-24 · Resolved: 2026-05-25 / D-046 / commit `97111a01`

Forward-bias hard ban (D-039 / D-040) worked on linked sessions in
`build_read` and `unstructured_read` modes but unplanned sessions with no
plan link fell through because Arc mode context is weaker without a plan.
`days_since_last_goal_race` surfaced in the ARC FACT BLOCK and the LLM used
it when no stronger forward signal existed.

**Fix shipped (D-046):** new `arcUnplannedBackwardAnchorAddon` helper in
`_shared/arc-narrative-ai-appendix.ts` wired into running ai-summary at
`_shared/fact-packet/ai-summary.ts:~1175` and cycling ai-summary at
`_shared/cycling-v1/ai-summary.ts:~400`. Adds an explicit suppression
clause to UNPLANNED MODE that mirrors the D-040 Fix B phase-label ban
pattern.

---

## Q-027 — `days_since_last_goal_race` reported off by 2 (could not reproduce; date semantics question)

Filed: 2026-05-25 (D-055 / Item 12).

User reported: narrative shows "32 days" when the actual count is 34
days (April 19 race → May 23 viewing date). Three calculation sites
audited — all return the expected value via noon-UTC-anchored math:

  - `_shared/arc-narrative-state.ts:72` `calendarDaysBetween` → 34 ✓
  - `_shared/arc-context.ts:646` `days_ago` (Math.floor) → 34 ✓
  - `analyze-running-workout/index.ts:2018` (same shape) → 34 ✓

**Likely explanation (not a bug):** arc-narrative anchors to the
WORKOUT DATE, not the viewing date (see `analyze-running-workout:2000`
where `focusYmd = workout.date`). A workout completed on May 21 viewed
on May 23 will correctly report "32 days post-race" — that's 32 days
from the WORKOUT's perspective.

Per-workout semantics are intentional: the narrative describes the
workout's relationship to events, not a moving "as of right now" frame
that would shift each time the athlete reopens the session.

**Action requested:** confirm with a concrete reproducer (workout ID +
narrative output) whether the discrepancy is the WORKOUT-DATE-vs-
VIEWING-DATE semantic OR a genuine 2-day arithmetic bug. The
`calendarDaysBetween` JSDoc now spells out the semantic explicitly
(D-055 commit) so future readers don't trip on it.

---

## Q-028 — first_race build-phase quality run still emits `tempoRun` (threshold-labeled)

- **Status:** unverified / cosmetic
- ⚠️ **DO NOT "FIX" THIS BY REVERSING D-061.** The build-phase `tempoRun` here is a **deliberate** D-061 decision (build-phase tempo = the on-ramp toward race-specific threshold). Routing it through `sweetSpotRun` reverses a locked call — it requires a coaching decision + a new superseding D-NNN, NOT a bug-fix. A future session reading "arguably out-of-step" below must treat that as an open *question* held for a coaching call, not a sanctioned to-do.
- **Why it exists:** D-069 swapped the base-phase first_race quality run from `intervalRun` to a new `sweetSpotRun` (sustained Z3 moderate, RPE 6, not labeled threshold). The build-phase first_race gate at `week-builder.ts:~1614` (D-061) still emits `tempoRun` when `runWeekInPhase < 4`. tempoRun's description literally says "at lactate threshold (comfortably hard — 7-8 RPE)." Within the D-061/D-069 conservative-build philosophy (first_race athletes accumulate aerobic durability before crossing into threshold), routing the early-build downgrade through tempoRun is arguably out-of-step with the base-phase change.
- **Why not "fixed":** D-061 is its own decision-log entry with explicit coaching rationale (build-phase tempo is the on-ramp toward race-specific threshold). Changing it without that rationale would reverse a prior call. Hold until an athlete actually flags the build-phase tempo as too intense in plan review.
- **What "fixing" would require:** route first_race build-phase pre-week-4 through `sweetSpotRun` as well, OR draw a defensible line between "no threshold in base" and "tempo in early build is fine because it's the on-ramp." Either decision needs a coaching call, not a code change.
- **Verification approach:** review first_race plans at week 8-10 (first three weeks of build for a 17-week 70.3) with an athlete in plan-review. If they flag the tempo as too intense, escalate to sweetSpotRun there too.

---

## Q-029 — Plan-matrix harness checks structural assertions only, not session label content

- **Status:** intentional (for now)
- **Why it exists:** `scripts/plan-generation-matrix.mjs` asserts on session counts, types, tags, and a handful of keyword presence checks (Z-zone leak, "threshold" word, route name leak, hybrid label leak). It does NOT compare full session descriptions to a reference corpus or verify language quality. D-069's first_race base-phase change had to be verified by direct JSON inspection because the matrix battery couldn't distinguish "Sweet-Spot Run" from "Run Intervals."
- **Why not a bug:** the matrix's value is detecting drops, errors, and structural regressions across 486 combos in 60 seconds. Adding fuzzy label-content assertions would add maintenance burden (every copy change requires regenerating the corpus) for catching a class of bugs that plan review handles better.
- **What "fixing" would require:** either a snapshot-test approach with a reviewed corpus (high maintenance) or a separate plan-review workflow with periodic athlete-facing sampling (lighter, but not automated).
- **Cross-ref:** D-069 verification gap.

---

## Q-032 — Attach-triggered analyzer recompute is not wired

- **Status:** unverified / structural deferral · filed 2026-05-26 from the May 23 ride attach audit (D-075 follow-up).
- **Why it exists:** when a workout is analyzed at sync time and the planned-workout attach happens later (separate user action), the analysis cache stays stale. The first-order cost is `session_detail_v1.classification.is_unplanned: true` on a workout that IS attached at the data-model level. The second-order cost is everything else the analyzer derives from `plannedWorkout` (intervals, performance adherence, plan-aware LLM context) staying in the unplanned shape until something else triggers a recompute. The bidirectional link write happens in the attach endpoint (sets `workouts.planned_id` + `planned_workouts.completed_workout_id`) but doesn't queue or fire a recompute of `workout_analysis` for the executed workout.
- **Cross-ref:** same class as the `pwr20_trend_v1` stale-type issue (known footgun, different surface). D-075 fixed the cycling analyzer's silent column-error bug that was masking this; once D-075 ships, the staleness becomes the visible class of bug remaining.
- **Why not "fixed":** D-075 closes the largest visible symptom for cycling because the silent 42703 was the actual reason `is_unplanned` was stuck — recompute now works correctly. Pure attach-after-ride timing (the original hypothesis) IS a smaller class than initially thought, but it's still real: any workout where attach happens after the ai-summary already ran has stale narrative until something re-fires the analyzer. `session_detail_v1` rebuilds on next `workout-detail` call (UI open), but the `ai_summary` text and `vs_similar_v1` / `np_trend_v1` cycling-side blocks won't refresh until a full analyzer rerun.
- **Fix shape (deferred):** when the attach endpoint writes the bidirectional link, queue or directly invoke `recompute-workout` (or `analyze-{sport}-workout` with service role) for the affected workout. Same pattern as the `ingest-activity` fan-out at lines ~1430-1580 — register the new downstream there. Risk: cascading triggers if attach happens repeatedly or in bulk.
- **Verification approach:** find the attach endpoint(s) — likely `attach-planned` or similar — and confirm whether they invoke any recompute today. If not, this Q stands; if they do, find why it didn't fire for the May 23 ride.

---

## Q-031 — §4.21 (concurrent training spacing) is NOT enforced in tri/run generators

- **Status:** intentional / deferred — DOES need wiring, but prereqs block clean implementation. Filed 2026-05-26 from Item 6 of the autonomous batch audit.
- **Why it exists:** §4.21 is the concurrent-training spacing rule (lower_body_strength must keep ≥24h from quality_run / quality_bike in both directions; sandwich rejection; CLEAN → SOFT → SANDWICH → DROP tier ladder). It's enforced in `generate-combined-plan` via `_shared/week-optimizer.ts`'s `sequentialOk` + `concurrentSpacingTier` + prime-mover taxonomy in `_shared/schedule-session-constraints.ts`. The other three plan generators (`generate-run-plan`, `generate-triathlon-plan`, `generate-plan`) are NOT routed through that pipeline.
- **Current state per audit (2026-05-26):**
  - `generate-plan/index.ts` — 71-line stub that validates input only; no actual generation. **Not invoked anywhere.** Likely orphaned/dead code. No §4.21 work needed; consider deleting.
  - `generate-triathlon-plan/index.ts` — emits a high-level plan structure (`week_intent_by_week`, `schedule_preferences: { long_ride_day, long_run_day }`) with NO per-day session placements. §4.21 doesn't apply at this layer — there's nothing to enforce against. The actual session-per-day emission happens downstream in `create-goal-and-materialize-plan` (legacy path) or the new combined-plan pipeline. **Blocker: none at this layer; §4.21 already covered downstream IF downstream uses combined-plan; not covered in the legacy materialize path.**
  - `generate-run-plan/strength-overlay.ts` — uses `simplePlacementPolicy` (`_shared/strength-system/placement/simple.ts`) which is explicitly **"day-agnostic"** per its docstring. The policy assigns strength to abstract slots (`upper_primary`, `lower_primary`) without consulting `long_run_day` / `quality_run_day` from `athleteState`. **Blocker: simplePlacementPolicy is by design not aware of quality endurance days; making it §4.21-aware is a redesign, not a wire-up.**
- **Why not "fixed" in this batch:** the clean fix requires either (a) extracting `sequentialOk` + prime-mover taxonomy into a portable `_shared/spacing.ts` helper that operates on a generic `(sessions, day, kind)` signature both data shapes can produce, then refactoring `simplePlacementPolicy` to call it; OR (b) routing `generate-run-plan` through `_shared/week-optimizer.ts` (a substantial refactor of the run-plan pipeline). Neither is in scope for an "audit + wire if clean" item — both need their own design pass.
- **Recommended next move:** delete `generate-plan/index.ts` (dead). Decide whether `generate-run-plan` should be deprecated in favor of single-sport routing through `generate-combined-plan` (the natural consolidation), OR get the `simplePlacementPolicy` day-awareness refactor scheduled. Don't try to inline §4.21 in two places — that's the path to drift.
- **Cross-ref:** `docs/SCHEDULING-RULES.md §4.21` (the rule), `docs/POLISH-PUNCH-LIST.md` line 194 (the open item, now linked back to this Q for visibility).

---

## Q-030 — first_race base-phase swim threshold IS allowed (intentional asymmetry vs D-069 run rule)

- **Status:** intentional
- **Why it exists:** D-069 swapped first_race base-phase quality run from `intervalRun` → `sweetSpotRun` (no run threshold in base for first-timers). The parallel swim slot on the same plan still emits `Swim Threshold` (e.g., Friday `[quality, threshold, swim, swim_drills]` in W1 of every first_race/advanced/*/70.3 and full combo). At first glance this looks like a coherence gap — same intent, same phase, opposite gate. It is **deliberately** not symmetric.
- **Why not "fixed":** the run-side gate exists because run threshold work carries injury risk for first-race athletes early in the plan — impact loading, eccentric damage, 48-72h recovery cost compounding on a base aerobic foundation that isn't built yet. Swim threshold has none of those properties: no impact, no eccentric loading, 24-hour recovery. Swim fitness *is* built through threshold work in base — depriving a first-race athlete of swim threshold to satisfy a run-side rationale would slow swim development with no compensating safety benefit.
- **Coaching call:** confirmed 2026-05-26 by the engine owner. Swim threshold in base is the *correct* prescription for first_race athletes; the run-vs-swim asymmetry is the right physiology, not a bug.
- **What "fixing" (routing swim through an aerobic-only base variant for first_race) would require:** a coaching reversal of the above call — would need new evidence that swim threshold in base is injurious or detrimental for first-time athletes specifically. None known.
- **Cross-ref:** D-069 (run rule), Q-028 (open question on whether build-phase first_race tempoRun should also become sweetSpotRun — different question, different phase).

---

## Q-033 — cycling AI summary uses terrain vocabulary for virtual/indoor rides

- **Status:** deferred / low urgency
- **What it is:** the cycling LLM prompt at `supabase/functions/_shared/cycling-v1/ai-summary.ts:403` literally instructs the model to translate moderate `variability_index` into the phrase `"natural power variation from the terrain"`. That phrasing is correct for outdoor rides (rollers, surges, climbs) but wrong for Zwift / smart-trainer / virtual rides — no real terrain, the variation comes from the trainer's interval changes or the virtual route's resistance profile.
- **Where it surfaces:** any cycling workout with `provider_sport === 'VirtualRide'` or whose source is Zwift (the only current virtual provider in the system) and `1.05 < VI < 1.10`-ish. Observed on workout `f9fb690b` (today's sweet spot ride on Zwift, VI 1.09) — pre-D-091 the lede was *"147 W normalized power — sub-threshold effort with natural power variation from the terrain"*. After D-091 the lede correctly leads with sweet-spot intent, but the terrain phrase could still appear later in the paragraph.
- **What the fix would look like:** swap the prompt's VI translation table to trainer-aware language when `workout.provider_sport === 'VirtualRide'` (or some equivalent virtual flag). Candidate phrasing: *"power variation from the interval structure"* (when `is_mixed_effort`), *"steady output across the trainer block"* (when low VI), *"surging power blocks"* (when high VI). Pass `is_virtual_ride: boolean` into the cycling display packet and add a parallel rule near the existing line 403.
- **Why deferred:** D-091 already lands the bigger win (intent-led narratives instead of terrain-led ones). Once intent leads, the terrain phrase is at most a secondary sentence and the misread is minor. The D-076 HARD BAN on route/course/GPX language remains the more serious correctness rule; this is a cosmetic vocabulary swap, not a fabrication issue.
- **Cross-ref:** D-076 (HARD BAN on route/course/GPX language), D-091 (plan_intent derivation from tags/tokens).

---

## Q-034 — Strength logger viewport overflow on iOS 393pt — RESOLVED 2026-06-08 (D-114)

- **Status:** RESOLVED 2026-06-08 via D-114 — but **not** through the grid restructure recipe captured below. Shipped a collapse/expand redesign instead: only the active set renders full controls (stacked vertically with Done/✕ in a right-aligned footer); all other sets collapse to a one-line summary with `min-w-0 + truncate` + `shrink-0` action buttons, which kills the overflow class structurally rather than re-budgeting columns. Verified at 380px via `scripts/verify-strength-row-380.mjs` (every control ≤344px vs 354px border, both states; old layout overflowed +207px). Bug A (set-0 rest-row mismatch) fixed in the same pass — see D-115. The grid recipe below is left intact as the historical audit; do **not** implement it. Commit `ce83b9b0`.
- **Status (original):** unverified-deferred (audit complete; fix recipe documented; deferred to a fresh session — not shipped end-of-day under time pressure)
- **What it is:** the set row in `src/components/StrengthLogger.tsx:3256` overflows the card width on iOS 393pt devices. The card bleeds off both edges of the viewport. Surfaced 2026-06-03 alongside the D-108..D-110 resume-hardening work. Audit done; not fixed.
- **Why it overflows (verified):** the set row is a single non-wrapping horizontal `flex items-start gap-2` track. Width budget on iOS 393pt: `393 − 24 (px-3) − 16 (card p-2) − 11 × 8 (gaps) ≈ 265pt`. The current row consumes >330pt because:
  - D-098 `±2.5 / ±5` weight stepper nests INSIDE the weight column, dominating its intrinsic width (~134px vs the natural `w-16` = 64px).
  - D-099 RIR pills are `w-7` each (5 × 28px + 4 × 2px gap = 148px).
  - D-096 "Same as set 1" button is in a `flex-1 min-w-4` spacer.
  - Plus Set# (`w-6` = 24px), Reps column (~64px), Done (~50px), Delete (~36px).
- **Fix shape (documented; do this in a fresh session):**
  1. Convert outer container at `StrengthLogger.tsx:3256` from `<div className="flex items-start gap-2">` to a 2-row CSS grid via `<div className="grid grid-cols-12 gap-2 items-start">` — or a `<div className="space-y-1.5">` wrapper containing two stacked `grid grid-cols-12 gap-2` rows for cleaner column alignment.
  2. Row 1 (primary inputs): Reps `col-span-3` | Weight value `col-span-3` | RIR pills `col-span-4` (shrink `w-7 → w-5`) | Done `col-span-2`.
  3. Row 2 (secondary widgets): Set# `col-span-2` | Stepper `col-span-4` | Same `col-span-4` | Delete `col-span-2`.
  4. Extract D-098 stepper from inside the weight column (currently nested) so the weight column shrinks to its natural `w-16`.
  5. Extract D-096 "Same" button from the flex-1 spacer so it can occupy row 2 independently.
  6. Move Set# and Delete to row 2 (less prominent placement).
- **Why deferred:** ~80-100 lines of nested JSX rewrite touching the conditional branches (duration-based exercise, baseline-test set hints, band-resistance dropdown, plate-math expansion below the row). Medium regression risk if shipped at the end of a long session. Pragmatic shrink-only (`w-7 → w-5` on RIR + `px-1.5 → px-1` on stepper chips) was considered and rejected — even at maximum shrinkage the row still overflows by ~30-40px because the stepper must come out of the weight column. The grid restructure is the only path that fully solves it. End-of-day shipping it would invite a regression at exactly the wrong time.
- **Verification target after fix:** open logger on iOS 393pt device with a barbell exercise (so stepper renders). All set-row columns visible within card boundaries; card flush with viewport edges. Spot-check: duration-based exercise (treadmill / time-under-tension), baseline-test set, band-resistance with band-color dropdown — each conditional branch renders correctly post-restructure.
- **Cross-ref:** D-096, D-098, D-099 (the widgets that pushed the row over budget). The audit is repeatable from this entry; do not re-litigate the diagnosis.

---

## Q-035 — "Deleting a logged strength workout also deletes the planned prescription" (awaiting user repro)

- **Status:** unverified (awaiting user repro artifacts)
- **What it is:** user reports: deleting a logged/actual strength workout from the UI also removes the planned prescription. Expected behavior: the planned row stays intact at `status='planned'`; only the logged execution is removed.
- **What the code says (verified 2026-06-03):** `useWorkouts.deleteWorkout` at `src/hooks/useWorkouts.ts:1685-1697` does NOT delete from `planned_workouts`. It DELETEs the `workouts` row and then UPDATEs the linked `planned_workouts.status` back to `'planned'` (a revert, not a cascade delete). So if the planned row is disappearing, one of these is true:
  1. **Silent revert failure** — the UPDATE to `status='planned'` raises an error that's swallowed; the DB row remains at `status='completed'` and downstream filters hide it.
  2. **UI staleness across hook instances** (Leak B — `usePlannedWorkouts` per-instance React state — separate filed issue). The planned row may still exist in the DB but the local React state of the calling component is stale, so the row appears "gone" from the user's perspective. A page refresh would reveal it's actually intact. **Most likely candidate per the available signals.**
  3. **DB cascade trigger** — an unexpected ON DELETE CASCADE between `workouts` and `planned_workouts`. Schema audit didn't reveal one, but worth confirming if (1) and (2) are ruled out.
- **What to ask the user for:**
  - Exact repro steps + timestamp + the affected workout's planned_workouts.id and workouts.id.
  - Network capture (DevTools Network tab) of the DELETE-workout flow showing the request + response sequence.
  - After the "delete," check in Supabase Studio whether the planned_workouts row is `(a) deleted entirely`, `(b) status='completed' (silent revert failure)`, or `(c) status='planned' but invisible in UI (staleness)`. That tells us which candidate it is.
- **Why deferred:** D-110 A1 (which touches `usePlannedWorkouts.deletePlannedWorkout`) was initially suspected — confirmed it CANNOT fire from the `deleteWorkout` path because the two flows don't intersect. The audit ruled it out within 30 seconds. The remaining three candidates need repro artifacts to disambiguate; without them, fixing blind risks shipping the wrong fix.
- **Cross-ref:** Leak B (Pick planned stale across hook instances; filed separately under POLISH-PUNCH-LIST background items). D-110 A1+A2 (related but distinct — D-110 is the OPPOSITE direction: planned-delete leaving an actual-side localStorage orphan).

---

## Q-036 — Option B adherence field (`derived.intent_execution_match`) — deterministic, TSS-based — DEFERRED (full spec captured)

- **Status:** deferred / spec complete / open decision pending
- **What it is:** the principled architecture for "the analyzer should not assert execution matched intent when it didn't." D-113 stopped the user-visible contradiction in the POWER row; Q-036 captures the deeper field-and-LLM-constraint design that closes the LLM lede too.
- **Why deferred:** the build is ~150 lines (new file `_shared/cycling-v1/adherence.ts` with constants + classifier + tests; types extension; build.ts wiring; renderer row; LLM HARD CONSTRAINT prompt addition; backfill over rides with planned_id). Spec is settled but one coefficient question is open (secondary IF gate, see below).
- **The design (settled):**
  - **Planned TSS source = `planned_workouts.computed.steps[]` summed Coggan** (`(sec/3600) × IF² × 100` per step, midpoint of `powerRange` as NP proxy, `powerTarget` as fallback). NOT `planned_workouts.workload_planned` — that column is `calculate-workload`'s TRIMP+duration-intensity output, NOT Coggan, NOT numerically comparable to `computed.analysis.power.tss`. Worked: 3×15 sweet spot plan → ~77 TSS Coggan vs stored `workload_planned = 115`. Apples and oranges if the column is used directly.
  - **Actual TSS = `computed.analysis.power.tss`** (Coggan, D-112-corrected). Same formula on both sides.
  - **Field:** `derived.intent_execution_match: 'on_target' | 'under' | 'well_under' | 'over' | 'well_over' | 'unstructured' | null`. Companion: `derived.planned_tss_coggan: number | null` so the renderer can show both numbers without recomputing.
  - **Bucket math:** `delta = (actualTss - plannedTssCoggan) / plannedTssCoggan`. `|delta| ≤ 0.20 → on_target`; `0.20 < |delta| < 0.50 → under/over`; `|delta| ≥ 0.50 → well_under/well_over`. No planned TSS → `unstructured`.
  - **Constants in a single named module:** `_shared/cycling-v1/adherence.ts` exporting `ADHERENCE_TSS_ON_TARGET_PCT = 0.20`, `ADHERENCE_TSS_SEVERE_PCT = 0.50`, `ADHERENCE_RECOVERY_DEFAULT_IF = 0.30` (for steps without powerTarget — most "recovery" steps in computed.steps), and (if secondary gate is enabled) `ADHERENCE_IF_TOLERANCE = 0.03` + `INTENT_IF_FLOOR` map.
  - **Two consumers:** (a) new renderer row in `session-detail/build.ts` added after POWER row, neutral comparison wording ("Planned ~77 TSS sweet spot; delivered 62 at moderate intensity — came in lighter than planned."); (b) HARD CONSTRAINT in `ai-summary.ts` at top of constraint stack — when match is `under`/`well_under`, lede MUST acknowledge the gap and MUST NOT assert execution matched intent ("right in the sweet-spot zone" / "held the X target" / "as prescribed" banned).
  - **Backfill:** re-trigger `analyze-cycling-workout` for cycling rides with planned_id; same shape as D-112's backfill, different target function. Adds `intent_execution_match` + `planned_tss_coggan` only — touches nothing from D-111/112/113.
- **Open decision (the one open question):** **secondary IF gate on or off?**
  - Without it, target ride 6bf694a6 classifies `on_target` by 0.5 percentage points (delta = -19.5%, just inside ±20% band). TSS dose was within tolerance even though IF (0.79) is below sweet-spot floor (0.83).
  - With it (TSS primary + IF secondary): when primary is `on_target` AND `plan_intent ∈ {sweet_spot, threshold, vo2, anaerobic}` AND actual IF more than 0.03 below the intent's expected floor, demote to `under`. Catches 6bf694a6 (0.79 vs floor 0.83, gap 0.04 > tolerance 0.03 → `under`).
  - Recommendation in the spec: ship the secondary gate. Matches the user's original "TSS primary, IF secondary" framing. Trade: ~tiny extra complexity in adherence.ts for catching the exact case that motivated this work.
  - User has not yet given go/no-go on the gate. Decision needed before build.
- **What "doing it" looks like:** ~150 lines + a deploy + backfill of planned cycling rides + LLM prompt regen. Spec in chat transcript is sufficient to start without re-litigation.
- **Cross-ref:** D-091 (classified_type follows plan_intent), D-092 (STRUCTURED PLANNED MODE prompt rule gated on interval_summary), D-113 (POWER row Option A — tonight's narrow fix), D-112 (actual TSS now Coggan-correct, prerequisite for this comparison).

---

## Q-037 — FTP gap to Garmin remains ~28W after D-112; hypothesis Strava power-stream smoothing

- **Status:** unverified hypothesis (surfaced 2026-06-05)
- **What it is:** Garmin auto-FTP reports 204W (climbed 192→204 over recent weeks); Efforts reports 176W post-D-112. The 28W gap is *not* a bug in D-112's math — post-fix the Coggan computation is honest, and the live trace shows `power_curve['20min']` max across the user's 90d window is 185W (→ 176W FTP via × 0.95). Garmin's 204W implies a best-20min around 215W on the data Garmin sees. The gap is a *data difference*, not a *computation difference*.
- **Hypothesis:** Strava ingest path may smooth or downsample power streams compared to the native Garmin .fit file. Strava's API serves a derived stream, not the raw device samples. If the smoothing reduces peak 20-min readings, Efforts' computed `power_curve['20min']` underestimates what Garmin Connect's native algorithm sees.
- **Alternative hypothesis:** Garmin's auto-FTP doesn't use 95%-of-best-20min — it may use CP modeling, ramp-test detection, or a non-Coggan estimator. The number isn't reverse-engineerable from outside, and Garmin's algorithm could legitimately disagree with Coggan on the same underlying data.
- **How to verify (when picked up):**
  1. Export the same ride (e.g. ride 6f7da2d9 — Efforts' top-20min ride at 185W) as native Garmin .fit from Garmin Connect.
  2. Compute best-20min directly from the .fit power stream using the same `rollingMaxAverage` math.
  3. Compare to Efforts' stored `computed.power_curve['20min']` for that ride. If they match → Garmin's FTP algorithm differs from Coggan and the gap is irreducible from the Efforts side. If Garmin's stream gives ≥200W for the same 20-min window → confirms Strava ingest path is the lossy surface.
- **What "fixing" would look like (after verification):** if Strava smoothing confirmed, candidate fix is to ingest the native Garmin .fit when available (Garmin Connect API path exists for some integrations) and bypass Strava for power-curve computation. If Garmin's algorithm just differs, document as Q-INTENTIONAL and surface a fourth resolver tier ("ingest Garmin's reported FTP as truth above learned") — your original instinct from the trace prompt.
- **Why deferred:** D-111's ratchet floor + D-112's math fix are the load-bearing pieces; the remaining 28W gap doesn't cliff the FTP, it just sits below Garmin's reading. Not blocking anything user-facing today; worth investigating when the swim/strength items don't take priority.
- **Cross-ref:** D-112 (NP / Coggan fix that closes the per-ride inflation), D-111 (FTP learner guards that protect the 176W value from cliff-dropping).

---

## Q-038 — Swim ingest: 701:00 duration unit bug FIXED (Layer 1); swim-native template + FORM ingest still open (Layers 2–3)

- **Status:** **Layer 1 (numbers) FIXED 2026-06-14** — root cause corrected (below). Layers 2–3 (swim-native template + FORM swim_data ingest) open, scoped.
- **ROOT CAUSE (corrected 2026-06-14 — the original "seconds-vs-minutes parse" / "wrong analyzer routing" guesses were both wrong):** the ingest is fine — the scalar `moving_time` is stored correctly (18 min). The bug is that **sample-derived swim values overrode the correct scalar-derived ones.** (1) `compute-workout-summary` set `computed.overall.duration_s_moving` from the unreliable pool-swim sample timespan (`rows[last].t − rows[0].t` = 42060s ≈ 39× the true 1080s), and **Priority-1 reuse of the stored value made it STICKY** (recompute re-read the bad 42060 before trying `moving_time`). 42060 ÷ 60 = **701:00**; 42060 ÷ planned-1859 = **2263%**. (2) `compute-facts:1276` let the sample-derived `analysis.swim.avg_pace_per_100m` (188) **override** the correct scalar pace (135). Same architectural shape as Q-054/D-112/D-115 (a bad sample-derived value beating an authoritative scalar). The "5:03/mi · 61 spm · mph chart" is a SEPARATE problem — swim is **under-built** (no swim-native template; falls through the shared endurance builder), not a routing bug. `analyze-swim-workout` IS selected.
- **Layer 1 fix (shipped):** swim duration clamped to the authoritative scalar at `compute-workout-summary`'s single `writeComputed` choke point (catches all branches, self-heals the sticky value); `compute-facts` swim pace made scalar-authoritative (analysis only as fallback); `build.ts` nulls the meaningless land pace (`avg_pace_s_per_mi`/`avg_gap_s_per_mi`) for swims. Verified on 3 real swims: `duration_s_moving` 42060→1080/1800/1440, `pace_per_100m` 188→135/131/129. (Minor residual: `moving_time` is stored as integer minutes, so duration reads ~18:00 not 18:12 — the seconds precision was lost at ingest; separate, cosmetic.)
- **Original status (preserved):** deferred / explicitly tabled by user (2026-06-05) for a separate session
- **What it is:** FORM goggles → Strava → Efforts swim activities are mangled on multiple axes:
  - **Duration adherence 2263% / +670:01.** Efforts thinks a planned 31-min swim took 701:00 (11 hours 41 minutes). Strava's reported moving_time for the same activity is 18:12. The 701:00 vs 18:12 numeric signature points at a seconds-vs-minutes-vs-aggregate-of-lengths parsing bug somewhere in swim ingest or session_detail render.
  - **Wrong analyzer selected.** Pool swim rendered with "5:03/mi pace", "61 spm cadence", "Splits (mi)" at "50:30/mi", speed chart in mph. A pool swim has no business with miles-per-hour. Activity-type mapping in the Strava webhook isn't selecting `analyze-swim-workout`; the activity is being routed through the run/ride generic path.
  - **Distance ingested at 875 yd** (Strava) vs **800m on FORM**. Plan was 1200 yd; -325 yd gap is real (user cut the set short), so the distance number is the only honest field on the screen.
- **Why deferred:** completely orthogonal to the FTP / NP / labeling work D-111/112/113 closed. User explicitly tabled to a separate session ("table swim for now") so the cycling-analyzer arc could close cleanly.
- **What "the prompt" would look like when picked up:** trace (a) activity-type mapping from the Strava webhook payload — why does FORM-via-Strava swim end up not routing to `analyze-swim-workout`? (b) the duration-parsing path that turns 18:12 into 701:00 — likely a seconds-as-minutes coercion or a per-length aggregation that double-counts. Report-only before any fix.
- **Cross-ref:** none yet — first filing of this surface.

---

## Q-039 — Set logger refactor: column alignment + manual entry + RIR 0–5+ scale — DONE 2026-06-11

> **DONE 2026-06-11** (steps 1–4: D-116 scale + D-117 narrow controls + D-119 labeled rows). **Note for consistency:** the step-4 *layout* (D-119 labeled full-width rows with rep circles + RIR pills) was **itself superseded the same day** by the compact keypad-primary logger ([Q-048](#q-048) / D-125) — the circles/pills are gone. The RIR-scale (0–5+), reactive manual entry, and keypad clamps from this ticket all carry forward. The e1RM-exclusion sub-thread moved to [Q-040](#q-040)/D-118.

- **Status:** DONE — all 4 steps shipped (detail below). **Steps 1+2 SHIPPED 2026-06-11 (D-116)** — combined per the pre-check (RIR-5 was inflating e1RM ×1.5, so the scale change couldn't ship without the engine fix): RIR scale → 0,1,2,3,4,5+ (5+ stored as integer 5); `estimate1Rm` excludes RIR ≥5 from e1RM. **Step 3 SHIPPED 2026-06-11 (D-117)** — rep-circle picker (windowed 5 on `set.reps`±2, clamp 1, re-centers on edit), 2×2 weight stepper (−5/+5 / −2.5/+2.5), reactive manual entry (pickers read `set.*`), reps keypad clamps ≥1. Pure UI, no e1RM dependency. **Step 4 SHIPPED 2026-06-11 (D-119)** — labeled full-width control rows (`Reps`/`Wt`/`RIR` 3-char leaders), ~32px (`w-8`) shortcut circles, 44px on the keypad cells (primary input); `target N` caption on Reps (newly plumbed `target_reps`), `suggested N` on RIR. Resolves the staggered/identical-rows problem; "alignment alone" couldn't differentiate a 5-wide picker in 308px, so a minimal row label is the fix. **Q-039 sequence COMPLETE (steps 1–4).** Remaining strength-logger item: the Q-040 UI-trend follow-up (RIR-5 progression points visible-but-dimmed), sequenced after. Original spec below unchanged.
- **Status (original):** specced, NOT implemented. Filed as the authoritative spec for the next implementer (handed off to Cursor). Supersedes the iterative layout work in D-114 (the column-cell → disclosed-picker → always-visible-pills → full-width → column-centered → edge-anchored sequence). The current shipped layout (commit `a5007c48`) is the edge-anchored interim: steppers left-anchored under the Weight cell, RIR pills' right edge anchored under the RIR cell's right edge (240px from content-left); RIR cell is keypad-editable (`ee5bd75d`).
- **Why this spec exists:** the repeated 380px-fit failures all stem from one root cause — the control groups (4-wide stepper ~189px, 5-pill RIR ~212px) are ~3× wider than their 64px header cells, so they can't sit *centered* under a single column. This spec resolves it by (a) making the controls narrower (2×2 stepper, windowed rep circles) so they actually fit a column, and (b) using a real 3-col grid where each column owns its pill + picker stacked vertically, with a documented small-device fallback.

### LAYOUT (refactor)
- **3-column grid, each column = pill + its picker, vertically aligned:**
  - **Col 1 — Reps:** Reps pill → rep circles, a window of 5 centered on the target (target±2, clamp low end at 1). The "target N" caption lives in this column, styled on/under the target circle — **not** floating left.
  - **Col 2 — Weight:** Weight pill → **2×2 stepper grid** (−5/+5 row, −2.5/+2.5 row). Barbell/plates selector as a micro-caption in this column.
  - **Col 3 — RIR:** RIR pill → RIR picker (see scale below). A pre-filled suggestion renders as a "suggested N" caption + **dimmed** pill value; the pill becomes **solid** once the user confirms or changes it.
- **Remove the unlabeled centered control rows** — the column alignment *is* the labeling (no more "which pill does this row belong to?").
- **Min tap target 44px.** If the 3-col grid is too tight on small devices (e.g. iPhone ~380px — note: a windowed 5-rep-circle column at 44px ≈ 220px, so three 44px-target columns will NOT fit 380px), **fall back to full-width rows, each left-anchored under its pill** (one picker per row). The fallback is the expected 380px rendering; the true 3-col grid is for wider viewports.

### MANUAL ENTRY
- Tapping any pill (Reps / Weight / RIR) opens the numeric keypad for inline edit. **Pickers update to reflect the typed value** — the rep window re-centers on the typed reps, the RIR selection moves to the typed value. (Today all three cells already open the keypad via `openKeypadForSet`; the new work is making the *pickers* reactive to the committed value.)
- **Validation:** reps = integer ≥ 1; weight ≥ 0 with **no snapping** — accept arbitrary values (dumbbells, kg, micro-loading); RIR clamps to 0–5.

### RIR SCALE
- **Options: 0, 1, 2, 3, 4, 5+** (today's picker is 1–5; this widens the low end to 0 and caps the top as "5+").
- **Storage:** store 5+ as integer `5` with a flag `rir_capped: true` (or just `5` — the engine treats ≥5 as "far from failure", no granularity needed above 5).
- **Engine semantics (scope beyond the logger UI — touches the strength analyzer / e1RM path, not just `StrengthLogger.tsx`):** RIR 0–4 = usable for e1RM + effective-rep calcs; RIR 5 = autoregulation signal only ("increase load next set"), not fed into e1RM granularity.

### Implementation notes for the picker-up
- The 240px RIR-cell-right and 104px Weight-cell-left anchors are device-independent only because the header cells are fixed-width (`w-6` + `w-16`×3, `gap-2`). If the grid refactor changes cell widths, re-derive those anchors.
- The 380px overflow harness `scripts/verify-strength-row-380.mjs` (local, untracked) is the fit oracle — extend it for the new picker widths before shipping.
- The RIR-cell tap-to-edit fix (D-115-era, commit `ee5bd75d`) and the edge-anchored control rows (`a5007c48`) are already on `main`; this refactor replaces the control-row layout but keeps the keypad-editable cells.

---

## Q-040 — Two divergent e1RM paths; the consumed one (compute-facts/Brzycki) was never RIR-capped + formula choice (filed 2026-06-11)

> **PARTIALLY RESOLVED — one piece still HELD.** ✅ Decision #1 done (D-118: live-path RIR preference-with-fallback, deployed + backfilled — the live model is **preference-with-fallback, NOT e1RM exclusion**; do not re-file an "exclude RIR≥5 from e1RM" fix, that earlier framing is superseded). ✅ Formula choice decided-in-principle: **Brzycki on `reps + RIR` is canonical** (the live `compute-facts` path); the dead Epley×rir path is to be retired (the retirement itself is tracked in [Q-041](#q-041)). 🔶 **STILL OPEN / HELD:** the **UI-trend RIR-5 treatment** — RIR≥5 progression points should render *visible-but-dimmed/low-confidence* in `useExerciseLog` → StrengthSummaryView/BlockSummaryTab, **not dropped**. Deliberately deferred (display concern, separate surface). Pick this up when returning to the strength trend UI.

- **Status:** **Decision #1 RESOLVED 2026-06-11 (D-118)** — the live path (`compute-facts/updateLearnedStrengthFromExerciseLog`) now applies RIR **preference-with-fallback** (aggregate `strength_1rms` from `avg_rir ≤4`/no-RIR sessions when any exist; only-RIR≥5 lifts fall back + flagged `confidence: "low"`). Deployed + backfilled (trap_bar_deadlift 160→150, barbell_row 130→120; others value-unchanged; 0 lifts dark; plan loads now derive from corrected numbers). **Still open:** (i) **UI-trend follow-up — SEPARATE from the Q-039 step-4 layout pass; do it AFTER step 4.** Different surface (`useExerciseLog` → StrengthSummaryView/BlockSummaryTab progression) and different concern (display, not aggregation), so it does NOT belong in the layout step. **Approach (decided framing):** RIR-5 trend points stay **VISIBLE but marked low-confidence** (dimmed / flagged), **not dropped** — a missing point reads as a *logging gap*, which is worse than an honest-but-noisy point. So this is a display-treatment change (annotate per-point by `avg_rir ≥5`), not a filter. (ii) the formula-choice cleanup below (keep Brzycki-on-reps+RIR as canonical, retire the dead Epley path) ties into Q-041. Original finding retained below.
- **Status (original):** open / needs a decision. Surfaced by the Q-039 step-2 render-path verification (which is exactly what that check was for). **The Q-039 step-2 exclusion landed on a dead path** — see below.
- **Two e1RM computations exist, with different formulas and different reach:**
  1. `compute-adaptation-metrics/estimate1Rm` — **Epley × (1 + rir/10)**. Writes `workout_adaptation`. **`from('workout_adaptation')` has 0 readers in the codebase** — dead output. This is the one D-116 changed to exclude RIR ≥5. Net effect on UI/plans: **none**.
  2. `compute-facts/brzycki1RM` — **Brzycki on `effectiveReps = reps + RIR`**. Writes `exercise_log.estimated_1rm` (→ `useExerciseLog` → StrengthSummaryView + BlockSummaryTab) **and** aggregates into `learned_fitness.strength_1rms` (→ coach / materialize-plan / recompute-athlete-memory → **plan load prescription**). This is the live, user-visible, plan-driving path. It is **NOT** RIR-capped — a RIR-5 set yields Brzycki(reps+5), a real number, not an exclusion.
- **Consequence:** Q-039 step 2 ("RIR 5 excluded from e1RM, renders as dash") is **not** achieved for anything a user or the engine actually sees. To honor it, the exclusion must move to `compute-facts/brzycki1RM`'s caller (`compute-facts/index.ts:~1313`, where `est1rm = brzycki1RM(bestWeight, bestReps, avgRir ?? 0)`), gated on `avgRir >= 5`. **Stakes:** that feeds `learned_fitness.strength_1rms`, which prescribes plan loads — excluding RIR-5 sets there changes load math, so it needs deliberate sign-off, not a silent flip.
- **Formula choice (the original ask — log, don't change):** the standard reps-to-failure approach is to run the 1RM formula on `reps + RIR`. `compute-facts` already does this (Brzycki on reps+RIR — good). The dead `compute-adaptation-metrics` does NOT (Epley × a linear rir factor — non-standard). **Sample, 100 lb × 4 reps @ RIR 2:**
  - Epley × (1 + rir/10) *(compute-adaptation-metrics, dead)*: `100 × (1+4/30) × 1.2 = 136 lb`
  - Brzycki on reps+RIR *(compute-facts, live)*: effReps 6 → `100 × 36/(37−6) = 116 → 115 lb` (rounds to 5)
  - Epley on reps+RIR *(the "standard" alternative)*: `100 × (1 + 6/30) = 120 lb`
  Three different numbers for the same set. The live path (115) is already the most defensible; the dead path (136) over-estimates. Decision owed: keep Brzycki-on-reps+RIR as canonical and delete/retire the dead Epley path, or unify deliberately.
- **Open decisions:** (a) apply the RIR ≥5 exclusion in `compute-facts` (the live path) — yes/no, given plan-load stakes; (b) keep, retire, or wire up the dead `compute-adaptation-metrics` e1RM (D-116's change is harmless but pointless as-is); (c) backfill target becomes `exercise_log` + `learned_fitness.strength_1rms` (re-run `compute-facts`) **only after (a)** — backfilling `workout_adaptation` is moot.
- **Cross-ref:** D-116 (the dead-path step-2 change), Q-039 (the refactor this surfaced under).

---

## Q-041 — `workout_adaptation` / `compute-adaptation-metrics`: retire or wire up? (filed 2026-06-11)

- **Status:** open, decision owed, **do not act yet** (per Decision #2 of the Q-039/Q-040 session — leave the deployed D-116 change as-is, just flag the table dead).
- **Finding:** `compute-adaptation-metrics` computes a full per-week adaptation packet (strength e1RM, `confidence`, `data_quality`, etc.) and writes `workout_adaptation`, but **`from('workout_adaptation')` has 0 readers** anywhere in `src` or `supabase/functions`. It's dead output. (See ENGINE-STATE "`workout_adaptation` is a DEAD table".)
- **Two options to decide between:**
  1. **Retire** `compute-adaptation-metrics` + the `workout_adaptation` write (and remove its invocation from the ingest fan-out / wherever it's called) — less dead code, one fewer place for strength e1RM logic to drift from the live `compute-facts` path.
  2. **Wire it up** — if the adaptation packet (confidence/data_quality/autoregulation signals) is genuinely wanted by the coach or Arc, connect a reader and make it the/an authority. But then its e1RM formula (Epley×rirFactor) must be reconciled with `compute-facts` (Brzycki on reps+RIR) — see Q-040 — so they don't diverge.
- **Why filed not fixed:** retiring touches the ingest orchestrator (`ingest-activity` fan-out) and possibly other invokers; wiring up is a product call. Neither is in Q-039 scope.
- **Cross-ref:** Q-040 (the two divergent e1RM paths), D-116 (the inert step-2 change), ENGINE-STATE dead-table note.

---

## Q-042 — Keypad-cell tap affordance: pencil glyph (filed + shipped 2026-06-11)

- **Status:** shipped 2026-06-11 (same session it was filed).
- **What/why:** the three keypad cells (Reps / Weight / RIR) are the 44px primary input (the circles/pills/steppers are shortcuts), but nothing signaled they're tappable-to-type → discoverability gap.
- **Decision — affordance over instruction:** a subtle `Pencil` glyph (lucide-react — the codebase's icon set; `ti-pencil`/Tabler isn't a dep, don't add one) in the top-right corner of each of the three cells. **No text note** — a persistent "tap to enter manually" sentence is permanent clutter to teach a one-time thing. Considered a first-run hint and rejected: a glyph carries the meaning continuously and is consistent with Q-039's design-not-text approach.
- **Implementation:** `h-2.5 w-2.5` (10px) `text-white/25` `pointer-events-none absolute top-0.5 right-0.5` inside each cell button (button made `relative`). Covers Reps, RIR, and all three Weight type-branches (dumbbell/goblet/barbell); the band-resistance cell is a Select (already reads tappable) so no glyph there. Subtle by design; if it ever crowds at 380px, shrink or nudge into the corner rather than drop.
- **Cross-ref:** Q-039 (the logger refactor this completes the discoverability of).

---

## Q-043 — Control-row horizontal balance: spread full-width (filed + shipped 2026-06-11)

- **Status:** shipped 2026-06-11 (control rows). One related observation flagged below (top row), not acted on.
- **What/why:** the three control rows (Reps/RIR circle pickers, Wt stepper) were left-packed after their row label, leaving dead space on the right → looked lopsided vs the top input cells.
- **Fix (revised):** first tried `justify-between` (edge-to-edge) — rejected, looked scattered/flung-apart. **Final:** each control row's inner group is `flex-1` with the group **centered** (`items-center` / `justify-center`) and **moderate `gap-1`** spacing — a tidy centered cluster, not stretched and not bunched left. Reps/RIR circles cluster centered; the 2×2 Wt stepper (+ "↑ Same") centers. Row labels (Reps/Wt/RIR) stay left-anchored. `src/components/StrengthLogger.tsx`. Verified 380px harness — no overflow. (Chose centered over left-edge-aligned: left-edge is the "bunched" look that prompted this ticket; centered reads balanced against the top.)
- **Top row — DONE (option A, 2026-06-11):** showed A (full-width) vs B (centered cluster) as rendered 380px mockups; picked **A**. The three top cells are now `flex-1` with `w-full` buttons → ~87px boxes spanning edge-to-edge (32→308, 0 dead space). Refinement: the set# moved from a `w-6` text-right nub to a proper **`w-9` left-aligned slot**, so "1" aligns as the left leader column directly above the Reps/Wt/RIR row labels rather than floating. Harness PASS at 380px (cells reach the content edge exactly, no crossing). **Q-043 complete.**
- **Full-width distribution — final (2026-06-11):** superseded the centered-cluster approach above. Goal: *every* row (top boxes / Reps / Wt / RIR) uses the full content width consistently. (a) **Wt** steppers: 2×2 grid → ONE horizontal row, order `−5 / −2.5 / +2.5 / +5` (small in middle, big on ends), spread via `justify-between` with "↑ Same" capping the right. (b) **Reps + RIR** circles: bumped `w-8 → w-9` (36px) and spread via `justify-between` (inner column's `items-center` removed so the row stretches full-width) — bigger circles make the spread read as *filling* the row, not scattered (the earlier `justify-between`-at-`w-8` looked flung). (c) Sized to the tightest row — **RIR = 6 pills**: 6×36=216 in the ~264px flex-1 area → fits with ~10px gaps; `w-10` was rejected (RIR would touch/overflow). Harness PASS at 380px, `overflowPx -10` (every row fills to the content edge, none cross). `src/components/StrengthLogger.tsx`.
- **Wt stepper fixed positions across sets (2026-06-11):** "↑ Same" (set 2+) was inline beside the `flex-1` stepper group, so it ate width and reflowed the 4 steppers — they no longer aligned with set 1's. Fix: the Wt inner is now a `flex-col`; the 4 steppers are a full-width `justify-between` row (fixed `44→308` on every set), and "↑ Same" sits on its own trailing line below (right-aligned), set 2+ only. Sets read identical except for the button. Harness-verified: stepperLeft/Right identical across set 1 / 2 / 3.
- **Top-box gap (2026-06-11):** the 3 top boxes read tighter than the circle rows below (gap-2 vs the rows' wider distributed gaps). Wrapped the 3 cells in a `flex-1` group with `gap-4` so they breathe at the same rate; set#→group stays `gap-2` so box1 still aligns with circle1. Harness PASS.
- **Rest timer on set 1 — re-confirmed correct-by-design (no change), D-115:** `showRestTimer = !isDurationBased && setIndex > 0`; set 1 has no preceding rest, and `startAutoRestForNextSet` writes the `+1` key so completing set 1 starts set 2's timer. Not broken; not adding a set-1 timer.
- **Cross-ref:** Q-039 (the layout), Q-042 (the cells' tap affordance).

---

## Q-044 — Rest timer model: auto-start experiment → reverted to opt-in (filed 2026-06-11, D-120 then D-121)

- **Status:** settled 2026-06-11. The auto-start version (D-120) was reverted the same day to an **opt-in** model (D-121). Current behavior is D-121.
- **Current behavior (D-121):** the rest row appears on **every set except the last**, shows its duration **idle** (does NOT auto-count), and the user taps **Start** to launch it (Pause/Resume to control, Skip to dismiss + hide the row). No `set.completed` gate, no auto-trigger.
- **Intentional, NOT a regression — do not "fix" either of these:**
  - The timer **sits idle and does not count on its own.** That's deliberate (D-121) — the rest timer is a courtesy the user owns. Don't re-add auto-start on Done (that was D-120, reverted).
  - The **last set has no rest row** (nothing follows it). Expected.
- **History:** D-120 (briefly) made the timer auto-start on Done and live on the just-finished set, gated on `set.completed`. Reverted because auto-firing a courtesy timer is the wrong default.
- **Verification:** 380px harness — Rest+Start+Skip on every non-last set (`overflowPx -10`), last sets render none, steppers aligned 44→308.
- **Cross-ref:** D-115 → D-120 (auto-start, reverted) → D-121 (opt-in, current); Q-043 (prior rest-timer notes).

---

## Q-045 — "Last session" per-set anchor in the logger (filed + shipped 2026-06-11, D-122)

- **Status:** shipped 2026-06-11 (D-122). Investigation-first, then built same session.
- **What/why:** the biggest intuitiveness gap vs Strong/Hevy — every lifter wants "what did I do last time for this set?" as the anchor to match/beat. The D-097 prefill already fetched the per-set prior data and threw it away after prefilling; this surfaces it as a persistent muted line (`last: 100 × 5 @ RIR 3`) under each set's top cells.
- **Intentional behaviors, do NOT "fix":**
  - **Overflow set index shows no anchor (blank), not a clamped value.** If today has 4 sets and last time had 3, set 4 shows no "last:" line. This is deliberate — a truth-anchor must not lie; it diverges on purpose from the prefill's `?? priorSets[last]` clamp (prefill convenience is fine to clamp; the anchor is not).
  - **A history-less exercise shows no line at all**, not "last: —" on every set. Absence is intended; the placeholder repetition was rejected as clutter.
  - **Prefill (D-097) and the anchor (D-122) both exist** — not a duplicate. Prefill clears on edit (`from_previous`); the anchor is stable and never clears.
- **Data:** reuses the single D-097 fetch (`workouts.strength_exercises` JSONB) — no new query/table/server work. `exercise_log` is aggregate-per-session and was the wrong source (can't give per-set-index).
- **Verification:** 380px harness — anchor line adds height, width still `overflowPx -10`, open-picker footer math holds, steppers aligned 44→308.
- **Cross-ref:** D-122 (the decision), D-097 (the prefill/fetch it reuses), D-095 (the post-workout PREVIOUS column in StrengthCompareTable — same data, different surface).

---

## Q-046 — Reps vs RIR circle rows look like twins (filed + shipped 2026-06-11, D-123)

- **Status:** shipped 2026-06-11 (D-123).
- **What/why:** the Reps and RIR rows were both `rounded-md` number circles with an identical white selected state — only the left label distinguished them, the one spot prone to mis-tap for a new user.
- **Fix:** RIR row → full circles (`rounded-full`) + amber selected state; Reps row unchanged (rounded-squares + white). Shape + color difference, no extra text, no geometry change (same `h-9 w-9`). Leans into the "RIR = amber" cue already partly present (target pill/caption).
- **Verification:** 380px harness `overflowPx -10` (footprint-neutral); rendered mockup confirms instant distinction.
- **Cross-ref:** D-123; Q-043/D-119 (the row geometry left untouched).

---

## Q-047 — Why is the deload-week suggestion lighter than "last:"? (investigated 2026-06-11; correct-by-design + D-124 tag)

- **Status:** resolved 2026-06-11. The lighter suggestion is **correct-by-design** (deload week). No logic change. Communication gap fixed by D-124 (a "Deload" header tag).
- **The observation:** bench prescribed 100 × 4 @ RIR 4 (target 4-6) but the "last:" anchor showed 105 × 6 @ RIR 2 — lighter and easier than last actual.
- **Where the numbers come from (the investigation answer):**
  - **Prefill weight / suggested reps** (the dimmed starting values, when logging a *planned* session): the **plan prescription** — `prefillFromPlanned` → `parseFromComputed(row.computed)` reads the planned workout's `computed.steps`. NOT last-actual.
  - **`target_reps` / `target_rir` captions** ("target 4-6" / "suggested 4"): the **plan prescription** (parsed from the planned exercise, ~:1203/:1216).
  - **D-097 last-actual autofill:** fills only sets the plan prefill left *untouched* (fallback), from the last actual session.
  - **"last:" anchor (D-122):** the **last actual session** (`workouts.strength_exercises`).
  - So plan-prescribed 100 < last-actual 105 = the deload prescription, not a stale/non-progressing number. **User confirmed the current block is a deload week.**
- **Not a progression bug.** Whether the deload's exact load math is "right" was out of scope (the user confirmed it's a deload and asked for no logic change); this entry only records the prescription-source architecture and the correct-by-design verdict.
- **Residual gap → fixed:** the logger never displayed the deload context, so a correct lighter prescription read as confusing. D-124 surfaces a "Deload" tag.
- **Cross-ref:** D-124 (the tag), D-122 ("last:" anchor), D-097 (last-actual prefill), the `computed.steps` plan-prescription path.

---

## Q-048 — Compact "keypad-primary" set logger — DONE 2026-06-11 (D-125/126/127/128 + header fixes)

> **DONE 2026-06-11.** Layout (D-125) + prefill-from-plan (D-126) + unplanned last-actual fallback (D-127) + amber RIR strip (D-128) all shipped, plus the header spacing → two-row → wrapping-title fixes (D-124 addendum). This is now the live logger. See the ENGINE-STATE "Compact keypad-primary strength logger" Solid entry for the consolidated state + the two load-bearing invariants.

- **Status:** shipped 2026-06-11 — **D-125** (layout), **D-126** (prefill from plan), **D-127** (unplanned last-actual fallback), **D-128** (amber RIR ±1). Investigated via an A/B render mockup first (336px circles vs 180px compact = 46% shorter); user chose compact.
- **What/why:** the expanded card had three full control rows (reps circles + RIR pills + weight stepper). Replaced with pre-filled keypad cells (tap = keypad, the primary input) + ONE thin quick-adjust strip (`reps ±1 / wt −5/−2.5/+2.5/+5 / rir ±1`). Common case = confirm a pre-filled value, zero number-taps; reclaims ~156px of height.
- **Intentional, do NOT "fix":**
  - **No inline labels on the strip** — cell order above (Reps|Weight|RIR) signals the groups; this was a deliberate call (more text was explicitly rejected).
  - **"↑ Same" (copy set 1) was removed** — not in the approved mockup; prescription-prefill (D-126) fills every set from the plan, so per-set carry-forward is largely moot. Flagged to the user; re-add on request.
  - **Fields pre-fill from the PLAN prescription when a plan exists** (D-126); **unplanned sessions fall back to last-actual** (D-127, never empty when we have history). Planned ≠ overlaid with last-actual (deload stays correct).
  - **RIR ±1 strip buttons are amber** (D-128) to tell them apart from the identical-looking reps ±1 pair; reps/weight neutral. (Supersedes the earlier "no inline labels, leave them identical" note — color, not labels, since color costs no width.)
- **Verification:** 380px harness `overflowPx -10`, inter-group gap 18px (real margin, not the mockup's edge-to-edge 0); color tint is geometry-neutral.
- **Cross-ref:** D-125 (layout), D-126 (prefill from plan), D-127 (unplanned last-actual fallback), D-128 (RIR amber), D-097 (superseded prefill source), D-122 (`last:` anchor kept), D-123 (RIR=amber precedent).

---

## Q-049 — Athlete State Continuity: check-in → Arc → every screen (SPEC filed 2026-06-12, Priority 1)

- **Status (2026-07-02) — PARTIALLY BUILT: the highest-value signal is now wired.** Michael's call: *"why have them"* — the check-in was collecting soreness/sleep and discarding them, when **the evidence says subjective soreness/readiness OUTPERFORM objective markers for overreaching detection (BJSM systematic review)** — i.e. the app was collecting its best data and throwing it away. So the dropped sliders are now read as an **advisory longitudinal signal** (Q-049 Phase 1a):
  - **`_shared/longitudinal-signals.ts` `detectReadinessSignals`** — reads `readiness_checkins` and emits: **soreness → possible overreaching** and **chronic short sleep** (fatigue-picture context). Rides the existing surfacing pipeline → **coach** (`coach/index.ts:3392`) + **Arc** (`arc-context.ts:885` → `ArcContext.longitudinal_signals`) → STATE screen. Deployed coach + get-arc-context.
  - **Two-stage cold-start design (deliberate):** **v1 (now)** = ABSOLUTE floor (soreness **≥4/7** on ≥4 of last 6 check-ins — Hooper 1–7 per D-234/D-235; was ≥6/10, rescaled + code-fixed 2026-07-03 after the first migration pass missed this consumer) — works from day one, resists a single noisy day. **v2 (when ≥3–4 weeks of check-ins exist)** = rising-trend-vs-own-baseline (median ± individual SD, the consensus gold standard / AthleteMonitoring / runner-overreaching study), mirroring the pace/HR-drift signals. v1 is structured so **v2 is a predicate swap, not a rewrite** (fetch + emit stay identical).
  - **ADVISORY ONLY — never touches the State/Performance score** (a reported rough week must not mark the athlete down; it informs). This holds Michael's principle: subjective self-report is context, not a penalty.
  - **All three sliders now feed the spine:** energy (→ `taper_sensitivity`, pre-existing) + soreness (→ overreaching signal) + sleep (→ short-sleep note). `avg_readiness` already rolled up all three (`compute-snapshot:562`); the gap was purely downstream reads — now closed for soreness/sleep.
- **STILL OPEN (Phase 1b / Phase 2):** the Arc `readiness` *object* (`ArcContext.readiness`, D-144) is still display-only (no logic keys off it); **autoregulation** (a bad check-in *lowers today's* prescribed load/RIR, soreness→sore-region, sleep→intensity-gate, or a concrete deload suggestion) is the deliberate next question — **advise first, automate later** (Michael, 2026-07-02). Running analysis still ignores the check-in.
- Full spec: **`docs/SPEC-ATHLETE-STATE-CONTINUITY.md`**.
- **Audit verdict (CORRECTED 2026-06-12 — first pass understated it):** write-wired (`workout_metadata.readiness`) → `workout_facts.readiness` → **`compute-snapshot` aggregates to `athlete_snapshot.avg_readiness` (a WEEKLY time-series, keyed user_id+week_start)** → consumed narrowly by `recompute-athlete-memory` (`taperSensitivity` energy-rebound + injury flags) and by the strength narrative. **A weekly time-series DOES exist** (the original "no time-series / fully orphaned" was wrong). The real gap: **`arc-context.ts` does NOT read `avg_readiness`** (the Arc dead-end), and nothing moves prescribed RIR/load. Read-only options doc (flow map + per-question tradeoffs, no decisions): **`docs/SPEC-ATHLETE-STATE-CONTINUITY-OPTIONS.md`**.
- **Done = ** (Phase 1) check-in → Arc as a structured readiness signal; Arc the single source every surface reads; a queryable readiness time-series (trends, not snapshots). (Phase 2, separate) autoregulation — let it *influence* RIR/load with a real model + guardrails.
- **⚠ Naming trap:** NOT the server-computed `ReadinessSnapshotV1` (`session-detail/readiness-*`) — that's the muscular-load model, a different signal.
- **Cross-ref:** D-126 (target_rir from plan), arc-context.ts, the open "adaptive plan adjustment" item.

---

## Q-050 — Pick Planned with Teeth: reconcile intent vs. what was done (SPEC filed 2026-06-12, Priority 2, not built)

- **Status:** open spec, **not built**, parked. Full spec: **`docs/SPEC-PICK-PLANNED-RECONCILIATION.md`**.
- **Audit verdict:** the core mechanic is **correctly wired** (pick loads exercises + claims the right slot via explicit `planned_id`, no duplicates). Three edges, all from one root cause — *the plan is date-fixed and nothing reconciles intent vs. done*:
  1. **Coverage gap / silent swap** — pick Thursday, do Tuesday → Thursday consumed, Tuesday's own slot left open & easy to skip, no warning.
  2. **Slot-date ≠ performed-date** — Thursday marked done but linked to a Tuesday-dated workout (attribution/display, engine reads correctly by date).
  3. **Start Fresh re-attaches by date** (the sneaky one) — UI unlinks (`planned_id=null`) but `auto-attach-planned`'s date-matching branch can silently re-claim that day's slot, contradicting the "blank, unlinked" label.
- **Fix order (by likelihood of biting):** (1) Start-Fresh date re-attach — it's a correctness/trust bug, make the unlink authoritative or warn; (2) out-of-order confirm ("Tuesday stays open" + gap-handling); (3) slot-vs-performed attribution (cosmetic, later). **Ambitious end:** plan understands sequence over fixed dates (bigger rework, noted as direction).
- **Cross-ref:** auto-attach-planned (`:120` explicit vs `:120–289` date-match), Start Fresh (`StrengthLogger.tsx:~3066`), get-week (sole calendar path).

---

## Q-051 — Swim learned-aggregate pipeline gap: `learn-fitness-profile` not populating `swim_pace_per_100m`

- **Status:** filed 2026-06-14 (truth-reconciliation audit) · not fixed · **Q-038 Layer 1 now RESOLVED — this is an independent aggregation gap (updated 2026-06-24)**
- **What it is:** `learned_fitness.swim_pace_per_100m` is **empty** for the test user despite 5+ swims with a computed `pace_per_100m` in `workout_facts` (188–209 s/100m). The per-workout swim pace is computed fine; it just never rolls up into the `learned_fitness` aggregate the plan reads (`planning-context.swimSecPer100YdFromArcSwimInputs` needs ≥3 learned samples). So the plan falls back to the typed baseline (2:30/100yd) while the athlete actually swims ~2:52–3:11/100yd → swim prescriptions too fast.
- **Why it matters:** blocks swim truth-reconciliation (the spine can't compare computed-vs-baseline like-for-like when the computed aggregate is never built) and mis-seeds the swim plan.
- **Likely cause (updated 2026-06-24 — Q-038 Layer 1 is FIXED):** the duration/unit corruption that originally clouded this is resolved (Q-038 Layer 1, 2026-06-14 — swim pace is now scalar-authoritative, `pace_per_100m` 188→135), so the input-corruption hypothesis is largely closed. The remaining likely cause is that **`learn-fitness-profile` simply doesn't aggregate swim pace at all** — trace its swim path directly. Q-038's still-open half (Layers 2–3: swim-native template + FORM `swim_data` ingest) is unrelated to this aggregation gap.
- **Cross-ref:** Q-038 (swim ingest), `docs/AUDIT-truth-reconciliation-2026-06-14.md`.

---

## Q-052 — User-agnostic: make spine thresholds scale per-athlete, not constants tuned to one athlete

- **Status:** filed 2026-06-14 · decision/build owed · gates the bike-fitness + spine builds
- **What it is:** several thresholds were sanity-checked against ONE athlete's data and must scale per-athlete (the spine's logic is universal; magic numbers that only fit one athlete are not):
  - **`CHRONIC_LOAD_FLOOR = 500`** (D-146) → scale to the athlete's **own chronic base** (a low-volume athlete's normal base can be <500 → false "thin base / spike-on-empty").
  - **HR reference band `[130,150]W`** (bike-fitness HR-at-power) → **per-rider** (% of FTP or the athlete's Z2 power); **no hardcoded watts**.
  - **Freshness windows (strength 14 / bike 21 / run 14 / swim 10d) + min-session gates (4/3/4/3)** → scale to each athlete's **per-discipline session frequency** (low-volume athletes would read perpetual stale/needs_data).
- **Explicitly NOT to change (correctly scale-free):** trend **% thresholds** (±2.5/±2/±1.5) and **plausibility bands** (swim 40–240 s/100m, run GAP 150–750 s/km) — universal.
- **Cross-ref:** D-146, D-148, `SPEC-bike-fitness-read`, `docs/AUDIT-truth-reconciliation-2026-06-14.md`.

---

## Q-053 — Decision: ingest Garmin native FTP? (plan pinned ~28W under)

- **Status:** filed 2026-06-14 · **decision owed (Michael)** · xref Q-037
- **What it is:** Efforts is internally consistent at **FTP 176W** (typed = learned-high = resolved = active-plan-pinned = displayed). Garmin's native auto-FTP is **~204W**; it has never been ingested (the ~28W gap is Q-037 — Strava power-stream smoothing vs native .fit). So the **active IRONMAN 70.3 plan is pinned ~28W under Garmin's number**, prescribing bike intensity off the lower Efforts estimate.
- **The decision:** ingest Garmin native FTP (trust the external number), keep Efforts' computed 176 (trust own data), or surface both and let the athlete pick? Not a spine reconciliation (no internal contradiction) — a data-source trust decision.
- **Cross-ref:** Q-037, `docs/AUDIT-truth-reconciliation-2026-06-14.md`.

---

## Q-054 — Run-side GAP/pace corruption at source (the run cousin of Q-038)

- **Status:** filed 2026-06-14 (route-backbone audit) · symptom guarded, source not fixed
- **What it is:** the route-backbone audit found **4 of 118** run rows in `route_progress_metrics` with corrupt pace — `effort_adjusted_pace_sec_per_km` AND the underlying `avg_pace_sec_per_km` are garbage: 2026-05-11 (GAP 2280 / avg 2449), 2026-04-15 (2335 / 2508), 2026-04-05 (**23610** / 24808), 2026-03-26 (GAP 0 / avg 463). ~3.4% of runs. So the 2280 from the STATE-trend audit was NOT one-off — it's a small systemic pattern of bad SOURCE pace being written for certain runs (a run-side cousin of Q-038's unit/parse class).
- **Guarded, not fixed:** the STATE run adapter + the per-session engine apply a plausibility guard (150–750 s/km) that filters all 4 — so trends/efficiency are protected. But **bad pace is still written upstream** (compute-facts / run ingest), so any consumer that doesn't guard sees garbage, and the source data is wrong.
- **Fix scope (separate):** trace the run pace path (compute-facts run pace + route_progress_metrics write) for those 4 workout_ids — likely a unit/parse edge (very short run, GPS dropout, or a duration/distance unit mismatch like the swim Q-051 bug). Fix the source so plausible pace is written; the guard becomes a backstop, not the load-bearing filter.
- **Cross-ref:** Q-038 (swim ingest), Q-051 (swim pace pipeline), `route_progress_metrics`, the route-backbone audit.

---

## Q-055 — Read-3 per-session comparison must control for weather/grade/route (confound) — unbuilt, data-availability unconfirmed

- **Status:** filed 2026-06-14 · Read-3 still unbuilt · **the EXISTING unconditioned line is now guarded (2026-07-11, `dd575492`)**
- **PARTIAL — the specific existing lie is fixed; the Read-3 feature remains.** The "+11 vs typical +6" HR-drift line this Q flagged is now confound-guarded in `session-detail/build.ts`: heat/terrain inflate drift but can't lower it, so only the "higher than your typical" branch was confoundable — on a hot (>75°F / heat_stress) or hilly (terrain-driven) run it now names the confound ("above your typical +6, but the heat drove it — not a fitness change") instead of asserting a fitness decline. Weather read from `factPacket.facts.weather` (so the "is weather even stored?" blocking-unknown is answered YES for the temp/heat path). 4 fixtures (`drift-confound-guard.test.ts`). **Still open:** the full Read-3 comparable-session engine (same-route match set, min-N, match-tightness) — this fix only stops the existing single-line comparison from lying, it doesn't build Read-3.
- **What it is:** the per-session engine's Read 3 (comparable-session +/-) is not built. When it is, the comparison MUST control for weather + grade + route — the session-detail HR-drift read ("+11 vs typical +6") is unconditioned (the +11 was a 78°F run; heat drives drift independent of fitness), and an unconditioned drift comparison asserts a fitness signal the data can't support (same class as the np_trend lie). Read 3 must use same-route history as the comparison set for common routes and fall back to "not enough similar sessions" over a confounded comparison.
- **Motivating live instance:** the spine's run "sliding +8.1%" rests on sparse, possibly-confounded easy-run GAP data (>50% sessions missed) — currently surfaced honestly as a *provisional / signal-to-confirm*, but Read-3 is what would resolve whether it's a real decline or a confound artifact.
- **Blocking unknown:** is per-session weather (temp/humidity) + route identity even stored? If not, Read-3's weather control degrades to honest-blank (never an unconditioned verdict). Sign-off items (match-tightness bands + min-N) are in `SPEC-per-session-performance-engine.md`.
- **Cross-ref:** Q-054, `SPEC-per-session-performance-engine.md`, D-150 (Step 3 bike-fitness foundation), D-151 (provisional flag).

## Q-056 — Coach per-discipline naming is a prompt REQUIREMENT, not a structural guarantee

- **Status:** filed 2026-06-14 · cosmetic / verify-over-time
- **What it is:** the coach narrative names each discipline's spine state via a required-naming FACT instruction (D-151), added after soft guidance got editorialized away under the dominant >50%-missed-adherence signal (narrative named bike-up, dropped run). This is an LLM constraint, not deterministic.
- **Verify over time:** does it hold as data/adherence shifts — when all four have real verdicts, or when one discipline dominates? If the LLM drops a discipline again, escalate the FACT from a prompt instruction to a **deterministic prefix line** in the narrative (computed, not asked).
- **Cross-ref:** D-151, `coach/index.ts` spine FACT block, `COACH_PAYLOAD_VERSION`.

---

## Q-057 — 8 `route_progress_metrics` rows with NULL `workout_id` (write-path hygiene)

- **Status:** filed 2026-06-14 (surfaced during the Q-054 trace) · unverified
- **What it is:** the full OOB scan found **8 rows in `route_progress_metrics` with `workout_id = NULL`** for the dev athlete. `compute-facts` writes `workout_id: w.id` (the run path Q-054 fixed), so a DIFFERENT write path is producing them — or they're legacy. They also defeat the `onConflict(route_cluster_id, workout_id)` dedup (NULL ≠ NULL in Postgres unique constraints), which is how the 2026-04-05 corrupt orphan survived alongside 3 clean NULL-wid duplicate rows.
- **Why it matters (small):** orphan/duplicate rows that no upsert overwrites → stale residue accumulates; not currently misleading any spine consumer (the read-guard + Q-054 clamp backstop it), but it's a data-hygiene leak.
- **Fix scope (separate):** find the write path that omits `workout_id` (grep the `route_progress_metrics` writers — `compute-facts` is one; check for others / legacy backfills); either populate it or stop the path. Then a one-time cleanup of the existing 8 NULL-wid rows.
- **Cross-ref:** Q-054 (the trace that found it), D-152.

## Q-058 — T1 soft limiter-projection tail (prompt-only can't fully suppress open-ended projection)

- **Status:** filed 2026-06-14 (T1 close, D-152) · known soft edge, documented-not-fixed
- **What it is:** after the T1 anti-speculation fix (D-152), **11/12** cycling narratives are reliably clean, but **1 ride (2026-05-19)** retains an intermittent **soft projective tail** on ~1-in-2 force-regens — the severe projection ("will unlock the most return" / "move the needle") is killed and the limiter is grounded as a fact, but the LLM occasionally appends a rephrased soft projection ("the work ahead will be where the return concentrates"). It rephrases each roll, so a narrow regex backstop is whack-a-mole.
- **Why left as-is:** the fix was deliberately **prompt-only** (no retry-loop hard guard — SESSION-CONTEXT §7 3-guard-stack footgun + the "prompt rules generalize, regex chases phrasings" reasoning). Open-ended projection cannot be deterministically suppressed by prompt alone; the residual is the irreducible edge of that constraint.
- **Revisit ONLY if:** a hard grounding guard is ever added to the cycling narrative retry (a structural backstop that checks trailing-clause grounding, not a phrase regex). Until then, accept the soft tail — it's grounded-adjacent coaching, not a severe ungrounded claim.
- **Cross-ref:** D-152 (T1), `validateClaimsGrounded`, the cycling anti-speculation prompt rule, SESSION-CONTEXT §7.

---

## Q-059 — Swim display unit (/100yd vs /100m): derive from real pool length once HealthKit lands

- **Status:** filed 2026-06-15 (during D-159/D-160 swim render work) · intentional-for-now
- **What it is:** swim pace + distance currently display in **yd** when `planned_totals.swim_unit === 'yd'` (default) OR `useImperial` is set, else **m** (`PoolSwimOverall`, `CompletedTab` swim grid). For the dev athlete (yd pool) this reads correctly (`2:00/100yd`), but the unit is inferred from the plan/locale, **not from the actual pool**. Strava swims store `pool_length = NULL`, so there's no truth to derive from yet.
- **Why left for now:** the correct source is the **real pool length**, which only arrives with **HealthKit Tier A** (D-157 native plugin reads `HKMetadataKeyLapLength`; the merge fills `pool_length`). Once that's reliably populated, auto-detect the unit from the pool (25.0m → m; ~22.86m / the 20–26m band → 25yd → yd) and stop relying on `swim_unit`/`useImperial`. Building a unit toggle before the pool-length signal exists would be guessing.
- **Revisit when:** HealthKit pool_length is populated on real swims (D-157 verified connected; confirm the value lands), then make swim unit pool-derived with the locale default as fallback.
- **Cross-ref:** D-159, D-160, D-157 (HealthKit `pool_length`), the audit's `pool_length = NULL` finding, `resolve-pool-length.ts`.

---

## Q-060 — HealthKit native swim enrichment deferred (capability/build friction not worth it for pool_length alone)

- **Status:** filed 2026-06-15 (paused in favour of D-162) · deferred-with-reason
- **What it is:** D-157 built the HealthKit path to get real `pool_length` (+ strokes/seconds) automatically. In practice the friction is high: a HealthKit **+Capability** must be added in Xcode, a **full native build** is required (a JS `cap sync` isn't enough), FORM→Apple Health must be enabled, and the **60s start-window merge** must match the Strava row. Surfaced live: a delete+reimport produced a **Strava-only** row (`source=strava`, `pool_length=null`, no `healthkit_id`) — the Apple side never ingested, so the merge had nothing to merge.
- **Why deferred:** for **pool_length alone**, the athlete-ask (D-162: one-tap "What pool?") gives the same `pool_length` + derived length count with **zero** native/build/merge friction. The native path's marginal value over the ask is small.
- **Revisit when:** the richer fields that *only* HealthKit/FORM provide become the goal — **SWOLF, per-length splits, stroke type** (FORM "Swim Breakdown", audit Tier B). At that point the native enrichment + dedup/merge is worth finishing. Until then, D-162 covers pool length.
- **Cross-ref:** D-157 (the built-but-paused path), D-162 (the replacement), D-161 (length derive), AUDIT-swim Tier A/B.

## Q-061 — Equipment/drill pace-contamination exclusion from the swim trend — BOTH directions — RESOLVED (D-193, 2026-06-17)

- **Status:** filed 2026-06-15 · **scope WIDENED 2026-06-16** (fins-only → any non-unaided-swimming set, both directions) · **RESOLVED 2026-06-17 (D-193)** — both halves now built
- **RESOLVED 2026-06-17 (D-193):** the trend-substrate half is built and deployed. `compute-facts.buildSwimFacts` flags equipment/drill swims via the shared `detectSwimEquipment` helper (`swim_facts.pace_equipment_contaminated` + `pace_equipment_direction`, both directions, snorkel neutral); `compute-snapshot` excludes contaminated rows from the swim `swimRows` substrate before `assembleStateTrends`. `pace_per_100m` itself is unchanged (display/narrative still honest per D-190/D-192). **Decision:** exclude, not down-weight (no `classifyTrend` weighting hook). **Verified on real data** (user 45d122e7): the one in-window fin swim (Jun-15) flipped to `contaminated:true` and dropped; 9 unaided swims feed the trend. **Note:** excluding an athlete's only *recent* swim can decay the trend to `needs_data` via the staleness gate — the intended honest read ("no current unaided signal"). Narrative half was already complete (D-190/D-192) → Q-061 fully closed. **Deferred follow-up:** the shared helper duplicates analyze-swim's inline `equipmentDir`; consolidate when the narrative path can be re-verified.
- **Client-parity fix 2026-06-17 (D-194):** the D-193 exclusion originally landed only in `compute-snapshot`, NOT the client `useStateTrends` mirror — so the live STATE card could include contaminated swims while the cached `state_trends_v1` excluded them (a single-source drift between the two `assembleStateTrends` callers). Found and fixed while building D-194: `useStateTrends` now applies the same `pace_equipment_contaminated !== true` filter. Real bug fix independent of D-194's feature.
- **⚠ Widened 2026-06-16 (to match `SPEC-honest-swim-inference.md` Tier 4 / Tier 2):** this is NOT fins-only. **Any set that isn't unaided full-stroke swimming contaminates the pace trend, in EITHER direction:** fins / pull buoy / paddles speed pace **UP** (reads optimistically fast); kickboard/kick sets and most drills (catch-up, single-arm) slow pace **DOWN** (reads pessimistically slow, and a kick set isn't a swim-pace-comparable number at all); snorkel ≈ neutral. A "faster" trend can be just "more fin/buoy/paddle days"; a "slower" trend can be just "more kick/drill days." The exclusion must flag/down-weight **both** kinds so neither masquerades as fitness pace. (The doc & this ticket now agree on scope.)
- **What it is:** non-unaided-swimming sets (any equipment, any drill) distort the session-level pace — and the swim trend built on it. D-162 now **captures** which steps used equipment (`workout_metadata.swim_steps_equipment_confirmed: [{step_index, equipment, used}]`, or the unplanned `swim_equipment_unplanned` tag) — enough to know the **direction** of contamination per session. **The pace exclusion itself is not built** — only the data + the narrative direction-flag (D-183).
- **Why deferred / what it needs:** excluding finned steps from the pace that feeds `state-trend/swim` requires per-step pace (per-length / per-interval data), which we don't reliably have for Strava swims (per-length is NULL — same gap as Q-038 / AUDIT Tier B). With only session-level pace, the cleanest near-term move is to **down-weight or flag** finned sessions in the trend, not surgically remove a step's contribution. The per-step *confirmed* data (D-162) is the prerequisite that now exists; the per-step *pace* is still missing.
- **Revisit when:** per-length swim data lands (HealthKit Tier A / FORM Breakdown), OR decide to flag-and-down-weight finned sessions at the trend level using the session-level confirmation alone.
- **State confirmed 2026-06-16 (traced, not built):** the fins exclusion exists **NOWHERE**. `swim_steps_equipment_confirmed` / `equipment_confirmed` has **zero readers** across `supabase/functions` and `src` — the captured data is written by D-162 and never consumed. Every swim-pace surface shows the full **blended (fin-included)** number, unflagged:
  - **Displayed pace** (D-182 path: `analyze-swim-workout` + `session-detail/build.ts`) = total moving ÷ total distance — finned drill sets included.
  - **Trend substrate** (`compute-facts` `buildSwimFacts`, `facts.pace_per_100m = (dur·60·100)/dist`, index.ts:1276) = same blended total/total → `workout_facts` → snapshot → `state-trend/swim`. Equipment-blind.
  - **Race-readiness / arc** (`arc-context.ts`) exposes swim VOLUME + `performance_numbers.swimPace100` baseline only; `user_baselines.equipment` is gym/strength access, not per-session swim gear. No finned-pace handling.
  - **Upshot:** a swim with finned sets reads artificially fast and is currently indistinguishable from true unaided fitness in pace, trend, and any pace-keyed readiness. Q-061 is fully **unblocked** (capture exists) and **0% built**. Cheapest honest near-term move stands: flag/down-weight finned sessions at the trend level (session-level confirmation is enough for that; surgical per-step removal still needs per-length data). **Not built this session — state confirmed only, per the D-182 scoping split.**
- **Partial since 2026-06-16 (D-183 — NARRATIVE half only):** `analyze-swim-workout` now **reads** the captured equipment (first consumer outside the client) and the swim narrative **honestly flags** fin-assisted pace — direction-only, never quantified ("your average pace … is flattered by fin-assisted sets, so your true unaided swim speed reads faster"). This makes the **displayed prose** honest. It does **NOT** touch the **trend substrate** (`compute-facts` `pace_per_100m` is still fin-blended and equipment-blind) — so the core of Q-061 (the trend/fitness-signal exclusion) remains **unbuilt**. D-183 = honest read; Q-061 = honest signal. **Directional gap — CLOSED for the narrative (D-190):** the kick/drill **pessimistic** direction ("reads slower") is now flagged in prose alongside the fins/optimistic direction, landed through the shared narrative core (swim leg of the narrative-core consolidation): bidirectional equipment-direction detection + the SHARED Rule-1 (`leadSignalCoverage`) validator enforcing that the direction is surfaced (equipment-when-present is a notableLeadSignal). Both directions + mixed ("not a clean number either way") now flag. **The NARRATIVE half of Q-061 is DONE (both directions).** What REMAINS is the **trend-substrate half** — `compute-facts pace_per_100m` → `state-trend/swim` still blends equipment/drill sets unflagged (the fitness-signal exclusion). That is the held swim-cleanup work order item 1.
- **Trend exposure CONFIRMED, but it was NOT the cause of the live "+34.6%" headline (2026-06-16 trace, Q-065):** the STATE swim trend (`state_trends_v1.swim`, shown on the Performance card) does ride this fin-blind substrate — `classifyTrend` reads `workout_facts.pace_per_100m`, which `buildSwimFacts` (`compute-facts:1262-1282`) computes fin-blended with zero equipment handling. So the contamination vector reaches the headline. **However**, when the actual "↑ improving +34.6%" was traced, fins were **not** the driver — only 1 of 10 in-window swims used fins and it moved the number ≈0%; the real cause was **stale elapsed-based `workout_facts`** in the early window (**Q-065, since RESOLVED via migration** — trend now reads a like-to-like ~flat `sliding +2.7%`). Net: Q-061's trend-level exclusion is still owed (the fin vector is live in the fin-blind substrate), but it is NOT currently inflating *this* athlete's trend, and the stale-facts artifact that WAS is now fixed. Keep the two distinct.
- **Cross-ref:** `SPEC-honest-swim-inference.md` (Tier 4 pace-trend + Tier 2 equipment-direction — the doc this ticket's scope now matches), `SPEC-universal-narrative-inference.md` (the cross-discipline standard), D-162 (capture + note), D-182 (source single-sourcing — the pace this pollutes is now correct *and* consistent, but still equipment-blended), D-183 (narrative flags fins direction-only — first reader of the captured data), Q-038 (swim pace reliability), `supabase/functions/_shared/state-trend/swim.ts`, AUDIT-swim.

---

## Q-062 — "Send planned workout to Apple Watch": Watch Connectivity exists; native scheduling needs WorkoutKit (iOS 17+)

- **Status:** filed 2026-06-15 · **UNBLOCKED + scheduled as D-175 (2026-06-16)** — the "deferred, weak swim support" premise was WWDC23-era. **Custom POOL SWIM workouts ARE supported in WorkoutKit as of watchOS 11 / WWDC24** (activity = swimming, pool the steps, schedule via `WorkoutScheduler`). Build it: compose a custom pool-swim `WorkoutPlan` from `computed.steps` (warmup + repeatable work/recovery blocks + cooldown — maps cleanly), schedule via `WorkoutScheduler`, enable the disabled "Send to Apple Watch" button. **Limitations to handle:** WorkoutKit rests support distance/time/open only → send our fixed-time rests (e.g. 0:21) as-is, but it CANNOT do Garmin's "manual-advance / leave-on-the-clock" rest. **Open Water is NOT supported by custom workouts (pool only)** → gate to pool swims. Native Swift (`WorkoutScheduler` + composition); confirm watchOS 11+ target.
- **What exists today:** the app already has **Watch Connectivity** rails — `ios/App/App/WatchConnectivityPlugin.swift` (`isPaired`/`isReachable`/`sendWorkout(json)`) + `src/services/watchConnectivity.ts`, already called from `TodaysEffort`. That can push a structured-step JSON to a **companion watch app**, but does NOT drive Apple's **native Workout app** (no system-level guidance).
- **The real mechanism = WorkoutKit (iOS 17+), NOT HealthKit:** `WorkoutPlan` + `WorkoutScheduler` schedule a planned workout that syncs to the Watch's native Workout app. The project has **zero** WorkoutKit usage; entitlements declare only HealthKit. Run/ride have full fidelity (pace/power/HR zones); **swim is experimental/partial** in WorkoutKit (iOS 17.2+) — Garmin export stays the mature swim path.
- **Concrete path (when built):** new native plugin method `scheduleWorkoutToAppleWatch` gated `if #available(iOS 17,*)`; build a `WorkoutPlan` from `planned_workouts.computed.steps` (the SAME step model `send-workout-to-garmin` already consumes — sport-agnostic: pace/power/HR/duration/distance); schedule via `WorkoutScheduler`; add `com.apple.developer.fitness.{running,cycling}` entitlements (+provisioning); runtime-gate with graceful fallback to the existing Watch Connectivity path on iOS 15–16. Deployment target is currently iOS 15 — keep it; WorkoutKit degrades gracefully.
- **Why deferred not shipped:** it's a bounded-but-real native lift (~native plugin + WorkoutPlan builder + entitlement approval), not a one-session change, and swim (the current focus) is the weakest WorkoutKit sport. Tier-1 (Watch Connectivity push) is the cheap interim if a watch surface is wanted sooner.
- **Cross-ref:** `WatchConnectivityPlugin.swift`, `watchConnectivity.ts`, `send-workout-to-garmin/index.ts` (the reusable `computed.steps` export model), D-157 (the HealthKit-plugin precedent for bounded native work).

---

## Q-064 — Swim Performance tab dead space: surface a swim INSIGHTS narrative (still suppressed, Q-038-clouded)

- **Status:** filed 2026-06-15 (D-166 refinement) · **RESOLVED 2026-06-15 (D-167)** — narrative fixed (pace single-sourced, plain-prose prompt) + re-enabled for pool swims after verifying clean on a real recompute.
- **What it is:** after the D-166 swim card, the Performance tab has a large empty area below the recompute link (between it and the nav bar). The run/ride Performance tabs fill that space with the **INSIGHTS narrative** (`SessionNarrative`), but it's **suppressed for pool swims** (`MobileSummary` `!sd?.classification?.is_pool_swim`, from the March a7e14381 refactor). So swims get a void where every other sport gets coaching prose.
- **Why still suppressed:** the swim narrative's quality is **unverified** — swim numbers were garbage pre-Layer-1, and Q-038 (swim ingest/analyzer reliability) is still open, so re-enabling risks surfacing land-flavored or wrong-number prose. Re-enabling blind is the regression risk flagged repeatedly during D-159..D-166.
- **Revisit when:** the swim analyzer's `narrative_text` is verified clean on real swims (recompute one + read the output). If clean → drop the `!is_pool_swim` suppression so swims get INSIGHTS in that space. If not → the void stays until the narrative is trustworthy (or fill it with something else deterministic).
- **Cross-ref:** D-166 (the card above the void), D-156/D-160 (the suppression history), Q-038 (swim reliability), `SessionNarrative`, `analyze-swim-workout`.

---

## Q-065 — Swim trend "↑ improving +34.6%" is a STALE-SUBSTRATE artifact (elapsed→moving methodology step in `workout_facts.pace_per_100m`), NOT fitness and NOT fins

- **Status:** filed 2026-06-16 · **RESOLVED 2026-06-16 via one-time data migration** (this account only; NO code shipped). See RESOLUTION below.
- **RESOLUTION (migration, not a feature):** the 6 stale early-window rows (May 6–20, 2026 — the only stale swims in the entire history; a full-history scan found these 6 and nothing else) were recomputed through the **existing** `compute-facts` edge fn (raw `moving_time`/`distance` → current moving-based `pace_per_100m`), then `compute-snapshot` refreshed `state_trends_v1.swim` for the current week. **No trend logic, no code, no deploy, no UI** — invoking already-deployed functions against my rows. Future users start on corrected logic from their first swim and never hit this. Result: substrate now single-methodology (all 10 in-window swims ~2:00–2:15/100); cached verdict went **`improving / -34.6%` → `sliding / +2.7%`** — the honest like-to-like read (recent two swims marginally slower than the early two; essentially flat, just past the ±1.5% band). The existing endpoint math resolved it on its own. Recomputed rows correctly carry pace but no RPE/equipment (never captured then) — fine, they participate in the pace trend only. Migration scripts: `scripts/_q065-migrate.mjs`, `scripts/_d183-swimtrend.mjs`, `scripts/_d183-swimstep.mjs` (untracked, account-scoped). The systemic guard (version-gated swim facts so a window can't straddle two methodologies) remains a **candidate, not built** — deliberately out of scope per "migration only, keep the app clean."
- **What prompted it:** the swim Performance card shows "swim trend ↑ improving +34.6%" — a visible fitness claim. A ~35% swim-pace gain over a normal window is physiologically impossible, so it was traced before being trusted. The going-in hypothesis was **fin contamination** (Q-061). **The data refutes that hypothesis** — the cause is stale facts.
- **How the trend is built (confirmed in code):** `state_trends_v1.swim` (the card reads the cached spine, D-150/D-151) classifies **`workout_facts.swim_facts.pace_per_100m`** — `lowerIsBetter`, NOT volume/frequency. Path: `compute-snapshot:597-598` fetch (discipline='swim', 56d) → `assemble.ts:117-119` → `swim.ts:swimPaceToSeries` (drops pace <40 or >240 s/100m) → `computeSwimState` → `classify.ts:classifyTrend`. Window **56d** (`thresholds.ts:17`); baseline = **avg of the 2 EARLIEST in-window points vs avg of the 2 MOST-RECENT**; `pctChange = (recentAvg − earlyAvg)/earlyAvg × 100` (`classify.ts:70-73`); `effective = −pctChange` (lower=better); improve/slide ±1.5%, minSessions 3.
- **The actual number (reproduced EXACTLY — cached `pctChange:-34.6` == offline replication, `scripts/_d183-swimtrend.mjs`):**
  - earliest 2: 2026-05-06 **208**, 2026-05-08 **199** → earlyAvg **203.5** (~3:24/100)
  - recent 2: 2026-06-01 **135**, 2026-06-15 **131** → recentAvg **133.0** (~2:13/100)
  - (133−203.5)/203.5 = **−34.6%** raw → **+34.6% "improving"**.
- **ROOT CAUSE — stale `workout_facts`, a methodology step-change, not training:** the RAW `moving_time × 100 / distance` is a **consistent ~2:00–2:15/100m across ALL ten in-window swims, the early ones included** (`scripts/_d183-swimstep.mjs`). But the STORED `pace_per_100m` reads **~3:10–3:46 for May 6–20** and flips to **~2:10 on May 22**. The four recent stored rows **equal** the raw-recompute exactly; the six early stored rows are **≈1.5× too high** (≈ elapsed-based, ~3:20/100). So the early-window facts were written under OLD logic (elapsed-based pace) and never recomputed, while May 22+ use the current moving-based logic (`durationMinutes = moving_time ?? duration`, `compute-facts:95-97`). The trend compares an **old-methodology baseline against a new-methodology recent window** and reads the methodology gap as a 34.6% "improvement." **If the early swims were recomputed to current logic (~129–130), earlyAvg ≈ 129.5, pctChange ≈ +2.7% (mildly SLOWER) → verdict holding/sliding.** The honest read is roughly flat.
- **Fins were the hypothesis, and they are NOT the cause here:** only **1 of 10** in-window swims used fins (Jun 15), it sits in the recent pair, and removing it barely moves recentAvg (135 vs 133) — ≈0% of the 34.6%. The Q-061 fin-contamination vector **is structurally present** (the trend rides the fin-blind `buildSwimFacts` substrate — see Q-061), but it did not produce this headline.
- **Same family as:** D-182 (`computed.overall` divergence), Q-054 (stale-residue run pace), the D-112/D-115 "absent/old value selects wrong branch" class. The systemic fix is **version-gated swim facts** (recompute when the swim-pace methodology changes — like the cycling `ANALYSIS_VERSION` cache-bust) so a window can never straddle two methodologies.
- **Candidate fixes (NOT applied — diagnosis only):** (1) **recompute/bulk-reanalyze the early swims' `workout_facts`** so the 56d window is single-methodology (collapses THIS artifact immediately); (2) a swim-facts **cache-version bump** that forces recompute on methodology change (systemic); (3) a **plausibility guard on `pctChange` magnitude** for swim (a single-window pace swing beyond a physiologically implausible bound → flag / `needs_data` instead of headlining "improving"). Decide before building.
- **Cross-ref:** Q-061 (the fin half of swim-pace contamination — the trend rides the same fin-blind substrate), Q-038 (swim pace reliability), D-182 (single-sourcing — fixed the *displayed* card but the *trend substrate* `workout_facts` was not backfilled), D-163 (moving-vs-elapsed swim duration), `compute-facts/index.ts:1262-1282`, `_shared/state-trend/{swim,classify,thresholds,assemble}.ts`. Scripts: `scripts/_d183-swimtrend.mjs`, `scripts/_d183-swimstep.mjs` (untracked).

---

## Q-066 — Historical Strava import IGNORES source preference → duplicate runs/rides vs Garmin (real new-user signup bug; PRIORITY)

- **Status:** filed 2026-06-16 · **RESOLVED 2026-06-16** — ported the live webhook's source-preference gate into `import-strava-history`. See RESOLUTION below.
- **RESOLUTION:** the gate from `strava-webhook/index.ts:175-204` is now applied per-activity in `import-strava-history` (loop, right after the existing-`strava_activity_id` skip, BEFORE the detail/stream fetch + `ingest-activity` call — same ordering as live). Preferences fetched once (`users.preferences.{source_preference, swim_source_override}`). When Garmin is preferred (globally, or via the D-173 swim override for swims) the Strava copy is skipped **only if** Garmin already has a record for that date+type (`.eq('date', …).eq('type', mappedType).not('garmin_activity_id','is',null)`), so a Strava-only activity is never lost. **Not a new mechanism — a line-faithful port**, so historical and live stay consistent. Response now returns `skipped_by_preference`. **Swim non-conflict confirmed:** a swim is EITHER skipped by this gate (Garmin-preferred + Garmin has it) OR passes through to `ingest-activity`'s swim merge gate (D-157/D-184) — never both in a conflicting way (the gate is a coarse pre-filter, the merge gate the fine cross-source dedup; identical layering to the live webhook). **Verified** (`scripts/_q066-verify.mjs`, untracked) against real DB state across all branches: garmin-pref → SKIP when Garmin has it / INGEST when not; `both`/`strava` → passthrough; swim override → SKIP; un-overridden swim → passes to merge gate. `deno check`: no new errors (2 pre-existing TS2339 at :552 unrelated). DEPLOYS `import-strava-history`. Net: **signup import is now clean across all disciplines for new users** — swims via merge+D-184, runs/rides via this ported gate.
- ~~**PRIORITY — affects new-user signup import, not one account.**~~ (resolved)
- **What it is:** the LIVE Strava webhook respects the athlete's `source_preference` / `swim_source_override` and **skips** a Strava activity when Garmin is preferred and already has a record for that date+type (`strava-webhook/index.ts:180-204`). The **historical/bulk importer does NOT** — `import-strava-history/index.ts` has **zero** `source_preference` checks; its only pre-filter is an in-memory set of already-present `strava_activity_id` (`:659-665`, `:751`). So a bulk import ingests **every** Strava activity regardless of preference.
- **Why it's a real new-user bug:** a common signup flow is "connect my accounts + import my back-catalog." A new user who connects **both Strava and Garmin** and imports Strava history gets **duplicate runs/rides** — the Strava copy is inserted alongside the Garmin copy because (a) the historical path skips the preference gate, AND (b) **non-swim activities have NO cross-source merge at all** (`mergeSameSwimIfExists` is gated `type==='swim'` at `ingest-activity:1302`; runs/rides only dedup on the *same-provider* `onConflict`, which can't catch Strava-vs-Garmin). Swims are mostly protected (the swim merge gate + D-184 manual fix); **runs/rides are not.**
- **Scope of the gap:** duplication is the failure mode (two rows, different provider ids, same workout) — it inflates volume/load/trends. It is NOT a stale-data or contamination issue; it's missing dedup on one path.
- **Candidate fixes (NOT applied — decide before building):** (1) **apply the same source-preference gate the webhook uses** inside `import-strava-history` before calling `ingest-activity` (symmetry — cleanest); (2) **a general cross-source merge for runs/rides** (start ±Ns + distance/duration tolerance), the non-swim analog of `mergeSameSwimIfExists` — broader, riskier; (3) both. Option 1 is the targeted new-user fix.
- **Cross-ref:** D-184 (the swim half — same-day manual merge; swims also rely on the swim merge gate, so swims are largely covered while runs/rides are the exposure), `strava-webhook/index.ts:180-204` (the gate the historical path lacks), `import-strava-history/index.ts`, `ingest-activity/index.ts:1302` (swim-only merge gate), Q-067 (the one remaining dedup edge, deliberately left filed).

---

## Q-067 — Reverse-order manual swim: logging a swim by hand that a device source ALREADY imported bypasses the dedup gate (filed, NOT building)

- **Status:** filed 2026-06-16 · **filed-not-fixed by decision — low-likelihood edge, build the fix only if it surfaces.**
- **What it is:** D-157/D-184 dedup swims at ingest by routing every device import through `ingest-activity`'s `mergeSameSwimIfExists`. But `ManualSwimEntry` (the hand-logging UI) does a **direct `workouts.insert()`** (`src/components/ManualSwimEntry.tsx:62`) that **bypasses `ingest-activity` entirely** — so it runs no merge/dedup against existing rows. D-184 closes the forward order (manual exists → device imports → merges). The **reverse** is open: a device swim already exists, then the athlete logs the same swim by hand → a second (manual) row, no merge → duplicate.
- **Why deliberately NOT built (Michael, 2026-06-16):** manual entry exists for **device-less** swims; logging by hand a swim you already have from a device is rare and not the feature's purpose. The gap is documented, the failure mode is bounded (one duplicate, user-initiated), and the fix is scoped — not worth building speculatively.
- **The fix if it ever surfaces:** a **client-side pre-insert check** in `ManualSwimEntry` — before the direct insert, look for an existing same-day (+ ±10% distance) swim and either block with a "you already have this swim" prompt or route the manual entry's user-captured fields (pool/RPE/feeling/equipment) onto the existing row instead of inserting. (Mirrors D-184's keep-and-enrich, client-side.)
- **Cross-ref:** D-184 (the forward-order fix this is the mirror of), Q-066 (the broader import dedup work, now resolved), `src/components/ManualSwimEntry.tsx:62` (the direct-insert bypass), `ingest-activity` `mergeSameSwimIfExists` (the gate manual entry doesn't reach).

---

## Q-068 — Server-compute the Details-tab metrics that have NO server source (swim SWOLF/sets/splits, workout-level VAM, work_kj unit) — so the Details tab can read instead of recompute

- **Status:** filed 2026-06-16 (continuity audit fix #2 / D-186 follow-up) · **NOT building now — scoped out as a real feature build.**
- **What it is:** D-186 consolidated `CompletedTab` (Details tab) toward "client formats, never recomputes," but several values it shows have **NO server-side equivalent**, so they stay client-side **by necessity** (documented as honest exceptions in `AUDIT-continuity-2026-06-16.md`, not fake-consolidated). To finish the invariant, the SERVER must compute these first; then the Details tab reads them:
  - **Swim display heuristics** — SWOLF, warmup/main/cooldown **set detection**, strokes-per-length, stroke-rate, **100m splits**, pool-length inference. Today these are clustered/derived client-side from the laps array. The server (`analyze-swim-workout` / `compute-facts` / `session_detail_v1`) computes none of them. Move them server-side (e.g. into `swim_facts` + the display contract) so the Details tab and any future surface read ONE computed value.
  - **Workout-level VAM** — `compute-facts` only computes a **per-segment** `vam_m_per_h` (`:680/:706`); there is no workout-level VAM scalar in `display_metrics` / `session_detail_v1`. The Details tab shows an inline client VAM (no server source). Compute a workout-level VAM server-side and surface it.
  - **`work_kj` UNIT BUG (real, currently dormant):** `workout-detail:1489` sets `display_metrics.work_kj = total_work` **without ÷1000**, but FIT `total_work` is in **JOULES** (which is why the client `calculateTotalWork` divides by 1000). So `display_metrics.work_kj` is **1000× too big** for any workout with `total_work` populated. It's dormant only because no surface currently displays `norm.work_kj` and the dev cohort has null `total_work`. **Fix:** `display_metrics.work_kj = total_work / 1000` (+ add the `avg_power × moving_s / 1000` fallback the client has) — THEN the Details tab can migrate total-work onto it. Until fixed, the client `calculateTotalWork` (correct unit + fallback) stays; D-186 deliberately did NOT migrate onto the buggy server field.
- **Why deferred:** Option 3 from the fix-#2 scope decision — a genuine server-feature build (new computations + verification across sources), beyond the "stay tight, just consolidate the Details tab" scope. The honest-exception documentation makes the current state truthful; this Q is the path to closing it.
- **Cross-ref:** D-186 (the consolidation that surfaced these), `AUDIT-continuity-2026-06-16.md` (the exception list), `CompletedTab.tsx` (the client computations), `workout-detail/index.ts:1489` (the work_kj unit bug), `compute-facts/index.ts:680` (per-segment VAM).

---

## Q-069 — `planned_workouts.session_type` / `hardness` are NULL on all swims — cosmetic (no read site)

- **Status:** filed 2026-06-17 (read-site sweep) · **CLOSED as cosmetic — no build, no backfill.**
- **What it is:** the structured `planned_workouts.session_type` and `hardness` columns are NULL on every swim (`intensity` is `{}`). A full sweep of `session_type`/`hardness`/`session_intent` across `supabase/functions/` and `src/` found **zero consumers read these DB columns.** Every same-named symbol is one of: an in-memory `SwimSlotTemplate.session_type` build-time field in the generator (never round-tripped — `session-factory.ts`, `swim-program-templates.ts`, `week-builder.ts`); the unrelated pilates `workout_metadata.session_type` JSONB (`disc==='pilates_yoga'`-gated; swim never enters); the library-plan-pool `hardness` descriptor (`pools.schema.json`); or label-string text. No `.select()` names these columns from `planned_workouts`.
- **Bucket result:** bucket-3 (null alters a score/load/adherence/user text) is **EMPTY.** Swim intent is tag-sourced by design (D-195; `analyze-swim-workout:413-431`, `rest-norm.ts swimIntentFromTags`); load uses `intensity_class`/tokens; adherence is count-based.
- **D-198 `session_intent` check (the one place a real bug could hide) — CLEAN:** `session_intent` is a NEW column on `workouts` (executed table), not `planned_workouts`; mirrors `rpe`. The D-198 Mode A/B gate routes on `planned_id`, NOT `session_type`/adherence. No code gates on both; the two are independent. D-198 does not read or assume `session_type`/`hardness`.
- **Verdict:** cosmetic — populating the columns changes no output given current code. Write gap (no insert path writes them) is likely **cross-discipline**, not swim-only (UNVERIFIED extent). A future feature wanting structured intent off the column is net-new (new Q + write path + backfill), not a fix.
- **Cross-ref:** D-195, D-198, `docs/audit/99-SUMMARY.md` §3.

---

## Q-070 — Sport-chip ✓ means "selected," not "baseline entered"; peeking a chip silently adds a discipline with no un-add

- **Status:** filed 2026-06-17 · **RESOLVED 2026-06-17 — feature REMOVED.** The ✓ badge is dropped from the sport chips entirely (Michael: "not necessary, more trouble than it's worth"). Removal moots both the misleading-semantics and the peek-earns-✓ problems. (`data.disciplines` is still set on chip-open for the editor's active-sport logic but no longer drives any badge; a quick grep showed it does not feed plan generation, so the residual is cosmetic.) Original analysis kept below for the record.
- **(1) Cosmetic — ✓ semantics.** In `TrainingBaselines.tsx` the sport-chip ✓ shows when `hasData = data.disciplines.includes(id)` (`:1061,:1083`) — "this sport is selected," NOT "a baseline was entered." Misleadingly named `hasData` (really `isSelected`). For null-honest consistency, ✓ should mean a baseline is actually entered; rename `hasData → isSelected`.
- **(2) Real issue — silent add, no un-add.** `toggleDiscipline` (`:849-861`) adds the discipline to `data.disciplines` the moment you TAP the chip to peek (before any entry), with **no way to un-add** (tapping an active chip only closes it). So peeking at a sport you don't train permanently marks it selected — and that selection can **feed plan generation a discipline the athlete doesn't train.** The un-add path (and not-auto-adding on mere peek) is the part worth fixing.
- **Persistence note (resolved, not a bug):** the related `swimPace100` "doesn't persist" worry was reproduced from code and is FALSE — it round-trips via `performance_numbers` (AppContext `:337/:380/:445/:470`); committed on the Save tap. No fix needed. See `SPEC-intensity-baselines.md` C1.
- **Cross-ref:** D-199, `src/components/TrainingBaselines.tsx:849-861,1061,1083`.

---

## Q-071 — Swim PROGRAM prescribes into only 2 of the 5 intensity bands (no hard/threshold/speed) — future program work, NOT a card bug

- **Status:** filed 2026-06-17 (surfaced reading the active 70.3 plan during the D-199 / Layer-C zone work) · **PROMOTED 2026-06-18 to the ACTIVE swim build (D-200):** integrating "hard" into the swim protocol is now the load-bearing prerequisite — the user-entered threshold benchmark is useless if the plan never prescribes a hard/threshold effort to test against. Michael rebuilds the plan for the 5-tier system to test once this lands.
- **What it is:** the active IRONMAN 70.3 plan's 34 swims map to **EASY (22) + MODERATE (12) only — zero HARD.** Session types present: `technique_swim` (18) + `recovery_swim` (4) = easy; `css_aerobic` (9) + `pull_focus_swim` (3) = moderate. NO threshold (Z4), speed/sprint (Z5), or race_specific_aerobic anywhere in the loaded plan — every "quality" session is explicitly *"moderate, sustainable, conversational"* (Z3 CSS-aerobic), not a hard effort.
- **Why this is NOT a card bug:** the D-199 Layer-C Pace Zones card is a **reference** — it shows all 5 bands' pace targets derived from the athlete's threshold pace (like the run HR-zone card shows all 5 zones regardless of plan). The card does not look "empty." The gap is in the PROGRAM's prescription distribution, separate from the card.
- **The work (deferred):** build hard/threshold/speed swim prescription into the later phases of the swim program (`generate-combined-plan` swim path; SWIM-PROTOCOL §5.3 Threshold + the speed session types exist in the protocol but aren't being prescribed) so a 70.3/Ironman build develops threshold + speed, not only aerobic base. **Open question:** is the all-aerobic base intended for the current phase, or a genuine gap across the whole 17-week plan?
- **Cross-ref:** D-199, `docs/SPEC-intensity-baselines.md` (the 5-band model), `docs/SWIM-PROTOCOL.md` §5.3 (threshold session type that exists but isn't prescribed here).

---

## Q-072 — `autoRefreshToken: false` → session expires after ~1h → bump-out, and AuthWrapper LOOPS on "Can't verify" instead of dropping to login

- **Status:** filed 2026-06-18. **CHURN HALF FIXED + SHIPPED 2026-06-23 (D-209, `bbee4027`) — pending on-device verification (#9-14), NOT yet closed.** EXPIRY HALF still open (below), never bitten, not building.
- **UPDATE 2026-06-23 — churn half (the logger-teardown root cause) shipped:** the resume churn was `AuthWrapper` rendering `<Loading/>` instead of `<AppLayout/>` on every auth event → unmounting the app (and logger) on each iOS foreground. Fixed via D-209 (Option B check-once + `approvedUserIdRef` no-op branch). #1-8 verified by logic/web; **device rows #9-14 owed** (regression-critical: #7 login-as-different-user, #8 logout, #10 signed-out-while-away — the "sticky / wrong user" directions). Until those pass on-device, the churn is NOT closed. The EXPIRY half (everything below) is unchanged and still deferred.
- **What it is:** `src/lib/supabase.ts` sets `autoRefreshToken: false` (deliberate — a comment says it prevents gotrue-js from running a background XHR/fetch, an iOS/WKWebView issue, paired with `lib/native-fetch-shim`). Side effect: the access token expires after ~1h with NO renewal → the next authenticated query (e.g. AuthWrapper's `users.approved` check) fails → the **"Can't verify your account"** screen, which only offers "Try again" (re-uses the same dead token → loops) and "Log out". Escape = tap **Log out** (clears the session → clean login), or delete+reinstall.
- **IMPORTANT nuance:** that "Can't verify" screen is ALSO literally the no-internet screen ("couldn't reach the server… network blip"). The acute lockout on 2026-06-18 was triggered by **flaky internet**, not purely token expiry — and the flapping auth checks are also the likely driver of the **strength-logger resume rebuild churn** (D-202). So this one issue plausibly underlies BOTH the bump-outs and the logger state-loss.
- **Fix (not built):** (1) restore token refresh in an iOS-safe way — a manual `supabase.auth.refreshSession()` on resume (appStateChange), or re-enable `autoRefreshToken` now that the native-fetch-shim exists; (2) make AuthWrapper distinguish an expired/invalid session from a transient network blip and drop to a clean login + sign out, instead of looping on "Try again." Either removes the trap.
- **Cross-ref:** `src/lib/supabase.ts` (the flag), `src/components/AuthWrapper.tsx` (the loop, `fetchApprovalOutcome`), D-202 (the resume churn this likely drives).

---

## Q-073 — Re-materialization primitive: one lazy resolver with an explicit PIN POLICY (not "lazy vs eager")

- **Status:** filed 2026-06-18 · **SHAPE RECORDED, NOT BUILT.** Gated behind the two-copy collapse below. The default (pin-to-block vs follow-current) is a daylight decision, parked.
- **What it is:** when an accepted baseline/e1RM change should reach already-materialized future sessions (the SPEC-strength recalibration "going forward" case), how do future planned loads update? Mapped the chain: strength loads are computed **eagerly at generation+materialize time** into `planned_workouts.computed.steps` and **frozen** — `get-week` reads them as-is and never recomputes from current baseline (`get-week/index.ts:325-330`). A baseline change reaches future sessions today only when something re-invokes `materialize-plan` (only `adapt-plan` auto + the manual-override modal do). Overrides live in `plan_adjustments` and are re-applied on every materialize, so they survive (`adjustment_factor`/`weight_offset` track; `absolute_weight` pins).
- **The insight — the answer is NOT "lazy vs eager," it is a pin-policy parameter.** One shared lazy/on-read resolver `resolvePlannedStrengthLoad(step, baselines, adjustments, pinPolicy)` where the **caller declares** the baseline source: **recalibration → follow-current** (future sessions track the new e1RM); **season planning → can pin** (block-start snapshot, frozen-plan-safe); **goals materializer → per intent.** One primitive serves all three; the pin policy is what keeps it D-021-safe instead of silently rewriting frozen plans.
- **Prerequisite (the real blocker):** there are **two** load-compute copies today — `materialize-plan/calculateWeightFromConfig` (`index.ts:573-616`) and the dispatcher `shared/strength-system/protocols/triathlon_performance.ts` (`scaleSessionToRebuildLoads`) — bridged by a pass-through (`materialize-plan/index.ts:1639-1652`) that already exists to stop them drifting (the "Week-17-155lb" bug). A single resolver only pays off once these collapse into one and **generators emit `percent_1rm` + anchor lift instead of absolute lb**. Plus every non-`get-week` reader of `computed.steps` (Garmin export `send-workout-to-garmin`, `useWorkouts`, `StrengthCompareTable`, coach, …) must reach the resolver or it reads stale frozen weights.
- **Acceptance bar (SSoT — the real criterion):** single-source-of-truth is **not** satisfied by the resolver design alone — only when the two compute copies become one and generators emit percent+anchor. Until then the resolver is a *fourth* copy, not a consolidation. This is the definition of done for the SSoT principle of the strength-screens thread.
- **Lineage:** **D-021** (frozen plans, "no silent rewrite" — the bias against eager auto-rewrite) and **D-197** (swim `equipment_detail` "derive-at-read-when-absent" — the owner's existing lazy precedent for the analogous problem). **Do NOT cite D-185–D-192** — that is the *narrative* continuity invariant, a different lineage.
- **Daylight decision (parked):** pin-to-block vs follow-current as the *default*. Some loads are deliberately pinned to the block-start snapshot (`materialize-plan/index.ts:481, 2675`), so a pure follow-current default would change behavior. Decide the default when building.
- **Scope guard:** the SPEC-strength single-session adjust ships independently (no downstream effects); baseline/"going forward" recalibration is **compute-and-confirm only** until Q-073 resolves — store the intent to recalibrate, defer the re-materialization mechanics.
- **Cross-ref:** D-021, D-197, D-204 (the other strength-screens prerequisite), SPEC-strength-performance-details.md (the recalibration this gates). Key files: `materialize-plan/index.ts`, `get-week/index.ts`, `shared/strength-system/protocols/triathlon_performance.ts`, `generate-combined-plan/session-factory.ts`, `adapt-plan/index.ts`, `src/components/StrengthAdjustmentModal.tsx`.

---

## Q-074 — Strength execution-score letter-band thresholds (tune on real sessions)

- **Status:** filed 2026-06-18 · **TUNE WHEN SCORE MATH EXISTS.** (Was the placeholder "Q-072" inside SPEC-strength — renumbered; live Q-072 is the auth-token issue.)
- **What it is:** A = 90+, B = 80–89, etc. — the band cutoffs for the SPEC-strength execution score. Tune against real logged sessions once the intent-weighted score function exists. **Hard check before shipping:** a correctly-executed *maintenance* session must land A/B, never a "C for not progressing" (the demotivation guard). If the math grades a well-executed maintenance session low, the math is wrong.
- **Cross-ref:** SPEC-strength-performance-details.md (execution score), D-204 (the score reads provenance-confirmed RIR only).

---

## Q-075 — Strength intent correctness: should the athlete be able to correct inferred intent?

- **Status:** filed 2026-06-18 · **RECOMMEND yes-as-quiet-correction; lower priority than score + recalibration.** (Was the placeholder "Q-071" inside SPEC-strength — renumbered; live Q-071 is swim PROGRAM bands.)
- **What it is:** the Arc infers per-session intent (e.g. "maintenance" from race timeline). Should the athlete override it? Recommendation: yes, but a *quiet* correction — never a prominent toggle, never locked, never silent. The verdict label ("maintaining · holding") is the user-facing signal; intent mode itself stays invisible (settled — no "mode: maintenance" badge).
- **Cross-ref:** SPEC-strength-performance-details.md, SPEC-strength-intent.md.

---

## Q-076 — Strength Details still shows a skipped exercise as "done" (reported, unverified)

- **Status:** filed 2026-06-21 · **UNVERIFIED** — reported by Michael right after the D-204 prefill stack deployed; the screenshot came through blank, so screen / build state / whether-freshly-logged are all unknown. To be device-tested 2026-06-22.
- **Symptom:** an exercise the athlete skipped (left as an untouched plan prefill) reportedly renders as completed on a read surface after logging. If real, this contradicts the D-204 chain, whose deterministic logic is internally verified to drop untouched prefills (16/16, `/tmp/d204-strength-test.mjs`).
- **Hypotheses, cheapest to rule out first:** (1) **stale on-device bundle** — `StrengthCompletedView` is client code; the fix only applies if the app was rebuilt + reinstalled with `a6b5f60d`. (2) **saved data lacks `prefilled`** — if the session was logged/saved by pre-D-204 code (or the save path drops the flag), the filter has nothing to key on → reads as done. (3) **a surface the filter doesn't cover** — Details receipts are filtered; calendar / summary / other read paths may not be.
- **First step:** read the DB row for the reported session (with go-ahead) — distinguishes a saved-data bug (skip not recorded as a skip) from a display bug (data right, screen stale). Two different fixes.
- **Cross-ref:** D-204 (the stack this questions), ENGINE-STATE "Questioned" (the on-device-test-pending entry), Q-072 (resume churn — the un-fixed root behind Bug A).

---

## Q-077 — Strength narrative misreads the e1RM-block trend direction

- **Status:** unverified (bug, deferred) — **DID NOT REPRO on the first recompute (2026-06-22); priority downgraded, NOT closed.**
- **Update (2026-06-22):** after the D-206 deploy, the June 22 Upper session was recomputed. The regenerated narrative read *"with bench press e1RM ticking up while overhead press and barbell row trended down"* — directionally coherent, no 105→110 incoherence. **One clean run is not proof of a fix** (the tightened D-206 prompt no longer cites the bare prev/current numbers, which may simply be hiding the misread rather than fixing it). Keep open; watch for recurrence when the narrative does cite specific e1RM numbers.
- **Why it exists:** on the original 2026-06-22 Upper session the narrative said *"the overhead press dropped from 105 to 110 lb and the row slipped from 115 to 110 lb"* — 105→110 is an **increase** narrated as a "drop." The e1RM block is fed to the model as `current (prev X → trend)`; the model is reading the prev→current direction backwards (and/or treating the trend word and the numbers inconsistently).
- **Distinct from the "receipts are fiction" bug:** that bug is the `completed === null` phantom-performed issue (untouched prefills counted as done — addressed by D-204's `isPerformedStrengthSet`). **This is a narrative/e1RM-block formatting/parse bug, not a data-integrity bug.** Filed separately on purpose so it doesn't get lost under receipts.
- **Fix candidates (preferred first):**
  1. **Reformat the e1RM block input** to state the delta explicitly — `bench 135 lb (+5 vs last)` / `OHP 110 lb (−5 vs last)` — instead of two bare numbers the model must order itself. Fixing the input format beats validating a bad narrative after the fact.
  2. Add a `validate-narrative` rule that checks the stated direction word ("rose"/"dropped"/"slipped"/"ticked up") against the signed delta and rejects on mismatch.
- **Verification owed:** repro across ≥2-3 sessions with a known prior e1RM to confirm it's systematic (the `current (prev → trend)` format) vs a one-off; then ship candidate 1 and recompute.
- **Cross-ref:** D-206 (the capped narrative this rides on), D-189 (e1RM honesty — null → say nothing), the analyzer's `e1rmBlock` construction (`analyze-strength-workout/index.ts` ~`:2263-2266`).

---

## Q-078 — Partial-accessory-sets hit set-completion at full weight (the D-208 lie in miniature)

- **Status:** unverified (deferred, by design)
- **Why it exists:** D-208 role-weights **exercise-completion** (a *skipped* accessory dings 0.5×). But **set-completion** (20% of the execution score) is NOT role-weighted — it's a flat ratio over matched exercises' sets. So doing 1 of 3 sets of an accessory dings set-completion the same as doing 1 of 3 sets of a main lift. Same coaching lie as the skip case, just smaller (it only bites on *partial* accessory completion, and only at 20% weight).
- **Why deferred:** D-208 fixed the dominant case (a full skip, which only moves exercise-completion). The partial case is rarer and lower-weight; shipping the skip fix first was the right scope.
- **What "fixing" would require:** role-weight the set-completion contribution per exercise (weight each exercise's sets by `ROLE_WEIGHT[role]`), reusing the same `roleForExercise` classifier — the `component_attribution` structure is already in place to carry it.
- **Cross-ref:** D-208 (the skip fix this extends), `_shared/strength/exercise-role.ts`.

---

## Q-079 — Role lives in a D-208-only table, separate from the EXERCISE_CONFIG catalog and the user-loggable library

- **Status:** intentional (scoped), worth revisiting if role-weighting expands
- **Why it exists:** there are three strength-exercise vocabularies: (1) the D-208 role table (`_shared/strength/exercise-role.ts`, 80 keys — prescription vocabulary, role/scoring); (2) `EXERCISE_CONFIG` (`materialize-plan/exercise-config.ts`, 134 entries — research load ratios; has `primaryRef` but no explicit role field); (3) the client `commonExercises` autocomplete (what a user can log). D-208's table is the only one that classifies role, and it covers the **prescribed** vocabulary only.
- **Why it's fine today:** the execution score role-weights **planned** exercises only (the completion denominator), and every planned exercise comes from the protocols → fully covered (validated 110/110). An unplanned user-added exercise never enters exercise-completion, so its role is irrelevant to the current score. The loud unknown-name tripwire is the safety net if that assumption ever breaks.
- **When to revisit:** (a) if we role-weight UNPLANNED or user-swapped exercises (then the role table must cover the user-loggable `commonExercises` library too); (b) architectural cleanup — role ideally belongs as a field on the canonical `EXERCISE_CONFIG` (one source of truth for exercise metadata: load ratio + role + unilateral) rather than a parallel table that can drift. Until then the two are independent and the tripwire guards drift.
- **Cross-ref:** D-208, `materialize-plan/exercise-config.ts`, `StrengthLogger.tsx` `commonExercises`.

---

## Q-080 — Manually-logged strength never gets `computed.adaptation` → the block-adaptation strength lane is structurally dark

- **Status:** filed 2026-06-25 (surfaced by the D-212 Piece 4 real-block verification) · not fixed · the actionable half of "why is the block_verdict axis dark"
- **Why it exists:** `compute-adaptation-metrics` is the ONLY writer of `workouts.computed.adaptation`, and it's invoked by exactly two paths — `ingest-activity:1559` (Strava/Garmin imports) and `backfill-adaptation-metrics:129` (manual batch). **`recompute-workout` (the live save path for manually-logged workouts, `useWorkouts.ts:12`) does NOT invoke it** — its fan-out is `compute-workout-analysis → compute-facts → analyze-{sport} → compute-snapshot`, no adaptation step. So a manually-logged **strength** session never gets a `computed.adaptation` object. Verified on real data: all 3 of the sole athlete's recent strength sessions (with `strength_exercises` 2/7/6) had **no adaptation object at all** (`adapt=N`), while imported runs/rides/swims did.
- **Why it matters:** strength IS a first-class lane in the block-adaptation model (`strength_overall_gain_pct` → `goal-predictor` `block_verdict`). With manual strength producing no adaptation object, that lane **cannot light up via the live save path** even with perfect progression — only the batch backfill (which DOES handle strength) would populate it. This is one of the two reasons the D-212 third axis (`block_verdict`) reads seeded-50 today; the other (aerobic) is just data-thin (needs ≥2 comparable `easy_z2` runs/weeks) and self-resolves with training.
- **Distinct from the ride/swim "untagged adaptation" finding (which is BY DESIGN):** rides/swims get a bare `adaptation` object with no `workout_type` because `compute-adaptation-metrics` has no ride/swim branch and the model has no ride/swim lane (`backfill-adaptation-metrics:64` — "Only run + strength are currently meaningful"). That's expected, harmless. The strength gap is the real one: strength is *in* the model but the live path doesn't compute it.
- **Fix shape (deferred, not done):** have `recompute-workout` invoke `compute-adaptation-metrics` for completed strength (mirror the `ingest-activity` fan-out) — or, narrower, trigger it on the strength save path. Register the new downstream in the ingest/recompute fan-out per the CLAUDE.md "any new downstream must register here" rule. Verify the strength branch (`compute-adaptation-metrics:406-455`, tags `'strength'`, reads `strength_exercises`) then produces `strength_overall_gain_pct` once ≥2 weeks of comparable lifts exist.
- **Cross-ref:** D-212 (the axis this feeds), `compute-adaptation-metrics/index.ts:358/406/460`, `ingest-activity/index.ts:1559`, `backfill-adaptation-metrics/index.ts:64`, `recompute-workout/index.ts` (fan-out), `_shared/block-adaptation/index.ts`, `useWorkouts.ts:12`.

---

## Q-081 — Goals screen: clarify goal-vs-plan, reweight for non-race parity (surface-later, gated behind the non-race keystone)

- **Status:** filed 2026-06-25 · UI/clarity note · **do not build now** — gated behind the non-race generation keystone (D-213 build (a), Cuts 1–5). Surface-later, same split as the divergence read.
- **Why it exists:** the Goals screen blurs two concepts — a **goal** (the target: a race, or non-race like "get stronger" / "build the bike") vs a **plan** (the engine's output: the periodized weeks). "Plan my season" and "Add Goal" read as *different features* when they're the same system: a goal + the engine produces a **season** (race shape) or a **block** (non-race shape) — exactly D-213's one-engine-two-shapes.
- **The two changes (when the surfacing workstream lands):** (1) **Clarify labeling** so `goal = target`, `plan = output` is legible. (2) **Reweight layout** — "Add Goal" should sit **above** "Plan my season" and feel co-equal; the current prominence of "Plan my season" encodes the endurance-first/race-primary bias the non-race work is growing past. Once a goal can be a non-race block, "Plan my season" won't even *apply* to it.
- **Cross-ref:** D-213 (`SPEC-one-engine-two-shapes.md` — one engine, two shapes), the non-race keystone (Cuts 1–5), `GoalsScreen.tsx`.

---

## Q-082 — Non-race capacity targets: wire a real target metric through to volume (the deferred Cut 5 (B))

- **Status:** filed 2026-06-25 · **future product build, do NOT build blind** · gated on a product decision. This is the half of "Cut 5" we deliberately did NOT build — D-213 Cut 5 shipped (A) (the fitness-driven close), and (B) is logged here as the real feature it is.
- **Why it exists:** the non-race arc (D-213 Cuts 1–5) develops an athlete from current fitness toward a retest — volume is CTL/hours-driven via `scaledWeeklyTSS` (`generate-combined-plan/science.ts`), fitness-appropriate by construction. It does **not** scale to a *capacity target* (e.g. "reach FTP 250" / "80 km/wk" / "squat 1.5×BW") because **nothing collects or carries one**: `goals.target_metric/target_value/current_value` exist in the schema but are hardcoded null at creation (`create-goal-and-materialize-plan/index.ts` ~:2350/:2819), never selected into the engine (~:1189), and never on the engine payload (~:1253-1275) — three null hops.
- **What (B) would require (all three, in order):** (1) a **product decision** on what a "capacity target" *is* per sport (FTP? weekly volume km? 1RM? a pace?) and how a plan should bend toward it; (2) **goal-creation UI** to collect it (none today); (3) **plumbing** the value through the 3 null hops (select → payload → generator) and a **target→volume mapping** below the seam (the current proxy distance — `proxyDistanceForNonRaceGoal` — only sets the tri long-session ceiling; a real target would drive magnitudes). Until (1)+(2) exist there is no input to map from, so building (3) blind would be a half-feature.
- **Cross-ref:** D-213 (`SPEC-one-engine-two-shapes.md` §4b — "a distance-equivalent capacity target"), Cut 5 (A) (`non-race-routing.ts:proxyDistanceForNonRaceGoal` — the fitness-driven close that made (B) unnecessary for v1), `scaledWeeklyTSS` (the CTL/hours volume engine).

---

## Q-083 — Strength progression ladder: one recovery-aware cadence-engine, not module-per-program (scope after 5×5)

- **Status:** filed 2026-06-26 · **scope after 5×5 ships, do not build now.**
- **The idea:** Texas Method / Madcow (weekly cadence) and 5/3/1 (monthly cadence) are the rungs *past* 5×5 (session→week→month progression cadence). Research suggests they are **configurations of ONE progression engine** — a **cadence axis** (session / week / month) × a **heavy-light-medium structure** — **not separate bespoke modules**. 5×5, Texas, Madcow, 5/3/1 would all be configs of the same engine.
- **Our edge:** make that engine **recovery-aware** — the spine / fitness-recovery signals tune progression + deload off the *body*, not a fixed schedule. The blind spreadsheet versions (StrongLifts/Madcow apps) progress regardless of how the athlete recovered; recovery-awareness is the differentiator. (Mirrors the §5.5 "reads the body, never the birthday" rule.)
- **Scope:** after 5×5 ships, scope ONE cadence-engine (session→week→month cadence + HLM) the four programs are configs of — avoid module-per-program. Needs the observed-1RM feedback loop wired first (`ProtocolContext.history`, currently unused).
- **Cross-ref:** `SCIENCE-5x5-linear-progression.md` (5×5 is the first rung), the 5×5 module work, D-210 (strength develop-posture + the chassis `selector.ts`/`StrengthProtocol`), the strength audit (the `context.history` feedback gap).

---

## Q-084 — Harmonize ArcSetupWizard's tri strength onto named protocols (the strength-vocabulary cleanup)

- **Status:** filed 2026-06-26 · **future cleanup, NOT in the non-race builder scope.**
- **The split today:** three strength surfaces speak different languages. **PlanWizard (legacy run)** = named-protocol picker ("Durability" / "Neural Speed" / "Upper Aesthetics" → `strength_protocol`). **ArcSetupWizard (tri)** = intent-role labels ("Strength as a training priority" / "Durability-Focused" → `strength_intent` only, no named choice; `:2142-2361`). **Marathoner in ArcSetupWizard** = no strength step at all (`if (tri)` gate, `:2825`). The non-race builder adopts the **named-protocol + "Durability"-anchor** vocabulary (`SPEC-per-discipline-periodization.md §13.1`).
- **The question:** should ArcSetupWizard's tri strength step be migrated to the same named-protocol vocabulary (so a triathlete sees "Durability" / "Triathlon Performance" rather than role-labels), unifying all surfaces? That makes one strength language app-wide — but it touches a live race-wizard step (regression surface) and the tri protocols (`triathlon` / `triathlon_performance`) would need user-facing names. **Deliberately deferred** so the builder ships against a stable contract first.
- **Cross-ref:** `SPEC-per-discipline-periodization.md §13.1` (the builder's strength contract — the target vocabulary), `ArcSetupWizard.tsx:2142-2361` (the tri intent-role step), `PlanWizard.tsx:2242-2368` (the named-protocol picker to match), `selector.ts` (`resolveStrengthProtocolForGoal` — the sport-aware resolution), D-210.

---

## Q-085 — Recent-history posture suggestion (advisory nudge in the posture step)

- **Status:** filed 2026-06-27 · **future, advisory-only; does NOT block Cut D.**
- **The idea:** in the non-race builder's posture step, optionally surface a soft nudge from recent training history — e.g. *"no swim logged in 8 weeks — set swim to maintain or out?"* — a **suggestion the user can accept, never an override**. The discipline list + postures stay user-controlled.
- **The boundary:** **declared baselines (`user_baselines.disciplines`) remain the source of truth** for which disciplines exist (Cut D wires this). This nudge is an **advisory layer on top** — declared-vs-demonstrated: the athlete *declared* swim, but hasn't *demonstrated* it recently, so gently ask. Never auto-flip a posture.
- **Cross-ref:** Cut D posture step (`NonRaceBuilder.tsx`), `seedFromGoal` (the seed it would nudge), the declared-vs-has-data distinction (Q-070, `TrainingBaselines.tsx:861`), `athlete_snapshot` / recent session history (the signal source).

## Q-086 — Live strength baselines: wire the observed-1RM feedback loop

- **Status:** filed 2026-06-27 · **future; the strength-side twin of the run pace-reconciler disconnect.**
- **The gap:** strength baselines (the 1RMs the engine anchors %1RM loads to) should **update from actual logged lifting** — get stronger → the baseline rises → the next block builds off the new number. Today this is **disconnected**: the observed-1RM estimator exists (Epley/Brzycki, `compute-adaptation-metrics/index.ts:94`, `compute-facts/index.ts:119`) and writes `estimated_1rm`, but that output **does not flow back into `user_baselines` / `ProtocolContext.userBaselines`** — so the next prescription anchors to the same static 1RM. This mirrors the run reconciler's sec/km↔sec/mi dead-end (CLAUDE.md "Pace-unit footgun").
- **Why it matters:** **5×5's linear progression assumes a real, live anchor** (`SCIENCE-5x5-linear-progression.md §5.5` Rule 1 — "reads the body"). Without the loop, the anchor never moves; wiring it makes baselines live and the progression honest.
- **Cross-ref:** the 5×5 work (Cuts 1–4; `five-by-five.ts`), the strength audit's `context.history`-unused finding, Q-083 (the cadence-engine, which also needs the loop), the run pace-reconciler disconnect (D-033 / `science.ts:110`).

---

## Q-087 — `strength-overlay.ts:620` deletes the upper session from "Upper Aesthetics" at freq 2 (legacy run wizard) — real latent bug

- **Status:** filed 2026-06-27 · **real bug, NOT on the non-race builder's path** (it routes through the combined plan, no filter). Affects the **legacy `generate-run-plan`** path.
- **The bug:** `generate-run-plan/strength-overlay.ts:619-624` strips `UPPER_STRENGTH`/`UPPER_MAINTENANCE` whenever `protocol.id === 'upper_aesthetics' && frequency === 2`. Since `upper_aesthetics` at freq 2 emits exactly Lower(Mon) + Upper(Wed) (`upper-priority-hybrid.ts:85,88`), the filter leaves **one lower-maintenance session/week and zero upper** — a protocol literally named "Upper Aesthetics" emitting no upper work. The filter fires unconditionally on `id + frequency`, with no check that endurance is actually present (it was meant for the concurrent run case: when only 2 strength slots exist around running, cover legs). A run athlete who picks "Upper Aesthetics" at 2×/wk gets the one thing the name promises deleted.
- **The fix:** gate the filter on "endurance actually present / this is a concurrent run plan," or drop it. Verify against the legacy run wizard.
- **Cross-ref:** `strength-overlay.ts:620`, `upper-priority-hybrid.ts:62-99`, the standalone-strength audit, `SPEC-per-discipline-periodization.md §13.1` (which is why the builder defaults to 5×5, not upper_aesthetics).

## Q-088 — Standalone-strength frequency gap: the system caps strength at 2–3×/wk (built concurrent), no 3–4-day block

- **Status:** filed 2026-06-27 · **SCOPED + BUILT + ENGINE PROVEN LIVE 2026-06-29 (D-220); producer-emission + UI fader still owed.** The freq-4 U/L/U/L lane is **proven on the deployed `generate-run-plan` v146**: a service-role preview (`/tmp/q088-freq4-live.py`) with `strength_frequency:4` + `strength_focus_build` + `endurance_posture:maintain` returns 4 sessions U/L/U/L on 4 distinct days (Upper-A Bench/Row, Lower-A Squat/RDL, Upper-B OHP/Pull-Up, Lower-B Squat/Deadlift); `endurance_posture:develop` clamps to 3 — the frequency policy gate, live-confirmed. **Lock 4 (live-probe-found):** `validation.ts:78` hard-capped `strength_frequency` at `[0,1,2,3]` → 400'd freq-4 before the policy ran; widened to include 4 (v146). **Remaining for full e2e:** (1) capture create-goal's runtime request emission (producer logic + wiring deployed, not yet live-captured — needs a user JWT); (2) the **UI fader** (nothing in the UI selects the strength-focus mode / supplies the budget yet — engine-first, like E3b). Routing **confirmed run-path** ((b)-run fork, not combined). Audit `AUDIT-strength-frequency-concurrent-matrix-2026-06-29.md`; shape/scope/lanes decided. **Shape:** U/L/U/L 4-day container (structure only). **Scope:** endurance-posture gate — `develop` → ≤3 (tri 2), `maintenance`/`parked` → may reach 4 — a strength-focus plan MODE, not a standalone carve-out. **Lanes:** build (`five_by_five` lineage, net-new split content) + power (`performance_neural` lineage, rebalanced to even U/L/U/L). **Run-path first; no optimizer 4th-day placer this cut.** Implementation (audit Tier 1.3 builders) NOT started. Original framing below kept for history.
- **The gap:** the whole `shared/strength-system/` was built for **hybrid/concurrent** athletes (strength as a 2-session slot around endurance). `ProtocolContext.strengthFrequency` is typed `2 | 3` (`types.ts:88`), the run path allows `0|2|3` — **no 4**, and at freq 3 the extra day is *another lower* (`upper-priority-hybrid.ts:93`), never a 4-day upper/lower split. `five_by_five` deliberately caps at 2 too (the endurance-adapted dose). So a **pure strength block** (everything else out, strength develop) maxes at 2 full-body sessions — defensible (each pattern ~2×/wk via 5×5 A/B) but **below the 3–4 days a textbook standalone strength block wants**. The builder hardcodes `strength_frequency: 2` with no UI control.
- **Why it's not a quick fix:** the frequency cap is woven through the protocol modules, the `ProtocolContext` type, and the week-builder; raising it touches **every strength cell** (concurrent + standalone), not just pure-strength. The concurrent-matrix audit (DONE — `AUDIT-strength-frequency-concurrent-matrix-2026-06-29.md`) mapped this: the cap is layered 5-deep (the real one is the protocol `createWeekSessions` builders + `week-builder.ts:strFreqForPhase`, which returns ≤2/phase), so D-220 chose to consolidate toward one owned frequency policy rather than thread the literal everywhere.
- **Cross-ref:** `AUDIT-strength-frequency-concurrent-matrix-2026-06-29.md` (the full edit list, by tier), D-220 (shape/scope/lanes), `ProtocolContext.strengthFrequency` (`types.ts:88`), `upper-priority-hybrid.ts:62-99`, `five-by-five.ts:88-92` (the 2× cap), `SCIENCE-5x5-linear-progression.md §1` (2× is endurance-adapted; standalone wants more), Q-086 (the live-1RM loop, also strength-system debt).

## Q-089 — `runStrength` emits `sessions[0]` twice, never `sessions[1]` — the dominant non-race-builder bug (also a live event bug)

- **Status:** filed 2026-06-27 · **the real blocker for the builder's strength-develop story; also degrades live event run plans. Higher priority than Q-088.**
- **The bug:** `generate-combined-plan/session-factory.ts:runStrength` (~:2549) does `const chosen = sessions[0]` — **no `sessionIndex` param**. `triathlonStrength` (~:2480) correctly does `sessions[Math.min(idx, len-1)]`. All 3 run-strength call sites (`week-builder.ts:1897/1972/2038`) pass no index, so **both weekly strength slots emit `sessions[0]`; `sessions[1]` is never emitted.** In any 2×/week run-path strength block (the base/rebuild phases; build/RS are 1×), the second session is a duplicate of the first.
- **What it breaks (the concurrent-matrix audit):** every run-path strength-**develop** cell is BROKEN — `five_by_five` → Workout A twice, no B (OHP/deadlift absent); `upper_aesthetics` → Lower-maintenance twice, the Upper "gains" session never emitted; `neural_speed` → Lower twice, Upper never; `durability` → Lower-A twice, no Upper-Posture. Strength-**maintain** cells are thinned (lower-only in base). The **tri path is immune** (`triathlonStrength` is index-aware) — which is exactly why the `five-by-five-integration.test.ts` (tri-only) stayed green while the run path ships half a week.
- **Scope caution — it's SHARED, not builder-only:** the fix (thread `sessionIndex` into `runStrength` + the 3 call sites, mirror `triathlonStrength`) also changes **live event run plans** (which currently get the duplicated `sessions[0]` too). It is a bug fix, but **not byte-identical for events** — needs a deliberate cut with the event-path change acknowledged + the run path added to the integration test (assert two distinct sessions).
- **Cross-ref:** `session-factory.ts:2549` (`runStrength`) vs `:2480` (`triathlonStrength`), `week-builder.ts:1897/1972/2038` (call sites), `five-by-five-integration.test.ts` (tri-only — the gap), the standalone-strength audit, Q-088 (the frequency gap — downstream of this; fix the duplicate first).

## Q-090 — minimum_dose intensity: recovery-economy tradeoff vs the literature's intensity-preservation

- **Status:** filed 2026-06-27 · **documented divergence, future tuning question (not a bug).**
- **The divergence (from `SCIENCE-minimum-dose-maintenance.md §3`):** the strength-maintenance literature (Bickel 2011, Spiering 2021) optimizes by **preserving intensity** — keep lifting heavy, cut volume hard. `minimum_dose` instead uses **moderate intensity (~60–73% 1RM, RIR 3–4)** to minimize recovery cost for an athlete spending their budget on endurance. So it's a **conservative "won't lose much" hold, not the intensity-preserving maintenance the literature optimizes.**
- **The question:** add a **heavier maintenance variant** (higher load, lower volume — literature-optimal) as an option, OR keep the moderate-intensity version as the deliberate time/recovery tradeoff? It's a real fork: literature-optimal maintenance vs minimal-recovery-cost maintenance serve different athletes.
- **Cross-ref:** `SCIENCE-minimum-dose-maintenance.md` (the flag), `minimum-dose.ts` (the protocol — currently excluded from the runtime allow-list), Q-088 (the broader strength-frequency/dose architecture).

---

## Q-091 — E3b budget-anchored volume: the deferred wiring to make it reachable + complete

- **Status:** filed 2026-06-28 · **deliberately deferred, not bugs** (the engine is built, committed, pushed, proven live — D-219 — but unreachable until these land).
- **The deferrals:**
  1. **Faders supply the budget.** The engine consumes `weekly_hours`, but it arrives from `training_prefs.weekly_hours_available`, which the intake faders (`src/lib/non-race-intake.ts allocateTime`) don't set yet. Tonight the budget was *injected* (preview probe). Until the faders are wired (and the builder linked from GoalsScreen — still URL-only at `/goals/build`), a real plan falls to the legacy no-budget tables. **This is why E3b is NOT deployed** — engine-first, deploy when there's a real source.
  2. **Completion-race volume move (SPEC §7).** E3b is non-race only; the race path (`create-goal generateBody`) doesn't pass `weekly_hours`, so completion races still use the legacy table. Moving them is a thread + guard-test (D-216 pattern).
  3. **Budget-drives-day-count lever.** `EASY_SLOTS = 3` mirrors the Mon/Wed/Fri grid; a big budget trips the glass-box flag instead of adding days. "More hours → more days" is the real resolution — a later lever, deliberately not baked as fixed-forever.
  4. **Bike consumes `rideHrs`.** Computed + threaded now (run-only → 0); no bike engine yet.
- **Cross-ref:** D-219, `SPEC-e3b-bottom-up-volume.md`, `ISLANDS-ORIENTATION.md`.

---

## Q-092 — Admin "Import JSON Plan → plans" runs on the LEGACY library lineage, not the current goal/token engine

- **Status:** filed 2026-06-28 · the import-lineage seam is **unverified + low-priority** (only matters if admin imports get pursued). The **Hyrox / hybrid-session half is PARKED (2026-06-29) — explicitly NOT a concern, do not chase** unless Michael revives it (memory `project_hyrox_parked`).
- **The seam:** the admin importer lands a pre-made plan in `plans` and maps it onto the user's baselines via the **older library infrastructure** (`src/services/plans/` — `normalizer.ts`, the `bake`/templates/pools system, `universal_plan.schema.json`), which **predates** the goal engine + the edge `materialize-plan` token expander. Tonight's hand-authored Hyrox week was verified (tokens, `strength_exercises`, bare-load passthrough) against **`materialize-plan` (the current engine)** — those guarantees **may not transfer** if the legacy library mapper materializes it instead. Untraced.
- **The question:** when an admin-imported `plans` row is assigned/materialized onto baselines, which mapper fires — legacy `src/services/plans/` or edge `materialize-plan`? Resolve empirically (assign it, inspect the materialized week) before trusting hand-imported plans, or trace the library path.
- **Related modeling gap (Hyrox / compromised circuits) — PARKED, do not pursue:** one session = one discipline (ingest routes to a single analyzer; `computed.steps` is single-discipline). A run↔strength interleaved circuit has **no first-class home** — the inter-station runs materialize as run intervals with strength crammed into "rest" + prose, or flip to strength-primary and the runs drop to prose. A true hybrid/circuit primitive (interleaved steps + transitions, Garmin-multisport-shaped) is a real feature, not a hack. Tonight's Hyrox JSON is staged at `~/Desktop/hyrox-week-hack.json` (valid JSON) — a contained, labeled one-off, NOT a library template.
- **Cross-ref:** `src/services/plans/normalizer.ts`, `materialize-plan/index.ts`, `scripts/bake-one.mjs`, D-219.

---

## Q-093 — Non-race run strength silently downgrades to `durability` — TWO stacked locks (pre-existing prod bug, PROBE-CONFIRMED 2026-06-29)

- **Status:** filed 2026-06-29 · **THREE locks (live probe found the 3rd) → all FIXED + DEPLOYED → engine PROVEN LIVE.** `generate-run-plan` **v145**, `create-goal` **v224**. **Code re-verified present 2026-07-04** — all 3 Q-093-tagged fixes in source: Lock 1 `create-goal…index.ts:2500` (`runRetestBody.strength_tier = commercial_gym ? 'strength_power' : 'injury_prevention'`), Lock 2 `selector.ts:114` (`five_by_five` ∈ `RUN_CENTRIC_STRENGTH_PROTOCOL_IDS`), Lock 3 `validation.ts:97-99` (`validProtocols` ⊇ `five_by_five` + freq-4 lanes). **STILL OPEN on ONE documented sliver:** the create-goal runtime request-EMISSION shape was never captured on a live HTTP round-trip (construction logic is source-verified + logged at `:2526`, but needs a real user JWT + barbell baseline + goal insert to eyeball the emitted `strength_tier`). Engine half done; the create-goal emission live-capture is the remaining close-out. The live deployed engine now emits real **5×5 (Workout A: Back Squat/Bench/Row · Workout B: Back Squat/OHP/Deadlift)** when the request carries `strength_tier:'strength_power'` + `strength_protocol:'five_by_five'`, and **durability** without the tier — proven by a service-role preview probe against the deployed function (`/tmp/q093-live.py`, account `claudemore@test.com`, no DB write). The local probe + guard tests all passed yet the live path still 400'd on Lock 3 — **the score that lies**: only the deployed round-trip caught it.
  - **Remaining sliver (NOT the engine):** create-goal's *runtime request emission* wasn't captured live (create-goal needs a real user JWT; couldn't mint one). Its construction LOGIC is proven (`resolveStrengthEquipmentTypeForPlan`: barbell/compound-1RM → `commercial_gym` → `strength_power`; bodyweight → `injury_prevention`), and the wiring is deployed (v224) — but the actual emitted request isn't yet eyeballed. A full create-goal round-trip (needs a user token + a barbell baseline + one goal insert) closes it.
- **The probe found TWO independent locks (the static trace had only caught Lock 1):**
  - **Lock 1 — the tier gate.** `runRetestBody` (`create-goal…index.ts:2378`) sends `strength_protocol` + `strength_frequency` but **NOT `strength_tier`/`strength_intent`**. `generate-run-plan` honors a protocol only at `tier === 'strength_power'` (`generate-run-plan/index.ts:271`: `protocolId = (tier==='strength_power' && request.strength_protocol) ? … : undefined`). No tier → defaults to `injury_prevention` → `protocolId = undefined` → resolver falls to `durability`. **Affects every developer.**
  - **Lock 2 — the registration gap (probe-found).** Even with `protocolId` correctly threaded (gate bypassed in the probe CONTROL), **`five_by_five` is NOT in `RUN_CENTRIC_STRENGTH_PROTOCOL_IDS`** (`selector.ts`), so `resolveStrengthProtocolForGoal` (sport `run`) **coerces `five_by_five → durability`**. Probe output: `five_by_five → durability ⚠ COERCED`; `neural_speed → neural_speed`; `strength_focus_build/power → themselves`. **Asymmetry:** `neural_speed` and the freq-4 lanes `strength_focus_build/power` are already registered (resolve correctly); only the **seeded `five_by_five` default trips both locks** — which is why the §13.1 standalone default never actually ships.
  - **Lock 3 — the HTTP validation allowlist (LIVE-probe-found; local tests bypass it).** `generate-run-plan/validation.ts:90` has its OWN `validProtocols = {durability, neural_speed, upper_aesthetics}`, enforced **only when `strength_tier === 'strength_power'`** — so the moment the Lock-1 fix threads `strength_power`, the validator **400s** `five_by_five` (and would 400 `strength_focus_build/power`). This is a THIRD copy of the protocol list (selector canonical + RUN_CENTRIC + here). Every local proof bypassed it (they call internal functions, not the HTTP handler), so it only surfaced on the deployed round-trip — and briefly turned the silent durability downgrade into a hard 400 between the v224 create-goal deploy and the v145 validation fix.
- **The fix (THREE locks — APPLIED + DEPLOYED):** (1) `create-goal…index.ts` `(b)-run` block resolves equipment (narrow `user_baselines` fetch) → threads `strength_tier`/`strength_intent`/`equipment_type` into `runRetestBody`: barbell → `strength_power` (developer honored), bodyweight → `injury_prevention` (durability, correct + byte-identical) — clears Lock 1. (2) `five_by_five` added to `RUN_CENTRIC_STRENGTH_PROTOCOL_IDS` (`selector.ts`) — clears Lock 2. (3) `five_by_five` + `strength_focus_build/power` added to `validation.ts:90` `validProtocols` — clears Lock 3. Guard test asserts byte-identical resolver for `neural_speed`/`durability`/`upper_aesthetics`/the freq-4 lanes; 124 deno tests green; **live deployed probe emits 5×5**. **Consolidation owed:** the protocol list now lives in THREE places (selector canonical, RUN_CENTRIC, validation) — a fourth bug waiting; unify to one source.
- **Fidelity note:** the probe ran the **real** resolution + overlay code with the **verbatim** tier gate, but the `runRetestBody` shape was **read from source**, not captured from a live create-goal HTTP round-trip → **verify the request shape on deploy** (a create-goal preview run) to fully close the loop.
- **Cross-ref:** `create-goal…index.ts:2378` (runRetestBody), `generate-run-plan/index.ts:266-273` (tier gate), `selector.ts` (`RUN_CENTRIC_STRENGTH_PROTOCOL_IDS` + `resolveStrengthProtocolForGoal`), Q-088 (downstream), D-220, D-218 (the `(b)-run` fork), `scratchpad/q093-probe.ts`.

---

## Q-094 — `performance-neural.ts` emits `intent: 'LOWER_HYPERTROPHY' as any` — not a valid `StrengthIntent`; throws in `isUpper/isLowerIntent`

- **Status:** filed 2026-06-29 · **latent bug surfaced building Q-088's power lane. The `as any` cast is the tell.**
- **The bug:** `createBaseHypertrophyLower` (`shared/strength-system/protocols/performance-neural.ts:162`) sets `intent: 'LOWER_HYPERTROPHY' as any`, which is NOT in the `StrengthIntent` union / `INTENT_DEFS`. `isUpperIntent`/`isLowerIntent` (`intent-taxonomy.ts:260-261`) read `INTENT_DEFS[intent].category` with no guard → **throws on this intent**. The base/rebuild branch of `neural_speed` emits this session; any consumer that reclassifies it (placement `simple.ts:169-171`) would throw. **(Likely masked in prod by paths that don't reclassify — verify whether neural base-phase placement actually hits it.)**
- **The fix:** either add `LOWER_HYPERTROPHY` to the `StrengthIntent` union + `INTENT_DEFS` (category `lower`), or change the builder to a valid lower intent. Q-088's power lane **sidesteps** it (uses the neural/maintenance lowers), so the freq-4 base-phase hypertrophy ramp is deferred until this is fixed.
- **Cross-ref:** `performance-neural.ts:162`, `intent-taxonomy.ts:13-25` (the union) + `:260-267` (the unguarded readers), `strength-focus-split.ts` (sidesteps it).

---

## Q-095 — `Deadlift` is UNMAPPED in `exercise-role.ts` — D-208 tripwire warns, defaults to `primary`

- **Status:** filed 2026-06-29 · **minor role-table gap; latent because the default is currently correct.**
- **The gap:** `roleForExercise('Deadlift')` (`_shared/strength/exercise-role.ts`) has no `deadlift` key — only `conventional deadlift`, `trap bar deadlift`, `romanian deadlift`. Bare `Deadlift` logs `UNMAPPED … defaulting to 'primary'`. **`five_by_five.ts` emits bare `Deadlift` too** (same latent gap). Default `primary` is correct for deadlift, so scoring isn't wrong today — but the D-208 tripwire is meant to be loud, and a future non-primary default would mis-score.
- **The fix:** add `'deadlift': 'primary'` to `ROLE_TABLE` (fixes `five_by_five` in the same edit). Q-088's build lane sidesteps it by emitting `Conventional Deadlift` (resolves).
- **Cross-ref:** `_shared/strength/exercise-role.ts` (ROLE_TABLE), `five-by-five.ts` (emits bare Deadlift), `strength-focus-split.ts` (uses Conventional Deadlift), D-208.

## Q-096 — Get Strong UI routing → combine — CLOSED 2026-06-30

- **Status:** CLOSED 2026-06-30. Built ≠ reachable until the front door routes right; now it does.
- **Root:** the Get Strong routing block read `tp.per_discipline_posture`, but `tp` was **undefined** in that scope (a local inside `mergeTrainingPrefsWithArcDefaults`, a different function) → ReferenceError on the block's FIRST line, before any gate → EVERY non-race build rolled back (the fast-200 we chased). Found by reading + `deno check` TS2304, NOT logs (the project's Supabase Logs tab never captures console output — confirmed; that's why we were blind all session).
- **Fix:** read `resolvedGoal.training_prefs` (local `gsTp`). Commit `d9057c85`, create-goal **v228**. **Verified:** a UI Get Strong build → `plans` row `config.source = strength_primary` (plan `4d642b43`, goal "Get stronger"). The front door routes Get Strong → `generate-strength-plan`.
- **Cross-ref:** `create-goal-and-materialize-plan/index.ts` (Get Strong block), D-221.

## Q-097 — Strength-primary 1RM write-back — ✅ CLOSED 2026-07-02 (live-confirmed; blocks compound)

- **Status (2026-07-02) — ✅ CLOSED, LIVE-CONFIRMED.** The write-back fires: the baseline-test e1RM reaches `performance_numbers`, verified on device — **bench 160→150 and OHP 110→100 both landed through the app** (via the down-write reconciliation prompt). Blocks compound. The dogfood surfaced five bugs, all fixed (reps-field blocker, down-write prompt superseding D-223's silent hold, RIR removed from test sets, tests-as-a-class, the 0-rep analysis guard). Full arc in **D-227**. Everything below is the historical trail that led here — kept, not deleted.
- **Status (2026-07-02, earlier) — DOGFOOD ATTEMPTED ON DEVICE, TESTER FIX IS NOW THE ACTIVE NEXT TASK.** Michael ran a real bench baseline AMRAP on device: **140 × 3, "4th would have been a grind"** (≈ RPE 9 → e1RM **~151**, which is BELOW his stored 160). The number did **not** flow into his baseline; he wants the **baseline TESTER fixed** so the app adjusts the 1RM from the test. The exact **"freeze" symptom is NOT yet triaged** — next chat MUST ask which: **(a)** the baseline-test screen hangs/freezes, **(b)** "Save baselines" does nothing, or **(c)** it saves but bench stays frozen at 160 (= the e1RM never lands in `performance_numbers`; most likely, this IS the write-back). Then trace `StrengthLogger` → `getBaselineKeyForExercise` → `baselineTestResults` → `saveBaselineResults` and fix in the app. **HARD RULE (new, non-negotiable): NEVER hardcode / direct-DB-write his data — fix the APP path only.** He vetoed a direct PATCH hard ("by the app! do not hardcode anything i do anywhere!!!"); DB access is read-only diagnosis + throwaway-user tests ONLY. See memory `feedback-no-hardcoding-user-data`. (Also still live: the NAMED baseline test seeds weight 0 / blank box — athlete must type the test weight.)
- **Status:** updated 2026-07-01 (D-224) · **[HISTORICAL — SUPERSEDED; Q-097 CLOSED 2026-07-02 per D-227, see top status]** WIRE BUILT + HARDENED, was OPEN pending ONE live confirmation (that confirmation landed: bench 160→150, OHP 110→100). The retest is now **AMRAP** (D-224, replacing the broken fixed-88%×3 estimate that could only log a loss): fixed ~88%, open reps → more reps = the gain. `saveBaselineResults` writes `performance_numbers` with a **ratchet-UP-only guard** (a test may only raise a 1RM) + **OHP-key canonicalization** (`overhead`/`ohp` → `overheadPress1RM`). The RIR gate accepts an AMRAP set at RIR 0–3. Anchor read confirmed the stored keys are clean. **Still OWED: one dogfood build → log a wk12 AMRAP retest → confirm `performance_numbers` updates** (client flow can't be unit-tested). That single confirmation closes Q-097. Do NOT log closed until seen.
- **WIRED (the named cut, 3 surgical `StrengthLogger.tsx` changes, build passes):** (1) `isBaselineTestWorkout` now honors the `1rm_test` TAG, not just the name; (2) a tag-based retest (no lower/upper type) loads its OWN planned exercises and falls through — only *named* "Baseline Test: Lower/Upper" still rebuild the fixed warmup structure; (3) the e1RM compute accepts a near-max SINGLE (RIR 0–3) for tag retests, so the courtesy max-check writes (named baselines stay RIR 2–3, unchanged). On log → `getBaselineKeyForExercise` maps bench/squat/deadlift/OHP → `baselineTestResults` → the "Save baselines" button (`isBaselineTestWorkout`-gated) → `saveBaselineResults` writes `performance_numbers`. **OWED: a live dogfood retest log to confirm `performance_numbers` actually updates** (the client UI flow can't be unit-tested) — that single live confirmation closes Q-097 and makes "blocks compound" real.
- **Traced (definitive):** logging the wk12 retest triple computes an e1RM into `exercise_log.estimated_1rm` (via `compute-facts`), but it **never reaches `performance_numbers`** — the field `materialize-plan`'s `mergeAnchor1RmLb` reads FIRST (e1RM is only a fallback). Three breaks: (1) `isBaselineTestWorkout` (`StrengthLogger.tsx:689`) matches ONLY `name.includes('baseline test')` — the retest is named "Retest — …" → never enters baseline mode → `saveBaselineResults` (the one client path that writes `performance_numbers`) never fires; (2) the `baseline_test` / `1rm_test` / `estimate_1rm` tags have **zero consumers** (the gate checks the name, not tags); (3) **no server path** promotes the strength e1RM → `performance_numbers` (the only such write, `compute-workout-analysis:790`, is swim CSS). So the next block loads off the stale entered max.
- **THE FIX (a named CUT, not a re-diagnosis — the clean first move next session):** honor the **`1rm_test` TAG** in `isBaselineTestWorkout` (tag-match, not name-match) + map the retest lifts (`getBaselineKeyForExercise` already maps bench/squat/deadlift/OHP) → so logging the retest flows through the existing `saveBaselineResults` and **writes the e1RM to `performance_numbers`**. Then "blocks compound" is real.
- **Cross-ref:** `StrengthLogger.tsx` (`isBaselineTestWorkout` / `getBaselineKeyForExercise` / `saveBaselineResults`), `materialize-plan` (`mergeAnchor1RmLb`), `compute-facts` (`exercise_log.estimated_1rm`), `strength-primary-plan.ts` (the retest tags), D-221.

## Q-098 — No bodyweight strength-primary lane — bodyweight Get Strong → `(b)-run` durability

- **Status:** filed 2026-06-30 · **parked follow-up; intentional scope cut.**
- **The thing:** the strength-primary arc (5×5/neural barbell lanes) is barbell-only; the Get Strong routing gates on `commercial_gym`, so a bodyweight athlete's Get Strong falls to the `(b)-run` durability path (correct — can't run the barbell arc). A bodyweight strength-primary lane (calisthenic progressions) is a clean future add on demand.
- **Cross-ref:** D-221, `create-goal…index.ts` (the `gsEquip === 'commercial_gym'` gate), `strength-primary-plan.ts`.

## Q-099 — NEXT ROCK: "Plan Your Week" day-mover (drag sessions across days, science as the rails)
- **Status:** filed 2026-07-01 · **scoped, not built — the next big rock.**
- **The thing:** a touch-native board where the athlete drags the plan's sessions across days; the locked constraints become drag rails (same-day matrix, U/L/U/L, no hard-run-near-heavy-lower, lift-first on stacks). Glass-box on conflict only. **Fully scoped in `CONCEPT-plan-your-week.md`** — honest size **L/XL** (Frame has NO drag code; it's ground-up), recommended v1 = **reschedule-only, mobile-first, alongside intake, optimistic-client + server-authoritative** via a NEW per-move validator over `week-optimizer`. Real dep: the board needs per-week sessions readable + a validated day-move write path. Read the concept doc first.

## Q-100 — NEXT: Get Strong accessory ADD-ONS — pull-ups, glute-building, HYROX/hybrid options
- **Status:** filed 2026-07-01 · **wanted direction, not built.** Add-on menu on top of the Get Strong split (which already carries Pull-Up + RDL/front-squat accessories).
- **Foundation already on disk:** `STRENGTH-PROTOCOL.md:5` explicitly reserved **HYROX/Spartan/hybrid** protocols for **separate docs with their own accessory rotations + selection logic** (do NOT extend the tri protocol doc into them); `STRENGTH-PROTOCOL.md` also carries the **glute/posterior-chain science** (hip thrusts required in lower sessions — Contreras EMG, Distefano single-leg; glute bridges); `SCIENCE-upper-aesthetics-hypertrophy.md` grounds the **upper/pull** add-on.
- **⚠ Reconciliation:** the "Hyrox parked" note referred to a *hand-authored one-off week* (a hack, don't chase THAT). A hyrox **accessory add-on** is a different, legitimate thing — exactly the "separate doc" STRENGTH-PROTOCOL.md anticipated. Treat hyrox add-ons as IN scope going forward.
- **Shape (to spec in the new chat):** an add-on layer (pull-up progressions, glute/posterior block, hyrox/hybrid accessory rotation) that attaches to the Get Strong plan without breaking the concurrent-recovery rules (glute/posterior eccentric volume competes with heavy Lower + long runs — see `STRENGTH-PROTOCOL.md` interference sections). Verify any new citations before baking (verify-before-cite, as always).

## Q-101 — Strength session duration is a flat `60`m literal (never tracks the actual load) — cosmetic, deferred
- **Status:** filed 2026-07-01 · **known-cosmetic, deferred** (blocked on a data-model addition + a cross-protocol convention call — NOT a one-line fix). Traced read-only 2026-07-01; line citations spot-verified.
- **The thing:** every Get Stronger strength session labels **`1h 0m`**, identical across all phases (5×5 accumulate, 5×3 intensify, 2×5 deload, 3×2 peak). It is a bare literal `duration: 60` at `strength-primary-plan.ts:341` inside the phase loop — the loop only varies `sets`/`reps`/`pct`; the `60` is never touched. Two siblings in the same file: `:237` (`60`, wk1 "Baseline Test" sessions), `:203` (`45`, the AMRAP retest week). The *endurance* maintenance sessions DO vary (computed from sport/retest/override) — only the strength sessions are flat.
- **Why it's not a cheap swap (two blockers):**
  1. **No data to compute from.** The working-set type is `StrengthExercise = { name; sets; reps; weight }` (`:41`) — **no `rest_seconds`, no warm-up-ramp structure** (the warm-up is prose only; grep `rest_seconds|warmup_ramp|general_warmup` across the strength system = zero hits). An honest `working_sets × rest_seconds + warmup_ramp + general_warmup` computation needs new fields + a warm-up model first.
  2. **It's a convention across the strength surface.** Three literal sites in this composer alone, and this builder deliberately does NOT share the overlay protocols (`strength_focus_power` et al. carry their own flat durations). Fixing only Get Stronger makes its labels honest while the concurrent/combined strength sessions stay flat — a *new* inconsistency.
- **NOT a blocker for accessory add-ons (Q-100):** because the `60` literal never moves, adding an accessory slot won't change the label. The real session is ~35–45 min at 2–3 min rest, so an accessory lands the athlete near ~50 min — still honestly **under** the flat 60. Add-ons can go on top without making the label a lie; the flat number is cosmetic-safe until real computation lands.
- **Cheapest interim (deliberately-scoped, NOT a slip-in):** vary the `:341` literal by phase, derived from `load.primary.sets`/`reps` with assumed per-phase rest constants (heavy triples rest longer than 5×5). Still an **estimate**, not the "measured" computation — scope it on purpose if wanted; do not slip it in alongside another change.
- **Cross-ref:** `supabase/functions/shared/strength-system/strength-primary-plan.ts:41/48/203/237/341`; `materialize-plan/index.ts` (reads `strength_exercises`, does not recompute `duration`); Q-100 (accessory add-ons — explicitly not a blocker); D-224.

## Q-102 — Pull-Up loads at 1.0×bench via a space-vs-hyphen name miss (two bugs, two protocols) — DO NOT patch before the pull-up-lane loading-model call
- **Status:** filed 2026-07-01 · **real defect, deferred by design.** The loading-*model* question settles WITH the pull-up lane (Q-098 / Q-100), not before — see sequencing below. Do NOT patch either bug now. Traced read-only 2026-07-01; line citations spot-verified (`strength-focus-split` is `:84`).
- **Observed:** Get Stronger Upper B prescribes **"Pull Up 3×5 @ 115 lb"** = `0.72 × 160(bench) × 1.0`; at 90% → 145 (`0.90 × 160`). It keys off the **bench anchor (160)**, NOT its session's main lift Overhead Press (110). Pull Up is not a stored anchor key.
- **Mechanism — two bugs, same root (space vs hyphen):**
  - Composer emits the name `'Pull Up'` (space) with a bare `"72% 1RM"` (`strength-primary-plan.ts:164`); the anchor is inferred from the *name* at materialize-time.
  - **Bug 1 (config miss):** `getExerciseConfig("Pull Up")` normalizes to `"pull up"` and misses the `'pull-up'` bodyweight config (`ratio 0.0`, `displayFormat 'bodyweight'`) that would have rendered **"Bodyweight"** (`exercise-config.ts:710`; lookup `:1067`).
  - Falls to the legacy map: `pickPrimary1RMAndBase` maps pull/row/chin → **bench** (`materialize-plan/index.ts:787` — the space form IS caught here) — bench-scaling for pulls is defensible, not the bug.
  - **Bug 2 (ratio miss):** `getAccessoryRatio('pull up')` (`:704`) checks `pullup/pull_up/chin-up/pull-up` — the **space form is absent** — so it returns the default **1.0** instead of the intended **0.65** discount. Full bench load.
- **The tell that it's a defect, not design:** in the *same* Upper split, **Barbell Row** correctly discounts to **0.80 × bench** (exact config-table match) while **Pull Up sits at 1.00 × bench** — purely because one name has a space and one a hyphen.
- **Blast radius — two protocols, narrow:** the space-form `'Pull Up' + % 1RM` pattern is emitted by both **Program 1** (`strength-primary-plan.ts:164`) and the **concurrent 5×5 `(b)-run` overlay** (`strength-focus-split.ts:84`). All other protocols emit `'Pull-ups'` (hyphen/plural) with **qualitative** weights ("Bodyweight"/"Max reps") → they hit the bodyweight/qualitative branch, unaffected.
- **Why not a cheap fix:** adding `'pull up'` to the two string lists silently flips Pull Up to **either** "Bodyweight" (config match) **or** ~75 lb (`0.65 × 115`) depending on which list you touch — a real periodization behavior change across two protocols through shared resolver internals every strength protocol flows through. Note the unwired canonicalizer `_shared/canonicalize.ts` (`'pull up' → 'pullup'`) is NOT in the load resolver — relevant to any eventual fix.
- **The deeper question + SEQUENCING DECISION:** should a bodyweight lift be `%1RM`-loaded at all? The config's own intent (`'pull-up' → bodyweight`, "add weight when 3×12 is easy") says **rep-based / bodyweight progression** (bodyweight → add reps → then add weight), not a % of someone's bench max — a literal "115 lb Pull Up" is nonsensical as prescribed. **Decision: the loading-model question settles WITH the pull-up lane (Q-098 no-bodyweight-lane, Q-100 pull-up add-on), NOT before** — because the name-match fix and the rep-based fix target **different numbers**. **Fix the model first, then the name-match.**
- **Cross-ref:** Q-098 (no bodyweight strength-primary lane), Q-100 (pull-up add-on); `strength-primary-plan.ts:136-170`; `strength-focus-split.ts:84`; `materialize-plan/index.ts:704-757 / 759-820 / 1618-1721`; `exercise-config.ts:710-746 / 1067-1088`; `_shared/canonicalize.ts`.

---

## Q-103 — Full Hyrox training ENGINE: its own goal-type arc, NOT the accessory bias (parked; decided B 2026-07-02)
- **Status:** filed 2026-07-02 · **parked, deliberate scope cut.** Decided **B** — keep the shipped accessory bias, honestly labeled "movement familiarity." **A** (a real Hyrox program) is recorded here as its own future arc, NOT built.
- **Why (the 4-gap finding):** sample-plan review vs Brandt 2025 found the accessory-bias slot misses four event demands (full detail in `SCIENCE-hyrox-accessory-bias.md §7`): (1) **high-intensity endurance** — the block's runs generate but are all-easy; Brandt needs moderate **and** high intensity; (2) **power/RFD** — none; Schumann 2022 (verified) says concurrent training attenuates power (SMD −0.28) → must be deliberate, CONVENTION (no Hyrox study validates dosing); (3) **fatigued-legs / compromised running** — the signature run→station→run demand, absent; (4) **equipment-gated stations**. Together these make Hyrox a real PROGRAM, not a +1 accessory delta.
- **The build (A), when picked up:** its OWN goal-type arc (the parked-Hyrox lineage of Q-088 — but the hand-authored circuit-week hack is NOT this; this is a real engine), deliberately OFF the accessory-only chassis, with its OWN byte-identical guards: quality endurance (intervals/tempo, accepting the interference cost), a power/RFD slot, a fatigued-legs brick (station→run), equipment-gated stations. **Do NOT bolt it onto `composeStrengthPrimaryPlan`'s accessory mechanism** — it needs its own structure + guards.
- **What stands (B):** the glute accessory bias (a genuine thin delta) + the Hyrox **movement-familiarity** bias (shipped, honestly labeled). The equipment-substitution fallbacks (`substituteExerciseForEquipment`) are wired direction-agnostically (glute + station gear fallbacks).
- **Cross-ref:** `SCIENCE-hyrox-accessory-bias.md §7` (the finding + A/B decision); `ROADMAP-hybrid-strength-addons.md §2b`; Q-088 (parked-hyrox lineage); Schumann 2022 (power attenuation); Brandt 2025 (endurance-intensity requirement).

---

## Q-104 — Hyrox combo: grouped calendar card (phase 2, client bundle — post-Q-097)
- **Status:** filed 2026-07-02 · **client UI, bundled with pieces 2-3 (post-Q-097). Phase 1 (server copy) SHIPPED; phase 2 (this) NOT built.**
- **Phase 1 (DONE, server-side copy):** the Saturday combo pair is retitled so the calendar reads as one session in two parts — run: **"Saturday combo 1 of 2 — Long run"** (desc adds "…loads your legs for part 2 — start the station within ~10 min of finishing"); station: **"Saturday combo 2 of 2 — Fatigued-legs station · start within ~10 min of finishing the run"** (desc keeps "on tired legs, that's the point"). Still two cards; now clearly numbered.
- **Phase 2 (THIS — not built):** a **grouped calendar treatment** — ONE container card titled **"Hyrox combo — one session, two parts"**, a single **total duration** in the header (long run + station, e.g. 2h 30m), **numbered steps** (1. Long run · 2. Fatigued-legs station), a **connector line** between the two carrying the **"↓ start part 2 within ~10 min"** note in the gap, and a link/chain icon. Mock provided in chat (2026-07-02). Renders the two same-day sessions (run-first) as one visual unit.
- **Where:** the calendar/week day-cell rendering. Detect the pair by the `fatigued_legs` + `bias:hyrox` tags on the station + the same-day run; group into one card with two steps. Read-time only (the underlying two sessions stay as they are — this is display grouping).
- **Cross-ref:** `SCIENCE-hyrox-accessory-bias.md §7`; the pieces-2-3 client bundle (gated on the Q-097 dogfood); the Saturday-combo emission in `strength-primary-plan.ts` (run-loop).

---

## Q-105 — Get Stronger "estimated at 10:00/mi" COPY is stale when an easy-pace baseline exists

- **Status:** filed 2026-07-02 · **FIXED at generation 2026-07-02 (copy-only).** ⚠️ My original filing overstated it — **the run DURATIONS already honor a known pace** (materialize re-resolves the easy pace at materialization from `user_baselines`). Michael confirmed on device: *"it's just the copy in the goals section, the runs themselves are honoring in the plan."* So the only defect was the **generation-time blurb** — *"Run durations estimated at 10:00/mi until we learn your easy pace"* — which was baked when `generate-strength-plan` passed `easyPaceMinPerMile: undefined` (never sourced the stored pace), so `paceKnown` was false and the note printed even for an athlete whose pace is known.
- **FIX (shipped):** `generate-strength-plan/index.ts` now resolves the easy pace from `user_baselines` when the caller omits it — `learned_fitness.run_easy_pace_sec_per_km` (sec/km → min/mi) first, then `performance_numbers.easyPace` (unit-aware /mi vs /km) — and passes it to `composeStrengthPrimaryPlan`, so `paceKnown` is true and the note is suppressed. Deployed. **Caveat:** this fixes NEW plan generation only; an EXISTING plan's stored blurb (Michael's current one) stays stale until the plan is regenerated (the durations are already correct via materialize). A client-side dynamic suppression of the stale sentence was considered and NOT built — cosmetic, not worth the read-side baselines fetch.
- **Traced (definitive):** run durations + the copy are both gated on one input, `easyPaceMinPerMile`:
  - `strength-primary-plan.ts:395` `const paceKnown = (args.easyPaceMinPerMile ?? 0) > 0;` → `:396` `pace = paceKnown ? easyPaceMinPerMile : FALLBACK_EASY_MIN_PER_MILE (10)` → `:410` emits the "estimated at 10:00/mi…" note only when `!paceKnown`. So a false `paceKnown` mis-computes durations, not just the note.
  - `generate-strength-plan/index.ts:31/54` sources `easy_pace_min_per_mile` **only from the request body** and passes `undefined` when absent. **There is NO server-side fallback** that reads the athlete's stored easy pace (`user_baselines.learned_fitness` easy pace / `effort_paces` / fiveK-derived) when the client omits it. So a user WITH a known easy pace still lands on the 10:00/mi fallback if the caller didn't thread the pace through.
- **THE FIX (named cut):** in `generate-strength-plan`, when `easy_pace_min_per_mile` is not provided (or ≤0), resolve it from the user's baselines before `composeStrengthPrimaryPlan` — reuse the existing easy-pace resolution (`generate-combined-plan/science.ts:resolveRunEasyPace`, sec/km → min/mi) rather than re-deriving. Then `paceKnown` is true for returning athletes → real durations + the copy drops. Watch the pace-unit footgun (learned_fitness = sec/km, performance_numbers.fiveK_pace = sec/mi — see CLAUDE.md).
- **Cross-ref:** `strength-primary-plan.ts:353/395-396/410`, `generate-strength-plan/index.ts:31/54`, `generate-combined-plan/science.ts:110 resolveRunEasyPace`; pace-unit note in `CLAUDE.md`.

---

## Q-106 — "Spine is truth" is ~6% enforced on the coach + capacity truth is forked (the big next-work item)

- **Status:** filed 2026-07-02 · **PARTIALLY BUILT (reconciled 2026-07-04).** **Step 1 (canonical capacity resolver) is BUILT + wired + acceptance-passed** — `_shared/state-trend/capacity-resolver.ts` (D-231), called on both the prescribe (`materialize-plan`) and judge (`coach/index.ts:2040`/`2346`) paths; this fixed Q-107 **H1**'s baseline-blindness. **Step 2 (move the coach's verdicts onto the spine) is genuinely unbuilt — BLOCKED on Q-109** (the "read the column you already fetch" premise fails for all 5 shadowed columns). D-236 has since advanced the **step-6 ACWR-conformance** piece (ACWR single-authority + `buildBodyResponse` reclassified as fact layer) — ⚠ *whether that fully satisfies Q-109's "read the persisted `body_response`" bar is not verified.* Full evidence: `AUDIT-spine-conformance-2026-07-02.md` (+ synthesis `AUDIT-app-synthesis-2026-07-02.md`).
- **Finding:** the coach reads the cached spine (`state_trends_v1`) for exactly **1 of ~17 verdict families (`fitness_direction`)**; it recomputes readiness/strength/load/body_response/race/goal in parallel from raw data — even shadowing snapshot columns (`acwr`, `strength_volume_trend`, `body_response`, `strength_top_lifts`) it SELECTs and never reads. And there is **no canonical capacity truth:** `materialize` prescribes load off the typed `performance_numbers` (150) while the coach judges off `learned_fitness.strength_1rms` (125) — "train off one number, get judged off another."
- **THE ROADMAP (sequenced, in the audit):** (1) **one canonical capacity resolver** — typed-anchored, learned feeds trend + reconcile-suggestion, raw never truth; both prescribe (materialize) + judge (coach) call it (collapses the 150-vs-125 fork app-wide + State H1/H3 + the sec/km-vs-sec/mi + key-alias footguns). (2) move coach readiness + strength verdicts onto the spine ("read the columns you already fetch, delete the parallel derivation" — the D-151 move). (3) finish Q-097 convergence (done). (4) collapse remaining coach verdicts + the vestigial scalar-trend vocabulary; add a shared capacity/pace type. (5) retire dead layers (Q-108).
- **Concrete visible instance (2026-07-02 State walkthrough) — the headline seam:** the top-line headline "Balanced load, **fatigued** · **fitness climbing** — you're carrying fatigue" concatenates a *parallel-engine* readiness verdict (`fatigued`, coach `readiness_state`, `coach/index.ts:2767-2788`, self-computed ACWR) with the *one spine* verdict (`fitness climbing`, `rollupFitnessDirection(state_trends_v1)`). Coherent today, but nothing guarantees the two engines agree — when they diverge the headline says two contradictory things. This is the readiness-onto-spine move (roadmap step 2) made visible; fold into the same round.
- **Cross-ref:** D-230, D-232 (glass-box display standard), D-149/150/151/213; the pace-unit footgun (CLAUDE.md).

## Q-107 — State screen: the "score-that-lies" fix list (visible symptom of Q-106)

- **Status:** filed 2026-07-02 · **PARTIALLY RECONCILED 2026-07-04.** Full catalog: `AUDIT-state-screen-2026-07-02.md` (H1–H4, M1–M4, L1–L3, ranked). Per-item status below.
- **H1 — ✅ FIXED (D-231 resolver); end-to-end render CONFIRMED 2026-07-04.** The bench row is no longer baseline-blind: the 150 anchor flows `resolveStrengthCapacity` (`coach/index.ts:2346`, `anchor1rm = cap.source==='typed' ? cap.value`) → `per_lift.anchor_1rm` (`:2358`) → `response-model/weekly.ts` where the verdict (`:230 computeLiftVerdict(…, anchor_1rm, best_weight)` — de-alarms on headroom) AND the suggested weight (`:249 computeSuggestedWeight(…, anchor_1rm)` — bounded by the anchor) both consult it → `StateTab.tsx:1526` renders "Working ~125 vs your 150 baseline — suggest 115". `COACH_PAYLOAD_VERSION` bumped to **v47** specifically to recompute cached baseline-blind rows (so the live screenshot is the anchor-aware row, not stale); fixture `weekly-strength-verdict.test.ts`. The residual "suggest 115 / back off" *tone* being context-blind (ignores the just-finished marathon block + active rebuild plan) is **Q-111**, NOT baseline-blindness.
- **H3 — ✅ RESOLVED (intentional/cosmetic, per Q-111 point 8, 2026-07-03).** The two "STRENGTH" rows are different granularity (discipline-trend eligibility row vs lift-level insight), different data, no shared computation — NOT a dual-path duplicate. Only the shared "STRENGTH" label reads as a dup at a glance; relabel/merge is a cosmetic call (`StatePerformanceSection.tsx:142`).
- **H4 — OPEN (the canonical owner; Q-120 collapsed here 2026-07-04).** RACE readiness fires on `has_active_plan` / ≥1 run in 6 wk — NOT on a SET race goal — and defaults to marathon (`marathon-readiness`, bundled into `coach`; `coach/index.ts:4935` sits OUTSIDE `if (activePlan)`; `distKey = planCtx?.raceDistance || 'marathon'`). So a no-goal / hybrid athlete gets a marathon-readiness verdict against fabricated 18 mi / 35 mpw targets, and `DISTANCE_DEFAULTS` is running-races-only (no 5K/Hyrox). It also collides with the goal-gated `race-readiness` system (`computeRaceReadiness`) the coach already imports — a legacy duplicate. **Fix (design-before-build):** gate on a set goal (no goal → "set a race goal to see readiness", matching the RACE section) + assess against THAT distance + suppress for non-running goals; reconcile-or-retire the two readiness systems. Tracked as a known guard exception (`estimate-provenance.config.json`, ticket id "Q-120" → this item).
- **Still open (unchanged):** **H2** — a strong test raises nothing (unbuilt test excluded; `previous_e1rm` hardcoded null; 0-RIR test *falsely* triggers back-off). **Quick wins:** swim-rest provisional tag (M1), delete the `×1.1`/phantom `peak1RM` dead code (L1/L2). **Verify:** "feels 1.2 harder" (M4) — trace to narrative vs RPE-ratio.
- **Cross-ref:** Q-106, Q-111 (H1 tone residual), Q-120 (H4), D-230, D-231.

## Q-108 — Retire the accreted dead layers (orphans + hygiene flags from the audit)

- **Status:** filed 2026-07-02 · **cleanup, deferred.**
- **Items:** `context/CoachWeekTab.tsx` (orphaned since 2026-03-31; got 3 months of edits after — delete or fold its link-extras / adapt-plan accept-dismiss into StateTab; the coach hook still merges `plan_adaptation_suggestions`/`baseline_drift_suggestions` it never renders); `context/BlockSummaryTab.tsx` (orphaned but ⚠ the ONLY reader of `block_verdict` per D-212 — **extract that signal into StateTab first, then delete**); the vestigial scalar-trend columns (`strength_volume_trend`/`rpe_trend`/`run_easy_pace_at_hr_trend`) that `longitudinal_signals` reads while `state_trends_v1` is the newer verdict; `disconect-connection` (typo'd deployed edge fn, primary/fallback pair in Connections); `GarminPreview` hardcodes the anon key instead of the shared client; `AppLayout`'s dead `usePlannedWorkouts` import for the calendar.
- **Cross-ref:** `SCREEN-CONNECTIVITY.md` §9 + hygiene flags, `SCREEN-INVENTORY.md` §6/§9, D-212.

## Q-109 — The step-4 "read the columns you already fetch" premise does NOT hold as a drop-in (deviation, blocks the mechanical migration)

- **Status:** filed 2026-07-02 · **deviation surfaced mid-implementation; migration paused for a design call.** The Q-106 roadmap step 2 (and D-230) framed moving the coach onto the spine as a mechanical *"read the cached column, delete the parallel derivation"* (the D-151 move). A pre-edit trace of the 5 shadowed columns shows that framing is an **oversimplification for all 5** — none is a safe drop-in swap.
- **Evidence (trace, `coach/index.ts`):** the only `latestSnapshot.*` reads are `state_trends_v1` (2728/4335), `interference` (3154), `intensity_distribution` (4175). The 5 SELECTed-and-unread columns (2715) break down as:
  - **`acwr` — NOT a swap; it's a *richer* engine on the coach side.** The coach computes a per-discipline, interference-weighted ACWR system: `unweightedAcwr` drives the whole readiness ladder (`body-response.ts:722-818`), plus `running_acwr`/`cycling_acwr` (3281, 4947) + `disciplineProfiles` (2107, 3327), over a **7d/28d daily-normalized** window. The snapshot `acwr` column is a **single scalar** over a **weekly-total-vs-4wk-avg** window (`compute-snapshot:366-368`). Reading it would REGRESS readiness (lose per-discipline + interference). The per-discipline ACWR the coach actually needs lives in the **persisted `body_response.load_status`** (`running_acwr`/`cycling_acwr`, `body-response.ts:565-566`) — so **ACWR conformance is coupled to step 6 (retire `buildBodyResponse` → read persisted `body_response`), not an independent step-4 item.** **UPDATE 2026-07-04:** D-236 has since done the step-6 ACWR **single-authority** work (`_shared/acwr.ts`, `buildBodyResponse` reclassified as the deterministic fact layer, coach D/E repointed onto the shared `weightFn`) — this advanced exactly this coupled piece. ⚠ *Whether it fully satisfies the "coach READS the persisted `body_response` instead of recomputing" bar (vs. just sharing one authority) is not verified — needs a trace before marking the ACWR half of step 2 done.*
  - **`rpe_trend`, `run_easy_pace_at_hr_trend`, `strength_volume_trend`, `strength_top_lifts` — genuinely fetched-and-never-read, but not swappable.** The coach's corresponding signals are **differently shaped**: RPE is a *categorical* reaction model (`endur.rpe.trend` = 'declining'/'rising', 5024), strength is *per-lift* off `learned_fitness` (1969/2275) + self-built `strengthEntries`/`strengthLiftMaxes` (4100/3242) — not the snapshot's numeric pct-trend / top-lift-map shapes. "Read the column instead of recomputing" here means **rewiring the consuming verdict logic (categorical→numeric, per-lift→volume-scalar), which changes verdict semantics** — design work, not a mechanical deletion. (Overlaps Q-108's "vestigial scalar-trend columns" call.)
- **The only strictly-safe mechanical action available now:** remove the 4 truly-dead columns from the SELECT (waste cleanup, not a conformance win). Everything else is a real rewire.
- **Implication for sequencing:** step 4 as written (independent mechanical swap) is not viable. ACWR → fold into step 6. `strength_top_lifts`/strength verdict → fold into step 5 (the capacity resolver already owns "top lifts / how strong"). RPE + easy-pace trend → a genuine "move the endurance signal onto the spine" design task (new sub-item, not a deletion). **Awaiting a design call on whether to (a) do the SELECT-waste cleanup now + resequence the real migrations under steps 5/6, or (b) design the endurance-signal-onto-spine rewire as its own step.**
- **Cross-ref:** Q-106 (roadmap step 2), Q-108 (vestigial trend columns), D-230, D-231, D-151; `AUDIT-spine-conformance-2026-07-02.md` §3/§5.

## Q-110 — Move the coach's RPE-trend + easy-pace-trend signals onto the spine (shape-mismatch design task, split out of Q-109)

- **Status:** filed 2026-07-02 · **design task, not started — do NOT improvise the rewire (Michael, explicit).** Split out of Q-109 when the step-4 "read the column you already fetch" mechanical swap proved non-viable for these two.
- **The shape mismatch (why it's design, not a swap):**
  - **RPE:** the spine column `athlete_snapshot.rpe_trend` is a **numeric pct-change** vs the 4-week norm (`compute-snapshot:378`, `pctChange`). The coach's RPE signal is **categorical** — `endur.rpe.trend` = `'declining'`/`'rising'` from the raw-workouts reaction model (`coach/index.ts` ~5049, `response-model`). Wiring the coach onto the column means either deriving the categorical verdict FROM the numeric column (new thresholds → new semantics) or teaching consumers to read the pct — a verdict-logic rewire, not a read swap.
  - **Easy-pace:** `run_easy_pace_at_hr_trend` is a **numeric pct** on the spine (lower = faster = improving, D-043); the coach has **no consumer at all** — it was purely a dead fetch. Wiring it is net-new signal design (what verdict should it drive, and where), not a migration of existing logic.
- **What already happened (don't re-do):** both columns were **dropped from the coach SELECT** in the Q-109 step-4 cleanup (`coach/index.ts` ~2735) — that removed the dead fetch + projection footgun; it did **not** wire them. This Q is the wiring.
- **Design questions owed:** (1) is the spine's numeric `rpe_trend`/pace-trend the intended source of truth, or does the coach's categorical reaction model become the spine's truth (like the ACWR call in Q-109 — richer derivation promoted to the spine, written once)? (2) if the columns win, what thresholds map pct → verdict without contradicting the reaction model? (3) does easy-pace-trend get a surfaced verdict or stay longitudinal-only (it overlaps `longitudinal_signals`, Q-108)?
- **Cross-ref:** Q-109 (parent), Q-106 (roadmap), Q-108 (vestigial scalar-trend columns / `longitudinal_signals`), D-230, D-231, D-151; `AUDIT-spine-conformance-2026-07-02.md` §3/§5.

## Q-111 — Plan-aware, history-aware strength verdicts (tone must consult goal/plan + training history)

- **Status:** filed 2026-07-02 · **design task, DO NOT build yet — sequenced AFTER the current capacity-resolver wiring passes acceptance.** Builds on the capacity resolver (D-231) + the coach's existing plan-context reads.
- **SCOPE UPDATE 2026-07-04 (Option B slice + §1 descope):** the active build is a small bundle — **§5 mixed-clocks** (headline declares its time-scope; independent, no read) + **§2 novelty = VERIFY-only** (already shipped, coach v56/57/58 + the `:2809` read). **§1 (plan/history-aware tone) is ❌ DESCOPED** — it kept collapsing onto a rare edge case (declining strength + no plan + unplanned, an artifact of the current no-plan account), low value vs effort. **Principle kept, no code:** a strength verdict must not infer a flattering cause it can't verify ("down because you raced"); when it can't tell detraining from block-recovery, **state the fact, don't editorialize** — and no fabricated "back off" prescription on an unexplained decline. Full record: `docs/DESIGN-Q111-plan-history-aware-verdicts.md` §1. §3/§4/§6–§10 remain deferred.
- **The requirement:** the State strength verdict must consult **goal/plan context and training history before choosing tone.**
  - A strength **decline during or after an endurance-dominant block** (e.g. marathon prep — present in the athlete's logged history + Race record) **when an active strength rebuild plan exists** (current "Get Stronger", Week N of 12) narrates as **expected-and-addressed**, e.g. *"Bench down ~10% over the marathon block — expected. Rebuild started, Week 1 of 12."*
  - **Alarm tone is reserved for declines with NO plan addressing them.**
- **Self-explanatory row (My Record suggestion pattern):** every strength row must say **what we measured, versus what, and the action** — never a bare **"125 → 115 lbs."** (This is the exact acceptance-fail symptom below — the current row is a baseline-blind, context-blind RIR verdict; see the 2026-07-02 diagnosis.)
- **Why:** a "back off"/decline verdict that ignores the fact the athlete just finished a marathon and deliberately started a rebuild block is the "score that lies" telling the athlete they're failing at exactly the thing the plan is handling. Tone without plan/history context is misinformation.
- **Dependency + sequence:** needs (1) the D-231 resolver landed (typed-anchored capacity), (2) the coach's plan-context reads (`planConfig`, week intent, `strength_protocol`, goal/Race record) threaded into the verdict, (3) history signal (endurance-dominant block detection). **Do not start until the current wiring fix passes acceptance.** ✅ Wiring passed acceptance 2026-07-02.
- **Consolidated design inputs (2026-07-02 State walkthrough) — the round works WITHIN the extended D-232 (row receipt → "open for more" breakdown → provenance) and must address all of these ONCE, coherently:**
  1. **Plan/history-aware tone** — a decline during/after an endurance-dominant block *with an active rebuild plan* narrates as **expected-and-addressed**, not alarm (the original Q-111 requirement). Detection: marathon-block from logged history + Race record; active rebuild from `planConfig` (Get Stronger, Week N of 12).
  2. **The headline's mixed clocks** — the top line concatenates a **this-week** verdict (RPE `FATIGUED`) with **6-week** trend verdicts (`fitness climbing`, run/bike improving). **Every verdict must declare its time-scope** so "carrying fatigue" (this week) and "improving" (6 wk) can't read as one contradictory now-statement.
  3. **H3 — the two contradictory STRENGTH rows** (top spine `state_trends_v1` = "needs data · N unplanned" vs bottom coach `per_lift` = confident "Working ~125 vs 150"). Reconcile which strength verdict the athlete sees, or how they compose — not two.
  4. **The FATIGUED readiness catch-all** — `bodySignalsConcerning` fires off **one** declining signal (`coach/index.ts:2762/2786`), so a single RPE uptick delivers a bare "FATIGUED" with no breakdown. A **real** signal, delivered **opaquely**. Fix via the D-232 "open for more" factor breakdown ("Why: perceived effort up 6.4 vs 5.5 · load balanced · 1 signal concerning").
  5. **Novelty-awareness (candidate deterministic input)** — flag sessions containing movements **absent from recent history (~6+ weeks)** and surface as **expected-DOMS context** (a hard/sore session after a novel movement isn't "overreaching" — it's expected). Deterministic, from `exercise_log` history.
  6. **The cross-training-strain double-count (detection bug) — ✅ ADDRESSED by D-236 Part C (2026-07-03).** `stressSignals` counts `bodyConcerned` (`assessment.signals_concerning > 0`) alongside the specific signals, but `bodyConcerned` **overlaps** them (a declining RPE *is* the concerning signal), so a single RPE signal hit `stressSignals ≥ 2`. Fix: `crossTrainingStressReceipt` (`_shared/response-model/readiness-receipts.ts`) now **returns null (suppresses the row) when RPE is the sole distinct signal** (`rpeRising && !driftWorsening && !strengthFading && !rirDropping`), so the RPE-sole double-count no longer produces a visible "Cross-training" warning that just restates "How hard it feels". The raw `stressSignals` tally still includes `bodyConcerned` (harmless now that the row suppresses), and multi-factor / non-RPE-single cases are unchanged. Fixtures: `cross-training-stress.test.ts`.
  8. **STRENGTH-label cosmetics (the two-STRENGTH-rows question, 2026-07-03) — CONFIRMED intentional, not a duplicate; cosmetic-only.** The State PERFORMANCE section shows two rows both labelled "STRENGTH": (a) the **discipline-trend** row (`StatePerformanceSection.tsx`, `disc('strength')` → response-model `strength.overall`) — "needs data · N unplanned", the RUN/BIKE/SWIM-family eligibility row; and (b) the **lift-level insight** (`StateTab.tsx:1530-1534`, from `rm.strength.per_lift`) — e.g. "Bench Press · Working ~125 vs your 150 baseline — suggest 115 this week". Different granularity, different data, no shared computation — NOT a dual-path duplicate. The only issue is the **shared "STRENGTH" label** reading as a duplicate at a glance. Flagged in code at `StatePerformanceSection.tsx:142` ("H3 strength-row reconciliation") — the pending call is whether the discipline row should relabel/merge vs the lift insight. Cosmetic, low priority.
  7. **Loaded-legs attribution generalization (built the leg case 2026-07-03; these are its follow-ons):** (a) **upper-body → endurance/swim** attribution — heavy bench/press loads arms/shoulders and can make swims/upper work feel harder; there's no `ARMS LOADED` / `UPPER LOADED` yet (falls to `EFFORT UP`). Generalize `loaded-legs.ts` to `loaded-muscle` with a body-region. (b) **Threshold tuning** — the RPE≥8 / soreness≥7 / ≤4d / ACWR≥1.2 heuristics + the **mild-Δ magnitude re-check**: the loaded-legs Why hardcodes "feeling harder" and trusts the caller's `rpe.trend==='declining'` gate; for a small delta (~0.3) that can overstate — re-check magnitude before asserting "harder". (c) **Confound acknowledgment** — the attribution names ONE plausible cause; heat/sleep/illness could be the real driver. The "since" (temporal) language avoids overclaiming, but a stronger version would down-weight the attribution when a confound signal (poor sleep in the Q-049 sliders) is present.
- **Deliverable:** proposed **verdict strings + detection logic** to Michael **before any code** (same gate as the small wins). ✅ **DESIGN DOC DRAFTED 2026-07-03: `docs/DESIGN-Q111-plan-history-aware-verdicts.md`** — one document, all inputs, awaiting Michael's review.
- **Cross-ref:** Q-107 (State H1 fixed; H3/H4 folded), D-231, D-232 (+ its progressive-disclosure/provenance extension — the contract this designs within), D-225 (Get Stronger add-ons/blocks), Q-097; `AUDIT-state-screen-2026-07-02.md` H1/H3, `coach/index.ts:2754-2789` (FATIGUED).

## Q-112 — Narrative claim-grounding audit (the LLM-narration seam the app synthesis flagged as unaudited)

- **Status:** filed 2026-07-03 · **audit owed — one confirmed defect fixed, the sweep is not done.** The `AUDIT-app-synthesis` §7 named the coach's LLM narrative / claim-grounding as *thinner-on, not asserted correct*. First confirmed defect (fixed 2026-07-03): the "open for more" prose claimed **"one week into Get Stronger"** and treated this week's off-plan sessions as the block, for a plan that **starts next week** — root cause `resolvePlanWeekIndex` clamping pre-start to week 1 (`plan-week.ts:56`, `Math.max(1, …)`) feeding the narrative "currently in week 1". Grounded via `planHasStarted` (narrative planLine + chip index).
- **The standard to enforce (D-232 extension 2):** every narrative assertion must cite a **grounded deterministic fact** (plan state, session counts, trend verdicts, dates). No fact → no claim.
- **The audit sweep (owed):** trace ALL narrative claims the coach LLM can make against their deterministic sources — plan phase/week, "N weeks into", completed/missed session framing, load/recovery language, race-week guidance, strength/endurance verdicts in prose — and gate each on a fact. Candidate systemic fixes: (1) fix `resolvePlanWeekIndex`'s pre-start clamp at the root (currently 5 consumers: coach, arc-context, generate-training-context, plan-context — blast radius deferred tonight); (2) a narrative-facts contract that the prompt can't exceed.
- **✅ CONCRETE FIRST PIECE (2026-07-03) — the narrative-grounding GUARD is built + wired to the coach week narrative.** `_shared/response-model/narrative-guard.ts` (`validateNarrative` + `resolveGuardedNarrative`, 11 fixtures): rejects (1) a trend-state claim that **contradicts** the spine's per-discipline verdict ("run holding steady" when `state_trends_v1` says improving), and (2) a **recap** of a receipt number already on screen (the "+3.6%" class). On rejection: regenerate once (violation named in the prompt) → second failure drops the prose (honest empty > a lying narrative). Rejections are `console.warn`-logged (`[coach][narrative-guard]`) for this audit's data.
- **CONTINUITY ROLLOUT (the "nothing siloed between spine and arc" goal) — the guard is SHARED by design** (takes `narrative` + `verdicts[]`, no coach coupling). Apply it to every LLM narrative so all prose is a validated descendant of the same spine: (a) **Performance-screen per-workout INSIGHTS** (`analyze-{running,cycling,strength,swim}-workout`) — currently siloed, each with its own guards (cycling has jargon/lede/numeric; others less), NOT grounded in `state_trends_v1`; (b) **Arc prose** (`arc-context` narrative). Each is wiring (pass that surface's spine verdicts to the shared guard), not a rebuild.
- **Cross-ref:** D-232 (+ extension 2), `AUDIT-app-synthesis-2026-07-02.md` §7, `plan-week.ts` (`planHasStarted`/`buildPlanContextLine`), Q-106 (the coach-onto-spine work this rhymes with).

---

## Q-113 — Arc post-race framing has no relevance window (stale temporal anchor)

- **Status:** ✅ **FIXED + deployed 2026-07-03** (pulled forward at Michael's call). `raceAnchorStillRelevant` gates the fact block in `arc-narrative-ai-appendix.ts` — the race + day-count leave the data ONLY within the recovery window (≤42d); beyond that the LLM never receives them, so it can't recite them. One shared rule → running + cycling + strength INSIGHTS all inherit it. 5 fixtures (`arc-narrative-ai-appendix.test.ts`). Filed 2026-07-03 (Michael's eyeball of the Monday strength INSIGHTS). The narrator led with **"Seventy-one days post-marathon, this unplanned session…"** — the arc supplies `days_since_last_goal_race` (71) and the LLM foregrounds it, treating a 2.5-month-old race as current framing. At >~4–6 weeks post-race the recovery/return arc is over; the *relevant* fact is "unplanned session, no active block", not the race day-count.
- **The fix (deferred — separate from Q-111 §2 novel-movements) — SHARPENED to "relevance earned by live data", not an age cutoff (Michael 2026-07-03):** the marathon anchor earns its place only if live data supports a real effect — **acute recovery** (early: ≤~4–6wk, the post-race window is open) OR **measurable base loss** (later: the endurance trend actually shows softening). At 71 days with an *improving* run trend (+6.5% on the spine), NEITHER holds → **drop it entirely**, say nothing about the race, let the current trends speak. Gate lives in `arc-narrative-ai-appendix.ts` / the `days_since_last_goal_race` consumer. Physiology basis: acute marathon recovery resolves in ~2–4wk (zero residual at 10wk); aerobic base drifts only under ~2–3wk+ of reduced load — so a stale race day-count is never itself pertinent. Distinct from the LAST_GOAL_RACE forward-lede ban already there (that bans anchoring FUTURE load; this is a PAST race going stale).
- **The pattern it exemplifies (Michael 2026-07-03):** *the LLM loyally repeats whatever temporal framing we feed it, so honesty must live in the emitted fact, not a prompt instruction.* Same lesson as the "in months"→"in 8 weeks" fix (the phrase overclaimed a duration; grounding it at the source fixed it — a "be honest about time" prompt rule would not have). Any "time since X" the arc hands the narrator needs a relevance gate at the source.
- **Cross-ref:** Q-112 (narrative claim-grounding — this is a relevance sibling of contradiction/recap), D-233 (voice standard — cite what's relevant + verified), `arc-narrative-ai-appendix.ts`.

---

## Q-114 — Known low-risk edge: a session linked to a FINISHED plan's planned workout can carry stale phase_focus / progression_history

- **Status:** filed 2026-07-03 (on record from the stale-anchor sweep — low-risk, not fixed). The strength narrator's `phase_focus` / `phase_description` / `progression_history` come from `extractEnhancedPlanContext(plannedWorkout)` — the plan metadata of THIS session's linked planned workout. That's session-scoped (null when unplanned — Michael's case is clean), so it is NOT the stale-completed-plan fallback vector the class fix closed (days_since, plan_phase, hasActiveTemporalPlan, coach plan-week — all now covers-today gated).
- **The edge:** if a session *links* to a planned workout that belongs to a plan whose window has since ENDED (executing an old, never-cleaned planned session), those fields would carry that finished plan's phase text into the narrative. Normal linkage is the current plan, so this needs an unusual state (stale planned rows executed post-plan-end) to trigger.
- **Why deferred:** low probability + low blast radius (a phase-focus phrase, not a fabricated verdict), and the general Rule 10 (no invented phase label) + the arc phase gate catch the most visible symptom. A full fix would apply the same covers-today gate to `plannedWorkout`'s owning plan in `extractEnhancedPlanContext`.
- **Cross-ref:** the stale-anchor class (Q-113 generalized), `plan-week.ts` `planHasEnded`, `arc-context.ts` `activePlanCoversFocus`, D-233.

---

## Q-115 — Holistic model must allow RECOVERY-POSITIVE cross-domain interactions, not only fatigue-additive

- **Status:** filed 2026-07-03 (Michael, holistic-state design input). The cross-domain carryover model (Axis 1) and the load/interference model currently assume every discipline interaction ADDS fatigue. That's incomplete: **some cross-domain interactions RESTORE rather than cost.** Canonical example: an easy **swim after a heavy leg day** is recovery-adjacent — low-impact, non-eccentric, promotes DOMS blood flow / active recovery. Treating it as pure additive load (or worse, as a fatigue signal) overstates strain and misreads the athlete's actual state.
- **The design principle:** cross-domain interactions have a SIGN. Fatigue-additive (heavy lift → hard run = compounding) is one case; recovery-positive (hard session → easy low-impact cross-training = restorative) is another. The holistic model — load, readiness, strain, and the carryover narrative — should recognize restorative interactions, not only costs.
- **Where it lands:** (a) the readiness/strain model shouldn't count a recovery-adjacent easy swim as strain "across disciplines"; (b) the carryover narrative could eventually say the *helpful* version ("yesterday's easy swim likely helped the legs recover from the lift"), not just the cost version. Neither built — logged as the design input.
- **Cross-ref:** Axis 1 (`SELF-AWARENESS-MAP.md`), `DESIGN-cross-domain-carryover.md`, Axis 5 (load↔readiness↔plan), D-233.

---

## Q-116 — EWMA model option in `_shared/acwr.ts` (exponentially-weighted, vs the flat rolling default)

- **Status:** filed 2026-07-03 (Michael, design input). Deferred by priority — **do NOT sequence into the current Step 6 work.** Priority: **post-Part-A / post-Part-C.** The D-236 ACWR authority (`_shared/acwr.ts`) currently computes a flat coupled-rolling ratio (unweighted daily averages over 7d / 28d windows). The literature favours **exponentially-weighted moving averages (EWMA)** over flat rolling averages for ACWR — EWMA weights recent load more heavily, giving better day-to-day sensitivity to acute spikes and decay.
- **Scope:** add `opts.model: 'rolling' | 'ewma'` to `computeAcwr`. In `'ewma'` mode, decay constants replace the fixed windows — λ = 2/(N+1) convention (acute λ from N≈7d, chronic λ from N≈28d equivalents). **Everything else stays identical:** same rows input, same `weightFn` discipline hook, same `chronicLoadFloor`, and `acwr-state.ts` remains the sole ratio→status classifier. The model choice changes only how acute/chronic loads are aggregated from the per-day series, not the contract around it.
- **Rollout pattern (mirrors the Formula A retirement):** EWMA lands **fixture-proven with `'rolling'` as the default**, so nothing changes on merge. Callers then flip to `'ewma'` **individually**, each with an old-vs-new convergence readout (the same `acwr_convergence`-style side-by-side used for the coupled-rolling cutover). **compute-snapshot flips LAST**, because it moves the persisted `athlete_snapshot.acwr` number and needs the acceptance eyeball — same discipline as D-236 Gate 2.
- **Rationale:** EWMA is the better-supported model for injury-risk ACWR (recency-weighted vs equal-weight flat windows); the flat rolling default was chosen for D-236 only to make the five-way convergence tractable and number-comparable to the existing implementations. This is the natural next refinement once the single authority is in place and the fact-layer relocation (Part A) + RPE dedup (Part C) are done.
- **Cross-ref:** D-236, `_shared/acwr.ts`, `_shared/acwr-state.ts`, `_shared/acwr.test.ts`.

---

## Q-117 — bike efficiency = HR-at-power (intensity-controlled); raw EF investigated + REJECTED; decoupling not stored

- **Status: SPLIT (corrected 2026-07-04) —**
  - **(1) Metric choice: RESOLVED / do-not-reopen.** The STATE bike row's "Efficiency" trend uses **HR-at-power** (`bike_fitness_v1.hr_at_band`: mean HR while power is in the FTP-anchored reference band, `analyze-cycling-workout/index.ts:2517-2536`), lower-HR-at-same-power = improving. This is the CORRECT metric; a proposed switch to raw "true EF" (NP/HR, `ride_facts.efficiency_factor`) was built then REVERTED (EF conflates intensity with efficiency — the argument holds independent of the number below).
  - **(2) The ~5.5% aerobic-gain READING: OPEN / UNVERIFIED.** The 145→137 bpm HR-at-power drop that this metric reports was **never cleanly confirmed against Michael's raw matched-power SQL** — it is plausibly a real gain but could equally be an **easy-weeks / within-band intensity-distribution artifact** (the band [99–132W] is a 33W-wide range; if later rides sat lower in the band or clustered in fresher weeks, HR falls for reasons other than fitness). The intensity-control argument is sound in principle, but the specific `−5.5% → improving` output for his data has NOT been validated. Do not cite "~5.5% aerobic gain" as fact.
- **Verification owed (for reading #2):** a matched-power query that holds band-position AND week-composition roughly constant (e.g. bucket rides by fresh/fatigued block and by mean power within the band, then compare HR) — only then is the −5.5% "improving" reading assertable. Until then the STATE row's bike-efficiency direction is an *unvalidated* signal for his account.
- **Why EF is wrong here (the metric finding, still valid):** EF = power ÷ HR conflates *how hard you rode* with *how efficient you are*. On Michael's data HR-at-power showed an apparent ~145→137 bpm drop at a FIXED band [99–132W] (UNVERIFIED as a true gain — see Status #2), while raw EF on endurance rides "declined" 0.84→0.73 — but only because his endurance-ride NP fell (109→97W, i.e. he rode EASIER) at similar HR. His HARD rides went the other way (tempo power up 145→164W). So EF misreads easier riding as declining efficiency; HR-at-power controls for intensity (fixed band) and is honest. **The lesson also caught a process gap: verify the DATA is populated, not just that the code path exists** — `workout_analysis.efficiency` (EF + decoupling) is EMPTY on his rides (a different analyzer path); EF lives in `ride_facts.efficiency_factor`; **decoupling (`aerobic_decoupling_pct`) is NOT stored anywhere for his rides** → adding it is a real compute+backfill build, not a display change.
- **If reopened:** any bike-efficiency metric must be intensity-controlled (fixed power band or effort-gated), never raw EF across mixed ride types. Decoupling needs the value actually computed+stored first (compute-workout-analysis doesn't run on his rides).
- **FTP correction (verified 2026-07-04):** an earlier draft of this entry guessed his FTP was low (~145–150W) by back-inferring from the band assuming it was a sweet-spot zone. WRONG. Real FTP = **176W** (static `performance_numbers` and learned `ride_ftp_estimated` AGREE — high confidence, 11 efforts). The band [99–132W] is an AEROBIC reference (56–75% FTP), correctly FTP-anchored. No stale-FTP problem; analyze-cycling's `baselines.ftp` (176) already matches learned. See Q-118 for the baseline-model design questions this surfaced.
- **Cross-ref:** `_shared/state-trend/bike-fitness.ts`, `analyze-cycling-workout` (bike_fitness_v1), `compute-facts:1203` (ride_facts EF), the reverted commit (bike EF+decoupling rework).

---

## Q-118 — Baseline system: FTP model (power-curve/CP vs 20-min), auto-SUGGEST not auto-apply, test as tiebreaker

- **Status:** DESIGN AGENDA for a future session (Michael, 2026-07-04). Surfaced by the Q-117 bike investigation. NOT a bug — the current FTP (176W) is correct and matches learned. These are design improvements to how the baseline system LEARNS.
- **1. Power-curve / Critical-Power model vs "best 20-min × 0.95".** Current `learn-fitness-profile` estimates ride FTP as **95% of the 20-min best power** (Michael's: `"95% of 20-min best power (11 efforts)"`, `learn-fitness-profile:923-945`). Limitation: it only learns from ~20-min sustained efforts — an athlete who **rarely rides 20-min all-out chronically reads low** (the model can't see fitness expressed as shorter surges). A **power-curve / CP model** (fit the power-duration curve; CP ≈ asymptote, W′ the anaerobic capacity) would learn FTP from a spread of efforts (5-min, 8-min, surges), not just the 20-min point. Design question: adopt a CP/power-curve estimator for cycling (and its run analogue, critical pace)?
- **2. Auto-SUGGEST, not auto-apply (D-231 discipline).** Estimators legitimately disagree by 30–40W. The right behaviour is the good-app pattern: **the app SUGGESTS an FTP bump from your riding and you CONFIRM it — never a silent overwrite.** Same discipline as observed-max-beats-formula (HR ceiling), typed-anchor-wins (D-231), and the strength baseline suggest-with-confirm that ALREADY exists (`AthleticRecordPage` `suggestBaselineUpdate` / `BaselineSuggestion`). Extend that suggest-with-confirm UX to cycling FTP (and run threshold). Currently the learned FTP is auto-computed + consumed by planning without an explicit confirm step.
- **3. A measured test is the tiebreaker.** All auto-learning is still an estimate; a **measured effort — even a short ramp test — beats every algorithm.** The hierarchy: typed/tested value > confirmed learned estimate > raw learned estimate > formula. Encode the test as the top of the FTP-source precedence, with recency (a fresh ramp test supersedes an older learned estimate).
- **Latent code note (not urgent):** `analyze-cycling:1553` resolves the band/zone FTP from `baselines.ftp` ONLY, never the learned `ride_ftp_estimated` — harmless for Michael (they agree at 176) but for an athlete whose static baseline is stale/low, the ride analysis would use the wrong band. When the model work above lands, have analyze-cycling prefer the confirmed/learned FTP (with a recompute of historical `bike_fitness_v1`, since shifting the band breaks the like-for-like efficiency trend — a one-time discontinuity to handle).
- **Cross-ref:** Q-117, D-231 (typed-anchor-wins), D-237 (declare-or-refuse — the estimate must declare itself + be confirmable), `learn-fitness-profile`, `AthleticRecordPage` (existing suggest-with-confirm), `analyze-cycling-workout:1551`.

---

## Q-119 — corrupt-duration workout row (2025-09-01 run, workload ~3200) — data cleanup, not a load bug

- **Status:** deferred data cleanup (surfaced 2026-07-04 by the D-238 before/after run). One run (2025-09-01, avg_power 304, avgHR 154) has a stored `workload_actual` of **~3200** — ~30× a normal run. Back-solving the load formula, its `moving_time`/`duration` is ~**2350 min (~39 h)** — a corrupt duration at ingest.
- **Why not a D-238 issue:** the value is already wrong in the CURRENT data (stored 3200 under the old TRIMP path); the new ladder merely carries the bad duration forward (3200 → ~3918). It's ~10 months old, outside the 28-day ACWR window, so it did not affect the deploy's before/after numbers.
- **Fix when picked up:** find the row (`workouts` where `moving_time`/`duration` is implausibly large for the discipline), correct or null the duration, recompute. Consider a general ingest-time duration plausibility clamp (a run > ~6 h, a ride > ~12 h → suspect) so future corrupt durations don't reach load. Not urgent; single known row.
- **Cross-ref:** D-238, `verify-load-ladder-impact.mjs` (the readout that surfaced it).

---

## Q-120 — [COLLAPSED → Q-107 H4]

- **Status:** DUPLICATE of **Q-107 H4** (the original 2026-07-02 filing of this exact bug — readiness renders on `has_active_plan`/runs, not a SET goal, and defaults to marathon). Collapsed 2026-07-04. **Q-107 H4 is the single canonical owner** — see it for the full trace + fix shape (gate on a set goal, reconcile-or-retire marathon-readiness vs `race-readiness`, discipline-aware; design-before-build). This entry is retained only as a stable pointer because the estimate-provenance guard's `knownExceptions` (`scripts/estimate-provenance.config.json`, 3 sites in `marathon-readiness/index.ts`) reference the ticket id "Q-120".

---

## Q-121 — Tier 2: learn the athlete's aerobic threshold from data (parked); + readiness-RPE freshness guard

A per-athlete aerobic threshold would let us upgrade the RUN row to the strict `pace_at_easy_hr` signal AND fix the run classifier's easy-detection (it defaults unplanned runs to `steady_state`; there's no HR-based easy path without a threshold). **DFA a1** is the peer-reviewed method (aerobic threshold from HRV, ~within a few % of lab CPET) but is **OUT for this athlete — sensor samples carry 1 Hz averaged HR only, no beat-to-beat RR intervals.** Near-term fallback: HR/pace-inflection estimation. Parked, not scoped.

**CORRECTED 2026-07-04 — there is NO readiness-RPE bug; a prior "stale 4.8" concern was a query-side MISDIAGNOSIS.** The BODY row's "avg 4.8 vs 4.3 · harder than usual" is **correct**. The coach reads RPE as `workout_metadata.session_rpe` first — an audit query dropped that field (read it through a `?.` chain that returned null on those selects) and so undercounted to 3.33. Reading it correctly, the live 7d is `(3 swim + 4 ride + 5 strength + 9 strength + 3 run) / 5 = 4.80` — a genuinely harder week, incl. a logged **RPE-9 Monday strength**. The readiness RPE is honest and cross-discipline; **no freshness guard needed.** Lesson: a correct number was nearly condemned as stale because its *as-of freshness wasn't legible on screen* — which is exactly the motivation for stamping State numbers with an as-of date (in progress). Verify-before-cite applies to bug claims too.

### Q-122 — Plan-phase-aware load verdict (BUILT 2026-07-05, `665e2472`; live-engages once ACWR hits the band)

**SHIPPED (client, `665e2472`, web auto-deploys via Netlify; iOS needs a rebuild).** New pure `planAwareVolumeLabel()` (`src/lib/load-headline.ts`): ACWR in the back-off band (1.3–1.5) + `week.intent==='build'` + on-plan (`wtd_actual ≤ 120% × wtd_planned`) → **"building on plan"** instead of "back off". Guards exactly per the spec below: ≥1.5 redline never overridden; early-week floor (`wtd_planned_load < 150` → raw ACWR). Option (b) coherence — only the WORD (headline + gauge label) is plan-aware; the gauge MARKER + `acwrZone` stay RAW ACWR (`acwrVolumeLabel` untouched, shared with the marker). Fixture `load-headline.q122.test.ts` (6). **Not yet live-observed:** the pass only engages at ACWR 1.3–1.5 in a build week; Michael's current ACWR ~1.10, so it's fixture-proven, not screen-confirmed — will show naturally when he's actually in a high-but-on-plan build week. Original buildable spec preserved below.



`acwrVolumeLabel` is ACWR-only, so a high-but-on-plan **build** week false-alarms as "back off" (`load-headline.ts:12`; the only plan hook is `isTaperOrPeak`, and there's no `build` branch in `weekly.ts`'s prose either). Goal: `high ACWR + on-plan + build → building`, not back off. Trace findings so the next session builds without re-combing:
- **Phase signal is FREE.** `week.intent === 'build'` is already at the call site — `week_intent` type (`coach/types.ts:147`) is `'build'|'recovery'|'taper'|'peak'|'baseline'|'unknown'`; `weekly_state_v1.week.intent` carries it. (A prior claim that "build isn't in week.intent" was a trace ERROR — conflated with `swim_intent`'s focus/race.) Use `week.intent`, NOT `arc.current_phase` (macro block, unplumbed to the client).
- **`week_vs_plan_pct` is the WRONG field** — `Math.min(1, actual/planned)` **clamped to [0,100%]** (`adherence-plan.ts:84`), a completion ratio, cannot represent overshoot. Use the deviation `(load.wtd_actual_load − load.wtd_planned_load)/load.wtd_planned_load` — both raw loads ARE on the client `load` object.
- **Denominator is small early-week.** `plannedWtdLoad` = strict session-sum of `workload_planned` for sessions dated ≤ today (NOT a calendar slice). Real week (Michael, wk of 2026-07-06): Mon 103 → Tue 159 → Wed 215 → Thu 271 → Fri 327 → full 439. A single extra ~56 session reads +54% Mon … +17% Fri → the overshoot % is only reliable ~Thu/Fri. Floor: `if (wtd_planned_load < 150) → skip overshoot, use raw ACWR` (gates Monday). ACWR-primary, plan-overshoot secondary.
- **Gauge coherence (agreed): Option (b)** — the plan-aware WORD applies to headline+gauge label, while the gauge MARKER + `acwrZone` stay raw ACWR (honest dual read: "ACWR 1.35 · pushing — building on plan"). Do NOT hack `acwrVolumeLabel` in place (`LoadBar.tsx:3` shares it → marker/word desync).
- **Constants:** keep the codebase's existing 120% not the spec's 115% (avoid two thresholds); ≥1.5 stays the hard "rest now" redline.
- **Live-testable** once the plan has current-week materialized sessions (Michael's start Mon 2026-07-06 — so testable this week; at ACWR 1.10 the build-pass won't engage until he's actually near 1.3).

### Q-123 — `weekly.ts:594` "above planned" prose is DEAD (clamped field) — cleanup deferred

`if (wv > 120) planFrag = ' Total workload is above planned.'` — `wv = load.week_vs_plan_pct`, clamped to [0,100] (Q-122), so `wv > 120` has never fired. The `wv < 70` "below plan" branch is live. Retire the dead branch on next touch of `weekly.ts`.

### Q-124 — `avgReadiness.soreness` snapshot aggregate is unconsumed — verify + wire-or-retire

`compute-snapshot:211` aggregates post-workout popup soreness (`workout_metadata.readiness.soreness`, copied by compute-facts) into `avgReadiness.soreness`, but nothing reads that aggregate — readiness surfaces use the SEPARATE daily-check-in track (`readiness_checkins` → `arc.readiness` → coach loaded-legs). The popup soreness IS live via Axis-1 (`resolveCarriedInSoreness`, synthetic-tested); this specific snapshot aggregate is the dead-end. Confirm nothing consumes it, then wire or retire.

### Q-125 — Is `workload_planned` a real per-session computation or a template constant? (RESOLVED 2026-07-05 — real per-session, code-traced)

**Answer: a real per-session computation, NOT a template constant.** Written at insertion time in `activate-plan/index.ts` (lines 474/500/508/529) per session via `estimatePlannedWorkload(type, thisSession.duration, thisSession.steps_preset, …)`; null rows backfilled by `backfill-planned-workload` with the identical formula. `materialize-plan` does not write it; `calculate-workload` only writes the *actual* side on completed ingest. Formula (`_shared/workload.ts`): `round((duration_min/60) × intensity² × 100)`, `intensity = getStepsIntensity(steps_preset, type)` else per-type default (run/swim/strength 0.75, ride 0.70).

**Why a strength session reads a flat ~56 (mechanism, not a constant):** strength rows never carry `steps_preset`, so intensity always falls to the 0.75 default → any ~60-min strength session computes `(1.0)(0.5625)(100) = 56`. A double/brick day splits into two half-duration rows (lines 466/492), so its total (e.g. ~103) is a genuine sum of two per-session values — the proof the field tracks duration and is NOT a template constant.

**RUN load falls to the 0.75 default in TWO distinct ways (data-verified 2026-07-05 via read-only `planned_workouts` trace, service-role, user 45d122e7). Recompute matched every stored value.** The run intensity table (`workload.ts:16`) has no 0.75 entry (easypace 0.65, longrun 0.70, marathon 0.82, tempo 0.88 … speed 1.10), so a run reaches 0.75 ONLY via the per-type default when `steps_preset` is empty/all-unmatched.
- **Gap A — non-race plan emits NO run tokens.** All 25 run rows of the current non-race (Get Strong combined) plan have `steps_preset = null` → 100% default 0.75. Stored = `duration×0.75²×100` exactly (50min→47, 60min→56, 90min→84). For this plan run load IS pure minutes; with strength (always default) the whole plan-vs-actual load comparison is minutes-only.
- **Gap B — the matcher misses the biggest token family even when tokens exist.** Across 168 run rows, 109 carry tokens, but `getStepsIntensity` substring-matches against the factor keys and the vocabularies only partially intersect. MATCH: `longrun_*easypace`→0.65, `interval_*`/`5kpace*`→0.95, `tempo_*`→0.88/0.95, `cruise_*`→0.88, `strides_*`→1.05. MISS (→0.75 default): `run_easy_50min` (×19), `run_easy_45min` (×10), `run_easy_35min` (×9), `warmup_run_quality_12min` (×7), `run_mp_*`, `run_easy_Nmi` — no factor key is a substring of `run_easy_*`. Verified: `run_easy_30min`→stored 28 (30min@0.75, missed) vs `longrun_90min_easypace`→stored 63 (90min@**0.65**, matched).
- **Net:** intensity IS dynamic for QUALITY sessions + long runs, but plain EASY runs default regardless — and because 0.75 > easypace 0.65, a defaulted easy run reads HOTTER than a prescribed one (the miss inflates, not just flattens).
- **Gap B FIXED 2026-07-05** (`_shared/workload.ts:22` — added `run_easy: 0.65, warmup_run_quality: 0.65, run_mp: 0.82`, checked after the specific keys so quality/long-run tokens still win the max). Regression fixture `workload-run-tokens.test.ts` (9 tests, green). Go-forward only: new activations compute correctly. **Retroactive caveat — the backfill does NOT fix existing race plans:** `backfill-planned-workload` is `workload_planned IS NULL`-only (fetch:96, update:118), and the affected rows are already non-null (old buggy default), so a backfill run SKIPS them. Overwriting them needs a force-recompute that rewrites historical planned load (feeds adherence + ACWR planned series) — deferred, own decision.
- **Gap A → filed as Q-126** (non-race combined generator emits no run `steps_preset` → the current live plan is 100% duration-only). Deploy-gated generator change; must not disturb the strength spine.

**Bearing on Q-122:** the overshoot denominator is genuinely per-session and duration-sensitive — actual is NOT compared to a hardcoded constant, so Q-122 stands. Residual caveat, engine-wide: strength sessions (never `steps_preset`) always collapse to `duration × 0.75²`, so the strength contribution to "on-plan" is duration-weighted, not intensity-weighted. Whether run contributions share that flatness is the open sub-thread above.

**Adjacent, un-filed:** the per-type run *default* (0.75) is HIGHER than every easy/long run token (0.65/0.70), so any run that falls through to the default reads *hotter* than a tokenized easy run of equal duration — the default over-weights an unstructured run. Only bites when runs land on the default (the sub-thread above).

### Q-126 — Non-race (Get Strong combined) generator emits no run `steps_preset` → run load is duration-only (RESOLVED 2026-07-05, DEPLOYED + verified; Gap A of Q-125)

**CLOSED — Level B synthetic-account end-to-end (in place of the device check, 2026-07-05).** A throwaway auth user was created, the DEPLOYED `generate-strength-plan` + `activate-plan` were invoked for it, and the real `planned_workouts` rows were read back: **all 24 run rows** carried a token (`run_easy_*` / `longrun_*`) AND `workload_planned` matched the honest 0.65 value (35min→25, 90min→63, 135min→95) — zero old-0.75 rows, zero missing tokens. This proves `steps_preset` survives the `plans.sessions_by_week` JSON round-trip and `activate-plan` computes 0.65 from it, on the deployed functions + real DB. Throwaway user + plan + rows deleted after (0 residual). This satisfies the D-205/Q-072 "real running system, not just fixture-green" bar; the on-device display check is redundant (client just renders `workload_planned`).

**STATUS — SHIPPED + DEPLOYED + VERIFIED.** Code `d8d8e1b7`, deployed `generate-strength-plan` (the sole bundler of `strength-primary-plan.ts`; `activate-plan` already reads `steps_preset` generically post-Gap-B). `enduranceSession()` now emits a duration-native token via `runIntensityToken(kind, mins)`, gated to `sport==='run'`, `kind` keyed on `day === longRunDay`. Run rows now carry `run_easy_${mins}min` / `longrun_${mins}min_easypace` → 0.65 via the Gap-B matcher (was the 0.75 default). Spine-safety gate PASSED: strength subset byte-identical to the pre-change golden (55 sessions / 30,697 bytes), verified pre/post + locked as `strength-primary-plan.q126.test.ts` (5/5). Bike FENCED (rides stay token-free — the Gap A-bike sibling is its own pass, tracked below). Go-forward only (existing rows unchanged by design; pre-launch, no live surface reads historical planned load). Original entry preserved below.

**Gap A-bike (open follow-up):** `enduranceSession` also builds `type:'ride'` with no `steps_preset` → 0.70 ride default. Same one-function fix (add `Z2`/`endurance` ride tokens on the `sport==='bike'` branch), near-copy of this pass. Not built — its own entry when picked up.

**Symptom (data-verified, user 45d122e7):** all 25 run rows of the current live non-race plan have `steps_preset = null`, so `estimatePlannedWorkload` falls to the 0.75 per-type default and `workload_planned = duration × 0.75² × 100` — pure minutes, no prescribed-intensity texture. Combined with strength (structurally always default), the entire plan-vs-actual load comparison for this plan tracks minutes moved. This is the sibling of Q-125 Gap B (which fixed the *matcher*); Gap A is that the *generator never emits the tokens to match*.

**SITE PINNED (trace-verified 2026-07-05) — `shared/strength-system/strength-primary-plan.ts:283`, the `enduranceSession()` constructor.** It builds EVERY run (and ride) in the non-race Get Strong plan and returns an object with **no `steps_preset` field at all** (lines 286–293) → `undefined` → activate-plan stores null → 0.75 default. Routed via `create-goal-and-materialize-plan/non-race-routing.ts` (the strength-primary system), NOT the combined week-builder.
- **ATTRIBUTION CORRECTED TWICE — the load-bearing lesson.** This is NOT `week-builder.ts` (the prior committed guess, `34278817`) and NOT `session-factory.ts` (the guess before that). `session-factory.easyRun/longRun` DO emit correct tokens (`run_easy_${miles}mi` / `longrun_${miles}mi_easypace` — what the 109 historical race-plan rows carry) but the non-race path never calls them. Tell that cracked it: the live rows are named plain "Easy Run" / "Combo 1 of 2 — Long run" (`strength-primary-plan.ts:285,476`), NOT session-factory's "Easy Run — N mi" shape.
- **The honest post-mortem (don't stamp again).** The week-builder attribution was NOT trace-proven — it was trace-*suggested* and stamped too early. The earlier trace proved session-factory *innocent* (that held) but only *inferred* week-builder guilty by elimination, without reading the emitting function. **Rule: an attribution is pinned only when you've read the function that emits the field — never when you've merely eliminated a suspect.** This entry is pinned under that stricter bar: `enduranceSession` at `strength-primary-plan.ts:283` was READ (the missing `steps_preset` field seen at 286–293), not inferred.
- **Single seam.** All three run/ride emitters funnel through the one `enduranceSession` fn (callers: :321 base fill, :475 long-run combo, :489 block fill). One function to touch, not scattered sites.

**LOCKED ROUTING — Option B (duration-native token helper).** Deploy-gated, NOT started, needs sign-off.
- **Seam:** add `steps_preset` to `enduranceSession`'s return object (`strength-primary-plan.ts:286`). NOT `activate-plan` (its `estimatePlannedWorkload` is correct post-Gap-B), NOT the strength builders, NOT `session-factory` (already correct).
- **Helper:** a pure token pick keyed on an explicit `kind: 'easy' | 'long'` param threaded into `enduranceSession` (the :475 long-run caller already knows it's the long run; base/block fills are easy) → `run_easy_${mins}min` / `longrun_${mins}min_easypace`, set as `steps_preset: [token]`. Duration-native (`enduranceSession` already works in `mins`). Vocabulary unifies at the MATCHER: Gap B matches the `run_easy` / `easypace` substring, so `_35min` resolves to 0.65 — parity with the race path + `materialize-plan` token-parser without reusing session-factory's miles-based `PlannedSession` shape.
- **Sport-aware:** `enduranceSession` also builds `type:'ride'`. Q-126 is RUN-scoped — bike gets the same null → 0.70-default treatment (a Gap A-bike SIBLING, filed-adjacent below). Gate the token injection to `sport === 'run'` for this pass; do the ride tokens (`Z2`/`endurance` → 0.70) as a follow-up.

**Three guarantees the strength spine stays untouched:**
1. **Type gate** — only `sport === 'run'` sessions get a token; strength rows never in scope; edit lives entirely in `enduranceSession`'s run branch.
2. **The combo is RESOLVED (was "confirm at implementation"), it's TWO sessions.** "Combo 1 of 2 — Long run" is `enduranceSession('run', …, nameOverride)` at :475; its strength half is a SEPARATE `weekSessions.push({type:'strength', name:'Combo 2 of 2 — Fatigued-legs station…'})` at :476. Not a co-mingled session → the type gate isolates it for free, no brick-style split needed.
3. **No scheduling delta** — tokens carry intensity only; day placement is decided upstream, independent of `steps_preset`; duration unchanged → the only observable change is `workload_planned` dropping from the 0.75 default to the honest 0.65/0.70. Trivially true at this site: we ADD one field to `enduranceSession`'s returned object, touching no placement/duration logic.

**Isolation proof (deno fixture, per verify-on-fixtures rule) — the permanent regression gate:** materialize a fresh non-race Get Strong plan on a throwaway user BEFORE/AFTER; assert (a) run rows now carry `run_easy_*`/`longrun_*` tokens and `workload_planned` reflects 0.65/0.70; (b) the `type='strength'` subset is **byte-identical** across both runs (same days, counts, `strength_exercises`, durations, tags) — a zero-diff on strength is the spine-safety gate. Keep it as a permanent regression.

**Scope discipline — do NOT fold in:** (1) no quality tokens on non-race easy runs (they're genuinely easy; `run_easy` is honest; the Get Strong shape prescribes no run quality). (2) Leave the long-run 0.65-vs-0.70 question alone — `longrun_easypace:0.70` is currently dead (bare `easypace` matches first), so long runs compute at 0.65; nudging to 0.70 is a separate refinement, NOT Gap A. (3) Go-forward only — no retro-fix of historical rows (decided 2026-07-05: pre-launch, no live surface reads them). (4) Bike/ride tokens are the sibling, not this pass.

**Gap A-bike (adjacent sibling, noted 2026-07-05):** `enduranceSession` builds rides too, also with no `steps_preset` → 0.70 ride default. Same root, same one-function fix, run-scoped out of Q-126 for now. Fold in when Q-126 ships or file its own line.

**DISCOVERY DEBT: PAID.** The builder site is pinned (`strength-primary-plan.ts:283` `enduranceSession`), the combo question is resolved (two sessions), the seam is a single function. Nothing left to trace before the build — Q-126 is greenlight-ready.

**Interaction with Q-122:** until Q-126 ships, Q-122's plan-overshoot denominator for the live plan is duration-weighted for BOTH disciplines. Q-122 still holds (per-session, not a constant) but its intensity-awareness is dormant for this plan shape.

### Q-127 — Peripheral leg-fatigue read: two-witness (cause × effect), detect-don't-collect (design, filed 2026-07-05)

**STATUS — SPEC LOCKED, NOT BUILT (2026-07-05).** Fully specced with TWO independent acceptance gates, both enforced by build-time fixtures, both distinct from the confidence coefficients (Michael's sign-off surface, not pre-baked).
- **GATE 1 — CONTINUITY (guards under-reach):** the run's peripheral-fatigue signature must reach State's loaded-legs read as Witness 2 (via `LoadedLegsInput` + `fatigueRefinement`). A run-detail-only render FAILS acceptance — same island class as Q-128. Fixture: signature lands on State as a corroborating loaded-legs input.
- **GATE 2 — GATE STRUCTURE (guards over-reach):** Witness 2 (pace-fade / slow-at-normal-HR) may influence loaded-legs ONLY when Witness 1 (qualifying recent lower-body session) is present. Cause gates effect. Fixture: fade + NO qualifying leg day → SILENCE (no signal, no attribution).
- **BOUNDARY (do not cross):** both gates are CORRECTNESS (provable cold, no judgment). TUNING is narrow: **only Witness 1's DOMS-decay day-coefficients** are Michael's sign-off (a curve fit to a known shape). Witness 2 (Friel Pa:Hr decoupling tiers) and the baseline (Hopkins/Buchheit SWC 0.3×SD) are **literature constants — same rule for every user, not tunable.** Do NOT pre-bake the decay coefficients; do NOT soften gates into tunable thresholds; do NOT re-open the literature constants as knobs. See THRESHOLD SOURCES below.
- **NET:** cannot ship as a run-detail-only island (Gate 1); cannot claim legs without a cause (Gate 2). Two-witness discipline is a code contract enforced by fixtures, not a description. **Correctness half locked; tuning half open, awaiting Michael. Build only when he's ready to calibrate.**

**POV (settled with Michael):** "heavy legs" is NOT a feeling to collect (no slider — that's the rejected Option B). It's a cross-signal INFERENCE the app makes when a measured *cause* and a measured *effect* corroborate, surfaced as a confidence-weighted **load line** (D-232 language: load, never state).

**Two witnesses:**
- **Witness 1 — CAUSE (carries the attribution):** a recent big lower-body session, weight = volume × intensity × novelty, decaying over its echo window. This is the magnitude-decay work from the earlier loaded-legs discussion (`coach/index.ts:2890` flat 4-day window → per-session `echoDays`; loaded-legs stand-alone path). Folded in here as Witness 1.
- **Witness 2 — EFFECT (corroborates only):** the run signature — pace below the athlete's OWN route norm, at normal-or-below HR, positive split. Substrate already exists + is already ON-SCREEN: GAP/route baseline (D-105, "3 comparable runs"), pace-at-HR (`PACE-AT-HR-TREND-SPEC`), positive-split (the PACING row). The solve is the SYNTHESIS rule, not new data.

**Confidence scales with how many fire:**
| Cause | Effect | Output |
|---|---|---|
| ✓ | ✓ | strong, named: "legs carrying Monday's session — pace down at normal HR" |
| ✓ | ✗ | soft/predictive: "legs may still be loaded from Monday" |
| ✗ | ✓ | **NOT legs** — slow-at-normal-HR with no leg day → general fatigue / fueling / illness; never claim legs without the cause |

**CRITICAL CORRECTION (Michael 2026-07-05) — Witness 2 must NOT over-claim.** Do NOT say "normal HR rules out heat, therefore legs." Two confounds wear the SAME fingerprint: (a) a positive split at flat HR is also consistent with pacing error, under-fueling, or **heat-driven central/thermal limiting** (you slowed to hold HR; heat suppresses performance without spiking HR); (b) HR/pace decoupling is *consistent with* peripheral fatigue, not *diagnostic of* it. So Witness 2 is "a signature COMPATIBLE WITH peripheral fatigue," and **the CAUSE earns the attribution while the EFFECT only corroborates.** This is exactly why the ✗-cause/✓-effect row is "not legs" — the effect alone is genuinely ambiguous.

**THRESHOLD SOURCES — agnostic, literature-anchored (2026-07-05; CORRECTS the earlier "Witness 2 thresholds need calibration" framing — 2 of the 3 surfaces are published constants, NOT Michael's to pick). Michael's history is VALIDATION-only (does the standard flag his runs sensibly?), never the source.**
- **Witness 2 — "did the run fade?" = AEROBIC DECOUPLING (Pa:Hr), Friel / TrainingPeaks.** First-half vs second-half pace-to-HR efficiency WITHIN one run. A percentage → needs NO per-athlete baseline, same rule for every user. Tiers (published convention): `<5%` coupled/good, `5–10%` moderate, `>10%` aerobic system fatiguing. Guards: invalid <20 min (gate on run length); tiers are convention, not a hard rule. **ANTI-ISLAND — this already exists in the app; REUSE, do not rebuild:** `cardiac_decoupling_pct` / `decoupling_assessment` / `decoupling_basis` (gap|raw, D-036), the ≥20-min guard is live (`heart-rate-drift.ts:1328`, `sampleCount >= 1200`), `pace_at_hr` at `queries.ts:588` (D-050). Science doc: `SCIENCE-run-decoupling-durability.md`. Reconcile Witness-2 tiers with Friel's <5/5–10/>10.
- **Baseline — "was this run slow FOR THIS RUNNER?" = SWC (Smallest Worthwhile Change), Hopkins / Buchheit.** App computes each athlete's own mean + SD from their own history; flags deviation beyond `mean ± (0.3 × that athlete's own SD)`. **0.3 is a PUBLISHED, simulation-derived multiplier** (AthleteMonitoring ships SD×0.3 as default), NOT a picked number. Noise guard: require change `> 2×CV` so a fluke/meh-day doesn't trip it. Agnostic (same 0.3 rule for all) AND per-user (the SD is the athlete's own).
- **Witness 1 — leg-day echo/decay = DOMS-shaped; the ONE bespoke surface.** DOMS / force-deficit science gives the CURVE SHAPE only (soreness peaks 24–72h, force deficit resolves ~5–7+ days, worse with novel/eccentric/high-volume). No published day-by-day constant exists (no consumer app localizes leg load — the market gap). So the decay SHAPE is science-anchored; the exact **day-coefficients** are the one genuinely bespoke value → **Michael's sign-off surface.** Even here it's "fit to a known-shaped curve," not free choice.

**NET on tuning:** 2 of 3 threshold surfaces are literature constants (cite Friel Pa:Hr; cite Hopkins/Buchheit SWC 0.3×SD). Only **Witness 1's decay day-coefficients** need Michael — and only as a curve fit, not an invented number. His runs VALIDATE the literature defaults; they never SET them. (Supersedes the vague `pace_z` / HR-band-width framing above.)

**DEPENDENCY — Q-130 (GAP artifact on flat routes): RESOLVED 2026-07-05.** Witness 2 (decoupling / pace-vs-norm) and the SWC baseline consume GAP-adjusted pace. Q-130's ~15s/mi flat-route GAP inflation (arithmetic-mean aggregation) is now FIXED (`aggregateGapPace`, distance-weighted), so the corrupted-input blocker is cleared — Witness 2 can use GAP on flat routes. (Two smaller GAP siblings remain deferred per Q-130 but don't corrupt the fatigue read.)

**Worked example (this filing's motivating case):** Sun 2026-07-05 Lunch Run — 12:34/mi vs 10:54 route norm, HR 135 in-band, +75s/mi positive split, day 6 after the 2026-06-29 leg day (Back Squat + Bulgarian Split Squats + Reverse Lunge + DB Thrust — big + novel). Both witnesses present → the strong named read; today the app said nothing (window aged out + no synthesis).

**Build order:** (1) ship Q-128 first (the narrative bug, independent). (2) Witness-2 detector in the run analyzer (deterministic flag). (3) the cause×effect join in coach/loaded-legs. (4) Michael-driven coefficient calibration. Deploy-gated; deterministic receipt, LLM narrates inside it.

**CONTINUITY — HARD ACCEPTANCE GATE (added 2026-07-05, the anti-island rule).** Q-128 shipped as an island (a local run-detail correctness guard that reaches nothing); that is the *warning shot*. Q-127 has the SAME failure mode available — it could be built as a richer run-detail read ("legs likely carrying Monday's session") that renders beautifully on the Performance screen and **still never reaches State**. That would satisfy the two-witness logic and still be an island. So:
- **Acceptance gate (not nice-to-have):** Q-127 ships ONLY if the run's peripheral-fatigue signature reaches State's **loaded-legs** read as **Witness 2**. A run-detail-only render **FAILS acceptance** — same class of island as Q-128.
- **Landing spot NAMED (the buildable target, not "reaches State"):** Witness 2 feeds the **EXISTING** loaded-legs read as a corroborating input, **NOT a parallel State widget** — consistent with the two-witness design where the run *confirms the leg day* (Witness 1) rather than standing alone. Concretely: add a Witness-2 field to `LoadedLegsInput` (`loaded-legs.ts:17`) + wire `coach/index.ts`'s `fatigueRefinement` to compute + pass it, scaled by confidence. Not a new `session_state_v1` widget.
- **RECEIPT — "State can't see it today," code-level, demonstrated (not asserted):** loaded-legs entry gate = `readinessState==='fatigued'` (`coach/index.ts:2881`) + lower-body strength ≤4d (`:2903`) + declared soreness ≤2d & ≥5 (`:2913`) + `effortUp` = **endurance session-RPE** declining (`:2884`); built at `:2926`. `LoadedLegsInput` (`loaded-legs.ts:17`) accepts the leg day (dayName/sessionRpe/movement/isNovel), `effortCurrent`/`effortBaseline` (**RPE, not pace**), soreness, planEvent — **NO field for a run's pace-fade / slow-at-normal-HR / decoupling.** The "effect" it consumes today is RPE, not the run's pace signature. So there is literally no input slot for Witness 2 → the wire Q-127 must lay is a new `LoadedLegsInput` field + the fatigueRefinement plumbing, landing in the existing read. (Also note the gate's `readinessState==='fatigued'` precondition + the ≤4d window are the same silencers that hid the 7/5 case — Q-127's "large session stands alone" + echo-decay both apply here too.)

**ARTIFACT→TELL PAIRING RULE (generalizes the two witnesses; defines what earns a mention; added 2026-07-05).** This broadens Witness 1 from "leg day only" to any qualifying ARTIFACT, and makes the anti-fabrication discipline (from the invented-terrain fix) apply to CAUSATION.
- **ARTIFACT (= generalized Witness 1)** = a real, LOGGED event in the trailing 7 days that could plausibly change today's session behavior — e.g. a lower-body/high-volume strength session (leg day); an acute training-load spike vs the athlete's norm; consecutive hard days with no recovery gap; an unusually long/hard prior run. **Must be a LOGGED fact, never inferred-to-exist.**
- **TELL (= Witness 2, the measured deviation in TODAY's session)** = pace below the athlete's own route norm (SWC: `mean − 0.3×SD`, `>2×CV` guard); pace/HR decoupling (Friel Pa:Hr `>5%` moderate / `>10%` strong — slow-at-normal-HR); positive split (existing `build.ts` fact); HR elevated vs norm at matched pace (systemic, distinct from peripheral).
- **MENTION RULE (both required):**
  - Artifact present AND matching tell present → **mention it**, confidence scaled to artifact magnitude + tell strength ("legs may still be carrying Monday").
  - Artifact present, NO tell → **stay silent** (no pre-emptive warning).
  - Tell present, NO artifact → **name the tell honestly, DO NOT invent a cause** ("you faded, cause unclear" — never manufacture an artifact to fill the gap).
- **This IS the anti-fabrication rule applied to causation:** name the real artifact or stay quiet; never assert an artifact that isn't logged. Same law as the invented-terrain kill — no fact the data doesn't have. The tuning (artifact-magnitude × tell-strength → language tier) is Michael's sign-off; the pairing STRUCTURE (both-required) is correctness, not tuning.

**CONSTRUCTION-TIME CONSTRAINT — cause GATES effect (correctness, not tuning; enforce at build).** The ✗-cause/✓-effect row of the two-witness table is a code property, not just prose:
- **RULE:** Witness 2 (run pace-fade / slow-at-normal-HR) may influence the loaded-legs read ONLY when Witness 1 (a qualifying recent lower-body session) is present. The cause is a **GATE on the effect**, not an independent contributor.
- **FAILURE MODE TO PREVENT:** a pace-fade signal reaching `LoadedLegsInput` and nudging the read with NO qualifying leg day behind it. `slow-at-normal-HR + NO recent leg day → NOT legs → no attribution` (ambiguous effect alone = general fatigue / fueling / illness — never claim legs).
- **WIRING REQUIREMENT:** `fatigueRefinement` must NOT add to or shift the loaded-legs verdict independently on Witness 2. Wire the cause as a **precondition** on the effect's contribution — Witness 2 earns attribution only when BOTH fire.
- **ACCEPTANCE FIXTURE (add at build):** effect-alone stays SILENT — a run with pace-fade / slow-at-normal-HR but NO qualifying recent lower-body session must produce NO loaded-legs signal and NO leg attribution. Assert silence.
- **NOT a tuning choice:** the confidence-scaling coefficients (echo-decay, `pace_z`, HR-band width) remain Michael's sign-off surface — do NOT pre-bake them. This constraint is only the gate STRUCTURE (cause gates effect), which is correctness.

### Q-128 — RESOLVED 2026-07-05, DEPLOYED: a faded (positive-split) run narrated as "clean/steady execution"

**Was a live D-242 violation.** On the 2026-07-05 Lunch Run, INSIGHTS read *"…the pace held steady… a clean execution…"* while the SAME screen's PACING row said **positive split, slowed 75s/mi** — the "label what's computed" law inverted.

**FIX (shipped `53948e6e`, deployed `analyze-running-workout`):** guarded at the ONE generator that owns the narrative (`generateAISummaryV1`), belt-and-suspenders — PRIMARY a within-run positive-split flag → hard prompt rule (forbid clean/steady, name the slowdown, same mechanism as D-092/D-093); BACKSTOP a validator (triggers the existing corrective regen) + a final deterministic strip/append (`_shared/fact-packet/execution-honesty.ts`). Keyed on the **within-run positive split ALONE** (threshold 20s/mi, tied to `build.ts`'s >15=real-split cutoff — GENERAL, not tuned to Michael's data; the 7/5 run is the fixture, not a fitted target).
- **Two wrong turns fixed (banked):** (a) an early cross-run `vs_similar.assessment` dependency LAUNDERED an 87s/mi-slower run into "typical" (the confound, in the data) — dropped; "held steady" is a within-run claim, so a within-run signal is correct. (b) split sourced from the stale line-162 `workout.computed` read null at runtime (`computed.analysis.events.splits` is written by compute-workout-analysis LATER) → switched to `workoutToUse` (the line-1850 re-read). That runtime-null caused ~6 blind-deploy misfires.
- **Acceptance (the standing rule below):** 3/3 back-to-back recomputes — banned never survives, fade always named (runs 1–2 via the prompt, run 3 via the seatbelt's exact "Pace faded 75s/mi" fingerprint). Fixture 8/8.

**STANDING RULE banked (Michael 2026-07-05):** an "it passes" claim on any LLM generator is UNPROVABLE by a single recompute — acceptance is **N (≥3) back-to-back recomputes, all clean**, never one. A single green run against a stochastic generator is not evidence. (Learned the hard way here — fooled by variance twice.)

**NOT covered → Q-129:** this fix guards `ai_summary` only. A SECOND generator, `hr_drift_interpretation`, independently said *"solid aerobic work"* on the same faded run — same violation class, different generator. See Q-129 (shared honesty spine).

### Q-129 — Shared narrative-honesty spine: enforce D-242 across ALL generators, not per-generator (spec, filed 2026-07-05)

**The architectural gap Q-128 exposed.** Narrative honesty is enforced LOCALLY, per-generator — so each one can lie on its own. Proven by independent surfaces on the same 7/5 faded run: (1) `ai_summary` ("clean execution" — now guarded by Q-128); (2) `granular_analysis.heart_rate_analysis.hr_drift_interpretation` ("solid aerobic work" — unguarded); (3) **the deterministic SUMMARY fallback** — when `ai_summary` returns null (LLM empty/validator-rejected; observed 2026-07-05, screenshots), the card shows a fact-bullet SUMMARY that **leads with "Typical vs similar workouts"** (the `vs_similar` HR-aware read that LAUNDERS the pace collapse — same confound family as Q-130) and **never names the 75s/mi fade.** Q-128's guard covers only the LLM INSIGHTS, so the fallback is unguarded — a softer cousin of the same lie on a different surface. Plus a fourth generator, the **coach**. The DATA/spine has continuity; the NARRATIVE layer has no common chokepoint asserting honesty. Chasing generators one at a time is the anti-pattern.

**Spec direction (needs Michael sign-off on SHAPE, not built reactively):** a shared honesty pass every narrative generator routes through — define (a) the deterministic facts each generator MUST receive (e.g. positive-split, below-route-baseline, negative HR-drift), (b) what the guard ASSERTS (no clean/steady on a faded run; no "solid/strong" verdict contradicting the computed rows), (c) WHERE it lives (a `_shared` guard the analyzers + coach all call, generalizing `execution-honesty.ts` from one rule to the family). Worked examples: the two known liars above. Sign-off surface: the fact contract + the assertion set. Parked as a design item — do NOT build in the same motion as point fixes; each point fix (Q-128 was the first) teaches what the shared interface must assert.

**SCOPE — the spine must carry TWO distinct rule classes, not one (do not under-scope as "generalize 6/7"):** narrative honesty is two separable guarantees, and the shared pass must assert both as separate rules. (1) **Vertical / cross-scale** — the narrative-core rules 6/7: a session can't contradict the multi-week spine trend. (2) **Horizontal / intra-surface** — the rule Q-128 exposed (`execution-honesty.ts`; rule 11 in `SELF-AWARENESS-MAP.md` Layer 3): a sentence can't contradict the fact rows on *its own card* (the "clean execution" vs its own positive-split 75s/mi catch). These are different failure modes — a card can pass 6/7 (consistent with the trend) and still lie against its own receipts, or vice versa. Scoping Q-129 as "extend 6/7 to all generators" would ship the vertical guarantee and silently miss the intra-surface class — the exact class that motivated the filing.

**PROGRESS (2026-07-11) — 3 of the 4 named surfaces are now guarded; the COACH is the last unguarded generator + the actual "shared spine" work.**
- `ai_summary` — guarded (Q-128, D-244).
- `hr_drift_interpretation` — guarded (D-247: `guardNarrativeHonesty` runs on it at `analyze-running-workout/index.ts:~2197`), and this session it stopped minting its own drift band — it now reads drift.ts's single condition-aware verdict (Q-158 consolidation), so it can't contradict the durability read.
- the deterministic SUMMARY fallback — the "leads with Typical / never names the fade" hole is **CLOSED** (2026-07-11, `ef8b102c`): `fadeLeadBullets` was suppressed whenever `is_mixed_effort` was set, but that flag trips on `pace_cv` (a fade IS a big pace swing) and on a mislabelled unplanned `detected_intervals` — the exact faded runs it must catch. Now only real plan structure (`interval_execution`/`plan_intent_intervals`) suppresses the fade guard (`structuredBySignalSuppressesFade`); the 7/5 fade leads with the named fade and drops the "vs similar" laundering bullet. Verified live on the 7/5 recompute.
- **the COACH — UNGUARDED, but HELD by decision (Michael, 2026-07-11): do NOT build until we catch it lying.** The coach is a 4th narrative generator with no honesty chokepoint — but unlike the three surfaces above, we have **no caught lie** on it (the workout fixes all had a reproduced smoking gun; the coach is "could lie," not "did"). Building a preventive honesty framework for an un-caught lie is the cathedral-before-data anti-pattern the CANON warns against. **Decision: WATCH, don't build.** Next time the State-screen headline reads off vs the deterministic rows below it, screenshot it — that's the smoking gun; then build the net around the real example (same eyes-open discipline as Q-128/Q-130).
- **Scope-shrinking insight (2026-07-11):** on the actual State screen, the coach's AI-written surface is **ONE sentence** — the WK headline blurb. Everything else (LOAD word + composition bar, BODY %s, STRENGTH exec %, AERO/BIKE verdicts, PERFORMANCE trends) is deterministic/glass-box. So the eventual "coach honesty net" guards **one line**, not a big narrative surface — a much smaller job than "shared spine across all generators" implied. Design posture confirmed correct by the incumbent spectrum (TrainingPeaks all-numbers = cold; Garmin dense = confusing; Whoop = one score + ~one insight/week; Efforts = one honest sentence over crackable rows — the Whoop sweet spot, better decomposed). Do NOT add more prose to State.
- **When it IS built:** still define the `_shared` honesty pass (fact contract + assertion set, both rule classes above) generalizing `execution-honesty.ts`, so the one coach sentence routes through the same guard the analyzers do — but scoped to the one headline, triggered by a caught example.

### Q-130 — GAP artifact on flat routes: ~18s/mi GAP-vs-raw on a flat loop → false `gap_terrain_bias='downhill'` (RESOLVED 2026-07-05, DEPLOYED)

**ROOT CAUSE + FIX (shipped `291a7228`, deployed `compute-workout-analysis`):** it was NOT a grade/elevation bug — it was an **aggregation-method mismatch**. `overall.avg_gap_s_per_mi` was computed as `gapSum/gapCount` — an **arithmetic mean of per-sample GAP pace** — while raw `avg_pace` is `total_time/total_distance` (harmonic/distance-weighted). `AM ≥ HM` by the variance of pace, so GAP read ~15s/mi slower than raw on ANY pace-varying run **regardless of grade**. Reproduced on the real 2709-sample track: arithmetic-mean-of-RAW-pace alone = 769 vs true 754 (15s/mi from aggregation, zero grade). Fix: pure `aggregateGapPace()` in `gap.ts` (total flat-equivalent time / total distance) → on a flat run GAP ≈ raw exactly; real grades still adjust. Fixture `gap.test.ts` (4). **Verified 7/5:** avg_gap 772→757, `gap_terrain_bias` downhill→flat, narrative drops "net downhill" (3/3 recomputes). **Two smaller siblings deferred:** the per-split GAP fallback (`compute-workout-analysis:1883`) + `compute-workout-summary.gap_pace_s_per_mi` weight differently (time-weighted / separate field) — reconcile later; neither fed the false-downhill symptom. The eyes-open reproduction stopped two wrong fixes (elevation smoothing → only 3s/mi; the terrain narrative guard → papering over a bad number).

**SYMPTOM:** 7/5 Silver Lake Reservoir LOOP (flat, 43ft gain, returns to start) produces `gap_terrain_bias='downhill'`. GAP pace `772 s/mi` vs raw `754 s/mi` = **18s/mi slower**, which `computeGapTerrainBias` (`ai-summary.ts:738`) reads as net-downhill (GAP slower than raw → grade assisted raw pace). The narrative then faithfully says "the route's net downhill bias" (prompt injects it at `ai-summary.ts:543` when `gap_terrain_bias='downhill'`).

**WHY IT'S A BUG (not a true claim):** the route is a LOOP → ends at start → NO net elevation drop; `terrain_type='flat'`, 43ft gain → no net grade to assist pace. So the 18s/mi GAP-vs-raw delta has no elevation justification — **GAP is producing a ~18s/mi artifact on a flat loop.** The number is wrong, not the sentence.

**NOT A NARRATIVE FIX (record so nobody re-adds it):** a Q-128-style terrain "fabrication" guard was built AND REVERTED this session — there is no fabrication; the narrative correctly reports a bad GAP number. The lesson banked: `terrain_type='flat'` (low grade *variance*, "not rolling") ≠ no net grade; and GAP-vs-raw is real signal — verify GAP before calling terrain "invented." Fix is UPSTREAM in GAP, not the narrative honesty layer.

**SCOPE / WHY IT MATTERS (Q-127 dependency):** GAP pace feeds load (`workload`) AND the pace-vs-norm baseline math — the **SWC baseline + Witness 2** of Q-127's two-witness fatigue read. A systematic GAP error on flat routes corrupts the exact inputs the peripheral-fatigue read depends on. **Q-130 is effectively a prerequisite for Q-127's accuracy on flat routes** — build note added there.

**INVESTIGATE:**
- Why is GAP 18s/mi slower than raw on a flat loop? (per-sample grade-stream noise? GPS elevation jitter that doesn't net to zero on a loop? GAP mis-integrating small grades?)
- **Wrinkle found:** the per-split `avgGapPace_s_per_km` is NULL for all 3 miles, yet the AGGREGATE `avg_gap_sec_per_mi=772` is present. Why does the aggregate GAP compute but the per-split doesn't — and is the aggregate integrating noise the per-split path rejects?
- Flat-route-specific or broader? Pull 2–3 other flat runs, check GAP-vs-raw delta. Consistently non-zero on flat → systematic.
- Confirm the `gap_adjusted=true` path — is `avg_gap` computed off a noisy per-sample grade that doesn't net to zero on a loop?

**DELIVERABLE:** GAP should net ≈ raw on a flat loop (`|GAP − raw|` within noise, not 18s/mi). Fixture: a known flat loop → `|GAP − raw| < threshold`.

### Q-131 — Familiar Routes: honest, heat-adjusted per-route performance-over-time (design filed 2026-07-06, NOT built — fresh-session build)

> **STATUS 2026-07-06 (later): SUPERSEDED by Q-132 / D-250.** This route-trend approach was BUILT + deployed, then proved structurally unsound (path-overlap route identity over-merges distances / fragments trailheads / double-matches → verdicts flip-flop). The honest version is the **segment model** (`DESIGN-segments.md`). Kept for institutional memory; do not build the route-trend version.

**Strava-adjacent, the honest version.** An athlete has ~5 routes they run/ride a lot (user 45d122e7: 17–40× each); they want "am I getting faster on my usual loop." Strava shows raw clock times (condition-blind — a cool-day PR vs a hot slog aren't comparable). Efforts' edge: **same-route removes hills** (constant), **heat/humidity adjustment removes the rest**, read as **pace-per-HR not raw time** → true fitness with the weather taken out. **Foundation BUILT** (D-248 path identity + backfill; per-run metrics; temp/humidity in `weather_data`; `efficiency_index`). **Feature scoped, NOT built** — full design: `docs/DESIGN-familiar-routes.md`.

**Core engineering (from the design):** heat-adjust pace-per-HR via **dew point** (temp+humidity, better than temp alone) with a bespoke coefficient `k` (same class as Q-127 DOMS coeffs — population default, tune against own hot/cool same-route runs), OR a per-route **regression-residual** for high-N routes. One schema add: `temp_f`/`humidity_pct`/`dew_point_f` on `route_progress_metrics` (written in compute-facts from `weather_data`). Surfaces: a **Routes list + route detail** (a route TREND is macro → its own view, per the CONSTITUTION; the session line stays familiarity-only = the doorway, D-249). Honesty gates tied to the CONSTITUTION/CANON: glass-box the adjustment, hedge (directional not precise), confidence-gated, one-source-of-truth with State.

**5 forks need Michael's ruling** (see §7 of the design): heat model (linear-now vs regression), reference condition (dew point ≤55°F?), `k` default + tuning, where the Routes view lives, rides (power-per-HR) now or phase 2. **Build order** in §8 (schema + heat primitive first — reusable regardless of UI).

*(The OTHER fresh-session build is the fatigue / `training_reaction` NUMBER — Q-127 heavy-legs two-witness + `CANON-arc-inference-model.md`. Both are separate fresh sessions.)*

### Q-132 — Segment model (the commercial-grade route-performance rebuild) — BUILT + LIVE (2026-07-07)

> **STATUS 2026-07-07: BUILT + LIVE on real data (steps 0–6; D-256/D-257).** Effort extraction (`core-effort.ts`, `metric_source` per-slice), verdict on the spine (`core-verdict.ts` + `compute-core-verdict` → `core_verdicts`, N≥8 floor + 6-month window + CI gate + the still_building/still_learning split), server surface (`workout-detail` → `session_detail_v1.segment_verdicts[]`, PLURAL), client (`RouteDoorway.tsx`, flag-driven), all registered at the 2 chokepoints (`compute-facts` + `compute-snapshot`, `dry_run` verified reaching each leaf). Match corridor tuned 30→50m on real GPS (D-257) → 23 efforts (21 in window); live verdict `still_learning`, −1.4%, CI [−11.7, 8.9], stable across recomputes. Card polish shipped (HR tap detail, brighter dots, working touch tap, legibility). **Segment is now the SECONDARY lens — Best Efforts is primary (D-258 / Q-135).** ⚠ iOS bundle NOT rebuilt (card web-only until `npm run ios`). ⚠ Q-133 peel-back now trivial (see Q-133).

> **STATUS 2026-07-06 (later): NOW BUILDING (was SPEC'D, NOT BUILT).** Schema live on prod (`route_cores` + `core_efforts`, tracked migration `20260706120000_create_core_model.sql`). Primitives built + fixtures green: `_shared/core-match.ts` (ordered path-match, 8/8), `_shared/core-detect.ts` (consensus detection, 12/12), `_shared/gps-points.ts` (loader, verified on real `gps_track` shape). `detect-cores` edge fn deployed; **one core frozen on real data** (user 45d122e7's 1.83mi home out-and-back, N=15), born-once freeze guard proven idempotent. Rulings recorded in D-254 (forks) + D-255 (consensus + calibration). **Remaining:** step 3 (effort extraction → `core_efforts`), step 4 (verdict on the spine, Law 5, N≥8 floor, reuse `routeHeadline`/`routeTrend`), step 5 (server surface reads spine verdict), step 6 (client `RouteDoorway`), step 7 (backfill + real-data verdict-stability verification — the acceptance bar). **STEP-3 REQUIREMENT (do not retrofit):** each `core_effort` must record its metric **provenance** — a flag/enum (e.g. `hr_aligned` true/false or a `metric_source`) distinguishing an effort computed from real time-aligned HR from one that degraded to raw-pace fallback (HR sparse/unaligned). Otherwise step 4 cannot tell a clean pace:HR decoupling from a "we never had HR" null and would silently mix different-confidence facts — the exact Law-2/3 fabrication gap the audits catch. Needs a `core_efforts` column add (ALTER) at step 3.


The Familiar Routes route-trend (Q-131) was built + deployed then found **structurally unsound** (D-250 — route identity over-merges distances, fragments trailheads, double-matches; verdict flip-flops on real data). The honest path forward is the **SEGMENT model** (Strava/Garmin precedent): compare a fixed sub-path every run covers, not a variable-length route. Full spec: **`docs/DESIGN-segments.md`** — 8 steps, 3 hard geospatial primitives (ordered path-match, segment detection, segment-effort extraction), reuses the read engine (`routeHeadline`/`routeTrend`) + `RouteDoorway` shell. **5 forks need Michael's ruling** (§8): (1) auto-detect "spine" vs user-defined segments [rec **auto**]; (2) reverse direction = separate segment [rec **yes**]; (3) confidence floor N≥8 [confirm]; (4) DB constraint audit + add migrations for the route tables [**none exist** in-repo]; (5) keep per-route "run N×" as the doorway [rec **yes**]. **Verification bar:** STABLE on his real data across recomputes (fixtures-green ≠ correct — the route saga proved it, §9 of the design). Build in a FRESH session (heavy, novel geospatial code; clean context beats this muddy one). Michael's primary run = out-and-back at VARIABLE lengths from a few trailheads (dry climate; heat parked, D-251).

### Q-133 — The route-trend feature is DEPLOYED but SUPERSEDED — leave or peel back? (2026-07-06, decision owed, defer to the segment build)

> **STATUS 2026-07-07: route-trend read-path is now DEAD DATA — peel-back is now TRIVIAL (still owed).** The segment build's step-5/6 (D-256) switched the client from `terrain.route`/`buildRouteReadout` to the new `session_detail_v1.segment_verdicts[]` (`SessionNarrative.tsx` consumer flipped). So the superseded route-trend readout is now **emitted-but-unread** — there is no consumer left to migrate; peel-back = delete the dead `buildRouteReadout` + `terrain.route` emission in `session-detail/build.ts`. Low-risk cleanup, do it when the segment dust settles; nothing depends on it now.

> **STATUS 2026-07-06 (later): STILL OWED — peel-back deferred again.** Ruled (D-254 fork 4) to defer the peel-back through the segment build rather than resolve it now. The superseded route-trend read-path remains **live on prod edge functions** (`compute-facts` / `analyze-running-workout` / `workout-detail`); the `RouteDoorway` client remains **local-only / unpushed**. Decision (peel read-path back to familiarity-only now vs leave until segments replace it) is to be resolved **with the step-5 segment read-path** that supersedes it. Open action — do NOT let this quietly persist past step 5.


This session **deployed the route-trend / temp-correction / 365-day-history / server-readout work to prod** on user 45d122e7's account (`compute-facts`, `analyze-running-workout`, `workout-detail`). D-250 supersedes the approach (→ segments). The deployed feature is mostly harmless (shows familiarity + a flip-floppy trend behind the doorway) but it's LIVE. **Decision owed** (defer to the segment build): leave it until segments replace it, or peel the read-path back to familiarity-only now. The client `RouteDoorway` UI is committed but **LOCAL-only** (not pushed to web/Netlify, iOS not rebuilt) — the trend UI is only on Michael's local dev, not on device. Note also: widened route history 90d→365d in `fact-packet/build.ts` is live and affects the AI-summary route context too.

### Q-134 — Governance lint/CI gate for Laws 1/4/5 (FILED, not built) (2026-07-06)

The durable answer to "can the constitution actually govern, or is it a friendly dictator?" Today Laws 1/4/5 (one source of truth / surfaces render / born on the spine) are enforced by **human audit, after the fact** — which is why the route-trend could mint its verdict in `build.ts` and *ship*, caught only post-deploy. Law 6 (fixtures) is the one law with real machinery. **The fix is to convert the constitution from a document into a compiler:** a CI check that (a) greps surface files (`session-detail/build.ts`, `src/components/**`) for verdict-minting signatures; (b) asserts client payload contract types carry no raw-metric fields (the D-253 payload-keys guard, generalized); (c) fails when a new read-limb bypasses the spine. This is the provenance-guard pattern already used for data-fabrication, generalized to **verdict-governance**. **Open design question owed:** what is the *detectable signature* of "minting a verdict"? (a computed comparison/threshold reaching a user-facing string in a surface file? a type carrying `ci`/`slope`/raw arrays across the client seam?) That question is real work with its own answers — **deferred to its own session**; the segment build (Q-132 / D-250) ships under governance-by-construction (D-253) in the meantime, which disarms *this* feature's surfaces without the general gate. When built, this gate is what makes the writ run without depending on a well-behaved developer.

### Q-135 — Best Efforts as the PRIMARY (cross-sport) fitness lens; segments demoted to secondary (2026-07-07, DIRECTION SET + spec written, NOT built)

The pivot from the segment feature (D-258): the fixed-route segment is correct but narrow (fires only on true route repeats), and the primary user runs an AREA, not routes — so the incumbent answer for variable running (Strava/Garmin **Best Efforts**: fastest pace at benchmark distances / power at durations within any run) becomes the PRIMARY lens; segments stay secondary. Metric = PACE / SPEED — GAP-adjusted for hills, **NO efficiency/HR** (ruled 2026-07-07; same-effort is murky on a peak effort — control effort by reading the PR frontier instead). Two lenses: raw Pace + GAP pace. **Cross-sport, one engine per-sport metric:** run/swim = best pace at distance (run GAP'd); bike = best power at duration (no GAP — power is terrain-proof). Two of three hard bricks already exist (`calculateBestRunEfforts` finder + GAP physics; `calculatePowerCurve` + `w20`/CTL/ATL/TSB on the spine); the missing brick (spine aggregation/trend) mirrors the just-built `compute-core-verdict`. **Full spec: `docs/DESIGN-best-efforts.md`** (self-contained fresh-session hand-off). **§4 forks owed Michael's rulings BEFORE building** — metric (GAP+HR), per-sport distances/durations, window, source-of-truth, UI hierarchy, and **which sport first (rec: bike — cleanest/most-built)**. NOT started — build in a fresh session. Also banked: the three aerobic dimensions (peak output = best efforts; economy = efficiency/same-effort, already in State + segment; durability = decoupling, already State's run verdict); efficiency-as-its-own-trend is a candidate third lens but must pin to a fixed distance to control the heat/effort confound.

### Q-136 — coach reads `weekIntent` from `plan_contract_v1.phase_by_week`, which combined plans never write → Gate 2 is INERT for ALL multi-sport athletes (2026-07-07 FILED; 2026-07-08 DIAGNOSED — read-time fix owed)

**Symptom:** on the LIVE path `weekIntent` resolves to `'unknown'` even in WK1 of an active plan (receipt: user 45d122e7, `coach_cache.payload` → `week_intent = unknown`, `week.index = 1`). Consequence for D-259: **Gate 2** (build/baseline plan-phase tolerance that would read WK1 ACWR 1.40 as `on_target`) fires ONLY when `weekIntent ∈ {build, baseline}`, so it does nothing. This is fail-safe BY DESIGN (unknown keeps strict bands, never over-softens), and **Gate 1 alone still fixes the reported symptom** (false running-`'high'` → `'elevated'`) — but the "reads `optimal` in a build week" benefit is unrealized.

**ROOT CAUSE (Drop A, operative — diagnosed 2026-07-08, no code):** coach's `weekIntentFromContract` (`coach/index.ts:645`) reads phase ONLY from `planConfig.plan_contract_v1.phase_by_week[weekIndex-1]`. **`generate-combined-plan` never writes that array** — it writes the phase structure to **`config.phases`** instead (`generate-combined-plan/index.ts:614`, shape `[{ name, start_week, primary_goal_id, … }]`); its `plan_contract_v1` object (line 568) has no `phase_by_week`. `weekIndex` is fine (chip shows WK 1) — the field is simply absent, so `intent` stays `'unknown'`. Standalone `generate-run-plan` (`:590`) and `generate-triathlon-plan` (`:275`) DO write `phase_by_week`, so this gap is **specific to combined/multi-sport plans → Gate 2 is inert for EVERY multi-sport athlete, not just the primary user.**

**The data is resolvable read-time — proven:** `arc-context.ts:679` already handles exactly this ("D-039 Fix 3: fallback to `config.phases` when `plan_contract_v1.phase_by_week` is missing" — pick the last phase whose `start_week ≤ weekIndex`). The Arc resolves the phase correctly today; coach just never got the same fallback. **Fix direction (when greenlit — NOT yet):** port that fallback into `weekIntentFromContract` (~15 lines: last `start_week ≤ weekIndex` from `config.phases`, then the existing name→intent map at `:651-655`). **Read-time → fixes every existing combined plan instantly, no regeneration** (strictly better than making the generator emit `phase_by_week`, which would only help future plans). When landed, the existing D-259 `build` fixtures become the live path with no test change.

**Maturity/weight orthogonality (per the receipt's "learning — 5 sessions" on rides/swims):** the ride's `0.6` fatigue weight ("notable running impact") is a STATIC constant — it is not "in a learning phase." What's "learning" is the discipline *profile's* maturity (enough 28-day history for its OWN per-discipline ACWR to be trustworthy) — a separate axis. Neither Gate 1 (`runNotOverPlan`, reads only `runLoadPct`) nor Gate 2 (reads `weekIntent`/total ACWR/readiness/body signals) touches per-discipline maturity or the fatigue weights — **fully orthogonal.** Maturity interacts with exactly one OTHER reconciler branch, the cross-training→'high' escalation (`crossTrainingEstablished`, which excludes only `'building'`, so `'learning'` counts) — and that branch was **moot for this receipt** (gated off by `running_acwr 1.52 ≥ 1.1`). The composition-blindness of interest lives in the static weight (load-system extension), not the maturity flag. See [Drop B → Q-138] for the separate dead-stub column.

### Q-137 — `'rest now'` (ACWR > 1.5) is an unconditional PRESCRIPTION from a composition-blind subsystem, contradicting the reconciled classifier (2026-07-08, FILED — direction set, do NOT patch the gauge; expected closed by the intensity-binned load work)

Observed live on user 45d122e7 (WK1, 2026-07-08): the raw gauge showed `ACWR 1.6 · spike · rest now` → "This week: **Load very high**", while the **reconciled classifier** (D-259) called the same week **`elevated`** — because the reconciler sees composition (cross-training-dominated), readiness (not fatigued), and body signals (handling well), and the gauge sees none of that. The gauge's `'rest now'` band (`acwrVolumeLabel`/`planAwareVolumeLabel`, ACWR > 1.5) is a **hard redline that is never softened** — `planAwareVolumeLabel` only softens the `'back off'` band (1.3–1.5), and only in a build week. So a low-impact cross-training week on a thin WK1 base reads "Load very high" as an unconditional prescription, over the head of the subsystem that actually understands the week.

**Direction (ruled 2026-07-08):** the **gauge shows the NUMBER + the band WORD only** (honest raw ACWR — the Option-b dual read stays); **prescription language comes ONLY from the reconciled classifier** (the one surface that sees composition + readiness + body signals). Do NOT extend the redline with its own composition/thin-base leniency (rejected — that builds composition-awareness twice). **Expected to be CLOSED by the load-system extension** (intensity-binned per-domain load feeding the reconciler as the sole verdict authority — doc owed by Michael, D-259 is the reconciler foundation it builds on). **Also note:** the thin-base WK1 inflation is partly self-resolving — as the chronic base accumulates past the early-block ramp, the same absolute week stops reading as a spike. Verification when the load-system work lands: this exact WK1 snapshot should read a non-redline prescription while the gauge still honestly prints the raw ratio.

### Q-138 — `compute-snapshot.plan_phase` is a dead stub: written `null`, never reassigned, and no live consumer reads it (2026-07-08, FILED — low-priority cleanup, decide populate-or-remove later)

Drop B from the Q-136 trace, logged separately because it's a distinct cleanup with its own lifecycle. `compute-snapshot/index.ts:539` declares `let planPhase: string | null = null` and persists it at `:783` (`plan_phase: planPhase`), but **it is never reassigned** — so `athlete_snapshot.plan_phase` is `null` on every row (matches the `09-db-schema.md` §4 audit finding). Critically, this is **NOT** the cause of Gate 2 being inert: coach does not read this column — it re-derives `weekIntent` live from the plan config (see [[Q-136]] Drop A). So Drop B has no current functional impact on the load-status path; it's a latent trap only for any future consumer that trusts the column. **Decision owed (later, low priority):** either populate it in `compute-snapshot` (mirror the arc-context `config.phases` resolution so the persisted column matches coach's live `weekIntent`) OR drop the column to remove the trap. No urgency; revisit alongside the Q-136 read-time fix so both phase-resolution paths use one shared resolver rather than diverging again.

### Q-139 — Strength-led blocks resolve a phase but route lossily through an endurance intent model; strength progression may need its own load tolerance (2026-07-08, FILED — two-problem seam, partially touched by Item 2)

Surfaced wiring D-261: the primary user's `Get stronger` (`strength_primary_v1`) plan resolves its phase correctly now (`Base`/`Power`/`Deload`/`Peak`/`Retest` via `config.phase_structure.phases`), but those names route through `phaseNameToWeekIntent`, which is endurance-shaped. **This is really TWO problems — flagging the seam so later work doesn't conflate them:**

1. **Phase NAME mapping (lossy).** `Base → baseline` and `Deload → recovery` are honest; but `Power`/`Peak`/`Retest` have no clean endurance analog. D-261 routes them to the `'unknown'` fail-safe default (strict bands) rather than inventing a mapping — safe, but it means a strength Power/Retest week gets no plan-phase leniency at all. Nothing yet addresses this beyond the fail-safe.

2. **Load TOLERANCE (borrowed, not modelled).** Even where the name maps (`Base → baseline`), Gate 2 hands strength blocks the **endurance build-band** tolerance (`build_optimal_max 1.5`). A heavy strength block should tolerate higher acute load without reading as overload, but there's no reason its tolerance curve equals endurance's — it's borrowed, not derived. This is the D-259 theme again (endurance-shaped reasoning applied to a non-endurance athlete). **Item 2 (intensity-binned per-domain load) touches this** — per-domain strength ratios become reconciler inputs — but does not fully close it: the *band* a strength block earns is still an open modelling question.

**Log only for now** — informs the load-system extension doc. Don't engineer a fake phase or a bespoke strength band before Item 2's per-domain inputs exist; revisit tolerance (problem 2) once they do, and problem 1 (naming) separately if strength plans grow phase names worth mapping.

**Addendum (2026-07-08, demonstrated live) — plan-type-blind adherence, a THIRD facet:** the active plan is `strength_primary_v1` — **4 strength / 3 runs**, and the plan's own description says "*This is a strength plan — you won't want to marathon-train on it.*" Yet the off-plan branch graded the skipped Monday run with **run-plan severity** ("get back on schedule") while the plan's **primary objective** (strength: 3 sessions, volume up, e1RM improving) was being fully executed. The adherence logic is phase-aware (post-D-261) but **plan-TYPE-blind**: a skipped run on `strength_primary_v1` is a different-severity event than a skipped run on a marathon build, and the system can't tell them apart. **Item 2/3's verdicts need plan-type as a FRAME, not just phase** — the plan's session ratio and primary discipline should set the *weight* of any adherence fact (a run miss on a strength plan is minor; on a run plan it's the point). This is a third facet of Q-139's root (endurance-shaped reasoning on a non-endurance athlete), alongside the phase-name mapping (facet 1) and the borrowed tolerance band (facet 2). **(Item 4 copy note for someday):** the honest banner for this exact week was *"aerobic load holding via bike/swim; run-specific load at zero for N days"* — facts about what's held and what's deferred, **no inferred rationale, no prescription**. D-262 removed the contradictory prescription; the plan-type frame is what would let the *fact itself* be weighted correctly. Root fix: Item 2/3.

### Q-140 — `load_status` is run-centric: a deliberate discipline substitution reads as BOTH overload and deficit — the false-*under* mirror of D-259's false-*over* (2026-07-08, FILED — interim guard D-262, root fix Item 2)

`load_status` is computed primarily from `run_only_week_load_pct` (running actual vs planned running). So when a hybrid/strength athlete deliberately swaps planned runs for cross-training (bike/swim), the SAME week reads as: (1) **overload** — the all-discipline gauge spikes (ACWR 1.58 · "rest now") because the cross-training load is real; and (2) **deficit** — `load_status = under` → "off plan, add more" because running is −100% vs plan. Two opposite verdicts from one week. This is the **exact mirror of D-259**: Gate 1 killed the false-*over* ("you're overloaded" from a swap); this is the false-*under* ("you're under-training" from the same swap). **Same root, opposite sign** — endurance/run-shaped reasoning applied to an athlete who substituted disciplines.

**Interim:** D-262 coherence guard stops the contradictory "add more" prescription (no add-more while ACWR high) — but that's a guard against the *symptom*, not the cause. **Root fix: Item 2 (intensity-binned per-domain load)** — when the reconciler sees "running behind plan BUT total/cross-training load carried," it produces ONE coherent verdict ("you swapped running for cross-training — running's behind, but you're carrying the load") instead of two opposite ones, and `load_status` stops being run-myopic. Closes when Item 2's per-domain ratios feed the reconciler.

### Q-141 — Entire cardio pipeline routes through Strava despite live Garmin OAuth: single-vendor dependency on the load system's input layer (2026-07-08, FILED — assess Garmin as primary/redundant)

The Item 2 HR audit (user 45d122e7) found ALL cardio — run/ride/swim, 35 sessions over 8 weeks — ingests via `source = 'strava'`, even though the app runs a live **Garmin OAuth** proxy (`npm run dev` port 8080). So the load system's entire input layer (HR, power, pace, time-series) depends on a **single vendor**. Risk: Strava API approval is still **pending** (applied Apr 2026), and Strava's ToS **constrains raw-data flow** (retention / redistribution limits). If Strava access lapses or tightens, the load system loses its substrate — right as Items 1–3 make that substrate load-bearing. **Assess Garmin as a primary or redundant source:** the OAuth already exists and `ingest-activity` already handles `provider = 'garmin'` (separate write path, lines ~810–1040), so the plumbing is partly there. Log only — not Item 2's scope, but it's the input layer every load-system item builds on, so it's a standing risk to the whole arc, not a feature gap.

### Q-142 — ACWR NUMBER is single-source, but the ratio→BAND-LABEL mapping is duplicated 3× (client + server), synced by a comment — a D-264 gap (2026-07-08, FILED — collapse to one server-minted band)

SSoT verification (D-264) on the LOAD/ACWR metric across screens: **the number is clean** — State (`StateTab`) and Home (`WorkoutCalendar → LoadBar`) both read `weekly_state_v1.load.acwr` from the shared coach payload; neither re-computes the ratio. Performance/readiness trends are likewise server-computed and read by both tabs. **But the ratio→band classification is re-implemented in ≥3 places** with the same `0.8/1.3/1.5` boundaries: `src/lib/load-headline.ts` (`build more/balanced/back off/rest now`), `src/components/ui/charts.tsx:228` (`Under-reached/Optimal/Overreaching/Danger` — usage unclear, possibly dead, but a latent duplicate), and server `_shared/acwr-state.ts` `getAcwrStatus` (plan-aware). They're kept aligned **by a hand-written comment** (`load-headline.ts:48`: "Boundaries MUST match…") — the exact drift risk D-264 forbids. Per THE LAW (D-260), the band/verdict is minted ONCE (server) and read; the client should consume a server-minted band label, not re-derive it. **Fix direction:** server emits the band word alongside `load.acwr` in the payload; client renders it; the two client mappings (`load-headline` band words, `charts.tsx` zone) collapse onto it (or are deleted if dead). Not Item 2 scope, but Item 2 (per-domain bands) must NOT add a 4th mapping — it emits its bands server-side from day one. Log + collapse.

### Q-143 — `hr_quality` is re-derived from full HR series on every coach call: compute once at ingest, store, consume (2026-07-08, FILED — D-264-consistent optimization)

D-263 bs3 wiring adds `sensor_data` (full HR time-series) to coach's 28-day rolling fetch (~35 sessions/call) so `computePerDomainLoad` → `assessHrQuality` can derive dropout% per session. That's **re-derivation per request** — the same series parsed on every coach load, for a value that never changes once the workout is ingested. **Direction (D-264):** compute `hr_quality` (or just `dropout_pct` + `valid_points`) ONCE at ingest / compute-facts, store it on the workout (or `workout_facts`), and have coach consume the stored value — then the heavy `sensor_data` column drops out of the coach fetch entirely. One canonical calculation, computed at write time, read cheaply. **Fine as-is for now** (correctness first; the cost is a per-call parse, not wrong output); log so the optimization isn't lost. Ties to Item 1 (TRIMP also wants clean per-session HR at ingest).

### Q-145 — The easy/hard binning SEAM (`CARDIO_HARD_EASY_IF` 0.80) clips genuinely-easy high-Z2 runs into `hard_cardio` — a threshold-PLACEMENT problem, not anchor calibration (2026-07-08 filed; 2026-07-09 CORRECTED by Michael)

**CORRECTION (2026-07-09) — the anchor is NOT wrong.** Baselines screen: **LTHR 151** (learned), **Max HR 174**. The primary user's easy runs at 135–138 bpm are **78–79% of LTHR 151 = high-Z2 aerobic on his own zones** (Z2 = 128–136). So LTHR-151 is correctly calibrated; the earlier "anchor miscalibrated" framing was wrong. **The real problem is the SEAM placement:** `inferIntensityFromPerformance` maps 138/151 = 0.91 → IF 0.88, and `CARDIO_HARD_EASY_IF = 0.80` calls IF ≥ 0.80 hard — so a genuinely-easy run living at the *top of Z2* crosses the easy/hard seam and lands in `hard_cardio`. A 138 bpm easy run sitting right on the 0.80 seam is the exhibit. **Fix direction (Item 2 follow-up):** raise/re-place the easy/hard seam so high-Z2 aerobic stays easy — the seam should sit at the aerobic|threshold boundary (~tempo, Z3), not clip the top of Z2. Consider anchoring the seam to the athlete's zone model (%LTHR or %maxHR) rather than the D-238 IF ladder's absolute 0.80. **Also note the anchor-confidence angle survives (see Q-146):** several anchors are thin/manual, and a downstream bin/verdict should carry that confidence — but that's provenance, distinct from this seam-placement bug. Live impact: `hard_cardio` acute 58 (his Sunday run) in the D-263 receipt; only 15% share so it didn't break attribution, but it's a wrong bin.

### Q-146 — Anchor-confidence provenance: several intensity anchors are thin/manual; Key-2 verdicts (Item 3) must carry the anchor's confidence — ship-low-earn-up applied to anchors (2026-07-09, FILED — design constraint for Item 3)

The intensity anchors that Key-2 (decoupling) and Item-2 binning normalise to are **not uniformly trustworthy** on the primary user's Training Baselines: run **threshold pace 10:05 "learned from 3 runs"** (thin), **swim CSS 2:30/100 entered MANUALLY** (unvalidated by data), **FTP 176 manual = auto** (agrees, higher confidence), **LTHR 151 learned** (Q-145: correctly placed). A decoupling verdict built on a thin anchor (e.g. run decoupling vs a 3-run threshold pace) is itself low-confidence, and **must say so** — a confident-looking Pa:Hr number resting on a shaky reference is the D-242 "score that lies" one level up. **Design constraint for Item 3:** every Key-2 verdict carries the confidence of the anchor(s) it used; a low-confidence anchor caps the verdict's confidence and widens/softens its band. Ship-low-earn-up, applied to anchors — an anchor earns higher confidence as observed data validates it. Provenance the Item-4 ⓘ surfaces ("this read leans on a swim pace you set by hand, not measured"). Related but distinct from Q-145 (seam placement) — this is about the anchor's *confidence*, not its *value*.

### Q-147 — Swim CSS anchor EXISTS (`swimPace100 = "2:30"`) — Item 2's "swim unanchored → always easy" (amendment 2) was based on a false premise; swim IS pace-classifiable (2026-07-09, FILED — Item 2 follow-up)

Correction to D-263 Item 2: the swim easy/hard binning was set to "always `easy_cardio`, `bin_signal: pace_unanchored`" on the belief that no swim threshold/CSS reference existed. **It does** — `performance_numbers.swimPace100 = "2:30"` (per-100), confirmed on the Training Baselines screen and in `09-db-schema.md §3`. So swims CAN classify hard/easy by pace against the 2:30 CSS, exactly like run→LTHR and ride→FTP. **Caveat (ties to Q-146):** the 2:30 CSS is **manually entered**, low-confidence — so a swim hard/easy bin off it should carry that anchor confidence, and (per Q-145's lesson) the swim easy/hard seam needs careful placement too. **Follow-up:** revisit the swim slice — replace the `pace_unanchored → always easy` fallback with CSS-based classification (2:30 anchor), gated on anchor confidence. Not urgent (swims were landing in `easy_cardio` anyway, which is usually right for his training), but the premise is now known-false and shouldn't calcify.

### Q-148 — Full readiness-model rework: apply the D-266 weighted doctrine at the SOURCE, de-collinear the decoupling family, and purge the residual ACWR/demoted nudges on the DESCRIBE band (2026-07-09, FILED — deferred by explicit scope call, NOT missed)

D-266 closed the **prescriptive** ('high' / "back off") leak completely — the two-key cap backstops every uncorroborated 'high'. It did so with two surgical edits (`absorption.ts` gate + `computeSafetyFloor`), deliberately NOT touching the readiness tree (`coach/index.ts:2668-2703`) or the response-model assessment (`_shared/response-model/weekly.ts:347-413`). Three known-and-deferred residuals live in those untouched surfaces:

1. **Collinear double-count in `signals_concerning`** (`weekly.ts:349-357`): the pool counts **HR drift AND cardiac efficiency as two independent signals when they're one decoupling phenomenon**. A single bad steady run can flip both → `concerning >= 2` → label `overreaching` → readiness `overreached`, with RPE flat. Post-D-266 this can no longer escalate the load *verdict* (the floor now requires `primaryDeclining`), but the readiness *label itself* still over-fires for its own display/copy. Fix: collapse the decoupling family to one signal, or weight it.
2. **The readiness tree escalates its own labels on single demoted signals and on ACWR** (`coach:2685` ACWR + one demoted → `fatigued`; `coach:2691` ACWR-ramping-fast ALONE → `fatigued`; `coach:2700` any one concerning → `fatigued`). D-266 severed these from load escalation at the floor, but the tree still *produces* the labels. The weighted doctrine should apply at the source so readiness itself is honest.
3. **DESCRIBE-band residual — the conscious scope call (write it down so the next audit sees it was chosen, not overlooked).** The two-key cap only touches 'high'; it does NOT cap 'elevated'. So `reconcileLoadStatus`'s internal ladder can still nudge the **descriptive 'elevated'** band from demoted signals and — the tension worth flagging against D-260's absolute "ACWR never escalates through *any* path" — from ACWR: `ACWR-ramping → readiness fatigued → raise('elevated')` (`load-status-reconcile.ts:191-194`) and total-ACWR → `raise('elevated')` directly (`:210-212`). This was **judged acceptable and deferred on 2026-07-09** because 'elevated' is by-design the honest describe band the cap falls back *to* (D-265), not a prescription — so the ACWR-nudge here is a describe-layer heads-up, not an escalation with teeth. It is recorded here explicitly so a future audit understands the describe-band ACWR influence is a **known scope boundary of D-266, not a missed leak**. If the absolute reading of D-260 is later preferred, purge ACWR/demoted `raise('elevated')` calls from the internal ladder as part of this rework.

**Also folds in the D-266 parked tuning call:** a lone declining RPE trend currently DESCRIBES but does not floor-escalate (conservative "one witness isn't agreement"); revisit whether it should solo-escalate once **universal per-session RPE** lands (the #1 sRPE-capture dependency) — with RPE captured on every session the primary leg is always available, which also removes the "goes quiet on strength-only weeks" cost D-266 accepts. **Big blast radius** (the readiness tree is inside the 5k-line `@ts-nocheck` coach file); deferred deliberately, not urgent.

### Q-149 — D-268 Phase 4: `generate-training-context` is still plan-blind (run-only), + the `arc-context` `discipline` re-derivation — deferred to a fresh session (2026-07-09, FILED — the remaining plan-awareness surface)

D-268 (plan-primary is a system invariant) shipped Phases 1-3 + 5 — the entire **visible State card** now reads the plan, not running. **Phase 4 is the one remaining surface and is deferred to a fresh session** (this one was long; Phase 4 is a big separate function and rushing it risks the race/goal logic). It is fully specified in `docs/DESIGN-D268-plan-aware-everywhere.md` §3 (surface #5) + §5 (Phase 4) + the handoff doc `docs/HANDOFF-2026-07-09-load-plan-awareness.md`.

**What's still run-blind (`generate-training-context/index.ts`):** recent-form + key-session-audit queries filter `type in (run,running)` (`:728`, `:830`, `:1438`); `next_key_session.sport` defaults `'run'` (`:1863`/`:1865`); gap-scan copy hardcodes "Add N more run session(s)" (`:1131`). NOT on the State card — it feeds the AI narrative, the arc, and goal-prediction. **Mitigated:** D-268 Phase 3 already pushes the plan-primary fact into the LLM narrative, so the biggest prose risk is covered; Phase 4 closes the next-action defaults + the run-only inputs. **Fix pattern:** import the shared `resolvePlanPrimary` (single source), default the next-action off `planPrimary` not `'run'`, make the recent-form inputs discipline-aware. Endurance/tri: zero regression.

**Also in scope (D-268 §7 cleanup):** `arc-context.ts:683` re-derives its own `discipline` (`config.discipline || config.sport || plan_type`) independently of `resolvePlanPrimary` — a second, divergent notion of "what discipline is this plan" (D-264 single-source concern). Collapse to one.

### Q-150 — Foundation-readiness: scale + security + ops hardening backlog (2026-07-10, FILED — umbrella; blockers B1/B4 gate a 2nd paying user)

A 3-way architecture audit found the domain logic + target pattern (run + `session_detail_v1`) solid, but the layer around them not commercial-ready. Full severity-ranked list + evidence: **`docs/FOUNDATION-READINESS.md`**. Pre-launch / one user → nothing on fire today; do NOT over-alarm. Tracked items:
- **BLOCKERS (before a 2nd paying account):** B1 — ~47 edge fns take `user_id` from the request body under service-role (~24 `verify_jwt=false`) → cross-user data exposure; the JWT-derived pattern exists (`save-location`) in only ~26 of ~90 fns. B4 — no error sink/monitoring; a broken user compute is invisible.
- **Scale (~1k users):** S1 coach_cache invalidation race (stale State ≤24h); S2 `useStateTrends` recomputes ~10 queries client-side (== the dumb-client cohesion fix, first mission); S3 ingest fan-out no queue/retry/DLQ; S4 getArcContext re-invoked 2–3×/workout; S5 `route_progress_metrics` index (verify).
- **Serious/cleanup:** B2 hardcoded anon key; B3 silent sync death + Strava token-rotation bug; B6 workload `??0` score-that-lies; B7 failure illegible to user; B8–B13 (rate-limit, Garmin token-in-URL, `weekly_workload` RLS, migrations dir, `backfill-facts` unguarded).
Cross-ref (already tracked): Q-105/Q-106 (strength fork), Q-141 (single-vendor), D-186/D-194 (dumb-client), D-140–143 (readiness dual-write), Q-054/Q-057 (route_progress data).

### Q-151 — Intentional exercise substitution is read as skip + unplanned (a "score-that-lies" + a customization gap) (2026-07-10, FILED — design not built; Michael wants first-class swap/customization)

**Repro (Michael, on device 2026-07-10):** he intentionally swapped the planned **3× Front Squat** (5 reps @ 65 lb, planned vol 975) for **5× Hip Thrust** (5 reps @ 95–110 lb, +1,700 vol). The workout detail shows Front Squat as **−975 lb red "skipped"** AND Hip Thrust as **+1,700 unplanned** — two contradictory stories for one deliberate choice. Lower-Body execution still reads 93% (the hip-thrust volume IS credited — banner: "Skipped Front Squat — counts in full"), but the red "skipped" reads as a failure at something he chose to replace. That is the score-that-lies in miniature (CANON §0 / D-242 class): a deliberate substitution presented as a miss + a bonus.

**Design position (three layers, in order):**
1. **Declared beats inferred (the customization path Michael wants).** A first-class "swap this exercise" action — pick a substitute (ideally pattern/muscle-matched suggestions). Once declared it is a **substitution**, not a skip: no red −975, volume counts, done. (Today's banner points to "Adjust on the State tab" but frames it as scaling weight, not swapping a movement.)
2. **Infer as a backup, labelled as a guess.** Same session + same strength focus (the `classifyStrengthFocus` the cards/coach already share) + a planned lift missing + an unplanned lift present → "looks like you swapped these," shown as a confirmable inference, never asserted (measured vs inferred never wear the same clothes, Law 2).
3. **Stimulus honesty (the differentiator — nobody ships it).** Tier the swap by quality: **like-for-like** (same movement pattern + primary muscle — e.g. DB bench for BB bench) flows into the same trend, no fuss; **different-pattern** (this case: front squat = squat pattern → hip thrust = hip-hinge/glute) is a real change — credit the volume in full, but say the truth: "your squat pattern got no work today, and your squat trend has no new data point." Protects D-270: the swap must NOT read as the squat *declining* — it simply wasn't trained.

**Field scan (2026-07-10):** Fitbod — tap "substitute," suggests same-**muscle-group** alternatives, the sub flows into the **same progression path** (continuity, but blurs specifics); RP Hypertrophy — free mid-cycle swap for equipment/injury, big filtered alternatives library ("maintaining training continuity"). The matching logic the field uses = **movement pattern (squat/hinge/push/pull) + primary muscle**; by that rule front squat→hip thrust is NOT a clean sub (squat vs hinge). None ship the stimulus-honesty layer — that's Efforts' opening.

**Cross-ref:** D-270 (per-lift trend — a swap must not fake a squat decline), `session_detail_v1` execution/adherence (`build.ts` — where "skipped" vs "substituted" is decided), `WORKORDER-deviation-reason.md`, TARGET-ARCHITECTURE steerable plans (recurring swap → plan edit), CANON §0 (score-that-lies) + Law 2 (declared vs inferred). Repro screenshots in this session.

### Q-152 — `resolveCurrentFtp` has no freshness guard: a stale confident learned FTP beats a FRESH typed value (2026-07-10, FILED — resolver gap surfaced during FTP fracture #2 cleanup)

`resolveCurrentFtp` (`src/lib/resolve-current-ftp.ts:62-82`) is learned-first: `learned (≥medium conf) > manual > learned-low`. Its ONLY guard is the confidence tier — **no freshness/recency check.** So if an athlete does an actual FTP test today and TYPES the new number, but the app holds an old medium/high `ride_ftp_estimated` from months ago, the resolver **ignores the fresh typed value** and every surface uses the stale learned one. A freshly *measured* number should beat a stale *estimated* one.

**Why it matters:** this is the FTP analogue of the strength "typed wins" honesty (D-231) — except FTP is learned-first, so the failure mode is inverted: instead of typed silently overriding learned, *stale learned silently overrides fresh typed*. Correct for any athlete requires the resolver to weigh **recency**, not just confidence. This is the "living baselines" nuance the north star calls for (TARGET-ARCHITECTURE §Living baselines: the resolver decides how much live leads, per anchor — freshness is part of that decision).

**Design owed:** add a freshness dimension to the resolver — e.g. a typed value entered/updated more recently than the learned estimate's `as_of` wins (or at least ties-break to typed); learned only leads when it's both confident AND not stale relative to the typed entry. Needs a `last_updated`/`as_of` on both the typed FTP and the learned estimate to compare. Verify with synthetic-athlete fixtures (user-agnostic), not one account.

**Cross-ref:** D-231 (strength typed-wins — the mirror), TARGET-ARCHITECTURE living baselines, TRUTH-MAP fracture #2 (the FTP convergence this surfaced during), `resolve-current-ftp.ts` + its 8 tests (freshness case not yet covered).

### Q-153 — Residual FTP display-label bypasses: normalizer + get-week still read typed FTP raw (2026-07-10, FILED — deferred, disproportionate to value)

FTP fracture #2 is closed for everything that computes a verdict or bakes a real watt target (analyzer, compute-facts, coach, Baselines, Athletic Record, materialize-plan, AllPlansInterface). Two **display-label** sites still read `performance_numbers.ftp` raw — deferred because the fix is disproportionate to the value (cosmetic, learned-FTP-only drift; the executed watts are already resolver-correct via materialize-plan):

- **`src/services/plans/normalizer.ts` (`normalizeStructuredSession`, ~:897/:934)** — labels %FTP→watts on structured-session previews. Its callers pass only `{ performanceNumbers: pn }` (`PlannedWorkoutSummary.tsx:229/323`), so routing through `resolveCurrentFtp` requires threading `learned_fitness` through the `Baselines` type + PlannedWorkoutSummary + its render callers (multi-hop plumbing) for a cosmetic label.
- **`supabase/functions/get-week/index.ts:436`** — raw-FTP transitional FALLBACK that fills `power_range` only for rows MISSING it; materialize-plan bakes `power_range` via the resolver, so this rarely fires. `get-week` is `@ts-nocheck` and the calendar authority (higher edit risk). Route through the resolver (get-week can fetch `learned_fitness`) when next touching that file.

**Impact if left:** a rider with a confident learned FTP that differs from typed could see a structured-session preview LABEL (or an un-baked calendar-row fallback) in typed-derived watts while the executed session uses learned-derived watts. Cosmetic; the real target is correct.

**Cross-ref:** TRUTH-MAP fracture #2, `resolveCurrentFtp` (8 tests), the closed sites (this session's FTP commits). Do these when the surrounding files are touched for another reason.

### Q-154 — Import dates a workout off the PROVIDER's local time, not the USER's — an activity can land on the adjacent local day (2026-07-10, REAL BUG, root-caused, NOT fixed)

**Symptom (user-confirmed, cost hours this session):** a ride that happened on the user's local **7/7** was filed on **7/8**. Not a display artifact — the stored `workouts.date` is wrong for where/when the user actually rode.

**Mechanism:** `ingest-activity` `extractStravaLocalDate` (`:29-46`) and `import-strava-history` (`:585`) derive the calendar day by splitting the date portion straight out of Strava's **`start_date_local`** — i.e., they **trust the provider's idea of the user's local time**. Strava computes `start_date_local` from the *activity's own timezone*; when that timezone disagrees with the user's home timezone (travel, stale Strava tz, or an activity started near local midnight in the provider's tz), the workout lands on the day next to the one the user expects. The `start_date` (UTC) fallback is even commented "may be off by a day."

**Compounding UX trap (also filed here):** delete-locally-and-reimport **silently does nothing** in this case — the workout's `strava_activity_id` still exists (under the "wrong" date), so `import-strava-history:761` skips it as already-present. The toast reads "No new activities to import (N skipped)" with **no error**. This is what made the ride look "lost."

**Fix direction (what the user asked for):** the client should send the user's **device timezone** (IANA id / offset) with the import; derive the day from UTC `start_date` in *that* timezone, not from the provider's `start_date_local`. **Decision to make first:** a genuinely-traveled activity would then file under the user's *home* day rather than the activity's local day — accept (user wants own-tz consistency) or special-case by whether the activity's tz is trusted. **Verify before building:** capture the ride's raw `start_date` vs `start_date_local` to byte-confirm the flip (not captured this session).

**Cross-ref:** the delete/reimport skip guard (`import-strava-history:761`); ENGINE-STATE "Known broken."

### Q-155 — `adapt-plan` may be largely non-functional — verify it does anything, then fix-or-remove (2026-07-10, FILED)

Michael flagged that `adapt-plan` "never really worked." It runs on ingest (`action=auto`, safe-as-no-op per CLAUDE.md), on client accept/dismiss, and on cron `auto_batch`. Open question: does it actually produce useful suggestions / progressions on real data, or is it effectively inert? Verify end-to-end, then decide fix-or-remove rather than let it ride along forever. **Note:** the B1 pass (D-271) changed only its *auth*, not its behavior — this is a separate feature-quality question. **GATED (Michael, 2026-07-10):** do NOT touch adapt-plan until the app does everything it currently promises with total continuity + every number trustworthy. It resurfaced by accident during the B1 sweep; it is not the mission.

### Q-156 — Per-domain load is NOT calibrated across disciplines (the composition bar exposes it) (2026-07-11, DESIGN GAP, filed)

The State composition bar (Ride/Strength/Run/Swim %, added 2026-07-09, `LoadBar.tsx:72-88` ← coach `daily_load_7d.by_type`) is the first surface to put cardio and strength load side-by-side as percentages — and they are **not on a common scale**. Cardio load = `(minutes/60) × IF² × 100` (`_shared/workload.ts:324`); strength load = `max(tonnage/10000, 0.1) × IF² × 100` (`workload.ts:189`). The `/10000` is a hand-picked constant, **never calibrated against `duration/60`** — so strength/swim shares swing with a formula constant, and a heavy lifting week can flip the whole bar. **Traced verdict:** RUN is *not* over-counted (a 45-min run is scored like the rides, slightly less per minute); the imbalance is strength/swim being uncalibrated-small in a given window. Presenting an uncalibrated cross-sport % as if exact is mildly a "score that lies". Real fix = the per-domain-load calibration (a design task; opens with an HR-data audit, not design — see `DESIGN-load-system-extension.md`). Not a bug to bandaid.

### Q-157 — Run efficiency chart label: a competing verdict the workout shouldn't stamp (MOOT 2026-07-11 — the sparkline is already dead)

**MOOT — verified by code trace 2026-07-11.** The competing sparkline can't render: the server hardcodes `trend: null` (`session-detail/build.ts:898`, the only assignment — the pace-at-HR classifier isn't emitted), and the client `TrendSparkline` that would color `pace_at_hr_direction` is **defined but never mounted** (removed when macro trends moved to State — `SessionNarrative.tsx:597-600`; zero `<TrendSparkline` JSX uses). What actually renders on the workout screen is `discipline_trend`, read straight from the cached spine (`state_trends_v1`) — the same source State reads. So there is no live competing verdict; the fracture this Q described was already retired. Optional cleanup: delete the dead `TrendSparkline` + the server `pace_at_hr_direction` plumbing so it can't be re-wired. No behavior change. Same disposition applies to Q-025's shipped sparkline (surface retired). Original text below.

State owns run aerobic-efficiency direction via `efficiency_index` trend (`state-trend/run.ts:86`, ±3%, staleness-gated, 30–70min duration filter). The run-detail **`SessionNarrative` sparkline** labels its own direction (green/red) via `pace_at_hr_direction` — a percentile classifier (`fact-packet/pace-at-hr-direction.ts`) with **no staleness gate**, which can contradict State. Note the session-detail contract *already documents* that this read should be "State's canonical `efficiency_index` metric… a per-session ZOOM-IN on State's number, **never a competing verdict**" (`session-detail/types.ts:447`) — the chart just doesn't honor its own rule. (The AI-*prose* aerobic-efficiency claim reads the weekly spine signal `run_easy_pace_at_hr_trend`, currently retired/null — so no prose fork.) **Fix (client change, needs a visual eyeball):** feed the sparkline State's verdict, or drop the competing improving/declining color and let State own it. Low-stakes tail; deferred so it lands clean, not rushed. *(Note: the earlier fork-sweep report mis-cited `session-detail/build.ts:38` here — that line is the route readout, a different feature.)*

### Q-158 — Run HR-drift "normal for X min" uses a phase/weather-BLIND band (RESOLVED + DEPLOYED 2026-07-11)

**RESOLVED — the phase-blind band is gone, and the whole drift/decoupling room got consolidated.** Shipped this session (commits `4b77bc84` Q-158 · `552e4de2` decoupling activation · `c4e69460` drift-band collapse · `dd575492` confound guard; each fixtured, all deployed `analyze-running-workout` + `workout-detail`):
- **Q-158 itself:** dropped the duration-only "normal for X min" verdict from `session-detail/build.ts`. The bpm "Heart rate" line is now measured description + own-baseline comparison only; the phase/weather-aware verdict is owned by the analyzer's read.
- **Decoupling % surfaced as the single durability verdict** (TrainingPeaks Pa:Hr standard, <5% good): the Performance "Aerobic decoupling" row leads when a GAP-basis % exists, and suppresses the bpm line so there's one HR read, not two. It was dormant (efficiency.ts dropped `basis`; buildSummary dropped basis+assessment) — now wired single-source.
- **Two expected-drift bands collapsed into one** (the science: judge drift against conditions, one number, TrainingPeaks/Garmin). `interpretation.ts` now reads drift.ts's terrain-adjusted, phase/weather-aware `assessment` instead of recomputing a raw-drift band; `getExpectedDrift`/`assessDriftBand` deleted. Also deleted a dead 1,343-line `analysis/heart-rate-drift.ts`.
- **Confound guard** (Q-055's existing-line concern): the "higher than your typical" bpm verdict is suppressed on hot/hilly runs (names the confound, not a fitness change).
- **Empty-half-window guard** in drift.ts so a dropped-sensor half can't print a garbage drift number.

Original text below.

The workout Details HR-drift row (`session-detail/build.ts:1531`) states "normal for X min" from RAW duration bands `{8,12,15,20}` with no phase/weather adjustment, while the AI-insights drift read uses the phase/weather-AWARE band (`analyze-running-workout/lib/heart-rate/interpretation.ts` `getExpectedDrift(dur, conditionsSeverity)` + `assessDriftBand`). They diverge only on build/peak/taper/hot runs → the "normal for X min" clause disappears while the AI says "within expected range". Workout-internal, LATENT/edge, not on State. **Fix (server-side, small):** drop the phase-blind "normal for X min" verdict and let the phase-aware read own "is this normal" (or thread the adjusted range into the detail contract). Deferred with Q-157.

### Q-159 — Strength design: exercise-substitution recognition + does prescribed RIR progress down a block (2026-07-11, DESIGN, filed — ground in top apps)

Two related strength-design questions Michael raised (parked, NOT continuity): **(a) Substitution** — he swapped front barbell squats for hip thrusts intentionally; A) does the app recognize the movements, B) can it read a swap as a legit substitution and NOT dock the session, C) eventually swap it in the plan itself. Industry-standard (RP / Fitbod / Boostcamp track by movement pattern / muscle group and never penalize a swap) — a real feature (needs an exercise DB + movement-pattern map). **(b) Prescribed-RIR progression** — the logger greys out a suggested RIR; should it DECREASE as load climbs across a block? YES per RP (a mesocycle runs 3–4 RIR → 0–1 RIR over a 4–6wk wave, then deload) — verify our plan actually progresses it; if the target is static, the RIR verdict (D-272) is judging against a wrong reference. Frame: Performance = receipt, State = e1RM trend (Hevy/Strong Epley); ground any build in RP/Hevy/Strong. User-agnostic — never tune to Michael.

### Q-160 — Cleanup cluster: small honesty/hygiene items filed 2026-07-10/11 (filed)

Low-severity, noticed-and-deferred: **(1)** tri athlete missing bodyweight → nudge "add your weight for a bike-limiter read" instead of the honest-but-blank 'none' (D-272 limiter follow-up). **(2)** `DEFAULT_SWIM_PER100_SEC = 120` (`services/plans/normalizer.ts:49`) feeds a swim's *displayed planned duration* with no "~/est" tag when no swim baseline (the same file already suppresses the analogous strength placeholder — inconsistent with its own bar). **(3)** `run_easy_pace_at_hr` is retired/null but one reader still consumes `run_facts.pace_at_easy_hr` (`recompute-athlete-memory/index.ts:372,389`) — D-239's dead read-path isn't fully dead. **(4)** `athlete_snapshot.workload_total` carries no measured/estimated provenance stamp (`compute-snapshot:759`) — LATENT (never rendered as a measured number; only feeds LLM coaching prose alongside ACWR). **(5)** 3 stale cycling trend tests in `cycling-v1/ai-summary.test.ts` were already red before this session (they test the removed `npTrend`-fallback trend API) — update to the current spine-verdict API or delete.

## When to add an entry

Add a new Q-NNN when:
- A behavior gets noticed and someone considers "fixing" it but the right call is to leave it.
- A bug is filed but explicitly deferred (note the deferral reason).
- Verification is owed but not yet done — record the verification approach so the next session can pick it up cheaply.

When the answer is established (verified, intentional, or fixed), keep the entry but mark its status. Don't delete entries; they're institutional memory.
