/**
 * Slice 2 acceptance — the run plan's days now come from `_shared/week-solver.ts`.
 *
 * ⛔ THE POINT OF THIS FILE IS THE COMPARISON, NOT A SNAPSHOT. `assign-days.ts` is still present and
 * still exported, so both placers can be run on the identical week and the new one held to
 * "equal-or-better, never worse". A test that only asserted the new shape could not tell an
 * improvement from a regression.
 *
 * Run:
 *   deno test --no-check --allow-all supabase/functions/generate-run-plan/assign-days-parity.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { SustainableGenerator } from './generators/sustainable.ts';
import { PerformanceBuildGenerator } from './generators/performance-build.ts';
import { assignDays, WEEK_ORDER, type WeekDay } from './generators/assign-days.ts';
import { assignDaysViaSolver } from './generators/assign-days-solver.ts';
import type { Session } from './types.ts';

type Sess = { day: string; name?: string; tags?: string[]; type?: string };
type Plan = { duration_weeks: number; sessions_by_week: Record<string, Sess[]> };

const BASE = {
  distance: 'marathon', fitness: 'intermediate', goal: 'complete',
  duration_weeks: 16, user_id: 'test',
  start_date: '2026-08-10', race_date: '2026-11-29', race_name: 'Test Marathon',
  current_weekly_miles: 30, recent_long_run_miles: 10, vdot: 40,
  effort_paces: { race: 480, threshold: 450, interval: 410, easy: 570 },
  effort_score: 40,
  // Required by the generators — omitting it throws inside the band parser, not in placement.
  days_per_week: '4-5',
};

const APPROACHES = ['sustainable', 'performance_build'] as const;

function plan(approach: typeof APPROACHES[number], extra: Record<string, unknown>): Plan {
  const G = approach === 'sustainable' ? SustainableGenerator : PerformanceBuildGenerator;
  return (new G({ ...BASE, ...extra, approach } as never) as unknown as { generatePlan(): Plan })
    .generatePlan();
}

/** Longest run of back-to-back training days, wrapping the week. */
function streak(days: readonly string[]): number {
  const on = new Set(days);
  if (on.size === 0) return 0;
  if (on.size === 7) return 7;
  let best = 0, cur = 0;
  for (let i = 0; i < 14; i++) {
    cur = on.has(WEEK_ORDER[i % 7]) ? cur + 1 : 0;
    if (cur > best) best = Math.min(cur, on.size);
  }
  return best;
}

const dayAfter = (d: WeekDay): WeekDay => WEEK_ORDER[(WEEK_ORDER.indexOf(d) + 1) % 7];
const dayBefore = (d: WeekDay): WeekDay => WEEK_ORDER[(WEEK_ORDER.indexOf(d) + 6) % 7];

const isLong = (s: Sess) => (s.tags ?? []).includes('long_run');
const HARD = ['hard_run', 'intervals', 'tempo', 'threshold'];
const isHard = (s: Sess) => (s.tags ?? []).some((t) => HARD.includes(t));

// ── 1. The marathon acceptance shape ────────────────────────────────────────

Deno.test('MARATHON: the plan still ends on race day', () => {
  for (const approach of APPROACHES) {
    const p = plan(approach, { preferred_days: { long_run: 'Sunday' } });
    const last = p.sessions_by_week[String(p.duration_weeks)];
    assert(last && last.length > 0, `${approach}: final week is empty`);
    // Race date 2026-11-29 is a Sunday; the race row must be the last session of the last week.
    // ⚠️ MATCH THE RACE ROW, NOT THE WORD "race". A loose /race|marathon/ also catches "Race Week
    // Activation" — a shakeout, and counting it as a second marathon is how a green test lies.
    // ⚠️ THE TWO GENERATORS NAME IT DIFFERENTLY — `sustainable` emits "Test Marathon — Marathon"
    // and `performance_build` "Test Marathon RACE DAY", so match on the RACE NAME. A loose
    // /race|marathon/ also catches "Race Week Activation" (a shakeout), and counting that as a
    // second marathon is how a green test lies.
    const raceRows = last.filter((s) => (s.name ?? '').includes(BASE.race_name));
    assert(
      raceRows.length > 0,
      `${approach}: no race row in the final week — got ${last.map((s) => `${s.day}:${s.name}`).join(', ')}`,
    );
    assertEquals(
      raceRows.length, 1,
      `${approach}: exactly one race row — the 95f38bf3 fix (a Thursday marathon once emitted four). ` +
      `Got ${raceRows.map((r) => `${r.day}:${r.name}`).join(', ')}`,
    );
    assertEquals(raceRows[0].day, 'Sunday', `${approach}: the race must sit on race day`);
    // Nothing is scheduled after the race.
    const raceIdx = WEEK_ORDER.indexOf(raceRows[0].day as WeekDay);
    for (const s of last) {
      assert(
        WEEK_ORDER.indexOf(s.day as WeekDay) <= raceIdx,
        `${approach}: ${s.day}:${s.name} is scheduled AFTER race day`,
      );
    }
  }
});

