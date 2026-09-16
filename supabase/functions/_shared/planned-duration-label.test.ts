// The planned session's length and its header words, as get-week sends them (2026-09-10, audit H-T01/H-T02).
// Run: ~/.deno/bin/deno test --no-check supabase/functions/get-week/planned-duration-label.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { plannedDurationFields } from './planned-duration-label.ts';

const HINGE = [
  { name: 'Deadlift', reps: '1-5', sets: 1, slot_intent: 'ME', set_plan: [
    { reps: 5, warmup: true, weight: 45 }, { reps: 5, warmup: true, weight: 125 },
    { reps: 3, warmup: true, weight: 175 }, { reps: 2, warmup: true, weight: 205 }, { weight: 230 },
  ] },
  { name: 'Weighted Reverse Hyper', reps: '6-12', sets: 3, slot_intent: 'HYP' },
  { name: 'Bulgarian Split Squat', reps: '6-12', sets: 3, slot_intent: 'HYP' },
  { name: 'Leg Curl', reps: '6-12', sets: 3, slot_intent: 'HYP' },
  { name: 'Reverse Lunge', reps: '2-4', sets: 4, slot_intent: 'DE' },
];

Deno.test('an endurance session prints its stored length as mm:00', () => {
  assertEquals(plannedDurationFields({ type: 'ride', total_duration_seconds: 3780 }), { planned_duration_seconds: 3780, planned_duration_label: '63:00' });
});

Deno.test('a lift prints the range priced off its rows, not the composer\'s fixed 55', () => {
  assertEquals(plannedDurationFields({ type: 'strength', total_duration_seconds: 3300, strength_exercises: HINGE }),
    { planned_duration_seconds: 3300, planned_duration_label: '30–40 min' });
  assertEquals(plannedDurationFields({ type: 'strength', strength_exercises: JSON.stringify(HINGE) }).planned_duration_label, '30–40 min');
});

Deno.test('a lift with no rows keeps the stored length', () => {
  assertEquals(plannedDurationFields({ type: 'strength', duration: 45 }), { planned_duration_seconds: 2700, planned_duration_label: '45:00' });
});

Deno.test('⛔ the plyo day prints no length, whatever the row stores', () => {
  assertEquals(plannedDurationFields({ type: 'strength', tags: ['plyo'], duration: 20, strength_exercises: HINGE }).planned_duration_label, null);
  assertEquals(plannedDurationFields({ type: 'strength', tags: '["plyo"]', duration: 20 }).planned_duration_label, null);
});

Deno.test('no stated length → no label', () => {
  assertEquals(plannedDurationFields({ type: 'run' }), { planned_duration_seconds: null, planned_duration_label: null });
});
