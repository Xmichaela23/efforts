// =============================================================================
// associate-candidates — ranking for the MANUAL associate (the human's override)
// =============================================================================
//
// ⛔ THE AUTO-MATCHER STAYS STRICT. `auto-attach-planned:419` filters `.eq('type', finalSport)` and
// must keep doing so: a silent cross-sport auto-match would make substitutions invisible in exactly
// the planned-vs-done accounting that currently renders them honestly. This file widens ONLY the
// manual path — the athlete saying, by hand, "this run is the ride I had planned."
//
// ⚠️ THE DIALOG WAS ALREADY THE HUMAN-OVERRIDE TOOL AND WAS ONLY HALF BUILT. It searched a ±N-day
// WINDOW (more permissive than the matcher's exact day) and then filtered discipline exactly as
// strictly as the matcher (`AssociatePlannedDialog:55`). So it already accepted that a human may
// override the DATE rule, and simply never considered that they might override the SPORT rule —
// which is the rule the discipline swap makes wrong.
//
// ⛔ THE SLOT KEEPS ITS PRESCRIPTION. Linking a run to a planned ride marks the ride COMPLETE and
// leaves it a ride. The plan records what it asked for; `planned` and `done` are counted separately
// (`coach/index.ts:5518-5522`), so the substitution shows up as itself instead of being erased. This
// is TrainingPeaks' behaviour and it is also the only version that keeps the week-mix honest.

export type CandidateRow = {
  id: string;
  name?: string | null;
  type?: string | null;
  date?: string | null;
  workout_status?: string | null;
};

export type RankedCandidate = CandidateRow & {
  /** True when the planned session is the same sport as the completed activity. */
  sameSport: boolean;
  /** Shown on cross-sport rows so the athlete is told what they are doing. Null on same-sport rows. */
  crossSportNote: string | null;
};

export type RankedCandidates = {
  sameSport: RankedCandidate[];
  otherSport: RankedCandidate[];
};

const SPORT_OF: Record<string, string> = {
  run: 'run', running: 'run', jog: 'run',
  ride: 'ride', bike: 'ride', cycling: 'ride', cycle: 'ride',
  swim: 'swim', swimming: 'swim',
  strength: 'strength', weights: 'strength',
  walk: 'walk', hike: 'walk',
  mobility: 'mobility',
};

/** Same normalisation the server uses (`auto-attach-planned:16` `sportSubtype`). One vocabulary. */
export function normalizeSport(t: string | null | undefined): string {
  const s = String(t ?? '').trim().toLowerCase();
  if (!s) return '';
  if (SPORT_OF[s]) return SPORT_OF[s];
  if (s.includes('ride') || s.includes('bike') || s.includes('cycl')) return 'ride';
  if (s.includes('run') || s.includes('jog')) return 'run';
  if (s.includes('swim')) return 'swim';
  if (s.includes('strength') || s.includes('weight')) return 'strength';
  if (s.includes('walk') || s.includes('hike')) return 'walk';
  if (s.includes('mobility')) return 'mobility';
  return s;
}

const LABEL: Record<string, string> = {
  run: 'run', ride: 'ride', swim: 'swim', strength: 'strength', walk: 'walk', mobility: 'mobility',
};

/**
 * Split and order the planned rows a completed activity may be linked to.
 *
 * ⛔ SAME SPORT FIRST, ALWAYS — and not merely sorted above. They are a separate list, so the UI can
 * render the cross-sport ones under a labelled divider rather than mixing them into one column where
 * a mis-tap costs the athlete their week's accounting.
 *
 * ⚠️ ORDER WITHIN EACH GROUP IS BY DATE DISTANCE, then date. The activity's own day is the likeliest
 * link and should not sit below a session three days out just because that one sorts earlier.
 *
 * ⛔ NOTHING IS EXCLUDED FOR BEING CROSS-SPORT. That is the whole change: warn, never gate.
 */
export function rankAssociateCandidates(
  workoutType: string | null | undefined,
  workoutDate: string | null | undefined,
  rows: ReadonlyArray<CandidateRow>,
): RankedCandidates {
  const mySport = normalizeSport(workoutType);
  const myDay = String(workoutDate ?? '').slice(0, 10);

  const dayDistance = (d: string | null | undefined): number => {
    const other = String(d ?? '').slice(0, 10);
    if (!myDay || !other) return 999;
    const a = Date.parse(`${myDay}T00:00:00`);
    const b = Date.parse(`${other}T00:00:00`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 999;
    return Math.abs(Math.round((b - a) / 86400000));
  };

  const decorated: RankedCandidate[] = (rows ?? []).map((r) => {
    const theirSport = normalizeSport(r.type);
    const sameSport = !!mySport && theirSport === mySport;
    return {
      ...r,
      sameSport,
      crossSportNote: sameSport
        ? null
        // ⚠️ States the swap plainly and does not moralise. The athlete is telling the app what
        // happened; the app's job is to make sure they meant it, not to argue.
        : `Planned ${LABEL[theirSport] ?? (theirSport || 'session')} — you did a ${LABEL[mySport] ?? (mySport || 'session')}`,
    };
  });

  const order = (a: RankedCandidate, b: RankedCandidate) => {
    const dd = dayDistance(a.date) - dayDistance(b.date);
    if (dd !== 0) return dd;
    return String(a.date ?? '').localeCompare(String(b.date ?? ''));
  };

  return {
    sameSport: decorated.filter((c) => c.sameSport).sort(order),
    otherSport: decorated.filter((c) => !c.sameSport).sort(order),
  };
}

/**
 * ⛔ DID THIS COMPLETED ACTIVITY MISS A PLANNED SLOT THAT DAY? — the cue's one question.
 *
 * ⚠️ IT IS NOT "is this workout unlinked". An athlete who does an extra easy spin on a rest day has
 * an unlinked workout and has missed nothing; nagging them there is how a marker teaches people to
 * ignore markers. The cue fires only when the day HELD a planned session that is still un-done —
 * which is exactly the swap-then-did-the-other-sport case, and exactly what TrainingPeaks surfaces.
 */
export function isUnmatchedAgainstPlan(
  workout: { id?: string; planned_id?: string | null; workout_status?: string | null; type?: string | null },
  sameDayPlanned: ReadonlyArray<CandidateRow & { completed_workout_id?: string | null }>,
): boolean {
  const isCompleted = String(workout?.workout_status ?? '').toLowerCase() === 'completed';
  if (!isCompleted) return false;
  if (workout?.planned_id) return false;   // already linked — nothing to say
  return (sameDayPlanned ?? []).some((p) => {
    const done = String(p.workout_status ?? '').toLowerCase() === 'completed' || !!p.completed_workout_id;
    return !done;
  });
}

/** The in-view copy: names the session that is still owed, so "Attach" stops being a bare verb. */
export function unmatchedPrompt(
  sameDayPlanned: ReadonlyArray<CandidateRow & { completed_workout_id?: string | null }>,
): string {
  const owed = (sameDayPlanned ?? []).filter(
    (p) => String(p.workout_status ?? '').toLowerCase() !== 'completed' && !p.completed_workout_id,
  );
  const sport = owed.length ? (LABEL[normalizeSport(owed[0].type)] ?? 'session') : 'session';
  return `Didn't match your planned ${sport} — link it?`;
}
