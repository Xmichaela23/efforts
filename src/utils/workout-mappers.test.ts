/**
 * ⛔ THE MAPPED ROW AND THE RAW ROW MUST ANSWER THE SAME QUESTIONS (2026-08-09).
 *
 * The swap glyph rendered on the calendar chip and NOT on the Today's Effort card, while the drawer's
 * "Swap sport" button was present — three surfaces, three answers, one session. The gate was
 * identical on all of them (`getDisciplineSwaps`); the ROW SHAPE was not.
 *
 * The calendar reads the raw `planned_workouts` row (`_src`). Today's card reads
 * `mapUnifiedItemToPlanned(item)` — which carried `total_duration_seconds` and **dropped `duration`
 * entirely**. On a session whose total was never materialised, the mapped copy therefore had no
 * duration at all, `resolveMinutes` returned 0, and the gate closed. Silently, and only on that
 * surface.
 *
 * ⚠️ THIS IS THE TEST THE UNIT TESTS COULD NOT BE. `session-discipline-swap.test.ts` was green
 * throughout — it tested the gate against a row shape the app does not actually hand it. This one
 * runs the REAL mapper into the REAL gate.
 *
 * Run:
 *   ~/.deno/bin/deno test --no-check --allow-read --unstable-sloppy-imports \
 *     --import-map=<map with @/ -> src/> src/utils/workout-mappers.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapUnifiedItemToPlanned } from './workout-mappers.ts';
import {
  availableDisciplines,
  getDisciplineSwaps,
  resolveMinutes,
} from '../lib/session-discipline-swap.ts';

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

Deno.test('⛔ the mapper carries `duration` — dropping it closed the gate on one surface only', () => {
  const mapped = mapUnifiedItemToPlanned(unifiedRun as never) as { duration?: number | null };
  assertEquals(mapped.duration, 50, 'the mapped row lost the minutes the raw row carries');
});

Deno.test('⛔ END TO END — mapper → gate produces the swap the card needs', () => {
  const mapped = mapUnifiedItemToPlanned(unifiedRun as never);
  assertEquals(resolveMinutes(mapped as never), 50, 'the gate cannot size the session');
  const week = [unifiedRun, unifiedRide];
  const opts = getDisciplineSwaps(mapped as never, availableDisciplines(week as never));
  assertEquals(opts.map((o) => o.to), ['ride'], 'the top-card glyph would not render');
});

Deno.test('a stored total still wins over the row minutes', () => {
  const withTotal = {
    ...unifiedRun,
    planned: { ...unifiedRun.planned, duration: 20, total_duration_seconds: 3000 },  // 50 min
  };
  const mapped = mapUnifiedItemToPlanned(withTotal as never);
  assertEquals(resolveMinutes(mapped as never), 50, 'the authoritative total was ignored');
});

Deno.test('a session with neither still offers nothing — no guessing', () => {
  const noTime = {
    ...unifiedRun,
    planned: { ...unifiedRun.planned, duration: null, total_duration_seconds: null },
  };
  const mapped = mapUnifiedItemToPlanned(noTime as never);
  assertEquals(resolveMinutes(mapped as never), 0);
  assertEquals(getDisciplineSwaps(mapped as never, ['run', 'ride']), []);
});

Deno.test('the mapped row keeps the fields the gate\'s other conditions read', () => {
  const mapped = mapUnifiedItemToPlanned(unifiedRun as never) as Record<string, unknown>;
  assertEquals(mapped.type, 'run');
  assertEquals(mapped.workout_status, 'planned');
  assert(Array.isArray(mapped.tags), 'tags were dropped — the long/hard check reads them');
});


Deno.test('⛔ THE CARD\'S REAL SHAPE — time in computed.steps, no stored total', () => {
  /**
   * The row that shipped the bug. `get-week`'s planned select carries no `duration` column, and this
   * session's `total_duration_seconds` is null — its length lives in `computed.steps[].seconds`,
   * which is exactly what `resolveMovingSeconds` (the resolver the ROW prints with) sums at its
   * Priority 3. The swap gate read only the root totals, so the card showed "63:00" and the gate
   * computed 0 — the glyph was hidden on that surface and nowhere else.
   */
  const item = {
    id: 'p9', date: '2026-08-18', type: 'run', status: 'planned',
    planned: {
      id: 'p9', name: 'Easy Run', type: 'run', workout_status: 'planned',
      total_duration_seconds: null, tags: ['easy_run'],
      steps: [{ seconds: 1890 }, { seconds: 1890 }],   // 63 min total
    },
  };
  const mapped = mapUnifiedItemToPlanned(item as never);
  assertEquals((mapped as { total_duration_seconds?: number | null }).total_duration_seconds, null);
  assertEquals(resolveMinutes(mapped as never), 63, 'the gate cannot see a duration the row prints');
  const opts = getDisciplineSwaps(mapped as never, ['run', 'ride']);
  assertEquals(opts.map((o) => o.to), ['ride'], 'the top-card glyph is still hidden');
});

Deno.test('the gate agrees with what the row displays, on every duration shape', () => {
  // Whatever `resolveMovingSeconds` finds is what the athlete sees; the gate must not disagree.
  const shapes = [
    { planned: { total_duration_seconds: 3780 }, expect: 63 },
    { planned: { total_duration_seconds: null, steps: [{ seconds: 3000 }] }, expect: 50 },
    { planned: { total_duration_seconds: null }, expect: 0 },
  ];
  for (const { planned, expect } of shapes) {
    const mapped = mapUnifiedItemToPlanned({
      id: 'x', date: '2026-08-18', type: 'run', status: 'planned',
      planned: { id: 'x', type: 'run', workout_status: 'planned', tags: [], ...planned },
    } as never);
    assertEquals(resolveMinutes(mapped as never), expect, `shape ${JSON.stringify(planned)}`);
  }
});
