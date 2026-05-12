# Triathlon Strength Protocol — Prescriptive

How the plan engine generates strength sessions for triathlon athletes. Companion to `docs/SCHEDULING-RULES.md` (placement), `docs/SESSION-FREQUENCY-DEFAULTS.md` (session counts), and the Arc wizard (athlete input).

---

## 0. Core principle

**Athlete intent determines methodology. Equipment determines execution. Volume and distance determine dose. 1RM determines load.**

Strength training for triathletes is not one program with intensity dials. It's two distinct philosophies, scaled by total endurance volume and race distance:

1. **Durability** — strength supports endurance. Injury prevention, tissue tolerance, posture. Joe Friel AA-MS-SM model.
2. **Performance** — strength is co-equal with endurance. Real loads, real periodization, athlete maintains or builds strength alongside race fitness. Crawley / Viada / hybrid athletics approach.

The wizard captures intent and goals; the engine selects the protocol, then scales it to the athlete's weekly volume, race distance, and plan length. The protocol drives everything downstream.

---

## 0.1 Audience and conformance

This document is the single source of truth for strength session generation. The runtime conformance validator (see §3.8) asserts every generated strength session against the rules in §3.3, §3.4, §3.6, and §3.7. Code that contradicts this document is a bug.

This document does **not** specify:
- Scheduling and placement (see `SCHEDULING-RULES.md`)
- Session counts per week (see `SESSION-FREQUENCY-DEFAULTS.md`)
- Endurance session structure or pacing

---

## 1. Inputs

| Input | Source | Already exists |
|---|---|---|
| Strength intent | Arc wizard (`strength_intent`: co-equal / support / none) | Yes |
| Weekly hours available | Arc wizard (`weekly_hours_available`) | Yes |
| Race distance | Arc wizard goal (`race_distance`: sprint / olympic / 70.3 / full) | Yes |
| Plan length | Derived from race date and start date (weeks) | Yes |
| 1RM data | Arc wizard (`baselines.performance_numbers.squat_1rm`, etc.) | Yes |
| Equipment access | Arc wizard (`baselines.equipment.strength`) | Yes |
| Phase | Plan engine (base / build / race_specific / taper) | Yes |
| Weeks to race | Plan engine | Yes |

No new wizard questions required.

---

## 2. Protocol selection

Protocol selection runs in three gates, in order. First gate that triggers a substitution wins; the athlete sees at most one trade-off message.

### 2.1 Intent gate

| Strength intent | Default protocol |
|---|---|
| `co-equal` | `performance` |
| `support` | `durability` |
| `none` | `none` |

### 2.2 Equipment gate

| Equipment tier | Performance available? | Durability available? |
|---|---|---|
| Full barbell (rack + barbell + plates + bench) | Yes | Yes |
| Dumbbell-based (DBs + bench, no barbell) | Yes, with substitutions | Yes, with substitutions |
| Bodyweight + bands (no DBs, no barbell) | No — force durability | Yes |

**Trade-off when performance requested without barbell or dumbbells:** "Performance strength requires barbell or dumbbell access for progressive loading. With your current equipment we'll deliver durability protocol instead. Add dumbbells or barbell access to unlock performance protocol."

### 2.3 Volume gate

Performance protocol carries real concurrent-training interference cost. Above a volume threshold, the interference outweighs the benefit, and durability is the right choice regardless of athlete intent.

| Total weekly endurance hours | Action |
|---|---|
| < 18 hrs | Honor intent |
| 18–22 hrs | Honor intent, surface advisory: "At your volume, consider 1 strength session/week or switch to durability — full performance protocol may compromise endurance recovery." Default to 1x/week performance if athlete keeps intent. |
| > 22 hrs | Force durability protocol with notification: "At sustained 22+ hours of weekly endurance, performance strength interferes with recovery. We're delivering durability protocol — 1 session per week, high-rep, light load — through race-specific phase." |

