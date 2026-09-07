/**
 * EDGE FUNCTION: readiness
 * POST { user_id, as_of? } — returns readiness_v1 snapshot (read-only).
 * Caller must be authenticated; the user is the JWT's (body user_id is honoured only for the service key).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUserOrService, AuthError } from "../_shared/require-user.ts";
import { buildReadiness } from "../_shared/readiness.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = (await req.json().catch(() => ({}))) as { user_id?: string; as_of?: string };
    // B1: identity comes from the verified JWT; the service key (internal fan-out / scripts) may name a user in the body. Body user_id is otherwise ignored.
    let userId: string;
    try {
      ({ userId } = await requireUserOrService(req, body.user_id));
    } catch (e) {
      if (e instanceof AuthError) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }

    const asOf = body.as_of ? new Date(body.as_of) : new Date();
    if (Number.isNaN(asOf.getTime())) {
      return new Response(JSON.stringify({ error: "Invalid as_of" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const snapshot = await buildReadiness(supabase, userId, asOf);

    return new Response(JSON.stringify(snapshot), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
