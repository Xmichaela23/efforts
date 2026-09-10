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
  // p239, p275. Rewritten 2026-09-09 (approved): the old line named no percentage OF anything.
  ride_endurance: 'Easy, under 75 percent of FTP. You should be able to talk in full sentences.',
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

/** The approved line for a family, or null. ⛔ Null is the answer for any family not listed. */
export function familyLineFor(family: string | null | undefined): string | null {
  if (!family) return null;
  return FAMILY_LINE[family] ?? null;
}
