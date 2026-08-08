/**
 * Fixtures for delete-goal's plan-link scoping (Task 3 of the 2026-08-07
 * placement/deletion handoff — unify plan deletion).
 *
 * The two scopes these pin, and why they differ:
 *   - TEARDOWN (`plansLinkedToGoal`) takes the status scope from its caller. A
 *     directly-linked plan is swept whatever its status; the `goals_served`
 *     over-fetch is live-only, so removing a race does not delete a finished
 *     season's combined plan.
 *   - REBUILD (`rebuildSiblingGoalIds`) counts LIVE plans only, so a directly-
 *     linked completed combined plan cannot trigger a new build.
 *
 * The PHANTOM case (a goal whose plan was already deleted by the old
 * weekly-planner path) is the regression case: zero linked plans, zero
 * siblings, no rebuild — the delete must be a plain goal-row delete.
 *
 * Run: deno test supabase/functions/delete-goal/plan-goal-links.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  goalsServedFromPlan,
  isCombinedPlan,
  isLivePlan,
  plansLinkedToGoal,
  rebuildSiblingGoalIds,
  type PlanRow,
} from './plan-goal-links.ts';

const GOAL_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GOAL_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GOAL_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function standalone(id: string, goalId: string | null, status = 'active'): PlanRow {
  return { id, goal_id: goalId, config: {}, plan_type: 'run', status };
}

function combined(id: string, primary: string, served: string[], status = 'active'): PlanRow {
  return {
    id,
    goal_id: primary,
    config: { plan_contract_v1: { plan_type: 'multi_sport', goals_served: served } },
    plan_type: 'multi_sport',
    status,
  };
}

// --- goalsServedFromPlan ------------------------------------------------------

Deno.test('goalsServedFromPlan: standalone plan falls back to plans.goal_id', () => {
  assertEquals(goalsServedFromPlan(standalone('p1', GOAL_A)), [GOAL_A]);
});

Deno.test('goalsServedFromPlan: combined plan reads goals_served, de-duped and trimmed', () => {
  const p = combined('p1', GOAL_A, [GOAL_A, ` ${GOAL_B} `, GOAL_A, '']);
  assertEquals(goalsServedFromPlan(p), [GOAL_A, GOAL_B]);
});

Deno.test('goalsServedFromPlan: no goal at all → empty', () => {
  assertEquals(goalsServedFromPlan(standalone('p1', null)), []);
  assertEquals(goalsServedFromPlan(null), []);
});

Deno.test('isCombinedPlan: only >1 served goal counts as combined', () => {
  assertEquals(isCombinedPlan(standalone('p1', GOAL_A)), false);
  assertEquals(isCombinedPlan(combined('p2', GOAL_A, [GOAL_A])), false);
  assertEquals(isCombinedPlan(combined('p3', GOAL_A, [GOAL_A, GOAL_B])), true);
});

Deno.test('isLivePlan: active/paused/rolling only', () => {
  for (const s of ['active', 'paused', 'rolling', 'ACTIVE', ' Paused ']) {
    assertEquals(isLivePlan(standalone('p', GOAL_A, s)), true, s);
  }
  for (const s of ['completed', 'ended', 'draft', '', 'archived']) {
    assertEquals(isLivePlan(standalone('p', GOAL_A, s)), false, s);
  }
});

// --- plansLinkedToGoal (teardown scope) --------------------------------------

Deno.test('plansLinkedToGoal: PHANTOM — goal with no plans yields nothing to tear down', () => {
  assertEquals(plansLinkedToGoal([], [standalone('p1', GOAL_B)], GOAL_A), []);
  assertEquals(plansLinkedToGoal(null, null, GOAL_A), []);
});

Deno.test('plansLinkedToGoal: direct goal_id match, any status', () => {
  const direct = [standalone('p1', GOAL_A, 'completed')];
  assertEquals(plansLinkedToGoal(direct, [], GOAL_A).map((p) => p.id), ['p1']);
});

Deno.test('plansLinkedToGoal: matches on goals_served, not just goal_id', () => {
  const candidates = [combined('p9', GOAL_B, [GOAL_B, GOAL_A])];
  assertEquals(plansLinkedToGoal([], candidates, GOAL_A).map((p) => p.id), ['p9']);
});

Deno.test('plansLinkedToGoal: the caller owns the status scope — the helper filters none', () => {
  // delete-goal passes a LIVE-only candidate list, so an ended combined plan
  // never reaches here. Pinned so a future caller change is a deliberate one:
  // widening the query would start deleting season history.
  const ended = [combined('p9', GOAL_B, [GOAL_B, GOAL_A], 'ended')];
  assertEquals(plansLinkedToGoal([], ended, GOAL_A).map((p) => p.id), ['p9']);
});

Deno.test('plansLinkedToGoal: de-dupes across the two queries, direct first', () => {
  const shared = combined('p1', GOAL_A, [GOAL_A, GOAL_B]);
  const out = plansLinkedToGoal([shared], [shared, combined('p2', GOAL_B, [GOAL_B, GOAL_A])], GOAL_A);
  assertEquals(out.map((p) => p.id), ['p1', 'p2']);
});

Deno.test('plansLinkedToGoal: unrelated plans are left alone', () => {
  const candidates = [
    standalone('p1', GOAL_B),
    combined('p2', GOAL_B, [GOAL_B, GOAL_C]),
  ];
  assertEquals(plansLinkedToGoal([], candidates, GOAL_A), []);
});

// --- rebuildSiblingGoalIds (rebuild scope) -----------------------------------

Deno.test('rebuildSiblingGoalIds: PHANTOM — no plans, no rebuild', () => {
  assertEquals(rebuildSiblingGoalIds([], GOAL_A), []);
});

Deno.test('rebuildSiblingGoalIds: live combined plan yields its other goals', () => {
  const plans = [combined('p1', GOAL_A, [GOAL_A, GOAL_B, GOAL_C], 'active')];
  assertEquals(rebuildSiblingGoalIds(plans, GOAL_A).sort(), [GOAL_B, GOAL_C].sort());
});

Deno.test('rebuildSiblingGoalIds: a standalone plan never triggers a rebuild', () => {
  assertEquals(rebuildSiblingGoalIds([standalone('p1', GOAL_A)], GOAL_A), []);
});

Deno.test('rebuildSiblingGoalIds: a COMPLETED combined plan does not trigger a rebuild', () => {
  const plans = [combined('p1', GOAL_A, [GOAL_A, GOAL_B], 'completed')];
  assertEquals(rebuildSiblingGoalIds(plans, GOAL_A), []);
});

Deno.test('rebuildSiblingGoalIds: mixed — only the live plan contributes', () => {
  const plans = [
    combined('old', GOAL_A, [GOAL_A, GOAL_C], 'ended'),
    combined('now', GOAL_A, [GOAL_A, GOAL_B], 'paused'),
  ];
  assertEquals(rebuildSiblingGoalIds(plans, GOAL_A), [GOAL_B]);
});
