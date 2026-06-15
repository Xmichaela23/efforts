// Layer 2 — the ONE pool-length resolver. Every place that derives swim distance from lengths
// (distance = number_of_active_lengths × pool_length) reads the length through here, so there is a
// single layered-authority answer to "how long was the pool?". No consumer reimplements the
// priority. Length is METERS throughout (display converts to the athlete's unit at render).
//
// Priority (highest first):
//   1. user_corrected — the athlete fixed it post-swim (device was set to the wrong pool). This
//      OUTRANKS the device on purpose: the correction exists BECAUSE the device was wrong. Per-swim,
//      so there is no "stale correction" risk.
//   2. device_reported — Garmin/FORM-direct captured it (pool_length). NULL for Strava (it drops it).
//   3. planned — set when the swim was sent to Garmin/FORM (plan_pool_length_m, written on attach).
//   4. preference default — imperial → 25 yd, metric → 25 m (the genuine fallback when all NULL).

export interface PoolLengthInputs {
  user_corrected_pool_length_m?: number | null; // tier 1 (NEW column)
  pool_length?: number | null; // tier 2 — device-reported, meters
  plan_pool_length_m?: number | null; // tier 3 — planned, meters
  useImperial?: boolean; // tier 4 default basis
}

export type PoolLengthSource = 'user_corrected' | 'device' | 'planned' | 'default';
export interface ResolvedPoolLength { length_m: number; source: PoolLengthSource }

const YARD_M = 0.9144;
const pos = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function resolvePoolLength(s: PoolLengthInputs): ResolvedPoolLength {
  const uc = pos(s.user_corrected_pool_length_m);
  if (uc != null) return { length_m: uc, source: 'user_corrected' };
  const dev = pos(s.pool_length);
  if (dev != null) return { length_m: dev, source: 'device' };
  const pl = pos(s.plan_pool_length_m);
  if (pl != null) return { length_m: pl, source: 'planned' };
  // Default: 25 yd (imperial) or 25 m (metric). Only fires when every captured source is NULL —
  // i.e. a Strava swim with no lengths/correction; log-worthy so a silent default is visible.
  const length_m = s.useImperial ? Math.round(25 * YARD_M * 100) / 100 : 25;
  return { length_m, source: 'default' };
}
