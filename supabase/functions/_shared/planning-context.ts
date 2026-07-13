/**
 * Shared training context for plan generation (generate-run-plan, wizard, goal flow).
 * Reads athlete_snapshot rows + ended-plan tombstones so starting volume matches reality.
 */
import type { CompletedEvent, SwimTrainingFromWorkouts } from './arc-context.ts';
import { resolveCurrentRunEasyPace } from '../../../src/lib/resolve-current-run-pace.ts';

export type TrainingTransitionMode =
  | 'peak_bridge'
  | 'recovery_rebuild'
  | 'fresh_build'
  | 'fitness_maintenance';

export interface TrainingTransition {
  mode: TrainingTransitionMode;
  reasoning: string;
  peak_long_run_miles?: number;
  weeks_since_last_plan?: number;
}

export interface RunPlanningContext {
  transition: TrainingTransition;
  /** Rough weekly miles from latest snapshot run discipline load (same heuristic as goal flow). */
  current_weekly_miles?: number;
  recent_long_run_miles?: number;
  weeks_since_peak_long_run?: number;
  current_acwr?: number;
  volume_trend?: 'building' | 'holding' | 'declining';
}

export function classifyTrainingTransition(opts: {
  recentEndedPlans: Array<{ config: Record<string, unknown> | null }> | null | undefined;
  newDiscipline: string;
  weeksOut: number | null;
}): TrainingTransition {
  const { recentEndedPlans, newDiscipline, weeksOut } = opts;
  const tombstone = (recentEndedPlans?.[0]?.config as Record<string, unknown> | undefined)?.tombstone as
    | Record<string, unknown>
    | undefined;

  if (!tombstone) {
    return { mode: 'fresh_build', reasoning: 'No previous plan history found — building from current fitness.' };
  }

  const endedAt = tombstone.ended_at ? new Date(String(tombstone.ended_at)) : null;
  const weeksSinceEnd = endedAt
    ? Math.floor((Date.now() - endedAt.getTime()) / (7 * 24 * 60 * 60 * 1000))
    : 999;

  const completionPct = Number(tombstone.completion_pct ?? 0);
  const peakLongRun = Number(tombstone.peak_long_run_miles ?? 0);
  const prevDiscipline = String(tombstone.discipline ?? 'run').toLowerCase();
  const sameDiscipline = prevDiscipline === newDiscipline.toLowerCase();

  const wOut = weeksOut ?? 999;

  if (
    sameDiscipline &&
    completionPct >= 40 &&
    peakLongRun >= 14 &&
    weeksSinceEnd <= 3 &&
    wOut <= 12
  ) {
    return {
      mode: 'peak_bridge',
      reasoning: `You ended your ${String(tombstone.goal_name || 'previous plan')} at week ${tombstone.weeks_completed}/${tombstone.total_weeks} with a ${peakLongRun}-mile long run ${weeksSinceEnd <= 0 ? 'this week' : `${weeksSinceEnd} week${weeksSinceEnd === 1 ? '' : 's'} ago`}. Your fitness is at or near peak — bridging into ${wOut}-week taper.`,
      peak_long_run_miles: peakLongRun,
      weeks_since_last_plan: weeksSinceEnd,
    };
  }

  if (sameDiscipline && completionPct >= 20 && weeksSinceEnd > 3 && weeksSinceEnd <= 12) {
    return {
      mode: 'recovery_rebuild',
      reasoning: `Your last ${String(tombstone.goal_name || 'plan')} ended ${weeksSinceEnd} weeks ago at ${completionPct}% completion. Rebuilding conservatively from current fitness.`,
      peak_long_run_miles: peakLongRun,
      weeks_since_last_plan: weeksSinceEnd,
    };
  }

  return {
    mode: 'fresh_build',
    reasoning: weeksSinceEnd > 12
      ? `Last training block was ${weeksSinceEnd} weeks ago — treating as a fresh build.`
      : 'Building from current fitness.',
  };
}

