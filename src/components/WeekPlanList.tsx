/**
 * ⛔ YOUR WEEK, AS THE HOME WEEK TAB DRAWS IT (Michael, 2026-09-22: "use our weekly schedule that's already built").
 *
 * Seven rows, Monday to Sunday, no dates: a dot in the sport's colour, the session's name, its length, and the six-dot
 * grip on every session the athlete can move. The carry is the calendar's own (`useCarryDrag`), so a finger moves a
 * session here exactly as it will on Home. An empty day reads "Rest", in the calendar's style.
 *
 * ⚠️ IT DECIDES NOTHING. The rows are the server's preview week; a drop goes to `onDrop` and the screen sends it back to
 * the server as a pick, which rebuilds the week. The notes under the list are the server's words.
 */
import React from 'react';
import { GripVertical } from 'lucide-react';
import { useCarryDrag, type CarryItem } from '@/hooks/useCarryDrag';
import { displayDisciplineOf, isPlyoSession } from '@/lib/utils';
import { getDisciplineColor } from '@/lib/context-utils';

export type PlanSessionLite = {
  day?: string; type?: string; name?: string; intent_title?: string; duration?: number; tags?: unknown;
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const SHORT: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};
const NO_SELECT = { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties;

/** The planned length in the calendar's register: runs and rides as minutes:00, lifts as minutes. */
function lengthOf(s: PlanSessionLite): string {
  const m = Math.round(Number(s.duration) || 0);
  if (m <= 0) return '';
  return String(s.type ?? '').toLowerCase() === 'strength' ? `${m} min` : `${m}:00`;
}

export default function WeekPlanList({ sessions, movable, onDrop, dimmed }: {
  sessions: PlanSessionLite[];
  /** Whether this session may be carried. The jump drills ride with their day and are not. */
  movable: (s: PlanSessionLite) => boolean;
  onDrop: (s: PlanSessionLite, toDay: string) => void;
  /** True while the server is rebuilding the week after a drop. */
  dimmed?: boolean;
}) {
  const drag = useCarryDrag<PlanSessionLite>({
    dayAttr: 'data-plan-day',
    onDrop: (s, from, to) => { if (to !== from) onDrop(s, to); },
  });
  const byDay = (d: string) => sessions.filter((s) => String(s.day ?? '').toLowerCase() === d);
  const idOf = (s: PlanSessionLite, i: number, d: string) => `${d}:${i}:${s.name ?? ''}`;

  const pick = (e: React.TouchEvent | React.PointerEvent, s: PlanSessionLite, id: string, from: string, y: number) => {
    e.stopPropagation();
    const colour = getDisciplineColor(displayDisciplineOf(s as never));
    const item: CarryItem = { id, name: s.intent_title || s.name || '', meta: lengthOf(s), colour };
    drag.pickUp((e.currentTarget as HTMLElement).closest('[data-plan-row]') as HTMLElement | null, y, item, s, from);
  };

  return (
    <div className={dimmed ? 'opacity-50 transition-opacity' : 'transition-opacity'} style={NO_SELECT}>
      {DAYS.map((d) => {
        const items = byDay(d);
        return (
          <div
            key={d}
            data-plan-day={d}
            className="grid items-center"
            style={{
              gridTemplateColumns: '52px 1fr', minHeight: 64, padding: '10px 2px 10px 10px',
              borderBottom: '1px solid rgba(255,255,255,0.10)', ...(drag.overStyle(d) ?? {}),
            }}
          >
            <div className="text-[12px] uppercase" style={{ color: 'rgba(242,240,236,0.55)', letterSpacing: '0.04em' }}>
              {SHORT[d]}
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              {items.length === 0 ? (
                <span className="text-[14px] italic" style={{ color: 'rgba(242,240,236,0.36)' }}>Rest</span>
              ) : items.map((s, i) => {
                const id = idOf(s, i, d);
                const colour = getDisciplineColor(displayDisciplineOf(s as never));
                const canMove = movable(s) && !isPlyoSession(s as never);
                return (
                  <div
                    key={id}
                    data-plan-row="true"
                    className="grid items-center gap-2.5 text-[15px] min-w-0"
                    style={{
                      gridTemplateColumns: '10px minmax(0,1fr) auto 20px',
                      opacity: drag.carryingId === id ? 0.3 : 1,
                    }}
                  >
                    <span aria-hidden="true" className="inline-block rounded-full"
                      style={{ width: 8, height: 8, background: colour, boxShadow: `0 0 8px ${colour}` }} />
                    <span className="truncate" style={{ color: 'rgba(242,240,236,1)' }}>{s.intent_title || s.name}</span>
                    <span className="text-[14px] tabular-nums" style={{ color: 'rgba(242,240,236,0.62)' }}>{lengthOf(s)}</span>
                    {canMove ? (
                      <span
                        data-grip="true"
                        aria-label="Move"
                        onTouchStart={(e) => pick(e, s, id, d, e.touches[0]?.clientY ?? 0)}
                        onPointerDown={(e) => { if (e.pointerType === 'mouse') pick(e, s, id, d, e.clientY); }}
                        className="inline-flex items-center justify-center -my-2 py-2"
                        style={{ color: 'rgba(242,240,236,0.62)', touchAction: 'none', cursor: 'grab' }}
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                    ) : <span />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {drag.card}
    </div>
  );
}
