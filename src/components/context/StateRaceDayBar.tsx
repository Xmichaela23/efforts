import React from 'react';

/**
 * RACE DAY — extracted from StateTab 2026-09-01 (Round 0a). No behaviour change, JSX verbatim.
 * The `showAmberRecordBar` test stays in the caller (plate `divide-y`).
 */
export default function StateRaceDayBar() {
  return (
    <div className="px-3 py-2.5 border-b border-white/[0.055] space-y-1">
      <p className="text-[12px] font-semibold tracking-[0.12em] text-amber-300/80 uppercase">Race day</p>
      <p className="text-[13px] text-white/55 leading-snug">
        Logging your race as a completed run auto-saves the elapsed (chip) result to My Record and ends this plan.
      </p>
    </div>
  );
}
