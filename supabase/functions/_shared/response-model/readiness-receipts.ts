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

// ── The Why NAMES THE DRIVER, not the verdict (the honest "which session moved the week most"). ──
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function dayName(iso: string): string {
  const t = Date.parse(iso + 'T12:00:00Z');
  return Number.isNaN(t) ? 'A recent' : `${DOW[new Date(t).getUTCDay()]}'s`;
}
function sessionKind(type: string): string {
  const t = (type || '').toLowerCase();
  if (t.includes('strength')) return 'strength session';
  if (t.includes('run')) return 'run';
  if (t.includes('ride') || t.includes('bike') || t.includes('cycl')) return 'ride';
  if (t.includes('swim')) return 'swim';
  return 'session';
}

export interface RpeSessionLite { date: string; type: string; rpe: number }

/**
 * The RPE clause for the Why. CONSTANT-FREE (Michael 2026-07-04): the driver = the single session
 * whose excess over the 28d baseline exceeds ALL other positive contributors' excess COMBINED — i.e.
 * it moved the week more than everyone else put together. Rules:
 *   • not elevated  → 'perceived effort up' (the caller only calls this when rpe is declining anyway)
 *   • dominant top  → name it ("Monday's strength session (you rated it 9) pushed the week's effort up")
 *   • near-tie / no dominant → the plain receipt (adds the spread; a receipt beats a restated verdict)
 */
export function rpeWhyClause(args: {
  sessions: RpeSessionLite[]; currentAvg: number | null; baseline: number | null; elevated: boolean;
}): string {
  const { sessions, currentAvg, baseline, elevated } = args;
  if (!elevated || baseline == null || currentAvg == null || sessions.length === 0) return 'perceived effort up';
  const contribs = sessions
    .map((x) => ({ ...x, excess: x.rpe - baseline }))
    .filter((x) => x.excess > 0)
    .sort((a, b) => b.excess - a.excess);
  if (contribs.length) {
    const top = contribs[0];
    const othersCombined = contribs.slice(1).reduce((sum, x) => sum + x.excess, 0);
    if (top.excess > othersCombined) {
      return `${dayName(top.date)} ${sessionKind(top.type)} (you rated it ${top.rpe}) pushed the week's effort up`;
    }
  }
  return `effort ${currentAvg.toFixed(1)} vs your typical ${baseline.toFixed(1)}, across ${sessions.length} sessions`;
}

/**
 * The BODY-row driver: the RPE CLAUSE ONLY of the Why (it sits under "how hard it feels" = RPE, so
 * a non-RPE factor there would be a mislabel). Rules:
 *   • rpe NOT declining → null (BODY shows no driver; never borrows a non-RPE factor like "execution down")
 *   • rpe declining     → the session driver / receipt, NEVER the bare "perceived effort up" (that just
 *     restates the verdict the row already shows)
 */
export function bodyRpeDriver(args: {
  rpeDeclining: boolean; sessions: RpeSessionLite[]; currentAvg: number | null; baseline: number | null;
}): string | null {
  if (!args.rpeDeclining) return null;
  const clause = rpeWhyClause({ sessions: args.sessions, currentAvg: args.currentAvg, baseline: args.baseline, elevated: true });
  return clause === 'perceived effort up' ? null : clause; // a real driver/receipt, never the bare verdict
}

/** FATIGUED "Why:" breakdown for the open-for-more expansion. Null when there's nothing to explain. */
export function buildReadinessWhy(args: {
  signals: ReadinessSignalInput;
  loadLabel: string;        // "load balanced" | "load elevated (ACWR 1.3)"
  concerningCount: number;  // assessment.signals_concerning
  rpeClause?: string;       // the driver-named (or receipt) RPE clause — replaces the bare verdict
  rpeUnderBody?: boolean;   // RPE driver is shown under BODY (readiness_rpe_driver) → drop it here (no dup)
}): string | null {
  const s = args.signals;
  // NAME the marker(s) that tripped — the driver IS the concerning signal, so no redundant
  // "N body signals declining" count alongside it (Michael 2026-07-03).
  const drivers: string[] = [];
  if (s.rpe?.declining && !args.rpeUnderBody) {
    // The Why NAMES THE DRIVER (which session moved the week), not the bare verdict — a restated
    // verdict is nothing. Numeric receipt still lives on the BODY row; the driver sentence is new info.
    // When rpeUnderBody, the RPE driver renders under BODY instead (paired with its verdict) — the Why
    // then carries only the NON-RPE factors, so nothing double-shows.
    drivers.push(args.rpeClause ?? 'perceived effort up');
  }
  if (s.execution?.declining) drivers.push('run execution down');
  if (s.hrDrift?.declining) drivers.push('HR drift rising');
  if (s.cardiacEff?.declining) drivers.push('aerobic efficiency down');
  if (s.strength?.declining) drivers.push('strength fading');
  // Load ONLY when it's a real driver (elevated) — a "balanced" load is the headline's fact, not a
  // Why (one fact, one place; drop the "· load balanced" restatement).
  const loadTail = args.loadLabel.includes('balanced') ? [] : [args.loadLabel];
  if (drivers.length) return `Why: ${[...drivers, ...loadTail].join(' · ')}`;
  // No nameable driver but something tripped → say how many (fallback only).
  if (args.concerningCount > 0) {
    return `Why: ${args.concerningCount} concerning signal${args.concerningCount === 1 ? '' : 's'}${loadTail.length ? ` · ${loadTail[0]}` : ''}`;
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

export interface CrossTrainingStressInput {
  rpeRising: boolean;
  driftWorsening: boolean;
  strengthFading: boolean;
  rirDropping: boolean;
  bodyConcerned: boolean;         // assessment.signals_concerning > 0
  rpe: { current: number | null; baseline: number | null };
}

/**
 * The cross-training strain ROW decision for the State BODY section. Fires only
 * on ≥2 stress signals.
 *
 * D-236 Part C — glance-tier dedup: when RPE is the SOLE distinct signal, the ≥2
 * gate is met only because `bodyConcerned` double-counts the same elevated RPE
 * (a declining RPE IS the concerning signal). The resulting "Effort up (X vs Y)"
 * receipt merely restates the glance-level "How hard it feels" row, so suppress
 * it (return null). Multi-factor and non-RPE-single cases are UNCHANGED. The
 * LEGS LOADED "why" keeps its RPE receipt — the dedup is glance-tier only, and
 * receipts cite their evidence per D-232.
 */
export function crossTrainingStressReceipt(
  input: CrossTrainingStressInput,
): { label: string; tone: 'warning' } | null {
  const { rpeRising, driftWorsening, strengthFading, rirDropping, bodyConcerned } = input;
  const stressSignals =
    [rpeRising, driftWorsening, strengthFading, rirDropping, bodyConcerned].filter(Boolean).length;
  if (stressSignals < 2) return null;
  // RPE-sole: the ≥2 was reached only via the bodyConcerned double-count of RPE.
  if (rpeRising && !driftWorsening && !strengthFading && !rirDropping) return null;
  const receipt = buildCrossTrainingReceipt({
    rpe: { declining: rpeRising, current: input.rpe.current, baseline: input.rpe.baseline },
    hrDrift: { declining: driftWorsening },
    strength: { declining: strengthFading },
    rirDropping,
  });
  return { label: receipt ?? 'Body showing strain across disciplines', tone: 'warning' };
}
