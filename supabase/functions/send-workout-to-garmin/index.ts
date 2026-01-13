// Edge function: send-workout-to-garmin
// Exports a planned workout to Garmin Connect
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type PlannedWorkout = {
  id: string
  user_id: string
  name: string
  type: 'run' | 'ride' | 'swim' | 'strength' | 'walk'
  date: string
  description?: string
  duration?: number // minutes
  intervals?: any[]
  strength_exercises?: any[]
}

type GarminWorkout = {
  workoutName: string
  sport: string
  poolLength?: number
  poolLengthUnit?: string
  estimatedDurationInSecs?: number
  segments: Array<{
    segmentOrder: number
    sport: string
    poolLength?: number
    poolLengthUnit?: string
    estimatedDurationInSecs?: number
    steps: GarminStep[]
  }>
}

type GarminStep = {
  type: 'WorkoutStep'
  stepId: number
  stepOrder: number
  intensity: string
  description?: string
  durationType: string
  durationValue: number
  durationValueType?: string
  targetType?: string
  targetValue?: number
  targetValueLow?: number
  targetValueHigh?: number
  targetValueType?: string
  exerciseName?: string
  weightValue?: number
  weightDisplayUnit?: string
  strokeType?: string
  drillType?: string
  equipmentType?: string
}

serve(async (req) => {
  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: corsHeaders()
      })
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    const { workoutId, userId } = await req.json()
    if (!workoutId || !userId) {
      return json({ error: 'Missing workoutId or userId' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch planned workout (strictly the owner's)
    const { data: workout, error: workoutError } = await supabase
      .from('planned_workouts')
      .select('*')
      .eq('id', workoutId)
      .eq('user_id', userId)
      .single<PlannedWorkout>()

    if (workoutError || !workout) {
      return json({ error: 'Workout not found' }, 404)
    }

    // Do not early-return if intervals are missing; we can build from structured/computed below

    // Fetch user's Garmin tokens
    const { data: conn, error: connErr } = await supabase
      .from('user_connections')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .single()

    if (connErr || !conn?.access_token) {
      return json({ error: 'Garmin connection not found' }, 400)
    }

    // Ensure token is fresh (refresh if expired or near-expiry)
    const accessToken = await ensureValidGarminAccessToken(supabase, userId, conn.access_token, conn.refresh_token, conn.expires_at)

    // Fallback defaults and baselines (units + FTP)
    try {
      const { data: ub } = await supabase
        .from('user_baselines')
        .select('units, ftp')
        .eq('user_id', userId)
        .single()
      // Expose FTP for power % → watts mapping
      const ftpNum = Number((ub as any)?.ftp)
      if (Number.isFinite(ftpNum) && ftpNum > 0) {
        ;(workout as any).user_ftp = Math.round(ftpNum)
      }
      const isSwim = String((workout as any)?.type || '').toLowerCase() === 'swim'
      const hasPool = isSwim && ((workout as any)?.pool_unit || (workout as any)?.pool_length_m)
      if (isSwim && !hasPool) {
        const pref = String((ub as any)?.units || 'imperial').toLowerCase()
        if (pref === 'imperial') {
          ;(workout as any).pool_unit = 'yd'
          ;(workout as any).pool_length_m = 22.86
        } else if (pref === 'metric') {
          ;(workout as any).pool_unit = 'm'
          ;(workout as any).pool_length_m = 25.0
        }
      }
    } catch {}

    const garminPayload = convertWorkoutToGarmin(workout)
    try {
      const firstSeg = (garminPayload as any)?.segments?.[0]
      const steps = Array.isArray(firstSeg?.steps) ? firstSeg.steps : []
      const speedSteps = steps.filter((s: any) => s?.targetType === 'SPEED' && s?.type === 'WorkoutStep')
      console.log('SPEED steps for test:', speedSteps.map((s: any) => ({ stepId: s.stepId, targetValueLow: s.targetValueLow, targetValueHigh: s.targetValueHigh })))
      if ((garminPayload as any)?.sport === 'RUNNING' && speedSteps.length === 0) {
        console.log('RUNNING workout has no SPEED targets in steps (diagnostic)')
      }
    } catch {}

    let sendResult = await sendToGarmin(garminPayload, accessToken)
    if (!sendResult.success) {
      // If validation guard triggered in convertWorkoutToGarmin
      if (String(sendResult.error||'').includes('RUN_EXPORT_MISSING_TARGETS')) {
        return json({ error: 'Workout requires per-rep run pace targets (materialize computed or provide paceTarget)' }, 422)
      }
      return json({ error: 'Failed to send to Garmin', details: sendResult.error }, 502)
    }

    // Try to schedule to user's Garmin Calendar on the workout date (best-effort)
    let scheduleResult: { success: boolean; scheduleId?: string; error?: string } | null = null
    if (workout.date) {
      scheduleResult = await scheduleWorkoutOnDate({
        garminWorkoutId: sendResult.workoutId!,
        date: workout.date,
        accessToken
      })
    }

    // Mark as sent and persist Garmin IDs for linking completed activities
    await supabase
      .from('planned_workouts')
      .update({
        workout_status: 'sent_to_garmin',
        garmin_workout_id: sendResult.workoutId,
        garmin_schedule_id: scheduleResult?.scheduleId ?? null,
        updated_at: new Date().toISOString()
      })
      .eq('id', workoutId)

    const debugOut: any = {}
    try {
      const sportDbg = (garminPayload as any)?.sport
      const rootLen = (garminPayload as any)?.poolLength
      const rootUnit = (garminPayload as any)?.poolLengthUnit
      const seg0 = (garminPayload as any)?.segments?.[0] || {}
      debugOut.pool = { pool_unit: (workout as any)?.pool_unit ?? null, pool_length_m: (workout as any)?.pool_length_m ?? null }
      debugOut.mapped = { sport: sportDbg, poolLength: rootLen ?? seg0?.poolLength ?? null, poolLengthUnit: rootUnit ?? seg0?.poolLengthUnit ?? null }
    } catch {}

    return json({ success: true, garminWorkoutId: sendResult.workoutId, scheduled: scheduleResult?.success ?? false, scheduleError: scheduleResult?.error, debug: debugOut })
  } catch (err: any) {
    return json({ error: 'Internal error', details: err?.message ?? String(err) }, 500)
  }
})

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Allow headers used by supabase-js when invoking functions
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Client-Info, x-client-info, X-Supabase-Authorization'
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  })
}

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

