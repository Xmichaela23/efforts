/**
 * ⛔⛔ THE STANDARD FOCUS ENDURANCE SCREEN — the day-ordered week, its choice-free days, its strength
 * theme tags, and the one conditional length question (Michael's rulings, 2026-08-30).
 *
 * ⛔ WHAT THIS FILE IS GUARDING AGAINST, AND IT IS THE HANDOFF'S TRAP ONE. Every defect in this area
 * has had the same shape: **one frame's answer, indexed by another frame's rows.** The tags, the
 * quiet days and the length question are all Standard Focus's alone, and `strength_5k` has to come
 * back byte-identical — so every assertion below is made for BOTH frames, not just the new one.
 *
 * ⚠️ AND ITS LIMIT IS STATED RATHER THAN HIDDEN (handoff §7, trap three: *"tests that assert the
 * module, not the path"*). These are the copy functions and the frame reader; they are not proof the
 * screen drew anything. The rendered-page check was done separately, on a throwaway harness mounting
 * `EnduranceWeekCard` with hand-fed props, on both frames — see the commit message.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --allow-env --no-check src/lib/standard-focus-week-layout.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  frameWeekDays,
  weekIsDayOrdered,
  displayOrderFor,
  slotKeysFor,
  QUIET_DAY_LABEL,
  experienceMovement,
  experienceAsksFor,
  experienceHeadingFor,
  experienceNoteFor,
  experienceChipTextFor,
  experienceSubtitle,
  EXPERIENCE_HEADING,
  EXPERIENCE_SUBTITLE,
  EXPERIENCE_WHEN_UNASKED,
  RUN_HOURS_LAND_ON_THE_LONG_RUN_LINE,
  type SlotKey,
  type SlotSport,
} from './standing-plan-week-copy.ts';
import { experienceChips } from './standing-plan-week-bounds.ts';
import { FRAMES } from '../../supabase/functions/_shared/standing-plan/frames.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
  ftp: 250,
};
const AR_LONG_RIDE: Partial<Record<SlotKey, SlotSport>> =
  { hard1: 'run', hard2: 'ride', hard3: 'run', easy: 'ride', long: 'ride' };
const AR_LONG_RUN: Partial<Record<SlotKey, SlotSport>> =
  { hard1: 'run', hard2: 'ride', hard3: 'run', easy: 'ride', long: 'run' };
const FIVEK_ALL_RUN: Partial<Record<SlotKey, SlotSport>> =
  { hard1: 'run', hard2: 'run', easy: 'run', long: 'run' };

const chipsFor = (slots: Partial<Record<SlotKey, SlotSport>>, frame: 'all_rounder' | 'strength_5k') =>
  experienceChips(slots, { baselines: BASELINES as never, frame });

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — THE WEEK IS SEVEN DAYS, AND WHICH ONES ARE QUIET IS THE FRAME'S ANSWER
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔⛔ ALL SEVEN DAYS, IN DAY ORDER, ON EVERY FRAME AND EVERY COLUMN', () => {
  for (const frame of ['strength_5k', 'all_rounder'] as const) {
    for (const column of ['standard', 'taper'] as const) {
      const days = frameWeekDays(frame, column);
      assertEquals(days.map((d) => d.day), [1, 2, 3, 4, 5, 6, 7],
        `${frame}/${column}: the week is not seven days in order`);
    }
  }
});

Deno.test('⛔⛔ A CHOICE-FREE DAY IS THE FRAME\'S ANSWER, NEVER A DAY NUMBER', () => {
  /**
   * ⛔ THE RULE: a day is quiet because its own `endurance` list is empty, and the KIND of quiet
   * comes from `rest`. A hardcoded `[5, 7]` would be right for one column of one frame and silently
   * wrong for the other three — the taper's quiet days are days 2 and 5, not day 5 alone.
   */
  for (const frame of ['strength_5k', 'all_rounder'] as const) {
    for (const column of ['standard', 'taper'] as const) {
      for (const d of frameWeekDays(frame, column)) {
        const source = FRAMES[frame].columns[column].find((x) => x.day === d.day)!;
        const empty = (source.endurance ?? []).length === 0;
        assertEquals(d.quiet != null, empty,
          `${frame}/${column} day ${d.day}: the screen and the frame disagree about a choice`);
        if (d.quiet) {
          assertEquals(d.quiet, source.rest ? 'rest' : 'lifting',
            `${frame}/${column} day ${d.day}: the wrong kind of quiet`);
        }
        assertEquals(d.slotKeys.length, (source.endurance ?? []).length,
          `${frame}/${column} day ${d.day}: a row was lost or invented`);
      }
    }
  }
  // ⛔ p274's OWN WEEK: day 5 lifts and carries no endurance, day 7 is rest. Nothing else is quiet.
  const ar = frameWeekDays('all_rounder');
  assertEquals(ar.filter((d) => d.quiet).map((d) => [d.day, d.quiet]), [[5, 'lifting'], [7, 'rest']]);
});

