// generate-combined-plan/session-factory.ts
//
// Generates concrete session objects using the existing token vocabulary
// understood by materialize-plan. Every session has TSS, intensity class,
// zone targets, and steps_preset tokens.

import type { PlannedSession, Phase, Intensity, PlannedStrengthExercise } from './types.ts';
import type { Sport } from './types.ts';
import { estimateSessionTSS, weightedTSS, DAYS_OF_WEEK, type TriRaceDistance } from './science.ts';
import type { GroupRideRouteSnapshot } from '../_shared/group-ride-route-snapshot.ts';
import {
  climbNoticeTier,
  groupRideBikeTssFloor,
  groupRideRouteHighVerticalStress,
} from '../_shared/group-ride-route-snapshot.ts';
import type { StrengthProtocol } from '../shared/strength-system/protocols/types.ts';
import { triathlonProtocol } from '../shared/strength-system/protocols/triathlon.ts';
import { triathlonPerformanceProtocol } from '../shared/strength-system/protocols/triathlon_performance.ts';
import { getProtocol, resolveProtocolIdForCombinedTriPlan } from '../shared/strength-system/protocols/selector.ts';
import { simplePlacementPolicy } from '../shared/strength-system/placement/simple.ts';
import type { ProtocolContext, IntentSession } from '../shared/strength-system/protocols/types.ts';
import {
  buildSwimGearLine,
  pickSwimDrillInset,
  resolveSwimSessionTypeForGear,
  swimDrillBlockAthleteCopy,
  swimSessionPhilosophyLead,
} from '../../../src/lib/plan-tokens/swim-drill-tokens.ts';
import {
  buildStrengthEquipmentLine,
  hasBench as detectBench,
  hasBox as detectBox,
  hasKettlebell as detectKettlebell,
  hasPullUpBar as detectPullUpBar,
} from '../_shared/strength-equipment-tier.ts';
/** Step 4: swim templates — same `../_shared/` reach as `../../../src/lib/plan-tokens/`. */
import {
  calculateSwimTss,
  kickFocusRequiredGear,
  resolveCssSecPer100Yd,
} from './swim-protocol-v21.ts';
import type { SwimDistanceKey, SwimSlotTemplate } from '../_shared/swim-program-templates.ts';

// ── Helpers ─────────────────────────────────────────────────────────────────-

/**
 * Append a standardized pool-gear summary to a swim session description. Returns the description
 * unchanged when the session has no required gear and the athlete owns no useful optional gear.
 *
 * Format: `… Pool gear — Required: Pull buoy. Optional: Paddles, Snorkel.`
 */
function appendPoolGearLine(
  description: string,
  drillTokens: string[],
  swimEquipment: string[] | null | undefined,
  sessionRequired?: string[],
): string {
  const line = buildSwimGearLine({
    drillTokens,
    athleteGearLabels: swimEquipment,
    sessionRequired: sessionRequired ?? [],
  });
  return line ? `${description} ${line}` : description;
}

function shiftWeekday(day: string, delta: number): string {
  const i = DAYS_OF_WEEK.indexOf(day as (typeof DAYS_OF_WEEK)[number]);
  const base = i >= 0 ? i : 0;
  return DAYS_OF_WEEK[(base + delta + 7) % 7]!;
}

/** Group-ride route sentence — matches athlete plan units (planned workout body text). */
export function formatGroupRideRouteTopoCopy(
  snapshot: GroupRideRouteSnapshot,
  units: 'imperial' | 'metric',
): string {
  const distKm = snapshot.distance_m / 1000;
  const elevM = snapshot.elevation_gain_m;
  const densMpk = snapshot.climb_density_m_per_km;
  let core: string;
  if (units === 'metric') {
    core = ` Strava route: ~${distKm.toFixed(1)} km, ~${Math.round(elevM)} m climbing (~${densMpk.toFixed(1)} m/km).`;
  } else {
    const mi = distKm * 0.621371192237334;
    const ft = elevM * 3.280839895013123;
    const ftPerMi = densMpk * 1.609344 * 3.280839895013123;
    core = ` Strava route: ~${mi.toFixed(1)} mi, ~${Math.round(ft)} ft climbing (~${Math.round(ftPerMi)} ft/mi).`;
  }
  const tier = climbNoticeTier(snapshot);
  if (tier === 'aggressive') {
    core +=
      ' High climbing density — real threshold-like stress even at modest duration; respect recovery the next day.';
  } else if (tier === 'notice') {
    core += ' Rolling/hilly profile — pace-by-feel can overshoot flat-road RPE.';
  }
  return core;
}

/** Snap total swim volume to pool-friendly yards after TSS/duration math, before interval/token assembly. */
function snapSwimSessionTotalYdEasy(totalYards: number): number {
  if (!Number.isFinite(totalYards) || totalYards <= 0) return totalYards;
  return Math.round(totalYards / 50) * 50;
}

