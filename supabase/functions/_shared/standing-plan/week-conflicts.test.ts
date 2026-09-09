// ============================================================================
// THE CONFLICT SENTENCES — that they FIRE where a week breaks, stay SILENT where it does not, and
// pass the voice check every other composer in this app is gated through.
//
// Run: deno test --no-check -A supabase/functions/_shared/standing-plan/week-conflicts.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { voiceViolation } from '../state-trend/week-accent.ts';
import {
  FRAMES, assignSports, buildStandingPlanRow, chooseDayMap, composeWeek, defaultCompetitionLifts,
  isLongSlot, type ComposeArgs, type Weekday,
} from './index.ts';
import { weekConflicts } from './week-conflicts.ts';

const wn = (lift: string, p: number) => ({
  lift, predicted1RM: p, workingNumber: Math.round(p * 0.96),
  measured: { weight: Math.round(p * 0.85), reps: 5 }, cite: 'fixture',
});
const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: defaultCompetitionLifts(),
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  workingNumbers: {
    bench: wn('bench', 200), squat: wn('squat', 265),
    deadlift: wn('deadlift', 340), overheadPress: wn('overheadPress', 125),
  },
  baselines: {
    learned_fitness: {
      run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
      run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
    },
    performance_numbers: { ftp: 250 },
  },
  equipment: ['Commercial gym'],
  roundTo: 5,
} as unknown as Omit<ComposeArgs, 'week' | 'column'>;

/** The real assembly, in `generate-strength-plan`'s own order. */
function build(
  mix: Record<string, unknown>,
  longDay: Weekday | null,
  hardDays: Array<Weekday | null>,
  blocked: Weekday[] = [],
) {
  const m = { swimDays: 0, ...mix } as never;
  const a = assignSports(FRAMES.strength_5k.columns.standard, m);
  const long = Object.entries(a.byKey).find(([k]) => {
    const [d, i] = k.split(':').map(Number);
    const slot = FRAMES.strength_5k.columns.standard.find((x) => x.day === d)?.endurance[i];
    return slot ? isLongSlot(slot) : false;
  });
  const longSlotSport = long?.[1]?.sport ?? 'run';
  const dayMap = chooseDayMap('strength_5k', {
    longRunDay: longSlotSport === 'ride' ? null : longDay,
    longRideDay: longSlotSport === 'ride' ? longDay : null,
    longSlotSport, hardDays, unavailableDays: blocked,
  });
  const row = buildStandingPlanRow({
    compose: {
      ...BASE, endurancePins: { long: longDay, hard: hardDays },
      unavailableDays: blocked, sportMix: m, swimEasySessions: 0,
    } as never,
    weeks: 2, taperWeeks: [], dayMap,
  });
  const week = composeWeek({
    ...BASE, week: 2, column: 'standard', dayOffset: dayMap.offset,
    endurancePins: { long: longDay, hard: hardDays }, sportMix: m, unavailableDays: blocked,
  } as never);
  return { row, week, dayMap };
}

Deno.test('⛔ A CLEAN WEEK SAYS NOTHING — the frame untouched raises no conflict', () => {
  /**
   * ⛔ SILENCE ON A CLEAN WEEK IS THE HALF THAT MAKES THE REST WORTH READING. p246's own layout puts
   * the hard sessions with the UPPER days and prints no endurance on either lower day, so an
   * unpinned build has nothing to report — and a plan that warned anyway would train the athlete to
   * ignore the warnings that matter.
   */
  const { week } = build({ runs: 4, rides: 0 }, null, [null, null]);
  assertEquals(weekConflicts({
    sessions: week.sessions, frame: 'strength_5k', column: 'standard', dayOffset: 0,
  }), []);
  assertEquals(week.conflicts, []);
});

