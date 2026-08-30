// ============================================================================
// WHAT A BUILT WEEK BREAKS, AND WHAT IT COSTS — the Standing Plan's half of Q-288.
//
// ⛔ THE RULE ALREADY EXISTED. p131's keystone law — *"keystone sessions are the ones that require
// you to be in the most recovered state to perform"*, placed **fresh in the relevant systems, not
// fresh overall** — is `week-model/model.ts`'s `COST` table, and has been since 2026-08-17. What did
// not exist was any path from the composer to it: `compose.ts` built no Units and called no
// resolver, so **no standing-plan week had ever been scored by the law.** Q-288 recorded the rule as
// missing; it was UNWIRED. This file is the wire, not a second rule.
//
// ⛔ IT JUDGES A PLACEMENT, IT NEVER MAKES ONE. `compose.ts` decides the days; this reads them back
// and asks `COST` what they cost. Nothing here moves a session, and nothing here refuses a week —
// D-452, warn never block. Michael, 2026-08-26: *"we will not stop them but they should know the
// cost."*
//
// ⛔ ONE OWNER OF THE MAPPING. `fuzz-builder.test.ts` imports this file rather than restating it;
// a harness checking its own copy of the production logic proves nothing.
// ============================================================================

import { buildUnits, type Load, type Session } from '../week-model/model.ts';
import { unmetNeeds, type Placement } from '../week-model/resolve.ts';
import { voiceViolation } from '../state-trend/week-accent.ts';
import { FRAMES, type ColumnKind, type FrameId } from './frames.ts';
import { WEEKDAYS, weekdayForFrameDay, type Weekday } from './day-map.ts';
import { isHardSlot, isLongSlot } from './sport-slots.ts';
import type { PlanSession } from './compose.ts';

/**
 * ⛔ WHICH BREAK IT IS. Three come from `COST` and one from the frame — and the fourth is not a
 * clearance at all, which is why it needs its own id rather than being folded into the others.
 */
export type ConflictRule =
  /** A hard session and the heavy leg session on ONE day. `heavy_lower` short of `heavy_legs`. */
  | 'hard_with_heavy_legs'
  /** The long RUN inside the shadow of heavy leg work. `long_run` short of `heavy_legs`. */
  | 'long_after_heavy_legs'
  /** Heavy legs inside the shadow of the long session. `heavy_lower` short of `long_effort`. */
  | 'heavy_legs_after_long'
  /** p246 keeps endurance off BOTH lower days; the speed day has no clearance, only a cost. */
  | 'hard_on_speed_leg_day';

/**
 * ⛔ STRUCTURED, NOT A SENTENCE (2026-08-26). A later slice attaches actions to these — *"maybe give
 * the option to remove a hard day or reduce miles hours, if someone just has a fucked schedule"* —
 * and an action needs to know WHICH break, on WHICH day, involving WHICH sessions. A bare string
 * would force that slice to parse its own copy back out.
 *
 * ⚠️ `week-model`'s own `Violation` already carries this shape (rule/subject/against/shortBy/days)
 * and is what the client renders through `week-rules-copy.ts`. This is the same shape in the
 * standing plan's vocabulary — weekdays rather than day indices, because every other surface on this
 * path speaks weekdays.
 */
export type WeekConflict = {
  /** ⚠️ `cost`, never `breach`. The week is built; this is what it costs. */
  kind: 'cost';
  rule: ConflictRule;
  /** The weekdays the break sits on, in week order. */
  days: Weekday[];
  /** The athlete-facing names of the sessions involved. */
  sessions: string[];
  /** Hours of clearance still outstanding, where the law gives one. Absent for the frame rule. */
  shortBy?: number;
  text: string;
};

// ── THE COMPOSED WEEK IN THE LAW'S VOCABULARY ────────────────────────────────────────────────────

/**
 * ⛔ THE FAMILIES THAT ARE STILL HARD AFTER SPORT ASSIGNMENT. A declined hard slot has its FAMILY
 * rewritten to the column's easy one, so asking the frame would call a session hard that the week
 * has already converted to easy running.
 */
