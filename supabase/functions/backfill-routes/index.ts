// One-shot (batched): re-cluster a user's run + ride history with PATH-based identity (the same
// resolveRouteCluster the live pipeline uses), so their forward runs stand on real route counts.
//
// dry_run (default true): read-only, LEAN (no GPS payload) — counts workouts + previews current clusters.
// Run mode is BATCHED to fit the 150s edge limit: { dry_run:false, offset, batch }.
//   - offset 0 deactivates the old clusters (NON-destructive, is_active=false, reversible) first.
//   - processes `batch` workouts (oldest→newest) from `offset`, returns next_offset (or done:true).
//   - re-invoke with the returned next_offset until done. Order matters — go offset 0, then ascending.
// For runs it re-points route_progress_metrics to the new cluster (efficiency history preserved).
// Old runs show correct on their next recompute; new runs immediately.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveRouteCluster } from "../_shared/route-intelligence.ts";

const ROUTE_TYPES = ["run", "running", "walk", "ride", "bike", "cycling", "virtualride"];
const DEFAULT_BATCH = 80;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
}
const miles = (m: number | null | undefined) => (m ? Math.round((Number(m) / 1609.34) * 10) / 10 : null);
const isRunType = (t: string) => t === "run" || t === "running" || t === "walk" || t.includes("run");

async function clusterSummary(supabase: any, user_id: string) {
  const { data } = await supabase
    .from("route_clusters").select("name,sample_count,distance_m").eq("user_id", user_id).eq("is_active", true);
  const sorted = [...(data ?? [])].sort((a: any, b: any) => (b.sample_count || 0) - (a.sample_count || 0));
  return { active_routes: sorted.length, top_routes: sorted.slice(0, 20).map((c: any) => ({ name: c.name, count: c.sample_count, dist_mi: miles(c.distance_m) })) };
}

serve(async (req) => {
  try {
    const { user_id, dry_run = true, offset = 0, batch = DEFAULT_BATCH } = await req.json().catch(() => ({}));
    if (!user_id) return json({ error: "user_id required" }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Total route workouts (lean — head count, no payload).
    const { count: total } = await supabase
      .from("workouts").select("id", { count: "exact", head: true })
      .eq("user_id", user_id).in("type", ROUTE_TYPES).eq("workout_status", "completed");
    const totalRoutes = total ?? 0;

    if (dry_run) {
      const { data: before } = await supabase
        .from("route_clusters").select("name,sample_count,distance_m,is_active,metadata").eq("user_id", user_id);
      const active = (before ?? []).filter((c: any) => c.is_active);
      const withPath = active.filter((c: any) => Array.isArray((c.metadata || {}).geohashes)).length;
      const top = [...active].sort((a: any, b: any) => (b.sample_count || 0) - (a.sample_count || 0)).slice(0, 12);
      return json({
        dry_run: true,
        note: "Read-only, nothing changed. Run with {dry_run:false, offset:0} then repeat with each returned next_offset until done:true.",
        route_workouts_total: totalRoutes,
        recommended_batch: DEFAULT_BATCH,
        before: {
          active_clusters: active.length,
          clusters_with_path_signature: withPath,
          top_clusters: top.map((c: any) => ({ name: c.name, count: c.sample_count, dist_mi: miles(c.distance_m) })),
        },
      });
    }

    // RUN MODE (batched).
    if (offset === 0) {
      await supabase.from("route_clusters").update({ is_active: false }).eq("user_id", user_id);
    }

    // Fetch this batch (oldest→newest) WITH gps_track.
    const { data: batchRows, error: bErr } = await supabase
      .from("workouts")
      .select("id,user_id,type,date,distance,elevation_gain,start_position_lat,start_position_long,gps_track,computed,workout_status")
      .eq("user_id", user_id).in("type", ROUTE_TYPES).eq("workout_status", "completed")
      .order("date", { ascending: true })
      .range(offset, offset + Number(batch) - 1);
    if (bErr) throw bErr;
    const rows = batchRows ?? [];

    let processed = 0, skippedShort = 0, errors = 0, metricsRepointed = 0;
    const errSamples: string[] = [];
    for (const w of rows) {
      try {
        const r = await resolveRouteCluster(supabase, w as any);
        if (!r) { skippedShort++; continue; }
        processed++;
        if (isRunType(String((w as any).type || "").toLowerCase())) {
          const { error: mErr } = await supabase.from("route_progress_metrics")
            .update({ route_cluster_id: r.cluster.id }).eq("user_id", user_id).eq("workout_id", (w as any).id);
          if (!mErr) metricsRepointed++;
        }
      } catch (e) {
        errors++;
        if (errSamples.length < 5) errSamples.push(`${(w as any).id}: ${String((e as any)?.message ?? e)}`);
      }
    }

    const done = rows.length < Number(batch);
    return json({
      dry_run: false,
      batch_offset: offset,
      batch_size: rows.length,
      processed, skipped_too_short: skippedShort, errors, err_samples: errSamples, metrics_repointed: metricsRepointed,
      route_workouts_total: totalRoutes,
      next_offset: done ? null : offset + rows.length,
      done,
      current: await clusterSummary(supabase, user_id),
    });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
