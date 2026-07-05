// Q-128 (D-242 guard): a below-baseline, positive-split run must NOT be narrated as
// "clean / steady execution." PRIMARY fix is prompt-side (executionHonestyPromptRule fed
// into generateAISummaryV1). BACKSTOP is the validator (narrativeHasUnearnedCleanClaim →
// triggers the existing corrective regenerate) + a final deterministic strip
// (guardNarrativeHonesty) so the exact banned claim can never reach the screen.

/** Phrases that assert clean/steady execution — the class banned on a faded run. */
const BANNED_CLAIMS: RegExp[] = [
  /clean execution/i,
  /steady execution/i,
  /executed (?:it )?clean(?:ly)?/i,
  /solid execution/i,
  /pace held steady/i,
  /held (?:a )?steady pace/i,
  /held steady/i,
  /steady throughout/i,
  /even(?:ly)? paced throughout/i,
  /kept (?:the )?pace steady/i,
];

export function narrativeHasUnearnedCleanClaim(text: string | null | undefined): boolean {
  if (!text) return false;
  return BANNED_CLAIMS.some((re) => re.test(text));
}

function toSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z"'])/).map((s) => s.trim()).filter(Boolean);
}

function fmtSlowdown(positiveSplitSec: number): string {
  return `Pace faded ${Math.round(positiveSplitSec)}s/mi through the run — a positive split, not an even effort.`;
}

export interface ExecutionHonestyInput {
  positiveSplitSec: number | null; // second-half slowdown in s/mi (null = unknown / not a positive split)
}

// A run that faded ≥ this within itself did NOT "hold steady" — provable from its OWN splits, no route
// history needed. 20 sits just above build.ts' even-pacing cutoff (15s/mi = noise), so it's a principled
// GENERAL "this is a real positive split" bar — NOT tuned to any one athlete or run.
const POSITIVE_SPLIT_FADE_SEC = 20;

/** Does this run trip the honesty guard? A within-run positive split alone — no cross-run dependency. */
export function tripsHonestyGuard(input: ExecutionHonestyInput | null | undefined): boolean {
  return !!(input && input.positiveSplitSec != null && input.positiveSplitSec >= POSITIVE_SPLIT_FADE_SEC);
}

/**
 * Compute the second-half slowdown (s/mi) from mile splits. Mirrors build.ts' PACING row.
 * Positive return = positive split (faded); ≤0 = even/negative split; null = not computable.
 * Prefers grade-adjusted pace when every split has it (`gapAdjusted`).
 */
export function computePositiveSplitSec(splitsMi: any[], gapAdjusted: boolean): number | null {
  const raw = (Array.isArray(splitsMi) ? splitsMi : []).map((s: any) => {
    const pk = Number(s?.avgPace_s_per_km);
    const gk = Number(s?.avgGapPace_s_per_km);
    return {
      mile: Number(s?.n),
      pace: Number.isFinite(pk) && pk > 0 ? pk * 1.60934 : NaN,
      gap: Number.isFinite(gk) && gk > 0 ? gk * 1.60934 : NaN,
    };
  }).filter((s) => Number.isFinite(s.mile) && s.mile > 0 && Number.isFinite(s.pace) && s.pace > 0);
  if (raw.length < 2) return null;
  const hasGap = gapAdjusted && raw.every((s) => Number.isFinite(s.gap) && s.gap > 0);
  const series = hasGap ? raw.map((s) => s.gap) : raw.map((s) => s.pace);
  const mid = Math.ceil(series.length / 2);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const slowdown = avg(series.slice(mid)) - avg(series.slice(0, mid)); // + = second half slower
  return Math.round(slowdown);
}

/**
 * Final deterministic seatbelt. Returns the narrative unchanged unless the run trips the
 * guard AND the text still asserts clean/steady execution — then drops the offending
 * sentences, substituting an honest slowdown line if that would empty the narrative.
 */
/** Does the text already acknowledge the slowdown? (so we don't double-state it) */
const FADE_MENTION = /\bfad(?:e|ed|ing)?\b|\bslow(?:ed|er|ing)?\b|positive split|second half.*(?:slow|drop)|dropped off|s\/mi (?:slower|down)/i;

export function guardNarrativeHonesty(
  narrative: string | null,
  input: ExecutionHonestyInput,
): { text: string | null; neutralized: boolean } {
  if (!tripsHonestyGuard(input)) return { text: narrative, neutralized: false };
  let text = (narrative ?? '').trim();
  let neutralized = false;
  // 1) strip the banned clean/steady claim if the LLM slipped it in
  if (narrativeHasUnearnedCleanClaim(text)) {
    text = toSentences(text).filter((s) => !narrativeHasUnearnedCleanClaim(s)).join(' ').trim();
    neutralized = true;
  }
  // 2) guarantee the fade is NAMED (the LLM under-complies with the prompt rule): append the
  //    honest, computed slowdown line if nothing in the text acknowledges the slowdown.
  if (!FADE_MENTION.test(text)) {
    const line = fmtSlowdown(input.positiveSplitSec as number);
    text = text.length >= 25 ? `${text} ${line}` : line;
    neutralized = true;
  }
  return { text: text || null, neutralized };
}

/** The hard rule injected into the LLM prompt (PRIMARY fix) when the guard is tripped. */
export function executionHonestyPromptRule(positiveSplitSec: number): string {
  return [
    `\n\nEXECUTION HONESTY (mandatory): this run FADED — it slowed ~${Math.round(positiveSplitSec)}s/mi in the second half`,
    `(a positive split, measured from its own mile splits).`,
    `You MUST NOT describe it as "clean execution", "steady", "held steady", or "even effort".`,
    `Name the slowdown plainly; if HR stayed in the normal band while pace dropped, note pace fell at normal effort.`,
    `Do not paper the fade over with heat or the athlete's self-report as "a clean day."`,
  ].join(' ');
}
