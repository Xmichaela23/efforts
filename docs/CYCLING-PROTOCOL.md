# Cycling Protocol — Aerobic Base, Quality Rotation, and Within-Phase Progression

> **Status: SPEC DRAFT — 2026-05-21. Phase 0 of the cycling arc** (parallel to the swim arc Phases 0-3 at `c1c94cec` / `ef91c2ee` / `e723d246` / `95b94aba` / `f53bbf34` and the run arc Phases 0-3 at `50921629` / `60c23de2` / commits in D-023). Engine semantics below are **descriptive of the current shipped behavior**. Within-phase ramps shipped 2026-05-21 (D-028 — long-ride lerp + VO2/threshold/sweet-spot rep ramps); `bikeOpeners` race-week gating shipped 2026-05-25 (D-043). Phase 4 (`limiter_sport='bike'` intensity dial) remains deferred.

---

## 0. Core principle

Cycling training builds **aerobic durability** (long ride + Z2 endurance volume), **muscular endurance** (sweet-spot / tempo / threshold work at FTP-anchored zones), and **race-specific power** (VO2max sharpener + brick bike off the long ride). Sessions ramp **within phase**, not just at phase boundaries — the engine must read `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` (NOT `weekNum − block.startWeek + 1` / `weekInBlock`, which per **ADR 0002** is always `1` and silently flattens the ramp). Same anti-regression rule the swim arc ratified at §4.1 and the run arc ratified at §4.5.

The protocol is intent-aware (Completion / First-Race / Comeback / Performance), experience-aware (beginner / intermediate / advanced via `training_fitness`), and phase-aware (base → build → race-specific → taper, with carve-outs for recovery / rebuild / race-week). Equipment-aware to the extent that group-ride athletes route through a different quality-bike anchor (`groupRideQualityBikeSession`) than solo athletes (`groupRideSession` / interval-structured sessions).

---

## 1. Inputs

Athlete-supplied (wizard or learned from history; see §7 for derivation when missing):

- **FTP** (`learned_fitness.ftp` / `performance_numbers.ftp` / `user_baselines.performance_numbers.ftp`). Required for power-zone derivation. Falls back to RPE / HR labels when missing.
- **Recent longest ride hours** (for `effectiveLongRideFloorHours` history gate at `validate-training-floors.ts:~363-373`).
- **`limiter_sport`** (the `'bike'` value flags the athlete for the future bike-intensity dial — a deferred arc phase, parallel to run Phase 4).
- **`training_intent`** ∈ {`completion`, `first_race`, `comeback`, `performance`}.
- **`training_fitness`** ∈ {`beginner`, `intermediate`, `advanced`} — global tier from `inferTrainingFitnessLevel`.
- **`bike_quality_label`** (e.g. group-ride anchor name) — routes the quality slot to `groupRideQualityBikeSession` or `groupRideSession` instead of solo intervals.
- **`group_ride_route_snapshot`** (optional, `GroupRideRouteSnapshot` shape) — distance / elevation gain / climb density, drives the TSS floor in `groupRideBikeTssFloor` and the climbing copy in route-aware session text.
- **`bike_quality_day`** / **`bike_easy_day`** preferences (wizard) — anchor placement for the quality and easy bike sessions.

---

## 2. Protocol selection (intent + experience → structure)

| Intent | Experience | Frequency baseline | Quality session role |
|---|---|---|---|
| Completion / First-Race | Beginner | 2-3×/week | Easy + sweet spot (1× optional) |
| Completion / First-Race | Intermediate | 3×/week | One quality session (sweet spot) |
| Comeback | Any | 2-3×/week | Easy + sweet spot only; no VO2 / threshold first 4 weeks |
| Performance | Beginner | 3×/week | Sweet spot rotation (no VO2 until build) |
| Performance | Intermediate | 3-4×/week | Phase-rotating quality (sweet spot → threshold → VO2) |
| Performance | Advanced | 4×/week | Phase-rotating quality + race-pace endurance in race-spec |

Performance-intent athletes get the full phase-rotating quality progression (sweet spot → threshold → VO2 across base/build/race-spec); lower intents stay aerobic-focused.

**Group-ride substitution:** when the athlete declares a group-ride anchor (`bike_quality_label` matches a group-ride heuristic or `group_ride_route_snapshot` is present), the quality slot routes through `groupRideSession` instead of solo intervals — effort is controlled by the group, route-aware climbing copy + TSS floor apply. See §5.10.

---

## 3. Frequency by hours tier

From the (hours × days_per_week) matrix in `src/lib/session-frequency-defaults.ts` (verified column for triathletes; single-sport cyclists get a different table not covered here):

| Hours tier | Rides/week |
|---|---|
| 5-7 hr | 2 |
| 8-10 hr | 3 |
| 10-12 hr | 3 |
| 12-14 hr | 3-4 |
| 14+ hr | 4 |

`limiter_sport='bike'` currently adds a +7% TSS allocation shift in `science.ts getBaseDistribution()` (parallel to the run-limiter handling) but does NOT increase ride frequency. The intensity-side dial (longer long ride / +1 interval rep / harder sweet spot reps) is **deferred to a future arc phase** — same architectural-decision blocker class as the `limiter_sport='run'` dial.

---

## 4. Phase progression

### 4.1 Base phase (weeks 1-6 of typical 17-18wk plan)

**Focus:** aerobic foundation, Z2 mileage build, intro to sweet-spot quality.

