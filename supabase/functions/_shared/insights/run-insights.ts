// DETERMINISTIC RUN INSIGHTS COMPOSER (2026-07-19) — replaces the LLM ai_summary for runs.
//
// WHY: the "insight" was never the LLM's — it's the engine's VERDICT (pacing pattern, decoupling,
// terrain-vs-fatigue, execution). The LLM only phrased it, and drifted ("pace held steady"). This
// composes the SAME verdicts into language, deterministically. No model, no wild card, no guard needed.
//
// CONTINUITY (single source): this reads verdicts the engine already computed — it does NOT recompute
// pacing/decoupling/terrain. The PACING/TERRAIN rows, this paragraph, and the State durability read all
// consume the same numbers, so they can never disagree. Pure function → callable from session-detail
// (Performance) AND State. One composer, every surface renders its output.
//
// VOICE (the app's copy law, enforced structurally): fact first, meaning second; a quant who trains,
// not a coach who encourages; conditional consequences, mechanisms named; no imperatives; no banned
// words; SILENCE IS LEGAL — where there is no real read, we say less, never pad.

export type RunType = 'steady' | 'easy' | 'long' | 'interval' | 'tempo' | 'hills' | 'track' | 'vo2' | 'threshold' | 'fartlek' | 'surge' | 'race' | 'other';

// Three families, because the honest read differs by structure:
//  - STEADY (steady/easy/long): the aerobic story — pacing-as-effort, decoupling, terrain.
//  - REPS (interval/tempo/hills/track/vo2/threshold): the work story — reps hit, consistency, climbs.
//  - FARTLEK (fartlek/surge): mixed BY DESIGN — never graded for steadiness (that would call the plan a fade).
type Family = 'steady' | 'reps' | 'fartlek';
function familyOf(t: RunType): Family {
  if (t === 'steady' || t === 'easy' || t === 'long') return 'steady';
  if (t === 'fartlek' || t === 'surge') return 'fartlek';
  return 'reps'; // interval/tempo/hills/track/vo2/threshold/race/other-with-structure
}
export type DecouplingAssessment = 'excellent' | 'good' | 'moderate' | 'high' | null;
export type PacingPattern = 'even_effort' | 'even_pace' | 'positive_split' | 'negative_split' | null;

export interface RunInsightInput {
  type: RunType;
  intent?: 'maintenance' | 'build' | 'recovery' | null; // declared plan intent for the block
  distanceMi?: number | null;
  durationMin?: number | null;
  /** Pacing verdict — SAME source as the PACING row (session-detail build). hrHeld = decoupling low. */
  pacing?: {
    pattern: PacingPattern;
    hrHeld: boolean;
    outAndBack?: boolean | null; // net-symmetric elevation — pace tracked the hills both ways
  } | null;
  /** Aerobic durability — SAME decoupling the State durability row uses. */
  decoupling?: { pct: number | null; assessment: DecouplingAssessment } | null;
  terrain?: { gainFt?: number | null; rolling?: boolean } | null;
  conditions?: { tempF?: number | null; heatStress?: 'mild' | 'moderate' | 'high' | null } | null;
  execution?: { rpe?: number | null; hitIntent?: boolean | null } | null;
  intervals?: { hit?: number | null; total?: number | null; consistent?: boolean | null } | null;
  /** Optional longitudinal read (the "4-week" pattern users prize). */
  trend?: { efficiencyDirection?: 'improving' | 'holding' | 'sliding' | null } | null;
}

