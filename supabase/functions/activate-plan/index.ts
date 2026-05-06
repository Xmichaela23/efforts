// @ts-nocheck
// Function: activate-plan
// Behavior: Activates a plan for a user by inserting planned_workouts
//           (persists steps_preset, strength_exercises, description, tags)
//           and then calls materialize-plan to compute computed.steps.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  getStepsIntensity,
  calculateTRIMPWorkload,
  calculateDurationWorkload,
  getDefaultIntensityForType,
} from '../_shared/workload.ts'

/**
 * Estimate planned workload for a session using the same TRIMP formula
 * as actual workouts. Without this, planned loads are duration-based
 * estimates that can't be compared to HR-based actual loads.
 */
function estimatePlannedWorkload(
  type: string,
  durationMinutes: number,
  stepsTokens: string[],
  maxHR: number | null,
  restingHR: number | null,
): number {
  if (!durationMinutes || durationMinutes <= 0) return 0;
  const intensity = getStepsIntensity(stepsTokens, type) || getDefaultIntensityForType(type) || 0.70;
  if (maxHR && maxHR > 0) {
    const rhr = restingHR && restingHR > 0 ? restingHR : 55;
    const hrReserve = maxHR - rhr;
    const avgHR = Math.round(rhr + intensity * hrReserve);
    const trimp = calculateTRIMPWorkload({ avgHR, maxHR, restingHR: rhr, durationMinutes });
    if (trimp !== null && trimp > 0) return Math.round(trimp);
  }
  // Fallback: duration × intensity (same as get-week fallback)
  return Math.round(calculateDurationWorkload(durationMinutes, intensity));
}

type SessionsByWeek = Record<string, Array<any>>

// ── Coaching notes ───────────────────────────────────────────────────────────

function isQualityRow(r: any): boolean {
  const n = String(r.name || '').toLowerCase()
  const tags: string[] = Array.isArray(r.tags) ? r.tags.map((t: any) => String(t).toLowerCase()) : []
  return tags.includes('quality') || tags.includes('threshold') || tags.includes('css') ||
    n.includes('quality') || n.includes('interval') || n.includes('threshold') ||
    n.includes('tempo') || n.includes('ftp') || n.includes('css')
}

function isHardRow(r: any): boolean {
  const n = String(r.name || '').toLowerCase()
  return isQualityRow(r) ||
    (r.type === 'run' && (r.duration || 0) >= 70) ||
    (r.type === 'ride' && (r.duration || 0) >= 90) ||
    (r.type === 'strength' && /lower|leg|squat|deadlift|rdl|hip thrust/i.test(n))
}

/**
 * Scans all rows being inserted and writes coaching_note into computed for
 * three schedule-context conditions. Mutates rows in place — called once at
 * activation time; notes never recompute on screen load.
 */
