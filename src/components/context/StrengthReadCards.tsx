/**
 * THE ENDURANCE READ — one card per sport, on the trends plate.
 *
 * ⛔⛔ THIS FILE USED TO OWN BOTH HALVES. The strength half — "is the bar going up", one card per
 * main lift with its weekly-heaviest-set line — WAS DELETED 2026-09-01 (FIXLIST item 1a, ruled by
 * Michael). It drew the same four lifts, off the same series, as the STRENGTH block inside
 * <StatePerformanceSection>, which survives because it also carries the all-history record, the
 * session count and as-of date, the last all-out set with its rep-PR flag, and the training-max
 * climbing / holding / reset line.
 *
 * ⛔ DO NOT RESTORE IT. What went with it: <StrengthReadCards>, its default export, `ReadChart`,
 * `Card`, `LineOnlyCard`, `canonicalKey` and `BLOCK_WEEKS`. Nothing in the endurance half used any
 * of them (checked: `ReadChart` had exactly two call sites, both in the deleted half).
 *
 * ⚠️ THE SERVER IS UNCHANGED AND STILL SENDS THE INPUTS. `liftSeriesFromExerciseLog`,
 * `state_trends_v1.strength.per_lift`, `display.strengthFitness.perLift` and `me_history_v1` all
 * still exist and still feed the surviving STRENGTH block. `src/lib/strength-read.ts` and its eight
 * fixtures are now UNRENDERED — see its own banner. Retiring them is a separate call, not this one.
 */

import React from 'react';
import { fmtDayShort, latestPoint } from '@/lib/sport-summary';
import { fitTrend } from '@/lib/sport-summary';
import { getDisciplineColor } from '@/lib/context-utils';
import { DRIFT_LIMITS } from '@shared/state-trend';
// ⛔ THE ONE CHART LANGUAGE (Round 3 pass 2, 2026-09-01). The endurance cards used to draw their own
// dates-only, non-expanding chart (DatedChart); they now draw the same sparkline as strength and
// bike, so the screen has ONE caption format and ONE expand rule. DatedChart is kept as a thin
// adapter over it (same call sites) — see below.
import TrendSparkline from './TrendSparkline';

type SeriesPoint = { date: string; value: number; recent: boolean; week?: number };


/**
 * THE ENDURANCE CARDS — one per sport, the same shape as a lift card. [work order item 2, extended
 * to the ride 2026-08-28]
 *
 * ⛔ THE SAME SESSION EVERY WEEK IS THE POINT. A standing block prescribes the identical
 * near-threshold run and the identical hard ride every week by design (p120), so the workout does
 * not change and any change in the line is the athlete. ⚠️ These do NOT replace the existing run
 * efficiency row or the bike fitness/form row — those trend across ALL sessions and answer a
 * different question. Both stay, same call as everything else this arc.
 *
 * ⛔ A WEEK MISSING FROM A LINE IS A MISSING LINK, NOT A MISSING SESSION. Identification is by the
 * planned row's family tag, reached through the attach at ingest. The server does not guess from
 * day-of-week and duration, and neither does this.
 *
 * THE THREE ROWS, and why each is here:
 * 1. **The reference number over time** — the endurance twin of the estimated 1RM: every prescribed
 *    percentage is a percentage OF it, so it moving is the improvement. ⛔ RIDE ONLY. FTP
 *    accumulates a dated trail because `fitness_baselines` supersedes rather than overwrites; run
 *    threshold pace is a single overwritten value, so the run card SAYS it has no history rather
 *    than drawing a line from one number.
 * 2. **Cost per session** — output per heartbeat on the repeated session, read as stored. Rising is
 *    the engine doing the same work for less.
 * 3. **Fade inside the session against p107** — first half against second, put beside the source's
 *    own line for the first time: 10%, or 5% when a key session falls within 24 hours.
 */

/** ⛔ p107's two lines, mirrored from the server contract. Stated, never re-derived. */
const DRIFT_STANDARD_PCT = 10;
const DRIFT_KEY_SESSION_PCT = 5;

type NamedPoint = {
  week: number; date: string; hrAvg: number; durationMin: number | null;
  efficiency: number | null; driftPct: number | null; driftBasis?: 'gap' | 'raw' | 'power' | 'hr' | null; driftWholeSession?: boolean; fromWarmup?: boolean; keySessionWithin24h: boolean;
};
type NamedSession = {
  family: string; sport: string; label: string; points: NamedPoint[];
  reference?: { metric: string; unit: string; points: Array<{ date: string; value: number; status: string }> } | null;
};

