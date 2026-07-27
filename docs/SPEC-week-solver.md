# SPEC — The Week Solver

**Status:** spec. Not built. Replaces the placement half of `place-week.ts`, which filters and takes
the first legal answer.
**Author:** Michael + Claude, 2026-07-27.
**Companion:** `DOCTRINE-aerobic-maintenance.md` (what the block is for), `D-325` (costs and ceilings).

> **Michael, 2026-07-27:** *"LLMs cannot problem-solve a training schedule and ever get it right, so
> let's lock in the rules."* This document is that lock. Nothing in the engine may place a session by
> reasoning about it; it places sessions by running the rules below.

---

## 0a. ⛔ THE FIVE HARD CONSTRAINTS, AND THE WHOLE SEARCH

**Amended 2026-07-27.** These are not scored. They are not negotiable. Nothing relaxes them.

| # | constraint | why it is hard |
|---|---|---|
| 1 | **Long run day** | User-picked anchor. **Immovable** |
| 2 | **Long ride day** | User-picked anchor. **Immovable** |
| 3 | **Hard day** | User-picked anchor. **Immovable** |
| 4 | **Four lifting days** | ⛔ **A FIXED COUNT. Lift frequency is not negotiable.** Wendler publishes 2- and 3-day templates; this block is the four-day arc and does not fall back to them |
| 5 | *(the clearance law)* | `_shared/schedule-session-constraints.ts` — the only one that may be downgraded to a penalty, and only per §5.2 |

### The entire search, in four lines

```
anchors PIN their days
four lifts place into the days that remain
easy aerobic STACKS onto lift days — lift first, one bucket, ordered
that is all
```

⛔ **KEEP THE RULE SET AND THE SCORE CARD SHORT ENOUGH TO READ ON ONE SCREEN.** If either grows past
that, the model is being over-elaborated and the extra is almost certainly a preference wearing a
constraint's clothes.

### 0a.2 ⛔ A SESSION IS PRICED ON THE LOAD IT CHOOSES TO ADD, NOT ON ITS NAME

**Added 2026-07-27, generalised from the hill descent.** When a session has a discretionary component
— something the engine decides rather than something the session inherently is — **the clearance is
the one that governs the load being added, not the one attached to the session's label.**

**The worked case.** A hill session is quality running and takes `quality_run`'s 24h. Jogging the
descents adds eccentric work, and eccentric work takes 48h. So a hill session *with jogged descents*
is priced at 48h. Asking the 24h cell — because the session is called a hard run — returned "jog" for
every week including one sitting at the exact floor with no buffer. **The session does not get to
claim the cheaper clearance for a load it is choosing to add.**

⚠️ **THIS IS NOT ABOUT DESCENTS.** It reaches every discretionary addition the expanders make:
surges inside an easy run, strides on the end of one, an extended cool-down, a jogged versus walked
recovery anywhere. Each adds load the session's name does not account for. Either price it, or do not
add it — **the one thing that is not allowed is adding it under the label's cheaper number.**

✅ Cheap test for whether a rule is in scope: *if the engine could equally have chosen not to add this,
it is discretionary, and it must be priced on what it is rather than on what it is attached to.*

### 0a.1 ⛔ DAYS PER WEEK IS AN OUTPUT. It is never an input, and the solver never receives one.

**Decided 2026-07-27.** `days_per_week` is not a sixth constraint. It is a **consequence** of the five
above, and asking for it creates a number that can contradict the athlete's own picks.

```
sessions   = anchors (long run, long ride, hard day) + lifts (4)
stacks     = easy aerobic and upper lifts folded onto days that already have one
daysNeeded = sessions − stacks
```

Four lifts, a long run, a long ride and a hard day is **seven sessions**. Stacking is what compresses
that into five or six calendar days. It cannot go lower without **deleting something the athlete
chose**, and deleting a chosen session is never the solver's decision to make quietly.

**So the flow inverts.** Do not ask for a number and then try to honour it. Count the picks, stack
what stacks, and **report the number back**: *"this needs 6 days."* If the athlete wants five, they
drop a session — their call, made visibly, before the plan is built rather than silently during it.

⚠️ **THIS IS NOT A PREFERENCE ABOUT UX. It deletes a bug class.** Full trace in the ledger below; the
short version is that `days_per_week` currently contradicts the session list on every 4-to-6-day plan,
and the engine resolves the contradiction by **silently discarding the quality bike, the quality run
and the heavy leg day** — the three most important sessions in the week. A derived number cannot
contradict anything. There is nothing to enforce, so there is nothing to leak.

