import React, { useState } from 'react';
import { RefreshCw, ChevronDown } from 'lucide-react';

/**
 * The State screen HEADER — week label, the headline stack (or the aimless empty state), the
 * race-week guidance card, and the refresh control.
 * Extracted from StateTab 2026-09-01 (Round 0a). No behaviour change, JSX and comments verbatim.
 * `narrativeOpen` moved in with the button that owns it; nothing outside the header read it.
 */
export default function StateHeaderBlock({
  weekLabel,
  isAimless,
  aimlessHeadline,
  aimlessSubtext,
  aimlessCtaAction,
  aimlessCtaLabel,
  onAimlessCta,
  intentSummary,
  loadHeadline,
  readinessWhy,
  readinessSuggestion,
  raceWeekGuidance,
  coachBusy,
  onRefresh,
}: {
  weekLabel: string;
  isAimless: boolean;
  aimlessHeadline: string;
  aimlessSubtext: string;
  aimlessCtaAction: string;
  aimlessCtaLabel: string;
  onAimlessCta: () => void;
  intentSummary: string | null;
  loadHeadline: string | null;
  readinessWhy: string | null;
  readinessSuggestion: string | null;
  raceWeekGuidance?: { title: string; bullets: string[] } | null;
  coachBusy: boolean;
  onRefresh: () => void;
}) {
  const [narrativeOpen, setNarrativeOpen] = useState<boolean>(false);
  return (
    <div className="flex items-start justify-between mb-4 px-0.5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[13px] font-semibold tracking-widest text-white/65 uppercase">{weekLabel}</span>
          {/* Chip Option A / research (Whoop): readiness is STRAIN-class — never headline/crown material.
              It moved to BODY as the row's driver. "WEEK" stays as the plain section header. */}
        </div>
        {isAimless ? (
          <>
            <span className="text-[15px] font-medium text-white/85 leading-snug">{aimlessHeadline}</span>
            <span className="text-[13px] text-white/50 leading-snug">{aimlessSubtext}</span>
            {aimlessCtaAction !== 'none' && (
              <button
                type="button"
                onClick={onAimlessCta}
                className="mt-1 self-start rounded-lg border border-teal-400/30 bg-teal-500/10 px-3 py-1.5 text-[13px] font-medium text-teal-100/95 hover:bg-teal-500/15 active:opacity-90"
              >
                {aimlessCtaLabel}
              </button>
            )}
          </>
        ) : (
          <>
            {intentSummary && (
              <span className="text-[15px] font-medium text-white/85 leading-snug">{intentSummary}</span>
            )}
            {loadHeadline && (
              <span className="text-[14px] font-medium text-white/80 leading-snug">{loadHeadline}</span>
            )}
            {(readinessWhy || readinessSuggestion) && (
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setNarrativeOpen((o) => !o)}
                  className="self-start flex items-center gap-1 text-[13px] text-white/65 hover:text-white/70 transition-colors mt-0.5 touch-manipulation"
                  aria-expanded={narrativeOpen}
                >
                  {narrativeOpen ? 'Show less' : 'Show more'}
                  <ChevronDown className={`w-3 h-3 transition-transform ${narrativeOpen ? 'rotate-180' : ''}`} />
                </button>
                {narrativeOpen && (
                  <>
                    {/* D-232: the FATIGUED headline expands to its real factors, then the loaded-legs suggestion, then prose. */}
                    {readinessWhy && <span className="text-[13px] text-amber-300/70 leading-snug mt-1">{readinessWhy}</span>}
                    {readinessSuggestion && <span className="text-[13px] text-white/60 leading-snug mt-1">{readinessSuggestion}</span>}
                  </>
                )}
              </div>
            )}
          </>
        )}
        {!isAimless && raceWeekGuidance && raceWeekGuidance.bullets.length > 0 && (
          <div
            className="mt-2 rounded-lg border border-sky-400/20 bg-sky-500/[0.07] px-3 py-2.5"
            role="region"
            aria-label="Race-week guidance"
          >
            <p className="text-[12px] font-semibold tracking-[0.12em] text-sky-300/85 uppercase mb-1.5">
              {raceWeekGuidance.title}
            </p>
            <ul className="text-[13px] text-white/72 leading-relaxed space-y-1.5 list-disc pl-3.5 marker:text-sky-400/50">
              {raceWeekGuidance.bullets.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={coachBusy}
        className="min-h-[44px] min-w-[44px] -mr-1 flex items-center justify-center rounded-lg text-white/60 hover:text-white/65 hover:bg-white/[0.06] disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0 touch-manipulation relative z-10"
        aria-label={coachBusy ? 'Updating training data' : 'Refresh'}
      >
        <RefreshCw className={`w-4 h-4 ${coachBusy ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
