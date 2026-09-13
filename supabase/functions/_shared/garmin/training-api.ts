// Garmin Training API calls (Training API V2 document, sections 3.2 workouts and 3.3 schedules).
// Token refresh, create and schedule moved unchanged from send-workout-to-garmin/index.ts (2026-09-13);
// delete added for the automatic calendar sync.
import { recordProviderResult } from '../connection-health.ts'
import type { GarminWorkout } from './convert-workout.ts'

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function computeRetryDelay(res: Response | null, attempt: number, baseMs: number, maxMs: number): number {
  // Honor Retry-After if present (seconds or HTTP-date)
  let delay = Math.min(maxMs, baseMs * Math.pow(2, attempt - 1))
  const jitter = Math.floor(Math.random() * 250)
  if (res) {
    const ra = res.headers.get('Retry-After')
    if (ra) {
      if (/^\d+$/.test(ra)) {
        delay = Math.max(delay, parseInt(ra, 10) * 1000)
      } else {
        const until = Date.parse(ra)
        if (!Number.isNaN(until)) {
          const ms = until - Date.now()
          if (ms > 0) delay = Math.max(delay, ms)
        }
      }
    }
  }
  return delay + jitter
}

async function postJsonWithRetry(url: string, body: unknown, headers: Record<string, string>, opts?: { attempts?: number; baseMs?: number; maxMs?: number }): Promise<{ ok: boolean; status: number; text: string; response?: Response }> {
  const attempts = Math.max(1, opts?.attempts ?? 5)
  const baseMs = Math.max(100, opts?.baseMs ?? 500)
  const maxMs = Math.max(baseMs, opts?.maxMs ?? 8000)
  let lastText = ''
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let res: Response | null = null
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })
      const status = res.status
      // Read body from a clone so the original can still be consumed by callers
      const clone = res.clone()
      const text = await clone.text()
      lastText = text
      if (res.ok) return { ok: true, status, text, response: res }
      const retryable = status === 429 || (status >= 500 && status < 600)
      if (!retryable || attempt === attempts) return { ok: false, status, text }
      const delay = computeRetryDelay(res, attempt, baseMs, maxMs)
      await sleep(delay)
      continue
    } catch (e: any) {
      // Network/transport errors: retry unless last attempt
      if (attempt === attempts) return { ok: false, status: 0, text: String(e?.message ?? e ?? lastText) }
      const delay = computeRetryDelay(res, attempt, baseMs, maxMs)
      await sleep(delay)
    }
  }
  return { ok: false, status: 0, text: lastText }
}

export async function refreshGarminToken(client: any, userId: string, refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_at: string } | null> {
  try {
    const clientId = Deno.env.get('GARMIN_CLIENT_ID') || ''
    const clientSecret = Deno.env.get('GARMIN_CLIENT_SECRET') || ''
    if (!clientId || !clientSecret) return null
    const res = await fetch('https://diauth.garmin.com/di-oauth2-service/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken
      })
    })
    if (!res.ok) {
      // Connection health (§4): Garmin answers 400 invalid_grant for a revoked refresh token — a dead grant reads as 401.
      await recordProviderResult(client, { provider: 'garmin', userId, status: res.status === 400 ? 401 : res.status, error: `oauth/token refresh → ${res.status}` })
      return null
    }
    const json = await res.json()
    const access_token = json?.access_token
    const new_refresh = json?.refresh_token || refreshToken
    const expires_in = Number(json?.expires_in || 0) * 1000
    const expires_at = new Date(Date.now() + Math.max(60_000, expires_in || 0)).toISOString()
    // Persist
    await client
      .from('user_connections')
      .update({ access_token, refresh_token: new_refresh, expires_at })
      .eq('user_id', userId)
      .eq('provider', 'garmin')
    return { access_token, refresh_token: new_refresh, expires_at }
  } catch {
    return null
  }
}

