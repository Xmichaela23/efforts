# SPEC — The Week Solver

**Status:** spec. Not built. Replaces the placement half of `place-week.ts`, which filters and takes
the first legal answer.
**Author:** Michael + Claude, 2026-07-27.
**Companion:** `DOCTRINE-aerobic-maintenance.md` (what the block is for), `D-325` (costs and ceilings).

> **Michael, 2026-07-27:** *"LLMs cannot problem-solve a training schedule and ever get it right, so
> let's lock in the rules."* This document is that lock. Nothing in the engine may place a session by
> reasoning about it; it places sessions by running the rules below.

## ⛔ WHY ONE SOLVER IS POSSIBLE AT ALL

**All five live deciders agree on WHETHER to separate. They disagree only on HOW MUCH, and MEASURED
HOW.** Every one of them holds the long sessions apart from heavy legs in some form; every one
reserves some rest. Not one of them disputes the principle.

**That is what makes this a collapse and not a negotiation.** Five engines with five different
theories of training would have to be reconciled. Five engines with one theory and five arithmetics
just need the arithmetic stated once — which is the adjacency table (§8.2) and the score (§5).

⚠️ Read that as the constraint it is: **if a proposed solver rule cannot be expressed as "how much" or
"measured how", it is a new theory, and it does not belong here.**

## ⛔ 0b. THE WEEK STARTS ON MONDAY. ONE CONVENTION, NO EXCEPTIONS.

**Declared 2026-07-27, before any solver code, because two conventions are live right now:**

| convention | where |
|---|---|
| **Mon-first, 0-6** | `place-week.DAYS`, `science.ts DAYS_OF_WEEK`, `base-generator.dayOffsets` |
| Sun-first, 0-6 | `week-optimizer.ALL_DAYS`, `strength-slot-resolver.SUN_RING`, `combined-schedule-prefs` |
| Mon-first, **1-7** | `validate-reschedule/index.ts:641`, `AllPlansInterface.tsx:658` |

⛔ **THIS IS NOT A STYLE SPLIT — IT BREAKS DETERMINISM.** §5.1's tie-break is a **lexicographic key
built from day indices in canonical discipline order.** If "day index" means two different things in
two modules, the key is not a key: the same week scores differently depending on which module built
it, and the guarantee that a re-materialised plan reproduces the same days quietly fails. §5.1 cannot
be satisfied by a solver alone; it requires everything the solver talks to to count days the same way.

✅ **THE CONVENTION IS MONDAY-FIRST, ZERO-INDEXED.** `0 = Monday … 6 = Sunday`. Chosen because it is
what the two modules that already read the law use (`place-week`, `science.ts`), and because a
training week is conventionally read Monday to Sunday with the long day at the end.

**Everything that survives the collapse conforms.** Storage that is Sun-first converts **at the
boundary, once, on the way in** — never by scattering `(x + 6) % 7` through the solver, which is the
current state at roughly ten call sites and is exactly how the two conventions got established.

⚠️ Those ten sites convert **as part of the collapse, not before it.** They die with their modules;
touching them first would be repairing code scheduled for deletion.

## ⛔ 0c. THE LAW'S CURRENCY: HOURS BETWEEN TWO NAMED SESSIONS. NEVER FORBIDDEN WEEKDAYS.

**Promoted to a principle 2026-07-27**, because it turned out to be the single defect behind three
separate bugs in `placement/`, and one grep found the third.

**The law says:** *"`lower_body_strength` and `long_run` need 48 hours between them."*
**It never says:** *"Thursday is unavailable."*

⛔ **A SET OF FORBIDDEN DAYS IS ALWAYS A CONVERSION ERROR**, and it is lossy in exactly two places —
which are the two questions the law asks and a weekday cannot answer:

| the law asks | a forbidden-day set loses |
|---|---|
| **WHICH session?** | `upper` shares no prime movers with running. Forbidding *the day* forbids the bench press too |
| **HOW MUCH?** | 24h is already satisfied by being one day apart. Forbidding *the day before* spends a clearance that was never owed |

**Worked instances, all three the same error, all three in one module:**

| # | code | over-broad on |
|---|---|---|
| 1 | `excludeDayBeforeLong` | bans **all** strength before the long run — upper is free |
| 2 | `lowerBufferQuality` | bans heavy legs before **any** quality day — 24h is already met |
| 3 | `buildEasyDays` | drops the long-run day and all quality days for **all** strength, upper included |

✅ **THIS IS GREP-ABLE, AND THAT IS THE POINT.** Search for a `Set<Weekday>` named `forbidden`,
`blocked`, `excluded`, or a candidate loop that `continue`s on a bare day comparison. Number three was
found with one command after numbers one and two were each found by accident.

⛔ **IT APPLIES FORWARD. THE SOLVER MAY NEVER BUILD ONE.** Candidate filtering asks
`requiredAdjacencyHours(kindA, kindB)` against the *placed* sessions, per candidate day, per session
kind. The moment a day is excluded without naming which session it was excluded for, this entire arc
has reintroduced itself.

