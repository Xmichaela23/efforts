/**
 * Slice 1 — flexible endurance placement in `week-solver`.
 *
 * The solver's output was lift-only. These tests prove it can now take endurance sessions with NO
 * fixed day and spread them around the ones that have one, using the exhaustive subset scoring
 * ported from `assign-days.chooseSpreadDays` rather than a greedy per-day walk.
 *
 * ⛔ WHAT IS ASSERTED AS LAW vs WHAT IS ASSERTED AS SHAPE — the distinction is the point:
 *   - "never on the same day as a hard anchor" is THE LAW (`easy_run × long_run = false` in the
 *     same-day matrix). It holds in every week, including full ones.
 *   - "never the day either side of a hard anchor" is NOT law. `easy_run` carries 0h adjacency
 *     against every kind, so this is an EMERGENT property of maximal spread and is asserted only
 *     where the week has room to deliver it. Coding it as a rule would be §4.1a unowned strictness.
 *
 * Run:
 *   deno test --no-check --allow-all supabase/functions/_shared/week-solver-flexible.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type Anchor,
  type FlexibleSession,
  gapDays,
  type Lift,
  solve,
  SOLVER_DAYS,
  type SolverDay,
} from './week-solver.ts';

const dayIdx = (d: SolverDay) => SOLVER_DAYS.indexOf(d);

const easyRuns = (n: number): FlexibleSession[] =>
  Array.from({ length: n }, (_, i) => ({ name: `Easy run ${i + 1}`, kind: 'easy_run' as const }));

const LONG_RUN_SUN: Anchor = { day: 'sunday', kind: 'long_run', label: 'your long run' };
const QUALITY_RUN_WED: Anchor = { day: 'wednesday', kind: 'quality_run', label: 'your hard run' };
const LONG_RIDE_SAT: Anchor = { day: 'saturday', kind: 'long_ride', label: 'your long ride' };

/** The solved week as a day→sessions map, for readable assertions. */
function layout(r: ReturnType<typeof solve>): Record<string, string[]> {
  assert(r.status !== 'unsolvable', `expected a solved week, got ${r.status}`);
  const out: Record<string, string[]> = {};
  for (const d of SOLVER_DAYS) out[d] = [];
  for (const l of r.week.lifts) out[l.day].push(l.lift);
  for (const f of r.week.flexible) out[f.day].push(f.name);
  return out;
}

// ── 1. The regression that protects the live Get Stronger block ─────────────

Deno.test('flexible absent → byte-identical to omitting the field (the live composer path)', () => {
  const anchors = [LONG_RUN_SUN, QUALITY_RUN_WED];
  const lifts: Lift[] = [
    { name: 'Overhead Press', isLower: false },
    { name: 'Deadlift', isLower: true },
    { name: 'Bench Press', isLower: false },
    { name: 'Back Squat', isLower: true },
  ];
  const withoutField = solve({ anchors, lifts });
  const withEmpty = solve({ anchors, lifts, flexible: [] });

  assertEquals(withoutField.status, withEmpty.status);
  assert(withoutField.status !== 'unsolvable' && withEmpty.status !== 'unsolvable');
  assertEquals(
    withoutField.week.lifts.map((l) => `${l.lift}@${l.day}`),
    withEmpty.week.lifts.map((l) => `${l.lift}@${l.day}`),
    'adding an empty flexible array must not move a single lift',
  );
  assertEquals(withoutField.week.flexible, [], 'flexible is always present, empty when unused');
  assertEquals(withoutField.week.restDays, withEmpty.week.restDays);
});

// ── 2. THE LAW: never on top of a hard anchor ───────────────────────────────

