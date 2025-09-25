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
    for (const t of tokens) {
      const s = String(t).toLowerCase()
      // Standard pattern with numeric reps and optional @pct
      let m = s.match(/st_(?:main|acc)_([a-z0-9_]+)_(\d+)x(\d+)(?:_@pct(\d+))?/)
      if (m) {
        const nameRaw = m[1]
        const sets = parseInt(m[2],10)
        const reps = parseInt(m[3],10)
        const pct = m[4] ? parseInt(m[4],10) : undefined
        const name = nameRaw.replace(/_/g,' ')
        let base: number | undefined
        if (/bench/.test(nameRaw)) base = oneRM.bench
        else if (/squat/.test(nameRaw)) base = oneRM.squat
        else if (/deadlift|dead_lift/.test(nameRaw)) base = oneRM.deadlift
        else if (/ohp|overhead/.test(nameRaw)) base = oneRM.ohp
        const weight = (typeof base==='number' && typeof pct==='number') ? round5(base * (pct/100)) : undefined
        out.push({ name, sets: Math.max(1,sets), reps, ...(weight?{ weight }:{}) })
        continue
      }
      // AMRAP chin-up variant: st_acc_chinup_3xamrap_rest105_rir2
      m = s.match(/st_(?:main|acc)_([a-z0-9_]*chin[-_]?up[s]?|chinups?)_(\d+)xamrap(?:_rest\d+)?(?:_rir\d+)?/)
      if (m) {
        const nameRaw = (m[1]||'chinup').replace(/_/g,' ')
        const sets = parseInt(m[2],10)
        const name = nameRaw
        out.push({ name, sets: Math.max(1,sets), reps: 'AMRAP' })
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
      await fetch(`${baseUrl}/functions/v1/materialize-plan`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}`, 'apikey': key },
        body: JSON.stringify({ plan_id: planId })
      })
    } catch {}

    return new Response(JSON.stringify({ success: true, inserted, plan_id: planId, start_date: startDate }), { headers: { ...corsHeaders, 'Content-Type':'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type':'application/json', ...corsHeaders } })
  }
})