/**
 * ⛔⛔ NO LONGER ITS OWN LIST (2026-08-30). This was a hand-maintained copy of "which families are
 * hard", and it drifted: `ride_anaerobic` was missing, so the HARDEST session in a rider's week —
 * 110-120% of FTP — was the one session this engine did not count as hard, and a hard ride landing
 * on the heavy leg day raised nothing at all.
 * ⛔ IT ASKS `isHardSlot` NOW, the same owner `anchorRoleOf` and the composer read, so a family
 * added to the frame cannot be hard in one reader and invisible in another.
 */
const isHardFamily = (family: string): boolean => isHardSlot({ family: family as never });

const tagValue = (s: PlanSession, prefix: string): string =>
  (s.tags ?? []).find((t) => t.startsWith(prefix))?.slice(prefix.length) ?? '';

/** The frame's endurance slots in the order `composeWeek` emits them. Read off `FRAMES`. */
function frameEnduranceSlots(frame: FrameId, column: ColumnKind): Array<'long' | 'hard' | null> {
  const out: Array<'long' | 'hard' | null> = [];
  for (const d of FRAMES[frame].columns[column]) {
    for (const slot of d.endurance) {
      out.push(isLongSlot(slot) ? 'long' : isHardSlot(slot) ? 'hard' : null);
    }
  }
  return out;
}

/**
 * The frame days carrying lower-body barbell work — ME (the keystone) and DE. Read off `FRAMES`.
 *
 * ⛔⛔ LISTS, AND IT ASKS THE FRAME RATHER THAN ITS LABEL (2026-08-30). See `FrameDay.lowerRole`.
 * The old form returned one day per kind and recovered the kind by string-matching the athlete-facing
 * label, so a frame that names its days for their PATTERN — p274's `Lower body: Hinge` and
 * `Lower body: Push` — returned nothing at all. **The All Rounder also opens BOTH lower days on an ME
 * slot**, which the old `{ me, de }` shape could not express even with the labels renamed.
 * ⚠️ THE LABEL IS STILL THE FALLBACK, so `strength_5k` answers exactly as it did.
 */
export function lowerDaysOf(frame: FrameId, column: ColumnKind): { me: number[]; de: number[] } {
  const me: number[] = [];
  const de: number[] = [];
  for (const d of FRAMES[frame].columns[column]) {
    const role = d.lowerRole ?? (d.label === 'ME: Lower' ? 'me' : d.label === 'DE: Lower' ? 'de' : null);
    if (role === 'me') me.push(d.day);
    if (role === 'de') de.push(d.day);
  }
  return { me, de };
}

/** One composed session, with the law's word for what it costs. */
export type TypedSession = { s: PlanSession; load: Load };

/**
 * ⛔ TRANSLATE THE BUILT WEEK INTO LOADS. Exported because the fuzz harness reads it too, and two
 * translations of one week is how the sweep and the plan come to disagree about what happened.
 *
 * ⚠️ THE KEYSTONE IS THE **ME** LOWER DAY. Week one names it `Test: Lower` (the p215 pretest on the
 * same frame day) and every other week `ME: Lower`. `DE: Lower` is NOT a keystone here: p131 defines
 * one as the session needing the most recovered state, and stage 2's bands put ME at 90-100% of the
 * working number against DE's 70-80%. The speed day's cost is real and is `hard_on_speed_leg_day`,
 * which is a different sentence because it is a different problem — bar speed, not tissue.
 *
 * ⚠️ PLYO IS `easy`, LABELLED. The law has no plyometric load and p227's dose is three drills stopped
 * on quality. ⛔ If one is ever added to `COST`, this line is where it lands.
 */