✅ **HALF OF THIS IS ALREADY BUILT — do not write it twice.** `place-week.resolveStacking()` is exactly
this arithmetic: `activeSessions = pins + lifts`, `stacksRequired = max(0, activeSessions − 6)`, plus
an `unresolvable` flag when there are not enough splittable days to absorb the stacks. It has served
Get Stronger since it shipped. **The combined path asks for a number instead.** The work is
generalising that function and deleting `days_per_week` from the input surface — not inventing a
calculation.

⛔ **DO NOT "FIX" `days_per_week` ENFORCEMENT.** It is enforcement in a path that is being deleted.
The stopgap was considered and explicitly declined on 2026-07-27: pre-launch, single user, no live
plans to protect, so there is no reason to repair a mechanism that the derivation removes.

---

## 0. Why rules, not templates — and why rules alone are not enough

**Templates fail on combinatorics and on honesty.** One entry per lift-frequency × run-days ×
ride-days × posture × preferred-days is hundreds of hand-maintained layouts, and every new preference
multiplies it. Worse: **a template cannot explain itself.** When an athlete's preferences are
unsatisfiable a template just picks something. A rule engine can name the constraint it had to break.

**But constraints only partition layouts into legal and illegal, and usually dozens are legal.**
That is exactly the bug shipped on 2026-07-26: `place-week` took the first legal arrangement and put
leg days 48h apart when 72h was available. Legal, minimum, worse than the hardcoded grid it replaced.
**It was not wrong. It was obedient — told "at least 48" and delivering exactly 48.**

⛔ **So the engine is three parts, and the third is the one that gets skipped:**

```
enumerate → filter by hard rules → SCORE → return best (+ what it had to break)
```

At 7 days and ~10 sessions the search space is small enough to brute-force. **No cleverness is
required and none should be added.**

---

## 1. ⛔ ANCHORS FIRST — this reframes the whole problem

**Michael, 2026-07-27:** *"The solver isn't placing 9 sessions. It's placing 2 with real constraints —
squat and deadlift — plus 2 that are nearly free, plus aerobic that stacks."*

**Treating all four lifts as equally constrained is what has been producing bad weeks.**

| | what it is | placement freedom |
|---|---|---|
| **Anchors** — long run, long ride, hard day | **User-picked fixed points.** Everything else solves around them | none — they are the input |
| **Squat, deadlift** | The only genuinely constrained lifts. High eccentric, leg conflict with every anchor except the ride | the real search |
| **Bench, overhead press** | **Near-zero eccentric cost, no leg conflict.** Filler | anywhere legal |
| **Easy aerobic** | Stacks onto lift days | fills gaps |

⛔ **The search is: place two lifts against up to three anchors. Everything else follows.**

---

## 2. ⛔ ANCHOR-TO-ANCHOR RULES COME FIRST — and nothing has covered this

The anchors can conflict with **each other**, before a single lift is placed. This is upstream of
strength placement and the engine has never modelled it.

### 2.1 Anchor eccentric ratings

**This is what makes flexible placement possible.** A "weekend endurance block" is not one
undifferentiated wall:

| anchor | eccentric | note |
|---|---|---|
| **Long run** | **HIGH** | Duration × foot strikes. The most expensive anchor there is |
| **Hard day — flat intervals** | **HIGH** | Highest force at highest ground-contact count |
| **Hard day — hills, jogged descent** | **MODERATE** | The descent is the eccentric part; jogging it costs something |
| **Hard day — hills, walked descent** | **LOW** | ⛔ The cheapest way to buy a hard aerobic session on foot |
| **Hard day — bike** | **~ZERO** | Concentric-dominant, no impact transient |
| **Long ride** | **~ZERO** | **A long ride is not a leg-cost day** |

⛔ **The long-ride row is the one that unlocks the week: squat CAN sit next to a long ride. It cannot
sit next to a long run.** An engine that does not know this treats Saturday-and-Sunday as a wall and
pushes the bar into a corner.

### 2.2 The rules

| pair | verdict |
|---|---|
| Long ride → long run | **Legal.** Order matters: ride before run, never after |
| Long run → long ride | Penalised — the ride is degraded by the run's damage |
| Hard day adjacent to long run | ⛔ **THE REAL CONFLICT.** Both eccentric. Penalised heavily, and the size depends on the hard day's modality (2.1) |
| Hard day (bike) adjacent to long run | Legal, near-free |
| Three anchors on consecutive days | **Legal input, bad week.** ⛔ The solver MUST detect and SAY so rather than produce something and stay quiet |

### 2.3 ⛔ ANCHORS DO NOT YIELD TO EACH OTHER — collision is a VALIDATION failure, not a precedence question

**Amended 2026-07-27.** An earlier draft ranked anchors by eccentric cost so the cheaper one could
move. **That is wrong: all three are hard (§0a). None of them moves.**