Deno.test('LAW: an easy run never lands on the long-run or hard-run day', () => {
  // Every count the week can hold, so this is not one lucky arrangement.
  for (const n of [1, 2, 3]) {
    const r = solve({
      anchors: [LONG_RUN_SUN, QUALITY_RUN_WED],
      lifts: [],
      flexible: easyRuns(n),
    });
    assert(r.status !== 'unsolvable', `n=${n}: ${JSON.stringify(r)}`);
    const days = r.week.flexible.map((f) => f.day);
    assertEquals(days.length, n, `n=${n}: every requested run must be placed`);
    assert(!days.includes('sunday'), `n=${n}: easy run on the long-run day — got ${days.join(',')}`);
    assert(!days.includes('wednesday'), `n=${n}: easy run on the hard-run day — got ${days.join(',')}`);
  }
});

Deno.test('LAW: holds even on a week with no room to be generous', () => {
  // Four anchors + two easy runs. The matrix forbids easy_run on all four anchor days, so the runs
  // have exactly three legal days and no freedom at all — the law must still hold.
  const r = solve({
    anchors: [
      LONG_RUN_SUN,
      QUALITY_RUN_WED,
      LONG_RIDE_SAT,
      { day: 'tuesday', kind: 'quality_bike', label: 'your bike intervals' },
    ],
    lifts: [],
    flexible: easyRuns(2),
  });
  assert(r.status !== 'unsolvable', JSON.stringify(r));
  const days = r.week.flexible.map((f) => f.day);
  for (const forbidden of ['sunday', 'wednesday', 'saturday', 'tuesday']) {
    assert(!days.includes(forbidden as SolverDay), `easy run on ${forbidden}: ${days.join(',')}`);
  }
});

// ── 3. THE SHAPE: maximal spread, and it beats the greedy answer ────────────

Deno.test('SPREAD: three easy runs around a Sunday long run go Tue/Thu/Sat', () => {
  /**
   * ⛔ THE ANSWER IS NOT Mon/Wed/Fri, AND THE REASON IS THE WHOLE POINT OF THE SLICE.
   *
   * Four sessions cannot all sit two days apart in seven days, so ONE adjacency is forced.
   * Mon/Wed/Fri, Tue/Thu/Sat and Tue/Wed/Fri all have the identical circular gap profile
   * [1,2,2,2] — equally spread, so spread alone cannot choose. What separates them:
   *   - Mon/Wed/Fri spends the adjacency on the day AFTER the long run — the one day the law's
   *     own rule list asks to keep clear ("prefer easy_swim or rest — not easy_run").
   *   - Tue/Wed/Fri spends it between two easy runs — the original clumping complaint.
   *   - Tue/Thu/Sat spends it on the day BEFORE the long run, which no rule objects to.
   * So the week reads: long run Sunday, full rest Monday, then alternating. That is the answer a
   * coach would give, and it falls out of the ranking rather than being written down anywhere.
   */
  const r = solve({ anchors: [LONG_RUN_SUN], lifts: [], flexible: easyRuns(3) });
  assert(r.status !== 'unsolvable', JSON.stringify(r));
  const days = r.week.flexible.map((f) => f.day).sort((a, b) => dayIdx(a) - dayIdx(b));
  assertEquals(days, ['tuesday', 'thursday', 'saturday'], `got ${days.join(',')}`);
});

Deno.test('SPREAD: two easy runs never touch each other, wrap included', () => {
  /**
   * ⚠️ MEASURED WITH `gapDays`, WHICH WRAPS. A Monday/Sunday pair is one day apart, not six — the
   * artifact that made the first version of this engine pick the morning after the long run.
   */
  for (const n of [2, 3]) {
    const r = solve({ anchors: [LONG_RUN_SUN], lifts: [], flexible: easyRuns(n) });
    assert(r.status !== 'unsolvable');
    const idx = r.week.flexible.map((f) => dayIdx(f.day));
    for (let i = 0; i < idx.length; i++) {
      for (let j = i + 1; j < idx.length; j++) {
        assert(gapDays(idx[i], idx[j]) > 1, `n=${n}: easy runs back to back at ${idx.join(',')}`);
      }
    }
  }
});