export function typedSessionsOf(
  sessions: PlanSession[],
  frame: FrameId,
  column: ColumnKind,
): TypedSession[] {
  const isEnd = (s: PlanSession) => s.type === 'run' || s.type === 'ride' || s.type === 'swim';
  const isAddOn = (s: PlanSession) =>
    (s.tags ?? []).includes('swim_addon') || (s.tags ?? []).includes('advanced_tier');
  const slots = frameEnduranceSlots(frame, column);
  const out: TypedSession[] = [];
  let si = 0;
  for (const s of sessions) {
    if ((s.tags ?? []).includes('plyo')) { out.push({ s, load: 'easy' }); continue; }
    if (s.type === 'strength') {
      /**
       * ⛔ THE TAG FIRST, THE NAME AS FALLBACK (2026-08-30) — `compose.ts` stamps `lower:me` off
       * `FrameDay.lowerRole`, so a frame whose heavy leg day is not CALLED "ME: Lower" is still
       * counted as one. `Test: Lower` is week one's own name for the same day and keeps its test.
       */
      const heavy = (s.tags ?? []).includes('lower:me')
        || s.name === 'ME: Lower' || s.name === 'Test: Lower';
      out.push({ s, load: heavy ? 'heavy_lower' : 'upper' });
      continue;
    }
    if (!isEnd(s)) continue;
    if (isAddOn(s)) { out.push({ s, load: 'easy' }); continue; }
    const role = slots[si];
    si += 1;
    const family = tagValue(s, 'family:');
    const sport = tagValue(s, 'sport:');
    out.push({
      s,
      load: role === 'long'
        ? (sport === 'ride' ? 'long_ride' : 'long_run')
        : (isHardFamily(family) ? 'hard_cardio' : 'easy'),
    });
  }
  return out;
}

/**
 * ⛔ THE PLACED WEEK AS THE LAW'S OWN UNITS, pinned to the days the composer chose.
 *
 * ⚠️ NO INTRA-DAY GAP IS INVENTED. `internalGapHours` is a COUPLING claim — barbell first, intervals
 * six to eight hours later — and the standing plan never makes it, so `buildUnits` decides what
 * couples and everything else sits at `day * 24`, the law's own convention. Handing it a six-hour
 * offset pushes a hard session's debt LATER, which brings it CLOSER to the next morning's lift and
 * made p246's own printed week read six hours short (D-453).
 * ⚠️ LABELS ARE MADE UNIQUE. `unmetNeeds` excludes a session from its own debt BY LABEL.
 */
export function placementsOf(typed: TypedSession[]): {
  placements: Placement[];
  dayOfLabel: Map<string, Weekday>;
  nameOfLabel: Map<string, string>;
} {
  const sessions: Session[] = [];
  const pins: Record<string, number> = {};
  const dayOfLabel = new Map<string, Weekday>();
  const nameOfLabel = new Map<string, string>();
  typed.forEach((t, i) => {
    const day = WEEKDAYS.indexOf(t.s.day as Weekday);
    if (day < 0) return;
    const id = String(i);
    const label = `${t.s.name} #${i}`;
    dayOfLabel.set(label, WEEKDAYS[day]);
    nameOfLabel.set(label, t.s.name);
    pins[id] = day;
    sessions.push({
      id,
      label,
      load: t.load,
      ...(t.s.type === 'ride'
        ? { sport: 'bike' as const }
        : t.s.type === 'run'
          ? { sport: 'run' as const }
          : t.s.type === 'swim'
            ? { sport: 'swim' as const }
            : {}),
      minutes: Number(t.s.duration) || 45,
    });
  });
  const placements = buildUnits(sessions, pins).map((unit) => ({ unit, day: unit.pinnedDay ?? 0 }));
  return { placements, dayOfLabel, nameOfLabel };
}

// ── THE SENTENCES ────────────────────────────────────────────────────────────────────────────────
//
// ⛔ THE GRAMMAR IS `COPY-VOICE.md`'s: **[observable fact], [conditional consequence]**. No opener
// about the person, no closer that reassures, a number wherever there is one. Subject is the session
// or the day, never "you" (rule 1). No imperatives — the conditional consequence replaces them
// (rule 7). Every line below is gated through `voiceViolation` by its own test.
//
// ⛔ AND EACH ONE NAMES THE BREAK **AND** WHAT IT COSTS (Michael, 2026-08-26). A sentence that says
// two sessions collide and stops is the conflict without the reason, which is the half an athlete
// cannot act on. The message hierarchy this sits inside: strength leads, the athlete's clubs and
// hard days are honoured, the lifts arrange around them, and a stacked week has costs — stated
// conditionally, never as scolding.

