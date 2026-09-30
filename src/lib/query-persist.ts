/**
 * ⛔ TODAY AND STATE OPEN ON THE LAST NUMBERS THE PHONE HAD (2026-09-30).
 *
 * The query cache lived in memory only, so every launch started empty: Today showed a blank day and State
 * "No data" until the server answered. The field standard (stale-while-revalidate, the same shape TanStack's
 * own persister and most training apps use): keep the last answer on the device, paint it at launch, ask the
 * server behind it and swap in the new answer when it lands.
 *
 * Kept: the week that holds today (`weekUnified`, get-week) and State's payload for today (`coach-week`).
 * Nothing else. Both refetch as before — a restored week is older than its fresh window, so it refetches on
 * mount; a restored State copy is older than the 60 s shared window, so State reads `coach_cache` as before.
 *
 * Safety:
 *   · one account: the saved copy carries the user id and is dropped when another account is signed in;
 *   · cleared on sign-out;
 *   · a State copy below the client's version floor is not restored (the same floor `useCoachWeekContext`
 *     applies to `coach_cache`), so an app update never paints an old payload shape;
 *   · a copy older than MAX_AGE_MS is dropped; a save larger than MAX_BYTES is skipped.
 * Every storage call is wrapped: a private window or full storage only means the old behaviour.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { getStoredUserId, supabase } from '@/lib/supabase';
import { COACH_CLIENT_MIN_PAYLOAD_VERSION } from '@/lib/coach-contract';

const STORAGE_KEY = 'efforts:query-cache:v1';
/** OURS — a copy from yesterday still beats a blank screen for the second it takes to refresh; older is dropped. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** OURS — well inside the ~5 MB a WebView gives localStorage, which also holds the sign-in and logger drafts. */
const MAX_BYTES = 1_500_000;
/** OURS — one write per burst of cache updates. */
const SAVE_DEBOUNCE_MS = 1000;

type SavedEntry = { key: QueryKey; data: unknown; updatedAt: number };
type Saved = { userId: string; savedAt: number; entries: SavedEntry[] };

const todayISO = () => new Date().toLocaleDateString('en-CA');

/** The week holding today, or State's payload for today. */
function isKept(key: QueryKey): boolean {
  if (!Array.isArray(key)) return false;
  const today = todayISO();
  if (key[0] === 'weekUnified') {
    const from = String(key[3] ?? '');
    const to = String(key[4] ?? '');
    return !!from && !!to && from <= today && today <= to;
  }
  if (key[0] === 'coach-week') return String(key[2] ?? '') === today;
  return false;
}

/** The account a kept key belongs to: get-week's key carries it third, State's second. */
function keyUserId(key: QueryKey): string | null {
  if (!Array.isArray(key)) return null;
  const v = key[0] === 'weekUnified' ? key[2] : key[0] === 'coach-week' ? key[1] : null;
  return typeof v === 'string' ? v : null;
}

function coachVersionOk(data: unknown): boolean {
  const v = Number((data as { coach_payload_version?: unknown } | null)?.coach_payload_version ?? 0);
  return v >= COACH_CLIENT_MIN_PAYLOAD_VERSION;
}

function clearSaved(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}

/** Put the saved copy into the cache. Call once, before the first render. */
export function restoreQueryCache(queryClient: QueryClient): void {
  let saved: Saved | null = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { saved = null; }
  if (!saved || !Array.isArray(saved.entries)) return;
  const userId = getStoredUserId();
  if (!userId || saved.userId !== userId || Date.now() - Number(saved.savedAt || 0) > MAX_AGE_MS) {
    clearSaved();
    return;
  }
  for (const e of saved.entries) {
    try {
      if (!isKept(e.key) || e.data == null || keyUserId(e.key) !== userId) continue;
      if (e.key[0] === 'coach-week' && !coachVersionOk(e.data)) continue;
      // The saved time, not now: the cache then treats the copy as old and refreshes it behind the paint.
      queryClient.setQueryData(e.key, e.data, { updatedAt: Number(e.updatedAt) || 0 });
    } catch { /* one bad entry never blocks the rest */ }
  }
}

/** Save the kept entries whenever they change; clear them on sign-out. Call once. */
export function startQueryCachePersist(queryClient: QueryClient): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    const userId = getStoredUserId();
    if (!userId) return;
    const entries: SavedEntry[] = queryClient.getQueryCache().getAll()
      .filter((q) => q.state.data != null && isKept(q.queryKey) && keyUserId(q.queryKey) === userId)
      .map((q) => ({ key: q.queryKey, data: q.state.data, updatedAt: q.state.dataUpdatedAt }));
    if (!entries.length) return;
    try {
      const text = JSON.stringify({ userId, savedAt: Date.now(), entries } satisfies Saved);
      if (text.length > MAX_BYTES) return;
      localStorage.setItem(STORAGE_KEY, text);
    } catch { /* full or unavailable storage: keep the old behaviour */ }
  };
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || !isKept(event.query.queryKey)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DEBOUNCE_MS);
  });
  supabase.auth.onAuthStateChange((evt) => {
    if (evt === 'SIGNED_OUT') clearSaved();
  });
}
