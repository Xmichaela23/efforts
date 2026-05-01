/**
 * Same transpose rule as `supabase/functions/_shared/tri-preferred-days-sanity.ts`
 * (Arc save path runs in the browser — cannot import Deno week-optimizer).
 */
const ABBREV: Record<string, string> = {
  sun: 'sunday',
  sunday: 'sunday',
  mon: 'monday',
  monday: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  tuesday: 'tuesday',
  wed: 'wednesday',
  weds: 'wednesday',
  wednesday: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  thursday: 'thursday',
  fri: 'friday',
  friday: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
};

function weekdayKey(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 6) {
    return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][raw];
  }
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim().toLowerCase().replace(/\.$/, '');
  if (!s) return undefined;
  return ABBREV[s];
}

export function fixTransposedEasyBikeRunAgainstSwimOrder(
  preferredDays: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...preferredDays };
  const swimRaw = out.swim;
  if (!Array.isArray(swimRaw) || swimRaw.length < 2) return out;
  const s0 = weekdayKey(swimRaw[0]);
  const s1 = weekdayKey(swimRaw[1]);
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

  const eb = weekdayKey(pickBike);
  const er = weekdayKey(pickRun);
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
