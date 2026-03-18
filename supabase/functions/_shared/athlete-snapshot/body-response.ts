// =============================================================================
// BODY RESPONSE — Per-session observations + weekly rollup
// =============================================================================
// Observations are anchored to specific sessions from the daily ledger.
// The weekly rollup is DERIVED from those observations, not computed independently.
// =============================================================================

import type {
  LedgerDay,
  ActualSession,
  SessionObservation,
  BodyResponse,
  TrendSummary,
} from './types.ts';

// ---------------------------------------------------------------------------
// Norms: what we compare against
// ---------------------------------------------------------------------------

export type BaselineNorms = {
  easy_hr_at_pace: number | null;      // avg HR for easy pace
  threshold_pace_sec_per_mi: number | null;
  avg_execution_score: number | null;
  avg_rpe: number | null;
  avg_hr_drift_bpm: number | null;
  avg_decoupling_pct: number | null;
  avg_rir: number | null;
};

// ---------------------------------------------------------------------------
// Per-session observation generator
// ---------------------------------------------------------------------------

function observeEnduranceSession(
  session: ActualSession,
  planned: { name: string; type: string } | null,
  norms: BaselineNorms,
  imperial: boolean,
): string[] {
  const obs: string[] = [];
  const unit = imperial ? 'mi' : 'km';

  // HR observation
  if (session.avg_hr != null && norms.easy_hr_at_pace != null) {
    const delta = session.avg_hr - norms.easy_hr_at_pace;
    if (Math.abs(delta) >= 3) {
      if (delta > 0) {
        obs.push(`HR ${session.avg_hr} bpm — ${Math.round(delta)} bpm above your norm for this pace. Could be residual fatigue, heat, or caffeine.`);
      } else {
        obs.push(`HR ${session.avg_hr} bpm — ${Math.abs(Math.round(delta))} bpm below your norm. Body is handling this well.`);
      }
    } else {
      obs.push(`HR ${session.avg_hr} bpm — right in your normal range.`);
    }
  } else if (session.avg_hr != null) {
    obs.push(`HR ${session.avg_hr} bpm.`);
  }

  // Decoupling (cardiac drift)
  if (session.decoupling_pct != null) {
    if (session.decoupling_pct <= 3) {
      obs.push(`Heart rate stayed stable throughout (${session.decoupling_pct.toFixed(1)}% drift).`);
    } else if (session.decoupling_pct <= 6) {
      obs.push(`Moderate cardiac drift (${session.decoupling_pct.toFixed(1)}%) — normal for this duration.`);
    } else {
      obs.push(`Significant cardiac drift (${session.decoupling_pct.toFixed(1)}%) — fatigue kicked in during this session.`);
    }
  }

  // Execution score vs baseline
  if (session.execution_score != null && norms.avg_execution_score != null) {
    const delta = session.execution_score - norms.avg_execution_score;
    if (delta > 5) {
      obs.push(`Execution score ${Math.round(session.execution_score)}% — sharper than your recent average.`);
    } else if (delta < -8) {
      obs.push(`Execution score ${Math.round(session.execution_score)}% — below your recent average of ${Math.round(norms.avg_execution_score)}%.`);
    }
  }

  // RPE
  if (session.rpe != null) {
    if (planned && normType(planned.type) === 'run') {
      const isEasy = planned.name.toLowerCase().includes('easy') || planned.name.toLowerCase().includes('recovery');
      if (isEasy && session.rpe >= 6) {
        obs.push(`Rated effort ${session.rpe}/10 — that's high for what should be an easy session.`);
      } else if (!isEasy && session.rpe <= 4) {
        obs.push(`Rated effort ${session.rpe}/10 — might have gone too easy for this session type.`);
      }
    }
    if (session.feeling) {
      obs.push(`Felt "${session.feeling}" with effort ${session.rpe}/10.`);
    }
  }

  return obs;
}

function observeStrengthSession(
  session: ActualSession,
  norms: BaselineNorms,
): string[] {
  const obs: string[] = [];
  const exercises = session.strength_actual;
  if (!exercises || exercises.length === 0) return obs;

  const rirs = exercises.map(e => e.avg_rir).filter((r): r is number => r != null);
  if (rirs.length > 0) {
    const avgRir = rirs.reduce((a, b) => a + b, 0) / rirs.length;
    if (avgRir < 1.5) {
      obs.push(`Average ${avgRir.toFixed(1)} reps in reserve — pushing close to failure across the board.`);
    } else if (avgRir > 3.5) {
      obs.push(`Average ${avgRir.toFixed(1)} reps in reserve — kept intensity conservative.`);
    } else {
      obs.push(`Average ${avgRir.toFixed(1)} reps in reserve — solid working intensity.`);
    }

    if (norms.avg_rir != null) {
      const delta = avgRir - norms.avg_rir;
      if (delta < -1) {
        obs.push(`That's harder than your recent average (${norms.avg_rir.toFixed(1)} RIR) — intentional or drifting?`);
      }
    }
  }

  // Top exercises summary
  const topLifts = exercises
    .filter(e => e.best_weight > 0)
    .sort((a, b) => b.best_weight - a.best_weight)
    .slice(0, 3);
  if (topLifts.length > 0) {
    const liftStrs = topLifts.map(e => `${e.name} ${e.best_weight}${e.unit} × ${e.best_reps}`);
    obs.push(`Top lifts: ${liftStrs.join(', ')}.`);
  }

  if (session.rpe != null) {
    obs.push(`Rated effort ${session.rpe}/10.`);
  }

  return obs;
}

