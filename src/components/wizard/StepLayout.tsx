// Shared wizard chrome — progress bar + back + title + scrollable body + continue button.
// Pure presentational, zero coupling to any specific wizard's state. Extracted verbatim from
// ArcSetupWizard (Cut B2) so the non-race builder reuses it without importing the 3000-line wizard.
import React from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';

export function StepLayout({
  step, totalSteps, title, subtitle, onBack, children, onContinue, canContinue, continueLabel = 'Continue', saving = false,
}: {
  step: number; totalSteps: number; title: string; subtitle?: string;
  onBack?: () => void; children: React.ReactNode;
  onContinue: () => void; canContinue: boolean; continueLabel?: string; saving?: boolean;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Progress */}
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="flex gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i < step ? 'bg-teal-400' : 'bg-white/15'}`}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-white/35 text-right">{step} of {totalSteps}</p>
      </div>

      {/* Back */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 self-start flex items-center gap-1 text-white/50 hover:text-white/80 text-sm px-4 py-1 mb-1"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
      )}

      {/* Title */}
      <div className="shrink-0 px-4 pb-4">
        <h2 className="text-[1.3rem] font-semibold text-white leading-snug tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1.5 text-[15px] text-white/55 leading-relaxed">{subtitle}</p>}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 space-y-3">
        {children}
      </div>

      {/* Continue */}
      <div className="shrink-0 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-zinc-950">
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue || saving}
          className="w-full min-h-[52px] rounded-xl bg-teal-500 text-white font-semibold text-base disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {continueLabel}
        </button>
      </div>
    </div>
  );
}
