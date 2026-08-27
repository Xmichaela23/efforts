// ============================================================================
// THE ENDURANCE LEDGER — his buckets 1-3, in MINUTES, summed across every modality.
//
// ⛔⛔ THE UNIT IS THE POINT. p146, read off the image: systems exist for tracking volume within one
// sport and *"there are few practical ways to track total load across different stimuli."* His answer
// is five weekly markers, tracked across all of them:
//
//   1. sub-VT1 minutes          2. near-threshold minutes      3. over-threshold minutes
//   4. high-intensity work sets 5. effective hypertrophy reps per muscle group
//
// ⛔ 4 AND 5 ALREADY EXIST — `accessory-dosing/ledger.ts` (`ledgerFor`), which counts strength work
// sets per p147 and is NOT recomputed here. This module is 1-3 and the endurance side of 4.
//
// ⛔⛔ HIS OWN DEFINITIONS, p146 VERBATIM:
//   · **Sub-VT1** — *"the total number of minutes spent performing actual exercise (that is, greater
//     than zone 1, not including resistance training) and not exceeding the first ventilatory
//     threshold."*
//   · **Near-threshold** — *"minutes spent performing work between the first ventilatory threshold
//     and just over the second ventilatory threshold (that is, zone 3 crossing the line into zone 4)."*
//   · **Over-threshold** — *"minutes spent performing work notably over threshold, moving through
//     zone 4 up to that vVO2 max intensity, zone 4/5 line."*
//   · **The work-set line** — *"Any work significantly over the zone 4/5 line is no longer included
//     here and should be quantified as 'work sets'… If these sets are close to vVO2 max/1-mile pace,
//     they go in the over-threshold bucket. If they're about 5 to 10 percent faster (or higher in
//     output) than vVO2 max pace/1-mile pace, then they go in the work sets bucket."* He adds:
//     *"This may be controversial for some."*
//
// ⛔⛔ CLASSIFIED PER STEP AGAINST ITS OWN PERCENTAGE, NOT BY THE FAMILY IT SITS IN. p232 is why: one
// level-2 `run_mlss` session runs *"15 seconds @ 130% · 45 seconds @ 105% · 1 minute @ VT1"*, and
// another in the same block runs *"10 seconds @ 100% · 10 seconds @ all-out · 50 seconds @ 115% ·
// 1 minute @ 95% · 1 minute @ 90% · 2 minutes @ VT1"*. He prescribes a percentage PER INTERVAL
// precisely so the athlete knows where each piece sits — filing all of it under one bucket because
// the family is called Threshold discards exactly the resolution p146 asks for.
//
// ⛔ AND THE PERCENTAGE HAS A STATED MEANING. p229: *"The paces expressed in percentages refer to
// percent of threshold speed/pace/output, with 100 percent representing threshold/VT2."* So **the
// VT2 line is exactly 1.00** — it is not a number anyone here picked.
//
// ⚠️ WARM-UPS, COOLDOWNS AND RECOVERIES ARE MINUTES TOO, and that asymmetry is the first thing this
// ledger exists to reveal: a week that reads as "two hard sessions" is mostly easy minutes. **That is
// the finding, not a bug.**
//
// ⚠️ NO UI, NO ATHLETE INPUT. Nothing here is asked for or shown.
//
// ⚠️ PAGE IMAGES: `/Users/michaelambp/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/` — 151
// pages, deliberately outside git (61 MB of binaries, ruled 2026-08-21). pp.146, 229 and 232 were
// opened for this module. ⛔ An earlier version of this header said the images were unavailable
// because it looked inside the repo; that was wrong and this line replaces it.
// ============================================================================

import type { AnchorReport, EnduranceSession, Step } from '../endurance-library/index.ts';

export type IntensityBucket = 'sub_vt1' | 'near_threshold' | 'over_threshold' | 'work_set';

export type EnduranceLedger = {
  /** Minutes above zone 1 and at or below VT1. ⛔ Resistance training is never in here (p146). */
  subVt1Minutes: number;
  /** Minutes between VT1 and VT2 — zone 3, up to the line p229 fixes at 100%. */
  nearThresholdMinutes: number;
  /**
   * ⛔ ALWAYS ZERO UNTIL THE LINE IS RULED, AND THAT IS DELIBERATE — see `overVt2Minutes`. Nothing
   * this library builds can be placed in it without inventing where "just over" becomes "notably
   * over", so it is left empty rather than filled with a confident guess.
   */
  overThresholdMinutes: number;
  /**
   * ⛔⛔ MINUTES ABOVE VT2 THAT THE PAGE DOES NOT SPLIT. p146 puts *"just over the second ventilatory
   * threshold"* in NEAR-threshold and *"notably over threshold, moving through zone 4"* in
   * OVER-threshold, and states neither edge as a number. p232 prescribes 105%, 115%, 120%, 125% and
   * 130% inside one session, so the difference is real and this module cannot draw it.
   *
   * ⚠️ REPORTED RATHER THAN FILED. An honest "N minutes above threshold, unsplit" is worth more than
   * a confident wrong bucket — the same discipline as `isLowerBound` for untimed rest.
   * ⚠️ `overVt2Band` carries the percentages seen, so a future ruling can split it without a rebuild.
   */
  overVt2Minutes: number;
  overVt2Band: { lo: number; hi: number } | null;
  /**
   * ⛔ EFFORTS PAST HIS WORK-SET LINE, COUNTED AS SETS RATHER THAN MINUTES (p146). Endurance only —
   * the barbell side of this bucket is `DoseLedger`'s and is not touched here.
   */
  workSets: number;
  /**
   * ⛔ STEPS THE SOURCE GIVES NO CLOCK FOR — "full recovery" and untimed rest. **Unmeasured, never
   * zero**, the same way `demonstratedRunVolume` returns a null rather than a zero.
   */
  untimedSteps: number;
  /** True when any step carried no clock. A reader must say "at least", never "=". */
  isLowerBound: boolean;
  /** Minutes this module will not place, and why. Named, never folded into a bucket. */
  unplacedMinutes: number;
  unplacedReasons: string[];
};

