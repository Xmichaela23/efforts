// Shared narrative-reasoning core — the VALIDATOR SUITE (the backstop half). validateNarrative runs
// the same checks for every discipline, driven entirely by the adapter-built NarrativeContext (no
// discipline knowledge here). Lexical-deterministic, consistent with the existing validateClaimsGrounded
// / validateTerrainExplainsDrift precedent. CONSERVATIVE BY DESIGN: high precision (only fire on clear
// violations) so a compliant narrative never trips — the swim acceptance gate proves this. The scaffold
// is the primary enforcement (reason right first); these catch what slips.

import type { NarrativeContext, ValidationResult, ValidationFailure, DisciplineVerdict } from './types.ts';

// ── Rule 6/7 helpers — map spine verdicts + narrative trend-words to a direction (absorbed from the
//    former response-model/narrative-guard; deleted in this convergence). ──
const DISC_SYNONYMS: Record<DisciplineVerdict['discipline'], RegExp> = {
  run: /\b(run|running|runs)\b/i,
  bike: /\b(bike|biking|cycling|ride|rides|riding|power)\b/i,
  swim: /\b(swim|swimming|swims)\b/i,
  strength: /\b(strength|lift|lifting|lifts|weights)\b/i,
};
const UP_WORDS = /\b(improv\w*|climb\w*|ris\w*|ticking up|trending up|building|gain\w*|stronger|going up|on the up|up\b)\b/i;
const DOWN_WORDS = /\b(declin\w*|slipp\w*|dropp\w*|falling|fading|regress\w*|weaker|going down|down\b)\b/i;
const FLAT_WORDS = /\b(holding steady|hold\w* steady|holding|steady|flat|plateau\w*|maintain\w*|unchanged|stable|stagnat\w*)\b/i;
function verdictDir(v: string): 'up' | 'down' | 'flat' | null {
  const s = String(v || '').toLowerCase();
  if (s === 'improving') return 'up';
  if (s === 'sliding' || s === 'declining') return 'down';
  if (s === 'holding' || s === 'stable') return 'flat';
  return null;
}
function sentenceDir(sentence: string): 'up' | 'down' | 'flat' | null {
  if (FLAT_WORDS.test(sentence)) return 'flat'; // "holding steady" has no up/down word — check first
  if (UP_WORDS.test(sentence)) return 'up';
  if (DOWN_WORDS.test(sentence)) return 'down';
  return null;
}

const firstSentence = (s: string): string => {
  const m = s.match(/^[\s\S]*?[.!?](\s|$)/);
  return (m ? m[0] : s).trim();
};