Deno.test('a hard RIDE pinned onto the heavy leg day is named, and the hard RUN is silent', () => {
  /**
   * ⛔⛔ REWRITTEN 2026-09-09 (WORKORDER-kill-ours §A.3, §B.6) — AND THE SILENT HALF IS THE POINT.
   *
   * Three of this rule's four sentences carried claims with no page: *"riding hard costs the legs
   * less than running hard does"* and, twice, *"come in under the weights the test priced."* They
   * were deleted, and §B.6 gives replacement words for exactly ONE case — the same-day hard ride, in
   * Michael's own sentence off p145 and p77. **The other three arms say nothing until he writes
   * them**, because the standing rule is silence over an unsourced claim.
   *
   * ⚠️ SO THIS TEST PINS AN ABSENCE ON PURPOSE. If a sentence appears on the hard-run arm, someone
   * has written athlete-facing copy without his yes — which is the failure this order exists to fix,
   * not a test that got stale.
   */
  const ride = build({ runs: 3, rides: 2 }, 'Saturday', ['Tuesday', null]);
  const rideC = ride.week.conflicts.find((c) => c.rule === 'hard_with_heavy_legs');
  assert(rideC, 'a hard ride on the heavy leg day raised nothing');
  assert(rideC!.days.includes('Tuesday'), rideC!.days.join(','));
  assertEquals(rideC!.text,
    'Tuesday: hard ride and heavy legs. Lifts in the first session, 6 to 8 hours before the ride.');
  // ⛔ HIS WORDS, VERBATIM. The page numbers live here rather than on the screen (p145, p77).
  assert(!/costs the legs less/.test(rideC!.text), 'the deleted ride claim came back');

  const run = build({ runs: 4, rides: 0 }, 'Saturday', ['Tuesday', null]);
  const runC = run.week.conflicts.find((c) => c.rule === 'hard_with_heavy_legs');
  assertEquals(runC, undefined,
    `the hard-run arm shipped a sentence Michael has not written: ${runC?.text}`);
  for (const c of [...run.week.conflicts, ...ride.week.conflicts]) {
    assert(!/under the weights the test priced/.test(c.text), `deleted claim came back: ${c.text}`);
    assert(!/injury risk rather than a hard day/.test(c.text), `deleted claim came back: ${c.text}`);
    assert(!/tendon cost rather than a comfort one/.test(c.text), `deleted claim came back: ${c.text}`);
  }
});

Deno.test('⛔ THE LONG RUN AFTER HEAVY LEGS IS HIS SENTENCE, AND THE SAME-DAY CASE IS SILENT', () => {
  /**
   * ⛔ §B.6, APPROVED: *"Friday heavy legs, Saturday long run. The run is on legs that have not
   * recovered."* p130 and p131 — the two sessions, their days, and what the legs are. Michael,
   * 2026-09-09: *"don't take liberties that aren't ours."* p144's cut does not reach the next day,
   * so nothing is claimed about a remedy.
   * ⚠️ THE SAME-DAY ARM HAS NO APPROVED WORDS AND EMITS NOTHING.
   */
  /**
   * ⚠️ THE FIXTURE HAS TO BLOCK THE WEEKEND. The rotation follows the long pin and the frame always
   * puts ME Lower three days after the LSD, so an unblocked week cannot stack them a day apart — the
   * only route is the athlete's own days off relocating the long session onto Wednesday.
   */
  const { week } = build({ runs: 4, rides: 0 }, 'Wednesday', [null, null], ['Saturday', 'Sunday']);
  const c = week.conflicts.find((x) => x.rule === 'long_after_heavy_legs');
  assert(c, 'the long run beside the heavy leg day raised nothing');
  assert(/heavy legs, /.test(c!.text), c!.text);
  assert(/The run is on legs that have not recovered\.$/.test(c!.text), c!.text);
  assertEquals(c!.days.length, 2, c!.days.join(','));
});

Deno.test('a hard session on the SPEED leg day is named, and the reason is bar speed', () => {
  /**
   * ⛔ THIS COST EXISTS NOWHERE ELSE. `DE: Lower` is not a keystone — p131 defines one as the session
   * needing the most recovered state, and stage 2's bands put ME at 90-100% against DE's 70-80% — so
   * `COST` reports nothing here and p246's frame rule is the only thing that does. His own reason:
   * DE is *"bar speed and quality of movement… fatigue is discouraged"* (p218-219).
   */
  const { week } = build({ runs: 4, rides: 0 }, 'Saturday', [null, 'Friday']);
  const c = week.conflicts.find((x) => x.rule === 'hard_on_speed_leg_day');
  assert(c, 'a hard session on the speed leg day raised nothing');
  assert(/bar speed/.test(c!.text), c!.text);
  assertEquals(c!.days, ['Friday']);
});

