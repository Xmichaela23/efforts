/**
 * ⛔⛔ THE LENGTH THE SCREEN OFFERS IS THE LENGTH THE PLAN BUILDS — Run + Strength
 * (`WORKORDER-run-strength-rotate-2026-09-07.md` §4).
 *
 * ⛔ WHY IT IS A SWEEP AND NOT A LITERAL LIST. The chips come off the slot's own ladder
 * (`slotLengthOptions`), so pinning `[68, 75, 90]` here would pin the LIBRARY rather than the rule,
 * and a legitimate change to p235's rungs would fail this file for the wrong reason. What is pinned
 * is the rule: **every chip the screen offers builds exactly that length, and nothing exceeds the
 * ceiling.**
 *
 * ⚠️ THE 60-MINUTE CHIP NAMED IN THE WORK ORDER IS NOT OFFERED, and this file is where that is
 * measured rather than argued: `run_lsd` at level 2 is a single rung of 68 to 100 minutes, so an ask
 * of 60 resolves to 68. A chip reading "60 min" over a plan building 68 is the ask-15-get-20 defect,
 * which is the whole reason `slotLengthOptions` exists.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from '../../supabase/functions/_shared/standing-plan/compose.ts';
import { defaultCompetitionLifts } from '../../supabase/functions/_shared/standing-plan/frame-resolver.ts';
import { FRAMES } from '../../supabase/functions/_shared/standing-plan/frames.ts';
import { frameSlots } from './standing-plan-week-copy.ts';
import {
  EASY_RUN_FIXED_MIN, LONG_RUN_CHIP_CEILING_MIN, longRunDefaultMinutes, longRunLengthOptions,
} from './run-strength-week.ts';

const BASELINES = {
  units: 'imperial',
  performance_numbers: { easy_pace: '9:30', fiveK_pace: '7:50', ftp: 210 },
} as never;
const EQUIPMENT = ['Barbell + plates', 'Dumbbells', 'Flat bench', 'Squat rack'];
/** Every row a run — what `fixedSportScope` writes and what the screen holds. */
const SLOTS = { hard1: 'run', hard2: 'run', easy: 'run', long: 'run' } as never;

/** The frame keys the wizard sends its minutes under — `${frameDay}:${index}`, the engine's own. */
const frameKeyFor = (role: 'easy' | 'long'): string =>
  frameSlots('strength_5k').find((s) => s.role === role)!.frameKey;

/**
 * The payload this path actually sends: the two lengths, every slot a run, and NOTHING else — no
 * weekly hours, no day counts, no experience answer, no archetype pick.
 */
function weekFor(longMinutes: number, week = 2) {
  return composeWeek({
    competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame: 'strength_5k', week,
    column: 'standard', equipment: EQUIPMENT, baselines: BASELINES,
    sportMix: {
      slots: Object.fromEntries(frameSlots('strength_5k').map((s) => [s.frameKey, 'run'])),
      minutes: { [frameKeyFor('easy')]: EASY_RUN_FIXED_MIN, [frameKeyFor('long')]: longMinutes },
    },
  } as never);
}
const runs = (w: { sessions: { type: string; day: string; duration?: number; name?: string }[] }) =>
  w.sessions.filter((s) => s.type === 'run');
/** Minutes the built session actually carries. */
const lengthOf = (s: { duration?: number; total_duration_seconds?: number }) =>
  Math.round(Number(s.duration ?? (Number(s.total_duration_seconds ?? 0) / 60)));

Deno.test('⛔⛔ EVERY LONG-RUN CHIP BUILDS EXACTLY ITS OWN LENGTH, AND NONE EXCEEDS THE CEILING', () => {
  const options = longRunLengthOptions(SLOTS, { baselines: BASELINES, frame: 'strength_5k' });
  assert(options.length >= 2, `the long run offers ${options.length} lengths — the screen has no choice`);
  for (const m of options) {
    assert(m <= LONG_RUN_CHIP_CEILING_MIN, `a chip offers ${m} min, above the ${LONG_RUN_CHIP_CEILING_MIN} ceiling`);
    const w = weekFor(m);
    const long = runs(w).sort((a, b) => lengthOf(b) - lengthOf(a))[0];
    assert(long, `no run session built at all for a ${m}-minute ask`);
    assertEquals(lengthOf(long), m, `asked ${m} min and built ${lengthOf(long)}`);
    // ⛔ p247's OWN CAP, asserted on the built session rather than on the ask.
    assert(lengthOf(long) <= 100, `the long run built ${lengthOf(long)} min, over p247's 100`);
  }
});

Deno.test('⛔ THE DEFAULT IS THE RULED 75, AND IT IS ONE THE LADDER OFFERS', () => {
  const options = longRunLengthOptions(SLOTS, { baselines: BASELINES, frame: 'strength_5k' });
  const seed = longRunDefaultMinutes(options);
  assertEquals(seed, 75, `the long run opens at ${seed} rather than the ruled 75`);
  assert(options.includes(seed!), 'the default is not a length the chips offer');
});

