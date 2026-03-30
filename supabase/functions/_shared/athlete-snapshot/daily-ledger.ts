// =============================================================================
// DAILY LEDGER — The factual spine of the Athlete Snapshot
// =============================================================================
// Pure deterministic logic. No LLM, no heuristics beyond the matching taxonomy.
// For each day: what was planned, what happened, and how they compare.
// =============================================================================

import type {
  LedgerDay,
  PlannedSession,
  ActualSession,
  SessionMatch,
  EnduranceMatchQuality,
  StrengthMatchQuality,
  StrengthExerciseActual,
  StrengthExercisePrescription,
} from './types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dayName(dateStr: string, tz?: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { weekday: 'long', ...(tz ? { timeZone: tz } : {}) });
  } catch {
    return dateStr;
  }
}

function normType(t: string | null | undefined): string {
  const s = String(t || '').toLowerCase().trim();
  if (s.startsWith('run') || s === 'running') return 'run';
  if (s.startsWith('ride') || s.startsWith('cycling') || s.startsWith('bike')) return 'ride';
  if (s.startsWith('swim')) return 'swim';
  if (s.startsWith('strength') || s === 'weight_training' || s === 'weights') return 'strength';
  if (s.startsWith('yoga') || s.startsWith('pilates') || s.startsWith('mobility')) return 'mobility';
  return s || 'other';
}

function metersToMi(m: number): number { return m / 1609.34; }
function secToMin(s: number): number { return Math.round(s / 60); }

/** Most common value in an array of numbers (for uniform prescription targets). */
function modalValue(nums: number[]): number {
  const freq = new Map<number, number>();
  for (const n of nums) freq.set(n, (freq.get(n) || 0) + 1);
  let best = nums[0];
  let bestCount = 0;
  for (const [val, count] of freq) {
    if (count > bestCount) { best = val; bestCount = count; }
  }
  return best;
}

