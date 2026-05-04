// generate-combined-plan/session-factory.ts
//
// Generates concrete session objects using the existing token vocabulary
// understood by materialize-plan. Every session has TSS, intensity class,
// zone targets, and steps_preset tokens.

import type { PlannedSession, Phase, Intensity, PlannedStrengthExercise } from './types.ts';
import type { Sport } from './types.ts';
import { estimateSessionTSS, weightedTSS, DAYS_OF_WEEK, type TriRaceDistance } from './science.ts';
import type { StrengthProtocol } from '../shared/strength-system/protocols/types.ts';
import { triathlonProtocol } from '../shared/strength-system/protocols/triathlon.ts';
import { triathlonPerformanceProtocol } from '../shared/strength-system/protocols/triathlon_performance.ts';
import { getProtocol, resolveProtocolIdForCombinedTriPlan } from '../shared/strength-system/protocols/selector.ts';
import { simplePlacementPolicy } from '../shared/strength-system/placement/simple.ts';
import type { ProtocolContext, IntentSession } from '../shared/strength-system/protocols/types.ts';
import { pickSwimDrillTokens, swimDrillYardsFromToken } from '../../../src/lib/plan-tokens/swim-drill-tokens.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SWIM_DRILL_MAIN_FLOOR_YD = 350;

/** Separates `pickSwimDrillTokens` rotation so easy / CSS / threshold swims don’t always collide. */
type SwimDrillSessionKind = 'easy' | 'css_aerobic' | 'threshold';

const SWIM_DRILL_KIND_SALT: Record<SwimDrillSessionKind, number> = {
  easy: 0,
  css_aerobic: 5,
  threshold: 11,
};

function optionalSwimDrillBlock(
  totalYards: number,
  wuYd: number,
  cdYd: number,
  planWeek: number | undefined,
  drillSlotSalt: number,
  phase: string | undefined,
  sessionKind: SwimDrillSessionKind,
): { mainBudgetYd: number; drillTokens: string[] } {
  let mainBudgetYd = totalYards - wuYd - cdYd;
  if (planWeek == null || mainBudgetYd < SWIM_DRILL_MAIN_FLOOR_YD + 50) {
    return { mainBudgetYd, drillTokens: [] };
  }
  const salt = drillSlotSalt + SWIM_DRILL_KIND_SALT[sessionKind];
  const tok = pickSwimDrillTokens(planWeek, salt, 1, phase)[0]!;
  const dy = swimDrillYardsFromToken(tok);
  if (dy <= 0 || mainBudgetYd - dy < SWIM_DRILL_MAIN_FLOOR_YD) {
    return { mainBudgetYd, drillTokens: [] };
  }
  return { mainBudgetYd: mainBudgetYd - dy, drillTokens: [tok] };
}

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

/** Race-specific long run: finish segment copy + zone line — marathon for IM/full; tri distances otherwise. */
function longRunRaceSpecificPaceCopy(dist: TriRaceDistance | null | undefined): { finish: string; zoneLine: string } {
  const d = String(dist ?? '').toLowerCase();
  if (d === 'ironman' || d === 'full' || d === 'marathon') {
    return { finish: 'marathon goal pace', zoneLine: 'Z2, last 30–40% at marathon pace' };
  }
  if (d === '70.3' || d === 'half' || d === 'half_marathon') {
    return { finish: '70.3 / half-marathon race pace', zoneLine: 'Z2, last 30–40% at 70.3 run pace' };
  }
  if (d === 'olympic') {
    return { finish: 'Olympic-distance race pace', zoneLine: 'Z2, last 30–40% at Olympic run pace' };
  }
  if (d === 'sprint') {
    return { finish: 'sprint race pace', zoneLine: 'Z2, last 30–40% at sprint run pace' };
  }
  return { finish: 'race pace', zoneLine: 'Z2, last 30–40% at race pace' };
}

/**
 * @param triRaceDistance When set (typical for combined tri plans), race-specific finish text matches distance
 *                        (70.3/half vs marathon/IM). Standalone marathon plans omit or pass `"marathon"`.
 */
