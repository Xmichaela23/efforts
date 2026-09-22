/**
 * ⛔ "CAN'T TRAIN THIS DAY" (2026-09-21, docs/WORKORDER-lost-day-2026-09-21.md Stage 3).
 *
 * The week with the lost day's sessions already placed by the server (`place-lost-day`, on the move check). The
 * athlete can drag any session to another day; every drag re-asks the server. Nothing is written until Accept, and
 * Accept saves each moved session through the calendar's own move path (`@/lib/session-move`), so it records the
 * day it left and stays moved.
 *
 * ⚠️ IT PLACES NOTHING. The strip and the list render what the server sent; the notes are the server's words.
 * ⚠️ THE STRIP IS THE BUILDER'S (`./WeekStrip`). The day list is this screen's own: the builder's `WeekGrid` is a
 * picture with nothing to drag.
 */
import React from 'react';
import { GripVertical } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { movePatch } from '@/lib/session-move';
import { getDisciplineColor } from '@/lib/context-utils';
import { displayDisciplineOf } from '@/lib/utils';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { invalidateWorkoutScreens } from '@/utils/invalidateWorkoutScreens';
import WeekStrip from './WeekStrip';

type Session = { id: string; name: string | null; type: string | null; from: string; to: string; movable: boolean; notes: string[] };
type Plan = { lostDate: string; week: string[]; sessions: Session[] };

const WEEKDAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const weekdayOf = (d: string) => WEEKDAY[new Date(`${d}T12:00:00`).getDay()];
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const sportOf = (s: Session) => displayDisciplineOf({ type: s.type ?? '' } as never);
const NO_SELECT = { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties;

export default function LostDaySheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { updatePlannedWorkout } = usePlannedWorkouts({ fetchWindowedPlanned: false });
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [moves, setMoves] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [drag, setDrag] = React.useState<{ id: string; over: string | null } | null>(null);

  /** Ask the server for the week, with the athlete's drags so far. */
  const ask = React.useCallback(async (m: Record<string, string>) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('place-lost-day', { body: { date, moves: m } });
      if (error) { console.error('[lost-day] place failed', error); return; }
      setPlan(data as Plan);
    } finally {
      setBusy(false);
    }
  }, [date]);
  React.useEffect(() => { void ask({}); }, [ask]);

  const moveTo = (id: string, to: string) => {
    const s = plan?.sessions.find((x) => x.id === id);
    if (!s || !s.movable || s.to === to) return;
    const next = { ...moves, [id]: to };
    setMoves(next);
    void ask(next);
  };

  /** One gesture for finger and mouse: pointer events on the grip, the day under the pointer is the target. */
  const onGripDown = (e: React.PointerEvent, s: Session) => {
    if (!s.movable) return;
    e.preventDefault();
    e.stopPropagation();
    // Keeps the moves coming to the grip while the finger travels; never allowed to stop the drag.
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* no live pointer to capture */ }
    setDrag({ id: s.id, over: null });
    try { (navigator as { vibrate?: (n: number) => void }).vibrate?.(12); } catch { /* not offered */ }
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const over = el?.closest('[data-lost-day]')?.getAttribute('data-lost-day') ?? null;
    if (over !== drag.over) setDrag({ ...drag, over });
  };
  const onGripUp = () => {
    if (drag?.over) moveTo(drag.id, drag.over);
    setDrag(null);
  };

  const accept = async () => {
    if (!plan || !updatePlannedWorkout) return;
    setSaving(true);
    try {
      for (const s of plan.sessions) {
        if (!s.movable || s.to === s.from) continue;
        await updatePlannedWorkout(s.id, await movePatch(s.id, s.to));
      }
      invalidateWorkoutScreens();
      onClose();
    } catch (err) {
      console.error('[lost-day] accept failed', err);
    } finally {
      setSaving(false);
    }
  };

  // The days shown: the week, and any day past it a session had to go to.
  const days = plan ? [...new Set([...plan.week, ...plan.sessions.map((s) => s.to)])].sort() : [];
  const byDay: Record<string, string[]> = {};
  for (const s of plan?.sessions ?? []) {
    if (!plan!.week.includes(s.to)) continue;
    (byDay[weekdayOf(s.to)] ??= []).push(sportOf(s));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 'calc(var(--tabbar-h, 56px) + env(safe-area-inset-bottom, 0px) + var(--tabbar-extra, 0px))',
      }}
    >
      <div className="absolute inset-0 backdrop-blur-md" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose} />
      <div
        className="relative w-full max-w-lg mx-4 mb-4 p-5 max-h-[calc(100%-1rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/15"
        style={{ background: 'rgba(20,20,22,0.97)', WebkitOverflowScrolling: 'touch', ...NO_SELECT }}
      >
        <p className="text-base font-light text-white">Can&apos;t train this day</p>
        <p className="text-xs text-white/50 mt-1">{fmtDay(date)}</p>

        {plan ? (
          <div className={`mt-4 space-y-3 ${busy ? 'opacity-50' : ''} transition-opacity`}>
            <WeekStrip byDay={byDay} />
            <div className="rounded-xl border border-white/10 overflow-hidden">
              {days.map((d) => {
                const on = plan.sessions.filter((s) => s.to === d);
                const lost = d === plan.lostDate;
                const over = drag?.over === d;
                return (
                  <div
                    key={d}
                    data-lost-day={d}
                    className="grid gap-2 px-3 py-2 border-b border-white/10 last:border-b-0"
                    style={{
                      gridTemplateColumns: '52px minmax(0,1fr)',
                      background: over ? 'rgba(255,255,255,0.09)' : lost ? 'rgba(255,255,255,0.02)' : 'transparent',
                      opacity: lost ? 0.45 : 1,
                    }}
                  >
                    <div className="text-[12px] uppercase" style={{ color: 'rgba(242,240,236,0.36)', lineHeight: 1.15 }}>
                      {new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}
                      <b className="block text-[16px] font-normal tabular-nums" style={{ color: 'rgba(242,240,236,0.85)' }}>
                        {new Date(`${d}T12:00:00`).getDate()}
                      </b>
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-0 justify-center">
                      {on.map((s) => {
                        const colour = getDisciplineColor(sportOf(s));
                        const moved = s.to !== s.from;
                        return (
                          <div key={s.id} style={{ opacity: drag?.id === s.id ? 0.3 : 1 }}>
                            <div className="grid items-center gap-2.5 text-[15px] min-w-0" style={{ gridTemplateColumns: '10px minmax(0,1fr) 24px' }}>
                              <span
                                className="inline-block rounded-full"
                                style={{ width: 8, height: 8, background: moved ? 'transparent' : colour, border: `2px solid ${colour}`, boxSizing: 'border-box' }}
                              />
                              <span className="truncate" style={{ color: s.movable ? 'rgba(242,240,236,1)' : 'var(--label-secondary)' }}>{s.name}</span>
                              {s.movable ? (
                                <span
                                  aria-hidden="true"
                                  onPointerDown={(e) => onGripDown(e, s)}
                                  onPointerMove={onGripMove}
                                  onPointerUp={onGripUp}
                                  onPointerCancel={() => setDrag(null)}
                                  className="inline-flex items-center justify-center -my-2 py-2"
                                  style={{ color: 'rgba(242,240,236,0.62)', touchAction: 'none', cursor: 'grab' }}
                                >
                                  <GripVertical className="w-4 h-4" />
                                </span>
                              ) : <span />}
                            </div>
                            {s.notes.map((n, i) => (
                              <p key={i} className="mt-1 ml-[20px] text-[13px] font-light" style={{ color: 'rgba(242,240,236,0.62)' }}>{n}</p>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex gap-3 pt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl font-light text-white/60 bg-white/[0.05] border-2 border-white/10"
          >
            Cancel
          </button>
          <button
            onClick={() => void accept()}
            disabled={!plan || busy || saving}
            className="flex-1 px-4 py-3 rounded-xl font-light text-white border-2 disabled:opacity-40"
            style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.3)' }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
