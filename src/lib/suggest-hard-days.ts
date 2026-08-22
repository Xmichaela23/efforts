/**
 * THE OPTIMAL HARD DAY — proposed by the SAME model that will build the block.
 *
 * ⛔ IT RUNS THE REAL ENGINE, NOT A CLIENT-SIDE APPROXIMATION OF IT. `@shared` exists for precisely
 * this ("ONE impl for client + Deno edge fns", `vite.config.ts`), so the wizard asks
 * `week-model/resolve` the same question the composer will ask it. A lightweight "good enough"
 * placer here would be a second opinion about the athlete's week that disagrees with the plan the
 * moment anything is tight — the doubled disease, in the one place the athlete would notice it.
 *
 * ⚠️ IT IS A SUGGESTION AND NOTHING MORE. The athlete may move it anywhere; if the move creates a
 * collision the plan reports it. See `docs/SPEC-viada-ingestion-order.md` for the surrounding law
 * and `_shared/week-model/model.ts` for the law itself.
 */
import { type Session, type Unit, buildUnits, DAY_NAMES } from '@shared/week-model/model.ts';
import { type Placement, resolve, restDaysOf, unmetNeeds } from '@shared/week-model/resolve.ts';
/**
 * ⛔ THE EASY-SESSION SUBTRACTION IS THE COMPOSER'S, NOT A COPY OF IT (stage 4, 2026-08-21). This
 * file held its own `total - long - hard`, which is the same rule the block builder applies — and
 * this file's own header forbids a second opinion about the athlete's week. They happened to agree;
 * nothing made them.
 */
import { easySessionsWanted } from '@shared/athlete-weekly-intent.ts';

/** Lowercase weekday, the shape the wizard stores. */
export type WizardDay =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const DAY_INDEX: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
};

/**
 * ⛔ THE THREE LIFTS ARE FIXED BY THE PROTOCOL and their NAMES matter: `buildUnits` pairs on them
 * (squat ↔ hard run, deadlift ↔ hard ride). If `MAIN_LIFTS` is ever renamed in the composer these
 * strings move with it, or the pairing silently stops happening and every suggestion goes generic.
 */
const LIFTS: Session[] = [
  { id: 'sq', label: 'Back Squat', load: 'heavy_lower', minutes: 60 },
  { id: 'bp', label: 'Bench Press', load: 'upper', minutes: 60 },
  { id: 'dl', label: 'Deadlift', load: 'heavy_lower', minutes: 60 },
];

export type HardSlot = {
  discipline: 'run' | 'bike';
  /** A club session the athlete has already placed. Pinned, never suggested — only they know when
   *  the club meets, and moving it would be the app inventing an appointment. */
  day?: string | null;
  ownership?: 'prescribed' | 'club';
};

/**
 * The day the model would put each hard session on, given the athlete's long days.
 *
 * Returns one entry per slot, in order. `null` where no suggestion could be made — a club slot the
 * athlete has already placed, or a week the model could not solve. ⚠️ NULL IS NOT AN ERROR AND MUST
 * NOT RENDER AS ONE: it means "no opinion", and the athlete simply picks.
 */
export type WeekInput = {
  hardDays: HardSlot[];
  longRunDay?: string | null;
  longRideDay?: string | null;
  /**
   * ⛔ THE EASY SESSIONS, AND THEY ARE HERE FOR EXACTLY ONE REASON: COUNTING DAYS.
   *
   * They emit no debt and need nothing clear, so they cannot create or prevent a clearance
   * collision — that part of `scheduleHealth` is identical with or without them. What they DO decide
   * is whether a rest day survives, and without them the wizard's week is at most five units across
   * seven days: the "no rest day left" flag could never fire, because the model could not see the
   * sessions that fill the calendar.
   *
   * ⚠️ TOTALS, NOT EASY COUNTS. The long day and any hard day of that discipline come out of these
   * here, the same subtraction the composer makes — passing the already-subtracted number from two
   * different screens is how the two would drift.
   */
  runDays?: number | null;
  rideDays?: number | null;
  swimDays?: number | null;
};

