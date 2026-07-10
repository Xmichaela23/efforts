// b2 (Q-149) — strength 7-day session-type breakdown. The plan-primary mirror of coach's
// run_session_types_7d / ride_session_types_7d: for a STRENGTH-primary athlete, the "key session"
// execution read is their lifts, graded by the strength analyzer's own verdict — NOT run pace.
//
// Law-5 (born on the spine, no parallel authority): this is a RENDERER of the strength analyzer's
// per-session verdict, not a new grading formula. The execution score is read verbatim from
// `workout_analysis.session_state_v1.glance.execution_score`, which `analyze-strength-workout`
// writes from `execution_summary.overall_execution` and sets to NULL for 1RM tests
// (analyze-strength-workout/index.ts:2777) — so test-exclusion is done at the source, not re-derived here.
//
// Law-1 (one classifier): the lower/upper/full split routes through the SAME shared
// classifyStrengthFocus the carryover cards + coach's strengthFocusFromWorkout use.

import { classifyStrengthFocus, type StrengthFocus } from './cross-domain-carryover.ts';

/** Mirror of RunSessionType7d / RideSessionType7d (coach/types.ts) for strength. */
export type StrengthSessionType7d = {
  type: StrengthFocus; // 'lower' | 'upper' | 'full' | 'unknown'
  type_label: string;
  sample_size: number;
  /** Mean of the strength analyzer's overall_execution (0..100) across graded (non-test) sessions. Null = no graded data. */
  avg_execution_score: number | null;
  efficiency_label: string | null;
  efficiency_tone: 'positive' | 'warning' | 'danger' | 'neutral';
  /** The "why" — the component that cost the most execution points on the most recent graded session (glass-box). */
  primary_mover: string | null;
  /** 1RM/baseline tests seen in the window — surfaced for honesty (excluded from avg_execution_score), never hidden. */
  test_count: number;
};

const STRENGTH_TYPE_LABELS: Record<StrengthFocus, string> = {
  lower: 'Lower Body',
  upper: 'Upper Body',
  full: 'Full Body',
  unknown: 'Strength',
};

const STRENGTH_TYPES: StrengthFocus[] = ['lower', 'upper', 'full', 'unknown'];

// Self-contained (shared module — no coach-local helpers).
function parseJson(v: any): any {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return null;
}
function safeNum(v: any): number | null {
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN);
  return Number.isFinite(n) ? n : null;
}
function isStrengthType(t: string): boolean {
  const s = t.toLowerCase();
  return s === 'strength' || s === 'strength_training';
}

/** Focus of a strength session — same authority as coach's strengthFocusFromWorkout closure (classifyStrengthFocus
 *  on exercise names; name-string fallback only when the exercise list is empty). Exported so the fixture pins it. */
export function strengthFocusFromWorkout(wAny: any): StrengthFocus {
  try {
    const exRaw = (wAny as any)?.strength_exercises;
    const exercises = Array.isArray(exRaw) ? exRaw : (typeof exRaw === 'string' ? (parseJson(exRaw) || []) : []);
    if (!Array.isArray(exercises) || exercises.length === 0) {
      const name = String((wAny as any)?.name || '').toLowerCase();
      if (/upper|push|pull|chest|back|shoulder|arm|bench|row|press(?!.*leg)/i.test(name)) return 'upper';
      if (/lower|leg|squat|deadlift|lunge|hip|glute|calf/i.test(name)) return 'lower';
      if (/full|total/i.test(name)) return 'full';
      return 'unknown';
    }
    return classifyStrengthFocus(exercises.map((e: any) => String(e?.name || '')));
  } catch {
    return 'unknown';
  }
}

/** execution_score (0..100) → tone band, aligned with the run/ride interval-execution branch (>=85 / >=70). */
function execTone(score: number | null): StrengthSessionType7d['efficiency_tone'] {
  if (score == null) return 'neutral';
  if (score >= 85) return 'positive';
  if (score >= 70) return 'warning';
  return 'danger';
}

/**
 * Build the strength session-type breakdown from a 7-day (or any) window of workouts.
 * Reads ONLY the strength analyzer's persisted verdict — no re-grading. Honest-abstain by construction:
 * a session with no execution_score (test, or un-analyzed) contributes to sample_size/test_count but not the mean.
 */
export function buildStrengthSessionTypes7d(workouts: any[]): StrengthSessionType7d[] {
  const agg: Record<StrengthFocus, { n: number; exec: number[]; movers: Array<{ date: string; mover: string }>; tests: number }> = {
    lower: { n: 0, exec: [], movers: [], tests: 0 },
    upper: { n: 0, exec: [], movers: [], tests: 0 },
    full: { n: 0, exec: [], movers: [], tests: 0 },
    unknown: { n: 0, exec: [], movers: [], tests: 0 },
  };

  for (const w of Array.isArray(workouts) ? workouts : []) {
    if (String((w as any)?.workout_status || '').toLowerCase() !== 'completed') continue;
    if (!isStrengthType(String((w as any)?.type || ''))) continue;

    const focus = strengthFocusFromWorkout(w);
    agg[focus].n += 1;

    const wa = parseJson((w as any)?.workout_analysis) || {};
    const ssv = wa?.session_state_v1 || {};
    const glance = ssv?.glance || {};

    // is_test is already reflected as execution_score === null at the source; count it for glass-box honesty.
    if (ssv?.is_test === true || glance?.status_label === '1RM Test') {
      agg[focus].tests += 1;
      continue;
    }

    const ex = safeNum(glance?.execution_score);
    if (ex != null) {
      agg[focus].exec.push(ex);
      const mover = ssv?.details?.execution_summary?.component_attribution?.primary_mover
        ?? wa?.detailed_analysis?.execution_summary?.component_attribution?.primary_mover
        ?? null;
      if (mover) agg[focus].movers.push({ date: String((w as any)?.date || ''), mover: String(mover) });
    }
  }

  return STRENGTH_TYPES
    .filter((k) => agg[k].n > 0)
    .map((k) => {
      const arr = agg[k].exec;
      const avg = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
      // primary_mover = the mover on the most recent graded session (glass-box "why", not a blended average).
      const latestMover = agg[k].movers.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.mover ?? null;
      return {
        type: k,
        type_label: STRENGTH_TYPE_LABELS[k],
        sample_size: agg[k].n,
        avg_execution_score: avg,
        efficiency_label: avg != null
          ? (avg >= 85 ? 'Strong execution' : avg >= 70 ? 'Solid execution' : 'Needs adjustment')
          : (agg[k].tests > 0 ? 'Test — not graded' : null),
        efficiency_tone: execTone(avg),
        primary_mover: latestMover,
        test_count: agg[k].tests,
      };
    })
    .sort((a, b) => b.sample_size - a.sample_size);
}
