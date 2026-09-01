// ============================================================================
// RULE 4 — CORE WORK AFTER THE MAIN WORK, BEFORE THE ISOLATION WORK.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/core-placement.test.ts
//
// ⛔⛔ THIS RULE HAD NO PIN, AND THAT IS WHY IT SHIPPED WRONG (2026-08-31). p142 rule 4 was
// implemented, described in a comment, and asserted by nothing — so when the anchor turned out to
// pick the wrong row, **2541 tests stayed green while the core row sat second from last**. Michael
// read the composed week and said *"they need to be placed correctly, read the book."*
//
// ⛔ HIS SENTENCE, AND BOTH HALVES OF IT MATTER:
//
//   > "Many athletes are tempted to perform any core/bracing work last in a routine, typically
//   > hitting isolation/externally braced work (for example, machine work) after their main lift and
//   > throwing in core work at the end. This tends to do the core a disservice — isolation work is
//   > rarely degraded by a tired core, and core work tends to have a higher skill component than most
//   > isolation work."
//
// **"isolation/externally braced work" is BOTH accessory categories, not just the focused ones.** The
// first anchor was the first row whose GRID category is `focused`, which on the All Rounder's leg day
// is the calf raise — so core landed behind the back extension, the zercher squat and the goblet
// squat, which is the exact routine the rule describes. The grid calls a goblet squat `secondary`
// while p274 uses it as that day's `focused quadriceps`; the frame's own `slot_intent` is the fact
// that does not disagree with itself.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek, type PlanSession, type StrengthExercise } from './compose.ts';

const HOME_KIT = [
  'Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)',
  'Pull-up bar', 'Resistance bands', 'Ab wheel', 'Incline bench',
];

const BASE = {
  frame: 'all_rounder' as const,
  column: 'standard' as const,
  competitionLifts: {
    push_upper: 'Bench Press',
    press_lower: 'Back Squat',
    hinge_lower: 'Deadlift',
  },
  seed1RMs: { bench: 150, squat: 110, deadlift: 150, overheadPress: 100 },
  workingNumbers: {
    bench: { lift: 'bench', predicted1RM: 155, workingNumber: 148.8, measured: { weight: 130, reps: 7 }, cite: 'test' },
    squat: { lift: 'squat', predicted1RM: 110, workingNumber: 105.6, measured: { weight: 95, reps: 5 }, cite: 'test' },
    deadlift: { lift: 'deadlift', predicted1RM: 150, workingNumber: 144, measured: { weight: 130, reps: 5 }, cite: 'test' },
    overheadPress: { lift: 'overheadPress', predicted1RM: 105, workingNumber: 100.8, measured: { weight: 85, reps: 8 }, cite: 'test' },
  },
  equipment: HOME_KIT,
  roundTo: 5,
};

const week = (wk: number, corePick: string | null) =>
  composeWeek({
    ...BASE,
    week: wk,
    ...(corePick ? { slotPicks: { core: corePick } } : {}),
  } as never);

const strengthSessions = (w: ReturnType<typeof week>): PlanSession[] =>
  w.sessions.filter((s) => s.type === 'strength');

const rowsOf = (s: PlanSession): StrengthExercise[] => s.strength_exercises ?? [];

const isCoreRow = (e: StrengthExercise) => /v up|hanging leg raise|crunch|plank|ab wheel/i.test(String(e.name));

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — THE POSITION. This is the assertion that was missing.
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔⛔ RULE 4 — the core row sits AFTER the main work and BEFORE every accessory row', () => {
  const w = week(2, 'v up');
  const host = strengthSessions(w).find((s) => rowsOf(s).some(isCoreRow));
  assert(host, 'the chosen core movement was not placed on the week at all');

  const rows = rowsOf(host!);
  const coreAt = rows.findIndex(isCoreRow);
  const firstAccessoryAt = rows.findIndex((e) => e.slot_intent === 'HYP');

  // ⛔ AFTER THE MAIN WORK. Never the first row of the day — the day opens on its competition lift.
  assert(coreAt > 0, `core opened the session at index ${coreAt}`);
  assertEquals(rows[0].slot_intent, 'ME', 'the day no longer opens on its competition lift');

  // ⛔ AND BEFORE THE ISOLATION/EXTERNALLY BRACED WORK — every HYP accessory, braced ones included.
  assert(firstAccessoryAt >= 0, 'this session carries no accessory row to be placed against');
  assert(coreAt < firstAccessoryAt,
    `⛔ core is at ${coreAt} and the accessory block starts at ${firstAccessoryAt} — `
    + `"throwing in core work at the end" is the routine p142 rule 4 names`);

  // ⚠️ MUTATION GUARD: the old anchor put core immediately before the first `focused`-category row,
  // which on this day is the calf raise. Assert it is not sitting at the tail.
  assert(coreAt < rows.length - 2, `core is second from last (${coreAt} of ${rows.length})`);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — THE DOSE AND THE COUNT
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ ONE core row a week, and it carries the accessory dose', () => {
  const w = week(2, 'v up');
  const all = strengthSessions(w).flatMap(rowsOf).filter(isCoreRow);
  assertEquals(all.length, 1, `${all.length} core rows in one week`);
  assertEquals(all[0].sets, 3, 'the core row is not one accessory slot');
  assertEquals(all[0].reps, '8-10', 'the core row lost p86\'s reps');
  assertEquals(all[0].target_rir, 1.5, 'the core row lost p86\'s 1-2 in reserve');
  assertEquals(all[0].load_prescribed, false, 'a core row was priced');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — OPT-IN, AND NEVER ON A TEST DAY
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ NO PICK, NO CORE ROW — the frame is unchanged for an athlete who leaves it alone', () => {
  const withPick = strengthSessions(week(2, 'v up')).flatMap(rowsOf).map((e) => e.name);
  const without = strengthSessions(week(2, null)).flatMap(rowsOf).map((e) => e.name);
  assertEquals(without.filter((n) => /v up/i.test(n)).length, 0, 'a core row appeared with no pick');
  // ⚠️ AND NOTHING ELSE MOVED. The core row is the ONLY difference between the two weeks.
  assertEquals(withPick.filter((n) => !/v up/i.test(n)), without,
    'choosing a core movement changed a row that is not the core row');
});

Deno.test('⛔⛔ A TEST DAY TAKES NO CORE ROW, chosen or not', () => {
  for (const s of strengthSessions(week(1, 'v up'))) {
    if (!/^test:/i.test(String(s.name))) continue;
    assert(!rowsOf(s).some(isCoreRow),
      `⛔ "${s.name}" carries core work — a test costs the block its numbers, not just a session`);
  }
});