/**
 * ⛔ ONE CONSTRUCTION OF THE WEEK, SHARED BY THE SUGGESTION AND THE HEALTH BADGE. Two builders would
 * be two opinions about the same athlete, and the badge would eventually contradict the day it is
 * rendered beside.
 *
 * ⚠️ EASY SESSIONS ARE DELIBERATELY ABSENT AND THIS IS WHY IT IS STILL ACCURATE: an easy run emits
 * no debt and needs nothing clear, so it cannot cause a collision. Only the CONSTRAINED units — the
 * lifts, the long days and the hard days — can, and the wizard knows all of them. Adding easy
 * sessions would change the week's SHAPE and never its LEGALITY.
 */
export function buildWizardWeek(input: WeekInput): Unit[] {
  const slots = input.hardDays ?? [];
  const sessions: Session[] = [...LIFTS];
  const pins: Record<string, number> = {};

  /**
   * ⛔ AN UNPINNED LONG DAY IS PLACED, NOT OMITTED (2026-08-18). It used to be dropped from the model
   * entirely when the athlete had not picked a day — which made the suggestion and the health badge
   * blind to the single biggest constraint in the week, and left the long-day question with no
   * opinion to offer at all.
   *
   * ⚠️ IT STILL NEEDS A DISCIPLINE TO EXIST FOR. A long run is only real if the athlete runs, and a
   * long ride only if they ride — `hasRun` / `hasRide` come from the volume, not from a default.
   */
  const long = (id: string, label: string, sport: 'run' | 'bike', day: string | null | undefined, exists: boolean) => {
    if (!exists) return;
    sessions.push({ id, label, load: sport === 'run' ? 'long_run' : 'long_ride', sport, minutes: 90 });
    const d = DAY_INDEX[String(day ?? '').toLowerCase()];
    if (d != null) pins[id] = d;
  };
  const hasRun = Number(input.runDays) > 0 || slots.some((h) => h.discipline === 'run')
    || !!input.longRunDay;
  const hasRide = Number(input.rideDays) > 0 || slots.some((h) => h.discipline === 'bike')
    || !!input.longRideDay;
  long('lr', 'Long Run', 'run', input.longRunDay, hasRun);
  long('lb', 'Long Ride', 'bike', input.longRideDay, hasRide);

  // ⚠️ THE `n <= 0` GUARD IS THIS FILE'S OWN AND STAYS. Zero here means *"the athlete has not
  // answered yet"* — the wizard's counts start at 0 and the card renders before anything is picked
  // — so the week must show no easy sessions rather than a default number of them. That is the
  // opposite of what the wire door does with the same 0, and deliberately so: a half-filled screen
  // is not a built plan.
  const easyCount = (total: number | null | undefined, sport: 'run' | 'bike', hasLong: boolean) => {
    const n = Number(total);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const hard = slots.filter((h) => h.discipline === sport).length;
    return easySessionsWanted(Math.round(n), hasLong, hard);
  };
  const easyRuns = easyCount(input.runDays, 'run', !!DAY_INDEX[String(input.longRunDay ?? '').toLowerCase()]);
  const easyRides = easyCount(input.rideDays, 'bike', !!DAY_INDEX[String(input.longRideDay ?? '').toLowerCase()]);
  for (let i = 0; i < easyRuns; i++) {
    sessions.push({ id: `er${i}`, label: 'Easy Run', load: 'easy', sport: 'run', minutes: 45 });
  }
  for (let i = 0; i < easyRides; i++) {
    sessions.push({ id: `eb${i}`, label: 'Easy Ride', load: 'easy', sport: 'bike', minutes: 60 });
  }
  for (let i = 0; i < Math.max(0, Math.round(Number(input.swimDays) || 0)); i++) {
    sessions.push({ id: `sw${i}`, label: 'Swim', load: 'easy', sport: 'swim', minutes: 60 });
  }

  slots.forEach((h, i) => {
    const id = `h${i}`;
    sessions.push({ id, label: `Hard ${h.discipline}`, load: 'hard_cardio', sport: h.discipline, minutes: 45 });
    /**
     * ⛔ ANY DAY THE ATHLETE NAMED IS A PIN, WHOEVER OWNS THE SESSION — and getting this wrong made
     * the health badge blind. It read `ownership === 'club' && day`, so a PRESCRIBED hard day the
     * athlete had deliberately moved was handed to the solver as free, the solver relocated it to
     * the optimal slot, and the badge cheerfully reported the resulting week as clean. The one week
     * this whole feature exists for — a hard run pinned to Friday against a Saturday long ride —
     * came back OPTIMAL.
     *
     * ⚠️ THE SUGGESTER IS UNAFFECTED: it only ever fills slots that have no day, so a pinned slot
     * being echoed back as itself is exactly right.
     */
    const d = DAY_INDEX[String(h.day ?? '').toLowerCase()];
    if (d != null) pins[id] = d;
  });

  return buildUnits(sessions, pins);
}

