import type { TrainingIntent } from '@/lib/training-intent';

const ARC_SETUP_RE = /<arc_setup>\s*([\s\S]*?)\s*<\/arc_setup>/i;

export type ArcSetupPayload = {
  summary?: string;
  goals?: unknown[];
  athlete_identity?: Record<string, unknown>;
  /**
   * Arc-level default for `training_prefs.training_intent` when a goal omits it.
   * @see `src/lib/training-intent.ts`
   */
  default_intent?: TrainingIntent;
  /** Optional top-level; merged into each goal's training_prefs when saving */
  strength_frequency?: 0 | 1 | 2 | 3;
  strength_focus?: 'general' | 'power' | 'maintenance';
};

function innerJsonToParse(inner: string): string {
  let s = inner.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  }
  return s.trim();
}

/**
 * If visible prose ends with a question, the coach is still waiting on the athlete;
 * "Ready to save" should not appear in the same turn (avoids card + open question at once).
 */
export function coachVisibleProseSeeksReply(visible: string): boolean {
  const t = visible.trim();
  if (!t) return false;
  return /[?？]\s*$/.test(t);
}

/**
 * Triathlon event goals must have strength_intent + preferred_days (long ride/run, strength[], swim[],
 * quality_run + easy_run for weekly run rhythm)
 * before the confirm card appears — matches Arc coach instructions.
 */
export function arcEventGoalsHaveRequiredTrainingPrefs(payload: ArcSetupPayload | null): boolean {
  if (!payload?.goals || !Array.isArray(payload.goals)) return false;
  const goals = payload.goals as Record<string, unknown>[];
  const triEventGoals = goals.filter(
    (g) =>
      String(g?.goal_type ?? '').toLowerCase() === 'event' &&
      ['triathlon', 'tri'].includes(String(g?.sport ?? '').toLowerCase()),
  );
  if (triEventGoals.length === 0) return true;
  return triEventGoals.every((g) => {
    const tp = g.training_prefs;
    if (!tp || typeof tp !== 'object' || Array.isArray(tp)) return false;
    const prefs = tp as Record<string, unknown>;
    const si = prefs.strength_intent ?? prefs.strengthIntent;
    if (si !== 'support' && si !== 'performance') return false;
    const pd = prefs.preferred_days ?? prefs.preferredDays;
    if (!pd || typeof pd !== 'object' || Array.isArray(pd)) return false;
    const pdo = pd as Record<string, unknown>;
    if (pdo.long_ride == null && pdo.longRide == null) return false;
    if (pdo.long_run == null && pdo.longRun == null) return false;
    const st = pdo.strength;
    if (!Array.isArray(st) || st.length === 0) return false;
    const sw = pdo.swim;
    if (!Array.isArray(sw) || sw.length === 0) return false;
    const qRun =
      pdo.quality_run ??
      pdo.qualityRun ??
      pdo.tempo_run ??
      pdo.tempoRun ??
      pdo.run_quality ??
      pdo.runQuality;
    const eRun =
      pdo.easy_run ??
      pdo.easyRun ??
      pdo.mid_week_easy_run ??
      pdo.midWeekEasyRun ??
      pdo.recovery_run ??
      pdo.recoveryRun;
    if (qRun == null || eRun == null) return false;
    const qBike =
      pdo.quality_bike ??
      pdo.qualityBike ??
      pdo.bike_quality ??
      pdo.bikeQuality ??
      pdo.mid_week_quality_bike;
    const eBike = pdo.easy_bike ?? pdo.easyBike ?? pdo.bike_easy ?? pdo.bikeEasy ?? pdo.mid_week_easy_bike;
    if (qBike == null || eBike == null) return false;
    const dpwRaw = prefs.days_per_week ?? prefs.daysPerWeek;
    let dpwNum = NaN;
    if (typeof dpwRaw === 'number' && Number.isFinite(dpwRaw)) dpwNum = Math.round(dpwRaw);
    else if (typeof dpwRaw === 'string' && /^\s*\d+\s*$/.test(dpwRaw)) {
      dpwNum = parseInt(dpwRaw.trim(), 10);
    }
    if (!Number.isFinite(dpwNum) || dpwNum < 4 || dpwNum > 7) return false;
    return true;
  });
}

export function parseArcSetupFromAssistant(raw: string): {
  displayText: string;
  payload: ArcSetupPayload | null;
} {
  const m = raw.match(ARC_SETUP_RE);
  const displayText = (m ? raw.replace(ARC_SETUP_RE, '') : raw).trim();
  if (!m) {
    return { displayText, payload: null };
  }
  try {
    const parsed = JSON.parse(innerJsonToParse(m[1])) as ArcSetupPayload;
    return { displayText, payload: parsed && typeof parsed === 'object' ? parsed : null };
  } catch {
    return { displayText, payload: null };
  }
}
