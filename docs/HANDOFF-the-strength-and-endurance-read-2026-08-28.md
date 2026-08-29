# HANDOFF — the strength and endurance read
**Written 2026-08-28, end of a long day. Read this first; everything else is depth behind it.**

---

## STATE — THREE WAYS, AND NEVER "SHIPPED"

| | |
|---|---|
| **PUSHED** | `origin/main == f28024b0`. Two builds and six doc commits, one evening. |
| **DEPLOYED** | **8 edge functions**, versions read back from `supabase functions list`, not assumed: `compute-facts` 126 · `compute-snapshot` 143 · `coach` 471 · `workout-detail` 352 · `analyze-cycling-workout` 218 · `generate-strength-plan` 175 · `rematerialize-standing-block` 51 · `materialize-plan` 308. Client confirmed off the SERVED bundle at `efforts.work`, not off the push. Migration `20260828120000_exercise_log_slot_intent.sql` applied by hand in the Supabase SQL editor and confirmed by a `select`. |
| **VERIFIED** | ⛔ **FALSE. On everything.** No human has watched a single card render a number. Michael rebuilds his block Monday 2026-08-31; that is when this is proven or not. |

⚠️ **NOTHING APPEARS UNTIL `compute-snapshot` RUNS ON HIS NEXT INGEST.** Opening the app and seeing the old screen is expected, not a failed deploy.

---

## WHAT THIS ARC WAS FOR

Michael asked what the important metrics are for the State screen, off Viada. The first answer was wrong and the correction is the most useful thing in this file — see **THE THREE MISTAKES** at the bottom before designing anything.

**What Viada would actually watch**, and the app answers roughly one of them:
1. Are you holding the hard sessions — not session counts.
2. Are the two sides eating each other — 6-8 work sets costs the next day little, 14+ costs it for one to three days (p86). **Computed with verdicts, read by nothing.** Not built.
3. Is the same work getting easier — his three signs (p123): heart rate lower at the same pace, reported effort lower, less rest taken on self-led work.
4. Has it been six weeks — his cadence for speeding up the threshold pace and rebuilding off it. Nothing counts it.

---

# BUILT AND DEPLOYED

## 1. `slot_intent` — the app now records what a set was FOR

⛔ **THE CHAIN, TRACED END TO END.** `compose.ts:154` stamps `ME` / `DE` / `SKILL` / `HYP` on every prescribed row → `materialize-plan:2482,2827` preserves it → `StrengthLogger.tsx:2348` copies it onto the logged exercise → `useWorkouts.ts:1055` writes it to `workouts.strength_exercises` → **`compute-facts` (`strength-facts-lib.ts`) now carries it onto `ExerciseFact` and into `exercise_log.slot_intent`.** That last hop was the gap; everything before it already worked.

- `slotIntentOf(logged, planned)` — logged row first, planned row as fallback, validated against the four, anything unrecognised stored as absent.
- Also on `workout_facts.strength_facts.exercises[]`, so the two representations of a session cannot disagree.
- ⛔ **The test week's COMPETITION LIFTS are stamped `ME`** — the pretest is a maximal effort, so this describes the row rather than changing it. The floor-filling accessories on those days stay unstamped.
- ⛔ **Get Stronger stamps `HYP` on assistance rows only.** The 5/3/1 main lift is deliberately NOT stamped: a top set is 65-95%, so claiming ME would assert a band that programme does not prescribe, and null-fails-open is correct for the lift 5/3/1 measures.
- `compute-facts` is the only writer of `exercise_log` in the repo, so there is no second path leaving the column null.

## 2. The heavy-only gate

`intentCanMintAMax()` in `state-trend/assemble.ts`. **DE, SKILL and HYP never mint a max. Null, empty or unrecognised also never mint** — Michael ruled fail-closed on 2026-08-28 (*"let's just begin this line fresh… don't let the old lifts drag me down"*).

