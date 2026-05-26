# Efforts — Polish Punch List

Tracking the work to get the app from "engine works" to "every flow ships clean." No new features past this point. Only finish what's started.

Last updated: May 26, 2026 (cycling-attach cascade D-074..D-084 — eleven-layer bug investigation triggered by "May 23 Strava ride shows unattached in UI." Root finds: two silent PostgREST 42703s on phantom column names; isUnplanned ReferenceError swallowed by try/catch silently killing every cycling LLM call since D-046. Full narrative in docs/ENGINE-STATE.md Solid entry. Earlier today: overnight plan-gen batch D-064..D-069 — 486/486 matrix pass.)

---

## Core principle — architectural fix over bandaids

When a bug surfaces, **fix the architecture that allowed it**, not just the symptom.

If a label is wrong, ask why labels can drift from source.
If a counter resets unexpectedly, ask what contract the counter violates.
If a value doesn't appear, ask what threading or selection logic failed.

One-off fixes compound into architectural debt. Root-cause fixes prevent the next ten bugs of the same type.

**Canonical examples (May 10, 2026):**

1. **equipment_location vs capability_tier split.** Multiple display bugs (tier label wrong, protocol header wrong) traced to one root cause: athlete's location choice was being overwritten by capability inference. Fix: preserve location as separate field, rename capability tier to remove location implication, surface both honestly in export. One architectural change closed multiple bugs.

2. **Floor canonical-value contract.** Three "different" trade-off message bugs ("21.2335mi" string, no rounding, no race-specific cap) all traced to validate-training-floors returning raw math that flowed straight to athlete-facing messages. Fix: effective floor functions return a single canonical value (capped at race-specific peak, rounded for display) that both threshold and message read from. No downstream re-derivation possible. One return-value change closed the class.

3. **Explicit `rebuild` phase post-B-race.** Week 16 Push Press dropped from 105lb to 70lb because the next goal's `base` week 1 was indistinguishable from a fresh-start macrocycle to consumers (strength loads, swim ceilings, long-day floors). Initial debugging looked at the week-in-phase counter, but the counter was working correctly — the *model* was missing semantic information. Fix: add `rebuild` to the Phase enum, emit 1-2 rebuild weeks between recovery and the next goal's abbreviated cycle, populate `weeksSinceRaceIncludingRebuild` for diagnostics, and have each consumer read `phase === 'rebuild'` to apply pre-race × 0.85 (or +5%/wk ramp) instead of base values. One enum addition + scoped consumer arms closed Push Press, swim yardage, and long-day floor regressions in the same code path.

This principle applies to all remaining polish work.

---

## Process pattern (working)

For each numbered item:
1. Research the science / best practices
2. Write the protocol spec doc (in chat, save to repo)
3. Hand to Claude Code: "audit existing implementation against spec, report gaps, do not write code yet"
4. Review findings, pick scope
5. Implementation in rocks (commits)
6. Test, deploy

---

## 1. Strength 100% across user choices

**Status:** 100% — architecture complete; two known bugs closed D-048 (2026-05-25)

### Done
- [x] STRENGTH-PROTOCOL.md spec doc written
- [x] Durability protocol rewritten to AA-MS-SM (Norwegian/Friel)
- [x] Three-tier equipment classification (full_barbell / dumbbell_based / bodyweight_bands)
- [x] Performance gate when no barbell + no DBs (downgrades to durability with trade-off)
- [x] Maintenance + Power loads tuned (87% → 72%)
- [x] Taper Priming loads tuned (75% → 55%)
- [x] Sets bumped 3 → 3-4 in Hypertrophy and Strength Build
- [x] 1RM conservative defaults + trade-off message
- [x] Equipment summary line on every session
- [x] Power phase rotation (Push Press added)
- [x] Wizard surfaces equipment gate inline
- [x] Wizard surfaces intent labels with descriptions
- [x] Wizard surfaces 1RM warning when missing
- [x] Dumbbell tier exercise substitutions + load capping (Part 1)
- [x] Bodyweight + bands tier substitutions in durability (Part 2)
- [x] DB max wizard field for dumbbell-only athletes
- [x] Part 3 — exercise-level equipment gating (hasBench + hasBox substitution chains)
- [x] Equipment location preserved as athlete's literal choice (separate from capability tier)
- [x] Capability tier renamed from commercial_gym → full_barbell
- [x] Plan export shows both Equipment Location AND Capability Tier
- [x] "Strength Protocol: durability" mislabel fixed (suppressed for tri exports)
- [x] Week 16 Push Press regression — fixed at architectural level via explicit `rebuild` phase + canonical post-race ramp contract (strength reads previous build × 0.90 +5%/wk; long-day floors and swim ceilings continue pre-race progression)
- [x] Broad Jumps not appearing in power rotation — small targeted fix: removed `'push_press'` from dumbbell_based / bodyweight_bands tier rotations in `triathlon_performance.ts`. Home/DB athletes now rotate plyo + KB only, so Broad Jumps reaches selection in short race-prep windows.

### Open
- [x] 9-week edge case trade-off message — closed D-048 / 2026-05-25. `base_phase_skipped_short_plan` template fires from `buildSingleEventBlocks` when the backward-from-race packing leaves `baseStart >= buildStart` OR when `totalWeeks < 4`. Merged into `persistedTradeOffs` via `buildPhaseTimeline().phaseStructureTradeOffs`. 6 pin tests in `phase-structure-tradeoffs.test.ts`.
- [x] Minimum rebuild week count enforcement — closed D-048 / 2026-05-25 (conservative half). `rebuild_skipped_tight_window` trade-off now fires from the overlapping + tight non-priority-A branches at `phase-structure.ts:235-269` when `rebuildWeeksAfterRace` returns 0. The compress-taper-to-guarantee-rebuild question stays a product call (priority-A branch already chose taper > rebuild via the `windowWks < aTaperWks + 1` hard-fail; non-priority-A paths now visibly surface the compromise instead of skipping silently).
- [x] Verify all 6 intent × tier combinations end-to-end — **closed 2026-05-26** (Item 1 of the autonomous batch; sweep at `scripts/plan-test-output/` audited via `/tmp/strength-tier-sweep.mjs`). All 6 combos (performance / durability × full_barbell / dumbbell_based / bodyweight_bands) verified: 4 phases present per combo, no forbidden equipment, durability tiers all clean (14 sessions, 0 fails). Performance tiers showed 35 `% 1RM` string hits — closed by D-071.
- [x] Materialize-plan numerical resolution for % 1RM strings — **closed D-071 / 2026-05-26 (`2e07fb8c`)** — new `fallbackUnresolvedPercentDisplay(weight, reps)` helper in materialize-plan emits RIR-anchored cue ("Pick a weight you can do for 8 reps with 2 in reserve") when resolution chain bails on a "% 1RM" prescription (athlete missing relevant 1RM baseline). Wired into both materialize-plan call sites. 5 pin tests in `materialize-plan/index.test.ts` lock the contract.
- [x] **Recovery week strength load** — verified resolved 2026-05-25 (D-043 item 3 audit). Current `createPerfRecoverySession` (`performance-neural.ts:173-203`) explicitly excludes heavy spinal loading (no squats, no deadlifts — comment + exercise list confirm) and uses `% 1RM` for the light hip-thrust/step-up exercises that remain. `triathlon.ts:createRecoverySession` (`:701-752`) is bodyweight + light band only. The "2×8 @ 130 lb deadlift" hardcode this entry referenced no longer exists in either path — was a stale entry from before the protocol rewrite. No code change needed.

---

## 2. Swim program 100%

**Status:** ~96% — Phases 0-3 (§4.1 ramp, §6.2 pools, §6.3 hierarchy + pairing + tier biasing) shipped 2026-05-19; 2026-05-22 research-backed §5.2 / §6 / §8 revision (D-029) closed five more gaps; 2026-05-25 batch added D-051 (Race-Spec Aerobic 1500→2500 ramp), D-052 (4 new session types + phase rotation), D-053 (§0.5 athlete-vocab pass), D-057 (Q-016 Path A 30/20/10 partial), D-058 (Q-020 ankle band). Remaining: Q-016 multi-layer §2 full alignment (Path B / one-focus paths still unscaled).

