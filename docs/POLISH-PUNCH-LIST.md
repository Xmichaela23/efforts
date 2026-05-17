# Efforts — Polish Punch List

Tracking the work to get the app from "engine works" to "every flow ships clean." No new features past this point. Only finish what's started.

Last updated: May 17, 2026 (cycling-analysis arc paused — correctness pass complete; see docs/SESSION-CONTEXT.md §6)

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

**Status:** ~95% — architecture complete, two known bugs remain

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
- [ ] 9-week edge case trade-off message — when plan length forces base phase to 0 weeks, surface explicit "base phase skipped due to plan length" trade-off instead of silent skip
- [ ] Minimum rebuild week count enforcement — when post-B-race window <2 weeks, current code skips rebuild entirely; consider whether to compress taper to guarantee ≥1 rebuild week
- [ ] Verify all 6 intent × tier combinations end-to-end
- [ ] Materialize-plan numerical resolution for % 1RM strings (deferred)
- [ ] **Recovery week strength load — `createPerfRecoverySession` emits "2×8 @ 130 lb" deadlift every recovery week regardless of plan position.** Heavier than build-phase working load (115-120 lb). Doesn't honor "deload ~10% down" intent. Audit the recovery session generator and align load math with the new dispatcher-owned %1RM contract. Same canonical-value pattern applies — single source of truth for deload load math.

---

## 2. Swim program 100%

**Status:** ~70% — drill rendering + sighting + equipment line shipped, content gaps remain

### Done
- [x] Drill display names lookup
- [x] Sighting drill added end-to-end
- [x] Equipment-aware session substitution
- [x] Per-session gear summary line

### Open
- [ ] Week 7 build week showing 1,750yd recovery-level volume — bug
- [ ] Race-Specific Aerobic sessions too short (1,000yd) — should scale 1,500-2,500yd by phase
- [ ] Drill rotation only working in Technique Aerobic sessions
- [ ] Equipment line duplicating on some sessions
- [ ] Wire new drill tokens (Single-Arm, 6-3-6, Zipper, Sculling) into session generators
- [ ] Add missing session types: Swim Time Trial, Open Water Skills, Mixed/Fartlek, Race-Pace Sustained
- [ ] Standardize all swim intensity references to CSS percentages

---

## 3. Cycling 100% — stop calling Z2 weekday rides "long rides"

**Status:** 0% — not yet audited

### Open
- [ ] Write CYCLING-PROTOCOL.md spec doc
- [ ] Audit cycling session naming — "Long Ride" only the genuine weekly long session
- [ ] Distinguish Easy / Endurance / Long / Quality / Brick rides
- [ ] Verify cycling power zones (read from athlete FTP)
- [ ] Audit brick session structure
- [ ] Confirm Wednesday group ride anchor flows through correctly

---

## 4. Wizard language + clarity

**Status:** ~20% — strength step clear, other steps not audited

### Done
- [x] Strength step: intent labels with descriptions
- [x] Strength step: equipment gate inline warning
- [x] Strength step: 1RM warning when missing

