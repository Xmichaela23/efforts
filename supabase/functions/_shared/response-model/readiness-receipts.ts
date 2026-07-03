// D-232 glass-box receipts for the readiness headline (FATIGUED) + the cross-training strain row.
// Both turn a real readiness decision into plain factors with values — never bare "FATIGUED" / a
// generic "strain across disciplines". Pure + fixturable; the coach passes the real signal evidence.
//
// CRITICAL honesty rule (Michael 2026-07-03): the cross-training receipt cites only DISTINCT specific
// signals. `bodyConcerned` overlaps the specific signals (a declining RPE IS the concerning signal), so
// a SINGLE declining signal must NOT read as "across disciplines" — it reads as just that one factor.
// The detection over-fire (stressSignals double-count) is a separate Q-111 fix; the receipt never
// overstates regardless.

export interface ReadinessSignalInput {
  rpe?: { declining: boolean; current: number | null; baseline: number | null };
  hrDrift?: { declining: boolean };
  execution?: { declining: boolean };
  cardiacEff?: { declining: boolean };
  strength?: { declining: boolean };
  rirDropping?: boolean;
}

const cap = (x: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);

/** FATIGUED "Why:" breakdown for the open-for-more expansion. Null when there's nothing to explain. */
export function buildReadinessWhy(args: {
  signals: ReadinessSignalInput;
  loadLabel: string;        // "load balanced" | "load elevated (ACWR 1.3)"
  concerningCount: number;  // assessment.signals_concerning
}): string | null {
  const s = args.signals;
  // NAME the marker(s) that tripped — the driver IS the concerning signal, so no redundant
  // "N body signals declining" count alongside it (Michael 2026-07-03).
  const drivers: string[] = [];
  if (s.rpe?.declining && s.rpe.current != null && s.rpe.baseline != null) {
    drivers.push(`perceived effort up (${s.rpe.current.toFixed(1)} vs ${s.rpe.baseline.toFixed(1)} typical)`);
  }
  if (s.execution?.declining) drivers.push('run execution down');
  if (s.hrDrift?.declining) drivers.push('HR drift rising');
  if (s.cardiacEff?.declining) drivers.push('aerobic efficiency down');
  if (s.strength?.declining) drivers.push('strength fading');
  if (drivers.length) return `Why: ${[...drivers, args.loadLabel].join(' · ')}`;
  // No nameable driver but something tripped → say how many (fallback only).
  if (args.concerningCount > 0) {
    return `Why: ${args.concerningCount} concerning signal${args.concerningCount === 1 ? '' : 's'} · ${args.loadLabel}`;
  }
  return null;
}

/**
 * Cross-training strain receipt — cite only the DISTINCT specific signals that fired. A single distinct
 * signal → that factor alone, NO "across disciplines" framing (the double-count honesty). ≥2 → the first
 * two joined. Null when no specific signal is nameable (caller keeps a safe generic).
 */
export function buildCrossTrainingReceipt(signals: ReadinessSignalInput): string | null {
  const s = signals;
  const factors: string[] = [];
  if (s.rpe?.declining && s.rpe.current != null && s.rpe.baseline != null) {
    factors.push(`effort up (${s.rpe.current.toFixed(1)} vs ${s.rpe.baseline.toFixed(1)})`);
  }
  if (s.hrDrift?.declining) factors.push('HR drift rising');
  if (s.strength?.declining) factors.push('strength fading');
  if (s.rirDropping) factors.push('reps-in-reserve dropping');
  if (s.execution?.declining) factors.push('execution down');
  if (s.cardiacEff?.declining) factors.push('aerobic efficiency down');
  if (!factors.length) return null;
  return factors.length >= 2 ? `${cap(factors[0])} + ${factors[1]}` : cap(factors[0]);
}
