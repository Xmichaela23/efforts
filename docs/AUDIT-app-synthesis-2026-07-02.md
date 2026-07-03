# State of the App — synthesis of the 2026-07-02 audit stack

The top of the audit stack. Read this first; the four detail audits below are the evidence.
- `SCREEN-INVENTORY.md` — every screen that exists.
- `SCREEN-CONNECTIVITY.md` — what each screen is wired to (the wiring map).
- `AUDIT-state-screen-2026-07-02.md` — the State screen, deep (the "score-that-lies" catalog).
- `AUDIT-spine-conformance-2026-07-02.md` — "spine is truth, arc is voice" measured app-wide.

---

## 0. Where this app came from (context, not criticism)

Efforts grew by **stream of consciousness** — one feature opening the need for the next — built by someone who a year ago had never made an app, pasting code between Claude and VS Code. That's how it *should* have grown at that stage, and it's why the app is unusually ambitious for a solo build. It also means the app **sits on a layer of "that's the wrong way to do it"**: forks that were never retired, engines stacked on engines, specs that shipped but whose headers still say "not built." None of that is failure — it's the sediment of fast, organic learning. The audits exist to separate that sediment from the **deliberate architecture that's been forming underneath it**.

## 1. The bet the app is now making

Somewhere in mid-2025→2026 the app stopped being a pile of features and started making **one deliberate bet: total athlete continuity through a single source of truth.** The idea (ratified in D-149/150/151, D-213): the athlete should experience **one continuous story about themselves** — the plan they build, the session they do, the analysis of that session, and how it rolls up to their macro fitness should all speak the *same language about the same person*. No screen should tell a different story than the screen next to it.

The mechanism is **the spine**: a deterministic athlete-state layer (`athlete_snapshot` / `state_trends_v1`), computed once, that every surface *reads* rather than *re-derives*. "Spine = what's true; Arc/coach = how it's said." Plus the smart-server contracts that carry it — `get-week` (calendar), `session_detail_v1` (workout detail) — where the server decides and the client renders verbatim.

**This bet is the right one, and it's real in the code.** The question the audits answer is: *how far has it been realized?*

## 2. How far the bet got — the conformance scorecard

| Layer | Reads the one truth? |
|---|---|
| Calendar / scheduling (`get-week`) | ✅ single authority |
| Workout detail (`session_detail_v1`) | ✅ one contract, rendered verbatim |
| The spine machinery (compute-snapshot, `assembleStateTrends`, `reconcile`) | ✅ well-built |
| The "voice" contracts (Arc, session_detail) reading the spine | ✅ faithful |
| Plan **prescription** (materialize anchors loads on the typed baseline) | ✅ correct |
| **The coach engine** (the shared brain behind State + Context) | ❌ **~6%** — 1 of ~17 verdicts reads the spine |
| **Capacity truth** ("how strong/fast am I") | ❌ **forked** — prescribe-off-150, judge-off-125 |

**One sentence:** *the voice reads the spine; the brain that fills the voice mostly doesn't, and there is no canonical answer to how strong or fast the athlete is.* The continuity is **architecturally real but ~half-wired.**

## 3. Where the athlete's continuity HOLDS vs BREAKS

This is the bet, measured in lived experience:

**Continuity holds:**
- **Building → calendar.** The plan you build materializes into the calendar through one authority; the client never re-derives it.
- **Session → detail.** A completed workout produces one pre-formatted analysis contract every screen renders identically.
- **Endurance micro → macro.** Run/cycling: the per-session analysis, the per-discipline trend verdict, and the Arc's fitness read all descend from the same cached spine (`fitness_direction`). This axis is *finished* — it's the proof the bet works when completed.

**Continuity breaks:**
- **The strength seam.** The plan *loads* you off your typed 1RM (150) while the coach *grades* you off the learned aggregate (125) and the State screen shows a third answer ("needs data"). Same lift, same day, three truths. This is the flagship break — and it's the *strength* version of the endurance continuity that already works.
- **The State screen.** Three uncoordinated engines, a section literally marked "not yet shipped" rendered live, contradictory rows. It's where the coach/capacity forks become visible to the athlete.
- **Readiness.** Soreness/sleep were collected and dropped until this session; now wired as advisory signal (Q-049 Phase 1a), still visible-only.

## 4. What works / what doesn't (condensed)

**Works, trust it:** the calendar/scheduling layer; the `session_detail_v1` contract; the endurance (run/cycling) analysis pipeline; the spine machinery itself; plan prescription; and — as of today — the strength logger + baseline write-back (Q-097).

**Doesn't, in priority:** (1) the coach re-forks ~94% of its verdicts, even shadowing spine columns it fetches; (2) no canonical capacity truth (prescribe-vs-judge split); (3) the State screen as the visible symptom; (4) accreted dead code never retired (orphaned tabs — one still cited by a live spec — stale spec headers, a vestigial second trend vocabulary, a typo'd deployed edge fn, a hardcoded anon key).

## 5. Why it drifted, and the antidote

**Accretion.** Each capability landed as a new engine *on top of* the last; the old one was orphaned, not retired. The app even named the antidote — **D-213: "extend the engine, retire the forks, never widen them"** — and D-151 *did* it correctly for one axis (fitness direction: "the old derivation was removed, not kept alongside — two coexisting verdicts is exactly how contradictions survived"). The whole fix is: **apply that same discipline to the axes still forked.** The pattern to finish the bet already exists in the codebase, done once, provably.

## 6. The roadmap to finish the bet (from the conformance audit)

1. **One canonical capacity resolver** — typed baseline is the anchor; learned feeds trend + the reconcile *suggestion*; raw is never truth. *Both* prescribe (materialize) and judge (coach) call it. Collapses the 150-vs-125 break app-wide.
2. **Move the coach's readiness + strength verdicts onto the spine** — start with "read the columns you already fetch, delete the parallel derivation." The two most athlete-visible misrepresentations.
3. **Finish Q-097's write-back** so learned↔typed converge (in progress — today's down-write is part of it).
4. Collapse the remaining coach verdicts + the vestigial trend vocabulary onto the spine; add a shared capacity/pace type (kills the sec/km-vs-sec/mi and key-alias footguns).
5. Retire the dead layers (orphaned tabs — extract `block_verdict` first — stale specs, the typo'd fn).

## 7. Honest scope of this synthesis

Strong and load-bearing on: **the continuity architecture and data-truth integrity** — how the app decides what's true about the athlete, and where that truth forks. That's the map that matters, because the spine gap is the *root* producing the surface bugs.

Thinner on: **feature-level correctness** of subsystems not deep-audited this pass — the four plan generators' internals, the scheduling/week-optimizer, swim (older `AUDIT-swim`), and the coach's LLM narrative / claim-grounding. Those are the next audits if we want the same rigor there. The architectural picture does **not** assert those are correct — only that they weren't the subject of this stack.

## 8. Today, in this frame

The whole day converged on this one theme without planning to. Closing **Q-097** (the strength baseline write-back), the down-write prompt, tests-as-a-class, wiring the dropped readiness sliders — each is a piece of **making the athlete's truth single and honest.** Q-097 specifically is *step 3* of the roadmap above (learned↔typed convergence). The audit didn't discover a new direction; it discovered that the day's work, the app's own decisions (D-149/151/213), and the athlete-continuity bet are all **the same project** — and gave the map to finish it.

**Bottom line:** the app is a genuinely ambitious, coherent bet — athlete continuity through a single spine — grown out of organic mess, correct in its architecture, and **about half-migrated onto its own good idea.** The work ahead isn't invention; it's *finishing the migration the app already started and proved on one axis.*
