import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getExerciseConfig } from '@/lib/exercise-config';
import { getDisciplineColor, getDisciplineColorRgb } from '@/lib/context-utils';
import { displayDisciplineOf } from '@/lib/utils';
import { deriveWorkoutTitle } from '@/lib/derive-workout-title';
import { formatSessionDuration } from './PlannedSessionHeader';
import {
  liftLinesFor,
  enduranceLinesFor,
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
 * ⛔ CSS TRANSFORMS ONLY, NO LIBRARY. `translate3d` + `rotateY` under one `perspective`, exactly as
 * the mockup does it. `prefers-reduced-motion` turns the transitions off and the deck still works.
 *
 * ⛔ SWIPE IS THE DECK'S, TAP IS THE DRAWER'S. A drag under 60 px snaps back and does NOT open the
 * drawer — otherwise every abandoned swipe becomes an accidental navigation.
 */

const SWIPE_PX = 60;
/** How many cards deep the stack draws. Past this they are invisible anyway. */
const DEPTH = 3;

const prefersReducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * ⛔ ONE CLASSIFIER FOR "IS THIS ON A BAR" — the app's existing `displayFormat === 'total'`, the same
 * test the logger runs before a speed row may say "bar".
 */
const barLoaded = (movement: string): boolean =>
  getExerciseConfig(movement)?.displayFormat === 'total';

/**
 * The row's weight, top right (§3d). ⚠️ DATA, NEVER A PRESCRIPTION THIS FILE WRITES: `weight_display`
 * is what the server priced, `weight` is the composer's own value, and `By feel` is the literal
 * string it writes on an auto-regulated row. Nothing is invented when both are absent — the corner
 * stays empty.
 */
function weightLabelFor(ex: Record<string, unknown> | undefined, useImperial: boolean): string | null {
  const display = ex?.weight_display;
  if (typeof display === 'string' && display.trim()) return display.trim();
  const raw = ex?.weight;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return `${Math.round(n)} ${useImperial ? 'lb' : 'kg'}`;
  return null;
}

/**
 * The glass panel — translucent over the dot grid, a thin edge in the sport colour, the glow
 * bleeding onto the grid (§3d).
 *
 * ⚠️ SLIGHTLY MORE OPAQUE THAN THE MOCKUP'S 0.82, AND THE STACK IS BLURRED HARDER (see `styleFor`).
 * The mockup leans on `backdrop-filter` to smear the cards sitting 10 px behind the front one; where
 * that filter does not composite — an older WebView, a device with it off — the next movement's name
 * reads straight through the front card's title. Two small changes carry the legibility without the
 * filter, and the panel is still glass.
 */
const glass = (rgb: string): React.CSSProperties => ({
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(19,21,27,0.90), rgba(11,12,16,0.96))',
  border: `1px solid rgba(${rgb},0.45)`,
  boxShadow: `0 0 0 1px rgba(255,255,255,0.03) inset, 0 18px 50px rgba(0,0,0,0.55), 0 0 40px rgba(${rgb},0.18)`,
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
});

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
      meta: weightLabelFor(rows[i], useImperial),
    }))
    .filter((c) => c.name);
}

// ── the deck ────────────────────────────────────────────────────────────────────────────────────

