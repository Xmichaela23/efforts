/**
 * ⛔ THESE WERE RED ON PURPOSE. THEY ARE NOW GREEN, AND THE ASSERTIONS DID NOT MOVE.
 *
 * The file's original header said: *"WHEN THE SOLVER LANDS: these should go green with no edit. If
 * you find yourself changing the ASSERTIONS to make them pass, the solver did not take the
 * constraint — it inherited the grid."* That instruction is honoured — every assertion below is
 * byte-for-byte what it was. What changed is the SUBJECT: they used to run against a hand-copied
 * mirror of `base-generator`'s grid declared inside this file, and a mirror can never go green by
 * fixing the original. They now import the real placement function.
 *
 * ⚠️ AND THE SOLVER HAS NOT LANDED — READ THIS BEFORE CROSSING ANYTHING OFF. `_shared/week-solver.ts`
 * still has not taken the run generators; that is SPEC-week-solver §7 and it remains open. What
 * landed (2026-08-05) is narrower: `assign-days.ts` READS THE TWO PINS and stops dropping sessions.
 * The original file argued against exactly this — *"WHY NO STOPGAP: patching `base-generator` means
 * repairing a module scheduled for deletion, the same call made on Q-206"* — and that argument was
 * correct while the cost was theoretical. It stopped being theoretical when the marathon intake
 * began collecting the club night and printing *"The plan puts its hard running there"* under it.
 * Michael, 2026-08-05, on a plan that answered that promise with an easy run: *"we need to juggle
 * whether run club is quality day ... placement should be figured out."*
 *
 * So this file changes role: it was a tripwire on calling the collapse done, and it is now the
 * regression on the pins being read. The collapse is still owed. Do not let green here read as done
 * there.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { Session } from './types.ts';
import { assignDays } from './generators/assign-days.ts';

const session = (name: string, tags: string[]): Session => ({
  day: '', type: 'run', name, description: '', duration: 60, tags,
});

Deno.test('an athlete who asks for a Saturday long run gets Saturday', () => {
  // `schedule_preferences.long_run_day` was declared at types.ts:264 and read NOWHERE in
  // generate-run-plan. The generator hardcoded `const preferredDay = 'Sunday'`
  // (base-generator.ts:729) with no input that could change it. The athlete's answer was collected,
  // stored, and never consulted.
  const week = assignDays([
    session('Long Run', ['long_run']),
    session('Intervals', ['intervals']),
    session('Easy', ['easy']),
  ], { long_run: 'saturday' });
  const longRun = week.find((s) => s.tags.includes('long_run'))!;
  assertEquals(
    longRun.day, 'Saturday',
    'the long run is a HARD anchor (§0a #1) — the athlete asked for Saturday and the engine returned ' +
    `${longRun.day} without saying so. Nothing logs this, nothing warns, and the plan looks correct.`,
  );
});

Deno.test('Saturday is a training day, not a hardcoded rest day', () => {
  // base-generator: `const restDays = new Set(['Saturday'])` — always, for every run plan, for all
  // six generators behind it. Every other live decider treats Saturday as a working day, and in two
  // of them it is the DEFAULT long-ride day. Two modules cannot both be right about one weekday.
  const week = assignDays([
    session('Long Run', ['long_run']),
    session('Intervals', ['intervals']),
    session('Tempo', ['tempo']),
    session('Easy 1', ['easy']),
    session('Easy 2', ['easy']),
    session('Easy 3', ['easy']),
    session('Easy 4', ['easy']),
  ]);
  const placed = new Set(week.map((s) => s.day));
  assertEquals(
    placed.has('Saturday'), true,
    'seven sessions and Saturday is still empty — it is excluded by hardcode, not by a rule. ' +
    `Placed: ${[...placed].sort().join(', ')}. One session was silently dropped for want of a day.`,
  );
});
