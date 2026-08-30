// ============================================================================
// THE GATE — A2: the ME set ladder, and the intensity invariant it sits on.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/standing-plan-me-sets.test.ts
//
// ⛔ TWO FINDINGS, ONE FILE, BECAUSE THE SECOND ONE MADE THE FIRST UNBUILDABLE.
//
//   A2 as filed: every ME slot prescribed `1×1-5` for twelve weeks. p084 asks for 4-6 reps above 90%
//   per pattern per week; one set of one to five sits at or below that floor permanently.
//
//   What building it exposed: the composer prescribed the TOP of both of his bands at once —
//   `reps.hi` (5) at `pctOf1RM.hi` (100% of a working number that is itself 96% of a predicted max).
//   Five reps at ninety-six per cent of a one-rep max. No earn rule keyed on hitting the prescription
//   could ever have fired, so the ladder would have shipped dead.
//
// Michael's ruling, 2026-08-24: the slot opens at the LOW end of the intensity band, the rep target
// stays open across his range, and no row anywhere carries both band tops.
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED — see `docs/NOTES-session-a-device-fixes-2026-08-24.md`.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeBlock, composeWeek, ME_SETS_BAND } from './compose.ts';
import { earnedMeSets } from './me-history.ts';
import { restateFromTest } from './restate.ts';
import {
  INTENSITY_STARTS_LOW_IS_OURS,
  ME_CLEAN_REPS_WITHIN_TOP,
  ME_CLEAN_SESSIONS_TO_EARN,
  ME_SET_LADDER_IS_OURS,
  meLadderStep,
  meSessionOutcome,
  meSetsFromHistory,
  setPositionForCount,
} from './progression.ts';
import { FRAMES } from './frames.ts';
import { prescribe, type ViadaIntent } from '../strength-grid/index.ts';

const WORKING = {
  bench: { lift: 'bench' as const, workingNumber: 200, predicted1RM: 208, epley: 209, brzycki: 207, from: { weight: 180, reps: 3 } },
  squat: { lift: 'squat' as const, workingNumber: 260, predicted1RM: 271, epley: 272, brzycki: 270, from: { weight: 240, reps: 3 } },
  deadlift: { lift: 'deadlift' as const, workingNumber: 300, predicted1RM: 312, epley: 313, brzycki: 311, from: { weight: 275, reps: 3 } },
};

const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
  workingNumbers: WORKING,
  roundTo: 5,
};

const REP_BAND = (() => {
  const p = prescribe('ME', 'barbell');
  return p.kind === 'barbell' ? p.reps : { lo: 1, hi: 1 };
})();

// ── THE INVARIANT ───────────────────────────────────────────────────────────────────────────────

Deno.test('⛔⛔ NO ROW ANYWHERE CARRIES reps.hi AT pct.hi — every slot, every week, both columns', () => {
  /**
   * ⛔ MICHAEL'S RULING, AND IT IS A LAW RATHER THAN A DEFAULT: *"never prescribe reps.hi × pct.hi
   * together anywhere — add the test that pins it."* His bands are inverse pairings. A single is the
   * hundred-per-cent rep; five reps is the ninety-per-cent set. Taking the top of both is not a
   * conservative reading of two ranges, it is an unliftable weight.
   *
   * ⚠️ IT WALKS THE WHOLE BLOCK rather than sampling a slot, because the defect was in a shared
   * helper and appeared on every intent that has a percentage at all.
   */
  /**
   * ⚠️ THE ROW'S OWN INTENT IS IDENTIFIED BY ITS REP RANGE, and it has to be — the invariant is
   * per-intent, and comparing a 90% ME row against DE's 80% top would fail every legal block. The
   * four printed ranges (`1-5`, `2-4`, `3-5`, `6-12`) are unique across the table, so the string the
   * composer already writes is the key.
   */
  const BY_RANGE = new Map<string, { reps: { lo: number; hi: number }; pct: { lo: number; hi: number } }>();
  for (const intent of ['ME', 'DE', 'SKILL', 'HYP'] as ViadaIntent[]) {
    const p = prescribe(intent, 'barbell');
    if (p.kind === 'barbell' && p.pctOf1RM) BY_RANGE.set(`${p.reps.lo}-${p.reps.hi}`, { reps: p.reps, pct: p.pctOf1RM });
  }
  assertEquals(BY_RANGE.size, 3, 'the rep ranges stopped being unique — this test cannot identify a row');

  const block = composeBlock({ ...BASE, weeks: 12, taperWeeks: [11, 12] } as never);
  let checked = 0;
  for (const wk of block) {
    for (const s of wk.sessions) {
      for (const ex of s.strength_exercises ?? []) {
        const pct = ex.percent_1rm;
        const band = BY_RANGE.get(String(ex.reps));
        if (pct == null || !band) continue;
        const plan = (Array.isArray(ex.set_plan) ? ex.set_plan : []).filter((x: any) => x?.warmup !== true);
        const topReps = Math.max(0, ...plan.map((x) => Number(x.reps) || 0));
        checked += 1;
        assert(!(pct >= band.pct.hi && topReps >= band.reps.hi),
          `week ${wk.week} ${s.name} — ${ex.name}: ${topReps} reps at ${Math.round(pct * 100)}% `
          + 'is the top of both bands at once');
        // ⛔ AND IT OPENS AT THE BOTTOM, which is the positive form of the same ruling.
        assertEquals(pct, band.pct.lo,
          `week ${wk.week} ${ex.name}: the intensity did not open at the bottom of its band`);
      }
    }
  }
  // ⚠️ MEASURED, NOT GUESSED: only the tested competition lifts carry a percentage at all (a working
  // number belongs to a lift, not to a pattern — see `exerciseForSlot`), which is three rows a week
  // across twelve weeks. A threshold above that would fail on a correct block.
  assert(checked >= 30, `the walk found only ${checked} prescribed rows — it is not reading the block`);
});

