/**
 * ═══ THE DRIFT PERCENTAGE A SESSION PRINTS ═══════════════════════════════════════════════════════
 *
 * The number behind `session_detail_v1.classification.decoupling.pct` — the Drift tile — read off
 * the analyser's own stored fields, so a reader that is not the drawer gets the same number without
 * a built `session_detail_v1` to read it from (2026-09-10, audit H-T14: the good-news line runs at the
 * end of the recompute chain, before any drawer copy exists).
 *
 * THE RULE, as `build.ts` resolves `decouplingV1`:
 *   1. D-036 aerobic decoupling, `heart_rate_summary.decouplingPct`, when the analyser computed it;
 *   2. else heart rate alone, second half against first — `hr_drift_v1.pct`, written by both
 *      analysers from `_shared/hr-drift-halves.ts` (p107, the 5% line);
 *   3. else no read.
 * Rounded to one decimal, as the tile prints it — a reader comparing against 5 must see 4.96 as 5.0.
 *
 * ⚠️ `build.ts` STILL CARRIES ITS OWN COPY of steps 1–3 inline. It should import this; until it does,
 * a change to one must be made to the other.
 */

const round1 = (n: number) => Math.round(n * 10) / 10;

export function sessionDriftPct(workoutAnalysis: unknown): number | null {
  let wa = workoutAnalysis;
  if (typeof wa === 'string') { try { wa = JSON.parse(wa); } catch { return null; } }
  if (!wa || typeof wa !== 'object') return null;
  const hrs = (wa as { heart_rate_summary?: { decouplingPct?: unknown } }).heart_rate_summary;
  const pct = hrs && typeof hrs === 'object' ? hrs.decouplingPct : null;
  if (typeof pct === 'number' && Number.isFinite(pct)) return round1(pct);
  const halves = (wa as { hr_drift_v1?: { pct?: unknown } }).hr_drift_v1;
  if (halves && typeof halves.pct === 'number' && Number.isFinite(halves.pct)) return round1(halves.pct);
  return null;
}
