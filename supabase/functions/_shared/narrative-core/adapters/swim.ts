// SWIM adapter for the shared narrative-reasoning core — the REFERENCE implementation. Swim already
// passes all 7 rules (D-167→D-183); this adapter exists now mainly for the ACCEPTANCE GATE (the core's
// validators must reproduce swim's compliant output — i.e. NOT false-positive on it — before run goes
// through the core). Swim's full migration is last (work order), at which point this adapter also gains
// the Q-061 kick/drill pessimistic-direction equipment flag. Full detail: docs/SPEC-honest-swim-inference.md.

import type { DisciplineAdapter, NarrativeContext, SignalFlag } from '../types.ts';

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null; // zero-not-null: Number(null)===0 (D-112 class)
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const SWIM_ADDENDUM = `
Signals: pace/100 (equipment/drill-inclusive), work:rest (moving vs elapsed), avg/max HR, RPE/feel, pool/lengths, equipment-per-step, planned intent.
Honest reads: work:rest vs the session-intent norm; RPE×HR coherence (zone-anchored); equipment-flag DIRECTION-only.
Equipment is directional (NOT fins-only): fins/buoy/paddles speed pace UP (reads optimistic); kickboard/kick/drill slow it DOWN (reads pessimistic); snorkel ~neutral. Mixed-equipment sessions are pulled both ways and are not a clean fitness number either way.
Traps: diagnosing the cause of rest; absolute HR; peak-driven reads; quantifying equipment effect; pace trend without equipment/drill-flagging (Q-061).
Swim caveat: swim HR runs ~10-15 bpm below run HR for the same effort — a run threshold is NOT a valid swim anchor; with no swim anchor on file, stay neutral.
`;

export const swimAdapter: DisciplineAdapter = {
  discipline: 'swim',
  leadSignals: ['work:rest', 'RPE', 'HR'],
  addendum: SWIM_ADDENDUM,
  buildContext(packet: any): NarrativeContext {
    // Tolerant of swim's inline shape (analyze-swim builds workoutContext, not FactPacketV1).
    const hasZones = !!(packet?.avg_hr_zone || packet?.hr_threshold || packet?.hrZones);
    const atypicalSignals: SignalFlag[] = [];
    // RPE×HR incoherence: low RPE but HR genuinely high for the athlete's zone (only flag WITH an anchor).
    const rpe = num(packet?.rpe);
    const easyZone = packet?.hr_is_easy === true;
    if (hasZones && rpe != null && rpe <= 3 && easyZone === false) {
      atypicalSignals.push({ signal: 'HR', state: 'high-for-zone', detail: `RPE ${rpe} but HR above the easy zone` });
    }
    return {
      notableLeadSignals: [], // swim's lead already reasons across work:rest+RPE+HR (D-179); nothing forced-notable here yet
      atypicalSignals,
      anchors: { hr: hasZones ? 'zones' : null }, // neutral floor when no zones (D-183)
      hasTrendField: false,                        // a single swim is not a trend
      establishedCauses: [],                       // swim never diagnoses the cause of rest
    };
  },
};
