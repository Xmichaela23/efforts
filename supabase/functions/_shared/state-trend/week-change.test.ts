/**
 * ⛔⛔ §B5's CHANGE RULE ON THE SPINE (Round 3 addendum item 4, approved by Michael 2026-09-01).
 *
 *   deno test --allow-read supabase/functions/_shared/state-trend/week-change.test.ts --no-check
 *
 * *"Change any bucket by less than 10% per week — ideally ≤5%."* This window's lifting buckets
 * against the seven days before it; only buckets over `WEEK_CHANGE_FLAG_PCT` are listed, and the
 * card prints the list. These pin BOTH directions: a bucket over the line is listed with its
 * percentage, and a window where nothing moved lists nothing — with `comparable` telling that apart
 * from a window with no base at all.
 *
 * ⚠️ Deadlift at 300 against a 400 max is 0.75 — inside p084's velocity band, so every set here is
 * a speed rep and the pattern bucket has something to move.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends } from './assemble.ts';

const AS_OF = '2026-09-01';          // window: 2026-08-26 … 2026-09-01
const IN_WINDOW = '2026-08-30';
const IN_PRIOR = '2026-08-22';       // prior:  2026-08-19 … 2026-08-25

const session = (date: string, sets: number, weight = 300) => ({
  date,
  label: 'ME: Lower',
  exercises: [{
    name: 'Deadlift',
    slot_intent: 'ME',
    sets: Array.from({ length: sets }, () => ({ weight, reps: 5, completed: true })),
  }],
});

const inputs = (loggedSessions: unknown[], extra: Record<string, unknown> = {}) => ({
  asOf: AS_OF,
  exerciseRows: [],
  bikeRows: [], bikeLoad: [], runJoined: [], runEffHistory: [], swimRows: [],
  strengthVolumeRows: [],
  plannedBy: {}, doneBy: {}, cadenceCounts: {},
  posture: null, declaredSessionsPerWeek: 3,
  strengthBaselines: { deadlift: 400 },
  loggedSessions,
  ...extra,
} as any);

const changeOf = (logged: unknown[], extra?: Record<string, unknown>) =>
  (assembleStateTrends(inputs(logged, extra)) as any).viadaWeek?.weekChange;

Deno.test('⛔ A BUCKET OVER THE LINE IS LISTED, WITH ITS PERCENTAGE — 2 sets → 4 sets is +100', () => {
  const c = changeOf([session(IN_PRIOR, 2), session(IN_WINDOW, 4)]);
  assert(c != null, 'the field is on the payload');
  assertEquals(c.priorSince, '2026-08-19');
  assertEquals(c.priorUntil, '2026-08-25');
  assertEquals(c.comparable, true);
  const work = c.moved.find((m: any) => m.kind === 'work_sets');
  assertEquals(work, { kind: 'work_sets', key: '', from: 2, to: 4, pctChange: 100 });
  assert(c.moved.some((m: any) => m.kind === 'muscle_sets' && m.from === 2 && m.to === 4 && m.pctChange === 100),
    'every muscle the deadlift loads doubled');
  const speed = c.moved.find((m: any) => m.kind === 'pattern_speed' && m.key === 'hip_dominant');
  assertEquals(speed, { kind: 'pattern_speed', key: 'hip_dominant', from: 10, to: 20, pctChange: 100 });
});

Deno.test('⛔⛔ NOTHING MOVED → comparable, EMPTY LIST — the card prints nothing', () => {
  const c = changeOf([session(IN_PRIOR, 3), session(IN_WINDOW, 3)]);
  assertEquals(c.comparable, true);
  assertEquals(c.moved, []);
});

Deno.test('⛔ NO PRIOR WORK → NOT COMPARABLE, empty list — a first week has no base', () => {
  const c = changeOf([session(IN_WINDOW, 3)]);
  assertEquals(c.comparable, false);
  assertEquals(c.moved, []);
});

Deno.test('⛔ STRICTLY OVER THE LINE — 10 → 11 sets (+10%) is NOT flagged; 10 → 12 (+20%) is', () => {
  const ten = changeOf([session(IN_PRIOR, 10), session(IN_WINDOW, 11)]);
  assertEquals(ten.comparable, true);
  assertEquals(ten.moved.filter((m: any) => m.kind === 'work_sets' || m.kind === 'muscle_sets'), []);
  const twenty = changeOf([session(IN_PRIOR, 10), session(IN_WINDOW, 12)]);
  const work = twenty.moved.find((m: any) => m.kind === 'work_sets');
  assertEquals(work?.pctChange, 20);
});

Deno.test('a bucket dropped to nothing is listed at −100 — a muscle that had work and now has none', () => {
  const c = changeOf([session(IN_PRIOR, 3), {
    date: IN_WINDOW, label: 'Upper',
    exercises: [{ name: 'Bench Press', slot_intent: 'ME', sets: [{ weight: 100, reps: 5, completed: true }] }],
  }]);
  assertEquals(c.comparable, true);
  assert(c.moved.some((m: any) => m.kind === 'muscle_sets' && m.from === 3 && m.to === 0 && m.pctChange === -100));
});

Deno.test('⛔ A TEST DAY IN EITHER WINDOW DROPS THE PATTERN BUCKETS, keeps the muscle buckets', () => {
  const priorTest = changeOf([session(IN_PRIOR, 2), session(IN_WINDOW, 4)], { testWeekDates: [IN_PRIOR] });
  assertEquals(priorTest.moved.filter((m: any) => m.kind.startsWith('pattern_')), []);
  assert(priorTest.moved.some((m: any) => m.kind === 'muscle_sets'));
  const thisTest = changeOf([session(IN_PRIOR, 2), session(IN_WINDOW, 4)], { testWeekDates: [IN_WINDOW] });
  assertEquals(thisTest.moved.filter((m: any) => m.kind.startsWith('pattern_')), []);
  assert(thisTest.moved.some((m: any) => m.kind === 'work_sets'));
});

Deno.test('⛔ THE CURRENT WINDOW\'S NUMBERS ARE UNTOUCHED — a prior window adds a field, it changes no count', () => {
  const alone = (assembleStateTrends(inputs([session(IN_WINDOW, 3)])) as any).viadaWeek;
  const withPrior = (assembleStateTrends(inputs([session(IN_PRIOR, 5), session(IN_WINDOW, 3)])) as any).viadaWeek;
  for (const k of ['since', 'perMuscle', 'belowFloor', 'perSession', 'perPattern', 'unpriced', 'patternBandApplies']) {
    assertEquals(JSON.stringify(withPrior[k]), JSON.stringify(alone[k]), `${k} must be byte-identical`);
  }
});
