// State-as-hub lens switcher (D-316). Four lenses on State: Status (look) / Adjust (what) /
// Schedule (when) / Record (what you have done — 2026-09-20, moved off the header menu). Styled to
// match the app's existing segmented tabs (Planned/Performance/Details on the workout detail) —
// border-bottom row, active = white + underline, inactive = gray.
import { ScanLine, SlidersHorizontal, CalendarRange, History } from 'lucide-react';

import type { StateLens } from '@/lib/state-lens';
export type { StateLens };

const TABS: Array<{ key: StateLens; label: string; Icon: typeof ScanLine }> = [
  // ScanLine: not Activity (the app's RUN mark), not Gauge (the Focus screen's plan-builder glyph). Michael, 2026-09-04.
  { key: 'status', label: 'Status', Icon: ScanLine },
  { key: 'adjust', label: 'Adjust', Icon: SlidersHorizontal },
  { key: 'schedule', label: 'Schedule', Icon: CalendarRange },
  // History: not Activity, not Gauge, and deliberately not a trophy, medal or star — this screen
  // carries no badges and no first-place marks (Michael, 2026-09-19), so its icon must not imply one.
  { key: 'record', label: 'Record', Icon: History },
];

export default function StateHubTabs({
  value,
  onChange,
}: {
  value: StateLens;
  onChange: (v: StateLens) => void;
}) {
  return (
    // ⛔ NOTHING CUT OFF AT 200% (WCAG 2.2 SC 1.4.4, 2026-09-18): equal columns while the words fit;
    // when a zoomed or large-text screen cannot hold them, the row wraps rather than clipping.
    //
    // ⚠️ FOUR TABS SINCE 2026-09-20. `min-w-fit` and `whitespace-nowrap` are what forbid the clip — a
    // label is never shortened — and `flex-wrap` is what lets the row become two. Do NOT add
    // `truncate`, a fixed `basis`, or `overflow-hidden` on the buttons to make four fit: each of those
    // buys a tidy row by cutting a word in half, which is the exact failure SC 1.4.4 names.
    //
    // ⛔ `px-1 gap-1`, NOT `px-2 gap-1.5`, AND THAT WAS MEASURED (2026-09-20). With the wider padding
    // the fourth tab did not fit a 320 px phone and wrapped alone onto a second row, stretched the
    // full width — three across, one dangling. Measured in the browser at 320 / 360 / 375 / 390 px and
    // at 100% and 200% text: the tighter padding gives four across at every phone width and a clean
    // 2 x 2 at 200%, with nothing clipped in any of the eight combinations. Widening it again brings
    // the dangling row back. A fifth tab would wrap, and that is fine — wrapping is the point.
    <div className="flex flex-wrap w-full bg-white/[0.04] backdrop-blur-md border-b border-white/10 mb-3 rounded-t-lg overflow-hidden">
      {TABS.map(({ key, label, Icon }) => {
        const active = value === key;
        return (
          <button
            data-first-run={key}
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-current={active}
            className={`flex-1 basis-0 min-w-fit whitespace-nowrap px-1 flex items-center justify-center gap-1 py-2 text-footnote font-medium tracking-wide transition-colors border-b-2 ${
              active
                ? 'text-label border-white/30'
                : 'text-label-secondary border-transparent hover:text-label'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
