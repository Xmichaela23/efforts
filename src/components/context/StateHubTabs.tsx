// State-as-hub lens switcher (D-316). Three lenses on State: Status (look) / Adjust (what) /
// Schedule (when). Styled to match the app's existing segmented tabs (Planned/Performance/Details on
// the workout detail) — border-bottom row, active = white + underline, inactive = gray.
import { Activity, SlidersHorizontal, CalendarRange } from 'lucide-react';

export type StateLens = 'status' | 'adjust' | 'schedule';

const TABS: Array<{ key: StateLens; label: string; Icon: typeof Activity }> = [
  { key: 'status', label: 'Status', Icon: Activity },
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
    <div className="grid grid-cols-3 w-full bg-white/[0.04] backdrop-blur-md border-b border-white/10 mb-3 rounded-t-lg overflow-hidden">
      {TABS.map(({ key, label, Icon }) => {
        const active = value === key;
        return (
          <button
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
