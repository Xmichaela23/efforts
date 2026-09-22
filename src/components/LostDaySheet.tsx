/**
 * ⛔ "CAN'T TRAIN THIS DAY" (2026-09-21, docs/WORKORDER-lost-day-2026-09-21.md Stage 3).
 *
 * The week with the lost day's sessions already placed by the server (`place-lost-day`, on the move check). The
 * athlete can drag any session to another day; every drag re-asks the server. Nothing is written until Save, and
 * Save stores each moved session through the calendar's own move path (`@/lib/session-move`), so it records the
 * day it left and stays moved.
 *
 * ⚠️ IT PLACES NOTHING. The strip and the list render what the server sent; the notes are the server's words.
 * ⚠️ THE STRIP IS THE BUILDER'S (`./WeekStrip`). The day list is this screen's own: the builder's `WeekGrid` is a
 * picture with nothing to drag.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { GripVertical } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { movePatch } from '@/lib/session-move';
import { getDisciplineColor } from '@/lib/context-utils';
import { displayDisciplineOf } from '@/lib/utils';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { invalidateWorkoutScreens } from '@/utils/invalidateWorkoutScreens';
import WeekStrip from './WeekStrip';
import { useCarryDrag } from '@/hooks/useCarryDrag';

type Session = { id: string; name: string | null; type: string | null; from: string; to: string; movable: boolean; dropped?: boolean; notes: string[] };
type Plan = { lostDate: string; week: string[]; sessions: Session[] };

const WEEKDAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const weekdayOf = (d: string) => WEEKDAY[new Date(`${d}T12:00:00`).getDay()];
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
/** The calendar's own sport reading, tags included — so a plyo warm-up is the calendar's pink, not the lift orange. */
const sportOf = (s: Session, tags: Record<string, string[]>) => displayDisciplineOf({ type: s.type ?? '', tags: tags[s.id] ?? [] } as never);
/**
 * The move check's p108 note, word for word (`_shared/move-check/index.ts`). ⚠️ The server sends notes as words, so the
 * sheet recognises this one by its exact text to show it once per day; if the approved words change, change both.
 */
