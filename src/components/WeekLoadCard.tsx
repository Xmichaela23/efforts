import React from 'react';
import { ChevronDown } from 'lucide-react';
import { type LoadBarData } from '@/components/LoadBar';
import { formZone } from '@shared/fitness-fatigue';
import { useAppContext } from '@/contexts/AppContext';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';
import { getDisciplineColor, formZoneColor } from '@/lib/context-utils';

/**
 * ═══ THE LOAD CARD — fitness, fatigue, form, and what the week has covered ═══════════════════════
 *
 * ⛔ MOVED OFF THE WEEK CALENDAR, WHERE IT WAS INLINE, AND REDRAWN (Michael, 2026-09-09: it "looks
 * messy"). It renders in ONE place — Today, under the day's sessions — and nowhere else.
 *
 * ⛔⛔ TWO ROWS IN PROFILE'S NUMBER-ROW IDIOM (`ui/number-row.tsx`): the number in white, the label
 * grey beside it, nothing shouting. What it replaced was `LoadBar`'s compact head — the same three
 * numbers, but wrapped mid-row with `·` separators between them and a second line of sport-COLOURED
 * numbers underneath, so five colours and three type sizes competed in a block six lines tall.
 *
 *   · Row 1 — fitness / fatigue / form, with this week's change small beside each.
 *   · Row 2 — Run / Bike / Lifted, the value in white and a sport-colour DOT before the label. ⚠️ THE
 *     COLOUR MOVES TO THE DOT AND OFF THE TEXT. A coloured number reads as a status; the sport is
 *     which row this is, not how the week went, so it belongs in a mark rather than in the figure.
 *
 * ⛔ SAME NUMBERS, SAME SOURCES, NOTHING RECOMPUTED. Fitness / fatigue / form and their week-ago
 * deltas come off the coach payload's `fitness_fatigue` exactly as `LoadBar` reads them; the
 * distances are the server's `weeklyStats`; the lifted figure is the same `reps × weight` sum over
 * the week's logged sets. This file changed how they are drawn and nothing about what they are.
 *
 * ⛔ ONE CHEVRON, ON THE HEADER LINE. It opens the explanation AND the workload bars beneath the
 * card — the ⓘ is gone, so there are not two disclosures on one card doing different jobs. The
 * caller owns the state and renders the bars; see `TodayWeekBlocks`.
 */

type WeeklyStats = {
  distances?: {
    run_meters?: number;
    cycling_meters?: number;
    swim_meters?: number;
  } | null;
};

type WeekItem = {
  type?: unknown;
  executed?: { strength_exercises?: Array<{ sets?: Array<{ weight?: unknown; reps?: unknown; completed?: unknown }> }> } | null;
};

const fmt1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v));

/** This week's change, a signed number and never an arrow — the same rule `LoadBar` prints by. */
const delta = (now: number | null | undefined, then: number | null | undefined): string | null => {
  if (now == null || then == null || !Number.isFinite(now) || !Number.isFinite(then)) return null;
  const d = Math.round(now - then);
  return d === 0 ? '±0' : d > 0 ? `+${d}` : `${d}`;
};

/**
 * One cell, as the mockup draws it: the grey label on top, the number under it, and one small muted
 * word or figure trailing the number.
 *
 * ⚠️ THE SMALL SLOT CARRIES DIFFERENT THINGS ON THE TWO ROWS, and the mockup is deliberate about it:
 * on fitness and fatigue it is this week's CHANGE, on form it is Friel's ZONE WORD, and on the sport
 * row it is the UNIT. In every case it is the thing the number needs to be read correctly.
 */
