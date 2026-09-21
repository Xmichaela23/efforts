/**
 * ⛔ ONE READER FOR THE CALIBRATION SIGNAL — slice b.
 *
 * State and Performance both show what a lift's number did and both offer the same Undo. That is
 * TWO SURFACES, ONE SIGNAL: the moment each screen derives its own answer they disagree, and a
 * disagreement here means one screen says a lift reset and the other says it climbed. This hook is
 * the single place either of them asks.
 *
 * ── ⛔ WHY IT ASKS THE REMATERIALIZER RATHER THAN READING `plans.config` DIRECTLY ────────────────
 *
 * The calibration LOG (`plans.config.strength_calibration`) records what moved and what was undone,
 * and a client could read it in one query. It is not enough on its own: the log has no entry for a
 * lift that is *holding* — a single missed session holds the weight and produces no event (p.33), so
 * a log-only read would show that lift as "climbing" and be wrong in the one case the athlete most
 * needs named. The three states need the cycle-by-cycle numbers, and those come from the engine.
 *
 * ⚠️ SO THIS IS A DRY RUN, AND IT WRITES NOTHING. `rematerialize-strength-block` with no `apply` and
 * no `undo_lift` computes and returns; the write paths are the logger's save and this hook's `undo`.
 *
 * ⚠️ AND IT IS THE SAME FUNCTION THE LOGGER CALLS. One authority for "what are this block's numbers",
 * so the sheet the athlete saw at save time and the row they open afterwards cannot contradict.
 *
 * ── WHAT IS NOT DONE HERE, AND IT IS DELIBERATE ─────────────────────────────────────────────────
 *
 * ⛔ **This does not route through `adapt-plan`'s `strength_progression` / `strength_deload`
 * suggestions**, which slice b's brief and `CLAUDE.md` both name as the existing consent-first path.
 *
 * ⚠️ RE-TRACED 2026-08-27, AND THE 2026-08-15 WORDING HERE WAS PART WRONG. It said those suggestions
 * are *"dropped on the floor"*. What is actually true, in three parts:
 *   · the hook DOES carry them — `useCoachWeekContext.ts` declares
 *     `plan_adaptation_suggestions` (:326, :437) and merges into it (:619-621, :650-664), mapping
 *     `strength_relayout`, `endurance_pace_update`, `endurance_ftp_update` and
 *     `strength_training_max`. So they reach the payload object, not the floor;
 *   · **no component reads the field.** The only mention of it under `src/` outside that hook is
 *     this comment, so nothing renders them;
 *   · **no `action: 'accept'` call exists anywhere under `src/`.** There is no path from a
 *     suggestion to a plan change.
 *
 * ⚠️ THE DISTINCTION MATTERS AND IS WHY IT IS CORRECTED RATHER THAN TRIMMED: the transport half is
 * built and only the display and the accept are missing, which is a much smaller gap than "dropped".
 *
 * The documented "State strength-row adjust modal" is still unreachable: `StrengthAdjustmentModal.tsx`
 * has **zero importers** and `StateAdjustLens` is a v0 scaffold whose own footnote says weight
 * changes live in the logger. There was no tap-to-apply on the client to convert; the logger's sheet
 * was the only working path, and this hook extends it rather than reviving a surface nobody wired.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, getStoredUserId } from '@/lib/supabase';
import type {
  LiftCalibrationStatus,
  StrengthCalibrationEvent,
} from '../../supabase/functions/shared/strength-system/loading/calibration';

export type CalibratedLift = {
  /** `training_max` key — 'squat', 'overheadPress', … Also the `undo_lift` argument. */
  ref: string;
  /** Display name — 'Back Squat'. */
  name: string;
  status: LiftCalibrationStatus;
  /** The training max the lift is currently running on, in the athlete's own unit. 0 when unknown. */
  trainingMax: number;
  /** 'lb' | 'kg' — what `trainingMax` is written in. */
  trainingMaxUnit: string;
  /**
   * ⛔ THE WHOLE LINE, FROM THE SERVER (2026-09-15, Stage 4 session 2) — "Back Squat — climbing,
   * training max 210 lb". Empty when the server did not send one.
   */
  statusLine: string;
  /**
   * The most recent event still standing for this lift, or null. ⚠️ **UNDONE EVENTS ARE EXCLUDED** —
   * a line the athlete already reversed must not keep announcing itself on two other screens.
   */
  event: StrengthCalibrationEvent | null;
};

