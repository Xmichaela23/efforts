// DETERMINISTIC BIKE INSIGHTS COMPOSER (2026-07-19) — replaces the LLM for cycling. Mirrors run-insights:
// verdict-per-clause, three families, silence when thin. Bike adds ONE fork running doesn't have —
// POWER vs NO-POWER — because NP/IF/TSS/power-curve all need a meter. With power: the full read. HR only:
// the honest lighter read (decoupling, HR held), never a fabricated watt. Same law as swim: interpret in
// proportion to the data you actually have.
//
// CONTINUITY: reads the verdicts the cycling engine already computes (NP, IF, TSS, VI, efficiency_factor,
// aerobic_decoupling_pct, work-interval target hits) — does not recompute them. Pure function → any surface
// renders its output.

export type BikeType = 'endurance' | 'recovery' | 'long' | 'tempo' | 'sweetspot' | 'threshold' | 'vo2' | 'anaerobic' | 'sprint' | 'over_under' | 'group' | 'other';

// Three families (same architecture as run): AEROBIC (endurance/recovery/long) = the steady story;
// INTERVAL (tempo/sweetspot/threshold/vo2/anaerobic/sprint/over_under) = the work story; MIXED (group) =
// surges by design, never graded for steadiness.
type BikeFamily = 'aerobic' | 'interval' | 'mixed';
function familyOf(t: BikeType): BikeFamily {
  if (t === 'endurance' || t === 'recovery' || t === 'long') return 'aerobic';
  if (t === 'group') return 'mixed';
  return 'interval';
}

export interface BikeInsightInput {
  type: BikeType;
  hasPower: boolean;
  distanceMi?: number | null;
  durationMin?: number | null;
  power?: { np?: number | null; avg?: number | null; if?: number | null; tss?: number | null; vi?: number | null; ftp?: number | null } | null;
  /** efficiency_factor = watts per heartbeat (aerobic efficiency; higher = fitter at the same HR). */
  efficiency?: { factor?: number | null } | null;
  decoupling?: { pct: number | null } | null;
  /** work-interval execution: reps hit, whether the power held target, consistency across the set. */
  intervals?: { hit?: number | null; total?: number | null; heldTarget?: boolean | null; consistent?: boolean | null } | null;
  conditions?: { tempF?: number | null; heatStress?: 'mild' | 'moderate' | 'high' | null } | null;
  execution?: { rpe?: number | null } | null;
}

