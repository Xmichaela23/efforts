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
import { computeStrengthState, strengthVolumeToSeries, computeStrengthVolumeState, computeE1rmBand, type LiftSeries, type PullupProgress, type StrengthFitness, type StrengthPerLift, type StrengthVolumeRow } from './strength.ts';
import { computeBikeFitness, isProvisionalTrend, bikeEfficiencyRideEligible, bikePowerChartSeries, type BikeFitness } from './bike-fitness.ts';
import { computeRunState, routeMetricsToSeries, computeRunEfficiencyState, efficiencyIndexToSeries, recentEfficiencyPaceHr, decouplingToSeries, computeRunDecouplingState, type RunFitness } from './run.ts';
import { positionInRange, placeAnchorOnBand } from './position-in-range.ts';
// [Step 7] The ONE list of lifts that carry a tracked max — shared with the client renderer so the
// emitted series and the drawn sparkline cannot disagree about which four. Path precedent:
// `_shared/response-model/weekly.ts` imports `src/lib/` the same way (bundled at deploy time).
import { isTrackedMaxLift } from '../../../../src/lib/tracked-max-lifts.ts';
import { trustedMaxReps, estimateIsTrusted } from '../../../../src/lib/estimate-1rm.ts';
import { CROWN_MIN_DECOUPLING } from './baseline-derive.ts';
import { computeSwimState, swimPaceToSeries, computeSwimRestState, swimRestToSeries } from './swim.ts';
import { computeAdherenceState } from './adherence.ts';
import { resolveDisciplineCard, perfFromTrend, type DisciplineCard, type PerfSummary } from './discipline.ts';
import { readPosture, postureSentence, disciplineWord, type PerDisciplinePosture } from './posture.ts';
import { synthesizeHeadline, type Headline } from './headline.ts';
import { canonicalDisplayName } from '../canonicalize.ts';
// ⛔ The workout screen's engine. D-346: State reads THIS, it does not mint its own run verdict.
import { routeTrend, type RouteTrend } from '../heat-adjust.ts';
import { computeEfficiencyIndex } from '../efficiency-index.ts';
import { ADHERENCE_WINDOW_DAYS } from './thresholds.ts';

const DAY = 86_400_000;
export const ORDER = ['strength', 'bike', 'run', 'swim'] as const;

/** SLICE 1 anchoring mode for a fitness row (Michael 2026-07-16):
 *  - `anchored`   → a real baseline of the athlete's own exists → render the DOT (position) + arrow.
 *  - `trend_only` → metric trends but has NO anchor → render the ARROW only + "no baseline set". No dot.
 *  - `facts_only` → no trend-qualified metric (swim today) → neutral facts. */
export type FitnessMode = 'anchored' | 'trend_only' | 'facts_only';

/** The ACTIVE fitness baseline for a discipline (from the fitness_baselines table), reduced to what the
 *  spine needs to render the anchor. provisional = auto-derived; confirmed = the athlete's deliberate pick. */
export interface ActiveFitnessBaseline {
  value: number; metric: string; lowerIsBetter: boolean;
  sourceLabel: string; sourceDate: string | null; sourceEventId: string | null;
  status: 'provisional' | 'confirmed';
}

/** The rendered anchor for a row: where its tick sits on the band + the label. `tickPct` is null when the
 *  anchor can't be placed on this band (metric mismatch — e.g. bike FTP vs an efficiency band, this pass). */
export interface FitnessAnchor {
  tickPct: number | null;
  overflow: 'better' | 'worse' | null;
  status: 'provisional' | 'confirmed';
  label: string;   // "auto · steady run · Jan 15" (provisional) | "steady run · Jan 15" (confirmed — no "auto")
  // ⛔ THE ANCHOR NOW CARRIES ITS OWN NUMBER (2026-08-01, Michael: "every piece needs to know
  // everything"). It always HAD one — `ActiveFitnessBaseline.value` is what the tick is placed from —
  // but this object existed only to answer "where does the tick go", so for any row whose tick could
  // not be placed (bike, swim: metric mismatch) the value was computed and then dropped one line
  // later. Nothing had hidden it; nothing had asked for it.
  // ⚠️ THIS IS THE NUMBER THE ROW'S READ WAS ACTUALLY COMPUTED AGAINST. That is the whole point of
  // carrying it rather than letting a surface resolve its own: a client-resolved FTP is *probably*
  // the same number, and "probably the same" is what the FTP-fracture work existed to remove.
  value: number | null;
  metric: string | null;   // 'ftp' | 'decoupling' | … — the unit the value is in
}

/** Format the anchor label: provisional gets the "auto ·" prefix; confirmed (any human touch) never does. */
function anchorLabel(b: ActiveFitnessBaseline): string {
  const date = b.sourceDate
    ? new Date(b.sourceDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    : null;
  const tail = [b.sourceLabel, date].filter(Boolean).join(' · ');
  return b.status === 'provisional' ? `auto · ${tail}` : tail;
}

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
  // ⟳ ROLLING ANCHOR (2026-07-17 — DECISION REVERSAL of the 24wk "established level" horizon below).
  // The anchor now tracks CURRENT capacity, Garmin-style: it follows the athlete DOWN as well as up. It
  // shares the band's RECENT window instead of reaching back into deep history, so run/swim derivation
  // uses `cadenceDays` (~12wk, the same window the band's run series is fetched over) — one window per
  // axis, no separate horizon. RATIONALE: the long-memory model produced a months-old "below your
  // established level" scold (a Feb 0.5% run anchoring a July screen). We deliberately GIVE UP the
  // tick-reaches-past-the-band property; retained differentiators are event citation, crown-from-N
  // corroboration, the audit trail, and a DESCENT that arrives with an explanation (the composer's anchor-
  // descent candidate), not a scold. `baselineWindowDays` (24wk) is retired — the derivation reads
  // cadenceDays now. Kept below only as a dated record of the superseded decision.
  baselineWindowDays: 168, // ⟳ SUPERSEDED 2026-07-17 — no longer read; the anchor rolls on cadenceDays. See the note above.
  // NEW RULE (2026-07-16, not inherited): the minimum qualifying steady runs IN THE TREND WINDOW to ASSERT
  // a durability direction. Below it, the direction is 'withheld' (stated as a count, no claim) — a handful
  // of runs can't earn "improving" (nor "holding"). Data-sufficiency only, never plan-adherence. 8 ≈ ~1.3
  // steady runs/wk over the 6wk window — enough that the early/recent 2-run endpoint averages aren't the
  // whole series. Judgment call; calibrate with real data, don't tune to one athlete.
  runDirectionMinRuns: 8,
  // The bike half of the same rule (2026-08-01, Michael: "we can just say that when someone drops a
  // discipline, as long as the engine is right for when they pick back up"). Below this many qualifying
  // rides IN THE WINDOW the bike direction is 'withheld' — the row says "too few to read" instead of
  // stepping straight from silence to a confident arrow, which is what it did before.
  //
  // ⛔ 8 IS DERIVED, NOT FELT. The literature, and the arithmetic it forces (Q-241, D-359):
  //   · A 20-min cycling TT re-tested a week apart has a CV of ~2.9% in trained, familiarised cyclists
  //     (Nimmerichter/Sparks-type protocols, IJSPP 2019 n=8: TEM 4.6 W, ICC 0.99; a second n=25 study:
  //     CV 2.9%, ICC 0.97). Our substrate is NOT that: it is the best 20-min inside an ordinary ride,
  //     so pacing, motivation, drafting, heat and terrain all sit ON TOP of that number. ~3% is the
  //     OPTIMISTIC typical error here, not the expected one.
  //   · Hopkins: the typical error of a MEAN falls with √n. The verdict compares the mean of the 2
  //     oldest points to the mean of the 2 newest, so the error on that comparison is TE × √(2/n) per end.
  //   · At TE 3%: n=2 per end → ±3.0% on the comparison, which is WIDER THAN THE ENTIRE ±2.0% verdict
  //     band. n=3 → ±2.45%. n=4 → ±2.12%, the first point where a band-clearing move is at least the
  //     size of its own measurement error. 4 per end × 2 ends = 8.
  //   · It lands on run's 8 from a completely different direction, which is a check, not a coincidence.
  //   · Coaching practice agrees at the other end: FTP is re-tested every 4-8 weeks because a threshold
  //     change needs a BLOCK to appear. 8 rides across the 56d window ≈ 1/wk in that bin — the minimum
  //     training density at which a coach would entertain "your threshold moved" at all.
  // What the field does NOT give us is a published count: Strava and TrainingPeaks draw a curve and never
  // assert a direction (nothing to gate), and Garmin gates on RECENCY and qualifying activity — 1-2 weeks
  // of history with ~2 qualifying sessions a week, else "No Status". We already have Garmin's half (the
  // 21d staleness decay). The count is ours because the CLAIM is ours.
  // ⚠️ The number that is still soft is the ±2.0% band itself, not this floor — it sits at or below the
  // measurement error of the substrate. That is now the honest next question, and it is filed, not fixed.
  bikeDirectionMinRides: 8,
};

