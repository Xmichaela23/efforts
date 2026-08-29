/**
 * ⛔ GRADE-ADJUSTED PACE ON THE RUN SCREEN (2026-08-29).
 *
 * Run: deno test --no-check supabase/functions/_shared/session-detail/gap-row.test.ts
 *
 * The adjustment has driven the efficiency trend, the drift basis and the per-rep adherence badges
 * for months while the screen printed raw pace only — the app was grading him on a number it never
 * showed him. Strava prints GAP on every run; TrainingPeaks' efficiency read is normalized GRADED
 * pace over heart rate.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildSessionDetailV1 } from './build.ts';

function gapRow(type: string, paceSecPerMi: number | null, gapSecPerMi: number | null): string | null {
  const sd = buildSessionDetailV1({
    workoutId: 'w1', workoutDate: '2026-08-28', workoutType: type, workoutName: 'Morning Run',
    ledgerDay: null, actualSession: null, match: null, plannedSession: null,
    plannedRowRaw: null, completedStrengthExercises: null, bodyweightLb: null, observations: [],
    completedComputed: { overall: { avg_pace_s_per_mi: paceSecPerMi, avg_gap_s_per_mi: gapSecPerMi } },
    workoutAnalysis: null, narrativeText: null,
  } as any);
  const row = ((sd.analysis_details?.rows ?? []) as any[]).find((r: any) => r.label === 'Grade-adjusted pace');
  return row ? row.value : null;
}

Deno.test('a hilly run states both numbers and what the hills cost', () => {
  // 11:20/mi raw, 10:52/mi adjusted — 28s/mi of hill.
  assertEquals(gapRow('run', 680, 652), '10:52/mi · raw 11:20/mi — the hills cost you 28s/mi');
});

Deno.test('⛔ A NEARLY FLAT RUN STILL SHOWS IT — no difference threshold (Michael, 2026-08-29)', () => {
  // The struck governor withheld this row below 5s/mi. A 2s/mi difference is a real difference.
  assertEquals(gapRow('run', 680, 678), '11:18/mi · raw 11:20/mi — the hills cost you 2s/mi');
});

Deno.test('a genuinely flat run prints both numbers and claims no terrain', () => {
  assertEquals(gapRow('run', 680, 680), '11:20/mi · raw 11:20/mi');
});

Deno.test('a net-downhill run says the descents gave it back', () => {
  assertEquals(gapRow('run', 652, 680), '11:20/mi · raw 10:52/mi — the descents gave you 28s/mi');
});

Deno.test('⛔ RUN ONLY — a ride is answered in power, not grade', () => {
  assertEquals(gapRow('ride', 680, 652), null);
});

Deno.test('no adjusted number, no row — never a raw pace wearing the label', () => {
  assertEquals(gapRow('run', 680, null), null);
});