Volume is computed as `weekly_hours_available` plus any explicit overrides, evaluated at the start of each phase. A late-build athlete who ramps from 14 → 20 hrs/week crosses the gate during build and gets the advisory then, not at plan start.

---

## 3. Performance protocol (co-equal intent)

Modern hybrid methodology. Strength is a primary pursuit alongside endurance, scaled by race distance and plan length.

### 3.1 Phase definitions

| Phase | Duration | Reps | %1RM | RIR | Sets/lift | Sessions/week |
|---|---|---|---|---|---|---|
| Hypertrophy | 4 weeks | 8-10 | 65-72% | 3 | 3-4 | 2 |
| Strength Build | 4 weeks | 4-6 | 78-85% | 2 | 3-4 | 2 |
| Maintenance + Power | 4-6 weeks | 3-5 (lift) + plyo | 70-75% | 2 | 2-3 | 2 |
| Taper Priming | Race week | 3-4 (fast bar speed) | 50-60% | 3+ | 2 | 1 (skip optional) |

**Index semantics:** Within each phase, weeks progress linearly through the rep × %1RM range, ending at the high end of %1RM and low end of reps in the final week. A 4-week Hypertrophy phase progresses 65% → 67% → 70% → 72% across weeks 1–4. If the engine extends a phase (longer plan length, see §9), W5+ clamps to the phase's high %1RM, does not reset to the low end (this is a current bug — see §3.8 P-002).

### 3.2 Phase-to-mesocycle mapping (standard 16-week 70.3 build)

| Endurance phase | Strength phase |
|---|---|
| Base (weeks 1–8) | Hypertrophy weeks 1–4, Strength Build weeks 5–8 |
| Build (weeks 9–12) | Strength Build continued |
| Race-specific (weeks 13–16) | Maintenance + Power |
| Taper (race week) | Taper Priming |

For non-standard plan lengths, see §9.

Deload week (every 4th week): same exercises at 80% load, 2 sets only, RIR 4+. No phase progression during deload.

### 3.3 Exercise hierarchy

**Pattern coverage rule:** every upper-body session must touch all four upper patterns across the week (horizontal push, horizontal pull, vertical push, vertical pull). The two weekly upper sessions split the patterns; no single session needs all four. Every lower-body session must touch squat and hinge patterns.

| Day | Movement pattern | Primary | Secondary |
|---|---|---|---|
| Lower | Squat | Barbell Back Squat | Goblet Squat (DB substitute) |
| Lower | Hinge | Conventional Deadlift | DB Romanian Deadlift |
| Upper | Horizontal push | Bench Press | DB Bench Press |
| Upper | Horizontal pull | Barbell Row | DB Row (chest-supported) |
| Upper | Vertical push | Standing OHP | DB Shoulder Press |
| Upper | Vertical pull | Pull-ups | Lat Pulldown / Band Pull-Down |

**Equipment substitutions:**
- No barbell → DB version of same movement
- No DBs and no barbell → durability protocol (per §2.2)

### 3.4 Sport-specific accessory rotation

**Required upper-day accessories (every upper session, all phases except taper):**
- Band Face Pulls (rotator cuff health for high catch position) — 3×15 light/medium
- Band Pull-Aparts (scapular stability) — 3×20 medium
- Pallof Press (anti-rotation core for stroke balance) — 3×10/side

**Required lower-day accessories (per phase):**

| Phase | Hip Thrusts | Single-Leg RDL | Step-ups | Calf Raises |
|---|---|---|---|---|
| Hypertrophy | 3×8-10 | 2×8/leg | — | 2×12-15 |
| Strength Build | 3×8 | — (volume cap) | 2×8/leg | 2×12 |
| Maintenance + Power | 2×6-8 | — | 2×6/leg | 2×10-12 |
| Taper Priming | — | — | — | — |

Hip Thrusts are required in every lower session in base and build phases — they're the primary glute-dominant accessory for run drive and bike power, and absence is a conformance violation (S-005).

Accessories are sub-maximal load, RIR 3+. They support compound recovery, not replace it.