Deno.test('⛔ EVERY ROW THE DAY LIST DRAWS IS A ROW THE MODEL HAS — no row lost, none invented', () => {
  /**
   * ⛔ THIS IS THE `Continue disabled and unsatisfiable` GUARD, in its new shape. The gate reads
   * `slotKeysFor`; the Standard Focus screen now draws `frameWeekDays`. Two lists, and the morning of
   * 2026-08-30 was lost to exactly this pair disagreeing.
   */
  for (const frame of ['strength_5k', 'all_rounder'] as const) {
    const drawn = frameWeekDays(frame).flatMap((d) => d.slotKeys);
    assertEquals([...drawn].sort(), [...slotKeysFor(frame)].sort(),
      `${frame}: the day-ordered rows and the completion gate do not describe the same week`);
  }
});

Deno.test('⛔⛔ THE THEME TAGS ARE p274\'S OWN DAYS, AND THE 5K FRAME STATES NONE', () => {
  assertEquals(
    frameWeekDays('all_rounder').map((d) => d.themeTag),
    ['push day (upper)', 'hinge', 'jumps', 'pull day (upper)', 'legs', null, null],
  );
  /**
   * ⛔ MICHAEL, 2026-08-30: *"do not touch the 5K screen."* p246 speaks in ME/DE intent rather than
   * p274's movement patterns, and its five words are a call he has not made. **Filling them in as
   * tidiness is the change this assertion exists to stop.**
   */
  for (const column of ['standard', 'taper'] as const) {
    for (const d of frameWeekDays('strength_5k', column)) {
      assertEquals(d.themeTag, null, `strength_5k/${column} day ${d.day} grew a theme tag`);
    }
  }
  // ⚠️ ONE SHORT TAG, NEVER A SENTENCE — it sits greyed beside a day number on a phone.
  for (const d of frameWeekDays('all_rounder')) {
    if (!d.themeTag) continue;
    assert(d.themeTag.length <= 20, `"${d.themeTag}" is too long for the row`);
    assert(!/[.!?]/.test(d.themeTag), `"${d.themeTag}" is a sentence, not a tag`);
    assertEquals(d.themeTag, d.themeTag.toLowerCase(), `"${d.themeTag}" is not lower case`);
  }
});