// Pure asOf-relative window boundary (mirrors classify.ts's isoMinusDays; kept local to avoid a cycle).
function isoMinusDaysPure(iso: string, days: number): string {
  return new Date(Date.parse(iso + 'T12:00:00Z') - days * DAY).toISOString().slice(0, 10);
}

// ── SWIM VOLUME FACTS (Garmin/Strava parity) ────────────────────────────────────────────────
// Swim is the one discipline we DESCRIBE, not grade. A pace-based swim fitness dot is dishonest for
// this athlete — fins/paddles/set-type corrupt pace and equipment capture is spotty — and the field
// (TrainingPeaks/Swim Smooth/Garmin) benchmarks swim off a clean CSS test, not a rolling daily-pace
// trend. So the swim row shows what fins CANNOT corrupt: how many swims, total distance, longest swim.
// Distance is honest regardless of equipment. No dot, no arrow, no verdict — facts only.
export interface SwimVolume { swims: number; totalDistanceM: number; longestM: number; windowDays: number; }
export function swimVolumeFacts(
  rows: Array<{ date?: string; distance_m?: number | null }> | null | undefined,
  asOf: string,
  windowDays: number,
): SwimVolume {
  const start = isoMinusDaysPure(asOf, windowDays);
  const dists: number[] = [];
  for (const r of rows || []) {
    const d = Number(r?.distance_m);
    if (!r?.date || !(d > 0)) continue;
    if (r.date > start && r.date <= asOf) dists.push(d);
  }
  return {
    swims: dists.length,
    totalDistanceM: Math.round(dists.reduce((a, b) => a + b, 0)),
    longestM: dists.length ? Math.round(Math.max(...dists)) : 0,
    windowDays,
  };
}

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
export interface ExerciseLogLite { date: string; canonical_name: string; exercise_name?: string | null; estimated_1rm: number | null; reps?: number | null }
/** D-338 — what the PLAN was asking for on each dated point, resolved once by the caller off the
 *  single plan-phase resolver. `phaseByDate` carries the raw phase name lowercased ('deload',
 *  'leader', 'anchor', 'build'…); `measuredDates` are the days an all-out set was actually
 *  performed. Both optional: absent → points carry no meta → exactly today's behaviour. */
export interface LiftSeriesContext {
  phaseByDate?: Record<string, string> | null;
  measuredDates?: string[] | null;
}
/**
 * ⛔ THE ALL-TIME e1RM RECORD — per lift, TRUSTED SETS ONLY (D-417, applied here 2026-08-12).
 *
 * ⚠️ WHY THIS LIVES BESIDE `liftSeriesFromExerciseLog` AND NOT IN THE CALLER. These are the two reads
 * of `exercise_log` that produce a strength NUMBER, and they must gate identically. They did not: D-417
 * gated the SERIES and left the RECORD ungated, in an inline reduce inside `compute-snapshot` whose
 * query did not even select `best_reps` — so it structurally could not apply the rule. The result was on
 * screen: Michael's deadlift "best" read **225**, the 105 lb × 35 set — the exact number D-417 was
 * written to kill — sitting above the 120-150 trusted range printed beside it. Side by side, the shared
 * gate is visible; split across files, one of them silently rotted.
 *
 * THE RULE, unchanged and NOT re-derived: a set's estimate is a strength reading only at or under the
 * lift's rep ceiling (`estimateIsTrusted` — deadlift 5, else 8; provenance in `estimate-1rm.ts`).
 *
 * ⚠️ UNKNOWN REPS FAIL OPEN, exactly as the series does — an older row written before `best_reps` was
 * threaded is KEPT rather than blanking a real record. The two reads therefore see the same population.
 *
 * ⚠️ `count` IS GATED TOO, and that is deliberate. It is the confidence gate on the PR claim
 * (`isPr` needs ≥3 all-history readings behind the best); counting sets that can never produce a max
 * would let a lift with twenty rep-out sets and one real set claim a record on "history" it doesn't
 * have. Consequence, stated: a lift whose trusted history is thinner than 3 loses its PR badge — which
 * is the honest read, not a regression.
 *
 * ⛔ THE HIGH-REP SET IS NOT DISCARDED — it is a REP PR (`lastAllOut` / `isRepRecord`, D-420 pillar 2),
 * which is its correct home. Only the e1RM record stops reading it.
 */
export function buildAllTimeBestByLift(
  rows: Array<{ canonical_name?: string | null; estimated_1rm?: number | null; best_reps?: number | null }>,
): Record<string, { best: number; count: number }> {
  const out: Record<string, { best: number; count: number }> = {};
  for (const e of Array.isArray(rows) ? rows : []) {
    const k = e?.canonical_name;
    const v = Number(e?.estimated_1rm);
    if (!k || !Number.isFinite(v) || v <= 0) continue;
    // Fail-open on unknown reps (mirrors the series gate at `liftSeriesFromExerciseLog`).
    if (e.best_reps != null && !estimateIsTrusted(k, e.best_reps)) continue;
    const cur = out[k];
    out[k] = cur ? { best: Math.max(cur.best, v), count: cur.count + 1 } : { best: v, count: 1 };
  }
  return out;
}

export function liftSeriesFromExerciseLog(rows: ExerciseLogLite[], ctx?: LiftSeriesContext): LiftSeries[] {
  const byCanonical = new Map<string, ExerciseLogLite[]>();
  for (const e of rows) {
    if ((e.estimated_1rm ?? 0) <= 0) continue;
    // D-417: a set past the trusted rep ceiling (8 reps, 5 on deadlift) inflates its estimate — the
    // formula only holds to ~10 reps — so it does NOT count toward the e1RM series that feeds the
    // records / trend / summary number / sparkline. The set still shows per-set in the "logged sets"
    // history; it just cannot mint a max. reps unknown (rows written before the column was threaded) →
    // kept, so we never blank real data. Matches the strength-world rule: a 1RM comes from a low-rep set.
    if (e.reps != null && e.reps > trustedMaxReps(e.canonical_name)) continue;
    const arr = byCanonical.get(e.canonical_name) ?? [];
    arr.push(e);
    byCanonical.set(e.canonical_name, arr);
  }
  // D-338: the plan's own answer for each date. `isDeloadWeek` reads `meta.phase`; without this the
  // points carried no meta at all, so the exclusion wired into computeStrengthState never once fired.
  const phaseByDate = ctx?.phaseByDate ?? null;
  const measured = new Set(ctx?.measuredDates ?? []);
  return [...byCanonical.entries()]
    .filter(([, rs]) => rs.length >= 2)
    .map(([canonical, rs]) => {
      const sorted = [...rs].sort((a, b) => a.date.localeCompare(b.date));
      return {
        canonical,
        // Clean canonical label (not whichever raw name was logged first) — one lift, one name,
        // even when it was logged under several variations. See canonicalDisplayName.
        displayName: canonicalDisplayName(canonical),
        points: sorted.map((r) => {
          const phase = phaseByDate?.[r.date] ?? null;
          const isMeasured = measured.has(r.date);
          // Meta is OMITTED entirely when there is nothing to say, so a series built without
          // context is byte-identical to the one this function returned before.
          return (phase || isMeasured)
            ? { date: r.date, value: r.estimated_1rm!, meta: { ...(phase ? { phase } : {}), ...(isMeasured ? { measured: true } : {}) } }
            : { date: r.date, value: r.estimated_1rm! };
        }),
      };
    })
    .sort((a, b) => b.points.length - a.points.length);
}

