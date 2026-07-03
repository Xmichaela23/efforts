/**
 * Plan claim-grounding — pre-start weeks must not narrate as in-block (D-232).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/plan-week.test.ts --no-check
 *
 * The bug: resolvePlanWeekIndex clamps pre-start to week 1 (Math.max(1,…)), so a plan starting NEXT
 * week reads as "week 1" and the narrative asserts "one week into the block" over this week's off-plan
 * sessions. planHasStarted is the ground truth; buildPlanContextLine must make no in-block claim pre-start.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { planHasStarted, planWeek1StartIso, buildPlanContextLine } from './plan-week.ts';

// week_start defaults to Monday. A plan starting Mon 2026-07-06.
const PLAN = { start_date: '2026-07-06', plan_contract_v1: { week_start: 'mon' } };

Deno.test('planHasStarted: today BEFORE plan week-1 start → false (pre-start)', () => {
  assertEquals(planHasStarted(PLAN, '2026-07-03'), false); // Fri before the Mon start
  assertEquals(planHasStarted(PLAN, '2026-07-05'), false); // Sun, still before
});
Deno.test('planHasStarted: today ON/AFTER plan week-1 start → true', () => {
  assertEquals(planHasStarted(PLAN, '2026-07-06'), true); // the Monday itself
  assertEquals(planHasStarted(PLAN, '2026-07-10'), true);
});
Deno.test('planHasStarted: mid-week start resolves to its week-start Monday', () => {
  // start on Wed 2026-07-08 → week-1 start is Mon 2026-07-06; a Sun 07-05 view is pre-start
  const midweek = { start_date: '2026-07-08', plan_contract_v1: { week_start: 'mon' } };
  assertEquals(planWeek1StartIso(midweek), '2026-07-06');
  assertEquals(planHasStarted(midweek, '2026-07-05'), false);
  assertEquals(planHasStarted(midweek, '2026-07-06'), true);
});
Deno.test('planHasStarted: no start date → true (preserve legacy narration)', () => {
  assertEquals(planHasStarted({}, '2026-07-03'), true);
});

// ── buildPlanContextLine — the claim-grounding contract ──────────────────────────────────────────
Deno.test('pre-start line makes NO in-block claim (the fixture the bug demands)', () => {
  const line = buildPlanContextLine({
    planName: 'Get Stronger', totalWeeks: 12, weekIndex: 1, weekIntent: 'build',
    hasStarted: false, planStartDisplay: 'Monday, Jul 6',
  });
  assert(line.includes('has NOT started yet'));
  assert(line.includes('PRE-PLAN'));
  assert(line.includes('It begins Monday, Jul 6'));
  // No AFFIRMATIVE in-block claim. (The line DOES contain "in week N"/"N weeks into" inside the
  // "do NOT say …" instruction — that's intentional guidance, not a claim; assert on the affirmative.)
  assert(!line.includes('currently in week'), 'must not affirmatively place the athlete in a plan week');
  assert(!line.includes('The athlete is on'), 'must not use the in-block opener');
});
Deno.test('started line carries the normal in-block phase', () => {
  const line = buildPlanContextLine({
    planName: 'Get Stronger', totalWeeks: 12, weekIndex: 3, weekIntent: 'build',
    hasStarted: true, planStartDisplay: null,
  });
  assert(line.includes('currently in week 3'));
  assert(line.includes('a build week'));
});
