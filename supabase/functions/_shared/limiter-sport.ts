/**
 * Which sport the season treats as the limiter when the athlete has not said. Moved out of
 * create-goal-and-materialize-plan (2026-09-10) so get-arc-context can apply the same limiter to the
 * hours cards' session counts that the goal build applies to the plan.
 */
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';
import type { ArcContext } from './arc-context.ts';

export function inferLimiterSportFromArc(
  arc: Pick<ArcContext, 'swim_training_from_workouts' | 'learned_fitness' | 'performance_numbers'>,
): 'swim' | 'bike' | 'run' {
  const swim = arc.swim_training_from_workouts;
  if (swim && swim.completed_swim_sessions_last_90_days === 0) return 'swim';
  /**
   * ⛔ THROUGH THE FTP RESOLVER (2026-08-19, TRUTH-MAP §5). This read the learned estimate's
   * `confidence` raw and called the bike the limiter whenever it was `low` — including for an athlete
   * who had TYPED an FTP. A number the athlete asserted is not a data gap, so the bike was being named
   * as the weak discipline on the strength of an estimate the app was not even using.
   *
   * The resolver reports `low` only when a low-confidence learned value is genuinely what it landed on
   * (its `learned-low` tier) — i.e. exactly when there is nothing better.
   */
  const resolvedFtp = resolveCurrentFtp({
    learned_fitness: arc.learned_fitness, performance_numbers: arc.performance_numbers,
  } as never);
  if (resolvedFtp.source === 'learned-low' || (resolvedFtp.value == null && arc.learned_fitness)) {
    return 'bike';
  }
  return 'run';
}
