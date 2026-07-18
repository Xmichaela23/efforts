# STATE — the week-execution read (voice audit + build contract)

**2026-07-14.** Why the State run row has resisted days of fixing, and the redesign of the
"how your sessions went · last 7 days" section that resolves it. Sign-off: Michael, in-conversation.

---

## The finding — five voices, no composer

The run is described by FIVE phrases, on two clocks, from four producers. Nothing composes them,
so every past fix added a caveat instead of removing a voice.

| # | On screen | Clock | Born at | Measures |
|---|---|---|---|---|
| 1 | "Easy · HR drifted — build aerobic base" | 7d | `run.ts:123 decouplingLabel` → coach `run_session_types_7d` → `StateTab.tsx:1223` | decoupling, per-session |
| 2 | "aerobic base needs work" | weeks | `run.ts:116 frielBand` → `StatePerformanceSection.tsx:181` | decoupling **level** |
| 3 | "↑ improving 6%" | weeks | `run.ts:231 classifyTrend` → same row | decoupling **trend** |
| 4 | "Efficiency ↓ sliding" | weeks | `run.ts:86 efficiency_index` → same row | a different metric |
| 5 | "You said 3 a week…" | — | `posture.ts` → `StatePerformanceSection.tsx:319` | plan vs behaviour |

- Voices **1 and 2 are the same fact** (decoupling) shown twice. Continuity work (coach v78/v80/v86)
  made them AGREE in wording — which turned divergence into duplication. The same criticism now
  appears twice and reads as deliberate nagging.
- Voices **2 and 3** ("needs work" + "improving") are level vs direction of one number; stacked as
  words they read as the app arguing with itself. The fitness-band redesign (`SPEC-state-fitness-band.md`)
  turns level into a dot position and trend into an arrow so they can't contradict.

## The decision — what "how your sessions went" is FOR (REVISED 2026-07-14, Michael)

Neither a "what you did" list (redundant with Home) nor a per-discipline fitness verdict (punitive +
the duplicate above). The section = **neutral per-discipline counts + at most ONE accent sentence.**
There is **no** "% of planned load" headline (removed from scope). This section lives in **State only** —
no composed week read appears on Home beyond the existing calendar and LOAD/ACWR row.

### Section shape
- **Counts row** — per-discipline planned-vs-done from `adherence.ts`, counts only ("Run 1/3 ·
  Strength 2/4 · Swim 2/2"). No color grading, no judgment words.
- **Accent** — zero or one sentence below the counts. **Never two.** It states the single most
  consequential thing this week's data can defend.
- **Interval/execution %** stays available in **session detail** — it does **not** render in this section.

### The composer — ONE owner, five candidates
A single composer fn in the coach owns the accent. Producers submit candidates; the composer SELECTS
one or none. Producers never write to the section directly. All sources already exist — no new engines:
- **(a)** `off-plan-banner.ts` — swap/substitution reads, load language.
- **(b)** trend + posture (the lever) — decline/improvement reads, ONLY when plan gap and trend slope
  point the same direction.
- **(c)** `load-status-reconcile.ts` — over/under-reach reads, ONLY when load state and readiness agree.
- **(d)** logged sets vs strength protocol targets — RIR/execution reads.
- **(e)** adherence counts — only for the nothing-loaded case the banner already handles.

### Selection rules
- Priority when multiple qualify: **(1) safety-adjacent over-reach → (2) trend+plan-gap lever →
  (3) RIR/protocol deviation → (4) substitution → (5) positive maintenance.** Highest qualifying wins;
  the rest are dropped, not queued.
- Each candidate carries a qualification threshold from its own producer. **None qualify → accent EMPTY.
  Silence is valid and expected — never backfill a generic positive sentence.**
- Positive accents are **first-class** (e.g. aerobic base held via swim substitution), not fallbacks.

### Voice rules (enforced in copy, not left to producers)
- Conditional, never prophetic: "may start declining," never "will decline."
- **Load vs adaptation boundary — HELD (reaffirmed 2026-07-18, D-297).** The accent speaks in **load /
  compliance only** — what you did vs your target, and what carried the load. It does **NOT** state an
  adaptation consequence ("X may fade"), for three reasons, all decided with Michael:
  1. **Apps agree with it.** TrainingPeaks/Garmin/Intervals show weekly *compliance* + a *measured* status;
     none push a weekly prose prediction that fitness will fade. That is coach behaviour, not app behaviour.
  2. **It risks nagging** — a consequence that repeats every under-target week is the scold we removed.
  3. **The measured "has" is owned by the FITNESS card**; the *specificity science* (what erodes and why)
     lives in the **glass-box science section** (`docs/SCIENCE-upkeep-maintenance.md`), on tap — never a
     weekly line. So one claim, one home: compliance on the accent, measured trend on the card, science on tap.
  - The **upkeep candidate** requires a numeric target and fires only after a **pattern** (≥2 weeks under);
    it states the compliance fact ("at ~4 of your 18-mile upkeep") + a load-carried clause. Nothing predictive.
- **Traceable:** tapping an accent opens its source measurement (logged sets, trend window, load
  numbers). A candidate that cannot cite its measurement is not a valid candidate.
- No scores, no streaks, no percentages in the accent.

## What exists (STARVED, not absent) vs what is new
- **Reuse:** `offPlanAdherenceBanner` (computed at `coach/index.ts:5122`, today feeds only the week
  HEADLINE); `computeAdherenceState` (neutral counts, `adherence.ts`); `load-status-reconcile.ts`
  (over-reach substrate); the posture/lever logic; strength logged-sets vs protocol.
- **New:** the composer + selection; neutral counts on the payload; a new `weekly_state_v1` field for
  the composed section. **No new thresholds, models, or transfer coefficients.** If a candidate needs a
  number that does not exist, it does not qualify — report the gap, do not invent it.

## Build order (contract order)
1. **6a/8a Parity check (DB-first)** — every fitness verdict in `cardioExecRow` must be shown rendering
   in PERFORMANCE for the same data, verified in the DB. Any section-only verdict → STOP, restore, report.
2. **Composer** in the coach (candidates → select one/none) + neutral counts on the payload.
3. **Client cut** — remove at the coach producer; delete the dead `cardioExecRow` render path in
   StateTab; confirm no other surface consumes the removed payload.
4. **Client render** — counts + ≤1 accent, tap-through to source; three states must render without breaks.
5. **Verify DB-first, report a–f explicitly** — parity list; composer unit checks (multi→1 correct
   priority, none→empty, positive-sole→selects); coach payload (counts + ≤1 accent, no legacy verdicts);
   StateTab three states; one real accent from this week's data with its tap-through source. No success
   claim on anything not actually verified.

## What must NOT change
- PERFORMANCE section, posture line, lever logic — untouched.
- Home — untouched; no forward-looking or composed week line added.
- No new thresholds/models/coefficients (see above).