const Cell: React.FC<{ label: React.ReactNode; value: string; small?: React.ReactNode }> = ({ label, value, small }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="flex items-center gap-1.5 text-[12px] leading-none truncate" style={{ color: 'rgba(255,255,255,0.38)' }}>
      {label}
    </span>
    <span className="text-[18px] font-semibold tabular-nums leading-none" style={{ color: 'rgba(255,255,255,0.95)' }}>
      {value}
      {small ? <small className="ml-1 text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.62)' }}>{small}</small> : null}
    </span>
  </div>
);

/** A sport-colour dot before the label — the colour is on the mark, never on the figure. */
const Dot: React.FC<{ sport: string }> = ({ sport }) => (
  <span
    aria-hidden="true"
    className="inline-block rounded-full flex-shrink-0"
    style={{ width: 6, height: 6, background: getDisciplineColor(sport) }}
  />
);

const WeekLoadCard: React.FC<{
  /** `weeklyStats` from `useWeekUnified` — the server's per-sport distance for the week. */
  weeklyStats?: WeeklyStats | null;
  /** The week's unified items, for the logged strength volume. */
  items?: readonly unknown[];
  /** The disclosure on the header line. The caller owns the state and what appears underneath. */
  expanded?: boolean;
  onToggle?: () => void;
  /**
   * Whether the caller has workload bars to reveal. The card knows about its own explanation and
   * nothing about what renders beneath it, so the chevron's second reason to exist comes from here.
   */
  hasBars?: boolean;
  className?: string;
}> = ({ weeklyStats, items = [], expanded, onToggle, hasBars = false, className = '' }) => {
  const { useImperial } = useAppContext();
  const coachCtx = useCoachWeekContext();

  const wsv = coachCtx.data?.weekly_state_v1;
  const ff = ((wsv?.load as LoadBarData | undefined)?.fitness_fatigue) ?? null;
  const wk = ff?.week_ago ?? null;
  const zone = formZone(ff?.form);

  /** ⚠️ THE UNIT IS ITS OWN FIELD so it can sit in the small slot beside the figure (the mockup). */
  const metrics: Array<{ label: string; value: string; unit: string; sport: string }> = [];
  const d = weeklyStats?.distances;
  const distUnit = useImperial ? 'mi' : 'km';
  if (d) {
    if ((d.run_meters ?? 0) > 0)
      metrics.push({ label: 'Run', sport: 'run', unit: distUnit, value: useImperial ? (d.run_meters! / 1609.34).toFixed(1) : (d.run_meters! / 1000).toFixed(1) });
    if ((d.cycling_meters ?? 0) > 0)
      metrics.push({ label: 'Bike', sport: 'bike', unit: distUnit, value: useImperial ? (d.cycling_meters! / 1609.34).toFixed(1) : (d.cycling_meters! / 1000).toFixed(1) });
    if ((d.swim_meters ?? 0) > 0)
      metrics.push({ label: 'Swim', sport: 'swim', unit: useImperial ? 'yd' : 'm', value: useImperial ? String(Math.round(d.swim_meters! / 0.9144)) : String(Math.round(d.swim_meters!)) });
  }

  let totalVol = 0;
  for (const raw of items as WeekItem[]) {
    if (String(raw?.type ?? '').toLowerCase() !== 'strength') continue;
    for (const ex of raw?.executed?.strength_exercises ?? []) {
      if (!ex?.sets) continue;
      for (const s of ex.sets) {
        if (s?.completed === false) continue;
        const w = Number(s?.weight) || 0;
        const r = Number(s?.reps) || 0;
        if (w > 0 && r > 0) totalVol += w * r;
      }
    }
  }
  if (totalVol > 0)
    metrics.push({ label: 'Lifted', sport: 'strength', unit: useImperial ? 'lb' : 'kg', value: totalVol.toLocaleString() });

  const hasNumbers = ff != null && fmt1(ff.fitness) != null;
  if (!hasNumbers && metrics.length === 0) return null;

  return (
    /* ⛔ ONE STEP QUIETER THAN THE DAY'S FIRST SESSION (§3e.2) — a thinner edge, because LOAD is the
       week's read and the session is the thing being done today. */
    <div className={`galaxy-card readout-texture readout-texture--nova rounded-xl border border-white/[0.06] px-3 py-3 ${className}`}>
      {/* ⛔ THE HEADER LINE: the word left, the chevron at the far right (the mockup's `.load .h`).
          No ⓘ — one control, and it opens the explanation and the bars together. */}
      <div className="flex items-center justify-between">
        {/* ⛔ ONE STEP SMALLER, same rule (§3e.2). */}
        <span className="readout-label text-[11px] tracking-[0.1em] uppercase">LOAD</span>
        {/* ⚠️ NO CHEVRON WHERE THERE IS NOTHING TO OPEN. A control that reveals an empty space
            teaches the athlete to stop tapping controls. */}
        {/* ⚠️ `metrics.length` IS IN THE GATE NOW (§3e.2). The dot row only shows when open, so on an
            account with mileage but no fitness numbers yet the chevron was the only way to reach it
            — and without this it would not have drawn at all. */}
        {onToggle && (hasNumbers || hasBars || metrics.length > 0) ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded === true}
            aria-label="What fitness, fatigue and form mean, and workload over five weeks"
            className="p-0.5 rounded-xl text-white/40 hover:text-white/85 transition-colors"
          >
            <ChevronDown
              className="h-4 w-4"
              style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}
            />
          </button>
        ) : null}
      </div>

      {hasNumbers ? (
        <div className="mt-2.5 grid grid-cols-3 gap-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
          <Cell label="fitness" value={String(fmt1(ff!.fitness))} small={delta(ff!.fitness, wk?.fitness)} />
          <Cell label="fatigue" value={String(fmt1(ff!.fatigue))} small={delta(ff!.fatigue, wk?.fatigue)} />
          <Cell
            label="form"
            value={`${(ff!.form ?? 0) > 0 ? '+' : ''}${fmt1(ff!.form)}`}
            /* ⚠️ FORM'S SMALL SLOT IS FRIEL'S ZONE WORD, NOT ITS DELTA — the mockup's own choice, and
               the right one: the zone says what the number MEANS, which a change of −5 does not.
               ⛔ AND THE WORD CARRIES THE COLOUR, NEVER THE NUMBER (2026-09-09) — `formZoneColor`,
               one owner, shared with State's bar. */
            small={zone ? <span style={{ color: formZoneColor(zone) }}>{zone}</span> : null}
          />
        </div>
      ) : (
        <div className="mt-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.40)' }}>no sessions logged yet</div>
      )}

      {/**
        * ⛔ THE DOT ROW ONLY WHEN OPEN (§3e.2). Closed, LOAD is ONE number row — fitness, fatigue,
        * form. Run / Bike / Lifted is the week's mileage, which is a second question, and stacking
        * both on a closed card is what made the card as tall as a session.
        * ⚠️ NOTHING IS LOST. The chevron was already the control for "tell me more"; these figures
        * now arrive with the bars rather than before them.
        */}
      {expanded === true && metrics.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
          {metrics.map((m) => (
            <Cell
              key={m.label}
              label={<><Dot sport={m.sport} />{m.label}</>}
              value={m.value}
              small={m.unit}
            />
          ))}
        </div>
      )}

      {/* ⛔ THE EXPLANATION IS NOT IN THIS CARD ANY MORE (2026-09-09). The chevron opens a DECK
          beneath it — run bars, ride bars, the form table, the workload paragraph, one card at a
          time — because everything arriving at once made the open card a wall. `TodayWeekBlocks`
          owns the deck; this card owns the numbers and the control. */}
    </div>
  );
};

export default WeekLoadCard;
