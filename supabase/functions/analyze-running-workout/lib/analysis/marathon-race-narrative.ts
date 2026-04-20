/**
 * Marathon goal-race copy: headline, split-based pacing, HR arc — avoids recovery-week training framing.
 */

import type { GoalRaceCompletionMatch } from '../../../_shared/goal-race-completion.ts';

type MileSplit = { mile: number; pace_s_per_mi: number; avg_hr_bpm?: number | null };

function fmtPace(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60);
  const s = Math.round(secPerMi % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
}

function fmtClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = Math.round(seconds % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function avgPaceForMiles(splits: MileSplit[], from: number, to: number): number | null {
  const slice = splits.filter((x) => x.mile >= from && x.mile <= to);
  if (slice.length === 0) return null;
  const sum = slice.reduce((a, b) => a + b.pace_s_per_mi, 0);
  return sum / slice.length;
}

function hrRangeForMiles(splits: MileSplit[], from: number, to: number): { min: number; max: number } | null {
  const hrs = splits
    .filter((x) => x.mile >= from && x.mile <= to)
    .map((x) => x.avg_hr_bpm)
    .filter((h): h is number => typeof h === 'number' && h > 40 && h < 220);
  if (hrs.length === 0) return null;
  return { min: Math.min(...hrs), max: Math.max(...hrs) };
}

/**
 * Build race headline + pacing/HR paragraphs from mile splits (when available).
 */
export function buildMarathonGoalRaceDigest(args: {
  match: GoalRaceCompletionMatch;
  mileTerrain: { splits?: MileSplit[]; total_miles?: number } | null | undefined;
  movingTimeSec: number | null;
  elapsedTimeSec: number | null;
  avgHr: number | null;
  maxHr: number | null;
  earlyHr: number | null;
  lateHr: number | null;
  driftBpm: number | null;
}): { headline: string; pacingInsight: string; hrInsight: string } {
  const name = args.match.eventName || 'your race';
  const mov = args.movingTimeSec != null && args.movingTimeSec > 120 ? fmtClock(args.movingTimeSec) : null;
  const el = args.elapsedTimeSec != null && args.elapsedTimeSec > 120 ? fmtClock(args.elapsedTimeSec) : null;
  const timePhrase =
    mov && el && Math.abs(elapsedMinusMovingSec(el, mov) ?? 0) > 60
      ? `${mov} moving${el !== mov ? ` (${el} elapsed)` : ''}`
      : mov || el
        ? `${mov || el}${mov && el && mov !== el ? ` moving` : ''}`
        : 'your finish';

  const headline = mov || el
    ? `You did it! ${mov || el} — Congratulations on finishing ${name}`
    : `Congratulations on finishing ${name}`;

  const splits: MileSplit[] = Array.isArray(args.mileTerrain?.splits) ? args.mileTerrain!.splits! : [];
  if (splits.length < 4) {
    return {
      headline,
      pacingInsight: '',
      hrInsight: buildHrArcDetailed(args, []),
    };
  }

  const sorted = [...splits].sort((a, b) => a.mile - b.mile);
  const first3 = avgPaceForMiles(sorted, 1, 3);
  const midStart = Math.min(4, Math.max(2, Math.floor(sorted.length * 0.15)));
  const midEnd = Math.max(midStart + 1, Math.floor(sorted.length * 0.6));

  const middlePace = avgPaceForMiles(sorted, midStart, midEnd);
  const firstHalfEnd = Math.floor(sorted.length / 2);
  const p1 = avgPaceForMiles(sorted, 1, firstHalfEnd);
  const p2 = avgPaceForMiles(sorted, firstHalfEnd + 1, sorted[sorted.length - 1]?.mile ?? sorted.length);

  let pacingParts: string[] = [];
  if (first3 != null) {
    pacingParts.push(`You started conservatively around ${fmtPace(first3)} for the first few miles.`);
  }
  if (middlePace != null && midEnd > midStart) {
    const hrMid = hrRangeForMiles(sorted, midStart, midEnd);
    const hrTxt = hrMid ? `HR ${hrMid.min}–${hrMid.max} bpm` : 'steady HR';
    pacingParts.push(
      `Miles ${midStart}–${midEnd} held a steady band near ${fmtPace(middlePace)} with ${hrTxt} — consistent aerobic work.`,
    );
  }
  if (p1 != null && p2 != null && p2 < p1 - 3) {
    pacingParts.push(
      `You negative split the second half (avg ~${fmtPace(p2)} vs ~${fmtPace(p1)} in the first) — controlled acceleration, not a late unravel.`,
    );
  } else if (p1 != null && p2 != null) {
    pacingParts.push(`Second-half average ~${fmtPace(p2)} vs first-half ~${fmtPace(p1)}.`);
  }

  const fastest = sorted.reduce(
    (best, cur) => (cur.pace_s_per_mi < best.pace_s_per_mi ? cur : best),
    sorted[0],
  );
  if (fastest) {
    pacingParts.push(`Fastest complete mile: Mile ${fastest.mile} at ${fmtPace(fastest.pace_s_per_mi)}.`);
  }

  const pacingInsight = pacingParts.join(' ');

  const hrInsight = buildHrArcDetailed(args, sorted);

  return { headline, pacingInsight, hrInsight };
}

function elapsedMinusMovingSec(elClock: string, movClock: string): number | null {
  const pe = parseClock(elClock);
  const pm = parseClock(movClock);
  if (pe == null || pm == null) return null;
  return pe - pm;
}

function parseClock(c: string): number | null {
  const p = String(c).trim().split(':').map((x) => Number(x));
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return null;
  return p[0] * 3600 + p[1] * 60 + p[2];
}

function buildHrArcDetailed(
  args: {
    earlyHr: number | null;
    lateHr: number | null;
    driftBpm: number | null;
    avgHr: number | null;
    maxHr: number | null;
  },
  sorted: MileSplit[],
): string {
  const e = args.earlyHr != null ? Math.round(args.earlyHr) : null;
  const l = args.lateHr != null ? Math.round(args.lateHr) : null;
  const d = args.driftBpm != null ? Math.round(args.driftBpm) : null;
  const a = args.avgHr != null ? Math.round(args.avgHr) : null;
  const x = args.maxHr != null ? Math.round(args.maxHr) : null;
  const m1 = sorted.find((s) => s.mile === 1);
  const m26 = sorted.filter((s) => s.mile >= 25).pop();
  const hr1 = m1?.avg_hr_bpm != null ? Math.round(m1.avg_hr_bpm) : null;
  const hrLast = m26?.avg_hr_bpm != null ? Math.round(m26.avg_hr_bpm) : null;

  const lead =
    hr1 != null && hrLast != null
      ? `HR from ~${hr1} bpm at mile 1 toward ~${hrLast} bpm in the final miles`
      : e != null && l != null
        ? `HR from ~${e} bpm early to ~${l} bpm late`
        : 'HR rose across the marathon';

  const driftClause =
    d != null
      ? ` — about +${d} bpm drift, an honest aerobic decoupling arc for 26.2, not a blow-up pattern`
      : '';

  const tail = [a != null ? `Avg ${a} bpm` : null, x != null ? `max ${x} bpm` : null].filter(Boolean).join(', ');
  return `${lead}${driftClause}. ${tail ? `${tail}.` : ''}`.trim();
}

export interface MarathonAdherenceSummary {
  verdict: string;
  technical_insights: { label: string; value: string }[];
  plan_impact: { focus: string; outlook: string };
}

export function buildMarathonGoalRaceAdherenceSummary(args: {
  match: GoalRaceCompletionMatch;
  granularAnalysis: any;
  detailedAnalysis: any;
  workout: { moving_time?: number | null; duration?: number | null; elapsed_time?: number | null };
}): MarathonAdherenceSummary {
  const { match, granularAnalysis, detailedAnalysis, workout } = args;
  const hr = granularAnalysis?.heart_rate_analysis;
  const drift = hr?.hr_drift_bpm != null ? Number(hr.hr_drift_bpm) : null;
  const early = hr?.early_avg_hr != null ? Number(hr.early_avg_hr) : null;
  const late = hr?.late_avg_hr != null ? Number(hr.late_avg_hr) : null;
  const avgHr =
    hr?.average_heart_rate != null
      ? Number(hr.average_heart_rate)
      : granularAnalysis?.heart_rate_analysis?.average_heart_rate != null
        ? Number(granularAnalysis.heart_rate_analysis.average_heart_rate)
        : null;
  const maxHr =
    hr?.max_heart_rate != null
      ? Number(hr.max_heart_rate)
      : hr?.summary?.maxHr != null
        ? Number(hr.summary.maxHr)
        : null;

  const movSec = resolveMovingSeconds(workout, granularAnalysis);
  const elSec = resolveElapsedSeconds(workout, movSec);

  const mileTerrain = detailedAnalysis?.mile_by_mile_terrain;
  const digest = buildMarathonGoalRaceDigest({
    match,
    mileTerrain,
    movingTimeSec: movSec,
    elapsedTimeSec: elSec,
    avgHr: Number.isFinite(avgHr as number) ? (avgHr as number) : null,
    maxHr: Number.isFinite(maxHr as number) ? (maxHr as number) : null,
    earlyHr: Number.isFinite(early as number) ? (early as number) : null,
    lateHr: Number.isFinite(late as number) ? (late as number) : null,
    driftBpm: drift != null && Number.isFinite(drift) ? drift : null,
  });

  const rich = typeof hr?.hr_drift_interpretation === 'string' ? hr.hr_drift_interpretation.trim() : '';
  const summaryLabel = typeof hr?.summary_label === 'string' && hr.summary_label.trim()
    ? String(hr.summary_label).trim()
    : 'Heart rate';

  const technical_insights: { label: string; value: string }[] = [{ label: 'Race day', value: digest.headline }];
  if (digest.pacingInsight.trim().length > 0) {
    technical_insights.push({ label: 'Pacing', value: digest.pacingInsight.trim() });
  }
  if (rich.length > 0) {
    technical_insights.push({ label: summaryLabel, value: rich });
  }

  return {
    verdict: digest.headline,
    technical_insights,
    plan_impact: {
      focus: 'Race result',
      outlook:
        'This session is treated as your goal race — not a plan adherence check. Training targets do not apply the same way on race day.',
    },
  };
}

function resolveMovingSeconds(workout: any, granular: any): number | null {
  const o = granular?.computed?.overall ?? workout?.computed?.overall;
  const dsm = Number(o?.duration_s_moving);
  if (Number.isFinite(dsm) && dsm > 60) return Math.round(dsm);
  const mv = Number(workout?.moving_time);
  if (Number.isFinite(mv) && mv > 0) return mv < 1000 ? Math.round(mv * 60) : Math.round(mv);
  return null;
}

function resolveElapsedSeconds(workout: any, movSec: number | null): number | null {
  const el = Number(workout?.elapsed_time);
  if (Number.isFinite(el) && el > 0) {
    const sec = el < 1000 ? Math.round(el * 60) : Math.round(el);
    return sec;
  }
  return movSec;
}