Deno.test('MARATHON: the long run holds one day in every week', () => {
  // The strength overlay derives the long-run day by VOTING across weeks
  // (`strength-overlay.ts:428` `longVotes`), so a long run that wandered week to week would quietly
  // degrade strength placement. Placement moving to the solver must not make it wander.
  for (const approach of APPROACHES) {
    const p = plan(approach, { preferred_days: { long_run: 'Sunday' } });
    for (const [wk, sessions] of Object.entries(p.sessions_by_week)) {
      if (Number(wk) === p.duration_weeks) continue; // race week replaces the long run
      for (const l of sessions.filter(isLong)) {
        assertEquals(l.day, 'Sunday', `${approach} wk${wk}: long run drifted off its day`);
      }
    }
  }
});

Deno.test('the athlete\'s long-run pin reaches the long run — INVERTED 2026-08-08', () => {
  /**
   * ⛔ THIS TEST USED TO ASSERT THE BUG, ON PURPOSE, AND ITS OWN INSTRUCTION WAS TO INVERT IT.
   *
   * It read: *"`sustainable.createSimpleLongRun` builds the session with the literal `'Sunday'`, so
   * the long run reaches placement ALREADY CARRYING a day … the athlete's `preferred_days.long_run`
   * therefore never reaches the placer at all. ⛔ WHEN THAT LANDS, THIS TEST MUST BE INVERTED, not
   * deleted."* That landed: both long-run factories now emit an empty day and
   * `assign-days-solver` anchors the pin.
   *
   * ⚠️ BOTH APPROACHES, because both had their own copy of the hardcode — `sustainable.ts`'s
   * `createSimpleLongRun` and `performance-build.ts`'s `createVDOTLongRun` / the quality long run.
   */
  for (const approach of APPROACHES) {
    for (const pin of ['Saturday', 'Wednesday', 'Tuesday'] as const) {
      const p = plan(approach, { preferred_days: { long_run: pin } });
      const drifted: string[] = [];
      for (const [wk, sessions] of Object.entries(p.sessions_by_week)) {
        if (Number(wk) === p.duration_weeks) continue;   // race week owns its own days
        for (const l of sessions.filter(isLong)) if (l.day !== pin) drifted.push(`wk${wk}:${l.day}`);
      }
      assertEquals(drifted, [], `${approach} pin=${pin}: the long run ignored the athlete's day`);
    }
  }
});

