import React from 'react';
import { getDisciplineColor, hexToRgb } from '@/lib/context-utils';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoadBarData {
  acwr: number | null;
  wtd_actual_load: number | null;
  daily_load_7d: Array<{
    date: string;
    load: number;
    dominant_type: string;
    by_type?: Array<{ type: string; load: number }>;
  }>;
}

export interface LoadBarStatus {
  status: 'under' | 'on_target' | 'elevated' | 'high';
}

interface LoadBarProps {
  load: LoadBarData;
  loadStatus: LoadBarStatus | null;
  readinessState: string | null;
  weekIntent?: string | null;
  hideDailyBars?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function acwrLabel(v: number | null): string {
  if (v == null) return '—';
  if (v < 0.8) return 'build more';
  if (v <= 1.3) return 'balanced';
  if (v <= 1.5) return 'back off';
  return 'rest now';
}

function acwrToGaugePct(v: number): number {
  const min = 0.6;
  const max = 1.7;
  return Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
}

function loadStatusColor(status: string | undefined): string {
  if (!status) return 'text-white/45';
  if (status === 'on_target') return 'text-emerald-400/85';
  if (status === 'elevated') return 'text-amber-400/85';
  if (status === 'high') return 'text-red-400/85';
  if (status === 'under') return 'text-sky-400/85';
  return 'text-white/65';
}

function loadStatusLabel(status: string): string {
  if (status === 'on_target') return 'on track';
  if (status === 'elevated') return 'a bit high';
  if (status === 'high') return 'pull back';
  if (status === 'under') return 'build more';
  return status;
}

// ── AcwrGauge ────────────────────────────────────────────────────────────────

function AcwrGauge({ value, readinessState }: { value: number | null; readinessState: string | null }) {
  if (value == null) return <span className="text-white/55 text-[11px]">—</span>;
  const pos = acwrToGaugePct(value);
  const dotColor =
    readinessState === 'fresh'       ? '#34d399' :
    readinessState === 'adapting'    ? '#38bdf8' :
    readinessState === 'normal'      ? '#34d399' :
    readinessState === 'fatigued'    ? '#fbbf24' :
    readinessState === 'overreached' ? '#f87171' :
    readinessState === 'detrained'   ? '#38bdf8' :
    acwrLabel(value) === 'build more' ? '#38bdf8' :
    acwrLabel(value) === 'balanced'   ? '#34d399' :
    acwrLabel(value) === 'back off'   ? '#fbbf24' : '#f87171';
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex items-center w-24 h-1.5 rounded-full overflow-visible">
        <span className="absolute inset-0 flex rounded-full overflow-hidden">
          <span className="h-full bg-sky-400/25"     style={{ width: '18%' }} />
          <span className="h-full bg-emerald-400/30"  style={{ width: '55%' }} />
          <span className="h-full bg-amber-400/25"   style={{ width: '18%' }} />
          <span className="h-full bg-red-400/20"     style={{ width: '9%' }} />
        </span>
        <span
          className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 shadow-md"
          style={{ left: `${pos}%`, backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
        />
      </span>
    </span>
  );
}

// ── Dot separator ────────────────────────────────────────────────────────────

function Dot() {
  return <span className="text-white/30 select-none">·</span>;
}

// ── LoadBar ──────────────────────────────────────────────────────────────────

export default function LoadBar({ load, loadStatus, readinessState, weekIntent, hideDailyBars }: LoadBarProps) {
  const isTaperOrPeak = weekIntent === 'taper' || weekIntent === 'peak';
  const dailyLoad = load.daily_load_7d ?? [];
  const maxLoad = Math.max(...dailyLoad.map(d => d.load), 1);

  return (
    <div className="px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase">LOAD</span>
        <div className="flex items-center gap-2">
          <AcwrGauge value={load.acwr} readinessState={readinessState} />
          {loadStatus?.status && !(isTaperOrPeak && loadStatus.status === 'under') && (
            <><Dot /><span className={`text-[14px] font-semibold tracking-tight ${loadStatusColor(loadStatus.status)}`}>
              {loadStatusLabel(loadStatus.status)}
            </span></>
          )}
        </div>
      </div>
      {!hideDailyBars && dailyLoad.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-white/65 uppercase tracking-[0.08em]">Daily load — last 7 days</span>
            <span className="text-[10px] tabular-nums text-white/60">{Math.round(load.wtd_actual_load ?? 0)} pts WTD</span>
          </div>
          <div className="flex items-end h-10 gap-[3px]">
            {dailyLoad.map((d) => {
              const isToday = d.date === dailyLoad[dailyLoad.length - 1]?.date;
              const barPct = d.load > 0 ? Math.max(0.08, d.load / maxLoad) : 0;
              const segments = (d as any).by_type as Array<{ type: string; load: number }> | undefined;
              const alpha = isToday ? 0.92 : 0.7;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-[2px]">
                  {d.load === 0 ? (
                    <div className="rounded-[2px]" style={{ width: 8, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  ) : (
                    <div
                      className="flex flex-col-reverse rounded-[2px] overflow-hidden transition-all"
                      style={{ width: 8, height: `${Math.round(barPct * 100)}%`, minHeight: 4 }}
                    >
                      {(segments && segments.length > 0 ? segments : [{ type: d.dominant_type, load: d.load }]).map((seg, i) => {
                        const segPct = d.load > 0 ? (seg.load / d.load) * 100 : 0;
                        const hex = seg.type !== 'none' && seg.type !== 'other' ? getDisciplineColor(seg.type) : null;
                        const color = hex
                          ? `rgba(${hexToRgb(hex)}, ${alpha})`
                          : `rgba(255,255,255, ${isToday ? 0.55 : 0.25})`;
                        return <div key={`${seg.type}-${i}`} style={{ height: `${segPct}%`, minHeight: 1, backgroundColor: color }} />;
                      })}
                    </div>
                  )}
                  <span className={`text-[9px] tabular-nums leading-none ${isToday ? 'text-white/70' : 'text-white/40'}`}>
                    {new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
