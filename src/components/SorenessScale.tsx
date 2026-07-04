/**
 * SorenessScale — a segmented 1–7 Hooper control (D-234/D-235).
 *
 * Segmented bar (NOT chips): seven equal full-width hit-zones so every tap target is ≥44px at Capacitor
 * viewport width, one-thumb reachable. Anchor labels under 1 / 4 / 7 only.
 *
 * NO DEFAULT, EVER: `value` starts null and nothing is highlighted; a tap selects, re-tapping the same
 * segment clears back to null. The parent writes soreness ONLY when value !== null (see readinessSorenessPatch),
 * so a skipped/dismissed control writes nothing.
 */
import { useId } from 'react';

interface SorenessScaleProps {
  value: number | null;
  onChange: (v: number | null) => void;
  /** "r,g,b" accent for the selected segment; defaults to a neutral grey. */
  colorRgb?: string;
  label?: string;
  min?: number;
  max?: number;
  anchors?: Record<number, string>;
}

export default function SorenessScale({
  value,
  onChange,
  colorRgb = '148,163,184',
  label = 'How sore are your muscles right now?',
  min = 1,
  max = 7,
  anchors = { 1: 'none', 4: 'moderate', 7: 'extremely sore' },
}: SorenessScaleProps) {
  const groupId = useId();
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div>
      {label && (
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-white/90" id={`${groupId}-label`}>{label}</label>
          <span className="text-lg text-white/90 tabular-nums w-5 text-right">{value ?? '–'}</span>
        </div>
      )}
      {/* Segmented bar — equal-width zones, no gaps swallowing tap area beyond a hairline */}
      <div role="radiogroup" aria-labelledby={`${groupId}-label`} className="flex w-full gap-[3px]">
        {steps.map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${n}${anchors[n] ? ` — ${anchors[n]}` : ''}`}
              onClick={() => onChange(selected ? null : n)}
              className="flex-1 min-h-[44px] rounded-md border text-sm text-white/90 tabular-nums transition-colors active:scale-[0.97]"
              style={{
                backgroundColor: selected ? `rgba(${colorRgb}, 0.28)` : 'rgba(255,255,255,0.06)',
                borderColor: selected ? `rgba(${colorRgb}, 0.65)` : 'rgba(255,255,255,0.12)',
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      {/* Anchor labels at 1 / 4 / 7 only */}
      <div className="flex justify-between mt-1 text-xs text-white/45">
        <span>{anchors[min] ?? ''}</span>
        <span>{anchors[Math.round((min + max) / 2)] ?? ''}</span>
        <span>{anchors[max] ?? ''}</span>
      </div>
    </div>
  );
}
