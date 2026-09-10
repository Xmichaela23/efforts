/**
 * save-baselines — the numbers the server derives from what the athlete typed.
 *
 * ⛔ THE PHONE SENDS WHAT WAS TYPED; THIS FILE DERIVES; `index.ts` SAVES (2026-09-10,
 * docs/AUDIT-client-decisions-2026-09-10.md H-B01 / H-B02). Until today the phone computed the 5K
 * training paces and the heart-rate zone tables itself and wrote them to `user_baselines`, and the
 * server then read those phone-written numbers first (`compute-workout-analysis` bins every workout's
 * heart rate on `configured_hr_zones.zones_*` before any resolver of its own).
 *
 * Pure: no database, no clock except where passed in, so `derive.test.ts` can pin every output.
 */
import { calculateEffortScore, getPacesFromScore, type TrainingPaces } from '../generate-run-plan/effort-score.ts';
import { deriveFiveKPaceFromRaceTime, resolveFiveKRaceTimeSec } from '../../../src/lib/resolve-current-5k-pace.ts';
import { resolveCurrentLthr } from '../../../src/lib/resolve-current-lthr.ts';
import { resolveCurrentMaxHr } from '../../../src/lib/resolve-current-max-hr.ts';
import { hrZones } from '../_shared/endurance/hr-zones.ts';

// ── 5K → effort score and training paces ────────────────────────────────────────────────────────

export type EffortFields = {
  effort_score: number;
  effort_source_distance: number;
  effort_source_time: number;
  effort_paces: TrainingPaces;
  effort_paces_source: 'calculated';
  /** The DB check constraint allows only 'estimated' | 'verified'. A typed 5K is an estimate. */
  effort_score_status: 'estimated';
  effort_updated_at: string;
};

/**
 * The 5K race time → the `effort_*` columns. ⛔ THE PLAN BUILDER'S OWN FORMULA
 * (`generate-run-plan/effort-score.ts`, the one `create-goal-and-materialize-plan` scores with). The
 * phone copy it replaces gave identical scores and paces for every 5K time checked on 2026-09-10.
 */
export function effortFieldsFromFiveKTimeSec(fiveKTimeSec: number, nowIso: string): EffortFields {
  const score = calculateEffortScore(5000, fiveKTimeSec);
  return {
    effort_score: score,
    effort_source_distance: 5000,
    effort_source_time: Math.round(fiveKTimeSec),
    effort_paces: getPacesFromScore(score),
    effort_paces_source: 'calculated',
    effort_score_status: 'estimated',
    effort_updated_at: nowIso,
  };
}