// "calls the effort uniformly steady/easy" lexicon (Rule 2 trigger). Checked across the WHOLE narrative,
// not just the lead — a cross-section contradiction ("HR is steady" in the body while drift is elevated)
// is a violation wherever it appears. Gated on atypicalSignals so a genuinely-easy session (no atypical
// signal — e.g. a compliant swim) never trips it.
const EASY_ANYWHERE = /\b(steady|controlled|comfortable|relaxed|in control|well within|cruis\w+|easy)\b/i;
// tokens that COUNT as acknowledging an atypical signal (so the lead isn't a contradiction).
const ACK_ATYPICAL = /\b(drift|decoupl\w+|elevated|higher than (typical|usual|normal)|climbed|crept up|rose (over|through)|ran high)\b/i;
// READINESS verdicts (Rule 5) — race-readiness is NEVER grounded by one session OR a trend; always fire.
const READINESS_VERDICT = /\b(signal(s|ing)?\s+(you'?re|you are)\s+ready|you'?re\s+ready\b|ready\s+(to\s+race|for\s+(race|your|the)\b)|peaking|dialed\s+in|primed)\b/i;
// FITNESS-STATE verdicts (Rule 5) — "X is holding/building" needs a FITNESS-grade trend (ctx.hasFitnessTrend:
// ride's spine verdict qualifies, run's pace-similarity does NOT). Fires when no fitness trend backs it.
const FITNESS_STATE = /\b(aerobic\s+base\s+is\s+(holding|building)|fitness\s+is\s+(holding|building|improving|responding|consolidating|sharpening)|efficiency\s+is\s+holding|strength\s+is\s+(building|holding|improving|progressing|climbing)|getting\s+stronger)\b/i;
// DIRECTION verdicts (Rule 5) — pace/power direction needs a (similarity-grade) trend field (ctx.hasTrendField).
const DIRECTION_VERDICT = /\b(improving|declining|getting\s+(faster|fitter|stronger)|losing\s+fitness|building\s+fitness|trending\s+(up|down)|worth\s+monitoring)\b/i;
// explicit causal connectives (Rule 4).
const CAUSAL = /\b(caused by|because of|due to|drove the|led to the|resulted in|attributable to)\b/i;
const NON_DET_FACTORS = ['heat', 'temperature', 'terrain', 'grade', 'hill', 'hills', 'fatigue', 'tired', 'dehydration', 'dehydrated', 'humidity'];
// physiological-STATE diagnoses (Rule 4) — unprovable verdicts the narrative must not assert; observe the
// pattern instead ("load climbed while readiness dipped"). Highest-risk for the week-level coach voice.
const STATE_DIAGNOSIS = /\b(overreach\w*|overtrain\w*|under.?recover\w*|burn(t|ed)?\s?out|detrain\w*)\b/i;
// hedge words that turn a cause/state claim into an allowed PLAUSIBLE attribution (shared by both Rule-4 checks).
const HEDGE = /\b(likely|probably|possibly|perhaps|may|might|seem\w*|appear\w*|suggest\w*|partly|partial\w*|some of|tend\w*|can\b|risk of)\b/i;

export function validateNarrative(summary: string, ctx: NarrativeContext): ValidationResult {
  const failures: ValidationFailure[] = [];
  const text = summary || '';
  const lead = firstSentence(text);

  // ── Rule 1 — lead-signal coverage: a NOTABLE lead signal must not be dropped (the heat-silo fix).
  for (const n of ctx.notableLeadSignals) {
    const mentioned = n.mentions.some((tok) => text.toLowerCase().includes(tok.toLowerCase()));
    if (!mentioned) {
      failures.push({ rule: 1, code: 'lead_signal_dropped', why: `The narrative omits ${n.signal} (${n.detail}), a notable signal this session. Reason about it together with the other lead signals — do not drop it.` });
    }
  }

  // ── Rule 2 — no contradiction: the narrative calls the effort steady/easy (anywhere) while an atypical
  //    signal is left unreconciled (no acknowledging token anywhere). Gated on atypicalSignals.
  if (ctx.atypicalSignals.length && EASY_ANYWHERE.test(text) && !ACK_ATYPICAL.test(text)) {
    failures.push({ rule: 2, code: 'unreconciled_atypical', why: `The lead calls the session steady/easy while these are atypical this session: ${ctx.atypicalSignals.map((s) => `${s.signal} ${s.state}${s.detail ? ` (${s.detail})` : ''}`).join(', ')}. Reconcile the lead with them, or don't call it steady.` });
  }

  // ── Rule 5a — readiness verdict: race-readiness ("you're ready", "primed", "peaking") is never grounded
  //    by one session or a trend. Always fire.
  if (READINESS_VERDICT.test(text)) {
    failures.push({ rule: 5, code: 'single_session_readiness', why: `Drop the readiness verdict (e.g. "signaling you're ready", "primed") — one session/trend can't establish race-readiness. Describe THIS session only.` });
  }
  // ── Rule 5b — fitness-state verdict ("fitness is holding/building") WITHOUT a fitness-grade trend.
  //    (Ride's spine cross_workout.trend grounds it; run's pace-similarity does not — the adapter decides.)
  if (!ctx.hasFitnessTrend && FITNESS_STATE.test(text)) {
    failures.push({ rule: 5, code: 'ungrounded_fitness_state', why: `No fitness-grade trend backs a fitness-state claim ("aerobic base is holding", "fitness is building") from this one session. Drop it; describe only this session.` });
  }
  // ── Rule 5c — direction verdict (improving/declining) without a (similarity-grade) trend field.
  if (!ctx.hasTrendField && DIRECTION_VERDICT.test(text)) {
    failures.push({ rule: 5, code: 'ungrounded_direction', why: `No multi-session trend is provided, so drop the direction claim (improving/declining/trending). Describe only this session.` });
  }

  // ── Rule 3 — anchorless effort: characterizing HR as easy/hard/elevated when no HR anchor is on file.
  if (ctx.anchors.hr == null && /\b(hr|heart rate|bpm)\b/i.test(text) && /\b(easy|hard|elevated|high|low|controlled|conversational)\b/i.test(text)) {
    // only fire if an effort adjective sits near an HR token (within ~40 chars)
    if (/(hr|heart rate|bpm)[^.]{0,40}\b(easy|hard|elevated|high|low|controlled|conversational)\b|\b(easy|hard|elevated|high|low|controlled|conversational)\b[^.]{0,40}(hr|heart rate|bpm)/i.test(text)) {
      failures.push({ rule: 3, code: 'anchorless_hr', why: `No HR zones/threshold are on file, so do not characterize HR as easy/hard/elevated/controlled — report it neutrally.` });
    }
  }

  // ── Rule 4 — cause diagnosis: a causal connective tying the result to a non-established factor — UNLESS
  //    the claim is HEDGED ("rolling climbs LIKELY drove the surges" is the allowed plausible-contributor
  //    framing, not a proven cause). Only fire on an UNhedged causal connective.
  const causalMatch = text.match(CAUSAL);
  if (causalMatch) {
    const idx = causalMatch.index ?? 0;
    const hedged = HEDGE.test(text.slice(Math.max(0, idx - 28), idx));
    if (!hedged) {
      const factorRe = new RegExp(`\\b(${NON_DET_FACTORS.join('|')})\\b`, 'i');
      const m = text.match(factorRe);
      if (m && !ctx.establishedCauses.includes(m[1].toLowerCase())) {
        failures.push({ rule: 4, code: 'cause_diagnosed', why: `"${m[1]}" is stated as a proven cause, but it is not deterministically established this session. Name it as a plausible contributor (e.g. "likely", "partly"), not the sole cause.` });
      }
    }
  }
  // ── Rule 4b — physiological-state diagnosis (overreaching / overtrained / under-recovered / burnt out /
  //    detraining): an unprovable verdict unless hedged. Observe the pattern instead. (Week-level coach risk.)
  const stateMatch = text.match(STATE_DIAGNOSIS);
  if (stateMatch) {
    const idx = stateMatch.index ?? 0;
    const hedged = HEDGE.test(text.slice(Math.max(0, idx - 28), idx));
    if (!hedged) {
      failures.push({ rule: 4, code: 'state_diagnosed', why: `"${stateMatch[0]}" is a physiological-state diagnosis the data can't prove. Observe the pattern instead (e.g. "load climbed while readiness dipped"), or hedge it ("may be", "signals suggest").` });
    }
  }

  // ── Rule 6 — spine contradiction: a trend-direction claim about a discipline that conflicts with that
  //    discipline's state_trends_v1 verdict ("run holding steady" when the spine says run is improving).
  //    Multi-discipline (the coach week case); per-workout surfaces pass a single-discipline verdict.
  for (const v of ctx.disciplineVerdicts ?? []) {
    const vd = verdictDir(v.verdict);
    if (!vd) continue; // needs_data ⇒ no ground truth to defend
    const syn = DISC_SYNONYMS[v.discipline];
    for (const s of text.split(/(?<=[.!?])\s+/)) {
      if (!syn.test(s)) continue;
      const sd = sentenceDir(s);
      if (sd && sd !== vd) {
        failures.push({ rule: 6, code: 'spine_contradiction', why: `The narrative implies ${v.discipline} is ${sd}, but the spine verdict is ${v.verdict}. Do not contradict the on-screen trend — describe the plan/state, not a conflicting direction.` });
        break;
      }
    }
  }

  // ── Rule 7 — receipt recap: restating a number already rendered as a receipt (the "+3.6%" class).
  for (const v of ctx.disciplineVerdicts ?? []) {
    if (v.pctChange == null) continue;
    const mag = Math.round(Math.abs(v.pctChange) * 10) / 10;
    if (mag === 0) continue;
    const m = text.match(new RegExp(`[+\\-]?${mag.toString().replace('.', '\\.')}\\s*%`));
    if (m) {
      failures.push({ rule: 7, code: 'receipt_recap', why: `Do not restate "${m[0]}" — the ${v.discipline} figure is already shown as a receipt on screen. Interpret, don't recap.` });
    }
  }

  const retryNote = failures.length
    ? 'REVISE — the draft violates the shared reasoning rules:\n' + failures.map((f) => `- (rule ${f.rule}) ${f.why}`).join('\n')
    : '';
  return { ok: failures.length === 0, failures, retryNote };
}
