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
  efficiency: number | null; driftPct: number | null; driftBasis?: 'gap' | 'raw' | 'hr' | null; driftWholeSession?: boolean; keySessionWithin24h: boolean;
};
type NamedSession = {
  family: string; sport: string; label: string; points: NamedPoint[];
  reference?: { metric: string; unit: string; points: Array<{ date: string; value: number; status: string }> } | null;
};

type SpinePoint = {
  date: string; hrAvg: number | null; durationMin: number | null;
  efficiency: number | null; driftPct: number | null; driftBasis?: 'gap' | 'raw' | 'hr' | null; driftWholeSession?: boolean; fadeWithheld: boolean; keySessionWithin24h: boolean;
 tempF?: number | null; elevationGainM?: number | null; };
type SpineSeries = { sport: string; group: string; points: SpinePoint[] };

/** ⛔ THE SPINE'S GROUPS IN THE ATHLETE'S OWN WORDS. No invented vocabulary on a screen. */
const GROUP_LABEL: Record<string, string> = {
  easy: 'easy runs', long: 'long runs', quality: 'hard runs', all: 'rides',
};
/** ⛔ THE SPINE LEADS, THE OVERLAY FOLLOWS — easy first, then long, then quality, then rides. */
const GROUP_ORDER = ['easy', 'long', 'quality', 'all'];

/** 2026-09-03 (Michael: the hills-and-heat line "feels lost in the threshold line" — it should blanket easy and
 *  hard). The run plate renders it ONCE, as the card's last line under the workload chart, via this export;
 *  the ride plate keeps it inline. Same words as before, copy unchanged. */
export function EnduranceConditionsLine() {
  return (
    <div className="px-3 pb-3 text-[11px] text-white/55">
      Hills and heat can have an impact. Trust your RPE, but be honest.
    </div>
  );
}

export function EnduranceReadCards(
  { sessions, spine, sport, footer = true }: { sessions?: NamedSession[] | null; spine?: SpineSeries[] | null; sport?: 'run' | 'ride'; footer?: boolean },
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
  // when any card carries a line to read (≥2 points); a lone reading has no trend to caution about.
  const hasLine = spineList.some((s) => (s.points ?? []).filter((p) => p.efficiency != null).length >= 2)
    || list.some((s) => (s.points ?? []).length >= 2);
  return (
    <>
      {spineList.map((s) => <SpineCard key={`spine:${s.sport}:${s.group}`} series={s} />)}
      {list.map((s) => <EnduranceCard key={`${s.sport}:${s.family}`} session={s} />)}
      {hasLine && footer && (
        <div className="px-3 pb-3 text-[11px] text-white/55">
          {/* ⛔ "watch the line over a few weeks" cut (2026-09-01) — a coaching instruction. The fact
              before it is real and stays: conditions move this more than fitness does. */}
          {/* Michael 2026-09-02. By the book: p235 (effort at easy varies with fatigue, hydration and
              environment; check by talk test), p123 (reported effort is one of the three signals). */}
          Hills and heat can have an impact. Trust your RPE, but be honest.
        </div>
      )}
    </>
  );
}

/**
 * ⛔ ONE GROUP OF SESSIONS, COMPARED TO ITSELF. Dates, never block weeks — a rebuilt block cannot
 * empty this card, which is the whole reason the spine exists beside the overlay.
 */
// ⓘ copy, Michael 2026-09-02 (voice-checked): what the two run numbers mean, in plain words.
const EF_EXPLAIN = 'How much speed each heartbeat buys you on easy runs. Higher means the same heart rate is moving you faster. It creeps up with fitness over weeks and drops on hot days.';
const DECOUPLING_EXPLAIN = `Did your heart rate creep up as the run went on? This is how much higher it was in the second half than in the first, at the same pace. The book's rule for athletes training many sessions a week: stop an easy session when it reaches ${DRIFT_LIMITS.hybridPct}%. Under the line is room; over it is the sign to dial back next time. Heat, tiredness, or a run that was too long push it up. TrainingPeaks calls this decoupling.`;

/** "1.9 of room" / "0.4 over" against p107's line. */
function driftVsLine(pct: number): string {
  const line = DRIFT_LIMITS.hybridPct;
  // 2026-09-03 (Michael read "−1.6% · 6.6 of room" as wrong): a FALL in heart rate has no room to compute —
  // it is simply under the line. Room and over are printed only for a rise.
  // (Michael, same day: "I don't know if it's even worth saying you've got room.") It is not. The line
  // is stated; being over it is stated; nothing else.
  const d = Math.round((pct - line) * 10) / 10;
  return d > 0 ? `${d.toFixed(1)} over the line` : '';
}

