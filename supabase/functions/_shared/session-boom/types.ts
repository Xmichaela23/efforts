/**
 * The stored shape of the good-news line (audit H-T14, 2026-09-10) — `workouts.computed.session_boom_v1`,
 * sent as `session_detail_v1.boom`.
 *
 * ⚠️ NO IMPORTS, ON PURPOSE. The rule in `line.ts` reaches the standing-plan composer (the heavy-set
 * band and ladder), which is close to two hundred modules. A reader that only needs the shape —
 * `workout-detail`, `session-detail/types.ts` — imports this file and none of that.
 */

/** Which approved line fired. The words are in `line`; this names the rule for a reader. */
export type SessionBoomKind =
  | 'best_power'
  | 'longest'
  | 'hr_at_easy_power'
  | 'easy_pace_at_hr'
  | 'drift_streak'
  | 'earned_heavy_set'
  | 'reps_to_spare';

/**
 * ⛔ THE LINE WITH ITS NUMBERS AND ITS BASIS (audit H-T14: "with its numbers and basis"). `line` is
 * the only thing a screen prints; `numbers` are the values inside it and `basis` is what they were
 * compared against, so a reader can check a line without re-running the rule.
 */
export type SessionBoomV1 = {
  v: 1;
  line: string;
  kind: SessionBoomKind;
  numbers: Record<string, number | string>;
  basis: {
    /** The first day searched — the block's start, else 1 January. The month in the line is its month. */
    window_start: string;
    /** Earlier sessions of this sport inside the window that the rule read. */
    prior_count: number;
    [k: string]: unknown;
  };
};
