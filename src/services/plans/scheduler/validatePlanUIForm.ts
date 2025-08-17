import { Day, PlanUIForm } from './types';

export function validatePlanUIForm(f: PlanUIForm): { ok: true } | { ok: false; error: string } {
  if (!f.longRunDay) return { ok: false, error: 'Select a long run day.' };
  if (!Array.isArray(f.availableDays) || f.availableDays.length === 0)
    return { ok: false, error: 'Select at least one available day.' };

  if (!Array.isArray(f.preferredStrengthDays))
    return { ok: false, error: 'Pick your strength days.' };

  if (f.strengthDaysPerWeek === 3) {
    if (!(f.experience === 'veryExperienced' && f.availableDays.length >= 6)) {
      return { ok: false, error: '3 strength days require Very Experienced and ≥6 available days.' };
    }
    if (f.preferredStrengthDays.length !== 3)
      return { ok: false, error: 'Select 3 preferred strength days to match 3 per week.' };
  } else {
    if (f.preferredStrengthDays.length !== 2)
      return { ok: false, error: 'Select 2 preferred strength days to match 2 per week.' };
  }

  if (!f.availableDays.includes(f.longRunDay))
    return { ok: false, error: 'Your long run day must be one of your available days.' };

  const allAvail = f.preferredStrengthDays.every((d: Day) => f.availableDays.includes(d));
  if (!allAvail) return { ok: false, error: 'Strength days must be chosen from your available days.' };

  return { ok: true };
}


