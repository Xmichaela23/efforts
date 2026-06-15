// STATE v2 — the ONE assembly that turns raw per-discipline rows into the spine result.
// Both the client hook (useStateTrends) and the server (compute-snapshot) call this with their
// OWN fetched rows. Identical model + identical assembly → identical output given identical rows.
// That structural equality IS the single-source guarantee: the STATE screen and the cached
// athlete_snapshot.state_trends_v1 cannot drift, because there is only one code path.
//
// Pure: no fetching, no Date windows beyond the helpers below (callers pass asOf + pre-fetched
// rows). The window helpers are exported so both callers slice the same UTC boundaries.

// Import from source modules (NOT ./index.ts) — index.ts re-exports this file, so importing the
// barrel here would create a load-order cycle.
import { computeStrengthState, type LiftSeries } from './strength.ts';
import { computeBikeFitness, isProvisionalTrend, type BikeFitness } from './bike-fitness.ts';
import { computeRunState, routeMetricsToSeries } from './run.ts';
import { computeSwimState, swimPaceToSeries } from './swim.ts';
import { computeAdherenceState } from './adherence.ts';
import { resolveDisciplineCard, perfFromTrend, type DisciplineCard, type PerfSummary } from './discipline.ts';
import { synthesizeHeadline, type Headline } from './headline.ts';
import { ADHERENCE_WINDOW_DAYS } from './thresholds.ts';

const DAY = 86_400_000;
export const ORDER = ['strength', 'bike', 'run', 'swim'] as const;

// UTC date helpers — match the client hook exactly (new Date().toISOString().slice(0,10)).
export const todayISO = (): string => new Date().toISOString().slice(0, 10);
export const isoMinus = (days: number): string => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

// Fetch windows the spine needs — exported so client + server slice identical boundaries.
export const STATE_TREND_WINDOWS = {
  liftWeeks: 12, // useExerciseLog(12)
  bikeLimit: 30, // latest 30 rides carrying workout_analysis
  runDays: 42, // GAP pace 6wk
  swimDays: 56, // pace/100 8wk
  cadenceDays: 90, // sessions/week
  adherenceDays: ADHERENCE_WINDOW_DAYS,
};

export const disciplineOf = (t: unknown): string | null => {
  const s = String(t || '').toLowerCase();
  if (s.includes('run')) return 'run';
  if (s.includes('swim')) return 'swim';
  if (s.includes('strength')) return 'strength';
  if (s.includes('ride') || s.includes('bike') || s.includes('cycl')) return 'bike';
  return null;
};

// Lift series from raw exercise_log rows — mirrors useExerciseLog's liftTrends derivation exactly
// (filter e1RM>0, group by canonical, ≥2 sessions, sort by date). Same columns both runtimes read.
export interface ExerciseLogLite { date: string; canonical_name: string; exercise_name?: string | null; estimated_1rm: number | null }
export function liftSeriesFromExerciseLog(rows: ExerciseLogLite[]): LiftSeries[] {
  const byCanonical = new Map<string, ExerciseLogLite[]>();
  for (const e of rows) {
    if ((e.estimated_1rm ?? 0) <= 0) continue;
    const arr = byCanonical.get(e.canonical_name) ?? [];
    arr.push(e);
    byCanonical.set(e.canonical_name, arr);
  }
  return [...byCanonical.entries()]
    .filter(([, rs]) => rs.length >= 2)
    .map(([canonical, rs]) => {
      const sorted = [...rs].sort((a, b) => a.date.localeCompare(b.date));
      return {
        canonical,
        displayName: rs[0].exercise_name ?? canonical,
        points: sorted.map((r) => ({ date: r.date, value: r.estimated_1rm! })),
      };
    })
    .sort((a, b) => b.points.length - a.points.length);
}

// ---- raw inputs (each caller fetches with its own client, then flattens identically) ----
export interface StateTrendInputs {
  asOf: string;
  exerciseRows: ExerciseLogLite[]; // 12wk exercise_log
  bikeRows: Array<{ date: string; classified_type: string | null; w20: number | null; hr_at_band: number | null; band_source: string | null }>;
  runJoined: Array<{ metric_date: string; effort_adjusted_pace_sec_per_km: number | null; classified_type: string | null }>;
  swimRows: Array<{ date: string; pace_per_100m: number }>;
  plannedBy: Record<string, number>; // this-week planned counts per discipline
  doneBy: Record<string, number>; // this-week completed counts per discipline
  cadenceCounts: Record<string, number>; // 90d completed counts per discipline
}

export interface StateTrendResult {
  cards: DisciplineCard[];
  headline: Headline | null;
  bikeFitness: BikeFitness;
  perfByDisc: Record<string, PerfSummary | null>;
  provisionalByDisc: Record<string, boolean>;
  spw: Record<string, number>;
}

