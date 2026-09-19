/**
 * ═══ THE ENDURANCE FAMILY LINES — ONE SOURCE, TWO SURFACES ══════════════════════════════════════
 *
 * docs/WORKORDER-today-screen-2026-09-09.md §2. One approved sentence per endurance family, keyed by
 * the `family:` tag the composer stamps.
 *
 * ⛔ READ BY BOTH SURFACES (Michael, 2026-09-10). Today's session card printed these from a map in
 * `src/lib/today-lines.ts`; the session drawer printed the planned row's `description`, which
 * `session-vocabulary.ts` composed separately — so the same Tuesday ride said "Easy, under 75 percent
 * of FTP…" on Today and a p107 paragraph about ending the session on 5% drift in the drawer. The map
 * now lives here, in `_shared`, because the server writes the description; the client imports it
 * through `@shared/`.
 *
 * ⛔ A FAMILY THAT IS NOT HERE GETS NO LINE. The book has a page for each of these and does not have
 * one for the rest; inventing the missing sentence is the thing neither surface may do.
 *
 * ⚠️ THE HARD RUN IS TWO FAMILY IDS. The work order names `run_mlss`; the id the composer actually
 * stamps for the near-threshold run is `run_near_threshold` (`endurance-library/classification.ts`),
 * so both are keyed to the one approved line rather than one of them silently printing nothing.
 *
 * ⚠️ EVERY LINE HERE IS THE PAGE'S WORDS (2026-09-18). Changing one changes it on Today AND in the drawer, and a
 * change is a new quote off the page, never a rewording.
 */
/**
 * ⛔⛔ EVERY LINE IS THE PAGE'S OWN WORDS (2026-09-18, book-language pass 2 — Michael's rule: "no paraphrasing; quote
 * the book's words; if a line must be shorter, cut the book's words down, never reword them"). Read off the page
 * photographs (book-sources/viada-hybrid-athlete/p231.jpg … p239.jpg). Where a line is shorter than the page, words
 * were dropped and the order kept; the full sentence is quoted beside it.
 */
export const FAMILY_LINE: Readonly<Record<string, string>> = {
  // p237: "With the aim of building anaerobic repeatability, these sessions are best done by feel with a power floor
  // rather than a specific power target, so use the following numbers as guidelines." (whole sentence)
  ride_anaerobic: 'With the aim of building anaerobic repeatability, these sessions are best done by feel with a power floor rather than a specific power target, so use the following numbers as guidelines.',
  // p239: "60- to 100-minute easy ride below 75%" — the length is the row's own, so it is cut.
  ride_endurance: 'Easy ride below 75%.',
  // p231: "Workouts that emphasize time spent in zone 4. The objective is accruing maximum time with equalized
  // fatigue." It printed p233's near-threshold sentence until 2026-09-18 (audit item 14).
  run_mlss: 'Workouts that emphasize time spent in zone 4. The objective is accruing maximum time with equalized fatigue.',
  // p233, whole (pass 5, 2026-09-18: it was cut to its first and last words): "Workouts that maximize time
  // near-threshold (NT)—whether shorter above-threshold intervals or longer below-threshold intervals. These are
  // designed to maximize total time spent at this intensity while controlling fatigue."
  run_near_threshold: 'Workouts that maximize time near-threshold (NT)—whether shorter above-threshold intervals or longer below-threshold intervals. These are designed to maximize total time spent at this intensity while controlling fatigue.',
  // p235: "Any workout that is intended to maximize training time may be a combination of zones, though primarily below
  // VT1. … Unlike VT1 workouts, these sessions can include rest periods or pauses in the hike/jog sessions with little
  // negative impact." Cut around the word VT1, which never prints on screen (Today's standing rule, pinned in
  // `today-lines.test.ts`). "Easy the whole way" came off: the long run with inserted sets is not easy the whole way.
  run_lsd: 'Any workout that is intended to maximize training time may be a combination of zones. These sessions can include rest periods or pauses in the hike/jog sessions with little negative impact.',
  // p235, whole sentence.
  run_vt1: 'You\'re encouraged to practice your "talk test" at least twice per run if you\'re unsure—once after 5 minutes of running and the other after 20 minutes.',
  // p238, whole sentence (pass 5, 2026-09-18: the rest of the page's sentence added back — "plenty of time in the
  // zone with far less fatigue" is what the session is for).
  ride_sweet_spot: 'These workouts are intended to push you as close as possible to threshold without exceeding it, giving you plenty of time in the zone with far less fatigue than you would experience riding at or above.',
  // p238 (pass 5, 2026-09-18 — the VO2 ride printed no line): "These workouts are intended to push your maximum aerobic
  // intake; therefore, they're a little more metabolically taxing than the previous workouts. While the anaerobic
  // sessions had a greater focus on "more power is generally better," these should be more carefully controlled." —
  // cut to its first and last clauses.
  ride_vo2: 'These workouts are intended to push your maximum aerobic intake; these should be more carefully controlled.',
};

/**
 * p237, printed under each progressive option: "Each set should start at 110% and progress up to 125–130% by the
 * end." It belongs to that option only (`progressive_repeats`); the one-to-one and sandwich rides are flat.
 */