| Session type | Count/week | Distance / duration | Intensity |
|---|---|---|---|
| Long Ride | 1 | START → PEAK per §4.5 ramp table | Z2 |
| Easy Ride | 1 | 45-75 min | Z1-Z2 |
| Quality (sweet spot) | 0-1 | 2 × 15 min | Z3-Z4 (sweet spot) |

**Long-ride within-phase ramp (the future-locked curve):**

```
hours = lerp(START, PEAK, phaseProgress(weekInPhase, rampWeeks))
phaseProgress(w, rampWeeks) = clamp01((w − 1) / (rampWeeks − 1))
BASE_RAMP_WEEKS = 6
```

`weekInPhase` **must** be `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` — the recovery-non-resetting in-phase index. **Never** `weekInBlock` (always `1` per ADR 0002). Mirrors swim §4.1 / run §4.5 exactly.

**Sweet-spot quality (base phase):** start at `2 × 15 min @ 88-94% FTP` (`sweetSpotBike(day, 2, 15, goalId)` in `session-factory.ts:609`). Wired in `groupRideQualityBikeSession` for the base branch with within-phase rep ramp `intervals = clamp(2, 4, 2 + floor((weekInPhase − 1) / 2))` — **shipped D-028 (2026-05-21)** at `session-factory.ts:747`.

### 4.2 Build phase (weeks 7-10 of typical 17-18wk plan)

**Focus:** threshold development, lactate-clearance lift, FTP push.

| Session type | Count/week | Distance / duration | Intensity |
|---|---|---|---|
| Long Ride | 1 | Builds per §4.5 (e.g. 70.3: 2.25 → 2.55 hr) | Z2; last 15-20 min Z3 |
| Easy Ride | 1 | 45-60 min + Z1 form spins | Z1-Z2 |
| Quality (threshold) | 1 | `3 × 20 min @ FTP` (Z4) | Z4 |

**Threshold quality (build phase):** start at `thresholdBike(day, 2, 20, goalId)` — wired in `groupRideQualityBikeSession` for the build branch with within-phase rep ramp `intervals = clamp(2, 4, 2 + floor((weekInPhase − 1) / 2))` — **shipped D-028 (2026-05-21)** at `session-factory.ts:743-744`. Mirrors the run-interval rep ramp formula.

### 4.3 Race-specific phase (weeks 11-14 of typical single-race 17-18wk plan — illustrative, non-binding)

> **Non-binding week numbers (Gap 7 / `RACE-WEEK-PROTOCOL.md §8.6`):** the engine assigns race-specific by plan *position*, not fixed weeks 11-14. Two-race plans realize different weeks — e.g. realized two-70.3 has B-race = wk13, A-race = wk17.

**Focus:** race-pace sustained intervals, brick endurance, T1 readiness.

| Session type | Count/week | Distance / duration | Intensity |
|---|---|---|---|
| Long Ride or Brick Bike | 1 | Builds per §4.5 (70.3: 2.55 → 3.0 hr) | Z2 with race-pace blocks |
| Easy Ride | 1 | 30-45 min | Z1-Z2 |
| VO2max Quality | 1 | `6 × 5 min @ 110-120% FTP` (Z5) | Z5 |
| Brick Bike (alternates with long ride) | 1 every other week | Long-ride duration + immediate brick run | Z2 with race-pace last 30 min |

**VO2 quality (race-spec phase):** start at `vo2Bike(day, 3, goalId)` (5-min reps). Within-phase rep ramp `reps = clamp(3, 6, 3 + (weekInPhase − 1))` — **shipped D-028 (2026-05-21)** at `session-factory.ts:740`. Parallel to the run VO2 ramp.

**Race-pace bike (race-spec brick weeks):** the brick bike's long aerobic block now incorporates race-pace efforts in the closing 30-45 min (target FTP wattage = expected race power, ~0.78-0.82 IF for 70.3 / 0.62-0.68 IF for full IM). The brick bike is `brick(...)` from `session-factory.ts:2008` with the bike leg sized to long-ride floor and the run-off per §5.7.

### 4.4 Taper (race week + 1-2 weeks pre-A)

**Focus:** neural readiness, no fatigue accumulation. Glycogen + freshness.

| Session type | Count/week | Distance / duration | Intensity |
|---|---|---|---|
| Long Ride | 1 (pre-A only) | ≤90 min | Z2 |
| Easy Ride | 1 | 30-45 min | Z1-Z2 |
| Openers | 1 (day before or 2 days pre-race) | 30 min | Z2 + 3 × 30-sec fast-pedal |

**Race week** specifically (`RACE-WEEK-PROTOCOL.md §8`):

- Long ride capped 0 (long-ride floor returns 0 in taper per `longRideFloorHours`).
- No new intervals.
- Openers: `bikeOpeners(day, goalId)` — 20 min Z2 + 3 × 30-sec fast-pedal bursts. Sharpener, not training stimulus.
- Race day = the prescribed race-distance bike leg per `RACE-WEEK-PROTOCOL.md §8.3`.

### 4.5 Within-phase ramp endpoints (LOCKED 2026-05-21 — Phase 0 spec; Phase 1 shipped D-028)

**Per-distance peak target (long ride, advanced athletes):**