Deno.test('⛔⛔ THE DAY ORDER IS PER-FRAME, AND HIS LONG-FIRST RULING STILL GOVERNS THE 5K SCREEN', () => {
  /**
   * ⛔ THE TWO ORDERS GENUINELY CONFLICT and Michael ruled per-frame rather than picking one. His
   * 2026-08-26 ruling — long, easy, then the hard rows — stays in force on `strength_5k`; Standard
   * Focus draws the calendar. **This is the assertion that stops one being rebased away as the other
   * is added.**
   */
  assertEquals(weekIsDayOrdered('strength_5k'), false);
  assertEquals(weekIsDayOrdered('all_rounder'), true);
  assertEquals(displayOrderFor('strength_5k'), ['long', 'easy', 'hard1', 'hard2'],
    'his long-first order came off the 5K screen');
  // ⛔ AND STANDARD FOCUS DRAWS THE FRAME'S DAYS: 1, 2, 3, 4, (5 quiet), 6, (7 quiet).
  assertEquals(
    frameWeekDays('all_rounder').flatMap((d) => (d.quiet ? [`day${d.day}:${d.quiet}`] : d.slotKeys)),
    ['hard1', 'hard2', 'hard3', 'easy', 'day5:lifting', 'long', 'day7:rest'],
  );
  assertEquals(QUIET_DAY_LABEL.lifting, 'Lifting only');
  assertEquals(QUIET_DAY_LABEL.rest, 'Rest');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — WHAT THE EXPERIENCE ANSWER ACTUALLY MOVES, MEASURED
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔⛔ THE HARD RIDE DOES NOT MOVE WITH THE TIER, AND THE LONG RIDE DOES', () => {
  /**
   * ⛔ THE DEFECT THIS PINS. p274 prescribes `Cyc AnA` at level 1, and `lowVolumeLevels` puts it at
   * level 1 too — so the hard ride is the same session at both tiers, both riding chips printed the
   * same number over the same count, and the equal-tiers line fired underneath saying the answer
   * changed nothing. **It was moving that rider's long ride from a 60-minute floor to a 130-minute
   * one.** One frame's sweep reported as the app's behaviour.
   */
  const ride = chipsFor(AR_LONG_RIDE, 'all_rounder').ride!;
  assertEquals(ride.newer.longestMin, ride.experienced.longestMin,
    'the hard ride started moving with the tier — the whole reframe rests on it not doing that');
  assert(ride.newer.longFloorMin != null && ride.experienced.longFloorMin != null);
  assert(ride.newer.longFloorMin! < ride.experienced.longFloorMin!,
    'the long ride floor no longer ladders — the question has nothing left to ask');
  assertEquals(experienceMovement(ride), 'long');

  // ⛔ AND WITH THE LONG SESSION KEPT AS A RUN THE RIDING ANSWER MOVES NOTHING — no long ride to floor.
  const rideNoLong = chipsFor(AR_LONG_RUN, 'all_rounder').ride!;
  assertEquals(rideNoLong.newer.longFloorMin, null);
  assertEquals(experienceMovement(rideNoLong), 'none');
});

Deno.test('⛔ THE 5K FRAME STILL TAKES THE HARD ARM ON EVERY ROW — its copy is unchanged by derivation', () => {
  /**
   * ⛔ WHY THIS IS DERIVED AND NOT KEYED ON THE FRAME. `experienceMovement` looks at what actually
   * moves, and `strength_5k`'s hard sessions genuinely do — so it takes the `hard` arm without the
   * ruling being restated in the copy module. A frame check here would satisfy Michael's *"do not
   * touch the 5K screen"* by accident rather than by construction.
   */
  const run = chipsFor(FIVEK_ALL_RUN, 'strength_5k').run!;
  assertEquals(experienceMovement(run), 'hard');
  assertEquals(experienceSubtitle('run', 'hard'), EXPERIENCE_SUBTITLE.run);
  assertEquals(experienceHeadingFor('run', 'hard', false), EXPERIENCE_HEADING.run);
  assertEquals(experienceNoteFor('run', 'hard', false, run.newer.hardCount), null);
  assert(experienceChipTextFor('run', 'hard', run.newer, null, false).startsWith('Less experienced'),
    'the 5K chip lost its label');
  assert(/min max/.test(experienceChipTextFor('run', 'hard', run.experienced, null, false)));
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — ONE CONDITIONAL QUESTION ON STANDARD FOCUS, AND IT IS THE RIDE'S
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔⛔⛔ STANDARD FOCUS ASKS ONE QUESTION, AND ONLY WHERE THE LONG SESSION IS A RIDE', () => {
  const askedWhen = (slots: Partial<Record<SlotKey, SlotSport>>) =>
    (['run', 'ride'] as const).filter((sp) => {
      const pair = chipsFor(slots, 'all_rounder')[sp];
      return pair != null && experienceAsksFor(sp, experienceMovement(pair), true);
    });
  assertEquals(askedWhen(AR_LONG_RIDE), ['ride'], 'the long-ride week asks the wrong questions');
  /**
   * ⛔ NO QUESTION AT ALL WHEN THE LONG SESSION IS A RUN. The run answer moves two sessions by 5-8
   * minutes and the long run's own 100-minute cap washes the rest out (Michael's ruling); the other
   * two rides are identical at both tiers. **Nothing honest to ask, so nothing is asked.**
   */
  assertEquals(askedWhen(AR_LONG_RUN), [], 'a question came back that has no honest answer');

  // ⛔ AND THE 5K SCREEN KEEPS BOTH ITS QUESTIONS, unchanged.
  assertEquals(experienceAsksFor('run', 'hard', false), true);
  assertEquals(experienceAsksFor('ride', 'hard', false), true);
  assertEquals(experienceAsksFor('ride', 'none', false), true);
});