export const RIDE_ANAEROBIC_PROGRESSIVE_LINE = 'Each set should start at 110% and progress up to 125–130% by the end.';

/**
 * ⛔ THE ENDURANCE RIDE WITH WORK (p239): "45 minutes @ VT1 with 10-second all-out sprint every 9 minutes" — cut to the
 * sprint. ⛔ THE INTERVAL COMES FROM THE BUILT SESSION (p239 prints 9 at levels 1 and 3, 8 at level 2). The plain
 * ride's "below 75%" does not print over it: the page gives this ride no such sentence.
 */
export function rideWithWorkLine(sprintEveryMinutes: number): string {
  return `10-second all-out sprint every ${sprintEveryMinutes} minutes.`;
}

/**
 * The sprint interval, in minutes, off a planned row's own tokens — the token the builder writes for
 * the VT1-with-sprints block (`bike_vt1sprint_45min_10s_every9min`). Null when the row has none.
 */
export function sprintEveryMinutesFromTokens(tokens: unknown): number | null {
  if (!Array.isArray(tokens)) return null;
  for (const t of tokens) {
    const m = String(t).toLowerCase().match(/^bike_vt1sprint_\d+min_\d+s_every(\d+)min$/);
    if (m && Number(m[1]) > 0) return Number(m[1]);
  }
  return null;
}

/**
 * ⛔ THE PEDALLING NOTE LIVES IN THE DRAWER, UNDER THE LINE — not on Today (2026-09-10). p239, whole sentence. "(smooth
 * circles, not stomping)" was on no page and came off 2026-09-18.
 */
export const RIDE_ENDURANCE_DRAWER_NOTE =
  'You won\'t regret spending several minutes on every long ride practicing pedal stroke and working on position.';

/**
 * ⛔ THE EASY RUN'S SECOND SENTENCE, IN THE DRAWER AFTER THE LINE (pass 5, 2026-09-18). p235: "The precise percentage
 * of threshold that an athlete should remain at here may vary slightly depending on current level of fatigue, hydration
 * status, and environmental conditions." It replaces the paraphrase "Pace varies with fatigue, hydration and weather."
 */
export const RUN_VT1_DRAWER_NOTE = 'The precise percentage of threshold that an athlete should remain at here may vary slightly depending on current level of fatigue, hydration status, and environmental conditions.';

/**
 * ⛔ THE LONG RUN'S LAST SENTENCE, IN THE DRAWER AFTER THE LINE (pass 5, 2026-09-18). p235: "These workouts can be
 * modified extensively depending on your needs and the training conditions."
 */
export const RUN_LSD_DRAWER_NOTE = 'These workouts can be modified extensively depending on your needs and the training conditions.';

/**
 * ⛔ THE MLSS HILLS NOTE, IN THE DRAWER AFTER THE LINE. p231: "Note that athletes may perform any of these work
 * intervals on hills and adjust pace accordingly to maintain target intensity." — "Note that" cut.
 */
export const RUN_MLSS_DRAWER_NOTE = 'Athletes may perform any of these work intervals on hills and adjust pace accordingly to maintain target intensity.';

/**
 * ⛔ THE ERG NOTE ON THE ANAEROBIC RIDE, IN THE DRAWER AFTER THE LINE (approved by Michael, 2026-09-18). ⚠️ NOT A PAGE
 * LINE, KEPT AS A LINE THAT OPERATES THE ATHLETE'S DEVICE: p237 asks for a power floor rather than a target, and ERG
 * holds a target. It says how to set Zwift, not how to ride.
 * The session note goes to the Planned tab, the Garmin workout description and the Intervals.icu description.
 */
export const RIDE_ANAEROBIC_DRAWER_NOTE = 'On Zwift, turn ERG off.';

/**
 * p247: "If within six weeks of a race, increase the pace here to race pace, but extend recovery periods by 25
 * percent." — the race-tempo row's sentence; the condition is cut because the row exists only for that case.
 */
export const RACE_TEMPO_LINE = 'Increase the pace here to race pace, but extend recovery periods by 25 percent.';

/**
 * The approved line for a family (and, for the endurance ride, its archetype), or null.
 * ⚠️ A RIDE WITH WORK WHOSE SPRINT INTERVAL IS NOT KNOWN GETS NO LINE. The plain line would say "the
 * whole way" over a ride with pushes in it, and a guessed interval is the fixed word this replaced.
 */
export function familyLineFor(
  family: string | null | undefined,
  archetype?: string | null,
  sprintEveryMinutes?: number | null,
): string | null {
  if (!family) return null;
  if (family === 'ride_endurance' && archetype === 'mixed') {
    return sprintEveryMinutes != null && sprintEveryMinutes > 0 ? rideWithWorkLine(sprintEveryMinutes) : null;
  }
  const line = FAMILY_LINE[family] ?? null;
  if (line && family === 'ride_anaerobic' && archetype === 'progressive_repeats') return `${line} ${RIDE_ANAEROBIC_PROGRESSIVE_LINE}`;
  return line;
}
