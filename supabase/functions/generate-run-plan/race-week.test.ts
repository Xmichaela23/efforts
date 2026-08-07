/**
 * ⛔ RACE WEEK ON A COMPLETION PLAN — three defects, all visible in one exported plan (2026-08-06).
 *
 * Michael's Humboldt Redwoods build, read back:
 *   1. **The taper plateaued.** The arc computed 9 → 8 → 6 → 4 and the week-8 Sunday branch read
 *      `createSimpleLongRun(8)` — a literal three functions from the arc — so it printed 9 → 8 → 8.
 *   2. **Race week ignored the day count.** Six runs in a plan built for four days a week: the
 *      `shakeout` and `easy_short` branches pushed with no guard at all.
 *   3. **The race was not on the calendar.** `case 'race'` said *"don't add a training session"* and
 *      added nothing, so the plan ended on a Saturday shakeout and stopped.
 *
 * Run:
 *   ~/.deno/bin/deno test --allow-read --no-check supabase/functions/generate-run-plan/race-week.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { SustainableGenerator } from './generators/sustainable.ts';

type Sess = { day?: string; name?: string; description?: string; tags?: string[]; duration?: number; steps_preset?: string[] };
type Plan = { sessions_by_week: Record<string, Sess[]> };

const BASE = {
  distance: 'marathon', fitness: 'beginner', goal: 'complete',
  duration_weeks: 9, days_per_week: '3-4', user_id: 'test',
  start_date: '2026-08-10', race_date: '2026-10-11', race_name: 'Humboldt Redwoods',
  current_weekly_miles: 20, recent_long_run_miles: 6, vdot: 30,
} as const;

const build = (extra: Record<string, unknown> = {}): Plan =>
  (new SustainableGenerator({ ...BASE, ...extra } as never) as unknown as { generatePlan(): Plan }).generatePlan();

const week = (p: Plan, wk: number) => p.sessions_by_week[String(wk)] ?? [];
const tagged = (s: Sess, t: string) => (s.tags ?? []).includes(t);
const milesIn = (d: string) => { const m = d.match(/(\d+(?:\.\d+)?)\s*miles/); return m ? +m[1] : null; };

Deno.test('⛔ THE RACE IS ON THE CALENDAR, on race day, with the distance on it', () => {
  const race = week(build(), 9).find((s) => tagged(s, 'race_day'));
  assert(race, 'the plan still ends with no race on it');
  assertEquals(race!.day, 'Sunday', '2026-10-11 is a Sunday');
  assert(/Humboldt Redwoods/.test(race!.name ?? ''), `the race name is missing: ${race!.name}`);
  assertEquals(milesIn(race!.description ?? ''), 26.2, 'the marathon distance is not stated');
  assert((race!.duration ?? 0) > 120, `a marathon cannot take ${race!.duration} minutes`);
});

Deno.test('⛔ AND IT LANDS ON THE ACTUAL RACE DAY, not a hardcoded Sunday', () => {
  // 2026-10-10 is a Saturday. `performance-build`'s race row is pinned to Sunday; this one is not.
  const race = week(build({ race_date: '2026-10-10' }), 9).find((s) => tagged(s, 'race_day'));
  assert(race, 'a Saturday race produced no race-day row');
  assertEquals(race!.day, 'Saturday');
});

Deno.test('⛔ THE RACE IS ANCHORED TO DISTANCE, NOT DURATION', () => {
  // THE BUG (2026-08-06): the token was time-based, which makes DISTANCE the derived quantity.
  // `materialize-plan` expanded 288 minutes at the athlete's easy pace and rendered the marathon as
  // 21.3 miles — the 288 had been written at the fitness-tier pace (11:00/mi) and read back at
  // their real one (13:30/mi). A race distance is a fact; it may not be an output.
  const race = week(build(), 9).find((s) => tagged(s, 'race_day'))!;
  assertEquals(race.steps_preset?.length, 1);
  assertEquals(race.steps_preset![0], 'longrun_26.2mi_easypace');
  assert(
    !/\d+min/.test(race.steps_preset![0]),
    'the race token is time-based again — distance will be back-derived from it',
  );
});

Deno.test('the duration is the ATHLETE\'s easy pace, not the fitness tier\'s', () => {
  // `milesToMinutes` prices miles at a per-level constant (beginner 11:00/mi) while every session's
  // printed pace comes from the VDOT. Using the constant is how the two numbers disagreed.
  const withPace = week(build({ vdot: 26 }), 9).find((s) => tagged(s, 'race_day'))!;
  const tierOnly = week(build({ vdot: undefined }), 9).find((s) => tagged(s, 'race_day'))!;
  assert(
    (withPace.duration ?? 0) > (tierOnly.duration ?? 0),
    `a slower athlete got a shorter race: ${withPace.duration} vs ${tierOnly.duration}`,
  );
  // 26.2 miles at ~12:24/mi (VDOT 26 base) ≈ 5h25. The rendered duration comes from the
  // materializer's own easy baseline, so this is the generator's estimate agreeing with its paces.
  const perMile = (withPace.duration ?? 0) / 26.2;
  assert(perMile > 11 && perMile < 15, `race priced at ${perMile.toFixed(1)} min/mi`);
});

Deno.test('⛔ AND THE EXPANDER TAKES DECIMALS — every race distance is one', () => {
  // The grammar always allowed them (`validation.ts:312`); the expander matched `longrun_(\d+)mi`
  // and parseInt, so a decimal fell through to the TIME branches. This is that regex, pinned.
  const expander = /longrun_([\d.]+)mi_easypace/;
  for (const [token, miles] of [
    ['longrun_26.2mi_easypace', 26.2],
    ['longrun_13.1mi_easypace', 13.1],
    ['longrun_6.2mi_easypace', 6.2],
    ['longrun_18mi_easypace', 18],
  ] as const) {
    const m = token.match(expander);
    assert(m, `${token} does not match the expander's pattern`);
    assertEquals(parseFloat(m![1]), miles);
  }
});

Deno.test('⛔ THE TAPER STEPS DOWN — the week-8 long run is the arc\'s number, not a constant 8', () => {
  const p = build();
  const longRunMi = (wk: number) => milesIn(week(p, wk).find((s) => tagged(s, 'long_run'))?.description ?? '');
  const peak = longRunMi(6);
  const wk7 = longRunMi(7);
  const wk8 = longRunMi(8);
  // ⚠️ 18, NOT 9. This test was written against the pre-prescription arc, which entered at the
  // athlete's own long run and topped out at 9 on a 9-week block. `MARATHON_PREREQUISITE` (2026-08-06)
  // enters at the assumed base instead and builds the real peak. The DEFECT it guards is unchanged:
  // a constant overwriting the taper's own number.
  assertEquals(peak, 18, 'the beginner marathon block no longer peaks at 18');
  assert(wk7! < peak!, `week 7 (${wk7}) did not come down from the peak (${peak})`);
  assert(wk8! < wk7!, `THE PLATEAU: week 8 (${wk8}) did not come down from week 7 (${wk7})`);
  assertEquals(wk7, 14, 'the first taper week is not the arc\'s 14 — check the 0.8-of-peak ceiling');
  assertEquals(wk8, 10, 'the second taper week is not the arc\'s 10 — check the 0.6-of-peak ceiling');
});

Deno.test('⛔ RACE WEEK HONOURS THE DAY COUNT (4 days asked, 4 training days built)', () => {
  const wk9 = week(build({ days_per_week: '4-5' }), 9);
  const training = wk9.filter((s) => !tagged(s, 'race_day'));
  assert(training.length <= 5, `race week ran ${training.length} training sessions against a 5-day answer`);

  // and at the count the athlete actually picked, on the cheapest week of the plan
  const lean = week(build({ days_per_week: '3-4' }), 9).filter((s) => !tagged(s, 'race_day'));
  assert(lean.length <= 4, `race week ran ${lean.length} training sessions against a 4-day answer`);
});

Deno.test('⛔ AND THE SHAKEOUT SURVIVES THE COUNT — it is an anchor, not filler', () => {
  // The naive fix (guard a Monday→Sunday walk) drops the LAST sessions, which are the ones race
  // week exists for. Priority, not walk order.
  const wk9 = week(build({ days_per_week: '3-4' }), 9);
  assert(wk9.some((s) => tagged(s, 'shakeout')), 'the day-count guard ate the shakeout');
  assert(wk9.some((s) => tagged(s, 'race_day')), 'the day-count guard ate the race');
});

Deno.test('the week before the race keeps its long run and is not back-loaded', () => {
  // Walking backward from the race fixed race week and broke this one: it trained Thu/Fri/Sun with
  // the first half of the week empty. Anchors-then-fill keeps the long run AND opens on Monday.
  const wk8 = week(build(), 8);
  assert(wk8.some((s) => tagged(s, 'long_run')), 'the long run was dropped from the week before the race');
  assert(wk8.some((s) => s.day === 'Monday'), 'the week before the race no longer starts until Thursday');
  assert(wk8.length <= 4, `week 8 ran ${wk8.length} sessions against a 4-day answer`);
});

Deno.test('every session in race week sits on its own day, in day order', () => {
  const wk9 = week(build(), 9);
  const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const idx = wk9.map((s) => order.indexOf(String(s.day)));
  assertEquals(new Set(idx).size, idx.length, 'two sessions landed on the same day');
  assertEquals([...idx].sort((a, b) => a - b), idx, 'the week is not in day order');
});
