// generate-combined-plan/session-factory.ts
//
// Generates concrete session objects using the existing token vocabulary
// understood by materialize-plan. Every session has TSS, intensity class,
// zone targets, and steps_preset tokens.

import type { PlannedSession, Phase, Intensity, PlannedStrengthExercise } from './types.ts';
import type { Sport } from './types.ts';
import { estimateSessionTSS, weightedTSS, DAYS_OF_WEEK } from './science.ts';
import type { StrengthProtocol } from '../shared/strength-system/protocols/types.ts';
import { triathlonProtocol } from '../shared/strength-system/protocols/triathlon.ts';
import { triathlonPerformanceProtocol } from '../shared/strength-system/protocols/triathlon_performance.ts';
import { getProtocol } from '../shared/strength-system/protocols/selector.ts';
import { simplePlacementPolicy } from '../shared/strength-system/placement/simple.ts';
import type { ProtocolContext, IntentSession } from '../shared/strength-system/protocols/types.ts';

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

export function intervalRun(day: string, reps: number, phase: Phase, goalId: string): PlannedSession {
  // Periodized interval structure: short/fast in base (neuromuscular priming),
  // progressing to longer/more-specific efforts approaching race day.
  // base:          4-6×800m  @ 5km pace   — fast turnover, short contact time
  // build:         4-6×1200m @ 10km pace  — lactate threshold stimulus
  // race_specific: 3-4×1600m @ threshold  — race-specific pacing + mental rehearsal
  // taper:         2-3×1000m @ race pace  — keep the snap, low accumulation
  let dist: string;
  let pace: string;
  let restNote: string;
  let zoneLabel: string;
  let dur: number;

  if (phase === 'taper') {
    dist = '1000m'; pace = 'race pace'; restNote = '2 min walk/jog recovery'; zoneLabel = 'Z4 race pace'; dur = 45;
    reps = Math.min(reps, 3);
  } else if (phase === 'race_specific') {
    dist = '1600m'; pace = 'threshold / tempo pace'; restNote = '2 min jog recovery'; zoneLabel = 'Z4 threshold'; dur = 70;
    reps = Math.min(reps, 4);
  } else if (phase === 'build') {
    dist = '1200m'; pace = '10km pace'; restNote = '90 sec jog recovery'; zoneLabel = 'Z4–Z5'; dur = 65;
  } else {
    // base — short, fast, neuromuscular
    dist = '800m'; pace = '5km pace'; restNote = '90 sec jog recovery'; zoneLabel = 'Z5'; dur = 55;
  }

  return session(
    day, 'run',
    `Run Intervals — ${reps}×${dist}`,
    `Warm up 10 min easy. ${reps}×${dist} at ${pace} with ${restNote} between. Cool down 10 min. Focus on consistent splits, not all-out.`,
    dur, 'HARD',
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
    ['race_specific', 'marathon_pace', 'run'],
    'Z3 marathon pace', goalId,
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

/**
 * base_first approach — comfortable CSS aerobic pace (Z3).
 * Not maximal CSS threshold — just sustainable race pace.
 * Develops comfort at finish-line speed without lactate stress.
 */
export function cssAerobicSwim(day: string, totalYards: number, goalId: string): PlannedSession {
  const wu = 300;
  const cd = 200;
  const main = totalYards - wu - cd;
  const reps = Math.max(5, Math.round(main / 100));
  const dur  = Math.round(totalYards / 42); // slightly faster than easy, slower than threshold
  return session(
    day, 'swim',
    `CSS Aerobic Swim — ${totalYards} yd`,
    `Warm up ${wu} yd. ${reps}×100 yd at comfortable CSS pace (15 sec rest — sustainable, not maximal). Focus on consistent splits. Cool down ${cd} yd.`,
    dur, 'MODERATE',
    [`swim_warmup_${wu}yd_easy`, `swim_aerobic_css_${reps}x100yd_r15`, `swim_cooldown_${cd}yd`],
    ['quality', 'css_aerobic', 'swim'],
    'Z3 CSS aerobic', goalId,
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
    const m = s.name.match(/(\d+)\s*[×x]/);
    const tempoMi = m ? Math.max(2, Math.min(5, parseInt(m[1], 10) - 1)) : 3;
    next = tempoRun(day, tempoMi, 1.5, goalId);
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

/** Tri combined plans: non-tri protocols (neural_speed, …) override; else performance → triathlon_performance, support → triathlon. */
function resolveTriCombinedStrengthProtocol(options: {
  strengthProtocolId?: string;
  strengthIntent?: 'support' | 'performance';
}): StrengthProtocol {
  const raw = options.strengthProtocolId?.trim() ?? '';
  if (raw && raw !== 'triathlon' && raw !== 'triathlon_performance') {
    try {
      return getProtocol(raw);
    } catch {
      /* fall through */
    }
  }
  if (raw === 'triathlon_performance') return triathlonPerformanceProtocol;
  if (raw === 'triathlon') return triathlonProtocol;
  if (options.strengthIntent === 'performance') return triathlonPerformanceProtocol;
  return triathlonProtocol;
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
    weekIndex: 1,
    weekInPhase: options?.weekInPhase ?? 1,
    phase: toStrengthPhase(phase),
    totalWeeks: 20,
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

export function runStrength(day: string, phase: Phase, goalId: string, options?: { weekInPhase?: number; isRecovery?: boolean; equipmentType?: 'home_gym' | 'commercial_gym' }): PlannedSession {
  const protocol = getProtocol('durability');
  const ctx: ProtocolContext = {
    weekIndex: 1,
    weekInPhase: options?.weekInPhase ?? 1,
    phase: toStrengthPhase(phase),
    totalWeeks: 20,
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