async function refreshGarminToken(client: ReturnType<typeof createClient>, userId: string, refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_at: string } | null> {
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
    if (!res.ok) return null
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

async function ensureValidGarminAccessToken(client: ReturnType<typeof createClient>, userId: string, accessToken: string, refreshToken?: string | null, expiresAt?: string | null): Promise<string> {
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

function convertWorkoutToGarmin(workout: PlannedWorkout): GarminWorkout {
  const sport = mapWorkoutType(workout.type)
  const isRun = sport === 'RUNNING'
  const isSwimSport = sport === 'LAP_SWIMMING'
  const poolUnitPref: 'yd' | 'm' | null = isSwimSport ? ((): any => {
    const v = (workout as any)?.pool_unit
    if (!v) return null
    const t = String(v).toLowerCase()
    if (t === 'yd' || t === 'y') return 'yd'
    if (t === 'm' || t === 'meter' || t === 'metre') return 'm'
    return null
  })() : null
  const steps: GarminStep[] = []
  let stepId = 1
  // Use computed per-rep targets when available to guarantee PACE ranges per interval
  const computedSteps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : []
  // Build per-type index lists so we can map computed targets by step intensity
  const byTypeIdx: { work: number[]; rest: number[]; warm: number[]; cool: number[] } = { work: [], rest: [], warm: [], cool: [] }
  try {
    computedSteps.forEach((x: any, i: number) => {
      const t = String(x?.type || x?.kind || '').toLowerCase()
      if (t === 'warmup') byTypeIdx.warm.push(i)
      else if (t === 'cooldown') byTypeIdx.cool.push(i)
      else if (t === 'interval_rest' || t === 'recovery' || /rest/.test(t)) byTypeIdx.rest.push(i)
      else byTypeIdx.work.push(i)
    })
  } catch {}
  const ptr: Record<'work'|'rest'|'warm'|'cool', number> = { work: 0, rest: 0, warm: 0, cool: 0 }

  const secPerMiToPaceStr = (sec: number): string => {
    const m = Math.floor(sec / 60)
    const s = Math.round(sec % 60)
    const ss = String(s).padStart(2, '0')
    return `${m}:${ss}/mi`
  }

  const applyComputedTargetIfMissing = (step: GarminStep, isRest: boolean) => {
    try {
      // Choose bucket by current step intensity
      let bucket: 'work'|'rest'|'warm'|'cool' = 'work'
      const upper = String(step.intensity || '').toUpperCase()
      if (upper === 'WARMUP') bucket = 'warm'
      else if (upper === 'COOLDOWN') bucket = 'cool'
      else if (upper === 'REST' || upper === 'RECOVERY') bucket = 'rest'
      const list = byTypeIdx[bucket]
      const i = list?.[ptr[bucket] ?? 0]
      const cs = (typeof i === 'number') ? computedSteps[i] : undefined
      if (typeof i === 'number') ptr[bucket] = (ptr[bucket] ?? 0) + 1
      if (!cs) { return }
      // Only apply when step has no explicit target
      const hasTarget = step.targetType || step.targetValue != null || step.targetValueLow != null
      if (hasTarget) return
      // RUNNING pace from computed pace_range / pace_sec_per_mi / paceTarget
      if (sport === 'RUNNING' && (typeof cs?.pace_sec_per_mi === 'number' || cs?.pace_range || typeof cs?.paceTarget === 'string')) {
        // Normalize various shapes into seconds-per-mile range or center
        let secPerMi: number | undefined = typeof cs.pace_sec_per_mi === 'number' ? cs.pace_sec_per_mi : undefined
        // pace_range could be an array [low, high] or object {lower, upper} (seconds per mile)
        let rangeLow: number | undefined
        let rangeHigh: number | undefined
        const pr: any = (cs as any)?.pace_range
        if (Array.isArray(pr) && pr.length === 2) {
          const a = Number(pr[0]); const b = Number(pr[1])
          if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
            rangeLow = Math.min(a, b)
            rangeHigh = Math.max(a, b)
          }
        } else if (pr && typeof pr === 'object' && (typeof pr.lower === 'number' || typeof pr.upper === 'number')) {
          const a = Number(pr.lower); const b = Number(pr.upper)
          if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
            rangeLow = Math.min(a, b)
            rangeHigh = Math.max(a, b)
          }
        }
        // If still nothing, try parsing paceTarget text to center seconds/mi
        if (secPerMi == null && (rangeLow == null || rangeHigh == null)) {
          const txt: string = String((cs as any)?.paceTarget || '')
          const m = txt.match(/(\d{1,2}):(\d{2})\s*\/\s*(mi|mile|km)/i)
          if (m) {
            const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
            const unit = m[3].toLowerCase()
            secPerMi = unit === 'km' ? Math.round(sec * 1.60934) : sec
          }
        }
        // Convert pace (sec/mi) to speed (m/s)
        const toSpeed = (sec: number) => 1609.34 / sec
        // Garmin run targets should use SPEED (m/s); Connect displays as Pace
        step.targetType = 'SPEED'
        if (typeof rangeLow === 'number' && typeof rangeHigh === 'number') {
          step.targetValueLow = toSpeed(rangeHigh) // slower pace → lower speed
          step.targetValueHigh = toSpeed(rangeLow) // faster pace → higher speed
          delete (step as any).targetValue
        } else if (typeof secPerMi === 'number') {
          // Prefer a range: widen around the single pace based on intensity/duration
          const paceStr = secPerMiToPaceStr(secPerMi)
          const widened = widenPaceToRangeMetersPerSecond(
            paceStr,
            step.intensity || '',
            {
              durationSec: (step.durationType === 'TIME' ? step.durationValue : undefined) as any,
              distanceMeters: (step.durationType === 'DISTANCE' ? step.durationValue : undefined) as any
            }
          )
          const center = toSpeed(secPerMi)
          step.targetValueLow = widened ? widened.low : center * 0.97
          step.targetValueHigh = widened ? widened.high : center * 1.03
          delete (step as any).targetValue
        }
      }
      // CYCLING: apply POWER range from computed when available
      if (sport === 'CYCLING') {
        // Do not attach power targets to REST/RECOVERY steps
        if (upper === 'REST' || upper === 'RECOVERY') return
        const userFTP: number | undefined = ((): number | undefined => {
          const n = Number((workout as any)?.user_ftp)
          return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
        })()
        const parseW = (v: any): number | undefined => {
          if (typeof v === 'number' && isFinite(v)) return v
          if (typeof v === 'string') {
            const m = v.match(/(-?\d+\.?\d*)/)
            if (m) return Number(m[1])
          }
          return undefined
        }
        const parsePct = (v: any): number | undefined => {
          if (typeof v === 'number' && isFinite(v)) return v > 1 ? v/100 : v
          if (typeof v === 'string') {
            const m = v.match(/(-?\d+\.?\d*)\s*%?/)
            if (m) { const n = Number(m[1]); if (isFinite(n)) return n > 1 ? n/100 : n }
          }
          return undefined
        }
        let low = parseW((cs as any)?.power_range?.lower ?? (cs as any)?.powerRange?.lower ?? (cs as any)?.target_low)
        let high = parseW((cs as any)?.power_range?.upper ?? (cs as any)?.powerRange?.upper ?? (cs as any)?.target_high)
        if (typeof low === 'number' && typeof high === 'number') {
          step.targetType = 'POWER'
          step.targetValueLow = Math.round(low)
          step.targetValueHigh = Math.round(high)
        } else {
          const center = parseW((cs as any)?.target_watts ?? (cs as any)?.targetWatts ?? (cs as any)?.target_value ?? (cs as any)?.powerTarget)
          if (typeof center === 'number' && isFinite(center)) {
            step.targetType = 'POWER'
            step.targetValueLow = Math.round(center * 0.95)
            step.targetValueHigh = Math.round(center * 1.05)
          } else {
            // Try % of FTP → watts
            const pctLow = parsePct((cs as any)?.power_pct_range?.lower ?? (cs as any)?.powerPercentRange?.lower ?? (cs as any)?.pct_low ?? (cs as any)?.powerPctLow)
            const pctHigh = parsePct((cs as any)?.power_pct_range?.upper ?? (cs as any)?.powerPercentRange?.upper ?? (cs as any)?.pct_high ?? (cs as any)?.powerPctHigh)
            const pct = parsePct((cs as any)?.power_pct ?? (cs as any)?.powerPercent)
            if (userFTP && typeof pctLow === 'number' && typeof pctHigh === 'number') {
              step.targetType = 'POWER'
              step.targetValueLow = Math.round(userFTP * pctLow)
              step.targetValueHigh = Math.round(userFTP * pctHigh)
            } else if (userFTP && typeof pct === 'number') {
              step.targetType = 'POWER'
              step.targetValueLow = Math.round(userFTP * pct * 0.95)
              step.targetValueHigh = Math.round(userFTP * pct * 1.05)
            }
          }
        }
      }
    } catch {}
  }

  const mapSwimEquipment = (raw?: string): string | undefined => {
    if (!raw) return undefined
    const t = raw.toLowerCase()
    if (/(pull\s*buoy|buoy)/.test(t)) return 'SWIM_PULL_BUOY'
    if (/kick\s*board|kickboard/.test(t)) return 'SWIM_KICKBOARD'
    if (/paddles?/.test(t)) return 'SWIM_PADDLES'
    if (/fins?/.test(t)) return 'SWIM_FINS'
    if (/snorkel/.test(t)) return 'SWIM_SNORKEL'
    return 'NONE'
  }

  const mapSwimStroke = (src?: string): string => {
    const t = String(src || '').toLowerCase()
    if (/free|fr(?:ee)?style/.test(t)) return 'FREESTYLE'
    if (/back/.test(t)) return 'BACKSTROKE'
    if (/breast/.test(t)) return 'BREASTSTROKE'
    if (/butter|fly/.test(t)) return 'BUTTERFLY'
    if (/im\b|individual medley|mixed/.test(t)) return 'IM'
    if (/choice|open/.test(t)) return 'CHOICE'
    return 'FREESTYLE'
  }

  const detectDrillType = (label?: string, cue?: string): string | undefined => {
    const a = String(label || '').toLowerCase()
    const b = String(cue || '').toLowerCase()
    if (/\bkick\b/.test(a) || /\bkick\b/.test(b)) return 'KICK'
    if (/\bpull\b/.test(a) || /\bpull\b/.test(b)) return 'PULL'
    if (/\bdrill\b/.test(a) || /\bdrill\b/.test(b)) return 'DRILL'
    return undefined
  }

  const normalizeTargetBounds = (step: GarminStep) => {
    try {
      const isSpeedLike = step.targetType === 'SPEED' || step.targetType === 'PACE'
      const lo = (step as any).targetValueLow
      const hi = (step as any).targetValueHigh
      if (isSpeedLike && isFinite(lo as any) && isFinite(hi as any)) {
        const low = Number(lo)
        const high = Number(hi)
        if (low > high) {
          ;(step as any).targetValueLow = high
          ;(step as any).targetValueHigh = low
        }
      }
    } catch {}
  }

  const clearTargets = (step: GarminStep) => {
    try {
      delete (step as any).targetType
      delete (step as any).targetValue
      delete (step as any).targetValueLow
      delete (step as any).targetValueHigh
      delete (step as any).targetValueType
    } catch {}
  }

  // Carry-forward last known SPEED range for RUNNING steps without explicit targets (non-rest)
  let lastSpeedLow: number | null = null
  let lastSpeedHigh: number | null = null
  // Track easy/jog targets for REST from previous rests or warmup
  let lastRestLow: number | null = null
  let lastRestHigh: number | null = null
  let lastWarmLow: number | null = null
  let lastWarmHigh: number | null = null

  // Attempt 0: Build intervals directly from structured JSON (no DB dependence on materializer)
  const intervalsFromStructured = (() => {
    try {
      const ws: any = (workout as any)?.workout_structure
      if (!ws || typeof ws !== 'object') return undefined
      const out: any[] = []
      const toSec = (v?: string): number => {
        if (!v || typeof v !== 'string') return 0
        const txt = v.trim()
        // Support mm:ss or hh:mm:ss (e.g., "15:00", "1:05:00")
        if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(txt)) {
          return parseTimeToSeconds(txt)
        }
        // Also support tokens like "15 min", "15m", "90 s"
        const m1 = txt.match(/(\d+)\s*min|^(\d+)\s*m$/i); if (m1) return parseInt((m1[1]||m1[2]) as string,10)*60
        const m2 = txt.match(/(\d+)\s*s$/i); if (m2) return parseInt(m2[1],10)
        return 0
      }
      const toMeters = (val: number, unit?: string) => {
        const u = String(unit||'').toLowerCase();
        if (u==='m') return Math.floor(val)
        if (u==='yd') return Math.floor(val*0.9144)
        if (u==='mi') return Math.floor(val*1609.34)
        if (u==='km') return Math.floor(val*1000)
        return Math.floor(val||0)
      }
      const pushWU = (sec: number) => { if (sec>0) out.push({ effortLabel:'warm up', duration: sec }) }
      const pushCD = (sec: number) => { if (sec>0) out.push({ effortLabel:'cool down', duration: sec }) }
      const type = String(ws?.type||'').toLowerCase();
      const disc = String((workout as any)?.type||'').toLowerCase();
      const struct: any[] = Array.isArray(ws?.structure) ? ws.structure : []
      for (const seg of struct) {
        const k = String(seg?.type||'').toLowerCase()
        if (k==='warmup') { pushWU(toSec(String(seg?.duration||''))); continue }
        if (k==='cooldown') { pushCD(toSec(String(seg?.duration||''))); continue }
        if (type==='interval_session' || (k==='main_set' && String(seg?.set_type||'').toLowerCase()==='intervals')) {
          const reps = Math.max(1, Number(seg?.repetitions)||0)
          const work = seg?.work_segment||{}; const rec = seg?.recovery_segment||{}
          // distance format like "800m" or duration like "2min"
          const distTxt = String(work?.distance||'')
          let meters: number|undefined = undefined
          const dm = distTxt.match(/(\d+(?:\.\d+)?)\s*(m|mi|km|yd)/i)
          if (dm) meters = toMeters(parseFloat(dm[1]), dm[2])
          const durS = toSec(String(work?.duration||''))
          const restS = toSec(String(rec?.duration||''))
          const workStep: any = { effortLabel: 'interval' }
          if (typeof meters==='number' && meters>0) workStep.distanceMeters = meters
          if (!meters && durS>0) workStep.duration = durS
          const segs: any[] = [workStep]
          if (restS>0) segs.push({ effortLabel:'rest', duration: restS })
          if (reps>1) out.push({ effortLabel:'repeat', repeatCount: reps, segments: segs })
          else out.push(...segs)
          continue
        }
        if (type==='bike_intervals' && k==='main_set') {
          const reps = Math.max(1, Number(seg?.repetitions)||0)
          const wsS = toSec(String(seg?.work_segment?.duration||''))
          const rsS = toSec(String(seg?.recovery_segment?.duration||''))
          const workStep: any = { effortLabel:'interval' }
          if (wsS>0) workStep.duration = wsS
          const segs: any[] = [workStep]
          if (rsS>0) segs.push({ effortLabel:'rest', duration: rsS })
          if (reps>1) out.push({ effortLabel:'repeat', repeatCount: reps, segments: segs })
          else out.push(...segs)
          continue
        }
        if (type==='endurance_session' && (k==='main_effort' || k==='main')) {
          const sec = toSec(String(seg?.duration||''))
          if (sec>0) out.push({ effortLabel: (disc==='ride'?'endurance':'interval'), duration: sec })
          continue
        }
      }
      return out.length ? out : undefined
    } catch { return undefined }
  })()

  // Prefer computed.steps first for highest fidelity; fallback to structured; then to stored intervals
  const intervals = (() => {
    try {
      const comp: any = (workout as any)?.computed || {}
      const steps: any[] = Array.isArray(comp?.steps) ? comp.steps : []
      if (steps.length) {
        // If computed exists but contains no actionable work reps, fall back next
        const hasWorkReps = steps.some((st: any) => {
          const t = String(st?.type || '').toLowerCase()
          if (t === 'warmup' || t === 'cooldown') return false
          if (t === 'interval_rest' || /rest/.test(t)) return false
          return true
        })
        if (hasWorkReps) {
          const out: any[] = []
          const typeLower = String((workout as any).type || '').toLowerCase()
          const isSwim = typeLower === 'swim'
          const isRun = typeLower === 'run'
          const toMetersFromYd = (yd?: number) => (yd && yd > 0) ? Math.round(yd * 0.9144) : undefined
          const warmArr: any[] = []
          const mainArr: any[] = []
          const coolArr: any[] = []
          const num = (v: any): number | undefined => {
            if (typeof v === 'number' && isFinite(v) && v > 0) return v
            const m = String(v ?? '').match(/(-?\d+\.?\d*)/)
            if (m) return Number(m[1])
            return undefined
          }
          for (const st of steps) {
            const t = String((st as any)?.type || (st as any)?.kind || '').toLowerCase()
            const isRest = t === 'interval_rest' || t === 'recovery' || /rest/.test(t)
            if (isRest) {
              const sec = num((st as any)?.duration_s) ?? num((st as any)?.seconds) ?? num((st as any)?.rest_s) ?? num((st as any)?.restSeconds)
              mainArr.push({ effortLabel: 'rest', duration: Math.max(1, Math.floor(sec || 1)) })
              continue
            }
            let label = String((st as any)?.label || '').trim()
            if (label) label = label.replace(/^Drill\s*[—-]\s*/i, '').trim()
            if (!label && isSwim) {
              const cue = String((st as any)?.cue || '').toLowerCase()
              if (/drill:/.test(cue)) {
                const nm = (cue.split(':')[1] || '').replace(/_/g,' ')
                label = nm.charAt(0).toUpperCase() + nm.slice(1)
              } else if (/pull/.test(cue)) label = 'Pull'
              else if (/kick/.test(cue)) label = 'Kick'
              else if (/aerobic/.test(cue)) label = 'Aerobic'
            }
            const meters = ((): number | undefined => {
              const m1 = num((st as any)?.distance_m)
              const m2 = num((st as any)?.distanceMeters)
              const yd = num((st as any)?.distance_yd)
              if (typeof m1 === 'number') return Math.round(m1)
              if (typeof m2 === 'number') return Math.round(m2)
              if (typeof yd === 'number') return toMetersFromYd(yd)
              return undefined
            })()
            const seconds = ((): number | undefined => {
              const s1 = num((st as any)?.duration_s)
              const s2 = num((st as any)?.seconds)
              if (typeof s1 === 'number') return Math.floor(s1)
              if (typeof s2 === 'number') return Math.floor(s2)
              return undefined
            })()
            if (t === 'warmup') {
              const warm: any = { effortLabel: 'warm up' }
              if (typeof meters === 'number' && meters > 0) warm.distanceMeters = Math.round(meters)
              // Add duration only when defined (>0). For RUN use duration only if distance missing.
              if (((!isRun) && typeof seconds === 'number' && seconds > 0) || (!(typeof meters === 'number' && meters > 0) && typeof seconds === 'number' && seconds > 0)) {
                warm.duration = Math.floor(seconds)
              }
              warmArr.push(warm)
            } else if (t === 'cooldown') {
              const cool: any = { effortLabel: 'cool down' }
              if (typeof meters === 'number' && meters > 0) cool.distanceMeters = Math.round(meters)
              if (((!isRun) && typeof seconds === 'number' && seconds > 0) || (!(typeof meters === 'number' && meters > 0) && typeof seconds === 'number' && seconds > 0)) {
                cool.duration = Math.floor(seconds)
              }
              coolArr.push(cool)
            } else {
              // For strides, preserve the label so Garmin shows "Stride" not just "interval"
              const isStride = /stride/i.test(label)
              const effortLabel = isStride ? 'Stride' : (label || (isSwim ? 'interval' : 'interval'))
              const main: any = { effortLabel }
              if (typeof meters === 'number' && meters > 0) main.distanceMeters = Math.round(meters)
              if (((!isRun) && typeof seconds === 'number' && seconds > 0) || (!(typeof meters === 'number' && meters > 0) && typeof seconds === 'number' && seconds > 0)) {
                main.duration = Math.floor(seconds)
              }
              mainArr.push(main)
              const restVal = num((st as any)?.rest_s) ?? num((st as any)?.restSeconds)
              if (typeof restVal === 'number' && restVal > 0) {
                mainArr.push({ effortLabel: 'rest', duration: Math.max(1, Math.floor(restVal)) })
              }
            }
          }
          const ordered = [...warmArr, ...mainArr, ...coolArr]
          if (ordered.length) return ordered
        }
      }
    } catch {}
    if (Array.isArray(intervalsFromStructured) && intervalsFromStructured.length) return intervalsFromStructured
    return Array.isArray((workout as any).intervals) ? (workout as any).intervals : []
  })()

  for (const interval of intervals) {
    // Strength intervals: send as GARMIN strength steps; rest remains TIME
    if (String((interval as any)?.kind || '').toLowerCase() === 'strength') {
      const label = String((interval as any).exercise || '').trim()
      const reps = Number((interval as any).reps || 0)
      const weight = Number((interval as any).weight || 0)
      const note = String((interval as any).note || '')
      const step: GarminStep = {
        type: 'WorkoutStep',
        stepId,
        stepOrder: stepId,
        intensity: 'ACTIVE',
        description: [label, reps ? `${reps} reps` : '', weight ? `${weight} lb` : '', note].filter(Boolean).join(' • ') || undefined,
        durationType: 'REPS',
        durationValue: Math.max(1, reps)
      }
      // Omit exerciseName mapping (Garmin expects enum/id). Keep the label in description.
      if (weight > 0) {
        // Convert provided pounds to kilograms for API value; set display to POUND
        const kg = Math.round((weight * 0.45359237) * 10) / 10
        step.weightValue = kg
        step.weightDisplayUnit = 'POUND'
      }
      steps.push(step)
      stepId += 1
      continue
    }
    if (String((interval as any)?.kind || '').toLowerCase() === 'rest') {
      const sec = Number((interval as any).duration || 0)
      const step: GarminStep = {
        type: 'WorkoutStep',
        stepId,
        stepOrder: stepId,
        intensity: 'REST',
        description: 'Rest',
        durationType: (sport === 'LAP_SWIMMING') ? 'FIXED_REST' : 'TIME',
        durationValue: Math.max(1, Math.floor(sec))
      }
      steps.push(step)
      stepId += 1
      continue
    }
    // Handle repeat blocks with child segments
    if (Array.isArray(interval?.segments) && interval?.repeatCount && interval.repeatCount > 0) {
      for (let r = 0; r < Number(interval.repeatCount); r += 1) {
        for (const seg of interval.segments) {
          // Skip the trailing rest on the final repeat to avoid extra rest at the end
          if (r === Number(interval.repeatCount) - 1 && String(seg?.effortLabel || '').toLowerCase() === 'rest') {
            continue
          }
          const sIntensity = mapEffortToIntensity(String((seg?.effortLabel ?? interval?.effortLabel) || '').trim())
          const sMeters = Number(seg?.distanceMeters)
          // For RUNNING distance steps, suppress duration to avoid confusing time on device
          const sSeconds = (isRun && Number(seg?.distanceMeters) > 0) ? NaN : Number(seg?.duration)
          if (!(Number.isFinite(sMeters) && sMeters > 0) && !(Number.isFinite(sSeconds) && sSeconds > 0)) {
            // Skip malformed segment rather than failing entire export
            continue
          }
          const step: GarminStep = {
            type: 'WorkoutStep',
            stepId,
            stepOrder: stepId,
            intensity: sIntensity,
            description: String(((seg?.effortLabel ?? interval?.effortLabel) || '')).trim() || undefined,
            durationType: (Number.isFinite(sMeters) && sMeters > 0) ? 'DISTANCE' : 'TIME',
            durationValue: (Number.isFinite(sMeters) && sMeters > 0) ? ((): number => {
              if (isSwimSport && poolUnitPref === 'yd') {
                return Math.max(1, Math.round((sMeters as number) / 0.9144))
              }
              return Math.round(sMeters as number)
            })() : Math.floor(sSeconds)
          }
          // Tag swim distance unit explicitly when pool is specified
          if (step.durationType === 'DISTANCE' && isSwimSport) {
            if (poolUnitPref === 'yd') step.durationValueType = 'YARD'
            else if (poolUnitPref === 'm') step.durationValueType = 'METER'
          }
          if (sport === 'LAP_SWIMMING' && step.intensity === 'REST') {
            step.durationType = 'FIXED_REST'
          }
          const isRestIntensity = step.intensity === 'REST' || step.intensity === 'RECOVERY'
          if (!isRestIntensity) {
            applyTargets(step, seg, interval)
            // Swim metadata: apply stroke/equipment/drill only for swim and non-rest steps
            if (sport === 'LAP_SWIMMING') {
              const src = seg ?? {}
              const labelTxt = String(src?.effortLabel || interval?.effortLabel || '')
              const cueTxt = String((src as any)?.cue || '')
              const equipTxt = String((src as any)?.equipment || '')
              const strokeTxt = String((src as any)?.stroke || labelTxt)
              const drill = detectDrillType(labelTxt, cueTxt)
              const equip = mapSwimEquipment(equipTxt)
              const stroke = mapSwimStroke(strokeTxt)
              if (equip) step.equipmentType = equip
              if (drill) step.drillType = drill
              if (stroke) step.strokeType = stroke
            }
            // Try to apply computed per-rep target if none attached
            applyComputedTargetIfMissing(step, false)
            normalizeTargetBounds(step)
          } else {
            clearTargets(step)
          }
          // Update or carry-forward SPEED targets for RUNNING
          if (sport === 'RUNNING') {
            const isWorkStep = step.intensity === 'INTERVAL' || step.intensity === 'ACTIVE'
            if (isWorkStep) {
              if (step.targetType === 'SPEED' && isFinite((step as any).targetValueLow) && isFinite((step as any).targetValueHigh)) {
                lastSpeedLow = Number((step as any).targetValueLow)
                lastSpeedHigh = Number((step as any).targetValueHigh)
              } else if (lastSpeedLow != null && lastSpeedHigh != null) {
                step.targetType = 'SPEED'
                step.targetValueLow = lastSpeedLow
                step.targetValueHigh = lastSpeedHigh
              }
            } else if (step.intensity === 'REST' || step.intensity === 'RECOVERY') {
              if (step.targetType === 'SPEED' && isFinite((step as any).targetValueLow) && isFinite((step as any).targetValueHigh)) {
                lastRestLow = Number((step as any).targetValueLow)
                lastRestHigh = Number((step as any).targetValueHigh)
              } else if (lastRestLow != null && lastRestHigh != null) {
                step.targetType = 'SPEED'
                step.targetValueLow = lastRestLow
                step.targetValueHigh = lastRestHigh
              } else if (lastWarmLow != null && lastWarmHigh != null) {
                step.targetType = 'SPEED'
                step.targetValueLow = lastWarmLow
                step.targetValueHigh = lastWarmHigh
              }
            } else if (step.intensity === 'WARMUP') {
              if (step.targetType === 'SPEED' && isFinite((step as any).targetValueLow) && isFinite((step as any).targetValueHigh)) {
                lastWarmLow = Number((step as any).targetValueLow)
                lastWarmHigh = Number((step as any).targetValueHigh)
              }
            }
          }
          steps.push(step)
          stepId += 1
        }
      }
      continue
    }

    // Simple single step
    const intensity = mapEffortToIntensity(String(interval?.effortLabel ?? '').trim())
    const meters = Number(interval?.distanceMeters)
    const seconds = Number(interval?.duration)
    if (!(Number.isFinite(meters) && meters > 0) && !(Number.isFinite(seconds) && seconds > 0)) {
      // Skip malformed interval rather than failing entire export
      continue
    }
    const step: GarminStep = {
      type: 'WorkoutStep',
      stepId,
      stepOrder: stepId,
      intensity,
      description: String(interval?.effortLabel ?? '').trim() || undefined,
      durationType: (Number.isFinite(meters) && meters > 0) ? 'DISTANCE' : 'TIME',
      durationValue: (Number.isFinite(meters) && meters > 0) ? ((): number => {
        if (isSwimSport && poolUnitPref === 'yd') {
          return Math.max(1, Math.round((meters as number) / 0.9144))
        }
        return Math.round(meters as number)
      })() : Math.floor(seconds)
    }
    if (step.durationType === 'DISTANCE' && isSwimSport) {
      if (poolUnitPref === 'yd') step.durationValueType = 'YARD'
      else if (poolUnitPref === 'm') step.durationValueType = 'METER'
    }
    if (sport === 'LAP_SWIMMING' && step.intensity === 'REST') {
      step.durationType = 'FIXED_REST'
    }
    const isRestIntensity2 = step.intensity === 'REST' || step.intensity === 'RECOVERY'
    if (!isRestIntensity2) {
      applyTargets(step, interval)
      // Swim metadata: apply stroke/equipment/drill only for swim and non-rest steps
      if (sport === 'LAP_SWIMMING') {
        const src = interval ?? {}
        const labelTxt = String(src?.effortLabel || '')
        const cueTxt = String((src as any)?.cue || '')
        const equipTxt = String((src as any)?.equipment || '')
        const strokeTxt = String((src as any)?.stroke || labelTxt)
        const drill = detectDrillType(labelTxt, cueTxt)
        const equip = mapSwimEquipment(equipTxt)
        const stroke = mapSwimStroke(strokeTxt)
        if (equip) step.equipmentType = equip
        if (drill) step.drillType = drill
        if (stroke) step.strokeType = stroke
      }
      applyComputedTargetIfMissing(step, false)
      normalizeTargetBounds(step)
    } else {
      clearTargets(step)
    }
    if (sport === 'RUNNING') {
      const isWorkStep = step.intensity === 'INTERVAL' || step.intensity === 'ACTIVE'
      if (isWorkStep) {
        if (step.targetType === 'SPEED' && isFinite((step as any).targetValueLow) && isFinite((step as any).targetValueHigh)) {
          lastSpeedLow = Number((step as any).targetValueLow)
          lastSpeedHigh = Number((step as any).targetValueHigh)
        } else if (lastSpeedLow != null && lastSpeedHigh != null) {
          step.targetType = 'SPEED'
          step.targetValueLow = lastSpeedLow
          step.targetValueHigh = lastSpeedHigh
        }
      } else if (step.intensity === 'REST' || step.intensity === 'RECOVERY') {
        if (step.targetType === 'SPEED' && isFinite((step as any).targetValueLow) && isFinite((step as any).targetValueHigh)) {
          lastRestLow = Number((step as any).targetValueLow)
          lastRestHigh = Number((step as any).targetValueHigh)
        } else if (lastRestLow != null && lastRestHigh != null) {
          step.targetType = 'SPEED'
          step.targetValueLow = lastRestLow
          step.targetValueHigh = lastRestHigh
        } else if (lastWarmLow != null && lastWarmHigh != null) {
          step.targetType = 'SPEED'
          step.targetValueLow = lastWarmLow
          step.targetValueHigh = lastWarmHigh
        }
      } else if (step.intensity === 'WARMUP') {
        if (step.targetType === 'SPEED' && isFinite((step as any).targetValueLow) && isFinite((step as any).targetValueHigh)) {
          lastWarmLow = Number((step as any).targetValueLow)
          lastWarmHigh = Number((step as any).targetValueHigh)
        }
      }
    }
    steps.push(step)
    stepId += 1
  }

  // Keep RUN intervals distance-based when authored as distance. Devices support SPEED targets with DISTANCE duration.

  // Validation: ensure RUN exports carry SPEED (or PACE) ranges for all work reps (optional via tag)
  const requirePace = Array.isArray((workout as any)?.tags) && (workout as any).tags.includes('require_pace')
  if (sport === 'RUNNING' && requirePace) {
    const anyWorkNoTarget = steps.some((s) => (
      s.type === 'WorkoutStep' &&
      s.intensity !== 'REST' && s.intensity !== 'RECOVERY' &&
      (s.durationValue || 0) > 0 &&
      !(((s.targetType === 'SPEED' || s.targetType === 'PACE') && s.targetValueLow != null && s.targetValueHigh != null))
    ));
    if (anyWorkNoTarget) {
      throw new Error('RUN_EXPORT_MISSING_TARGETS');
    }
  }

  const estSecs = isSwimSport ? undefined : estimateWorkoutSeconds(workout, steps, computedSteps)
  const segEstSecs = isSwimSport ? undefined : estimateWorkoutSeconds(workout, steps, computedSteps)
  // Map pool setting from planned_workouts when present
  const poolUnit: string | null = isSwimSport ? (String(((workout as any)?.pool_unit)||'').toLowerCase() || null) : null
  const poolLenM: number | null = isSwimSport ? (Number((workout as any)?.pool_length_m) || null) : null
  const poolFields = (() => {
    if (!isSwimSport) return {}
    if (!poolUnit) return { poolLength: null as any, poolLengthUnit: null as any }
    if (poolUnit === 'yd') return { poolLength: 25.0, poolLengthUnit: 'YARD' }
    // meters: choose 50 when >= 40m, else 25
    const len = (typeof poolLenM === 'number' && isFinite(poolLenM)) ? poolLenM : 25.0
    const meters = len >= 40 ? 50.0 : 25.0
    return { poolLength: meters, poolLengthUnit: 'METER' }
  })()
  return {
    workoutName: workout.name,
    sport,
    ...(isSwimSport ? poolFields : {}),
    ...(typeof estSecs === 'number' ? { estimatedDurationInSecs: estSecs } : {}),
    segments: [
      {
        segmentOrder: 1,
        sport,
        ...(isSwimSport ? poolFields : {}),
        steps,
        ...(typeof segEstSecs === 'number' ? { estimatedDurationInSecs: segEstSecs } : {})
      }
    ]
  }
}