// ── SHARED PACING VERDICT (single source) — the session-detail PACING row AND this composer both call
//    this, so the paragraph and the row can never disagree. Extracted from build.ts (2026-07-19). ────────
export interface PacingVerdict {
  pattern: Exclude<PacingPattern, null>;
  hrHeld: boolean;          // decoupling ≤5% (Friel) — HR held, so a pace swing is terrain, not a fade
  absDiffSec: number;       // half-vs-half magnitude (s/mi)
  fastestMile: number | null;
  fastestPaceSec: number | null;
  hasGap: boolean;
}
export function pacingVerdict(splitsMi: any[] | null | undefined, decouplingPct: number | null | undefined, gapAdjusted: boolean): PacingVerdict | null {
  const raw = (Array.isArray(splitsMi) ? splitsMi : []).map((s: any) => {
    const pk = Number(s?.avgPace_s_per_km), gk = Number(s?.avgGapPace_s_per_km);
    return { mile: Number(s?.n), pace: Number.isFinite(pk) && pk > 0 ? pk * 1.60934 : NaN, gap: Number.isFinite(gk) && gk > 0 ? gk * 1.60934 : NaN };
  }).filter((s) => Number.isFinite(s.mile) && s.mile > 0 && Number.isFinite(s.pace) && s.pace > 0);
  if (raw.length < 2) return null;
  const hasGap = gapAdjusted && raw.every((s) => Number.isFinite(s.gap) && s.gap > 0);
  const series = hasGap ? raw.map((s) => ({ mile: s.mile, pace: s.gap })) : raw.map((s) => ({ mile: s.mile, pace: s.pace }));
  const mid = Math.ceil(series.length / 2);
  const avg = (a: typeof series) => a.reduce((x, y) => x + y.pace, 0) / a.length;
  const diff = avg(series.slice(0, mid)) - avg(series.slice(mid)); // + = 2nd half faster
  const absDiffSec = Math.abs(Math.round(diff));
  const hrHeld = decouplingPct != null && Number(decouplingPct) <= 5;
  const pattern: PacingVerdict['pattern'] =
    (absDiffSec <= 15 || (hrHeld && diff < 0)) ? (hasGap ? 'even_effort' : 'even_pace')
    : diff > 0 ? 'negative_split'
    : 'positive_split';
  const fastest = raw.reduce((a, b) => a.pace < b.pace ? a : b);
  return { pattern, hrHeld, absDiffSec, fastestMile: fastest.mile, fastestPaceSec: Math.round(fastest.pace), hasGap };
}

// ── banned-word hard check (mirrors week-accent): if a fortune-cookie word slips in, the line is dead. ──
const BANNED = /\b(crush\w*|nailed|smash\w*|amazing|great job|awesome|keep it up|stay consistent|well done|body is ready|on track|proud|beast|killer)\b|!/i;
function clean(sentences: (string | null | undefined)[]): string | null {
  const kept = sentences
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .filter((s) => !BANNED.test(s));
  return kept.length ? kept.join(' ') : null;
}

const round = (n: number) => Math.round(n);
const pace = (secPerMi: number) => `${Math.floor(secPerMi / 60)}:${String(round(secPerMi % 60)).padStart(2, '0')}/mi`;