/** Heuristic long-run miles from a completed event when snapshots/tombstones are missing. */
export function recentLongRunMilesFromCompletedEvent(distance: string, sport: string): number {
  const d = (distance || '').toLowerCase();
  const s = (sport || '').toLowerCase();
  if (d.includes('marathon') && !d.includes('half') && !d.includes('70')) return 26.2;
  if (d.includes('half') || d.includes('13.1') || d.includes('21k') || d.includes('half marathon')) return 13.1;
  if (d.includes('70.3') || d.includes('half iron') || s.includes('tri')) return 16;
  if (d.includes('ironman') || d.includes('140.6')) return s.includes('tri') ? 18 : 26.2;
  if (d.includes('ultra') || d.includes('50k')) return 20;
  return 16;
}

/** Drives combined/run transition: full = week-1 caps + recovery_rebuild; moderate = structural hint only. */
export type PostRaceRecoverySeverity = 'full' | 'moderate';

export type PostRaceRecoveryResult =
  | { apply: false }
  | {
      apply: true;
      severity: PostRaceRecoverySeverity;
      event: CompletedEvent;
      recentLongRunMilesHint: number;
      reasoning: string;
    };

/**
 * Classify a single completed event for post-race planning. Returns null if outside recovery windows.
 *
 * - **full** (≤21d): marathon, Ironman, 70.3/Half-Iron tri, ultras; **half marathon only ≤14d**
 * - **moderate** (≤21d): half marathon 15–20d; sprint/olympic tri; 5K/10K; other run
 */
export function classifyPostRaceRecoveryTier(e: CompletedEvent): PostRaceRecoverySeverity | null {
  if (e.days_ago >= 21) return null;
  const d = (e.distance || '').toLowerCase();
  const s = (e.sport || '').toLowerCase();
  const n = (e.name || '').toLowerCase();
  const hay = `${d} ${n}`;
  const isTri = s.includes('tri');
  const days = e.days_ago;

  const fullTri =
    hay.includes('ironman') ||
    hay.includes('140.6') ||
    hay.includes('70.3') ||
    hay.includes('half iron') ||
    hay.includes('half ironman');
  if (isTri && fullTri) return 'full';

  const moderateTri =
    hay.includes('sprint') ||
    hay.includes('olympic') ||
    hay.includes('standard distance') ||
    (!fullTri && isTri);

  if (isTri) {
    return moderateTri ? 'moderate' : null;
  }

  if (d.includes('marathon') && !d.includes('half') && !d.includes('70') && !hay.includes('half marathon')) {
    return 'full';
  }
  if (hay.includes('ultra') || hay.includes('50k') || hay.includes('50 mi')) {
    return 'full';
  }

  const isHalf =
    d.includes('half') ||
    d.includes('13.1') ||
    d.includes('21k') ||
    n.includes('half marathon');
  if (isHalf) {
    if (days < 14) return 'full';
    return 'moderate';
  }

  if (hay.includes('10k') || hay.includes('10 k') || d === '10k') return 'moderate';
  if (hay.includes('5k') || hay.includes('5 k') || d === '5k') return 'moderate';

  if (s === 'run' || s === '') return 'moderate';
  return null;
}

function pickStrongerPostRace(
  a: { severity: PostRaceRecoverySeverity; event: CompletedEvent },
  b: { severity: PostRaceRecoverySeverity; event: CompletedEvent },
): { severity: PostRaceRecoverySeverity; event: CompletedEvent } {
  if (a.severity === 'full' && b.severity === 'moderate') return a;
  if (b.severity === 'full' && a.severity === 'moderate') return b;
  return a.event.days_ago <= b.event.days_ago ? a : b;
}

/**
 * A recent run or tri finish (from Arc `recent_completed_events`) may start the next plan
 * in full post-race mode (marathon / IM / 70.3, HM ≤14d) or moderate structural load only (shorter races, HM 15–20d).
 */
