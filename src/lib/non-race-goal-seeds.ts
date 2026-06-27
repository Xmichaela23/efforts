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

// sport from the endurance disciplines that are present (not out): all 3 → triathlon; else run>bike>swim.
// This is what makes the §13.1 strength split fall out for free — strength-focus goals (swim out) are
// never tri-shaped, so their develop strength resolves to the general developer, not triathlon_performance.
function sportFromPosture(p: Partial<Record<Discipline, Posture>>): string {
  const present = ENDURANCE.filter((d) => p[d] && p[d] !== 'out');
  if ((['swim', 'bike', 'run'] as Discipline[]).every((d) => present.includes(d))) return 'triathlon';
  return (['run', 'bike', 'swim'] as Discipline[]).find((d) => present.includes(d)) ?? 'run';
}

// §13.1: develop → upper_aesthetics (run) / triathlon_performance (tri); maintain → durability (run) /
// triathlon (tri). out → no strength protocol.
function strengthProtocolFor(s: Posture, sport: string): string | undefined {
  const tri = sport === 'triathlon';
  if (s === 'develop') return tri ? 'triathlon_performance' : 'upper_aesthetics';
  if (s === 'maintain') return tri ? 'triathlon' : 'durability';
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
): { goal_type: 'capacity' | 'maintenance'; sport: string; strength_protocol?: string } {
  const sport = sportFromPosture(posture);
  const goal_type: 'capacity' | 'maintenance' =
    Object.values(posture).some((v) => v === 'develop') ? 'capacity' : 'maintenance';
  const sPos: Posture = posture.strength ?? 'maintain';
  const strength_protocol =
    sPos === 'develop'
      ? (strengthProtocol ?? strengthProtocolFor('develop', sport))
      : strengthProtocolFor(sPos, sport);
  return { goal_type, sport, strength_protocol };
}

// The strength DEVELOP picker (§13.1, run-shaped): Upper Aesthetics is the default. A tri-shaped develop
// resolves to triathlon_performance (derivePlanShape handles it) — but no default goal develops strength
// tri-shaped, so this menu is the run developers; a manually-edited tri case is the only edge.
export const STRENGTH_DEVELOPERS: Array<{ id: string; label: string }> = [
  { id: 'upper_aesthetics', label: 'Upper Aesthetics' },
  { id: 'neural_speed', label: 'Neural Speed' },
  { id: 'five_by_five', label: '5×5' },
];

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
  const { goal_type, sport, strength_protocol } = derivePlanShape(posture);
  return { goal_type, per_discipline_posture: posture, sport, strength_protocol };
}
