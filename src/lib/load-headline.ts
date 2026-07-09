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

// The LOAD verdict word reads the RECONCILED load_status (the two-key engine — D-260 sole verdict
// authority, D-266 weighted), NOT acwrVolumeLabel. ACWR survives only as the gauge number. Descriptive,
// not prescriptive — and deliberately: reconciled 'elevated' is where the two-key cap parks UNcorroborated
// highs, so it reads "a bit high", NEVER "back off" (mapping it to a prescription would re-alarm the exact
// weeks the cap protects). Only a corroborated 'high' earns the pull-back word.
export function statusVolumeLabel(status: string | null | undefined): string {
  if (status === 'under') return 'build more';
  if (status === 'on_target') return 'balanced';
  if (status === 'elevated') return 'a bit high';
  if (status === 'high') return 'pull back';
  return '—';
}

// NOTE (D-266 cleanup): the client-side plan-phase softening (`planAwareVolumeLabel`, Q-122) was
// REMOVED — its logic is now owned server-side by the reconciler's Gate 2 build-band (single source,
// D-264). The client reads the reconciled verdict via statusVolumeLabel; it never re-derives plan
// awareness. If the "building on plan" phrasing is wanted, expose it from the reconciler, not here.

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
    loadLabel === 'a bit high'       ? 'Load a bit high' :  // reconciled 'elevated' (two-key descriptive band)
    loadLabel === 'pull back'        ? 'Load high' :        // reconciled 'high' (corroborated)
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