type SpinePoint = {
  date: string; hrAvg: number | null; durationMin: number | null;
  efficiency: number | null; driftPct: number | null; driftBasis?: 'gap' | 'raw' | 'power' | 'hr' | null; driftWholeSession?: boolean; fromWarmup?: boolean; fadeWithheld: boolean; keySessionWithin24h: boolean;
 tempF?: number | null; elevationGainM?: number | null;
 /** rides only: false = a hard ride, kept on the card and left out of the efficiency trend (server-decided). */
 countsTowardTrend?: boolean; };
type SpineSeries = { sport: string; group: string; points: SpinePoint[] };

/** ⛔ THE SPINE'S GROUPS IN THE ATHLETE'S OWN WORDS. No invented vocabulary on a screen. */
const GROUP_LABEL: Record<string, string> = {
  easy: 'easy runs', long: 'long runs', quality: 'hard runs', aerobic: 'aerobic efficiency', all: 'rides',
};
/** ⛔ THE SPINE LEADS, THE OVERLAY FOLLOWS — easy first, then long, then quality, then rides. */
const GROUP_ORDER = ['aerobic', 'easy', 'long', 'quality', 'all'];

/** 2026-09-03 (Michael: the hills-and-heat line "feels lost in the threshold line" — it should blanket easy and
 *  hard). The run plate renders it ONCE, as the card's last line under the workload chart, via this export;
 *  the ride plate keeps it inline. Same words as before, copy unchanged. */

export function EnduranceReadCards(
  { sessions, spine, sport, asOf }: { sessions?: NamedSession[] | null; spine?: SpineSeries[] | null; sport?: 'run' | 'ride'; /** the server's as-of day; the last point's date when absent */ asOf?: string | null },
) {
  // ⛔ ONE OWNER PER SPORT (Round 3 pass 1, 2026-09-01). `sport` filters this to a single discipline
  // so the ride cards can render under the bike plate and the run cards under the run block, each
  // owned by one place. ⚠️ BEHAVIOUR-PRESERVING: no `sport` → every card, exactly as before. The
  // cards already carry their own `sport` ('run' / 'ride'), so this is a filter, not a re-grouping —
  // no card's own render gate changes, only which subset a caller asks for.
  const bySport = <T extends { sport: string }>(xs: T[]) => (sport ? xs.filter((x) => x.sport === sport) : xs);
  const list = bySport((sessions ?? []).filter((s) => (s?.points?.length ?? 0) > 0));
  /**
   * ⛔⛔ THE SPINE RENDERS WITHOUT A PLAN, AND IT RENDERS FIRST (2026-08-28, work order item 3).
   *
   * ⛔ WHAT WAS WRONG. A run reached this section only if it carried a `planned_id`, whose planned
   * row carried a family tag, on a date inside the current block's week map — three plan
   * preconditions on a measurement that has none. Michael's ruling (Q-294): *a lift is prescribed so
   * the plan is the right frame; a run is yours whether a plan exists or not.*
   *
   * ⛔ AND THE ORDER IS THE DESIGN CALL, NOT A LAYOUT CHOICE. TrainingPeaks' read needs nothing;
   * Viada's needs a repeated prescribed session. **So TrainingPeaks is the spine and Viada is the
   * overlay that appears when a block exists** — the build shipped it inverted, with the overlay as
   * the headline and the spine filtered down to nothing.
   */
  const spineList = bySport((spine ?? [])
    .filter((s) => (s?.points?.length ?? 0) > 0))
    .sort((a, b) => (GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)) || a.sport.localeCompare(b.sport));
  if (list.length === 0 && spineList.length === 0) return null;
  // ⛔ THE CAUTION, ONCE FOR THE SPORT (Round 3 pass 2) — see SpineCard for why it moved here. Shown
  return (
    <>
      {spineList.map((s) => <SpineCard key={`spine:${s.sport}:${s.group}`} series={s} asOf={asOf ?? null} />)}
      {list.map((s) => <EnduranceCard key={`${s.sport}:${s.family}`} session={s} />)}
    </>
  );
}

/**
 * ⛔ ONE GROUP OF SESSIONS, COMPARED TO ITSELF. Dates, never block weeks — a rebuilt block cannot
 * empty this card, which is the whole reason the spine exists beside the overlay.
 */
// ⓘ copy, Michael 2026-09-02 (voice-checked): what the two run numbers mean, in plain words.
const DECOUPLING_EXPLAIN = `Second-half heart rate against the first, same pace. The book's line is 5%.`; // 2026-09-03: Michael cut the paragraph


