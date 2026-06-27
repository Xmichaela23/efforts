// Cut C — seedFromGoal: the §13 seed table, intersected with athlete disciplines.
// Run: ~/.deno/bin/deno test --no-check src/lib/non-race-goal-seeds.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { seedFromGoal, type Discipline } from './non-race-goal-seeds.ts';

const TRI: Discipline[] = ['swim', 'bike', 'run', 'strength'];
const RUNNER: Discipline[] = ['run', 'strength'];
const develops = (s: ReturnType<typeof seedFromGoal>) =>
  Object.entries(s.per_discipline_posture).filter(([, p]) => p === 'develop').map(([d]) => d);

Deno.test('build_endurance (triathlete, run) — run develops, others maintain, strength maintain, tri', () => {
  const s = seedFromGoal('build_endurance', 'run', TRI);
  assertEquals(s.per_discipline_posture, { swim: 'maintain', bike: 'maintain', run: 'develop', strength: 'maintain' });
  assertEquals(s.goal_type, 'capacity');
  assertEquals(s.sport, 'triathlon');
  assertEquals(s.strength_protocol, 'triathlon'); // maintain + tri
});

Deno.test('build_endurance (runner-only) — intersection: no swim/bike maintaining; sport run', () => {
  const s = seedFromGoal('build_endurance', 'run', RUNNER);
  assertEquals(s.per_discipline_posture, { swim: 'out', bike: 'out', run: 'develop', strength: 'maintain' });
  assertEquals(s.sport, 'run');                     // single-sport → run (honest sport mapping)
  assertEquals(s.strength_protocol, 'durability');  // maintain + run
});

Deno.test('get_stronger — swim out, bike+run maintain, strength develops; run-shaped → upper_aesthetics', () => {
  const s = seedFromGoal('get_stronger', undefined, TRI);
  assertEquals(s.per_discipline_posture, { swim: 'out', bike: 'maintain', run: 'maintain', strength: 'develop' });
  assertEquals(s.goal_type, 'capacity');
  assertEquals(s.sport, 'run');                     // swim out → not tri → run
  assertEquals(s.strength_protocol, 'upper_aesthetics'); // develop + run → the §13.1 default developer (NOT triathlon_performance)
});

Deno.test('build_muscle — swim+bike out, run maintain, strength develops → upper_aesthetics', () => {
  const s = seedFromGoal('build_muscle', undefined, TRI);
  assertEquals(s.per_discipline_posture, { swim: 'out', bike: 'out', run: 'maintain', strength: 'develop' });
  assertEquals(s.sport, 'run');
  assertEquals(s.strength_protocol, 'upper_aesthetics');
});

Deno.test('maintain — all maintain → maintenance goal_type; tri stays triathlon', () => {
  const s = seedFromGoal('maintain', undefined, TRI);
  assertEquals(s.per_discipline_posture, { swim: 'maintain', bike: 'maintain', run: 'maintain', strength: 'maintain' });
  assertEquals(s.goal_type, 'maintenance');         // nothing develops
  assertEquals(s.sport, 'triathlon');
  assertEquals(s.strength_protocol, 'triathlon');
});

Deno.test('starting_over (bike chosen) — single develop, rest maintain', () => {
  const s = seedFromGoal('starting_over', 'bike', TRI);
  assertEquals(s.per_discipline_posture, { swim: 'maintain', bike: 'develop', run: 'maintain', strength: 'maintain' });
  assertEquals(s.goal_type, 'capacity');
});

Deno.test('two-build ceiling — no goal develops more than 2 disciplines (the interference bound)', () => {
  const goals = ['build_endurance', 'build_speed', 'get_stronger', 'build_muscle', 'maintain', 'starting_over'] as const;
  for (const g of goals) {
    for (const ath of [TRI, RUNNER]) {
      assert(develops(seedFromGoal(g, 'run', ath)).length <= 2, `${g} (${ath.join('+')}) must develop ≤2`);
    }
  }
});
