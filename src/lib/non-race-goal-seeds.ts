// Cut C — the goal-seeds-everything helper (SPEC-per-discipline-periodization.md §13 + §13.1).
//
// Pure + unit-tested. A picked goal (+ optional "which discipline?" sub-choice) seeds, in one move:
// goal_type + per_discipline_posture + sport + strength_protocol — INTERSECTED with the athlete's actual
// disciplines (never prescribe a sport they don't do; a runner's "Build endurance" never maintains
// swim/bike). Strength is always present (core to every athlete profile). This is the consumer the Cut A
// wiring was built for.

export type Discipline = 'swim' | 'bike' | 'run' | 'strength';
export type Posture = 'develop' | 'maintain' | 'out';
export type NonRaceGoalId =
  | 'build_endurance' | 'build_speed' | 'get_stronger' | 'build_muscle' | 'maintain' | 'starting_over'
  // ⛔ `marathon` IS A RACE GOAL LIVING IN THE NON-RACE UNION, AND THAT IS DELIBERATE (2026-08-04).
  //
  // The Focus builder is the flow; a race is a Focus goal that additionally carries a date and a
  // distance. Giving it its own union would have meant a second seed table, a second step machine
  // and a second payload assembler — which is how this codebase grew four plan generators. It rides
  // the existing machinery and diverges at exactly two points: `getSteps` inserts a `race` step, and
  // `assemblePayload` sends `goal_type: 'event'` + `target_date` + `distance` instead of nulls.
  //
  // ⚠️ The TYPE NAME is now wrong for this member. Renaming it touches ~12 files and every goal
  // stored as `goal_focus`; left alone on purpose until a slice needs the rename for its own sake.
  | 'marathon';

export type GoalSeed = {
  goal_type: 'capacity' | 'maintenance';
  per_discipline_posture: Partial<Record<Discipline, Posture>>;
  sport: string;
  strength_protocol?: string;
};

const ENDURANCE: Discipline[] = ['swim', 'bike', 'run'];

export const GOAL_LABELS: Record<NonRaceGoalId, string> = {
  build_endurance: 'Build endurance',
  build_speed: 'Build speed',
  // ⛔ THE ATHLETE-FACING NAME IS "STRONG FOCUS". The id stays `get_stronger` — routing, specs and
  // every doc key off it — but the label the athlete reads is this one, in ONE place.
  // It said 'Get stronger', and `NonRaceBuilder` special-cased the goal CARD to display
  // "Strength Focus" while this value still flowed into the goal name, the block summary and the
  // duration copy. So the athlete picked "Strength Focus" and was handed a plan called
  // "Get stronger". Fixed here rather than by adding a second special case.
  //
  // ⛔ "STRENGTH FOCUS" → "STRONG FOCUS" (Michael, 2026-08-05). STRENGTH is the DISCIPLINE and it
  // keeps that name on the Train card, beside Run Focus / Ride Focus / Athletic Focus. STRONG is the
  // BLOCK — the tier picked one screen later (D-383), and the block is what this label names. Three
  // names for one thing in four taps ("Strength Focus" card → "Strength" tier screen → pick "Strong"
  // → "Strength Focus · 12 weeks") is what this closes.
  //
  // ⚠️ AND IT IS A CONSTANT ONLY WHILE STRONG IS THE ONLY LIVE TIER. Heavy and Definition are the
  // same `get_stronger` goal with a different tier, so the day either ships this must READ THE TIER
  // ("Heavy Focus", "Definition Focus") rather than stay hardcoded. The tier does not reach the
  // payload yet (D-383 — `strength_tier` is taken by the EQUIPMENT tier), which is the only reason a
  // constant is honest today. Wire the tier, then derive this.
  get_stronger: 'Strong Focus',
  build_muscle: 'Build muscle + train',
  maintain: 'Maintain',
  starting_over: 'Starting over',
  marathon: 'Marathon',
};

// Only these 3 need a "which discipline develops?" sub-choice; the other 3 are fully determined.
export const GOALS_NEEDING_DISCIPLINE: NonRaceGoalId[] = ['build_endurance', 'build_speed', 'starting_over'];

