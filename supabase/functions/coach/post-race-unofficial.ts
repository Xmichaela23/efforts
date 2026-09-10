/**
 * THE UNOFFICIAL FINISH — after race day, before a result is saved (2026-09-10, audit H-B10).
 *
 * ⛔ STATE PRINTS THIS; IT NO LONGER FINDS THE RACE ITSELF. State read the race day's workouts from the phone,
 * picked a run, and worked out the days since the race and the gap to the model. The workout is now
 * `pickRaceDayWorkout` — the pick `complete-race` saves as the official result — so the finish State shows
 * before the save and the one saved are the same workout.
 *
 * The gates are State's, moved unchanged: the active plan's run goal (or the plan's own race date), at least
 * one day past race day, and no saved result on that goal. The words are State's, moved word for word.
 */
import { actualFinishSecondsPreferElapsed, type WorkoutTimeRow } from '../_shared/race-finish-seconds.ts';
import { pickRaceDayWorkout } from '../_shared/race-day-workout.ts';
import { fmtFinishClock } from '../_shared/course-strategy-helpers.ts';

export type PostRaceUnofficialV1 = {
  /** The plan's run goal; null when the race date came from the plan alone. */
  goal_id: string | null;
  race_date: string;
  workout_id: string;
  logged_seconds: number;
  /** "3:41:07" */
  logged_display: string;
  days_after_race: number;
  /** "1 day after race" · "3 days after race" · "after your race" */
  days_after_label: string;
  /** The model's finish (`race_readiness.predicted_finish_display`); null = no model lines. */
  model_projected_display: string | null;
  /** "+4:12 vs model" · "−1:03 vs model" · "same as model projection"; null with no model. */
  gap_display: string | null;
};

type GoalRef = { id: string; sport?: string | null; target_date?: string | null; plan_id?: string | null };

export type PostRaceCandidate = {
  goal_id: string | null;
  race_date: string;
  goal_sport: string | null;
  days_after_race: number;
};

const isRunPrimary = (g: { sport?: string | null }) => {
  const s = String(g.sport || '').toLowerCase();
  return s === 'run' || s === 'running' || !g.sport;
};

const trimmed = (s: string | null | undefined) => (typeof s === 'string' && s.trim() ? s.trim() : null);

/** The race whose unofficial finish State shows, before any workout is read; null = show nothing. */
export function postRaceCandidate(args: {
  asOfDate: string;
  activePlanId: string | null;
  activePlans: Array<{ plan_id: string; race_date?: string | null }>;
  goals: GoalRef[];
  primaryEventId: string | null;
  /** `race_finish_projection_v1.goal_id` */
  projectionGoalId: string | null;
  /** `race_readiness.goal.id` */
  readinessGoalId: string | null;
  /** `last_completed_race.goal_id` */
  lastCompletedRaceGoalId: string | null;
}): PostRaceCandidate | null {
  const planId = args.activePlanId;
  const gLink = planId ? args.goals.find((g) => g.plan_id === planId && isRunPrimary(g)) : undefined;
  const entry = planId ? args.activePlans.find((p) => p.plan_id === planId) : undefined;
  const raceDate =
    gLink?.target_date?.slice(0, 10) || (entry?.race_date ? String(entry.race_date).slice(0, 10) : null);
  const asOf = String(args.asOfDate || '').slice(0, 10);
  if (!raceDate || asOf <= raceDate) return null;
  const days = Math.floor((Date.parse(asOf + 'T12:00:00Z') - Date.parse(raceDate + 'T12:00:00Z')) / 86_400_000);
  if (!(days >= 1)) return null;
  const saved = args.lastCompletedRaceGoalId;
  if (saved) {
    // State's goal for the race block: the projection's, the readiness', the primary event's, then the plan's.
    const resolved =
      trimmed(args.projectionGoalId) || trimmed(args.readinessGoalId) || trimmed(args.primaryEventId) || trimmed(gLink?.id);
    if (resolved && saved === resolved) return null;
    if (gLink?.id && saved === gLink.id) return null;
    if (args.primaryEventId && saved === args.primaryEventId) return null;
  }
  return { goal_id: gLink?.id ?? null, race_date: raceDate, goal_sport: gLink?.sport ?? null, days_after_race: days };
}

/** "+MM:SS vs model" / "−H:MM:SS vs model" — actual minus the model. */
export function signedDeltaVsModel(actualSec: number, modelSec: number): string {
  const d = actualSec - modelSec;
  if (d === 0) return 'same as model projection';
  const sign = d < 0 ? '−' : '+';
  const ad = Math.abs(Math.round(d));
  const h = Math.floor(ad / 3600);
  const mi = Math.floor((ad % 3600) / 60);
  const s = ad % 60;
  const body = h > 0 ? `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${mi}:${String(s).padStart(2, '0')}`;
  return `${sign}${body} vs model`;
}

export function daysAfterRaceLabel(wk: number): string {
  return wk === 1 ? '1 day after race' : wk < 7 ? `${wk} days after race` : 'after your race';
}

/** The candidate plus the race day's completed workouts → the payload, or null when no workout is the race. */
export function buildPostRaceUnofficial(
  candidate: PostRaceCandidate,
  raceDayRows: Array<WorkoutTimeRow & { id: unknown; type?: unknown; computed?: unknown }>,
  model: { seconds: number; display: string } | null,
): PostRaceUnofficialV1 | null {
  const pick = pickRaceDayWorkout(raceDayRows, candidate.goal_sport);
  if (!pick) return null;
  const sec = actualFinishSecondsPreferElapsed(pick);
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const hasModel = !!model && Number.isFinite(model.seconds) && model.seconds > 0;
  return {
    goal_id: candidate.goal_id,
    race_date: candidate.race_date,
    workout_id: String(pick.id),
    logged_seconds: sec,
    logged_display: fmtFinishClock(sec),
    days_after_race: candidate.days_after_race,
    days_after_label: daysAfterRaceLabel(candidate.days_after_race),
    model_projected_display: hasModel ? model!.display : null,
    gap_display: hasModel ? signedDeltaVsModel(sec, model!.seconds) : null,
  };
}
