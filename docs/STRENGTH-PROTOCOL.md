# Triathlon Strength Protocol — Prescriptive

How the plan engine generates strength sessions for triathlon athletes. Companion to `docs/SCHEDULING-RULES.md` (placement), `docs/SESSION-FREQUENCY-DEFAULTS.md` (session counts), and the Arc wizard (athlete input).

**Scope:** triathlon athletes only. Marathon-specific and hybrid race protocols (HYROX/Spartan/strength meets) will live in separate documents with their own phase models, accessory rotations, and selection logic. Do not extend this doc to those use cases.

---

## 0. Core principle

**Athlete identity determines methodology. Equipment determines execution. Volume and distance determine dose. 1RM determines load.**

Strength training for triathletes is not one program with intensity dials. It's two distinct programs serving two distinct athletes:

**The hybrid strength athlete** (intent: `co-equal`) treats strength as a goal alongside endurance. They came from strength or always did both. Their off-season may increase strength while reducing endurance. They measure success by race time **and** strength PRs **and** body composition. A 7-day skip of strength in a recovery week violates their contract with the program — they chose this protocol specifically because they don't want to lose their lifts. Acceptable race-day trade-offs exist if it means staying strong year-round.

**The durability-focused triathlete** (intent: `support`) treats strength as injury insurance for endurance. They came from endurance and added strength. Their off-season reduces strength to make room for base building. They measure success by race time alone. A recovery week is for total-load recovery — strength is the first thing to drop. Race-day performance is everything.

These are two different programs for two different athletes. The wizard captures identity (intent); the engine selects the protocol, then scales it to the athlete's weekly volume, race distance, and plan length. The protocol drives everything downstream.

---

## 0.1 Audience and conformance

This document is the single source of truth for strength session generation. The runtime conformance validator (see §3.8) asserts every generated strength session against the rules in §3.3, §3.4, §3.6, §3.7, and §7.4. Code that contradicts this document is a bug.

This document does **not** specify:
- Scheduling and placement (see `SCHEDULING-RULES.md`)
- Session counts per week (see `SESSION-FREQUENCY-DEFAULTS.md`)
- Endurance session structure or pacing

---

## 0.2 Wizard-facing labels

Internal `strength_intent` values are technical jargon. Athlete-facing labels in the Arc wizard:

| Internal value | Wizard label | One-line description |
|---|---|---|
| `co-equal` | **Hybrid Strength Athlete** | "Strength is a goal alongside endurance. Maintain or build your lifts through race training." |
| `support` | **Durability-Focused** | "Strength supports endurance. Injury prevention and tissue tolerance — race time is the only metric." |
| `none` | **Endurance Only** | "No strength sessions. Pure swim/bike/run." |

The wizard surfaces these labels with the descriptions; internal storage stays `co-equal` / `support` / `none` to preserve database compatibility.

---

## 0.3 Expected race-day trade-offs (athlete-facing honesty)

Athletes choosing the hybrid protocol deserve a straight answer about what they're trading.

On a flat, fast, cool-weather 70.3 or shorter race, a pure endurance triathlete at equivalent endurance volume will probably finish 1–3% faster than the same athlete on the hybrid protocol. That's a few minutes on a 5-hour race.

The trade-off shrinks or reverses under any of:
- **Hilly or technical courses** — power-to-weight and bike strength close or reverse the gap
- **Long course (full Ironman)** — durability matters more; late-race form breakdown is partly a strength deficit
- **Hot conditions** — better muscle mass tolerates thermal load
- **Masters athletes (35+)** — muscle preservation becomes a meaningful performance variable, not just a vanity metric

The hybrid athlete also gains injury durability, body composition maintenance, year-round strength PRs, and quality-of-life outside of triathlon — none of which are zero-cost trades for a pure endurance athlete who treats them as nice-to-haves.

This trade-off is surfaced to the athlete during wizard setup, not buried.

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
| `co-equal` | `performance` (hybrid) |
| `support` | `durability` |
| `none` | `none` |

### 2.2 Equipment gate