function mapWorkoutType(type: string): string {
  const map: Record<string, string> = {
    run: 'RUNNING',
    ride: 'CYCLING',
    swim: 'LAP_SWIMMING',
    strength: 'STRENGTH_TRAINING',
    walk: 'GENERIC'
  }
  return map[type] ?? 'RUNNING'
}

function mapEffortToIntensity(label: string): string {
  const map: Record<string, string> = {
    'warm up': 'WARMUP',
    'easy': 'ACTIVE',
    'steady': 'ACTIVE',
    'stride': 'ACTIVE', // Strides are aerobic/recovery work, not high intensity
    'strides': 'ACTIVE', // Plural form
    'tempo': 'INTERVAL',
    'threshold': 'INTERVAL',
    'hard': 'INTERVAL',
    'interval': 'INTERVAL',
    'recovery': 'RECOVERY',
    'cool down': 'COOLDOWN',
    'rest': 'REST'
  }
  const key = label.toLowerCase()
  return map[key] ?? 'ACTIVE'
}

function parseTimeToSeconds(time: string): number {
  // Supports mm:ss or hh:mm:ss
  if (!time || typeof time !== 'string') return 0
  const parts = time.split(':').map((p) => parseInt(p.trim(), 10))
  if (parts.some((n) => Number.isNaN(n))) return 0
  if (parts.length === 2) {
    const [m, s] = parts
    return m * 60 + s
  }
  if (parts.length === 3) {
    const [h, m, s] = parts
    return h * 3600 + m * 60 + s
  }
  return 0
}

