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
import { getProtocol, resolveProtocolIdForCombinedTriPlan, isValidProtocol } from '../shared/strength-system/protocols/selector.ts';
import type { ProtocolContext, IntentSession } from '../shared/strength-system/protocols/types.ts';
import { resolveProfile, getTargetRir, type PlanPhaseId } from '../_shared/strength-profiles.ts';
import {
  buildSwimGearLine,
  pickSwimDrillInset,
  resolveSwimSessionTypeForGear,
  swimDrillBlockAthleteCopy,
  swimGearNormalized,
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
  hasValidSwimThresholdPace,
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
  sessionOptional?: string[],
  sessionRecommended?: string[],
  athleteFitness?: 'beginner' | 'intermediate' | 'advanced',
): string {
  const line = buildSwimGearLine({
    drillTokens,
    athleteGearLabels: swimEquipment,
    sessionRequired: sessionRequired ?? [],
    sessionOptional: sessionOptional ?? [],
    sessionRecommended: sessionRecommended ?? [],
    athleteFitness,
  });
  return line ? `${description} ${line}` : description;
}

/**
 * SWIM-PROTOCOL §8.4 — session-type-specific optional gear, filtered to athlete inventory.
 *
 * **Upstream emission contract:** this helper applies the §8.4 per-session-type / per-tier
 * rules and pre-filters against athlete inventory BEFORE returning gear keys for tag
 * emission and description-line surfacing. The downstream `materialize-plan: inferSwimEquipmentPack`
 * just reads the resulting `optional:*` tags — it deliberately never inspects athlete inventory
 * directly (see `:1349` docstring there). Putting the inventory + tier filtering here keeps the
 * tags themselves the source-of-truth for both surfaces (description text and chip).
 *
 * Returns canonical gear keys (`'snorkel'`, `'buoy'`, `'paddles'`) ready to be:
 *   - Emitted as `optional:<key>` tags on the session.
 *   - Passed as `sessionOptional` to `appendPoolGearLine` for the description text.
 *
 * Per-§8.4 rules:
 *   - Snorkel: technique_aerobic / css_aerobic / pull_focused — ALL tiers (when owned).
 *   - Pull buoy: css_aerobic / technique_aerobic — non-beginner ONLY (when owned).
 *     (pull_focused already emits `req:buoy` — required, not optional.)
 *   - Paddles: css_aerobic / threshold — non-beginner ONLY (when owned).
 *     (pull_focused already emits `optional:paddles` directly; this helper skips it to avoid dupe.)
 *   - Recovery: no equipment hint regardless of inventory (§8.4 explicit carve-out).
 */
/**
 * SWIM-PROTOCOL §7.5 — RPE fallback cue when athlete has no CSS pace on file.
 *
 * Returns the §7.5-prescribed sentence verbatim. Caller appends it to the
 * session description for CSS-anchored session types (CSS Aerobic, Threshold,
 * Speed, Race-Specific Aerobic) when `hasValidSwimThresholdPace` is false.
 * RPE-anchored session types (Easy / Technique Aerobic / Pull-Focused /
 * Endurance / Recovery) do NOT receive this cue — their copy is zone-based
 * and reads fine without numeric pace anchor.
 *
 * The cue is one sentence; callers prefix a space when concatenating.
 */
function swimCssFallbackCue(): string {
  return (
    `If you don't have a 100yd pace baseline yet, swim at an effort where you can hold a ` +
    `short conversation but feel like you're working. Aim for the same effort ` +
    `on every repeat — consistency matters more than hitting a specific number.`
  );
}

/**
 * SWIM-PROTOCOL §8.4 (LOCKED 2026-05-22, Fix 1) — session-type-specific RECOMMENDED gear,
 * filtered to athlete inventory.
 *
 * Distinct from `swimSessionOptionalGear`: "recommended" carries a stronger surface
 * signal — "this helps, grab it" vs optional's "fine either way". The §6.6 research
 * is explicit: **fins and paddles are NOT equivalent for beginners**. Fins AID stroke
 * acquisition by holding the swimmer horizontal; paddles AMPLIFY catch error and
 * shoulder load on an undeveloped stroke. The fins-recommended rule is therefore
 * **beginner-only on technique work** — exactly opposite the paddles-suppressed rule.
 *
 * Per-§8.4 rules (2026-05-22 carve-out, beginner-only):
 *   - Fins: technique_aerobic + css_aerobic — BEGINNER tier ONLY (when owned).
 *     Intermediate / advanced surface NOTHING here — they don't need the body-position
 *     aid; §8.4 optional surfacing (snorkel / buoy / paddles via `swimSessionOptionalGear`)
 *     covers their gear story.
 *
 * §5.5 Pull-Focused for beginners explicitly does NOT surface fins — pull-focused work
 * is leg-isolated by design; fins would defeat the purpose.
 *
 * §5.11 Recovery returns empty regardless of tier — movement-quality intent (gear
 * bypasses that).
 *
 * Source: Better Triathlete, Organic Coaching, MyMottiv, Swim Smooth (fin/paddle split).
 */
function swimSessionRecommendedGear(
  sessionType:
    | 'css_aerobic'
    | 'technique_aerobic'
    | 'pull_focused'
    | 'threshold'
    | 'recovery'
    | 'easy'
    | 'speed'
    | 'endurance'
    | 'kick_focused'
    | 'race_specific_aerobic'
    | string,
  athleteFitness: 'beginner' | 'intermediate' | 'advanced' | undefined,
  swimEquipment: string[] | null | undefined,
): string[] {
  if (!swimEquipment) return [];
  if (athleteFitness !== 'beginner') return [];
  const owned = swimGearNormalized(swimEquipment);
  const out: string[] = [];
  if (
    (sessionType === 'technique_aerobic' || sessionType === 'css_aerobic') &&
    owned.has('fins')
  ) {
    out.push('fins');
  }
  return out;
}

