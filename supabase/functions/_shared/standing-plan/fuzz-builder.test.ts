// ============================================================================
// THE FUZZ HARNESS — every stupid plan a Strong Focus athlete could ask for, and the proof that
// something always builds.
//
// ⛔⛔ WHAT THIS RUNS AGAINST. The REAL composition path, assembled here in the same order
// `generate-strength-plan/index.ts` assembles it: sport mix → `assignSports` → which sport holds the
// long slot → `chooseDayMap` → `endurancePins` → `buildStandingPlanRow`. Nothing is stubbed and no
// shortcut is taken past the day map, because the day map is where half the answers are decided.
//
// ⛔ NO PROD, NO BROWSER, NO WRITES. `buildStandingPlanRow` returns a plain object; nothing here
// touches Supabase, and no plan row is written anywhere.
//
// ⚠️ TWO ENGINES, TWO SWEEPS, AND THEY ARE NOT INTERCHANGEABLE. Placement lives in the COMPOSER
// (`compose.ts`, PlanSession rows on weekdays); soundness lives in the WEEK-MODEL
// (`week-model/resolve.ts`, Units carrying debts). There is no adapter between the two
// representations — `solver-adapter.ts` bridges the old slot solver, not composed sessions — so
// criteria 1-4 are swept over the composer and criterion 5 over the week-model, using the same
// inputs. Any claim that one sweep proves the other would be false.
//
// ⚠️ DETERMINISTIC. No `Date.now`, no `Math.random`. The "random" interior cases come from a fixed
// seed list through a small xorshift; the same run produces the same cases forever.
//
// ⛔ THIS IS A PERMANENT REGRESSION SUITE, not a one-off sweep (Michael, 2026-08-25). It found two
// real defects on its first run and both are fixed; it stays so the next change to the day map, the
// relocator or the sport assigner has to survive 16,832 shapes rather than the dozen anybody would
// think to write by hand.
//
// ⚠️ IT TAKES ~35s. That is the price of the coverage and it is deliberate — see FUZZ 5 for what
// was sampled rather than swept, and why the full cross product is not run.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/standing-plan/fuzz-builder.test.ts
// ============================================================================

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FRAMES,
  assignSports,
  buildStandingPlanRow,
  chooseDayMap,
  defaultCompetitionLifts,
  frameFixedDaysFor,
  HAIRCUT_CAUSE_IS_OURS,
  isHardSlot,
  isLongSlot,
  weekdayForFrameDay,
  type ColumnKind,
  type PlanSession,
  type Weekday,
} from './index.ts';
import { buildUnits, type Load, type Session } from '../week-model/model.ts';
import {
  lowerDaysOf, placementsOf, typedSessionsOf, weekConflicts,
} from './week-conflicts.ts';
import {
  resolveAroundPins, unmetNeeds, recoveryDaysOf, type Placement,
} from '../week-model/resolve.ts';

const DAYS: Weekday[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: {},
};
/**
 * ⛔ WORKING NUMBERS ARE PRESENT, AND THEY HAVE TO BE (2026-08-26). Without them `exerciseForSlot`
 * returns "By feel" before it ever reaches `prescribedLoad`, so the lower-body haircut never runs
 * and NEITHER of the two sentences that explain it is ever written. Criterion 8 checks the
 * athlete-visible OUTPUT rather than an internal flag, so the sweep has to build weeks that
 * actually carry a number.
 *
 * ⚠️ PLACEMENT IS UNAFFECTED. Criteria 1-4 and 6 are about which weekday a session lands on, and a
 * weight changes none of them. ⚠️ Week one is still the test week: the skip needs `skipTestWeek`
 * as well, and nothing here sets it.
 */
const wn = (lift: 'bench' | 'squat' | 'deadlift' | 'overheadPress', predicted: number) => ({
  lift, predicted1RM: predicted, workingNumber: Math.round(predicted * 0.96),
  measured: { weight: Math.round(predicted * 0.85), reps: 5 }, cite: 'fuzz fixture',
});
const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: defaultCompetitionLifts(),
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  workingNumbers: {
    bench: wn('bench', 200), squat: wn('squat', 265),
    deadlift: wn('deadlift', 340), overheadPress: wn('overheadPress', 125),
  },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
};

/** How many distinct weekdays the frame puts lifting on. Read off `FRAMES`, never restated. */
const LIFT_DAY_COUNT = frameFixedDaysFor('strength_5k').lifting.length;

// ── THE CASE ─────────────────────────────────────────────────────────────────────────────────────

type Case = {
  runs: number;
  rides: number;
  swimDays: number;
  swimEasy: number;
  /** null = the athlete named no day for this slot; the engine places it. */
  longDay: Weekday | null;
  hardDays: Array<Weekday | null>;
  blocked: Weekday[];
  taper: boolean;
};

const describe = (c: Case): string => JSON.stringify({
  runs: c.runs, rides: c.rides, swimDays: c.swimDays, swimEasy: c.swimEasy,
  long: c.longDay, hard: c.hardDays, blocked: c.blocked, taper: c.taper,
});

/**
 * ⛔ THE REAL ASSEMBLY, COPIED FROM `generate-strength-plan/index.ts` IN ITS OWN ORDER. The long
 * slot's sport is DERIVED from the mix rather than chosen here, because that derivation is what
 * decides which of two long pins is servable — and getting it wrong would make the whole sweep
 * measure a path no athlete travels.
 */
function build(c: Case) {
  const mix = { runs: c.runs, rides: c.rides, swimDays: c.swimDays };
  const longSlotSport = (() => {
    const a = assignSports(FRAMES.strength_5k.columns.standard, mix);
    const long = Object.entries(a.byKey).find(([k]) => {
      const [d, i] = k.split(':').map(Number);
      const slot = FRAMES.strength_5k.columns.standard.find((x) => x.day === d)?.endurance[i];
      return slot ? isLongSlot(slot) : false;
    });
    return long?.[1]?.sport ?? 'run';
  })();

  const dayMap = chooseDayMap('strength_5k', {
    longRunDay: longSlotSport === 'ride' ? null : c.longDay,
    longRideDay: longSlotSport === 'ride' ? c.longDay : null,
    longSlotSport,
    hardDays: c.hardDays,
    unavailableDays: c.blocked,
  });

  const row = buildStandingPlanRow({
    compose: {
      ...BASE,
      endurancePins: { long: c.longDay, hard: c.hardDays },
      unavailableDays: c.blocked,
      sportMix: mix,
      swimEasySessions: c.swimEasy,
    },
    weeks: 2,
    taperWeeks: c.taper ? [2] : [],
    dayMap,
  });
  return { row, dayMap, longSlotSport };
}

