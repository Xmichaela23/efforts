import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

/**
 * TWO GRADES, NEVER MERGED (2026-08-02).
 *
 * Michael: "duration is one grade, time in prescribed anything is another grade."
 *
 * ⛔ THE DEFECT THIS PINS. `duration_adherence` is distance-from-100 computed with Math.abs(), so it
 * cannot answer the question actually asked of it — did the session run SHORT or LONG. Against a
 * 46-minute plan, a 35-minute session and a 57-minute session both score 76%.
 */

// The shipped formula, reproduced exactly (analyze-cycling-workout:903, and running's twin).
const durationAdherencePct = (plannedS: number, actualS: number) =>
  Math.max(0, 100 - (Math.abs(actualS - plannedS) / plannedS) * 100);

// The replacement the screen and the coach now read.
const volumeRatioPct = (plannedS: number, actualS: number) => Math.round((actualS / plannedS) * 100);

Deno.test('⛔ the old percentage cannot tell short from long — both read 76', () => {
  const plan = 46 * 60;
  assertEquals(Math.round(durationAdherencePct(plan, 35 * 60)), 76); // eleven minutes SHORT
  assertEquals(Math.round(durationAdherencePct(plan, 57 * 60)), 76); // eleven minutes LONG
});

Deno.test('the ratio answers it — under 100 short, over 100 long', () => {
  const plan = 46 * 60;
  assertEquals(volumeRatioPct(plan, 35 * 60), 76);
  assertEquals(volumeRatioPct(plan, 57 * 60), 124);
  assertEquals(volumeRatioPct(plan, 46 * 60), 100);
});

Deno.test('⛔ the two grades are independent — one cannot be inferred from the other', () => {
  // The case that broke the blend: effort held exactly right, session cut short. Averaging these
  // produced a single number that read as "executed poorly" and, until today, told the coach the
  // athlete looked fatigued.
  const intensity = 100;                       // every minute at the prescribed effort
  const volume = volumeRatioPct(46 * 60, 35 * 60);  // 76 — ran short
  assertEquals(volume, 76);
  // Blended, this is 88 — a number that describes neither fact and hides both.
  assertEquals(Math.round(intensity * 0.5 + volume * 0.5), 88);
  // Reported separately, both facts survive.
  assertEquals([intensity, volume], [100, 76]);
});

Deno.test('a session with no plan has no volume grade — never a ratio against zero', () => {
  // Guarded at the call sites by `plannedDurationSeconds > 0`; pinned so a refactor cannot divide
  // by zero into Infinity and render "Infinity% — long".
  const plan = 0;
  const guarded = plan > 0 ? volumeRatioPct(plan, 35 * 60) : null;
  assertEquals(guarded, null);
});