function parsePaceToMetersPerSecond(pace: string): { value?: number; low?: number; high?: number } | null {
  // Accept more human variants: en/em dash, "to", spaces, and unit aliases (min/mi, min/km)
  if (!pace) return null
  let txt = String(pace).trim().toLowerCase()
  // Normalize common variants
  txt = txt.replace(/\s+/g, ' ')
  txt = txt.replace(/min\s*\/\s*mi|minutes\s*\/\s*mile|min\s*\/\s*mile/g, '/mi')
  txt = txt.replace(/min\s*\/\s*km|minutes\s*\/\s*kilometer|minutes\s*\/\s*kilometre|min\s*\/\s*kilometer|min\s*\/\s*km/g, '/km')
  // Replace en dash/em dash and " to " with hyphen for ranges
  txt = txt.replace(/[\u2012\u2013\u2014\u2212]/g, '-')
  txt = txt.replace(/\s+to\s+/g, '-')
  // Remove stray spaces around unit slash
  txt = txt.replace(/\s*\/\s*/g, '/')

  const unitMatch = txt.includes('/mi') ? 'mi' : txt.includes('/km') ? 'km' : txt.includes('/100m') ? '100m' : null
  if (!unitMatch) return null

  const core = txt.replace('/mi', '').replace('/km', '').replace('/100m', '')
  const parts = core.split('-').map(s => s.trim()).filter(Boolean)

  const parseOne = (p: string): number => {
    const secs = parseTimeToSeconds(p)
    if (secs <= 0) return 0
    if (unitMatch === 'mi') return 1609.34 / secs
    if (unitMatch === 'km') return 1000 / secs
    if (unitMatch === '100m') return 100 / secs
    return 0
  }

  if (parts.length === 2) {
    const v1 = parseOne(parts[0])
    const v2 = parseOne(parts[1])
    const low = Math.min(v1, v2)
    const high = Math.max(v1, v2)
    return { low, high }
  }

  if (parts.length === 1) return { value: parseOne(parts[0]) }
  return null
}

