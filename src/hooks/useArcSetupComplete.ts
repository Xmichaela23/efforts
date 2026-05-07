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
import { getStoredUserId, invokeFunction } from '@/lib/supabase';
import {
  persistArcSetup,
  buildCompleteContext,
  parseArcInvokeError,
  type InsertedGoalRow,
} from '@/lib/arc-setup-persistence';
import { clearArcWizardDraft } from '@/lib/arc-wizard-draft-storage';
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

export function useArcSetupComplete() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        if (parsed.code === 'missing_pace_benchmark') {
          navigate('/goals', { replace: true, state: { fromArcSetup: true, needPaceCalibration: true } });
          return;
        }
        setError(parsed.message);
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

      if (userId) clearArcWizardDraft(userId);

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
    [navigate, startLoop],
  );

  return { complete, saving, error, saveBanner, conflictOverlay, handleConflictChoice };
}