export function suggestHardDays(input: WeekInput): Array<string | null> {
  const slots = input.hardDays ?? [];
  if (slots.length === 0) return [];

  let placed: Array<{ id: string; day: number }> = [];
  try {
    const r = resolve(buildWizardWeek(input), { minRestDays: 1 });
    // ⚠️ A COMPROMISED WEEK STILL CARRIES ITS BEST ARRANGEMENT, and that arrangement is still the
    // best answer available. Refusing to suggest because the athlete's own pins already collide
    // would withhold help exactly where it is most needed.
    const ps = r.ok ? r.placements : (r as Extract<typeof r, { ok: false }>).best;
    placed = ps.flatMap((p) => p.unit.sessions.map((s) => ({ id: s.id, day: p.day })));
  } catch {
    // ⛔ A SUGGESTION IS NEVER LOAD-BEARING. If the model throws, the wizard shows no opinion and the
    // athlete picks — it must never be the reason a build screen fails to render.
    return slots.map(() => null);
  }

  return slots.map((h, i) => {
    if (h.ownership === 'club') return null;
    const day = placed.find((p) => p.id === `h${i}`)?.day;
    return day == null ? null : DAY_NAMES[day].toLowerCase();
  });
}

/**
 * ⛔ SCHEDULE HEALTH — the same collisions the built plan will report, computed as the athlete taps.
 *
 * ⚠️ IT IS A PREDICTION, AND THE PLAN REMAINS THE AUTHORITY. It is accurate because the only units
 * that can breach a clearance are the constrained ones and the wizard holds all of them (see
 * `buildWizardWeek`) — but if the badge and the built plan ever disagree, the BADGE is what is
 * wrong. ⛔ Do not "fix" a disagreement by softening the plan's message.
 *
 * ⚠️ WHAT COUNTS, AND WHAT DOES NOT (Michael, 2026-08-18). Clearance collisions — the 48h long-
 * effort law both ways, 48h between heavy lower days, the 36h an uncoupled hard day leaves on the
 * legs — plus the ZERO-REST-DAY state, which is systemic rather than local and is included anyway
 * because a seven-day hybrid week is a real risk the athlete has to consent to knowingly.
 *
 * ⛔ AND NOTHING ELSE. A ride the week had no room for, a crowded day, the interleaving preference:
 * real costs, none of them a reason to warn. Folding those in would light the badge on weeks where
 * nothing is wrong, and a warning that fires on everything stops being read.
 */
export type ScheduleHealth = {
  ok: boolean;
  /** One entry per distinct collision, in the engine's own words. */
  collisions: string[];
};