function SpineCard({ series, asOf: asOfIn }: { series: SpineSeries; asOf: string | null }) {
  // ⛔ ONE TAP, NOT THREE (Michael 2026-09-03: "too many clicks … should be one click"). The row tap
  // opens the card; everything the card has is printed on it. The ⓘ toggles that hid the EF and
  // decoupling explanations behind a second tap are gone — NN/g's progressive-disclosure rule is one
  // level, and Garmin / Strava / TrainingPeaks / Whoop all print the explanation on the detail page.
  const pts = series.points;
  const latest = pts[pts.length - 1];
  const prior = pts.length > 1 ? pts[pts.length - 2] : null;
  const isRide = series.sport === 'ride';
  const color = getDisciplineColor(isRide ? 'ride' : 'run');
  const label = GROUP_LABEL[series.group] ?? `${series.sport} sessions`;
  // ⛔ THE TREND TAKES STEADY RIDES ONLY; THE CARD KEEPS EVERY RIDE (2026-09-03, WORKORDER-bike-state-audit §4).
  // The server stamps each ride point with `countsTowardTrend` — `bikeEfficiencyRideEligible`, the same gate the
  // heart-rate-at-power read, the coach's bike drift row and the session screen already use. A hard ride's
  // watts-per-beat is real but is not an aerobic read; TrainingPeaks prints it per session and builds the trend
  // from steady sessions only. So: the efficiency series, its headline and "based on" come from `trendPts`; the
  // logged count and the latest ride's drift line come from every point. Undefined = counts (every run).
  const trendPts = pts.filter((p) => p.countsTowardTrend !== false);
  const leftOut = pts.length - trendPts.length;
  const eff = trendPts.map((p) => ({ date: p.date, value: p.efficiency })).filter((p) => p.value != null) as Array<{ date: string; value: number }>;
  // ⛔ THE HEADLINE IS TRAININGPEAKS', WHOLE (Michael 2026-09-04: one absolute reference per metric, never a
  // TrainingPeaks formula under a Garmin window). FIELD — TrainingPeaks: EF is a per-workout number in the
  // workout summary; the dashboard trends it one dot per workout over the date range. So the headline is
  // the LAST steady session's efficiency factor, the line under it names that session, and the chart below
  // is the trend. The 28-day average and the ↑→↓ arrow (both Garmin's rule) are gone from this card.
  const effLast = latestPoint(eff);
  const headline = effLast?.value ?? null;
  const noun = isRide ? 'ride' : 'run';
  // which session the number is — and, on a ride card, how many hard rides the trend leaves out (the caveat is
  // printed, never a blank space; TrainingPeaks explains the same exclusion in its help centre)
  const basedOn = effLast
    ? `${fmtDayShort(effLast.date)} ${isRide ? 'steady ' : ''}${noun}${leftOut > 0 ? ` · ${leftOut} ${leftOut === 1 ? 'ride' : 'rides'} under 10 min in the aerobic band, not in the trend` : ''}`
    : (leftOut > 0 ? `no rides with 10 min in the aerobic band yet · ${leftOut} not in the trend` : null);
  /**
   * ⛔ DRIFT IS TRAININGPEAKS' Pa:Hr / Pw:Hr, WHOLE (2026-09-04). One percent per session — first half of a steady
   * effort against the second — printed in the workout summary and trended on a dashboard. The number shown is
   * the LAST steady session's; the line is the trend. The 28-day average (Garmin's window) is gone.
   *
   * Which sessions: the same steady points the efficiency line is built from, that carry the RATIO read
   * (pace to heart rate on a run, power to heart rate on a ride). Heart-rate-alone drift ('hr') is one side
   * of that ratio; p107's line does not govern it, so it is not in this trend. Interval days (whole-session)
   * and withheld reads are not steady efforts and are left out for the same reason they were before.
   */
  const driftPts = trendPts
    .filter((p) => p.driftPct != null && !p.fadeWithheld && !p.driftWholeSession
      && (p.driftBasis === 'gap' || p.driftBasis === 'raw' || p.driftBasis === 'power'))
    .map((p) => ({ date: p.date, value: p.driftPct as number }));
  const driftLast = latestPoint(driftPts);
  const driftWhat = isRide ? 'power to heart rate' : 'pace to heart rate';
  const fmtDrift = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

  return (
    <div className="px-3 py-3 border-t border-white/[0.055] first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-white/80">{label}</span>
        {/* ⚠️ THE COUNT, NOT A WEEK NUMBER. This card has no block axis by construction. */}
        <span className="text-[11px] text-white/60 tabular-nums">{pts.length} logged</span>
      </div>

      {/* which session the headline IS — directly under the number it names, not under the drift line (2026-09-04) */}
      {eff.length >= 2 && (() => {
        const f = fitTrend(eff);
        const noun = isRide ? 'ride' : 'run';
        const leftOutNote = leftOut > 0 ? ` · ${leftOut} ${leftOut === 1 ? noun : noun + 's'} under 10 min left out` : '';
        return (
          <DatedChart points={eff} color={color} dotNoun={noun} fmtVal={(v) => fmtEff(v, isRide)} trendWord="efficiency"
            title={`Efficiency${f ? ` · ${fmtEff(f.end, isRide)}` : ''} · higher is better`}
            keyLine={`dots: one ${noun}, ${isRide ? 'power' : 'pace'} ÷ heart rate · dashed: the trend${leftOutNote}`} />
        );
      })()}
      {/* The chart's own key, the same shape as the drift chart's (Michael, 2026-09-04: "efficiency needs to know if
          higher is better"). Dashed = the fitted trend. */}

      {/* ⛔ THE "one session doesn't tell you much" CAUTION MOVED TO ONCE PER SPORT (Round 3 pass 2).
          It was printed under EVERY spine card (easy / long / quality / rides), which is the "said
          four times" the card-language pass is removing; it now renders once at the foot of the
          endurance group in <EnduranceReadCards>. Same words, same TrainingPeaks reasoning (compare
          similar sessions over weeks, not one against the last), said once. */}

      {/* ⛔ FADE / SECOND-HALF-DRIFT LINE REMOVED (2026-09-01, Michael: "gobbely gook nonsense"). The
          decoupling read ("N% harder in the second half · M% is the line, and a hard day is inside 24
          hours" / "no second-half number — its pace changed on purpose") was unreadable on a glance.
          The signal still exists server-side; it is just not surfaced here as prose. */}

      {/* ⛔ DECOUPLING AS A NUMBER, NOT A VERDICT (2026-09-02, Michael: same as TrainingPeaks).
          TrainingPeaks' Pa:Hr is one percent per run: how much heart rate drifted against pace.
          The prose that read it for the athlete was cut on 2026-09-01; the number itself is the
          field's second run fact and is shown bare. Withheld sessions (pace changed by prescription)
          show nothing — a number for a non-steady effort is not the same number. */}
      {/* the drift trend — the number the field trends (Pa:Hr / Pw:Hr), as a line and the last-4-weeks average, no verdict */}
      {driftPts.length >= 2 && (
        <DatedChart points={driftPts} color={color} dotNoun={isRide ? 'steady ride' : 'run'} fmtVal={fmtDrift} unit="%" trendWord="drift" divider
          title={`Drift · lower is better · line ${DRIFT_LIMITS.hybridPct}%`}
          keyLine={`dots: one steady ${isRide ? 'ride' : 'run'}, first half vs second · dashed: the trend`} />
      )}
      {/* ⛔ NO SINGLE-SESSION DRIFT NUMBER ON STATE (2026-09-04, Michael: "you're using the last run to give a drift
          reading"). This is the trend screen; one run's drift lives on that run. TrainingPeaks' dashboard shows the
          trend as a chart with no headline, which is what stays here. */}
      {/* HEAT (2026-09-04, Michael: "summer has an impact — put a note"). A fixed line, not generated: a fact with a
          source, the same every time. Shown when any session in the window was 72°F or hotter — Garmin's own
          heat cut-off (its fitness estimate is corrected above 72°F / 22°C); TrainingPeaks applies no correction and
          Friel's guidance is to compare like with like. Ledger: docs/STATE-SOURCES.md. */}
      {pts.some((p) => typeof p.tempF === 'number' && p.tempF >= 72) && (
        <div className="text-[12px] text-white/55 mt-1 leading-snug">
          Heat raises heart rate at the same {isRide ? 'power' : 'pace'}, so efficiency reads lower and drift reads higher on hot days.
        </div>
      )}
    </div>
  );
}

