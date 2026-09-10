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
 * ⚠️ EVERY LINE HERE IS APPROVED COPY. Changing one changes it on Today AND in the drawer; it goes
 * through Michael first.
 */
export const FAMILY_LINE: Readonly<Record<string, string>> = {
  // p237.
  ride_anaerobic: 'Go by feel. Stay above the floor. No ceiling. Each set harder than the last.',
  // p239, p211. REVISED 2026-09-10 (approved): lead with what the ride is. The plain version; the
  // with-work version is `RIDE_ENDURANCE_WITH_WORK_LINE`, chosen by archetype in `familyLineFor`.
  ride_endurance: 'Easy ride, under 75 percent of FTP the whole way. You should be able to talk in full sentences.',
  // p233, p110 — the hard run, both family ids.
  run_mlss: 'Stay near threshold as long as you can without falling apart.',
  run_near_threshold: 'Stay near threshold as long as you can without falling apart.',
  // p235, p211 — the long run.
  run_lsd: 'Easy the whole way. Stopping for a bit is fine. Be able to speak long sentences easily the whole time.',
  // p235, p211. ⛔ NEVER THE WORD VT1 ON SCREEN.
  run_vt1: 'Easy. Talk test twice, at 5 minutes and at 20.',
  // p238.
  ride_sweet_spot: 'As close to threshold as you can without going over.',
};

/**
 * ⛔ THE ENDURANCE RIDE HAS TWO APPROVED LINES, ONE PER p239 VERSION (Michael, 2026-09-10). The
 * `mixed` archetype is the ride with work in it; every other ride_endurance session is the plain one.
 * ⚠️ THE LINE SAYS "every 9 minutes", verbatim as approved. p239 prints level 2's sprint every 8 —
 * the level-2 row therefore reads 9 over a ride that sprints every 8. Flagged, not reworded.
 */
export const RIDE_ENDURANCE_WITH_WORK_LINE =
  'Easy ride with a block of 2-minute pushes, then a 10-second sprint every 9 minutes. Everything else under 75 percent of FTP.';

/**
 * ⛔ THE PEDALLING NOTE LIVES IN THE DRAWER, UNDER THE LINE — not on Today (2026-09-10). p239: several
 * minutes of every long ride on pedal stroke and position.
 */
export const RIDE_ENDURANCE_DRAWER_NOTE =
  'Spend a few minutes of the ride paying attention to how you pedal (smooth circles, not stomping) and how you sit on the bike.';

/** The approved line for a family (and, for the endurance ride, its archetype), or null. */
export function familyLineFor(family: string | null | undefined, archetype?: string | null): string | null {
  if (!family) return null;
  if (family === 'ride_endurance' && archetype === 'mixed') return RIDE_ENDURANCE_WITH_WORK_LINE;
  return FAMILY_LINE[family] ?? null;
}
