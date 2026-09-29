/**
 * ═══ PAST — EVERY FINISHED SESSION, NEWEST FIRST (Michael, 2026-09-28) ══════════════════════════════════
 *
 * Home's third tab. FIELD — Strava (You → Activities) and Garmin Connect (All Activities) keep the athlete's sessions
 * as one list beside the calendar, newest first, filtered by sport; Strong keeps a History tab for lifts. Approved
 * words: the tab "Past" (renamed from "History" by Michael, 2026-09-28), the filter "All · Run · Ride · Strength · Swim" (a sport shows once one is logged), and each
 * row the Today card's own title and line, grouped by day ("Mon, Sep 28" / "Surge and Float · 3.3 mi · 33:37").
 *
 * ⛔ NOTHING IS WORKED OUT HERE. The rows are get-week's, week by week, through the same fetch and cache key as the
 * Week tab (`fetchWeekUnified`, ['weekUnified', …]) — the title is `deriveWorkoutTitle` (the plan's name when one is
 * attached, get-week's `session_title`) and the line is get-week's `done_headline`, exactly what Today prints. A tap
 * opens the session the way Today's card does (`onOpen` = AppLayout's `handleEditEffort`).
 * OURS — four weeks at a time (`WEEKS_PER_PAGE`), each week one get-week call, as the Week tab makes.
 */
import React, { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getStoredUserId } from '@/lib/supabase';
import { fetchWeekUnified } from '@/lib/fetchWeekUnified';
import { mapUnifiedItemToCompleted } from '@/utils/workout-mappers';
import { deriveWorkoutTitle } from '@/lib/derive-workout-title';
import { doneHeadline } from './SessionDeck';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { getDisciplineColor } from '@/lib/context-utils';

// OURS — how many weeks one "Show earlier" adds; no outside source.
const WEEKS_PER_PAGE = 4;

type Sport = 'run' | 'ride' | 'strength' | 'swim';
const SPORTS: Array<{ key: Sport; label: string }> = [
  { key: 'run', label: 'Run' },
  { key: 'ride', label: 'Ride' },
  { key: 'strength', label: 'Strength' },
  { key: 'swim', label: 'Swim' },
];
function sportOf(type: unknown): Sport | null {
  const t = String(type ?? '').toLowerCase();
  if (t === 'run' || t === 'walk' || t === 'running') return 'run';
  if (t === 'ride' || t === 'bike' || t === 'cycling') return 'ride';
  if (t === 'strength') return 'strength';
  if (t === 'swim') return 'swim';
  return null;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Monday of the week holding `d`, local time. */
function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}
function weekRanges(count: number): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  const start = mondayOf(new Date());
  for (let i = 0; i < count; i++) {
    const mon = new Date(start); mon.setDate(start.getDate() - 7 * i);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    out.push({ from: iso(mon), to: iso(sun) });
  }
  return out;
}
const dayHeading = (dateISO: string) => {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- get-week's item, printed as sent
type Row = Record<string, any>;

/** The Today card's completed row for a get-week item (TodaysEffort `dateWorkoutsMemo`, the completed branch). */
function completedRowOf(it: Row): Row | null {
  if (String(it?.status || '').toLowerCase() !== 'completed') return null;
  const row = it?.completed_workout ?? mapUnifiedItemToCompleted(it);
  if (!row) return null;
  return {
    ...row,
    workout_analysis: row?.workout_analysis ?? it?.workout_analysis ?? null,
    name: row?.name ?? it?.name ?? null,
    intent_title: row?.intent_title ?? it?.intent_title ?? null,
    session_title: row?.session_title ?? it?.session_title ?? null,
    day_order: row?.day_order ?? it?.day_order ?? null,
    date: String(row?.date ?? it?.date ?? '').slice(0, 10),
    type: row?.type ?? it?.type,
  };
}

export default function HistoryList({ onOpen }: { onOpen: (workout: Row) => void }) {
  const [weeks, setWeeks] = useState(WEEKS_PER_PAGE);
  const [sport, setSport] = useState<Sport | 'all'>('all');
  const userId = getStoredUserId();
  const ranges = useMemo(() => weekRanges(weeks), [weeks]);

  const results = useQueries({
    queries: ranges.map((r) => ({
      queryKey: ['weekUnified', 'me', userId, r.from, r.to],
      enabled: !!userId,
      queryFn: () => fetchWeekUnified(r.from, r.to),
      staleTime: 60 * 60 * 1000,
      gcTime: 6 * 60 * 60 * 1000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });
  const loading = results.some((q) => q.isLoading);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const q of results) {
      for (const it of ((q.data as { items?: Row[] } | undefined)?.items ?? [])) {
        const row = completedRowOf(it);
        if (!row || !row.date) continue;
        const id = String(row.id ?? `${row.date}-${row.type}-${row.day_order}`);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(row);
      }
    }
    const rank = (w: Row) => (Number.isFinite(Number(w?.day_order)) ? Number(w.day_order) : Number.MAX_SAFE_INTEGER);
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : rank(a) - rank(b)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((q) => q.dataUpdatedAt).join('|')]);

  // A sport's button shows once a session of it is in the list.
  const present = useMemo(() => new Set(rows.map((r) => sportOf(r.type)).filter(Boolean)), [rows]);
  const shown = sport === 'all' ? rows : rows.filter((r) => sportOf(r.type) === sport);
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of shown) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return [...m.entries()];
  }, [shown]);

  const chip = (key: Sport | 'all', label: string) => {
    const active = sport === key;
    return (
      <GalaxyButton
        key={key}
        shape="chip"
        variant={active ? 'primary' : 'secondary'}
        onClick={() => setSport(key)}
        aria-pressed={active}
        className="whitespace-nowrap"
      >
        {label}
      </GalaxyButton>
    );
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex gap-2 px-3 pb-3 overflow-x-auto flex-shrink-0">
        {chip('all', 'All')}
        {SPORTS.filter((s) => present.has(s.key)).map((s) => chip(s.key, s.label))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-6">
        {byDay.map(([date, list]) => (
          <div key={date} className="mb-4">
            <div className="text-footnote font-semibold text-label mb-1.5">{dayHeading(date)}</div>
            <div className="flex flex-col gap-1.5">
              {list.map((w) => {
                const headline = doneHeadline(w);
                return (
                  <button
                    key={String(w.id ?? `${date}-${w.type}`)}
                    type="button"
                    onClick={() => onOpen(w)}
                    className="w-full text-left galaxy-card plate-calm rounded-xl px-3 py-2.5"
                  >
                    {/* The sport's dot (Michael, 2026-09-28: "color coded"), Today's "● run" dot; the title stays white. */}
                    <span
                      aria-hidden
                      className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle translate-y-[-1px]"
                      style={{ backgroundColor: getDisciplineColor(String(w.type ?? '')) }}
                    />
                    <span className="text-body text-label font-medium">{deriveWorkoutTitle(w as never)}</span>
                    {headline ? <span className="text-body text-label-secondary tabular-nums"> · {headline}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!loading && byDay.length === 0 ? (
          <div className="text-subhead text-label-secondary py-6 text-center">No finished sessions in these weeks.</div>
        ) : null}
        <div className="flex justify-center pt-2">
          <GalaxyButton variant="ghost" size="sm" disabled={loading} onClick={() => setWeeks((n) => n + WEEKS_PER_PAGE)}>
            Show earlier
          </GalaxyButton>
        </div>
      </div>
    </div>
  );
}
