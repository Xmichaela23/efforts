// ============================================================================
// THE RESOLVER — it does not search for a legal weekday. It pays debts.
//
// ⛔ AND IT NEVER REFUSES TO ANSWER. When a week cannot be built, the failure is
// itself relational: "this unit needs `heavy_legs` clear; the debt from X stands
// until hour H; the earliest it can happen is <day>." That is an answer the athlete
// can act on, which a dead end is not — and it is STRICTER than the old engine, not
// looser, because the old one built a compromised week and named the breach after
// the fact. See D-325 §7 ("state the cost, never refuse") — this satisfies both:
// the biological rule is never bent, and the athlete is never left with nothing.
// ============================================================================

import {
  type Load,
  type SystemId,
  type Unit,
  COST,
  DAY_NAMES,
  emitsOf,
  forwardGap,
  needsOf,
  sessionHours,
  stressorsOf,
} from './model.ts';

export type Placement = { unit: Unit; day: number };

/**
 * ⛔ "IS THIS A LONG DAY" IS A QUESTION ABOUT BOTH LOADS (2026-08-18). `long_cardio` split into
 * `long_run` and `long_ride` in Layer 1, and every shape term that asked for the old token by name
 * would have silently stopped seeing HALF the long days — the weekend preference would have ignored
 * long runs, the double-long penalty would never have fired. Asked through these two, so the split
 * cannot leave a term half-blind.
 */
const isLong = (l: Load): boolean => l === 'long_run' || l === 'long_ride';
const isEndurance = (l: Load): boolean => isLong(l) || l === 'easy' || l === 'hard_cardio';

export type Unmet = {
  unit: string;
  system: SystemId;
  /** The unit whose debt is still outstanding. */
  blockedBy: string;
  /** Hours short. */
  shortBy: number;
  /** The day the blocking debt actually clears. */
  clearsAtDay: number;
};

export type Resolution =
  | { ok: true; placements: Placement[]; restDays: number[] }
  | { ok: false; unmet: Unmet[]; best: Placement[] };

/**
 * Every unmet need in a candidate week, stated relationally.
 * ⚠️ ORDER-FREE. A debt is checked against every OTHER unit, not against the ones that
 * happen to come earlier in the array — placing sessions in list order is how the old
 * engine's answers depended on the order it was handed its inputs.
 */
export function unmetNeeds(placements: Placement[]): Unmet[] {
  const out: Unmet[] = [];
  // Every session that emits a debt, with the hour its clock starts.
  const debts: Array<{ from: string; system: SystemId; at: number; hours: number }> = [];
  for (const p of placements) {
    for (const { session, hour } of sessionHours(p.unit, p.day)) {
      for (const [sys, hours] of Object.entries(COST[session.load].emits)) {
        debts.push({ from: session.label, system: sys as SystemId, at: hour, hours: hours as number });
      }
    }
  }

  for (const p of placements) {
    for (const { session, hour } of sessionHours(p.unit, p.day)) {
      for (const system of COST[session.load].needs) {
        for (const d of debts) {
          if (d.system !== system || d.from === session.label) continue;
          const gap = forwardGap(d.at, hour);
          if (gap >= d.hours) continue;
          out.push({
            unit: session.label,
            system,
            blockedBy: d.from,
            shortBy: d.hours - gap,
            clearsAtDay: Math.floor(((d.at + d.hours) % 168) / 24),
          });
        }
      }
    }
  }
  return out;
}

/** Days carrying no session at all. */
export function restDaysOf(placements: Placement[]): number[] {
  const used = new Set(placements.map((p) => p.day));
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => !used.has(d));
}

/** Stressors landing on each day, 0-6. The unit the shape terms below count in. */
function stressorsPerDay(placements: Placement[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const p of placements) out[p.day] += stressorsOf(p.unit);
  return out;
}

/**
 * ⛔ DAYS THE ATHLETE ACTUALLY RECOVERS ON — no stressor, whatever else is there.
 *
 * ⚠️ THIS IS WHAT THE FLOOR NOW COUNTS, AND IT IS A WIDER SET THAN `restDaysOf`. A Thursday
 * carrying nothing but a bench press is a recovery day; a Thursday carrying a squat is not. The old
 * floor counted EMPTY days, which meant a jammed week defended its one blank square at −500 while
 * a third session piled onto a day already holding the coupled pair for 6. Measured on the sweep:
 * 27 of 61 shapes put a heavy lower lift, a hard endurance session AND an upper lift on one day,
 * with an empty day beside it.
 */