export function scheduleHealth(input: WeekInput): ScheduleHealth {
  try {
    const units = buildWizardWeek(input);
    const r = resolve(units, { minRestDays: 1 });
    const placements: Placement[] = r.ok
      ? r.placements
      : (r as Extract<typeof r, { ok: false }>).best;
    /**
     * ⛔ A MIRRORED PAIR IS ONE COLLISION, NOT TWO (2026-08-18). When two sessions share a day, each
     * blocks the other, so `unmetNeeds` reports it twice — "Back Squat is short from Long Run" AND
     * "Long Run is short from Back Squat". The badge then said "2 collisions" for one problem, and an
     * athlete who fixes it watches the count fall by two, which reads as the number being made up.
     *
     * ⚠️ THE KEY IS THE UNORDERED PAIR AND NOTHING ELSE — deliberately, including the SYSTEM. When a
     * squat and a long run share a day they breach in both directions at once: the squat needs
     * `long_effort` clear and the long run needs `heavy_legs` clear. Two systems, one situation, and
     * keying on the system reported it as two collisions. The athlete has ONE thing to move.
     */
    const seen = new Set<string>();
    const collisions: string[] = [];
    for (const u of unmetNeeds(placements)) {
      const key = [u.unit, u.blockedBy].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const what = u.system === 'long_effort' ? 'a long effort' : 'heavy legs';
      collisions.push(
        `${u.unit} needs ${u.shortBy}h more clearance from ${what} — ${u.blockedBy} leaves it `
        + `outstanding until ${DAY_NAMES[u.clearsAtDay]}.`,
      );
    }
    /**
     * ⛔ A SEVEN-DAY WEEK IS A FLAG (Michael, 2026-08-18) — and it is the one entry here that is not
     * a tissue clearance. *"A 7-day hybrid schedule is a massive systemic fatigue risk. The badge
     * must enforce informed consent."* So the count carries it, and the receipt says plainly which
     * kind of problem it is rather than dressing it as a clearance breach.
     *
     * ⚠️ IT IS LAST IN THE LIST DELIBERATELY: a clearance collision names two specific sessions and
     * a number of hours, and this names the shape of the whole week. Reading the specific ones first
     * is the order an athlete can act in.
     */
    /**
     * ⚠️ MEASURED 2026-08-18: THIS IS A TRIPWIRE, NOT AN EXPECTED STATE, and saying so is the point.
     * The resolver protects the rest day by STACKING rather than spending it — 7 runs, 4 rides and
     * 3 swims all still leave one day clear — and the wizard can pin at most four days (two longs,
     * two hard), so a seven-day week is not currently reachable from this screen. It is kept because
     * it is nearly free and because the engine swap DID produce seven-active-day weeks while its
     * scoring was wrong; if that ever regresses, the athlete sees it before the plan does.
     * ⛔ Do not delete it as dead code without re-running that measurement.
     */
    if (restDaysOf(placements).length === 0) {
      collisions.push('No rest day left — every day of the week carries a session.');
    }
    return { ok: collisions.length === 0, collisions };
  } catch {
    // ⛔ A BADGE IS NEVER LOAD-BEARING. If the model throws, the screen says nothing rather than
    // claiming a week is healthy or broken on no evidence.
    return { ok: true, collisions: [] };
  }
}

/**
 * ⛔ THE LONG DAY THE MODEL WOULD CHOOSE — the nudge Michael asked for after the sweep, and it is a
 * SOLVE rather than a rule (2026-08-18).
 *
 * The sweep found six breached shapes and they were all one pattern: **two hard runs against a
 * SUNDAY long run, at every volume.** Not a volume problem. Five major stressors — two hard runs,
 * two heavy lifts, one long run — and a Sunday long run puts its 48-hour shadow across Monday,
 * leaving Tuesday to Saturday to hold four of them at 36-hour clearances. It does not fit.
 *
 * ⛔ HIS FIX WAS "ANCHOR THE LONG DAY TO SATURDAY FOR THAT SHAPE", AND THIS DOES NOT HARDCODE THAT.
 * It asks the model where the long day goes when nothing pins it, and the model answers Saturday for
 * that shape on its own — the same reason `suggestHardDays` runs the real engine instead of a
 * lookup. A rule keyed on "two hard runs" would be right today and silently wrong the first time
 * another constraint moved.
 *
 * ⚠️ IT ONLY EVER FILLS AN EMPTY ANSWER. A day the athlete picked is theirs — "the athlete's anchors
 * are never moved" is a shipped test, and Michael's own ruling is that a ridiculous pin gets built
 * and reported, never overridden. If they pin Sunday into that shape they get the plan they asked
 * for and the health badge tells them what it costs.
 */
export function suggestLongDays(input: WeekInput): { run: string | null; ride: string | null } {
  try {
    const units = buildWizardWeek(input);
    const r = resolve(units, { minRestDays: 1 });
    const placements: Placement[] = r.ok
      ? r.placements
      : (r as Extract<typeof r, { ok: false }>).best;
    const dayOf = (id: string): string | null => {
      const p = placements.find((x) => x.unit.sessions.some((s) => s.id === id));
      return p ? DAY_NAMES[p.day].toLowerCase() : null;
    };
    return {
      run: input.longRunDay ? null : dayOf('lr'),
      ride: input.longRideDay ? null : dayOf('lb'),
    };
  } catch {
    return { run: null, ride: null };
  }
}