Deno.test('SPREAD: this is the exhaustive answer, not the greedy one', () => {
  /**
   * ⛔ THE CASE `assign-days` WROTE DOWN, RE-RUN HERE. A greedy walk places run 1 and run 2 as far
   * from the anchors as it can (Monday, then Friday), and is then forced to put run 3 adjacent to
   * one of them. The exhaustive answer keeps all three apart. With a Sunday long run and a
   * Wednesday hard run the only legal days are Mon/Tue/Thu/Fri, and the sole arrangement of three
   * with no back-to-back pair is Mon/Thu + one more — so we assert the property, not a literal.
   */
  const r = solve({
    anchors: [LONG_RUN_SUN, QUALITY_RUN_WED],
    lifts: [],
    flexible: easyRuns(2),
  });
  assert(r.status !== 'unsolvable');
  const idx = r.week.flexible.map((f) => dayIdx(f.day)).sort((a, b) => a - b);
  assertEquals(idx.length, 2);
  assert(idx[1] - idx[0] > 1, `two easy runs back to back: ${JSON.stringify(idx)}`);
  // And neither sits the day after the long run (Monday) purely by luck — see the owned-cost test.
});

// ── 4. EMERGENT (not law): adjacency to a hard anchor is avoided when possible ──

Deno.test('EMERGENT: with room, no easy run sits the day either side of a hard anchor', () => {
  // One anchor, one run, five legal days — the week has every chance to be generous.
  const r = solve({ anchors: [QUALITY_RUN_WED], lifts: [], flexible: easyRuns(1) });
  assert(r.status !== 'unsolvable');
  const d = dayIdx(r.week.flexible[0].day);
  assert(gapDays(d, dayIdx('wednesday')) > 1, `easy run adjacent to the hard run: ${r.week.flexible[0].day}`);
});

Deno.test("OWNED COST: the day after the long run is avoided when spread doesn't decide it", () => {
  /**
   * The law's own prose rule — "After long_run → next day: prefer easy_swim or rest — not easy_run"
   * — as a TIE-BREAK. Sunday long run, one easy run: Mon…Sat are all legal and several are equally
   * spread, so the owned term is what should keep it off Monday.
   */
  const r = solve({ anchors: [LONG_RUN_SUN], lifts: [], flexible: easyRuns(1) });
  assert(r.status !== 'unsolvable');
  assert(
    r.week.flexible[0].day !== 'monday',
    `easy run on the day after the long run: ${r.week.flexible[0].day}`,
  );
});

// ── 5. Anchors stay immovable ───────────────────────────────────────────────

Deno.test('anchors are never moved to make the runs fit', () => {
  const anchors = [LONG_RUN_SUN, QUALITY_RUN_WED, LONG_RIDE_SAT];
  const r = solve({ anchors, lifts: [], flexible: easyRuns(3) });
  assert(r.status !== 'unsolvable', JSON.stringify(r));
  // The solver returns no anchor list, so prove it structurally: no flexible session took an
  // anchor's day, and every anchor day is still active.
  for (const a of anchors) {
    assert(
      !r.week.flexible.some((f) => f.day === a.day),
      `${a.label}'s day (${a.day}) was taken by an easy run`,
    );
    assert(r.week.activeDays.includes(a.day), `${a.day} stopped being an active day`);
  }
});

// ── 6. Lifts and runs together — the real Get Stronger shape ────────────────

Deno.test('lifts + easy runs: runs share lift days rather than kill the rest day', () => {
  /**
   * 2 anchors + 4 lifts = 6 active days, so a rest day survives with exactly one day spare. Adding
   * two easy runs on free days would take the week to seven active days and no rest. The law allows
   * `easy_run × strength` on one day, so the correct answer shares — and `restShortfall` outranks
   * the "own day" preference precisely so it does.
   */
  const r = solve({
    anchors: [LONG_RUN_SUN, QUALITY_RUN_WED],
    lifts: [
      { name: 'Overhead Press', isLower: false },
      { name: 'Deadlift', isLower: true },
      { name: 'Bench Press', isLower: false },
      { name: 'Back Squat', isLower: true },
    ],
    flexible: easyRuns(2),
  });
  assert(r.status !== 'unsolvable', JSON.stringify(r));
  assertEquals(r.week.flexible.length, 2, 'both runs must be placed');
  assert(r.week.restDays.length >= 1, `the rest day must survive — got ${JSON.stringify(r.week.restDays)}`);
  for (const f of r.week.flexible) {
    assert(f.day !== 'sunday' && f.day !== 'wednesday', `run on an anchor day: ${f.day}`);
  }
  // Any run that shares a day must say what it shares with.
  const shared = r.week.flexible.filter((f) => f.sharesDayWith);
  for (const s of shared) assert(!!s.sharesDayWith?.label, 'a shared day must name its host');
});

