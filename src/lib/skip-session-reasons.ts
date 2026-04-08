/** Stable codes stored on `planned_workouts.skip_reason` — coach / analytics consume as-is. */
export const SKIP_SESSION_REASONS = [
  { code: 'tired', label: 'Tired / low energy' },
  /** Training-load signal (e.g. day after long or hard) — distinct from same-day low energy. */
  { code: 'fatigued', label: 'Fatigued / training load' },
  { code: 'sick', label: 'Sick or injury' },
  { code: 'travel', label: 'Travel' },
  { code: 'work', label: 'Work / schedule' },
  { code: 'weather', label: 'Weather' },
  { code: 'motivation', label: 'Not feeling it' },
  { code: 'other', label: 'Other' },
] as const;

export type SkipSessionReasonCode = (typeof SKIP_SESSION_REASONS)[number]['code'];

export function skipReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const row = SKIP_SESSION_REASONS.find((r) => r.code === code);
  return row?.label ?? code;
}