Evidence base: glute and posterior chain dominance for run/bike power has a real peer-reviewed base (Contreras, Distefano). Scapular and rotator cuff work for swim catch position is clinical / coaching consensus, lighter peer-reviewed evidence — included as low-cost prevention, not as a primary performance driver.

### 3.5 Power phase content (Maintenance + Power phase only — see §3.7 for distance modifiers)

Inserted before main lifts in race-specific phase, replaces some accessory volume.

| Equipment | Power exercise | Sets × Reps |
|---|---|---|
| Barbell + rack | Push Press | 3 × 3-5 |
| Kettlebell | KB Swings (Russian) | 3 × 8-12 |
| Box or step | Box Jumps | 3 × 3-5 |
| Open space | Broad Jumps | 3 × 3-5 |
| Box (advanced only) | Depth Jumps | 3 × 3-5 |

Rules:
- Always paired with main compounds, never alone
- Always done first in session when fresh
- Skipped if athlete reports run/ride fatigue or injury history flag
- Olympic lifts (clean & jerk, snatch) deferred — separate decision

### 3.6 Canonical session shape

**Performance Lower (50 min):**
1. Power exercise (per §3.7 race-distance rules, 5 min)
2. Primary compound — Squat or Deadlift, alternates per session (15 min, 3-4 sets)
3. Secondary compound — the other of Squat/Deadlift (10 min, 3 sets)
4. Required accessory — Hip Thrusts (5 min) — base + build phases
5. Phase accessory — Single-Leg RDL OR Step-ups per §3.4 (5 min)
6. Core finisher — Pallof Press or Dead Bug (5 min)

**Performance Upper (45 min):**
1. Power exercise (per §3.7 rules, 5 min)
2. Primary compound — pattern A (horizontal push or vertical push) (15 min, 3-4 sets)
3. Secondary compound — pattern B (corresponding pull) (10 min, 3 sets)
4. Required accessory — Band Face Pulls (5 min)
5. Required accessory — Band Pull-Aparts (5 min)
6. Core finisher — Pallof Press (5 min)

Upper sessions alternate weekly: session 1 covers horizontal push + horizontal pull; session 2 covers vertical push + vertical pull. The rotation ensures all four patterns appear across the week (per §3.3 pattern coverage rule and §3.8 W-001).

### 3.7 Distance and volume sensitivity

Performance protocol scales by race distance. Sprint and Olympic athletes have more recovery headroom and benefit from earlier and heavier power emphasis. Full Ironman athletes need reduced strength dose to protect endurance recovery.

**Race-distance dose modifiers:**

| Distance | Sessions/wk (base) | Sessions/wk (build) | Sessions/wk (race-spec) | Power phase starts |
|---|---|---|---|---|
| Sprint | 2 | 2 | 2 | Build phase |
| Olympic | 2 | 2 | 2 | Build phase |
| 70.3 | 2 | 2 | 2 | Race-specific phase |
| Full IM | 2 | 1–2 | 1 | Reduced — see below |

**Full Ironman race-specific phase:** Power volume is halved (1-2 sets instead of 3, no depth jumps), and the second weekly session drops to upper-only at maintenance load. Full IM athletes ramping above 18 hrs trigger the §2.3 volume advisory; above 22 hrs they're forced to durability regardless of intent.

**Sprint/Olympic earlier power emphasis:** Box Jumps or KB Swings appear in the build phase Lower sessions (1 power exercise, 3×3-5), not just race-specific. The shorter race demands more neuromuscular fitness and recovers fast enough between sessions to support it.

### 3.8 Conformance contract

The runtime validator runs after `materialize-plan` and asserts every generated strength session against these invariants. Each is a hard fail with a specific error code.

**Per-session invariants:**

