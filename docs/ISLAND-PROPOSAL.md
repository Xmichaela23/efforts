# ISLAND-PROPOSAL — a consolidated strength-periodization authority

**Status: PROPOSAL — approve before cutting. No code written. Non-binding.**

Companion to `docs/STRENGTH-SCOUT-REPORT.md` (the map). That report shows strength periodization is
smeared across four engines and ~60 string-match sites, with `'Taper'` load-bearing at 30+ of them and
the run-retest rename defeating all of them at once. This proposes where the authority should live and
what each engine queries from it. It builds nothing.

References: D-210 (per-discipline periodization; spine stays descriptive), D-213 (one engine, two
output shapes), D-214 (non-race routing predicate), D-215 (strength contract: named-protocol vocabulary,
posture→protocol, 5×5 standalone default), Q-087/Q-088/Q-089 (the live strength bugs/gaps).

---

## 1. What the authority OWNS

A single module — call it the **Strength Periodization Authority (SPA)** — owns every decision that is
currently a phase-name string-match or a per-generator constant. Concretely, it absorbs:

1. **Frequency** — sessions/week as a function of `(phase, posture, sport-context, sensitivity, cap)`.
   Moves in: `week-builder.ts:1829-1839` (recovery→0, the `strength_sessions_cap` clamp),
   `hybrid-athlete.ts:127-145` (`getStrengthFrequencyForPhase`), `performance-neural.ts:636-653`
   (the per-phase frequency `switch`), the `2|3` typing at `protocols/types.ts:88`.

2. **Back-off (per-phase load curve)** — sets/reps/%1RM/RIR by phase. Moves in:
   `hybrid-athlete.ts:147-167` (`getStrengthIntensity`), the per-phase `switch`/`if` blocks in every
   protocol module (`upper-priority-hybrid.ts:129-616`, `foundation-durability.ts:117-559`,
   `minimum-dose.ts:99-348`, `performance-neural.ts:232-475`). The protocols stay as *exercise
   templates*; the SPA decides the *load scalar* applied to them.

3. **Taper** — the sensitivity-gated step-down (frequency 0/1/2 + load scale). Moves in:
   `strength-overlay.ts:129-237` (`getTaperStrengthParams`, `applyTaperLoadScale`,
   `filterToTaperFrequency`) and its two trigger gates (`:274`, `:586`). The LOGIC is good; what moves
   is ownership of the *trigger* — from a `phase.name === 'Taper'` string-match to an SPA query keyed on
   a typed phase.

4. **Retest** — the terminal that is currently a string rename in the run path. The SPA owns the answer
   to "what does strength do in a retest terminal?" as a **property of the phase**, not a name the
   consumer has to recognize. (Combined-plan already half-does this via `session-factory.ts:2238`
   `retest→'Taper'`; the SPA makes it the single source.)

5. **Step-down / recovery-week** — strength behavior on recovery weeks and rebuild weeks. Moves in:
   `week-builder.ts:1829`, the `isRecovery` branches inside every protocol, `science.ts:365-369`.

The SPA does NOT own exercise selection (that stays in the protocol modules), day placement (that stays
in `week-optimizer.ts` / `simplePlacementPolicy`), or endurance volume (that stays in `science.ts` and
the run generators). It owns only the **periodization scalars and the frequency/terminal decisions**.

---

## 2. The query interface (conceptual)

Each engine stops *computing* strength periodization locally and instead *asks* the SPA. One primary query:

```
strengthPlanForWeek({
  phase:        StrengthPhaseKind,   // a TYPED enum, not a string name
  weekInPhase:  number,
  isRecovery:   boolean,
  posture:      'maintain' | 'develop' | 'out',   // D-210 per-discipline primitive
  sportContext: 'run' | 'tri' | 'bike' | 'standalone',
  sensitivity:  { taper?: number; interferenceRisk?: number },
  frequencyCap: number | null,       // athlete/UI cap; null = authority default
}) -> {
  sessionsThisWeek: number,          // the frequency decision (owns the cap)
  loadScale:        number,          // 0–1 applied to protocol set volume
  intensityHold:    boolean,         // taper rule: keep %1RM, cut volume
  terminalShape:    'none' | 'taper' | 'retest',
  notes:            string[],
}
```

