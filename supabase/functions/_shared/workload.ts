/**
 * Shared workload calculation formulas
 *
 * Single source of truth used by:
 *   - calculate-workload (canonical, full data)
 *   - get-week (self-healing fallback, partial data)
 *
 * All formulas live here. Callers adapt their data shapes before calling in.
 */

// THE app's exercise vocabulary. Pricing a set has to know whether a band on the row is the LOAD or
// is HELP, and only the exercise says which — so this asks the one vocabulary rather than matching
// names again (audit F5: five name-matchers already).
import { canonicalize, bandMeansAssistance } from './canonicalize.ts';

// ---------------------------------------------------------------------------
// Intensity factor tables
// ---------------------------------------------------------------------------

export const INTENSITY_FACTORS: Record<string, Record<string, number>> = {
  run: {
    easypace: 0.65, warmup_run_easy: 0.65, cooldown_easy: 0.65,
    longrun_easypace: 0.70,
    // The MP-finish long run: harder than an easy long run, and it was falling to the generic
    // per-type default (0.75) because no key matched `longrun_18mi_mp_finish` at all.
    longrun_mp_finish: 0.82,
    '5kpace_plus1:00': 0.85, '5kpace_plus0:50': 0.87,
    '5kpace_plus0:45': 0.88, '5kpace_plus0:35': 0.90,
    '5kpace': 0.95, '10kpace': 0.90, marathon_pace: 0.82,
    speed: 1.10, strides: 1.05, interval: 0.95, tempo: 0.88, cruise: 0.88,
    // Gap B (2026-07-05): the generator's actual easy/warmup/MP token families
    // (run_easy_50min, warmup_run_quality_12min, run_mp_4mi) were not substrings of any
    // key above, so they silently fell to the 0.75 per-type default — reading HOTTER than
    // a prescribed easy run (0.65). Added as substring keys; checked AFTER the specific
    // keys above so quality/long-run tokens still win the max. run_easy→easypace parity.
    run_easy: 0.65, warmup_run_quality: 0.65, run_mp: 0.82,
    // 2026-07-27 — surfaced by the new unmatched-token warning, which is the point of making the
    // fallback loud. Both families were silently taking the 0.75 per-type default.
    //   • `run_vo2_6x3min` → VO2 intervals. Priced with the table's own `interval` row.
    //   • `run_hills_...` → the hard aerobic session for the run-only athlete.
    //     ⚠️⚠️ **0.90 IS PROVISIONAL AND IT IS MINE, NOT THE FIELD'S.** The DIRECTION is sourced —
    //     uphill at matched metabolic cost lowers loading rate and peak vertical GRF by 4-8%
    //     (J Biomech 2020 iso-efficiency), which is the whole reason the doctrine chose hills over
    //     flat intervals. But nothing measured says the WORKLOAD factor is 0.90 rather than 0.88 or
    //     0.92; it is `run_vo2` minus a gap I chose to express "cheaper than flat, still hard".
    //     ⛔ Do not cite this number as derived. Either replace it with a measured one or leave the
    //     marker — an unmarked invented coefficient is how the ATR block accumulated eight of them.
    run_vo2: 0.95, run_hills: 0.90,
  },
  ride: {
    Z1: 0.55, recovery: 0.55, Z2: 0.70, endurance: 0.70,
    warmup_bike: 0.60, cooldown_bike: 0.60,
    tempo: 0.80, ss: 0.90, thr: 1.00, vo2: 1.15, anaerobic: 1.20, neuro: 1.10,
  },
  bike: {
    Z1: 0.55, recovery: 0.55, Z2: 0.70, endurance: 0.70,
    warmup_bike: 0.60, cooldown_bike: 0.60,
    tempo: 0.80, ss: 0.90, thr: 1.00, vo2: 1.15, anaerobic: 1.20, neuro: 1.10,
  },
  swim: {
    warmup: 0.60, cooldown: 0.60, drill: 0.50, easy: 0.65,
    aerobic: 0.75, pull: 0.70, kick: 0.75, threshold: 0.95, interval: 1.00,
  },
  strength: {
    '@pct60': 0.70, '@pct65': 0.75, '@pct70': 0.80, '@pct75': 0.85,
    '@pct80': 0.90, '@pct85': 0.95, '@pct90': 1.00,
    main_: 0.85, acc_: 0.70, core_: 0.60, bodyweight: 0.65,
  },
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function getDefaultIntensityForType(type: string): number {
  const defaults: Record<string, number> = {
    run: 0.75, ride: 0.70, bike: 0.70, swim: 0.75,
    strength: 0.75, mobility: 0.60, pilates_yoga: 0.75, walk: 0.40,
  };
  return defaults[type] || 0.75;
}

// ---------------------------------------------------------------------------
// Steps-preset intensity
// ---------------------------------------------------------------------------

/**
 * ⛔ STRIP THE INTERPOLATED PARTS BEFORE MATCHING. Added 2026-07-27.
 *
 * Tokens carry their quantity in the MIDDLE — `longrun_18mi_easypace`, `longrun_108min_easypace`,
 * `run_easy_72min` — so a key naming the FAMILY (`longrun_easypace`) can never appear as a
 * contiguous substring of a real token. That is why `longrun_easypace: 0.70` matched nothing in any
 * generator for the life of the table. Normalising removes the whole class: any future
 * `family_<quantity>_qualifier` shape resolves to `family_qualifier` without another fix.
 *
 * `18mi` → dropped · `108min` → dropped · `4x180s` → dropped · `g5_8` → dropped.
 */
export function normalizeIntensityToken(token: string): string {
  return String(token)
    .toLowerCase()
    .split('_')
    // Drop any segment CONTAINING a digit — `18mi`, `108min`, `4x180s`, `r180s`, `g5`. Safe because
    // `getStepsIntensity` also tests the RAW token, so a legitimately numeric key like `5kpace`
    // still matches even though normalisation removes that segment.
    .filter((seg) => seg.length > 0 && !/\d/.test(seg))
    .join('_');
}

export function getStepsIntensity(steps: string[], type: string): number {
  const factors = INTENSITY_FACTORS[type];
  if (!factors || !Array.isArray(steps) || steps.length === 0) {
    return getDefaultIntensityForType(type);
  }
  // ⛔ MOST SPECIFIC KEY WINS, NOT THE FIRST DECLARED. The old loop `break`s on the first key that
  // matches in object-literal order, and `easypace` is declared above `longrun_easypace` — so even a
  // literal `longrun_easypace` token would have taken 0.65 and stopped. The table's own comment
  // claimed specific keys "still win the max"; the `break` made that false. Sorting by key length
  // makes specificity the rule instead of declaration order.
  const keysBySpecificity = Object.entries(factors)
    .sort((a, b) => b[0].length - a[0].length);

  const intensities: number[] = [];
  const unmatched: string[] = [];
  for (const token of steps) {
    const raw = String(token).toLowerCase();
    const normalized = normalizeIntensityToken(raw);
    const hit = keysBySpecificity.find(([key]) => {
      const k = key.toLowerCase();
      return normalized.includes(k) || raw.includes(k);
    });
    if (hit) intensities.push(hit[1]);
    else unmatched.push(raw);
  }

  // ⛔ AN UNRECOGNISED TOKEN IS LOUD NOW. It used to fall to the per-type default silently, which is
  // how a whole token family can be mispriced for months with no test failing and no signal anywhere.
  if (unmatched.length > 0) {
    console.warn(
      `[workload] unmatched intensity token(s) for type=${type}: ${unmatched.join(', ')} — ` +
      `falling back to the ${type} default (${getDefaultIntensityForType(type)}). ` +
      `Add a key to INTENSITY_FACTORS rather than leaving the default to absorb it.`,
    );
  }
  return intensities.length > 0 ? Math.max(...intensities) : getDefaultIntensityForType(type);
}

// ---------------------------------------------------------------------------
// RPE → intensity mapping
// ---------------------------------------------------------------------------

export function mapRPEToIntensity(rpe: number): number {
  if (rpe >= 9) return 0.95;
  if (rpe >= 8) return 0.90;
  if (rpe >= 7) return 0.85;
  if (rpe >= 6) return 0.80;
  if (rpe >= 5) return 0.75;
  if (rpe >= 4) return 0.70;
  if (rpe >= 3) return 0.65;
  return 0.60;
}

// ---------------------------------------------------------------------------
// Strength workload
// ---------------------------------------------------------------------------

export function getStrengthIntensity(exercises: any[], sessionRPE?: number): number {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    if (typeof sessionRPE === 'number' && sessionRPE >= 1 && sessionRPE <= 10) {
      return mapRPEToIntensity(sessionRPE);
    }
    return 0.75;
  }

  if (typeof sessionRPE === 'number' && sessionRPE >= 1 && sessionRPE <= 10) {
    return mapRPEToIntensity(sessionRPE);
  }

  const intensities = exercises.map(ex => {
    let base = 0.75;

    if (Array.isArray(ex.sets) && ex.sets.length > 0) {
      const completedSets = ex.sets.filter((s: any) => s.completed !== false);
      if (completedSets.length === 0) return base;

      const rirValues = completedSets
        .map((s: any) => (typeof s.rir === 'number' && s.rir >= 0 ? s.rir : null))
        .filter((rir: number | null) => rir !== null) as number[];

      if (rirValues.length > 0) {
        const avgRIR = rirValues.reduce((a: number, b: number) => a + b, 0) / rirValues.length;
        if (avgRIR <= 1) base = 0.95;
        else if (avgRIR <= 2) base = 0.90;
        else if (avgRIR <= 3) base = 0.85;
        else if (avgRIR <= 4) base = 0.80;
        else if (avgRIR <= 5) base = 0.75;
        else base = 0.70;
      } else {
        const avgWeight = completedSets.reduce((sum: number, s: any) => sum + (Number(s.weight) || 0), 0) / completedSets.length;
        const avgReps = completedSets.reduce((sum: number, s: any) => sum + (Number(s.reps) || 0), 0) / completedSets.length;

        if (completedSets[0].duration_seconds && completedSets[0].duration_seconds > 0) {
          base = INTENSITY_FACTORS.strength['core_'];
          const avgDuration = completedSets.reduce((sum: number, s: any) => sum + (Number(s.duration_seconds) || 0), 0) / completedSets.length;
          if (avgDuration > 90) base *= 1.05;
          return base;
        }

        if (avgWeight > 0) {
          if (avgReps <= 5 && avgWeight > 50) base = 0.90;
          else if (avgReps <= 5) base = 0.85;
          else if (avgReps >= 13) base = 0.70;
          else base = 0.80;
        }

        if (avgReps <= 5) base *= 1.05;
        else if (avgReps >= 13) base *= 0.90;
      }

      return base;
    }

    if (ex.duration_seconds && ex.duration_seconds > 0) {
      base = INTENSITY_FACTORS.strength['core_'];
      if (ex.duration_seconds > 90) base *= 1.05;
      return base;
    }

    if (ex.weight && typeof ex.weight === 'string' && ex.weight.includes('% 1RM')) {
      const pct = parseInt(ex.weight);
      const roundedPct = Math.floor(pct / 5) * 5;
      const key = `@pct${roundedPct}`;
      base = INTENSITY_FACTORS.strength[key] || 0.75;
    } else if (ex.weight && typeof ex.weight === 'string' && ex.weight.toLowerCase().includes('bodyweight')) {
      base = INTENSITY_FACTORS.strength['bodyweight'];
    }

    // D-322: parse, don't type-check. A rep RANGE ("5-8") is a string, and the old
    // type-check silently fell to the 8-rep default — flipping the intensity multiplier
    // the wrong way for a heavy 5. Takes the BOTTOM of the range, the day-one prescription.
    const reps = typeof ex.reps === 'number' ? ex.reps : (Number.parseInt(String(ex.reps ?? ''), 10) || 8);
    if (reps <= 5) base *= 1.05;
    else if (reps >= 13) base *= 0.90;

    return base;
  });

  return intensities.reduce((a: number, b: number) => a + b, 0) / intensities.length;
}