export async function ensureValidGarminAccessToken(client: any, userId: string, accessToken: string, refreshToken?: string | null, expiresAt?: string | null): Promise<string> {
  try {
    const now = Date.now()
    const exp = expiresAt ? Date.parse(expiresAt) : 0
    // Refresh if expired or within 5 minutes of expiry
    if (exp && exp - now > 5 * 60 * 1000) return accessToken
    if (!refreshToken) return accessToken
    const upd = await refreshGarminToken(client, userId, refreshToken)
    return upd?.access_token || accessToken
  } catch {
    return accessToken
  }
}

export async function sendToGarmin(workout: GarminWorkout, accessToken: string): Promise<{ success: boolean; workoutId?: string; error?: string; status?: number }> {
  try {
    const url = 'https://apis.garmin.com/workoutportal/workout/v2'
    const { ok, status, text, response } = await postJsonWithRetry(
      url,
      workout,
      {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      { attempts: 5, baseMs: 500, maxMs: 8000 }
    )
    if (!ok) return { success: false, error: `Garmin API ${status}: ${text}`, status }
    const json = await (response as Response).json()
    return { success: true, workoutId: json?.workoutId ?? json?.id, status }
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) }
  }
}

export async function scheduleWorkoutOnDate(params: { garminWorkoutId: string; date: string; accessToken: string }): Promise<{ success: boolean; scheduleId?: string; error?: string }> {
  try {
    // Expect date as YYYY-MM-DD
    const body = {
      workoutId: params.garminWorkoutId,
      date: params.date
    }
    const url = 'https://apis.garmin.com/training-api/schedule/'
    const { ok, status, text, response } = await postJsonWithRetry(
      url,
      body,
      {
        'Authorization': `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json'
      },
      { attempts: 5, baseMs: 500, maxMs: 8000 }
    )
    if (!ok) return { success: false, error: `Schedule API ${status}: ${text}` }
    // Training API V2 §3.3.1–3.3.2 names the field `scheduleId` ({"scheduleId":123,"workoutId":123,"date":"2019-01-31"}).
    // This read `workoutScheduleId ?? id` and so never found it (2026-09-13: every calendar-sync create failed with
    // "Garmin returned no schedule id"). A bare number body is accepted too.
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch { parsed = text }
    const raw = typeof parsed === 'number' || (typeof parsed === 'string' && /^\d+$/.test(parsed.trim()))
      ? parsed
      : (parsed?.scheduleId ?? parsed?.workoutScheduleId ?? parsed?.id)
    if (raw == null || raw === '') return { success: false, error: `Schedule API ${status}: no scheduleId in ${String(text).slice(0, 200)}` }
    return { success: true, scheduleId: String(raw).trim() }
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) }
  }
}

// Training API V2 §3.3.6: DELETE training-api/schedule/{workoutScheduleId}; §3.2.6: DELETE training-api/workout/v2/{workoutId}.
// A 404 means Garmin no longer has it (the athlete deleted it on Garmin Connect): that is the outcome asked for.
export async function deleteGarminSchedule(scheduleId: string, accessToken: string): Promise<{ success: boolean; status: number; error?: string }> {
  return garminDelete(`https://apis.garmin.com/training-api/schedule/${encodeURIComponent(scheduleId)}`, accessToken)
}

export async function deleteGarminWorkout(workoutId: string, accessToken: string): Promise<{ success: boolean; status: number; error?: string }> {
  return garminDelete(`https://apis.garmin.com/training-api/workout/v2/${encodeURIComponent(workoutId)}`, accessToken)
}

async function garminDelete(url: string, accessToken: string): Promise<{ success: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
    if (res.ok || res.status === 404) return { success: true, status: res.status }
    return { success: false, status: res.status, error: `Garmin API ${res.status}: ${await res.text()}` }
  } catch (e: any) {
    return { success: false, status: 0, error: e?.message ?? String(e) }
  }
}
