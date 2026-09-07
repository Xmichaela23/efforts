// The alarm (docs/WORKORDER-plumbing-2026-09-07.md §2).
//
// raise(kind, summary, detail): one row in public.alarms, and one email through Resend — at most one
// email per kind per 15 minutes; the rest only land in the table. withAlarm(fn, handler) wraps an edge
// handler: a throw or a 5xx response is reported, then passed through unchanged.
//
// Secrets: RESEND_API_KEY, NOTIFY_FROM_EMAIL (both already set for notify-admin-signup), ALARM_TO_EMAIL
// (falls back to ADMIN_NOTIFY_EMAIL). Never throws: an alarm that cannot be recorded or sent logs and
// returns; it must not turn the thing it is reporting into a second failure.
import { createClient } from 'jsr:@supabase/supabase-js@2';

/** OURS — one email per kind per 15 minutes: a dead analyser fails every ride, one message says so. */
export const ALARM_EMAIL_WINDOW_MS = 15 * 60 * 1000;

const PROJECT_REF = (() => {
  try { return new URL(String(Deno.env.get('SUPABASE_URL') || '')).hostname.split('.')[0] || 'yyriamwvtvzlkumqrvpm'; }
  catch { return 'yyriamwvtvzlkumqrvpm'; }
})();

export type AlarmDetail = {
  user_id?: string | null;
  workout_id?: string | null;
  step?: string | null;
  error?: string | null;
  function?: string | null;
  job_id?: number | null;
  attempts?: number | null;
  [k: string]: unknown;
};

export type RaiseResult = { row_id: number | null; emailed: boolean; email_id: string | null; skipped?: string };

/** Pure: send when there is no emailed alarm of this kind inside the window. */
export function shouldEmail(lastEmailedAtIso: string | null | undefined, now: Date, windowMs = ALARM_EMAIL_WINDOW_MS): boolean {
  if (!lastEmailedAtIso) return true;
  const last = Date.parse(lastEmailedAtIso);
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= windowMs;
}

export function subjectFor(kind: string, summary: string): string {
  return `efforts: ${kind} — ${summary}`.slice(0, 200);
}

export function logsUrlFor(fn: string | null | undefined): string {
  return fn
    ? `https://supabase.com/dashboard/project/${PROJECT_REF}/functions/${fn}/logs`
    : `https://supabase.com/dashboard/project/${PROJECT_REF}/functions`;
}

export function bodyFor(kind: string, summary: string, detail: AlarmDetail, at: Date): string {
  const lines = [
    `efforts alarm: ${kind}`,
    summary,
    '',
    `who:      ${detail.user_id ?? '-'}`,
    `workout:  ${detail.workout_id ?? '-'}`,
    `step:     ${detail.step ?? '-'}`,
    `function: ${detail.function ?? kind}`,
    `error:    ${String(detail.error ?? '-').slice(0, 1500)}`,
    detail.job_id != null ? `job:      #${detail.job_id} (attempt ${detail.attempts ?? '?'})` : null,
    `at:       ${at.toISOString()}`,
    '',
    `logs: ${logsUrlFor(detail.function ?? null)}`,
  ].filter((l) => l !== null);
  return lines.join('\n');
}

function svc() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

async function sendEmail(subject: string, text: string): Promise<{ id: string | null; error: string | null }> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NOTIFY_FROM_EMAIL');
  const to = Deno.env.get('ALARM_TO_EMAIL') || Deno.env.get('ADMIN_NOTIFY_EMAIL') || 'michael@efforts.work';
  if (!key || !from) return { id: null, error: 'RESEND_API_KEY / NOTIFY_FROM_EMAIL not set' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { id: null, error: `resend ${r.status}: ${JSON.stringify(body).slice(0, 300)}` };
    return { id: typeof body?.id === 'string' ? body.id : null, error: null };
  } catch (e) {
    return { id: null, error: (e as Error)?.message ?? String(e) };
  }
}

/**
 * Record + (rate-limited) email. Safe to call from any function; never throws.
 */