// ---- raw inputs (each caller fetches with its own client, then flattens identically) ----
export interface StateTrendInputs {
  asOf: string;
  exerciseRows: ExerciseLogLite[]; // 12wk exercise_log
  strengthVolumeRows?: StrengthVolumeRow[]; // per-strength-workout total_volume_lbs (the volume trend)
  bikeRows: Array<{ date: string; classified_type: string | null; w20: number | null; hr_at_band: number | null; in_band_s?: number | null; band_hi?: number | null; band_source: string | null; hr_corrupt?: boolean }>;
  /** Every run with a grade-adjusted pace + HR, oldest first: `{date, pace_s_per_km, hr, temp_f}`.
   *  TrainingPeaks' Efficiency Factor substrate — terrain normalised by the grade adjustment rather
   *  than by matching routes. Empty → no verdict, and the old trend stands. */
  runEffHistory?: Array<Record<string, unknown>>;
  runJoined: Array<{ metric_date: string; effort_adjusted_pace_sec_per_km: number | null; efficiency_index?: number | null; gap_efficiency_index?: number | null; hr_avg?: number | null; decoupling_pct?: number | null; decoupling_basis?: string | null; decoupling_mixed_effort?: boolean | null; decoupling_confounded?: boolean | null; workout_type?: string | null; duration_minutes?: number | null; classified_type: string | null }>;
  swimRows: Array<{ date: string; pace_per_100m: number; rest_fraction?: number | null; distance_m?: number | null }>;
  plannedBy: Record<string, number>; // this-week planned counts per discipline
  doneBy: Record<string, number>; // this-week completed counts per discipline
  cadenceCounts: Record<string, number>; // 90d completed counts per discipline
  /** Q-179: the athlete's DECLARED intent per discipline (`goals.training_prefs.per_discipline_posture`).
   *  Optional and null-safe on purpose — an athlete who never declared one must see EXACTLY today's
   *  behaviour. See posture.ts for why this exists. */
  posture?: PerDisciplinePosture | null;
  /** Q-179 Tier 1: the DECLARED sessions/week per discipline (`run_days`, `strength_frequency`).
   *  The yardstick for "are you maintaining it?" — absent → the row stays silent rather than guess. */
  declaredSessionsPerWeek?: Partial<Record<string, number>> | null;
  /** State v3: baseline 1RM per PRIMARY_LIFTS canonical (squat/bench_press/deadlift/overhead_press) so
   *  the strength DOT reads current e1RM ÷ baseline (the honest frame). Absent → hedged 12wk fallback. */
  /** A REAL PR frame — best estimated 1RM across ALL logged history per canonical lift (NOT the 6wk
   *  window), + the all-history point count. Supplied by compute-snapshot's all-history query. Absent →
   *  the client cannot flag a PR (we don't invent records from 6 weeks). */
  allTimeBestByLift?: Record<string, { best: number; count: number }> | null;
  strengthBaselines?: Record<string, number> | null;
  /**
   * ⛔ THE PULL-UP PROGRESSION'S COUNTS, ALREADY SPLIT CLEAN-VS-ASSISTED BY THE CALLER.
   *
   * ⚠️ IT CANNOT BE DERIVED HERE, AND THAT IS THE WHOLE REASON IT IS AN INPUT. This function reads
   * `exercise_log` (`ExerciseLogLite`), whose columns are `best_reps` / `best_weight` /
   * `total_volume` — the aggregate has ALREADY THROWN THE ASSIST AWAY. There is no
   * `resistance_level` on that table, so a pull-up count taken from it cannot tell a clean rep from
   * a banded one, and reading it would reintroduce the exact inflation the progression exists to
   * prevent. The caller computes it from the RAW logged sets it already fetches.
   *
   * Absent/null → the row is simply not rendered. Opt-in, and no goal means no number.
   */
  pullupProgress?: PullupProgress | null;
  /** D-338: what the PLAN asked for on each dated point (raw phase name, lowercased), so a deload
   *  week can be excluded from the strength trend. Resolved by the caller off `plan-phase.ts`.
   *  Absent → no point carries a phase → nothing is excluded → today's behaviour exactly. */
  phaseByDate?: Record<string, string> | null;
  /** D-338: the days an all-out set was actually performed (`strength_facts.measured`). The one
   *  distinction the series has never had — a test week vs an ordinary Tuesday. */
  measuredDates?: string[] | null;
  /** Slice 2: EVERY all-out set per canonical lift, oldest first (`allOutSeriesByLift`,
   *  `_shared/strength/all-out-set.ts`). The substrate for the 5/3/1 progress direction — the rep
   *  record, not the waved working weight. Absent → every lift keeps the e1RM gauge. */
  allOutByLift?: Record<string, Array<{
    date: string; weight: number; reps: number; estimated_1rm: number;
    /** D-420: the rep-PR verdict, decided in `allOutSeriesByLift` against the sessions BEFORE it. */
    is_rep_record?: boolean; prior_best_reps_at_weight?: number | null;
  }>> | null;
  /** Slice 2: what the athlete's strength block declares it READS (`protocolEffortRead` off the
   *  plan's protocol). 'amrap' switches waved main lifts onto the all-out gauge; 'rir' / 'none' /
   *  absent keep today's behaviour exactly. */
  strengthEffortRead?: import('../strength-profiles.ts').EffortReadMode | null;
  /** Active auto/manual fitness baselines (fitness_baselines table), keyed by discipline (run/bike/swim).
   *  Presence → ANCHORED mode + the tick. Absent → the discipline falls to trend_only / facts_only. */
  fitnessBaselines?: Record<string, ActiveFitnessBaseline> | null;
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
  /** Swim VOLUME facts (count / total distance / longest) — the described-not-graded swim row. */
  swimVolume: SwimVolume;
  /** SLICE 1: per-discipline anchoring mode (anchored → dot; trend_only → arrow + "no baseline set"). */
  fitnessMode: Record<string, FitnessMode>;
  /** Per-discipline rendered anchor (tick position + "auto/confirmed · source · date" label). */
  fitnessAnchors: Record<string, FitnessAnchor>;
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
    // STEADY-AEROBIC ONLY: exclude climbing/threshold/sweet-spot/tempo (their in-band time is incidental,
    // HR dragged up by the overall effort) + require ≥10min in-band dwell. Without this the "aerobic
    // efficiency" trend reads ride-type MIX as fitness (the fabricated -5.5% "improving" — Q-117 #2).
    .filter((r) => bikeEfficiencyRideEligible(r.classified_type, r.in_band_s, r.w20, r.band_hi))
    .map((r) => ({ date: r.date, value: Number(r.hr_at_band) }));
  const bikeFitness = computeBikeFitness(binRides, hrPts, asOf, spw.bike, STATE_TREND_WINDOWS.bikeDirectionMinRides);
  bikeFitness.efficiency.basis = inp.bikeRows.map((r) => r.band_source).find((s) => s) ?? null;
  // 12-week POWER chart series — the w20 points of the winning terrain bin (the one the verdict reads), so
  // chart and word agree. Mirrors run efficiency / strength e1RM. Empty when power has no verdict (needs_data
  // → basis null → the bike row shows the efficiency read and no power chart). Uses the bike verdict window.
  bikeFitness.power.series = bikePowerChartSeries(binRides, asOf, bikeFitness.power.basis);
  // LEAD SELECTION — power leads UNLESS it cannot make a claim and efficiency can (Q-241, 2026-08-01).
  // Before the ride floor there was only one way for power to be silent (`needs_data`); now there are
  // two, and a `withheld` power read left un-handled here would have hidden a perfectly good efficiency
  // read behind "too few to read". Both signals still render their own state either way — this only
  // decides which one the dot and the summary are built from.
  // `computeBikeFitness` already decided this and put it on the payload as `lead` — read it, never
  // re-derive it. 'none' keeps power as the shape the dot/summary are built from, exactly as before.
  const bikeLeadIsPower = bikeFitness.lead !== 'efficiency';
  const bikeLead = bikeLeadIsPower ? bikeFitness.power : bikeFitness.efficiency;
  // State v3 DOT — the lead metric's position in the 12wk range, built from whichever signal led above
  // (one variable now, so the dot's series and the summary's verdict can never come from different
  // metrics). Power is higher-is-better (more watts = fitter); HR-at-power efficiency is lower-is-better
  // (less HR for the same power = fitter).
  const bikeBandSeries = bikeLeadIsPower
    ? binRides.map((r) => ({ date: r.date, value: Number(r.w20) })).filter((p) => Number.isFinite(p.value) && p.value > 0)
    : hrPts;
  bikeFitness.range = positionInRange(bikeBandSeries, { higherIsBetter: bikeLeadIsPower });
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
  // TREND uses the FULLER series (keeps sub-zero readings for slope) — untouched by Fix A.
  // VOLUME GATE: below runDirectionMinRuns qualifying runs in the window, the direction is 'withheld'.
  const runDecoupling = computeRunDecouplingState(runDecoupSeries, asOf, runSteadyCadence, STATE_TREND_WINDOWS.runDirectionMinRuns);
  const runEffSeries = efficiencyIndexToSeries(inp.runJoined);
  const runEfficiency = computeRunEfficiencyState(runEffSeries, asOf, runEffSeries.length / WEEKS_90D);
  // The "what" under the "why": recent steady-run pace + HR (pace-at-HR), derived from the SAME index the
  // verdict reads so the two lines can't disagree. STATE_TREND_WINDOWS.runDays = the efficiency window.
  const runEffPaceHr = recentEfficiencyPaceHr(inp.runJoined, asOf, STATE_TREND_WINDOWS.runDays);
  // 12-WEEK efficiency chart series (the "long view") — the SAME points the verdict reads, over a wider 84d
  // window than the verdict's 42d, so the recent tail of the chart IS the verdict's data (no contradiction
  // possible). Each point flagged `recent` when inside the 42d verdict window. Fills as the athlete trains.
  const CHART_WINDOW_DAYS = 84;
  const _chartStart = new Date(new Date(asOf + 'T12:00:00Z').getTime() - CHART_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const _verdictStart = new Date(new Date(asOf + 'T12:00:00Z').getTime() - STATE_TREND_WINDOWS.runDays * 86_400_000).toISOString().slice(0, 10);
  const effChartSeries = runEffSeries
    .filter((p) => p.date > _chartStart && p.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({ date: p.date, value: Math.round(p.value * 1000) / 1000, recent: p.date > _verdictStart }));
  const runState = runDecoupling; // decoupling drives the provisional flag below
  // Card verdict = decoupling (the lead). pctChange is NULLED: decoupling's trend runs on offset
  // values, so its pctChange isn't a meaningful run % — the real band/pct live in runFitness. This
  // keeps the offset number out of the cached state_trends_v1 (coach never sees a bogus run %).
  const run = perfFromTrend(runDecoupling.trend)!; // trend is always present; card verdict = decoupling (lead)
  run.pctChange = null; // null the offset % (decoupling's trend runs on offset values); verdict stays honest

  // State v3 dot-and-arrow: WHERE the current value sits in the athlete's own 12wk range (oriented so
  // 1 = best). Decoupling is lower-is-better, so a low value lands at the best edge — the dot shows the
  // LEVEL, the arrow shows the DIRECTION, and "needs work" (level) + "improving" (trend) stop fighting.
  // FIX A — ONE FLOOR PER AXIS: the BAND's coordinate frame (where the dot + tick sit) floors sub-zero
  // decoupling with the SAME crown constant, so the band's "stronger" edge isn't defined by a confounded
  // negative run (which left the tick pinned mid-band even for an excellent crown). Band placement ONLY —
  // the trend series above is untouched.
  const runDecoupBandSeries = runDecoupSeries.filter((p) => p.value >= CROWN_MIN_DECOUPLING);
  const runDecoupRange = positionInRange(runDecoupBandSeries, { higherIsBetter: false });
  // ⛔ TRAININGPEAKS' EFFICIENCY FACTOR, PLUS A HEAT COEFFICIENT FITTED TO THIS ATHLETE (D-346).
  //
  // `routeTrend` fits `efficiency ~ heat + time` JOINTLY (Huber-robust, CI-gated) — so the heat term is
  // LEARNED from the athlete's own hot-vs-cool runs, never assumed, and it declines to include heat at
  // all when the temperature spread cannot identify it. ⚠️ `routeHeadline` was used first; it removes
  // heat with `DEFAULT_HEAT_K`, a self-declared "unvalidated population placeholder". With a real pool
  // there is no reason to assume a coefficient we can fit.
  //
  // ⚠️ Non-fatal — a verdict that cannot be computed must never break the snapshot, and its absence
  // simply leaves the old trend in place.
  let runRoute: RouteTrend | null = null;
  try {
    const fitted = routeTrend((inp.runEffHistory ?? []) as any);
    // ⛔ A POPULATION CONSTANT MAY NOT REACH A VERDICT (Michael, 2026-07-31 — Q-231).
    //
    // Under `MIN_REGRESSION_N` (8) runs the joint fit cannot run and `heat-adjust` falls back to the
    // `linear_k` path, which corrects with `DEFAULT_HEAT_K` — self-declared in its own file as an
    // "UNVALIDATED POPULATION PLACEHOLDER". That is the whole point of fitting per athlete, so a
    // thin-data athlete gets NO verdict rather than one leaning on a number nobody validated.
    //
    // ⚠️ Nothing else is lost: the chart still fills as they train, and the row already has honest
    // copy for this state. ⛔ [Q-231] closes it properly — run the analysis pass over an imported
    // Strava history and a new athlete crosses the floor on day one with their OWN coefficient.
    runRoute = fitted && fitted.method !== 'linear_k' && fitted.method !== 'half_vs_half' ? fitted : null;
  } catch (e) {
    console.warn('[state-trend] run efficiency trend failed:', e instanceof Error ? e.message : e);
  }

  const runFitness: RunFitness = {
    decoupling: {
      verdict: runDecoupling.trend.verdict,
      band: runDecoupling.band,
      range: runDecoupRange,
      recentPct: runDecoupling.recentPct,
      sampleCount: runDecoupling.trend.sampleCount,
      newestAgeDays: runDecoupling.trend.newestAgeDays,
      stale: runDecoupling.trend.stale,
      provisional: isProvisionalTrend(runDecoupling.trend),
    },
    efficiency: {
      // ⛔ THE VERDICT IS THE ROUTE ENGINE'S WHEN IT HAS ONE (D-346, 2026-07-31).
      //
      // ⚠️ IT IS OVERRIDDEN **HERE**, ON `efficiency`, AND THAT PLACEMENT IS THE WHOLE FIX. An earlier
      // cut of this change set the card-level verdict instead — which is real, but `StatePerformanceSection`
      // renders `fitness.efficiency.verdict` and `fitness.efficiency.pctChange`. The row on the athlete's
      // screen would not have moved. **A fix landing where nothing reads is the fault this row has been
      // rebuilt fifteen times by; it must not be the fix for it.**
      //
      // ⛔ `still_learning` → `withheld`, NEVER `holding`. The engine is saying it cannot support a claim.
      // "Holding" is a finding; this is the absence of one, and swapping them is how a score starts to lie.
      // ⚠️ `pctChange` is nulled with it — a percentage beside "too few to read" is a claim in disguise.
      // ⚠️ NO ROUTE VERDICT → the old trend stands, so a treadmill athlete keeps their row.
      verdict: runRoute
        ? (runRoute.direction === 'improving' ? 'improving'
          : runRoute.direction === 'declining' ? 'sliding'
          : runRoute.direction === 'holding' ? 'holding'
          : 'withheld')
        : runEfficiency.trend.verdict,
      pctChange: runRoute
        ? (runRoute.direction === 'still_learning' ? null : runRoute.pct)
        : runEfficiency.trend.pctChange,
      sampleCount: runRoute ? runRoute.points : runEfficiency.trend.sampleCount,
      // ⚠️ THE RECENCY STAMP COMES FROM THE VERDICT'S POOL TOO. Left on the old trend it reported
      // "1d ago" off the polluted series while the verdict's newest run was today — a third label
      // describing a different set of runs than the number beside it.
      newestAgeDays: runRoute && (inp.runEffHistory?.length ?? 0) > 0
        ? Math.max(0, Math.round(
            (Date.parse(asOf + 'T12:00:00Z')
              - Date.parse(String((inp.runEffHistory as any[])[inp.runEffHistory!.length - 1]?.date) + 'T12:00:00Z')
            ) / 86_400_000))
        : runEfficiency.trend.newestAgeDays,
      recentlyFlat: runEfficiency.trend.recentlyFlat,
      // ⛔ THE RECEIPT READS THE SAME POOL AS THE VERDICT (D-346, 2026-07-31).
      //
      // Michael, from the shipped screen: the row said *"pace ~13:32/mi at 140 bpm"* while his easy runs
      // sit at 134 — because this line still came from `recentEfficiencyPaceHr`, which gates on
      // `isSteadyAerobic(workout_type)`, the field that says `steady_state` on every run ever logged.
      // So his 146 bpm hill session was being averaged into a number describing easy running, **directly
      // beneath a verdict that had just been cleaned of exactly that**. One row, two pools, and the
      // clean number vouching for the dirty one.
      //
      // ⛔ MEDIAN OF THE LAST FIVE, NOT A MEAN OF THE LAST TWO — and the shipped screen proved why.
      //
      // The first cut kept `recentEfficiencyPaceHr`'s mean-of-2 convention. Within an hour a 125 bpm
      // recovery jog synced and the line swung from 12:01/mi @ 134 to 13:04/mi @ 130 — a minute a mile
      // off ONE session. With n=2 a single outlier owns the number, in either direction: his 146 bpm
      // hill session drags it the other way just as hard.
      //
      // A median over five resists both ends without needing to know which runs were "easy" — and that
      // matters, because knowing which runs were easy is the exact thing this row could never do. His
      // runs cluster at 133-135 bpm; the median returns 12:50/mi @ 134 while the mean of the same five
      // returns 13:08 @ 135, dragged by the hill and the jog it cannot identify.
      // ⚠️ GAP twin is dropped: these paces ARE grade-adjusted, so a raw-vs-GAP toggle has nothing to
      // toggle between. Offering one would imply a distinction that no longer exists.
      ...(runRoute && (inp.runEffHistory?.length ?? 0) > 0 ? (() => {
        const rows = (inp.runEffHistory ?? []).slice(-5) as Array<Record<string, number>>;
        const median = (get: (r: Record<string, number>) => number): number => {
          const xs = rows.map((r) => Number(get(r) || 0)).filter((n) => n > 0).sort((a, b) => a - b);
          if (xs.length === 0) return 0;
          const mid = xs.length / 2;
          return xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[mid - 1] + xs[mid]) / 2;
        };
        const pace = median((r) => r.pace_s_per_km);
        const hr = median((r) => r.hr);
        return {
          recentPaceSecPerKm: pace > 0 ? Math.round(pace) : null,
          recentGapPaceSecPerKm: null,
          recentHrAvg: hr > 0 ? Math.round(hr) : null,
        };
      })() : {
        recentPaceSecPerKm: runEffPaceHr.paceSecPerKm,
        recentGapPaceSecPerKm: runEffPaceHr.gapPaceSecPerKm,
        recentHrAvg: runEffPaceHr.hrAvg,
      }),
      series: effChartSeries,
      /** ⚠️ Present only when the route engine answered — lets the row say WHY it is withholding
       *  ("not enough runs on one route yet") instead of quoting the old steady-run floor. */
      route: runRoute ? {
        // ⛔ THE CHART PLOTS THE SAME ROWS THE VERDICT READ (D-346, 2026-07-31).
        //
        // The old sparkline drew `efficiency_index` from every run the broken gate let through — hill
        // sessions included — while the verdict came from somewhere else. **Chart and verdict on
        // different data is how a screen contradicts itself**, and this row has done it for months.
        //
        // ⚠️ SAME ROUTE IS WHAT MAKES THE DOTS COMPARABLE. Terrain is held constant because it is
        // literally the same ground — nothing is modelled away. `tempF` rides along per point so the
        // conditions can be SHOWN beside the reading rather than corrected out of it: that is
        // Intervals.icu's pattern, whose own framing is that a weather overlay "helps interpret a poor
        // data point when there was heat, wind or unusual conditions". ⛔ Nobody in the field corrects
        // an efficiency chart for heat, and neither do we — we annotate and let the athlete discount it.
        series: (inp.runEffHistory ?? [])
          .map((r: any) => ({
            date: String(r?.date ?? ''),
            value: computeEfficiencyIndex(Number(r?.pace_s_per_km), Number(r?.hr)),
            tempF: r?.temp_f == null ? null : Number(r.temp_f),
          }))
          .filter((p) => !!p.date && p.value != null)
          .map((p) => ({ date: p.date, value: p.value as number, tempF: p.tempF, recent: p.date > _verdictStart })),
        direction: runRoute.direction,
        points: runRoute.points,
        ci: runRoute.ci,
        method: runRoute.method,
        heatCoefPctPerF: runRoute.heatCoefPctPerF,
        spanDays: runRoute.spanDays,
      } : null,
    },
  };