| ID | Rule |
|---|---|
| S-001 | Every Lower session must include Squat OR Deadlift as primary compound |
| S-002 | Every Lower session must include the other of Squat/Deadlift as secondary compound |
| S-003 | Every Upper session must include at least one push pattern and one pull pattern |
| S-004 | Every Upper session must include Band Face Pulls and Band Pull-Aparts as required accessories |
| S-005 | Every Lower session in base/build phases must include Hip Thrusts as required accessory |
| S-006 | Every session must include a core finisher (Pallof Press, Dead Bug, or equivalent) |

**Per-week invariants:**

| ID | Rule |
|---|---|
| W-001 | Two upper sessions per week must cover all four upper patterns (horizontal push, horizontal pull, vertical push, vertical pull) |
| W-002 | Deload week (every 4th week) loads must be 80% of phase target, 2 sets, RIR 4+ |
| W-003 | Sessions/week must match §3.7 race-distance modifier for the current phase |

**Per-phase invariants:**

| ID | Rule |
|---|---|
| P-001 | Hypertrophy phase is a single contiguous block of 4 weeks (or extended per §9), not split into two sub-blocks |
| P-002 | If Hypertrophy extends beyond 4 weeks, W5+ clamps to 72% (high end of phase range), does not reset to 65% |
| P-003 | Each phase's reps × %1RM progression is monotonic — no regression within a phase except deload weeks |
| P-004 | Power phase content (§3.5) starts at the correct week per §3.7 race-distance rules |

**Description ↔ delivered contract:**

| ID | Rule |
|---|---|
| D-001 | Session description's %1RM strings must match delivered absolute lb values within ±2.5 lb rounding |
| D-002 | Session title's phase name must match the phase assigned by the engine (e.g., "Build Upper" ≠ Hypertrophy week emission) |
| D-003 | Equipment line must list only equipment present in athlete's `baselines.equipment.strength` |

**Equipment substitution contract:**

| ID | Rule |
|---|---|
| E-001 | If athlete has no barbell, primary compounds must use DB variants |
| E-002 | If athlete has no DBs and no barbell, athlete must be on durability protocol (§2.2) |
| E-003 | Power exercises must select an equipment-available variant from §3.5 table |

Validator output is a per-week pass/fail report keyed to plan_id, week_index, and rule ID. Failures block plan finalization; warnings (e.g., advisory volume-gate cases) surface to the athlete but don't block.

---

## 4. Durability protocol (support intent)

Joe Friel's AA-MS-SM methodology. Strength supports endurance; primary goal is injury prevention and tissue tolerance.

Note on naming: this protocol is sometimes called "Norwegian-style" in coaching circles, but that conflates two distinct things. Olav Aleksander Bu's Norwegian methodology for elite triathlon involves very specific lactate-clamped zone 2 and double-threshold sessions with minimal strength (often 1x/week at maintenance loads, and primarily for injury prevention rather than power). Friel's AA-MS-SM model is a complete prescriptive strength program with three distinct phases. This document implements the Friel model, with Norwegian as background context only.

### 4.1 Phase definitions

| Phase | Duration | Reps | Load | Sets | Sessions/week |
|---|---|---|---|---|---|
| Anatomical Adaptation (AA) | 6 weeks | 20-30 | 40-60% 1RM or bodyweight | 2-3 | 2-3 |
| Maximum Strength (MS) | 4 weeks | 6-10 | 75-85% 1RM | 2-3 | 1-2 |
| Strength Maintenance (SM) | In-season | 8-12 | 65-75% 1RM | 2 | 1 |

### 4.2 Phase-to-mesocycle mapping

| Endurance phase | Strength phase |
|---|---|
| Off-season / pre-base | Anatomical Adaptation |
| Early base | AA continues |
| Late base | Maximum Strength |
| Build | Strength Maintenance |
| Race-specific | Strength Maintenance (volume reduced) |
| Taper | 1 light session early week, then skip |

### 4.3 Exercise hierarchy

Same compound movements as performance protocol, but executed at lighter loads with higher reps. The emphasis is on movement quality, full range of motion, and tissue adaptation — not maximal load.

