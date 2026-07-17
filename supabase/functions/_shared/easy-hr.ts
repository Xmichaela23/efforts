/**
 * RUN EASY-HR BAND — the ONE definition of "is this heartbeat easy for this athlete".
 *
 * Spec: docs/DESIGN-run-easy-pace-truth.md · Q-169.
 *
 * WHY THIS EXISTS. Before it, "easy" was defined in FIVE places that did not agree:
 *   learn-fitness-profile:610  run easy HR    -> observedMaxHR * 0.75
 *   learn-fitness-profile:706  run easy PACE  -> observedMaxHR * 0.75
 *   learn-fitness-profile:870  BIKE easy HR   -> 65-75% max + power filter   (WORKS — untouched)
 *   compute-facts:1042         per-sample gate-> thresholdHR * 0.78
 *   coach:2086                 HR bins        -> run_threshold_hr.value      (already correct)
 *
 * The consequence, measured on real data (user 45d122e7): the 75%-of-max ceiling is 130.5 bpm; the
 * athlete's genuine easy runs (RPE 2-3) sit at 133-141 bpm. **0 of 77 runs qualified.** The easy-pace
 * learner could never fire, so `learned_fitness.run_easy_pace_sec_per_km` stayed null forever, so the
 * D-033 pace reconciler (which needs it) never ran, so the app could not notice the athlete had
 * detrained — and prescribed against a pace he had not run in 77 recorded runs.
 *
 * ⚠ THE BIKE IS NOT BROKEN AND IS NOT ROUTED THROUGH HERE. Its 65-75%-of-max band finds rides fine
 * (bike easy HR learned: 130 bpm = 74% of bike max, 6 rides, high confidence). Running HR sits 5-10 bpm
 * ABOVE cycling at the same perceived effort (upright posture, more active muscle mass, weight-bearing),
 * which is exactly why one %max band works for the bike and locks the run out. Do not "unify" them.
 *
 * ── THE ANCHOR (ruled by Michael 2026-07-12, grounded in the field, NOT in his numbers) ──
 * THRESHOLD-first, %max as the cold-start bootstrap. Best anchor available, always, and it declares
 * which one it used (Law 3 — confidence travels with the number).
 *
 *   · LTHR known  -> Friel run zones. Z1 <85% LTHR, Z2 85-89% LTHR. Easy = at or below the Z2 ceiling.
 *   · LTHR absent -> %max band 65-80%. NOT a 75% ceiling: MyProCoach and Garmin both top the aerobic
 *                    band at 80%. A day-one athlete is bootstrapped, not stranded (the Garmin model:
 *                    seed with the available anchor, upgrade the moment the good one is earned).
 *   · Neither     -> null. We do not know. Say so; do not invent (Law 2).
 *
 * Field receipts (researched + adversarially verified 2026-07-12; full citations in the design doc §9):
 *   · Friel, verbatim: "Do not use 220 minus your age to find max heart rate as this is as likely to be
 *     wrong as right." TrainingPeaks' largest and DEFAULT zone family is threshold-anchored.
 *   · NO shipped app uses an HR CEILING to qualify an easy run. COROS — the only vendor that publishes
 *     its gates — uses an intensity FLOOR (the run must be hard ENOUGH to count).
 *   · Where schemes do express aerobic in %max, the ceiling is 80%, not 75% (MyProCoach; Garmin).
 *   · Max HR is a one-way ratchet: a single strap artefact poisons every derived zone permanently.
 *     COROS documents this exact failure and tells users to fix the anchor by hand.
 *   · This app ALREADY chose threshold — the Baselines screen renders "Friel %LTHR". The learner simply
 *     never followed its own zones screen.
 */

// D-286 — the Friel boundary now lives in ONE place (`src/lib/friel-zones.ts`) that the CLIENT's zone table
// reads too. It was hardcoded in three files that rounded independently (0.89 here, 0.90 in the analyzer,
// 0.90 in TrainingBaselines) — so a 135 bpm run was "Zone 2" on the athlete's screen and "not easy" to this
// learner. Re-exported here so every existing importer keeps working unchanged.
export { EASY_CEILING_PCT_LTHR, EASY_FLOOR_PCT_LTHR, easyCeilingBpm, zone3FloorBpm, frielRunZones } from '../../../src/lib/friel-zones.ts';
import { EASY_CEILING_PCT_LTHR, EASY_FLOOR_PCT_LTHR, easyCeilingBpm, zone3FloorBpm } from '../../../src/lib/friel-zones.ts';
import { resolveCurrentLthr } from '../../../src/lib/resolve-current-lthr.ts';
/** Friel Z3 floor — kept as a named export for existing importers; delegates to the ONE model (D-286). */
export function runEasyZone3FloorBpm(lthr: number): number {
  return zone3FloorBpm(lthr);
}
/** Cold-start bootstrap: the field's aerobic ceiling is 80% of max — NOT the 75% that starved this. */
export const EASY_CEILING_PCT_MAXHR = 0.80;
/** Cold-start floor: below 65% of max is recovery/commute territory (mirrors the working bike band). */
export const EASY_FLOOR_PCT_MAXHR = 0.65;

