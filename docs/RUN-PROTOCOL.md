# Run Protocol — Aerobic Base, Quality Rotation, and Within-Phase Progression

> **Status: SPEC DRAFT — 2026-05-20. Phase 0 of the run arc** (parallel to the swim arc Phases 0-3 at `c1c94cec` / `ef91c2ee` / `e723d246` / `95b94aba` / `f53bbf34`). Engine semantics below are **complete and final** for Phases 0-3. Phase 4 (`limiter_sport='run'` intensity dial) is deferred to its own arc with a separate architectural-decision blocker (ENGINE-STATE Known Broken — see `TICKET-B-WIRING-AUDIT.md` Field 2 §7).

---

## 0. Core principle

Run training builds **aerobic durability** (long run + easy mileage) and **race-specific power** (intervals → VO2max → tempo → race-pace). Sessions ramp **within phase**, not just at phase boundaries — the engine must read `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` (NOT `weekNum − block.startWeek + 1` / `weekInBlock`, which per **ADR 0002** is always `1` and silently flattens the ramp). Same anti-regression rule the swim arc ratified at §4.1.

The protocol is intent-aware (Completion / First-Race / Comeback / Performance), experience-aware (beginner / intermediate / advanced via `training_fitness`), and phase-aware (base → build → race-specific → taper, with carve-outs for recovery / rebuild / race-week).

---

## 1. Inputs

Athlete-supplied (wizard or learned from history; see §7 for derivation when missing):

- **5K pace** (`learned_fitness.fiveK_pace` / `performance_numbers.fiveK_pace`).
- **10K pace** (`learned_fitness.tenK_pace`).
- **Threshold pace** (10mi / half-marathon, `learned_fitness.threshold_pace`).
- **Marathon pace target** (`learned_fitness.marathon_pace`).
- **Easy pace** (`learned_fitness.easy_pace`).
- **Recent longest run miles** (for `effectiveLongRunFloorMiles` history gate at `validate-training-floors.ts:341-352`).
- **`limiter_sport`** (the `'run'` value flags the athlete for the future intensity dial — Phase 4 of this arc).
- **`training_intent`** ∈ {`completion`, `first_race`, `comeback`, `performance`}.
- **`training_fitness`** ∈ {`beginner`, `intermediate`, `advanced`} — global tier from `inferTrainingFitnessLevel`.

---

## 2. Protocol selection (intent + experience → structure)

| Intent | Experience | Frequency baseline | Quality session role |
|---|---|---|---|
| Completion / First-Race | Beginner | 2-3×/week | Optional gentle intervals (4×800m) |
| Completion / First-Race | Intermediate | 3×/week | One quality session (base intervals) |
| Comeback | Any | 2-3×/week | Easy + strides; no hard intervals first 4 weeks |
| Performance | Beginner | 3×/week | Standard base intervals (4-6×1000m) |
| Performance | Intermediate | 3-4×/week | Phase-rotating quality (intervals → VO2/tempo → race-pace) |
| Performance | Advanced | 4×/week | Phase-rotating quality + strides on 1-2 easy runs |

Performance-intent athletes get the full phase-rotating quality progression; lower intents stay foundation-focused.

---

## 3. Frequency by hours tier

From the (hours × days_per_week) matrix in `src/lib/session-frequency-defaults.ts` (verified column for triathletes; single-sport runners get a different table not covered here):

| Hours tier | Runs/week |
|---|---|
| 5-7 hr | 2 |
| 8-10 hr | 3 |
| 10-12 hr | 3 |
| 12-14 hr | 3 |
| 14+ hr | 4 |

`limiter_sport='run'` currently adds a +7% TSS allocation in `science.ts:295-330 getBaseDistribution()` but does NOT increase run frequency (per `SESSION-FREQUENCY-DEFAULTS.md §4` — "Run limiter is handled through intensity, not frequency"). The intensity-side dial (longer LR / +1 interval rep / strides on easy days) is **Phase 4 of this arc, deferred**.

---

## 4. Phase progression

### 4.1 Base phase (weeks 1-6 of typical 17-18wk plan)