So a bad anchor arrangement is not something the solver resolves — it is something the WIZARD must
catch at pick time. See §7 step 1: detect anchor sets that cannot admit four lifting days and surface
it **at selection, not at generation.**

⚠️ The eccentric ratings in §2.1 still matter — they drive the SCORE and the adjacency penalties.
They no longer decide which anchor gives way, because none does.

---

## 3. Two adjacency axes, everything else a ceiling

⛔ **`mech` was doing double duty and that is why the bike read mech-0** — bar load and impact load are
different things, and "the bike is mech 0" was the eccentric axis showing through a name that also
meant bar load.

| axis | what it decides |
|---|---|
| **Neural** | CNS cost. Heavy singles, maximal intervals |
| **Eccentric** | Tissue damage. What actually forbids adjacency |

**Everything else is a BUDGET, never an adjacency input:** cardio load, weekly hours, weekly miles,
session counts per discipline. ⚠️ This resolves the ambiguity D-325 §2 has carried since it was
written — `cardio` is a dose cap ("this is a strength block, not a tri block"), and it was never an
interference signal.

---

## 4. The two decisions

### 4.1 A stacked day is ONE BUCKET, ordered. `canSplitDay` is an optional upgrade.

**Most people cannot split a weekday.** If they cannot, the gap is zero and the only lever is ORDER —
and order always applies.

⛔ **`canSplitDay` must be ASKED, never assumed** (`place-week.ts:47` — *"undefined is NOT yes"*). The
field exists and the intake has never asked. Until it does, no day is splittable: the conservative
direction, and the one Robineau makes expensive to get wrong.

### 4.2 Preferred days are SCORED, not hard. Anchors OUTRANK them.

**Hard constraints are the ones that are physiologically unsafe or contractually impossible.** A
preferred strength day is neither. A club night is — other people own it.

Treating preferred strength days as hard is what forced squat onto Tuesday when the athlete's quality
run was locked there. **Scored-high resolves it:** the solver honours the preference unless honouring
it breaks a hard rule, and then it moves it and names the rule that forced the move.

⛔ **Anchors outrank preferred strength days.** Both are user-picked and they can over-constrain each
other. When a preferred strength day is dropped to honour an anchor, that is exactly the
"say when you moved one" behaviour — never silent.

---

## 5. The score

Rank legal weeks by, in order:

1. **Rest days maximised** — the week must fight to lose one
2. **Primary lifts protected** — squat and deadlift clear of eccentric anchors by the law's clearance
3. **Spread between the two lower days** — ⛔ *more than the minimum is better.* The 48h-vs-72h bug was
   the absence of this line
4. **Quality on clean legs** — the hard day not preceded by an eccentric anchor
5. **Week shape — back-loaded weeks score worse** (see 5.0a)
6. **Preferred days honoured**
7. **Budgets respected** — hours, miles, session counts

⚠️ **A shortfall on any of these is REPORTED, never absorbed.** `place-week` already emits
`compromises[]` and its contract says they must never be silently swallowed.

### 5.0a ⛔ CONSECUTIVE ANCHORS ARE A SHAPE, AND ONLY THE SCORE CAN SEE THEM

**Added 2026-07-27.** §8.2's table is **pairwise by construction** and a pairwise table cannot express
"these two anchors are adjacent, so the whole week is back-loaded." It never will — that is the
correct limit of a clearance table, not a gap in it.

**The worked case.** Long ride Saturday, long run Sunday. The 48h clearance blocks Monday and Tuesday
for heavy legs, so they land Wednesday — **and that answer comes from the long RUN alone.** The long
ride's whole row is zero, so it contributes nothing to the decision. The pairwise maths happens to
produce a sane week, and nothing anywhere perceives that it is looking at a heavy weekend.

**So the score carries it.** Anchors landing on consecutive days is a real cost — the back half of the
week is loaded, the front is thin, and the athlete gets less recovery than the same three anchors
spread would give them.

⛔ **AND THE COMPROMISE LINE MUST NAME THE CAUSE.** A cramped week produced by the athlete's own two
picks is a *consequence of their choice*, not the engine being clumsy — and saying so is more useful
than silently producing the cramped week. **The line points at the anchors, not at the outcome.**

> *"Your long ride and long run are back to back, so the week is loaded at the end. Heavy legs land
> Wednesday because that is the first day clear of Sunday."*

⚠️ Report it, do not correct it. Anchors are hard constraints (§0a, §2.3) — the solver does not move
one to improve shape, and it does not argue. It states what the choice cost.

### 5.1 ⛔ DETERMINISM — and the tie-break is SPECIFIED, not merely "stable"

