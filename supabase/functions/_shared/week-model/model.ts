// ============================================================================
// THE WEEK MODEL — sessions leave debts; the calendar is the OUTPUT
//
// ⛔ NOTHING IMPORTS THIS YET. It is a standalone candidate to replace the slot
// model (`week-solver.ts` + `week-optimizer.ts` + `schedule-session-constraints.ts`
// + `place-week.ts`, 6,020 lines between them). Read it, run the fixture, decide.
//
// ⛔ WHY IT EXISTS. The old engine asks "which weekday is legal and free" and fills
// slots. It cannot say "this session left something behind that is still outstanding
// on Tuesday", and it cannot say "these two sessions are ONE thing". So a squat could
// never FOLLOW a hard run onto a day — nothing in the model said they belonged
// together, only that they were permitted to touch.
//
// THE THREE RELATIONS THIS FILE IS BUILT ON (Michael, 2026-08-17):
//
//   1. COUPLING — heavy lower and hard cardio are one unit sharing a day, barbell
//      first, 6-8h apart. Squat pairs with the hard RUN (fresh erectors take the
//      impact); deadlift pairs with the hard RIDE (seated, structurally supported).
//   2. DEBT — every session leaves something behind, for a stated number of hours.
//      A long effort leaves 48h. A heavy lower unit leaves 48h. A bench press leaves
//      nothing anything else in this law cares about.
//   3. ELIGIBILITY — what may happen next is a function of what is still outstanding,
//      never of which weekday is free.
//
// ⚠️ TWO PLACES THE LAW IS SILENT, AND THE SILENCE IS DELIBERATE — see OPEN below.
// ============================================================================

/** A named recovery system. A session EMITS a debt on one; another session NEEDS it clear. */
export type SystemId =
  /** Heavy barbell work through the legs and the CNS behind it. */
  | 'heavy_legs'
  /** The residue of a long continuous effort — impact damage and empty glycogen. */
  | 'long_effort';

/**
 * ⛔ `long_cardio` IS SPLIT IN TWO (Michael, 2026-08-18) — and the asymmetry between them is the
 * point, not an oversight. See {@link COST}.
 */
export type Load =
  | 'heavy_lower'
  | 'upper'
  | 'hard_cardio'
  | 'long_run'
  | 'long_ride'
  | 'easy';

export type Sport = 'run' | 'bike' | 'swim';

export type Session = {
  id: string;
  label: string;
  load: Load;
  sport?: Sport;
  minutes: number;
};

/** What a load leaves behind, and what it requires clear before it may start. */
export type Cost = {
  /** system -> hours the debt stands after this session ENDS. */
  emits: Partial<Record<SystemId, number>>;
  /** systems that must carry no outstanding debt at this session's START. */
  needs: SystemId[];
};

