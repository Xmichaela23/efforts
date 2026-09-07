// delete-account — the athlete deletes their own account (docs/WORKORDER-account-2026-09-06.md §4).
//
// Apple review guideline 5.1.1(v): an app that creates accounts must let the user delete the account
// in-app. Called with the user's OWN JWT; the id comes from `requireUser` (the verified token), never
// from the body, so the only account this can delete is the caller's.
//
// Order:
//   1. every object under avatars/<uid>/ in storage
//   2. delete_user_data(uid) — a SECURITY DEFINER SQL function (migration 20260906120000) that sweeps
//      every public table with a `user_id` column, discovered at run time from information_schema, so
//      a table added later is covered without touching this function. Only a few tables cascade from
//      auth.users in production; the sweep is what makes the delete complete.
//   3. auth.admin.deleteUser(uid) with the service role
//   4. { deleted: true }; the uid and per-table counts go to the function log.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUser } from '../_shared/require-user.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const AVATARS_BUCKET = 'avatars';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info, x-supabase-authorization',
  } as Record<string, string>;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors() } });

/** Remove everything under <uid>/ in the avatars bucket. Returns the number of objects removed. */
async function deleteAvatars(uid: string): Promise<number> {
  const { data: objects, error } = await admin.storage.from(AVATARS_BUCKET).list(uid, { limit: 1000 });
  if (error) throw new Error(`avatars list: ${error.message}`);
  const paths = (objects ?? []).filter((o) => o.name).map((o) => `${uid}/${o.name}`);
  if (paths.length === 0) return 0;
  const { error: rmErr } = await admin.storage.from(AVATARS_BUCKET).remove(paths);
  if (rmErr) throw new Error(`avatars remove: ${rmErr.message}`);
  return paths.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let userId: string;
  try {
    ({ userId } = await requireUser(req));
  } catch (e) {
    return json({ error: `${e}` }, (e as { status?: number })?.status ?? 401);
  }

  try {
    const avatars = await deleteAvatars(userId);

    const { data: counts, error: rpcErr } = await admin.rpc('delete_user_data', { uid: userId });
    if (rpcErr) throw new Error(`delete_user_data: ${rpcErr.message}`);

    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) throw new Error(`auth delete: ${authErr.message}`);

    console.log(JSON.stringify({ event: 'account_deleted', user_id: userId, avatars, tables: counts }));
    return json({ deleted: true });
  } catch (e) {
    console.error(JSON.stringify({ event: 'account_delete_failed', user_id: userId, error: `${e}` }));
    return json({ error: `${e}` }, 500);
  }
});
