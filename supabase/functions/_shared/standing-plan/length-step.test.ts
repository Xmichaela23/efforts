// deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/length-step.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { lengthStepOffers, WEEKLY_CHANGE_FRACTION } from './length-step.ts';
import { composeWeek } from './compose.ts';

const base = { frame: 'cycling_base' as const, blockStart: '2026-09-07', weekEasyMinutes: 400 };

Deno.test('⛔ p148: the step is at most 5% of the week\'s easy minutes, whole minutes rounded down', () => {
  assertEquals(WEEKLY_CHANGE_FRACTION, 0.05);
  const [o] = lengthStepOffers({ ...base, minutes: { '6:0': 150 }, history: [], today: '2026-09-14' });
  assertEquals(o, { slot: '6:0', role: 'long', with: [], from: 150, to: 170, cite: 'Viada p281 — the long ride progresses "every 1 to 2 weeks"' });
  const [odd] = lengthStepOffers({ ...base, weekEasyMinutes: 419, minutes: { '6:0': 150 }, history: [], today: '2026-09-14' });
  assertEquals(odd.to, 170); // 20.95 → 20
});

Deno.test('⛔ p281: offered one week after the block starts or after the last answer; never sooner', () => {
  const m = { '6:0': 150 };
  assertEquals(lengthStepOffers({ ...base, minutes: m, history: [], today: '2026-09-13' }), []);
  assertEquals(lengthStepOffers({ ...base, minutes: m, history: [], today: '2026-09-14' }).length, 1);
  const kept = [{ slot: '6:0', at: '2026-09-14', from: 150, to: null, decision: 'keep' as const }];
  assertEquals(lengthStepOffers({ ...base, minutes: m, history: kept, today: '2026-09-20' }), []);
  assertEquals(lengthStepOffers({ ...base, minutes: m, history: kept, today: '2026-09-21' }).length, 1);
});

Deno.test('⛔ p239: never past the top of the level the length sits in', () => {
  assertEquals(lengthStepOffers({ ...base, minutes: { '6:0': 200 }, history: [], today: '2026-09-14' })[0].to, 210);
  assertEquals(lengthStepOffers({ ...base, minutes: { '6:0': 210 }, history: [], today: '2026-09-14' }), []);
  // Level 1 (60–100): 1h40 is its top, and level 2 starts past a 5% step, so nothing is offered.
  assertEquals(lengthStepOffers({ ...base, minutes: { '6:0': 100 }, history: [], today: '2026-09-14' }), []);
  assertEquals(lengthStepOffers({ ...base, minutes: { '6:0': 90 }, history: [], today: '2026-09-14' })[0].to, 100);
});

Deno.test('⛔ nothing grows on its own or without a timing: no pick, no growth, no easy minutes → no offer', () => {
  assertEquals(lengthStepOffers({ ...base, minutes: null, history: [], today: '2026-10-01' }), []);
  // Day 2's easy ride carries no growth timing yet (the midweek length is an open decision).
  assertEquals(lengthStepOffers({ ...base, minutes: { '2:0': 80 }, history: [], today: '2026-10-01' }), []);
  assertEquals(lengthStepOffers({ ...base, weekEasyMinutes: null, minutes: { '6:0': 150 }, history: [], today: '2026-10-01' }), []);
  // A frame with no growth on any slot is never offered anything.
  assertEquals(lengthStepOffers({ ...base, frame: 'strength_5k', minutes: { '6:0': 75 }, history: [], today: '2026-10-01' }), []);
});

Deno.test('⛔ an accepted length builds exactly that many minutes', () => {
  const KIT = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'];
  for (const m of [157, 170, 183, 209]) {
    const w = composeWeek({
      frame: 'cycling_base', column: 'standard', week: 2, roundTo: 5, equipment: KIT,
      competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
      workingNumbers: {}, baselines: { performance_numbers: { ftp: 250 } }, sportMix: { minutes: { '6:0': m } },
    } as never);
    const long = w.sessions.find((s) => (s.tags ?? []).includes('slot:6:0'))!;
    assertEquals(long.duration, m, `${m}`);
    assert(w.enduranceLedger.subVt1Minutes > 0);
  }
});

Deno.test('⛔ the midweek rides: offered once a calendar month, the same step on Tuesday and Friday, never past 100 min', () => {
  const m = { '2:0': 60 };
  assertEquals(lengthStepOffers({ ...base, minutes: m, history: [], today: '2026-10-06' }), []);
  const [o] = lengthStepOffers({ ...base, minutes: m, history: [], today: '2026-10-07' });
  // 5% of 400 = 20 minutes for the week, split across the two rides held to one length: 10 each.
  assertEquals([o.slot, o.role, o.with, o.from, o.to], ['2:0', 'easy', ['5:1'], 60, 70]);
  assertEquals(lengthStepOffers({ ...base, minutes: { '2:0': 95 }, history: [], today: '2026-10-07' })[0].to, 100);
  assertEquals(lengthStepOffers({ ...base, minutes: { '2:0': 100 }, history: [], today: '2026-10-07' }), []);
  // Both due at once: the easy rides take the week's 5% first and the long ride waits (p107, p108, p149).
  const both = lengthStepOffers({ ...base, minutes: { '2:0': 60, '6:0': 150 }, history: [], today: '2026-10-07' });
  assertEquals(both.map((x) => [x.slot, x.to]), [['2:0', 70]]);
});
