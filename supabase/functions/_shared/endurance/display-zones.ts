/**
 * ═══ THE ZONE TABLES A SCREEN PRINTS — ONE COPY EACH, ON THE SERVER (2026-09-10, audit H-B05, H-B06) ═══
 *
 * ⛔ POWER: COGGAN'S SEVEN TRAINING LEVELS. Allen & Coggan, *Training and Racing with a Power Meter*
 * (the levels TrainingPeaks publishes as "Power Training Levels"): L1 up to 55% of FTP, L2 56–75,
 * L3 76–90, L4 91–105, L5 106–120, L6 121–150, L7 above 150.
 *
 * ⚠️ WHY THIS TABLE AND NOT ONE OF THE OTHER TWO. There were three:
 *   · Profile (`TrainingBaselines.tsx`) printed these seven levels, but opened Z2 at 55% where Coggan
 *     opens it at 56% — its other lower bounds (76, 91, 106, 121) already followed Coggan;
 *   · `compute-workout-analysis` bins a ride's time in zone on exactly these boundaries (55/75/90/105/
 *     120/150, open above);
 *   · `analyze-cycling-workout` held a six-level table (Z6 120–200%) that no code called.
 * Coggan's table is the field standard and already the one the ride analysis bins by, so it is the one.
 *
 * ⛔ SWIM: THE FIVE PACE BANDS, MOVED FROM `src/lib/swimPaceZones.ts` UNCHANGED. ⚠️ SOURCE STATUS: the
 * offsets (+12, +8, +3 and −2 seconds per 100 from threshold 100 pace) are OURS. Their only citation was
 * `docs/SWIM-PROTOCOL.md` §7.3, which cites no outside source and does not match them exactly (it gives
 * Recovery as +15 or slower and Endurance as +8 to +15). Moved as the screen printed them; not re-decided.
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "endurance/display-zones" supabase/functions
 */

/** The upper edge of L1–L6 as a fraction of FTP; L7 is open above the last. */
export const POWER_LEVEL_UPPER_FRACTION_OF_FTP = [0.55, 0.75, 0.90, 1.05, 1.20, 1.50] as const;

/** Bin edges in watts for time-in-zone: [0, L1 top, …, L6 top, Infinity]. */
export function powerZoneBoundaries(ftp: number): number[] {
  return [0, ...POWER_LEVEL_UPPER_FRACTION_OF_FTP.map((f) => ftp * f), Infinity];
}

export type PowerZoneRow = {
  name: string;
  /** Watts; null for L1's open bottom. */
  low_w: number | null;
  /** Watts; null for L7's open top. */
  high_w: number | null;
  /** The text Profile prints, e.g. `140-188W`. */
  range: string;
};

/** The seven rows Profile prints, for an FTP in watts. [] without a positive FTP. */
export function powerZoneRows(ftp: number): PowerZoneRow[] {
  if (!Number.isFinite(ftp) || ftp <= 0) return [];
  const w = (f: number) => Math.round(ftp * f);
  const band = (name: string, lo: number, hi: number): PowerZoneRow =>
    ({ name, low_w: w(lo), high_w: w(hi), range: `${w(lo)}-${w(hi)}W` });
  return [
    { name: 'Z1 Recovery', low_w: null, high_w: w(0.55), range: `< ${w(0.55)}W` },
    band('Z2 Endurance', 0.56, 0.75),
    band('Z3 Tempo', 0.76, 0.90),
    band('Z4 Threshold', 0.91, 1.05),
    band('Z5 VO2max', 1.06, 1.20),
    band('Z6 Anaerobic', 1.21, 1.50),
    { name: 'Z7 Neuromuscular', low_w: w(1.50), high_w: null, range: `> ${w(1.50)}W` },
  ];
}

export type SwimPaceBandRow = {
  /** Plain effort word (D-199: no CSS, no Z-numbers on screen). */
  label: string;
  /** Pace per 100 of the pool's unit, e.g. `2:35–2:39`. */
  range: string;
  /** True for the Threshold band. */
  anchor: boolean;
};

/** `m:ss` → seconds, or null when absent, malformed or not positive. */
export function parsePaceClock(mmss: unknown): number | null {
  const m = String(mmss ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return sec > 0 ? sec : null;
}

const clock = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The five bands, easy to hard, from the threshold 100 pace in seconds. [] for no pace. */
export function swimPaceBandRows(thresholdSecPer100: number): SwimPaceBandRow[] {
  const c = thresholdSecPer100;
  if (!Number.isFinite(c) || c <= 0) return [];
  return [
    { label: 'Recovery', range: `${clock(c + 12)} and slower`, anchor: false },
    { label: 'Easy', range: `${clock(c + 8)}–${clock(c + 12)}`, anchor: false },
    { label: 'Moderate', range: `${clock(c + 3)}–${clock(c + 8)}`, anchor: false },
    { label: 'Threshold', range: `${clock(c - 2)}–${clock(c + 3)}`, anchor: true },
    { label: 'Hard', range: `${clock(c - 2)} and faster`, anchor: false },
  ];
}
