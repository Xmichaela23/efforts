// Which read LEADS the bike row, and why power is silent when it is (Q-241's lead/explain half).
// The signal-vs-noise guard and the ride floor that used to share this file are gone (2026-09-04,
// docs/SPEC-state-nothing-invented-2026-09-04.md): Garmin's 28/28 rule is the whole test.
// Run: deno test --no-check bike-lead.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { computeBikeFitness, type BikeEffortRide } from './bike-fitness.ts';

const AS_OF = '2026-07-16';
const SPW = 1.6; // accepted, ignored — nothing scales to cadence any more

const ride = (date: string, w20: number, type = 'threshold'): BikeEffortRide => ({ date, classified_type: type, w20 });

const easy = (date: string, hr: number) => ({ date, value: hr });

Deno.test('joy rider: no hard efforts at all → efficiency leads and says WHY power is silent', () => {
  const rides = [ // endurance rides are in NO power bin, by design (their best-20 is not a fitness max)
    ride('2026-05-28', 150, 'endurance'), ride('2026-06-06', 152, 'endurance'),
    ride('2026-06-15', 149, 'endurance'), ride('2026-06-24', 151, 'endurance'),
  ];
  const hr = [easy('2026-05-28', 150), easy('2026-06-06', 149), easy('2026-06-15', 147),
              easy('2026-06-20', 146), easy('2026-06-24', 145), easy('2026-06-30', 144),
              easy('2026-07-04', 143), easy('2026-07-14', 142)];
  const f = computeBikeFitness(rides, hr, AS_OF, SPW);
  assertEquals(f.hardRideCount, 0);
  assertEquals(f.lead, 'efficiency');
  assertEquals(f.powerSilent, 'no_hard_efforts');
  assertEquals(f.efficiency.verdict, 'improving');
  assertEquals(typeof f.efficiency.recentValue, 'number'); // the row leads with the NUMBER, not a bare arrow
});

Deno.test('rider who goes hard but has no effort in the prior 28 days → power is silent for want of a half, not a count', () => {
  // AS_OF 07-16: recent half opens 06-18. Every hard ride is in the recent half; the prior half is empty.
  const rides = [ride('2026-06-24', 210), ride('2026-07-04', 216), ride('2026-07-14', 220)];
  const f = computeBikeFitness(rides, [], AS_OF, SPW);
  assertEquals(f.hardRideCount, 3);
  assertEquals(f.powerSilent, 'too_few_rides'); // NOT 'no_hard_efforts' — they did the work; one half has nothing to compare
  assertEquals(f.lead, 'none');
  // one hard ride in the prior half is enough: Garmin's rule reads
  const g = computeBikeFitness([ride('2026-06-15', 206), ...rides], [], AS_OF, SPW);
  assertEquals(g.lead, 'power');
  assertEquals(g.power.verdict, 'improving');
});

Deno.test('rider with a real threshold read: power leads and nothing is explained away', () => {
  const rides = [
    ride('2026-05-28', 200), ride('2026-06-02', 201), ride('2026-06-06', 202), ride('2026-06-15', 206),
    ride('2026-06-20', 208), ride('2026-06-24', 210), ride('2026-07-04', 216), ride('2026-07-14', 220),
  ];
  const f = computeBikeFitness(rides, [], AS_OF, SPW);
  assertEquals(f.lead, 'power');
  assertEquals(f.powerSilent, null);
});
