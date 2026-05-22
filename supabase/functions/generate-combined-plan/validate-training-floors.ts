/**
 * Post-build physiological guardrails — orthogonal to the same-day 10×10 matrix.
 * Rejects "paperclip" weeks where raw TSS piles onto one anchor or ramps too fast.
 *
 * Rebuild path (`generate-combined-plan`): uniform phase `tssMultiplier` tightening alone does **not**
 * change long-run share or WoW ratios — the second pass uses `physiologicalFloorRebuild` in `buildWeek`
 * (lower weekly budget + shrink long-run miles).
 */

import type { GeneratedWeek, AthleteState, Phase, PhaseBlock, PlannedSession, Sport } from './types.ts';
import {
  DAYS_OF_WEEK,
  estimateSessionTSS,
  longRideFloorHours,
  longRideHoursForWeek,
  longRunFloorMiles,
  longRunMilesForWeek,
  rampWeeksForPhase,
  weightedTSS,
  type TriRaceDistance,
} from './science.ts';
import { blockForWeek } from './phase-structure.ts';

/**
 * Local mirror of `week-builder.ts: weekInPhaseForTimeline` — inlined to avoid
 * a circular import (`week-builder.ts` imports from this file). Identical
 * semantics: count backwards from `weekNum`, incrementing for each prior week
 * in the same phase + primaryGoalId, stopping at the first non-matching week.
 * Returns 1 for the first week of a phase block.
 */
function weekInPhaseInline(phaseBlocks: PhaseBlock[], weekNum: number, block: PhaseBlock): number {
  let n = 1;
  for (let w = weekNum - 1; w >= 1; w--) {
    const b = blockForWeek(phaseBlocks, w);
    if (b.phase === block.phase && b.primaryGoalId === block.primaryGoalId) n++;
    else break;
  }
  return n;
}

/**
 * Sanity ceiling on long-run raw TSS share — applied to **all** phases (no phase variation) for
 * both single-sport (vs weekly total raw TSS) and tri run-discipline (vs run-only raw TSS) paths.
 *
 * **Not a coaching constraint.** TrainingPeaks ATP / Friel-style methodology uses weekly hours,
 * CTL ramp, and duration floors — not TSS share caps — to size long sessions. The duration
 * floor (`longRunFloorMiles`, history-aware via `effectiveLongRunFloorMiles`) is the source of
 * truth for long-session size; the WoW ramp cap protects against overload; recovery week
 * mechanics handle deloading. This cap is a backstop that flags weeks where some other system
 * has gone wildly wrong (e.g. 90%+ of a week's TSS lands on one session).
 */
export const LONG_RUN_TSS_SHARE_MAX = 0.7;

/**
 * Tri-specific alias of {@link LONG_RUN_TSS_SHARE_MAX} for the run-discipline share path.
 * Same value — kept as a separate export so the response-payload telemetry shape (which surfaces
 * the single-sport vs run-discipline caps separately) doesn't have to change.
 */
export const LONG_RUN_TSS_SHARE_MAX_RUN_DISCIPLINE = 0.7;

/**
 * Tri fallback when weekly run TSS is too small to ratio meaningfully: LR vs total weekly raw TSS.
 * Stricter than the run-discipline cap because the denominator is the whole week (swim + bike +
 * run + strength) — a 50% concentration of total weekly TSS on one session is the sanity bound.
 */
export const LONG_RUN_TSS_SHARE_MAX_TRI_TOTAL_WEEK = 0.5;

/** Minimum weekly run raw TSS before we trust run-discipline share (else use tri total-week fallback). */
export const TRI_RUN_DISCIPLINE_SHARE_MIN_RUN_TSS = 40;

/**
 * Stricter ceiling used only during `physiologicalFloorRebuild`: realized weekly raw TSS often
 * lands slightly above `weeklyTSSBudget` (pinned anchors, swim floors), so an LR cap tied to 30%
 * of budget alone can still fail validation at exactly 30%.
 */
export const FLOOR_REBUILD_LONG_RUN_SHARE_OF_BUDGET = 0.17;

/** Last-resort rebuild pass — LR share vs realized weekly total (still validated at 30% of raw week). */
export const FLOOR_REBUILD_DEEP_LONG_RUN_SHARE_OF_BUDGET = 0.14;

/** Max week-over-week increase in **total_raw_tss** (WoW ramp) — single-sport / run-heavy weeks. */
export const WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX = 0.15;

/**
 * Tri / combined multi-sport: weekly total raw TSS aggregates swim + bike + run + strength.
 * Template churn within the **same phase** (swim slot mix, threshold yards) routinely moves the
 * composite week by slightly more than single-sport ramp guidance without implying overload.
 */
export const WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX_TRI = 0.2;

