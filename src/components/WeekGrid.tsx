/**
 * THE WEEK, AS ONE PICTURE — lifts on one line, endurance on the next, per day.
 *
 * ⛔ STANDALONE ON PURPOSE. The same object is meant to serve intake ("here is the week your picks
 * produce") and, later, rescheduling on the State screen ("here is what moving Thursday costs").
 * The athlete learns it once. That only holds if BOTH surfaces render the same component and the
 * same sentences — so this takes the solver's own compromise strings and prints them verbatim
 * rather than paraphrasing. One source per claim, including the words.
 *
 * ⚠️ IT DOES NOT PLACE ANYTHING. Placement is the solver's, server-side. This renders what came
 * back. A second placement authority on the client is the exact disease this codebase spent weeks
 * removing — if the grid ever needs to "just quickly work out" where a lift goes, that is the
 * signal to add an input to the solver, not logic here.
 */
import React from 'react';

import {
  WEEK_DAYS as ORDER,
  cleanEnduranceSlots,
  heavyLegCollisionDay,
  isEnduranceSession,
  type WeekSession,
} from '@/lib/week-budget';

export type WeekGridSession = WeekSession;

export default function WeekGrid({
  sessions,
  notes = [],
  className = '',
  compact = false,
}: {
  sessions: WeekGridSession[];
  /** The solver's own words for what it could not honour. Printed verbatim, never paraphrased. */
  notes?: string[];
  className?: string;
  /**
   * ⛔ DROP THE EXPLANATION, KEEP THE FACT. On the confirm card the athlete has already seen the
   * trade under the picker that caused it — repeating the citation there made the last screen a
   * wall of text. Michael: *"much too dense."* The budget line still shows, because the number is
   * the fact; the paragraph belongs where the choice is still changeable.
   */
  compact?: boolean;
}) {
  const enduranceCount = sessions.filter(isEnduranceSession).length;
  const clean = cleanEnduranceSlots(sessions);
  const over = enduranceCount > clean;
  const collisionDay = heavyLegCollisionDay(sessions);

  const activeDays = new Set(sessions.map((s) => s.day)).size;
  const mins = sessions.reduce((a, s) => a + (Number(s.duration) || 0), 0);

  return (
    <div className={`space-y-3 ${className}`}>
      <p className="text-white/85 text-sm">
        {activeDays} training {activeDays === 1 ? 'day' : 'days'}, {7 - activeDays} rest
        {' · '}about {Math.floor(mins / 60)}h{mins % 60 ? String(mins % 60).padStart(2, '0') : ''} a week
      </p>

      <div className="space-y-1">
        {ORDER.map((d) => {
          const on = sessions.filter((s) => s.day === d);
          const lift = on.find((s) => s.type === 'strength');
          const endur = on.filter(isEnduranceSession);
          const isCollision = d === collisionDay;
          return (
            <div key={d} className={`flex items-baseline gap-2 text-sm rounded-md px-1.5 py-1 ${isCollision ? 'bg-amber-500/10' : ''}`}>
              <span className="text-white/45 w-10 shrink-0">{d.slice(0, 3)}</span>
              <span className="flex-1 min-w-0">
                <span className={lift ? 'text-white/85' : 'text-white/30'}>
                  {lift ? lift.name.replace('Strength — ', '') : '—'}
                </span>
                {endur.length > 0 && (
                  <span className="text-white/60">{'  ·  '}{endur.map((s) => s.name).join(' · ')}</span>
                )}
                {!lift && endur.length === 0 && <span className="text-white/30">{'  '}Rest</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* ⛔ THE BUDGET, AND THE TRADE IF THEY ARE OVER IT. Never a block — a hard lock just teaches
          people to lie to the picker. State the cost and let them choose. */}
      <div className="pt-2 border-t border-white/10 space-y-1.5">
        <p className={`text-sm ${over ? 'text-amber-300/90' : 'text-white/70'}`}>
          {enduranceCount} endurance {enduranceCount === 1 ? 'session' : 'sessions'} · {clean} fit clean
        </p>
        {over && !compact && (
          <p className="text-white/70 text-sm leading-relaxed">
            {collisionDay ? `One lands on ${collisionDay}, a heavy-leg day. ` : ''}
            Lifting and running the same legs on the same day cost about half the strength gain in the
            only trial that tested it — 16.8% versus 31.2% on half-squat 1RM over seven weeks
            (Robineau 2016). Your hard day and your long days are not the ones to move; the easy
            volume is.
          </p>
        )}
        {!over && enduranceCount > 0 && !compact && (
          <p className="text-white/60 text-sm leading-relaxed">
            Every heavy day gets its own ground. Dropping an easy session costs less than it feels —
            trained athletes held VO2max for fifteen weeks on two sessions a week, as long as the hard
            one stayed (Hickson).
          </p>
        )}
      </div>

      {/* What the solver could not honour, in its own words. Never hidden, never reworded. */}
      {notes.length > 0 && (
        <div className="pt-2 border-t border-white/10 space-y-1.5">
          {notes.map((n, i) => (
            <p key={i} className="text-white/60 text-sm leading-relaxed">{n}</p>
          ))}
        </div>
      )}
    </div>
  );
}
