/**
 * Q-111 §2 — novel-movement detection (one fact, two surfaces).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/novel-movements.test.ts --no-check
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { detectNovelMovements, novelMovementsPhrase, headlineNovelMovement } from './novel-movements.ts';

// Michael's Monday session: Bulgarian split squats + reverse lunges absent from history; back squat present.
const SESSION = [
  { name: 'Back Squat', reps: 9 },
  { name: 'Bulgarian Split Squats', reps: 52 },
  { name: 'Reverse Lunge', reps: 78 },
  { name: 'DB Thruster', reps: 40 },
];
const HISTORY = ['back squat', 'bench press', 'deadlift', 'db thruster', 'overhead press'];

Deno.test('detect: Bulgarian split squats + reverse lunges are novel; back squat + thruster are not', () => {
  const n = detectNovelMovements({ sessionMovements: SESSION, historyMovementNames: HISTORY });
  assertEquals(n.map((x) => x.name), ['Bulgarian Split Squats', 'Reverse Lunge']);
});

Deno.test('phrase: names the two biggest novel movements + rounded total reps', () => {
  const n = detectNovelMovements({ sessionMovements: SESSION, historyMovementNames: HISTORY });
  // 52 + 78 = 130 → rounded to 130
  assertEquals(novelMovementsPhrase(n), 'first Reverse Lunges and Bulgarian Split Squats in months (~130 reps)');
});

Deno.test('headline: the single biggest novel movement (for the State chip Why)', () => {
  const n = detectNovelMovements({ sessionMovements: SESSION, historyMovementNames: HISTORY });
  assertEquals(headlineNovelMovement(n), 'Reverse Lunge');
});

Deno.test('nothing novel → null phrase, empty list', () => {
  const n = detectNovelMovements({ sessionMovements: [{ name: 'Back Squat', reps: 9 }], historyMovementNames: HISTORY });
  assertEquals(n, []);
  assertEquals(novelMovementsPhrase(n), null);
  assertEquals(headlineNovelMovement(n), null);
});

Deno.test('normalization: "Bulgarian split squat" in history suppresses "Bulgarian Split Squats" in session', () => {
  const n = detectNovelMovements({ sessionMovements: [{ name: 'Bulgarian Split Squats', reps: 52 }], historyMovementNames: ['bulgarian split squat'] });
  assertEquals(n, []);
});

Deno.test('dedup: a movement repeated in the session is listed once', () => {
  const n = detectNovelMovements({ sessionMovements: [{ name: 'Reverse Lunge', reps: 40 }, { name: 'Reverse Lunge', reps: 38 }], historyMovementNames: [] });
  assertEquals(n.length, 1);
});