function applyCoachingNotes(rows: any[]): void {
  // Group rows by date (ISO string, first 10 chars)
  const byDate = new Map<string, any[]>()
  for (const r of rows) {
    const d = String(r.date || '').slice(0, 10)
    if (!d) continue
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(r)
  }

  const dates = [...byDate.keys()].sort()

  // Find quality bike date and quality run date (first in plan — week 1 representative)
  let qBikeDate: string | undefined
  let qRunDate: string | undefined
  // Use week 1 only to pick the representative days for note targeting
  const week1Rows = rows.filter((r) => (r.week_number ?? 1) === 1)
  for (const r of week1Rows) {
    const d = String(r.date || '').slice(0, 10)
    if (r.type === 'ride' && isQualityRow(r) && !qBikeDate) qBikeDate = d
    if (r.type === 'run' && isQualityRow(r) && !qRunDate) qRunDate = d
  }

  const dayOfWeek = (iso: string) => new Date(iso).getDay() // 0=Sun, 1=Mon … 6=Sat

  // Condition 1: quality run day adjacent (1 day apart) to quality bike day
  if (qBikeDate && qRunDate) {
    const diffDays = Math.round(
      Math.abs(new Date(qRunDate).getTime() - new Date(qBikeDate).getTime()) / 86_400_000,
    )
    if (diffDays === 1) {
      // Write note only on the quality run session
      for (const r of rows) {
        const d = String(r.date || '').slice(0, 10)
        if (d === qRunDate && r.type === 'run' && isQualityRow(r)) {
          r.computed = { ...(r.computed || {}), coaching_note: `Intervals are 12–18 hours after your group ride. If yesterday went deep, treat this as tempo rather than full quality — the adaptation still happens, the injury risk doesn't.` }
        }
      }
    }
  }

  // Condition 2: 3+ sessions on any single day (belt + suspenders after optimizer fix)
  for (const [date, daySessions] of byDate) {
    if (daySessions.length >= 3) {
      const names = daySessions.map((r: any) => r.name).filter(Boolean).join(', ')
      const note = `Three sessions today: ${names}. Easy session first, then quality, then strength — don't compress rest between them.`
      for (const r of daySessions) {
        r.computed = { ...(r.computed || {}), coaching_note: note }
      }
    }
  }

  // Condition 3: 4+ hard days in week 1 with no mid-week rest (Tue + Wed + Thu all have sessions)
  const week1Dates = dates.filter((d) => {
    const r = byDate.get(d)!.find((row: any) => (row.week_number ?? 1) === 1)
    return !!r
  })
  const week1HardDates = week1Dates.filter((d) => byDate.get(d)!.some(isHardRow))
  const hasTue = week1Dates.some((d) => dayOfWeek(d) === 2 && byDate.get(d)!.length > 0)
  const hasWed = week1Dates.some((d) => dayOfWeek(d) === 3 && byDate.get(d)!.length > 0)
  const hasThu = week1Dates.some((d) => dayOfWeek(d) === 4 && byDate.get(d)!.length > 0)

  if (week1HardDates.length >= 4 && hasTue && hasWed && hasThu) {
    const noteDate = qBikeDate ?? week1HardDates[0]
    if (noteDate) {
      for (const r of rows) {
        const d = String(r.date || '').slice(0, 10)
        if (d === noteDate && r.type === 'ride' && isQualityRow(r)) {
          // Only write if not already set by a more specific note
          if (!r.computed?.coaching_note) {
            r.computed = { ...(r.computed || {}), coaching_note: `Four hard sessions this week with no full recovery day mid-week. Wednesday ride intensity sets the tone — keep it controlled and the rest of the week holds together.` }
          }
        }
      }
    }
  }
}

function toISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function computeNextMonday(): string {
  const d = new Date()
  const day = d.getDay() // 0=Sun..6=Sat
  const diff = (8 - day) % 7 || 7
  const nm = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
  return toISO(nm)
}

function addDaysISO(iso: string, n: number): string {
  const parts = String(iso).split('-').map((x)=>parseInt(x,10))
  const base = new Date(parts[0], (parts[1]||1)-1, parts[2]||1)
  base.setDate(base.getDate() + n)
  return toISO(base)
}

// Normalize any ISO date to the Monday of its week (Mon=anchor)
function mondayOf(iso: string): string {
  try {
    const parts = String(iso).split('-').map((x)=>parseInt(x,10))
    const d = new Date(parts[0], (parts[1]||1)-1, parts[2]||1)
    const js = d.getDay() // 0=Sun..6=Sat
    const diff = (js === 0 ? -6 : (1 - js)) // shift to Monday
    d.setDate(d.getDate() + diff)
    return toISO(d)
  } catch {
    return iso
  }
}

const DAY_INDEX: Record<string, number> = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6, Sunday:7 }

