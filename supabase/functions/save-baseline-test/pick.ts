/**
 * WHICH LOGGED SET BECOMES THE SAVED MAX — picked here, not on the phone (2026-09-10, audit H-S08).
 *
 * The strength logger used to decide it as each set was ticked: the last qualifying set per exercise
 * won, and only that set was sent. It now sends every set of the session, and this picks.
 *
 * ⛔ THE RULE IS THE TEST READ-BACK'S. Among the sets that may count, `testSetFromLogged` and
 * `testSetReplaces` from `_shared/standing-plan/working-number.ts` choose — the heaviest completed set;
 * at equal weight the scored (AMRAP) set, then the later one. The same functions `readTestWeek` uses to
 * read week one's test back, so the saved max and the block's working number come from the same set.
 *
 * ⚠️ WHICH SETS MAY COUNT AT ALL is the logger's gate, moved unchanged:
 *   · completed working sets only;
 *   · a row that has a scored set: only the scored set (2026-08-31 — a set logged after the test is
 *     not the test);
 *   · otherwise, on a tag retest any working set; on a named "Baseline Test: Upper / Lower / Full"
 *     session only a sub-max set with a confirmed RIR of 2–3 (D-203, D-224);
 *   · pull-ups: the rep-max set's clean-rep count, 0 included, never a band-assisted count (2026-08-13).
 * ⚠️ PULL-UPS COMPARE BY REPS, the number that is stored: most reps, the later set on a tie. OURS — the
 * read-back covers the four barbell lifts only and has no rule for a rep count.
 * ⚠️ TWO EXERCISES ON ONE KEY ("Back Squat" and "Front Squat") compete for the one saved max by the
 * same rule. The logger sent both and the later write won.
 */
import { testSetFromLogged, testSetReplaces, type TestSetCandidate } from '../_shared/standing-plan/working-number.ts';
import { strengthTestKey } from '../_shared/strength-test-key.ts';
import { canWritePullupCapacity } from '../../../src/lib/pullup-progression.ts';

export type LoggedTestSet = {
  weight?: number | null;
  reps?: number | null;
  completed?: boolean;
  setType?: 'warmup' | 'working' | string | null;
  amrap?: boolean;
  repMaxTest?: boolean;
  rir?: number | null;
  rir_autofilled?: boolean;
  resistance_level?: string | number | null;
};
export type LoggedTestExercise = { name?: string | null; sets?: LoggedTestSet[] | null };
export type TestSession = { name?: string | null; tags?: unknown } | null | undefined;
export type PickedLift = { baselineKey: string; weight: number; reps: number; exercise: string };

function tagsOf(raw: unknown): string[] {
  let tags: unknown[] = [];
  if (Array.isArray(raw)) tags = raw;
  else if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) tags = p; } catch { /* not JSON */ }
  }
  return tags.map((t) => String(t).toLowerCase());
}

/** A strength test session: the `1rm_test` tag, or a name containing "baseline test" (the logger's own test). */
export function isTestSession(session: TestSession): boolean {
  const name = String(session?.name ?? '').toLowerCase();
  return name.includes('baseline test') || tagsOf(session?.tags).includes('1rm_test');
}

/**
 * The Baselines launcher's own sessions, "Baseline Test: Upper / Lower / Full" — the only ones whose
 * unscored sets take the sub-max RIR gate. Every other test session is a tag retest.
 */
export function isNamedBaselineSession(session: TestSession): boolean {
  const name = String(session?.name ?? '').toLowerCase();
  if (!name.includes('baseline test')) return false;
  return name.includes('full') || name.includes('both') || name.includes('lower') || name.includes('upper');
}

export function pickTestLifts(exercises: LoggedTestExercise[] | null | undefined, session: TestSession): PickedLift[] {
  const tagRetest = isTestSession(session) && !isNamedBaselineSession(session);
  const best = new Map<string, TestSetCandidate & { exercise: string }>();

  for (const ex of exercises ?? []) {
    const name = String(ex?.name ?? '');
    const key = strengthTestKey(name);
    if (!key) continue;
    const sets = Array.isArray(ex?.sets) ? ex.sets : [];
    const rowHasScoredSet = sets.some((s) => s?.amrap === true);

    for (const s of sets) {
      if (s?.setType !== 'working' || s?.completed !== true) continue;
      if (key === 'pullupMaxReps' && !canWritePullupCapacity(name, s)) continue;

      let candidate: TestSetCandidate | null = null;
      if (s?.repMaxTest === true) {
        // The clean-rep COUNT is the result: no weight, no RIR gate, and 0 is valid.
        const reps = Number(s?.reps);
        if (key !== 'pullupMaxReps' || !Number.isInteger(reps) || reps < 0) continue;
        candidate = { weight: 0, reps, amrap: false, date: '' };
      } else {
        const scored = s?.amrap === true;
        const scoredPath = (tagRetest || scored) && (!rowHasScoredSet || scored);
        if (!scoredPath) {
          const rir = Number(s?.rir);
          if (s?.rir == null || s?.rir_autofilled === true || !(rir >= 2 && rir <= 3)) continue;
        }
        candidate = testSetFromLogged(s as Record<string, unknown>, '');
      }
      if (!candidate) continue;

      const prior = best.get(key);
      const replaces = key === 'pullupMaxReps'
        ? (!prior || candidate.reps >= prior.reps)
        : testSetReplaces(prior, candidate);
      if (replaces) best.set(key, { ...candidate, exercise: name });
    }
  }

  return [...best.entries()].map(([baselineKey, c]) => ({
    baselineKey, weight: c.weight, reps: c.reps, exercise: c.exercise,
  }));
}
