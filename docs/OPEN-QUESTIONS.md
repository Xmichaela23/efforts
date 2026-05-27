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

## When to add an entry

Add a new Q-NNN when:
- A behavior gets noticed and someone considers "fixing" it but the right call is to leave it.
- A bug is filed but explicitly deferred (note the deferral reason).
- Verification is owed but not yet done — record the verification approach so the next session can pick it up cheaply.

When the answer is established (verified, intentional, or fixed), keep the entry but mark its status. Don't delete entries; they're institutional memory.
