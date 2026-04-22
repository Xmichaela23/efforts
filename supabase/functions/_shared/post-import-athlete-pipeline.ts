/**
 * After Strava/Garmin data lands in `workouts`, warm learned profile, memory, and weekly snapshot.
 * Each step is best-effort — failures are logged, never thrown.
 */
export async function runPostImportAthletePipeline(
  userId: string,
  logLabel = 'post-import-athlete-pipeline',
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !key) {
    console.error(`[${logLabel}] missing SUPABASE_URL or key`);
    return;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    apikey: key,
  };

  const run = async (name: string, path: string, body: Record<string, string>) => {
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        console.error(`[${logLabel}] ${name} non-OK:`, r.status, t);
      } else {
        console.log(`[${logLabel}] ${name} ok`);
      }
    } catch (e) {
      console.error(`[${logLabel}] ${name} error:`, e);
    }
  };

  await run('learn-fitness-profile', 'learn-fitness-profile', { user_id: userId });
  await run('recompute-athlete-memory', 'recompute-athlete-memory', { user_id: userId });
  await run('compute-snapshot', 'compute-snapshot', { user_id: userId });
}
