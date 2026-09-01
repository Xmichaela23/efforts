// ============================================================================
// THE BLOCK PRINTER — compose a whole block with the REAL composer and print every row.
//
// ⛔ THE MODULE. `scripts/print-block.ts` is the CLI over it and `golden-block.test.ts` is the
// enforcement — both import from here, so the file that is checked and the file that is written
// can never be produced by two different printers.
//
//   ~/.deno/bin/deno run --allow-read --allow-write scripts/print-block.ts --write
//
// ⛔⛔ WHY THIS EXISTS, AND IT IS NOT A DEBUG SCRIPT. Two failure modes cost this project more time
// than any defect:
//
//   1. **A session reports a hole that is not one.** "Week 2 has no weight", "week 2 looks the same
//      as week 1", "progression is flat" — every one of those is a correct state being read as a
//      defect, because nothing showed what correct looks like.
//   2. **A change quietly moves forty other rows.** The ab row that landed second from last passed
//      2541 tests. A green suite says a rule you pinned still holds; it says nothing about the rows
//      you never thought to pin.
//
// ⛔ THE OUTPUT IS COMMITTED (`golden/`), so every change to the composer arrives as a DIFF a human
// can read. That is the whole point: the answer to "is this a hole?" stops being an argument and
// becomes `git diff`.
//
// ⚠️ THE ARCHETYPES ARE NOT ANY REAL ATHLETE, deliberately. They are three shapes of input that
// exercise different halves of the engine — a kit that reaches machines and one that does not, an
// athlete with tested numbers and one with none. Never tune them to one person's figures.
// ============================================================================

import { composeBlock, type ComposedWeek, type PlanSession, type StrengthExercise }
  from './compose.ts';
import type { WorkingNumber } from './working-number.ts';

const WEEKS = 12;

/** ⛔ A tested lift as the reader stores it. Fixed figures — the archetype's, not an athlete's. */
const tested = (lift: string, oneRm: number, weight: number, reps: number): WorkingNumber => ({
  lift: lift as WorkingNumber['lift'],
  predicted1RM: oneRm,
  workingNumber: oneRm * 0.96,
  measured: { weight, reps },
  cite: 'archetype fixture',
});

export type Archetype = {
  key: string;
  title: string;
  /** What this archetype is FOR — printed at the top of its golden file. */
  exercises: string;
  args: Record<string, unknown>;
};

export const ARCHETYPES: Archetype[] = [
  {
    key: 'home-barbell',
    title: 'HOME BARBELL — tested, no machines, no incline bench',
    exercises:
      'The common case, and the one where the gear gate bites: every braced cell has to reach a\n'
      + 'substitute, and a band route is satisfiable while a cable route is not. Tested numbers are on\n'
      + 'file, so every priced row shows its weight.',
    args: {
      frame: 'all_rounder',
      competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
      seed1RMs: { bench: 150, squat: 185, deadlift: 225, overheadPress: 100 },
      workingNumbers: {
        bench: tested('bench', 155, 130, 7),
        squat: tested('squat', 190, 165, 5),
        deadlift: tested('deadlift', 230, 200, 5),
        overheadPress: tested('overheadPress', 105, 85, 8),
      },
      equipment: ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)',
        'Pull-up bar', 'Resistance bands', 'Ab wheel'],
      roundTo: 5,
      enduranceExperience: { run: 'experienced' },
      targetRunHours: 3,
    },
  },
  {
    key: 'commercial-gym',
    title: 'COMMERCIAL GYM — tested, every machine reachable, core chosen',
    exercises:
      'The other end of the gear gate: the braced cells resolve to the movements the page actually\n'
      + 'prints, so this file is the closest thing to the programme as written. It also carries a CORE\n'
      + 'pick, which is the only row on the week that no page prints.',
    args: {
      frame: 'all_rounder',
      competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
      seed1RMs: { bench: 225, squat: 300, deadlift: 365, overheadPress: 145 },
      workingNumbers: {
        bench: tested('bench', 235, 200, 6),
        squat: tested('squat', 315, 265, 6),
        deadlift: tested('deadlift', 375, 315, 6),
        overheadPress: tested('overheadPress', 150, 125, 6),
      },
      equipment: ['Commercial gym'],
      roundTo: 5,
      slotPicks: { core: 'hanging leg raise' },
      enduranceExperience: { run: 'experienced', ride: 'experienced' },
      sportMix: { run: 2, ride: 2 },
      targetRunHours: 3,
      targetRideHours: 4,
    },
  },
  {
    key: 'untested-minimal',
    title: 'UNTESTED, MINIMAL KIT — no maxes on file, barbell and a bench',
    exercises:
      'The athlete the engine must not price. No working numbers, so every top set is BY FEEL and the\n'
      + 'test week runs on instruction rather than on weights — this file is what "correct and empty"\n'
      + 'looks like, which is the state most often reported as a hole.',
    args: {
      frame: 'all_rounder',
      competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
      equipment: ['Barbell + plates', 'Squat rack / Power cage', 'Bench (flat/adjustable)'],
      roundTo: 5,
      enduranceExperience: { run: 'newer' },
      targetRunHours: 2,
    },
  },
];