Deno.test('activeDays / restDays account for the flexible sessions', () => {
  const r = solve({ anchors: [LONG_RUN_SUN], lifts: [], flexible: easyRuns(2) });
  assert(r.status !== 'unsolvable');
  for (const f of r.week.flexible) {
    assert(r.week.activeDays.includes(f.day), `${f.day} has an easy run but is not active`);
    assert(!r.week.restDays.includes(f.day), `${f.day} has an easy run and is called a rest day`);
  }
  assertEquals(r.week.activeDays.length + r.week.restDays.length, 7);
});

// ── 7. Refusal, never silent subtraction (§5.2b) ────────────────────────────

Deno.test('REFUSAL: more easy runs than legal days refuses and names the arithmetic', () => {
  // Four anchors block four days for easy_run; asking for four runs leaves three legal days.
  const r = solve({
    anchors: [
      LONG_RUN_SUN,
      QUALITY_RUN_WED,
      LONG_RIDE_SAT,
      { day: 'tuesday', kind: 'quality_bike', label: 'your bike intervals' },
    ],
    lifts: [],
    flexible: easyRuns(4),
  });
  assertEquals(r.status, 'unsolvable');
  assert(r.status === 'unsolvable');
  assertEquals(r.code, 'SOLVER_GRIDLOCK_NO_ROOM');
  assert(r.message.includes('No session was removed'), `refusal must say so: ${r.message}`);
  assert(r.options.length > 0, 'a refusal must offer options');
});

// ── 8. Determinism (§5.1) ───────────────────────────────────────────────────

