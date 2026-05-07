/**
 * Plain-text swim workout layout for FORM Goggles "Script" / Create From Text.
 * https://www.formswim.com/blogs/all/introducing-script-your-instant-workout-creator
 *
 * Uses Warm-up / Main / Cool-down headings and simple lines parsers expect
 * (e.g. "10 x 100 yd moderate CSS pace", "15 sec rest").
 */

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v) && v > 0) return v
  const m = String(v ?? '').match(/(-?\d+\.?\d*)/)
  if (m) {
    const n = Number(m[1])
    return isFinite(n) && n > 0 ? n : undefined
  }
  return undefined
}

function isRecoveryStep(st: any): boolean {
  const k = String(st?.kind ?? st?.type ?? '').toLowerCase()
  return k === 'recovery' || k === 'rest' || k === 'interval_rest' || /rest/.test(k)
}

function recoverySec(st: any): number {
  return Math.max(
    0,
    Math.round(
      num(st?.duration_s) ??
        num(st?.seconds) ??
        num(st?.rest_s) ??
        num(st?.restSeconds) ??
        0,
    ) || 0,
  )
}

function swimDisplayYards(workout: any): boolean {
  const poolUnit = workout?.pool_unit as string | null | undefined
  const tokensArr: string[] = Array.isArray(workout?.steps_preset)
    ? workout.steps_preset.map((t: unknown) => String(t))
    : []
  const tokensJoined = tokensArr.join(' ').toLowerCase()
  const tokensPreferYd = /\byd\b/.test(tokensJoined) || /_\d+yd\b|\d+yd_/i.test(tokensJoined)
  const planUnitsRaw = String(workout?.units ?? '').toLowerCase()
  if (poolUnit === 'm') return false
  if (poolUnit === 'yd') return true
  return planUnitsRaw === 'imperial' || tokensPreferYd
}

function formatDistance(st: any, displayYards: boolean): string | undefined {
  const distM = num(st?.distance_m) ?? num(st?.distanceMeters)
  const distYd = num(st?.distance_yd) ?? num(st?.distanceYd) ?? num(st?.distance_yds)
  if (typeof distM === 'number') {
    if (displayYards) return `${Math.round(distM / 0.9144)} yd`
    return `${Math.round(distM)} m`
  }
  if (typeof distYd === 'number') return `${Math.round(distYd)} yd`
  const sec = num(st?.duration_s) ?? num(st?.seconds)
  if (typeof sec === 'number') {
    const m = Math.max(1, Math.floor(sec / 60))
    return `${m} min`
  }
  return undefined
}

/** Human-readable pool toy names FORM parsers recognize */
function formatEquipment(eqRaw: unknown): string | undefined {
  if (eqRaw == null) return undefined
  const t = String(eqRaw).trim().toLowerCase()
  if (!t || t === 'none') return undefined
  if (t === 'board') return 'Kickboard'
  if (t === 'buoy') return 'Pull buoy'
  if (t === 'fins') return 'Fins'
  if (t === 'snorkel') return 'Snorkel'
  if (/paddle/.test(t)) return 'Paddles'
  return String(eqRaw).trim()
}

