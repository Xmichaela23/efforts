# PLAN — VIADA OWNS THE ENGINE, WENDLER GOES IN THE CLOSET

**Written 2026-08-29. Supersedes the build half of `WORKORDER-viada-owns-the-engine-2026-08-29.md`,
which was written before the book was fully read.**

**Michael's ruling, 2026-08-29:** *"viada — archive wendler, maybe I pull it out of the closet for a
whole different thing but it shouldn't be in the way or referenced for anything right now."* And:
*"I don't want to own anything"* — **every rule below is page-cited or explicitly marked OURS.**

⛔ **THE BOOK IS FULLY READ.** `SOURCE-viada-hybrid-athlete.md` Parts I and J close it: pp.110–112
(the progression section), pp.153–179, pp.180–217 and the sixteen Ch.10 programs are all accounted
for. **There is nothing left to find.** The *"circle of reps"* and *"threshold adjustment method"*
that p112 points at **do not exist in the book** — promised coverage that did not survive editing.
**p112 plus p218 is the entire loading mechanism.**

---

## 0. WHAT IS ACTUALLY TRUE TODAY (traced 2026-08-29, not remembered)

**There are two complete strength systems in this repo, side by side.**

| | Wendler | Viada |
|---|---|---|
| Lives in | `shared/strength-system/` | `_shared/standing-plan/` |
| Loading | `loading/wendler-531.ts` | `working-number.ts`, `progression.ts` |
| The number | `plans.config.training_max`, 85–90% of a true max | the working number, 96% of a **predicted** max |
| Built by | `create-goal-and-materialize-plan` | `generate-strength-plan` |
| Recomputed by | `rematerialize-strength-block` | `rematerialize-standing-block` |
| Surface | Get Stronger | **Strong Focus / the Standing Plan** |

⚠️ **The logger asks BOTH to rematerialize and each refuses the other's block**
(`StrengthLogger.tsx:4465–4466`). That is how they coexist without colliding today.

⛔ **Strong Focus already generates a mostly-Viada week.** Verified against a real 12-week output
2026-08-29. What already matches the book: week 1 as the test week · the five-day shape (ME upper,
ME lower, plyo, DE upper, DE lower) · ME at 1–5 reps · DE at 2–4 reps × 4 sets · HYP at 6–12 ·
**squat and deadlift alternating the ME slot weekly (p247)** · the working number drifting ~5 lb
across twelve weeks, which is about p245's 1% every three weeks.

⛔ **SO THIS IS NOT A REBUILD. It is five corrections and one extraction.**

---

## 1. THE LAW — every loading rule, with its page

⚠️ **Nothing in this table is inferred. Where the book is silent it says so, and §6 lists what is
ours.**

### 1a. The number

| Rule | Page |
|---|---|
| Working max = **96% of the predicted true 1RM** | p214 |
| Predicted from a **5-rep max test**, *"a 5- to 6-rep max seems to allow for the best combination of reliability and precision"* | p214 |
| A **1-rep test is guesswork**, a 3-rep is *"better but still subject to daily fluctuations"* | p214 |
| **Epley and Brzycki averaged**, because they diverge as reps change | p215 |
| Pretest steps: warm up to **75% of the predicted max, 6 reps** — *"a weight where you can comfortably perform 8 repetitions but are approaching failure if you had to push to 10"* | p215 |
| Then **A + 0.1A** for 5 reps, then **A + 0.1A + 0.05A** for max reps, where A = the 75% weight | p215 |
| Worked example: 225 true max → 165 / 180 × 5 / 190 × max → 6 reps → Epley 227.9, Brzycki 220.6 → avg 224.25 → **×0.96 = 215 training max** | p215 |
| A hybrid athlete's working max may sit a **double-digit percentage below** their true max | p163 |

⛔ **THE FRACTIONS, COMPUTED FROM HIS OWN STEPS:** A = 0.75P · second step = 1.1A = **0.825P** ·
measured step = 1.15A = **0.8625P**. ⚠️ **The code has `0.75 / 0.85 / 0.90` and the measured step is
taken as a near-single.** Both the fraction and the rep target are wrong — see §2, stage 1.

### 1b. The four intents (the lifting key)

| Intent | Reps | % | Effort | Sets | Page |
|---|---|---|---|---|---|
| **ME** | 1–5 | 90–100 | ⛔ **no RIR target** | 1–3 | p218 |
| **DE** | 2–4 | 70–80 | maximum velocity (3–4 RIR) | 4–6 | p218 |
| **SKILL** | 3–5 | 75–85 | controlled eccentric, fast concentric (3–4 RIR) | 3–5 | p218 |
| **HYP** | 6–12 | — | controlled both ways (0–2 RIR) | 3–4 | p218 |

