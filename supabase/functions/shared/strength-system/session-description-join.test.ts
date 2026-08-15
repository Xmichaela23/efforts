/**
 * ⛔ NO SESSION DESCRIPTION MAY RUN TWO SENTENCES TOGETHER.
 *
 * Reported on device 2026-08-10: the deload Thursday narration read
 *
 *     "…easy volume is what holds the aerobic base.Deload week — the hard session comes off."
 *
 * `enduranceSession` appends an optional `extraNote` to a fixed description, and the convention was
 * that every caller passed a note carrying its OWN leading space. Two of the three remembered. The
 * deload note did not, so weeks 4, 8 and 12 — every deload week in a 12-week block — shipped a
 * missing space in the one narration that only appears three times a block and is therefore the
 * least likely to be caught by looking.
 *
 * ⚠️ THE FIX IS AT THE JOIN, NOT IN THE STRING. Adding the space to that one note would leave the
 * convention intact and the next note one call site away from breaking it again. The join
 * normalises; this file pins that it stays normalised, across every week of a real composed block
 * rather than on one hand-picked session.
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/session-description-join.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { voiceViolation } from '../../_shared/state-trend/week-accent.ts';

/** A 12-week block with a hard run and a long run — the shape the report came from. */
const plan = composeStrengthPrimaryPlan({
  durationWeeks: 12,
  oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
  enduranceSport: 'run',
  enduranceFrequency: 3,
  targetWeeklyMiles: 20,
  longRunDay: 'sunday',
  easyPaceMinPerMile: 10,
  hardDay: { day: 'thursday', discipline: 'run', terrain: 'hill_3min' },
} as never);

const everySession = (): Array<{ week: string; name: string; description: string }> => {
  const out: Array<{ week: string; name: string; description: string }> = [];
  for (const [week, sessions] of Object.entries(plan.sessions_by_week as Record<string, any[]>)) {
    for (const s of sessions ?? []) {
      if (typeof s?.description === 'string' && s.description) {
        out.push({ week, name: String(s?.name ?? '?'), description: s.description });
      }
    }
  }
  return out;
};

Deno.test('⛔ NO SENTENCE IS GLUED TO THE NEXT — every week, every session', () => {
  const all = everySession();
  assert(all.length > 0, 'the block composed no described sessions — the harness is wrong');
  /**
   * A terminator immediately followed by a capital letter. ⚠️ DELIBERATELY NOT `\.\S` — decimals
   * ("3.5 mi") and ratios would trip that, and a test that cries wolf gets deleted. Sentence start
   * is the signal.
   */
  const glued = /[.!?][A-Z]/;
  for (const s of all) {
    const hit = s.description.match(glued);
    assertEquals(
      hit,
      null,
      `week ${s.week} "${s.name}" runs sentences together at "${hit?.[0]}": ${s.description}`,
    );
  }
});

Deno.test('⛔ THE LIGHT WEEKS ARE THE REGRESSION — 1, 8 and 12 carry the note, spaced', () => {
  // ⛔ THE WEEKS AND THE WORDING BOTH MOVED 2026-08-15 (§1c). The light weeks of a 12-week block are
  // now 1 (TM test), 8 (7th-week deload) and 12 (TM test) — and the run note names which of the two
  // it is, because "the hard session comes off" has a different reason on a test week.
  // The note appears three times in a block, which is exactly why the glued-sentence bug survived.
  const MARK = /(Light week|Test week) — the hard session comes off/;
  const withNote = everySession().filter((s) => MARK.test(s.description));
  assert(withNote.length > 0, 'no light-week narration found — the composer stopped emitting it');
  for (const s of withNote) {
    assert(
      /\. (Light week|Test week) — the hard session comes off/.test(s.description),
      `week ${s.week}: the light-week note is not preceded by ". " — ${s.description}`,
    );
    assert(!/\.(Light week|Test week)/.test(s.description), `week ${s.week}: the reported bug is back`);
  }
  assertEquals([...new Set(withNote.map((s) => s.week))].sort(), ['1', '12', '8'].sort());
});

Deno.test('the descriptions this file guards are in voice', () => {
  // ⚠️ A whitespace fix cannot change a token, so this is a floor rather than the point — but the
  // deload narration had never been asserted at all, and it is copy that reaches the athlete.
  for (const s of everySession()) {
    assertEquals(voiceViolation(s.description), null, `${s.name}: ${s.description}`);
  }
});