| Equipment tier | Performance available? | Durability available? |
|---|---|---|
| Full barbell (rack + barbell + plates + bench) | Yes | Yes |
| Dumbbell-based (DBs + bench, no barbell) | Yes, with substitutions | Yes, with substitutions |
| Bodyweight + bands (no DBs, no barbell) | No — force durability | Yes |

**Trade-off when performance requested without barbell or dumbbells:** "Hybrid strength training requires barbell or dumbbell access for progressive loading. With your current equipment we'll deliver the durability protocol instead. Add dumbbells or barbell access to unlock the hybrid protocol."

### 2.3 Volume gate

Hybrid protocol carries real concurrent-training interference cost. Above a volume threshold, the interference outweighs the benefit, and durability is the right choice regardless of athlete intent.

| Total weekly endurance hours | Action |
|---|---|
| < 18 hrs | Honor intent |
| 18–22 hrs | Honor intent, surface advisory: "At your volume, consider 1 strength session/week or switch to durability — full hybrid protocol may compromise endurance recovery." Default to 1x/week hybrid if athlete keeps intent. |
| > 22 hrs | Force durability protocol with notification: "At sustained 22+ hours of weekly endurance, hybrid strength interferes with recovery. We're delivering durability protocol — 1 session per week, high-rep, light load — through race-specific phase." |

Volume is computed as `weekly_hours_available` plus any explicit overrides, evaluated at the start of each phase. A late-build athlete who ramps from 14 → 20 hrs/week crosses the gate during build and gets the advisory then, not at plan start.

---

## 3. Performance protocol (hybrid intent)

Modern hybrid methodology. Strength is a primary pursuit alongside endurance, scaled by race distance and plan length. The athlete maintains or builds their lifts through the season; race-day performance and strength PRs are co-equal success metrics.

### 3.1 Phase definitions

| Phase | Duration | Reps | %1RM | RIR | Sets/lift | Sessions/week |
|---|---|---|---|---|---|---|
| Hypertrophy | 4 weeks | 8-10 | 65-72% | 3 | 3-4 | 2 (1U + 1L) |
| Strength Build | 4 weeks | 4-6 | 78-85% | 2 | 3-4 | 2 (1U + 1L) |
| Maintenance + Power | 4-6 weeks | 3-5 (lift) + plyo | 70-75% | 2 | 2-3 | 2 (1U + 1L) |
| Taper Priming | Race week | 3-4 (fast bar speed) | 50-60% | 3+ | 2 | 1 (skip optional) |

**Index semantics:** Within each phase, weeks progress linearly through the rep × %1RM range, ending at the high end of %1RM and low end of reps in the final week. A 4-week Hypertrophy phase progresses 65% → 67% → 70% → 72% across weeks 1–4. If the engine extends a phase (longer plan length, see §9), W5+ clamps to the phase's high %1RM, does not reset to the low end (see §3.8 P-002).

### 3.2 Phase-to-mesocycle mapping (standard 16-week 70.3 build)

| Endurance phase | Strength phase |
|---|---|
| Base (weeks 1–8) | Hypertrophy weeks 1–4, Strength Build weeks 5–8 |
| Build (weeks 9–12) | Strength Build continued |
| Race-specific (weeks 13–16) | Maintenance + Power |
| Taper (race week) | Taper Priming |

For non-standard plan lengths, see §9.

**Deload weeks (every 4th week) — hybrid protocol:**

