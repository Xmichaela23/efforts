// The pounds a finished lifting session moved — the one pricing get-week and session_detail share
// (2026-09-10, audit H-T04 / H-S15).
// Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/strength/session-volume.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { completedStrengthVolume, isPerformedSet } from './session-volume.ts';

Deno.test('loaded sets price reps × weight; an untouched prefill and an unticked set do not count', () => {
  const v = completedStrengthVolume([
    { name: 'Back Squat', sets: [
      { reps: 5, weight: 185, completed: true },
      { reps: 5, weight: 185, completed: true },
      { reps: 5, weight: 185, completed: false },
      { reps: 5, weight: 185, prefilled: true },
    ] },
  ], null);
  assertEquals(v.completed, [{ name: 'Back Squat', volume_lb: 1850 }]);
  assertEquals(v.completed_total_lb, 1850);
});

Deno.test('⛔ a chin-up is priced at body weight when one is recorded — the card no longer reads 0', () => {
  const rows = [{ name: 'Chin-Up', sets: [{ reps: 8, weight: 0, completed: true }, { reps: 8, weight: 0, completed: true }] }];
  assert(completedStrengthVolume(rows, 180).completed_total_lb > 0);
  assertEquals(completedStrengthVolume(rows, null).completed_total_lb, 0);
});

Deno.test('⛔ a barbell lift with a blank weight box is the bar, not zero', () => {
  const v = completedStrengthVolume([{ name: 'Bench Press', sets: [{ reps: 10, weight: 0, completed: true }] }], null);
  assert(v.completed_total_lb > 0, `bar not priced: ${v.completed_total_lb}`);
});

Deno.test('legacy sets with no flag count; nothing logged is zero', () => {
  assertEquals(isPerformedSet({ reps: 5, weight: 100 }), true);
  assertEquals(completedStrengthVolume([], 180), { completed: [], completed_total_lb: 0 });
  assertEquals(completedStrengthVolume(null, 180).completed_total_lb, 0);
});

Deno.test('⛔ a back extension with a plate is body weight plus the plate; an empty box is body weight (2026-09-29)', () => {
  const v = completedStrengthVolume([{ name: 'Back Extension', sets: [
    { reps: 10, weight: 25, completed: true },
    { reps: 10, weight: 0, completed: true },
  ] }], 180);
  assertEquals(v.completed_total_lb, (180 + 25) * 10 + 180 * 10);
  // No body weight recorded: the plate alone, as a weighted chin-up prices.
  assertEquals(completedStrengthVolume([{ name: 'Back Extension', sets: [{ reps: 10, weight: 25, completed: true }] }], null).completed_total_lb, 250);
  // The seated machine is not the body: its weight is the load, unchanged.
  assertEquals(completedStrengthVolume([{ name: 'Machine Back Extension', sets: [{ reps: 10, weight: 90, completed: true }] }], 180).completed_total_lb, 900);
});
