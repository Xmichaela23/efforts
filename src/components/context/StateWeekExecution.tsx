import React from 'react';
import { WeekAccentLine } from './state-primitives';

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
export default function StateWeekExecution({ wsv }: { wsv: any; week?: any }) {
  /**
   * ⛔ THE PLANNED-VS-DONE BARS ARE GONE (Michael, 2026-09-18): the "THIS WEEK · SESSIONS PLANNED VS DONE" label,
   * both bars, the sport percentages and "N pts · 7 d". The week now reads as time per sport at the top of the
   * load card (`load.week_time_line`, LoadBar). The server's one composed accent sentence stays.
   */
  const we = (wsv as any).week_execution_v1 as {
    accent?: { sentence: string; trace?: { detail?: string } } | null;
  } | null | undefined;
  const accent = we?.accent ?? null;
  if (!accent?.sentence) return null;
  return <WeekAccentLine sentence={accent.sentence} detail={accent.trace?.detail ?? null} />;
}
