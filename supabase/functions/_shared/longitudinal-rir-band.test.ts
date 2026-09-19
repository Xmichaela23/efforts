/**
 * ⛔ THE "BELOW THE PLANNED RESERVE" JUDGE READS p218's BAND (book-language fix, pass 6, 2026-09-18).
 *
 *   ~/.deno/bin/deno test -A --no-check supabase/functions/_shared/longitudinal-rir-band.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { detectStrengthRirGap } from './longitudinal-signals.ts';

const planned = (rows: unknown[]) => new Map([['pw', { id: 'pw', date: '2026-09-21', type: 'strength', name: null, workout_status: null, completed_workout_id: null, strength_exercises: rows }]]);
const fact = (lifts: Array<{ name: string; avg_rir: number }>) => ({
  date: '2026-09-21', discipline: 'strength', duration_minutes: 50, workload: null, session_rpe: null,
  run_facts: null, ride_facts: null, plan_id: 'p', planned_workout_id: 'pw',
  strength_facts: { exercises: lifts },
});

Deno.test('a HYP set logged at 0 RIR is inside p218\'s 0-2 band — not "below the plan"', () => {
  const out: any[] = [];
  // The composer stamps the midpoint 1 on HYP rows; the judge reads the intent's band instead.
  detectStrengthRirGap([fact([{ name: 'Leg Press', avg_rir: 0 }, { name: 'Leg Curl', avg_rir: 0 }])] as never,
    planned([{ name: 'Leg Press', slot_intent: 'HYP', target_rir: 1 }, { name: 'Leg Curl', slot_intent: 'HYP', target_rir: 1 }]) as never, out);
  assertEquals(out.length, 0);
});

Deno.test('a DE set logged at 2 RIR is under p218\'s 3-4 band', () => {
  const out: any[] = [];
  detectStrengthRirGap([fact([{ name: 'Bench Press', avg_rir: 2 }, { name: 'Kroc Row', avg_rir: 2.5 }])] as never,
    planned([{ name: 'Bench Press', slot_intent: 'DE', target_rir: 3.5 }, { name: 'Kroc Row', slot_intent: 'DE', target_rir: 3.5 }]) as never, out);
  assertEquals(out.map((s) => s.id), ['strength_rir_below_prescription']);
});

Deno.test('a row with no intent keeps its own number and the old tolerance', () => {
  const out: any[] = [];
  detectStrengthRirGap([fact([{ name: 'Curl', avg_rir: 1.5 }, { name: 'Row', avg_rir: 1.5 }])] as never,
    planned([{ name: 'Curl', target_rir: 2 }, { name: 'Row', target_rir: 2 }]) as never, out);
  assertEquals(out.length, 0);
});