**Same athlete, same inputs, same week — across re-materialize, relayout AND regeneration.** Not just
within one run.

⛔ **If two weeks score identically the solver must pick the same one every time.** Otherwise a plan
that re-materializes produces a different-but-equal week, the athlete's days shuffle for no reason,
and nothing can explain it because nothing changed. That is the failure mode that looks exactly like
a bug and cannot be reproduced.

**The tie-break key, exactly:**

1. A **fixed lexicographic key derived from the LAYOUT ITSELF** — the day index (0–6) of each session,
   read in a **canonical discipline order** (a fixed list, e.g. squat, deadlift, bench, press, long
   run, long ride, hard day, easy sessions). Lowest key wins.
2. ⛔ **NOT enumeration order.** That is an artefact of how the loop happens to be written and it
   changes the day someone reorders a `for`.
3. ⛔ **NOT a hash of plan state.** Michael: *"otherwise it gets implemented as a hash and the shuffle
   comes back the first time an unrelated field changes."* A hash over plan state re-shuffles when a
   goal name is edited. **The key must depend on the LAYOUT and nothing else.**

⚠️ **Enumeration order must be deterministic too, or the tie-break is sitting on sand.** Iterate days
and sessions in a fixed declared order; never over a `Set`, a `Map` built from athlete input, or
object key order.

### 5.2 ⛔ THE FOURTH FATE: OVER-CONSTRAINED — zero legal weeks

**Michael, 2026-07-27:** *"Anchors plus preferred days plus budgets can admit zero legal weeks. Not
one preference gated — no solution at all."*

⛔ **Without a stated relaxation order, "gated" and "unsolvable" collapse into the same empty return,
and the app is silent at exactly the moment it most needs to speak.**

⛔ **THE MENU IS TWO OPTIONS. Amended 2026-07-27 — it was five.**

| # | relax | applied |
|---|---|---|
| 1 | **The full rest day** — accept 7 active days | ✅ **By the solver, and stated.** `place-week` already does exactly this: *"either one lifting day comes out, or the week runs with no full rest day"* |
| 2 | **A clearance minimum becomes a penalty** — accept 24h where 48h is wanted | ✅ **By the solver, and stated**, naming the clearance and the gap |

**Three options were removed, and all three for the same reason — they are hard constraints (§0a):**

- ⛔ *Drop an easy aerobic session* — removed. D-325 §7 forbids silently removing a session, and it is
  not the solver's to offer.
- ⛔ *Move an anchor* — removed. **Anchors are immovable.** A club night is not a preference; other
  people own it.
- ⛔ *Drop to a 2- or 3-day lifting week* — removed. **Four lifting days is a fixed count.** It read as
  the most powerful lever precisely because it broke the constraint that makes this block what it is.

### When neither relaxation yields a legal week

⛔ **Return the unsolvable shape and NAME THE ANCHORS AS THE BINDING CONSTRAINT.** Not a generic
failure — the athlete's three picked days are what left no legal home for four lifts, and that is a
sentence they can act on.

⚠️ **This is a LIVE PATH, not an edge case.** Five hard constraints across seven days means an
ordinary anchor arrangement can admit zero legal weeks. Which is why it must be caught earlier — see
§7 step 1.

⛔ **The return type must distinguish the three outcomes** — a solved week, a solved week with
compromises, and unsolvable-with-options. Collapsing the third into an empty array is the silence
this section exists to prevent.

### 5.2a ⛔ THE ONLY IMPLEMENTATION OF THIS EVER WRITTEN — preserved here because the code is gone

`_shared/resolve-schedule-collisions.ts` was **deleted 2026-07-27** as a dead second placement
authority (three sweeps, zero effect — see the deletion commit). But it contained the **only place in
this codebase that ever refused a week instead of quietly producing a worse one**, and that shape is
this section. It is written down here because there is now no implementation to copy from.

```ts
export type ScheduleCollisionCode =
  | 'SCHEDULE_GRIDLOCK_QUALITY_COLLISION'   // no day left to separate the hard run from the hard ride
  | 'SCHEDULE_GRIDLOCK_LOWER_BODY'          // no day left that clears heavy legs of the hard days
  | 'SCHEDULE_GRIDLOCK_LONG_COLLISION';     // long ride and long run cannot be split at this distance

/** Thrown when the rules cannot produce a safe week. UI/Arc catch by instanceof or `code`. */
export class ScheduleCollisionError extends Error {
  readonly code: ScheduleCollisionCode;
}
```

**Four properties worth inheriting, and each was earned:**

1. **A TYPED CODE, NOT A MESSAGE.** Three named failures, each identifying *which constraint bound*.
   That is what §5.2 means by naming the binding constraint — the caller can branch, and the copy can
   differ per code. A boolean or a null cannot do this.
