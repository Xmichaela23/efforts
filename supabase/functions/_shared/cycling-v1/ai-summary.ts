import type { CyclingFactPacketV1, CyclingFlagV1 } from './types.ts';
import { callLLM } from '../llm.ts';
import type { ArcNarrativeContextV1 } from '../arc-narrative-state.ts';
import { arcModeSystemAddon, arcNarrativeFactBlock, arcUnplannedBackwardAnchorAddon } from '../arc-narrative-ai-appendix.ts';

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

/**
 * Lede guard (Issue 2): a cycling summary's first clause must center on a
 * power/fitness signal from THIS ride — NOT Arc/temporal/recovery/taper/load
 * framing — even when the shared arcModeSystemAddon (system prompt) demands a
 * comeback-frame open. Returns true when the opening clause leads with that
 * framing and carries no power token → a violation to correct on retry.
 * Exported for unit testing.
 */
export function ledeOpensWithArcFrame(summary: string): boolean {
  const opener = String(summary || '').split(/[—,.;:]/)[0] || '';
  const arcLead = /\b(days?|weeks?|months?)\s+(out|since|into|after)\b|recovery (from|phase|week)|taper|comeback|re-entry|bridging|consecutive (training )?days|combined load|carrying (high |elevated )?fatigue|sitting (in|at)\b|out from (the )?\w/i;
  const powerTok = /\d\s*W\b|\bNP\b|\bIF\b|\bPR\b|\bFTP\b|watt|above your|below your|\bup\s+\d|\bdown\s+\d|best (of|in)\b/i;
  return arcLead.test(opener) && !powerTok.test(opener);
}

/**
 * Jargon guard (INSIGHTS plain-language brief): the narrative must translate
 * IF / VI / HR-decoupling / EF — never print the label or its number — and
 * must not recap ACWR / TSB / workload-ratio (already a prompt rule; same
 * data-readout class). Returns true when banned jargon is present → a
 * violation to correct on retry. Deterministic backstop because prompt
 * wording alone left ~30 % of rides still emitting "the 1.17 variability
 * index" / "the 0.82 intensity factor". Exported for unit testing.
 * (Abbrev check is case-sensitive so the English word "if" never trips it;
 * "VI"/"EF"/"IF"/"NP"... all-caps as metric labels do.)
 */
export function summaryHasJargon(summary: string): boolean {
  const t = String(summary || '');
  if (/\b(intensity factor|variability index|efficiency factor|decoupling|acute[- ]to[- ]chronic|workload ratio|training stress balance)\b/i.test(t)) {
    return true;
  }
  if (/\b(IF|VI|EF|ACWR|TSB)\b/.test(t)) return true; // case-sensitive: all-caps metric labels
  return false;
}

/**
 * Claim-grounding guard (Step 2 — spine). A qualitative fitness-DIRECTION claim ("declining",
 * "improving", "trending softer", "worth monitoring") must trace to the spine's deterministic
 * verdict, present in the packet as `cross_workout.trend`. When the spine says needs_data
 * (series too sparse OR too stale → no `cross_workout.trend`), ANY trajectory word is
 * ungrounded — the narrative must not assert a direction the data can't support. This is the
 * structural backstop the numeric validators miss (they check that NUMBERS exist, not that
 * CLAIMS are true): it is what keeps the 2026-06-02 VO2 "your power is declining" lie from
 * returning. Terrain/purpose-overloaded words ("climbing day", "building base") are excluded
 * — they aren't trend claims. Exported for unit testing.
 */
