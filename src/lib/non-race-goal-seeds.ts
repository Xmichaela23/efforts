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
  | 'build_endurance' | 'build_speed' | 'get_stronger' | 'build_muscle' | 'maintain' | 'starting_over';

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
  get_stronger: 'Get stronger',
  build_muscle: 'Build muscle + train',
  maintain: 'Maintain',
  starting_over: 'Starting over',
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
  longRunDay?: string;
  longRideDay?: string;
  anchorDiscipline?: 'run' | 'bike' | null;
  anchorDay?: string;
};
export function buildPreferredDays(
  posture: Partial<Record<Discipline, Posture>>,
  sched: ScheduleInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const present = (d: Discipline) => posture[d] != null && posture[d] !== 'out';
  if (present('run')) out.long_run = sched.longRunDay || 'sunday';
  if (present('bike')) out.long_ride = sched.longRideDay || 'saturday';
  if (sched.anchorDiscipline && sched.anchorDay && present(sched.anchorDiscipline)) {
    out[`quality_${sched.anchorDiscipline}`] = sched.anchorDay; // the kept club session = a hard day
  }
  if (present('strength')) out.strength = ['monday', 'thursday'];
  return out;
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
  }
  posture.strength = strength;
  const { goal_type, sport, strength_protocol } = derivePlanShape(posture, undefined, equipmentTier);
  return { goal_type, per_discipline_posture: posture, sport, strength_protocol };
}