// Map authoring type → planned_workouts.type. Returns null for unknown/blank so callers can skip
function mapType(raw: string, hasMobilityExercises: boolean): 'run'|'ride'|'swim'|'strength'|'mobility'|null {
  const t = String(raw||'').toLowerCase()
  if (hasMobilityExercises) return 'mobility'
  if (t === 'mobility' || t === 'pt') return 'mobility'
  if (t === 'ride' || t === 'bike' || t === 'cycling') return 'ride'
  if (t === 'swim') return 'swim'
  if (t === 'strength' || t === 'lift' || t === 'weights') return 'strength'
  if (t === 'run' || t === 'walk') return 'run'
  // Triathlon race day: store as 'ride' so the session lands on the calendar.
  // Name and description carry all the race-day context.
  if (t === 'race') return 'ride'
  return null
}

function titleFor(type: string, tokens: string[]): string {
  const t = String(type).toLowerCase()
  const joined = tokens.join(' ').toLowerCase()
  if (t === 'strength') return 'Strength'
  if (t === 'swim') return 'Swim — Technique'
  if (t === 'ride') {
    if (/bike_vo2|\bvo2\b/.test(joined)) return 'Ride — VO2'
    if (/bike_thr|threshold/.test(joined)) return 'Ride — Threshold'
    if (/bike_ss|sweet\s*spot/.test(joined)) return 'Ride — Sweet Spot'
    if (/endurance|z1|z2/.test(joined)) return 'Ride — Endurance'
    return 'Ride'
  }
  if (t === 'run') {
    if (/interval_|\b6x|\b8x|\b10x|\b400m|\b800m|\b1mi/.test(joined)) return 'Run — Intervals'
    if (/tempo_/.test(joined)) return 'Run — Tempo'
    if (/longrun_/.test(joined)) return 'Run — Long'
    return 'Run'
  }
  if (t === 'mobility') return 'Mobility'
  return 'Session'
}

