// =============================================================================
// moved-from — "which day did the plan put this session on?"
// =============================================================================
//
// ⛔ THE DEFECT THIS CLOSES (Stage 0, docs/STAGE0-lost-day-2026-09-21.md §4-5). A planned row's
// `date` was the only record of its plan day. Move a session and every reader that matches rows to
// the plan by date lost it: `get-week` re-created it on the old day on every read, `activate-plan`
// put it back on the old day on every rebuild, and the restater matched it to the wrong day's
// session.
//
// ⛔ THE FIX MIRRORS THE DISCIPLINE SWAP (`swapped_from:<sport>`, `get-week/planned-exists-key.ts`).
// The row records the plan date it left (`moved_from:YYYY-MM-DD`) and keeps its `week_number` /
// `day_number`. Readers that ask "which plan session is this?" read `planDateOf`; readers that ask
// "when is it happening?" (today gates, attach, load by day) keep reading `date`.
//
// ⚠️ ONE LITERAL, BOTH SIDES. The client imports this file through the `@shared` alias, so the tag
// written and the tag read cannot drift.
// =============================================================================

export const MOVED_FROM_PREFIX = 'moved_from:';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

type Tagged = { date?: unknown; tags?: unknown };

const tagsOf = (row: Tagged | null | undefined): string[] =>
  Array.isArray(row?.tags) ? (row!.tags as unknown[]).map((t) => String(t)) : [];

/** The plan date recorded on a moved row, or null when it has never been moved. */
export function movedOrigin(row: Tagged | null | undefined): string | null {
  for (const t of tagsOf(row)) {
    if (!t.startsWith(MOVED_FROM_PREFIX)) continue;
    const v = t.slice(MOVED_FROM_PREFIX.length).slice(0, 10);
    if (ISO.test(v)) return v;
  }
  return null;
}

/** The date the plan put this session on: its `moved_from:` date when moved, its own date otherwise. */
export function planDateOf(row: Tagged | null | undefined): string {
  return movedOrigin(row) ?? String(row?.date ?? '').slice(0, 10);
}

/**
 * The tags a row carries after it moves to `newDate`.
 *
 * ⛔ THE FIRST DAY IS KEPT. Moved twice, the note still names the day the plan wrote — that is the
 * day every plan reader matches on. ⛔ MOVED BACK ONTO THAT DAY, THE NOTE COMES OFF: the row is where
 * the plan put it again. Every other tag is kept as it was.
 */
export function tagsAfterMove(row: Tagged, newDate: string): string[] {
  const target = String(newDate ?? '').slice(0, 10);
  const origin = planDateOf(row);
  const rest = tagsOf(row).filter((t) => !t.startsWith(MOVED_FROM_PREFIX));
  if (!origin || !ISO.test(origin) || origin === target) return rest;
  return [...rest, `${MOVED_FROM_PREFIX}${origin}`];
}