// §13.2 — per-goal length floor (minimum target_weeks): the shortest block where the goal's adaptation
// shows in a retest. Science-anchored, not picked (see SPEC §13.2 citations). Keyed by the goal (the
// adaptation intent), NOT the edited posture — editing which disciplines develop doesn't change the
// adaptation's timeline.
export const LENGTH_FLOOR_WEEKS: Record<NonRaceGoalId, number> = {
  build_endurance: 8, // ~6-8wk aerobic adaptation + the 6wk base ramp
  build_speed: 6,     // ~6wk threshold/VO2 + neuromuscular
  get_stronger: 8,    // ~2 deload cycles + measurable 1RM (SCIENCE-5x5 §2-3)
  build_muscle: 12,   // hypertrophy is structural/slower (~8-12wk, Schoenfeld)
  maintain: 4,        // minimal coherent maintenance block
  starting_over: 6,   // re-adaptation is faster than from scratch
  // ⛔ NOT THE MARATHON FLOOR, AND NOTHING READS IT ON THE RACE PATH. A race block's length is the
  // distance from today to race day (`create-goal…:3293`), so the length step is skipped and this
  // number never reaches a slider. The real level-scaled floor is `MIN_WEEKS` on the server
  // (`create-goal…:226`), which is currently unreachable — see the CAPABILITY-MAP race section. This
  // value exists only because the record is keyed by the full goal union.
  marathon: 10,
};
export function floorForGoal(goal: NonRaceGoalId | null): number {
  return goal ? LENGTH_FLOOR_WEEKS[goal] : 4;
}

// §13 commitment tier — the volume envelope as a qualitative tier with HOURS AS OUTPUT (the research:
// ask "what can you sustain," not "how many hours"). The tier maps onto the existing
// `weekly_hours_available` lever (→ `scaledWeeklyTSS` hour-factor) — it sits ON the CTL engine, it does
// NOT fight it. Defaulted to the lower end (light).
export type CommitmentTier = 'light' | 'moderate' | 'committed';
export const COMMITMENT_HOURS: Record<CommitmentTier, number> = {
  light: 6,
  moderate: 9,
  committed: 12,
};
export function hoursForTier(tier: CommitmentTier): number {
  return COMMITMENT_HOURS[tier];
}
export const COMMITMENT_TIERS: Array<{ id: CommitmentTier; label: string; blurb: string }> = [
  { id: 'light', label: 'Light', blurb: 'Fits around a busy life' },
  { id: 'moderate', label: 'Moderate', blurb: 'A steady, sustainable rhythm' },
  { id: 'committed', label: 'Committed', blurb: 'Training is a priority right now' },
];

