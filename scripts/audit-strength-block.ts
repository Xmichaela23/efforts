// STRENGTH FOCUS block audit — runs the REAL composer over a full 12-week block and prints every
// authored SET and its target effort, week by week, for a range of athlete strength levels.
//
// Purpose: check that the load math and the effort math hold for the WHOLE run, not just week 1.
// It reads the rows rather than re-deriving them — asserting from the formula instead of reading
// the row was the shape of every error in the 2026-07-24 audit.
//
// Run: ~/.deno/bin/deno run --allow-read scripts/audit-strength-block.ts
//
// ── What changed at the 5/3/1 rewrite ────────────────────────────────────────────────────────────
// The old version resolved a "% 1RM" string into pounds through `calculatePrescribedWeight`, and
// flagged weeks where the resolved load did not move. That was the right check for a percentage
// ramp. It is the wrong one now: under 5/3/1 the working number is FIXED for a whole four-week
// cycle, so weeks inside a cycle are SUPPOSED to differ only by the percentage, and the deload is
// supposed to drop. What matters instead is that each week's three sets ASCEND, that the cycle
// boundary steps the working number by +5 upper / +10 lower, and that no set lands above the
// athlete's real max. Those are the flags below.
import { composeStrengthPrimaryPlan } from '../supabase/functions/shared/strength-system/strength-primary-plan.ts';
import { getExerciseConfig } from '../src/lib/exercise-config.ts';
import { getTargetRir, resolveProfile } from '../supabase/functions/_shared/strength-profiles.ts';

type Athlete = { label: string; squat: number; bench: number; deadlift: number; overheadPress: number; pullupMaxReps: number };

const ATHLETES: Athlete[] = [
  { label: 'STRONG   (S225/B185/D275/O125)', squat: 225, bench: 185, deadlift: 275, overheadPress: 125, pullupMaxReps: 12 },
  { label: 'TYPICAL  (S185/B150/D225/O105)', squat: 185, bench: 150, deadlift: 225, overheadPress: 105, pullupMaxReps: 8 },
  { label: 'LIGHT    (S135/B105/D165/O75) ', squat: 135, bench: 105, deadlift: 165, overheadPress: 75, pullupMaxReps: 4 },
  // The bar-floor case, deliberately kept: an empty 45 lb bar is 82% of a 55 lb overhead press, so
  // every prescribed percentage below that is unloadable. The audit should make it visible.
  { label: 'NOVICE   (S95/B75/D135/O55)  ', squat: 95, bench: 75, deadlift: 135, overheadPress: 55, pullupMaxReps: 1 },
];

const profile = resolveProfile('strength_primary');
const EMPTY_BAR_LB = 45;

const MAIN_TO_REF: Record<string, keyof Athlete> = {
  'Bench Press': 'bench',
  'Back Squat': 'squat',
  'Overhead Press': 'overheadPress',
  'Deadlift': 'deadlift',
};

function phaseOfWeek(plan: any, week: number): string {
  const p = plan.phaseStructure.phases.find((x: any) => week >= x.start_week && week <= x.end_week);
  return p?.name ?? '?';
}

for (const a of ATHLETES) {
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 12,
    oneRepMaxes: { bench: a.bench, squat: a.squat, deadlift: a.deadlift, overheadPress: a.overheadPress },
    enduranceSport: 'run',
    enduranceFrequency: 3,
    targetWeeklyMiles: 20,
    easyPaceMinPerMile: 9,
  });

  console.log('\n' + '='.repeat(110));
  console.log(`${a.label}   working numbers: ${JSON.stringify(plan.training_max)}`);
  console.log('='.repeat(110));

  const series: Record<string, Array<{ wk: number; phase: string; sets: any[]; topPct: number | null; rir: number }>> = {};

  for (let wk = 1; wk <= plan.duration_weeks; wk++) {
    const phase = phaseOfWeek(plan, wk);
    for (const s of (plan.sessions_by_week[String(wk)] ?? []).filter((x: any) => x.type === 'strength')) {
      for (const ex of (s.strength_exercises ?? []) as any[]) {
        const cfg = getExerciseConfig(ex.name);
        const isBw = cfg?.displayFormat === 'bodyweight' || cfg?.displayFormat === 'band';
        const topPct = typeof ex.percent_1rm === 'number' ? ex.percent_1rm : null;
        const repsNum = typeof ex.reps === 'number' ? ex.reps : (Number.parseInt(String(ex.reps ?? ''), 10) || null);
        const rir = getTargetRir(
          profile, String(ex.name), null, phase, repsNum, topPct,
          isBw && /pull\s*up|chin\s*up/i.test(ex.name) ? a.pullupMaxReps : null,
        );
        (series[ex.name] ??= []).push({ wk, phase, sets: ex.set_plan ?? [], topPct, rir });
      }
    }
  }

  for (const [lift, rows] of Object.entries(series)) {
    const ref = MAIN_TO_REF[lift];
    const trueMax = ref ? (a[ref] as number) : null;
    console.log(`\n  ${lift}${ref ? '' : ' [assistance — bodyweight]'}`);
    const flags: string[] = [];
    for (const r of rows) {
      if (r.sets.length === 0) {
        console.log(`    w${String(r.wk).padStart(2)} ${r.phase.slice(0, 6).padEnd(6)} bodyweight            RIR ${r.rir}`);
        continue;
      }
      const label = r.sets.map((s: any) => `${String(s.weight).padStart(3)}×${s.reps}${s.amrap ? '+' : ' '}`).join('  ');
      const pct = r.topPct != null ? `${(r.topPct * 100).toFixed(1).padStart(5)}%` : '     -';
      console.log(`    w${String(r.wk).padStart(2)} ${r.phase.slice(0, 6).padEnd(6)} ${label}   top ${pct} of max   RIR ${r.rir}`);

      // ── The flags that actually matter under a fixed working number ──────────────────────────
      const weights = r.sets.map((s: any) => Number(s.weight));
      if (!weights.every((w, i) => i === 0 || w > weights[i - 1])) {
        flags.push(`w${r.wk}: the three sets do not ascend (${weights.join(' / ')})`);
      }
      if (trueMax != null && weights.some((w) => w > trueMax)) {
        flags.push(`w${r.wk}: a prescribed set is ABOVE the athlete's real max of ${trueMax}`);
      }
      if (trueMax != null && weights.some((w) => w < EMPTY_BAR_LB)) {
        // Not a bug in the loading — a hardware fact. It needs the dumbbell branch, not a different
        // percentage. Flagged rather than silently rounded up to the bar.
        flags.push(`w${r.wk}: BAR FLOOR — a set is below the empty ${EMPTY_BAR_LB} lb bar (${weights.filter((w) => w < EMPTY_BAR_LB).join(', ')})`);
      }
    }
    if (ref) {
      // The cycle boundary: weeks 1 → 5 → 9 are the same percentage at a stepped working number.
      const opens = [1, 5, 9].map((wk) => rows.find((r) => r.wk === wk)?.sets?.[0]?.weight).filter((w) => w != null);
      const isLower = lift === 'Back Squat' || lift === 'Deadlift';
      console.log(`    cycle openers (w1 / w5 / w9): ${opens.join(' → ')}   expected step: +${isLower ? 10 : 5} lb per cycle on the working number`);
    }
    for (const f of flags) console.log(`    >> ${f}`);
    if (flags.length === 0 && ref) console.log('    >> clean');
  }
}
