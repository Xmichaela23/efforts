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

/** naive plural for the phrase — the movement names are already noun phrases ("Bulgarian split squat"). */
function pluralize(name: string): string {
  const n = String(name || '').trim();
  if (!n) return n;
  if (/s$/i.test(n)) return n;              // already plural ("split squats")
  if (/y$/i.test(n)) return n.replace(/y$/i, 'ies');
  return `${n}s`;
}

/**
 * The attribution phrase for the INSIGHTS narrator + the State Why:
 *   "first Bulgarian split squats and reverse lunges in months (~180 reps)"
 * Null when nothing is novel. Caps the named list at 2 (the two biggest by reps) so the phrase stays tight.
 */
export function novelMovementsPhrase(novels: NovelMovement[]): string | null {
  if (!novels?.length) return null;
  const totalReps = novels.reduce((s, n) => s + (Number(n.reps) || 0), 0);
  const named = [...novels].sort((a, b) => (b.reps || 0) - (a.reps || 0)).slice(0, 2);
  const names = named.map((n) => pluralize(n.name)).join(' and ');
  const repsPart = totalReps > 0 ? ` (~${Math.round(totalReps / 10) * 10} reps)` : '';
  return `first ${names} in months${repsPart}`;
}

/** The single headline movement to name on the State chip Why (biggest novel by reps). */
export function headlineNovelMovement(novels: NovelMovement[]): string | null {
  if (!novels?.length) return null;
  return [...novels].sort((a, b) => (b.reps || 0) - (a.reps || 0))[0].name;
}

/**
 * Names-only phrase for the State loaded-legs Why (no rep count — the State row is tight; the rep count
 * lives in the INSIGHTS phrase). Lowercased + pluralized, up to 2, biggest first:
 *   "reverse lunges and bulgarian split squats"
 */
export function novelMovementsNames(novels: NovelMovement[]): string | null {
  if (!novels?.length) return null;
  const named = [...novels].sort((a, b) => (b.reps || 0) - (a.reps || 0)).slice(0, 2);
  return named.map((n) => pluralize(n.name).toLowerCase()).join(' and ');
}
