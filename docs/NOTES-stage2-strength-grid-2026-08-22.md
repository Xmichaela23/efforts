# Stage 2 — the strength grid

**2026-08-22 · the second stage of the Standing Plan build.**
Work order: `WORKORDER-the-standing-plan-2026-08-22.md` stage 2. Design: `DECISIONS-2026-08-21-standing-plan.md`.
Source: `SOURCE-viada-hybrid-athlete.md` Parts A1 and A2, read against the page images at
`~/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/` — pp.218–223, 226, 227 and 274 opened.

## STATE — three ways

| | |
|---|---|
| **pushed** | **NO.** Nothing committed. One new untracked directory; **no existing file was modified.** |
| **deployed** | **NO.** |
| **verified on a device** | **NO.** Nothing in stages 1–4 is athlete-visible; the first stage an athlete could notice is 5. |

**What IS proven:** 25 tests green, 36 of 36 mutations killed by their intended test, and the module
builds and runs from a client entry point through this repo's own Vite.

---

## ⛔ THE TRACE, FIRST — what already existed, stated before anything was built

The work order required this in writing. Five findings, and two of them changed the design.

### 1. `intent-taxonomy.ts` exists, and it is a DIFFERENT AXIS

`StrengthIntent` there names a whole **session** — `LOWER_NEURAL`, `UPPER_STRENGTH`,
`FULLBODY_MAINTENANCE`, ten values. Viada's ME/DE/SKILL/HYP name how **one movement's sets are
loaded**. A `LOWER_NEURAL` day *contains* an ME slot and several HYP slots.

⛔ **They compose; they do not compete, and ME/DE/SKILL/HYP were NOT added to that union.** Doing so
would put a set-loading scheme beside a session type in one enum, and `isLowerIntent()` would start
answering nonsense for half of it. Its header sentence — *"protocols output intents, placement
policies assign intents to days"* — stays exactly true and describes the other axis.

### 2. `MovementPattern` exists, and his four patterns are a coarsening of it

`src/lib/exercise-config.ts:45` (Q-181): nine values, 316 catalogue entries. Viada's axis is
push-upper / pull-upper / hinge-lower / press-lower — four values, derivable. **No new vocabulary.**

### 3. Two more accessors already sit over that vocabulary, and the grid is the fourth

| accessor | question |
|---|---|
| `MovementPattern` (Q-181) | which movement slot is this? |
| `MovementGroup` (D-315) | upper day or lower day? |
| `MovementFamily` (Q-212) | do these two collide on one day? |
| **the grid (this stage)** | **how braced, how compound, in Viada's four-tier scheme?** |

Same data, four questions, four accessors side by side — the shape `CLAUDE.md` prescribes and
`exercise-config.ts` already demonstrates twice.

### 4. The equipment gate exists and is already client-reachable

`canPerform` / `equipmentFitRank` / `gearRoutesFor` in `src/lib/strength-gear.ts`. **No new gate was
built.** `getInSlotAlternatives` in `exercise-alternatives.ts` is the app's in-slot substitution
engine — a different question again (same pattern, same tier) and left alone.

### 5. ⛔ THE REAL GAP IS NOT THE GRID — IT IS THE DATA UNDERNEATH IT

Two measurements taken before building, and both shaped what got built:

- **`gearRoutesFor` only tags ~60 of the catalogue's names.** Everything else returns "needs
  nothing" *and prints a warning saying so*: **"treated as needing nothing. Add it in
  src/lib/strength-gear.ts before anything gates on equipment."** Measured: **162 of the 210
  movements the grid classifies carry no gear tag** — including `leg press`, `leg extension`,
  `chest fly`, `rear delt fly` and `back extension`. Under that default a bodyweight-only athlete is
  handed a leg press.
