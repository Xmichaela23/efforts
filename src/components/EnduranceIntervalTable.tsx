import React, { useMemo, useState } from 'react';
import {
  type SessionInterpretationV1,
  fmtTime,
  fmtPace,
  accumulate,
  completedValueForStep,
} from '@/utils/performance-format';

type EnduranceIntervalTableProps = {
  planned: any | null;
  completedSrc: any;
  sessionDetail: {
    execution?: { execution_score?: number | null; pace_adherence?: number | null; power_adherence?: number | null; duration_adherence?: number | null; performance_assessment?: string | null; assessed_against?: string | null; status_label?: string | null };
    observations?: string[];
    narrative_text?: string | null;
    intervals?: Array<{ id: string; interval_type: string; planned_label: string; planned_duration_s: number | null; executed: { duration_s: number | null; distance_m: number | null; avg_hr: number | null; actual_pace_sec_per_mi?: number | null }; pace_adherence_pct?: number | null; duration_adherence_pct?: number | null }>;
    display?: { show_adherence_chips?: boolean; interval_display_reason?: string | null; has_measured_execution?: boolean };
    plan_context?: { planned_id?: string | null; planned?: unknown | null; match?: { summary?: string } | null };
    session_interpretation?: SessionInterpretationV1;
  } | null;
  hasSessionDetail: boolean;
  type: string;
  isPoolSwim: boolean;
  isRidePlanned: boolean;
  useImperial: boolean;
  noPlannedCompare: boolean;
  serverPlannedLight: any[];
  hasServerPlanned: boolean;
  onNavigateToContext?: (workoutId: string) => void;
};

