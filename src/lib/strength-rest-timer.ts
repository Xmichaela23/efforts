/**
 * ⛔ REST LENGTHS ARE THE SERVER'S NOW (2026-09-10, audit H-S07, Stage 3 item 21).
 *
 * The rule that lived here — the slot-intent buckets, the 150 / 120 / 90 / 75 / 60 ladder, the warm-up
 * clock and the cue beside the countdown — moved unchanged to
 * `supabase/functions/_shared/strength/rest-seconds.ts`. The composer and materialize-plan stamp
 * `rest_seconds`, `warmup_rest_seconds` and `rest_cue` on each planned row, and the logger's countdown
 * prints them. Nothing on the phone decides a rest length.
 *
 * What stays is the plyo name test, which the logger uses to decide how a plyo row is DRAWN.
 */
export { isPlyometricMovement } from '../../supabase/functions/_shared/strength/rest-seconds.ts';
