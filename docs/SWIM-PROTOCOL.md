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

**Beginner variant (`swim_fitness === 'beginner'`):**
- **Drill block:** 3-4 drills, 300-450yd (Path A per §10 / D-020). Distinct §6.1 stroke phases per the §6.3 Path A pairing rule — the larger drill block IS the work for the learner population, so cross-phase pairing is appropriate here.
- **Main set:** Simpler structure — `4-6 × 200yd at Z1-Z2 (CSS + 10-15s), 20s rest`. Longer rest than the intermediate prescription so the swimmer can reset stroke focus between repeats.
- **Coaching emphasis:** Drill execution > distance. *"This is a technique session first. If you lose form on a repeat, take longer rest before the next one."* Quality over volume — if the stroke breaks down, cut the main-set count rather than push through.
- **Total yardage:** Same band as intermediate (~2000-2500yd post-D-022 cap); volume drops within the band via `protocolMidVolumeMultiplier`. Drill block grows; main set shrinks proportionally.
- Foundation-drill bias per §6.3 fitness-tier biasing (D-020 Slice 3d): catchup, fingertipdrag, singlearm, 616 favored.
- **Equipment (per §8.4 2026-05-22 revision):** **Fins are recommended when owned** — they hold the swimmer horizontal so the drill cue (catch, recovery, rotation) lands without the athlete fighting to stay afloat. Surfaced as `recommended:fins` when athlete owns fins. Snorkel optional. Paddles suppressed (catch-feel bypass).

### 5.2 CSS Aerobic
**Purpose:** Build CSS-specific aerobic capacity.
**Structure:** WU 300 → Short drill block (100-150yd) → 12-16×100yd at CSS pace, **rest per tier table below** → CD 200.
**Phase use:** Base late, Build.

**Rest by fitness tier (LOCKED 2026-05-22 per 220 Triathlon CSS progression):**

| Tier | Rest interval (week 1 of phase) | Rationale |
|---|---|---|
| Beginner | 25s | Form reset between repeats; under-recovered beginners lose stroke quality fast. |
| Intermediate | 15s | Standard CSS prescription (220 Triathlon). |
| Advanced | 15s | Standard density; tightens via §5.2.1 across the phase ramp. |

The week-1 rest above is the **START** of the within-phase progression in §5.2.1. Single flat rest across the phase is incorrect — rest should tighten as the athlete adapts.

