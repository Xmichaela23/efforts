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
// ⛔ NAME THE ZONE THE ATHLETE ACTUALLY RODE IN (2026-08-02, Michael). The engine has always
// classified the ride — `classified_type`, the same field the terrain bins and the power trend read —
// and the session screen never said it out loud. It matters most when it CONTRADICTS the prescription:
// a session prescribed "easy, all conversational" and executed at threshold is the single most useful
// sentence that screen can carry, and it was the one thing missing.
// Reads the classification; never re-derives a zone from IF, which would be a second opinion.
function rideZoneLabel(t: BikeType): string {
  switch (t) {
    case 'tempo': return 'Ridden at tempo';
    case 'sweetspot': return 'Ridden at sweet spot';
    case 'threshold': return 'Ridden at threshold';
    case 'vo2': return 'Ridden at VO2';
    case 'anaerobic': return 'Ridden anaerobic';
    case 'sprint': return 'Sprint work';
    case 'over_under': return 'Over-unders';
    default: return 'Ridden hard';
  }
}

/**
 * The BARE zone noun, for sentences that supply their own verb.
 *
 * ⛔ DO NOT DERIVE THIS BY STRING-SURGERY ON `rideZoneLabel` (2026-08-02). The first version of the
 * prescription clause did exactly that — `.replace(/^Ridden /, '')` — and shipped
 * "ridden at at threshold" straight into a test. Two renderings of one fact belong in two functions
 * over the same switch, never in a regex over the other one's output.
 */
function rideZoneName(t: BikeType): string {
  switch (t) {
    case 'tempo': return 'tempo';
    case 'sweetspot': return 'sweet spot';
    case 'threshold': return 'threshold';
    case 'vo2': return 'VO2';
    case 'anaerobic': return 'anaerobic';
    case 'sprint': return 'sprint work';
    case 'over_under': return 'over-unders';
    default: return 'hard';
  }
}

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
  conditions?: {
    tempF?: number | null;
    /** Start/end of the ride. When they differ the clause says the ride WARMED, matching the run's. */
    tempStartF?: number | null;
    tempEndF?: number | null;
    heatStress?: 'mild' | 'moderate' | 'high' | null;
    elevationGainFt?: number | null;
  } | null;
  execution?: { rpe?: number | null } | null;
  /**
   * WHAT THE SESSION WAS ASKED TO BE, when that was an INTENSITY rather than a number.
   * Populated only for a ride prescribed easy (the same easy-governor read that drives the Easy chip).
   * Its whole purpose is the case where the prescription and the execution DISAGREE.
   */
  prescription?: {
    easy?: boolean | null;
    underMin?: number | null;
    totalMin?: number | null;
    ceilingBpm?: number | null;
  } | null;
}

const BANNED = /\b(crush\w*|nailed|smash\w*|amazing|great job|awesome|keep it up|stay consistent|well done|body is ready|on track|proud|beast|killer)\b|!/i;
function clean(sentences: (string | null | undefined)[]): string | null {
  const kept = sentences.map((s) => (s ?? '').trim()).filter(Boolean).filter((s) => !BANNED.test(s));
  return kept.length ? kept.join(' ') : null;
}
const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * ⛔ THE SENTENCE THE SCREEN WAS MISSING (2026-08-02, Michael, reading his 2026-08-01 Long Ride).
 *
 * That ride was PRESCRIBED easy — the Easy chip read "9 of 64 min under 131 bpm" — and RIDDEN at
 * threshold, which the zone clause stated outright. The screen held both facts three lines apart and
 * never joined them. Joining them is the most useful thing that screen can say, and neither composer
 * had a clause for it.
 *
 * ⚠️ IT READS, IT DOES NOT DECIDE. The prescription comes from the easy governor that already scored
 * the session; the zone comes from `classified_type`, the same field `rideZoneLabel` reads. No second
 * opinion about what the ride was.
 *
 * ⚠️ AND IT IS A FACT, NOT A SCOLDING. Voice law: state the mismatch and the receipt, name no
 * consequence. What it COSTS belongs to State, which owns cross-session judgement.
 */
function prescriptionClause(inp: BikeInsightInput): string | null {
  const pr = inp.prescription;
  if (!pr?.easy) return null;
  if (familyOf(inp.type) !== 'interval') return null;   // prescription and execution agree — nothing to say
  const under = typeof pr.underMin === 'number' ? Math.round(pr.underMin) : null;
  const total = typeof pr.totalMin === 'number' ? Math.round(pr.totalMin) : null;
  const ceiling = typeof pr.ceilingBpm === 'number' ? Math.round(pr.ceilingBpm) : null;
  const zone = rideZoneName(inp.type);
  const receipt = (under != null && total != null && ceiling != null)
    ? ` — ${under} of ${total} minutes stayed under your ${ceiling} bpm ceiling`
    : '';
  return `Prescribed easy, ridden at ${zone}${receipt}.`;
}

/**
 * CONDITIONS AS LOAD — ported from the run composer, which has had it since 2026-07-19 while the bike
 * had no conditions clause at all. Michael's Long Ride was 81°F with 958 ft of climbing and the
 * paragraph mentioned neither. The input fields existed on this type the whole time; the mapper
 * hardcoded `conditions: null`, so the clause could never have fired. Starved, not absent.
 */
