/**
 * THE ENDURANCE-WEEK SCREEN'S BOUNDS — what the four slots can actually hold, per sport.
 *
 * ⛔ IT COMPUTES NOTHING OF ITS OWN. `sessionDurationBandSeconds` (stage 1) already sums the shortest
 * and longest option every slot offers, and its own header says why this has to run on the client:
 * *"the cap moves with the sport mix. Summing the longest option in every slot has to happen as the
 * athlete taps, so it cannot be a server round-trip."* This file assigns a family to each slot and
 * asks that function.
 *
 * ⛔ AND THE FAMILIES ARE THE ENGINE'S. `RIDE_EQUIVALENT` is the same table the composer substitutes
 * with (slice 4), so the number this screen shows and the week the composer builds cannot disagree —
 * which is the ask-15-get-20 defect the whole work order exists to kill.
 */
import {
  sessionDurationBandSeconds,
  type EnduranceBaselines,
  type FamilyId,
  type Level,
} from '../../supabase/functions/_shared/endurance-library/index.ts';
// ⚠️ RELATIVE, NOT `@shared` — that alias is Vite's and does not resolve under `deno test`, which is
// where this file's agreement-with-the-composer test runs. The engine module's own client lint asks
// for the same thing for the same reason: an import that only one toolchain can follow is a module
// only one toolchain can check.
import { RIDE_EQUIVALENT } from '../../supabase/functions/_shared/standing-plan/index.ts';
import { HARD_SLOT_KEYS } from './standing-plan-week-copy';
/**
 * ⛔ THE TIER IS THE ENGINE'S, READ HERE RATHER THAN RESTATED. `lowVolumeRunLevels` decides which
 * levels a low-mileage athlete's run slots are built at, and this screen quotes hours off the same
 * levels the composer will use. ⚠️ A second table here is how a preview and a plan diverge — the
 * same reason `RIDE_EQUIVALENT` is imported rather than copied.
 */
import { lowVolumeRunLevels } from '../../supabase/functions/_shared/standing-plan/frames.ts';
import type { SlotKey, SlotSelection, SlotSport } from './standing-plan-week-copy';

/**
 * ⛔ THE FRAME'S OWN SLOTS, in the order the screen shows them. Kept as a literal rather than read
 * from `FRAMES` because the SCREEN's four controls are a product decision — a frame that ever
 * carried five endurance slots would need a new screen, not a longer loop, and a silent extra row is
 * worse than a build error.
 */
export const SLOT_FAMILY: Record<SlotKey, { family: FamilyId; level: Level }> = {
  hard1: { family: 'run_mlss', level: 2 },
  hard2: { family: 'run_near_threshold', level: 3 },
  easy: { family: 'run_vt1', level: 1 },
  long: { family: 'run_lsd', level: 2 },
};

/**
 * ⛔ THE SCREEN'S SLOT → THE FRAME'S OWN KEY (`${frameDay}:${indexWithinDay}`), which is what
 * `assignSports` reads. Without this the athlete's per-slot answer cannot reach the engine, and the
 * engine re-derives the assignment from the counts alone — an athlete choosing "Hard 1 = Run,
 * Long = Ride" gets "Hard 1 = Ride, Long = Run": the same mix, a different week, nothing said.
 *
 * ⚠️ THE DAYS ARE `strength_5k`'s, and the four controls are that frame's four endurance slots. A
 * frame with a different layout needs a different screen, not a longer table — which is the same
 * reason `SLOT_FAMILY` is a literal.
 */
export const SLOT_FRAME_KEY: Record<SlotKey, string> = {
  hard1: '1:0',
  hard2: '3:0',
  easy: '4:0',
  long: '6:0',
};

/**
 * The athlete's answers, in the shape `SportMix.slots` takes.
 *
 * ⛔⛔ AN UNADDED HARD SESSION IS SENT AS `'none'`, NOT OMITTED (Michael, 2026-08-25). The two are
 * different answers to `assignSports` and the difference is the whole ruling:
 *
 *   - **omitted** — nobody asked; the slot keeps the frame's own hard run. Right for every caller
 *     that predates this screen.
 *   - **`'none'`** — this screen asked and the athlete added nothing there; the slot CONVERTS to the
 *     frame's easy session.
 *
 * ⚠️ SO OMITTING IT WOULD SILENTLY BUILD THE OLD WEEK. The athlete adds no hard session, the map
 * says nothing about that slot, and the engine hands back the intensity they declined — the screen
 * and the week disagreeing, which is the exact defect `SportMix.slots` was added to end.
 *
 * ⚠️ EASY AND LONG ARE STILL OMITTED WHEN UNANSWERED, because they are not opt-in: Continue is gated
 * on both, so an unanswered one never reaches here in a submitted week.
 */
export function slotsForEngine(slots: SlotSelection): Record<string, SlotSport | 'none'> {
  const out: Record<string, SlotSport | 'none'> = {};
  for (const key of Object.keys(SLOT_FRAME_KEY) as SlotKey[]) {
    const v = slots[key];
    if (v) { out[SLOT_FRAME_KEY[key]] = v; continue; }
    if (HARD_SLOT_KEYS.includes(key)) out[SLOT_FRAME_KEY[key]] = 'none';
  }
  return out;
}