/** CSS / threshold-style sessions built around 100 yd reps — snap total to nearest 100 yd. */
function snapSwimSessionTotalYdInterval100(totalYards: number): number {
  if (!Number.isFinite(totalYards) || totalYards <= 0) return totalYards;
  return Math.round(totalYards / 100) * 100;
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
      ? `Race-specific long run. Miles 1–${Math.round(miles * 0.5)} easy Z2, final ${Math.round(miles * 0.5)} at ${paceCopy!.finish}.`
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
  routeUrl?: string | null,
  routeSnapshot?: GroupRideRouteSnapshot | null,
  routeUnits: 'imperial' | 'metric' = 'imperial',
): PlannedSession {
  const min = Math.max(45, Math.round(hours * 60));
  const highVertical = routeSnapshot != null && groupRideRouteHighVerticalStress(routeSnapshot);
  const tier = routeSnapshot != null ? climbNoticeTier(routeSnapshot) : 'none';
  const phaseLine =
    phase === 'base'
      ? highVertical || tier !== 'none'
        ? 'Route has sustained climbing — expect threshold-like surges on hills; keep flats easy and fuel.'
        : 'Keep overall effort aerobic — Z2 with climb surges.'
      : 'This is your quality bike session — give the climbs real effort.';
  const url = typeof routeUrl === 'string' ? routeUrl.trim() : '';

  const topo = routeSnapshot != null ? formatGroupRideRouteTopoCopy(routeSnapshot, routeUnits) : '';

  const routePara = url.length > 0 ? ` Saved route (open before ride): ${url}` : '';

  const inner = session(
    day,
    'bike',
    label,
    `${day} group ride — ${hours.toFixed(1)} hr. Ride your own effort. Push on the climbs, recover on the flats. ${phaseLine}.${topo}${routePara}`,
    min,
    'HARD',
    [],
    ['quality', 'group_ride', 'anchor'],
    'Group-ride variable effort',
    goalId,
  );

  const floor = groupRideBikeTssFloor(routeSnapshot ?? undefined);
  let tss = inner.tss;
  let wtss = inner.weighted_tss;
  if (floor != null && tss < floor) {
    tss = floor;
    wtss = weightedTSS('bike', tss);
  }

  return {
    ...inner,
    tss,
    weighted_tss: wtss,
    session_kind: 'quality_bike',
    ...(url ? { route_url: url } : {}),
    ...(routeSnapshot ? { group_ride_route_snapshot: routeSnapshot } : {}),
  };
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
  let inner: PlannedSession;
  if (phase === 'race_specific') {
    inner = vo2Bike(day, 6, goalId);
  } else if (phase === 'build') {
    inner = thresholdBike(day, 3, 20, goalId);
  } else {
    inner = sweetSpotBike(day, 2, 15, goalId);
  }
  return { ...inner, session_kind: 'quality_bike' };
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

/**
 * Short fast 50s + easy aerobic flush — neuromuscular speed without stacked threshold density.
 * Tokens reuse `swim_threshold_*` shape so materialize-plan expands reps like threshold sets.
 */
export function speedSwim(
  day: string,
  totalYards: number,
  goalId: string,
  planWeek?: number,
  drillSlotSalt: number = 0,
  phase?: string,
  swimEquipment?: string[] | null,
): PlannedSession {
  totalYards = snapSwimSessionTotalYdInterval100(totalYards);
  const wu = 300;
  const cd = 200;
  const { mainBudgetYd: main, drillTokens } = pickSwimDrillInset({
    totalYards,
    wuYd: wu,
    cdYd: cd,
    planWeek,
    drillSlotSalt,
    phase,
    sessionKind: 'threshold',
    swimGearLabels: swimEquipment,
  });
  const fastBudget = Math.round(main * 0.58);
  let fastReps = Math.min(22, Math.max(10, Math.round(fastBudget / 50)));
  while (fastReps > 10 && fastReps * 50 > fastBudget) fastReps -= 1;
  const remainder = Math.max(200, main - fastReps * 50);
  const aeroReps = Math.max(3, Math.round(remainder / 150));
  const dur = Math.round(totalYards / 38);
  const drillLead =
    drillTokens.length > 0
      ? `${swimSessionPhilosophyLead('threshold')}${swimDrillBlockAthleteCopy(drillTokens)} `
      : '';
  const tags: string[] = ['quality', 'speed_swim', 'swim'];
  if (drillTokens.length) tags.push('swim_drills');
  return session(
    day,
    'swim',
    `Swim Speed / Turnover — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. ${drillLead}${fastReps}×50 yd strong smooth speed (≈90–95% effort — crisp turnover, not all-out sprint) with 45 sec easy jog/walk rest. ${aeroReps}×150 yd easy aerobic to flush lactate. Cool down ${cd} yd.`,
      drillTokens,
      swimEquipment,
    ),
    dur,
    'HARD',
    [
      `swim_warmup_${wu}yd_easy`,
      ...drillTokens,
      `swim_threshold_${fastReps}x50yd_r45`,
      `swim_aerobic_${aeroReps}x150yd_easy_r20`,
      `swim_cooldown_${cd}yd`,
    ],
    tags,
    'Z4 speed / turnover',
    goalId,
  );
}