/** `m:ss` → seconds, or null. An unparseable pace is not a zero pace. */
function parseClock(s: unknown): number | null {
  const m = String(s ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return sec > 0 ? sec : null;
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The quick calibration's typed 5K PACE (per mile, or per km for a metric athlete) → the 5K race
 * clock Baselines keeps. Null when the pace is unusable or not faster than the typed easy pace — a 5K
 * slower than easy is a swapped pair, and storing it would score the wrong field.
 */
export function fiveKClockFromCalibration(input: { fiveKPace: unknown; easyPace?: unknown; metric: boolean }):
  { fiveKTimeSec: number; clock: string } | null {
  const fiveK = parseClock(input.fiveKPace);
  if (!fiveK) return null;
  const easy = input.easyPace == null ? null : parseClock(input.easyPace);
  if (input.easyPace != null && (!easy || fiveK >= easy)) return null;
  const perMile = input.metric ? Math.round(fiveK * 1.60934) : fiveK;
  const fiveKTimeSec = Math.round(perMile * 3.10686);
  return { fiveKTimeSec, clock: formatClock(fiveKTimeSec) };
}

/**
 * The performance numbers as they are saved: what was typed, plus the one derived field, `fiveK_pace`.
 *
 * ⚠️ AN INCOMING `fiveK_pace` IS IGNORED — it is derived, and the phone does not write derived numbers.
 * When the typed 5K yields no pace, the pace already on the row stays (the old save did the same).
 * Unitless paces get the athlete's unit, as the old save did.
 */
export function performanceNumbersForSave(
  typed: Record<string, unknown> | null | undefined,
  stored: Record<string, unknown> | null | undefined,
  metric: boolean,
): Record<string, unknown> {
  const perf: Record<string, unknown> = { ...(typed ?? {}) };
  delete perf.fiveK_pace;
  const derived = deriveFiveKPaceFromRaceTime(perf.fiveK, metric);
  if (derived) perf.fiveK_pace = derived;
  else if (stored && typeof stored.fiveK_pace === 'string') perf.fiveK_pace = stored.fiveK_pace;
  const suffix = metric ? '/km' : '/mi';
  for (const k of ['fiveK_pace', 'easyPace']) {
    const v = perf[k];
    if (typeof v === 'string' && !/\/(mi|km)$/i.test(v)) {
      const m = v.match(/^(\d{1,2}):(\d{2})$/);
      if (m) perf[k] = `${m[1]}:${m[2]}${suffix}`;
    }
  }
  return perf;
}

/** The effort columns for a saved row, or null when the row carries no usable 5K. */
export function effortFieldsForPerformanceNumbers(perf: Record<string, unknown>, nowIso: string): EffortFields | null {
  const sec = resolveFiveKRaceTimeSec({ performance_numbers: perf } as never);
  return sec != null ? effortFieldsFromFiveKTimeSec(sec, nowIso) : null;
}

// ── heart rate → zones ──────────────────────────────────────────────────────────────────────────

/** What the athlete typed. A key that is present sets the value (null clears it); an absent key keeps the stored one. */
export type TypedHeartRate = {
  manual_run_lthr?: number | null;
  manual_run_max_hr?: number | null;
  manual_ride_lthr?: number | null;
  manual_ride_max_hr?: number | null;
  resting_heart_rate?: number | null;
};

export type ZoneModel = 'friel' | 'karvonen' | 'needs_resting' | null;

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function zoneModel(lthr: number | null, maxHr: number | null, resting: number | null): ZoneModel {
  if (lthr && lthr > 100) return 'friel';
  if (maxHr && maxHr > 100 && resting && resting > 30) return 'karvonen';
  if (maxHr && maxHr > 100) return 'needs_resting';
  return null;
}

/**
 * The `configured_hr_zones` object, or null when nothing heart-rate related was typed or changed
 * (the row's zones are then left exactly as they are — Strava's zones included).
 *
 * ⛔ THE ZONE TABLE IS `hrZones` (`_shared/endurance/hr-zones.ts`): Friel from the threshold is
 * `frielRunZones`, the table `compute-workout-analysis` bins on, and Karvonen needs a REAL resting
 * heart rate. The phone used to fill a missing resting heart rate with 60; the server does not invent
 * one, so an athlete with a max and no resting heart rate gets no stored zones and the analysis bins on
 * its own max-heart-rate zones instead.
 *
 * ⛔ THE ANCHORS GO THROUGH THE RESOLVERS, as the phone's did: a typed number wins, then the learned
 * value the resolver trusts. No age estimate (`allowAgeEstimate: false`).
 */
export function hrZoneConfigForSave(input: {
  typed: TypedHeartRate;
  stored: Record<string, unknown> | null | undefined;
  learnedFitness: Record<string, unknown> | null | undefined;
  performanceNumbers: Record<string, unknown> | null | undefined;
  nowIso: string;
}): Record<string, unknown> | null {
  const stored = input.stored ?? {};
  const pick = (k: keyof TypedHeartRate): number | null =>
    Object.prototype.hasOwnProperty.call(input.typed, k) ? positive(input.typed[k]) : positive(stored[k]);
  const m = {
    runLthr: pick('manual_run_lthr'),
    runMax: pick('manual_run_max_hr'),
    rideLthr: pick('manual_ride_lthr'),
    rideMax: pick('manual_ride_max_hr'),
  };
  const restingTyped = Object.prototype.hasOwnProperty.call(input.typed, 'resting_heart_rate');
  const resting = pick('resting_heart_rate');

  const hasManual = !!(m.runLthr || m.runMax || m.rideLthr || m.rideMax);
  const changed =
    m.runLthr !== positive(stored.manual_run_lthr) ||
    m.runMax !== positive(stored.manual_run_max_hr) ||
    m.rideLthr !== positive(stored.manual_ride_lthr) ||
    m.rideMax !== positive(stored.manual_ride_max_hr) ||
    restingTyped;
  if (!hasManual && !changed) return null;

  const lf = input.learnedFitness ?? null;
  const baselinesForHr = {
    learned_fitness: lf,
    performance_numbers: input.performanceNumbers ?? null,
    configured_hr_zones: { manual_run_lthr: m.runLthr, manual_ride_lthr: m.rideLthr },
  } as never;
  const runLthr = m.runLthr || resolveCurrentLthr(baselinesForHr, { sport: 'run' }).bpm || null;
  const rideLthr = m.rideLthr || resolveCurrentLthr(baselinesForHr, { sport: 'ride' }).bpm || null;
  const runMax = m.runMax || resolveCurrentMaxHr({ learned_fitness: lf } as never, { sport: 'run', allowAgeEstimate: false }).bpm || null;
  const rideMax = m.rideMax || resolveCurrentMaxHr({ learned_fitness: lf } as never, { sport: 'ride', allowAgeEstimate: false }).bpm || null;

  const primaryLthr = runLthr || rideLthr;
  const primaryMax = runMax || rideMax;
  const zonesFor = (lthr: number | null, maxHr: number | null) =>
    hrZones(lthr, maxHr, resting)?.map((z) => ({ min: z.min, max: z.max }));

  const cfg: Record<string, unknown> = {
    source: hasManual ? 'manual' : 'learned',
    custom_zones: hasManual,
    updated_at: input.nowIso,
    manual_run_max_hr: m.runMax,
    manual_run_lthr: m.runLthr,
    manual_ride_max_hr: m.rideMax,
    manual_ride_lthr: m.rideLthr,
    // Only when unambiguous: one number cannot speak for two sports (2026-08-20).
    threshold_heart_rate: (runLthr && rideLthr) ? null : primaryLthr,
    max_heart_rate: (runMax && rideMax) ? null : primaryMax,
    resting_heart_rate: resting,
    zones_run_model: zoneModel(runLthr, runMax, resting),
    zones_ride_model: zoneModel(rideLthr, rideMax, resting),
  };
  const zones = zonesFor(primaryLthr, primaryMax);
  const zonesRun = zonesFor(runLthr, runMax);
  const zonesRide = zonesFor(rideLthr, rideMax);
  // The shared array stays (Strava writes the same key); the per-sport arrays are what the analysis prefers.
  if (zones) cfg.zones = zones;
  if (zonesRun) cfg.zones_run = zonesRun;
  if (zonesRide) cfg.zones_ride = zonesRide;
  return cfg;
}
