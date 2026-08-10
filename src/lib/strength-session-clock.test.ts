/**
 * Fixtures for the strength session clock.
 *
 * The first block is the PERMANENT REGRESSION for the bug this module was written to kill: the
 * mount-anchored start (`useState<Date>(new Date())`) restarted on every remount, so an
 * interrupted session saved only its last stretch. Any change that lets a remount move the start
 * must fail here.
 *
 * Run: ~/.deno/bin/deno test --no-check src/lib/strength-session-clock.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  MAX_SESSION_MINUTES,
  SESSION_CLOCK_KEY,
  SESSION_CLOCK_TTL_MS,
  clearSessionStart,
  elapsedMinutesForSave,
  elapsedSeconds,
  ensureSessionStart,
  formatElapsed,
  formatSessionMinutes,
  moveSessionStart,
  parseEditedMinutes,
  readSessionStart,
} from './strength-session-clock.ts';

/** localStorage stand-in. */
function mem(seed: Record<string, string> = {}) {
  const data: Record<string, string> = { ...seed };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
    removeItem: (k: string) => { delete data[k]; },
    _dump: () => data,
  };
}

const T0 = 1_754_700_000_000; // fixed epoch — scripts must not read the wall clock
const MIN = 60_000;
const KEY_UPPER = 'strength_logger_session_2026-08-09_plan-upper';
const KEY_LOWER = 'strength_logger_session_2026-08-09_plan-lower';
const KEY_ADHOC = 'strength_logger_session_2026-08-09_adhoc';

// ── REGRESSION: the reset bug ────────────────────────────────────────────────────────────────
Deno.test('remount RESUMES the clock, it does not restart it (the under-count bug)', () => {
  const s = mem();
  // Mount 1 — athlete opens the logger and starts working.
  const first = ensureSessionStart(s, KEY_UPPER, T0);
  assertEquals(first, T0);

  // 40 minutes in, the app is backgrounded and the WebView is rebuilt; the draft restores and the
  // component mounts again. Pre-fix this restamped the start to now and the session became "0 min".
  const second = ensureSessionStart(s, KEY_UPPER, T0 + 40 * MIN);
  assertEquals(second, T0, 'a remount must return the ORIGINAL start');

  // ...and again, twice more mid-session.
  assertEquals(ensureSessionStart(s, KEY_UPPER, T0 + 41 * MIN), T0);
  assertEquals(ensureSessionStart(s, KEY_UPPER, T0 + 52 * MIN), T0);

  // Save at 62 minutes reports 62, not the 10 since the last remount.
  assertEquals(elapsedMinutesForSave(second, T0 + 62 * MIN), 62);
});

Deno.test('the logger\'s own mount sequence, end to end (planned session, interrupted twice)', () => {
  // Mirrors StrengthLogger's `computeSessionKey` verbatim. If that expression changes and this
  // does not, the clock and the draft have started keying differently — which is the whole failure
  // mode D-132 was written to stop.
  const computeSessionKey = (date: string, id: string | null) => `strength_logger_session_${date}_${id || 'adhoc'}`;
  const DATE = '2026-08-09';
  const PLANNED_ID = 'plan-upper';
  const s = mem();

  // MOUNT 1. `sourcePlannedId` is still null on the first pass, so the effect keys off the OPENED
  // workout's id — the same read `restoreSessionProgress` does.
  const key1 = computeSessionKey(DATE, PLANNED_ID);
  const start1 = ensureSessionStart(s, key1, T0);
  // ...then `sourcePlannedId` hydrates, the effect re-runs, and the key is identical: no migration,
  // no phantom 'adhoc' slot.
  assertEquals(computeSessionKey(DATE, PLANNED_ID), key1);
  assertEquals(ensureSessionStart(s, key1, T0 + 200), start1);

  // 25 min in: the athlete leaves for the calendar and comes back. Component remounts, draft
  // restores, refs are new. Pre-fix the session became "0 min" here.
  const start2 = ensureSessionStart(s, computeSessionKey(DATE, PLANNED_ID), T0 + 25 * MIN);
  assertEquals(start2, T0);

  // 48 min in: iOS kills and rebuilds the WebView on foreground. Same again.
  const start3 = ensureSessionStart(s, computeSessionKey(DATE, PLANNED_ID), T0 + 48 * MIN);
  assertEquals(start3, T0);

  // SAVE at 71 minutes.
  assertEquals(elapsedMinutesForSave(start3, T0 + 71 * MIN), 71);
  // ...and the slot is released with the draft, so tomorrow's session starts clean.
  clearSessionStart(s, computeSessionKey(DATE, PLANNED_ID), T0 + 71 * MIN);
  assertEquals(readSessionStart(s, computeSessionKey(DATE, PLANNED_ID), T0 + 71 * MIN), null);
});

