// Shared wizard chrome — progress bar + back + title + scrollable body + continue button.
// Pure presentational, zero coupling to any specific wizard's state. Extracted verbatim from
// ArcSetupWizard (Cut B2) so the non-race builder reuses it without importing the 3000-line wizard.
import React from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { getDisciplineColorRgb } from '@/lib/context-utils';

// Universal (brand / sport-agnostic) chrome reads as warm bone rather than any one sport's hue.
const UNIVERSAL_RGB = '236, 233, 227';

export function StepLayout({
  step, totalSteps, title, subtitle, onBack, children, onContinue, canContinue, continueLabel = 'Continue', saving = false, hideContinue = false, hideProgress = false, accent, blockedReason, footer,
}: {
  // ⚠️ `title` widened string → ReactNode (2026-08-05) so the Focus screens can set the eye mark
  // beside their heading. Every existing caller passes a plain string and is unaffected.
  step: number; totalSteps: number; title: React.ReactNode; subtitle?: string;
  onBack?: () => void; children: React.ReactNode;
  onContinue: () => void; canContinue: boolean; continueLabel?: string; saving?: boolean;
  /** A step where the CHOICE advances (tapping the card is the answer) has nothing for a Continue
   *  button to do. Rendering a dead control below the only thing on the screen reads as a missing
   *  step rather than a finished one. */
  hideContinue?: boolean;
  /** ⛔ FOR THE STEP WHERE THE FLOW LENGTH IS NOT YET KNOWN — a goal picker whose cards lead to
   *  flows of different lengths. Printing "1 of 6" and then jumping to "2 of 8" is a number the
   *  screen cannot stand behind, and this wizard has shipped that bug once already. A bar with
   *  nothing to measure is better absent than wrong. */
  hideProgress?: boolean;
  /** One short line naming what's still missing, shown right above a disabled Continue key so the
   *  reason and the dead button are one glance — never a silently-disabled control with the cause
   *  scrolled off-screen. Only renders while Continue is disabled (canContinue false, not saving). */
  blockedReason?: React.ReactNode;
  /**
   * ⛔ A STRIP THAT STAYS PUT, BETWEEN THE SCROLLING BODY AND THE CONTINUE KEY (2026-08-24).
   *
   * For the one thing on a step that must remain visible while the body is scrolled — the endurance
   * week's live lifting rate, which only teaches if you see it change. ⚠️ **It lives in the CHROME,
   * not in the body.** A `sticky` element inside `children` lifts up over its own siblings the moment
   * the content is taller than the port, and it parked on top of the volume inputs; no amount of
   * spacing fixes that, because the overlap is what sticky is for.
   *
   * ⚠️ Omit it and the layout is byte-identical to before — every other step passes nothing.
   */
  footer?: React.ReactNode;
  /** Sport that tints the chrome — a Discipline ('run'|'bike'|'swim'|'strength') resolves to its
   *  SPORT_COLORS hue; omit (or 'universal') for the sport-agnostic warm-bone chrome. The progress
   *  bar and the Continue key take this color; content inside a step tints itself. */
  accent?: string;
}) {
  // The chrome tints off the `--wiz-accent-rgb` CSS var so a wizard can set it ONCE on its root and
  // every step + every selection-state inside inherits it — no need to thread `accent` through 35
  // call sites. An explicit `accent` prop overrides the inherited var locally.
  const A = `var(--wiz-accent-rgb, ${UNIVERSAL_RGB})`;
  const accentOverride = accent && accent !== 'universal' ? getDisciplineColorRgb(accent) : undefined;
  // The final step is the commit ("Build plan") — it alone earns the shimmer, so motion means "this is the one".
  const isCommit = step >= totalSteps;
  // ⛔ WIDTH IS CLAMPED HERE, ONCE (2026-08-06). Every step of the marathon intake slid sideways
  // under the thumb and clipped its own copy on the right — a mobile screen must not scroll
  // horizontally, and fixing it per-step is how it comes back on the next screen anyone adds.
  // `min-w-0` is the load-bearing half: a flex child defaults to `min-width: auto`, so ONE wide
  // descendant (a long word, a 7-across grid, an input's intrinsic size) pushes the whole column
  // past the viewport and nothing above it can stop it.
  return (
    <div
      className="flex flex-col h-full min-h-0 w-full max-w-full min-w-0 overflow-x-hidden box-border"
      style={accentOverride ? ({ ['--wiz-accent-rgb']: accentOverride } as React.CSSProperties) : undefined}
    >
      {/* Progress */}
      {!hideProgress && (
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="flex gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={i < step
                ? { backgroundColor: `rgb(${A})`, boxShadow: `0 0 7px rgba(${A}, 0.55)` }
                : { backgroundColor: 'rgba(255,255,255,0.14)' }}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-white/35 text-right">{step} of {totalSteps}</p>
      </div>
      )}

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
      <div className="shrink-0 px-4 pb-4 min-w-0">
        <h2 className="text-[1.3rem] font-semibold text-white leading-snug tracking-tight break-words">{title}</h2>
        {subtitle && <p className="mt-1.5 text-[15px] text-white/55 leading-relaxed">{subtitle}</p>}
      </div>

      {/* Content */}
      {/* ⛔ THE BOTTOM PADDING IS THE CONTINUE BUTTON'S HEIGHT, NOT DECORATION. The button is the
          last flex child of a `h-full` column, and on iOS the visual viewport is shorter than that
          column while the toolbar is up — so the final field on a long step sat behind it and could
          not be scrolled clear. `pb-4` became a full button's worth of room. `break-words` stops a
          long unbroken string doing what the width clamp above exists to prevent. */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-24 space-y-3 break-words">
        {children}
      </div>

      {/* A step's own pinned strip, if it has one — see `footer`. Above the key, below the scroll. */}
      {footer && (
        <div className="shrink-0 px-4 pb-1 min-w-0">{footer}</div>
      )}

      {/* Continue — instrument key, backlit by the accent; the final (commit) step also shimmers */}
      {!hideContinue && (
      <div className="shrink-0 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-zinc-950">
        {!canContinue && !saving && blockedReason && (
          <p className="mb-2 text-xs leading-relaxed text-[rgba(var(--wiz-accent-rgb,236,233,227),0.85)]">
            {blockedReason}
          </p>
        )}
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue || saving}
          className="relative w-full min-h-[52px] rounded-xl text-[#ECEAE3] font-semibold text-base disabled:opacity-40 flex items-center justify-center gap-2 overflow-hidden"
          style={{
            border: `1px solid rgba(${A}, 0.42)`,
            backgroundColor: 'rgba(4,4,10,0.5)',
            backgroundImage:
              `radial-gradient(600px 150px at 50% -20%, rgba(${A},0.22) 0%, rgba(0,0,0,0) 66%),` +
              'linear-gradient(to bottom, rgba(255,255,255,0.07) 0%, rgba(0,0,0,0) 42%)',
            boxShadow:
              '0 0 0 1px rgba(255,255,255,0.05) inset, 0 1px 0 rgba(255,255,255,0.09) inset,' +
              `0 12px 30px rgba(0,0,0,0.5), 0 0 26px rgba(${A},0.10)`,
          }}
        >
          {!saving && <span aria-hidden className="wizard-key-shine" />}
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {continueLabel}
        </button>
      </div>
      )}
    </div>
  );
}