function widenPaceToRangeMetersPerSecond(pace: string, intensity: string, opts?: { durationSec?: number; distanceMeters?: number }): { low: number; high: number } | null {
  // Accepts pace like "7:00/mi" or "4:20/km"; returns m/s bounds with science-based tolerances
  if (!pace) return null
  const mi = pace.includes('/mi')
  const km = pace.includes('/km')
  if (!mi && !km) return null
  const parts = pace.replace('/mi','').replace('/km','').split(':').map(p=>parseInt(p.trim(),10))
  if (parts.some(n=>Number.isNaN(n))) return null
  let secs = 0
  if (parts.length === 2) secs = parts[0]*60 + parts[1]
  else if (parts.length === 3) secs = parts[0]*3600 + parts[1]*60 + parts[2]
  if (secs <= 0) return null
  // Science-based tolerances
  const upper = (intensity || '').toUpperCase()
  const d = Math.max(0, Number(opts?.durationSec || 0))
  const distM = Math.max(0, Number(opts?.distanceMeters || 0))

  // Determine bucket: short reps, tempo/threshold, or endurance
  let bucket: 'short' | 'tempo' | 'endurance' = 'endurance'
  if (d > 0) {
    if (d <= 5 * 60) bucket = 'short'
    else if (d >= 10 * 60 && d <= 30 * 60) bucket = 'tempo'
    else bucket = 'endurance'
  } else if (distM > 0) {
    if (distM <= 1200) bucket = 'short'
    else if (distM >= 3200 && distM <= 10000) bucket = 'tempo'
    else bucket = 'endurance'
  } else {
    // Fallback to intensity label if no duration/distance
    if (upper.includes('INTERVAL') || upper.includes('VO2')) bucket = 'short'
    else if (upper.includes('TEMPO') || upper.includes('THRESHOLD')) bucket = 'tempo'
    else bucket = 'endurance'
  }

  let delta = 0
  if (bucket === 'short') delta = mi ? 4 : 3
  else if (bucket === 'tempo') delta = mi ? 7 : 5
  else delta = mi ? 12 : 8

  const unitMeters = mi ? 1609.34 : 1000
  const lowSpeed = unitMeters / (secs + delta) // slower pace -> lower speed
  const highSpeed = unitMeters / (secs - delta) // faster pace -> higher speed
  return { low: Math.min(lowSpeed, highSpeed), high: Math.max(lowSpeed, highSpeed) }
}