**Focus:** aerobic foundation, mileage build, intro to interval work.

| Session type | Count/week | Distance / duration | Intensity |
|---|---|---|---|
| Long Run | 1 | START → PEAK per §4.5 ramp table | Z2 |
| Easy Run | 1-2 | 3-5mi | Z1-Z2 |
| Quality (intervals) | 0-1 | N × 1000m | Z3-Z4 (10K-tempo pace) |

**Long-run within-phase ramp (the ratified curve):**

```
miles = lerp(START, PEAK, phaseProgress(weekInPhase, BASE_RAMP_WEEKS))
phaseProgress(w, rampWeeks) = clamp01((w − 1) / (rampWeeks − 1))
BASE_RAMP_WEEKS = 6
```

`weekInPhase` **must** be `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` — the recovery-non-resetting in-phase index. **Never** `weekInBlock` (always `1` per ADR 0002). Mirrors swim §4.1 exactly.

**Interval rep ramp (base quality):**

```
reps = clamp(4, 8, 4 + floor((weekInPhase − 1) / 2))
```

- weeks 1-2: 4×1000m
- weeks 3-4: 5×1000m
- weeks 5-6: 6×1000m

Distance constant at 1000m; rest 90 sec jog throughout. Ratifies the engine's existing formula at `week-builder.ts:1400` — Phase 1 swaps the broken `weekInBlock` variable for `weekInPhase`.

**Strides:** optional in base — foundation-focused phase prioritizes mileage volume over neuromuscular work. Performance athletes may add 4×20s strides to one easy run/week.

### 4.2 Build phase (weeks 7-10 of typical 17-18wk plan)

**Focus:** threshold + VO2max, aerobic ceiling lift.

| Session type | Count/week | Distance / duration | Intensity |
|---|---|---|---|
| Long Run | 1 | Builds per §4.5 (10 → 11mi for 70.3) | Z2; last mile Z3 |
| Easy Run | 1-2 | 3-5mi + strides (1-2 sessions/wk) | Z1-Z2 |
| Quality (VO2max OR tempo) | 1 | See ramp below | Z3-Z5 |

**VO2max ramp** (`race_peak` approach, default for performance athletes):

```
N × 3min @ Z5 (5K pace − 5s), 90s easy jog float
N = clamp(3, 6, 3 + (weekInPhase − 1))
```

- build wk 1: 3×3min
- build wk 2: 4×3min
- build wk 3: 5×3min
- build wk 4: 6×3min

**Tempo alternative** (`base_first` approach):

```
tempo_mi = max(3, round(long_run_mi × 0.30))
```

WU 1.5mi → tempo @ Z3-Z4 (10K-half-marathon pace) → CD 1mi.

**Strides:** prescribed on 1-2 easy runs/week. 4-6 × 20-30 sec at ~5K pace effort with 30s walk recovery, appended to an easy run.

### 4.3 Race-specific phase (weeks 11-14 of typical single-race 17-18wk plan — illustrative, non-binding)

> **Non-binding week numbers (Gap 7 / `RACE-WEEK-PROTOCOL.md §8.6`):** the engine assigns race-specific by plan *position*, not fixed weeks 11-14. Two-race plans realize different weeks — e.g. realized two-70.3 has B-race = wk13, A-race = wk17.

**Focus:** race-pace sustained intervals, brick endurance, T2 readiness.

| Session type | Count/week | Distance / duration | Intensity |
|---|---|---|---|
| Long Run | 1 | Builds per §4.5 (11 → 13mi for 70.3) | Z2; last 1/3 race-pace |
| Easy Run | 1 | 3-4mi + strides (1 session/wk) | Z1-Z2 |
| Race-Pace Run | 1 | Ramp 3 → 6mi @ marathon/race pace | Race pace |
| Brick Run | 1 (with long ride) | 5.5mi (70.3); ≤8mi clamp | Z2 with race-pace last half |

**Race-pace miles ramp:**

```
rp_miles = clamp(3, peak_rp_miles_for_distance, 3 + (weekInPhase − 1))
peak_rp_miles_for_distance: sprint 3, olympic 5, 70.3 6, full IM 8
```