export function validateClaimsGrounded(
  summary: string,
  displayPacketStr: string,
): { ok: boolean; bad: string[] } {
  const dirRe = /\b(declin\w+|improv\w+|fad\w+|dropp\w+|slid\w+|trending|worth monitoring|tailing off|falling off|on the rise|losing fitness|gaining fitness)\b/i;
  const m = String(summary || '').match(dirRe);
  if (!m) return { ok: true, bad: [] };
  let hasTrend = false;
  try { hasTrend = JSON.parse(String(displayPacketStr || ''))?.cross_workout?.trend != null; } catch { /* unparseable → treat as ungrounded */ }
  return hasTrend ? { ok: true, bad: [] } : { ok: false, bad: [m[0]] };
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
  vsSimilar?: any; achievements?: any; npTrend?: any; pwr20Trend?: any; spineBikeTrend?: any; limiter?: any; fitness?: any;
} | null | undefined): any | null {
  if (!cw) return null;
  const out: any = {};

  // Fitness (design Build Order #9 — Arc exposure into the per-workout INSIGHTS
  // narrative). CTL/ATL/TSB from fitness_v1 (#7). Numbers land in the packet so
  // validateNoNewNumbers whitelists them; `form` is the standard TrainingPeaks
  // TSB band (conservative thresholds, documented).
  const fit = cw.fitness;
  if (fit && Number.isFinite(Number(fit.ctl)) && Number.isFinite(Number(fit.atl))) {
    const tsb = Number(fit.tsb);
    out.fitness = {
      ctl: Math.round(Number(fit.ctl)),
      atl: Math.round(Number(fit.atl)),
      tsb: Number.isFinite(tsb) ? Math.round(tsb) : null,
      form: !Number.isFinite(tsb) ? null : (tsb >= 5 ? 'fresh' : tsb <= -10 ? 'fatigued' : 'neutral'),
      tss_today: (fit.tss_today != null && Number.isFinite(Number(fit.tss_today)))
        ? Math.round(Number(fit.tss_today))
        : null,
    };
  }

  const vs = cw.vsSimilar;
  if (vs && vs.np_delta_w != null && Number.isFinite(Number(vs.np_delta_w))) {
    out.vs_similar = {
      matched_type: vs.matched_type ?? null,
      sample_size: (vs.sample_size != null && Number.isFinite(Number(vs.sample_size))) ? Number(vs.sample_size) : null,
      np_delta_w: Math.round(Number(vs.np_delta_w)),
      if_delta: (vs.if_delta != null && Number.isFinite(Number(vs.if_delta))) ? Number(Number(vs.if_delta).toFixed(2)) : null,
      // D-073 — HR fields ported from the run-side D-038 vs_similar shape.
      // The POOL INTENSITY CONTEXT prompt rule below anchors HR-delta
      // interpretation against `pool_power_context.intensity_match`.
      hr_delta_bpm: (vs.hr_delta_bpm != null && Number.isFinite(Number(vs.hr_delta_bpm)))
        ? Math.round(Number(vs.hr_delta_bpm))
        : null,
      drift_delta_bpm: (vs.drift_delta_bpm != null && Number.isFinite(Number(vs.drift_delta_bpm)))
        ? Math.round(Number(vs.drift_delta_bpm))
        : null,
      assessment: typeof vs.assessment === 'string' ? vs.assessment : null,
      // D-073 — LLM-facing intensity-match context (analog of run's
      // `pool_pace_context`). Always surfaced when populated so the prompt
      // rule has the enum to key off.
      pool_power_context: (vs as any).pool_power_context ?? null,
    };
  }

  // Trend DIRECTION — from the SPINE verdict (Step 2). The direction is NO LONGER an ad-hoc
  // first-half/second-half delta; it is `computeBikeState` (terrain-matched pwr20, staleness-
  // gated to the athlete's OWN cadence, run server-side in analyze-cycling-workout and passed in
  // as cw.spineBikeTrend). When the spine says needs_data — series too SPARSE (Part A: never the
  // all-type np pool) OR too STALE (e.g. a 27-day-old climbing series is not a current trend) —
  // out.trend stays absent → the narrative asserts no direction (CLAIM GUARD + validateClaimsGrounded).
  // The full bike fitness signal (terrain-binned power + HR@power) lands with Step 3; until then
  // most rides resolve needs_data and the narrative is honestly quieter, not richer.
  const pwr20 = cw.pwr20Trend;
  const sv = cw.spineBikeTrend; // spine TrendResult: { verdict, pctChange, earlyAvg, recentAvg, sampleCount }
  if (
    pwr20 && Array.isArray(pwr20.points) && pwr20.points.length >= 3 &&
    sv && typeof sv.verdict === 'string' && sv.verdict !== 'needs_data'
  ) {
    const delta = (Number.isFinite(Number(sv.recentAvg)) && Number.isFinite(Number(sv.earlyAvg)))
      ? Math.round(Number(sv.recentAvg) - Number(sv.earlyAvg))
      : 0;
    out.trend = {
      metric: '20-min power',
      ride_count: Number.isFinite(Number(sv.sampleCount)) && sv.sampleCount > 0 ? sv.sampleCount : pwr20.points.length,
      ride_type: pwr20.classified_type ?? null,
      direction: sv.verdict === 'improving' ? 'improving' : sv.verdict === 'sliding' ? 'declining' : 'stable',
      delta_w: delta,
    };
  }
  // else: out.trend stays absent → no direction claim (the spine said needs_data).

  // Power PRs — split by attribution so the narrative can't claim a prior-ride
  // best was set today (set_on_current_ride is the only "set this ride" signal;
  // fetchCyclingPRs excludes the current workout). Language is Efforts-scoped:
  // "best in Efforts", never "all-time"/"personal best" (synced rides only).
  const prs = cw.achievements;
  if (prs && prs.durations && typeof prs.durations === 'object') {
    const setThisRide: string[] = [];
    const recordedBests: string[] = [];
    for (const d of ['20min', '5min', '1min']) {
      const e = (prs.durations as any)[d];
      if (!e) continue;
      const cur = Number(e.current_value);
      const at = Number(e?.all_time_pr?.value);
      const rc = Number(e?.recent_pr?.value);
      if (e.set_on_current_ride === true && Number.isFinite(cur) && cur > 0) {
        setThisRide.push(`${d} ${Math.round(cur)}W — new best in Efforts, set THIS ride`);
      } else if (Number.isFinite(at) && at > 0) {
        recordedBests.push(`${d} ${Math.round(at)}W — best in Efforts (set on a PRIOR ride, not today)`);
      } else if (Number.isFinite(rc) && rc > 0) {
        recordedBests.push(`${d} ${Math.round(rc)}W — best in Efforts, last 90 days (PRIOR ride, not today)`);
      }
    }
    if (setThisRide.length > 0) out.power_prs_set_this_ride = setThisRide;
    if (recordedBests.length > 0) out.power_bests_in_efforts = recordedBests;
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

/**
 * D-NNN variance-gate options. When isMixedEffort is true, the LLM input drops
 * the steady-effort cross_workout.vs_similar/trend comparison and surfaces a
 * cycling interval summary (NP/IF/VI per-interval if available, plus structure
 * notes) so the narrative interprets the structured work rather than comparing
 * whole-ride averages to endurance history.
 */
export type CyclingVarianceGateOptions = {
  isMixedEffort: boolean;
  intervalBreakdown: { intervals?: any[]; available?: boolean } | null;
};

/**
 * D-035: cycling unplanned gate. When true, the LLM input is annotated so the
 * UNPLANNED MODE prompt rule fires. Unlike running, cross_workout (NP-vs-typical)
 * IS kept for unplanned rides — same-classified-type comparisons are legitimate
 * history, not prescription. Per user direction 2026-05-23.
 */
export type CyclingUnplannedGateOptions = {
  isUnplanned: boolean;
};

function buildCyclingIntervalSummary(
  ib: { intervals?: any[]; available?: boolean } | null | undefined,
  fp: CyclingFactPacketV1,
): any | null {
  const ivs = Array.isArray(ib?.intervals) ? ib!.intervals! : [];
  if (ivs.length < 2) return null;
  const work = ivs.filter((iv: any) => String(iv?.interval_type || iv?.kind || '').toLowerCase() === 'work');
  const recovery = ivs.filter((iv: any) => String(iv?.interval_type || iv?.kind || '').toLowerCase() === 'recovery');
  if (work.length < 2) return null;
  const fmtDur = (v: any) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    const m = Math.floor(n / 60);
    const s = Math.round(n % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  // D-092: surface enough per-interval data for the LLM to judge target-range
  // adherence on STRUCTURED PLANNED MODE. Pre-fix the summary exposed only
  // duration + HR (avg_power_w was a phantom key — cycling intervals carry
  // `actual_power_w` / `avg_power_watts` per D-089, not `avg_power_w`), and
  // there was no planned_power_range at all. The LLM could cite "Two 15-min
  // efforts held steady HR" but had no signal for whether wattage hit the
  // target. The new fields are sport-neutral aliases; the cycling field names
  // (actual_power_w, planned_power_range_lower/upper, power_adherence_percent)
  // are read first.
  const readPowerW = (iv: any): number | null => {
    const v = iv?.actual_power_w ?? iv?.avg_power_watts ?? iv?.avg_power_w;
    return v != null && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null;
  };
  const readPowerRange = (iv: any): { lower_w: number; upper_w: number } | null => {
    const l = iv?.planned_power_range_lower ?? iv?.planned?.power_range?.lower;
    const u = iv?.planned_power_range_upper ?? iv?.planned?.power_range?.upper;
    const ln = Number(l), un = Number(u);
    if (!Number.isFinite(ln) || !Number.isFinite(un) || ln <= 0 || un <= 0) return null;
    return { lower_w: Math.round(ln), upper_w: Math.round(un) };
  };
  // D-093: clean_execution signal — true when every work interval landed
  // within 95% adherence of its prescribed power band. Lets the prompt's
  // 4-sentence cap know when to fire (a clean ride has no execution drama
  // to describe, so verbose multi-interval breakdowns become padding).
  const cleanExecution = work.length > 0 && work.every((iv: any) => {
    const adh = Number(iv?.power_adherence_percent);
    return Number.isFinite(adh) && adh >= 95;
  });
  return {
    structure: 'planned',
    completed_steps: work.filter((iv: any) => Number(iv?.actual_duration_s ?? 0) > 0).length,
    total_steps: work.length,
    clean_execution: cleanExecution,
    work_intervals: work.slice(0, 12).map((iv: any) => {
      const actual = readPowerW(iv);
      const range = readPowerRange(iv);
      // Target-hit signal: D-089 stores power_adherence_percent (100 when in range,
      // degraded as deviation grows). 95 % is the threshold used by the cycling
      // analyzer's flag generator and the analysis_details narrative bands.
      const adh = iv?.power_adherence_percent;
      const inRange = (range != null && actual != null)
        ? (actual >= range.lower_w && actual <= range.upper_w)
        : null;
      return {
        n: iv?.interval_number ?? null,
        planned_label: typeof iv?.planned_label === 'string' && iv.planned_label.trim() ? iv.planned_label : null,
        planned_power_range_w: range,
        avg_power_w: actual,
        np_w: iv?.np_w != null ? Math.round(Number(iv.np_w)) : null,
        actual_dur: fmtDur(iv?.actual_duration_s),
        hr_avg: iv?.avg_heart_rate_bpm ?? null,
        power_adherence_pct: (typeof adh === 'number' && Number.isFinite(adh)) ? Math.round(adh) : null,
        in_target_range: inRange,
      };
    }),
    recovery_intervals: recovery.slice(0, 12).map((iv: any) => ({
      n: iv?.recovery_number ?? iv?.interval_number ?? null,
      avg_power_w: readPowerW(iv),
      actual_dur: fmtDur(iv?.actual_duration_s),
      hr_avg: iv?.avg_heart_rate_bpm ?? null,
    })),
    ride_vi: fp.facts?.variability_index ?? null,
    ride_if: fp.facts?.intensity_factor ?? null,
  };
}

function toDisplayPacket(
  fp: CyclingFactPacketV1,
  flags: CyclingFlagV1[],
  crossWorkout?: { vsSimilar?: any; achievements?: any; npTrend?: any; pwr20Trend?: any; spineBikeTrend?: any; limiter?: any; fitness?: any } | null,
  varianceGate?: CyclingVarianceGateOptions | null,
  unplannedGate?: CyclingUnplannedGateOptions | null,
): any {
  const isUnplanned = unplannedGate?.isUnplanned === true;
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
    // D-035: surface is_unplanned so the cycling LLM prompt's UNPLANNED MODE
    // rule can fire. Unlike running, cross_workout (NP-vs-typical) stays
    // populated for unplanned rides — same-classified-type history is honest
    // signal, not prescription. Per user direction 2026-05-23.
    is_unplanned: isUnplanned,
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
    // D-NNN: drop the steady-effort cross_workout block when this ride is
    // mixed-effort. Whole-ride NP-delta vs endurance history misleads on a
    // sweet-spot session; interval_summary below replaces it.
    cross_workout: varianceGate?.isMixedEffort ? null : cyclingCrossWorkoutDisplay(crossWorkout),
    // D-NNN: per-interval read for mixed-effort rides. Lets the LLM interpret
    // structured work rather than comparing to endurance baselines.
    interval_summary: varianceGate?.isMixedEffort
      ? buildCyclingIntervalSummary(varianceGate.intervalBreakdown, fp)
      : null,
  };
}

export async function generateCyclingAISummaryV1(
  factPacket: CyclingFactPacketV1,
  flags: CyclingFlagV1[],
  coachingContext?: string | null,
  crossWorkout?: { vsSimilar?: any; achievements?: any; npTrend?: any; pwr20Trend?: any; spineBikeTrend?: any; limiter?: any; fitness?: any } | null,
  arcNarrative?: ArcNarrativeContextV1 | null,
  varianceGate?: CyclingVarianceGateOptions | null,
  unplannedGate?: CyclingUnplannedGateOptions | null,
  // D-082: optional diagnostics sink. Populated in-place with per-attempt LLM
  // outcomes so the caller (analyze-cycling-workout) can persist them for
  // out-of-band investigation when ai_summary mysteriously returns null.
  debug?: Record<string, unknown>,
): Promise<string | null> {
  const display = toDisplayPacket(factPacket, flags, crossWorkout, varianceGate ?? null, unplannedGate ?? null);
  const packetStr = JSON.stringify(display, null, 2);
  // D-083: `isUnplanned` is defined inside toDisplayPacket's scope, NOT here.
  // The systemPrompt construction below (line ~426) references it for the
  // D-046 backward-anchor addon — that was a ReferenceError on every cycling
  // call since D-046 shipped (2026-05-25), silently caught by the analyzer's
  // try/catch and producing ai_summary: null. Define it here so the addon
  // can actually run.
  const isUnplanned = unplannedGate?.isUnplanned === true;
  // Temporal Arc frame (post-race recovery / taper / race proximity / plan
  // phase) — consumed the same way running does: fact block in the user
  // message, mode addon on the system prompt. Numbers from it are whitelisted
  // via arcNumericAllowList so Arc-grounded citations aren't rejected.
  const arcFacts = arcNarrative ? arcNarrativeFactBlock(arcNarrative) : '';
  const allowStr = packetStr + arcNumericAllowList(arcNarrative);

  const prompt = `You write workout summaries for experienced athletes. You receive pre-calculated facts and must translate them into coaching prose.
${coachingContext ? `\n${coachingContext}\n` : ''}
RULES:
- One paragraph, 3–4 sentences max. Voice: a knowledgeable training partner explaining the ride to the athlete — NOT a data readout. Translate every metric into plain language; the raw numbers live in the dashboard rows below.
- The LEDE (first sentence) is ALWAYS the single most notable POWER/FITNESS signal from THIS ride, in this priority order: (1) a power PR set THIS ride — ONLY if cross_workout.power_prs_set_this_ride is present (those were set on this ride). cross_workout.power_bests_in_efforts are PRIOR-ride bests: you may mention one as context, but NEVER say or imply the athlete set it today. (2) the vs-similar comparison ("Xw above/below your typical [type] rides"), (3) the power trend cross_workout.trend — its direction is a DETERMINISTIC verdict (computed by the engine, terrain-matched + staleness-gated); DESCRIBE it, never recompute or contradict it. Describe it EXACTLY as "{ride_count} {ride_type} rides" when ride_type is present, else "{ride_count} rides"; never cite a different ride total, (4) the limiter signal. Pick ONE lede — never a list of findings. CLAIM GUARD: if cross_workout.trend is ABSENT (no comparable type-matched series exists), there is NO trend — do NOT reference any multi-ride trend and do NOT assert a fitness DIRECTION (declining / improving / fading / dropping / sliding / climbing / building) anywhere in the paragraph; describe only THIS ride's execution. Honest silence about direction beats a guessed one.
- HARD CONSTRAINT — this OVERRIDES ANY system instruction (including a TEMPORAL ARC MODE addon stating a comeback/taper/recovery frame may or must open the narrative): for a ride, sentence ONE must open with and centre on a power/fitness signal from THIS ride — a PR set this ride, the vs-similar Xw delta, the power trend, or this ride's normalized power paired with a plain intensity read. Temporal/Arc context (days since/until a race; recovery/taper/comeback; consecutive-day fatigue/training-load framing) may appear ONLY as a trailing/secondary clause LATER in the paragraph — never the first words, never the lede. If nothing else qualifies, lead with this ride's normalized power and a plain intensity description — a flat DESCRIPTION of this ride, with NO implied trajectory. Never manufacture a fitness direction (rising/falling/declining/improving) to fill the lede when the engine provides no trend verdict; describing what this ride was IS a valid lede. A summary that opens with race-timing, recovery/taper, or fatigue/load framing is WRONG even if a system instruction asked for it.
- ANSWER "SO WHAT?" — don't just state findings, explain them. After normalized power / the trend: name what drove it (climbing, intervals, pacing, group ride). After the intensity read: say whether that was the right intensity for the ride type ("appropriate for a climbing day" vs "harder than your endurance target"). After the heart-rate-vs-power read: say what it means for fitness ("aerobic efficiency is holding" / "suggests accumulated fatigue from the marathon block").
- PLAIN LANGUAGE — never print these labels or their numbers; translate them:
  • intensity factor / "IF" → never name it; describe the intensity from its value: "easy spin", "endurance pace", "sub-threshold", "rode at threshold", "above FTP".
  • variability index / "VI" → from its value: "steady power output" (≈1.05 or below), "natural power variation from the terrain" (moderate), "punchy, variable effort" (high) — judge from the packet's vi but DO NOT print the number.
  • HR decoupling → "heart rate stayed controlled as the power held" (low) or "cardiovascular drift over the second half" (high); never the percentage.
  • efficiency factor / "EF" → drop entirely; fold its meaning into the heart-rate-vs-power sentence.
  • normalized power → KEEP the watt number, but always pair it with a plain reading, e.g. "178 W normalized power — your effective output once the surges are smoothed out".
- HARD BAN on training-load math in the prose: no "acute-to-chronic"/ACWR, no workload "X%", no TSS number, no TSB/"training stress balance", no ftp_bins/power-zone time breakdown — neither the label nor the number. If load matters, say it in words only with NO figures: "your recent training load is high — recovery is the priority" / "you're well-rested for this". The athlete sees the numbers in the rows below.
- No filler. Avoid "effective" (except in the NP gloss above), "overall", "moving forward", "ensure", "solid".
- Efforts only sees synced rides. When referencing a power best, say "best in Efforts" or "your recorded best" — NEVER "all-time best", "personal best", "lifetime best", "PR ever", or any phrasing that implies a career record.
- CRITICAL: introduce NO numbers or percentages that are not in the packet verbatim. Translating IF/VI/decoupling/EF into words instead of numbers SATISFIES this — only normalized power, watts, and other packet figures should appear as numerals.
- If there is no planned intent, describe the ride physiologically; do not invent a prescription.
- If plan.week_number is present, anchor it in at most a short clause (e.g. "Week 3, build") — do not spend a sentence on plan position.
- STRUCTURED PLANNED MODE (D-092) — fires when interval_summary is non-null AND plan_intent ∈ {sweet_spot, threshold, vo2, tempo, anaerobic, neuromuscular, race_prep}: this OVERRIDES the LEDE rule and the HARD CONSTRAINT above. The athlete chose a structured target session; the lede MUST be interval EXECUTION, not whole-ride NP/trend/PR/vs-similar. Required lede content:
  • Target-range adherence: did the work intervals hit interval_summary.work_intervals[i].planned_power_range_w? Use in_target_range (true/false per interval) and power_adherence_pct (100 = bullseye, <90 = drift). Say it plainly: "held the 150-167 W target across both 15-min blocks" / "drifted under target on the second rep — 142 W vs 150-167 W band".
  • Completion: cite interval_summary.completed_steps / total_steps when not equal ("completed 3 of 4 work blocks"), or omit when full completion.
  • HR response across the set: compare interval_summary.work_intervals[0].hr_avg → ...[last].hr_avg. Was HR steady (cardiovascular control) or did it drift up (fatigue/effort cost)?
  Whole-ride NP is ONE clause of physiological context AFTER the execution lede — never the opening signal. Recoveries are background, not lede. Do NOT lead with the trend, the vs-similar delta, or PR signals on a planned structured session — the athlete didn't ride for those, they rode for the target.
  CLEAN-EXECUTION CAP (D-093) — when interval_summary.clean_execution is true (every work interval ≥ 95% power_adherence_pct), output EXACTLY 4 sentences, no more, in this order:
    S1 — LEDE: target-range adherence + per-rep wattage when ≤3 reps + opening HR. ("You held the 150-167 W sweet-spot target across both 15-min blocks at 166 W and 162 W, with HR steady at 154 bpm.")
    S2 — ONE physiological observation: HR-vs-power efficiency, decoupling read, or whether intensity matched the prescribed zone. Pick ONE; do not list.
    S3 — ONE fatigue/load context sentence (consecutive days, weekly load in plain words). Skip entirely if no notable load signal.
    S4 — ONE forward-looking sentence (race countdown framing OR recovery cue). ONE.
    HARD CUTS for clean execution: no "this kind of work is exactly what …" filler; no "monitor how you feel" generic advice; no second HR mention; no second fatigue mention; no per-interval recovery commentary; no closing exhortation. If S3 has no load signal worth saying, skip it and write 3 sentences total — fewer is better than padding. Brevity > completeness on a clean ride; the dashboard rows below carry the rest.
- MIXED-EFFORT MODE (when packet has interval_summary and cross_workout is null): this ride was structured/variable — DO NOT compare whole-ride NP/IF to your endurance baseline. Interpret the per-interval work: which work intervals held the target wattage, whether the work tightened or faded across the set, recovery quality. Lead with the ride's intent (sweet-spot, threshold, VO2) paired with NP and a plain intensity read; cite specific work intervals from interval_summary.work_intervals. Recoveries are context, not the lede. (If STRUCTURED PLANNED MODE also fires, that rule's lede requirement wins.)
- UNPLANNED MODE (when packet has is_unplanned: true): this ride had no linked plan. There was no prescribed power target. DO NOT scold the athlete for "missing a target" — there was no target. Do NOT invent a prescription from classified_type alone; classified_type is a descriptive label (the analyzer's read of what kind of ride this looked like), not a target the athlete chose. INTERPRET on the ride's own terms: lead with NP and a plain intensity read for the actual output, then explain what drove it (terrain via VAM / ascent, group dynamics suggested by VI, conditions). When cross_workout.vs_similar has sample_size ≥ 3 and a meaningful np_delta_w, that comparison IS legitimate (history, not prescription) — you may lead with it. The athlete just rode; describe what they did, don't grade what they "should" have done.
- HARD BAN (D-076) — route / course / GPX language: DO NOT describe this ride as having an "unplanned route" or reference route planning in any form. The packet carries NO route, course, or GPX data — introducing route-planning concepts (planned route / unplanned route / route choice / mapped route / off-route / etc.) is fabrication. Describe terrain through the data that IS in the packet: VAM, total ascent, climbing signals, and the existing "climbing day" / "rolling day" / "flat day" terrain-class vocabulary. Never frame the ride as "the athlete didn't plan the route" — Efforts has no signal for that, and conflating is_unplanned (= no linked plan workout) with route planning is wrong on both counts.
- POOL INTENSITY CONTEXT (D-073 mirror of D-038 run rule) — when cross_workout.vs_similar is present AND vs_similar.pool_power_context is populated, anchor any HR-delta interpretation against pool_power_context.intensity_match:
  • "current_much_harder": the comparison pool was significantly easier than this ride. HR running higher than the pool is structurally expected and reflects intensity, not fitness change. Say so plainly (e.g. "your recent similar rides were easier IF, so the higher HR today tracks with the harder effort"). Do NOT frame the HR delta as fatigue, post-race recovery, aerobic decline, cardiovascular elevation, or any longitudinal signal. Do NOT print or quote pool_power_context.delta_pct or delta_if — use the words.
  • "current_much_easier": pool was significantly harder than this ride. HR running lower than the pool is structurally expected — easier effort. Do NOT frame this as a fitness improvement signal in isolation.
  • "matched": pool intensity comparable to current ride. HR delta is a legitimate cross-session comparison; interpret normally (use drift signals, arc context, etc.).
- This rule takes PRIORITY over generic vs_similar HR interpretation. It composes with UNPLANNED MODE and MIXED-EFFORT MODE — if any apply, all apply.

PACKET (authoritative; do not compute outside it):
${packetStr}
`;

  // System is constant across attempts (base + Arc mode addon, matching
  // running's systemPrompt construction); the user message varies on retry.
  const systemPrompt =
    'You are a precise endurance coach. Follow the rules exactly.' +
    (arcNarrative ? arcModeSystemAddon(arcNarrative) : '') +
    // D-046 / Q-026 — unplanned backward-anchor suppression. Empty when the
    // ride is planned or when arc mode is recovery_read / race_debrief.
    arcUnplannedBackwardAnchorAddon(arcNarrative, isUnplanned);
  const userBase =
    (arcFacts
      ? 'TEMPORAL ARC CONTEXT (SECONDARY framing — supporting context for the second sentence only, NEVER the lede or opening words; do not contradict; paraphrase — these are facts for THIS workout date, not invented load):\n' +
        arcFacts +
        '\n\n'
      : '') + prompt;

  // D-082: per-attempt LLM call diagnostics. Each attempt gets its own bucket
  // so a non-null s1 still records what came back, and a null s1 records why.
  const attemptDebug: Array<Record<string, unknown>> = [];
  const attempt = async (userMsg: string): Promise<string | null> => {
    const llmDebug: Record<string, unknown> = {};
    const text = await callLLM({
      system: systemPrompt,
      user: userMsg,
      temperature: 0.2,
      maxTokens: 220,
      debug: debug ? llmDebug : undefined,
    });
    if (debug) {
      attemptDebug.push({
        ...llmDebug,
        normalized_chars: text ? normalizeParagraph(text).length : 0,
      });
    }
    return text ? normalizeParagraph(text) : null;
  };

  // 2 attempts. Validators (deterministic backstops for prompt rules the LLM
  // doesn't reliably follow): numeric-token drift; the lede guard (sentence
  // one opens on a power/fitness signal, not Arc framing — the shared
  // arcModeSystemAddon pushes the other way); the jargon guard (plain-language
  // brief — no IF/VI/EF/decoupling/ACWR/TSB labels-or-numbers). All failing
  // corrections fold into the single retry.
  const s1 = await attempt(userBase);
  if (!s1) {
    if (debug) debug.attempts = attemptDebug;
    if (debug) debug.outcome = 'attempt_1_null';
    return null;
  }
  const v1 = validateNoNewNumbers(s1, allowStr);
  const lede1 = ledeOpensWithArcFrame(s1);
  const jargon1 = summaryHasJargon(s1);
  const claims1 = validateClaimsGrounded(s1, packetStr); // Step 2: direction claims must trace to the spine verdict
  if (debug) {
    debug.attempt_1_validator = { ok: v1.ok, bad_numbers: v1.bad ?? null, lede_arc: lede1, jargon: jargon1, ungrounded_claims: claims1.bad ?? null };
  }
  if (v1.ok && !lede1 && !jargon1 && claims1.ok) {
    if (debug) {
      debug.attempts = attemptDebug;
      debug.outcome = 'attempt_1_accepted';
    }
    return s1;
  }

  const corrections: string[] = [];
  if (!v1.ok) {
    corrections.push(
      `used numbers not present in the packet (${v1.bad.join(', ')}); rewrite using ONLY numbers that appear in the packet or the TEMPORAL ARC CONTEXT`,
    );
  }
  if (lede1) {
    corrections.push(
      "opened with race-timing / recovery / taper / fatigue framing; the FIRST words of sentence one MUST be a power/fitness signal from THIS ride (a PR, the vs-similar Xw delta, the power trend, or this ride's normalized power + a plain intensity read) — move any Arc/temporal context to a trailing clause later in the paragraph",
    );
  }
  if (jargon1) {
    corrections.push(
      'printed banned jargon. DELETE every occurrence — and its number, including parenthetical asides like "(1.40 VI)" — of: intensity factor/IF, variability index/VI, HR decoupling, efficiency factor/EF, acute-to-chronic/ACWR, workload "X%", TSS, TSB/training stress balance. Replace each with its plain meaning in words only (intensity → "rode at threshold" etc.; VI → power character; decoupling/EF → the HR-vs-power read; load/ACWR/TSB → "recent load is high, recovery matters" with NO figure). The ONLY numerals allowed are normalized power watts and other packet figures',
    );
  }
  if (!claims1.ok) {
    corrections.push(
      `asserted a fitness DIRECTION ("${claims1.bad.join(', ')}") with no computed trend to support it — cross_workout.trend is ABSENT (the engine's deterministic verdict is needs_data: the series is too sparse or too old to be a current trend). DELETE every trajectory claim; describe ONLY this ride's execution and intensity, with no implication that fitness is rising or falling`,
    );
  }
  const s2 = await attempt(
    userBase + `\n\nYour previous output ${corrections.join('; AND it ')}. Keep it to 3–4 sentences, plain language (no IF/VI/EF/decoupling jargon).`,
  );
  if (!s2) {
    if (debug) {
      debug.attempts = attemptDebug;
      debug.outcome = 'attempt_2_null';
    }
    return null;
  }
  if (debug) {
    debug.attempts = attemptDebug;
    debug.outcome = 'attempt_2_accepted';
  }
  // Soft-accept: cycling's validators (numeric drift + lede guard) are
  // retry-corrected then accepted — neither is a hard reject. Returning null
  // here discards an otherwise-grounded paragraph and falls back to flag/
  // template text — strictly worse. Running's generateAISummaryV1 returns
  // attempt 2 unless a *hard* validator fails; cycling has none, so attempt
  // 2 is accepted (the retry instruction fixes the stubborn lede in practice).
  return s2;
}

