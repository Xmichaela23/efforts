/**
 * POSTURE — what the athlete SAID they wanted, joined to what the numbers DID.
 *
 * Q-179, the continuity fracture, with a live receipt (2026-07-14):
 *   goals.training_prefs.per_discipline_posture = { run: 'maintain', strength: 'develop', ... }
 * The athlete declared RUN = MAINTAIN while building strength. He then ran 3x/month (down from
 * 19x), and his speed at a given heart rate fell — exactly what a maintain posture implies.
 * State rendered "aerobic base needs work" and "Efficiency: sliding", in orange and red.
 *
 * ⛔ THE APP SCOLDED HIM FOR FOLLOWING HIS OWN PLAN.
 *
 * Every number was correct. The intent was written down at plan build (D-210) and never read
 * again: `per_discipline_posture` appeared ZERO times in the spine and ZERO times in the coach.
 *
 * THIS FILE IS THE JOIN. It does not touch a single number. It decides what a verdict MEANS
 * given what the athlete was trying to do — because "slower" is not a finding, it is an
 * observation, and the same observation is a WIN, a TRADE, or a WARNING depending on the intent.
 *
 * Field grounding (verified 2026-07-14). Garmin does exactly this and it is the whole of its
 * user-facing vocabulary: the same declining fitness number is "Detraining" (you stopped),
 * "Overreaching" (you overdid it), or "Unproductive" (you didn't, and we don't know why) — three
 * labels, three prescriptions, one number. What Garmin CANNOT do is ask what you wanted; it has
 * no posture. Efforts asked. See SPEC-posture-flag.md §1.
 *
 * ⛔ WHAT THIS FILE MUST NEVER DO (SPEC-posture-flag.md §6, Law 2):
 *  - It is NOT a compliance cop. Missing a maintain target is a TRADE, not a failure. The app's
 *    job is not to stop you moving along the spectrum — it is to make sure you KNOW you moved.
 *  - It NEVER says "you are losing fitness." That is an inference we have not earned.
 *  - It NEVER invents a cause. We cannot see sleep, stress, illness or nutrition. Garmin CAN,
 *    and still refuses: "This may not necessarily be because of excessive training loads."
 *  - No composite score. Ever.
 */

/** The athlete's declared intent for one discipline (D-210). */
export type Posture = 'develop' | 'maintain' | 'out';

/** Declared intent per discipline, as stored on `goals.training_prefs.per_discipline_posture`. */
export type PerDisciplinePosture = Partial<Record<string, Posture>>;

/**
 * What a performance verdict MEANS once the declared intent is known.
 *
 * ⚠ `unknown` is load-bearing: when no posture was declared, the read is `unknown` and every
 * surface must fall back to EXACTLY today's behaviour. An athlete with no declared posture must
 * see no change whatsoever. This keeps the change additive and un-regressive.
 */
export type PostureRead =
  /** develop + improving — the plan is working. */
  | 'developing'
  /** develop + holding — trying to build, not building. Worth surfacing. */
  | 'develop_stalled'
  /** develop + sliding — THE REAL WARNING. This is the only read that earns alarm. */
  | 'develop_declining'
  /** maintain + still doing it — the trade is being honoured. */
  | 'maintaining'
  /** maintain + still doing it + slower in the sessions they did — the expected cost. State, never scold. */
  | 'maintain_slipping'
  /** maintain + THEY STOPPED DOING IT. The Tier-1 fact: their words next to their calendar.
   *  Not a failure — a trade they may not have noticed making. This is the one the app owed him. */
  | 'maintain_dropped'
  /** posture = out — the athlete parked this discipline. Do not grade it at all. */
  | 'parked'
  /** no posture declared — behave exactly as before. */
  | 'unknown';

