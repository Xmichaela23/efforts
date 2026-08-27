// ============================================================================
// THE ENDURANCE LEDGER — his buckets 1-3, in MINUTES, summed across every modality.
//
// ⛔⛔ THE UNIT IS THE POINT. p146 opens by naming the problem it solves: systems exist for tracking
// volume WITHIN one modality and *"there are few practical ways to track total load across different
// stimuli."* His answer is five weekly markers, tracked across all of them:
//
//   1. sub-VT1 minutes          2. near-threshold minutes      3. over-threshold minutes
//   4. high-intensity work sets 5. effective hypertrophy reps per muscle group
//
// ⛔ 4 AND 5 ALREADY EXIST — `accessory-dosing/ledger.ts` (`ledgerFor`), which correctly counts
// strength work sets per p147 and is NOT recomputed here. This module is 1-3 and the endurance side
// of 4; `weekMarkers` puts the pair together.
//
// ⛔⛔ SUMMED ACROSS RUN AND RIDE, NEVER PER SPORT. Two hour dials cannot say whether a week is 78%
// easy or 50% easy, and those are different programs. Per-sport ledgers are the shape this replaces.
//
// ⚠️ WARM-UPS, COOLDOWNS AND RECOVERIES ARE MINUTES TOO, and that asymmetry is the first thing this
// ledger exists to reveal: a 95-minute threshold session may hold only 8-19 minutes of threshold
// work and the rest is sub-VT1. A week that reads as "two hard sessions" is mostly easy minutes.
// **That is the finding, not a bug.**
//
// ⚠️ NO UI, NO ATHLETE INPUT. Nothing here is asked for or shown; it is arithmetic over sessions the
// composer already built.
//
// ⚠️ PROVENANCE LIMIT, STATED: p146 is not in `book-sources/` in this tree, so the rules below are
// coded from `docs/HANDOFF-endurance-and-progression-2026-08-26.md` §G3, which records them as
// page-verified. The two boundary decisions this module makes are labelled OURS regardless.
// ============================================================================

import type { EnduranceSession, FamilyId, Step } from '../endurance-library/index.ts';

export type IntensityBucket = 'sub_vt1' | 'near_threshold' | 'over_threshold' | 'work_set';

export type EnduranceLedger = {
  /** Minutes above zone 1 and below VT1. ⛔ Resistance training is never in here (p146). */
  subVt1Minutes: number;
  /** Minutes between VT1 and just over VT2 — zone 3 crossing into zone 4. */
  nearThresholdMinutes: number;
  /** Minutes notably over threshold, through to vVO2max. */
  overThresholdMinutes: number;
  /**
   * ⛔ EFFORTS PAST HIS WORK-SET LINE, COUNTED AS SETS RATHER THAN MINUTES (p146). Endurance only —
   * the barbell side of this bucket is `DoseLedger`'s and is not touched here.
   */
  workSets: number;
  /**
   * ⛔ STEPS THE SOURCE GIVES NO CLOCK FOR — "full recovery" and untimed rest. **Unmeasured, never
   * zero**, the same way `demonstratedRunVolume` returns a null rather than a zero. Their minutes
   * are missing from the totals above, which is why `isLowerBound` exists.
   */
  untimedSteps: number;
  /** True when any step carried no clock. A reader must say "at least", never "=". */
  isLowerBound: boolean;
  /** Steps whose intensity this module cannot place. Named, never silently dropped into a bucket. */
  unclassifiedSteps: number;
  unclassifiedKinds: string[];
};

/**
 * ⛔⛔ WHICH BUCKET A FAMILY'S WORK BELONGS IN — the source's own classification of its own sessions,
 * read off each family's page rather than off a percentage this module would have to invent.
 *
 * ⚠️ WHY NOT PERCENTAGES. Every `pct_threshold` band in the library is a percent of THRESHOLD, and
 * placing zone lines on that scale means choosing two numbers ("VT1 is 0.80 of threshold", "just
 * over VT2 is 1.15") that no page states. The families already carry his classification: `run_mlss`
 * is labelled Threshold and cited pp231-232, `run_near_threshold` is Near-threshold, `run_vt1` and
 * `run_lsd` are at or below VT1, and the sprint/anaerobic families are the ones he prices as work
 * sets. Reading the table is reading him; picking the percentages would not be.
 *
 * ⛔ THE SPRINT AND ANAEROBIC FAMILIES ARE `work_set`, AND THAT IS HIS RULE, NOT A SHORTCUT. p146:
 * work significantly past the zone 4/5 line is not counted as over-threshold MINUTES — each interval
 * is quantified as a work set, because the aerobic contribution is minimal and the muscular effort
 * is high. His stated boundary is close to vVO2max for the minutes bucket and about 5 to 10 percent
 * faster than vVO2max for the work-set bucket; the library encodes exactly that split as its own
 * `faster_than_vvo2` and `all_out` intensity kinds. He notes it "may be controversial for some".
 *
 * ⚠️ SO THE STRIDES SHIPPED ON THE EASY RUN ARE WORK SETS, NOT MINUTES — four to eight of them are
 * four to eight entries in bucket 4. p147 names "a hard sprint interval" as a work set in as many
 * words. Expected, and correct.
 */