Deno.test('MARATHON: the two recovery days beside the long run — clear when the week has room', () => {
  /**
   * ⛔ THESE ARE PREFERENCES, NOT LAW, AND THE TEST SAYS SO IN ITS SHAPE.
   *   - the day AFTER  — the shared law's prose rule ("prefer easy_swim or rest — not easy_run")
   *   - the day BEFORE — the run generator's inherited rule ("prep for Sunday long run")
   * Neither is a clearance: `easy_run` carries 0h against every kind. Both rank BELOW spread, and
   * that ordering is deliberate — a five-run week can only keep both clear by running Tue-Wed-Thu-Fri
   * as one four-day block, which is the clumping complaint that started this work. So the absolute
   * assertion is made where the week has room (≤4 sessions), and the dense weeks are held to
   * "never worse than the module we replaced" instead.
   *
   * ⚠️ THE SATURDAY CASE IS THE ONE THAT MATTERS. `assign-days` scores gaps in Monday-first array
   * order, so with a Saturday long run it reads Sunday as six days away — the most spread day in the
   * week — and puts an easy run there, the morning after. The solver measures the week as the loop
   * it is.
   */
  let sparseChecked = 0;
  for (const approach of APPROACHES) {
    for (const pin of ['Sunday', 'Saturday'] as WeekDay[]) {
      const p = plan(approach, { days_per_week: '3-4', preferred_days: { long_run: pin } });
      for (const [wk, sessions] of Object.entries(p.sessions_by_week)) {
        if (Number(wk) >= p.duration_weeks - 1) continue; // race + taper place themselves
        if (sessions.length > 4) continue;                // no room; covered by the parity test
        // ⚠️ READ THE LONG RUN'S ACTUAL DAY, NOT THE PIN. They differ today — see the
        // KNOWN PRE-EXISTING test above — and asserting against the pin would make this test fail
        // for a reason that has nothing to do with placement.
        const actual = sessions.find(isLong)?.day as WeekDay | undefined;
        if (!actual) continue;
        for (const [label, day] of [['after', dayAfter(actual)], ['before', dayBefore(actual)]] as const) {
          const offenders = sessions.filter((s) => s.day === day && !isLong(s));
          assertEquals(
            offenders.length, 0,
            `${approach} wk${wk} (long run ${actual}, pin ${pin}): ${day} is the day ${label} the ` +
            `long run and must stay clear — got ${sessions.map((s) => `${s.day}:${s.name}`).join(', ')}`,
          );
        }
        sparseChecked++;
      }
    }
  }
  assert(sparseChecked > 20, `the sweep must actually cover weeks — only ${sparseChecked}`);
});

Deno.test('MARATHON: on dense weeks the solver uses those recovery days no more than assign-days did', () => {
  let newHits = 0, oldHits = 0;
  for (const approach of APPROACHES) {
    for (const pin of ['Sunday', 'Saturday'] as WeekDay[]) {
      for (const dpw of ['4-5', '5-6']) {
        const p = plan(approach, { days_per_week: dpw, preferred_days: { long_run: pin } });
        for (const [wk, sessions] of Object.entries(p.sessions_by_week)) {
          if (Number(wk) >= p.duration_weeks - 1) continue;
          const strip = () => sessions.map((s) => ({ ...s, day: '' })) as unknown as Session[];
          const guard = [dayAfter(pin), dayBefore(pin)];
          const count = (ss: { day: string }[]) => ss.filter((s) => guard.includes(s.day as WeekDay)).length;
          newHits += count(assignDaysViaSolver(strip(), { long_run: pin }) as never);
          oldHits += count(assignDays(strip(), { long_run: pin }) as never);
        }
      }
    }
  }
  console.log(`  recovery-day encroachment on dense weeks: assign-days ${oldHits}, solver ${newHits}`);
  assert(
    newHits <= oldHits,
    `the solver must not encroach on the long run's recovery days more than assign-days did ` +
    `(old ${oldHits}, new ${newHits})`,
  );
});

// ── 2. Equal-or-better vs the module it replaces ────────────────────────────

Deno.test('PARITY: the solver is equal-or-better on every week of a real 16-week block', () => {
  /**
   * Re-places each generated week with BOTH placers from the same starting point and compares.
   * ⚠️ The generator's own output is already solver-placed, so the sessions are stripped back to
   * day-less before each run — otherwise `assign-days` would just inherit the solver's answer.
   * Sessions that legitimately carry their own day (race week) are left alone by both.
   */
  let better = 0, equal = 0, worse = 0;
  const regressions: string[] = [];

  for (const approach of APPROACHES) {
    for (const pin of ['Sunday', 'Saturday'] as WeekDay[]) {
      for (const dpw of ['3-4', '4-5', '5-6']) {
        const p = plan(approach, { days_per_week: dpw, preferred_days: { long_run: pin } });
        for (const [wk, sessions] of Object.entries(p.sessions_by_week)) {
          if (Number(wk) >= p.duration_weeks - 1) continue;
          const strip = () => sessions.map((s) => ({ ...s, day: '' })) as unknown as Session[];
          const pins = { long_run: pin };
          const oldWeek = assignDays(strip(), pins);
          const newWeek = assignDaysViaSolver(strip(), pins);

          assertEquals(
            newWeek.length, oldWeek.length,
            `${approach}/${pin}/${dpw} wk${wk}: session count changed`,
          );
          assertEquals(
            newWeek.length, sessions.length,
            `${approach}/${pin}/${dpw} wk${wk}: a session was dropped`,
          );

          const so = streak(oldWeek.map((s) => s.day));
          const sn = streak(newWeek.map((s) => s.day));
          if (sn < so) better++;
          else if (sn === so) equal++;
          else {
            worse++;
            regressions.push(
              `${approach}/${pin}/${dpw} wk${wk}: streak ${so} → ${sn}; ` +
              `old=${oldWeek.map((s) => s.day).join(',')} new=${newWeek.map((s) => s.day).join(',')}`,
            );
          }
        }
      }
    }
  }

  console.log(`  parity: ${better} better, ${equal} equal, ${worse} worse (${better + equal + worse} weeks)`);
  assertEquals(worse, 0, `the solver must never be worse:\n  ${regressions.join('\n  ')}`);
  assert(better + equal > 100, 'the sweep must actually cover the block');
});

