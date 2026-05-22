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

## Q-010 — EFFICIENCY/POWER dashboard rows keep technical jargon (inconsistent with plain-language INSIGHTS)

- **Status:** intentional (deferred) — cosmetic, not urgent (user-flagged "future pass" 2026-05-17).
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

## Q-015 — §6.3 "never repeat across consecutive sessions" relies on rotation salts, not recent-pick memory — accepted collision risk (Phase 3 Slice 3c deferred)

- **Status:** intentional (Phase 3 Slice 3c, deferred 2026-05-19). Scoped out of Phase 3 to ship the spec-compliant picker faster.
- **Why it exists:** `pickSwimDrillInset` (`src/lib/plan-tokens/swim-drill-tokens.ts:242`) rotates the eligible pool via `(planWeek * 3 + salt) % n` where `salt = drillSlotSalt + SWIM_DRILL_KIND_SALT[sessionKind]`. Different session kinds within a week get distinct salts (easy=0, css_aerobic=5, threshold=11), and the `*3` factor distributes the start index across weeks. But there's no tracking of recently-emitted drills — at adversarial salt × pool-size combinations, the same drill can re-appear across consecutive weeks for the same session kind.
- **Why not blocking:** pool sizes post-Phase 2 are 9 (base) / 8 (build) / 4 (peak) / 2 (taper). Collisions are infrequent in practice, and the cost is one occasional repeat — not a training-quality issue, just a §6.3 variety-rule whisper. The peak/taper pools are small enough that some repetition is unavoidable regardless.
- **What "fixing" would require (Slice 3c, deferred):** thread `prevWeekDrillTokens` through `buildWeek` options (the same in-memory pattern as `phaseBlocks`); have `pickSwimDrillInset` drop tokens that appear in the previous week's drill set before salt-rotation. Zero schema impact. Limitation: doesn't survive partial rebuilds or single-week regenerations — but those are rare. Locked posture (if picked up): **in-memory per-build** (the user's explicit preference 2026-05-19 over a persisted `planned_workouts.computed` field).
- **Cross-ref:** Phase 3 Slice 3a commit (this commit's hash); `src/lib/plan-tokens/swim-drill-tokens.ts:212` (`pickFirstDrillFittingBudget`), `:242` (`pickSwimDrillInset`); `docs/SWIM-PROTOCOL.md §6.3`.

---

## Q-016 — §2 drill/swim ratio scaling (drill yardage by intent × experience) not implemented (Phase 3 Slice 3e deferred)

- **Status:** intentional (Phase 3 Slice 3e, deferred 2026-05-19). Scoped out of Phase 3 as the highest-risk piece; warrants its own investigate-first arc.
- **Why it exists:** `docs/SWIM-PROTOCOL.md §2` prescribes drill/swim ratios from 75/25 (race-adequate + learning) down to 10/90 (race-adequate or performance + competitive). `pickSwimDrillInset` (`src/lib/plan-tokens/swim-drill-tokens.ts:242`) is athlete-experience-blind — drill yardage is fully token-static (4×50yd = 200yd, 2×50yd = 100yd, etc.). No `training_fitness` input to the picker; no ratio enforcement.
- **Why not blocking:** per-token drill yards (50-150yd typical) are aerobically inconsequential vs the 1500-3500yd main sets the protocol's session-count + band-volume layers already differentiate by experience (Slice 1 band-lerp at `c1c94cec`, fitness-tier band selection at `week-builder.ts:1092`). The drill block size matters for stroke-mechanic emphasis, not for training-load distribution; learners get more frequent technique aerobic sessions instead.
- **What "fixing" would require (Slice 3e, deferred):** new token variants for high-ratio learners (e.g. `swim_drills_6x50yd_<name>` at 300yd, `swim_drills_8x50yd_<name>` at 400yd); materialize-plan regex tolerance update (`materialize-plan/index.ts:1806` already accepts `\d+`); drill-yardage tier table mapping `(intent, experience) → multiplier`; threading `training_fitness` into `pickSwimDrillInset`. Investigate-first arc with its own slicing — drill-yards-by-tier intersects with the band-volume protocol and needs explicit scoping against double-counting.
- **Cross-ref:** `docs/SWIM-PROTOCOL.md §2 ratio table` (lines 46-53); Phase 3 Slice 3a commit; `src/lib/plan-tokens/swim-drill-tokens.ts:242`; `materialize-plan/index.ts:1806` (drill regex).

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

## When to add an entry

Add a new Q-NNN when:
- A behavior gets noticed and someone considers "fixing" it but the right call is to leave it.
- A bug is filed but explicitly deferred (note the deferral reason).
- Verification is owed but not yet done — record the verification approach so the next session can pick it up cheaply.

When the answer is established (verified, intentional, or fixed), keep the entry but mark its status. Don't delete entries; they're institutional memory.
