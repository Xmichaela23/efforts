import React from 'react';
import { WeekMixBar, WeekAccentLine, daysSinceYmd } from './state-primitives';

/**
 * "How your sessions went · last 7 days" — REBUILT (docs/STATE-WEEK-EXECUTION.md). Neutral
 * per-discipline planned-vs-done COUNTS + at most ONE composed accent. No fitness verdicts here
 * (that is PERFORMANCE, below); interval/execution % lives in session detail. Server owns the
 * accent; this renders it (Law 4). Three states: counts+accent / counts-only / nothing.
 *
 * Extracted from StateTab 2026-09-01 (Round 0a). No behaviour change; the body is the inline
 * IIFE verbatim, comments carried across, `wsv`/`week` passed straight through.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function StateWeekExecution({ wsv, week }: { wsv: any; week: any }) {
  const we = (wsv as any).week_execution_v1 as {
    counts?: Array<{ discipline: string; planned: number; done: number }>;
    accent?: { sentence: string; trace?: { detail?: string } } | null;
  } | null | undefined;
  const counts = Array.isArray(we?.counts) ? we!.counts! : [];
  const accent = we?.accent ?? null;
  if (counts.length === 0 && !accent) return null; // nothing to say → render nothing
  const hasPlan = !!wsv.plan?.has_active_plan;
  const totalPlanned = counts.reduce((s, c) => s + (c.planned || 0), 0);
  // F21/F26: partial week = the calendar week has not closed yet (end_date is still in the
  // future). daysSinceYmd = today − end_date, so < 0 means the week is still running.
  const endDays = daysSinceYmd((week as any)?.end_date ?? null);
  const partialWeek = endDays != null && endDays < 0;
  // Header: only claim "planned vs actual" when there IS a plan to compare against (F26).
  const showsPlanned = hasPlan && totalPlanned > 0;
  const sectionLabel = showsPlanned ? 'this week · planned vs actual' : 'this week';
  return (
    <>
      <div className="px-4 pt-3 text-[12px] text-white/50 lowercase tracking-[0.12em]">{sectionLabel}</div>
      {counts.length > 0 && <WeekMixBar counts={counts} hasPlan={hasPlan} partialWeek={partialWeek} />}
      {accent?.sentence && <WeekAccentLine sentence={accent.sentence} detail={accent.trace?.detail ?? null} />}
    </>
  );
}
