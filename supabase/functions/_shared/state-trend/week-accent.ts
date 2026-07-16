// THE ACCENT COMPOSER — the single owner of the State "how your sessions went" accent line.
//
// Contract: docs/STATE-WEEK-EXECUTION.md. The section is neutral per-discipline COUNTS + at most ONE
// accent. Producers submit candidates; THIS module selects one or none. Producers never write to the
// section directly, and the voice rules (§5) are enforced HERE in the sentences — never left to producers.
//
// ⛔ THE ACCENT IS NOT A SECOND POSTURE LINE. The posture read (`postureSentence`) renders in
// PERFORMANCE and is untouched (contract §7). The accent tells the LOAD / execution story; adaptation
// consequences belong to PERFORMANCE and the lever (voice §5b). A ride carries LOAD; it does not carry
// run adaptation, and no accent here claims otherwise.

export type AccentSource =
  | 'overreach'      // safety-adjacent: load AND body both read high
  | 'lever'          // trend + plan-gap agreement (DORMANT — see below)
  | 'rir'            // logged sets landed below the prescribed RIR target
  | 'substitution'   // swap / load-carried-by-another-slice
  | 'positive'       // positive maintenance (load held via cross-training)
  | 'nothing_loaded'; // genuine under-training nudge

// Priority (contract §4a). LOWER number = higher priority. Highest qualifying wins; the rest are
// dropped, not queued. Silence (no qualifier) is a valid, expected output (§4b).
export const ACCENT_TIER: Record<AccentSource, number> = {
  overreach: 1,
  lever: 2,
  rir: 3,
  substitution: 4,
  positive: 5,
  nothing_loaded: 6,
};

export interface AccentTrace {
  /** Which measurement backs this accent — drives the tap-through (voice §5c). A candidate that
   *  cannot cite its measurement is not a valid candidate. */
  kind: 'load' | 'trend' | 'logged_sets' | 'adherence';
  detail: string;
}

export interface WeekAccent {
  source: AccentSource;
  tier: number;
  sentence: string;
  trace: AccentTrace;
}

// ── THE VOICE, ENFORCED ──────────────────────────────────────────────────────────────────────────
// Register: "a quant who trains, not a coach who encourages." (copy-voice memory; docs/STATE-WEEK-
// EXECUTION.md). This is a HARD CHECK, not a suggestion — a sentence that trips it is a bug, and the
// composer DROPS it (silence is legal) rather than ship a fortune cookie. Fixed templates fill number
// slots; nothing here generates freeform prose.
const BANNED_WORDS = [
  // praise / filler — if it works on a motivational poster, it is dead
  'well', 'great', 'solid', 'nice', 'good job', 'keep it up', 'stay consistent',
  'crushing it', 'body is ready', 'on track',
  // imperatives — the app OBSERVES and names trades; it does not instruct. The user drives.
  'stay', 'keep', 'try', 'consider', 'focus',
];
/** First voice violation in a sentence, or null if clean. Exclamation marks and any banned word (whole-
 *  word, case-insensitive) fail. Used to gate every emitted accent AND asserted over every template. */
export function voiceViolation(sentence: string): string | null {
  if (sentence.includes('!')) return 'exclamation mark';
  const lower = sentence.toLowerCase();
  for (const w of BANNED_WORDS) {
    if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) return w;
  }
  return null;
}

/**
 * SELECT one accent or none from the submitted candidates. Null/empty candidates are ignored, and any
 * candidate whose sentence trips the voice check is DROPPED (silence over a fortune cookie — contract
 * §4b + the voice spec). No qualifier → null. Ties keep submission order.
 */
export function composeWeekAccent(candidates: Array<WeekAccent | null | undefined>): WeekAccent | null {
  const valid = candidates.filter(
    (c): c is WeekAccent => !!c && typeof c.sentence === 'string' && c.sentence.length > 0 && !voiceViolation(c.sentence),
  );
  if (valid.length === 0) return null;
  return valid.slice().sort((a, b) => a.tier - b.tier)[0];
}

// ── CANDIDATE BUILDERS — each returns a WeekAccent when it qualifies, else null. ─────────────────────

/**
 * (c) OVER-REACH — tier 1, safety-adjacent. Qualifies ONLY when the load state and the body agree that
 * it is too much (contract §3c). This is the D-260/D-266 law made a gate: the ratio DESCRIBES, the body
 * PRESCRIBES — neither alone escalates, so ACWR-high with a fine body is NOT an over-reach accent.
 * Conditional voice (§5a); load language (§5b).
 */