function round5(n:number){ return Math.max(5, Math.round(n/5)*5) }
function deriveStrengthExercises(tokens: string[], baselines: any): any[] {
  try {
    const out: any[] = []
    const bn = baselines || {}
    const oneRM = {
      bench: typeof bn.bench === 'number' ? bn.bench : (typeof bn.benchPress==='number'?bn.benchPress:undefined),
      squat: typeof bn.squat === 'number' ? bn.squat : undefined,
      deadlift: typeof bn.deadlift === 'number' ? bn.deadlift : undefined,
      ohp: typeof bn.overheadPress1RM === 'number' ? bn.overheadPress1RM : (typeof bn.ohp==='number'?bn.ohp:undefined),
    }

    const getAccessoryRatio = (movement: string): number => {
      const m = String(movement ?? '').toLowerCase()
      // Primary lifts default to 1.0
      if (/bench|squat|deadlift|dead_lift|ohp|overhead/.test(m)) return 1.0
      // Upper body pull (bench reference)
      if (m==='barbell_row') return 0.90
      if (/^t[_-]?bar[_-]?row$/.test(m)) return 0.80
      if (m==='lat_pulldown') return 0.65
      if (m==='chest_supported_row') return 0.85
      if (m==='cable_row') return 0.70
      // Hip dominant (deadlift reference)
      if (/^hip[_-]?thrusts?$/.test(m)) return 0.80
      if (m==='romanian_deadlift') return 0.70
      if (m==='good_mornings') return 0.45
      if (m==='single_leg_rdl') return 0.25
      // Knee dominant (squat reference)
      if (m==='bulgarian_split_squat') return 0.30
      if (m==='walking_lunges') return 0.35
      if (m==='goblet_squats') return 0.40
      if (m==='step_ups') return 0.25
      // Upper body push variants (bench reference)
      if (m==='dips') return 0.90
      if (m==='incline_bench') return 0.85
      if (m==='close_grip_bench') return 0.90
      return 1.0
    }

    const getPrimary1RM = (movement: string): number | undefined => {
      const m = String(movement ?? '').toLowerCase()
      if (/bench/.test(m)) return oneRM.bench
      if (/squat/.test(m)) return oneRM.squat
      if (/deadlift|dead_lift/.test(m)) return oneRM.deadlift
      if (/ohp|overhead/.test(m)) return oneRM.ohp
      // Accessory → map to primary reference the ratio expects
      if (/barbell_row|t[_-]?bar[_-]?row|lat_pulldown|chest_supported_row|cable_row|dips|incline_bench|close_grip_bench/.test(m)) return oneRM.bench
      if (/hip[_-]?thrust|romanian_deadlift|good_mornings|single_leg_rdl/.test(m)) return oneRM.deadlift
      if (/bulgarian_split_squat|walking_lunges|goblet_squats|step_ups/.test(m)) return oneRM.squat
      return undefined
    }

    const repScaleFor = (reps: number): number => {
      if (!Number.isFinite(reps)) return 1
      if (reps <= 6) return 1.05
      if (reps <= 9) return 1.00
      if (reps <= 12) return 0.95
      if (reps <= 15) return 0.90
      return 0.85
    }

    const defaultPctFor = (reps: number): number => {
      if (!Number.isFinite(reps)) return 0.70
      if (reps <= 5) return 0.825
      if (reps <= 8) return 0.725
      if (reps <= 12) return 0.675
      return 0.60
    }

    for (const t of tokens) {
      const s = String(t).toLowerCase()
      // Numeric reps, optional @pct
      let m = s.match(/st_(?:main|acc)_([a-z0-9_]+)_(\d+)x(\d+)(?:_@pct(\d+))?/)
      if (m) {
        const movement = m[1]
        const sets = parseInt(m[2],10)
        const reps = parseInt(m[3],10)
        const explicitPct = m[4] ? parseInt(m[4],10) : undefined
        const displayName = movement.replace(/_/g,' ')

        const base1RM = getPrimary1RM(movement)
        if (!base1RM) { out.push({ name: displayName, sets: Math.max(1,sets), reps }); continue }
        // If @pct is provided, interpret as percent of base (reference) 1RM directly → ignore accessory ratio
        const ratio = (typeof explicitPct==='number') ? 1.0 : getAccessoryRatio(movement)
        const repScale = repScaleFor(reps)
        const pct = typeof explicitPct==='number' ? (explicitPct/100) : defaultPctFor(reps)
        const working = base1RM * ratio * pct * repScale
        out.push({ name: displayName, sets: Math.max(1,sets), reps, weight: round5(working) })
        continue
      }
      // AMRAP chin-up variant: weight left undefined
      m = s.match(/st_(?:main|acc)_([a-z0-9_]*chin[-_]?up[s]?|chinups?)_(\d+)xamrap(?:_rest\d+)?(?:_rir\d+)?/)
      if (m) {
        const nameRaw = (m[1]||'chinup').replace(/_/g,' ')
        const sets = parseInt(m[2],10)
        out.push({ name: nameRaw, sets: Math.max(1,sets), reps: 'AMRAP' })
        continue
      }
    }
    return out
  } catch { return [] }
}