  // swim
  const { series: swimSeries, dropped } = swimPaceToSeries(inp.swimRows);
  const swimState = computeSwimState(swimSeries, asOf, spw.swim, dropped);
  const swim = perfFromTrend(swimState.trend);
  // NO swim fitness DOT (was: positionInRange on pace). Swim is described by VOLUME FACTS, not graded —
  // pace is too fins/equipment-contaminated to place on an honest axis (see swimVolumeFacts). The pace
  // verdict is kept (noise-gated in computeSwimState) only so the backend/coach never asserts a false
  // swim direction that would contradict the facts line; it renders nowhere on the State screen.
  const swimVolume = swimVolumeFacts(inp.swimRows, asOf, STATE_TREND_WINDOWS.swimDays);

  // swim rest fraction (D-194) — comparable-distance filtered; Q-061 contamination excluded upstream
  const { series: swimRestSeries, dropped: restOob } = swimRestToSeries(inp.swimRows);
  const swimRestState = computeSwimRestState(swimRestSeries, asOf, spw.swim, restOob);
  const swimRest = perfFromTrend(swimRestState.trend);

  // strength — DUAL read: VOLUME direction (activity/load fact) leads, e1RM direction is the secondary
  // fitness read, session count is the receipt. e1RM is NULL when there's no trend to hold (drop the
  // clause, don't assert "holding"). Volume gives the row a real verdict so it no longer falls to the
  // adherence "needs data · N unplanned" shrug — unplanned demotes to a dim receipt.
  const liftSeries = liftSeriesFromExerciseLog(inp.exerciseRows, {
    phaseByDate: inp.phaseByDate,
    measuredDates: inp.measuredDates,
  });
  // Slice 2: the protocol's own gauge. For a 5/3/1 block (`readsEffortAs: 'amrap'`) a waved main
  // lift's direction reads the ALL-OUT SET, not the working-set e1RM the program itself waves.
  // Absent inputs ⇒ 'e1rm' everywhere ⇒ byte-identical pre-slice behaviour.
  const strength = computeStrengthState(liftSeries, asOf, spw.strength, {
    allOutByLift: inp.allOutByLift,
    effortRead: inp.strengthEffortRead,
    phaseByDate: inp.phaseByDate,
  });
  const strengthVolTrend = computeStrengthVolumeState(strengthVolumeToSeries(inp.strengthVolumeRows, inp.phaseByDate), asOf, spw.strength);
  // Per-lift direction the aggregate rolls up FROM — persisted so the coach reads one direction (D-270).
  // points are sorted ascending by date (liftSeriesFromExerciseLog), so the last point is the latest e1RM.
  const liftLatest = new Map(liftSeries.map((s) => [s.canonical, s.points.length ? s.points[s.points.length - 1].value : null]));
  // best e1RM in the tracked window — the commercial-app frame: progress is vs your OWN best, not a typed
  // baseline. A PR = the latest point IS the best (latestE1rm >= bestE1rm), so the client can flag it.
  const liftBest = new Map(liftSeries.map((s) => [s.canonical, s.points.length ? Math.max(...s.points.map((p) => p.value)) : null]));
  // 12-week per-lift e1RM CHART series (the "long view" sparkline) — big-4 only, per Michael 2026-07-23.
  // SAME 84d window + recent-flag convention as run efficiency (recent = inside the 42d verdict window, so the
  // colored tail IS the slice the verdict judges). Values rounded to lb. Reuses _chartStart/_verdictStart above
  // (strength windowDays === run's 42d). Fills as the athlete logs — <2 points renders no line, only a note.
  // [Step 7] The four-name list used to live here AND in `StatePerformanceSection.tsx`, byte-identical,
  // with a comment on the client saying "Matches BIG_4_LIFTS in assemble.ts". A comment is not a
  // constraint: whichever copy gained a name first would emit a series nothing drew, or draw a slot
  // nothing filled. One list now, read by the emitter here and the renderer there — see
  // `src/lib/tracked-max-lifts.ts` for why this is four and the coaching gate is sixteen.
  const strengthChartByCanonical = new Map(
    liftSeries
      .filter((s) => isTrackedMaxLift(s.canonical))
      .map((s) => [s.canonical, s.points
        .filter((p) => p.date > _chartStart && p.date <= asOf)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((p) => ({ date: p.date, value: Math.round(p.value), recent: p.date > _verdictStart }))]),
  );
  const strengthPerLift: StrengthPerLift[] = strength.lifts.map((l) => ({
    canonical: l.canonical,
    displayName: l.displayName,
    isPrimary: l.isPrimary,
    // D-420: `computeStrengthState` already retired these two — kept in the contract, always
    // no-claim/null. Nothing downstream may render a strength direction.
    direction: l.trend.verdict,
    directionGauge: l.gauge ?? 'e1rm',
    directionBasis: l.gaugeBasis,
    pctChange: l.trend.pctChange,
    // D-420 pillar 2: the rep PR. Same walk the Performance card reads (slice 2's `allOutByLift`).
    lastAllOut: (() => {
      const pts = inp.allOutByLift?.[l.canonical];
      if (!Array.isArray(pts) || pts.length === 0) return null;
      const last = pts[pts.length - 1] as any;
      return {
        date: String(last.date), weight: Number(last.weight), reps: Number(last.reps),
        isRepRecord: last.is_rep_record === true,
        priorBestRepsAtWeight: last.prior_best_reps_at_weight ?? null,
      };
    })(),
    latestE1rm: liftLatest.get(l.canonical) ?? null,
    bestE1rm: liftBest.get(l.canonical) ?? null,
    // REAL PR frame — all-history best (not 6wk). Null when the all-history read wasn't supplied.
    allTimeBestE1rm: inp.allTimeBestByLift?.[l.canonical]?.best ?? null,
    allTimeCount: inp.allTimeBestByLift?.[l.canonical]?.count ?? 0,
    // ⛔ THE PR VERDICT, COMPUTED ONCE (2026-07-30). Was three conditions living in
    // `StatePerformanceSection.tsx`. Rule unchanged, byte for byte — only the address moved.
    // Michael, 2026-07-21: *"a PR should be a real PR, basically a new 1RM."* It was best-of-6-weeks
    // once, which fired on nearly every progressing lift and even stamped a lift reading "new".
    // ⚠️ The 0.5 lb slack absorbs rounding between the stored estimate and the all-history read; it
    // is not a tolerance on what counts as a record.
    isPr: (() => {
      const latest = liftLatest.get(l.canonical) ?? null;
      const allBest = inp.allTimeBestByLift?.[l.canonical]?.best ?? null;
      const allCount = inp.allTimeBestByLift?.[l.canonical]?.count ?? 0;
      return latest != null && allBest != null && allCount >= 3 && latest >= allBest - 0.5;
    })(),
    sampleCount: l.trend.sampleCount,
    newestAgeDays: l.trend.newestAgeDays,
    provisional: isProvisionalTrend(l.trend),
    series: strengthChartByCanonical.get(l.canonical),
  }));
  // State v3 DOT — strength = e1RM (what you CAN lift), not volume (what you DID). Volume keeps its
  // trend/verdict for OTHER consumers (coach), but the FITNESS DOT rides e1RM.
  const strengthE1rmBand = computeE1rmBand(liftSeries, inp.strengthBaselines);
  const strengthFitness: StrengthFitness = {
    volume: {
      verdict: strengthVolTrend.verdict, pctChange: strengthVolTrend.pctChange,
      sampleCount: strengthVolTrend.sampleCount, newestAgeDays: strengthVolTrend.newestAgeDays,
      provisional: isProvisionalTrend(strengthVolTrend),
    },
    // ⛔ D-420: the VERDICT is retired, the DOT is not. `range` is a POSITION claim (current e1RM ÷
    // your own baseline) — "where you sit", not "which way you're going" — and D-420 retires only the
    // direction. So this object is emitted whenever there is a band to show, carrying a no-claim
    // verdict. Previously it was gated on the verdict existing, which would now blank the dot too.
    e1rm: strengthE1rmBand ? { verdict: 'needs_data' as const, pctChange: null, range: strengthE1rmBand } : null,
    perLift: strengthPerLift,
    sessionsThisWeek: inp.doneBy['strength'] || 0,
    unplanned: Math.max(0, (inp.doneBy['strength'] || 0) - (inp.plannedBy['strength'] || 0)),
    // Passed straight through — this row states what was logged and derives nothing. ⚠️ Absent when
    // the athlete has not turned the progression on, which is most athletes.
    pullups: inp.pullupProgress ?? null,
  };

