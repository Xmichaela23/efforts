// Deterministic STATE glance headline (#4) — a short, glanceable line composed from the spine
// verdicts (load + readiness + fitness), with the full LLM narrative behind an "open for more" expand.
//
// Three slots: STATE (the honest lead) · FITNESS shape — OBSERVATION.
// The OBSERVATION slot is a state-IMPLIED direction, never a prescription: it describes what the
// state means ("you have headroom"), it does NOT instruct a specific change ("add a session").
// Prescribing a specific adjustment is the gated autoregulation line (Step 5), not this glance.
// See docs/SPEC-state-headline.md (bounded composition now; authored phrase bank is the follow-on).

// The VOLUME verdict bands — single source for the ACWR→label mapping (LoadBar imports this too,
// so the gauge label and the headline can never drift apart).
export function acwrVolumeLabel(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v < 0.8) return 'build more';
  if (v <= 1.3) return 'balanced';
  if (v <= 1.5) return 'back off';
  return 'rest now';
}

// Q-122: the plan-phase-aware VOLUME word. A high-but-ON-PLAN build week should read
// "building on plan", not "back off" — the athlete is executing an intended build, not
// overreaching. Adjusts only the WORD (headline + gauge label); the gauge MARKER + acwrZone
// stay RAW ACWR (Option b — honest dual read: "ACWR 1.35 · pushing — building on plan").
// `acwrVolumeLabel` itself is UNTOUCHED (the marker shares it, so this can't desync them).
export function planAwareVolumeLabel(opts: {
  acwr: number | null | undefined;
  weekIntent?: string | null;
  wtdActualLoad?: number | null;
  wtdPlannedLoad?: number | null;
}): string {
  const raw = acwrVolumeLabel(opts.acwr);
  // ONLY the 'back off' band (1.3 < ACWR ≤ 1.5) is eligible. 'rest now' (≥1.5) is the hard
  // redline the plan never overrides; the lower bands aren't alarms to soften.
  if (raw !== 'back off' || opts.weekIntent !== 'build') return raw;
  const planned = opts.wtdPlannedLoad;
  const actual = opts.wtdActualLoad;
  // Denominator gate: week-to-date planned load must be meaningful. Early-week the planned sum
  // is tiny, so one extra session reads as a huge % overshoot (unreliable). Floor 150 → gates
  // Monday/Tuesday; the overshoot read is only trustworthy ~Thu/Fri (Q-122 trace).
  if (planned == null || planned < 150 || actual == null) return raw;
  // On-plan = not overshooting beyond 120% (the codebase's existing overshoot threshold, not 115%).
  const overshoot = (actual - planned) / planned;
  return overshoot <= 0.20 ? 'building on plan' : raw; // over the plan → "back off" stands
}

// The ACWR standard-app ZONE name (item 0) — the TrainingPeaks/Garmin vocabulary for the same
// bands `acwrVolumeLabel` reads, so the naked number gets a scale word ("ACWR 1.1 · optimal").
// Boundaries MUST match acwrVolumeLabel (0.8 / 1.3 / 1.5) and the LoadBar gauge bands — else the
// marker color, the verdict word, and the zone word could disagree (the honesty gap item 0 fixes).
export function acwrZone(v: number | null | undefined): string | null {
  if (v == null) return null;
  if (v < 0.8) return 'building';
  if (v <= 1.3) return 'optimal';
  if (v <= 1.5) return 'pushing';
  return 'spike';
}

// D-232/D-233: the refined display label (LEGS LOADED / LEGS SORE / EFFORT UP / FATIGUED) wins over the
// raw readinessState so the headline can never contradict the chip. Only FATIGUED is systemic.
function refinedReadinessPhrase(label: string | null | undefined): string | null {
  const u = String(label || '').toUpperCase();
  if (u === 'LEGS LOADED') return 'legs loaded';
  if (u === 'LEGS SORE') return 'legs sore';
  if (u === 'EFFORT UP') return 'effort up';
  if (u === 'FATIGUED') return 'fatigued';
  return null; // other labels (LOW FATIGUE/ABSORBING/…) fall back to the readinessState mapping
}

// Slot 1 — STATE: load verdict + readiness, the honest lead (never the deficit).
function stateSlot(loadLabel: string, readiness: string | null | undefined, readinessLabel?: string | null): string | null {
  const l =
    loadLabel === 'balanced'         ? 'Balanced load' :
    loadLabel === 'build more'       ? 'Room to build' :
    loadLabel === 'building on plan' ? 'Building on plan' : // Q-122: high ACWR but on-plan in a build week
    loadLabel === 'back off'         ? 'Load running high' :
    loadLabel === 'rest now'         ? 'Load very high' : null;
  const r = refinedReadinessPhrase(readinessLabel) ?? (
    readiness === 'fresh'       ? 'fresh' :
    readiness === 'adapting'    ? 'adapting' :
    readiness === 'fatigued'    ? 'fatigued' :
    readiness === 'overreached' ? 'overreached' :
    readiness === 'detrained'   ? 'detrained' :
    readiness === 'normal'      ? 'steady' : null);
  // Chip Option A (Michael 2026-07-04): the readiness STATE lives in the WEEK chip (one fact, one
  // place). The headline leads with LOAD only, so "Balanced load, effort up" (a 2nd copy of the chip)
  // becomes just "Balanced load." Readiness stands alone ONLY when there's no load reading.
  if (l) return l;
  if (r) return r.charAt(0).toUpperCase() + r.slice(1);
  return null;
}

// Slot 3 — OBSERVATION: a state-implied direction only. Pure physiological reads off the spine.
// Deliberately sparse: fires only where the state clearly implies one, omits otherwise (the state
// slot already carries "Load running high" etc., so we don't double it).
function observationSlot(loadLabel: string, readiness: string | null | undefined, _readinessLabel?: string | null): string | null {
  // Chip Option A: "you're carrying fatigue" for overreached/FATIGUED is DROPPED — that IS the chip's
  // state (FATIGUED), so restating it in the headline is the duplicate we're removing. Keep only the
  // "headroom" read on balanced+fresh, which has no chip of its own (unique information).
  if (loadLabel === 'balanced' && readiness === 'fresh') return 'you have headroom';
  return null;
}

export function buildLoadHeadline(opts: {
  loadLabel: string;                 // from acwrVolumeLabel(load.acwr)
  readinessState?: string | null;
  readinessLabel?: string | null;    // the refined chip label (LEGS LOADED / EFFORT UP / FATIGUED / …)
  fitnessDirection?: string | null;
  isTaperOrPeak?: boolean;
}): string | null {
  const { loadLabel, readinessState, readinessLabel, isTaperOrPeak } = opts;
  // In taper/peak, a "build more" reading is by-design low volume — don't lead the glance with it.
  const effLoad = isTaperOrPeak && loadLabel === 'build more' ? 'balanced' : loadLabel;
  const state = stateSlot(effLoad, readinessState, readinessLabel);
  const obs = state ? observationSlot(effLoad, readinessState, readinessLabel) : null;

  // The headline reflects THE WEEK only (Michael 2026-07-04) — one clock. Fitness is a different clock
  // and is NOT rolled up here: it's handed to the individual discipline rows under PERFORMANCE, each
  // on its own 6–8wk window. No aggregate fitness verdict anywhere (it would have to lie about the clock).
  return state ? `This week: ${obs ? `${state} — ${obs}` : state}.` : null;
}