| Distance | `peakTarget` (hr) | Source |
|---|---|---|
| Sprint | 1.0 | `expectedBikeDurationHours('sprint')` — race day distance |
| Olympic | 1.5 | `expectedBikeDurationHours('olympic')` |
| **70.3** | **3.0** | `expectedBikeDurationHours('70.3')` — Friel typical 2.5-3.5h; 3.0h mid-range |
| Full IM | 6.0 | `expectedBikeDurationHours('ironman')` — Friel typical 5-7h; 6.0h mid-range |

**Phase multipliers (applied to `peakTarget`):**

| Phase | START multiplier | PEAK multiplier |
|---|---|---|
| Base | 0.65 | 0.75 |
| Build | 0.75 | 0.85 |
| Race-specific | 0.85 | 1.00 |
| Rebuild | 0.85 | 0.85 (flat, no within-phase ramp — short window) |
| Taper | — | 0 (long-ride floor returns 0; pre-A long ride capped externally to ≤90 min) |
| Recovery | — | 0 (deload-light by design; capped externally to ≤60 min easy spin) |

Endpoints **must move in lockstep** between the ramp source (`longRideHoursForWeek`, future function added in Phase 1) and the legacy peak-of-phase source (`longRideFloorHours`, currently at `science.ts:391`). Same two-peak-source rule the run arc Phase 3 locked.

**Realized progression for 70.3** (peak 3.0h, 6 base + 4 build + 4 RS weeks):

```
Base wk 1-6:    1.95 → 2.0 → 2.0 → 2.1 → 2.2 → 2.25hr   (lerp 0.65×3 → 0.75×3)
Build wk 1-4:   2.25 → 2.35 → 2.45 → 2.55hr             (lerp 0.75×3 → 0.85×3)
RS wk 1-4:      2.55 → 2.7 → 2.85 → 3.0hr               (lerp 0.85×3 → 1.00×3)
```

**Realized progression for full IM** (peak 6.0h):

```
Base wk 1-6:    3.9 → 4.05 → 4.2 → 4.35 → 4.5 → 4.5hr   (0.65×6 → 0.75×6)
Build wk 1-4:   4.5 → 4.7 → 4.9 → 5.1hr                 (0.75×6 → 0.85×6)
RS wk 1-4:      5.1 → 5.4 → 5.7 → 6.0hr                 (0.85×6 → 1.00×6)
```

Rounding precision: **0.25hr** (matches the existing `longRideFloorHours` `Math.round(peak * multiplier * 4) / 4` convention).

### 4.6 Recovery / Rebuild

- **3:1 deload week** (within base/build/RS): long ride capped ≤90 min; easy rides at 30-45 min; no quality.
- **Return-from-recovery deload** (week after recovery): long ride capped ≤120 min; quality re-introduced at the prior phase's bottom-of-range.
- **Post-race rebuild** (after B-race): long-ride floor `0.85 × peakTarget` (= 2.55hr for 70.3, 5.1hr for full IM); reduced quality; rebuild to base level within 1-2 weeks before re-entering build.

---

## 5. Session types library

### 5.1 Long Ride
**Purpose:** aerobic capacity + durability + race-rehearsal of fueling cadence.
**Structure:** Z2 throughout; nutrition cadence (40-45 min eat intervals); **endurance cadence 85-95 rpm** (§8.1 canonical — the Long Ride default at every phase).
> **Cadence — RESOLVED 2026-06-24.** The Long Ride endurance default is **85-95 rpm** (§8.1). Low-cadence riding (~60-70 rpm) is a **distinct torque/force stimulus**, NOT the endurance default — it belongs only in a **labeled torque-interval block** (see §8.3 cadence-drill), never folded into the steady Z2 of the Long Ride. The former "60-70 base / 70-85 build/RS" line was the contradiction; it is reclassified, not deleted.
**Phase use:** every phase, with phase-progressive duration per §4.5.
**Engine:** `longRide(day, hours, goalId)` (`session-factory.ts:570`). Within-phase lerp via `longRideHoursForWeek` — **shipped D-028 (2026-05-21)**.

### 5.2 Easy Ride
**Purpose:** active recovery, aerobic-base maintenance.
**Structure:** Z1-Z2 (conversational); 45-75 min in base, 30-45 min in build/RS, 30 min in taper.
**Phase use:** any phase.
**Engine:** `easyBike(day, hours, goalId)` (`session-factory.ts:701`).

### 5.3 Tempo Ride
**Purpose:** lift aerobic ceiling, build muscular endurance without threshold-level cortisol cost.
**Structure:** WU 15 min → `N × M min` at tempo (82-88% FTP, Z3) with 5 min easy between → CD 10 min.
**Phase use:** Build (`base_first` approach primarily); base-late as a bridge from sweet spot to threshold.
**Engine:** `tempoBike(day, intervals, minEach, goalId)` (`session-factory.ts:688`).

### 5.4 Sweet Spot
**Purpose:** maximize Z3 time-in-zone for FTP gains with sub-threshold fatigue cost (Friel / TrainingPeaks sweet-spot literature).
**Structure:** WU 15 min → `N × M min` at sweet spot (88-94% FTP, Z3-Z4 boundary) with 5 min easy between → CD 10 min.
**Phase use:** Base (primary quality); Build (transitions to threshold).
**Engine:** `sweetSpotBike(day, intervals, minEach, goalId)` (`session-factory.ts:609`). Base-phase reps ramp `2 → 4 × 15 min` per the §4.2 D-028 formula (`groupRideQualityBikeSession` at `session-factory.ts:747`); legacy `3 × 12 min` build path superseded by the threshold dispatcher.

