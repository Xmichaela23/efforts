# Stage 4 — one shape for what the athlete asked for: THE RIDE

**2026-08-21 · one terminal session · rides only.**
Work order: `WORKORDER-finish-the-swaps-2026-08-20.md` stage 4. Evidence: `REPORT-session-structure-and-clumping-2026-08-20.md` §2.0, §2.5, §2.6.

## STATE — say it three ways, and all three are NO

| | |
|---|---|
| **pushed** | **NO.** Nothing committed. The tree is dirty and that is intentional. |
| **deployed** | **NO.** No edge function deployed, no client on Netlify, no iOS sync. |
| **verified on a device** | **NO.** No plan built on a phone. Everything below is code, tests and the sweep. |

**Sweep: 0 of the 61 moved.** Byte-identical at every step, which is what this stage was supposed to be.
`~/.deno/bin/deno run --no-check --allow-read --allow-write scripts/dump-plans.ts` → 61 built, 0 failed, `budget-equals-built: 0 violations`.

## What shipped into the tree

**New: `supabase/functions/_shared/athlete-weekly-intent.ts`.** The ride ask, owned in one place.
Reachable from all three deploy boundaries and from the client (the client already imports
`_shared` — `vite.config.ts` aliases `@shared`, `tsconfig` maps it).

It owns three things:

1. **The 1–4 range and the defaults.** `RIDE_DAYS_CHOICES`, `RIDE_DAYS_DEFAULT`, `RIDE_HOURS_DEFAULT`.
2. **Provenance.** Every resolved number carries `'answered' | 'default'`. A default and an answer
   used to arrive as the same `2`, which is why three independent fallback clauses were undetectable.
3. **The hard-day subtraction.** `daysAfterHard` / `easyWanted`, computed once.

`resolveRideAsk()` answers the half that is knowable at a wire door; `seatRideIntent()` adds the hard
rides; `buildRideIntent()` is both. `easySessionsWanted()` is the sport-agnostic subtraction — the
run inherits it in the next session for free.

**Deleted, in the same session, per the work order's rule.** Nine names in
`strength-primary-plan.ts` are gone as independent derivations:

`hasBike` · `bikeSelected` · `longRidePin` · `askedRideDays` · `rideHasLongDay` · `ridesWanted` ·
`wantDays` · `rideHours` · `weeklyRideHours`

Every ride site now reads `rideIntent.*`. Grep confirms the old names survive only inside comments
that explain what they were.

**Wired at every hop of the chain:**

| hop | file | what changed |
|---|---|---|
| wizard | `src/components/NonRaceBuilder.tsx` | the volume card's chips render `RIDE_DAYS_CHOICES` |
| wizard model | `src/lib/suggest-hard-days.ts` | `easyCount` calls `easySessionsWanted` instead of its own copy |
| router | `create-goal-and-materialize-plan/index.ts` | `gsRideDays` / `gsRideHours` call the normalisers |
| generator | `generate-strength-plan/index.ts` | the clamp calls the normalisers, **and announces a default when one fires** |
| composer | `shared/strength-system/strength-primary-plan.ts` | `rideIntent`, built once |

## ⛔ ONE BEHAVIOUR CHANGE, AND IT NEEDS TO BE SAID OUT LOUD

The stage was told to change nothing. It changes one thing, and consolidating is what exposed it.

**The ride-count range was written out SIX times, not the two the report counted, and THREE of the
six were still capped at 3.**

| # | site | ceiling before today |
|---|---|---|
| 1 | `NonRaceBuilder` volume card (the live Strong Focus screen) | 4 |
| 2 | `NonRaceBuilder` schedule-step count row | **3** |
| 3 | `NonRaceBuilder` standalone bike step (non-strength flows) | **3** |
| 4 | `create-goal-and-materialize-plan` validator | 4 |
| 5 | `generate-strength-plan` clamp | **3** |
| 6 | the composer's `askedRideDays` | 4 |

Site 5 is the one that mattered and it is now the shared normaliser: **an athlete who tapped `4`
had it rewritten to `3` one hop past the validator that had just accepted it, silently.** The
ENGINE-STATE note for 2026-08-19 says the ceiling was raised "in TWO places in the composer" and at
`create-goal`; this was the fourth site nobody knew about. Fixing it is finishing a change already
ruled on, not making a new one — but it is still a behaviour change and the sweep cannot see it
(the sweep calls the composer directly and bypasses the door).

**⚠️ Sites 2 and 3 are UI and I did NOT touch them.** Adding a chip to a screen is a screen
decision. Both are flagged in place with a comment saying they read `RIDE_DAYS_CHOICES` and nothing
else changes if you want the 4. **Michael's call.** Site 2 is on the strength path's schedule step,
so an athlete can pick 4 on the volume card and then quietly rewrite it to 3 on a later screen —
that is the more interesting half.

## Findings — things measured, not fixed