// ── the composer — verdict-per-clause, type-aware, silent when thin ──────────────────────────────────
export function composeRunInsight(inp: RunInsightInput): string | null {
  if (!inp) return null;
  const parts: (string | null)[] = [];

  const hrHeld = inp.pacing?.hrHeld === true;
  const dcp = inp.decoupling?.pct;
  const dcpTxt = typeof dcp === 'number' ? `${Math.round(dcp * 10) / 10}%` : null;
  const rolling = inp.terrain?.rolling === true || (inp.terrain?.gainFt ?? 0) >= 150;
  const gain = inp.terrain?.gainFt;
  const heat = inp.conditions?.heatStress;
  const tempF = inp.conditions?.tempF;
  const rpe = inp.execution?.rpe;
  const maintenance = inp.intent === 'maintenance';
  const family = familyOf(inp.type);

  // ── STEADY / EASY / LONG — the aerobic story: pacing pattern → effort-vs-terrain → conditions → intent ──
  if (family === 'steady') {
    // 1. PACING as EFFORT (the non-obvious read: pace swing = terrain, not fatigue — proven by held HR).
    if (inp.pacing?.pattern === 'even_effort' && hrHeld) {
      const shape = inp.pacing.outAndBack
        ? rolling ? 'Even effort across a rolling out-and-back — you climbed out and ran the back half faster coming down.'
                  : 'Even effort out and back.'
        : rolling ? 'Even effort across rolling terrain — the pace moved with the hills.'
                  : 'Even effort throughout.';
      parts.push(shape);
      // The "swing was terrain, not fatigue" read only holds when there WAS terrain to swing the pace.
      // On a flat course there's no swing to explain — say the true thing (HR held, effort steady) instead.
      if (rolling) parts.push(dcpTxt ? `Heart rate held (drift ${dcpTxt}), so the pace swing was the terrain, not fatigue.` : 'Heart rate held, so the pace swing was the terrain, not fatigue.');
      else parts.push(dcpTxt ? `Heart rate held the whole way (drift ${dcpTxt}) — a steady aerobic effort.` : 'Heart rate held the whole way — a steady aerobic effort.');
    } else if (inp.pacing?.pattern === 'negative_split') {
      parts.push('You ran the back half faster — a negative split.');
      if (hrHeld && dcpTxt) parts.push(`Heart rate held (drift ${dcpTxt}); controlled, not a surge you paid for.`);
    } else if (inp.pacing?.pattern === 'positive_split' && !hrHeld) {
      // a REAL fade — HR drifted up as pace fell. Named honestly (the honesty guard's job, here in prose).
      parts.push('The second half slowed as your heart rate climbed — the effort drifted up, a positive split.');
    } else if (hrHeld && dcpTxt) {
      parts.push(`Heart rate held across the run (drift ${dcpTxt}) — the aerobic system carried it.`);
    }

    // 2. CONDITIONS as load (only when material — otherwise silent).
    if (heat && typeof tempF === 'number') {
      const gainClause = typeof gain === 'number' && gain >= 150 ? ` and ${round(gain)} ft of climbing` : '';
      parts.push(`Warm at ${round(tempF)}°F${gainClause} — ${heat === 'mild' ? 'both add a little load' : 'that adds real load'}, and you carried it${typeof rpe === 'number' ? ` at RPE ${rpe}` : ''}.`);
    } else if (typeof gain === 'number' && gain >= 250) {
      parts.push(`${round(gain)} ft of climbing added the load${typeof rpe === 'number' ? `, carried at RPE ${rpe}` : ''}.`);
    }

    // 3. INTENT — what this run was FOR (only when the plan declared one).
    if (maintenance) parts.push(`${inp.type === 'long' ? 'A long' : 'An'} aerobic ${maintenance ? 'maintenance' : ''} run, executed as easy as intended.`.replace('  ', ' '));

    return clean(parts);
  }

  // ── REPS — interval / tempo / hills / track / vo2 / threshold: the WORK story ──────────────────────
  if (family === 'reps') {
    const hit = inp.intervals?.hit, total = inp.intervals?.total;
    const isHills = inp.type === 'hills';
    if (typeof hit === 'number' && typeof total === 'number' && total > 0) {
      const repWord = isHills ? 'hill rep' : 'work interval';
      parts.push(hit === total ? `You hit all ${total} ${repWord}${total === 1 ? '' : 's'}.` : `You hit ${hit} of ${total} ${repWord}s.`);
      if (inp.intervals?.consistent === true) parts.push(isHills ? 'The climb pace held across the set — even execution.' : 'The reps held their pace — even execution across the set.');
      else if (inp.intervals?.consistent === false) parts.push(isHills ? 'The climbs came in slower as the set went on — the reps drifted.' : 'The reps drifted across the set — the later ones came in slower.');
    } else if (isHills && typeof gain === 'number' && gain >= 150) {
      parts.push(`A hill session — ${round(gain)} ft of climbing.`);
    }
    // tempo is a sustained-threshold effort, so an HR-held read is meaningful here (unlike short reps).
    if (inp.type === 'tempo' && hrHeld && dcpTxt) parts.push(`Heart rate stayed controlled for the effort (drift ${dcpTxt}).`);
    return clean(parts);
  }

  // ── FARTLEK — mixed BY DESIGN. Describe, never grade steadiness (the variability IS the plan). No ──
  //    decoupling/even-effort claim — a fartlek's HR is supposed to move, and calling that a fade is the lie.
  if (family === 'fartlek') {
    parts.push('A fartlek — the pace and effort swung by design, not a pacing miss.');
    if (typeof inp.durationMin === 'number' && typeof inp.distanceMi === 'number' && inp.distanceMi > 0)
      parts.push(`${inp.distanceMi} mi over ${round(inp.durationMin)} min of mixed surges and easy running.`);
    return clean(parts);
  }

  return clean(parts); // unreachable — every type maps to a family; silence over padding.
}