// Cut G — the schedule cluster. preferred_days assembly, POSTURE-GATED: a long day only for a present
// (not-out) endurance discipline; the hard-day anchor (the kept club session) emits a quality_* day ONLY
// when a day is set — unanchored quality/easy slots are deliberately omitted so the planner places them
// (mirrors ArcSetupWizard's design). Strength days are the co-equal Mon/Thu when strength is present.
export type DayName = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type ScheduleInput = {
  /** The days the athlete said they can train. Absent/empty → the engine picks. */
  trainingDays?: DayName[];
  /** Days declared as FULL rest — nothing at all, not even a lift. Asked, not inferred. */
  restDays?: DayName[];
  longRunDay?: string;
  longRideDay?: string;
  /** The kept hard session PER DISCIPLINE — a club run AND a chaingang can both be true of one
   *  athlete. `preferred_days` always had room for both (`quality_run` + `quality_bike`); the old
   *  single `anchorDiscipline` + `anchorDay` was the narrower shape and forced a choice the data
   *  model never required. Both forms are accepted; this one wins where they overlap. */
  qualityDays?: Partial<Record<'run' | 'bike', string>>;
  /**
   * ⛔ THE SAME STANDING SESSION, DECLARED EASY — AND IT IS A DIFFERENT PIN, NOT A WEAKER ONE.
   * `ArcSetupWizard.tsx:1743` has asked this since it shipped: *"Easy / social long run —
   * conversational pace. Counts as aerobic. The planner adds a separate quality session."* A club
   * night is not automatically a hard night, and filing a social run under `quality_run` tells the
   * engine to put its intervals on the one evening the athlete is jogging and talking.
   *
   * ⚠️ Michael, 2026-08-05: *"we need to juggle whether run club is quality day."* The marathon
   * intake assumed hard. This is the slot the honest answer goes in.
   */
  easyDays?: Partial<Record<'run' | 'bike', string>>;
  anchorDiscipline?: 'run' | 'bike' | null;
  anchorDay?: string;
  /**
   * Which ground the hard RUN happens on — the athlete's pick, only meaningful alongside
   * `qualityDays.run`. Absent → the 3-minute hill, the session every block built before this.
   *
   * ⚠️ Kept as a plain string rather than importing the engine's `HardRunTerrain` union: this file
   * is client-side and the union lives in a Deno edge module. `generate-strength-plan` validates
   * against its own allowlist at the door and treats an unknown value as absent, so a typo here
   * degrades to the 3-minute hill rather than to a session that does not exist.
   */
  qualityRunTerrain?: 'hill_3min' | 'hill_short' | 'treadmill' | 'flat';
};
/**
 * ⛔ THE TYPE IS THE ENFORCEMENT (§0g). `strength` is banned at the type level, not by convention.
 *
 * Three separate branches wrote an engine-chosen value into `preferred_days.strength` independently
 * — #131 fixed it on the combined path with the reason written down, and the strength path
 * reintroduced it months later anyway. **Convention already failed, three times.** So the shape a
 * builder can return no longer has room for the field: adding it back is a compile error, not a
 * review catch.
 *
 * Engine choices go to `strength_optimizer_slots` (see `buildStrengthDefaultSlots`).
 */
export type AthletePreferredDays = {
  [k: string]: string | string[] | undefined;
  /** ⛔ NEVER. `preferred_days` means "the athlete chose this" and nothing asks for strength days. */
  strength?: never;
};

