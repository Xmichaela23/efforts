// ============================================================================
// THE WEEK LEDGER — the five weekly numbers, in the shape they are STORED and SENT.
//
// ⛔ IT COMPUTES NOTHING. Every number here is lifted verbatim off a week the composer already
// built: the endurance three come from `ComposedWeek.enduranceLedger` (`endurance-ledger.ts`,
// p146's buckets 1-3), the two counts from `ComposedWeek.ledger` (`accessory-dosing/ledger.ts`,
// buckets 4 and 5). ⚠️ A SECOND COMPUTATION OF EITHER IS THE BUG THIS FILE EXISTS TO PREVENT —
// see the work order's *"one surface, two sources, neither recomputed"*.
//
// ⛔ WHY IT EXISTS AT ALL. Both ledgers have been computed at build time since 2026-08-27 and
// **nothing read either of them**: `compose.ts:2644` attached the endurance one to the composed
// week and it died there — not persisted, not returned, not rendered. This is the plumbing, and
// it is deliberately the whole of the change: no new arithmetic, no new source reading.
//
// ⛔ TYPE-ONLY IMPORTS, ON PURPOSE. The React client reads `WeekLedgerV1` off the coach payload
// (`@shared/standing-plan`), and a runtime import here would drag the composer into the bundle.
// ============================================================================

import type { ComposedWeek } from './compose.ts';
import type { MuscleGroup, MuscleVerdict, SessionVerdict } from '../accessory-dosing/index.ts';

/** One muscle group's line, carried whole. ⚠️ See `reps` below for why it is not collapsed here. */
export type WeekLedgerMuscle = {
  muscle: MuscleGroup;
  sets: number;
  /** ⛔ His formula — sets x 4 (p147, p086). Not ours, and not re-derived. */
  effectiveReps: number;
  verdict: MuscleVerdict;
};

/**
 * ⛔⛔ ONE LIFTING SESSION'S WORK SETS, AND ITS COST TO THE NEXT DAY — the line the week's total
 * cannot answer.
 *
 * ⛔ HIS FIGURE IS PER SESSION, NOT PER WEEK (p147, `SESSION_CEILING_NOTE`): *"A session of 6 to 8
 * work sets leaves only marginal deficits a day later… At 14 or more, performance in other
 * disciplines drops significantly for a day and is still notably down as far out as three."* A
 * weekly total of 37 says nothing about whether tomorrow's run is compromised; four sessions of 9
 * and one of 16 are the same week and a different answer.
 *
 * ⚠️ THE VERDICT IS `ledger.ts`'s AND IS NOT RE-DERIVED HERE — `verdictForSessionSets` owns the
 * bands, and a second copy of them is how the two come to disagree.
 * ⚠️ BOTH READINGS RIDE ALONG, for the same reason `strengthIfAllCounted` does: `verdict` counts
 * the sets that meet his fatigue test, `verdictIfAllCounted` counts DE and SKILL too. They
 * disagree on a real session — a DE day reads `above_recovers` on one and `costly` on the other —
 * and which one a surface states is a ruling, not a default.
 */
export type WeekLedgerSession = {
  /** The session as the composer labelled it, e.g. "ME: Upper". */
  label: string;
  /** Sets that meet his fatigue test. Warm-ups excluded. */
  countedSets: number;
  /** ⚠️ DE and SKILL — the source classifies neither, so they are reported rather than filed. */
  unclassifiedSets: number;
  totalIfAllCounted: number;
  verdict: SessionVerdict;
  verdictIfAllCounted: SessionVerdict;
};

