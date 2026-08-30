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
  resolveEnduranceAnchors,
  sessionDurationBandSeconds,
  type EnduranceBaselines,
  type FamilyId,
  type Level,
} from '../../supabase/functions/_shared/endurance-library/index.ts';
// ⚠️ RELATIVE, NOT `@shared` — that alias is Vite's and does not resolve under `deno test`, which is
// where this file's agreement-with-the-composer test runs. The engine module's own client lint asks
// for the same thing for the same reason: an import that only one toolchain can follow is a module
// only one toolchain can check.
import {
  hardPairInFrameOrder,
  RIDE_EQUIVALENT,
} from '../../supabase/functions/_shared/standing-plan/index.ts';
import { HARD_SLOT_KEYS } from './standing-plan-week-copy';
/**
 * ⛔ THE TIER IS THE ENGINE'S, READ HERE RATHER THAN RESTATED. `experienceLevels` turns the athlete's
 * own per-sport answer into the levels those slots are built at — so this screen quotes hours off
 * the same levels the composer will use. ⚠️ A second table here is how a preview and a plan diverge,
 * the same reason `RIDE_EQUIVALENT` is imported rather than copied.
 *
 * ⛔⛔ AND THE INPUT CHANGED ON 2026-08-27: it was `lowVolumeSports` reading the last 28 days of
 * logged training. Michael ruled history out of the level — *"im coming off a marathon a few months
 * ago I was training less, this is the wrong thing"* — so the answer is the athlete's, with no
 * fallback. See `experienceLevels` for the ruling.
 */
import {
  clampRideLevel,
  experienceLevels,
  FRAMES,
  lowVolumeLevels,
  type EnduranceExperience,
  type ExperienceTier,
} from '../../supabase/functions/_shared/standing-plan/frames.ts';
// ⛔ THE LIBRARY OWNS WHICH SHAPES A FAMILY OFFERS AT A LEVEL — read, never restated. A second list
// here is how a chip comes to quote a session the composer will not build.
import { FAMILIES } from '../../supabase/functions/_shared/endurance-library/index.ts';
import {
  ladderOf,
  weekVolumeBounds,
  type SlotSpec,
} from '../../supabase/functions/_shared/standing-plan/volume-bounds.ts';
import { frameSlots, type SlotKey, type SlotSelection, type SlotSport } from './standing-plan-week-copy';
import type { FrameId } from '../../supabase/functions/_shared/standing-plan/frames.ts';

/**
 * ⛔⛔ THE FRAME'S OWN SLOTS, READ OFF THE FRAME (2026-08-30). It was a four-entry literal, and the
 * comment beside it said the literal was deliberate — *"the SCREEN's four controls are a product
 * decision; a frame that ever carried five endurance slots would need a new screen, not a longer
 * loop."*
 *
 * ⛔ THAT REASONING IS SUPERSEDED, AND ITS OWN CONDITION IS WHY. **A frame that carries five
 * endurance slots now exists** (p274), Michael has ruled the fifth row in, and the row it needs is
 * the same KIND of row as the four already here rather than a new control. What the old note was
 * really protecting against — a silent extra row — is handled by asking the frame instead of by
 * refusing to count: the rows are whatever the frame has, so there is nothing to fall out of step.
 *
 * ⚠️ `strength_5k` PRODUCES THE IDENTICAL FOUR ENTRIES, same keys, same families, same levels. That
 * is the acceptance test and it is pinned.
 */
export const SLOT_FAMILY: Record<SlotKey, { family: FamilyId; level: Level }> = (() => {
  const out = {} as Record<SlotKey, { family: FamilyId; level: Level }>;
  for (const s of frameSlots()) out[s.key] = { family: s.family as FamilyId, level: s.level as Level };
  return out;
})();

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
export const SLOT_FRAME_KEY: Record<SlotKey, string> = (() => {
  const out = {} as Record<SlotKey, string>;
  for (const s of frameSlots()) out[s.key] = s.frameKey;
  return out;
})();

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
export function slotsForEngine(
  slots: SlotSelection,
  frame: FrameId = 'strength_5k',
): Record<string, SlotSport | 'none'> {
  const out: Record<string, SlotSport | 'none'> = {};
  // ⚠️ THE FRAME'S OWN SLOTS AND ITS OWN HARD ROWS — a five-slot week sends five answers.
  for (const s of frameSlots(frame)) {
    const v = slots[s.key];
    if (v) { out[s.frameKey] = v; continue; }
    if (s.role === 'hard') out[s.frameKey] = 'none';
  }
  return out;
}