export function buildPreferredDays(
  posture: Partial<Record<Discipline, Posture>>,
  sched: ScheduleInput,
): AthletePreferredDays {
  const out: AthletePreferredDays = {};
  const present = (d: Discipline) => posture[d] != null && posture[d] !== 'out';
  if (present('run')) out.long_run = sched.longRunDay || 'sunday';
  /**
   * ⛔ THE DAYS THE ATHLETE CAN TRAIN (2026-08-06). The rest are theirs — rest is the REMAINDER, not
   * a second question, which is why this is one list and not two.
   *
   * ⚠️ OMITTED WHEN UNSET, like every other key in this bag: absent means "the engine picks", which
   * is the behaviour every block built before this ran on. `assign-days.ts` treats it as a
   * preference and will spend a rest day before it drops a session.
   */
  if (sched.trainingDays && sched.trainingDays.length > 0) out.training_days = [...sched.trainingDays];
  // ⛔ REST IS ASKED, NOT INFERRED (2026-08-06). The leftovers are not all rest — a strength session
  // lands on one of them — so "the days you did not pick" and "the days you want off" are different
  // answers, and only the athlete has the second one.
  if (sched.restDays && sched.restDays.length > 0) out.rest_days = [...sched.restDays];
  if (present('bike')) out.long_ride = sched.longRideDay || 'saturday';
  // The kept club session = a hard day. Posture-gated both ways: a quality day for a discipline the
  // athlete dropped is not a day, it is a leftover.
  if (sched.anchorDiscipline && sched.anchorDay && present(sched.anchorDiscipline)) {
    out[`quality_${sched.anchorDiscipline}`] = sched.anchorDay;
  }
  for (const d of ['run', 'bike'] as const) {
    const day = sched.qualityDays?.[d];
    if (day && present(d)) out[`quality_${d}`] = day;
  }
  // ⛔ THE TERRAIN OF THE HARD RUN — it belongs HERE and nowhere else, because it is the one fact in
  // this session only the athlete has. Whether there is a climb outside their door that they can run
  // hard for three minutes is not derivable from posture, sport, mileage or history, and
  // `preferred_days` is precisely the bag for "the athlete chose this" (see the `strength?: never`
  // note above — engine choices are banned from it for the same reason athlete choices belong).
  //
  // ⚠️ RIDES DO NOT GET ONE. The hard ride is Helgerud 4 × 4 whether it is a turbo, a chaingang or a
  // climb — same session, so there is no question to ask and no key to write.
  // ⚠️ OMITTED WHEN UNSET, like every other key here. Absent means the 3-minute hill, which is what
  // every block built before this existed, so an un-answered menu degrades to the shipped session.
  if (sched.qualityRunTerrain && sched.qualityDays?.run && present('run')) {
    out.quality_run_terrain = sched.qualityRunTerrain;
  }
  // The kept session declared EASY. Same posture gate, same "omit when unset" rule — an unpinned
  // easy day is the planner's to choose, and writing one anyway would invent a preference.
  // ⚠️ `quality_*` wins on a collision: the two cannot both describe one day, and the hard reading
  // is the constraining one. The intake only ever sets one of them.
  for (const d of ['run', 'bike'] as const) {
    const day = sched.easyDays?.[d];
    if (day && present(d) && !out[`quality_${d}`]) out[`easy_${d}`] = day;
  }
  // ⛔ THE `develop` SEED WAS DELETED 2026-07-27. It set Mon/Tue/Thu/Fri "to match the engine grid so
  // the intake header doesn't contradict the plan" — and that WAS the grid, back when `MAIN_LIFTS`
  // was hardcoded to those days. The solver places dynamically now, so the seed asserted a schedule
  // the plan did not have: a real block ran Mon/Tue/Wed/Fri under a summary reading Mon/Tue/Thu/Fri.
  //
  // ⛔ AND NOTHING ASKS THE ATHLETE FOR STRENGTH DAYS ON THIS PATH. `preferred_days` means "the
  // athlete's choice", so a value derived from POSTURE and presented there is a fabricated
  // preference — attributing to the athlete a decision the engine made. That is the exact bug
  // #131 fixed on the combined path (`create-goal:1042`: *"Persisting it in `preferred_days` made
  // engine defaults surface as Athlete preference"*), which routes engine days through
  // `strength_optimizer_slots`, labelled "scheduled by app". This path reintroduced it.
  //
  // The placed days are written back by `create-goal` after the plan exists — as engine output,
  // under a key that says so.
  // ⛔ NOTHING WRITES `preferred_days.strength` ANY MORE — see §0g. The maintain/support default
  // (Mon/Thu) is a legitimate ENGINE DEFAULT that seeds the optimizer's preferred-day bias, and the
  // value is fine; the FIELD was the lie. `preferred_days` means "the athlete chose this", and no
  // path on this screen asks for strength days.
  //
  // It moves to `strength_optimizer_slots`, which #131 already built and the export already labels
  // "scheduled by app" — the third caller to use it rather than a third channel. Emitted by
  // `buildStrengthDefaultSlots` below so the caller places it beside `preferred_days`, not inside it.
  if (false) {
  }
  return out;
}

/**
 * ⛔ THE ENGINE'S STRENGTH-DAY DEFAULT, in the channel that says the engine chose it (§0g).
 *
 * Returns `null` for `develop` (Strength Focus): the solver places those four days from the
 * athlete's own anchors, and `create-goal` writes the PLACED days back after the plan exists. A
 * guess here would be overwritten anyway, and would be wrong in the meantime.
 */
export function buildStrengthDefaultSlots(
  posture: Partial<Record<Discipline, Posture>>,
): string[] | null {
  const p = posture.strength;
  if (!p || p === 'out') return null;
  if (p === 'develop') return null;
  return ['monday', 'thursday'];
}

