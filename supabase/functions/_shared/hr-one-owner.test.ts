/**
 * ONE OWNER PER HEART-RATE FACT (2026-09-26, Michael: "go") — every rewire of the heart-rate map, pinned.
 *
 *   · the threshold: `resolveCurrentLthr`, handed the WHOLE `user_baselines` row everywhere, so a typed threshold is
 *     seen by load, the easy band, the grader, the coach, the fact packet and the adaptation gate alike;
 *   · the load's threshold: `sessionLoadThresholdHr` — the owner, this session's sport, the watch file's number LAST;
 *   · the zones: `heartRateZoneSet` — the table Baselines prints — for the fact packet, the race band, the export and
 *     the run plan's text; the session's own last resort is one copy (`sessionHrZoneSet`);
 *   · easy: `resolveRunEasyHrBand` — one easy top for the run verdict, the adaptation gate, the fact packet;
 *   · max: `resolveCurrentMaxHr` inside both easy bands, so a typed max is seen;
 *   · drift: `hr_drift_v1` for the facts and the coach (`sessionHrDriftV1`, `hrDriftV1Bpm`);
 *   · Friel's percentages: one copy, `frielZoneOpensPct`, which the heart-rate TSS estimate reads.
 *
 * Run: ~/.deno/bin/deno test -A --no-check supabase/functions/_shared/hr-one-owner.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { easyCeilingBpm } from '../../../src/lib/friel-zones.ts';
import { frielZoneOpensPct, heartRateZoneSet, sessionHrZoneSet } from './endurance/display-zones.ts';
import { resolveRunEasyHrBand } from './easy-hr.ts';
import { resolveRideEasyCeiling } from './ride-easy-hr.ts';
import { inferIntensityFromPerformance, sessionLoadThresholdHr } from './workload.ts';
import { hrDriftHalvesPct, hrDriftV1Bpm, sessionHrDriftV1, warmupSkipSeconds } from './hr-drift-halves.ts';
import { isComparableZ2Run } from '../compute-adaptation-metrics/z2-gate.ts';
import { courseHrZones } from './course-strategy-build.ts';
import { calculateZoneDistribution } from '../analyze-running-workout/lib/heart-rate/zones.ts';
import { assessStimulus } from './fact-packet/stimulus.ts';
import { generateFlagsV1 } from './fact-packet/flags.ts';

const TODAY = '2026-09-26';
const REPO = new URL('../../../', import.meta.url);
const src = (p: string) => Deno.readTextFileSync(new URL(p, REPO));
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const learnedThr = (value: number) => ({ value, confidence: 'high', sample_count: 8 });
const learnedMax = (value: number) => ({ value, confidence: 'high', sample_count: 25 });

// ── the threshold: one owner, the whole row ─────────────────────────────────────────────────────────────

Deno.test('ONE OWNER: a chosen typed threshold is the answer for load, the easy band, the zone table and the race band', () => {
  const row = {
    learned_fitness: { run_threshold_hr: learnedThr(162), run_max_hr_observed: learnedMax(197) },
    performance_numbers: { lthr_source: 'manual' },
    configured_hr_zones: { manual_run_lthr: 170 },
  };
  assertEquals(sessionLoadThresholdHr(row, 'run'), 170);
  const band = resolveRunEasyHrBand(row);
  assertEquals(band.anchor, 'lthr');
  assertEquals(band.ceiling, easyCeilingBpm(170));
  const set = heartRateZoneSet(row, 'run', { today: TODAY })!;
  assertEquals(set.anchor_bpm, 170);
  assertEquals(courseHrZones(row, TODAY).zones, set.rows.map((r) => ({ min: r.min, max: r.max })));
});

Deno.test('TYPED THRESHOLD VISIBLE: a typed run or ride threshold with nothing learned reaches every reader', () => {
  const row = { configured_hr_zones: { manual_run_lthr: 165, manual_ride_lthr: 150 } };
  assertEquals(sessionLoadThresholdHr(row, 'run'), 165);
  assertEquals(sessionLoadThresholdHr(row, 'ride'), 150);
  assertEquals(resolveRunEasyHrBand(row).ceiling, easyCeilingBpm(165));
  const gate = isComparableZ2Run({ duration: 45, moving_time: 45, avg_heart_rate: 140, avg_pace: 400 }, row);
  assertEquals(gate.z2?.upper, easyCeilingBpm(165), 'the adaptation gate does not see the typed threshold');
});

Deno.test('WATCH THRESHOLD LAST: the watch file\'s number answers only when the owner has nothing', () => {
  const learned = { learned_fitness: { run_threshold_hr: learnedThr(162) } };
  assertEquals(sessionLoadThresholdHr(learned, 'run', 175), 162, 'the watch file\'s number outranked the learned threshold');
  assertEquals(sessionLoadThresholdHr({ configured_hr_zones: { manual_run_lthr: 170 } }, 'run', 175), 170, 'the watch file\'s number outranked a typed one');
  assertEquals(sessionLoadThresholdHr({}, 'run', 175), 175);
  assertEquals(sessionLoadThresholdHr(null, 'run', 175), 175, 'no baselines row at all must still read the watch file');
  // A ride reads the bike's threshold, never the run's.
  assertEquals(sessionLoadThresholdHr({ learned_fitness: { run_threshold_hr: learnedThr(162), ride_threshold_hr: learnedThr(153) } }, 'ride', 175), 153);
});

Deno.test('WATCH THRESHOLD LAST: both load paths make the one call, with the watch file\'s number as its last argument', () => {
  const cw = code('supabase/functions/calculate-workload/index.ts');
  assert(/sessionLoadThresholdHr\(baselineRow, finalWorkoutData\.type, finalWorkoutData\.threshold_heart_rate\)/.test(cw), 'calculate-workload left the owner');
  assert(!/if \(!finalWorkoutData\.threshold_heart_rate\)/.test(cw), 'calculate-workload takes the watch file\'s number first again');
  assert(/select\('performance_numbers, learned_fitness, configured_hr_zones, weight, units'\)/.test(cw), 'calculate-workload no longer fetches the typed threshold');
  const cf = code('supabase/functions/compute-facts/index.ts');
  assert(/sessionLoadThresholdHr\(baselines as any, type, w\.threshold_heart_rate \?\? null\)/.test(cf), 'the fallback load left the owner');
  assert(!/running\?\.threshold_hr|cycling\?\.threshold_hr/.test(cf), 'the fallback load reads a path that has never existed');
});

Deno.test('ONE OWNER: no reader hands the threshold owner a partial row', () => {
  const coach = code('supabase/functions/coach/index.ts');
  assert(!/resolveCurrentLthr\(\{ learned_fitness: learnedFitness \}/.test(coach), 'the coach anchor read is learned-only again');
  assert((coach.match(/configured_hr_zones: configuredHrZones/g) ?? []).length >= 3, 'a coach threshold read lost the typed tier');
  const cf = code('supabase/functions/compute-facts/index.ts');
  assert(/resolveCurrentLthr\(\(baselines \?\? null\) as any, \{ sport: 'run' \}\)/.test(cf), 'the run grader lost the whole row');
  assert(/configured_hr_zones, birthday, weight, units/.test(cf), 'compute-facts no longer fetches the typed threshold');
  for (const f of ['supabase/functions/analyze-running-workout/index.ts', 'supabase/functions/compute-facts/index.ts', 'supabase/functions/save-baselines/zones.ts']) {
    assert(!/resolveRunEasyHrBand\(\s*(learnedFitness|baselines\?\.learned_fitness|learned),/.test(code(f)), `${f} hands the easy band a partial row`);
  }
  assert(!/buildZonesFromLearnedFitness/.test(code('supabase/functions/_shared/fact-packet/build.ts')), 'the fact packet built its own zones again');
});

// ── easy: one rule, one top ─────────────────────────────────────────────────────────────────────────────

Deno.test('ONE EASY TOP: on a max heart rate the easy top is the band\'s 80%, not the zone table\'s Zone 2 top', () => {
  const row = { learned_fitness: { run_max_hr_observed: learnedMax(190) } };
  const band = resolveRunEasyHrBand(row);
  assertEquals(band.ceiling, 152);
  assertEquals(heartRateZoneSet(row, 'run', { today: TODAY })!.rows[1].max, 132); // the second top the verdict used to read
  const gate = isComparableZ2Run({ duration: 45, moving_time: 45, avg_heart_rate: 150, avg_pace: 400 }, row);
  assertEquals(gate.z2?.upper, 152);
  assertEquals(gate.z2?.lower, band.floor);
  const run = code('supabase/functions/analyze-running-workout/index.ts');
  assert(/const aerobicCeilingBpm = resolveRunEasyHrBand\(userBaselinesRow\)\.ceiling;/.test(run), 'the verdict reads a second easy top again');
});

Deno.test('ONE EASY TOP: the fact packet\'s easy stimulus and "HR above aerobic" read the easy band', () => {
  const zones = heartRateZoneSet({ learned_fitness: { run_max_hr_observed: learnedMax(190) } }, 'run', { today: TODAY })!
    .rows.map((r) => ({ label: r.name.replace(/^Zone\s*/i, 'Z'), minBpm: r.min, maxBpm: r.max ?? 999 }));
  const seg = { name: 'Run', distance_mi: 5, pace_sec_per_mi: 560, target_pace_sec_per_mi: 600, pace_deviation_sec: -40, avg_hr: 145, max_hr: 150, hr_zone: 'Z3', duration_s: 2400 };
  // 145 bpm sits in Zone 3 of the %-of-max table and under the easy band's 152.
  const st = assessStimulus('easy', [seg], zones, { easy_ceiling_bpm: 152 })!;
  assertEquals(st.achieved, true, `an easy run under the easy top was judged off it: ${JSON.stringify(st)}`);
  const packet = {
    facts: { segments: [seg], terrain_type: 'flat', workout_type: 'easy', plan: null, weather: null, total_duration_min: 40 },
    derived: { primary_limiter: { limiter: null } },
  } as never;
  const under = generateFlagsV1(packet, { easyCeilingBpm: 152 }).map((f) => f.message).join(' | ');
  assert(/HR stayed aerobic/.test(under), `under the easy top must read aerobic: ${under}`);
  const over = generateFlagsV1(packet, { easyCeilingBpm: 140 }).map((f) => f.message).join(' | ');
  assert(/Too fast for recovery/.test(over), `over the easy top must read too hard: ${over}`);
});

