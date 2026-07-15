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

/**
 * SELECT one accent or none from the submitted candidates. Null/empty candidates are ignored (a
 * producer that does not qualify submits null). No qualifier → null (silence, never a backfilled
 * positive — contract §4b). Ties keep submission order.
 */
export function composeWeekAccent(candidates: Array<WeekAccent | null | undefined>): WeekAccent | null {
  const valid = candidates.filter(
    (c): c is WeekAccent => !!c && typeof c.sentence === 'string' && c.sentence.length > 0,
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
  const acwr = typeof opts.runningAcwr === 'number' && Number.isFinite(opts.runningAcwr)
    ? `${opts.runningAcwr.toFixed(1)}× load, ` : '';
  return {
    source: 'overreach',
    tier: ACCENT_TIER.overreach,
    sentence:
      'Both your training load and how you feel are running high this week — a couple of easier days may help you absorb the work.',
    trace: { kind: 'load', detail: `${acwr}readiness ${opts.readiness}` },
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
      sentence:
        'Your lifting landed closer to failure than the plan asked for this week — easing the last rep or two keeps the work repeatable.',
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
  line: string | null | undefined,
  branch: 'carried' | 'positive' | 'behind' | 'nothing_loaded' | null | undefined,
): WeekAccent | null {
  if (!line || !branch) return null;
  // 'behind' (under-executed the priority discipline) and 'nothing_loaded' are both under-training
  // nudges → the lowest priority tier. 'carried' → substitution. 'positive' → first-class positive.
  const source: AccentSource =
    branch === 'positive' ? 'positive'
    : branch === 'carried' ? 'substitution'
    : 'nothing_loaded'; // 'behind' | 'nothing_loaded'
  const kind: AccentTrace['kind'] = source === 'nothing_loaded' ? 'adherence' : 'load';
  const detail = source === 'nothing_loaded'
    ? 'planned-vs-done counts; total load low'
    : 'per-domain acute-load composition';
  return { source, tier: ACCENT_TIER[source], sentence: line, trace: { kind, detail } };
}

// The athlete's word for a discipline (plain English, never our internal keys).
const DISC_WORD: Record<string, string> = {
  run: 'running', ride: 'cycling', bike: 'cycling', swim: 'swimming', strength: 'strength',
};
function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function joinWords(cs: string[]): string {
  const w = cs.map((c) => DISC_WORD[c] ?? c);
  if (w.length <= 1) return cap(w[0] ?? '');
  if (w.length === 2) return `${cap(w[0])} and ${w[1]}`;
  return `${cap(w[0])}, ${w.slice(1, -1).join(', ')} and ${w[w.length - 1]}`;
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
  underDone: string | null;        // the discipline that eased off (e.g. 'run')
  carriers: string[];              // disciplines that carried the load (e.g. ['swim','strength'])
  aerobicCarried: boolean;         // an aerobic cross-training discipline (swim/bike) carried it
  rirUnderTarget?: boolean;        // fold in a RIR heads-up tail
}): WeekAccent | null {
  const { underDone, carriers, aerobicCarried, rirUnderTarget } = opts;
  if (!underDone || carriers.length === 0) return null;
  const under = DISC_WORD[underDone] ?? underDone;
  let sentence = aerobicCarried
    ? `${joinWords(carriers)} carried the week while ${under} eased off. Your aerobic base is likely covered — ${under}-specific speed is what the trade costs if it holds.`
    : `${joinWords(carriers)} carried the load while ${under} eased off — worth getting a ${under.replace(/ing$/, '')} back in before the ${under}-specific side slips.`;
  if (rirUnderTarget) {
    sentence += ` Your lifts also came in a little harder than planned — worth easing the last rep or two next week.`;
  }
  return {
    source: 'substitution',
    tier: ACCENT_TIER.substitution,
    sentence,
    trace: { kind: 'load', detail: `${under} under plan; load carried by ${carriers.join(', ')}${rirUnderTarget ? '; avg RIR under target' : ''}` },
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