// ── THE FIVE CRITERIA ────────────────────────────────────────────────────────────────────────────

/**
 * ⛔⛔ CRITERION 2 IS TWO RULES, NOT ONE, AND CONFLATING THEM MADE THE FIRST RUN REPORT 7,168
 * "FAILURES" THAT WERE THE ENGINE OBEYING ITS OWN RULING.
 *
 *   · **Endurance on a blocked day is always a defect.** It is movable by definition (Michael,
 *     2026-08-25 morning), so there is no arrangement in which it may sit on a day off.
 *   · **Lifting or plyo on a blocked day is a stated TRADE-OFF, not a defect** — but only when the
 *     day map says so. The frame's order is fixed and only a whole-week ROTATION can move it, and
 *     the arithmetic below means some weeks have no rotation that clears every day off. The ruling
 *     for that case is warn-never-block. So the test is not "did lifting land on a day off" but
 *     "did lifting land on a day off IN SILENCE".
 *
 * ⚠️ SILENT IS THE BUG. `dayMap.honoured.unavailableDays === false` must come with a compromise
 * naming the day; a week that puts a barbell on a day the athlete cannot train and says nothing is
 * the failure this criterion is really looking for.
 */
/** Counts of trade-offs that are expected rather than wrong — reported, never asserted on. */
const tradeOffs = {
  liftOnBlockedWithNote: 0,
  /** Hard endurance on a lower-body day that the athlete's own answers put there, WITH a note. */
  hardOnLowerWithNote: 0,
  /** A keystone clearance the athlete broke, WITH a sentence naming the day and the shortfall. */
  keystoneBreakWithNote: 0,
};

// ── VIADA'S PLACEMENT LAWS, AS CHECKS (2026-08-26) ───────────────────────────────────────────────
//
// ⛔ WHY THEY RIDE THE SAME CASES rather than living in a suite of their own: the laws have to hold
// on every one of the 16,832 shapes, and a separate sweep would sweep a different space and prove a
// different thing. Criteria 6-8 below are evaluated inside `checkComposer`'s week loop.
//
// ⛔ THE LAWS, PAGE-CITED (`docs/SOURCE-viada-hybrid-athlete.md`):
//
//   · **p246 §E1a — the frame's endurance layout.** Day 1 MLSS+ with ME Upper, day 3 NT on the plyo
//     day, day 4 VT1 with DE Upper, day 6 LSD, day 7 rest. **Days 2 and 5 — the lower-body days —
//     carry no endurance at all.** Two consequences, and they are criterion 6: an UNPINNED slot
//     lands on its frame day, and hard endurance never sits on a lower-body day.
//
//   · **p131 — keystones.** *"Keystone sessions are the ones that require you to be in the most
//     recovered state to perform"*, and the placement law is **fresh in the relevant systems, not
//     fresh overall.** ⛔ THAT RULE IS ALREADY IN CODE — `week-model/model.ts`'s `COST` table:
//     `heavy_lower` needs `heavy_legs` and `long_effort` clear, `hard_cardio` leaves 36h on the
//     legs, a long effort leaves 48h. Criterion 7 ASKS that table rather than restating it.
//     ⚠️ Q-288 recorded the rule as missing. It is not missing, it is **UNWIRED**: `compose.ts`
//     builds no Units and never calls the resolver, so no standing-plan week has ever been scored
//     by the law. This check is the first thing that asks it.
//
//   · **p247 §E1d — the ONE compensated break.** *"Monday's run is fairly challenging, given that
//     there is an ME lower session the next day… a 3 to 4 percent reduction in working 1RM should
//     be assumed here."* So the adjacency is legal **only with the haircut engaged**, and the
//     haircut is honest **only when the adjacency is really there**. Criterion 8 is that biconditional.
//
//   · **p130 — consolidation is judged by what each session REQUIRES.** A spacing the ATHLETE broke
//     is legal and must be SAID; a spacing the ENGINE broke is a defect. That is not a fifth check,
//     it is the classifier applied to the three above — the same shape criterion 2 already uses,
//     and Michael's law: choice wins, informed.

/**
 * ⛔ THE COMPOSED WEEK IN THE LAW'S VOCABULARY — `week-conflicts.ts`'s OWN mapping, imported.
 *
 * ⚠️ THIS FILE USED TO CARRY ITS OWN COPY, and that made the sweep prove nothing about the thing
 * that ships: a harness checking a duplicate of the production logic checks the duplicate. The
 * mapping, the placements and the sentences all live in `week-conflicts.ts` now; this reads them.
 */
function lawViewOf(ss: PlanSession[], column: ColumnKind): {
  typed: Array<{ s: PlanSession; load: Load; frameDay: number | null; role: 'long' | 'hard' | null; hardIndex: number }>;
  placements: Placement[];
  dayOfLabel: Map<string, number>;
} {
  const typed = typedSessionsOf(ss, 'strength_5k', column);
  /**
   * ⛔ THE FRAME SLOT EACH ENDURANCE ROW FILLED — the harness's own question, not the module's.
   * Criterion 6 needs to know which slot a session came from and whether the athlete pinned THAT
   * slot; `week-conflicts.ts` only needs the load. So the zip is here and the loads are imported.
   */
  const slots = frameEnduranceSlotRoles(column);
  const withSlot = typed.map((t) => ({ ...t, frameDay: null as number | null, role: null as 'long' | 'hard' | null, hardIndex: -1 }));
  let si = 0;
  let hardSeen = 0;
  const isEnd = (x: PlanSession) => x.type === 'run' || x.type === 'ride' || x.type === 'swim';
  const isAddOn = (x: PlanSession) =>
    (x.tags ?? []).includes('swim_addon') || (x.tags ?? []).includes('advanced_tier');
  for (const row of withSlot) {
    if (!isEnd(row.s) || isAddOn(row.s) || (row.s.tags ?? []).includes('plyo')) continue;
    const slot = slots[si];
    si += 1;
    if (!slot) continue;
    row.frameDay = slot.frameDay;
    row.role = slot.role;
    row.hardIndex = slot.role === 'hard' ? hardSeen++ : -1;
  }
  const { placements, dayOfLabel } = placementsOf(typed);
  const asIndex = new Map<string, number>();
  for (const [label, day] of dayOfLabel) asIndex.set(label, DAYS.indexOf(day));
  return { typed: withSlot, placements, dayOfLabel: asIndex };
}

