/**
 * A mobility session's logger rows, as materialize-plan writes them (audit H-T12).
 *
 * Run: deno test --no-check --no-lock supabase/functions/_shared/mobility-sets.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mobilitySetsFrom } from './mobility-sets.ts';

Deno.test('"2x8" gives two sets of eight, per side as Left and Right rows', () => {
  assertEquals(mobilitySetsFrom([{ name: 'Hip Flexor Stretch', duration: '2x8', description: 'slow', per_side: true }]), [
    { name: 'Hip Flexor Stretch (Left)', sets: 1, reps: 8, weight: 0, notes: 'slow' },
    { name: 'Hip Flexor Stretch (Right)', sets: 1, reps: 8, weight: 0, notes: 'slow' },
    { name: 'Hip Flexor Stretch (Left)', sets: 1, reps: 8, weight: 0, notes: 'slow' },
    { name: 'Hip Flexor Stretch (Right)', sets: 1, reps: 8, weight: 0, notes: 'slow' },
  ]);
});

Deno.test('a timed hold keeps its seconds; "3 sets of 15" and a load in the text', () => {
  assertEquals(mobilitySetsFrom([
    { name: 'Plank', duration_seconds: 45, sets: 3 },
    { name: 'Band Pull Apart', duration: '3 sets of 15 with 20 lb' },
  ]), [
    { name: 'Plank', sets: 3, duration_seconds: 45, weight: 0, notes: '' },
    { name: 'Band Pull Apart', sets: 3, reps: 15, weight: 20, notes: '' },
  ]);
});

Deno.test('⛔ NO INVENTED REP COUNT — text that names none leaves reps open', () => {
  assertEquals(mobilitySetsFrom([{ name: 'Cat Cow', duration: '2 sets' }]), [{ name: 'Cat Cow', sets: 2, weight: 0, notes: '' }]);
  assertEquals(mobilitySetsFrom([{ name: 'Child Pose', duration: 'until relaxed' }]), [{ name: 'Child Pose', sets: 1, weight: 0, notes: '' }]);
});

Deno.test('a stored JSON string and an empty or missing list', () => {
  assertEquals(mobilitySetsFrom(JSON.stringify([{ name: '', reps: 10, weight: '15' }])), [{ name: 'Mobility', sets: 1, reps: 10, weight: 15, notes: '' }]);
  assertEquals(mobilitySetsFrom([]), []);
  assertEquals(mobilitySetsFrom(null), []);
  assertEquals(mobilitySetsFrom('not json'), []);
});