Deload is **REDUCE**, not skip. The hybrid athlete chose this protocol specifically to avoid losing strength stimulus; a 7-day skip puts them inside the detraining window for neural drive and cross-sectional area (10-14 days per Israetel's RP framework). Deload-week strength session:

- 1 upper session + 1 lower session (same frequency as loading weeks)
- 2 sets per main lift (vs 3-4 in loading weeks)
- 60-65% 1RM (well below phase target)
- RIR 4+
- Accessories cut entirely
- Power exercises skipped if in race-specific phase
- ~25-30 min total per session

This applies Minimum Effective Volume (MEV) — enough stimulus to prevent detraining at near-zero recovery cost.

### 3.3 Exercise hierarchy

**Pattern coverage rule (single-session model):** the triathlon hybrid protocol runs 1 upper session per week. That single session must touch all four upper patterns (horizontal push, horizontal pull, vertical push, vertical pull). Each weekly upper session includes a primary compound from one push/pull category and a secondary compound from the other. Every lower-body session must touch squat and hinge patterns.

| Day | Movement pattern | Primary | Secondary |
|---|---|---|---|
| Lower | Squat | Barbell Back Squat | Goblet Squat (DB substitute) |
| Lower | Hinge | Conventional Deadlift | DB Romanian Deadlift |
| Upper | Horizontal push | Bench Press | DB Bench Press |
| Upper | Horizontal pull | Barbell Row | DB Row (chest-supported) |
| Upper | Vertical push | Standing OHP | DB Shoulder Press |
| Upper | Vertical pull | Pull-ups | Lat Pulldown / Band Pull-Down |

**Single weekly upper composition:** Each upper session includes Row + Bench + OHP + Pull-ups (all four patterns). This is non-negotiable — pattern omission within a single session is a conformance violation (S-003) because there is no second weekly session to cover the missing pattern.

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

Hip Thrusts are required in every lower session in base and build phases (S-005). They're the primary glute-dominant accessory for run drive and bike power.

Accessories are sub-maximal load, RIR 3+. They support compound recovery, not replace it.

Evidence base: glute and posterior chain dominance for run/bike power has a real peer-reviewed base (Contreras hip thrust EMG work; Distefano single-leg studies). Scapular and rotator cuff work for swim catch is clinical / coaching consensus, lighter peer-reviewed evidence — included as low-cost prevention.

### 3.5 Power phase content (Maintenance + Power phase — see §3.7 for distance modifiers)

Inserted before main lifts, replaces some accessory volume.

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
2. Primary horizontal pattern — Bench OR Row (15 min, 3-4 sets)
3. Primary vertical pattern — OHP OR Pull-ups (10 min, 3 sets)
4. Secondary horizontal pattern — the other of Bench/Row (8 min, 3 sets)
5. Secondary vertical pattern — the other of OHP/Pull-ups (4 min, 2-3 sets)
6. Required accessories — Band Face Pulls + Band Pull-Aparts (3 min)

All four upper patterns appear in every single upper session. Volume distributes across primary (heavier, more sets) and secondary (lighter, fewer sets) treatments. Week-to-week, the primary/secondary designation rotates so each pattern gets a primary treatment roughly every other week.

### 3.7 Distance and volume sensitivity

Hybrid protocol scales by race distance. Sprint and Olympic athletes have more recovery headroom and benefit from earlier and heavier power emphasis. Full Ironman athletes need reduced strength dose to protect endurance recovery.

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
| S-003 | Every Upper session must include all four upper patterns (horizontal push, horizontal pull, vertical push, vertical pull) — single-session pattern coverage rule per §3.3 |
| S-004 | Every Upper session must include Band Face Pulls and Band Pull-Aparts as required accessories |
| S-005 | Every Lower session in base/build phases must include Hip Thrusts as required accessory |
| S-006 | Every session must include a core finisher (Pallof Press, Dead Bug, or equivalent) |

**Per-week invariants:**

| ID | Rule |
|---|---|
| W-001 | Hybrid protocol weeks include exactly 1 upper + 1 lower per §3.7 race-distance modifier |
| W-002 | Hybrid protocol deload weeks (every 4th week) emit reduced sessions — 2 sets, 60-65% 1RM, RIR 4+, no accessories. NOT skipped. |
| W-003 | Durability protocol deload weeks skip strength entirely (see §4.2) |
| W-004 | Lower strength must be ≥48h from Long Run on both sides. Same-day pairing of Lower with Long Run is forbidden (hard fail). |
| W-005 | Lower + Long Ride same-day is permitted only if strength session has explicit AM/PM ordering metadata showing strength placed AFTER ride with documented 6h+ gap. Missing ordering metadata on same-day pairing = hard fail. |
| W-006 | Lower + Quality Run OR Lower + Quality Bike same-day requires both sessions to carry AM/PM ordering metadata AND a documented 6h+ gap. Missing ordering metadata = hard fail. The pairing itself is not a violation. |
| W-007 | When Lower + Quality Run/Bike same-day, ordering metadata must match athlete's `strength_ordering_preference`. Wrong-direction ordering = warning surfaced to athlete (not hard fail). Missing ordering = hard fail (per W-006). |

**Per-phase invariants:**

| ID | Rule |
|---|---|
| P-001 | Hypertrophy phase is a single contiguous block of 4 weeks (or extended per §9), not split into two sub-blocks |
| P-002 | If Hypertrophy extends beyond 4 weeks, W5+ clamps to 72% (high end of phase range), does not reset to 65% |
| P-003 | Each phase's reps × %1RM progression is monotonic — no regression within a phase except deload weeks |
| P-004 | Power phase content (§3.5) starts at the correct week per §3.7 race-distance rules |
| P-005 | Inter-race rebuild emits 1 upper + 1 lower per week, progressive load (see §7.4) |

**Description ↔ delivered contract:**

| ID | Rule |
|---|---|
| D-001 | Session description's %1RM strings must match delivered absolute lb values within ±2.5 lb rounding |
| D-002 | Session title's phase name must match the phase assigned by the engine. Phase labels are: "Hypertrophy", "Strength Build", "Maintenance + Power", "Taper Priming", "Rebuild" (inter-race). "Race-prep" is not a valid emission. |
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

Joe Friel's AA-MS-SM methodology. Strength supports endurance; primary goal is injury prevention and tissue tolerance. The durability-focused triathlete measures success in race time and treats strength as expendable when recovery is the priority.

Note on naming: this protocol is sometimes called "Norwegian-style" in coaching circles, but that conflates two distinct things. Olav Aleksander Bu's Norwegian methodology for elite triathlon involves very specific lactate-clamped zone 2 and double-threshold sessions with minimal strength (often 1x/week at maintenance loads). Friel's AA-MS-SM model is a complete prescriptive strength program with three distinct phases. This document implements the Friel model, with Norwegian as background context.

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

**Deload weeks — durability protocol:** SKIP entirely. The durability athlete is using the recovery week for total-load recovery; strength is the first thing to drop and the easiest to add back. No detraining concern at the volumes/loads used in this protocol (a one-week gap from 75% 1RM × 8-10 reps × 2 sets doesn't measurably reduce neural drive or hypertrophy markers).

This is the philosophical fork from §3.2: hybrid REDUCES on deload, durability SKIPS. The split tracks athlete intent, not just program load.

### 4.3 Exercise hierarchy

Same compound movements as hybrid protocol, but executed at lighter loads with higher reps. The emphasis is on movement quality, full range of motion, and tissue adaptation — not maximal load.

**Bodyweight + bands tier (no DBs/barbell):**
- Goblet squat → Bodyweight squat with 3-second descent
- Deadlift → Single-leg RDL (bodyweight, controlled tempo)
- Bench → Push-ups (incline if needed)
- Row → Inverted ring row or band row
- OHP → Band overhead press
- Pull-up → Band-assisted pull-up or band pull-down

### 4.4 Accessory work

Higher emphasis on stability and mobility than hybrid protocol:

- Plank holds (core endurance)
- Side plank (lateral chain)
- Bird dog (anti-extension core)
- Glute bridges (glute activation)
- Band lateral walks (hip stability)
- Calf raises (run durability)

All accessories: 2-3 sets, 12-20 reps, focus on form.

### 4.5 Power work

Durability protocol does not include power phase. Athletes wanting power development should select the hybrid protocol. Durability is for injury prevention and aerobic-priority training.

### 4.6 Session structure (45 min)

1. Mobility warm-up (5 min)
2. Compound 1 — Squat pattern (10 min, 2-3 sets)
3. Compound 2 — Hinge or Push pattern (10 min, 2-3 sets)
4. Compound 3 — Pull pattern (10 min, 2-3 sets)
5. Accessory circuit — 3 exercises (8 min)
6. Core/mobility cool-down (2 min)

Sessions are full-body. No upper/lower split because frequency is too low to justify the split.

### 4.7 Volume-forced cases

Athletes routed to durability via §2.3 volume gate (intent was co-equal/hybrid but volume exceeds 22 hrs/week) run durability at the reduced cadence shown in their phase mapping above, with one substitution: drop the SM phase to 1x/week minimum even if 2x is theoretically available, and skip strength entirely in the final 3 weeks before race day.

---

## 5. 1RM derivation

When the athlete has provided 1RM data via wizard or baseline test:

```
working_weight = 1RM × phase_percentage
```

When no 1RM data exists:

**Hybrid protocol:** Surface trade-off message: "Loads will be conservative until you complete a baseline test or enter your 1RM. Tap [Baseline Test: Lower Body] in the wizard or log a 1RM in your profile."

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

The triathlete's weekly schedule has limited space — typically 4-5 hard endurance days plus 2 strength sessions in 7 days. Some same-day pairings are unavoidable. The protocol distinguishes pairings that are physiologically problematic from pairings that are merely sub-optimal but manageable with proper ordering.

### 6.1 Hard rules (never violate)

| Pairing | Constraint |
|---|---|
| Lower + Long Run | **48h gap minimum.** Both load the same eccentric musculature at high volume. Doubling concurrent eccentric load on the same legs inside 48h is where injury risk and recovery debt live. |
| Lower + Long Ride | Strongly prefer separate days. If same-day is unavoidable, strength placed AFTER ride with 6h+ gap. Never strength first. |

### 6.2 Same-day with ordering (acceptable)

| Pairing | Constraint |
|---|---|
| Lower + Quality Run | 6h+ gap, ordered. Default: Quality run AM, Lower PM. For hybrid athletes who prioritize strength PRs, Lower AM and Quality PM is acceptable. |
| Lower + Quality Bike | 6h+ gap, ordered. Same default ordering. |
| Lower + Easy Run | 6h+ gap, Lower first preferred (easy run as recovery flush). |
| Lower + Easy Bike | 6h+ gap, Lower first preferred. |
| Lower + Swim | Acceptable. 4h+ gap, swim first or after. |
| Upper + Any Run | 4h+ gap. No ordering preference. |
| Upper + Any Bike | 4h+ gap. No ordering preference. |
| Upper + Swim | 4h+ gap. Ideally swim first to avoid lat fatigue affecting the catch. |

### 6.3 Why Quality + Lower works same-day (and Long Run + Lower doesn't)

Long runs and Lower strength share the same mechanism — high-volume eccentric loading of quads, hamstrings, and glutes. Doubling that within 48h compounds tissue damage faster than the athlete recovers, with no benefit. Long Run = volume; Lower = volume + load. Both at once = injury vector.

Quality runs (intervals, tempo, threshold) are predominantly neural and energetic. They tax the cardiovascular system and develop lactate buffering, but eccentric mechanical load per mile is significantly lower than long-run pace. Stacking Quality Run with Lower strength on the same day, ordered properly with a 6h+ gap, is well-tolerated by trained athletes. Coaching evidence is consistent on this distinction across Friel, Crawley, Viada, and Daniels.

The takeaway: protect the legs from concurrent eccentric volume, not from concurrent training stimulus per se.

### 6.4 Scheduling implication

For a typical 70.3 athlete training 11 hrs/week with 4-5 hard endurance days plus 2 strength sessions, Lower strength will frequently land on the same day as a quality endurance session. This is correct behavior, not a bug. The engine's job is to:

1. Never place Lower within 48h of Long Run (hard rule)
2. Strongly prefer separating Lower from Long Ride; if same-day, enforce strength-after ordering
3. When Lower lands with Quality Run or Quality Bike, emit explicit AM/PM ordering metadata and a 6h+ gap indication

If athlete day-preference pins Lower to a day that already contains Quality Run, the engine honors both, adds ordering metadata, and surfaces a coaching cue. It does not move either session unless the conflict is with Long Run (hard rule).

Athlete-facing coaching cue (hybrid protocol only):
> "When strength shares a day with quality run or bike, leave 6+ hours between sessions. Prefer endurance morning, strength evening — or vice versa if you race strength PRs alongside endurance. Avoid back-to-back."

Durability protocol skips this cue (loads are light enough that interference is negligible).

### 6.5 Same-day ordering — strength-first vs endurance-first

When Lower strength shares a day with Quality Run or Quality Bike, the order between the two sessions measurably affects adaptations. The literature is consistent on the broad pattern, even if effect sizes are moderate.

**Strength-first protects strength adaptations.** Eddens et al.'s 2018 systematic review and meta-analysis in *Sports Medicine* found that resistance-then-endurance ordering produced superior gains in lower-body dynamic strength over prolonged (≥5 weeks) concurrent training programs. Mechanism: endurance training induces neuromuscular fatigue (reduced motor unit firing frequency, decreased force production) that, when performed first, blunts the strength stimulus that follows. AMPK signaling from the endurance bout also remains elevated for at least 3 hours, partially inhibiting mTOR pathway activation during the subsequent resistance session.

**Endurance-first protects endurance adaptations.** Doma & Deakin (2013) found long-distance runners had better performance and running-economy improvements when endurance preceded strength in same-day sessions, with a 6h gap between. Heavy strength training reduces force production and movement efficiency for hours afterward, degrading the quality of any subsequent high-intensity endurance work.

**Outcomes where order doesn't matter** (per Eddens et al. 2018 and follow-up meta-analyses):
- VO2max gains
- Muscle hypertrophy
- Lower-body static strength (isometric measures)
- Body composition

**Order matters most for:**
- Lower-body dynamic strength (squat 1RM, deadlift 1RM)
- Specific endurance performance and running economy

**The practical rule for triathletes:**

The athlete picks their default ordering based on what they're prioritizing this season:

- **Hybrid Strength Athlete prioritizing lifts → strength first.** They chose this protocol specifically to maintain or build strength. Strength-first ordering reinforces that adaptation.
- **Hybrid Strength Athlete prioritizing race performance → endurance first.** Even within hybrid intent, an athlete who values race time over strength PRs gets endurance-first ordering. Race-specific phase athletes often default here regardless of base-phase preference.
- **Durability-focused athlete → endurance first (always).** Durability protocol explicitly subordinates strength to race performance. Strength is never first for this athlete.

This is a defensible simplification. The actual interference effect is moderate (not large), varies with training status and volume, and individual response differs. But it's the simplest evidence-backed heuristic we can give athletes to make an informed choice.

---

## 7. Race week and inter-race protocol

### 7.1 Hybrid protocol race week

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

### 7.3 Post-race recovery week (single-race or final race in plan)

Both protocols: skip strength entirely for 7 days post-race. Resume with deload-equivalent loads in week 2 post-race.

### 7.4 Inter-race rebuild (multi-race plans)

When a plan contains two races, the inter-race period is structured as:

**Week 1 post-race A (rebuild W0):** Skip strength entirely. Total-load recovery.

**Weeks 2 to (race-B−2) — rebuild phase:** 1 upper + 1 lower per week, both protocols. Load progresses from 70% × 1RM toward race-week levels.

- **Hybrid rebuild progression:** W1 rebuild at 72%, W2 at 76%, W3+ at 78-80%. Reps stay in Strength Build range (4-6). All four upper patterns in single upper session (per §3.3). Hip Thrusts on every lower session.
- **Durability rebuild progression:** Resume SM phase at standard loads (65-75% × 8-12 reps). No power work.

**Race-B week:** Standard race-week protocol per §7.1 or §7.2 depending on athlete intent.

**P-005 conformance:** Inter-race rebuild must emit both upper and lower sessions per week, not lower-only. Lower-only inter-race rebuild is a violation (the original audited plan had this bug).

If the gap between races is <3 weeks total, drop to durability protocol for that inter-race period regardless of intent — there's not enough time to meaningfully rebuild hybrid loads without compromising race-B taper.

---

## 8. Equipment tiers — full specification

### 8.1 Full barbell tier
**Required:** Barbell + plates, squat rack OR power cage, bench (flat or adjustable)
**Optional:** Pull-up bar, kettlebells, dumbbells, resistance bands, cable machine

All hybrid and durability prescriptions available.

### 8.2 Dumbbell-based tier
**Required:** Dumbbells (adjustable or 2-3 pairs), bench
**Optional:** Pull-up bar, resistance bands, kettlebells

**Hybrid protocol substitutions:**
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

**Hybrid protocol:** Not available. Surface trade-off, route to durability.

**Durability protocol substitutions:**
- Squat → Bodyweight squat with 3-sec descent, single-leg variations
- Hinge → Single-leg RDL bodyweight, band good morning
- Push → Push-ups (incline → flat → decline progression), band overhead press
- Pull → Inverted ring row, band pull-down, band row
- Core → Plank, side plank, bird dog, dead bug

---

## 9. Plan length scaling

The phase durations in §3.1 and §4.1 assume a standard 16-week 70.3 build. Shorter and longer plans scale as follows.

### 9.1 Hybrid protocol scaling

| Plan length | Hypertrophy | Strength Build | Maint+Power | Taper |
|---|---|---|---|---|
| 8–10 weeks (sprint ramp) | 2 weeks | 2 weeks | 3–5 weeks | 1 week |
| 11–14 weeks (Oly / short 70.3) | 3 weeks | 3 weeks | 4–6 weeks | 1 week |
| 15–18 weeks (standard 70.3) | 4 weeks | 4 weeks | 4–6 weeks | 1 week |
| 19–24 weeks (long 70.3 / short IM) | 4–5 weeks | 4–5 weeks | 6–8 weeks | 1 week |
| 25+ weeks (full IM build) | 5–6 weeks | 5–6 weeks | 8–10 weeks | 1 week |

**Minimum hybrid protocol plan length is 8 weeks.** Plans shorter than 8 weeks route to a compressed durability variant: 2 weeks AA, 2 weeks MS, remainder SM, no power phase. There is not enough time to build hypertrophy and strength meaningfully on top of endurance load.

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
- `supabase/functions/_shared/triathlon_performance.ts` — hybrid protocol session generation per phase
- `supabase/functions/_shared/triathlon_durability.ts` — durability protocol session generation per phase
- `generate-combined-plan/phase-structure.ts` — phase boundaries per §3.2 and §9
- `generate-combined-plan/session-factory.ts` — session assembly per §3.6
- `generate-combined-plan/types.ts` — `StrengthProtocol` type union
- `validate-strength-conformance.ts` (new) — implements §3.8 contract
- `ArcSetupWizard.tsx` — surfaces wizard labels per §0.2, equipment trade-off per §2.2, volume advisory per §2.3, race-day trade-off summary per §0.3

### 10.2 Known gaps to be closed by §3.8 conformance pass

- Hypertrophy W5 emits at 65% instead of clamping to 72% (P-002) — fixed per autonomous session
- `perfBaseUpper` missing OHP (S-003) — fixed
- `perfBuildUpper` missing Bench (S-003) — fixed
- `perfBaseLower` and `perfBuildLower` missing Hip Thrusts (S-005) — fixed
- Deload weeks skip strength in hybrid protocol — should REDUCE per §3.2 / W-002 (open)
- Lower + Quality Run same-day pairings need explicit AM/PM ordering metadata + 6h gap field on each session. The pairing itself is correct; the metadata is missing. (W-006 / §6.4) — open
- Lower + Long Run 48h gap rule needs validator implementation (W-004) — open
- Inter-race rebuild emits Lower only, missing Upper (P-005 / §7.4) — open
- Phase label "Race-prep" emitted instead of "Maintenance + Power" (D-002) — open

### 10.3 Rendering — Pool gear pattern for strength

Same pattern as swim equipment lines:
> "Equipment — Required: Barbell, Rack, Bench. Optional: Kettlebell."
> "Equipment — Required: Dumbbells, Bench."
> "Equipment — Required: Bands."

Equipment line is generated from session needs ∩ athlete inventory.

---

## 11. Research references

**Modern hybrid methodology**
- Fergus Crawley (OMNIA Performance) — hybrid training framework, deload-as-maintenance principle
- Alex Viada, *The Hybrid Athlete* — concurrent programming, "touch" sessions during recovery
- Hybrid Athletics general programming corpus

**Volume programming and deload (RP / MEV framework)**
- Mike Israetel & Renaissance Periodization — Minimum Effective Volume principle; deload defined as reduced volume at maintained intensity range, not skip
- Helms, Morgan, Valdez, *The Muscle and Strength Pyramid: Training* (2nd ed., 2019)

**Concurrent training interference (modern evidence base)**
- Coffey & Hawley, *Concurrent exercise training: Do opposites distract?* (J Physiol, 2017)
- Wilson et al., *Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises* (J Strength Cond Res, 2012)
- Fyfe et al., *Interference between concurrent resistance and endurance exercise: molecular bases and the role of individual training variables* (Sports Med, 2014; 2016 update)
- Doma, Deakin, Bentley, *Implications of impaired endurance performance following single bouts of resistance training: an alternate concurrent training perspective* (Sports Med, 2017)
- Berryman et al., *Strength training for middle- and long-distance performance: a meta-analysis* (Int J Sports Physiol Perform, 2018)
- Eddens, van Someren, Howatson, *The Role of Intra-Session Exercise Sequence in the Interference Effect: A Systematic Review with Meta-Analysis* (Sports Med, 2018) — strength-first protects lower-body dynamic strength
- Doma & Deakin, *The cumulative effects of strength training on running performance* and follow-up work — endurance-first protects running economy
- Makhlouf et al. (2016) — strength prior to endurance for greater dynamic strength gains

**Plyometrics and running economy**
- Spurrs et al., *The effect of plyometric training on distance running performance* (Eur J Appl Physiol, 2003)
- Saunders et al., *Short-term plyometric training improves running economy in highly trained middle and long distance runners* (J Strength Cond Res, 2006)
- Paavolainen et al., *Explosive-strength training improves 5-km running time by improving running economy and muscle power* (J Appl Physiol, 1999)

**Type II fiber preservation in endurance athletes**
- Methenitis et al., *Type II muscle fibers, force-velocity, and the modifiability of endurance performance* (multiple papers, 2018-2020)
- Aagaard & Andersen, *Effects of strength training on endurance capacity in top-level endurance athletes* (Scand J Med Sci Sports, 2010)

**Glute and posterior chain for endurance**
- Contreras et al. — hip thrust biomechanics and EMG studies
- Distefano et al. — single-leg work for hip stability and injury prevention

**Friel AA-MS-SM model (durability protocol)**
- Joe Friel, *The Triathlete's Training Bible* (5th edition, 2016) — Chapter 13 on strength
- TrainingPeaks ATP Strength Phase Workouts

**Norwegian methodology (background context only)**
- Olav Aleksander Bu — coach to Kristian Blummenfelt and Gustav Iden
- Mark Allen analysis: "refined traditional principles" rather than novel strength model

**Sport-specific upper accessories**
- Rotator cuff and scapular work for swim catch position — primarily clinical and coaching consensus; lighter peer-reviewed evidence base than the run/bike accessories. Included as low-cost prevention.

**Volume thresholds for protocol switching**
- Coaching consensus across IM coaches (Hadfield, Bennett, Vance) that strength frequency drops to 1x/week at 18+ hrs/week endurance volume and approaches maintenance-only at 22+ hrs/week. Defensible heuristic, not single-citation evidence.

---

End of document.
