/**
 * The six-week checkpoint's pure logic. Facts, not verdicts.
 *
 * Run: deno test --allow-read --no-check supabase/functions/_shared/standing-plan/endurance-checkpoint.test.ts
 * Athlete-agnostic: synthetic numbers, never tuned to the primary user.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkpointDue, diffAnchors, evidenceFor, isRepriceable, LARGE_MOVE } from './endurance-checkpoint.ts';

// ═══ WHEN ════════════════════════════════════════════════════════════════════
Deno.test('not due until week 6 is behind the athlete', () => {
  for (const w of [1, 3, 6]) assertEquals(checkpointDue(w, 12, []).due, false, `week ${w}`);
  assertEquals(checkpointDue(7, 12, []), { due: true, week: 6, reason: 'week 6 is behind you and unanswered' });
});

Deno.test('answered once, silent until the block ends; then due again, once', () => {
  assertEquals(checkpointDue(9, 12, [6]).due, false);
  assertEquals(checkpointDue(13, 12, [6]).week, 12);
  assertEquals(checkpointDue(13, 12, [6, 12]).due, false);
});

Deno.test('no plan week → not due, never a crash', () => {
  assertEquals(checkpointDue(null, 12, []).due, false);
});

// ═══ THE DIFF ════════════════════════════════════════════════════════════════
const live = { threshold_sec_per_mi: 440, threshold_source: 'learned', ftp_w: 250, ftp_source: 'learned', lthr_bpm: 165, lthr_source: 'learned' };

Deno.test('rows priced off the same numbers → nothing moves', () => {
  const d = diffAnchors({ threshold_sec_per_mi: 440, ftp_w: 250, lthr_bpm: 165 }, live);
  for (const n of d) { assertEquals(n.moves, false); assertEquals(n.large, false); assertEquals(n.delta, 0); }
});

Deno.test('a move is reported as a bare delta in its own unit, and flagged large past the book\'s "several seconds"', () => {
  const d = diffAnchors({ threshold_sec_per_mi: 452, ftp_w: 240, lthr_bpm: 163 }, live);
  const thr = d.find((n) => n.key === 'threshold_pace')!;
  assertEquals(thr.delta, -12);           // faster by 12 s/mi
  assertEquals(thr.moves, true);
  assertEquals(thr.large, true);          // past 8 s/mi
  const ftp = d.find((n) => n.key === 'ftp')!;
  assertEquals(ftp.delta, 10);            // +4.2% → large
  assertEquals(ftp.large, true);
  const lthr = d.find((n) => n.key === 'lthr')!;
  assertEquals(lthr.delta, 2);
  assertEquals(lthr.large, false);        // 2 bpm is not
  assertEquals(LARGE_MOVE.threshold_sec_per_mi, 8);
});

Deno.test('rows with no stamp (built before the stamp shipped) → on_plan null, live still reported, no delta', () => {
  const d = diffAnchors(null, live);
  for (const n of d) { assertEquals(n.on_plan, null); assertEquals(n.delta, null); assertEquals(n.moves, false); assert(n.live != null); }
});

Deno.test('a number the athlete no longer has (no threshold) → live null, no delta, no move', () => {
  const d = diffAnchors({ threshold_sec_per_mi: 440 }, { ...live, threshold_sec_per_mi: null, threshold_source: null });
  const thr = d.find((n) => n.key === 'threshold_pace')!;
  assertEquals(thr.live, null); assertEquals(thr.delta, null); assertEquals(thr.moves, false);
});

// ═══ THE EVIDENCE — p123's three signals as facts ═══════════════════════════
const s = (date: string, avg_hr: number, work: number, rpe: number, drift: number, sport: 'run' | 'ride' = 'run') =>
  ({ date, sport, avg_hr, work, rpe, drift_pct: drift });

Deno.test('early vs late halves, each signal as a bare difference; no verdict word anywhere', () => {
  const ev = evidenceFor('run', [
    s('2026-07-06', 165, 280, 7, 6), s('2026-07-13', 164, 280, 7, 5.5),
    s('2026-07-27', 160, 279, 6, 4), s('2026-08-03', 158, 281, 6, 3.5),
  ]);
  assertEquals(ev.sessions, 4);
  assertEquals(ev.early.sessions, 2); assertEquals(ev.late.sessions, 2);
  assertEquals(ev.hr_change_bpm, -5.5);
  assertEquals(ev.rpe_change, -1);
  assertEquals(ev.drift_change_pct, -2);
  assertEquals(ev.work_change, 0);
  assert(!JSON.stringify(ev).match(/improv|declin|better|worse|fitter/i), 'the evidence carries a verdict word');
});

Deno.test('one session → an empty early half and null differences, not a fabricated trend', () => {
  const ev = evidenceFor('run', [s('2026-07-06', 165, 280, 7, 6)]);
  assertEquals(ev.early.sessions, 0);
  assertEquals(ev.hr_change_bpm, null);
});

Deno.test('sports are kept apart', () => {
  const ev = evidenceFor('ride', [s('2026-07-06', 150, 220, 6, 3, 'ride'), s('2026-07-20', 148, 225, 6, 2.5, 'ride'), s('2026-07-08', 165, 280, 8, 6)]);
  assertEquals(ev.sessions, 2);
});

Deno.test('missing fields are skipped in the mean, never read as zero', () => {
  const ev = evidenceFor('run', [
    { date: '2026-07-06', sport: 'run', avg_hr: 160, work: null, rpe: null, drift_pct: null },
    { date: '2026-07-20', sport: 'run', avg_hr: 156, work: null, rpe: 6, drift_pct: null },
  ]);
  assertEquals(ev.hr_change_bpm, -4);
  assertEquals(ev.rpe_change, null);
});

// ═══ WHICH ROWS MAY BE RE-PRICED ═════════════════════════════════════════════
Deno.test('only unstarted endurance rows on or after today; strength, completed, skipped and past rows never', () => {
  const today = '2026-09-02';
  assertEquals(isRepriceable({ type: 'run', date: '2026-09-05' }, today), true);
  assertEquals(isRepriceable({ type: 'ride', date: '2026-09-02', workout_status: 'planned' }, today), true);
  assertEquals(isRepriceable({ type: 'strength', date: '2026-09-05' }, today), false);
  assertEquals(isRepriceable({ type: 'run', date: '2026-09-05', completed_workout_id: 'abc' }, today), false);
  assertEquals(isRepriceable({ type: 'run', date: '2026-09-05', workout_status: 'skipped' }, today), false);
  assertEquals(isRepriceable({ type: 'run', date: '2026-09-01' }, today), false);
});