---

## ⛔ 0d. A TEST THAT HAS NEVER FAILED IS NOT EVIDENCE

**The fourth member of the family** — see §0e for the fifth and for all five in one table.

⛔ **A GREEN TEST PROVES THE SUITE RAN. IT DOES NOT PROVE THE TEST CAN FAIL.** This project has now
shipped both failure modes in one day:

| | what happened |
|---|---|
| **The test was defending the bug** | three `place-week` tests encoded `canSplitDay` as a gate. Green all day, and every "1341 passing" included them. Rewriting the rule made them red — which is the only reason anyone looked |
| **The test could not have caught it** | the solver's determinism test passed before the tie-break was made order-independent, because it never shuffled the input |

✅ **THE DISCIPLINE, and it is cheap: RED-GREEN-RED.** Before trusting a test that guards an
invariant, **reintroduce the defect and watch it fail.** Then restore and watch it pass. Two commands.

**Verified this way so far — each one changed a number, so each one is real:**

| test | broken deliberately | result |
|---|---|---|
| tie-break order-independence | rebuilt the key in input order | **red**, restored **green** |
| stack host preference | removed the host term | short-day hosting **84 → 0** |
| breach grading | counted breaches instead of measuring | total breach **288h → 312h** |

⚠️ **The tell that you need this:** a test written *after* the code, asserting what the code already
does. It cannot fail on the day it is written, so nothing has ever established that it could.

## ⛔ 0e. A CHECK WHOSE METRIC CANNOT MOVE IS NOT A CHECK

**The fifth member of the family, and it generalises past testing.** §0d says a test that has never
failed is not evidence. This is the same defect one level up: **the verification ran, the number came
back, and the number was incapable of showing the thing being looked for.**

**The instance, 2026-07-27.** Two scoring terms were added (§6b-3 finds 12 and 13) and checked by
measuring tightest-heavy-day-gap and upper-adjacency across a sweep. **Both metrics were unchanged,
and both terms were real** — the sweep used three lower lifts on five free days, where adjacency is
*forced* and the metric is pinned regardless of the score. A full output diff showed **39 weeks
changed.** Stopping at the metric would have been a false negative, and it would have looked like
diligence.

⚠️ **THE TELL:** a metric that is bounded by the fixture rather than by the code. If the arrangement
forces the value, the value cannot testify about the change.

✅ **THE DISCIPLINE:** prefer a **full output diff** over a summary statistic when asking "did this
change anything." Diff the whole result set; count the differences; look at examples. A statistic is
for describing a change already known to exist, not for detecting one.

## ⛔ 0f. OUTPUT-BOUNDARY LOSS — a correct answer that fails to say what the spec requires

**The sixth principle, and the subtlest.** The other five catch **wrong answers**. This one catches
**right answers that do not carry something the spec requires them to carry** — and no sweep can see
it, because the week *is* correct.

**Three instances, all found by reverse inventory (§6b-6), none by any sweep:**

| requirement | what was lost | how it surfaced |
|---|---|---|
| §4.2 preferred days | scored at **zero** — a stated preference was worth nothing | only because `week-optimizer` implemented it and an inventory read that module |
| §4.1 the stack is **ordered** | the pairing was emitted with no "lift first" | reading the spec against the output |
| §2.2 the expensive anchor pair | every adjacent pair priced the same | same |

⛔ **AND A FOURTH, LIVE IN PRODUCTION RIGHT NOW:** `place-week`'s `stackedWith` — label, gap hours,
and order — has **zero consumers**. The composer reads `slots` for days and discards the rest. An
athlete stacking a bench press onto their long-ride day is told **nothing** about order or gap.
Eddens is the reason that stack is safe; an athlete who rides first has an unsafe day **that renders
as a legal one.**

⚠️ **THE STANDING BLIND SPOT:** any requirement describing what the answer must **say** — rather than
how it is **found** — is invisible to every correctness test, and stays invisible until someone reads
the spec against the output. It is not a phase that ends.

✅ **THE CHECK:** for each spec requirement, ask *"which field of the output carries this, and who
reads that field?"* A requirement with no field, or a field with no reader, is already lost.

⛔ **The six, together — all checkable rather than remembered, which is the only reason they will
outlive this session:**

| § | principle |
|---|---|
| **0c** | the law's currency is hours between named sessions, never forbidden weekdays |
| **0d** | a test that has never failed is not evidence |
| **0e** | a check whose metric cannot move is not a check |
| **0f** | a correct answer that fails to say what the spec requires is still a failure |
| **4.1a** | strictness beyond the law needs an owner and a reason |
| **5.2b** | never subtract silently — refuse, and name the options |

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

### 4.1a ⛔ METHODOLOGY TEMPLATES ARE INPUTS. THEY DESCRIBE ANCHORS; THEY DO NOT PLACE THE BAR.

**Decided 2026-07-27.** Higdon and Daniels survive the collapse — as **declared constraints entering
the solver**, never as placement engines. A template says *what the week is shaped like*; the solver
says *what day each session lands on*. Those are different jobs and `placement/` conflated them.