const P108_NOTE = 'Two sessions this day: 6 to 8 hours before the lift, or 4 to 6 if the first is an easy session under an hour, with a full meal in between.';
const NO_SELECT = { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties;

export default function LostDaySheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { updatePlannedWorkout } = usePlannedWorkouts({ fetchWindowedPlanned: false });
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [moves, setMoves] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  /**
   * ⛔ THE ROWS' TAGS, FOR THE DISPLAY ONLY (2026-09-21): which session is a plyo warm-up — its colour and its place
   * in the day. The server's answer carries no tags; this reads them once per set of sessions. Read by tag, never name.
   */
  const [tags, setTags] = React.useState<Record<string, string[]>>({});
  const idsKey = (plan?.sessions ?? []).map((s) => s.id).sort().join(',');
  React.useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    const missing = ids.filter((id) => !(id in tags));
    if (missing.length === 0) return;
    void supabase.from('planned_workouts').select('id, tags').in('id', missing).then(({ data }) => {
      const next: Record<string, string[]> = {};
      for (const id of missing) next[id] = [];
      for (const r of (data ?? []) as Array<{ id: string; tags?: unknown }>) {
        next[r.id] = Array.isArray(r.tags) ? (r.tags as unknown[]).map((t) => String(t).toLowerCase()) : [];
      }
      setTags((t) => ({ ...t, ...next }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
  const isPlyo = (s: Session) => (tags[s.id] ?? []).includes('plyo');
  /**
   * ⛔ A WARM-UP LISTS DIRECTLY BEFORE THE SESSION IT WARMS UP, never after. Its session is the day's first other
   * session that came from the same day; failing that, the day's first other session.
   */
  const dayOrder = (on: Session[]): Session[] => {
    const rest = on.filter((s) => !isPlyo(s));
    const out = [...rest];
    for (const w of on.filter(isPlyo)) {
      const partner = rest.find((s) => s.from === w.from) ?? rest[0];
      const i = partner ? out.indexOf(partner) : out.length;
      out.splice(i < 0 ? out.length : i, 0, w);
    }
    return out;
  };

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

  /**
   * ⛔ THE CALENDAR'S CARRY (`useCarryDrag`, 2026-09-21): no page scroll or pull-to-refresh while carrying, a lifted
   * card under the finger, the day beneath lit. A drop on another day re-asks the server with that move.
   */
  const carry = useCarryDrag<string>({ dayAttr: 'data-lost-day', onDrop: (id, _from, to) => moveTo(id, to) });
  const pickUp = (el: HTMLElement, y: number, s: Session) => {
    if (!s.movable) return;
    const row = el.closest('[data-lost-session]') as HTMLElement | null;
    carry.pickUp(row, y, { id: s.id, name: s.name ?? '', colour: getDisciplineColor(sportOf(s, tags)) }, s.id, s.to);
  };

  const accept = async () => {
    if (!plan || !updatePlannedWorkout) return;
    setSaving(true);
    try {
      for (const s of plan.sessions) {
        if (!s.movable) continue;
        // ⛔ A SESSION THAT COMES OFF IS SKIPPED, the app's existing skip — recorded, never deleted (2026-09-22).
        if (s.dropped) { await updatePlannedWorkout(s.id, { workout_status: 'skipped', skip_reason: null } as never); continue; }
        if (s.to === s.from) continue;
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
    if (s.dropped || !plan!.week.includes(s.to)) continue;
    (byDay[weekdayOf(s.to)] ??= []).push(sportOf(s, tags));
  }

  /**
   * ⛔ THE SHEET OWNS THE SCREEN WHILE IT IS OPEN (2026-09-21, from Michael's iPhone: it could not scroll to its top
   * and Cancel/Save were cut off). Full height, above the tab bar and everything else, portalled out of the calendar
   * card. The title and the day chips stay at the top, Cancel and Save stay at the bottom above the safe area, and
   * ONLY THE WEEK LIST SCROLLS. The page behind does not move: its scroll is locked while the sheet is open, and a
   * touch that is not on the list cannot scroll anything.
   */
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const body = document.body;
    const before = { overflow: body.style.overflow, overscroll: body.style.overscrollBehavior };
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    const root = rootRef.current;
    // Non-passive, so it may cancel: a finger outside the list scrolls nothing.
    const onMove = (e: TouchEvent) => {
      if (!listRef.current?.contains(e.target as Node)) e.preventDefault();
    };
    root?.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      body.style.overflow = before.overflow;
      body.style.overscrollBehavior = before.overscroll;
      root?.removeEventListener('touchmove', onMove);
    };
  }, []);

  /** The two-sessions note (p108) is about a DAY: shown once, under the day, not under each session on it. */
  const isDayNote = (n: string) => n === P108_NOTE;

  return createPortal(
    <div
      ref={rootRef}
      data-pull-refresh-ignore
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: 'rgb(16,16,18)', ...NO_SELECT }}
    >
      <div className="flex-shrink-0 px-4 pb-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}>
        <p className="text-base font-light text-white">Can&apos;t train this day</p>
        <p className="text-xs text-white/50 mt-1">{fmtDay(date)}</p>
        {/* Approved copy (Michael, 2026-09-21; docs/WORKORDER-lost-day-2026-09-21.md). [Weekday] = the lost day's full name. */}
        <p className="text-[13px] font-light mt-2" style={{ color: 'rgba(242,240,236,0.62)' }}>
          {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}&apos;s sessions moved to the best days left this week. Nothing is saved until you tap Save.
        </p>
        {plan ? (
          <div className={`mt-3 ${busy ? 'opacity-50' : ''} transition-opacity`}>
            <WeekStrip byDay={byDay} />
          </div>
        ) : null}
      </div>

      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto px-4"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        {plan ? (
          <div className={`rounded-xl border border-white/10 overflow-hidden ${busy ? 'opacity-50' : ''} transition-opacity`}>
            {days.map((d) => {
              const on = dayOrder(plan.sessions.filter((s) => s.to === d && !s.dropped));
              const lost = d === plan.lostDate;
              const dayNote = on.some((s) => s.notes.some(isDayNote));
              return (
                <div
                  key={d}
                  data-lost-day={d}
                  className="grid gap-2 px-3 py-2 border-b border-white/10 last:border-b-0"
                  style={{
                    gridTemplateColumns: '52px minmax(0,1fr)',
                    background: lost ? 'rgba(255,255,255,0.02)' : 'transparent',
                    opacity: lost && !carry.overStyle(d) ? 0.45 : 1,
                    ...(carry.overStyle(d) ?? {}),
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
                      const colour = getDisciplineColor(sportOf(s, tags));
                      const moved = s.to !== s.from;
                      return (
                        <div key={s.id} style={{ opacity: carry.carryingId === s.id ? 0.3 : 1 }}>
                          <div data-lost-session={s.id} className="grid items-center gap-2.5 text-[15px] min-w-0" style={{ gridTemplateColumns: '10px minmax(0,1fr) 24px' }}>
                            <span
                              className="inline-block rounded-full"
                              style={{ width: 8, height: 8, background: moved ? 'transparent' : colour, border: `2px solid ${colour}`, boxSizing: 'border-box' }}
                            />
                            <span className="truncate" style={{ color: s.movable ? 'rgba(242,240,236,1)' : 'var(--label-secondary)' }}>{s.name}</span>
                            {s.movable ? (
                              <span
                                aria-hidden="true"
                                onTouchStart={(e) => { e.stopPropagation(); const t = e.touches[0]; if (t) pickUp(e.currentTarget, t.clientY, s); }}
                                onPointerDown={(e) => { if (e.pointerType === 'mouse') { e.preventDefault(); pickUp(e.currentTarget, e.clientY, s); } }}
                                className="inline-flex items-center justify-center -my-2 py-2"
                                style={{ color: 'rgba(242,240,236,0.62)', touchAction: 'none', cursor: 'grab' }}
                              >
                                <GripVertical className="w-4 h-4" />
                              </span>
                            ) : <span />}
                          </div>
                          {s.notes.filter((n) => !isDayNote(n)).map((n, i) => (
                            <p key={i} className="mt-1 ml-[20px] text-[13px] font-light" style={{ color: 'rgba(242,240,236,0.62)' }}>{n}</p>
                          ))}
                        </div>
                      );
                    })}
                    {dayNote ? (
                      <p className="mt-0.5 ml-[20px] text-[13px] font-light" style={{ color: 'rgba(242,240,236,0.62)' }}>{P108_NOTE}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        {/* ⛔ WHAT COMES OFF THIS WEEK (2026-09-22) — approved words, one line per session; skipped on Save. */}
        {plan && plan.sessions.some((s) => s.dropped) ? (
          <div className="mt-3 space-y-1.5">
            {plan.sessions.filter((s) => s.dropped).map((s) => (
              <p key={s.id} className="text-[13px] font-light" style={{ color: 'rgba(242,240,236,0.62)' }}>
                {s.name} comes off this week. There&apos;s no day left for it.
              </p>
            ))}
          </div>
        ) : null}
        <div className="h-3" />
      </div>

      <div
        className="flex-shrink-0 flex gap-3 px-4 pt-3 border-t border-white/10"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
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
          Save
        </button>
      </div>
      {carry.card}
    </div>,
    document.body,
  );
}
