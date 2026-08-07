/**
 * ⛔ THE REAL BUILD — Michael's acceptance case, run through the generator that actually ships it.
 *
 * A week-5 athlete, ~19 mi/wk, a 6-mile long run, racing a marathon on 2026-10-11 off a plan that
 * opens Monday 2026-08-10. Before 2026-08-06 that block climbed to its biggest long run IN RACE
 * WEEK, with no taper, and ramped weekly volume 18% into week 2. Both are pinned here.
 *
 * Run:
 *   ~/.deno/bin/deno test --allow-read --no-check supabase/functions/generate-run-plan/race-anchored-long-run.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { SustainableGenerator } from './generators/sustainable.ts';

type Sess = { name?: string; description?: string; tags?: string[]; duration?: number };
type Plan = { sessions_by_week: Record<string, Sess[]>; description?: string };

const MICHAELS_CASE = {
  distance: 'marathon',
  fitness: 'beginner',
  goal: 'complete',
  duration_weeks: 10,          // create-goal: max(floor, min(weeksOut, 20)), weeksOut from 2026-08-06
  days_per_week: '4-5',
  user_id: 'test',
  start_date: '2026-08-10',    // the plan's first Monday
  race_date: '2026-10-11',     // a Sunday
  current_weekly_miles: 19,
  recent_long_run_miles: 6,
} as const;

function build(extra: Record<string, unknown> = {}): Plan {
  const g = new SustainableGenerator({ ...MICHAELS_CASE, ...extra } as never);
  return (g as unknown as { generatePlan(): Plan }).generatePlan();
}

const milesIn = (d: string) => { const m = d.match(/(\d+(?:\.\d+)?)\s*miles/); return m ? +m[1] : null; };
const longRun = (p: Plan, wk: number) =>
  milesIn((p.sessions_by_week[String(wk)] ?? []).find((s) => (s.tags ?? []).includes('long_run'))?.description ?? '');
/**
 * Training miles only. ⚠️ THE RACE IS NOT TRAINING VOLUME — since 2026-08-06 race day is a real row
 * on this path (26.2 miles of it), and counting it would make race week a 37% "jump" over the peak
 * and turn the ramp guard into a test of arithmetic nobody is doing. The guard is about the weeks
 * that BUILD; the race is the thing they build toward.
 */
const weekMiles = (p: Plan, wk: number) =>
  (p.sessions_by_week[String(wk)] ?? [])
    .filter((s) => !(s.tags ?? []).includes('race_day'))
    .reduce((sum, s) => sum + (milesIn(s.description ?? '') ?? 0), 0);

const DAY = 24 * 60 * 60 * 1000;
const daysBeforeRace = (wk: number) => Math.floor(
  (new Date('2026-10-11T00:00:00').getTime()
    - (new Date('2026-08-10T00:00:00').getTime() + ((wk - 1) * 7 + 6) * DAY)) / DAY,
);

Deno.test('⛔ the peak long run lands 2-3 weeks before race day, and nothing after it is bigger', () => {
  const p = build();
  const longRuns: Array<{ wk: number; mi: number }> = [];
  for (let wk = 1; wk <= MICHAELS_CASE.duration_weeks; wk++) {
    const mi = longRun(p, wk);
    if (mi != null) longRuns.push({ wk, mi });
  }
  assert(longRuns.length >= 6, `expected a long run most weeks, got ${longRuns.length}`);

  const peak = longRuns.reduce((a, b) => (b.mi > a.mi ? b : a));
  const out = daysBeforeRace(peak.wk);
  assert(out >= 14 && out <= 21, `peak long run (${peak.mi} mi, week ${peak.wk}) landed ${out} days out — wanted 14-21`);

  // THE BUG: the biggest run used to be in race week. Everything after the peak must be smaller.
  for (const l of longRuns) {
    if (l.wk > peak.wk) {
      assert(l.mi < peak.mi, `week ${l.wk} (${l.mi} mi) is not under the peak (${peak.mi} mi, week ${peak.wk})`);
    }
  }
});

