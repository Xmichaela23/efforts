// =============================================================================
// run-volume-tables — the ONE copy of the run plan's mileage tables
// =============================================================================
//
// ⛔ WHY THESE MOVED HERE (2026-08-04). They were engine-private, both of them inside
// `generators/sustainable.ts` — the generator a marathon race plan actually runs on. The
// intake now has to VALIDATE a typed weekly-mileage against them — "does this athlete's week
// support the long run this plan will prescribe" — and a validator cannot answer that with its own
// copy of the numbers. A second copy is how the intake starts telling the athlete one thing while
// the engine builds another.
//
// Same move, same direction, same reason as `src/lib/session-frequency-defaults.ts`, whose header
// records the precedent: the canonical copy lives in `src/lib/` and the deno edge functions import
// it directly via a relative path. Supabase bundles `src/lib/` into each function at deploy time.
//
// ⛔ SO: EDITING THIS FILE CHANGES THE ENGINE, AND THE ENGINE ONLY PICKS IT UP ON A REDEPLOY.
// `generate-run-plan` must be redeployed after any change here (CLAUDE.md, the `_shared` deploy
// trap — it applies to `src/lib/` identically).
//
// ⚠️ A THIRD COPY OF `LONG_RUN_PROGRESSION` STILL EXISTS at
// `generate-run-plan/generators/simple-completion.ts:19`. It is left alone deliberately: that
// generator is one of the five dead ones (`CAPABILITY-MAP` "I almost rebuilt this" #4) and is not
// switched on. Do not "consolidate" it without first deciding whether that file should exist.

/**
 * ⛔ THE TABLE THE LIVE MARATHON PATH ACTUALLY USES, AND IT IS NOT THE ONE YOU WILL BE POINTED AT.
 *
 * `generate-run-plan/types.ts:380` exports `FITNESS_TO_VOLUME`, which LOOKS canonical — it is
 * exported, it carries `longRunCap` and `weeklyIncrease`, and `base-generator.ts` has four
 * accessors for it. **Neither live generator calls any of them.** `calculateStartingVolume`,
 * `calculatePeakVolume`, `getLongRunCap` and `getWeeklyIncrease` are reached only from
 * `distributeVolume` (zero callers) and `generators/volume-progression.ts` (a dead generator).
 *
 * What actually runs for a marathon is `calculateWeeklyMileage` in `generators/sustainable.ts`,
 * reading a private `WEEKLY_MILEAGE` const — **and the two tables disagree**:
 *
 *   marathon        FITNESS_TO_VOLUME      WEEKLY_MILEAGE (live)
 *   beginner        15 → 35                20 → 40
 *   intermediate    35 → 55                30 → 50
 *   advanced        55 → 85                40 → 60
 *
 * Validating a typed mileage against `FITNESS_TO_VOLUME` would therefore have told the athlete a
 * requirement the engine does not hold them to — the intake and the engine disagreeing, which is
 * the exact failure this file exists to prevent. So this is the live table, moved here verbatim,
 * and `FITNESS_TO_VOLUME` is deliberately left where it is: it belongs to dead code, and moving it
 * would only make it look more canonical than it is.
 */
export interface WeeklyMileageBand {
  start: number;
  peak: number;
}

export const WEEKLY_MILEAGE: Record<string, Record<string, WeeklyMileageBand>> = {
  'marathon': {
    'beginner': { start: 20, peak: 40 },
    'intermediate': { start: 30, peak: 50 },
    'advanced': { start: 40, peak: 60 }
  },
  'half': {
    'beginner': { start: 15, peak: 30 },
    'intermediate': { start: 25, peak: 40 },
    'advanced': { start: 35, peak: 50 }
  },
  '10k': {
    'beginner': { start: 12, peak: 25 },
    'intermediate': { start: 20, peak: 35 },
    'advanced': { start: 30, peak: 45 }
  },
  '5k': {
    'beginner': { start: 10, peak: 20 },
    'intermediate': { start: 18, peak: 30 },
    'advanced': { start: 25, peak: 40 }
  }
};
/**
 * Week-by-week long-run distance. Moved verbatim from `sustainable.ts`.
 *
 * ⛔ READ AS A SHAPE, NOT AS A CALENDAR (2026-08-06). It used to be read forward from week 1 — plan
 * week 1 took entry 0 — so a plan shorter than the row simply stopped partway up the build and the
 * athlete raced off the last rung they happened to reach. A 9-week beginner marathon peaked at a
 * 10-mile long run **in race week**, with no taper, because the tail was never reached.
 *
 * `buildLongRunArc` below now indexes it BACKWARD from race day: the row's final pre-taper rung
 * lands on the peak week (the last week whose long run sits more than 14 days out) and the taper
 * that follows is the row's own tail, re-expressed as ratios of whatever peak was actually reached.
 *
 * ⚠️ THE ROW'S SHAPE IS LOAD-BEARING IN TWO PLACES NOW, so do not re-order it:
 *   • the LAST THREE entries are `peak, taper, race week` — `buildLongRunArc` reads the taper ratios
 *     off them rather than inventing coefficients.
 *   • every 4th entry (index 3, 7, 11, …) is a RECOVERY dip. The arc keeps the peak week off a dip
 *     by shifting its entry point down, which only works while dips stay on that cadence.
 */
