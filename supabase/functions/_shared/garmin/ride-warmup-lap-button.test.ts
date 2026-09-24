/**
 * A ride's easy-spin warm-up reaches Garmin as the lap-button step (2026-09-24, WORKORDER-outdoor-ride-matching, the
 * calendar-sync piece): durationType OPEN, no duration — the Edge shows the warm-up until the athlete presses lap.
 * The planned row keeps the line's seconds (the card, the minutes, the step walk); the interval steps are unchanged;
 * runs are untouched. The shape is owned by `endurance-library/source-rules.ts` (RIDE_* wrappers, `lapButton`),
 * read back by `materialize-plan expandBikeToken` (`lap_button`) and sent by `convertWorkoutToGarmin` (`OPEN`).
 *
 * Run: ~/.deno/bin/deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/garmin/ride-warmup-lap-button.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { expandTokensForRow, toV3Step } from '../../materialize-plan/index.ts';
import { convertWorkoutToGarmin } from './convert-workout.ts';
import { wrapperStepForToken } from '../endurance-library/source-rules.ts';

const BASE: any = { ftp: 250, easyPace: '9:00/mi', fiveK_pace: '7:00/mi', threshold_pace_sec_per_mi: 520 };
function build(row: any) {
  const steps = expandTokensForRow({ id: row.name, ...row }, BASE).steps.map((st: any) => toV3Step(st, row)).map((s: any, i: number) => ({ ...s, id: `s${i}` }));
  const payload = convertWorkoutToGarmin({ id: row.name, name: row.name, type: row.type, computed: { steps }, description: '' } as any);
  const flat: any[] = [];
  const walk = (x: any[]) => { for (const st of x) { if (Array.isArray(st?.workoutSteps)) walk(st.workoutSteps); else flat.push(st); } };
  for (const seg of payload.segments) walk(seg.steps as any[]);
  return { steps, payload, flat };
}
const ONE_TO_ONE = { type: 'ride', name: 'One-to-One Repeats', tags: ['family:ride_anaerobic'], steps_preset: ['wrap_ride_anaerobic_warm0', 'round_10x_60s110-60s50'] };

Deno.test('the One-to-One L1 ride: the warm-up goes as OPEN with no duration; the row keeps 12:30', () => {
  const { steps, flat } = build(ONE_TO_ONE);
  assertEquals(steps[0].kind, 'warmup');
  assertEquals(steps[0].seconds, 750, 'the row keeps the line\'s seconds');
  assertEquals(steps[0].lap_button, true);
  assertEquals(steps[0].label, '10- to 15-minute easy spin');
  assertEquals(flat[0].intensity, 'WARMUP');
  assertEquals(flat[0].durationType, 'OPEN');
  assertEquals('durationValue' in flat[0], false, 'an open step states no duration');
  assertEquals(flat[0].description, '10- to 15-minute easy spin');
});

Deno.test('the interval steps are unchanged: 20 × TIME 60 with their power targets', () => {
  const { flat } = build(ONE_TO_ONE);
  assertEquals(flat.length, 21);
  for (const st of flat.slice(1)) {
    assertEquals(st.durationType, 'TIME');
    assertEquals(st.durationValue, 60);
    assertEquals(st.targetType, 'POWER');
    assert(st.targetValueLow > 0 && st.targetValueHigh > st.targetValueLow);
  }
});

Deno.test('the Garmin duration estimate keeps the open warm-up\'s seconds (12:30 + 20:00)', () => {
  const { payload } = build(ONE_TO_ONE);
  assertEquals(payload.estimatedDurationInSecs, 1950);
});

Deno.test('the VO2 box: the two easy spins are open, the "5 minutes @ 95%" stays a timed step', () => {
  const { flat } = build({ type: 'ride', name: 'VO2', tags: ['family:ride_vo2'], steps_preset: ['wrap_ride_vo2_warm0', 'wrap_ride_vo2_warm1', 'wrap_ride_vo2_warm2', 'round_5x_240s110to120-r240seasy'] });
  assertEquals(flat[0].durationType, 'OPEN');
  assertEquals(flat[1].durationType, 'TIME'); assertEquals(flat[1].durationValue, 300); assertEquals(flat[1].targetType, 'POWER');
  assertEquals(flat[2].durationType, 'OPEN');
});

Deno.test('the sprint box: the easy spin is open, the cadence-sprint line stays timed', () => {
  const { flat } = build({ type: 'ride', name: 'Sprints', tags: ['family:ride_sprints'], steps_preset: ['wrap_ride_sprints_warm0', 'wrap_ride_sprints_warm1', 'round_6x_15sallout-r360seasy'] });
  assertEquals(flat[0].durationType, 'OPEN');
  assertEquals(flat[1].durationType, 'TIME'); assertEquals(flat[1].durationValue, 600);
});

Deno.test('the wrapper owns it: every ride easy-spin warm-up line carries lapButton; no run or cool-down line does', () => {
  for (const tok of ['wrap_ride_anaerobic_warm0', 'wrap_ride_sweet_spot_warm0', 'wrap_ride_sprints_warm0', 'wrap_ride_vo2_warm0', 'wrap_ride_vo2_warm2']) assertEquals(wrapperStepForToken(tok)?.lapButton, true, tok);
  for (const tok of ['wrap_ride_vo2_warm1', 'wrap_ride_sprints_warm1', 'wrap_run_near_threshold_warm0', 'wrap_run_near_threshold_cool0', 'wrap_run_mlss_warm0', 'wrap_run_sprint_power_warm0']) assertEquals(wrapperStepForToken(tok)?.lapButton, undefined, tok);
});

Deno.test('a run is untouched: the near-threshold warm-up is a TIME step, as before', () => {
  const { steps, flat } = build({ type: 'run', name: 'Near-threshold', tags: ['family:run_near_threshold'], steps_preset: ['wrap_run_near_threshold_warm0', 'interval_6x240s_90pct_R60s', 'wrap_run_near_threshold_cool0'] });
  assertEquals(steps[0].lap_button, undefined);
  assertEquals(flat[0].durationType, 'TIME'); assertEquals(flat[0].durationValue, 600);
  assertEquals(flat[flat.length - 1].durationType, 'TIME'); assertEquals(flat[flat.length - 1].durationValue, 480);
});

Deno.test('a legacy ride warm-up token (no wrapper) is a TIME step, as before', () => {
  const { flat } = build({ type: 'ride', name: 'Anaerobic Ride', tags: [], steps_preset: ['warmup_bike_quality_13min_fastpedal', 'bike_vo2_6x1min_r4min'] });
  assertEquals(flat[0].durationType, 'TIME'); assertEquals(flat[0].durationValue, 780);
});