Deno.test('⛔ EVERY CONFLICT REACHES THE SCREEN, WITH ITS STRUCTURE INTACT', () => {
  /**
   * ⛔ `placement_compromises` IS THE CHANNEL THE ATHLETE ALREADY READS (`NonRaceBuilder.tsx:2716`).
   * A cost computed and never surfaced is the silent cost this whole pass exists to end.
   * ⛔ AND THE FIELDS SURVIVE, because a later slice attaches actions to them — remove the hard
   * ride, make it easy, reduce the miles — and an action has to know which break and which day.
   * Parsing that back out of the sentence would make the copy load-bearing.
   */
  // ⚠️ THE RIDE MIX, since 2026-09-09: the hard-RUN arm of `hard_with_heavy_legs` is silent until
  // Michael writes its sentence, so a run-only fixture now conflicts about nothing.
  const { row, week } = build({ runs: 3, rides: 2 }, 'Saturday', ['Tuesday', null]);
  assert(week.conflicts.length > 0, 'the fixture stopped conflicting');
  for (const c of week.conflicts) {
    const shipped = (row.placement_compromises ?? []).find((x) => x.text === c.text);
    assert(shipped, `a ${c.rule} conflict never reached placement_compromises: ${c.text}`);
    assertEquals(shipped!.rule, c.rule);
    assertEquals(shipped!.days, c.days);
    assertEquals(shipped!.kind, 'cost');
    /**
     * ⚠️ `sessions` IS CHECKED FOR PRESENCE, NOT EQUALITY, and the reason is real rather than a
     * loosened assertion. `placement_compromises` dedupes by TEXT across the block, and week one
     * names the same lifting day `Test: Lower` (the p215 pretest) where week two names it
     * `ME: Lower`. Same day, same sentence, one entry — so the row may carry either row's name.
     * The DAY and the RULE are what an action needs, and those are exact.
     */
    assert((shipped!.sessions ?? []).length === c.sessions.length);
  }
});

