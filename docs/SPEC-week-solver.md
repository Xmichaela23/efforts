# SPEC — The Week Solver

**Status:** spec. Not built. Replaces the placement half of `place-week.ts`, which filters and takes
the first legal answer.
**Author:** Michael + Claude, 2026-07-27.
**Companion:** `DOCTRINE-aerobic-maintenance.md` (what the block is for), `D-325` (costs and ceilings).

> **Michael, 2026-07-27:** *"LLMs cannot problem-solve a training schedule and ever get it right, so
> let's lock in the rules."* This document is that lock. Nothing in the engine may place a session by
> reasoning about it; it places sessions by running the rules below.

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

### 2.3 Precedence when anchors collide

**By eccentric cost, highest first: hard day > long run > long ride.** The most expensive anchor keeps
its day; the cheaper one moves and the move is stated.

⚠️ **Or user-declared.** A club night is not a preference — other people own it. See §4.

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
5. **Preferred days honoured**
6. **Budgets respected** — hours, miles, session counts

⚠️ **A shortfall on any of these is REPORTED, never absorbed.** `place-week` already emits
`compromises[]` and its contract says they must never be silently swallowed.

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

⚠️ **The gate has no recorded reason.** It arrived in `0057400c` (2026-03-30) in the same commit that
created relayout, with nothing in the message about the frequency choice — and the four-day develop
arc did not exist then. **Treat it as UNEXPLAINED, not leftover, until four-day relayout is confirmed
safe.** If a real constraint sits behind it, the solver inherits it.

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
solve(anchors, lifts, budgets) → { week, compromises: string[] }
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

0. ⛔ **COLLAPSE THE THREE AUTHORITIES** (§6b) — this is the point of the whole document. Everything
   below is wasted if three engines still decide placement afterwards.
1. **Anchor conflict detection** (§2) — it is upstream of everything and does not exist at all today
2. **Eccentric ratings per session and per anchor** (§2.1, §3)
3. **The scorer** (§5) — filter already exists in `place-week`; the ranking is what is missing
4. **`canSplitDay` in the intake** (§4.1) — one question, and the field is already there waiting
5. **Preferred days from hard to scored** (§4.2)

6. **Point relayout at the solver** — its trigger and idempotency guard survive; only the engine
   behind them changes (§6b).
7. **Then** the banner and the telemetry, which need §6c's compromise list to say anything true.

⚠️ **Nothing here is built. `place-week` today does §5 step 1 and 2 and stops.**
⛔ **And the largest single risk is that `placement/` runs at plan CREATION for every run plan, not
just at relayout — so collapsing it is a creation-path change with a real blast radius.**