export const ENDURANCE_LEDGER_BOUNDARIES = {
  /**
   * ⛔ STATED, NOT CHOSEN. p229: *"The paces expressed in percentages refer to percent of threshold
   * speed/pace/output, with 100 percent representing threshold/VT2."*
   */
  vt2Pct: 1.0,
  /**
   * ⛔ THE RIDE'S VT1 CEILING IS ON THE PAGE. p239 prescribes easy riding as *"below 75%"*, and the
   * library already resolves a ride VT1 step to `ftp * 0.75` on that authority.
   */
  rideVt1Pct: 0.75,
} as const;

export const ENDURANCE_LEDGER_UNSTATED =
  'Two boundaries this ledger needs are not in the source. The first ventilatory threshold has no '
  + 'percentage: on a run it is taken from the athlete\'s OWN measured easy pace against their own '
  + 'threshold pace, and where that is not on file the minutes are reported unplaced rather than '
  + 'guessed. And above threshold, p146 puts "just over" the second ventilatory threshold in the '
  + 'near-threshold bucket and "notably over" it in the over-threshold bucket without saying where '
  + 'one becomes the other — so those minutes are reported together, unsplit.';

/**
 * ⛔ WHERE VT1 SITS FOR THIS ATHLETE, AS A FRACTION OF THRESHOLD — MEASURED, NOT PICKED.
 *
 * ⚠️ RUN: both anchors are the athlete's own. `anchor.value` is their threshold pace and
 * `anchor.vt1SecPerMi` their measured easy pace, and speed is the reciprocal of pace — so VT1 as a
 * fraction of threshold SPEED is `thresholdPace / easyPace`. Nothing is invented; if either is
 * missing the answer is null and the minutes go unplaced.
 * ⚠️ RIDE: p239's own ceiling, 0.75 of FTP.
 * ⚠️ SWIM: no VT1 anchor exists anywhere in this library, so it is null and says so.
 */
export function vt1FractionFor(anchor: AnchorReport): number | null {
  if (anchor.sport === 'ride') return ENDURANCE_LEDGER_BOUNDARIES.rideVt1Pct;
  if (anchor.sport !== 'run') return null;
  const threshold = Number(anchor.value);
  const vt1 = Number(anchor.vt1SecPerMi);
  if (!Number.isFinite(threshold) || !Number.isFinite(vt1) || threshold <= 0 || vt1 <= 0) return null;
  const fraction = threshold / vt1;
  // ⚠️ A RATIO OUTSIDE (0,1] MEANS THE TWO ANCHORS DISAGREE about which is the faster pace. Refused
  // rather than clamped: a clamp would hand back a number that looks measured and is not.
  return fraction > 0 && fraction <= 1 ? fraction : null;
}

export type StepPlacement =
  | { kind: 'bucket'; bucket: IntensityBucket }
  | { kind: 'over_vt2'; band: { lo: number; hi: number } }
  | { kind: 'unplaced'; reason: string };

/**
 * ⛔ ONE STEP'S PLACEMENT, from the step's OWN intensity. A warm-up inside a threshold session is
 * easy minutes and not threshold minutes, and a 60% recovery jog inside p232's interval is sub-VT1
 * wherever it sits.
 *
 * ⚠️ `race_pace` IS UNPLACED ON PURPOSE. Race pace is near vVO2 for a 5K and near threshold for a
 * marathon; the library refuses to resolve it (*"set by the race being trained for, not by this
 * library"*) and guessing a bucket would be inventing the athlete's race.
 */