export function longRun(
  day: string,
  miles: number,
  phase: Phase,
  goalId: string,
  triRaceDistance?: TriRaceDistance | null,
): PlannedSession {
  const isRaceSpecific = phase === 'race_specific';
  const dur = Math.round(miles * 9.5); // ~9:30/mi easy pace average
  const paceCopy = isRaceSpecific ? longRunRaceSpecificPaceCopy(triRaceDistance) : null;
  return session(
    day, 'run',
    `Long Run — ${miles} mi`,
    isRaceSpecific
      ? `Race-prep long run. Miles 1–${Math.round(miles * 0.5)} easy Z2, final ${Math.round(miles * 0.5)} at ${paceCopy!.finish}.`
      : `Aerobic long run at conversational pace. Full Z2 effort — if you can\'t speak in sentences, slow down.`,
    dur,
    isRaceSpecific ? 'MODERATE' : 'EASY',
    [isRaceSpecific ? `longrun_${miles}mi_mp_finish` : `longrun_${miles}mi_easypace`],
    ['long_run', 'aerobic', isRaceSpecific ? 'race_specific' : 'base'],
    isRaceSpecific ? paceCopy!.zoneLine : 'Z2 throughout',
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
  // Sustained tempo/threshold running is Zone 3-4 — MODERATE by spec §4.2
  // (not interval-based, so not classified HARD despite being quality work)
  return session(
    day, 'run',
    `Tempo Run — ${miles} mi at threshold`,
    `Warm up ${warmupMiles} mi easy, then ${miles} mi at lactate threshold (comfortably hard — 7–8 RPE, can say a few words). Cool down ${warmupMiles} mi easy.`,
    dur, 'MODERATE',
    [`warmup_run_${Math.round(warmupMiles * 10)}_easy`, `tempo_${miles}mi_threshold`, `cooldown_run_${Math.round(warmupMiles * 10)}_easy`],
    ['quality', 'threshold', 'run'],
    'Z3–Z4 threshold', goalId,
  );
}

/** Run VO2max — mirrors `vo2Bike` intent (ceiling work, not durability). Build-phase tri (`race_peak`) only. */
export function vo2Run(day: string, goalId: string): PlannedSession {
  return session(
    day, 'run',
    'VO2max Run — 5×3 min',
    'Warm up 10 min easy. 5×3 min at Z5 (hard — controlled sprint, not all-out) with 90 sec float recovery. Cool down 10 min. Builds raw aerobic ceiling.',
    55, 'HARD',
    ['warmup_run_10min_easy', 'run_vo2_5x3min_z5', 'cooldown_run_10min_easy'],
    ['quality', 'vo2max', 'run'],
    'Z5 VO2max', goalId,
  );
}

export function intervalRun(day: string, reps: number, phase: Phase, goalId: string): PlannedSession {
  // Periodized interval structure: base = tempo-biased (polarized-friendly); build = threshold-leaning;
  // race_specific = threshold / longer reps; taper = short race-pace touches.
  let dist: string;
  let pace: string;
  let restNote: string;
  let zoneLabel: string;
  let dur: number;
  let intensity: Intensity = 'HARD';

  if (phase === 'taper') {
    dist = '1000m'; pace = 'race pace'; restNote = '2 min walk/jog recovery'; zoneLabel = 'Z4 race pace'; dur = 45;
    reps = Math.min(reps, 3);
  } else if (phase === 'race_specific') {
    dist = '1600m'; pace = 'threshold / tempo pace'; restNote = '2 min jog recovery'; zoneLabel = 'Z4 threshold'; dur = 70;
    reps = Math.min(reps, 4);
  } else if (phase === 'build') {
    dist = '1200m'; pace = '10km pace'; restNote = '90 sec jog recovery'; zoneLabel = 'Z4–Z5'; dur = 65;
  } else {
    // base — aerobic power / 10K-tempo bias (avoid labeling VO2 "base" polarized work)
    dist = '1000m'; pace = '10K / tempo pace'; restNote = '90 sec jog recovery'; zoneLabel = 'Z3–Z4'; dur = 58;
    intensity = 'MODERATE';
  }

  return session(
    day, 'run',
    `Run Intervals — ${reps}×${dist}`,
    `Warm up 10 min easy. ${reps}×${dist} at ${pace} with ${restNote} between. Cool down 10 min. Focus on consistent splits, not all-out.`,
    dur, intensity,
    ['warmup_run_10min_easy', `interval_${reps}x${dist}_${phase}`, 'cooldown_run_10min_easy'],
    ['quality', 'intervals', 'run'],
    zoneLabel, goalId,
  );
}

export function marathonPaceRun(day: string, mpMiles: number, goalId: string): PlannedSession {
  const dur = Math.round((mpMiles + 3) * 9.0);
  // Marathon pace is ~80-90% of threshold pace = Zone 3 (MODERATE).
  // It's a sustained aerobic effort, not a supra-threshold interval session.
  return session(
    day, 'run',
    `Marathon Pace Run — ${mpMiles} mi`,
    `1.5 mi warm-up, ${mpMiles} mi at marathon goal pace (Z3–Z4, controlled), 1.5 mi cool-down. This teaches your body to run marathon pace on accumulating fatigue.`,
    dur, 'MODERATE',
    ['warmup_run_15min_easy', `run_marathon_pace_${mpMiles}mi`, 'cooldown_run_10min_easy'],
    ['race_specific', 'marathon_pace', 'run', 'quality'],
    'Z3 marathon pace', goalId,
  );
}

/** Stable token segment for `run_race_pace_<key>_<miles>mi` (no ambiguous extra underscores). */
function racePaceTokenKey(distance: TriRaceDistance): string {
  const d = String(distance || '').toLowerCase();
  if (d === '70.3') return '70_3';
  if (d === 'half' || d === 'half_marathon') return 'half';
  if (d === 'ironman' || d === 'full') return 'ironman';
  if (d === 'olympic') return 'olympic';
  if (d === 'sprint') return 'sprint';
  const cleaned = d.replace(/\./g, '_').replace(/[^a-z0-9_]/g, '');
  return cleaned || 'default';
}

/** Tri race-specific sustained run at distance-appropriate race effort (vs standalone marathon MP). */
export function racePaceRun(
  day: string,
  miles: number,
  distance: TriRaceDistance,
  goalId: string,
): PlannedSession {
  const paceLabel = (() => {
    switch (String(distance || '').toLowerCase()) {
      case 'sprint':
        return 'Olympic/Sprint race pace (Z4–Z5)';
      case 'olympic':
        return 'Olympic race pace (Z4)';
      case '70.3':
      case 'half':
      case 'half_marathon':
        return '70.3 / half-marathon run pace (Z3–Z4)';
      case 'ironman':
      case 'full':
      case 'marathon':
        return 'Ironman / marathon run pace (Z3)';
      default:
        return 'race pace (Z3–Z4)';
    }
  })();

  const sessionLabel = (() => {
    switch (String(distance || '').toLowerCase()) {
      case 'sprint':
      case 'olympic':
        return 'Race Pace Run';
      case '70.3':
      case 'half':
      case 'half_marathon':
        return 'Half-Marathon Pace Run';
      case 'ironman':
      case 'full':
      case 'marathon':
        return 'Marathon Pace Run';
      default:
        return 'Race Pace Run';
    }
  })();

  const token = `run_race_pace_${racePaceTokenKey(distance)}_${miles}mi`;
  const dur = Math.round((miles + 3) * 9.0);

  return session(
    day, 'run',
    `${sessionLabel} — ${miles} mi`,
    `1.5 mi warm-up, ${miles} mi at ${paceLabel}, 1.5 mi cool-down. Trains your body to hold race effort on accumulating fatigue.`,
    dur, 'MODERATE',
    ['warmup_run_15min_easy', token, 'cooldown_run_10min_easy'],
    ['race_specific', 'race_pace', 'run', 'quality'],
    paceLabel, goalId,
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

/**
 * Anchor-driven group ride quality session.
 * Use this when the athlete's quality-bike day is a recurring group ride anchor.
 * We do not prescribe interval structure because effort is controlled by the group.
 */
export function groupRideSession(
  day: string,
  hours: number,
  phase: Phase,
  goalId: string,
  label = 'Group Ride',
): PlannedSession {
  const min = Math.max(45, Math.round(hours * 60));
  const phaseLine =
    phase === 'base'
      ? 'Keep overall effort aerobic — Z2 with climb surges.'
      : 'This is your quality bike session — give the climbs real effort.';
  return session(
    day,
    'bike',
    label,
    `${day} group ride — ${hours.toFixed(1)} hr. Ride your own effort. Push on the climbs, recover on the flats. ${phaseLine}`,
    min,
    'HARD',
    [],
    ['quality', 'group_ride', 'anchor'],
    'Group-ride variable effort',
    goalId,
  );
}

/**
 * base_first approach — Z3 tempo blocks.
 * The "20% non-easy" bucket favours comfortably hard (Z3) over threshold (Z4).
 * Builds muscular endurance without the cortisol spike of FTP work.
 */
export function tempoBike(day: string, intervals: number, minEach: number, goalId: string): PlannedSession {
  const dur = 15 + intervals * minEach + (intervals - 1) * 5 + 10;
  return session(
    day, 'bike',
    `Bike Tempo — ${intervals}×${minEach} min`,
    `Warm up 15 min. ${intervals}×${minEach} min at tempo effort (82–88% FTP — comfortably hard, you can say a few words). ${5} min easy between. Cool down 10 min. Builds aerobic power without deep fatigue.`,
    dur, 'MODERATE',
    ['warmup_bike_quality_15min_fastpedal', `bike_tempo_${intervals}x${minEach}min_r5min`, 'cooldown_bike_10min_easy'],
    ['quality', 'tempo', 'bike'],
    'Z3 tempo', goalId,
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

/**
 * Mid-week quality bike anchor (e.g. group ride Wednesday). Same periodization intent as run `intervalRun`:
 * base → sweet spot 2×15; build → FTP threshold 3×20; race_specific → VO2 6×5. Taper: `bikeOpeners` at call site.
 */
export function groupRideQualityBikeSession(day: string, phase: Phase, goalId: string): PlannedSession {
  if (phase === 'race_specific') {
    return vo2Bike(day, 6, goalId);
  }
  if (phase === 'build') {
    return thresholdBike(day, 3, 20, goalId);
  }
  return sweetSpotBike(day, 2, 15, goalId);
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

export function thresholdSwim(
  day: string,
  totalYards: number,
  goalId: string,
  planWeek?: number,
  drillSlotSalt: number = 0,
  phase?: string,
): PlannedSession {
  const wu = 300;
  const cd = 200;
  const { mainBudgetYd: main, drillTokens } = optionalSwimDrillBlock(
    totalYards, wu, cd, planWeek, drillSlotSalt, phase, 'threshold',
  );
  const threshReps = Math.max(4, Math.round((main * 0.55) / 100));
  const aeroReps   = Math.max(3, Math.round((main * 0.45) / 150));
  const dur = Math.round(totalYards / 40); // ~40 yd/min including rest
  const drillNote = drillTokens.length ? ' Technique drills before the main set.' : '';
  const tags: string[] = ['quality', 'threshold', 'swim'];
  if (drillTokens.length) tags.push('swim_drills');
  return session(
    day, 'swim',
    `Swim Threshold — ${totalYards} yd`,
    `Warm up ${wu} yd easy.${drillNote} ${threshReps}×100 yd at threshold (Zone 4 — maximal sustainable effort) with 15 sec rest. ${aeroReps}×150 yd aerobic. Cool down ${cd} yd.`,
    dur, 'HARD',
    [`swim_warmup_${wu}yd_easy`, ...drillTokens, `swim_threshold_${threshReps}x100yd_r15`, `swim_aerobic_${aeroReps}x150yd_easy_r20`, `swim_cooldown_${cd}yd`],
    tags,
    'Z4 threshold swim', goalId,
  );
}

/**
 * base_first approach — comfortable CSS aerobic pace (Z3).
 * Not maximal CSS threshold — just sustainable race pace.
 * Develops comfort at finish-line speed without lactate stress.
 */
export function cssAerobicSwim(
  day: string,
  totalYards: number,
  goalId: string,
  planWeek?: number,
  drillSlotSalt: number = 0,
  phase?: string,
): PlannedSession {
  const wu = 300;
  const cd = 200;
  const { mainBudgetYd: main, drillTokens } = optionalSwimDrillBlock(
    totalYards, wu, cd, planWeek, drillSlotSalt, phase, 'css_aerobic',
  );
  const reps = Math.max(5, Math.round(main / 100));
  const dur  = Math.round(totalYards / 42); // slightly faster than easy, slower than threshold
  const drillNote = drillTokens.length ? ' Technique drills after the warm-up.' : '';
  const tags: string[] = ['quality', 'css_aerobic', 'swim'];
  if (drillTokens.length) tags.push('swim_drills');
  return session(
    day, 'swim',
    `CSS Aerobic Swim — ${totalYards} yd`,
    `Warm up ${wu} yd.${drillNote} ${reps}×100 yd at comfortable CSS pace (15 sec rest — sustainable, not maximal). Focus on consistent splits. Cool down ${cd} yd.`,
    dur, 'MODERATE',
    [`swim_warmup_${wu}yd_easy`, ...drillTokens, `swim_aerobic_css_${reps}x100yd_r15`, `swim_cooldown_${cd}yd`],
    tags,
    'Z3 CSS aerobic', goalId,
  );
}

export function easySwim(
  day: string,
  totalYards: number,
  goalId: string,
  planWeek?: number,
  drillSlotSalt: number = 0,
  phase?: string,
): PlannedSession {
  const wu = 300;
  const cd = 200;
  const { mainBudgetYd: mainYards, drillTokens } = optionalSwimDrillBlock(
    totalYards, wu, cd, planWeek, drillSlotSalt, phase, 'easy',
  );
  const reps = Math.max(4, Math.round(mainYards / 150));
  const dur = Math.round(totalYards / 35); // ~35 yd/min for easy
  const drillNote = drillTokens.length ? ' Drills after the warm-up for stroke feel.' : '';
  const tags: string[] = ['easy', 'aerobic', 'swim'];
  if (drillTokens.length) tags.push('swim_drills');
  return session(
    day, 'swim',
    `Easy Swim — ${totalYards} yd`,
    `Warm up ${wu} yd easy.${drillNote} ${reps}×150 yd at easy aerobic pace. Focus on technique: high elbow catch, bilateral breathing. Cool down ${cd} yd.`,
    dur, 'EASY',
    [`swim_warmup_${wu}yd_easy`, ...drillTokens, `swim_aerobic_${reps}x150yd_easy_r20`, `swim_cooldown_${cd}yd`],
    tags,
    'Z2', goalId,
  );
}

/** Open water skills practice — ocean/lake chop, sighting, wetsuit comfort (tri-specific). */
export function openWaterPracticeSwim(day: string, durationMin: number, goalId: string): PlannedSession {
  const m = Math.max(28, Math.min(55, durationMin));
  return session(
    day, 'swim',
    'Open Water Practice',
    `Open water session (~${m} min). Use conditions similar to your race where possible: wetsuit if legal, sight every 6–8 strokes, practice bilateral breathing into chop or sun glare. Steady aerobic effort — not an anaerobic sprint.`,
    m, 'MODERATE',
    ['swim_open_water_practice'],
    ['open_water', 'aerobic_swim', 'swim', 'tri_specific'],
    'Z2–Z3 OW sighting', goalId,
  );
}

// ── Brick sessions ─────────────────────────────────────────────────────────────
// Returns [bikeSession, runSession] as two sessions on the same day.

export function brick(
  day: string,
  bikeHours: number,
  runMiles: number,
  phase: Phase,
  goalId: string,
): [PlannedSession, PlannedSession] {
  const bikeMin = Math.round(bikeHours * 60);
  const isRS = phase === 'race_specific';
  const bikeIntensity: Intensity = isRS ? 'MODERATE' : 'EASY';
  const runIntensity: Intensity = isRS ? 'MODERATE' : 'EASY';
  const runMilesClamped = Math.max(1, runMiles);
  const runMinutes = Math.max(15, Math.round(runMilesClamped * 10));
  const miLabel = Math.round(runMilesClamped * 2) / 2;

  const bikeSession = session(
    day, 'bike',
    `Brick — Bike ${bikeHours.toFixed(1)} hr`,
    isRS
      ? `Race-simulation bike at Zone 3 (race pace). Stay aero. Transition quickly into the run.`
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
    `Brick — Run ${miLabel} mi off the bike`,
    `Immediately after the bike. The first 5 min will feel strange — focus on turnover, not pace. ${isRS ? 'Target race pace last half.' : 'Easy Z2 throughout.'}`,
    runMinutes,
    runIntensity,
    [`run_easy_${runMinutes}min`],
    ['brick', 'run', isRS ? 'race_specific' : 'build'],
    isRS ? 'Z2–Z3' : 'Z2',
    goalId,
    'PM',
  );

  return [bikeSession, runSession];
}

/** Parse total yards from swim session title (e.g. "… — 2400 yd"). */
function parseYardsFromSessionName(name: string): number | null {
  const m = String(name).match(/(\d[\d,]*)\s*yd/i);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ''), 10);
}

/**
 * Replace a quality session with a genuine easy prescription (same day, goal, ~duration)
 * so name, steps_preset, and description match EASY after 80/20 enforcement.
 */
export function downgradedEasyAerobicFrom(s: PlannedSession): PlannedSession {
  const dur = Math.max(25, s.duration);
  const day = s.day;
  const goalId = s.serves_goal;
  const timing = s.timing;

  let next: PlannedSession;
  if (s.type === 'run') {
    const miles = Math.max(3, Math.round(dur / 9.5));
    next = easyRun(day, miles, goalId);
  } else if (s.type === 'bike') {
    const hours = Math.max(0.5, dur / 60);
    next = easyBike(day, hours, goalId);
  } else if (s.type === 'swim') {
    const ydFromName = parseYardsFromSessionName(s.name);
    const yd = Math.max(1200, ydFromName ?? Math.round(dur * 38));
    next = easySwim(day, yd, goalId);
  } else {
    next = s;
  }

  if (timing) next = { ...next, timing };
  // Internal pipeline tag — kept off the athlete-facing description.
  next.tags = [...(next.tags ?? []), 'auto_adjusted_easy'];
  return next;
}

/**
 * Adjacent HARD days: swap HARD for a sustainable moderate session so copy matches intensity.
 */
export function downgradedHardToModerateFrom(s: PlannedSession): PlannedSession {
  const day = s.day;
  const goalId = s.serves_goal;
  const timing = s.timing;
  let next: PlannedSession;

  if (s.type === 'bike') {
    if (s.tags?.includes('vo2max')) {
      const m = s.name.match(/(\d+)\s*[×x]\s*5/);
      const reps = m ? Math.max(2, Math.min(4, parseInt(m[1], 10) - 1)) : 3;
      next = tempoBike(day, reps, 5, goalId);
    } else if (s.tags?.includes('threshold') || /threshold/i.test(s.name)) {
      const m = s.name.match(/(\d+)\s*[×x]\s*(\d+)/);
      const intervals = m ? Math.max(2, Math.min(4, parseInt(m[1], 10))) : 3;
      const minEach = m ? Math.min(15, parseInt(m[2], 10)) : 12;
      next = sweetSpotBike(day, intervals, minEach, goalId);
    } else {
      next = tempoBike(day, 3, 12, goalId);
    }
  } else if (s.type === 'run' && s.tags?.includes('intervals')) {
    const m = s.name.match(/(\d+)\s*[×x]\s*(800m|1200m|1600m|1000m)/i);
    const reps = m ? Math.max(2, parseInt(m[1], 10) - 2) : 4;
    const dist = m?.[2] ?? '800m';
    next = session(
      day, 'run',
      `Run Intervals — ${reps}×${dist}`,
      `Warm up 10 min easy. ${reps}×${dist} at controlled quality pace with 90 sec jog recovery between. Cool down 10 min. Keep this crisp and smooth, not maximal.`,
      Math.max(45, Math.round(s.duration * 0.85)),
      'MODERATE',
      ['warmup_run_10min_easy', `interval_${reps}x${dist}_moderate`, 'cooldown_run_10min_easy'],
      ['quality', 'intervals', 'run'],
      'Z4 controlled quality',
      goalId,
    );
  } else if (s.type === 'run' && s.tags?.includes('vo2max')) {
    // Same pattern as bike vo2 downgrade: replace with tempo-style work so MODERATE + description stay aligned.
    next = tempoRun(day, 3, 1.5, goalId);
  } else if (s.type === 'swim' && (s.tags?.includes('threshold') || /threshold/i.test(s.name))) {
    const yd = parseYardsFromSessionName(s.name) ?? Math.max(1800, s.duration * 40);
    next = cssAerobicSwim(day, yd, goalId);
  } else {
    next = {
      ...s,
      intensity_class: 'MODERATE',
      zone_targets: 'Z3 steady',
      description:
        'Moderate sustained effort (Z3 — comfortably hard). ' + s.description,
      tags: [...(s.tags ?? []).filter(t => !['vo2max', 'intervals'].includes(t)), 'steady_state'],
    };
  }

  if (timing) next = { ...next, timing };
  // Internal pipeline tag — kept off the athlete-facing description.
  next.tags = [...(next.tags ?? []), 'auto_downgraded_moderate'];
  return next;
}

// ── Strength sessions ─────────────────────────────────────────────────────────
//
// triathlonStrength and runStrength now route through the shared protocol
// system rather than using hardcoded exercise lists. This gives them:
//   - Phase-aware volume/intensity progression
//   - Limiter-sport exercise branching (swim/bike/run)
//   - Brick-day awareness (caller passes brickDays; protocol placement avoids them)
//   - Taper sensitivity (taper phase → neural priming only)

/** Tri combined: never run foundation-durability / neural_speed as literal protocols when intent is co-equal. */
function resolveTriCombinedStrengthProtocol(options: {
  strengthProtocolId?: string;
  strengthIntent?: 'support' | 'performance';
}): StrengthProtocol {
  const id = resolveProtocolIdForCombinedTriPlan(
    options.strengthProtocolId,
    options.strengthIntent,
  );
  return id === 'triathlon_performance' ? triathlonPerformanceProtocol : triathlonProtocol;
}

// Maps combined-plan phase names to the StrengthPhase format expected by the
// shared strength protocols. Mapping rationale:
//   base          → 'Base'      (hypertrophy / structural foundation)
//   build         → 'Build'     (strength building, 3×4-6 @ 75-82%)
//   race_specific → 'Speed'     (peak neural with potentiation — box jumps, 3×2 @ 87-89%)
//   taper         → 'Taper'     (createTaperSessions handles light maintenance)
//   recovery      → 'Recovery'  (deload week — protocols use createPerfRecoverySession etc.)
//
// 'Race Prep' (minimal 2×2 activation) is a legacy fallback; nothing maps to it
// from combined-plan anymore. Taper weeks correctly use createTaperSessions.
function toStrengthPhase(phase: Phase): { name: string; start_week: number; end_week: number; weeks_in_phase: number } {
  const nameMap: Record<Phase, string> = {
    base: 'Base', build: 'Build', race_specific: 'Speed', taper: 'Taper', recovery: 'Recovery',
  };
  const name = nameMap[phase] ?? 'Base';
  console.log(`[strength] combined-plan phase=${phase} → strength phase name=${name}`);
  return { name, start_week: 1, end_week: 4, weeks_in_phase: 4 };
}

// Converts a protocol IntentSession to a PlannedSession for the combined plan
function intentToPlanned(
  intent: IntentSession,
  day: string,
  _phase: Phase,
  goalId: string,
): PlannedSession {
  const intensityMap: Record<string, Intensity> = {
    hypertrophy: 'MODERATE',
    strength: 'MODERATE',
    maintenance: 'EASY',
  };
  const intensity: Intensity = intentMap(intent) ?? intensityMap[intent.repProfile ?? 'maintenance'] ?? 'EASY';
  const tss = estimateSessionTSS('strength', intensity, intent.duration);
  const wtss = weightedTSS('strength', tss);

  const rawEx = intent.exercises ?? [];
  const strengthEx: PlannedStrengthExercise[] | undefined =
    rawEx.length > 0
      ? rawEx.map((ex) => {
        const e = ex as unknown as Record<string, unknown>;
        return {
          name: String(e?.name ?? 'Exercise'),
          sets: typeof e?.sets === 'number' ? e.sets as number : undefined,
          reps: e?.reps as number | string | undefined,
          weight: e?.weight as string | number | undefined,
          percent_1rm: typeof e?.percent_1rm === 'number' ? (e.percent_1rm as number) : undefined,
          load: e?.load as { percent_1rm?: number } | undefined,
          target_rir: typeof e?.target_rir === 'number' ? (e.target_rir as number) : undefined,
          notes: typeof e?.notes === 'string' ? (e.notes as string) : undefined,
        };
      })
      : undefined;

  const tokenSteps = buildStrengthSteps(intent);
  const steps: string[] =
    strengthEx && strengthEx.length > 0
      ? []
      : tokenSteps.length > 0
        ? tokenSteps
        : ['st_main_squat_3x8', 'st_acc_hip_thrusts_3x10', 'st_acc_step_ups_3x10'];

  return {
    day,
    type: 'strength',
    name: intent.name,
    description: intent.description,
    duration: intent.duration,
    tss,
    weighted_tss: wtss,
    intensity_class: intensity,
    zone_targets: intensity === 'MODERATE' ? 'Z3 strength' : 'Z2 strength',
    steps_preset: steps,
    tags: intent.tags,
    serves_goal: goalId,
    ...(strengthEx && strengthEx.length > 0 ? { strength_exercises: strengthEx } : {}),
  };
}

function intentMap(intent: IntentSession): Intensity | null {
  if (intent.tags.includes('neural_priming')) return 'EASY';
  if (intent.tags.includes('explosive')) return 'MODERATE';
  if (intent.tags.includes('recovery')) return 'EASY';
  return null;
}

// Map protocol exercise names to token vocabulary where possible;
// fall back to generic st_acc tokens for exercises not in the token vocab.
function buildStrengthSteps(intent: IntentSession): string[] {
  const steps: string[] = [];
  const nameToToken: Record<string, string> = {
    'back squat': 'st_main_squat_3x8',
    'barbell back squat': 'st_main_squat_3x8',
    'conventional deadlift': 'st_main_deadlift_3x6',
    deadlift: 'st_main_deadlift_3x6',
    'trap bar deadlift': 'st_main_deadlift_3x6',
    'romanian deadlift': 'st_main_deadlift_3x8',
    'single-leg rdl': 'st_acc_single_leg_rdl_3x8',
    'single-leg rdl (supported)': 'st_acc_single_leg_rdl_3x8',
    'hip thrusts': 'st_acc_hip_thrusts_3x12',
    'hip thrusts (fast concentric)': 'st_acc_hip_thrusts_4x6',
    'step-ups': 'st_acc_step_ups_3x10',
    'explosive step-ups': 'st_acc_step_ups_4x5',
    'box jumps': 'st_main_box_jumps_3x5',
    'jump squats': 'st_main_squat_3x5',
    'lat pull-down': 'st_acc_lat_pulldown_3x10',
    'explosive lat pull-down': 'st_acc_lat_pulldown_4x6',
    'seated cable row': 'st_acc_cable_row_3x10',
    'face pulls': 'st_acc_face_pulls_3x15',
    'band pull-aparts': 'st_acc_band_pull_aparts_3x20',
    'pull-ups / assisted pull-ups': 'st_acc_pullups_3x6',
    'pull-ups (explosive)': 'st_acc_pullups_4x4',
    'inverted rows': 'st_acc_inverted_rows_3x10',
    'dead bug': 'st_acc_dead_bug_3x8',
    'plank with shoulder tap': 'st_acc_plank_3x45s',
    'side plank': 'st_acc_side_plank_2x30s',
    'single-leg calf raises': 'st_acc_single_leg_calf_3x12',
    'weighted single-leg calf raises': 'st_acc_single_leg_calf_3x8',
    'calf raises (bilateral)': 'st_acc_calf_raises_3x15',
    'bulgarian split squat': 'st_acc_split_squat_4x6',
    'rear-foot elevated split squat': 'st_acc_split_squat_4x6',
    'bench press': 'st_acc_bench_press_3x8',
    'barbell row': 'st_acc_barbell_row_3x8',
    'standing barbell overhead press': 'st_acc_overhead_press_3x8',
  };

  for (const ex of (intent.exercises ?? [])) {
    const key = (ex.name ?? '').toLowerCase().trim();
    const token = nameToToken[key];
    if (token) steps.push(token);
    // unlisted exercises are described in the intent.description — no token needed
  }

  // Always include at least one token so materialize-plan has something to work with
  if (steps.length === 0) {
    steps.push('st_main_squat_3x8', 'st_acc_hip_thrusts_3x12');
  }
  return steps;
}

export function triathlonStrength(
  day: string,
  phase: Phase,
  goalId: string,
  options?: {
    weekInPhase?: number;
    /** 1-based calendar week in the plan — taper / race-week branching in protocols */
    weekIndex?: number;
    /** Full plan duration (same as generate-combined-plan total weeks) */
    totalWeeks?: number;
    isRecovery?: boolean;
    limiterSport?: 'swim' | 'bike' | 'run';
    sessionIndex?: number; // 0 = lower/posterior, 1 = upper/swim
    equipmentType?: 'home_gym' | 'commercial_gym';
    /** Calendar long sessions — drives strength placement (default Sat/Sun). */
    longRideDayName?: string;
    longRunDayName?: string;
    /** Protocol id (triathlon, neural_speed, durability, …). Default: triathlon. */
    strengthProtocolId?: string;
    strengthIntent?: 'support' | 'performance';
  },
): PlannedSession {
  const longRide = options?.longRideDayName ?? 'Saturday';
  const longRun = options?.longRunDayName ?? 'Sunday';
  const longSessionDays = [...new Set([longRide, longRun])];
  const easySessionDays = [...DAYS_OF_WEEK].filter(
    (d) => !longSessionDays.includes(d) && d !== 'Tuesday',
  );

  const ctx: ProtocolContext = {
    weekIndex: Math.max(1, options?.weekIndex ?? 1),
    weekInPhase: options?.weekInPhase ?? 1,
    phase: toStrengthPhase(phase),
    totalWeeks: Math.max(1, options?.totalWeeks ?? 20),
    isRecovery: options?.isRecovery ?? false,
    primarySchedule: {
      longSessionDays,
      qualitySessionDays: ['Tuesday', 'Thursday'],
      easySessionDays,
    },
    userBaselines: { equipment: options?.equipmentType ?? 'commercial_gym' },
    strengthFrequency: 2,
    constraints: {},
    triathlonContext: {
      limiterSport: options?.limiterSport ?? 'run',
      strengthIntent: options?.strengthIntent,
    },
  };

  const protocol = resolveTriCombinedStrengthProtocol({
    strengthProtocolId: options?.strengthProtocolId,
    strengthIntent: options?.strengthIntent,
  });

  const sessions = protocol.createWeekSessions(ctx);
  // sessionIndex 0 = lower/posterior chain, 1 = upper/swim
  const idx = options?.sessionIndex ?? 0;
  const chosen = sessions[Math.min(idx, sessions.length - 1)] ?? sessions[0];
  if (!chosen) {
    const fallbackTSS = estimateSessionTSS('strength', 'EASY', 15);
    return {
      day, type: 'strength', name: 'Strength — Taper Rest',
      description: 'No strength this phase.', duration: 0, tss: 0, weighted_tss: 0,
      intensity_class: 'EASY', zone_targets: 'rest',
      steps_preset: [], tags: ['strength', 'taper'], serves_goal: goalId,
    };
  }
  return intentToPlanned(chosen, day, phase, goalId);
}

export function runStrength(day: string, phase: Phase, goalId: string, options?: {
  weekInPhase?: number;
  weekIndex?: number;
  totalWeeks?: number;
  isRecovery?: boolean;
  equipmentType?: 'home_gym' | 'commercial_gym';
}): PlannedSession {
  const protocol = getProtocol('durability');
  const ctx: ProtocolContext = {
    weekIndex: Math.max(1, options?.weekIndex ?? 1),
    weekInPhase: options?.weekInPhase ?? 1,
    phase: toStrengthPhase(phase),
    totalWeeks: Math.max(1, options?.totalWeeks ?? 20),
    isRecovery: options?.isRecovery ?? false,
    primarySchedule: { longSessionDays: ['Sunday'], qualitySessionDays: ['Tuesday', 'Thursday'], easySessionDays: ['Monday', 'Wednesday', 'Friday'] },
    userBaselines: { equipment: options?.equipmentType ?? 'commercial_gym' },
    strengthFrequency: 2,
    constraints: {},
  };

  const sessions = protocol.createWeekSessions(ctx);
  const chosen = sessions[0];
  if (!chosen) {
    const fallbackTSS = estimateSessionTSS('strength', 'EASY', 30);
    return {
      day, type: 'strength', name: 'Strength — Maintenance',
      description: 'Light maintenance strength.', duration: 30, tss: fallbackTSS,
      weighted_tss: weightedTSS('strength', fallbackTSS),
      intensity_class: 'EASY', zone_targets: 'Z2 strength',
      steps_preset: ['st_main_squat_3x8', 'st_acc_hip_thrusts_3x12', 'st_acc_single_leg_rdl_3x8'],
      tags: ['strength', 'run'], serves_goal: goalId,
    };
  }
  return intentToPlanned(chosen, day, phase, goalId);
}