Deno.test('NO EASY BAND → NOT JUDGED: the adaptation gate refuses rather than inventing an age-formula band', () => {
  const gate = isComparableZ2Run({ duration: 45, moving_time: 45, avg_heart_rate: 140, avg_pace: 400 }, { learned_fitness: {} });
  assertEquals(gate.ok, false);
  assertEquals(gate.reason, 'no_easy_band');
});

// ── max: through its owner, so a typed max is seen ────────────────────────────────────────────────────

Deno.test('TYPED MAX SEEN: both easy bands read the max through its owner', () => {
  const run = resolveRunEasyHrBand({ learned_fitness: { run_max_hr_observed: learnedMax(197) }, configured_hr_zones: { manual_run_max_hr: 185 } });
  assertEquals(run.anchor, 'max_hr');
  assertEquals(run.ceiling, Math.round(185 * 0.80));
  const ride = resolveRideEasyCeiling({ ride_max_hr_observed: learnedMax(175) }, { learned_fitness: { ride_max_hr_observed: learnedMax(175) }, configured_hr_zones: { manual_ride_max_hr: 170 } });
  assertEquals(ride, { ceiling: Math.round(170 * 0.75), anchor: 'max_hr', confidence: null });
  // A peak stated as measured from zero samples is not a measurement.
  const zero = resolveRunEasyHrBand({ learned_fitness: { run_max_hr_observed: { value: 200, confidence: 'high', sample_count: 0 } } });
  assertEquals(zero.anchor, 'none');
});