function swimSessionOptionalGear(
  sessionType:
    | 'css_aerobic'
    | 'technique_aerobic'
    | 'pull_focused'
    | 'threshold'
    | 'recovery'
    | 'easy'
    | 'speed'
    | 'endurance'
    | 'kick_focused'
    | 'race_specific_aerobic'
    | string,
  athleteFitness: 'beginner' | 'intermediate' | 'advanced' | undefined,
  swimEquipment: string[] | null | undefined,
): string[] {
  if (!swimEquipment) return [];
  const owned = swimGearNormalized(swimEquipment);
  const isBeginner = athleteFitness === 'beginner';
  const out: string[] = [];
  // §8.4 snorkel — all tiers on technique_aerobic / css_aerobic / pull_focused.
  if (
    (sessionType === 'css_aerobic' ||
      sessionType === 'technique_aerobic' ||
      sessionType === 'pull_focused') &&
    owned.has('snorkel')
  ) {
    out.push('snorkel');
  }
  // §8.4 pull buoy — non-beginner on css_aerobic / technique_aerobic.
  // (pull_focused already emits req:buoy independently — required, not optional.)
  if (
    !isBeginner &&
    (sessionType === 'css_aerobic' || sessionType === 'technique_aerobic') &&
    owned.has('pull buoy')
  ) {
    out.push('buoy');
  }
  // §8.4 paddles — non-beginner on css_aerobic / threshold.
  // (pull_focused already emits optional:paddles directly — skip here to avoid dupe.)
  if (
    !isBeginner &&
    (sessionType === 'css_aerobic' || sessionType === 'threshold') &&
    owned.has('paddles')
  ) {
    out.push('paddles');
  }
  return out;
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

/**
 * RUN-PROTOCOL §5.8 — append a stride block to an easy run as a first-class
 * neuromuscular modifier. Pure: returns a new session, does not mutate input.
 * Token `strides_NxYs` is resolved into work + walk-recovery steps by
 * `materialize-plan/index.ts:1222-1257`; +5 min wall-clock accounts for the
 * stride block (mirrors the legacy `tri-generator.ts:596` convention).
 * Intensity stays EASY — strides are accelerations, not speedwork; TSS is
 * re-derived from the longer duration via the same helper the engine uses.
 */
export function addStridesToEasyRun(
  session: PlannedSession,
  opts?: { reps?: number; sec?: number },
): PlannedSession {
  const reps = opts?.reps ?? 4;
  const sec = opts?.sec ?? 20;
  const milesMatch = String(session.name ?? '').match(/—\s*(\d+(?:\.\d+)?)\s*mi/);
  const miles = milesMatch ? milesMatch[1] : '';
  const newName = miles ? `Easy Run + Strides — ${miles} mi` : 'Easy Run + Strides';
  const strideCopy =
    ` After the cool-down, ${reps} × ${sec} sec strides at ~5K pace effort with 30 sec walk recovery. ` +
    `Strides wake up fast-twitch fibers and improve running economy — not speedwork; relaxed and fast.`;
  const newDuration = (session.duration ?? 0) + 5;
  const newTss = estimateSessionTSS(session.type, session.intensity_class, newDuration);
  return {
    ...session,
    name: newName,
    description: `${session.description}${strideCopy}`,
    duration: newDuration,
    tss: newTss,
    weighted_tss: weightedTSS(session.type, newTss),
    steps_preset: [...(session.steps_preset ?? []), `strides_${reps}x${sec}s`],
    tags: Array.from(new Set([...(session.tags ?? []), 'strides'])),
  };
}

/**
 * D-069: Sweet-spot equivalent for running — sustained Z3 effort that's
 * meaningfully harder than easy aerobic but well below lactate threshold.
 * Used as the base-phase quality replacement for `first_race` / `comeback`
 * intent athletes where intervals + threshold are explicitly out of scope
 * per the conservative-build philosophy: their quality stimulus is sustained
 * marathon-pace-ish work, not interval surges.
 */
export function sweetSpotRun(day: string, miles: number, warmupMiles: number, goalId: string): PlannedSession {
  const totalMiles = warmupMiles * 2 + miles;
  const dur = Math.round(totalMiles * 9.2);
  return session(
    day, 'run',
    `Sweet-Spot Run — ${miles} mi at moderate effort`,
    `Warm up ${warmupMiles} mi easy, then ${miles} mi at sustained moderate effort (~RPE 6, conversational in short sentences — meaningfully harder than your easy runs but not threshold). Cool down ${warmupMiles} mi easy. Builds aerobic durability without the recovery cost of intervals.`,
    dur, 'MODERATE',
    [`warmup_run_${Math.round(warmupMiles * 10)}_easy`, `sweet_spot_${miles}mi_moderate`, `cooldown_run_${Math.round(warmupMiles * 10)}_easy`],
    ['quality', 'sweet_spot', 'run'],
    'Z3 sweet spot', goalId,
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
export function vo2Run(day: string, goalId: string, weekInPhase: number = 1): PlannedSession {
  // RUN-PROTOCOL §4.2 VO2max rep ramp across build weeks: 3 → 6 × 3min @ Z5.
  // weekInPhase = 1 → 3 reps; 2 → 4; 3 → 5; 4+ → 6 (clamped).
  // Duration scales: WU+CD ~25min + (rep × 3min) + (rep × 1.5min float) ≈ 30 + 5×N.
  const N = Math.max(3, Math.min(6, 3 + (weekInPhase - 1)));
  const dur = 30 + N * 5;
  return session(
    day, 'run',
    `VO2max Run — ${N}×3 min`,
    `Warm up 10 min easy. ${N}×3 min at Z5 (hard — controlled sprint, not all-out) with 90 sec float recovery. Cool down 10 min. Builds raw aerobic ceiling.`,
    dur, 'HARD',
    ['warmup_run_10min_easy', `run_vo2_${N}x3min_z5`, 'cooldown_run_10min_easy'],
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
/**
 * Anchor-driven quality-bike session selector by phase. CYCLING-PROTOCOL §10.4 within-phase
 * ramps (LOCKED 2026-05-21): rep counts ramp across `weekInPhase` rather than landing flat
 * at peak from week 1.
 *
 * - base → Sweet Spot: `clamp(2, 4, 2 + floor((wip-1)/2))` × 15 min — slower ramp, longer
 *   plateau at 3 reps (sweet spot is not supposed to spike early per §10.4 + user 2026-05-21).
 * - build → Threshold: `clamp(2, 4, 2 + floor((wip-1)/2))` × 20 min — same shape as sweet spot.
 * - race_specific → VO2max: `clamp(3, 6, 3 + (wip-1))` reps × 5 min — faster ramp per §5.6.
 *
 * `weekInPhase` MUST be `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` (the
 * recovery-non-resetting in-phase index). NEVER `weekInBlock` per ADR-0002.
 */
export function groupRideQualityBikeSession(
  day: string,
  phase: Phase,
  weekInPhase: number,
  goalId: string,
): PlannedSession {
  const wip = Math.max(1, Math.round(weekInPhase));
  let inner: PlannedSession;
  if (phase === 'race_specific') {
    const reps = Math.max(3, Math.min(6, 3 + (wip - 1)));
    inner = vo2Bike(day, reps, goalId);
  } else if (phase === 'build') {
    const intervals = Math.max(2, Math.min(4, 2 + Math.floor((wip - 1) / 2)));
    inner = thresholdBike(day, intervals, 20, goalId);
  } else {
    const intervals = Math.max(2, Math.min(4, 2 + Math.floor((wip - 1) / 2)));
    inner = sweetSpotBike(day, intervals, 15, goalId);
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
  athleteFitness?: 'beginner' | 'intermediate' | 'advanced',
  /** §7.5 — when missing/invalid, session appends the RPE fallback cue (defensive — beginners are blocked from speed per §10.2). */
  swimThresholdPace?: string | null,
  /** D-044 item 6 / Q-015 — drill repeat-pick memory. Passed through to pickSwimDrillInset. */
  prevWeekDrillTokens?: Set<string> | null,
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
    athleteFitness,
    prevWeekDrillTokens,
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
  // §7.5 — defensive fallback cue for athletes without CSS pace on file. Beginners
  // are blocked from speedSwim per §10.2 substitution, but the cue is included
  // symmetrically for any non-beginner athlete who somehow reaches it without a CSS.
  const speedCssFallbackCue = !hasValidSwimThresholdPace(swimThresholdPace)
    ? ` ${swimCssFallbackCue()}`
    : '';
  const tags: string[] = ['quality', 'speed_swim', 'swim'];
  if (drillTokens.length) tags.push('swim_drills');
  return session(
    day,
    'swim',
    `Swim Speed / Turnover — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. ${drillLead}${fastReps}×50 yd strong smooth speed (≈90–95% effort — crisp turnover, not all-out sprint) with 45 sec easy jog/walk rest. ${aeroReps}×150 yd easy aerobic to flush lactate. Cool down ${cd} yd.${speedCssFallbackCue}`,
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

/**
 * §7.1 race-week swim — 600-800 yd aerobic activation with 4×50 build accelerations, no
 * threshold repeats. Replaces the race-week Friday threshold session (plan #56 audit item #11):
 * threshold work 2 days before race is contrary to taper physiology. The build accelerations
 * preserve neuromuscular sharpness without lactate accumulation.
 */
export function raceWeekActivationSwim(
  day: string,
  totalYards: number,
  goalId: string,
  swimEquipment?: string[] | null,
): PlannedSession {
  const wu = 300;
  const cd = 200;
  const main = Math.max(200, totalYards - wu - cd);
  const fastReps = 4; // 4 × 50 build accelerations (spec)
  const aeroYd = Math.max(0, main - fastReps * 50);
  const aeroReps = Math.max(2, Math.round(aeroYd / 100));
  const dur = Math.round(totalYards / 35);
  return session(
    day,
    'swim',
    `Race-Week Activation Swim — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. ${fastReps}×50 yd build accelerations (start easy, finish strong; long rest between — pure neuromuscular sharpener, NOT a hard interval). ${aeroReps}×100 yd easy aerobic. Cool down ${cd} yd.`,
      [],
      swimEquipment,
    ),
    dur,
    'EASY',
    [
      `swim_warmup_${wu}yd_easy`,
      `swim_threshold_${fastReps}x50yd_r45`,
      `swim_aerobic_${aeroReps}x100yd_easy_r20`,
      `swim_cooldown_${cd}yd`,
    ],
    ['activation', 'taper', 'swim', 'race_week'],
    'Z1-Z2 with brief build 50s',
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
  athleteFitness?: 'beginner' | 'intermediate' | 'advanced',
  /** §7.5 — when missing/invalid, session appends the RPE fallback cue. Threshold is banned for beginners per §10.2 but the cue covers any non-beginner who reaches it without a CSS. */
  swimThresholdPace?: string | null,
  /** D-044 item 6 / Q-015 — drill repeat-pick memory. */
  prevWeekDrillTokens?: Set<string> | null,
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
    athleteFitness,
    prevWeekDrillTokens,
  });
  const threshReps = Math.max(4, Math.round((main * 0.55) / 100));
  const aeroReps   = Math.max(3, Math.round((main * 0.45) / 150));
  const dur = Math.round(totalYards / 40); // ~40 yd/min including rest
  const drillLead =
    drillTokens.length > 0
      ? `${swimSessionPhilosophyLead('threshold')}${swimDrillBlockAthleteCopy(drillTokens)} `
      : '';
  // §8.4 — Threshold session-level optional gear (paddles for non-beginner when owned).
  const sessionOptional = swimSessionOptionalGear('threshold', athleteFitness, swimEquipment);
  // §7.5 — fallback cue when no CSS pace on file (Z4 IS CSS-anchored implicitly).
  const thresholdCssFallbackCue = !hasValidSwimThresholdPace(swimThresholdPace)
    ? ` ${swimCssFallbackCue()}`
    : '';
  const tags: string[] = ['quality', 'threshold', 'swim'];
  if (drillTokens.length) tags.push('swim_drills');
  for (const g of sessionOptional) tags.push(`optional:${g}`);
  return session(
    day, 'swim',
    `Swim Threshold — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. ${drillLead}${threshReps}×100 yd at hard effort (maximal sustainable — what you can hold for the interval, not past it) with 15 sec rest. ${aeroReps}×150 yd easy aerobic. Cool down ${cd} yd.${thresholdCssFallbackCue}`,
      drillTokens,
      swimEquipment,
      undefined,
      sessionOptional,
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
/**
 * SWIM-PROTOCOL §5.2 tier-adjusted rest interval for CSS Aerobic 100yd repeats.
 * Slice 1 (Fix 3, 2026-05-22) — emits the START of phase (week 1) rest per tier.
 * Slice 2 (Fix 4) layers the within-phase lerp on top via §5.2.1.
 *
 * - Beginner: 25s (per §5.2.1 START, lerps to 20s across base ramp)
 * - Intermediate: 15s (per §5.2.1 START, lerps to 12s across base ramp)
 * - Advanced: 15s (same as intermediate at START; §5.2.1 lerp tightens to 12s/10s)
 *
 * Used as the within-phase fallback when `weekInPhase`/`rampWeeks` aren't threaded
 * (legacy callers; rebuild/taper/recovery phases that don't get the lerp).
 *
 * Race-Specific Aerobic substitution (`raceSupport=true`) bypasses BOTH this
 * helper and the §5.2.1 lerp — its rest is set in-place in the raceSupport
 * main-set string and stays at 15s (the Slice 1 scope decision; revisit if
 * the spec extends §5.2.1 to race-spec substitution copy).
 */
export function cssRestSecByTier(
  athleteFitness: 'beginner' | 'intermediate' | 'advanced' | undefined,
): number {
  return athleteFitness === 'beginner' ? 25 : 15;
}

/**
 * SWIM-PROTOCOL §5.2.1 within-phase rest-interval lerp (LOCKED 2026-05-22).
 * Slice 2 (Fix 4) — rest tightens across the phase ramp as the athlete adapts
 * (220 Triathlon CSS progression). Same `phaseProgress` mechanism as the run-
 * arc §4.5 volume ramp (D-026 / D-027); same ADR-0002 footgun applies —
 * `weekInPhase` MUST be `weekInPhaseForTimeline(phaseBlocks, weekNum, block)`,
 * NEVER `weekInBlock` (always 1).
 *
 * Endpoints per spec §5.2.1 (rest seconds, START → PEAK across the ramp window):
 *
 *   |              | base (6wk) | build (4wk) | race_specific (4wk) |
 *   | beginner     |  25 → 20   |  20 (flat)  |  n/a (D-025 sub)    |
 *   | intermediate |  15 → 12   |  12 → 10    |  10 (flat)          |
 *   | advanced     |  15 → 12   |  12 → 10    |  10 (flat)          |
 *
 * Non-ramp phases (rebuild / taper / recovery) fall back to {@link cssRestSecByTier} —
 * cssAerobicSwim isn't typically called for these phases in normal flow, but the
 * fallback keeps the helper total-coverage for safety.
 *
 * Validator-floor implication: swim rest is a within-session prescription, NOT a
 * weekly-volume floor. No D-027-style two-layer Math.max trap applies; single-
 * layer fix at the session-factory site only.
 */
export function cssRestSecByPhaseWeek(
  tier: 'beginner' | 'intermediate' | 'advanced' | undefined,
  phase: string | undefined,
  weekInPhase: number,
  rampWeeks: number,
): number {
  const phaseKey = String(phase ?? '').trim().toLowerCase().replace(/-/g, '_');
  const endpoints = ((): { start: number; peak: number } | null => {
    if (tier === 'beginner') {
      if (phaseKey === 'base') return { start: 25, peak: 20 };
      if (phaseKey === 'build') return { start: 20, peak: 20 };
      return null; // race_specific n/a per D-025; rebuild/taper/recovery → tier fallback
    }
    // intermediate / advanced / undefined (defaults to intermediate)
    if (phaseKey === 'base') return { start: 15, peak: 12 };
    if (phaseKey === 'build') return { start: 12, peak: 10 };
    if (phaseKey === 'race_specific' || phaseKey === 'racespecific') return { start: 10, peak: 10 };
    return null;
  })();
  if (!endpoints) return cssRestSecByTier(tier);
  // Local phaseProgress + lerp — same shape as `science.ts:runPhaseProgress` / `lerp`,
  // inlined here to avoid a cross-module import for two trivial helpers.
  const w = Math.max(1, Math.round(weekInPhase));
  const rw = Math.max(1, Math.round(rampWeeks));
  const t = rw <= 1 ? 1 : Math.min(1, Math.max(0, (w - 1) / (rw - 1)));
  return Math.round(endpoints.start + (endpoints.peak - endpoints.start) * t);
}

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
    /** §7.5 — when missing/invalid, session appends the RPE fallback cue. */
    swimThresholdPace?: string | null;
    /**
     * §5.2.1 within-phase rest-interval lerp (Slice 2, Fix 4). When BOTH
     * `weekInPhase` AND `rampWeeks` are provided AND `raceSupport=false`,
     * rest routes through `cssRestSecByPhaseWeek` (tightens across the
     * phase ramp). When either is omitted, falls back to `cssRestSecByTier`
     * (START of phase per Slice 1). `weekInPhase` MUST be
     * `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` per ADR-0002.
     */
    weekInPhase?: number;
    rampWeeks?: number;
    /** D-044 item 6 / Q-015 — drill repeat-pick memory. */
    prevWeekDrillTokens?: Set<string> | null;
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
    athleteFitness: options?.athleteFitness,
    prevWeekDrillTokens: options?.prevWeekDrillTokens,
  });
  const raceSupport = options?.raceSupport ?? false;
  const repCap = cssHundredsRepHardCap(options?.athleteFitness, planWeek);
  const reps = Math.max(5, Math.min(repCap, Math.round(main / 100)));
  const dur = Math.round(totalYards / 42); // slightly faster than easy, slower than threshold
  const drillLead =
    drillTokens.length > 0
      ? `${swimSessionPhilosophyLead('css_aerobic')}${swimDrillBlockAthleteCopy(drillTokens)} `
      : '';
  // §8.4 — CSS Aerobic session-level optional gear: snorkel (all tiers when owned);
  // buoy + paddles (non-beginner only when owned). Race-spec aerobic substitution
  // routes through this same function; per §8.4 spec, race-spec is NOT in the optional
  // gear table, so when raceSupport=true we suppress the session-level optionals
  // (the description text already lists "paddles optional for a few repeats" inline).
  const sessionOptional = raceSupport
    ? []
    : swimSessionOptionalGear('css_aerobic', options?.athleteFitness, options?.swimEquipment);
  // §8.4 + §6.6 (2026-05-22, Fix 1) — beginner-only fins recommendation on CSS Aerobic.
  // raceSupport branch (Race-Specific Aerobic substitution) is beginner-banned upstream
  // by D-025; even so, we suppress recommended gear there for symmetry with the
  // sessionOptional suppression above (the inline copy already speaks to gear).
  const sessionRecommended = raceSupport
    ? []
    : swimSessionRecommendedGear('css_aerobic', options?.athleteFitness, options?.swimEquipment);
  // §7.5 — when no CSS pace is on file, surface the RPE fallback cue so the
  // athlete has actionable effort guidance in place of the implicit numeric anchor.
  const cssFallbackCue = !hasValidSwimThresholdPace(options?.swimThresholdPace)
    ? ` ${swimCssFallbackCue()}`
    : '';
  // §5.4 — open-water race-specific elements layer onto Race-Specific Aerobic
  // sessions in race_specific phase only. Beginners never reach this branch (D-025
  // routes them to technique_aerobic). Build/base raceSupport sessions keep the
  // standard race-rhythm copy; race-spec adds bilateral-breathing prescription +
  // drafting awareness on top of the existing sighting cadence.
  const phaseNorm = String(phase ?? '').trim().toLowerCase().replace(/-/g, '_');
  const isRaceSpecificPhase = phaseNorm === 'race_specific' || phaseNorm === 'racespecific';
  const owElementsCue =
    raceSupport && isRaceSpecificPhase
      ? ` Bilateral breathing on at least half the repeats (alternate sides every 3rd or 5th stroke) so race-day chop or sun glare doesn't dictate which side you're stuck on. If you have access to swim with a group, practice both lead (no draft) and feet/hip-side draft positions — drafting can save ~10–15% of your effort on race day.`
      : '';
  const tags: string[] = ['quality', 'css_aerobic', 'swim'];
  if (drillTokens.length) tags.push('swim_drills');
  if (raceSupport) tags.push('race_specific_swim');
  for (const g of sessionOptional) tags.push(`optional:${g}`);
  for (const g of sessionRecommended) tags.push(`recommended:${g}`);
  const name = raceSupport
    ? `Race-Specific Aerobic Swim — ${totalYards} yd`
    : `Moderate Aerobic Swim — ${totalYards} yd`;
  // §5.2 tier-adjusted rest (Slice 1, Fix 3) + §5.2.1 within-phase lerp (Slice 2,
  // Fix 4). When both `weekInPhase` AND `rampWeeks` are threaded AND `raceSupport`
  // is false, route through the lerp; otherwise fall back to the tier helper
  // (START of phase). raceSupport branch keeps the inline 15s string unchanged
  // per the Slice 1 scope decision.
  const cssRestSec = (options?.weekInPhase != null && options?.rampWeeks != null && !raceSupport)
    ? cssRestSecByPhaseWeek(options.athleteFitness, phase, options.weekInPhase, options.rampWeeks)
    : cssRestSecByTier(options?.athleteFitness);
  const mainSet = raceSupport
    ? `${reps}×100 yd at sustainable race-swim rhythm (15 sec rest). Where the lane allows, merge into longer unbroken 200–400 yd pieces. Sight every 6–8 strokes; practice breathing to both sides for chop or sun glare. Swim these repeats hands-only by default; paddles optional for a few repeats only if shoulders feel good—not the entire main set.`
    : `${reps}×100 yd at moderate effort — sustainable and conversational (${cssRestSec} sec rest). Focus on consistent splits. Hands-only by default; paddles optional for occasional repeats only (not the full set)—protects shoulders on high-volume aerobic blocks.`;
  const cssRestToken = raceSupport ? 15 : cssRestSec;
  return session(
    day, 'swim',
    name,
    appendPoolGearLine(
      `Warm up ${wu} yd. ${drillLead}${mainSet} Cool down ${cd} yd.${owElementsCue}${cssFallbackCue}`,
      drillTokens,
      options?.swimEquipment,
      undefined,
      sessionOptional,
      sessionRecommended,
      options?.athleteFitness,
    ),
    dur, 'MODERATE',
    [`swim_warmup_${wu}yd_easy`, ...drillTokens, `swim_aerobic_css_${reps}x100yd_r${cssRestToken}`, `swim_cooldown_${cd}yd`],
    tags,
    'Z3 moderate aerobic', goalId,
  );
}

/**
 * Recovery swim. Intermediate/advanced: compact Z1–Z2 100s, no drill inset
 * (keeps the session short — fatigue-flush over technique). Beginner:
 * drill-led structure per SWIM-PROTOCOL §5.11 beginner variant —
 * `WU 200 → 4 × (50 drill + 50 full stroke) → CD 200`, single foundation
 * drill chosen via the picker. Beginner recovery is essentially a low-
 * volume technique session, not a fatigue-relief session.
 */
export function recoveryEasySwim(
  day: string,
  totalYards: number,
  goalId: string,
  athleteFitness?: 'beginner' | 'intermediate' | 'advanced',
  planWeek?: number,
  drillSlotSalt: number = 0,
  phase?: string,
  swimEquipment?: string[] | null,
  /** D-044 item 6 / Q-015 — drill repeat-pick memory. */
  prevWeekDrillTokens?: Set<string> | null,
): PlannedSession {
  totalYards = Math.max(650, Math.min(1200, snapSwimSessionTotalYdEasy(totalYards)));
  const wu = 200;
  const cd = 200;
  const dur = Math.round(totalYards / 34);

  // SWIM-PROTOCOL §5.11 beginner variant — drill-led structure.
  if (athleteFitness === 'beginner' && planWeek != null) {
    const { drillTokens } = pickSwimDrillInset({
      totalYards,
      wuYd: wu,
      cdYd: cd,
      planWeek,
      drillSlotSalt,
      phase,
      sessionKind: 'recovery',
      swimGearLabels: swimEquipment,
      athleteFitness: 'beginner',
      prevWeekDrillTokens,
    });
    if (drillTokens.length > 0) {
      // Each repeat alternates 50yd drill / 50yd full stroke. The drill block in
      // the token list represents the drill side of the alternation; main repeats
      // pair with full-stroke 50s. Spec: 4 × (50 drill + 50 stroke) ≈ 400yd main.
      const drillCopy = swimDrillBlockAthleteCopy(drillTokens);
      const tags = ['easy', 'aerobic', 'swim', 'recovery_swim', 'swim_drills', 'technique_swim'];
      return session(
        day,
        'swim',
        `Recovery Swim — ${totalYards} yd`,
        appendPoolGearLine(
          `Warm up ${wu} yd easy. ${drillCopy} 4 × (50 yd drill + 50 yd full stroke easy) at easy effort — drill side reinforces the cue, full-stroke side carries it into normal swimming. Cool down ${cd} yd.`,
          drillTokens,
          swimEquipment,
        ),
        dur,
        'EASY',
        [`swim_warmup_${wu}yd_easy`, ...drillTokens, `swim_aerobic_4x100yd_easy_r20`, `swim_cooldown_${cd}yd`],
        tags,
        'Z1',
        goalId,
      );
    }
  }

  // Intermediate / advanced (and beginner-with-no-plan-context fallback) — original behavior preserved.
  const mainBudget = Math.max(250, totalYards - wu - cd);
  const reps = Math.max(3, Math.min(8, Math.round(mainBudget / 100)));
  return session(
    day,
    'swim',
    `Recovery Swim — ${totalYards} yd`,
    `Warm up ${wu} yd easy. ${reps}×100 yd at easy aerobic effort (20 sec rest). Cool down ${cd} yd.`,
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
  athleteFitness?: 'beginner' | 'intermediate' | 'advanced',
  /** D-044 item 6 / Q-015 — drill repeat-pick memory. */
  prevWeekDrillTokens?: Set<string> | null,
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
    athleteFitness,
    prevWeekDrillTokens,
  });
  const reps = Math.max(4, Math.round(mainYards / 150));
  const dur = Math.round(totalYards / 35); // ~35 yd/min for easy
  const drillLead =
    drillTokens.length > 0
      ? `${swimSessionPhilosophyLead('easy')}${swimDrillBlockAthleteCopy(drillTokens)} `
      : '';
  // §8.4 — Technique Aerobic session-level optional gear (snorkel all tiers, buoy
  // non-beginner). Only emit when techniqueDrillEmphasis=true (the Technique Aerobic
  // session); plain easy_swim doesn't carry §8.4 optionals.
  const sessionOptional = techniqueDrillEmphasis
    ? swimSessionOptionalGear('technique_aerobic', athleteFitness, swimEquipment)
    : [];
  // §8.4 + §6.6 (2026-05-22, Fix 1) — beginner-only fins recommendation on Technique
  // Aerobic. Empty for non-beginner and for plain easySwim (without drillEmphasis).
  const sessionRecommended = techniqueDrillEmphasis
    ? swimSessionRecommendedGear('technique_aerobic', athleteFitness, swimEquipment)
    : [];
  const tags: string[] = ['easy', 'aerobic', 'swim'];
  if (drillTokens.length) tags.push('swim_drills');
  if (techniqueDrillEmphasis) tags.push('technique_swim');
  for (const g of sessionOptional) tags.push(`optional:${g}`);
  for (const g of sessionRecommended) tags.push(`recommended:${g}`);
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
      undefined,
      sessionOptional,
      sessionRecommended,
      athleteFitness,
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
  planWeek?: number,
  drillSlotSalt: number = 0,
  phase?: string,
  /** D-044 item 6 / Q-015 — drill repeat-pick memory. */
  prevWeekDrillTokens?: Set<string> | null,
): PlannedSession {
  totalYards = snapSwimSessionTotalYdInterval100(totalYards);
  const wu = 300;
  const cd = 200;
  const integrationYd = 400;

  // SWIM-PROTOCOL §5.5 — emit a drill block before the pull repeats. Spec
  // baseline: 100yd intermediate/advanced; beginner variant: 200yd 2-drill
  // one-focus. Drives through pickSwimDrillInset's beginner override for
  // sessionKind='pull_focused' when athleteFitness='beginner'; falls through
  // to Path B (single drill ~100yd) for intermediate/advanced.
  const { mainBudgetYd: postDrillBudget, drillTokens } = (planWeek != null)
    ? pickSwimDrillInset({
        totalYards,
        wuYd: wu,
        cdYd: cd + integrationYd, // treat integration as cooldown-like for budget math
        planWeek,
        drillSlotSalt,
        phase,
        sessionKind: 'pull_focused',
        swimGearLabels: swimEquipment,
        athleteFitness,
        prevWeekDrillTokens,
      })
    : { mainBudgetYd: totalYards - wu - cd - integrationYd, drillTokens: [] as string[] };

  let spare = Math.max(400, postDrillBudget);
  let pullReps = Math.min(14, Math.max(6, Math.round(spare / 100)));
  while (pullReps > 6 && pullReps * 100 > spare) pullReps -= 1;
  // Beginner variant: lighter pull volume per §5.5 — 4-6 × 100yd.
  if (athleteFitness === 'beginner') {
    pullReps = Math.min(6, Math.max(4, pullReps));
  }

  const longCourse = raceDistance === '70.3' || raceDistance === 'full';
  const cssSec = resolveCssSecPer100Yd(swimThresholdPace ?? undefined);
  const paceGuidedMin = Math.round(((totalYards / 100) * cssSec * (longCourse ? 1.22 : 1.12)) / 60);
  const dur = Math.max(Math.round(totalYards / (longCourse ? 38 : 35)), paceGuidedMin);

  const paddlesCue =
    athleteFitness === 'beginner'
      ? ''
      : 'Small paddles optional for upper-body overload if comfortable (skip if shoulders feel tight). ';
  const formCue = 'Keep core engaged so hips do not sag.';

  // §8.4 — Pull-Focused session-level optional gear (snorkel all tiers when owned).
  // Pull buoy is already req:buoy; paddles is emitted directly below per the existing
  // non-beginner rule. swimSessionOptionalGear returns only `snorkel` for pull_focused
  // (it intentionally skips paddles to avoid duping the explicit emission here).
  const sessionOptional = swimSessionOptionalGear('pull_focused', athleteFitness, swimEquipment);
  const tags: string[] = ['quality', 'pull_focus_swim', 'swim', 'moderate', 'req:buoy'];
  if (athleteFitness !== 'beginner') tags.push('optional:paddles');
  // D-058 / Q-020 — beginner body-position pairing per SWIM-PROTOCOL §6.4.
  // Pull buoy + ankle band forces horizontal posture through core + balanced
  // rotation (the swimmer can't kick to compensate for poor alignment). Only
  // surface when the athlete owns the gear AND is beginner-tier.
  if (athleteFitness === 'beginner' && swimGearNormalized(swimEquipment).has('ankle band')) {
    tags.push('optional:ankle_band');
  }
  if (drillTokens.length) tags.push('swim_drills');
  for (const g of sessionOptional) tags.push(`optional:${g}`);

  const drillLead =
    drillTokens.length > 0
      ? `${swimDrillBlockAthleteCopy(drillTokens)} `
      : '';
  const pullCopy = `${pullReps}×100 yd pull with buoy at moderate aerobic rhythm (sustainable steady turnover). 20 sec rest — high-elbow catch feel without kicking.`;
  const integrateCopy =
    '4×100 yd full stroke easy aerobic — reconnect kick and rotation after pull isolation.';

  // §8.4 — surface the snorkel optional in the description text. Paddles already
  // flows in via the existing `optional:paddles` tag → drill-equipment / sessionOptional
  // path; we pass it explicitly here too so the line reads "Optional: Paddles, Snorkel"
  // for an intermediate athlete owning both, matching the chip surface.
  const pullSessionOptionalForLine =
    athleteFitness !== 'beginner' && swimGearNormalized(swimEquipment).has('paddles')
      ? ['paddles', ...sessionOptional]
      : sessionOptional;
  const ps = session(
    day,
    'swim',
    `Pull-Focused Swim — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. ${drillLead}${pullCopy} ${integrateCopy} Cool down ${cd} yd. ${paddlesCue}${formCue}`,
      drillTokens,
      swimEquipment,
      ['pull buoy'],
      pullSessionOptionalForLine,
    ),
    dur,
    'MODERATE',
    [
      `swim_warmup_${wu}yd_easy`,
      ...drillTokens,
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
  /** D-044 item 6 / Q-015 — drill repeat-pick memory. */
  prevWeekDrillTokens?: Set<string> | null,
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
    athleteFitness,
    prevWeekDrillTokens,
  });
  const mainRounded = Math.max(200, Math.round(main / 50) * 50);

  let structure: string;
  if (athleteFitness === 'beginner') {
    structure = `1×${mainRounded} yd continuous easy aerobic.`;
  } else if (athleteFitness === 'intermediate') {
    const half = Math.max(100, Math.round(mainRounded / 2 / 50) * 50);
    structure = `2×${half} yd easy aerobic with 30 sec rest between.`;
  } else {
    structure = `1×${mainRounded} yd continuous easy aerobic.`;
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
    /** §8.6 Gap 6: true only when this week IS a RaceAnchor week. Gates the
     *  threshold→activation substitution to the actual race week (a multi-week
     *  A-taper's earlier week(s) must keep Race-Spec Light, not de-load early). */
    isRaceWeek?: boolean;
    /** §5.2.1 within-phase rest-interval lerp (Slice 2). MUST be
     *  `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` per ADR-0002. */
    weekInPhase?: number;
    /** §5.2.1 within-phase rest-interval lerp (Slice 2). Companion to `weekInPhase`;
     *  typically `rampWeeksForPhase(phase)` from science.ts. */
    rampWeeks?: number;
    /** D-044 item 6 / Q-015 — drill repeat-pick memory. Forwarded into each
     *  underlying swim creator → pickSwimDrillInset. */
    prevWeekDrillTokens?: Set<string> | null;
  },
): PlannedSession {
  const dk: SwimDistanceKey = opts?.swimRaceDistanceKey ?? '70.3';

  // Equipment-aware substitution: swap pull_focused → endurance when athlete lacks pull buoy,
  // kick_focused → endurance when athlete lacks the distance-specific kick gear (kickboard
  // sprint/oly, fins 70.3/full). Non-substitutable types pass through unchanged.
  const sub = resolveSwimSessionTypeForGear({
    // D-052 / Item 3 — the 4 new types (time_trial / open_water_skills /
    // mixed_fartlek / race_pace_sustained) aren't gear-substitutable; cast
    // covers them by widening the union for the resolver call.
    requestedType: template.session_type as
      | 'pull_focused' | 'kick_focused' | 'endurance' | 'easy' | 'css_aerobic'
      | 'threshold' | 'race_specific_aerobic' | 'speed' | 'technique_aerobic'
      | 'time_trial' | 'open_water_skills' | 'mixed_fartlek' | 'race_pace_sustained',
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
    // §7.1 / plan #56 audit item 11 + RACE-WEEK-PROTOCOL §8.6 (Gap 6): a threshold
    // swim ~2 days before the race is contrary to taper physiology — substitute to a
    // 600-800 yd aerobic activation (4×50 build accelerations + easy aerobic).
    // SCOPED TO THE ACTUAL RACE WEEK ONLY (`opts.isRaceWeek`): after Phase 3 the
    // A-taper is genuinely 2 weeks; its earlier (non-race) week must keep SWIM §4.4
    // Race-Spec Light / threshold — do NOT de-load swim a week early.
    if (effectiveType === 'threshold' && phase === 'taper' && opts?.isRaceWeek) {
      const activationYards = Math.max(600, Math.min(800, yards));
      return raceWeekActivationSwim(day, activationYards, goalId, swimEquipment);
    }
    switch (effectiveType) {
      case 'threshold':
        return thresholdSwim(
          day, yards, goalId, planWeek, drillSlotSalt, phase, swimEquipment, opts?.athleteFitness,
          opts?.swimThresholdPace,
          opts?.prevWeekDrillTokens,
        );
      case 'css_aerobic':
        return cssAerobicSwim(day, yards, goalId, planWeek, drillSlotSalt, phase, {
          swimEquipment,
          athleteFitness: opts?.athleteFitness,
          swimThresholdPace: opts?.swimThresholdPace,
          weekInPhase: opts?.weekInPhase,
          rampWeeks: opts?.rampWeeks,
          prevWeekDrillTokens: opts?.prevWeekDrillTokens,
        });
      case 'technique_aerobic':
        return easySwim(day, yards, goalId, planWeek, drillSlotSalt, phase, true, swimEquipment, opts?.athleteFitness, opts?.prevWeekDrillTokens);
      case 'race_specific_aerobic':
        return cssAerobicSwim(day, yards, goalId, planWeek, drillSlotSalt, phase, {
          raceSupport: true,
          swimEquipment,
          athleteFitness: opts?.athleteFitness,
          swimThresholdPace: opts?.swimThresholdPace,
          prevWeekDrillTokens: opts?.prevWeekDrillTokens,
        });
      case 'speed':
        return speedSwim(
          day, yards, goalId, planWeek, drillSlotSalt, phase, swimEquipment, opts?.athleteFitness,
          opts?.swimThresholdPace,
          opts?.prevWeekDrillTokens,
        );
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
          planWeek,
          drillSlotSalt,
          phase,
          opts?.prevWeekDrillTokens,
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
          opts?.prevWeekDrillTokens,
        );
      case 'easy':
        if (template.recovery_learner_easy_structure) {
          return recoveryEasySwim(
            day,
            yards,
            goalId,
            opts?.athleteFitness,
            planWeek,
            drillSlotSalt,
            phase,
            swimEquipment,
            opts?.prevWeekDrillTokens,
          );
        }
        return easySwim(day, yards, goalId, planWeek, drillSlotSalt, phase, false, swimEquipment, opts?.athleteFitness, opts?.prevWeekDrillTokens);
      // D-052 / Item 3 — SWIM-PROTOCOL §5.7-§5.10 dispatch cases. All four
      // are beginner-banned upstream (phaseSpecificMetaSubstitution is a
      // no-op for beginners) — they should never reach this dispatcher with
      // an athleteFitness='beginner' template. Defensive cast OK.
      case 'time_trial':
        return timeTrialSwim(day, goalId, swimEquipment);
      case 'open_water_skills':
        return openWaterSkillsSwim(day, yards, goalId, swimEquipment);
      case 'mixed_fartlek':
        return mixedFartlekSwim(
          day, yards, goalId, planWeek, drillSlotSalt, phase,
          swimEquipment, opts?.prevWeekDrillTokens,
        );
      case 'race_pace_sustained':
        return racePaceSustainedSwim(
          day, yards, goalId, planWeek, drillSlotSalt, phase,
          swimEquipment, opts?.swimThresholdPace, opts?.prevWeekDrillTokens,
        );
      default:
        return easySwim(day, yards, goalId, planWeek, drillSlotSalt, phase, false, swimEquipment, opts?.athleteFitness, opts?.prevWeekDrillTokens);
    }
  })();
  console.log('[session-factory] created swim session', {
    session_type: template.session_type,
    created_name: created.name,
  });
  return { ...created, target_yards: yards };
}

/** Open water skills practice — ocean/lake chop, sighting, wetsuit comfort (tri-specific). */
/**
 * SWIM-PROTOCOL §5.8 — Time Trial. CSS measurement / race rehearsal.
 *
 * Structure: WU 500 with build → 400yd max effort → 4 min rest → 200yd max
 * effort → CD 300. Total = 1400yd (fixed). Engine derives new CSS from
 * (T400 − T200) / 200 (per §7.4 formula). Banned for beginners per §10.2.
 *
 * D-052 / Item 3 (2026-05-25).
 */
export function timeTrialSwim(
  day: string,
  goalId: string,
  swimEquipment?: string[] | null,
): PlannedSession {
  const wu = 500;
  const cd = 300;
  const totalYards = 1400;
  const dur = Math.round(totalYards / 36); // race-effort tempo + recovery rests
  return session(
    day,
    'swim',
    `Swim Time Trial — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd with progressive build (last 100 at moderate effort). 400 yd MAX effort — sustained hard, hold form. 4 min easy recovery (back-and-forth jogs or float). 200 yd MAX effort — leave nothing. Cool down ${cd} yd easy. The engine will recompute your 100yd pace target from these two splits.`,
      [],
      swimEquipment,
    ),
    dur,
    'HARD',
    [
      `swim_warmup_${wu}yd_build`,
      `swim_time_trial_400yd_max`,
      `swim_recovery_4min`,
      `swim_time_trial_200yd_max`,
      `swim_cooldown_${cd}yd`,
    ],
    ['quality', 'time_trial', 'swim', 'css_test'],
    'Z4-Z5 max effort',
    goalId,
  );
}

/**
 * SWIM-PROTOCOL §5.9 — Open Water Skills. Sighting, wetsuit comfort,
 * group-swim rehearsal. Race-specific phase primarily; skip-optional when
 * no open-water access (engine surfaces trade-off).
 *
 * Structure: open water or pool with sighting every 6 strokes throughout +
 * race-start hard 100yd bouts settling into pace. Banned for beginners.
 *
 * D-052 / Item 3 (2026-05-25).
 */
export function openWaterSkillsSwim(
  day: string,
  totalYards: number,
  goalId: string,
  swimEquipment?: string[] | null,
): PlannedSession {
  totalYards = Math.max(2000, Math.min(3000, snapSwimSessionTotalYdInterval100(totalYards)));
  const wu = 300;
  const cd = 200;
  const main = totalYards - wu - cd;
  // 4-6 race-start hard 100s + sustained Z2-Z3 between.
  const startBouts = Math.max(4, Math.min(6, Math.round(main / 400)));
  const aerobicYards = main - startBouts * 100;
  const aerobicReps = Math.max(4, Math.round(aerobicYards / 200));
  const dur = Math.round(totalYards / 38);
  return session(
    day,
    'swim',
    `Open Water Skills — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. Open water if accessible — otherwise pool with sighting every 6 strokes throughout the main set. ${startBouts}×100 yd at race-start hard effort (settle into race pace by the end of each 100), 30 sec rest. ${aerobicReps}×200 yd at race-rhythm sustained effort with sighting every 6 strokes — bilateral breathing alternating sides. Cool down ${cd} yd easy. If you have access to a group, practice both lead position and drafting (feet/hip-side).`,
      [],
      swimEquipment,
    ),
    dur,
    'MODERATE',
    [
      `swim_warmup_${wu}yd_easy`,
      `swim_open_water_${startBouts}x100yd_start_hard_r30`,
      `swim_open_water_${aerobicReps}x200yd_sustained`,
      `swim_cooldown_${cd}yd`,
    ],
    ['quality', 'open_water_skills', 'swim', 'race_specific_swim'],
    'Z2-Z3 sustained with race-start surges',
    goalId,
  );
}

