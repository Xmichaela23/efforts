// generate-combined-plan/session-factory.ts
//
// Generates concrete session objects using the existing token vocabulary
// understood by materialize-plan. Every session has TSS, intensity class,
// zone targets, and steps_preset tokens.

import type { PlannedSession, Phase, Intensity } from './types.ts';
import type { Sport } from './types.ts';
import { estimateSessionTSS, weightedTSS } from './science.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function session(
  day: string,
  type: Sport,
  name: string,
  description: string,
  durationMin: number,
  intensity: Intensity,
  steps: string[],
  tags: string[],
  zoneTargets: string,
  servedGoal: string,
  timing?: 'AM' | 'PM',
): PlannedSession {
  const tss = estimateSessionTSS(type, intensity, durationMin);
  return {
    day,
    type,
    name,
    description,
    duration: durationMin,
    tss,
    weighted_tss: weightedTSS(type, tss),
    intensity_class: intensity,
    steps_preset: steps,
    tags,
    serves_goal: servedGoal,
    zone_targets: zoneTargets,
    ...(timing ? { timing } : {}),
  };
}

// ── Run sessions ──────────────────────────────────────────────────────────────

export function longRun(day: string, miles: number, phase: Phase, goalId: string): PlannedSession {
  const isRaceSpecific = phase === 'race_specific';
  const dur = Math.round(miles * 9.5); // ~9:30/mi easy pace average
  return session(
    day, 'run',
    `Long Run — ${miles} mi`,
    isRaceSpecific
      ? `Race-prep long run. Miles 1–${Math.round(miles * 0.5)} easy Z2, final ${Math.round(miles * 0.5)} at marathon goal pace.`
      : `Aerobic long run at conversational pace. Full Z2 effort — if you can\'t speak in sentences, slow down.`,
    dur,
    isRaceSpecific ? 'MODERATE' : 'EASY',
    [isRaceSpecific ? `longrun_${miles}mi_mp_finish` : `longrun_${miles}mi_easypace`],
    ['long_run', 'aerobic', isRaceSpecific ? 'race_specific' : 'base'],
    isRaceSpecific ? 'Z2, last 30–40% at marathon pace' : 'Z2 throughout',
    goalId,
  );
}

export function easyRun(day: string, miles: number, goalId: string): PlannedSession {
  const dur = Math.round(miles * 10);
  return session(
    day, 'run',
    `Easy Run — ${miles} mi`,
    'Recovery run. Fully conversational Z1–Z2 pace. These miles build your aerobic base without adding meaningful fatigue.',
    dur, 'EASY',
    [`run_easy_${miles}mi`],
    ['easy', 'aerobic'],
    'Z1–Z2', goalId,
  );
}

export function tempoRun(day: string, miles: number, warmupMiles: number, goalId: string): PlannedSession {
  const totalMiles = warmupMiles * 2 + miles;
  const dur = Math.round(totalMiles * 8.5);
  return session(
    day, 'run',
    `Tempo Run — ${miles} mi at threshold`,
    `Warm up ${warmupMiles} mi easy, then ${miles} mi at lactate threshold (comfortably hard — 7–8 RPE, can say a few words). Cool down ${warmupMiles} mi easy.`,
    dur, 'HARD',
    [`warmup_run_${Math.round(warmupMiles * 10)}_easy`, `tempo_${miles}mi_threshold`, `cooldown_run_${Math.round(warmupMiles * 10)}_easy`],
    ['quality', 'threshold', 'run'],
    'Z4 threshold', goalId,
  );
}

export function intervalRun(day: string, reps: number, phase: Phase, goalId: string): PlannedSession {
  const dist = phase === 'base' ? '1200m' : phase === 'build' ? '1000m' : '800m';
  const pace = phase === 'base' ? '10km pace' : '5km pace';
  const dur = 65;
  return session(
    day, 'run',
    `Run Intervals — ${reps}×${dist}`,
    `Warm up 10 min easy. ${reps}×${dist} at ${pace} with 90 sec jog recovery between. Cool down 10 min. Focus on consistent splits, not all-out.`,
    dur, 'HARD',
    ['warmup_run_10min_easy', `interval_${reps}x${dist}_${phase === 'base' ? '10kpace' : '5kpace'}`, 'cooldown_run_10min_easy'],
    ['quality', 'intervals', 'run'],
    'Z4–Z5 intervals', goalId,
  );
}

export function marathonPaceRun(day: string, mpMiles: number, goalId: string): PlannedSession {
  const dur = Math.round((mpMiles + 3) * 9.0);
  return session(
    day, 'run',
    `Marathon Pace Run — ${mpMiles} mi`,
    `1.5 mi warm-up, ${mpMiles} mi at marathon goal pace (Z3–Z4, controlled), 1.5 mi cool-down. This teaches your body to run marathon pace on accumulating fatigue.`,
    dur, 'HARD',
    ['warmup_run_15min_easy', `run_marathon_pace_${mpMiles}mi`, 'cooldown_run_10min_easy'],
    ['race_specific', 'marathon_pace', 'run'],
    'Z3–Z4 marathon pace', goalId,
  );
}

