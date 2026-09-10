import React from 'react';
import { ChevronDown } from 'lucide-react';
import CardDeck, { deckGlass, type CardEmphasis, type DeckItem } from './CardDeck';
import { getExerciseConfig } from '@/lib/exercise-config';
import { getDisciplineColor, getDisciplineColorRgb } from '@/lib/context-utils';
import { displayDisciplineOf, normalizeDistanceKm } from '@/lib/utils';
import { extractSessionDetailV1FromWorkout } from '@/hooks/useWorkoutDetail';
import AdherenceChips from './AdherenceChips';
import { ProviderAttributionLine } from './ProviderAttribution';
import { deriveWorkoutTitle } from '@/lib/derive-workout-title';
// ⛔ THE MACHINE'S NAME IS MICHAEL'S WORD, from the one file that holds the swap sheet's words.
import { VENUE_LABEL } from '@shared/session-swap/copy.ts';
import { venueOf } from '@/lib/session-discipline-swap';
import { formatSessionDuration } from './PlannedSessionHeader';
import {
  liftLinesFor,
  enduranceLinesFor,
  spacingLineFor,
  isStrengthRow,
  isEnduranceRow,
  isFromPlan,
  type TodayRow,
} from '@/lib/today-lines';

/**
 * ═══ THE DECK ════════════════════════════════════════════════════════════════════════════════════
 *
 * docs/WORKORDER-today-screen-2026-09-09.md §3d, built from docs/mockups/today-deck-2026-09-09.html.
 * Michael: the screen "looks like a wall of words" and should be "something cool, floating".
 *
 * ⛔ A LIFT IS A DECK, A RIDE IS A CARD. Five rows of movement + kind + cue stacked vertically is
 * the wall; one row at a time, swiped, is the same information with the reading order made explicit.
 * An endurance session is ONE row of information already, so it stays one card and does not pretend
 * to be a stack.
 *
 * ⛔ NOTHING ABOUT THE WORDS CHANGES. Every line is the approved one, straight from
 * `@/lib/today-lines` — this file draws them and never writes one. The only text it adds is the
 * row's own weight and the `n of N` counter, both data.
 *
 * ⛔ THE SWIPE, THE DEPTH, THE DOTS AND THE GLASS ARE `CardDeck`'s — one mechanic, shared with the
 * open LOAD card's deck. This file owns only what a session card SAYS.
 */

/**
 * ⛔ ONE CLASSIFIER FOR "IS THIS ON A BAR" — the app's existing `displayFormat === 'total'`, the same
 * test the logger runs before a speed row may say "bar".
 */
const barLoaded = (movement: string): boolean =>
  getExerciseConfig(movement)?.displayFormat === 'total';

/**
 * The row's weight, top right (§3d). ⚠️ DATA, NEVER A PRESCRIPTION THIS FILE WRITES: `weight_display`
 * is what the server priced, in the athlete's unit, and a string `weight` is the composer's own
 * literal (`By feel` on an auto-regulated row). Nothing is invented when both are absent — the corner
 * stays empty.
 * ⛔ A BARE NUMBER IS NOT LABELLED HERE ANY MORE (2026-09-10, audit H-T06). This rounded it and added
 * "lb" or "kg" from the phone's units with no conversion; materialize-plan stamps the label on the row.
 */