// ── MAPPER: fact_packet_v1 → composer input. Reads the SAME packet the PACING/TERRAIN rows read, so the
//    paragraph and the rows stay one story. Defensive: a missing field just drops its clause (silence). ──
function toRunType(wt: string | null | undefined): RunType {
  const t = String(wt || '').toLowerCase();
  if (t.includes('fartlek')) return 'fartlek';
  if (t.includes('surge') || t.includes('stride')) return 'surge';
  if (t.includes('hill')) return 'hills';
  if (t.includes('interval') || t.includes('rep')) return 'interval';
  if (t.includes('tempo')) return 'tempo';
  if (t.includes('threshold')) return 'threshold';
  if (t.includes('vo2')) return 'vo2';
  if (t.includes('track')) return 'track';
  if (t.includes('race')) return 'race';
  if (t.includes('long')) return 'long';
  if (t.includes('recovery') || t.includes('easy')) return 'easy';
  if (t.includes('steady') || t.includes('aerobic') || t.includes('base') || t.includes('endurance')) return 'steady';
  return 'other';
}
function toHeat(level: string | null | undefined): 'mild' | 'moderate' | 'high' | null {
  const l = String(level || '').toLowerCase();
  if (l.includes('extreme') || l.includes('severe') || l === 'high') return 'high';
  if (l.includes('moderate')) return 'moderate';
  if (l.includes('mild') || l.includes('low')) return 'mild';
  return null;
}

/** Build the composer input from fact_packet_v1 + the per-mile splits. `intervals` is optional (from the
 *  analyzer's interval breakdown) since the packet doesn't carry rep hit/total. */
export function buildRunInsightInputFromPacket(
  fp: any,
  splitsMi: any[] | null | undefined,
  intervals?: { hit?: number | null; total?: number | null; consistent?: boolean | null } | null,
): RunInsightInput {
  const facts = fp?.facts ?? {};
  const derived = fp?.derived ?? {};
  const dcp = typeof derived.cardiac_decoupling_pct === 'number' ? derived.cardiac_decoupling_pct : null;
  const type = toRunType(facts.workout_type);
  const pv = pacingVerdict(splitsMi, dcp, true);
  const gainFt = typeof facts.elevation_gain_ft === 'number' ? facts.elevation_gain_ft : null;
  const terrainType = String(facts.terrain_type || '').toLowerCase();
  const wk = String(facts.plan?.week_intent || '').toLowerCase();
  const intent = wk.includes('recovery') ? 'recovery' : (wk.includes('base') || wk.includes('maintenance')) ? 'maintenance' : wk.includes('build') ? 'build' : null;
  return {
    type,
    intent,
    distanceMi: typeof facts.total_distance_mi === 'number' ? Math.round(facts.total_distance_mi * 10) / 10 : null,
    durationMin: typeof facts.total_duration_min === 'number' ? facts.total_duration_min : null,
    pacing: pv ? { pattern: pv.pattern, hrHeld: pv.hrHeld, outAndBack: null } : null,
    decoupling: { pct: dcp, assessment: null },
    terrain: { gainFt, rolling: terrainType.includes('rolling') || terrainType.includes('hill') || (gainFt ?? 0) >= 150 },
    conditions: { tempF: typeof facts.weather?.temperature_f === 'number' ? facts.weather.temperature_f : null, heatStress: toHeat(facts.weather?.heat_stress_level) },
    execution: { rpe: typeof facts.athlete_reported?.rpe === 'number' ? facts.athlete_reported.rpe : null, hitIntent: null },
    intervals: intervals ?? null,
  };
}

// unused-but-exported helper kept for the wiring step (pace formatting shared with the PACING row).
export { pace as _fmtPace };
