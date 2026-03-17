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

function paceStr(distMeters: number, durSeconds: number, imperial: boolean): string | null {
  if (distMeters <= 0 || durSeconds <= 0) return null;
  const miles = distMeters / 1609.34;
  const km = distMeters / 1000;
  const perUnit = imperial ? durSeconds / miles : durSeconds / km;
  const min = Math.floor(perUnit / 60);
  const sec = Math.round(perUnit % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/${imperial ? 'mi' : 'km'}`;
}

// ---------------------------------------------------------------------------
// Build PlannedSession from a planned_workouts DB row
// ---------------------------------------------------------------------------

export function buildPlannedSession(row: any, imperial: boolean): PlannedSession {
  const durSec = Number(row?.total_duration_seconds) || null;
  const computed = typeof row?.computed === 'object' ? row.computed : {};
  const distM = Number(computed?.total_distance_meters) || Number(computed?.distance_meters) || null;

  const prescriptionParts: string[] = [];
  if (row?.name) prescriptionParts.push(String(row.name));
  if (durSec) prescriptionParts.push(`${secToMin(durSec)} min`);
  if (distM && distM > 0) {
    prescriptionParts.push(imperial ? `${metersToMi(distM).toFixed(1)} mi` : `${(distM / 1000).toFixed(1)} km`);
  }
  if (row?.rendered_description) {
    const desc = String(row.rendered_description).slice(0, 120);
    if (desc && !prescriptionParts.some(p => desc.includes(p))) {
      prescriptionParts.push(desc);
    }
  }

  let strengthRx: PlannedSession['strength_prescription'] = null;
  if (normType(row?.type) === 'strength' && row?.description) {
    try {
      const lines = String(row.description).split('\n').filter(Boolean);
      strengthRx = lines.slice(0, 8).map(line => ({
        exercise: line.replace(/^\d+[\.\)]\s*/, '').split(':')[0]?.trim() || line.trim(),
        sets: 0, reps: '', notes: null,
      }));
    } catch { /* non-critical */ }
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
        return {
          name: String(ex?.name || ex?.exercise || ''),
          sets: sets.length,
          best_weight: weights.length ? Math.max(...weights) : 0,
          best_reps: reps.length ? Math.max(...reps) : 0,
          avg_rir: rirs.length ? Math.round((rirs.reduce((a: number, b: number) => a + b, 0) / rirs.length) * 10) / 10 : null,
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
    execution_score: Number(analysis?.execution_score) || Number(computed?.execution_score) || null,
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

  const avgRir = exercises
    .map(e => e.avg_rir)
    .filter((r): r is number => r != null);

  if (avgRir.length > 0) {
    const mean = avgRir.reduce((a, b) => a + b, 0) / avgRir.length;
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
    if (sQ === 'pushed_hard') return 'completed — pushing hard (low RIR)';
    if (sQ === 'dialed_back') return 'completed — dialed back (high RIR)';
    if (sQ === 'modified') return 'completed — modified from plan';
    return 'completed';
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

  // Group planned + actual by date
  const plannedByDate = new Map<string, any[]>();
  for (const r of plannedRows) {
    const d = String(r?.date || '').slice(0, 10);
    if (!plannedByDate.has(d)) plannedByDate.set(d, []);
    plannedByDate.get(d)!.push(r);
  }

  const actualByDate = new Map<string, any[]>();
  for (const w of workoutRows) {
    const d = String(w?.__local_date || w?.date || '').slice(0, 10);
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
    const rawActual = (actualByDate.get(cursor) || [])
      .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed');

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