/** Sanitize an arbitrary bag off `training_prefs` into postures we recognise. Unknown → dropped. */
export function sanitizePosture(raw: unknown): PerDisciplinePosture | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: PerDisciplinePosture = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const d = String(k).toLowerCase();
    const p = String(v).toLowerCase();
    if (p === 'develop' || p === 'maintain' || p === 'out') out[d] = p as Posture;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * What the athlete actually DID, for the discipline in question.
 *
 * ⛔ WHY THIS EXISTS — I got this wrong on the first cut and it nearly shipped (2026-07-14).
 * I joined posture to the PERFORMANCE VERDICT. The athlete's run verdict was 'improving' (his
 * within-run drift was fine), so the app would have told him:
 *
 *      "You chose to hold running steady, and you are."
 *
 * He had run THREE TIMES IN A MONTH against a declared target of three times a WEEK. The sentence
 * was false comfort, and it is the identical bug SPEC-posture-flag §2 was written to kill:
 * `off-plan-banner.ts:66` tells a strength-primary athlete "On plan — strength on track" while he
 * runs zero of his planned runs, because `computePrimaryAdherence` counts the primary discipline
 * and has no notion of the MAINTAINED one.
 *
 * A performance trend cannot tell you whether someone is maintaining a discipline. It tells you how
 * the sessions they DID went. **"Are you maintaining it?" is a question about the calendar.**
 */
export interface PostureBehaviour {
  /** Declared sessions/week for this discipline (`training_prefs.run_days`, `.strength_frequency`). */
  targetSessionsPerWeek?: number | null;
  /** Actual sessions/week over the trailing window (the spine's 90d cadence). */
  actualSessionsPerWeek?: number | null;
}

/**
 * SHORTFALL BAND. Below this fraction of the declared target, the athlete is not maintaining —
 * they have quietly stopped, and the app's job is to make sure they KNOW they moved.
 *
 * 0.8 is not hand-picked: TrainingPeaks grades workout compliance on a ±20% band, so a fifth of the
 * declared volume is the field's own line between "close enough" and "a different thing happened".
 * This is a DISPLAY threshold, not a physiological claim. Above it we stay quiet rather than nag.
 */
export const MAINTAIN_SHORTFALL_BAND = 0.8;

/**
 * The join. Declared intent + what they DID + how it went → what it MEANS.
 *
 * `verdict` is the spine's own word, untouched: 'improving' | 'holding' | 'sliding' | 'needs_data'.
 * We never recompute it and never suppress it — the number and its arrow still render above this.
 * We decide only what it MEANS.
 *
 * ORDER MATTERS: for a `maintain` discipline, BEHAVIOUR outranks the trend. Whether you kept doing
 * it is a fact; how the few sessions you did went is a footnote. Answer the fact first.
 */
export function readPosture(
  posture: Posture | null | undefined,
  verdict: string | null | undefined,
  behaviour?: PostureBehaviour | null,
): PostureRead {
  if (!posture) return 'unknown';
  if (posture === 'out') return 'parked';

  if (posture === 'maintain') {
    // THE FACT FIRST. Did they keep doing it? This is measurable, unarguable, and needs no physiology.
    const target = behaviour?.targetSessionsPerWeek ?? null;
    const actual = behaviour?.actualSessionsPerWeek ?? null;
    if (target != null && target > 0 && actual != null) {
      // ⚠ Compare the RATIO, not `actual < target * BAND`. In floats 3 * 0.8 = 2.4000000000000004,
      // so an athlete doing exactly 2.4 of a declared 3 — precisely ON the line — was told they had
      // stopped. Epsilon so the boundary belongs to the athlete, not to IEEE-754.
      if (actual / target < MAINTAIN_SHORTFALL_BAND - 1e-9) return 'maintain_dropped';
      // They ARE maintaining. A slide in the sessions they did is the honest cost — state it, never scold.
      return verdict === 'sliding' ? 'maintain_slipping' : 'maintaining';
    }
    // No declared target to measure against → we cannot claim they are or aren't maintaining.
    // ⛔ Say NOTHING rather than reassure. The false-comfort branch is the one that ships bugs.
    return 'unknown';
  }

  // develop — here the performance trend IS the question. "Am I building it?"
  if (!verdict || verdict === 'needs_data') return 'unknown';
  if (verdict === 'improving') return 'developing';
  if (verdict === 'sliding') return 'develop_declining';
  return 'develop_stalled'; // holding
}

/**
 * Is this read a WARNING the athlete needs to act on?
 *
 * ⛔ THE WHOLE POINT OF THE FILE. Only a discipline the athlete is TRYING TO BUILD can be failing.
 * A `maintain` discipline that slips is doing what it was asked to do, and the app must not paint
 * it orange, must not rank it as a concern, and must not lead with it.
 */
export function isConcern(read: PostureRead): boolean {
  return read === 'develop_declining' || read === 'develop_stalled';
}

