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

export type WeekPhase = 'recovery' | 'deload' | 'taper' | 'build' | 'peak' | 'baseline' | 'unknown';

export function resolveWeekPhase(weekIntent: string | null | undefined): WeekPhase {
  const s = String(weekIntent || '').toLowerCase().trim();
  if (s === 'recovery' || s === 'deload') return s as WeekPhase;
  if (s === 'taper') return 'taper';
  if (s === 'build') return 'build';
  if (s === 'peak') return 'peak';
  if (s === 'baseline' || s === 'base') return 'baseline';
  return 'unknown';
}

function isEasyPhase(phase: WeekPhase): boolean {
  return phase === 'recovery' || phase === 'deload' || phase === 'taper';
}

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
  phase: WeekPhase = 'unknown',
): string[] {
  const obs: string[] = [];
  const easy = isEasyPhase(phase);

  // HR observation — in recovery/taper, suppress mild elevations
  if (session.avg_hr != null && norms.easy_hr_at_pace != null) {
    const delta = session.avg_hr - norms.easy_hr_at_pace;
    if (Math.abs(delta) >= 3) {
      if (delta > 0) {
        if (easy && delta < 8) {
          obs.push(`HR ${session.avg_hr} bpm — slightly above norm, expected in a ${phase} week.`);
        } else {
          obs.push(`HR ${session.avg_hr} bpm — ${Math.round(delta)} bpm above your norm for this pace.`);
        }
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

  // Execution score vs baseline — suppress in recovery/taper unless severe
  if (session.execution_score != null && norms.avg_execution_score != null) {
    const delta = session.execution_score - norms.avg_execution_score;
    if (delta > 5) {
      obs.push(`Execution score ${Math.round(session.execution_score)}% — sharper than your recent average.`);
    } else if (delta < -8) {
      if (easy && delta > -15) {
        // Suppress mild dip in easy weeks — this is expected
      } else {
        obs.push(`Execution score ${Math.round(session.execution_score)}% — below your recent average of ${Math.round(norms.avg_execution_score)}%.`);
      }
    }
  }

  // RPE
  if (session.rpe != null) {
    if (planned && normType(planned.type) === 'run') {
      const isEasySession = planned.name.toLowerCase().includes('easy') || planned.name.toLowerCase().includes('recovery');
      if (isEasySession && session.rpe >= 6) {
        obs.push(`Rated effort ${session.rpe}/10 — that's high for what should be an easy session.`);
      } else if (!isEasySession && session.rpe <= 4 && !easy) {
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
  phase: WeekPhase = 'unknown',
): string[] {
  const obs: string[] = [];
  const exercises = session.strength_actual;
  if (!exercises || exercises.length === 0) return obs;
  const easy = isEasyPhase(phase);

  // Plan-relative RIR observations (preferred when target_rir is available)
  const withTarget = exercises.filter(e => e.avg_rir != null && e.target_rir != null);

  if (withTarget.length > 0) {
    const avgActual = withTarget.reduce((s, e) => s + e.avg_rir!, 0) / withTarget.length;
    const avgTarget = withTarget.reduce((s, e) => s + e.target_rir!, 0) / withTarget.length;
    const delta = avgActual - avgTarget;

    if (Math.abs(delta) <= (easy ? 1.0 : 0.5)) {
      if (easy) {
        obs.push(`Recovery compliance — averaged ${avgActual.toFixed(1)} RIR against target ${Math.round(avgTarget)}.`);
      } else {
        obs.push(`Hit prescribed intensity — averaged ${avgActual.toFixed(1)} RIR against target ${Math.round(avgTarget)}.`);
      }
    } else if (delta > 1.0) {
      if (easy) {
        obs.push(`Even more conservative than prescribed — ${avgActual.toFixed(1)} RIR vs target ${Math.round(avgTarget)}. Fine for ${phase} week.`);
      } else {
        obs.push(`Left more in the tank than prescribed — ${avgActual.toFixed(1)} RIR vs target ${Math.round(avgTarget)}. Held back or not ready for this load?`);
      }
    } else if (delta < -1.0) {
      if (easy) {
        obs.push(`Pushed harder than prescribed in a ${phase} week — ${avgActual.toFixed(1)} RIR vs target ${Math.round(avgTarget)}. Recovery won't work if you don't back off.`);
      } else {
        obs.push(`Pushed harder than prescribed — ${avgActual.toFixed(1)} RIR vs target ${Math.round(avgTarget)}. Intentional or ego lift?`);
      }
    } else {
      obs.push(`Close to prescribed intensity — ${avgActual.toFixed(1)} RIR vs target ${Math.round(avgTarget)}.`);
    }

    // Per-exercise callouts for notable deviations
    const deviationThreshold = easy ? 2.0 : 1.5;
    for (const ex of withTarget) {
      if (Math.abs(ex.rir_delta!) > deviationThreshold) {
        const dir = ex.rir_delta! > 0 ? 'easier' : 'harder';
        obs.push(`${ex.name}: ${dir} than prescribed (${ex.avg_rir!.toFixed(1)} RIR vs target ${ex.target_rir}).`);
      }
    }
  } else {
    // Absolute fallback for unplanned sessions or missing targets
    const rirs = exercises.map(e => e.avg_rir).filter((r): r is number => r != null);
    if (rirs.length > 0) {
      const avgRir = rirs.reduce((a, b) => a + b, 0) / rirs.length;
      if (avgRir < 1.5 && easy) {
        obs.push(`Average ${avgRir.toFixed(1)} RIR in a ${phase} week — too close to failure for recovery.`);
      } else if (avgRir < 1.5) {
        obs.push(`Average ${avgRir.toFixed(1)} reps in reserve — pushing close to failure.`);
      } else if (avgRir > 3.5 && !easy) {
        obs.push(`Average ${avgRir.toFixed(1)} reps in reserve — conservative intensity.`);
      } else if (avgRir > 3.5 && easy) {
        obs.push(`Average ${avgRir.toFixed(1)} reps in reserve — appropriate for ${phase} week.`);
      } else {
        obs.push(`Average ${avgRir.toFixed(1)} reps in reserve.`);
      }

      if (norms.avg_rir != null && !easy) {
        const normDelta = avgRir - norms.avg_rir;
        if (normDelta < -1) {
          obs.push(`Harder than your recent average (${norms.avg_rir.toFixed(1)} RIR).`);
        }
      }
    }
  }

  // Build-phase drift check: flag RIR creeping up during a build block
  if (phase === 'build' && withTarget.length > 0) {
    const avgDelta = withTarget.reduce((s, e) => s + e.rir_delta!, 0) / withTarget.length;
    if (avgDelta > 1.5) {
      obs.push(`RIR drifting above plan during build phase — are you sandbagging or accumulating fatigue?`);
    }
  }

  // Top exercises with plan comparison when available
  const topLifts = exercises
    .filter(e => e.best_weight > 0)
    .sort((a, b) => b.best_weight - a.best_weight)
    .slice(0, 3);
  if (topLifts.length > 0) {
    const liftStrs = topLifts.map(e => {
      let s = `${e.name} ${e.best_weight}${e.unit} × ${e.best_reps}`;
      if (e.avg_rir != null && e.target_rir != null) {
        s += ` (${e.avg_rir.toFixed(1)} vs ${e.target_rir} RIR)`;
      }
      return s;
    });
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
  if (s.startsWith('ride') || s.startsWith('cycling') || s.startsWith('bike')) return 'ride';
  if (s.startsWith('swim')) return 'swim';
  if (s.startsWith('strength') || s === 'weight_training' || s === 'weights') return 'strength';
  if (s.startsWith('yoga') || s.startsWith('pilates') || s.startsWith('mobility')) return 'mobility';
  return s || 'other';
}

/**
 * How much does this session contribute to running-specific fatigue?
 * 1.0 = full running load; 0.0 = no impact on running readiness.
 */
export function getRunningFatigueWeight(session: {
  type: string;
  name?: string;
}): number {
  const t = normType(session.type);
  const nameLower = (session.name || '').toLowerCase();

  if (t === 'run') return 1.0;

  if (t === 'strength') {
    if (nameLower.includes('upper body') || nameLower.includes('upper-body')) return 0.3;
    if (nameLower.includes('lower body') || nameLower.includes('lower-body') || nameLower.includes('leg')) return 0.7;
    if (nameLower.includes('full body') || nameLower.includes('full-body')) return 0.5;
    return 0.5;
  }

  if (t === 'ride') return 0.6;
  if (t === 'swim') return 0.2;
  if (t === 'mobility') return 0.0;
  return 0.3;
}

// ---------------------------------------------------------------------------
// Build session observations from the ledger
// ---------------------------------------------------------------------------

export function buildSessionObservations(
  ledger: LedgerDay[],
  norms: BaselineNorms,
  imperial: boolean,
  phase: WeekPhase = 'unknown',
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
        obs = observeStrengthSession(actual, norms, phase);
      } else {
        obs = observeEnduranceSession(actual, planned ? { name: planned.name, type: planned.type } : null, norms, imperial, phase);
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
    running_acwr: number | null;
  },
  crossTraining: {
    interference: boolean;
    detail: string;
  },
  weekIntent?: string | null,
): BodyResponse {
  const phase = resolveWeekPhase(weekIntent);
  const easy = isEasyPhase(phase);
  const sessionSignals = buildSessionObservations(ledger, norms, imperial, phase);

  const allActual: ActualSession[] = [];
  const allPlanned: import('./types.ts').PlannedSession[] = [];
  const allMatches: import('./types.ts').SessionMatch[] = [];
  for (const day of ledger) {
    if (day.is_past || day.is_today) {
      allActual.push(...day.actual);
      allPlanned.push(...day.planned);
      allMatches.push(...day.matches);
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

  // Running-weighted week load: discount non-running modalities
  let runningWeightedWeekLoad = 0;
  for (const s of allActual) {
    const w = getRunningFatigueWeight({ type: s.type, name: s.name });
    runningWeightedWeekLoad += (s.load_actual ?? 0) * w;
  }
  runningWeightedWeekLoad = Math.round(runningWeightedWeekLoad);

  // Planned running load (only sessions typed as run)
  const plannedRunningLoad = allPlanned
    .filter(p => normType(p.type) === 'run')
    .reduce((sum, p) => sum + (p.load_planned ?? 0), 0);

  const runningWeightedWeekLoadPct = plannedRunningLoad > 0
    ? Math.round(((runningWeightedWeekLoad - plannedRunningLoad) / plannedRunningLoad) * 100)
    : null;

  // Unplanned sessions: actuals without a matching planned entry
  const unplannedActuals = allActual.filter(a => {
    const match = allMatches.find(m => m.workout_id === a.workout_id);
    return !match || match.planned_id == null;
  });
  let unplannedSummary: string | null = null;
  if (unplannedActuals.length > 0) {
    const grouped = new Map<string, number>();
    for (const u of unplannedActuals) {
      const t = normType(u.type);
      grouped.set(t, (grouped.get(t) || 0) + 1);
    }
    const parts = Array.from(grouped.entries()).map(([t, c]) => `${c} ${t}${c > 1 ? 's' : ''}`);
    unplannedSummary = `${unplannedActuals.length} unplanned: ${parts.join(', ')}`;
  }

  // Load interpretation — ACWR is the actual fatigue signal; % above plan is context.
  // Recovery/deload weeks have tiny planned loads, inflating % — don't cry wolf.
  const rAcwr = loadStatus.running_acwr;
  const runPct = runningWeightedWeekLoadPct;
  let loadStatusLabel: BodyResponse['load_status']['status'] = 'on_target';
  let loadInterp: string;

  if (runPct != null) {
    // Start from % above plan as a baseline signal
    if (runPct > 30) { loadStatusLabel = 'high'; }
    else if (runPct > 15) { loadStatusLabel = 'elevated'; }
    else if (runPct < -20) { loadStatusLabel = 'under'; }

    // ACWR gate: if running ACWR says fatigue is manageable, cap the alarm level.
    // % above plan on a recovery week is noise when ACWR confirms low fatigue.
    if (rAcwr != null && rAcwr < 1.2 && loadStatusLabel === 'high') {
      loadStatusLabel = 'elevated';
    }
    if (rAcwr != null && rAcwr < 1.0 && loadStatusLabel === 'elevated') {
      loadStatusLabel = 'on_target';
    }

    // Phase gate: recovery/deload/taper weeks have intentionally low planned load —
    // excess from low-impact cross-training shouldn't flash red.
    if (easy && rAcwr != null && rAcwr < 1.3 && loadStatusLabel === 'high') {
      loadStatusLabel = 'elevated';
    }

    const pctWord = runPct > 0 ? `${runPct}% above plan` : runPct < 0 ? `${Math.abs(runPct)}% below plan` : 'on target';
    loadInterp = `Running load ${pctWord}`;
    if (rAcwr != null && runPct > 15 && rAcwr < 1.2) {
      loadInterp += ` (ACWR ${rAcwr.toFixed(2)} — manageable)`;
    }
  } else if (rAcwr != null) {
    if (rAcwr > 1.3) { loadStatusLabel = 'high'; loadInterp = 'running load ramping quickly'; }
    else if (rAcwr > 1.1) { loadStatusLabel = 'elevated'; loadInterp = 'running load building gradually'; }
    else if (rAcwr < 0.7) { loadStatusLabel = 'under'; loadInterp = 'running volume lower than recent weeks'; }
    else { loadInterp = 'running load on target'; }
  } else {
    loadInterp = 'insufficient data for running load assessment';
  }

  // Contextualize cross-training
  const nonRunActuals = allActual.filter(s => normType(s.type) !== 'run');
  if (nonRunActuals.length > 0) {
    const byType = new Map<string, number>();
    for (const s of nonRunActuals) {
      const t = normType(s.type);
      byType.set(t, (byType.get(t) || 0) + 1);
    }
    const xParts: string[] = [];
    for (const [t, c] of byType) {
      const w = getRunningFatigueWeight({ type: t });
      const impact = w <= 0.3 ? 'low' : w <= 0.5 ? 'moderate' : 'notable';
      xParts.push(`${c} ${t} (${impact} running impact)`);
    }
    loadInterp += `. Cross-training: ${xParts.join(', ')}`;
  }

  if (unplannedSummary) {
    loadInterp += `. ${unplannedSummary}`;
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
      actual_vs_planned_pct: loadStatus.actual_vs_planned_pct,
      acwr: loadStatus.acwr,
      running_acwr: loadStatus.running_acwr,
      running_weighted_week_load: runningWeightedWeekLoad,
      running_weighted_week_load_pct: runningWeightedWeekLoadPct,
      unplanned_summary: unplannedSummary,
      status: loadStatusLabel,
      interpretation: loadInterp,
    },
  };
}