### Open
- [ ] Audit every wizard step — each question's purpose clear
- [ ] Surface tradeoffs at decision time, not after plan generation
- [ ] Link each equipment chip to what it unlocks
- [ ] Explain what each baseline input drives
- [ ] **`training_intent` wizard copy vs engine reality (2026-05-12 verification).** Step 2 wizard offers three options ("Race the clock", "Strong, healthy finish", "First time at this distance") promising three different prescriptions — intervals + threshold + pace targets + 3-4 wk recovery / tempo + no pace targets + 3 wk recovery / conservative + 2 wk recovery + no intensity. Engine reality: `training_intent` only gates 5 same-day pairing exceptions in `_shared/week-optimizer.ts` + 1 in `week-builder.ts` (consolidated AM run / PM lift, lb-on-QR exception). `completion` and `first_race` are functionally identical; pace targets, loading pattern, run-quality selection, and phase structure all ignore `training_intent`. Loading pattern is driven by `tri_approach` + fitness, not by intent. The wizard's primary intent question is cosmetic for 2 of 3 options today. **Two paths:** (a) wire `training_intent` through to loading pattern + intensity selection + pace-target emission (Ticket B #16 in task #120); (b) soften wizard copy to match engine reality. Picking (a) when Ticket B lands; (b) is the interim if it ships first. Same wiring-break pattern as `swim_experience`, `limiter_sport`, `goal_type` per Ticket B.
- [ ] **`strength_preferred_days` is engine-generated but exported as "Athlete preference" (2026-05-12 verification — plans #57, #58).** The wizard has NO strength-day pinning question. The strength step asks intent (Hybrid / Durability / None) + same-day ordering preference (Endurance first / Strength first) and that's it. The optimizer (`deriveOptimalWeek`) picks strength days from anchors + matrix constraints, then `reconcile-athlete-state-week-optimizer.ts:270` writes them back to `strength_preferred_days` — the same field a wizard pin would use. Plan export then surfaces them under "Preferred days: Strength: tuesday (upper body), friday (lower body)" as if athlete-pinned. The trade-off composer also reads this field and emits incoherent "preferred day rejected" messages when the value is engine-generated. The Bug 2 fix in `format-wizard-prefs-export.ts` (commit `64f253de`) suppresses engine-derived `preferred_days` keys when the corresponding pin field is empty — but for strength, the engine writes to the SAME field a wizard pin would, so the heuristic doesn't fire. **Fix:** split the storage — `strength_optimizer_days: string[]` written by the reconciler, `strength_preferred_days` reserved for wizard pins only (currently never set). Export labels them differently ("Strength (scheduled by app):" vs "Strength:"). Trade-off composer skips "preferred day rejected" emissions when the source is the optimizer's own placement. Adding a wizard pin question (option a from user analysis) deferred — most triathletes don't have strong day preferences for strength, and the wizard is already long.
- [ ] **`scaledWeeklyTSS` reads declared hours, not endurance-adjusted hours (2026-05-13 verification — Plan #60 build week landed at 11h55m vs 11hr budget after §2.1 swim drop).** §2.1 (commit `cf68cf43`) re-tiers a hybrid 11hr athlete to `8-10` (was `10-12`), correctly dropping swims from 3 → 2. Build-week emit dropped from 12h19m to 11h55m — a 24-min reduction, not the full ~80-min reduction expected from dropping one swim slot. Root cause: `week-builder.ts:674 scaledWeeklyTSS(phase, current_ctl, weekly_hours_available, tssMultiplier)` reads the athlete's declared 11hr to compute the TSS budget. The TSS budget still reflects 10-12 tier numbers (~700-800 build TSS) — when one swim slot disappears, the remaining sessions absorb the freed TSS and grow slightly longer (Friday swim was 51m at 1000yd pre-§2.1; post-§2.1 it's still ~51m at 3200yd CSS aerobic, redistributing the freed budget back into one larger swim instead of two smaller ones). The matrix returns the right session COUNT for hybrid; the budget still treats them as endurance-only volumes. **Fix:** pass endurance-adjusted hours to `scaledWeeklyTSS` (or, cleaner, plumb the `endurance_hours` value out of `computeSessionFrequencyDefaults` as a new field on `SessionFrequencyDefaults`, then read it in the week-builder). Predicted effect: TSS budget scales down to 8-10 tier (~550-650 build TSS), session durations shorten proportionally, hybrid 11hr athlete lands at ~11h flat instead of 11h55m. 24min/wk over-prescription compounds across 12 build/peak weeks — meaningful but not blocking; ship §2.1 first, follow up here.
- [~] **`swim_experience` not gating swim volume — learners getting 3000+ yd aerobic sessions (Ticket B territory, 2026-05-13 verification — Plan #60).** Athlete profile: `Swim Experience: Learning / newer swimmer`. Plan #60 emit shows W6 Friday CSS Aerobic Swim at **3200 yd** (51 min), W7 Friday Technique Aerobic Swim at **3150 yd** (1h 23m), W11 Friday Technique Aerobic Swim at **3200 yd** (1h 25m). These are intermediate/advanced volumes — a true newer swimmer at 11hr/wk plan should top out around 2000-2500 yd for any single aerobic session. The `swim_experience` wizard field exists and is persisted (`learnerSwimExperience` helper at `_shared/schedule-session-constraints.ts:288-291` references it for matrix slot classification), but it does NOT cap session yardage at swim emit time. `apply703SlowSwimmerWeeklyFloors` (`generate-combined-plan/swim-protocol-volumes.ts`) handles tri-distance floors but no learner ceiling. **Fix:** ceiling logic in swim slot sizer — learner cap at ~2500 yd per session for aerobic, ~2000 yd for threshold (Z4 sustained is harder on technique-limited athletes). Same wiring-break pattern as `training_intent`, `limiter_sport`, `goal_type` per Ticket B. Slot into Ticket B (#120) as item #17. **2026-05-13 partial fix shipped (commit 0fd17ad9):** `swim_experience='learning'` now applies a soft `score -= 1` signal in `inferTrainingFitnessLevel`, propagating to `training_fitness` selection which feeds swim volume bands and per-session rep caps. Spot-check post-deploy whether per-band ceilings are themselves tight enough for true learners — if Friday CSS Aerobic still emits 3000+yd for the Plan #60 athlete, the residual fix is the per-session ceiling logic in `swim-protocol-volumes.ts` described above. See `docs/TICKET-B-WIRING-AUDIT.md` and `docs/ENGINE-STATE.md` "Known broken" for status.

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
- [ ] Tradeoff messages should disappear when their question isn't violated
- [x] **Concurrent training spacing constraint — HIGH severity scheduling defect.** ✅ Shipped 2026-05-11 for combined-plan generator. `docs/SCHEDULING-RULES.md §4.21` codifies the rule; `_shared/week-optimizer.ts` enforces strict 24h/48h spacing + sandwich rejection + tier ladder (CLEAN → SOFT → SANDWICH → DROP); `_shared/schedule-session-constraints.ts:SESSION_PRIME_MOVER` provides the prime-mover taxonomy. §5.1 performance-intent carve-out deprecated. Research cited inline: Hickson 1980, Wilson et al 2012, Robineau et al 2016, Coffey & Hawley 2017, Petré et al 2021.
- [ ] **Apply §4.21 to other plan generators.** Above fix is combined-plan only. `generate-run-plan`, `generate-triathlon-plan`, `generate-plan` have independent placement pipelines that were NOT routed through the new rule. Audit each, identify placement entry points, apply prime-mover taxonomy + tier ladder. Use `_shared/week-optimizer.ts` as the reference implementation.
- [ ] **Consolidated strength-integration mode (Model B) — research citations + spec.** §4.21 today implements "Separated" mode (strength on its own days, away from hard endurance — concurrent-training-spacing strict). Hybrid practitioners use a different "Consolidated" mode where strength stacks AM/PM with quality endurance on the same calendar day; hard days get harder, rest days get protected. The §5.2 consolidated-hard-day pattern the optimizer already produces (Thu AM quality_run + PM lower) is functionally Model B in disguise — lean into it as the explicit mode rather than treat as exception. Spec needs: wizard question (Separated default vs Consolidated opt-in), parallel rule set in engine, research basis. Citations to gather: Fergus Crawley / Omnia hybrid framework; Nick Bare PRESCRIBED methodology; Blaine Lints (Tactical Hybrid); Petré et al 2021 (re-read for support of either approach depending on consolidation); Murach & Bagley 2016 (skeletal muscle adaptation to concurrent training, AM/PM separation); Sale 1990 (post-activation potentiation favors AM strength before PM endurance in some protocols). Document in a new `docs/CONSOLIDATED-MODE.md` spec before code; parallel to §4.21 separated mode in SCHEDULING-RULES.md.

---

## Queued for next sessions (Theme A complete 2026-05-11)

These are the architectural threads opened during the 2026-05-11 session, scoped and queued for follow-up. None are blocking today's ship.

### Bugs first (single session — surfaces from 2026-05-11 Santa Cruz + NorCal multi-sport plan export)

Reference corpus: `~/Downloads/ironman-70.3-santa-cruz-+-ironman-70.3-northern-california-—-multi-sport-plan (48).md`. These four bugs are queued AHEAD of the race-week protocol because they surface generation-time defects that would muddy the race-week audit if left in place.

- [ ] **Bug 1 — Trade-off message divergence.** Trade-off generator reads from `preferred_days` field; actual session placement can diverge from that field (e.g., engine relocates a quality day post-pin). Result: athlete-visible trade-off names a day that doesn't match the schedule. Fix: trade-off composer reads from the realized `week.days[*]` graph, not the exported `preferred_days`. Single source of truth.
- [ ] **Bug 2 — preferred_days default cleanup.** Engine returns wizard-style pins for days the athlete did NOT explicitly pin (defaults leak into the "athlete preference" surface). Result: plan export shows "Strength: friday (upper), wednesday (lower)" as if athlete-pinned when those were engine-chosen defaults. Fix: distinguish athlete-pinned from engine-chosen at the export layer; only surface pins when the athlete actually picked the day.
- [ ] **Bug 3 — §4.21 week-boundary fix.** `sequentialOk` checks `prevKinds = days[dayBefore(day)]` within the SAME week's grid. Cross-week adjacency (Sunday W_N long_run → Monday W_N+1 lower) is invisible to the rule; the engine builds each week independently. Result: Monday lower can land 24h after Sunday long_run when week boundary intervenes. Fix: thread previous-week-Sunday context into `sequentialOk` for Monday placement, OR extend the grid to a rolling 8-day window.
- [ ] **Bug 4 — Brick-as-long-ride validator.** Long-ride volume floor validators (per-week minimum hours / TSS) don't recognize the bike portion of a brick session as fulfilling the long-ride requirement. Result: build/race weeks with bricks fail floor checks even when the brick bike portion matches or exceeds the long-ride minimum. Fix: floor validator counts `brick-tagged bike` toward long_ride volume.

### HIGH severity
- [ ] **Race-week protocol audit — Week 14 and Week 18 findings.** _Reordered: runs after the four bugs above close, since cleaning generation-time defects first makes race-week audit signal cleaner._ Race weeks aren't yet treated as a distinct architectural class. Today's brick-cap fix (commit `e0aad332`) sets race-week brick to 0 in `week-builder.ts:effectiveBricks`, but week-level structure (taper-into-race transition, race-day session shape, post-race rebuild handoff) needs a dedicated protocol spec. Audit Week 14 (B-race) and Week 18 (A-race) of the existing test plans, identify the contract gaps, write `docs/RACE-WEEK-PROTOCOL.md` before code.

### Theme B — Strength integration mode (Separated vs Consolidated)
- [ ] Wizard question + copy: "How should strength fit into your week?" with Separated / Consolidated options + research-backed copy (Hickson 1980 cited for Separated; Crawley/Omnia, Nick Bare, Blaine Lints cited for Consolidated). Default Separated.
- [ ] AthleteState `integration_mode` field + payload threading from wizard through reconciler to optimizer.
- [ ] Parallel engine rule set: `mode === 'separated'` keeps today's §4.21 strict 24h spacing; `mode === 'consolidated'` inverts — strength_lower + leg_quality SAME-DAY is preferred placement, separated becomes the trade-off. §5.2 consolidated-hard-day pattern already exists as the implementation foundation.
- [ ] New `docs/CONSOLIDATED-MODE.md` spec parallel to §4.21 separated mode.

### Theme C — Wizard gates and minimum-day warnings
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
- [ ] Write `CYCLING-PROTOCOL.md` spec doc — currently 0% (per §3 above).
- [ ] Distinguish Easy / Endurance / Long / Quality / Brick rides; stop calling Z2 weekday rides "long rides."
- [ ] Verify cycling power zones flow from FTP correctly.
- [ ] Confirm Wednesday group ride anchor threading.

---

## Background items (not blocking, surface as bugs are observed)

### Done
- [x] Floor numbers showing extra decimals ("21.2335mi") in tradeoff messages — fixed at architectural level

### Open
- [ ] Tradeoff message filtering — strings like "Strength: default" or "Weekly layout: moved" shouldn't appear when no anchors exist
- [ ] Brick session not appearing in plan export markdown
- [ ] Schedule Adjustments panel should hide when generation_trade_offs is empty after filtering
- [ ] Bypass-path audit for strength_intent normalization

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

### Open
- [ ] **P1** historical `avg_hr` resolves null → TREND HR line never draws (fix-ready; Q-007, SESSION-CONTEXT #1)
- [x] type-filtered `pwr20_trend_v1` historical re-analysis backfill (Q-008, SESSION-CONTEXT #2) — `scripts/verify-cycling-vi-if-fix.mjs --all` (`fae293e7` + `--all` `83d07fdb`) run wide 2026-05-17 (180 d, 30 rides, 0 failed): every in-window ride now has a stored `classified_type`; recovery/threshold/climbing/endurance/tempo each ≥3 (pwr20-eligible)
- [ ] **P2** #8 race-course matching — blocked on GPX geometry / product decision (Q-009)
- [ ] **P3** #9 remainder — power-curve-trend + HR-at-power-trend into Arc/snapshot
- [ ] deferred (product): #10 segment leaderboards, #11 W′ depletion modelling

---

## Done = launchable

When items 1-5 are all 100% and background items are closed, the app ships every flow clean. No new features past this point. Polish only.
