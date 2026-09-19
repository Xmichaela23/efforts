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

// ── Pass 2: the OFF lines, in the page's words ──────────────────────────────────────────────────

import { buildEnduranceSession } from './endurance-library/index.ts';
import { translateEnduranceSession } from './standing-plan/session-vocabulary.ts';
import { familyLineFor, RACE_TEMPO_LINE } from './standing-plan/family-lines.ts';

const ANCHORS: any = {
  run: { sport: 'run', value: 480, unit: 'sec_per_mi', source: 't', isEstimate: false, vt1SecPerMi: 600, easyRangeSecPerMi: { lo: 547, hi: 619 } },
  ride: { sport: 'ride', value: 250, unit: 'watts', source: 't', isEstimate: false },
  swim: { sport: 'swim', value: 120, unit: 'sec_per_100m', source: 't', isEstimate: false },
};
const BASE: any = { ftp: 250, _resolvedThresholdSecPerMi: 480, _resolvedEasySecPerMi: 583, _resolvedEasyRange: { lo: 547, hi: 619 }, _anchors: { ftp_w: 250 } };
const built = (family: string, level: 1 | 2 | 3, archetype: string, opts?: { raceTempo?: boolean }) => {
  const t = translateEnduranceSession(buildEnduranceSession({ family, level, archetype, size: 0.5, anchors: ANCHORS } as any) as any, opts);
  const row = { ...t, id: 'x', date: '2026-09-21' };
  const v3 = expandTokensForRow(row, BASE).steps.map((s: any, i: number) => toV3Step({ ...s, planned_index: i }, row));
  const fam = (t.tags as string[]).find((x) => x.startsWith('family:'))!.slice(7);
  return { row, v3, lines: plannedStepLines(v3, { sport: t.type, family: fam }) };
};

Deno.test('each family line is the page\'s own words (p231, p233, p235, p237, p238, p239)', () => {
  assertEquals(familyLineFor('run_mlss'), 'Workouts that emphasize time spent in zone 4. The objective is accruing maximum time with equalized fatigue.');
  assertEquals(familyLineFor('run_near_threshold'), 'Workouts that maximize time near-threshold (NT)—whether shorter above-threshold intervals or longer below-threshold intervals. These are designed to maximize total time spent at this intensity while controlling fatigue.');
  assertEquals(familyLineFor('ride_sweet_spot'), 'These workouts are intended to push you as close as possible to threshold without exceeding it, giving you plenty of time in the zone with far less fatigue than you would experience riding at or above.');
  assertEquals(familyLineFor('ride_endurance', 'steady'), 'Easy ride below 75%.');
  assert(familyLineFor('ride_anaerobic', 'progressive_repeats')!.endsWith('Each set should start at 110% and progress up to 125–130% by the end.'));
  // The flat anaerobic rides do not carry the progressive option's sentence.
  assert(!familyLineFor('ride_anaerobic', 'one_to_one')!.includes('Each set'));
  assertEquals(RACE_TEMPO_LINE, 'Increase the pace here to race pace, but extend recovery periods by 25 percent.');
});

Deno.test('a rest the page names prints the page\'s word and no pace: MLSS "recovery walk/jog between sets" (p232)', () => {
  const { lines } = built('run_mlss', 2, 'surge_float');
  assert(lines.some((l) => l.includes('2:00 recovery walk/jog between sets')), lines.join(' | '));
});

Deno.test('the ride sprint prints p236\'s "max effort" and its recovery word, and sends them to Intervals.icu', () => {
  const { row, v3, lines } = built('ride_sprints', 1, 'max_effort');
  assert(lines.some((l) => /max effort sprints where you try to beat your last effort/.test(l) && /recovery between/.test(l)), lines.join(' | '));
  const ev = serializeRide({ ...row, computed: { steps: v3, anchors: { ftp_w: 250 } } } as any);
  assert(ev.description.includes('- max effort sprints where you try to beat your last effort 2m freeride'), ev.description);
});

Deno.test('the level 1 swim is p241\'s: 200 m, three 50s, two 600s, in the page\'s words', () => {
  const { v3 } = built('swim_endurance', 1, 'long_repeats');
  const work = v3.filter((s: any) => s.kind !== 'recovery');
  assertEquals(work.map((s: any) => s.distanceMeters), [200, 50, 50, 50, 600, 600]);
  assertEquals(work[work.length - 1].label, 'easy-to-moderate intensity (race pace)');
});

// ── Pass 3: the lines on no page, off ───────────────────────────────────────────────────────────

import { swappedSessionBlock } from './session-swap/swap.ts';
import { hardCardLabel } from '../../../src/lib/preview-week-read.ts';

Deno.test('the swapped row and the builder card say what the app did, and nothing no page says', () => {
  const b = swappedSessionBlock({ type: 'ride', tags: ['swapped_from:run'] } as any);
  assert(!/same effort/i.test(b.note), b.note);
  assertEquals(hardCardLabel('run', null, 'run_mlss', 'top-end'), 'Hard run');
  assertEquals(hardCardLabel('bike', null, 'ride_sweet_spot', 'threshold'), 'Hard ride');
});

// ── Pass 4: the page's warm-ups, the race tempo, the p278 week, run notes on the watch ────────────

import { composeWeek } from './standing-plan/compose.ts';
import { FRAMES } from './standing-plan/frames.ts';