/**
 * The sentence. Server-minted (Law 4 — surfaces render, never re-decide), plain English, no jargon.
 *
 * ⛔ VOCABULARY. Verified 2026-07-14 against Garmin's own pages: "decoupling" 0 hits, "cardiac
 * drift" 0, "efficiency factor" 0, "aerobic base" 0, "durability" 0. Those are coach-tier words.
 * Consumer apps translate or say nothing. The owner of THIS app could not define "durability"
 * when asked — which is the proof. So: no metric names, no arrows, no jargon. Two facts and a
 * trade, in words a runner would use.
 *
 * `disciplineWord` is the athlete's word ("running", "lifting"), not ours ("run", "strength").
 */
export function postureSentence(
  read: PostureRead,
  disciplineWord: string,
  behaviour?: PostureBehaviour | null,
): string | null {
  // The two numbers, in the athlete's own units. "3 a week" / "about 1 a week" — never "0.74/wk".
  const perWeek = (n: number): string => {
    const r = Math.round(n * 10) / 10;
    if (r === 0) return 'none';
    if (r < 1) return 'less than one a week';
    if (Math.abs(r - Math.round(r)) < 0.15) return `${Math.round(r)} a week`;
    return `about ${r} a week`;
  };
  switch (read) {
    case 'maintain_dropped': {
      // ⛔ THE ONE THE APP OWED HIM. His words, his calendar, nothing else. No physiology, no cause,
      // no verdict — and NOT a telling-off. SPEC-posture-flag §0: "You said maintain running. You've
      // run once in three weeks." The app's job is not to stop you moving along the spectrum; it is
      // to make sure you know you moved.
      const t = behaviour?.targetSessionsPerWeek;
      const a = behaviour?.actualSessionsPerWeek;
      const said = t != null ? `You said ${perWeek(t)}` : `You chose to hold ${disciplineWord} steady`;
      const did = a != null ? `You've been doing ${perWeek(a)}` : `You've been doing less`;
      return `${said}. ${did}. That's a trade, not a mistake — but it's yours to make on purpose.`;
    }
    case 'maintain_slipping':
      // Still doing it, just slower in the sessions they did. The expected cost of holding steady.
      return `You're holding ${disciplineWord} steady while you build elsewhere, and you're slower at the same effort. That's the trade, not a problem.`;
    case 'maintaining':
      return `You chose to hold ${disciplineWord} steady, and you are.`;
    case 'develop_declining':
      // The one read that earns concern. Still names NO cause — we cannot see sleep, stress,
      // illness or nutrition, and neither Garmin nor TrainingPeaks will name a cause with more.
      return `You're building ${disciplineWord}, but you're slower at the same effort than you were. Worth a look at how much you've been doing.`;
    case 'develop_stalled':
      return `You're building ${disciplineWord}, and it's holding rather than moving.`;
    case 'developing':
      return `${disciplineWord[0].toUpperCase()}${disciplineWord.slice(1)} is moving in the right direction.`;
    case 'parked':
      return null; // Parked. Say nothing at all — an unasked question needs no answer.
    case 'unknown':
    default:
      return null; // No declared intent → no posture claim. Today's behaviour, unchanged.
  }
}

/**
 * The DECLARED sessions/week per discipline, off `goals.training_prefs`.
 *
 * These are typed targets the athlete gave the wizard — `run_days: 3`, `strength_frequency: 4` —
 * and, like posture itself, they have only ever been read at plan build. They are the yardstick
 * that makes "are you maintaining it?" answerable without inventing anything.
 *
 * ⚠ Absent → null → the posture read stays silent for that discipline rather than guessing a target.
 */
export function declaredSessionsPerWeek(trainingPrefs: unknown): Partial<Record<string, number>> {
  const tp = (trainingPrefs && typeof trainingPrefs === 'object' ? trainingPrefs : {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const out: Partial<Record<string, number>> = {};
  const run = num(tp.run_days);
  const strength = num(tp.strength_frequency);
  const bike = num(tp.bike_days);
  const swim = num(tp.swim_days);
  if (run != null) out.run = run;
  if (strength != null) out.strength = strength;
  if (bike != null) out.bike = bike;
  if (swim != null) out.swim = swim;
  return out;
}

/** The athlete's word for a discipline. Ours are database keys; these are English. */
export function disciplineWord(discipline: string): string {
  switch (discipline) {
    case 'run': return 'running';
    case 'bike': return 'riding';
    case 'swim': return 'swimming';
    case 'strength': return 'lifting';
    default: return discipline;
  }
}