### 5.5 Threshold
**Purpose:** raise lactate threshold; FTP push.
**Structure:** WU 15 min → `N × M min` at FTP (Z4, 100% FTP) with 5 min easy between → CD 10 min.
**Phase use:** Build (primary quality, `race_peak` approach); race-specific (maintenance dose).
**Engine:** `thresholdBike(day, intervals, minEach, goalId)` (`session-factory.ts:~407`). Default `3 × 20 min` in build per group-ride-quality dispatcher.

### 5.6 VO2max
**Purpose:** aerobic ceiling, neural-recruitment lift.
**Structure:** WU 15 min → `N × 5 min` at 110-120% FTP (Z5) with 3 min easy recovery → CD 10 min.
**Rep progression:** `reps = clamp(3, 6, 3 + (weekInPhase − 1))` (Phase 1 lift; currently hardcoded 6).
**Phase use:** Race-specific (`race_peak` approach).
**Engine:** `vo2Bike(day, reps, goalId)` (`session-factory.ts:~420`).

### 5.7 Brick Bike
**Purpose:** race-specific bike → run T1 readiness; trained off-bike legs.
**Structure:** Long-ride-floor duration (70.3 race-spec = ~2.5-3hr) at Z2 with race-pace last 30-45 min, immediately followed by the brick run (`brickRunMilesForWeek`).
**Phase use:** Race-specific brick week (alternates with standalone long ride per `BRICKS_PER_WEEK`).
**Engine:** `brick(...)` (`session-factory.ts:2008`) — emits both the bike and the run-off as paired sessions tagged `brick`.
**Note on long-ride floor accounting:** `maxLongRideMinutes` in `validate-training-floors.ts:~386` counts the brick's bike leg toward long-ride volume; the brick's run portion is bike-leg-excluded by design (function measures long-ride volume only; brick run has its own §5.7-style RUN protocol accounting).

### 5.8 Openers
**Purpose:** neural priming for race day; flush travel stiffness.
**Structure:** 20 min Z2 easy → 3 × 30-sec fast-pedal bursts (high cadence, light gear) → 5 min easy spin to finish. Total ~30 min.
**Phase use:** Taper / race week (1-2 days pre-A). **NEVER** outside taper.
**Engine:** `bikeOpeners(day, goalId)` (`session-factory.ts:752`).
**Race-week gating — shipped D-043 (2026-05-25):** the `bikeOpeners` gate at `week-builder.ts:1461` is `phase === 'taper' && raceThisWeek` — fires only on the actual race week, not every taper week. Mirrors the swim-activation Gap-6 fix landed in race-week Phase 4.

### 5.9 Recovery Ride
**Purpose:** active recovery, blood flow, no training stimulus.
**Structure:** 30-45 min Z1 (very easy); cadence **80-90 rpm** (§8.1 canonical Recovery band); no intervals.
**Phase use:** Recovery weeks; day after a hard ride.
**Engine:** today realized via `easyBike(...)` at low duration; no separate helper. A dedicated `recoveryBike` helper is Phase 2 candidate work.

### 5.10 Group Ride (anchor-driven)
**Purpose:** quality session for athletes with a recurring group-ride anchor (Wednesday rollers, Saturday A-group, etc.). Effort is controlled by the group; route topology drives the TSS.
**Structure:** No prescribed intervals — ride the group's effort. Route-aware climbing copy if `group_ride_route_snapshot` is present (distance, elevation gain, climb density per km).
**TSS floor:** `groupRideBikeTssFloor(snapshot)` returns a route-derived minimum; the session's TSS is bumped to this floor when interval-derived TSS would be lower.
**Phase use:** any phase the athlete declares — quality-bike anchor day. Base = climbing surges expected to be threshold-like; build/RS = full quality effort.
**Engine:** `groupRideSession(...)` (`session-factory.ts:~451`) and `groupRideQualityBikeSession(...)` (`session-factory.ts:~542`). The latter is the phase-aware dispatcher (base→sweet spot, build→threshold, race-spec→VO2) when the athlete is NOT route-anchored to a specific group ride; the former is for the route-tagged group-ride anchor.

---

## 6. Cycling philosophy

### 6.1 Polarized + sweet-spot hybrid

Coggan / Friel literature: ~80% easy (Z1-Z2) / ~20% above threshold (Z4+) for elite road cyclists. Age-group triathletes benefit from a **sweet-spot bias** in the 20% slice — Z3 sweet spot delivers FTP gains with lower fatigue cost than pure threshold work, leaving recovery headroom for run and swim. The protocol mixes the polarized framework (long ride + easy ride drive the 80%) with sweet-spot bias in the quality slot (the 20%) during base, ratcheting up to threshold + VO2 in build / race-specific.

### 6.2 Sweet spot as the durability dial

Sweet spot at 88-94% FTP is the "fastest you can do without going into the red." Repeatable across multiple workouts in a week (vs threshold which limits to 1-2/week); builds the muscular-endurance substrate for race-pace efforts; spares the central nervous system. Performance athletes in base get sweet-spot quality; in build the dose moves toward threshold; in race-specific toward VO2 with race-pace sustained blocks layered into the long ride.

### 6.3 No-junk-miles principle