// ---------------------------------------------------------------------------
// WHAT A SET IS WORTH — the one rule, D1 (2026-08-01)
// ---------------------------------------------------------------------------

/**
 * ⛔ THE FLAT TOKEN FOR A BAND SET. A band has no clean load: manufacturers do not standardise
 * colours or tensions, and the same "Medium" is a different force at the top of the rep than the
 * bottom. D1: assistance work is deliberately minor, so precision here is not worth buying.
 *
 * ⚠️ THE MAGNITUDE IS THE WHOLE DESIGN. It has to be non-zero — band work that scores nothing is
 * the bug this change exists to fix — and small enough that it can never move a verdict. In the
 * units below (lb × reps) 100 is worth 0.01 of a volume factor: about 0.6 points at the default
 * effort multiplier, so TEN band sets are worth ~6 points against a 47-minute easy run's 61. It is
 * a floor that makes the work visible, not an attempt to measure it.
 */
export const BAND_SET_VOLUME_TOKEN = 100;

/**
 * ⛔ THE ATHLETE'S BODY WEIGHT IN POUNDS, FROM THE ONE PLACE IT IS STORED — or null.
 *
 * `user_baselines.weight` is the number the athlete typed in Training Baselines, and
 * `user_baselines.units` says which scale it is on ('metric' → kilograms). Three functions now need
 * it to price a calisthenic set, so the read of that pair lives here rather than three times.
 *
 * ⚠️ NULL IS A REAL ANSWER. Absent, unparseable, or outside a sane human range → null, and every
 * caller then scores bodyweight work exactly as it does today. The guard rails are there because a
 * body weight is free text: 70 typed by someone in kilograms is a person, 70 read as pounds is not,
 * and a mis-scaled weight would silently multiply every calisthenic set in the athlete's history.
 */