export function recoveryDaysOf(placements: Placement[]): number[] {
  const s = stressorsPerDay(placements);
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => s[d] === 0);
}

/**
 * ⛔ THE CAP: MORE THAN TWO STRESSORS ON ONE DAY (Michael, 2026-08-19). Counted in stressors ABOVE
 * two, so a day at four is charged twice what a day at three is.
 *
 * ⚠️ TWO IS THE CAP AND NOT ONE BECAUSE THE COUPLED PAIR IS EXACTLY TWO. Squat + hard run is one
 * unit by design in `model.ts` — barbell first, intervals six hours later. The cap has to permit
 * the arrangement Layer 1 deliberately builds, and forbid the thing stacked on top of it.
 *
 * ⛔ SCORED, NOT FORBIDDEN — the same call `longDoubles` records and for the same reason. A week
 * with more demand than legal slots must still return a week the athlete can see, not a refusal.
 * Weighted above every other shape term so it only loses to the law.
 */
export function overCap(placements: Placement[]): number {
  return stressorsPerDay(placements).reduce((n, c) => n + Math.max(0, c - 2), 0);
}

/**
 * ⛔ A DAY AT THE CAP IS LOCKED — nothing else may be added to it, stressor or not (Michael,
 * 2026-08-19: *"a heavy lower-body lift plus a hard endurance session locks the day. Upper body
 * must spill to adjacent days."*).
 *
 * ⚠️ AND THIS — NOT THE CAP — IS THE TERM THAT MOVES THE OVERHEAD PRESS OFF FRIDAY. The press is
 * not a stressor, so a Friday holding deadlift + threshold ride + press is at TWO stressors and the
 * cap is silent on it. What is wrong with that day is that a third session was added to a day that
 * was already full. Counted per extra session, not per day, so a fourth costs more than a third.
 *
 * ⚠️ `crowding` DOES NOT COVER THIS, AND MY FIRST READING THAT IT WAS A BUG WAS WRONG. It counts
 * PLACEMENTS, which is correct — a coupled unit is one thing and must not be charged for being
 * coupled. The gap was that the third session on such a day cost a flat 6 and nothing named the
 * day as full.
 */
export function lockedDayExtras(placements: Placement[]): number {
  const stress = stressorsPerDay(placements);
  const sessions = [0, 0, 0, 0, 0, 0, 0];
  for (const p of placements) sessions[p.day] += p.unit.sessions.length;
  let n = 0;
  for (let d = 0; d < 7; d++) {
    if (stress[d] < 2) continue;
    n += Math.max(0, sessions[d] - stress[d]);
  }
  return n;
}

/** How many consecutive stressor days a run may hold before the score starts charging. */
const STREAK_ALLOWANCE = 3;

/**
 * ⛔ CONSECUTIVE STRESSOR DAYS, CYCLIC — the term that breaks a five-day block when an empty day
 * exists (Michael, 2026-08-19). Measured on the sweep before it was written: 54 of 61 shapes ran
 * five or more consecutive training days with a rest day still free.
 *
 * ⚠️ IT COUNTS STRESSOR DAYS, NOT ACTIVE DAYS, AND THAT RESOLVES THE TENSION WITH THE TERM ABOVE.
 * Dropping the press into an empty Thursday makes the week seven ACTIVE days — a longer streak by
 * the old reading, and the two requests would have pulled against each other. A press day is not
 * what makes five days in a row punishing, so it breaks the run instead of extending it.
 *
 * ⛔ THE WEEK IS A CYCLE, NOT A LINE — a Friday-to-Tuesday run is five consecutive days and reading
 * the array end-to-end would see three and two.
 */