// ── Bike sessions ──────────────────────────────────────────────────────────────

export function longRide(day: string, hours: number, goalId: string): PlannedSession {
  const min = Math.round(hours * 60);
  return session(
    day, 'bike',
    `Long Ride — ${hours.toFixed(1)} hr`,
    `Aerobic endurance ride at Z2. Maintain 60–70 rpm cadence. Nutrition practice: eat every 40–45 minutes. No surges.`,
    min, 'EASY',
    [`bike_endurance_${min}min_Z2`],
    ['long_ride', 'aerobic', 'endurance'],
    'Z2', goalId,
  );
}

export function thresholdBike(day: string, intervals: number, minEach: number, goalId: string): PlannedSession {
  const dur = 20 + intervals * minEach + (intervals - 1) * 5 + 10; // wu + work + rest + cd
  return session(
    day, 'bike',
    `Bike Threshold — ${intervals}×${minEach} min`,
    `Warm up 15 min with fast-pedal spins. ${intervals}×${minEach} min at FTP (Zone 4 — hard but sustainable). ${5} min easy between. Cool down 10 min.`,
    dur, 'HARD',
    ['warmup_bike_quality_15min_fastpedal', `bike_thr_${intervals}x${minEach}min_r5min`, 'cooldown_bike_10min_easy'],
    ['quality', 'threshold', 'bike'],
    'Z4 FTP', goalId,
  );
}

export function vo2Bike(day: string, reps: number, goalId: string): PlannedSession {
  const dur = 15 + reps * 5 + reps * 3 + 10;
  return session(
    day, 'bike',
    `Bike VO2max — ${reps}×5 min`,
    `Warm up 15 min. ${reps}×5 min at 110–120% FTP (Zone 5) with 3 min easy recovery. Cool down 10 min. Short, maximal efforts — go hard.`,
    dur, 'HARD',
    ['warmup_bike_quality_15min_fastpedal', `bike_vo2_${reps}x5min_r3min`, 'cooldown_bike_10min_easy'],
    ['quality', 'vo2max', 'bike'],
    'Z5 VO2max', goalId,
  );
}

export function sweetSpotBike(day: string, intervals: number, minEach: number, goalId: string): PlannedSession {
  const dur = 20 + intervals * minEach + (intervals - 1) * 5 + 10;
  return session(
    day, 'bike',
    `Bike Sweet Spot — ${intervals}×${minEach} min`,
    `Sweet spot training at 88–94% FTP (Zone 3–4). Warm up 15 min, ${intervals}×${minEach} min at sweet spot with 5 min recovery. Cool down 10 min.`,
    dur, 'MODERATE',
    ['warmup_bike_quality_15min_fastpedal', `bike_ss_${intervals}x${minEach}min_r5min`, 'cooldown_bike_10min_easy'],
    ['quality', 'sweet_spot', 'bike'],
    'Z3–Z4 sweet spot', goalId,
  );
}

export function easyBike(day: string, hours: number, goalId: string): PlannedSession {
  const min = Math.round(hours * 60);
  return session(
    day, 'bike',
    `Easy Ride — ${hours.toFixed(1)} hr`,
    'Recovery spin at Z1–Z2. No pushing. Legs should feel loose and refreshed by the end.',
    min, 'EASY',
    [`bike_endurance_${min}min_Z2`],
    ['easy', 'recovery', 'bike'],
    'Z1–Z2', goalId,
  );
}

export function bikeOpeners(day: string, goalId: string): PlannedSession {
  return session(
    day, 'bike',
    'Bike Openers — 30 min',
    'Short pre-race sharpener. 20 min easy Z2, then 3×30-second fast-pedal bursts. Legs should feel snappy afterwards.',
    30, 'EASY',
    ['bike_endurance_20min_Z2', 'bike_openers'],
    ['taper', 'openers', 'bike'],
    'Z2 with brief Z5 bursts', goalId,
  );
}

// ── Swim sessions ─────────────────────────────────────────────────────────────

export function thresholdSwim(day: string, totalYards: number, goalId: string): PlannedSession {
  const wu = 300;
  const cd = 200;
  const main = totalYards - wu - cd;
  const threshReps = Math.max(4, Math.round((main * 0.55) / 100));
  const aeroReps   = Math.max(3, Math.round((main * 0.45) / 150));
  const dur = Math.round(totalYards / 40); // ~40 yd/min including rest
  return session(
    day, 'swim',
    `Swim Threshold — ${totalYards} yd`,
    `Warm up ${wu} yd easy. ${threshReps}×100 yd at threshold (Zone 4 — maximal sustainable effort) with 15 sec rest. ${aeroReps}×150 yd aerobic. Cool down ${cd} yd.`,
    dur, 'HARD',
    [`swim_warmup_${wu}yd_easy`, `swim_threshold_${threshReps}x100yd_r15`, `swim_aerobic_${aeroReps}x150yd_easy_r20`, `swim_cooldown_${cd}yd`],
    ['quality', 'threshold', 'swim'],
    'Z4 threshold swim', goalId,
  );
}