export function resolveBodyweightLb(row: { weight?: unknown; units?: unknown } | null | undefined): number | null {
  const raw = Number((row as any)?.weight);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const metric = String((row as any)?.units ?? '').toLowerCase() === 'metric';
  const lb = metric ? raw * 2.20462 : raw;
  // A human adult, generously bounded. Outside it, the number is not a body weight we can price.
  if (lb < 60 || lb > 600) return null;
  return Math.round(lb * 10) / 10;
}

export type StrengthVolumeOpts = {
  /**
   * The athlete's body weight in POUNDS, or null when it was never recorded.
   *
   * ⛔ NULL IS NOT ZERO AND IT IS NOT A GUESS. An athlete who never filled in their weight keeps
   * exactly today's scoring — bodyweight sets contribute nothing — because the alternative is
   * inventing a body weight for a real person and pricing their training off it. Law 2: the app
   * does not fill a gap with a confident number.
   */
  bodyweightLb?: number | null;
  /** `bandMeansAssistance(canonical)` for the exercise this set belongs to. */
  bandIsAssistance?: boolean;
};

/**
 * ⛔ WHAT ONE SET CONTRIBUTED, IN lb × reps. THE ONE PLACE THAT DECIDES (D1).
 *
 * Volume load — sets × reps × load — is the basis every strength app scores on (Strong, Hevy), and
 * it is what this function has always computed for a barbell. The hole it closes: `weight` is 0 on
 * every calisthenic set, so a chin-up, a dip, a box jump and a bodyweight hip thrust each scored
 * exactly nothing. Measured on a real 13-set squat day: 10 points, against 61 for a 47-minute easy
 * run — on a strength block. The work was done and the app could not see it.
 *
 * The rule, in order:
 *   1. External weight on the bar → weight × reps. UNCHANGED, and it is most sets.
 *   2. No weight, reps logged, body weight known → bodyweight × reps.
 *   3. No weight, reps logged, a band on a movement where the band IS the resistance → flat token.
 *   4. Anything else → 0.
 *
 * ⚠️ ASSISTANCE IS NOT MODELLED, DELIBERATELY. A band-assisted chin-up counts as full bodyweight,
 * because the assistance cancels an unknown fraction of it and inventing that fraction would be a
 * fabricated number dressed as a measured one. It over-counts, and it over-counts far less than
 * zero under-counted. The same applies the other way: Strong counts a bodyweight exercise as full
 * body weight, while the biomechanics say a push-up is nearer two-thirds. One rule, stated, in the
 * direction the field already leans.
 *
 * ⚠️ A DURATION-ONLY SET STILL SCORES 0 — a plank has no reps for this to multiply. Known and left
 * (2026-08-01); scoring isometric time needs its own basis, not a fudge inside this one.
 */