export function stressorStreakExcess(placements: Placement[]): number {
  const s = stressorsPerDay(placements);
  const on = s.map((c) => c > 0);
  if (on.every(Boolean)) return 7 - STREAK_ALLOWANCE;
  // Start on a day that is OFF, so every run is seen once and whole.
  const start = on.indexOf(false);
  let total = 0;
  let run = 0;
  for (let i = 0; i < 7; i++) {
    if (on[(start + i) % 7]) {
      run++;
    } else {
      total += Math.max(0, run - STREAK_ALLOWANCE);
      run = 0;
    }
  }
  return total + Math.max(0, run - STREAK_ALLOWANCE);
}

/**
 * ⛔ THE ONLY PREFERENCE IN THE FILE, and it is deliberately thin. Feasibility is
 * decided by the law; among LEGAL weeks the resolver prefers more rest and heavy units
 * spread rather than bunched. A long list of tie-breakers here would rebuild the thing
 * this model replaced.
 */
function score(placements: Placement[]): number {
  /**
   * ⛔ REST IS A FLOOR, NOT A SCORE THAT KEEPS PAYING — and getting that wrong stacked an athlete's
   * whole week onto one day. An uncapped `rest * 4` made four rest days worth +16, which outbid the
   * crowding penalty for putting three easy runs on top of the long run: the engine "earned" rest by
   * emptying the calendar into a single Tuesday. The old engine had `MAX_ACTIVE_DAYS = 6` — one rest
   * day, a floor — and that is the right shape. Meeting the floor pays; exceeding it pays nothing.
   */
  const recovery = Math.min(recoveryDaysOf(placements).length, REST_FLOOR);

  /**
   * ⛔⛔ A COMPLETELY BLANK DAY IS EXPENSIVE, AND THE ORDERING AROUND IT IS THE WHOLE RULING
   * (Michael, 2026-08-19): *"a day with zero physical demands has massive psychological and
   * physiological value. Stripping away an athlete's only true day off just to make the weekly
   * layout look symmetrical is a failure of coaching."*
   *
   * ⛔ THE HIERARCHY, AND EVERY WEIGHT IN THIS FILE IS SET TO PRODUCE IT:
   *   1. `overCap` (60) — three real stressors on one day is worse than losing the day off.
   *   2. `blank` (40) — the athlete keeps one square with nothing on it.
   *   3. `lockedDayExtras` (24) + `crowding` (6) — gap-filling is worth 30, which LOSES to 40.
   *
   * ⚠️ THAT ARITHMETIC IS THE RULE, NOT A COINCIDENCE. Dropping a bench press into the only empty
   * day buys at most 30 points of relief; the blank day costs 40 to give up. So it stays put in a
   * week that has room, and it moves only when the alternative is a capped day at 60 — which is
   * *"gap-fill as a last resort, only when the week is genuinely choking."*
   *
   * ⛔ THE FIRST VERSION WEIGHTED THIS AT 3 AND IT WAS WRONG IN A WAY THE SUITE ALREADY KNEW.
   * Gap-filling outbid it and 37 of 61 sweep shapes came back with no blank day at all, failing
   * `a week with room KEEPS its rest day — releasing it is a last resort, not the default` and four
   * others. ⚠️ Those tests are the record of this decision and they were right; do not relax them
   * to let a tidier-looking week through.
   */
  const blank = Math.min(restDaysOf(placements).length, REST_FLOOR);

  // ⛔ A REST DAY BOUGHT BY STACKING FIVE SESSIONS ONTO ONE DAY IS NOT A REST DAY.
  // ⚠️ IT ESCALATES, IT DOES NOT ACCUMULATE LINEARLY. A flat per-extra-session charge made a day
  // with THREE sessions cost only twice what a day with two costs, so the engine cheerfully piled a
  // third on to buy a rest day elsewhere. A second session on a day is a normal stacked day; a third
  // is a different thing entirely, and the curve has to say so.
  const perDay = new Map<number, number>();
  for (const p of placements) perDay.set(p.day, (perDay.get(p.day) ?? 0) + 1);
  let crowding = 0;
  for (const n of perDay.values()) crowding += Math.max(0, n - 1) ** 2 * 6;

  const heavyDays = placements
    .filter((p) => emitsOf(p.unit).heavy_legs != null)
    .map((p) => p.day)
    .sort((a, b) => a - b);
  let bunching = 0;
  for (let i = 1; i < heavyDays.length; i++) bunching += Math.max(0, 3 - (heavyDays[i] - heavyDays[i - 1]));

  return recovery * 4 + blank * 40 - crowding - bunching
    - clustering(placements) * 2
    - sameSportDoubles(placements) * 20
    - longDoubles(placements) * 25
    - overCap(placements) * 60
    - lockedDayExtras(placements) * 24
    - stressorStreakExcess(placements) * 8
    + longOnWeekend(placements) * 5
    + interleaving(placements) * 3;
}

