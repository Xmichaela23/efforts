/**
 * ⛔ WHAT THE ATHLETE LAST LIFTED ON EACH MOVEMENT — the price of an auto-regulated row (2026-08-29).
 *
 * Michael: *"we can leave it open but what the user lifts and reports should count."* Viada
 * auto-regulates hypertrophy work, so an accessory is authored "By feel" with no weight and stays
 * that way. This supplies the number the SCORE uses, and it is the athlete's own logged weight —
 * the same figure Strong and Hevy put in front of you as last time's reference.
 *
 * ⛔ ONE READ, ONE SHAPE. Keyed by `exercise_log.canonical_name`, which is `canonicalize`'s output —
 * the same key `calculatePlannedStrengthWorkload` looks up with. A second keying convention here is
 * how a lookup silently misses and every by-feel row quietly falls back to the bar.
 * ⚠️ MOST RECENT WINS, not heaviest: the question is "what does this athlete use on this movement",
 * and a single heavy outlier is not that.
 */

/** Minimal row shape — matches the `exercise_log` columns this reads. */
type LogRow = { date?: string | null; canonical_name?: string | null; best_weight?: number | null };

export function lastWeightByMovementFrom(rows: LogRow[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  const seenDate: Record<string, string> = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const key = String(r?.canonical_name ?? '').trim();
    const w = Number(r?.best_weight);
    const d = String(r?.date ?? '').slice(0, 10);
    if (!key || !Number.isFinite(w) || w <= 0 || d.length !== 10) continue;
    if (!seenDate[key] || d > seenDate[key]) { seenDate[key] = d; out[key] = w; }
  }
  return out;
}

/**
 * Fetch it. ⚠️ `limit` is a safety rail on a read that could otherwise walk an athlete's whole
 * history; ordered newest-first so the cap never costs the recent sessions this is about.
 */
export async function fetchLastWeightByMovement(
  supabase: { from: (t: string) => any },
  userId: string,
  opts?: { limit?: number },
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('exercise_log')
    .select('date,canonical_name,best_weight')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(opts?.limit ?? 2000);
  return lastWeightByMovementFrom((data ?? []) as LogRow[]);
}