/** The assembly. Mirrors useStateTrends' body — one code path for client + server. */
export function assembleStateTrends(inp: StateTrendInputs): StateTrendResult {
  const { asOf } = inp;

  // per-discipline cadence (sessions/week over 90d)
  const WEEKS_90D = STATE_TREND_WINDOWS.cadenceDays / 7;
  const spw: Record<string, number> = {};
  for (const k of ORDER) spw[k] = (inp.cadenceCounts[k] || 0) / WEEKS_90D;

  // bike — terrain-binned power + HR-at-power efficiency (Step 3 engine)
  const binRides = inp.bikeRows.map((r) => ({ date: r.date, classified_type: r.classified_type, w20: r.w20 }));
  const hrPts = inp.bikeRows
    .filter((r) => Number(r.hr_at_band) > 0)
    .map((r) => ({ date: r.date, value: Number(r.hr_at_band) }));
  const bikeFitness = computeBikeFitness(binRides, hrPts, asOf, spw.bike);
  bikeFitness.efficiency.basis = inp.bikeRows.map((r) => r.band_source).find((s) => s) ?? null;
  const bikeLeadVerdict = bikeFitness.power.verdict !== 'needs_data' ? bikeFitness.power.verdict : bikeFitness.efficiency.verdict;
  const bikeLeadPct = bikeFitness.power.verdict !== 'needs_data' ? bikeFitness.power.pctChange : bikeFitness.efficiency.pctChange;
  const bike: PerfSummary | null = bikeLeadVerdict !== 'needs_data' ? { verdict: bikeLeadVerdict, pctChange: bikeLeadPct } : null;

  // run
  const runState = computeRunState(routeMetricsToSeries(inp.runJoined), asOf, spw.run);
  const run = perfFromTrend(runState.trend);

  // swim
  const { series: swimSeries, dropped } = swimPaceToSeries(inp.swimRows);
  const swimState = computeSwimState(swimSeries, asOf, spw.swim, dropped);
  const swim = perfFromTrend(swimState.trend);

  // strength
  const liftSeries = liftSeriesFromExerciseLog(inp.exerciseRows);
  const strength = computeStrengthState(liftSeries, asOf, spw.strength);

  const perfByDisc: Record<string, PerfSummary | null> = {
    strength: { verdict: strength.overall, pctChange: strength.overallPctChange },
    bike,
    run,
    swim,
  };

  // Per-discipline confidence (provisional = near-floor n or clustered/short span — the same gate
  // the bike signals use). Carried into the cache so the coach FACT can frame a provisional trend
  // as a signal-to-confirm, not a confident verdict. Strength: provisional if the primary lifts
  // driving the verdict are few (<2) or themselves provisional.
  const strengthPrimaries = strength.lifts.filter((l) => l.isPrimary && l.trend.verdict !== 'needs_data');
  const provisionalByDisc: Record<string, boolean> = {
    strength: strengthPrimaries.length > 0 && (strengthPrimaries.length < 2 || strengthPrimaries.some((l) => isProvisionalTrend(l.trend))),
    bike: bikeFitness.power.verdict !== 'needs_data' ? bikeFitness.power.provisional : bikeFitness.efficiency.provisional,
    run: isProvisionalTrend(runState.trend),
    swim: isProvisionalTrend(swimState.trend),
  };

  const cards: DisciplineCard[] = ORDER.map((k) =>
    resolveDisciplineCard({
      discipline: k,
      performance: perfByDisc[k],
      adherence: computeAdherenceState({
        discipline: k,
        windowDays: ADHERENCE_WINDOW_DAYS,
        planned: inp.plannedBy[k] || 0,
        completed: inp.doneBy[k] || 0,
      }),
    }),
  );

  return { cards, headline: synthesizeHeadline(cards), bikeFitness, perfByDisc, provisionalByDisc, spw };
}

// ---- cache shape: athlete_snapshot.state_trends_v1 ----
export interface DisciplineTrendCache { verdict: string; pctChange: number | null; provisional: boolean }
export interface StateTrendsV1 {
  as_of: string;
  version: 1;
  strength: DisciplineTrendCache;
  run: DisciplineTrendCache;
  swim: DisciplineTrendCache;
  bike: DisciplineTrendCache & {
    power: { verdict: string; pctChange: number | null; provisional: boolean; basis: string | null };
    efficiency: { verdict: string; pctChange: number | null; provisional: boolean; basis: string | null };
    basis: string | null;
  };
}

export type FitnessDirection = 'improving' | 'stable' | 'declining' | 'mixed';

/** Roll the per-discipline spine verdicts up to the coach's single fitness_direction. The coach
 *  DESCRIBES this; it no longer re-derives fitness its own way (the Step-2 narrative→spine lesson,
 *  one level up). Only disciplines with a real verdict count (needs_data is ignored, not asserted
 *  as a direction). Mixed = genuinely both ways; stable = no detected change OR no signal at all
 *  (matches the prior derivation's catch-all default, so the cold-start contract is unchanged). */
export function rollupFitnessDirection(v1: StateTrendsV1 | null | undefined): FitnessDirection {
  if (!v1) return 'stable';
  const verdicts = [v1.strength?.verdict, v1.bike?.verdict, v1.run?.verdict, v1.swim?.verdict]
    .filter((x) => x && x !== 'needs_data');
  if (verdicts.length === 0) return 'stable';
  const hasImp = verdicts.includes('improving');
  const hasSld = verdicts.includes('sliding');
  if (hasImp && hasSld) return 'mixed';
  if (hasImp) return 'improving';
  if (hasSld) return 'declining';
  return 'stable'; // only holding
}

/** Shape the assembled result into the cached contract. Per-discipline = the model's performance
 *  verdict (needs_data when no real trend), independent of the card's display axis. */
export function toStateTrendsV1(r: StateTrendResult, asOf: string): StateTrendsV1 {
  const disc = (k: string): DisciplineTrendCache => {
    const p = r.perfByDisc[k];
    return { verdict: p?.verdict ?? 'needs_data', pctChange: p?.pctChange ?? null, provisional: !!r.provisionalByDisc[k] };
  };
  return {
    as_of: asOf,
    version: 1,
    strength: disc('strength'),
    run: disc('run'),
    swim: disc('swim'),
    bike: {
      ...disc('bike'),
      power: { ...r.bikeFitness.power },
      efficiency: { ...r.bikeFitness.efficiency },
      basis: r.bikeFitness.efficiency.basis,
    },
  };
}