/**
 * ⛔ TWO SESSIONS OF THE SAME SPORT ON ONE DAY — AND IT IS DATA LOSS DOWNSTREAM, NOT A CROWDED DAY.
 *
 * The composer collects each discipline's days as a LIST OF DAYS and builds one session per entry.
 * Two easy rides on one Wednesday reach the athlete as ONE ride; an easy run on the LONG RUN's day
 * comes out as the long run printed twice. It asked for three easy runs and built two, silently.
 * That is what this penalty protects — a session the athlete chose, disappearing.
 *
 * ⚠️ THE FIRST VERSION ONLY COUNTED EASY × EASY AND MISSED THE WORSE CASE: `easy` and `long_cardio`
 * emit and need nothing between them, so the law had no opinion and the score had no term. Nothing
 * stopped an easy run being placed on top of a long run.
 *
 * ⚠️ AND IT IS SCORED, NOT FORBIDDEN. A genuinely full week has to put them somewhere, and a doubled
 * day the athlete can see beats a session that vanished. Weighted so it only happens when nothing
 * else will fit. ⛔ The COUPLED pair is untouched: a unit is one placement, and its lift and hard
 * session are different sports by construction.
 */
function sameSportDoubles(placements: Placement[]): number {
  const perDaySport = new Map<string, number>();
  for (const p of placements) {
    for (const s of p.unit.sessions) {
      if (!s.sport) continue;
      if (!isEndurance(s.load)) continue;
      const k = `${p.day}|${s.sport}`;
      perDaySport.set(k, (perDaySport.get(k) ?? 0) + 1);
    }
  }
  let n = 0;
  for (const c of perDaySport.values()) n += Math.max(0, c - 1);
  return n;
}

/** One day off. ⚠️ A FLOOR the score stops paying past — see `score`. */
const REST_FLOOR = 1;


/**
 * ⛔ THE EASY-RUN-AFTER-LONG-RUN AVOIDANCE IS GONE (Michael, 2026-08-17). The old engine scored
 * against it and I carried it across the engine swap rather than drop a rule silently — correctly,
 * because it turned out to be a real question. His answer: **an easy Zone 1/2 run the morning after
 * a long run is a standard shakeout.** There is nothing to protect, so there is nothing to score.
 * ⛔ Do not reintroduce it as a preference; it was measured and ruled on.
 *
 * Same-sport easy sessions on back-to-back days. ⚠️ SPREAD, NOT SEPARATION — this is what stops an
 * athlete's three easy runs landing Fri/Sat/Sun with Tuesday empty. It is shape, not law.
 */
function clustering(placements: Placement[]): number {
  let n = 0;
  const easy = placements.filter((p) => p.unit.sessions.every((s) => s.load === 'easy'));
  for (const a of easy) {
    for (const b of easy) {
      if (a === b) continue;
      const sportA = a.unit.sessions[0].sport;
      if (sportA && sportA === b.unit.sessions[0].sport && (b.day - a.day + 7) % 7 === 1) n++;
    }
  }
  return n;
}