export async function raise(kind: string, summary: string, detail: AlarmDetail = {}): Promise<RaiseResult> {
  const now = new Date();
  const result: RaiseResult = { row_id: null, emailed: false, email_id: null };
  let supabase: ReturnType<typeof svc> | null = null;
  try { supabase = svc(); } catch (e) { console.error('[alarm] no client:', (e as Error)?.message ?? e); }

  // 1. the row — always, first
  let tableOk = false;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('alarms')
        .insert({ kind, summary: summary.slice(0, 500), detail, at: now.toISOString() })
        .select('id')
        .single();
      if (error) console.error('[alarm] alarms insert failed (table missing?):', error.message);
      else { result.row_id = Number(data?.id); tableOk = true; }
    } catch (e) {
      console.error('[alarm] alarms insert threw:', (e as Error)?.message ?? e);
    }
  }

  // 2. the rate limit — one email per kind per window. Without the table there is nothing to check
  //    against, so the email goes (better a duplicate than silence).
  let lastEmailedAt: string | null = null;
  if (supabase && tableOk) {
    try {
      const { data } = await supabase
        .from('alarms')
        .select('at')
        .eq('kind', kind)
        .eq('emailed', true)
        .gte('at', new Date(now.getTime() - ALARM_EMAIL_WINDOW_MS).toISOString())
        .order('at', { ascending: false })
        .limit(1)
        .maybeSingle();
      lastEmailedAt = data?.at ?? null;
    } catch (e) {
      console.warn('[alarm] rate-limit read failed:', (e as Error)?.message ?? e);
    }
  }
  if (!shouldEmail(lastEmailedAt, now)) {
    result.skipped = `emailed ${kind} at ${lastEmailedAt}`;
    console.log(JSON.stringify({ event: 'alarm', kind, summary, emailed: false, row_id: result.row_id, skipped: result.skipped }));
    return result;
  }

  // 3. the email
  const sent = await sendEmail(subjectFor(kind, summary), bodyFor(kind, summary, detail, now));
  if (sent.error) {
    console.error('[alarm] email failed:', sent.error);
  } else {
    result.emailed = true;
    result.email_id = sent.id;
    if (supabase && result.row_id != null) {
      try {
        await supabase.from('alarms').update({ emailed: true, email_id: sent.id }).eq('id', result.row_id);
      } catch (e) {
        console.warn('[alarm] emailed flag write failed:', (e as Error)?.message ?? e);
      }
    }
  }
  console.log(JSON.stringify({ event: 'alarm', kind, summary, emailed: result.emailed, email_id: result.email_id, row_id: result.row_id }));
  return result;
}

/** Read workout_id / user_id off a JSON request body without consuming it. */
async function peekIds(req: Request): Promise<{ user_id: string | null; workout_id: string | null }> {
  try {
    const text = await req.clone().text();
    if (!text) return { user_id: null, workout_id: null };
    const j = JSON.parse(text);
    const u = j?.user_id ?? j?.userId ?? null;
    const w = j?.workout_id ?? j?.workoutId ?? null;
    return { user_id: u ? String(u) : null, workout_id: w ? String(w) : null };
  } catch {
    return { user_id: null, workout_id: null };
  }
}

/**
 * Wrap a Deno.serve handler: report a throw (then rethrow) or a 5xx response (then return it as-is).
 * `fn` is the function's name — it becomes the alarm kind and the logs link.
 */
export function withAlarm(fn: string, handler: (req: Request) => Promise<Response> | Response): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const ids = req.method === 'POST' ? await peekIds(req) : { user_id: null, workout_id: null };
    let res: Response;
    try {
      res = await handler(req);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      await raise(fn, `threw: ${msg.slice(0, 120)}`, { ...ids, function: fn, error: msg, step: null });
      throw e;
    }
    if (res.status >= 500) {
      let text = '';
      try { text = (await res.clone().text()).slice(0, 1500); } catch { /* no body */ }
      let msg = text;
      try { const j = JSON.parse(text); msg = String(j?.error ?? j?.message ?? text); } catch { /* plain text */ }
      await raise(fn, `HTTP ${res.status}: ${msg.slice(0, 120)}`, { ...ids, function: fn, error: msg, step: null });
    }
    return res;
  };
}
