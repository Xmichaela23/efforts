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
