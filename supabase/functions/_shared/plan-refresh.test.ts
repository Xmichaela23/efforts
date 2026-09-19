import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isRefreshable, isStaleRow, isStandingPlanConfig, PLAN_WRITER_VERSION, writerVersionOf } from './plan-refresh.ts';

const T = '2026-09-18';

Deno.test('a row with no stamp reads as version 0; the stamp is read off computed or its selected key', () => {
  assertEquals(writerVersionOf({ computed: null }), 0);
  assertEquals(writerVersionOf({ computed: { normalization_version: 'v3', steps: [] } }), 0);
  assertEquals(writerVersionOf({ computed: { writer_version: PLAN_WRITER_VERSION } }), PLAN_WRITER_VERSION);
  assertEquals(writerVersionOf({ writer_version: PLAN_WRITER_VERSION }), PLAN_WRITER_VERSION);
});

Deno.test('only an expanded session not done, dated today or later, written older, is stale', () => {
  const old = { normalization_version: 'v3', writer_version: PLAN_WRITER_VERSION - 1 };
  assertEquals(isStaleRow({ ...old, date: T, workout_status: 'planned' }, T), true);
  assertEquals(isStaleRow({ normalization_version: 'v3', date: T }, T), true, 'no stamp at all');
  assertEquals(isStaleRow({ ...old, date: '2026-09-17', workout_status: 'planned' }, T), false, 'before today');
  assertEquals(isStaleRow({ ...old, date: T, workout_status: 'completed' }, T), false, 'done');
  assertEquals(isStaleRow({ ...old, date: T, workout_status: 'skipped' }, T), false, 'skipped');
  assertEquals(isStaleRow({ ...old, date: T, completed_workout_id: 'w' }, T), false, 'linked');
  assertEquals(isStaleRow({ date: T, computed: null }, T), false, 'never expanded — get-week expands it');
  assertEquals(isStaleRow({ date: T, normalization_version: 'v3', writer_version: PLAN_WRITER_VERSION }, T), false, 'current');
  assertEquals(isRefreshable({ date: '2026-09-25' }, T), true);
});

Deno.test('the Standing Plan block is recognised in both dialects, nothing else is', () => {
  assertEquals(isStandingPlanConfig({ strength_protocol: 'standing_plan' }), true);
  assertEquals(isStandingPlanConfig({ source: 'Standing_Plan' }), true);
  assertEquals(isStandingPlanConfig({ source: 'strength_primary' }), false);
  assertEquals(isStandingPlanConfig(null), false);
});

Deno.test('the athlete\'s day: 18:00 Pacific on the 18th is the 18th, while UTC is already the 19th', async () => {
  const { athleteToday } = await import('./plan-refresh.ts');
  const client = (tz: string | null) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: tz } }) }) }) }) });
  const at = new Date('2026-09-19T01:00:00Z'); // 18:00 PDT on 2026-09-18
  assertEquals(await athleteToday(client('America/Los_Angeles'), 'u', at), '2026-09-18');
  assertEquals(await athleteToday(client(null), 'u', at), '2026-09-19', 'no zone on file = UTC');
  assertEquals(await athleteToday(client('Not/AZone'), 'u', at), '2026-09-19', 'a bad zone is discarded');
});