### Done (2026-05-25 batch)
- [x] **D-051** Race-Specific Aerobic 1500→2500 ramp
- [x] **D-052** Four new session types (Time Trial / Open Water Skills / Mixed-Fartlek / Race-Pace Sustained)
- [x] **D-053** §0.5 athlete-vocab pass on swim copy
- [x] **D-057** Q-016 Path A drill ratio (30/20/10 partial)
- [x] **D-058** Q-020 ankle band wiring

### Done (2026-05-26 overnight batch — plan-generation matrix 486/486)
- [x] **D-064** Swim placed on rest_day silently dropped (masters_swim anchor + preference loop)
- [x] **D-065** Z3 jargon strip from downgradedHardToModerateFrom swim path (D-053 follow-through)
- [x] **D-066** Strength placed on rest_day silently dropped + load balancer rest_days awareness
- [x] **D-067** Plan-matrix harness recovery detector — peak instead of median (test-only)
- [x] **D-068** WoW TSS ramp ceiling calibration — distance-aware (0.24 half-IM / 0.30 full-IM)
- [x] **D-069** first_race base-phase quality run — sweetSpotRun replaces intervalRun

### Done (2026-05-26 cycling-attach cascade — eleven layers, all-sports silent 42703s, dormant ReferenceError)
- [x] **D-074** plans.start_date phantom column reverted; environment:'pool' DEFAULT no longer surfaces on non-swim planned rows (activate-plan row construction)
- [x] **D-075** analyze-cycling-workout planned_workouts SELECT (silent 42703 on workout_type/workout_name → plannedWorkout: null → UNPLANNED MODE for every linked cycling ride)
- [x] **D-076** "unplanned route" LLM hallucination — HARD BAN cycling prompt rule + "climbing route" → "climbing day" seed-word removal
- [x] **D-077** FTP "Edit to override" tap handler fix in TrainingBaselines.tsx + docs/FTP-COLD-START-SPEC.md saved
- [x] **D-078** recompute-workout force-regenerates ai_summary; preservation fallback only fires on ingest-activity transient errors
- [x] **D-079** analyze-cycling-workout writes recomputed_at (run-side parity, closes workout-detail cache-bust gap)
- [x] **D-080** debug log for ledger-match resolution (instrumentation; removed in D-081 commit after surfacing the data point)
- [x] **D-081** workout-detail planned_workouts SELECT (silent 42703 on swim_unit/baselines_template/baselines — affected ALL sports, every linked workout rendered as unplanned)
- [x] **D-082** LLM diagnostics instrumentation (callLLM debug sink + workout_analysis.ai_summary_debug field — kept in for future dormant-exception hunting)
- [x] **D-083** isUnplanned ReferenceError silently killing every cycling LLM call since D-046 (2026-05-25). Exception swallowed → preservation fallback re-served stale text → no narrative actually being LLM-generated for ~1 day.
- [x] **D-084** "unknown effort" POWER row (normalizePlanIntent('ride') returned literal 'unknown', short-circuited fallback classifier) + Duration chip absolute time (was showing +/- delta)


### Done
- [x] Drill display names lookup
- [x] Sighting drill added end-to-end
- [x] Equipment-aware session substitution
- [x] Per-session gear summary line
- [x] **§5.2 tier-adjusted CSS Aerobic rest** (2026-05-22, `92af2072`, D-029 Slice 1 / Fix 3) — beginner 25s / intermediate 15s / advanced 15s START rest; token grammar varies.
- [x] **§5.2.1 within-phase CSS rest-interval lerp** (2026-05-22, `fc517e12`, D-029 Slice 2 / Fix 4) — rest tightens across the phase ramp per 220 Triathlon CSS progression; same `weekInPhaseForTimeline` mechanism as §4.5 / §4.1 volume ramps.
- [x] **§8.4 fins/paddles split for beginners** (2026-05-22, `130de4b2`, D-029 Slice 3 / Fix 1) — fins SURFACED as `recommended:fins` for beginner Technique Aerobic + beginner CSS Aerobic when owned; paddles stay suppressed.
- [x] **§6.6 drill-level equipment recommendations** (2026-05-22, `130de4b2`, D-029 Slice 3 / Fix 2) — fingertipdrag + fist always recommend fins; 6-3-6 recommends fins for beginners only.
- [x] **Sculling hard-gate from beginner inset** (2026-05-22, `130de4b2`, D-029 Slice 3) — beginners never get sculling drills regardless of phase / pool diversity.
- [x] **Per-step effort-tier propagation to Garmin export + Form Goggles** (2026-05-22, `92af2072`, D-029 Slice 1 bundle) — each swim work step now carries `intensity: easy/moderate/hard`; Garmin watch face shows the tier, not the internal session-type tag.
- [x] **`recommended:*` tag class** (2026-05-22, `130de4b2`, D-029 Slice 3) — parallel to `optional:*` with distinct semantics; three-section Pool gear line render.

### Open
- [x] Week 7 build week showing 1,750yd recovery-level volume — bug *(2026-05-19, `c1c94cec` Phase 1 band-lerp + weekInPhase wiring; mechanism locked by `swim-volume-ramp.test.ts` on base, identical for build)*
- [x] Race-Specific Aerobic sessions too short (1,000yd) — should scale 1,500-2,500yd by phase — **closed D-051 / 2026-05-25 (`dc7470d3`)**
- [x] Drill rotation only working in Technique Aerobic sessions *(2026-05-19, Slice 3a `e723d246` ratified §6.3 ↔ §5 hierarchy — Path B drill rotation in threshold/CSS/race-spec/etc. is now per-spec single-drill, not a bug)*
- [x] Equipment line duplicating on some sessions — **closed D-043 / 2026-05-25** (client-side suppression in `AdherenceChips.tsx` when description already contains Pool gear line; duplicate listing at line 271 below is the original close-out entry)
- [x] Wire new drill tokens (Single-Arm, 6-3-6, Zipper, Sculling) into session generators *(2026-05-19, Phase 2 `ef91c2ee` — singlearm/616/scull/scullfront/zipper added to base/build pools; singlearm to peak; fingertipdrag to taper)*
- [x] Add missing session types: Swim Time Trial, Open Water Skills, Mixed/Fartlek, Race-Pace Sustained — **closed D-052 / 2026-05-25 (`6049bcc1`)** (four new SWIM-PROTOCOL §5.7-§5.10 session types wired into the race-intent two-swim rotation with phase-aware substitution)
- [x] **Q-020 ankle band enum addition** — closed D-058 / 2026-05-25 (commit b20d1aaa). Added as a separate chip adjacent to Pull buoy in TrainingBaselines.tsx; normalized in swimGearNormalized; surfaces as `optional:ankle_band` tag on pull_focused sessions for beginner-tier athletes only. 41/0 swim tests green.
- [ ] Standardize all swim intensity references to CSS percentages
- [x] **CSS terminology strip + per-step drill equipment in exports** *(D-030, 2026-05-22 — spec `3833024f`, Step 2 `22642fa4`, Steps 3+4 `9d178ca9`)* — athlete-facing copy uses easy/moderate/hard tier vocabulary; internal session-type words stripped from session names + descriptions + trade-off + wizard + Garmin step labels + Form Goggles narrator + zone strings. SWIM-PROTOCOL §0.5 defines the canonical mapping table + anti-regression rule. Drill steps surface owned recommended gear via parenthetical hint (e.g. "Drill — Fingertip Drag (fins)"). 36 new pin tests across 3 new files; full sweep 899/0.

---

## 3. Cycling 100% — stop calling Z2 weekday rides "long rides"

**Status:** Phase 0 spec + Phase 1 volume ramp + Phase 2 race-pace brick closing block + Phase 3 bikeOpeners race-week gating shipped. Phase 4 (limiter dial) intentionally deferred.

