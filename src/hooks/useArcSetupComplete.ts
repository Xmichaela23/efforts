/**
 * useArcSetupComplete — handles the post-wizard save and plan-build flow.
 *
 * Orchestrates: persistArcSetup → buildCompleteContext → startLoop (combined)
 * or direct single-sport build → navigate('/goals').
 *
 * Exposes `activeConflict` for the wizard to render as an overlay so the
 * athlete can resolve scheduling conflicts without a chat thread.
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, getStoredUserId, invokeFunction } from '@/lib/supabase';
import { resetWizardClientState } from '@/lib/reset-wizard-client-state';
import {
  persistArcSetup,
  buildCompleteContext,
  parseArcInvokeError,
  type InsertedGoalRow,
} from '@/lib/arc-setup-persistence';
import {
  useConflictResolutionLoop,
  type ActiveConflict,
  type ConflictLoopContext,
} from '@/hooks/useConflictResolutionLoop';
import type { ArcSetupPayload } from '@/lib/parse-arc-setup';

export type { ActiveConflict };

export type ConflictOverlay = {
  conflict: ActiveConflict;
  description: string;
};

const ROLLBACK_CLEANUP_MSG =
  'Goals were saved but plan setup failed. Some goals could not be removed automatically — open Goals and delete any duplicates.';

export function useArcSetupComplete() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Why the preview failed, so the copy can say it instead of shrugging. */
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [conflictOverlay, setConflictOverlay] = useState<ConflictOverlay | null>(null);

  // Adapt setMessages from the conflict loop into a simple overlay — the wizard
  // has no chat thread; conflicts appear as a full-screen card instead.
  const setMessages = useCallback(
    (updater: (prev: { role: string; content: string; conflict?: ActiveConflict }[]) => { role: string; content: string; conflict?: ActiveConflict }[]) => {
      const result = updater([]);
      const last = result[result.length - 1];
      if (last?.conflict) {
        setConflictOverlay({ conflict: last.conflict, description: last.content });
        setSaving(false);
      }
    },
    [],
  );

  const { startLoop, handleConflictChoice: _handleConflictChoice } = useConflictResolutionLoop({
    setMessages,
    setSending: setSaving,
    setSaveBanner,
    setError,
    navigate,
  });

  const handleConflictChoice = useCallback(
    async (conflictId: string, action: string, label: string) => {
      setConflictOverlay(null);
      await _handleConflictChoice(conflictId, action, label);
    },
    [_handleConflictChoice],
  );

  const rollbackInsertedGoals = useCallback(async (inserted: InsertedGoalRow[] | undefined): Promise<boolean> => {
    const userId = getStoredUserId();
    if (!userId || !inserted?.length) return false;
    const results = await Promise.allSettled(
      inserted.map((g) =>
        supabase.functions.invoke('delete-goal', {
          body: { goal_id: g.id, user_id: userId },
        }),
      ),
    );
    let hadFailure = false;
    results.forEach((r, i) => {
      const gid = inserted[i]?.id;
      if (r.status === 'rejected') {
        hadFailure = true;
        console.warn('[useArcSetupComplete] rollback delete-goal', gid, r.reason);
        return;
      }
      if (r.value.error) {
        hadFailure = true;
        console.warn('[useArcSetupComplete] rollback delete-goal', gid, r.value.error);
      }
    });
    return hadFailure;
  }, []);

  /**
   * ⛔ BUILD THE WEEK WITHOUT COMMITTING TO IT — and without writing anything, anywhere.
   *
   * `complete()` cannot be reused for this: it calls `persistArcSetup` FIRST, which writes the goal
   * rows client-side before the edge function is ever invoked. A preview that went through it would
   * leave a goal behind every time someone looked at their week and backed out.
   *
   * So this calls `create-goal-and-materialize-plan` directly with the goal INLINE (`raw.goal`) and
   * `preview: true`. The function composes the plan, returns it, and persists nothing — the plan
   * side was already correct, and the goal-insert leak on that path was closed in the same change.
   *
   * ⚠️ Returns the plan or null. Never navigates, never dispatches invalidation events, never
   * touches wizard state — a preview is a read.
   */
  const preview = useCallback(
    async (payload: ArcSetupPayload): Promise<Record<string, unknown> | null> => {
      const userId = getStoredUserId();
      const goal = Array.isArray(payload.goals) ? payload.goals[0] : null;
      if (!userId || !goal) return null;
      const { data, error: err } = await invokeFunction<Record<string, unknown>>(
        'create-goal-and-materialize-plan',
        {
          user_id: userId,
          mode: 'create',
          goal,
          preview: true,
          ...(payload.plan_start_date ? { plan_start_date: payload.plan_start_date } : {}),
        },
      );
      // ⛔ DO NOT SWALLOW THE REASON. This line used to read `if (err || !data || success === false)
      // return null`, capturing `err` and never reading it. Three unrelated failures — a transport
      // error, an empty response, and the server explicitly saying `success: false` with a message —
      // all collapsed into one indistinguishable `null`, and the UI rendered "The week could not be
      // built" for every one of them.
      //
      // ⚠️ THE COST WAS A WHOLE SESSION. The response body was the one thing needed to diagnose this
      // and the client HAD it, then threw it away before anyone could look. §0h's family: a failure
      // that cannot say what failed is not a diagnosis, it is a shrug.
      if (err) {
        const detail = (err as { message?: string })?.message || String(err);
        console.error('[arc-preview] invoke failed:', detail, err);
        setPreviewError(detail);
        return null;
      }
      const fail = data as { success?: boolean; error?: string; message?: string } | null;
      if (!data || fail?.success === false) {
        const detail = fail?.error || fail?.message || 'the function returned no plan';
        console.error('[arc-preview] server refused:', detail, data);
        setPreviewError(detail);
        return null;
      }
      setPreviewError(null);
      return (data as { plan?: Record<string, unknown> }).plan ?? null;
    },
    [],
  );

  const complete = useCallback(
    async (payload: ArcSetupPayload) => {
      setSaving(true);
      setError(null);
      setSaveBanner(null);

      const { ok, error: pe, insertedGoals } = await persistArcSetup(payload);
      if (!ok) {
        setSaving(false);
        setError(pe || 'Save failed');
        return;
      }

      const userId = getStoredUserId();
      if (!userId) {
        setSaving(false);
        navigate('/goals', { replace: true, state: { fromArcSetup: true } });
        return;
      }

      const ctxOrErr = await buildCompleteContext(
        payload,
        (insertedGoals || []) as InsertedGoalRow[],
        userId,
      );

      if ('error' in ctxOrErr) {
        setSaving(false);
        const rbFail = await rollbackInsertedGoals((insertedGoals || []) as InsertedGoalRow[]);
        resetWizardClientState(userId);
        try {
          window.dispatchEvent(new CustomEvent('goals:invalidate'));
          window.dispatchEvent(new CustomEvent('plans:invalidate'));
        } catch {
          /* ignore */
        }
        if (rbFail) setError(ROLLBACK_CLEANUP_MSG);
        navigate('/goals', { replace: true, state: { fromArcSetup: true } });
        return;
      }

      const ctx: ConflictLoopContext = {
        primaryId: ctxOrErr.primaryId,
        combine: ctxOrErr.combine,
        replacePlanId: ctxOrErr.replacePlanId,
        planStart: ctxOrErr.planStart,
        primaryGoalData: ctxOrErr.primaryGoalData,
      };

      // The wizard already captured all scheduling preferences (preferred days,
      // training intent, etc.), so there are no conflicts to resolve via the
      // preview loop. Skip the conflict detection pass and go straight to the
      // real save for both single-sport and combined paths.
      setSaveBanner('Building your training calendar…');
      const { data, error: fnErr } = await invokeFunction('create-goal-and-materialize-plan', {
        user_id: userId,
        mode: 'build_existing',
        existing_goal_id: ctx.primaryId,
        combine: ctx.combine,
        ...(ctx.replacePlanId ? { replace_plan_id: ctx.replacePlanId } : {}),
        ...(ctx.primaryGoalData ? { goal: ctx.primaryGoalData } : {}),
        ...(ctx.planStart ? { plan_start_date: ctx.planStart } : {}),
      });

      setSaving(false);
      setSaveBanner(null);

      if (fnErr || !data || (data as { success?: boolean }).success !== true) {
        const parsed = await parseArcInvokeError(fnErr, data, 'Unable to build training plan');
        const rbFail = await rollbackInsertedGoals((insertedGoals || []) as InsertedGoalRow[]);
        resetWizardClientState(userId);
        try {
          window.dispatchEvent(new CustomEvent('goals:invalidate'));
          window.dispatchEvent(new CustomEvent('plans:invalidate'));
        } catch {
          /* ignore */
        }
        if (parsed.code === 'missing_pace_benchmark') {
          if (rbFail) setError(ROLLBACK_CLEANUP_MSG);
          navigate('/goals', { replace: true, state: { fromArcSetup: true, needPaceCalibration: true } });
          return;
        }
        setError(rbFail ? `${parsed.message} ${ROLLBACK_CLEANUP_MSG}` : parsed.message);
        return;
      }

      const planId = (data as { plan_id?: string | null }).plan_id ?? null;
      const scheduleSignals = (data as {
        schedule_signals?: {
          conflicts?: string[];
          trade_offs?: string[];
          used_co_equal_1x_fallback?: boolean;
          pin_restore_skipped?: string[];
        };
      }).schedule_signals;
      try {
        window.dispatchEvent(new CustomEvent('planned:invalidate'));
        window.dispatchEvent(new CustomEvent('goals:invalidate'));
        window.dispatchEvent(new CustomEvent('plans:refresh'));
      } catch {}

      if (userId) resetWizardClientState(userId);

      navigate('/goals', {
        replace: true,
        state: {
          fromArcSetup: true,
          seasonPlanJustBuilt: true,
          builtPlanId: planId,
          ...(scheduleSignals ? { schedule_signals: scheduleSignals } : {}),
        },
      });
    },
    [navigate, startLoop, rollbackInsertedGoals],
  );

  return { complete, preview, saving, error, previewError, saveBanner, conflictOverlay, handleConflictChoice };
}
