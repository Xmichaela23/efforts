/**
 * Post-build physiological guardrails — orthogonal to the same-day 10×10 matrix.
 * Rejects "paperclip" weeks where raw TSS piles onto one anchor or ramps too fast.
 *
 * Rebuild path (`generate-combined-plan`): uniform phase `tssMultiplier` tightening alone does **not**
 * change long-run share or WoW ratios — the second pass uses `physiologicalFloorRebuild` in `buildWeek`
 * (lower weekly budget + shrink long-run miles).
 */

import type { GeneratedWeek, AthleteState } from './types.ts';
import { DAYS_OF_WEEK } from './science.ts';

/** Max fraction of weekly **raw** TSS that may come from the long-run session(s). */
export const LONG_RUN_TSS_SHARE_MAX = 0.3;

/**
 * Stricter ceiling used only during `physiologicalFloorRebuild`: realized weekly raw TSS often
 * lands slightly above `weeklyTSSBudget` (pinned anchors, swim floors), so an LR cap tied to 30%
 * of budget alone can still fail validation at exactly 30%.
 */
export const FLOOR_REBUILD_LONG_RUN_SHARE_OF_BUDGET = 0.22;

/** Max week-over-week increase in **total_raw_tss** (WoW ramp). */
export const WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX = 0.15;

/** Applied to each phase block `tssMultiplier` on the automatic rebuild pass. */
export const FLOOR_REBUILD_TSS_MULTIPLIER_FACTOR = 0.87;

export const FLOOR_REBUILD_MIN_MULTIPLIER = 0.45;

export type PhysiologicalFloorCode = 'LONG_RUN_TSS_SHARE' | 'WEEK_OVER_WEEK_TSS_RAMP';

export type PhysiologicalFloorViolation = {
  code: PhysiologicalFloorCode;
  severity: 'fatal';
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

/**
 * Validates raw-TSS concentration and weekly ramp. Uses **total_raw_tss** on each week and
 * **long_run** tags — aligned with `GeneratedWeek` totals from `buildWeek`.
 */
export function validateTrainingFloors(weeks: GeneratedWeek[]): TrainingFloorsResult {
  const violations: PhysiologicalFloorViolation[] = [];

  for (const w of weeks) {
    const total = Math.max(0, w.total_raw_tss);
    if (total <= 0) continue;
    const lr = longRunRawTssFromWeek(w);
    const share = lr / total;
    if (share > LONG_RUN_TSS_SHARE_MAX + 1e-9) {
      violations.push({
        code: 'LONG_RUN_TSS_SHARE',
        severity: 'fatal',
        message: `Week ${w.weekNum}: long-run raw TSS is ${(share * 100).toFixed(1)}% of weekly total (limit ${(LONG_RUN_TSS_SHARE_MAX * 100).toFixed(0)}%).`,
        week_num: w.weekNum,
        metrics: [
          {
            name: 'long_run_share',
            observed: round4(share),
            limit: LONG_RUN_TSS_SHARE_MAX,
            unit: 'ratio',
          },
          {
            name: 'long_run_tss',
            observed: Math.round(lr),
            limit: Math.round(total * LONG_RUN_TSS_SHARE_MAX),
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
    const p = Math.max(0, prev.total_raw_tss);
    if (p < 1) continue;
    const ramp = (cur.total_raw_tss - p) / p;
    if (ramp > WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX + 1e-9) {
      violations.push({
        code: 'WEEK_OVER_WEEK_TSS_RAMP',
        severity: 'fatal',
        message: `Week ${cur.weekNum}: weekly raw TSS increased ${(ramp * 100).toFixed(1)}% vs prior week (limit ${(WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX * 100).toFixed(0)}%).`,
        week_num: cur.weekNum,
        metrics: [
          {
            name: 'wow_raw_tss_ramp',
            observed: round4(ramp),
            limit: WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX,
            unit: 'ratio',
          },
          {
            name: 'weekly_raw_tss',
            observed: Math.round(cur.total_raw_tss),
            limit: Math.round(p * (1 + WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX)),
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
