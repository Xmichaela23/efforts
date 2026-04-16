/**
 * Called by Supabase Database Webhook on INSERT to public.users (new auth signups).
 *
 * Dashboard: Database → Webhooks → table public.users, INSERT only,
 * URL: https://<project>.supabase.co/functions/v1/notify-admin-signup,
 * HTTP header: x-notify-secret: <NOTIFY_HOOK_SECRET>
 *
 * Secrets: NOTIFY_HOOK_SECRET, RESEND_API_KEY, NOTIFY_FROM_EMAIL (Resend-verified sender, e.g. noreply@efforts.work).
 * Optional: ADMIN_NOTIFY_EMAIL (defaults to michael@efforts.work).
 */
const DEFAULT_ADMIN_EMAIL = 'michael@efforts.work';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret',
};

type DbWebhookBody = {
  type?: string;
  table?: string;
  record?: {
    id?: string;
    email?: string;
    full_name?: string | null;
    approved?: boolean | null;
    created_at?: string;
  };
};

function extractRecord(body: unknown): DbWebhookBody['record'] | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (o.record && typeof o.record === 'object') {
    return o.record as DbWebhookBody['record'];
  }
  if (typeof o.email === 'string' && typeof o.id === 'string') {
    return o as DbWebhookBody['record'];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const secret = Deno.env.get('NOTIFY_HOOK_SECRET') || '';
  const hdr = req.headers.get('x-notify-secret') || '';
  if (!secret || hdr !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const record = extractRecord(payload);
  if (!record?.email) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no_email' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const email = record.email;
  const name = record.full_name || '(no name)';
  const id = record.id || '?';
  const approved = record.approved;

  const text =
    `New Efforts signup\n` +
    `Email: ${email}\n` +
    `Name: ${name}\n` +
    `User id: ${id}\n` +
    `approved flag: ${approved}\n`;

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NOTIFY_FROM_EMAIL');
  const adminTo = Deno.env.get('ADMIN_NOTIFY_EMAIL') || DEFAULT_ADMIN_EMAIL;

  if (!resendKey || !from) {
    console.warn(
      '[notify-admin-signup] Missing RESEND_API_KEY or NOTIFY_FROM_EMAIL; signup:',
      email,
    );
    return new Response(
      JSON.stringify({
        ok: false,
        skipped: true,
        hint: 'Set RESEND_API_KEY and NOTIFY_FROM_EMAIL (Resend) on this function',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [adminTo],
      subject: `New Efforts signup: ${email}`,
      text,
    }),
  });

  if (!r.ok) {
    const errText = await r.text();
    console.error('[notify-admin-signup] Resend failed:', r.status, errText);
    return new Response(JSON.stringify({ error: 'Email delivery failed' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, to: adminTo }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