  // SLICE 1 — THREE-MODE ANCHORING (Michael 2026-07-16). A DOT is a "where am I in my range" POSITION
  // claim; it renders ONLY when a real anchor of the athlete's OWN exists (a typed / accepted baseline).
  // With no anchor the row is TREND-ONLY: the arrow (improving/holding/sliding) + "no baseline set", never
  // a dot — a positioned dot with no reference is the lie the rule forbids. Swim is FACTS-ONLY. Population
  // norms (Friel, VO2max tables) NEVER anchor a row; they may appear only as labeled fine print in a
  // tap-down. Mode is resolved HERE (the coach/spine), per row per payload — the client never decides it.
  // Bike upgrades to ANCHORED the moment the athlete ACCEPTS its FTP estimate (basis flips to 'personal');
  // run's anchor (flag a reference effort) is Slice 2 — until then run stays TREND-ONLY by construction.
  const strengthAnchored = !!inp.strengthBaselines && Object.keys(inp.strengthBaselines).length > 0;
  const fb = inp.fitnessBaselines ?? {};
  const fitnessMode: Record<string, FitnessMode> = {
    // strength anchors on its typed 1RM (unchanged); run/bike/swim anchor when an active fitness_baselines
    // record exists (auto-derived provisional OR the athlete's confirmed pick). No record → Slice-1 fallback.
    strength: strengthAnchored ? 'anchored' : 'trend_only',
    bike: fb.bike ? 'anchored' : 'trend_only',
    run: fb.run ? 'anchored' : 'trend_only',
    swim: fb.swim ? 'anchored' : 'facts_only',
  };

