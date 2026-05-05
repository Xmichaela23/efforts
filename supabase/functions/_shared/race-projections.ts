/**
 * v1 triathlon (70.3-first) finish projection: deterministic, explainable splits for AL + goals.projection.
 */
import type { AthleteIdentity, LearnedFitness } from './arc-context.ts';

export type CourseData = {
  elevation_gain_m?: number;
  [k: string]: unknown;
};

export interface ProjectionInputs {
  learned_fitness: LearnedFitness | null;
  athlete_identity: AthleteIdentity | null;
  /** Optional; reserved for later models */
  athlete_memory?: unknown;
  /** `user_baselines.performance_numbers` (e.g. `swimPace100` mm:ss from Training Baselines) */
  performance_numbers?: Record<string, unknown> | null;
  /** `user_baselines.birthday` (YYYY-MM-DD) when not inside athlete_identity */
  profile_birthday?: string | null;
  /** `user_baselines.gender` */
  profile_gender?: string | null;
  goal: { distance: string; target_date: string; sport: string };
  course_data?: CourseData | null;
  prior_result?: {
    total_seconds: number;
    race_date: string;
    splits?: { swim_min: number; bike_min: number; run_min: number; t1_t2_min?: number };
  };
  weeks_remaining: number;
  /** Last swim ISO date (YYYY-MM-DD) if known; missing → treat as dormant for swim penalty heuristics */
  last_swim_date?: string | null;
}

export interface RaceProjection {
  swim_min: number;
  t1_t2_min: number;
  bike_min: number;
  run_min: number;
  total_min: number;
  /** Total finish time in seconds (same as total_min * 60, rounded). */
  total_sec: number;
  confidence: 'low' | 'medium' | 'high';
  /**
   * True when a valid prior-70.3 finish in window was used for **context** (sanity check
   * vs current projection and/or leg-share fallback). **Not** "projection equals prior" —
   * the primary model is current learned_fitness and baselines.
   */
  anchored_to_prior: boolean;
  prior_result_date?: string;
  assumptions: string[];
  projection_notes: string[];
  projection_model_version: 'v1';
  updated_at: string;
}

const MODEL: RaceProjection['projection_model_version'] = 'v1';
const R703 = { swim: 0.11, bike: 0.51, run: 0.35, t1t2: 0.03 } as const;
const THREE_Y_MS = 3 * 365.25 * 24 * 60 * 60 * 1000;
const RACE_RUN_KM: Record<string, number> = {
  sprint:  5,
  olympic: 10,
  '70.3':  21.0975,
  half:    21.0975,
  ironman: 42.195,
  full:    42.195,
};
const RUN_FATIGUE_BY_DISTANCE: Record<string, number> = {
  sprint:  1.03, // 3% — short bike, legs mostly fresh
  olympic: 1.05, // 5% — moderate fatigue
  '70.3':  1.08, // 8% — well established for half-iron run
  ironman: 1.13, // 13% — marathon off 180 km bike
};
const BIKE_WEEKLY_IMPROV_CAP = 0.2; // 20% max time reduction
const BIKE_WEEKLY_RATE = 0.008; // 0.8% per week
const SWIM_DORMANT_DAYS = 90;
const SWIM_DORMANT_PENALTY = 0.15;
const SWIM_FLOOR_MIN = 35;
/** 70.3 swim: 1.2 mi in meters (projection v1) */
const SWIM_703_DISTANCE_M = 1931;
/** Open water / navigation + conditions (applied to pool-based pace → race swim time) */
const OPEN_WATER_SWIM_FACTOR = 1.1;
/**
 * Median sec/100m (pool) by age+gender for 70.3 tri swim modeling — not race truth, a defensible default.
 * Keys: M18-24, M25-29, …, F18-24, …
 */
