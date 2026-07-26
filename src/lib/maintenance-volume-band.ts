/**
 * THE MAINTENANCE VOLUME BAND — one definition, read by the composer and by the intake.
 *
 * ⛔ THIS IS NOT A CAP, AND IT MUST NEVER BECOME ONE.
 *
 * A hard ceiling was built once (D-222) and **deliberately retired** on 2026-07-01. The composer
 * still carries the note: *honour the athlete's typed miles; surface the honest trade-off, never cap
 * or bump.* Reinstating a ceiling would reverse a shipped decision without superseding it.
 *
 * The reason is not squeamishness, it is that we cannot source the number. From this repo's own
 * science doc, verbatim: **"Volume-dependence is directionally supported and mechanistically
 * sensible; any numeric threshold the app states would be invented. Say it as a tendency, never with
 * a number."** Wilson 2012 found the volume correlation; Schumann 2022, with more studies, found no
 * frequency moderation at all. And the cost is not comparable across athletes — a 60-mile runner
 * dropping to 40 is at maintenance while a 20-mile runner at 40 is building.
 *
 * ⚠️ Related, and also not to be reinstated: the AMPK-chronically-inhibits-mTOR argument for capping
 * volume is on the struck list. Coffey & Hawley found signalling interference is **acute and resolves
 * well within 24h**, which is why alternating days already separates it.
 *
 * So the band is a REFERENCE the app reasons out loud about, not a fence. The athlete types what they
 * actually carry, the app says plainly whether that sits inside what the block was built around, and
 * the number stands either way. The trade is visible and theirs to own.
 */

/** ~2×/wk maintenance dose floor [Hickson 1981, Spiering 2021] — CONVENTION on the exact minutes. */
export const MAINTENANCE_FLOOR_MIN = 60;

/** ~3 h/wk. Interference tracks total work, not easy volume [Fyfe 2016] — a tighter reference
 *  over-protects an established base. Raised from 150 (D-222). */
export const MAINTENANCE_CEILING_MIN = 180;

/** Used only when the athlete's easy pace is not yet learned. The estimate is disclosed, never hidden. */
export const FALLBACK_EASY_MIN_PER_MILE = 10;

export type VolumeState = 'above' | 'below' | 'in_band';

/**
 * ⛔ THE BAND IS THE ATHLETE'S OWN VOLUME, WHEN THEY GIVE IT.
 *
 * The absolute band below (60-180 min/wk) is the SAME for every athlete, and that is its flaw: 12
 * miles reads as "a maintenance dose" whether they normally run 40 or normally run 10. For the first
 * that is a deep cut; for the second it is more than they have ever done. Same sentence, opposite
 * truth — an absolute band wearing the language of a personal one.
 *
 * SPEC-get-stronger §2 already says what it should be: endurance at **roughly two-thirds of normal**
 * [Hickson — cut duration to ⅓ or ⅔ and VO2max holds 15 weeks; cut INTENSITY and it is lost]. That
 * is per-athlete by construction and needs no new number.
 *
 * So when the athlete tells us their usual volume, the band is a fraction of THAT. The absolute band
 * is the fallback for when they do not.
 */
export const MAINTENANCE_FRACTION = 2 / 3;

/** Tolerance around two-thirds before it reads as above or below. Ours, and deliberately wide: the
 *  evidence supports the direction, not a precise split, and a narrow band would manufacture a
 *  verdict the science cannot carry. */
const BAND_TOLERANCE = 0.25;

/** Where typed mileage sits against the athlete's OWN usual volume. Null when they gave no usual. */
export function volumeStateVsUsual(weeklyMiles: number, usualWeeklyMiles: number): VolumeState | null {
  const miles = Number(weeklyMiles);
  const usual = Number(usualWeeklyMiles);
  if (!Number.isFinite(miles) || miles <= 0 || !Number.isFinite(usual) || usual <= 0) return null;
  const target = usual * MAINTENANCE_FRACTION;
  if (miles > target * (1 + BAND_TOLERANCE)) return 'above';
  if (miles < target * (1 - BAND_TOLERANCE)) return 'below';
  return 'in_band';
}

/** The maintenance dose for an athlete who told us their usual — what the app suggests, not enforces. */
export function maintenanceDoseFor(usualWeeklyMiles: number): number | null {
  const usual = Number(usualWeeklyMiles);
  if (!Number.isFinite(usual) || usual <= 0) return null;
  return Math.round(usual * MAINTENANCE_FRACTION);
}

/** Personal version of the line. Names THEIR number, which is the whole point of asking for it. */
export function volumeStateLineVsUsual(state: VolumeState | null, usualWeeklyMiles: number, unit = 'mi'): string | null {
  const dose = maintenanceDoseFor(usualWeeklyMiles);
  if (!state || dose == null) return null;
  switch (state) {
    case 'above':
      return `Above the ~${dose} ${unit} that holds your usual ${Math.round(Number(usualWeeklyMiles))}. It still holds — the strength gain settles toward the low end of the range.`;
    case 'below':
      return `Below the ~${dose} ${unit} that holds your usual ${Math.round(Number(usualWeeklyMiles))}. The base drifts at this volume, and comes back when the running does.`;
    case 'in_band':
      return `About the ~${dose} ${unit} that holds your usual ${Math.round(Number(usualWeeklyMiles))}. Held, not built.`;
  }
}

/**
 * Where typed weekly mileage sits against the band.
 *
 * ⚠️ The INTAKE calls this with the fallback pace, because the client does not resolve the athlete's
 * learned easy pace. The SERVER re-runs it with the real pace at build time and stores that result
 * (`plans.config.volume_state`). So the intake line is an honest preview, and the plan's own copy is
 * authoritative. Do not "fix" the difference by teaching the client to resolve pace — that is a
 * second copy of a shared decision, the exact disease `resolveCurrentRunEasyPace` was written to cure.
 */
export function volumeStateForMiles(
  weeklyMiles: number,
  easyPaceMinPerMile = FALLBACK_EASY_MIN_PER_MILE,
): VolumeState | null {
  const miles = Number(weeklyMiles);
  const pace = Number(easyPaceMinPerMile) > 0 ? Number(easyPaceMinPerMile) : FALLBACK_EASY_MIN_PER_MILE;
  if (!Number.isFinite(miles) || miles <= 0) return null;
  const floor = Math.round(MAINTENANCE_FLOOR_MIN / pace);
  const ceiling = Math.round(MAINTENANCE_CEILING_MIN / pace);
  if (miles > ceiling) return 'above';
  if (miles < floor) return 'below';
  return 'in_band';
}

/**
 * What the athlete is told. ⛔ NEVER A WARNING AND NEVER AN INSTRUCTION — the number stands whatever
 * this says. Fact, then the consequence that follows from it (COPY-VOICE: no imperatives, no
 * consoling closers, subject is the training rather than the person).
 *
 * "Above" deliberately does not predict an injury, a failed block or a lost lift. What it states is
 * what the block does with the volume — holds it — and where the strength gain lands, which is the
 * trade the athlete is actually making.
 */
export function volumeStateLine(state: VolumeState | null): string | null {
  switch (state) {
    case 'above':
      return 'Above the volume this block is built around. It still holds — the strength gain settles toward the low end of the range.';
    case 'below':
      return 'Below the volume that holds an aerobic base. The base drifts at this volume, and comes back when the running does.';
    case 'in_band':
      return 'Inside the volume this block is built around. Held, not built — this is a maintenance dose.';
    default:
      return null;
  }
}
