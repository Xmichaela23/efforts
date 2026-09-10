/**
 * ═══ THE STRENGTH PERFORMANCE TABLE, ONE ROW PER SLOT, BUILT ON THE SERVER ═══════════════════════
 *
 * 2026-09-10, audit H-S11 / H-S12 / H-S13 / H-S14 / H-S15 (Stage 2 item 14).
 *
 * ⛔ WHAT THE PHONE USED TO DECIDE, AND NOW PRINTS. `StrengthCompareTable` paired planned and logged
 * rows with its own name matcher, labelled rows "not logged" / "not in the plan", averaged the
 * logged RIR (autofilled values included) and fell back to its own concern rule when the analyzer
 * had no verdict, summed reps and volume deltas per row, and turned a planned "4-6" into 5.
 * `StrengthPerformanceSummary` counted "Completed X of Y" with a second matcher and totalled sets and
 * reps counting any set with reps, ticked or not. `StrengthCompletedView` priced volume as
 * `reps × weight` with 0-weight sets skipped. Each of those is built here instead, once.
 *
 * ⛔ THE PAIRING IS `matchExercises` — the matcher `analyze-strength-workout` scores with. "Do not
 * write a second matcher" is the rule at the top of that file, and this does not: a declared swap
 * (Tier 0), the name tiers and the assistance-slot inference (D-370) all come from there.
 *
 * ⚠️ THE PRICE IS `strength_volume`'s. A row's `volume_lb` is that exercise's entry, so the rows add
 * up to `completed_total_lb` and to `strength_totals.volume_lb` by construction.
 *
 * ⚠️ A SET COUNTS WHEN IT WAS PERFORMED — `isPerformedSet`, the rule the volume uses: a set ticked
 * done, or a legacy set that carries no flag. A set typed and never ticked, or an untouched prefill,
 * is not counted and is not drawn, so the table, its reps and its totals agree with the logger's
 * countdown, which only ever counted ticked sets.
 *
 * ⚠️ THE WORDS ARE THE ONES THE TABLE PRINTED, moved here unchanged (no new words).
 */
import { matchExercises, normalizeExerciseName, type ExerciseMatch } from '../strength/match-exercises.ts';
import { canonicalize } from '../canonicalize.ts';
import { completedStrengthVolume, isPerformedSet } from '../strength/session-volume.ts';
import type { SessionDetailV1 } from './types.ts';
import { isAssistanceSlot } from '../../../../src/lib/assistance-slot.ts';
import { normalizeCompletedStrengthSet } from '../../../../src/lib/normalize-strength-set.ts';
import { isBandAssistedMovement } from '../../../../src/lib/band-assistance.ts';

type Slot = NonNullable<SessionDetailV1['strength_slots']>[number];
type PlannedSet = Slot['planned_sets'][number];
type RirVerdict = 'too_easy' | 'on_target' | 'too_hard';

const SLOT_INTENT_WORD: Record<string, string> = { ME: 'heavy', DE: 'speed', SKILL: 'skill', HYP: 'hypertrophy' };

const RIR_LINE: Record<RirVerdict, string> = {
  too_hard: 'Going too hard — reduce weight or add reps in reserve',
  too_easy: 'Leaving too much in the tank — increase weight next session',
  on_target: 'RIR on target',
};

const DIFFICULTY_WORD: Record<string, string> = { moved_well: 'Moved well', worked_for_it: 'Worked for it' };

/** Lowercase, strip (Left)/(Right), collapse spaces — for the bodyweight word test only. */
function displayKey(raw: unknown): string {
  return String(raw || '').toLowerCase().replace(/\s*\((?:left|right)\)\s*/gi, '').replace(/\s+/g, ' ').trim();
}

const leadingInt = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0;
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
};

/** `8` stays a number; `6-12`, `5+` and `25 total` stay the words the plan wrote. Never a midpoint. */
function repsField(raw: unknown): { reps?: number; reps_text?: string } {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return { reps: Math.round(raw) };
  const t = String(raw ?? '').trim();
  if (!t) return {};
  if (/^\d+$/.test(t)) return { reps: Number(t) };
  return { reps_text: t };
}

type PlannedRow = {
  name: string;
  sets: number;
  reps: unknown;
  weight: number;
  weight_display?: string;
  target_rir?: number;
  duration_seconds?: number;
  set_plan?: Array<{ weight: number; reps: number; amrap: boolean }>;
  load_prescribed?: false;
  slot_intent?: unknown;
};