Deno.test('a session backgrounded for 20 minutes counts the time away', () => {
  const s = mem();
  const start = ensureSessionStart(s, KEY_UPPER, T0);
  // JS tick suspended out there; elapsed is derived from the clock, so nothing is lost.
  assertEquals(elapsedSeconds(start, T0 + 20 * MIN), 1200);
  assertEquals(readSessionStart(s, KEY_UPPER, T0 + 20 * MIN), T0);
});

// ── IDENTITY SCOPE (D-132) ───────────────────────────────────────────────────────────────────
Deno.test("Upper's start never leaks into Lower", () => {
  const s = mem();
  ensureSessionStart(s, KEY_UPPER, T0);
  assertEquals(readSessionStart(s, KEY_LOWER, T0 + 5 * MIN), null);
  const lower = ensureSessionStart(s, KEY_LOWER, T0 + 5 * MIN);
  assertEquals(lower, T0 + 5 * MIN);
  assertEquals(readSessionStart(s, KEY_UPPER, T0 + 5 * MIN), T0, 'Upper is untouched');
});

Deno.test('key move: destination wins, so a resumed session keeps its real start', () => {
  const s = mem();
  // The real planned session started 30 min ago...
  ensureSessionStart(s, KEY_UPPER, T0);
  // ...and this mount transiently keyed ad-hoc before identity settled.
  ensureSessionStart(s, KEY_ADHOC, T0 + 30 * MIN);
  const kept = moveSessionStart(s, KEY_ADHOC, KEY_UPPER, T0 + 30 * MIN);
  assertEquals(kept, T0, 'the existing planned start wins over the transient one');
  assertEquals(readSessionStart(s, KEY_ADHOC, T0 + 30 * MIN), null, 'the transient slot is dropped');
});

Deno.test('key move: an ad-hoc session that picks a planned workout carries its clock over', () => {
  const s = mem();
  ensureSessionStart(s, KEY_ADHOC, T0);
  const moved = moveSessionStart(s, KEY_ADHOC, KEY_UPPER, T0 + 12 * MIN);
  assertEquals(moved, T0);
  assertEquals(readSessionStart(s, KEY_UPPER, T0 + 12 * MIN), T0);
  assertEquals(readSessionStart(s, KEY_ADHOC, T0 + 12 * MIN), null);
});

// ── EXPIRY + HYGIENE ─────────────────────────────────────────────────────────────────────────
Deno.test('a start older than the 24h draft window is not resumed', () => {
  const s = mem();
  ensureSessionStart(s, KEY_UPPER, T0);
  const later = T0 + SESSION_CLOCK_TTL_MS + MIN;
  assertEquals(readSessionStart(s, KEY_UPPER, later), null);
  assertEquals(ensureSessionStart(s, KEY_UPPER, later), later, 'a stale slot restamps fresh');
});

Deno.test('expired slots are pruned on write', () => {
  const s = mem();
  ensureSessionStart(s, KEY_UPPER, T0);
  ensureSessionStart(s, KEY_LOWER, T0 + SESSION_CLOCK_TTL_MS + MIN);
  const stored = JSON.parse(s._dump()[SESSION_CLOCK_KEY]);
  assertEquals(Object.keys(stored), [KEY_LOWER]);
});

Deno.test('clear removes only that session', () => {
  const s = mem();
  ensureSessionStart(s, KEY_UPPER, T0);
  ensureSessionStart(s, KEY_LOWER, T0);
  clearSessionStart(s, KEY_UPPER, T0);
  assertEquals(readSessionStart(s, KEY_UPPER, T0), null);
  assertEquals(readSessionStart(s, KEY_LOWER, T0), T0);
});

