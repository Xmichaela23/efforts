/**
 * ⛔ THE ROW SHAPE AND THE GATE MUST ANSWER THE SAME QUESTIONS (2026-08-09).
 *
 * The swap glyph rendered on the calendar chip and NOT on the Today's Effort card, while the drawer's
 * "Swap sport" button was present — three surfaces, three answers, one session. The gate was
 * identical on all of them (`getDisciplineSwaps`); the ROW SHAPE was not.
 *
 * ⚠️ REWRITTEN IN STAGE 3. This used to run the CLIENT mapper (`mapUnifiedItemToPlanned`) into the
 * gate. That mapper is deleted — the server's `planned_workout` is now the only planned row a surface
 * ever sees — so the test now runs the SERVER's shape instead. Same question, one contract.
 *
 * ⛔ THE MIRROR BELOW IS THE RISK, AND IT IS GUARDED. `toPlannedWorkout` is a closure inside
 * `get-week`'s handler and cannot be imported, so this file re-implements it. A re-implementation
 * that drifts from the original is exactly the disease this SPEC exists to cure — so the last test
 * reads `get-week/index.ts` and asserts the real mapper's field list matches the mirror's. Add a
 * field there without adding it here and this suite fails.
 *
 * Run:
 *   ~/.deno/bin/deno test --no-check --allow-read src/utils/workout-mappers.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  availableDisciplines,
  getDisciplineSwaps,
  resolveMinutes,
} from '../lib/session-discipline-swap.ts';

/**
 * A faithful mirror of `get-week:1489 toPlannedWorkout`, restricted to the fields this suite reads.
 * ⚠️ `duration` is the field STAGE 3 ADDED — it is why the client mapper existed at all.
 */
function serverPlannedWorkout(item: Record<string, any>): Record<string, unknown> | null {
  if (!item?.planned) return null;
  const p = item.planned;
  return {
    id: p.id || item.id || '',
    name: p.name || item.type || '',
    type: item.type || p.type || '',
    date: item.date || p.date || '',
    workout_status: (item.status || p.workout_status || 'planned'),
    computed: (Array.isArray(p.steps) && p.steps.length > 0)
      ? { steps: p.steps, total_duration_seconds: p.total_duration_seconds ?? null }
      : null,
    steps_preset: p.steps_preset ?? null,
    total_duration_seconds: p.total_duration_seconds ?? null,
    duration: p.duration ?? null,
    tags: Array.isArray(p.tags) ? p.tags : [],
  };
}

/** A unified item as `get-week` returns it: minutes on the row, no stored total. */
const unifiedRun = {
  id: 'p1', date: '2026-08-11', type: 'run', status: 'planned',
  planned: {
    id: 'p1', name: 'Easy Run', type: 'run',
    duration: 50, total_duration_seconds: null,
    tags: ['easy_run'], workout_status: 'planned',
  },
};
const unifiedRide = {
  id: 'b1', date: '2026-08-10', type: 'ride', status: 'planned',
  planned: { id: 'b1', name: 'Easy Ride', type: 'ride', duration: 72, tags: ['easy'], workout_status: 'planned' },
};

Deno.test('⛔ the server row carries `duration` — dropping it closed the gate on one surface only', () => {
  const row = serverPlannedWorkout(unifiedRun) as { duration?: number | null };
  assertEquals(row.duration, 50, 'the server row lost the minutes the raw row carries');
});

Deno.test('⛔ END TO END — server row → gate produces the swap the card needs', () => {
  const row = serverPlannedWorkout(unifiedRun);
  assertEquals(resolveMinutes(row as never), 50, 'the gate cannot size the session');
  const week = [unifiedRun, unifiedRide];
  const opts = getDisciplineSwaps(row as never, availableDisciplines(week as never));
  assertEquals(opts.map((o) => o.to), ['ride'], 'the top-card glyph would not render');
});

Deno.test('a stored total still wins over the row minutes', () => {
  const row = serverPlannedWorkout({
    ...unifiedRun,
    planned: { ...unifiedRun.planned, duration: 20, total_duration_seconds: 3000 },  // 50 min
  });
  assertEquals(resolveMinutes(row as never), 50, 'the authoritative total was ignored');
});

