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
  experienceChipTextFor,
  experienceSubtitle,
  EXPERIENCE_HEADING,
  EXPERIENCE_SUBTITLE,
  EXPERIENCE_WHEN_UNASKED,
  perSessionIntroFor,
  WEEKLY_VOLUME_IS_THE_SUM_LINE,
  sessionLengthLabel,
  unansweredLengths,
  unansweredLengthLine,
  type SlotKey,
  type SlotSport,
} from './standing-plan-week-copy.ts';
import { experienceChips, slotLengthOptions, slotFixedMinutes, slotsForEngine, prunedSlotMinutes } from './standing-plan-week-bounds.ts';
import { composeWeek, defaultCompetitionLifts } from '../../supabase/functions/_shared/standing-plan/index.ts';
import { frameSlots } from './standing-plan-week-copy.ts';
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
  assertEquals(EXPERIENCE_HEADING.run, 'Running experience');
  assert(experienceChipTextFor('run', 'hard', run.newer, null).startsWith('Less experienced'),
    'the 5K chip lost its label');
  assert(/min max/.test(experienceChipTextFor('run', 'hard', run.experienced, null)));
});


// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — THE TIER IS DEAD AS AN INPUT ON A PER-SESSION FRAME
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔⛔⛔ STANDARD FOCUS ASKS NO EXPERIENCE QUESTION, AND THE 5K SCREEN KEEPS BOTH OF ITS', () => {
  /**
   * ⛔ MICHAEL'S FINAL RULING, 2026-08-30. The tier had never been a question about experience — it
   * was a question about session LENGTH wearing the wrong words — so with the length asked directly
   * on the row there is nothing left for it to decide. See `experienceAsksFor` for the three steps
   * the ruling walked and the measurements behind each.
   */
  for (const slots of [AR_LONG_RIDE, AR_LONG_RUN]) {
    const chips = chipsFor(slots, 'all_rounder');
    for (const sp of ['run', 'ride'] as const) {
      const pair = chips[sp];
      if (!pair) continue;
      assertEquals(experienceAsksFor(sp, experienceMovement(pair), true), false,
        `${sp}: a tier question came back on a frame that asks per session`);
    }
  }
  assertEquals(experienceAsksFor('run', 'hard', false), true);
  assertEquals(experienceAsksFor('ride', 'hard', false), true);
  /**
   * ⛔⛔ AND THE STORED ANSWER IS THE PAGE'S OWN LEVELS. `'experienced'` IS p274 as printed — a week
   * nobody was asked about must be the frame's week, not a reduced one — and it has to reach the
   * PLAN ROW or `rematerialize-standing-block` rebuilds every unstarted week from a blank.
   */
  assertEquals(EXPERIENCE_WHEN_UNASKED, 'experienced');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D — THE LENGTH PICK, AND IT AGREES WITH THE COMPOSED WEEK
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ ONLY THE EASY AND LONG ROWS TAKE A LENGTH — quality is the page\'s dose', () => {
  for (const slots of [AR_LONG_RIDE, AR_LONG_RUN]) {
    for (const row of frameSlots('all_rounder')) {
      const opts = slotLengthOptions(row.key, slots as never, { baselines: BASELINES as never, frame: 'all_rounder' });
      const fixed = slotFixedMinutes(row.key, slots as never, { baselines: BASELINES as never, frame: 'all_rounder' });
      if (row.role === 'hard') {
        assertEquals(opts, null, `${row.key}: a quality row grew a length picker`);
        assert(fixed != null && fixed > 0, `${row.key}: a quality row states no fixed length`);
      } else {
        assertEquals(fixed, null, `${row.key}: an easy/long row claims a fixed length`);
        assert(opts != null && opts.options.length > 1,
          `${row.key}: the length picker offers nothing to choose between`);
      }
    }
  }
});

Deno.test('⛔⛔ NO OFFERED LENGTH SITS IN A GAP THE LADDER CANNOT BUILD', () => {
  /**
   * ⛔ p239's ENDURANCE RIDE RUNS 60-100 MINUTES AND THEN 130-210. **There is no 115-minute ride on
   * the page.** A grid of round numbers would offer one, the engine would build 100 or 130, and the
   * screen would have promised a session the plan does not contain — the ask-15-get-20 defect in a
   * new place. Every value comes off the ladder's own rungs, which is what makes that impossible.
   */
  const o = slotLengthOptions('easy', AR_LONG_RIDE as never, { baselines: BASELINES as never, frame: 'all_rounder' })!;
  assert(o.options.includes(60), 'the ride ladder\'s own floor is not offered');
  assert(o.options.includes(100) && o.options.includes(130), 'the rung ends are not offered');
  for (const gap of [105, 110, 115, 120, 125]) {
    assert(!o.options.includes(gap), `${gap} min is offered and p239 has no such ride`);
  }
});

