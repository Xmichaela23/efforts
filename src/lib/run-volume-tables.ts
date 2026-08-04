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
 * Week-by-week long-run distance, indexed from week 1. Moved verbatim from `sustainable.ts`.
 *
 * ⚠️ INDEXED FORWARD FROM WEEK 1, not backward from race day — the tail (the built-in taper) is
 * only reached when the plan is long enough, or when `getProgressionOffset` shifts the entry point
 * using the athlete's recent long run. That is a known limitation, not a thing to fix from here.
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