/**
 * SWIM-PROTOCOL §5.7 — Mixed/Fartlek. Pace variation, race-readiness,
 * breaks monotony. Build phase primarily.
 *
 * Structure: WU 300 → drills (100yd, single block) → 4×400 Z2-Z4 building
 * → CD 200. Total ~2200yd. Banned for beginners per §10.2.
 *
 * D-052 / Item 3 (2026-05-25).
 */
export function mixedFartlekSwim(
  day: string,
  totalYards: number,
  goalId: string,
  planWeek?: number,
  drillSlotSalt: number = 0,
  phase?: string,
  swimEquipment?: string[] | null,
  prevWeekDrillTokens?: Set<string> | null,
): PlannedSession {
  totalYards = snapSwimSessionTotalYdInterval100(totalYards);
  const wu = 300;
  const cd = 200;
  // Reuse the picker for the single 100yd drill block; sessionKind='threshold'
  // routes Path B (single drill) which matches §5.7's drill posture.
  const { mainBudgetYd: main, drillTokens } = pickSwimDrillInset({
    totalYards,
    wuYd: wu,
    cdYd: cd,
    planWeek,
    drillSlotSalt,
    phase,
    sessionKind: 'threshold',
    swimGearLabels: swimEquipment,
    prevWeekDrillTokens,
  });
  const fartlekReps = Math.max(3, Math.min(5, Math.round(main / 400)));
  const fartlekYards = fartlekReps * 400;
  const dur = Math.round(totalYards / 36);
  const drillLead = drillTokens.length > 0
    ? `${swimSessionPhilosophyLead('threshold')}${swimDrillBlockAthleteCopy(drillTokens)} `
    : '';
  return session(
    day,
    'swim',
    `Mixed/Fartlek Swim — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. ${drillLead}${fartlekReps}×400 yd building intensity within each 400 — first 100 easy aerobic, second 100 moderate, third 100 race-rhythm, fourth 100 hard but controlled. 30 sec rest between. Cool down ${cd} yd easy.`,
      drillTokens,
      swimEquipment,
    ),
    dur,
    'MODERATE',
    [
      `swim_warmup_${wu}yd_easy`,
      ...drillTokens,
      `swim_fartlek_${fartlekReps}x400yd_build_r30`,
      `swim_cooldown_${cd}yd`,
    ],
    drillTokens.length > 0
      ? ['quality', 'mixed_fartlek', 'swim', 'swim_drills']
      : ['quality', 'mixed_fartlek', 'swim'],
    'Z2-Z4 building per 400',
    goalId,
  );
}

