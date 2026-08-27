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
  bucketForStep, ENDURANCE_LEDGER_BOUNDARIES_ARE_OURS, enduranceLedgerFor,
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

Deno.test('⛔ A PACE THE LIBRARY REFUSES TO RESOLVE IS NOT GIVEN A BUCKET', () => {
  /**
   * ⚠️ `race_pace` is a 5K's vVO2-ish pace or a marathon's threshold pace depending on the race, and
   * the library says so outright — *"set by the race being trained for, not by this library."*
   * Guessing a bucket for it would be inventing the athlete's race, so it is counted as unclassified
   * and named. ⛔ NEVER silently dropped into a bucket to make the totals look complete.
   */
  const step = { role: 'work', label: 'x', seconds: 600, intensity: { kind: 'race_pace' }, target: {} } as never;
  assertEquals(bucketForStep(step, 'run_lsd' as never), null);
  const easy = { role: 'warmup', label: 'x', seconds: 600, intensity: { kind: 'easy' }, target: {} } as never;
  assertEquals(bucketForStep(easy, 'run_mlss' as never), 'sub_vt1');
  // ⛔ A FLOAT COUNTS ONE BUCKET BELOW THE WORK IT ALTERNATES WITH — ours, and labelled.
  const float = { role: 'float', label: 'x', seconds: 60, intensity: { kind: 'pct_threshold', lo: 1.05, hi: 1.15 }, target: {} } as never;
  assertEquals(bucketForStep(float, 'run_mlss' as never), 'near_threshold');
  assert(/ours/i.test(ENDURANCE_LEDGER_BOUNDARIES_ARE_OURS));
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