export type WeekBounds = {
  /** Weekly running the run slots can hold, in MILES. Null when no easy pace is on file.
   *  ⚠️ RAW band — the engine-agreement quantity. The input field ranges over `runMilesInput`. */
  runMiles: { min: number; max: number } | null;
  /** The INPUT's range: the raw band clamped at the block's ruled 20-mile ceiling. */
  runMilesInput: { min: number; max: number } | null;
  /** Weekly riding the ride slots can hold, in HOURS. */
  rideHours: { min: number; max: number } | null;
  /** ⚠️ True when a slot's own total is a lower bound — some recoveries carry no stated duration. */
  isLowerBound: boolean;
};

/**
 * ⛔ THE CAP AND THE FLOOR, PER SPORT, FROM THE SLOTS AS CURRENTLY ASSIGNED.
 *
 * @param easyPaceSecPerMi the athlete's own easy pace — the only honest way to turn a run slot's
 *   MINUTES into the MILES this screen asks for. ⚠️ Absent → `runMiles` is null and the screen shows
 *   no running cap rather than one computed off an invented pace. That is the same refusal
 *   `end-plan-core.ts` makes: *"if we do not know the pace we CANNOT do this conversion."*
 */
export function weekBounds(
  slots: SlotSelection,
  opts: {
    baselines?: EnduranceBaselines;
    easyPaceSecPerMi?: number | null;
    /**
     * ⛔ DEMONSTRATED WEEKLY RUNNING — the low-volume tier's gate, and it must be the same number
     * the engine gates on or this screen quotes hours the week will not build. ⚠️ Absent is not
     * neutral: no history takes the smaller week, exactly as the composer does.
     */
    demonstratedWeeklyMiles?: number | null;
  },
): WeekBounds {
  const tierLevels = lowVolumeRunLevels(opts.demonstratedWeeklyMiles);
  const levelFor = (family: string, frameLevel: Level): Level =>
    (tierLevels[family] as Level | undefined) ?? frameLevel;
  let runShort = 0;
  let runLong = 0;
  let rideShort = 0;
  let rideLong = 0;
  let anyRun = false;
  let anyRide = false;
  let isLowerBound = false;

  for (const key of Object.keys(SLOT_FAMILY) as SlotKey[]) {
    const base = SLOT_FAMILY[key];
    const sport = slots[key];
    // ⛔ AN UNANSWERED SLOT HOLDS NOTHING YET. Counting it as a run would show a cap for a week the
    // athlete has not described.
    if (!sport) continue;
    if (sport === 'ride') {
      // ⛔ THE COMPOSER'S OWN EQUIVALENCE. A second table here is how a preview and a plan diverge.
      const eq = RIDE_EQUIVALENT[base.family];
      if (!eq) continue;
      // ⚠️ THE TIER IS KEYED BY FAMILY, so a slot the athlete put on the bike is untouched by
      // construction — the tier only names run families.
      const band = sessionDurationBandSeconds(eq.family, levelFor(eq.family, base.level), {
        baselines: opts.baselines,
        archetype: eq.archetype,
      });
      rideShort += band.shortest;
      rideLong += band.longest;
      isLowerBound = isLowerBound || band.isLowerBound;
      anyRide = true;
    } else {
      const band = sessionDurationBandSeconds(base.family, levelFor(base.family, base.level), {
        baselines: opts.baselines,
      });
      runShort += band.shortest;
      runLong += band.longest;
      isLowerBound = isLowerBound || band.isLowerBound;
      anyRun = true;
    }
  }

  const pace = Number(opts.easyPaceSecPerMi);
  const paceOk = Number.isFinite(pace) && pace > 0;
  return {
    // ⚠️ ROUNDED OUTWARD — floor down, cap up — so a bound never refuses a number the engine would
    // in fact have built. A cap that rounds IN is a cap that lies about the week.
    // ⚠️ `runMiles` stays the RAW slot band — it is the engine-agreement quantity (the built week
    // must land inside it). The RULED 20-mile ceiling (Michael, 2026-08-24) clamps the INPUT, not
    // the band: `runMilesInput` below is what the volume field ranges over.
    runMiles: anyRun && paceOk
      ? { min: Math.floor(runShort / pace), max: Math.ceil(runLong / pace) }
      : null,
    // ⛔ RULED 2026-08-24: this block's running ASK caps at 20 — the regular-runner band. Above
    // that, running leads, which is a different block. The slot floor still applies underneath.
    runMilesInput: anyRun && paceOk
      ? {
        min: Math.min(Math.floor(runShort / pace), RUN_MILES_BLOCK_CAP),
        max: Math.min(Math.ceil(runLong / pace), RUN_MILES_BLOCK_CAP),
      }
      : null,
    rideHours: anyRide
      ? { min: Math.floor((rideShort / 3600) * 10) / 10, max: Math.ceil((rideLong / 3600) * 10) / 10 }
      : null,
    isLowerBound,
  };
}

/** ⛔ The block's running ceiling, RULED 2026-08-24 (Michael): cap at the regular-runner band.
 *  High mileage links to the endurance-leading block when it exists. OURS — the band edges come
 *  from field practice (the chart on the entry screen), not a page. */
export const RUN_MILES_BLOCK_CAP = 20;

/** The line shown when the athlete types above the block's running ceiling. Signage, not a nag —
 *  the link lights up when the endurance-leading frame ships. */
export const OVER_CAP_LINE = 'Above 20 miles a week, running leads. That\'s a different block — coming.';

/** The sentence under a bounded input. ⚠️ States the cap as a fact, never as a refusal. */
export function boundsLine(b: { min: number; max: number } | null, unit: string): string | null {
  if (!b) return null;
  return `This week holds ${b.min} to ${b.max} ${unit}.`;
}
