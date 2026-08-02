import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isEasyPrescribedRun } from './easy-hr.ts';
import { timeUnderCeiling, timeUnderCeilingPct } from './time-under-ceiling.ts';

/**
 * THE EASY GOVERNOR FOR RUNS (2026-08-02) — an easy run is scored on heart rate, not on pace.
 *
 * The read already existed as a SENTENCE in the run's Insights paragraph, off AVERAGE heart rate,
 * while the ride shipped the same idea a day earlier as a scored chip off TIME UNDER THE CEILING
 * ([D-362]). This pins the two things that make the run version correct.
 */

// ── THE GATE ────────────────────────────────────────────────────────────────

Deno.test('⛔ a TEMPO run is not graded against the easy ceiling', () => {
  // THE BUG THIS PINS. The old gate was `mapClassifiedTypeToHrWorkoutType(...) === 'steady_state'`,
  // and that helper returns `steady_state` for everything except intervals and hills. So a tempo run
  // — a session the athlete was TOLD to run hard — took the easy-band branch and was informed it
  // "ran 22 bpm over your easy ceiling". Never grade against a prescription that was not given.
  assertEquals(isEasyPrescribedRun('tempo'), false);
  assertEquals(isEasyPrescribedRun('threshold'), false);
  assertEquals(isEasyPrescribedRun('intervals'), false);
  assertEquals(isEasyPrescribedRun('hill_repeats'), false);
});

Deno.test('easy, recovery and long runs prescribe an intensity — heart rate governs', () => {
  assertEquals(isEasyPrescribedRun('easy'), true);
  assertEquals(isEasyPrescribedRun('recovery'), true);
  // Long runs are IN deliberately: they drift, and a well-executed one will not score 100. The field
  // reports time-in-zone straight and reports decoupling separately.
  assertEquals(isEasyPrescribedRun('long_run'), true);
});

Deno.test('an unknown or missing type never invents an easy prescription', () => {
  assertEquals(isEasyPrescribedRun(null), false);
  assertEquals(isEasyPrescribedRun(undefined), false);
  assertEquals(isEasyPrescribedRun(''), false);
  assertEquals(isEasyPrescribedRun('steady_state'), false);
  assertEquals(isEasyPrescribedRun('  Long_Run '), true); // case + whitespace tolerated
});

// ── THE MEASUREMENT ─────────────────────────────────────────────────────────

Deno.test('a hilly easy run is scored on time under the ceiling, not on its average', () => {
  // Ceiling 141. Average of these is 140 — UNDER the ceiling, so an average-based read calls this a
  // clean easy run. It was not: a third of it was spent over the bar on the climbs.
  const samples = [128, 130, 132, 155, 158, 137];
  const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  assertEquals(avg <= 141, true);                        // the average says "held it easy"
  assertEquals(timeUnderCeilingPct(samples, 141), 67);   // the truth: 4 of 6
});

Deno.test('no ceiling and no heart rate abstain — execution falls back to duration alone', () => {
  assertEquals(timeUnderCeilingPct([130, 135], null), null);
  assertEquals(timeUnderCeilingPct([], 141), null);
  assertEquals(timeUnderCeilingPct([null, undefined], 141), null);
});

// ── THE SCORE ───────────────────────────────────────────────────────────────

Deno.test('execution on an easy run is 50/50 intensity and duration, mirroring the ride', () => {
  // Mirrors analyze-cycling-workout's easy branch: the pace number is deliberately NOT in this sum —
  // the same screen hides the Pace chip, and a score half-built from a number we refuse to show is
  // the contradiction this change closes.
  const execution = (intensity: number, duration: number) => Math.round(intensity * 0.5 + duration * 0.5);
  assertEquals(execution(67, 100), 84);
  assertEquals(execution(100, 100), 100);
  assertEquals(execution(0, 90), 45);
});

// ── THE READOUT ─────────────────────────────────────────────────────────────
// Easy is rendered as "22 of 35 min under 134 bpm", not as a percentage, so the minutes must come
// from the server and must be the SAME population as each other.

Deno.test('the minutes are measured, not back-converted from the percentage', () => {
  const r = timeUnderCeiling([128, 130, 132, 155, 158, 137], 141)!;
  assertEquals(r.under_s, 4);
  assertEquals(r.total_s, 6);
  assertEquals(r.pct, 67);
});

Deno.test('⛔ total is HR COVERAGE, not session length — a dropped strap must not invent time', () => {
  // Six samples, two unusable. Saying "3 of 6" would claim two seconds nobody measured.
  const r = timeUnderCeiling([130, 135, null, 0, 138, 150], 141)!;
  assertEquals(r.total_s, 4);
  assertEquals(r.under_s, 3);
});

Deno.test('no usable heart rate abstains — the chip renders nothing rather than "0 of 0"', () => {
  assertEquals(timeUnderCeiling([null, undefined], 141), null);
  assertEquals(timeUnderCeiling([130, 135], null), null);
});