  // The TICK: place each anchor on its row's band (same low/high the dot uses). Run's anchor metric IS the
  // band metric (decoupling) → placeable. Bike's anchor is FTP (power) vs a power/efficiency band — only
  // placeable when the band is power, deferred this pass (tickPct null → dot + label, no tick). The label
  // carries "auto ·" for provisional, bare for confirmed (§2b/§4a).
  const fitnessAnchors: Record<string, FitnessAnchor> = {};
  if (fb.run && runDecoupRange) {
    const p = placeAnchorOnBand(fb.run.value, runDecoupRange.low, runDecoupRange.high, !fb.run.lowerIsBetter);
    fitnessAnchors.run = { tickPct: p.tickPct, overflow: p.overflow, status: fb.run.status, label: anchorLabel(fb.run), value: fb.run.value ?? null, metric: fb.run.metric ?? null };
  }
  if (fb.bike) {
    fitnessAnchors.bike = { tickPct: null, overflow: null, status: fb.bike.status, label: anchorLabel(fb.bike), value: fb.bike.value ?? null, metric: fb.bike.metric ?? null };
  }
  if (fb.swim) {
    fitnessAnchors.swim = { tickPct: null, overflow: null, status: fb.swim.status, label: anchorLabel(fb.swim), value: fb.swim.value ?? null, metric: fb.swim.metric ?? null };
  }