function weightLabelFor(ex: Record<string, unknown> | undefined): string | null {
  const display = ex?.weight_display;
  if (typeof display === 'string' && display.trim()) return display.trim();
  const raw = ex?.weight;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

export type DeckCard = { key: string; name: string; kind: string | null; cue: string | null; meta: string | null };

/** The rows a lift or plyo session becomes, in the row's order. */
export function deckCardsFor(session: TodayRow, useImperial: boolean): DeckCard[] {
  const rows = Array.isArray((session as { strength_exercises?: unknown }).strength_exercises)
    ? ((session as { strength_exercises: Record<string, unknown>[] }).strength_exercises)
    : [];
  return liftLinesFor(session, barLoaded)
    .map((line, i) => ({
      key: line.key,
      name: line.movement,
      kind: line.kind,
      cue: line.cue,
      meta: weightLabelFor(rows[i]),
    }))
    .filter((c) => c.name);
}

// ── the day's spacing line ──────────────────────────────────────────────────────────────────────

/**
 * The day's spacing, above the sessions. ⛔ IT CARRIES NO SPORT COLOUR (§2b): it belongs to the day,
 * not to either session. Renders nothing unless the day is a lift and a ride or run.
 *
 * ⚠️ IT MOVED HERE FROM `TodaySessionLines`, which was deleted (2026-09-09). That component drew the
 * per-session lines BEFORE the deck existed and became unreachable when every planned session
 * started rendering as a deck or a card; the spacing line was the one piece of it still on screen.
 */
export const TodaySpacingLine: React.FC<{ rows: readonly TodayRow[] }> = ({ rows }) => {
  // ⛔ CLOSED BY DEFAULT (§2.1, 2026-09-10).
  const [open, setOpen] = React.useState(false);
  const spacing = spacingLineFor(rows);
  if (!spacing) return null;
  return (
    <div
      className="text-[13px] font-light leading-snug"
      /* 12 px to the first card (Michael, 2026-09-09). */
      style={{ color: 'rgba(255,255,255,0.72)', padding: '0 0.35rem 12px' }}
    >
      <div>{spacing.lead}</div>
      {/* ⛔ THE TAP THE LOAD CARD'S CHEVRON HAD: the words left, the chevron at the far right, turning
          over when open. ⚠️ No chevron where there is nothing under it (a swim day). */}
      {spacing.closer ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-0.5 flex w-full items-center justify-between bg-transparent border-none p-0 text-left cursor-pointer text-[13px] font-light leading-snug"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            <span>{spacing.closerLabel}</span>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-white/40"
              aria-hidden="true"
              style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}
            />
          </button>
          {open ? (
            <div style={{ marginTop: 2, color: 'rgba(255,255,255,0.55)' }}>{spacing.closer}</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

// ── the deck ────────────────────────────────────────────────────────────────────────────────────

/**
 * A lift or the plyo day: one card per row, swiped.
 *
 * ⛔ THE SWIPE, THE DEPTH AND THE DOTS ARE `CardDeck`'s — the same mechanic the open LOAD card
 * runs. This file owns only what a session card SAYS.
 */
export const SessionDeck: React.FC<{
  title: string;
  cards: DeckCard[];
  /** A `SPORT_COLORS` key — the display discipline, so the plyo day is not strength orange. */
  sport: string;
  /** §3e.2 — first session of the day or not. See `CardEmphasis`. */
  emphasis?: CardEmphasis;
  onOpen?: () => void;
}> = ({ title, cards, sport, emphasis = 'lead', onOpen }) => {
  const colour = getDisciplineColor(sport);
  const rgb = getDisciplineColorRgb(sport);

  if (cards.length === 0) return null;

  const items: DeckItem[] = cards.map((c) => ({
    key: c.key,
    node: (
      <>
        {/* ⛔ THE WEIGHT SITS ON THE NAME LINE, RIGHT. It used to be absolutely positioned above
            the name, which cost the card a whole line for four characters. */}
        <div className="flex items-baseline justify-between gap-3">
          {/* ⛔ ONE STEP SMALLER WHEN IT IS NOT THE FIRST SESSION (§3e.2). */}
          <div
            className={`${emphasis === 'lead' ? 'text-[20px]' : 'text-[17px]'} font-semibold leading-tight min-w-0`}
            style={{ letterSpacing: '-0.01em', color: emphasis === 'lead' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.82)' }}
          >
            {c.name}
          </div>
          {c.meta ? (
            <div className="text-[13px] tabular-nums flex-shrink-0" style={{ color: 'rgba(255,255,255,0.38)' }}>
              {c.meta}
            </div>
          ) : null}
        </div>
        {c.kind ? (
          <div
            className="flex items-center gap-2 text-[12px] uppercase tracking-[0.08em]"
            style={{ color: colour, margin: '5px 0 8px' }}
          >
            <span
              aria-hidden="true"
              className="inline-block rounded-full flex-shrink-0"
              style={{ width: 7, height: 7, background: colour, boxShadow: `0 0 10px ${colour}` }}
            />
            {c.kind}
          </div>
        ) : null}
        {c.cue ? (
          <div
            className="text-[15px]"
            style={{ lineHeight: 1.35, color: 'rgba(255,255,255,0.92)', marginTop: c.kind ? 0 : 8 }}
          >
            {c.cue}
          </div>
        ) : null}
      </>
    ),
  }));

  return (
    <CardDeck
      items={items}
      colour={colour}
      rgb={rgb}
      header={title}
      emphasis={emphasis}
      onCardTap={onOpen}
      className="mb-[14px]"
    />
  );
};

// ── the lift card ───────────────────────────────────────────────────────────────────────────────

/**
 * ═══ §3h — A LIFT OR PLYO SESSION IS ONE CARD THAT OPENS, NOT A DECK ═════════════════════════════
 *
 * docs/WORKORDER-today-screen-2026-09-09.md §3h (Michael, 2026-09-10). Field basis: TrainingPeaks and
 * Runna show a session as a list with notes inline; Strong and Hevy are lists. Nothing in that set
 * swipes through exercises, and a swipe hid four of five movements behind a gesture.
 *
 * CLOSED — the name and estimated time, the first two exercises (name, kind word in the sport colour,
 * weight or `By feel` right, the approved cue under), and `N more`. OPEN — every exercise, in session
 * order. A tap anywhere on the card toggles it; the height animates and `prefers-reduced-motion`
 * turns that off.
 *
 * ⛔ THE CARD'S TAP IS THE ONLY TAP ON THE BODY. An exercise line has no handler of its own. ⛔ THE
 * DRAWER OPENS FROM THE SESSION NAME ONLY, and that tap does not also toggle — so opening the drawer
 * and reading the cues are two different targets rather than one gesture that does both.
 *
 * ⛔ NOTHING ABOUT THE WORDS CHANGES. Every cue is the approved one from `@/lib/today-lines`
 * (`liftLinesFor`), the plyo day's is its own note, and the only text this adds is data — the weight —
 * plus `By feel` and `N more`.
 */
const reducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export const LiftSessionCard: React.FC<{
  session: TodayRow;
  useImperial: boolean;
  emphasis?: CardEmphasis;
  onOpen?: () => void;
}> = ({ session, useImperial, emphasis = 'lead', onOpen }) => {
  const sport = displayDisciplineOf(session as never);
  const colour = getDisciplineColor(sport);
  const rgb = getDisciplineColorRgb(sport);
  const title = deriveWorkoutTitle(session as never);
  const meta = formatSessionDuration(session);
  const cards = deckCardsFor(session, useImperial);

  const [open, setOpen] = React.useState(false);
  const reduced = React.useMemo(reducedMotion, []);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const rowRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const [heights, setHeights] = React.useState<{ closed: number; full: number } | null>(null);

  /**
   * ⚠️ MEASURED, NOT GUESSED. A cue wraps to one line or three depending on the phone, so "the first
   * two exercises" is a pixel height only the rendered rows know. `ResizeObserver` keeps it true when
   * a font lands late or the phone rotates.
   */
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const full = list.scrollHeight;
      const second = rowRefs.current[Math.min(1, cards.length - 1)];
      const closed = second ? second.offsetTop + second.offsetHeight : full;
      setHeights((prev) => (prev && prev.closed === closed && prev.full === full ? prev : { closed, full }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [cards.length]);

  if (cards.length === 0) return null;
  const more = Math.max(0, cards.length - 2);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (more > 0) setOpen((o) => !o); }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && more > 0) { e.preventDefault(); setOpen((o) => !o); } }}
      className="w-full text-left"
      style={{ ...deckGlass(rgb, emphasis), padding: '14px 16px', margin: '0 0 14px', cursor: more > 0 ? 'pointer' : 'default' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* ⛔ THE ONE DOOR TO THE DRAWER. It stops the card's toggle so the two taps stay separate. */}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen?.(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onOpen?.(); } }}
          className={`${emphasis === 'lead' ? 'text-[20px]' : 'text-[17px]'} font-semibold leading-tight min-w-0 truncate`}
          style={{ color: colour, opacity: emphasis === 'lead' ? 1 : 0.86, cursor: 'pointer' }}
        >
          {title}
        </span>
        {meta ? (
          <span className="text-[13px] tabular-nums flex-shrink-0" style={{ color: 'rgba(255,255,255,0.62)' }}>{meta}</span>
        ) : null}
      </div>

      <div
        ref={listRef}
        style={{
          /* ⚠️ `position: relative` MAKES THIS THE ROWS' offsetParent. Without it `offsetTop` was measured
             from an ancestor above the header, so the closed height carried the header's height too and
             a third exercise's name line showed under the second (caught in the 390×844 screenshot). */
          position: 'relative',
          overflow: 'hidden',
          height: heights ? (open ? heights.full : heights.closed) : undefined,
          transition: reduced ? 'none' : 'height 320ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {cards.map((c, i) => (
          <div key={c.key} ref={(el) => { rowRefs.current[i] = el; }} style={{ paddingTop: i === 0 ? 10 : 12 }}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[16px] font-medium" style={{ color: 'rgba(255,255,255,0.95)' }}>{c.name}</span>
                {c.kind ? (
                  <span className="text-[11px] uppercase tracking-[0.08em] ml-2" style={{ color: colour }}>{c.kind}</span>
                ) : null}
              </div>
              <span className="text-[13px] tabular-nums flex-shrink-0" style={{ color: 'rgba(255,255,255,0.62)' }}>
                {c.meta ?? 'By feel'}
              </span>
            </div>
            {c.cue ? (
              <div className="text-[14px]" style={{ lineHeight: 1.35, marginTop: 3, color: 'rgba(255,255,255,0.72)' }}>{c.cue}</div>
            ) : null}
          </div>
        ))}
      </div>

      {!open && more > 0 ? (
        <div className="text-[13px]" style={{ marginTop: 10, color: 'rgba(255,255,255,0.55)' }}>{more} more</div>
      ) : null}
    </div>
  );
};

// ── the single card ─────────────────────────────────────────────────────────────────────────────

/** A ride or run: one card, name and time, the family line. Same glass object as a deck card. */
export const SessionCard: React.FC<{
  title: string;
  meta: string | null;
  lines: string[];
  sport: string;
  /** §3e.2 — first session of the day or not. See `CardEmphasis`. */
  emphasis?: CardEmphasis;
  onOpen?: () => void;
  venueLabel?: string | null;
}> = ({ title, meta, lines, sport, emphasis = 'lead', venueLabel, onOpen }) => {
  const colour = getDisciplineColor(sport);
  const rgb = getDisciplineColorRgb(sport);
  return (
    <button
      type="button"
      className="w-full text-left"
      /* ⚠️ SAME PADDING AND TYPE AS A DECK CARD, and no fixed height — the card is as tall as its
         family line and stop rule, nothing more. */
      style={{ ...deckGlass(rgb, emphasis), padding: '14px 16px', margin: '0 0 14px', cursor: 'pointer' }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen?.(); }}
    >
      {/* ⛔ THE TIME SITS ON THE NAME LINE, RIGHT — the same rule the deck card follows. */}
      <div className="flex items-baseline justify-between gap-3">
        {/* ⛔ ONE STEP SMALLER WHEN IT IS NOT THE FIRST SESSION (§3e.2). */}
        <div
          className={`${emphasis === 'lead' ? 'text-[20px]' : 'text-[17px]'} font-semibold leading-tight min-w-0`}
          style={{ color: colour, opacity: emphasis === 'lead' ? 1 : 0.86 }}
        >
          {title}
          {/* ⛔ THE MACHINE, BESIDE THE NAME (work order 2026-09-09 §1). It is the same session
              performed somewhere else, so it qualifies the name rather than replacing it. */}
          {venueLabel ? (
            <span className="text-[13px] font-light ml-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {venueLabel}
            </span>
          ) : null}
        </div>
        {meta ? (
          <div className="text-[13px] tabular-nums flex-shrink-0" style={{ color: 'rgba(255,255,255,0.62)' }}>
            {meta}
          </div>
        ) : null}
      </div>
      {lines.map((line, i) => (
        <div
          key={line}
          className="text-[15px]"
          style={{ lineHeight: 1.35, marginTop: i === 0 ? 8 : 6, color: i === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.62)' }}
        >
          {line}
        </div>
      ))}
    </button>
  );
};

// ── the completed card ──────────────────────────────────────────────────────────────────────────

/**
 * A session that is DONE. Same card object as a planned one, greyed: the sport colour at low alpha
 * on the edge and the glow, the title dimmed. ⛔ NO CUE LINES — the cues tell an athlete how to do
 * work that is still in front of them, and on a finished row they would be instructions for a set
 * already over.
 *
 * ⚠️ THIS REPLACES THE OLD PILL ROW for completed and brought-in sessions (Michael, 2026-09-09), so
 * Today is one object at three states — planned, done, and the deck — rather than two visual
 * languages on one list.
 *
 * ⛔ LINE 2 IS THE PERFORMANCE TAB'S OWN FOUR TILES, `AdherenceChips`, rendered rather than
 * reimplemented: Workload with the usual range, Execution, Duration of plan, and Drift against
 * p107's 5 percent line. SAME NUMBERS, SAME SOURCE, NOTHING RECOMPUTED — they come off
 * `workout_analysis.session_detail_v1`, the payload the Performance tab reads, which `get-week`
 * already carries on the row. ⚠️ NO SECOND FETCH: `extractSessionDetailV1FromWorkout` reads what is
 * in hand. A row whose analysis has not landed shows line 1 and no tiles, which is the honest state.
 */
const doneGlass = (rgb: string, emphasis: CardEmphasis = 'lead'): React.CSSProperties => ({
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(16,17,21,0.90), rgba(10,11,14,0.96))',
  // ⛔ THINNER EDGE, NO GLOW, WHEN IT IS NOT THE FIRST SESSION (§3e.2).
  border: `1px solid rgba(${rgb},${emphasis === 'lead' ? 0.18 : 0.10})`,
  boxShadow: emphasis === 'lead'
    ? `0 0 0 1px rgba(255,255,255,0.02) inset, 0 14px 40px rgba(0,0,0,0.5), 0 0 24px rgba(${rgb},0.06)`
    : `0 0 0 1px rgba(255,255,255,0.02) inset, 0 10px 28px rgba(0,0,0,0.45)`,
});

/** `5.0 mi · 48:00` for a run or ride; `3,725 lb · 3 lifts` for a lift session. */
export function doneHeadline(workout: Record<string, unknown>, useImperial: boolean): string | null {
  /**
   * ⛔ BOTH NUMBERS ARE THE SERVER'S (2026-09-10, audit H-D10 / H-T04).
   *   · The weight moved is `strength_volume_lb`. This summed reps × weight here and skipped every 0 lb
   *     set, so a chin-up, a band or an empty bar counted nothing on the card and something on the
   *     Performance tab for the same session.
   *   · The time is `moving_seconds`. It was the phone's moving-time resolver with the Performance
   *     payload's `completed_totals.duration_s` behind it — two readers, one number. A row the server
   *     sent no time for prints none.
   */
  const parts: string[] = [];
  if (String(workout?.type ?? '').toLowerCase() === 'strength') {
    const exercises = Array.isArray((workout as { executed?: { strength_exercises?: unknown } })?.executed?.strength_exercises)
      ? ((workout as { executed: { strength_exercises: Array<{ sets?: unknown[] }> } }).executed.strength_exercises)
      : Array.isArray(workout?.strength_exercises)
        ? (workout.strength_exercises as Array<{ sets?: unknown[] }>)
        : [];
    const volume = Number(workout?.strength_volume_lb) || 0;
    const lifts = exercises.filter((ex) => Array.isArray(ex?.sets) && ex.sets.length > 0).length;
    if (volume > 0) parts.push(`${Math.round(useImperial ? volume : volume * 0.453592).toLocaleString()} ${useImperial ? 'lb' : 'kg'}`);
    if (lifts > 0) parts.push(`${lifts} ${lifts === 1 ? 'lift' : 'lifts'}`);
    return parts.length ? parts.join(' · ') : null;
  }

  const km = normalizeDistanceKm(workout as never);
  if (km != null && Number.isFinite(km) && km > 0) {
    parts.push(useImperial ? `${(km * 0.621371).toFixed(1)} mi` : `${km.toFixed(1)} km`);
  }
  const secs = Number(workout?.moving_seconds);
  if (Number.isFinite(secs) && secs > 0) {
    const s = Math.round(secs);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    parts.push(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/**
 * ⛔ THE GOOD-NEWS LINE IS THE SERVER'S (2026-09-10, audit H-T14): `computed.session_boom_v1`, stored
 * by recompute-workout and sent on the get-week row. The drawer prints the same stored value as
 * `session_detail_v1.boom`. Nothing is worked out here.
 */
function boomLineOf(workout: Record<string, unknown>): string | null {
  let c: unknown = workout?.computed;
  if (typeof c === 'string') {
    try { c = JSON.parse(c); } catch { return null; }
  }
  const line = (c as { session_boom_v1?: { line?: unknown } } | null)?.session_boom_v1?.line;
  return typeof line === 'string' && line ? line : null;
}

export const CompletedSessionCard: React.FC<{
  workout: Record<string, unknown>;
  useImperial: boolean;
  /** §3e.2 — first session of the day or not. See `CardEmphasis`. */
  emphasis?: CardEmphasis;
  onOpen?: () => void;
}> = ({ workout, useImperial, emphasis = 'lead', onOpen }) => {
  const boom = boomLineOf(workout);
  const sport = displayDisciplineOf(workout as never);
  const colour = getDisciplineColor(sport);
  const rgb = getDisciplineColorRgb(sport);
  const headline = doneHeadline(workout, useImperial);

  const sd = extractSessionDetailV1FromWorkout(workout) as Parameters<typeof AdherenceChips>[0]['sessionDetail'];
  /* ⚠️ THE SAME GATE THE PERFORMANCE TAB APPLIES. `noPlannedCompare` is what turns the tiles off for
     a session with nothing to compare against; reading it here rather than inventing a rule keeps
     the two surfaces showing the tiles on exactly the same rows. */
  const noPlannedCompare = !(sd?.plan_context as { planned_id?: unknown } | undefined)?.planned_id;

  return (
    <button
      type="button"
      className="w-full text-left"
      style={{ ...doneGlass(rgb, emphasis), padding: '14px 16px', margin: '0 0 14px', cursor: 'pointer' }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen?.(); }}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* ⚠️ THE SPORT COLOUR AT LOW ALPHA — done, not gone. A flat grey title would lose which
            sport this was, which is the one thing the row still has to say at a glance. */}
        {/* ⛔ ONE STEP SMALLER WHEN IT IS NOT THE FIRST SESSION (§3e.2). */}
        <div
          className={`${emphasis === 'lead' ? 'text-[20px]' : 'text-[17px]'} font-semibold leading-tight min-w-0 truncate`}
          style={{ color: `${colour}${emphasis === 'lead' ? '8C' : '6E'}` }}
        >
          {deriveWorkoutTitle(workout as never)}
        </div>
        <span aria-label="Completed" className="text-[13px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.45)' }}>✓</span>
      </div>

      {/* ⛔ WHERE THE ROW CAME FROM, DIRECTLY UNDER THE NAME (docs/WORKORDER-garmin-strava-attribution-
          2026-09-09.md §1). Garmin API Brand Guidelines v6.30.2025: an overview card of Garmin
          device-sourced data carries "Garmin [device model]" "directly beneath or adjacent to the
          primary title", never in a tooltip. developers.strava.com/guidelines: the unaltered Powered
          by Strava mark for a Strava row; a Garmin device through Strava reads "Garmin [model] via
          Strava". The old pill row had this line and the card had dropped it. */}
      <ProviderAttributionLine workout={workout} className="block" style={{ marginTop: 3 }} />

      {headline ? (
        <div className="text-[15px] tabular-nums" style={{ lineHeight: 1.35, marginTop: 6, color: 'rgba(255,255,255,0.62)' }}>
          {headline}
        </div>
      ) : null}

      {/**
        * ⛔ ONE LINE OF GOOD NEWS, UNDER THE NUMBERS AND ABOVE THE TILES
        * (docs/WORKORDER-booms-2026-09-09.md, "Where"). 14 px, white, no badge and no colour — the
        * fact is the whole thing. ⚠️ MOST SESSIONS HAVE NO LINE and render nothing here, which is
        * what keeps it worth reading on the sessions that do.
        */}
      {boom ? (
        <div className="text-[14px]" style={{ lineHeight: 1.35, marginTop: 6, color: 'rgba(255,255,255,0.92)' }}>
          {boom}
        </div>
      ) : null}

      {sd ? (
        <div style={{ marginTop: 2, marginLeft: -8, marginRight: -8, opacity: 0.85 }}>
          <AdherenceChips sessionDetail={sd} hasSessionDetail noPlannedCompare={noPlannedCompare} dense />
        </div>
      ) : null}
    </button>
  );
};

// ── the one entry point Today renders ───────────────────────────────────────────────────────────

/**
 * ⛔ WHICH SESSIONS THIS FILE DRAWS, asked once so the caller does not re-derive it and then
 * disagree with `TodaySession` about which rows it handed over.
 *
 * ⚠️ A COMPLETED SESSION AND ONE THE ATHLETE BROUGHT IN ARE NOT DECKS. §3d describes the day's
 * planned work; a finished row carries provider attribution, a checkmark and its own metrics, and
 * changing it was not asked for.
 */
export function rendersAsSessionCard(session: TodayRow, isPastDate = false): boolean {
  const status = String((session as { workout_status?: unknown })?.workout_status ?? '').toLowerCase();
  // ⛔ A DONE SESSION IS A CARD TOO (Michael, 2026-09-09) — the greyed one, with its headline and the
  // Performance tab's tiles. A DONE session is a card on any day, past or future.
  if (status === 'completed') return true;
  if (status === 'skipped') return false;
  /**
   * ⛔ A PLANNED SESSION ON A DAY THAT HAS PASSED IS A MISS, NOT A PLAN (Michael, 2026-09-09). It
   * drops to the pill row rather than opening as a deck: the cues tell an athlete how to do work in
   * front of them, and on a day already gone there is no work in front of them.
   */
  if (isPastDate) return false;
  if (!isFromPlan(session)) return false;
  return isStrengthRow(session) || isEnduranceRow(session);
}

/**
 * A planned session from the plan: a deck for a lift or the plyo day, a card for a ride or run.
 * Returns null for anything else, so the caller keeps its existing row for a completed session or
 * one the athlete brought in.
 */
const TodaySession: React.FC<{
  session: TodayRow;
  useImperial: boolean;
  isPastDate?: boolean;
  /** §3e.2 — `lead` for the day's first session, `quiet` for the rest. */
  emphasis?: CardEmphasis;
  onOpen?: () => void;
}> = ({ session, useImperial, isPastDate = false, emphasis = 'lead', onOpen }) => {
  const status = String((session as { workout_status?: unknown })?.workout_status ?? '').toLowerCase();
  if (status === 'skipped') return null;

  // ⛔ DONE FIRST. A completed session — planned or brought in — is the greyed card; everything below
  // is about work still ahead.
  if (status === 'completed') {
    return <CompletedSessionCard workout={session as Record<string, unknown>} useImperial={useImperial} emphasis={emphasis} onOpen={onOpen} />;
  }

  if (isPastDate) return null;
  if (!isFromPlan(session)) return null;

  const sport = displayDisciplineOf(session as never);
  const title = deriveWorkoutTitle(session as never);

  /**
   * ⛔ §3h — THE LIFT CARD, NOT THE DECK. `SessionDeck` stays exported for the mockup's reference and
   * renders nowhere on Today now; `CardDeck` itself still runs other decks.
   */
  if (isStrengthRow(session)) {
    return <LiftSessionCard session={session} useImperial={useImperial} emphasis={emphasis} onOpen={onOpen} />;
  }

  if (!isEnduranceRow(session)) return null;
  return (
    <SessionCard
      title={title}
      meta={formatSessionDuration(session)}
      lines={enduranceLinesFor(session)}
      sport={sport}
      emphasis={emphasis}
      venueLabel={VENUE_LABEL[venueOf(session as never) ?? ''] ?? null}
      onOpen={onOpen}
    />
  );
};

export default TodaySession;
