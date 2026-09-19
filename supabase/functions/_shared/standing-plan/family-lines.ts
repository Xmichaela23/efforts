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
import { FAMILIES } from '../endurance-library/source-rules.ts';

/**
 * ⛔ THE FIVE HARD FAMILIES WHOSE TITLE IS THE WORKOUT'S OWN NAME (Michael approved 2026-09-19). The session's title is
 * the option's `label` in `endurance-library/source-rules.ts` ("Surge and Float"); the small line under it is the
 * family's `label` there, the book's heading without the bracketed abbreviation ("Maximal Lactate Steady State",
 * p231). Both are read from that one file — the row's `name` is written from it (`session-vocabulary.ts`), and every
 * screen and send reads the type through `sessionTypeFor` below. Other families keep their plain names.
 */
export const NAMED_WORKOUT_FAMILIES: readonly string[] = ['run_mlss', 'run_near_threshold', 'ride_anaerobic', 'ride_vo2', 'ride_sweet_spot'];

/** The type line for a family ("Maximal Lactate Steady State"), or null for a family that prints none. */
export function sessionTypeForFamily(family: string | null | undefined): string | null {
  if (!family || !NAMED_WORKOUT_FAMILIES.includes(family)) return null;
  return (FAMILIES as Record<string, { label?: string }>)[family]?.label ?? null;
}

/** The type line for a planned row, off its `family:` tag. */
export function sessionTypeFor(row: { tags?: unknown } | null | undefined): string | null {
  const tags = Array.isArray(row?.tags) ? (row!.tags as unknown[]).map(String) : [];
  const fam = tags.find((t) => t.startsWith('family:'))?.slice('family:'.length) ?? null;
  return sessionTypeForFamily(fam);
}

/**
 * The description a device receives (Garmin, Intervals.icu / Zwift): the type line, then the description, one per
 * line — the order Today and the session sheet print them.
 */
export function sendDescription(row: { tags?: unknown; description?: unknown } | null | undefined): string {
  const desc = typeof row?.description === 'string' ? row.description : '';
  const type = sessionTypeFor(row);
  return [type, desc].filter((x) => x && String(x).trim()).join('\n');
}

/**
 * ⛔⛔ EVERY LINE IS THE PAGE'S OWN WORDS (2026-09-18, book-language pass 2 — Michael's rule: "no paraphrasing; quote
 * the book's words; if a line must be shorter, cut the book's words down, never reword them"). Read off the page
 * photographs (book-sources/viada-hybrid-athlete/p231.jpg … p239.jpg). Where a line is shorter than the page, words
 * were dropped and the order kept; the full sentence is quoted beside it.
 * ⛔ SUPERSEDED 2026-09-19: every line below is now a rewording of its page that Michael approved word for word (the
 * author-sentence audit, docs/AUDIT-author-sentences-2026-09-19.md). The page's own words stay quoted in each comment.
 */
export const FAMILY_LINE: Readonly<Record<string, string>> = {
  // p237, reworded (Michael approved the words 2026-09-19); the page: "With the aim of building anaerobic repeatability, these sessions are best done by feel with a power floor
  // rather than a specific power target, so use the following numbers as guidelines." (whole sentence)
  ride_anaerobic: 'These sessions build anaerobic repeatability and are best ridden by feel, with a power floor instead of a set power target; treat the numbers below as guidelines.',
  // p239: "60- to 100-minute easy ride below 75%" — the length is the row's own, so it is cut.
  ride_endurance: 'Easy ride below 75%.',
  // p231, reworded (Michael approved the words 2026-09-19): "The objective is accruing maximum time with equalized
  // fatigue." and "Note that athletes may perform any of these work intervals on hills and adjust pace accordingly to
  // maintain target intensity." One line, both sentences; the separate hills note is gone.
  run_mlss: 'The goal is to accumulate as much time at the target intensity as possible while keeping fatigue even. The work intervals can be run on hills, adjusting pace to hold the target intensity.',
  // p233, reworded (Michael approved the words 2026-09-19); the page: "Workouts that maximize time
  // near-threshold (NT)—whether shorter above-threshold intervals or longer below-threshold intervals. These are
  // designed to maximize total time spent at this intensity while controlling fatigue."
  run_near_threshold: 'Sessions that maximize time near threshold (NT), using shorter above-threshold or longer below-threshold intervals. They aim for the most total time at this intensity while controlling fatigue.',
  // p235, reworded (Michael approved the words 2026-09-19); the page: "Any workout that is intended to maximize training time may be a combination of zones, though primarily below
  // VT1. … Unlike VT1 workouts, these sessions can include rest periods or pauses in the hike/jog sessions with little
  // negative impact." Cut around the word VT1, which never prints on screen (Today's standing rule, pinned in
  // `today-lines.test.ts`). "Easy the whole way" came off: the long run with inserted sets is not easy the whole way.
  run_lsd: 'A session meant to maximize training time can mix zones. Hike/jog sessions can include rests or pauses with little negative effect.',
  // p235, reworded (Michael approved the words 2026-09-19); the page: "You're encouraged to practice your "talk test" at least twice per run if you're
  // unsure—once after 5 minutes of running and the other after 20 minutes."
  run_vt1: 'If you\'re unsure, the "talk test" is worth doing at least twice per run: once after 5 minutes of running and once after 20.',
  // p238, reworded (Michael approved the words 2026-09-19); the page: "These workouts are intended to push you as close as possible to threshold without
  // exceeding it, giving you plenty of time in the zone with far less fatigue than you would experience riding at or above."
  ride_sweet_spot: 'These sessions take you as close to threshold as possible without going over it, which gives plenty of time in the zone with much less fatigue than riding at or above it.',
  // p238, reworded (Michael approved the words 2026-09-19); the page: "These workouts are intended to push your maximum aerobic
  // intake; therefore, they're a little more metabolically taxing than the previous workouts. While the anaerobic
  // sessions had a greater focus on "more power is generally better," these should be more carefully controlled." —
  // cut to its first and last clauses.
  ride_vo2: 'These sessions are meant to push your maximum aerobic intake; they need more careful control.',
};

