/**
 * save-baselines derivations — pinned to what the PHONE wrote before the move (2026-09-10).
 *
 * ⛔ BEHAVIOUR-UNCHANGED PROOF (Constitution Law 6). Every expected value below was produced by the
 * phone code this function replaces (`src/lib/run-pace-calibration.ts` `effortFieldsFromFiveKTimeSec`
 * / `calibrationFromPaces`, `deriveFiveKPaceFromRaceTime`, `TrainingBaselines` zone writer) on
 * 2026-09-10, before it was deleted. The one intended change is pinned too: no invented resting
 * heart rate.
 *
 * Run: deno test --allow-read --no-check supabase/functions/save-baselines/derive.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { frielRunZones } from '../../../src/lib/friel-zones.ts';
import {
  effortFieldsFromFiveKTimeSec,
  fiveKClockFromCalibration,
  hrZoneConfigForSave,
  performanceNumbersForSave,
  effortFieldsForPerformanceNumbers,
} from './derive.ts';

const NOW = '2026-09-10T00:00:00.000Z';

Deno.test('5K time → the same score and paces the phone stored', () => {
  const cases: Array<[number, number, Record<string, number>]> = [
    [1500, 36.8, { base: 630, race: 548, steady: 528, power: 483, speed: 454 }],
    [1350, 40.3, { base: 581, race: 496, steady: 488, power: 446, speed: 419 }],
    [1260, 42.8, { base: 550, race: 464, steady: 462, power: 423, speed: 397 }],
    [1110, 47.6, { base: 498, race: 410, steady: 418, power: 382, speed: 360 }],
    [960, 53.6, { base: 442, race: 357, steady: 372, power: 341, speed: 320 }],
    [1900, 30, { base: 744, race: 682, steady: 622, power: 568, speed: 534 }],
    [800, 62.5, { base: 378, race: 300, steady: 318, power: 291, speed: 274 }],
  ];
  for (const [t, score, paces] of cases) {
    const e = effortFieldsFromFiveKTimeSec(t, NOW);
    assertEquals(e.effort_score, score, `score @ ${t}s`);
    assertEquals(e.effort_paces, paces, `paces @ ${t}s`);
    assertEquals(e.effort_source_distance, 5000);
    assertEquals(e.effort_source_time, t);
    assertEquals(e.effort_score_status, 'estimated');
    assertEquals(e.effort_paces_source, 'calculated');
  }
});

Deno.test('quick calibration pace → the same 5K clock and score the phone stored', () => {
  const imp = fiveKClockFromCalibration({ fiveKPace: '8:00', easyPace: '10:30', metric: false })!;
  assertEquals(imp.fiveKTimeSec, 1491);
  assertEquals(effortFieldsFromFiveKTimeSec(imp.fiveKTimeSec, NOW).effort_score, 36.9);
  assertEquals(effortFieldsFromFiveKTimeSec(imp.fiveKTimeSec, NOW).effort_paces, { base: 629, race: 547, steady: 527, power: 482, speed: 453 });
  const met = fiveKClockFromCalibration({ fiveKPace: '5:00', easyPace: '6:30', metric: true })!;
  assertEquals(met.fiveKTimeSec, 1501);
  assertEquals(effortFieldsFromFiveKTimeSec(met.fiveKTimeSec, NOW).effort_score, 36.7);
  // A swapped pair is refused, not stored.
  assertEquals(fiveKClockFromCalibration({ fiveKPace: '10:30', easyPace: '8:00', metric: false }), null);
});

Deno.test('the typed 5K clock → fiveK_pace in the athlete\'s unit; a sent fiveK_pace is ignored', () => {
  assertEquals(performanceNumbersForSave({ fiveK: '22:30', fiveK_pace: '1:00/mi' }, null, false).fiveK_pace, '7:15/mi');
  assertEquals(performanceNumbersForSave({ fiveK: '22:30' }, null, true).fiveK_pace, '4:30/km');
  // No usable 5K → the stored pace stays, a sent one does not.
  assertEquals(performanceNumbersForSave({ fiveK_pace: '1:00/mi' }, { fiveK_pace: '7:00/mi' }, false).fiveK_pace, '7:00/mi');
  // Effort columns exist only when the row carries a 5K.
  assertEquals(effortFieldsForPerformanceNumbers({ ftp: 250 }, NOW), null);
  assertEquals(effortFieldsForPerformanceNumbers({ fiveK: '22:30' }, NOW)?.effort_source_time, 1350);
});

Deno.test('typed run threshold → run zones are frielRunZones, the table the analysis bins on', () => {
  const cfg = hrZoneConfigForSave({ typed: { manual_run_lthr: 160 }, stored: null, learnedFitness: null, performanceNumbers: {}, nowIso: NOW })!;
  const expected = frielRunZones(160).map((z) => ({ min: z.min, max: z.max }));
  assertEquals(cfg.zones_run, expected);
  assertEquals(cfg.zones, expected);
  assertEquals(cfg.zones_ride, undefined);
  assertEquals(cfg.threshold_heart_rate, 160);
  assertEquals(cfg.source, 'manual');
  assertEquals(cfg.zones_run_model, 'friel');
});

Deno.test('both sports anchored → the shared scalar is null, never one sport speaking for both', () => {
  const cfg = hrZoneConfigForSave({ typed: { manual_run_lthr: 160, manual_ride_lthr: 150 }, stored: null, learnedFitness: null, performanceNumbers: {}, nowIso: NOW })!;
  assertEquals(cfg.threshold_heart_rate, null);
  assertEquals(cfg.zones_ride, frielRunZones(150).map((z) => ({ min: z.min, max: z.max })));
});

Deno.test('max heart rate with a real resting rate → Karvonen; without one → no zones (no invented 60)', () => {
  const withRest = hrZoneConfigForSave({ typed: { manual_run_max_hr: 185, resting_heart_rate: 50 }, stored: null, learnedFitness: null, performanceNumbers: {}, nowIso: NOW })!;
  // The phone's Karvonen: resting + (max − resting) × pct.
  assertEquals(withRest.zones_run, [
    { min: 0, max: 131 }, { min: 131, max: 145 }, { min: 145, max: 158 }, { min: 158, max: 172 }, { min: 172, max: 185 },
  ]);
  assertEquals(withRest.zones_run_model, 'karvonen');
  const noRest = hrZoneConfigForSave({ typed: { manual_run_max_hr: 185 }, stored: null, learnedFitness: null, performanceNumbers: {}, nowIso: NOW })!;
  assertEquals(noRest.zones_run, undefined);
  assertEquals(noRest.resting_heart_rate, null);
  assertEquals(noRest.zones_run_model, 'needs_resting');
});

Deno.test('nothing typed and nothing changed → null, so the stored zones (Strava\'s included) are left alone', () => {
  assertEquals(hrZoneConfigForSave({ typed: {}, stored: { source: 'strava', zones: [{ min: 0, max: 120 }] }, learnedFitness: null, performanceNumbers: {}, nowIso: NOW }), null);
  // An absent key keeps the stored manual value; a present null clears it.
  const kept = hrZoneConfigForSave({ typed: { manual_ride_lthr: 150 }, stored: { manual_run_lthr: 160 }, learnedFitness: null, performanceNumbers: {}, nowIso: NOW })!;
  assertEquals(kept.manual_run_lthr, 160);
  const cleared = hrZoneConfigForSave({ typed: { manual_run_lthr: null }, stored: { manual_run_lthr: 160 }, learnedFitness: null, performanceNumbers: {}, nowIso: NOW })!;
  assertEquals(cleared.manual_run_lthr, null);
  assertEquals(cleared.source, 'learned');
});