export function strengthSetVolume(
  set: { weight?: number | string | null; reps?: number | string | null; resistance_level?: string | null },
  opts: StrengthVolumeOpts = {},
): number {
  const reps = Number(set?.reps) || 0;
  if (reps <= 0) return 0;

  const weight = Number(set?.weight) || 0;
  if (weight > 0) return weight * reps;

  const bw = Number(opts.bodyweightLb) || 0;
  const banded = typeof set?.resistance_level === 'string' && set.resistance_level.trim() !== ''
    && set.resistance_level.trim().toLowerCase() !== 'none';

  // A band on a pull-up/chin-up/dip is HELP, not the load — the body is still what moved.
  if (banded && !opts.bandIsAssistance) return BAND_SET_VOLUME_TOKEN;

  return bw > 0 ? bw * reps : 0;
}

export function calculateStrengthWorkload(exercises: any[], sessionRPE?: number, opts: StrengthVolumeOpts = {}): number {
  if (!Array.isArray(exercises) || exercises.length === 0) return 0;

  let totalVolume = 0;
  exercises.forEach(ex => {
    if (Array.isArray(ex.sets) && ex.sets.length > 0) {
      // Asked once per EXERCISE, not per set — a band means the same thing on every set of a row.
      const bandIsAssistance = bandMeansAssistance(canonicalize(String(ex?.name ?? '')));
      ex.sets.forEach((set: any) => {
        if (set.completed !== false) {
          totalVolume += strengthSetVolume(set, { ...opts, bandIsAssistance });
        }
      });
    }
  });

  const volumeFactor = totalVolume / 10000;
  const effectiveVolumeFactor = Math.max(volumeFactor, 0.1);
  const intensity = getStrengthIntensity(exercises, sessionRPE);

  return Math.round(effectiveVolumeFactor * Math.pow(intensity, 2) * 100);
}

