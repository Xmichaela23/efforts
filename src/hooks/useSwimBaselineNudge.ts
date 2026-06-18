import { useEffect, useState } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { swimBaselineNudge, type SwimNudgeResult } from '@/lib/swimBaselineNudge';

/**
 * Swim baseline re-test nudge (D-200 / D-201). Self-contained: fetches the user's recent swims (date +
 * popup clean flag) and the last swim-baseline update timestamp, runs the pure honored-swim-gated rule.
 * Returns null until resolved. STATE-screen only (it's a fitness-marker insight, not a baseline control).
 */
export function useSwimBaselineNudge(): SwimNudgeResult | null {
  const [result, setResult] = useState<SwimNudgeResult | null>(null);

  useEffect(() => {
    const uid = getStoredUserId();
    if (!uid) return;
    let cancelled = false;

    void (async () => {
      const since = new Date(Date.now() - 70 * 86_400_000).toISOString().slice(0, 10); // ~10 weeks back
      const [swimsRes, ubRes] = await Promise.all([
        supabase.from('workouts').select('date, workout_metadata').eq('user_id', uid).eq('type', 'swim').gte('date', since),
        supabase.from('user_baselines').select('performance_numbers, learned_fitness').eq('user_id', uid).maybeSingle(),
      ]);
      if (cancelled) return;

      const parse = (x: any) => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return x; } };
      const pn = parse(ubRes.data?.performance_numbers) || {};
      const lf = parse(ubRes.data?.learned_fitness) || {};
      // "last update" = most recent of the manual save stamp and any CSS-test write.
      const manualAt = pn?.swimPace100_updated_at || null;
      const css = lf?.swim_css_sec_per_100m || {};
      const testedAt = css?.tested_at || css?.last_updated || null;
      const lastUpdatedAt = [manualAt, testedAt].filter(Boolean).sort().pop() || null;

      const swims = (swimsRes.data || []).map((s: any) => {
        const m = parse(s.workout_metadata) || {};
        return { date: s.date, swam_as_planned: m?.swam_as_planned };
      });

      setResult(swimBaselineNudge({ swims, lastUpdatedAt, nowISO: new Date().toISOString() }));
    })();

    return () => { cancelled = true; };
  }, []);

  return result;
}
