// SWIM 7-day session breakdown — the honest, Q-038-SAFE swim read for the State "how your sessions went"
// section. Swim PACE is unreliable (Q-038 ingest bug), so this NEVER shows pace — it shows what IS reliable:
//   • planned swim   → % achieved (the swim analyzer's execution_score — SAME path strength reads:
//                      workout_analysis.session_state_v1.glance.execution_score; NULL for ungraded)
//   • unplanned swim → distance actually covered (meters; the client converts to yards by unit preference)
// Never faked, never invisible: a swim contributes its real completion %/distance or nothing. Mirrors the
// strength-session-types helper (a RENDERER of persisted analyzer output, not a new grading formula).

function parseJson(v: any): any {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return null;
}
function safeNum(v: any): number | null {
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN);
  return Number.isFinite(n) ? n : null;
}

export type SwimSession7d = {
  date: string;
  planned: boolean;
  /** Planned completion % (0..100), read verbatim from the swim analyzer. Null when unplanned or ungraded. */
  execution_pct: number | null;
  /** Distance covered, meters. The unplanned display + an honesty receipt for planned swims. */
  distance_m: number | null;
};

/** Build the swim session breakdown from a 7-day (or any) window of completed workouts. */
export function buildSwimSessions7d(workouts: any[]): SwimSession7d[] {
  const out: SwimSession7d[] = [];
  for (const w of Array.isArray(workouts) ? workouts : []) {
    if (String((w as any)?.type || '').toLowerCase() !== 'swim') continue;
    if (String((w as any)?.workout_status || '').toLowerCase() !== 'completed') continue;
    const wa = parseJson((w as any)?.workout_analysis) || {};
    const planned = (w as any)?.planned_id != null && String((w as any).planned_id) !== '';
    const execution_pct = safeNum(wa?.session_state_v1?.glance?.execution_score);
    const distance_m = safeNum(wa?.detailed_analysis?.workout_summary?.total_distance);
    out.push({
      date: String((w as any)?.date || ''),
      planned,
      execution_pct: planned ? execution_pct : null, // only PLANNED swims carry a completion %
      distance_m,
    });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  return out;
}