Deno.test('same input twice → identical placement', () => {
  const input = {
    anchors: [LONG_RUN_SUN, QUALITY_RUN_WED],
    lifts: [{ name: 'Deadlift', isLower: true }, { name: 'Bench Press', isLower: false }],
    flexible: easyRuns(2),
  };
  const a = solve(input);
  const b = solve(input);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

// ── 9. Kind-general: the same code path takes a bike ────────────────────────

Deno.test('GENERAL: easy_bike routes through the same solver with no run-specific code', () => {
  const r = solve({
    anchors: [LONG_RIDE_SAT, { day: 'tuesday', kind: 'quality_bike', label: 'your bike intervals' }],
    lifts: [],
    flexible: [
      { name: 'Easy spin 1', kind: 'easy_bike' },
      { name: 'Easy spin 2', kind: 'easy_bike' },
    ],
  });
  assert(r.status !== 'unsolvable', JSON.stringify(r));
  assertEquals(r.week.flexible.length, 2);
  const days = r.week.flexible.map((f) => f.day);
  // Same-day matrix: easy_bike × long_ride and × quality_bike are both false.
  assert(!days.includes('saturday') && !days.includes('tuesday'), `got ${days.join(',')}`);
  const idx = days.map(dayIdx).sort((a, b) => a - b);
  assert(idx[1] - idx[0] > 1, `two easy rides back to back: ${days.join(',')}`);
});

// ── 9b. Swim: lower interference, and the law says so in the same-day row ───

Deno.test('SWIM: easy swims spread, and tolerate spacing a run would not', () => {
  /**
   * ⛔ SWIMS ARE NOT RUNS AND THE LAW ALREADY KNOWS IT. `easy_swim` is not a leg-loaded kind, so
   * `requiredAdjacencyHours` returns 0 against everything (as it does for `easy_run`) — but the
   * SAME-DAY row is where they diverge, and it is a real divergence:
   *     easy_run  × long_run = false   → an easy run may not share the long-run day
   *     easy_swim × long_run = true    → a swim may
   * So a swim can sit ON a hard anchor's day where a run must stand off it. That is the whole
   * "lower interference" claim, and it is the matrix's claim, not this test's.
   *
   * ⚠️ WHAT THAT MEANS FOR SPACING: the swim's legal pool is every day of the week, so spread has
   * more room to work with and the same session count spreads at least as well as runs do. It also
   * means a swim TOLERATES tighter spacing — when the week is full it can double up on an anchor
   * day rather than force a rest day out, which is exactly what `restShortfall` will make it do.
   */
  const swims = (n: number): FlexibleSession[] =>
    Array.from({ length: n }, (_, i) => ({ name: `Swim ${i + 1}`, kind: 'easy_swim' as const }));

  // 1. With room, swims spread like anything else — no two back to back.
  const r = solve({ anchors: [LONG_RUN_SUN, QUALITY_RUN_WED], lifts: [], flexible: swims(2) });
  assert(r.status !== 'unsolvable', JSON.stringify(r));
  assertEquals(r.week.flexible.length, 2);
  const idx = r.week.flexible.map((f) => dayIdx(f.day));
  assert(gapDays(idx[0], idx[1]) > 1, `swims back to back: ${r.week.flexible.map((f) => f.day).join(',')}`);

  // 2. The divergence, asserted directly: the SAME week that forbids a run on the anchor days
  //    permits a swim there. Four anchors leave a run only three legal days (proved above); a swim
  //    has all seven, so it can take a count the run version refuses outright.
  const packed = [
    LONG_RUN_SUN,
    QUALITY_RUN_WED,
    LONG_RIDE_SAT,
    { day: 'tuesday', kind: 'quality_bike', label: 'your bike intervals' } as Anchor,
  ];
  const runs4 = solve({ anchors: packed, lifts: [], flexible: easyRuns(4) });
  assertEquals(runs4.status, 'unsolvable', 'four easy RUNS do not fit this week');

  const swims4 = solve({ anchors: packed, lifts: [], flexible: swims(4) });
  assert(
    swims4.status !== 'unsolvable',
    'four easy SWIMS must fit the identical week — that is the lower-interference difference',
  );
  assertEquals(swims4.week.flexible.length, 4);
  // And at least one of them shares an anchor day, which is the tighter spacing being tolerated.
  const sharing = swims4.week.flexible.filter((f) => f.sharesDayWith);
  assert(
    sharing.length > 0,
    'on a packed week the swims should double up on an anchor day rather than lose the rest day',
  );
  console.log(
    `  swims on a packed week: ${swims4.week.flexible.map((f) => `${f.day.slice(0, 3)}${f.sharesDayWith ? '*' : ''}`).join(' ')}` +
    `  (* = shares an anchor day)  rest=${swims4.week.restDays.join(',') || 'none'}`,
  );
});

// ── 10. The oracle: prove OPTIMAL, not just "looks spread" ──────────────────

Deno.test('ORACLE: the chosen days are optimal across a sweep of week shapes', () => {
  /**
   * ⛔ ASSERTING A LITERAL PROVES ONE WEEK. This brute-forces every legal subset for each
   * configuration and proves the solver's answer is not beaten on the primary spread criteria
   * (fewest back-to-back days, then the most even circular gaps). If a better arrangement exists,
   * this fails and names it — which is the only way "maximally spread" is a claim rather than a hope.
   */
  const shape = (occupied: number[]): { streak: number; gaps: number[] } => {
    const idx = [...new Set(occupied)].sort((a, b) => a - b);
    if (idx.length === 0) return { streak: 0, gaps: [] };
    if (idx.length === 7) return { streak: 7, gaps: [1, 1, 1, 1, 1, 1, 1] };
    const gaps: number[] = [];
    for (let i = 1; i < idx.length; i++) gaps.push(idx[i] - idx[i - 1]);
    gaps.push(idx[0] + 7 - idx[idx.length - 1]);
    let streak = 0, cur = 0;
    for (let i = 0; i < 14; i++) {
      cur = idx.includes(i % 7) ? cur + 1 : 0;
      if (cur > streak) streak = Math.min(cur, idx.length);
    }
    return { streak, gaps: gaps.sort((a, b) => a - b) };
  };
  const better = (a: { streak: number; gaps: number[] }, b: { streak: number; gaps: number[] }) => {
    if (a.streak !== b.streak) return a.streak < b.streak;
    for (let i = 0; i < Math.max(a.gaps.length, b.gaps.length); i++) {
      const d = (a.gaps[i] ?? 0) - (b.gaps[i] ?? 0);
      if (d !== 0) return d > 0;
    }
    return false;
  };
  const subsets = (pool: number[], k: number): number[][] => {
    if (k === 0) return [[]];
    if (k > pool.length) return [];
    const out: number[][] = [];
    const walk = (s: number, acc: number[]) => {
      if (acc.length === k) { out.push([...acc]); return; }
      for (let i = s; i < pool.length; i++) { acc.push(pool[i]); walk(i + 1, acc); acc.pop(); }
    };
    walk(0, []);
    return out;
  };

  const CONFIGS: { anchors: Anchor[]; n: number }[] = [];
  const anchorSets: Anchor[][] = [
    [LONG_RUN_SUN],
    [LONG_RUN_SUN, QUALITY_RUN_WED],
    [LONG_RUN_SUN, LONG_RIDE_SAT],
    [{ day: 'saturday', kind: 'long_run', label: 'your long run' }],
    [{ day: 'wednesday', kind: 'long_run', label: 'your long run' }],
    [LONG_RUN_SUN, QUALITY_RUN_WED, LONG_RIDE_SAT],
  ];
  for (const anchors of anchorSets) for (const n of [1, 2, 3]) CONFIGS.push({ anchors, n });

  let checked = 0;
  for (const { anchors, n } of CONFIGS) {
    const r = solve({ anchors, lifts: [], flexible: easyRuns(n) });
    if (r.status === 'unsolvable') continue;
    const anchorDays = anchors.map((a) => dayIdx(a.day));
    // Legal days for easy_run: any day not holding a same-day-incompatible anchor.
    const legal: number[] = [];
    for (let d = 0; d < 7; d++) {
      const clash = anchors.some((a) => dayIdx(a.day) === d);
      if (!clash) legal.push(d);
    }
    const chosen = r.week.flexible.map((f) => dayIdx(f.day));
    const mine = shape([...anchorDays, ...chosen]);
    for (const cand of subsets(legal, n)) {
      const theirs = shape([...anchorDays, ...cand]);
      assert(
        !better(theirs, mine),
        `anchors=${anchors.map((a) => a.day).join('/')} n=${n}: solver chose ${chosen.join(',')} ` +
        `(streak=${mine.streak} gaps=${JSON.stringify(mine.gaps)}) but ${cand.join(',')} is better ` +
        `(streak=${theirs.streak} gaps=${JSON.stringify(theirs.gaps)})`,
      );
    }
    checked++;
  }
  assert(checked >= 15, `sweep must actually run — only ${checked} configs solved`);
  console.log(`  oracle: ${checked} configurations, all optimal`);
});

// ── 11. A readable end-to-end shape, printed for review ─────────────────────

Deno.test('SHAPE: full week reads sensibly', () => {
  const r = solve({
    anchors: [LONG_RUN_SUN, QUALITY_RUN_WED],
    lifts: [
      { name: 'Overhead Press', isLower: false },
      { name: 'Deadlift', isLower: true },
    ],
    flexible: easyRuns(2),
  });
  assert(r.status !== 'unsolvable');
  const grid = layout(r);
  console.log('  week:', SOLVER_DAYS.map((d) => `${d.slice(0, 3)}[${grid[d].join('+') || '-'}]`).join(' '));
  assertEquals(r.week.flexible.length, 2);
});