function paceStr(distMeters: number, durSeconds: number, imperial: boolean): string | null {
  if (distMeters <= 0 || durSeconds <= 0) return null;
  const miles = distMeters / 1609.34;
  const km = distMeters / 1000;
  const perUnit = imperial ? durSeconds / miles : durSeconds / km;
  const min = Math.floor(perUnit / 60);
  const sec = Math.round(perUnit % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/${imperial ? 'mi' : 'km'}`;
}

/**
 * Execution score for ActualSession — do NOT use `a || b` (0 is valid and must not fall through).
 * Prefer performance.execution_adherence (running/cycling analysis), then glance, then legacy fields.
 */
function pickExecutionScoreFromWorkoutRow(analysis: Record<string, unknown>, computed: Record<string, unknown>): number | null {
  const perf = (analysis as any).performance;
  if (Number.isFinite(perf?.execution_adherence)) {
    return Math.round(Number(perf.execution_adherence));
  }
  const glance = (analysis as any).session_state_v1?.glance?.execution_score;
  if (Number.isFinite(glance)) {
    return Math.round(Number(glance));
  }
  const top = (analysis as any).execution_score;
  if (top != null && top !== '' && Number.isFinite(Number(top))) {
    return Math.round(Number(top));
  }
  const comp = (computed as any).execution_score;
  if (comp != null && comp !== '' && Number.isFinite(Number(comp))) {
    return Math.round(Number(comp));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Build PlannedSession from a planned_workouts DB row
// ---------------------------------------------------------------------------

export function buildPlannedSession(row: any, imperial: boolean): PlannedSession {
  const durSec = Number(row?.total_duration_seconds) || null;
  const computed = typeof row?.computed === 'object' ? row.computed : {};
  const distM = Number(computed?.total_distance_meters) || Number(computed?.distance_meters) || null;

  const isStrength = normType(row?.type) === 'strength';
  const unitLabel = imperial ? 'lbs' : 'kg';

  // --- Structured strength prescription from planned_workouts.strength_exercises ---
  let strengthRx: StrengthExercisePrescription[] | null = null;
  const rawExercises = parseStrengthExercisesField(row?.strength_exercises);

  if (isStrength && rawExercises.length > 0) {
    strengthRx = rawExercises.slice(0, 10).map((ex: any) => {
      const numSets = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 0);
      const reps = String(ex.reps ?? '');
      const weight = typeof ex.weight === 'number' ? ex.weight : null;
      const rir = typeof ex.target_rir === 'number' ? ex.target_rir
        : (typeof ex.rir === 'number' ? ex.rir : null);
      return {
        exercise: String(ex.name || ''),
        sets: numSets,
        reps,
        target_weight: weight,
        target_rir: rir,
        notes: ex.notes ? String(ex.notes) : null,
      };
    });
  }

  // Fallback: parse description text for legacy rows without structured exercises
  if (isStrength && !strengthRx && row?.description) {
    try {
      const lines = String(row.description).split('\n').filter(Boolean);
      strengthRx = lines.slice(0, 8).map(line => {
        const name = line.replace(/^\d+[\.\)]\s*/, '').split(':')[0]?.trim() || line.trim();
        const setsMatch = line.match(/(\d+)\s*x\s*(\d+)/i);
        const weightMatch = line.match(/([\d.]+)\s*(?:lbs?|kg)/i);
        return {
          exercise: name,
          sets: setsMatch ? parseInt(setsMatch[1]) : 0,
          reps: setsMatch ? setsMatch[2] : '',
          target_weight: weightMatch ? parseFloat(weightMatch[1]) : null,
          target_rir: null,
          notes: null,
        };
      });
    } catch { /* non-critical */ }
  }

  // --- Build human-readable prescription string ---
  const prescriptionParts: string[] = [];
  if (row?.name) prescriptionParts.push(String(row.name));
  if (durSec) prescriptionParts.push(`${secToMin(durSec)} min`);
  if (distM && distM > 0) {
    prescriptionParts.push(imperial ? `${metersToMi(distM).toFixed(1)} mi` : `${(distM / 1000).toFixed(1)} km`);
  }

  if (isStrength && strengthRx && strengthRx.length > 0) {
    for (const ex of strengthRx.slice(0, 6)) {
      const parts = [ex.exercise];
      if (ex.sets > 0 && ex.reps) parts.push(`${ex.sets}x${ex.reps}`);
      if (ex.target_weight) parts.push(`@ ${ex.target_weight}${unitLabel}`);
      if (ex.target_rir != null) parts.push(`RIR ${ex.target_rir}`);
      prescriptionParts.push(parts.join(' '));
    }
  } else if (isStrength && row?.description) {
    const desc = String(row.description).slice(0, 300);
    if (desc) prescriptionParts.push(desc);
  } else if (row?.rendered_description) {
    const desc = String(row.rendered_description).slice(0, 120);
    if (desc && !prescriptionParts.some(p => desc.includes(p))) {
      prescriptionParts.push(desc);
    }
  }

  return {
    planned_id: String(row?.id || ''),
    type: normType(row?.type),
    name: String(row?.name || row?.type || ''),
    prescription: prescriptionParts.join(', ') || String(row?.type || ''),
    duration_seconds: durSec,
    distance_meters: distM,
    load_planned: Number(row?.workload_planned) || null,
    strength_prescription: strengthRx,
  };
}

function parseStrengthExercisesField(raw: unknown): any[] {
  if (Array.isArray(raw) && raw.length > 0) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Build ActualSession from a workouts DB row
// ---------------------------------------------------------------------------

export function buildActualSession(row: any, imperial: boolean): ActualSession {
  const durRaw = Number(row?.moving_time) || Number(row?.duration) || null;
  const durSec = durRaw != null ? (durRaw < 1000 ? Math.round(durRaw * 60) : Math.round(durRaw)) : null;
  const distKm = Number(row?.distance) || null;
  const distM = distKm != null ? Math.round(distKm * 1000) : null;
  const avgHr = Number(row?.avg_hr) || Number(row?.average_heartrate) || null;
  const analysis = typeof row?.workout_analysis === 'object' ? row.workout_analysis : {};
  const computed = typeof row?.computed === 'object' ? row.computed : {};

  let strengthActual: StrengthExerciseActual[] | null = null;
  const exRaw = row?.strength_exercises;
  if (exRaw) {
    const arr = Array.isArray(exRaw) ? exRaw : [];
    if (arr.length > 0) {
      strengthActual = arr.map((ex: any) => {
        const sets = Array.isArray(ex?.sets) ? ex.sets : [];
        const weights = sets.map((s: any) => Number(s?.weight) || 0).filter((w: number) => w > 0);
        const reps = sets.map((s: any) => Number(s?.reps) || 0).filter((r: number) => r > 0);
        const rirs = sets.map((s: any) => Number(s?.rir)).filter((r: number) => Number.isFinite(r));
        const avgRir = rirs.length ? Math.round((rirs.reduce((a: number, b: number) => a + b, 0) / rirs.length) * 10) / 10 : null;

        // Extract target_rir: prefer per-set target_rir (seeded from prescription), fall back to exercise-level
        const targetRirs = sets.map((s: any) => Number(s?.target_rir)).filter((r: number) => Number.isFinite(r));
        let targetRir: number | null = null;
        if (targetRirs.length > 0) {
          targetRir = modalValue(targetRirs);
        } else if (typeof ex?.target_rir === 'number') {
          targetRir = ex.target_rir;
        } else if (typeof ex?.rir === 'number') {
          targetRir = ex.rir;
        }

        const rirDelta = (avgRir != null && targetRir != null) ? Math.round((avgRir - targetRir) * 10) / 10 : null;

        return {
          name: String(ex?.name || ex?.exercise || ''),
          sets: sets.length,
          best_weight: weights.length ? Math.max(...weights) : 0,
          best_reps: reps.length ? Math.max(...reps) : 0,
          avg_rir: avgRir,
          target_rir: targetRir,
          rir_delta: rirDelta,
          unit: imperial ? 'lbs' as const : 'kg' as const,
        };
      }).filter((e: StrengthExerciseActual) => e.name);
    }
  }

  const provider = String(row?.provider || row?.source || '').toLowerCase();
  const source: ActualSession['source'] = provider.includes('strava') ? 'strava'
    : provider.includes('garmin') ? 'garmin' : 'manual';

  return {
    workout_id: String(row?.id || ''),
    type: normType(row?.type),
    name: String(row?.name || row?.type || ''),
    source,
    duration_seconds: durSec,
    distance_meters: distM,
    pace: (distM && durSec) ? paceStr(distM, durSec, imperial) : null,
    avg_hr: avgHr,
    load_actual: Number(row?.workload_actual) || null,
    rpe: Number(row?.session_rpe) || Number(row?.rpe) || null,
    feeling: row?.feeling ? String(row.feeling) : null,
    execution_score: pickExecutionScoreFromWorkoutRow(analysis as Record<string, unknown>, computed as Record<string, unknown>),
    decoupling_pct: Number(analysis?.decoupling_pct) || Number(computed?.decoupling_pct) || null,
    strength_actual: strengthActual,
  };
}

// ---------------------------------------------------------------------------
// Match Quality: Endurance
// ---------------------------------------------------------------------------

function enduranceMatchQuality(planned: PlannedSession, actual: ActualSession): EnduranceMatchQuality {
  const pDur = planned.duration_seconds;
  const aDur = actual.duration_seconds;
  const pDist = planned.distance_meters;
  const aDist = actual.distance_meters;

  // Use distance as primary comparison if both available, else duration
  if (pDist && pDist > 0 && aDist && aDist > 0) {
    const ratio = aDist / pDist;
    if (ratio < 0.70) return 'shorter';
    if (ratio > 1.30) return 'longer';
    if (ratio >= 0.85 && ratio <= 1.15) return 'followed';
    return ratio < 1 ? 'shorter' : 'longer';
  }

  if (pDur && pDur > 0 && aDur && aDur > 0) {
    const ratio = aDur / pDur;
    if (ratio < 0.70) return 'shorter';
    if (ratio > 1.30) return 'longer';
    if (ratio >= 0.85 && ratio <= 1.15) return 'followed';
    return ratio < 1 ? 'shorter' : 'longer';
  }

  // Can't compare meaningfully — call it followed if types match
  return 'followed';
}

// ---------------------------------------------------------------------------
// Match Quality: Strength
// ---------------------------------------------------------------------------

function strengthMatchQuality(planned: PlannedSession, actual: ActualSession): StrengthMatchQuality {
  const exercises = actual.strength_actual;
  if (!exercises || exercises.length === 0) return 'followed';

  const withTarget = exercises.filter(e => e.avg_rir != null && e.target_rir != null);

  // Plan-relative path: compare actual RIR against prescribed RIR
  if (withTarget.length > 0) {
    const avgDelta = withTarget.reduce((s, e) => s + e.rir_delta!, 0) / withTarget.length;
    if (Math.abs(avgDelta) <= 0.5) return 'on_target';
    if (avgDelta > 1.0) return 'under_intensity';
    if (avgDelta < -1.0) return 'over_intensity';
    return 'on_target';
  }

  // Absolute fallback for unplanned sessions or missing targets
  const rirs = exercises.map(e => e.avg_rir).filter((r): r is number => r != null);
  if (rirs.length > 0) {
    const mean = rirs.reduce((a, b) => a + b, 0) / rirs.length;
    if (mean < 1.5) return 'pushed_hard';
    if (mean > 3.5) return 'dialed_back';
  }

  return 'followed';
}

// ---------------------------------------------------------------------------
// Match Summary (human-readable one-liner)
// ---------------------------------------------------------------------------

function matchSummary(
  planned: PlannedSession | null,
  actual: ActualSession | null,
  eQ: EnduranceMatchQuality | null,
  sQ: StrengthMatchQuality | null,
  imperial: boolean,
): string {
  if (!planned && actual) return 'unplanned session';
  if (planned && !actual) return 'not done';

  if (!planned || !actual) return '';

  const type = normType(planned.type);

  if (type === 'strength') {
    const parts: string[] = ['completed'];
    if (sQ === 'on_target') parts.push('hit prescribed intensity');
    else if (sQ === 'under_intensity') parts.push('held back vs plan (higher RIR than prescribed)');
    else if (sQ === 'over_intensity') parts.push('pushed harder than plan (lower RIR than prescribed)');
    else if (sQ === 'pushed_hard') parts.push('pushing hard (low RIR, no plan target)');
    else if (sQ === 'dialed_back') parts.push('conservative intensity (high RIR, no plan target)');
    else if (sQ === 'modified') parts.push('modified from plan');

    const lifts = actual.strength_actual;
    if (lifts && lifts.length > 0) {
      const liftSummary = lifts.slice(0, 4).map(l => {
        const rirPart = l.avg_rir != null && l.target_rir != null
          ? ` @ ${l.avg_rir.toFixed(1)} RIR (target ${l.target_rir})`
          : l.avg_rir != null ? ` @ ~${l.avg_rir.toFixed(1)} RIR` : '';
        return `${l.name}: ${l.best_weight}${l.unit} x${l.best_reps}${rirPart}`;
      }).join(', ');
      parts.push(liftSummary);
    }
    return parts.join(' — ');
  }

  // Endurance: show distance or duration comparison
  const pDist = planned.distance_meters;
  const aDist = actual.distance_meters;
  if (pDist && pDist > 0 && aDist && aDist > 0) {
    const pVal = imperial ? metersToMi(pDist).toFixed(1) : (pDist / 1000).toFixed(1);
    const aVal = imperial ? metersToMi(aDist).toFixed(1) : (aDist / 1000).toFixed(1);
    const unit = imperial ? 'mi' : 'km';
    const pct = Math.round((aDist / pDist) * 100);
    return `${aVal} of ${pVal} ${unit} planned (${pct}%)`;
  }

  const pDur = planned.duration_seconds;
  const aDur = actual.duration_seconds;
  if (pDur && pDur > 0 && aDur && aDur > 0) {
    const pMin = secToMin(pDur);
    const aMin = secToMin(aDur);
    const pct = Math.round((aDur / pDur) * 100);
    return `${aMin} of ${pMin} min planned (${pct}%)`;
  }

  if (eQ === 'followed') return 'completed as planned';
  if (eQ === 'shorter') return 'completed — shorter than planned';
  if (eQ === 'longer') return 'completed — longer than planned';
  return 'completed';
}

// ---------------------------------------------------------------------------
// Soft Match: pair workouts to planned sessions by date + type
// ---------------------------------------------------------------------------

type PairedResult = {
  planned: PlannedSession | null;
  actual: ActualSession | null;
  match: SessionMatch;
};

function softMatch(
  planned: PlannedSession[],
  actual: ActualSession[],
  imperial: boolean,
): PairedResult[] {
  const results: PairedResult[] = [];
  const usedPlanned = new Set<string>();
  const usedActual = new Set<string>();

  // Pass 1: match by type (1:1 when there's exactly one of each type)
  const plannedByType = new Map<string, PlannedSession[]>();
  for (const p of planned) {
    const t = normType(p.type);
    if (!plannedByType.has(t)) plannedByType.set(t, []);
    plannedByType.get(t)!.push(p);
  }

  const actualByType = new Map<string, ActualSession[]>();
  for (const a of actual) {
    const t = normType(a.type);
    if (!actualByType.has(t)) actualByType.set(t, []);
    actualByType.get(t)!.push(a);
  }

  for (const [type, pList] of plannedByType) {
    const aList = actualByType.get(type) || [];
    if (pList.length === 1 && aList.length === 1) {
      const p = pList[0];
      const a = aList[0];
      const isStrength = type === 'strength' || type === 'mobility';
      const eQ = isStrength ? null : enduranceMatchQuality(p, a);
      const sQ = isStrength ? strengthMatchQuality(p, a) : null;
      results.push({
        planned: p,
        actual: a,
        match: {
          planned_id: p.planned_id,
          workout_id: a.workout_id,
          endurance_quality: eQ,
          strength_quality: sQ,
          summary: matchSummary(p, a, eQ, sQ, imperial),
        },
      });
      usedPlanned.add(p.planned_id);
      usedActual.add(a.workout_id);
    }
  }

  // Pass 2: match remaining by type (multiple of same type — pair in order)
  for (const [type, pList] of plannedByType) {
    const aList = (actualByType.get(type) || []).filter(a => !usedActual.has(a.workout_id));
    const remaining = pList.filter(p => !usedPlanned.has(p.planned_id));
    for (let i = 0; i < remaining.length && i < aList.length; i++) {
      const p = remaining[i];
      const a = aList[i];
      const isStrength = type === 'strength' || type === 'mobility';
      const eQ = isStrength ? null : enduranceMatchQuality(p, a);
      const sQ = isStrength ? strengthMatchQuality(p, a) : null;
      results.push({
        planned: p,
        actual: a,
        match: {
          planned_id: p.planned_id,
          workout_id: a.workout_id,
          endurance_quality: eQ,
          strength_quality: sQ,
          summary: matchSummary(p, a, eQ, sQ, imperial),
        },
      });
      usedPlanned.add(p.planned_id);
      usedActual.add(a.workout_id);
    }
  }

  // Pass 3: unmatched planned = skipped (only for past days — caller handles this)
  for (const p of planned) {
    if (usedPlanned.has(p.planned_id)) continue;
    results.push({
      planned: p,
      actual: null,
      match: {
        planned_id: p.planned_id,
        workout_id: null,
        endurance_quality: 'skipped',
        strength_quality: normType(p.type) === 'strength' ? 'skipped' : null,
        summary: 'not done',
      },
    });
  }

  // Pass 4: unmatched actual = unplanned
  for (const a of actual) {
    if (usedActual.has(a.workout_id)) continue;
    results.push({
      planned: null,
      actual: a,
      match: {
        planned_id: null,
        workout_id: a.workout_id,
        endurance_quality: 'unplanned',
        strength_quality: normType(a.type) === 'strength' ? 'unplanned' : null,
        summary: 'unplanned session',
      },
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Actual pool for a calendar day (planned_id-aware cross-day attach)
// ---------------------------------------------------------------------------
// If a completed workout has planned_id pointing to a planned row on another
// date (e.g. Tuesday intervals done Friday), it must match on the PLANNED
// day, not only on the activity date — otherwise coach/snapshot shows "skipped"
// and Friday can double-count runs.

function workoutLocalDate(w: any): string {
  return String(w?.__local_date || w?.date || '').slice(0, 10);
}

function isWorkoutCompleted(w: any): boolean {
  return String(w?.workout_status || '').toLowerCase() === 'completed';
}

function buildActualPoolForDay(
  cursor: string,
  rawPlannedOnDay: any[],
  workoutRows: any[],
  plannedDateById: Map<string, string>,
  weekStartDate: string,
  weekEndDate: string,
): any[] {
  const pool = new Map<string, any>();

  // 1) Hard-linked: any completed workout in week whose planned_id matches a plan ON this day
  for (const p of rawPlannedOnDay) {
    const pid = String(p?.id || '');
    if (!pid) continue;
    for (const w of workoutRows) {
      if (!isWorkoutCompleted(w)) continue;
      const wd = workoutLocalDate(w);
      if (wd < weekStartDate || wd > weekEndDate) continue;
      if (String(w?.planned_id || '') === pid) {
        pool.set(String(w.id), w);
        break;
      }
    }
  }

  // 2) Same calendar day: include only if not "claimed" by a plan on a different day
  for (const w of workoutRows) {
    if (!isWorkoutCompleted(w)) continue;
    if (workoutLocalDate(w) !== cursor) continue;
    const linkPid = w?.planned_id != null ? String(w.planned_id) : '';
    if (linkPid) {
      const planDay = plannedDateById.get(linkPid);
      if (planDay && planDay !== cursor) continue;
    }
    pool.set(String(w.id), w);
  }

  return [...pool.values()];
}

// ---------------------------------------------------------------------------
// Public: Build the full daily ledger for a week
// ---------------------------------------------------------------------------

export type LedgerInput = {
  weekStartDate: string;
  weekEndDate: string;
  asOfDate: string;
  plannedRows: any[];
  workoutRows: any[];
  imperial: boolean;
  userTz?: string;
};

export function buildDailyLedger(input: LedgerInput): LedgerDay[] {
  const { weekStartDate, weekEndDate, asOfDate, plannedRows, workoutRows, imperial, userTz } = input;

  const plannedDateById = new Map<string, string>();
  for (const r of plannedRows) {
    const id = String(r?.id || '');
    const d = String(r?.date || '').slice(0, 10);
    if (id) plannedDateById.set(id, d);
  }

  // Group planned + actual by date
  const plannedByDate = new Map<string, any[]>();
  for (const r of plannedRows) {
    const d = String(r?.date || '').slice(0, 10);
    if (!plannedByDate.has(d)) plannedByDate.set(d, []);
    plannedByDate.get(d)!.push(r);
  }

  const actualByDate = new Map<string, any[]>();
  for (const w of workoutRows) {
    const d = workoutLocalDate(w);
    if (d < weekStartDate || d > weekEndDate) continue;
    if (!actualByDate.has(d)) actualByDate.set(d, []);
    actualByDate.get(d)!.push(w);
  }

  // Generate one LedgerDay per day in the week
  const days: LedgerDay[] = [];
  let cursor = weekStartDate;
  while (cursor <= weekEndDate) {
    const isToday = cursor === asOfDate;
    const isPast = cursor < asOfDate;

    const rawPlanned = (plannedByDate.get(cursor) || []);
    const rawActual = buildActualPoolForDay(cursor, rawPlanned, workoutRows, plannedDateById, weekStartDate, weekEndDate);

    const planned = rawPlanned.map((r: any) => buildPlannedSession(r, imperial));
    const actual = rawActual.map((w: any) => buildActualSession(w, imperial));

    const paired = softMatch(planned, actual, imperial);

    // For today + future: don't mark unmatched planned as "skipped" — they're upcoming
    const matches: SessionMatch[] = paired.map(p => {
      if (!isPast && p.actual === null && p.planned !== null) {
        return {
          ...p.match,
          endurance_quality: null,
          strength_quality: null,
          summary: isToday ? 'today — not done yet' : 'upcoming',
        };
      }
      return p.match;
    });

    days.push({
      date: cursor,
      day_name: dayName(cursor, userTz),
      is_today: isToday,
      is_past: isPast,
      planned,
      actual,
      matches,
    });

    // Advance date
    const next = new Date(cursor + 'T12:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }

  return days;
}