export function findPostRaceRecoveryContext(
  events: CompletedEvent[] | null | undefined,
  newGoalSport: string,
): PostRaceRecoveryResult {
  const goal = (newGoalSport || '').toLowerCase();
  if (!['run', 'tri', 'triathlon'].includes(goal)) return { apply: false };
  if (!events?.length) return { apply: false };

  let best: { severity: PostRaceRecoverySeverity; event: CompletedEvent } | null = null;
  for (const e of events) {
    const s = (e.sport || '').toLowerCase();
    if (s !== 'run' && !s.includes('tri')) continue;
    const tier = classifyPostRaceRecoveryTier(e);
    if (!tier) continue;
    const cand = { severity: tier, event: e };
    best = best ? pickStrongerPostRace(best, cand) : cand;
  }

  if (!best) return { apply: false };

  const hint = recentLongRunMilesFromCompletedEvent(best.event.distance, best.event.sport);
  const reasoning =
    best.severity === 'full'
      ? `Recent "${best.event.name}" (${best.event.days_ago}d ago) — full post-race recovery from event peak.`
      : `Recent "${best.event.name}" (${best.event.days_ago}d ago) — lighter transition (moderate structural load).`;

  return {
    apply: true,
    severity: best.severity,
    event: best.event,
    recentLongRunMilesHint: hint,
    reasoning,
  };
}