**Bodyweight + bands tier (no DBs/barbell):**
- Goblet squat → Bodyweight squat with 3-second descent
- Deadlift → Single-leg RDL (bodyweight, controlled tempo)
- Bench → Push-ups (incline if needed)
- Row → Inverted ring row or band row
- OHP → Band overhead press
- Pull-up → Band-assisted pull-up or band pull-down

### 4.4 Accessory work

Higher emphasis on stability and mobility than performance protocol:

- Plank holds (core endurance)
- Side plank (lateral chain)
- Bird dog (anti-extension core)
- Glute bridges (glute activation)
- Band lateral walks (hip stability)
- Calf raises (run durability)

All accessories: 2-3 sets, 12-20 reps, focus on form.

### 4.5 Power work

Durability protocol does not include power phase. Athletes wanting power development should select co-equal intent and performance protocol. Durability is for injury prevention and aerobic-priority training.

### 4.6 Session structure (45 min)

1. Mobility warm-up (5 min)
2. Compound 1 — Squat pattern (10 min, 2-3 sets)
3. Compound 2 — Hinge or Push pattern (10 min, 2-3 sets)
4. Compound 3 — Pull pattern (10 min, 2-3 sets)
5. Accessory circuit — 3 exercises (8 min)
6. Core/mobility cool-down (2 min)

Sessions are full-body. No upper/lower split because frequency is too low to justify the split.

### 4.7 Volume-forced cases

Athletes routed to durability via §2.3 volume gate (intent was co-equal, but volume exceeds 22 hrs/week) run durability at the reduced cadence shown in their phase mapping above, with one substitution: drop the SM phase to 1x/week minimum even if 2x is theoretically available, and skip strength entirely in the final 3 weeks before race day.

---

## 5. 1RM derivation

When the athlete has provided 1RM data via wizard or baseline test:

```
working_weight = 1RM × phase_percentage
```

When no 1RM data exists:

**Performance protocol:** Surface trade-off message: "Loads will be conservative until you complete a baseline test or enter your 1RM. Tap [Baseline Test: Lower Body] in the wizard or log a 1RM in your profile."

Use conservative defaults until 1RM provided:

| Lift | Conservative default 1RM (estimate as % bodyweight) |
|---|---|
| Squat | 1.0× bodyweight |
| Deadlift | 1.25× bodyweight |
| Bench | 0.75× bodyweight |
| OHP | 0.5× bodyweight |

These are approximate "untrained adult" benchmarks. Once athlete completes baseline test, system uses actual 1RM.

**Durability protocol:** Use bodyweight progressions or 40-60% of conservative default. Loads matter less here because the prescription is high-rep tissue work.

---

## 6. Same-day pairing rules

(Authoritative in `SCHEDULING-RULES.md` §3.5 and §4. Repeated here for completeness; if these conflict, scheduling rules win.)

| Strength session | Same-day endurance session | Allowed? |
|---|---|---|
| Lower | Long run (same day) | No — 24h gap minimum |
| Lower | Quality run | No — 24h gap minimum |
| Lower | Long ride | No — 24h gap minimum |
| Lower | Quality bike | No — 24h gap minimum |
| Lower | Easy bike | Yes — strength first, leave 6h |
| Lower | Easy run | Yes — strength first, leave 6h |
| Lower | Swim | Yes — strength after swim |
| Upper | Any run | Yes — leave 4h |
| Upper | Any bike | Yes — leave 4h |
| Upper | Swim | Yes — strength after swim ideally |

Athlete-facing coaching cue (performance protocol only):
> "Leave 6+ hours between heavy strength and hard endurance. Prefer strength morning, endurance evening, or vice versa. Research shows shorter gaps reduce both adaptations."

Durability protocol skips this cue (loads are light enough that interference is negligible).

---

## 7. Race week protocol

### 7.1 Performance protocol race week

**Taper Priming session — Wednesday only, 25 min, optional skip:**
- 1 lower compound: 2 × 4 reps @ 50-60% 1RM, fast bar speed
- 1 upper compound: 2 × 4 reps @ 50-60% 1RM, fast bar speed
- 2 accessories: light bands, activation only
- No plyometrics in race week

