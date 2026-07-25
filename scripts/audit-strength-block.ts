// Get Stronger block audit — runs the REAL functions over a full 12-week block and prints
// every authored weight + target RIR, week by week, for a range of athlete strength levels.
// Purpose: check the LOAD math and the RIR math hold for the entire run, not just week 1.
// Run: deno run --allow-read scratchpad/gs-block-audit.ts   (from repo root)

import { composeStrengthPrimaryPlan } from '../supabase/functions/shared/strength-system/strength-primary-plan.ts';
import { calculatePrescribedWeight, getExerciseConfig } from '../src/lib/exercise-config.ts';
import { resolveProfile, getTargetRir } from '../supabase/functions/_shared/strength-profiles.ts';

type Athlete = { label: string; squat: number; bench: number; deadlift: number; overheadPress1RM: number; pullupMaxReps: number };

const ATHLETES: Athlete[] = [
  { label: 'STRONG   (S225/B185/D275/O125)', squat: 225, bench: 185, deadlift: 275, overheadPress1RM: 125, pullupMaxReps: 12 },
  { label: 'TYPICAL  (S185/B150/D225/O105)', squat: 185, bench: 150, deadlift: 225, overheadPress1RM: 105, pullupMaxReps: 8 },
  { label: 'LIGHT    (S135/B105/D165/O75) ', squat: 135, bench: 105, deadlift: 165, overheadPress1RM: 75, pullupMaxReps: 4 },
  { label: 'NOVICE   (S95/B75/D135/O55)  ', squat: 95, bench: 75, deadlift: 135, overheadPress1RM: 55, pullupMaxReps: 1 },
];

const profile = resolveProfile('strength_primary');

function phaseOfWeek(plan: any, week: number): string {
  const p = plan.phaseStructure.phases.find((x: any) => week >= x.start_week && week <= x.end_week);
  return p?.name ?? '?';
}

for (const a of ATHLETES) {
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 12, strengthFrequency: 4, tier: 'barbell',
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20, easyPaceMinPerMile: 9,
  });

  console.log('\n' + '='.repeat(110));
  console.log(a.label);
  console.log('='.repeat(110));

  // Track the resolved lb per lift per week so we can see repeats / jumps.
  const series: Record<string, Array<{ wk: number; phase: string; pct: number | null; reps: any; lb: number | null; rir: number }>> = {};

  for (let wk = 1; wk <= 12; wk++) {
    const phase = phaseOfWeek(plan, wk);
    const sessions = (plan.sessions_by_week[String(wk)] ?? []).filter((s: any) => s.type === 'strength');
    for (const s of sessions) {
      for (const ex of (s.strength_exercises ?? [])) {
        const cfg = getExerciseConfig(ex.name);
        const isBw = cfg?.displayFormat === 'bodyweight' || cfg?.displayFormat === 'band';
        const m = String(ex.weight ?? '').match(/([0-9.]+)\s*%/);
        const pct = m ? parseFloat(m[1]) / 100 : null;

        let lb: number | null = null;
        if (!isBw && pct != null) {
          // strength_primary passes applyRepScale = false (the composer owns the ramp)
          const r = calculatePrescribedWeight(ex.name, pct, a as any, Number(ex.reps) || undefined, false);
          lb = r.weight;
        }

        const repsNum = typeof ex.reps === 'number' ? ex.reps : (Number.parseInt(String(ex.reps ?? ''), 10) || null);
        const rir = getTargetRir(
          profile, String(ex.name), null, phase, repsNum, pct,
          isBw && /pull\s*up|chin\s*up/i.test(ex.name) ? a.pullupMaxReps : null,
        );

        (series[ex.name] ??= []).push({ wk, phase, pct, reps: ex.reps, lb, rir });
      }
    }
  }

  for (const [lift, rows] of Object.entries(series)) {
    const cfg = getExerciseConfig(lift);
    const tag = cfg?.displayFormat === 'bodyweight' ? ' [bodyweight]' : '';
    console.log(`\n  ${lift}${tag}`);
    let prevLb: number | null = null;
    let repeats = 0;
    const line: string[] = [];
    for (const r of rows) {
      const same = prevLb != null && r.lb != null && r.lb === prevLb;
      if (same) repeats++;
      const w = r.lb == null ? '  BW' : `${String(r.lb).padStart(4)}`;
      line.push(`w${String(r.wk).padStart(2)} ${r.phase.slice(0, 4).padEnd(4)} ${r.pct != null ? (r.pct * 100).toFixed(1).padStart(5) + '%' : '     -'} ${String(r.reps).padStart(5)}r ${w}lb RIR${String(r.rir).padStart(4)}${same ? ' <-SAME' : ''}`);
      prevLb = r.lb;
    }
    for (const l of line) console.log('    ' + l);
    if (repeats > 0) console.log(`    >> ${repeats} week(s) with NO load change from the prior week`);
  }
}