Deno.test('the run\'s warm-up box reaches the row and the watch line by line: jog, lunges, Cossack squats (p233)', () => {
  const { row, v3, lines } = built('run_near_threshold', 1, 'below_threshold');
  assertEquals(lines.slice(0, 3), [
    '10:00 warm-up · 10-minute easy jog',
    'warm-up · 3 sets of 20m walking lunges',
    'warm-up · 2 sets of 10 (per side) Cossack squats',
  ]);
  assertEquals(lines[lines.length - 1], '8:00 cool-down · 8-minute easy jog');
  const g = garminSteps({ ...row, computed: { steps: v3 } });
  const lunges = g.find((s: any) => /walking lunges/.test(String(s.description)));
  assertEquals(lunges?.durationType, 'OPEN');
  // No easy pace the page does not print on the jog.
  assert(!/easy pace/.test(lines[0]), lines[0]);
});

Deno.test('the VO2 ride\'s warm-up is p238\'s three lines, the middle one at 95%, not one 55–70% block', () => {
  const { row, v3, lines } = built('ride_vo2', 1, 'long_vo2');
  assertEquals(lines.slice(0, 3), [
    '15:00 warm-up · 15-minute easy spin',
    '5:00 warm-up · 214–261 W · 5 minutes @ 95%',
    '5:00 warm-up · 5-minute easy spin',
  ]);
  const ev = serializeRide({ ...row, computed: { steps: v3, anchors: { ftp_w: 250 } } } as any);
  assert(ev.description.includes('5 minutes @ 95%\n- Warmup 5m 86-104%'), ev.description);
  assert(!/55-70%/.test(ev.description), ev.description);
});

Deno.test('the race-tempo row runs at race pace with its recoveries a quarter longer (p247)', () => {
  const { row, lines } = built('run_near_threshold', 1, 'below_threshold', { raceTempo: true });
  assert((row.steps_preset as string[]).some((t) => /racepace-r75svt1/.test(t)), JSON.stringify(row.steps_preset));
  assert(lines.some((l) => l.startsWith('5 × 3:30 race pace, 1:15')), lines.join(' | '));
});

Deno.test('Ride + Strength\'s standard week is p278\'s Standard column: seven rides, the long ride at level 2', () => {
  const std = FRAMES.cycling_base.columns.standard.flatMap((d) => d.endurance.map((e) => `${d.day}:${e.family}:${e.level}`));
  assertEquals(std, ['1:ride_sweet_spot:1', '2:ride_endurance:1', '3:ride_vo2:1', '3:ride_sweet_spot:1', '5:ride_endurance:1', '5:ride_sprints:1', '6:ride_endurance:2']);
  const taper = FRAMES.cycling_base.columns.taper.flatMap((d) => d.endurance.map((e) => `${d.day}:${e.family}:${e.level}`));
  assertEquals(taper, ['1:ride_sweet_spot:1', '2:ride_endurance:1', '3:ride_vo2:1', '5:ride_sprints:1', '6:ride_endurance:1']);
});

Deno.test('a run\'s session note reaches the watch, as a ride\'s does', () => {
  const { row, v3 } = built('run_vt1', 1, 'continuous');
  const g = convertWorkoutToGarmin({ ...row, computed: { steps: v3 } } as any);
  assert(/talk test/.test(String((g as any).description)), JSON.stringify((g as any).description));
});

// ── Pass 5: what the page gives that the app did not show ────────────────────────────────────────

Deno.test('p235\'s long run with inserted sets builds the page\'s sets: level 2 is 2 sets of 2 rounds of 1:30 @ 115% / 30 s', () => {
  const { row } = built('run_lsd', 2, 'long_with_inserts');
  const sets = (row.steps_preset as string[]).filter((t) => t.startsWith('round_'));
  assertEquals(sets, ['round_2x_90s115-r30svt1', 'round_2x_90s115-r30svt1']);
});

Deno.test('p235\'s race-pace finish carries its 95% interval in the middle at levels 2 and 3', () => {
  const t2 = built('run_lsd', 2, 'race_pace_finish').row.steps_preset as string[];
  assert(t2.includes('round_1x_300s95') && t2[t2.length - 1] === 'round_1x_600sracepace', JSON.stringify(t2));
});

Deno.test('p235\'s fartlek is 6 efforts, not offered at level 1', () => {
  const t2 = built('run_lsd', 2, 'fartlek').row.steps_preset as string[];
  assertEquals(t2.filter((t) => t === 'round_1x_180s85').length, 6);
  let threw = false;
  try { built('run_lsd', 1, 'fartlek'); } catch { threw = true; }
  assert(threw, 'a level-1 fartlek was built; p235 prints none');
});

Deno.test('the VO2 ride prints p238\'s line; the easy and long runs print p235\'s own second sentences', () => {
  assert(String(familyLineFor('ride_vo2')).startsWith('These workouts are intended to push your maximum aerobic intake'));
  assert(String(built('run_vt1', 1, 'continuous').row.description).includes('may vary slightly depending on current level of fatigue'));
  assert(String(built('run_lsd', 2, 'hike').row.description).includes('can be modified extensively'));
});

Deno.test('the page\'s percentages in a ride\'s line are never read as its warm-up\'s power (p237 "125–130%")', () => {
  const { v3, lines } = built('ride_anaerobic', 2, 'progressive_repeats');
  assertEquals(v3[0].kind, 'warmup');
  assertEquals(v3[0].powerRange, undefined);
  assertEquals(lines[0], '12:30 warm-up · 10- to 15-minute easy spin');
});
