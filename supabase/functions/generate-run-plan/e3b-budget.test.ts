// E3b Part 1 — the hours budget sizes the week, but only within RUN-PROTOCOL's shape rules:
// easy runs 3–5mi (§5.2) on ≤3 day-slots (Mon/Wed/Fri), long run distance-precise. Budget beyond
// what a LEGAL week holds is surfaced glass-box (volume_notes), never crammed.
// Run: ~/.deno/bin/deno test --allow-read --no-check supabase/functions/generate-run-plan/e3b-budget.test.ts
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { SustainableGenerator } from './generators/sustainable.ts';

const base = {
  distance: 'half', fitness: 'intermediate', goal: 'complete',
  duration_weeks: 12, days_per_week: '4-5', user_id: 'test', terminalShape: 'retest', vdot: 50,
} as const;

type S = { description?: string; tags?: string[] };
function makePlan(extra: Record<string, unknown>) {
  const g = new SustainableGenerator({ ...base, ...extra } as never);
  return (g as unknown as { generatePlan(): { sessions_by_week: Record<string, S[]>; volume_notes?: string[] } }).generatePlan();
}
const runsOf = (ss: S[]) => ss.filter((s) => !(s.tags ?? []).includes('strength'));
const milesOf = (s: S) => { const m = (s.description ?? '').match(/^(\d+(?:\.\d+)?)\s*miles/); return m ? +m[1] : 0; };
const weekMiles = (p: ReturnType<typeof makePlan>, wk = '1') => runsOf(p.sessions_by_week[wk] ?? []).reduce((a, s) => a + milesOf(s), 0);
const runCount = (p: ReturnType<typeof makePlan>, wk = '1') => runsOf(p.sessions_by_week[wk] ?? []).length;

Deno.test('E3b: budget scales the week BELOW the legal cap (2hr < 3hr)', () => {
  assert(weekMiles(makePlan({ weekly_hours: 2 })) < weekMiles(makePlan({ weekly_hours: 3 })), 'more hours → more miles, until the legal week caps it');
});

// ── REQUIRED #1 — under-utilization: budget over the legal week is SURFACED, not crammed ──
Deno.test('E3b: budget beyond a legal week → glass-box note, week capped, NOT crammed', () => {
  const p5 = makePlan({ weekly_hours: 5 });
  const p8 = makePlan({ weekly_hours: 8 });
  // 5hr & 8hr both exceed what a legal 4-day base week holds → both surface a note
  assert((p5.volume_notes ?? []).length > 0, '5hr over the legal week must be surfaced');
  assert((p8.volume_notes ?? []).length > 0, '8hr over the legal week must be surfaced');
  // and both land at the SAME legal-max week (the extra budget is NOT crammed into bigger runs)
  assert(weekMiles(p8) === weekMiles(p5), 'over-cap budgets do not grow the week — excess is surfaced, not crammed');
});

// ── REQUIRED #2 — no session violates its RUN-PROTOCOL bound ──
Deno.test('E3b: every session within its protocol bound (easy 3–5mi §5.2; long ≤ per-distance peak)', () => {
  for (const hrs of [2, 3, 5, 8]) {
    const p = makePlan({ weekly_hours: hrs });
    for (const wk of Object.keys(p.sessions_by_week)) {
      for (const s of runsOf(p.sessions_by_week[wk])) {
        const mi = milesOf(s);
        const tags = s.tags ?? [];
        if (tags.includes('long_run')) {
          assert(mi <= 13.5, `long run ${mi}mi exceeds the half peak (13) at ${hrs}hr/wk${wk}`);
        } else if (tags.includes('easy_run')) {
          assert(mi >= 3 && mi <= 5, `easy run ${mi}mi outside RUN-PROTOCOL §5.2 [3,5] at ${hrs}hr/wk${wk}`);
        }
      }
    }
  }
});

Deno.test('E3b: tiny budget — long run alone overruns it → kept, week minimal, surfaced', () => {
  const p = makePlan({ weekly_hours: 1 }); // ~7.6mi budget; base long run ~8.5mi alone exceeds it
  assert(runCount(p) <= 2, 'tiny budget → long run (+ maybe one) only');
  assert((p.volume_notes ?? []).some((n) => /long run/i.test(n)), 'long-run-over-budget must be surfaced');
});

Deno.test('E3b: NO budget → legacy path, no volume_notes (races/no-budget byte-identical by construction)', () => {
  const p = makePlan({});
  assert(weekMiles(p) > 0, 'legacy path still builds a week');
  assert(!p.volume_notes, 'no budget → no reconciliation notes (legacy path untouched)');
});