export function overReachCandidate(opts: {
  loadStatus: string | null | undefined;
  readiness: string | null | undefined;
  runningAcwr?: number | null;
}): WeekAccent | null {
  const loadHigh = opts.loadStatus === 'elevated' || opts.loadStatus === 'high';
  const bodyStrained = opts.readiness === 'overreached' || opts.readiness === 'fatigued';
  if (!(loadHigh && bodyStrained)) return null;
  const hasAcwr = typeof opts.runningAcwr === 'number' && Number.isFinite(opts.runningAcwr);
  const lead = hasAcwr
    ? `Load is running about ${opts.runningAcwr!.toFixed(1)}× while readiness reads strained`
    : `Load and readiness both read high this week`;
  return {
    source: 'overreach',
    tier: ACCENT_TIER.overreach,
    sentence: `${lead} — the pairing that usually needs absorbing before more.`,
    trace: { kind: 'load', detail: `${hasAcwr ? `${opts.runningAcwr!.toFixed(1)}× load, ` : ''}readiness ${opts.readiness}` },
  };
}

/**
 * (d) RIR / PROTOCOL — tier 3. Needs BOTH the week's actual average RIR and a prescribed target to
 * compare (contract §3d). No target → returns null and the caller reports the gap (§7); we never invent
 * a target. Below target by ≥1 full rep = closer to failure than the plan asked.
 */
export function rirCandidate(opts: {
  actualRir: number | null | undefined;
  targetRir: number | null | undefined;
  sampleSize: number | null | undefined;
}): WeekAccent | null {
  const { actualRir, targetRir, sampleSize } = opts;
  if (actualRir == null || targetRir == null) return null; // §7: missing number → does not qualify
  if ((sampleSize ?? 0) < 2) return null; // one session isn't a week's pattern
  if (actualRir <= targetRir - 1) {
    return {
      source: 'rir',
      tier: ACCENT_TIER.rir,
      sentence: `Lifts landed near RIR ${round05(actualRir)} against a ${round05(targetRir)} target this week — closer to failure than planned.`,
      trace: { kind: 'logged_sets', detail: `avg RIR ${actualRir} vs target ${targetRir}, ${sampleSize} sessions` },
    };
  }
  return null;
}

/**
 * (a/e/positive) THE BANNER — `off-plan-banner.ts` already mints the swap-aware, load-only, non-punitive
 * line (contract §3a/§3e). It speaks in LOAD only and never claims adaptation, so the voice is already
 * compliant. `branch` classifies which read it is so the priority is honest:
 *   'carried'        → substitution (tier 4)
 *   'positive'       → positive maintenance (tier 5) — first-class, not a fallback (§4c)
 *   'nothing_loaded' → under-training nudge (tier 6)
 * The coach knows the branch (it picked the banner constant); it is not re-parsed from the string here.
 */
export function bannerCandidate(
  _line: string | null | undefined, // the coach-HEADLINE copy is NOT reused — that voice ("on track",
  branch: 'carried' | 'positive' | 'behind' | 'nothing_loaded' | null | undefined, // "get back on schedule") fails the spec
): WeekAccent | null {
  if (!branch) return null;
  // 'positive' = a boring, on-plan week → SILENCE (the voice spec: a boring week gets nothing).
  // 'carried' = a substitution → the tradeCandidate owns it (fact-first, with numbers). Both → null here.
  if (branch === 'positive' || branch === 'carried') return null;
  // 'behind' / 'nothing_loaded' = genuine under-training. Fact, no imperative, no praise.
  const sentence = branch === 'behind'
    ? 'Strength came in under plan this week — the priority sessions are the gap.'
    : "Planned sessions came up short this week and nothing else carried the load — under the week's target.";
  return { source: 'nothing_loaded', tier: ACCENT_TIER.nothing_loaded, sentence, trace: { kind: 'adherence', detail: 'planned-vs-done counts; total load low' } };
}