// RIR → strength intensity, the ONE band table both sides use. (Actual reads it inline in
// getStrengthIntensity from logged RIR; planned reads it here from the prescription's target RIR.)
export function rirToStrengthIntensity(rir: number): number {
  if (rir <= 1) return 0.95;
  if (rir <= 2) return 0.90;
  if (rir <= 3) return 0.85;
  if (rir <= 4) return 0.80;
  if (rir <= 5) return 0.75;
  return 0.70;
}

/**
 * PLANNED strength workload — the SAME tonnage basis as `calculateStrengthWorkload` (actual), computed
 * from the MATERIALIZED prescription (resolved weight in lb × sets × reps). This finishes a half-done
 * migration: actual moved to tonnage long ago; planned stayed on the CLOCK (`calculateDurationWorkload`)
 * and so a session read e.g. 56 planned / 25 done for the identical work. The clock is meaningless for
 * lifting — only the weight moved counts, on both sides.
 *
 * Carries (no resolved weight, distance/time "reps") contribute 0 tonnage here EXACTLY as they do on the
 * actual side today, so planned and actual reconcile for the weighted lifts. Capturing carry load is a
 * separate fix owed on BOTH sides (planned "Heavy" + the actual logger's weight:0) — see Q-180.
 *
 * Intensity mirrors actual's method: band each exercise's target RIR, then average the bands.
 */
