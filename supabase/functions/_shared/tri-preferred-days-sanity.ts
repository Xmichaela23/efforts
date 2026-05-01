import { normalizeDayName, type DayName } from './week-optimizer.ts';

/**
 * Arc / `<arc_setup>` often assigns easy_run to swim[0] (easy swim) and easy_bike
 * to swim[1] (quality swim) — transposed vs the intended template (easy bike with
 * easy swim, easy run paired with the other mid-week swim slot). Matrix validation
 * can still pass. Swap easy_bike / easy_run when that exact transpose is detected.
 */
export function fixTransposedEasyBikeRunAgainstSwimOrder(
  preferredDays: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...preferredDays };
  const swimRaw = out.swim;
  if (!Array.isArray(swimRaw) || swimRaw.length < 2) return out;
  const s0 = normalizeDayName(swimRaw[0]);
  const s1 = normalizeDayName(swimRaw[1]);
  if (!s0 || !s1 || s0 === s1) return out;

  const pickBike =
    out.easy_bike ?? out.easyBike ?? out.bike_easy ?? out.bikeEasy ?? out.mid_week_easy_bike;
  const pickRun =
    out.easy_run ??
    out.easyRun ??
    out.run_easy ??
    out.runEasy ??
    out.mid_week_easy_run ??
    out.midWeekEasyRun;

  const eb = normalizeDayName(pickBike) as DayName | undefined;
  const er = normalizeDayName(pickRun) as DayName | undefined;
  if (!eb || !er) return out;

  if (er === s0 && eb === s1) {
    out.easy_bike = pickRun;
    out.easy_run = pickBike;
    delete out.easyBike;
    delete out.easyRun;
    delete out.bike_easy;
    delete out.bikeEasy;
    delete out.run_easy;
    delete out.runEasy;
    delete out.mid_week_easy_bike;
    delete out.midWeekEasyBike;
    delete out.mid_week_easy_run;
    delete out.midWeekEasyRun;
  }
  return out;
}