- **`EXERCISE_CONFIG` has no exact key for the machine half of Viada's world** — hack squat, pec
  deck, skull crusher, preacher/spider/drag curl, cable kickback, seated cable row, hip adduction.
  They fuzzy-match and **silently borrow another movement's ratio**: "Hack Squat" borrows `squat` at
  ratio 1.0 and would be prescribed at full back-squat load. That is D-322's disease.

**Neither is this stage's to fix** (see §"What is NOT done"), but both are why the grid reads the
catalogue the way it does.

---

## What shipped

`supabase/functions/_shared/strength-grid/` — four source files plus the gate. **Nothing outside the
new directory was touched.**

| file | what |
|---|---|
| `intents.ts` | his four intents, both vocabularies, page-cited; the two gaps he leaves, named |
| `taxonomy.ts` | `viadaCategoryOf` / `viadaPatternOf` / `isAsymmetrical` — the classifier, over our catalogue |
| `grid.ts` | `resolveSlot` — prescription + movements + the substitution ladder |
| `strength-grid.test.ts` | the gate |

**Coverage of the grid, measured:** 210 of 316 catalogue keys classified (plurals collapsed;
plyometrics and pattern-less oddments excluded — see below).

| | push upper | pull upper | hinge lower | press lower |
|---|---|---|---|---|
| **primary** | 11 | 4 | 3 | 4 |
| **secondary** | 26 | 16 | 22 | 17 |
| **braced** | **0** | 8 | 4 | 1 |
| **focused** | 15 | 13 | 4 | 7 |

Plus **carry 7** and **core 48**, neither split by pattern — his key does not split them either.

---

## ⛔ GENERATE, NOT TRANSCRIBE — where the line fell this time

Stage 1's line was "his rules, our content". Stage 2's is sharper, because a grid needs movements.

**In the shipped code:** his four intents with his numbers (a prescription, like Wendler's
percentages in `wendler-531.ts`), his **category definitions** — *"Primary: compound, barbell or bar,
cardinal plane"* — as a **classifier**, and his four patterns.

**Not in the shipped code:** his movement lists. The classifier runs over **our own 316-entry
catalogue**, which grew independently around Wendler's world.

⚠️ **HIS LISTS APPEAR EXACTLY ONCE IN THE REPO'S CODE, IN THE TEST FILE, AS THE CLASSIFIER'S GROUND
TRUTH.** 37 of his worked examples paired with the heading he files each under. A classifier is
verified against the author's own examples or it is verified against nothing — and that is a
different act from shipping the list. **Flagging it for Michael's ruling rather than assuming it:**
if that is still too close, the ground-truth table can move into `docs/` beside the existing full
transcription and be loaded by the test, at the cost of a file read.

---

## ⛔ THE FOUR RULINGS THE WORK ORDER NAMED, AND HOW EACH LANDED

### "Asymmetrical is a MODIFIER, not a category"

`ViadaCategory` has six members and none of them is asymmetrical. The whole implementation of the
ruling is `isAsymmetrical(name)` reading `ExerciseConfig.isUnilateral` — **a flag the app already
kept.** Asking for it narrows *within* a category; it never switches to a sixth list.

### "Olympic lifting is out of scope"

HEAVY/REP/SKILL/GROOVE do not exist anywhere in the module, and a test asserts that each of those
three names is **refused** as an intent rather than silently coerced.

### "Carries have their own intent meanings"

Two vocabularies share four names. `prescribe()` **requires the family** and will not answer without
it — a carry's ME has no reps and no percentage, it has a weight description and an RPE of 9.
⚠️ And his own distinction inverts between two of them: SKILL carries accumulate **no** fatigue,
HYP carries accumulate it **on purpose**. Both are asserted; collapsing them loses the point.

### "Never invent a number he did not write"

Two gaps, both named in the code and neither filled:

- **Rest between sets (gap #10)** — not stated. The only rest figure in the book is the 6–8 minutes
  the PAP protocol calls for, which belongs to that protocol. **No prescription has a `restSeconds`
  field**, and a test asserts it never grows one.
- **When "1 to 3 sets" becomes 2 or 3 (gap #11)** — his condition is *"progressing well with recovery
  to spare"*, which no engine can evaluate. `setsFor()` **always returns the low end** unless a caller
  explicitly passes a position. Every intent starts at the bottom of his band.

⚠️ **And one number he gives that HYP does not have: a percentage.** p218 gives HYP reps, tempo and
RIR and no load. `pctOf1RM` is `null` and a test asserts it stays null.

⚠️ **ME's RIR is `null`, not `0`.** p218 says "no RIR target"; p219 defines 0 RIR as a specific and
different thing (the last rep completes, very slowly). Those are opposite instructions.

---

## ⚠️ READ OFF THE PAGE AND MISSING FROM THE TRANSCRIPTION

p218's guideline box carries **tempo clauses** that `SOURCE-viada-hybrid-athlete.md` does not:

- **SKILL** — *"controlled eccentric, fast concentric"*
- **HYP** — *"controlled eccentric, controlled concentric"*
- **DE** — *"maximum velocity"*

All three are now in `intents.ts` and pinned by the gate. The corpus file should be updated; it is
otherwise accurate on Part A against every page opened.

---

## The classifier, and the two places order is the whole algorithm

1. ⛔ **SINGLE-JOINT IS TESTED BEFORE EXTERNAL BRACING, because that is how HE resolves his own
   overlap.** A pec deck is a machine *and* single-joint, and he files it under FOCUSED. A machine
   chest press is a machine and multi-joint, and lands in BRACED. Reversing the two tests moves half
   his focused list into braced — mutation-tested.
2. ⛔ **The `armIsolation` flag is right about arms and silent about joint count.** It is TRUE for a
   close-grip bench press and a diamond push-up, correctly — both are triceps movements — and
   **neither is single-joint**. Viada files close-grip bench under SECONDARY PUSH UPPER by name. This
   is `exercise-config.ts`'s own *"same data, two questions"* warning arriving one axis over.

**Plyometrics are excluded from the grid entirely.** p227 is its own section with its own rules —
drills done separately, ample rest, stop when the movement is optimised for the day, *"fatigue, poor
form and imprecise movements are absolute no-no's"*. None of that is a set-and-rep prescription, and
running a box jump through the ME/DE/SKILL/HYP table would produce one. The All Rounder's day 3 is a
**plyo warm-up**, not a lifting slot, and it belongs to stage 4.

⚠️ **One deliberate divergence from his list, for an engineering reason.** He files **barbell row**
under PRIMARY PULL. We classify it SECONDARY, because our PRIMARY test is his *"contest- or
assessment-specific"* half and **the app holds no barbell-row 1RM** — an ME slot on it would have no
percentage to be 90–100% of. Front squat and pull-up ARE named into primary for the opposite reason:
both are assessment lifts here (the pull-up has `performance_numbers.pullupMaxReps`).

---

## The substitution ladder — and which rung is his

**⛔ NO SLOT MAY RESOLVE TO NOTHING** is the gate, and the ladder is how it is met.

| rung | what | whose |
|---|---|---|
| 0 | the category and pattern asked for, gated on equipment | — |
| 1 | **braced ↔ secondary, keeping the single-limb quality** | ⛔ **HIS**, p275 |
| 1b | drop the asymmetrical modifier, keep the category | ours |
| 2+ | walk the bracing ladder at the same pattern | ours, inferred |
| last | offer it ungated rather than return nothing | ours |

⛔ **p275 IS ABOUT EXACTLY THE ASYMMETRICAL CASE AND FIRES FIRST:** *"You can rotate the braced
asymmetrical movements with secondary asymmetrical."* A braced-asymmetrical slot the athlete cannot
reach becomes a **secondary asymmetrical** one — a split squat instead of a single-leg press —
keeping the quality that is the point of the slot. Only when that fails is the modifier dropped.

⚠️ **EVERY OTHER RUNG IS OURS AND IS LABELLED `ours` ON THE SLOT.** Generalising his rotation to
whole categories, and extending the ladder to primary and focused, is an inference from his category
definitions. A test asserts that a cross-category substitution which is *not* his rotation never
carries his citation.

⚠️ **CARRY AND CORE HAVE NO LADDER.** A carry cannot be stood in for by a press; a core movement is
not a pressing slot.

⛔ **AND NO ALL ROUNDER SLOT REACHES THE LAST RUNG.** The gate asserts `ungated !== true` for all 20
slot shapes at all 13 equipment subsets — a slot in the programme's own week reaching the last resort
would mean the athlete is shown something their kit cannot set up.

---

## ⛔ THE FINDING STAGE 3 SHOULD TAKE: a fully-equipped athlete is substituted on 4 of 12 cells

Measured, `intent: HYP`, one slot per category × pattern:

| kit | slots substituted |
|---|---|
| commercial gym | **4 of 12** |
| barbell + rack + bench | 5 of 12 |
| dumbbells only | 7 of 12 |
| bodyweight | 7 of 12 |

A home athlete being substituted is the ladder working. **A commercial-gym member being substituted
is the data gap.** The four:

| cell | falls back to | why |
|---|---|---|
| `braced / push_upper` | secondary — DB bench press | ⛔ **the cell is EMPTY.** No machine chest press, Smith press or dip machine exists in our catalogue |
| `braced / press_lower` | secondary — split squat | `leg press` exists but carries **no gear tag** |
| `focused / press_lower` | secondary — split squat | `leg extension`, `seated calf raise` — **no gear tag** |
| `focused / pull_upper` | braced — lat pulldown | `rear delt fly`, `cable curl` — **no gear tag** |

**Three of the four are gear tags, not missing movements.** The fix is ~25 entries in
`ASSISTANCE_GEAR`, which is exactly what that file's own warning asks for.

⚠️ **AND THE CODEBASE ALREADY HAS A POLICY FOR THE MACHINE HALF, which should be followed rather than
overridden.** `leg curl` is tagged `ALWAYS` with a written reason: *"A leg-curl machine is required
and NOT commonly declarable… Gating it here would have deleted the movement instead of swapping it."*
So: **gate on declarable gear; leave machine-only movements ungated and let substitution handle
them.** Do not add a `machine` gear key — it would be undeclarable, and the header says a key that
gates must be commonly declarable.

⛔ **THIS STAGE DID NOT TOUCH `strength-gear.ts`.** Rule 1 is one stage at a time, the gate is met
without it, and half-editing a file five surfaces read is how a stage leaks. The grid instead makes a
**local reading**: an untagged movement is *unknown*, not *free*, for an athlete who **has** declared
equipment — so the ladder substitutes instead of handing out a leg press. An athlete who declared
nothing is in the §0h case and is offered everything, unchanged.

---

## The gate

**25 tests. `deno test --no-check --allow-read supabase/functions/_shared/strength-grid/`**

- **the gate proper** — 20 All Rounder slot shapes × 13 equipment subsets = 260 resolutions, each
  asserted to produce a real movement (one that resolves **exactly** in the catalogue, per D-322), a
  real prescription, and never the ungated last resort
- **wider than the All Rounder** — every category × pattern × intent × 13 kits, 360 slots, for the
  pivots and stage 4's taper column
- **honesty** — a substitution is always declared, an exact fill never claims one, his rotation is
  preferred to our inference and cited as his, ours is cited as ours
- **his numbers** — all four intents written out as literals, sets starting low, carries as a second
  vocabulary, both gaps named and unfilled
- **the classifier** — 37 of his worked examples, the single-joint/bracing order, the arm-flag trap,
  asymmetrical as a modifier, no Olympic vocabulary, no plyometrics
- **the index** — exact catalogue resolution, no duplicate offers, no bare stubs in the option list
- **equipment** — §0h honoured, declared kits gated, options ordered by fit, untagged not treated as free
- **no fork** — no second catalogue, no second gear table, no reach into the session-intent axis

### ⚠️ Mutation testing: 36 mutations, 36 killed by their intended test

**Seven initially survived or were caught by the wrong test. All seven were real weaknesses:**

| what survived | why | fix |
|---|---|---|
| the substitution ladder deleted | slots still filled — via the *ungated* rung | assert no All Rounder slot resolves ungated |
| the bare catalogue stubs offered | the test only checked `chosen`, not the option list | assert stubs absent from `options` |
| the equipment fit ranking dropped | every option still present, just badly ordered | assert `options` is sorted by fit rank |
| a walking lunge becomes a carry | **the exclusion's subject was wrong** — `\bwalk\b` never matched "walking lunge"; its real subject is `lateral band walk` | corrected the comment, added the band walk to ground truth |
| the primary test's dumbbell exclusion removed | **dead code** — measured: no catalogue movement has `ratio === 1` *and* a `primaryRef` *and* a dumbbell name | **deleted the guard.** An unread branch is the disease this codebase keeps removing |
| an unasked athlete gated anyway | the §0h short-circuit had no direct assertion | assert an undeclared athlete's option count equals the whole cell |
| the shared gate stopped being read | the harness named the wrong test; it *was* killed | corrected the expectation |

⚠️ **Two lessons carry forward, and both are stage 1's arriving again:** a test that only inspects
the *chosen* result cannot see the *list* being wrong, and **a guard with no subject in the data
cannot be tested through the data** — check whether it guards anything before keeping it.

Harness at `<scratchpad>/mutate2.py`; not in the repo, restores the tree on every exit path.

---

## ⛔ CLIENT-REACHABLE — proven, not assumed

**Built and RUN through this repo's own Vite.** A client entry importing
`@shared/strength-grid/index.ts`, vite 5.4.21, real aliases: **7 modules transformed, 114 kB,
executed successfully** — 210 movements classified, **360 slots filled across 5 equipment subsets on
the client**, and a dumbbell athlete's ME secondary push resolving to `1 × 1–5 @ 90–100%`, RIR `null`.
Cross-checked with a plain esbuild bundle. ⚠️ The probe config was temporary and removed; **this is a
thing that was RUN, not a thing that is watched.**

A source lint holds what a lint can hold — no `Deno.`, no `https:` imports, no supabase client, no
`process.env`, every import relative — and says it cannot prove the bundler part.

⚠️ **`deno check` on this module is clean: 0 errors.** (Stage 1's inherits one pre-existing error
through `planning-context.ts`; the grid does not import that file.)

---

## What is NOT done, and what stage 3 should know

- ⚠️ **Nothing calls this yet.** It is an accessor with no consumer, deliberately. Stage 4's composer
  is its first caller.
- ⛔ **The four substitution cells above are stage 3's to close** — ~25 gear tags following the
  codebase's own declarable-gear policy, plus the `braced / push_upper` cell, which needs movements
  the catalogue does not have. ⚠️ **Adding those movements needs RATIOS, and a ratio is a number** —
  `exercise-config.ts` sources its ratios to NSCA/Schoenfeld/Helms. Do not invent one.
- ⚠️ **`barbell row` is classified secondary where Viada files it primary**, for a stated engineering
  reason. If the app ever holds a barbell-row 1RM, revisit.
- ⚠️ **Ground truth in the test file** — flagged above for Michael's ruling.
- **Gap #9 (warm-up sets for lifting) is untouched** and is Wendler's 40/50/60, already in
  `wendler-531.ts`. It belongs to stage 4, not here.
- **No thirteenth gap was found** in Part A. The two Part-A gaps (#10 rest, #11 the set band) are
  named in the code at the site.