Deno.test('the ME slot opens at the BOTTOM of his intensity band, and the label says whose that is', () => {
  // ⛔ 90% of the working number, not 100%. ⚠️ 200 × 0.90 = 180 — the upper body takes no haircut.
  const wk = composeWeek({ ...BASE, week: 2, column: 'standard' } as never);
  const me = wk.sessions.find((s) => s.name === 'ME: Upper')!.strength_exercises!
    .find((e) => e.name === 'Bench Press')!;
  const band = (prescribe('ME', 'barbell') as { pctOf1RM: { lo: number; hi: number } }).pctOf1RM;
  assertEquals(me.percent_1rm, band.lo);
  assertEquals(me.weight, 180);
  // ⛔ THE EXTENSION IS OURS AND SAYS SO. He states "start low" for SETS and gives intensity a band
  // with no starting point in it; reading his instruction across is ours.
  assert(/ours/i.test(INTENSITY_STARTS_LOW_IS_OURS));
  assert(/rep target|reps/i.test(INTENSITY_STARTS_LOW_IS_OURS));
});

// ── THE LADDER ──────────────────────────────────────────────────────────────────────────────────

Deno.test('the ME slot starts at ONE set — his own low end, and the band is his', () => {
  assertEquals(ME_SETS_BAND, { lo: 1, hi: 3 });
  const wk = composeWeek({ ...BASE, week: 2, column: 'standard' } as never);
  for (const s of wk.sessions.filter((x) => x.name?.startsWith('ME:'))) {
    for (const ex of s.strength_exercises ?? []) {
      if (!/1-5/.test(String(ex.reps))) continue;
      assertEquals(ex.sets, 1, `${ex.name} did not open at one set`);
    }
  }
  assert(/ours/i.test(ME_SET_LADDER_IS_OURS));
});

Deno.test('⛔ TWO CLEAN SESSIONS EARN A SET; ONE DOES NOT', () => {
  // ⚠️ MUTATION-TESTED. With the run threshold at 1 the ladder climbs on a single good day, which is
  // the deadband this codebase states in three other files: never act on one reading.
  assertEquals(ME_CLEAN_SESSIONS_TO_EARN, 2);
  assertEquals(meSetsFromHistory(['clean'], ME_SETS_BAND).sets, 1);
  assertEquals(meSetsFromHistory(['clean', 'clean'], ME_SETS_BAND).sets, 2);
  assertEquals(meSetsFromHistory(['clean', 'clean', 'clean', 'clean'], ME_SETS_BAND).sets, 3);
  // ⛔ HIS RANGE IS THE CAP. Six clean sessions do not buy a fourth set.
  assertEquals(meSetsFromHistory(Array(12).fill('clean'), ME_SETS_BAND).sets, 3);
});

