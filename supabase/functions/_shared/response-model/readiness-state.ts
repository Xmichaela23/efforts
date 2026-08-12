/**
 * RAW READINESS STATE — extracted from coach/index.ts (Slice 1, 2026-08-12).
 *
 * It was ~45 lines of branches buried in the ~6k-line @ts-nocheck coach edge file, so it could not be
 * unit-run — and it was the seam that kept the "you're overloaded" cascade alive after the assessment
 * label was fixed (7809cc12). Same treatment reconcileLoadStatus got on extraction (D-259): move it
 * out, pin it with fixtures, change nothing else about its branch ORDER.
 *
 * ⛔ WHAT CHANGED IN THE MOVE (Slice 1) — three branches that minted "your body is overloaded" from
 * something the athlete did not report:
 *
 *   1. `if (bodySignalsConcerning) return 'fatigued'` — a bare COUNT of soft declining markers. One
 *      harder-than-usual RPE reading was enough. It now requires THE verdict (mintOverloadVerdict).
 *   2. `isAcwrFatiguedSignal(acwr) && bodySignalsConcerning` — absolute ACWR as the corroborator.
 *      A ratio the plan itself produced cannot be evidence the athlete overreached.
 *   3. `v.code === 'recover_overreaching' / 'caution_ramping_fast'` — buildVerdict's ACWR bands
 *      reaching in to set the BODY state. The week verdict still reports on the glance lane exactly
 *      as before (untouched); it just no longer diagnoses the athlete.
 *
 * The 'adapting' and 'detrained' branches are UNCHANGED — neither is an overload claim ('adapting' is
 * positive, 'detrained' is a low-load observation), so ACWR stays a legitimate input to both.
 */

import { isAcwrFatiguedSignal, isAcwrDetrainedSignal } from '../acwr-state.ts';
import type { OverloadVerdict } from '../load-status-reconcile.ts';

export type ReadinessState = 'fresh' | 'normal' | 'fatigued' | 'overreached' | 'detrained' | 'adapting';

export function computeReadinessState(args: {
  /** The week verdict code (buildVerdict). Reported as-is on the glance lane; here it only ever
   *  contributes ALONGSIDE the overload verdict. */
  verdictCode: string;
  assessmentLabel: string;
  signalsConcerning: number;
  signalsAvailable: number;
  acwr: number | null;
  isPlanTransitionPeriod: boolean;
  weekIntent: string | null;
  /** THE overload verdict. Null ⇒ pre-Slice-1 behavior (soft-count fatigue), kept only so a caller
   *  without the verdict degrades to the old contract rather than silently reading 'normal'. */
  overload: OverloadVerdict | null;
}): ReadinessState {
  const { acwr, isPlanTransitionPeriod, weekIntent } = args;
  const overloaded = args.overload == null ? null : args.overload.overloaded;

  // Overreaching — the body has crossed a real threshold. Slice 1: "real" now means the ONE verdict
  // agrees, not that a ratio crossed a band.
  if (args.verdictCode === 'recover_overreaching' && overloaded !== false) return 'overreached';
  if (args.assessmentLabel === 'overreaching' && !isPlanTransitionPeriod) return 'overreached';

  // Body signals are the primary read: execution, HR drift, RPE, cardiac efficiency.
  const bodySignalsConcerning = args.signalsConcerning > 0;
  const bodySignalsImproving = args.signalsAvailable >= 2 &&
    args.signalsConcerning === 0 &&
    args.assessmentLabel === 'responding';

  // ⛔ EXECUTION NO LONGER DIAGNOSES THE ATHLETE (2026-08-02) — the per-session adherence average
  // returned 'fatigued' regardless of whether any body signal agreed, off an input (duration and
  // intensity blended) that could not support the claim. Execution still REPORTS; it never concludes.

  // Elevated load AND the body confirms it — genuinely fatigued. Slice 1: the load half is
  // actual-vs-planned via the verdict, never absolute ACWR.
  if (overloaded === true) return 'fatigued';
  if (overloaded === null && isAcwrFatiguedSignal(acwr, isPlanTransitionPeriod, weekIntent as any) && bodySignalsConcerning) return 'fatigued';

  // ACWR elevated BUT the body is handling it fine — adapting to load, not fatigued. Unchanged: this
  // is a positive read, so a plan-produced ratio is a fair input.
  if (isAcwrFatiguedSignal(acwr, isPlanTransitionPeriod, weekIntent as any) && bodySignalsImproving) return 'adapting';

  // Ramping fast with nothing to confirm either way. Slice 1: a caution code alone no longer fatigues
  // the athlete — it needs the verdict, which the branch above already returns on.
  if (overloaded === null && args.verdictCode === 'caution_ramping_fast' && !bodySignalsImproving) return 'fatigued';

  // Low ACWR vs chronic: "detrained" in data terms — during taper/recovery/deload that is usually
  // intentional (skips, reduced volume). Don't label it a loss of fitness. Unchanged.
  if (isAcwrDetrainedSignal(acwr)) {
    const wi = String(weekIntent || '').toLowerCase();
    if (wi === 'taper' || wi === 'recovery' || wi === 'deload') return 'normal';
    return 'detrained';
  }

  if (overloaded === null && bodySignalsConcerning) return 'fatigued';
  if (args.assessmentLabel === 'responding' && args.signalsConcerning === 0) return 'fresh';
  return 'normal';
}