Deno.test('corrupt or missing storage degrades to a fresh start, never throws', () => {
  const bad = mem({ [SESSION_CLOCK_KEY]: '{not json' });
  assertEquals(ensureSessionStart(bad, KEY_UPPER, T0), T0);
  const arr = mem({ [SESSION_CLOCK_KEY]: '[1,2,3]' });
  assertEquals(readSessionStart(arr, KEY_UPPER, T0), null);
  const junk = mem({ [SESSION_CLOCK_KEY]: JSON.stringify({ [KEY_UPPER]: 'abc' }) });
  assertEquals(readSessionStart(junk, KEY_UPPER, T0), null);
});

// ── DISPLAY + SAVE ───────────────────────────────────────────────────────────────────────────
Deno.test('elapsed never runs backwards on a clock change', () => {
  assertEquals(elapsedSeconds(T0, T0 - 5 * MIN), 0);
  assertEquals(elapsedSeconds(null, T0), 0);
  assertEquals(elapsedSeconds(undefined, T0), 0);
});

Deno.test('header format: m:ss under an hour, h:mm:ss over', () => {
  assertEquals(formatElapsed(0), '0:00');
  assertEquals(formatElapsed(9), '0:09');
  assertEquals(formatElapsed(65), '1:05');
  assertEquals(formatElapsed(3599), '59:59');
  assertEquals(formatElapsed(3600), '1:00:00');
  assertEquals(formatElapsed(3725), '1:02:05');
  assertEquals(formatElapsed(-5), '0:00');
});

Deno.test('saved minutes round like before, and STRENGTH never saves 0', () => {
  assertEquals(elapsedMinutesForSave(T0, T0 + 62 * MIN), 62);
  assertEquals(elapsedMinutesForSave(T0, T0 + 62 * MIN + 40_000), 63, 'rounds, not floors');
  assertEquals(elapsedMinutesForSave(T0, T0 + 20_000), 1, 'a 20s session is 1 min, not 0');
  assertEquals(elapsedMinutesForSave(null, T0), 1);
});

Deno.test('MOBILITY keeps its old rounding — floor 0, unchanged by the strength clock', () => {
  // The fork exists so a mobility session cannot inherit a behaviour change from a feature that
  // was scoped to strength. floor 0 reproduces the pre-clock expression exactly.
  assertEquals(elapsedMinutesForSave(T0, T0 + 20_000, 0), 0, 'a 20s mobility session still saves 0');
  assertEquals(elapsedMinutesForSave(T0, T0 + 62 * MIN, 0), 62, 'and everything else is identical');
  assertEquals(elapsedMinutesForSave(T0, T0 + 62 * MIN + 40_000, 0), 63);
});

// ── THE EDITABLE FIELD (performance screen) ──────────────────────────────────────────────────
Deno.test('saved duration reads back as minutes under an hour, h/m over', () => {
  assertEquals(formatSessionMinutes(0), '—');
  assertEquals(formatSessionMinutes(null), '—');
  assertEquals(formatSessionMinutes(45), '45 min');
  assertEquals(formatSessionMinutes(59), '59 min');
  assertEquals(formatSessionMinutes(60), '1h');
  assertEquals(formatSessionMinutes(62), '1h 2m');
  assertEquals(formatSessionMinutes(125), '2h 5m');
});

Deno.test('the edit takes whole minutes and REJECTS rather than clamps', () => {
  assertEquals(parseEditedMinutes('62'), 62);
  assertEquals(parseEditedMinutes('  62 '), 62);
  assertEquals(parseEditedMinutes('1'), 1);
  assertEquals(parseEditedMinutes(String(MAX_SESSION_MINUTES)), MAX_SESSION_MINUTES);
  assertEquals(parseEditedMinutes(String(MAX_SESSION_MINUTES + 1)), null, 'out of range is rejected, not clamped');
  assertEquals(parseEditedMinutes('0'), null);
  assertEquals(parseEditedMinutes('-5'), null);
  assertEquals(parseEditedMinutes('62.5'), null, 'whole minutes only');
  assertEquals(parseEditedMinutes('an hour'), null);
  assertEquals(parseEditedMinutes(''), null);
});
