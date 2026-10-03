/**
 * ⛔ THE SHAPE A PLANNED ROW SENDS TO A SCREEN (2026-10-03, docs/WORKORDER-workout-shape-2026-10-03.md).
 *
 * The saved `computed.shape` (materialize-plan), or — on a row expanded before the shape was written — the same shape
 * read off its saved steps and the numbers they were built from. None on a plain sport swap: that row still holds the
 * old sport's steps (`swappedStructureIsStale`), and the screens hide its structure the same way.
 * Read by get-week (Today, the drawer) and the plan sheet, so every screen draws the one answer.
 */
import { swappedStructureIsStale } from './session-swap/swap.ts';
import { workoutShape, type WorkoutShape } from './workout-shape.ts';

export function plannedShapeOf(row: {
  type?: unknown;
  tags?: unknown;
  steps_preset?: unknown;
  computed?: { shape?: unknown; steps?: unknown; anchors?: unknown } | null;
} | null | undefined): WorkoutShape | null {
  if (!row) return null;
  // deno-lint-ignore no-explicit-any
  if (swappedStructureIsStale(row as any)) return null;
  const saved = row.computed?.shape as WorkoutShape | undefined;
  if (saved && Array.isArray(saved.bars) && saved.bars.length > 0) return saved;
  // deno-lint-ignore no-explicit-any
  return workoutShape(row.type, row.computed?.steps, (row.computed?.anchors ?? null) as any);
}
