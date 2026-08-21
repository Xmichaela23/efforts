// THE HARD DAYS BECOME REAL TRAINING — threshold, assignment, progression (§7, 2026-08-17).
//
// ⛔ WHAT THIS PINS. Before §7 the block had NO sustained work anywhere (both hard sessions were
// VO2) and NO week-to-week progression at all — `hardRunSession(day, lowerDays, terrain)` and
// `bikeQualitySession(day)` took no week argument, so week 1 and week 11 were byte-identical. The
// athlete got a maintenance dose repeated twelve times, which is what the screen's own copy
// admitted: *"holds top-end aerobic fitness. It does not build it."*
//
// ⚠️ THE CEILINGS ARE THE SHARP ASSERTIONS, NOT THE COPY. These sessions land on the same day as
// heavy squats under §6, and the 12–18 min VO2 / 30–40 min threshold working-time ceilings are what
// keeps that day survivable. A progression that grows total working time past them defeats the
// stacking law before it ships — and it would do so silently, because a longer session reads as
// more training rather than as a broken constraint.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/hard-day-progression.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { buildWeekMap } from './loading/wendler-531.ts';

const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };
/** §7's gate: no number, no hard day. Every fixture here is an athlete who HAS the numbers. */
const NUMBERS = { fiveKPaceSecPerMi: 435, thresholdPaceSecPerMi: 455, ftpWatts: 240 };
const RUN = {
  enduranceSport: 'run', enduranceFrequency: 4, targetWeeklyMiles: 25,
  easyPaceMinPerMile: 9, longRunDay: 'sunday',
};
const BIKE = { enduranceSport: 'bike', bike: { hours: 6, days: 3, longRideDay: 'saturday' }, targetWeeklyRideHours: 6 };

const build = (cfg: Record<string, unknown>): any =>
  composeStrengthPrimaryPlan({ durationWeeks: 12, oneRepMaxes: MAXES, ...NUMBERS, ...cfg } as never);
const wk = (p: any, n: number): any[] => (p.sessions_by_week[String(n)] ?? []) as any[];
const named = (p: any, n: number, re: RegExp) => wk(p, n).filter((s) => re.test(String(s.name)));
/**
 * ⛔ THE WORK TOKEN, NOT `steps_preset[0]` (2026-08-20, stage 1). Every quality session now opens
 * with a warm-up preset — `quality-session.ts` emits `[warmup, work, cooldown]` — so index 0 is the
 * bracket. Every assertion in this file is about the PRESCRIPTION, so it asks for that.
 */
const tokenOf = (s: any): string =>
  (Array.isArray(s?.steps_preset) ? s.steps_preset : [])
    .filter((t: string) => !/^(warmup|cooldown)_/.test(String(t)))[0] ?? '';

// ── 1. THE THRESHOLD SESSION EXISTS, AND IT LENGTHENS ────────────────────────────────────────────

Deno.test('⛔ THE THRESHOLD SESSION EXISTS AT ALL — the block had no sustained work', () => {
  const p = build({ ...RUN, hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'run' }] });
  assertEquals(named(p, 2, /Threshold Run/).length, 1);
});

Deno.test('⛔ 4×5 → 3×7 → 2×10 ACROSS THE WAVE — same time in zone, held longer each week', () => {
  const p = build({ ...RUN, hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'run' }] });
  // Weeks 1-3 are cycle 1. The reps get LONGER and FEWER; the working total stays ~20 min.
  assertEquals(tokenOf(named(p, 1, /Threshold Run/)[0]), 'run_thr_4x5min_r60s');
  assertEquals(tokenOf(named(p, 2, /Threshold Run/)[0]), 'run_thr_3x7min_r120s');
  assertEquals(tokenOf(named(p, 3, /Threshold Run/)[0]), 'run_thr_2x10min_r180s');
  // ⛔ AND THE WAVE RESETS WITH THE BAR, not with the block — week 5 opens cycle 2 at 4 × 5 again.
  // ⚠️ `_f8` — cycle 2 is the SAME structure run 8 s/mi faster (doctrine §2 wave 2, built
  // 2026-08-17). The shape resets with the bar; the pace is the lever that moved.
  assertEquals(tokenOf(named(p, 5, /Threshold Run/)[0]), 'run_thr_4x5min_r60s_f8');
});

