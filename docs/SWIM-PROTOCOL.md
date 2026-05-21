# Swim Protocol — Prescriptive

How the plan engine generates swim sessions for triathlon athletes. Companion to `docs/SCHEDULING-RULES.md` (placement), `docs/SESSION-FREQUENCY-DEFAULTS.md` (session counts), `docs/STRENGTH-PROTOCOL.md` (strength), and the Arc wizard (athlete input).

---

## 0. Core principle

**Athlete intent + experience level determine frequency and structure. CSS determines intensity. Equipment determines execution. Honesty about limits points to Masters for what software can't do.**

Swim training for triathlon is the most coaching-dependent of the three sports. Stroke mechanics matter more than aerobic load, and stroke flaws are best caught poolside by a human coach. The system prescribes structurally sound progression based on coaching literature; it does not replace a coach's eye.

This protocol delivers:
- Frequency calibrated to intent (Race-adequate vs Performance)
- Session distribution calibrated to experience level (Learning / Race-comfortable / Competitive)
- Intensity prescribed in CSS-based zones (universal coaching standard)
- Drill progression that complements across the plan (foundation → refinement → race-specific)
- Pace targets derived from athlete's actual 100yd/100m pace inputs
- Open water skills integrated in race-specific phase
- Masters swim recommendation surfaced for Learning-level athletes

---

## 1. Inputs

| Input | Source | Already exists |
|---|---|---|
| Swim intent | Arc wizard (`swim_intent`: race_adequate / performance) | Yes |
| Swim experience | Arc wizard (`swim_experience`: learning / race_comfortable / competitive) | Yes |
| Easy pace per 100 | Arc wizard (`baselines.swim_easy_pace_100`) | Yes |
| Race-effort pace per 100 | Arc wizard (`baselines.swim_threshold_pace_100`) | Yes |
| Pool length | Arc wizard or default | Yes |
| Equipment | Arc wizard (`baselines.equipment.swimming`: pull buoy, paddles, snorkel, kickboard, fins) | Yes |
| Phase | Plan engine (base / build / race_specific / taper) | Yes |
| Race distance | Plan engine | Yes |
| Weekly hours | Plan engine | Yes |

No new wizard questions required. The system computes CSS internally from race-effort pace per 100; athletes don't need to provide CSS directly because most age-group triathletes don't know it.

**Honest limit:** If athlete has no swim pace data on file, conservative defaults apply with trade-off message. Pace targets shift to RPE-based language ("moderate effort, sustainable for 1500yd") until athlete provides data.

---

## 2. Protocol selection (intent + experience → structure)

| Swim intent | Swim experience | Frequency baseline | Session ratio (drill / swimming) |
|---|---|---|---|
| Race-adequate | Learning | 2-3×/week | 75% drill, 25% swim |
| Race-adequate | Race-comfortable | 2×/week | 30% drill, 70% swim |
| Race-adequate | Competitive | 2×/week | 10% drill, 90% swim |
| Performance | Learning | 3×/week | 60% drill, 40% swim |
| Performance | Race-comfortable | 3×/week | 25% drill, 75% swim |
| Performance | Competitive | 3-4×/week | 10% drill, 90% swim |

Frequency final count comes from `SESSION-FREQUENCY-DEFAULTS.md` based on weekly hours; this table sets the floor for intent + experience.

**Masters swim recommendation:** For Learning-level athletes, the wizard surfaces an inline note recommending supplementation with a Masters swim program (US Masters Swimming, YMCA, local swim clubs). Drill progression in the plan is research-backed, but a coach's eye catches individual stroke flaws that algorithmic prescription cannot. Link to USMS.org find-a-club tool.

---

## 3. Frequency by hours tier

| Weekly hours | Default swims/week | Notes |
|---|---|---|
| 4-6 | 2 | Minimum effective dose for 70.3 |
| 7-9 | 2 | Add 3rd swim only for Performance intent + Race-comfortable level |
| 10-12 | 2-3 | Performance intent default = 3 |
| 13-15 | 3 | Standard for performance-focused athletes |
| 16+ | 3-4 | Competitive level athletes |

