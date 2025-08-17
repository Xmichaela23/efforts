### Deterministic Week Scheduler

This module builds a deterministic, rules-driven weekly schedule for a run-focused plan with integrated strength and optional mobility.

Entry points:
- `placeWeek(params: SimpleSchedulerParams): PlaceResult` in `simpleScheduler.ts`
- `buildWeekFromDropdowns(weekNumber, phase, params)` returns a `SkeletonWeek` with `policies`

#### Inputs
`SimpleSchedulerParams` (see `types.ts`):
- `availableDays: Day[]` — which days user can train (`'Mon'..'Sun'`)
- `longRunDay: Day` — fixed long run day
- `level: 'new'|'experienced'|'veryExperienced'` — sets quality run count (1 if new, else 2)
- `strengthTrack: 'power'|'endurance'|'hybrid'` — maps to strength pool
- `strengthDays: 2|3` — requested weekly strength frequency
- `preferredStrengthDays: Day[]` — soft preference list for strength placement
- `includeMobility?: boolean` — whether to place mobility
- `mobilityDays?: 0|1|2|3|4|5` — how many mobility slots to add (optional slots)
- `preferredMobilityDays?: Day[]` — preferred days for mobility

#### Outputs
`PlaceResult`:
- `slots: Slot[]` — each `{ day: Day, poolId: PoolId, optional?: boolean }`
- `notes: string[]` — human-readable scheduling decisions and warnings

When used via `buildWeekFromDropdowns`, `slots` are embedded into a `SkeletonWeek` alongside `policies`:
- `maxHardPerWeek: 3`
- `minRestGap: 24` (hours)
- `taperMultiplier` if `phase === 'taper'`

#### Pools and hardness
`PoolId` values (see `types.ts`):
- Run: `run_long_pool`, `run_speed_vo2_pool`, `run_threshold_pool`, `run_easy_pool`
- Strength: `strength_power_pool`, `strength_endurance_pool`, `strength_hybrid_pool`
- Mobility: `mobility_pool`

Hardness (used for spacing and caps):
- Hard = `run_speed_vo2_pool`, `run_threshold_pool`, `run_long_pool`, any `strength_*` pool
- Easy = `run_easy_pool`, `mobility_pool`

Global constants:
- `ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']`
- `MAX_HARD_PER_WEEK = 3`

#### Deterministic placement rules (in order)
1) Long run
- Place `run_long_pool` on `longRunDay` (no movement).

2) Quality runs (VO2 then Threshold)
- Determine `wantQual = (level === 'new') ? 1 : 2`.
- Preferred target days: `Tue`, `Thu`.
- For each target, choose the nearest day that is not adjacent to the long run or previously chosen quality (`nearestNonAdjacent`).
- If still short, choose the first available day that is not adjacent to the long run or chosen qualities (`firstWithBuffers`).
- First quality is `run_speed_vo2_pool`; second is `run_threshold_pool`.

3) Strength sessions (track-aware) — new, stricter logic
- Map `strengthTrack` to strength pool: `power → strength_power_pool`, `endurance → strength_endurance_pool`, `hybrid → strength_hybrid_pool`.
- Build a protected ring: all quality days and the long run, plus their neighbors (no strength placed there unless forced).
- Selection order until `strengthDays` is met:
  - Preferred strength days that are available and not in the protected ring and not the long run.
  - Safe standalone days: available, not in protected ring, not the long run.
  - Stack on quality days (never on long run at this step).
  - Neighbors of quality days, excluding the long run and its neighbors.
  - Last-resort: stack on the long run day; add a clear warning note.
- Add chosen days as strength slots with the mapped pool.

4) Easy run fill
- On remaining `availableDays` with no slot, place `run_easy_pool` and mark `optional: true`.

5) Mobility (optional)
- If `includeMobility` and `mobilityDays > 0`:
  - Try `preferredMobilityDays` that are available.
  - Fill remaining from the week order on available days.
  - All mobility slots are `optional: true`.

6) Gating and spacing enforcement
- Hard-day cap: while hard-day count > `MAX_HARD_PER_WEEK`, remove a non-preferred strength first; otherwise remove any strength and add a note.
- No-adjacent-hard constraint: if two consecutive days are hard:
  - Try to move an easy run out of the conflict day to a free available day.
  - Try to move a strength session to a safe day outside the protected ring.
  - If neither is possible, stack strength onto the previous hard day and add an AM/PM guidance note.

Notes are appended whenever we must stack or remove to satisfy caps/spacing.

