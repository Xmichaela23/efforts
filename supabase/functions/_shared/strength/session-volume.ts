/**
 * THE POUNDS A FINISHED LIFTING SESSION MOVED — one pricing, used by every server surface
 * (2026-09-10, audit H-T04 / H-T05 / H-S15, Stage 2 item 12).
 *
 * ⛔ WHY THIS IS ITS OWN FILE. `session_detail_v1.strength_volume` priced each completed set with
 * `strengthSetVolume` — the bar when the weight box is blank, bodyweight movements, bands — while
 * Today's done card, the Week row, the week line and the Details tiles each summed `reps × weight`
 * with 0-weight sets skipped. A chin-up day read 0 lb on the card and 1,440 lb on Performance. The
 * completed side of `buildStrengthVolume` moved here unchanged, so `get-week` can send the same
 * number the Performance tab prints.
 *
 * ⚠️ THE COMPLETED SET FILTER MUST MATCH `compute-facts` AND THE TABLE, or the footer total will not
 * equal the rows above it. Both drop an untouched prefill (D-204: a prescription the athlete never
 * engaged is not a receipt) and keep legacy sets that carry no flag.
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "strength/session-volume" supabase/functions
 */
import { strengthSetVolume, barLbForExercise } from '../workload.ts';
import { typeForExercise } from '../../../../src/lib/exercise-role.ts';
import { isBandAssistedMovement } from '../../../../src/lib/band-assistance.ts';

export function isPerformedSet(s: any): boolean {
  return s && typeof s === 'object'
    && s.completed !== false
    && !(s.completed !== true && s.prefilled === true);
}

export type CompletedStrengthVolume = {
  /** One entry per COMPLETED exercise, named as the log names it. */
  completed: Array<{ name: string; volume_lb: number }>;
  completed_total_lb: number;
};

export function completedStrengthVolume(
  exercises: any[] | null | undefined,
  bodyweightLb: number | null | undefined,
): CompletedStrengthVolume {
  const bw = typeof bodyweightLb === 'number' && bodyweightLb > 0 ? bodyweightLb : null;
  const compExs = Array.isArray(exercises) ? exercises : [];
  const completed = compExs.map((ex: any) => {
    const bandIsAssistance = isBandAssistedMovement(String(ex?.name ?? ''));
    // ⛔ The band is the LOAD on these, not help and not the body — asked of the shared type axis so
    // a blank band box prices at the token rather than bodyweight x reps (2026-08-03).
    const bandIsLoad = typeForExercise(String(ex?.name ?? '')) === 'band';
    const setsArr = Array.isArray(ex?.sets) ? ex.sets : (Array.isArray(ex?.setsArray) ? ex.setsArray : []);
    // ⛔ A CURL IS NOT A BODYWEIGHT MOVEMENT (2026-08-28, Michael). Same type axis as the two band
    // flags beside it; an unweighted LOADED accessory prices zero rather than the athlete's weight.
    const bodyIsLoad = typeForExercise(String(ex?.name ?? '')) === 'bodyweight' || bandIsAssistance;
    // ⛔ A barbell lift with a blank weight box is the bar, not zero (2026-08-29).
    const barLb = barLbForExercise(String(ex?.name ?? ''));
    const volume_lb = setsArr.filter(isPerformedSet).reduce(
      (sum: number, s: any) => sum + strengthSetVolume(s, { bodyweightLb: bw, bandIsAssistance, bandIsLoad, bodyIsLoad, barLb }),
      0,
    );
    return { name: String(ex?.name ?? ''), volume_lb: Math.round(volume_lb) };
  });
  return { completed, completed_total_lb: completed.reduce((s, e) => s + e.volume_lb, 0) };
}