// ── zones: one table, one session fallback ────────────────────────────────────────────────────────────

Deno.test('ONE SESSION FALLBACK: the run debrief counts on the analysis\'s own last resort', () => {
  const samples = Array.from({ length: 600 }, (_, i) => ({ heart_rate: 120 + (i % 52), timestamp: i }));
  const tops = sessionHrZoneSet('run', { peakBpm: 171 }).tops; // 171 ÷ 0.95 = 180
  const d = calculateZoneDistribution(samples as never, undefined, 'easy', null);
  assertEquals(d.distribution[0].rangeDescription, `< ${tops[0]} bpm`);
  assertEquals(d.distribution[3].rangeDescription, `${tops[2]}-${tops[3]} bpm`);
  // The watch file's own max is the first rung, as in the analysis.
  const withDevice = calculateZoneDistribution(samples as never, undefined, 'easy', 190);
  assertEquals(withDevice.distribution[0].rangeDescription, `< ${sessionHrZoneSet('run', { deviceMaxHr: 190, peakBpm: 171 }).tops[0]} bpm`);
  assert(/sessionHrZoneSet\(zoneSport, \{ deviceMaxHr: fitMax, peakBpm: peak \}\)/.test(code('supabase/functions/compute-workout-analysis/index.ts')), 'the analysis keeps a fallback of its own');
});

