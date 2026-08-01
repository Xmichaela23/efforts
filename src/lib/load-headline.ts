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

// ⛔ THE "OBSERVATION" SLOT IS DELETED (D-350, 2026-08-01). IT COULD NOT FIRE.
//
// It carried the app's last training THRESHOLD living in a display file — `acwr < 1.0` deciding
// "you have headroom" (D-268 Phase 5). That threshold was the thing Stage 2 set out to move to the
// server. It turned out there was nothing live to move:
//
//   · The slot only ever spoke on `loadLabel === 'balanced'`.
//   · Since 2026-07-20 the headline RETURNS EARLY unless the load is 'a bit high' / 'pull back' /
//     'back off' / 'rest now' (the silent-unless-it-deviates rule). 'balanced' is not one of them.
//   · So every path that reached the slot had already excluded the only label it answers to.
//
// Verified by exhaustion, not by reading: 8,316 combinations of label × readiness × refined chip
// label × acwr × taper flag emitted the string ZERO times.
//
// ⚠️ IF A "HEADROOM" READING IS EVER WANTED, IT IS A NEW FEATURE AND IT BELONGS ON THE SERVER —
// beside the reconciler that already owns the load verdict (D-260, sole verdict authority). Do not
// reinstate it here: a second place deciding what the load means is the fracture the reconciler exists
// to prevent, and reviving this branch would put a threshold back in a file that only formats.

export function buildLoadHeadline(opts: {
  loadLabel: string;                 // reconciled load_status verdict word
  readinessState?: string | null;
  readinessLabel?: string | null;    // the refined chip label (LEGS LOADED / EFFORT UP / FATIGUED / …)
  fitnessDirection?: string | null;
  isTaperOrPeak?: boolean;
  /**
   * ⚠️ ACCEPTED AND UNUSED (D-350). Its only consumer was the deleted observation slot, which could
   * not fire. Kept on the signature so the two call sites (StateTab, the State-screen printer) do
   * not need editing in lockstep with this file — and so the next session sees, in one place, that
   * the load RATIO does not enter this composer. The load VERDICT does, already reconciled.
   */
  acwr?: number | null;
}): string | null {
  const { loadLabel, readinessState, readinessLabel, isTaperOrPeak } = opts;
  // In taper/peak, a "build more" reading is by-design low volume — don't lead the glance with it.
  const effLoad = isTaperOrPeak && loadLabel === 'build more' ? 'balanced' : loadLabel;

  // ── SILENT UNLESS THE LOAD GENUINELY DEVIATES (Michael, 2026-07-20). ────────────────────────────────
  // On a plan the load is SUPPOSED to vary week to week (a build week is heavy, a deload light), so
  // stamping a verdict on a normal week ("Balanced load") reads as evaluation of something the plan
  // chose — and it duplicated the LOAD row's own verdict rendered right below it, on the WRONG clock
  // (the line said "This week" while the read is rolling-7d). The honest lead says NOTHING when the
  // load is being managed fine (under / on_target / productive AND body not flagged) — the position
  // line ("Week 3 of 12") and the LOAD card carry it. It speaks ONLY when the load genuinely deviates:
  //   · reconciled 'elevated'/'high' — carrying more than the body is absorbing.
  // 'productive' is a real elevation the body IS absorbing — that is the plan working, not a deviation,
  // so it stays silent too. Readiness is NOT keyed here on purpose: it already has its own home (the
  // BODY "how hard it feels" row + the readiness chip, Michael 2026-07-04), and the headline is
  // load-only. This preserves the one real load signal — genuine over-load — without editorialising
  // expected variation.
  const notableLoad = effLoad === 'a bit high' || effLoad === 'pull back' || effLoad === 'back off' || effLoad === 'rest now';
  if (!notableLoad) return null;

  const state = stateSlot(effLoad, readinessState, readinessLabel);

  // The headline reflects THE WEEK only (Michael 2026-07-04) — one clock. Fitness is a different clock
  // and is NOT rolled up here: it's handed to the individual discipline rows under PERFORMANCE, each
  // on its own 6–8wk window. No aggregate fitness verdict anywhere (it would have to lie about the clock).
  // No "This week:" frame — the read is rolling-7d, not the calendar week (Michael's rolling-week catch).
  return state ? `${state}.` : null;
}
