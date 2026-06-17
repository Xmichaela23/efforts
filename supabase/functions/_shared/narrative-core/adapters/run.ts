// RUN adapter for the shared narrative-reasoning core. Translates the run fact packet (FactPacketV1:
// facts + derived) into the generic NarrativeContext. This is the ONLY discipline-aware code for run.
// Targets the three captured live violations (work-order Phase 3 run criteria):
//   Rule 1 — heat is dropped from the lead on hot runs (temperature_f is in the packet, narrative omits it).
//   Rule 2 — "steady" over elevated+UNDECOMPOSED drift (Apr 19: 35 bpm raw / 12% decoupling / null pace-norm).
//   Rule 5 — single-session readiness/fitness verdict ("signaling you're ready", "aerobic base is holding").

import type { DisciplineAdapter, NarrativeContext, NotableLeadSignal, SignalFlag } from '../types.ts';

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null; // zero-not-null: Number(null)===0, must NOT read as 0 (D-112 class)
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const RUN_ADDENDUM = `
Signals: pace, GAP (grade-adjusted pace), grade/elevation, temperature/heat, HR + HR drift/decoupling, cadence, plan intent. (Numbers are single-sourced via resolveRunScalars, D-185.)
Honest reads: GAP vs raw pace for terrain context; HR drift vs THIS athlete's typical drift; grade + heat reasoned TOGETHER as related effort modifiers (not separate facts); pacing distribution.
Traps to avoid: reporting terrain, heat, and HR drift as separate facts without connecting them; a "controlled/easy/steady" lead that ignores an elevated, undecomposed HR drift; diagnosing that heat OR terrain CAUSED the drift when they co-occur (name both as plausible); absolute pace/HR without anchoring to the athlete's zones/typical.
`;

export const runAdapter: DisciplineAdapter = {
  discipline: 'run',
  leadSignals: ['pace', 'grade/terrain', 'heat', 'HR drift'],
  addendum: RUN_ADDENDUM,
  buildContext(packet: any): NarrativeContext {
    const facts = packet?.facts ?? {};
    const der = packet?.derived ?? {};
    const weather = facts?.weather ?? {};

    // ── Rule 1: heat is a NOTABLE lead signal when the run was warm, and must not be dropped.
    const notableLeadSignals: NotableLeadSignal[] = [];
    const tempF = num(weather?.temperature_f);
    const heatStress = typeof weather?.heat_stress_level === 'string' ? weather.heat_stress_level : null;
    if ((tempF != null && tempF >= 75) || (heatStress != null && heatStress !== 'none')) {
      notableLeadSignals.push({
        signal: 'heat',
        mentions: ['heat', 'temperature', 'warm', 'hot', '°f', 'degrees', 'humid', 'conditions'],
        detail: tempF != null ? `it was ${Math.round(tempF)}°F` : `heat stress: ${heatStress}`,
      });
    }

    // ── Rule 2: flag drift as atypical ONLY when it's elevated AND NOT explained by pace/terrain.
    // Use the pace-normalized (decomposed) drift when available — a high RAW drift that the analyzer
    // already attributes to pace/terrain (low pace-normalized) is NOT a contradiction (May 31 case).
    const atypicalSignals: SignalFlag[] = [];
    const normDrift = num(der?.pace_normalized_drift_bpm);
    const rawDrift = num(der?.hr_drift_bpm);
    const typical = num(der?.hr_drift_typical) ?? 0;
    const decoup = num(der?.cardiac_decoupling_pct);
    if (normDrift != null) {
      if (normDrift > 8 && normDrift > typical + 6) {
        atypicalSignals.push({ signal: 'HR drift', state: 'elevated', detail: `${normDrift} bpm pace-normalized vs typical ${typical}` });
      }
    } else if (rawDrift != null && rawDrift > 20 && decoup != null && decoup >= 10) {
      // couldn't decompose → an undecomposed, clearly-high drift is atypical (Apr 19).
      atypicalSignals.push({ signal: 'HR drift', state: 'unexplained', detail: `${rawDrift} bpm raw, ${decoup}% decoupling, not decomposed` });
    }

    // ── Rule 3: run anchors HR to threshold-derived zones (built in the fact packet) — present by default.
    const anchors = { hr: 'zones' as const };

    // ── Rule 5: run's comparisons.trend is a PACE-SIMILARITY direction (grounds "you're X faster than your
    // last N similar efforts"), NOT a fitness-grade verdict — so it grounds DIRECTION claims but NOT
    // fitness-STATE claims ("aerobic base is holding"). hasFitnessTrend stays false for run.
    const trend = der?.comparisons?.trend ?? null;
    const hasTrendField = !!(trend && (trend.direction || num(trend.data_points)));
    const hasFitnessTrend = false;

    // ── Rule 4: causes the drift decomposition has deterministically established.
    const establishedCauses: string[] = [];
    const dexp = der?.drift_explanation;
    if (dexp === 'terrain_driven') establishedCauses.push('terrain', 'grade', 'hill', 'hills');
    if (dexp === 'pace_driven') establishedCauses.push('pace');

    return { notableLeadSignals, atypicalSignals, anchors, hasTrendField, hasFitnessTrend, establishedCauses };
  },
};
