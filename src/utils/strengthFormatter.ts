import { kindWordFor } from '@/lib/today-lines';

/**
 * Strength exercise display helpers
 *
 * Smart server, dumb client:
 * - Server provides everything: weight_display, baseline_missing, required_baseline
 * - Client just reads and displays
 *
 * ⛔ THE ROW SENTENCE IS THE SERVER'S (2026-09-10, audit H-D14). `formatStrengthExercise` and
 * `formatStrengthExerciseLines` moved to `supabase/functions/_shared/strength/strength-display-lines.ts`;
 * materialize-plan stamps `strength.display_line` and `computed.strength_lines`, and the planned screens
 * print those. Their tests moved with them.
 */

/**
 * Check if workout needs baseline setup
 * Reads server-provided flags
 */
export function checkWorkoutNeedsBaselines(exercises: any[]): {
  needsSetup: boolean;
  requiredBaselines: string[];
  exercisesPending: string[];
} {
  const requiredSet = new Set<string>();
  const exercisesPending: string[] = [];

  for (const ex of exercises) {
    if (ex?.baseline_missing) {
      exercisesPending.push(ex.name);
      if (ex.required_baseline) {
        requiredSet.add(ex.required_baseline);
      }
    }
  }

  return {
    needsSetup: requiredSet.size > 0,
    requiredBaselines: Array.from(requiredSet),
    exercisesPending
  };
}

/**
 * Extract strength exercises from materialized workout
 */
export function getStrengthExercisesFromWorkout(workout: any): any[] {
  // Materialized: computed.steps with kind='strength'
  const steps = workout?.computed?.steps;
  if (Array.isArray(steps)) {
    return steps
      .filter((s: any) => s?.kind === 'strength')
      .map((s: any) => s.strength);
  }

  // Not materialized: raw strength_exercises
  const raw = workout?.strength_exercises;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return JSON.parse(raw);

  return [];
}

/**
 * ═══ THE PLANNED LIFT DRAWER AS A PLAIN LIST (Michael, 2026-09-10) ═════════════════════════════════
 *
 * `name · sets × reps · weight`, one line per row, with the kind word printed ONCE above each run of
 * rows that share it. Nothing else.
 *
 * ⛔ WHAT IS DELIBERATELY NOT HERE, and each was on the old line: the cue (Today's card carries it);
 * "· 1-2 in reserve" and "your call — pick a weight that leaves…", repeated on every row of a block;
 * "— last time 4"; the load-basis sentences; `(was 85 lb)`. A list the athlete reads at the bar has
 * one job — what to load and how many — and every repeated phrase pushed that off the line.
 *
 * ⚠️ A ROW WITH NO PRICED WEIGHT READS `By feel` — the composer's own literal for an auto-regulated
 * row, the same one Today's card shows.
 * ⛔ A BARE NUMBER IS NOT LABELLED HERE (2026-09-10, audit H-T06): the server's `weight_display` carries
 * the athlete's unit; the phone's "lb"/"kg" guess is gone.
 */
export type PlainLiftLine = { heading: string | null; text: string };

export function plainLiftList(items: any[], _units: 'imperial' | 'metric' = 'imperial'): PlainLiftLine[] {
  const list = Array.isArray(items) ? items : [];
  const nameOf = (x: any) => String(x?.execution_name || x?.name || '').replace(/_/g, ' ').trim();
  const dose = (x: any) => {
    const sets = Number(x?.sets) || 0;
    const reps = x?.reps;
    return sets > 0 && reps != null && String(reps).trim() ? `${sets} × ${reps}` : null;
  };
  const weightOf = (x: any) => {
    const d = typeof x?.weight_display === 'string' ? x.weight_display.trim() : '';
    if (d) return d;
    if (typeof x?.weight === 'string' && x.weight.trim()) return x.weight.trim();
    return 'By feel';
  };

  const out: PlainLiftLine[] = [];
  let lastKind: string | null = null;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    const next = list[i + 1];
    const kind = kindWordFor(e);
    // ⛔ THE KIND WORD ONCE — above the first row of a run, never repeated down the list.
    const heading = kind && kind !== lastKind ? kind : null;
    if (kind) lastKind = kind;

    // A superset pair stays on one line, joined — the pair is one station, and splitting it would lose that.
    const g = typeof e?.superset_group === 'string' && e.superset_group ? e.superset_group : null;
    if (g && next && next.superset_group === g) {
      const parts = [`${nameOf(e)} + ${nameOf(next)}`, dose(e), weightOf(e)].filter(Boolean);
      out.push({ heading, text: parts.join(' · ') });
      i += 1;
      continue;
    }
    const name = nameOf(e);
    if (!name) continue;
    out.push({ heading, text: [name, dose(e), weightOf(e)].filter(Boolean).join(' · ') });
  }
  return out;
}