Deno.test('⛔ the taper descends every week from the peak to race day', () => {
  const p = build();
  const peakWk = (() => {
    let best = { wk: 1, mi: -1 };
    for (let wk = 1; wk <= MICHAELS_CASE.duration_weeks; wk++) {
      const mi = longRun(p, wk);
      if (mi != null && mi > best.mi) best = { wk, mi };
    }
    return best.wk;
  })();
  let prev = Infinity;
  for (let wk = peakWk + 1; wk <= MICHAELS_CASE.duration_weeks; wk++) {
    const mi = longRun(p, wk);
    if (mi == null) continue;                      // race week has no long run at all
    assert(mi <= prev, `taper rose at week ${wk}: ${prev} → ${mi}`);
    prev = mi;
  }
});

Deno.test('⛔ no week is more than 10% over the biggest week before it', () => {
  // ⚠️ THE TEST IS AGAINST THE HIGH-WATER MARK, NOT THE WEEK BEFORE, and that is the only honest
  // form: a cutback week is followed by a bigger week by definition, so a raw week-over-week cap is
  // unsatisfiable alongside recovery weeks. "Never more than 10% over anything you have run" is the
  // stronger claim and the one the ramp guard actually makes.
  const p = build();
  let high = 0;
  for (let wk = 1; wk <= MICHAELS_CASE.duration_weeks; wk++) {
    const mi = weekMiles(p, wk);
    if (mi <= 0) continue;
    if (high > 0 && mi > high) {
      const jump = (mi - high) / high;
      // Whole miles across 4-5 sessions, so a 10% trend can round a point over. 12% is a breach.
      assert(jump <= 0.12, `week ${wk} is ${(jump * 100).toFixed(0)}% over the biggest week so far (${high} → ${mi} mi)`);
    }
    high = Math.max(high, mi);
  }
});

Deno.test('⛔ THE BLOCK OPENS AT ITS ASSUMED BASE — 25, not the athlete\'s 19', () => {
  // ⚠️ THIS TEST CHANGED SIDES ON 2026-08-06 AND THAT IS THE POINT. It used to read "the block
  // opens on the ATHLETE'S week, not the table's" and asserted 14-22 off a 19 mi/wk athlete. The
  // marathon block is a prescription now (`MARATHON_PREREQUISITE`): it opens at the base it assumes
  // and STATES that assumption on the plan, because an 18-mile peak six weeks later cannot sit on a
  // 19-mile week. The old assertion was correct for the old model and is kept here in words so the
  // reversal is visible rather than silently rewritten.
  // ⚠️ THE BASE IS COMPUTED FROM THE WINDOW, so this asserts the SHAPE rather than a number: a
  // 10-week block opens near its own prerequisite (≈26 mi/wk at this level) and says so.
  const wk1 = weekMiles(build(), 1);
  assert(wk1 >= 22 && wk1 <= 30, `week 1 came out at ${wk1} mi against its computed base`);
  assert(
    /assumes you're already running about \d+ miles a week with a long run around \d+/.test(
      build().description ?? '',
    ),
    'the plan does not state the base it assumed — which is what makes the 18-mile peak honest',
  );
});

Deno.test('sessions print PACE when a VDOT is on file, and RPE wording when it is not', () => {
  const withPace = build({ vdot: 38, lthr: 160 });
  const d = (withPace.sessions_by_week['1'] ?? []).find((s) => (s.tags ?? []).includes('long_run'))?.description ?? '';
  assert(/\/mi/.test(d), `expected a pace target with a VDOT on file: ${d}`);
  assert(/Z2 aerobic/.test(d), `expected the zone-led wording: ${d}`);

  const noData = build();
  const dr = (noData.sessions_by_week['1'] ?? []).find((s) => (s.tags ?? []).includes('long_run'))?.description ?? '';
  assert(!/\/mi/.test(dr), `must not fabricate a pace with nothing on file: ${dr}`);
  assert(/conversational/.test(dr), `expected the effort fallback: ${dr}`);
});

Deno.test('a 20-week build off the same athlete still reaches the row (short is the CAUSE, not the fix)', () => {
  const p = build({ duration_weeks: 20, start_date: '2026-08-10', race_date: '2026-12-27' });
  let max = 0;
  for (let wk = 1; wk <= 20; wk++) max = Math.max(max, longRun(p, wk) ?? 0);
  assertEquals(max, 18); // LONG_RUN_PROGRESSION.marathon.beginner peaks at 18
});
