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

  const intervals = Array.isArray(workout.intervals) ? workout.intervals : []

  for (const interval of intervals) {
    // Handle repeat blocks with child segments
    if (Array.isArray(interval?.segments) && interval?.repeatCount && interval.repeatCount > 0) {
      for (let r = 0; r < Number(interval.repeatCount); r += 1) {
        for (const seg of interval.segments) {
          const sIntensity = mapEffortToIntensity(String(seg?.effortLabel ?? interval?.effortLabel ?? '').trim())
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
            description: String(seg?.effortLabel ?? interval?.effortLabel ?? '').trim() || undefined,
            durationType: (Number.isFinite(sMeters) && sMeters > 0) ? 'DISTANCE' : 'TIME',
            durationValue: (Number.isFinite(sMeters) && sMeters > 0) ? Math.floor(sMeters) : Math.floor(sSeconds)
          }
          applyTargets(step, seg, interval)
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
      durationValue: (Number.isFinite(meters) && meters > 0) ? Math.floor(meters) : Math.floor(seconds)
    }
    applyTargets(step, interval)
    steps.push(step)
    stepId += 1
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
        step.targetValue = parsed.value
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
      step.targetValue = pow.value
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


