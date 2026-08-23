# Stage 3 — the accessory rework

**2026-08-22 · finished from a prior session that died on connection errors before writing tests.**
Work order: `WORKORDER-the-standing-plan-2026-08-22.md` stage 3.
Gate shape: `DECISIONS-2026-08-22-standing-plan-pivot.md` §6.
Source: pp.84, 86 and 147, read off the page images — not from the transcription.

## STATE — three ways

| | |
|---|---|
| **pushed** | **NO.** One new untracked directory. Stages 1 and 2 were committed by another session (`59db4c5d`, `ec102db8`); this is not. |
| **deployed** | **NO.** |
| **verified on a device** | **NO.** Nothing in stages 1–4 is athlete-visible. |

**What IS proven:** 24 tests green, 41 of 41 mutations killed by their intended test, and the module
builds and runs from a client entry point through this repo's own Vite.

⚠️ **Four files in the tree are not mine.** `generate-{combined,run,strength,triathlon}-plan/index.ts`
each gained a "CLOSED FOR REPAIRS" banner from another session. Left untouched.

---

## What the prior session left, and what this one did

**Left:** `supabase/functions/_shared/accessory-dosing/` — `muscles.ts`, `dose.ts`, `ledger.ts`,
`index.ts`. Sourced, page-cited, and **entirely untested**.

**Done here:** the two attribution bugs fixed, one real blocker fixed, the gate written to the
pivot's shape, and 41 mutations run against it. The module was not rebuilt.

---

## ⛔ THE TWO ATTRIBUTION BUGS — both were ORDERING, not vocabulary

### `leg curl` resolved to **biceps**

The biceps rule read:

```
/\b(curl|curls)\b(?!.*\bleg\b)(?!.*\bnordic\b)(?!.*\bham\b)/
```

⛔ **Those lookaheads could never fire.** A lookahead only scans FORWARD from the match, and in
`leg curl` the word `leg` sits BEHIND it. **A guard that cannot see the thing it guards against is
worse than no guard, because it reads as covered.**

⚠️ **Wider than reported:** `leg curls`, `nordic hamstring curl`, `nordic curl` and `band leg curl`
were all landing on biceps too — four movements of hamstring volume counted against an arm.

**Fixed by moving the hamstring-curl family ABOVE the biceps rule.** The dead lookaheads are gone;
order does the work.

### `side plank with hip dip` resolved to **chest**

The pressing rule's `dip` matched before anything looked for `plank`. ⚠️ Chest is one of the four
areas an athlete can pick, so this inflated a number they were watching.

**Fixed by moving the trunk rule to the top of the table.** `dips` and `tricep dips` carry no trunk
word and still reach their own rules — asserted, because that is what a naive fix breaks.

### The control

`back extension` → hamstrings, before and after. Pinned, along with `glute ham raise`,
`reverse hyperextension`, `hip thrust` → glutes and `romanian deadlift` → hamstrings.

---

## ⛔ ONE REAL BLOCKER FIXED: calves could not be reached

`fillMuscleFloor` routed its movement search through stage 2's `resolveSlot`, which treats an
**untagged** movement as *unknown rather than free*. That is right when the grid is choosing a
slot's headline movement. It is wrong when the alternative is the muscle getting **nothing** —
measured, it left CALVES unfillable for a commercial-gym athlete, because every calf movement in the
catalogue is untagged and the grid declined all nine.

**The search now gates on `canPerform`** — the app's one owner of *"can this athlete do this
movement"* — and ranks with `equipmentFitRank`, the same owner the grid uses. Nothing is forked.

⛔ **AND THE PRIOR SESSION'S GEAR-TAG THEORY IS WITHDRAWN.** Its notes proposed tagging ~25
movements as stage 3 work. That was wrong: untagged movements pass every real equipment gate.
**No gear was tagged this session, and none needed to be.**

---

## The three things the stage was for

### 1. Set-based dosing

Every number read off the page, not the transcription. ⚠️ `SOURCE-viada-hybrid-athlete.md`'s own
provenance table marks Part B *"one generation removed — re-shoot pp.69-125 before these numbers
become constants."* They are constants now, so the pages were opened. **Every B2 figure survived.**