export function calculatePlannedStrengthWorkload(
  exercises: Array<{ name?: string | null; sets?: number | any[]; reps?: number | string; weight?: number | string | null; target_rir?: number | null }>,
  opts: StrengthVolumeOpts = {},
): number {
  if (!Array.isArray(exercises) || exercises.length === 0) return 0;
  let totalVolume = 0;
  const intensities: number[] = [];
  for (const ex of exercises) {
    const sets = Number(ex.sets) || 0; // materialized prescription: sets is a COUNT
    const reps = typeof ex.reps === 'number' ? ex.reps : Number.parseInt(String(ex.reps ?? ''), 10);
    // ⛔ THE SAME SET RULE AS ACTUAL, OR THE TWO SIDES STOP RECONCILING (D1, 2026-08-01).
    //
    // This function exists because planned and actual once used different bases and a session read
    // 56 planned / 25 done for identical work. Bodyweight scoring landed the app right back there:
    // if the completed chin-ups start counting and the prescribed ones do not, every strength
    // session on every screen reads as heavier than planned — and `workload-strength-planned.test.ts`
    // pins prescribed == performed, so it fails the moment one side moves alone. One rule, priced
    // per set here exactly as it is priced per set there.
    if (sets > 0 && Number.isFinite(reps) && reps > 0) {
      const bandIsAssistance = bandMeansAssistance(canonicalize(String(ex?.name ?? '')));
      // ⚠️ THE TWO SIDES SPEAK DIFFERENT DIALECTS ABOUT A BAND, and this is where they are made to
      // agree. A logged set names the band in `resistance_level`; a PRESCRIPTION has no such field —
      // it puts a word where the number goes ("Band", "Bodyweight", "Heavy barbell", D-094). So a
      // prescribed band row is translated into the same shape the actual side reads. Without this it
      // resolves to "no weight, no band" and gets priced as full bodyweight, against a token on the
      // completed side — the mismatch this function was written to end, re-created one layer down.
      const plannedIsBand = /band/i.test(String(ex.weight ?? ''));
      totalVolume += sets * strengthSetVolume(
        { weight: ex.weight, reps, resistance_level: plannedIsBand ? 'band' : null },
        { ...opts, bandIsAssistance },
      );
    }
    if (typeof ex.target_rir === 'number' && ex.target_rir >= 0) intensities.push(rirToStrengthIntensity(ex.target_rir));
  }
  const effectiveVolumeFactor = Math.max(totalVolume / 10000, 0.1);
  const intensity = intensities.length ? intensities.reduce((a, b) => a + b, 0) / intensities.length : 0.75;
  return Math.round(effectiveVolumeFactor * Math.pow(intensity, 2) * 100);
}

// ---------------------------------------------------------------------------
// Mobility workload
// ---------------------------------------------------------------------------

export function getMobilityIntensity(exercises: any[]): number {
  const completedCount = exercises.filter((ex: any) => ex.completed).length;
  const totalCount = exercises.length;
  if (totalCount === 0) return 0.60;
  return 0.60 + (completedCount / totalCount) * 0.1;
}

export function calculateMobilityWorkload(exercises: any[]): number {
  if (!Array.isArray(exercises) || exercises.length === 0) return 0;

  const total = exercises.length;
  const completed = exercises.filter((e: any) => e.completed).length;
  if (completed === 0) return 0;

  const completionRatio = completed / total;
  const intensity = clamp(getMobilityIntensity(exercises), 0.50, 0.80);

  const raw = total * 1.0 * completionRatio;
  const intensityMultiplier = clamp(0.85 + (intensity - 0.60) * 1.5, 0.75, 1.10);
  const workload = Math.round(raw * intensityMultiplier);

  const minIfMeaningful = completed >= 3 ? 3 : 0;
  return clamp(workload, minIfMeaningful, 30);
}