// ── printing ────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ ONE ROW PER LINE, FIXED WIDTHS, NOTHING DERIVED AT PRINT TIME. A diff is only readable if a
// one-row change touches one line, and only trustworthy if the printer computes nothing of its own.

const pad = (s: unknown, n: number) => String(s ?? '').padEnd(n);

function printRow(e: StrengthExercise): string {
  const weight = typeof e.weight === 'number' ? `${e.weight}` : String(e.weight ?? '');
  const bits = [
    `      ${pad(e.slot_intent ?? '-', 6)}`,
    pad(e.name, 30),
    pad(`${e.sets ?? '-'}x${e.reps ?? '-'}`, 12),
    pad(`@ ${weight}`, 14),
  ];
  const tail: string[] = [];
  if (e.percent_1rm != null) tail.push(`${Math.round(e.percent_1rm * 100)}%`);
  if (e.target_rir != null) tail.push(`RIR ${e.target_rir}`);
  if (e.load_basis) tail.push(e.load_basis);
  if (e.execution_name) tail.push(`shown as "${e.execution_name}"`);
  if (Array.isArray(e.set_plan) && e.set_plan.length > 0) {
    tail.push(`plan ${e.set_plan.map((s) => `${s.weight}${s.warmup ? 'w' : ''}${s.amrap ? '+' : ''}x${s.reps ?? ''}`).join(' ')}`);
  }
  if (e.notes) tail.push(`note: ${e.notes}`);
  return (bits.join(' ') + (tail.length ? `  | ${tail.join(' · ')}` : '')).trimEnd();
}

function printSession(s: PlanSession): string[] {
  if (s.type !== 'strength') {
    return [`  [${s.day}] ${pad(s.type, 8)} ${s.name}${s.duration ? ` — ${s.duration} min` : ''}`];
  }
  const out = [`  [${s.day}] STRENGTH ${s.name}${s.cite ? `   (${s.cite})` : ''}`];
  if (Array.isArray(s.tags) && s.tags.length) out.push(`      tags: ${s.tags.join(', ')}`);
  for (const e of s.strength_exercises ?? []) out.push(printRow(e));
  return out;
}

function printWeek(w: ComposedWeek): string[] {
  const out = [
    '',
    `WEEK ${String(w.week).padStart(2, '0')}  column=${w.column}${w.isTestWeek ? '  ⟵ TEST WEEK' : ''}`,
    '-'.repeat(100),
  ];
  for (const s of w.sessions) out.push(...printSession(s));
  if (w.notes?.length) {
    out.push('  NOTES');
    for (const n of w.notes) out.push(`      [${pad(n.kind, 8)}] ${n.text}${n.cite ? `  (${n.cite})` : ''}`);
  }
  return out;
}

export function render(a: Archetype): string {
  const weeks = composeBlock({ ...a.args, weeks: WEEKS, taperWeeks: [] } as never);
  const head = [
    '='.repeat(100),
    `GOLDEN BLOCK — ${a.title}`,
    '='.repeat(100),
    '',
    a.exercises,
    '',
    '⛔ GENERATED. Do not hand-edit. Regenerate with:',
    '     ~/.deno/bin/deno run --allow-read --allow-write scripts/print-block.ts --write',
    '⛔ A DIFF HERE IS THE POINT. If a change to the composer moves a row you did not intend to move,',
    '   it shows up in this file before it shows up on an athlete\'s phone.',
    '',
    `INPUTS: ${JSON.stringify(a.args)}`,
  ];
  return [...head, ...weeks.flatMap(printWeek), ''].join('\n');
}


/** Where the committed output lives, resolved from THIS file so both callers agree. */
export const goldenPath = (key: string) => new URL(`./golden/${key}.txt`, import.meta.url);