/**
 * ⛔ A LONG EFFORT PREFERS THE WEEKEND — AND THIS IS AVAILABILITY, NOT PHYSIOLOGY (2026-08-18).
 *
 * ⚠️ SAID PLAINLY BECAUSE EVERY OTHER TERM IN THIS FILE IS BIOLOGICAL AND THIS ONE IS NOT. Nothing
 * about a long run is different on a Thursday. What is different is that almost nobody has three
 * spare hours on one — and a suggester that offered "Thursday long run" would be worse than
 * offering nothing, which is what it did before this term existed.
 *
 * ⛔ RULED IN DELIBERATELY, 2026-08-18: *"a mathematically perfect schedule that prescribes a 3-hour
 * trail run on a Tuesday at 10:00 AM is a failed product. Endurance athletes live in the real world
 * where jobs dictate volume availability."* ⛔ Do not delete it as "not biology" — its NOT being
 * biology is why it carries the lowest weight here, not a reason to remove it.
 *
 * ⛔ THE WEAKEST TERM HERE, DELIBERATELY, AND IT CAN ONLY EVER BREAK A TIE between legal weeks. An
 * athlete who pins a Tuesday long run gets a Tuesday long run; this decides nothing they answered.
 * ⚠️ It is also the codebase's existing default said properly — `DEFAULT_LONG_DAY` is Saturday, and
 * was a hardcoded weekday nobody chose.
 */
function longOnWeekend(placements: Placement[]): number {
  return placements.filter((p) =>
    p.day >= 5 && p.unit.sessions.some((s) => isLong(s.load))).length;
}

/**
 * ⛔ TWO LONG EFFORTS ON ONE DAY — legal under the law, and almost never what anyone means.
 *
 * ⚠️ THE LAW HAS NO OPINION HERE AND THAT IS CORRECT. `long_cardio` needs `heavy_legs` clear and
 * emits `long_effort`; neither long day needs what the other emits, so nothing is breached. But a
 * long run and a long ride on ONE day is the biggest day an athlete will ever have, and the model
 * was choosing it freely — the long-day suggester put both on Saturday because nothing said not to.
 *
 * ⛔⛔ SCORED, NOT FORBIDDEN — AND WHEN IT FIRES IT IS USUALLY THE RIGHT ANSWER, WHICH IS THE PART
 * THAT MUST NOT BE LOST. Michael, 2026-08-18, on the two-hard-run shape that produces it:
 *
 * > *"In elite endurance programming this is a **Monster Brick** or a **Big Day**. It is brutal, but
 * > it is a highly effective, biologically sound way to consolidate extreme volume to buy back
 * > systemic recovery days. The engine didn't fail; it correctly solved an extreme physiological
 * > puzzle."*
 *
 * ⛔ AND THE SPLIT IS THE WORSE ANSWER, WHICH IS WHY THIS IS A PREFERENCE AND NOT A LAW. Long run
 * Saturday + long ride Sunday stretches the 48h shadow through TUESDAY, wiping out Monday and
 * Tuesday for heavy lifting and leaving three days to hold two max-effort runs and two barbell
 * sessions. The week collapses. Stacking both on Saturday pays one acute metabolic cost, lets Sunday
 * absorb the whole shadow, and clears the board by Monday for the heavy-lower + hard-cardio couplet.
 *
 * ⛔ SO DO NOT PROMOTE THIS TO A PROHIBITION. The penalty exists to stop the model choosing a double
 * long day FREELY — it was putting both on Saturday because nothing said not to, in weeks that had
 * room to split them. It must stay outbiddable by the law, or the only legal answer to a genuinely
 * extreme week becomes unreachable. An athlete demanding that much volume in seven days is buying a
 * ticket for a massive Saturday, and the engine's job is to say so, not to refuse.
 */
function longDoubles(placements: Placement[]): number {
  const perDay = new Map<number, number>();
  for (const p of placements) {
    for (const s of p.unit.sessions) {
      if (!isLong(s.load)) continue;
      perDay.set(p.day, (perDay.get(p.day) ?? 0) + 1);
    }
  }
  let n = 0;
  for (const c of perDay.values()) n += Math.max(0, c - 1);
  return n;
}

/**
 * ⛔ THE DISCIPLINES INTERLEAVE — the runs do not take a contiguous block and leave the rides the
 * scraps. This is the old engine's alternator, kept as a SHAPE term rather than as a pass of its own.
 *
 * ⚠️ IT MEASURES THE OUTCOME, NOT THE ALGORITHM: how many of a sport's sessions sit inside the span
 * of another sport's. An interleaved week scores high; "runs Mon-Wed, rides Fri-Sat" scores zero and
 * loses. ⛔ It is a preference and sits far below the law — it can only choose between legal weeks.
 */
