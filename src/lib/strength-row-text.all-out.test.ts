import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { composeAllOutRowText, containsCommand } from './strength-row-text.ts';

/**
 * Q-254 SLICE 1 — the words State puts under a lift row, and the two things they may never do:
 * issue a command, or appear when there was no measurement.
 */

Deno.test('the rep record LEADS and the estimate follows', () => {
  const t = composeAllOutRowText({
    name: 'Deadlift', date: '2026-07-28', weight: 225, reps: 6,
    prior_best_reps_at_weight: 5, is_rep_record: true,
    estimated_1rm: 270, estimate_trusted: false, estimate_trusted_max_reps: 5,
  }, 'Jul 28');
  assertEquals(t?.set_line, 'All-out set 225 lb × 6 · Jul 28');
  assertEquals(t?.record_line, 'Rep record at this weight — your best was 5.');
  assertEquals(t?.estimate_line, 'Estimated max 270 lb · rough — over 5 reps no formula holds up');
});

Deno.test('⛔ a null prior says so plainly — it never implies a first-time PR', () => {
  const t = composeAllOutRowText({
    weight: 225, reps: 6, date: '2026-07-28',
    prior_best_reps_at_weight: null, is_rep_record: false,
    estimated_1rm: 270, estimate_trusted: true, estimate_trusted_max_reps: 8,
  }, 'Jul 28');
  assertEquals(t?.record_line, 'First time at this weight.');
  assertEquals(t?.estimate_line, 'Estimated max 270 lb', 'inside the ceiling, no hedge');
});

Deno.test('a prior you did not beat is stated, not hidden', () => {
  const t = composeAllOutRowText({
    weight: 225, reps: 4, prior_best_reps_at_weight: 6, is_rep_record: false,
    estimated_1rm: 255, estimate_trusted: true, estimate_trusted_max_reps: 5,
  }, 'Jul 28');
  assertEquals(t?.record_line, 'Your best at this weight is 6.');
});

Deno.test('⛔ NO MEASUREMENT, NO LINES — and never a fallback', () => {
  assertEquals(composeAllOutRowText(null, 'Jul 28'), null);
  assertEquals(composeAllOutRowText(undefined, 'Jul 28'), null);
  assertEquals(composeAllOutRowText({ weight: 225, reps: 0 }, 'Jul 28'), null);
  assertEquals(composeAllOutRowText({ weight: 0, reps: 6 }, 'Jul 28'), null);
});

Deno.test('⛔ the all-out lines contain no command — they are facts, on every row', () => {
  const t = composeAllOutRowText({
    weight: 225, reps: 6, prior_best_reps_at_weight: 5, is_rep_record: true,
    estimated_1rm: 270, estimate_trusted: false, estimate_trusted_max_reps: 5,
  }, 'Jul 28')!;
  for (const line of [t.set_line, t.record_line, t.estimate_line]) {
    assertEquals(containsCommand(line), false, `command leaked: ${line}`);
  }
});

Deno.test('a missing date degrades to the set alone rather than printing an empty separator', () => {
  const t = composeAllOutRowText({ weight: 185, reps: 10, estimated_1rm: 245, estimate_trusted: false, estimate_trusted_max_reps: 8 }, '');
  assertEquals(t?.set_line, 'All-out set 185 lb × 10');
});
