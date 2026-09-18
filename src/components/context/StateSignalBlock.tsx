import React from 'react';
import { snoozeNudge } from './state-primitives';

/**
 * SIGNAL — longitudinal nudge, only when there's an actionable signal.
 * Extracted from StateTab 2026-09-01 (Round 0a). No behaviour change, JSX verbatim.
 * ⛔ The `showNudge` test stays in the caller — see StateSwimNudge for why.
 */
export default function StateSignalBlock({
  severity,
  headline,
  nudgeKind,
  onDismiss,
  onReviewWithArc,
}: {
  severity?: string;
  headline: string;
  nudgeKind: string;
  onDismiss: () => void;
  onReviewWithArc: () => void;
}) {
  return (
    <div className="px-3 py-3">
      <div className="flex items-start gap-3">
        <span className="readout-label text-caption font-semibold tracking-[0.12em] uppercase pt-0.5 w-[72px] shrink-0">SIGNAL</span>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className={`text-footnote leading-snug flex-1 ${
              severity === 'concern' ? 'text-amber-400' : 'text-label-secondary'
            }`}>
              {headline}
            </span>
            <button
              type="button"
              className="shrink-0 p-0.5 text-label-secondary hover:text-label-secondary bg-transparent border-none cursor-pointer"
              aria-label="Dismiss signal"
              onClick={() => {
                snoozeNudge(nudgeKind);
                onDismiss();
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <button
            type="button"
            className="mt-1.5 text-footnote text-teal-400 hover:text-teal-300 bg-transparent border-none cursor-pointer p-0"
            onClick={onReviewWithArc}
          >
            Review with Arc →
          </button>
        </div>
      </div>
    </div>
  );
}