export type EasyHrAnchor = 'lthr' | 'max_hr' | 'none';

export interface EasyHrBand {
  /** inclusive upper bound, bpm. null when we cannot honestly judge. */
  ceiling: number | null;
  /** inclusive lower bound, bpm. null when we cannot honestly judge. */
  floor: number | null;
  anchor: EasyHrAnchor;
  /** Confidence of the ANCHOR we used — travels to the surface (Law 3). */
  confidence: 'high' | 'medium' | 'low' | null;
  /** Plain-English provenance for the receipt/glass box. */
  basis: string;
}

const UNKNOWN: EasyHrBand = {
  ceiling: null, floor: null, anchor: 'none', confidence: null,
  basis: 'no threshold HR and no observed max HR — easy cannot be judged',
};

function readMetric(lf: Record<string, unknown> | null | undefined, key: string): { value: number; confidence: 'high' | 'medium' | 'low' | null } | null {
  const raw = (lf as any)?.[key];
  if (raw == null) return null;
  const v = typeof raw === 'object' ? Number((raw as any).value) : Number(raw);
  if (!Number.isFinite(v) || !(v > 0)) return null;
  // LAW 2 — an INVENTED number may not become an anchor (Q-171). `learn-fitness-profile` has a last-resort
  // branch that writes `run_threshold_hr` as "88% of observed max (estimated)" with **sample_count: 0** —
  // a formula applied to another estimate (and observed-max is a one-way ratchet, so a single strap
  // artefact poisons it permanently). Accepting that as the LTHR anchor makes the band ANNOUNCE
  // "Friel Z2 — at or below 89% of your threshold HR" over a number nobody measured, and it is not even
  // conservative: 0.89 x 0.88 = 78% of max ceiling, 0.70 x 0.88 = 62% floor — TIGHTER and LOWER than the
  // honest %max bootstrap (65-80%), i.e. it drifts straight back toward the Q-169 starvation while
  // claiming to be the cure for it. So: a metric that explicitly declares ZERO samples is not a
  // measurement and cannot anchor. We fall through to the bootstrap, which at least says it is one.
  //
  // `sample_count: 0` is REJECTED. `sample_count` ABSENT is accepted — absent means "not stated" (the
  // in-pass synthetic band built inside learn-fitness-profile passes no count), not "measured nothing".
  // The 95th-percentile fallback (low confidence, sample_count >= 3) SURVIVES: it is a weak measurement,
  // not an invention, and the distinction this gate draws is measured-vs-invented, not strong-vs-weak.
  if (typeof raw === 'object' && (raw as any).sample_count === 0) return null;
  const c = typeof raw === 'object' ? String((raw as any).confidence ?? '') : '';
  return { value: v, confidence: (c === 'high' || c === 'medium' || c === 'low') ? c : null };
}

/**
 * The one definition. Threshold-first, %max bootstrap, honest null.
 *
 * @param learnedFitness `user_baselines.learned_fitness` (keys are TOP-LEVEL: `run_threshold_hr`,
 *   `run_max_hr_observed`). NOTE: `learned_fitness.running.threshold_hr` does NOT exist — reading that
 *   nested path is the dead lookup that starved `compute-facts.pace_at_easy_hr` on 147 of 147 runs.
 * @param manualThresholdHr optional override (`performance_numbers.threshold_heart_rate`).
 */
export function resolveRunEasyHrBand(
  learnedFitness: Record<string, unknown> | null | undefined,
  manualThresholdHr?: number | null,
): EasyHrBand {
  // D-lthr-one-anchor (audit 2026-07-17): the LTHR resolution + the sample_count:0 gate that used to
  // live in `readMetric` above now come from the ONE resolver — the same bpm every surface reads.
  // The %max bootstrap below is unchanged (it is this band's own cold-start, not an LTHR source).
  const lthr = resolveCurrentLthr({
    learned_fitness: learnedFitness as any,
    performance_numbers: { threshold_heart_rate: manualThresholdHr ?? null },
  });

  if (lthr.bpm != null) {
    return {
      ceiling: easyCeilingBpm(lthr.bpm),
      floor: Math.round(lthr.bpm * EASY_FLOOR_PCT_LTHR),
      anchor: 'lthr',
      confidence: lthr.confidence,
      basis: `Friel Z2 — at or below ${Math.round(EASY_CEILING_PCT_LTHR * 100)}% of your threshold HR (${Math.round(lthr.bpm)} bpm)`,
    };
  }

  // Bootstrap. Available on day one; upgraded the moment a threshold effort is logged.
  const max = readMetric(learnedFitness, 'run_max_hr_observed');
  if (max) {
    return {
      ceiling: Math.round(max.value * EASY_CEILING_PCT_MAXHR),
      floor: Math.round(max.value * EASY_FLOOR_PCT_MAXHR),
      anchor: 'max_hr',
      // Never better than 'low': an observed max is a ratchet, not a measurement (Law 3).
      confidence: 'low',
      basis: `estimated — ${Math.round(EASY_FLOOR_PCT_MAXHR * 100)}-${Math.round(EASY_CEILING_PCT_MAXHR * 100)}% of your observed max HR (${Math.round(max.value)} bpm); firms up once a threshold effort is logged`,
    };
  }

  return UNKNOWN;
}

