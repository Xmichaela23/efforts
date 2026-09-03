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

Deno.test('a hard session pinned onto the heavy leg day is named, and the ride costs less', () => {
  const run = build({ runs: 4, rides: 0 }, 'Saturday', ['Tuesday', null]);
  const runC = run.week.conflicts.find((c) => c.rule === 'hard_with_heavy_legs');
  assert(runC, 'a hard run on the heavy leg day raised nothing');
  assert(runC!.days.includes('Tuesday'), runC!.days.join(','));
  assert(/under the weights the test priced/.test(runC!.text), runC!.text);

  // ⛔ THE RIDE'S SENTENCE SAYS THE COST IS SMALLER AND STILL SAYS THERE IS ONE. D-453 prices the
  // ride at 12h against the run's 24h; a line that dismissed it would tell the athlete a stacked
  // day is free.
  const ride = build({ runs: 3, rides: 2 }, 'Saturday', ['Tuesday', null]);
  const rideC = ride.week.conflicts.find((c) => c.rule === 'hard_with_heavy_legs');
  assert(rideC, 'a hard ride on the heavy leg day raised nothing');
  assert(/costs the legs less/.test(rideC!.text), rideC!.text);
  assert(/still opens on legs that have already worked/.test(rideC!.text), rideC!.text);
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
  const { row, week } = build({ runs: 4, rides: 0 }, 'Saturday', ['Tuesday', null]);
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
  // ⛔ ALL SIX RULES ARE REACHED, or this test is green about sentences it never read.
  assertEquals(rules.size, 6, `only reached: ${[...rules].join(', ')}`);
});
