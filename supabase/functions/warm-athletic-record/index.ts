/**
 * warm-athletic-record — rebuilds one athlete's Record-tab cache, away from any tap.
 *
 * ⛔ THIS IS WHY THE TAB IS FAST. The cache used to be written by the first request that missed,
 * which meant the athlete paid for it: 3.1 s and 383 KB on a cold open, and because `as_of` expires
 * the row daily, that was the FIRST OPEN OF EVERY DAY. Measured on his phone 2026-09-20, it drew
 * nothing but the Race results card — that one reads `goals` directly and does not wait.
 *
 * Now the row is written here instead, and the request only ever reads it:
 *   · when a workout arrives, is edited, is deleted or is recomputed — queued by
 *     `_shared/invalidate-user-training-cache.ts`, which every one of those paths already calls;
 *   · for the date roll, queued by the same helper's caller or by hand.
 *
 * ⚠️ A STALE ROW IS STILL SERVED while this runs (`build.ts cacheIsStale`). The athlete never waits
 * for a rebuild; at worst they see numbers a day old for a moment.
 *
 * POST { user_id } — service role only, or the athlete refreshing their own.
 * → { success, refreshed }
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUserOrService, AuthError } from '../_shared/require-user.ts';
import { refreshAthleticRecordCache } from '../_shared/athletic-record/build.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as Record<string, string>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const { userId } = await requireUserOrService(req, typeof body?.user_id === 'string' ? body.user_id : null);
    // Service client: the cache row is service-owned so nothing on a phone can write one.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const payload = await refreshAthleticRecordCache(supabase, userId, 'warm-athletic-record');
    return json({ success: true, refreshed: payload != null });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    console.error('[warm-athletic-record]', e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
