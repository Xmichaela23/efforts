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
import {
  acceptMeasuredForSave,
  effortFieldsFromFiveKTimeSec,
  fiveKClockFromCalibration,
  hrZoneConfigForSave,
  performanceNumbersForSave,
  effortFieldsForPerformanceNumbers,
  liftsForSave,
  swimPaceFromTestedCssForSave,
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

Deno.test('ONE ZONE TABLE (2026-09-26): the save keeps what was typed and writes no zone table or one-number scalar', () => {
  const cfg = hrZoneConfigForSave({ typed: { manual_run_lthr: 160, manual_ride_max_hr: 178, resting_heart_rate: 50 }, stored: null, nowIso: NOW })!;
  assertEquals(cfg.manual_run_lthr, 160);
  assertEquals(cfg.manual_ride_max_hr, 178);
  assertEquals(cfg.resting_heart_rate, 50);
  assertEquals(cfg.source, 'manual');
  // Nothing reads these; every zone edge is `heartRateZoneSet`, worked out at read time.
  for (const k of ['zones', 'zones_run', 'zones_ride', 'zones_run_model', 'zones_ride_model', 'threshold_heart_rate', 'max_heart_rate']) {
    assertEquals(k in cfg, false, `${k} is written again`);
  }
});

Deno.test('no invented resting heart rate: a max with none typed stores none', () => {
  const noRest = hrZoneConfigForSave({ typed: { manual_run_max_hr: 185 }, stored: null, nowIso: NOW })!;
  assertEquals(noRest.resting_heart_rate, null);
});

Deno.test('nothing typed and nothing changed → null, so the stored zones (Strava\'s included) are left alone', () => {
  assertEquals(hrZoneConfigForSave({ typed: {}, stored: { source: 'strava', zones: [{ min: 0, max: 120 }] }, nowIso: NOW }), null);
  // An absent key keeps the stored manual value; a present null clears it.
  const kept = hrZoneConfigForSave({ typed: { manual_ride_lthr: 150 }, stored: { manual_run_lthr: 160 }, nowIso: NOW })!;
  assertEquals(kept.manual_run_lthr, 160);
  const cleared = hrZoneConfigForSave({ typed: { manual_run_lthr: null }, stored: { manual_run_lthr: 160 }, nowIso: NOW })!;
  assertEquals(cleared.manual_run_lthr, null);
  assertEquals(cleared.source, 'learned');
});

Deno.test('accept FTP → ride_ftp_accepted is the estimate shown, and a manual FTP flag is dropped', () => {
  const lf = { ride_ftp_estimated: { value: 251.4, confidence: 'high', sample_count: 6 } };
  const r = acceptMeasuredForSave({ kind: 'ftp', value: 251, learnedFitness: lf, performanceNumbers: { ftp: 220, ftp_source: 'manual' }, now: new Date(NOW) });
  if (!r.ok) throw new Error(r.reason);
  const acc = r.learned_fitness.ride_ftp_accepted as Record<string, unknown>;
  assertEquals(acc.value, 251.4);
  assertEquals(acc.accepted_via, 'baselines');
  assertEquals(acc.accepted_at, NOW);
  assertEquals(r.performance_numbers, { ftp: 220 });
});

Deno.test('accept threshold → run_threshold_pace_accepted, and a manual flag becomes learned', () => {
  const lf = { run_threshold_pace_sec_per_km: { value: 262, confidence: 'medium' } };
  const r = acceptMeasuredForSave({ kind: 'run_threshold', value: 262, learnedFitness: lf, performanceNumbers: { threshold_pace_source: 'manual' }, now: new Date(NOW) });
  if (!r.ok) throw new Error(r.reason);
  assertEquals((r.learned_fitness.run_threshold_pace_accepted as Record<string, unknown>).value, 262);
  assertEquals(r.performance_numbers.threshold_pace_source, 'learned');
});

Deno.test('accept refuses a number the athlete did not see, and a low-confidence estimate', () => {
  const lf = { ride_ftp_estimated: { value: 251, confidence: 'high' } };
  assertEquals(acceptMeasuredForSave({ kind: 'ftp', value: 240, learnedFitness: lf, performanceNumbers: {}, now: new Date(NOW) }), { ok: false, reason: 'value_changed' });
  assertEquals(acceptMeasuredForSave({ kind: 'ftp', value: 251, learnedFitness: { ride_ftp_estimated: { value: 251, confidence: 'low' } }, performanceNumbers: {}, now: new Date(NOW) }), { ok: false, reason: 'nothing_to_accept' });
  assertEquals(acceptMeasuredForSave({ kind: 'run_threshold', value: 262, learnedFitness: null, performanceNumbers: {}, now: new Date(NOW) }), { ok: false, reason: 'nothing_to_accept' });
});

// ── 2026-09-16, Stage 7 session 1: the three doors save-baselines took over ─────────────────────────

Deno.test('the checkpoint accept is stamped as the checkpoint; the default stays baselines', () => {
  const lf = { ride_ftp_estimated: { value: 251, confidence: 'high' } };
  const viaCheckpoint = acceptMeasuredForSave({ kind: 'ftp', value: 251, learnedFitness: lf, performanceNumbers: {}, now: new Date(NOW), via: 'checkpoint' });
  const viaDefault = acceptMeasuredForSave({ kind: 'ftp', value: 251, learnedFitness: lf, performanceNumbers: {}, now: new Date(NOW) });
  assertEquals((viaCheckpoint as any).learned_fitness.ride_ftp_accepted.accepted_via, 'checkpoint');
  assertEquals((viaDefault as any).learned_fitness.ride_ftp_accepted.accepted_via, 'baselines');
});

Deno.test('a TESTED CSS sets swimPace100 as the analysis used to (sec/100 m × 0.9144 → m:ss per 100 yd); a fitted one does not', () => {
  const tested = { swim_css_sec_per_100m: { value: 109, source: 'CSS test (400/200 yd time trial)', tested_at: NOW } };
  assertEquals(swimPaceFromTestedCssForSave({ learnedFitness: tested, performanceNumbers: { ftp: 250 } }),
    { ok: true, performance_numbers: { ftp: 250, swimPace100: '1:40' }, accepted_value: '1:40' });
  // 95 × 0.9144 = 86.87 → 1:27
  assertEquals((swimPaceFromTestedCssForSave({ learnedFitness: { swim_css_sec_per_100m: { value: 95, tested_at: NOW } }, performanceNumbers: null }) as any).accepted_value, '1:27');
  assertEquals(swimPaceFromTestedCssForSave({ learnedFitness: { swim_css_sec_per_100m: { value: 100, source: 'learner (best-effort CS fit)' } }, performanceNumbers: {} }),
    { ok: false, reason: 'nothing_to_accept' });
});

Deno.test('a 1RM test result moves the seed and leaves the lock alone; a typed lift still locks', () => {
  const locked = { squat: 200 };
  const test = liftsForSave({ squat: 225, pullupMaxReps: 0 }, { squat: 200, bench: 185 }, locked, false, { lock: false });
  assertEquals(test, { performance_numbers: { squat: 225, bench: 185, pullupMaxReps: 0 }, locked_baselines: { squat: 200 } });
  const typed = liftsForSave({ squat: 225 }, { squat: 200 }, locked, false);
  assertEquals(typed?.locked_baselines, { squat: 225 });
  assertEquals(liftsForSave({ squat: null }, { squat: 200 }, locked, false, { lock: false })?.locked_baselines, { squat: 200 });
});