The critical change is the **`phase` argument is a typed enum, not a display string**. A consumer never
again branches on `=== 'Taper'`; it passes the typed phase and the SPA returns scalars. The
`'Retest'`/`'retest'`/`'Taper'` string trichotomy collapses into one enum the SPA interprets centrally.

Per-engine usage:

- **Run engine** (`strength-overlay.ts`, `hybrid-athlete.ts`): replace the `phase.name === 'Taper'`
  gates and `getStrength*ForPhase` tables with a `strengthPlanForWeek` call; pass the typed phase
  derived once from `terminalShape`. The `applyRetestTail` rename stops mattering because nothing
  downstream reads the *name*.
- **Tri engine** (`generate-triathlon-plan`, `triathlon*.ts`): same call, `sportContext:'tri'`.
- **Combined engine** (`generate-combined-plan`): `week-builder.ts` calls the SPA instead of computing
  `strFreq` inline; `session-factory.ts:toStrengthPhase` stops being the de-facto authority and becomes
  a thin name-for-display mapper.
- **Future bike engine**: `sportContext:'bike'` — gets periodization for free, never re-implements it.

---

## 3. What specifically moves OUT

**Out of `strength-overlay.ts`:**
- `:274-284` and `:586-593` — the two `isTaperPhase = phase.name === 'Taper'` trigger gates. Replaced by
  a typed-phase SPA call. The overlay keeps its job of *placing* and *weight-resolving* sessions
  (`resolveExerciseWeights`, `simplePlacementPolicy`) but stops deciding taper periodization by string.
- `:129-237` — `getTaperStrengthParams`/`applyTaperLoadScale`/`filterToTaperFrequency` physically
  relocate into the SPA (they are the taper periodization logic).

**Out of the phase-name-sniffing sites mapped in the report:**
- `hybrid-athlete.ts:127-167` — the entire local strength frequency+intensity table deletes; calls SPA.
- `performance-neural.ts:636-653` — the per-phase frequency `switch` deletes; SPA owns frequency.
- `week-builder.ts:1829-1839` — `if (phase==='recovery') strFreq=0` and the `strength_sessions_cap`
  clamp move into the SPA's frequency decision (the cap becomes an SPA input, see §4).
