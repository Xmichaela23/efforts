/**
 * Discipline fatigue weights — how much a session of discipline X contributes to
 * fatigue in discipline Y. These are the weight source for the running/cycling
 * WEIGHTED variants of the shared ACWR authority (`_shared/acwr.ts`, via the
 * `weightFn` hook) and for `buildBodyResponse`'s weighted week-load.
 *
 * Extracted here (D-236 Part A) from `athlete-snapshot/body-response.ts`: they
 * are a generic cross-discipline load primitive, not a body-response concern,
 * and coach was reaching through the athlete-snapshot barrel to get them for the
 * ACWR helper. `body-response.ts` re-exports them for backward-compat.
 * (Full physical relocation of buildBodyResponse itself was considered and
 * declined per the no-churn rule — see D-236.)
 */

/** Normalize a raw workout type to a canonical discipline key. */
function normType(t: string): string {
  const s = t.toLowerCase().trim();
  if (s.startsWith('run') || s === 'running') return 'run';
  if (s.startsWith('ride') || s.startsWith('cycling') || s.startsWith('bike')) return 'ride';
  if (s.startsWith('swim')) return 'swim';
  if (s.startsWith('strength') || s === 'weight_training' || s === 'weights') return 'strength';
  if (s.startsWith('yoga') || s.startsWith('pilates') || s.startsWith('mobility')) return 'mobility';
  return s || 'other';
}

/**
 * How much does this session contribute to running-specific fatigue?
 * 1.0 = full running load; 0.0 = no impact on running readiness.
 */
export function getRunningFatigueWeight(session: {
  type: string;
  name?: string;
}): number {
  const t = normType(session.type);
  const nameLower = (session.name || '').toLowerCase();

  // OURS — `getRunningFatigueWeight` run 1.0, strength upper 0.3 / lower 0.7 / full 0.5, ride 0.6, swim 0.2, mobility 0, other 0.3: no outside source
  if (t === 'run') return 1.0;

  if (t === 'strength') {
    if (nameLower.includes('upper body') || nameLower.includes('upper-body')) return 0.3;
    if (nameLower.includes('lower body') || nameLower.includes('lower-body') || nameLower.includes('leg')) return 0.7;
    if (nameLower.includes('full body') || nameLower.includes('full-body')) return 0.5;
    return 0.5;
  }

  if (t === 'ride') return 0.6;
  if (t === 'swim') return 0.2;
  if (t === 'mobility') return 0.0;
  return 0.3;
}

/**
 * How much does this session contribute to cycling-specific fatigue?
 * Mirror of `getRunningFatigueWeight` for Tier 4 item 11 of running→cycling delta map.
 *
 * Weight rationale:
 * - ride: 1.0 — direct cycling load
 * - run: 0.4 — eccentric leg loading carries over to cycling musculature; less than
 *   ride 1:1 because the muscle-action profile differs (eccentric impact vs concentric
 *   pedal stroke)
 * - strength: lower-body 0.7 (same prime movers as cycling — quads, glutes, hams),
 *   upper-body 0.2 (minimal cycling carryover beyond core stability), full-body 0.5
 * - swim: 0.1 — low impact on cycling musculoskeletal system; the lat fatigue from
 *   pulling doesn't reach the cycling-specific muscle groups
 * - mobility: 0.0 — net-positive for recovery, no fatigue cost
 * - other: 0.3 — generic catch-all
 */
export function getCyclingFatigueWeight(session: {
  type: string;
  name?: string;
}): number {
  const t = normType(session.type);
  const nameLower = (session.name || '').toLowerCase();

  // OURS — `getCyclingFatigueWeight` ride 1.0, strength upper 0.2 / lower 0.7 / full 0.5, run 0.4, swim 0.1, mobility 0, other 0.3: no outside source
  if (t === 'ride') return 1.0;

  if (t === 'strength') {
    if (nameLower.includes('upper body') || nameLower.includes('upper-body')) return 0.2;
    if (nameLower.includes('lower body') || nameLower.includes('lower-body') || nameLower.includes('leg')) return 0.7;
    if (nameLower.includes('full body') || nameLower.includes('full-body')) return 0.5;
    return 0.5;
  }

  if (t === 'run') return 0.4;
  if (t === 'swim') return 0.1;
  if (t === 'mobility') return 0.0;
  return 0.3;
}
