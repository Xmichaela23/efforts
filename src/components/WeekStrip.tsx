import React from 'react';
import { getDisciplineColorRgb } from '@/lib/context-utils';

/** `byDay` is keyed by the lowercase weekday; each entry is one session's sport, one dot each. */
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_SHORT: Record<(typeof DAYS)[number], string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

/**
 * ⛔ THE MASTER STRIP — THE PLACED WEEK AT A GLANCE (Michael, round 3, 2026-08-25).
 *
 * Seven days, one dot per session, coloured by sport. It answers "what shape is my week" without
 * being read; the worded list below answers "what exactly is on Thursday". Two views, one job each.
 *
 * ⛔⛔ IT RENDERS THE SAME DATA AS THE LIST AND MUST KEEP DOING SO. Both take `previewWeek` — the
 * server's placed week — and neither derives anything of its own. That is the whole reason a strip
 * is safe to add here at all: this screen has already shipped two objects claiming to describe one
 * week and disagreeing (the coded pill strip vs the day list, killed 2026-08-25). A strip fed from
 * a second source would be that bug rebuilt with rounder pixels.
 *
 * ⚠️ DOTS, NOT LETTERS, AND NOT A LEGEND. The sport hue is the app's wayfinding language and the
 * COUNT of dots is the only other fact carried — how loaded the day is. Nothing here encodes a
 * session TYPE, so there is nothing to decode; the list below names every session in words.
 * ⚠️ A DOT IS A SESSION, so a day holding a lift and a hard run shows two. That is the crowding the
 * athlete is actually deciding about when they move a pin.
 */
export default function WeekStrip({ byDay }: { byDay: Record<string, string[]> }) {
  return (
    <div className="grid grid-cols-7 gap-1 min-w-0">
      {DAYS.map((d) => {
        const types = byDay[d] ?? [];
        return (
          <div
            key={d}
            className="flex flex-col items-center justify-start gap-1.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] min-w-0"
          >
            <span className="leading-none text-[11px] font-medium text-white/70">{DAY_SHORT[d]}</span>
            {/* ⚠️ THE REST DAY IS A DASH, NOT AN ABSENCE. An empty cell reads as "not loaded yet";
                the dash is the same mark the worded list uses for a day with nothing on it. */}
            {types.length === 0 ? (
              <span aria-hidden className="leading-none text-[11px] text-white/25">—</span>
            ) : (
              <span className="flex items-center justify-center gap-[3px] flex-wrap px-0.5">
                {types.map((t, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="block w-[7px] h-[7px] rounded-full"
                    style={{ backgroundColor: `rgb(${getDisciplineColorRgb(t)})` }}
                  />
                ))}
              </span>
            )}
            <span className="sr-only">
              {types.length === 0 ? 'rest' : `${types.length} session${types.length === 1 ? '' : 's'}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