### Done
- [x] Write CYCLING-PROTOCOL.md spec doc — 2026-05-21 (`42b2d2c3`), 412 lines structurally parallel to RUN-PROTOCOL.md / SWIM-PROTOCOL.md
- [x] **Cycling arc Phase 1 — within-phase volume ramp** — 2026-05-21 (`61faf828`, D-028). `longRideHoursForWeek` lerp helper (§4.5 endpoints LOCKED: base 0.65→0.75, build 0.75→0.85, RS 0.85→1.00); sweet-spot / threshold / VO2max rep ramps per §10.4 + §5.6; validator parity (`effectiveLongRideFloorHours` within-phase-aware, mirrors D-027). 15 new pin tests; 285/0 in generate-combined-plan suite.
- [x] **Cycling arc Phase 2 — race-specific brick-bike race-pace closing block** — closed D-049 / 2026-05-25. `brick()` at `session-factory.ts:1734` now emits structured Z2 base + Z3 race-pace closing (~30 min, target 0.78-0.82 IF for 70.3 / 0.62-0.68 IF for full IM) in `steps_preset` and description for race_specific phase bricks ≥ 60 min. Shorter bricks keep the single-zone Z3 tag. 5 pin tests in `brick-race-spec.test.ts`.
- [x] **Cycling arc Phase 3 — `bikeOpeners` race-week-only gating** — closed D-043 item 10 / 2026-05-25. Gate at `week-builder.ts:1461` now scopes to `phase === 'taper' && raceThisWeek`, mirroring the swim-activation gate at `:914`. Non-race-week taper falls through to the existing quality-bike / group-ride logic — no behavior change for those weeks; openers special-case no longer pre-empts.

### Open
- [ ] **Cycling arc Phase 4 (deferred)** — `limiter_sport='bike'` intensity dial; same shape as `limiter_sport='run'` Phase 4 deferred work.
- [ ] Audit cycling session naming — "Long Ride" only the genuine weekly long session
- [ ] Distinguish Easy / Endurance / Long / Quality / Brick rides
- [ ] Verify cycling power zones (read from athlete FTP)
- [ ] Audit brick session structure
- [ ] Confirm Wednesday group ride anchor flows through correctly

---

## 4. Wizard language + clarity

**Status:** ~60% — strength step clear; D-054 (2026-05-25) full audit shipped to `docs/WIZARD-AUDIT.md`; D-056 batch (2026-05-25) closed engine-vocab leaks + A/B/C tooltips + Hybrid rename + hours note + ordering note + building indicator + Not-sure-default option + long-day same-day warning. Remaining: glossary tooltips (G1 follow-up), mid-wizard jump-back navigation (G5), plan-start surfacing earlier (G7).

### Done
- [x] Strength step: intent labels with descriptions
- [x] Strength step: equipment gate inline warning
- [x] Strength step: 1RM warning when missing
- [x] **D-054** Full wizard audit → `docs/WIZARD-AUDIT.md` (no UI changes)
- [x] **D-056 Item 1** Engine vocabulary copy pass (anchor/contract/standalone/blend/quality-as-label)
- [x] **D-056 Item 2** A/B/C priority explainer chips
- [x] **D-056 Item 3** "Hybrid Strength Athlete" renamed to "Strength as a training priority (2× weekly compound lifting)"
- [x] **D-056 Item 4** Step7BHours hours-inclusion note
- [x] **D-056 Item 5** Step8bStrengthOrdering "only matters when same-day" lede
- [x] **D-056 Item 6** Step9Confirm building-progress animated indicator + estimated-time copy
- [x] **D-056 Item 7** "Not sure — use the recommended default" option on Step3Swim / Step8Strength / Step8bStrengthOrdering
- [x] **D-056 Item 8** Step6LongDays inline non-blocking same-day warning
- [x] **D-055 Item 11** training_intent copy softening (completion/first_race match engine reality)