Deno.test('⛔⛔ THE EASY RUN IS 30 MINUTES, EVERY WEEK, WHATEVER THE LONG CHIP SAYS', () => {
  /**
   * ⛔ p246's VT1 slot at level 1 — p235: *"the level refers almost strictly to duration."* It is a
   * constant on this screen and the row states it, so the plan must carry it or the screen is lying.
   */
  const options = longRunLengthOptions(SLOTS, { baselines: BASELINES, frame: 'strength_5k' });
  for (const m of options) {
    for (const week of [2, 5, 9]) {
      const built = runs(weekFor(m, week)).map(lengthOf);
      assert(built.includes(EASY_RUN_FIXED_MIN),
        `week ${week} with a ${m}-minute long run carries no ${EASY_RUN_FIXED_MIN}-minute run: ${built.join(', ')}`);
    }
  }
});

Deno.test('⛔⛔ THE TWO HARD RUNS ARE UNMOVED BY ANY CHIP — the page owns their dose', () => {
  /**
   * ⛔ `isHardSlot` refuses a minutes key on a quality slot, and this is that rule seen from the
   * built week: the long chip may not shorten or lengthen the frame's own quality sessions.
   * ⚠️ COMPARED WEEK FOR WEEK. The hard sessions ROTATE (p112), so their lengths differ between
   * weeks by design — what may not differ is between two long-run answers in the SAME week.
   */
  const options = longRunLengthOptions(SLOTS, { baselines: BASELINES, frame: 'strength_5k' });
  const hardDays = frameSlots('strength_5k').filter((s) => s.role === 'hard').map((s) => s.frameDay);
  const dayName = (n: number) =>
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][n - 1];
  for (const week of [2, 5]) {
    const base = runs(weekFor(options[0], week));
    for (const m of options.slice(1)) {
      const other = runs(weekFor(m, week));
      for (const d of hardDays) {
        const a = base.find((s) => s.day === dayName(d));
        const b = other.find((s) => s.day === dayName(d));
        assertEquals(a ? lengthOf(a) : null, b ? lengthOf(b) : null,
          `week ${week} day ${d}: the hard run moved when the long run went from ${options[0]} to ${m}`);
      }
    }
  }
});

Deno.test('⛔⛔ THE WEEK IS p246 WITH NOTHING ELSE ASKED — four runs, the page\'s levels, a test week first', () => {
  /**
   * ⛔ §2 OF THE ORDER, ASSERTED RATHER THAN ASSUMED. The screen sends no weekly hours, no day
   * counts and no experience answer, so this is what the composer receives — and an absent
   * experience answer must mean the PAGE'S levels, not the middle of a ladder.
   */
  const w = weekFor(75);
  assertEquals(runs(w).length, 4, 'the week is not four runs');
  // ⛔ p246's own levels, read off the frame rather than typed here.
  assertEquals(
    FRAMES.strength_5k.columns.standard.flatMap((d) => (d.endurance ?? []).map((s) => `${s.family}/L${s.level}`)),
    ['run_mlss/L2', 'run_near_threshold/L3', 'run_vt1/L1', 'run_lsd/L2'],
  );
  assertEquals(w.sessions.filter((s) => s.type === 'strength').length > 0, true);
  // ⛔ WEEK ONE IS A TEST WEEK — the tag the logger reads.
  const w1 = weekFor(75, 1);
  assert(w1.sessions.some((s) => (s.tags ?? []).includes('1rm_test')),
    'week one carries no test session');
});

Deno.test('⛔ NO EXPERIENCE ANSWER MEANS THE PAGE\'S LEVELS — the same week either way', () => {
  /**
   * ⚠️ THE SCREEN NO LONGER ASKS, so `enduranceExperience` never reaches the builder. The claim is
   * that absent equals "experienced" equals the frame's own printed levels — asserted by composing
   * both and comparing the built weeks, which is stronger than reading `experienceLevels(null)`.
   */
  const bare = JSON.stringify(weekFor(75).sessions);
  const stated = JSON.stringify(composeWeek({
    competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame: 'strength_5k', week: 2,
    column: 'standard', equipment: EQUIPMENT, baselines: BASELINES,
    enduranceExperience: { run: 'experienced' },
    sportMix: {
      slots: Object.fromEntries(frameSlots('strength_5k').map((s) => [s.frameKey, 'run'])),
      minutes: { [frameKeyFor('easy')]: EASY_RUN_FIXED_MIN, [frameKeyFor('long')]: 75 },
    },
  } as never).sessions);
  assertEquals(bare, stated, 'an unanswered experience screen no longer builds the page\'s week');
});