Deno.test('⛔ THE 30-40 MIN THRESHOLD CEILING HOLDS IN EVERY WEEK — §6 depends on it', () => {
  const p = build({ ...RUN, hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'run' }] });
  for (const bw of buildWeekMap(12)) {
    for (const s of named(p, bw.week, /Threshold/)) {
      const m = String(tokenOf(s)).match(/_(\d+)x(\d+)min/);
      assert(!!m, `unparseable threshold token: ${tokenOf(s)}`);
      const working = Number(m![1]) * Number(m![2]);
      assert(working <= 40, `week ${bw.week}: ${working} min of threshold work is past the ceiling`);
      // ⚠️ FLOOR LOWERED TO 10 (2026-08-17). The ANCHOR runs 3×5 · 2×7 · 1×10 — the run yields so the
      // barbell can peak — so week 11 is 10 minutes of work ON PURPOSE. A 15-minute floor was
      // asserting the pre-anchor-cut volume and would fail the doctrine it is meant to protect.
      assert(working >= 10, `week ${bw.week}: ${working} min is not a threshold dose`);
    }
  }
});

Deno.test('⛔ THE VO2 CEILING HOLDS IN THE LEADERS AND THE ANCHOR HALVES IT', () => {
  // ⚠️ "reps and working time are STATIC, only density moves" WAS THIS TEST'S NAME AND IT IS NO
  // LONGER TRUE (2026-08-18). Michael extended the anchor taper to the ride: sixteen minutes of
  // max-HR pedalling obliterates local quad glycogen, and "you cannot squat a 1RM on empty quads".
  // Halving the intervals holds the central adaptation while cutting the peripheral bill.
  // ⛔ WHAT IS STILL STATIC IS THE LEADER BASELINE — 16 min, every leader week — and Helgerud's
  // 3-minute recovery floor. Those are the protocol; the anchor cut is the block yielding to the bar.
  const p = build({ ...BIKE, hardDays: [{ day: 'tuesday', discipline: 'bike' }] });
  for (const bw of buildWeekMap(12)) {
    for (const s of named(p, bw.week, /Bike Intervals/)) {
      const m = String(tokenOf(s)).match(/^bike_vo2_(\d+)x(\d+)min_R(\d+)min$/);
      assert(!!m, `unexpected VO2 token: ${tokenOf(s)}`);
      const expected = bw.cycleKind === 'anchor' ? 8 : 16;
      assertEquals(Number(m![1]) * Number(m![2]), expected, `week ${bw.week}: the VO2 working time moved`);
      // ⛔ AND THE RECOVERY NEVER GOES BELOW HELGERUD'S OWN 3 MIN. Past that this stops being the
      // protocol the 7% VO2max figure came from.
      assert(Number(m![3]) >= 3, `week ${bw.week}: recovery cut to ${m![3]} min, below the protocol`);
    }
  }
});

Deno.test('the ride VO2 progresses by DENSITY — 4 min recovery in week one, 3 from week two', () => {
  const p = build({ ...BIKE, hardDays: [{ day: 'tuesday', discipline: 'bike' }] });
  assertEquals(tokenOf(named(p, 1, /Bike Intervals/)[0]), 'bike_vo2_4x4min_R4min');
  assertEquals(tokenOf(named(p, 2, /Bike Intervals/)[0]), 'bike_vo2_4x4min_R3min');
  assertEquals(tokenOf(named(p, 3, /Bike Intervals/)[0]), 'bike_vo2_4x4min_R3min');
});

Deno.test('the run VO2 progresses in the PRESCRIPTION — its token cannot carry a pace', () => {
  // The recovery is the descent, which ends on the lap button; there is no clock to shorten, so
  // pace is the only lever and it lives in the copy. The token is deliberately identical.
const p = build({ ...RUN, hardDays: [{ day: 'tuesday', discipline: 'run' }] });
  const w1 = named(p, 1, /Hill/)[0], w2 = named(p, 2, /Hill/)[0];
  assertEquals(tokenOf(w1), tokenOf(w2), 'the hill token moved — the expander was not asked for that');
  assert(String(w1.description) !== String(w2.description), 'the hill session says the same thing every week');
  assert(/settle on an effort/i.test(String(w1.description)), `week 1 does not establish: ${w1.description}`);
  assert(/faster than last week/i.test(String(w2.description)), `week 2 does not advance: ${w2.description}`);
});

Deno.test('⛔ THE ANCHOR CUTS THE VO2 SESSION — INVERTED 2026-08-18', () => {
  // ⛔ THIS ASSERTED THE OPPOSITE — "the anchor asks for the fastest of the block, mirroring the 95%
  // single" — and it was the last session in the block that peaked WITH the bar instead of yielding
  // to it. The recipe suite caught it on its first run.
  //
  // Uphill running removes the ECCENTRIC impact, which is why hills were chosen; it does not remove
  // the concentric fatigue, the local glycogen cost or the CNS stress of twelve minutes at maximum
  // heart rate. Michael: "you cannot express a 1RM on the squat rack if you spent 12 minutes at
  // maximum heart rate two days prior." Reps halve in the anchor and the copy explains the cut
  // rather than urging them to push through it.
  const p = build({ ...RUN, hardDays: [{ day: 'tuesday', discipline: 'run' }] });
  const anchorWeek = buildWeekMap(12).find((b) => b.cycleKind === 'anchor')!.week;
  const anchor = String(named(p, anchorWeek, /Hill/)[0].description);
  assertEquals(/fastest this session gets/i.test(anchor), false, 'the push-harder cue survived');
  assert(/fewer reps|getting out of its way/i.test(anchor), `the anchor does not explain the cut: ${anchor}`);
});

