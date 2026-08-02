// BIKE signal-vs-noise guard (Q-241, 2026-08-01). Bike was the only discipline whose direction was not
// checked against its own scatter; run durability and strength e1RM both clear ~1 within-window SD.
// These pin the CHANGE, not just the end state: each noisy case asserts what the UNGATED classifier
// said as well, so a future session can see exactly which verdicts this moved and why.
// Run: deno test --no-check bike-noise-guard.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { computeTerrainBinnedPower, computeEfficiencyTrend, computeBikeFitness, efficiencyThresholds, type BikeEffortRide } from './bike-fitness.ts';
import { classifyTrend } from './classify.ts';
import { resolveThresholds } from './thresholds.ts';

const AS_OF = '2026-07-16';
const SPW = 1.6; // the bike reference cadence → minSessions 4, freshnessDays 21

const ride = (date: string, w20: number, type = 'threshold'): BikeEffortRide => ({ date, classified_type: type, w20 });
const pts = (pairs: Array<[string, number]>) => pairs.map(([date, value]) => ({ date, value }));

// A lab 20-min TT repeats at CV ~2.9% for trained, familiarised cyclists; the best-20 inside an ordinary
// ride is looser still, while the bike improve/slide band is ±2.0%. So an endpoint gain that clears the
// band is NOT on its own evidence of fitness — this series gains 3.5% on scatter of ~39 W and must hold.
Deno.test('bike power: a gain buried in the ride-to-ride scatter → holding, not improving', () => {
  const rides = [
    ride('2026-05-28', 200), ride('2026-06-04', 204), ride('2026-06-11', 260), ride('2026-06-18', 150),
    ride('2026-06-25', 250), ride('2026-07-02', 160), ride('2026-07-09', 210), ride('2026-07-14', 208),
  ];
  // What the code said BEFORE the guard, on this exact series:
  const ungated = classifyTrend(rides.map((r) => ({ date: r.date, value: r.w20! })), resolveThresholds('bike', SPW), AS_OF, {});
  assertEquals(ungated.verdict, 'improving');
  // And after:
  const signal = computeTerrainBinnedPower(rides, AS_OF, SPW);
  assertEquals(signal.verdict, 'holding');
  assertEquals(signal.pctChange, 3.5); // the number is UNCHANGED — the guard moves the verdict, never the receipt
});

// The guard kills noise, never a real trend: a clean build reads improving exactly as before.
Deno.test('bike power: a clean build still earns its direction', () => {
  const rides = [
    ride('2026-05-28', 200), ride('2026-06-06', 202), ride('2026-06-15', 206),
    ride('2026-06-24', 210), ride('2026-07-04', 216), ride('2026-07-14', 220),
  ];
  assertEquals(computeTerrainBinnedPower(rides, AS_OF, SPW).verdict, 'improving');
});

// A real loss still reads sliding — the guard is symmetric and must not hide a decline.
Deno.test('bike power: a clean decline still reads sliding', () => {
  const rides = [
    ride('2026-05-28', 220), ride('2026-06-06', 218), ride('2026-06-15', 213),
    ride('2026-06-24', 209), ride('2026-07-04', 204), ride('2026-07-14', 200),
  ];
  assertEquals(computeTerrainBinnedPower(rides, AS_OF, SPW).verdict, 'sliding');
});

// Efficiency (HR at power) is the bike LEAD whenever power is needs_data, so it needs the same gate.
// HR at a given power carries heat and hydration on top of everything power carries.
Deno.test('bike efficiency: a drop buried in HR scatter → holding, not improving', () => {
  const hr = pts([
    ['2026-05-28', 148], ['2026-06-04', 147], ['2026-06-11', 165], ['2026-06-18', 132],
    ['2026-06-25', 162], ['2026-07-02', 134], ['2026-07-09', 141], ['2026-07-14', 140],
  ]);
  const ungated = classifyTrend(hr, efficiencyThresholds('bike', SPW), AS_OF, {});
  assertEquals(ungated.verdict, 'improving'); // lower HR at the same power = improving
  assertEquals(computeEfficiencyTrend(hr, AS_OF, SPW).verdict, 'holding');
});

// The thin-power rider is the case the guard exists for: no power bin resolves, efficiency leads,
// and a clean efficiency gain must still come through.
Deno.test('bike efficiency: a clean drop still earns improving', () => {
  const hr = pts([
    ['2026-05-28', 150], ['2026-06-06', 149], ['2026-06-15', 147],
    ['2026-06-24', 145], ['2026-07-04', 143], ['2026-07-14', 142],
  ]);
  assertEquals(computeEfficiencyTrend(hr, AS_OF, SPW).verdict, 'improving');
});

// ── THE RIDE FLOOR (2026-08-01, Michael: "we can just say that when someone drops a discipline") ───
// Above minSessions the engine CAN compute a direction; below the floor it must not ASSERT one. The
// row says "too few to read" instead of stepping from silence straight to a confident arrow.
const FLOOR = 8; // = STATE_TREND_WINDOWS.bikeDirectionMinRides (derived: TE ~3% x sqrt(2/n) < the 2% band at n=4/end)