Every easy ride is genuinely easy (Z1-Z2, conversational). Every quality session has explicit physiological purpose (sweet spot → muscular endurance, threshold → FTP, VO2 → aerobic ceiling). Mid-effort Z3 "tempo" is the bridge — used in `base_first` athletes for base / early build; performance athletes in build go straight to threshold.

### 6.4 What the system can and can't do

**Can:**
- Prescribe phase-appropriate session rotation (sweet spot → threshold → VO2).
- Ramp long-ride duration / interval reps within phase per §4.5 (Phase 1 lift).
- Reference athlete FTP downstream via the materialize-plan power tokens (`bike_thr_3x20min_r5min` → resolved to wattage at materialize time).
- Enforce race-week clamps (taper long ride 0 / easy ride ≤45 min).
- Handle group-ride anchor with route-aware climbing copy + TSS floor.

**Cannot:**
- Verify pacing / cadence / wattage in-ride.
- Detect overreaching from training alone (combines with HR/HRV signals — out of cycling protocol scope; see CYCLING-ANALYSIS-DESIGN.md for the analysis-side surface).
- Replace a coach's eye on bike fit, position, climbing technique.
- Detect indoor-vs-outdoor delta (smart trainer vs outdoor power produce different stimuli at the same wattage — current spec is wattage-neutral).

---

## 7. Power-zone derivation

### 7.1 Athlete inputs (already in wizard / Garmin)

- **FTP** (`learned_fitness.ftp` or `performance_numbers.ftp`).
- **CTL** (from `athlete_snapshot.ctl` — drives training fitness inference, also exposed in `arc.cycling_fitness`).

### 7.2 Internal FTP computation (when inputs missing)

- **Learned FTP** via `resolve-current-ftp.ts` (confidence-gated; only `learned` source with medium/high confidence is consumed by `inferTrainingFitnessLevel`).
- **No fallback to test-derived FTP** — if no FTP is on file, the engine emits zone-relative labels (e.g. `"Z3 sweet spot"`, `"Z4 FTP"`) and the materialize-plan layer surfaces RPE / wattage targets when the athlete supplies FTP later.
- **20-min FTP test** (`session-factory.ts:~2340-2362`) is emitted as the first-week assessment for athletes without a learned FTP — drives the initial baseline.

### 7.3 Coggan power-zone definitions

| Zone | Name | % FTP | Used in |
|---|---|---|---|
| Z1 | Active recovery | <56% | Recovery rides, openers warm-up |
| Z2 | Endurance | 56-75% | Long ride, easy ride |
| Z3 | Tempo | 76-90% | Tempo ride, lower-sweet-spot |
| Z3-Z4 | Sweet spot | 88-94% | Sweet spot quality |
| Z4 | Threshold | 91-105% | Threshold quality |
| Z5 | VO2max | 106-120% | VO2 quality |
| Z6 | Anaerobic | 121-150% | Not used in protocol (run-only territory) |
| Z7 | Neuromuscular | >150% | Openers fast-pedal bursts (effort-based, not wattage-targeted) |

**Note on terminology:** "Sweet spot" overlaps the upper end of Z3 and the lower end of Z4. The engine uses **88-94% FTP** for sweet spot (matching Friel / Frank Overton / FasCat coaching consensus); the existing `sweetSpotBike` description text says "88-94% FTP (Zone 3-4)" — consistent. "Tempo" in the engine sits at **82-88% FTP** (`tempoBike` description) — slightly below sweet spot, in the upper-Z3 band. The two are deliberately distinct sessions despite the overlap zone.

### 7.4 No FTP data on file

Fall back to RPE / HR labels in copy ("conversational", "comfortably hard", "hard but sustainable", "all-out for ≤5 min"). Athlete-supplied FTP is the preferred path; RPE / HR is the graceful fallback. The 20-min FTP test is auto-prescribed in the first week of any plan started without an FTP on file.

---

## 8. Cadence

> **Status — implementation GAP; cadence-source contradiction RESOLVED 2026-06-24.** The targets in this section are the canonical reference, but they are **not currently prescribed by the engine** — today's cycling sessions describe duration / power / RPE without cadence cues; the LLM narrative does not receive cadence context; the per-interval step targets in `materialize-plan` carry no cadence field. **§8.1 is now the single source of truth.** The former conflicting inline values were reconciled to it: §5.1 (Long Ride) → endurance **85-95 rpm**; §5.9 (Recovery) → **80-90 rpm**. Low-cadence ~60-70 rpm is **reclassified** as a distinct torque/force stimulus that belongs only in a labeled torque-interval block (§8.3 cadence-drill), never the endurance default. See §8.4 for the implementation surfaces that need to read this section; the §6 cadence-prescription punch-list item is **unblocked — build against §8.1**.

### 8.1 Cadence by session type (canonical reference)

Cadence is a *separate physiological dimension* from power: a 220 W effort at 70 rpm trains muscular strength + force-per-pedal-stroke; the same 220 W at 100 rpm trains neuromuscular coordination + cardiovascular cost. Training-stress accounting is power-based, but the adaptation differs. The protocol's cadence targets aim each session type at the *intended* physiological adaptation, not just the wattage band.