Deno.test('ONE TABLE: the race band, its stale-strategy hash and the export read the zones Baselines prints', () => {
  const row = { learned_fitness: { run_threshold_hr: learnedThr(162) } };
  const { zones, forHash } = courseHrZones(row, TODAY);
  const rows = heartRateZoneSet(row, 'run', { today: TODAY })!.rows;
  assertEquals(zones.length, rows.length);
  assertEquals(forHash.z2, `${rows[1].min}-${rows[1].max}`);
  for (const f of ['supabase/functions/course-strategy/index.ts', 'supabase/functions/course-detail/index.ts']) {
    const c = code(f);
    assert(/courseHrZones\(baseline, /.test(c), `${f} builds its own zone list`);
    assert(!/cz\?\.zones|configured_hr_zones\?*\.zones/.test(c), `${f} reads a stored zone table again`);
  }
  const ex = code('supabase/functions/export-data/index.ts');
  assert(!/zones: ub\?\.configured_hr_zones/.test(ex) && /readout\.run\.zones\.rows/.test(ex), 'the export dumps the stored object again');
});

// ── drift: one measure ───────────────────────────────────────────────────────────────────────────────

const steadySamples = (n: number, from: number, to: number) =>
  Array.from({ length: n }, (_, i) => ({ timestamp: i * 5, heartRate: Math.round(from + ((to - from) * i) / (n - 1)) }));

Deno.test('ONE DRIFT: the facts read the stored hr_drift_v1 whenever the analysis carries it', () => {
  const stored = { pct: 4.1, first_avg_hr: 146, second_avg_hr: 152, seconds: 2400, basis: 'hr', method: 'halves_by_time' };
  const w = { workout_analysis: { hr_drift_v1: stored }, sensor_data: { samples: steadySamples(600, 120, 170) }, moving_time: 50 };
  assertEquals(sessionHrDriftV1(w), stored);
  // The key present and null is the analyser's answer too — not recomputed from other samples.
  assertEquals(sessionHrDriftV1({ ...w, workout_analysis: { hr_drift_v1: null } }), null);
});

Deno.test('ONE DRIFT: before the analyser has run, the facts work it out the analysers\' way', () => {
  const samples = steadySamples(600, 130, 150);
  const computed = { intervals: [{ role: 'warmup', executed: { duration_s: 600 } }] };
  const expected = hrDriftHalvesPct(samples, 50 * 60, { skipStartS: warmupSkipSeconds(computed) });
  assert(expected != null);
  assertEquals(sessionHrDriftV1({ workout_analysis: {}, sensor_data: { samples }, computed, moving_time: 50 }), expected);
});

Deno.test('ONE DRIFT: the coach\'s beats are hr_drift_v1\'s halves, never the early/late window', () => {
  assertEquals(hrDriftV1Bpm({ hr_drift_v1: { pct: 4.1, first_avg_hr: 146, second_avg_hr: 152 }, granular_analysis: { heart_rate_analysis: { hr_drift_bpm: 11 } } }), 6);
  assertEquals(hrDriftV1Bpm({ granular_analysis: { heart_rate_analysis: { hr_drift_bpm: 11 } } }), null);
  const coach = code('supabase/functions/coach/index.ts');
  assert(/return hrDriftV1Bpm\(wAny\?\.workout_analysis\);/.test(coach), 'the coach\'s drift helper left hr_drift_v1');
  assert(!/heart_rate_analysis\?\.hr_drift_bpm/.test(coach), 'the coach reads the early/late window again');
  assert(/safeNum\(wa\?\.hr_drift_v1\?\.pct\)/.test(coach), 'the coach\'s ride drift left hr_drift_v1');
  const cf = code('supabase/functions/compute-facts/index.ts');
  assert((cf.match(/sessionHrDriftV1\(w\)/g) ?? []).length === 2, 'a facts drift left hr_drift_v1');
  assert(!/hrSamples\.length \/ 2|hrSamples\.slice\(0, mid\)/.test(cf), 'the facts halve samples by count again');
  assert(!/decoupling_pct: toNum\(runFacts\?\.hr_drift_pct\)|consistency_score: consistency|hr_drift_pct: toNum\(runFacts/.test(cf), 'an unread drift copy is written again');
});

// ── Friel's percentages: one copy ────────────────────────────────────────────────────────────────────

/** The ladder `workload.ts` typed out before 2026-09-26, kept here as the reference the merge must reproduce. */
function oldLadder(type: 'run' | 'ride', pct: number): number {
  const z1Hi = type === 'run' ? 85 : 81;
  let t: number;
  if (pct < z1Hi) t = pct < (z1Hi - 5) ? 10 : 20;
  else if (pct < 90) t = pct < (z1Hi + 90) / 2 ? 40 : 50;
  else if (pct < (type === 'run' ? 95 : 94)) t = 60;
  else if (pct < 103) t = 70;
  else if (pct <= 106) t = pct < 104.5 ? 80 : 90;
  else t = 100;
  return Math.round(Math.sqrt(t / 100) * 1000) / 1000;
}

Deno.test('MERGE: the heart-rate TSS estimate reads Friel\'s percentages from the zone table, and no number moved', () => {
  assertEquals(frielZoneOpensPct('run'), { z2: 85, z3: 90, z4: 95, z5a: 100, z5b: 103, z5c: 107 });
  assertEquals(frielZoneOpensPct('ride'), { z2: 81, z3: 90, z4: 94, z5a: 100, z5b: 103, z5c: 107 });
  for (const type of ['run', 'ride'] as const) {
    for (let tenths = 600; tenths <= 1150; tenths += 1) {
      const pct = tenths / 10;
      const got = inferIntensityFromPerformance({ type, avgHr: pct * 1.6, thresholdHr: 160 });
      assertEquals(got, oldLadder(type, (pct * 1.6 / 160) * 100), `${type} at ${pct}% of LTHR`);
    }
  }
  const wl = code('supabase/functions/_shared/workload.ts');
  assert(/frielZoneOpensPct\(isRide \? 'ride' : 'run'\)/.test(wl), 'the TSS estimate types Friel\'s percentages out again');
  assert(!/type === 'run' \? 85 : 81|type === 'run' \? 95 : 94/.test(wl), 'a second copy of Friel\'s percentages is back');
});
