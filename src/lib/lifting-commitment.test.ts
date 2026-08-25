// The lifting commitment — derived from the frame, never typed. See `lifting-commitment.ts`.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { liftingCommitmentLine, liftingDaysForFrame } from './lifting-commitment.ts';
import { FRAMES } from '../../supabase/functions/_shared/standing-plan/index.ts';

Deno.test('⛔ THE COUNT IS THE FRAME\'S COLUMN, and it agrees with the declared field', () => {
  // ⚠️ BOTH SIDES ASSERTED ON PURPOSE. `Frame.liftingDays` is a second statement of the same fact
  // sitting beside the table; this is what catches the day they drift. The COLUMN is the one
  // `compose.ts` emits from, so if this ever fails the declared field is the stale one.
  for (const [id, f] of Object.entries(FRAMES)) {
    const derived = liftingDaysForFrame(id as keyof typeof FRAMES);
    assertEquals(derived, f.liftingDays, `${id}: derived ${derived} vs declared ${f.liftingDays}`);
    assert(derived > 0, `${id} carries no lifting days`);
  }
});

Deno.test('⛔ NOTHING IS PINNED TO FOUR — a frame with a different count says a different number', () => {
  // The guard against the hardcode Michael asked to avoid. Read the count, build the sentence, and
  // check the sentence carries whatever the count actually is.
  const n = liftingDaysForFrame('strength_5k');
  const line = liftingCommitmentLine('strength_5k');
  assert(line, 'the commitment line went silent on a frame that has lifting days');
  const WORD: Record<number, string> = { 3: 'Three', 4: 'Four', 5: 'Five' };
  assert(
    line!.startsWith(`${WORD[n]} lifting days a week.`),
    `the line does not carry the derived count (${n}): ${line}`,
  );
});

Deno.test('⛔ COPY-VOICE — a fact and its consequence, no imperative and no reassurance', () => {
  const line = liftingCommitmentLine()!;
  for (const banned of ['should', 'try', 'make sure', 'need to', 'must', 'don\'t worry', 'just']) {
    assert(!line.toLowerCase().includes(banned), `the commitment line instructs or reassures: "${banned}"`);
  }
  assertEquals(line.endsWith('Your endurance fits around them.'), true, 'the consequence clause is gone');
});

Deno.test('⛔ AN UNKNOWN FRAME IS SILENT, not a sentence about zero lifting days', () => {
  assertEquals(liftingDaysForFrame('not_a_frame' as keyof typeof FRAMES), 0);
  assertEquals(liftingCommitmentLine('not_a_frame' as keyof typeof FRAMES), null);
});

Deno.test('⛔ THE SUMMARY LINE COUNTS DAYS, NOT SESSIONS — and stays silent with no lifting', () => {
  // ⚠️ TRANSCRIBED FROM `WeekGrid`, and asserted against its source below so it cannot go stale.
  const liftDays = (rows: Array<{ day: string; type?: string; tags?: string[] }>) =>
    new Set(rows.filter((s) => s.type === 'strength' && !(s.tags ?? []).includes('plyo'))
      .map((s) => s.day)).size;
  // Two strength rows on one day is ONE lifting day.
  assertEquals(liftDays([{ day: 'Mon', type: 'strength' }, { day: 'Mon', type: 'strength' }]), 1);
  assertEquals(liftDays([{ day: 'Mon', type: 'run' }, { day: 'Tue', type: 'run' }]), 0);
  /**
   * ⛔ THE PLYO DAY IS NOT A LIFTING DAY. It ships as `type: 'strength'` with no barbell in it, and
   * counting it read the four-lift week as five — two lines under the step that promised four.
   */
  assertEquals(
    liftDays([
      { day: 'Mon', type: 'strength' }, { day: 'Tue', type: 'strength' },
      { day: 'Wed', type: 'strength', tags: ['standing_plan', 'plyo'] },
      { day: 'Thu', type: 'strength' }, { day: 'Fri', type: 'strength' },
    ]),
    4,
    'the plyo day was counted as a lifting day',
  );

  const src = Deno.readTextFileSync(new URL('../components/WeekGrid.tsx', import.meta.url).pathname);
  assert(
    /!\(s\.tags \?\? \[\]\)\.includes\('plyo'\)/.test(src),
    'the plyo exclusion is gone from the summary count — a four-lift week will read five again',
  );
  assert(
    /liftDays > 0 \? </.test(src),
    'the guard that keeps a run-only week from reading "0 lifts" is gone',
  );
});
