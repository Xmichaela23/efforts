/**
 * Pure SVG/CSS chart primitives — retro-futuristic aesthetic.
 * No charting library; hand-rolled for weight and style control.
 */
import React from 'react';

// ---------------------------------------------------------------------------
// Sparkline — small inline trend line
// ---------------------------------------------------------------------------

export const Sparkline: React.FC<{
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  glowColor?: string;
  showDots?: boolean;
  className?: string;
}> = ({ data, width = 64, height = 20, color = '#34d399', glowColor, showDots = false, className = '' }) => {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const glow = glowColor || color;

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <filter id={`spark-glow-${color.replace('#', '')}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
        </filter>
      </defs>
      <path d={pathD} fill="none" stroke={glow} strokeWidth="2" opacity="0.3"
        filter={`url(#spark-glow-${color.replace('#', '')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {showDots && points.length <= 12 && points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 2 : 1.2}
          fill={i === points.length - 1 ? color : 'transparent'}
          stroke={color} strokeWidth="0.8" />
      ))}
    </svg>
  );
};


// ---------------------------------------------------------------------------
// StackedHBar — horizontal stacked bar with retro grid feel
// ---------------------------------------------------------------------------

export type BarSegment = {
  value: number;
  color: string;
  label?: string;
};

export const StackedHBar: React.FC<{
  segments: BarSegment[];
  height?: number;
  className?: string;
  showLabels?: boolean;
  maxValue?: number;
}> = ({ segments, height = 14, className = '', showLabels = false, maxValue }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const max = maxValue ?? total;
  if (max <= 0) return null;

  return (
    <div className={className}>
      <div
        className="w-full rounded-sm overflow-hidden border border-white/10"
        style={{ height, background: 'rgba(255,255,255,0.04)' }}
      >
        <div className="h-full flex">
          {segments.map((seg, i) => {
            const pct = (seg.value / max) * 100;
            if (pct <= 0) return null;
            return (
              <div
                key={i}
                style={{
                  width: `${pct}%`,
                  background: seg.color,
                  boxShadow: `inset 0 0 6px ${seg.color}40`,
                }}
                className="h-full transition-all duration-300"
                title={seg.label ? `${seg.label}: ${Math.round(seg.value)}` : `${Math.round(seg.value)}`}
              />
            );
          })}
        </div>
      </div>
      {showLabels && (
        <div className="flex items-center gap-3 mt-1">
          {segments.filter(s => s.value > 0).map((seg, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px]">
              <div className="w-2 h-2 rounded-[2px]" style={{ background: seg.color }} />
              <span style={{ color: seg.color }}>{seg.label || ''}</span>
              <span className="text-white/40">{Math.round(seg.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


// ---------------------------------------------------------------------------
// ProgressRing — circular progress indicator
// ---------------------------------------------------------------------------

export const ProgressRing: React.FC<{
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  glowColor?: string;
  children?: React.ReactNode;
  className?: string;
}> = ({ percent, size = 72, strokeWidth = 4, color = '#34d399', trackColor = 'rgba(255,255,255,0.08)', glowColor, children, className = '' }) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const center = size / 2;
  const glow = glowColor || color;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <filter id={`ring-glow-${color.replace('#', '')}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
          </filter>
        </defs>
        <circle cx={center} cy={center} r={radius}
          fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        {clamped > 0 && (
          <>
            <circle cx={center} cy={center} r={radius}
              fill="none" stroke={glow} strokeWidth={strokeWidth + 4} opacity="0.15"
              strokeDasharray={circumference} strokeDashoffset={offset}
              strokeLinecap="round"
              filter={`url(#ring-glow-${color.replace('#', '')})`}
            />
            <circle cx={center} cy={center} r={radius}
              fill="none" stroke={color} strokeWidth={strokeWidth}
              strokeDasharray={circumference} strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </>
        )}
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
};


// ---------------------------------------------------------------------------
// DeltaIndicator — colored directional arrow + label
// ---------------------------------------------------------------------------

export const DeltaIndicator: React.FC<{
  value: number | null;
  unit?: string;
  invertPositive?: boolean;
  size?: 'sm' | 'md';
}> = ({ value, unit = '', invertPositive = false, size = 'md' }) => {
  if (value == null) return <span className="text-white/30">—</span>;

  const isPositive = invertPositive ? value < 0 : value > 0;
  const isNegative = invertPositive ? value > 0 : value < 0;
  const isNeutral = value === 0;

  const color = isPositive ? 'text-emerald-400' : isNegative ? 'text-amber-400' : 'text-white/50';
  const arrow = isPositive ? '▲' : isNegative ? '▼' : '—';
  const label = isPositive ? 'improving' : isNegative ? 'declining' : 'stable';
  const sizeClass = size === 'sm' ? 'text-xs' : 'text-sm';
  const labelSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

  const sign = value > 0 ? '+' : '';

  return (
    <div className="text-right">
      <div className={`${sizeClass} ${color} flex items-center justify-end gap-1`}>
        <span className="text-[10px]">{arrow}</span>
        <span>{sign}{value}{unit}</span>
      </div>
      <div className={`${labelSize} ${color} opacity-70`}>{label}</div>
    </div>
  );
};


// ---------------------------------------------------------------------------
// TrainingStateBar — horizontal fatigue/recovery gauge
// ---------------------------------------------------------------------------

export const TrainingStateBar: React.FC<{
  acwr: number | null;
  className?: string;
}> = ({ acwr, className = '' }) => {
  if (acwr == null) return null;

  const clamped = Math.max(0.5, Math.min(2.0, acwr));
  const pct = ((clamped - 0.5) / 1.5) * 100;

  const zoneColor = acwr < 0.8 ? '#60a5fa' : acwr <= 1.3 ? '#34d399' : acwr <= 1.5 ? '#fbbf24' : '#f87171';
  const zoneLabel = acwr < 0.8 ? 'Under-reached' : acwr <= 1.3 ? 'Optimal' : acwr <= 1.5 ? 'Overreaching' : 'Danger';

  return (
    <div className={className}>
      <div className="relative h-2 rounded-full overflow-hidden border border-white/10"
        style={{ background: 'linear-gradient(90deg, #60a5fa33 0%, #34d39933 35%, #fbbf2433 65%, #f8717133 100%)' }}
      >
        <div className="absolute top-0 h-full w-1 rounded-full"
          style={{
            left: `calc(${pct}% - 2px)`,
            background: zoneColor,
            boxShadow: `0 0 6px ${zoneColor}, 0 0 12px ${zoneColor}60`,
          }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-white/30">
        <span>Under</span>
        <span>Optimal</span>
        <span>Over</span>
      </div>
    </div>
  );
};