/**
 * The plan as the Performance screen showed it: the materialized steps when the row has them (their
 * names and the authored ramp), else the authored `strength_exercises`.
 */
function plannedRows(plannedRowRaw: any): { rows: PlannedRow[]; fromSteps: boolean } {
  const steps: any[] = Array.isArray(plannedRowRaw?.computed?.steps) ? plannedRowRaw.computed.steps : [];
  const strengthSteps = steps.filter((st) => st?.strength && typeof st.strength === 'object');
  if (strengthSteps.length > 0) {
    return {
      fromSteps: true,
      rows: strengthSteps.map((st) => {
        const s = st.strength;
        const rawReps = s?.reps ?? s?.repCount;
        const setPlan = Array.isArray(s?.set_plan)
          ? s.set_plan
            .map((p: any) => ({ weight: Number(p?.weight) || 0, reps: Number(p?.reps) || 0, amrap: p?.amrap === true }))
            .filter((p: any) => p.weight > 0 || p.reps > 0)
          : [];
        const assistance = s?.load_prescribed === false || isAssistanceSlot({ sets: s?.sets, reps: rawReps, load_prescribed: s?.load_prescribed });
        return {
          name: String(s?.name || 'Exercise'),
          sets: Number(s?.sets || s?.setsCount || 0) || 0,
          reps: rawReps,
          weight: Number(s?.weight || s?.load || 0) || 0,
          ...(typeof s?.target_rir === 'number' ? { target_rir: s.target_rir } : {}),
          ...(setPlan.length ? { set_plan: setPlan } : {}),
          ...(assistance ? { load_prescribed: false as const } : {}),
          slot_intent: s?.slot_intent,
        };
      }),
    };
  }
  const direct: any[] = Array.isArray(plannedRowRaw?.strength_exercises) ? plannedRowRaw.strength_exercises : [];
  return {
    fromSteps: false,
    rows: direct.map((ex) => {
      const setsArr = Array.isArray(ex?.sets) ? ex.sets : [];
      const sets = setsArr.length || (typeof ex?.sets === 'number' ? ex.sets : 0);
      let weight = 0;
      let weight_display: string | undefined;
      if (typeof ex?.weight === 'number') weight = ex.weight;
      else if (typeof ex?.weight === 'string') {
        const t = ex.weight.trim();
        if (/^[\d.]+\s*(lb|lbs|kg)?$/i.test(t)) weight = Number.parseFloat(t) || 0;
        else if (t) weight_display = t;
      }
      const duration = typeof ex?.duration_seconds === 'number' ? ex.duration_seconds : 0;
      return {
        name: String(ex?.name ?? ''),
        sets,
        reps: ex?.reps,
        weight,
        ...(weight_display ? { weight_display } : {}),
        ...(typeof ex?.target_rir === 'number' ? { target_rir: ex.target_rir } : {}),
        ...(duration > 0 ? { duration_seconds: duration } : {}),
        ...(isAssistanceSlot(ex) ? { load_prescribed: false as const } : {}),
        slot_intent: ex?.slot_intent,
      };
    }),
  };
}

/** The logged exercises, legacy compact shapes expanded; `set_index` is the set's place in the saved row. */
function loggedRows(raw: any[]): any[] {
  return raw.map((ex: any, raw_index: number) => {
    const base = { name: String(ex?.name ?? ''), substituted_for: ex?.substituted_for ?? null, slot_intent: ex?.slot_intent, raw_index };
    if (typeof ex?.duration === 'string') {
      const m = ex.duration.match(/(\d+)x(\d+)/i);
      if (m) {
        const n = Number.parseInt(m[1], 10);
        const reps = Number.parseInt(m[2], 10);
        return { ...base, sets: Array.from({ length: n }, (_, i) => ({ ...normalizeCompletedStrengthSet({ reps, weight: Number(ex?.weight || 0), completed: true }), set_index: i })) };
      }
    }
    if (Array.isArray(ex?.sets) && ex.sets.length > 0) {
      return { ...base, sets: ex.sets.map((s: any, i: number) => ({ ...normalizeCompletedStrengthSet(s), set_index: i })) };
    }
    if (typeof ex?.sets === 'number' && ex.sets > 0) {
      const reps = Number(ex?.reps ?? 0) || 0;
      const weight = Number(ex?.weight ?? 0) || 0;
      if (reps > 0 || weight > 0) {
        return { ...base, sets: Array.from({ length: ex.sets }, (_, i) => ({ ...normalizeCompletedStrengthSet({ reps, weight, completed: true }), set_index: i })) };
      }
    }
    return { ...base, sets: [] };
  });
}