function interleaving(placements: Placement[]): number {
  const daysOf = (sport: string) => placements
    .filter((p) => p.unit.sessions.some((s) => s.sport === sport
      && isEndurance(s.load)))
    .map((p) => p.day).sort((a, b) => a - b);
  const runs = daysOf('run');
  const rides = daysOf('bike');
  if (runs.length < 2 || rides.length === 0) return 0;
  const lo = runs[0], hi = runs[runs.length - 1];
  return rides.filter((d) => d > lo && d < hi).length;
}

export function resolve(units: Unit[], opts: { minRestDays?: number } = {}): Resolution {
  const minRest = opts.minRestDays ?? 1;
  const fixed = units.filter((u) => u.pinnedDay != null).map((u) => ({ unit: u, day: u.pinnedDay! }));
  const free = units.filter((u) => u.pinnedDay == null);

  /**
   * ⛔ ONLY UNITS THAT CAN BREAK THE LAW ARE SEARCHED EXHAUSTIVELY, AND THIS IS WHAT MAKES THE
   * MODEL USABLE RATHER THAN MERELY CORRECT.
   *
   * A unit that emits no debt and needs nothing clear — an easy run, a bench press — cannot cause a
   * violation on ANY day. It can only change the week's SHAPE. So the search space is the
   * constrained units alone (three lifts and two hard days is 7^2 after pinning, not 7^8), and the
   * free ones are laid in afterwards on the same score.
   *
   * ⚠️ THE FIRST VERSION ENUMERATED ALL OF THEM AND TIMED OUT ON A REAL WEEK — seven free units is
   * 823,543 candidates, each running the full debt check. Exhaustive over the units that matter is
   * still exhaustive: "unsolvable" continues to mean unsolvable.
   */
  const constrains = (u: Unit): boolean =>
    Object.keys(emitsOf(u)).length > 0 || needsOf(u).length > 0;
  const searched = free.filter(constrains);
  const laidIn = free.filter((u) => !constrains(u));

  let best: { placements: Placement[]; unmet: Unmet[]; score: number } | null = null;

  const consider = (acc: Placement[]): void => {
    // ⛔ THE FREE UNITS GO ON THE EMPTIEST DAYS, and a day already carrying a heavy unit is the last
    // choice — an easy run beside a bench press competes with nothing, beside a squat it is the same
    // legs twice.
    // ⛔ THE FREE UNITS ARE LAID IN AGAINST THE REAL SCORE, NOT A SECOND HAND-ROLLED COST FUNCTION.
    // The first version used its own "emptiest day wins" heuristic and lost three things the old
    // engine had: the rest day, the easy-run spread, and the morning after the long run. A private
    // cost function beside the public one is the doubled disease in miniature.
    const withFree: Placement[] = [...acc];
    /** The full score of a candidate, INCLUDING the rest floor — one function, used everywhere. */
    const rate = (ps: Placement[]): number =>
      score(ps) - Math.max(0, minRest - recoveryDaysOf(ps).length) * 500;

    // ⛔ THE FREE UNITS ARE LAID IN AGAINST THE REAL SCORE, NOT A SECOND HAND-ROLLED COST FUNCTION.
    // The first version used its own "emptiest day wins" heuristic and lost three things the old
    // engine had: the rest day, the easy-run spread, and the morning after the long run. A private
    // cost function beside the public one is the doubled disease in miniature.
    for (const u of laidIn) {
      let bestDay = 0;
      let bestScore = -Infinity;
      for (let d = 0; d < 7; d++) {
        const sc = rate([...withFree, { unit: u, day: d }]);
        if (sc > bestScore) { bestScore = sc; bestDay = d; }
      }
      withFree.push({ unit: u, day: bestDay });
    }

    /**
     * ⛔ AND THEN IT RECONSIDERS, BECAUSE A GREEDY PASS CANNOT SEE WHAT IT IS ABOUT TO SPEND.
     *
     * Laying units in one at a time, each choice is optimal when it is made and the rest floor never
     * bites — there is always another empty day left. By the last unit there is not, and the greedy
     * cannot go back and move an earlier one. Measured: a 4-run week came out with all seven days
     * active while a legal six-day week existed.
     *
     * ⚠️ LOCAL SEARCH OVER THE FREE UNITS ONLY. Pinned anchors never move (they are the athlete's),
     * and the constrained units were already searched exhaustively above. Bounded at 4 sweeps: it
     * converges in one or two on every real week, and an unbounded loop here is a hang waiting for a
     * scoring tie.
     */
    const firstFree = acc.length;
    for (let pass = 0; pass < 4; pass++) {
      let improved = false;
      for (let i = firstFree; i < withFree.length; i++) {
        const current = withFree[i].day;
        let bestDay = current;
        let bestScore = rate(withFree);
        for (let d = 0; d < 7; d++) {
          if (d === current) continue;
          withFree[i] = { unit: withFree[i].unit, day: d };
          const sc = rate(withFree);
          if (sc > bestScore) { bestScore = sc; bestDay = d; }
        }
        withFree[i] = { unit: withFree[i].unit, day: bestDay };
        if (bestDay !== current) improved = true;
      }
      if (!improved) break;
    }

    const unmet = unmetNeeds(withFree);
    const recovery = recoveryDaysOf(withFree).length;
    const s = score(withFree) - unmet.length * 1000 - Math.max(0, minRest - recovery) * 500;
    if (!best || s > best.score) best = { placements: withFree, unmet, score: s };
  };

  const walk = (i: number, acc: Placement[]): void => {
    if (i === searched.length) { consider(acc); return; }
    for (let d = 0; d < 7; d++) walk(i + 1, [...acc, { unit: searched[i], day: d }]);
  };
  walk(0, [...fixed]);

  if (!best) return { ok: false, unmet: [], best: [] };
  const b = best as { placements: Placement[]; unmet: Unmet[]; score: number };
  /**
   * ⛔ THE GATE COUNTS RECOVERY DAYS; `restDays` STILL REPORTS GENUINELY BLANK ONES.
   * The two are different questions and the caller wants the second. A week whose only free day
   * carries a bench press SATISFIES the floor — that is the unlock — but telling the athlete they
   * have a day off when they have a press would be the score that lies.
   */
  const rest = restDaysOf(b.placements);
  if (b.unmet.length === 0 && recoveryDaysOf(b.placements).length >= minRest) {
    return { ok: true, placements: b.placements, restDays: rest };
  }
  return { ok: false, unmet: b.unmet, best: b.placements };
}