### Open
- [ ] Audit every wizard step — each question's purpose clear (closed via D-054; remaining items below are the WIZARD-AUDIT follow-ups)
- [ ] Surface tradeoffs at decision time, not after plan generation (partial — D-056 Item 8 addresses long-day; G2 remaining)
- [x] Link each equipment chip to what it unlocks — **closed D-070 / 2026-05-26 (`c3e555b2`)** — `swimmingEquipmentHints` map in `TrainingBaselines.tsx` provides one-line "what this unlocks" copy for each swim equipment chip (Pool access, Open water access, Paddles, Pull buoy, Ankle band, Kickboard, Fins, Snorkel); surfaced via the chip's `title` attribute (hover tooltip). `ArcSetupWizard.tsx` checked — no swim chips live there. Strength equipment chip tooltips deferred — separate scope.
- [ ] Explain what each baseline input drives
- [x] **`training_intent` wizard copy vs engine reality** — **closed D-061 / 2026-05-26** (commit a5762100). Combined-plan engine now differentiates `performance` vs `completion` vs `first_race`/`comeback` on three axes: loading pattern (3:1 / 2:1 / 1:1 recovery cadence — overrides athlete pin), base-phase interval rep cap (first_race/comeback at 80%), build-phase VO2 gating (completion bans VO2; first_race/comeback gates VO2 until weekInPhase ≥ 4). 13 pin tests in `training-intent-differentiation.test.ts` lock the contract. Swim + strength intent wiring still open as separate Ticket B items per user direction. The 2026-05-25 D-055 wizard copy softening (Item 11) and this engine wiring together close the wizard-promise-vs-engine-reality gap for `training_intent`.
- [x] **`strength_preferred_days` is engine-generated but exported as "Athlete preference" (2026-05-12 verification — plans #57, #58).** The wizard has NO strength-day pinning question. The strength step asks intent (Hybrid / Durability / None) + same-day ordering preference (Endurance first / Strength first) and that's it. The optimizer (`deriveOptimalWeek`) picks strength days from anchors + matrix constraints, then `reconcile-athlete-state-week-optimizer.ts:270` writes them back to `strength_preferred_days` — the same field a wizard pin would use. Plan export then surfaces them under "Preferred days: Strength: tuesday (upper body), friday (lower body)" as if athlete-pinned. The trade-off composer also reads this field and emits incoherent "preferred day rejected" messages when the value is engine-generated. The Bug 2 fix in `format-wizard-prefs-export.ts` (commit `64f253de`) suppresses engine-derived `preferred_days` keys when the corresponding pin field is empty — but for strength, the engine writes to the SAME field a wizard pin would, so the heuristic doesn't fire. **Fix:** split the storage — `strength_optimizer_days: string[]` written by the reconciler, `strength_preferred_days` reserved for wizard pins only (currently never set). Export labels them differently ("Strength (scheduled by app):" vs "Strength:"). Trade-off composer skips "preferred day rejected" emissions when the source is the optimizer's own placement. Adding a wizard pin question (option a from user analysis) deferred — most triathletes don't have strong day preferences for strength, and the wizard is already long. **✅ FIXED 2026-05-17 (`71611501`, D-017)** — provenance split shipped, but NOT as worded here: scope corrected during impl (flagged + approved) to reuse the existing `strength_optimizer_slots` (no new field, no `mergeCombinedSchedulePrefs`/`CombinedSchedulePrefs` change), root-fix at `reconcile:276` + `create-goal:~904` strip+persist (the `freshCombinedPrefs` sites become wizard-only automatically), and NO composer-side suppression (root fix stops the optimizer being fed phantom prefs — a composer suppress would swallow legitimate pin-rejection trade-offs). Net 4 files. Pre-fix goals clean on regenerate (no migration). Wizard pin question still deferred. Tests/build green; live-regen verification still owed.
- [ ] **`scaledWeeklyTSS` reads declared hours, not endurance-adjusted hours (2026-05-13 verification — Plan #60 build week landed at 11h55m vs 11hr budget after §2.1 swim drop).** §2.1 (commit `cf68cf43`) re-tiers a hybrid 11hr athlete to `8-10` (was `10-12`), correctly dropping swims from 3 → 2. Build-week emit dropped from 12h19m to 11h55m — a 24-min reduction, not the full ~80-min reduction expected from dropping one swim slot. Root cause: `week-builder.ts:674 scaledWeeklyTSS(phase, current_ctl, weekly_hours_available, tssMultiplier)` reads the athlete's declared 11hr to compute the TSS budget. The TSS budget still reflects 10-12 tier numbers (~700-800 build TSS) — when one swim slot disappears, the remaining sessions absorb the freed TSS and grow slightly longer (Friday swim was 51m at 1000yd pre-§2.1; post-§2.1 it's still ~51m at 3200yd CSS aerobic, redistributing the freed budget back into one larger swim instead of two smaller ones). The matrix returns the right session COUNT for hybrid; the budget still treats them as endurance-only volumes. **Fix:** pass endurance-adjusted hours to `scaledWeeklyTSS` (or, cleaner, plumb the `endurance_hours` value out of `computeSessionFrequencyDefaults` as a new field on `SessionFrequencyDefaults`, then read it in the week-builder). Predicted effect: TSS budget scales down to 8-10 tier (~550-650 build TSS), session durations shorten proportionally, hybrid 11hr athlete lands at ~11h flat instead of 11h55m. 24min/wk over-prescription compounds across 12 build/peak weeks — meaningful but not blocking; ship §2.1 first, follow up here.
- [x] **`swim_experience` not gating swim volume — learners getting 3000+ yd aerobic sessions (Ticket B territory, 2026-05-13 verification — Plan #60).** *(Closed 2026-05-20, `95e712cc` / D-022.)* The wiring half shipped in `0fd17ad9` (`swim_experience='learning'` → `score -= 1` in `inferTrainingFitnessLevel`); the per-band ceiling residual closed by `learnerSessionCap()` in `getProtocolCeiling()` — beginner 70.3/full athletes now cap at 2500yd aerobic / 2000yd threshold per session. Endurance OD window's 4600yd is also gated for beginners. **Plan #60 W6 specifically NOT closed by this** — that documented athlete (high-CTL learner, `swim_experience='learning'`) resolves to `intermediate` per Q-006, not `beginner`. Q-006's structural fix (separate `swim_fitness` tier override) is the proper closure for that population. See ENGINE-STATE Solid "swim-protocol-volumes Ticket B learner per-session cap (2026-05-20 fix)" + D-022.

---

## 5. Every flow question delivers something

**Status:** ~30% — most questions wired, no end-to-end audit done

### Open
- [ ] Audit each wizard question, confirm engine reads it
- [ ] Remove dead questions
- [ ] Document what each input drives
- [ ] Verify equipment chips → strength protocol selection
- [ ] Verify 1RM data → strength loading
- [ ] Verify FTP → cycling power zones
- [ ] Verify CSS / threshold pace → swim intensity
- [ ] Verify threshold pace / VDOT → run zones
- [ ] Verify recent training history → volume floor calibration
- [x] Tradeoff messages should disappear when their question isn't violated — **closed D-072 / 2026-05-26 (`58a6760c`)** — `filterAthleteFacingTradeOffs` was wired into the aggregator but bypassed by the per-week `week_trade_offs` pipeline in `generate-combined-plan/index.ts`. Per-week now threads through the same filter with `hasAthletePinsFromPrefs(state)` gating anchor-reference messages. Internal optimizer telemetry ("Strength: default Monday upper moved...", "Weekly load balance: moved...", "Weekly layout: moved...") no longer leaks to per-week display. 4 pin tests in `_shared/plan-generation-trade-offs.test.ts` lock the contract.
- [x] **Concurrent training spacing constraint — HIGH severity scheduling defect.** ✅ Shipped 2026-05-11 for combined-plan generator. `docs/SCHEDULING-RULES.md §4.21` codifies the rule; `_shared/week-optimizer.ts` enforces strict 24h/48h spacing + sandwich rejection + tier ladder (CLEAN → SOFT → SANDWICH → DROP); `_shared/schedule-session-constraints.ts:SESSION_PRIME_MOVER` provides the prime-mover taxonomy. §5.1 performance-intent carve-out deprecated. Research cited inline: Hickson 1980, Wilson et al 2012, Robineau et al 2016, Coffey & Hawley 2017, Petré et al 2021.
- [ ] **Apply §4.21 to other plan generators.** Above fix is combined-plan only. `generate-run-plan`, `generate-triathlon-plan`, `generate-plan` have independent placement pipelines that were NOT routed through the new rule. Audit each, identify placement entry points, apply prime-mover taxonomy + tier ladder. Use `_shared/week-optimizer.ts` as the reference implementation. **2026-05-26 audit (Q-031):** `generate-plan` is a 71-line input-validator stub with no callers (dead — consider deleting). `generate-triathlon-plan` emits high-level intents only with no per-day placements (§4.21 doesn't apply at that layer). `generate-run-plan` uses `simplePlacementPolicy` which is explicitly day-agnostic — making it §4.21-aware needs a design pass, not a wire-up. Tracked in **Q-031** with concrete blockers + recommended next move.
- [ ] **Consolidated strength-integration mode (Model B) — research citations + spec.** §4.21 today implements "Separated" mode (strength on its own days, away from hard endurance — concurrent-training-spacing strict). Hybrid practitioners use a different "Consolidated" mode where strength stacks AM/PM with quality endurance on the same calendar day; hard days get harder, rest days get protected. The §5.2 consolidated-hard-day pattern the optimizer already produces (Thu AM quality_run + PM lower) is functionally Model B in disguise — lean into it as the explicit mode rather than treat as exception. Spec needs: wizard question (Separated default vs Consolidated opt-in), parallel rule set in engine, research basis. Citations to gather: Fergus Crawley / Omnia hybrid framework; Nick Bare PRESCRIBED methodology; Blaine Lints (Tactical Hybrid); Petré et al 2021 (re-read for support of either approach depending on consolidation); Murach & Bagley 2016 (skeletal muscle adaptation to concurrent training, AM/PM separation); Sale 1990 (post-activation potentiation favors AM strength before PM endurance in some protocols). Document in a new `docs/CONSOLIDATED-MODE.md` spec before code; parallel to §4.21 separated mode in SCHEDULING-RULES.md.
- [x] **`aerobic_direction` wired into workout INSIGHTS** — closed D-042 / Q-023 resolved. Path A wire: `signals.aerobic_efficiency_trend_pct` + `signals.aerobic_direction` (improving/stable/declining) surface on display packet. AEROBIC EFFICIENCY TREND prompt rule fires when non-null; translate-only, never quotes the percentage; frames as weekly longitudinal background, not per-session verdict.
- [x] **TREND sparkline measures raw pace, not pace-at-HR.** — **closed D-050 / 2026-05-25 (`e95b3c94` → `1f11555e`)** (Q-025 closed; pace_at_hr field added to trend points, K=3 recent-pair-slopes percentile classifier replaces whole-window LR slope; DB column rename `run_easy_hr_trend` → `run_easy_pace_at_hr_trend` shipped D-060)
- [x] **"X days post-marathon" backward anchor leaking on unplanned sessions with no plan link.** — **closed D-046 / 2026-05-25 (`97111a01`)** (new `arcUnplannedBackwardAnchorAddon` helper in `_shared/arc-narrative-ai-appendix.ts` wired into running ai-summary at `fact-packet/ai-summary.ts:~1175` and cycling at `cycling-v1/ai-summary.ts:~400`)
- [x] **`hr_delta_bpm` resolves null on some recomputed sessions despite sample_size > 0 (Q-024).** — **closed D-047 / 2026-05-25 (`244c22c4`)** (asymmetric resolution: current side checked only `overall.avg_hr` inline while pool side used three-stage `getOverallAvgHr` chain; fix exports the helper and uses it on both sides; 7 pin tests in queries.test.ts lock the contract)

---

## Queued for next sessions (Theme A complete 2026-05-11)

These are the architectural threads opened during the 2026-05-11 session, scoped and queued for follow-up. None are blocking today's ship.

### Bugs first (single session — surfaces from 2026-05-11 Santa Cruz + NorCal multi-sport plan export)

Reference corpus: `~/Downloads/ironman-70.3-santa-cruz-+-ironman-70.3-northern-california-—-multi-sport-plan (48).md`. These four bugs are queued AHEAD of the race-week protocol because they surface generation-time defects that would muddy the race-week audit if left in place.

- [x] **Bug 1 — Trade-off message divergence.** Trade-off generator reads from `preferred_days` field; actual session placement can diverge from that field (e.g., engine relocates a quality day post-pin). Result: athlete-visible trade-off names a day that doesn't match the schedule. Fix: trade-off composer reads from the realized `week.days[*]` graph, not the exported `preferred_days`. Single source of truth. **PARTIAL — strength half FIXED 2026-05-17 (`71611501`, D-017):** the provenance split removes the strength divergence at the source (engine strength no longer in `preferred_days`, so the optimizer no longer emits bogus strength "preferred rejected/shifted" lines). **Piece B CLOSED 2026-05-18 (D-018).** The live multi-sport regen showed the residual was far narrower than the audit framing: no "moved to Y" / "sits N days from" / quality-line *day-name mismatch* materialized on the realized plan (the audit over-stated scope — same pattern as Bugs 3 & 4). The single visible defect was a *duplicated* QR+lower consolidation line (optimizer canonical-pattern copy + builder realized copy). Slice 1 (`60338100` — jargon strip + delete optimizer `week-optimizer.ts:1237` push) + Slice 2 (`1fff344b` — delete the two surviving sibling pushes `:1604-1606` live co-equal-2× / `:1756-1758` dead twin; builder-coverage gate verified) make the builder's realized-accurate `collectQualityRunLowerBodyTradeOffs` the sole owner. Live-regen verified 2026-05-18: Line 1 gone, builder Line 3 remains; the upper↔lower spacing line and Wk9/10 long-ride-floor lines are accurate/legitimate, not divergence. Fully closed.
- [x] **Bug 2 — preferred_days default cleanup.** Engine returns wizard-style pins for days the athlete did NOT explicitly pin (defaults leak into the "athlete preference" surface). Result: plan export shows "Strength: friday (upper), wednesday (lower)" as if athlete-pinned when those were engine-chosen defaults. Fix: distinguish athlete-pinned from engine-chosen at the export layer; only surface pins when the athlete actually picked the day. **✅ FIXED 2026-05-17 (`71611501`, D-017)** — provenance split: engine strength → `strength_optimizer_slots` only (exported "Strength (scheduled by app):"), never the pin field. The non-strength keys were already handled by `64f253de`'s pin-field heuristic; strength was the residual the engine defeated — now severed at `reconcile:276` + `create-goal:~904`. Pre-fix goals clean on regenerate.
- [ ] **Bug 3 — §4.21 week-boundary fix.** `sequentialOk` checks `prevKinds = days[dayBefore(day)]` within the SAME week's grid. Cross-week adjacency (Sunday W_N long_run → Monday W_N+1 lower) is invisible to the rule; the engine builds each week independently. Result: Monday lower can land 24h after Sunday long_run when week boundary intervenes. ~~Fix: thread previous-week-Sunday context into `sequentialOk` for Monday placement, OR extend the grid to a rolling 8-day window.~~ **⚠️ STATED FIX IS A VERIFIED NO-OP (2026-05-17 investigation).** `deriveOptimalWeek` emits ONE canonical weekday pattern replayed across all weeks, and `dayBefore` is circular (`week-optimizer.ts:48-51`) so `sequentialOk` for Monday ALREADY checks the same ring's Sunday — W-004 `anchor-contract.test.ts:116-137` ("Lower never lands Monday after Sunday long_run") passes today. Threading prev-week context is redundant for the steady-state pattern. The wild violation in plan #48 was downstream of Bugs 1–2 (realized placement diverging from the pinned/canonical pattern) and/or per-week pattern variation (a `week-builder.ts` replay-revalidation gap, NOT `sequentialOk`). **RE-SCOPE after observing post-Bugs-1&2 behavior** — do NOT implement the `sequentialOk` thread. No deliberate decision/regression-guard (unlike Bug 4/Q-011); genuine but mis-framed gap.
- [x] **Bug 4 — Brick-as-long-ride validator.** The user-visible defect (false "no long ride scheduled (observed=0)" warning when a brick replaces the standalone long ride) was **FIXED 2026-05-12** — the soft floor `maxLongRideMinutes` (`validate-training-floors.ts:~386`) now counts brick bike legs toward long-ride durability. The hard enforcer's brick exclusion (`findLongRideSessionInWeek:~517`) is a **deliberate, regression-guarded training-science decision, not reversed** (a brick is a distinct stimulus and must not be force-extended to the long-ride floor; `BRICKS_PER_WEEK['rebuild']=0` guards the week-16 1.8h regression). The original framing ("build/race weeks fail floor checks") was inaccurate — no hard long-*ride* floor exists (only long-*run* TSS share + WoW ramp). Closed as done + documented; boundary recorded in **Q-011** so it's never re-litigated.

### HIGH severity
- [x] **Race-week protocol audit — COMPLETE & SHIPPED (Phases 1–4, 2026-05-18).** _Reordered: runs after the four bugs above close, since cleaning generation-time defects first makes race-week audit signal cleaner._ Race weeks aren't yet treated as a distinct architectural class. The race-week-brick-0 cap (`week-builder.ts:765 effectiveBricks = raceThisWeek ? 0 : …`) was introduced by commit `5d8f1577` ("two tri races by calendar order") — **NOT `e0aad332`** (prior attribution corrected). Week-level structure (taper-into-race transition, race-day session shape, post-race rebuild handoff) needs a dedicated protocol spec. **Read-only audit complete → `docs/RACE-WEEK-PROTOCOL.md`:** the realized two-70.3 reference plan has **B-race = Week 13, A-race = Week 17** — the earlier "Week 14 / Week 18" were synthetic `rebuild-phase.test.ts:46` fixture numbers, not the reference plan (Week 14 is the post-B-race *recovery* week). Core finding: no first-class race-week concept — behavior is emergent from `raceThisWeek` (`week-builder.ts:602`, no A/B flag) + the race week being a plain `taper` block + a hardcoded race-day overlay (`:1836-1861`). **9 contract gaps** enumerated, each framed as DECISION NEEDED (RACE-WEEK-PROTOCOL §5/§8). **CLOSED 2026-05-18 — decisions made + implemented:** Phase 1 `4a63f44e` (§8.1 priority-driven A/B + chronology guard), Phase 2 `9c393119` (§8.3 distance-aware race day + §8.4 hard guarantee), Phase 3 `7221b8d5` (§8.2 A-taper inviolable + §8.5 min-rebuild + Decision-A hard-fail), Phase 4 `f7580ec5`/`3076ba72`/`0b54318d`/`95bd017e` (§8.6 Gap 6/9b-d/8-T6/7). Live-verified (B=13/A=17, full 2wk A-taper) + deno regression locks (`generate-combined-plan` 189/0; T6 E2E). Rationale → D-019; verified-state → ENGINE-STATE "Solid". The sibling `bikeOpeners` over-broad `phase==='taper'` gate (`week-builder.ts:1298`) was deliberately scoped OUT — see Background→Open backlog.

### Theme B — Strength integration mode (Separated vs Consolidated)
- [ ] Wizard question + copy: "How should strength fit into your week?" with Separated / Consolidated options + research-backed copy (Hickson 1980 cited for Separated; Crawley/Omnia, Nick Bare, Blaine Lints cited for Consolidated). Default Separated.
- [ ] AthleteState `integration_mode` field + payload threading from wizard through reconciler to optimizer.
- [ ] Parallel engine rule set: `mode === 'separated'` keeps today's §4.21 strict 24h spacing; `mode === 'consolidated'` inverts — strength_lower + leg_quality SAME-DAY is preferred placement, separated becomes the trade-off. §5.2 consolidated-hard-day pattern already exists as the implementation foundation.
- [ ] New `docs/CONSOLIDATED-MODE.md` spec parallel to §4.21 separated mode.

### Theme C — Wizard gates and minimum-day warnings

> **Spec lifted to `docs/DAY-COUNT-GATES.md` (2026-05-20).** The matrix below is the punch-list version; the authoritative contract (with rationale, math, carve-out matrix, and phased plan) lives in the spec doc. Read it before implementing.

- [ ] Day-count gate matrix at wizard (after distribution philosophy question):
  - Hard block: 5d + Co-equal + Separated; 5d + Performance + Any; <5d + Performance
  - Soft warn: 6d + Co-equal + Separated; 5d + Co-equal + Consolidated; <5d + Co-equal
- [ ] Warning copy template: "Tight fit. {session_count} sessions in {days} days with {spacing_rule}. Options: [bump days] [switch mode] [continue] [drop intent]."
- [ ] Hard-block copy template surfacing the actual math.
- [ ] Wire gate logic from (days × hours × intent × integration_mode) — session count from frequency matrix, spacing rule from §4.21 (separated) or §5.2 (consolidated).
- [ ] GATE-BLOCK flag from `computeSessionFrequencyDefaults` (commit `4700db5a`) wired to the wizard's refusal path.

### Item 2 — Swim protocol audit
- [ ] `SWIM-PROTOCOL.md` exists but audit pattern (per process: write spec → audit existing impl against spec → report gaps → scope) has not yet been run.
- [ ] Cross-check swim session generation against the documented protocol; identify drift.

### Item 3 — Cycling protocol audit (CYCLING-PROTOCOL.md missing)
- [x] **Cycling protocol arc Phase 0 + Phase 1** — `docs/CYCLING-PROTOCOL.md` authored 2026-05-21 (`42b2d2c3`); Phase 1 within-phase volume ramp shipped 2026-05-21 (`61faf828`, D-028). Phases 2-4 remain (see §3 above for breakdown).
- [x] Write `CYCLING-PROTOCOL.md` spec doc — 2026-05-21 (`42b2d2c3`, 412 lines, structurally parallel to RUN-PROTOCOL.md / SWIM-PROTOCOL.md). §3 Phase 0 line item closed.
- [ ] Distinguish Easy / Endurance / Long / Quality / Brick rides; stop calling Z2 weekday rides "long rides." (Phase 2 territory — naming audit follows the brick-bike race-pace work.)
- [ ] Verify cycling power zones flow from FTP correctly.
- [ ] Confirm Wednesday group ride anchor threading.

---

## Background items (not blocking, surface as bugs are observed)

### Done
- [x] Floor numbers showing extra decimals ("21.2335mi") in tradeoff messages — fixed at architectural level

### Open
- [x] **Tradeoff message filtering** — verified resolved 2026-05-25 (D-043 item 8 audit). `isInternalOptimizerTelemetry` (`_shared/plan-generation-trade-offs.ts:69-82`) filters `^Weekly layout: moved\b`, `^Strength: default Monday upper moved\b`, `^Strength: default Monday/`, swim-budget bookkeeping patterns. Applied at `aggregateOptimizerScheduleSignals` + `enrichScheduleSignalsWithCombinedPlanTradeOffs` boundaries (4 call sites in `create-goal-and-materialize-plan/index.ts`). Patterns the entry references are filtered; infrastructure complete.
- [x] **Brick session in plan export markdown** — verified resolved 2026-05-25 (D-043 item 9 audit). End-to-end path traced: session-factory emits `['brick', 'bike', …]` / `['brick', 'run', …]` tags at `session-factory.ts:1727, 1740`. Tags flow through `generate-combined-plan/index.ts:442` into the response payload and persist on `planned_workouts`. Export client at `AllPlansInterface.tsx:1715-1756` filters by `w.tags.includes('brick')` and merges into combined bullets ("Brick — Bike Xhr + Run Ymi"). Both `bike` and `ride` type labels accepted. Stale POLISH entry; no code change needed.
- [x] **Schedule Adjustments panel hides when empty after filtering** — verified resolved 2026-05-25 (D-043 item 8 audit). `scheduleSignalsNonEmpty` (`src/components/GoalsScreen.tsx:50`) gates the panel on `trade_offs.length > 0 || conflicts.length > 0 || pin_restore_skipped.length > 0 || used_co_equal_1x_fallback`. Panel hides entirely when all four are empty/false.
- [ ] Bypass-path audit for strength_intent normalization
- [ ] **`phase-structure.ts:97-102` no-user-A `totalWeeks` truncation** — when no goal is genuinely priority-A, `:100` mutates `sortedGoals[0].priority='A'` (priority-then-date sort ⇒ the *earliest* goal), so `lastAGoal`/`aRaceWeek`/`totalWeeks` (`:104-107`) are computed from the *earlier* race → a no-user-A multi-tri plan can truncate before the later (season-final) race. **Discovered during race-week Phase 1 (`4a63f44e`); pre-existing, NOT introduced there.** Not blocking — real plans set a priority-A goal; Phase 1's genuine-priority capture sidesteps it for A/B *tagging* but does not fix the `totalWeeks` path. Fix is risky: the `:97-102` mutation also feeds the non-tri / `aGoals` branches, so it needs a scoped fix (derive `lastAGoal` from the chronologically-last goal, or stop mutating shared refs) + its own regression set. Candidate for race-week Phase 4 cleanup or a standalone ticket.
- [~] **Bug A — workout attach/detach.** Error 2 (UnifiedWorkoutView Unattach `ReferenceError: setCurrentPlannedId`) **FIXED `14e3f183`** — `usePlannedWorkoutLink` now exports the existing setter; handler runs to completion. **Error 1 OPEN:** `detach-planned` returns an *application-level* 404 (function deployed/ACTIVE + name-match confirmed — so `reason:'workout_not_found'` `detach-planned/index.ts:41` OR `'planned_not_found_or_wrong_user'` `:63`). **Blocked-on-artifact:** the failing response body's `reason`/`details` (network tab). **Secondary defects (queued behind Phase 4/Theme B):** sticky-attach DB triggers re-link a detached workout (`20251001_sticky_attach_triggers.sql`); `suppressRelinkUntil` (`UnifiedWorkoutView.tsx:121,781`) set-but-never-read (dead guard); detach optimistic UI clears unconditionally (catch only `console.warn`s); attach/detach (+ `materialize-plan`/`ensure-planned-ready`/`validate-reschedule`) use native `supabase.functions.invoke` whose installed 2.105.4 path internally awaits `supabase.auth.getSession()` (iOS/WKWebView hazard purged elsewhere) → likely fully broken on iOS, works on web. Zero test coverage.
- [ ] **Bug B — strength logger loses state on iOS sleep/app-switch.** Persistence EXISTS & intact (`StrengthLogger.tsx` localStorage `strength_logger_session_<date>`, per-set save + restore-on-mount, added `556c4850`). Real defect is one level up: the *open* state (`AppLayout.tsx:62` `showStrengthLogger` useState — not persisted, **no route**). Cause 1 (primary/latent): iOS WKWebView teardown → cold reload → AppLayout mounts logger-closed; no `@capacitor/app` resume listener; logger has no route to rehydrate (vs `ArcSetupWizard` which has a route + draft → self-restores). Cause 2 (regression `dc85e9d0`, 2026-05-06): `AuthWrapper` now `setSessionResolving(true)`+async re-check on *every* auth event → unmounts AppLayout. Blast radius: every AppLayout-useState-gated modal. **Blocked-on-artifact:** device repro (iOS-only after long sleep vs also desktop-web → implicates Cause 2). Fix queued behind Phase 4/Theme B. Zero test coverage.
- [ ] **Ticket #2 — `UNAUTHORIZED_NO_AUTH_HEADER` 400 (premise UNCONFIRMED).** The deployed client `invokeFunction` (`src/lib/supabase.ts:124-134`) provably cannot emit an empty Bearer (anon key hard-pinned literal since `36efbfed` 2025-08-23, ~9mo live; every IIFE branch → non-empty JWT). The gateway envelope can't originate there. **Blocked-on-artifact:** DevTools capture of the actual failing request (method — is it an OPTIONS preflight?, URL, request headers as sent, status, which client/build). Prime un-checked hypothesis: CORS/OPTIONS preflight (carries no Authorization by design) — checkable read-only once the request is captured.
- [ ] **Latent auth-gap hardening** (separate from Ticket #2's envelope). `invokeFunction`'s anon-fallback silently masks the cold-iOS "blob has `user` but no `access_token` yet" race (→ confusing in-handler 401, not the gateway envelope); the token IIFE is **duplicated** in `invokeFunction`+`invokeFunctionFormData` (drift risk; FormData/GPX path independently vulnerable). Mirror the `getStoredUserId`/`e3923cb2` layered-fallback + null-signal pattern. Real robustness work on its own merits; NOT a fix for Ticket #2's envelope.
- [ ] **Issue 1 — wizard start-date default → today.** Change plan-start default from next-Monday to today (athlete can still pick later; don't auto-lose a week). Multiple defaults exist (`PlanWizard.tsx`, `ArcSetupWizard.tsx`, `AppContext` materialize fallback) — needs a "which wizard(s) + materialize-fallback?" scoping decision. Parked; decoupled from the 400 (start-date is `w2−w1`-invariant). Standalone UX win when picked up.
- [ ] **iOS-auth/lifecycle cross-cut (shared-remediation candidate).** Bug A's `functions.invoke`→iOS-`getSession`, Bug B Cause 2 (`AuthWrapper dc85e9d0`), Ticket #2, and the unpinned `@supabase/supabase-js ^2.49.4` (`package.json:45`; installed 2.105.4) all orbit one layer. Consider ONE pass — audit all `supabase.functions.invoke` sites → route via `invokeFunction`; pin supabase-js exact; narrow the `AuthWrapper` regression — rather than N isolated fixes. Scoping decision (do not act unprompted).
- [x] **`bikeOpeners` over-broad `phase==='taper'` gate** — closed D-043 item 10 / 2026-05-25. Gate at `week-builder.ts:1461` now scopes to `phase === 'taper' && raceThisWeek`, mirroring the swim-activation gate at `:914`. Non-race-week taper falls through to the existing quality-bike / group-ride logic — no behavior change for those weeks; openers special-case no longer pre-empts.
- [ ] **Q-019 / Slice 4.5 — wetsuit trade-off needs two new wizard fields before it can fire without false alarms.** Required signals: (1) `training_prefs.race_requires_wetsuit?: boolean` (wizard question for tri A-race in cool-water conditions, or inferred from race name / venue via a lookup table); (2) `training_prefs.open_water_access?: boolean` (wizard question OR `arc-context.ts` aggregation of recent `open_water_swim` activities). Once both signals land, emit a `swim_calibration` trade-off following the §7.5 `no_swim_threshold_pace` pattern. Spec: SWIM-PROTOCOL §5.4 wetsuit row + Q-019.
- [x] **Tri-generator swim sessions don't respect beginner rotation (D-025 §10.3 substitution).** Closed D-043 / 2026-05-25. `swim_fitness === 'beginner'` now routes to `css_aerobic` instead of `threshold` on race_peak race-spec in `generate-triathlon-plan`. The 6 `pickSwimDrillInset` call sites in tri-generator already got `athleteFitness` threading in D-020 Slice 3d; D-043 extends the same pattern to rotation dispatch.
- [x] **Q-015 — drill repeat-pick memory.** RESOLVED D-043 + D-044 + D-045 / 2026-05-25. End-to-end: D-043 picker capability + D-044 caller wiring (`prevWeekDrillTokens` opt threaded through 7 swim creators) + D-045 harvest bug fix (orchestrator was reading `week.days[].sessions[]` but `buildWeek` returns flat `week.sessions[]`, so the Set was empty every week — fixed via `drill-token-harvest.ts` helper + 6 pin tests). Verified live: regenerated plan shows distinct drill families week-over-week with no consecutive cross-week repeats. Cross-ref: `docs/OPEN-QUESTIONS.md` Q-015.
- [x] **Swim equipment line duplicate.** Closed D-043 / 2026-05-25. Client-side suppression when description already contains the Pool gear line — prevents the duplicate equipment surface when both server and client try to render it.
- [ ] **Q-016 — §2 drill/swim ratio scaling** (drill yardage scaled by experience level per §2 ratio table — Learning 75% drill, Race-comfortable 30%, Competitive 10%). **Partial closure D-057 / 2026-05-25 (commit 0246c07f):** Path A (technique_aerobic) tier ratio targeting LOCKED at conservative 30/20/10 vs §2's aspirational 75/30/10 (calibration-driven to avoid double-counting with session-count + band-volume layers). Path B (single-drill css_aerobic/threshold) and beginner one-focus path UNCHANGED — spec-fixed drill counts there. Full §2 alignment across all paths still requires the multi-day arc per Q-016 audit (new high-rep token variants, dispatcher accepting `(intent, experience) → target_drill_pct`, re-tuning `SWIM_DRILL_MAIN_FLOOR_YD`, explicit §2-vs-§3 responsibility carve-out, cross-layer pin tests). Cross-ref: `docs/OPEN-QUESTIONS.md` Q-016.
- [x] **Performance tab — interval / variable-effort detection in INSIGHTS narrative + TREND filter (run + cycling).** Closed 2026-05-23 / D-034. Bug A (segment labels) + Bug B (INSIGHTS interpreting intervals as steady) + cycling-B (symmetric variance gate) bundled. Server-side `is_mixed_effort` flag computed from GAP-corrected CV (with conservative raw-only-on-flat policy) + plan/detected interval signals; LLM input swaps `vs_similar` for `interval_summary` block when mixed-effort; vs_similar pool filter excludes mixed-effort rows from easy comparisons; pace comparisons prefer GAP when both rows have it (`pace_basis` reported, never mixes). Cycling parity via VI ≥ 1.05 / power CV ≥ 12% / plan-intent intervals. Plan intent never overwritten — `classified_type_variance_override` flag carries the same information for pool filters. 9 new Deno tests, 0 regressions across 391 `_shared` + 19 cycling. No client changes (all variance math server-side; client renders off `session_detail_v1.classification.{is_mixed_effort, variance_signal, classified_type_variance_override}` + `pacing.{coefficient_of_variation_basis, variability_index, power_cv_pct}`). No backfill — display-layer `'Overall session' → 'Overall'` guard handles stale rows; pool filter treats `is_mixed_effort === undefined` as false (older rows drain naturally).
- [x] **Coverage gap — `analyze-running-workout` variance-gate path covered** — closed D-044 item 7 / 2026-05-25. `_varGate` extracted as exported pure function `computeVarianceGate` in `analyze-running-workout/lib/variance-gate.ts`. 14 pin tests in `variance-gate.test.ts` lock the contract: 5 user-spec scenarios (linked interval / hilly easy GAP / flat fartlek unplanned / linked easy variance override / unplanned 6-interval) + 9 predicate-priority and boundary pins. Other analyzer paths (`buildRowsFromBreakdown` at `:~4040`, `'Overall session'` literal removal sites) remain untested but are pure display-layer transforms with stable surfaces; can be incremental.
- [x] **Performance tab — unplanned workouts get null adherence, not synthesized/fake values; INSIGHTS interprets on workout's own terms.** Closed 2026-05-23 / D-035. Three analyzers fixed in one ship: run deleted the duration-derived fake-target synthesis at `analyze-running-workout/index.ts:504-538` (was inventing `tempo_run @ 10K pace` for any 30-60 min run, then scoring against the fiction); cycling's 0% default → null; swim's 100% default → null (also killed the hardcoded `duration_adherence: 100` TODO for linked swims, replaced with real ratio-based calc mirroring run formula). New `classification.is_unplanned` flag on `session_detail_v1`; LLM input drops prescribed-range signals (`execution`, `interval_execution`) when unplanned; new UNPLANNED MODE prompt rule with terrain-aware variance reading (read raw pace swings through the elevation profile via GAP, don't treat as effort variation). Plan intent sacred (D-034 carryover) — `workout_type` stays a descriptive label, NEVER a target. `vs_similar` (run) and `cross_workout` (cycling) preserved for unplanned — same-category history is honest signal, not prescription. `assessed_against = 'actual'` when no plan as defense-in-depth for client `AdherenceChips.tsx:60`. 9 new Deno tests (`unplanned-workout.test.ts`), 0 regressions across 400 `_shared` + 19 cycling. No client changes (client already null-safe per `AdherenceChips.tsx:55/60/70-72/88-89`). Spec: `docs/UNLINKED-WORKOUT-INTERPRETATION-SPEC.md`.
- [x] **Performance tab — run aerobic decoupling computed on grade-adjusted pace.** Closed 2026-05-23 / D-036. Within-workout HR drift signal: GAP enrichment lifted to top of `analyze-running-workout/index.ts` via new idempotent `enrichSamplesWithGAP` helper in `_shared/gap.ts`. Both pace-adherence and HR analyzer consume the same grade-adjusted series; `calculateEfficiency` reads GAP-corrected pace → terrain-neutral decoupling number that reflects real cardiovascular efficiency drift. Sample-level decoupling (warmup-skipped, 20-min minimum) replaces segment-level value for runs; new `decoupling.basis: 'gap' | 'raw'` reports which series fed the ratio. New AEROBIC DECOUPLING (RUN) prompt rule with two branches: `basis === 'gap'` → real fitness signal with translation table (excellent <3% / good <5% / moderate <8% / high ≥8%, never print the percentage); `basis === 'raw'` (no usable elevation) → inconclusive, do NOT claim fitness, describe what HR did in plain terms (same discipline as D-035). Contract surface: `session_detail_v1.classification.decoupling: { pct, basis, assessment } | null`. Cycling unchanged (NP already smooths terrain via 4th-power rolling average). 3/5/8% thresholds kept verbatim — change one variable at a time, GAP input first, retune after production data. Out of scope: per-segment HR-vs-history (filed as Q-022 — segment_progress_metrics writer chain broken since ~2026-03-01); whole-route HR-vs-history (separate feature); `run_easy_hr_trend` rename (propagates through D-033 reconciler, separate cleanup). 7 new Deno tests (`decoupling.test.ts`), 0 regressions across 407 `_shared` + 19 cycling. No client changes. Spec: `docs/RUN-HR-DRIFT-SPEC.md`.
- [x] **Performance tab — mixed-effort decoupling + HR signals + pool intensity correctness.** Closed 2026-05-23 / D-037 + 2026-05-24 / D-038. Mixed-effort sessions now compute decoupling (basis:'raw', inconclusive framing) and receive historical HR context. Pool intensity filter prevents intensity-mismatch misinterpretation.
- [x] **Segment label formatting bug** — closed D-039 / D-040 / D-041. Server-side: pace-range-only labels strip to 'Steady' in `humanizePlannedSegmentLabel` (D-039.7). Client-side: single-segment + `workout_type` ∈ {long_run, easy_run} → label renders 'Steady', pace-range subtitle suppressed (D-041.C). Decoupled from `is_mixed_effort` so rolling-terrain long runs (which trip the variance gate) still render cleanly.
- [ ] **Taper-mode × vs_similar.trend interaction widened 2026-05-23 (D-037).** With HR fields restored for mixed-effort sessions, vs_similar.trend.direction can reach the LLM during taper mode. Existing hard-ban guards in `arc-narrative-ai-appendix.ts:72` cover "getting fitter" framing today. Monitor in LLM evals — if a failure cites "narrated improving trend during taper" audit this surface first.
- [ ] **Q-025 — TREND pool phase-aware label.** Pool composition correct post-D-041 (pre-race points excluded when `days_since_last_goal_race < 60`) but label still shows "32s/mi slower" when pool spans training phases beyond the 60d window. Fix: derive TREND label from pace-at-HR direction, not raw pace. Blocked on pace-at-HR sparkline spec above. Cross-ref: `docs/OPEN-QUESTIONS.md` Q-025.

---

## Cycling analysis build (2026-05-14 → 17) — PAUSED, correctness pass complete

Separate workstream from items 1–5 (running→cycling parity + intent-aware analysis). Work order: `docs/CYCLING-ANALYSIS-DESIGN.md`; full state + resumable handoff: `docs/SESSION-CONTEXT.md` §6.

### Done
- [x] Build Order #1 mode-aware TREND + `pwr20_trend_v1` — `1c841615`/`82c68fe9` (2026-05-15)
- [x] #1b TREND dual pace+HR line — `71e82dbb` (2026-05-16)
- [x] #2 analysis-mode primitive — `7a2fed7f`
- [x] #3 NP-based TSS — `a5947290`
- [x] #4 HR-at-power + decoupling, #5 VAM — `61851fba`
- [x] #6 segment ingestion + `cycling_segment_history` + Garmin climbs — `685987cb` (+ SELECT fix `41d1582d`)
- [x] #7 CTL/ATL/TSB PMC model — `a42331cc`
- [x] #9 Arc exposure of CTL/ATL/TSB (narrative + snapshot + arc-context) — `66dad9d9` + `f2cb068c`
- [x] TREND type-filter by classified_type — `04eb2b52`
- [x] VI-gate ride classifier + `'climbing'` type — `d6832a6b`/`fd16ef5a`
- [x] dist/dur/temp stat line + TERRAIN temp — `a739961f`
- [x] fact-packet IF/VI from canonical `computed.analysis.power.*` (was recomputing off unpopulated `computed.overall.*` → provider/device power; classifier gated on wrong numbers) — `6941a236` + verify/backfill script `fae293e7` (2026-05-17). Verified: 8 affected rides reconverged; 2 reclassified. See D-015 / ENGINE-STATE Solid.
- [x] VI-gate elevation density from total `workouts.elevation_gain`, not grade≥3% `climb_ascent_m` (under-reported on rolling terrain, straddled the 40 ft/mi gate) — `bdf2cde2` (2026-05-17). Supersedes D-011's elevation-source tradeoff → D-016. Verified: May-10 `60304656` → `tempo`→`climbing`.
- [x] sport-aware TREND legend ("power" rides / "pace" runs; was hardcoded "pace") — `91ea2078` (2026-05-17). Client-only.
- [x] PR attribution — `set_on_current_ride`/`current_value` so the narrative can't claim prior-ride bests were set today; Efforts-scoped language ("best in Efforts", never "all-time"/"personal best") — `a0ca4158` (2026-05-17). See SESSION-CONTEXT §7.
- [x] cycling TREND ≥5 same-type rides for the chart; 3–4 → one-line text summary; cycling-only — `6bf574d4` (2026-05-17)
- [x] POWER ZONES shows all zones; total anchored to ride duration so un-binned coasting → "+Xm other" (was top-4, total didn't sum) — `80b4c285` + `8e83e5df` (2026-05-17)
- [x] narrative trend mirrors the TREND row's series (pwr20 type-filtered else np_trend) + deterministic Arc-secondary lede guard (power-first, `ledeOpensWithArcFrame` + corrective retry) — `36a7e792` + `dcaa9f08` + `da7dbce8` (2026-05-17). Verified 0/30 Arc-lede. See SESSION-CONTEXT §7.
- [x] INSIGHTS plain-language polish — translate IF/VI/EF/HR-decoupling/ACWR/TSB to plain words + "so what" context + 3–4 sentences; deterministic `summaryHasJargon` guard folded into the combined retry — `98c04e2f` + `d6da072c` + `d02abfe4` (2026-05-17). Verified jargon 0/30. See SESSION-CONTEXT §7 (3-guard-stack footgun).

### Open
- [x] historical `avg_hr` resolves null → TREND HR line never draws — `4177c05c` (2026-05-17). Loop SELECT + `hrH` resolve `computed.overall.avg_hr ?? fact_packet_v1.facts.avg_hr ?? r.avg_heart_rate`; backfill verified 26/26 trends draw the dashed line. Q-007 closed.
- [x] type-filtered `pwr20_trend_v1` historical re-analysis backfill (Q-008, SESSION-CONTEXT #2) — `scripts/verify-cycling-vi-if-fix.mjs --all` (`fae293e7` + `--all` `83d07fdb`) run wide 2026-05-17 (180 d, 30 rides, 0 failed): every in-window ride now has a stored `classified_type`; recovery/threshold/climbing/endurance/tempo each ≥3 (pwr20-eligible)
- [ ] **P2** #8 race-course matching — blocked on GPX geometry / product decision (Q-009)
- [ ] **P3** #9 remainder — power-curve-trend + HR-at-power-trend into Arc/snapshot
- [ ] deferred (product): #10 segment leaderboards, #11 W′ depletion modelling
- [x] **P3 cosmetic — dashboard rows half closed** D-062 / 2026-05-26 (commit c2c32517). POWER + EFFICIENCY row translations shipped in `_shared/session-detail/build.ts` ("IF 0.85" → "85% of threshold"; "EF · % HR decoupling" → "Watts per heartbeat · HR drift"). Closing-clause hedge in INSIGHTS prose NOT touched per the SESSION-CONTEXT §7 3-guard-stack footgun (modifying any guard without concrete reproducer risks degrading interactions). Q-010 stays partially open for the hedge half.

---

## Done = launchable

When items 1-5 are all 100% and background items are closed, the app ships every flow clean. No new features past this point. Polish only.