**a. `suggest-hard-days.ts` was a sixth statement of the composer's easy-session subtraction.**
Client-side, feeding the wizard's suggestion and the health badge — the two surfaces the athlete
sees before the plan exists. It agreed with the composer on every input (`max(0, a-h-L)` and
`max(0, max(0,a-h) - (L && a>h))` are the same function). It agreed by luck. Now routed through
`easySessionsWanted`. ⚠️ That file's own header forbids exactly what it was doing: *"a lightweight
good-enough placer here would be a second opinion about the athlete's week."*

**b. The fill loop's cap is dead code.** `if (rideDays.length >= rideIntent.daysAfterHard) break;`
can never bind: `solvedRideDays` holds at most `easyWanted` entries and `rideDays` starts with at
most the long ride, so the list cannot exceed `daysAfterHard` before the loop ends. Mutated it to
`askedDays` and the whole 583-test suite stayed green. **Left in place** — it is the guard the
2026-08-19 overshoot fix added, and it costs nothing. Recorded so nobody writes a test for it and
believes the test means something.

**c. `hoursOrDefault`'s `RIDE_HOURS_DEFAULT = 2` is the last unowned number on the ride chain.**
It is now named and stamped `'default'`, and `generate-strength-plan` logs when it fires. It is
still a number nobody chose.

**d. The `run_days` gate at `NonRaceBuilder:1265` is still keyed on `posture.strength === 'develop'`**
(report §2.5a) — untouched, run-side, stage 4's next session.

## How this was verified

- **Mutation-tested, every new test.** 11 mutations against the module + 5 against the composer's
  wiring. Two mutations survived and BOTH were equivalent-mutants, not weak tests — recorded in the
  code rather than papered over:
  - the round-then-clamp ORDER carries nothing (both bounds are integers, so the two orders agree on
    every input). ⛔ The comment that stood there claimed it was load-bearing. It is corrected — a
    false "do not touch this" sends the next reader looking for the real constraint somewhere else.
  - the fill-loop cap, above.
- **Two composer mutations went green against the whole 581-test suite before I wrote tests for
  them**, which is how both of this file's new composer tests came to exist:
  - gating the ride pass on `selected` instead of `declared` re-opens the 2026-07-29 double-emitter
    defect (6h asked → 7.5h built) — **581 of 581 passed with that bug in place**;
  - four ride days reaching the calendar was asserted nowhere.
  ⚠️ And the first version of that test passed when the athlete got NO rides at all. Caught by
  mutating the fallback emitter; the test now asserts the count before it asserts the shape.
- **A byte-identical table.** `athlete-weekly-intent.test.ts` keeps the composer's nine original
  expressions verbatim and runs both against 432 shapes (18 bike shapes × 3 hour values × 2 primary
  sports × 4 hard-ride counts). The count is asserted so the table cannot silently empty — two of
  the three test files written on 2026-08-19 passed with their code deleted.

## Test state

| suite | result |
|---|---|
| `supabase/functions/shared/strength-system/` | **583 passed, 0 failed** (581 before + 2 new) |
| `supabase/functions/_shared/` | **1844 passed, 1 failed** |
| `src/` under deno | **712 passed, 3 failed** |
| `npx vite build` | clean |
| `tsc --noEmit -p tsconfig.app.json` | **312 errors — identical count to a clean tree** |
| `npx eslint` on both touched client files | 1 error 1 warning, **both pre-existing** |

**The 4 failures are all pre-existing and all verified by stashing:**
- `_shared/anchor-resolver-lint.test.ts` — `lthr::src/components/TrainingBaselines.tsx` reads an
  anchor raw and is not on the ledger. Named in the ENGINE-STATE banner as not-yours.
- `src/lib/club-anchor.test.ts` ×1, `src/lib/non-race-goal-seeds.test.ts` ×2.

⚠️ **The client suite does not run in this environment and that is not new.** `npx vitest run` fails
on all 363 files — vitest's ESM loader rejects the `https:` deno-std imports those files use, and
there is no `test` script or vitest config in the repo. `deno test src/` runs 715 of them; the rest
(anything importing `@shared/*`, which deno cannot resolve — no import map) runs under neither.
`src/lib/suggest-hard-days.ts` is in that gap, so **my change to it is verified by type-check parity,
a clean bundle, and the algebra above — not by a test.** Flagging it rather than claiming coverage.

## For whoever takes the run (the next stage-4 session)

The run chain is the same shape and the report already maps it (§2.0, nine names). Three things
learned here that will save the session:

1. **Build the intent AFTER the hard-day count is known.** `seatRideIntent` needs it, and the
   object's whole contract is that the subtraction has already happened by the time anyone reads it.
   Nothing above that point in the composer needs a ride fact — checked, not assumed; check the same
   for the run.
2. **`easySessionsWanted` already exists and is sport-agnostic.** The run half of
   `suggest-hard-days.easyCount` already calls it.
3. **`AthleteWeeklyIntent` has no `run` or `swim` key yet, deliberately.** A field with no reader is
   the starved-input pattern the ENGINE-STATE banner opens with. Add the key when there is a reader.

⛔ **`targetWeeklyMiles` / `enduranceFrequency` / `longRunDay` are still four loose top-level
scalars** and the run's `Math.max(1, Math.min(4, …))` clamp is still written out in the composer.
That is the run session's job, not a gap in this one.