export const AGE_GROUP_SWIM_MEDIANS: Record<string, number> = {
  'M18-24': 95,
  'M25-29': 98,
  'M30-34': 100,
  'M35-39': 103,
  'M40-44': 106,
  'M45-49': 109,
  'M50-54': 113,
  'M55-59': 118,
  'M60-64': 124,
  'M65+': 130,
  'F18-24': 103,
  'F25-29': 106,
  'F30-34': 109,
  'F35-39': 112,
  'F40-44': 115,
  'F45-49': 118,
  'F50-54': 122,
  'F55-59': 128,
  'F60-64': 135,
  'F65+': 142,
};

/** Fallback OW swim minutes when no age / no data (rusty, middle-of-pack default) */
const SWIM_FALLBACK_OW_MIN = 48;

/**
 * Average 70.3 bike split (minutes) by age group + gender.
 * Source: ObsTri aggregate across all Ironman 70.3 events (obstri.com).
 * Female 18-49 bands cluster tightly (~189-191 min) due to selection — experienced athletes
 * self-select into the sport; the age slope steepens from 50+.
 * Keys match getAgeGroupKey() output.
 */
export const AGE_GROUP_BIKE_MEDIANS: Record<string, number> = {
  'M18-24': 171, 'M25-29': 174, 'M30-34': 172, 'M35-39': 172,
  'M40-44': 173, 'M45-49': 175, 'M50-54': 177, 'M55-59': 180,
  'M60-64': 184, 'M65+':   189,
  'F18-24': 189, 'F25-29': 190, 'F30-34': 189, 'F35-39': 189,
  'F40-44': 190, 'F45-49': 191, 'F50-54': 193, 'F55-59': 197,
  'F60-64': 200, 'F65+':   209,
};

/** Bike course distance (km) by race distance key. Aliases for 'half' and 'full' included. */
const RACE_BIKE_KM: Record<string, number> = {
  sprint:  20,
  olympic: 40,
  '70.3':  90,
  half:    90,
  ironman: 180,
  full:    180,
};

/**
 * 5-year age band key for AGE_GROUP_SWIM_MEDIANS (e.g. 57 → M55-59, gender M|F).
 */
export function getAgeGroupKey(age: number, gender: 'M' | 'F'): string {
  if (!Number.isFinite(age) || age < 12) return 'M40-44';
  if (age >= 65) return gender === 'F' ? 'F65+' : 'M65+';
  if (age < 25) {
    return gender === 'F' ? 'F18-24' : 'M18-24';
  }
  const start = 5 * Math.floor(age / 5);
  return `${gender}${start}-${start + 4}`;
}

function ageFromBirthYmd(ymd: string | null | undefined, ref: Date): number | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return null;
  const b = new Date(ymd.slice(0, 10) + 'T12:00:00Z');
  if (!Number.isFinite(b.getTime())) return null;
  let a = ref.getUTCFullYear() - b.getUTCFullYear();
  const md = ref.getUTCMonth() - b.getUTCMonth();
  if (md < 0 || (md === 0 && ref.getUTCDate() < b.getUTCDate())) a -= 1;
  return a;
}

function genderMF(ai: AthleteIdentity | null, profileGender: string | null | undefined): 'M' | 'F' {
  const raw = (ai as Record<string, unknown> | null)?.['gender'] ?? profileGender;
  const s = String(raw || '').toLowerCase();
  if (s === 'f' || s === 'female') return 'F';
  return 'M';
}