function describeSwimStep(st: any): string {
  const kind = String(st?.kind ?? st?.type ?? '').toLowerCase()
  const label = String(st?.label ?? '').trim()
  const l = label.toLowerCase()
  const parts: string[] = []

  if (kind === 'warmup' || kind === 'cooldown') {
    parts.push('easy')
  } else if (kind === 'drill' || /^drill\b/i.test(label)) {
    const nm = label.replace(/^drill\s*/i, '').trim()
    parts.push(nm ? `${nm} drill` : 'drill')
  } else if (/css/.test(l)) parts.push('moderate CSS pace')
  else if (/threshold/.test(l)) parts.push('threshold')
  else if (/aerobic/.test(l)) parts.push('moderate aerobic')
  else if (/easy|steady|recovery/.test(l)) parts.push('easy')
  else if (/moderate/.test(l)) parts.push('moderate')
  else if (/hard|fast|sprint|zipper/.test(l)) parts.push('hard')
  else if (label) parts.push(label)
  else parts.push('steady')

  const eq = formatEquipment(st?.equipment)
  if (eq) parts.push(eq)

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function partitionSections(steps: any[]): { warmup: any[]; main: any[]; cooldown: any[] } {
  let i0 = 0
  while (i0 < steps.length && String(steps[i0]?.kind ?? steps[i0]?.type ?? '').toLowerCase() === 'warmup') {
    i0++
  }
  let i1 = steps.length
  while (i1 > i0 && String(steps[i1 - 1]?.kind ?? steps[i1 - 1]?.type ?? '').toLowerCase() === 'cooldown') {
    i1--
  }
  return {
    warmup: steps.slice(0, i0),
    main: steps.slice(i0, i1),
    cooldown: steps.slice(i1),
  }
}

/** Try "N x distance …" when consecutive identical work+rest repeats appear */
function compactRepeatedLines(sectionSteps: any[], displayYards: boolean): string[] {
  type Token =
    | { k: 'rest'; sec: number }
    | { k: 'work'; st: any; dist: string; desc: string }

  const tokens: Token[] = []
  for (const st of sectionSteps) {
    if (isRecoveryStep(st)) {
      const sec = recoverySec(st)
      if (sec > 0) tokens.push({ k: 'rest', sec })
      continue
    }
    const dist = formatDistance(st, displayYards)
    if (!dist) continue
    const desc = describeSwimStep(st)
    tokens.push({ k: 'work', st, dist, desc })
  }

  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    const cur = tokens[i]
    if (cur.k === 'rest') {
      out.push(`${cur.sec} sec rest`)
      i++
      continue
    }
    const sig = `${cur.dist}|${cur.desc}`
    let reps = 1
    let restBetween: number | undefined
    let j = i + 1
    while (j < tokens.length && tokens[j].k === 'work') {
      const w = tokens[j]
      if (`${w.dist}|${w.desc}` !== sig) break
      reps++
      j++
    }
    while (j + 1 < tokens.length) {
      const r = tokens[j]
      const w = tokens[j + 1]
      if (r.k !== 'rest' || w.k !== 'work') break
      const nextSig = `${w.dist}|${w.desc}`
      if (nextSig !== sig) break
      if (restBetween === undefined) restBetween = r.sec
      else if (r.sec !== restBetween) break
      reps++
      j += 2
    }
    out.push(`${reps} x ${cur.dist} ${cur.desc}`.trim())
    if (reps > 1 && restBetween != null && restBetween > 0) {
      out.push(`${restBetween} sec rest`)
    } else if (reps === 1 && j < tokens.length && tokens[j].k === 'rest') {
      out.push(`${tokens[j].sec} sec rest`)
      j++
    }
    i = j
  }
  return out
}

/**
 * Returns FORM Script-friendly text or null if not a swim with materialized steps.
 */
export function buildFormGogglesSwimScript(workout: any): string | null {
  const typeLower = String(workout?.type ?? '').toLowerCase()
  if (typeLower !== 'swim') return null

  let computed = workout?.computed
  if (typeof computed === 'string') {
    try {
      computed = JSON.parse(computed)
    } catch {
      return null
    }
  }
  const steps: any[] = Array.isArray(computed?.steps) ? computed.steps : []
  if (!steps.length) return null

  const displayYards = swimDisplayYards(workout)
  const { warmup, main, cooldown } = partitionSections(steps)

  const chunks: string[] = []
  const wLines = compactRepeatedLines(warmup, displayYards)
  if (wLines.length) {
    chunks.push('Warm-up', ...wLines)
  }
  const mLines = compactRepeatedLines(main, displayYards)
  chunks.push('Main', ...mLines)
  const cLines = compactRepeatedLines(cooldown, displayYards)
  if (cLines.length) {
    chunks.push('Cool-down', ...cLines)
  }

  return chunks.join('\n').trim()
}
