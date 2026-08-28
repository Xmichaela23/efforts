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
 * THE RUN CARD — one named session, repeated, and its heart rate. [work order item 2]
 *
 * ⛔ THE SAME SESSION EVERY WEEK IS THE POINT. A standing block prescribes the identical
 * near-threshold run every week by design (p120), so the workout does not change and any change in
 * the line is the athlete. ⚠️ It does NOT replace the existing run row, which trends efficiency and
 * decoupling across ALL steady runs — a different question, where route and weather move too.
 *
 * ⛔ A WEEK MISSING FROM THIS LINE IS A MISSING LINK, NOT A MISSING RUN. The session is identified
 * by its planned row's family tag, reached through the attach at ingest. The server does not guess
 * from day-of-week and duration, and neither does this.
 */
export function NamedRunCard({ session }: {
  session?: {
    family: string;
    label: string;
    points: Array<{ week: number; date: string; hrAvg: number; durationMin: number | null }>;
  } | null;
}) {
  const pts = session?.points ?? [];
  // ⛔ NO EMPTY STATE — one logged session is a card, none is no card. Ruled 2026-08-28.
  if (pts.length === 0) return null;
  const latest = pts[pts.length - 1];
  const prior = pts.length > 1 ? pts[pts.length - 2] : null;
  const durMin = latest.durationMin;
  const durLabel = durMin != null && durMin > 0
    ? `${Math.floor(durMin / 60) > 0 ? `${Math.floor(durMin / 60)}h ` : ''}${String(durMin % 60).padStart(2, '0')}m`
    : null;

  return (
    <div className="px-3 py-3 border-t border-white/[0.055] first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-white/80">{session!.label}</span>
        <span className="text-[11px] text-white/45 tabular-nums">week {latest.week}</span>
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="readout-num text-[26px] leading-none">{latest.hrAvg}</span>
        <span className="text-[12px] text-white/45">bpm avg</span>
      </div>
      {/* ⚠️ NO VERDICT WORD HERE. "Getting easier" would be a claim about fitness read off one
          number against one earlier number, and a heart rate moves with sleep, heat and caffeine.
          The card states the readings and lets the line be the argument — the same discipline the
          lift cards keep by taking their word from completed reps rather than from a curve. */}
      {prior && (
        <div className="text-[12px] text-white/50 mt-1">
          week {prior.week} · <span className="tabular-nums text-white/75">{prior.hrAvg} bpm</span>
        </div>
      )}
      {durLabel && <div className="text-[11px] text-white/35 mt-0.5">same {durLabel} session</div>}
      <RunChart points={pts} />
    </div>
  );
}

function RunChart({ points }: { points: Array<{ week: number; hrAvg: number }> }) {
  if (points.length < 2) return null;
  const W = 300, H = 46, PAD_Y = 6, PAD_X = 2;
  const weeks = Math.max(BLOCK_WEEKS, ...points.map((p) => p.week));
  const vals = points.map((p) => p.hrAvg);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const center = (minV + maxV) / 2 || 1;
  // The same noise floor the lift chart uses, for the same reason: heart rate wobbles a few beats
  // session to session and a domain stretched to the data turns that into a cliff.
  const dRange = Math.max((maxV - minV) * 1.3, center * 0.08, 1e-6);
  const dMin = center - dRange / 2;
  const x = (week: number) => PAD_X + ((week - 1) / Math.max(1, weeks - 1)) * (W - 2 * PAD_X);
  // ⚠️ LOWER IS HIGHER ON THIS CHART IS **NOT** DONE. A falling heart rate at the same work is the
  // good direction, and drawing it as a rising line would flatter the reading. The line goes down,
  // and the reader is told what the session was.
  const y = (v: number) => PAD_Y + (1 - (v - dMin) / dRange) * (H - 2 * PAD_Y);
  const color = getDisciplineColor('run');
  const last = points[points.length - 1];
  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block">
        <polyline
          points={points.map((p) => `${x(p.week)},${y(p.hrAvg)}`).join(' ')}
          fill="none" stroke={color} strokeOpacity={0.9} strokeWidth={1.75} vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => <circle key={i} cx={x(p.week)} cy={y(p.hrAvg)} r={1.6} fill={color} fillOpacity={0.55} />)}
        <circle cx={x(last.week)} cy={y(last.hrAvg)} r={2.5} fill={color} />
      </svg>
      <div className="flex items-baseline justify-between text-[10px] text-white/35 tabular-nums mt-0.5">
        <span>week 1</span>
        <span className="text-white/45">you are here · week {last.week}</span>
        <span>{weeks}</span>
      </div>
    </div>
  );
}

export default StrengthReadCards;