2. **IT THREW.** Not a silent fallback, not a first-fit last resort, not a dropped session. The
   surrounding code had to handle it or crash, which is the correct pressure — every silent
   last-resort path in the audit exists because someone chose the other option.
3. **ONE RETRY, THEN THE THROW.** Its caller retried exactly once after dropping a single easy swim,
   and stated it in a trade-off. That is §5.2's relaxation menu in miniature: a bounded retry with a
   named cost, and a refusal after.
   ⚠️ **The solver must NOT inherit the retry AS WRITTEN** — dropping a session is forbidden by
   D-325 §7 and by §5.2's own removed options. Inherit the *bounded-retry-then-refuse* shape and give
   it a legal relaxation to spend.
4. **THE ERROR WAS PART OF THE EXPORTED CONTRACT.** The type was importable, so callers could catch
   it by `code` rather than by string-matching a message.

⛔ **When the solver returns `status: 'unsolvable'`, these three codes are the starting vocabulary.**
Do not invent a fresh set, and do not regress to an empty array.

---

## 6. Receipts

⛔ **Verified against the primary sources on 2026-07-27, not carried from this repo's own register.**
Michael: *"we need receipts — ultimately we need a science-backed POV for every training plan."*

| claim | source | status |
|---|---|---|
| **Resistance BEFORE endurance when they cannot be separated: +6.91% lower-body DYNAMIC strength** (95% CI 1.96–11.87, p=0.006), 10 studies, 227 subjects | Eddens et al. | ✅ **VERIFIED, and NARROWER than we were citing it.** Static strength −0.04% (n.s.), hypertrophy +1.15% (n.s.), VO2max −0.27% (n.s.). ⛔ **NO upper-body data exists in it.** Authors' own scope: *"individuals limited by time, such that they must train concurrently with minimal relief between modes."* That is exactly our one-bucket case |
| **A gap of at least 6h between contradictory qualities** | Robineau et al. 2016, n=58 amateur rugby, 7 weeks | ✅ **VERIFIED.** Strength gains in bench and half-squat LOWER in C-0h than C-6h, C-24h and strength-only. Authors: *"avoid scheduling 2 contradictory qualities with less than 6-hour recovery"* |
| **24h beats 6h on the AEROBIC axis** | Robineau 2016 | ✅ **VERIFIED VERBATIM:** *"Training-induced changes in VO2peak were higher in C-24h than in C-0h and C-6h."* So 24h is the target and 6h is the floor — they are not equivalent |
| ⚠️ **Robineau does NOT test ORDER** | Robineau 2016 | ⛔ **PRECISION THAT CHANGES THE CITATION.** *"Two sessions of each quality each week with strength always performed before aerobic training."* Every group lifted first. It tests THE GAP ONLY. **Order comes from Eddens.** Do not cite Robineau for ordering |
| ⛔ Half-squat gains of +16.8% / +31.2% / +25.9% at 0h / 6h / 24h | — | ⛔ **UNVERIFIED. Present in this repo's register; NOT in the paper's abstract, and full text is paywalled.** The abstract states direction only. **Do not put these numbers in athlete-facing copy** |
| Uphill lowers loading rate and peak vertical GRF at matched metabolic cost, 4–8% | J Biomech 2020 iso-efficiency | ✅ Measured. Underpins the hard-day eccentric ratings in §2.1 |
| Long intervals (≥2 min) accumulate more time at VO2max than short (≤30s) or moderate (>30s–<2min) | Systematic review + meta-analysis | ✅ Verified — why the hard day is 4×3min, not 40/20 |
| Eccentric damage peaks 24–48h; largest strength/speed/agility deficits at 48h | EIMD meta-analysis | ✅ Verified — the 48h clearance for eccentric anchors |
| **Every ceiling in D-325** | — | ⛔ **NO LITERATURE.** Calibrated empirically against known-good weeks, never derived. Acceptable ONLY while it stays that way |

---

## 6b. ⛔ THE REAL FINDING: THREE PLACEMENT AUTHORITIES, AND THE SPEC'S VALUE IS COLLAPSING THEM

**Michael, 2026-07-27:** *"Three authorities can't agree, and none owns the answer. The spec's value
isn't a better algorithm — it's collapsing three into one."*

**That is the root cause of the layout problems, not any one engine being wrong.**

| authority | owns | entry points |
|---|---|---|
| **`placement/`** (`simple.ts`, `strategy.ts`) | Run-plan strength | ⛔ **TWO — plan CREATION (`generate-run-plan` → `strength-overlay`) and RELAYOUT (`adapt-plan` → `buildStrengthSessionsForPlanWeek`)** |
| **`place-week.ts`** | Get Stronger placement, since 2026-07-26 | one |
| **`_shared/week-optimizer.ts`** | Combined/tri plans. `SCHEDULING-RULES.md` DECLARES it sole authority | one — and the other two do not route through it |

