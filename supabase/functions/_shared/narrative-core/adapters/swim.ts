// SWIM adapter for the shared narrative-reasoning core — the REFERENCE implementation. Swim already
// passes all 7 rules (D-167→D-183); this adapter exists now mainly for the ACCEPTANCE GATE (the core's
// validators must reproduce swim's compliant output — i.e. NOT false-positive on it — before run goes
// through the core). Swim's full migration is last (work order), at which point this adapter also gains
// the Q-061 kick/drill pessimistic-direction equipment flag. Full detail: docs/SPEC-honest-swim-inference.md.

import type { DisciplineAdapter, NarrativeContext, SignalFlag, NotableLeadSignal } from '../types.ts';

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null; // zero-not-null: Number(null)===0 (D-112 class)
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const SWIM_ADDENDUM = `
Signals: pace/100 (equipment/drill-inclusive), work:rest (moving vs elapsed), avg/max HR, RPE/feel, pool/lengths, equipment-per-step, planned intent.
Honest reads: work:rest vs the session-intent norm; RPE×HR coherence (zone-anchored); equipment-flag DIRECTION-only.
Equipment, DIRECTION-only: name ONLY the actual equipment given in the "Equipment used" line — NEVER recite a category list or name gear that wasn't used. The fast/slow grouping (fast-assist gear → reads faster; kick/drill → reads slower; mixed → pulled both ways, not a clean number) is INTERNAL direction-logic for YOU to pick the right one-clause flag, NOT a list to state as fact.
Traps: NAMING equipment not in the data (fabrication); diagnosing the cause of rest (never assert the rest was technique/mixed/fatigue — state the fraction + whether typical for a KNOWN intent only); absolute HR; peak-driven reads; quantifying equipment effect; pace trend without equipment/drill-flagging (Q-061).
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
    // D-190: when equipment distorts the pace, make it a NOTABLE lead signal so the shared Rule-1
    // (leadSignalCoverage) validator REQUIRES the narrative to flag the direction — the same mechanism
    // that stops run dropping heat. This makes the kick/drill pessimistic flag RELIABLE (an omission now
    // triggers a retry), and keeps the fins/optimistic flag enforced too.
    const notableLeadSignals: NotableLeadSignal[] = [];
    if (packet?.equip_optimistic || packet?.equip_pessimistic) {
      notableLeadSignals.push({
        signal: 'equipment pace-distortion',
        mentions: ['fin', 'buoy', 'paddle', 'kick', 'board', 'drill', 'faster than', 'slower than', 'equipment', 'gear', 'assisted', 'flatter'],
        detail: (packet.equip_optimistic && packet.equip_pessimistic)
          ? 'mixed fast + slow gear — the blended pace is not a clean fitness number (name only the actual gear listed)'
          : packet.equip_optimistic
          ? 'the pace reads FASTER than unaided swimming (name only the actual gear listed)'
          : 'the pace reads SLOWER than your actual swimming pace (name only the actual gear listed)',
      });
    }

    return {
      notableLeadSignals, // equipment direction enforced when present (D-190); else swim's lead is free (D-179)
      atypicalSignals,
      anchors: { hr: hasZones ? 'zones' : null }, // neutral floor when no zones (D-183)
      hasTrendField: false,                        // a single swim is not a trend
      hasFitnessTrend: false,                      // and not a fitness-grade verdict either
      establishedCauses: [],                       // swim never diagnoses the cause of rest
    };
  },
};
