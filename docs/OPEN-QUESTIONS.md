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

## Q-049 — Athlete State Continuity: check-in → Arc → every screen (SPEC filed 2026-06-12, Priority 1, not built)

- **Status:** open spec, **not built**, parked ("pick up when the atmosphere's right"). Full spec: **`docs/SPEC-ATHLETE-STATE-CONTINUITY.md`**.
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

- **Status:** filed 2026-06-14 · unbuilt / unverified
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

- **Status:** filed 2026-06-29 · **THREE locks (live probe found the 3rd) → all FIXED + DEPLOYED → engine PROVEN LIVE.** `generate-run-plan` **v145**, `create-goal` **v224**. The live deployed engine now emits real **5×5 (Workout A: Back Squat/Bench/Row · Workout B: Back Squat/OHP/Deadlift)** when the request carries `strength_tier:'strength_power'` + `strength_protocol:'five_by_five'`, and **durability** without the tier — proven by a service-role preview probe against the deployed function (`/tmp/q093-live.py`, account `claudemore@test.com`, no DB write). The local probe + guard tests all passed yet the live path still 400'd on Lock 3 — **the score that lies**: only the deployed round-trip caught it.
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

## Q-097 — Strength-primary 1RM write-back does NOT close — blocks don't compound yet (LAST OPEN THREAD)

- **Status:** updated 2026-07-01 (D-224) · **WIRE BUILT + HARDENED, OPEN pending ONE live confirmation.** The retest is now **AMRAP** (D-224, replacing the broken fixed-88%×3 estimate that could only log a loss): fixed ~88%, open reps → more reps = the gain. `saveBaselineResults` writes `performance_numbers` with a **ratchet-UP-only guard** (a test may only raise a 1RM) + **OHP-key canonicalization** (`overhead`/`ohp` → `overheadPress1RM`). The RIR gate accepts an AMRAP set at RIR 0–3. Anchor read confirmed the stored keys are clean. **Still OWED: one dogfood build → log a wk12 AMRAP retest → confirm `performance_numbers` updates** (client flow can't be unit-tested). That single confirmation closes Q-097. Do NOT log closed until seen.
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

## When to add an entry

Add a new Q-NNN when:
- A behavior gets noticed and someone considers "fixing" it but the right call is to leave it.
- A bug is filed but explicitly deferred (note the deferral reason).
- Verification is owed but not yet done — record the verification approach so the next session can pick it up cheaply.

When the answer is established (verified, intentional, or fixed), keep the entry but mark its status. Don't delete entries; they're institutional memory.