/**
 * SWIM-PROTOCOL §5.10 — Race-Pace Sustained. Sustained race-effort
 * intervals at race distance. Race-specific phase only.
 *
 * Structure: WU 300 → drills (100yd, single block) → 3-4×600yd at race
 * pace, 45s rest → CD 300. Total ~2500yd. Banned for beginners per §10.2.
 *
 * D-052 / Item 3 (2026-05-25).
 */
export function racePaceSustainedSwim(
  day: string,
  totalYards: number,
  goalId: string,
  planWeek?: number,
  drillSlotSalt: number = 0,
  phase?: string,
  swimEquipment?: string[] | null,
  swimThresholdPace?: string | null,
  prevWeekDrillTokens?: Set<string> | null,
): PlannedSession {
  totalYards = snapSwimSessionTotalYdInterval100(totalYards);
  const wu = 300;
  const cd = 300;
  const { mainBudgetYd: main, drillTokens } = pickSwimDrillInset({
    totalYards,
    wuYd: wu,
    cdYd: cd,
    planWeek,
    drillSlotSalt,
    phase,
    sessionKind: 'threshold',
    swimGearLabels: swimEquipment,
    prevWeekDrillTokens,
  });
  const reps = Math.max(3, Math.min(4, Math.round(main / 600)));
  const dur = Math.round(totalYards / 38);
  const drillLead = drillTokens.length > 0
    ? `${swimSessionPhilosophyLead('threshold')}${swimDrillBlockAthleteCopy(drillTokens)} `
    : '';
  const cssFallback = !hasValidSwimThresholdPace(swimThresholdPace)
    ? ` ${swimCssFallbackCue()}`
    : '';
  return session(
    day,
    'swim',
    `Race-Pace Sustained Swim — ${totalYards} yd`,
    appendPoolGearLine(
      `Warm up ${wu} yd easy. ${drillLead}${reps}×600 yd at race pace (sustainable hard — what you can hold for the race-distance swim). 45 sec rest between. Cool down ${cd} yd easy.${cssFallback}`,
      drillTokens,
      swimEquipment,
    ),
    dur,
    'HARD',
    [
      `swim_warmup_${wu}yd_easy`,
      ...drillTokens,
      `swim_race_pace_${reps}x600yd_r45`,
      `swim_cooldown_${cd}yd`,
    ],
    drillTokens.length > 0
      ? ['quality', 'race_pace_sustained', 'swim', 'swim_drills', 'race_specific_swim']
      : ['quality', 'race_pace_sustained', 'swim', 'race_specific_swim'],
    'Z4 race pace',
    goalId,
  );
}

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

  // D-049 / Cycling Phase 2 (CYCLING-PROTOCOL.md §4.3) — race-specific brick
  // bike emits structured Z2 base + race-pace closing block (~30 min at
  // expected race IF, 0.78-0.82 for 70.3 / 0.62-0.68 for full IM). Previously
  // the whole bike leg was tagged Z3 throughout, which is hotter than spec.
  // Structured form fires only when the bike leg is long enough to support
  // a meaningful closing block (>= 60 min total) — shorter race-specific
  // bricks (early-season / olympic) stay on the single-zone tag.
  const useStructuredRS = isRS && bikeMin >= 60;
  const closingMin = useStructuredRS ? Math.min(45, Math.max(20, Math.round(bikeMin * 0.25))) : 0;
  const baseMin = useStructuredRS ? bikeMin - closingMin : bikeMin;
  const rsBikeCopy = useStructuredRS
    ? `Race-simulation brick — ride ${baseMin} min at Zone 2 to build durability, then close with ${closingMin} min at expected race power (Z3, ~0.78-0.82 IF for 70.3 / 0.62-0.68 IF for full IM). Stay aero through the close. Transition quickly into the run.`
    : `Race-simulation bike at Zone 3 (race pace). Stay aero. Transition quickly into the run.`;
  const rsBikeSteps = useStructuredRS
    ? [`bike_endurance_${baseMin}min_Z2`, `bike_race_pace_${closingMin}min_Z3`]
    : [`bike_endurance_${bikeMin}min_Z3`];

  const bikeSession = session(
    day, 'bike',
    `Brick — Bike ${bikeHours.toFixed(1)} hr`,
    isRS
      ? rsBikeCopy
      : `Brick bike at Zone 2. Build leg feel for the transition. Maintain steady power throughout.`,
    bikeMin,
    bikeIntensity,
    isRS ? rsBikeSteps : [`bike_endurance_${bikeMin}min_Z2`],
    ['brick', 'bike', isRS ? 'race_specific' : 'build'],
    isRS ? (useStructuredRS ? 'Z2 with Z3 close' : 'Z3') : 'Z2',
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
        // D-065: SWIM-PROTOCOL §0.5 — athlete-facing description must not leak
        // Z-codes. zone_targets above is internal-only and stays. The downgrade
        // wrapper runs across all sport types here; "comfortably hard" reads
        // correctly for bike/run/swim equally.
        'Moderate sustained effort (comfortably hard). ' + s.description,
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
  // 5×5 Cut 2: honor an explicit, REGISTERED strength protocol that the tri intent-resolution doesn't
  // handle (i.e. anything other than the two tri protocols) — route it directly; the module handles its
  // own equipment scaling (db-prescription), so no tier gate. Unset / a tri id / an unregistered id (e.g.
  // five_by_five before it is registered) all fall through to the existing logic below → byte-identical.
  const explicitId = options.strengthProtocolId;
  if (explicitId && explicitId !== 'triathlon' && explicitId !== 'triathlon_performance' && isValidProtocol(explicitId)) {
    return { protocol: getProtocol(explicitId), gateDowngraded: false };
  }
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
    // Retest (D-213 Cut 1): non-race sharpen/test terminal → strength is primed/reduced, taper-shaped.
    // Dead until a producer emits 'retest' (Cut 4).
    retest: 'Taper',
  };
  const name = nameMap[phase] ?? 'Base';
  console.log(`[strength] combined-plan phase=${phase} → strength phase name=${name}`);
  return { name, start_week: 1, end_week: 4, weeks_in_phase: 4 };
}

