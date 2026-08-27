// ============================================================================
// THE ENDURANCE LEDGER — p146's buckets 1-3, in minutes, across every modality.
//
// ⛔ WHY IT EXISTS. The app balances HOURS PER SPORT; he balances MINUTES PER INTENSITY summed across
// modalities. Buckets 4 and 5 have been computed since the accessory work (`ledgerFor`); 1-3 did not
// exist at all, which is why nothing could check p148's 10%-per-week rule on the endurance side and
// why `adapt-plan` declares `endurance_deload` and never emits it.
//
// Run: deno test --no-check --allow-read --allow-env \
//        supabase/functions/_shared/standing-plan/endurance-ledger.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek, defaultCompetitionLifts } from './index.ts';
import {
  ENDURANCE_LEDGER_BOUNDARIES, ENDURANCE_LEDGER_UNSTATED, enduranceLedgerFor, placeStep,
  vt1FractionFor,
} from './endurance-ledger.ts';
import { buildEnduranceSession, resolveEnduranceAnchors } from '../endurance-library/index.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
const ANCHORS = resolveEnduranceAnchors(BASELINES as never);
const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: defaultCompetitionLifts(),
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
} as never;
const build = (family: string, level: 1 | 2 | 3, extra?: Record<string, unknown>) =>
  buildEnduranceSession({ family, level, anchors: ANCHORS, size: 0.5, ...extra } as never) as never;

Deno.test('⛔⛔ THE WRAPPER IS EASY MINUTES, NOT THRESHOLD MINUTES', () => {
  /**
   * ⛔ p109: *"All minutes count."* A warm-up, a cooldown and a timed recovery inside a threshold
   * session are sub-VT1 minutes — the session is not one intensity just because the athlete calls it
   * by one. Counting a session whole would be exactly the modality-level accounting p146 says has
   * *"few practical ways to track total load"*.
   *
   * ⚠️ ASSERTED AGAINST THE SESSION'S OWN STEPS, not a remembered number, so a band that moves on
   * the page moves this with it.
   */
  const session = build('run_near_threshold', 3, { archetype: 'below_threshold' }) as {
    warmup: { seconds: number | null }[];
    blocks: { repeat: number; steps: { seconds: number | null }[]; restBetween: { seconds: number | null } | null }[];
    cooldown: { seconds: number | null }[];
  };
  const led = enduranceLedgerFor([session as never]);
  const clocked = (steps: { seconds: number | null }[]) =>
    steps.reduce((t, s) => t + (s.seconds ?? 0), 0);
  const wrapper = clocked(session.warmup) + clocked(session.cooldown)
    + session.blocks.reduce((t, b) => t + (b.restBetween?.seconds ?? 0) * Math.max(0, b.repeat - 1), 0);
  const work = session.blocks.reduce((t, b) => t + clocked(b.steps) * b.repeat, 0);
  assertEquals(led.subVt1Minutes, Math.round(wrapper / 60),
    'the easy shell is not being counted as sub-VT1 minutes');
  assertEquals(led.nearThresholdMinutes, Math.round(work / 60),
    'the threshold work is not being counted as near-threshold minutes');
  assert(led.subVt1Minutes > 0 && led.nearThresholdMinutes > 0);
});

Deno.test('⛔⛔ THE STRIDES ARE WORK SETS, NOT MINUTES — his own line, and it is deliberate', () => {
  /**
   * ⛔ p146 DRAWS THE LINE AND HE SAYS IT MAY BE CONTROVERSIAL. Work significantly past the zone 4/5
   * line is not counted as over-threshold MINUTES — each interval is quantified as a work set,
   * because the aerobic contribution is minimal and the muscular effort is high. Close to vVO2max is
   * minutes; about 5 to 10 percent faster is a work set. p147 names "a hard sprint interval" as a
   * work set in as many words.
   *
   * ⚠️ SO FOUR TO EIGHT STRIDES ARE FOUR TO EIGHT ENTRIES IN BUCKET 4, and the easy run they sit on
   * still contributes its own easy minutes. Expected — not a miscount.
   */
  const withStrides = enduranceLedgerFor([build('run_vt1', 1, { addOn: 'strides', size: 0.5 })]);
  const plain = enduranceLedgerFor([build('run_vt1', 1, { size: 0.5 })]);
  assert(withStrides.workSets >= 4 && withStrides.workSets <= 8,
    `${withStrides.workSets} strides is outside his four-to-eight`);
  assertEquals(plain.workSets, 0, 'an easy run with no strides reported work sets');
  assertEquals(withStrides.overThresholdMinutes, 0,
    'a stride was counted as over-threshold minutes instead of as a work set');
});