Deno.test('⛔ A MISS OR A GRIND DROPS ONE, AND NEVER BELOW THE FLOOR', () => {
  assertEquals(meSetsFromHistory(['clean', 'clean', 'setback'], ME_SETS_BAND).sets, 1);
  assertEquals(meSetsFromHistory(['setback', 'setback', 'setback'], ME_SETS_BAND).sets, 1);
  // ⚠️ A MID-BAND SESSION IS NEITHER. It is the ordinary outcome at 90% and costs nothing — but it
  // breaks the run, or a clean-mid-clean sequence would earn a set two good days never produced.
  assertEquals(meSetsFromHistory(['clean', 'mid_band', 'clean'], ME_SETS_BAND).sets, 1);
  assertEquals(meSetsFromHistory(['clean', 'mid_band'], ME_SETS_BAND).cleanRun, 0);
});

Deno.test('⛔ SILENCE HOLDS — nothing logged is not a failure and is not a lost set', () => {
  /**
   * ⛔ THE STANDING LAW (pivot §4): *"nothing logged = no evidence = hold (never zero)."* A skipped
   * week is the plan having nothing to read, not the athlete failing. ⚠️ MUTATION-TESTED: treating
   * `no_evidence` as a setback walks every athlete who misses a week back down to one set.
   */
  const at2 = { sets: 2, cleanRun: 1 };
  assertEquals(meLadderStep(at2, 'no_evidence', ME_SETS_BAND), at2);
  assertEquals(meSetsFromHistory(['clean', 'clean', 'no_evidence', 'no_evidence'], ME_SETS_BAND).sets, 2);
});

// ── WHAT COUNTS AS CLEAN ────────────────────────────────────────────────────────────────────────

const outcome = (sets: unknown[], prescribedSets = 1, weight: number | null = 180) =>
  meSessionOutcome({ sets: sets as never, prescribedSets, repBand: REP_BAND, prescribedWeight: weight });

Deno.test('⛔ CLEAN IS THE TOP OF HIS REP BAND, COMPLETED, STOPPED SHORT', () => {
  // ⛔ Michael, 2026-08-24: *"the top of the rep band (4-5 reps) completed with stop-short quality,
  // no miss."* ⚠️ The threshold is read OFF the band — a band change moves it rather than leaving
  // this asserting an old number.
  assertEquals(ME_CLEAN_REPS_WITHIN_TOP, 1);
  assertEquals(outcome([{ reps: 5, weight: 180, completed: true }]), 'clean');
  assertEquals(outcome([{ reps: 4, weight: 180, completed: true }]), 'clean');
  assertEquals(outcome([{ reps: 3, weight: 180, completed: true }]), 'mid_band');
});

Deno.test('⛔ A SET GROUND OUT TO FAILURE IS A SETBACK EVEN AT FIVE REPS', () => {
  /**
   * ⛔ p218 GIVES ME NO RIR TARGET AND SAYS IN THE SAME BREATH that each set *"stops short of failure
   * — technical breakdown here is counterproductive."* A logged 0 is the athlete reporting the one
   * thing that instruction forbids, and reading it as clean would earn a second set off the evidence
   * that the first one was already too much.
   */
  assertEquals(outcome([{ reps: 5, weight: 180, rir: 0, completed: true }]), 'setback');
  // ⚠️ ABSENT IS NOT ZERO (D-324). "They did not say" must never be read as failure, or every athlete
  // who skips the field loses sets they earned.
  assertEquals(outcome([{ reps: 5, weight: 180, rir: null, completed: true }]), 'clean');
  assertEquals(outcome([{ reps: 5, weight: 180, rir: 2, completed: true }]), 'clean');
});

Deno.test('a short session, an under-loaded set and an empty log are three different answers', () => {
  // ⛔ FEWER SETS THAN THE ROW ASKED FOR IS A MISS.
  assertEquals(outcome([{ reps: 5, weight: 180, completed: true }], 2), 'setback');
  // ⛔ UNDER THE PRESCRIBED LOAD IS A MISS — the reps were bought at a weight nobody prescribed.
  assertEquals(outcome([{ reps: 5, weight: 150, completed: true }]), 'setback');
  // ⛔ A SET LOGGED WITH NO WEIGHT AT ALL IS A MISS **AGAINST A PRESCRIBED WEIGHT** — the athlete
  // cannot have made a number they never entered.
  assertEquals(outcome([{ reps: 5, completed: true }]), 'setback');
  // ⚠️ AND NO PRESCRIBED WEIGHT MEANS NO LOAD TEST AT ALL. On the "by feel" weeks before the test is
  // read there is no number to fall short of, and an unweighted log is the ORDINARY shape of one.
  // ⛔ MUTATION-TESTED — this is the case that keeps the guard alive; without this line, deleting it
  // changes no answer and the next session removes it as dead.
  assertEquals(outcome([{ reps: 5, weight: 150, completed: true }], 1, null), 'clean');
  assertEquals(outcome([{ reps: 5, completed: true }], 1, null), 'clean');
  // ⛔ NOTHING COMPLETED IS SILENCE, NOT A MISS.
  assertEquals(outcome([{ reps: 5, weight: 180, completed: false }]), 'no_evidence');
  assertEquals(outcome([]), 'no_evidence');
});