**The worked case, and it is the one that justifies the category.** `getDanielsStrategy` stamps every
quality day as `'none'` for strength, and says why:

> *"a hard polarisation rule, not masking a failed resolve"*

⚠️ **THAT ONE SURVIVES SCRUTINY** — Daniels' whole method is polarisation, so Tue/Thu being untouchable
is the methodology, not a clearance. It enters the solver as a **declared constraint carrying its own
reason, scoped to Daniels**, and it is legitimately stricter than the law: the law permits
`upper × quality_run`, and Daniels declines to use that permission on purpose.

⛔ **AND THE CONTRAST IS THE WHOLE LESSON.** `buildEasyDays` applies the *same* exclusion to **Higdon**,
where nothing states it and no reason exists. Same code, same effect, one is a decision and one is a
default — **and the module cannot tell them apart.** That is the failure underneath every §6b-2
instance: it does not distinguish a rule it reasoned about from one it inherited.

✅ **THE TEST FOR THE SOLVER:** a constraint stricter than the law is admissible **only when it names
the methodology it belongs to and carries its reason.** Anything stricter than the law without an
owner is not a template rule — it is §0c's conversion error wearing one.

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

### 5.2b ⛔ THE FAILURE CLASS THIS SECTION EXISTS TO KILL: SILENT SUBTRACTION

**Named 2026-07-27, after the third instance.** When a week cannot fit, this codebase's habit is to
**quietly return fewer sessions than were asked for**. Not an error, not a trade-off, not a
compromise line — the session is simply not in the output, and nothing anywhere knows it was dropped.

| # | where | what disappears |
|---|---|---|
| 1 | **Q-206** — derived rest days are asserted and never enforced, then `week-builder`'s `!slot?.isRest` guards refuse to emit | the quality bike, the quality run and the heavy leg day, on any 4-to-6-day plan |
| 2 | `week-builder:473` — the matrix-conflict repair loop **deletes a strength session** until the grid validates, up to 32 passes | a lifting day, unremarked |
| 3 | `base-generator` — Saturday is hardcoded shut, so a seven-session week has six days to place into | whichever session ran out of days. Found by the §6b-1 X2 tripwire, which was written to test something else |

⛔ **ALL THREE ARE THE SAME DEFECT, AND IT IS NOT A PLACEMENT BUG.** It is a module choosing to
subtract rather than to refuse. The week that comes back is *legal* — that is what makes it
dangerous. It validates, it renders, it looks like a plan, and the athlete's missing session leaves
no trace to find.

✅ **THE FOURTH FATE IS THE ANSWER, AND IT IS ALREADY WRITTEN ABOVE.** An over-constrained week
returns **named options** — *drop the full rest day*, *downgrade a clearance to a penalty* — and a
typed refusal when neither is taken (§5.2a). **It never returns six sessions when seven were asked
for.**

⛔ **THE SOLVER MAY NOT REMOVE A SESSION. EVER.** D-325 §7 already forbids it and §5.2's relaxation
menu deliberately excludes it. Restated here because forbidding it in the menu did not stop three
modules doing it anyway — each in a different place, none of them via the menu.

#### ⛔ AND IN ONE MODULE IT WAS NOT AN ACCIDENT — IT WAS THE STATED POLICY

`week-optimizer`'s relax-tier comment, verbatim:

> *"If the engine can't satisfy 48h vs long, it should **drop a strength session** instead of
> compromising the long-session recovery window."*

⚠️ **THIS IS WRITTEN DOWN AS DOCTRINE, WITH A RATIONALE THAT SOUNDS RESPONSIBLE.** Protecting the
long-session recovery window is a real goal. That makes it **re-arguable in good faith**, which is
more dangerous than a slip — a slip gets fixed once, a reasoned position gets reintroduced by the
next person who finds the reasoning persuasive. So it is refuted here, not merely forbidden:

| the argument | why it fails |
|---|---|
| *"Breaching 48h compromises the long-session recovery window"* | It does, and the solver **says so, by name, with both numbers**. The athlete then knows their Tuesday squat sits 24h from Sunday's long run and can act on it. Nothing is compromised in the dark |
| *"Dropping the lift protects the window"* | It protects the window by **deleting training the athlete asked for**, and telling no one. The window is intact and the block is not. A 4-day lifting arc that quietly runs 3 days is not a protected week, it is a different plan |
| *"The engine has to choose one"* | **It does not.** That is the false dilemma the whole fourth fate exists to dissolve. The third option is to place the week, name what it cost, and let the athlete decide — which is §5.2's menu, and it was available the entire time |

✅ **THE ONE-LINE ANSWER, for when this comes back:** *the recovery window is protected by breaching
and NAMING, never by deleting a session the athlete asked for.* A week that quietly returns less than
was requested is precisely the failure the fourth fate exists to prevent — and it does not stop being
that failure because the reason for it was a good one.

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

