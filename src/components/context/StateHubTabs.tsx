// State-as-hub lens switcher (D-316). Status (look) / Adjust (what) / Record (what you have done —
// 2026-09-20, moved off the header menu). Schedule (when) is HIDDEN, not deleted — see TABS. Styled
// to match the app's existing segmented tabs (Planned/Performance/Details on the workout detail) —
// border-bottom row, active = white + underline, inactive = gray.
import { ScanLine, SlidersHorizontal, CalendarRange, History } from 'lucide-react';

import type { StateLens } from '@/lib/state-lens';
export type { StateLens };

/**
 * ⛔ `hidden` MEANS "COMING BACK", NOT "DEAD" (2026-09-20, Michael: "hide schedule tab for now for
 * future build"). Schedule's row stays here, with its key, label and icon intact, and the lens it
 * points at is untouched in `StateTab` — so bringing it back is deleting one word, not rebuilding a
 * tab. ⚠️ DO NOT "tidy up" by deleting the entry, the lens, or `'schedule'` from `StateLens`: the
 * next session would have to re-derive all three from a commit message.
 */
const TABS: Array<{ key: StateLens; label: string; Icon: typeof ScanLine; hidden?: true }> = [
  // ScanLine: not Activity (the app's RUN mark), not Gauge (the Focus screen's plan-builder glyph). Michael, 2026-09-04.
  { key: 'status', label: 'Status', Icon: ScanLine },
  { key: 'adjust', label: 'Adjust', Icon: SlidersHorizontal },
  { key: 'schedule', label: 'Schedule', Icon: CalendarRange, hidden: true },
  // History: not Activity, not Gauge, and deliberately not a trophy, medal or star — this screen
  // carries no badges and no first-place marks (Michael, 2026-09-19), so its icon must not imply one.
  { key: 'record', label: 'Record', Icon: History },
];

const SHOWN = TABS.filter((t) => !t.hidden);

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
    // ⚠️ `min-w-fit` and `whitespace-nowrap` are what forbid the clip — a label is never shortened —
    // and `flex-wrap` is what lets the row become two. Do NOT add `truncate`, a fixed `basis`, or
    // `overflow-hidden` on the buttons to fit more in: each of those buys a tidy row by cutting a word
    // in half, which is the exact failure SC 1.4.4 names.
    //
    // ⛔ `px-1 gap-1`, NOT `px-2 gap-1.5`, AND BOTH ROW COUNTS WERE MEASURED (2026-09-20). With FOUR
    // tabs and the wider padding the fourth did not fit a 320 px phone: three across and one dangling
    // full-width on a second row. THREE tabs fit either way — but Schedule is hidden, not gone, so
    // widening this now would be sized for a row that is about to grow back by one. Measured in a
    // browser against the built CSS at 320 / 360 / 375 / 390 / 430 px and at 100% / 150% / 200% text,
    // comparing each button's scrollWidth to its clientWidth: at three, all across at every phone
    // width up to 150% and a clean 2 + 1 at 200%; at four, all across at 100% and 2 x 2 at 200%.
    // Nothing clipped in any combination, and no tap target under 24 px.
    <div className="flex flex-wrap w-full bg-white/[0.04] backdrop-blur-md border-b border-white/10 mb-3 rounded-t-lg overflow-hidden">
      {SHOWN.map(({ key, label, Icon }) => {
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