/** The frame's endurance slots with their frame day, in emit order. Read off `FRAMES`. */
function frameEnduranceSlotRoles(column: ColumnKind): Array<{ frameDay: number; role: 'long' | 'hard' | null }> {
  const out: Array<{ frameDay: number; role: 'long' | 'hard' | null }> = [];
  for (const d of FRAMES.strength_5k.columns[column]) {
    for (const slot of d.endurance) {
      out.push({
        frameDay: d.day,
        role: isLongSlot(slot) ? 'long' : isHardSlot(slot) ? 'hard' : null,
      });
    }
  }
  return out;
}

/**
 * ⛔ SENTENCES THAT NAME A CLEARANCE — the note criterion 7's athlete-caused arm is waiting for.
 * A break the athlete asked for is legal; a break nobody mentions is the bug. ⚠️ The haircut's own
 * p247 sentence deliberately does NOT match: it names no weekday, so it can never stand in for a
 * note about a specific collision.
 */
const CLEARANCE_WORDS = /(clear|fresh|still in the legs|too close|the day before|recover|short)/i;

/**
 * ⛔ CRITERIA 6-8 — VIADA'S PLACEMENT LAWS ON ONE COMPOSED WEEK. Returns failures; the caller's
 * `report` groups them by class. Never throws.
 */