// ── THE WIRE ────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ THE EARNED COUNT REACHES THE PRESCRIBED ROW', () => {
  const wk = composeWeek({
    ...BASE, week: 4, column: 'standard', meSetsByPattern: { push_upper: 2 },
  } as never);
  const bench = wk.sessions.find((s) => s.name === 'ME: Upper')!.strength_exercises!
    .find((e) => e.name === 'Bench Press')!;
  assertEquals(bench.sets, 2);
// ⚠️ WORK SETS ONLY — the ramp (pp.139-140) sits in front and is not a prescription set.
  assertEquals(bench.set_plan!.filter((x: any) => x?.warmup !== true).length, 2);
  // ⚠️ AND ONLY THAT PATTERN. A count on the bench must not add a set to the squat.
  const squat = composeWeek({ ...BASE, week: 4, column: 'standard', meSetsByPattern: { push_upper: 2 } } as never)
    .sessions.find((s) => s.name === 'ME: Lower')!.strength_exercises!
    .find((e) => /1-5/.test(String(e.reps)))!;
  assertEquals(squat.sets, 1);
  // ⛔ AND THE COUNT GOES BACK THROUGH STAGE 2'S BAND rather than being written straight onto the row.
  assertEquals(setPositionForCount(1, ME_SETS_BAND), 0);
  assertEquals(setPositionForCount(3, ME_SETS_BAND), 1);
  assertEquals(setPositionForCount(99, ME_SETS_BAND), 1, 'a count above his cap was not clamped');
});

Deno.test('⛔ THE LADDER IS READ OFF LOGGED SESSIONS, matched on week + weekday + movement', () => {
  const block = composeBlock({ ...BASE, weeks: 6, taperWeeks: [] } as never);
  const meRows = block.flatMap((b) => b.meRows).filter((r) => r.movement === 'Bench Press');
  assert(meRows.length >= 3, 'the composer reported almost no ME rows');

  const logged = meRows.slice(0, 3).map((r) => ({
    week_number: r.week,
    // ⚠️ A DATE THAT LANDS ON THE ROW'S OWN WEEKDAY — the join key, exactly as the restater builds it.
    date: dateOn(r.day),
    strength_exercises: [{
      name: r.movement,
      sets: [{ reps: 5, weight: r.weight ?? 180, completed: true }],
    }],
  }));
  const read = earnedMeSets({ composed: block, logged, throughWeek: 6 });
  assertEquals(read.sets.push_upper, 2, 'three clean bench sessions did not earn a second set');
  assertEquals(read.history.push_upper!.length, 3);

  // ⛔ AND A SESSION THE READER CANNOT MATCH IS COUNTED, NOT SWALLOWED.
  const none = earnedMeSets({ composed: block, logged: [], throughWeek: 6 });
  assertEquals(none.sets, {});
  assert(none.unread > 0, 'the reader claims it read rows it never saw');
});