  const perfByDisc: Record<string, PerfSummary | null> = {
    // ⛔ D-420: STRENGTH HAS NO PERFORMANCE VERDICT. This fed `resolveDisciplineCard` (→ the card's
    // headlineVerdict) and `synthesizeHeadline`, which is how "sliding −8.2%" reached the screen and
    // the State headline. `null` is already a supported value here and means exactly the right thing:
    // there is no direction verdict for this discipline, so adherence leads the card. Strength's own
    // row renders the record + rep PRs + the chart instead (StrengthFitnessRow).
    strength: null,
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
    // Follows the SAME lead as the verdict and the dot (`bikeLeadIsPower`) — a provisional flag read off
    // power while the row renders efficiency is how a row ends up hedging the wrong number.
    bike: bikeLeadIsPower ? bikeFitness.power.provisional : bikeFitness.efficiency.provisional,
    run: isProvisionalTrend(runState.trend),
    swim: isProvisionalTrend(swimState.trend),
  };

  // Q-179 — THE JOIN. The verdict is untouched; what it MEANS is decided here, once, on the server.
  // A discipline the athlete declared `maintain` must never be graded as one they are trying to
  // `develop`. No posture declared → `unknown` → every surface behaves exactly as it did before.
  const cards: DisciplineCard[] = ORDER.map((k) => {
    const card = resolveDisciplineCard({
      discipline: k,
      performance: perfByDisc[k],
      adherence: computeAdherenceState({
        discipline: k,
        windowDays: ADHERENCE_WINDOW_DAYS,
        planned: inp.plannedBy[k] || 0,
        completed: inp.doneBy[k] || 0,
      }),
    });
    const declared = inp.posture?.[k] ?? null;
    // BEHAVIOUR, not the trend verdict, answers "are you maintaining it?" — `spw` is the spine's own
    // 90d sessions/week, already computed above; the target is what the athlete typed into the wizard.
    const behaviour = {
      targetSessionsPerWeek: inp.declaredSessionsPerWeek?.[k] ?? null,
      actualSessionsPerWeek: spw[k] ?? null,
    };
    const read = readPosture(declared, card.headlineVerdict, behaviour);
    return {
      ...card,
      posture: declared,
      postureRead: read,
      postureSentence: postureSentence(read, disciplineWord(k), behaviour),
    };
  });