/**
 * ⛔ THE ENTIRE LAW, IN ONE TABLE. Every scheduling behaviour below is a consequence of
 * these five rows. There is no second place a rule can hide — that was the disease.
 *
 * ⛔⛔ THE LONG-EFFORT CLEARANCE IS SYMMETRIC FOR THE RUN AND ASYMMETRIC FOR THE RIDE
 * (Michael, 2026-08-18), AND THAT ONE MISSING WORD IS THE WHOLE ROW.
 *
 *   • FORWARD, BOTH DISCIPLINES — `heavy_lower` needs `long_effort` clear: no heavy legs for
 *     48h AFTER a long effort. **Non-negotiable, and it is the injury-prevention half.** A long
 *     ride has no eccentric damage but it is the most glycogen-expensive session in the block,
 *     and squatting heavy on empty quads is a tendon problem, not a comfort problem.
 *   • BACKWARD, RUN ONLY — `long_run` needs `heavy_legs` clear. Squatting the day before a long
 *     RUN puts damaged, depleted legs into an impact session.
 *   • BACKWARD, RIDE — **NOTHING.** Michael, ruling on the split: *"the backward shadow (squat
 *     fatigue blocking the ride) makes for a miserable ride, but it doesn't cause structural
 *     failure."* A rider can turn the pedals on tired legs and pay for it inside the session.
 *
 * ⚠️ THIS REVERSES THE 2026-08-17 SYMMETRY RULING FOR THE RIDE, deliberately and with a measured
 * reason. That ruling's stated case was *"squatting heavy the day before a three-hour ride is
 * biological suicide — you start with zero glycogen"*; the cost is real and it is a QUALITY cost,
 * and it was blocking the standard multisport weekend for everyone. Forced to the Sat-ride /
 * Sun-run layout, the engine's only complaint was *"Long Ride needs heavy_legs clear — Deadlift
 * leaves that outstanding"*. This row is that complaint, removed.
 *
 * ⛔ AND THE DIAGNOSIS THAT PROMPTED IT WAS WRONG, WHICH IS WHY THE FIX IS HERE AND NOT WHERE IT
 * WAS ASKED FOR. The report was that one shared `long_cardio` token made a Saturday long ride
 * block a Sunday long run. It never did: a long day emits `long_effort`, and only `heavy_lower`
 * needs that clear — Sat-ride + Sun-run has always been legal and tests as such. Removing the
 * ride's FORWARD shadow, which is what "leaves no leg shadow" would have meant, changes nothing
 * about the weekend and deletes the injury guard. ⛔ Do not re-apply that version.
 *
 * ⛔ AND `hard_cardio` LEAVES 36h ON THE LEGS — always, not only when uncoupled. Hard
 * cardio is systemic fatigue and cannot cost nothing.
 *
 * ⚠️ MICHAEL SAID 24h, AND 24h DOES NOT PRODUCE WHAT HE ASKED FOR — the number is mine
 * and he should overrule it if he disagrees. His effect was *"you cannot place a heavy
 * lower-body lift on the day immediately following an uncoupled hard cardio session."*
 * At day granularity a 24h debt clears a 24h gap exactly, and this model's own convention
 * (set by his week: a Sunday long run clears for a Tuesday deadlift at exactly 48h) is
 * that an exact clearance PASSES. So 24 permits the very day he forbade. Any value in
 * (24, 48] gives his effect; 36 is the midpoint, and it is also what survives the real
 * case a day-granular number hides — an evening threshold run followed by a morning
 * squat is ~12 hours apart, not 24. ⛔ To take him literally instead, set this to 24 and
 * the day-after test below inverts.
 *
 * ⚠️ THE COUPLED PAIR IS SAFE BY ARITHMETIC, NOT BY EXEMPTION, AND THAT DISTINCTION IS
 * THE WHOLE POINT. In a coupled unit the barbell runs FIRST and the intervals follow 6h
 * later, so the hard session's debt lands entirely after the lift it shares a day with —
 * it blocks nothing that has already happened. A carve-out ("this rule does not apply
 * when coupled") would be the second hiding place this table exists to prevent.
 */
export const COST: Record<Load, Cost> = {
  heavy_lower: { emits: { heavy_legs: 48 }, needs: ['heavy_legs', 'long_effort'] },
  long_run: { emits: { long_effort: 48 }, needs: ['heavy_legs'] },
  long_ride: { emits: { long_effort: 48 }, needs: [] },
  hard_cardio: { emits: { heavy_legs: 36 }, needs: [] },
  upper: { emits: {}, needs: [] },
  easy: { emits: {}, needs: [] },
};

/** Both long loads, where something genuinely means "a long day" and not one discipline's. */
export const LONG_LOADS: Load[] = ['long_run', 'long_ride'];

