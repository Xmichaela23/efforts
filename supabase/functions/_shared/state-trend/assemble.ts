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
import { computeStrengthState, strengthVolumeToSeries, computeStrengthVolumeState, type LiftSeries, type StrengthFitness, type StrengthPerLift, type StrengthVolumeRow } from './strength.ts';
import { computeBikeFitness, isProvisionalTrend, type BikeFitness } from './bike-fitness.ts';
import { computeRunState, routeMetricsToSeries, computeRunEfficiencyState, efficiencyIndexToSeries, decouplingToSeries, computeRunDecouplingState, type RunFitness } from './run.ts';
import { computeSwimState, swimPaceToSeries, computeSwimRestState, swimRestToSeries } from './swim.ts';
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
  strengthVolumeRows?: StrengthVolumeRow[]; // per-strength-workout total_volume_lbs (the volume trend)
  bikeRows: Array<{ date: string; classified_type: string | null; w20: number | null; hr_at_band: number | null; band_source: string | null; hr_corrupt?: boolean }>;
  runJoined: Array<{ metric_date: string; effort_adjusted_pace_sec_per_km: number | null; efficiency_index?: number | null; decoupling_pct?: number | null; decoupling_basis?: string | null; decoupling_confounded?: boolean | null; workout_type?: string | null; duration_minutes?: number | null; classified_type: string | null }>;
  swimRows: Array<{ date: string; pace_per_100m: number; rest_fraction?: number | null; distance_m?: number | null }>;
  plannedBy: Record<string, number>; // this-week planned counts per discipline
  doneBy: Record<string, number>; // this-week completed counts per discipline
  cadenceCounts: Record<string, number>; // 90d completed counts per discipline
}

export interface StateTrendResult {
  cards: DisciplineCard[];
  headline: Headline | null;
  bikeFitness: BikeFitness;
  /** Tier 1: RUN dual read — decoupling (aerobic durability) LEAD + efficiency_index SECONDARY. */
  runFitness: RunFitness;
  /** STRENGTH dual read — volume direction LEAD + e1RM direction SECONDARY (null when thin) + sessions. */
  strengthFitness: StrengthFitness;
  perfByDisc: Record<string, PerfSummary | null>;
  provisionalByDisc: Record<string, boolean>;
  spw: Record<string, number>;
  /** D-194: swim rest-fraction trend (secondary swim signal, nested under swim in the cache). */
  swimRest: PerfSummary | null;
  swimRestProvisional: boolean;
  /** S2: per-discipline 90d session counts (the card sort key) — carried so the cached DISPLAY contract
   *  is self-contained and the client no longer needs the raw cadence rows to render. */
  cadenceCounts: Record<string, number>;
}