function checkPlacementLaws(
  c: Case,
  built: ReturnType<typeof build>,
  wk: string,
  ss: PlanSession[],
): string[] {
  const fails: string[] = [];
  const column: ColumnKind = c.taper && wk === '2' ? 'taper' : 'standard';
  const dayOf = (frameDay: number) => weekdayForFrameDay(frameDay, built.dayMap.offset);
  /**
   * ⛔ EVERY SENTENCE THE BLOCK CARRIES. `placement_compromises` is the channel the athlete already
   * reads (`NonRaceBuilder.tsx:2716`); `notes` is what `describeBlock` folds into the plan's own
   * description. Both are on the row, so both count as SAID — and criterion 2's own standard for
   * "said" is the same one used here: the day is named.
   */
  const spoken = [
    ...(built.row.placement_compromises ?? []).map((x) => x.text),
    ...built.row.notes.map((n) => n.text),
  ];
  const namesDay = (d: string) => spoken.some((t) => t.includes(d));
  /**
   * ⚠️ ONLY THE SENTENCES THAT NAME A DAY GO IN A FAILURE LINE. The block carries a dozen source
   * notes about plyo dose and accessory folds; printing all of them buried the one fact the reader
   * needs — whether anything mentioned this day at all.
   */
  const dayNotes = () => {
    const hits = spoken.filter((t) => DAYS.some((d) => t.includes(d)));
    return hits.length > 0 ? hits.join(' | ') : 'NOTHING NAMES ANY DAY';
  };
  const namesClearanceOn = (d: string) =>
    spoken.some((t) => t.includes(d) && CLEARANCE_WORDS.test(t));

  const view = lawViewOf(ss, column);
  const lower = lowerDaysOf('strength_5k', column);
  const lowerWeekdays = [...lower.me, ...lower.de].map(dayOf);

  /**
   * ⛔⛔ WHICH SESSIONS THE ATHLETE'S OWN ANSWERS MOVED — p130's classifier, and the first draft of it
   * was wrong in a way that mattered.
   *
   * It asked *"is this session ON a day the athlete named"*, which misses the biggest athlete-caused
   * class of all: a session RELOCATED off a blocked day lands somewhere the athlete never named, so
   * every consequence of their day off was being filed against the engine. A break is the athlete's
   * when either session sitting in it is one they pinned, or one their day off displaced.
   */
  const touchedBy = (t: TypedSession): boolean => {
    if (t.frameDay == null) return false;
    const ownPin = t.role === 'long'
      ? c.longDay
      : t.role === 'hard' ? c.hardDays[t.hardIndex] ?? null : null;
    if (ownPin) return true;                                   // they named this session's day
    if (c.blocked.includes(dayOf(t.frameDay) as Weekday)) return true;  // their day off moved it
    return false;
  };
  /** Label → was this session's day the athlete's doing. Keyed the way `lawViewOf` labels them. */
  const touchedLabels = new Set<string>();
  view.typed.forEach((t, i) => {
    if (touchedBy(t)) touchedLabels.add(`${t.s.name} #${i}`);
  });

  // 6a ── AN UNPINNED SLOT LANDS ON ITS FRAME DAY (p246 §E1a).
  //
  // ⛔ THIS IS THE BANNER'S UNVERIFIED CLAIM, MADE CHECKABLE: *"one untouched preview build post-fix
  // should land hard sessions Mon + Wed (frame days) — nobody has watched it."* Stated per SLOT
  // rather than per week, so a build that pins the long day still has to put its unpinned hard
  // sessions on the frame's own days under the chosen rotation.
  for (const t of view.typed) {
    if (t.frameDay == null) continue;
    const pinned = t.role === 'long'
      ? !!c.longDay
      : t.role === 'hard' ? !!c.hardDays[t.hardIndex] : false;
    if (pinned) continue;
    const want = dayOf(t.frameDay);
    if (t.s.day === want) continue;
    // ⚠️ A DAY OFF MAY STILL MOVE IT, and `compose.ts` says so through `enduranceMoves`. Silent is
    // the bug, exactly as in criterion 2.
    if (c.blocked.includes(want as Weekday) && namesDay(want)) continue;
    fails.push(`week ${wk}: UNPINNED endurance left its frame day — `
      + `${t.s.name} expected ${want}, landed ${t.s.day} · blocked=[${c.blocked.join(',')}] · `
      + `notes=[${dayNotes()}]`);
  }

  // 6b ── HARD ENDURANCE NEVER SITS ON A LOWER-BODY DAY (p246 §E1a — days 2 and 5 carry none).
  for (const t of view.typed) {
    if (t.load !== 'hard_cardio') continue;
    if (!lowerWeekdays.includes(t.s.day as Weekday)) continue;
    const ownPin = t.role === 'hard' ? c.hardDays[t.hardIndex] : null;
    const athleteCaused = ownPin === t.s.day
      || (t.frameDay != null && c.blocked.includes(dayOf(t.frameDay) as Weekday))
      || (!!ownPin && c.blocked.includes(ownPin as Weekday));
    if (athleteCaused) {
      // ⛔ p130: legal, because the athlete chose it — and it must be SAID (Michael's law).
      if (namesDay(t.s.day)) { tradeOffs.hardOnLowerWithNote++; continue; }
      // ⚠️ Placement-law note: `checkPlacementLaws` runs 6b before the conflicts are computed below,
      // so this arm re-asks rather than reading them. Same answer, one order later.
      if (weekConflicts({ sessions: ss, frame: 'strength_5k', column, dayOffset: built.dayMap.offset })
        .some((c) => c.days.includes(t.s.day as Weekday))) {
        tradeOffs.hardOnLowerWithNote++;
        continue;
      }
      fails.push(`week ${wk}: hard endurance on the lower-body day ${t.s.day} because the ATHLETE `
        + `put it there, and NOTHING SAYS SO — ${t.s.name} · notes=[${dayNotes()}]`);
      continue;
    }
    fails.push(`week ${wk}: the ENGINE put hard endurance on a lower-body day — `
      + `${t.s.day}/${t.s.name} · lower days ${lowerWeekdays.join(',')} · offset ${built.dayMap.offset}`);
  }

  // 6c ── THE FRAME'S SLOT COUNT SURVIVES. A row more or fewer than the column prints means the zip
  //       above is reading a different week from the one `composeWeek` built.
  {
    const wantSlots = frameEnduranceSlotRoles(column).length;
    const gotSlots = view.typed.filter((t) => t.frameDay != null).length;
    if (gotSlots !== wantSlots) {
      fails.push(`week ${wk}: ${gotSlots} frame endurance rows, the ${column} column prints ${wantSlots}`);
    }
  }

  /**
   * ⛔ p247's ONE NAMED ADJACENCY, MEASURED ON THE PLACED CALENDAR — a hard RUN on the day before
   * ME Lower. Criterion 8 below is the only thing that judges it now; criterion 7 needs no exemption
   * for it since D-453 set the leg debt to 24h and the day-after clears exactly.
   */
  // ⚠️ EVERY ME LOWER DAY — `lowerDaysOf` returns a list now (a frame may open two lower days on an
  // ME slot). `strength_5k` has exactly one, so this measures what it always measured.
  const daysBeforeMeLower = new Set(
    lower.me.map((fd) => DAYS[(DAYS.indexOf(dayOf(fd)) + 6) % 7] as string),
  );
  const hardRunTheDayBefore = daysBeforeMeLower.size > 0 && view.typed.some((t) =>
    t.load === 'hard_cardio' && t.s.type === 'run' && daysBeforeMeLower.has(t.s.day));

  // 7 ── KEYSTONES: FRESH IN THE RELEVANT SYSTEMS (p131, Q-288). Asked of `COST`, not restated.
  //
  // ⛔ THE p247 CARVE-OUT THAT STOOD HERE IS DELETED, AND ITS DELETION IS THE POINT OF D-453.
  // It exempted one adjacency — a hard session the day before ME Lower — because `hard_cardio`
  // emitted 36h and p246's own printed week is 24h apart, so the law was calling the source's week
  // illegal and this file was papering over it. Michael overruled the 36 on 2026-08-26. At 24h the
  // day-after clears exactly and no exemption is needed, which is what an exemption's absence
  // should always mean: the law now agrees with the book instead of being argued around.
  /**
   * ⛔ CHECKED STRUCTURALLY, NOT BY MATCHING PROSE. A first draft asked whether any note contained
   * the day AND a clearance word, and it graded the COPY rather than the wiring — a sentence that
   * named the collision perfectly failed for not using the word "clear". What matters is that the
   * break produced a conflict, and that the conflict's sentence reached the block.
   */
  const conflicts = weekConflicts({
    sessions: ss, frame: 'strength_5k', column, dayOffset: built.dayMap.offset,
  });
  for (const u of unmetNeeds(view.placements)) {
    const subjectDay = view.dayOfLabel.get(u.unit);
    const blockerDay = view.dayOfLabel.get(u.blockedBy);
    const where = subjectDay == null ? '?' : DAYS[subjectDay];
    const covered = conflicts.some((c) =>
      (subjectDay != null && c.days.includes(DAYS[subjectDay]))
      || (blockerDay != null && c.days.includes(DAYS[blockerDay])));
    if (covered) { tradeOffs.keystoneBreakWithNote++; continue; }
    const athleteCaused = touchedLabels.has(u.unit) || touchedLabels.has(u.blockedBy);
    fails.push(`week ${wk}: KEYSTONE break the ${athleteCaused ? 'ATHLETE asked for and NOTHING NAMES' : 'ENGINE placed'}`
      + ` — ${u.unit} on ${where} needs ${u.system} clear; ${u.blockedBy} leaves it outstanding, `
      + `${u.shortBy}h short`);
  }
  // ⛔ AND THE SENTENCE ACTUALLY REACHED THE BLOCK. A conflict computed and never surfaced is the
  //    silent cost this whole pass exists to end.
  for (const c of conflicts) {
    if (!spoken.includes(c.text)) {
      fails.push(`week ${wk}: a ${c.rule} conflict was found and the block never says it — "${c.text}"`);
    }
  }

  // 8 ── p247's ONE COMPENSATED BREAK, AS A BICONDITIONAL.
  //
  // ⛔ THE ADJACENCY IS MEASURED ON THE CALENDAR, NOT ON THE FRAME, and that is the whole point.
  // `sport-slots.ts` used to decide this from the FRAME's day-1 slot alone and never looked at a
  // weekday — while `enduranceDayFor` can pin that hard run anywhere in the week. So the flag and
  // the fact disagreed in both directions, and both directions were wrong:
  //   · adjacency with the haircut OFF = p247's break, uncompensated (29 shapes).
  //   · the haircut ON with no adjacency = a 3.5% reduction whose own on-screen sentence
  //     ("the run the day before is still in the legs") describes a day that has no run on it
  //     (6,688 shapes).
  // ⛔ FIXED 2026-08-26: `compose.ts` now answers it off the placed calendar and the frame-level
  // reader is deleted. This check stays, because it is what proves the two cannot drift apart again.
  //
  // ⛔ CHECKED ON THE BLOCK'S OWN SENTENCES, NOT ON AN INTERNAL FLAG. The first draft asked
  // `assignSports` for the frame-level flag, which is the very reader the fix moved away from — so
  // it went on reporting the old owner's answer after the composer had stopped using it. What
  // the athlete can actually see is the pair of sentences `exerciseForSlot` writes, and those are
  // what this asserts:
  //   · the reduction engaged → p247's *"the run the day before is still in the legs"*.
  //   · the reduction dropped → `HAIRCUT_CAUSE_IS_OURS`, our stated reading of his p280 reason.
  // Exactly one of them is true of a block, and which one must match the calendar.
  {
    // ⚠️ NAMES THE FRAME'S ME LOWER DAYS — one for `strength_5k`, so the sentences below read the
    // same as they always did.
    const meWeekday = lower.me.map(dayOf).join(' and ');
    if (lower.me.length > 0) {
      const before = [...daysBeforeMeLower].join(' and ');
      const adjacency = hardRunTheDayBefore;
      const saysReduced = spoken.some((t) => t.includes('three and a half per cent'));
      const saysDropped = spoken.some((t) => t === HAIRCUT_CAUSE_IS_OURS);
      if (adjacency && !saysReduced) {
        fails.push(`week ${wk}: hard RUN on ${before}, ME Lower on ${meWeekday}, and the block never `
          + `says the lower-body weights were reduced — p247's one compensated break, UNCOMPENSATED`);
      }
      if (!adjacency && !saysDropped) {
        fails.push(`week ${wk}: no hard run on ${before} (ME Lower is ${meWeekday}) and the block `
          + `never says the reduction was dropped — either it is reducing for a cause that is not `
          + `there, or nothing explains the number`);
      }
      if (adjacency && saysDropped && !saysReduced) {
        fails.push(`week ${wk}: a hard RUN sits on ${before} and the block claims the reduction was `
          + `dropped because the hard work is on the bike — the sentence contradicts the calendar`);
      }
    }
  }

  return fails;
}