Deno.test('⛔ LIGHT WEEKS STILL DELETE THE INTERVALS — the progression did not resurrect them', () => {
  for (const cfg of [
    { ...RUN, hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'run' }] },
    { ...BIKE, hardDays: [{ day: 'tuesday', discipline: 'bike' }, { day: 'thursday', discipline: 'bike' }] },
  ]) {
    const p = build(cfg);
    for (const bw of buildWeekMap(12).filter((b) => b.kind !== 'cycle')) {
      assertEquals(named(p, bw.week, /Hill|Threshold|Intervals/).length, 0,
        `week ${bw.week} (${bw.kind}) kept a hard session`);
    }
  }
});

// ── 2. THE ASSIGNMENT ────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ NEVER TWO VO2 DAYS — two prescribed days is one of each', () => {
  const p = build({ ...RUN, hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'run' }] });
  assertEquals(named(p, 2, /Hill|Interval/).length, 1, 'a second VO2 day was built');
  assertEquals(named(p, 2, /Threshold/).length, 1, 'no threshold day was built');
});

Deno.test('⛔ ONE HARD DAY IS THE INTENSITY DAY — RE-INVERTED 2026-08-18, MICHAEL', () => {
  // ⚠️ THIS ASSERTION HAS NOW FLIPPED TWICE AND THE HISTORY IS THE POINT — read
  // `assignHardRoles`'s header before changing it a third time.
  //   • originally VO2-first, but DISCIPLINE-BLIND, so an athlete with one hard run always got hills
  //     and listing a run before a bike handed threshold to the bike;
  //   • 2026-08-17 threshold-first, on the CNS-cost argument;
  //   • 2026-08-18 intensity-first again, Michael's ruling after the reversal was flagged to him:
  //     the high-intensity day protects the metabolic strength pathways, and prolonged endurance
  //     work is what actually competes with strength adaptation.
  // ⛔ WHAT DID NOT COME BACK is the discipline-blindness: the budget is the WEEK — one intensity
  // session and, if a second hard day is asked for, one threshold.
  const p = build({ ...RUN, hardDays: [{ day: 'tuesday', discipline: 'run' }] });
  assertEquals(named(p, 2, /Hill|Interval/).length, 1, 'the one hard day was not the intensity day');
  assertEquals(named(p, 2, /Threshold/).length, 0, 'threshold fired without a second hard day');
});

Deno.test('⛔ AND THE SPLIT IS ACROSS THE WEEK, NOT PER DISCIPLINE', () => {
  // A first pass made the rule per-discipline — a first hard RUN took threshold and a first hard
  // RIDE took threshold — so the standard hybrid week (1 hard run + 1 hard ride) came out as TWO
  // sustained sessions and erased top-end work from the whole block. Two sub-lactate sessions in two
  // disciplines buy the same adaptation twice. Michael: "a hybrid athlete needs top-end speed."
  const runFirst = build({ ...RUN, bike: { hours: 4, days: 2, longRideDay: 'saturday' },
    hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'bike' }] });
  assertEquals(named(runFirst, 2, /Threshold/).length, 1, 'not exactly one sustained session');
  assertEquals(named(runFirst, 2, /Hill|Interval/).length, 1, 'not exactly one top-end session');
  // ⚠️ THE PRIMARY DISCIPLINE — the one listed first — takes the INTENSITY day (2026-08-18).
  assertEquals(named(runFirst, 2, /Hill|Interval/)[0].type, 'run');
});

Deno.test('⛔ A CLUB DAY IS ALWAYS THE THRESHOLD SLOT — so the app\'s own day stays VO2', () => {
  // Michael 2026-08-17: a group ride or run club settles into a sustained, fast rhythm at or around
  // threshold; precise intervals with strict rest are near-impossible in a pack.
  const p = build({
    ...RUN,
    hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'run', ownership: 'club' }],
  });
  assertEquals(named(p, 2, /Hill|Interval/).length, 1, 'the app\'s day should be the VO2 one');
  assertEquals(named(p, 2, /Club Run/).length, 1);
  // ⛔ AND THE APP DOES NOT ALSO PRESCRIBE A THRESHOLD SESSION — the club day IS that slot.
  assertEquals(named(p, 2, /Threshold/).length, 0, 'a threshold session was built beside the club day');
});