export function placeStep(step: Step, anchor: AnchorReport): StepPlacement {
  const i = step.intensity;
  // ⛔ AT OR BELOW VT1 BY THE LIBRARY'S OWN VOCABULARY — no percentage needed.
  if (i.kind === 'easy' || i.kind === 'vt1' || i.kind === 'drill') {
    return { kind: 'bucket', bucket: 'sub_vt1' };
  }
  /**
   * ⛔ HIS OWN WORK-SET LINE (p146): work significantly past the zone 4/5 line stops being minutes
   * and becomes a set, "because these intervals are, by definition, capped at a few minutes at most,
   * the aerobic contributions here are minimal… and muscular effort is quite high". The library
   * encodes exactly that split as its own kinds — `faster_than_vvo2` is p229's *"greater than vVO2
   * pace"* region and `all_out` is *"best possible speed for the day"*.
   */
  if (i.kind === 'all_out' || i.kind === 'faster_than_vvo2') {
    return { kind: 'bucket', bucket: 'work_set' };
  }
  if (i.kind === 'race_pace') return { kind: 'unplaced', reason: 'race pace is set by the race, not by this library' };

  const vt1 = vt1FractionFor(anchor);
  const band = i.kind === 'below_pct' ? { lo: 0, hi: i.hi } : { lo: i.lo, hi: i.hi };

  // ⛔ ABOVE THE STATED VT2 LINE — the one place p146 gives two buckets and no boundary between them.
  if (band.hi > ENDURANCE_LEDGER_BOUNDARIES.vt2Pct) return { kind: 'over_vt2', band };
  if (vt1 == null) {
    return { kind: 'unplaced', reason: `no measured first ventilatory threshold for ${anchor.sport}` };
  }
  // ⚠️ THE WHOLE BAND MUST SIT UNDER VT1 TO COUNT AS SUB-VT1. A band straddling it is zone 3 work
  // with an easy tail, and p146's near-threshold bucket is where that belongs.
  if (band.hi <= vt1) return { kind: 'bucket', bucket: 'sub_vt1' };
  return { kind: 'bucket', bucket: 'near_threshold' };
}

const EMPTY: EnduranceLedger = {
  subVt1Minutes: 0,
  nearThresholdMinutes: 0,
  overThresholdMinutes: 0,
  overVt2Minutes: 0,
  overVt2Band: null,
  workSets: 0,
  untimedSteps: 0,
  isLowerBound: false,
  unplacedMinutes: 0,
  unplacedReasons: [],
};

/**
 * ⛔ THE WEEK'S BUCKETS, over every session handed in.
 *
 * ⚠️ EVERY REPEAT IS WALKED, not multiplied through — a block's `restBetween` is skipped on its last
 * repeat exactly as the library's own `totalsFor` skips it, so the two arithmetics cannot disagree.
 */
export function enduranceLedgerFor(sessions: EnduranceSession[]): EnduranceLedger {
  const out: EnduranceLedger = { ...EMPTY, unplacedReasons: [] };
  const reasons = new Set<string>();
  let bandLo: number | null = null;
  let bandHi: number | null = null;

  const account = (step: Step, anchor: AnchorReport) => {
    const placed = placeStep(step, anchor);
    if (placed.kind === 'bucket' && placed.bucket === 'work_set') {
      // ⛔ COUNTED, NOT CLOCKED. Its seconds are deliberately not added to any minutes bucket.
      out.workSets += 1;
      return;
    }
    // ⚠️ A NULL CLOCK IS UNMEASURED. Recorded, and the totals are declared a lower bound.
    if (step.seconds == null) { out.untimedSteps += 1; return; }
    const minutes = step.seconds / 60;
    if (placed.kind === 'unplaced') {
      out.unplacedMinutes += minutes;
      reasons.add(placed.reason);
      return;
    }
    if (placed.kind === 'over_vt2') {
      out.overVt2Minutes += minutes;
      bandLo = bandLo == null ? placed.band.lo : Math.min(bandLo, placed.band.lo);
      bandHi = bandHi == null ? placed.band.hi : Math.max(bandHi, placed.band.hi);
      return;
    }
    if (placed.bucket === 'sub_vt1') out.subVt1Minutes += minutes;
    else if (placed.bucket === 'near_threshold') out.nearThresholdMinutes += minutes;
    else out.overThresholdMinutes += minutes;
  };

  for (const session of sessions) {
    const anchor = session.anchor;
    for (const s of session.warmup) account(s, anchor);
    for (const b of session.blocks) {
      for (let r = 0; r < b.repeat; r++) {
        for (const s of b.steps) account(s, anchor);
        if (b.restBetween && r < b.repeat - 1) account(b.restBetween, anchor);
      }
    }
    for (const s of session.cooldown) account(s, anchor);
  }

  out.subVt1Minutes = Math.round(out.subVt1Minutes);
  out.nearThresholdMinutes = Math.round(out.nearThresholdMinutes);
  out.overThresholdMinutes = Math.round(out.overThresholdMinutes);
  out.overVt2Minutes = Math.round(out.overVt2Minutes);
  out.unplacedMinutes = Math.round(out.unplacedMinutes);
  out.overVt2Band = bandLo == null || bandHi == null ? null : { lo: bandLo, hi: bandHi };
  out.isLowerBound = out.untimedSteps > 0;
  out.unplacedReasons = [...reasons].sort();
  return out;
}
