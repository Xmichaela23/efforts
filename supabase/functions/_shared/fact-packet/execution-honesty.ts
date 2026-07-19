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
  isMixedEffort?: boolean;         // structured run (tempo/interval/fartlek/warmup→work→cooldown) →
                                   // "held steady" was never the intent, so the guard is suppressed.
}

// A run that faded ≥ this within itself did NOT "hold steady" — provable from its OWN splits, no route
// history needed. 20 sits just above build.ts' even-pacing cutoff (15s/mi = noise), so it's a principled
// GENERAL "this is a real positive split" bar — NOT tuned to any one athlete or run.
const POSITIVE_SPLIT_FADE_SEC = 20;

/**
 * Does this run trip the honesty guard? A within-run positive split alone (no cross-run dependency) —
 * AND only on a steady-effort run. On a structured/mixed-effort session a slower second half is
 * expected (cooldown, back-loaded easy), not a fade, so naming a "fade" there would be its own lie.
 */
export function tripsHonestyGuard(input: ExecutionHonestyInput | null | undefined): boolean {
  if (input?.isMixedEffort) return false; // structured run — nothing "held steady" to guard
  return !!(input && input.positiveSplitSec != null && input.positiveSplitSec >= POSITIVE_SPLIT_FADE_SEC);
}

/**
 * Q-129 mixed-effort hole: the variance gate's `is_mixed_effort` conflates "structured BY DESIGN"
 * with "high variance for ANY reason." A monotonic FADE trips it via `pace_cv` (a big slowdown is a
 * big pace swing) or via a mislabelled unplanned `detected_intervals` (the detector called an easy
 * run "Interval 1") — and those are exactly the runs whose fade must still be named. Only a run
 * PRESCRIBED as structured (a linked plan with interval/tempo intent) has a legitimately-expected
 * slower second half (cooldown), so ONLY those two signals may suppress the fade-honesty guard.
 * This is what feeds ExecutionHonestyInput.isMixedEffort — NOT the raw gate boolean.
 */
export function structuredBySignalSuppressesFade(
  varianceSignal: string | null | undefined,
): boolean {
  return varianceSignal === 'interval_execution' || varianceSignal === 'plan_intent_intervals';
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

// ── PACING-VERDICT GUARD (2026-07-19) — a GROUND RULE, not a phrase patch. ────────────────────────
// The general principle: the narrative may not characterize a metric in a way that contradicts the
// engine's deterministic verdict for it. Here that metric is PACE. A "the pace held steady" claim is
// false whenever the pace actually varied — provable from the splits, no route/athlete tuning. It's a
// sibling of the fade guard: that one forbids "held steady" on a fade; this one forbids "steady PACE"
// on a run whose pace moved (which is EVERY run on rolling terrain paced to HR). EFFORT/HR-steady stays
// legal — those are true. Catches the whole family ("even pace", "held its pace", "consistent pacing"),
// not one sentence.

/** Raw pace variability (CV%) across the mile splits. Null when < 2 splits. */
export function paceVariedPct(splitsMi: any[] | null | undefined): number | null {
  const paces = (Array.isArray(splitsMi) ? splitsMi : [])
    .map((s: any) => { const k = Number(s?.avgPace_s_per_km); return Number.isFinite(k) && k > 0 ? k : NaN; })
    .filter((p) => Number.isFinite(p));
  if (paces.length < 2) return null;
  const mean = paces.reduce((a, b) => a + b, 0) / paces.length;
  if (mean <= 0) return null;
  const sd = Math.sqrt(paces.reduce((a, p) => a + (p - mean) ** 2, 0) / paces.length);
  return Math.round((sd / mean) * 1000) / 10;
}

/** Pace CV above this makes "the pace held steady" a FALSE claim. Steady-state running holds pace within
 *  a few % (CV under ~3-4%); above 5% the pace visibly moved. This is the STEADY-CLAIM line — deliberately
 *  lower than the app's "moderate vs high variability" quality line (CV 10), which answers a different
 *  question. A general linguistic bar on the word "steady", not tuned to any athlete/run. */
export const PACE_STEADY_FALSE_ABOVE_CV = 5;

/** Does the narrative claim the PACE (not effort/HR) held steady/even/constant? Requires "pace/pacing"
 *  adjacent to a steadiness word, so "even effort", "HR steady", "controlled" all stay legal. */
const PACE_STEADY_CLAIM = /\bpac(?:e|es|ed|ing)\b[^.]{0,24}\b(steady|even|constant|consistent|held|holding|flat|unchanging)\b|\b(steady|even|constant|consistent|flat)\b[^.]{0,10}\bpac(?:e|es|ing)\b/i;
export function narrativeClaimsPaceSteady(text: string | null | undefined): boolean {
  return !!text && PACE_STEADY_CLAIM.test(text);
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

/**
 * Q-129 (fallback-surface guard): the deterministic SUMMARY bullets shown when `ai_summary` is
 * null must not LEAD with — or substitute — a laundering "… vs similar workouts" read on a faded
 * run, and must NAME the fade. Same within-run positive-split key as the ai_summary guard (no new
 * threshold, no cross-run dependency). Pure: reorders + drops membership only, invents no claim.
 * Note: this asserts the INTRA-SURFACE consistency class (a card's bullets can't omit their own
 * fade), distinct from the card-vs-spine class — see Q-129 scope + SELF-AWARENESS-MAP rule 11.
 */
export function fadeLeadBullets(
  bullets: string[],
  input: ExecutionHonestyInput | null | undefined,
): string[] {
  const arr = Array.isArray(bullets) ? bullets.filter(Boolean) : [];
  if (!tripsHonestyGuard(input)) return arr;
  // Drop the vs-similar comparison — it's HR-aware and launders a pace collapse into "typical"
  // (same confound family as the GAP terrain bug, Q-130). It must not lead, or stand in for, the fade.
  const kept = arr.filter((b) => !/\bvs\s+similar\s+workouts\b/i.test(b));
  const fadeLine = fmtSlowdown((input as ExecutionHonestyInput).positiveSplitSec as number);
  const existing = kept.find((b) => FADE_MENTION.test(b));
  // Lead with the fade: reuse an existing fade bullet if present, else prepend the computed line.
  return existing ? [existing, ...kept.filter((b) => b !== existing)] : [fadeLine, ...kept];
}

/** The hard rule injected into the LLM prompt (PRIMARY fix) when the guard is tripped. */
export function executionHonestyPromptRule(positiveSplitSec: number): string {
  return [
    `\n\nEXECUTION HONESTY (mandatory): this run FADED — it slowed ~${Math.round(positiveSplitSec)}s/mi in the second half`,
    `(a positive split, measured from its own mile splits).`,
    `You MUST NOT describe it as "clean execution", "steady", "held steady", or "even effort".`,
    `OPEN by describing what happened as a plain observation — the pace slowed in the second half — introducing it fresh, as new information to the reader. Do NOT open with the phrase "the fade" or otherwise refer to the slowdown as something already established; name it, then interpret why.`,
    `If HR stayed in the normal band while pace dropped, note pace fell at normal effort.`,
    `Do not paper the slowdown over with heat or the athlete's self-report as "a clean day."`,
  ].join(' ');
}
