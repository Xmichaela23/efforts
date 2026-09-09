import React, { useEffect, useState } from 'react';
import LoadWeeksCard from '@/components/context/LoadWeeksCard';
import WeekLoadCard from '@/components/WeekLoadCard';
import CardDeck, { type DeckItem } from '@/components/CardDeck';
import { LoadKeyForm, LoadKeyWorkload, type LoadBarData } from '@/components/LoadBar';
import { getDisciplineColor, getDisciplineColorRgb } from '@/lib/context-utils';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';

/**
 * ═══ THE WEEK, UNDER THE DAY ═════════════════════════════════════════════════════════════════════
 *
 * docs/WORKORDER-today-screen-2026-09-09.md §3b.2 and §3b.3 — the load bars, one per sport the
 * athlete does, and one row of this week's counts under them.
 *
 * ⛔ THE LOAD CARD IS NOT NEW AND NOT MOVED-FROM-A-SCREEN. `LoadWeeksCard` was built for State and
 * has been imported there without ever being RENDERED — a dead import in
 * `StatePerformanceSection`. So nothing comes off State: the card simply starts appearing, here,
 * for the first time. The dead import goes in the same change so the next reader does not go
 * looking for the version that was supposedly removed.
 *
 * ⛔⛔ THE LOAD CARD SITS ABOVE THE BARS (Michael, 2026-09-09) — fitness / fatigue / form and the
 * week's run, bike and strength totals, moved here off the bottom of the Week calendar. It answers
 * "how am I", the bars answer "how much, over five weeks"; the read comes before the history.
 *
 * ⛔ AND THE Run / Ride / Lifted ROW IS GONE. The load card already prints those three figures.
 * Two rows of the same numbers stacked on one screen is the accretion this file exists to avoid —
 * `@/lib/week-totals` went with it, since nothing else read it.
 *
 * ⛔ THE NUMBERS ARE READ, NEVER COMPUTED HERE. The bars come from the server's display contract
 * (`state_trends_v1.display.loadByDiscipline`); the card reads the coach payload and the week
 * `get-week` already returned.
 *
 * ⚠️ ONE PER SPORT THE ATHLETE DOES. A sport with no load in the window renders nothing —
 * `LoadWeeksCard` returns null for it — so a runner who does not swim sees no swim bars.
 */

type LoadRead = { week: number | null; typical: number | null; weeks?: number[] } | null | undefined;

const TodayWeekBlocks: React.FC<{
  /** The week's unified items, as `get-week` returned them. */
  weekRows: readonly unknown[];
  /** `weeklyStats` from `useWeekUnified` — the load card's per-sport distances. */
  weeklyStats?: { distances?: { run_meters?: number; cycling_meters?: number; swim_meters?: number } | null } | null;
  className?: string;
}> = ({ weekRows, weeklyStats, className = '' }) => {
  const { data } = useCoachWeekContext();

  const loadByDiscipline = (data?.weekly_state_v1?.trends?.display as
    | { loadByDiscipline?: Record<string, LoadRead> }
    | null
    | undefined)?.loadByDiscipline;

  const cards = (['run', 'ride', 'swim'] as const)
    .map((sport) => ({ sport, load: loadByDiscipline?.[sport] }))
    .filter((c) => !!c.load);

  /**
   * ⛔ CLOSED BY DEFAULT, REMEMBERED ON THE DEVICE (Michael, 2026-09-09). The bars are history; the
   * card above them is today's read, and the read should not arrive behind a scroll.
   *
   * ⚠️ `localStorage` IS THE RIGHT HOME AND THE WRONG ONE TO TRUST. This is a per-device
   * convenience, not training data — nothing depends on it and losing it costs one tap — so it is
   * not worth a round trip to `ui_prefs`. Every access is wrapped: a private window, cleared site
   * data or a browser refusing storage throws on read, and the card must still render closed rather
   * than not at all. Same treatment `FirstRunOverlay` gives its own device copy.
   */
  const KEY = 'efforts:today:workload-open';
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { setOpen(localStorage.getItem(KEY) === '1'); } catch { /* storage unavailable — stay closed */ }
  }, []);
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* device copy only */ }
      return next;
    });
  };

  /**
   * ⛔⛔ THE OPEN CARD IS A DECK, NOT A WALL (Michael, 2026-09-09). Everything the chevron used to
   * reveal at once — the run bars, the ride bars, the form table and the workload paragraph —
   * arrived as one column four screens long. It is the same mechanic the session decks run
   * (`CardDeck`): one card at a time, swiped, with position dots.
   *
   * ⛔ SAME WORDS, NOTHING REWRITTEN. The bars are `LoadWeeksCard` exactly as it was; the two
   * paragraphs are `LoadKeyForm` and `LoadKeyWorkload`, the halves of the explanation State's ⓘ
   * already showed.
   *
   * ⚠️ THE ORDER IS THE WORK ORDER'S: run bars, ride bars, form table, workload. A card whose data
   * is missing is simply absent — a runner who does not ride gets three cards, not an empty one.
   *
   * ⚠️ THE DECK WEARS RUN GOLD. It is not about one sport, and the cards inside carry their own
   * sport colours; a neutral edge would read as "disabled" against every other card on the screen.
   */
  const ff = ((data?.weekly_state_v1?.load as LoadBarData | undefined)?.fitness_fatigue) ?? null;
  const deckItems: DeckItem[] = [
    ...cards.map(({ sport, load }) => ({
      key: `bars:${sport}`,
      node: <LoadWeeksCard sport={sport} load={load} />,
    })),
    ...(ff ? [{ key: 'form', node: <LoadKeyForm ff={ff} /> }] : []),
    ...(ff ? [{ key: 'workload', node: <LoadKeyWorkload /> }] : []),
  ];

  return (
    <div className={className}>
      {/**
        * ⚠️ THE CARD AND THE BARS ARE INDEPENDENT, and the card does not wait for the bars. The
        * five-week figures come from the server's snapshot, which does not exist for an account
        * whose first week has not been analysed yet; the card reads the coach payload and the week
        * itself. Gating both on the snapshot is how the whole block would vanish for exactly the
        * athlete most likely to look at it.
        */}
      <WeekLoadCard
        weeklyStats={weeklyStats}
        items={weekRows}
        expanded={open}
        onToggle={toggle}
        /* The chevron's second reason to exist: the card knows about its own explanation, not about
           what renders beneath it. It hides the control when neither is there. */
        hasBars={deckItems.length > 0}
      />

      {open && deckItems.length > 0 ? (
        <CardDeck
          items={deckItems}
          colour={getDisciplineColor('run')}
          rgb={getDisciplineColorRgb('run')}
          testId="load"
          className="mt-3"
        />
      ) : null}
    </div>
  );
};

export default TodayWeekBlocks;