- RS wk 1: 3mi @ race pace
- RS wk 2: 4mi
- RS wk 3: 5mi
- RS wk 4: 6mi (for 70.3)

**Brick run** (parallel to `BRICK-PROTOCOL.md §3.2`):

70.3 race-spec brick run = `0.42 × race_run_distance = 5.5mi` (Z2 with race-pace last half), off a 2.5-3hr long ride. The 55-min total is a **meaningful run stimulus** after a long bike, not a transition-only stimulus. The "≤25 min transition stimulus" comment at `validate-training-floors.ts:394-395` is **obsolete and will be removed in Phase 3** — the code behavior is correct; the comment is wrong.

### 4.4 Taper (race week + 1-2 weeks pre-A)

**Focus:** neural readiness, no fatigue accumulation.

| Session type | Count/week | Distance / duration | Intensity |
|---|---|---|---|
| Long Run | 1 (pre-A only) | ≤5mi | Z2 |
| Easy Run | 1 | 2-3mi + strides (1×) | Z1-Z2 |
| Race-Pace Light | 1 | 2-3mi short race-pace activation | Race effort, short |

**Race week** specifically (`RACE-WEEK-PROTOCOL.md §8`):

- Long run capped ≤45min, 3-5mi (`week-builder.ts:805-808`).
- No new intervals.
- Race day = the prescribed race-distance session.

### 4.5 Within-phase ramp endpoints (LOCKED 2026-05-20)

**Per-distance peak target (long run, advanced athletes):**

| Distance | `peakTarget` (mi) | Source |
|---|---|---|
| Sprint | 4 | Friel typical |
| Olympic | 7 | Friel typical |
| **70.3** | **13** | **Ratified 2026-05-20 — appropriate for 5:56 finisher targeting PR. 15mi is marathon territory + IM injury-risk overlap.** |
| Full IM | 20 | Friel typical 18-22mi; 20 mid-range, defensible |

**Phase multipliers (applied to `peakTarget`):**

| Phase | START multiplier | PEAK multiplier |
|---|---|---|
| Base | 0.65 | 0.75 |
| Build | 0.75 | 0.85 |
| Race-specific | 0.85 | 1.00 |
| Rebuild | 0.85 | 0.85 (flat, no within-phase ramp — short window) |
| Taper | — | 0.40 (pre-race long run; capped to ≤5mi) |
| Recovery | — | 0.55 (capped to ≤8mi) |

**Realized progression for 70.3** (peak 13mi, 6 base + 4 build + 4 RS weeks):

```
Base wk 1-6:    8.5 → 9 → 9 → 9.5 → 10 → 10mi      (lerp 0.65×13 → 0.75×13)
Build wk 1-4:   10 → 10 → 11 → 11mi                 (lerp 0.75×13 → 0.85×13)
RS wk 1-4:      11 → 12 → 12 → 13mi                 (lerp 0.85×13 → 1.00×13)
```

**Realized progression for full IM** (peak 20mi):

```
Base wk 1-6:    13 → 14 → 14 → 14.5 → 15 → 15mi    (0.65×20 → 0.75×20)
Build wk 1-4:   15 → 16 → 16.5 → 17mi              (0.75×20 → 0.85×20)
RS wk 1-4:      17 → 18 → 19 → 20mi                (0.85×20 → 1.00×20)
```

### 4.6 Recovery / Rebuild

- **3:1 deload week** (within base/build/RS): long run capped ≤8mi (`week-builder.ts:816-819`); easy runs at 3mi; no quality.
- **Return-from-recovery deload** (week after recovery): LR capped ≤9mi (`week-builder.ts:821-824`); quality re-introduced.
- **Post-race rebuild** (after B-race): LR floor `0.85 × peakTarget` (= 11mi for 70.3); reduced quality; rebuild to base level within 1-2 weeks before re-entering build.

---

## 5. Session types library

### 5.1 Long Run
**Purpose:** aerobic capacity + durability.
**Structure:** WU 1mi easy → main set at Z2 → CD 1mi. Last 1-2mi at marathon pace for race-spec.
**Phase use:** every phase, with phase-progressive distance per §4.5.

