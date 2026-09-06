/**
 * SportStrip — the app's segmented control for a sport (2026-09-06). Same strip as Status / Adjust /
 * Schedule (`StateHubTabs`): one strip, four segments, icon + word, the chosen one lit in its sport
 * colour, the rest dim. Profile uses it as a filter; Adjust as a jump bar.
 */
import { Activity, Bike, Waves, Dumbbell } from 'lucide-react';
import { getDisciplineColor } from '@/lib/context-utils';

export type StripSport = 'run' | 'bike' | 'swim' | 'strength';

const SEGMENTS: Array<{ key: StripSport; label: string; Icon: typeof Activity }> = [
  { key: 'run', label: 'Run', Icon: Activity },
  { key: 'bike', label: 'Ride', Icon: Bike },
  { key: 'swim', label: 'Swim', Icon: Waves },
  { key: 'strength', label: 'Strength', Icon: Dumbbell },
];

export default function SportStrip({ value, onChange, sports, className = '' }: {
  value: StripSport | null;
  onChange: (v: StripSport) => void;
  /** Which segments to draw; default all four, in this order. */
  sports?: StripSport[];
  className?: string;
}) {
  const segs = sports ? SEGMENTS.filter((s) => sports.includes(s.key)) : SEGMENTS;
  return (
    <div className={`grid w-full bg-white/[0.04] backdrop-blur-md border-b border-white/10 rounded-t-lg overflow-hidden ${className}`} style={{ gridTemplateColumns: `repeat(${segs.length}, minmax(0, 1fr))` }} role="tablist">
      {segs.map(({ key, label, Icon }) => {
        const active = value === key;
        const colour = getDisciplineColor(key);
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`flex items-center justify-center gap-1.5 py-2 text-[13px] font-light tracking-wide transition-colors border-b-2 ${active ? '' : 'text-gray-400 border-transparent hover:text-gray-300'}`}
            style={active ? { color: colour, borderColor: `${colour}cc` } : undefined}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