export type StrengthCalibrationRead = {
  byLift: CalibratedLift[];
  /** True while the first read is in flight. Surfaces render nothing rather than a wrong state. */
  loading: boolean;
  /**
   * Reverse a lift's most recent change. ⚠️ A SERVER CALL, not a local revert — the rewrite is a pure
   * function of the stored max and the logged sets, so a client-side restore would be recomputed away
   * on the next save. Resolves to true when the server recorded it.
   */
  undo: (ref: string) => Promise<boolean>;
};

export function useStrengthCalibration(enabled = true): StrengthCalibrationRead {
  // Opens with the last read any screen made (cache step 6, 2026-09-21), then reads again; State and Performance
  // no longer start blank. The server read below still runs on every open, so a shown number is never kept.
  const queryClient = useQueryClient();
  const sharedKey = ['strength-calibration', getStoredUserId() ?? 'anon'];
  const shared = enabled ? queryClient.getQueryData<CalibratedLift[]>(sharedKey) : undefined;
  const [byLift, setByLiftLocal] = useState<CalibratedLift[]>(shared ?? []);
  const [loading, setLoading] = useState<boolean>(enabled && !shared);
  const setByLift = (v: CalibratedLift[]) => {
    setByLiftLocal(v);
    if (enabled) queryClient.setQueryData(sharedKey, v);
  };
  // ⚠️ Guards a setState after unmount, and the refetch-after-undo below.
  const alive = useRef(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (!enabled) { setLoading(false); setByLift([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('rematerialize-strength-block', { body: {} });
        if (cancelled || !alive.current) return;
        // ⛔ NOT A STRENGTH BLOCK, OR NOTHING TO SAY → SILENCE. `reason: 'not_a_strength_block'` is the
        // common case (any run or tri plan) and is not an error; an empty list renders nothing.
        if (!data?.success) { setByLift([]); setLoading(false); return; }
        const perLift = (data.per_lift ?? {}) as Record<string, any>;
        const log = (Array.isArray(data.calibration) ? data.calibration : []) as StrengthCalibrationEvent[];
        // ⛔ THE STATUS, THE NUMBER AND THE LINE ARE ALL THE SERVER'S (2026-09-15, Stage 4 session 2).
        // This picked the cycle to read, ran the status rule and composed the sentence — the engine
        // already knows the stored phase structure and the week, and a second derivation is how two
        // screens start naming different cycles for one week.
        const out: CalibratedLift[] = Object.entries(perLift).map(([ref, v]: [string, any]) => {
          const event = [...log].reverse().find((e) => e?.ref === ref && !e?.undone_at) ?? null;
          return {
            ref,
            name: String(v?.name ?? ref),
            status: v?.status as LiftCalibrationStatus,
            trainingMax: Number(v?.training_max) || 0,
            trainingMaxUnit: String(v?.training_max_unit ?? 'lb'),
            statusLine: String(v?.status_line ?? ''),
            event,
          };
        }).filter((l) => !!l.status);
        setByLift(out);
        setLoading(false);
      } catch {
        // A supplier that cannot read says nothing. It must never take a screen down.
        if (!cancelled && alive.current) { setByLift([]); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, nonce]);

  const undo = useCallback(async (ref: string) => {
    try {
      const { data } = await supabase.functions.invoke('rematerialize-strength-block', {
        body: { undo_lift: ref },
      });
      if (!data?.success) return false;
      // Re-read rather than patching local state: the undo changes the numbers the engine computes,
      // and guessing at the result here is how two screens start disagreeing.
      if (alive.current) setNonce((n) => n + 1);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { byLift, loading, undo };
}