Deno.test('⛔⛔⛔ EVERY OFFERED LENGTH BUILDS EXACTLY THAT LENGTH — swept through composeWeek', () => {
  /**
   * ⛔⛔ THIS IS THE AGREEMENT TEST AND IT IS THE WHOLE POINT OF THE FEATURE. The screen offers a
   * length; the composer resolves it through `rungForMinutes` into a level and a dial position;
   * `buildEnduranceSession` builds it. **If those three ever disagree, the athlete picks a 2h30 long
   * ride and gets something else, silently** — the exact defect the endurance work order exists to
   * close, and the reason the client-side ladder must be the composer's own.
   * ⚠️ IT ASSERTS THE BUILT SESSION, not a module call (handoff §7, trap three): the number checked
   * is the duration on the composed week's own row.
   */
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  let checked = 0;
  for (const [name, slots] of [['long=ride', AR_LONG_RIDE], ['long=run', AR_LONG_RUN]] as const) {
    const engineSlots = slotsForEngine(slots as never, 'all_rounder');
    for (const key of ['easy', 'long'] as const) {
      const o = slotLengthOptions(key, slots as never, { baselines: BASELINES as never, frame: 'all_rounder' });
      if (!o) continue;
      const frameKey = frameSlots('all_rounder').find((x) => x.key === key)!.frameKey;
      for (const mins of o.options) {
        const w = composeWeek({
          competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame: 'all_rounder', week: 3,
          column: 'standard', equipment: ['Commercial gym'], baselines: BASELINES,
          seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
          // ⚠️ NO HOURS SENT — that is the shape this frame's payload now has, and the minutes must
          // win from a `no_target` verdict rather than being dropped on the floor by it.
          sportMix: { slots: engineSlots, minutes: { [frameKey]: mins } },
          enduranceExperience: { run: 'experienced', ride: 'experienced' },
        } as never) as { sessions: Array<{ day: string; type: string; duration: number }> };
        const day = DAYS[Number(frameKey.split(':')[0]) - 1];
        const sess = w.sessions.find((x) => x.day === day && (x.type === 'run' || x.type === 'ride'));
        assertEquals(sess?.duration, mins,
          `${name} / ${key}: asked ${mins} min and the week built ${sess?.duration}`);
        checked += 1;
      }
    }
  }
  assert(checked >= 40, `only ${checked} lengths swept — the sweep stopped covering the ladder`);
});

