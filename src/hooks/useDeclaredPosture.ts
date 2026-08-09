import { useEffect, useState } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { sanitizePosture, type PerDisciplinePosture } from '@shared/state-trend';

/**
 * The athlete's declared `per_discipline_posture`, off the active goal.
 *
 * ⛔ EXTRACTED SO THE SWAP AND THE STATE SCREEN READ ONE THING. `useStateTrends` already performs
 * exactly this query for exactly this field — *"Declared posture … config, not computed"* — and the
 * discipline swap now needs it too, on three surfaces. A second inline copy in each of them is four
 * readers of one fact, which is how they start disagreeing about whether a discipline is being
 * developed.
 *
 * ⚠️ CONFIG, NOT COMPUTED. This is what the athlete DECLARED at intake, not what the numbers say
 * they did. The swap gate is a question about the plan's intent — "is this discipline being trained
 * or held" — so the declared value is the right one, and a stale snapshot must not overrule it.
 *
 * ⚠️ NULL MEANS UNDECLARED, NOT "develop". Race plans and anything built before postures existed
 * carry none; `getDisciplineSwaps` treats null as no verdict and behaves exactly as it did before
 * this gate existed (`SPEC-week-solver` §0h — a missing signal is not a verdict).
 */
export function useDeclaredPosture(): PerDisciplinePosture | null {
  const [posture, setPosture] = useState<PerDisciplinePosture | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = getStoredUserId();
      if (!userId) return;
      try {
        // The same single-row read `useStateTrends` does — newest active goal, its training_prefs.
        const { data } = await supabase
          .from('goals')
          .select('training_prefs')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        const prefs = data?.training_prefs as { per_discipline_posture?: unknown } | null | undefined;
        setPosture(sanitizePosture(prefs?.per_discipline_posture));
      } catch {
        // ⚠️ A failed read leaves posture NULL, which un-gates the swap rather than hiding it. That
        // is the safe direction: the athlete keeps a control they had, and no develop-discipline
        // swap is offered on the strength of a guess — it is offered on the strength of not knowing,
        // which is the pre-existing behaviour.
        if (!cancelled) setPosture(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return posture;
}

export default useDeclaredPosture;