function parseMmSsToSecondsLocal(s: string | null | undefined): number | null {
  if (s == null || !String(s).trim()) return null;
  const parts = String(s)
    .trim()
    .split(':')
    .map((p) => parseInt(p, 10));
  if (parts.some((x) => !Number.isFinite(x))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/**
 * Seconds per **100 yards** (pool) — learned swims win when confident; else Training Baselines
 * (`swimPace100` mm:ss or numeric sec). Metric baselines store pace per 100m → scaled to 100yd time.
 */
// STAGED (D-199 swim learner): flip to true ONLY after Michael eyeballs a clean CSS number.
// true  → clean-beats-dirty precedence: confident swim_css > manual typed > (possibly dirty) median.
// false → CURRENT behavior unchanged: learned median > manual. Default OFF so nothing moves live.
const SWIM_CSS_LIVE = false;

/** Confident learned/tested CSS (the clean threshold). Only moderate/high tiers drive. */
function readSwimCssSecPer100Yd(lf: Record<string, unknown> | null | undefined): number | null {
  if (!lf || typeof lf !== 'object' || Array.isArray(lf)) return null;
  const css = lf['swim_css_sec_per_100m'];
  if (!css || typeof css !== 'object') return null;
  const o = css as Record<string, unknown>;
  const v = Number(o.value);
  const c = String(o.confidence || '').toLowerCase();
  if (Number.isFinite(v) && v >= 40 && v <= 300 && (c === 'moderate' || c === 'high')) return v * (91.44 / 100);
  return null;
}

/** Learned MEDIAN typical pace (≥3 samples). Possibly dirty — last resort under SWIM_CSS_LIVE. */
function readSwimMedianSecPer100Yd(lf: Record<string, unknown> | null | undefined): number | null {
  if (!lf || typeof lf !== 'object' || Array.isArray(lf)) return null;
  const m = lf['swim_pace_per_100m'];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  const sc = Number(o.sample_count) || 0;
  const c = String(o.confidence || '').toLowerCase();
  if (sc >= 3 && !(c === 'low' && sc < 5)) {
    const v = Number(o.value);
    if (Number.isFinite(v) && v >= 50 && v <= 600) return v * (91.44 / 100);
  }
  return null;
}

/** Manual typed Training-Baselines pace (swimPace100 mm:ss /100yd, or numeric). */
function readSwimManualSecPer100Yd(perf: Record<string, unknown> | null | undefined, units?: string | null): number | null {
  if (!perf || typeof perf !== 'object') return null;
  for (const k of ['swimPace100', 'swim_pace_100_yd', 'swim_pace_100yd']) {
    const raw = perf[k];
    if (raw == null) continue;
    const sec = parseMmSsToSecondsLocal(typeof raw === 'string' ? raw : String(raw));
    if (sec != null && sec > 0 && sec <= 600) return sec;
  }
  const numRaw = perf['swimPacePer100'] ?? perf['swim_pace_per_100_sec'];
  const n = typeof numRaw === 'number' ? numRaw : Number(numRaw);
  if (!Number.isFinite(n) || n <= 0 || n > 600) return null;
  return String(units || '').toLowerCase() === 'metric' ? n * (91.44 / 100) : n;
}

/**
 * Seconds per **100 yards** (pool) — the single swim-pace resolver for plan-gen.
 * STAGED OFF (SWIM_CSS_LIVE=false): current behavior — learned median wins, else manual.
 * When flipped on: clean swim_css (confident) > manual > median (clean-beats-dirty, the better #4).
 */
export function swimSecPer100YdFromArcSwimInputs(opts: {
  performance_numbers?: Record<string, unknown> | null;
  learned_fitness?: Record<string, unknown> | null;
  units?: string | null;
}): number | null {
  const lf = opts.learned_fitness;
  const perf = opts.performance_numbers;
  if (SWIM_CSS_LIVE) {
    return readSwimCssSecPer100Yd(lf) ?? readSwimManualSecPer100Yd(perf, opts.units) ?? readSwimMedianSecPer100Yd(lf);
  }
  // STAGED OFF — unchanged: learned median > manual
  return readSwimMedianSecPer100Yd(lf) ?? readSwimManualSecPer100Yd(perf, opts.units);
}

export interface SwimVolumeMultiplierOpts {
  /** Pool pace seconds per 100 yd (see {@link swimSecPer100YdFromArcSwimInputs}). */
  swimSecPer100Yd?: number | null;
  /**
   * When an **A-priority tri** drives the combined block, sparse swim history must not be the only
   * signal: slow baselines need repetition exposure (yards), not an extra down-scale from zero swims.
   */
  triPrimaryWithSwimLeg?: boolean;
}

/**
 * Down-scale combined-plan swim yards when Arc shows little or no recent pool volume.
 * Without this, swim TSS share × 80 yd/min produces ~3–4k yd main sets for "returning" athletes.
 *
 * Optional **pace floors** (tri primary): if baseline/learned pace is slow (≥2:15–2:30/100yd),
 * history-only multipliers are lifted so lean histories don't compound under-swimming for cutoff-risk athletes.
 */
export function swimVolumeMultiplierFromArcWorkouts(
  st: SwimTrainingFromWorkouts | null | undefined,
  opts?: SwimVolumeMultiplierOpts,
): number {
  let m: number;
  if (!st) m = 0.5;
  else {
    const n90 = st.completed_swim_sessions_last_90_days ?? 0;
    const n28 = st.completed_swim_sessions_last_28_days ?? 0;
    if (n90 === 0 && n28 === 0) m = 0.42;
    else if (n90 <= 2) m = 0.52;
    else if (n90 <= 6) m = 0.68;
    else if (n90 <= 14) m = 0.85;
    else m = 1.0;
  }

  const sec = opts?.swimSecPer100Yd;
  const tri = opts?.triPrimaryWithSwimLeg === true;
  if (tri && typeof sec === 'number' && Number.isFinite(sec)) {
    if (sec >= 150) m = Math.max(m, 0.82);
    else if (sec >= 135) m = Math.max(m, 0.74);
  }

  return Math.min(1, m);
}

/**
 * Pure: same inputs the goal flow already loads in one Promise.all.
 */
export function computeRunPlanningSignals(
  baseline: Record<string, unknown> | null | undefined,
  recentSnapshots: Array<Record<string, unknown>> | null | undefined,
  recentEndedPlans: Array<{ config: Record<string, unknown> | null }> | null | undefined,
  opts: {
    newDiscipline: string;
    weeksOut?: number | null;
  },
): RunPlanningContext {
  const newDiscipline = (opts.newDiscipline || 'run').toLowerCase();
  const weeksOut = opts.weeksOut ?? null;

  const snapshot = recentSnapshots?.[0] ?? null;
  const transition = classifyTrainingTransition({
    recentEndedPlans,
    newDiscipline,
    weeksOut,
  });

  const current_weekly_miles = snapshot?.workload_by_discipline &&
      typeof (snapshot.workload_by_discipline as any)?.run === 'number'
    ? Math.round(Number((snapshot.workload_by_discipline as any).run) / 10)
    : undefined;

  let recent_long_run_miles: number | undefined;
  let weeks_since_peak_long_run: number | undefined;
  let current_acwr: number | undefined;
  let volume_trend: 'building' | 'holding' | 'declining' | undefined;

  if (transition.peak_long_run_miles && transition.peak_long_run_miles > 0) {
    recent_long_run_miles = transition.peak_long_run_miles;
  }

  if (recentSnapshots && recentSnapshots.length > 0) {
    // D-285 / LAW 2 — was `?? 600` (an invented 10:00/mi). Same conversion, same lie as end-plan-core:
    // it turns a long-run DURATION into MILES, so an invented pace silently rewrites the athlete's recorded
    // long-run volume by ~10%. Routed through the ONE run-pace resolver; unknown pace -> we do not convert.
    const easyPaceSecPerMile: number | null = resolveCurrentRunEasyPace(baseline as any).sec_per_mi;
    const snapshotsWithLongRun = recentSnapshots
      .map((s: any, idx: number) => ({
        duration: s.run_long_run_duration as number | null,
        weeksAgo: idx,
      }))
      .filter((s): s is { duration: number; weeksAgo: number } => s.duration != null && s.duration > 0);

    // Unknown pace -> we cannot convert duration to miles. Skip; do NOT manufacture a mileage (Law 2).
    if (snapshotsWithLongRun.length > 0 && easyPaceSecPerMile != null) {
      const peakSnapshot = snapshotsWithLongRun.reduce((best, s) => (s.duration > best.duration ? s : best));
      const snapshotLongRun = Math.round((peakSnapshot.duration * 60 / easyPaceSecPerMile) * 10) / 10;

      if (!recent_long_run_miles || snapshotLongRun > recent_long_run_miles) {
        recent_long_run_miles = snapshotLongRun;
      }
      weeks_since_peak_long_run = peakSnapshot.weeksAgo;
    }

    const latestAcwr = recentSnapshots[0]?.acwr;
    if (latestAcwr != null && Number.isFinite(Number(latestAcwr))) {
      current_acwr = Number(latestAcwr);
    }

    if (recentSnapshots.length >= 2) {
      const newest = Number(recentSnapshots[0]?.workload_total ?? 0);
      const oldest = Number(recentSnapshots[recentSnapshots.length - 1]?.workload_total ?? 0);
      if (oldest > 0) {
        const pct = (newest - oldest) / oldest;
        volume_trend = pct > 0.10 ? 'building' : pct < -0.10 ? 'declining' : 'holding';
      }
    }
  }

  return {
    transition,
    ...(current_weekly_miles != null && current_weekly_miles > 0 ? { current_weekly_miles } : {}),
    ...(recent_long_run_miles != null ? { recent_long_run_miles } : {}),
    ...(weeks_since_peak_long_run != null ? { weeks_since_peak_long_run } : {}),
    ...(current_acwr != null ? { current_acwr } : {}),
    ...(volume_trend ? { volume_trend } : {}),
  };
}

export async function buildRunPlanningContext(
  supabase: { from: (t: string) => any },
  userId: string,
  opts: {
    newDiscipline: string;
    weeksOut?: number | null;
  },
): Promise<RunPlanningContext> {
  const [{ data: baseline }, { data: recentSnapshots }, { data: recentEndedPlans }] = await Promise.all([
    supabase.from('user_baselines').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('athlete_snapshot')
      .select('week_start, run_long_run_duration, acwr, workload_total, workload_by_discipline')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(8),
    supabase
      .from('plans')
      .select('id, config, duration_weeks, created_at')
      .eq('user_id', userId)
      .in('status', ['ended', 'completed'])
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  return computeRunPlanningSignals(baseline, recentSnapshots, recentEndedPlans, opts);
}
