// One-shot: re-cluster a user's run + ride history with PATH-based identity (the same
// resolveRouteCluster the live pipeline uses), so their forward runs stand on real route counts.
//
// dry_run (default true): read-only — reports the current (broken) clusters + how many workouts would
// be reprocessed. Nothing changes.
// dry_run false: deactivates the old clusters (NON-destructive — is_active=false, reversible), then
// re-clusters chronologically. For runs it re-points the existing route_progress_metrics row to the new
// cluster so the efficiency history is preserved (not recomputed). Displayed route data on an OLD run
// updates when that run is next recomputed; new runs show correct immediately.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveRouteCluster } from "../_shared/route-intelligence.ts";

const ROUTE_TYPES = ["run", "running", "walk", "ride", "bike", "cycling", "virtualride"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
}
const miles = (m: number | null | undefined) => (m ? Math.round((Number(m) / 1609.34) * 10) / 10 : null);

serve(async (req) => {
  try {
    const { user_id, dry_run = true, limit = 5000 } = await req.json().catch(() => ({}));
    if (!user_id) return json({ error: "user_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Completed run + ride workouts, OLDEST FIRST (clusters build up chronologically).
    const { data: workouts, error: wErr } = await supabase
      .from("workouts")
      .select("id,user_id,type,date,distance,elevation_gain,start_position_lat,start_position_long,gps_track,computed,workout_status")
      .eq("user_id", user_id)
      .in("type", ROUTE_TYPES)
      .eq("workout_status", "completed")
      .order("date", { ascending: true })
      .limit(Number(limit) || 5000);
    if (wErr) throw wErr;
    const runs = workouts ?? [];
    const withGps = runs.filter((w: any) => {
      try { const t = typeof w.gps_track === "string" ? JSON.parse(w.gps_track) : w.gps_track; return Array.isArray(t) && t.length > 0; } catch { return false; }
    }).length;

    // Current ("before") clusters.
    const { data: before } = await supabase
      .from("route_clusters").select("id,name,sample_count,distance_m,is_active,metadata")
      .eq("user_id", user_id);
    const beforeActive = (before ?? []).filter((c: any) => c.is_active);
    const withPath = beforeActive.filter((c: any) => Array.isArray((c.metadata || {}).geohashes)).length;

    if (dry_run) {
      const top = [...beforeActive].sort((a: any, b: any) => (b.sample_count || 0) - (a.sample_count || 0)).slice(0, 12);
      return json({
        dry_run: true,
        note: "Nothing changed. Re-send with dry_run:false to rebuild.",
        workouts_to_process: runs.length,
        workouts_with_gps_track: withGps,
        before: {
          active_clusters: beforeActive.length,
          clusters_with_path_signature: withPath,
          top_clusters: top.map((c: any) => ({ name: c.name, count: c.sample_count, dist_mi: miles(c.distance_m) })),
        },
      });
    }

    // RUN MODE — deactivate old clusters (non-destructive), then re-cluster chronologically.
    await supabase.from("route_clusters").update({ is_active: false }).eq("user_id", user_id);

    let processed = 0, skippedShort = 0, errors = 0, metricsRepointed = 0;
    const errSamples: string[] = [];
    for (const w of runs) {
      try {
        const r = await resolveRouteCluster(supabase, w as any);
        if (!r) { skippedShort++; continue; }
        processed++;
        // Preserve run efficiency history: move this run's metrics row to the new cluster (values valid).
        const t = String((w as any).type || "").toLowerCase();
        if (t === "run" || t === "running" || t === "walk" || t.includes("run")) {
          const { error: mErr } = await supabase
            .from("route_progress_metrics")
            .update({ route_cluster_id: r.cluster.id })
            .eq("user_id", user_id).eq("workout_id", (w as any).id);
          if (!mErr) metricsRepointed++;
        }
      } catch (e) {
        errors++;
        if (errSamples.length < 5) errSamples.push(`${(w as any).id}: ${String((e as any)?.message ?? e)}`);
      }
    }

    const { data: after } = await supabase
      .from("route_clusters").select("id,name,sample_count,distance_m").eq("user_id", user_id).eq("is_active", true);
    const afterSorted = [...(after ?? [])].sort((a: any, b: any) => (b.sample_count || 0) - (a.sample_count || 0));

    return json({
      dry_run: false,
      workouts_total: runs.length,
      processed, skipped_too_short: skippedShort, errors, err_samples: errSamples, metrics_repointed: metricsRepointed,
      before_active_clusters: beforeActive.length,
      after: {
        active_routes: afterSorted.length,
        top_routes: afterSorted.slice(0, 20).map((c: any) => ({ name: c.name, count: c.sample_count, dist_mi: miles(c.distance_m) })),
      },
      note: "Route groupings rebuilt. To SEE it on an old run, recompute that run (rebuilds its stored fact packet). New runs show correct immediately.",
    });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