#### Guarantees and invariants
- Long run is preserved on the specified day.
- Quality days are not adjacent to each other or the long run if any non-adjacent day exists.
- Maximum distinct hard days per week is capped at 3 (long, quality, strength combined). If needed, strength frequency is reduced.
- Strength is never placed on the long run day except as last resort, and this is always noted.
- Preferred strength days are honored only when they do not violate the protected ring and spacing rules.
- Optional slots (easy, mobility) are treated as fillers and are first to move during conflict resolution.

#### Types (abridged)
```ts
export type Day = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun';

export type PoolId =
  | 'run_long_pool'
  | 'run_speed_vo2_pool'
  | 'run_threshold_pool'
  | 'run_easy_pool'
  | 'strength_power_pool'
  | 'strength_endurance_pool'
  | 'strength_hybrid_pool'
  | 'mobility_pool';

export interface SimpleSchedulerParams {
  availableDays: Day[];
  longRunDay: Day;
  level: 'new'|'experienced'|'veryExperienced';
  strengthTrack: 'power'|'endurance'|'hybrid';
  strengthDays: 2|3;
  preferredStrengthDays: Day[];
  includeMobility?: boolean;
  mobilityDays?: 0|1|2|3|4|5;
  preferredMobilityDays?: Day[];
}

export interface Slot { day: Day; poolId: PoolId; optional?: boolean }
export interface PlaceResult { slots: Slot[]; notes: string[] }
```

#### Example
```ts
import { placeWeek } from './simpleScheduler';

const { slots, notes } = placeWeek({
  availableDays: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  longRunDay: 'Sun',
  level: 'experienced',
  strengthTrack: 'endurance',
  strengthDays: 3,
  preferredStrengthDays: ['Mon','Wed','Fri'],
  includeMobility: true,
  mobilityDays: 2,
  preferredMobilityDays: ['Thu','Sat']
});

// slots → ordered by `ORDER`, e.g.
// [
//   { day: 'Tue', poolId: 'run_speed_vo2_pool' },
//   { day: 'Thu', poolId: 'run_threshold_pool' },
//   { day: 'Sun', poolId: 'run_long_pool' },
//   { day: 'Mon', poolId: 'strength_endurance_pool' },
//   { day: 'Wed', poolId: 'strength_endurance_pool' },
//   { day: 'Fri', poolId: 'strength_endurance_pool' },
//   { day: 'Sat', poolId: 'run_easy_pool', optional: true },
//   { day: 'Thu', poolId: 'mobility_pool', optional: true },
//   { day: 'Sat', poolId: 'mobility_pool', optional: true }
// ]
// notes → [ 'Reduced hard-day count by ...', 'Stacked day on Tue — Run AM, Strength PM...', ... ]
```

#### Integration notes
- `buildWeekFromDropdowns` wraps `placeWeek` and produces a `SkeletonWeek` with scheduling `policies` for downstream composers.
- Hardness and spacing checks occur inside the scheduler; downstream components should treat `notes` as user-facing guidance.
- To adjust global behavior: see `MAX_HARD_PER_WEEK`, `ORDER`, and helpers `nearestNonAdjacent`, `firstWithBuffers`.


#### Global constants (cross-discipline)
- `MAX_HARD_PER_WEEK = 3`
- `minRestGapHours = 24`

These apply across all disciplines combined (run, bike, swim, strength, bricks).

#### Hard vs Easy classification
- **Hard pools**: `*_vo2_pool`, `*_threshold_pool`, `run_long_pool`, `bike_long_pool`, any `strength_*`, any `brick_*`
- **Easy pools**: `*_endurance_pool`, `run_easy_pool`, `swim_technique_pool`, `mobility_pool`

#### Bricks
- Brick pools are first-class, e.g., `brick_bike_run_threshold`, `brick_bike_run_endurance`.
- Each brick counts as ONE hard day for caps/spacing.
- Bricks participate in "no adjacent hard" like any other hard day.

#### Long-day stacking
- Never schedule long run and long ride on the same day.
- Strength stacking on long run/long ride is LAST RESORT ONLY and must emit a warning note.
- Preferred stacking target is QUALITY days (AM/PM split), not long days.

#### Deterministic rotations (composer/templates)
- For each pool, select variant deterministically: `variantIndex = (weekNum - 1) % NUM_VARIANTS`.
- Examples:
  - VO2: A/B/C rotate by `weekNum`
  - Threshold: A/B/C rotate by `weekNum`
  - Strength tracks: A/B/C rotate by within-week index, optionally offset by `weekNum`
- No randomness; tie-breakers use fixed order.

#### Strength baselines (no RPE)
- Strength loads prescribed as %1RM only.
- 1RM must be tested or estimated via a single submax formula (Epley): `est1RM = weight * (1 + reps/30)`.
- Store per-lift 1RMs for SQ, DL, BP, OHP.