> ### ⛔ UPDATED 2026-07-27 — IT WAS SIX, IT IS NOW FIVE, AND THE DISAGREEMENTS ARE ENUMERATED IN §6b-1.
> The three named below are the three that were *known*. The placement audit found three more:
> `_shared/resolve-schedule-collisions.ts` (**deleted** — dead, three sweeps, zero effect),
> `generate-run-plan/generators/base-generator.ts` (a fixed grid behind six run generators), and
> `generate-triathlon-plan/generators/tri-generator.ts` (a full hardcoded week).
> **Read §6b-1 before writing solver code** — it is the union of what all five actually decide, and
> every place they contradict each other.

### 6b-1 ⛔ THE UNION OF LIVE PLACEMENT BEHAVIOUR — every disagreement, enumerated

**Built 2026-07-27, by reading all five.** C4 (the day before the long run) surfaced *by accident*;
this section exists so the rest did not have to.

**The five live deciders**

| # | module | decides for | consults the law? |
|---|---|---|---|
| A | `_shared/week-optimizer.ts` | combined + tri plans | ✅ matrix + `sequentialOk` |
| B | `shared/strength-system/place-week.ts` | Get Stronger (4 lifts) | ✅ matrix + adjacency table (since 2026-07-27) |
| C | `shared/strength-system/placement/` | run-plan strength + adapt-plan relayout | ⛔ **never** — its own role/slot model |
| D | `generate-run-plan/generators/base-generator.ts` | the endurance week for **six** run generators | ⛔ never — literal weekdays |
| E | `generate-triathlon-plan/generators/tri-generator.ts` | standalone tri week | ⛔ never — literal weekdays |

**THE DISAGREEMENTS**

| # | question | the split |
|---|---|---|
| **X1** | **the long-run day** | A and B take it as an athlete anchor. E defaults Sunday but honours `preferred_days`. ⛔ **D HARDCODES SUNDAY AND CANNOT BE TOLD OTHERWISE** — `schedule_preferences.long_run_day` exists in `generate-run-plan/types.ts:264` and is **read nowhere in that function**. A run-plan athlete who says Saturday gets Sunday, silently |
| **X2** | **Saturday** | ⛔ **D makes Saturday a hard rest day, always.** A, B and E all treat it as a working day — it is E's and A's default long-*ride* day. Two modules cannot both be right about the same weekday |
| **X3** | **quality days** | D hardcodes Tue/Thu. E hardcodes quality_bike Tue + quality_run Wed. A derives them. ⚠️ And E derives `quality_run` from **`preferred_days.swim[1]`** when no run pin exists — a run day taken from a swim preference |
| **X4** | **heavy legs vs long run** | **Resolved — see §8.2a.** The table says 48h and upper is free; A says 48h-post/24h-pre; C forbids *all* strength the day before. Neither module is right |
| **X5** | **heavy legs vs quality** | ⛔ **NEW, and the same shape as X4.** C's `lowerBufferQuality` forbids lower the day before **any** quality day. The table says 24h — which an adjacent day already satisfies. **C is over-broad on the quality axis exactly as it is on the long-run axis** |
| **X6** | **strength frequency** | A's type is `1\|2\|3` and *cannot represent* a 4-lift week. B is exactly 4. C handles 2/3/4. ⛔ And `adapt-plan`'s relayout gate fires **only at 2 or 3**, so a Q-088 freq-4 week is never relaid out — silently |
| **X7** | **where upper goes** | C treats `day_after_long` as a **semantic role** — upper belongs after the long run. B treats upper as filler that stacks onto endurance days. A treats it as a spacing problem only. Three different theories of the same session |
| **X8** | **the rest day** | B guarantees exactly one (`MAX_ACTIVE_DAYS = 6`). A derives `7 − training_days` and **does not enforce it** (Q-206). C at freq ≥ 4 *deliberately consumes* rest days (`allowNonRunDays`). D fixes it to Saturday |
| **X9** | **tie-breaking** | Four different answers. B: spread desc → `dayIndex`. A: fixed vectors `[mon,thu,tue,fri,wed,sun,sat]`. C: `distLong + 0.8·distQuality` → Sunday-first ring. D/E: literal. ⚠️ Plus **two week-start conventions** — Mon-first in B and D, Sun-first in A and C |
| **X10** | **the same-day matrix** | A and B read it. ⛔ **C, D and E have never read it.** Three of five deciders have no access to the law at all |

⛔ **X1, X2 and X10 together are the headline: the six run generators place a whole week without ever
seeing the athlete's day preferences OR the law.** That is a larger surface than the strength
placement everyone has been looking at.

### 6b-3 ⛔ THE `place-week` INVENTORY — every arithmetic decision, before the file dies

**Michael, 2026-07-27:** *"`place-week` was corrected against real weeks over months; the spec was
derived. So it holds knowledge the spec never captured… Deleting it while it's still the more
corrected of the two is the one irreversible move in the collapse."*

**Three finds came out opportunistically** — each one surfaced because something broke and pointed at
it. That is not a search, so this is the search: every arithmetic and scoring decision in the file,
each one either **present** in the solver or **rejected with a reason**.