/** The assembly. Mirrors useStateTrends' body — one code path for client + server. */
export function assembleStateTrends(inp: StateTrendInputs): StateTrendResult {
  const { asOf } = inp;

  // per-discipline cadence (sessions/week over 90d)
  const WEEKS_90D = STATE_TREND_WINDOWS.cadenceDays / 7;
  const spw: Record<string, number> = {};
  for (const k of ORDER) spw[k] = (inp.cadenceCounts[k] || 0) / WEEKS_90D;

  // bike — terrain-binned power + HR-at-power efficiency (Step 3 engine)
  // Power keeps every ride (w20 is HR-independent). Efficiency (HR-at-power) EXCLUDES rides whose
  // HR was rejected as corrupt (D-237 — flaky strap / cadence-lock would poison the reference-band
  // mean HR). The flag is set on the workout by compute-facts's HR-plausibility filter.
  const binRides = inp.bikeRows.map((r) => ({ date: r.date, classified_type: r.classified_type, w20: r.w20 }));
  const hrPts = inp.bikeRows
    .filter((r) => Number(r.hr_at_band) > 0 && !r.hr_corrupt)
    .map((r) => ({ date: r.date, value: Number(r.hr_at_band) }));
  const bikeFitness = computeBikeFitness(binRides, hrPts, asOf, spw.bike);
  bikeFitness.efficiency.basis = inp.bikeRows.map((r) => r.band_source).find((s) => s) ?? null;
  const bikeLead = bikeFitness.power.verdict !== 'needs_data' ? bikeFitness.power : bikeFitness.efficiency;
  const bike: PerfSummary | null = bikeLead.verdict !== 'needs_data'
    ? { verdict: bikeLead.verdict, pctChange: bikeLead.pctChange, sampleCount: bikeLead.sampleCount, newestAgeDays: bikeLead.newestAgeDays, windowDays: bikeLead.windowDays }
    : null;

  // run — the GAP-pace trend only counts COMPARABLE-EASY runs (run.ts COMPARABLE_RUN_EFFORT),
  // so the min-session floor must scale off the athlete's EASY-run cadence, not total-run cadence
  // (D-237 / the 2026-07-03 run-row bug: 24 total runs → floor 4, but only 3 easy-GAP points →
  // permanent "needs data"). `inp.runJoined` spans the 90d cadence window; routeMetricsToSeries
  // filters to comparable-easy + valid-GAP, so its length IS the 90d comparable-run count. classifyTrend
  // still windows the trend itself to runDays (42d) internally, so widening the fetch changes only the
  // cadence denominator, not the trend.
  // Tier 1: the RUN card is a DUAL read (mirrors BikeFitness power+efficiency) — DECOUPLING (aerobic
  // durability, zone-free, no distance confound) LEADS and drives the card verdict; efficiency_index
  // is the SECONDARY output-per-heartbeat read. GAP pace was dropped in Q-110. Cadence floor scales
  // off the steady-run (decoupling) pool.
  const runDecoupSeries = decouplingToSeries(inp.runJoined);
  const runSteadyCadence = runDecoupSeries.length / WEEKS_90D;
  const runDecoupling = computeRunDecouplingState(runDecoupSeries, asOf, runSteadyCadence);
  const runEffSeries = efficiencyIndexToSeries(inp.runJoined);
  const runEfficiency = computeRunEfficiencyState(runEffSeries, asOf, runEffSeries.length / WEEKS_90D);
  const runState = runDecoupling; // decoupling drives the provisional flag below
  // Card verdict = decoupling (the lead). pctChange is NULLED: decoupling's trend runs on offset
  // values, so its pctChange isn't a meaningful run % — the real band/pct live in runFitness. This
  // keeps the offset number out of the cached state_trends_v1 (coach never sees a bogus run %).
  const run = perfFromTrend(runDecoupling.trend)!; // trend is always present; card verdict = decoupling (lead)
  run.pctChange = null; // null the offset % (decoupling's trend runs on offset values); verdict stays honest
  const runFitness: RunFitness = {
    decoupling: {
      verdict: runDecoupling.trend.verdict,
      band: runDecoupling.band,
      recentPct: runDecoupling.recentPct,
      sampleCount: runDecoupling.trend.sampleCount,
      newestAgeDays: runDecoupling.trend.newestAgeDays,
      stale: runDecoupling.trend.stale,
      provisional: isProvisionalTrend(runDecoupling.trend),
    },
    efficiency: {
      verdict: runEfficiency.trend.verdict,
      pctChange: runEfficiency.trend.pctChange,
      sampleCount: runEfficiency.trend.sampleCount,
      newestAgeDays: runEfficiency.trend.newestAgeDays,
    },
  };

  // swim
  const { series: swimSeries, dropped } = swimPaceToSeries(inp.swimRows);
  const swimState = computeSwimState(swimSeries, asOf, spw.swim, dropped);
  const swim = perfFromTrend(swimState.trend);

  // swim rest fraction (D-194) — comparable-distance filtered; Q-061 contamination excluded upstream
  const { series: swimRestSeries, dropped: restOob } = swimRestToSeries(inp.swimRows);
  const swimRestState = computeSwimRestState(swimRestSeries, asOf, spw.swim, restOob);
  const swimRest = perfFromTrend(swimRestState.trend);

  // strength — DUAL read: VOLUME direction (activity/load fact) leads, e1RM direction is the secondary
  // fitness read, session count is the receipt. e1RM is NULL when there's no trend to hold (drop the
  // clause, don't assert "holding"). Volume gives the row a real verdict so it no longer falls to the
  // adherence "needs data · N unplanned" shrug — unplanned demotes to a dim receipt.
  const liftSeries = liftSeriesFromExerciseLog(inp.exerciseRows);
  const strength = computeStrengthState(liftSeries, asOf, spw.strength);
  const strengthVolTrend = computeStrengthVolumeState(strengthVolumeToSeries(inp.strengthVolumeRows), asOf, spw.strength);
  // Per-lift direction the aggregate rolls up FROM — persisted so the coach reads one direction (D-270).
  // points are sorted ascending by date (liftSeriesFromExerciseLog), so the last point is the latest e1RM.
  const liftLatest = new Map(liftSeries.map((s) => [s.canonical, s.points.length ? s.points[s.points.length - 1].value : null]));
  const strengthPerLift: StrengthPerLift[] = strength.lifts.map((l) => ({
    canonical: l.canonical,
    displayName: l.displayName,
    isPrimary: l.isPrimary,
    direction: l.trend.verdict,
    pctChange: l.trend.pctChange,
    latestE1rm: liftLatest.get(l.canonical) ?? null,
    sampleCount: l.trend.sampleCount,
    newestAgeDays: l.trend.newestAgeDays,
    provisional: isProvisionalTrend(l.trend),
  }));
  const strengthFitness: StrengthFitness = {
    volume: {
      verdict: strengthVolTrend.verdict, pctChange: strengthVolTrend.pctChange,
      sampleCount: strengthVolTrend.sampleCount, newestAgeDays: strengthVolTrend.newestAgeDays,
      provisional: isProvisionalTrend(strengthVolTrend),
    },
    e1rm: strength.overall !== 'needs_data' ? { verdict: strength.overall, pctChange: strength.overallPctChange } : null,
    perLift: strengthPerLift,
    sessionsThisWeek: inp.doneBy['strength'] || 0,
    unplanned: Math.max(0, (inp.doneBy['strength'] || 0) - (inp.plannedBy['strength'] || 0)),
  };

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

  return {
    cards, headline: synthesizeHeadline(cards), bikeFitness, runFitness, strengthFitness, perfByDisc, provisionalByDisc, spw,
    swimRest, swimRestProvisional: isProvisionalTrend(swimRestState.trend),
    cadenceCounts: inp.cadenceCounts,
  };
}

