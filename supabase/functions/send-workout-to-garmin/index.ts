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
      .select('garmin_access_token, garmin_refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .single()

    if (connErr || !conn?.garmin_access_token) {
      return json({ error: 'Garmin connection not found' }, 400)
    }

    const garminPayload = convertWorkoutToGarmin(workout)

    const sendResult = await sendToGarmin(garminPayload, conn.garmin_access_token)
    if (!sendResult.success) {
      return json({ error: 'Failed to send to Garmin', details: sendResult.error }, 502)
    }

    // Mark as sent
    await supabase
      .from('planned_workouts')
      .update({ workout_status: 'sent_to_garmin', updated_at: new Date().toISOString() })
      .eq('id', workoutId)

    return json({ success: true, garminWorkoutId: sendResult.workoutId })
  } catch (err: any) {
    return json({ error: 'Internal error', details: err?.message ?? String(err) }, 500)
  }
})

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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
    const intensity = mapEffortToIntensity(String(interval?.effortLabel ?? '').trim())
    const seconds = parseTimeToSeconds(String(interval?.time ?? '0'))

    const step: GarminStep = {
      type: 'WorkoutStep',
      stepId,
      stepOrder: stepId,
      intensity,
      description: String(interval?.effortLabel ?? '').trim() || undefined,
      durationType: 'TIME',
      durationValue: seconds > 0 ? seconds : 0
    }

    // Targets (one primary; support low/high if range)
    // Order of precedence: pace, power, heart rate, cadence
    if (interval?.paceTarget) {
      const pace = String(interval.paceTarget)
      const paceParsed = parsePaceToMetersPerSecond(pace)
      if (paceParsed && (paceParsed.value || (paceParsed.low && paceParsed.high))) {
        step.targetType = 'PACE'
        step.targetValueType = 'PACE'
        if (paceParsed.low && paceParsed.high) {
          step.targetValueLow = paceParsed.low
          step.targetValueHigh = paceParsed.high
        } else if (paceParsed.value) {
          step.targetValue = paceParsed.value
        }
      }
    } else if (interval?.powerTarget) {
      const pow = parseRangeNumber(String(interval.powerTarget))
      step.targetType = 'POWER'
      step.targetValueType = 'POWER'
      if (pow.low != null && pow.high != null) {
        step.targetValueLow = pow.low
        step.targetValueHigh = pow.high
      } else if (pow.value != null) {
        step.targetValue = pow.value
      }
    } else if (interval?.bpmTarget) {
      const hr = parseRangeNumber(String(interval.bpmTarget))
      step.targetType = 'HEART_RATE'
      step.targetValueType = 'HEART_RATE'
      if (hr.low != null && hr.high != null) {
        step.targetValueLow = hr.low
        step.targetValueHigh = hr.high
      } else if (hr.value != null) {
        step.targetValue = hr.value
      }
    } else if (interval?.cadenceTarget) {
      const cad = parseRangeNumber(String(interval.cadenceTarget))
      step.targetType = 'CADENCE'
      step.targetValueType = 'CADENCE'
      if (cad.low != null && cad.high != null) {
        step.targetValueLow = cad.low
        step.targetValueHigh = cad.high
      } else if (cad.value != null) {
        step.targetValue = cad.value
      }
    }

    steps.push(step)
    stepId += 1
  }

  const estimatedSecs = estimateWorkoutSeconds(workout, steps)

  return {
    workoutName: workout.name,
    sport,
    estimatedDurationInSecs: estimatedSecs,
    segments: [
      {
        segmentOrder: 1,
        sport,
        estimatedDurationInSecs: estimatedSecs,
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

function estimateWorkoutSeconds(workout: PlannedWorkout, steps: GarminStep[]): number {
  // Prefer explicit step durations if present; otherwise fallback to workout.duration (minutes)
  const sum = steps.reduce((acc, s) => acc + (s.durationType === 'TIME' ? (s.durationValue || 0) : 0), 0)
  if (sum > 0) return sum
  if (workout.duration && workout.duration > 0) return Math.round(workout.duration * 60)
  return 0
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