const BANNED = /\b(crush\w*|nailed|smash\w*|amazing|great job|awesome|keep it up|stay consistent|well done|body is ready|on track|proud|beast|killer)\b|!/i;
function clean(sentences: (string | null | undefined)[]): string | null {
  const kept = sentences.map((s) => (s ?? '').trim()).filter(Boolean).filter((s) => !BANNED.test(s));
  return kept.length ? kept.join(' ') : null;
}
const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function composeBikeInsight(inp: BikeInsightInput): string | null {
  if (!inp) return null;
  const parts: (string | null)[] = [];
  const fam = familyOf(inp.type);
  const p = inp.power ?? {};
  const np = typeof p.np === 'number' ? p.np : null;
  const iff = typeof p.if === 'number' ? p.if : null;
  const tss = typeof p.tss === 'number' ? p.tss : null;
  const vi = typeof p.vi === 'number' ? p.vi : null;
  const ef = typeof inp.efficiency?.factor === 'number' ? inp.efficiency.factor : null;
  const dcp = typeof inp.decoupling?.pct === 'number' ? inp.decoupling.pct : null;
  const dcpTxt = dcp != null ? `${Math.round(dcp * 10) / 10}%` : null;
  const hrHeld = dcp != null && dcp <= 5; // Friel line, same as run/State
  const power = inp.hasPower && np != null;

  // ── AEROBIC — endurance / recovery / long: the steady aerobic story ──────────────────────────────
  if (fam === 'aerobic') {
    if (power) {
      // steadiness of the power itself (VI near 1.0 = you held it smooth), then the load.
      if (vi != null && vi <= 1.05) parts.push(`You held the power smooth (${np} W normalized${vi <= 1.03 ? ', barely a surge' : ''}).`);
      else parts.push(`Steady aerobic ride at ${np} W normalized.`);
      // the efficiency read — same watts at a lower HR is the fitness gain cyclists track.
      if (hrHeld && dcpTxt) parts.push(`Heart rate held (drift ${dcpTxt}), so the aerobic engine carried it — the watts didn't cost you HR.`);
      else if (dcpTxt) parts.push(`Heart rate drifted ${dcpTxt} over the ride.`);
      if (iff != null && tss != null) parts.push(`${tss} TSS at ${r2(iff)} intensity — an aerobic-base load.`);
    } else {
      // HR-only: no watts. The honest lighter read.
      if (hrHeld && dcpTxt) parts.push(`Steady aerobic ride — heart rate held (drift ${dcpTxt}), the effort stayed even.`);
      else if (dcpTxt) parts.push(`Heart rate drifted ${dcpTxt} across the ride.`);
      else parts.push('A steady aerobic ride.');
    }
    return clean(parts);
  }

  // ── INTERVAL — tempo/sweetspot/threshold/vo2/anaerobic/sprint/over_under: the work story ──────────
  if (fam === 'interval') {
    const hit = inp.intervals?.hit, total = inp.intervals?.total;
    const hasReps = typeof hit === 'number' && typeof total === 'number' && total > 0;
    if (hasReps) {
      parts.push(hit === total ? `You completed all ${total} work interval${total === 1 ? '' : 's'}.` : `You completed ${hit} of ${total} work intervals.`);
      if (power && inp.intervals?.heldTarget === true) parts.push('The power held your target range across the set.');
      else if (power && inp.intervals?.heldTarget === false) parts.push('The power fell short of target on the later reps — the set drifted.');
      else if (inp.intervals?.consistent === true) parts.push('The reps held even across the set.');
      else if (inp.intervals?.consistent === false) parts.push('The reps drifted — the later ones came in lower.');
    }
    if (power && np != null && iff != null && tss != null) parts.push(`${np} W normalized at ${r2(iff)} intensity — ${tss} TSS.`);
    // HR-only caveat ONLY when there's a work-story to caveat — never as standalone padding (silence otherwise).
    else if (!inp.hasPower && hasReps) parts.push('Read from heart rate — no power meter, so the effort is graded by zone.');
    return clean(parts);
  }

  // ── MIXED — group ride / unstructured: surges by design, never graded for steadiness ──────────────
  if (fam === 'mixed') {
    parts.push('A mixed ride — the power swung with the group by design, not a pacing miss.');
    if (power && np != null && tss != null) parts.push(`${np} W normalized, ${tss} TSS over the ride.`);
    else if (typeof inp.durationMin === 'number' && typeof inp.distanceMi === 'number' && inp.distanceMi > 0) parts.push(`${inp.distanceMi} mi over ${r0(inp.durationMin)} min of mixed efforts.`);
    return clean(parts);
  }

  return clean(parts);
}

// ── MAPPER: CyclingFactPacketV1 (+ analyzer extras) → composer input. Defensive: missing → clause dropped. ──
function toBikeType(ct: string | null | undefined): BikeType {
  const t = String(ct || '').toLowerCase();
  if (t.includes('recovery')) return 'recovery';
  if (t.includes('sweet')) return 'sweetspot';
  if (t.includes('threshold') || t.includes('ftp')) return 'threshold';
  if (t.includes('vo2')) return 'vo2';
  if (t.includes('anaerobic')) return 'anaerobic';
  if (t.includes('sprint') || t.includes('neuro')) return 'sprint';
  if (t.includes('over') && t.includes('under')) return 'over_under';
  if (t.includes('tempo')) return 'tempo';
  if (t.includes('group')) return 'group';
  if (t.includes('long')) return 'long';
  if (t.includes('endurance') || t.includes('aerobic') || t.includes('base') || t.includes('z2') || t.includes('easy')) return 'endurance';
  return 'other';
}

export function buildBikeInsightInputFromPacket(
  fp: any,
  extras?: { tss?: number | null; decouplingPct?: number | null; intervals?: { hit?: number | null; total?: number | null; heldTarget?: boolean | null; consistent?: boolean | null } | null } | null,
): BikeInsightInput {
  const f = fp?.facts ?? {};
  const np = typeof f.normalized_power_w === 'number' ? f.normalized_power_w : null;
  const avg = typeof f.avg_power_w === 'number' ? f.avg_power_w : null;
  const hasPower = np != null || avg != null;
  return {
    type: toBikeType(f.classified_type),
    hasPower,
    distanceMi: typeof f.total_distance_mi === 'number' ? Math.round(f.total_distance_mi * 10) / 10 : null,
    durationMin: typeof f.total_duration_min === 'number' ? f.total_duration_min : null,
    power: hasPower ? {
      np, avg,
      if: typeof f.intensity_factor === 'number' ? f.intensity_factor : null,
      vi: typeof f.variability_index === 'number' ? f.variability_index : null,
      tss: extras?.tss ?? null,
      ftp: typeof f.ftp_w === 'number' ? f.ftp_w : null,
    } : null,
    efficiency: null,
    decoupling: { pct: extras?.decouplingPct ?? null },
    intervals: extras?.intervals ?? null,
    conditions: null,
    execution: null,
  };
}