function parseRangeNumber(text: string): { value?: number; low?: number; high?: number } {
  // Accepts "250W", "250-300W", "150-160", "85"
  const cleaned = text.replace(/[^0-9\-\.]/g, '')
  if (cleaned.includes('-')) {
    const [a, b] = cleaned.split('-').map((n) => Number(n))
    const low = Math.min(a, b)
    const high = Math.max(a, b)
    return { low, high }
  }
  const value = Number(cleaned)
  return { value }
}

function applyTargets(step: GarminStep, primary: any, fallback?: any) {
  const src = primary ?? fallback ?? {}
  if (src?.paceTarget) {
    const pace = String(src.paceTarget)
    const parsed = parsePaceToMetersPerSecond(pace)
    if (parsed) {
      // Use SPEED (m/s) for Garmin run targets, always as a range
      step.targetType = 'SPEED'
      if (parsed.low != null && parsed.high != null) {
        step.targetValueLow = parsed.low
        step.targetValueHigh = parsed.high
      } else if (parsed.value != null) {
        const widened = widenPaceToRangeMetersPerSecond(pace, step.intensity || '', { durationSec: (step.durationType === 'TIME' ? step.durationValue : undefined) as any, distanceMeters: (step.durationType === 'DISTANCE' ? step.durationValue : undefined) as any })
        const v = parsed.value
        step.targetValueLow = widened ? widened.low : v * 0.97
        step.targetValueHigh = widened ? widened.high : v * 1.03
      }
      delete (step as any).targetValue
      delete (step as any).targetValueType
    }
    return
  }
  if (src?.powerTarget) {
    const pow = parseRangeNumber(String(src.powerTarget))
    step.targetType = 'POWER'
    if (pow.low != null && pow.high != null) {
      step.targetValueLow = pow.low
      step.targetValueHigh = pow.high
    } else if (pow.value != null) {
      // Expand single wattage to ±5%
      const base = pow.value
      const band = Math.max(1, Math.round(base * 0.05))
      step.targetValueLow = base - band
      step.targetValueHigh = base + band
    }
    delete (step as any).targetValue
    delete (step as any).targetValueType
    return
  }
  if (src?.bpmTarget) {
    const hr = parseRangeNumber(String(src.bpmTarget))
    step.targetType = 'HEART_RATE'
    if (hr.low != null && hr.high != null) {
      step.targetValueLow = hr.low
      step.targetValueHigh = hr.high
    } else if (hr.value != null) {
      const base = hr.value
      const band = Math.max(1, Math.round(base * 0.05))
      step.targetValueLow = base - band
      step.targetValueHigh = base + band
    }
    delete (step as any).targetValueType
    return
  }
  if (src?.cadenceTarget) {
    const cad = parseRangeNumber(String(src.cadenceTarget))
    step.targetType = 'CADENCE'
    if (cad.low != null && cad.high != null) {
      step.targetValueLow = cad.low
      step.targetValueHigh = cad.high
    } else if (cad.value != null) {
      const base = cad.value
      const band = Math.max(1, Math.round(base * 0.05))
      step.targetValueLow = base - band
      step.targetValueHigh = base + band
    }
    delete (step as any).targetValue
    delete (step as any).targetValueType
  }
}