⚠️ **`placement/` is NOT a dead branch to route around.** It decides where the barbell goes at plan
creation for every run plan. Replacing it is a creation-path change, not a relayout-path change.

⛔ **BUT KEEP THE METHODOLOGY TEMPLATES AS INPUTS.** Higdon and Daniels encode real endurance
structure and that is worth having. They simply must not decide where the barbell goes — they
describe the anchors, and the solver places around them.

### Relayout is transport, not policy — and it cannot reach this block at all

`adapt-plan`'s relayout is keyed on an endurance-shape fingerprint, which is exactly the anchor
contract in code: strength re-solves when the fixed endurance points move. **The trigger and the
`strength_primary_sig_by_week` idempotency guard are sound and survive as-is.**

⛔ **What it triggers is `placement/`, and it is gated `strengthFreq !== 2 && strengthFreq !== 3`.
Get Stronger is FOUR. The block this spec exists for has NO relayout path at all — nothing fires,
so there is nothing to fix there yet.**

✅ **RESOLVED 2026-07-27 — the solver does NOT inherit this gate.** Four lifting days is a hard
constraint (§0a), so a frequency check that admits only 2 and 3 cannot describe anything the solver
does. **The gate is scoped to the LEGACY RELAYOUT PATH only** and dies with `placement/` at step 0.

*(For the record: it arrived in `0057400c`, 2026-03-30, in the same commit that created relayout,
with nothing in the message about the frequency choice — and the four-day arc did not exist yet. The
question of whether something real sat behind it is now moot.)*

### Sequencing

⛔ **Solver first, then point everything at it.** Shipping relayout first means building the banner,
the telemetry and the sig contract around an engine that is about to be deleted.

⚠️ **First-time seed reads 100% and means nothing.** `strength_primary_sig_by_week` starts empty, so
the first post-deploy ingest relayouts every active plan. Know that before reading the telemetry.

---

## 6c. ⛔ THE COMPROMISE LIST IS PART OF THE OUTPUT TYPE — NOT A v2 FIELD

**Michael, 2026-07-27:** *"Every consumer downstream depends on it existing, so it can't be a v2
field."*

The solver returns the week **and the reasons**, together, from the same call:

```
solve(anchors, lifts, budgets) →
  | { status: 'solved';       week, compromises: [] }
  | { status: 'compromised';  week, compromises: string[] }   // both relaxations applied and named
  | { status: 'unsolvable';   bindingAnchors: Anchor[] }      // anchors named as the cause (§5.2)
```

**The reason must be emitted at DECISION TIME.** A sig-to-sig diff cannot reconstruct it afterwards —
`sessions_replaced: 3` says how many moved and nothing says which constraint forced it. Today
`placement/` returns a `slotsByDay` map with no rationale at all, so there is nothing to capture even
if a consumer wanted it.

**Three consumers already need it and none can be honest without it:**

- **Relayout** — *"moved squat off Tuesday because deadlift was 24h out"*, not `sessions_replaced: 3`.
- **The banner** — *"Adjusted to fit your updated schedule"* is precisely the vague claim the State
  work exists to eliminate. It is unfixable until something upstream knows why.
- **Session copy and the build preview** — already rendering `place-week`'s `compromises[]`.

✅ `place-week` proves the shape works: it has emitted `compromises[]` since it was written, and its
contract says they must never be silently swallowed.

---

## 7. Build order

-1. ⛔ **RESOLVE THE LAW'S SELF-CONTRADICTION** (§8.4) — `long_ride` requires 48h from lower body AND
   may share a day with it. One cell, and it changes the shape of every week. **Nothing can be built
   on a rule set that disagrees with itself.**
0. ⛔ **COLLAPSE THE THREE AUTHORITIES** (§6b) — this is the point of the whole document. Everything
   below is wasted if three engines still decide placement afterwards.
1. ⛔ **ANCHOR VALIDATION AT PICK TIME, IN THE WIZARD** (§2.3, §5.2). Five hard constraints over seven
   days means a user-picked anchor set can admit ZERO legal weeks — **a live path, not an edge case.**
   Detect arrangements that cannot house four lifting days and surface it **at selection, not at
   generation.** Telling someone their week is impossible after they press Build is the silence this
   whole document exists to remove.
2. **FILL THE ADJACENCY TABLE** (§8.2) — the stacking table already exists and is complete; adjacency
   is two lists relative to lower body only, and every other pair is an empty cell.
