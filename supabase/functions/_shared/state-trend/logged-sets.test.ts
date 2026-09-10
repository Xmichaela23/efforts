/**
 * "from your logged sets", moved to the server (audit 2026-09-10, H-S20).
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/state-trend/logged-sets.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildLoggedLifts } from './logged-sets.ts';

const AS_OF = '2026-09-10'; // 8 weeks back → 2026-07-16
const row = (canonical: string, date: string, weight: number | null, reps: number, e1rm: number) =>
  ({ date, canonical_name: canonical, estimated_1rm: e1rm, reps, best_weight: weight });

const ROWS = [
  row('squat', '2026-06-01', 300, 1, 300),      // before the window
  row('squat', '2026-07-20', 185, 5, 215),
  row('dumbbell_curl', '2026-07-21', 30, 10, 40),
  row('squat', '2026-07-27', 190, 5, 221),
  row('squat', '2026-08-03', 195, 3, 213),
  row('squat', '2026-08-10', 200, 12, 280),     // past the trusted rep ceiling
  row('lunge', '2026-08-11', 50, 8, 62),        // one session → not listed
  row('squat', '2026-08-17', 205, 5, 239),
  row('dumbbell_curl', '2026-08-18', 35, 8, 44),
  row('squat', '2026-08-24', 150, 5, 175),
  row('squat', '2026-08-25', 155, 5, 0),        // no estimate → not a session
  row('band_pull_apart', '2026-08-01', null, 15, 10),
  row('band_pull_apart', '2026-08-08', null, 15, 10),
];

Deno.test('listed: two or more sessions with an estimate inside 8 weeks, most-logged first', () => {
  const out = buildLoggedLifts(ROWS, AS_OF);
  assertEquals(out.map((l) => [l.canonical, l.sessions]), [['squat', 6], ['dumbbell_curl', 2], ['band_pull_apart', 2]]);
  assertEquals(out[0].displayName, 'Back Squat');
});

Deno.test('recent: the last five newest first; "best" is the strongest TRUSTED estimate; untrusted prints no e1RM', () => {
  const [squat] = buildLoggedLifts(ROWS, AS_OF);
  assertEquals(squat.recent.map((s) => s.date), ['2026-08-24', '2026-08-17', '2026-08-10', '2026-08-03', '2026-07-27']);
  assertEquals(squat.recent.map((s) => s.best), [false, true, false, false, false]);
  assertEquals(squat.recent[2], { date: '2026-08-10', weight: 200, reps: 12, e1rm: null, best: false });
  assertEquals(squat.recent[1], { date: '2026-08-17', weight: 205, reps: 5, e1rm: 239, best: true });
});

Deno.test('heaviest: decided on weight, never the estimate; none when no weight was logged', () => {
  const out = buildLoggedLifts(ROWS, AS_OF);
  assertEquals(out[0].heaviest, { date: '2026-08-17', weight: 205, reps: 5 });
  assertEquals(out[1].heaviest, { date: '2026-08-18', weight: 35, reps: 8 });
  assertEquals(out[2].heaviest, null);
});

Deno.test('no trusted set → no "best" tag anywhere', () => {
  const [l] = buildLoggedLifts([row('squat', '2026-08-01', 100, 15, 150), row('squat', '2026-08-08', 110, 14, 160)], AS_OF);
  assertEquals(l.recent.map((s) => s.best), [false, false]);
});
