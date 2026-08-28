/**
 * THE STRENGTH READ — one card per main lift, heavy days only. [2026-08-28, work order item 1]
 *
 * ⛔ IT RENDERS AND DOES NOT DECIDE. The word is the ladder's own `meSessionOutcome`, mapped at this
 * edge; the weight and reps are one stored reading; the line is the heavy-only e1RM series with its
 * week index already resolved server-side. Nothing here computes a verdict, a week, or a trend.
 *
 * ⛔ HEAVY SETS ONLY, EVERYWHERE. The line is gated in `state-trend/assemble.ts` and the word comes
 * from ME sessions only. On a Viada block the same lift is prescribed twenty percent apart in one
 * week — bench 135 heavy, 105 speed — and a speed set may move none of this.
 *
 * ⛔ NO EMPTY STATE, RULED. A lift with no heavy session logged in the block does not render; if
 * none do, the section does not appear. Week 1 is the two tests, so an empty first week is the
 * block's shape rather than a defect.
 *
 * ⚠️ THIS CHART IS ITS OWN, AND THAT IS DELIBERATE RATHER THAN A SECOND COPY. `TrendSparkline` is
 * shared by the run, bike and strength rows and is built around DATES, one series, and a tap-to-
 * expand affordance. This axis is BLOCK WEEKS, it carries a second faint series, it marks where the
 * athlete is, and it does not expand — four props no other caller would ever pass, replacing most of
 * that component's chrome. The DATA series is not duplicated: it is the same server-gated series,
 * read once. ⚠️ If a third surface ever wants this shape, extract it then, not now.
 */

import React from 'react';
import { strengthReadCards, type StrengthReadCard } from '@/lib/strength-read';
import { getDisciplineColor } from '@/lib/context-utils';

type SeriesPoint = { date: string; value: number; recent: boolean; week?: number };

/** ⚠️ Matched on the lift's canonical name, which is how the series is keyed. */
type LiftSeriesByCanonical = Record<string, SeriesPoint[] | undefined>;

const BLOCK_WEEKS = 12;

/**
 * ⛔⛔ THE LINE IS THE ATHLETE'S, NOT THE BLOCK'S (ruled 2026-08-28). It plots every heavy reading in
 * the chart window regardless of which block produced it, because a lifted weight does not stop
 * being the athlete's because the app rebuilt their plan. Michael's own framing for the customer
 * this is for: *"I ride a lot, I want to get stronger, I want the scaffolding of a program."* That
 * person thinks in bench numbers, not in blocks, and a strength line that resets on a rebuild is the
 * thing that makes them close the app.
 *
 * ⛔ THE FAINT CURVE IS THE BLOCK'S AND STARTS WHERE THE BLOCK STARTS. Two clocks on one chart, and
 * that is the correct answer rather than a compromise: "am I stronger" and "am I doing this
 * programme" are different questions, and only the second is about the programme.
 *
 * ⚠️ SO THE AXIS IS DATES, NOT BLOCK WEEKS. The week index still rides on each point — it is the
 * only honest way to write "week 6", since a client cannot derive it without re-deriving block
 * starts — but it labels, it no longer positions.
 */
function ReadChart({ points, expected }: {
  points: SeriesPoint[];
  expected?: Array<{ date: string; value: number }>;
}) {
  if (points.length < 2) return null;
  const W = 300, H = 46, PAD_Y = 6, PAD_X = 2;

  const t = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
  // ⚠️ The domain is the READINGS' own span. The curve is clipped to it rather than stretching the
  // axis — a block that ends next month must not squash the athlete's history into the left half.
  const t0 = t(points[0].date), t1 = t(points[points.length - 1].date);
  const span = Math.max(1, t1 - t0);
  const ghost = (expected ?? []).filter((p) => t(p.date) >= t0 && t(p.date) <= t1);

  const vals = [...points.map((p) => p.value), ...ghost.map((p) => p.value)];
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const center = (minV + maxV) / 2 || 1;
  // The same noise floor the shared chart uses: an e1RM wobbles a few percent session to session,
  // and a domain stretched to the data turns that into a cliff.
  const dRange = Math.max((maxV - minV) * 1.3, center * 0.25, 1e-6);
  const dMin = center - dRange / 2;
  const x = (iso: string) => PAD_X + ((t(iso) - t0) / span) * (W - 2 * PAD_X);
  const y = (v: number) => PAD_Y + (1 - (v - dMin) / dRange) * (H - 2 * PAD_Y);

  const last = points[points.length - 1];
  const color = getDisciplineColor('strength');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtD = (iso: string) => { const [, m, d] = iso.split('-'); return `${MON[+m - 1]} ${+d}`; };

  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block">
        {/* ⚠️ The programme's shape, and it decides nothing — the word comes from completed reps. */}
        {ghost.length > 1 && (
          <polyline points={ghost.map((p) => `${x(p.date)},${y(p.value)}`).join(' ')}
            fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
        <polyline points={points.map((p) => `${x(p.date)},${y(p.value)}`).join(' ')}
          fill="none" stroke={color} strokeOpacity={0.9} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => <circle key={i} cx={x(p.date)} cy={y(p.value)} r={1.6} fill={color} fillOpacity={0.55} />)}
        <circle cx={x(last.date)} cy={y(last.value)} r={2.5} fill={color} />
      </svg>
      <div className="flex items-baseline justify-between text-[10px] text-white/35 tabular-nums mt-0.5">
        <span>{fmtD(points[0].date)}</span>
        {/* ⚠️ The week LABELS the latest reading; it does not place it. Absent when that reading came
            from before the current block — a session from a deleted block is not week 1 of this one. */}
        <span className="text-white/45">
          {Number.isFinite(last.week as number) ? `you are here · week ${last.week}` : 'latest'}
        </span>
        <span>{fmtD(last.date)}</span>
      </div>
    </div>
  );
}

