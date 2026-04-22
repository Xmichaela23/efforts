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
  confidence: 'low' | 'medium' | 'high';
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
const HM_KM = 21.0975;
const RUN_FATIGUE_ON_BIKE = 1.08;
const BIKE_WEEKLY_IMPROV_CAP = 0.2; // 20% max time reduction
const BIKE_WEEKLY_RATE = 0.008; // 0.8% per week
const SWIM_DORMANT_DAYS = 90;
const SWIM_DORMANT_PENALTY = 0.15;
const SWIM_FLOOR_MIN = 35;
const SWIM_DEFAULT_NO_PRIOR = 45;

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

/**
 * Public entry: build a v1 tri projection from explicit inputs.
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

  const prior0 = inputs.prior_result;
  const priorDateMs = prior0?.race_date
    ? new Date(prior0.race_date.slice(0, 10) + 'T12:00:00Z').getTime()
    : NaN;
  const priorAgeOk =
    prior0 &&
    Number.isFinite(priorDateMs) &&
    today.getTime() - priorDateMs <= THREE_Y_MS &&
    today.getTime() >= priorDateMs;

  let swimMin: number;
  let bikeMin: number;
  let runMin: number;
  let t1t2Min: number;
  let anchored = false;
  let priorResultDate: string | undefined;

  if (prior0 && priorAgeOk && prior0.total_seconds > 0) {
    anchored = true;
    priorResultDate = prior0.race_date.slice(0, 10);
    const totalMin = prior0.total_seconds / 60;
    if (prior0.splits) {
      swimMin = prior0.splits.swim_min;
      bikeMin = prior0.splits.bike_min;
      runMin = prior0.splits.run_min;
      t1t2Min = prior0.splits.t1_t2_min ?? totalMin * R703.t1t2;
    } else {
      assumptions.push('Prior splits estimated from default 70.3 ratios (11% / 51% / 35% / 3%).');
      swimMin = totalMin * R703.swim;
      bikeMin = totalMin * R703.bike;
      runMin = totalMin * R703.run;
      t1t2Min = totalMin * R703.t1t2;
    }
  } else {
    assumptions.push('No anchor race within 3y — splits from learned fitness / defaults; confidence is limited.');
    swimMin = SWIM_DEFAULT_NO_PRIOR;
    bikeMin = 180;
    runMin = thr.ok ? (HM_KM * thr.value * RUN_FATIGUE_ON_BIKE) / 60 : 120;
    t1t2Min = 10;
  }

  // Run: prefer current threshold
  if (thr.ok) {
    runMin = (HM_KM * thr.value * RUN_FATIGUE_ON_BIKE) / 60;
    assumptions.push('Run leg uses learned threshold pace with +8% fatigue vs standalone HM pace.');
  } else if (anchored) {
    assumptions.push('No confident learned run threshold — run split kept from prior distribution.');
  }

  // Bike: time improvement from training weeks, then elevation
  if (anchored) {
    const improve = Math.min(BIKE_WEEKLY_IMPROV_CAP, wk * BIKE_WEEKLY_RATE);
    bikeMin = bikeMin * (1 - improve);
  } else if (ftp.ok) {
    // No prior: still scale a neutral bike placeholder slightly with weeks (FTP as fitness proxy is weak for time; keep conservative)
    const improve = Math.min(BIKE_WEEKLY_IMPROV_CAP, wk * BIKE_WEEKLY_RATE);
    bikeMin = Math.max(90, 160 * (1 - improve * 0.5));
  }

  const elevM = Number(inputs.course_data?.elevation_gain_m);
  if (Number.isFinite(elevM) && elevM > 0) {
    const pen = (elevM / 100) * 1; // +1 min / 100 m
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
  if (!anchored && swimMin >= SWIM_DEFAULT_NO_PRIOR - 1) {
    assumptions.push('Swim: default ~45m placeholder — low confidence if no prior race.');
  }

  // Total
  t1t2Min = Math.max(3, t1t2Min);
  let total = swimMin + t1t2Min + bikeMin + runMin;
  if (!Number.isFinite(total) || total < 30) {
    total = 180;
    assumptions.push('Sanity check applied to total time.');
  }

  // Confidence
  let confidence: RaceProjection['confidence'] = 'low';
  if (anchored && thr.ok && ftp.ok) confidence = 'high';
  else if (anchored || (thr.ok && ftp.ok) || (anchored && (thr.ok || ftp.ok))) confidence = 'medium';

  if (anchored && priorResultDate) {
    notes.push(`Anchored to your ${formatHMSFromMinutes(prior0!.total_seconds / 60)} from ${priorResultDate}.`);
  }
  if (ftp.ok) {
    notes.push(
      `Bike split ~${Math.round(bikeMin)}m with current FTP trajectory (~${Math.round(ftp.value)}W reference).`,
    );
  }
  if (swimDays != null && swimDays > SWIM_DORMANT_DAYS) {
    notes.push('Swim may need reintroduction — estimate is conservative.');
  }

  const projection_notes = notes.slice(0, 3);

  return {
    swim_min: round1(swimMin),
    t1_t2_min: round1(t1t2Min),
    bike_min: round1(bikeMin),
    run_min: round1(runMin),
    total_min: round1(total),
    confidence,
    anchored_to_prior: anchored,
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