Purpose: maintain neural drive without accumulating fatigue. Skip-optional explicit in description.

### 7.2 Durability protocol race week

**1 light session early week (Monday or Tuesday), 30 min, skip-optional:**
- Bodyweight or 40% 1RM compounds
- 2 sets × 8-10 reps
- Mobility focus

After this session, no strength until post-race recovery week.

### 7.3 Post-race recovery week

Both protocols: skip strength entirely for 7 days post-race. Resume with deload-equivalent loads in week 2 post-race.

---

## 8. Equipment tiers — full specification

### 8.1 Full barbell tier
**Required:** Barbell + plates, squat rack OR power cage, bench (flat or adjustable)
**Optional:** Pull-up bar, kettlebells, dumbbells, resistance bands, cable machine

All performance and durability prescriptions available.

### 8.2 Dumbbell-based tier
**Required:** Dumbbells (adjustable or 2-3 pairs), bench
**Optional:** Pull-up bar, resistance bands, kettlebells

**Performance protocol substitutions:**
- Barbell Back Squat → Goblet Squat or DB Front Squat
- Conventional Deadlift → DB Romanian Deadlift
- Bench Press → DB Bench Press
- Standing OHP → DB Shoulder Press
- Barbell Row → DB Row (chest-supported)
- Pull-ups → Lat Pulldown or band-assisted

Loads: DB max in pairs typically caps at ~70% of barbell loads. Adjust 1RM-based percentages accordingly (a 250lb barbell deadlift 1RM ≈ 80lb DB Romanian deadlift working weight at the same percentage).

### 8.3 Bodyweight + bands tier
**Required:** Resistance bands (light, medium, heavy)
**Optional:** Pull-up bar, suspension trainer

**Performance protocol:** Not available. Surface trade-off, route to durability.

**Durability protocol substitutions:**
- Squat → Bodyweight squat with 3-sec descent, single-leg variations
- Hinge → Single-leg RDL bodyweight, band good morning
- Push → Push-ups (incline → flat → decline progression), band overhead press
- Pull → Inverted ring row, band pull-down, band row
- Core → Plank, side plank, bird dog, dead bug

---

## 9. Plan length scaling

The phase durations in §3.1 and §4.1 assume a standard 16-week 70.3 build. Shorter and longer plans scale as follows.

### 9.1 Performance protocol scaling

| Plan length | Hypertrophy | Strength Build | Maint+Power | Taper |
|---|---|---|---|---|
| 8–10 weeks (sprint ramp) | 2 weeks | 2 weeks | 3–5 weeks | 1 week |
| 11–14 weeks (Oly / short 70.3) | 3 weeks | 3 weeks | 4–6 weeks | 1 week |
| 15–18 weeks (standard 70.3) | 4 weeks | 4 weeks | 4–6 weeks | 1 week |
| 19–24 weeks (long 70.3 / short IM) | 4–5 weeks | 4–5 weeks | 6–8 weeks | 1 week |
| 25+ weeks (full IM build) | 5–6 weeks | 5–6 weeks | 8–10 weeks | 1 week |

**Minimum performance protocol plan length is 8 weeks.** Plans shorter than 8 weeks route to a compressed durability variant: 2 weeks AA, 2 weeks MS, remainder SM, no power phase. There is not enough time to build hypertrophy and strength meaningfully on top of endurance load.

**Phase extension rule (P-002 in §3.8):** When a phase extends beyond its baseline duration (Hypertrophy stretched from 4 → 6 weeks, for example), the additional weeks clamp to the high end of the %1RM range with a small deload built in at week 4. They do not restart the progression at the low end.

### 9.2 Durability protocol scaling

| Plan length | AA | MS | SM |
|---|---|---|---|
| 8–12 weeks | 3 weeks | 3 weeks | remainder |
| 13–20 weeks | 4–6 weeks | 4 weeks | remainder |
| 21+ weeks | 6 weeks | 4 weeks | remainder |

