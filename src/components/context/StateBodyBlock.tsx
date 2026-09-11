import React from 'react';
import { trendColor, fmtBodyAsOf, type VisibleSignal } from './state-primitives';
import { Dot } from '../LoadBar';

/**
 * BODY — extracted from StateTab 2026-09-01 (Round 0a).
 *
 * ⛔ ONE ROW OF READINGS, DRAWN LIKE LOAD'S (2026-09-10, Michael: BODY stood four times the height of
 * the LOAD block directly above it). It was a stacked name/value/note grid — one three-line row per
 * signal — on a plate whose first block prints fitness · fatigue · form on a single line. Same
 * numbers, same words, same server fields: effort, soreness and the logged count now read across one
 * wrapping line, with `Dot` from LoadBar so the separator is literally the same component.
 *
 * ⚠️ NOTHING IS COMPUTED HERE. `value_display`, `detail`, `soreness_flag` and `as_of_date` are printed
 * exactly as the coach payload sends them (Law 4) — the client never re-words or re-rounds a BODY row.
 */
export default function StateBodyBlock({
  visibleSignals,
  windowLabel = null,
  readinessRpeDriver,
}: {
  visibleSignals: VisibleSignal[];
  /** The coach's window for every number in the section ("last 7 days"). Printed once, here. */
  windowLabel?: string | null;
  readinessRpeDriver: string | null;
}) {
  // ⛔ NO TAP-TO-REVEAL (Michael 2026-09-03: one click). Provenance prints under its row.
  const sorenessFlag = visibleSignals.find((s) => s.soreness_flag)?.soreness_flag ?? null;
  return (
  <div className="px-3 py-3">
    {/* Heading line — the section name, what it is made of, and the window it rests on.
        ⛔ NO LINK HERE (Michael 2026-09-10). The Adjust TAB at the top of the screen is the way in;
        a second door inside the block was a second route to the same place. */}
    <div className="flex items-baseline gap-x-3">
      <span className="readout-label text-[11px] font-semibold tracking-[0.12em] uppercase">
        BODY{' '}
        {/* ⛔ THE BLOCK SAYS WHERE ITS NUMBERS COME FROM (Michael 2026-09-10) — every row here is what the
            athlete typed after a session, not something measured. Same words as the D-354 ruling. */}
        <span className="normal-case tracking-normal font-normal text-[11px] text-white/45">(as you logged)</span>
        {/* ⛔ THE WINDOW, ONCE, IN THE SMALL GREY LABEL (Michael 2026-09-10) — the rows no longer repeat it. */}
        {windowLabel && visibleSignals.length > 0 && (
          <span className="normal-case tracking-normal font-normal text-[11px] text-white/45 ml-1">· {windowLabel}</span>
        )}
      </span>
    </div>

    {/* The readings — LoadBar's row construction verbatim: a fixed 12 px separator slot pulled into the
        gap before each reading, the row clipping its left edge so a wrapped line loses its leading dot
        instead of dangling one at the end of the line above. */}
    <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1 overflow-hidden py-0.5 -my-0.5 text-[11px] text-white/45 leading-tight tabular-nums [&>span]:-ml-3">
      {/* overall_training_read "This week" fallback DELETED 2026-07-24 — the ~25-branch summary
          duplicated the load bar above (F8 / docs/COPY-VOICE.md). When BODY has no per-metric
          signals it now simply reads "not enough data". */}
      {visibleSignals.length === 0 && (
        <span className="text-[13px] text-white/55">not enough data</span>
      )}
      {visibleSignals.map((s) => (
        <span key={s.label}>
          <Dot />
          {s.label}{' '}
          {/* Only when the server sends a value slot (payload v189+); an older cached row still carries
              one sentence in `detail` and prints that as its reading. */}
          <span className={`readout-num text-[13px] ${s.trend_tone === 'neutral' ? 'text-white/85' : trendColor(s.trend, s.trend_tone)}`}>
            {s.value_display ? s.value_display : s.detail}
          </span>
          {s.value_display && s.detail && <span className="ml-1">· {s.detail}</span>}
          {fmtBodyAsOf(s.as_of_date) && <span className="ml-1">· {fmtBodyAsOf(s.as_of_date)}</span>}
        </span>
      ))}
    </div>

    {/* Whoop pairing (verdict + its driver, together): the RPE driver — which session moved the week —
        sits WITH the "how hard it feels" verdict, dim + always-visible. RPE-clause only (server
        guarantees no non-RPE factor reaches this row). Full width, under the readings. */}
    {readinessRpeDriver && visibleSignals.some((s) => s.label === 'effort') && (
      <p className="mt-1.5 text-[12px] text-white/65 leading-snug">{readinessRpeDriver}</p>
    )}

    {/* ⛔ THE PERSISTENCE LINE STATES A FACT AND DOES NOT ACT ON IT (D-354).
        Soreness above this athlete's OWN normal for 4 of the last 6 sessions. Nothing changes unless
        the athlete goes to the Adjust tab and changes it. ⚠️ Adjust is still a scaffold for endurance —
        strength steers work (in the logger), ease/push does not exist yet. It is not honest to pretend
        the line acts.
        ⛔ FULL WIDTH (2026-09-10) — it used to sit in a 116 px-indented column and wrapped to four lines. */}
    {sorenessFlag && (
      <p className="mt-1.5 text-[12px] text-white/60 leading-snug">{sorenessFlag}</p>
    )}
    {/* ⛔ NO PROVENANCE SENTENCE (Michael 2026-09-03: "AI slop talk in there"). The row is the value
        and its note; the window and source do not print.
        ⛔ BODY IS REPORTED-ONLY (Michael 2026-09-03): "it's solely a reported number, we shouldn't
        pull from anything else, this is the only place where we can see how overall training is
        being handled". Effort · soreness · logged · as of. No measured row, ever.
        The BODY 'Cross-training' row is DELETED (D-354). BODY is only what the athlete
        REPORTS — effort and soreness. This row compared declared targets against GPS
        mileage, which the athlete already knows. The server no longer sends the field. */}
  </div>
  );
}