Deno.test('⛔ A QUALITY SLOT IGNORES A MINUTES KEY — the frame owns the page\'s doses', () => {
  /**
   * ⛔ THE SCREEN OFFERS NO SUCH CONTROL, so this is about a caller rather than a tap — and it is the
   * guard that keeps the composer honest if one is ever written. p246 and p274 assign the level and
   * the dose; a client shortening a hard session would be the athlete's screen overruling the page.
   */
  const engineSlots = slotsForEngine(AR_LONG_RIDE as never, 'all_rounder');
  const hardKey = frameSlots('all_rounder').find((x) => x.role === 'hard')!.frameKey;
  const build = (minutes?: Record<string, number>) => composeWeek({
    competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame: 'all_rounder', week: 3,
    column: 'standard', equipment: ['Commercial gym'], baselines: BASELINES,
    seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
    sportMix: { slots: engineSlots, ...(minutes ? { minutes } : {}) },
    enduranceExperience: { run: 'experienced', ride: 'experienced' },
  } as never) as { sessions: Array<{ day: string; type: string; duration: number }> };
  const plain = build();
  const meddled = build({ [hardKey]: 20 });
  assertEquals(
    meddled.sessions.filter((x) => x.type === 'run' || x.type === 'ride').map((x) => x.duration),
    plain.sessions.filter((x) => x.type === 'run' || x.type === 'ride').map((x) => x.duration),
    'a minutes key on a quality slot moved the week',
  );
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// E — WHAT THE SCREEN SAYS NOW THE HOURS BOXES ARE GONE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ THE PER-SESSION HEADER STATES WHAT IS ASKED AND WHAT THE PROGRAMME DECIDES', () => {
  const lines = perSessionIntroFor('all_rounder');
  assert(/alongside the lifting/.test(lines[0]));
  assert(/sport and a length/.test(lines[1]));
  assert(/conversation pace/.test(lines[2]));
  // ⛔ THE HARD COUNT IS DERIVED — p274 has three quality sessions, p246 two. A literal is one
  // frame's answer on a shared line, which is the defect this area keeps producing.
  assert(/three hard sessions are the programme's/.test(lines[3]), lines[3]);
  // ⛔ NO IMPERATIVE ANYWHERE — the screen's own standing rule.
  for (const line of [...lines, WEEKLY_VOLUME_IS_THE_SUM_LINE]) {
    assert(!/^(Add|Pick|Set|Choose|Try|Hold|Keep)\b/.test(line), `imperative: "${line}"`);
  }
  // ⛔ AND THE WEEKLY NUMBER IS ACCOUNTED FOR, with no number in it.
  assert(/add up to/.test(WEEKLY_VOLUME_IS_THE_SUM_LINE));
  assert(!/\d/.test(WEEKLY_VOLUME_IS_THE_SUM_LINE), 'a figure came back onto the volume line');
});

Deno.test('⛔ A LENGTH THE ATHLETE PICKED IS EXACT, NEVER "about"', () => {
  // ⚠️ `sayHours` is the ENGINE'S formatter and hedges — right for a solved weekly total, wrong for
  // a number the athlete chose themselves.
  assertEquals(sessionLengthLabel(45), '45 min');
  assertEquals(sessionLengthLabel(60), '1h');
  assertEquals(sessionLengthLabel(135), '2h15');
  assertEquals(sessionLengthLabel(300), '5h');
  assert(!/about/.test(sessionLengthLabel(135)));
});

Deno.test('⛔ CONTINUE WAITS ON A LENGTH FOR EVERY ROW THAT ASKS FOR ONE', () => {
  const none = unansweredLengths(AR_LONG_RIDE as never, undefined, 'all_rounder');
  assertEquals([...none].sort(), ['easy', 'long']);
  assert(/no length yet/.test(unansweredLengthLine(AR_LONG_RIDE as never, undefined, 'all_rounder')!));
  const half = unansweredLengths(AR_LONG_RIDE as never, { easy: 90 }, 'all_rounder');
  assertEquals(half, ['long']);
  assertEquals(unansweredLengths(AR_LONG_RIDE as never, { easy: 90, long: 150 }, 'all_rounder'), []);
  assertEquals(unansweredLengthLine(AR_LONG_RIDE as never, { easy: 90, long: 150 }, 'all_rounder'), null);
  /**
   * ⛔ AND IT IS EMPTY ON `strength_5k` BY CONSTRUCTION, not by a frame test at the call site: that
   * frame draws no picker, so a gate reading it can never block a screen that shows no control —
   * the `Continue disabled and unsatisfiable` defect, closed at the source.
   */
  assertEquals(unansweredLengths(FIVEK_ALL_RUN as never, undefined, 'strength_5k').length, 2,
    'the 5K rows are listed — the CALLER gates on the frame, and this asserts it must');
});

Deno.test('⛔⛔ SWITCHING A ROW\'S SPORT DROPS A LENGTH THE NEW SPORT CANNOT BUILD', () => {
  /**
   * ⛔ FOUND ON THE RENDERED PAGE, 2026-08-30, and it is the ask-15-get-20 defect in its newest
   * disguise. Set the long session to a ride, pick 2h30, tap "Long run": the row went on reading
   * *"Long session · Long run · 2h30"* over a picker offering 1h08 to 1h40, because `run_lsd` caps
   * at 100 minutes (p247, HIS). **The stored 150 would have travelled to the composer, resolved to
   * the nearest real dose, and built a 100-minute run under a screen promising two and a half
   * hours.** No test would have caught it: every module call involved was individually correct.
   */
  const opts = { baselines: BASELINES as never, frame: 'all_rounder' as const };
  const asRide = prunedSlotMinutes(AR_LONG_RIDE as never, { easy: 90, long: 150 }, opts);
  assertEquals(asRide, { easy: 90, long: 150 }, 'a valid pick was thrown away');

  const asRun = prunedSlotMinutes(AR_LONG_RUN as never, { easy: 90, long: 150 }, opts);
  assertEquals(asRun.long, undefined, '⛔ a 2h30 long RUN survived — p247 caps it at 100 minutes');
  /**
   * ⚠️ AND THE EASY ROW IS UNTOUCHED, which is the other half of the rule: nothing is dropped for
   * tidiness. Its sport did not change and its ladder still offers 90.
   */
  assertEquals(asRun.easy, 90, 'a row whose sport did not change lost its length');

  // ⛔ DROPPED, NEVER CLAMPED. Clamping would answer for the run a question the athlete was asked
  // about a ride — and an empty picker with the gate naming the row is the honest state.
  assert(asRun.long !== 100, 'the stale length was clamped rather than dropped');
  assert(unansweredLengths(AR_LONG_RUN as never, asRun, 'all_rounder').includes('long'),
    'the dropped row is not named by the gate, so Continue would pass with no length');
});