/**
 * p237, printed under each progressive option, reworded (Michael approved the words 2026-09-19); the page: "Each set should start at 110% and progress up to 125–130% by the
 * end." It belongs to that option only (`progressive_repeats`); the one-to-one and sandwich rides are flat.
 */
export const RIDE_ANAEROBIC_PROGRESSIVE_LINE = 'Each set should begin at 110% and rise to 125–130% by the end.';

/**
 * ⛔ THE ENDURANCE RIDE WITH WORK (p239): "45 minutes @ VT1 with 10-second all-out sprint every 9 minutes" — cut to the
 * sprint. ⛔ THE INTERVAL COMES FROM THE BUILT SESSION (p239 prints 9 at levels 1 and 3, 8 at level 2). The plain
 * ride's "below 75%" does not print over it: the page gives this ride no such sentence.
 */
export function rideWithWorkLine(sprintEveryMinutes: number): string {
  return `10-second all-out sprint every ${sprintEveryMinutes} minutes.`;  // p239 — "10-second all-out sprint every 9 minutes"
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
 * ⛔ THE PEDALLING NOTE LIVES IN THE DRAWER, UNDER THE LINE — not on Today (2026-09-10). p239, reworded (Michael approved the words 2026-09-19); the page: "You won't regret
 * spending several minutes on every long ride practicing pedal stroke and working on position." "(smooth
 * circles, not stomping)" was on no page and came off 2026-09-18.
 */
export const RIDE_ENDURANCE_DRAWER_NOTE =
  'Several minutes of pedal stroke and position practice on every long ride is time well spent.';

/**
 * ⛔ THE EASY RUN'S SECOND SENTENCE, IN THE DRAWER AFTER THE LINE (pass 5, 2026-09-18). p235, reworded (Michael approved the words 2026-09-19); the page: "The precise percentage
 * of threshold that an athlete should remain at here may vary slightly depending on current level of fatigue, hydration
 * status, and environmental conditions." It replaces the paraphrase "Pace varies with fatigue, hydration and weather."
 */
export const RUN_VT1_DRAWER_NOTE = 'The exact percentage of threshold to stay at here can shift slightly with current fatigue, hydration, and environmental conditions.';

/**
 * ⛔ THE LONG RUN'S LAST SENTENCE, IN THE DRAWER AFTER THE LINE (pass 5, 2026-09-18). p235, reworded (Michael approved the words 2026-09-19); the page: "These workouts can be
 * modified extensively depending on your needs and the training conditions."
 */
export const RUN_LSD_DRAWER_NOTE = 'These sessions can be changed a great deal to suit your needs and the training conditions.';

/**
 * ⛔ THE ERG LINE ON THE ANAEROBIC RIDE, IN THE SESSION NOTE AFTER THE FAMILY LINE (Michael approved these exact words,
 * 2026-09-18, round 4). It came off in round 3 for want of a record of his approval; round 4 restores it with his
 * wording. ⚠️ A DEVICE INSTRUCTION, NOT A TRAINING ONE: p237 rides these "by feel with a power floor rather than a
 * specific power target", and ERG holds a target. It says how to set the trainer, not how to ride.
 * The session note goes to the Planned tab, the Garmin workout description and the Intervals.icu description.
 */
// device-instruction: tells the athlete how to set Zwift or a smart trainer for p237's by-feel floor; approved by Michael 2026-09-18
export const RIDE_ANAEROBIC_DRAWER_NOTE = 'On Zwift or a smart trainer, turn ERG off.';

/**
 * p247, reworded (Michael approved the words 2026-09-19); the page: "If within six weeks of a race, increase the pace here to race pace, but extend recovery periods by 25
 * percent." — the race-tempo row's sentence; the condition is cut because the row exists only for that case.
 */
export const RACE_TEMPO_LINE = 'Raise the pace here to race pace, but lengthen recovery periods by 25 percent.';

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