#### Global spacing rules (restated for clarity)
- No adjacent hard days across ANY discipline.
- Weekly cap = `MAX_HARD_PER_WEEK` distinct hard days.
- Protected ring for placement = (all long + quality days) ±1 day.
- Strength placement order: preferred → safe standalone → stack on QUALITY → (last resort) stack on LONG with note.


#### Tri/Hybrid anchors (spec-only params)
Extend the scheduler inputs to support multi-discipline anchoring and brick requests:

```ts
export interface TriHybridSchedulerParams /* extends SimpleSchedulerParams */ {
  // Existing SimpleSchedulerParams
  availableDays: Day[];
  longRunDay: Day;
  level: 'new'|'experienced'|'veryExperienced';
  strengthTrack: 'power'|'endurance'|'hybrid';
  strengthDays: 2|3;
  preferredStrengthDays: Day[];
  includeMobility?: boolean;
  mobilityDays?: 0|1|2|3|4|5;
  preferredMobilityDays?: Day[];

  // New cross-sport anchors
  longRideDay: Day;
  preferredBikeQualityDays: Day[];  // e.g., ['Tue','Thu']
  preferredSwimQualityDays: Day[];  // e.g., ['Wed','Sat']
  brickRequests?: Array<{ day: Day; variant: 'endurance'|'threshold' }>; // optional
}
```

#### Global protected ring (cross-sport)
- Build the set of hard anchors from: `longRunDay`, `longRideDay`, any placed run/bike/swim qualities, and any brick days.
- Compute `protectedRing = ±1 day around every hard anchor`, deduped.
- Use `protectedRing` to constrain strength standalone placement and movement during adjacency resolution.

#### Cross-discipline invariants
- Never put `longRunDay` and `longRideDay` on the same calendar day.
- Strength may stack on QUALITY days (AM/PM) but not on LONG days or BRICK days, except as last resort (emit a warning note).
- Bricks count as one hard day and fully participate in cap/spacing.

#### Deterministic placement order (cross-sport)
1) Place long anchors: `run_long_pool` on `longRunDay`, `bike_long_pool` on `longRideDay` (enforce never same day).
2) Place RUN quality (VO2 then Threshold) on preferred targets using `nearestNonAdjacent` with respect to the current `protectedRing`.
3) Place BIKE quality (VO2 then Threshold) similarly, honoring `protectedRing`.
4) Place SWIM quality (treat `swim_threshold_pool` as hard; `swim_technique_pool` is easy) respecting `protectedRing`.
5) Place BRICK requests on their specified day if legal; otherwise emit a note and skip.
6) Place STRENGTH: preferred → safe standalone (not in `protectedRing`, not long/bricks) → stack on QUALITY → last resort long day (emit warning).
7) Fill EASY: `*_endurance_pool`, `run_easy_pool`, `swim_technique_pool` on remaining available days, marked optional.
8) Gating (cap): ensure distinct hard days ≤ `MAX_HARD_PER_WEEK` globally. If exceeded, remove non‑preferred, non‑stacked strength first; anchors (long, declared qualities, bricks) are preserved unless explicitly allowed.
9) Adjacency: resolve via move easy → move strength (avoid `protectedRing`) → stack on the prior QUALITY with a note.

#### Notes (must emit in these cases)
- Stacked on a LONG day (last resort only).
- Stacked due to adjacency resolution.
- Dropped strength to meet global cap.
- Brick conflict (requested but unsafe/blocked).

#### Minimal acceptance checks
- Cross-sport anchors (open week):
  - Sun long run, Sat long ride, run VO2 Tue, bike Threshold Thu, strength=2 pref Mon/Fri → ≤3 distinct hard days; strength stacks on quality if needed; no strength on Sat/Sun; no adjacent hard.
- Brick handling:
  - `brick_bike_run_threshold` on Wed → counts as 1 hard; included in protected ring; strength does not stack on it unless last resort (note).
- Cap enforcement:
  - Over-subscribe hard candidates → reduces strength first with note; anchors preserved.
- Long-day protection:
  - With wide availability: no strength on long days; with constrained availability: long-day stack only with warning.
- Deterministic rotations (composer):
  - With A/B/C variants defined, Week 1..5 → A,B,C,A,B for VO2/Threshold/Strength; taper behavior per README.


### Tri / Hybrid Extensions (Spec Only)