⛔ **APPLIED AT BOTH READERS** — `liftSeriesFromExerciseLog` (the line, trend, sparkline, summary) **and `buildAllTimeBestByLift`** (the record and its count). See the regression note in **WHAT IS WRONG RIGHT NOW**.

⚠️ **THE TRAP THAT WAS ALREADY SET:** `compute-snapshot:904` maps query rows field by field and would have dropped `slot_intent`, leaving the gate reading `undefined` on every row and never firing. Three places had to change together. **A gate that reads `undefined` does not error — it silently takes the absent branch.** This pattern bit three times in one evening; the note lives on `ExerciseLogLite.slot_intent`'s own doc.

## 3. The four lift cards — `StrengthReadCards.tsx`, `src/lib/strength-read.ts`

Per main lift: the working weight (`me_at_weight`), the reps last time at it (`me_last_reps`), a twelve-week line, and one word.

- ⛔ **THE WORD IS `meSessionOutcome`'s, NOT A NEW VERDICT.** `setback` → **Stalled** · `mid_band` → **On track** · `clean` → **Moving up** · `no_evidence` → no word. The function was already running in production inside `earnedMeSets`; only its output was starved. `MeLadderReading.history` is now persisted and forwarded.
- ⛔ **"Moving up", not "Ahead"** — `clean` fires one rep short of the band top, so "ahead" would claim he beat a prescription he did not. The word states what happens next.
- ⛔ **No colour on the word.** Stalled is a fact about a session, not an alarm.
- ⛔ **No empty state.** A card does not render until that lift has a heavy session in the block.
- The chart is the card's own, not `TrendSparkline` — block-week axis, expected curve, "you are here", no expand. The DATA series is the same one, read once.
- **"From your logged sets" is NOT replaced.** It answers what did I lift and when; the cards answer is it moving.

## 4. The endurance cards — one per sport

The Wednesday near-threshold run and the Monday hard ride, identified by the composer's own family tag (`family:run_near_threshold`, `family:ride_sweet_spot`), joined in `compute-snapshot` the same way the strength `measuredDates` join already worked.

