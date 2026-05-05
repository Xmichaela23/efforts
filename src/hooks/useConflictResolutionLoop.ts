import { useRef } from 'react';
import { invokeFunction, getStoredUserId } from '@/lib/supabase';
import type { NavigateFunction } from 'react-router-dom';

// ── Shared types ──────────────────────────────────────────────────────────────

export type ActiveConflict = {
  conflictId: string;
  primaryLabel: string;
  primaryAction: string;
  secondaryLabel: string;
  secondaryAction: string;
};

export type ConflictLoopContext = {
  primaryId: string;
  combine: boolean;
  replacePlanId: string | null;
  planStart: string | null;
};

// ── Internal types ────────────────────────────────────────────────────────────

type ServerConflictOption = { label: string; action: string };

type ServerConflictResolution = {
  conflict_id: string;
  primary_option?: ServerConflictOption;
  secondary_option?: ServerConflictOption;
  explanation: string;
  science_note: string;
};

type ConflictMessage = {
  role: 'assistant' | 'user';
  content: string;
  conflict?: ActiveConflict;
};

type HookDeps = {
  setMessages: (updater: (prev: ConflictMessage[]) => ConflictMessage[]) => void;
  setSending: (v: boolean) => void;
  setSaveBanner: (v: string | null) => void;
  setError: (v: string | null) => void;
  navigate: NavigateFunction;
};

const MAX_ITERATIONS = 3;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useConflictResolutionLoop({
  setMessages,
  setSending,
  setSaveBanner,
  setError,
  navigate,
}: HookDeps) {
  const conflictPreferencesRef = useRef<Record<string, string>>({});
  const iterationRef = useRef(0);
  const loopContextRef = useRef<ConflictLoopContext | null>(null);

  // Shared invoke helper that builds the base create-goal-and-materialize-plan body.
  const buildInvokeBody = (userId: string, preview: boolean) => {
    const ctx = loopContextRef.current!;
    const prefs = conflictPreferencesRef.current;
    return {
      user_id: userId,
      mode: 'build_existing',
      existing_goal_id: ctx.primaryId,
      combine: ctx.combine,
      ...(ctx.replacePlanId ? { replace_plan_id: ctx.replacePlanId } : {}),
      ...(ctx.planStart ? { plan_start_date: ctx.planStart } : {}),
      preview,
      ...(Object.keys(prefs).length > 0 ? { ephemeral_conflict_preferences: prefs } : {}),
    };
  };

  const doFinalSave = async () => {
    const ctx = loopContextRef.current;
    if (!ctx) return;
    const userId = getStoredUserId();
    if (!userId) {
      navigate('/goals', { replace: true, state: { fromArcSetup: true } });
      return;
    }

    setSending(true);
    setSaveBanner('Saving your training plan…');

    const { data, error: fnErr } = await invokeFunction(
      'create-goal-and-materialize-plan',
      buildInvokeBody(userId, false),
    );

    setSending(false);
    setSaveBanner(null);

    if (fnErr || !data || (data as { success?: boolean }).success !== true) {
      const d = data as { error?: string; error_code?: string } | null;
      if (d?.error_code === 'missing_pace_benchmark') {
        navigate('/goals', { replace: true, state: { fromArcSetup: true, needPaceCalibration: true } });
        return;
      }
      setError(d?.error || (fnErr as { message?: string } | null)?.message || 'Unable to build training plan');
      return;
    }

    const planId = (data as { plan_id?: string | null }).plan_id ?? null;

    try {
      window.dispatchEvent(new CustomEvent('planned:invalidate'));
      window.dispatchEvent(new CustomEvent('goals:invalidate'));
      window.dispatchEvent(new CustomEvent('plans:refresh'));
    } catch {
      void 0;
    }

    navigate('/goals', {
      replace: true,
      state: { fromArcSetup: true, seasonPlanJustBuilt: true, builtPlanId: planId },
    });
  };

  const runIteration = async () => {
    const ctx = loopContextRef.current;
    if (!ctx) return;
    const userId = getStoredUserId();
    if (!userId) return;

    if (iterationRef.current >= MAX_ITERATIONS) {
      await doFinalSave();
      return;
    }

    setSending(true);
    setSaveBanner('Checking your plan for scheduling conflicts…');

    const { data, error: fnErr } = await invokeFunction(
      'create-goal-and-materialize-plan',
      buildInvokeBody(userId, true),
    );

    setSaveBanner(null);

    if (fnErr || !data || (data as { success?: boolean }).success !== true) {
      // Preview failed — fall through to real save rather than blocking the athlete.
      await doFinalSave();
      return;
    }

    const previewPayload = data as {
      combined_preview?: {
        conflict_resolutions?: Record<string, ServerConflictResolution[]>;
      };
    };

    const resolutionsByWeek = previewPayload.combined_preview?.conflict_resolutions;
    let firstActionable: ServerConflictResolution | null = null;

    if (resolutionsByWeek) {
      const sortedWeeks = Object.keys(resolutionsByWeek).sort((a, b) => Number(a) - Number(b));
      outer: for (const wk of sortedWeeks) {
        for (const r of resolutionsByWeek[wk] ?? []) {
          if (r.primary_option && r.secondary_option) {
            firstActionable = r;
            break outer;
          }
        }
      }
    }

    if (!firstActionable) {
      await doFinalSave();
      return;
    }

    // Drop sending so the athlete can tap the conflict buttons.
    setSending(false);

    const iteration = iterationRef.current;
    const content =
      iteration === 0
        ? `I reviewed your plan — there's one scheduling decision worth your input. ${firstActionable.explanation} ${firstActionable.science_note}`
        : `Got it. One more scheduling choice: ${firstActionable.explanation} ${firstActionable.science_note}`;

    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content,
        conflict: {
          conflictId: firstActionable!.conflict_id,
          primaryLabel: firstActionable!.primary_option!.label,
          primaryAction: firstActionable!.primary_option!.action,
          secondaryLabel: firstActionable!.secondary_option!.label,
          secondaryAction: firstActionable!.secondary_option!.action,
        },
      },
    ]);
  };

  const handleConflictChoice = async (conflictId: string, action: string, label: string) => {
    conflictPreferencesRef.current = { ...conflictPreferencesRef.current, [conflictId]: action };
    iterationRef.current += 1;

    setMessages((prev) => [...prev, { role: 'user', content: label }]);
    setSending(true);

    await runIteration();
  };

  const startLoop = async (ctx: ConflictLoopContext) => {
    loopContextRef.current = ctx;
    conflictPreferencesRef.current = {};
    iterationRef.current = 0;
    await runIteration();
  };

  return { startLoop, handleConflictChoice };
}