Deno.test('bike power: 7 clean rides (floor − 1) → withheld, not a direction', () => {
  const rides = [
    ride('2026-06-02', 198), ride('2026-06-08', 200), ride('2026-06-15', 206), ride('2026-06-20', 208),
    ride('2026-06-24', 210), ride('2026-07-04', 216), ride('2026-07-14', 220),
  ];
  assertEquals(computeTerrainBinnedPower(rides, AS_OF, SPW, FLOOR).verdict, 'withheld');
  assertEquals(computeTerrainBinnedPower(rides, AS_OF, SPW).verdict, 'improving'); // no floor passed = old behaviour
});

Deno.test('bike power: 8 clean rides (at the floor) → the direction is asserted', () => {
  const rides = [
    ride('2026-05-28', 200), ride('2026-06-02', 201), ride('2026-06-06', 202), ride('2026-06-15', 206),
    ride('2026-06-20', 208), ride('2026-06-24', 210), ride('2026-07-04', 216), ride('2026-07-14', 220),
  ];
  assertEquals(computeTerrainBinnedPower(rides, AS_OF, SPW, FLOOR).verdict, 'improving');
});

// ⛔ The selection rule: a QUALIFIED bin outranks a fresher under-floor one. Without this a rider who
// did one climb yesterday would lose the read from the eight flat rides they have been doing all block.
Deno.test('bike power: a qualified bin beats a FRESHER bin that is under the floor', () => {
  const flat = [
    ride('2026-05-28', 200), ride('2026-06-02', 202), ride('2026-06-08', 205), ride('2026-06-14', 208),
    ride('2026-06-20', 212), ride('2026-06-26', 215), ride('2026-07-02', 219), ride('2026-07-08', 222),
  ];
  const climbs = [ride('2026-07-13', 180, 'climbing'), ride('2026-07-14', 240, 'climbing')];
  const signal = computeTerrainBinnedPower([...flat, ...climbs], AS_OF, SPW, FLOOR);
  assertEquals(signal.basis, 'flat_sustained');
  assertEquals(signal.verdict, 'improving');
});

// And when NOTHING qualifies, the under-floor bin is what we show — "too few to read" beats silence,
// because silence is indistinguishable from the app not having noticed.
Deno.test('bike power: no bin qualifies → the freshest under-floor bin carries the withheld read', () => {
  const rides = [
    ride('2026-06-24', 210, 'climbing'), ride('2026-07-04', 216, 'climbing'),
    ride('2026-07-09', 218, 'climbing'), ride('2026-07-14', 224, 'climbing'),
  ];
  const signal = computeTerrainBinnedPower(rides, AS_OF, SPW, FLOOR);
  assertEquals(signal.verdict, 'withheld');
  assertEquals(signal.basis, 'climbing');
});

Deno.test('bike efficiency: under the floor → withheld', () => {
  const hr = pts([['2026-06-15', 150], ['2026-06-24', 147], ['2026-07-04', 144], ['2026-07-14', 142]]);
  assertEquals(computeEfficiencyTrend(hr, AS_OF, SPW, 'bike', FLOOR).verdict, 'withheld');
});

// ── THE THREE READS (2026-08-01) ──────────────────────────────────────────────────────────────────
// The row must name WHY there is no threshold read. "No hard efforts" is a fact about how the athlete
// rides; "too few hard rides" is a fact about how many. They are different sentences on screen.

const easy = (date: string, hr: number) => ({ date, value: hr });

Deno.test('joy rider: no hard efforts at all → efficiency leads and says WHY power is silent', () => {
  const rides = [ // endurance rides are in NO power bin, by design (their best-20 is not a fitness max)
    ride('2026-05-28', 150, 'endurance'), ride('2026-06-06', 152, 'endurance'),
    ride('2026-06-15', 149, 'endurance'), ride('2026-06-24', 151, 'endurance'),
  ];
  const hr = [easy('2026-05-28', 150), easy('2026-06-06', 149), easy('2026-06-15', 147),
              easy('2026-06-20', 146), easy('2026-06-24', 145), easy('2026-06-30', 144),
              easy('2026-07-04', 143), easy('2026-07-14', 142)];
  const f = computeBikeFitness(rides, hr, AS_OF, SPW, FLOOR);
  assertEquals(f.hardRideCount, 0);
  assertEquals(f.lead, 'efficiency');
  assertEquals(f.powerSilent, 'no_hard_efforts');
  assertEquals(f.efficiency.verdict, 'improving');
  assertEquals(typeof f.efficiency.recentValue, 'number'); // the row leads with the NUMBER, not a bare arrow
});

Deno.test('rider who DOES go hard, just not often enough → the other sentence', () => {
  const rides = [ride('2026-06-15', 206), ride('2026-06-24', 210), ride('2026-07-04', 216), ride('2026-07-14', 220)];
  const f = computeBikeFitness(rides, [], AS_OF, SPW, FLOOR);
  assertEquals(f.hardRideCount, 4);
  assertEquals(f.powerSilent, 'too_few_rides'); // NOT 'no_hard_efforts' — they did the work, there is just too little of it
  assertEquals(f.lead, 'none');
});

Deno.test('rider with a real threshold read: power leads and nothing is explained away', () => {
  const rides = [
    ride('2026-05-28', 200), ride('2026-06-02', 201), ride('2026-06-06', 202), ride('2026-06-15', 206),
    ride('2026-06-20', 208), ride('2026-06-24', 210), ride('2026-07-04', 216), ride('2026-07-14', 220),
  ];
  const f = computeBikeFitness(rides, [], AS_OF, SPW, FLOOR);
  assertEquals(f.lead, 'power');
  assertEquals(f.powerSilent, null);
});
