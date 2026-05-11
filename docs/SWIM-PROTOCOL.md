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

### 4.2 Build phase (weeks 7-10)

**Focus:** Threshold development, sustained CSS work.

| Session type | Count/week | Distance | Intensity |
|---|---|---|---|
| Threshold | 1 | 2500-3500yd | Z3-Z4 (CSS to CSS - 2s) |
| Endurance / Race-Specific Aerobic | 1 | 2500-3500yd | Z2 (CSS + 8s) |
| Optional 3rd: Mixed/Fartlek | 0-1 | 2000-3000yd | mixed Z2-Z4 |

**Drill ratio:** Reduced. Drills now serve as warm-up patterning, not main sets.

### 4.3 Race-specific phase (weeks 11-14)

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

Each session rotates 2-3 drills from the phase-appropriate pool. Selection rules:

- Never repeat the same drill across consecutive sessions (variety)
- Pair drills that target different stroke phases (don't pair two catch drills)
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

## 10. Implementation pointers + research references

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

## 11. Research references

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