function conditionsClause(inp: BikeInsightInput): string | null {
  const c = inp.conditions;
  if (!c) return null;
  const heat = c.heatStress && c.heatStress !== null ? c.heatStress : null;
  const gain = typeof c.elevationGainFt === 'number' ? c.elevationGainFt : null;
  const rpe = typeof inp.execution?.rpe === 'number' ? inp.execution.rpe : null;
  const rpeClause = rpe != null ? `, and you carried it at RPE ${rpe}` : '';
  const ts = typeof c.tempStartF === 'number' ? Math.round(c.tempStartF) : null;
  const te = typeof c.tempEndF === 'number' ? Math.round(c.tempEndF) : null;
  const tf = typeof c.tempF === 'number' ? Math.round(c.tempF) : null;
  // Same phrasing rule as the run: when the reading moved, say it was rising rather than quote a mean.
  const tempPhrase = (ts != null && te != null && ts !== te)
    ? `Warming from ${ts} to ${te}°F`
    : (tf != null ? `Warm at ${tf}°F` : null);

  if (heat && tempPhrase) {
    // The run's gain gate is 150 ft; a ride covers more ground, so the bar is the ride-scale one used
    // by the classifier's own climbing threshold rather than a number invented here.
    const gainClause = gain != null && gain >= 500 ? ` and ${r0(gain)} ft of climbing` : '';
    return `${tempPhrase}${gainClause} — ${heat === 'mild' ? 'both add a little load' : 'that adds real load'}${rpeClause}.`;
  }
  if (gain != null && gain >= 500) {
    return `${r0(gain)} ft of climbing added the load${rpe != null ? `, carried at RPE ${rpe}` : ''}.`;
  }
  return null;
}

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

  // ⛔ LEADS THE PARAGRAPH. When the prescription and the execution disagree, that IS the read — every
  // other clause describes a session the athlete may not have been asked for. Silent when they agree.
  const lead = prescriptionClause(inp);
  const led = lead != null;
  parts.push(lead);

  // ── AEROBIC — endurance / recovery / long: the steady aerobic story ──────────────────────────────
  if (fam === 'aerobic') {
    if (power) {
      // steadiness of the power itself (VI near 1.0 = you held it smooth), then the load.
      if (vi != null && vi <= 1.05) parts.push(`You held the power smooth (${np} W normalized${vi <= 1.03 ? ', barely a surge' : ''}).`);
      else parts.push(`Steady aerobic ride at ${np} W normalized.`);
      // The efficiency read — same watts at a lower HR is the fitness gain cyclists track. NO drift NUMBER
      // here: the EFFICIENCY row owns the figure (Friel aerobic decoupling); the paragraph makes the
      // qualitative claim. This is what feeds `hrHeld` — raw HR drift, a proxy for the row's decoupling —
      // so the DECISION stays honest even though we don't print a second, differing number.
      if (hrHeld) parts.push(`Heart rate stayed in step with the power — the aerobic engine carried it, the watts didn't cost you HR.`);
      else if (dcp != null) parts.push(`Heart rate crept up relative to the power over the ride.`);
      if (iff != null && tss != null) parts.push(`${tss} TSS at ${r2(iff)} intensity — an aerobic-base load.`);
      parts.push(conditionsClause(inp));
    } else {
      // HR-only: no watts. The honest lighter read (again, no number — the HEART RATE row shows it).
      if (hrHeld) parts.push('Steady aerobic ride — heart rate held, the effort stayed even.');
      else if (dcp != null) parts.push('Steady aerobic ride — heart rate crept up across it.');
      else parts.push('A steady aerobic ride.');
      parts.push(conditionsClause(inp));
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
    // ⛔ NOT TWICE IN ONE PARAGRAPH. When the prescription clause has already named the zone (because it
    // contradicted what was asked), this clause drops the label and states only the numbers — otherwise
    // the reader gets "Prescribed easy, ridden at threshold. Ridden at threshold — 141 W…".
    if (power && np != null && iff != null && tss != null) {
      parts.push(led
        ? `${np} W normalized at ${r2(iff)} intensity, ${tss} TSS.`
        : `${rideZoneLabel(inp.type)} — ${np} W normalized at ${r2(iff)} intensity, ${tss} TSS.`);
    }
    // HR-only caveat ONLY when there's a work-story to caveat — never as standalone padding (silence otherwise).
    else if (!inp.hasPower && hasReps) parts.push('Read from heart rate — no power meter, so the effort is graded by zone.');
    parts.push(conditionsClause(inp));
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
  extras?: {
    tss?: number | null;
    decouplingPct?: number | null;
    intervals?: { hit?: number | null; total?: number | null; heldTarget?: boolean | null; consistent?: boolean | null } | null;
    /** ⛔ `conditions` and `prescription` were hardcoded to null here from 2026-07-19 to 2026-08-02.
     *  The composer's input type carried both fields the whole time and nothing ever populated them,
     *  so the conditions clause could not fire on any ride ever analysed. Starved, not absent. */
    conditions?: BikeInsightInput['conditions'];
    prescription?: BikeInsightInput['prescription'];
    rpe?: number | null;
  } | null,
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
    conditions: extras?.conditions ?? null,
    execution: extras?.rpe != null ? { rpe: extras.rpe } : null,
    prescription: extras?.prescription ?? null,
  };
}
