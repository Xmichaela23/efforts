// State follows the plan's lifts (2026-09-29). Run: ~/.deno/bin/deno test --no-check --allow-read --allow-env supabase/functions/coach/plan-lifts.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { displayFollowingPlan, type PlanLifts } from './plan-lifts.ts';
import { buildStrengthLoggedSets } from './strength-logged-sets.ts';

const plan: PlanLifts = { canonicals: new Set(['squat', 'bench_press', 'trap_bar_deadlift', 'tate_press', 'goblet_squat']), startDate: '2026-09-01' };

Deno.test('the lift cards keep only the main lifts the plan has; other rows pass through; no plan changes nothing', () => {
  const display = { strengthFitness: { perLift: [
    { canonical: 'squat', isPrimary: true }, { canonical: 'deadlift', isPrimary: true },
    { canonical: 'trap_bar_deadlift', isPrimary: true }, { canonical: 'overhead_press', isPrimary: true },
    { canonical: 'curl', isPrimary: false },
  ] }, other: 1 };
  assertEquals(displayFollowingPlan(display, plan).strengthFitness.perLift.map((l) => l.canonical), ['squat', 'trap_bar_deadlift', 'curl']);
  assertEquals(displayFollowingPlan(display, null), display);
  assertEquals(displayFollowingPlan(null, plan), null);
});

Deno.test('best sets: the plan\'s lifts only, upper or lower, "start → best" from the plan\'s first session', () => {
  const lift = (canonical: string, history: Array<[string, number, number]>) => ({
    canonical, displayName: canonical, sessions: history.length, recent: [],
    heaviest: history.reduce((b, [date, weight, reps]) => (weight > (b?.weight ?? 0) ? { date, weight, reps } : b), null as any),
    history: history.map(([date, weight, reps]) => ({ date, weight, reps })),
  });
  const out = buildStrengthLoggedSets([
    lift('tate_press', [['2026-08-20', 40, 12], ['2026-09-02', 25, 12], ['2026-09-20', 35, 12]]),
    lift('goblet_squat', [['2026-09-03', 45, 12], ['2026-09-17', 45, 12]]),
    lift('hammer_curl', [['2026-09-03', 30, 10], ['2026-09-10', 30, 10]]),
  ], [], false, plan)!;
  assertEquals(out.others.map((o) => [o.canonical, o.group, o.start_line ?? null, o.set_line]), [
    ['tate_press', 'upper', '25 lb × 12', '35 lb × 12'],
    ['goblet_squat', 'lower', null, '45 lb × 12'],
  ]);
  // no plan: every lift, no groups, as before
  const flat = buildStrengthLoggedSets([lift('hammer_curl', [['2026-09-03', 30, 10], ['2026-09-10', 30, 10]])], [], false, null)!;
  assertEquals(flat.others.map((o) => [o.canonical, o.group ?? null]), [['hammer_curl', null]]);
});
