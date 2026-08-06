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
}): LongRunArc | null {
  const progression = LONG_RUN_PROGRESSION[opts.distance]?.[opts.fitness];
  const duration = Math.floor(opts.durationWeeks);
  if (!Array.isArray(progression) || progression.length < 4 || duration < 1) return null;

  const tailPeakIdx = tailPeakIndex(progression);
  const tailPeak = progression[tailPeakIdx];
  /** The row's own taper, as fractions of its peak. One entry for a half, two for a marathon. */
  const tailRatios = progression.slice(tailPeakIdx + 1).map((v) => v / tailPeak);

  const peakWeek = Math.min(
    Math.max(1, Math.floor(opts.peakWeek ?? duration - 2) || 1),
    Math.max(1, duration - 1),
  );

  // The rung that lands the row's final peak exactly on the peak week. Negative for a plan LONGER
  // than the row — the opening rung then repeats, which is the honest read: the extra weeks are
  // base weeks, not peak weeks.
  const anchorIdx = tailPeakIdx - (peakWeek - 1);
  let startIdx = Math.min(longRunEntryIndex(progression, opts.entryLongRunMi), anchorIdx);

  // ⚠️ NEVER FINISH THE BUILD ON A CUTBACK. Every 4th rung is a recovery dip; a plan whose last
  // build week landed on one would taper off a deloaded number and race two weeks off a dip. Shift
  // the entry DOWN a rung (never up — down costs a mile, up costs a week the legs have not had).
  if (((startIdx + peakWeek - 1) % 4 + 4) % 4 === 3) startIdx -= 1;

  const rung = (w: number) => Math.min(tailPeakIdx, Math.max(0, startIdx + w - 1));

  const weeks: number[] = [];
  for (let w = 1; w <= duration; w++) {
    if (w <= peakWeek) weeks.push(progression[rung(w)]);
    else weeks.push(0); // filled below, once the peak is known
  }

  // The taper, laid over the row's own tail: RACE WEEK IS ALWAYS THE LAST RATIO, and the rest are
  // matched back from it. A plan with more taper weeks than the row carries (a race early in its
  // plan week, or a half held to a marathon's two weeks) eases down to the row's first taper rung
  // rather than inventing a shape.
  const peakMi = weeks[peakWeek - 1];
  const taperCount = duration - peakWeek;
  const extraWeeks = Math.max(0, taperCount - tailRatios.length);
  for (let j = 1; j <= taperCount; j++) {
    const fromEnd = taperCount - j;
    const ratio = fromEnd < tailRatios.length
      ? tailRatios[tailRatios.length - 1 - fromEnd]
      : 1 + (tailRatios[0] - 1) * (j / (extraWeeks + 1));
    weeks[peakWeek - 1 + j] = Math.max(3, Math.round(peakMi * ratio));
  }

  const maxMi = weeks.reduce((a, b) => (b > a ? b : a), 0);
  const tableMaxMi = progression.reduce((a, b) => (b > a ? b : a), 0);
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
