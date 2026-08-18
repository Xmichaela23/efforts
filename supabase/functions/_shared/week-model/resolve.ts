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
  type SystemId,
  type Unit,
  COST,
  DAY_NAMES,
  emitsOf,
  forwardGap,
  needsOf,
  sessionHours,
} from './model.ts';

export type Placement = { unit: Unit; day: number };

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
  const rest = Math.min(restDaysOf(placements).length, REST_FLOOR);

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

  return rest * 4 - crowding - bunching
    - impactAfterLong(placements) * 6
    - clustering(placements) * 2
    - sameSportDoubles(placements) * 20
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
      if (s.load !== 'easy' && s.load !== 'long_cardio' && s.load !== 'hard_cardio') continue;
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
 * ⛔ AN EASY RUN THE MORNING AFTER A LONG RUN — INHERITED BEHAVIOUR, AND IT NEEDS MICHAEL'S RULING.
 *
 * ⚠️ IT IS SCORED HERE, NOT MODELLED AS A DEBT, AND THE DIFFERENCE IS DELIBERATE. Michael's law gave
 * the 48h long-effort clearance to HEAVY LEGS and said nothing about easy running. The slot engine
 * it replaces avoided this day anyway (`impactAfterLongRun`), and the reasoning is real — a long run
 * leaves impact damage and the next morning's run is taken on it, which is the same tissue argument
 * the eccentric routing runs on. Deleting the behaviour silently in an engine swap would be losing a
 * rule nobody decided to lose.
 *
 * ⛔ SO IT IS A PREFERENCE AND IT CANNOT BREACH ANYTHING: `unmetNeeds` is what decides legality and
 * this never touches it. If Michael rules it a real debt, it moves into `COST` and out of here.
 */
function impactAfterLong(placements: Placement[]): number {
  const longRunDays = placements
    .filter((p) => p.unit.sessions.some((s) => s.load === 'long_cardio' && s.sport === 'run'))
    .map((p) => p.day);
  if (longRunDays.length === 0) return 0;
  return placements.filter((p) =>
    p.unit.sessions.some((s) => s.load === 'easy' && s.sport === 'run')
    && longRunDays.some((d) => (p.day - d + 7) % 7 === 1)).length;
}

/**
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
      && (s.load === 'easy' || s.load === 'long_cardio' || s.load === 'hard_cardio')))
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
      score(ps) - Math.max(0, minRest - restDaysOf(ps).length) * 500;

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
    const rest = restDaysOf(withFree).length;
    const s = score(withFree) - unmet.length * 1000 - Math.max(0, minRest - rest) * 500;
    if (!best || s > best.score) best = { placements: withFree, unmet, score: s };
  };

  const walk = (i: number, acc: Placement[]): void => {
    if (i === searched.length) { consider(acc); return; }
    for (let d = 0; d < 7; d++) walk(i + 1, [...acc, { unit: searched[i], day: d }]);
  };
  walk(0, [...fixed]);

  if (!best) return { ok: false, unmet: [], best: [] };
  const b = best as { placements: Placement[]; unmet: Unmet[]; score: number };
  const rest = restDaysOf(b.placements);
  if (b.unmet.length === 0 && rest.length >= minRest) {
    return { ok: true, placements: b.placements, restDays: rest };
  }
  return { ok: false, unmet: b.unmet, best: b.placements };
}

/** The week as a document — the only way to tell whether this is right. */
export function render(r: Resolution): string {
  const placements = r.ok ? r.placements : r.best;
  const lines: string[] = [];
  for (let d = 0; d < 7; d++) {
    const on = placements.filter((p) => p.day === d);
    if (!on.length) { lines.push(`${DAY_NAMES[d].padEnd(10)} rest`); continue; }
    const text = on.map((p) =>
      p.unit.sessions.map((s) => s.label).join(`  →  ${p.unit.internalGapHours}h later  →  `)
    ).join('   ·   ');
    lines.push(`${DAY_NAMES[d].padEnd(10)} ${text}`);
  }
  if (!r.ok) {
    lines.push('');
    lines.push('CANNOT BE BUILT:');
    const seen = new Set<string>();
    for (const u of r.unmet) {
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