// ---- cache shape: athlete_snapshot.state_trends_v1 ----
export interface DisciplineTrendCache {
  verdict: string;
  pctChange: number | null;
  provisional: boolean;
  /** D-232 glass-box receipt evidence — part of the spine's cached truth. Optional for back-compat. */
  sampleCount?: number;
  newestAgeDays?: number | null;
  windowDays?: number;
  /** true = needs_data is a staleness decay (enough samples, too old), not too-few. */
  stale?: boolean;
  /** cadence-scaled too-few floor, so the receipt cites "need N" honestly (not a default 3). */
  minSessions?: number;
}
/** S2: the full server-computed State DISPLAY contract — everything `useStateTrends` used to assemble
 *  in the browser, cached so the client RENDERS it and computes nothing (retires the ~9 in-browser
 *  queries + live assembleStateTrends). Mirrors the hook's return minus `headline` (no consumer). The
 *  coach forwards this on `weekly_state_v1`; the client reads it. Optional for back-compat (a snapshot
 *  written before this deploy has no `display` → the client falls back to the legacy live path). */
export interface StateDisplayV1 {
  cards: DisciplineCard[];
  bikeFitness: BikeFitness;
  runFitness: RunFitness;
  strengthFitness: StrengthFitness;
  swimRest: PerfSummary | null;
  cadenceCounts: Record<string, number>;
}