/** Returns a list of failures, empty when the case passes. Never throws for a normal failure. */
function checkComposer(c: Case): string[] {
  const fails: string[] = [];
  let built: ReturnType<typeof build>;
  try {
    built = build(c);
  } catch (e) {
    // ⛔ CRITERION 1, HARDEST FORM: a throw is a failure, not an outcome.
    return [`THREW: ${(e as Error)?.message ?? e}`];
  }
  const weeks = Object.entries(built.row.sessions_by_week);
  if (weeks.length === 0) return ['no weeks returned at all'];

  for (const [wk, sessions] of weeks) {
    const ss = sessions as PlanSession[];
    // 1 ── A WEEK IS RETURNED, NEVER EMPTY.
    if (ss.length === 0) { fails.push(`week ${wk} is empty`); continue; }

    // 2 ── NO SESSION ON A BLOCKED DAY — split by what the engine is allowed to move. See above.
    const isEndurance = (s: PlanSession) =>
      s.type === 'run' || s.type === 'ride' || s.type === 'swim';
    const onBlocked = ss.filter((s) => c.blocked.includes(s.day as Weekday));
    const enduranceOnBlocked = onBlocked.filter(isEndurance);
    const frameOnBlocked = onBlocked.filter((s) => !isEndurance(s));
    if (enduranceOnBlocked.length > 0) {
      fails.push(`week ${wk}: ENDURANCE on a blocked day — `
        + enduranceOnBlocked.map((s) => `${s.day}/${s.name}`).join(', '));
    }
    if (frameOnBlocked.length > 0) {
      const named = [...new Set(frameOnBlocked.map((s) => s.day))];
      const spoken = named.every((d) =>
        built.dayMap.compromises.some((x) => x.text.includes(d)));
      if (!spoken || built.dayMap.honoured.unavailableDays) {
        // ⚠️ SUB-CLASSIFIED, because "something frame-fixed is unreported" turned out to be two
        // different defects wearing one label and the counts hid that.
        const plyoOnly = frameOnBlocked.every((s) => (s.tags ?? []).includes('plyo'));
        const kind = plyoOnly
          ? (built.dayMap.honoured.unavailableDays
            ? 'PLYO on a blocked day, rotation says HONOURED, no note at all'
            : 'PLYO on a blocked day, note names only the lifting days')
          : (built.dayMap.honoured.unavailableDays
            ? 'LIFT on a blocked day, rotation says HONOURED, no note at all'
            : 'LIFT+PLYO on a blocked day, note names the lifts but not the plyo day');
        fails.push(`week ${wk}: ${kind} — `
          + `${frameOnBlocked.map((s) => `${s.day}/${s.name}`).join(', ')} · `
          + `honoured=${built.dayMap.honoured.unavailableDays} · `
          + `notes=[${built.dayMap.compromises.map((x) => x.text).join(' | ')}]`);
      } else if (wk === '2') {
        tradeOffs.liftOnBlockedWithNote++;
      }
    }

    // 3 ── EVERY CLUB/PINNED DAY HONOURED.
    //    ⚠️ EXCEPT WHEN THE ATHLETE ALSO BLOCKED IT. That contradiction is resolved in the
    //    athlete's other favour by the 2026-08-25 ruling: the blocked day wins and the session
    //    moves. Criterion 2 already covers where it may not go.
    const isEnd = isEndurance;
    if (c.longDay && !c.blocked.includes(c.longDay)) {
      const long = ss.find((s) => isEnd(s) && /long/i.test(s.name));
      if (long && long.day !== c.longDay) {
        fails.push(`week ${wk}: long pinned ${c.longDay}, landed ${long.day}`);
      }
    }
    for (const h of c.hardDays) {
      if (!h || c.blocked.includes(h)) continue;
      const anyOn = ss.some((s) => isEnd(s) && s.day === h);
      if (!anyOn) fails.push(`week ${wk}: hard pinned ${h}, no endurance session there`);
    }

    // 4 ── EXACTLY THE FRAME'S LIFT-DAY COUNT.
    const liftDays = new Set(
      ss.filter((s) => s.type === 'strength' && !(s.tags ?? []).includes('plyo')).map((s) => s.day),
    );
    if (liftDays.size !== LIFT_DAY_COUNT) {
      fails.push(`week ${wk}: ${liftDays.size} lift days, expected ${LIFT_DAY_COUNT} `
        + `[${[...liftDays].join(',')}]`);
    }

    // 6-8 ── VIADA'S PLACEMENT LAWS. See `checkPlacementLaws` for the pages and the classifier.
    for (const f of checkPlacementLaws(c, built, wk, ss)) fails.push(f);
  }
  return fails;
}

