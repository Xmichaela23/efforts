// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2'

type SessionsByWeek = Record<string, Array<any>>

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

const DAY_INDEX: Record<string, number> = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6, Sunday:7 }

function mapType(raw: string): 'run'|'ride'|'swim'|'strength' {
  const t = String(raw||'').toLowerCase()
  if (t === 'ride' || t === 'bike' || t === 'cycling') return 'ride'
  if (t === 'swim') return 'swim'
  if (t === 'strength' || t === 'lift' || t === 'weights') return 'strength'
  return 'run'
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
      const m = movement.toLowerCase()
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
      const m = movement.toLowerCase()
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

    // Determine start date
    let startDate: string = startDateOverride
      || (plan.config?.user_selected_start_date ? String(plan.config.user_selected_start_date).slice(0,10) : '')
    if (!startDate) startDate = computeNextMonday()

    const rows: any[] = []
    // Load baselines for strength exercise loads
    let baselines: any = {}
    try {
      const { data: ub } = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', userId).maybeSingle()
      baselines = (ub?.performance_numbers || {}) as any
    } catch {}

    for (const wk of Object.keys(sessionsByWeek)) {
      const weekNum = parseInt(wk, 10)
      const sessions = Array.isArray(sessionsByWeek[wk]) ? sessionsByWeek[wk] : []
      for (const s of sessions) {
        const dow = DAY_INDEX[String(s.day)] || 1
        const date = addDaysISO(startDate, (weekNum - 1) * 7 + (dow - 1))
        if (weekNum === 1 && date < startDate) continue

        const rawDiscipline = String(s.discipline || s.type || '').toLowerCase()
        // Skip non-work sessions that cannot materialize into steps
        if (rawDiscipline === 'rest' || rawDiscipline === 'off' || rawDiscipline === 'recovery') {
          continue
        }
        const mapped = mapType(s.discipline || s.type)
        const stepsTokens: string[] = Array.isArray(s?.steps_preset) ? s.steps_preset.map((t:any)=> String(t)) : []
        const name = s.name || titleFor(mapped, stepsTokens)
        const durationVal = (typeof s?.duration === 'number' && isFinite(s.duration)) ? s.duration : 0

        // Brick support: split into ride and run rows
        const isBrick = String(s.discipline||s.type||'').toLowerCase() === 'brick'
        if (isBrick) {
          const bikeTokens = stepsTokens.filter(t => /^(warmup_bike|bike_|cooldown_bike)/i.test(String(t)))
          const runTokens = stepsTokens.filter(t => !/^(warmup_bike|bike_|cooldown_bike)/i.test(String(t)))
          if (bikeTokens.length) rows.push({
            user_id: userId,
            training_plan_id: planId,
            template_id: String(planId),
            week_number: weekNum,
            day_number: dow,
            date,
            type: 'ride',
            name: s.name ? `${s.name} — Bike` : 'Ride',
            description: s.description || '',
            duration: durationVal,
            workout_status: 'planned',
            source: 'training_plan',
            steps_preset: bikeTokens,
            rendered_description: s.description || '',
            computed: null,
            units: (plan.config?.units === 'metric' ? 'metric' : 'imperial'),
            tags: Array.isArray(s?.tags) ? s.tags : [],
          })
          if (runTokens.length) rows.push({
            user_id: userId,
            training_plan_id: planId,
            template_id: String(planId),
            week_number: weekNum,
            day_number: dow,
            date,
            type: 'run',
            name: s.name ? `${s.name} — Run` : 'Run',
            description: s.description || '',
            duration: durationVal,
            workout_status: 'planned',
            source: 'training_plan',
            steps_preset: runTokens,
            rendered_description: s.description || '',
            computed: null,
            units: (plan.config?.units === 'metric' ? 'metric' : 'imperial'),
            tags: Array.isArray(s?.tags) ? s.tags : [],
          })
          continue
        }

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
          // Include authored structured workout when present so server materializer can expand it
          workout_structure: (s as any)?.workout_structure && typeof (s as any).workout_structure === 'object' ? (s as any).workout_structure : null,
        }
        if (mapped === 'strength') {
          const ex = deriveStrengthExercises(stepsTokens, baselines)
          if (ex && ex.length) baseRow.strength_exercises = ex
        }
        rows.push(baseRow)
      }
    }

    let inserted = 0
    if (rows.length) {
      const { error } = await supabase.from('planned_workouts').insert(rows as any)
      if (error) throw error
      inserted = rows.length
    }

    // Materialize steps for the whole plan (server-side expansion)
    try {
      const baseUrl = Deno.env.get('SUPABASE_URL')
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
      const resp = await fetch(`${baseUrl}/functions/v1/materialize-plan`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}`, 'apikey': key },
        body: JSON.stringify({ plan_id: planId })
      })
      // If materialize function fails hard, abort activation
      if (!resp.ok) {
        // Best effort cleanup of inserted rows
        try { await supabase.from('planned_workouts').delete().eq('training_plan_id', planId) } catch {}
        return new Response(JSON.stringify({ success:false, error:'materialize_failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type':'application/json' } })
      }
    } catch (e) {
      try { await supabase.from('planned_workouts').delete().eq('training_plan_id', planId) } catch {}
      return new Response(JSON.stringify({ success:false, error:'materialize_exception', details: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type':'application/json' } })
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


