// Deterministic STATE glance headline (#4) — a short, glanceable line composed from the spine
// verdicts (load + readiness + fitness), with the full LLM narrative behind an "open for more" expand.
//
// Three slots: STATE (the honest lead) · FITNESS shape — OBSERVATION.
// The OBSERVATION slot is a state-IMPLIED direction, never a prescription: it describes what the
// state means ("you have headroom"), it does NOT instruct a specific change ("add a session").
// Prescribing a specific adjustment is the gated autoregulation line (Step 5), not this glance.
// See docs/SPEC-state-headline.md (bounded composition now; authored phrase bank is the follow-on).

// The LOAD verdict word reads the RECONCILED load_status (the two-key engine — D-260 sole verdict
// authority, D-266 weighted), NOT acwrVolumeLabel. ACWR survives only as the gauge number. Descriptive,
// not prescriptive — and deliberately: reconciled 'elevated' is where the two-key cap parks UNcorroborated
// highs, so it reads "a bit high", NEVER "back off" (mapping it to a prescription would re-alarm the exact
// weeks the cap protects). Only a corroborated 'high' earns the pull-back word.
export function statusVolumeLabel(status: string | null | undefined): string {
  if (status === 'under') return 'build more';
  if (status === 'on_target') return 'balanced';
  if (status === 'productive') return 'productive'; // real elevation, body absorbing it (Garmin/COROS/Intervals)
  if (status === 'elevated') return 'a bit high';
  if (status === 'high') return 'pull back';
  return '—';
}

// NOTE (D-266 cleanup): the client-side plan-phase softening (`planAwareVolumeLabel`, Q-122) was
// REMOVED — its logic is now owned server-side by the reconciler's Gate 2 build-band (single source,
// D-264). The client reads the reconciled verdict via statusVolumeLabel; it never re-derives plan
// awareness. If the "building on plan" phrasing is wanted, expose it from the reconciler, not here.

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
function observationSlot(loadLabel: string, readiness: string | null | undefined, acwr?: number | null): string | null {
  // "headroom" read on balanced+fresh. D-268 Phase 5: only when load is GENUINELY light — acute below
  // chronic (acwr < 1.0). Reads the server-computed acwr; never claims "headroom" while load is AT or
  // ABOVE the athlete's own norm (the old bug: "headroom" at ACWR 1.3, above chronic).
  if (loadLabel === 'balanced' && readiness === 'fresh' && acwr != null && acwr < 1.0) return 'you have headroom';
  return null;
}

export function buildLoadHeadline(opts: {
  loadLabel: string;                 // reconciled load_status verdict word
  readinessState?: string | null;
  readinessLabel?: string | null;    // the refined chip label (LEGS LOADED / EFFORT UP / FATIGUED / …)
  fitnessDirection?: string | null;
  isTaperOrPeak?: boolean;
  acwr?: number | null;              // D-268 Phase 5: gate the "headroom" observation on load being genuinely light
}): string | null {
  const { loadLabel, readinessState, readinessLabel, isTaperOrPeak, acwr } = opts;
  // In taper/peak, a "build more" reading is by-design low volume — don't lead the glance with it.
  const effLoad = isTaperOrPeak && loadLabel === 'build more' ? 'balanced' : loadLabel;
  const state = stateSlot(effLoad, readinessState, readinessLabel);
  const obs = state ? observationSlot(effLoad, readinessState, acwr) : null;

  // The headline reflects THE WEEK only (Michael 2026-07-04) — one clock. Fitness is a different clock
  // and is NOT rolled up here: it's handed to the individual discipline rows under PERFORMANCE, each
  // on its own 6–8wk window. No aggregate fitness verdict anywhere (it would have to lie about the clock).
  return state ? `This week: ${obs ? `${state} — ${obs}` : state}.` : null;
}