3. **Anchor-to-anchor conflict detection in the solver** (§2) — upstream of lift placement and absent today
4. **Eccentric ratings per session and per anchor** (§2.1, §3)
5. **The scorer** (§5) — filter already exists in `place-week`; the ranking is what is missing
6. **`canSplitDay` in the intake** (§4.1) — one question, and the field is already there waiting
7. **Preferred STRENGTH days from hard to scored** (§4.2) — the anchors stay hard

8. **Point relayout at the solver** — its trigger and idempotency guard survive; only the engine
   behind them changes (§6b).
9. **Then** the banner and the telemetry, which need §6c's compromise list to say anything true.

⚠️ **Nothing here is built. `place-week` today does §5 step 1 and 2 and stops.**
⛔ **And the largest single risk is that `placement/` runs at plan CREATION for every run plan, not
just at relayout — so collapsing it is a creation-path change with a real blast radius.**

---

## 8. ⛔ THE TWO TABLES — the rule surface, closed by construction

**Michael, 2026-07-27:** *"The leaks aren't random. They're empty cells in a table you haven't drawn.
Prose rules have no edges — you can always discover another one. A filled table has exactly N cells
and then it's done."*

Every rule found in conversation so far — *"squat can't follow a long run"*, *"easy ride stacks on a
lift day"* — is **one cell**. Two tables close the surface.

### 8.1 STACKING — ⛔ ALREADY EXISTS AND IS COMPLETE. Do not redraw it.

`_shared/schedule-session-constraints.ts` → `ROWS`, a filled 10×10 (swim is a row, so 100 cells, not
81). **Read it, do not re-derive it.** Notable cells, all already correct:

| pair | law | note |
|---|---|---|
| `lower_body_strength` × `long_ride` | ✅ **may share** | ⛔ The eccentric asymmetry §2.1 argued from first principles is ALREADY ENCODED. A long ride is not a leg-cost day |
| `lower_body_strength` × `long_run` | ❌ | Correct |
| `lower_body_strength` × `easy_run` | ✅ **may share** | Flipped to legal 2026-05-12, citing STRENGTH-PROTOCOL §6.2 |
| `upper_body_strength` × `easy_run` | ❌ **may NOT share** | ⚠️ **See 8.3 — the composer does this every week** |

⚠️ **What the table does NOT encode is ORDER.** It answers *may these share a day*, never *in which
sequence*. Order is Eddens: **resistance first when they cannot be separated** (+6.91%, lower-body
dynamic strength, and only for those who cannot separate — §6). That is a third dimension the
existing matrix has no room for and the solver must carry.

### 8.2 ADJACENCY — ✅ BUILT 2026-07-27

**The table is in code.** `_shared/schedule-session-constraints.ts` → `ADJACENCY_HOURS` (hours,
symmetric, asserted at module load) + `ADJACENCY_PENALTIES` (legal-but-costly, directional), read via
`requiredAdjacencyHours(a, b)` and `adjacencyPenaltyReason(before, after)`. Pinned by
`_shared/adjacency-table.test.ts`, 11 tests.

**What it replaced.** Two lists — `LEG_QUALITY_KINDS` and `LEG_LONG_KINDS` — both relative to
`lower_body_strength` only, so every pair NOT involving a lift was undefined. Long run beside a hard
run, hard run beside a long ride, easy run beside anything: no rule anywhere. Those were not
permissive decisions, they were **empty cells**, and each one surfaced later as a "leak" in a
generated week. Both lists and `isLegLoadedAtIntensity` are now **deleted** — they were the table's
`lower_body_strength` row and nothing more, and `place-week.requiredClearanceHours` reads that row
out of the table so there is one authority instead of two that can drift.

⚠️ **`upper_body_strength` and both swims have no row, on purpose.** `SESSION_PRIME_MOVER` rates them
`upper`/`neutral`; giving them an all-zero row would imply a constraint exists to be tuned.
**The grid is the seven leg-loaded kinds** (the six below, plus `easy_bike`, which the original
sketch omitted):

|  ↓ before / after → | Squat | Deadlift | Long run | Hard day | Long ride | Easy run |
|---|---|---|---|---|---|---|
| **Squat** | ≥48h | ≥48h | **≥48h** | ≥24h | **0h — §8.4 resolved** | OK |
| **Deadlift** | ≥48h | ≥48h | **≥48h** | ≥24h | **0h — §8.4 resolved** | OK |
| **Long run** | ≥48h | ≥48h | — | penalty — both eccentric (§2.2) | penalty — ride first | OK |
| **Hard day** | ≥24h | ≥24h | penalty (§2.2) | — | OK | OK |
| **Long ride** | **0h** | **0h** | OK — ride before run, never after | OK | — | OK |
| **Easy run** | OK | OK | OK | OK | OK | OK |