| # | `place-week` decision | status |
|---|---|---|
| 1 | `MIN_STACK_GAP_H = 6` (Robineau) | ✅ present — `stackNeedsRecoveryGap` + the reported gap |
| 2 | `MAX_ACTIVE_DAYS = 6` | ✅ present — `MAX_ACTIVE_DAYS_DEFAULT` |
| 3 | `stacksRequired = pins + lifts − 6` | ✅ present — **gated** in the leaf, not scored *(find 1)* |
| 4 | eligible hosts = matrix-legal | ✅ present, and per-pair rather than per-list |
| 5 | `unresolvable = stacksRequired > min(eligible, upperCount)` | ✅ present — `NO_ROOM` uses the same capacity |
| 6 | `stackGapHours` per pair | ✅ present |
| 7 | stack target sort: **long-day last**, then clearance-hours, then `dayIndex` | ✅ long-day term present *(find 2)*. ⛔ **clearance-hours REJECTED** — that is the day-size proxy that inverted on 2026-07-27 when `long_ride` went to 0h. Day size is stated directly |
| 8 | `requiredClearanceHours` | ✅ present — reads the table directly |
| 9 | `clearanceHours` with week wraparound | ✅ present — `gapDays` |
| 10 | `lowerDayPenalty += (required − actual)` | ✅ present — breach **magnitude** *(find 3)* |
| 11 | lower↔lower `max(0, 48 − gap)` | ✅ present as a **hard** constraint at strict tier, relaxable to a priced breach — stricter than the original, deliberately |
| 12 | lower spread = **`Math.min(...)`**, the closest other heavy day | ⛔ **WAS MISSING — find 4.** The solver summed pair gaps. Summing hides the thing that matters: 24/24/96 sums better than 48/48/48 while containing a back-to-back pair. Identical at two lower days, which is why five sweeps missed it. **Fixed** |
| 13 | upper days ranked by distance from every placed lifting day | ⛔ **WAS MISSING ENTIRELY — find 5.** The solver had **no term for upper placement at all**, so it fell through to the tie-break. **Fixed** |
| 14 | `dayIndex` final tie-break | ✅ superseded — canonical-order vector (§5.1), which is order-independent where `dayIndex` was not |
| 15 | on overflow, reopen all days so lifts may double up | ⛔ **REJECTED.** That is §5.2b — quietly producing a worse week. The solver refuses and names the arithmetic |
| 16 | compromise when no rest day survives | ✅ present |
| 17 | output sorted by day | n/a — presentation |

**THE COUNT, because "systematic" without one is a memory rather than a record — and the delete is
the irreversible step:**

| | |
|---|---|
| **17** | decisions inventoried — the complete set in the file |
| **14** | present in the solver (2 of them added *by* this pass — rows 12 and 13) |
| **2** | rejected with a stated reason (the clearance-hours proxy in row 7; the reopen-all-days overflow in row 15) |
| **1** | presentational, not a decision (row 17) |

✅ **17 = 14 + 2 + 1. Nothing is unaccounted for.** That is what makes the deletion auditable rather
than remembered.

⛔ **THE SYSTEMATIC PASS FOUND TWO MORE (12 and 13), AND NEITHER WOULD HAVE ANNOUNCED ITSELF.**
Find 12 is invisible at two lower days and only appears at three. Find 13 produced legal weeks that
simply wasted the layout — an upper day sitting next to another lift day for no reason. **39 weeks in
the standard sweep change once both are in.** Five earlier sweeps had passed over both.

✅ **The file may be deleted once its callers move.** This table is what it knew.

### 6b-5 ⛔ THE `week-optimizer` INVENTORY — 28 entries

**The largest of the five, and the one carrying a documented production correction.** It held three
things. Same shape as §6b-3: every arithmetic and scoring decision, present or rejected with a reason.

**⛔ THE HEADLINE IS A DOCTRINAL CONFLICT, NOT A NUMBER.** `week-optimizer`'s own relax-tier comment
states its policy when the 48h-vs-long clearance cannot be met:

> *"If the engine can't satisfy 48h vs long, it should **drop a strength session** instead of
> compromising the long-session recovery window."*

That is §5.2b written down as doctrine — **the silent-subtraction class, stated as the intended
behaviour** rather than arrived at by accident. It is REJECTED. D-325 §7 forbids removing a session,
§5.2's menu excludes it, and the solver breaches-and-names instead. Worth knowing that the habit
found in three modules was *policy* in at least one.

