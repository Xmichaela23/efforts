// Run: deno test --no-check --allow-read supabase/functions/_shared/session-detail/off-prescription.test.ts
//
// The five approved lines, word for word (Michael, 2026-09-17, WORKORDER Stage D1).
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { offPrescriptionLine } from './off-prescription.ts';

const RUN_RANGE = { lower_sec_per_mi: 626, upper_sec_per_mi: 652 };
const runRep = (band: string, pace: number) => ({
  interval_type: 'work', not_done: false, planned_pace_range: RUN_RANGE,
  executed: { band, actual_pace_sec_per_mi: pace },
}) as never;
const RIDE_RANGE = { lower_w: 165, upper_w: 180 };
const rideRep = (band: string, w: number) => ({
  interval_type: 'work', not_done: false, planned_power_range: RIDE_RANGE,
  executed: { band, power_watts: w },
}) as never;

Deno.test('all six reps faster', () => {
  const rows = [runRep('above', 486), runRep('above', 495), runRep('above', 505), runRep('above', 510), runRep('above', 514), runRep('above', 518)];
  assertEquals(offPrescriptionLine(rows, false)?.line,
    'All six reps were faster than the 10:26–10:52/mi asked for. They ran 8:06–8:38/mi.');
});

Deno.test('all six reps slower', () => {
  const rows = Array.from({ length: 6 }, (_, i) => runRep('below', i === 0 ? 700 : i === 5 ? 725 : 710));
  assertEquals(offPrescriptionLine(rows, false)?.line,
    'All six reps were slower than the 10:26–10:52/mi asked for. They ran 11:40–12:05/mi.');
});

Deno.test('all five intervals above', () => {
  const rows = [rideRep('above', 210), rideRep('above', 215), rideRep('above', 220), rideRep('above', 225), rideRep('above', 230)];
  assertEquals(offPrescriptionLine(rows, true)?.line,
    'All five intervals were above the 165–180 W asked for. They rode 210–230 W.');
});

Deno.test('all five intervals below', () => {
  const rows = [rideRep('below', 140), rideRep('below', 143), rideRep('below', 145), rideRep('below', 148), rideRep('below', 150)];
  assertEquals(offPrescriptionLine(rows, true)?.line,
    'All five intervals were below the 165–180 W asked for. They rode 140–150 W.');
});

Deno.test('the mixed case: half or more, same side, says how many', () => {
  const rows = [runRep('above', 486), runRep('above', 495), runRep('in', 640), runRep('above', 510), runRep('in', 645), runRep('above', 518)];
  assertEquals(offPrescriptionLine(rows, false)?.line,
    'Four of six reps were faster than the 10:26–10:52/mi asked for. They ran 8:06–8:38/mi.');
});

Deno.test('fewer than half prints nothing — the rep rows already carry it', () => {
  const rows = [runRep('above', 486), runRep('above', 495), runRep('in', 640), runRep('in', 641), runRep('in', 645), runRep('in', 648)];
  assertEquals(offPrescriptionLine(rows, false), null);
});

Deno.test('a session that fell both ways prints nothing', () => {
  const rows = [runRep('above', 486), runRep('above', 495), runRep('above', 505), runRep('below', 700), runRep('below', 710), runRep('below', 720)];
  assertEquals(offPrescriptionLine(rows, false), null);
});
