// Q-111 §2 — the ONE novelty detection, consumed by TWO surfaces (the cross-layer requirement): the
// per-workout INSIGHTS narrator (fact-packet) and the State-screen loaded-legs attribution both read
// the same `novel_movements` fact. A movement is novel when it's absent from the athlete's trailing
// ~6–8wk exercise history. Pure + fixturable; the caller supplies the session movements + history names.
//
// Voice standard (D-233): the phrase cites logged fact (which movements, how many reps), hedged by the
// consumer ("consistent with", "likely") — never a claimed sensation.

export interface SessionMovement { name: string; reps: number; }
export interface NovelMovement { name: string; reps: number; }

/** Normalize a movement name for history comparison — case/space/punctuation-insensitive AND
 *  plural-insensitive (strip a single trailing 's' per word) so "split squat" ≡ "split squats". Applied
 *  to BOTH sides, so even non-word stems (e.g. "press"→"pres") still match consistently. */
export function normalizeMovement(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

/** Movements in the session that are ABSENT from the trailing-window history = novel. */
export function detectNovelMovements(args: {
  sessionMovements: SessionMovement[];
  historyMovementNames: string[]; // distinct movement names logged in the ~6–8wk window (excludes THIS session)
}): NovelMovement[] {
  const seen = new Set((args.historyMovementNames || []).map(normalizeMovement));
  const out: NovelMovement[] = [];
  const added = new Set<string>();
  for (const m of args.sessionMovements || []) {
    const key = normalizeMovement(m.name);
    if (!key || seen.has(key) || added.has(key)) continue;
    added.add(key);
    out.push({ name: m.name, reps: Number(m.reps) || 0 });
  }
  return out;
}

/** naive plural — the movement names are already noun phrases ("Bulgarian split squat"). */
function pluralize(name: string): string {
  const n = String(name || '').trim();
  if (!n) return n;
  if (/s$/i.test(n)) return n;              // already plural ("split squats")
  if (/y$/i.test(n)) return n.replace(/y$/i, 'ies');
  return `${n}s`;
}

/** The distinct novel movement names (raw, as logged) — the validator's "these MUST be named" list. */
export function novelMovementNames(novels: NovelMovement[]): string[] {
  return (novels || []).map((n) => n.name).filter(Boolean);
}

/**
 * The names both surfaces cite — lowercased + pluralized, up to 2, biggest first:
 *   "reverse lunges and bulgarian split squats"
 * HONESTY (D-233, corrected 2026-07-03): NO time window and NO rep count. The detection only establishes
 * that these are ABSENT FROM RECENT LOGGED HISTORY — not a specific interval ("8 weeks" asserted a
 * last-performed date the lookback edge can't pin) and not a volume-as-cause. Callers add the honest
 * frame: "…which haven't been part of your recent routine." Names only; the reader supplies the effect
 * as a POSSIBILITY, never a claimed cause.
 */
export function novelMovementsNames(novels: NovelMovement[]): string | null {
  if (!novels?.length) return null;
  const named = [...novels].sort((a, b) => (b.reps || 0) - (a.reps || 0)).slice(0, 2);
  return named.map((n) => pluralize(n.name).toLowerCase()).join(' and ');
}
