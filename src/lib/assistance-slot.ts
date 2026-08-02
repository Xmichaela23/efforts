/**
 * ⛔ THE ONE ANSWER TO "IS THIS PLANNED ROW AN ASSISTANCE SLOT?" (2026-08-02, D-370.)
 *
 * Read by the SERVER matcher (`_shared/strength/match-exercises.ts`, Tier 3) and by the session
 * screen's planned-row extractor. Two readers, one rule — a private copy on either side is how this
 * codebase grows a second vocabulary, and this particular question decides whether work the athlete
 * did gets credited or read as a skip.
 *
 * ── WHY IT IS TWO SIGNALS AND NOT ONE ─────────────────────────────────────────────────────────
 *
 * The FLAG is the real answer: `load_prescribed: false`, stamped by the Get Stronger composer on
 * every assistance row and on nothing else. Prefer it always.
 *
 * The SHAPE is the fallback, and it exists because of a four-day hole in the plumbing:
 *   · 2026-07-25 `eb7db0df` — the composer starts writing `load_prescribed: false`.
 *   · 2026-07-26 `57d7d447` — assistance becomes `sets: undefined` / `reps: "25 total"` / no load.
 *   · 2026-07-30 `739df704` — `materialize-plan` finally CARRIES the flag into `computed.steps`.
 *     Until then it READ the flag (to stop deriving a weight) and dropped it on the floor: the
 *     object it builds is a whitelist and the flag was not on it.
 *
 * A plan materialized in that window has the assistance SHAPE and no assistance FLAG. Michael's own
 * block is one — the flag-only version of this check shipped, deployed, and changed nothing on his
 * screen, which is how the hole was found.
 *
 * ⚠️ THE SHAPE IS NOT A HEURISTIC. `reps: "N total"` is the composer's OWN encoding, chosen
 * deliberately (`strength-primary-plan.ts` — *"25 is a TOTAL, to be broken up however the athlete
 * likes that day… `sets: undefined` so no consumer can render a set count that was never
 * prescribed"*). Reading it back is reading what was written, not guessing at it.
 *
 * ⚠️ BOTH HALVES ARE REQUIRED. A missing set count alone is not enough — a malformed or
 * partially-authored row would qualify, and a false positive here credits a skipped MAIN LIFT. The
 * literal word "total" alone is not enough either. Together they are the composer's signature and
 * nothing else in the app writes it.
 *
 * ⛔ AND `=== false`, NEVER `=== true` OR TRUTHINESS. The flag is only ever `false` or ABSENT.
 * Absent means "not stated" — every plan from every other generator carries it nowhere. A reader
 * that treats absent as assistance turns every main lift in the app into an inferable slot at once.
 *
 * ⛔ DO NOT DELETE THE SHAPE BRANCH once new plans carry the flag. Nothing re-materializes plan
 * history, so sessions from that window keep their shape for as long as they exist.
 */
export function isAssistanceSlot(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;

  if (r.load_prescribed === false) return true;

  const sets = Number(r.sets);
  const hasSetCount = Number.isFinite(sets) && sets > 0;
  if (hasSetCount) return false;

  const reps = r.reps;
  return typeof reps === 'string' && /^\s*\d+\s*total\b/i.test(reps);
}