| # | decision | status |
|---|---|---|
| 1 | `DAY_INDEX` Sun-first 0-6 | ⛔ rejected — §0b is Monday-first; convert at the boundary |
| 2-4 | balancer weights (HIGH 3 / MOD 2 / LOW 1), thresholds (5 / 1), `MAX_ITER = 48` | ⛔ rejected — the balancer is a **second ranking** after placement (D-325 §5). The solver scores the whole week at once |
| 5-6 | `ADJ_SAME_SPORT_EDGE = 4`, `ADJ_EASY_BIKE_BEFORE_QUALITY_BIKE = 3` | ⛔ rejected with the balancer |
| 7 | `easyRunAnchorAdjacencyPenalty += 4` | ⚠️ out of scope — the solver places lifts, not easy runs |
| 8 | swim spread ≥2 days on the ring | ⚠️ out of scope — same |
| 9 | day-order vectors `[mon,thu,tue,fri,wed,sun,sat]` | ⛔ rejected — enumeration-order preference; §5.1 uses a canonical key |
| 10 | **upper↔lower spacing: 3 days preferred, 2 the floor** | ⛔ **WAS MISSING — find 1.** The solver had spread but no notion of *good enough*, so it traded clearance for separation it did not need. **Fixed** — prices the shortfall below 3. **52 weeks change** |
| 11-16 | `sequentialOk` blocks: post-long HIGH, easy-run-after-long, §4.5 QR-after-QB, §4.7 lower↔leg-quality 24h, sandwich, 48h-never-relaxes | ⚠️ **out of scope, and the reason matters:** these govern *endurance-vs-endurance* placement. The solver receives anchors as immovable inputs and places only lifts. ⛔ **If the solver is ever given endurance to place, these come back** — they are not rejected, they are unreached |
| 17 | `SequentialRelax` 3-tier ladder (strict → one-sided → sandwich) | ⛔ rejected — **magnitude grading subsumes it.** The solver prices breaches by size (§6b-3 find 3), so it prefers the smaller violation without needing named tiers |
| 18-19 | `canPlaceWithModifier`, §6.1.5 consolidated mode | ✅ present — as `MethodologyConstraint` (§4.1a), which requires an owner and a reason |
| 20 | `concurrentSpacingTier` + `emitConcurrentSpacingTradeOff` | ✅ present — `compromises[]` |
| 21 | `lowerBodyBlockedDays` | ⛔ **rejected, and it is §0c's error in a second module** — a `Set<DayName>` of forbidden days. Superseded by per-pair adjacency |
| 22 | **`biasOrderForPreferredDay`** | ⛔ **WAS MISSING — find 2.** §4.2 exists in this spec and the solver implemented **none of it**, so a stated preference was worth exactly zero. **Fixed** — scored, and it can never break a clearance or make a solvable week unsolvable (both swept) |
| 23 | rest-day claim: empty days, then displace LOW-only | ⚠️ partial — the shortfall term is present; **displacing a placed session is rejected** (§5.2b) |
| 24 | balancer relocatable kinds | ⛔ rejected with the balancer |
| 25 | `deriveOptimalWeekWithCoEqualRecovery` — retry at 1× strength | ⛔ rejected — §0a #4, lift count is fixed and is not a relaxation |
| 26 | `validatePreferredDays` | ⚠️ boundary concern, not solver |
| 27 | `strength_frequency: 1\|2\|3` type | ⛔ rejected — the ceiling that made `place-week` necessary. The solver takes any count |
| 28 | **"drop a strength session rather than breach 48h"** | ⛔ **REJECTED — see the headline above** |

**THE COUNT:** **28** = **3 present** + **13 rejected with a stated reason** + **8 out of scope
(endurance placement / boundary)** + **2 fixed by this pass (finds 1 and 2)** + **2 partial with the
adopted half named**.

⚠️ **THE RATIO INVERTED EXACTLY AS PREDICTED (§6b-3a).** `place-week` came out 14-present /
2-rejected because it reads the law. `week-optimizer` comes out 3-present / 13-rejected because most
of its arithmetic is a *second ranking* built beside the law rather than from it. **That is the
finding, not a failure** — and it is the clearest evidence yet for why the collapse is worth doing.

⛔ **THE 8 OUT-OF-SCOPE ENTRIES ARE THE REAL DEBT.** They are the endurance-placement rules, and the
solver does not have them because it does not place endurance. **The day it does, this table is the
starting list** — do not re-derive them.

### 6b-6 ⛔ THE REVERSE INVENTORY — the spec against the SOLVER

**Michael, 2026-07-27:** *"§4.2 has been in the spec since it was written, and the solver scored it at
zero — found only because a module you were inventorying happened to implement it… If a stated
preference could be worth zero without anyone noticing, so could a stated constraint."*

⛔ **EVERY INVENTORY SO FAR POINTED AT THE OLD CODE. THIS ONE POINTS AT THE NEW.** Each spec section
is either a **named term in the solver** or an **explicit absence with a reason**.

