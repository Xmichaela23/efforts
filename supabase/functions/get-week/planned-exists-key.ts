// =============================================================================
// planned-exists-key — "is this blob session already on the calendar?"
// =============================================================================
//
// ⛔ THE BUG THIS CLOSES, AND IT WAS A SILENT DATA BUG, NOT A RENDER ONE.
//
// `get-week` re-materialises planned rows from `plans.sessions_by_week` on every read — a
// self-healing backfill for sessions the plan holds but the calendar is missing. It decided
// "already there?" on `training_plan_id | date | TYPE`.
//
// `type` stopped being immutable the day the discipline swap shipped. Swap Tuesday's run to a ride
// and the row becomes `ride`; the blob still says `run`; the key `plan|date|run` is therefore absent;
// get-week concludes the run is missing and INSERTS IT. The athlete's Tuesday comes back holding the
// swapped ride AND a re-created run — device-confirmed as `BK-EZ 63:00` beside `RN 63:00` — and it
// happens again on every calendar read.
//
// ⛔ THE FIX DOES NOT TOUCH THE BLOB. The plan keeps prescribing what it prescribed; the swap stays
// an individual, per-session override. The row records what it replaced (`swapped_from:<discipline>`,
// written by `src/lib/session-discipline-swap.ts`) and this module credits the slot to BOTH the
// current type and the original one. The blob's run then matches, and nothing is inserted.
//
// ⚠️ THE SELF-HEAL MUST STILL WORK. A session the plan holds and the calendar genuinely lacks is
// still inserted — that is the whole point of the backfill, and the tests pin it.

/** The subset of a planned row this module needs. */
export type PlannedKeyRow = {
  training_plan_id?: string | null;
  date?: string | null;
  type?: string | null;
  tags?: string[] | null;
};

/**
 * ⛔ ONE LITERAL, TWO CODEBASES. The client writes this prefix (`SWAPPED_FROM_PREFIX` in
 * `session-discipline-swap.ts`); the server reads it here. They are asserted equal by a test that
 * imports both — a drifted prefix would silently restore the duplicate with nothing failing.
 */
export const SWAPPED_FROM_PREFIX = 'swapped_from:';

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** `plan|date|type`, exactly the shape `get-week` already used. */
export function plannedKey(planId: unknown, dateIso: unknown, type: unknown): string {
  return `${String(planId)}|${String(dateIso)}|${norm(type)}`;
}

/**
 * The origin discipline recorded on a swapped row, or null when it has never been swapped.
 *
 * ⚠️ Reads the FIRST `swapped_from:` tag it finds. The client keeps the earliest origin across
 * repeated swaps (run → ride → swim still reports `run`), so there is only ever one to find, and
 * that one is what the blob holds.
 */
export function swappedOrigin(row: PlannedKeyRow): string | null {
  for (const t of row?.tags ?? []) {
    const raw = String(t);
    if (!raw.startsWith(SWAPPED_FROM_PREFIX)) continue;
    const v = norm(raw.slice(SWAPPED_FROM_PREFIX.length));
    if (v) return v;
  }
  return null;
}

/**
 * Build the membership set `get-week` tests each blob session against.
 *
 * A swapped row occupies TWO keys: the discipline it is now, and the one the plan asked for. Both
 * are needed — the first so a second read does not re-insert the *ride*, the second so the blob's
 * *run* is seen as already satisfied.
 */
export function buildExistsKeys(rows: ReadonlyArray<PlannedKeyRow>): Set<string> {
  const keys = new Set<string>();
  for (const r of rows ?? []) {
    const planId = r?.training_plan_id;
    const date = r?.date;
    keys.add(plannedKey(planId, date, r?.type));
    const origin = swappedOrigin(r);
    if (origin) keys.add(plannedKey(planId, date, origin));
  }
  return keys;
}
