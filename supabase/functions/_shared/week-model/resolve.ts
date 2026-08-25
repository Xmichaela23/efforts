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
  type Sport,
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
  /**
   * ⛔ THE LOAD OF THE SESSION THAT WAS BLOCKED (pins-win, 2026-08-25). Added so the tier layer can
   * name WHICH rule fired without re-deriving it from a label: `heavy_lower` needing `long_effort`
   * is a different sentence from `long_run` needing `heavy_legs`, and the two are indistinguishable
   * from `system` alone. ⚠️ Additive — every existing reader destructures by name.
   */
  load: Load;
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
            load: session.load,
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
/**
 * ⛔ EXPORTED FOR TESTS ONLY (stage 2, 2026-08-21), and the reason is in the trace report: to measure
 * the clumping defect at all it had to run *"the real `resolve.ts` — a copy with the private terms
 * exported; the repo is untouched."* A finding that needs a modified copy of the file to reproduce
 * is a finding nobody can pin. ⚠️ Nothing in production calls this — `resolve` is the entry point.
 */
export function score(placements: Placement[]): number {
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

  /**
   * ⛔⛔ `sportAdjacency` IS WEIGHTED 4, AND THE CEILING IS NOT THE DAY OFF — IT IS THE BARBELL WEEK.
   *
   * **The brief said `2w < 40`** (moving one session into a blank day removes at most two
   * adjacencies, and the blank day is worth 40) — the 2026-08-19 rule that stops a tidier-looking
   * week buying itself out of the athlete's only rest day. That bound is real and 4 satisfies it
   * with room to spare.
   *
   * ⛔ IT IS NOT THE BINDING CONSTRAINT. `resolve` scores the WHOLE week, so a spread term can pay
   * to move a LIFT, and the terms holding the lifting week's shape are far weaker than 40:
   * `bunching` — heavy legs preferring more than the 48h floor — is weighted **1**. Measured across
   * the weight range with everything else untouched:
   *
   * ```
   *   w = 2, 3, 4   57/61 shapes improve, 0 worsen, 0 rest days lost, the bar NEVER MOVES
   *   w = 5+        the bar starts moving: Wendler's L·U·L three-day week (2nd ed. p.11) came back
   *                 L·L·U, and heavy legs went from 72h apart to 48h — one adjacency bought for one
   *                 point of `bunching`
   * ```
   *
   * ⚠️ SO THE CLIFF IS BETWEEN 4 AND 5, AND IT IS MEASURED, NOT REASONED. The report proposed 6 on
   * the `2w < 40` bound alone; 6 breaks the barbell week. **4 is the highest weight at which this
   * term can only ever choose between weeks that place the bar identically** — which is what "a
   * preference that sits below the law" is supposed to mean, and what every other shape term here
   * already is.
   *
   * ⛔ RAISING `bunching` TO PROTECT THE BAR INSTEAD WAS TRIED AND IS WORSE. At `bunching * 8` the
   * alternation comes back and a week loses its second rest day to crowding; escalating it
   * (`** 2 * 6`, the `crowding` shape) does the same. Every variant traded one regression for
   * another. ⛔ Do not re-open the weight war without new evidence — the answer was to make THIS
   * term weak enough, not the others stronger.
   *
   * At 4 the two weeks in the report separate by 12 points where they used to tie at 54.
   */
  return recovery * 4 + blank * 40 - crowding - bunching
    - sportAdjacency(placements) * 4
    - sameSportDoubles(placements) * 20
    - longDoubles(placements) * 25
    - overCap(placements) * 60
    - lockedDayExtras(placements) * 24
    - stressorStreakExcess(placements) * 8
    + longOnWeekend(placements) * 5;
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
 * ⛔⛔ AND `clustering` IS GONE TOO (stage 2, 2026-08-21) — ABSORBED, NOT DELETED. It counted
 * back-to-back same-sport days between units whose sessions were **all `easy`**, which made a hard
 * Tuesday invisible to it and let `runs Mon-Tue-Wed` score zero. `sportAdjacency` below counts the
 * same thing with the load filter removed, so every case `clustering` caught is still caught and the
 * ones it missed now are too. ⚠️ Its NAME is why nobody looked further for three months — the
 * obvious word was taken by something narrower. Do not reintroduce a second spread term under a
 * third name.
 */

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
 * ⛔⛔ CONSECUTIVE SAME-SPORT DAYS, COUNTED CYCLICALLY — THE MEASURE THAT WAS MISSING (stage 2,
 * 2026-08-21). Evidence: §1 of `docs/REPORT-session-structure-and-clumping-2026-08-20.md`.
 *
 * **The defect.** The week came out `runs Mon-Tue-Wed, rides Fri-Sat` and the resolver did not
 * prefer the alternating week over it. Not "preferred it weakly" — the report ran the real scorer
 * and **every term in the vector came out the same, 54 against 54**:
 *
 * ```
 * as built     runs [Mon,Tue,Wed,Sun]  rides [Fri,Sat]   interleaving 2  clustering 0  SCORE 54
 * alternating  runs [Mon,Wed,Fri,Sun]  rides [Tue,Sat]   interleaving 2  clustering 0  SCORE 54
 * ```
 *
 * ⛔ SO THERE WAS NOTHING TO TUNE. Which week an athlete got was decided by enumeration order.
 *
 * **Why the two terms that looked like they covered it did not.**
 *   • `interleaving` asked *"is one sport bracketed by the other"*. A week with an easy run early
 *     and the long run on Sunday answers YES for every ride placement except Monday and Sunday, so
 *     the clumped week scored the maximum. It measured a span, and clumping is about NEIGHBOURS.
 *   • `clustering` only saw units whose sessions are **all** `easy`. Tuesday's hard session made
 *     Mon-Tue-Wed invisible to it. ⚠️ Its name is why nobody looked further.
 *
 * ⛔ BOTH ARE ABSORBED INTO THIS, NOT LEFT BESIDE IT — the report's own instruction, and the reason
 * is this file's founding rule: *three terms all trying to say "spread the disciplines", two of them
 * measuring something they do not mean, is the doubled disease.* `clustering` is a strict subset of
 * what this counts (same sport, back-to-back, cyclic) with the load filter removed;
 * `interleaving`'s intent is what this states directly.
 *
 * **What it counts:** for each sport, the DAYS carrying at least one endurance session of it, then
 * the cyclically adjacent pairs among those days. Per day, not per session — two runs on one
 * Tuesday is one run-day, and `sameSportDoubles` is the term that owns that case.
 *
 * ```
 * as built     runs {Mon,Tue,Wed,Sun} rides {Fri,Sat}  ->  (Mon,Tue)(Tue,Wed)(Sun,Mon)(Fri,Sat) = 4
 * alternating  runs {Mon,Wed,Fri,Sun} rides {Tue,Sat}  ->  (Sun,Mon)                            = 1
 * ```
 *
 * ⚠️ CYCLIC, because the week repeats. Sunday into Monday is back-to-back training however the
 * calendar is drawn, and a term blind to the wrap would rate `Sat-Sun-Mon` as two separate singles.
 * The same shape `stressorStreakExcess` already uses, one field over.
 */
export function sportAdjacency(placements: Placement[]): number {
  const daysBySport = new Map<Sport, Set<number>>();
  for (const p of placements) {
    for (const s of p.unit.sessions) {
      if (!s.sport || !isEndurance(s.load)) continue;
      const set = daysBySport.get(s.sport) ?? new Set<number>();
      set.add(p.day);
      daysBySport.set(s.sport, set);
    }
  }
  let n = 0;
  for (const days of daysBySport.values()) {
    for (const d of days) if (days.has((d + 1) % 7)) n++;
  }
  return n;
}


/* ══════════════════════════════════════════════════════════════════════════════════════════════
   PINS WIN, INFORMED — Michael's ruling, 2026-08-25: *"user choice always wins, it's just
   informed."* See `docs/HANDOFF-your-week-pins-win-2026-08-25.md`.

   ⛔ THIS SUPERSEDES "THE BIOLOGICAL RULE IS NEVER BENT" IN THIS FILE'S OWN HEADER, and only for
   the pinned path. Nothing here relaxes a rule the engine chose on its own: the default week is
   still built to break none of them. What changed is what happens when the ATHLETE puts a session
   somewhere the law dislikes — the week is built as asked and the cost is named, rather than the
   engine quietly placing it elsewhere and explaining afterwards.

   ⛔ THREE OUTCOMES, AND ONLY ONE OF THEM IS A REFUSAL:
     • STRUCTURAL  — the week cannot be EXPRESSED (a session pinned to a day the athlete also marked
       unavailable; nowhere left to put anything). There is no trade-off to describe, because there
       is no week. This is the only thing that is not simply built.
     • BREACH      — a clearance in `COST` is unmet. The law says these carry injury risk, so they
       are named plainly and loudly, and the week is still built exactly as pinned.
     • TRADE-OFF   — the week is legal by Layer 1 and pays a Layer 2 shape cost: no day off, three
       stressors stacked, a run of hard days. Recovery is thinner; nothing is unsafe.

   ⚠️ THE TIER IS READ OFF THE LAYER, NOT HAND-ASSIGNED PER RULE. Layer 1 (`COST` in model.ts) rules
   a week LEGAL; Layer 2 (`score` above) picks among legal weeks. So an unmet `needs` is a breach by
   construction and a score term is a trade-off by construction, and a rule added to either layer
   gets the right tier without anybody remembering to classify it.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Which layer the rule that fired belongs to. Never a colour, never a severity number. */
export type ViolationTier = 'breach' | 'tradeoff';

/**
 * ⛔ A STABLE ID PER RULE, AND THE COPY LAYER KEYS OFF THIS AND NEVER OFF PROSE. The screen writes
 * one sentence per id; matching on a rendered string is how the two drift apart the first time a
 * word changes.
 */
export type RuleId =
  /* breaches — Layer 1, the `COST` clearances */
  | 'heavy_legs_clearance'
  | 'long_effort_clearance'
  | 'long_run_needs_legs'
  /* trade-offs — Layer 2, the shape terms in `score` */
  | 'no_rest_day'
  | 'no_recovery_day'
  | 'day_overloaded'
  | 'stressor_streak'
  | 'two_long_days'
  | 'same_sport_back_to_back';

export type Violation = {
  tier: ViolationTier;
  rule: RuleId;
  /** The athlete-facing label of the session the rule is about. */
  subject: string;
  /** The session on the other side of it, where a rule has two sides. */
  against?: string;
  /** Hours of clearance still outstanding. Breaches only. */
  shortBy?: number;
  /** Days the violation sits on, 0-6. */
  days: number[];
};

/**
 * ⛔ WHICH BREACH IS IT — read off the blocked session's LOAD and the system it needed, which is
 * exactly the `COST` row that failed. ⚠️ A row added to `COST` without a case here returns null and
 * the breach is dropped silently, which is the one failure mode worth watching: the default arm
 * therefore reports `heavy_legs_clearance` rather than nothing, so a new rule is loud, not lost.
 */
function ruleForUnmet(load: Load, system: SystemId): RuleId {
  if (load === 'long_run' && system === 'heavy_legs') return 'long_run_needs_legs';
  if (system === 'long_effort') return 'long_effort_clearance';
  return 'heavy_legs_clearance';
}

/** Which day each session label sits on, for the `days` field. */
function daysByLabel(placements: Placement[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of placements) for (const s of p.unit.sessions) out.set(s.label, p.day);
  return out;
}

/**
 * ⛔ EVERY RULE THE PLACED WEEK BREAKS, TIERED. Computed FROM the week, never during the search —
 * the search already minimises them through `score` and the `unmet.length * 1000` penalty, and a
 * second opinion computed on the way in is how the report and the week come to disagree.
 *
 * ⚠️ DEDUPED BY RULE + SUBJECT + COUNTERPART. `unmetNeeds` reports one row per (session, system,
 * debt) triple, so a squat blocked by two long days is two rows and reads as two problems.
 */
export function violationsOf(placements: Placement[], opts: { minRestDays?: number } = {}): Violation[] {
  const minRest = opts.minRestDays ?? 1;
  const at = daysByLabel(placements);
  const out: Violation[] = [];
  const seen = new Set<string>();
  const push = (v: Violation) => {
    const key = `${v.rule}|${v.subject}|${v.against ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };

  // ── BREACHES — Layer 1. The week is built anyway; these are the injury-risk sentences.
  for (const u of unmetNeeds(placements)) {
    push({
      tier: 'breach',
      rule: ruleForUnmet(u.load, u.system),
      subject: u.unit,
      against: u.blockedBy,
      shortBy: u.shortBy,
      days: [at.get(u.unit), at.get(u.blockedBy)].filter((d): d is number => d != null),
    });
  }

  // ── TRADE-OFFS — Layer 2. Legal weeks that cost the athlete something.
  // ⚠️ `restDaysOf` is the genuinely BLANK day; `recoveryDaysOf` is the wider "no stressor" set.
  // They are two different promises and the screen makes both, so both are reported.
  const rest = restDaysOf(placements);
  if (rest.length === 0) push({ tier: 'tradeoff', rule: 'no_rest_day', subject: 'the week', days: [] });
  const recovery = recoveryDaysOf(placements);
  if (recovery.length < minRest) {
    push({ tier: 'tradeoff', rule: 'no_recovery_day', subject: 'the week', days: [] });
  }

  // A day carrying three or more stressors — `overCap`'s own threshold, read per day so the
  // sentence can name the day rather than a count.
  const perDay = [0, 1, 2, 3, 4, 5, 6].map((d) =>
    placements.filter((p) => p.day === d).reduce((n, p) => n + stressorsOf(p.unit), 0));
  for (let d = 0; d < 7; d++) {
    if (perDay[d] >= 3) push({ tier: 'tradeoff', rule: 'day_overloaded', subject: DAY_NAMES[d], days: [d] });
  }

  // Stressor days running back to back past the streak the score tolerates.
  if (stressorStreakExcess(placements) > 0) {
    push({ tier: 'tradeoff', rule: 'stressor_streak', subject: 'the week', days: [] });
  }
  if (longDoubles(placements) > 0) {
    push({ tier: 'tradeoff', rule: 'two_long_days', subject: 'the week', days: [] });
  }
  if (sameSportDoubles(placements) > 0) {
    push({ tier: 'tradeoff', rule: 'same_sport_back_to_back', subject: 'the week', days: [] });
  }
  return out;
}

/**
 * ⛔ A WEEK THAT CANNOT BE EXPRESSED — and there is nothing to warn about, because there is no week.
 * Distinct from every rule above: those are weeks the athlete may have, at a stated cost. These are
 * contradictions in the ANSWERS themselves, and only the athlete can resolve them.
 */
export type StructuralConflict =
  /** A session pinned onto a day also marked "cannot train". */
  | { kind: 'pin_on_unavailable_day'; unit: string; day: number }
  /** Every day marked unavailable, with sessions still to place. */
  | { kind: 'no_day_left' };

export function structuralConflicts(
  units: Unit[],
  opts: { unavailableDays?: number[] } = {},
): StructuralConflict[] {
  const blocked = new Set(opts.unavailableDays ?? []);
  const out: StructuralConflict[] = [];
  for (const u of units) {
    if (u.pinnedDay != null && blocked.has(u.pinnedDay)) {
      out.push({ kind: 'pin_on_unavailable_day', unit: u.label, day: u.pinnedDay });
    }
  }
  if (units.length > 0 && blocked.size >= 7) out.push({ kind: 'no_day_left' });
  return out;
}

export type PinnedWeek = {
  /** The week as asked for. Present even when it breaks rules — that is the ruling. */
  placements: Placement[];
  restDays: number[];
  violations: Violation[];
  /** Non-empty only when the answers contradict each other; `placements` is then a best effort. */
  structural: StructuralConflict[];
};

/**
 * ⛔ THE PINS-WIN ENTRY POINT. The week is ALWAYS returned.
 *
 * ⛔⛔ IT DELEGATES THE SEARCH TO `resolve` RATHER THAN REIMPLEMENTING IT, AND THAT IS THE WHOLE
 * SAFETY ARGUMENT. `resolve` already (a) never moves a pinned unit — `fixed` is excluded from the
 * walk and the local-improvement sweep starts at `firstFree` — and (b) minimises violations while
 * placing the remainder, through `score` and the `unmet.length * 1000` term. So with no pins this
 * returns byte-identical placements to today BY CONSTRUCTION, not by a test that has to be kept in
 * agreement. ⛔ Do not fork the search to "handle pins properly"; it already does.
 *
 * ⚠️ WHAT CHANGED IS ONLY THE VERDICT. `resolve` reports `ok: false` when a rule is unmet and hands
 * back `best`; that is now read as "here is the week, and here is what it costs" rather than as a
 * failure the caller has to interpret. The old `Resolution` shape is untouched for the server
 * composer, which still reads it.
 */
export function resolveAroundPins(
  units: Unit[],
  opts: { minRestDays?: number; unavailableDays?: number[] } = {},
): PinnedWeek {
  const minRest = opts.minRestDays ?? 1;
  const structural = structuralConflicts(units, opts);
  const r = resolve(units, opts);
  const placements = r.ok ? r.placements : r.best;
  return {
    placements,
    restDays: restDaysOf(placements),
    violations: violationsOf(placements, { minRestDays: minRest }),
    structural,
  };
}

export function resolve(
  units: Unit[],
  opts: { minRestDays?: number; unavailableDays?: number[] } = {},
): Resolution {
  const minRest = opts.minRestDays ?? 1;
  /**
   * ⛔ DAYS THE ATHLETE SAID THEY CANNOT TRAIN (pins-win, 2026-08-25). A rest-day pin is a pin like
   * any other — it is absolute, and the engine arranges the remainder around it.
   *
   * ⚠️ IT CONSTRAINS THE FREE UNITS ONLY, NEVER A PINNED ONE. A session pinned onto a day the
   * athlete also marked unavailable is a contradiction the athlete entered, and it is the caller's
   * to report as structurally impossible — silently moving the session would be the engine
   * overruling a pin, which is the one thing this ruling forbids.
   * ⚠️ ABSENT OR EMPTY IS TODAY'S BEHAVIOUR EXACTLY. Every day stays a candidate, and the no-pins
   * default is byte-identical to what this file returned before the field existed.
   */
  const blocked = new Set(opts.unavailableDays ?? []);
  const dayCandidates = [0, 1, 2, 3, 4, 5, 6].filter((d) => !blocked.has(d));
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
      let bestDay = dayCandidates[0] ?? 0;
      let bestScore = -Infinity;
      for (const d of dayCandidates) {
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
        for (const d of dayCandidates) {
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
    for (const d of dayCandidates) walk(i + 1, [...acc, { unit: searched[i], day: d }]);
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
