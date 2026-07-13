/**
 * THE ONE FRIEL RUN HR ZONE MODEL. Client + edge.
 *
 * WHY THIS EXISTS (D-286). The Friel Z2/Z3 boundary was hardcoded in THREE places that did not agree:
 *
 *   supabase/functions/_shared/easy-hr.ts        easy ceiling  = round(0.89 x LTHR)   -> 134 @ LTHR 151
 *   supabase/functions/compute-workout-analysis  zone-3 floor  = round(0.90 x LTHR)   -> 136
 *   src/components/TrainingBaselines.tsx         Z2 max        = round(0.90 x LTHR)   -> 136
 *
 * So a 135 bpm run was **"Zone 2 Aerobic" on the athlete's own Baselines screen and "too hard to be easy"
 * to the learner that sets their plan's pace.** One fact, two screens, opposite answers — the exact failure
 * the shared easy band was written to end. D-284 fixed the analyzer copy and MISSED this one, which is the
 * copy the athlete actually LOOKS AT.
 *
 * All three are defensible Friel (Z2 is 85-89% of LTHR; Z3 begins at 90%). The bug was never the number.
 * **The bug was that there were three numbers.** Now there is one, and everything derives from it:
 *
 *     easy  ===  Zone 1 or Zone 2  ===  hr <= easyCeilingBpm(lthr)
 *
 * ...by construction, at every LTHR, on every surface. They cannot drift again.
 *
 * Shared code lives in `src/lib/` and edge functions import from it (the `resolve-current-ftp.ts` /
 * `session-frequency-defaults.ts` precedent) — the client never imports from `supabase/functions/_shared`.
 *
 * Receipts: Friel's own published run zones (TrainingPeaks, "A Quick Guide to Setting Zones"):
 *   Z1 recovery  < 85% LTHR
 *   Z2 aerobic     85-89% LTHR      <- the top of EASY
 *   Z3 tempo       90-94% LTHR
 *   Z4 threshold   95-99% LTHR
 *   Z5 VO2max     100%+ LTHR
 * (The Z4/Z5 cuts below keep the pre-existing 0.95 / 1.05 boundaries — this module changes ONLY the
 * Z2/Z3 seam, which is the one that was fractured. Do not "tidy" the others without a reason.)
 */

/** Friel Z2 ceiling — the top of easy/aerobic. Z1 < 85% LTHR, Z2 85-89%; above 89% is Z3 (not easy). */
export const EASY_CEILING_PCT_LTHR = 0.89;
/** Below this is a walk, a stop, or a broken strap — not an easy run. */
export const EASY_FLOOR_PCT_LTHR = 0.70;
/** Z1/Z2 seam. */
export const Z2_FLOOR_PCT_LTHR = 0.85;
/** Z3/Z4 and Z4/Z5 seams — unchanged from the pre-existing model. */
export const Z4_FLOOR_PCT_LTHR = 0.95;
export const Z5_FLOOR_PCT_LTHR = 1.05;

/** The top of EASY, in bpm. The single number every "is this easy?" decision must agree with. */
export function easyCeilingBpm(lthr: number): number {
  return Math.round(lthr * EASY_CEILING_PCT_LTHR);
}

/**
 * The first heartbeat that is NOT easy — i.e. the floor of Zone 3. DERIVED from the easy ceiling, never
 * rounded independently. This is what guarantees `easy === Z1 or Z2` with no crack between them.
 */
export function zone3FloorBpm(lthr: number): number {
  return easyCeilingBpm(lthr) + 1;
}

/** The floor of the easy band (below = walking / stopped / broken strap). */
export function easyFloorBpm(lthr: number): number {
  return Math.round(lthr * EASY_FLOOR_PCT_LTHR);
}

export interface FrielZone {
  name: 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';
  label: string;
  min: number;
  /** null = open-ended (Z5). */
  max: number | null;
}

/**
 * The five Friel run HR zones. Z2's ceiling IS `easyCeilingBpm`, and Z3 begins one beat above it — so the
 * zone table the athlete reads and the band the learner applies can never disagree again.
 */
export function frielRunZones(lthr: number): FrielZone[] {
  const easyTop = easyCeilingBpm(lthr);
  return [
    { name: 'Z1', label: 'Recovery',  min: 0,                               max: Math.round(lthr * Z2_FLOOR_PCT_LTHR) - 1 },
    { name: 'Z2', label: 'Aerobic',   min: Math.round(lthr * Z2_FLOOR_PCT_LTHR), max: easyTop },
    { name: 'Z3', label: 'Tempo',     min: zone3FloorBpm(lthr),             max: Math.round(lthr * Z4_FLOOR_PCT_LTHR) - 1 },
    { name: 'Z4', label: 'Threshold', min: Math.round(lthr * Z4_FLOOR_PCT_LTHR), max: Math.round(lthr * Z5_FLOOR_PCT_LTHR) - 1 },
    { name: 'Z5', label: 'VO2max',    min: Math.round(lthr * Z5_FLOOR_PCT_LTHR), max: null },
  ];
}