| Session type | Cadence (rpm) | Why this range |
|---|---|---|
| Recovery | 80-90 | Higher cadence at very-easy wattage = blood flow + neural priming without muscular load. Sub-80 rpm at recovery wattage adds avoidable muscular cost. |
| Endurance / Z2 (long ride, easy ride) | 85-95 | Aerobic-base cadence; matches steady fat-oxidation work and prepares the neuromuscular system for race cadence. |
| Sweet Spot (88-94% FTP, Z3-Z4 boundary) | 85-95 | Same as endurance — the *aerobic* adaptation is the target; sub-aerobic cadences would shift the stimulus toward muscular strength (not the goal at sweet spot). |
| Threshold (Z4, 100% FTP) | 88-95 | Slightly higher floor than sweet spot — at threshold the cost of low-cadence grinding scales fast (knee strain, premature glycogen depletion). |
| VO2max (Z5, 110-120% FTP) | 95-110 | High cadence supports the neural-recruitment + cardiovascular-ceiling stimulus VO2 work is designed for. Low-cadence VO2 efforts are essentially muscular intervals (different adaptation). |
| Neuromuscular / openers fast-pedal bursts | 110-130 | The point IS the cadence — explosive neural firing, light gear. Wattage is incidental (effort-based, per §7.3). |
| Race cadence (70.3) | 82-88 | The race target. See §8.2 for the tri-specific trade-off rationale. |

