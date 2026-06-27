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

  const sport = sportFromPosture(posture);
  const goal_type: 'capacity' | 'maintenance' =
    Object.values(posture).some((p) => p === 'develop') ? 'capacity' : 'maintenance';
  return {
    goal_type,
    per_discipline_posture: posture,
    sport,
    strength_protocol: strengthProtocolFor(strength, sport),
  };
}