/**
 * The week as a document — the only way to tell whether this is right.
 *
 * ⚠️ THE UNION IS NARROWED EXPLICITLY, NOT BY `r.ok`. This file is now in the CLIENT's type graph
 * too (`src/lib/suggest-hard-days.ts` reaches it through the `@shared` alias), and the app compiles
 * with `strict: false` — under which a boolean discriminant does not narrow a union. It type-checked
 * under Deno and failed under Vite, which is the kind of split a shared file has to be written for.
 */
export function render(r: Resolution): string {
  const bad = r.ok ? null : (r as Extract<Resolution, { ok: false }>);
  const placements = bad ? bad.best : (r as Extract<Resolution, { ok: true }>).placements;
  const lines: string[] = [];
  for (let d = 0; d < 7; d++) {
    const on = placements.filter((p) => p.day === d);
    if (!on.length) { lines.push(`${DAY_NAMES[d].padEnd(10)} rest`); continue; }
    const text = on.map((p) =>
      p.unit.sessions.map((s) => s.label).join(`  →  ${p.unit.internalGapHours}h later  →  `)
    ).join('   ·   ');
    lines.push(`${DAY_NAMES[d].padEnd(10)} ${text}`);
  }
  if (bad) {
    lines.push('');
    lines.push('CANNOT BE BUILT:');
    const seen = new Set<string>();
    for (const u of bad.unmet) {
      const key = `${u.unit}|${u.system}|${u.blockedBy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(
        `  ${u.unit} needs ${u.system} clear. ${u.blockedBy} leaves that outstanding for another `
        + `${u.shortBy}h — it clears on ${DAY_NAMES[u.clearsAtDay]}.`,
      );
    }
    if (restDaysOf(placements).length === 0) lines.push('  No rest day. Every day carries a session.');
  }
  return lines.join('\n');
}
