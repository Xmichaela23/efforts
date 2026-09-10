/**
 * ═══ THE COACH PAYLOAD VERSION — ONE NUMBER, READ BY THE SERVER AND THE APP ═══════════════════════
 *
 * ⛔ BUMP IT HERE AND NOWHERE ELSE. `coach` stamps it on every saved copy (`coach_cache`) and serves a
 * saved copy only at this version or newer; the app reads `coach_cache` directly and uses the same
 * number as its floor (`src/lib/coach-contract.ts`).
 *
 * ⚠️ WHY IT MOVED HERE (2026-09-10). The app kept its own copy of the floor, and it stayed at 205 while
 * the server moved to 209. A saved copy written at 208 was under four hours old, so the app painted
 * it and never asked the server — State kept "across 8 sessions" and no "last 7 days" after the
 * 209 deploy. The version history stays beside the import in `coach/index.ts`.
 */
export const COACH_PAYLOAD_VERSION = 209;