Deno.test('⛔ EVERY CONFLICT SENTENCE PASSES THE VOICE CHECK', () => {
  /**
   * ⛔ THE SAME GATE EVERY OTHER COMPOSER RUNS (`COPY-VOICE.md`, `voiceViolation`). `weekConflicts`
   * drops a line that trips it rather than shipping it, so a template that went bad would go SILENT
   * instead of loud — which is the right runtime behaviour and the wrong thing to find out in
   * production. This test is what makes the drop loud at build time.
   *
   * ⚠️ SWEPT OVER SHAPES THAT ACTUALLY CONFLICT, not over a hand-written list of strings, so a
   * sentence added later is covered without anybody remembering to add it here.
   */
  const shapes: Array<[Record<string, unknown>, Weekday | null, Array<Weekday | null>, Weekday[]?]> = [
    [{ runs: 4, rides: 0 }, 'Saturday', ['Tuesday', null]],
    [{ runs: 3, rides: 2 }, 'Saturday', ['Tuesday', null]],
    [{ runs: 4, rides: 0 }, 'Saturday', [null, 'Friday']],
    [{ runs: 4, rides: 0 }, 'Tuesday', ['Tuesday', 'Tuesday']],
    [{ runs: 3, rides: 2 }, 'Monday', ['Monday', 'Monday']],
    [{ runs: 0, rides: 4 }, 'Tuesday', ['Tuesday', null]],
    [{ runs: 4, rides: 0 }, 'Wednesday', ['Thursday', 'Friday']],
    /**
     * ⛔ THE LONG SESSION NEXT TO THE HEAVY LEG DAY NEEDS A BLOCKED DAY TO HAPPEN, and that is worth
     * knowing rather than working around: the rotation follows the long pin, and the frame always
     * puts ME Lower three days after the LSD — so an unblocked week CANNOT stack them. The only
     * route is a day off relocating the long session, which is exactly the athlete's own doing.
     */
    [{ runs: 4, rides: 0 }, 'Saturday', [null, null], ['Saturday', 'Sunday', 'Friday']],
    [{ runs: 0, rides: 4 }, 'Saturday', [null, null], ['Saturday', 'Sunday', 'Friday']],
    // ⚠️ ADDED 2026-09-09 — the ONE shape that reaches `long_after_heavy_legs` a day apart, which is
    // the only arm of that rule with approved words. See the test above for why the weekend is off.
    [{ runs: 4, rides: 0 }, 'Wednesday', [null, null], ['Saturday', 'Sunday']],
  ];
  let seen = 0;
  const rules = new Set<string>();
  for (const [mix, long, hard, blocked] of shapes) {
    for (const c of build(mix, long, hard, blocked ?? []).week.conflicts) {
      seen += 1;
      rules.add(c.rule);
      assertEquals(voiceViolation(c.text), null, `${c.rule}: "${c.text}"`);
      // ⚠️ AND IT NAMES A DAY AND A COST. A sentence with neither is a conflict the athlete cannot
      // locate or act on — the two halves Michael asked for, held as a shape rather than a wording.
      assert(c.days.length > 0 && c.sessions.length > 0, `${c.rule} named nothing: ${c.text}`);
      assert(c.days.some((d) => c.text.includes(d)), `${c.rule} never names its day: ${c.text}`);
      assert(c.text.split('. ').length >= 2, `${c.rule} states a break with no cost: ${c.text}`);
    }
  }
  assert(seen > 0, 'the sweep found no conflicts at all — the fixtures stopped stacking');
  /**
   * ⛔ EVERY RULE THAT STILL SPEAKS IS REACHED, or this test is green about sentences it never read.
   *
   * ⚠️ FIVE, NOT SIX, SINCE 2026-09-09. `heavy_legs_after_long` computes its clearance and emits
   * NOTHING: its sentence claimed *"a tendon cost rather than a comfort one"*, which has no page, and
   * §B.6 gives that case no replacement words. The id is deliberately still in `ConflictRule` — it is
   * a rule waiting for a line, not a rule that was removed.
   */
  const SPEAKING = ['hard_with_heavy_legs', 'long_after_heavy_legs', 'hard_on_speed_leg_day',
    'two_hard_one_day', 'no_rest_day'];
  for (const r of SPEAKING) {
    assert(rules.has(r), `the sweep never reached ${r} — only: ${[...rules].join(', ')}`);
  }
  assert(!rules.has('heavy_legs_after_long'),
    'heavy_legs_after_long shipped a sentence Michael has not written');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// p144 RULE 5 — THE EASY RUN ON THE HEAVY LEG DAY IS CUT, AND THE WARNING SAYS SO
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔⛔ THE EASY RUN ON THE HEAVY LEG DAY IS ACTUALLY SHORTER, NOT JUST TALKED ABOUT', () => {
  /**
   * ⛔ THE ONLY CONFLICT IN THIS FILE THAT CHANGES THE WEEK. p144 rule 5: *"work that benefits from
   * pre-fatigue goes last — almost always VT1-intensity endurance… you could cut your VT1 run volume
   * by a third or so after a hard leg workout and get the same overall adaptations."*
   *
   * ⛔ AND THE ASSERTION IS THE CUT, NOT THE SENTENCE. Michael's approved line SAYS the run is cut by
   * a third; that sentence had sat in `compose.ts` as a COMMENT since 2026-08-26 with nothing acting
   * on it, so shipping the words without the cut would have put a false claim on the row. **The
   * warning is only allowed to exist because the minutes moved.**
   *
   * ⚠️ THE ALL ROUNDER, BECAUSE ITS EASY RUN CAN LAND ON A LOWER DAY. p246's own layout keeps
   * endurance off both lower days, so `strength_5k` reaches this only through a pin.
   */
  const wk = composeWeek({
    ...BASE,
    frame: 'all_rounder',
    week: 2,
    column: 'standard',
    sportMix: { runs: 2, rides: 2, swimDays: 0, slots: { '1:0': 'ride', '3:0': 'ride', '4:0': 'run', '6:0': 'run' } },
    targetRunHours: 3,
    targetRideHours: 4,
    enduranceDaysBySport: { run: 3, ride: 2 },
  } as never) as never as {
    sessions: Array<{ day: string; type: string; name: string; duration: number; steps_preset?: string[]; tags: string[] }>;
    conflicts: Array<{ rule: string; days: string[]; text: string }>;
  };
  const cut = wk.conflicts.find((c) => c.rule === 'easy_run_with_heavy_legs');
  assert(cut, 'no easy run landed on the heavy leg day — the fixture stopped exercising the rule');
  assertEquals(cut!.text, `${cut!.days[0]}: heavy legs and an easy run. The run is cut by a third.`);

  // ⛔ THE ROW ON THAT DAY CARRIES THE CUT MINUTES, in BOTH places: the token the watch plays and the
  // duration the calendar prints. A total trimmed without the step would leave the two disagreeing.
  const heavyDay = cut!.days[0];
  const run = wk.sessions.find((s) => s.type === 'run' && s.day === heavyDay);
  assert(run, `no run on ${heavyDay}`);
  const token = (run!.steps_preset ?? []).find((t) => /^run_easy_\d+min$/.test(t));
  assert(token, `the cut run is not an easy run: ${JSON.stringify(run!.steps_preset)}`);
  const tokenMin = Number(token!.match(/^run_easy_(\d+)min$/)![1]);
  const others = wk.sessions
    .filter((s) => s.type === 'run' && s.day !== heavyDay)
    .flatMap((s) => (s.steps_preset ?? []).filter((t) => /^run_easy_\d+min$/.test(t)))
    .map((t) => Number(t.match(/^run_easy_(\d+)min$/)![1]));
  if (others.length > 0) {
    assert(tokenMin < Math.max(...others),
      `the run on the heavy day (${tokenMin} min) is not shorter than the week's other easy runs`);
  }
  assert(run!.duration >= tokenMin, `duration ${run!.duration} is under its own work token ${tokenMin}`);
});