// sport from the endurance disciplines that are present (not out): all 3 → triathlon; else run>bike>swim.
// This is what makes the §13.1 strength split fall out for free — strength-focus goals (swim out) are
// never tri-shaped, so their develop strength resolves to the general developer, not triathlon_performance.
export function sportFromPosture(p: Partial<Record<Discipline, Posture>>): string {
  const present = ENDURANCE.filter((d) => p[d] && p[d] !== 'out');
  if ((['swim', 'bike', 'run'] as Discipline[]).every((d) => present.includes(d))) return 'triathlon';
  return (['run', 'bike', 'swim'] as Discipline[]).find((d) => present.includes(d)) ?? 'run';
}

// §13.1 strength DEVELOP default — equipment-aware, the honest coherent standalone default. Barbell/DB →
// five_by_five (full-body, balanced, real periodization, name matches). Bodyweight/bands → durability
// (5×5's linear %1RM needs loadable resistance; durability progresses via tempo/RIR/tiers). Tri-shaped
// develop → triathlon_performance. Replaces the old upper_aesthetics default, which is a concurrent run-
// overlay SLOT (1 upper + 1 lower at 2×/wk — thin standalone, name over-promises; see the audit).
export function defaultStrengthDeveloper(sport: string, equipmentTier?: string): string {
  if (sport === 'triathlon') return 'triathlon_performance';
  return equipmentTier === 'bodyweight_bands' ? 'durability' : 'five_by_five';
}

// develop → the equipment-aware default developer; maintain → durability (run) / triathlon (tri); out → none.
function strengthProtocolFor(s: Posture, sport: string, equipmentTier?: string): string | undefined {
  if (s === 'develop') return defaultStrengthDeveloper(sport, equipmentTier);
  if (s === 'maintain') return sport === 'triathlon' ? 'triathlon' : 'durability';
  return undefined;
}

export const TWO_BUILD_CEILING = 2;

// Count of disciplines set to develop (for the two-build interference ceiling).
export function developCount(p: Partial<Record<Discipline, Posture>>): number {
  return Object.values(p).filter((v) => v === 'develop').length;
}

// May `d` be set to develop? Yes if it already is, or if under the ceiling. Used to BLOCK a 3rd develop.
export function canSetDevelop(p: Partial<Record<Discipline, Posture>>, d: Discipline): boolean {
  return p[d] === 'develop' || developCount(p) < TWO_BUILD_CEILING;
}

// Derive the plan shape from a (possibly user-edited) posture: goal_type (any develop → capacity), sport
// (tri-shaped vs single), and the §13.1 strength protocol. An explicit strengthProtocol overrides the
// default ONLY when strength develops (the develop picker); maintain/out use the §13.1 resolution.
export function derivePlanShape(
  posture: Partial<Record<Discipline, Posture>>,
  strengthProtocol?: string,
  equipmentTier?: string,
): { goal_type: 'capacity' | 'maintenance'; sport: string; strength_protocol?: string } {
  const sport = sportFromPosture(posture);
  const goal_type: 'capacity' | 'maintenance' =
    Object.values(posture).some((v) => v === 'develop') ? 'capacity' : 'maintenance';
  const sPos: Posture = posture.strength ?? 'maintain';
  const strength_protocol =
    sPos === 'develop'
      ? (strengthProtocol ?? defaultStrengthDeveloper(sport, equipmentTier))
      : strengthProtocolFor(sPos, sport, equipmentTier);
  return { goal_type, sport, strength_protocol };
}

// The strength DEVELOP picker (§13.1, run-shaped): Upper Aesthetics is the default. A tri-shaped develop
// resolves to triathlon_performance (derivePlanShape handles it) — but no default goal develops strength
// tri-shaped, so this menu is the run developers; a manually-edited tri case is the only edge.
// The strength DEVELOP picker, equipment-aware. Barbell/DB → 5×5 (default, first) / Upper Aesthetics /
// Neural Speed. Bodyweight/bands → only Durability works (the others need loadable resistance).
const BARBELL_DEVELOPERS: Array<{ id: string; label: string }> = [
  { id: 'five_by_five', label: '5×5' },
  { id: 'upper_aesthetics', label: 'Upper Aesthetics' },
  { id: 'neural_speed', label: 'Neural Speed' },
];
export function strengthDevelopersFor(equipmentTier?: string): Array<{ id: string; label: string }> {
  return equipmentTier === 'bodyweight_bands' ? [{ id: 'durability', label: 'Durability' }] : BARBELL_DEVELOPERS;
}
export const STRENGTH_PROTOCOL_LABELS: Record<string, string> = {
  five_by_five: '5×5',
  upper_aesthetics: 'Upper Aesthetics',
  neural_speed: 'Neural Speed',
  durability: 'Durability',
  triathlon_performance: 'Triathlon Performance',
  triathlon: 'Durability',
};