| | value | page |
|---|---|---|
| effective reps per set | 4, **at 1 RIR** | p086 |
| accessory reps | 8–10 | p086 |
| accessory RIR | 1–2, never to failure | p086 |
| sets per muscle per week, solid | 8–12 | p086 |
| borders overreaching | 18–20 | p086 |
| effective reps per muscle per week | 32–48 recommended, 70–80 max | p086 |
| work sets per session, recovers | 6–8 | p086 |
| costly | 14+ | p086 |

⛔ **HIS FORMULA, VERBATIM** (p147): *"Effective hypertrophy reps per muscle group: Determined by the
number of effective reps per set multiplied by the number of sets per muscle."* A test asserts his
own arithmetic still ties the two weekly bands: 8–12 × 4 = 32–48, 18–20 × 4 ≈ 70–80.

⚠️ **THE 4-EFFECTIVE-REPS FIGURE IS QUOTED AT 1 RIR** and is not a constant of nature. A set left
further from failure buys fewer; he gives no second figure, so nothing here scales it and the module
says so.

⚠️ **AND "IN OTHER MODALITIES" IS THE HALF THAT MATTERS FOR THIS APP.** p086: a 14+ set session
*"may diminish performance in other modalities significantly for twenty-four hours and still notably
for up to seventy-two."* The number is not about whether the lifter can lift again — it is about
whether tomorrow's run is still there.

### 2. A floor per muscle group

⛔ **THE FLOOR IS ONE SLOT — THREE SETS — AND NO NEW SCALAR WAS INVENTED.** He never states a floor.
He states a *solid range* of 8–12 sets per muscle per week, and **that range and his own session
ceiling are mutually unreachable for this athlete:** ten muscle groups at eight sets is eighty work
sets a week, which needs ten lifting sessions at the 6–8 he says a session should stay under. The
program has four.

So the floor is structural — *at least one accessory slot per muscle group* — and the slot's size is
his HYP low end (p218), taken through stage 2's `setsFor` because *"sets should always remain on the
lower end when starting a program"* is his instruction.

⛔ **AND THE LEDGER SAYS SO OUT LOUD.** Most muscles land on the `light` verdict — below his solid
range — and it reports that rather than presenting the floor as the recommendation. A test asserts
the ledger never claims his solid range it cannot deliver. **p147's own endurance-athlete example is
10–15 effective reps per lower-body muscle group — two to four sets — and he criticises it.** That
is the honest position, and the module states it instead of hiding it.

**Ten groups: nine are his** (p222's single-joint list: chest / deltoid / lat / hamstring / quad /
calf / biceps / triceps, plus core from p223). ⚠️ **`glutes` is the tenth and it is OURS** — he files
hip thrusts and kickbacks under his hamstring heading. It is a grouping decision, not a number, and
the name comes from the app's existing `readiness-thresholds.ts` vocabulary rather than being coined.

⚠️ **THE PICKER SURVIVES WHOLE.** A test walks every focus subset at both session counts and asserts
every set the week arrived with is still there afterwards, unaltered, and that the input array was
not mutated. A second asserts **the floor never fills an area the athlete picked** — the floor is
beneath the picker, not a top-up of it.

### 3. Core split off from single-leg

Wendler bundles them (`single_leg_core` in `assistance-catalog.ts`), so abs compete with Bulgarian
split squats for one budget and lose. Viada gives core its own heading (p223). Here they are separate
groups: a single-leg movement counts to quadriceps, and core has its own line. Asserted both ways —
a week of nothing but split squats registers core as below the floor, and the floor fills it with
**core** work rather than more legs.

---

## ⛔ WHAT WAS NOT TOUCHED, AND WHY

**`src/lib/assistance-menu.ts` is unchanged.** It is Wendler's, it serves Strong Focus, its band and
axis were deliberately chosen and are correct, and rule 0 keeps Strong Focus live until stage 6.
Changing its unit would change what a live plan builds. This is a new layer beside it — row three of
the work order's layer table — and the two meet at stage 6.

A test asserts the dosing module never reads or redefines `ASSISTANCE_BAND_BY_HARD_DAYS`,
`assistanceTotalReps` or `TIER_BAND`.

⛔ **And the 25–50 band was not re-raised.** Nothing in this stage touches it.

---

## The gate

**24 tests. `deno test --no-check --allow-read supabase/functions/_shared/accessory-dosing/`**

