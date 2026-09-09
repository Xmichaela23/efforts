import React from 'react';
import CardDeck, { deckGlass, type DeckItem } from './CardDeck';
import { getExerciseConfig } from '@/lib/exercise-config';
import { getDisciplineColor, getDisciplineColorRgb } from '@/lib/context-utils';
import { displayDisciplineOf } from '@/lib/utils';
import { deriveWorkoutTitle } from '@/lib/derive-workout-title';
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
  const spacing = spacingLineFor(rows);
  if (!spacing) return null;
  return (
    <div
      className="text-[13px] font-light leading-snug"
      /* 12 px to the first card (Michael, 2026-09-09). */
      style={{ color: 'rgba(255,255,255,0.72)', padding: '0 0.35rem 12px' }}
    >
      <div>{spacing.lead}</div>
      {spacing.closer ? (
        <div style={{ marginTop: 2, color: 'rgba(255,255,255,0.55)' }}>
          {spacing.closerLabel} {spacing.closer}
        </div>
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
  onOpen?: () => void;
}> = ({ title, cards, sport, onOpen }) => {
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
          <div className="text-[20px] font-semibold leading-tight min-w-0" style={{ letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.95)' }}>
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
      onCardTap={onOpen}
      className="mb-[14px]"
    />
  );
};

// ── the single card ─────────────────────────────────────────────────────────────────────────────

/** A ride or run: one card, name and time, the family line. Same glass object as a deck card. */
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
      className="w-full text-left"
      /* ⚠️ SAME PADDING AND TYPE AS A DECK CARD, and no fixed height — the card is as tall as its
         family line and stop rule, nothing more. */
      style={{ ...deckGlass(rgb), padding: '14px 16px', margin: '0 0 14px', cursor: 'pointer' }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen?.(); }}
    >
      {/* ⛔ THE TIME SITS ON THE NAME LINE, RIGHT — the same rule the deck card follows. */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[20px] font-semibold leading-tight min-w-0" style={{ color: colour }}>{title}</div>
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