function SpineCard({ series }: { series: SpineSeries }) {
  const [efOpen, setEfOpen] = React.useState(false);
  const [decOpen, setDecOpen] = React.useState(false);
  const pts = series.points;
  const latest = pts[pts.length - 1];
  const prior = pts.length > 1 ? pts[pts.length - 2] : null;
  const isRide = series.sport === 'ride';
  const color = getDisciplineColor(isRide ? 'ride' : 'run');
  const label = GROUP_LABEL[series.group] ?? `${series.sport} sessions`;
  const eff = pts.map((p) => ({ date: p.date, value: p.efficiency })).filter((p) => p.value != null) as Array<{ date: string; value: number }>;
  // the day's conditions as facts — heat and climb move drift, and whether the athlete was pushing is theirs to read
  const conditions = [
    latest.tempF != null ? `${latest.tempF}°F` : null,
    latest.elevationGainM != null && latest.elevationGainM > 0 ? `${Math.round(latest.elevationGainM * 3.281)} ft of climb` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="px-3 py-3 border-t border-white/[0.055] first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-white/80">{label}</span>
        {/* ⚠️ THE COUNT, NOT A WEEK NUMBER. This card has no block axis by construction. */}
        <span className="text-[11px] text-white/60 tabular-nums">{pts.length} logged</span>
      </div>

      {latest.efficiency != null && (
        <>
          {/**
            * ⛔ THE FIELD'S NAME, NOT OURS (2026-08-29, Michael: *"does anyone know what speed per
            * beat means?"* — no, nobody, it was ours). TrainingPeaks calls this Efficiency Factor
            * and defines it exactly as we compute it: graded pace ÷ average heart rate for a run,
            * normalized power ÷ average heart rate for a ride. A runner who tracks this knows the
            * name; nobody knows "speed per beat".
            */}
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="readout-num text-[26px] leading-none">{fmtEff(latest.efficiency, isRide)}</span>
            <button type="button" onClick={() => setEfOpen((o) => !o)} aria-label="What is efficiency factor?" className="text-[12px] text-white/60 bg-transparent border-none p-0 cursor-pointer">
              efficiency factor <span className="text-white/45 text-[11px]">{efOpen ? '▾' : 'ⓘ'}</span>
            </button>
          </div>
          <div className="text-[11px] text-white/55 mt-0.5">
            {isRide ? 'watts per heartbeat' : 'pace per heartbeat'} · higher is better
          </div>
          {efOpen && (
            <p className="mt-1 text-[12px] text-white/55 leading-snug max-w-[min(100%,340px)]">
              {isRide ? EF_EXPLAIN.replace('speed', 'power').replace('easy runs', 'rides').replace('moving you faster', 'making more power') : EF_EXPLAIN}
            </p>
          )}
          {/**
            * ⛔⛔ "last time 1.720" IS DELETED, AND THE SOURCE SAYS WHY. TrainingPeaks' instruction is
            * to compare SIMILAR sessions over several weeks — a rising line means the aerobic base is
            * improving — and explicitly not to read one session against the one before it, because a
            * single hot or hilly day moves the number more than fitness does. The card put that exact
            * comparison in the athlete's eye and it was the first thing he read.
            * ⚠️ THE TREND IS ALREADY ON THIS CARD: the line below, with its own date range.
            */}
        </>
      )}
      {eff.length >= 2 && <DatedChart points={eff} color={color} dotNoun={isRide ? 'ride' : 'run'} />}

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
      {!isRide && latest.driftPct != null && !latest.fadeWithheld && (
        <div className="text-[11px] text-white/55 mt-1">
          <button type="button" onClick={() => setDecOpen((o) => !o)} aria-label="What is decoupling?" className="bg-transparent border-none p-0 cursor-pointer text-white/55 text-[11px]">
            {latest.driftPct <= 0 ? <>heart rate fell <span className="tabular-nums text-white/75">{Math.abs(latest.driftPct).toFixed(1)}%</span> in the second half</> : <>heart rate drift <span className="tabular-nums text-white/75">{latest.driftPct.toFixed(1)}%</span></>} on the latest run{latest.driftWholeSession ? ' (whole session, intervals included)' : ''} · line {DRIFT_LIMITS.hybridPct}%{driftVsLine(latest.driftPct) ? <> · <span className="text-white/75">{driftVsLine(latest.driftPct)}</span></> : null}{conditions ? <span className="text-white/45"> · {conditions}</span> : null} <span className="text-white/45">{decOpen ? '▾' : 'ⓘ'}</span>
          </button>
          {decOpen && <p className="mt-1 text-[12px] text-white/55 leading-snug max-w-[min(100%,340px)]">{DECOUPLING_EXPLAIN}</p>}
        </div>
      )}
      {latest.durationMin != null && latest.durationMin > 0 && (
        <div className="text-[11px] text-white/55 mt-1">{latest.durationMin} min long</div>
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

      {durLabel && <div className="text-[11px] text-white/55 mt-1">same {durLabel} session</div>}
    </div>
  );
}

/** Watts per beat reads to two decimals; metres-per-second per beat needs three. */
function fmtEff(v: number, isRide: boolean): string {
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
 * ⚠️ `recent` IS COMPUTED HERE — the endurance points carry no recent flag (unlike the e1RM series),
 * so the last-six-weeks tail is coloured by date, the same "recent 6 weeks in color" the other charts
 * use. `dotNoun` names the reading for the expanded caption; the callers pass their sport's word.
 * ⚠️ NO UNIT PASSED — efficiency is an index, so the range is suppressed (the shape is the message),
 * exactly as before.
 */
const RECENT_WINDOW_MS = 42 * 86_400_000;
function DatedChart({ points, color, dotNoun = 'session' }: { points: Array<{ date: string; value: number }>; color: string; dotNoun?: string }) {
  const lastT = Date.parse(`${points[points.length - 1].date}T12:00:00Z`);
  const series = points.map((p) => ({
    date: p.date,
    value: p.value,
    recent: lastT - Date.parse(`${p.date}T12:00:00Z`) <= RECENT_WINDOW_MS,
  }));
  return <TrendSparkline series={series} color={color} dotNoun={dotNoun} />;
}

export default EnduranceReadCards;
