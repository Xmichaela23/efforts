// What the Garmin converter needs on the planned row before it runs: the athlete's FTP (so % FTP steps
// become watts) and, for a swim with no pool set, the pool from the athlete's units.
// Moved from send-workout-to-garmin/index.ts (2026-09-13); the button and the calendar sync both call it.
import { resolveCurrentFtp } from '../../../../src/lib/resolve-current-ftp.ts'

// deno-lint-ignore no-explicit-any
export function applyGarminBaselines(workout: any, baselines: any): void {
  // Bug fix (2026-05-13): FTP lives in performance_numbers / learned_fitness, resolved by the shared precedence
  // helper. Permissive — any non-null FTP beats sending no power target.
  const { value: resolvedFtp } = resolveCurrentFtp(baselines as any)
  if (resolvedFtp) workout.user_ftp = Math.round(resolvedFtp)
  const isSwim = String(workout?.type || '').toLowerCase() === 'swim'
  const hasPool = isSwim && (workout?.pool_unit || workout?.pool_length_m)
  if (isSwim && !hasPool) {
    const pref = String(baselines?.units || 'imperial').toLowerCase()
    if (pref === 'imperial') {
      workout.pool_unit = 'yd'
      workout.pool_length_m = 22.86
    } else if (pref === 'metric') {
      workout.pool_unit = 'm'
      workout.pool_length_m = 25.0
    }
  }
}