Deno.test('⛔ AN UNTIMED RECOVERY IS UNMEASURED, NEVER ZERO', () => {
  /**
   * ⛔ "Full recovery" carries no clock and nothing fills one in — the same rule
   * `demonstratedRunVolume` follows when it returns `weeklyMiles: null` rather than a zero. The
   * minutes are missing from the totals, so the totals are a LOWER BOUND and the ledger says so.
   */
  const led = enduranceLedgerFor([build('run_vt1', 1, { addOn: 'strides' })]);
  assert(led.untimedSteps > 0, 'the untimed recoveries were not recorded');
  assertEquals(led.isLowerBound, true, 'a week with untimed rest did not declare itself a lower bound');
  const clean = enduranceLedgerFor([build('run_vt1', 1)]);
  assertEquals(clean.untimedSteps, 0);
  assertEquals(clean.isLowerBound, false);
});

Deno.test('⛔⛔ THE BUCKETS ARE THE SUM ACROSS SPORTS, NEVER PER SPORT', () => {
  /**
   * ⛔ p146's WHOLE PREMISE: *"there are few practical ways to track total load across different
   * stimuli."* A mixed athlete's dose is the sum; which sport carries which minutes is a PLACEMENT
   * question. Two hour dials cannot say whether a week is 78% easy or 50% easy.
   */
  const run = build('run_vt1', 2);
  const ride = build('ride_endurance', 2, { archetype: 'steady' });
  const both = enduranceLedgerFor([run, ride]);
  const apart = enduranceLedgerFor([run]).subVt1Minutes + enduranceLedgerFor([ride]).subVt1Minutes;
  assertEquals(both.subVt1Minutes, apart, 'the sum across sports is not the sum of its parts');
  assert(both.subVt1Minutes > 0);
});

Deno.test('⛔⛔ A STEP IS PLACED BY ITS OWN PERCENTAGE, NOT BY THE FAMILY IT SITS IN', () => {
  /**
   * ⛔ p232 IS WHY. One level-2 `run_mlss` session runs *"15 seconds @ 130% · 45 seconds @ 105% ·
   * 1 minute @ VT1"*, and another *"10 seconds @ 100% · 10 seconds @ all-out · 50 seconds @ 115% ·
   * 1 minute @ 95% · 1 minute @ 90% · 2 minutes @ VT1"*. He prescribes a percentage PER INTERVAL so
   * the athlete knows where each piece sits; filing the whole session under one bucket because the
   * family is called Threshold throws away exactly the resolution p146 asks for.
   *
   * ⛔ AND THE SCALE IS STATED. p229: *"100 percent representing threshold/VT2."*
   */
  const RUN = { sport: 'run', value: 420, unit: 'sec_per_mi', source: 'x', isEstimate: false, vt1SecPerMi: 547 } as never;
  const at = (kind: string, extra: Record<string, unknown> = {}) =>
    ({ role: 'work', label: 'x', seconds: 60, intensity: { kind, ...extra }, target: {} }) as never;

  assertEquals(ENDURANCE_LEDGER_BOUNDARIES.vt2Pct, 1.0);
  // ⛔ VT1 IS MEASURED FROM THE ATHLETE'S OWN TWO ANCHORS — speed is the reciprocal of pace.
  const vt1 = vt1FractionFor(RUN)!;
  assert(Math.abs(vt1 - 420 / 547) < 1e-9, `${vt1} is not this athlete's own ratio`);

  // ⛔ THE RECOVERY PIECES INSIDE AN INTERVAL ARE SUB-VT1, whatever session they are in.
  assertEquals(placeStep(at('pct_threshold', { lo: 0.5, hi: 0.5 }), RUN), { kind: 'bucket', bucket: 'sub_vt1' });
  assertEquals(placeStep(at('pct_threshold', { lo: 0.6, hi: 0.6 }), RUN), { kind: 'bucket', bucket: 'sub_vt1' });
  assertEquals(placeStep(at('vt1'), RUN), { kind: 'bucket', bucket: 'sub_vt1' });
  assertEquals(placeStep(at('easy'), RUN), { kind: 'bucket', bucket: 'sub_vt1' });
  // ⛔ ZONE 3 UP TO THE STATED VT2 LINE.
  assertEquals(placeStep(at('pct_threshold', { lo: 0.9, hi: 0.9 }), RUN), { kind: 'bucket', bucket: 'near_threshold' });
  assertEquals(placeStep(at('pct_threshold', { lo: 1.0, hi: 1.0 }), RUN), { kind: 'bucket', bucket: 'near_threshold' });
  // ⛔ AND HIS OWN WORK-SET LINE.
  assertEquals(placeStep(at('all_out'), RUN), { kind: 'bucket', bucket: 'work_set' });
  assertEquals(placeStep(at('faster_than_vvo2'), RUN), { kind: 'bucket', bucket: 'work_set' });
});