export type WeekLedgerV1 = {
  version: 1;
  week: number;
  isTestWeek: boolean;
  /**
   * ⛔ p146's BUCKETS 1-3, IN MINUTES, summed across run and ride. They are the same unit and they
   * sum to the week's endurance time, which is the point of holding them together: a week the
   * athlete calls "two hard sessions" is overwhelmingly easy minutes.
   * ⚠️ LIFTING HAS NO MINUTES IN HERE AT ALL (p146 excludes resistance training) — the barbell's
   * side of the week is a COUNT, and it lives in `workSets` below.
   */
  minutes: {
    easy: number;
    mediumHard: number;
    hard: number;
    /**
     * ⛔ REPORTED, NOT FILED — and it stays that way. p146 splits *"just over"* from *"notably
     * over"* threshold and states neither edge as a number, so these minutes are named rather than
     * bucketed. `band` carries the percentages seen so a later ruling can split them without a
     * rebuild. Do not fold this into `hard`.
     */
    overVt2: number;
    overVt2Band: { lo: number; hi: number } | null;
  };
  /**
   * ⛔ `total` IS THE RULED ANSWER (2026-08-28): the barbell sets that meet his fatigue test, plus
   * the endurance side's sprint-family efforts. A reader takes `total`; the parts are beside it. His test is *"if muscular fatigue/failure
   * causes the set to end, it's a high-intensity work set"* — a DE set at 70-80% with 3-4 reps in
   * reserve does not end for that reason, and pp218-219 discourage fatigue there in as many words.
   * ⚠️ `strengthIfAllCounted` KEEPS THE OTHER ANSWER ON THE PAYLOAD so a later ruling costs no
   * rebuild. It is DE and SKILL — sets the source never classifies, which `ledger.ts` refuses to
   * guess at rather than filing them silently.
   */
  workSets: {
    total: number;
    strength: number;
    endurance: number;
    strengthIfAllCounted: number;
    /**
     * ⛔ THE PER-SESSION LINES — see {@link WeekLedgerSession}. The week's total answers "how much
     * work"; only these answer "does tomorrow cost anything", which is the question his 6-8 / 14+
     * figure is actually about.
     * ⚠️ LIFTING SESSIONS ONLY. The endurance side's work sets are counted (`endurance` above) and
     * not sessionised — `enduranceLedgerFor` counts efforts across the week, and inventing a
     * per-session split of them here would be arithmetic this file has no business doing.
     */
    perSession: WeekLedgerSession[];
  };
  /**
   * ⛔ CARRIED WHOLE, AND NOT COLLAPSED TO ONE FIGURE — HELD FOR MICHAEL (2026-08-28). His own
   * worked examples report this bucket as a RANGE per region (*"10-15 lower"*, *"30-35 upper,
   * 35-40 lower"*, pp147-148), never as a single number, so which figure a surface states is his
   * ruling and not an engineering default. The full per-muscle lines ride the payload; any
   * presentation of them is a read against numbers that are already here.
   */
  reps: { perMuscle: WeekLedgerMuscle[]; floorSets: number; belowFloor: MuscleGroup[] };
  /**
   * ⛔ HOW COMPLETE THE MINUTES ARE, ON THE PAYLOAD AND OFF THE SCREEN.
   *
   * ⚠️ `untimedSteps` / `isLowerBound`: MEASURED BEFORE ANYTHING WAS DESIGNED FOR IT (2026-08-28) —
   * true on every week of every block, and it is 2 warm-up mobility drills the page prints without
   * a clock plus 5 strides recoveries it calls *"full recovery"*. About 5 minutes in 412, all of it
   * easy or drill, **zero in medium-hard or hard**, so the bar's shape cannot move. Ruled: the bar
   * prints bare totals and says nothing. These ride along for a later ruling.
   *
   * ⛔ `unplacedMinutes` IS THE DIFFERENT AND BIGGER ONE — 43 of 412 minutes (10%) on an athlete
   * with no measured run VT1, with a named reason. Unmodified here on purpose: the display answer
   * is Michael's, and it is the case the screen has to be honest about.
   */
  completeness: {
    untimedSteps: number;
    isLowerBound: boolean;
    unplacedMinutes: number;
    unplacedReasons: string[];
  };
};

/**
 * ⛔ ONE BUILT WEEK → ONE STORED LEDGER. Reads, never computes.
 *
 * ⚠️⚠️ NO COMPARISON, NO DELTA, NO PREVIOUS WEEK — and the measurement behind that is the reason
 * this file has no surface (2026-08-28). At build, every week of a standing block is the same week:
 * `NO_SCHEDULED_DELOAD_CITE` (p120), the standard week is built to be run indefinitely. Measured on
 * a composed twelve-week block: identical minutes on all twelve weeks, identical set counts from
 * week 2 on. So these five are Viada's tool for WRITING a block, fixed at build — a weekly readout
 * of them would show the athlete one picture twelve times and call it news. **The numbers are
 * stored and sent because they are the plan's own record and an input to what a surface will ask;
 * WHAT that surface is has not been ruled. Do not render them without one.**
 */
export function weekLedgerFor(wk: ComposedWeek): WeekLedgerV1 {
  const e = wk.enduranceLedger;
  const strengthCounted = wk.ledger.perSession.reduce((t, s) => t + s.countedSets, 0);
  const strengthIfAll = wk.ledger.perSession.reduce((t, s) => t + s.totalIfAllCounted, 0);
  return {
    version: 1,
    week: wk.week,
    isTestWeek: wk.isTestWeek,
    minutes: {
      easy: e.subVt1Minutes,
      mediumHard: e.nearThresholdMinutes,
      hard: e.overThresholdMinutes,
      overVt2: e.overVt2Minutes,
      overVt2Band: e.overVt2Band,
    },
    workSets: {
      total: strengthCounted + e.workSets,
      strength: strengthCounted,
      endurance: e.workSets,
      strengthIfAllCounted: strengthIfAll,
      perSession: wk.ledger.perSession.map((s) => ({
        label: s.label,
        countedSets: s.countedSets,
        unclassifiedSets: s.unclassifiedSets,
        totalIfAllCounted: s.totalIfAllCounted,
        verdict: s.verdict,
        verdictIfAllCounted: s.verdictIfAllCounted,
      })),
    },
    reps: {
      perMuscle: wk.ledger.perMuscle.map((m) => ({
        muscle: m.muscle,
        sets: m.sets,
        effectiveReps: m.effectiveReps,
        verdict: m.verdict,
      })),
      floorSets: wk.ledger.floorSets,
      belowFloor: [...wk.ledger.belowFloor],
    },
    completeness: {
      untimedSteps: e.untimedSteps,
      isLowerBound: e.isLowerBound,
      unplacedMinutes: e.unplacedMinutes,
      unplacedReasons: [...e.unplacedReasons],
    },
  };
}

/** ⛔ THE STORED SHAPE — keyed by week number, exactly as `sessions_by_week` is. */
export type WeekLedgersByWeek = Record<string, WeekLedgerV1>;

export function weekLedgersFor(weeks: ComposedWeek[]): WeekLedgersByWeek {
  const out: WeekLedgersByWeek = {};
  for (const wk of weeks) out[String(wk.week)] = weekLedgerFor(wk);
  return out;
}