/**
 * ⛔ CRITERION 5, ON THE ENGINE THAT OWNS IT. The composer emits no violations; `week-model` does.
 * The check is a CONSISTENCY one rather than a judgement: silence is only allowed when the placed
 * week genuinely has no unmet clearance and meets the recovery floor. Asserting "the week is
 * unsound" any other way would mean this file holding a second opinion about the law.
 */
function checkViolations(c: Case): string[] {
  const fails: string[] = [];
  const sessions: Session[] = [
    { id: 'sq', label: 'Back Squat', load: 'heavy_lower', minutes: 60 },
    { id: 'bp', label: 'Bench Press', load: 'upper', minutes: 60 },
    { id: 'dl', label: 'Deadlift', load: 'heavy_lower', minutes: 60 },
  ];
  const pins: Record<string, number> = {};
  const idx = (d: Weekday) => DAYS.indexOf(d);
  if (c.runs > 0 || c.rides > 0) {
    const sport = c.rides > c.runs ? 'bike' : 'run';
    sessions.push({ id: 'lg', label: sport === 'run' ? 'Long Run' : 'Long Ride', load: sport === 'run' ? 'long_run' : 'long_ride', sport, minutes: 90 });
    if (c.longDay) pins.lg = idx(c.longDay);
  }
  c.hardDays.forEach((h, i) => {
    const sport = i === 0 && c.rides > 0 ? 'bike' : 'run';
    sessions.push({ id: `h${i}`, label: `Hard ${sport}`, load: 'hard_cardio', sport, minutes: 45 });
    if (h) pins[`h${i}`] = idx(h);
  });
  for (let i = 0; i < Math.max(0, c.runs - 1); i++) {
    sessions.push({ id: `er${i}`, label: 'Easy Run', load: 'easy', sport: 'run', minutes: 45 });
  }
  for (let i = 0; i < Math.max(0, c.rides - 1); i++) {
    sessions.push({ id: `eb${i}`, label: 'Easy Ride', load: 'easy', sport: 'bike', minutes: 60 });
  }
  for (let i = 0; i < c.swimDays; i++) {
    sessions.push({ id: `sw${i}`, label: 'Swim', load: 'easy', sport: 'swim', minutes: 60 });
  }

  let w: ReturnType<typeof resolveAroundPins>;
  try {
    w = resolveAroundPins(buildUnits(sessions, pins), {
      minRestDays: 1,
      unavailableDays: c.blocked.map(idx),
    });
  } catch (e) {
    return [`week-model THREW: ${(e as Error)?.message ?? e}`];
  }

  // 1 ── A WEEK CAME BACK, WITH EVERY UNIT IN IT.
  if (w.placements.length !== buildUnits(sessions, pins).length) {
    fails.push(`week-model dropped units: ${w.placements.length} placed of `
      + `${buildUnits(sessions, pins).length}`);
  }
  // 2 ── NOTHING ON A BLOCKED DAY.
  for (const p of w.placements) {
    if (c.blocked.map(idx).includes(p.day)) {
      fails.push(`week-model put ${p.unit.label} on blocked ${DAYS[p.day]}`);
    }
  }
  // 5 ── SILENCE ONLY WHEN CLEAN.
  const unmet = unmetNeeds(w.placements);
  const recovery = recoveryDaysOf(w.placements).length;
  const unsound = unmet.length > 0 || recovery < 1;
  if (unsound && w.violations.length === 0) {
    fails.push(`unsound week reported NO violation — ${unmet.length} unmet, ${recovery} recovery days`);
  }
  if (!unsound && w.violations.some((v) => v.tier === 'breach')) {
    fails.push('a clean week reported a BREACH');
  }
  return fails;
}

// ── THE SPACE ────────────────────────────────────────────────────────────────────────────────────

/** Every subset of the seven weekdays with 0-6 members. ⚠️ 7 is out of scope — see the ruling. */
function blockedSubsets(maxSize: number): Weekday[][] {
  const out: Weekday[][] = [];
  for (let mask = 0; mask < 128; mask++) {
    const set = DAYS.filter((_, i) => (mask >> i) & 1);
    if (set.length <= maxSize) out.push(set);
  }
  return out;
}

const MIXES = [
  { runs: 4, rides: 0, label: 'run only' },
  { runs: 0, rides: 4, label: 'ride only' },
  { runs: 3, rides: 2, label: 'run + ride' },
  { runs: 0, rides: 0, label: 'zero endurance' },
];

/** ⛔ FIXED SEEDS. No clock, no `Math.random` — the interior sample is the same set forever. */
const SEEDS = [1, 7, 13, 42, 99, 137, 271, 512, 1009, 2027, 4093, 8191];
function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 0xffffffff;
  };
}