### 5.2 Easy Run
**Purpose:** aerobic base, recovery facilitation.
**Structure:** 3-5mi at Z1-Z2 (conversational pace). Optional strides (4×30s) appended in build+.
**Phase use:** any phase.

### 5.3 Threshold / Tempo Run
**Purpose:** raise lactate threshold.
**Structure:** WU 1.5mi easy → tempo at Z3-Z4 → CD 1mi. `tempo_mi = max(3, round(long_run_mi × 0.30))`.
**Phase use:** Build primarily (`base_first` approach); sparingly in RS for run-only plans.

### 5.4 VO2max Run
**Purpose:** aerobic ceiling.
**Structure:** WU 1.5mi → N×3min @ Z5 with 90s easy jog float → CD 1mi.
**Rep progression:** 3 → 4 → 5 → 6 across build weeks (per §4.2 ramp).
**Phase use:** Build (`race_peak` approach).

### 5.5 Interval Run (Base)
**Purpose:** economy + intro to threshold work.
**Structure:** WU 10min → N×1000m at 10K/tempo pace, 90s jog recovery → CD 10min.
**Rep progression:** 4 → 5 → 6 across base weeks (per §4.1 ramp).
**Phase use:** Base.

### 5.6 Race-Pace Run / Marathon-Pace Run
**Purpose:** race rehearsal.
**Structure:** WU 1.5mi → race-pace miles → CD 1.5mi.
**RP miles:** 3 → 6 across race-specific weeks (per §4.3 ramp).
**Phase use:** Race-specific.

### 5.7 Brick Run
**Purpose:** T2 transition + run-off-bike durability.
**Structure:** 70.3 race-spec = 5.5mi at Z2 with race-pace last half, off a 2.5-3hr long ride. Total ~55 min — **a meaningful run stimulus, not transition-only**. ≤8mi clamp.
**Phase use:** Race-specific brick week.
**Note on `validate-training-floors.ts:394-395`:** the ≤25min comment is **obsolete and will be removed in Phase 3**. The code at `science.ts:143-152` is correct (race_specific multiplier 0.42).

### 5.8 Strides
**Purpose:** neuromuscular speed, leg turnover, running economy.
**Structure:** 4-6 × 20-30 sec at ~5K pace effort with 30s walk recovery, appended to an easy run after CD or replacing the last quarter-mile of an easy run.
**Phase use:** Build, Race-specific. Sparingly / optional in base. **NEVER** in race week (interference with taper).
**Run-limiter dial:** Phase 4 of future arc — additional strides on easy days for `limiter_sport='run'` athletes.

---

## 6. Run philosophy

### 6.1 Polarized training (80/20)

~80% easy aerobic / ~20% threshold-or-harder. Avoids junk miles in the Z3 plateau. Long run is Z2 dominant; quality is Z4+. The TSS distribution shift from `limiter_sport='run'` (+7% to run share) targets this ratio, not the per-session intensity (which is Phase 4).

### 6.2 Strides as the neuromuscular dial

Strides are not "speedwork" — they're 20-30 sec accelerations that wake up fast-twitch fibers, improve running economy, and counteract the slow-twitch bias from long Z2 mileage. They should be prescribed in build+ for performance athletes; optional in base.

### 6.3 No-junk-miles principle

Every easy run is genuinely easy (Z1-Z2 conversational). Every quality session has explicit physiological purpose (intervals → economy + intro lactate; VO2max → aerobic ceiling; tempo → lactate threshold; race-pace → race-rehearsal). Mid-effort Z3 "tempo" sessions for performance athletes only — completion/first-race athletes get easy/long structure with optional intervals.

### 6.4 What the system can and can't do

**Can:**
- Prescribe phase-appropriate session rotation (intervals → VO2/tempo → race-pace).
- Ramp long run / intervals / race-pace miles within phase per §4.5.
- Reference athlete pace baselines (5K, 10K, threshold, marathon) downstream via the materialize-plan pace tokens.
- Enforce race-week clamps (≤45min / 3-5mi).

