/**
 * SWIM 7-day session breakdown — planned → completion %, unplanned → distance; NEVER pace (Q-038-safe).
 *   deno test supabase/functions/_shared/swim-sessions.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSwimSessions7d } from './swim-sessions.ts';

const swim = (over: Record<string, unknown>) => ({
  type: 'swim', workout_status: 'completed', date: '2026-07-10', ...over,
});
const wa = (exec: number | null, distM: number | null) => ({
  session_state_v1: { glance: { execution_score: exec } },
  detailed_analysis: { workout_summary: { total_distance: distM, total_distance_unit: 'meters' } },
});

Deno.test('planned swim carries execution %, unplanned carries null %', () => {
  const out = buildSwimSessions7d([
    swim({ planned_id: 'p1', date: '2026-07-10', workout_analysis: wa(95, 1200) }),
    swim({ planned_id: null, date: '2026-07-08', workout_analysis: wa(88, 900) }),
  ]);
  assertEquals(out.length, 2);
  assertEquals(out[0], { date: '2026-07-10', planned: true, execution_pct: 95, distance_m: 1200 });
  // unplanned → no % even if the analyzer graded one; distance is what shows
  assertEquals(out[1], { date: '2026-07-08', planned: false, execution_pct: null, distance_m: 900 });
});

Deno.test('newest first; non-swim + non-completed excluded', () => {
  const out = buildSwimSessions7d([
    { type: 'run', workout_status: 'completed', date: '2026-07-11', workout_analysis: wa(90, 5000) },
    swim({ workout_status: 'planned', date: '2026-07-11', planned_id: 'p', workout_analysis: wa(0, 0) }),
    swim({ planned_id: 'p1', date: '2026-07-05', workout_analysis: wa(100, 1500) }),
    swim({ planned_id: 'p2', date: '2026-07-09', workout_analysis: wa(80, 1000) }),
  ]);
  assertEquals(out.map((s) => s.date), ['2026-07-09', '2026-07-05']); // run + planned-status dropped, newest first
});

Deno.test('missing analysis → nulls, still surfaced (never faked, never hidden)', () => {
  const out = buildSwimSessions7d([swim({ planned_id: null, workout_analysis: null })]);
  assertEquals(out.length, 1);
  assertEquals(out[0].execution_pct, null);
  assertEquals(out[0].distance_m, null);
});
