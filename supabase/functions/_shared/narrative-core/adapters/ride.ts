// RIDE adapter for the shared narrative-reasoning core. The NO-REGRESSION case (D-188): ride already
// complies (strongest bespoke validators — power-truth, HR-secondary, jargon ban, lede frame, grounded
// direction). This adapter is calibrated so the shared suite PASSES ride's already-compliant output —
// it must not introduce false positives that force retries and drift the text. Reads the ride DISPLAY
// packet (toDisplayPacket output: power / hr / cross_workout).

import type { DisciplineAdapter, NarrativeContext, SignalFlag } from '../types.ts';

const RIDE_ADDENDUM = `
Signals: power, NP, IF, VI, W/kg, HR (SECONDARY when power present), cadence, plan intent. (NP single-sourced via rideComputedNp.)
Honest reads: power is the truth signal — characterize effort from power/NP/IF first; HR corroborates, it is secondary; VI for steadiness; W/kg vs the athlete's target for race-readiness context.
Traps: over-reading HR when power tells the story (HR is secondary on the bike); absolute watts without a W/kg or FTP anchor; single-ride fitness claims (a fitness DIRECTION needs the spine trend verdict, not one ride).
`;

export const rideAdapter: DisciplineAdapter = {
  discipline: 'ride',
  leadSignals: ['power/intensity', 'HR-response'],
  addendum: RIDE_ADDENDUM,
  buildContext(packet: any): NarrativeContext {
    const cw = packet?.cross_workout ?? {};
    const power = packet?.power ?? {};

    // ── Rule 1: ride has NO "captured-but-dropped" notable like run's heat — its lede is power-centric by
    // design. Leave notableLeadSignals empty (the scaffold still says reason across power + HR-response).
    const notableLeadSignals: never[] = [];

    // ── Rule 2: ride's single-paragraph structure already precludes cross-section contradiction, and its
    // HR-secondary discipline means it rarely calls effort "steady" against an unreconciled signal. Keep
    // atypicalSignals empty unless the pool context is an UNAMBIGUOUS HR-vs-effort mismatch (rare) — for
    // the no-regression goal, do not manufacture atypicals that would trip a compliant ride.
    const atypicalSignals: SignalFlag[] = [];

    // ── Rule 3: power anchored to FTP when present; HR is band-anchored (HR-at-power), secondary.
    const anchors = { power: power?.ftp ? ('ftp' as const) : null, hr: 'zones' as const };

    // ── Rule 5: ride's cross_workout.trend is the SPINE fitness verdict (terrain-matched 20-min power,
    // staleness-gated) — it grounds BOTH a direction claim AND a fitness-state claim ("fitness is building").
    const hasTrendField = cw?.trend != null;
    const hasFitnessTrend = cw?.trend != null;

    // ── Rule 4: ride does not deterministically establish a cause; name contributors as plausible only.
    const establishedCauses: string[] = [];

    return { notableLeadSignals, atypicalSignals, anchors, hasTrendField, hasFitnessTrend, establishedCauses };
  },
};