Deno.test('⛔⛔ AN AUTOFILLED RIR IS NOT EVIDENCE — the engine must not grade its own suggestion', () => {
  /**
   * ⛔ D-203: the logger completes a set with the PRESCRIBED reserve when the athlete typed nothing,
   * and stamps `rir_autofilled: true`. Two other readers in this codebase already refuse those
   * (`compute-facts/strength-facts-lib.ts:197`, `analyze-strength-workout/index.ts:547`); the Viada
   * engine did not, and it is the engine that moves the bar.
   *
   * ⚠️ MUTATION CHECK: delete the `rir_autofilled` condition in `setsOf` and the first assertion
   * below fails — the autofilled 0 is read as a grind and costs the pattern its earned set.
   */
  const block = composeBlock({ ...BASE, weeks: 6, taperWeeks: [] } as never);
  const meRows = block.flatMap((b) => b.meRows).filter((r) => r.movement === 'Bench Press');
  assert(meRows.length >= 3, 'the composer reported almost no ME rows');

  const sessions = (rir: Record<string, unknown>) => meRows.slice(0, 3).map((r) => ({
    week_number: r.week,
    date: dateOn(r.day),
    strength_exercises: [{
      name: r.movement,
      sets: [{ reps: 5, weight: r.weight ?? 180, completed: true, ...rir }],
    }],
  }));

  // ⛔ THREE CLEAN SESSIONS WHOSE ZERO WAS WRITTEN BY THE APP. `meSessionOutcome` scores `rir === 0`
  // as the grind that costs a set — but nobody said zero, so the ladder must climb exactly as it
  // does when no reserve is reported at all.
  const autofilled = earnedMeSets({
    composed: block,
    logged: sessions({ rir: 0, rir_autofilled: true }),
    throughWeek: 6,
  });
  assertEquals(
    autofilled.sets.push_upper,
    2,
    'an RIR the app wrote itself was graded as if the athlete had reported it',
  );

  // ⛔ AND A ZERO THE ATHLETE ACTUALLY TYPED STILL COSTS THE SET. The fix drops the flag, not the
  // signal — otherwise it would have deleted the grind rule instead of aiming it.
  const typed = earnedMeSets({
    composed: block,
    logged: sessions({ rir: 0 }),
    throughWeek: 6,
  });
  assertEquals(
    typed.history.push_upper!.every((h) => h.outcome === 'setback'),
    true,
    'a reported zero-in-reserve stopped being read as the grind',
  );
  assertEquals(typed.sets.push_upper, ME_SETS_BAND.lo, 'three ground-out sessions still earned a set');
});

Deno.test('⛔ EVIDENCE STOPS AT THE LIVE WEEK — the future is not evidence', () => {
  // ⚠️ MUTATION-TESTED. Without the bound, sessions logged against later weeks (a re-log, an early
  // tick) would earn sets before the weeks that hold them have been trained.
  const block = composeBlock({ ...BASE, weeks: 8, taperWeeks: [] } as never);
  // ⚠️ THE BOUNDARY LIVES ON THE INDEX BUILD, NOT ON THE LOGGED LOOP — a second test in the loop was
  // measured to guard nothing and was deleted. This mutates against the surviving one.
  const late = block.flatMap((b) => b.meRows)
    .filter((r) => r.movement === 'Bench Press' && r.week >= 6)
    .map((r) => ({
      week_number: r.week,
      date: dateOn(r.day),
      strength_exercises: [{ name: r.movement, sets: [{ reps: 5, weight: r.weight ?? 180, completed: true }] }],
    }));
  assert(late.length >= 2, 'the fixture has nothing past the boundary to exclude');
  assertEquals(earnedMeSets({ composed: block, logged: late, throughWeek: 3 }).sets, {});
});

Deno.test('⛔ THE RESTATER PROPOSES THE SET CHANGE, not only the weight', () => {
  /**
   * ⛔ A2's LAST MILE. The ladder can add a set in a week whose weight does not move, so a diff that
   * only looked at the weight would drop every set change that landed on a flat week — the ladder
   * would compute correctly and reach nobody's calendar. ⚠️ MUTATION-TESTED by reverting `setsMove`.
   */
  const authored = composeBlock({ ...BASE, weeks: 6, taperWeeks: [] } as never);
  // ⚠️ `pull_upper` IS IN THE FIXTURE ON PURPOSE. Day 1's ME accessory is a pull, and no pull was
  // tested — so that row carries NO prescribed weight and stays "By feel" forever. It is the only
  // shape that exercises a set change on an auto-regulated row, and without it the "stays by feel"
  // assertion below is vacuous (mutation-tested: removing it lets the restater price the row).
  const earned = composeBlock({
    ...BASE, weeks: 6, taperWeeks: [], meSetsByPattern: { push_upper: 2, pull_upper: 2 },
  } as never);

  const planned = authored.flatMap((wk) => wk.sessions
    .filter((s) => s.type === 'strength')
    .map((s, i) => ({
      id: `${wk.week}-${i}`,
      week_number: wk.week,
      date: dateOn(s.day),
      strength_exercises: s.strength_exercises,
    })));

  const restated = restateFromTest({ composed: earned, planned, afterWeek: 2 });
  const setChange = restated.changes.find((c) => c.movement === 'Bench Press' && c.sets);
  assert(setChange, 'the second set never reached the calendar');
  assertEquals(setChange!.sets, { from: 1, to: 2 });
  // ⛔ AND A ROW THAT ONLY GAINED A SET IS NOT STAMPED AS A NEW LOAD.
  const row = restated.rows.find((r) => r.strength_exercises.some((e) => e.name === 'Bench Press'))!;
  const bench = row.strength_exercises.find((e) => e.name === 'Bench Press')!;
  assertEquals(bench.sets, 2);
  // ⚠️ THE AUTO-REGULATED ROWS STAY BY FEEL even when their SET COUNT moves. A HYP row carries no
  // percentage by design (p218), and an ME row on an untested pattern carries none either.
  const byFeel = restated.changes.filter((c) => c.sets && c.to == null);
  assert(byFeel.length > 0, 'no set change landed on a by-feel row — the next assertion is vacuous');
  for (const r of restated.rows) {
    for (const e of r.strength_exercises) {
      if (e.weight === 'By feel') assert(e.load_prescribed !== true, `${e.name} was priced by the restate`);
    }
  }
});