export default function EnduranceIntervalTable({
  planned,
  completedSrc,
  sessionDetail,
  hasSessionDetail,
  type,
  isPoolSwim,
  isRidePlanned,
  useImperial,
  noPlannedCompare,
  serverPlannedLight,
  hasServerPlanned,
  onNavigateToContext,
}: EnduranceIntervalTableProps) {
  const sd = sessionDetail;
  const [showFullIntervalBreakdown, setShowFullIntervalBreakdown] = useState(false);

  const tokens: string[] = Array.isArray((planned as any)?.steps_preset) ? ((planned as any).steps_preset as any[]).map((t:any)=>String(t)) : [];
  const tokensJoined = tokens.join(' ').toLowerCase();
  const defaultDurations = (() => {
    const pickMin = (re: RegExp): number | null => {
      const m = tokensJoined.match(re); if (!m) return null; const a = parseInt(m[1]||m[2]||m[3]||'0',10); const b = m[4]?parseInt(m[4],10):a; const avg = Math.round((a+b)/2); return avg>0?avg: null;
    };
    const pickSec = (re: RegExp): number | null => { const m = tokensJoined.match(re); if (!m) return null; const v = parseInt(m[1],10); return v>0?v:null; };
    const warmMin = pickMin(/warmup[^\d]*?(\d{1,3})\s*min/i);
    const coolMin = pickMin(/cooldown[^\d]*?(\d{1,3})\s*min/i);
    const restMin = pickMin(/(?:^|_|\b)r\s*(\d{1,3})\s*min|r(\d{1,3})-?(\d{1,3})?\s*min/i);
    const restSec = pickSec(/(?:^|_|\b)r\s*(\d{1,4})\s*s\b/i);
    const restBareSecMatch = tokensJoined.match(/(?:^|_|\b)r\s*(\d{1,4})(?![a-z])/i);
    const restBareSec = restBareSecMatch ? parseInt(restBareSecMatch[1],10) : null;
    const rest = restSec != null ? restSec : (restBareSec!=null && restBareSec>0 ? restBareSec : (restMin!=null ? restMin*60 : null));
    return {
      warmup_s: warmMin!=null ? warmMin*60 : null,
      cooldown_s: coolMin!=null ? coolMin*60 : null,
      rest_s: rest
    };
  })();

  const fallbackWorkMeters: number | null = (() => {
    try {
      let m = tokensJoined.match(/(\d+)x(\d+(?:\.\d+)?)(mi|mile|miles|km|kilometer|kilometre|m|meter|metre|yd|yard|yards)/i);
      if (!m) m = tokensJoined.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)(mi|mile|miles|km|kilometer|kilometre|m|meter|metre|yd|yard|yards)/i);
      if (!m) m = tokensJoined.match(/x\s*(\d+(?:\.\d+)?)(mi|mile|miles|km|kilometer|kilometre|m|meter|metre|yd|yard|yards)/i);
      if (m) {
        const val = parseFloat(m[2]);
        const unit = m[3].toLowerCase();
        if (unit.startsWith('mi')) return val * 1609.34;
        if (unit.startsWith('km')) return val * 1000;
        if (unit === 'm' || unit.startsWith('met')) return val;
        if (unit.startsWith('yd')) return val * 0.9144;
      }
    } catch {}
    return null;
  })();

  // Sport type detection for display formatting
  const sportType = String((completedSrc?.type || planned?.type || '')).toLowerCase();
  const isRideSport = /ride|bike|cycling/.test(sportType);
  const isSwimSport = /swim/.test(sportType);

  // Endurance (run/ride/swim)
  // Read intervals from computed.intervals (single source of truth)
  // These intervals include both executed data AND granular_metrics from analyze-{discipline}-workout
  const sessionState: any = (completedSrc as any)?.workout_analysis?.session_state_v1 ?? null;
  const intervalDisplay: any = sessionState?.details?.interval_display ?? null;
  const intervalDisplayMode: string | null = typeof intervalDisplay?.mode === 'string' ? intervalDisplay.mode : null;
  const intervalDisplayReason: string | null = typeof intervalDisplay?.reason === 'string' ? intervalDisplay.reason : null;
  const sessionIntervalRows: any[] = Array.isArray(sessionState?.details?.interval_rows)
    ? sessionState.details.interval_rows
    : [];
  const hasCanonicalIntervalRows = !!planned && sessionIntervalRows.length > 0;
  const isStructuredIntervalSession = (() => {
    if (intervalDisplayMode === 'interval_compare_ready') return true;
    if (intervalDisplayMode === 'overall_only') return false;
    if (intervalDisplayMode === 'awaiting_recompute') return true;
    if (!intervalDisplayMode) return false;
    const pSteps: any[] = Array.isArray((planned as any)?.computed?.steps) ? (planned as any).computed.steps : [];
    const workSteps = pSteps.filter((s: any) => s?.kind === 'work' || s?.type === 'work' || s?.kind === 'interval');
    return workSteps.length >= 2;
  })();
  const waitingForCanonicalRows = !!planned && isStructuredIntervalSession && intervalDisplayMode === 'awaiting_recompute';
  const completedComputed = (completedSrc as any)?.computed;
  const overallForDisplay = (completedSrc as any)?.computed?.overall ?? {};
  const computedIntervals: any[] = Array.isArray(completedComputed?.intervals) 
    ? completedComputed.intervals 
    : [];
  const hasServerComputed = computedIntervals.length > 0;
  // Prefer full planned steps (same source as Planned tab) for labels; use server "light" only for alignment
  const plannedStepsFull: any[] = Array.isArray((planned as any)?.computed?.steps)
    ? ((planned as any).computed.steps as any[]).map((s:any, idx:number)=> ({ planned_index: (s as any)?.planned_index ?? idx, ...s }))
    : [];
  const plannedStepsLight: any[] = hasServerPlanned
    ? serverPlannedLight.map((s:any)=> ({ id: s.planned_step_id || undefined, planned_index: s.planned_index, distanceMeters: s.meters, duration: s.seconds }))
    : [];
  // Derive compact pace-only rows from the same source the Planned tab renders
  // For unplanned runs: use interval_breakdown from workout_analysis (one row = analysis)
  const intervalBreakdownForUnplanned = (completedSrc as any)?.workout_analysis?.detailed_analysis?.interval_breakdown;
  const isAutoLapOrSplit = !!(intervalBreakdownForUnplanned?.is_auto_lap_or_split);
  const unplannedIntervals = intervalBreakdownForUnplanned?.available && Array.isArray(intervalBreakdownForUnplanned?.intervals)
    ? intervalBreakdownForUnplanned.intervals
    : [];
  // Don't show step breakdown for auto-lap/split (device laps or 1km splits) - not intentional workout structure
  const useUnplannedSteps = !planned && unplannedIntervals.length > 0 && !isAutoLapOrSplit;
  const planLinkNote = !planned ? 'No plan session linked.' : null;
  const leftColHeader = planned ? 'Planned' : 'Segments';
  // Prefer server-provided steps (smart server, dumb client)
  const stepsFromUnplanned = useUnplannedSteps
    ? (Array.isArray(intervalBreakdownForUnplanned?.steps) ? intervalBreakdownForUnplanned.steps : unplannedIntervals.map((iv: any, idx: number) => ({
        id: iv.interval_id || 'unplanned_interval',
        kind: iv.interval_type || 'work',
        type: iv.interval_type || 'work',
        planned_index: idx,
        seconds: iv.planned_duration_s || iv.actual_duration_s,
        duration_s: iv.actual_duration_s,
        distanceMeters: iv.actual_distance_m,
        pace_range: (iv.planned_pace_range_lower != null && iv.planned_pace_range_upper != null)
          ? { lower: iv.planned_pace_range_lower, upper: iv.planned_pace_range_upper }
          : undefined,
      })))
    : [];
  const stepsFromSessionRows: any[] = hasCanonicalIntervalRows
    ? sessionIntervalRows.map((r: any, idx: number) => ({
        id: r?.planned_step_id || r?.row_id || `row_${idx}`,
        kind: r?.kind || 'work',
        type: r?.kind || 'work',
        planned_index: Number.isFinite(Number(r?.planned_index)) ? Number(r.planned_index) : idx,
      }))
    : [];
  const steps: any[] = (
    hasCanonicalIntervalRows
      ? stepsFromSessionRows
      : plannedStepsFull.length > 0
        ? plannedStepsFull
        : plannedStepsLight.length > 0
          ? plannedStepsLight
          : stepsFromUnplanned
  );
  if (!steps.length) {
    steps.push({ kind: 'steady', id: 'overall', planned_index: 0, seconds: (planned as any)?.computed?.total_duration_seconds || undefined });
  }

  // Prefer server-provided computed_detail_steps (smart server, dumb client)
  const computedDetailSteps = useMemo(() => {
    const serverSteps = (completedSrc as any)?.computed_detail_steps;
    if (Array.isArray(serverSteps) && serverSteps.length > 0) return serverSteps;
    if (!hasServerComputed) return [] as any[];
    const list = Array.isArray(computedIntervals) ? computedIntervals : [];
    return list
      .filter((it) => it && (it.executed || it.duration_s || it.distance_m))
      .map((it: any, idx: number) => {
        const exec = it.executed || it;
        const distM = Number(exec?.distance_m ?? exec?.distanceMeters ?? exec?.distance_meters);
        const durS = Number(exec?.duration_s ?? exec?.durationS ?? it?.duration_s);
        return {
          id: String(it?.planned_step_id || it?.id || `exec_${idx}`),
          kind: String(it?.role || it?.kind || it?.interval_type || it?.type || 'segment'),
          label: String(it?.label || it?.name || it?.role || it?.kind || `Segment ${idx + 1}`),
          planned_index: Number.isFinite(Number(it?.planned_index)) ? Number(it.planned_index) : idx,
          seconds: Number.isFinite(durS) ? durS : undefined,
          duration_s: Number.isFinite(durS) ? durS : undefined,
          distanceMeters: Number.isFinite(distM) ? distM : undefined,
          pace_range: it?.pace_range || it?.planned?.pace_range || it?.paceRange || null,
        };
      });
  }, [hasServerComputed, computedIntervals, (completedSrc as any)?.computed_detail_steps]);

  const planLooksSingleSteady = plannedStepsFull.length <= 1 && plannedStepsLight.length <= 1;
  // If executed mapping isn't ready, collapse to a single row to avoid showing planned-only dashes
  const stepsDisplayBase = useMemo(() => ((hasCanonicalIntervalRows || hasServerComputed) ? steps : [steps[0]]), [hasCanonicalIntervalRows, hasServerComputed, steps]);

  // Collapse micro-steps (e.g. 4×100m strides) for easy/recovery runs so the table doesn't become noise.
  const stepsDisplay = useMemo(() => {
    // "Show details": for single-steady planned workouts, show executed segments from computed.intervals (strides, etc.)
    if (!hasCanonicalIntervalRows && showFullIntervalBreakdown && planLooksSingleSteady && computedDetailSteps.length > 1) {
      return computedDetailSteps;
    }
    if (showFullIntervalBreakdown) return stepsDisplayBase;
    const fpRaw = completedSrc?.workout_analysis?.fact_packet_v1;
    const fp = (() => {
      try { return typeof fpRaw === 'string' ? JSON.parse(fpRaw) : fpRaw; } catch { return fpRaw; }
    })();
    const workoutType = String(fp?.facts?.workout_type || '').toLowerCase();
    const weekIntent = String(fp?.facts?.plan?.week_intent || '').toLowerCase();
    const isRecoveryWeek = fp?.facts?.plan?.is_recovery_week === true;
    const easyLike =
      weekIntent === 'recovery' ||
      isRecoveryWeek ||
      workoutType.includes('recovery') ||
      workoutType === 'easy' ||
      workoutType === 'easy_run' ||
      workoutType === 'long_run' ||
      workoutType === 'steady_state' ||
      workoutType === 'run';

    // Some plans/materializations represent steady long runs as many identical ~1km "work" steps.
    // That renders as a misleading interval table ("Work · 7 min" rows). Detect and collapse to a single overall row.
    const looksLikeAutoSplitSteady = (() => {
      try {
        if (!plannedStepsFull || plannedStepsFull.length < 8) return false;
        const kinds = plannedStepsFull.map((s: any) => String(s?.kind || s?.type || '').toLowerCase());
        const allWorkish = kinds.every((k: string) => k === 'work' || k === 'interval' || k === 'steady' || k === '');
        if (!allWorkish) return false;

        const dm = plannedStepsFull
          .map((s: any) => Number(s?.distanceMeters ?? s?.distance_m ?? s?.m ?? 0))
          .filter((n: number) => Number.isFinite(n) && n > 0);
        if (dm.length < Math.floor(plannedStepsFull.length * 0.7)) return false;
        const nearKm = dm.filter((m: number) => m >= 900 && m <= 1100);
        if (nearKm.length < Math.floor(dm.length * 0.7)) return false;

        const pr = plannedStepsFull
          .map((s: any) => (s as any)?.pace_range)
          .filter((x: any) => x && typeof x === 'object' && Number.isFinite(Number(x.lower)) && Number.isFinite(Number(x.upper)))
          .map((x: any) => `${Math.round(Number(x.lower))}-${Math.round(Number(x.upper))}`);
        const uniq = Array.from(new Set(pr));
        if (uniq.length > 1) return false;

        return true;
      } catch { return false; }
    })();

    if (looksLikeAutoSplitSteady && easyLike && !showFullIntervalBreakdown) {
      const totalS = (() => {
        const v = Number((planned as any)?.computed?.total_duration_seconds);
        if (Number.isFinite(v) && v > 0) return Math.round(v);
        // Fallback: sum step seconds if present
        const sum = plannedStepsFull.reduce((acc: number, s: any) => {
          const sec = Number(s?.seconds ?? s?.duration ?? s?.duration_s ?? 0);
          return (Number.isFinite(sec) && sec > 0) ? acc + Math.round(sec) : acc;
        }, 0);
        return sum > 0 ? sum : null;
      })();
      const pr0 = (plannedStepsFull[0] as any)?.pace_range ?? null;
      return [{
        id: 'overall',
        kind: 'overall',
        type: 'overall',
        planned_index: 0,
        seconds: totalS ?? undefined,
        pace_range: pr0 || undefined,
      }];
    }

    if (!easyLike) return stepsDisplayBase;
    if (!Array.isArray(stepsDisplayBase) || stepsDisplayBase.length <= 2) return stepsDisplayBase;

    const stepMi = (st: any): number | null => {
      const m = Number(st?.distanceMeters);
      if (Number.isFinite(m) && m > 0) return m / 1609.34;
      return null;
    };
    const stepS = (st: any): number | null => {
      const s = Number(st?.seconds ?? st?.duration_s ?? st?.duration);
      return Number.isFinite(s) && s > 0 ? s : null;
    };

    const MICRO_MI = 0.25;
    const MICRO_S = 120;
    const BIG_MI = 2.0;
    const BIG_S = 900; // 15 min

    const scored = stepsDisplayBase.map((st: any) => {
      const mi = stepMi(st);
      const s = stepS(st);
      const micro = (mi != null && mi > 0 && mi < MICRO_MI) || (s != null && s > 0 && s < MICRO_S);
      const big = (mi != null && mi >= BIG_MI) || (s != null && s >= BIG_S);
      const size = (mi != null ? mi : (s != null ? s / 60 : 0));
      return { st, mi, s, micro, big, size };
    });

    const bigSteps = scored.filter((x) => x.big).map((x) => x.st);
    const nonBig = scored.filter((x) => !x.big);
    const allNonBigAreMicro = nonBig.length > 0 && nonBig.every((x) => x.micro);

    // If we have a dominant easy segment and the rest are micro-steps, show only the dominant segment.
    if (bigSteps.length >= 1 && allNonBigAreMicro) {
      // Pick the largest big step to represent the session.
      const best = scored
        .filter((x) => x.big)
        .sort((a, b) => (b.size - a.size))[0]?.st;
      return best ? [best] : stepsDisplayBase;
    }
    return stepsDisplayBase;
  }, [stepsDisplayBase, completedSrc, showFullIntervalBreakdown, computedDetailSteps, planLooksSingleSteady, hasCanonicalIntervalRows]);

  // Build accumulated rows once for completed and advance a cursor across steps
  const rows = completedSrc ? accumulate(completedSrc) : [];
  // Warm-up normalization: skip tiny initial sample blips (< 5s or < 10m)
  let cursorIdx = 0;
  let cursorCum = rows.length ? rows[0].cumMeters || 0 : 0;
  while (cursorIdx + 1 < rows.length) {
    const dt = (rows[cursorIdx+1].t - rows[cursorIdx].t);
    const dd = (rows[cursorIdx+1].cumMeters - rows[cursorIdx].cumMeters);
    if (dt > 5 || dd > 10) break; // start once movement is real
    cursorIdx += 1;
    cursorCum = rows[cursorIdx].cumMeters || cursorCum;
  }

  // No animation: render values immediately on association

  // Planned pace extractor - use server-processed data only
  const plannedPaceFor = (st: any): string => {
    try {
      // Rides: prefer power targets if present
      if (isRideSport) {
        const pr = (st as any)?.power_range;
        const pw = Number((st as any)?.power_target_watts);
        if (pr && typeof pr.lower === 'number' && typeof pr.upper === 'number' && pr.lower>0 && pr.upper>0) {
          return `${pr.lower}–${pr.upper}W`;
        }
        if (Number.isFinite(pw) && pw>0) return `${Math.round(pw)}W`;
      }
      
      // Priority 1: Use server-processed pace_range object
      const prng = (st as any)?.pace_range || (st as any)?.paceRange;
      if (prng && typeof prng === 'object' && prng.lower && prng.upper) {
        const formatPace = (sec: number) => {
          const mins = Math.floor(sec / 60);
          const secs = Math.round(sec % 60);
          return `${mins}:${secs.toString().padStart(2, '0')}`;
        };
        return `${formatPace(prng.lower)}–${formatPace(prng.upper)}/mi`;
      }
      
      // Priority 2: Use server-processed pace_range array
      if (Array.isArray(prng) && prng.length === 2 && prng[0] && prng[1]) {
        return `${prng[0]}–${prng[1]}`;
      }
      
      // Priority 3: Single pace target (no client-side calculation)
      const direct = st.paceTarget || st.target_pace || st.pace;
      if (direct && String(direct).includes('/')) return String(direct);
      
      // Priority 4: pace_sec_per_mi
      const p = Number(st.pace_sec_per_mi);
      if (Number.isFinite(p) && p > 0) {
        const m = Math.floor(p / 60);
        const s = Math.round(p % 60);
        return `${m}:${String(s).padStart(2,'0')}/mi`;
      }
      
      // No client-side calculations - server handles all pace processing
    } catch {}
    return '—';
  };

  // Planned label for rides (power) and runs (pace) with no fallbacks
  const plannedLabelStrict = (st:any): string => {
    // No labels like Warm-up/Cool-down; show a single target metric only
    if (isRideSport) {
      // Accept both snake_case and camelCase shapes
      const pr = (st as any)?.power_range || (st as any)?.powerRange || (st as any)?.power?.range;
      const prLower = Number(pr?.lower);
      const prUpper = Number(pr?.upper);
      if (Number.isFinite(prLower) && prLower>0 && Number.isFinite(prUpper) && prUpper>0) {
        return `${Math.round(prLower)}–${Math.round(prUpper)} W`;
      }
      const pw = Number((st as any)?.power_target_watts ?? (st as any)?.powerTargetWatts ?? (st as any)?.target_watts ?? (st as any)?.watts);
      if (Number.isFinite(pw) && pw>0) return `${Math.round(pw)} W`;
      // Fallback: show distance or time when no explicit power target provided
      const meters = Number((st as any)?.distanceMeters ?? (st as any)?.distance_m ?? (st as any)?.m ?? (st as any)?.meters);
      if (Number.isFinite(meters) && meters>0) return `${Math.round(meters)} m`;
      const sec = [ (st as any)?.seconds, (st as any)?.duration, (st as any)?.duration_sec, (st as any)?.durationSeconds, (st as any)?.time_sec, (st as any)?.timeSeconds ]
        .map((v:any)=>Number(v)).find((n:number)=>Number.isFinite(n) && n>0) as number | undefined;
      if (Number.isFinite(sec) && (sec as number)>0) return fmtTime(sec as number);
      return '—';
    }
    // run/walk → show "duration @ pace" when possible
    let paceText: string | null = null;
    
    // Priority 1: Use server-processed pace_range object
    const prng = (st as any)?.pace_range || (st as any)?.paceRange;
    if (prng && typeof prng === 'object' && prng.lower && prng.upper) {
      const formatPace = (sec: number) => {
        const mins = Math.floor(sec / 60);
        const secs = Math.round(sec % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      };
      paceText = `${formatPace(prng.lower)}–${formatPace(prng.upper)}/mi`;
    }
    // Priority 2: Use server-processed pace_range array
    else if (Array.isArray(prng) && prng.length === 2 && prng[0] && prng[1]) {
      paceText = `${prng[0]}–${prng[1]}`;
    }
    // Priority 3: Single pace target
    else {
      const directTxt = (st as any)?.paceTarget || (st as any)?.target_pace || (st as any)?.pace;
      if (typeof directTxt === 'string' && /\d+:\d{2}\s*\/(mi|km)/i.test(directTxt)) {
        paceText = String(directTxt).trim();
      }
      // Priority 4: pace_sec_per_mi
      else {
        const p = Number((st as any)?.pace_sec_per_mi);
        if (Number.isFinite(p) && p>0) paceText = fmtPace(p);
      }
    }
    
    // No client-side calculations - server handles all pace processing
    // Planned duration
    let plannedSec: number | null = null;
    try {
      const sec = [ (st as any)?.seconds, (st as any)?.duration, (st as any)?.duration_sec, (st as any)?.durationSeconds, (st as any)?.time_sec, (st as any)?.timeSeconds ]
        .map((v:any)=>Number(v)).find((n:number)=>Number.isFinite(n) && n>0) as number | undefined;
      if (Number.isFinite(sec)) plannedSec = Number(sec);
      if (plannedSec == null) {
        const desc = String((planned as any)?.rendered_description || (planned as any)?.description || '').toLowerCase();
        // Prefer explicit label like "Total duration: 70:00" else any mm:ss before @
        let m = desc.match(/total\s*duration\s*:\s*(\d{1,3}):(\d{2})/);
        if (!m) m = desc.match(/\b(\d{1,3}):(\d{2})\b\s*@/);
        if (!m) m = desc.match(/\b(\d{1,3}):(\d{2})\b/);
        if (m) plannedSec = parseInt(m[1],10)*60 + parseInt(m[2],10);
      }
    } catch {}

    if (paceText && plannedSec && plannedSec>0) return `${fmtTime(plannedSec)} @ ${paceText}`;
    if (paceText) return paceText;
    if (plannedSec && plannedSec > 0) {
      const kind = String((st as any)?.kind || (st as any)?.type || '').toLowerCase();
      // Never show raw mm:ss as the only segment title (reads like a mistaken column / ghost row).
      if (kind === 'work' || kind === 'interval') return `Work · ${fmtTime(plannedSec)}`;
      if (kind === 'warmup') return 'warmup';
      if (kind === 'cooldown') return 'cooldown';
      if (kind === 'recovery') return 'recovery';
      if (kind === 'overall' || kind === 'steady') return fmtTime(plannedSec);
      if (typeof (st as any)?.label === 'string' && String((st as any).label).trim()) {
        return String((st as any).label).trim();
      }
      return `Segment · ${fmtTime(plannedSec)}`;
    }
    return '—';
  };

  // --- Universal power selection logic ---
  const isMultiIntervalWorkout = (intervals: any[]): boolean => {
    if (!Array.isArray(intervals) || intervals.length <= 1) return false;
    
    // Check for different power targets across intervals
    const powerTargets = intervals.map(i => {
      const pr = i.planned?.power_range;
      const target = i.planned?.power_target_watts;
      return pr ? `${pr.lower}-${pr.upper}` : target;
    }).filter(Boolean);
    
    const uniqueTargets = [...new Set(powerTargets)];
    return uniqueTargets.length > 1;
  };

  const getDisplayPower = (workout: any, interval: any): number | null => {
    // Priority 1: Use interval-specific executed power (per-interval actual)
    if (interval?.executed?.avg_power_w) {
      return Number(interval.executed.avg_power_w);
    }
    
    // Priority 2: Fallback to overall workout power if no interval data
    const overallPower = Number(workout?.avg_power ?? workout?.metrics?.avg_power ?? workout?.average_watts);
    if (Number.isFinite(overallPower) && overallPower > 0) {
      return overallPower;
    }
    
    return null;
  };

  const getDisplayPace = (workout: any, interval: any, step: any, stepsDisplayArg?: any[], stepIdx?: number): number | null => {
    // Prefer executed pace on the row (incl. session_detail_v1 shape) before breakdown matching
    try {
      const exec0 = interval?.executed || interval || null;
      const direct0 = Number(
        exec0?.actual_pace_sec_per_mi ??
        exec0?.avg_pace_s_per_mi ??
        exec0?.avgPaceSPerMi ??
        exec0?.avg_pace_sec_per_mi ??
        (interval as any)?.actual_pace_sec_per_mi,
      );
      if (Number.isFinite(direct0) && direct0 > 0) return Math.round(direct0);
    } catch { /* ignore */ }

    // PRIMARY: workout_analysis.detailed_analysis.interval_breakdown.intervals (same order as analysis)
    // NO FALLBACKS - if analysis not available, return null (show "—")
    const workoutAnalysis = workout?.workout_analysis;
    const intervalBreakdownObj = workoutAnalysis?.detailed_analysis?.interval_breakdown;
    
    // interval_breakdown is optional; if absent, fall back to direct row pace.
    const intervals = (intervalBreakdownObj && intervalBreakdownObj.available && Array.isArray(intervalBreakdownObj.intervals))
      ? intervalBreakdownObj.intervals
      : [];
    if (!step) return null;
    const stepId = String((step as any)?.id || '');
    const stepKind = String((step as any)?.kind || (step as any)?.type || '').toLowerCase();
    
    // Find matching interval by interval_type (warmup/cooldown/recovery/work) or planned_step_id
    let matchingInterval = intervals.find((iv: any) => {
      const ivId = String(iv?.interval_id || '');
      const ivKind = String(iv?.interval_type || iv?.kind || '').toLowerCase();
      
      // Match warmup/cooldown by kind (only one of each type)
      if (stepKind && (stepKind === 'warmup' || stepKind === 'cooldown')) {
        return ivKind === stepKind;
      }
      
      // Match recovery by kind and recovery_number
      if (stepKind === 'recovery') {
        if (ivKind !== 'recovery') return false;
        const stepRecoveryNum = Number((step as any)?.recovery_number);
        if (Number.isFinite(stepRecoveryNum) && iv.recovery_number) {
          return iv.recovery_number === stepRecoveryNum;
        }
        // If no recovery_number, match by order (first recovery to first recovery)
        return true;
      }
      
      // Match work intervals: count work steps before this one to get interval_number
      if (stepKind === 'work') {
        if (ivKind !== 'work') return false;
        // Try matching by planned_step_id first (most reliable)
        if (ivId && stepId && ivId === stepId) {
          return true;
        }
        // If no ID match, count work intervals before this step
        if (stepsDisplayArg && Number.isFinite(stepIdx)) {
          const workStepsBefore = stepsDisplayArg.slice(0, stepIdx).filter((s: any) => {
            const sKind = String(s?.kind || s?.type || '').toLowerCase();
            return sKind === 'work';
          });
          const workIntervalNumber = workStepsBefore.length + 1; // 1-indexed
          return iv.interval_number === workIntervalNumber;
        }
        return false;
      }
      
      // Match by interval_id if available
      return ivId === stepId;
    });

    // When kind/id matching fails (common on unplanned / Strava), same-length tables are usually aligned by index
    if (
      !matchingInterval &&
      Number.isFinite(stepIdx) &&
      stepIdx != null &&
      stepIdx >= 0 &&
      Array.isArray(stepsDisplayArg) &&
      intervals.length === stepsDisplayArg.length &&
      stepIdx < intervals.length
    ) {
      matchingInterval = intervals[stepIdx];
    }

    // Field is actual_pace_min_per_mi (minutes per mile), convert to seconds per mile
    if (matchingInterval?.actual_pace_min_per_mi) {
      const paceMinPerMi = Number(matchingInterval.actual_pace_min_per_mi);
      if (Number.isFinite(paceMinPerMi) && paceMinPerMi > 0) {
        return Math.round(paceMinPerMi * 60); // Convert minutes to seconds per mile
      }
    }

    // Fallback (for "Show details" micro-segments): use server-provided executed pace when available.
    // STRICT: do not derive pace from distance+duration on the client.
    try {
      const exec = interval?.executed || interval || null;
      const direct = Number(
        exec?.avg_pace_s_per_mi ??
        exec?.avgPaceSPerMi ??
        exec?.avg_pace_sec_per_mi ??
        exec?.actual_pace_sec_per_mi ??
        interval?.avg_pace_s_per_mi ??
        interval?.avg_pace_sec_per_mi ??
        (interval as any)?.actual_pace_sec_per_mi,
      );
      if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
    } catch {}

    return null;
  };

  // --- Execution percentage helpers (strict, server-computed only) ---
  const shouldShowPercentage = (st: any): boolean => {
    const t = String((st?.type || st?.kind || '')).toLowerCase();
    return !(t === 'interval_rest' || t === 'rest');
  };

  type MetricType = 'duration' | 'distance' | 'pace';
  
  // Legacy function for backward compatibility (used in interval tables)
  const getPercentageColor = (pct: number): string => {
    if (pct >= 90 && pct <= 110) return 'text-green-600';
    if (pct >= 80 && pct <= 120) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPercentageBg = (pct: number): string => {
    if (pct >= 90 && pct <= 110) return 'bg-green-50';
    if (pct >= 80 && pct <= 120) return 'bg-yellow-50';
    return 'bg-red-50';
  };

  const getPercentageBorder = (pct: number): string => {
    if (pct >= 90 && pct <= 110) return 'border-green-200';
    if (pct >= 80 && pct <= 120) return 'border-yellow-200';
    return 'border-red-200';
  };

  // ---------- Execution score (contextual) helpers ----------
  const mapExecutedToPlanned = (plannedSteps: any[], executedIntervals: any[]) => {
    return plannedSteps.map((plannedStep: any, idx: number) => {
      let executedStep = executedIntervals.find((ex: any) => String(ex?.planned_step_id || '') === String(plannedStep?.id || ''));
      if (!executedStep) executedStep = executedIntervals[idx];
      return { planned: plannedStep, executed: executedStep };
    });
  };

  const hasSignificantDurationVariation = (steps: any[]): boolean => {
    try {
      const durations = steps.map((s: any) => Number(s?.seconds || s?.duration || s?.duration_sec || s?.durationSeconds || 0)).filter((d: number) => Number.isFinite(d) && d > 0);
      if (!durations.length) return false;
      const max = Math.max(...durations);
      const min = Math.min(...durations);
      return min > 0 && max / min > 2;
    } catch { return false; }
  };

  const getExecutionMethodLabel = (workoutType: string, steps: any[]) => {
    const hasVariedDurations = hasSignificantDurationVariation(steps);
    const t = String(workoutType || '').toLowerCase();
    if (t === 'ride' || t === 'bike' || t === 'cycling') return hasVariedDurations ? 'Duration-weighted power adherence' : 'Average power adherence';
    if (t === 'run' || t === 'walk') return hasVariedDurations ? 'Duration-weighted pace adherence' : 'Average pace adherence';
    if (t === 'swim') return 'Distance-weighted pace adherence';
    if (t === 'strength') return 'Rep-weighted load adherence';
    return hasVariedDurations ? 'Duration-weighted adherence' : 'Average adherence';
  };

  // comp alias for renderCompletedFor (originally an undefined variable referencing completedSrc)
  const comp = completedSrc;

  const renderCompletedFor = (st: any): { paceText: string; hr: number | null; durationSec?: number } | string => {
    if (!comp || rows.length < 2) return '—' as any;
    const isRunOrWalk = /run|walk/i.test(comp.type || '') || /running|walking/i.test(comp.activity_type || '');
    const isRide = /ride|bike|cycling/i.test(comp.type || '') || /cycling|bike/i.test(comp.activity_type || '');
    const isSwim = /swim/i.test(comp.type || '') || /swim/i.test(comp.activity_type || '');
    const kindStr = String(st.kind || st.type || st.name || '').toLowerCase();
    const isRest = /rest|recover|recovery|jog/.test(kindStr);
    const isWarm = /warm|wu/.test(kindStr);
    const isCool = /cool|cd/.test(kindStr);

    const startIdx = cursorIdx;
    const startCum = cursorCum;
    let endIdx = startIdx + 1;

    // Resolve planned distance in meters from various shapes (computed steps, intervals)
    const stDistanceMeters = (() => {
      const ydToM = (yd:number)=> yd * 0.9144;
      const dm = Number(st.distanceMeters ?? st.distance_m ?? st.meters ?? st.m);
      if (Number.isFinite(dm) && dm > 0) return dm;
      // v3 swim/other: distance_yd
      const dYd = Number((st as any).distance_yd ?? (st as any).distance_yds);
      if (Number.isFinite(dYd) && dYd > 0) return ydToM(dYd);
      // Parse from label/name/description e.g., "400m", "1 mi", "2km"
      try {
        const txt = String(st.label || st.name || st.description || '').toLowerCase();
        const m = txt.match(/(\d+(?:\.\d+)?)\s*(mi|mile|miles|km|kilometer|kilometre|m|meter|metre|yd|yard|yards)\b/);
        if (m) {
          const val = parseFloat(m[1]);
          const unit = m[2];
          if (unit.startsWith('mi')) return val * 1609.34;
          if (unit.startsWith('km')) return val * 1000;
          if (unit === 'm' || unit.startsWith('met')) return val;
          if (unit.startsWith('yd')) return ydToM(val);
        }
      } catch {}
      const ov = Number(st.original_val);
      const ou = String(st.original_units || '').toLowerCase();
      if (Number.isFinite(ov) && ov > 0) {
        if (ou === 'mi') return ov * 1609.34;
        if (ou === 'km') return ov * 1000;
        if (ou === 'm') return ov;
        if (ou === 'yd' || ou === 'yard' || ou === 'yards') return ov * 0.9144;
      }
      return NaN;
    })();

    // Planned time (sec) if present – used to align rest/jog and as fallback to avoid 0:01 artifacts
    let plannedDurSec = (() => {
      const cands = [st.seconds, st.duration, st.duration_sec, st.durationSeconds, st.time_sec, st.timeSeconds, (st as any)?.duration_s, (st as any)?.rest_s];
      for (const v of cands) { const n = Number(v); if (Number.isFinite(n) && n > 0) return n; }
      // v3 rest field
      const rs = Number((st as any)?.rest_s);
      if (Number.isFinite(rs) && rs > 0) return rs;
      const ts = String(st.time || '').trim();
      if (/^\d{1,2}:\d{2}$/.test(ts)) { const [m,s] = ts.split(':').map((x:string)=>parseInt(x,10)); return m*60 + s; }
      // Parse from label tokens, e.g., "R2min", "r180", "20s", "12min"
      try {
        const txt = String(st.label || st.name || st.description || '').toLowerCase();
        let m: RegExpMatchArray | null = null;
        m = txt.match(/r\s*(\d+)\s*min|r(\d+)\s*min|r(\d+)-?(\d+)?\s*min/i);
        if (m) {
          const a = parseInt(m[1] || m[2] || m[3] || '0', 10);
          const b = m[4] ? parseInt(m[4],10) : a;
          const avg = Math.round((a + b) / 2) * 60;
          if (avg > 0) return avg;
        }
        m = txt.match(/(\d+)\s*min/);
        if (m) {
          const v = parseInt(m[1], 10) * 60; if (v > 0) return v;
        }
        m = txt.match(/(\d+)\s*s\b/);
        if (m) { const v = parseInt(m[1],10); if (v>0) return v; }
      } catch {}
      return 0;
    })();
    // Fallback to defaults parsed from tokens when missing
    if (!plannedDurSec || plannedDurSec <= 0) {
      if (isRest && defaultDurations.rest_s) plannedDurSec = defaultDurations.rest_s;
      if (isWarm && defaultDurations.warmup_s) plannedDurSec = defaultDurations.warmup_s;
      if (isCool && defaultDurations.cooldown_s) plannedDurSec = defaultDurations.cooldown_s;
    }

    if ((Number.isFinite(stDistanceMeters) && stDistanceMeters > 0) || (fallbackWorkMeters && !isRest && !isWarm && !isCool)) {
      const dist = (Number.isFinite(stDistanceMeters) && stDistanceMeters > 0) ? (stDistanceMeters as number) : (fallbackWorkMeters as number);
      const targetCum = startCum + dist;
      while (endIdx < rows.length && (rows[endIdx].cumMeters || 0) < targetCum) endIdx += 1;
    } else {
      // Time-controlled step: coerce duration from multiple fields
      const dur = plannedDurSec || 0;
      const startT = rows[startIdx].t;
      // If warm-up time is unusually long, cap at movement portion only (ignore idle)
      const capDur = (isWarm && dur > 0) ? Math.min(dur, Math.max(0, rows[rows.length-1].t - startT)) : dur;
      const targetT = startT + (capDur > 0 ? capDur : 0);
      while (endIdx < rows.length && rows[endIdx].t < targetT) endIdx += 1;
    }
    if (endIdx >= rows.length) endIdx = rows.length - 1;

    // Advance cursor for next step
    cursorIdx = endIdx;
    cursorCum = rows[endIdx].cumMeters || cursorCum;

    const seg = rows.slice(startIdx, Math.max(startIdx + 1, endIdx));
    let timeSec = Math.max(1, (seg[seg.length-1]?.t ?? rows[rows.length-1].t) - (seg[0]?.t ?? rows[0].t));
    const dMeters = Math.max(0, (seg[seg.length-1]?.cumMeters ?? 0) - (seg[0]?.cumMeters ?? 0));
    // HR smoothing: average only over non-zero, clamp to plausible 60-210 bpm
    let hrVals = seg
      .map(s=> (typeof s.hr==='number' && s.hr>40 && s.hr<230 ? s.hr : NaN))
      .filter(n=>Number.isFinite(n));
    // If warm-up: allow first few seconds to settle; trim first 5s to reduce HR spikes
    if (isWarm && seg.length>3) {
      const t0 = seg[0].t;
      const trimmed = seg.filter(s=> (s.t - t0) >= 5);
      const hrVals2 = trimmed.map(s=> (typeof s.hr==='number' && s.hr>40 && s.hr<230 ? s.hr : NaN)).filter(n=>Number.isFinite(n));
      if (hrVals2.length) hrVals = hrVals2;
    }
    const hrAvg = hrVals.length ? Math.round(hrVals.reduce((a,b)=>a+b,0)/hrVals.length) : null;
    const km = dMeters/1000;
    // Compute average speed early so it can be used below for multiple fallbacks
    const speedVals = seg
      .map(s => (typeof (s as any).speedMps === 'number' ? (s as any).speedMps : NaN))
      .filter(n => Number.isFinite(n) && n >= 0.3);
    const avgSpeedMps = speedVals.length ? (speedVals.reduce((a,b)=>a+b,0)/speedVals.length) : null;
    const plannedMetersForPace = (Number.isFinite(stDistanceMeters) && stDistanceMeters>0) ? (stDistanceMeters as number) : (fallbackWorkMeters || 0);
    const milesMeasured = (km * 0.621371);
    const milesPlanned = plannedMetersForPace > 0 ? (plannedMetersForPace/1609.34) : 0;
    // Prefer measured distance when it looks reasonable; else planned; else derive from avg speed
    let miles = (milesMeasured > 0.03 && milesMeasured < 1.0) ? milesMeasured : (milesPlanned > 0 ? milesPlanned : 0);
    if (miles <= 0 && avgSpeedMps && avgSpeedMps > 0.2) {
      miles = (avgSpeedMps * timeSec) / 1609.34;
    }
    const paceMinPerMile = miles>0 ? (timeSec/60)/miles : null;

    // If segmentation produced a tiny duration but the plan had a real duration, honor planned time (prevents 0:01 artifacts)
    if (timeSec < 5 && plannedDurSec > 0) {
      timeSec = plannedDurSec;
    }

    if (isRunOrWalk) {
      const isWork = !isRest && !isWarm && !isCool;
      const measuredMiles = milesMeasured;
      const plannedMiles = milesPlanned;
      let useMiles = 0;
      if (measuredMiles > 0.03 && measuredMiles < 5) {
        useMiles = measuredMiles;
      } else if (isWork && plannedMiles > 0) {
        useMiles = plannedMiles;
      }
      if (useMiles > 0) {
        const paceMinPerMileCalc = (timeSec/60) / useMiles;
        if (paceMinPerMileCalc > 2 && paceMinPerMileCalc < 20) {
          const m = Math.floor(paceMinPerMileCalc);
          const s = Math.round((paceMinPerMileCalc - m)*60);
          return { paceText: `${m}:${String(s).padStart(2,'0')}/mi`, hr: hrAvg, durationSec: Math.round(timeSec) };
        }
      }
      // Last resort for jog/rest only: derive from avg speed if looks like m/s
      if (isRest && avgSpeedMps && avgSpeedMps > 0.2 && avgSpeedMps < 8) {
        const secPerMile = 1609.34 / avgSpeedMps;
        if (secPerMile >= 240 && secPerMile <= 1200) {
          const m = Math.floor(secPerMile/60);
          const s = Math.round(secPerMile%60);
          return { paceText: `${m}:${String(s).padStart(2,'0')}/mi`, hr: hrAvg, durationSec: Math.round(timeSec) };
        }
      }
      return { paceText: '—', hr: hrAvg, durationSec: Math.round(timeSec) };
    }
    if (isRide) {
      let mph = timeSec>0 ? (miles/(timeSec/3600)) : 0;
      if ((!mph || mph<=0) && avgSpeedMps && avgSpeedMps > 0) mph = avgSpeedMps * 2.236936;
      return { paceText: mph>0 ? `${mph.toFixed(1)} mph` : '—', hr: hrAvg!=null?Math.round(hrAvg):null, durationSec: Math.round(timeSec) };
    }
    if (isSwim) {
      const per100m = km>0 ? (timeSec/(km*10)) : null;
      const mm = per100m!=null ? Math.floor(per100m/60) : 0;
      const ss = per100m!=null ? Math.round(per100m%60) : 0;
      return { paceText: per100m!=null ? `${mm}:${String(ss).padStart(2,'0')} /100m` : '—', hr: hrAvg!=null?Math.round(hrAvg):null, durationSec: Math.round(timeSec) };
    }
    const fallback = completedValueForStep(comp, st) as any;
    return { paceText: typeof fallback === 'string' ? fallback : (fallback?.text || '—'), hr: typeof fallback === 'string' ? null : (fallback?.hr ?? null), durationSec: Math.round(timeSec) };
  };

  // -------- Strict interval matching by planned_step_id only --------
  const intervalByPlannedId = useMemo(() => {
    const map = new Map<string, any>();
    for (const it of computedIntervals) {
      const pid = String((it as any)?.planned_step_id || '');
      if (pid) map.set(pid, it);
    }
    return map;
  }, [computedIntervals]);

  const intervalByIndex = useMemo(() => {
    const map = new Map<number, any>();
    for (const it of computedIntervals) {
      const idx = Number((it as any)?.planned_index);
      if (Number.isFinite(idx)) map.set(idx, it);
    }
    return map;
  }, [computedIntervals]);

  return (
    <>
      {/* Pool swims: show distance and duration chips (no per-interval data) */}
      {isPoolSwim ? (
        <div className="w-full pt-1 pb-2">
          {(() => {
            const compOverall = (completedSrc as any)?.computed?.overall || {};
            const plannedTotalMeters = stepsDisplay.reduce((sum: number, st: any) => {
              const meters = Number((st as any)?.distanceMeters ?? (st as any)?.distance_m ?? (st as any)?.m ?? (st as any)?.meters);
              const yd = Number((st as any)?.distance_yd ?? (st as any)?.distance_yds);
              if (Number.isFinite(meters) && meters > 0) return sum + meters;
              if (Number.isFinite(yd) && yd > 0) return sum + (yd * 0.9144);
              return sum;
            }, 0);
            
            // Get planned duration - prioritize server-computed total, then explicit step durations, then estimate
            const plannedTotalSeconds = (() => {
              // Priority 1: Use server-computed total_duration_seconds (most accurate, in seconds)
              const serverTotalSec = Number(planned?.computed?.total_duration_seconds ?? planned?.total_duration_seconds);
              if (Number.isFinite(serverTotalSec) && serverTotalSec > 0) {
                return Math.round(serverTotalSec);
              }
              
              // Priority 1b: Use planned.duration (stored in minutes by materialize-plan)
              const durationMin = Number((planned as any)?.duration);
              if (Number.isFinite(durationMin) && durationMin > 0) {
                return Math.round(durationMin * 60);
              }
              
              // Priority 2: Sum explicit seconds from all steps
              let timedTotal = 0;
              stepsDisplay.forEach((st: any) => {
                const secs = Number(st?.seconds ?? st?.duration ?? st?.duration_s ?? st?.duration_sec);
                if (Number.isFinite(secs) && secs > 0) {
                  timedTotal += Math.round(secs);
                }
              });
              
              // If we got explicit times, use them (includes warmup, rest, cooldown, etc)
              if (timedTotal > 0) return timedTotal;
              
              // Priority 3: Fallback - estimate from distance using baseline pace (only if no explicit times)
              const secPer100FromBaseline = (() => {
                const pace = Number(planned?.baselines_template?.swim_pace_per_100_sec ?? planned?.baselines?.swim_pace_per_100_sec);
                return (Number.isFinite(pace) && pace > 0) ? pace : 90; // Default 1:30/100m
              })();
              
              let estTotal = 0;
              const poolUnit = planned?.pool_unit as 'yd' | 'm' | null;
              
              stepsDisplay.forEach((st: any) => {
                const distM = Number(st?.distanceMeters ?? st?.distance_m ?? st?.m ?? st?.meters);
                const distYd = Number(st?.distance_yd ?? st?.distance_yds);
                
                if (Number.isFinite(distM) && distM > 0) {
                  const sec = (poolUnit === 'yd') 
                    ? ((distM / 0.9144) / 100) * secPer100FromBaseline
                    : ((distM / 100) * secPer100FromBaseline);
                  estTotal += sec;
                } else if (Number.isFinite(distYd) && distYd > 0) {
                  const sec = (distYd / 100) * secPer100FromBaseline;
                  estTotal += sec;
                }
              });
              
              return estTotal > 0 ? Math.round(estTotal) : 0;
            })();
            
            const executedMeters = Number(compOverall?.distance_m) || (Number((completedSrc as any)?.distance) * 1000) || 0;
            // ONLY use moving time - no fallbacks
            const executedSeconds = Number(compOverall?.duration_s_moving) || 0;
            
            const distPct = plannedTotalMeters > 0 ? Math.round((executedMeters / plannedTotalMeters) * 100) : null;
            const timePct = plannedTotalSeconds > 0 ? Math.round((executedSeconds / plannedTotalSeconds) * 100) : null;
            
            const distDelta = plannedTotalMeters > 0 && executedMeters > 0 ? executedMeters - plannedTotalMeters : null;
            const timeDelta = plannedTotalSeconds > 0 && executedSeconds > 0 ? executedSeconds - plannedTotalSeconds : null;
            
            const chip = (label: string, pct: number | null, text: string, _metricType: MetricType) => {
              if (pct == null) return null;
              return (
                <div className="flex flex-col items-center px-2">
                  <div className="text-sm font-semibold text-gray-100">{pct}%</div>
                  <div className="text-[11px] text-gray-700">{label}</div>
                  <div className="text-[11px] text-gray-600">{text}</div>
                </div>
              );
            };
            
            const fmtDistDelta = (m: number) => {
              const sign = m >= 0 ? '+' : '−';
              const abs = Math.abs(m);
              if (useImperial) {
                const yd = Math.round(abs / 0.9144);
                return `${sign}${yd} yd`;
              }
              return `${sign}${Math.round(abs)} m`;
            };
            
            const fmtTimeDelta = (s: number) => {
              const sign = s >= 0 ? '+' : '−';
              const v = Math.abs(Math.round(s));
              const m = Math.floor(v / 60);
              const ss = v % 60;
              return `${sign}${m}:${String(ss).padStart(2, '0')}`;
            };
            
            const anyVal = (distPct != null) || (timePct != null);
            if (!anyVal) return null;
            
            const fmtDist = (m: number) => useImperial ? `${Math.round(m / 0.9144)} yd` : `${Math.round(m)} m`;
            const fmtTimeLocal = (s: number) => { const min = Math.floor(s / 60); const sec = Math.round(s % 60); return `${min}:${String(sec).padStart(2, '0')}`; };
            
            return (
              <>
                <div className="flex items-center justify-center gap-6 text-center">
                  <div className="flex items-end gap-3">
                    {chip('Distance', distPct, distDelta != null ? fmtDistDelta(distDelta) : '—', 'distance')}
                    {chip('Duration', timePct, timeDelta != null ? fmtTimeDelta(timeDelta) : '—', 'duration')}
                  </div>
                </div>
                {/* Simple summary row showing planned vs executed */}
                <div className="mt-4 px-4 py-3 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Planned</div>
                      <div className="font-medium">{plannedTotalMeters > 0 ? fmtDist(plannedTotalMeters) : '—'}</div>
                      <div className="text-gray-600">{plannedTotalSeconds > 0 ? fmtTimeLocal(plannedTotalSeconds) : '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Executed</div>
                      <div className="font-medium">{executedMeters > 0 ? fmtDist(executedMeters) : '—'}</div>
                      <div className="text-gray-600">{executedSeconds > 0 ? fmtTimeLocal(executedSeconds) : '—'}</div>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        <>
        {waitingForCanonicalRows ? (
          <div className="px-3 py-3 rounded-lg border border-red-400/30 bg-red-900/10 mb-3">
            <p className="text-sm text-red-200">Session interval contract missing for this planned workout.</p>
            <p className="text-xs text-red-300/90 mt-1">
              {intervalDisplayReason === 'no_measured_execution_and_no_overall'
                ? 'Measured execution data is not ready yet. Recompute analysis to refresh.'
                : 'Recompute analysis to generate canonical interval rows.'}
            </p>
          </div>
        ) : null}
        {!waitingForCanonicalRows ? (
        <table className="w-full text-[13px] table-fixed">
          <colgroup>
            <col className="w-[36%]" />
            <col className="w-[22%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-2 py-2 text-left font-medium text-gray-400 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <span>{leftColHeader}</span>
                  {(() => {
                    const fp = completedSrc?.workout_analysis?.fact_packet_v1;
                    const workoutType = String(fp?.facts?.workout_type || '').toLowerCase();
                    const weekIntent = String(fp?.facts?.plan?.week_intent || '').toLowerCase();
                    const isRecoveryWeek = fp?.facts?.plan?.is_recovery_week === true;
                    const easyLike =
                      weekIntent === 'recovery' ||
                      isRecoveryWeek ||
                      workoutType.includes('recovery') ||
                      workoutType === 'easy' ||
                      workoutType === 'easy_run';
                    if (!easyLike) return null;
                    if (!Array.isArray(stepsDisplayBase) || stepsDisplayBase.length <= 2) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => setShowFullIntervalBreakdown((v) => !v)}
                        className="text-[11px] px-1.5 py-0.5 rounded-md bg-white/10 border border-white/15 text-gray-200 hover:bg-white/15"
                        title={showFullIntervalBreakdown ? 'Hide strides and recovery jogs' : 'Show strides and recovery jogs'}
                      >
                        {showFullIntervalBreakdown ? 'Hide strides' : 'Show strides'}
                      </button>
                    );
                  })()}
                </div>
              </th>
              <th className="px-2 py-2 text-left font-medium text-gray-400 whitespace-nowrap">{isRideSport ? 'Watts' : (isSwimSport ? '/100 (pref)' : 'Pace')}</th>
              <th className="px-2 py-2 text-left font-medium text-gray-400 whitespace-nowrap">Dist</th>
              <th className="px-2 py-2 text-left font-medium text-gray-400 whitespace-nowrap">Time</th>
              <th className="px-1 py-2 text-left font-medium text-gray-400 whitespace-nowrap">BPM</th>
            </tr>
          </thead>
          <tbody>
          {stepsDisplay.map((st, idx) => {
            // Check if we should show a target pace range subtitle
            const shouldShowRangeSubtitle = (() => {
              if (idx === 0) return true;
              
              const currentRange = (() => {
                const plannedSteps = (planned as any)?.computed?.steps;
                if (Array.isArray(plannedSteps) && plannedSteps[idx]) {
                  const step = plannedSteps[idx];
                  if (step.pace_range && typeof step.pace_range === 'object' && 
                      step.pace_range.lower && step.pace_range.upper) {
                    return `${step.pace_range.lower}-${step.pace_range.upper}`;
                  }
                }
                
                const prng = (st as any)?.pace_range || (st as any)?.paceRange;
                if (prng && typeof prng === 'object' && prng.lower && prng.upper) {
                  return `${prng.lower}-${prng.upper}`;
                }
                
                return null;
              })();
              
              const previousRange = (() => {
                const plannedSteps = (planned as any)?.computed?.steps;
                if (Array.isArray(plannedSteps) && plannedSteps[idx - 1]) {
                  const step = plannedSteps[idx - 1];
                  if (step.pace_range && typeof step.pace_range === 'object' && 
                      step.pace_range.lower && step.pace_range.upper) {
                    return `${step.pace_range.lower}-${step.pace_range.upper}`;
                  }
                }
                
                const prevSt = stepsDisplay[idx - 1];
                const prng = (prevSt as any)?.pace_range || (prevSt as any)?.paceRange;
                if (prng && typeof prng === 'object' && prng.lower && prng.upper) {
                  return `${prng.lower}-${prng.upper}`;
                }
                
                return null;
              })();
              
              return currentRange !== previousRange;
            })();
            
            // Format pace range for display
            const formatPaceRange = (st: any): string | null => {
              const plannedSteps = (planned as any)?.computed?.steps;
              if (Array.isArray(plannedSteps) && plannedSteps[idx]) {
                const step = plannedSteps[idx];
                if (step.pace_range && typeof step.pace_range === 'object' && 
                    step.pace_range.lower && step.pace_range.upper) {
                  const formatPace = (sec: number) => {
                    const mins = Math.floor(sec / 60);
                    const secs = Math.round(sec % 60);
                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                  };
                  return `${formatPace(step.pace_range.lower)}-${formatPace(step.pace_range.upper)}/mi`;
                }
              }
              
              const prng = (st as any)?.pace_range || (st as any)?.paceRange;
              if (prng && typeof prng === 'object' && prng.lower && prng.upper) {
                const formatPace = (sec: number) => {
                  const mins = Math.floor(sec / 60);
                  const secs = Math.round(sec % 60);
                  return `${mins}:${secs.toString().padStart(2, '0')}`;
                };
                return `${formatPace(prng.lower)}-${formatPace(prng.upper)}/mi`;
              }
              
              return null;
            };
            
            let row: any = null;
            const sessionRow = (() => {
              if (!hasCanonicalIntervalRows) return null;
              const pid = String((st as any)?.id || '');
              const pidx = Number((st as any)?.planned_index);
              return sessionIntervalRows.find((r: any) =>
                String(r?.planned_step_id || r?.row_id || '') === pid ||
                (Number.isFinite(pidx) && Number(r?.planned_index) === pidx)
              ) || null;
            })();
            if (sessionRow && sessionRow.executed) {
              row = sessionRow;
            }
            const rangeSubtitle = (sessionRow?.planned_pace_display && typeof sessionRow.planned_pace_display === 'string')
              ? sessionRow.planned_pace_display
              : formatPaceRange(st);
            if (!row && !planned && hasServerComputed) {
              const pid = String((st as any)?.id || '');
              row = pid ? intervalByPlannedId.get(pid) : null;
              if (!row) {
                const ix = Number((st as any)?.planned_index);
                if (Number.isFinite(ix)) row = intervalByIndex.get(ix) || null;
              }
              // Unplanned: row from interval_breakdown (server provides executed + planned_label)
              if (!row && !planned && unplannedIntervals[idx]) {
                row = unplannedIntervals[idx];
              }
            }
            if (row && !row?.executed) {
              const r0 = row as any;
              let paceS = NaN;
              const ps = Number(r0?.pace_s_per_mi);
              if (Number.isFinite(ps) && ps > 0) paceS = ps;
              else {
                const aps = Number(r0?.actual_pace_sec_per_mi);
                if (Number.isFinite(aps) && aps > 0) paceS = aps;
                else if (r0?.actual_pace_min_per_mi != null) {
                  const apm = Number(r0.actual_pace_min_per_mi);
                  if (Number.isFinite(apm) && apm > 0) paceS = apm * 60;
                }
              }
              row = {
                ...row,
                executed: {
                  duration_s: Number(r0?.actual_duration_s ?? 0) || undefined,
                  distance_m: Number(r0?.actual_distance_m ?? 0) || undefined,
                  avg_hr: Number(r0?.avg_heart_rate_bpm ?? 0) || undefined,
                  avg_pace_s_per_mi: Number.isFinite(paceS) && paceS > 0 ? Math.round(paceS) : undefined,
                  actual_pace_sec_per_mi:
                    Number.isFinite(Number(r0?.actual_pace_sec_per_mi)) && Number(r0.actual_pace_sec_per_mi) > 0
                      ? Math.round(Number(r0.actual_pace_sec_per_mi))
                      : Number.isFinite(paceS) && paceS > 0
                        ? Math.round(paceS)
                        : undefined,
                },
              };
            }
            // Use enhanced analysis adherence percentage if available (works for both running and cycling)
            const getEnhancedAdherence = () => {
              if (typeof sessionRow?.adherence_pct === 'number') {
                return Math.round(sessionRow.adherence_pct);
              }
              if (planned) return null;
              const workoutAnalysis = completedSrc?.workout_analysis;
              if (workoutAnalysis?.granular_analysis?.interval_breakdown) {
                const intervalBreakdown = workoutAnalysis.granular_analysis.interval_breakdown;
                const matchingInterval = intervalBreakdown.find((interval: any) => {
                  const plannedStepId = (st as any)?.id;
                  const plannedIndex = (st as any)?.planned_index;
                  return interval.interval_id === plannedStepId || 
                         interval.interval_id === `interval_${plannedIndex}` ||
                         interval.interval_id === plannedStepId;
                });
                if (matchingInterval) {
                  if (typeof matchingInterval.adherence_percentage === 'number') {
                    return Math.round(matchingInterval.adherence_percentage * 100);
                  }
                  const directPct = matchingInterval.power_adherence_percent || matchingInterval.pace_adherence_percent;
                  if (typeof directPct === 'number') {
                    return Math.round(directPct);
                  }
                }
              }
              return null;
            };
            
            const pct = getEnhancedAdherence() || null;
            // Planned label: prioritize server-computed label, fallback to simple client-side generation
            const plannedLabel = (() => {
              // Canonical contract (server-owned)
              if (sessionRow?.planned_label && typeof sessionRow.planned_label === 'string' && sessionRow.planned_label.trim()) {
                return sessionRow.planned_label;
              }
              if (row?.planned_label && typeof row.planned_label === 'string' && row.planned_label.trim()) {
                return row.planned_label;
              }
              
              return plannedLabelStrict(st);
            })();

            const execCell = (() => {
              // For rides, use universal power selection logic
              if (isRideSport) {
                const power = getDisplayPower(completedSrc, row);
                if (Number.isFinite(power) && power > 0) return `${Math.round(power)} W`;
                return '—';
              }
              // For runs/walks, use universal pace selection logic
              const isRunOrWalk = /run|walk/i.test(sportType);
              if (isRunOrWalk) {
                const workout = completedSrc;
                // session_detail_v1.intervals uses executed.actual_pace_sec_per_mi (often populated when breakdown matching fails)
                if (hasSessionDetail && Array.isArray(sd?.intervals) && sd.intervals.length > 0) {
                  const sid = String((st as any)?.id || '');
                  const sdi =
                    (sid ? sd.intervals.find((iv: any) => String(iv?.id || '') === sid) : null) ??
                    (idx >= 0 && idx < sd.intervals.length ? sd.intervals[idx] : null);
                  const pContract = Number(sdi?.executed?.actual_pace_sec_per_mi);
                  if (Number.isFinite(pContract) && pContract > 0) {
                    const s = Math.round(pContract);
                    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/mi`;
                  }
                }
                const secPerMi = getDisplayPace(workout, row, st, stepsDisplay, idx);
                if (Number.isFinite(secPerMi) && secPerMi > 0) {
                  return `${Math.floor(secPerMi/60)}:${String(Math.round(secPerMi%60)).padStart(2,'0')}/mi`;
                }
                // Overall row: read server-provided overall pace when interval breakdown unavailable
                const stepKindExec = String(st?.kind || st?.type || '').toLowerCase();
                const isOverallRowExec = stepKindExec === 'overall' || st?.id === 'overall' || (idx === 0 && !hasServerComputed);
                if (isOverallRowExec) {
                  const ovrPace = Number(overallForDisplay?.avg_pace_s_per_mi
                    ?? (completedSrc as any)?.executed?.overall?.avg_pace_s_per_mi);
                  if (Number.isFinite(ovrPace) && ovrPace > 0) {
                    return `${Math.floor(ovrPace/60)}:${String(Math.round(ovrPace%60)).padStart(2,'0')}/mi`;
                  }
                }
                return '—';
              }
              // For other sports, use server-computed interval data
              if (!hasServerComputed || !row) return '—';
              return (row as any)?.pace_display ?? '—';
            })();

            const distCell = (() => {
              if (!row) {
                if (idx !== 0 || hasCanonicalIntervalRows) return '—';
                const distM = [
                  overallForDisplay?.distance_m,
                  (completedSrc as any)?.executed?.overall?.distance_m,
                  (completedSrc as any)?.distance_km != null ? Number((completedSrc as any).distance_km) * 1000 : undefined,
                  (completedSrc as any)?.distance_m,
                  (completedSrc as any)?.distance,
                ].map(Number).find(v => Number.isFinite(v) && v > 0) ?? 0;
                if (Number.isFinite(distM) && distM > 0) {
                  if (isSwimSport) return useImperial ? `${Math.round(distM/0.9144)} yd` : `${Math.round(distM)} m`;
                  const mi = distM / 1609.34; return `${mi.toFixed(mi < 1 ? 2 : 1)} mi`;
                }
                return '—';
              }
              const distM = row?.executed?.distance_m as number | undefined;
              if (typeof distM === 'number' && distM > 0) {
                if (isSwimSport) return useImperial ? `${Math.round(distM/0.9144)} yd` : `${Math.round(distM)} m`;
                const mi = distM / 1609.34; return `${mi.toFixed(mi < 1 ? 2 : 1)} mi`;
              }
              return '—';
            })();

            // Check if this is a single-interval steady-state run (use moving time)
            const isSingleIntervalSteadyState = (() => {
              const workSteps = stepsDisplay.filter((s: any) => {
                const kind = String(s?.kind || s?.type || '').toLowerCase();
                return kind === 'work' || kind === 'interval';
              });
              return workSteps.length === 1;
            })();
            
            const timeCell = (() => {
              const stepKind = String(st?.kind || st?.type || '').toLowerCase();
              const isOverallRow = stepKind === 'overall' || st?.id === 'overall' || (idx === 0 && !hasServerComputed);

              // For overall row, use overall moving time (computed → executed → top-level)
              if (isOverallRow) {
                const dur = Number(
                  overallForDisplay?.duration_s_moving
                  ?? (completedSrc as any)?.executed?.overall?.duration_s_moving
                  ?? (completedSrc as any)?.moving_time
                  ?? overallForDisplay?.duration_s
                  ?? (completedSrc as any)?.elapsed_time
                );
                if (Number.isFinite(dur) && dur > 0) return fmtTime(dur);
                return '—';
              }
              // For single-interval steady-state runs, use moving time from overall
              if (isSingleIntervalSteadyState && stepKind === 'work') {
                const movingTime = Number(overallForDisplay?.duration_s_moving);
                if (Number.isFinite(movingTime) && movingTime > 0) return fmtTime(movingTime);
              }
              // For individual intervals (warmup, work, recovery, cooldown), use interval duration
              if (!row) return '—';
              const dur = row?.executed?.duration_s; return (typeof dur === 'number' && dur > 0) ? fmtTime(dur) : '—';
            })();
            
            // Show "Moving Time" subtitle for single-interval steady-state runs
            const showMovingTimeLabel = isSingleIntervalSteadyState && String(st?.kind || st?.type || '').toLowerCase() === 'work';

            const hrVal = (() => {
              if (!row) {
                const stepKind = String(st?.kind || st?.type || '').toLowerCase();
                const isOverallRow = stepKind === 'overall' || st?.id === 'overall' || (idx === 0 && !hasServerComputed && !hasCanonicalIntervalRows);
                if (isOverallRow) {
                  const hr = Number(
                    overallForDisplay?.avg_hr
                    ?? (completedSrc as any)?.executed?.overall?.avg_hr
                    ?? (completedSrc as any)?.avg_heart_rate
                    ?? (completedSrc as any)?.metrics?.avg_heart_rate
                    ?? (completedSrc as any)?.average_heartrate
                  );
                  if (Number.isFinite(hr) && hr > 0) return Math.round(hr);
                }
                return null;
              }
              const hr = Number(
                row?.executed?.avg_hr ??
                row?.executed?.avgHr ??
                row?.avg_heart_rate_bpm ??
                row?.avg_hr
              );
              return Number.isFinite(hr) && hr > 0 ? Math.round(hr) : null;
            })();

            return (
              <tr key={idx} className="border-b border-white/10">
                <td className="px-2 py-1.5">
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between w-full min-h-[2.1rem]">
                      <span className="text-[13px] font-medium truncate pr-2">{plannedLabel}</span>
                      {pct != null && (
                        <div className="flex items-center gap-1">
                          <span className={`text-[11px] font-semibold whitespace-nowrap ${getPercentageColor(pct)}`}>{pct}%</span>
                          {(() => {
                            const workoutAnalysis = completedSrc?.workout_analysis;
                            if (workoutAnalysis?.analysis?.pacing_analysis) {
                              const pacingAnalysis = workoutAnalysis.analysis.pacing_analysis;
                              const variability = pacingAnalysis.pacing_variability;
                              
                              if (variability.coefficient_of_variation > 10) {
                                return <span className="text-[9px] text-red-500" title="High pacing variability">⚠️</span>;
                              } else if (variability.coefficient_of_variation > 7) {
                                return <span className="text-[9px] text-orange-500" title="Moderate pacing variability">⚠️</span>;
                              } else if (variability.coefficient_of_variation > 3) {
                                return <span className="text-[9px] text-yellow-500" title="Good pacing consistency">✓</span>;
                              } else {
                                return <span className="text-[9px] text-green-500" title="Excellent pacing consistency">✓</span>;
                              }
                            }
                            return null;
                          })()}
                        </div>
                      )}
                    </div>
                    {shouldShowRangeSubtitle && rangeSubtitle && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {rangeSubtitle}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5 font-medium">{execCell}</td>
                <td className="px-2 py-1.5">{distCell}</td>
                <td className="px-2 py-1.5">
                  <div className="font-medium">{timeCell}</div>
                </td>
                <td className="px-1 py-1.5 text-[13px]">
                  <div className="text-right">
                    {hrVal != null ? (
                      <>
                        <div className="font-medium">{hrVal}</div>
                        <div className="text-[10px] text-gray-400">bpm</div>
                      </>
                    ) : '—'}
                  </div>
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
        ) : null}
        </>
      )}
    </>
  );
}
