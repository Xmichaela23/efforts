/**
 * ⛔ A LIFTING SESSION IS AS LONG AS ITS OWN ROWS SAY (work order 2026-09-09 §3c).
 *
 *   ~/.deno/bin/deno test --no-check supabase/functions/_shared/strength-session-minutes.test.ts
 *
 * ⚠️ THE FIXTURES ARE REAL ROWS, copied off a Standard plan built through the wizard on a throwaway
 * account (2026-09-09). A fixture invented to suit the formula proves the formula agrees with
 * itself; these are the shapes the composer actually writes — a `set_plan` warm-up ladder on the
 * heavy row, `sets`/`reps` bands on the accessories, and a plyo row that carries efforts in `reps`.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  strengthSessionSeconds,
  strengthSessionMinutes,
  formatStrengthSessionMinutes,
  repBand,
} from './strength-session-minutes.ts';

/** `Lower body: Hinge`, week 1 of a Standard block. */
const HINGE = [
  {
    name: 'Deadlift', reps: '1-5', sets: 1, slot_intent: 'ME',
    set_plan: [
      { reps: 5, warmup: true, weight: 45 },
      { reps: 5, warmup: true, weight: 125 },
      { reps: 3, warmup: true, weight: 175 },
      { reps: 2, warmup: true, weight: 205 },
      { weight: 230 },
    ],
  },
  { name: 'Weighted Reverse Hyper', reps: '6-12', sets: 3, slot_intent: 'HYP' },
  { name: 'Bulgarian Split Squat', reps: '6-12', sets: 3, slot_intent: 'HYP' },
  { name: 'Leg Curl', reps: '6-12', sets: 3, slot_intent: 'HYP' },
  { name: 'Reverse Lunge', reps: '2-4', sets: 4, slot_intent: 'DE' },
];

/** The plyo day: one set of efforts per drill, no slot intent. */
const PLYO = [
  { name: 'Stiff-Legged Run', reps: 4, sets: 1 },
  { name: 'Pogo Hops', reps: 4, sets: 1 },
  { name: 'Ickey Shuffle', reps: 4, sets: 1 },
];

Deno.test('⛔ THE REST IS THE TIMER\'S OWN ANSWER, AND A WARM-UP RESTS LIKE A WARM-UP', () => {
  const s = strengthSessionSeconds(HINGE)!;
  // 4 warm-ups @ 60 + the ME top set @ 180 = 420; 3 HYP rows @ 3 × 90 = 810; 4 DE sets @ 120 = 480.
  const rest = 4 * 60 + 180 + 3 * (3 * 90) + 4 * 120;
  assertEquals(rest, 1710);
  // Both ends carry the same rest — the clock is fixed, only the time under the bar is a band.
  const workLow = (5 + 5 + 3 + 2 + 1) * 2 + 3 * (3 * 6 * 2) + 4 * 2 * 2;
  const workHigh = (5 + 5 + 3 + 2 + 5) * 4 + 3 * (3 * 12 * 4) + 4 * 4 * 4;
  assertEquals(s.low, rest + workLow);
  assertEquals(s.high, rest + workHigh);
});

Deno.test('the hinge day reads as a range in five-minute steps', () => {
  assertEquals(strengthSessionMinutes(HINGE), { low: 30, high: 40 });
  assertEquals(formatStrengthSessionMinutes(HINGE), '30–40 min');
});

Deno.test('⛔ THE WARM-UP LADDER COUNTS — `sets: 1` on a heavy row is not one set of work', () => {
  const withLadder = strengthSessionSeconds(HINGE)!;
  const withoutLadder = strengthSessionSeconds(
    HINGE.map((r) => ({ ...r, set_plan: undefined })),
  )!;
  // The ladder is four extra sets at the warm-up clock; dropping it makes the day shorter, not longer.
  assert(withLadder.low > withoutLadder.low, `${withLadder.low} !> ${withoutLadder.low}`);
  assertEquals(withLadder.low - withoutLadder.low, 4 * 60 + (5 + 5 + 3 + 2) * 2);
});

Deno.test('the pricing itself still answers for plyo rows — the suppression is at the header, not here', () => {
  const s = strengthSessionSeconds(PLYO)!;
  // No slot intent, so the timer falls to its plyometric case: 150s a set.
  assertEquals(s.low, 3 * (150 + 4 * 2));
  assertEquals(s.high, 3 * (150 + 4 * 4));
  assertEquals(formatStrengthSessionMinutes(PLYO), '5–10 min');
});

// ⚠️ THE PLYO DAY'S SUPPRESSION IS NO LONGER A PHONE HEADER RULE: get-week sends no label for a row
// tagged `plyo` (pinned in get-week/planned-duration-label.test.ts).

Deno.test('⛔ NOTHING USABLE MEANS NULL, so the caller can keep the stored length', () => {
  assertEquals(strengthSessionMinutes([]), null);
  assertEquals(strengthSessionMinutes(null), null);
  assertEquals(strengthSessionMinutes('not an array'), null);
  assertEquals(strengthSessionMinutes([{ sets: 3, reps: '8-12' }]), null); // no name → not a row
});

Deno.test('a row with no reps still costs its rest', () => {
  const s = strengthSessionSeconds([{ name: 'Plank', sets: 3 }])!;
  assertEquals(s.low, s.high);
  assert(s.low > 0);
});

Deno.test('both ends on one step print a single number', () => {
  const one = formatStrengthSessionMinutes([{ name: 'Back Squat', sets: 1, reps: '3-5', slot_intent: 'ME' }]);
  assertEquals(one, '5 min');
});

Deno.test('rep bands are read off `reps` and `target_reps`, and a trailing + is a high not an open end', () => {
  assertEquals(repBand({ reps: '6-12' }), { lo: 6, hi: 12 });
  assertEquals(repBand({ reps: '8-12+' }), { lo: 8, hi: 12 });
  assertEquals(repBand({ reps: 4 }), { lo: 4, hi: 4 });
  assertEquals(repBand({ target_reps: '1-5' }), { lo: 1, hi: 5 });
  assertEquals(repBand({ reps: '12–8' }), { lo: 8, hi: 12 }); // reversed, en dash
  assertEquals(repBand({}), null);
});

Deno.test('⛔ THE RANGE ALWAYS CONTAINS THE COMPUTED FIGURE — low floors, high ceils', () => {
  for (const rows of [HINGE, PLYO]) {
    const s = strengthSessionSeconds(rows)!;
    const m = strengthSessionMinutes(rows)!;
    assert(m.low <= s.low / 60, `${m.low} > ${s.low / 60}`);
    assert(m.high >= s.high / 60, `${m.high} < ${s.high / 60}`);
  }
});
