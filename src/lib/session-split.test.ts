/**
 * THE PER-SESSION SPLIT ON THE "HOW MUCH" CARD — and the 1-session week it was opened up for.
 *
 * ⛔ ONE SESSION A WEEK WAS UNREACHABLE AND WOULD NOT HAVE BUILT (Michael, 2026-08-19). The picker
 * offered 2/3/4, `assemblePayload` sent `run_days` only at `>= 2`, the Continue gate demanded 2, and
 * the composer floored at `Math.max(DEFAULT_ENDURANCE_SESSIONS, …)` — four separate places that all
 * had to move. These pin the display half; `one-session-week.test.ts` pins what the engine builds.
 *
 * Run: ~/.deno/bin/deno test --no-check src/lib/session-split.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { LONG_SESSION_SHARE, roundMiles, roundRideMinutes, sessionSplit, splitNote } from './week-budget.ts';

const mi = (n: number) => `${roundMiles(n)} mi`;
const hm = (n: number) => {
  const r = roundRideMinutes(n); const h = Math.floor(r / 60); const m = r % 60;
  return h > 0 ? (m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`) : `${m} min`;
};

Deno.test('⛔ ONE SESSION TAKES 100%, WHATEVER THE LONG-DAY SETTING SAYS', () => {
  // ⚠️ THE NO-CONFLICT RULE. A long day pinned with one session is not a contradiction to resolve:
  // that session simply IS the long one. Both settings return the same number.
  for (const hasLongDay of [true, false]) {
    const s = sessionSplit({ total: 12, sessions: 1, hasLongDay });
    assertEquals(s.even, 12, `hasLongDay=${hasLongDay}`);
  }
  assertEquals(splitNote({ total: 12, sessions: 1, hasLongDay: true, fmt: mi, noun: 'run' }),
    'One run carries it all (~12 mi).');
  assertEquals(splitNote({ total: 120, sessions: 1, hasLongDay: false, fmt: hm, noun: 'ride' }),
    'One ride carries it all (~2h).');
});

Deno.test('⛔ A DESIGNATED LONG DAY TAKES THE LARGER SHARE; THE REST SPLIT EVENLY', () => {
  const s = sessionSplit({ total: 20, sessions: 4, hasLongDay: true });
  assert(s.long! > s.other!, 'the long session did not take the larger share');
  // The remainder is split across the OTHER sessions, and the parts sum to the whole.
  assertEquals(Math.round((s.long! + s.other! * 3) * 100) / 100, 20);
  // ⚠️ INSIDE THE FIELD'S 50-60% BAND. It is a display estimate: the composer weights the easy
  // budget and removes hard sessions first, so an exact match would duplicate its rules on a screen
  // that cannot see the placement. The copy says "~" and the plan is the authority.
  assert(LONG_SESSION_SHARE >= 0.5 && LONG_SESSION_SHARE <= 0.6, 'the long share left the field band');
});

Deno.test('⛔ NO LONG DAY → AN EVEN SPLIT, and the note says so', () => {
  const s = sessionSplit({ total: 12, sessions: 3, hasLongDay: false });
  assertEquals(s.long, null);
  assertEquals(s.even, 4);
  assertEquals(splitNote({ total: 12, sessions: 3, hasLongDay: false, fmt: mi, noun: 'run' }),
    'Split evenly, ~4 mi a run.');
});

Deno.test('⚠️ THE NOTE NAMES THE LONG SESSION, and pluralises the remainder correctly', () => {
  assertEquals(splitNote({ total: 12, sessions: 2, hasLongDay: true, fmt: mi, noun: 'run' }),
    'Your long run carries ~6.5 mi, the other run carries ~5.5 mi.');
  assertEquals(splitNote({ total: 20, sessions: 4, hasLongDay: true, fmt: mi, noun: 'run' }),
    'Your long run carries ~11 mi, the other 3 runs carry ~3 mi.');
});

/**
 * ⛔ THE LINE RECOMPUTES WHEN THE LONG-DAY PIN CHANGES — the interaction the spec calls out, and the
 * one a cached string would break. The pin lives on the SCHEDULE step, two screens from this card,
 * so an athlete can walk back and clear it after reading the split. The component passes
 * `!!state.longRunDay` live on every render; this pins that the function actually answers
 * differently when it flips.
 */
Deno.test('⛔ FLIPPING THE LONG-DAY PIN CHANGES THE ANSWER — no stale split', () => {
  const on = splitNote({ total: 12, sessions: 2, hasLongDay: true, fmt: mi, noun: 'run' });
  const off = splitNote({ total: 12, sessions: 2, hasLongDay: false, fmt: mi, noun: 'run' });
  assert(on !== off, 'the note did not respond to the long-day pin');
  assert(on!.includes('long run'), 'the pinned case stopped naming the long run');
  assert(!off!.includes('long'), 'the unpinned case is still claiming a long run');
});

Deno.test('⚠️ ROUNDING IS THE DISPLAY UNIT — miles to the half, ride time to 5 min', () => {
  assertEquals(roundMiles(5.4), 5.5);
  assertEquals(roundMiles(5.2), 5);
  assertEquals(roundRideMinutes(32), 30);
  assertEquals(roundRideMinutes(33), 35);
  // ⛔ FLOORED AT 5 — a tiny week must never read as "0 min a ride".
  assertEquals(roundRideMinutes(1), 5);
});

Deno.test('⚠️ NOTHING TYPED YET → NO LINE, rather than a line full of zeros', () => {
  for (const c of [{ total: 0, sessions: 3 }, { total: 12, sessions: 0 }, { total: NaN, sessions: 2 }]) {
    assertEquals(splitNote({ ...c, hasLongDay: true, fmt: mi, noun: 'run' }), null, JSON.stringify(c));
  }
});