function plannedSetsFor(p: PlannedRow): PlannedSet[] {
  const rir = typeof p.target_rir === 'number' ? { rir: p.target_rir } : {};
  const display = p.weight_display ? { weight_display: p.weight_display } : {};
  if (p.set_plan?.length) {
    return p.set_plan.map((ap) => ({
      weight: ap.weight, ...display, ...(ap.reps > 0 ? { reps: ap.reps } : {}), ...rir, ...(ap.amrap ? { amrap: true } : {}),
    }));
  }
  return Array.from({ length: Math.max(0, p.sets) }, () => ({
    weight: p.weight, ...display,
    ...(p.duration_seconds && p.duration_seconds > 0 ? { duration_seconds: p.duration_seconds } : repsField(p.reps)),
    ...rir,
  }));
}

export type StrengthSlotsInput = {
  type: string;
  plannedRowRaw: any;
  completedStrengthExercises: any[] | null | undefined;
  strengthVolume: SessionDetailV1['strength_volume'] | null | undefined;
  bodyweightLb: number | null | undefined;
  /** `workout_analysis.detailed_analysis.exercise_adherence` — the analyzer's per-exercise RIR read. */
  exerciseAdherence: unknown;
};

export type StrengthSlotsFields = Pick<SessionDetailV1, 'strength_slots' | 'strength_counts' | 'strength_totals'>;