// Function: activate-plan
Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string,string>

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const body = await req.json().catch(()=>({}))
    const planId: string | null = body?.plan_id || null
    const startDateOverride: string | null = body?.start_date || null
    if (!planId) return new Response(JSON.stringify({ error: 'plan_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type':'application/json' } })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Load plan with sessions
    const { data: plan, error: pErr } = await supabase
      .from('plans')
      .select('id,user_id,sessions_by_week,config,description,name')
      .eq('id', planId)
      .maybeSingle()
    if (pErr) throw pErr
    if (!plan) return new Response(JSON.stringify({ error: 'plan not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type':'application/json' } })

    const userId: string = plan.user_id
    const sessionsByWeek: SessionsByWeek = (plan.sessions_by_week || {}) as any
    if (!sessionsByWeek || Object.keys(sessionsByWeek).length === 0) {
      return new Response(JSON.stringify({ success: true, inserted: 0, reason: 'no_sessions' }), { headers: { ...corsHeaders, 'Content-Type':'application/json' } })
    }

    // Fetch athlete HR baselines for TRIMP-based planned workload estimation.
    // This makes workload_planned use the same formula as workload_actual so
    // planned vs actual comparisons are meaningful.
    let athleteMaxHR: number | null = null;
    let athleteRestingHR: number | null = null;
    try {
      const { data: ub } = await supabase
        .from('user_baselines')
        .select('performance_numbers,learned_baselines')
        .eq('user_id', userId)
        .maybeSingle();
      const perf = (ub as any)?.performance_numbers || {};
      const learned = (ub as any)?.learned_baselines || {};
      athleteMaxHR = Number(learned?.run_max_hr_observed?.value || perf?.maxHeartRate || perf?.max_heart_rate || 0) || null;
      athleteRestingHR = Number(perf?.restingHeartRate || perf?.resting_heart_rate || 0) || null;
    } catch { /* non-fatal — workload will fall back to duration-based */ }

    // Start date: explicit override (import flow) → plan config (generation flow) → next Monday
    let startDate: string = startDateOverride
      || (plan.config?.user_selected_start_date ? String(plan.config.user_selected_start_date).slice(0,10) : '')
      || computeNextMonday()
    const anchorMonday: string = mondayOf(startDate)

    // Idempotency: Delete existing planned workouts for this plan before inserting new ones
    // This prevents duplicates if activate-plan is called multiple times
    try {
      const { error: deleteError } = await supabase
        .from('planned_workouts')
        .delete()
        .eq('training_plan_id', planId);
      if (deleteError) {
        console.warn('[activate-plan] Failed to delete existing workouts (may not exist):', deleteError);
      } else {
        console.log('[activate-plan] Cleared existing planned workouts for plan:', planId);
      }
    } catch (e) {
      console.warn('[activate-plan] Error during cleanup (non-fatal):', e);
    }

    const rows: any[] = []
    try { console.log('[activate-plan] using start_date:', startDate, 'anchorMonday:', anchorMonday, 'planId:', planId) } catch {}
    // Load baselines for strength exercise loads
    let baselines: any = {}
    try {
      const { data: ub } = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', userId).maybeSingle()
      baselines = (ub?.performance_numbers || {}) as any
    } catch {}

    // Determine swim defaults from plan config
    const swimUnit: 'yd'|'m' = ((): 'yd'|'m' => {
      const u = String(plan?.config?.swim_unit || plan?.config?.swimUnit || '').toLowerCase();
      if (u === 'm' || u === 'meter' || u === 'metres' || u === 'metre') return 'm';
      return 'yd';
    })();
    const defaultPoolLenM = swimUnit === 'yd' ? 22.86 : 25.0;

    // Track inserted rows to prevent duplicates within the same activation
    // Key format: `${weekNum}-${dow}-${date}-${type}` (matches unique constraint)
    const insertedKeys = new Set<string>();
    
    for (const wk of Object.keys(sessionsByWeek)) {
      const weekNum = parseInt(wk, 10)
      const sessions = Array.isArray(sessionsByWeek[wk]) ? sessionsByWeek[wk] : []
      for (const s of sessions) {
        const dow = DAY_INDEX[String(s.day)] || 1
        // Anchor all scheduling to the Monday of the selected start week,
        // then offset by (week-1)*7 + (dow-1). Skip first-week days before user-selected start.
        const date = addDaysISO(anchorMonday, (weekNum - 1) * 7 + (dow - 1))
        if (weekNum === 1 && date < startDate) continue

        const rawDiscipline = String(s.discipline || s.type || '').toLowerCase()
        // Skip non-work sessions that cannot materialize into steps
        if (rawDiscipline === 'rest' || rawDiscipline === 'off' || rawDiscipline === 'recovery') {
          continue
        }
        const hasMobility = Array.isArray((s as any)?.mobility_exercises) && (s as any).mobility_exercises.length > 0
        const mapped = mapType((s as any)?.discipline || (s as any)?.type, hasMobility)
        // Skip unknown/blank types instead of defaulting to run
        if (!mapped) continue
        
        // Deduplication: Check if we've already processed this session
        // (matches unique constraint: training_plan_id, week_number, day_number, date, type)
        const dedupeKey = `${weekNum}-${dow}-${date}-${mapped}`
        if (insertedKeys.has(dedupeKey)) {
          console.warn(`[activate-plan] Skipping duplicate session: week ${weekNum}, day ${dow}, date ${date}, type ${mapped}`)
          continue
        }
        insertedKeys.add(dedupeKey)
        const stepsTokens: string[] = Array.isArray(s?.steps_preset) ? s.steps_preset.map((t:any)=> String(t)) : []
        // Check multiple sources for the workout name: name, title, workout_structure.title
        const workoutStructure = (s as any)?.workout_structure && typeof (s as any).workout_structure === 'object' ? (s as any).workout_structure : null
        const name = (s.name && String(s.name).trim()) || ((s as any).title && String((s as any).title).trim()) || (workoutStructure?.title ? String(workoutStructure.title).trim() : null) || titleFor(mapped, stepsTokens)
        const durationVal = (typeof s?.duration === 'number' && isFinite(s.duration)) ? s.duration : 0

        // Brick support: split into ride and run rows
        const isBrick = String(s.discipline||s.type||'').toLowerCase() === 'brick'
        if (isBrick) {
          const bikeTokens = stepsTokens.filter(t => /^(warmup_bike|bike_|cooldown_bike)/i.test(String(t)))
          const runTokens = stepsTokens.filter(t => !/^(warmup_bike|bike_|cooldown_bike)/i.test(String(t)))
          const halfDur = durationVal > 0 ? durationVal / 2 : 0
          if (bikeTokens.length) {
            const bikeKey = `${weekNum}-${dow}-${date}-ride`
            if (!insertedKeys.has(bikeKey)) {
              insertedKeys.add(bikeKey)
              rows.push({
                user_id: userId,
                training_plan_id: planId,
                template_id: String(planId),
                week_number: weekNum,
                day_number: dow,
                date,
                type: 'ride',
                name: s.name ? `${s.name} — Bike` : 'Ride',
                description: s.description || '',
                duration: halfDur,
                workout_status: 'planned',
                source: 'training_plan',
                steps_preset: bikeTokens,
                rendered_description: s.description || '',
                computed: null,
                units: (plan.config?.units === 'metric' ? 'metric' : 'imperial'),
                tags: Array.isArray(s?.tags) ? s.tags : [],
                workload_planned: halfDur > 0 ? estimatePlannedWorkload('ride', halfDur, bikeTokens, athleteMaxHR, athleteRestingHR) : null,
              })
            }
          }
          if (runTokens.length) {
            const runKey = `${weekNum}-${dow}-${date}-run`
            if (!insertedKeys.has(runKey)) {
              insertedKeys.add(runKey)
              rows.push({
                user_id: userId,
                training_plan_id: planId,
                template_id: String(planId),
                week_number: weekNum,
                day_number: dow,
                date,
                type: 'run',
                name: s.name ? `${s.name} — Run` : 'Run',
                description: s.description || '',
                duration: halfDur,
                workout_status: 'planned',
                source: 'training_plan',
                steps_preset: runTokens,
                rendered_description: s.description || '',
                computed: null,
                units: (plan.config?.units === 'metric' ? 'metric' : 'imperial'),
                tags: Array.isArray(s?.tags) ? s.tags : [],
                workload_planned: halfDur > 0 ? estimatePlannedWorkload('run', halfDur, runTokens, athleteMaxHR, athleteRestingHR) : null,
              })
            }
          }
          continue
        }

        const estimatedWorkload = durationVal > 0
          ? estimatePlannedWorkload(mapped || 'run', durationVal, stepsTokens, athleteMaxHR, athleteRestingHR)
          : null;

        const baseRow: any = {
          user_id: userId,
          training_plan_id: planId,
          template_id: String(planId),
          week_number: weekNum,
          day_number: dow,
          date,
          type: mapped,
          name,
          description: s.description || '',
          duration: durationVal,
          workout_status: 'planned',
          source: 'training_plan',
          steps_preset: stepsTokens.length ? stepsTokens : null,
          rendered_description: s.description || '',
          computed: null,
          units: (plan.config?.units === 'metric' ? 'metric' : 'imperial'),
          tags: Array.isArray(s?.tags) ? s.tags : (Array.isArray(s?.optional) && s.optional ? ['optional'] : []),
          workload_planned: estimatedWorkload && estimatedWorkload > 0 ? estimatedWorkload : null,
          // Include authored structured workout when present so server materializer can expand it
          workout_structure: (s as any)?.workout_structure && typeof (s as any).workout_structure === 'object' ? (s as any).workout_structure : null,
        }
        if (mapped === 'mobility') {
          // Pass through authored mobility exercises as-is (display-time structure)
          const mob = (s as any)?.mobility_exercises
          if (Array.isArray(mob) && mob.length) {
            baseRow.mobility_exercises = mob
          }
          // Ensure a stable display name for mobility when not authored
          if (!baseRow.name || String(baseRow.name).trim()==='') baseRow.name = 'Mobility'
        }
        // Persist authored swim unit on each swim row so rendering/materialization honors yards vs meters.
        // Token-based pool-length hints may refine the length, but only override the unit when the
        // plan-level swimUnit is already metric — never flip an imperial plan to meters.
        if (mapped === 'swim') {
          const joined = stepsTokens.join(' ').toLowerCase();
          let poolLen = defaultPoolLenM;
          let unit: 'yd'|'m' = swimUnit;
          if (swimUnit !== 'yd') {
            if (/\b50m\b/.test(joined)) { unit = 'm'; poolLen = 50.0; }
            if (/\b25m\b/.test(joined)) { unit = 'm'; poolLen = 25.0; }
          }
          if (/\b25\s*yd\b/.test(joined)) { unit = 'yd'; poolLen = 22.86; }
          baseRow.pool_unit = unit;
          baseRow.pool_length_m = poolLen;
        }
        if (mapped === 'strength') {
          // Prefer authored strength_exercises when provided; else derive from tokens
          const authored = Array.isArray((s as any)?.strength_exercises) ? (s as any).strength_exercises : []
          if (authored.length) {
            baseRow.strength_exercises = authored
          } else {
            const ex = deriveStrengthExercises(stepsTokens, baselines)
            if (ex && ex.length) baseRow.strength_exercises = ex
          }
        }
        rows.push(baseRow)
      }
    }

    // Compute schedule-aware coaching notes from the full rows set.
    // Notes are generated once here at activation time and stored in computed.coaching_note.
    // The optimizer has already placed sessions; we re-derive context from the rows themselves.
    applyCoachingNotes(rows)

    let inserted = 0
    if (rows.length) {
      const { error } = await supabase.from('planned_workouts').insert(rows as any)
      if (error) throw error
      inserted = rows.length
      console.log(`✅ Inserted ${inserted} planned workouts with TRIMP-based workload_planned (maxHR=${athleteMaxHR}, restHR=${athleteRestingHR})`)
    }

    // Materialize steps for the whole plan (server-side expansion)
    try {
      const baseUrl = Deno.env.get('SUPABASE_URL')
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
      console.log(`[activate-plan] Calling materialize-plan for plan_id: ${planId}`);
      const resp = await fetch(`${baseUrl}/functions/v1/materialize-plan`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}`, 'apikey': key },
        body: JSON.stringify({ plan_id: planId })
      })
      console.log(`[activate-plan] materialize-plan response status: ${resp.status}`);
      const respText = await resp.text();
      console.log(`[activate-plan] materialize-plan response: ${respText}`);
      // If materialize function fails hard, abort activation
      if (!resp.ok) {
        console.error(`[activate-plan] materialize-plan failed: ${respText}`);
        // Best effort cleanup of inserted rows
        try { await supabase.from('planned_workouts').delete().eq('training_plan_id', planId) } catch {}
        return new Response(JSON.stringify({ success:false, error:'materialize_failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type':'application/json' } })
      }
    } catch (e) {
      console.error(`[activate-plan] materialize-plan exception:`, e);
      try { await supabase.from('planned_workouts').delete().eq('training_plan_id', planId) } catch {}
      return new Response(JSON.stringify({ success:false, error:'materialize_exception', details: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type':'application/json' } })
    }

    // Auto-attach completed workouts to planned workouts
    try {
      console.log('🔗 Starting auto-attachment for plan:', planId);
      
      // Get all completed workouts for this user in a broader date range
      // Look back 30 days and forward 1 year to catch workouts from previous plan iterations
      const lookbackDate = addDaysISO(startDate, -30);
      const lookforwardDate = addDaysISO(startDate, 365);
      
      const { data: completedWorkouts } = await supabase
        .from('workouts')
        .select('id, type, date, user_id')
        .eq('user_id', userId)
        .eq('workout_status', 'completed')
        .gte('date', lookbackDate)
        .lte('date', lookforwardDate)
        .is('planned_id', null); // Only unattached workouts
      
      const workoutsToAttach = Array.isArray(completedWorkouts) ? completedWorkouts : [];
      console.log('🔗 Found', workoutsToAttach.length, 'unattached completed workouts in date range', lookbackDate, 'to', lookforwardDate);
      
      // Auto-attach each completed workout
      for (const workout of workoutsToAttach) {
        try {
          console.log('🔗 Auto-attaching workout:', workout.id, workout.type, workout.date);
          const { data, error } = await supabase.functions.invoke('auto-attach-planned', {
            body: { workout_id: workout.id }
          });
          
          if (error) {
            console.error('❌ Auto-attach failed for workout:', workout.id, error);
          } else {
            console.log('✅ Auto-attached workout:', workout.id, data);
          }
        } catch (attachError) {
          console.error('❌ Auto-attach error for workout:', workout.id, attachError);
        }
      }
      
      console.log('🔗 Auto-attachment completed for plan:', planId);
    } catch (autoAttachError) {
      console.error('❌ Auto-attachment failed for plan:', planId, autoAttachError);
      // Don't fail the plan import if auto-attachment fails
    }

    // Verify (warn-only): log any rows without computed steps/total but do not block activation
    try {
      const { data: rowsAfter } = await supabase
        .from('planned_workouts')
        .select('id, type, steps_preset, workout_structure, computed, total_duration_seconds')
        .eq('training_plan_id', planId)
      const list = Array.isArray(rowsAfter) ? rowsAfter : []
      const invalid = list.filter((r:any) => {
        try {
          const steps = Array.isArray((r as any)?.computed?.steps) ? (r as any).computed.steps : []
          const total = Number((r as any)?.total_duration_seconds || (r as any)?.computed?.total_duration_seconds)
          return !(steps.length>0 && Number.isFinite(total) && total>0)
        } catch { return true }
      })
      if (invalid.length>0 || (inserted>0 && list.length < inserted)) {
        const sample = invalid.slice(0, 10).map((r:any)=>({
          id: r.id,
          type: r.type,
          hasTokens: Array.isArray(r?.steps_preset) && r.steps_preset.length>0,
          hasStructure: !!(r?.workout_structure && typeof r.workout_structure==='object'),
          stepCount: Array.isArray(r?.computed?.steps) ? r.computed.steps.length : 0,
          total: Number(r?.total_duration_seconds || r?.computed?.total_duration_seconds) || null,
        }))
        console.warn('activate-plan verification warnings', { invalid_count: invalid.length, sample })
      }
    } catch {}

    return new Response(JSON.stringify({ success: true, inserted, plan_id: planId, start_date: startDate }), { headers: { ...corsHeaders, 'Content-Type':'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type':'application/json', ...corsHeaders } })
  }
})


