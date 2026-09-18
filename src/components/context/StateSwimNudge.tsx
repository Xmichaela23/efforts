import React from 'react';
import { snoozeNudge } from './state-primitives';

/**
 * SWIM re-test nudge — extracted from StateTab 2026-09-01 (Round 0a).
 * ⛔ THE VISIBILITY TEST STAYS IN THE CALLER, because the plate above uses `divide-y` — a child that
 *    renders null still draws no divider, but a wrapper element would.
 * ⛔ THE SENTENCE IS THE SERVER'S (2026-09-15, Stage 4 session 2) — `arc.swim_retest_nudge.sentence`.
 *    This card was handed a fraction of a week and rounded it in the render.
 */
export default function StateSwimNudge({
  sentence,
  onDismiss,
}: {
  sentence: string;
  onDismiss: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-sky-400/20 bg-sky-500/[0.07] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-caption font-semibold tracking-[0.12em] text-sky-300 uppercase mb-1">Swim check-in</p>
          <p className="text-footnote text-label-secondary leading-snug">{sentence}</p>
        </div>
        <button
          type="button"
          onClick={() => { snoozeNudge('swim_retest'); onDismiss(); }}
          className="text-footnote text-label-secondary hover:text-label-secondary shrink-0 touch-manipulation"
          aria-label="Dismiss swim check-in"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