#### Additional Scheduler Params
// Added to SimpleSchedulerParams (spec-only; not implemented here)
```ts
longRideDay?: Day;                           // optional: anchor long ride
preferredBikeQualityDays?: Day[];            // e.g., ['Tue','Thu']
preferredSwimQualityDays?: Day[];            // e.g., ['Wed','Sat']
brickRequests?: Array<{                      // optional brick anchors (deterministic)
  day: Day;
  variant: 'endurance' | 'threshold';
}>;
```

#### Hard vs. Easy (Global)
- Hard: any `*_vo2_pool`, `*_threshold_pool`, any `*_long_pool`, any `strength_*`, any `brick_*`
- Easy: any `*_endurance_pool`, `run_easy_pool`, `swim_technique_pool`, `mobility_pool`

#### Global Policies (All Disciplines Combined)
```
MAX_HARD_PER_WEEK = 3
minRestGapHours = 24
```
- No adjacent hard days across run/bike/swim/strength/bricks.
- Cap enforcement: if adding a hard session would exceed the cap:
  - Prefer stacking strength on an existing QUALITY day (AM/PM split).
  - If still over cap or blocked by the protected ring, reduce strength frequency and emit a note.

#### Protected Ring (Global)
- Build from all anchored hard days (run long, ride long, any placed quality, any brick).
- `protectedRing = (each anchored hard day) ±1 day`, de-duplicated.
- Strength placement must avoid the protected ring unless falling back to stacking rules.

#### Cross-Discipline Invariants
- Never schedule long run and long ride on the same day (no exceptions).
- Strength may stack on quality days; strength on long days is last resort only and always emits a warning note.
- Bricks are first-class hard days:
  - Count as one hard day for caps/spacing.
  - Do not stack strength onto a brick day except last resort (note).

#### Deterministic Placement Order
1) Place `longRunDay`, `longRideDay` (enforce “never same day”).
2) Place run quality (VO₂ then Threshold) on preferred targets using `nearestNonAdjacent` w/ the global protected ring.
3) Place bike quality similarly on its targets with the same ring and adjacency rules.
4) Place swim quality (treat `swim_threshold_pool` as hard; `swim_technique_pool` is easy).
5) Place bricks on requested days if legal; otherwise skip and emit a note.
6) Place strength:
   - preferred strength days → safe standalone (not in ring; not long; not brick) → stack on QUALITY → last resort stack on LONG (warn).
7) Fill easy (run/bike endurance, swim technique) on remaining available days (optional).
8) Gating:
   - Enforce global cap ≤ `MAX_HARD_PER_WEEK`. Remove non-preferred, non-stacked strength first; anchors/bricks are preserved unless explicitly allowed to drop.
9) Adjacency resolve:
   - move easy → move strength (respect global ring) → stack on the previous quality day (emit note).

#### Notes (Must Emit On)
- Stacked on a long day (last resort).
- Stacked due to adjacency resolution.
- Removed strength to meet hard-day cap.
- Brick requested but skipped due to conflict/unsafe placement.

#### Deterministic Rotations (Composer, not Scheduler)
- Each pool has A/B/C variants; selection is deterministic:
  - `variantIndex = (weekNum - 1) % NUM_VARIANTS` (e.g., Week 1→A, 2→B, 3→C, 4→A).
- Define taper behavior explicitly (freeze rotation vs. continue rotation) and apply consistently.

#### Strength Baselines (No RPE)
- Loads prescribed as %1RM only.
- 1RM must be tested or estimated via a single formula (Epley):
  - `est1RM = weight * (1 + reps/30)`
- Store per-lift 1RM for SQ, DL, BP, OHP. Document rounding (e.g., nearest 2.5 kg / 5 lb).

#### Acceptance Checks (Deterministic)
- Cross-sport anchors (open week)
  - Sun long run, Sat long ride, run VO₂ Tue, bike Threshold Thu, strength=2 preferred Mon/Fri →
  - ≤3 distinct hard days; no adjacent hard; strength stacks on quality if needed; no strength on Sat/Sun unless last resort (with note).
- Brick handling
  - Brick `brick_bike_run_threshold` on Wed → counts as 1 hard day; included in protected ring; strength does not stack on it unless last resort (note).
- Global cap
  - Over-subscribe hard candidates → cap enforced by removing non-preferred, non-stacked strength first; note emitted; anchors/bricks preserved.
- Long-day protection
  - With wide availability: no strength on long days; if constrained, long-day stack only with warning.
- Rotations
  - With A/B/C variants present, Weeks 1..5 → A, B, C, A, B for VO₂/Threshold/Strength; taper rule behaves as documented.

Keep `Scheduler` and `TrainingEngine` separate per existing design. Scheduler never reads baselines or templates; it only places slots and emits notes. Composer/Engine handles templates, intensities, and pre/post mobility.