function EnduranceCard({ session }: { session: NamedSession }) {
  const pts = session.points;
  const latest = pts[pts.length - 1];
  const prior = pts.length > 1 ? pts[pts.length - 2] : null;
  const isRide = session.sport === 'ride';
  const color = getDisciplineColor(isRide ? 'ride' : 'run');
  const durMin = latest.durationMin;
  const durLabel = durMin != null && durMin > 0
    ? `${Math.floor(durMin / 60) > 0 ? `${Math.floor(durMin / 60)}h ` : ''}${String(durMin % 60).padStart(2, '0')}m`
    : null;

  // ⛔ THE RIDE LEADS ON THE REFERENCE NUMBER, THE RUN ON BEATS. A rider reads power; that is the
  // number their whole prescription is a percentage of, and it is the one with a history.
  const ref = session.reference ?? null;
  const refLatest = ref && ref.points.length > 0 ? ref.points[ref.points.length - 1] : null;


  return (
    <div className="px-3 py-3 border-t border-white/[0.055] first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-white/80">{session.label}</span>
        <span className="text-[11px] text-white/60 tabular-nums">week {latest.week}</span>
      </div>

      {/* ── ROW 1: the reference number. Ride only — see the header. ── */}
      {refLatest ? (
        <>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="readout-num text-[26px] leading-none">{Math.round(refLatest.value)}</span>
            <span className="text-[12px] text-white/60">{ref!.unit} threshold</span>
          </div>
          <RefChart points={ref!.points} color={color} />
        </>
      ) : (
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="readout-num text-[26px] leading-none">{latest.hrAvg}</span>
          <span className="text-[12px] text-white/60">bpm avg</span>
        </div>
      )}

      {/* ── ROW 2: cost per session. ── */}
      {latest.efficiency != null && (
        <div className="text-[12px] text-white/50 mt-2">
          {/* Same rename as the spine card above — the field's name, not ours. */}
          efficiency factor{' '}
          <span className="tabular-nums text-white/75">{fmtEff(latest.efficiency, isRide)}</span>
          {/* ⚠️ Only when there IS an earlier reading of the same session. One number is not a trend,
              and a second number that is the first would state a comparison that has not happened. */}
          {prior?.efficiency != null && (
            <span className="text-white/55"> · week {prior.week} <span className="tabular-nums">{fmtEff(prior.efficiency, isRide)}</span></span>
          )}
        </div>
      )}
      <SessionChart points={pts} color={color} valueOf={(p) => (p.efficiency ?? null)} />

      {/* ⛔ ROW 3 (fade / second-half drift) REMOVED (2026-09-01, Michael: "gobbely gook nonsense") —
          same reason as the spine card above. The decoupling signal stays server-side, off the card. */}

      {durLabel && prior?.efficiency != null && <div className="text-[11px] text-white/55 mt-1">same {durLabel} session</div>}
    </div>
  );
}

