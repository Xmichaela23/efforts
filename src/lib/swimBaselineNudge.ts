// Swim baseline re-test nudge — fires on the STATE screen after a real block of clean swimming,
// prompting a CSS test to refresh the threshold benchmark. HONORED-swim-gated, not calendar:
// re-testing only makes sense after consistent clean training. Pure (no I/O) so it's trivially testable.
//
// ⛔ IT RUNS ON THE SERVER (2026-09-15, Stage 4 session 2). `_shared/arc-context.ts` calls it over the
// swim window and the baselines it already fetches, and sends State the finished sentence. It used to
// run in the browser from `useSwimBaselineNudge`, which made two table queries of its own. The rule is
// untouched; only its address changed. The file stays here because `src/lib/` bundles into each edge
// function at deploy time.
//
// Reset is implicit: updating the threshold / logging a CSS test moves `lastUpdatedAt` forward, the
// window resets, the nudge clears. Acting on it IS the dismiss — no separate dismiss bookkeeping.

export interface SwimNudgeSwim {
  date?: string | null;
  swam_as_planned?: boolean | null; // popup clean flag; explicit false = deviated/drills (not honored)
}

export interface SwimNudgeInput {
  swims: SwimNudgeSwim[];
  lastUpdatedAt: string | null; // ISO — when the swim threshold was last set/tested. null = never → no nudge
  nowISO: string;
}

export interface SwimNudgeResult {
  show: boolean;
  honoredCount: number;
  weeksSince: number;
  reason: string;
}

const DAY = 86_400_000;
/**
 * ⛔ THE THREE GATES ARE OURS (marked 2026-09-15, Stage 4 session 2 — they carried no marker and no
 * ledger row, and the "D-200" cited at the top of this file is not in DECISIONS-LOG; it lives in
 * `docs/SPEC-intensity-baselines.md:162,226`). Searched: DECISIONS-LOG for D-200, STATE-SOURCES for
 * "swim" / "nudge" / "honored" — no row for any of the three.
 *
 * A CSS re-test is worth asking for after a real block of clean swimming, not on a calendar: four
 * weeks since the threshold was last set, four honored swims inside that time, and still swimming now.
 * No commercial app publishes a re-test trigger for swim threshold — Garmin, TrainingPeaks and Swim
 * Smooth all leave the CSS test to the athlete — so there is nothing to cite. docs/STATE-SOURCES.md.
 */
const WEEKS_MIN = 4;
const HONORED_MIN = 4;
const ACTIVE_WITHIN_DAYS = 10;

export function swimBaselineNudge(input: SwimNudgeInput): SwimNudgeResult {
  const none = (reason: string, honoredCount = 0, weeksSince = 0): SwimNudgeResult =>
    ({ show: false, honoredCount, weeksSince, reason });

  if (!input?.lastUpdatedAt) return none('no baseline set yet'); // nothing to re-test against
  const now = Date.parse(input.nowISO);
  const last = Date.parse(input.lastUpdatedAt);
  if (!Number.isFinite(now) || !Number.isFinite(last)) return none('bad dates');

  const weeksSince = (now - last) / (DAY * 7);

  // honored = clean (not explicitly unchecked) AND after the last baseline update
  const honored = (input.swims || []).filter((s) => {
    if (!s || s.swam_as_planned === false) return false;
    const t = s.date ? Date.parse(s.date) : NaN;
    return Number.isFinite(t) && t > last;
  });
  const honoredCount = honored.length;

  if (weeksSince < WEEKS_MIN) return none(`only ${weeksSince.toFixed(1)}w since update`, honoredCount, weeksSince);
  if (honoredCount < HONORED_MIN) return none(`only ${honoredCount} honored swims`, honoredCount, weeksSince);

  // currently active — a honored swim within the last ~10 days (not returning from a layoff)
  const mostRecent = Math.max(...honored.map((s) => Date.parse(s.date as string)));
  if (!Number.isFinite(mostRecent) || now - mostRecent > ACTIVE_WITHIN_DAYS * DAY)
    return none('not active in last 10d', honoredCount, weeksSince);

  return { show: true, honoredCount, weeksSince, reason: `${honoredCount} honored swims over ${weeksSince.toFixed(1)}w` };
}
