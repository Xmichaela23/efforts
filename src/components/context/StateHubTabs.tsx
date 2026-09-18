// State-as-hub lens switcher (D-316). Three lenses on State: Status (look) / Adjust (what) /
// Schedule (when). Styled to match the app's existing segmented tabs (Planned/Performance/Details on
// the workout detail) — border-bottom row, active = white + underline, inactive = gray.
import { ScanLine, SlidersHorizontal, CalendarRange } from 'lucide-react';

import type { StateLens } from '@/lib/state-lens';
export type { StateLens };

const TABS: Array<{ key: StateLens; label: string; Icon: typeof ScanLine }> = [
  // ScanLine: not Activity (the app's RUN mark), not Gauge (the Focus screen's plan-builder glyph). Michael, 2026-09-04.
  { key: 'status', label: 'Status', Icon: ScanLine },
  { key: 'adjust', label: 'Adjust', Icon: SlidersHorizontal },
  { key: 'schedule', label: 'Schedule', Icon: CalendarRange },
];

export default function StateHubTabs({
  value,
  onChange,
}: {
  value: StateLens;
  onChange: (v: StateLens) => void;
}) {
  return (
    // ⛔ NOTHING CUT OFF AT 200% (WCAG 2.2 SC 1.4.4, 2026-09-18): three equal columns while the words fit;
    // when a zoomed or large-text screen cannot hold "Schedule" in a third, the row wraps rather than clipping.
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
            className={`flex-1 basis-0 min-w-fit whitespace-nowrap px-2 flex items-center justify-center gap-1.5 py-2 text-footnote font-medium tracking-wide transition-colors border-b-2 ${
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