// ---------------------------------------------------------------------------
// Pilates / Yoga workload  (sRPE: duration_minutes × RPE)
// ---------------------------------------------------------------------------

export function calculatePilatesYogaWorkload(durationMinutes: number, sessionRPE?: number): number {
  if (!durationMinutes || durationMinutes <= 0) return 0;

  if (typeof sessionRPE === 'number' && sessionRPE >= 1 && sessionRPE <= 10) {
    return Math.round(durationMinutes * sessionRPE);
  }

  // Fallback when RPE unavailable: duration (hours) × 0.75² × 100
  const durationHours = durationMinutes / 60;
  return Math.round(durationHours * Math.pow(0.75, 2) * 100);
}

// ---------------------------------------------------------------------------
// Output/threshold intensity inference (D-238)
// ---------------------------------------------------------------------------
// The cardio load ladder keys on MEASURABLE OUTPUT (power vs FTP, pace) and
// THRESHOLD HR (LTHR) — never resting HR. Returns an intensity factor (fed to
// duration × IF² × 100), or 0 when no output signal exists (the caller then falls
// through to sRPE, then the duration default). It NEVER fabricates an input to keep
// a tier alive. Supersedes the resting-HR TRIMP path (D-238).

export interface PerfIntensityInput {
  type: string;
  avgHr?: number | null;
  thresholdHr?: number | null; // LTHR — threshold HR, NOT resting HR
  avgPower?: number | null;
  ftp?: number | null;
  avgPace?: number | null;     // swim: seconds per 100m
}

export function inferIntensityFromPerformance(inp: PerfIntensityInput): number {
  const type = (inp.type || '').toLowerCase();
  const isRide = type === 'ride' || type === 'bike';

  // Bike: power vs FTP (the primary output metric).
  if (isRide && inp.avgPower && inp.ftp) {
    const ifactor = inp.avgPower / inp.ftp;
    if (ifactor >= 1.05) return 1.15;
    if (ifactor >= 0.95) return 1.00;
    if (ifactor >= 0.85) return 0.90;
    if (ifactor >= 0.75) return 0.80;
    if (ifactor >= 0.60) return 0.70;
    if (ifactor >= 0.55) return 0.65;
    return 0.55;
  }

  // Run / bike: HR vs THRESHOLD HR (LTHR). Never resting HR.
  if ((type === 'run' || isRide) && inp.avgHr && inp.thresholdHr) {
    const p = inp.avgHr / inp.thresholdHr;
    if (type === 'run') {
      if (p >= 1.05) return 1.10;
      if (p >= 0.95) return 1.00;
      if (p >= 0.88) return 0.88;
      if (p >= 0.80) return 0.80;
      if (p >= 0.70) return 0.70;
      return 0.60;
    }
    if (p >= 0.95) return 1.00;
    if (p >= 0.90) return 0.90;
    if (p >= 0.85) return 0.80;
    if (p >= 0.75) return 0.70;
    return 0.60;
  }

  // Swim: pace (seconds per 100m).
  if (type === 'swim' && inp.avgPace) {
    const per100 = inp.avgPace / 60;
    if (per100 < 1.5) return 1.00;
    if (per100 < 2.0) return 0.95;
    if (per100 < 2.5) return 0.85;
    if (per100 < 3.0) return 0.75;
    return 0.65;
  }

  return 0; // no output signal → caller falls through to sRPE / duration default
}

// ---------------------------------------------------------------------------
// Duration-based cardio workload (no HR)
// ---------------------------------------------------------------------------

export function calculateDurationWorkload(
  durationMinutes: number,
  intensity: number,
): number {
  if (!durationMinutes || durationMinutes <= 0) return 0;
  const durationHours = durationMinutes / 60;
  return Math.round(durationHours * Math.pow(intensity, 2) * 100);
}

