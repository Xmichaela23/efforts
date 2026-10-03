/**
 * ═══ THE WORKOUT SHAPE — ONE BAR PER STEP, WRITTEN BY THE SERVER (2026-10-03) ═══════════════════════
 *
 * docs/WORKORDER-workout-shape-2026-10-03.md, Stage 1. A planned run or ride carries `computed.shape`: one bar per step,
 * its length in seconds and its height as a fraction of threshold (threshold pace on foot, FTP on the bike). Today's
 * card, the drawer and the plan sheet only draw it.
 *
 * ⛔ READ OFF THE SAVED STEPS AND THE NUMBERS THEY WERE BUILT FROM (`computed.anchors`: `ftp_w`, `threshold_sec_per_mi`),
 * the same way the Intervals.icu send turns watts back into percent (`intervals/serialize.ts`). A fraction of threshold
 * does not move when FTP or threshold pace moves, so the shape stays true as the numbers change.
 * ⚠️ PERCENT OF THRESHOLD SPEED ON FOOT, SO THE PACE DIVIDES (threshold pace ÷ step pace); PERCENT OF FTP ON THE BIKE,
 * SO THE WATTS DIVIDE BY FTP. The same arithmetic `plan-tokens/quality-work.ts` builds the steps with, run backwards.
 *
 * Steps the page gives no number or no clock get fixed sizes, each marked OURS below with a STATE-SOURCES row.
 */

// OURS — the height of a step the page prints with no number ("all-out", "max effort", "faster than vVO2", a hill
// rep): 150% of threshold, the top of the chart. No page gives one (p229 leaves "all-out" unresolved on purpose).
export const SHAPE_TOP_PCT = 1.5;
// OURS — the width of a lap-button step with no clock and no minimum (p210's strides, a "full recovery"): 60 seconds.
// The watch ends it on the lap press, so there is no length to read.
export const SHAPE_LAP_SECONDS = 60;
// OURS — the height of an easy step the page prints with no number (an easy spin, a walk/jog, a warm-up by time
// only): 50% of threshold. No page gives one.
export const SHAPE_EASY_PCT = 0.5;

export type ShapeBar = { s: number; p: number };
export type WorkoutShape = { basis: 'ftp' | 'threshold_pace'; bars: ShapeBar[] };

type Range = { lower?: unknown; upper?: unknown; shown_upper?: unknown } | null | undefined;
const num = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? n : null;
};
// FIELD — definition (1 mi = 1609.344 m; 1609.34 as `toV3Step` writes it)
const M_PER_MI = 1609.34;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** The middle of a range; a floor-only or ceiling-only range uses the number it has. */
function middle(r: Range): number | null {
  const lo = num(r?.lower);
  const hi = num(r?.upper) ?? num(r?.shown_upper);
  if (lo != null && hi != null) return (lo + hi) / 2;
  return hi ?? lo;
}

/**
 * The shape of a planned run or ride, or null: another sport, no steps, or a step that needs a threshold the row was
 * not built with (a session saved before 2026-09-13 has no saved FTP).
 */
export function workoutShape(
  sport: unknown,
  steps: unknown,
  anchors: { ftp_w?: unknown; threshold_sec_per_mi?: unknown } | null | undefined,
): WorkoutShape | null {
  const kind = String(sport ?? '').toLowerCase();
  const isRun = kind === 'run' || kind === 'walk';
  const isRide = kind === 'ride' || kind === 'bike' || kind === 'cycling';
  if (!isRun && !isRide) return null;
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const ftp = num(anchors?.ftp_w);
  const thr = num(anchors?.threshold_sec_per_mi);

  const bars: ShapeBar[] = [];
  // deno-lint-ignore no-explicit-any
  for (const st of steps as any[]) {
    if (!st || typeof st !== 'object' || st.strength) continue;
    const stepKind = String(st.kind ?? '');
    const easyKind = stepKind === 'warmup' || stepKind === 'cooldown' || stepKind === 'recovery' || stepKind === 'rest';

    let p: number;
    if (isRide) {
      const watts = st.powerRange ? middle(st.powerRange) : null;
      if (watts != null) {
        if (ftp == null) return null;
        p = watts / ftp;
      } else {
        p = easyKind ? SHAPE_EASY_PCT : SHAPE_TOP_PCT;
      }
    } else {
      const pace = middle(st.pace_range) ?? null;
      if (pace != null) {
        if (thr == null) return null;
        p = thr / pace;
      } else {
        p = easyKind || st.prescription === 'heart_rate' ? SHAPE_EASY_PCT : SHAPE_TOP_PCT;
      }
    }

    let s = num(st.seconds) ?? num(st.min_seconds);
    if (s == null) {
      const meters = num(st.distanceMeters);
      // OURS — a distance step with no pace (p229's sprints in metres) is drawn at threshold pace; see STATE-SOURCES.
      if (meters != null && isRun && thr != null) s = (meters / M_PER_MI) * thr;
      else s = SHAPE_LAP_SECONDS;
    }

    bars.push({ s: Math.max(1, Math.round(s)), p: round2(Math.min(SHAPE_TOP_PCT, Math.max(0, p))) });
  }
  if (bars.length === 0) return null;
  return { basis: isRide ? 'ftp' : 'threshold_pace', bars };
}
