/**
 * THE BOOK-LANGUAGE FIX, ENDURANCE HALF (2026-09-18) — pins for docs/BOOK-LANGUAGE-FIX-endurance-2026-09-18.md.
 * Each prescription is written once and every screen and send reads it; each line is the page's words.
 *
 * Run: deno test --no-check -A supabase/functions/_shared/book-language-endurance.test.ts
 * Athlete-agnostic: synthetic numbers.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ftpTestRow, ftpTestSteps, runTestSteps, runThresholdTestRow } from './baseline-test-rows.ts';
import { buildAssessmentSteps, expandTokensForRow, toV3Step } from '../materialize-plan/index.ts';
import { plannedStepLines } from './planned-step-lines.ts';
import { serializeRide } from './intervals/serialize.ts';
import { convertWorkoutToGarmin } from './garmin/convert-workout.ts';
import { sessionTitle } from './session-title.ts';

const v3Of = (row: any) => {
  const steps = buildAssessmentSteps(row.tags, row.steps_preset);
  return steps.map((s: any, i: number) => toV3Step({ ...s, planned_index: i }, row));
};
const garminSteps = (w: any) => convertWorkoutToGarmin(w).segments[0].steps as any[];

// ── Pass 1 · items 19 / 20: the two tests, one step list ─────────────────────────────────────────

Deno.test('the FTP test is built from p212 once: every reader gets the page\'s steps, never a 110–120% step', () => {
  const row = { ...ftpTestRow('2026-09-21'), id: 'ftp' };
  assert(row.tags.includes('assessment'), 'the FTP row no longer builds from the book steps');
  const v3 = v3Of(row);
  assertEquals(v3.map((s: any) => s.label), ftpTestSteps().map((s) => s.label));
  // p212: "3 x 1 minute … with 1-minute rest between each" — two rests for three efforts.
  assertEquals(v3.filter((s: any) => s.label === 'rest').length, 2);
  assert(v3.every((s: any) => s.powerRange == null), 'a step carries a power target the page does not print');
  // p212 step 7 is on the page: "5 to 10 minutes of easy recovery".
  assertEquals(v3[v3.length - 1].label, '5 to 10 minutes of easy recovery');
});

Deno.test('the FTP test reaches Intervals.icu: the page\'s numbers print above their steps instead of refusing the ride', () => {
  const row = { ...ftpTestRow('2026-09-21'), id: 'ftp' };
  const ev = serializeRide({ ...row, computed: { steps: v3Of(row), anchors: { ftp_w: 250 } } } as any);
  assert(ev.description.includes('high intensity. Push yourself at a 9/10 effort\n- 3m freeride'), ev.description);
});

Deno.test('the run test is p210 step for step: no cool-down, strides on the lap button, the trial in the page\'s words', () => {
  const row = { ...runThresholdTestRow('2026-09-21'), id: 'rt' };
  const v3 = v3Of(row);
  assertEquals(v3.map((s: any) => s.label), runTestSteps().map((s) => s.label));
  assert(!v3.some((s: any) => s.kind === 'cooldown'), 'p210 prints no cool-down');
  const strides = v3.filter((s: any) => /stride/.test(s.label));
  assertEquals(strides.length, 2);
  assert(strides.every((s: any) => s.lap_button === true && s.seconds == null));
  assertEquals(v3[v3.length - 1].seconds, 720);
  assert(!/even the whole way|all out and even/i.test(JSON.stringify(v3)));
  // The watch: the strides are lap-button steps with the page's words, never a one-second step.
  const g = garminSteps({ ...row, computed: { steps: v3 } });
  const gStrides = g.filter((s: any) => /stride/i.test(String(s.description)));
  assertEquals(gStrides.length, 2);
  assert(gStrides.every((s: any) => s.durationType === 'OPEN'), JSON.stringify(gStrides));
  // The step lines print the page's words.
  const lines = plannedStepLines(v3, { sport: 'run' });
  assert(lines[0].includes('An easy 6- to 8-minute jog to warm up'), lines[0]);
  assert(!/p210|p212/.test(row.description) && !/strap|flat route|even the whole way/.test(row.description));
});

// ── Pass 1 · item 29: one title ─────────────────────────────────────────────────────────────────

Deno.test('one server title: the book\'s intent words on a lifting day, the plain name upgraded on a bare ride', () => {
  assertEquals(sessionTitle({ name: 'ME: Upper', type: 'strength' }), 'Maximum Effort: Upper');
  assertEquals(sessionTitle({ name: 'Ride', type: 'ride', steps_preset: ['bike_endurance_60min'] }), 'Ride — Endurance');
  assertEquals(sessionTitle({ name: 'Anaerobic Ride', type: 'ride', steps_preset: ['bike_vo2_6x1min_R5min'] }), 'Anaerobic Ride');
});

// ── Pass 1 · item 31: the athlete's unit on every pace ──────────────────────────────────────────

Deno.test('a metric athlete reads every pace per kilometre, work steps included', () => {
  const lines = plannedStepLines([
    { kind: 'work', seconds: 240, pace_range: { lower: 470, upper: 490 } },
    { kind: 'recovery', seconds: 60, pace_range: { lower: 560, upper: 600 } },
    { kind: 'work', seconds: 240, pace_range: { lower: 470, upper: 490 } },
  ], { sport: 'run', units: 'metric' });
  assert(lines.every((l) => !/\/mi/.test(l)), lines.join(' | '));
  assert(lines.some((l) => /\/km/.test(l)), lines.join(' | '));
});

// ── Pass 1 · item 17: one easy-ride ceiling ─────────────────────────────────────────────────────

Deno.test('an easy ride step is 0 up to 75% of FTP on every row, with or without a family tag (p239)', () => {
  for (const tags of [['family:ride_endurance'], []]) {
    const { steps } = expandTokensForRow({ type: 'ride', steps_preset: ['bike_endurance_60min'], tags }, { ftp: 200 } as any);
    const w = steps.find((s: any) => s.kind === 'work');
    assertEquals(w.power_range, { lower: 0, upper: 150 });
  }
});
