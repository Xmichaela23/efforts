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
  readResumableStart,
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
Deno.test('the start is stamped ONCE and never moves (the under-count bug)', () => {
  const s = mem();
  // The session starts — Start tapped, or the first set logged.
  const first = ensureSessionStart(s, KEY_UPPER, T0);
  assertEquals(first, T0);

  // Everything downstream that could touch the start — a remount hydrating, the auto-start
  // fallback re-firing, a key migration landing back on the same slot — must return the ORIGINAL.
  // Pre-fix the start lived in component state, so each of these restamped it to now and the
  // session collapsed to the length of its last stretch.
  assertEquals(ensureSessionStart(s, KEY_UPPER, T0 + 40 * MIN), T0);
  assertEquals(ensureSessionStart(s, KEY_UPPER, T0 + 41 * MIN), T0);
  assertEquals(ensureSessionStart(s, KEY_UPPER, T0 + 52 * MIN), T0);

  // Save at 62 minutes reports 62, not the 10 since the last remount.
  assertEquals(elapsedMinutesForSave(T0, T0 + 62 * MIN), 62);
});

/**
 * Mirrors StrengthLogger's `computeSessionKey` verbatim. If that expression changes and this does
 * not, the clock and the draft have started keying differently — the failure mode D-132 exists to
 * stop.
 */
const computeSessionKey = (date: string, id: string | null) => `strength_logger_session_${date}_${id || 'adhoc'}`;
const DATE = '2026-08-09';
const PLANNED_ID = 'plan-upper';

/**
 * The mount effect: READ, never stamp — and only resume a session with real logged work.
 * `hasLoggedWork` mirrors the component's "does a draft exist under this key" check.
 */
const mountHydrate = (s: ReturnType<typeof mem>, key: string, now: number, hasLoggedWork = true) =>
  readResumableStart(s, key, now, hasLoggedWork);
/** `beginSession` — the Start tap, and the auto-start fallback. */
const beginSession = (s: ReturnType<typeof mem>, key: string, now: number) => ensureSessionStart(s, key, now);

Deno.test('the logger\'s own sequence, end to end (Start tapped, then interrupted twice)', () => {
  const s = mem();
  const key = computeSessionKey(DATE, PLANNED_ID);

  // MOUNT. `sourcePlannedId` is still null on the first pass, so the effect keys off the OPENED
  // workout's id — the same read `restoreSessionProgress` does. Nothing is running yet.
  assertEquals(mountHydrate(s, key, T0), null, 'the logger opens NOT STARTED');

  // The athlete spends 6 minutes loading plates and swapping an exercise, THEN taps Start.
  const start = beginSession(s, key, T0 + 6 * MIN);
  assertEquals(start, T0 + 6 * MIN, 'the clock begins at the tap, not at the open');

  // 25 min of work later the athlete leaves for the calendar and comes back: remount, draft
  // restores, refs are new. Pre-fix the session became "0 min" here.
  assertEquals(mountHydrate(s, key, T0 + 31 * MIN), start, 'a remount RESUMES');

  // And again when iOS rebuilds the WebView on foreground.
  assertEquals(mountHydrate(s, key, T0 + 54 * MIN), start);

  // SAVE 71 minutes after the tap — and the 6 minutes of setup before it are not in the number.
  assertEquals(elapsedMinutesForSave(start, T0 + 77 * MIN), 71);

  // The slot is released with the draft, so tomorrow's session opens NOT STARTED again.
  clearSessionStart(s, key, T0 + 77 * MIN);
  assertEquals(mountHydrate(s, key, T0 + 77 * MIN), null);
});

Deno.test('a mount NEVER stamps — opening the logger repeatedly starts nothing', () => {
  const s = mem();
  const key = computeSessionKey(DATE, PLANNED_ID);
  assertEquals(mountHydrate(s, key, T0), null);
  assertEquals(mountHydrate(s, key, T0 + 3 * MIN), null);
  assertEquals(mountHydrate(s, key, T0 + 90 * MIN), null, 'still not started 90 minutes later');
  assertEquals(s._dump()[SESSION_CLOCK_KEY], undefined, 'and nothing was ever written');
});

// ── REGRESSION: the phantom clock ("its just going and the only way to stop it is to load a rep")
Deno.test('an ABANDONED open leaves no clock for the next session to inherit', () => {
  const s = mem();
  const key = computeSessionKey(DATE, null);   // the day's ad-hoc slot

  // Session A: the athlete opens the logger, taps Start, logs nothing, and leaves.
  beginSession(s, key, T0);

  // Session B, later the same day: a FRESH open of the same ad-hoc slot. There is no draft under
  // this key (no set was ever completed), so there is nothing to resume — the logger must offer
  // Start, not a clock already at 40 minutes that has no Stop next to it.
  assertEquals(mountHydrate(s, key, T0 + 40 * MIN, /* hasLoggedWork */ false), null);

  // ...and the abandoned slot is GONE, not merely ignored. Left in place it would come back on
  // the next open, which is exactly how this was reported.
  assertEquals(readSessionStart(s, key, T0 + 40 * MIN), null, 'the stale slot is cleared, not skipped');
  assertEquals(mountHydrate(s, key, T0 + 41 * MIN, true), null, 'and it cannot resurrect');
});

Deno.test('a session WITH logged work still resumes across a remount', () => {
  const s = mem();
  const key = computeSessionKey(DATE, PLANNED_ID);
  const start = beginSession(s, key, T0);
  // A set has been completed, so the draft exists and the resume gate opens.
  assertEquals(mountHydrate(s, key, T0 + 40 * MIN, true), start);
  assertEquals(elapsedMinutesForSave(start, T0 + 40 * MIN), 40);
});

Deno.test('SAFETY NET: a set logged before Start is tapped starts the clock there', () => {
  const s = mem();
  const key = computeSessionKey(DATE, PLANNED_ID);
  assertEquals(mountHydrate(s, key, T0), null);
  // The athlete ignores Start and goes straight to lifting. The first completed set fires the
  // auto-start — this is the line that stops a real session saving at zero.
  const start = beginSession(s, key, T0 + 2 * MIN);
  assertEquals(start, T0 + 2 * MIN);
  assertEquals(elapsedMinutesForSave(start, T0 + 47 * MIN), 45);
});

Deno.test('the safety net can never RESET a running clock, however often it fires', () => {
  const s = mem();
  const key = computeSessionKey(DATE, PLANNED_ID);
  const start = beginSession(s, key, T0);          // Start tapped
  // Every later completed set re-evaluates the auto-start guard. Even if the null-check were to
  // let one through, `ensureSessionStart` is idempotent and the original stamp survives.
  assertEquals(beginSession(s, key, T0 + 5 * MIN), start);
  assertEquals(beginSession(s, key, T0 + 40 * MIN), start);
  assertEquals(elapsedMinutesForSave(start, T0 + 40 * MIN), 40);
});

Deno.test('a restored draft that already holds completed sets resumes, it does not re-stamp', () => {
  const s = mem();
  const key = computeSessionKey(DATE, PLANNED_ID);
  const start = beginSession(s, key, T0);
  // Remount: the hydrate effect and the auto-start effect both run off the same commit, and on
  // that pass `workoutStartMs` is still null — so the safety net fires too. It must be harmless.
  const hydrated = mountHydrate(s, key, T0 + 33 * MIN);
  const autoStarted = beginSession(s, key, T0 + 33 * MIN);
  assertEquals(hydrated, start);
  assertEquals(autoStarted, start, 'the double-fire on remount returns the ORIGINAL stamp');
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