**Cannot:**
- Verify gait / form / cadence on the trail.
- Detect overreaching from training alone (combines with HR/HRV signals — out of run protocol scope).
- Replace a coach's eye on running mechanics.

---

## 7. Pace derivation

### 7.1 Athlete inputs (already in wizard / Garmin)

- 5K pace
- 10K pace
- Threshold pace (10mi / half-marathon)
- Marathon pace target
- Easy pace

### 7.2 Internal pace computation (when inputs missing)

Daniels VDOT or Riegel-formula derivation from a single 5K time (the engine's existing baseline). If only `easy_pace` is set, intervals default to descriptive labels ("10K pace", "threshold pace") and the materialize-plan parser (`_shared/token-parser.ts:182-208 getPaceFromReference`) consumes baselines downstream.

### 7.3 Zone prescriptions

- **Z1 recovery:** easy pace + 30s/mi.
- **Z2 aerobic:** easy pace (conversational).
- **Z3 tempo:** marathon pace ± 5s.
- **Z4 threshold:** 10K pace.
- **Z5 VO2max:** 5K pace − 5s.

### 7.4 No pace data on file

Fall back to RPE labels in copy ("conversational", "comfortably hard", "hard but sustainable", "all-out for ≤3 min"). Athlete-supplied pace data is the preferred path; RPE is the graceful fallback.

---

## 8. Surface / environment

- **Default:** outdoor road. Pace targets assume road surface, neutral grade.
- **Trail:** equivalent intensity by RPE; expect slower paces (~10-20% slower). Surface gradient absorbed in HR/RPE rather than pace.
- **Treadmill:** 1% incline rule for ≥7:00/mi paces; flat OK for slower paces. Athlete can manually set treadmill paces to match prescribed if comfort allows.

No equipment tiers parallel to swim's pool gear inventory — running is gear-light. Shoe selection (road vs trail vs racing flat) is outside this protocol's scope.

---

## 9. Race week protocol

### 9.1 A-race week

Per `RACE-WEEK-PROTOCOL.md §8`:

- Long run capped ≤45min, 3-5mi (`week-builder.ts:805-808`).
- Easy run 2-3mi early week; optional 1× short strides (race-day priming, not a workout).
- No new intervals.
- Race day = the prescribed race-distance session, distance-aware.

### 9.2 Post-race recovery week

- 0 quality runs.
- Long run ≤8mi (recovery cap `week-builder.ts:816-819`).
- Easy runs only (2-3mi each).
- 70.3 strength: rebuild from recovery to base (`STRENGTH-PROTOCOL.md §7.3`).

---

## 10. Implementation pointers + research references

### 10.1 Files that need to read this spec

- `supabase/functions/generate-combined-plan/science.ts` — `longRunFloorMiles`, `brickRunTargetMiles` (Phase 1: add `weekInPhase` arg).
- `supabase/functions/generate-combined-plan/session-factory.ts` — `longRun`, `easyRun`, `tempoRun`, `vo2Run`, `intervalRun`, `racePaceRun`, `marathonPaceRun`, `brick` (Phase 1: thread `weekInPhase` through).
- `supabase/functions/generate-combined-plan/week-builder.ts` — `weekInPhaseForTimeline` call sites (Phase 1: replace the 2 broken `weekInBlock` formula sites at `:1400`/`:1420`).
- `supabase/functions/generate-combined-plan/validate-training-floors.ts:394-395` — remove the obsolete `≤25 min` brick-run comment (Phase 3).

### 10.2 What changes from current behavior

| Surface | Today | Spec'd (this arc) |
|---|---|---|
| Long run within phase | Flat (phase-only step) | Progressive ramp per §4.5 lerp |
| Base intervals | Flat 4×1000m every base week | 4 → 5 → 6 ramp per §4.1 |
| Build VO2max | Hardcoded 5×3min | 3 → 6 ramp per §4.2 |
| Race-pace run miles | Flat 4mi within RS | 3 → 6mi ramp per §4.3 |
| Strides in weekly programs | Absent (only 12-min TT) | 1-2 easy runs/week in build+ per §5.8 |
| 70.3 long-run peak | 11mi | **13mi** per §4.5 |
| Brick-run 25-min comment at `validate-training-floors.ts:394` | Obsolete | Removed (Phase 3) |
| `limiter_sport='run'` intensity dial | Only +7% TSS allocation | **Deferred — Phase 4 of separate arc** (architectural-decision blocker) |

### 10.3 Same pattern as swim arc (Phases 0-3)

This arc consciously mirrors the swim arc (`c1c94cec` / `ef91c2ee` / `e723d246` / `95b94aba` / `f53bbf34`):

- **ADR-0002 anti-regression:** `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` is the canonical within-phase index — NEVER `weekInBlock` (always 1 per ADR 0002).
- **Band-as-envelope lerp:** `miles = round(lerp(START, PEAK, phaseProgress(weekInPhase, RAMP_WEEKS)))`. Same Option A pattern that closed the swim flat-volume bug.
- **Slice 0 ratifies the spec; Slice 1 ships the engine wiring;** subsequent slices fill the §5.8 (strides) and §4.5 (70.3 peak lift + brick-run comment) gaps.

### 10.4 Phased implementation plan

- **Phase 0** — this spec (+ §11 product sign-off on long-run peak) + close-out D-NNN. **Gated; current.**
- **Phase 1** — `weekInPhase` wiring through `longRunFloorMiles` / `brickRunTargetMiles` / `intervalRun` / `vo2Run` / `tempoRun` / `racePaceRun` / `easyRun`. Band-as-envelope lerp for long-run within-phase ramp. Regression test `run-volume-ramp.test.ts` parallel to `swim-volume-ramp.test.ts`.
- **Phase 2** — strides as a first-class session modifier: `addStridesToEasyRun()` helper; injection at easy-run placement gated by phase.
- **Phase 3** — long-run peak lift (70.3: 11 → 13mi) + remove obsolete `validate-training-floors.ts:394` comment.
- **Phase 4 (DEFERRED, separate arc):** wire `limiter_sport='run'` intensity dial. Closes ENGINE-STATE Known Broken. Architectural decision needed: additive vs replacing the +7% TSS allocation per `TICKET-B-WIRING-AUDIT.md` Field 2 §7.

---

## 11. Research references

- Daniels, J. (2014). *Daniels' Running Formula* (3rd ed.) — VDOT-based pace zone derivation.
- Friel, J. (2018). *The Triathlete's Training Bible* (4th ed.) — 70.3 long-run peak 12-15mi typical; IM 18-22mi.
- Foster et al. (2014). *The Polarization-Index: A Simple Calculation to Distinguish Polarized from Non-Polarized Training.* — 80/20 distribution principle.
- Seiler, S. & Tønnessen, E. (2009). *Intervals, Thresholds, and Long Slow Distance: the Role of Intensity and Duration in Endurance Training.* — VO2max interval design (3-5 min @ Z5).
- Pfitzinger, P. & Latter, B. (2014). *Faster Road Racing.* — Stride dose (4-6 × 20-30 sec) and placement (1-2 per week in build+).

---

## 12. Close-out decision record (for the D-NNN at arc completion)

The run arc introduces one model decision (run program ratifies its dormant within-phase progression curve, parallel to swim arc Phase 0) + three locked sub-decisions:

1. **70.3 long-run peak = 13mi** (was 11mi). Appropriate for 5:56 finisher targeting a PR; 15mi is marathon territory and unnecessary injury risk overlapping IM training volume.
2. **Brick-run code is correct; the `validate-training-floors.ts:394` ≤25min comment is the bug.** Phase 3 removes the comment, not the 55min race-spec brick.
3. **Phase 4 (`limiter_sport='run'` intensity dial) deferred to its own arc** — separate architectural decision blocker (additive vs replace the +7% TSS allocation).

Full rationale → the close-out D-NNN; verified-state → ENGINE-STATE "Solid" at arc completion (same pattern as D-019 / D-020 / D-021 / D-022).
