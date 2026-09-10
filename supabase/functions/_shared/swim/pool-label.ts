/**
 * ⛔ A COMPLETED SWIM'S POOL LABEL (2026-09-10, audit H-D08 / H-D13).
 *
 * The Details tab and the pool-swim card both labelled any pool from 20 to 26 m in yards, so a 25 m
 * pool read "27 yd", and neither read the unit the athlete saved. The session contract now carries the
 * label; both print it. It is built from two rules the server already has, and adds no number:
 *
 *   LENGTH — `resolvePoolLength`, the one pool-length resolver: the athlete's correction, then the
 *   device's length, then the plan's. When none of those was captured the resolver falls back to a
 *   default length; that length was never measured, so there is NO label and the screen shows "N/A".
 *
 *   UNIT — the unit saved on the swim (`pool_unit`, from the post-swim popup or the plan's attach),
 *   then the plan's (`plan_pool_unit`), then the athlete's unit setting (imperial reads yards, metric
 *   metres — the same basis the resolver's own default and materialize-plan's swim pace use). With no
 *   setting either, metres, the unit the length is stored in.
 *
 * ⚠️ So a watch-recorded 22.86 m pool with no saved unit reads "25 yd" for an imperial athlete and a
 * 25 m pool reads "25 m" for a metric one; an imperial athlete in a 25 m pool with nothing saved still
 * reads "27 yd", as the old guess did.
 */
import { poolUnitOf } from './planned-pool.ts';
import { resolvePoolLength } from './resolve-pool-length.ts';

/** One international yard is exactly 0.9144 m (by definition). */
const M_PER_YD = 0.9144;

export type PoolLabel = { label: string | null; unit: 'yd' | 'm' | null };

export type PoolLabelInput = {
  /** `workouts.user_corrected_pool_length_m` — the athlete's correction, metres. */
  user_corrected_length_m?: unknown;
  /** `workouts.pool_length` — the device's length, metres. */
  length_m?: unknown;
  /** `workouts.plan_pool_length_m` — the plan's length, written on attach, metres. */
  plan_length_m?: unknown;
  /** `workouts.pool_unit` — the unit saved on the swim. */
  unit?: unknown;
  /** `workouts.plan_pool_unit` — the plan's unit, written on attach. */
  plan_unit?: unknown;
  /** `user_baselines.units` — 'imperial' | 'metric'. */
  athlete_units?: unknown;
};

export function poolLabel(pool: PoolLabelInput | null | undefined): PoolLabel {
  if (!pool) return { label: null, unit: null };
  const resolved = resolvePoolLength({
    user_corrected_pool_length_m: pool.user_corrected_length_m as number | null,
    pool_length: pool.length_m as number | null,
    plan_pool_length_m: pool.plan_length_m as number | null,
  });
  if (resolved.source === 'default') return { label: null, unit: null };
  const setting = String(pool.athlete_units ?? '').toLowerCase();
  const unit = poolUnitOf(pool.unit) ?? poolUnitOf(pool.plan_unit)
    ?? (setting === 'imperial' ? 'yd' : setting === 'metric' ? 'm' : null) ?? 'm';
  const len = resolved.length_m;
  return unit === 'yd'
    ? { label: `${Math.round(len / M_PER_YD)} yd`, unit }
    : { label: `${Math.round(len)} m`, unit };
}