// ── THE SWEEPS ───────────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ FAILURES ARE GROUPED BY CLASS, NOT LISTED. The first run printed 25 samples of one defect and
 * hid the others behind them — which is the same "score that lies" shape in a test report: a number
 * that looks like coverage and is one bug repeated. Each class prints its count and ONE exact input.
 */
const classOf = (f: string): string => f
  .replace(/—.*/s, '')
  .replace(/week \d+: /, '')
  .trim();

function report(name: string, cases: Case[], check: (c: Case) => string[]): number {
  const byClass = new Map<string, { n: number; first: string }>();
  let total = 0;
  for (const c of cases) {
    for (const f of check(c)) {
      total++;
      const k = classOf(f);
      const hit = byClass.get(k);
      if (hit) hit.n++;
      else byClass.set(k, { n: 1, first: `${f}\n        input: ${describe(c)}` });
    }
  }
  console.log(`  ${name}: ${cases.length} combinations, ${total} failures in `
    + `${byClass.size} class(es), ${tradeOffs.liftOnBlockedWithNote} stated lift-on-day-off trade-offs`);
  console.log(`    · stated trade-offs: hard-on-lower-with-note ${tradeOffs.hardOnLowerWithNote}, `
    + `keystone-break-with-note ${tradeOffs.keystoneBreakWithNote}`);
  tradeOffs.liftOnBlockedWithNote = 0;
  tradeOffs.hardOnLowerWithNote = 0;
  tradeOffs.keystoneBreakWithNote = 0;
  for (const [k, v] of [...byClass.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`    ✗ [${v.n}×] ${k}`);
    console.log(`        e.g. ${v.first}`);
  }
  assert(total === 0, `${name}: ${total} failures — see the log above`);
  return cases.length;
}

Deno.test('FUZZ 1 — EXHAUSTIVE: every blocked-day subset (0-6) × every mix × every long-pin day', () => {
  /**
   * ⛔ THE FULL BLOCKED-DAY LATTICE. 127 subsets of size 0-6, against every sport mix and every day
   * the long session could be pinned to, INCLUDING days inside the blocked set (the contradiction).
   */
  const cases: Case[] = [];
  for (const m of MIXES) {
    for (const blocked of blockedSubsets(6)) {
      for (const longDay of [null, ...DAYS]) {
        cases.push({
          runs: m.runs, rides: m.rides, swimDays: 0, swimEasy: 0,
          longDay, hardDays: [], blocked, taper: false,
        });
      }
    }
  }
  console.log('EXHAUSTIVE over: blocked-day subsets 0-6 × 4 mixes × 8 long-pin values');
  report('blocked × mix × long', cases, checkComposer);
});

Deno.test('FUZZ 2 — EXHAUSTIVE: every (long, hard, hard) day triple, including all-on-one-day', () => {
  /**
   * ⛔ 8 × 8 × 8 = 512 PIN TRIPLES — every day for each of the three pinnable slots plus "unset",
   * so all-on-Monday, all-adjacent and every scattered arrangement are all in here by construction
   * rather than by being remembered.
   */
  const BLOCKED_SHAPES: Weekday[][] = [
    [],
    ['Friday'],
    ['Monday'],
    ['Friday', 'Saturday'],
    ['Monday', 'Tuesday', 'Wednesday'],
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ];
  const cases: Case[] = [];
  for (const m of [MIXES[0], MIXES[2]]) {
    for (const blocked of BLOCKED_SHAPES) {
      for (const longDay of [null, ...DAYS]) {
        for (const h0 of [null, ...DAYS]) {
          for (const h1 of [null, ...DAYS]) {
            cases.push({
              runs: m.runs, rides: m.rides, swimDays: 0, swimEasy: 0,
              longDay, hardDays: [h0, h1], blocked, taper: false,
            });
          }
        }
      }
    }
  }
  console.log('EXHAUSTIVE over: 512 pin triples × 6 blocked shapes × 2 mixes');
  report('pin triples', cases, checkComposer);
});

Deno.test('FUZZ 3 — EXHAUSTIVE: hard-session count 0/1/2 × swims × taper × blocked', () => {
  const cases: Case[] = [];
  for (const m of MIXES) {
    for (const hardCount of [0, 1, 2]) {
      for (const swimDays of [0, 1, 2]) {
        for (const swimEasy of [0, 1, 2]) {
          for (const taper of [false, true]) {
            for (const blocked of [[], ['Friday'], ['Wednesday', 'Sunday']] as Weekday[][]) {
              const hardDays: Array<Weekday | null> = [];
              for (let i = 0; i < hardCount; i++) hardDays.push(DAYS[(i * 2 + 1) % 7]);
              cases.push({
                runs: m.runs, rides: m.rides, swimDays, swimEasy,
                longDay: 'Saturday', hardDays, blocked, taper,
              });
            }
          }
        }
      }
    }
  }
  console.log('EXHAUSTIVE over: 4 mixes × hard 0-2 × swimDays 0-2 × swimEasy 0-2 × taper × 3 blocked');
  report('counts × swims × taper', cases, checkComposer);
});