| § | requirement | in the solver |
|---|---|---|
| 0a #1-3 | anchors immovable | ✅ type-level — no code path relocates one |
| 0a #4 | four lifting **days** | ✅ one lift per day, enforced in the candidate loop |
| 0a #5 | the clearance law | ✅ `requiredAdjacencyHours`, per pair |
| 0a.1 | days per week is an output | ✅ no `days_per_week` input exists |
| 0a.2 | priced on the load it adds | ⚠️ **absent with reason** — governs session *content* (descents, strides), not placement. Lives in the composer |
| 0b | Monday-first | ✅ `SOLVER_DAYS` |
| 0c | currency: hours, never forbidden days | ✅ `adjacencyBreach` per candidate day, per kind. No day-set exists in the file |
| 1 | anchors first | ✅ anchors placed before enumeration |
| 2.1 | eccentric ratings | ✅ carried by the adjacency table (48h vs 24h vs 0h) |
| 2.2 | **hard day beside the long run is THE REAL CONFLICT** | ⛔ **WAS ABSENT — reverse find B.** The shape term counted every adjacent anchor pair as +1, so the eccentric pair priced the same as an easy swim beside a long ride. **Fixed** — the pair is looked up in `adjacencyPenaltyReason`, which is the law's own list of expensive orders and had only ever been consulted anchor→lift |
| 2.3 | anchors do not yield to each other | ✅ `SOLVER_GRIDLOCK_ANCHOR_COLLISION`, both named, no winner picked |
| 3 | budgets are ceilings, never adjacency inputs | ✅ no budget term participates in filtering |
| 4.1 | a stacked day is ONE BUCKET, **ORDERED** | ⛔ **WAS ABSENT — reverse find A.** The solver emitted the pairing and never said which came first. Eddens is *why the stack is safe*; a stack with no stated order discards the finding at the output boundary. **Fixed** — `stackedWith.order: 'lift_first'` |
| 4.1a | methodology constraints owned | ✅ `MethodologyConstraint` requires owner + reason |
| 4.2 | preferred days scored, not hard | ✅ **added by the `week-optimizer` inventory** — it was worth zero before |
| 5 line 1 | rest days | ✅ `restShortfall` |
| 5 line 2 | primary lifts protected | ✅ breach magnitude |
| 5 line 3 | spread past the minimum | ✅ tightest-pair, plus the 3-day floor |
| 5 line 4 | **quality on clean legs** | ⛔ **same gap as 2.2** — now scored |
| 5 line 5 | week shape | ✅ `shapePenalty` |
| 5 line 6 | preferred days | ✅ |
| 5 line 7 | budgets | ⚠️ **absent with reason** — hours and miles are the caller's; the solver's only budget is `MAX_ACTIVE_DAYS` |
| 5.1 | determinism + canonical tie-break | ✅ canonical order, swept, shuffle-tested |
| 5.2 | the relaxation menu, in order | ✅ two tiers, dropping a session absent by construction |
| 5.2a | typed refusal, options, binding anchors | ✅ three codes |
| 5.2b | never subtract | ✅ swept — no refusal offers to drop anything |
| 6c | compromises in the output type | ✅ `status: 'compromised'` |
| 8.1 | the stacking table | ✅ read via `SAME_DAY_COMPATIBLE` |
| 8.2 | the adjacency table | ✅ read via `requiredAdjacencyHours` |
| 8.2a | day before the long run | ✅ falls out of the table — upper free, heavy legs 48h |

**COUNT: 30 requirements — 26 present, 2 absent with a stated reason, 2 found absent and fixed.**

⛔ **BOTH REVERSE FINDS WERE OUTPUT-BOUNDARY LOSSES, WHICH IS THE PATTERN WORTH KEEPING.** Neither was
a wrong rule. In both cases the solver computed the right week and then **failed to say something the
spec required it to say** — the stack order, and which anchor pair was expensive. A spec section can
be silently worth zero when it describes what the answer must *carry* rather than how it is *found*.

### 6b-3a ⛔ EVERY REMAINING MODULE GETS AN INVENTORY BEFORE IT DIES. NOT JUST THIS ONE.

**The reason the `place-week` pass paid off twice is a property, not luck.** That file was
**corrected against real weeks over months**; this spec was **derived**. Corrected code holds
knowledge derived code never captured, and the only way to get it out is to enumerate.

⛔ **`week-optimizer` HAS THE SAME PROPERTY, AND THERE IS DOCUMENTED PROOF.** The May 2026 24h-pre
relaxation (§4.21) is a deliberate production correction with a written rationale — someone found a
real week it got wrong and fixed it with a reason attached. **A module that carries that kind of scar
is exactly the kind that holds unwritten knowledge**, and deleting it opportunistically repeats the
mistake the systematic pass just caught twice in one file.

**So, as a standing requirement for the rest of the collapse:**

| module | inventory |
|---|---|
| `place-week` | ✅ done — §6b-3, 17 entries, 14 present / 2 rejected / 1 n/a |
| `week-optimizer` | ✅ done — §6b-5, 28 entries, ratio inverted (3 present / 13 rejected), 2 finds |
| `placement/` surviving parts | ⛔ required — and note §6b-2: presumed over-broad, so expect more rejections than adoptions |
| `base-generator` | ⛔ required — a fixed grid still encodes decisions about what a run week looks like. ⚠️ **AND STEP 3 IS TWO JOBS, NOT ONE** — see below |
| `tri-generator` | ⛔ required |

