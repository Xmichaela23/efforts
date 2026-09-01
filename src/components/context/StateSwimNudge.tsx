import React from 'react';
import { snoozeNudge } from './state-primitives';

/**
 * SWIM re-test nudge — extracted from StateTab 2026-09-01 (Round 0a). No behaviour change.
 * ⛔ THE VISIBILITY TEST STAYS IN THE CALLER (`swimNudge?.show && nonce >= 0 && !isNudgeSnoozed`),
 *    because the plate above uses `divide-y` — a child that renders null still draws no divider,
 *    but a wrapper element would. Same reason the 0b gate stayed out.
 */
export default function StateSwimNudge({
  weeksSince,
  onDismiss,
}: {
  weeksSince: number;
  onDismiss: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-sky-400/20 bg-sky-500/[0.07] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold tracking-[0.12em] text-sky-300/85 uppercase mb-1">Swim check-in</p>
          <p className="text-[13px] text-white/75 leading-snug">
            About {Math.round(weeksSince)} weeks of steady swimming since your last update — a quick CSS test would refresh your threshold.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { snoozeNudge('swim_retest'); onDismiss(); }}
          className="text-[13px] text-white/60 hover:text-white/70 shrink-0 touch-manipulation"
          aria-label="Dismiss swim check-in"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
