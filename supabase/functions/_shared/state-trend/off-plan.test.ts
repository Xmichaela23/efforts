/**
 * ⛔⛔ OFF-PLAN WORK ON THE SPINE (2026-09-01, approved by Michael) — and the UNKNOWN case.
 *
 *   deno test --allow-read supabase/functions/_shared/state-trend/off-plan.test.ts --no-check
 *
 * The plan marker is the logger's `planned_name`, stamped only on rows prefilled from the plan.
 * Classification is per SESSION: a session with at least one marked row can be read, and its
 * unmarked rows were added; a session with no marked row is UNKNOWN and contributes nothing.
 * ⛔ THE FIXTURE THAT MATTERS MOST IS THE SILENT ONE: a window whose rows carry no marker must NOT
 * read as "added" — that accuses the athlete of something they did not do.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends } from './assemble.ts';

const AS_OF = '2026-09-01';
const IN_WINDOW = '2026-08-30';

const set = () => ({ weight: 100, reps: 8, completed: true });
const prescribed = (name: string, sets = 3) => ({ name, planned_name: name, slot_intent: 'HYP', sets: Array.from({ length: sets }, set) });
const swapped = (name: string, plannedName: string, sets = 3) => ({ name, planned_name: plannedName, slot_intent: 'HYP', sets: Array.from({ length: sets }, set) });
const added = (name: string, sets = 3) => ({ name, sets: Array.from({ length: sets }, set) });
const unmarked = (name: string, sets = 3) => ({ name, sets: Array.from({ length: sets }, set) });

const session = (exercises: unknown[], date = IN_WINDOW) => ({ date, label: 'ME: Upper', exercises });

const inputs = (loggedSessions: unknown[]) => ({
  asOf: AS_OF,
  exerciseRows: [],
  bikeRows: [], bikeLoad: [], runJoined: [], runEffHistory: [], swimRows: [],
  strengthVolumeRows: [],
  plannedBy: {}, doneBy: {}, cadenceCounts: {},
  posture: null, declaredSessionsPerWeek: 3,
  strengthBaselines: { bench_press: 200 },
  loggedSessions,
} as any);

const offPlanOf = (logged: unknown[]) => (assembleStateTrends(inputs(logged)) as any).viadaWeek?.offPlan;
const totalSets = (pm: Array<{ sets: number }>) => pm.reduce((a, m) => Math.max(a, m.sets), 0);

Deno.test('⛔ A MARKED SESSION WITH AN ADDED ROW → known, the added rows\' dose only', () => {
  const o = offPlanOf([session([prescribed('Bench Press', 4), added('Barbell Row', 3)])]);
  assert(o != null, 'the field is on the payload');
  assertEquals(o.known, true);
  assertEquals(o.classifiedSessions, 1);
  assertEquals(o.workSets, 3, 'three added sets; the four prescribed ones are not counted');
  assert(o.perMuscle.length > 0, 'the added movement loads at least one muscle');
  assertEquals(totalSets(o.perMuscle), 3, 'no muscle carries more than the added sets');
  assert(o.perMuscle.every((m: any) => m.sets <= 3));
});

Deno.test('⛔ A MARKED SESSION WITH NOTHING ADDED → known, empty — the card prints nothing', () => {
  const o = offPlanOf([session([prescribed('Bench Press'), prescribed('Barbell Row')])]);
  assertEquals(o.known, true);
  assertEquals(o.perMuscle, []);
  assertEquals(o.workSets, 0);
});

Deno.test('⛔⛔ NO MARKER ANYWHERE → UNKNOWN, NOT "ADDED" — pre-marker rows, or a session with no plan behind it', () => {
  const o = offPlanOf([session([unmarked('Bench Press'), unmarked('Barbell Row')])]);
  assertEquals(o.known, false, 'nothing in the window can be classified');
  assertEquals(o.classifiedSessions, 0);
  assertEquals(o.perMuscle, [], 'an unreadable week accuses nobody');
  assertEquals(o.workSets, 0);
});

Deno.test('⛔ A SWAP IS PRESCRIBED VOLUME — typed-over name, marker present → not added', () => {
  const o = offPlanOf([session([swapped('Dumbbell Bench Press', 'Bench Press'), prescribed('Barbell Row')])]);
  assertEquals(o.known, true);
  assertEquals(o.perMuscle, []);
});

Deno.test('⚠️ MIXED WINDOW — an unknown session contributes nothing while a marked one is read', () => {
  const o = offPlanOf([
    session([unmarked('Bench Press'), unmarked('Barbell Row')], '2026-08-27'),
    session([prescribed('Bench Press'), added('Barbell Row', 2)], IN_WINDOW),
  ]);
  assertEquals(o.known, true);
  assertEquals(o.classifiedSessions, 1);
  assertEquals(o.workSets, 2, 'only the marked session\'s added sets; the unknown session\'s rows are not guessed at');
});

Deno.test('⛔ THE REST OF THE CARD IS UNTOUCHED — the whole week\'s numbers do not change because rows were classified', () => {
  const marked = (assembleStateTrends(inputs([session([prescribed('Bench Press', 4), added('Barbell Row', 3)])])) as any).viadaWeek;
  const unmarkedAll = (assembleStateTrends(inputs([session([unmarked('Bench Press', 4), unmarked('Barbell Row', 3)])])) as any).viadaWeek;
  for (const k of ['since', 'perMuscle', 'belowFloor', 'perSession', 'perPattern', 'unpriced', 'patternBandApplies']) {
    assertEquals(JSON.stringify(marked[k]), JSON.stringify(unmarkedAll[k]), `${k} must be byte-identical`);
  }
});