/**
 * ⛔ ONE SOLVE FOR THE WHOLE SCREEN (2026-08-18) — AND IT IS A PERFORMANCE FIX, NOT A TIDY-UP.
 *
 * The wizard called `suggestHardDays`, `suggestLongDays` and `scheduleHealth` as three separate
 * memos, so every tap that touched a hard day or a long day ran the exhaustive placer THREE TIMES
 * over the same week. Michael, on the browser: *"buttons don't push easy or open quickly."* Each
 * call is cheap; three of them on every keystroke, behind a re-render, is not.
 *
 * ⚠️ THE THREE ANSWERS COME FROM ONE PLACEMENT, which also removes a subtler problem: three solves
 * could in principle disagree with each other if any of them was passed a slightly different input.
 * Now the suggestion, the long day and the health badge are literally the same week.
 */
export function solveWizardWeek(input: WeekInput): {
  hardDays: Array<string | null>;
  longRun: string | null;
  longRide: string | null;
  health: ScheduleHealth;
} {
  const slots = input.hardDays ?? [];
  try {
    const units = buildWizardWeek(input);
    const r = resolve(units, { minRestDays: 1 });
    const placements: Placement[] = r.ok
      ? r.placements
      : (r as Extract<typeof r, { ok: false }>).best;

    const dayOf = (id: string): string | null => {
      const p = placements.find((x) => x.unit.sessions.some((s) => s.id === id));
      return p ? DAY_NAMES[p.day].toLowerCase() : null;
    };

    /**
     * ⛔ A MIRRORED PAIR IS ONE COLLISION, NOT TWO (2026-08-18). When two sessions share a day, each
     * blocks the other, so `unmetNeeds` reports it twice — "Back Squat is short from Long Run" AND
     * "Long Run is short from Back Squat". The badge then said "2 collisions" for one problem, and an
     * athlete who fixes it watches the count fall by two, which reads as the number being made up.
     *
     * ⚠️ THE KEY IS THE UNORDERED PAIR AND NOTHING ELSE — deliberately, including the SYSTEM. When a
     * squat and a long run share a day they breach in both directions at once: the squat needs
     * `long_effort` clear and the long run needs `heavy_legs` clear. Two systems, one situation, and
     * keying on the system reported it as two collisions. The athlete has ONE thing to move.
     */
    const seen = new Set<string>();
    const collisions: string[] = [];
    for (const u of unmetNeeds(placements)) {
      const key = [u.unit, u.blockedBy].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      /**
       * ⛔ THE BANNER NAMES THE MOVE, NOT JUST THE FAULT (Michael, 2026-08-18). It read like an error
       * code — "needs 24h more clearance, outstanding until Tuesday" — which tells an athlete they
       * are wrong and leaves them to work out the fix. `clearsAtDay` is already the coordinate of the
       * answer, so the suggestion costs no new modelling: the day the debt clears IS the earliest day
       * the blocked session can legally sit.
       *
       * ⚠️ IT SUGGESTS MOVING THE BLOCKED SESSION, NOT THE BLOCKER. Either would clear it, but the
       * blocker is usually the athlete's own anchor — the long run they told us about — and telling
       * them to move that is telling them to change their life rather than their plan. The blocked
       * one is nearly always something the engine placed.
       * ⛔ AND IT IS A SUGGESTION IN WORDS, NOT A CONTROL. Nothing here moves anything.
       */
      const what = u.system === 'long_effort' ? 'a long effort' : 'heavy legs';
      collisions.push(
        `${u.unit} is ${u.shortBy}h short of clearance from ${what} — ${u.blockedBy} leaves the legs `
        + `loaded until ${DAY_NAMES[u.clearsAtDay]}. Moving ${u.unit} to ${DAY_NAMES[u.clearsAtDay]} `
        + `or later clears it.`,
      );
    }
    if (restDaysOf(placements).length === 0) {
      collisions.push('No rest day left — every day of the week carries a session.');
    }

    return {
      hardDays: slots.map((h, i) => (h.ownership === 'club' ? null : dayOf(`h${i}`))),
      longRun: input.longRunDay ? null : dayOf('lr'),
      longRide: input.longRideDay ? null : dayOf('lb'),
      health: { ok: collisions.length === 0, collisions },
    };
  } catch {
    // ⛔ NEVER LOAD-BEARING. No opinion beats a wrong one, and a build screen must still render.
    return { hardDays: slots.map(() => null), longRun: null, longRide: null, health: { ok: true, collisions: [] } };
  }
}
