/**
 * THE SESSION CLOCK — how long this strength session has been running.
 *
 * ⛔ THE BUG THIS EXISTS TO KILL. The logger's session start was `useState<Date>(new Date())` —
 * a value that lives and dies with the component. Every remount restamped it to NOW while the
 * DRAFT (exercises, sets, notes) restored intact from localStorage. So an interrupted session —
 * navigate out and back, the iOS cold-start restore, the foreground reopen — saved only the
 * length of its LAST stretch. Strength durations were silently UNDER-counted, and the longer the
 * session (the more chances to be interrupted), the worse the lie.
 *
 * THE RULE IS THE ONE Q-TIMER ALREADY ESTABLISHED FOR REST: elapsed is a DERIVED value, never an
 * authority. The authority is `startedAt` — an absolute wall-clock stamp, persisted. Elapsed is
 * then `now - startedAt`, which is self-correcting by construction: it cannot drift while the JS
 * tick is suspended, and it needs no reconcile pass of its own. A backgrounded session, a killed
 * WebView and a screen the athlete simply walked away from all read correctly on return.
 *
 * IDENTITY-SCOPED, like the draft (D-132). The key passed in here is the draft's own
 * `computeSessionKey(...)` string — date + workout identity — so Upper's clock can never be read
 * as Lower's. Callers must pass that key rather than build their own, or the two go out of sync.
 *
 * Run: ~/.deno/bin/deno test --no-check src/lib/strength-session-clock.test.ts
 */

/** localStorage slot: one map of sessionKey -> startedAt (epoch ms). */
export const SESSION_CLOCK_KEY = 'strength_session_starts_v1';

/**
 * Same 24h window the draft uses (`restoreSessionProgress`). A start older than that belongs to
 * a session whose draft has already expired — resuming its clock would report a duration measured
 * in days. Pruned on every write.
 */
export const SESSION_CLOCK_TTL_MS = 24 * 60 * 60 * 1000;

export type SessionStarts = Record<string, number>;

/** The slice of localStorage this module needs — so tests can hand it a plain object. */
export interface ClockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function readAll(storage: ClockStorage): SessionStarts {
  try {
    const raw = storage.getItem(SESSION_CLOCK_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: SessionStarts = {};
    for (const [k, ms] of Object.entries(v as Record<string, unknown>)) {
      const n = Number(ms);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  } catch { return {}; }
}

function writeAll(storage: ClockStorage, all: SessionStarts, nowMs: number): void {
  try {
    // Prune expired slots on every write — nothing else sweeps this map, and an unbounded
    // date+identity keyspace would otherwise grow one entry per session forever.
    const live: SessionStarts = {};
    for (const [k, ms] of Object.entries(all)) {
      if (nowMs - ms < SESSION_CLOCK_TTL_MS) live[k] = ms;
    }
    storage.setItem(SESSION_CLOCK_KEY, JSON.stringify(live));
  } catch { /* quota / private mode — the clock degrades to this mount, never throws mid-session */ }
}

/** The persisted start for `key`, or null when absent or expired. Never writes. */
export function readSessionStart(storage: ClockStorage, key: string, nowMs: number): number | null {
  if (!key) return null;
  const ms = readAll(storage)[key];
  if (!Number.isFinite(ms)) return null;
  if (nowMs - ms >= SESSION_CLOCK_TTL_MS) return null;
  return ms;
}

/**
 * Stamp the start for `key` if there isn't a live one, and return the start in force.
 *
 * IDEMPOTENT BY DESIGN — this is the whole fix. It runs on EVERY mount, and on every mount after
 * the first it returns the ORIGINAL stamp rather than overwriting it. A remount therefore resumes
 * the clock instead of restarting it.
 */
export function ensureSessionStart(storage: ClockStorage, key: string, nowMs: number): number {
  if (!key) return nowMs;
  const all = readAll(storage);
  const existing = all[key];
  if (Number.isFinite(existing) && nowMs - existing < SESSION_CLOCK_TTL_MS) return existing;
  all[key] = nowMs;
  writeAll(storage, all, nowMs);
  return nowMs;
}

/** Drop a session's start (on save, or when the draft is discarded). */
export function clearSessionStart(storage: ClockStorage, key: string, nowMs: number): void {
  if (!key) return;
  const all = readAll(storage);
  if (!(key in all)) return;
  delete all[key];
  writeAll(storage, all, nowMs);
}

/**
 * Follow the session when its key moves — the athlete changed the performed date, or picked a
 * planned workout after opening ad-hoc. Both rewrite `computeSessionKey`.
 *
 * THE DESTINATION WINS. If `to` already holds a start, that one is the session's real beginning
 * (e.g. a resumed planned session whose first render keyed ad-hoc); adopting `from` would import
 * a stale clock. In that case `from` is simply dropped.
 */
export function moveSessionStart(storage: ClockStorage, from: string, to: string, nowMs: number): number | null {
  if (!from || !to || from === to) return readSessionStart(storage, to, nowMs);
  const all = readAll(storage);
  const dest = all[to];
  if (Number.isFinite(dest) && nowMs - dest < SESSION_CLOCK_TTL_MS) {
    delete all[from];
    writeAll(storage, all, nowMs);
    return dest;
  }
  const src = all[from];
  delete all[from];
  if (Number.isFinite(src) && nowMs - src < SESSION_CLOCK_TTL_MS) {
    all[to] = src;
    writeAll(storage, all, nowMs);
    return src;
  }
  writeAll(storage, all, nowMs);
  return null;
}

/** Seconds since the start, floored, never negative (a clock change must not print "-3"). */
export function elapsedSeconds(startMs: number | null | undefined, nowMs: number): number {
  if (!Number.isFinite(startMs as number) || !(startMs as number) || startMs == null) return 0;
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

/** m:ss under an hour, h:mm:ss at or over it — the Strong/Hevy header format. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

/**
 * What gets SAVED as `workouts.duration` (minutes).
 *
 * Rounds exactly like the code it replaces. `floorMinutes` is the one addition, and it is a
 * DELIBERATE FORK between the two modes that share this logger:
 *
 *   · STRENGTH passes 1. A sub-30-second save used to round to 0, and 0 reads downstream as "no
 *     duration recorded" rather than "a very short session" — the new editable field on the
 *     performance screen then shows "—" for a session that really happened.
 *   · MOBILITY passes 0, keeping its pre-existing behaviour byte for byte. Mobility has no session
 *     clock and was explicitly out of scope; it must not inherit a rounding change as a side
 *     effect of a strength feature.
 */
export function elapsedMinutesForSave(
  startMs: number | null | undefined,
  nowMs: number,
  floorMinutes = 1,
): number {
  const secs = elapsedSeconds(startMs, nowMs);
  return Math.max(floorMinutes, Math.round(secs / 60));
}

/** Longest editable session. A strength session past this is a typo, not a workout. */
export const MAX_SESSION_MINUTES = 600;

/** How a saved duration reads back on the performance screen. */
export function formatSessionMinutes(minutes: number | null | undefined): string {
  const m = Math.round(Number(minutes) || 0);
  if (!(m > 0)) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

/**
 * What the athlete typed into the editable duration field, or null if it isn't a duration.
 *
 * Whole minutes only — the clock is honest to the second while the session runs, but a duration
 * corrected after the fact is a recollection ("about an hour"), and offering seconds there would
 * be false precision. Rejects rather than clamps: silently turning 9000 into 600 writes a number
 * the athlete never chose.
 */
export function parseEditedMinutes(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s || !/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1 || n > MAX_SESSION_MINUTES) return null;
  return n;
}