**Cells marked OK are the majority and that is expected — most pairs are trivially legal.** The value
of drawing it is that the handful which are not are now enumerated rather than discovered.

⛔ **Two ratings deliberately withheld, so the solver does not acquire a second opinion:**
- `quality_run` × `quality_bike` — two hard days back to back is a hard/easy question, already owned
  by `sequentialOk` and `enforceHardEasy`. Adding it here would be a second ranking of one fact,
  which §5 forbids.
- `long_run` × `quality_bike` — **not penalised.** The §2.2 conflict is between two *running*
  sessions. The bike carries no eccentric load; "hard day" in the sketch above meant the hard RUN.

### 8.2a ⛔ THE DAY BEFORE THE LONG RUN — RESOLVED, AND NEITHER LIVE ENGINE WAS RIGHT

**Recorded 2026-07-27.** Two shipped modules give opposite answers to "may strength sit the day
before the long run," and this surfaced *by accident* while auditing something else. **The adjacency
table already decided it, and it agrees with neither.**

| | says | verdict |
|---|---|---|
| `placement/strength-slot-resolver.ts` `excludeDayBeforeLong` | **NO strength at all** the day before the long run, unconditionally | ⛔ **OVER-BROAD.** It bans upper body, which shares no prime movers with running. Those cells were flipped to ✓ on 2026-07-27 on exactly that logic (§8.3, and the `upper × long_run` flip). A bench press the night before a long run costs nothing |
| `week-optimizer` §4.21 | relaxed to **24h-pre** in May, citing Friday-lift/Saturday-long-ride as standard practice | ⛔ **TOO LOOSE.** It applies to heavy legs, and the table says `lower_body_strength ↔ long_run` is **48h**. The May relaxation was reasoned about the long RIDE — which is correct and is now 0h — and quietly carried the long RUN with it |

**The table's answer, which is neither:**

- `upper_body_strength` the day before a long run — **legal, no penalty.** Prime-mover logic.
- `lower_body_strength` the day before a long run — **48h, so no.** Eccentric, and it is the one cell
  §8.2 says actually constrains a week.

⛔ **THE SOLVER READS THE TABLE. It does not inherit either module's answer as a starting point**, and
it does not split the difference. Both were written before the table existed; neither is a second
opinion worth preserving.

⚠️ Left in place deliberately — fixing `excludeDayBeforeLong` inside `placement/` would be repairing a
module scheduled for replacement. It resolves when the solver takes its callers, not before. **This
entry exists so the answer is not re-derived from whichever module gets read first.**

### 8.3 ⛔ THE COMPOSER CONTRADICTS THE STACKING TABLE, ON EVERY WEEK IT HAS BUILT

`upper_body_strength × easy_run = 0` — may not share a day. **The Get Stronger composer stacks easy
runs onto UPPER lift days deliberately** (`upperLiftDays`), which is what Thursday and Friday are in
every plan it has produced.

Meanwhile `lower_body_strength × easy_run = 1` — the stack it is permitted to make is the one it
avoids.

⛔ **It never asks.** The composer imports the clearance helpers from
`schedule-session-constraints.ts` and never the same-day matrix. **Backwards, and unchecked, because
nothing connects the two.**

⚠️ **Do not "fix" the composer before the collapse** — resolve it in the solver, which will consult
one table. But someone must decide which is right: an upper lift and an easy run share no prime
movers, so the `0` is the suspicious cell, not the composer's behaviour.

### 8.4 ⛔ AND THE LAW CONTRADICTS ITSELF — long ride vs lower body

**Two shipped rules, mutually exclusive:**

- `LEG_LONG_KINDS` includes `long_ride` → **≥48h from `lower_body_strength`, both directions**
- `ROWS` says `lower_body_strength × long_ride = 1` → **they may share a day (0h apart)**

**Zero hours and forty-eight hours cannot both be the rule.** `place-week` reads the first (via
`requiredClearanceHours`), the optimizer reads the second, and the two have never been run against
each other.

⛔ **THE SOLVER CANNOT BE BUILT UNTIL THIS IS DECIDED.** It is the one cell where the answer changes
the shape of every week: §2.1 and the same-day matrix both say a long ride is eccentrically cheap, so
**the 48h clearance is the suspect** — `long_ride` is probably in `LEG_LONG_KINDS` because it sits
next to `long_run` in a list, not because anyone rated it.

### 8.5 The score card stays short

**Three or four weights, separate from the tables** (§5). Tables say what is *legal*; the score says
which legal week is *best*. ⛔ **If the score card grows past four lines, a preference has been
promoted to a rule.**
