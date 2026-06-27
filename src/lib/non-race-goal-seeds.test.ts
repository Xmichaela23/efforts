// Cut C — seedFromGoal: the §13 seed table, intersected with athlete disciplines.
// Run: ~/.deno/bin/deno test --no-check src/lib/non-race-goal-seeds.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  seedFromGoal, derivePlanShape, developCount, canSetDevelop, athleteDisciplinesFromBaselines,
  type Discipline,
} from './non-race-goal-seeds.ts';

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

// ── Cut D — the ceiling + derive helpers (for the editable posture step) ──
Deno.test('canSetDevelop — blocks a 3rd develop; allows the 2 already-develop to stay', () => {
  const two = { swim: 'develop', bike: 'develop', run: 'maintain', strength: 'maintain' } as const;
  assertEquals(developCount(two), 2);
  assertEquals(canSetDevelop(two, 'run'), false);     // a 3rd develop is blocked
  assertEquals(canSetDevelop(two, 'swim'), true);     // already develop → stays selectable
  const one = { swim: 'develop', bike: 'maintain' } as const;
  assertEquals(canSetDevelop(one, 'bike'), true);     // under the ceiling → allowed
});

Deno.test('derivePlanShape — re-derives goal_type/sport/protocol from the EDITED posture', () => {
  // user edits an all-maintain tri posture → develop run: flips to capacity, stays triathlon, strength maintain→triathlon
  const edited = { swim: 'maintain', bike: 'maintain', run: 'develop', strength: 'maintain' };
  const s = derivePlanShape(edited);
  assertEquals(s.goal_type, 'capacity');
  assertEquals(s.sport, 'triathlon');
  assertEquals(s.strength_protocol, 'triathlon');     // maintain + tri
  // all maintain → maintenance
  assertEquals(derivePlanShape({ run: 'maintain', strength: 'maintain' }).goal_type, 'maintenance');
});

Deno.test('derivePlanShape — protocol override applies ONLY when strength develops', () => {
  const dev = { run: 'maintain', strength: 'develop' };
  assertEquals(derivePlanShape(dev).strength_protocol, 'upper_aesthetics');          // run-shaped develop default
  assertEquals(derivePlanShape(dev, 'five_by_five').strength_protocol, 'five_by_five'); // user picked 5×5
  const maint = { run: 'maintain', strength: 'maintain' };
  assertEquals(derivePlanShape(maint, 'five_by_five').strength_protocol, 'durability'); // override ignored on maintain
});

Deno.test('athleteDisciplinesFromBaselines — long→short, strength always, fallback', () => {
  assertEquals(athleteDisciplinesFromBaselines(['running', 'strength']), ['run', 'strength']);
  assertEquals(athleteDisciplinesFromBaselines(['swimming', 'cycling', 'running']), ['swim', 'bike', 'run', 'strength']);
  assertEquals(athleteDisciplinesFromBaselines(['running']), ['run', 'strength']); // strength appended
  assertEquals(athleteDisciplinesFromBaselines([]), ['swim', 'bike', 'run', 'strength']);   // no endurance → fallback
  assertEquals(athleteDisciplinesFromBaselines(null), ['swim', 'bike', 'run', 'strength']); // null → fallback
});