/** Watts per beat reads to two decimals; metres-per-second per beat needs three. */
export function fmtEff(v: number, isRide: boolean): string {
  return isRide ? v.toFixed(2) : v.toFixed(3);
}

/** ⛔ THE REFERENCE LINE — dated, not weekly. It predates the block and outlives it. */
function RefChart({ points, color }: { points: Array<{ date: string; value: number }>; color: string }) {
  if (points.length < 2) return null;
  return <DatedChart points={points.map((p) => ({ date: p.date, value: p.value }))} color={color} />;
}

/** The repeated session's own line, week by week — it exists only inside the block. */
function SessionChart({ points, color, valueOf }: {
  points: NamedPoint[]; color: string; valueOf: (p: NamedPoint) => number | null;
}) {
  const usable = points.map((p) => ({ date: p.date, value: valueOf(p) })).filter((p) => p.value != null) as Array<{ date: string; value: number }>;
  if (usable.length < 2) return null;
  return <DatedChart points={usable} color={color} />;
}

/**
 * ⛔ NOW A THIN ADAPTER OVER THE SHARED `TrendSparkline` (Round 3 pass 2, 2026-09-01) — one chart
 * language across the whole screen. It kept its own SVG (dates-only caption, no expand) until now;
 * the endurance cards read better matching the strength model, and the four caption phrasings the
 * screen carried collapse to the one `TrendSparkline` prints.
 * `dotNoun` names the reading for the expanded caption; the callers pass their sport's word.
 * ⚠️ NO UNIT PASSED — efficiency is an index, so the range is suppressed (the shape is the message),
 * exactly as before.
 */
// The chart is one colour now (2026-09-04); `recent` is carried only because the series type asks for it.
function DatedChart({ points, color, dotNoun = 'session', fmtVal, unit, trendWord, title, keyLine, divider }: { points: Array<{ date: string; value: number }>; color: string; dotNoun?: string; title?: string; keyLine?: string; divider?: boolean; fmtVal?: (v: number) => string; unit?: string; trendWord?: string }) {
  const series = points.map((p) => ({ date: p.date, value: p.value, recent: true }));
  return <TrendSparkline series={series} color={color} dotNoun={dotNoun} {...(fmtVal ? { fmtVal } : {})} {...(unit ? { unit } : {})} trendline={!!trendWord} trendWord={trendWord} title={title} keyLine={keyLine} divider={divider} />;
}

export default EnduranceReadCards;