function normType(t: string): string {
  const s = t.toLowerCase().trim();
  if (s.startsWith('run') || s === 'running') return 'run';
  if (s.startsWith('strength') || s === 'weight_training') return 'strength';
  return s;
}

// ---------------------------------------------------------------------------
// Build session observations from the ledger
// ---------------------------------------------------------------------------

export function buildSessionObservations(
  ledger: LedgerDay[],
  norms: BaselineNorms,
  imperial: boolean,
): SessionObservation[] {
  const observations: SessionObservation[] = [];

  for (const day of ledger) {
    if (!day.is_past && !day.is_today) continue;

    for (const actual of day.actual) {
      const matchedPlanned = day.matches.find(m => m.workout_id === actual.workout_id);
      const planned = matchedPlanned?.planned_id
        ? day.planned.find(p => p.planned_id === matchedPlanned.planned_id)
        : null;

      const type = normType(actual.type);
      let obs: string[];

      if (type === 'strength') {
        obs = observeStrengthSession(actual, norms);
      } else {
        obs = observeEnduranceSession(actual, planned ? { name: planned.name, type: planned.type } : null, norms, imperial);
      }

      if (obs.length > 0) {
        observations.push({
          date: day.date,
          workout_id: actual.workout_id,
          type: actual.type,
          observations: obs,
        });
      }
    }
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Weekly trend rollup — derived FROM session observations
// ---------------------------------------------------------------------------

function makeTrend(
  sessions: ActualSession[],
  extractor: (s: ActualSession) => number | null,
  improving: 'higher' | 'lower',
): TrendSummary {
  const values = sessions.map(extractor).filter((v): v is number => v != null);
  if (values.length < 2) {
    return { trend: 'insufficient', detail: values.length === 0 ? 'no data' : 'only 1 session', based_on_sessions: values.length };
  }

  const first = values.slice(0, Math.ceil(values.length / 2));
  const second = values.slice(Math.ceil(values.length / 2));
  const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
  const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
  const delta = avgSecond - avgFirst;
  const threshold = Math.abs(avgFirst) * 0.05 || 1;

  let trend: TrendSummary['trend'];
  if (improving === 'higher') {
    trend = delta > threshold ? 'improving' : delta < -threshold ? 'declining' : 'stable';
  } else {
    trend = delta < -threshold ? 'improving' : delta > threshold ? 'declining' : 'stable';
  }

  const trendWord = trend === 'improving' ? 'improving' : trend === 'declining' ? 'declining' : 'holding steady';
  return {
    trend,
    detail: `${trendWord} across ${values.length} sessions`,
    based_on_sessions: values.length,
  };
}

export function buildBodyResponse(
  ledger: LedgerDay[],
  norms: BaselineNorms,
  imperial: boolean,
  loadStatus: {
    actual_vs_planned_pct: number | null;
    acwr: number | null;
  },
  crossTraining: {
    interference: boolean;
    detail: string;
  },
): BodyResponse {
  const sessionSignals = buildSessionObservations(ledger, norms, imperial);

  // Collect all actual sessions for trend computation
  const allActual: ActualSession[] = [];
  for (const day of ledger) {
    if (day.is_past || day.is_today) {
      allActual.push(...day.actual);
    }
  }

  const runs = allActual.filter(s => normType(s.type) === 'run');
  const strengthSessions = allActual.filter(s => normType(s.type) === 'strength');

  const runQuality = makeTrend(runs, s => s.execution_score, 'higher');
  const effortPerception = makeTrend(allActual, s => s.rpe, 'lower');
  const cardiac = makeTrend(runs, s => s.decoupling_pct, 'lower');

  const strengthRirs = strengthSessions
    .flatMap(s => (s.strength_actual || []).map(e => e.avg_rir))
    .filter((r): r is number => r != null);
  const strengthTrend: TrendSummary = strengthRirs.length >= 2
    ? makeTrend(strengthSessions, s => {
        const rirs = (s.strength_actual || []).map(e => e.avg_rir).filter((r): r is number => r != null);
        return rirs.length > 0 ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null;
      }, 'higher')
    : { trend: 'insufficient', detail: strengthSessions.length === 0 ? 'no strength sessions' : 'not enough data', based_on_sessions: strengthSessions.length };

  // Load interpretation
  const pct = loadStatus.actual_vs_planned_pct;
  const acwr = loadStatus.acwr;
  let loadStatusLabel: BodyResponse['load_status']['status'] = 'on_target';
  let loadInterp = 'on target';
  if (pct != null) {
    if (pct > 50) { loadStatusLabel = 'high'; loadInterp = 'well ahead of plan for the week'; }
    else if (pct > 15) { loadStatusLabel = 'elevated'; loadInterp = 'a bit ahead of plan'; }
    else if (pct < -20) { loadStatusLabel = 'under'; loadInterp = 'behind the plan so far'; }
  } else if (acwr != null) {
    if (acwr > 1.3) { loadStatusLabel = 'high'; loadInterp = 'training load ramping quickly'; }
    else if (acwr > 1.1) { loadStatusLabel = 'elevated'; loadInterp = 'training load building gradually'; }
    else if (acwr < 0.7) { loadStatusLabel = 'under'; loadInterp = 'training volume is lower than recent weeks'; }
  }

  return {
    session_signals: sessionSignals,
    weekly_trends: {
      run_quality: runQuality,
      effort_perception: effortPerception,
      cardiac,
      strength: strengthTrend,
      cross_training: crossTraining,
    },
    load_status: {
      actual_vs_planned_pct: pct,
      acwr,
      status: loadStatusLabel,
      interpretation: loadInterp,
    },
  };
}