// Map user_baselines.disciplines (LONG: running/cycling/swimming/strength) to short Discipline names;
// strength is always present. No endurance declared → all-4 fallback (so the builder still works).
const LONG_TO_SHORT: Record<string, Discipline> = {
  running: 'run', run: 'run', cycling: 'bike', bike: 'bike', ride: 'bike',
  swimming: 'swim', swim: 'swim', strength: 'strength',
};
export function athleteDisciplinesFromBaselines(raw: unknown): Discipline[] {
  const out = new Set<Discipline>();
  for (const x of Array.isArray(raw) ? raw : []) {
    const d = LONG_TO_SHORT[String(x).toLowerCase()];
    if (d) out.add(d);
  }
  out.add('strength'); // always present (core to every athlete)
  const result = (['swim', 'bike', 'run', 'strength'] as Discipline[]).filter((d) => out.has(d));
  return result.some((d) => d !== 'strength') ? result : ['swim', 'bike', 'run', 'strength'];
}

export function seedFromGoal(
  goal: NonRaceGoalId,
  discipline: Discipline | undefined,
  athleteDisciplines: Discipline[],
  equipmentTier?: string,
): GoalSeed {
  const have = ENDURANCE.filter((d) => athleteDisciplines.includes(d));
  const posture: Partial<Record<Discipline, Posture>> = {};
  // Assign each endurance discipline per the goal; ones the athlete lacks → 'out' (the intersection —
  // never prescribe a sport they don't do).
  const setEnd = (fn: (d: Discipline) => Posture) => {
    for (const d of ENDURANCE) posture[d] = have.includes(d) ? fn(d) : 'out';
  };
  const chosen = (): Discipline => (discipline && have.includes(discipline) ? discipline : (have[0] ?? 'run'));

  let strength: Posture;
  switch (goal) {
    case 'build_endurance':
    case 'build_speed': {
      const dev = chosen();
      setEnd((d) => (d === dev ? 'develop' : 'maintain')); // chosen develops; the athlete's others maintain
      strength = 'maintain';
      break;
    }
    case 'get_stronger':
      setEnd((d) => (d === 'swim' ? 'out' : 'maintain')); // swim out, bike+run maintain
      strength = 'develop';
      break;
    case 'build_muscle':
      setEnd((d) => (d === 'run' ? 'maintain' : 'out')); // swim+bike out, run maintain
      strength = 'develop';
      break;
    case 'maintain':
      setEnd(() => 'maintain');
      strength = 'maintain';
      break;
    case 'starting_over': {
      const dev = chosen();
      setEnd((d) => (d === dev ? 'develop' : 'maintain')); // gentle single develop
      strength = 'maintain';
      break;
    }
    // ⛔ RUN-ONLY IS THE CLEAN DEFAULT, AND IT IGNORES `have` ON PURPOSE. Every other goal
    // intersects with the athlete's declared disciplines so nothing is prescribed that they do not
    // do. A marathon goal is the athlete SAYING they run, so run develops whether or not
    // `user_baselines.disciplines` has caught up — and a blank account has no disciplines at all.
    // Bike and swim start OUT, not maintain: the race is the boss, and cross-training is opt-in on
    // the posture step (the à la carte hold cards) rather than something to switch off.
    case 'marathon':
      for (const d of ENDURANCE) posture[d] = d === 'run' ? 'develop' : 'out';
      strength = 'maintain';
      break;
  }
  posture.strength = strength;
  const { goal_type, sport, strength_protocol } = derivePlanShape(posture, undefined, equipmentTier);
  return { goal_type, per_discipline_posture: posture, sport, strength_protocol };
}