export interface StateTrendsV1 {
  as_of: string;
  version: 1;
  /** S2: the pre-assembled display contract (see StateDisplayV1). Server-authored, client-rendered. */
  display?: StateDisplayV1;
  /** STRENGTH dual on the spine — volume direction LEAD + e1RM SECONDARY (null when thin) + sessions,
   *  so coach/Arc/LLM read the composite, not just the e1RM verdict. */
  strength: DisciplineTrendCache & {
    volume: { verdict: string; pctChange: number | null; sampleCount: number; newestAgeDays: number | null; provisional: boolean };
    e1rm: { verdict: string; pctChange: number | null } | null;
    /** D-270: per-lift e1RM direction — the single authority the coach per-lift row reads (kills the
     *  dead `previous_e1rm` re-derivation, Q-107 H2). Empty when no lift has ≥2 logged sessions. */
    per_lift: StrengthPerLift[];
    sessions_this_week: number;
  };
  /** Tier 1: run's dual read cached on the spine like bike's — decoupling (aerobic durability) LEAD
   *  with its Friel band + recent %, efficiency_index SECONDARY. Lets coach/Arc/LLM narrate the band
   *  ("building aerobic base"), not just the improving/sliding direction the base verdict carries. */
  run: DisciplineTrendCache & {
    decoupling: { verdict: string; band: string | null; recentPct: number | null; provisional: boolean; stale: boolean; newestAgeDays: number | null; sampleCount: number };
    efficiency: { verdict: string; pctChange: number | null; sampleCount: number; newestAgeDays: number | null };
  };
  /** D-194: `rest` = the rest-fraction (work:rest) trend, nested like bike's power/efficiency. */
  swim: DisciplineTrendCache & { rest: DisciplineTrendCache };
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
    return {
      verdict: p?.verdict ?? 'needs_data',
      pctChange: p?.pctChange ?? null,
      provisional: !!r.provisionalByDisc[k],
      sampleCount: p?.sampleCount,
      newestAgeDays: p?.newestAgeDays,
      windowDays: p?.windowDays,
      stale: p?.stale,
      minSessions: p?.minSessions,
    };
  };
  return {
    as_of: asOf,
    version: 1,
    // S2: the client-ready display contract, built once here on the server (compute-snapshot) and
    // cached, so the State screen renders it verbatim instead of re-running this assembly in the browser.
    display: {
      cards: r.cards,
      bikeFitness: r.bikeFitness,
      runFitness: r.runFitness,
      strengthFitness: r.strengthFitness,
      swimRest: r.swimRest,
      cadenceCounts: r.cadenceCounts,
    },
    strength: {
      ...disc('strength'),
      volume: { ...r.strengthFitness.volume },
      e1rm: r.strengthFitness.e1rm,
      per_lift: r.strengthFitness.perLift,
      sessions_this_week: r.strengthFitness.sessionsThisWeek,
    },
    // Tier 1: run's dual read on the spine — decoupling LEAD (band + recent %) + efficiency SECONDARY,
    // mirroring bike's power/efficiency below, so the app KNOWS the durability band, not just direction.
    run: {
      ...disc('run'),
      decoupling: { ...r.runFitness.decoupling },
      efficiency: { ...r.runFitness.efficiency },
    },
    swim: {
      ...disc('swim'),
      rest: {
        verdict: r.swimRest?.verdict ?? 'needs_data',
        pctChange: r.swimRest?.pctChange ?? null,
        provisional: !!r.swimRestProvisional,
      },
    },
    bike: {
      ...disc('bike'),
      power: { ...r.bikeFitness.power },
      efficiency: { ...r.bikeFitness.efficiency },
      basis: r.bikeFitness.efficiency.basis,
    },
  };
}