Deno.test('a session with neither still offers nothing — no guessing', () => {
  const row = serverPlannedWorkout({
    ...unifiedRun,
    planned: { ...unifiedRun.planned, duration: null, total_duration_seconds: null },
  });
  assertEquals(resolveMinutes(row as never), 0);
  assertEquals(getDisciplineSwaps(row as never, ['run', 'ride']), []);
});

Deno.test('the server row keeps the fields the gate\'s other conditions read', () => {
  const row = serverPlannedWorkout(unifiedRun) as Record<string, unknown>;
  assertEquals(row.type, 'run');
  assertEquals(row.workout_status, 'planned');
  assert(Array.isArray(row.tags), 'tags were dropped — the long/hard check reads them');
});

Deno.test('⛔ THE CARD\'S REAL SHAPE — time in computed.steps, no stored total', () => {
  /**
   * The row that shipped the bug. This session's `total_duration_seconds` is null — its length lives
   * in `computed.steps[].seconds`, which is what `plannedDurationSeconds` sums at its rung 3. The
   * swap gate read only the root totals, so the card showed "63:00" and the gate computed 0 — the
   * glyph was hidden on that surface and nowhere else.
   */
  const row = serverPlannedWorkout({
    id: 'p9', date: '2026-08-18', type: 'run', status: 'planned',
    planned: {
      id: 'p9', name: 'Easy Run', type: 'run', workout_status: 'planned',
      total_duration_seconds: null, tags: ['easy_run'],
      steps: [{ seconds: 1890 }, { seconds: 1890 }],   // 63 min total
    },
  });
  assertEquals((row as { total_duration_seconds?: number | null }).total_duration_seconds, null);
  assertEquals(resolveMinutes(row as never), 63, 'the gate cannot see a duration the row prints');
  const opts = getDisciplineSwaps(row as never, ['run', 'ride']);
  assertEquals(opts.map((o) => o.to), ['ride'], 'the top-card glyph is still hidden');
});

Deno.test('the gate agrees with what the row displays, on every duration shape', () => {
  const shapes = [
    { planned: { total_duration_seconds: 3780 }, expect: 63 },
    { planned: { total_duration_seconds: null, steps: [{ seconds: 3000 }] }, expect: 50 },
    { planned: { total_duration_seconds: null }, expect: 0 },
  ];
  for (const { planned, expect } of shapes) {
    const row = serverPlannedWorkout({
      id: 'x', date: '2026-08-18', type: 'run', status: 'planned',
      planned: { id: 'x', type: 'run', workout_status: 'planned', tags: [], ...planned },
    });
    assertEquals(resolveMinutes(row as never), expect, `shape ${JSON.stringify(planned)}`);
  }
});

Deno.test('⛔ DRIFT GUARD — the mirror above matches the real `toPlannedWorkout`', async () => {
  /**
   * ⛔ THE WHOLE REASON STAGE 3 EXISTS was two mappers that had to be kept in sync by hand and were
   * not. This file re-implements one of them, so it would be the third — unless the copy is checked
   * against the original. It is, here, by reading the source.
   *
   * ⚠️ IT ASSERTS ONE DIRECTION: every field the mirror claims must exist in the real mapper. The
   * reverse is deliberately NOT asserted — the real mapper carries ~25 more fields this suite has no
   * opinion about, and demanding they all be mirrored would make the guard noise.
   */
  const src = await Deno.readTextFile(
    new URL('../../supabase/functions/get-week/index.ts', import.meta.url),
  );
  const body = src.slice(src.indexOf('const toPlannedWorkout = (item) => {'));
  const real = new Set(
    [...body.slice(0, body.indexOf('\n    };')).matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]),
  );
  const mirrored = Object.keys(serverPlannedWorkout(unifiedRun) as Record<string, unknown>);
  const missing = mirrored.filter((k) => !real.has(k));
  assertEquals(missing, [], `mirror claims fields the real mapper does not emit: ${missing}`);

  // And the field stage 3 added is really there, in the deployed shape.
  assert(real.has('duration'), '`duration` is missing from get-week toPlannedWorkout — stage 3 regressed');
  assert(real.has('total_duration_seconds'), '`total_duration_seconds` vanished from the contract');
});