function Card({ card, points, expected }: { card: StrengthReadCard; points?: SeriesPoint[]; expected?: Array<{ date: string; value: number }> }) {
  const reps = card.recentReps;
  const lastReps = reps.length > 0 ? reps[reps.length - 1] : null;
  const firstReps = reps.length > 1 ? reps[0] : null;
  return (
    <div className="px-3 py-3 border-t border-white/[0.055] first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-white/80">{card.movement}</span>
        {/* ⚠️ ONE WORD, NO COLOUR CODING. "Stalled" is a fact about a session, not an alarm — and a
            red chip on a screen a lifter reads mid-block is a judgement this app does not make. */}
        <span className="text-[11px] uppercase tracking-[0.08em] text-white/55">{card.word}</span>
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="readout-num text-[26px] leading-none">{card.atWeight}</span>
        <span className="text-[12px] text-white/45">lb</span>
      </div>
      {lastReps != null && (
        <div className="text-[12px] text-white/50 mt-1">
          last time <span className="tabular-nums text-white/75">{lastReps} reps</span>
          {/* ⚠️ Only when there IS an earlier reading at this weight. More reps under the same bar is
              the progress this plan produces between increments — but two numbers where the second
              is the first would state a comparison that has not happened yet. */}
          {firstReps != null && (
            <span className="text-white/35"> · first at this weight <span className="tabular-nums">{firstReps}</span></span>
          )}
        </div>
      )}
      <ReadChart points={points ?? []} expected={expected} />
    </div>
  );
}

export function StrengthReadCards({
  meHistory,
  seriesByCanonical,
  expectedByCanonical,
}: {
  meHistory?: {
    history: Partial<Record<string, Array<{ week: number; day: string; movement: string; outcome: string }>>>;
    last_reps: Partial<Record<string, number[]>> | null;
    at_weight: Partial<Record<string, number>> | null;
  } | null;
  seriesByCanonical?: LiftSeriesByCanonical;
  /** ⛔ The block's expected curve per lift — block-scoped while the readings are not. */
  expectedByCanonical?: Record<string, Array<{ date: string; value: number }> | undefined>;
}) {
  const cards = strengthReadCards({
    history: meHistory?.history,
    lastReps: meHistory?.last_reps,
    atWeight: meHistory?.at_weight,
  });
  if (cards.length === 0) return null;

  return (
    <>
      {cards.map((c) => (
        <Card
          key={c.pattern}
          card={c}
          // ⚠️ Matched on the movement's canonical key. A lift the series does not carry renders the
          // card WITHOUT a line rather than not at all — the weight, the reps and the word are the
          // reading; the line is the long view behind it.
          points={seriesByCanonical?.[canonicalKey(c.movement)]}
          expected={expectedByCanonical?.[canonicalKey(c.movement)]}
        />
      ))}
    </>
  );
}

/**
 * ⚠️ THE SERIES IS KEYED BY CANONICAL NAME AND THE HISTORY BY THE MOVEMENT AS THE BLOCK NAMED IT.
 * This is the app's own canonical form — lowercase, underscores — and it is the same shape
 * `canonicalize` produces for the common cases. ⛔ It is a KEY LOOKUP ONLY: a miss costs the card
 * its line and nothing else, so this can never put a wrong number on screen.
 */
function canonicalKey(movement: string): string {
  return movement.trim().toLowerCase().replace(/\s+/g, '_');
}

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
  efficiency: number | null; driftPct: number | null; keySessionWithin24h: boolean;
};
type NamedSession = {
  family: string; sport: string; label: string; points: NamedPoint[];
  reference?: { metric: string; unit: string; points: Array<{ date: string; value: number; status: string }> } | null;
};