⛔ **THE SWEEP RUNS ON 3- AND 4-SESSION WEEKS ONLY**, per pivot §6 — the program owns the
lifting-day count. **192 weeks**: 2 session counts × 16 focus subsets × 6 equipment kits. Every one
asserts **no muscle below its floor** and **no session at or past 14 work sets**.

⚠️ **THE 2-SESSION PATH IS AN INTERNAL GUARD AND IS TESTED AS ONE.** It is never a product surface
and no athlete is ever offered a muscle-skipping choice. What the test proves is that it **degrades
with a stated reason**: the ceiling is never broken to make the floor fit, what could not be fitted
is named with an actionable reason, and the filler's report matches the ledger's.

Also asserted: warm-ups never counted (p147, *"even warm-ups at high percent"*) · DE and SKILL
reported **both ways** because he never classifies them · secondary engagement listed and never
counted (p084 — he says the attribution is imprecise and gives no fraction) · an unattributable
movement reported rather than dropped · muscle names crosswalk to real `readiness-thresholds.ts`
keys · client-reachability lint.

### ⚠️ Mutation testing: 41 mutations, 41 killed by their intended test

**Eight did not land first time. Four were real test weaknesses:**

| what survived | why | fix |
|---|---|---|
| the floor piles onto the **busiest** session | nothing asserted the distribution — a 3-/4-day week fits either way | a lopsided two-session probe asserts the first slot lands on the lightest |
| the candidate search **stops gating on equipment** | most kits in the sweep can reach most movements | a bands-only / bar-only / dumbbell-only athlete asserts every added movement passes `canPerform` |
| the module **grows its own copy of the set band** | the no-fork lint checked that `setsFor` was *mentioned*, and `void setsFor` mentions it | the lint now requires `setsFor(` — **a mention is not a use** |
| the floor **ignores the costly line** | on 3–4 sessions there is room either way, so the ceiling never binds | correctly owned by the two-session guard; expectation fixed, not the test |

**Two were bad mutations** (one replaced only the first line of a multi-line constant; one targeted a
line that did not exist). **One was an equivalent mutant, recorded rather than chased:** restoring the
dead lookahead guard to the biceps rule changes nothing, because the hamstring rule now runs first —
which is exactly why the guard was deleted rather than kept.

⚠️ **AND ONE MASKED MUTANT WORTH KNOWING ABOUT.** Deleting `back extension` from the hamstring rule
left it *still* resolving to hamstrings, because `BY_PATTERN`'s `hip_dominant` fallback catches it.
That is defence in depth working, not a weak test — the mutation was swapped for one that is not
masked (attributing it to the quads).

Harness at `<scratchpad>/mutate3.py`; not in the repo, restores the tree on every exit path.

---

## ⛔ CLIENT-REACHABLE — proven, not assumed

Built and RUN through this repo's own Vite: a client entry importing `@shared/accessory-dosing`,
**11 modules transformed, 127 kB, executed** — 10 muscle groups, `leg curl` → hamstrings,
`side plank with hip dip` → core, 10 floor slots added, nothing below floor, busiest session 10 sets.
Cross-checked with a plain esbuild bundle. ⚠️ The probe config was temporary and removed; **this is a
thing that was RUN, not a thing that is watched.**

`deno check` on the module: **0 errors**.

**All three stages together: 77 tests, 0 failed.**

---

## What stage 4 should know

- ⚠️ **Nothing calls this yet.** Stage 4's composer is its first consumer, for both stage 2 and this.
- ⛔ **The composer must hand the ledger the WHOLE session, strength sets included.** p147 puts
  high-intensity work sets from strength work in the same bucket as accessory sets. A ledger fed only
  accessories will under-report every session.
- ⚠️ **The floor needs somewhere to put things.** On a week whose lifting days are already near the
  ceiling, the floor correctly refuses rather than crossing it, and reports what it could not fit. A
  plyometric or light day in the session list gives it room.
- ⚠️ **`fillMuscleFloor` returns new sessions and does not mutate its input** — pinned by test.
- **Gaps still open and still labelled at the site:** rest between sets (not stated anywhere but PAP's
  6–8 minutes), and when *"1 to 3 sets"* becomes 2 or 3 (his condition is in words, with no rule to
  evaluate it). Pivot §8 adds plyo dose and ME-pair rotation cadence — **decide each AT the point
  stage 4 needs it, never silently.**
