/**
 * ⛔ THE LOAD READ — PROGRAMME-AWARE, NO IMPERATIVES (2026-09-01, ruled by Michael:
 * "build more if they are missing training it should be program aware"). ONE decision, shared by the
 * LOAD word (LoadBar) and the glance HEADLINE gate (StateTab) so the two surfaces cannot disagree
 * about the same fact — the fracture this arc exists to close.
 *
 * The old read answered "under target" with an imperative to add volume ("build more" / "add a
 * session") and "over target" with "pull back" — arguing with a fixed programme built to the book's
 * doses, the same fault as the removed per-muscle "light" verdicts. Now:
 *   · LOW load + plan + sessions missed  → FACT: "{done} of {planned} sessions done this week".
 *   · LOW load + prescribed-light week, or no plan → nothing.
 *   · HIGH load + plan + more than planned (added work) → FACT: "above the planned week".
 *   · HIGH load + plan + not added (the plan prescribed a hard week) → nothing.
 *   · HIGH load + NO plan → the plain CONDITION ("a bit high" / "high") — no plan to compare against.
 *   · on_target / productive → the plain STATE word.
 * ⛔ No imperatives in any branch. The athlete decides.
 *
 * ⛔ `kind` IS WHAT THE HEADLINE GATES ON. The glance headline speaks ONLY on a plain over-condition
 * (`kind: 'condition'`) — the same case the bar shows one — and goes quiet on 'state' / 'fact' / null,
 * so it can never say "Load a bit high" while the bar correctly says nothing. Keying on `kind`, not
 * on the text, is what keeps the two from drifting when the wording changes.
 */
export type LoadRead = { text: string; cls: string; kind: 'state' | 'fact' | 'condition' } | null;

export function loadRead(
  status: string | null | undefined,
  isPrescribedShaped: boolean, // taper / peak / test — the plan chose the week's shape
  hasPlan: boolean,
  planned: number,
  done: number,
): LoadRead {
  const fact = 'text-white/60';
  if (status === 'on_target') return { text: 'balanced', cls: 'text-white/85', kind: 'state' };
  if (status === 'productive') return { text: 'productive', cls: 'text-white/85', kind: 'state' };
  const missed = hasPlan && planned > 0 && done < planned;
  const added = hasPlan && planned > 0 && done > planned;
  if (status === 'under') {
    if (isPrescribedShaped) return null;          // a light week is what the plan prescribed
    if (missed) return { text: `${done} of ${planned} sessions done this week`, cls: fact, kind: 'fact' };
    return null;                                   // low on plan (not behind), or no plan → nothing
  }
  if (status === 'elevated' || status === 'high') {
    if (isPrescribedShaped) return null;          // the plan prescribed a hard week — not a finding
    if (added) return { text: 'above the planned week', cls: fact, kind: 'fact' };
    if (hasPlan) return null;                       // high but not from added work → prescribed → nothing
    return status === 'high'
      ? { text: 'high', cls: 'text-[#FF5A5F]', kind: 'condition' }
      : { text: 'a bit high', cls: 'text-[#FF5A5F]/75', kind: 'condition' };
  }
  return null;
}