  return {
    cards, headline: synthesizeHeadline(cards), bikeFitness, runFitness, strengthFitness, perfByDisc, provisionalByDisc, spw,
    swimRest, swimRestProvisional: isProvisionalTrend(swimRestState.trend),
    swimVolume,
    fitnessMode,
    fitnessAnchors,
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
  /** Swim VOLUME facts — the described-not-graded swim row (no dot). */
  swimVolume: SwimVolume;
  /** SLICE 1: per-discipline anchoring mode — the client renders the dot ONLY where mode==='anchored'. */
  fitnessMode: Record<string, FitnessMode>;
  /** Per-discipline rendered anchor (tick + label) for anchored rows. */
  fitnessAnchors: Record<string, FitnessAnchor>;
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
    efficiency: { verdict: string; pctChange: number | null; sampleCount: number; newestAgeDays: number | null; recentlyFlat?: boolean; recentPaceSecPerKm?: number | null; recentGapPaceSecPerKm?: number | null; recentHrAvg?: number | null; series?: Array<{ date: string; value: number; recent: boolean }>; route?: { direction: string; points: number; ci: [number, number] | null; method: string; heatCoefPctPerF: number | null; spanDays: number | null } | null };
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

export interface FitnessRollup {
  direction: FitnessDirection;
  /** Q-162: disciplines that HAD an improving/sliding verdict but were held OUT of the confident
   *  direction because their trend is provisional (near-floor n or clustered in <21d — see
   *  isProvisionalTrend) AND whose exclusion actually changed the headline. Surfaced so the read is
   *  HONEST about the gap ("holding on what we can measure — not enough swim data yet") instead of
   *  asserting a confident direction off thin data. Empty when thin data didn't change the read. */
  thinHeldOut: string[];
}

/** Roll the per-discipline spine verdicts up to the coach's single fitness_direction. The coach
 *  DESCRIBES this; it no longer re-derives fitness its own way (the Step-2 narrative→spine lesson,
 *  one level up). Only disciplines with a real verdict count (needs_data is ignored, not asserted
 *  as a direction).
 *
 *  Q-162 — the composite must be only as confident as its inputs: a PROVISIONAL verdict (thin or
 *  clustered data) cannot ASSERT a confident direction. The headline is decided by SOLID verdicts
 *  only, so thin data can't make the composite read "improving" while the per-discipline breakdown
 *  right below it hedges the same trend as "[provisional — sparse/limited data]". Mixed = solid
 *  verdicts genuinely both ways; stable = no solid change OR no signal at all (matches the prior
 *  catch-all default, so the cold-start contract is unchanged). */
export function rollupFitness(v1: StateTrendsV1 | null | undefined): FitnessRollup {
  if (!v1) return { direction: 'stable', thinHeldOut: [] };
  const discs = ([
    ['strength', v1.strength],
    ['bike', v1.bike],
    ['run', v1.run],
    ['swim', v1.swim],
  ] as const)
    .map(([key, d]) => ({ key, verdict: d?.verdict, provisional: !!d?.provisional }))
    // 'withheld' is non-directional (like needs_data) — a withheld direction never drives the composite.
    .filter((d) => d.verdict && d.verdict !== 'needs_data' && d.verdict !== 'withheld');

  const dirOf = (set: Array<{ verdict?: string }>): FitnessDirection => {
    const vs = set.map((d) => d.verdict);
    const hasImp = vs.includes('improving');
    const hasSld = vs.includes('sliding');
    if (hasImp && hasSld) return 'mixed';
    if (hasImp) return 'improving';
    if (hasSld) return 'declining';
    return 'stable';
  };

  const solid = discs.filter((d) => !d.provisional);
  // Confident direction from solid verdicts only — thin trends never assert it.
  const direction = solid.length > 0 ? dirOf(solid) : 'stable';
  // Name the gap ONLY when holding thin data out actually changed the headline (otherwise it's
  // noise): the provisional movers that would have driven a different composite.
  const directionAll = discs.length > 0 ? dirOf(discs) : 'stable';
  const thinHeldOut = direction !== directionAll
    ? discs.filter((d) => d.provisional && (d.verdict === 'improving' || d.verdict === 'sliding')).map((d) => d.key)
    : [];
  return { direction, thinHeldOut };
}

/** Back-compat single-enum view (callers that only want the direction). */
export function rollupFitnessDirection(v1: StateTrendsV1 | null | undefined): FitnessDirection {
  return rollupFitness(v1).direction;
}

export interface HrResponseRollup {
  /** Combined heart-rate-response verdict across the reliable-HR endurance disciplines. 'sliding' =
   *  HR drifting up / working harder for the same output; 'improving' = HR settling. */
  verdict: 'improving' | 'holding' | 'sliding' | 'needs_data';
  contributors: Array<{ discipline: 'run' | 'bike'; verdict: string; provisional: boolean; newestAgeDays: number | null }>;
  /**
   * ⛔ AGE OF THE NEWEST CONTRIBUTING SESSION (changed 2026-07-31). This was the OLDEST, so that a
   * combined read could never look fresher than its stalest half — a defensible instinct that produced
   * a dishonesty of its own: Michael's run side was ONE DAY old and his bike side sixteen, and the row
   * stamped itself two weeks stale. It read as *"nothing here is current"* about a reading taken off a
   * run he did yesterday, and that is what sent three sessions hunting for a data-flow bug that did not
   * exist.
   *
   * ⚠️ THE HONESTY IS NOT LOST, IT MOVED — AND IT WAS ALREADY THERE. The provenance line renders every
   * contributor with its own age (*"runs drifting up (1d ago) · bike holding (16d ago)"*), and the
   * bike-stale nudge fires at 5 days. Naming the stale half beats hiding the fresh one behind it.
   * ⛔ If that per-contributor line is ever removed, this must go back to the oldest.
   */
  asOfAgeDays: number | null;
  /** Age of the STALEST contributor, kept so nothing has to recompute it from `contributors`. */
  stalestAgeDays: number | null;
}

/** Holistic heart-rate response across endurance, read from the SPINE (not re-derived): run = aerobic
 *  decoupling (HR drift vs pace), bike = HR-at-power efficiency — each discipline's CORRECT instrument.
 *  Swim is intentionally excluded (in-water HR is unreliable). Combines the per-discipline verdicts the
 *  same way fitnessDirection does — SOLID verdicts decide, a provisional/thin read can't assert (Q-162).
 *  This replaces the coach's run-only re-derived HR-drift with a single-source read that covers every
 *  discipline whose HR is trustworthy. */
export function rollupHrResponse(v1: StateTrendsV1 | null | undefined): HrResponseRollup {
  if (!v1) return { verdict: 'needs_data', contributors: [], asOfAgeDays: null, stalestAgeDays: null };
  // ⛔ THE RUN SIDE READS EFFICIENCY, NOT DECOUPLING (D-346, 2026-07-31).
  //
  // Decoupling is still gated on `isSteadyAerobic(workout_type)` — the field that reads `steady_state`
  // on every run ever logged — so this athlete's 24.9% hill session is in its pool. That is what made
  // the BODY row say "drifting up — working harder to hold effort" in red, on the same screen where
  // the RUN row had already been moved onto a clean read.
  //
  // ⛔ AND IT IS THE SAME QUESTION. "Heart-rate response" asks whether the athlete is working harder
  // for the same output. Efficiency is speed PER HEARTBEAT, terrain-adjusted and heat-corrected — a
  // direct answer. Decoupling asks something narrower (did you fade WITHIN one run) and needs a
  // pristine steady effort to mean anything, which is exactly the input it cannot identify.
  //
  // ⚠️ DIRECTION IS PRESERVED, NOT COPIED. Efficiency is higher-is-better (`improving` = faster per
  // beat = HR settling); the rollup's vocabulary is HR-shaped, where `improving` also means settling.
  // They agree, so the verdict passes through unchanged — but if either flips, this mapping breaks
  // silently, which is why it is written down rather than left as an equality.
  //
  // ⚠️ Falls back to decoupling when efficiency has no read, so a treadmill athlete keeps the row.
  const runEff = v1.run?.efficiency as { verdict?: string; provisional?: boolean; newestAgeDays?: number | null; route?: unknown } | undefined;
  const runD = (runEff && runEff.route && runEff.verdict && runEff.verdict !== 'needs_data' && runEff.verdict !== 'withheld')
    ? runEff
    : v1.run?.decoupling;
  const bikeE = v1.bike?.efficiency as (StateTrendsV1['bike']['efficiency'] & { newestAgeDays?: number | null }) | undefined;
  const all: Array<{ discipline: 'run' | 'bike'; verdict?: string; provisional: boolean; newestAgeDays: number | null }> = [];
  if (runD) all.push({ discipline: 'run', verdict: runD.verdict, provisional: !!runD.provisional, newestAgeDays: runD.newestAgeDays ?? null });
  if (bikeE) all.push({ discipline: 'bike', verdict: bikeE.verdict, provisional: !!bikeE.provisional, newestAgeDays: bikeE.newestAgeDays ?? null });
  const contributors = all.filter((c) => c.verdict && c.verdict !== 'needs_data' && c.verdict !== 'withheld') as HrResponseRollup['contributors'];
  if (contributors.length === 0) return { verdict: 'needs_data', contributors: [], asOfAgeDays: null, stalestAgeDays: null };

  const solid = contributors.filter((c) => !c.provisional);
  const dirOf = (set: HrResponseRollup['contributors']): HrResponseRollup['verdict'] => {
    const vs = set.map((c) => c.verdict);
    const imp = vs.includes('improving'), sld = vs.includes('sliding');
    if (imp && sld) return 'holding'; // genuinely both ways → net holding (contributors name the split)
    if (sld) return 'sliding';
    if (imp) return 'improving';
    return 'holding';
  };
  const verdict = solid.length > 0 ? dirOf(solid) : 'holding';
  const ages = contributors.map((c) => c.newestAgeDays).filter((a): a is number => a != null);
  // ⛔ NEWEST, not oldest — see the note on `asOfAgeDays`. A one-day-old run half stamped with a
  // sixteen-day-old bike half read as "nothing here is current" and cost three sessions.
  const asOfAgeDays = ages.length ? Math.min(...ages) : null;
  const stalestAgeDays = ages.length ? Math.max(...ages) : null;
  return { verdict, contributors, asOfAgeDays, stalestAgeDays };
}

/**
 * NO SILENT DROP on the heart-rate response (2026-07-20, Michael's "is it lagging?" catch).
 *
 * The rollup only takes a discipline that has a real DIRECTION (verdict ≠ needs_data), and run
 * durability needs `floor` steady runs to call one. So an athlete maintaining a low run volume can
 * have RECENT steady runs that still can't form a trend — the run drops out, the read leans on the
 * last discipline with a verdict (often an older bike), and the "as of" date looks stale/lagging even
 * though fresh runs exist. The read was silently dropping them (STATE-SOURCE-MAP law: an exclusion is
 * not allowed to be silent).
 *
 * Returns a one-line disclosure when a run is PRESENT (sampleCount > 0) but BELOW the trend floor and
 * therefore not contributing. Null when the run is contributing, absent, or the floor is met.
 * `floor` mirrors RUN_TREND_MIN_RUNS (StatePerformanceSection.tsx) — the arrow's own threshold.
 */
export function hrResponseExcludedRunNote(
  v1: StateTrendsV1 | null | undefined,
  contributors: HrResponseRollup['contributors'],
  floor = 8,
  opts?: { runUnderTarget?: boolean },
): string | null {
  const runD = v1?.run?.decoupling as { sampleCount?: number } | undefined;
  if (!runD) return null;
  const n = Number(runD.sampleCount);
  const runContributing = contributors.some((c) => c.discipline === 'run');
  if (runContributing || !(n > 0) || n >= floor) return null;
  // OPPORTUNITY framing, not a scold (Michael, 2026-07-21) — the note names the lever (a steady run
  // refreshes the read), and does DOUBLE DUTY when the athlete is also under their declared running
  // target: the same run holds the running they've been low on. Never "you failed" (Garmin's mistake).
  const tail = opts?.runUnderTarget
    ? " and it's the running you're under target on"
    : '';
  return `${n} of ${floor} steady runs to trend — a steady run refreshes this${tail}.`;
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
      swimVolume: r.swimVolume,
      fitnessMode: r.fitnessMode,
      fitnessAnchors: r.fitnessAnchors,
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
      // Carried here as well as on `display` so a consumer reading the flat `bike` block (the coach,
      // anything asking "what does the bike say") gets the same lead and the same reason the screen
      // shows. A second consumer re-deriving "is power leading" is how the two would drift apart.
      lead: r.bikeFitness.lead,
      power_silent: r.bikeFitness.powerSilent ?? null,
      hard_ride_count: r.bikeFitness.hardRideCount ?? null,
    },
  };
}