export function easySwim(day: string, totalYards: number, goalId: string): PlannedSession {
  const wu = 300;
  const cd = 200;
  const mainYards = totalYards - wu - cd;
  const reps = Math.max(4, Math.round(mainYards / 150));
  const dur = Math.round(totalYards / 35); // ~35 yd/min for easy
  return session(
    day, 'swim',
    `Easy Swim — ${totalYards} yd`,
    `Warm up ${wu} yd easy. ${reps}×150 yd at easy aerobic pace. Focus on technique: high elbow catch, bilateral breathing. Cool down ${cd} yd.`,
    dur, 'EASY',
    [`swim_warmup_${wu}yd_easy`, `swim_aerobic_${reps}x150yd_easy_r20`, `swim_cooldown_${cd}yd`],
    ['easy', 'aerobic', 'swim'],
    'Z2', goalId,
  );
}

// ── Brick sessions ─────────────────────────────────────────────────────────────
// Returns [bikeSession, runSession] as two sessions on the same day.

export function brick(
  day: string,
  bikeHours: number,
  runMinutes: number,
  phase: Phase,
  goalId: string,
): [PlannedSession, PlannedSession] {
  const bikeMin = Math.round(bikeHours * 60);
  const isRS = phase === 'race_specific';
  const bikeIntensity: Intensity = isRS ? 'MODERATE' : 'EASY';
  const runIntensity: Intensity  = isRS ? 'MODERATE' : 'EASY';
  const runMiles = Math.max(2, Math.round(runMinutes / 10));

  const bikeSession = session(
    day, 'bike',
    `Brick — Bike ${bikeHours.toFixed(1)} hr`,
    isRS
      ? `Race-simulation bike at Zone 3 (70.3 race pace). Stay aero. Transition quickly into the run.`
      : `Brick bike at Zone 2. Build leg feel for the transition. Maintain steady power throughout.`,
    bikeMin,
    bikeIntensity,
    [`bike_endurance_${bikeMin}min_${isRS ? 'Z3' : 'Z2'}`],
    ['brick', 'bike', isRS ? 'race_specific' : 'build'],
    isRS ? 'Z3' : 'Z2',
    goalId,
    'AM',
  );

  const runSession = session(
    day, 'run',
    `Brick — Run ${runMiles} mi off the bike`,
    `Immediately after the bike. The first 5 min will feel strange — focus on turnover, not pace. ${isRS ? 'Target race pace last half.' : 'Easy Z2 throughout.'}`,
    runMinutes,
    runIntensity,
    [`run_easy_${runMiles}mi`],
    ['brick', 'run', isRS ? 'race_specific' : 'build'],
    isRS ? 'Z2–Z3' : 'Z2',
    goalId,
    'PM',
  );

  return [bikeSession, runSession];
}

// ── Strength sessions ─────────────────────────────────────────────────────────

export function triathlonStrength(day: string, phase: Phase, goalId: string): PlannedSession {
  const isBase = phase === 'base';
  const dur = isBase ? 55 : 40;
  const sets = isBase ? '4' : '3';
  return session(
    day, 'strength',
    `Triathlon Strength${isBase ? ' — Foundation' : ' — Maintenance'}`,
    isBase
      ? 'Foundation phase strength: single-leg stability, hip extension power, shoulder endurance. Higher volume now reduces injury risk later.'
      : 'Maintenance strength: preserve the adaptations built in Base. Lower volume, same intensity.',
    dur, isBase ? 'MODERATE' : 'EASY',
    [
      `st_main_squat_${sets}x6`,
      `st_acc_step_ups_${sets}x8`,
      `st_acc_single_leg_rdl_${sets}x8`,
      `st_acc_hip_thrusts_${sets}x12`,
      'st_acc_cable_row_3x10',
    ],
    ['strength', isBase ? 'base' : 'maintenance'],
    isBase ? 'Z3 strength' : 'Z2 strength',
    goalId,
  );
}

export function runStrength(day: string, phase: Phase, goalId: string): PlannedSession {
  const isBase = phase === 'base';
  const dur = isBase ? 50 : 40;
  const sets = isBase ? '4' : '3';
  return session(
    day, 'strength',
    `Run Strength${isBase ? ' — Foundation' : ' — Maintenance'}`,
    isBase
      ? 'Force-production and hip stability work for running economy. Heavier loads now build the muscular base that carries you through the build.'
      : 'Maintain the neuromuscular adaptations from Base. Short and sharp.',
    dur, isBase ? 'MODERATE' : 'EASY',
    [
      `st_main_squat_${sets}x5`,
      `st_main_deadlift_${sets}x5`,
      `st_acc_walking_lunges_${sets}x10`,
      `st_acc_hip_thrusts_${sets}x12`,
      `st_acc_single_leg_rdl_${sets}x8`,
    ],
    ['strength', isBase ? 'base' : 'maintenance'],
    isBase ? 'Z3 strength' : 'Z2 strength',
    goalId,
  );
}