export function EnduranceReadCards({ sessions }: { sessions?: NamedSession[] | null }) {
  const list = (sessions ?? []).filter((s) => (s?.points?.length ?? 0) > 0);
  if (list.length === 0) return null;
  return <>{list.map((s) => <EnduranceCard key={`${s.sport}:${s.family}`} session={s} />)}</>;
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

  const driftLimit = latest.keySessionWithin24h ? DRIFT_KEY_SESSION_PCT : DRIFT_STANDARD_PCT;

  return (
    <div className="px-3 py-3 border-t border-white/[0.055] first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-white/80">{session.label}</span>
        <span className="text-[11px] text-white/45 tabular-nums">week {latest.week}</span>
      </div>

      {/* ── ROW 1: the reference number. Ride only — see the header. ── */}
      {refLatest ? (
        <>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="readout-num text-[26px] leading-none">{Math.round(refLatest.value)}</span>
            <span className="text-[12px] text-white/45">{ref!.unit} threshold</span>
          </div>
          <RefChart points={ref!.points} color={color} />
        </>
      ) : (
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="readout-num text-[26px] leading-none">{latest.hrAvg}</span>
          <span className="text-[12px] text-white/45">bpm avg</span>
        </div>
      )}

      {/* ── ROW 2: cost per session. ── */}
      {latest.efficiency != null && (
        <div className="text-[12px] text-white/50 mt-2">
          {isRide ? 'watts per beat' : 'speed per beat'}{' '}
          <span className="tabular-nums text-white/75">{fmtEff(latest.efficiency, isRide)}</span>
          {/* ⚠️ Only when there IS an earlier reading of the same session. One number is not a trend,
              and a second number that is the first would state a comparison that has not happened. */}
          {prior?.efficiency != null && (
            <span className="text-white/35"> · week {prior.week} <span className="tabular-nums">{fmtEff(prior.efficiency, isRide)}</span></span>
          )}
        </div>
      )}
      <SessionChart points={pts} color={color} valueOf={(p) => (p.efficiency ?? null)} />

      {/* ── ROW 3: fade inside the session, against p107. ── */}
      {latest.driftPct != null && (
        <div className="text-[12px] text-white/50 mt-2">
          fade <span className="tabular-nums text-white/75">{latest.driftPct.toFixed(1)}%</span>
          {/* ⛔ THE LINE IS STATED BESIDE THE NUMBER AND NOTHING IS GRADED. p107 gives 10%, and 5%
              when a key session falls within 24 hours — the app knows what tomorrow is, so it says
              which line applies. ⚠️ No verdict word: that was not ruled, and "fine"/"too much" off a
              single session's HR is a claim this app does not make unasked. */}
          <span className="text-white/35">
            {' '}· {session.label.toLowerCase().includes('ride') ? 'his' : 'the source’s'} line is {driftLimit}%
            {latest.keySessionWithin24h ? ' — a key session is inside 24 hours' : ''}
          </span>
        </div>
      )}

      {durLabel && <div className="text-[11px] text-white/35 mt-1">same {durLabel} session</div>}
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

function DatedChart({ points, color }: { points: Array<{ date: string; value: number }>; color: string }) {
  const W = 300, H = 40, PAD_Y = 5, PAD_X = 2;
  const t = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
  const t0 = t(points[0].date), t1 = t(points[points.length - 1].date);
  const span = Math.max(1, t1 - t0);
  const vals = points.map((p) => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const center = (minV + maxV) / 2 || 1;
  // The same noise floor the other charts use: a few percent of session-to-session wobble must not
  // fill the height and read as a cliff.
  const dRange = Math.max((maxV - minV) * 1.3, center * 0.08, 1e-6);
  const dMin = center - dRange / 2;
  const x = (iso: string) => PAD_X + ((t(iso) - t0) / span) * (W - 2 * PAD_X);
  const y = (v: number) => PAD_Y + (1 - (v - dMin) / dRange) * (H - 2 * PAD_Y);
  const last = points[points.length - 1];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtD = (iso: string) => { const [, m, d] = iso.split('-'); return `${MON[+m - 1]} ${+d}`; };
  return (
    <div className="mt-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block">
        <polyline points={points.map((p) => `${x(p.date)},${y(p.value)}`).join(' ')}
          fill="none" stroke={color} strokeOpacity={0.9} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => <circle key={i} cx={x(p.date)} cy={y(p.value)} r={1.6} fill={color} fillOpacity={0.55} />)}
        <circle cx={x(last.date)} cy={y(last.value)} r={2.5} fill={color} />
      </svg>
      <div className="flex items-baseline justify-between text-[10px] text-white/30 tabular-nums mt-0.5">
        <span>{fmtD(points[0].date)}</span><span>{fmtD(last.date)}</span>
      </div>
    </div>
  );
}

export default StrengthReadCards;
