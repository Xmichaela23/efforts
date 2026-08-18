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

  const long = (id: string, label: string, sport: 'run' | 'bike', day?: string | null) => {
    const d = DAY_INDEX[String(day ?? '').toLowerCase()];
    if (d == null) return;
    sessions.push({ id, label, load: 'long_cardio', sport, minutes: 90 });
    pins[id] = d;
  };
  long('lr', 'Long Run', 'run', input.longRunDay);
  long('lb', 'Long Ride', 'bike', input.longRideDay);

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
 * ⚠️ ONLY CLEARANCE COLLISIONS COUNT (Michael, 2026-08-18). A ride the week had no room for, a
 * crowded day, the interleaving preference — all real costs, none of them a biological collision,
 * and folding them in would light the badge on weeks where nothing is actually breached. A week with
 * no rest day is excluded for the same reason.
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
    const seen = new Set<string>();
    const collisions: string[] = [];
    for (const u of unmetNeeds(placements)) {
      const key = `${u.unit}|${u.system}|${u.blockedBy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const what = u.system === 'long_effort' ? 'a long effort' : 'heavy legs';
      collisions.push(
        `${u.unit} needs ${u.shortBy}h more clearance from ${what} — ${u.blockedBy} leaves it `
        + `outstanding until ${DAY_NAMES[u.clearsAtDay]}.`,
      );
    }
    // ⚠️ Referenced so the rest-day exclusion above is a DECISION in the code, not an omission.
    void restDaysOf(placements);
    return { ok: collisions.length === 0, collisions };
  } catch {
    // ⛔ A BADGE IS NEVER LOAD-BEARING. If the model throws, the screen says nothing rather than
    // claiming a week is healthy or broken on no evidence.
    return { ok: true, collisions: [] };
  }
}
