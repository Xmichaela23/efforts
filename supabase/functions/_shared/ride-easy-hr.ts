/**
 * WAS THIS RIDE ACTUALLY EASY — the heart-rate governor for an easy prescription.
 *
 * ⛔ WHY (2026-08-01, Michael: "I went too hard — heart rate should probably be the governor").
 * A session prescribed as "~108 min easy, all conversational" prescribes an INTENSITY, not watts and
 * not a distance. Scoring it on duration alone says "you rode 59% of it" and stays silent about riding
 * it at tempo. The field's rule: power is what the bike sees, heart rate is what the body did to
 * produce it — for an easy ride the target is physiological, so heart rate leads; for intervals the
 * target is external, so power leads. Decide in advance which governs (TrainingPeaks/Friel practice).
 *
 * ⚠️ MEASURED AS TIME UNDER THE CEILING, NEVER AS AN AVERAGE. A hilly ride pushes HR up on every climb;
 * an average punishes terrain and reads as indiscipline. The share of ride time at or under the ceiling
 * is what a coach actually means by "keep it easy".
 *
 * ⚠️ AND THE CEILING IS NOT `ride_easy_hr`. That learned value (130 bpm here) is a MEDIAN of past easy
 * rides — using a median as a ceiling would fail half of the athlete's own easy rides by construction.
 * It is the right number for "your normal easy is X"; it is the wrong number for a gate.
 *
 * THE ANCHOR, mirroring `_shared/easy-hr.ts` for runs — threshold first, %max as the bootstrap, and it
 * declares which one it used so confidence travels with the number:
 *   · ride threshold HR, medium/high confidence -> Friel's cycling Z2 ceiling, 89% of LTHR.
 *   · else max HR -> 75% of max. NOT the run's 80%: cycling HR sits 5-10 bpm BELOW running at the same
 *     perceived effort (posture, less active muscle mass, non-weight-bearing), and this app's own bike
 *     learner already uses a 65-75%-of-max band ("median of 6 easy rides (65-75% max, power-filtered)").
 *     `_shared/easy-hr.ts` says it outright: one %max band works for the bike and locks the run out —
 *     DO NOT unify them.
 *   · neither -> null. We do not know; say so rather than invent a gate.
 */

/** Friel cycling Z2 ceiling as a fraction of lactate-threshold HR. */
export const RIDE_EASY_CEILING_PCT_LTHR = 0.89;
/** Bootstrap ceiling as a fraction of max HR — the top of the band this app's own ride learner uses. */
export const RIDE_EASY_CEILING_PCT_MAXHR = 0.75;

export type RideEasyCeiling = {
  ceiling: number | null;
  anchor: 'threshold' | 'max_hr' | 'none';
  /** Confidence of the anchor we used, carried through so a consumer can hedge the sentence. */
  confidence: string | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function resolveRideEasyCeiling(learnedFitness: any): RideEasyCeiling {
  const lthr = num(learnedFitness?.ride_threshold_hr?.value);
  const lthrConf = String(learnedFitness?.ride_threshold_hr?.confidence ?? '').toLowerCase();
  if (lthr && (lthrConf === 'medium' || lthrConf === 'high')) {
    return { ceiling: Math.round(lthr * RIDE_EASY_CEILING_PCT_LTHR), anchor: 'threshold', confidence: lthrConf };
  }
  const maxHr = num(learnedFitness?.ride_max_hr_observed?.value);
  if (maxHr) {
    return {
      ceiling: Math.round(maxHr * RIDE_EASY_CEILING_PCT_MAXHR),
      anchor: 'max_hr',
      confidence: String(learnedFitness?.ride_max_hr_observed?.confidence ?? '') || null,
    };
  }
  return { ceiling: null, anchor: 'none', confidence: null };
}

/**
 * `timeUnderCeilingPct` MOVED 2026-08-02 → `_shared/time-under-ceiling.ts`, and every importer was
 * updated (no shim left behind). The measurement is sport-neutral (samples + a ceiling) and the RUN
 * now uses it too; leaving it in a ride-named file is how the next session ends up writing a second
 * copy for running. The CEILING stays here, because that part really is per-sport.
 */