export const LONG_RUN_PROGRESSION: Record<string, Record<string, number[]>> = {
  'marathon': {
    'beginner': [
      // Weeks 1-4: Build 6→8, recovery drops to 6
      6, 7, 8, 6,
      // Weeks 5-8: Resume 8→11, recovery drops to 8
      8, 9, 10, 8,
      // Weeks 9-12: Resume 10→13, recovery drops to 10
      10, 11, 12, 10,
      // Weeks 13-16: Peak at 18, recovery drops to 13
      14, 16, 18, 13,
      // Weeks 17-20: Final build and taper
      15, 17, 12, 8    // Week 17 resume, 18 peak, 19 taper, 20 race week
    ],
    'intermediate': [
      8, 9, 10, 8,      // Weeks 1-4
      10, 11, 12, 10,   // Weeks 5-8
      12, 14, 16, 12,   // Weeks 9-12
      16, 18, 20, 14,   // Weeks 13-16
      16, 18, 14, 10   // Weeks 17-20: Final build and taper
    ],
    'advanced': [
      10, 11, 12, 10,   // Weeks 1-4
      12, 14, 16, 12,   // Weeks 5-8
      16, 18, 20, 14,   // Weeks 9-12
      18, 20, 20, 16,   // Weeks 13-16
      18, 20, 16, 12    // Weeks 17-20: Final build and taper
    ]
  },
  'half': {
    'beginner': [5, 6, 7, 5, 7, 8, 9, 7, 9, 10, 11, 8],
    'intermediate': [6, 7, 8, 6, 8, 9, 10, 8, 10, 11, 12, 8],
    'advanced': [8, 9, 10, 8, 10, 11, 12, 10, 12, 13, 14, 10]
  },
  '10k': {
    'beginner': [4, 5, 6, 4, 5, 6, 7, 5, 7, 8, 8, 6],
    'intermediate': [5, 6, 7, 5, 7, 8, 9, 7, 9, 10, 10, 7],
    'advanced': [7, 8, 9, 7, 9, 10, 11, 8, 10, 11, 12, 8]
  },
  '5k': {
    'beginner': [3, 4, 5, 3, 4, 5, 6, 4, 6, 7, 7, 5],
    'intermediate': [4, 5, 6, 4, 6, 7, 8, 6, 8, 9, 9, 6],
    'advanced': [6, 7, 8, 6, 8, 9, 10, 7, 9, 10, 11, 7]
  }
};

// ── The long-run arc, anchored to race day ───────────────────────────────────

/**
 * ⛔ THE WEEK-OVER-WEEK VOLUME CEILING. ~10% is the field's oldest rule of thumb and the one every
 * commercial builder still ships (Runna, Garmin Coach, Higdon's "never more than 10%"). It is a
 * GUARD, not a target: the tables set where the week starts and where it is going, this only stops
 * the straight line between them from being steeper than a body absorbs.
 *
 * ⚠️ APPLIED TO THE BUILD TREND. A cutback week neither advances the trend nor becomes the base for
 * the next week's ceiling, so "10%" means 10% over the biggest week the athlete has actually run —
 * which is the claim worth making. Without that, the trend climbs underneath the deload and they
 * come back to a week 22% over their last real one.
 *
 * ⚠️ APPLIED IN `generators/sustainable.ts` `calculateWeeklyMileage`, which imports it. It lives
 * here because it is a volume-table rule, and so there is one number rather than two.
 */
export const MAX_WEEKLY_MILEAGE_INCREASE = 1.10;

/**
 * ⛔ WHERE THE ROW'S OWN TAPER STARTS — its LAST peak, not a fixed depth from the end.
 *
 * ⚠️ THE ROWS DO NOT AGREE ON THIS AND ASSUMING THEY DID WAS A BUG. The marathon rows end
 * `peak, taper, race week` (…17, 12, 8) — a two-week taper. The half, 10K and 5K rows end
 * `peak, race week` (…11, 12, 8) — one week. Reading a fixed three-deep tail off a half row makes
 * its "taper" the number 12 against a peak of 11, i.e. a 9% RISE into race week.
 *
 * So: the last four rungs, and the LAST index holding their maximum (the 10K rows hold their peak
 * for two weeks — the later one is where the taper begins). Everything after it is the taper.
 */
function tailPeakIndex(progression: number[]): number {
  const len = progression.length;
  const from = Math.max(0, len - 4);
  let best = from;
  for (let i = from; i <= len - 2; i++) {
    if (progression[i] >= progression[best]) best = i;
  }
  return Math.min(best, len - 2);
}