// The athlete's word for a discipline (plain English, never our internal keys).
const DISC_WORD: Record<string, string> = {
  run: 'running', ride: 'cycling', bike: 'cycling', swim: 'swimming', strength: 'strength',
};
function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function round05(n: number): number { return Math.round(n * 2) / 2; } // human units: RIR to the nearest half
function joinWords(cs: string[]): string { // lowercase — callers cap() when it leads the sentence
  const w = cs.map((c) => DISC_WORD[c] ?? c);
  if (w.length <= 1) return w[0] ?? '';
  if (w.length === 2) return `${w[0]} and ${w[1]}`;
  return `${w[0]}, ${w.slice(1, -1).join(', ')} and ${w[w.length - 1]}`;
}

/**
 * (a) THE TRADE — tier 4 (substitution). The warm, human read of a SWAP: names what carried the week,
 * what eased off, and the trade's UPSIDE and DOWNSIDE in plain words (the athlete's mockup). Unlike the
 * old load-only banner line, this names the adaptation trade — but honestly:
 *  - The "aerobic base likely covered" claim fires ONLY when an aerobic cross-training discipline
 *    (swim/bike) carried the load. Strength alone does not hold an aerobic base, so we don't claim it.
 *  - The cost is the SPECIFICITY the cross-training can't replace ({discipline}-specific speed), stated
 *    conditionally ("if it holds") — never as a prophecy.
 * A RIR shortfall folds in as one tail clause so the week is ONE sentence, not two accents.
 */
export function tradeCandidate(opts: {
  underDone: string | null;          // the endurance discipline that came in light (e.g. 'run')
  underDoneDone?: number;            // sessions done this week (for the fact-first lead)
  underDonePlanned?: number;         // sessions planned this week
  aerobicCarriers: string[];         // ONLY aerobic cross-training (swim/bike) carries the endurance
                                     // load. Strength is a different modality — it never appears here.
  rirActual?: number | null;         // fold a RIR shortfall in as one numbered tail clause
  rirTarget?: number | null;
}): WeekAccent | null {
  const { underDone, underDoneDone, underDonePlanned, aerobicCarriers, rirActual, rirTarget } = opts;
  // A TRADE requires a real aerobic SUBSTITUTION — swim/bike picked up the endurance load. Running
  // simply coming in light with nothing aerobic underneath is under-training, not a trade (the banner
  // or the posture line owns that), so we stay silent here rather than invent a carrier.
  if (!underDone || aerobicCarriers.length === 0) return null;
  const under = DISC_WORD[underDone] ?? underDone;
  const hasCount = typeof underDoneDone === 'number' && typeof underDonePlanned === 'number' && underDonePlanned > 0;
  const lead = hasCount
    ? `${cap(under)} came in at ${underDoneDone} of ${underDonePlanned} this week`
    : `${cap(under)} came in light this week`;
  // Fact first, then the trade: aerobic work transfers, specificity does not — conditional, mechanism named.
  let sentence = `${lead}; ${joinWords(aerobicCarriers)} carried the endurance load. Aerobic fitness holds across sports — ${under}-specific speed is the part that does not, if this stays here.`;
  const rirUnder = typeof rirActual === 'number' && typeof rirTarget === 'number' && rirActual <= rirTarget - 1;
  if (rirUnder) {
    sentence += ` Lifts landed near RIR ${round05(rirActual)} against a ${round05(rirTarget)} target — closer to failure than planned.`;
  }
  return {
    source: 'substitution',
    tier: ACCENT_TIER.substitution,
    sentence,
    trace: { kind: 'load', detail: `${under} ${hasCount ? `${underDoneDone}/${underDonePlanned}` : 'under plan'}; endurance carried by ${aerobicCarriers.join(', ')}${rirUnder ? '; RIR under target' : ''}` },
  };
}

/**
 * (b) THE LEVER — tier 2. DORMANT by construction, and deliberately so.
 *
 * The lever is the fitness↔plan join specified in SPEC-state-fitness-band §2c ("this dot is the price
 * → view plan row"). Its SENTENCE does not exist yet — it is owed by the unbuilt State v3 fitness band.
 * Rendering `postureSentence` here instead would duplicate the PERFORMANCE posture line (§7 — untouched),
 * re-creating the exact duplication this whole redesign removes. So the slot is defined and reserved;
 * it qualifies only once the band ships and can hand it a real, plan-linked sentence. Until then: null.
 */
export function leverCandidate(): WeekAccent | null {
  return null; // owed by State v3 (SPEC-state-fitness-band §2c). See docs/STATE-WEEK-EXECUTION.md.
}
