import React from 'react';
import { fmtDate, fmtGoalClock, fmtSignedDeltaVsGoal, fmtSignedDeltaVsProjection, Dot } from './state-primitives';

/**
 * LAST RACE — extracted from StateTab 2026-09-01 (Round 0a). No behaviour change, JSX verbatim.
 * ⛔ The `showTopLastRaceCard` test stays in the caller: the plate uses `divide-y`, and the caller
 *    also needs `lastCompletedRace` narrowed to non-null before it can be passed in.
 */
export default function StateLastRaceCard({
  lastCompletedRace,
}: {
  lastCompletedRace: {
    name: string;
    target_date: string;
    actual_seconds: number;
    goal_target_seconds?: number | null;
    projected_seconds?: number | null;
  };
}) {
  return (
    <div className="px-3 py-2.5 border-b border-white/[0.055] space-y-1">
      <p className="text-[12px] font-semibold tracking-[0.12em] text-white/50 uppercase">Last race</p>
      <p className="text-[13px] text-white/80">
        <span className="text-white/60">{lastCompletedRace.name}</span>
        <span className="text-white/60"> · {fmtDate(lastCompletedRace.target_date)}</span>
      </p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-[20px] font-semibold tabular-nums text-white/90">
          {fmtGoalClock(lastCompletedRace.actual_seconds)}
        </span>
        <span className="text-[13px] text-white/65">actual (elapsed / chip)</span>
      </div>
      {lastCompletedRace.goal_target_seconds != null && (
        <p className="text-[13px] text-white/50">
          Goal {fmtGoalClock(lastCompletedRace.goal_target_seconds)}
          <Dot />
          <span
            className={
              lastCompletedRace.actual_seconds <= lastCompletedRace.goal_target_seconds
                ? 'text-emerald-400/90'
                : 'text-amber-400/85'
            }
          >
            {fmtSignedDeltaVsGoal(
              lastCompletedRace.actual_seconds,
              lastCompletedRace.goal_target_seconds,
            )}
          </span>
        </p>
      )}
      {lastCompletedRace.projected_seconds != null && (
        <p className="text-[13px] text-white/50">
          Projected {fmtGoalClock(lastCompletedRace.projected_seconds)}
          <Dot />
          <span
            className={
              lastCompletedRace.actual_seconds <= lastCompletedRace.projected_seconds
                ? 'text-emerald-400/90'
                : 'text-amber-400/85'
            }
          >
            {fmtSignedDeltaVsProjection(
              lastCompletedRace.actual_seconds,
              lastCompletedRace.projected_seconds,
            )}
          </span>
        </p>
      )}
    </div>
  );
}