/**
 * ⛔ A STRESSOR IS A LOAD THAT COSTS THE ATHLETE A DAY. VOCABULARY ONLY — NO `COST` CELL MOVES HERE.
 *
 * Layer 1 already says which weeks are LEGAL and this changes none of it. What this adds is the
 * unit the SHAPE terms in `resolve.ts` count in, and the reason it had to exist is that they were
 * counting the wrong thing: **calendar days** (a day is occupied or it is not) and **placements**
 * (a coupled squat + hard run is one). Neither is what fatigue tracks.
 *
 * ⚠️ `upper` AND `easy` ARE DELIBERATELY NOT STRESSORS, AND THAT IS THE WHOLE UNLOCK (Michael,
 * 2026-08-19). A bench press on an otherwise-empty Thursday is not what makes five days in a row
 * punishing. Under the old day-counting rest floor it was indistinguishable from a squat, so the
 * only empty day in a jammed week was defended at a cost of −500 while stacking the press onto a
 * day that already held a deadlift and a threshold ride cost 6. The press stacked, every time.
 * Counting stressors instead lets it take Thursday, which is what an athlete would do.
 *
 * ⛔ THIS IS NOT A CLAIM THAT UPPER WORK IS FREE. It still occupies the day, it is still charged by
 * `crowding`, and a day already holding the coupled pair is still LOCKED against it — see
 * `lockedDays()` in `resolve.ts`. It is a claim about what a REST day is protecting the athlete
 * from, and the answer is systemic load, not activity.
 */
export const STRESSOR_LOADS: Load[] = ['heavy_lower', 'hard_cardio', 'long_run', 'long_ride'];

export const isStressor = (l: Load): boolean => STRESSOR_LOADS.includes(l);

/** How many stressors a unit carries. The coupled pair carries TWO — that is the point of the cap. */
export function stressorsOf(u: Unit): number {
  return u.sessions.filter((s) => isStressor(s.load)).length;
}

/**
 * ⛔ THE PAIRING, AND IT IS A CLAIM ABOUT TISSUE, NOT A PREFERENCE.
 * Squat + hard run: the run's impact is taken by erectors that have not yet been
 * loaded that week. Deadlift + hard ride: the ride is seated and structurally
 * supported, so it does not ask the spine for what the deadlift just took.
 */
export const PAIRING: Record<string, Sport> = {
  'Back Squat': 'run',
  'Deadlift': 'bike',
};

/** Barbell in the AM, intervals in the PM. Michael: "leave 6 to 8 hours." */
export const COUPLED_GAP_HOURS = 6;

/** A unit is what the resolver actually places: one or more sessions on ONE day. */
export type Unit = {
  id: string;
  label: string;
  sessions: Session[];
  /** Hours between session[0] and session[1] when a unit is coupled. */
  internalGapHours: number;
  /** 0=Mon … 6=Sun. Set when the athlete owns the day (a club night, their long ride). */
  pinnedDay?: number;
  /**
   * ⛔ WHICH SESSION'S ANSWER `pinnedDay` IS — the session id, not the unit's. A coupled unit is
   * `Back Squat + Hard Run` and the athlete tapped ONE of them; when a blocked day releases the pin
   * (`resolve.ts`, Michael 2026-08-25) the note has to name the session they recognise, not the
   * pair. ⚠️ Absent whenever `pinnedDay` is absent.
   */
  pinnedBy?: string;
};

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Couple heavy lower lifts with their matching hard cardio session into single units.
 * Everything left over becomes a unit of one.
 *
 * ⚠️ A HARD SESSION WITH NO MATCHING LIFT STAYS ITS OWN UNIT rather than being forced
 * onto the wrong lift. The pairing is a tissue claim; honouring it loosely would be
 * worse than not honouring it.
 */
