/**
 * THE TRAP-BAR FOLD (FIXLIST 2b, ruled by Michael 2026-09-01) — and the same-week bug found live.
 *
 *   deno test --allow-read src/lib/fold-lift-slots.test.ts --no-check
 *
 * ⛔ WHAT THESE PIN. One slot, one card, no version line. The slot's readings are UNIONED and the
 * server's one-point-per-ISO-week-heaviest rule is applied to the union — so two readings in the
 * same week resolve to the heavier, whichever was logged later. `latestE1rm` keeps its meaning —
 * the most recent week's heaviest — so a merged card CAN read lower than the unmerged deadlift when
 * the variant owns a LATER week, and the record beside it is what explains that. Pinned as CORRECT.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { foldVariantSlots } from './fold-lift-slots.ts';

const lift = (o: Partial<Parameters<typeof foldVariantSlots>[0][number]> & { canonical: string }) => ({
  displayName: o.canonical,
  latestE1rm: 100,
  allTimeBestE1rm: 100,
  allTimeCount: 1,
  sampleCount: 1,
  newestAgeDays: 1,
  isPr: false,
  ...o,
});

// ── THE LIVE CASE, 2026-09-01: deadlift 180 on Tue Aug 25, trap bar 135 on Fri Aug 28 — ONE ISO WEEK.
// as-of Sep 1 → the deadlift's newest reading is 7 days old, the trap bar's is 4.
const DL_SERIES = [
  { date: '2026-08-11', value: 170, recent: true },
  { date: '2026-08-18', value: 175, recent: true },
  { date: '2026-08-25', value: 180, recent: true },
];
const liveDeadlift = () => lift({
  canonical: 'deadlift', latestE1rm: 180, allTimeBestE1rm: 180, allTimeCount: 3, sampleCount: 3,
  newestAgeDays: 7, isPr: true, series: DL_SERIES,
  lastAllOut: { date: '2026-08-25', weight: 155, reps: 5, isRepRecord: true },
});
const liveTrapBar = () => lift({
  canonical: 'trap_bar_deadlift', latestE1rm: 135, allTimeBestE1rm: 150, allTimeCount: 1, sampleCount: 1,
  newestAgeDays: 4, isPr: false,
  // ⚠️ No `series`, no `lastAllOut` — a variant is not a tracked-max lift and carries neither.
});

Deno.test('⛔⛔ SAME ISO WEEK, LIGHTER LOGGED LATER → THE WEEK IS THE HEAVIER; headline 180, not 135', () => {
  const [dl] = foldVariantSlots([liveDeadlift(), liveTrapBar()]);
  assertEquals(dl.canonical, 'deadlift');
  assertEquals(dl.latestE1rm, 180, 'the slot\'s most recent week, heaviest set — the server\'s own rule');
  assertEquals(dl.allTimeBestE1rm, 180);
});

Deno.test('⛔⛔ THE CHART DRAWS — the merged series is the slot\'s, and the same-week lighter point is folded away', () => {
  const [dl] = foldVariantSlots([liveDeadlift(), liveTrapBar()]);
  assert(Array.isArray(dl.series) && dl.series.length === 3, 'three weeks, not four and not zero');
  assertEquals(dl.series!.map((p) => p.value), [170, 175, 180]);
  assertEquals(dl.series!.map((p) => p.date), ['2026-08-11', '2026-08-18', '2026-08-25']);
});

Deno.test('⛔⛔ THE ALL-OUT LINE SURVIVES — the variant row had none and must not erase the slot\'s', () => {
  const [dl] = foldVariantSlots([liveDeadlift(), liveTrapBar()]);
  assertEquals(dl.lastAllOut?.weight, 155);
  assertEquals(dl.lastAllOut?.isRepRecord, true);
});

Deno.test('⛔ COUNT AND AS-OF READ OFF THE MERGED SERIES — 3 weekly points, as of the freshest reading', () => {
  const [dl] = foldVariantSlots([liveDeadlift(), liveTrapBar()]);
  assertEquals(dl.sampleCount, 3, 'one point per week in the window; the same-week pair is one');
  assertEquals(dl.newestAgeDays, 4, 'the slot\'s freshest reading is the trap bar\'s, 4 days old');
});

Deno.test('⛔ THE PR FLAG IS THE ROW THAT OWNS THE LATEST — 180 is the deadlift\'s and stays a PR', () => {
  const [dl] = foldVariantSlots([liveDeadlift(), liveTrapBar()]);
  assertEquals(dl.isPr, true);
});

Deno.test('⚠️ ORDER OF ARRIVAL DOES NOT MATTER — variant first gives the same card', () => {
  const [dl] = foldVariantSlots([liveTrapBar(), liveDeadlift()]);
  assertEquals(dl.latestE1rm, 180);
  assertEquals(dl.series?.length, 3);
  assertEquals(dl.lastAllOut?.weight, 155);
});

Deno.test('⚠️ THE CROSS-WEEK DROP IS STILL CORRECT — a LATER trap-bar week owns the number, and BEST explains it', () => {
  // as-of Sep 1: deadlift newest Aug 18 (14 days), trap bar Aug 31 (1 day) — different ISO weeks.
  const [dl] = foldVariantSlots([
    lift({
      canonical: 'deadlift', latestE1rm: 180, allTimeBestE1rm: 180, sampleCount: 2, newestAgeDays: 14, isPr: true,
      series: [{ date: '2026-08-11', value: 170, recent: true }, { date: '2026-08-18', value: 180, recent: true }],
    }),
    lift({ canonical: 'trap_bar_deadlift', latestE1rm: 135, allTimeBestE1rm: 150, sampleCount: 1, newestAgeDays: 1 }),
  ]);
  assertEquals(dl.latestE1rm, 135);
  assertEquals(dl.allTimeBestE1rm, 180);
  assert(dl.allTimeBestE1rm! > dl.latestE1rm!, '`showBest` renders 180 beside the 135');
  assertEquals(dl.series?.map((p) => p.value), [170, 180, 135], 'the later week joins the chart');
  assertEquals(dl.isPr, false, 'a 135 is not a record in a slot that holds 180');
});

Deno.test('⚠️ A HEAVIER SAME-WEEK VARIANT WINS THE WEEK — the rule is heaviest, not "the slot\'s own name"', () => {
  const [dl] = foldVariantSlots([
    liveDeadlift(),
    lift({ canonical: 'trap_bar_deadlift', latestE1rm: 190, allTimeBestE1rm: 190, sampleCount: 1, newestAgeDays: 4, isPr: true }),
  ]);
  assertEquals(dl.latestE1rm, 190);
  assertEquals(dl.series?.map((p) => p.value), [170, 175, 190]);
  assertEquals(dl.isPr, true, 'the variant\'s own PR call stands: 190 is the slot\'s record too');
});

Deno.test('⚠️ THE MORE RECENT ALL-OUT SET WINS when both rows carry one', () => {
  const [dl] = foldVariantSlots([
    liveDeadlift(),
    lift({ canonical: 'trap_bar_deadlift', latestE1rm: 135, newestAgeDays: 4,
      lastAllOut: { date: '2026-08-28', weight: 120, reps: 8, isRepRecord: false } }),
  ]);
  assertEquals(dl.lastAllOut?.date, '2026-08-28');
});

// ── THE NO-SERIES FALLBACK: nothing to anchor a date to, so the most-recent row represents the slot.
Deno.test('⚠️ NO SERIES ON EITHER ROW → most-recent-row fallback, counts summed', () => {
  const [dl] = foldVariantSlots([
    lift({ canonical: 'deadlift', latestE1rm: 180, allTimeBestE1rm: 180, sampleCount: 3, newestAgeDays: 4 }),
    lift({ canonical: 'trap_bar_deadlift', latestE1rm: 135, allTimeBestE1rm: 150, sampleCount: 1, newestAgeDays: 9 }),
  ]);
  assertEquals(dl.latestE1rm, 180);
  assertEquals(dl.allTimeBestE1rm, 180);
  assertEquals(dl.sampleCount, 4);
});

Deno.test('⛔ ONE CARD FOR THE SLOT — the trap bar does not get a fifth row', () => {
  const out = foldVariantSlots([lift({ canonical: 'squat' }), liveDeadlift(), liveTrapBar()]);
  assertEquals(out.map((l) => l.canonical), ['squat', 'deadlift']);
});

Deno.test('⚠️ A TRAP-BAR-ONLY ATHLETE GETS ONE CARD CALLED DEADLIFT — no version line, no second row', () => {
  const out = foldVariantSlots([lift({ canonical: 'trap_bar_deadlift', latestE1rm: 135, allTimeBestE1rm: 150 })]);
  assertEquals(out.length, 1);
  assertEquals(out[0].canonical, 'deadlift');
  assertEquals(out[0].displayName, 'Deadlift');
});

Deno.test('⚠️ EVERY OTHER LIFT IS UNTOUCHED AND ORDER IS PRESERVED', () => {
  const out = foldVariantSlots([
    lift({ canonical: 'squat', latestE1rm: 300 }),
    lift({ canonical: 'bench_press', latestE1rm: 200 }),
    lift({ canonical: 'overhead_press', latestE1rm: 120 }),
  ]);
  assertEquals(out.map((l) => l.canonical), ['squat', 'bench_press', 'overhead_press']);
  assertEquals(out.map((l) => l.latestE1rm), [300, 200, 120]);
});
