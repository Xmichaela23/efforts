import React from 'react';
import { Chip, trendColor, fmtBodyAsOf, type VisibleSignal } from './state-primitives';

/**
 * BODY — extracted from StateTab 2026-09-01 (Round 0a). No behaviour change, JSX verbatim.
 * The row-expansion state moved in with the rows it belongs to; nothing outside this block read it.
 */
export default function StateBodyBlock({
  visibleSignals,
  readinessRpeDriver,
  onOpenAdjust,
}: {
  visibleSignals: VisibleSignal[];
  readinessRpeDriver: string | null;
  onOpenAdjust: () => void;
}) {
  // ⛔ NO TAP-TO-REVEAL (Michael 2026-09-03: one click). Provenance prints under its row.
  return (
  <div className="px-3 py-3">
    <div className="flex items-start gap-3">
      <span className="readout-label text-[12px] font-semibold tracking-[0.12em] uppercase pt-0.5 w-[72px] shrink-0">BODY</span>
      <div className="flex-1 space-y-1.5 tabular-nums">
        {/* overall_training_read "This week" fallback DELETED 2026-07-24 — the ~25-branch summary
            duplicated the load bar above (F8 / docs/COPY-VOICE.md). When BODY has no per-metric
            signals it now simply reads "not enough data". */}
        {visibleSignals.length === 0 && (
          <Chip value="not enough data" valueClass="text-white/55" />
        )}
        {visibleSignals.map((s) => (
          <div key={s.label}>
            {/* ⛔ SAME GRAMMAR AS THE SPORT ROWS BELOW (Layout Rules §1, 2026-09-03): name left, value
                right, note under the value. Only when the server sends a value slot (payload v189+);
                an older cached row still carries one sentence in `detail` and renders the old way. */}
            {s.value_display ? (
              <div className="w-full grid grid-cols-[1fr_auto] items-baseline gap-x-3">
                <span className="text-[12px] text-white/55 leading-tight min-w-0">{s.label}</span>
                <span className="flex flex-col items-end text-right">
                  <span className={`text-[15px] leading-tight tabular-nums ${s.trend_tone === 'neutral' ? 'text-white/90' : trendColor(s.trend, s.trend_tone)}`}>{s.value_display}</span>
                  {s.detail && <span className="text-[11px] text-white/40 leading-tight whitespace-nowrap">{s.detail}</span>}
                </span>
              </div>
            ) : (
              <div className="w-full flex items-start gap-3 text-left">
                <span className="text-[13px] text-white/70 shrink-0 w-[104px]">{s.label}</span>
                <div className="flex-1 flex items-start gap-2 min-w-0">
                  <span className={`flex-1 text-[13px] text-left leading-snug ${trendColor(s.trend, s.trend_tone)}`}>{s.detail}</span>
                </div>
              </div>
            )}
            {/* ⛔ THE PERSISTENCE LINE POINTS AT A DOOR, IT DOES NOT OPEN ONE ITSELF (D-354).
                Soreness above this athlete's OWN normal for 4 of the last 6 sessions. It states
                the fact and offers the Adjust tab; nothing changes unless the athlete goes and
                changes it. ⚠️ Adjust is still a scaffold for endurance — strength steers work
                (in the logger), ease/push does not exist yet. Sending someone there is honest
                because that tab says so itself; it is not honest to pretend the line acts. */}
            {s.soreness_flag && (
              <button
                type="button"
                onClick={onOpenAdjust}
                className="w-full flex items-baseline gap-2 text-left pl-[116px] -mt-0.5 mb-1"
              >
                <span className="text-[12px] text-white/60 leading-snug">{s.soreness_flag}</span>
                <span className="text-[12px] text-white/40 shrink-0">Adjust ›</span>
              </button>
            )}
            {/* Whoop pairing (verdict + its driver, together): the RPE driver — which session
                moved the week — sits WITH the "how hard it feels" verdict, dim + always-visible.
                RPE-clause only (server guarantees no non-RPE factor reaches this row). */}
            {s.label === 'effort' && readinessRpeDriver && (
              <p className="text-[13px] text-white/65 leading-snug mt-0.5">{readinessRpeDriver}</p>
            )}
            {fmtBodyAsOf(s.as_of_date) && (
              <p className="text-[12px] text-white/45 leading-snug mt-0.5">{fmtBodyAsOf(s.as_of_date)}</p>
            )}
            {s.provenance && (
              <p className="text-[12px] text-white/45 leading-snug mt-1 max-w-[min(100%,320px)]">{s.provenance}</p>
            )}
          </div>
        ))}
        {/* The BODY 'Cross-training' row is DELETED (D-354). BODY is only what the athlete
            REPORTS — effort and soreness. This row compared declared targets against GPS
            mileage, which the athlete already knows. The server no longer sends the field. */}
      </div>
    </div>
  </div>
  );
}