/** Is this heart rate an EASY one for this athlete? `null` band -> null (unknown), never a guess. */
export function isEasyHr(hr: number | null | undefined, band: EasyHrBand): boolean | null {
  if (band.ceiling == null || band.floor == null) return null;
  const v = Number(hr);
  if (!Number.isFinite(v) || !(v > 0)) return null;
  return v >= band.floor && v <= band.ceiling;
}

// ── WHICH RUNS MAY SUPPLY A "PACE AT EASY HR" (Q-171) ────────────────────────────────────────────
//
// The band above answers "is this HEARTBEAT easy". It does NOT answer "is this RUN an easy run", and
// conflating the two was a real bug. `compute-facts` harvested easy-band samples from EVERY run behind
// a 10-SAMPLE floor (~10 s at 1 Hz). On an interval or tempo session that harvests two lies at once:
//   · the warm-up / cool-down  — in-band HR, genuinely SLOW pace, and
//   · the HR-LAG opening of each hard rep — HR has not caught up yet, pace is already FAST.
// The resulting `pace_at_easy_hr` is noise in an unpredictable direction, and it does not stay put:
// compute-snapshot -> `athlete_snapshot.run_easy_pace_at_hr` -> the D-033 reconciler -> THE PLAN'S
// EASY PACE. A noisy-slow patch is exactly what trips `reconciled_worse` and slows the athlete down.
//
// This is the SAME disease D-275-bike already cured on the ride side, in almost the same words —
// "a threshold-level segment jacks in-band HR via cardiac lag" (`state-trend/bike-fitness.ts`). The cure
// has the same shape: qualify the SESSION, not just the sample — intensity + a real dwell floor.
//
// The intensity gate is DELIBERATELY the same predicate the BASELINE learner already applies
// (`learn-fitness-profile`: `duration >= 20` AND the run's own avg HR inside this band). The D-033
// reconciler compares baseline against observed, so the two MUST measure one population (Law 1). Before
// this they did not: baseline qualified whole runs, observed qualified loose samples. That asymmetry —
// not the band — is what made the observed side untrustworthy.
//
// It is intensity-gated, not LABEL-gated, on purpose: an unlabeled interval session is caught just the
// same, and nothing depends on the analyzer having classified the run before `compute-facts` runs.

/** Whole-run minimum, in MINUTES. Mirrors the baseline learner's `duration >= 20`. */
export const MIN_EASY_RUN_MINUTES = 20;

/** Minimum in-band DWELL, in SECONDS, before a pace-at-easy-HR is a measurement and not a fragment.
 *  Mirrors the bike's `MIN_EFFICIENCY_IN_BAND_S = 600` (D-275-bike). The old floor was 10 SAMPLES. */
export const MIN_EASY_PACE_IN_BAND_S = 600;

/**
 * Is this RUN a legitimate source of a "pace at easy HR" reading?
 *
 * @param avgHr           the run's OWN average HR (use the sanitized/resolved value — a corrupt-HR run
 *                        must arrive here as null, never as a raw column read).
 * @param durationMinutes whole-run duration, MINUTES (this codebase stores `moving_time` in minutes).
 * @param inBandSeconds   dwell inside the easy band, SECONDS — not a sample count.
 */
export function runEasyPaceEligible(
  avgHr: number | null | undefined,
  durationMinutes: number | null | undefined,
  inBandSeconds: number | null | undefined,
  band: EasyHrBand,
): boolean {
  if (band.ceiling == null) return false;                                  // cannot judge easy -> abstain
  if (!(Number(durationMinutes) >= MIN_EASY_RUN_MINUTES)) return false;    // Number(null) === 0 -> false
  if (isEasyHr(avgHr, band) !== true) return false;                        // the RUN must have been run easy
  if (!(Number(inBandSeconds) >= MIN_EASY_PACE_IN_BAND_S)) return false;   // a fragment is not a measurement
  return true;
}
