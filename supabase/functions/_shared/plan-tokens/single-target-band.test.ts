/**
 * The one owner of a step's range (round 4, 2026-09-18: TrainingPeaks' ±10% for watts and run pace; round 5,
 * 2026-09-18: the page tops, Michael's ruling). Every ride and run step has a top except sprints:
 *   · endurance ride 75% of FTP (p239) · sweet spot 100% of FTP (pp238–239) · easy / VT1 / long run the easy range's
 *     own top (p235) · anaerobic floor to 130% on the screen and the watch, at-or-above the floor in the score (p237)
 *   · a printed range its own top · a single number ±10% · a page's top wins over the ±10% band.
 * Sample athlete: FTP 250 W, threshold 7:00/mi (420 s).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pacedAt, parseQualityWork, qualityRideSteps, qualityRunSteps, singleTargetBand, wattsAt } from './quality-work.ts';
import { ridePowerRuleOf } from '../endurance-library/source-rules.ts';
import { expandBikeToken, stampRunPrescription, toV3Step } from '../../materialize-plan/index.ts';
import { plannedStepLines } from '../planned-step-lines.ts';
import { convertWorkoutToGarmin } from '../garmin/convert-workout.ts';
import { serializeRide } from '../intervals/serialize.ts';
import { powerRangeBand, shareInPowerRange } from '../ride-power.ts';

const FTP = 250;
const THRESHOLD = 420;
// deno-lint-ignore no-explicit-any
const garminSteps = (steps: any[]) => convertWorkoutToGarmin({ type: 'ride', name: 'R', user_ftp: FTP, computed: { steps } } as any).segments[0].steps as any[];
// deno-lint-ignore no-explicit-any
const intervals = (steps: any[]) => serializeRide({ id: 'r', date: '2026-09-18', type: 'ride', name: 'R', computed: { steps, anchors: { ftp_w: FTP } } } as any).description;
// deno-lint-ignore no-explicit-any
const v3 = (steps: any[]) => steps.map((s) => toV3Step(s));

Deno.test('a single number is ±10%', () => {
  assertEquals(singleTargetBand(200), { lower: 180, upper: 220 });
});

Deno.test('sweet spot 95% → 85.5–100% of FTP (pp238–239: the page top wins over the ±10% band)', () => {
  const rule = ridePowerRuleOf('ride_sweet_spot');
  assertEquals(rule, 'under_threshold');
  assertEquals(wattsAt(0.95, 0.95, FTP, rule), { lower: 214, upper: 250 });
  // A surge the page prints above 100% (105% on the minute) keeps its own ±10%.
  assertEquals(wattsAt(1.05, 1.05, FTP, rule), { lower: 236, upper: 289 });
});

Deno.test('the "never over FTP at ≤100%" extension is gone: a single 95% outside sweet spot is ±10%', () => {
  assertEquals(wattsAt(0.95, 0.95, FTP), { lower: 214, upper: 261 });
});

Deno.test('endurance ride top 75% of FTP (p239): 0–188 W, "under 188 W" on screen, 0–188 W on Garmin', () => {
  assertEquals(wattsAt(0, 0.75, FTP, 'easy'), { lower: 0, upper: 188 });
  const steps = v3(expandBikeToken('bike_endurance_60min', { ftp: FTP } as never, 'ride_endurance'));
  assertEquals(steps[0].powerRange, { lower: 0, upper: 188 });
  assertEquals(plannedStepLines(steps, { sport: 'ride' }), ['1:00:00 @ under 188 W']);
  const g = garminSteps(steps).find((s) => s.durationValue === 3600);
  assertEquals([g.targetType, g.targetValueLow, g.targetValueHigh], ['POWER', 0, 188]);
});

Deno.test('VO2 110–120% → 275–300 W: a printed range tops out at its own top', () => {
  assertEquals(wattsAt(1.1, 1.2, FTP, ridePowerRuleOf('ride_vo2')), { lower: 275, upper: 300 });
  const steps = v3(qualityRideSteps(parseQualityWork('round_5x_180s110to120_R300s')!, FTP, ridePowerRuleOf('ride_vo2')));
  assertEquals(steps[0].powerRange, { lower: 275, upper: 300 });
  const g = garminSteps(steps).find((s) => s.durationValue === 180);
  assertEquals([g.targetValueLow, g.targetValueHigh], [275, 300]);
  assert(intervals(steps).includes('3m 110-120%'), intervals(steps));
});

Deno.test('anaerobic: 125–130% on the screen and the watch; the score counts everything at or above 125%', () => {
  const rule = ridePowerRuleOf('ride_anaerobic');
  assertEquals(rule, 'floor');
  // The saved step: a floor, no `upper` (the score has no top), a shown top of 130% of FTP.
  assertEquals(wattsAt(1.25, 1.25, FTP, rule), { lower: 313, shown_upper: 325 });
  const steps = v3(qualityRideSteps(parseQualityWork('round_6x_60s125-r60s50')!, FTP, rule));
  assertEquals(steps[0].powerRange, { lower: 313, shown_upper: 325 });
  // The 50% recovery the page prints keeps its ±10%.
  assertEquals(steps[1].powerRange, { lower: 113, upper: 138 });
  // Screen.
  assertEquals(plannedStepLines(steps, { sport: 'ride' }), ['6 × 1:00 @ 313–325 W, 1:00 @ 113–138 W between']);
  // Garmin: a power target, floor to 130%.
  const g = garminSteps(steps).find((s) => s.durationValue === 60 && s.intensity !== 'REST' && s.intensity !== 'RECOVERY');
  assertEquals([g.targetType, g.targetValueLow, g.targetValueHigh], ['POWER', 313, 325]);
  // Intervals.icu / Zwift: floor to 130%.
  assert(intervals(steps).includes('1m 125-130%'), intervals(steps));
  // The score: at or above the floor is in range, with no upper limit.
  const up = steps[0].powerRange.upper;
  assertEquals(up, undefined);
  assertEquals(powerRangeBand(313, 313, up), 'in');
  assertEquals(powerRangeBand(400, 313, up), 'in');
  assertEquals(powerRangeBand(312, 313, up), 'below');
  assertEquals(shareInPowerRange([313, 500, 200, 330], 313, up), 0.75);
});

Deno.test('a single 90% run pace → ±10% (7:47/mi at threshold 7:00 → 7:00–8:34/mi)', () => {
  const pace = pacedAt(0.9, THRESHOLD)!;
  assertEquals(pace, 467);
  assertEquals(toV3Step({ kind: 'work', duration_s: 240, pace_sec_per_mi: pace }).pace_range, { lower: 420, upper: 514 });
  // Work and recovery alike (round 4 replaced our ±2% / ±6%).
  assertEquals(toV3Step({ kind: 'recovery', duration_s: 60, pace_sec_per_mi: 600 }).pace_range, { lower: 540, upper: 660 });
});

Deno.test('easy run top = the easy range\'s own top (p235), on easy runs and on VT1 steps inside a hard run', () => {
  const baselines = { _resolvedEasySecPerMi: 510, _resolvedEasyRange: { lo: 479, hi: 542 } } as never;
  const easy = stampRunPrescription('run_easy_30min', [{ kind: 'work', duration_s: 1800, pace_sec_per_mi: 510 }], baselines);
  assertEquals(toV3Step(easy[0]).pace_range, { lower: 479, upper: 542 });
  const hard = stampRunPrescription('round_6x_15s130-45s105-r60svt1', [{ kind: 'recovery', duration_s: 60, pace_sec_per_mi: 510 }], baselines);
  assertEquals(toV3Step(hard[0]).pace_range, { lower: 479, upper: 542 });
  // A step with its own range keeps it.
  assertEquals(toV3Step({ kind: 'work', duration_s: 1800, pace_sec_per_mi: 547, pace_range: [513, 581] }).pace_range, { lower: 513, upper: 581 });
});

Deno.test('a sprint carries no target anywhere (p236, p229–231)', () => {
  const ride = v3(qualityRideSteps(parseQualityWork('round_3x_30sallout_R120s')!, FTP, ridePowerRuleOf('ride_sprints')));
  assertEquals(ride[0].powerRange, undefined);
  const g = garminSteps(ride).find((s) => s.durationValue === 30);
  assert(g.targetType !== 'POWER', JSON.stringify(g));
  assert(intervals(ride).includes('30s freeride'), intervals(ride));
  const run = v3(qualityRunSteps(parseQualityWork('round_4x_10sallout-r50svt1')!, { thresholdSecPerMi: THRESHOLD, easySecPerMi: 510 }));
  assertEquals(run[0].pace_range, undefined);
  assertEquals(run[0].paceTarget, undefined);
});
