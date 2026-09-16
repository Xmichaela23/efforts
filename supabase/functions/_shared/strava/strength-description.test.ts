import { assertEquals } from 'jsr:@std/assert@1';
import { buildDescription, parseExercises, shareBody } from './strength-description.ts';
import { completedStrengthVolume } from '../strength/session-volume.ts';

const done = (weight: number | null, reps: number | null, extra: Record<string, unknown> = {}) =>
  ({ weight, reps, completed: true, ...extra });

Deno.test('a loaded lift prints weight x reps, one line per exercise', () => {
  const out = buildDescription([
    { name: 'Barbell Row', unit: 'lb', sets: [done(95, 5), done(95, 5), done(75, 5)] },
    { name: 'Tate Press', unit: 'lb', sets: [done(35, 12), done(35, 12)] },
  ]);
  assertEquals(out, 'Barbell Row  95 lb x 5, 95 lb x 5, 75 lb x 5\nTate Press  35 lb x 12, 35 lb x 12');
});

Deno.test('an untouched prefill never reaches the feed', () => {
  // The prescription the athlete never engaged: prefilled, not completed. It carries reps and weight,
  // which is exactly why a naive filter would post it as though it were done.
  const out = buildDescription([
    { name: 'Back Squat', unit: 'lb', sets: [done(135, 5), { weight: 155, reps: 5, prefilled: true, completed: false }] },
  ]);
  assertEquals(out, 'Back Squat  135 lb x 5');
});

Deno.test('bodyweight and timed work still count, each in its own shape', () => {
  const out = buildDescription([
    { name: 'Pull Up', unit: 'lb', sets: [done(0, 7), done(null, 5)] },
    { name: 'Farmers Carry', unit: 'lb', sets: [done(0, 0, { duration_seconds: 45 })] },
  ]);
  assertEquals(out, 'Pull Up  7 reps, 5 reps\nFarmers Carry  45s');
});

Deno.test('an exercise with nothing performed is omitted entirely', () => {
  const out = buildDescription([
    { name: 'Drag Curl', unit: 'lb', sets: [{ weight: 25, reps: 6, prefilled: true, completed: false }] },
    { name: 'Bench Press', unit: 'lb', sets: [done(160, 3)] },
  ]);
  assertEquals(out, 'Bench Press  160 lb x 3');
});

Deno.test('§8.0 #32: one volume — kilogram sets convert, a weighted chin-up counts the body too', () => {
  // 60 kg × 5 = 300 kg = 661 lb; 160 lb × 3 = 480 lb. One total, in pounds.
  assertEquals(
    completedStrengthVolume([
      { name: 'Front Squat', unit: 'kg', sets: [done(60, 5)] },
      { name: 'Bench Press', unit: 'lb', sets: [done(160, 3)] },
    ], null).completed_total_lb,
    Math.round(60 * (1 / 0.45359237) * 5) + 480,
  );
  // The three assisted movements price (body weight + added) × reps — the rule Performance and Today print.
  assertEquals(completedStrengthVolume([{ name: 'Chin Up', unit: 'lb', sets: [done(25, 8)] }], 170).completed_total_lb, (170 + 25) * 8);
  // The kilograms are no longer kept apart in a second line: the description still prints them per set.
  assertEquals(buildDescription([{ name: 'Front Squat', unit: 'kg', sets: [done(60, 5)] }]), 'Front Squat  60 kg x 5');
});

Deno.test('volume counts only performed sets', () => {
  assertEquals(
    completedStrengthVolume([{ name: 'Back Squat', unit: 'lb', sets: [done(135, 5), { weight: 155, reps: 5, prefilled: true, completed: false }] }], null).completed_total_lb,
    675,
  );
});

Deno.test('the posted body carries the lifts, the weight moved and where it came from', () => {
  const exs = [{ name: 'Bench Press', unit: 'lb', sets: [done(160, 5), done(160, 5)] }];
  const body = shareBody(exs, completedStrengthVolume(exs, null).completed_total_lb);
  assertEquals(body, 'Bench Press  160 lb x 5, 160 lb x 5\n\n1,600 lb moved\nLogged in Efforts · efforts.work');
});

Deno.test('a session with no performed set produces no body — the caller refuses to post', () => {
  assertEquals(shareBody([{ name: 'Bench Press', unit: 'lb', sets: [{ weight: 160, reps: 5, prefilled: true }] }]), '');
  assertEquals(shareBody([]), '');
});

Deno.test('strength_exercises parses from both an array and a string', () => {
  assertEquals(parseExercises([{ name: 'A' }]).length, 1);
  assertEquals(parseExercises('[{"name":"A"}]').length, 1);
  assertEquals(parseExercises('not json').length, 0);
  assertEquals(parseExercises(null).length, 0);
});