- Efficiency **read as stored, not re-derived**: `run_facts.efficiency_index`, `ride_facts.efficiency_factor` (the latter is TrainingPeaks' EF exactly — normalized power ÷ average HR).
- Drift per session, guarded on finiteness **not `> 0`** — drift is legitimately negative when HR falls, and a `> 0` test would have dropped his best sessions.
- ⛔ **p107 stated beside the figure, with NO verdict word:** terminate at 10% drift, **5% when a key session falls within 24 hours.** A key session is a quality slot or a barbell day, off p107's own wording (*"targeting a system or adaptation that you're hoping to improve"*). The app has measured drift for months and had never once put it against its own source.
- **FTP reference series** off `fitness_baselines`, ≥2 points required. Six dated readings on file: 176 → 173 → 165 → 153 → 156 → 168.
- **The ride leads on power, the run on heart rate.** The run carries no reference line — see Q-290.

## 5. Copy, and one payload

- The run efficiency row was opening *"Too soon to tell"* on the branch that means the opposite. Now: **"Reading 23 runs — the change is smaller than the normal spread between them."** The comment above it bans "too soon", "not yet" and "need more" from returning.
- `week_ledger_v1` — Viada's five accounting buckets, **persisted and forwarded, DELIBERATELY UNRENDERED.** Its header says why and ends *"Do not render them without a ruling."* See mistake #1.
- `COACH_PAYLOAD_VERSION` 170 → 173 across the evening. A cached row serves the old shape; a RENAME is worse than an addition, because the data is right there under a name nobody asks for.

---

# ⛔ WHAT IS WRONG RIGHT NOW — fix before building anything else

**THE RECORDS ARE GATED AND SHOULD NOT BE.** The heavy-only rule was applied to `buildAllTimeBestByLift` as well as the line, on the reasoning that the two readers must agree. Right for the line, wrong for the record: **a front squat, a trap bar deadlift or a curl carries no heavy mark and never will, so it can no longer set a record either.**

The line and the record are different claims. The line is about DIRECTION and needs clean input. The record is about the best you have done and only needs the set to be real. ⛔ **Ungate `buildAllTimeBestByLift`.** Introduced 2026-08-28, live now.

⚠️ **AND A COMMENT IN THAT FILE ASSERTS A FIELD CONSENSUS THAT DOES NOT EXIST** — it claims Strong, Hevy and Boostcamp all separate heavy from light. They do not. Strong plots working sets and dips; Hevy keeps the full history and adds monotonic records. Correct it before someone cites it.

⛔ **THE HONEST ARGUMENT FOR THE GATE, which is better than the one in the code:** the dip is not universal, it is PRESCRIBED. A Strong user's light day is incidental — a tired Tuesday. Michael's is 105 against 135 every week because the programme says so. Systematic, not noise.

---

# SPECIFIED, NOT BUILT — `docs/OPEN-QUESTIONS-2.md`

| | | |
|---|---|---|
| **Q-289** | "Holding" is stated for two different facts | The noise guard rewrites the verdict to `holding` — a CLAIM — where the honest answer is "we cannot separate it". Nothing on the payload distinguishes a genuinely flat metric from a suppressed one. Three rows. ⛔ Do not loosen the guard; the guard is right, the explanation is missing. |
| **Q-290** | Run threshold pace has no history | Stored as one `LearnedMetric`, overwritten in place on every re-learn. FTP accumulates because `fitness_baselines` supersedes rather than updates; the run's entry in that table is `decoupling`, not pace. ⛔⛔ **THREE separate things now depend on this** — Q-292, Q-294 and Q-296. It is the next real piece. |
| **Q-291** | The read is a plan-holder's screen | Superseded in spirit by Q-294 and Q-297; keep for the framing. |
| **Q-292** | A race plan breaks the premise | The read rests on the plan holding still. A race plan builds, peaks and tapers by design. The answer is the reference number climbing — which needs Q-290. |
| **Q-293** | Bike efficiency has a verdict and no series | ⛔ Must be built over the SAME `hrAtBand` rows the verdict reads, never a fresh pass, or chart and verdict disagree — the exact failure D-346 exists to prevent. Drift-as-a-series is missing for both sports too. |
| **Q-294** | **The endurance read is athlete-scoped** | ⛔ Michael's ruling. A lift is prescribed so the plan is the right frame; a run is yours whether a plan exists or not. All three endurance numbers are already plan-agnostic — **only the identification was plan-locked.** ⚠️ And `state-trend/run.ts` already had the plan-free predicate (steady aerobic efforts); a plan-scoped one was built beside it. **The refinement is the field-standard read; the athlete-scoped spine is what makes it available when no plan exists.** |
| **Q-295** | The 30-70 minute window | ⛔ **FLOOR IS RULED OUT** (Michael: *"let's match TrainingPeaks"*). His week is two 27-minute runs and one 63-minute session — **two of every three runs dropped before the row measures anything**, and TrainingPeaks applies no floor. ⚠️ "23 runs cannot call a direction" was never 23 runs feeding it: a SAMPLE problem, not a noise problem. ⚠️ **Ceiling still open** — its reason is real at the top (a long run drifts more) and false at the bottom. Recommended, not ruled: the long run becomes its own comparison group read on FADE, ≤5%, because that is where the marathon-relevant number lives. |
| **Q-296** | The block's own delta | Michael's. History as the spine plus the plan as an overlay unlocks *what did these twelve weeks buy* — no new measurement, just a subtraction. ⚠️ Needs history at BOTH ends, so it needs Q-290. ⚠️ **Not a causal claim** — what CHANGED across the block, never what the block CAUSED. |
| **Q-297** | Heavy is derivable from the set | ⛔ ME is a number: 1-5 reps at 90-100% (`intents.ts:74`). Weight, reps and the max are all on the logged set. Two tiers — stamped intent where it exists, derive where it does not. Closes the off-plan athlete, the Get Stronger main lift (which currently mints NOTHING), and the Strava importer. ⚠️ **Needs a max recent enough to divide by**, which is what a new athlete lacks. ⚠️ **And accessories/secondary lifts have no tested max at all** — for those the answer is RECORDS, not a max line, which needs no reference number. That is the Hevy solution and it is lighter than the gate. |

⚠️ **NOT FILED AS A QUESTION AND STILL TRUE:** Viada's interference read (question 2 at the top) is computed with per-session verdicts in `accessory-dosing/ledger.ts` and read by nothing. His figures are per SESSION, never per week. On Michael's block, week 6: heavy upper 11, heavy lower 8, speed upper 9, speed lower 9.

---

# ⛔ THE THREE MISTAKES — read before designing

**All three were the same mistake, and Michael caught all three.**

1. **I surfaced the build-time tool as a weekly readout.** Viada's five buckets set a dose; they are fixed the moment the block is composed. Measured: **twelve identical weeks.** The card would have shown one picture twelve times. → the payload exists, unrendered.
2. **I scoped the strength line to the block.** A line that resets because the app rebuilt a plan is what makes the athlete close the app. → rolling, 84 days, only the WORD stays block-scoped (it judges against a prescription that dies with the block).
3. **I scoped the endurance read to the plan** — and had a plan-locked identifier built beside a plan-free one that already existed.

⛔ **THE RULE THAT WOULD HAVE PREVENTED ALL THREE:** when the ask is *what should we measure*, derive it from the source and the field FIRST, then trace what exists. `trace-before-build` prevents rebuilding; it is **not** a licence to let what is built define what should be. And the generalised question this codebase keeps failing to ask: **what does the app know WITHOUT a plan?**

⚠️ **AND CHECK BEFORE ASSERTING.** Wrong this evening and corrected by trace: the function that produces the word; that the noise guard yields `withheld` (it yields `holding`); that grade adjustment was missing (it is already there and preferred); that Strong and Hevy gate their charts (they do not); that ACWR "cannot be built" (his page says *few practical ways*, which is weaker). Every one read as airtight when written.

---

# HOW TO WORK WITH HIM

- **Plain words.** No file names, no function names, no invented labels. Describe what he would SEE. He built the app and does not read code.
- ⛔ **A concern is ONE sentence and only if it changes what gets built.** He named the failure mode directly: *"you want to discuss everything that can go wrong and it makes me think there is a problem."*
- ⛔ **When he says something feels wrong, it is a finding.** He was right every time tonight.
- ⛔ **Answer from the field, not from instinct.** *"It can't just be a fucking LLM and a guy who knows nothing about coaching making this thing."* Look it up before saying it.
- **Push and deploy wait for him, in his own session.** A relayed approval is not approval.
- ⛔ **Never say "shipped."** Pushed / deployed / verified, separately, every time.

---

# MONDAY

1. Michael deletes the block and rebuilds. **The deploy is already ahead of him** — do not deploy anything before he does this.
2. Week 1 is the two tests, Monday and Tuesday. **The lift cards will be absent all week; that is correct** — no heavy session, no card, no placeholder.
3. Week 2: cards appear as each lift gets its first heavy session. No lines yet (a line needs two in-block points). The run card can appear in week 1, with a number and no line.
4. Week 3: lines start drawing.

⛔ **THE REAL-FAILURE TRIPWIRES, distinct from the expected states above:**
- **Strength:** if the line is still empty after both pretest sessions are logged AND a snapshot has run, that is genuine. Trace starts at `exercise_log.slot_intent` on those rows.
- **Endurance:** if the ride card is empty after a hard ride is logged, attached and a snapshot has run, that is genuine. Trace starts at `family:ride_sweet_spot` on the planned row, not at the card.