**Beginner variant (`swim_fitness === 'beginner'`):**
- **Drill block:** 2-3 drills, 200-300yd (promotes the §5.2 session from Path B single-drill to Path A multi-drill for the learner population). **One stroke-phase focus per session** (per §6.5 — drill block smaller than §5.1, main set is the real work; don't pair a catch drill with a rotation drill here). Foundation-biased per §6.3 (catchup OR fingertipdrag OR singlearm, not mixed).
- **Main set:** Simpler repeats — `6-8 × 100yd at CSS + 5s (Z2-Z3 boundary, conversational-effort), rest per §5.2.1 (25→20s across phase ramp)`. Slower target pace, fewer reps — keeps the session aerobic and form-sustainable.
- **Coaching emphasis:** Pace consistency > pace target. *"Hit the same 100yd time on every repeat — if the last one is more than 3 sec slower than the first, you started too fast."*
- **Total yardage:** Capped at 2500yd per D-022. With the larger drill block, main set lands at ~1800-2000yd.
- CSS pace itself is conservative for learners; if no CSS test on file, the fallback cue from §7.5 replaces the numeric pace target in session copy.

### 5.2.1 CSS rest-interval progression across the phase ramp (LOCKED 2026-05-22)

Rest tightens within each phase as the athlete adapts — the standard 220 Triathlon CSS progression. Same `weekInPhase` mechanism as the §4.5 volume ramp; same ADR-0002 footgun applies.

**Endpoints (rest seconds, lerp START → PEAK across the phase ramp window):**

| Tier | base (6-wk ramp) | build (4-wk ramp) | race_specific (4-wk ramp) |
|---|---|---|---|
| Beginner | 25 → 20 | 20 (flat — beginner band) | n/a (beginners receive technique_aerobic in race_specific per §10.3) |
| Intermediate | 15 → 12 | 12 → 10 | 10 (flat) |
| Advanced | 15 → 12 | 12 → 10 | 10 (flat) |

**Mechanism:** `restSec = round(lerp(START_REST_TIER, PEAK_REST_TIER, phaseProgress(weekInPhase, rampWeeks)))`. Rounded to integer seconds. `weekInPhase` MUST be `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` — the recovery-non-resetting in-phase index. **NEVER `weekInBlock`** (always 1 per ADR-0002 — same anti-regression rule as the §4.5 volume ramp).

**Validator-floor implication:** swim rest is a within-session prescription, NOT a weekly-volume floor. No D-027-style two-layer Math.max trap applies. Single-layer fix at the session-factory site; no validator parity needed.

**Rationale:** the athlete's CSS rises across the phase AND density rises within the same target pace, compounding aerobic adaptation. Flat rest leaves training stimulus on the table. Per 220 Triathlon CSS progression guide + Swim Smooth tier-tiered rest tables.

### 5.3 Threshold
**Purpose:** Develop sustainable pace at and above CSS.
**Structure:** WU 300 → 1 drill (100yd) → 8-12×100yd at CSS - 2s, 10-15s rest, OR 4-6×200yd at CSS, 20s rest → CD 200.
**Phase use:** Build, Race-specific.

### 5.4 Race-Specific Aerobic
**Purpose:** Rehearse race pacing over race-distance.
**Structure:** WU 300 → Sighting drill (100-200yd) → 5-8×200yd at race effort, OR 3×600yd at race effort, 45s rest → CD 200. **Total: 1500-2500yd** scaled by phase (1500 base, 2000 build, 2500 race-spec).
**Phase use:** Race-specific primarily.

**Open water race-specific elements** (intermediate / advanced only — banned for beginners per §10.2):

When executed in open water OR when the athlete has open-water access during race-specific phase, the following race-rehearsal elements layer on top of the base structure:

- **Sighting cadence:** every 6-8 strokes throughout the main set, not just during the sighting drill block. Head-up sight without breaking stroke rhythm — eyes open just long enough to spot the next buoy, then back to face-down.
- **Bilateral breathing:** at least 50% of repeats with breathing pattern alternating sides (e.g., every 3rd or every 5th stroke). Required for managing sun glare and chop direction on race day. *"If the sun is on your right, you'll need to breathe left — practice it now."*
- **Drafting position awareness:** when swimming with a group, practice both lead (no draft) and feet/hip-side draft positions. Real-race energy savings from drafting are ~10-15% effort reduction; learning to find and hold the draft is a race-day skill.
- **Wetsuit requirement** (when race mandates wetsuit — water temp < 78°F per most race rules): athlete is recommended to complete **at least 2 open-water sessions in a wetsuit during the race-specific phase**. Pool wetsuit acclimation is not equivalent — buoyancy shifts body position; neck-chafe management is open-water-specific. If no open-water access logged, the engine surfaces a trade-off warning: *"Race requires wetsuit; no open-water access logged. Recommend at least 2 wetsuit-on swims in lake / ocean / reservoir before race day."*

**Substitution when no open-water access:** session executes as written in pool (sighting drill at start, bilateral-breathing rule on main set). The trade-off message above surfaces; the §5.9 Open Water Skills session is skip-optional per §5.9.

**Beginner exclusion (§10.2):** beginners receive Technique Aerobic in place of Race-Specific Aerobic per §10.3 substitution. Open water for a learner is a stroke-economy-degrading environment — deferred to a Masters coach per §2. The open-water specifics in this subsection do NOT apply to beginners.

### 5.5 Pull-Focused
**Purpose:** Upper-body fitness, stroke isolation.
**Structure:** WU 300 → Drills (100yd) → 6-8×100 pull with buoy, 4-6×100 full stroke → CD 200.
**Phase use:** Any phase, athlete equipment-gated (requires pull buoy).
**Substitution:** When no pull buoy, substitute with Endurance session (per Rock 2 equipment-aware substitution already shipped).

**Beginner variant (`swim_fitness === 'beginner'`):**
- **Drill block:** 2 drills, 200yd. **One stroke-phase focus per session** (per §6.5 — drill block smaller than §5.1, main set is the real work). Foundation drills only — catchup OR singlearm. NOT sculling (too advanced — beginners lack the catch fluency to feel pressure changes). NOT fist swim (counter-productive without catch fluency).
- **Main set:** Lighter pull volume — `4-6 × 100yd pull with buoy at Z2 (CSS + 10-15s), 25s rest` + `4 × 100yd full stroke easy aerobic, 20s rest`. The buoy is a posture / catch-feel tool for beginners, not an upper-body conditioning tool.
- **Paddles NOT recommended** for beginners on pull repeats — finger-tip sensitivity needed for catch development; paddles bypass the feedback. Coaching cue text suppresses the "paddles optional" line for `athleteFitness === 'beginner'` (per §8.4 surfacing rule).
- **Coaching emphasis:** Catch feel > pull strength. *"With the buoy holding your hips, focus on getting an early grab on the water with each stroke. If your shoulders feel sore, you're pulling too hard — back off."*
- **Total yardage:** Same band as intermediate, ~1000-1400yd typical.

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

**Beginner variant (`swim_fitness === 'beginner'`):**
- **Structure:** Drill-led entirely — `WU 200 → 4 × (50 drill + 50 full stroke) → CD 200`. ~500-700yd total. **One drill focus per session** (per §6.5) — single foundation drill chosen from catchup / fingertipdrag / singlearm; the recovery session for a beginner is essentially a low-volume technique session, not a fatigue-relief session.
- **Coaching emphasis:** "Easy and aware" — keep stroke rate low (target ~50-55 strokes/min for a 25yd pool), focus on body position and recovery elbow height. A movement-quality session at low intensity.
- **Phase use:** Deload weeks AND optionally a 3rd weekly touch for `swim_intent='focus'` beginners (per §10.4 slot 2 substitution — `[css_aerobic, technique_aerobic, recovery]`).
- **Total yardage:** Lower end of band — 600-800yd.
- **Equipment:** none (per §8.4) — the session is movement-quality-focused; gear bypasses that intent.

---

## 6. Drill philosophy

### 6.1 Drill library mapped to stroke phase

Equipment column lists **required** gear only. Soft-recommend gear (body-position aids per coaching research) lives in §6.6.

| Drill | Stroke phase targeted | Teaching point | Equipment (required) | Tier gate |
|---|---|---|---|---|
| Catch-Up | Timing / front-quadrant | Hand enters before exit hand stops | — | all |
| Fingertip Drag | Recovery / high elbow | Maintain high-elbow recovery, relax forearm | — | all |
| Fist Swim | Catch / early vertical forearm | Find pull pressure without hand surface area | — | all |
| Single-Arm Freestyle | Rotation / body roll | Isolate stroke side, develop independent rotation | — | all |
| 6-3-6 Rotation | Rotation / breathing | Six kicks on side, three strokes, six kicks other side | — | all |
| Zipper Drill | Recovery / shoulder position | Recovery hand traces side from hip to ear | — | all |
| Sculling (front) | Catch / feel for water | Hand pressure forward of head, feel grip | — | **intermediate+ ONLY** — hard-banned from beginner inset (beginners lack catch fluency to feel pressure changes; the drill teaches nothing without that baseline). |
| Sighting Drill | Race-specific / navigation | Head-up sight every 6 strokes, then breathe | — | all (race-specific phase) |
| Kick on Side | Body position / rotation | Hold side position kicking, head down | — | all |
| Pull with Buoy | Upper-body isolation | Remove kick, focus on catch and pull | Pull buoy (required) | all |

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

**Beginner body-position teaching: pull buoy + ankle band.** A pull buoy paired with an ankle band is a strong body-position teaching tool for beginners — distinct from "buoy as fitness crutch" which this spec rightly warns against (§5.5). With ankles bound, the swimmer cannot use a kick to compensate for poor alignment; they're FORCED to hold horizontal posture through core engagement + balanced rotation. Sources: Swim Smooth, Tri Training Harder. Currently NOT surfaced in athlete copy because **ankle band is not in the §8.1 equipment enum** — filed as Q-020 for a separate slice (wizard scope decision first).

### 6.5 Drill volume by fitness tier

Per-session drill block size is gated by `swim_fitness` tier, in addition to the per-§5 prescriptions. This subsection codifies the tier-level scaling that the picker (`pickSwimDrillInset`) currently encodes loosely via foundation-vs-race biasing (D-020 Slice 3d).

| Swim fitness | Per-session drill volume | Drill count | Selection bias |
|---|---|---|---|
| **Beginner** | 200-400yd (10-15% of session) | 2-4 drills | Foundation drills (catchup, fingertipdrag, singlearm, 616). See per-§5 type-specific rules below for stroke-phase pairing. |
| **Intermediate** | 100-200yd (4-8% of session) | 1-2 drills | Phase-appropriate rotation per §6.2 — base = foundation, build = refinement (fist, sculling, zipper), race-specific = race skills (sighting, bilateral breathing). |
| **Advanced** | ≤100yd in hard sessions (threshold, race-spec, time trial); 100-200yd in technique-aerobic base sessions only | 1 drill (hard) / 2-3 drills (technique-aerobic base) | Race-specific drills dominate in race-spec and build phases; base allows technique reinforcement (singlearm for rotation, sighting for race carryover). Hard sessions minimize drill volume — main set IS the work. |

**Beginner stroke-phase pairing (per session type):**

| Session type | Phase-pairing rule for beginners |
|---|---|
| §5.1 Technique Aerobic | **2-3 distinct stroke phases** allowed (per §6.3 Path A pairing). The drill block is large enough to be the work; cross-phase pairing reinforces multiple cues. |
| §5.2 CSS Aerobic | **One stroke-phase focus** per session. Drill block smaller, main set IS the work. Don't pair a catch drill with a rotation drill — alternate phases ACROSS sessions, not within. |
| §5.5 Pull-Focused | **One stroke-phase focus** per session. Same rationale as §5.2. |
| §5.11 Recovery | **One drill focus** per session. Movement-quality session; single drill chosen from foundation set. |

**Stacking rules with the existing picker:**
- For session types in §10.2 allowed list (beginner-routable), the per-session drill volume is the MAX of: §5 per-type prescription AND §6.5 tier prescription. Beginner sessions get the larger of the two.
- The picker (`pickSwimDrillInset`) is the implementation point. D-020 Slice 3d already added fitness-tier biasing on drill SELECTION; §6.5 extends it to drill VOLUME (count + yardage).

**Rationale:**
- §2 ratio table prescribes 75% drill / 25% swim for Learning swimmers. The current §5 per-session structures cap drill volume at 4-7% of total yards (Q-016 documents this). §6.5 closes the gap for the beginner population — 10-15% per session is still well below §2's 75% intent but a meaningful improvement.
- Beginners learn movements by repetition. One drill focus per CSS Aerobic / Pull-Focused / Recovery session lets the learner grok the cue before adding the next phase the following session.
- Technique Aerobic is the exception because the drill block IS large (300-450yd) and IS the work — Path A pairing across 2-3 phases is appropriate at that volume.
- Advanced athletes who pile drills onto every session dilute the work — the protocol explicitly minimizes drill volume in hard sessions for the competitive tier.

### 6.6 Drill-level equipment recommendations (LOCKED 2026-05-22)

Soft-recommend layer ABOVE the §8.4 session-level equipment rules. When a drill is selected for the inset, the athlete's gear is checked; recommended gear surfaces in the session description's drill block copy and via a NEW `recommended:*` tag class (parallel to existing `optional:*` but with distinct semantics — "recommended" = "this helps, grab it"; "optional" = "fine either way").

| Drill | Recommended (when owned) | Optional (when owned) | Notes |
|---|---|---|---|
| Fingertip Drag | Fins | Snorkel | Fins keep hips up so the recovery focus isn't fighting drift. |
| Catch-Up | — | Fins, Snorkel | Body-position aid optional. |
| Single-Arm Freestyle | — | Fins | Body-position aid optional. |
| Sculling (front) | — | Pull buoy OR Fins (light support) | **Advanced drill — beginners hard-banned from inset per §6.1 tier gate. Surfacing applies to intermediate+ only.** |
| Fist Drill / Closed-Fist | Fins | — | Fins maintain swim speed while the catch is compromised. **NO paddles** (defeats purpose). |
| 6-3-6 / Kick-Switch | Fins (beginner tier only) | Snorkel | Body-position aid critical for learners; intermediate+ may not need fins. |
| Zipper Drill | — | — | No equipment. |
| Sighting Drill | — | — | Race-specific; no equipment. |
| Kick on Side | — | Fins | Kick-led; fins help if struggling. |
| Pull with Buoy | (Pull buoy required per §6.1) | — | Per §8.2 substitution if no buoy. |

**Surfacing rule:** when a drill in the inset has a recommended gear that the athlete owns, append the drill copy: *"…(use fins if you have them)."* When the athlete does NOT own the recommended gear, the recommendation is silent (no nag).

**Stacking with §8.4:** session-level optionals from §8.4 are emitted independently. The drill-level recommendation is additive and must dedupe against session-level optionals — same gear listed twice would be ugly.

**Tag class semantics:**
- `req:<gear>` — required (current behavior; e.g. `req:buoy` for pull-focused).
- `recommended:<gear>` — NEW. Body-position or technique aid the spec actively encourages when owned. Renders distinctly from optional (e.g. "Recommended: Fins" vs "Optional: Snorkel").
- `optional:<gear>` — current behavior; gear is "fine either way" given the athlete's tier and session type.

**Implementation note:** `recommended:*` is a new tag class. The chip-renderer (`materialize-plan: inferSwimEquipmentPack`) and the description-text path (`session-factory: appendPoolGearLine` → `buildSwimGearLine`) both need to handle it. Same shape as `optional:*` — a separate slice will wire it.

**Sources:** Swim Smooth (fins for body-position drills), Tri Training Harder (fin/paddle split for beginners), Better Triathlete (closed-fist + fins), Organic Coaching (drill equipment guidance), MyMottiv (beginner-fins consensus).

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

### 7.5 CSS calibration for learning swimmers (no test data)

§7.4 covers the conservative-defaults fallback. §7.5 adds an **active-calibration** path for learning swimmers who don't yet have a CSS test on file. The §5.8 Time Trial (400yd + 200yd protocol) is banned for beginners per §10.2 — they need a simpler entry point.

**Simple 200yd time trial protocol (beginner-friendly):**

1. **Athlete swims 200yd at sustainable hard effort** in a pool, alone or with a Masters coach. Record the time.
2. **Initial CSS estimate** = `(200yd time ÷ 2) + 5 seconds`. The +5s buffer keeps the early-plan CSS conservative — better to under-prescribe and progress than over-prescribe and break form under fatigue.
3. **Update athlete baseline** via `baselines.swim_threshold_pace_100` once the time trial is logged. The engine recalibrates pace prescriptions on the next plan regenerate.

**Wizard / arc trigger:**

Athletes who declare `swim_experience='learning'` are flagged to complete this 200yd protocol **before Week 3** of the plan. The wizard surfaces an inline note on the swim-baseline step:

> *"No CSS test? Swim a 200yd time trial at sustainable hard effort in your first week or two, divide the time by 2, add 5 seconds. That's your starting CSS pace. Update your profile once you've got the number — your plan will recalibrate."*

For `swim_fitness='beginner'` athletes the full §5.8 Time Trial protocol is **not auto-prescribed** (banned for beginners per §10.2); the informal 200yd trial above is the substitute. Intermediate / advanced athletes continue to receive the standard §5.8 Time Trial on the spec's 6-8-week cadence.

**Session-copy fallback (engine-side):**

For CSS Aerobic, Race-Specific Aerobic, and any other CSS-anchored session when the athlete has NO CSS pace on file, the session description includes a **fallback cue** in place of the numeric pace target:

> *"If you don't have a CSS pace yet, swim at a pace where you can hold a short conversation but feel like you're working. Aim for the same effort on every repeat — pace consistency is more important than hitting a specific number."*

This replaces the typical `"5×100 at CSS pace (1:40/100yd), 15s rest"` line. Once the athlete supplies a `swim_threshold_pace_100`, the numeric line returns automatically on the next plan regenerate.

**Trade-off message at plan generation:**

> *"No swim pace data — your CSS pace targets are conservative defaults. Complete a 200yd time trial in Week 1-2 and update your profile to recalibrate."*

---

## 8. Equipment tiers

### 8.1 Pool gear inventory

Wizard collects athlete's swim equipment:
- Pull buoy
- Paddles
- Snorkel
- Kickboard
- Fins

**Candidate enum addition: ankle band.** Coaching research (§6.4) identifies pull buoy + ankle band as a meaningful beginner body-position drill that the current enum cannot surface. Adding `ankle_band` would require: (a) wizard chip + label, (b) `equipment.swimming` normalization, (c) drill-token equipment map entry, (d) `inferSwimEquipmentPack` recognition for chip surfacing. **Filed as Q-020 — decision deferred to a separate slice (wizard scope decision first).** Until added, the buoy+band drill is referenced in §6.4 coaching prose but not engine-surfaced.

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

### 8.4 Equipment surfacing in session copy (per-equipment rules)

§8.2 covers session-type substitution when required equipment is missing. §8.4 covers **which equipment appears as athlete-facing copy** (Pool gear line in the description AND chip-style surfaces on the calendar / drawer). The rules below extend the existing implementation (`session-factory.ts: appendPoolGearLine` → `src/lib/plan-tokens/swim-drill-tokens.ts: buildSwimGearLine` for the description path; `materialize-plan/index.ts: inferSwimEquipmentPack` for the chip-surface path via `req:*` / `optional:*` tags).

**Per-equipment surfacing rules:**

| Equipment | Surface on | Required vs Optional | Implementation status |
|---|---|---|---|
| **Pull buoy** | Pull-Focused (any tier); any session containing a pull-buoy-required drill (sculling, scullfront) | Required when used by the session | Already shipped — pull-focused tags `req:buoy`; drill tokens map via `DRILL_EQUIPMENT_MAP`. |
| **Pull buoy** | CSS Aerobic / Technique Aerobic when athlete owns it AND `swim_fitness !== 'beginner'` | Optional | NEW — session-factory adds `optional:buoy` tag for intermediate / advanced when athlete owns buoy. **Beginner sessions explicitly OMIT this hint** (§5.5 rationale — paddles / buoy bypass beginner catch feedback). |
| **Paddles** | CSS Aerobic, Threshold, Mixed/Fartlek, Pull-Focused — `swim_fitness !== 'beginner'` AND athlete owns | Optional | NEW — session-factory adds `optional:paddles` tag for these session types. Beginner sessions OMIT (per §5.5 rationale — finger-tip sensitivity needed for catch development). |
| **Snorkel** | Technique Aerobic, CSS Aerobic, Pull-Focused — all tiers, when athlete owns | Optional | NEW — session-factory adds `optional:snorkel` tag for these session types. Currently surfaces only when a snorkel-using drill is in the inset (e.g., `snorkel_freeswim`); the new rule surfaces it across all listed types regardless of drill content. |
| **Kickboard** | Kick-Focused only | Required (or `fins` substitute per §8.2 sprint/oly rule) | Already shipped — kick-focused tags `req:kickboard` or `req:fins`. |
| **Fins** (revised 2026-05-22) | Kick-Focused (required for 70.3/full per §8.2). **Beginner Technique Aerobic + Beginner CSS Aerobic — surfaced as RECOMMENDED when owned.** Drill-implied via §6.6 (catchup, fingertipdrag, fist, 616 beginner) — surfaced as `recommended:fins` across all tiers when the drill is in the inset and athlete owns fins. | Required (kick-focused) / **Recommended** (beginner technique work) / Optional elsewhere | Already shipped: kick-focused tags + drill-token map (REQUIRED path). NEW: `recommended:fins` tag class for beginner technique and §6.6 drill-implied surfacing. **Fins are encouraged for beginners — opposite the paddles rule. Sources: Better Triathlete, Organic Coaching, MyMottiv, Swim Smooth.** |

**Display semantics:**

- "Pool gear — Required: <list>. Optional: <list>." in the session description text.
- Chip surfaces (calendar / drawer) read the structured `computed.swim_equipment_suggested` field — driven by `req:*` / `optional:*` tags. Both surfaces must align: the description text and the chip must never disagree.
- When the athlete owns NO listed equipment AND no session-required gear → omit the "Pool gear" line entirely (current behavior, unchanged).

**Beginner-specific carve-outs (per §10 fitness-tier rules — revised 2026-05-22 for fins/paddles split):**

The core rule for beginners is **fins/paddles are NOT equivalent**: fins AID stroke acquisition by holding the swimmer horizontal so they can focus on arm mechanics (catch, recovery, rotation) without fighting to stay afloat; paddles AMPLIFY catch error and shoulder load on an undeveloped stroke. For beginners, fins are encouraged on technique work and paddles suppressed.

- §5.5 Pull-Focused for beginners: surfaces "Required: Pull buoy" only. **NO paddles hint** — catch-feel bypass (per §5.5 coaching rationale). **NO fins hint** — pull-focused work is leg-isolated by design; fins would defeat the purpose.
- §5.2 CSS Aerobic for beginners: surfaces "Optional: Snorkel" + **"Recommended: Fins"** (when owned). NO buoy / paddles hints. Fins maintain body position so the learner can hold form across the 100yd repeats; paddles bypass catch development.
- §5.1 Technique Aerobic for beginners: surfaces "Optional: Snorkel" + **"Recommended: Fins"** (when owned). Fins are a near-essential body-position aid for beginner drill work. Drill-implied gear from §6.6 still passes through (e.g., fingertipdrag, fist → `recommended:fins`) if the drill block contains that drill — dedupe against the session-level recommendation.
- §5.11 Recovery: **no equipment hint regardless of inventory** — the session is movement-quality-focused; gear bypasses that intent. Beginners receive the same gear-free treatment here per the existing coaching rule.

**Anti-regression:** the description-text Pool gear line for pull-focused / kick-focused sessions is **unchanged**. Optional surfacing for CSS Aerobic / Technique Aerobic / Pull-Focused (intermediate+) added by the original §8.4 (Slice 2, 2026-05-21) is **unchanged**. NEW in 2026-05-22:
- `recommended:fins` tag class on beginner Technique Aerobic + beginner CSS Aerobic.
- §6.6 drill-level `recommended:*` surfacing (parallel to existing `optional:*`).

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

### 11.1 Files that need to read this spec

- `supabase/functions/_shared/swim-protocol.ts` (new) — protocol selection logic
- `generate-combined-plan/session-factory.ts` — swim session generation
- `generate-combined-plan/swim-protocol-volumes.ts` — volume bands per phase
- `_shared/swim-drill-tokens.ts` — drill library + rendering
- `ArcSetupWizard.tsx` — Masters swim recommendation for Learning-level

### 11.2 What changes from current behavior

- **Race-Specific Aerobic** sessions currently 1000yd, should scale 1500-2500yd by phase (§5.4)
- **Drill rotation** currently per-session-type hard-coded; should rotate from phase pool (§6.3)
- **Week 7 build week** showing 1750yd recovery-level volume — investigate misclassification
- **Equipment line duplication** on some sessions — deduplicate
- **Drill tokens** (Single-Arm, 6-3-6, Zipper, Sculling) exist but never selected by generators — wire in
- **Missing session types** (Time Trial, Open Water Skills, Mixed/Fartlek, Race-Pace Sustained) — implement
- **CSS terminology** inconsistent across sessions — standardize to "CSS" + pace target
- **Masters recommendation** for Learning-level — surface in wizard

### 11.3 Same pattern as strength

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
