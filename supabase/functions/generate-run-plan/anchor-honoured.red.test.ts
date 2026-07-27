/**
 * ⛔ THESE TESTS ARE RED ON PURPOSE. DO NOT "FIX" THEM. DO NOT SKIP THEM.
 *
 * They assert the two things `base-generator.assignDaysToSessions` gets wrong, and they stay red
 * until the week solver takes its callers. **They are the tripwire on calling the collapse done.**
 *
 * ⛔ WHY NO STOPGAP. Patching `base-generator` means repairing a module scheduled for deletion —
 * the same call made on Q-206. Michael is the only user, pre-launch, so there is no blast radius to
 * justify fixing a path that is coming out. But a bug with no test is a bug that gets forgotten, and
 * this one is invisible from the outside: nothing logs it, nothing warns, the plan just comes back
 * with a different day than the athlete asked for.
 *
 * ⛔ WHY THIS ONE MATTERS MORE THAN ITS SIZE. Michael, 2026-07-27: *"the athlete states a pin and the
 * engine silently returns a different day — that's the glass-box promise broken at the input layer.
 * A wrong placement can at least explain itself; this one can't, because nothing knows it happened."*
 * And the long run is a HARD constraint (SPEC-week-solver §0a #1): a user-pinned anchor, immovable,
 * outranking everything below it. This is not a scoring miss. It is a constraint that is not read.
 *
 * WHEN THE SOLVER LANDS: these should go green with no edit. If you find yourself changing the
 * ASSERTIONS to make them pass, the solver did not take the constraint — it inherited the grid.
 *
 * Filed as SPEC-week-solver §6b-1 X1 and X2.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { Session } from './types.ts';

/**
 * The grid, lifted verbatim from `base-generator.ts:697 assignDaysToSessions` so the test does not
 * need the generator's full parameter set. ⚠️ If that function changes, change this — it is a mirror,
 * and a mirror that drifts is worse than no test. The point is what it DOES, not how it is reached.
 */
function currentGridBehaviour(sessions: Session[]): Session[] {
  const easyDayOrder = ['Monday', 'Wednesday', 'Friday'];
  const qualityDays = ['Tuesday', 'Thursday'];
  const restDays = new Set(['Saturday']);
  const usedDays = new Set<string>();
  const out: Session[] = [];

  for (const s of sessions.filter((x) => x.tags.includes('long_run'))) {
    if (!usedDays.has('Sunday') && !restDays.has('Sunday')) {
      s.day = 'Sunday';
      usedDays.add('Sunday');
      out.push(s);
    }
  }
  for (const s of sessions.filter((x) => x.tags.some((t) => ['hard_run', 'intervals', 'tempo', 'threshold'].includes(t)))) {
    for (const d of qualityDays) {
      if (!usedDays.has(d) && !restDays.has(d)) { s.day = d; usedDays.add(d); out.push(s); break; }
    }
  }
  for (const s of sessions.filter((x) => !x.tags.includes('long_run') && !x.tags.some((t) => ['hard_run', 'intervals', 'tempo', 'threshold'].includes(t)))) {
    for (const d of easyDayOrder) {
      if (!usedDays.has(d) && !restDays.has(d)) { s.day = d; usedDays.add(d); out.push(s); break; }
    }
  }
  return out;
}

const session = (name: string, tags: string[]): Session => ({
  day: '', type: 'run', name, description: '', duration: 60, tags,
});

Deno.test('⛔ RED UNTIL THE SOLVER: an athlete who asks for a Saturday long run gets Saturday', () => {
  // `schedule_preferences.long_run_day` is declared at types.ts:264 and read NOWHERE in
  // generate-run-plan. The generator hardcodes `const preferredDay = 'Sunday'`
  // (base-generator.ts:729) with no input that can change it. The athlete's answer is collected,
  // stored, and never consulted.
  const week = currentGridBehaviour([
    session('Long Run', ['long_run']),
    session('Intervals', ['intervals']),
    session('Easy', ['easy']),
  ]);
  const longRun = week.find((s) => s.tags.includes('long_run'))!;
  assertEquals(
    longRun.day, 'Saturday',
    'the long run is a HARD anchor (§0a #1) — the athlete asked for Saturday and the engine returned ' +
    `${longRun.day} without saying so. Nothing logs this, nothing warns, and the plan looks correct.`,
  );
});

Deno.test('⛔ RED UNTIL THE SOLVER: Saturday is a training day, not a hardcoded rest day', () => {
  // base-generator: `const restDays = new Set(['Saturday'])` — always, for every run plan, for all
  // six generators behind it. Every other live decider treats Saturday as a working day, and in two
  // of them it is the DEFAULT long-ride day. Two modules cannot both be right about one weekday.
  const week = currentGridBehaviour([
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
