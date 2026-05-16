import type { CyclingFactPacketV1, CyclingFlagV1 } from './types.ts';
import { callLLM } from '../llm.ts';
import type { ArcNarrativeContextV1 } from '../arc-narrative-state.ts';
import { arcModeSystemAddon, arcNarrativeFactBlock } from '../arc-narrative-ai-appendix.ts';

/**
 * Numbers the LLM may legitimately cite from the temporal Arc frame (days
 * since/until a race, target dates, priority, focus date). Appended to the
 * validator's allow-source so an Arc-grounded sentence ("about 25 days after
 * Ojai") is not rejected as a hallucinated number. Mirrors running's
 * `numericAllowAnchors` (_shared/fact-packet/ai-summary.ts).
 */
export function arcNumericAllowList(
  arcNarrative: ArcNarrativeContextV1 | null | undefined,
): string {
  if (!arcNarrative) return '';
  return '\n' + arcNarrativeFactBlock(arcNarrative) + '\n' + JSON.stringify(arcNarrative);
}

function normalizeParagraph(s: string): string {
  // Strip markdown the LLM sometimes emits (e.g. **bold**) — it renders as
  // literal asterisks in the UI. Mirrors the syntax strips in the codebase's
  // canonical stripMarkdown (_shared/athlete-snapshot/coaching.ts:429):
  // bold/italic/heading/list-bullet. The coaching-specific section-label
  // strips there (HEADLINE/NARRATIVE/…) don't apply to a one-paragraph ride
  // summary, so they're omitted. Done before whitespace-collapse so the
  // line-anchored heading/bullet patterns still see original newlines.
  // (running's fact-packet/ai-summary.ts has no markdown strip; this follows
  // the established stripMarkdown pattern instead.)
  const stripped = String(s || '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-]\s+/gm, '');
  const t = stripped.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // Strip wrapping quotes/brackets if model returns them.
  return t.replace(/^["'`]+/, '').replace(/["'`]+$/, '').trim();
}

// Ported verbatim from running's _shared/fact-packet/ai-summary.ts so cycling
// narrative validation matches running's leniency exactly. The old cycling
// version did exact set-membership on unit-attached tokens ("187 w") against a
// packet that formats values with a space ("187 W"), so an LLM writing the
// natural "187W" was rejected as a new number — nulling nearly every cycling
// narrative. Running's approach: extract BARE numbers and substring-match them
// against the serialized packet. `\b\d+\b` does not match inside "187W" (no word
// boundary before W), so unit-suffixed numbers produce no token and pass; spaced
// numbers ("187 W") yield "187" which substring-matches the packet.
export function extractNumericTokens(text: string): string[] {
  const s = String(text || '');
  const out = new Set<string>();
  for (const m of s.matchAll(/\b\d{1,2}:\d{2}\/mi\b/g)) out.add(m[0]);
  for (const m of s.matchAll(/\b\d+(?:\.\d+)?%\b/g)) out.add(m[0]);
  for (const m of s.matchAll(/\b\d+(?:\.\d+)?\b/g)) out.add(m[0]);
  return Array.from(out);
}

export function validateNoNewNumbers(
  summary: string,
  displayPacketStr: string,
): { ok: boolean; bad: string[] } {
  const displayStr = String(displayPacketStr || '');
  const tokens = extractNumericTokens(summary);
  const bad: string[] = [];
  for (const t of tokens) {
    if (t === '1') continue; // trivial — matches running
    if (!displayStr.includes(t)) bad.push(t);
  }
  return { ok: bad.length === 0, bad };
}

/**
 * Compact, number-bearing cross-workout block for the AI summary — parity with
 * analyze-running-workout, whose fact packet carries derived.comparisons before
 * the summary runs. Surfacing these here (a) lets the narrative lead with the
 * trend/comparison instead of a single-ride readout, and (b) whitelists their
 * numbers for validateNoNewNumbers (which only allows tokens present in the
 * serialized packet). Returns null when no cross-workout signal is meaningful.
 */
export function cyclingCrossWorkoutDisplay(cw: {
  vsSimilar?: any; achievements?: any; npTrend?: any; limiter?: any;
} | null | undefined): any | null {
  if (!cw) return null;
  const out: any = {};

  const vs = cw.vsSimilar;
  if (vs && vs.np_delta_w != null && Number.isFinite(Number(vs.np_delta_w))) {
    out.vs_similar = {
      matched_type: vs.matched_type ?? null,
      sample_size: (vs.sample_size != null && Number.isFinite(Number(vs.sample_size))) ? Number(vs.sample_size) : null,
      np_delta_w: Math.round(Number(vs.np_delta_w)),
      if_delta: (vs.if_delta != null && Number.isFinite(Number(vs.if_delta))) ? Number(Number(vs.if_delta).toFixed(2)) : null,
      assessment: typeof vs.assessment === 'string' ? vs.assessment : null,
    };
  }

  const tr = cw.npTrend;
  if (tr && Array.isArray(tr.points) && tr.points.length >= 3) {
    const pts = [...tr.points]
      .filter((p: any) => p && Number.isFinite(Number(p.value)))
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
    if (pts.length >= 3) {
      const mid = Math.ceil(pts.length / 2);
      const avg = (arr: any[]) => arr.reduce((s, p) => s + Number(p.value), 0) / arr.length;
      const delta = Math.round(avg(pts.slice(mid)) - avg(pts.slice(0, mid)));
      out.np_trend = {
        points: pts.length,
        direction: delta > 3 ? 'improving' : delta < -3 ? 'declining' : 'stable',
        delta_w: delta,
      };
    }
  }

  const prs = cw.achievements;
  if (prs && prs.durations && typeof prs.durations === 'object') {
    const ach: string[] = [];
    for (const d of ['20min', '5min', '1min']) {
      const e = (prs.durations as any)[d];
      const at = e?.all_time_pr?.value;
      const rc = e?.recent_pr?.value;
      if (Number.isFinite(Number(at))) ach.push(`${d} ${Math.round(Number(at))}W all-time best`);
      else if (Number.isFinite(Number(rc))) ach.push(`${d} ${Math.round(Number(rc))}W 90-day best`);
    }
    if (ach.length > 0) out.power_prs = ach;
  }

  const lim = cw.limiter;
  if (lim && lim.flag && lim.flag !== 'none' && lim.source !== 'insufficient_data') {
    out.limiter = {
      flag: String(lim.flag),
      detail: typeof lim.detail === 'string' ? lim.detail : null,
    };
  }

  return Object.keys(out).length > 0 ? out : null;
}

function toDisplayPacket(
  fp: CyclingFactPacketV1,
  flags: CyclingFlagV1[],
  crossWorkout?: { vsSimilar?: any; achievements?: any; npTrend?: any; limiter?: any } | null,
): any {
  const f = fp.facts;
  const d = fp.derived;
  const tl = (d as any)?.training_load || null;
  const plan = (d as any)?.plan_context || null;
  const trainingLoad = (() => {
    if (!tl || typeof tl !== 'object') return null;
    const weekPct = (tl as any).week_load_pct;
    const acwr = (tl as any).acwr_ratio;
    const streak = (tl as any).consecutive_training_days;
    return {
      week_load_pct: (typeof weekPct === 'number' && Number.isFinite(weekPct)) ? `${Math.round(weekPct)}%` : null,
      acwr_ratio: (typeof acwr === 'number' && Number.isFinite(acwr)) ? `${Math.round(acwr * 100) / 100}` : null,
      acwr_status: (typeof (tl as any).acwr_status === 'string') ? String((tl as any).acwr_status) : null,
      consecutive_training_days: (typeof streak === 'number' && Number.isFinite(streak)) ? `${Math.round(streak)} days` : null,
      cumulative_fatigue: (typeof (tl as any).cumulative_fatigue === 'string') ? String((tl as any).cumulative_fatigue) : null,
      fatigue_evidence: Array.isArray((tl as any).fatigue_evidence) ? (tl as any).fatigue_evidence.slice(0, 3) : null,
    };
  })();
  return {
    discipline: 'ride',
    classified_type: f.classified_type,
    plan_intent: f.plan_intent,
    duration: f.total_duration_min != null ? `${Math.round(f.total_duration_min)} min` : null,
    distance: f.total_distance_mi != null ? `${f.total_distance_mi.toFixed(1)} mi` : null,
    power: {
      avg: f.avg_power_w != null ? `${Math.round(f.avg_power_w)} W` : null,
      np: f.normalized_power_w != null ? `${Math.round(f.normalized_power_w)} W` : null,
      if: f.intensity_factor != null ? `${f.intensity_factor.toFixed(2)}` : null,
      vi: f.variability_index != null ? `${f.variability_index.toFixed(2)}` : null,
      ftp: f.ftp_w != null ? `${Math.round(f.ftp_w)} W` : null,
      bins_min: d.ftp_bins,
    },
    hr: {
      avg: f.avg_hr != null ? `${Math.round(f.avg_hr)} bpm` : null,
      max: f.max_hr != null ? `${Math.round(f.max_hr)} bpm` : null,
    },
    executed_intensity: d.executed_intensity,
    confidence: d.confidence,
    ftp_quality: d.ftp_quality,
    plan,
    training_load: trainingLoad,
    top_flags: (Array.isArray(flags) ? flags : [])
      .slice()
      .sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))
      .slice(0, 3)
      .map((x) => ({ type: x.type, category: x.category, message: x.message, priority: x.priority })),
    cross_workout: cyclingCrossWorkoutDisplay(crossWorkout),
  };
}

export async function generateCyclingAISummaryV1(
  factPacket: CyclingFactPacketV1,
  flags: CyclingFlagV1[],
  coachingContext?: string | null,
  crossWorkout?: { vsSimilar?: any; achievements?: any; npTrend?: any; limiter?: any } | null,
  arcNarrative?: ArcNarrativeContextV1 | null,
): Promise<string | null> {
  const display = toDisplayPacket(factPacket, flags, crossWorkout);
  const packetStr = JSON.stringify(display, null, 2);
  // Temporal Arc frame (post-race recovery / taper / race proximity / plan
  // phase) — consumed the same way running does: fact block in the user
  // message, mode addon on the system prompt. Numbers from it are whitelisted
  // via arcNumericAllowList so Arc-grounded citations aren't rejected.
  const arcFacts = arcNarrative ? arcNarrativeFactBlock(arcNarrative) : '';
  const allowStr = packetStr + arcNumericAllowList(arcNarrative);

  const prompt = `You write workout summaries for experienced athletes. You receive pre-calculated facts and must translate them into coaching prose.
${coachingContext ? `\n${coachingContext}\n` : ''}
RULES:
- MAX 2 sentences. Punchy, not exhaustive. Stop after the second sentence.
- Lead with the SINGLE most notable finding, in this priority order: (1) a power PR set this ride, (2) the vs-similar comparison ("Xw above/below your typical [type] rides"), (3) the NP trend across recent rides, (4) the limiter signal. Pick ONE lede — never a list of findings.
- The second sentence (optional) adds the one piece of supporting context that explains the lede — nothing else.
- Reference the specific numbers from the packet that support the lede.
- Do NOT recap the power-zone / ftp_bins time breakdown, and do NOT explain ACWR or training-load math. The athlete sees those in the rows below — restating them wastes the narrative.
- No filler. Avoid "effective", "overall", "moving forward", "ensure", "solid".
- CRITICAL: Do not introduce any numbers or percentages that are not present verbatim in the packet.
- If there is no planned intent, describe the ride physiologically; do not invent a prescription.
- If plan.week_number is present, anchor it in at most a short clause (e.g. "Week 3, build") — do not spend a sentence on plan position.

PACKET (authoritative; do not compute outside it):
${packetStr}
`;

  // System is constant across attempts (base + Arc mode addon, matching
  // running's systemPrompt construction); the user message varies on retry.
  const systemPrompt =
    'You are a precise endurance coach. Follow the rules exactly.' +
    (arcNarrative ? arcModeSystemAddon(arcNarrative) : '');
  const userBase =
    (arcFacts
      ? 'TEMPORAL ARC CONTEXT (do not contradict; paraphrase for the athlete — these are facts for THIS workout date, not invented load):\n' +
        arcFacts +
        '\n\n'
      : '') + prompt;

  const attempt = async (userMsg: string): Promise<string | null> => {
    const text = await callLLM({
      system: systemPrompt,
      user: userMsg,
      temperature: 0.2,
      maxTokens: 220,
    });
    return text ? normalizeParagraph(text) : null;
  };

  // 2 attempts with numeric-token validation (allow-list includes Arc numbers).
  const s1 = await attempt(userBase);
  if (!s1) return null;
  const v1 = validateNoNewNumbers(s1, allowStr);
  if (v1.ok) return s1;

  const s2 = await attempt(
    userBase +
      `\n\nYour previous output used numbers not present in the packet: ${v1.bad.join(', ')}. Rewrite using ONLY numbers that appear in the packet or the TEMPORAL ARC CONTEXT.`,
  );
  if (!s2) return null;
  // Soft-accept: numeric drift is the ONLY cycling validator (no hard HR /
  // athlete-contradiction / RPE checks like running has). Returning null here
  // discards an otherwise-grounded paragraph and falls back to flag/template
  // text — strictly worse. Running's generateAISummaryV1 returns attempt 2
  // unless a *hard* validator fails; cycling has none, so attempt 2 is accepted.
  return s2;
}

