/**
 * WHICH SAVED MAX A LIFT'S TEST WRITES — one map (2026-09-10, audit H-S08).
 *
 * The strength logger and `analyze-strength-workout` each kept a copy, and they differed on one name:
 * the logger's matched "pull up" and "pullup" but not "Pull-ups" with the hyphen, so a pull-up test
 * under that name mapped to no saved max on the phone and to `pullupMaxReps` on the server. This is the
 * server's copy, unchanged. `save-baseline-test` picks the key with it, `analyze-strength-workout`
 * reads it, and the logger reads it for the stored max a test row names.
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "strength-test-key" supabase/functions
 */
export type StrengthTestKey = 'squat' | 'deadlift' | 'bench' | 'overheadPress1RM' | 'pullupMaxReps';

export function strengthTestKey(name: string): StrengthTestKey | null {
  const n = String(name || '').toLowerCase();
  if (n.includes('squat') && !n.includes('goblet') && !n.includes('jump')) return 'squat';
  if (n.includes('deadlift')) return 'deadlift';
  if (n.includes('bench') && n.includes('press')) return 'bench';
  if ((n.includes('overhead') || n.includes('ohp')) && n.includes('press')) return 'overheadPress1RM';
  // Pull-ups: the max clean-rep COUNT is stored (an integer), not an estimated max (Q-102).
  if (n.includes('pull-up') || n.includes('pullup') || n.includes('pull up')) return 'pullupMaxReps';
  return null;
}