// Converts a protocol IntentSession to a PlannedSession for the combined plan
// Maps the combined-plan Phase vocabulary to the strength RIR-phase vocabulary (PlanPhaseId). The one
// that matters: `race_specific` is the SHARPEN/peak block (toStrengthPhase calls it 'Speed'), so its
// target RIR tightens toward failure. `rebuild` is scaled-load build; `retest` is taper-shaped.
function phaseToPlanPhaseId(phase: Phase): PlanPhaseId {
  switch (phase) {
    case 'base': return 'base';
    case 'build': return 'build';
    case 'race_specific': return 'peak';
    case 'taper': return 'taper';
    case 'recovery': return 'recovery';
    case 'rebuild': return 'build';
    case 'retest': return 'taper';
    default: return 'build';
  }
}

function intentToPlanned(
  intent: IntentSession,
  day: string,
  phase: Phase,
  goalId: string,
  protocolId?: string | null,
): PlannedSession {
  // Step 0 (adapt-plan foundation): the strength prescription must carry the RIR target the athlete is
  // graded against, so the logger preloads the SAME number the analyzer/adapt-plan judge. Resolve it
  // once here — lift-aware (lower vs upper) + phase-aware — and stamp it below when the protocol
  // session did not already pin a per-exercise target. One source, both ends.
  const rirProfile = resolveProfile(protocolId);
  const rirPhase = phaseToPlanPhaseId(phase);
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
        const exName = String(e?.name ?? 'Exercise');
        const pinnedRir = typeof e?.target_rir === 'number' ? (e.target_rir as number) : null;
        return {
          name: exName,
          sets: typeof e?.sets === 'number' ? e.sets as number : undefined,
          reps: e?.reps as number | string | undefined,
          weight: e?.weight as string | number | undefined,
          percent_1rm: typeof e?.percent_1rm === 'number' ? (e.percent_1rm as number) : undefined,
          load: e?.load as { percent_1rm?: number } | undefined,
          // Stamp the graded target: honour an explicit per-exercise RIR, else the protocol's
          // lift-aware base modulated by phase. Now the logger preloads what the analyzer grades.
          target_rir: getTargetRir(rirProfile, exName, pinnedRir, rirPhase),
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

  return intentToPlanned(chosen, day, phase, goalId, options?.strengthProtocolId);
}

export function runStrength(day: string, phase: Phase, goalId: string, options?: {
  weekInPhase?: number;
  weekIndex?: number;
  totalWeeks?: number;
  isRecovery?: boolean;
  equipmentType?: 'home_gym' | 'commercial_gym';
  longRunDayName?: string;
  qualityRunDayName?: string;
  strengthProtocolId?: string; // D-210/5×5 Cut 1: the athlete's chosen strength protocol (was hardcoded to durability)
  sessionIndex?: number; // Q-089: which weekly session this slot emits (mirror triathlonStrength); was always sessions[0]
}): PlannedSession {
  // D-210/5×5 Cut 1: honor the chosen strength protocol (threaded from training_prefs, the same source the
  // tri path reads); unknown/unset id → fall back to 'durability' (today's behavior → byte-identical).
  const requestedId = options?.strengthProtocolId;
  const protocol = getProtocol(requestedId && isValidProtocol(requestedId) ? requestedId : 'durability');
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
  // Q-089: pick the slot's session (was always sessions[0] → both weekly slots emitted a duplicate and
  // sessions[1] was never produced — e.g. 5×5 Workout A twice, no B). Mirrors triathlonStrength.
  const idx = options?.sessionIndex ?? 0;
  const chosen = sessions[Math.min(idx, sessions.length - 1)] ?? sessions[0];
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
  return intentToPlanned(chosen, day, phase, goalId, options?.strengthProtocolId);
}
