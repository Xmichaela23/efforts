/**
 * "Standard Focus · week 2 of 12" — the block a lift belonged to, one line. Printed in the session
 * header's second row (UnifiedWorkoutView), the slot a ride fills with its device. Null when the
 * lift was not on a plan, exactly as an unattributed ride has no source line.
 * ⛔ THE PHASE WORD IS STRIPPED (2026-08-29) — same removal as the State row, same reason:
 * `PHASE_NAME`'s vocabulary is the previous program's block shape, and none of those words is
 * Viada's. "week 1 of 12" is a position and stays.
 */
export function strengthBlockLine(sessionDetail: { block?: { plan_name?: string | null; week_index?: number | null; block_weeks?: number | null } | null } | null | undefined): string | null {
  const block = sessionDetail?.block ?? null;
  if (!block) return null;
  const week = block.week_index ?? null;
  if (week == null) return null;
  const weeks = block.block_weeks ?? null;
  const pos = weeks != null && weeks > 0 ? `week ${week} of ${weeks}` : `week ${week}`;
  return block.plan_name ? `${block.plan_name} · ${pos}` : pos;
}