- The protocol modules' `isTaper`/per-phase `switch` blocks stop deciding *load scale*; they keep
  deciding *which exercises* and receive `loadScale` from the SPA. (Lower-risk first step: leave the
  protocols' build-phase curves alone and only centralize taper/retest/frequency.)

**Stays put (explicitly NOT moved):**
- Exercise rosters and set/rep templates inside the protocols (`five-by-five.ts`, etc.) — D-215 vocabulary.
- Day placement (`week-optimizer.ts`, `simplePlacementPolicy`).
- `science.ts` endurance volume floors — except they gain a `retest` case (see report D2/D3); that is a
  bug-fix, not a move.

---

## 4. Q-088 FOLD-IN — the frequency cap becomes a PROPERTY the authority owns

**Q-088 (read in full, `OPEN-QUESTIONS.md:1150-1155`):** the strength system was built for
hybrid/concurrent athletes (strength as a 2-session slot around endurance).
`ProtocolContext.strengthFrequency` is typed `2 | 3` (`protocols/types.ts:88`); the run path allows
`0|2|3` with no 4; at freq 3 the extra day is *another lower* (`upper-priority-hybrid.ts:93`), never a
4-day split; `five_by_five` deliberately caps at 2 (`five-by-five.ts:88-92`). A pure standalone strength
block therefore maxes at 2 — below the 3–4 a textbook block wants. Q-088 says raising the cap "touches
every strength cell" and edits `strength-overlay.ts`.

**The fold-in:** in the SPA model, the frequency cap stops being a `2|3` type literal scattered across
modules and an inline clamp in the week-builder, and becomes **one owned property** — the
`frequencyCap` input + the SPA's internal `sessionsThisWeek` decision (§2). Raising it from 2–3 to 4+ is
then a change in ONE place (the SPA's frequency policy), not an edit threaded through
`protocols/types.ts:88`, `upper-priority-hybrid.ts:93`, `five-by-five.ts:88`,
`performance-neural.ts:636-653`, and `week-builder.ts:1829-1839`. Q-088 stops being an
"every-cell" edit and becomes a policy parameter. This is exactly the consolidation D-213/D-210 favor:
periodization is owned once, queried everywhere.

### Does the (not-yet-made) retest step-down fix collide with the Q-088 frequency-cap change in `strength-overlay.ts`?

**Concrete answer: NO — in `strength-overlay.ts` they touch different code paths today.** Evidence:

- The **retest step-down fix** must change the TRIGGER GATES: `strength-overlay.ts:274`
  (`const isTaperPhase = phase.name === 'Taper'`) and `strength-overlay.ts:586`
  (`const isTaperPhase = phase.name === 'Taper'`). These are the lines that fail to recognize the
  renamed `'Retest'`. The fix touches the *taper-trigger* path (`getTaperStrengthParams` and its
  two call sites).
- The **Q-088 frequency-cap change** touches the FREQUENCY TYPING/PLUMBING:
  `strength-overlay.ts:122-123` (`type StrengthFrequency = 2 | 3`), the `frequency` parameter threaded
  through `overlayStrength` (`:246`), `computeStrengthForPlanWeek` (`:550`), and `placementFrequency`
  (`:627-629`). These are the *frequency* path.
- The two paths intersect at exactly ONE point: `strength-overlay.ts:627-629`, where
  `placementFrequency = taperParams ? taperParams.effectiveFrequency : args.frequency`. The taper
  branch (`effectiveFrequency`, capped at `0|1|2` by `getTaperStrengthParams`) and the non-taper branch
  (`args.frequency`, the Q-088 cap) are **mutually exclusive arms of the same ternary**. The retest fix
  changes *when* the taper arm is selected (recognize retest); Q-088 changes *the value* of the
  non-taper arm (allow 4). They modify opposite arms of one expression — adjacent, not colliding.

**Verdict:** different code paths, one adjacency point with no shared mutation. They can be cut
independently. If both land, sequence the retest-trigger fix first (it is a correctness bug; see also
Q-089 which is upstream of the run-strength duplication and should precede both per its own note).

---

## 5. Migration sketch (phases) — PROPOSAL, approve before cutting

Non-binding. Each phase is independently shippable and independently revertible.

- **Phase 0 — typed phase, no behavior change.** Introduce a `StrengthPhaseKind` enum and a translation
  layer at each engine boundary so the SPA can be called with a typed value. No periodization logic
  moves yet. (De-risks the rename problem: `'Retest'` becomes a typed terminal, not a string.)
- **Phase 1 — retest correctness fix (smallest, highest-value).** Make the run path's retest terminal
  query the SPA (or, as an interim, teach the existing `:274`/`:586` gates + `sustainable.ts:183,329`
  to recognize the typed retest terminal). Closes the live symptom. Independent of Q-088.
- **Phase 2 — fold taper logic into the SPA.** Relocate `getTaperStrengthParams` et al. from
  `strength-overlay.ts` into the SPA; overlay calls `strengthPlanForWeek`. Combined-plan's
  `session-factory.ts:2238` `retest→'Taper'` becomes a call to the same SPA.
- **Phase 3 — frequency consolidation (Q-088).** Move the `2|3` type, the `week-builder.ts:1829-1839`
  clamp, `hybrid-athlete.ts:127-145`, and `performance-neural.ts:636-653` into the SPA's
  `sessionsThisWeek` policy. Now raising the cap to 4+ is a one-line policy change. Gated on the
  concurrent-matrix audit Q-088 asks for.
- **Phase 4 — per-phase load curves (optional, largest).** Move the protocols' per-phase load scalars
  into the SPA, leaving the protocols as pure exercise templates. Highest blast radius; do last or skip.

**Prerequisite ordering note:** Q-089 (`runStrength` emits `sessions[0]` twice) is upstream of any
run-path strength consolidation — fixing the SPA frequency story on top of a path that never emits
`sessions[1]` would mask, not fix, the duplication. Land Q-089 before Phase 3.

---

*Proposal only. Nothing here is approved or implemented. — companion map: `docs/STRENGTH-SCOUT-REPORT.md`.*
</content>
