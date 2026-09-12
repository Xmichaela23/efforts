/**
 * ═══ THE DRIFT A SESSION PRINTS — ONE RULE, EVERY READER ═══════════════════════════════════════════
 *
 * The number behind `session_detail_v1.classification.decoupling.pct` (the Drift tile and the
 * heart-rate line on Performance) and behind the good-news line on Today ("Drift under 5 percent,
 * N rides in a row"). Both read THIS function (2026-09-12, Michael: "we need consistent rules across
 * all screens"). It used to be two copies — `build.ts` carried its own inline resolver and this file
 * warned "a change to one must be made to the other" — and on 2026-09-12 the two changed twice in one
 * day without each other. State's spine (`compute-snapshot driftReadForPoint`) keeps the same
 * precedence for its trend.
 *
 * THE RULE:
 *   0. ⛔ STEADY SESSIONS ONLY, RUN AND RIDE (p107, confirmed 2026-09-12): cardiac drift is "a general
 *      guideline when assessing the maximum recommended dose of easy/VT1 work in a given session" —
 *      a given pace or output at a given heart rate. An interval session has no such pace or output,
 *      so it has no drift: null, not a labelled number. `isIntervalSession` is the test, the same one
 *      the session builder has used for its rows since 2026-08.
 *   1. The analyser's pace-to-heart-rate decoupling, `heart_rate_summary.decouplingPct` (D-036),
 *      basis 'gap' or 'raw', when it computed one (runs).
 *   2. A ride's power-to-heart-rate decoupling, `computed.analysis.efficiency.aerobic_decoupling_pct`
 *      (`_shared/cycling-v1/ride-physiology.ts`), basis 'power' — TrainingPeaks' Pw:Hr, the number
 *      State's bike drift reads.
 *   3. Heart rate alone, second half against first — `hr_drift_v1.pct`, written by both analysers
 *      from `_shared/hr-drift-halves.ts` — basis 'hr'. The fallback when there is no output to
 *      ratio against.
 *   4. Else no read.
 * Rounded to one decimal, as the tile prints it — a reader comparing against 5 must see 4.96 as 5.0.
 */
export type DriftBasis = 'gap' | 'raw' | 'hr' | 'power';
export type SessionDrift = {
  pct: number;
  basis: DriftBasis;
  /** The run analyser's own read of its decoupling, when it stamped one. */
  assessment: string | null;
  /** The heat/effort-confounded flag the run analyser sets; State excludes such a run from its verdict. */
  confounded: boolean;
};

type IntervalRowLike = { interval_type?: unknown };

/**
 * Was this an interval session? More than two planned steps, a wide pace spread across the per-mile
 * segments, or rendered rows that carry recoveries between work. Moved here from `build.ts`
 * (`shouldSuppressSessionHrDrift`, 2026-08) so the boom line and the builder ask one function.
 */
export function isIntervalSession(factPacket: unknown, intervals?: IntervalRowLike[]): boolean {
  const fp = (factPacket ?? null) as { derived?: { interval_execution?: { total_steps?: unknown } }; facts?: { segments?: unknown } } | null;
  const steps = fp?.derived?.interval_execution?.total_steps;
  if (typeof steps === 'number' && steps > 2) return true;
  const segments = Array.isArray(fp?.facts?.segments) ? (fp!.facts!.segments as Array<{ pace_sec_per_mi?: unknown }>) : [];
  const paces = segments
    .map((s) => { const n = Number(s?.pace_sec_per_mi); return Number.isFinite(n) && n > 120 && n < 2400 ? n : null; })
    .filter((n): n is number => n != null);
  if (paces.length >= 5) {
    const spread = Math.max(...paces) - Math.min(...paces);
    if (spread >= 75) return true;
  }
  // Stale fact packets may omit interval_execution; use rendered interval rows (easy + strides + recoveries).
  if (intervals && intervals.length >= 4) {
    const rec = intervals.filter((iv) => String(iv.interval_type).toLowerCase() === 'recovery').length;
    const workish = intervals.filter((iv) => { const t = String(iv.interval_type).toLowerCase(); return t === 'work' || t === 'warmup'; }).length;
    if (rec >= 1 && workish >= 2) return true;
  }
  return false;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const RIDE = /^(ride|bike|cycling)$/;

export function resolveSessionDrift(input: {
  workoutAnalysis: unknown;
  computed?: unknown;
  sport?: string | null;
  /** The builder's fact packet when it has one from another source; else read off the analysis. */
  factPacket?: unknown;
  intervals?: IntervalRowLike[];
}): SessionDrift | null {
  let wa = input.workoutAnalysis;
  if (typeof wa === 'string') { try { wa = JSON.parse(wa); } catch { return null; } }
  const a = (wa && typeof wa === 'object' ? wa : {}) as Record<string, any>;
  const sport = String(input.sport ?? '').toLowerCase();
  const isRide = RIDE.test(sport);
  const isRun = sport === 'run';

  // 0. steady sessions only
  const fp = input.factPacket ?? a.fact_packet_v1 ?? null;
  if ((isRun || isRide) && isIntervalSession(fp, input.intervals)) return null;

  // 1. the analyser's decoupling
  const hrs = a.heart_rate_summary && typeof a.heart_rate_summary === 'object' ? a.heart_rate_summary : null;
  const pct = hrs?.decouplingPct;
  if (typeof pct === 'number' && Number.isFinite(pct)) {
    const basis = hrs.decouplingBasis === 'raw' ? 'raw' : 'gap';
    const assessment = typeof hrs.decouplingAssessment === 'string' ? hrs.decouplingAssessment : null;
    return { pct: round1(pct), basis, assessment, confounded: hrs.decouplingConfounded === true };
  }

  // 2. a ride's power-to-heart-rate ratio
  if (isRide) {
    let comp = input.computed;
    if (typeof comp === 'string') { try { comp = JSON.parse(comp); } catch { comp = null; } }
    const pdec = Number((comp as any)?.analysis?.efficiency?.aerobic_decoupling_pct);
    if (Number.isFinite(pdec)) return { pct: round1(pdec), basis: 'power', assessment: null, confounded: false };
  }

  // 3. heart rate alone
  const halves = a.hr_drift_v1;
  if (halves && typeof halves.pct === 'number' && Number.isFinite(halves.pct)) {
    return { pct: round1(halves.pct), basis: 'hr', assessment: null, confounded: false };
  }
  return null;
}

/** The percentage alone — what the boom line compares against 5. */
export function sessionDriftPct(workoutAnalysis: unknown, computed?: unknown, sport?: string | null): number | null {
  return resolveSessionDrift({ workoutAnalysis, computed, sport })?.pct ?? null;
}