Deno.test('⛔⛔ ABOVE VT2 THE PAGE GIVES TWO BUCKETS AND NO LINE — so the minutes are not split', () => {
  /**
   * ⛔ p146 puts *"just over the second ventilatory threshold"* in NEAR-threshold and *"notably over
   * threshold, moving through zone 4"* in OVER-threshold, and states neither edge as a number. p232
   * prescribes 105%, 115%, 120%, 125% and 130% inside one block, so the difference is real — and
   * this module cannot draw it without inventing the line.
   *
   * ⚠️ SO THE MINUTES ARE REPORTED TOGETHER AND SAY SO. An honest "N minutes above threshold,
   * unsplit" beats a confident wrong bucket, which is the same discipline as `isLowerBound`.
   * ⛔ `overThresholdMinutes` STAYS EMPTY UNTIL THE LINE IS RULED. A zero there is not "no hard
   * work"; the work is in `overVt2Minutes`, and a reader that shows one without the other lies.
   */
  const RUN = { sport: 'run', value: 420, unit: 'sec_per_mi', source: 'x', isEstimate: false, vt1SecPerMi: 547 } as never;
  const step = (lo: number, hi: number) =>
    ({ role: 'work', label: 'x', seconds: 60, intensity: { kind: 'pct_threshold', lo, hi }, target: {} }) as never;
  assertEquals(placeStep(step(1.05, 1.05), RUN), { kind: 'over_vt2', band: { lo: 1.05, hi: 1.05 } });
  assertEquals(placeStep(step(1.30, 1.30), RUN), { kind: 'over_vt2', band: { lo: 1.30, hi: 1.30 } });

  const session = build('run_mlss', 2) as { anchor: unknown };
  const led = enduranceLedgerFor([session as never]);
  assert(led.overVt2Minutes > 0, 'a threshold session reported no minutes above threshold');
  assertEquals(led.overThresholdMinutes, 0, 'the unstated line was drawn after all');
  assert(led.overVt2Band && led.overVt2Band.hi > 1, JSON.stringify(led.overVt2Band));
  assert(/unsplit/.test(ENDURANCE_LEDGER_UNSTATED));
  assert(/first ventilatory threshold has no percentage/.test(ENDURANCE_LEDGER_UNSTATED));
});

Deno.test('⛔ NO MEASURED VT1 MEANS UNPLACED MINUTES, NOT A GUESSED BUCKET', () => {
  /**
   * ⛔ THE RUN'S VT1 LINE IS THE ATHLETE'S OWN measured easy pace against their own threshold pace.
   * With no easy pace on file there is no line, and a step at 90% of threshold cannot be told from
   * one below VT1 — so those minutes are named rather than filed.
   * ⚠️ THE RIDE HAS A PAGE FOR IT: p239 prescribes easy riding *"below 75%"*, which is why a ride
   * needs no measured anchor for this boundary.
   */
  const noEasy = { sport: 'run', value: 420, unit: 'sec_per_mi', source: 'x', isEstimate: false } as never;
  assertEquals(vt1FractionFor(noEasy), null);
  const step = { role: 'work', label: 'x', seconds: 600, intensity: { kind: 'pct_threshold', lo: 0.9, hi: 0.9 }, target: {} } as never;
  const placed = placeStep(step, noEasy) as { kind: string; reason: string };
  assertEquals(placed.kind, 'unplaced');
  assert(/ventilatory/.test(placed.reason), placed.reason);

  assertEquals(vt1FractionFor({ sport: 'ride', value: 250, unit: 'watts', source: 'x', isEstimate: false } as never),
    ENDURANCE_LEDGER_BOUNDARIES.rideVt1Pct);
  // ⚠️ AND TWO ANCHORS THAT DISAGREE ABOUT WHICH PACE IS FASTER ARE REFUSED, never clamped into a
  // number that would look measured.
  assertEquals(vt1FractionFor({ sport: 'run', value: 600, unit: 'sec_per_mi', source: 'x', isEstimate: false, vt1SecPerMi: 400 } as never), null);
});

Deno.test('⛔ THE COMPOSED WEEK CARRIES IT, AND IT DOES NOT RECOMPUTE BUCKETS 4 AND 5', () => {
  const wk = composeWeek({
    ...BASE, week: 2, column: 'standard',
    sportMix: { runs: 4, rides: 0, swimDays: 0, slots: { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'run' } },
    targetRunHours: 4, demonstratedWeeklyMinutes: { run: 300 },
  } as never) as never as {
    enduranceLedger: { subVt1Minutes: number; nearThresholdMinutes: number; overThresholdMinutes: number; workSets: number };
    ledger: { perSession: { countedSets: number }[] };
  };
  const led = wk.enduranceLedger;
  assert(led.subVt1Minutes > 0 && led.nearThresholdMinutes > 0, JSON.stringify(led));
  // ⛔ AND THE EASY MINUTES DOMINATE A WEEK WITH TWO HARD SESSIONS IN IT — p93's own point.
  assert(led.subVt1Minutes > led.nearThresholdMinutes + led.overThresholdMinutes,
    `the week is not mostly easy minutes: ${JSON.stringify(led)}`);
  /**
   * ⛔ BUCKET 4's BARBELL HALF IS `DoseLedger`'s AND IS NOT DUPLICATED HERE. The endurance ledger's
   * `workSets` counts sprint-side efforts only; the strength sets stay where they have always been
   * counted, per p147.
   */
  const barbell = wk.ledger.perSession.reduce((t, x) => t + x.countedSets, 0);
  assert(barbell > 0, 'the strength ledger stopped counting');
  assert(led.workSets < barbell, 'the endurance ledger is double-counting the barbell sets');
});
