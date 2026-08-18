# HANDOFF — stop slotting numbers into the old shape (2026-08-17)

**Michael's words, and they are the whole reason this file exists:**

> "We are building a completely different plan on an engine that has an old model on it. The work
> was done sloppy, without consideration of the overall plan — thinking we could just slug in some
> different numbers. This is very wrong."

⛔ **READ THAT BEFORE YOU TOUCH ANY CODE.** The failure here is not a bug list. It is that a new
training model was fitted onto an engine built for a different one, one number at a time, and each
individual change looked reasonable in isolation.

---

## 1. What the engine still believes (the old model)

The Strong Focus composer and the week solver were built on **separation**: keep heavy lifting away
from hard cardio, spend the mechanical budget carefully, protect the legs by putting the hard run on
a hill so it costs less. Everything downstream inherits that premise — the terrain menu, the
session copy, the scoring, the placement.

## 2. What the plan is now (the new model)

**Consolidation.** Hard cardio and heavy lower-body lifting deliberately SHARE a day. Squat pairs
with the hard run, deadlift with the hard ride, ~6–8h apart. Zero heavy lower body on a long day.
48h clearance after any long effort, so the day after the weekend is bench or rest.

These two models disagree at the root, not at the margins. ⛔ **Do not reconcile them by editing
constants.** That is the exact move that produced this handoff.

## 3. Where that shows up already

- **Hills.** The VO2 run is a hill session *because* the old model needed the run to be cheap on the
  legs. Under the new model the run sits next to the squat anyway. Michael has said **"hills are
  dead."** The four terrain variants (`hillSession`, `shortHillSession`, `treadmillSession`,
  `flatSession`, default `hill_3min`) in `shared/strength-system/strength-primary-plan.ts` are
  built on the dead premise. ⚠️ **The scope of that call was NOT settled** — get it from Michael.
- **The terrain menu** in `src/components/NonRaceBuilder.tsx` is the **OLD BUILDER**. Do not reason
  about the new plan from that screen.
- **Placement.** Michael asked whether re-pinning the hard run from Friday to Thursday gives a clean
  week. **Tested: no.** It moves the squat to Friday, 24h from Saturday's long ride, which breaches
  his own 48h rule. The real constraint is the back-to-back weekend (long ride Sat + long run Sun),
  which consumes Sat, Sun *and* Mon and leaves too little room for three 48h-spaced lifts plus two
  pairings. **No pin position fixes that.** It needs a decision about the week's shape.
- ⛔ **No database write was made.** Michael's standing rule — never hand-write his data, it goes
  through the app — was flagged and not overridden.

## 4. State of the tree

**Uncommitted, three files — the consolidation law as a caller-scoped policy:**
`_shared/week-solver.ts` · `shared/strength-system/strength-primary-plan.ts` ·
`shared/strength-system/two-hard-days.test.ts`

The design there is worth keeping even if the rest is rethought: consolidation is an **opt-in
option on `SolverInput`**, defaulting to today's behaviour, so the triathlon engine
(`_shared/week-optimizer.ts`) is untouched. ⚠️ An earlier attempt edited the SHARED constraint
table instead and broke 8 triathlon tests; it was reverted. **Do not put this law in
`_shared/schedule-session-constraints.ts`.**

**On main:** `97511104` terrain copy · `85780bc8` threshold doctrine · `6a3a4cc6` heavy legs keep
their 48h. **Nothing is deployed.** All server-side; the phone is unaffected.

## 5. The two documents that are current

- **`docs/DOCTRINE-threshold-run.md`** — committed, and it is Michael's, not derived. The threshold
  session, the 12-week map, effort-outranks-pace. Its §3 lists four specifics where the shipped code
  differs. **Trust this over the code.**
- **`docs/WORKORDER-strong-focus-concurrent-2026-08-16.md`** — ⚠️ it HAS been touched (`c0f64aea`
  folded the built-plan defects in as §8). It is the accumulated instruction set, and it was written
  under the old model. **Read it as history, not as a build order, until Michael re-blesses it.**

## 6. The next session's job

⛔ **Not code.** Establish with Michael what the plan actually is end to end under the new model —
the week's shape, what the hard sessions are, what the long days cost — and only then decide what in
the engine survives. The open items above (hills, the weekend shape) are questions for him, not
tasks to execute.
