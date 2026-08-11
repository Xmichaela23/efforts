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
  // 2026-08-11 (Strong/Hevy-clean): a rep record is a "Rep PR" badge, no "your best was N" prose.
  assertEquals(t?.record_line, 'Rep PR');
  // 2026-08-11: no reliability hedge — the estimate shows clean, like Strong (math is unchanged upstream).
  assertEquals(t?.estimate_line, 'Estimated max 270 lb');
});

Deno.test('⛔ a null prior says so plainly — it never implies a first-time PR', () => {
  const t = composeAllOutRowText({
    weight: 225, reps: 6, date: '2026-07-28',
    prior_best_reps_at_weight: null, is_rep_record: false,
    estimated_1rm: 270, estimate_trusted: true, estimate_trusted_max_reps: 8,
  }, 'Jul 28');
  // 2026-08-11: a non-record set narrates nothing — no "first time" / "your best is N" line.
  assertEquals(t?.record_line, '');
  assertEquals(t?.estimate_line, 'Estimated max 270 lb', 'clean, no hedge');
});

Deno.test('a non-record set gets no record line (Strong/Hevy-clean, 2026-08-11)', () => {
  const t = composeAllOutRowText({
    weight: 225, reps: 4, prior_best_reps_at_weight: 6, is_rep_record: false,
    estimated_1rm: 255, estimate_trusted: true, estimate_trusted_max_reps: 5,
  }, 'Jul 28');
  assertEquals(t?.record_line, '');
});

Deno.test('a high-rep set shows the estimate CLEAN — no "a guess from N reps" hedge (2026-08-11)', () => {
  // The deadlift-from-25-reps case Michael flagged: honest number, presented like Strong.
  const t = composeAllOutRowText({
    weight: 110, reps: 25, prior_best_reps_at_weight: 8, is_rep_record: true,
    estimated_1rm: 200, estimate_trusted: false, estimate_trusted_max_reps: 5,
  }, 'Aug 7');
  assertEquals(t?.record_line, 'Rep PR');
  assertEquals(t?.estimate_line, 'Estimated max 200 lb');
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
