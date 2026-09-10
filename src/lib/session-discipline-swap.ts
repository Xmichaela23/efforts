/**
 * THE SWAP'S READERS ON THE PHONE — and only its readers (2026-09-10, audit H-T15).
 *
 * ⛔ THE SWAP IS DECIDED AND WRITTEN ON THE SERVER. What this file used to hold — which swaps a session
 * offers, the words on each, the session each hands over, the rest-of-plan loop — lives in
 * `supabase/functions/_shared/session-swap/` and runs in `swap-session`. Today's sheet, the workout
 * drawer and the calendar chip render what that function sends and post the tap (`useSwapSheet`).
 *
 * ⚠️ WHAT STAYS HERE is how a row that is ALREADY swapped is drawn: is it a swap, is its structure
 * stale, the "Swapped from your planned run" block, its machine. They read tags the server wrote and
 * choose nothing.
 */
export {
  disciplineOf,
  isDisciplineSwapped,
  originOf,
  swappedSessionBlock,
  swappedStructureIsStale,
  venueOf,
  SWAPPED_FROM_PREFIX,
  SWAPPED_TAG,
  VENUE_PREFIX,
  type Discipline,
  type SwappableSession,
  type Venue,
} from '../../supabase/functions/_shared/session-swap/swap.ts';
