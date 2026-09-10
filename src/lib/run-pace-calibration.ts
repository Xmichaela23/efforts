// =============================================================================
// run-pace-calibration — "do we have a pace to build on, and if not, get one"
// =============================================================================
//
// ⛔ THE PHONE SENDS THE TWO TYPED PACES; THE SERVER DERIVES AND SAVES (2026-09-10).
// This file used to turn the typed 5K pace into a 5K clock, score it with a phone copy of the VDOT
// tables (`effort-score.ts`), and upsert the `effort_*` columns itself. `save-baselines` now does all of
// that with the plan builder's own formula (`generate-run-plan/effort-score.ts`), and the Goals card's
// "derived training zones" preview asks the same function with `preview: true`.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TrainingPaces } from './effort-score';

/** A `user_baselines` row as the builder reads it. */
export type PaceBenchmarkRow = {
  effort_score?: number | null;
  effort_source_distance?: number | null;
  effort_source_time?: number | null;
  effort_paces?: { race?: number | null } | null;
  learned_fitness?: Record<string, unknown> | null;
} | null | undefined;

// ⛔ `hasPaceBenchmark` STOOD HERE AND IS DELETED (2026-09-10, audit item 20). It was the phone's copy of
// the create-goal speed gate and read learned paces as plain numbers, so a learned pace never counted.
// The one rule is `supabase/functions/_shared/pace-benchmark.ts`; the builder prints get-arc-context's
// `builder.has_pace_benchmark`.

/** `mm:ss` → seconds. Returns null on anything else; an unparseable pace is not a zero pace. */
export function parsePaceInput(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return sec > 0 ? sec : null;
}

/** seconds → `m:ss`. */
export function formatPaceInput(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export type CalibrationInput = { easyPace: string; fiveKPace: string; isMetric: boolean };

const calibrationBody = (input: CalibrationInput) => ({
  calibration: {
    five_k_pace: input.fiveKPace,
    easy_pace: input.easyPace,
    units: input.isMetric ? 'metric' : 'imperial',
  },
});

/** The paces the server would derive from these two typed paces, without saving. Null when it declines. */
export async function previewCalibration(
  supabase: SupabaseClient,
  input: CalibrationInput,
): Promise<TrainingPaces | null> {
  try {
    const { data, error } = await supabase.functions.invoke('save-baselines', {
      body: { ...calibrationBody(input), preview: true },
    });
    if (error || !data?.success) return null;
    return (data.effort_paces as TrainingPaces) ?? null;
  } catch {
    return null;
  }
}

/** Save the two typed paces. The server stores the 5K on Baselines and derives the effort columns. */
export async function saveCalibration(
  supabase: SupabaseClient,
  input: CalibrationInput,
): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('save-baselines', { body: calibrationBody(input) });
    if (error) return { error: error.message };
    return { error: data?.success ? null : String(data?.error || 'Could not save the calibration') };
  } catch (e) {
    return { error: (e as Error)?.message || 'Could not save the calibration' };
  }
}