function birthYmdFromIdentity(ai: AthleteIdentity | null, profile: string | null | undefined): string | null {
  if (profile && /^\d{4}-\d{2}-\d{2}/.test(profile)) return profile.slice(0, 10);
  if (!ai || typeof ai !== 'object') return null;
  const o = ai as Record<string, unknown>;
  for (const k of ['birthday', 'birth_date', 'dob', 'date_of_birth']) {
    const v = o[k];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return null;
}

function parseMMSSToSeconds(s: string | null | undefined): number | null {
  if (s == null || !String(s).trim()) return null;
  const t = String(s).trim();
  const parts = t.split(':').map((p) => parseInt(p, 10));
  if (parts.some((x) => !Number.isFinite(x))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/** sec/100 yd (pool input) → sec/100m for same swimming speed */
function secPer100YdToSecPer100M(secYd: number): number {
  return secYd * (100 / 91.44);
}

/** Pool-time minutes for 70.3 distance from sec/100m, then open-water race factor */
function ow703SwimMinFromSecPer100M(sec100m: number): number {
  const poolMin = (SWIM_703_DISTANCE_M / 100) * (sec100m / 60);
  return poolMin * OPEN_WATER_SWIM_FACTOR;
}

function learnedSwimPaceFromSessions(lf: LearnedFitness | null): { value: number; ok: boolean } {
  if (!lf || typeof lf !== 'object' || Array.isArray(lf)) return { value: 0, ok: false };
  const m = (lf as Record<string, unknown>)['swim_pace_per_100m'];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { value: 0, ok: false };
  const o = m as { value?: unknown; sample_count?: unknown; confidence?: string };
  const sc = Number(o.sample_count) || 0;
  if (sc < 3) return { value: 0, ok: false };
  const c = String(o.confidence || '').toLowerCase();
  if (c === 'low' && sc < 5) return { value: 0, ok: false };
  const v = Number(o.value);
  if (!Number.isFinite(v) || v < 50 || v > 600) return { value: 0, ok: false };
  return { value: v, ok: true };
}

/**
 * Confidence-weighted average across sources. Sources with weight ≤ 0 are ignored.
 * Returns 0 if no valid sources remain.
 */
function weightedAvg(sources: { value: number; weight: number }[]): number {
  const valid = sources.filter((s) => s.weight > 0 && Number.isFinite(s.value) && Number.isFinite(s.weight));
  if (!valid.length) return 0;
  const total = valid.reduce((a, s) => a + s.weight, 0);
  if (total <= 0) return valid[0].value;
  return valid.reduce((a, s) => a + s.value * s.weight, 0) / total;
}

/**
 * FTP (watts) → projected bike split (minutes) for any tri distance.
 *
 * Power-law scaling anchored to a real reference point:
 *   250 W athlete completes a flat 90 km (70.3) in 150 min.
 *   Speed scales as P^0.75 — empirically validated for sustained cycling.
 *
 * A 12% cap on training-weeks improvement prevents runaway optimism
 * on long plans. Always blended with age-group median and any prior split.
 */
function ftpToBikeMin(ftpW: number, distanceKm: number, weeksRemaining: number): number {
  const REF_FTP = 250;
  const REF_MIN_PER_KM = 150 / 90; // 1.667 min/km at reference
  const EXPONENT = 0.75;
  const improveRate = Math.min(0.12, weeksRemaining * 0.006);
  const scaledMinPerKm = REF_MIN_PER_KM * Math.pow(REF_FTP / ftpW, EXPONENT);
  const base = scaledMinPerKm * distanceKm;
  return Math.max(60, Math.round(base * (1 - improveRate)));
}

function performanceNumbersSwimSecPer100m(perf: Record<string, unknown> | null | undefined): number | null {
  if (!perf) return null;
  const p =
    (perf as Record<string, unknown>)['swimPace100'] ??
    (perf as Record<string, unknown>)['swim_pace_100_yd'] ??
    (perf as Record<string, unknown>)['swim_pace_100yd'];
  const secYd = parseMMSSToSeconds(p != null ? String(p) : null);
  if (secYd == null) return null;
  return secPer100YdToSecPer100M(secYd);
}

/**
 * No prior race: resolve 70.3 OW swim leg (minutes) in priority order.
 */
function resolveNoPrior703SwimOwMin(
  inputs: ProjectionInputs,
  today: Date,
  outAssumptions: string[],
): { swimOWMin: number; source: string } {
  const lf = inputs.learned_fitness;
  const ls = learnedSwimPaceFromSessions(lf);
  if (ls.ok) {
    outAssumptions.push('Swim: pace from completed swim data (swim_pace_per_100m, ≥3 sessions).');
    return { swimOWMin: ow703SwimMinFromSecPer100M(ls.value), source: 'learned' };
  }
  const perf = inputs.performance_numbers;
  const mPerf = performanceNumbersSwimSecPer100m(perf);
  if (mPerf != null) {
    outAssumptions.push('Swim: manual 100 yd pace (Training Baselines) → 100m + 70.3 distance + 10% open water.');
    return { swimOWMin: ow703SwimMinFromSecPer100M(mPerf), source: 'performance_numbers' };
  }
  const ymd = birthYmdFromIdentity(inputs.athlete_identity, inputs.profile_birthday ?? null);
  const age = ymd != null ? ageFromBirthYmd(ymd, today) : null;
  const g = genderMF(inputs.athlete_identity, inputs.profile_gender ?? null);
  if (age != null && age >= 15 && age < 100) {
    const key = getAgeGroupKey(age, g);
    const med = AGE_GROUP_SWIM_MEDIANS[key] ?? AGE_GROUP_SWIM_MEDIANS['M40-44'] ?? 106;
    outAssumptions.push(
      `Swim: no pace on file — age-group default (${key} median ~${(med / 60).toFixed(1)} min/100m pool) + 10% open water for 1.2 mi.`,
    );
    return { swimOWMin: ow703SwimMinFromSecPer100M(med), source: 'age_group' };
  }
  outAssumptions.push('Swim: no birthday/pace on file — conservative ~48 min open water placeholder until baselines or swims lock in.');
  return { swimOWMin: SWIM_FALLBACK_OW_MIN, source: 'fallback' };
}

function learnedMetric(
  m: unknown,
): { value: number; ok: boolean } {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { value: 0, ok: false };
  const o = m as { value?: unknown; confidence?: string };
  const c = String(o.confidence || '').toLowerCase();
  if (c === 'low') return { value: 0, ok: false };
  if (c !== 'medium' && c !== 'high') return { value: 0, ok: false };
  const v = Number(o.value);
  if (!Number.isFinite(v) || v <= 0) return { value: 0, ok: false };
  return { value: v, ok: true };
}

function formatHMSFromMinutes(totalMin: number): string {
  const s = Math.round(totalMin * 60);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function daysSinceSwim(lastSwimIso: string | null | undefined, today: Date): number | null {
  if (!lastSwimIso || !/^\d{4}-\d{2}-\d{2}/.test(lastSwimIso)) return null;
  const d = new Date(lastSwimIso.slice(0, 10) + 'T12:00:00Z').getTime();
  if (!Number.isFinite(d)) return null;
  return (today.getTime() - d) / (24 * 60 * 60 * 1000);
}

function isSeventyThreeGoal(dist: string, sport: string): boolean {
  const d = (dist || '').toLowerCase();
  const s = (sport || '').toLowerCase();
  if (s.includes('tri')) return true;
  return d.includes('70.3') || d.includes('70_3') || d.includes('half iron');
}

/** Leg fractions from prior race; falls back to default 70.3 model ratios. */
function prior703LegFractions(
  prior: NonNullable<ProjectionInputs['prior_result']>,
): { swim: number; bike: number; run: number; t1t2: number } {
  const s = prior.splits;
  if (!s) {
    return { swim: R703.swim, bike: R703.bike, run: R703.run, t1t2: R703.t1t2 };
  }
  const t1 = s.t1_t2_min ?? 0;
  const sum = s.swim_min + s.bike_min + s.run_min + t1;
  if (!(sum > 0)) {
    return { swim: R703.swim, bike: R703.bike, run: R703.run, t1t2: R703.t1t2 };
  }
  return {
    swim: s.swim_min / sum,
    bike: s.bike_min / sum,
    run: s.run_min / sum,
    t1t2: t1 / sum,
  };
}

const PRIOR_VS_PRIMARY_PCT = 0.15;

/**
 * Public entry: build a v1 tri projection from explicit inputs.
 * **Primary** model: current `learned_fitness` + baselines. **Prior** result (if any):
 * sanity-check vs that total, and **split-ratio** swim (and run/bike fallbacks only when
 * a metric is missing — never the prior as the headline anchor).
 * Alias: `buildProjectRaceSplits` (same function).
 */
export function projectRaceSplits(inputs: ProjectionInputs): RaceProjection {
  const updated_at = new Date().toISOString();
  const assumptions: string[] = [];
  const notes: string[] = [];
  const wk = Math.max(0, Math.min(52, Math.floor(inputs.weeks_remaining)));
  const today = new Date();

  if (!isSeventyThreeGoal(inputs.goal.distance, inputs.goal.sport)) {
    assumptions.push('Non-70.3 v1: rough estimate using 70.3 split model.');
  }

  const thr = learnedMetric(inputs.learned_fitness?.run_threshold_pace_sec_per_km);
  const ftp = learnedMetric(inputs.learned_fitness?.ride_ftp_estimated);
  const ls = learnedSwimPaceFromSessions(inputs.learned_fitness);
  const perfSw = performanceNumbersSwimSecPer100m(inputs.performance_numbers);

  const prior0 = inputs.prior_result;
  const priorDateMs = prior0?.race_date
    ? new Date(prior0.race_date.slice(0, 10) + 'T12:00:00Z').getTime()
    : NaN;
  const priorAgeOk =
    !!prior0 &&
    prior0.total_seconds > 0 &&
    Number.isFinite(priorDateMs) &&
    today.getTime() - priorDateMs <= THREE_Y_MS &&
    today.getTime() >= priorDateMs;
  const prior = priorAgeOk && prior0 ? prior0 : null;
  const priorTotalMin = prior ? prior.total_seconds / 60 : 0;
  const priorFr = prior ? prior703LegFractions(prior) : null;

  const priorResultDate = prior ? prior.race_date.slice(0, 10) : undefined;
  let usedPriorSwimRatio = false;

  // ── Swim: learned > baselines > prior split share (if no swim pace) > age / fallback
  let swimMin: number;
  if (ls.ok) {
    swimMin = ow703SwimMinFromSecPer100M(ls.value);
    assumptions.push('Swim: pace from completed swim data (swim_pace_per_100m, ≥3 sessions).');
  } else if (perfSw != null) {
    swimMin = ow703SwimMinFromSecPer100M(perfSw);
    assumptions.push('Swim: manual 100 yd pace (Training Baselines) → 100m + 70.3 distance + 10% open water.');
  } else if (prior && priorFr) {
    swimMin = priorTotalMin * priorFr.swim;
    usedPriorSwimRatio = true;
    assumptions.push(
      'Swim: leg time from prior 70.3 split ratios — no ≥3 session swim or baseline pace; bike/run from current data.',
    );
  } else {
    const resolved = resolveNoPrior703SwimOwMin(inputs, today, assumptions);
    swimMin = resolved.swimOWMin;
  }

  // ── Run: current threshold > prior share (only if no threshold) > 120
  const runFatigue = RUN_FATIGUE_BY_DISTANCE[inputs.goal.distance] ?? 1.08;
  let runMin: number;
  if (thr.ok) {
    const runDistKm = RACE_RUN_KM[inputs.goal.distance] ?? 21.0975;
    runMin = (runDistKm * thr.value * runFatigue) / 60;
    assumptions.push(`Run leg uses learned threshold pace with +${Math.round((runFatigue - 1) * 100)}% fatigue vs standalone pace (${inputs.goal.distance} distance).`);
  } else if (prior && priorFr) {
    runMin = priorTotalMin * priorFr.run;
    assumptions.push('Run: no confident learned run threshold — leg share from prior 70.3 as fallback (not a pace target).');
  } else {
    runMin = 120;
  }

  // ── Bike: confidence-weighted blend of age-group average, FTP physics model, prior split
  const improve = Math.min(BIKE_WEEKLY_IMPROV_CAP, wk * BIKE_WEEKLY_RATE);

  const bikeYmd = birthYmdFromIdentity(inputs.athlete_identity, inputs.profile_birthday ?? null);
  const bikeAge = bikeYmd != null ? ageFromBirthYmd(bikeYmd, today) : null;
  const bikeG = genderMF(inputs.athlete_identity, inputs.profile_gender ?? null);
  const bikeKey = bikeAge != null && bikeAge >= 15 && bikeAge < 100
    ? getAgeGroupKey(bikeAge, bikeG)
    : (bikeG === 'F' ? 'F40-44' : 'M40-44');
  const bikeMedian = AGE_GROUP_BIKE_MEDIANS[bikeKey] ?? 173;

  const bikeSources: { value: number; weight: number }[] = [
    { value: bikeMedian, weight: 0.3 },
  ];

  if (ftp.ok) {
    const bikeDistanceKm = RACE_BIKE_KM[inputs.goal.distance] ?? 90;
    const ftpBike = ftpToBikeMin(ftp.value, bikeDistanceKm, wk);
    bikeSources.push({ value: ftpBike, weight: 0.5 });
    assumptions.push(
      `Bike: FTP power-law model → ~${Math.round(ftpBike)} min (${Math.round(ftp.value)}W, ${bikeDistanceKm} km, P^0.75 scaling).`,
    );
  } else {
    assumptions.push(`Bike: no FTP — ${bikeKey} age-group average (~${Math.round(bikeMedian)} min) as baseline (ObsTri).`);
  }

  // Use actual prior bike split if present (higher confidence than derived ratio)
  if (prior && prior.splits?.bike_min && prior.splits.bike_min > 60) {
    const priorBike = Math.max(60, prior.splits.bike_min * (1 - improve));
    bikeSources.push({ value: priorBike, weight: 0.5 });
    assumptions.push(
      `Bike: prior race split (${Math.round(prior.splits.bike_min)} min) blended in with training-weeks trend.`,
    );
  } else if (prior && priorFr && priorTotalMin > 0) {
    const priorBike = Math.max(60, priorTotalMin * priorFr.bike * (1 - improve));
    bikeSources.push({ value: priorBike, weight: 0.3 });
    assumptions.push('Bike: prior race total scaled by leg fraction (no individual bike split on file).');
  }

  let bikeMin = Math.max(90, weightedAvg(bikeSources));

  // ── T1/T2: default model ratio for prior-total, else 10m placeholder
  let t1t2Min: number;
  if (prior && priorFr) {
    t1t2Min = priorTotalMin * priorFr.t1t2;
  } else {
    t1t2Min = 10;
  }

  // Elevation
  const elevM = Number(inputs.course_data?.elevation_gain_m);
  if (Number.isFinite(elevM) && elevM > 0) {
    const pen = (elevM / 100) * 1;
    bikeMin += pen;
    assumptions.push(`Bike elevation penalty +${pen.toFixed(1)} min (~${Math.round(elevM)} m gain in course data).`);
  }

  // Swim: dormant + reintroduction
  const swimDays = daysSinceSwim(inputs.last_swim_date, today);
  if (swimDays != null && swimDays > SWIM_DORMANT_DAYS) {
    swimMin *= 1 + SWIM_DORMANT_PENALTY;
    assumptions.push('Swim: dormant >90d — conservative +15% on swim leg.');
  } else if (swimDays == null) {
    assumptions.push('Swim: no recent swim on file — using conservative treatment.');
  }
  const reintro = Math.min(Math.max(0, swimMin - SWIM_FLOOR_MIN), Math.floor(wk / 2));
  swimMin = Math.max(SWIM_FLOOR_MIN, swimMin - reintro);

  t1t2Min = Math.max(3, t1t2Min);
  let total = swimMin + t1t2Min + bikeMin + runMin;
  if (!Number.isFinite(total) || total < 30) {
    total = 180;
    assumptions.push('Sanity check applied to total time.');
  }

  const totalSec = Math.round(total * 60);
  const priorSec = prior ? prior.total_seconds : 0;
  if (prior && priorSec > 0) {
    const deltaSec = totalSec - priorSec;
    const rel = Math.abs(deltaSec / priorSec);
    if (rel > PRIOR_VS_PRIMARY_PCT) {
      const priorClock = formatHMSFromMinutes(priorSec / 60);
      const pd = priorResultDate ?? '';
      if (deltaSec > 0) {
        notes.push(
          `Slower than your ${priorClock} at ${pd} — current model is ~${(rel * 100).toFixed(0)}% over that time (swim rebuilding, course, or form vs that day are common reasons; projection is from today’s data).`,
        );
      } else {
        notes.push(
          `Faster than your ${priorClock} at ${pd} — current model is ~${(rel * 100).toFixed(0)}% under that time (e.g. run or bike up vs that race; projection is from today’s data).`,
        );
      }
    } else {
      const pd = priorResultDate ?? '';
      notes.push(
        `~${(rel * 100).toFixed(0)}% from your ${formatHMSFromMinutes(
          priorSec / 60,
        )} at ${pd} — plausibility check only; primary total is from current fitness.`,
      );
    }
  }
  if (usedPriorSwimRatio) {
    notes.push('Swim split from prior race ratio — limited recent swim data; total still driven by bike/run and baselines.');
  }
  if (ftp.ok) {
    notes.push(
      `Bike ~${Math.round(bikeMin)}m with FTP reference (~${Math.round(ftp.value)}W) — v1; not a prior-time anchor.`,
    );
  }
  if (swimDays != null && swimDays > SWIM_DORMANT_DAYS) {
    notes.push('Swim may need reintroduction — estimate is conservative.');
  }

  // Confidence: primary from current metrics, not from prior
  let confidence: RaceProjection['confidence'] = 'low';
  if (ls.ok && thr.ok && ftp.ok) confidence = 'high';
  else if ((thr.ok && ftp.ok) || (ls.ok && (thr.ok || ftp.ok)) || (thr.ok && ls.ok)) confidence = 'medium';
  if (usedPriorSwimRatio && confidence === 'high') confidence = 'medium';

  const projection_notes = notes
    .filter((s) => s.length > 0)
    .slice(0, 3);

  return {
    swim_min: round1(swimMin),
    t1_t2_min: round1(t1t2Min),
    bike_min: round1(bikeMin),
    run_min: round1(runMin),
    total_min: round1(total),
    total_sec: totalSec,
    confidence,
    anchored_to_prior: Boolean(prior),
    prior_result_date: priorResultDate,
    assumptions,
    projection_notes,
    projection_model_version: MODEL,
    updated_at,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export const buildProjectRaceSplits = projectRaceSplits;

export function isTriEventGoal(sport: string | null, distance: string | null): boolean {
  const s = (sport || '').toLowerCase();
  const d = (distance || '').toLowerCase();
  if (s.includes('tri')) return true;
  if (d.includes('70.3') || d.includes('140.6') || d.includes('ironman') || d.includes('sprint') || d.includes('olympic')) {
    return true;
  }
  return false;
}

/** Normalize for matching prior results (v1) */
export function normalizeGoalDistanceKey(distance: string | null | undefined): string {
  if (!distance) return '';
  const x = String(distance).toLowerCase().replace(/\s+/g, ' ').trim();
  if (x.includes('70.3') || x.includes('half iron') || x.includes('half-iron') || x === '70.3') return '70.3';
  if (x.includes('140.6') || x.includes('full iron') || (x.includes('ironman') && !x.includes('70'))) return 'ironman';
  if (x.includes('sprint')) return 'sprint';
  if (x.includes('olympic') || x === 'olympic') return 'olympic';
  return x;
}