/** How the athlete would name this session in a sentence. Derived from the LOAD, not the row's title. */
function phraseFor(t: TypedSession): string {
  if (t.load === 'heavy_lower') return 'the heavy leg session';
  if (t.load === 'long_run') return 'the long run';
  if (t.load === 'long_ride') return 'the long ride';
  if (t.load === 'hard_cardio') return t.s.type === 'ride' ? 'the hard ride' : 'the hard run';
  if ((t.s.tags ?? []).includes('lower:de') || t.s.name === 'DE: Lower') return 'the speed leg session';
  return t.s.name;
}

/** `on the same day as` / `the day before` — how far apart, in the words a week is read in. */
function apartPhrase(a: Weekday, b: Weekday): 'same' | 'adjacent' | 'two' {
  const d = Math.abs(WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
  const wrapped = Math.min(d, 7 - d);
  return wrapped === 0 ? 'same' : wrapped === 1 ? 'adjacent' : 'two';
}

/**
 * ⛔ EVERY CONFLICT IN ONE BUILT WEEK, WITH ITS COST. Empty on a clean week — never `[]` standing in
 * for "we did not look", because every caller reaches this by having a placed week in hand.
 *
 * ⚠️ IT NEVER DECIDES WHOSE FAULT IT IS. At D-453's numbers the composer's own placement produces
 * none of these — the 2026-08-26 audit put engine-caused breaks at 0 across all 16,832 shapes — so
 * every one of them is something the athlete's pins asked for. That makes the sentence a disclosure
 * rather than an accusation, which is the whole posture: honour the pin, name the cost.
 */
export function weekConflicts(args: {
  sessions: PlanSession[];
  frame: FrameId;
  column: ColumnKind;
  dayOffset: number;
}): WeekConflict[] {
  const typed = typedSessionsOf(args.sessions, args.frame, args.column);
  const { placements, dayOfLabel, nameOfLabel } = placementsOf(typed);
  const byName = new Map<string, TypedSession>();
  typed.forEach((t, i) => byName.set(`${t.s.name} #${i}`, t));

  const out: WeekConflict[] = [];
  const seen = new Set<string>();
  const push = (c: WeekConflict) => {
    // ⚠️ DEDUPED BY RULE + DAYS. `unmetNeeds` reports one row per (session, system, debt) triple, so
    // one collision blocked from two sides reads as two problems unless it is folded here.
    const key = `${c.rule}|${c.days.join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    // ⛔ A LINE THAT TRIPS THE VOICE CHECK IS DROPPED, not shipped. Silence over bad copy is the
    // standing rule (`COPY-VOICE.md` enforcement); the tests assert every template is clean, so a
    // drop here means a template changed and the test will say which.
    if (voiceViolation(c.text)) return;
    out.push(c);
  };

  // ── 1-3: THE CLEARANCES, ASKED OF `COST` (p131 keystones, Q-288's wiring).
  for (const u of unmetNeeds(placements)) {
    const subject = byName.get(u.unit);
    const blocker = byName.get(u.blockedBy);
    const sDay = dayOfLabel.get(u.unit);
    const bDay = dayOfLabel.get(u.blockedBy);
    if (!subject || !blocker || !sDay || !bDay) continue;
    const days = [...new Set([sDay, bDay])].sort(
      (a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b),
    );
    const sessions = [nameOfLabel.get(u.unit)!, nameOfLabel.get(u.blockedBy)!];
    const apart = apartPhrase(sDay, bDay);

    if (u.load === 'heavy_lower' && u.system === 'heavy_legs') {
      // ⛔ A HARD SESSION AND THE HEAVY LEG DAY ON ONE DAY. ⚠️ The ride's arm says the cost is
      // smaller and still says there is one — D-453 prices it at 12h against the run's 24h, and a
      // sentence that dismissed it would be the plan telling the athlete a stacked day is free.
      const ride = blocker.s.type === 'ride';
      push({
        kind: 'cost',
        rule: 'hard_with_heavy_legs',
        days,
        sessions,
        shortBy: u.shortBy,
        text: apart === 'same'
          ? (ride
            ? `${sDay} has ${phraseFor(blocker)} and ${phraseFor(subject)} on it. Riding hard costs `
              + 'the legs less than running hard does, so the barbell work gives up less here — it '
              + 'still opens on legs that have already worked.'
            : `${sDay} has ${phraseFor(blocker)} and ${phraseFor(subject)} on it. Squats and `
              + 'deadlifts opening on legs that already ran hard come in under the weights the test '
              + 'priced.')
          : `${phraseFor(subject)} on ${sDay} follows ${phraseFor(blocker)} on ${bDay}. Heavy `
            + 'squats and deadlifts inside a day of hard work come in under the weights the test priced.',
      });
      continue;
    }

    if (u.load === 'long_run' && u.system === 'heavy_legs') {
      // ⛔ THE INJURY-PREVENTION HALF, and the sentence says so in those terms rather than in hours.
      // `model.ts`: squatting the day before a long RUN "puts damaged, depleted legs into an impact
      // session". The ride has no such rule and gets no such sentence.
      push({
        kind: 'cost',
        rule: 'long_after_heavy_legs',
        days,
        sessions,
        shortBy: u.shortBy,
        text: apart === 'same'
          ? `${sDay} has ${phraseFor(subject)} and ${phraseFor(blocker)} on it. A long run on legs `
            + 'that have not had a day clear of hard work is where this plan carries injury risk '
            + 'rather than a hard day.'
          : `${phraseFor(subject)} on ${sDay} comes within a day of ${phraseFor(blocker)} on `
            + `${bDay}. A long run on legs that have not had a day clear of hard work is where this `
            + 'plan carries injury risk rather than a hard day.',
      });
      continue;
    }

    if (u.system === 'long_effort') {
      // ⛔ `model.ts`'s own reason, in its own words: a long ride has no eccentric damage but it is
      // the most glycogen-expensive session in the block, and squatting heavy on empty quads is a
      // tendon problem rather than a comfort one.
      push({
        kind: 'cost',
        rule: 'heavy_legs_after_long',
        days,
        sessions,
        shortBy: u.shortBy,
        text: apart === 'same'
          ? `${sDay} has ${phraseFor(subject)} and ${phraseFor(blocker)} on it. Heavy squats and `
            + 'deadlifts on legs a long session has emptied is a tendon cost rather than a comfort one.'
          : `${phraseFor(subject)} on ${sDay} comes within two days of ${phraseFor(blocker)} on `
            + `${bDay}. Heavy squats and deadlifts on legs a long session has emptied is a tendon `
            + 'cost rather than a comfort one.',
      });
    }
  }

  // ── 4: THE FRAME RULE (p246 §E1a). Days 2 and 5 print NO endurance; the speed day carries no
  //      clearance in `COST`, so this cost exists nowhere else and would otherwise go unsaid.
  //      ⚠️ The ME lower day is covered by rule 1 above and is deliberately not repeated here.
  {
    // ⚠️ EVERY DE LOWER DAY THE FRAME HAS, WHICH IS ONE OR NONE TODAY. The All Rounder has none —
    // p274 opens both its lower days on an ME slot — so this rule correctly says nothing there.
    const lower = lowerDaysOf(args.frame, args.column);
    for (const deDay of lower.de) {
      const speedDay = weekdayForFrameDay(deDay, args.dayOffset);
      const speed = typed.find((t) =>
        ((t.s.tags ?? []).includes('lower:de') || t.s.name === 'DE: Lower') && t.s.day === speedDay);
      const hard = typed.find((t) => t.load === 'hard_cardio' && t.s.day === speedDay);
      if (speed && hard) {
        push({
          kind: 'cost',
          rule: 'hard_on_speed_leg_day',
          days: [speedDay],
          sessions: [speed.s.name, hard.s.name],
          // ⛔ HIS OWN REASON FOR THE DAY. p218-219: DE is "bar speed and quality of movement…
          // fatigue is discouraged", and rule 3b — high-rep work straight after heavy squats
          // "trains reduced velocity and a lower force peak… it trains the skill wrong."
          text: `${speedDay} has ${phraseFor(speed)} and ${phraseFor(hard)} on it. The speed day is `
            + 'prescribed for bar speed rather than load, and bar speed drops on legs that have '
            + 'already gone hard the same day.',
        });
      }
    }
  }

  return out;
}
