/**
 * Exercise name canonicalization (client-side).
 * Mirrors supabase/functions/_shared/canonicalize.ts so UI can match
 * exercise names to exercise_log canonical_name for trend lookups.
 */
const CANONICAL: Record<string, string> = {
  squat: 'squat',
  'back squat': 'squat',
  'front squat': 'front_squat',
  deadlift: 'deadlift',
  'trap bar deadlift': 'trap_bar_deadlift',
  'romanian deadlift': 'romanian_deadlift',
  rdl: 'romanian_deadlift',
  'bench press': 'bench_press',
  'overhead press': 'overhead_press',
  ohp: 'overhead_press',
  'military press': 'overhead_press',
  'shoulder press': 'overhead_press',
  'barbell row': 'barbell_row',
  'dumbbell row': 'db_row',
  'db row': 'db_row',
  'pull-up': 'pullup',
  'pull up': 'pullup',
  'push-up': 'pushup',
  'push up': 'pushup',
  'hip thrust': 'hip_thrust',
  'hip thrusts': 'hip_thrust',
  'leg press': 'leg_press',
  lunge: 'lunge',
};

export function canonicalize(raw: string): string {
  if (!raw) return 'unknown';
  const key = raw.toLowerCase().trim();
  return CANONICAL[key] ?? key.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