/**
 * Where in the row an athlete's CURRENT long run sits — the entry rung.
 *
 * 95% target, so there is a very slight pullback and never a regression beyond ~5%. Uncapped: the
 * caller decides how deep the plan's own length allows them to enter (`buildLongRunArc` takes the
 * lower of this and the race-day anchor).
 *
 * ⚠️ `base-generator.getProgressionOffset` calls this — one scan, not two. If you change the target
 * fraction, both the arc and every other generator move together, which is the point.
 */
export function longRunEntryIndex(progression: number[], recentLongRunMi?: number | null): number {
  if (!recentLongRunMi || recentLongRunMi <= 0 || progression.length === 0) return 0;
  const target = recentLongRunMi * 0.95;
  let bestIndex = 0;
  for (let i = 0; i < progression.length; i++) {
    if (progression[i] <= target) bestIndex = i;
    else break;
  }
  return bestIndex;
}

/**
 * ⛔ WHICH PLAN WEEK CARRIES THE PEAK LONG RUN — read off the race DATE, not the plan's length.
 *
 * The last week whose long run sits MORE than 14 days out. 15 days is not a taste: the generator's
 * own `getRaceProximitySession` already calls anything inside 14 days `reduced_quality` and clamps
 * that Sunday to 10 miles, so a peak landing there would be silently halved by a rule two functions
 * away. Just outside it is also where Higdon's Novice rows put their longest run.
 *
 * ⚠️ ONE COPY, TWO CALLERS — the generator and the intake. They quote the same peak week or the
 * screen describes a plan the engine did not build. Plan weeks start Monday and the long run is
 * Sunday, matching `base-generator.getDateForSession`.
 *
 * Falls back to `durationWeeks - 2` (a two-week taper) when either date is missing.
 */