export function buildUnits(sessions: Session[], pins: Record<string, number> = {}): Unit[] {
  const remaining = [...sessions];
  const units: Unit[] = [];
  const take = (fn: (s: Session) => boolean): Session | undefined => {
    const i = remaining.findIndex(fn);
    return i < 0 ? undefined : remaining.splice(i, 1)[0];
  };

  for (const [liftName, sport] of Object.entries(PAIRING)) {
    const lift = take((s) => s.load === 'heavy_lower' && s.label.includes(liftName));
    if (!lift) continue;
    const hard = take((s) => s.load === 'hard_cardio' && s.sport === sport);
    const sessionsInUnit = hard ? [lift, hard] : [lift];
    units.push({
      id: lift.id,
      label: hard ? `${lift.label} + ${hard.label}` : lift.label,
      sessions: sessionsInUnit,
      internalGapHours: hard ? COUPLED_GAP_HOURS : 0,
      pinnedDay: pins[lift.id] ?? (hard ? pins[hard.id] : undefined),
      // ⚠️ SAME ORDER AS THE LINE ABOVE, deliberately — the lift's pin wins, so the lift is what
      // named the day. Two orders here and the sentence would name a session that did not decide it.
      pinnedBy: pins[lift.id] != null ? lift.id : (hard && pins[hard.id] != null ? hard.id : undefined),
    });
  }
  for (const s of remaining) {
    units.push({
      id: s.id,
      label: s.label,
      sessions: [s],
      internalGapHours: 0,
      pinnedDay: pins[s.id],
      pinnedBy: pins[s.id] != null ? s.id : undefined,
    });
  }
  return units;
}

/** A unit's debts, merged: the longest debt on each system wins. */
export function emitsOf(u: Unit): Partial<Record<SystemId, number>> {
  const out: Partial<Record<SystemId, number>> = {};
  for (const s of u.sessions) {
    for (const [sys, hours] of Object.entries(COST[s.load].emits)) {
      const k = sys as SystemId;
      out[k] = Math.max(out[k] ?? 0, hours as number);
    }
  }
  return out;
}

export function needsOf(u: Unit): SystemId[] {
  return [...new Set(u.sessions.flatMap((s) => COST[s.load].needs))];
}

/** The hours of the repeating week. A block's week is a CYCLE, not a line. */
export const WEEK_HOURS = 168;

/**
 * ⛔ EVERY SESSION GETS ITS OWN HOUR, AND THAT IS THE FIX FOR THE SECOND BUG I WROTE.
 * The debt clock belongs to the SESSION that emits it, not to the unit it sits in. A
 * deadlift emits `heavy_legs` when the deadlift ends — not six hours later when the
 * hard ride that shares its day finishes. Clocking it to the unit pushed every heavy
 * clearance 6h late and turned a legal Tuesday→Thursday into a 42h breach.
 */
export function sessionHours(u: Unit, day: number): Array<{ session: Session; hour: number }> {
  return u.sessions.map((session, i) => ({ session, hour: day * 24 + (i === 0 ? 0 : u.internalGapHours) }));
}

/**
 * Hours from `from` to `to` going FORWARD around the repeating week.
 *
 * ⛔ ZERO IS ZERO. Two DIFFERENT sessions at the same hour are zero hours apart, not a
 * full week — reading `0` as `168` made a squat and a long ride on one Saturday legal,
 * which is the single thing Michael's law forbids outright. Self-comparison is excluded
 * by identity in the caller, not by arithmetic here.
 */
export function forwardGap(from: number, to: number): number {
  const d = (to - from) % WEEK_HOURS;
  return d < 0 ? d + WEEK_HOURS : d;
}

/**
 * ⛔ BOTH SILENCES ARE CLOSED (Michael, 2026-08-17) — recorded so nobody reopens them.
 *
 * 1. **An uncoupled hard day now leaves a 24h heavy-leg debt.** It was zero, which said
 *    a threshold run costs nothing. No heavy lower lift the day after one.
 * 2. **The long-effort clearance is now symmetric.** It ran forward only, so a heavy
 *    squat the day before a long ride was legal. It is not.
 *
 * Both live in `COST` above and nowhere else.
 */
export const CLOSED_2026_08_17 = [
  'uncoupled hard day leaves 36h on the legs (Michael said 24h — see the note in COST)',
  'the 48h long-effort clearance runs both directions',
] as const;