/**
 * ⛔⛔ THE ATHLETE'S SLOT ANSWERS IN HIS ORDER — one hard ride on his day 1, one hard run on his day
 * 3, whichever way round they were picked (`hardPairInFrameOrder`, 2026-08-27).
 *
 * ⛔ EVERY NUMBER THIS FILE COMPUTES HAS TO RUN ON THE NORMALISED PAIR, or the screen describes a
 * week the composer will not build. `assignSports` normalises server-side; a bound or a chip read
 * off the raw answers showed the run at day 1's easier dose while the block built it at day 3's —
 * caught by the wizard's own agreement test at 10.3 miles built against a 6-9 mile cap.
 * ⚠️ IDEMPOTENT. The wizard already normalises on tap so the rows swap visibly; this is the guard
 * that keeps a caller who did not from getting a different answer.
 */
function inFrameOrder(slots: SlotSelection, frame: FrameId = 'strength_5k'): SlotSelection {
  /**
   * ⚠️ ONLY WHERE THE TWO HARD SLOTS ARE INTERCHANGEABLE (2026-08-30). The normalisation exists
   * because `strength_5k`'s two quality slots are BOTH run families that map onto one ride family,
   * so "which of them is the ride" is genuinely the athlete's answer to normalise. A frame that
   * prescribes one of its quality sessions as a ride outright has no such ambiguity — p274's day 2
   * is a ride and cannot be anything else — and swapping the pair there would move an answer the
   * athlete did not give.
   */
  const pairIsInterchangeable = frameSlots(frame)
    .filter((x) => x.role === 'hard')
    .slice(0, 2)
    .every((x) => !x.family.startsWith('ride_'));
  if (!pairIsInterchangeable) return slots;
  const put = hardPairInFrameOrder(slots.hard1 ?? undefined, slots.hard2 ?? undefined);
  return { ...slots, hard1: put.hard1 ?? null, hard2: put.hard2 ?? null };
}

/** ⚠️ THE FRAME'S OWN SLOT FAMILIES — `SLOT_FAMILY` is this for `strength_5k`. */
function familyMapFor(frame: FrameId): Record<string, { family: FamilyId; level: Level }> {
  const out: Record<string, { family: FamilyId; level: Level }> = {};
  for (const x of frameSlots(frame)) out[x.key] = { family: x.family as FamilyId, level: x.level as Level };
  return out;
}

/**
 * ⛔ THE FAMILY A SLOT BUILDS ONCE ITS SPORT IS KNOWN. A slot the frame already prescribes as a ride
 * IS the answer — `RIDE_EQUIVALENT` maps run families to ride ones and has no entry for it.
 */