export function longRunPeakWeek(opts: {
  durationWeeks: number;
  startDateISO?: string | null;
  raceDateISO?: string | null;
}): number {
  const duration = Math.floor(opts.durationWeeks);
  const fallback = Math.max(1, duration - 2);
  if (!opts.startDateISO || !opts.raceDateISO) return fallback;
  const start = new Date(`${opts.startDateISO}T00:00:00`);
  const race = new Date(`${opts.raceDateISO}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(race.getTime())) return fallback;
  const DAY = 24 * 60 * 60 * 1000;
  for (let w = duration; w >= 1; w--) {
    const longRunDay = start.getTime() + ((w - 1) * 7 + 6) * DAY; // Monday-start week → its Sunday
    if (Math.floor((race.getTime() - longRunDay) / DAY) > 14) return Math.min(w, Math.max(1, duration - 1));
  }
  return fallback;
}

/**
 * The taper a prescriptive block uses: fractions of the peak for the weeks after it.
 *
 * ⚠️ SOURCED, NOT PICKED. Pfitzinger's 18/55 tapers 20 → 16 → 12 over its last three weeks (0.80,
 * 0.60); Michael's spec is 18 → 14 → 10 (0.78, 0.56). These are the same shape, and they are
 * SHALLOWER than the row's own tail (0.71, 0.47 — Higdon's), which is why the row's tail is not
 * reused here: a block that generated its ramp to reach the peak did not walk the row, so it does
 * not inherit the row's descent either.
 */
export const PRESCRIPTIVE_TAPER_RATIOS = [0.78, 0.55];

/** The biggest step the marathon rows ever take between two build weeks (12→14→16→18). */
const MAX_LONG_RUN_STEP_MI = 2;

export interface LongRunArc {
  /** Long run in miles for plan week w → `weeks[w - 1]`. Length === durationWeeks. */
  weeks: number[];
  /** The plan week the build ends on — the last long run before the taper. */
  peakWeek: number;
  /** The long run on that week. NOT necessarily the block's longest (the rows dip after their max). */
  peakMi: number;
  /** The longest run anywhere in the block — what the athlete will actually have run. */
  maxMi: number;
  /** The longest run this distance/level's row ever prescribes, at full length. */
  tableMaxMi: number;
  /** False when the plan ran out of weeks before the row's peak — the honest-ceiling case. */
  reachesTableMax: boolean;
}

/**
 * ⛔ THE LONG-RUN ARC, BUILT BACKWARD FROM RACE DAY (2026-08-06).
 *
 * Three rules, in this order:
 *   1. **The peak week is where the race puts it**, not where week 1 does. The caller passes the
 *      last plan week whose long run is more than 14 days out; everything after it is taper.
 *   2. **The build is the table's own ladder**, walked one rung a week, entered at the LOWER of
 *      (where the athlete already is) and (the rung that lands the row's final peak on the peak
 *      week). A short plan therefore climbs the same ladder and simply stops lower — it never skips
 *      rungs to reach a number the athlete's legs have not earned.
 *   3. **The taper is the row's own tail as ratios of the peak actually reached** — so a block that
 *      tops out at 10 miles tapers off 10, not off the 18 it never ran.
 *
 * ⚠️ NO NEW COEFFICIENTS. Every number here comes out of `LONG_RUN_PROGRESSION`.
 *
 * ⚠️ AT FULL LENGTH THIS IS A NO-OP. A 20-week marathon with no history enters at rung 0, walks to
 * the row's peak on week 18 and tapers on the row's own last two values — byte-identical to what
 * the forward read produced. Only plans shorter than the row change.
 */
export function buildLongRunArc(opts: {
  distance: string;
  fitness: string;
  durationWeeks: number;
  /** The athlete's current longest run, miles. Absent → the row's opening rung. */
  entryLongRunMi?: number | null;
  /** Plan week the peak lands on. Default `durationWeeks - 2` (a two-week taper). */
  peakWeek?: number | null;
  /**
   * The block's assumed base (`MARATHON_PREREQUISITE`). Present → the arc is a PRESCRIPTION: it
   * opens at the prerequisite (or higher, if the athlete's own long run beats it) and climbs to the
   * row's peak, generating the ramp when walking the row cannot get there in the weeks available.
   * Absent → the arc walks the row from wherever the athlete actually is, and tops out where it tops.
   */
  prerequisiteLongRunMi?: number | null;
  /** True when race day falls in the LAST week, so that week carries no long run to taper into. */
  raceWeekIsLast?: boolean;
}): LongRunArc | null {
  const progression = LONG_RUN_PROGRESSION[opts.distance]?.[opts.fitness];
  const duration = Math.floor(opts.durationWeeks);
  if (!Array.isArray(progression) || progression.length < 4 || duration < 1) return null;

  const tailPeakIdx = tailPeakIndex(progression);
  const tailPeak = progression[tailPeakIdx];
  /** The row's own taper, as fractions of its peak. One entry for a half, two for a marathon. */
  const rowTailRatios = progression.slice(tailPeakIdx + 1).map((v) => v / tailPeak);
  // Capped at 20: a longer window adds weeks near the peak, never a bigger single run.
  const tableMaxMi = Math.min(PEAK_LONG_RUN_CEILING_MI, progression.reduce((a, b) => (b > a ? b : a), 0));
  /** The row's own cutback depth (beginner 6/8 = 0.75, advanced 10/12 = 0.83). */
  const recoveryRatio = progression[2] > 0 ? progression[3] / progression[2] : 0.75;

  const peakWeek = Math.min(
    Math.max(1, Math.floor(opts.peakWeek ?? duration - 2) || 1),
    Math.max(1, duration - 1),
  );

  // ── The build ────────────────────────────────────────────────────────────
  const anchorIdx = tailPeakIdx - (peakWeek - 1);
  let startIdx = Math.min(longRunEntryIndex(progression, opts.entryLongRunMi), anchorIdx);
  if (((startIdx + peakWeek - 1) % 4 + 4) % 4 === 3) startIdx -= 1;
  const rung = (w: number) => Math.min(tailPeakIdx, Math.max(0, startIdx + w - 1));

  const prerequisite = opts.prerequisiteLongRunMi ?? null;
  // ⚠️ THE TRIGGER IS THE WALK'S HIGHEST WEEK, NOT ITS LAST. The rows dip after their maximum (the
  // beginner row peaks 18 at rung 14 and ends its build on 17), so comparing the PEAK WEEK's value
  // against the row max would call a full-length walk "short" and prescribe over the top of it.
  let rowWalkMax = 0;
  for (let w = 1; w <= peakWeek; w++) rowWalkMax = Math.max(rowWalkMax, progression[rung(w)]);
  /**
   * ⛔ GENERATE THE RAMP WHEN THE ROW CANNOT REACH THE PEAK IN TIME. Walking one rung a week is the
   * right ramp for a full-length block and simply runs out of weeks on a short one — a 9-week
   * beginner walking from rung 0 tops out at 9 miles. A prescription cannot do that: the peak is
   * the point. So the ramp is generated from the prerequisite to the row's own maximum, stepping at
   * the row's own biggest step (2 miles) or less, with the row's own cutback depth every 4th week.
   *
   * ⚠️ THE STEP IS STILL CAPPED. If the peak is further than `2 × climbing weeks`, the block lands
   * short and `reachesTableMax` says so — a prescription may not skip rungs any more than a walk may.
   */
  const prescriptive = prerequisite != null && rowWalkMax < tableMaxMi;
  const weeks: number[] = [];

  if (prescriptive) {
    const entry = Math.max(prerequisite, Number(opts.entryLongRunMi) > 0 ? Number(opts.entryLongRunMi) : 0);
    const cutbacks: number[] = [];
    for (let w = 4; w < peakWeek; w += 4) cutbacks.push(w);
    const climbing = Math.max(1, peakWeek - 1 - cutbacks.length);
    const step = Math.max(0, Math.min(MAX_LONG_RUN_STEP_MI, (tableMaxMi - entry) / climbing));
    let current = entry;
    let last = entry;
    for (let w = 1; w <= peakWeek; w++) {
      if (w === 1) { weeks.push(Math.round(entry)); last = entry; continue; }
      if (cutbacks.includes(w)) { weeks.push(Math.round(last * recoveryRatio)); continue; }
      current = Math.min(tableMaxMi, last + step);
      last = current;
      weeks.push(Math.round(current));
    }
  } else {
    for (let w = 1; w <= peakWeek; w++) weeks.push(progression[rung(w)]);
  }

  // ── The taper ────────────────────────────────────────────────────────────
  // Race day carries no long run, so when it falls in the last week the ratios are anchored to the
  // week BEFORE it — otherwise the descent is one week late and the athlete's last real long run is
  // a week bigger than the taper intends (18 → 16 → 14 instead of 18 → 14 → 10).
  const tailRatios = prescriptive ? PRESCRIPTIVE_TAPER_RATIOS : rowTailRatios;
  const peakMi = weeks[peakWeek - 1];
  const lastTaperWeek = opts.raceWeekIsLast ? duration - 1 : duration;
  const taperCount = Math.max(0, lastTaperWeek - peakWeek);
  const extraWeeks = Math.max(0, taperCount - tailRatios.length);
  for (let w = peakWeek + 1; w <= duration; w++) {
    const j = w - peakWeek;
    const fromEnd = Math.max(0, taperCount - j);
    const ratio = fromEnd < tailRatios.length
      ? tailRatios[tailRatios.length - 1 - fromEnd]
      : 1 + (tailRatios[0] - 1) * (j / (extraWeeks + 1));
    weeks[w - 1] = Math.max(3, Math.round(peakMi * ratio));
  }

  const maxMi = weeks.reduce((a, b) => (b > a ? b : a), 0);
  return { weeks, peakWeek, peakMi, maxMi, tableMaxMi, reachesTableMax: maxMi >= tableMaxMi };
}

/**
 * ⛔ WHAT THE LONGEST RUN IN THIS BLOCK ACTUALLY REACHES — the number the intake owes the athlete
 * before they commit, and the one no screen has ever stated.
 *
 * A short timeline does not make the plan wrong; it makes its ceiling lower, and the ceiling is a
 * fact the athlete can act on (run the half, or move the race) while a silently truncated build is
 * one they find out about in the race. Same arc the engine builds, same file, so the number quoted
 * here is the number that will be prescribed.
 *
 * ⚠️ PASS THE DATES. Without them the peak week falls back to `duration - 2`, which a race early in
 * its plan week shifts by one — and a shifted peak week is a different rung, so the screen would
 * quote a mile the engine does not build. `longRunPeakWeek` is the one rule; both callers use it.
 *
 * Returns null when the tables do not carry the distance/level — say nothing rather than guess.
 */
export function longRunCeiling(
  distance: string,
  fitness: string,
  durationWeeks: number,
  entryLongRunMi?: number | null,
  dates?: { startDateISO?: string | null; raceDateISO?: string | null },
): { peakLongRunMi: number; peakWeek: number; tableMaxMi: number; shortOfTable: boolean } | null {
  const arc = buildLongRunArc({
    distance,
    fitness,
    durationWeeks,
    entryLongRunMi,
    peakWeek: longRunPeakWeek({ durationWeeks, ...(dates ?? {}) }),
  });
  if (!arc) return null;
  return {
    peakLongRunMi: arc.maxMi,
    peakWeek: arc.peakWeek,
    tableMaxMi: arc.tableMaxMi,
    shortOfTable: !arc.reachesTableMax,
  };
}

/**
 * ⛔ THE FIELD'S PEAK LONG RUN FOR THE DISTANCE, so the intake can say what "short" is short OF.
 * Marathon 18-20 is Higdon's Novice (20), Pfitzinger's 18/55 entry (18-20) and our own rows
 * (beginner 18, intermediate 20, advanced 20) agreeing. Half is the same three sources at 12-14.
 */
export const TYPICAL_PEAK_LONG_RUN_MI: Record<string, [number, number]> = {
  marathon: [18, 20],
  half: [12, 14],
  '10k': [7, 9],
  '5k': [5, 7],
};

// ── The validator ────────────────────────────────────────────────────────────

/**
 * ⛔ THE ENGINE'S OWN SILENT CLAMP, NAMED. `resolveEffectiveStartVolume`
 * (`generators/base-generator.ts:198`) floors week 1 at `start × 0.7` and ceils it at
 * `peak × 0.95`, against the LIVE `WEEKLY_MILEAGE` band above. Type a number below that floor and **the engine quietly uses the floor
 * instead** — it does not refuse, warn, or record that it overrode you.
 *
 * That silent override is the whole reason a typed number needed validating: without this, an
 * athlete typing 12 mi/wk as an "intermediate" gets a 21 mi/wk week one and is never told.
 *
 * ⚠️ REUSED, NOT CHOSEN. If the clamp in the generator changes, change it here in the same breath —
 * `runVolumeFloorMi` below is only honest while the two agree.
 */
export const ENGINE_START_CLAMP_FRACTION = 0.7;

/**
 * ⛔ THE MARATHON BASE FLOOR — AND THIS ONE IS OURS, NOT THE ENGINE'S. Michael's call, 2026-08-04:
 * *"enforce a start FLOOR (~25-30 mi/wk — below it, base-build message, don't silently build)."*
 *
 * ⚠️ IT CONTRADICTS THE ENGINE'S OWN BEGINNER ROW AND THAT IS THE POINT. the live table
 * starts a beginner marathoner at 20 mi/wk, and its clamp floor is 14 — so the table is willing to
 * build a marathon block for someone running fourteen miles a week. The floor says the table is
 * wrong about that particular athlete: the distance has a base requirement that does not care what
 * level you ticked.
 *
 * ⚠️ SO IT IS A PRODUCT DECISION SITTING ON TOP OF A SCIENCE TABLE, and it should be re-argued
 * rather than tuned. 25 is the bottom of the band Michael named. It binds for beginners
 * (whose other two rules land at 14 and 17); for intermediate and advanced the long-run share and
 * the engine clamp are already higher, so the floor never fires there.
 */
export const MARATHON_BASE_FLOOR_MI = 25;

/**
 * ⛔ THE PEAK LONG RUN IS CAPPED AT 20, WHATEVER THE WINDOW (2026-08-06). Michael: *extra weeks add
 * volume and repeat long runs, not a longer single run.* Nobody's build is improved by a 24-miler;
 * the field stops at 20-22 (Higdon 20, Pfitzinger 20-22, Daniels caps by TIME at 2.5-3h). A longer
 * window buys weeks NEAR the peak and a bigger week, not a bigger single run.
 */
export const PEAK_LONG_RUN_CEILING_MI = 20;

export interface MarathonPrerequisite {
  /** The weekly mileage the block assumes you already have. */
  weeklyMi: number;
  /** The long run it assumes you already have. */
  longRunMi: number;
  /** What this block builds to — the row's max, capped at 20. */
  peakLongRunMi: number;
  /** What the weekly ramp targets. The peak long run lands at 45/40/33% of it by level. */
  peakWeeklyMi: number;
  /**
   * False when the window is too short for ANY honest prerequisite — the athlete would have to
   * arrive already marathon-fit. The plan says so and names the half rather than pretending.
   */
  meetable: boolean;
}

/**
 * ⛔ THE PREREQUISITE — WHAT THE BLOCK ASSUMES YOU HAVE, COMPUTED FROM THE WINDOW (2026-08-06).
 *
 * THE MODEL, and it reverses the posture the arc shipped with this morning: that version entered
 * the row wherever the athlete actually was and stated the ceiling it produced — a 9-week beginner
 * topped out at a 9-mile long run and the screen said so. Honest, and not a marathon plan; nobody
 * finishes 26.2 off a 9-mile peak. So the block builds the peak the distance needs and STATES what
 * it assumed, which is how every published plan is written (Higdon's "about a year of running",
 * Pfitzinger's 55-mile weeks).
 *
 * ⛔ IT IS A FUNCTION OF THE WINDOW, NOT A CONSTANT — that is the whole design. Work backward from
 * the peak at the only rates the block may use:
 *   • the long run climbs at most 2 miles a week (the rows' own biggest step), so a window with C
 *     climbing weeks must OPEN at `peak − 2C`;
 *   • the week climbs at most 10% (`MAX_WEEKLY_MILEAGE_INCREASE` — Michael: *hold the cap, do not
 *     raise the ramp*), so it must open at `peakWeekly / 1.1^C`.
 * Short windows quote a high base; long windows stop binding and bottom out at the row's own
 * opening, which is where a plan with time to spare starts anyway.
 *
 * ⚠️ THE PEAK IS THE SAME AT EVERY LEVEL AND THE BASE IS WHAT MOVES. 18/20/20 against 40/50/60 is a
 * 45% / 40% / 33% long-run share — the exact ratios `MAX_LONG_RUN_SHARE` below documents the tables
 * as already embodying. None of these numbers is new; they are the tables read backward.
 *
 * ⚠️ 9 WEEKS, BEGINNER, WORKED: peak week 6, one cutback → C = 4. Long run 18 − 8 = **10**. Weekly
 * 40 / 1.1⁴ = 27.3 → **28**. Both are the numbers Michael specified by hand, which is the check
 * that the formula is the rule he was describing rather than a fit to one case.
 */
export function marathonPrerequisiteFor(opts: {
  distance: string;
  fitness: string;
  durationWeeks: number;
  /** The week the peak lands on. Defaults to a two-week taper. */
  peakWeek?: number | null;
}): MarathonPrerequisite | null {
  const band = WEEKLY_MILEAGE[opts.distance]?.[opts.fitness];
  const row = LONG_RUN_PROGRESSION[opts.distance]?.[opts.fitness];
  if (!band || !Array.isArray(row) || row.length === 0) return null;

  const duration = Math.floor(opts.durationWeeks);
  const peakWeek = Math.min(
    Math.max(1, Math.floor(opts.peakWeek ?? duration - 2) || 1),
    Math.max(1, duration - 1),
  );
  let cutbacks = 0;
  for (let w = 4; w < peakWeek; w += 4) cutbacks++;
  const climbing = Math.max(1, peakWeek - 1 - cutbacks);

  const peakLongRunMi = Math.min(PEAK_LONG_RUN_CEILING_MI, row.reduce((a, b) => (b > a ? b : a), 0));
  const peakWeeklyMi = band.peak;
  const neededLongRun = peakLongRunMi - MAX_LONG_RUN_STEP_MI * climbing;
  const neededWeekly = peakWeeklyMi / Math.pow(MAX_WEEKLY_MILEAGE_INCREASE, climbing);

  /**
   * ⚠️ UNMEETABLE AT 80% OF THE PEAK, and it is a judgement with a reason: past it the block asks
   * the athlete to arrive with a 16-mile long run so it can "build" them to 18 — which is not a
   * marathon build, it is two weeks of tapering. It fires below about six weeks; the timeline
   * advisory has been stating the shortfall since fourteen.
   */
  const meetable = neededLongRun <= peakLongRunMi * 0.8;

  return {
    weeklyMi: Math.max(band.start, Math.round(neededWeekly)),
    longRunMi: Math.max(row[0], Math.round(neededLongRun)),
    peakLongRunMi,
    peakWeeklyMi,
    meetable,
  };
}

/**
 * ⛔ WHAT SHARE OF THE WEEK THE LONG RUN MAY BE. The 25-30% guidance, with the beginner allowance.
 *
 * ⚠️ THE TABLES ALREADY EMBODY THIS AT PEAK and disagree with a flat number, which is why the
 * allowance exists rather than one constant: at peak, the marathon rows run
 * **beginner 18/40 = 45%, intermediate 20/50 = 40%, advanced 20/60 = 33%.** A beginner's long run
 * is a much bigger share of a much smaller week, deliberately — it is the session that has to
 * happen, and there is less week to hide it in.
 *
 * ⚠️ APPLIED TO WEEK ONE ONLY. The ramp pulls the ratio down every week after that (weekly volume
 * climbs toward `peakWeekly` while the long run climbs more slowly), so week 1 is the binding case
 * for a typed starting mileage. Later weeks are the engine's problem, not the intake's.
 */
export const MAX_LONG_RUN_SHARE: Record<string, number> = {
  beginner: 0.35,
  intermediate: 0.30,
  advanced: 0.30,
};

export type WeeklyMilesVerdict =
  | { ok: true; requiredMi: number; longRunWeek1Mi: number; sharePct: number }
  | {
      ok: false;
      requiredMi: number;
      longRunWeek1Mi: number;
      /** Which rule bound — so the message can say the true reason rather than a generic one. */
      bound: 'base_floor' | 'engine_clamp' | 'long_run_share';
    };

/** Week-1 long run the plan will prescribe for this distance + level (offset 0 = no history). */
export function longRunWeek1Mi(distance: string, fitness: string): number | null {
  const arc = LONG_RUN_PROGRESSION[distance]?.[fitness];
  return arc && arc.length > 0 ? arc[0] : null;
}

/**
 * The minimum honest starting mileage for this distance + level, and WHY it is that number.
 *
 * Three rules, and the largest wins:
 *   1. the distance's base floor (ours — `MARATHON_BASE_FLOOR_MI`)
 *   2. the engine's silent clamp (`tableStart × 0.7`) — below it the typed number is discarded
 *   3. the long-run share — the week has to be big enough to carry week 1's long run
 *
 * Returns `null` for a distance/level the tables do not cover, so a caller can stay silent rather
 * than invent a requirement.
 */
export function runVolumeFloorMi(
  distance: string,
  fitness: string,
): { requiredMi: number; bound: 'base_floor' | 'engine_clamp' | 'long_run_share' } | null {
  const vol = WEEKLY_MILEAGE[distance]?.[fitness];
  const lr = longRunWeek1Mi(distance, fitness);
  if (!vol || lr == null) return null;

  const share = MAX_LONG_RUN_SHARE[fitness] ?? 0.30;
  const candidates: Array<{ mi: number; bound: 'base_floor' | 'engine_clamp' | 'long_run_share' }> = [
    // The base floor is marathon-only — it is a claim about THAT distance, not about running.
    { mi: distance === 'marathon' ? MARATHON_BASE_FLOOR_MI : 0, bound: 'base_floor' },
    { mi: vol.start * ENGINE_START_CLAMP_FRACTION, bound: 'engine_clamp' },
    { mi: lr / share, bound: 'long_run_share' },
  ];
  const winner = candidates.reduce((a, b) => (b.mi > a.mi ? b : a));
  return { requiredMi: Math.ceil(winner.mi), bound: winner.bound };
}

/** Does this typed weekly mileage support the plan we would build? */
export function validateWeeklyMiles(
  distance: string,
  fitness: string,
  typedMi: number | null | undefined,
): WeeklyMilesVerdict | null {
  const floor = runVolumeFloorMi(distance, fitness);
  const lr = longRunWeek1Mi(distance, fitness);
  if (!floor || lr == null) return null;
  if (typeof typedMi !== 'number' || !Number.isFinite(typedMi) || typedMi <= 0) return null;

  if (typedMi < floor.requiredMi) {
    return { ok: false, requiredMi: floor.requiredMi, longRunWeek1Mi: lr, bound: floor.bound };
  }
  return {
    ok: true,
    requiredMi: floor.requiredMi,
    longRunWeek1Mi: lr,
    sharePct: Math.round((lr / typedMi) * 100),
  };
}

// ── Intake tier seeds (2026-08-04) ───────────────────────────────────────────

/**
 * ⛔ WHAT THE LEVEL BUTTON SEEDS INTO THE TWO EDITABLE FIELDS. Michael's table, and it is NOT the
 * same thing as `WEEKLY_MILEAGE` / `LONG_RUN_PROGRESSION` above — those describe what the PLAN
 * does; this describes where the ATHLETE is now. The long-run numbers differ on purpose: the plan
 * opens a beginner at a 6-mile long run and an advanced at 10, but an advanced athlete's *current*
 * long run is 13. One is a prescription, the other is a prerequisite.
 *
 * ⛔ SINGLE NUMBERS, NOT RANGES, AND THE BOTTOM OF EACH BAND. The field below the button is a
 * number and the athlete edits from it, so a range cannot be seeded. Bottom-of-band because
 * **under-seeding is the safer error**: the long run feeds `recent_long_run_miles`, which
 * `getProgressionOffset` (`generators/base-generator.ts:133`) uses to decide how far INTO the
 * long-run arc the plan starts. An inflated seed enters the arc deeper than the athlete's legs
 * have earned; a low one just costs a week of easy running.
 *
 * ⚠️ SOURCED, NOT PICKED. Weekly mileage matches `WEEKLY_MILEAGE.marathon` exactly (20/30/40).
 * The long runs sit in Higdon's Novice 2 prerequisite band (about a year of running, 15-25 mi/wk)
 * and under Pfitzinger's 18/55 entry gate, which is where tier three belongs for a plan we would
 * actually generate.
 *
 * ⚠️ THE COPY SAYS THE RANGE; THE FIELD GETS THE NUMBER. "40+ miles a week" on the button,
 * `weeklyMi: 40` in the field.
 */
export type IntakeTier = 'beginner' | 'intermediate' | 'advanced';

export const TIER_SEEDS: Record<IntakeTier, { weeklyMi: number; longRunMi: number }> = {
  beginner: { weeklyMi: 20, longRunMi: 6 },
  intermediate: { weeklyMi: 30, longRunMi: 10 },
  advanced: { weeklyMi: 40, longRunMi: 13 },
};

/**
 * ⛔ THE SOFT SIGNAL, AND IT IS NOT A GATE. The field's shape: nobody blocks, everybody signals —
 * Runna warns on an implausible 5K time, Garmin drifts a confidence ring, 80/20 makes switching
 * tiers free. Books gate (Pfitzinger's prerequisite, Higdon's "about a year of running"); apps
 * suggest.
 *
 * Returns a plain statement of what the athlete entered versus what the tier assumes, ONLY when
 * they contradict each other by enough to matter. Null means say nothing.
 *
 * ⚠️ 25% BELOW THE SEED IS THE TRIGGER, and it is a threshold not a science: far enough that the
 * numbers genuinely disagree, loose enough that editing 30 down to 27 says nothing. It exists so
 * the line is rare — a signal that fires often is decoration.
 */
export function tierMismatchNote(
  tier: IntakeTier,
  typed: { weeklyMi?: number | null; longRunMi?: number | null },
): string | null {
  const seed = TIER_SEEDS[tier];
  if (!seed) return null;
  const low = (v: number | null | undefined, s: number) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 && v < s * 0.75;
  const weeklyLow = low(typed.weeklyMi, seed.weeklyMi);
  const longLow = low(typed.longRunMi, seed.longRunMi);
  if (!weeklyLow && !longLow) return null;
  if (weeklyLow && longLow) {
    return `You have entered ${typed.weeklyMi} miles a week and a ${typed.longRunMi}-mile long run. This tier assumes about ${seed.weeklyMi} and ${seed.longRunMi}.`;
  }
  if (weeklyLow) {
    return `You have entered ${typed.weeklyMi} miles a week. This tier assumes about ${seed.weeklyMi}.`;
  }
  return `You have entered a ${typed.longRunMi}-mile long run. This tier assumes about ${seed.longRunMi}.`;
}
