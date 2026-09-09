// Home's two tabs (work order 2026-09-09 §1): Today is the screen Home opens on; Week is the
// calendar that used to sit under it. Same strip as State's Status / Adjust / Schedule
// (`StateHubTabs`) — one segmented row, active = white + underline — so the two hubs read alike.
import { Sun, CalendarDays } from 'lucide-react';

export type HomeLens = 'today' | 'week';

const TABS: Array<{ key: HomeLens; label: string; Icon: typeof Sun }> = [
  { key: 'today', label: 'Today', Icon: Sun },
  // ⛔ THE FIRST-RUN SPOTLIGHT'S CALENDAR STOP LANDS HERE. The calendar is no longer on screen when
  // Home opens, so the stop that used to point at it points at the tab that opens it
  // (`FirstRunOverlay` HOME_STOPS). Its words are unchanged.
  { key: 'week', label: 'Week', Icon: CalendarDays },
];

export default function HomeTabs({
  value,
  onChange,
}: {
  value: HomeLens;
  onChange: (v: HomeLens) => void;
}) {
  return (
    <div className="grid grid-cols-2 w-full bg-white/[0.04] backdrop-blur-md border-b border-white/10 mb-3 rounded-t-lg overflow-hidden flex-shrink-0">
      {TABS.map(({ key, label, Icon }) => {
        const active = value === key;
        return (
          <button
            data-first-run={key === 'week' ? 'calendar' : undefined}
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-current={active}
            className={`flex items-center justify-center gap-1.5 py-2 text-[13px] font-light tracking-wide transition-colors border-b-2 ${
              active
                ? 'text-white border-white/30'
                : 'text-gray-400 border-transparent hover:text-gray-300'
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