function builtFamily(
  base: { family: FamilyId; level: Level },
  sport: SlotSport,
): { family: FamilyId; archetype?: string } | null {
  if (String(base.family).startsWith('ride_')) return { family: base.family };
  if (sport !== 'ride') return { family: base.family };
  const eq = RIDE_EQUIVALENT[base.family];
  return eq ? { family: eq.family, archetype: eq.archetype } : null;
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
  rawSlots: SlotSelection,
  opts: {
    baselines?: EnduranceBaselines;
    easyPaceSecPerMi?: number | null;
    /**
     * ⛔⛔ THE ATHLETE'S OWN EXPERIENCE ANSWER, PER SPORT — the sole input to the level, and it must
     * be the same input the engine reads or this screen quotes hours the week will not build.
     * ⚠️ A SPORT WITH NO ANSWER TAKES THE FRAME'S OWN PRINTED LEVELS, exactly as the composer does.
     */
    experience?: EnduranceExperience | null;
    /** ⚠️ WHICH FRAME'S SLOTS. Absent keeps `strength_5k`, which is every caller before a second one. */
    frame?: FrameId;
  },
): WeekBounds {
  const frame = opts.frame ?? 'strength_5k';
  const anchors = resolveEnduranceAnchors((opts.baselines ?? {}) as never);
  // ⛔ HIS ORDER FIRST — see `inFrameOrder`.
  const slots = inFrameOrder(rawSlots, frame);
  const families = familyMapFor(frame);
  const tierLevels = experienceLevels(opts.experience);
  const levelFor = (family: string, frameLevel: Level): Level =>
    // ⛔ SAME BIKE CEILING THE COMPOSER APPLIES — see `clampRideLevel`.
    clampRideLevel(family, (tierLevels[family] as Level | undefined) ?? frameLevel);
  let runShort = 0;
  let runLong = 0;
  let rideShort = 0;
  let rideLong = 0;
  let anyRun = false;
  let anyRide = false;
  let isLowerBound = false;

  for (const key of Object.keys(families) as SlotKey[]) {
    const base = families[key];
    const sport = slots[key];
    // ⛔ AN UNANSWERED SLOT HOLDS NOTHING YET. Counting it as a run would show a cap for a week the
    // athlete has not described.
    if (!sport) continue;
    if (sport === 'ride') {
      // ⛔ THE COMPOSER'S OWN EQUIVALENCE. A second table here is how a preview and a plan diverge.
      // ⚠️ AND A SLOT THE FRAME ALREADY PRESCRIBES AS A RIDE NEEDS NO CONVERSION — see `builtFamily`.
      const eq = builtFamily(base, 'ride');
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

/**
 * ⛔⛔ WHAT ONE EXPERIENCE CHIP CARRIES — AND EVERY NUMBER ON IT IS COMPUTED, NEVER TYPED
 * (work order, 2026-08-27). Both come out of the engine's own functions against the athlete's own
 * slot assignment and baselines, so the chip and the block cannot disagree.
 */
export type ExperienceChip = {
  tier: ExperienceTier;
  /**
   * ⛔⛔ THE LONGEST **HARD** SESSION THAT TIER GIVES THIS SPORT, in whole minutes — the hard slots
   * only, never the long slot and never the easy one (Michael, 2026-08-27, correcting the work
   * order's own §2a).
   *
   * ⛔ WHY THE LONG SESSION IS EXCLUDED, AND IT IS NOT A SCOPE CUT. A base family's ladder climbs to
   * level 3 from wherever the tier starts it — the HOURS dial moves it, p93 — so its MAXIMUM is the
   * same at both tiers and only its FLOOR moves. Reading the max across every slot let the long run
   * swallow the number: on a week whose long slot is that sport both chips read 90 and 100, the
   * Saturday long run, while the hard session the control is actually setting sat around 42-50.
   * ⚠️ THE LONG SESSION STILL MOVES WITH THE TIER and that is p247's own sentence. It is simply not
   * what the chip prints.
   *
   * ⛔⛔ AND IT IS MEASURED ON THE SHAPE THE COMPOSER WILL ACTUALLY BUILD, which is the second thing
   * this got wrong. `sessionDurationBandSeconds` with no archetype measures the family's FIRST
   * shape; the frame PINS a shape on some slots (`run_near_threshold` is `below_threshold`),
   * `RIDE_EQUIVALENT` pins one on every ride slot, and where nothing is pinned the composer rotates
   * through the offered shapes week by week (p229). Three different answers:
   *
   *   - shape pinned  → that shape's own maximum;
   *   - not pinned    → the MAX across every shape offered at that level, because the block will
   *                     serve each of them in turn and "up to" has to cover the longest week.
   *
   * ⚠️ IT IS THE SAME DEFECT `compose.ts` ALREADY CARRIES A NOTE ABOUT — *"the frame names no shape
   * on most slots, so this passed `undefined` and the library measured its FIRST archetype, while
   * the build below rotates through them."* ⛔ Measured against composed weeks, not assumed.
   *
   * ⚠️ NULL WHEN THIS SPORT FILLS NEITHER HARD SLOT. There is no hard session of it to size, so the
   * chip carries the hours alone rather than a number about some other session.
   */
  longestMin: number | null;
  /**
   * ⛔ THE WEEKLY HOURS THAT TIER NEEDS FOR THIS SPORT — the sport's own FLOOR with every session at
   * its shortest, which is a true "below this it does not fit" rather than a recommendation.
   * ⚠️ ALL FOUR SLOTS, not just the hard ones: it is what the WEEK costs, and the long session is a
   * real part of that cost even though it is not what the duration above claims.
   * ⚠️ ROUNDED UP TO A WHOLE HOUR, because the hours control only offers whole hours: the number
   * printed is the smallest option that actually holds the week, and the gate tests the same number.
   * A displayed minimum the athlete cannot select is a dead end with a reason on it.
   */
  needsHours: number;
  /**
   * ⛔⛔ HOW MANY HARD SESSIONS OF THIS SPORT THE WEEK ACTUALLY CONTAINS (Michael, 2026-08-30).
   *
   * The duration alone under-describes the week he has to fit around work. Measured across a real
   * 12-week block at the experienced tier, a run athlete gets TWO hard runs every week — the
   * near-threshold run at 66 min, and the MLSS run swinging 41-49 by week — and *"up to 66 min"* is
   * true of each of them while he books two evenings, not one.
   * ⚠️ DERIVED FROM THE SLOTS, NEVER ASSUMED TO BE TWO. The mixed week, where the other hard slot is
   * a ride, genuinely has one hard run and must say one.
   */
  hardCount: number;
};

/** The pair for one sport, in screen order. Null when that sport fills no slot. */
export type ExperienceChoice = { newer: ExperienceChip; experienced: ExperienceChip } | null;

/**
 * ⛔ THE FRAME'S OWN SHAPE PER SLOT, READ FROM THE FRAME — not a second table (2026-08-27).
 *
 * `SLOT_FAMILY` above is deliberately a literal because the SCREEN's four controls are a product
 * decision. The SHAPE is not: it is the frame's, it is pinned on two of the four slots, and typing it
 * here is exactly how a chip comes to quote a session the composer does not build.
 * ⚠️ KEYED BY `SLOT_FRAME_KEY`, which is already `${frameDay}:${indexWithinDay}` — the same key
 * `assignSports` reads, so this cannot drift from the slot the screen is describing.
 */
const FRAME_ARCHETYPE: Record<SlotKey, string | undefined> = (() => {
  const out = {} as Record<SlotKey, string | undefined>;
  for (const s of frameSlots()) out[s.key] = s.archetype;
  return out;
})();

/**
 * ⛔⛔ THE TWO CHIPS PER SPORT, COMPUTED (Michael's screen, 2026-08-27).
 *
 * ⚠️ THE NUMBERS MOVE WITH THE SLOT ANSWERS FOUR ROWS ABOVE — a run on the first hard slot is
 * `run_mlss` and a run on the second is `run_near_threshold`, which are different sessions with
 * different lengths. That is why this is a function of `slots` and not a table.
 */
export function experienceChips(
  rawSlots: SlotSelection,
  opts: {
    baselines?: EnduranceBaselines;
    /**
     * ⛔ THE ATHLETE'S OWN VARIANT PICK PER HARD SLOT, when they have made one. It beats the frame's
     * shape in the composer (`SportMix.archetypes`), so it has to beat it here or the chip quotes a
     * session they just replaced. ⚠️ Absent leaves the frame's answer, which is the default path.
     */
    archetypes?: Partial<Record<SlotKey, string | undefined>>;
    /** ⚠️ WHICH FRAME'S SLOTS. Absent keeps `strength_5k`. */
    frame?: FrameId;
  },
): Record<SlotSport, ExperienceChoice> {
  const frame = opts.frame ?? 'strength_5k';
  const anchors = resolveEnduranceAnchors((opts.baselines ?? {}) as never);
  // ⛔ HIS ORDER FIRST — see `inFrameOrder`. A chip measured on the raw answers quotes the hard run
  // at day 1's easier dose while the block builds it at day 3's.
  const slots = inFrameOrder(rawSlots, frame);
  const families = familyMapFor(frame);
  /** One slot as the engine will build it, at one tier. Null when this slot is not that sport. */
  const specFor = (key: SlotKey, sport: SlotSport, tier: ExperienceTier): SlotSpec | null => {
    const sp = slots[key];
    if (!sp) return null;
    const base = families[key];
    if (!base) return null;
    // ⚠️ A NATIVELY-PRESCRIBED RIDE IS ALREADY THE ANSWER — see `builtFamily`.
    const eq = sp === 'ride' ? builtFamily(base, 'ride') : null;
    if (sp === 'ride' && !eq) return null;
    const family = (eq?.family ?? base.family) as FamilyId;
    // ⛔ "Newer" APPLIES `LOW_VOLUME_TIER_LEVELS` FOR THIS SPORT; "Experienced" APPLIES NOTHING.
    // ⚠️ Only THIS sport's levels move — the other sport carries its own answer.
    const tierLevels = (tier === 'newer' && sp === sport
      ? lowVolumeLevels([sport])
      : {}) as Record<string, Level>;
    return {
      family,
      // ⛔ THE BIKE'S OWN CEILING — `clampRideLevel`, the same clamp `assignSports` applies. A ride
      // inherits the SLOT's difficulty, and the frame's second hard slot is level 3, which his
      // cycling programs never prescribe (p278).
      level: clampRideLevel(family, (tierLevels[family] ?? base.level) as Level),
      // ⛔ THE ATHLETE'S PICK, THEN THE RIDE EQUIVALENT'S, THEN THE FRAME'S. Absent means the
      // composer rotates and `longestFor` takes the max across the shapes it will rotate through.
      archetype: opts.archetypes?.[key] ?? eq?.archetype ?? FRAME_ARCHETYPE[key],
      sport: sp,
    } as SlotSpec;
  };
  /** How long this slot's session can be at its own level — see `longestMin`. */
  const longestFor = (spec: SlotSpec): number => {
    const top = (archetype: string | undefined): number => {
      const rungs = ladderOf({ ...spec, archetype } as SlotSpec, anchors);
      // ⚠️ THE FIRST RUNG IS THE TIER'S OWN LEVEL. A hard slot is a QUALITY family, whose rung is a
      // single point (p246 assigns the level and the hours never pull on it), so first and last are
      // the same number — reading the first is what keeps that true if a base family ever lands here.
      return rungs.length === 0 ? 0 : rungs[0].hi;
    };
    if (spec.archetype) return top(spec.archetype);
    /**
     * ⛔ NOTHING PINNED, SO THE BLOCK ROTATES — and "up to" has to cover the longest week it will
     * serve, not the first one. `rotatedArchetype` walks the shapes offered at this level.
     */
    const table = FAMILIES as Record<string, { archetypes: Array<{ id: string; levels?: number[] }> }>;
    const offered = table[spec.family]?.archetypes
      ?.filter((a) => !a.levels || a.levels.includes(spec.level as number)) ?? [];
    if (offered.length === 0) return top(undefined);
    return offered.reduce((best, a) => Math.max(best, top(a.id)), 0);
  };
  const chipFor = (sport: SlotSport, tier: ExperienceTier): ExperienceChip | null => {
    const all = (Object.keys(families) as SlotKey[])
      .map((k) => specFor(k, sport, tier))
      .filter((sp): sp is SlotSpec => sp != null);
    const mine = all.filter((sp) => sp.sport === sport);
    // ⛔ A SPORT WITH NO SLOT HAS NOTHING TO SIZE. No chip rather than a chip reading zero.
    if (mine.length === 0) return null;
    // ⛔ HARD SLOTS ONLY — see `longestMin`.
    // ⚠️ THE FRAME'S OWN HARD ROWS — three on a frame that prescribes three quality sessions.
    const hard = frameSlots(frame).filter((x) => x.role === 'hard').map((x) => x.key)
      .map((k) => (slots[k] === sport ? specFor(k, sport, tier) : null))
      .filter((sp): sp is SlotSpec => sp != null);
    const longest = hard.reduce((top, spec) => Math.max(top, longestFor(spec)), 0);
    const floorHours = weekVolumeBounds(all, anchors)[sport].floor;
    return {
      tier,
      longestMin: longest > 0 ? Math.round(longest) : null,
      // ⛔ THE SAME `hard` LIST THE DURATION COMES FROM — one derivation, so the count and the number
      // can never end up describing different sets of sessions.
      hardCount: hard.length,
      needsHours: Math.max(1, Math.ceil(floorHours)),
    };
  };
  const out = {} as Record<SlotSport, ExperienceChoice>;
  for (const sport of ['run', 'ride'] as const) {
    const newer = chipFor(sport, 'newer');
    const experienced = chipFor(sport, 'experienced');
    out[sport] = newer && experienced ? { newer, experienced } : null;
  }
  return out;
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