// ── 3. The training content did not move ───────────────────────────────────

Deno.test('CONTENT: mileage, long-run arc and taper are untouched by the placement change', () => {
  /**
   * ⛔ ONLY DAYS MOVED. Re-placing a week cannot change what is in it — same sessions, same names,
   * same durations. This compares the multiset of (name, duration, tags) before and after, which is
   * everything the plan says about the training, with the weekday deliberately excluded.
   */
  for (const approach of APPROACHES) {
    const p = plan(approach, { preferred_days: { long_run: 'Sunday' } });
    for (const [wk, sessions] of Object.entries(p.sessions_by_week)) {
      const strip = () => sessions.map((s) => ({ ...s, day: '' })) as unknown as Session[];
      const sig = (ss: { name?: string; duration?: number; tags?: string[] }[]) =>
        ss.map((s) => `${s.name}|${s.duration}|${(s.tags ?? []).join('+')}`).sort().join('\n');
      const oldWeek = assignDays(strip(), { long_run: 'Sunday' });
      const newWeek = assignDaysViaSolver(strip(), { long_run: 'Sunday' });
      assertEquals(
        sig(newWeek as never), sig(oldWeek as never),
        `${approach} wk${wk}: the week's CONTENT changed, not just its days`,
      );
    }
  }
});

// ── 4. Pins are still hard ─────────────────────────────────────────────────

Deno.test('PINS: a pinned quality day still takes the hard session', () => {
  const week = assignDaysViaSolver(
    [
      { day: '', type: 'run', name: 'Long Run', description: '', duration: 90, tags: ['long_run'] },
      { day: '', type: 'run', name: 'Intervals', description: '', duration: 60, tags: ['intervals'] },
      { day: '', type: 'run', name: 'Easy 1', description: '', duration: 45, tags: ['easy'] },
      { day: '', type: 'run', name: 'Easy 2', description: '', duration: 45, tags: ['easy'] },
    ] as Session[],
    { long_run: 'sunday', quality_run: 'wednesday' },
  );
  assertEquals(week.find((s) => s.name === 'Intervals')?.day, 'Wednesday');
  assertEquals(week.find((s) => s.name === 'Long Run')?.day, 'Sunday');
  assertEquals(week.filter((s) => s.day === 'Wednesday').length, 1, 'nothing squats on the club night');
});

Deno.test('PINS: an already-placed session keeps its day (race week is untouched)', () => {
  const week = assignDaysViaSolver(
    [
      { day: 'Sunday', type: 'run', name: 'RACE', description: '', duration: 240, tags: ['race'] },
      { day: 'Friday', type: 'run', name: 'Shakeout', description: '', duration: 20, tags: ['easy'] },
      { day: '', type: 'run', name: 'Easy 1', description: '', duration: 30, tags: ['easy'] },
    ] as Session[],
    { long_run: 'sunday' },
  );
  assertEquals(week.find((s) => s.name === 'RACE')?.day, 'Sunday');
  assertEquals(week.find((s) => s.name === 'Shakeout')?.day, 'Friday');
  assertEquals(week.length, 3);
});
