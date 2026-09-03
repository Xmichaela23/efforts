/**
 * ⛔ RUN LOAD, AS A PICTURE (Michael 2026-09-02: "I see run 37 points — we need a graph, clearer, better
 * title"). Five weekly bars of points for one sport, this week last and in colour, with the athlete's usual
 * week as a dashed line — Strava's weekly Relative Effort bars against your range. Facts, no verdict. The
 * numbers come from `state_trends_v1.display.loadByDiscipline[sport]`; nothing is computed here.
 */
import React, { useState } from 'react';
import { getDisciplineColor } from '@/lib/context-utils';

const LOAD_EXPLAIN = 'Hours times intensity, on a scale where one hour at threshold is 100. Your rating sets the intensity when you gave one; otherwise heart rate against your threshold, or power against FTP. Your usual week is the average of your recent weeks.';

export function LoadWeeksCard({ sport, load }: { sport: 'run' | 'ride' | 'swim'; load?: { week: number | null; typical: number | null; weeks?: number[] } | null }) {
  const [open, setOpen] = useState(false);
  if (!load || (load.week == null && !(load.weeks ?? []).some((v) => v > 0))) return null;
  const weeks = (load.weeks ?? []).slice(-5);
  const typical = load.typical ?? null;
  const max = Math.max(1, ...weeks, typical ?? 0);
  const color = getDisciplineColor(sport);
  const noun = sport === 'run' ? 'run' : sport === 'ride' ? 'ride' : 'swim';
  const W = 300, H = 56, PAD = 4, gap = 8;
  const n = Math.max(weeks.length, 1);
  const bw = (W - PAD * 2 - gap * (n - 1)) / n;
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  return (
    <div className="px-3 py-3 border-t border-white/[0.055] first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        {/* 2026-09-03 (Michael: "too many confusing thingies"): ONE name for the number — Workload, the same word the
            Performance screen uses — and one label line. "run points" / "run load" are gone. */}
        <span className="text-[13px] text-white/80">{noun} workload</span>
        <span className="text-[11px] text-white/60 tabular-nums">{load.week != null ? `${load.week} this week` : 'none yet this week'}{typical != null ? ` · usual ${typical}` : ''}</span>
      </div>
      <div className="text-[11px] text-white/55 mt-0.5">
        {'what is workload'}{' '}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label="What is workload?" className="bg-transparent border-none p-0 cursor-pointer text-white/45">{open ? '▾' : 'ⓘ'}</button>
      </div>
      {open && <p className="mt-1 text-[12px] text-white/55 leading-snug max-w-[min(100%,340px)]">{LOAD_EXPLAIN}</p>}
      {weeks.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" style={{ height: H }} role="img" aria-label={`${noun} workload, last ${weeks.length} weeks`}>
          {typical != null && (
            <line x1={PAD} x2={W - PAD} y1={y(typical)} y2={y(typical)} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" strokeWidth={1} />
          )}
          {weeks.map((v, i) => {
            const x = PAD + i * (bw + gap);
            const isThis = i === weeks.length - 1;
            return <rect key={i} x={x} y={y(v)} width={bw} height={Math.max(0, H - PAD - y(v))} rx={2} fill={isThis ? color : 'rgba(255,255,255,0.22)'} />;
          })}
        </svg>
      )}
      <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
        <span>{weeks.length > 1 ? `${weeks.length - 1} weeks ago` : ''}</span>
        <span>this week</span>
      </div>
    </div>
  );
}

export default LoadWeeksCard;
