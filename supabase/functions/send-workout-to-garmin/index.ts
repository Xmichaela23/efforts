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
  estimatedDurationInSecs?: number
  segments: Array<{
    segmentOrder: number
    sport: string
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

    // Strict: must have materialized intervals (no fallbacks)
    if (!Array.isArray((workout as any).intervals) || (workout as any).intervals.length === 0) {
      return json({ error: 'Workout is not materialized for Garmin (intervals missing)' }, 422)
    }

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

    const garminPayload = convertWorkoutToGarmin(workout)

    const sendResult = await sendToGarmin(garminPayload, conn.access_token)
    if (!sendResult.success) {
      return json({ error: 'Failed to send to Garmin', details: sendResult.error }, 502)
    }

    // Try to schedule to user's Garmin Calendar on the workout date (best-effort)
    let scheduleResult: { success: boolean; scheduleId?: string; error?: string } | null = null
    if (workout.date) {
      scheduleResult = await scheduleWorkoutOnDate({
        garminWorkoutId: sendResult.workoutId!,
        date: workout.date,
        sport: mapWorkoutType(workout.type),
        accessToken: conn.access_token
      })
    }

    // Mark as sent
    await supabase
      .from('planned_workouts')
      .update({ workout_status: 'sent_to_garmin', updated_at: new Date().toISOString() })
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

function convertWorkoutToGarmin(workout: PlannedWorkout): GarminWorkout {
  const sport = mapWorkoutType(workout.type)
  const steps: GarminStep[] = []
  let stepId = 1
  // Use computed per-rep targets when available to guarantee PACE ranges per interval
  const computedSteps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : []
  let flatIdx = 0

  const applyComputedTargetIfMissing = (step: GarminStep) => {
    try {
      // Align computed index to the next non-rest step so targets map to work reps
      let idx = flatIdx
      while (idx < computedSteps.length) {
        const c = computedSteps[idx]
        const ct = String(c?.type || '').toLowerCase()
        if (!(ct === 'interval_rest' || /rest/.test(ct))) break
        idx += 1
      }
      const cs = computedSteps[idx]
      if (!cs) return
      // Keep flatIdx in sync with the non-rest mapping
      flatIdx = idx
      // Only apply when step has no explicit target
      const hasTarget = step.targetType || step.targetValue != null || step.targetValueLow != null
      if (hasTarget) return
      // RUNNING pace from computed pace_range / pace_sec_per_mi
      if (sport === 'RUNNING' && (typeof cs?.pace_sec_per_mi === 'number' || cs?.pace_range)) {
        const secPerMi: number | undefined = typeof cs.pace_sec_per_mi === 'number' ? cs.pace_sec_per_mi : undefined
        const range = cs?.pace_range as { lower?: number; upper?: number } | undefined
        // Convert pace (sec/mi) to speed (m/s)
        const toSpeed = (sec: number) => 1609.34 / sec
        step.targetType = 'PACE'
        step.targetValueType = 'PACE'
        if (range && typeof range.lower === 'number' && typeof range.upper === 'number') {
          step.targetValueLow = toSpeed(range.upper) // slower pace → lower speed
          step.targetValueHigh = toSpeed(range.lower) // faster pace → higher speed
        } else if (typeof secPerMi === 'number') {
          // Expand single pace using export tolerances (done later by Garmin, but set center if needed)
          step.targetValue = toSpeed(secPerMi)
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
          step.targetValueType = 'POWER'
          step.targetValueLow = Math.round(low)
          step.targetValueHigh = Math.round(high)
        } else {
          const center = parseW((cs as any)?.target_watts ?? (cs as any)?.target_value)
          if (typeof center === 'number' && isFinite(center)) {
            step.targetType = 'POWER'
            step.targetValueType = 'POWER'
            step.targetValueLow = Math.round(center * 0.95)
            step.targetValueHigh = Math.round(center * 1.05)
          }
        }
      }
    } catch {}
  }

  // Prefer locally built intervals from computed.steps (ensures rich labels/equipment/rest)
  const intervals = (() => {
    try {
      const comp: any = (workout as any)?.computed || {}
      const steps: any[] = Array.isArray(comp?.steps) ? comp.steps : []
      if (!steps.length) return Array.isArray((workout as any).intervals) ? (workout as any).intervals : []
      const out: any[] = []
      const typeLower = String((workout as any).type || '').toLowerCase()
      const isSwim = typeLower === 'swim'
      const pushWork = (lab: string, meters?: number, seconds?: number) => {
        const base: any = {}
        base.effortLabel = lab
        if (typeof meters === 'number' && meters > 0) base.distanceMeters = Math.max(1, Math.floor(meters))
        else if (typeof seconds === 'number' && seconds > 0) base.duration = Math.max(1, Math.floor(seconds))
        out.push(base)
      }
      const toMetersFromYd = (yd?: number) => (yd && yd > 0) ? Math.floor(yd * 0.9144) : undefined
      // Collect to enforce order: warmups → main (work + embedded rests) → interval_rest → cooldowns
      const warmArr: any[] = []
      const mainArr: any[] = []
      const explicitRestArr: any[] = []
      const coolArr: any[] = []
      for (const st of steps) {
        const t = String(st?.type || '').toLowerCase()
        const isRest = t === 'interval_rest' || /rest/.test(t)
        if (isRest) {
          const sec = Number((st as any)?.duration_s || (st as any)?.rest_s || 0)
          explicitRestArr.push({ effortLabel: 'rest', duration: Math.max(1, Math.floor(sec || 1)) })
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
          const yd = typeof (st as any)?.distance_yd === 'number' && (st as any).distance_yd > 0
            ? Math.max(25, Math.round((st as any).distance_yd / 25) * 25)
            : undefined
          const yardText = yd ? `1 × ${yd} yd` : undefined
          const baseLab = label || 'Interval'
          label = [baseLab, yardText, abbr].filter(Boolean).join(' — ')
        }
        const meters = typeof (st as any)?.distance_m === 'number' && (st as any).distance_m > 0
          ? Math.floor((st as any).distance_m)
          : toMetersFromYd((st as any)?.distance_yd)
        const seconds = typeof (st as any)?.duration_s === 'number' && (st as any).duration_s > 0 ? Math.floor((st as any).duration_s) : undefined
        // Route warmup/cooldown explicitly so Garmin ordering is correct
        if (t === 'warmup') {
          warmArr.push({ effortLabel: 'warm up', ...(typeof meters==='number' && meters>0 ? { distanceMeters: meters } : {}), ...(typeof seconds==='number' && seconds>0 ? { duration: seconds } : {}) })
        } else if (t === 'cooldown') {
          coolArr.push({ effortLabel: 'cool down', ...(typeof meters==='number' && meters>0 ? { distanceMeters: meters } : {}), ...(typeof seconds==='number' && seconds>0 ? { duration: seconds } : {}) })
        } else {
          mainArr.push({ effortLabel: (label || (isSwim ? 'interval' : 'interval')), ...(typeof meters==='number' && meters>0 ? { distanceMeters: meters } : {}), ...(typeof seconds==='number' && seconds>0 ? { duration: seconds } : {}) })
          // Append explicit rest after work if rest_s present
          if (typeof (st as any)?.rest_s === 'number' && (st as any).rest_s > 0) {
            explicitRestArr.push({ effortLabel: 'rest', duration: Math.max(1, Math.floor((st as any).rest_s)) })
          }
        }
      }
      const ordered = [...warmArr, ...mainArr, ...explicitRestArr, ...coolArr]
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
      step.exerciseName = label
      if (weight > 0) step.weightValue = weight
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
        durationType: 'TIME',
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
          const sIntensity = mapEffortToIntensity(String((seg?.effortLabel ?? interval?.effortLabel) || '').trim())
          const sMeters = Number(seg?.distanceMeters)
          const sSeconds = Number(seg?.duration)
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
            durationValue: (Number.isFinite(sMeters) && sMeters > 0) ? Math.floor(sMeters) : Math.floor(sSeconds)
          }
          applyTargets(step, seg, interval)
          // Try to apply computed per-rep target if none attached
          applyComputedTargetIfMissing(step)
          steps.push(step)
          stepId += 1
          flatIdx += 1
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
      durationValue: (Number.isFinite(meters) && meters > 0) ? Math.floor(meters) : Math.floor(seconds)
    }
    applyTargets(step, interval)
    applyComputedTargetIfMissing(step)
    steps.push(step)
    stepId += 1
    flatIdx += 1
  }

  return {
    workoutName: workout.name,
    sport,
    segments: [
      {
        segmentOrder: 1,
        sport,
        steps
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
    walk: 'WALKING'
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
  // Accepts formats like "7:00/mi", "4:30/km", "1:50/100m", range like "7:00-7:30/mi"
  if (!pace) return null
  const unitMatch = pace.includes('/mi') ? 'mi' : pace.includes('/km') ? 'km' : pace.includes('/100m') ? '100m' : null
  if (!unitMatch) return null

  const rangeSplit = pace.replace('/mi', '').replace('/km', '').replace('/100m', '').split('-')
  const parseOne = (p: string): number => {
    const secs = parseTimeToSeconds(p.trim())
    if (secs <= 0) return 0
    if (unitMatch === 'mi') return 1609.34 / secs
    if (unitMatch === 'km') return 1000 / secs
    if (unitMatch === '100m') return 100 / secs
    return 0
  }

  if (rangeSplit.length === 2) {
    const v1 = parseOne(rangeSplit[0])
    const v2 = parseOne(rangeSplit[1])
    const low = Math.min(v1, v2)
    const high = Math.max(v1, v2)
    return { low, high }
  }

  return { value: parseOne(rangeSplit[0]) }
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
      step.targetType = 'PACE'
      step.targetValueType = 'PACE'
      if (parsed.low != null && parsed.high != null) {
        step.targetValueLow = parsed.low
        step.targetValueHigh = parsed.high
      } else if (parsed.value != null) {
        // Expand single pace to a sensible range based on intensity
        const widened = widenPaceToRangeMetersPerSecond(pace, step.intensity || '', { durationSec: (step.durationType === 'TIME' ? step.durationValue : undefined) as any, distanceMeters: (step.durationType === 'DISTANCE' ? step.durationValue : undefined) as any })
        if (widened) {
          step.targetValueLow = widened.low
          step.targetValueHigh = widened.high
        } else {
          step.targetValue = parsed.value
        }
      }
    }
    return
  }
  if (src?.powerTarget) {
    const pow = parseRangeNumber(String(src.powerTarget))
    step.targetType = 'POWER'
    step.targetValueType = 'POWER'
    if (pow.low != null && pow.high != null) {
      step.targetValueLow = pow.low
      step.targetValueHigh = pow.high
    } else if (pow.value != null) {
      // Expand single wattage to ±5%
      const base = pow.value
      step.targetValueLow = Math.round(base * 0.95)
      step.targetValueHigh = Math.round(base * 1.05)
    }
    return
  }
  if (src?.bpmTarget) {
    const hr = parseRangeNumber(String(src.bpmTarget))
    step.targetType = 'HEART_RATE'
    step.targetValueType = 'HEART_RATE'
    if (hr.low != null && hr.high != null) {
      step.targetValueLow = hr.low
      step.targetValueHigh = hr.high
    } else if (hr.value != null) {
      step.targetValue = hr.value
    }
    return
  }
  if (src?.cadenceTarget) {
    const cad = parseRangeNumber(String(src.cadenceTarget))
    step.targetType = 'CADENCE'
    step.targetValueType = 'CADENCE'
    if (cad.low != null && cad.high != null) {
      step.targetValueLow = cad.low
      step.targetValueHigh = cad.high
    } else if (cad.value != null) {
      step.targetValue = cad.value
    }
  }
}

function estimateWorkoutSeconds(workout: PlannedWorkout, steps: GarminStep[]): number {
  // Always compute from steps to avoid inflated durations from stale workout.duration
  const sum = steps.reduce((acc, s) => acc + (s.durationType === 'TIME' ? (s.durationValue || 0) : 0), 0)
  return sum > 0 ? sum : 0
}

async function sendToGarmin(workout: GarminWorkout, accessToken: string): Promise<{ success: boolean; workoutId?: string; error?: string }> {
  try {
    const url = 'https://apis.garmin.com/workoutportal/workout/v2'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workout)
    })

    if (!res.ok) {
      const text = await res.text()
      return { success: false, error: `Garmin API ${res.status}: ${text}` }
    }
    const json = await res.json()
    return { success: true, workoutId: json?.workoutId ?? json?.id }
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) }
  }
}

async function scheduleWorkoutOnDate(params: { garminWorkoutId: string; date: string; sport: string; accessToken: string }): Promise<{ success: boolean; scheduleId?: string; error?: string }> {
  try {
    // Expect date as YYYY-MM-DD
    const body = {
      workoutId: params.garminWorkoutId,
      date: params.date,
      sport: params.sport
    }
    const url = 'https://apis.garmin.com/training-api/schedule/'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const text = await res.text()
      return { success: false, error: `Schedule API ${res.status}: ${text}` }
    }
    const json = await res.json()
    return { success: true, scheduleId: json?.workoutScheduleId ?? json?.id }
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) }
  }
}


