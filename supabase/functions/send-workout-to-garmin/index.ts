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

    return json({ success: true, garminWorkoutId: sendResult.workoutId, scheduled: scheduleResult?.success ?? false, scheduleError: scheduleResult?.error })
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
  const steps: GarminStep[] = []
  let stepId = 1
  // Use computed per-rep targets when available to guarantee PACE ranges per interval
  const computedSteps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : []
  // Build per-type index lists so we can map computed targets by step intensity
  const byTypeIdx: { work: number[]; rest: number[]; warm: number[]; cool: number[] } = { work: [], rest: [], warm: [], cool: [] }
  try {
    computedSteps.forEach((x: any, i: number) => {
      const t = String(x?.type || '').toLowerCase()
      if (t === 'warmup') byTypeIdx.warm.push(i)
      else if (t === 'cooldown') byTypeIdx.cool.push(i)
      else if (t === 'interval_rest' || /rest/.test(t)) byTypeIdx.rest.push(i)
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
      // RUNNING pace from computed pace_range / pace_sec_per_mi
      if (sport === 'RUNNING' && (typeof cs?.pace_sec_per_mi === 'number' || cs?.pace_range)) {
        const secPerMi: number | undefined = typeof cs.pace_sec_per_mi === 'number' ? cs.pace_sec_per_mi : undefined
        const range = cs?.pace_range as { lower?: number; upper?: number } | undefined
        // Convert pace (sec/mi) to speed (m/s)
        const toSpeed = (sec: number) => 1609.34 / sec
        // Garmin run targets should use SPEED (m/s); Connect displays as Pace
        step.targetType = 'SPEED'
        if (range && typeof range.lower === 'number' && typeof range.upper === 'number') {
          step.targetValueLow = toSpeed(range.upper) // slower pace → lower speed
          step.targetValueHigh = toSpeed(range.lower) // faster pace → higher speed
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
        const parseW = (v: any): number | undefined => {
          if (typeof v === 'number' && isFinite(v)) return v
          if (typeof v === 'string') {
            const m = v.match(/(-?\d+\.?\d*)/)
            if (m) return Number(m[1])
          }
          return undefined
        }
        let low = parseW((cs as any)?.power_range?.lower ?? (cs as any)?.target_low)
        let high = parseW((cs as any)?.power_range?.upper ?? (cs as any)?.target_high)
        if (typeof low === 'number' && typeof high === 'number') {
          step.targetType = 'POWER'
          step.targetValueLow = Math.round(low)
          step.targetValueHigh = Math.round(high)
        } else {
          const center = parseW((cs as any)?.target_watts ?? (cs as any)?.target_value)
          if (typeof center === 'number' && isFinite(center)) {
            step.targetType = 'POWER'
            step.targetValueLow = Math.round(center * 0.95)
            step.targetValueHigh = Math.round(center * 1.05)
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
        const m1 = v.match(/(\d+)\s*min/i); if (m1) return parseInt(m1[1],10)*60
        const m2 = v.match(/(\d+)\s*s/i); if (m2) return parseInt(m2[1],10)
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

  // Prefer locally built intervals from computed.steps (ensures rich labels/equipment/rest)
  const intervals = (() => {
    if (Array.isArray(intervalsFromStructured) && intervalsFromStructured.length) return intervalsFromStructured
    try {
      const comp: any = (workout as any)?.computed || {}
      const steps: any[] = Array.isArray(comp?.steps) ? comp.steps : []
      if (!steps.length) return Array.isArray((workout as any).intervals) ? (workout as any).intervals : []
      // If computed exists but contains no actionable work reps, fall back to stored intervals (authoring)
      const hasWorkReps = steps.some((st: any) => {
        const t = String(st?.type || '').toLowerCase()
        if (t === 'warmup' || t === 'cooldown') return false
        if (t === 'interval_rest' || /rest/.test(t)) return false
        return true
      })
      if (!hasWorkReps) {
        const fromDb = Array.isArray((workout as any).intervals) ? (workout as any).intervals : []
        if (fromDb.length) return fromDb
      }
      const out: any[] = []
      const typeLower = String((workout as any).type || '').toLowerCase()
      const isSwim = typeLower === 'swim'
      const isRun = typeLower === 'run'
      const pushWork = (lab: string, meters?: number, seconds?: number) => {
        const base: any = {}
        base.effortLabel = lab
        if (typeof meters === 'number' && meters > 0) base.distanceMeters = Math.max(1, Math.round(meters))
        else if (typeof seconds === 'number' && seconds > 0) base.duration = Math.max(1, Math.floor(seconds))
        out.push(base)
      }
      const toMetersFromYd = (yd?: number) => (yd && yd > 0) ? Math.round(yd * 0.9144) : undefined
      // Collect in natural order: warmups → main (work interleaved with rests) → cooldowns
      const warmArr: any[] = []
      const mainArr: any[] = []
      const coolArr: any[] = []
      for (const st of steps) {
        const t = String(st?.type || '').toLowerCase()
        const isRest = t === 'interval_rest' || /rest/.test(t)
        if (isRest) {
          const sec = Number((st as any)?.duration_s || (st as any)?.rest_s || 0)
          mainArr.push({ effortLabel: 'rest', duration: Math.max(1, Math.floor(sec || 1)) })
          continue
        }
        let label = String((st as any)?.label || '').trim()
        // Strip leading "Drill — " prefix if present
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
        if (isSwim) {
          const equip = String((st as any)?.equipment || '').trim()
          const abbr = equip
            .replace(/pull buoy/ig,'buoy')
            .replace(/kickboard/ig,'board')
            .replace(/\(optional\)/ig,'(opt)')
          // Include per-rep yards explicitly so users see "1 × 100 yd"
          const ydRaw = typeof (st as any)?.distance_yd === 'number' && (st as any).distance_yd > 0
            ? Math.max(25, Math.round((st as any).distance_yd / 25) * 25)
            : undefined
          const yardText = ydRaw ? `1 × ${ydRaw} yd` : undefined
          const baseLab = label || 'Interval'
          label = [baseLab, yardText, abbr].filter(Boolean).join(' — ')
        }
        const meters = typeof (st as any)?.distance_m === 'number' && (st as any).distance_m > 0
          ? Math.round((st as any).distance_m)
          : toMetersFromYd((st as any)?.distance_yd)
        const seconds = typeof (st as any)?.duration_s === 'number' && (st as any).duration_s > 0 ? Math.floor((st as any).duration_s) : undefined
        // Route warmup/cooldown explicitly so Garmin ordering is correct
        if (t === 'warmup') {
          warmArr.push({ effortLabel: 'warm up', ...(typeof meters==='number' && meters>0 ? { distanceMeters: Math.round(meters) } : {}), ...((!isRun && typeof seconds==='number' && seconds>0) || (typeof meters!=='number' || !(meters>0)) ? { duration: seconds } : {}) })
        } else if (t === 'cooldown') {
          coolArr.push({ effortLabel: 'cool down', ...(typeof meters==='number' && meters>0 ? { distanceMeters: Math.round(meters) } : {}), ...((!isRun && typeof seconds==='number' && seconds>0) || (typeof meters!=='number' || !(meters>0)) ? { duration: seconds } : {}) })
        } else {
          mainArr.push({ effortLabel: (label || (isSwim ? 'interval' : 'interval')), ...(typeof meters==='number' && meters>0 ? { distanceMeters: Math.round(meters) } : {}), ...((!isRun && typeof seconds==='number' && seconds>0) || (typeof meters!=='number' || !(meters>0)) ? { duration: seconds } : {}) })
          // Append rest immediately after work if rest_s present
          if (typeof (st as any)?.rest_s === 'number' && (st as any).rest_s > 0) {
            mainArr.push({ effortLabel: 'rest', duration: Math.max(1, Math.floor((st as any).rest_s)) })
          }
        }
      }
      const ordered = [...warmArr, ...mainArr, ...coolArr]
      return ordered.length ? ordered : (Array.isArray((workout as any).intervals) ? (workout as any).intervals : [])
    } catch {
      return Array.isArray((workout as any).intervals) ? (workout as any).intervals : []
    }
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
            throw new Error('Invalid segment: must include distanceMeters>0 or duration>0')
          }
          const step: GarminStep = {
            type: 'WorkoutStep',
            stepId,
            stepOrder: stepId,
            intensity: sIntensity,
            description: String(((seg?.effortLabel ?? interval?.effortLabel) || '')).trim() || undefined,
            durationType: (Number.isFinite(sMeters) && sMeters > 0) ? 'DISTANCE' : 'TIME',
            durationValue: (Number.isFinite(sMeters) && sMeters > 0) ? Math.round(sMeters) : Math.floor(sSeconds)
          }
          if (sport === 'LAP_SWIMMING' && step.intensity === 'REST') {
            step.durationType = 'FIXED_REST'
          }
          applyTargets(step, seg, interval)
          // Swim metadata: apply stroke/equipment/drill only for swim and non-rest steps
          if (sport === 'LAP_SWIMMING' && !(step.intensity === 'REST' || step.intensity === 'RECOVERY')) {
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
          applyComputedTargetIfMissing(step, step.intensity === 'REST' || step.intensity === 'RECOVERY')
          normalizeTargetBounds(step)
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
      throw new Error('Invalid interval: must include distanceMeters>0 or duration>0')
    }
    const step: GarminStep = {
      type: 'WorkoutStep',
      stepId,
      stepOrder: stepId,
      intensity,
      description: String(interval?.effortLabel ?? '').trim() || undefined,
      durationType: (Number.isFinite(meters) && meters > 0) ? 'DISTANCE' : 'TIME',
      durationValue: (Number.isFinite(meters) && meters > 0) ? Math.round(meters) : Math.floor(seconds)
    }
    if (sport === 'LAP_SWIMMING' && step.intensity === 'REST') {
      step.durationType = 'FIXED_REST'
    }
    applyTargets(step, interval)
    // Swim metadata: apply stroke/equipment/drill only for swim and non-rest steps
    if (sport === 'LAP_SWIMMING' && !(step.intensity === 'REST' || step.intensity === 'RECOVERY')) {
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
    applyComputedTargetIfMissing(step, step.intensity === 'REST' || step.intensity === 'RECOVERY')
    normalizeTargetBounds(step)
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
      const t = String(computedSteps[idx]?.type || '').toLowerCase();
      if (!(t === 'interval_rest' || /rest/.test(t))) break;
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