Deno.test('⛔ A DAY MAY HOLD MORE THAN ONE STRENGTH SESSION, and the restater must see both', () => {
  /**
   * ⛔ THE CONTRACT, PINNED DIRECTLY — because no frame produces this shape TODAY and the branch
   * would otherwise sit untested until something did.
   *
   * `restateFromTest` built its lookup with `bySlot.set(week|day, …)`, which is correct only while a
   * day holds at most one `type: 'strength'` session. It briefly did not: the 2026-08-24 three-day
   * plyo spread put a drill session on frame day 1 beside the lift, the second write replaced
   * `ME: Upper`'s exercises with a skip, and every ME row on that day stopped being restated —
   * **silently**, as a diff that just came back short. The spread was reverted; the map accumulates.
   *
   * ⚠️ THE SHAPE IS COMING BACK. The cycling frames (p278/p280) merge speed days into three lifting
   * days, and the advanced tier already appends sessions to open days. This test is what makes that
   * arrive as a working restate rather than as a silent no-op.
   */
  const composed = [{
    frame: 'strength_5k' as const, week: 3, column: 'standard' as const, isTestWeek: false,
    ledger: null as never, meRows: [], notes: [],
    // ⚠️ THE DRILL SESSION IS SECOND, AND THAT ORDER IS THE POINT. `composeWeek` pushes the plyo
    // session AFTER the strength branch so the day leads on its lift — which is exactly the order in
    // which an overwriting map loses the lift. A fixture with the lift second passes either way and
    // proves nothing (measured: it did).
    sessions: [
      { day: 'Monday', type: 'strength', name: 'ME: Upper', description: '', duration: 55, tags: [],
        strength_exercises: [{
          name: 'Bench Press', sets: 2, reps: '1-5', weight: 200, percent_1rm: 0.9,
          set_plan: [{ weight: 200, reps: 5 }, { weight: 200, reps: 5 }],
        }] },
      { day: 'Monday', type: 'strength', name: 'Plyometrics', description: '', duration: 20, tags: [],
        strength_exercises: [{ name: 'A-Skip', sets: 1, reps: 4, weight: 'Bodyweight', load_prescribed: false }] },
    ],
  }];
  const planned = [{
    id: 'row-1', week_number: 3, date: dateOn('Monday'),
    strength_exercises: [{ name: 'Bench Press', sets: 1, reps: '1-5', weight: 180, set_plan: [{ weight: 180, reps: 5 }] }],
  }];
  const restated = restateFromTest({ composed: composed as never, planned, afterWeek: 2 });
  const change = restated.changes.find((c) => c.movement === 'Bench Press');
  assert(change, 'the lift on a day that also holds a drill session was never restated');
  assertEquals(change!.to, 200);
  assertEquals(change!.sets, { from: 1, to: 2 });
});

/** A real ISO date falling on the given weekday, so `weekdayOf` reproduces it. ⚠️ Parsed as UTC. */
function dateOn(day: string): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const want = names.indexOf(day);
  // 2026-01-04 is a Sunday.
  const base = Date.parse('2026-01-04T00:00:00Z');
  return new Date(base + want * 86400000).toISOString().slice(0, 10);
}

Deno.test('the frame still has exactly the ME slots this ladder is about', () => {
  // ⛔ A GUARD ON THE FIXTURES ABOVE. If the frame stops carrying ME slots, every ladder test would
  // pass vacuously.
  const std = FRAMES.strength_5k.columns.standard;
  const me = std.flatMap((d) => d.strength).filter((s) => s.intent === 'ME');
  // ⚠️ FOUR: day 1 carries an ME push and an ME pull, day 2 an ME hinge and an ME lower push.
  assertEquals(me.length, 4, 'the frame no longer holds the ME slots these tests exercise');
});