⛔ **STEP 3 IS HALF UPSTREAM WORK, AND SCOPING IT AS SOLVER WORK WILL MAKE IT LOOK LIKE A SOLVER
FAILURE.** The solver takes anchors as **immovable inputs** — it cannot honour a pin the caller never
passes it. `base-generator`'s defect is that `schedule_preferences.long_run_day` is declared at
`generate-run-plan/types.ts:264` and **read nowhere in that function**. That is upstream of placement
entirely.

**So the tripwire goes green only when BOTH halves land:** the caller reads the athlete's preference
and passes it as an anchor, *and* the solver places the week around it. Scope both, or step 3 reads
as the solver failing at something it was never given.

⚠️ **Expect the ratio to differ per module and do not read that as failure.** `place-week` came out
14-present / 2-rejected because it reads the law. `placement/` will come out the other way round
because it does not. **A rejection with a stated reason is as much a completed inventory entry as an
adoption** — the point is that nothing leaves unexamined.

### 6b-4 The objective function: SUM, and it was tested rather than inherited

**Question (Michael, 2026-07-27):** total breach is linear and physiology is not — one pair 24h short
is plausibly worse than two pairs 12h short, so is minimising the *worst* breach right?

**Tested, not argued.** Worst-breach-first was implemented alongside sum-first and both were run
across the full load × arrangement sweep. **Zero weeks differ.** Multi-breach weeks do exist (14 of
84 compromised), but no reachable week offers a choice between one deep breach and two shallow ones
at equal sum — clearances come in 24h steps on a 7-day grid, so the trade the objective would arbitrate
never arises.

✅ **Decision: keep the sum.** Not because linear is right in principle — **because nothing
distinguishes them, and the simpler arithmetic wins a tie.**

⛔ **THE CONDITION, WHICH MATTERS MORE THAN THE CONCLUSION.** Sum and worst-breach are
indistinguishable **because clearances are 24h steps on a 7-day grid.** Every breach is therefore a
multiple of 24, and no arrangement offers one-deep-against-two-shallow at equal sum. **That is
structural, not permanent.**

⚠️ **THE DECISION REOPENS THE MOMENT GRANULARITY GOES SUB-DAY** — an AM/PM split modelled as real
hours, a 6h stack gap priced as adjacency rather than same-day, or any clearance that is not a
multiple of 24. At that point breaches stop landing on a coarse lattice, the trade appears, and the
harm curve's shape starts to matter. The comparison harness is in commit `a76d10b9`; re-run it
before assuming the answer still holds.

### 6b-2 ⛔ `placement/` IS PRESUMED OVER-BROAD. Nothing from it is inherited unchecked.

**Two independent constraints. Two different axes. The same error.**

| constraint | axis | the law says | it says |
|---|---|---|---|
| `excludeDayBeforeLong` | long run | upper is free; heavy legs need 48h | **no strength at all**, day before |
| `lowerBufferQuality` | quality | 24h — which an adjacent day satisfies | **no heavy legs**, day before |

⛔ **That is a REASONING PATTERN, not two bugs.** The module converts "there is a constraint near this
day" into "forbid the day," without asking the two questions the law asks: *which session* (upper
shares no prime movers) and *how much* (24h is already met by being a day apart). Both were written
before the adjacency table existed, so there was nothing to ask — but that explains the error, it
does not bound it.

**Therefore, as a standing rule for the collapse:**

1. **No rule from `placement/` is carried into the solver without being checked against §8.2 first.**
   Not spot-checked — checked. The two found so far were found by two different accidents.
2. **Assume a third instance exists.** Two-for-two on the constraints anyone happened to look at is
   not a sample that suggests the rest are fine.
3. ⚠️ **The tell to search for:** anywhere the module builds a `forbidden` set of DAYS. The law never
   forbids a day; it states hours between two named sessions. A set of forbidden weekdays is the
   translation step where "which session" and "how much" both get discarded.

✅ **THE TELL WORKED IMMEDIATELY. Third instance, found by applying it:**
`strength-slot-resolver.ts:77 buildEasyDays` drops **the long-run day and every quality day** from the
candidate pool — for *all* strength, upper included:

```ts
if (d === long) continue;
if (qual.has(d)) continue;
```

Against the matrix: `lower_body_strength × quality_run` is ✗, so excluding quality days for **lower**
is right. But `upper_body_strength × quality_run` is ✓, and `upper_body_strength × long_run` is ✓ as
of 2026-07-27. **Both exclusions are correct for heavy legs and over-broad for pressing** — the same
"which session" question, discarded for the third time, in the third function.

⚠️ Note `getDanielsStrategy` stamps quality days `'none'` deliberately and says why — *"a hard
polarisation rule, not masking a failed resolve."* That one is a stated intent and survives scrutiny.
`buildEasyDays` applies the same exclusion to **Higdon as well**, where nothing states it. **Three
instances, one pattern; assume it is the module's default move rather than an exception.**

✅ **What they agree on, and it is worth stating** — every module keeps the long run and the long ride
apart from heavy legs in *some* form, and every module reserves *some* rest. The disagreements are
about how much and measured how, never about whether.

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
