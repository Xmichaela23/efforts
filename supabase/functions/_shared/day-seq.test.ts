/**
 * ⛔ TWO RIDES ON ONE DAY (2026-09-20). activate-plan used to save one of them; now both are saved, each with its
 * place in the day (`day_seq`). These pin what reads that place: the swap's slot, the swap's reach over the plan's
 * weeks, and a rebuild's pairing of composed sessions with calendar rows.
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/day-seq.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { freeDaySeq, placeOf } from './day-seq.ts';
import { applyEnduranceAdjustments, enduranceSlotName } from './session-swap/plan-adjustments.ts';
import { restateEndurance } from './standing-plan/restate.ts';

const WED = '2026-09-23';

Deno.test('the place survives the hundreds; a taken key moves by 100', () => {
  assertEquals(placeOf(101), 1);
  assertEquals(placeOf(null), 0);
  assertEquals(freeDaySeq(0, new Set([0])), 100);
  assertEquals(freeDaySeq(1, new Set([0])), 1);
});

Deno.test('⛔ the second ride of a day is its own swap slot; the first keeps the name swaps were written under', () => {
  assertEquals(enduranceSlotName(WED, { type: 'ride', tags: [], day_seq: 0 }), 'endurance:Wednesday:ride');
  assertEquals(enduranceSlotName(WED, { type: 'ride', tags: [], day_seq: 1 }), 'endurance:Wednesday:ride:2');
  assertEquals(enduranceSlotName(WED, { type: 'run', tags: ['swapped_from:ride'], day_seq: 101 }), 'endurance:Wednesday:ride:2');
});

const ride = (name: string) => ({ day: 'Wednesday', type: 'ride', name, description: '', duration: 60, steps_preset: ['bike_endurance_60min'], tags: ['standing_plan'] });

Deno.test('⛔ a swap on the second ride leaves the first ride a ride', () => {
  const composed = [{ week: 3, sessions: [ride('Tempo Ride'), { day: 'Wednesday', type: 'strength', name: 'Lower', tags: [] }, ride('Easy Ride')] }];
  const out = applyEnduranceAdjustments(composed as never, [
    { exercise_name: 'endurance:Wednesday:ride:2', substitute_exercise_name: 'discipline:run', applies_from: WED, applies_until: null, status: 'active' },
  ], () => WED);
  const types = out[0].sessions.map((s) => `${s.name}:${s.type}`);
  assertEquals(types[0], 'Tempo Ride:ride', 'the swap reached the first ride');
  assertEquals(out[0].sessions[2].type, 'run', 'the swap missed the second ride');
});

Deno.test('⛔ a rebuild writes the first composed ride onto the first ride row, whatever the ids', () => {
  const composed = [{ week: 3, sessions: [{ ...ride('Tempo Ride'), steps_preset: ['bike_tempo_40min'] }, { ...ride('Easy Ride'), steps_preset: ['bike_endurance_90min'] }] }];
  const planned = [
    { id: 'aaa', week_number: 3, date: WED, type: 'ride', day_seq: 1, name: 'Easy Ride', steps_preset: ['bike_endurance_60min'], tags: ['standing_plan'], workout_status: 'planned' },
    { id: 'zzz', week_number: 3, date: WED, type: 'ride', day_seq: 0, name: 'Tempo Ride', steps_preset: ['bike_tempo_30min'], tags: ['standing_plan'], workout_status: 'planned' },
  ];
  const out = restateEndurance({ composed: composed as never, planned: planned as never, afterWeek: 1 });
  const byId = Object.fromEntries(out.rows.map((r) => [r.id, r.name]));
  assertEquals(byId, { zzz: 'Tempo Ride', aaa: 'Easy Ride' });
});