// ---------------------------------------------------------------------------
// Workload provenance (D-237): declare HOW a stored workload was derived, so an
// ESTIMATED load (default intensity / assumed resting HR) is distinguishable from
// a MEASURED one and consumers (ACWR receipt) can disclose it. Persist the result
// so future rows self-declare — the fix for the W1/W2 silent-impersonation class.
// ---------------------------------------------------------------------------

export type WorkloadMethod =
  | 'trimp_hr_based'         // RETIRED D-238 (historical rows only) — resting-HR TRIMP
  | 'trimp_resting_assumed'  // RETIRED D-238 (historical rows only) — TRIMP w/ assumed resting HR (W2)
  | 'power_intensity'        // measured: power vs FTP
  | 'hr_intensity'           // measured: HR vs threshold
  | 'steps_preset'           // structured prescription
  | 'volume_based'           // strength (sets × reps × load)
  | 'duration_intensity'     // duration × inferred intensity
  | 'srpe_estimated'         // ESTIMATED (field-standard, r≈0.68–0.74): no HR/power/pace but a logged RPE
  | 'duration_default'       // ESTIMATED (lowest trust): duration × a DEFAULT intensity, no effort signal AND no RPE (W1)
  | 'hr_rejected_corrupt';   // ESTIMATED: HR present but rejected as corrupt (flaky strap) → fell to RPE/default (reserved; HR-plausibility filter)

/**
 * LOW-TRUST estimated methods — a flat constant or a skewed physiological input, NOT a validated
 * proxy. These are what the Stage-2 ACWR disclosure counts (D-237). `srpe_estimated` is field-
 * standard and deliberately EXCLUDED — it's an estimate that declares itself but doesn't make the
 * ratio "soft". `trimp_resting_assumed` and `hr_rejected_corrupt` are included.
 */
export const LOW_TRUST_WORKLOAD_METHODS: ReadonlySet<WorkloadMethod> = new Set<WorkloadMethod>([
  'duration_default',
  'trimp_resting_assumed',
  'hr_rejected_corrupt',
]);

export function isLowTrustWorkload(method: string | null | undefined): boolean {
  return !!method && LOW_TRUST_WORKLOAD_METHODS.has(method as WorkloadMethod);
}

export function classifyWorkloadMethod(args: {
  type: string;
  hasAvgHr: boolean;
  /** @deprecated D-238 — TRIMP/HR-reserve retired; ignored. */
  hasMaxHr?: boolean;
  hasThresholdHr: boolean;
  hasFtp: boolean;
  hasAvgPower: boolean;
  hasStepsPreset: boolean;
  /** cardio had no HR/power/pace performance inference (inferIntensityFromPerformance returned 0). */
  noPerformanceInference: boolean;
  /** a valid logged session RPE (1–10) is available → RPE-derived intensity instead of the flat default. */
  rpeAvailable: boolean;
  /** @deprecated D-238 — resting HR is never used in load; ignored. */
  restingAssumed?: boolean;
}): { method: WorkloadMethod; estimated: boolean } {
  const t = (args.type || '').toLowerCase();
  const isCardio = t === 'run' || t === 'ride' || t === 'bike' || t === 'swim';

  if (t === 'strength') return { method: 'volume_based', estimated: false };
  // D-238: OUTPUT-FIRST. Power (ride) then threshold HR (LTHR) — measured signals. No TRIMP /
  // resting-HR tier. Mirror inferIntensityFromPerformance's order so label ↔ number agree.
  if ((t === 'ride' || t === 'bike') && args.hasFtp && args.hasAvgPower) return { method: 'power_intensity', estimated: false };
  if (isCardio && args.hasAvgHr && args.hasThresholdHr) return { method: 'hr_intensity', estimated: false };
  // No output/threshold signal: RPE-derived (field-standard) beats the flat default (double-missing).
  if (isCardio && args.noPerformanceInference) {
    return args.rpeAvailable
      ? { method: 'srpe_estimated', estimated: true }
      : { method: 'duration_default', estimated: true };
  }
  if (args.hasStepsPreset) return { method: 'steps_preset', estimated: false };
  return { method: 'duration_intensity', estimated: false };
}