The bands are 3-tier coaching consensus (Carmichael CTS, Friel Triathlete's Training Bible, FasCat cycling-coaching framework). Endurance / sweet spot / threshold cluster in the 85-95 band because they share the same fundamental adaptation goal — *aerobic stress with neural cadence at race-relevant frequencies*; VO2 and neuromuscular lift above; race-day sits slightly below to conserve legs.

### 8.2 Race cadence vs training cadence — the triathlon-specific trade-off

For pure cyclists, higher cadence (~95 rpm) is the consensus race-day pick: lower per-stroke muscular cost spread across more strokes per minute reduces local fatigue. **For triathletes, race cadence is slightly lower (~82-88 rpm)** because the run-off the bike is the dominant fatigue cost. Higher cadence on the bike leaves the cardiovascular system more taxed (more strokes = more total mechanical work for the heart-lung system); lower cadence shifts some load back to the legs (which the athlete is about to dismount), preserving cardiovascular headroom for the run.

The trade-off: **train at higher cadence (85-95) for cardiovascular efficiency adaptation, then race at lower cadence (82-88) to save the cardiovascular bank for the run**. Athletes who train and race at the same cadence miss the buffer effect.

This is the rationale for the gap between §8.1's training cadence bands (85-95) and the race row (82-88). Both are correct for their context.

### 8.3 Cadence-drill session type (proposed — does not yet exist)

> **Status — does not exist in the engine.** Today there is no dedicated cadence-drill session helper. This is a NEW session type proposed alongside the cadence-prescription gap.

**Purpose:** deliberate low-cadence muscular-strength training on the bike. Develops force-per-pedal-stroke and bike-specific muscular endurance separately from the gym strength work. **This is the canonical home for low-cadence (~60-70 rpm) torque work** — the stimulus reclassified out of the §5.1 Long Ride default (2026-06-24); low cadence is a labeled torque-interval block here, never the endurance default.

**Structure:** WU 15 min at endurance cadence → 4-6 × 5 min at **50-70 rpm** in a hard gear, holding Z3 (sweet-spot wattage) with 3 min easy spin recovery → CD 10 min easy. Total ~60-75 min. Emphasize smooth power application across the entire pedal stroke; no mashing.

**Phase use:** Base and early build, 1× every 7-10 days when prescribed. **NOT** in race-specific or taper phases (the muscular cost competes with race-pace adaptation).

**Engine (proposed):** `cadenceDrillBike(day, reps, minEach, goalId)` in `session-factory.ts`, analogous to `tempoBike` / `sweetSpotBike`. Token namespace `bike_cadence_drill_*` (e.g. `bike_cadence_drill_5x5min_r3min`). Intent tag `cadence_drill`. plan_intent derivation in `derivePlanIntentCycling` (D-091) adds `cadence_drill` to the recognized canonical tags and `bike_cadence_drill_*` to the token prefix table.

**Coaching cue (for descriptions):** "Pick a gear that forces 55-65 rpm at sweet-spot power. Drive through the bottom of the stroke; no mashing. If you can spin above 70, the gear is too easy."

### 8.4 Implementation gap — where these targets need to land

Today's cycling pipeline carries no cadence prescription past the inline mentions in §5.1 and §5.9 (which themselves contradict §8.1 above). To close the gap, cadence targets need to reach three surfaces:

1. **Session descriptions** (`session-factory.ts` — all of `longRide` / `easyBike` / `tempoBike` / `sweetSpotBike` / `thresholdBike` / `vo2Bike` / `bikeOpeners` / `recoveryBike` etc.). Each session's description string should include a `Cadence: NN-NN rpm` clause. The §8.1 table is the authoritative source.

2. **Interval step targets** (`materialize-plan/index.ts` — the token-expansion path that turns `bike_ss_2x15min_r5min` into per-step structured output). Each work step should carry a `cadence_rpm: { min, max }` field on the structured intervals JSONB. Garmin export then surfaces it as a per-step target on the bike computer; the Performance tab can validate it post-ride against the `computed.intervals[i].avg_cadence_spm` value the analyzer already collects.

3. **LLM prompt context** (`_shared/cycling-v1/ai-summary.ts`). The display packet should expose `planned_cadence_rpm: { min, max }` per work interval AND `actual_cadence_rpm` (the analyzer already reads it). The STRUCTURED PLANNED MODE prompt rule (D-092) should add cadence-adherence to the lede option list ("held the 150-167 W target at 88-92 rpm — within the cadence band"). Cadence drift across the set is also a fatigue signal worth surfacing (drift down = muscular fatigue setting in; drift up = athlete spinning out the gear / fading effort).

The analyzer already records per-interval `avg_cadence_spm` in `computed.intervals[]` and per-lap `avg_cadence_spm` in `computed.raw_laps[]`. The data side is in place; the prescription side is the gap.

**Tracked as a punch-list item:** see POLISH-PUNCH-LIST §6 "Cycling Analyzer Display" → "Open" section.

---

## 9. Surface / environment

- **Default:** outdoor road. Wattage targets assume outdoor power (drivetrain efficiency factor ~0.98).
- **Indoor / smart trainer:** wattage is direct (no drivetrain loss). For ERG-mode trainers, hold prescribed wattage exactly. For non-ERG trainers (resistance-based / virtual rides), use perceived effort + cadence matched to the prescription.
- **Outdoor TT bike vs road bike:** TT position adds ~5-10% to wattage at the same RPE (better aero); the engine doesn't differentiate today. Athletes can manually adjust if comfortable.
- **Hilly route:** zone prescriptions are average-power-based. Climbs naturally spike above the prescribed band; recover on descents. Surface gradient absorbed in HR/RPE rather than constant wattage.
- **Group rides:** route-aware copy + TSS floor handles the variability; no fixed wattage prescription (effort controlled by the group). See §5.10.

No equipment tiers parallel to swim's pool gear inventory — cycling is gear-uniform across athletes (own bike, own trainer if applicable). Power meter is the exception: with one, wattage targets apply; without, RPE / HR fallback.

---

## 10. Race week protocol

### 10.1 A-race week

Per `RACE-WEEK-PROTOCOL.md §8`:

- Long ride: capped 0 (`longRideFloorHours('70.3','taper')` → 0). No standalone long ride.
- Easy ride: 30-45 min early week; optional cadence-focused spin.
- Openers: 30 min — `bikeOpeners(day, goalId)` — 1-2 days pre-race.
- Race day = the prescribed race-distance bike leg per `RACE-WEEK-PROTOCOL.md §8.3` (distance-aware via `science.ts:raceDaySessionSpec`).

**Race-week gating — shipped D-043 (2026-05-25):** `bikeOpeners` gate at `week-builder.ts:1461` now scopes to `phase === 'taper' && raceThisWeek`. Mirrors the swim-activation Gap-6 fix.

### 10.2 Post-race recovery week

- 0 quality rides (no sweet spot / threshold / VO2).
- Long ride 0 (`longRideFloorHours('70.3','recovery')` → 0).
- Easy rides only: 30-45 min at Z1 throughout the week.
- 70.3 strength: rebuild from recovery to base (`STRENGTH-PROTOCOL.md §7.3`).

---

## 11. Implementation pointers + research references

### 11.1 Files that need to read this spec

- `supabase/functions/generate-combined-plan/science.ts` — `longRideFloorHours`, `expectedBikeDurationHours`, `longRideHoursForWeek` lerp helper + `LONG_RIDE_RAMP_ENDPOINTS` table (mirrors the run arc — shipped D-028).
- `supabase/functions/generate-combined-plan/session-factory.ts` — `longRide`, `easyBike`, `sweetSpotBike`, `thresholdBike`, `vo2Bike`, `tempoBike`, `groupRideSession`, `groupRideQualityBikeSession` (threads `weekInPhase` for rep ramps — shipped D-028), `bikeOpeners` (race-week-only gate — shipped D-043), `brick`.
- `supabase/functions/generate-combined-plan/week-builder.ts` — `weekInPhaseForTimeline` call sites for long-ride + interval rep ramps + `bikeOpeners` race-week scoping (`week-builder.ts:1461`).
- `supabase/functions/generate-combined-plan/validate-training-floors.ts` — `maxLongRideMinutes` brick-bike accounting (already correct — bike-leg only; comment updated 2026-05-21 per RUN-PROTOCOL §5.7 / D-023).

### 11.2 Implementation status

| Surface | Status |
|---|---|
| Long ride within-phase ramp | **Shipped D-028 (2026-05-21)** — `longRideHoursForWeek` lerp per §4.5 endpoints |
| VO2 rep ramp (race-specific) | **Shipped D-028** — `clamp(3, 6, 3 + (weekInPhase − 1))` at `session-factory.ts:740` |
| Threshold rep ramp (build) | **Shipped D-028** — `clamp(2, 4, 2 + floor((weekInPhase − 1) / 2))` × 20 min at `session-factory.ts:743-744` |
| Sweet spot rep ramp (base) | **Shipped D-028** — same `clamp(2, 4, …)` formula × 15 min at `session-factory.ts:747` |
| Race-spec brick bike race-pace blocks | **Shipped D-049 (2026-05-25)** — `brick()` emits Z2 base + Z3 race-pace closing block for race-spec bricks ≥ 60 min |
| `bikeOpeners` race-week-only gating | **Shipped D-043 (2026-05-25)** — `phase === 'taper' && raceThisWeek` gate at `week-builder.ts:1461` |
| `limiter_sport='bike'` intensity dial | **Deferred — separate arc phase** (architectural-decision blocker, parallel to run Phase 4) |

### 11.3 Same pattern as swim arc + run arc

This arc consciously mirrors the swim arc (`c1c94cec` / `ef91c2ee` / `e723d246` / `95b94aba` / `f53bbf34`) and the run arc (`50921629` / `60c23de2` / D-023 commits):

- **ADR-0002 anti-regression:** `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` is the canonical within-phase index — NEVER `weekInBlock` (always 1 per ADR 0002).
- **Band-as-envelope lerp:** `hours = round-to-0.25hr(lerp(START × peak, PEAK × peak, phaseProgress(weekInPhase, RAMP_WEEKS)))`. Same Option A pattern that closed the swim flat-volume bug and the run flat-volume bug.
- **Two-peak-source rule:** the ramp source (`longRideHoursForWeek`, future) and the legacy peak-of-phase source (`longRideFloorHours`) move in lockstep. Phase 1 preserves both; future peak lifts (if any) update both together.
- **Slice 0 ratifies the spec; Slice 1 ships the engine wiring;** subsequent slices fill the per-session rep ramps + the race-pace-brick refinement.

### 11.4 Phased implementation plan

- **Phase 0** — this spec + close-out at draft acceptance. **Shipped 2026-05-21.**
- **Phase 1** — `weekInPhaseForTimeline` wiring through a new `longRideHoursForWeek` helper + rep ramps for `vo2Bike` / `thresholdBike` / `sweetSpotBike`. Band-as-envelope lerp for long-ride within-phase ramp. Regression test `bike-volume-ramp.test.ts` parallel to `swim-volume-ramp.test.ts` / `run-volume-ramp.test.ts`. **Shipped D-028 (2026-05-21).**
- **Phase 2** — Race-spec brick bike race-pace closing block formalization. **Shipped D-049 (2026-05-25).**
- **Phase 3** — `bikeOpeners` race-week-only gating (parallel to swim Gap-6 / activation-swim race-week scoping shipped in race-week Phase 4). **Shipped D-043 (2026-05-25).**
- **Phase 4 (DEFERRED, separate arc):** wire `limiter_sport='bike'` intensity dial. Architectural decision needed: additive vs. replacing the +7% TSS allocation (same blocker class as `limiter_sport='run'` / run-arc Phase 4 / `TICKET-B-WIRING-AUDIT.md` Field 2 §7).

---

## 11. Research references

- Coggan, A. & Allen, H. (2010). *Training and Racing with a Power Meter* (2nd ed.) — power-zone definitions; FTP-anchored periodization.
- Friel, J. (2018). *The Triathlete's Training Bible* (4th ed.) — 70.3 long-ride peak 2.5-3.5h; IM 5-7h.
- Seiler, S. & Tønnessen, E. (2009). *Intervals, Thresholds, and Long Slow Distance: the Role of Intensity and Duration in Endurance Training.* — VO2max interval design (3-5 min @ Z5); polarized 80/20 framework.
- Frank Overton / FasCat (2015 onward). *Sweet-spot training: the case for 88-94% FTP* — sweet-spot zone definition + repeatability case; muscular-endurance dose-response.
- McMillan, G. (2013). *Tempo as the bridge from sweet spot to threshold* — Z3 tempo periodization for endurance cyclists.
- Wilson, J. (2012). *Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises.* — bike ES ≈ 0.32 (vs run ES ≈ 0.94) for concurrent-training interference; informs §6.4 strength-pairing tolerances elsewhere in the engine.
- Existing engine surface: `docs/CYCLING-ANALYSIS-DESIGN.md` (analysis side — power-curve PRs, vs-similar, segment history; shipped via D-011..D-016).

---

## 12. Close-out decision record (Phases 0-3 shipped 2026-05-21 → 2026-05-25)

The cycling arc Phases 0-3 ratified and shipped the within-phase ramp curve for long ride + interval reps (D-028 / Phase 1), the race-spec brick race-pace closing block (D-049 / Phase 2), and the `bikeOpeners` race-week-only gate (D-043 / Phase 3) — parallel to swim arc Phases 0-3 / run arc Phases 0-3. Codified the seven session types shipped (long / easy / sweet spot / threshold / VO2 / tempo / brick / openers + group-ride anchor). Locked sub-decisions:

1. **70.3 long-ride peak = 3.0h** (matches `expectedBikeDurationHours`; Friel typical mid-range). Full IM long-ride peak = 6.0h. Within-phase ramp at these endpoints shipped D-028 (Phase 1).
2. **Sweet spot = 88-94% FTP; tempo = 82-88% FTP.** Distinct sessions despite overlap zone. Engine copy aligned (`sweetSpotBike` text says "88-94% FTP (Zone 3-4)"; `tempoBike` text says "82-88% FTP — comfortably hard").
3. **Group-ride anchor is route-aware** (`group_ride_route_snapshot` drives TSS floor + climbing copy). Wired today; spec ratifies the contract.
4. **`bikeOpeners` race-week-only gate** shipped D-043 (Phase 3) — `phase === 'taper' && raceThisWeek` at `week-builder.ts:1461`.
5. **Phase 4 (`limiter_sport='bike'` intensity dial) deferred to its own arc** — separate architectural-decision blocker (additive vs. replace the +7% TSS allocation).

Full rationale → the close-out D-NNN at Phase 0 acceptance; verified-state → ENGINE-STATE "Solid" at Phase 0 acceptance (same pattern as D-019 / D-020 / D-023 / D-025).