export function buildStrengthSlots(input: StrengthSlotsInput): StrengthSlotsFields {
  const none: StrengthSlotsFields = { strength_slots: null, strength_counts: null, strength_totals: null };
  if (input.type !== 'strength' && input.type !== 'mobility') return none;
  const rawCompleted = Array.isArray(input.completedStrengthExercises) ? input.completedStrengthExercises : [];
  const { rows: planned, fromSteps } = plannedRows(input.plannedRowRaw);
  if (planned.length === 0 && rawCompleted.length === 0) return none;

  const logged = loggedRows(rawCompleted);
  const completedVolume = input.strengthVolume?.completed
    ?? completedStrengthVolume(rawCompleted, input.bodyweightLb).completed;
  const plannedVolume = input.strengthVolume?.planned ?? [];
  const plannedVolumeFor = (index: number, name: string): number => {
    if (!fromSteps && plannedVolume[index]) return plannedVolume[index].volume_lb;
    const key = canonicalize(name);
    const exact = plannedVolume.find((e) => canonicalize(e.name) === key);
    if (exact) return exact.volume_lb;
    const n = normalizeExerciseName(name);
    const loose = plannedVolume.filter((e) => {
      const en = normalizeExerciseName(e.name);
      return !!en && !!n && (en.includes(n) || n.includes(en));
    });
    return loose.length === 1 ? loose[0].volume_lb : 0;
  };

  // The analyzer's RIR read, keyed the way the table used to look it up.
  const rirByKey = new Map<string, { target_rir: number | null; avg_rir: number | null; rir_verdict: RirVerdict | null }>();
  for (const ea of Array.isArray(input.exerciseAdherence) ? input.exerciseAdherence as any[] : []) {
    if (!ea?.matched || ea?.adherence?.target_rir == null) continue;
    const entry = {
      target_rir: Number(ea.adherence.target_rir),
      avg_rir: ea.adherence.avg_rir != null ? Number(ea.adherence.avg_rir) : null,
      rir_verdict: (ea.adherence.rir_verdict ?? null) as RirVerdict | null,
    };
    for (const nm of [ea?.executed?.name, ea?.planned?.name]) {
      const k = canonicalize(String(nm ?? ''));
      if (k && !rirByKey.has(k)) rirByKey.set(k, entry);
    }
  }

  const matches: ExerciseMatch[] = matchExercises(planned, logged);
  const hasPlan = planned.length > 0;
  let plannedIndex = 0;

  const slots: Slot[] = matches.map((m) => {
    const p = (m.planned ? planned[plannedIndex++] : null) as PlannedRow | null;
    const c = m.executed as any | null;
    const performed: any[] = c ? (c.sets as any[]).filter(isPerformedSet) : [];
    const name = p?.name || c?.name || '';
    const swapped = !!(p && c && canonicalize(String(c.name)) !== canonicalize(p.name) && m.substituted);
    const status: Slot['status'] = p && c ? (swapped ? 'swapped' : 'done') : p ? 'not_logged' : 'unplanned';

    const plannedSetCount = p?.sets ?? 0;
    const repsLead = p ? leadingInt(p.reps) : 0;
    const repsTarget = p?.load_prescribed === false && repsLead > 0 && !(plannedSetCount > 1) ? repsLead : null;
    const band = p?.load_prescribed === false && repsTarget == null && plannedSetCount > 0 && p.reps != null && String(p.reps).trim() !== ''
      ? `${plannedSetCount}×${String(p.reps).trim().replace(/\+$/, '')}` : null;
    const repsDone = performed.reduce((s, st) => s + (Number(st?.reps) || 0), 0);

    const volume = c ? (completedVolume[c.raw_index]?.volume_lb ?? 0) : 0;
    const plannedVol = p ? plannedVolumeFor(planned.indexOf(p), p.name) : 0;
    const delta = plannedVol > 0 ? volume - plannedVol : null;

    const rir = (c ? rirByKey.get(canonicalize(String(c.name))) : undefined)
      ?? (p ? rirByKey.get(canonicalize(p.name)) : undefined)
      ?? null;
    const verdict = rir?.rir_verdict ?? null;

    const topSet = (() => {
      const weights = performed.map((s) => Number(s?.weight) || 0);
      const max = weights.length ? Math.max(...weights) : 0;
      return max > 0 ? performed[weights.lastIndexOf(max)] : null;
    })();
    const difficulty = topSet?.difficulty ? (DIFFICULTY_WORD[String(topSet.difficulty)] ?? 'Grind') : null;

    const hasLoggedWeight = ((c?.sets as any[]) ?? []).some((s) => (Number(s?.weight) || 0) > 0);
    const bodyweight = /dip|chin\-?ups?|pull\-?ups?|push\-?ups?|plank/.test(displayKey(name))
      && !hasLoggedWeight && !((p?.weight ?? 0) > 0);

    return {
      name,
      planned_name: p?.name ?? null,
      executed_name: c ? String(c.name) : null,
      status,
      status_label: status === 'not_logged' ? 'not logged' : status === 'unplanned' && hasPlan ? 'not in the plan' : null,
      intent_word: SLOT_INTENT_WORD[String(p?.slot_intent ?? c?.slot_intent ?? '').toUpperCase()] ?? null,
      target_label: repsTarget != null ? `${repsTarget} total · by feel` : band ? `${band} · by feel` : null,
      planned_sets: p ? plannedSetsFor(p) : [],
      completed_sets: performed,
      sets_done: performed.length,
      reps_done: repsDone,
      reps_target: repsTarget,
      reps_line: repsTarget != null ? `${repsDone.toLocaleString('en-US')} of ${repsTarget.toLocaleString('en-US')} reps` : null,
      volume_lb: volume,
      planned_volume_lb: plannedVol,
      volume_delta_lb: delta,
      volume_direction: delta == null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'even',
      avg_rir: rir?.avg_rir ?? null,
      target_rir: rir?.target_rir ?? (typeof p?.target_rir === 'number' ? p.target_rir : null),
      rir_verdict: verdict,
      rir_concern: verdict === 'too_hard',
      rir_line: verdict ? RIR_LINE[verdict] : null,
      difficulty_word: difficulty,
      bodyweight,
      band_assisted: isBandAssistedMovement(name),
      previous_key: canonicalize(name),
    };
  });

  const performedWithReps = logged.flatMap((ex) => (ex.sets as any[]).filter((s) => isPerformedSet(s) && (Number(s?.reps) || 0) > 0));
  const counts = hasPlan
    ? {
      exercises_planned: planned.length,
      exercises_completed: matches.filter((m) => m.planned && m.executed
        && ((m.executed as any).sets as any[]).some((s) => isPerformedSet(s) && ((Number(s?.reps) || 0) > 0 || (Number(s?.duration_seconds) || 0) > 0))).length,
    }
    : null;
  const totals = logged.length > 0
    ? {
      sets_completed: performedWithReps.length,
      reps_completed: performedWithReps.reduce((s, st) => s + (Number(st?.reps) || 0), 0),
      volume_lb: input.strengthVolume?.completed_total_lb ?? completedVolume.reduce((s, e) => s + e.volume_lb, 0),
    }
    : null;

  return { strength_slots: slots, strength_counts: counts, strength_totals: totals };
}