const FAMILY_BUCKET: Record<FamilyId, IntensityBucket> = {
  run_sprint_power: 'work_set',
  run_mlss: 'over_threshold',
  run_near_threshold: 'near_threshold',
  run_vt1: 'sub_vt1',
  run_lsd: 'sub_vt1',
  ride_sprints: 'work_set',
  ride_anaerobic: 'work_set',
  ride_vo2: 'over_threshold',
  ride_sweet_spot: 'near_threshold',
  ride_endurance: 'sub_vt1',
  swim_endurance: 'sub_vt1',
  swim_speed: 'over_threshold',
  swim_open_water: 'sub_vt1',
};

export const ENDURANCE_LEDGER_BOUNDARIES_ARE_OURS =
  'Which bucket each session family belongs to is read off the source\'s own labels and pages, but '
  + 'two decisions inside that are ours: that a float step counts one bucket below the work it sits '
  + 'between, and that warm-ups, cooldowns and timed recoveries count as sub-VT1 minutes. He states '
  + 'that all minutes count and that the buckets are minutes of actual exercise; he does not say '
  + 'where a float lands.';

/**
 * ⛔ ONE STEP'S BUCKET. Classified by the step's OWN intensity first, because a warm-up in a
 * threshold session is easy minutes and not threshold minutes — which is the asymmetry the ledger
 * exists to show.
 *
 * ⚠️ `race_pace` IS UNCLASSIFIED ON PURPOSE. Race pace for a 5K sits near vVO2 and for a marathon
 * near threshold; the library itself refuses to resolve it (*"set by the race being trained for, not
 * by this library"*). Guessing a bucket for it would be inventing the athlete's race.
 */
export function bucketForStep(step: Step, family: FamilyId): IntensityBucket | null {
  const kind = step.intensity.kind;
  // ⛔ EASY IS EASY WHEREVER IT SITS — wrappers, recoveries and drills are sub-VT1 minutes.
  if (kind === 'easy' || kind === 'vt1' || kind === 'below_pct' || kind === 'drill') return 'sub_vt1';
  // ⛔ PAST THE LINE HE DRAWS: counted as sets, not minutes.
  if (kind === 'all_out' || kind === 'faster_than_vvo2') return 'work_set';
  if (kind === 'race_pace') return null;
  // `pct_threshold` — the family says which bucket its own work is in.
  const own = FAMILY_BUCKET[family];
  if (step.role !== 'float') return own;
  /**
   * ⚠️ A FLOAT IS THE EASIER HALF OF AN ALTERNATION and counts one bucket down — ours. `Step.role`
   * defines it as below the family's work floor but still prescribed effort; MLSS's own float is
   * labelled "Near-threshold float" on the page's own archetype, which is the bucket below the work
   * it alternates with.
   */
  if (own === 'over_threshold') return 'near_threshold';
  if (own === 'near_threshold') return 'sub_vt1';
  return own;
}

const EMPTY: EnduranceLedger = {
  subVt1Minutes: 0,
  nearThresholdMinutes: 0,
  overThresholdMinutes: 0,
  workSets: 0,
  untimedSteps: 0,
  isLowerBound: false,
  unclassifiedSteps: 0,
  unclassifiedKinds: [],
};

/**
 * ⛔ THE WEEK'S BUCKETS 1-3 AND THE ENDURANCE HALF OF 4, over every session handed in.
 *
 * ⚠️ EVERY REPEAT IS WALKED, not multiplied through — a block's `restBetween` is skipped on its last
 * repeat exactly as `totalsFor` skips it, so the two arithmetics cannot disagree.
 */
export function enduranceLedgerFor(sessions: EnduranceSession[]): EnduranceLedger {
  const out: EnduranceLedger = { ...EMPTY, unclassifiedKinds: [] };
  const kinds = new Set<string>();

  const account = (step: Step, family: FamilyId) => {
    const bucket = bucketForStep(step, family);
    if (bucket === null) {
      out.unclassifiedSteps += 1;
      kinds.add(step.intensity.kind);
      return;
    }
    if (bucket === 'work_set') {
      // ⛔ COUNTED, NOT CLOCKED. Its seconds are deliberately not added to any minutes bucket.
      out.workSets += 1;
      return;
    }
    // ⚠️ A NULL CLOCK IS UNMEASURED. It is recorded and the totals are declared a lower bound.
    if (step.seconds == null) { out.untimedSteps += 1; return; }
    const minutes = step.seconds / 60;
    if (bucket === 'sub_vt1') out.subVt1Minutes += minutes;
    else if (bucket === 'near_threshold') out.nearThresholdMinutes += minutes;
    else out.overThresholdMinutes += minutes;
  };

  for (const session of sessions) {
    const family = session.family;
    for (const s of session.warmup) account(s, family);
    for (const b of session.blocks) {
      for (let r = 0; r < b.repeat; r++) {
        for (const s of b.steps) account(s, family);
        if (b.restBetween && r < b.repeat - 1) account(b.restBetween, family);
      }
    }
    for (const s of session.cooldown) account(s, family);
  }

  out.subVt1Minutes = Math.round(out.subVt1Minutes);
  out.nearThresholdMinutes = Math.round(out.nearThresholdMinutes);
  out.overThresholdMinutes = Math.round(out.overThresholdMinutes);
  out.isLowerBound = out.untimedSteps > 0;
  out.unclassifiedKinds = [...kinds].sort();
  return out;
}