⛔ **SETS ARE A SECOND PROGRESSION LEVER, AND IT IS EVIDENCE-GATED:** *"Sets should always remain on
the lower end when starting a program, **increasing only if an athlete is finding that they are
progressing well and seem to have recovery to spare!**"* (p218). **The engine has no set-progression
rule at all today.**

### 1c. When the weight moves

| Rule | Page |
|---|---|
| Raise on **lower RPE than intended**, or **consistently superior performance *at* the target RPE** | p112 |
| **Lower it** if you fail to achieve targets at any point | p112 |
| A load holds for **several weeks at a time** with minor session-to-session adjustment | p112 |
| The max moves **"up a pound or two"** — after the rotation, not on a schedule | p112 |
| **~1% every 3 weeks** (*"every 3 to 4 weeks, assume 1 percent every 3 weeks as a starting point"*) | p245, p247 |
| *"1% every four weeks or so"* — same band, different emphasis | p251 |
| Follow this **indefinitely** | p112 |
| ⛔ *"Be a little better every week"* is **a trap** | p112 |
| Progressive overload does **not** mean sessions get gradually harder | p111 |
| A week may **decrease** and still progress, if it still overloads | p111 |

⚠️ **1% of 225 lb ≈ 2.25 lb, which is p112's "a pound or two" reached independently.** Two chapters,
same number. **Treat the max as a ledger that drifts unrounded; only the prescription rounds to
loadable weight.**

### 1d. The endurance haircut on the working max

| Rule | Page |
|---|---|
| *"a **3 to 4 percent reduction in working 1RM** should be assumed"* for the ME lower session, because of the run the day before | p247 |
| Phased out over **eight to ten weeks** — *"increasing lower body estimated 1RM by about **2 percent every three weeks for the first nine weeks**"* | p247 |
| Conditional: *"as long as progression is maintained week to week and month to month"* | p247 |
| Cycling: *"**proactively lower your working max by a few more percentage points than usual**"* | p280 |

⛔ **This is a second, transient rate living under §1c's.** Lower body only. An engine with one
global drift is wrong for the first nine weeks.

### 1e. The light week

⛔ **IT IS A SUBSTITUTION, NOT A LIGHTER VERSION OF THE SAME WEEK.** Every Ch.10 program's table
carries a TAPER/DELOAD column: **every ME slot becomes SKILL or DE**, volume comes off, endurance
drops a level and two days lose it (p246/p274, Parts E and E1).

**When to switch — every stated cadence names a cause, never a calendar:**

| Trigger | Page |
|---|---|
| ⛔ **ME lifts underperform 2 weeks in a row** → one deload week | p245 |
| A meet or 5K approaching → switch **2 weeks out** | p247 |
| **4–5 weeks out from a meet**, run the deload running portion (unless a race is within 6 weeks) | p251 |
| Preseason: every 3–4 weeks. In season: **every other week** | p249 |
| Significant fatigue → *"don't hesitate to run **several weeks of deload in a row**"* | p263 |
| Deloads *"can be taken fairly frequently"*, and should keep active recovery in them | p265 |
| Race: **3 weeks out and 2 weeks out**; if the cycle is under 8 weeks, one at 2 weeks out | p269 |
| Competition: the deload version for **up to 4 weeks** | p283 |
| ⛔ Overreach-to-deload is **rejected** for hybrid athletes | p120 |

⛔ **NO PROGRAM DELOADS ON A FIXED CALENDAR FOR ITS OWN SAKE. The 4-and-8 deloads in our engine are
Wendler's and have no counterpart in this book.**

### 1f. What rotates

| Rule | Page |
|---|---|
| The **ME lift rotates weekly** — one week ME squat + DE deadlift, the next the reverse | p247 |
| The same alternation stated generally: weekly emphasis *"squat/knee bend"* vs *"deadlift/hip hinge"* | p163 |
| *"Consider switching the ME upper and lower days"* if the lower day is suffering from the fast run | p251 |
| Press day: same movement for ME and skill most weeks, *"but this may rotate week to week"* | p263 |
| Primary movements rotate **sparingly** — higher background fatigue means slower skill acquisition | p247 |