Deno.test('⛔ ONE CLUB DAY AND NOTHING ELSE — the block prescribes no intervals at all', () => {
  // The athlete traded VO2 development for the group environment. That is their choice; what it
  // must not be is a silent one, and it must not produce an invented session either.
  const p = build({ ...RUN, hardDays: [{ day: 'tuesday', discipline: 'run', ownership: 'club' }] });
  assertEquals(named(p, 2, /Hill|Interval|Threshold/).length, 0, 'the app prescribed intervals anyway');
  assertEquals(named(p, 2, /Club Run/).length, 1);
});

Deno.test('two clubs — two held days, and no VO2 anywhere in the block', () => {
  const p = build({
    ...RUN,
    hardDays: [
      { day: 'tuesday', discipline: 'run', ownership: 'club' },
      { day: 'thursday', discipline: 'run', ownership: 'club' },
    ],
  });
  assertEquals(named(p, 2, /Club Run/).length, 2);
  for (const bw of buildWeekMap(12)) {
    assertEquals(named(p, bw.week, /Hill|Interval|Threshold/).length, 0, `week ${bw.week} built a prescribed session`);
  }
});

// ── 3. THE GATE ──────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ NO NUMBER, NO HARD DAY — and it says so rather than vanishing', () => {
  // A session that cannot state a pace or a wattage cannot get faster on purpose. That is the
  // reason for the gate, and the compromise line is what stops a pinned day disappearing silently.
  const p = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, ...RUN,
    bike: { hours: 4, days: 2, longRideDay: 'saturday' },
    hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'bike' }],
  } as never) as any;
  assertEquals((wk(p, 2)).filter((s) => /Hill|Interval|Threshold/.test(String(s.name))).length, 0);
  const notes = (p.placement_compromises ?? []).filter((c: any) => /left out/.test(c.text));
  assertEquals(notes.length, 2, 'both gated days must name themselves');
  assert(notes.some((c: any) => /FTP/.test(c.text)), 'the ride note does not name the missing number');
  assert(notes.some((c: any) => /5K/.test(c.text)), 'the run note does not name the missing number');
});

Deno.test('the gate is PER DISCIPLINE — a 5K without an FTP still gets its hard run', () => {
  const p = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, ...RUN, fiveKPaceSecPerMi: 435,
    bike: { hours: 4, days: 2, longRideDay: 'saturday' },
    hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'bike' }],
  } as never) as any;
  // ⚠️ THE UNGATED RUN IS THE INTENSITY SESSION (2026-08-18) — it is the FIRST hard day, and the
  // ride's proposal is dropped for a missing FTP, so no second day unlocks threshold.
  assertEquals(named(p, 2, /Hill|Interval/).filter((s) => s.type === 'run').length, 1);
  assertEquals(named(p, 2, /Bike Intervals/).length, 0, 'the ride was built without an FTP');
});

Deno.test('⛔ A CLUB DAY IS NOT GATED — the app prescribes nothing, so there is no number to state', () => {
  const p = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, ...RUN,
    hardDays: [{ day: 'tuesday', discipline: 'run', ownership: 'club' }],
  } as never) as any;
  assertEquals(named(p, 2, /Club Run/).length, 1, 'a club day was gated on a number it does not use');
});

Deno.test('⛔ GATING A HARD DAY DOES NOT REFUSE THE PLAN — the block is complete without one', () => {
  const p = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, ...RUN,
    hardDays: [{ day: 'tuesday', discipline: 'run' }],
  } as never) as any;
  assert(wk(p, 2).length > 0, 'the week did not build');
  assert(wk(p, 2).some((s) => s.type === 'strength'), 'the lifting went missing');
  assert(wk(p, 2).some((s) => s.type === 'run'), 'the easy running went missing');
});

// ── 4. THE VOLUME STILL DOES NOT GROW ────────────────────────────────────────────────────────────

Deno.test('⛔ A THRESHOLD DAY IS INSIDE THE TYPED VOLUME, NOT ON TOP OF IT', () => {
  // The threshold run is a different LENGTH from the hill session, so the mileage budget has to
  // subtract what this session actually costs. Under-subtracting hands the difference back as easy
  // miles every week and reads as generosity rather than as a defect.
  const asked = 25 * 9;
  const built = wk(build({
    ...RUN, hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'run' }],
  }), 2).filter((s) => s.type === 'run').reduce((n, s) => n + s.duration, 0);
  assert(Math.abs(built - asked) <= 8, `asked ${asked} min of running, built ${built}`);
});