export const SessionDeck: React.FC<{
  title: string;
  cards: DeckCard[];
  /** A `SPORT_COLORS` key — the display discipline, so the plyo day is not strength orange. */
  sport: string;
  onOpen?: () => void;
}> = ({ title, cards, sport, onOpen }) => {
  const [idx, setIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const moved = useRef(0);
  const reduced = useMemo(prefersReducedMotion, []);
  const colour = getDisciplineColor(sport);
  const rgb = getDisciplineColorRgb(sport);

  const go = useCallback((n: number) => {
    setIdx((prev) => Math.max(0, Math.min(cards.length - 1, n === prev ? prev : n)));
    setDragX(0);
  }, [cards.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(cards.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cards.length]);

  if (cards.length === 0) return null;

  /**
   * ⛔ THE STACK, AS THE MOCKUP DRAWS IT. The front card follows the finger and yaws with it; the
   * next cards sit behind, offset up-right, smaller, dimmer, slightly blurred; read cards fall away
   * down-left with a small rotate. One `perspective` on the deck, `translate3d` on each card.
   */
  const styleFor = (i: number): React.CSSProperties => {
    const k = i - idx;
    if (k === 0) {
      return {
        transform: `translate3d(${dragX}px,0,0) rotateY(${dragX / 18}deg)`,
        opacity: 1, filter: 'none', zIndex: 10, pointerEvents: 'auto',
      };
    }
    if (k > 0) {
      const d = Math.min(k, DEPTH);
      return {
        transform: `translate3d(${d * 10}px, ${-d * 12}px, ${-d * 90}px) scale(${1 - d * 0.05})`,
        // ⚠️ 2.5 px, NOT THE MOCKUP'S 0.6 — see `glass`. At 0.6 the next movement's NAME is still
        // readable through the front card, which turns depth into a second thing to read.
        opacity: Math.max(0, 0.85 - d * 0.28), filter: `blur(${d * 2.5}px)`, zIndex: 10 - d, pointerEvents: 'none',
      };
    }
    const d = Math.min(-k, DEPTH);
    return {
      transform: `translate3d(${-d * 14}px, ${d * 10}px, ${-d * 120}px) rotateY(${-6 * d}deg) scale(${1 - d * 0.08})`,
      opacity: Math.max(0, 0.45 - d * 0.22), filter: `blur(${d * 2}px)`, zIndex: 10 - d, pointerEvents: 'none',
    };
  };

  const end = () => {
    if (!dragging) return;
    setDragging(false);
    // ⛔ UNDER 60 px IS NOT A SWIPE. It snaps back, and the tap handler below sees `moved` and
    // refuses to open the drawer only when the finger actually travelled.
    if (dragX < -SWIPE_PX) go(idx + 1);
    else if (dragX > SWIPE_PX) go(idx - 1);
    else setDragX(0);
  };

  return (
    <div
      data-deck="1"
      className="relative select-none"
      /* ⚠️ THE TOP MARGIN IS THE HEAD'S ROOM. The session name and `n of N` sit ABOVE the card at
         `top: -4`, outside the deck's own box; without the margin they land on whatever the day
         printed above — on a two-a-day, the spacing line. */
      style={{ height: 236, margin: '20px 0 22px', perspective: 900, touchAction: 'pan-y', ['--c' as string]: colour }}
      onPointerDown={(e) => {
        setDragging(true);
        startX.current = e.clientX;
        moved.current = 0;
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* older webviews */ }
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const dx = e.clientX - startX.current;
        moved.current = Math.max(moved.current, Math.abs(dx));
        setDragX(dx);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {/* Session name and `n of N`, above the deck. */}
      <div
        className="absolute left-0 right-0 flex justify-between text-[13px] uppercase tracking-[0.06em] z-[5]"
        style={{ top: -4, color: 'rgba(255,255,255,0.38)' }}
      >
        <span className="truncate pr-3">{title}</span>
        <span data-deck-pos="1" className="tabular-nums flex-shrink-0">{idx + 1} of {cards.length}</span>
      </div>

      {cards.map((c, i) => (
        <button
          key={c.key}
          type="button"
          className="absolute text-left w-full"
          style={{
            ...glass(rgb),
            inset: '22px 0 0 0',
            padding: '18px 20px 16px',
            transformStyle: 'preserve-3d',
            transformOrigin: '50% 60%',
            transition: dragging || reduced
              ? 'none'
              : 'transform 420ms cubic-bezier(.2,.8,.2,1), opacity 420ms ease, filter 420ms ease',
            willChange: 'transform',
            cursor: 'pointer',
            ...styleFor(i),
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // ⛔ A DRAG IS NOT A TAP. Anything past a few pixels was the deck's gesture.
            if (moved.current > 8) return;
            onOpen?.();
          }}
        >
          <div className="text-[22px] font-semibold leading-tight" style={{ letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.95)' }}>
            {c.name}
          </div>
          {c.meta ? (
            <div className="absolute text-[13px] tabular-nums" style={{ right: 18, top: 16, color: 'rgba(255,255,255,0.38)' }}>
              {c.meta}
            </div>
          ) : null}
          {c.kind ? (
            <div
              className="flex items-center gap-2 text-[13px] uppercase tracking-[0.08em]"
              style={{ color: colour, margin: '6px 0 12px' }}
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
            <div className="text-[16px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.92)', marginTop: c.kind ? 0 : 10 }}>
              {c.cue}
            </div>
          ) : null}
        </button>
      ))}

      {/* Position dots, below the deck. */}
      <div className="absolute left-0 right-0 flex gap-1.5 justify-center" style={{ bottom: -2 }}>
        {cards.map((c, i) => (
          <span
            key={c.key}
            aria-hidden="true"
            className="inline-block rounded-full"
            style={{
              height: 5,
              width: i === idx ? 16 : 5,
              borderRadius: i === idx ? 3 : 999,
              background: i === idx ? colour : 'rgba(255,255,255,0.18)',
              boxShadow: i === idx ? `0 0 8px ${colour}` : undefined,
              transition: reduced ? 'none' : 'background 300ms, width 300ms',
            }}
          />
        ))}
      </div>
    </div>
  );
};

// ── the single card ─────────────────────────────────────────────────────────────────────────────

/** A ride or run: one card, name and time, the family line and the stop rule. Same glass object. */
export const SessionCard: React.FC<{
  title: string;
  meta: string | null;
  lines: string[];
  sport: string;
  onOpen?: () => void;
}> = ({ title, meta, lines, sport, onOpen }) => {
  const colour = getDisciplineColor(sport);
  const rgb = getDisciplineColorRgb(sport);
  return (
    <button
      type="button"
      className="relative w-full text-left"
      style={{ ...glass(rgb), padding: '18px 20px 16px', margin: '0 0 22px', cursor: 'pointer' }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen?.(); }}
    >
      <div className="text-[22px] font-semibold leading-tight pr-16" style={{ color: colour }}>{title}</div>
      {meta ? (
        <div className="absolute text-[14px] tabular-nums" style={{ right: 18, top: 18, color: 'rgba(255,255,255,0.62)' }}>
          {meta}
        </div>
      ) : null}
      {lines.map((line, i) => (
        <div
          key={line}
          className="text-[16px] leading-relaxed"
          style={{ marginTop: i === 0 ? 10 : 8, color: i === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.62)' }}
        >
          {line}
        </div>
      ))}
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
export function rendersAsSessionCard(session: TodayRow): boolean {
  const status = String((session as { workout_status?: unknown })?.workout_status ?? '').toLowerCase();
  if (status === 'completed' || status === 'skipped') return false;
  if (!isFromPlan(session)) return false;
  return isStrengthRow(session) || isEnduranceRow(session);
}

/**
 * A planned session from the plan: a deck for a lift or the plyo day, a card for a ride or run.
 * Returns null for anything else, so the caller keeps its existing row for a completed session or
 * one the athlete brought in.
 */
const TodaySession: React.FC<{ session: TodayRow; useImperial: boolean; onOpen?: () => void }> = ({
  session, useImperial, onOpen,
}) => {
  const status = String((session as { workout_status?: unknown })?.workout_status ?? '').toLowerCase();
  if (status === 'completed' || status === 'skipped') return null;
  if (!isFromPlan(session)) return null;

  const sport = displayDisciplineOf(session as never);
  const title = deriveWorkoutTitle(session as never);

  if (isStrengthRow(session)) {
    const cards = deckCardsFor(session, useImperial);
    if (cards.length === 0) return null;
    return <SessionDeck title={title} cards={cards} sport={sport} onOpen={onOpen} />;
  }

  if (!isEnduranceRow(session)) return null;
  return (
    <SessionCard
      title={title}
      meta={formatSessionDuration(session)}
      lines={enduranceLinesFor(session)}
      sport={sport}
      onOpen={onOpen}
    />
  );
};

export default TodaySession;