Deno.test('FUZZ 4 — THE DEGENERATE EXTREMES, named one by one', () => {
  /**
   * ⚠️ NAMED EXPLICITLY EVEN THOUGH THE SWEEPS ABOVE CONTAIN MOST OF THEM. A sweep that goes red
   * says "512 pin triples failed"; these say which shape, in words, and they are the shapes Michael
   * called out. When one of these breaks the report writes itself.
   */
  const cases: Case[] = [
    // every pin on Monday
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Monday', hardDays: ['Monday', 'Monday'], blocked: [], taper: false },
    // every pin on Monday, and Monday blocked
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Monday', hardDays: ['Monday', 'Monday'], blocked: ['Monday'], taper: false },
    // all seven days carry something pinned or blocked
    { runs: 4, rides: 0, swimDays: 2, swimEasy: 2, longDay: 'Sunday', hardDays: ['Monday', 'Tuesday'], blocked: ['Wednesday', 'Thursday', 'Friday', 'Saturday'], taper: false },
    // 6 blocked days + 2 clubs (the pins land inside the block)
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Sunday', hardDays: ['Monday', 'Tuesday'], blocked: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], taper: false },
    // 6 blocked days, everything pinned to the one open day
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Sunday', hardDays: ['Sunday', 'Sunday'], blocked: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], taper: false },
    // zero endurance at all
    { runs: 0, rides: 0, swimDays: 0, swimEasy: 0, longDay: null, hardDays: [], blocked: [], taper: false },
    // zero endurance with days blocked anyway
    { runs: 0, rides: 0, swimDays: 0, swimEasy: 0, longDay: null, hardDays: [], blocked: ['Monday', 'Tuesday', 'Wednesday'], taper: false },
    // adjacent pins
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Saturday', hardDays: ['Sunday', 'Monday'], blocked: [], taper: false },
    // the three-club week from the device test
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Saturday', hardDays: ['Tuesday', 'Thursday'], blocked: ['Friday'], taper: false },
    // long day blocked, hard days clear
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Saturday', hardDays: ['Tuesday', 'Thursday'], blocked: ['Saturday'], taper: false },
    // every pin blocked
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Saturday', hardDays: ['Tuesday', 'Thursday'], blocked: ['Saturday', 'Tuesday', 'Thursday'], taper: false },
    // taper week with everything at once
    { runs: 3, rides: 2, swimDays: 2, swimEasy: 2, longDay: 'Saturday', hardDays: ['Tuesday', 'Thursday'], blocked: ['Friday', 'Monday'], taper: true },
    /**
     * ⛔⛔ MICHAEL'S MAXED-OUT WIZARD BUILD, 2026-08-26 — THE SHAPE THAT PROMPTED THIS WHOLE PASS,
     * AND HE TOUCHED NO DAY.
     *
     * Every add-on at once: run + ride mix, two hard sessions, the accessory bias on, the long ride
     * on Saturday. The step-7 preview put **both** hard sessions on the two lower-body lifting days
     * — Tue `Test: Lower` + Hard Ride, Fri `DE: Lower` + Hard Run — with Thursday's upper day
     * carrying the easy run. p246 puts the hard endurance on days 1 and 3, WITH the upper day and on
     * the plyo day, and prints no endurance at all on days 2 and 5.
     *
     * ⚠️ UNPINNED IS THE WHOLE POINT. He made no schedule adjustment, so criterion 6 must catch this
     * as the ENGINE's placement rather than a stated trade-off. If it does not, the check is wrong
     * before the engine is.
     */
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Saturday', hardDays: [null, null], blocked: [], taper: false },
    /**
     * ⛔ THE SAME WEEK WITH THE TWO HARD DAYS PINNED TO THE LOWER-BODY DAYS ON PURPOSE. p130: the
     * athlete's choice wins, and the week has to SAY what it broke. Legal only with a note.
     */
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Saturday', hardDays: ['Tuesday', 'Friday'], blocked: [], taper: false },
  ];
  console.log('EXHAUSTIVE over: 12 named degenerate shapes');
  report('degenerate extremes', cases, checkComposer);
});

Deno.test('FUZZ 5 — SEEDED RANDOM interior, composer', () => {
  /**
   * ⚠️ SAMPLED, NOT EXHAUSTIVE, AND SAYING SO IS THE POINT. The full cross product (mix × hard count
   * × swims × taper × 512 pin triples × 127 blocked subsets) is roughly 4 million composes; at the
   * measured ~1 ms each that is over an hour and nobody would run it. The boundaries above are
   * exhaustive; this fills the interior from a FIXED seed list so the sample never drifts.
   */
  const cases: Case[] = [];
  for (const seed of SEEDS) {
    const r = rng(seed);
    const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length) % xs.length];
    for (let i = 0; i < 250; i++) {
      const blockedCount = Math.floor(r() * 7);
      const shuffled = [...DAYS].sort(() => r() - 0.5);
      const m = pick(MIXES);
      cases.push({
        runs: m.runs,
        rides: m.rides,
        swimDays: Math.floor(r() * 3),
        swimEasy: Math.floor(r() * 3),
        longDay: pick([null, ...DAYS]),
        hardDays: [pick([null, ...DAYS]), pick([null, ...DAYS])].slice(0, Math.floor(r() * 3)),
        blocked: shuffled.slice(0, blockedCount),
        taper: r() > 0.5,
      });
    }
  }
  console.log(`SAMPLED (fixed seeds ${SEEDS.join(',')}): 250 interior cases per seed`);
  report('seeded interior', cases, checkComposer);
});

Deno.test('FUZZ 6 — the WEEK-MODEL sweep: violations reported where the week is unsound', () => {
  /**
   * ⛔ CRITERION 5 LIVES HERE AND NOWHERE ELSE — see this file's header for why it cannot ride along
   * with the composer sweep. Criteria 1 and 2 are re-checked on this engine too, because "the
   * composer never puts a session on a blocked day" says nothing about whether the SOLVER does.
   */
  const cases: Case[] = [];
  for (const m of MIXES) {
    for (const blocked of blockedSubsets(6)) {
      for (const longDay of [null, 'Saturday', 'Monday'] as Array<Weekday | null>) {
        cases.push({
          runs: m.runs, rides: m.rides, swimDays: 0, swimEasy: 0,
          longDay, hardDays: ['Tuesday', 'Thursday'], blocked, taper: false,
        });
      }
    }
  }
  for (const seed of SEEDS) {
    const r = rng(seed);
    const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length) % xs.length];
    for (let i = 0; i < 120; i++) {
      const m = pick(MIXES);
      const shuffled = [...DAYS].sort(() => r() - 0.5);
      cases.push({
        runs: m.runs, rides: m.rides,
        swimDays: Math.floor(r() * 3), swimEasy: 0,
        longDay: pick([null, ...DAYS]),
        hardDays: [pick([null, ...DAYS]), pick([null, ...DAYS])].slice(0, Math.floor(r() * 3)),
        blocked: shuffled.slice(0, Math.floor(r() * 7)),
        taper: false,
      });
    }
  }
  console.log('EXHAUSTIVE over blocked subsets 0-6 × 4 mixes × 3 long values, plus seeded interior');
  report('week-model soundness', cases, checkViolations);
});