⚠️ **All four describe WHICH LIFT holds the heavy slot. None describes what percentage is on the
bar.** See §6.

### 1g. Progression is a per-plan property

⛔ **Seven of the eighteen programs explicitly do not chase the 1RM:** p249 (*"increases in 1RM …
may not be necessary"*), p259 (*"little need for significant overload"*), p265, p271, p277, p255,
p261. **A builder that always ratchets is wrong for seven of eighteen.**

---

## 2. THE BUILD — five corrections, in dependency order

⚠️ **Each stage: one session, one commit, verified by fixtures before it lands.** Per Michael's
standing rule, verify with deno fixtures rather than prod, and keep each bug case as a permanent
regression.

### STAGE 1 — THE TEST SET. Do this first; every other number depends on it.

**What is wrong.** `working-number.ts` `PRETEST_STEPS` = `0.75/6`, `0.85/5`, `0.90/max`. Strong
Focus renders the last step as a near-single (`135×1+`).

**What the page says.** Second step **0.825**, measured step **0.8625**, and the measured step is a
**max-rep set expected to land at 5–6 reps** (p214: that range *"allows for the best combination of
reliability and precision"*; p215's own worked example produces **6 reps**).

**Why it matters.** A single at 90% is Wendler's AMRAP shape. It returns fewer reps, a wider error
band, and **the whole twelve weeks is computed from that one set.**

**Done when:** the fractions are the page's, the measured step reads as a max-rep set, the p215
worked example (225 → 165/180×5/190×6 → 224.25 → 215) passes as a fixture, and the rendered plan
shows a rep-range prompt rather than `1+`.

### STAGE 2 — THE LIGHT WEEK. The largest gap: it never fires.

**What is wrong.** A real 12-week Strong Focus output contains **no deload week at all**. The
taper/deload column exists in the frames and is never selected. Because the light week is where
SKILL lives, the 75–85% band never appears either. **One cause, two symptoms.**

**What to build.**
1. **The substitution** (§1e): every ME slot becomes SKILL or DE, volume off, endurance down a level.
2. **The trigger** (p245): **ME lifts underperform two weeks running → one deload week.**
3. **The event switch** (p247, p269): a meet or race inside the block switches the taper column on at
   the stated distance out.
4. ⛔ **Delete the 4-and-8 calendar deloads.** They are Wendler's (§1e).

**Done when:** a fixture where the ME lift misses twice consecutively produces a deload week, a
fixture with a race 2 weeks out produces one, and a clean fixture over 12 weeks produces **none**.

### STAGE 3 — THE HEAVY DAY'S CONTRACT.

**What is wrong.** Strong Focus tells the athlete *"End the set when your form goes or you still have
1 or 2 reps left"* on the **Heavy** day. **p218 gives ME no RIR target.** The instrument that reads
the heavy slot is the all-out set; a 1–2 RIR instruction contradicts it and corrupts the evidence
Stage 4 needs.

**Done when:** ME carries no RIR target in copy or prescription, and DE/SKILL/HYP carry theirs from
§1b (3–4, 3–4, 0–2).

### STAGE 4 — PROGRESSION ON EVIDENCE.

**Build §1c literally.**
- Raise when targets are met at **lower effort than prescribed**, or beaten **at** the target effort.
- **Lower when targets are missed.** Both directions, or it is not his rule.
- Rate: **~1% every 3 weeks**, unrounded on the ledger.
- ⛔ **The max is a ledger, not a plate.** It drifts by ~2 lb; the bar steps 5 lb only when accumulated
  drift crosses a boundary. Arithmetic, never a scheduled jump.
- ⚠️ **RPE vs RIR:** p112 says RPE, p218 prescribes RIR, and ME has no RIR target. **The mapping
  between them is OURS** (§6) — do not convert silently.

**Then §1d, the haircut:** lower-body working max opens **3–4% down** and climbs at **2% every three
weeks for the first nine weeks**, conditional on progression holding.

**Then §1b's set lever:** sets open at the **bottom** of each band and increase **only** on
demonstrated progress plus spare recovery.

**Done when:** a fixture that meets targets easily raises the ledger ~1%/3wk and steps the bar at the
right week; a fixture that misses lowers it; a lower-body fixture opens 3–4% down and converges by
week nine.

### STAGE 5 — THE PER-PLAN SWITCH (§1g).

A plan declares whether it chases the 1RM. Seven of his eighteen do not. **Small, and it stops Stage
4 from being wrong everywhere it does not belong.**

---

## 3. THE EXTRACTION — Wendler to the closet

⛔ **LAST, AND BY TRACE, NOT BY MEMORY.** The workorder's *"221 files"* counts every passing mention
in a comment. **The real wiring is ten import sites, traced 2026-08-29.**

**Three sit inside `shared/strength-system/` and travel with it** — no separate work:
`loading/calibration.ts:41` · `loading/cycle-verdicts.ts:25` · `strength-primary-plan.ts:94` ·
`amrap-catch-up.ts:41`.

**These reach in from outside and must each be resolved before anything is archived:**

| Site | What it takes | Resolution |
|---|---|---|
| `create-goal-and-materialize-plan/index.ts:13` | `workingNumberForCycles` | Get Stronger's build path — dies with Get Stronger (§4) |
| `rematerialize-strength-block/index.ts:44` | the Wendler recompute | same |
| `generate-strength-plan/index.ts:75` | `trustedMaxRepsFor` | ⛔ **decide against a page** — see below |
| `_shared/strength/all-out-set.ts:25` | `trustedMaxRepsFor` | same decision |
| `_shared/response-model/weekly.ts:42` | `verdictFrom95Set` | ⚠️ **general machinery, not Get Stronger.** Needs a Viada-side verdict or the caller stops needing one |
| `_shared/block-identity.ts:63` | block identity | ⚠️ same — general, must not die with Wendler |

⛔ **`trustedMaxRepsFor` IS NOT VIADA'S.** It caps the deadlift at 5 reps and everything else at 8,
cited to **LeSuer et al. 1997** and carried in `wendler-531.ts`. **p214–215 give ONE protocol for the
working max with no per-lift variation**, and his answer to formula divergence is **the average**,
not a cap. ⚠️ **This is why the deadlift card behaves differently from the other three.** Decide it
against p214/p215, and if the cap survives it survives as **OURS**, labelled, not as a Wendler
inheritance.

**Order:** resolve all six outside sites → confirm zero non-test imports remain → **then** move
`shared/strength-system/loading/` (and whatever else is Wendler-only) to `archive/`. **Nothing is
deleted; nothing points at it.**

---

## 4. THE ONE OPEN DECISION — Get Stronger

⛔ **Get Stronger IS the Wendler plan.** 5/3/1 is not something it uses; it is what it is. So:

- **(A) Get Stronger goes into the closet with Wendler.** The Standing Plan becomes the only strength
  plan. Fewest moving parts, and it is what *"shouldn't be in the way or referenced for anything"*
  implies.
- **(B) Get Stronger stays and moves onto the Viada engine.** But then it is the Viada plan wearing a
  different name, and the two build paths still have to be maintained.

⚠️ **Michael has not answered this. Stage 3 of the extraction cannot start until he does.**
**Recommendation: (A).** Nothing is live, there are no external users, and the code is archived not
deleted.

---

## 5. WHAT IS ALREADY RIGHT — do not touch it

Verified against a real Strong Focus output 2026-08-29:

- Week 1 as the test week — **p275/p247's own advice to pretest before a program**
- The five-day shape: ME upper · ME lower · plyo · DE upper · DE lower (p246)
- ME 1–5 reps, DE 2–4 × 4 sets, HYP 6–12 (p218) — and **DE opening at 4 sets is the bottom of his
  4–6 band, which is p218's "start on the lower end"**
- Squat and deadlift alternating the ME slot weekly (p247)
- Plyometrics as a standalone day, stopped on movement quality not rep count (pp.87–89)
- The working number drifting ~5 lb across twelve weeks (≈ p245's 1%/3wk)

---

## 6. WHAT IS OURS — label it, do not launder it

⚠️ **Three things the book does not settle. Each ships as `_IS_OURS` with this file cited, or it does
not ship.**

1. **Where 80% lands in the rep band.** p218 gives 3–5 reps across 75–85%. The ends are his; splitting
   the middle at 4 is ours.
2. **Whether the four lifts ride one clock or four.** p112's rotation is described for *"an
   athlete"*; p247/p163's rotation is about which lift is heavy, not what percentage is on it.
   **Nothing in the book answers this.**
3. **The RPE↔RIR mapping.** p112 gates progression on RPE; p218 prescribes RIR and gives ME no RIR
   target at all. Any bridge between them is ours.

⚠️ **And one that may become ours:** `trustedMaxRepsFor`'s per-lift rep ceiling (§3).

---

## 7. WHAT THE BOOK SIMPLY DOES NOT CONTAIN

**Recorded so no future session spends another day looking.**

- ⛔ **"The circle of reps."** p112 and p247 name it and point at Part 2. **It is not in the book.**
  Part G #9 and Part J close this. Do not build a mechanism from the name.
- ⛔ **"The threshold adjustment method."** Same sentence, same absence.
- **Block length.** 12 weeks is our default. p112's only stated duration is *"indefinitely."*
- **A deload cadence for its own sake.** §1e — every cadence he gives names a cause.

---

## 8. ⛔ THE POINT: VIADA IS THE SUBSTRATE, NOT A STRENGTH PLAN

**Michael, 2026-08-29:** *"this will be the baseline we probably build most programs off of, so the
scaffolding should map into All Rounder and tri builds and cycling and running builds… point is
viada drives the app."*

⛔ **THIS IS ALREADY THE ARCHITECTURE, AND IT IS BUILT.** Traced 2026-08-29 — recording it here so no
future session re-derives it:

| Piece | State |
|---|---|
| `frame-resolver.ts` — which of his programs this athlete's position asks for | ✅ built; refuses out loud with a reason |
| `sport-slots.ts` — **a slot is a SESSION TYPE and the sport is assigned into it** | ✅ built (pivot §2, on p275's permission for any power-metered non-impact modality and for a ride standing in for the long run) |
| `compose.ts`, `week-ledger.ts`, `volume-bounds.ts`, `accessory-picks.ts`, `plyo.ts` | ✅ built |
| `frames.ts` — the program tables themselves | ⚠️ **ONE ENTRY: `strength_5k` (p246).** Seventeen frames-in-waiting |

⛔ **SO THE MACHINERY IS DONE AND THE FRAMES ARE DATA.** A cyclist today gets `strength_5k`'s
skeleton with every slot assigned to the bike — deliberately, because Michael ruled *"if wendler has
a future at all it's not in this path"*, and a runner-shaped week full of rides beats falling through
to a plan being retired. **That is a stopgap the resolver names in its own header, not the design.**

⛔ **ADDING A FRAME IS TRANSCRIBING A TABLE, NOT BUILDING AN ENGINE.** All eighteen programs are
photographed (Part E0). Cheapest order, by what is already transcribed and what supersedes the
stopgap:

| | Frame | Pages | Why this order |
|---|---|---|---|
| 1 | **The All Rounder** | p274/p275 | ⭐ the year-round home base, and **its table is already transcribed** (Part E) |
| 2 | **Cycling: Base** | p278/p280 | ⛔ **supersedes the cyclist stopgap the resolver apologises for.** p280 also carries the cycling working-max haircut (§1d) |
| 3 | The Runner: Pivot | p258/p259 | pure running; lifting entirely supportive |
| 4 | Cycling: Fondo / Crit | p279, p281 / p280 | Crit is **DE secondary movements only** |
| 5 | Strength + Sprint Tri, then Ironman | p268/p269, p270/pp.271–272 | tri, once the single-sport frames are proven |

⚠️ **AND THE FRAMES CARRY THEIR OWN TRANSITION GRAPH.** Programs name their successors (Part E0):
Crit → Cycling + Base for 4–6 weeks → Base's taper before a meet; the All Rounder → The Runner about
a month out from a race. **That graph is the pivot machinery, already stated on his pages — do not
invent a transition model.**

⚠️ **§1g APPLIES PER FRAME.** Seven of the eighteen do not chase the 1RM. **The per-plan switch
(Stage 5) is what makes a frame roster safe** — without it, Stage 4's progression is wrong the moment
a second frame lands.

---

## 9. SEQUENCE

| | Stage | Blocked by |
|---|---|---|
| 1 | The test set (§2.1) | nothing — **start here** |
| 2 | The light week + delete the 4/8 deloads (§2.2) | stage 1 |
| 3 | The heavy day's contract (§2.3) | nothing; can run parallel to 2 |
| 4 | Progression on evidence + the haircut + the set lever (§2.4) | stages 1–3 |
| 5 | The per-plan progression switch (§2.5) | stage 4 |
| 6 | Resolve the six outside Wendler call sites (§3) | **§4 answered** |
| 7 | Archive `shared/strength-system/loading/` (§3) | stage 6, zero imports proven |

⚠️ **Nothing in stages 1–5 touches Wendler. Nothing in 6–7 changes a training rule.** That separation
is deliberate: a loading bug and an extraction bug must never land in the same commit.