function estimateWorkoutSeconds(
  workout: PlannedWorkout,
  steps: GarminStep[],
  computedSteps: any[] = []
): number {
  let total = 0;
  let idx = 0;

  // advance to the next *work* rep in computed (skip rests)
  const nextWork = () => {
    while (idx < computedSteps.length) {
      const t = String(computedSteps[idx]?.type || computedSteps[idx]?.kind || '').toLowerCase();
      if (!(t === 'interval_rest' || t === 'recovery' || /rest/.test(t))) break;
      idx += 1;
    }
    return computedSteps[idx];
  };

  const mid = (a: number, b: number) => (a + b) / 2;
  const mpsFromSecPerMi = (sec: number) => 1609.34 / Math.max(1, sec);
  const fallbackMps = mpsFromSecPerMi(570); // ~9:30/mi

  for (const s of steps) {
    if (s.durationType === 'TIME') {
      total += Math.max(0, s.durationValue || 0);
      if (s.intensity !== 'REST' && s.intensity !== 'RECOVERY') { nextWork(); idx += 1; }
      continue;
    }
    if (s.durationType === 'DISTANCE') {
      let mps: number | undefined;
      if (
        (s.targetType === 'PACE' || s.targetType === 'SPEED') &&
        isFinite((s as any).targetValueLow) &&
        isFinite((s as any).targetValueHigh)
      ) {
        mps = mid(Number((s as any).targetValueLow), Number((s as any).targetValueHigh));
      } else {
        const cs = nextWork();
        if (cs?.pace_range?.lower && cs?.pace_range?.upper) {
          mps = mpsFromSecPerMi(mid(Number(cs.pace_range.lower), Number(cs.pace_range.upper)));
        } else if (typeof cs?.pace_sec_per_mi === 'number') {
          mps = mpsFromSecPerMi(Number(cs.pace_sec_per_mi));
        }
      }
      total += Math.max(1, s.durationValue || 0) / (mps || fallbackMps);
      if (s.intensity !== 'REST' && s.intensity !== 'RECOVERY') idx += 1;
    }
  }
  return Math.round(total);
}

async function sendToGarmin(workout: GarminWorkout, accessToken: string): Promise<{ success: boolean; workoutId?: string; error?: string }> {
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
    if (!ok) return { success: false, error: `Garmin API ${status}: ${text}` }
    const json = await (response as Response).json()
    return { success: true, workoutId: json?.workoutId ?? json?.id }
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) }
  }
}

async function scheduleWorkoutOnDate(params: { garminWorkoutId: string; date: string; accessToken: string }): Promise<{ success: boolean; scheduleId?: string; error?: string }> {
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
    const json = await (response as Response).json()
    return { success: true, scheduleId: json?.workoutScheduleId ?? json?.id }
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) }
  }
}


