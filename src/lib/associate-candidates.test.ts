/**
 * The MANUAL associate may cross disciplines; the AUTO matcher may not.
 *
 * ⛔ THE CASE THIS EXISTS FOR: the athlete swapped a planned run to a ride, then went for a run
 * anyway. `auto-attach-planned:419` filters `.eq('type', finalSport)` — correctly, and it stays that
 * way — so the run does not attach. Before this, `AssociatePlannedDialog:55` applied the SAME
 * discipline filter, so the human could not fix it by hand either: the dialog came back empty.
 *
 * Run: ~/.deno/bin/deno test --no-check src/lib/associate-candidates.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isUnmatchedAgainstPlan,
  normalizeSport,
  rankAssociateCandidates,
  unmatchedPrompt,
} from './associate-candidates.ts';

const plannedRide = { id: 'p-ride', name: 'Easy Ride', type: 'ride', date: '2026-08-18', workout_status: 'planned' };
const plannedRun = { id: 'p-run', name: 'Easy Run', type: 'run', date: '2026-08-18', workout_status: 'planned' };
const plannedRunNextDay = { id: 'p-run2', name: 'Easy Run', type: 'run', date: '2026-08-19', workout_status: 'planned' };

Deno.test('⛔ THE SWAP CASE — a run CAN now be linked to a swapped-to-ride slot', () => {
  const ranked = rankAssociateCandidates('run', '2026-08-18', [plannedRide]);
  assertEquals(ranked.sameSport, [], 'there is no planned run that day — the swap made it a ride');
  assertEquals(ranked.otherSport.length, 1, 'the ride slot was withheld — that is the old gate');
  assertEquals(ranked.otherSport[0].id, 'p-ride');
});

Deno.test('⛔ and it SAYS what the athlete is doing — warn, never gate', () => {
  const ranked = rankAssociateCandidates('run', '2026-08-18', [plannedRide]);
  assertEquals(ranked.otherSport[0].crossSportNote, 'Planned ride — you did a run');
  assertEquals(ranked.otherSport[0].sameSport, false);
});

Deno.test('⛔ SAME SPORT IS A SEPARATE LIST, not merely sorted first', () => {
  // Rendered as two groups under a divider, so a mis-tap cannot happen in one mixed column.
  const ranked = rankAssociateCandidates('run', '2026-08-18', [plannedRide, plannedRun]);
  assertEquals(ranked.sameSport.map((c) => c.id), ['p-run']);
  assertEquals(ranked.otherSport.map((c) => c.id), ['p-ride']);
  assertEquals(ranked.sameSport[0].crossSportNote, null, 'a same-sport row must not carry a warning');
});

Deno.test('within a group, the closest day wins', () => {
  const ranked = rankAssociateCandidates('run', '2026-08-18', [plannedRunNextDay, plannedRun]);
  assertEquals(ranked.sameSport.map((c) => c.id), ['p-run', 'p-run2']);
});

Deno.test('the day of the activity beats an earlier-sorting day that is further away', () => {
  const earlierButFurther = { ...plannedRun, id: 'p-early', date: '2026-08-15' };
  const ranked = rankAssociateCandidates('run', '2026-08-18', [earlierButFurther, plannedRun]);
  assertEquals(ranked.sameSport.map((c) => c.id), ['p-run', 'p-early']);
});

Deno.test('nothing is excluded for being cross-sport', () => {
  const rows = [plannedRide, { id: 'p-swim', type: 'swim', date: '2026-08-18', workout_status: 'planned' }];
  const ranked = rankAssociateCandidates('run', '2026-08-18', rows);
  assertEquals(ranked.otherSport.length, 2);
});

Deno.test('sport normalisation matches the server\'s vocabulary', () => {
  // `auto-attach-planned:16` sportSubtype — bike/cycling → ride, jog → run.
  assertEquals(normalizeSport('bike'), 'ride');
  assertEquals(normalizeSport('Cycling'), 'ride');
  assertEquals(normalizeSport('jog'), 'run');
  assertEquals(normalizeSport('swimming'), 'swim');
  assertEquals(normalizeSport(''), '');
  // A ride logged as "bike" must still read as the same sport as a planned "ride".
  const ranked = rankAssociateCandidates('bike', '2026-08-18', [plannedRide]);
  assertEquals(ranked.sameSport.length, 1, 'bike and ride were treated as different sports');
});

// ── the unmatched cue ────────────────────────────────────────────────────────────────────────

Deno.test('⛔ THE CUE FIRES on the swap-then-ran case', () => {
  const run = { id: 'w1', workout_status: 'completed', planned_id: null, type: 'run' };
  assert(isUnmatchedAgainstPlan(run, [plannedRide]), 'the owed ride was not surfaced');
  assertEquals(unmatchedPrompt([plannedRide]), "Didn't match your planned ride — link it?");
});

Deno.test('⛔ AND IT STAYS QUIET on an extra workout — a marker that cries wolf gets ignored', () => {
  // An easy spin on a day with nothing planned has missed nothing.
  const spin = { id: 'w2', workout_status: 'completed', planned_id: null, type: 'ride' };
  assertEquals(isUnmatchedAgainstPlan(spin, []), false);
  // And a day whose planned session is already done is not owed either.
  const donePlanned = { ...plannedRide, workout_status: 'completed' };
  assertEquals(isUnmatchedAgainstPlan(spin, [donePlanned]), false);
  const linkedPlanned = { ...plannedRide, completed_workout_id: 'w9' };
  assertEquals(isUnmatchedAgainstPlan(spin, [linkedPlanned]), false);
});

Deno.test('an already-linked workout says nothing', () => {
  const linked = { id: 'w3', workout_status: 'completed', planned_id: 'p-ride', type: 'run' };
  assertEquals(isUnmatchedAgainstPlan(linked, [plannedRide]), false);
});

Deno.test('a planned (not yet completed) row is never the subject of the cue', () => {
  const stillPlanned = { id: 'w4', workout_status: 'planned', planned_id: null, type: 'run' };
  assertEquals(isUnmatchedAgainstPlan(stillPlanned, [plannedRide]), false);
});
