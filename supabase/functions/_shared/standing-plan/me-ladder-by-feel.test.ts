/**
 * ⛔ A "BY FEEL" SET IS NOT A LADDER RUNG, AND THE HEAVY SET NEVER OPENS ABOVE THE BAND (Michael's
 * squat, 2026-09-04). Week one's squat row read `awaiting_test`; he squatted 105 × 6 by feel. The
 * ladder took that as an ME rung (recentReps [6]) and every later squat opened at 105 × 6 — a rep
 * count above p218's ME band, copied from a set that was never prescribed.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeBlock, composeWeek } from './compose.ts';
import { earnedMeSets } from './me-history.ts';
import { prescribe } from '../strength-grid/index.ts';

const SQUAT = { lift: 'squat' as const, workingNumber: 119, predicted1RM: 124, measured: { weight: 105, reps: 6 }, cite: 'test' };
const BASE = {
  frame: 'all_rounder' as const,
  competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
  roundTo: 5,
};
const ME_BAND = (() => { const p = prescribe('ME', 'barbell'); return p.kind === 'barbell' ? p.reps : { lo: 1, hi: 1 }; })();
const dateOn = (day: string) => {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return new Date(Date.parse('2026-01-04T00:00:00Z') + names.indexOf(day) * 86400000).toISOString().slice(0, 10);
};

Deno.test('a set logged against a by-feel (unpriced) ME row earns nothing and sets no opening reps', () => {
  // no working numbers → the block is on the by-feel contract; week one is the test week, week two is by feel
  const composed = composeBlock({ ...BASE, workingNumbers: undefined, weeks: 3, taperWeeks: [] } as never);
  const byFeel = composed.flatMap((w: any) => w.meRows ?? []).find((r: any) => r.pattern === 'press_lower' && r.weight == null);
  assert(byFeel, 'the fixture has no by-feel squat row to log against');
  const reading = earnedMeSets({
    composed: composed as never,
    logged: [{ week_number: byFeel.week, date: dateOn(byFeel.day), strength_exercises: [
      { name: byFeel.movement, sets: [{ weight: 105, reps: 6, completed: true }] },
    ] }],
    throughWeek: byFeel.week,
  });
  assertEquals(reading.lastReps.press_lower, undefined, 'a by-feel set became the opening rep count');
  assertEquals(reading.sets.press_lower, undefined, 'a by-feel set earned a set');
});

Deno.test('the restate re-prices week one — the by-feel week is still not a rung (byFeelWeek)', () => {
  // the block as the restate re-composes it: week one PRICED off the numbers the test read
  const composed = composeBlock({ ...BASE, workingNumbers: { squat: SQUAT }, weeks: 3, taperWeeks: [] } as never);
  const wk1 = composed.flatMap((w: any) => w.meRows ?? []).find((r: any) => r.pattern === 'press_lower' && r.week === 1);
  assert(wk1 && wk1.weight != null, 'the fixture week-one squat row did not re-price');
  const logged = [{ week_number: 1, date: dateOn(wk1.day), strength_exercises: [{ name: wk1.movement, sets: [{ weight: 105, reps: 6, completed: true }] }] }];
  const withGuard = earnedMeSets({ composed: composed as never, logged, throughWeek: 2, byFeelWeek: 1 });
  assertEquals(withGuard.lastReps.press_lower, undefined, 'the by-feel week became a rung on recompose');
  const without = earnedMeSets({ composed: composed as never, logged, throughWeek: 2, byFeelWeek: null });
  assertEquals(without.lastReps.press_lower, [6], 'a block that PRICED week one (Use current) still reads it');
});

Deno.test('the ME set opens inside the band even when the last logged reps were above it', () => {
  const wk = composeWeek({ ...BASE, workingNumbers: { squat: SQUAT }, meLastRepsByPattern: { press_lower: [6] }, week: 4, column: 'standard' } as never);
  const squat = wk.sessions.flatMap((s: any) => s.strength_exercises ?? []).find((e: any) => e.name === 'Back Squat');
  assert(squat, 'no squat ME row in the fixture week');
  assertEquals(squat.reps, `${ME_BAND.lo}-${ME_BAND.hi}`);
  const top = (squat.set_plan ?? []).filter((p: any) => p?.warmup !== true);
  assert(top.length > 0, 'no working step on the squat row');
  for (const p of top) assert(p.reps == null || p.reps <= ME_BAND.hi, `the heavy set opens at ${p.reps}, above the ${ME_BAND.lo}-${ME_BAND.hi} band`);
  assert(Number(squat.weight) > 0 && Number(squat.weight) < SQUAT.workingNumber, 'the squat is not priced off its working number');
});
