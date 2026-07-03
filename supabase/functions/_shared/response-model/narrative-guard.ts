// Q-112 / D-232 narrative-grounding guard — a DETERMINISTIC gate between the LLM narrative and the
// render. The prose may only assert what the spine already computed. Two rules:
//   1. CONTRADICTION — the narrative may not claim a trend direction that conflicts with the spine's
//      per-discipline verdict ("run holding steady" when state_trends_v1 says run is improving).
//   2. RECAP — the narrative may not restate a receipt number already on screen (the "+3.6%" class).
// On rejection the caller regenerates ONCE (naming the violation); a second failure drops the prose.
// A missing narrative is honest; a lying one is not.
//
// SHARED + reusable by design: takes (narrative, verdicts) — any surface with deterministic verdicts
// (coach week narrative, per-workout INSIGHTS, Arc prose) can run the same guard. Continuity, not a silo.

export interface DisciplineVerdict {
  discipline: 'run' | 'bike' | 'swim' | 'strength';
  verdict: string;            // 'improving' | 'sliding' | 'declining' | 'holding' | 'stable' | 'needs_data'
  pctChange: number | null;   // the receipt number (raw signed); recap-checked as its rounded magnitude
}

export interface NarrativeViolation {
  rule: 'contradiction' | 'recap';
  discipline?: string;
  claim: string;              // the offending snippet / number
  detail: string;
}

type Dir = 'up' | 'down' | 'flat';

const DISC_SYNONYMS: Record<DisciplineVerdict['discipline'], RegExp> = {
  run: /\b(run|running|runs)\b/i,
  bike: /\b(bike|biking|cycling|ride|rides|riding|power)\b/i,
  swim: /\b(swim|swimming|swims)\b/i,
  strength: /\b(strength|lift|lifting|lifts|weights)\b/i,
};

const UP_WORDS = /\b(improv\w*|climb\w*|ris\w*|ticking up|trending up|building|gain\w*|stronger|going up|on the up|up\b)\b/i;
const DOWN_WORDS = /\b(declin\w*|slipp\w*|dropp\w*|falling|fading|regress\w*|weaker|going down|down\b)\b/i;
const FLAT_WORDS = /\b(holding steady|hold\w* steady|holding|steady|flat|plateau\w*|maintain\w*|unchanged|stable|stagnat\w*)\b/i;

function verdictDir(v: string): Dir | null {
  const s = String(v || '').toLowerCase();
  if (s === 'improving') return 'up';
  if (s === 'sliding' || s === 'declining') return 'down';
  if (s === 'holding' || s === 'stable') return 'flat';
  return null; // needs_data / unknown → nothing to contradict
}

function sentenceDir(sentence: string): Dir | null {
  // FLAT is checked first: "holding steady" contains no up/down word but is a real flat claim.
  if (FLAT_WORDS.test(sentence)) return 'flat';
  if (UP_WORDS.test(sentence)) return 'up';
  if (DOWN_WORDS.test(sentence)) return 'down';
  return null;
}

/** Validate a narrative against the spine verdicts. ok=false lists every violation found. */
export function validateNarrative(narrative: string, verdicts: DisciplineVerdict[]): { ok: boolean; violations: NarrativeViolation[] } {
  const violations: NarrativeViolation[] = [];
  const text = String(narrative || '');
  const sentences = text.split(/(?<=[.!?])\s+/);

  // ── Rule 1: contradiction ──
  for (const v of verdicts) {
    const vd = verdictDir(v.verdict);
    if (!vd) continue; // needs_data → no ground-truth direction to defend
    const syn = DISC_SYNONYMS[v.discipline];
    for (const s of sentences) {
      if (!syn.test(s)) continue;
      const sd = sentenceDir(s);
      if (sd && sd !== vd) {
        violations.push({
          rule: 'contradiction', discipline: v.discipline,
          claim: s.trim(),
          detail: `narrative implies ${v.discipline} is ${sd} but the spine verdict is ${v.verdict} (${vd})`,
        });
        break; // one contradiction per discipline is enough
      }
    }
  }

  // ── Rule 2: recap of a receipt number ──
  for (const v of verdicts) {
    if (v.pctChange == null) continue;
    const mag = Math.round(Math.abs(v.pctChange) * 10) / 10; // receipts show |pct| to 1 dp
    if (mag === 0) continue;
    // match "3.6%", "3.6 %", "+3.6%", "-3.6%" — a shown percentage, not "12-week"/"9/10"
    const re = new RegExp(`[+\\-]?${mag.toString().replace('.', '\\.')}\\s*%`);
    const m = text.match(re);
    if (m) {
      violations.push({
        rule: 'recap', discipline: v.discipline,
        claim: m[0],
        detail: `narrative restates the ${v.discipline} receipt number (${m[0]}) already rendered on screen`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * The guard decision, given the first draft and the (optional) single regeneration: pass the draft if
 * clean; else pass the retry if clean; else DROP the prose (dropped=true → render deterministic layers
 * only). A missing narrative is honest; a lying one isn't.
 */
export function resolveGuardedNarrative(
  draft: string | null,
  retry: string | null,
  verdicts: DisciplineVerdict[],
): { narrative: string | null; dropped: boolean } {
  if (!draft) return { narrative: null, dropped: false };
  if (validateNarrative(draft, verdicts).ok) return { narrative: draft, dropped: false };
  if (retry && validateNarrative(retry, verdicts).ok) return { narrative: retry, dropped: false };
  return { narrative: null, dropped: true };
}

/** One-line summary of violations for the regeneration prompt + the rejection log. */
export function violationsPrompt(violations: NarrativeViolation[]): string {
  return violations.map((x) =>
    x.rule === 'contradiction'
      ? `Do NOT say ${x.discipline} is ${x.claim.match(FLAT_WORDS)?.[0] ?? 'that'} — ${x.detail}.`
      : `Do NOT restate the number "${x.claim}" — it is already shown as a receipt on screen.`
  ).join(' ');
}