export function thresholdSwim(
  day: string,
  totalYards: number,
  goalId: string,
  planWeek?: number,
  drillSlotSalt: number = 0,
  phase?: string,
  swimEquipment?: string[] | null,
): PlannedSession {
  totalYards = snapSwimSessionTotalYdInterval100(totalYards);
  const wu = 300;
  const cd = 200;
  const { mainBudgetYd: main, drillTokens } = pickSwimDrillInset({
    totalYards,
    wuYd: wu,
    cdYd: cd,
    planWeek,
    drillSlotSalt,
    phase,
    sessionKind: 'threshold',
    swimGearLabels: swimEquipment,
  });
  const threshReps = Math.max(4, Math.round((main * 0.55) / 100));
  const aeroReps   = Math.max(3, Math.round((main * 0.45) / 150));
  const dur = Math.round(totalYards / 40); // ~40 yd/min including rest
  const drillLead =
    drillTokens.length > 0
      ? `${swimSessionPhilosophyLead('threshold')}${swimDrillBlockAthleteCopy(drillTokens)} `
      : '';
  const tags: string[] = ['quality', 'threshold', 'swim'];
  if (drillTokens.length) tags.push('swim_drills');
  return session(
    day, 'swim',
    `Swim Threshold — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. ${drillLead}${threshReps}×100 yd at threshold (Zone 4 — maximal sustainable effort) with 15 sec rest. ${aeroReps}×150 yd aerobic. Cool down ${cd} yd.`,
      drillTokens,
      swimEquipment,
    ),
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
/** Caps ×100 main-set reps when yards/main budget are large (slow-swimmer bumps, ceilings). */
export function cssHundredsRepHardCap(
  athleteFitness: 'beginner' | 'intermediate' | 'advanced' | undefined,
  planWeek: number | undefined,
): number {
  const fit = athleteFitness ?? 'intermediate';
  const pw = Math.max(1, planWeek ?? 1);
  const steps = Math.floor((pw - 1) / 2);
  if (fit === 'beginner') return Math.min(14, 10 + steps);
  if (fit === 'intermediate') return Math.min(24, 14 + steps);
  return Math.min(34, 20 + steps);
}

export function cssAerobicSwim(
  day: string,
  totalYards: number,
  goalId: string,
  planWeek?: number,
  drillSlotSalt: number = 0,
  phase?: string,
  options?: {
    raceSupport?: boolean;
    swimEquipment?: string[] | null;
    athleteFitness?: 'beginner' | 'intermediate' | 'advanced';
  },
): PlannedSession {
  totalYards = snapSwimSessionTotalYdInterval100(totalYards);
  const wu = 300;
  const cd = 200;
  const { mainBudgetYd: main, drillTokens } = pickSwimDrillInset({
    totalYards,
    wuYd: wu,
    cdYd: cd,
    planWeek,
    drillSlotSalt,
    phase,
    sessionKind: 'css_aerobic',
    swimGearLabels: options?.swimEquipment,
  });
  const raceSupport = options?.raceSupport ?? false;
  const repCap = cssHundredsRepHardCap(options?.athleteFitness, planWeek);
  const reps = Math.max(5, Math.min(repCap, Math.round(main / 100)));
  const dur = Math.round(totalYards / 42); // slightly faster than easy, slower than threshold
  const drillLead =
    drillTokens.length > 0
      ? `${swimSessionPhilosophyLead('css_aerobic')}${swimDrillBlockAthleteCopy(drillTokens)} `
      : '';
  const tags: string[] = ['quality', 'css_aerobic', 'swim'];
  if (drillTokens.length) tags.push('swim_drills');
  if (raceSupport) tags.push('race_specific_swim');
  const name = raceSupport
    ? `Race-Specific Aerobic Swim — ${totalYards} yd`
    : `CSS Aerobic Swim — ${totalYards} yd`;
  const mainSet = raceSupport
    ? `${reps}×100 yd at sustainable race-swim rhythm (15 sec rest). Where the lane allows, merge into longer unbroken 200–400 yd pieces. Sight every 6–8 strokes; practice breathing to both sides for chop or sun glare. Swim these repeats hands-only by default; paddles optional for a few repeats only if shoulders feel good—not the entire main set.`
    : `${reps}×100 yd at comfortable CSS pace (15 sec rest — sustainable, not maximal). Focus on consistent splits. Hands-only by default; paddles optional for occasional repeats only (not the full set)—protects shoulders on high-volume CSS blocks.`;
  return session(
    day, 'swim',
    name,
    appendPoolGearLine(
      `Warm up ${wu} yd. ${drillLead}${mainSet} Cool down ${cd} yd.`,
      drillTokens,
      options?.swimEquipment,
    ),
    dur, 'MODERATE',
    [`swim_warmup_${wu}yd_easy`, ...drillTokens, `swim_aerobic_css_${reps}x100yd_r15`, `swim_cooldown_${cd}yd`],
    tags,
    'Z3 CSS aerobic', goalId,
  );
}

/** Learning-swimmer recovery: compact Z1–Z2 100s (no drill inset — keeps session short). */
export function recoveryEasySwim(
  day: string,
  totalYards: number,
  goalId: string,
): PlannedSession {
  totalYards = Math.max(650, Math.min(1200, snapSwimSessionTotalYdEasy(totalYards)));
  const wu = 200;
  const cd = 200;
  const mainBudget = Math.max(250, totalYards - wu - cd);
  const reps = Math.max(3, Math.min(8, Math.round(mainBudget / 100)));
  const dur = Math.round(totalYards / 34);
  return session(
    day,
    'swim',
    `Recovery Swim — ${totalYards} yd`,
    `Warm up ${wu} yd easy. ${reps}×100 yd at easy aerobic Z1–Z2 (20 sec rest). Cool down ${cd} yd.`,
    dur,
    'EASY',
    [`swim_warmup_${wu}yd_easy`, `swim_aerobic_${reps}x100yd_easy_r20`, `swim_cooldown_${cd}yd`],
    ['easy', 'aerobic', 'swim', 'recovery_swim'],
    'Z1–Z2',
    goalId,
  );
}

export function easySwim(
  day: string,
  totalYards: number,
  goalId: string,
  planWeek?: number,
  drillSlotSalt: number = 0,
  phase?: string,
  techniqueDrillEmphasis = false,
  swimEquipment?: string[] | null,
): PlannedSession {
  totalYards = snapSwimSessionTotalYdEasy(totalYards);
  const wu = 300;
  const cd = 200;
  const { mainBudgetYd: mainYards, drillTokens } = pickSwimDrillInset({
    totalYards,
    wuYd: wu,
    cdYd: cd,
    planWeek,
    drillSlotSalt,
    phase,
    sessionKind: 'easy',
    techniqueDrillEmphasis,
    swimGearLabels: swimEquipment,
  });
  const reps = Math.max(4, Math.round(mainYards / 150));
  const dur = Math.round(totalYards / 35); // ~35 yd/min for easy
  const drillLead =
    drillTokens.length > 0
      ? `${swimSessionPhilosophyLead('easy')}${swimDrillBlockAthleteCopy(drillTokens)} `
      : '';
  const tags: string[] = ['easy', 'aerobic', 'swim'];
  if (drillTokens.length) tags.push('swim_drills');
  if (techniqueDrillEmphasis) tags.push('technique_swim');
  const title = techniqueDrillEmphasis
    ? `Technique Aerobic Swim — ${totalYards} yd`
    : `Easy Swim — ${totalYards} yd`;
  return session(
    day, 'swim',
    title,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. ${drillLead}${reps}×150 yd at easy aerobic pace. Focus on technique: high elbow catch, bilateral breathing. Cool down ${cd} yd.`,
      drillTokens,
      swimEquipment,
    ),
    dur, 'EASY',
    [`swim_warmup_${wu}yd_easy`, ...drillTokens, `swim_aerobic_${reps}x150yd_easy_r20`, `swim_cooldown_${cd}yd`],
    tags,
    'Z2', goalId,
  );
}

function patchSwimProtocolTss(
  ps: PlannedSession,
  kind: 'kick_focused' | 'endurance' | 'pull_focused',
  raceDistance: SwimDistanceKey,
): PlannedSession {
  const raw = calculateSwimTss(kind, ps.duration, raceDistance);
  return { ...ps, tss: raw, weighted_tss: weightedTSS('swim', raw) };
}

/** Distance-specific kick session — sprint/Olympic kickboard vs 70.3/full fins (protocol v2.1). */
export function kickFocusedSwim(
  day: string,
  totalYards: number,
  goalId: string,
  raceDistance: SwimDistanceKey,
  swimThresholdPace?: string | null,
  swimEquipment?: string[] | null,
): PlannedSession {
  totalYards = snapSwimSessionTotalYdEasy(totalYards);
  const wu = 300;
  const cd = 200;
  const integrationYd = 400;
  let spare = totalYards - wu - cd - integrationYd;
  spare = Math.max(400, spare);
  let kickReps = Math.min(12, Math.max(8, Math.round(spare / 50)));
  while (kickReps > 8 && kickReps * 50 > spare) kickReps -= 1;

  const longCourse = raceDistance === '70.3' || raceDistance === 'full';
  const cssSec = resolveCssSecPer100Yd(swimThresholdPace ?? undefined);
  const paceGuidedMin = Math.round(((totalYards / 100) * cssSec * (longCourse ? 1.28 : 1.15)) / 60);
  const dur = Math.max(Math.round(totalYards / (longCourse ? 36 : 33)), paceGuidedMin);

  const kickSuffix = longCourse ? 'fins' : 'board';
  const intensity: Intensity = longCourse ? 'EASY' : 'MODERATE';
  const kickCopy = longCourse
    ? `${kickReps}×50 yd kick with fins at light–moderate effort (20 sec rest). Focus ankle mobility and streamline — small relaxed kick from hips for rotation support (not a sprint kick).`
    : `${kickReps}×50 yd kick with kickboard at moderate effort (20 sec rest). Narrow kick from hips, toes pointed — quiet legs on the integration lengths.`;
  const integrateCopy = longCourse
    ? `4×100 yd full stroke easy aerobic — practice a relaxed 2-beat kick.`
    : `4×100 yd full stroke easy–moderate — compact, propulsive kick cadence.`;

  const tags: string[] = [
    longCourse ? 'kick_tri_long_course' : 'kick_tri_short_course',
    'kick_focus_swim',
    'easy',
    'aerobic',
    'swim',
    ...(longCourse ? ['req:fins'] : ['req:kickboard']),
  ];

  const ps = session(
    day,
    'swim',
    `Kick-Focused Swim — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. ${kickCopy} ${integrateCopy} Cool down ${cd} yd.`,
      [],
      swimEquipment,
      kickFocusRequiredGear(raceDistance),
    ),
    dur,
    intensity,
    [
      `swim_warmup_${wu}yd_easy`,
      `swim_kick_${kickReps}x50yd_r20_${kickSuffix}`,
      `swim_aerobic_4x100yd_easy_r15`,
      `swim_cooldown_${cd}yd`,
    ],
    tags,
    longCourse ? 'Z1–Z2 kick + aerobic' : 'Z2–Z3 kick + aerobic',
    goalId,
  );
  return patchSwimProtocolTss(ps, 'kick_focused', raceDistance);
}

/** Pull-focused aerobic density — buoy required; optional paddles for intermediate/advanced (protocol v2.1 Z3, IF 0.80). */
export function pullFocusedSwim(
  day: string,
  totalYards: number,
  goalId: string,
  raceDistance: SwimDistanceKey,
  swimThresholdPace?: string | null,
  athleteFitness: 'beginner' | 'intermediate' | 'advanced' = 'intermediate',
  swimEquipment?: string[] | null,
): PlannedSession {
  totalYards = snapSwimSessionTotalYdInterval100(totalYards);
  const wu = 300;
  const cd = 200;
  const integrationYd = 400;
  let spare = totalYards - wu - cd - integrationYd;
  spare = Math.max(400, spare);
  let pullReps = Math.min(14, Math.max(6, Math.round(spare / 100)));
  while (pullReps > 6 && pullReps * 100 > spare) pullReps -= 1;

  const longCourse = raceDistance === '70.3' || raceDistance === 'full';
  const cssSec = resolveCssSecPer100Yd(swimThresholdPace ?? undefined);
  const paceGuidedMin = Math.round(((totalYards / 100) * cssSec * (longCourse ? 1.22 : 1.12)) / 60);
  const dur = Math.max(Math.round(totalYards / (longCourse ? 38 : 35)), paceGuidedMin);

  const paddlesCue =
    athleteFitness === 'beginner'
      ? ''
      : 'Small paddles optional for upper-body overload if comfortable (skip if shoulders feel tight). ';
  const formCue = 'Keep core engaged so hips do not sag.';

  const tags: string[] = ['quality', 'pull_focus_swim', 'swim', 'moderate', 'req:buoy'];
  if (athleteFitness !== 'beginner') tags.push('optional:paddles');

  const pullCopy = `${pullReps}×100 yd pull with buoy at moderate aerobic rhythm (Z3; sustainable steady turnover). 20 sec rest — high-elbow catch feel without kicking.`;
  const integrateCopy =
    '4×100 yd full stroke easy aerobic — reconnect kick and rotation after pull isolation.';

  const ps = session(
    day,
    'swim',
    `Pull-Focused Swim — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. ${pullCopy} ${integrateCopy} Cool down ${cd} yd. ${paddlesCue}${formCue}`,
      [],
      swimEquipment,
      ['pull buoy'],
    ),
    dur,
    'MODERATE',
    [
      `swim_warmup_${wu}yd_easy`,
      `swim_pull_${pullReps}x100yd_r20_buoy`,
      `swim_aerobic_4x100yd_easy_r15`,
      `swim_cooldown_${cd}yd`,
    ],
    tags,
    'Z3 pull + aerobic',
    goalId,
  );
  return patchSwimProtocolTss(ps, 'pull_focused', raceDistance);
}

/** Continuous aerobic endurance swim; optional Full IM advanced over-distance coaching note. */
export function enduranceSwim(
  day: string,
  totalYards: number,
  goalId: string,
  athleteFitness: 'beginner' | 'intermediate' | 'advanced',
  planWeek: number,
  drillSlotSalt: number,
  phase: string,
  swimEquipment?: string[] | null,
  swimThresholdPace?: string | null,
  enduranceOverdistanceNote?: boolean,
): PlannedSession {
  totalYards = snapSwimSessionTotalYdInterval100(totalYards);
  const wu = 400;
  const cd = 200;
  const { mainBudgetYd: main, drillTokens } = pickSwimDrillInset({
    totalYards,
    wuYd: wu,
    cdYd: cd,
    planWeek,
    drillSlotSalt,
    phase,
    sessionKind: 'easy',
    techniqueDrillEmphasis: false,
    swimGearLabels: swimEquipment,
  });
  const mainRounded = Math.max(200, Math.round(main / 50) * 50);

  let structure: string;
  if (athleteFitness === 'beginner') {
    structure = `1×${mainRounded} yd continuous easy aerobic (Z2).`;
  } else if (athleteFitness === 'intermediate') {
    const half = Math.max(100, Math.round(mainRounded / 2 / 50) * 50);
    structure = `2×${half} yd easy aerobic with 30 sec rest between.`;
  } else {
    structure = `1×${mainRounded} yd continuous easy aerobic (Z2).`;
  }
  const odNote =
    enduranceOverdistanceNote && athleteFitness === 'advanced'
      ? ' Over-distance session: stay purely aerobic — durability and confidence, not pace.'
      : '';
  const drillLead =
    drillTokens.length > 0
      ? `${swimSessionPhilosophyLead('easy')}${swimDrillBlockAthleteCopy(drillTokens)} `
      : '';
  const cssSec = resolveCssSecPer100Yd(swimThresholdPace ?? undefined);
  const paceGuidedMin = Math.round(((totalYards / 100) * cssSec * 1.25) / 60);
  const dur = Math.max(Math.round(totalYards / 34), paceGuidedMin);

  const tags: string[] = ['endurance_swim', 'easy', 'aerobic', 'swim'];
  if (enduranceOverdistanceNote && athleteFitness === 'advanced') tags.push('swim_overdistance');

  const ps = session(
    day,
    'swim',
    `Endurance Swim — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. ${drillLead}Main set — ${structure}${odNote} Cool down ${cd} yd.`,
      drillTokens,
      swimEquipment,
    ),
    dur,
    'EASY',
    [
      `swim_warmup_${wu}yd_easy`,
      ...drillTokens,
      `swim_aerobic_1x${mainRounded}yd_easy`,
      `swim_cooldown_${cd}yd`,
    ],
    tags,
    'Z2 endurance',
    goalId,
  );
  return patchSwimProtocolTss(ps, 'endurance', 'full');
}

/** Maps program template rows to concrete swim sessions (combined-plan week-builder). */
export function swimSessionFromTemplate(
  template: SwimSlotTemplate,
  yards: number,
  day: string,
  planWeek: number,
  phase: string,
  goalId: string,
  drillSlotSalt: number,
  swimEquipment?: string[] | null,
  opts?: {
    swimRaceDistanceKey?: SwimDistanceKey;
    athleteFitness?: 'beginner' | 'intermediate' | 'advanced';
    swimThresholdPace?: string | null;
    enduranceOverdistanceNote?: boolean;
  },
): PlannedSession {
  const dk: SwimDistanceKey = opts?.swimRaceDistanceKey ?? '70.3';

  // Equipment-aware substitution: swap pull_focused → endurance when athlete lacks pull buoy,
  // kick_focused → endurance when athlete lacks the distance-specific kick gear (kickboard
  // sprint/oly, fins 70.3/full). Non-substitutable types pass through unchanged.
  const sub = resolveSwimSessionTypeForGear({
    requestedType: template.session_type as
      | 'pull_focused' | 'kick_focused' | 'endurance' | 'easy' | 'css_aerobic'
      | 'threshold' | 'race_specific_aerobic' | 'speed' | 'technique_aerobic',
    athleteGearLabels: swimEquipment,
    kickFocusedRequiredGear: kickFocusRequiredGear(dk),
  });
  const effectiveType = sub.resolvedType;
  if (sub.substituted) {
    console.log('[session-factory] swim session substituted for missing gear', {
      day,
      requested: sub.requestedType,
      resolved: sub.resolvedType,
      missing: sub.missingRequired,
    });
  }

  console.log('[session-factory] creating swim session', {
    plan_week: planWeek,
    day,
    session_type: effectiveType,
    requested_session_type: template.session_type,
    substituted: sub.substituted,
    resolved_yards: yards,
    target_yards_template: template.target_yards,
  });
  const created: PlannedSession = ((): PlannedSession => {
    switch (effectiveType) {
      case 'threshold':
        return thresholdSwim(day, yards, goalId, planWeek, drillSlotSalt, phase, swimEquipment);
      case 'css_aerobic':
        return cssAerobicSwim(day, yards, goalId, planWeek, drillSlotSalt, phase, {
          swimEquipment,
          athleteFitness: opts?.athleteFitness,
        });
      case 'technique_aerobic':
        return easySwim(day, yards, goalId, planWeek, drillSlotSalt, phase, true, swimEquipment);
      case 'race_specific_aerobic':
        return cssAerobicSwim(day, yards, goalId, planWeek, drillSlotSalt, phase, {
          raceSupport: true,
          swimEquipment,
          athleteFitness: opts?.athleteFitness,
        });
      case 'speed':
        return speedSwim(day, yards, goalId, planWeek, drillSlotSalt, phase, swimEquipment);
      case 'kick_focused':
        return kickFocusedSwim(day, yards, goalId, dk, opts?.swimThresholdPace ?? undefined, swimEquipment);
      case 'pull_focused':
        return pullFocusedSwim(
          day,
          yards,
          goalId,
          dk,
          opts?.swimThresholdPace ?? undefined,
          opts?.athleteFitness ?? 'intermediate',
          swimEquipment,
        );
      case 'endurance':
        return enduranceSwim(
          day,
          yards,
          goalId,
          opts?.athleteFitness ?? 'intermediate',
          planWeek,
          drillSlotSalt,
          phase,
          swimEquipment,
          opts?.swimThresholdPace ?? undefined,
          opts?.enduranceOverdistanceNote ?? false,
        );
      case 'easy':
        if (template.recovery_learner_easy_structure) {
          return recoveryEasySwim(day, yards, goalId);
        }
        return easySwim(day, yards, goalId, planWeek, drillSlotSalt, phase, false, swimEquipment);
      default:
        return easySwim(day, yards, goalId, planWeek, drillSlotSalt, phase, false, swimEquipment);
    }
  })();
  console.log('[session-factory] created swim session', {
    session_type: template.session_type,
    created_name: created.name,
  });
  return { ...created, target_yards: yards };
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
  equipmentTier?: 'full_barbell' | 'dumbbell_based' | 'bodyweight_bands';
}): {
  protocol: StrengthProtocol;
  /** True when the equipment-tier gate downgraded the requested protocol to durability. */
  gateDowngraded: boolean;
} {
  const wantedId =
    options.strengthIntent === 'performance' || options.strengthProtocolId === 'triathlon_performance'
      ? 'triathlon_performance'
      : 'triathlon';
  const id = resolveProtocolIdForCombinedTriPlan(
    options.strengthProtocolId,
    options.strengthIntent,
    options.equipmentTier,
  );
  const gateDowngraded = wantedId === 'triathlon_performance' && id === 'triathlon';
  return {
    protocol: id === 'triathlon_performance' ? triathlonPerformanceProtocol : triathlonProtocol,
    gateDowngraded,
  };
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
    base: 'Base',
    build: 'Build',
    race_specific: 'Speed',
    taper: 'Taper',
    recovery: 'Recovery',
    // Rebuild routes through `Rebuild` so triathlon_performance dispatcher can emit
    // scaled-load build sessions (peak × 0.90 +5%/wk) instead of resetting to base week-1 loads.
    rebuild: 'Rebuild',
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
    /** Explicit cable machine access. Barbell home gyms are upgraded to commercial_gym tier but may still lack cable. */
    hasCable?: boolean;
    /** True only when athlete has a GHD, Nordic bench, or fixed floor anchor. Required before prescribing Nordic Hamstring Curls. */
    hasGhd?: boolean;
    /** Calendar long sessions — drives strength placement (default Sat/Sun). */
    longRideDayName?: string;
    longRunDayName?: string;
    /** Actual mid-week quality anchors from athlete_state (not hardcoded Tue/Thu). */
    qualityBikeDayName?: string;
    qualityRunDayName?: string;
    /** Protocol id (triathlon, neural_speed, durability, …). Default: triathlon. */
    strengthProtocolId?: string;
    strengthIntent?: 'support' | 'performance';
    /** Three-tier equipment classification (docs/STRENGTH-PROTOCOL.md §8). When omitted, derived from `equipmentType`. */
    equipmentTier?: 'full_barbell' | 'dumbbell_based' | 'bodyweight_bands';
    /**
     * Athlete's `user_baselines.performance_numbers` (lifted 1RMs etc.). When 1RMs are missing
     * and `strengthIntent === 'performance'`, the spec §5 trade-off is prepended to the session
     * description. Materialize-plan resolves "% 1RM" prescriptions against these values; the
     * trade-off warns the athlete that loads will be conservative until they log 1RMs.
     */
    performanceNumbers?: Record<string, unknown>;
    /** Athlete strength equipment chips (`user_baselines.equipment.strength`). Drives spec §9.3 line. */
    strengthEquipment?: string[];
    /** Heaviest DB pair the athlete owns (per hand, lb). Drives spec §8.2 cap-and-scale-reps. */
    dbMaxLb?: number;
  },
): PlannedSession {
  const longRide = options?.longRideDayName ?? 'Saturday';
  const longRun = options?.longRunDayName ?? 'Sunday';
  const longSessionDays = [...new Set([longRide, longRun])];
  const qb = options?.qualityBikeDayName ?? 'Tuesday';
  const qr = options?.qualityRunDayName ?? 'Thursday';
  const easySessionDays = [...DAYS_OF_WEEK].filter(
    (d) => !longSessionDays.includes(d) && d !== qb,
  );

  // Tier 3: prefer the explicit value when threaded; otherwise derive from the 2-tier equipment_type
  // (commercial_gym → commercial_gym; home_gym → dumbbell_based as a safe default that still gates
  // performance correctly when DBs are present and downgrades only when the upstream resolver
  // already classified bodyweight_bands).
  const equipmentTier3: 'full_barbell' | 'dumbbell_based' | 'bodyweight_bands' =
    options?.equipmentTier ??
    (options?.equipmentType === 'commercial_gym' ? 'full_barbell' : 'dumbbell_based');

  const ctx: ProtocolContext = {
    weekIndex: Math.max(1, options?.weekIndex ?? 1),
    weekInPhase: options?.weekInPhase ?? 1,
    phase: toStrengthPhase(phase),
    totalWeeks: Math.max(1, options?.totalWeeks ?? 20),
    isRecovery: options?.isRecovery ?? false,
    primarySchedule: {
      longSessionDays,
      qualitySessionDays: [...new Set([qb, qr])],
      easySessionDays,
    },
    userBaselines: {
      equipment: options?.equipmentType ?? 'commercial_gym',
      equipmentTier: equipmentTier3,
      hasCable: options?.hasCable ?? (options?.equipmentType !== 'home_gym'),
      hasGHD: options?.hasGhd ?? false,
      hasKettlebell: detectKettlebell(options?.strengthEquipment ?? []),
      hasPullUpBar: detectPullUpBar(options?.strengthEquipment ?? []),
      hasBench: detectBench(options?.strengthEquipment ?? []),
      hasBox: detectBox(options?.strengthEquipment ?? []),
      ...(typeof options?.dbMaxLb === 'number' && options.dbMaxLb > 0
        ? { dbMaxLb: options.dbMaxLb }
        : {}),
      ...((): { squat1RM?: number; deadlift1RM?: number; bench1RM?: number; overhead1RM?: number } => {
        const pn = options?.performanceNumbers;
        if (!pn || typeof pn !== 'object') return {};
        const num = (v: unknown): number | undefined => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : undefined;
        };
        const out: Record<string, number> = {};
        const sq = num(pn.squat ?? pn.squat1RM ?? pn.squat_1rm);
        const dl = num(pn.deadlift ?? pn.dead_lift);
        const bp = num(pn.bench ?? pn.bench_press ?? pn.benchPress);
        const op = num(pn.overheadPress1RM ?? pn.ohp ?? pn.overhead_press ?? pn.overhead);
        if (sq != null) out.squat1RM = sq;
        if (dl != null) out.deadlift1RM = dl;
        if (bp != null) out.bench1RM = bp;
        if (op != null) out.overhead1RM = op;
        return out;
      })(),
    },
    strengthFrequency: 2,
    constraints: {},
    triathlonContext: {
      limiterSport: options?.limiterSport ?? 'run',
      strengthIntent: options?.strengthIntent,
    },
  };

  const { protocol, gateDowngraded } = resolveTriCombinedStrengthProtocol({
    strengthProtocolId: options?.strengthProtocolId,
    strengthIntent: options?.strengthIntent,
    equipmentTier: equipmentTier3,
  });

  if (gateDowngraded) {
    console.log('[strength] equipment-tier gate downgraded performance → durability', {
      equipmentTier: equipmentTier3,
      strengthIntent: options?.strengthIntent,
      strengthProtocolId: options?.strengthProtocolId,
    });
  }

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
  // When the equipment-tier gate fired (spec §2), prepend the trade-off to the chosen session's
  // description and tag the session for downstream UX surfacing. This guarantees the athlete sees
  // why their performance request became durability.
  if (gateDowngraded) {
    const note =
      'Performance strength requires barbell or dumbbell access for progressive loading. ' +
      "With your current equipment we'll deliver the durability protocol instead. " +
      'Add dumbbells or barbell access to unlock the performance protocol.';
    chosen.description = `${note} ${chosen.description}`;
    chosen.tags = [...(chosen.tags ?? []), 'gate:performance_downgraded_no_loadable_resistance'];
  }

  // §5 missing-1RM trade-off: when the athlete asked for performance strength but no compound 1RM
  // is on file, the materializer falls back to bodyweight-based estimates (squat 1.0×BW, DL 1.25×BW,
  // bench 0.75×BW, OHP 0.5×BW). Surface that explicitly so the athlete knows why prescriptions
  // are conservative.
  const wantedPerf =
    options?.strengthIntent === 'performance' || options?.strengthProtocolId === 'triathlon_performance';
  if (wantedPerf && !gateDowngraded) {
    const have = ctx.userBaselines;
    const anyCompound1RM =
      typeof have.squat1RM === 'number' ||
      typeof have.deadlift1RM === 'number' ||
      typeof have.bench1RM === 'number' ||
      typeof have.overhead1RM === 'number';
    if (!anyCompound1RM) {
      const note =
        'Loads will be conservative (bodyweight-based defaults: squat 1.0×BW, deadlift 1.25×BW, ' +
        "bench 0.75×BW, OHP 0.5×BW) until you complete a baseline test or enter your 1RM. " +
        'Log a 1RM in your profile to unlock progressive loading.';
      chosen.description = `${note} ${chosen.description}`;
      chosen.tags = [...(chosen.tags ?? []), 'gate:no_1rm_data_conservative_defaults'];
    }
  }

  // §9.3 equipment summary line — mirror of the swim Pool-gear pattern.
  const exerciseNames = (chosen.exercises ?? []).map((e) => e.name);
  const equipmentLine = buildStrengthEquipmentLine({
    exerciseNames,
    athleteEquipment: options?.strengthEquipment ?? [],
  });
  if (equipmentLine) {
    chosen.description = `${chosen.description} ${equipmentLine}`;
  }

  return intentToPlanned(chosen, day, phase, goalId);
}

export function runStrength(day: string, phase: Phase, goalId: string, options?: {
  weekInPhase?: number;
  weekIndex?: number;
  totalWeeks?: number;
  isRecovery?: boolean;
  equipmentType?: 'home_gym' | 'commercial_gym';
  longRunDayName?: string;
  qualityRunDayName?: string;
}): PlannedSession {
  const protocol = getProtocol('durability');
  const longDay = options?.longRunDayName ?? 'Sunday';
  const q1 = options?.qualityRunDayName ?? 'Tuesday';
  const q2 = shiftWeekday(q1, 2);
  const qualitySessionDays = [...new Set([q1, q2])];
  const easySessionDays = [...DAYS_OF_WEEK].filter(
    (d) => d !== longDay && !qualitySessionDays.includes(d),
  );
  const ctx: ProtocolContext = {
    weekIndex: Math.max(1, options?.weekIndex ?? 1),
    weekInPhase: options?.weekInPhase ?? 1,
    phase: toStrengthPhase(phase),
    totalWeeks: Math.max(1, options?.totalWeeks ?? 20),
    isRecovery: options?.isRecovery ?? false,
    primarySchedule: { longSessionDays: [longDay], qualitySessionDays, easySessionDays },
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
