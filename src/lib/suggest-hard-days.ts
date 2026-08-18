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
import { type Session, buildUnits, DAY_NAMES } from '@shared/week-model/model.ts';
import { resolve } from '@shared/week-model/resolve.ts';

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
export function suggestHardDays(input: {
  hardDays: HardSlot[];
  longRunDay?: string | null;
  longRideDay?: string | null;
}): Array<string | null> {
  const slots = input.hardDays ?? [];
  if (slots.length === 0) return [];

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
    // A club night is the athlete's appointment: pinned if they have named it, and never suggested.
    const d = DAY_INDEX[String(h.day ?? '').toLowerCase()];
    if (h.ownership === 'club' && d != null) pins[id] = d;
  });

  let placed: Array<{ id: string; day: number }> = [];
  try {
    const r = resolve(buildUnits(sessions, pins), { minRestDays: 1 });
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
