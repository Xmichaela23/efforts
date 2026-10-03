/**
 * ═══ THE WORKOUT SHAPE, DRAWN ONCE (2026-10-03, docs/WORKORDER-workout-shape-2026-10-03.md) ════════════════════
 *
 * One bar per step: width = the step's length, height = its fraction of threshold (the server's `computed.shape`,
 * `_shared/workout-shape.ts`). The chart's top is the server's fixed top height (`SHAPE_TOP_PCT`), so an all-out step
 * fills it. Bar opacity rises with intensity, as in the Build Focus mockup. This file draws and decides nothing else:
 * Today's card (thin), the drawer (tall, with the dashed line at threshold) and the plan sheet (light) all call it.
 */
import { SHAPE_TOP_PCT, type WorkoutShape } from '@shared/workout-shape.ts';

export type ShapeVariant = 'thin' | 'tall' | 'sheet';

const HEIGHT: Record<ShapeVariant, number> = { thin: 14, tall: 56, sheet: 36 };
const W = 400;

const fx = (n: number) => n.toFixed(2);

/** The SVG for a shape, or '' when there is nothing to draw. `color` is the sport's colour. */
export function workoutShapeSvg(
  shape: WorkoutShape | null | undefined,
  opts: { color: string; variant: ShapeVariant; dashColor?: string },
): string {
  const bars = Array.isArray(shape?.bars) ? shape!.bars.filter((b) => Number(b?.s) > 0) : [];
  if (!bars.length) return '';
  const H = HEIGHT[opts.variant];
  const total = bars.reduce((a, b) => a + Number(b.s), 0);
  let x = 0;
  let rects = '';
  for (const b of bars) {
    const frac = Math.min(1, Math.max(0, Number(b.p) / SHAPE_TOP_PCT));
    const w = (Number(b.s) / total) * W;
    const h = Math.max(1.5, frac * H);
    const op = (0.18 + frac * 0.75).toFixed(2);
    rects += `<rect x="${fx(x)}" y="${fx(H - h)}" width="${fx(Math.max(w - 0.6, 0.6))}" height="${fx(h)}" fill="${opts.color}" fill-opacity="${op}"/>`;
    x += w;
  }
  // The dashed line at threshold (100%) on the tall and sheet drawings; the thin card line has none.
  const y = fx(H - (1 / SHAPE_TOP_PCT) * H);
  const dash = opts.variant === 'thin' ? '' :
    `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="${opts.dashColor ?? 'rgba(236,233,227,.35)'}" stroke-dasharray="3 3" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}" role="img" aria-hidden="true" style="display:block">${rects}${dash}</svg>`;
}