Per research consensus (USA Triathlon, MyProCoach, 220 Triathlon), 2-3 swim sessions per week is the standard for age-group triathletes. Diminishing returns past 4 sessions/week for athletes whose primary disciplines are bike and run. The session frequency engine respects this ceiling.

---

## 4. Phase progression

### 4.1 Base phase (weeks 1-6 of typical 17-18wk plan)

**Focus:** Aerobic foundation, stroke economy, drill mastery.

| Session type | Count/week | Distance | Intensity |
|---|---|---|---|
| Technique Aerobic | 1 | 2000-3500yd | Z1-Z2 (CSS + 10-15s) |
| CSS Aerobic OR Endurance | 1 | 2500-3500yd | Z2 (CSS + 8s) |
| Optional 3rd: Recovery or Drill-focused | 0-1 | 1500-2000yd | Z1 |

**Drill ratio:** Higher (see §2 by experience level). Drills target catch, recovery, rotation, body position.

**Volume ramp (within-phase progression — ratifies the engine's dormant designed curve, 2026-05-19):**
Swim volume is **not flat across a phase**. Each slot's yardage ramps **linearly from a phase START to a phase PEAK** (both inside the band ranges in the table above), as a function of the **in-phase week index**:
`progress = clamp01((weekInPhase − 1) / (rampWeeks − 1))`, then `yards = round-to-50(lerp(START, PEAK, progress))`.
- Ramp window: **base & build = 6 weeks**, **race-specific = 4 weeks**. `weekInPhase` beyond the window clamps at PEAK.
- Base yardage is **0.8×** the build-ramp curve; taper is a fixed **0.6×** scale (no ramp); recovery returns its band (no ramp).
- `weekInPhase` **must** be the recovery-non-resetting in-phase position (`weekInPhaseForTimeline(phaseBlocks, weekNum, block)`) — **never** `weekNum − block.startWeek + 1` / `weekInBlock`, which per **ADR 0002** is always `1` and silently flattens the ramp (this rule exists so that defect cannot regress).
- Applies to **base, build, and race-specific** (all three use this `phaseProgress` mechanism). §4.2/§4.3 inherit this rule; taper/recovery excepted as above.
- **Endpoint mapping (resolve path):** in `swim-protocol-volumes.ts:resolveSwimSlotYardsWithBudget`, the (`distance`, `fitness`, `phase`, `session_type`) **band IS the envelope** — `START = band_floor` (`getProtocolFloor`), `PEAK = band_ceil` (`getProtocolCeiling`). Final yards = `roundYards(lerp(band_floor, band_ceil, phaseProgress(weekInPhase, rampWeeks)))`. The per-slot `*_START_YDS`/`*_PEAK_YDS` constants in `_shared/swim-program-templates.ts` define the **preliminary** template (shape across slots/distances/phases) consumed upstream; the band-lerp here is the final, ratified value. Floor/ceil functions are untouched — band as envelope, ramp interpolates within.

### 4.2 Build phase (weeks 7-10)

**Focus:** Threshold development, sustained CSS work.

| Session type | Count/week | Distance | Intensity |
|---|---|---|---|
| Threshold | 1 | 2500-3500yd | Z3-Z4 (CSS to CSS - 2s) |
| Endurance / Race-Specific Aerobic | 1 | 2500-3500yd | Z2 (CSS + 8s) |
| Optional 3rd: Mixed/Fartlek | 0-1 | 2000-3000yd | mixed Z2-Z4 |

**Drill ratio:** Reduced. Drills now serve as warm-up patterning, not main sets.

### 4.3 Race-specific phase (weeks 11-14 of a typical single-race 17-18wk plan — illustrative, non-binding)

> **Non-binding week numbers (Gap 7 / `RACE-WEEK-PROTOCOL.md §8.6`):** the engine assigns the race-specific block by plan *position*, not fixed weeks 11-14. Two-race plans realize different weeks — e.g. the reference two-70.3 plan has B-race = wk13, A-race = wk17 (see `docs/RACE-WEEK-PROTOCOL.md §1.1`). Do not treat "weeks 11-14" as a contract.

**Focus:** Race rehearsal, open water skills, pacing at race effort.

| Session type | Count/week | Distance | Intensity |
|---|---|---|---|
| Race-Specific Aerobic | 1 | 2000-2500yd | Race effort |
| Open Water Skills (when accessible) OR Race-Pace Sustained | 1 | 2000-3000yd | Race effort + sighting |
| Optional 3rd: Threshold OR Time Trial | 0-1 | 2000-2500yd | Z4 |

**Drill ratio:** Minimal. Focused on race-specific drills only (sighting, bilateral breathing under fatigue).

### 4.4 Taper (race week)

**Focus:** Neural readiness, no fatigue accumulation.

| Session type | Count/week | Distance | Intensity |
|---|---|---|---|
| Race-Spec Light | 1 | 800-1200yd | Race effort short repeats |
| Recovery | 1 | 600-1000yd | Z1, drills only |

No long sets. No threshold work. Final swim 2-3 days before race.

---

## 5. Session types library

### 5.1 Technique Aerobic
**Purpose:** Build aerobic base while reinforcing stroke mechanics.
**Structure:** WU 300 → 2-3 drills (150-300yd) → Aerobic main set (1500-2500yd at Z2) → CD 200.
**Phase use:** Base primarily.

### 5.2 CSS Aerobic
**Purpose:** Build CSS-specific aerobic capacity.
**Structure:** WU 300 → Short drill block (100-150yd) → 12-16×100yd at CSS pace, 15s rest → CD 200.
**Phase use:** Base late, Build.

### 5.3 Threshold
**Purpose:** Develop sustainable pace at and above CSS.
**Structure:** WU 300 → 1 drill (100yd) → 8-12×100yd at CSS - 2s, 10-15s rest, OR 4-6×200yd at CSS, 20s rest → CD 200.
**Phase use:** Build, Race-specific.

### 5.4 Race-Specific Aerobic
**Purpose:** Rehearse race pacing over race-distance.
**Structure:** WU 300 → Sighting drill (100-200yd) → 5-8×200yd at race effort, OR 3×600yd at race effort, 45s rest → CD 200. **Total: 1500-2500yd** scaled by phase (1500 base, 2000 build, 2500 race-spec).
**Phase use:** Race-specific primarily.

### 5.5 Pull-Focused
**Purpose:** Upper-body fitness, stroke isolation.
**Structure:** WU 300 → Drills (100yd) → 6-8×100 pull with buoy, 4-6×100 full stroke → CD 200.
**Phase use:** Any phase, athlete equipment-gated (requires pull buoy).
**Substitution:** When no pull buoy, substitute with Endurance session (per Rock 2 equipment-aware substitution already shipped).

### 5.6 Kick-Focused
**Purpose:** Leg propulsion, body position.
**Structure:** WU 300 → 8-12×50 kick (with kickboard or fins) → Build swimming 4×200 → CD 200.
**Phase use:** Base, Build.
**Substitution:** When no kickboard/fins, substitute with Endurance.

### 5.7 Mixed/Fartlek
**Purpose:** Pace variation, race-readiness, breaks monotony.
**Structure:** WU 300 → Drills (100yd) → 8×200 alternating Z1 drill / Z3 hard, OR 4×400 Z2-Z4 building → CD 200.
**Phase use:** Build primarily.

### 5.8 Time Trial
**Purpose:** CSS measurement, race rehearsal.
**Structure:** WU 500 with build → 400yd max effort → 4min rest → 200yd max effort → CD 300. Compute new CSS = 200 / (T400 - T200).
**Phase use:** Every 6-8 weeks. Typical 17-18wk plan: 3 test points (week 1-2 baseline, week 9-10 mid-build, week 15-16 pre-taper).

### 5.9 Open Water Skills
**Purpose:** Sighting, wetsuit comfort, group swim rehearsal.
**Structure:** Open water or pool with sighting every 6 strokes throughout. Multiple bouts of "race start" hard 100yd → settle into pace.
**Phase use:** Race-specific primarily. Optional in build for athletes with regular open water access.
**Note:** Skip-optional. Not all athletes have safe open water access. Surface trade-off when skipped.

### 5.10 Race-Pace Sustained
**Purpose:** Sustained race-effort intervals at race distance.
**Structure:** WU 300 → Drills (100yd) → 3-4×600yd at race pace, 45s rest → CD 300. Total ~2500yd.
**Phase use:** Race-specific only.

### 5.11 Recovery
**Purpose:** Active recovery, technique reinforcement at low intensity.
**Structure:** WU 200 → 3-4×100 easy with drill focus → CD 200. Total 600-1000yd.
**Phase use:** Any phase, sparingly.

---

## 6. Drill philosophy

### 6.1 Drill library mapped to stroke phase

| Drill | Stroke phase targeted | Teaching point | Equipment |
|---|---|---|---|
| Catch-Up | Timing / front-quadrant | Hand enters before exit hand stops | None |
| Fingertip Drag | Recovery / high elbow | Maintain high-elbow recovery, relax forearm | None |
| Fist Swim | Catch / early vertical forearm | Find pull pressure without hand surface area | None |
| Single-Arm Freestyle | Rotation / body roll | Isolate stroke side, develop independent rotation | None |
| 6-3-6 Rotation | Rotation / breathing | Six kicks on side, three strokes, six kicks other side | None |
| Zipper Drill | Recovery / shoulder position | Recovery hand traces side from hip to ear | None |
| Sculling (front) | Catch / feel for water | Hand pressure forward of head, feel grip | None |
| Sighting Drill | Race-specific / navigation | Head-up sight every 6 strokes, then breathe | None |
| Kick on Side | Body position / rotation | Hold side position kicking, head down | Optional fins |
| Pull with Buoy | Upper-body isolation | Remove kick, focus on catch and pull | Pull buoy required |

### 6.2 Drill selection by phase

| Phase | Primary drills | Why |
|---|---|---|
| Base | Catch-Up, Fingertip Drag, Single-Arm, 6-3-6 | Foundation: timing, recovery, rotation |
| Build | Fist Swim, Sculling, Zipper Drill, drill combos | Refinement: catch pressure, feel for water |
| Race-specific | Sighting Drill, Single-Arm (race rotation), bilateral breathing | Race skills under fatigue |
| Taper | Light reminders only — Catch-Up, Fingertip Drag | Neural priming, no new patterning |

### 6.3 Drill selection rules

The per-session drill **count** is set by §5 per-type prescriptions (typically 1 drill; 2-3 for Technique Aerobic per §5.1). §6.3 governs **selection within that count** — how the picker rotates drills across sessions and pairs them within a session. "Rotates" below refers to temporal variation across sessions, not multiple drills within one session. §5 per-type counts are **authoritative**; §6.3's "2-3" is the global default for cases §5 doesn't specify (ratified 2026-05-19, Phase 3 Slice 3a).

Selection rules:

- Never repeat the same drill across consecutive sessions (variety)
- When ≥2 drills are emitted in one session (per §5.1 Technique Aerobic), pair drills that target different stroke phases (don't pair two catch drills)
- Beginner sessions can repeat foundation drills more often (mastery requires repetition)
- Competitive sessions minimize drill volume, focus on race-specific drills only
- Drill yardage scaled by experience level (see §2 ratio table)

### 6.4 What the system can and can't do

**Can:**
- Prescribe research-backed drill progression appropriate to phase, level, and equipment
- Sequence drills across the plan to build complementary skills
- Adapt drill yardage to athlete experience level
- Surface trade-off messages when drill prescription doesn't match athlete need (no equipment for pull-buoy drills, etc.)

**Cannot:**
- Watch the athlete's stroke and identify their specific flaw
- Verify drill execution quality
- Replace a coach's eye

**Honest acknowledgment:** For Learning-level athletes, the system surfaces a Masters swim recommendation. Drill progression is sound, but individual stroke correction requires either Form goggle video analysis or human coaching.

---

## 7. Pace derivation

### 7.1 Athlete inputs (already in wizard)

- **Easy pace per 100yd or 100m** — sustainable for 2000+ yards
- **Race-effort pace per 100yd or 100m** — what they'd hold for 1500m race

### 7.2 Internal CSS computation

If athlete provides race-effort pace:
```
CSS ≈ race-effort pace per 100
```

This approximation works because CSS by definition is the 1500m race pace per 100. Refinement comes from a Time Trial session (see §5.8) where the engine computes:
```
CSS = 200 / (T400 - T200)
```

After a Time Trial session, the engine updates the athlete's CSS and recalibrates subsequent pace prescriptions.

### 7.3 Zone prescriptions

All swim intensities map to CSS percentages or CSS + offset:

| Zone | Description | Pace target |
|---|---|---|
| Z1 Recovery | Very easy, sustainable forever | CSS + 15s or slower |
| Z2 Endurance/Base | Comfortable aerobic | CSS + 8-15s |
| Z3 Tempo | Moderate hard | CSS + 3-8s |
| Z4 Threshold | At CSS | CSS to CSS - 2s |
| Z5 VO2/Speed | Above CSS | CSS - 3s and faster |

Session descriptions reference both zones AND pace targets so the athlete sees both:
> "5×100 at CSS pace (1:40/100yd), 15s rest"

### 7.4 No pace data on file

When athlete has no swim pace data:
- Conservative defaults: easy = 2:00/100yd, threshold = 1:45/100yd (slow age-group ranges)
- Trade-off message surfaces: "Pace targets will be conservative until you log a swim. Complete a Time Trial session in week 1-2 to calibrate."
- All pace prescriptions shift to RPE language: "moderate effort, sustainable for 1500yd"

---

## 8. Equipment tiers

### 8.1 Pool gear inventory

Wizard collects athlete's swim equipment:
- Pull buoy
- Paddles
- Snorkel
- Kickboard
- Fins

### 8.2 Session generation by equipment

| Session type | Required equipment | Substitution if missing |
|---|---|---|
| Pull-Focused | Pull buoy | → Endurance session |
| Kick-Focused (sprint/oly) | Kickboard | → Endurance session |
| Kick-Focused (70.3/full) | Fins or kickboard | → Endurance session |
| Drill: Pull with Buoy | Pull buoy | Skip drill, use single-arm instead |
| Drill: Kick on Side | Optional fins | Works without fins |
| All other sessions | None | N/A |

### 8.3 Per-session gear summary line

Every swim session emits the "Pool gear" line (already shipped):
- "Pool gear — Required: Pull buoy. Optional: Paddles, Snorkel."
- "Pool gear — Optional: Snorkel." (when only athlete-owned optional applies)
- (Omitted when nothing required and no useful optional)

---

## 9. Race week protocol

### 9.1 70.3 race week

| Day | Session |
|---|---|
| Mon | Race-Spec Light: 800-1200yd, 4-6×100 at race effort + drills + 1×200 at race effort |
| Tue | Off or Easy Bike Openers |
| Wed | Light swim 600yd if desired, all drills, no main set |
| Thu | Easy Run, no swim |
| Fri | Race-Spec Light: 600-1000yd, 3-4×100 at race effort, drills, no fatigue |
| Sat | REST or pre-race shake-out swim (200-400yd race rehearsal in race venue) |
| Sun | RACE |

### 9.2 Post-race recovery week

- 3-7 days off swimming entirely
- Resume with Recovery session (600-1000yd) at end of recovery week
- Next training block opens at Base-level swim volume, regardless of pre-race volume

---

## 10. Fitness-tier session-type selection

### 10.1 Principle

Session types are gated by **swim fitness tier**, not just by phase. A learning swimmer in build phase still needs technique-forward aerobic work; the threshold + race-specific rotation that drives intermediate/advanced athletes is inappropriate for beginners regardless of phase.

The current implementation (`_shared/swim-program-templates.ts: raceTwoSwimRotationSlotMeta` for the race-intent path, `FOCUS_70_3_SLOT_META` for the focus-intent path) treats per-slot session type as a pure function of `planWeek % 4` (race intent) or fixed slot meta (focus intent). `athleteFitness` modulates **yardage** through `protocolMidVolumeMultiplier` but does NOT change **session type**.

This section codifies fitness-tier–driven session selection. The **volume** layer (Ticket-B per-session cap, D-022; `swim_fitness` clamp, D-024) already handles beginners on the volume axis. §10 closes the equivalent gap on the **type** axis. The two layers are orthogonal and compose.

### 10.2 Session-type matrix by tier

| Swim fitness | Allowed session types | Banned session types |
|---|---|---|
| **Beginner** | Technique Aerobic (§5.1), CSS Aerobic (§5.2 — light density), Recovery (§5.11), Kick-Focused (§5.6), Pull-Focused (§5.5 — gear permitting) | Threshold (§5.3), Race-Specific Aerobic (§5.4), Race-Pace Sustained (§5.10), Time Trial (§5.8), Mixed/Fartlek (§5.7 with Z3-Z4 segments), Open Water Skills (§5.9 — defer to Masters coach per §2) |
| **Intermediate** | All §5.x types | None |
| **Advanced** | All §5.x types | None |

**Rationale:**
- **Threshold (§5.3)** at CSS − 2s presupposes the athlete has a calibrated CSS *and* the stroke mechanics to hold pace under fatigue. A learning swimmer has neither; the prescription degenerates into "swim fast and break form" (counter-productive) or "swim slow and miss the dose" (under-stimulus). Technique Aerobic + CSS Aerobic at Z2 covers the same energy band without the form penalty.
- **Race-Specific Aerobic (§5.4)** is race rehearsal — useless before race-relevant pace has stabilized. The drill-forward Technique Aerobic at equivalent yardage is a strict upgrade for the learner population.
- **Race-Pace Sustained (§5.10) + Time Trial (§5.8)** — same logic. No CSS = no pace target = no rehearsal value.
- **Mixed/Fartlek (§5.7)** with Z3-Z4 segments is downstream of threshold-fluency; a beginner-tier variant could exist (Z2 with form-breaks) but is out of this slice's scope.
- **Open Water Skills (§5.9)** — sighting + race-start surges before stroke economy is established trains compensatory patterns. Defer to the Masters coach the wizard already recommends for learners (§2).

### 10.3 Beginner rotation variant (race-intent path)

For 2-swim weeks with `swim_fitness === 'beginner'`, the existing 4-week rotation at `_shared/swim-program-templates.ts:224-261 raceTwoSwimRotationSlotMeta` produces:

| planWeek % 4 | Slot 0 (quality day) | Slot 1 (easy day) |
|---|---|---|
| 1 | threshold | race_specific_aerobic |
| 2 | threshold | pull_focused |
| 3 | technique_aerobic | race_specific_aerobic |
| 0 | threshold | speed |

The beginner variant substitutes the banned types per §10.2 via a fixed substitution map:

| Banned type | Beginner substitution |
|---|---|
| threshold | css_aerobic |
| race_specific_aerobic | technique_aerobic |
| speed | technique_aerobic |
| _allowed pass-through:_ pull_focused, technique_aerobic, css_aerobic, kick_focused, recovery | (unchanged) |

Realized beginner rotation:

| planWeek % 4 | Slot 0 (quality day) | Slot 1 (easy day) |
|---|---|---|
| 1 | **css_aerobic** | **technique_aerobic** |
| 2 | **css_aerobic** | pull_focused |
| 3 | technique_aerobic | **technique_aerobic** |
| 0 | **css_aerobic** | **technique_aerobic** |

**Plan #78 closure:** Week 1 (planWeek % 4 = 1) for `swim_fitness='beginner'` now emits `[css_aerobic, technique_aerobic]` instead of `[threshold, race_specific_aerobic]`. The drill-forward technique aerobic + the lower-intensity CSS aerobic match what §10.2 prescribes for the learner population.

### 10.4 Beginner rotation variant (focus-intent path)

For 3-swim weeks with `swim_fitness === 'beginner'`, the existing focus-intent slot meta (`_shared/swim-program-templates.ts:86-102 FOCUS_70_3_SLOT_META`) produces `[threshold, technique_aerobic, css_aerobic]` baseline (with slot 1 alternating pull/kick across phases per the existing logic at `:436-466`).

Beginner variant: `[css_aerobic, technique_aerobic, recovery]`. Substitution rule:
- Slot 0: threshold → css_aerobic (per §10.3 map).
- Slot 1: technique_aerobic unchanged (allowed); the existing pull/kick phase-alternation logic stays applicable since pull_focused / kick_focused are both allowed for beginners (§10.2).
- Slot 2: css_aerobic → recovery. The third weekly touch for a learning swimmer is most usefully a low-stress technique reinforcement at 600-1000yd (per §5.11), not a third density block.

The phase-driven pull/kick rotation on slot 1 (build kick alternation, race-specific pull weeks) is preserved unchanged for beginners — those types are §10.2-allowed.

### 10.5 Volume layer unchanged (composes with D-022 / D-024)

The Ticket-B per-session cap (D-022) and the `swim_fitness` override (D-024) handle the **volume** axis. After this spec ships, beginners get:
1. Different SESSION TYPES per §10.3 / §10.4 (this slice).
2. The same per-session yardage caps the volume layer already enforces (`learnerSessionCap` at 2000yd threshold / 2500yd aerobic — but since beginners no longer get threshold sessions, the 2000yd cap is functionally dead-code for the §10.3 path; the 2500yd aerobic cap remains live).

Both layers compose without coordination — type substitution happens at template selection (`getSwimSlotTemplates`), yardage capping happens at the resolver (`getProtocolCeiling` → `resolveSwimSlotYardsWithBudget`). The capping path doesn't care that the upstream substituted the type; it caps whatever ends up in the slot.

### 10.6 Anti-regression rule (must not break intermediate/advanced)

The `raceTwoSwimRotationSlotMeta` function and the `FOCUS_70_3_SLOT_META` constant **must stay untouched** for `swim_fitness ∈ {intermediate, advanced}`. The implementation must be **additive**: new beginner-only variants selected at the dispatch level. Touching the existing rotations would risk regressing the swim arc's locked behavior (D-020 — within-phase ramp, §6.2 drill pools, §6.3 hierarchy).

**Required implementation shape:**
- New `raceTwoSwimRotationSlotMetaForBeginner(planWeek): Omit<SwimSlotTemplate, 'target_yards'>[]` in `_shared/swim-program-templates.ts`, or a pure substitution helper applied to the existing meta output.
- New `FOCUS_70_3_SLOT_META_BEGINNER` constant, or an equivalent substitution applied at the focus-intent path.
- `getSwimSlotTemplates` dispatches on `opts.athleteFitness === 'beginner'` to the beginner variants; falls through to the existing rotation otherwise.
- **Pin tests (mandatory):**
  - Beginner Week-1 race-intent → `[css_aerobic, technique_aerobic]` (Plan #78 closure regression lock).
  - Intermediate Week-1 race-intent → `[threshold, race_specific_aerobic]` unchanged (no-regression lock).
  - Advanced Week-1 race-intent → `[threshold, race_specific_aerobic]` unchanged (no-regression lock).
  - Beginner focus-intent → `[css_aerobic, technique_aerobic, recovery]`.
  - Intermediate focus-intent → `[threshold, technique_aerobic, css_aerobic]` unchanged.

### 10.7 What this section does NOT do

- Does not change phase definitions (§4.1–§4.4). The phase still drives which slot mix is active; §10 only modifies the per-slot session TYPES when the athlete is a beginner.
- Does not change volume bands or per-session ceilings (`swim-protocol-volumes.ts` is unchanged).
- Does not change drill rotation rules (§6.2 / §6.3). Drills still pull from the phase pool; the §6.3 fitness-tier drill biasing (D-020 Slice 3d, `f53bbf34`) is a separate concern at a different layer (drill picker, not session type).
- Does not back-fill production plans. Standard opt-in-via-regenerate posture.
- Does not change the strong-swimmer side. `swim_fitness === 'advanced'` already uses the full rotation; the symmetry that D-024 introduced on the volume axis (strong → advanced clamp) means a beginner-global / strong-swim athlete already gets the advanced rotation today. No change needed for the strong side.
- Does not introduce a comeback-specific path. Comeback athletes resolve via the soft `training_fitness` signal in `inferTrainingFitnessLevel` (training_intent='comeback' → score -1) and aren't touched by the `swim_fitness` clamp. The tier-only framing is sufficient for this slice; a comeback-specific session-type variant would be a separate spec slice if a real need surfaces.

### 10.8 Distance-agnostic

§10.3 and §10.4 describe the 70.3 rotation explicitly because the 70.3 templates are the named structures in `_shared/swim-program-templates.ts` (`raceTwoSwimRotationSlotMeta`, `FOCUS_70_3_SLOT_META`). The same code paths serve **sprint, olympic, and full IM** distances — those distances flow through `getSwimSlotTemplates` via the same rotation logic, with `normalizeSwimProgramDistance` defaulting unknown labels to `70.3`. The beginner substitutions defined here therefore apply **uniformly across all race distances**: a beginner-tier athlete in a sprint, olympic, 70.3, or full IM plan gets the same session-type substitution map (`threshold → css_aerobic`, `race_specific_aerobic → technique_aerobic`, `speed → technique_aerobic`). Distance affects yardage via the per-band tables but does NOT modify the type-substitution rule.

---

## 11. Implementation pointers + research references

### 10.1 Files that need to read this spec

- `supabase/functions/_shared/swim-protocol.ts` (new) — protocol selection logic
- `generate-combined-plan/session-factory.ts` — swim session generation
- `generate-combined-plan/swim-protocol-volumes.ts` — volume bands per phase
- `_shared/swim-drill-tokens.ts` — drill library + rendering
- `ArcSetupWizard.tsx` — Masters swim recommendation for Learning-level

### 10.2 What changes from current behavior

- **Race-Specific Aerobic** sessions currently 1000yd, should scale 1500-2500yd by phase (§5.4)
- **Drill rotation** currently per-session-type hard-coded; should rotate from phase pool (§6.3)
- **Week 7 build week** showing 1750yd recovery-level volume — investigate misclassification
- **Equipment line duplication** on some sessions — deduplicate
- **Drill tokens** (Single-Arm, 6-3-6, Zipper, Sculling) exist but never selected by generators — wire in
- **Missing session types** (Time Trial, Open Water Skills, Mixed/Fartlek, Race-Pace Sustained) — implement
- **CSS terminology** inconsistent across sessions — standardize to "CSS" + pace target
- **Masters recommendation** for Learning-level — surface in wizard

### 10.3 Same pattern as strength

This spec follows the same architecture as `STRENGTH-PROTOCOL.md`:
- Athlete intent + experience drive protocol selection
- Phase-based progression with clear phase definitions
- Equipment-aware substitution chains
- Conservative defaults with trade-off messages when no data
- Honest acknowledgment of system limits

---

## 12. Research references

- **CSS methodology:** Costill, Maglischo, Richardson — developed CSS as the swim-equivalent of FTP/lactate threshold. Used by World Aquatics, Triathlon Australia, British Swimming as primary training intensity metric. CSS = 200m / (T400 - T200).
- **Frequency consensus:** USA Triathlon (2-3 swims/week for age-groupers), MyProCoach Half IRONMAN plans (minimum 2 swims/week), 220 Triathlon (frequency over duration: "2×30min better than 1×60min"). Research shows drop from 4 to 2-3 sessions does not reduce gains for age-group triathletes.
- **Drill ratio by level:** USA Triathlon coaching guidelines (beginner 75% drill, intermediate 30%, advanced 10%). Skill acquisition requires frequency more than volume for newcomers.
- **Drill library:** USA Triathlon coaching resources, Total Immersion methodology (Terry Laughlin), GO SWIM drill libraries, Speedo coaching guidelines.
- **Time Trial / CSS testing:** Tri Training Harder, MyProCoach, Triathlonpace.com — standard 400m+200m time trial protocol, retest every 6-8 weeks.
- **Open water skills:** Triathlete magazine, Fitzgerald's *Triathlete Training Bible* — race-specific phase integration, sighting every 6 strokes as race-readiness drill.
- **Masters swimming for adult learners:** US Masters Swimming (usms.org), USA Triathlon coaching education — recommended supplementation for adult learners; coach poolside feedback addresses individual stroke flaws.
- **Concurrent training (swim + bike + run):** Multiple endurance training studies confirm 2-3 swim sessions sufficient for 70.3 athletes whose primary disciplines are bike and run; additional volume produces diminishing returns.

---

End of document.