Durability is more forgiving on length because SM extends indefinitely; no minimum plan length for durability.

---

## 10. Implementation pointers

### 10.1 Files that read this spec

- `supabase/functions/_shared/strength-protocol.ts` — protocol selection logic (intent + equipment + volume gates per §2)
- `supabase/functions/_shared/triathlon_performance.ts` — performance protocol session generation per phase
- `supabase/functions/_shared/triathlon_durability.ts` — durability protocol session generation per phase
- `generate-combined-plan/phase-structure.ts` — phase boundaries per §3.2 and §9
- `generate-combined-plan/session-factory.ts` — session assembly per §3.6
- `generate-combined-plan/types.ts` — `StrengthProtocol` type union
- `validate-strength-conformance.ts` (new) — implements §3.8 contract
- `ArcSetupWizard.tsx` — surfaces equipment trade-off (§2.2) and volume advisory (§2.3)

### 10.2 Known gaps to be closed by §3.8 conformance pass

- Hypertrophy W5 emits at 65% instead of clamping to 72% (P-002)
- `perfBaseUpper` missing OHP — vertical push gap (S-003 / W-001)
- `perfBuildUpper` missing Bench — horizontal push gap (S-003 / W-001)
- `perfBaseLower` and `perfBuildLower` missing Hip Thrusts (S-005)
- Some plan branches still emit durability sessions for `co-equal` intent (root cause: protocol selection bug, not session-factory)

### 10.3 Rendering — Pool gear pattern for strength

Same pattern as swim equipment lines:
> "Equipment — Required: Barbell, Rack, Bench. Optional: Kettlebell."
> "Equipment — Required: Dumbbells, Bench."
> "Equipment — Required: Bands."

Equipment line is generated from session needs ∩ athlete inventory.

---

## 11. Research references

**Modern hybrid methodology**
- Fergus Crawley (OMNIA Performance) — hybrid training framework
- Alex Viada, *The Hybrid Athlete*
- Hybrid Athletics general programming corpus

**Friel AA-MS-SM model**
- Joe Friel, *The Triathlete's Training Bible* (5th edition, 2016) — Chapter 13 on strength
- TrainingPeaks ATP Strength Phase Workouts

**Norwegian methodology (background context only, not implementation basis)**
- Olav Aleksander Bu — coach to Kristian Blummenfelt and Gustav Iden; published methodology emphasizes lactate-clamped zone 2 and double-threshold sessions
- Mark Allen analysis confirming "refined traditional principles" rather than novel strength model

**Concurrent training interference**
- Coffey & Hawley, *Concurrent exercise training: Do opposites distract?* (J Physiol, 2017)
- Wilson et al., *Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises* (J Strength Cond Res, 2012)
- 6-8 hour separation between heavy strength and hard endurance to minimize interference

**Plyometrics and running economy**
- Spurrs et al., *The effect of plyometric training on distance running performance* (Eur J Appl Physiol, 2003)
- Saunders et al., *Short-term plyometric training improves running economy in highly trained middle and long distance runners* (J Strength Cond Res, 2006)
- Paavolainen et al., *Explosive-strength training improves 5-km running time by improving running economy and muscle power* (J Appl Physiol, 1999)

**Glute and posterior chain for endurance**
- Contreras et al. — hip thrust biomechanics and EMG studies
- Single-leg work for hip stability — clinical PT consensus

**Sport-specific upper accessories**
- Rotator cuff and scapular work for swim catch position — primarily clinical and coaching consensus; lighter peer-reviewed evidence base than the run/bike accessories. Included as low-cost prevention.

**Volume thresholds for protocol switching**
- Coaching consensus across IM coaches (Hadfield, Bennett, Vance) that strength frequency drops to 1x/week at 18+ hrs/week endurance volume and approaches maintenance-only at 22+ hrs/week. Not a single citation but a defensible heuristic from practice.

---

End of document.
