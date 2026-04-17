/**
 * Same distance vocabulary + display as PlanWizard (`Distance` = 5k | 10k | half | marathon).
 * Plan `config.distance` and goals may use `half_marathon` etc. — normalize first.
 *
 * Route/course is layered on top in Course Strategy; State stays at "what you picked in the wizard."
 */

export type WizardDistance = '5k' | '10k' | 'half' | 'marathon';

/** Map DB / API variants to wizard tokens. */
export function normalizeDistanceToWizardToken(raw: string | null | undefined): WizardDistance | null {
  const d = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!d) return null;

  if (d === 'marathon' || d === 'full_marathon' || d === '26.2' || d === '26_2') return 'marathon';
  if (d.includes('half') || d === 'half_marathon' || d === '13.1' || d === '13_1' || d === '21k' || d === '21.1') {
    return 'half';
  }
  if (d === '10k' || d === '10_k' || d === '10000' || d === '6.2') return '10k';
  if (d === '5k' || d === '5_k' || d === '5000' || d === '3.1') return '5k';
  if (d === 'maintenance' || d === 'capacity') return null;

  if (d === '5k' || d === '10k' || d === 'half' || d === 'marathon') return d as WizardDistance;

  return null;
}

/**
 * Matches PlanWizard race-distance chips: Half | Marathon | 5K | 10K
 * @see PlanWizard.tsx ~1428
 */
export function planWizardRaceDistanceDisplay(raw: string | null | undefined): string {
  const t = normalizeDistanceToWizardToken(raw);
  if (!t) return 'Training';
  if (t === 'half') return 'Half';
  if (t === 'marathon') return 'Marathon';
  return t.toUpperCase();
}