/** Applied to each phase block `tssMultiplier` on the automatic rebuild pass. */
export const FLOOR_REBUILD_TSS_MULTIPLIER_FACTOR = 0.87;

/** Allow continued tightening past early rebuild stops — weekly volume must be able to compress further. */
export const FLOOR_REBUILD_MIN_MULTIPLIER = 0.30;

export type PhysiologicalFloorCode =
  | 'LONG_RUN_TSS_SHARE'
  | 'WEEK_OVER_WEEK_TSS_RAMP'
  | 'LONG_DAY_VOLUME_FLOOR';

/**
 * `'fatal'` blocks the plan and routes through `physiologicalFloorRebuild`. `'soft'` surfaces in
 * `week_trade_offs` + telemetry and ships the plan unchanged. Long-day volume floors are soft by
 * design (per spec): a too-short long ride is a coachable nudge, not a structural failure.
 */
export type PhysiologicalFloorViolation = {
  code: PhysiologicalFloorCode;
  severity: 'fatal' | 'soft';
  message: string;
  week_num?: number;
  metrics: Array<{ name: string; observed: number; limit: number; unit?: string }>;
};

/** Sun-first `long_run_day` → Monday-first weekday name (matches `week-builder`). */
export function longRunDayNameFromAthleteState(state: AthleteState): string {
  const idx =
    state.long_run_day != null ? (state.long_run_day + 6) % 7 : DAYS_OF_WEEK.indexOf('Sunday');
  const safe = Math.max(0, Math.min(6, idx));
  return DAYS_OF_WEEK[safe] ?? 'Sunday';
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Sum raw TSS for sessions tagged `long_run` (generator contract). */
export function longRunRawTssFromWeek(week: GeneratedWeek): number {
  let t = 0;
  for (const s of week.sessions) {
    const tags = Array.isArray(s.tags) ? s.tags.map((x) => String(x).toLowerCase()) : [];
    if (tags.includes('long_run')) {
      t += Number(s.tss) || 0;
    }
  }
  return t;
}

export type TrainingFloorsResult = {
  ok: boolean;
  violations: PhysiologicalFloorViolation[];
};

export type ValidateTrainingFloorsOpts = {
  /** When true, long-run share is measured vs run-sport TSS (not whole-week TSS). */
  hasTri?: boolean;
  /** Override WoW ramp cap (optional — defaults use single-sport vs tri constants). */
  weekOverWeekRampMax?: number;
};

/**
 * Validates raw-TSS concentration and weekly ramp. Uses **long_run** tags — aligned with `GeneratedWeek` from `buildWeek`.
 * Tri plans: LR share vs **run** raw TSS (not vs swim+bike+run total).
 */
export function validateTrainingFloors(
  weeks: GeneratedWeek[],
  opts?: ValidateTrainingFloorsOpts,
): TrainingFloorsResult {
  const violations: PhysiologicalFloorViolation[] = [];
  const hasTri = opts?.hasTri === true;
  const wowMax =
    typeof opts?.weekOverWeekRampMax === 'number' &&
    Number.isFinite(opts.weekOverWeekRampMax) &&
    opts.weekOverWeekRampMax > 0 &&
    opts.weekOverWeekRampMax < 1
      ? opts.weekOverWeekRampMax
      : hasTri
        ? WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX_TRI
        : WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX;

  for (const w of weeks) {
    // Deload / recovery weeks intentionally preserve the long aerobic anchor while cutting bike/swim/strength —
    // do not apply whole-week LR concentration gates here.
    if (w.isRecovery) continue;

    const total = Math.max(0, w.total_raw_tss);
    if (total <= 0) continue;
    const lr = longRunRawTssFromWeek(w);
    if (lr <= 0) continue;

    const runRaw = Math.max(0, w.sport_raw_tss?.run ?? 0);
    let share: number;
    let limit: number;
    let basis: string;

    // Single sanity ceiling — no phase variation. Coaching-grade size control lives in the
    // duration floor (effectiveLongRunFloorMiles) and the WoW ramp cap; this is a backstop.
    if (hasTri && runRaw >= TRI_RUN_DISCIPLINE_SHARE_MIN_RUN_TSS) {
      share = lr / runRaw;
      limit = LONG_RUN_TSS_SHARE_MAX_RUN_DISCIPLINE;
      basis = 'weekly run-discipline raw TSS';
    } else if (hasTri) {
      // Low-run-volume tri week: denominator is the whole week (swim + bike + run + strength),
      // so a stricter ceiling makes sense — 50% of total weekly TSS on one session is the bound.
      share = lr / total;
      limit = LONG_RUN_TSS_SHARE_MAX_TRI_TOTAL_WEEK;
      basis = 'weekly total raw TSS (tri fallback — low run volume week)';
    } else {
      share = lr / total;
      limit = LONG_RUN_TSS_SHARE_MAX;
      basis = 'weekly total raw TSS';
    }

    if (share > limit + 1e-9) {
      violations.push({
        code: 'LONG_RUN_TSS_SHARE',
        severity: 'fatal',
        message: `Week ${w.weekNum}: long-run raw TSS is ${(share * 100).toFixed(1)}% of ${basis} (limit ${(limit * 100).toFixed(0)}%).`,
        week_num: w.weekNum,
        metrics: [
          {
            name: hasTri && runRaw >= TRI_RUN_DISCIPLINE_SHARE_MIN_RUN_TSS ? 'long_run_share_of_run_tss' : 'long_run_share',
            observed: round4(share),
            limit,
            unit: 'ratio',
          },
          {
            name: 'long_run_tss',
            observed: Math.round(lr),
            limit: Math.round(
              (hasTri && runRaw >= TRI_RUN_DISCIPLINE_SHARE_MIN_RUN_TSS ? runRaw : total) * limit,
            ),
            unit: 'tss',
          },
        ],
      });
    }
  }

  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1]!;
    const cur = weeks[i]!;
    if (prev.weekNum === 1) continue;
    // Recovery week suppresses volume; the following week legitimately rebounds — do not treat as a ramp violation.
    if (prev.isRecovery) continue;
    // Taper weeks intentionally suppress volume; the week after rebounds toward race/load — prior raw TSS is not a fair baseline.
    if (prev.phase === 'taper') continue;
    // Phase boundaries (e.g. base→build) intentionally swap swim templates and intensity mix — WoW total can move
    // more than 15% without matching "weekly overload" in one discipline (tri swim ramp is the usual spike).
    if (prev.phase !== cur.phase) continue;
    const p = Math.max(0, prev.total_raw_tss);
    if (p < 1) continue;
    // Very low prior-week totals (partial deloads not flagged `isRecovery`) — skip ramp vs noise.
    if (p < 120) continue;
    const ramp = (cur.total_raw_tss - p) / p;
    if (ramp > wowMax + 1e-9) {
      violations.push({
        code: 'WEEK_OVER_WEEK_TSS_RAMP',
        severity: 'fatal',
        message: `Week ${cur.weekNum}: weekly raw TSS increased ${(ramp * 100).toFixed(1)}% vs prior week (limit ${(wowMax * 100).toFixed(0)}%).`,
        week_num: cur.weekNum,
        metrics: [
          {
            name: 'wow_raw_tss_ramp',
            observed: round4(ramp),
            limit: wowMax,
            unit: 'ratio',
          },
          {
            name: 'weekly_raw_tss',
            observed: Math.round(cur.total_raw_tss),
            limit: Math.round(p * (1 + wowMax)),
            unit: 'tss',
          },
        ],
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

export function tightenPhaseBlocksForFloorRebuild<T extends { tssMultiplier: number }>(blocks: T[]): T[] {
  return blocks.map((b) => ({
    ...b,
    tssMultiplier: Math.max(
      FLOOR_REBUILD_MIN_MULTIPLIER,
      Math.round(b.tssMultiplier * FLOOR_REBUILD_TSS_MULTIPLIER_FACTOR * 1000) / 1000,
    ),
  }));
}

// ── Long-day volume floors (soft) ────────────────────────────────────────────
//
// Soft trade-offs only. A too-short long ride or long run on a normal training week is a coachable
// nudge: the plan still ships, the athlete sees the nudge in `week_trade_offs`, telemetry records it.
// Distinct from §4.19 long-run TSS *share* (hard, rebuild-routed) — that's about over-concentration;
// this is about under-volume. Phases skipped: recovery, taper, and the race-anchor week itself
// (taper + race week intentionally suppress long-day volume; flagging there fights the design).

/** Builder pace assumption (9:30/mi). Mirror — keep in lockstep with `week-builder.ts:730`. */
const LONG_RUN_PACE_MIN_PER_MI = 9.5;

export type LongDayFloorWarning = {
  weekNum: number;
  discipline: 'long_run' | 'long_ride';
  /** Athlete-facing prose, ready to push into `week_trade_offs`. */
  message: string;
  metrics: {
    observed: number;
    floor: number;
    unit: 'mi' | 'h';
    phase: Phase;
  };
};

export type EvaluateLongDayFloorsOpts = {
  /** Race anchor weeks (1-indexed plan week numbers). Skipped because race week has its own caps. */
  raceWeekNums?: number[];
  /** True for tri / multi-sport plans. Long-ride floor only evaluated when true. */
  hasTri: boolean;
  /** Primary A-race distance — feeds {@link longRunFloorMiles} / {@link longRideFloorHours}. */
  primaryDistance: TriRaceDistance;
  /**
   * Longest run distance (miles) in the last 30 days. The effective floor is
   * `max(longRunFloorMiles(distance, phase), recent × 0.5)` — history-aware so athletes already
   * running long miles don't get warned at the generic spec floor. Defaults to 0 (spec floor wins).
   */
  recentLongestRunMi?: number;
  /** Longest ride duration (hours) in the last 30 days. Same logic for the cycling side. */
  recentLongestRideHr?: number;
  /**
   * D-027: phase blocks for within-phase-aware floor computation. When provided, the spec floor
   * follows the lerp's within-phase ramp instead of the peak-of-phase value (matches the D-026
   * canonical contract at the week-builder layer). When omitted, falls back to peak-of-phase
   * (legacy behavior; preserves tests that don't thread phaseBlocks).
   */
  phaseBlocks?: PhaseBlock[];
};

/**
 * Map the current training phase to the phase whose floor caps history-derived adjustments.
 * Closes the over-prescription gap where an early-base athlete with a high recent-volume
 * history would be capped at race-distance peak (13 mi for 70.3), telling them to run race
 * distance in week 1 of base. The cap should be the NEXT phase's peak — base caps at build,
 * build caps at race-specific. Race-specific is its own ceiling.
 *
 * Rebuild caps at race-specific because the athlete just came off race-specific fitness; the
 * recent reference point is appropriate.
 */
function nextPhaseForLongDayFloorCap(phase: Phase): Phase {
  switch (phase) {
    case 'base':          return 'build';
    case 'build':         return 'race_specific';
    case 'race_specific': return 'race_specific';
    case 'rebuild':       return 'race_specific';
    case 'taper':         return 'race_specific';
    case 'recovery':      return 'race_specific';
    default:              return 'race_specific';
  }
}

/**
 * Effective long-run floor. History-aware: `max(longRunFloorMiles(distance, phase), recent × 0.5)`.
 * New users (recent = 0) get the spec floor; experienced athletes recently logging > 2 × spec floor
 * get a higher effective floor so the rebuild doesn't compress their long_run below half of what
 * they've recently demonstrated.
 *
 * **Canonical value contract:** the return value is both the threshold (compared against observed
 * mileage) AND the display value (interpolated into athlete-facing trade-off messages). Two
 * guardrails make that safe:
 *   1. **Next-phase cap** — `recent × 0.5` is bounded above by the NEXT phase's floor (via
 *      {@link nextPhaseForLongDayFloorCap}). Base caps at build's floor, build caps at
 *      race-specific's floor. Prevents an early-base athlete with a 40-mi history from being
 *      prescribed an 11-mi long run in week 1.
 *   2. **Display-friendly rounding** — rounded to the nearest 0.5 mi, matching the precision the
 *      underlying spec floor already emits. No `8.5mi vs 21.2335mi` strings can leak downstream.
 */
export function effectiveLongRunFloorMiles(
  distance: TriRaceDistance,
  phase: Phase,
  recentLongestRunMi: number,
  /**
   * D-027: within-phase-aware spec floor. When BOTH `weekInPhase` AND `rampWeeks`
   * are provided, the spec floor routes through `longRunMilesForWeek` — the same
   * canonical lerp the week-builder uses (D-026). When either is omitted, falls
   * back to `longRunFloorMiles` (peak-of-phase) for backward compat. This
   * threading is what lets the validator's `enforceLongDayFloors` (which
   * previously bumped 8.5mi → 10mi for 70.3 base wk 1 because the peak-of-
   * phase floor matched the lerp's PEAK endpoint) follow the lerp's
   * within-phase ramp instead. History-aware fromRecent path is unchanged —
   * still protects high-recent-volume athletes from under-prescription.
   */
  weekInPhase?: number,
  rampWeeks?: number,
  /**
   * D-031 (2026-05-22): rebuild-mode throttle. When `loadThrottle < 1.0`, the
   * spec floor follows the throttled lerp (with the peak-of-base floor applied
   * inside `longRunMilesForWeek`). Required for the validator to agree with the
   * week-builder when the rebuild loop runs — without it, the validator would
   * read the un-throttled peak-of-phase value and re-bump the throttled long
   * sessions back up, defeating the rebuild loop.
   */
  loadThrottle?: number,
): number {
  const spec = weekInPhase != null && rampWeeks != null
    ? longRunMilesForWeek(distance, phase, weekInPhase, rampWeeks, loadThrottle ?? 1.0)
    : longRunFloorMiles(distance, phase);
  const peakCap = longRunFloorMiles(distance, nextPhaseForLongDayFloorCap(phase));
  const fromRecent = Math.max(0, recentLongestRunMi) * 0.5;
  const raw = Math.max(spec, fromRecent);
  const capped = Math.min(raw, peakCap);
  return Math.round(capped * 2) / 2;
}

/**
 * Effective long-ride floor. Mirror of {@link effectiveLongRunFloorMiles} for cycling. Same
 * canonical-value contract: capped at the next phase's floor (via
 * {@link nextPhaseForLongDayFloorCap}) and rounded to the nearest 0.25 hr (matching the spec-floor
 * precision). Taper / recovery short-circuit to 0 (validators skip these phases anyway, but the 0
 * sentinel makes "no floor here" explicit).
 *
 * D-NNN (CYCLING-PROTOCOL Phase 1, 2026-05-21): within-phase-aware spec floor.
 * When BOTH `weekInPhase` AND `rampWeeks` are provided, the spec floor routes
 * through `longRideHoursForWeek` — the same canonical lerp the week-builder
 * uses post-Phase 1. Mirror of the run-side D-027 fix. Without this, the hard
 * enforcer would bump rides back to peak-of-phase even after the week-builder
 * lerps the canonical hours (same two-layer Math.max trap that motivated D-027).
 * History-aware `fromRecent` path is unchanged.
 */
export function effectiveLongRideFloorHours(
  distance: TriRaceDistance,
  phase: Phase,
  recentLongestRideHr: number,
  weekInPhase?: number,
  rampWeeks?: number,
  /**
   * D-031 (2026-05-22): rebuild-mode throttle. Same contract as
   * {@link effectiveLongRunFloorMiles}. Required for the validator to agree
   * with the throttled lerp during rebuild.
   */
  loadThrottle?: number,
): number {
  const spec = weekInPhase != null && rampWeeks != null
    ? longRideHoursForWeek(distance, phase, weekInPhase, rampWeeks, loadThrottle ?? 1.0)
    : longRideFloorHours(distance, phase);
  if (spec <= 0) return 0; // taper / recovery — skipped by validators anyway
  const peakCap = longRideFloorHours(distance, nextPhaseForLongDayFloorCap(phase));
  const fromRecent = Math.max(0, recentLongestRideHr) * 0.5;
  const raw = Math.max(spec, fromRecent);
  const capped = Math.min(raw, peakCap);
  return Math.round(capped * 4) / 4;
}

function maxLongRunMinutes(week: GeneratedWeek): number {
  let best = 0;
  for (const s of week.sessions) {
    const tags = Array.isArray(s.tags) ? s.tags.map((x) => String(x).toLowerCase()) : [];
    if (!tags.includes('long_run')) continue;
    const dur = Number(s.duration) || 0;
    if (dur > best) best = dur;
  }
  return best;
}

function maxLongRideMinutes(week: GeneratedWeek): number {
  let best = 0;
  for (const s of week.sessions) {
    const tags = Array.isArray(s.tags) ? s.tags.map((x) => String(x).toLowerCase()) : [];
    // Bug 4 (2026-05-12): count brick bike legs toward long-ride volume. Race-prep weeks often
    // replace the standalone long_ride with a brick (bike + run off-the-bike). If the brick's
    // bike leg meets or exceeds the floor, the long-ride durability box is checked. Counting it
    // here keeps observed-vs-floor honest: brick bike = 2.5h vs build floor 2.5h → no warning,
    // not "no long ride scheduled (observed=0)". Bike-leg only — this function measures
    // long-ride volume; the brick's run portion is a meaningful run stimulus per RUN-PROTOCOL
    // §5.7 (70.3 race-spec brick run = 5.5mi / ~55 min), but it doesn't belong in long-ride
    // accounting regardless of its length.
    const isBrickBike = tags.includes('brick') && (s.type === 'bike' || tags.includes('bike'));
    if (!tags.includes('long_ride') && !isBrickBike) continue;
    const dur = Number(s.duration) || 0;
    if (dur > best) best = dur;
  }
  return best;
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'race_specific': return 'race-specific';
    default: return phase;
  }
}

/**
 * Soft evaluation of long-ride and long-run volume floors. Skips recovery, taper, and race weeks.
 * Returns a list of athlete-facing warnings; never blocks the build.
 */
export function evaluateLongDayVolumeFloors(
  weeks: GeneratedWeek[],
  opts: EvaluateLongDayFloorsOpts,
): LongDayFloorWarning[] {
  const out: LongDayFloorWarning[] = [];
  const raceWeeks = new Set(opts.raceWeekNums ?? []);

  for (const w of weeks) {
    if (w.isRecovery) continue;
    if (w.phase === 'taper') continue;
    if (w.phase === 'recovery') continue;
    if (raceWeeks.has(w.weekNum)) continue;

    // Long run — applies to both single-sport (run) and tri.
    // D-027: thread weekInPhase + rampWeeks when phaseBlocks are available so
    // the soft validator floor follows the lerp instead of peak-of-phase.
    // D-031: thread loadThrottle (block.tssMultiplier capped at 1.0 for load phases)
    // so the validator's effective floor agrees with the throttled week-builder
    // output during rebuild.
    let wipSoft: number | undefined;
    let rwSoft: number | undefined;
    let throttleSoft: number | undefined;
    if (opts.phaseBlocks?.length) {
      const blk = blockForWeek(opts.phaseBlocks, w.weekNum);
      wipSoft = weekInPhaseInline(opts.phaseBlocks, w.weekNum, blk);
      rwSoft = rampWeeksForPhase(w.phase);
      throttleSoft = (w.phase === 'base' || w.phase === 'build' || w.phase === 'race_specific')
        ? Math.min(1.0, blk.tssMultiplier)
        : 1.0;
    }
    const lrFloorMi = effectiveLongRunFloorMiles(
      opts.primaryDistance,
      w.phase,
      opts.recentLongestRunMi ?? 0,
      wipSoft,
      rwSoft,
      throttleSoft,
    );
    if (lrFloorMi > 0) {
      const lrMin = maxLongRunMinutes(w);
      const lrMi = Math.round((lrMin / LONG_RUN_PACE_MIN_PER_MI) * 10) / 10;
      if (lrMi + 1e-9 < lrFloorMi) {
        out.push({
          weekNum: w.weekNum,
          discipline: 'long_run',
          message: lrMin > 0
            ? `Week ${w.weekNum} long run is shorter than the typical ${phaseLabel(w.phase)} floor (${lrMi}mi vs ${lrFloorMi}mi). If recovery allows, extending toward ${lrFloorMi}+ mi protects durability.`
            : `Week ${w.weekNum} has no long run scheduled — ${phaseLabel(w.phase)} plans target a ${lrFloorMi}+ mi long run for durability.`,
          metrics: { observed: lrMi, floor: lrFloorMi, unit: 'mi', phase: w.phase },
        });
      }
    }

    // Long ride — tri only. Run-only plans don't ship long_ride sessions.
    if (opts.hasTri) {
      const lrideFloorH = effectiveLongRideFloorHours(
        opts.primaryDistance,
        w.phase,
        opts.recentLongestRideHr ?? 0,
        wipSoft,
        rwSoft,
        throttleSoft,
      );
      if (lrideFloorH > 0) {
        const lrideMin = maxLongRideMinutes(w);
        const lrideH = Math.round((lrideMin / 60) * 100) / 100;
        if (lrideH + 1e-9 < lrideFloorH) {
          out.push({
            weekNum: w.weekNum,
            discipline: 'long_ride',
            message: lrideMin > 0
              ? `Week ${w.weekNum} long ride is shorter than the typical ${phaseLabel(w.phase)} floor (${lrideH}h vs ${lrideFloorH}h). Lengthening toward ${lrideFloorH}h+ builds the bike-leg endurance the race demands.`
              : `Week ${w.weekNum} has no long ride scheduled — ${phaseLabel(w.phase)} plans target a ${lrideFloorH}h+ long ride for bike-leg durability.`,
            metrics: { observed: lrideH, floor: lrideFloorH, unit: 'h', phase: w.phase },
          });
        }
      }
    }
  }

  return out;
}

// ── Long-day floor enforcement (HARD; runs inside the rebuild loop) ─────────
//
// `tightenPhaseBlocksForFloorRebuild` shrinks every phase's `tssMultiplier` by 0.87 each pass to
// resolve a long-run TSS share violation or WoW ramp violation. The shrink is uniform across all
// session categories (quality, easy, swim, long), which compresses long_ride / long_run **below**
// `longRideFloorHours` / `longRunFloorMiles` — the durability anchors get sacrificed alongside
// fillable categories. That defeats the floor's purpose: it is a hard constraint that the
// athlete needs regardless of how aggressively the rest of the week shrinks.
//
// `enforceLongDayFloors` runs **after** each rebuild's `generateAllWeeks` and **before** the
// next `validateTrainingFloors` call. It mutates each non-recovery / non-taper / non-race week's
// long_ride and long_run sessions in place, bumping any session below floor up to the floor.
// The rebuild loop continues to tighten quality / easy / swim via `tssMultiplier`; only the
// anchors are protected from compression.

/** Mirror week-builder.ts `effectiveHardMin` — kept in lockstep with the constants there. */
const HARD_INTENSITY_FRACTION = 0.65;
const MODERATE_INTENSITY_FRACTION = 0.50;

function hardFracOfIntensity(i: PlannedSession['intensity_class']): number {
  if (i === 'HARD') return HARD_INTENSITY_FRACTION;
  if (i === 'MODERATE') return MODERATE_INTENSITY_FRACTION;
  return 0;
}

function findLongRunSessionInWeek(w: GeneratedWeek): PlannedSession | null {
  let best: PlannedSession | null = null;
  for (const s of w.sessions) {
    const tags = Array.isArray(s.tags) ? s.tags.map((x) => String(x).toLowerCase()) : [];
    if (!tags.includes('long_run')) continue;
    if (s.type !== 'run') continue;
    if (best == null || s.duration > best.duration) best = s;
  }
  return best;
}

function findLongRideSessionInWeek(w: GeneratedWeek): PlannedSession | null {
  let best: PlannedSession | null = null;
  for (const s of w.sessions) {
    const tags = Array.isArray(s.tags) ? s.tags.map((x) => String(x).toLowerCase()) : [];
    // Bricks have their own bike + run halves; `long_ride` floor doesn't apply.
    if (tags.includes('brick')) continue;
    if (!tags.includes('long_ride')) continue;
    if (s.type !== 'bike') continue;
    if (best == null || s.duration > best.duration) best = s;
  }
  return best;
}

function applyDeltaToWeek(
  w: GeneratedWeek,
  sport: Sport,
  oldDuration: number,
  newDuration: number,
  oldHardFrac: number,
  oldTss: number,
  oldWeightedTss: number,
  newTss: number,
  newWeightedTss: number,
): void {
  w.total_raw_tss = Math.max(0, w.total_raw_tss - oldTss + newTss);
  w.total_weighted_tss = Math.max(0, w.total_weighted_tss - oldWeightedTss + newWeightedTss);
  const cur = w.sport_raw_tss[sport] ?? 0;
  w.sport_raw_tss[sport] = Math.max(0, cur - oldTss + newTss);

  const durDelta = newDuration - oldDuration;
  const newZ3 = Math.max(0, w.zone3_plus_minutes + durDelta * oldHardFrac);
  const newZ12 = Math.max(0, w.zone1_2_minutes + durDelta * (1 - oldHardFrac));
  w.zone3_plus_minutes = Math.round(newZ3);
  w.zone1_2_minutes = Math.round(newZ12);
  const totalMin = w.zone1_2_minutes + w.zone3_plus_minutes;
  w.eighty_twenty_ratio = totalMin > 0 ? w.zone1_2_minutes / totalMin : 1;
}

function bumpLongRunToFloor(s: PlannedSession, w: GeneratedWeek, floorMi: number): void {
  // Round to integer miles so the materializer's `longrun_\d+mi_easypace` regex still matches.
  // longRunFloorMiles emits 0.5 increments; Math.round on .5 rounds away from zero.
  const milesInt = Math.max(1, Math.round(floorMi));
  const newDuration = Math.round(milesInt * 9.5); // mirror longRun() in session-factory
  const oldDuration = s.duration;
  const oldHardFrac = hardFracOfIntensity(s.intensity_class);
  const oldTss = s.tss;
  const oldWeightedTss = s.weighted_tss;
  const newTss = estimateSessionTSS('run', s.intensity_class, newDuration);
  const newWeightedTss = weightedTSS('run', newTss);

  s.duration = newDuration;
  s.tss = newTss;
  s.weighted_tss = newWeightedTss;
  s.name = `Long Run — ${milesInt} mi`;
  const isRaceSpecific = Array.isArray(s.tags) && s.tags.includes('race_specific');
  s.steps_preset = [
    isRaceSpecific
      ? `longrun_${milesInt}mi_mp_finish`
      : `longrun_${milesInt}mi_easypace`,
  ];

  applyDeltaToWeek(
    w, 'run', oldDuration, newDuration, oldHardFrac,
    oldTss, oldWeightedTss, newTss, newWeightedTss,
  );
}

function bumpLongRideToFloor(s: PlannedSession, w: GeneratedWeek, floorH: number): void {
  // longRideFloorHours emits 0.25-hour increments; round to integer minutes for the bike token.
  const newDuration = Math.round(floorH * 60); // mirror longRide() in session-factory
  const oldDuration = s.duration;
  const oldHardFrac = hardFracOfIntensity(s.intensity_class);
  const oldTss = s.tss;
  const oldWeightedTss = s.weighted_tss;
  const newTss = estimateSessionTSS('bike', s.intensity_class, newDuration);
  const newWeightedTss = weightedTSS('bike', newTss);

  s.duration = newDuration;
  s.tss = newTss;
  s.weighted_tss = newWeightedTss;
  // longRide() name uses hours.toFixed(1) — keep the format identical.
  s.name = `Long Ride — ${floorH.toFixed(1)} hr`;
  s.steps_preset = [`bike_endurance_${newDuration}min_Z2`];

  applyDeltaToWeek(
    w, 'bike', oldDuration, newDuration, oldHardFrac,
    oldTss, oldWeightedTss, newTss, newWeightedTss,
  );
}

export type EnforceLongDayFloorsOpts = {
  hasTri: boolean;
  primaryDistance: TriRaceDistance;
  /** Race anchor week numbers (1-indexed). Skipped — race week has its own caps. */
  raceWeekNums?: number[];
  /** Longest run distance (miles) in the last 30 days. See {@link effectiveLongRunFloorMiles}. */
  recentLongestRunMi?: number;
  /** Longest ride duration (hours) in the last 30 days. See {@link effectiveLongRideFloorHours}. */
  recentLongestRideHr?: number;
  /**
   * D-027: phase blocks for within-phase-aware floor computation. When provided, `enforceLongDayFloors`
   * routes the spec floor through `longRunMilesForWeek` per-week so the enforcer follows the lerp
   * instead of the peak-of-phase value (matches D-026). When omitted, falls back to peak-of-phase
   * (legacy behavior; preserves tests that don't thread phaseBlocks).
   */
  phaseBlocks?: PhaseBlock[];
};

/**
 * After tightenPhaseBlocksForFloorRebuild's uniform compression, re-enforce the long-day floor on
 * each non-recovery / non-taper / non-race week. Mutates `weeks` in place. Long sessions that are
 * already at or above floor are not touched. Bricks (replacing standalone long_ride) are skipped —
 * brick durability has its own dynamics. Race-specific weeks where long_run was replaced by a
 * race-pace session are skipped (no `long_run` tag).
 */
export function enforceLongDayFloors(
  weeks: GeneratedWeek[],
  opts: EnforceLongDayFloorsOpts,
): void {
  const raceWeeks = new Set(opts.raceWeekNums ?? []);

  for (const w of weeks) {
    if (w.isRecovery) continue;
    if (w.phase === 'taper') continue;
    if (w.phase === 'recovery') continue;
    if (raceWeeks.has(w.weekNum)) continue;

    // Long run — applies to both single-sport (run) and tri.
    // D-027: thread weekInPhase + rampWeeks when phaseBlocks are available so
    // the hard enforcer follows the lerp instead of peak-of-phase. Pre-fix
    // this enforcer was the second `Math.max` floor that flattened the §4.5
    // within-phase ramp to peak-of-phase even after Bundle B made the
    // week-builder canonical.
    // D-031: thread loadThrottle so the hard enforcer floors at the throttled
    // value (peak-of-base via the lerp's internal floor) instead of un-throttled
    // peak-of-phase — without this, the enforcer re-bumps throttled long sessions
    // back up and defeats the rebuild loop.
    let wipHard: number | undefined;
    let rwHard: number | undefined;
    let throttleHard: number | undefined;
    if (opts.phaseBlocks?.length) {
      const blk = blockForWeek(opts.phaseBlocks, w.weekNum);
      wipHard = weekInPhaseInline(opts.phaseBlocks, w.weekNum, blk);
      rwHard = rampWeeksForPhase(w.phase);
      throttleHard = (w.phase === 'base' || w.phase === 'build' || w.phase === 'race_specific')
        ? Math.min(1.0, blk.tssMultiplier)
        : 1.0;
    }
    const lrFloorMi = effectiveLongRunFloorMiles(
      opts.primaryDistance,
      w.phase,
      opts.recentLongestRunMi ?? 0,
      wipHard,
      rwHard,
      throttleHard,
    );
    if (lrFloorMi > 0) {
      const lrSession = findLongRunSessionInWeek(w);
      if (lrSession) {
        const observedMi = lrSession.duration / 9.5;
        if (observedMi + 1e-9 < lrFloorMi) {
          bumpLongRunToFloor(lrSession, w, lrFloorMi);
        }
      }
    }

    // Long ride — tri only. Run-only plans never schedule long_ride.
    if (opts.hasTri) {
      const lrideFloorH = effectiveLongRideFloorHours(
        opts.primaryDistance,
        w.phase,
        opts.recentLongestRideHr ?? 0,
        wipHard,
        rwHard,
        throttleHard,
      );
      if (lrideFloorH > 0) {
        const lrideSession = findLongRideSessionInWeek(w);
        if (lrideSession) {
          const observedH = lrideSession.duration / 60;
          if (observedH + 1e-9 < lrideFloorH) {
            bumpLongRideToFloor(lrideSession, w, lrideFloorH);
          }
        }
      }
    }
  }
}
