/**
 * EDGE FUNCTION: backfill-facts
 *
 * One-time (or re-runnable) backfill that calls compute-facts for every
 * completed workout that doesn't yet have a workout_facts row.
 *
 * Input:  { user_id?: string, limit?: number, force?: boolean }
 *   - user_id: honoured only for the service key (internal / scripts); a signed-in caller is scoped to their own JWT
 *   - limit:   optional, max workouts to process (default 500)
 *   - force:   if true, recompute even if workout_facts row exists
 *
 * Output: { processed, succeeded, failed, errors }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUserOrService, AuthError } from "../_shared/require-user.ts";

serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    // B1: identity comes from the verified JWT; the service key (internal fan-out / scripts) may name a user in the body. Body user_id is otherwise ignored.
    // A service call MUST name one user — the old "no user_id = every athlete" sweep is gone (B13).
    let userId: string;
    try {
      ({ userId } = await requireUserOrService(req, body.user_id));
    } catch (e) {
      if (e instanceof AuthError) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }
    const limit: number = Math.min(body.limit ?? 500, 2000);
    const force: boolean = body.force === true;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find workouts that need facts computed
    let query = supabase
      .from("workouts")
      .select("id")
      .eq("workout_status", "completed")
      .order("date", { ascending: false })
      .limit(limit);

    query = query.eq("user_id", userId);

    if (!force) {
      // Left-anti-join: only workouts without a workout_facts row.
      // Supabase JS doesn't support anti-joins, so we fetch existing facts
      // and filter in-memory. For small datasets this is fine.
      const { data: existingFacts } = await supabase
        .from("workout_facts")
        .select("workout_id")
        .limit(10000);
      const existingIds = new Set((existingFacts ?? []).map((f: any) => f.workout_id));

      const { data: workouts, error: wErr } = await query;
      if (wErr) throw wErr;

      const toProcess = (workouts ?? []).filter((w: any) => !existingIds.has(w.id));
      return await processWorkouts(toProcess, supabaseUrl, serviceKey, corsHeaders);
    }

    const { data: workouts, error: wErr } = await query;
    if (wErr) throw wErr;

    return await processWorkouts(workouts ?? [], supabaseUrl, serviceKey, corsHeaders);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function processWorkouts(
  workouts: { id: string }[],
  supabaseUrl: string,
  serviceKey: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process in batches of 10 to avoid overwhelming the edge runtime
  const batchSize = 10;
  for (let i = 0; i < workouts.length; i += batchSize) {
    const batch = workouts.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (w) => {
        const resp = await fetch(`${supabaseUrl}/functions/v1/compute-facts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
          },
          body: JSON.stringify({ workout_id: w.id }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`${w.id}: ${resp.status} ${text}`);
        }
        return resp.json();
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") succeeded++;
      else {
        failed++;
        errors.push(r.reason?.message ?? "unknown");
      }
    }
  }

  return new Response(
    JSON.stringify({
      processed: workouts.length,
      succeeded,
      failed,
      errors: errors.slice(0, 20),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