Deno.test('⛔⛔ THE RIDE QUESTION IS A PLAIN LENGTH QUESTION — no experience word on its face', () => {
  const ride = chipsFor(AR_LONG_RIDE, 'all_rounder').ride!;
  assertEquals(experienceHeadingFor('ride', 'long', true), 'How long do you want your long ride to be?');
  /** ⛔ MICHAEL RULED THIS FACT STAYS ON THE CONTROL — without it a rider assumes the hard ride moved. */
  assertEquals(experienceNoteFor('ride', 'long', true, ride.newer.hardCount),
    'The hard ride is the same length either way.');

  const lower = experienceChipTextFor('ride', 'long', ride.newer, null, true);
  const upper = experienceChipTextFor('ride', 'long', ride.experienced, null, true);
  for (const line of [lower, upper]) {
    assert(!/experienced/i.test(line), `the experience word is still on the chip: "${line}"`);
    assert(/^from \d+ min$/.test(line), `the option is not a bare floor: "${line}"`);
    // ⛔ HIS NO-HEDGE RULE (2026-08-27). "from" states a boundary; "up to" softens a figure.
    assert(!/up to/i.test(line), `"up to" came back: "${line}"`);
  }
  assert(lower !== upper, 'the two options print the same length — the control is dead again');

  // ⛔ THE REQUIREMENT STILL SHOWS WHERE IT BLOCKS, and nowhere else.
  assert(/needs 5h\/wk/.test(experienceChipTextFor('ride', 'long', ride.experienced, 5, true)));
  assert(!/needs/.test(upper));
});

Deno.test('⛔ A SPORT NOBODY IS ASKED ABOUT STILL SENDS THE FRAME\'S OWN LEVELS', () => {
  /**
   * ⛔ `'experienced'` IS p274 AS PRINTED. A week nobody was asked about must be the page's week and
   * not a reduced one — and it must reach the PLAN ROW, or `rematerialize-standing-block` rewrites
   * the athlete's unstarted weeks from a blank. That is hop 4, and it is the silent one.
   */
  assertEquals(EXPERIENCE_WHEN_UNASKED, 'experienced');
  /**
   * ⛔⛔ AND IT CAN NEVER BE UNREACHABLE. The gate is `needsHours`; on every path where no question
   * is asked, both tiers measure the SAME requirement — so pinning the top tier cannot strand an
   * athlete on a week their hours do not hold. Measured here rather than asserted in a comment.
   */
  for (const slots of [AR_LONG_RUN, AR_LONG_RIDE]) {
    const chips = chipsFor(slots, 'all_rounder');
    for (const sp of ['run', 'ride'] as const) {
      const pair = chips[sp];
      if (!pair) continue;
      if (experienceAsksFor(sp, experienceMovement(pair), true)) continue;
      assertEquals(pair.newer.needsHours, pair.experienced.needsHours,
        `${sp}: unasked, but the top tier costs more hours than the lower one`);
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D — THE HOURS DIAL DOES DIFFERENT THINGS FOR THE TWO SPORTS, AND THE SCREEN SAYS SO
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ THE RUNNING-HOURS LINE NAMES THE CAP AND THE LEVER, WITHOUT HEDGING', () => {
  const line = RUN_HOURS_LAND_ON_THE_LONG_RUN_LINE;
  assert(/long run/.test(line), 'the line no longer says where the hours land');
  assert(/100 minutes/.test(line), 'p247\'s own cap came off the line');
  assert(/run day/.test(line), 'the line no longer names the lever that actually works');
  // ⛔ HIS NO-HEDGE RULE — the cap is stated, never softened.
  assert(!/up to/i.test(line), '"up to" came back into the running-hours line');
  // ⛔ NO IMPERATIVE. Fact-first, same voice as `unansweredLine`.
  assert(!/^(Add|Pick|Set|Choose|Try)\b/.test(line), 'the line became an instruction');
});
