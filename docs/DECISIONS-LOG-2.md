# Decisions Log — Part 2 (D-373 onward)

Append-only record of architecture / design decisions worth preserving across sessions. Each entry
captures **why** the call was made, what was rejected, and what tradeoff is being lived with — so the
next session doesn't re-debate (or worse, undo) settled choices.

---

## 📁 WHERE TO FIND A DECISION

**The number tells you the file. Numbering NEVER restarts — a `D-NNN` exists exactly once, anywhere.**

| range | file | status |
|---|---|---|
| **D-001 → D-239** | [`archive/DECISIONS-LOG-archive-D001-D239.md`](archive/DECISIONS-LOG-archive-D001-D239.md) | frozen, **still authoritative** |
| **D-240 → D-372** | [`DECISIONS-LOG.md`](DECISIONS-LOG.md) | frozen 2026-08-02, **still authoritative** |
| **D-373 →** | **this file** | live — new entries go here |

⛔ **FROZEN DOES NOT MEAN DEAD.** Every one of those entries is as binding as the ones in this file.
They were split because a 484KB doc is ~120k tokens and stops being readable, **not** because their
contents stopped counting. **Grep all three before reversing anything:**

```bash
grep -rn "D-267" docs/DECISIONS-LOG*.md docs/archive/DECISIONS-LOG-archive-*.md
```

⛔ **When you supersede an older entry — in ANY of the three files — GO BACK AND ANNOTATE IT.** Write
the back-annotation as a `>` blockquote at the TOP of the old entry: what changed, where in code, and
"everything below is history." See the end-of-session protocol in `CLAUDE.md`.

> **Why this file exists (2026-08-02).** The previous rule said "move the CLOSED and superseded entries
> to an archive." That rule can never fire on a decisions log — **a decision does not close** — so this
> file grew to 3× the cap while the rule sat there looking followed. It was also measured and found
> dangerous on `OPEN-QUESTIONS`: automated "is this closed?" detection flagged **Q-246 and Q-247 as
> closed when both were live**, and burying Q-246 would have hidden the warning that `plannedWorkout`
> is still in use. **So: no judgment, no moving text. Freeze at a number, start the next file.**

---

### D-373 — Coaching language is for MAIN LIFTS ONLY (2026-08-02, **PUSHED `b1b4c13f` + DEPLOYED coach v161 + VERIFIED live**)

`computeLiftVerdict` (`_shared/response-model/weekly.ts`) ran **every** movement through the same
RIR-deviation logic and **never consulted role**, so a hard-feeling **accessory** — Hip Thrust,
Barbell Row — printed a red **"back off weight"**. Accessories carry no anchor, so the State row had
nothing to build a sentence from and dumped the raw command on screen. It is *worse* on lighter
programs, where almost everything is an accessory. Root-caused in `SPEC-strength-language.md` (locked
2026-08-01) and unbuilt until now; this is **Axis 1 (Role)** of that spec. Axis 2 (Type) and the
collapse of the six overlapping classifiers remain.

**The gate returns an EMPTY label for anything that is not one of the four main lifts.** The client
reads `''` as "not coached" and renders the number instead (`Working ~110`).

⛔ **THE GATE IS `isMain531Lift`, NOT `roleForExercise`, AND THE DEFAULTS ARE WHY.** Both classifiers
exist and they disagree on an unknown movement: `roleForExercise` → `'primary'`, `isMain531Lift` →
`false`. That opposition is correct — the LOAD system should count an unknown move, the LANGUAGE
system should say nothing about it. **Gating language on `roleForExercise` would coach every
unrecognised movement and rebuild this exact bug one layer down.** Silence is the safe failure.

**Field basis:** Strong and Hevy render per-exercise numbers only — heaviest weight, e1RM, volume, PRs
— and issue **no commands**. "Back off weight" is not app language.

**A test was REVERSED, not deleted.** `weekly-strength-verdict.test.ts` asserted that Hip Thrust
*should* receive "back off weight", under the title *"behavior unchanged"*. It passed, and it pinned
the bug. Same lesson as [D-372] the same night: when a test's subject moves, re-point it.

**Verified live, not by screenshot:** after deploy, the coach payload returned Hip Thrust `""` and
Barbell Row `""`, with Squat / Deadlift / Bench / Overhead Press still coached.

⚠️ **THE DEPLOY ORDER IS PART OF THIS DECISION.** `COACH_CLIENT_MIN_PAYLOAD_VERSION` was raised to 161
*before* the server served it, which made the client reject its own cache, forced a coach
regeneration, and the regeneration hit [Q-252] and wrote null over the good cached copy — **blanking
the entire State performance section.** The floor now moves only after the server is verified serving
the new version. See the warning on `coach-contract.ts`.

### D-374 — "From your logged sets" is a MAIN-LIFT section (2026-08-02, Michael — **PUSHED, client-only**)

Michael, looking at the section: *"what does this section actually communicate? should it be for
accessories?"* → *"so we should lose the acceroies and just have main lifts"*.

**Every row reads `Working ~120 vs your 150 baseline` — a comparison against a TESTED 1RM.** You test
a max on the four barbell lifts. You do not test one on a Hip Thrust. So an accessory can never fill
that column; [D-373] silenced the command it used to fall through to, and this removes the row that
had nothing left to say.

⚠️ **FILTERED AT THE DISPLAY, NOT AT THE SOURCE, DELIBERATELY.** `per_lift` is a shared contract — the
coach reads it for strength maxes (`coach/index.ts:3557`) and the block model iterates it
(`block.ts:322`). Narrowing it server-side would quietly change that reasoning. This is a choice about
which rows belong in **one section**, made with the **same shared classifier the server gates on**
(`isMain531Lift`) so the two cannot drift. `perLift` is left intact for the adjust lens.

⛔ **This does not mean accessory work does not count — it means it has no home YET.** Filed as
[Q-253]: the honest frame for by-feel work is the athlete's own history (reps at a weight, volume over
weeks), never a tested max — which is also Michael's direction on [Q-251]. Do not "fix" Q-253 by
putting accessories back into the baseline section.

### D-375 — ONE strength language: Axis 2 (Type) + the classifier collapse (2026-08-03, **PUSHED + DEPLOYED (29 fns) + PARTIALLY VERIFIED**)

Completes `SPEC-strength-language.md`. [D-373] shipped Axis 1 (Role); this is **Axis 2 (Type)** plus
the collapse of the 6→8 overlapping classifiers onto **one role axis + one type axis**. Built as 7
ordered steps (build the new table → migrate readers one at a time → delete duplicates last), each
proven by fixture with no behavior change except deliberate corrections.

**What shipped:**
- **The Type table** (`src/lib/exercise-role.ts`): 8 rows — barbell-main, barbell/DB-accessory,
  bodyweight, plyo, isometric/hold, mobility, carry, **band** — each carrying has-weight / has-1RM /
  coached / logged-as. The four main lifts read `MAIN_531_LIFTS` directly so "coached type" can't drift
  from `isMain531Lift`. Unknown move = counts as load, says nothing (same safe default as D-373).
- **Band is an 8th type that POINTS at existing machinery**, not reinvented pricing: `bandMeansAssistance`
  (add-vs-assist) + the flat-token path in `workload.ts`.
- **The card, logger, swapping, load all read the shared axes.** Notable sub-decisions: equipment-draw
  rules were **transcribed byte-for-byte** into the shared module (Step 3), NOT re-derived — re-deriving
  would have re-opened Q-180 (Farmers Carry priced as one bar). Swapping's `isMainLift` became a
  **union** (curated family OR shared classifier) so it can't disagree about "main lift" (Step 4).
- **A real pricing bug fixed along the way** (`src/lib/band-assistance.ts`, Step 5): the logger and the
  pricer used different gates for "is the band assistance," so "Band Assisted Pull Up" priced 40 lb of
  HELP as 40 lb of LOAD — **200 vs the correct 700**, and it was corrupting stored `total_volume_lbs`
  in 5 call sites, not just the load score. One shared gate now. **History checked read-only: clean —
  Michael only ever logged the plain base names, which were always priced right.**
- **The fitness-section name sets are THREE questions, not one** (`src/lib/tracked-max-lifts.ts`, Step 7):
  "may we coach it?" (~16, includes Front Squat) ≠ "do we chart a tracked max?" (exactly 4) ≠ "does it
  move the dot?" (`PRIMARY_LIFTS`, 5). A Front Squat coached-but-not-charted is **correct** (it fills the
  squat slot, doesn't earn a 5th max) — pinned in a fixture. The real bug fixed: `BIG_4` existed
  byte-identical in two files (server emitter + client renderer) with only a comment claiming they
  matched — the D-346 fault waiting to happen; now one imported list.
- **Cap fix** (`StateTab.tsx` logged-sets list): the list was `.slice(0,5)` **before** the main-lift
  filter, so `overhead_press` (6th in key order) was cut before it was checked — the "missing OHP"
  symptom. Now filter to main lifts FIRST, then cap (redundant at max 4). Client-only.

**Deploy:** commit `dd703ef5` + the cap-fix push; 29 edge functions redeployed (the union widened from
11 → 29 because `state-trend/assemble.ts` is the snapshot spine). Coach payload version NOT bumped, so
no client-floor / Q-252 trap. Blocked once by an upstream esm.sh 404 (`@supabase/supabase-js@2` →
2.112.0 auth-js missing); self-healed within hours, no version pinning needed.

**VERIFIED on device:** strength card shows main lifts only, no red "back off weight," OHP restored
after the cap fix, band-assisted Chin Up renders Assist(lb)+Added correctly. **NOT verified:** the 5
changed logger movements (sled push/pull, dead hang, wall angel, foot doming) — blocked because they
aren't in the add-picker (see the catalog gap in ENGINE-STATE Known-broken).

**Deferred (NOT this decision):** → [Q-254] now carries the real strength-currency work (rebuild the
logged-sets rows on AMRAP + learned e1RM, drop RIR for AMRAP, roll trap-bar into the deadlift slot).
Two fresh bugs from acceptance filed in ENGINE-STATE. [Q-253] (accessory home), plain-name recognition,
core-circuit label, and `bandMeansAssistance`-in-canonicalize (dead, left labelled) remain.

> **Back-annotates [D-373]:** Axis 1 shipped there; the strength-language SPEC is now fully built as of
> this entry. `SPEC-strength-language.md` retained only for the unbuilt remainder above.

### D-376 — Swap engine: an intensity-tier gate for accessories (2026-08-03, **PUSHED + DEPLOYED + VERIFIED**)

The swap engine (`getInSlotAlternatives`, `exercise-alternatives.ts`) filtered on movement pattern and
excluded main lifts, but was **blind to intensity tier** — so it offered a loaded Barbell Hip Thrust as a
swap for a light-band Clamshell, ranked heaviest-first. Grounded in the field standard (Wendler push/pull/
single-leg-core; Fitbod "same muscle, equivalent intensity, change only equipment"; RP "same muscle, similar
rep range"), a sound accessory swap must share **category + intensity tier + muscle**. Added
`src/lib/strength-intensity-tier.ts` (light / loaded / power) and gated swaps to same-tier only. Killed 97
tier-only-unsound offers. **Muscle axis left LOOSE deliberately** — Wendler treats posterior-chain accessories
as interchangeable, so pattern stays the muscle proxy (a fixture pins muscle-loose so a future change can't
quietly tighten it). Gate is accessories-only (a main lift may still swap DOWN). Also fixed 3 "same movement,
two names, two pools" pattern defects (Y-T-W, reverse-fly, squat-jump). Client-only engine; the pattern
config touches 7 edge functions. Audit: `docs/AUDIT-accessory-swaps-2026-08-03.md`.

### D-377 — The exercise-config catalog reconciled + a permanent VOCABULARY GUARD (2026-08-03, **PUSHED + DEPLOYED + VERIFIED**)

`getExerciseConfig` ends in a "longest overlapping key wins" fuzzy fallback, so any exercise without an
exact config key silently **inherits a neighbor's prescription** — the same disease as D-375's classifiers,
one layer down. Live example killed: plain **"Press"** (5/3/1's own word for OHP) resolved to **"Leg Press"
→ 1.5× your SQUAT**. Fixes: (1) added config entries for all 65 offenders (type table + baked plans + a
read-only snapshot of Michael's real logged/planned names), every ratio **inherited from a structural
sibling, never guessed**; (2) the fuzzy fallback now emits a **loud dev warning** naming what it borrowed;
(3) **`exercise-config.vocabulary-guard.test.ts`** — a permanent test that fails the build, by name, for any
exercise that resolves fuzzy/none. Empty `ACCEPTED_FUZZY` ledger — nothing pre-forgiven. Only 5 prescriptions
actually moved (Squats-priced-as-jump, Pistol-Squats-off-barbell-max, Kettlebell-Rows-per-hand, Glute-Bridge-
March-unloaded, Handstand-Push-ups-vertical); the rest were byte-copies or bodyweight. Also fixed the
apostrophe trap (`foldExerciseName` now strips `'` — "Farmer's Carry" resolved to nothing) and Single Leg Hip
Thrust (was priced as a two-legged barbell deadlift). **This turns "find bad prescriptions by screenshot"
into an automatic, permanent check.**

### D-378 — Q-254 slice 1: State reads the AMRAP all-out set (2026-08-03, **PUSHED + DEPLOYED + VERIFIED**)

State's "from your logged sets" showed working-weight vs a stale typed baseline while the **Performance**
screen already showed the real all-out set — the doubled disease. The all-out read (rep record + hedged
e1RM + the "estimates hold to about N" caveat) lived in `workout-detail`, not `session-detail/build.ts`;
extracted to `_shared/strength/all-out-set.ts` and made State read the same source over the last 40 sessions
(the old 28-day window went blank on measured lifts during light weeks). Additive — no verdict/weight/trend
moved. Coach payload 161 → 162. **VERIFIED: Deadlift State ≡ Performance (105×35, est 225 "rough").**

### D-379 — Q-254 slice 2: the verdict reads the AMRAP, not RIR (2026-08-03, **PUSHED + DEPLOYED + VERIFIED**)

`computeLiftVerdict` decided "back off / add weight" on **RIR deviation** — how sets *felt* — which is not
5/3/1's signal. Worse, a live bug: `getTargetRir` never returned null for `usesRir:false`, so a main lift
with no RIR of its own **inherited the accessory RIR average**, cleared the ±1.0 band, and printed a
**tappable** command that moved real weights on one tap. Fix (2a): `getTargetRir` gated via the existing
`protocolUsesRir(profile)` seam (NOT a signature change — its docblock forbids that; a forgotten null-check
reads 0 = grind-to-failure) → a 5/3/1 main lift lands in the trend-words branch, no command, **not tappable**.
Fix (2b): the verdict now reads the AMRAP through the **existing `verdictFrom95Set`** (`wendler-531.ts:454`,
book-grounded: 0→reset, 1+→advance, big→advance-untrusted, none→hold) as **read-only status** ("top set met /
missed"), no weight suggestion attached. ⛔ Deliberately **did NOT** surface "advancing/reset" wording — the
working number does not move from this path (that's [Q-223], already built). Coach payload 162 → 163.
**VERIFIED: green "top set met" replaced the old command; not tappable.**

### D-380 — Strength rest timer reads the shared main-lift list; heavy rest 150s → 180s (2026-08-03, **PUSHED + DEPLOYED**)

`calculateRestTime` split main-vs-accessory via its OWN private regex (a 7th private classifier) that missed
Push Press / Military Press → they rested 90s after a heavy triple. Repointed at the shared
`isMain531Lift` / `MAIN_531_LIFTS`. Heavy main-lift rest (3-5 rep case) bumped 150s → **180s** (the strength
standard). ⚠️ Side effect, pinned in a fixture: DB / incline / decline bench now rest 90s — they're
*assistance* in 5/3/1, not main lifts, so the shared classifier is correct, but Michael will feel it (his
call to keep or bump). The backgrounding fix (Q-TIMER, wall-clock deadline + notification) was audited and
is **solid** — no work needed there.

### D-381 — Band-load pricing: a blank band box is not bodyweight (2026-08-03, **PUSHED + DEPLOYED, LATENT**)

`strengthSetVolume`, for a band move with no logged band value, fell through to **bodyweight × reps** —
correct for a push-up, wrong for a band pull. Added a `bandIsLoad` opt (`typeForExercise === 'band'`) that
returns the flat `BAND_SET_VOLUME_TOKEN` instead. Also closed the matching planned-side hole ("By feel"
didn't trip `plannedIsBand`). ⚠️ **LATENT**: read-only check of all 96 strength sessions found **zero**
affected — every band set Michael has logged already carries a value, so no `total_volume_lbs` / ACWR moves.
Backfill empty. *(This corrects the false premise that his screen's "4,000 lb" band face pull was live — it
was a stale build; his real data prices at 1,000.)*

---

### D-382 — The Focus front door: Train / Race / Build, with a Train drill-down (2026-08-05, **PUSHED + CLIENT-DEPLOYED, NOT DEVICE-VERIFIED**)

**Supersedes `SPEC-assistance-fix.md` §B, which dies with this entry.**

The Goals screen opened to a list of active plans and one **"Add a goal"** button; the builder behind
it opened to *"What's the goal?"* with two cards (Strength Focus, Marathon). It is now:

- **Goals → Focus** (tab label, screen title, and the eye mark — see D-384), showing **Train · Race ·
  Build** where "Add a goal" was.
- **Train** drills down to **Run Focus · Ride Focus · Strength Focus · Athletic Focus**.
- **Strength Focus** opens the three tiers (D-383), then today's block unchanged.
- **Race** routes into the existing marathon flow, untouched.

**Locked calls, with their reasoning:**

1. **The entry cards are NAVIGATION, not goals.** `GOAL_ORDER` stays a goal list and keeps feeding
   `seedFromGoal`; `train`/`race`/`build` live in `ENTRY_ORDER`, and the goal id is set one screen
   later (Strength → `get_stronger`, Race → `marathon`). ⛔ Putting an entry id in `GOAL_ORDER` falls
   through the seed switch to a default and **reintroduces the 2026-08-04 progress-bar jump**.
2. **The door lives on the Goals screen, not as the builder's first step.** Built the wrong way round
   first — three cards one level down behind "Add a goal", so the screen looked identical. Michael:
   *"nothing there" … "should replace add a goal."* `GoalsScreen` renders the door and deep-links the
   builder to the tapped card (`entry` prop); the builder's own door survives for the standalone
   route and for Back to land on.
3. **Not-yet cards are `disabled`, dimmed, and carry NO "Soon" tag.** Run / Ride / Athletic / Build
   have no flow. Inert to pointer, keyboard and screen reader alike — "it isn't ready" has to be true
   for everyone. No badge: it would promise a date that does not exist.
4. **"Athletic", never "Multi"** — *"Multi" reads as triathlon-only, which is the read we are
   avoiding.* The name alone does not carry multi-discipline, so **the subtitle does**; never render
   one of these cards without its blurb.
5. **"Plan a season" moved inside Race**, at the foot of the race screen (*"Racing more than once
   this year?"*), placed after the fields so one race stays the primary path. Route unchanged
   (`/arc-setup`); the handler is passed DOWN from `GoalsScreen` because closing Goals is that
   screen's job, not the builder's.
6. **`GoalsScreen.tsx` is NOT deleted.** "Replaces the Goals screen" means the entry the athlete
   lands on. That file still holds `renderEventForm()` — the ride / swim / tri / du race form, which
   **has no other door** and is not absorbed by Race in this slice (Race routes marathon only; see
   punch-list #3). Both doors coexist.
7. **The "Which discipline?" sub-picker is deleted, not moved.** It served `build_endurance` /
   `build_speed` / `starting_over`, none of which were offered; the Train card names the discipline,
   so the question cannot arise. `GOALS_NEEDING_DISCIPLINE` still governs any goal reached otherwise.

> ⛔ **THIS REVERSES THE 2026-07-25 PLACEHOLDER RULE — and the rule's reasoning is kept.** That call
> (*"let's clear out all the placeholders"*) rested on *a front door offering five things that do not
> work is worse than a door offering one that does*, which is still true. The difference: the door now
> has **two levels**, the entry screen offers only cards that OPEN, and the unbuilt disciplines sit one
> level down **saying they are unbuilt**. A card that admits it is not ready was never what that rule
> was aimed at. `NonRaceBuilder.tsx:60` rewritten accordingly.

**Files:** `src/components/GoalsScreen.tsx`, `src/components/NonRaceBuilder.tsx`,
`src/components/wizard/StepLayout.tsx` (`title` widened to `ReactNode`), `src/components/AppLayout.tsx`,
`src/index.css`, `src/lib/context-utils.ts`. Commits `5634b4f3`, `c3990967`, `7f61ff4e`.

---

### D-383 — Strength opens three tiers, and Strong is a PASS-THROUGH (2026-08-05, **PUSHED + CLIENT-DEPLOYED, NOT DEVICE-VERIFIED**)

Strength Focus no longer drops straight into the block. It opens **Strong / Heavy / Definition**
(`SPEC-assistance-fix.md` §A), worded by Michael: *"Stronger, not bigger." · "Build muscle." · "Shape
where you choose."*

⛔ **STRONG IS TODAY'S BLOCK AND PICKING IT CHANGES NOTHING.** Michael: *"strong is our current
strength focus plan."* The step routes into the existing `get_stronger` flow untouched and **sends no
new field**. It exists so the tier is a visible choice the day the other two are real.

⛔ **HEAVY AND DEFINITION SHIP DARK, ON PURPOSE.** What separates the three is *accessory volume and
character* — which is exactly what `SPEC-assistance-fix.md` §0–§7 is about to rewrite. Offering them
before that lands would ship **three names for one block**.

⛔ **AND NO TIER FIELD REACHES THE PAYLOAD, BECAUSE THE SPEC'S FIELD NAME IS ALREADY TAKEN.** §B
resolved that the tier travels as its own `strength_tier`. That key already exists on the plan config
holding the **EQUIPMENT** tier (`generate-strength-plan/index.ts`, `strength_tier: 'barbell'`). Two
meanings on one key is the "second vocabulary beside the first" trap `CLAUDE.md` opens with. Nothing
is blocked — Strong is a no-op — so the name gets picked when Heavy or Definition actually needs it
(`strength_intent` is the candidate). Recorded in the spec, not just here.

**Scope:** the tier step is on the Train→Strength path only. A `get_stronger` goal reached any other
way (standalone route, stored goal) walks the flow it always did. Commit `cea6b173`, spec note `841647e6`.

---

### D-384 — The eye, and one discipline palette on the front door (2026-08-05, **PUSHED + CLIENT-DEPLOYED, NOT DEVICE-VERIFIED**)

**"Goals" → "Focus", with an eye.** Tab label, screen title, and the mark. The screen behind that tab
is the front door and *focus* is the word it uses throughout (Choose your focus, Run Focus, Strength
Focus) — a tab called Goals opening a screen that never says "goal" was one name too many. The
internal `showGoals` state keeps its name; only what the athlete reads changed.

⛔ **THE EYE IS DRAWN IN CSS, NOT DROPPED IN AS AN ICON COMPONENT.** The tab bar's whole language is
abstract sigils built from gradients (`home`, `context`, `plans`); one real glyph among them reads as
a mistake. **One definition, two sizes:** `.eye-mark` carries the paint, `.tab-sigil` supplies the
16×10 box + active glow, `.eye-mark.eye-heading` is the 22×14 version beside the three door titles.
Painting it twice is how the two would drift.

⛔ **EVERY COLOUR READS `getDisciplineColor` (`SPORT_COLORS`) — not one hex is hand-picked.** Michael:
*"everything should use discipline colors."* Run gold, Ride green, Strength orange. Two cards have no
single discipline (Train, Athletic) and take the palette's unclaimed colour rather than borrowing one
of the four and implying a default.

⛔ **RACE IS NOT A DISCIPLINE, SO IT STOPS WEARING ONE.** It was run-gold, wrong twice: it claimed one
discipline for a card that will hold tri and du, and made Race and Run Focus the same colour on
adjacent screens. **`FOCUS_RACE_COLOR`** lives in `context-utils.ts` beside `SPORT_COLORS`,
deliberately outside it *and* outside the teal that means "selected", so it can never read as a
discipline or as a chosen state. One constant, both doors.

⚠️ **The colour survives the dimming, at 40%.** A not-yet card should still say which discipline it
is; going flat grey throws that away to signal something the text already says.

**Sizing + copy, from device reads:** cards `px-4 py-3` → `p-5`, icons 20 → 24px, labels `text-base`
(*"make the 3 cards bigger easier to read"*). Cards are **"Run Focus"**, not "Run" — a discipline is
what you do on Tuesday, a Focus is what the block is aimed at. Strength's line is Michael's: *"Get
stronger, bigger, more defined while holding aerobic base"* — it names the trade the block makes.

**A "Current" / "Start something new" divider pair** was added because *"Strength Focus"* appears
twice on the Focus screen and read as a duplicate: the top card is the block he is **running** (Anchor,
week 2 of 12), the one behind Train is the door to **start** one. Labelled rather than renamed — the
running block genuinely IS a Strength Focus, and a second name for it would make the app call one
thing two things. ⚠️ Not redundant, then, but *"it reads as a duplicate"* is a real defect even when
the data is right.

Commits `9baa35fb`, `d4eda969`, `dca84dda`, `8a0efcd7`.

---

### D-385 — Accessory selection is day-type roles, not family collision (2026-08-05, **PUSHED + DEPLOYED, NOT DEVICE-VERIFIED**)

> ↩ **PARTIALLY SUPERSEDED by D-404 (2026-08-09).** Two of this entry's calls are reversed, both by one
> premise change and neither on the merits: **(1)** the upper-day third slot is **arms, not core** —
> `ROLE_BY_DAY.upper.single_leg_core: 'arm'`; **(2)** the pull slot **no longer crosses the plane** by
> default, the p.86 rule now being gated behind `AssistanceTemplate` and off under `standard`.
>
> ⚠️ **The paragraph below that says *"Do not 'correct' it to triceps by citing p.51"* was right, and
> D-404 is not that correction.** This entry's warrant is the clause *"the concurrent chapter — written
> for an athlete who lifts and conditions"*. A **strength-purpose** block is not the concurrent case, so
> p.50–51 governs it and p.87 does not. Which chapter has jurisdiction, not which page reads better.
>
> ↩ **AND THE LOWER-DAY HALF IS SUPERSEDED TOO — D-405 (2026-08-09).** `ROLE_BY_DAY.lower` is now
> **leg · leg · abs with NO pull**: p.51 is two explicit lines (Deadlift → hamstrings, quads, abs;
> Squat → low back, quads, abs) and neither carries one. The reasoning below — *"the four main lifts
> contain no row or chin, so pulling volume has to live somewhere"* — is true of the book and not of
> this template; the pulling lives on the two press days (p.50).
>
> **Everything else here still stands** — the four defects, the push-slot fix, the 50/75 rep band, Face
> Pull in the pull slot, and the no-false-"you picked" rule. **Everything below is history for the
> three reversed calls and current for the rest.**

**Supersedes `docs/SPEC-assistance-fix.md` §0–§7, which dies with this entry. Partially supersedes Q-212 (see its back-annotation).**

Four defects, all confirmed in code, all fixed against the 2nd edition rather than against memory:

1. **A press day structurally could not show a push.** Every push option shares the main lift's family, so the slot always collided and fell through to `BALANCE_POOL.push` — four movements, **all four pulls**. Bench and OHP shipped two pulls and zero push, every time, by design.
2. **Leg work landed on press days** — nothing collided with `single_leg_core` on an upper day, so it passed through and stacked glute/ham load against the run legs.
3. **Squat and deadlift days ran the same leg pattern.**
4. **The rep floor was 25.**

⛔ **THE p.86 CITATION THE OLD RULE RESTED ON WAS READ TOO NARROWLY, AND THAT IS THE WHOLE STORY.** p.86 does pair Bench→Chin-ups, but the template runs to p.88, whose worked example is `Bench 5/3/1 → Barbell Rows → 3 rounds of Med Ball Slams · **DIPS** · Burpees · Chin-ups · Planks`. **Dips are on the bench day, in the template we quoted to prove they should not be.** p.87's upper-body assistance list is push and pull throughout. **No page in the book turns a push slot into a pull.**

**What replaced it:** `ROLE_BY_DAY` — upper days are push · pull · core, lower days are leg · pull · core, **core last** as every template runs it (p.48, p.51, p.55, p.88). The p.86 plane rule survives **on the pull slot only**, which was always the correct half of Q-212; applying it to the push slot is what deleted the push.

**Reps: floor 50, ceiling 75.** ⛔ **There is no 25–50 range in the book** — the premise of the 2026-07-28 "25 IS THE FLOOR" call. Triumvirate (p.48) runs 50–75 per movement; Bodyweight (p.52) says "no less than 75 per exercise"; Periodization Bible (p.51) is 5×10–20. Wendler's lowest figure anywhere is 50. **The 50/75 band is the Triumvirate's own.**

⚠️ **Face Pull is NOT demoted** — p.50 lists it under "Lats or Upper Back". It moves to the **pull** slot. It was only ever wrong as a push. An earlier spec draft called it prehab; the book does not.

⚠️ **The core-on-an-upper-day slot is a CHOICE, not a quote.** Four of five templates put arms/upper-back there and keep abs on the lower days. The one source for core on a press day is **p.87, the concurrent chapter** — written for an athlete who lifts and conditions. We take p.87 over the four powerlifting templates deliberately. Do not "correct" it to triceps by citing p.51.

⛔ **AND THE APP STOPPED SAYING "You picked X" ABOUT ITS OWN DEFAULTS.** Under day-type roles the push slot is re-roled on **every** lower day, so the default path would have carried a false "you picked" note on half the block's sessions.

**Files:** `src/lib/assistance-menu.ts` (roles, `ROLE_FALLBACK`, floor/ceiling, menu additions, substitution copy), `shared/strength-system/assistance-collision.test.ts` (**rewritten** — its old invariant *was* the bug and it passed). Commit `a0d1baec`.

---

### D-386 — Lift spacing is two terms, and neither is upper-against-lower (2026-08-05, **PUSHED + DEPLOYED, NOT DEVICE-VERIFIED**)

> ⛔ **SUPERSEDED 2026-08-06 by [D-394] — the gate WARNS now, it does not refuse.** Michael: *same "warn, no wall" as the mileage floor.* The reasoning below (*a race inside the floor is arithmetic*) was half wrong: the engine DOES have a plan for them once the arc is anchored to race day and the ceiling is stated. Everything below is history.

**Builds Q-214. Supersedes Q-214's ranking note and deletes two terms.**

**BUILT — `pressAdjacencyShortfall`.** Nothing scored two pressing days landing next to each other. Q-214 verified this by enumeration in July and it was never built.

**DELETED — `upperLowerShortfall`.** It pushed every press ≥3 days from every leg day. ⛔ **Wendler's basic week (p.11) ALTERNATES upper and lower on back-to-back days on purpose** — Press · Deadlift · Bench · Squat — so the term scored the book's own week as worse than a clustered one. Worse: with four lifts on seven days, shoving each press away from the legs **shoves the two presses into each other**. It *caused* the 24h-apart pressing days Q-212 and Q-214 both chased.

**DELETED — `upperToNearestLiftPenalty`.** Measured `-min(gapDays)` from each upper day to the nearest lift **of any kind**; returned −1 for four arrangements whose press gaps were 1, 2, 3 and 3 (§0e). With press spacing measured directly, what remained was another upper-against-lower term. ⚠️ **Not dead** — 0 of 85 four-day scenarios changed, **36 of 43 three-day** did, all toward the book. Michael's call, overriding the "delete only if nothing changes" rule.

**CHANGED — the tie-break opens with the press.** It sorted lower-first then **alphabetically**, which is why an unanchored week opened "Monday: Back Squat". Nothing chose that; the alphabet did. Now p.11 order, so the default week is **Mon Press · Tue Deadlift · Thu Bench · Fri Squat**. Determinism is unchanged — the book order is as fixed and caller-independent as the alphabet.

**What is left, each measuring what it names:** `spreadPenalty` (heavy legs vs heavy legs) and `pressAdjacencyShortfall` (press vs press). **Nothing prices upper-against-lower.** If a future session wants that back, read p.11 first — it is the arrangement such a term scores worst.

⚠️ **A stated preferred day now loses to press spacing** (ranked above `preferredMissPenalty`). Q-214 weighed the ranking only against `upperLowerShortfall`; this consequence is pinned by a test so it is a recorded fact, not a surprise.

**Files:** `_shared/week-solver.ts`, `_shared/week-solver.test.ts`. Commits `d2fd3234`, `24771cce`.

---

### D-387 — Three days means three days, and the rest day yields instead of dropping a session (2026-08-05, **PUSHED + DEPLOYED, NOT DEVICE-VERIFIED**)

**THE WEEK-3 TEST SPLIT IS DELETED.** Week 3 of every cycle broke the 3-day shape onto **four** days so each 95% set was read fresh. ⛔ **The premise does not survive the trace:** `applyVerdict` steps the working number by a **fixed** increment (`cappedCycleIncrementLb`, +5/+10) and `verdictFrom95Set` reads only whether the prescribed single at 95% was completed. **The next weight is never computed from an estimated max off that set** — the e1RM touches the ceiling and a trust label, nothing else. A fatigued lift can miss the rep target, which is the book's own reset trigger on any day, but it **cannot bias the weight**. The split bought nothing and cost a "3-day" plan that quietly ran four days every third week.

**THE PAIRED DAY IS ONE SESSION.** The per-lift loop authored a complete session per lift, so the shared day emitted two sessions and **eight exercises**. Now two mains + **one** assistance block, bench first (heaviest leads; the second lift is trained fatigued). Stacking mains is Wendler's own — p.77 runs Squat and Bench 5/3/1 in one session.

**LIFT ORDER is p.11:** Press · Deadlift · Bench · Squat. ⚠️ That reorder flipped the 3-day shared day so the **bench** was trained fatigued behind the press — the week order and the shared-day order were reading from one array. Split them.

**THE REST DAY YIELDS.** It was reserved before anything was placed and outranked what the athlete asked for. It is now the last thing given up, and giving it up is **reported**. ⚠️ Two collisions found on the way, both the same shape — **two rules picking a day off `freeDays` without consulting each other**: the long run was hardcoded to Saturday and only worked because a lift happened to be there to share with; and `restReserved` could resolve to the same day as the long run. Either one produced a seven-day week with no rest.

**RUN AND RIDE ALTERNATE.** Runs claimed every free day first and rides could only stack onto lift days, so runs clustered and rides landed wherever a lift was. **Pass order, not a decision.** ⚠️ `easy_run × easy_run` is rated **0h with no penalty**, deliberately — so this is a composer preference with a stated owner (Michael), **not physiology**, and the code says so.

**THE LONG RUN KEEPS ITS DAY.** A first version stacked the **long** run to leave free days for easy runs — on the p.11 layout that put a long run on Thursday beside the bench while Saturday and Sunday sat free. The most expensive session stacked to protect the cheapest two. Easy runs stack instead.

**Files:** `shared/strength-system/strength-primary-plan.ts` + five test files. Commits `ddb31cc1`, `24771cce`.

---

### D-388 — "Strength Focus" is the discipline; "Strong Focus" is the block (2026-08-05, **PUSHED + CLIENT-DEPLOYED, NOT DEVICE-VERIFIED**)

The entry flow said **three names for one thing in four taps**: a "Strength Focus" card → a "Strength" tier screen → you pick "Strong" → the next header says "Strength Focus · 12 weeks".

**Strength is the DISCIPLINE** and keeps that name on the Train card beside Run Focus / Ride Focus / Athletic Focus. **Strong is the BLOCK** — the tier picked one screen later (D-383), and that is what `GOAL_LABELS.get_stronger` names.

⚠️ **A CONSTANT ONLY WHILE STRONG IS THE ONE LIVE TIER.** Heavy and Definition are the same `get_stronger` goal with a different tier, so this must **read the tier** the day either ships. The tier does not reach the payload yet (D-383 — `strength_tier` is taken by the EQUIPMENT tier), which is the only reason a constant is honest today.

⚠️ The posture step's title now reads `GOAL_LABELS` instead of a typed literal — the exact second-copy that label's own comment exists to prevent.

**Also on this commit:** the volume note (PMC5093324 — work-matched hard and easy running blunted leg-press strength almost identically, 28.7% and 27.5% against 38.5% for lifting alone; **volume was the mediator, not intensity**), placed at the mileage input because that is the decision it informs. And the lifting-days card, which was still promising *"one week in four goes back to four days to test your max"* — **a fourth day the engine no longer builds**.

⛔ **THE COPY GATE CAUGHT ONE AND MISSED ONE, AND BOTH MATTER.** *"How much to keep is yours to set"* trips `voiceViolation` on **keep** (banned imperative) and is second-person besides. *"give ground"* **passed the gate** and still breaks COPY-VOICE rule 10 — the banned list is finite and idioms have to be caught by reading. Passing `voiceViolation()` is necessary, not sufficient.

**Files:** `src/lib/non-race-goal-seeds.ts`, `src/components/NonRaceBuilder.tsx`, `docs/SPEC-assistance-fix.md`. Commit `4cae1d76`.

---

### D-389 — The hard session is 12 minutes, not 15, and the two papers that decide it (2026-08-06)

⛔ **THIS ENTRY EXISTS BECAUSE THE TWO FINDINGS THAT DECIDE THE HARD SESSION LIVED IN DIFFERENT FILES AND NEITHER POINTED AT THE OTHER.** One was in `DOCTRINE-aerobic-maintenance-run-only.md`, one was a code comment in `NonRaceBuilder.tsx`, and the sentence that connects them was written nowhere. **This is the canonical place. Both docs now point here.**

**The session:** `run_hills_4x180s_r180s_g5_8` — 4 × 3 min uphill at 5–8%, 3 min back down. **12 min of work.**

#### The two papers

| | What it says | What it decides |
|---|---|---|
| **Wen et al. 2019** — *J Sci Med Sport* 22(8):941–947, PMID 30733142, 53 studies | *"long-interval (≥2min), high-volume (≥15min) and moderate to long-term (≥4–12weeks) HIIT displayed significantly larger effects on VO2max (SMD=0.50–2.48, p<0.05)"* | The **ceiling** — what maximal VO2max work looks like |
| **Fyfe et al. 2016** — *Front Physiol* 7:487, PMC5093324 | Work-matched: RT only **+38.5 ± 8.5%**, HIT+RT **+28.7 ± 5.3%**, MICT+RT **+27.5 ± 4.6%** on leg press | The **cost** — what buying it spends |

#### The call, and the sentence that was missing

**Wen's recommendation is THREE conditions, not one — long-interval AND ≥15 min AND 4–12 weeks. We meet two.** The 3-minute rep clears the ≥2 min interval bar; a 12-week block is inside the window. **Only volume falls short: 12 min against 15.** One extra rep closes it exactly — 5 × 3 = 15.

⛔ **AND THE EXTRA REP IS BOUGHT IN THE CURRENCY THAT COSTS STRENGTH.** Fyfe found that hard and easy endurance, **matched for total work**, interfere with maximal strength almost identically. So intensity is not what you pay with — **total work is**, and a fifth rep is ~6 more minutes of it (3 hard + 3 recovery). On a **strength-primary** block, the ≥15 min threshold is a *gains* target for the aerobic side, and reaching for it spends the thing the block exists to build.

**So: 12 minutes. Structure from the evidence, volume from the maintenance context.** The shortfall is against one named criterion, deliberately, and is not an oversight.

⚠️ **KEEP THE MAGNITUDE HONEST.** ~6 min a week against ~20 miles is small. **The lever that actually moves strength is weekly mileage, not this rep** — which is why the athlete-facing note sits on the mileage input and not on the hill session.

#### ⛔ Three things about these citations that were wrong and are now fixed

1. **Wen was UNNAMED.** The doctrine said *"a separate meta-analysis of RCTs"* and the sentence was near-verbatim from an abstract nobody could look up — while every neighbouring claim in the same passage (Odden 2024, Maeo 2017, Vernillo, Helgerud 2007) was named.
2. **Fyfe was CYCLING, and the copy said running.** The conclusion reads *"whether HIT or MICT **cycling** is incorporated"*. Applying it to running overstates, since cycling carries less eccentric load. Shipped wrong on 2026-08-05, corrected 2026-08-06.
3. **The volume half is the authors' SUGGESTION, not their result.** They wrote volume *"might be a more critical mediator"*. They held work constant and varied intensity, so what is measured is that **intensity does not mediate**. The copy stated it flatly; it no longer does.

⚠️ **Helgerud's 4 × 4 is the shape this is built on, and ours is 4 × 3.** Same structure — four long reps, 3 min recovery — a minute shorter per rep. Stated, not hidden.

⚠️ **`DOCTRINE-aerobic-maintenance-run-only.md` contradicts itself below the prescription:** *"In a strength block, short-format uphill work is the default. Longer repeats are an endurance-led tool."* That line sits under a revision that retired its own reasoning. **The code follows the newer text (4 × 3 min). The stale line is still there.**

**Where the numbers live:** `shared/strength-system/strength-primary-plan.ts:682` (`hillSession`), `HILL_SESSION_MIN = 35`, `docs/DOCTRINE-aerobic-maintenance-run-only.md` §3 and "THE PRESCRIPTION THAT SURVIVES", `src/components/NonRaceBuilder.tsx` (the volume note).

---

### D-390 — The hill descent ends on the lap button, not a clock (2026-08-06, **PUSHED + DEPLOYED, NOT DEVICE-VERIFIED**)

**The recovery in a hill session is not a duration — it is however long it takes to get back down the hill the athlete actually has.** A 3:00 countdown answers a question it cannot know, and it is wrong in one direction every rep: at zero the watch buzzes and starts the next hard rep whether they are at the bottom or still walking down.

⛔ **THE CLIMB STAYS TIMED AND THE TWO ARE DOING OPPOSITE JOBS ON PURPOSE.** 3 minutes is the DOSE ([D-389]), so the work rep is a fixed countdown wherever it leaves the athlete on the hill. **Only the descent is open. Do not "make them consistent" by opening both.**

**Token:** `run_hills_{reps}x{work}s_rlap_g{lo}_{hi}[_d{walk|jog}]` — separate branch; the fixed-recovery hill is untouched and pinned by a test that says so. `hillSession()` emits the lap-button form with a **10-minute cool-down** (the fixed form's is 8).

#### ⛔ THE GARMIN SIDE, AND THE THIRD FAILURE WAS THE DANGEROUS ONE

The recovery carries **no `duration_s` at all**, and that absence is the instruction — it exports as **`durationType: 'OPEN'`**. Three places in `send-workout-to-garmin` treated a step with no time and no distance as malformed:

| where | what it did |
|---|---|
| interval builder, rest branch | `Math.max(1, sec \|\| 1)` → **a ONE-SECOND rest** |
| segment step builder | `continue` (dropped) |
| single step builder | `continue` (dropped) |

⚠️ **The first is the one that matters.** It does not drop the step and does not error, so the export **looks like it worked** and the athlete gets a 1-second recovery on the watch. Checked ahead of the coercion, not after. `durationValue` is now optional on `GarminStep`; every reader was already guarded, and an OPEN step contributes **0** to the duration estimate rather than `NaN`.

**Garmin ships this as a first-class option** — "Open Repeats" beside "Structured Repeats" — and the documented friction with canned hill workouts is exactly this: preset times that do not match the athlete's hill.

⚠️ **THE PLANNED DURATION NOW UNDER-READS.** `total_s` sums `duration_s`, so the open descents count as zero: the calendar shows ~32 min for a session that takes ~40. Not broken — a total that is honest about what it cannot know. **[Q-259].**

⛔ **NOT INCLUDED — the short-hill fallback.** Built and reverted the same day; see **[Q-260]**. It is an unsolved protocol question, not a missing branch.

**Files:** `materialize-plan/index.ts` (new branch, `expandRunToken` exported for test), `send-workout-to-garmin/index.ts`, `shared/strength-system/strength-primary-plan.ts` (`hillSession`), `materialize-plan/hills-lap-button.test.ts`. Commit `a5a1f19d`.

---

### D-391 — The hard-run terrain fallback: four options for the runner, bike inferred, flat separated by preference (2026-08-06, **PUSHED + DEPLOYED; card UI device-verified, placement fixture-verified**)

**This closes [Q-260].** The strength block's ONE hard aerobic session assumed a climb the athlete can run for three minutes. Q-260 asked what the athlete without one gets, and warned that the doctrine's own `10–12 × 40 s` fallback is the WRONG answer (short/moderate intervals hold less time at VO2max — Fleckenstein 2025, the BMC time-at-VO2max meta). **The answer was not a different single session — it was a menu.**

**Bike is inferred, not asked.** `hard_day.discipline` is the athlete's own pick on the D-327 "Your one hard day" card; `bike → bikeQualitySession` (4×4 Helgerud), `run → hillSession`. "None" is legal (no hard session). So the terrain question is **run-only** and only appears when Hard day = Run.

**The runner gets four options** (menu inside the card they are already on — **no new intake question**, per `DOCTRINE-aerobic-maintenance-run-only.md` §2.0 "availability reveals itself in the choice"):

| option | session | gives up |
|---|---|---|
| 3-min hill (preselected) | `4×3 min` uphill 5–8%, lap-button descent | nothing — best of both |
| treadmill | `4×3 min` @ 5–8% incline, fixed 3-min recovery | nothing — the belt IS the grade |
| short hill | `10×1 min` uphill 4–6% | some VO2 stimulus (1-min < 3-min reps; measured) — keeps the leg discount |
| flat | `4×3 min` flat, pace target allowed (not graded) | the leg discount — keeps FULL VO2 |

⚠️ **`2×8 min @ 3–4%` was scoped and deliberately NOT built** — it folds into "short hill" as a default. Adding a fifth card re-bloats the menu we chose to keep at four.

#### The one non-obvious engine decision — flat's clearance is a PREFERENCE, not a requirement

Flat is the leg-costliest option (no uphill discount, eccentric impact retained), so Michael's call (via the Wendler lens — keep hard conditioning off heavy-leg days) was to separate it further. **First built as a hard 48 h requirement — and reverted.** The 24-shape sweep showed it could not be satisfied in most weeks, and when it couldn't, the solver bought flat its space by moving a squat next to the LONG RUN — relocating the eccentric damage rather than removing it (8/12 flat weeks breached, 11/16 breaches against the long run).

**So it became a scored preference** (`week-solver.ts` `Anchor.preferredClearance` → `preferredClearanceShortfall`):
- Scored **above `spreadPenalty`, below `breachPenalty`.** Below breach = it is structurally incapable of buying its 48 h by breaching a real clearance (breach magnitude is element 1 of the score vector). Above spread = it outranks only another preference (the heavy-to-heavy 48 h is matrix-enforced and untouched). **It trades preference for preference, never preference for law.**
- Takes the extra separation when the week allows (8/24 shapes), silently falls back to the matrix 24 h otherwise (16/24), **0 breaches on any terrain.** The clearance-at-minimum note reads the raw matrix, so a week that declined the preference says nothing.

⚠️ **`generate-run-plan` bundles the changed `week-solver` via `assign-days` → `placement/simple`.** The preferred-clearance change is inert there (only flat terrain sets it; the race path never does), but it was redeployed to avoid a stale-solver bundle.

#### Copy (commit `53e050b8`)

Effect-framed and hedged where the leg→lifting cost is an inference, firm where measured. Dropped the money metaphor ("cheap on your legs", "pays for it", "full price", "buy for less") and the flat card's treadmill nudge (a scold — treadmill is its own card directly above). Short hill names the tradeoff precisely: "hold less **VO2 stimulus**" (measured, Fleckenstein). §2.1's blanket ban on flat VO2 is back-annotated in the doctrine: §2.0 governs, the athlete owns the stated trade.

**Files:** `shared/strength-system/strength-primary-plan.ts` (session builders, `hardRunSession`), `_shared/week-solver.ts` (`preferredClearance` / `preferredClearanceShortfall`), `materialize-plan/index.ts` (`_r{n}s` recovery group on `run_vo2`, `_tm` label-only suffix), `create-goal-and-materialize-plan`, `generate-strength-plan`, `src/lib/non-race-goal-seeds.ts`, `src/components/NonRaceBuilder.tsx`, `docs/DOCTRINE-aerobic-maintenance-run-only.md`, `shared/strength-system/hard-run-terrain.test.ts` (19 fixtures). Commits `caae1283` (feature) → `9728e485` (wiring fix) → `53e050b8` (copy).

---

### D-392 — The marathon block is a PRESCRIPTION with a prerequisite, and the prerequisite is computed from the window (2026-08-06, **PUSHED + DEPLOYED, fixture-verified**)

**Supersedes the arc's opening posture from the same morning.** The first version entered the long-run row wherever the athlete actually was and stated the ceiling that produced — a 9-week beginner topped out at a **9-mile long run** and the intake said so. Honest, and not a marathon plan: nobody finishes 26.2 off a 9-mile peak. "Honest about a plan that cannot work" is a worse answer than "here is the plan that works, and here is what it assumes."

**Michael's numbers turned out to be a formula.** He specified a 28 mi/wk base and a 10-mile long run for a 9-week beginner. Those are exactly `40 / 1.1⁴` and `18 − 2×4` — the peak worked backward at the only two rates the block may use: **2 miles a week** on the long run (the rows' own biggest step) and **10% a week** on volume (his cap, held, explicitly not raised). So `marathonPrerequisiteFor` computes it per window instead of storing a pair, and his hand-named numbers became the test that the formula is the rule he was describing rather than a fit to one case.

| | peak long run | peak weekly | share | 9-week base |
|---|---|---|---|---|
| beginner | 18 | 40 | 45% | 27 mi/wk + 10 mi |
| intermediate | 20 | 50 | 40% | 34 mi/wk + 12 mi |
| advanced | 20 | 60 | 33% | 41 mi/wk + 12 mi |

⚠️ **NONE OF THOSE NUMBERS IS NEW.** 18/20/20 against 40/50/60 are `LONG_RUN_PROGRESSION`'s maxima and `WEEKLY_MILEAGE`'s peaks, and 45/40/33 are the shares `MAX_LONG_RUN_SHARE` already documents the tables as embodying. This is the tables read backward.

**Short windows quote a high base; long ones stop binding** (14wk+ bottoms out at the row's own opening, 20 mi/wk + a 6-mile long run). Below ~5 weeks the prerequisite goes **unmeetable** — it would ask the athlete to arrive with a 16-mile long run so the block can "build" them to 18 — and the plan names the half instead of pretending.

**The peak long run is capped at 20 whatever the window.** Michael: *extra weeks add volume and repeat long runs, not a longer single run.* Higdon 20, Pfitzinger 20-22, Daniels caps by TIME.

**The plan states the assumption**, in `generatePlanDescription`: *"This plan assumes you're already running about 25 miles a week with a long run around 10. If that's not where you are, do the half — this build won't be safe for you."* That sentence is what makes an 18-mile peak honest rather than reckless, and it is the whole reason the model is allowed to change.

⚠️ **THE TRADE, STATED: an athlete whose real long run is 6 is prescribed a 10 in week 1** — a 67% jump — and the only thing protecting them is that sentence. That is what a prerequisite IS. Do not remove it.

⚠️ **BEGINNER-DERIVED ONLY IN PRACTICE — see [Q-262].** The function is level-general and the rows exist for all three, but only the beginner case has been walked end to end.

Two defects surfaced by verifying the matrix, both fixed here: **the week peaked three weeks after the long run** (the ramp targeted `taperStart`, so the 18-miler landed in a 36-mile week — a 50% share against the 45% the tables are built on), and **the peak week could be a cutback week** (every-4th-week cadence vs a race-date-derived peak; an 11-week block put its 18-miler in a deloaded week that also dropped to three running days). Volume peaks with the long run now and follows it down; the peak week is struck from `recovery_weeks` once, at the source.

---

### D-393 — The long-run arc is anchored to RACE DAY, not to week 1 (2026-08-06, **PUSHED + DEPLOYED, fixture-verified**)

`LONG_RUN_PROGRESSION` was read forward from week 1, and **the row's tail IS the taper** — so any plan shorter than its row never reached it. A 9-week beginner climbed to a 10-mile long run and raced on it: the biggest long run of the block in race week, no taper anywhere.

`buildLongRunArc` (`src/lib/run-volume-tables.ts`) lands the row's final peak on the **peak week** — the last week whose long run sits **more than 14 days out** — and tapers off whatever peak was actually reached. 15 days is not a taste: `getRaceProximitySession` already clamps anything inside 14 days, so a peak landing there would be silently halved by a rule two functions away.

⚠️ **AT FULL LENGTH IT IS A NO-OP** — a 20-week marathon with no history returns the row unchanged, taper included. Pinned by a test.

**The taper caps became fractions of the peak (0.8 / 0.6).** They were flat 8 and 10 — numbers calibrated for exactly an 18-20 mile peak — and left flat they crushed the taper they were written to protect: 18 → 14 → 10 printed as 18 → 10 → 8. **There were THREE copies**, and the third (on the non-race-week path) survived the first sweep.

**The easy-run ceiling is half the long run, max 10, not a flat 6.** Six was the binding constraint the moment the peak moved: a four-day week of 18 + 3×6 tops out at 36, so a higher target could not be built and the week silently came up short.

**The peak-pivot branch is DELETED** (~70 lines of percentage arithmetic that ran *instead* of the arc for any athlete with a long run over ~13 miles on a ≤10-week plan). It was the last thing quoting a different plan than the one built: a 14-mile athlete was told 18 and built 13. Its one distinct input was `transition_mode`, which still reaches `resolveEffectiveStartVolume` where the fatigue guard lives.

---

### D-394 — The marathon timeline gate WARNS; it does not refuse (2026-08-06, **PUSHED + DEPLOYED**)

**Supersedes [D-386].** Michael: *same "warn, no wall" as the mileage floor.*

The 2026-08-04 call was *timeline, unlike mileage, is where we stop* — mileage is a judgement about a body, a race inside the floor is arithmetic. **The half that was wrong is "arithmetic":** the engine does have a plan for them. It builds to the weeks available, anchors the peak to race day, tapers into it, and states the long run it will reach. Short is a worse block, not an impossible one, and this app's posture on worse-but-chosen is to price it.

⚠️ **THAT ONLY HOLDS BECAUSE OF D-392/D-393.** The warning without the race-day anchor, the duration trim and the stated ceiling is a shrug. With them it is a priced decision.

**There were TWO walls.** `generate-run-plan/validation.ts` rejected the identical case one call later (a beginner marathon under 14 weeks came back `400 Invalid request`), so demoting only the caller would have moved the wall somewhere with worse manners. Both demoted; the four-week minimum stays an ERROR because it is what `determinePhaseStructure` can physically lay out.

**The support modes still suppress the warning** (`race_support` / `bridge_peak`, gated on evidence). **Not touched:** the triathlon path's own `race_too_close`, now the only hard timeline refusal in the file.

---

### D-395 — The athlete's SELECTED easy pace anchors every prescribed pace and duration (2026-08-06, **PUSHED + DEPLOYED**)

The VDOT ladder ran learned threshold → **5K-derived effort score** → easy pace. So an athlete with a 25:21 5K on file who had SELECTED "use my runs, 12:35" got every session written off the 5K — a number they had explicitly declined. The easy pace was last because when that rung shipped (the same morning) the question was "can we print a pace at all"; once the athlete can choose, the answer outranks the seed.

`resolveCurrentRunEasyPace` already IS the selection (Q-174 tiers). Reading it FIRST is most of the change. **One anchor, not two:** the VDOT is derived FROM the selected pace so the quality zones move with it, and the exact number travels as `easy_pace_sec_per_mi` and prints verbatim rather than round-tripping through the table.

**`milesToMinutes` is overridden on the sustainable generator.** The base class prices miles at a per-level constant (beginner 11:00/mi), so a plan printing 12:35 stored durations as though run at 11:00 — the same two-sources gap that rendered a 26.2-mile race as **21.3 miles**.

⚠️ **THE "A TIME" PATH IS UNCHANGED** — `performance_build` builds from `effort_paces`, where a race result is the right anchor for interval targets.

---

### D-396 — A plan may not outlive its race, and race day is a row on it (2026-08-06, **PUSHED + DEPLOYED**)

**The plan outlived the race.** `weeksOut` is counted from TODAY; the block opens next Monday. A race 10 weeks out landing in plan week 9 built an empty week 10 on the calendar. Trimmed by `planWeekContaining` (`_shared/planning-context.ts`); `weeksOut` itself is untouched because the timeline question and the length question are different questions.

**The race was not on the calendar.** `case 'race'` said *"don't add a training session"* and added nothing, so a completion plan ended on a Saturday shakeout. It has a row now, on the actual race weekday (not `performance-build`'s hardcoded Sunday), stating the distance and targeting no pace — this path has no goal pace by construction.

⚠️ **THE TOKEN IS THE DISTANCE, AND THAT NEEDED A FIX IN `materialize-plan`.** A time token makes distance the DERIVED quantity: 288 minutes expanded at the athlete's easy pace rendered the marathon as **21.3 miles**. The expander matched `longrun_(\d+)mi` — integers only — while the grammar has always allowed decimals (`validation.ts:312`), and every race distance is a decimal. Now `longrun_([\d.]+)mi` + `parseFloat`.

⛔ **THE DEPLOY TRAP, TWICE, AND BOTH ARE STILL OPEN:**
- `_shared/planning-context.ts` gained `planWeekContaining`. **Four other functions import that file
  and were NOT redeployed** — `coach`, `compute-snapshot`, `learn-fitness-profile`,
  `planning-context` (all last deployed 2026-08-03). The change is purely ADDITIVE and nothing else
  calls the new function, so their behaviour is identical today — but they are carrying a stale copy
  and the next person to change that file for real must redeploy all five.
- `materialize-plan` (v252) shipped for the decimal fix and **had not been deployed since well before
  this session**, so it picked up whatever else had landed on `main` in between. Its own 59 tests
  pass and the full edge suite's 10 failures are byte-identical before and after — but that is a
  wider surface than the two plan functions this session otherwise touched.

**Race week is anchors-then-fill.** `shakeout` and `easy_short` pushed with no day-count guard, so race week ran six sessions for a four-day athlete. Neither walk direction fixes it (forward drops the shakeout; backward breaks the week before). The shakeout and the Sunday long run are ANCHORS and claim their slots first; race day is exempt from the count.

---

### D-397 — The intake's own answers reach the engine: day count, strength "none", typed long run (2026-08-06, **PUSHED + DEPLOYED**)

Three separate "collected, stored, never read" defects on the marathon path.

**The day count was the band's MIN.** `create-goal` built `${n}-${n+1}` and `getRunningDaysForWeek` takes the band's MAX on build weeks — so 4 came back as 5 runs a week, all block. Anchored at the max now (`${n-1}-${n}`): build weeks get the number picked, cutbacks one fewer. **Two silent 400s died with it** — 7 days built `'7-8'` (not a legal string) and 6 days built `'6-7'`, which `sustainable` does not support, so the top option on the app's most common race goal could not build a plan at all.

**"None" for strength shipped two lifting days.** No single file was wrong; the answer was reconstituted three steps downstream. The card writes `posture.strength = 'out'` and correctly sends no protocol → `assemblePayload` sent `develop ? 4 : 2` (out is not develop, so 2) → `arc-setup-persistence` sees a non-zero frequency and WRITES a protocol into the goal row → `create-goal:3761` gates the whole overlay on that field. One helper now: develop 4, maintain 2, **out or unset 0** — and 0 was already the language the persistence layer spoke.

**The tier seed beat ingested volume, and the typed long run was dropped.** `target_weekly_miles` always arrives populated (the level button seeds it), so the engine took the LEVEL BUTTON's number over everything ingested. Equality with `TIER_SEEDS` now marks it a prefill, and it loses to ingested volume **when that is higher** — one-directional because `weeklyMiles` is `workload/10`, a proxy that under-reports easy running by roughly a third. `recent_long_run_miles` from `training_prefs` is read at all for the first time.

---

### D-398 — The intake week card: the week drawn once, the questions under it (2026-08-06, **PUSHED, NOT device-verified**)

> **⤳ CONTINUED 2026-08-07 — see [D-399].** The card was restructured further: run days are now
> read-only **"Auto"** (only the long run and the standing session are tappable), the card sits ABOVE
> the day row, the run/ride club toggle is inline, and **"Club night" → "Standing session"**. The
> per-day role FILL described below is superseded — the pills now pin only the long run and the
> standing session (`weekRoles` gets `trainingDays: []`). The mode-then-target pattern and the four
> rejected layouts below still stand; everything below is history.

Michael iterated this on device until ~10:30pm and **four layouts were built and rejected**. Recorded so nobody rebuilds one:

| built | rejected because |
|---|---|
| three separate cards (days / long run / club) | *"ONE FUCKING CARD"* — a screen per question, two thirds of the phone empty under each |
| one card, questions advancing on a Next tap | it arrived BLANK and asked one question at a time — a form, not a week |
| one card, three chip rows visible at once | the week is drawn three times; it reads as three weeks |
| seven rows, tap a day to cycle its role | rejected before build — the cycle is a hidden affordance |

⚠️ **AND REST IS THE REMAINDER, NOT A QUESTION.** A fourth question ("which days are full rest?")
was built and reverted within the hour — Michael: *"REST WILL BE WHATS LEFT."* The argument FOR it is
recorded because it is not silly and will be re-made: the leftovers are not all rest, since a
strength session lands on one of them, so an `R` on a non-running day promises a day off the plan
then fills. He heard it and chose the simpler week. `rest_days` reached `buildPreferredDays` and
`assign-days.ts` in that build and was reverted out of both; do not re-add either without asking.

**What he landed on:** the week drawn ONCE; the three questions listed under it with their current answers; **pick a question, then tap the days.** That is the alarm-repeat / calendar-label pattern (mode-then-target). The run apps all repeat a day picker per question, one screen each — the version he rejected first.

- **The week arrives laid out** (5 days, long run Sunday — what the plan builds anyway when nothing is pinned). ⚠️ This overrides the 2026-07-29 no-prefill rule *only here*: that rule was written against controls arriving ANSWERED and hiding the question; a blank week reads as a broken screen.
  > ⚠️ **THE NO-PREFILL RULE WAS TESTED AGAIN ON 2026-08-10 AND HELD — see [D-409].** The Strong Focus
  > counts ("Runs a week", "Rides a week") shipped unset under this rule, and the server's fallback for
  > an absent `run_days` is a hardcoded **2** — so "no prefill" was quietly producing a prefill with the
  > answer HIDDEN, which is the same defect one layer down. The fix was to REQUIRE the answer, not to
  > pre-select one: pills stay unlit, the row reads "Pick one". ⛔ Do not read D-409's "counts are
  > required" as permission to seed a default here. Both entries say the same thing — never answer for
  > the athlete.
- **Fill carries the day's ROLE, a ring carries what you are editing.** Crossed at first — the fill marked the active question, so selecting "Club night" with none set blanked the whole row.
- **Every day is tappable on every question.** Greying out non-run days meant an athlete whose long run is Saturday tapped Saturday and got nothing; picking a rest day now adds it as a run day and assigns it.
- **The gate states itself** — four run days and a long-run day are required (both structural), and the disabled button now says which is missing.
- Roles: **R rest · E easy · LR long run · C club night**, derived once in `week-budget.ts` (`weekDayRoles`), pinned by six tests. `C` is deliberate over `H`/`E`: it names the athlete's commitment rather than classifying the session, so it cannot contradict the plan whichever way the hard/easy answer goes.

---

### D-399 — The non-race builder is ONE themed instrument: the "digital galaxy" visual language + a discipline-driven accent (2026-08-07, **PUSHED, NOT device-verified**)

The wizard was generic teal — Michael: *"generic 8 sleep wellness crap"*. It is now the "digital
galaxy": a deep-space frame under an accent that is **driven by the discipline/goal, not hand-picked
per screen.** The whole point is that `NonRaceBuilder` + `StepLayout` are ONE frame — theme the frame
once and every step (marathon, Strong Focus, and every future non-race path) inherits it.

**The system lives in exactly three places — do not scatter it (full recipe: `docs/REFERENCE-wizard-visual-language.md`):**
1. `src/components/wizard/StepLayout.tsx` — the `accent?: string` prop → `A = var(--wiz-accent-rgb, <UNIVERSAL_RGB>)`; drives the instrument-key CTA, the progress bar, the commit-step shimmer.
2. `src/index.css` — `.wizard-galaxy` + `::before`/`::after` (nebula / light / stars / grain), the nav-lock (`body.wizard-active`), `.wizard-key-shine`.
3. `--wiz-accent-rgb` set on the wizard root in `NonRaceBuilder.tsx`, read from `SPORT_COLORS` (`context-utils.ts`) via `getDisciplineColorRgb()`. **Never a literal hex.**

**The rules that came out of it:**
- **Accent = the leading discipline, else the goal's own colour.** `wizAccent = state.discipline ?? (goal === 'marathon' ? 'run' : goal === 'get_stronger' ? 'strength' : undefined)`. The `get_stronger` fallback was the whole Strong Focus fix — `state.discipline` is never `'strength'` on that path, so without it the entire flow rendered on the off-white universal accent while marathon (run/gold) did not. run=gold, strength=amber.
- **A sport SELECTOR carries its own sport colour; the block chrome carries the accent.** On the Strong Focus scheduler the Run/Ride hard-day toggle + Runs/Rides count chips are gold/green (the app's multisport wayfinding language, the same pattern the marathon club toggle uses); the block itself stays amber. It is identity, not a cost signal — the §5 note against implying a hard ride is "cheaper" than a hard run is about COPY, and no number here claims one.
- **Sigils, not borrowed icons.** The Train entry card was literally the run discipline icon (`Activity`) → **`Gauge`** (the live card is `GoalsScreen.tsx:2394`; NonRaceBuilder's `ENTRY_COPY` is a decoy, kept in sync). The Focus heading (`GoalsScreen.tsx`) now wears the `eye-mark` sigil like the Focus tab + the wizard step titles, instead of being the one Focus surface without it.

Client-only, Netlify. Marathon layer commit `a2d772ee`; Strong Focus `749c2072`; sigils in the docs commit. **Preview-verified, NOT device-verified.**

---

### D-400 — `LOWER_HYPERTROPHY` is a registered intent, and the placement predicates are TOTAL (2026-08-07, **PUSHED + DEPLOYED**)

"Keep it heavy" (`neural_speed`) emits `LOWER_HYPERTROPHY` (`performance-neural.ts:162`, formerly
`as any`). That intent was **not in `INTENT_DEFS`**, so `isLowerIntent`/`isUpperIntent` did
`INTENT_DEFS[intent].category` on `undefined` and threw `Cannot read properties of undefined (reading
'category')` — the WHOLE plan build crashed (arc-preview → `create-goal-and-materialize-plan`).

The fix, and the invariant: **register the intent** (`intent-taxonomy.ts` — added to the
`StrengthIntent` union + an `INTENT_DEFS` entry: lower, repRange [8,12], intensity [65,75],
avoidWithinHoursOf {LONG:48, QUALITY:24}), **drop the `as any`, and make the predicates total** —
`INTENT_DEFS[intent]?.category === 'lower'`. A placement predicate over a taxonomy must degrade to
`false`, never throw, or one unregistered intent takes down the entire generator.

Deployed to all **7 strength bundlers** (the `_shared` trap): `create-goal-and-materialize-plan`,
`generate-combined-plan`, `generate-run-plan`, `generate-strength-plan`, `generate-triathlon-plan`,
`materialize-plan`, `rematerialize-strength-block`. Commit `a2d772ee`. **This is Task 1 of
`HANDOFF-placement-unification-2026-08-07.md` — done.**

---

### D-401 — Placement is the OPTIMIZER's, in every generator; the count stays the caller's (2026-08-07, **IN WORKING TREE — not committed, not pushed, not deployed**)

Task 2 of `HANDOFF-placement-unification-2026-08-07.md`. The handoff asked for
`strength-system/placement` (`simplePlacementPolicy`) to be adopted inside `generate-combined-plan`.
**Rejected, and reversed:** that module is a hardcoded Hal Higdon / Jack Daniels weekday grid
(`placement/simple.ts` says so in its own header), so adopting it would install a SECOND
day-authority — which the handoff's own constraint, and CLAUDE.md, forbid. Combined-plan already
uses the sole authority. Unification therefore runs the other way: toward `_shared/week-optimizer.ts`.

**What was actually broken** (the handoff's causal claim did not survive the trace — see [Q-268]):

1. `generate-combined-plan/week-builder.ts` placed the second easy run of a run-only plan on a
   literal `grid.get('Thursday')`. No optimizer, no dispersion, no check of what was already on the
   day. Whenever the optimizer put the quality run on Thursday — the common case — the athlete got
   intervals **and** an easy run on the same day; when `run_easy_day` also resolved to Thursday, two
   easy runs stacked on it. A 640-config sweep over full plan length hit it in **13,440 of 30,720
   generated weeks**. After: **0**.
2. `generate-triathlon-plan` laid out every standalone tri plan from a literal table with no
   long-run guard at all. `strength_1` is the LOWER slot (sessionIndex 0) and sat on Monday whatever
   day the long run was — **the one live generator where lower-on-long-run was genuinely reachable.**
3. When the optimizer REFUSED a strength slot (no legal lower day — e.g. a Monday long run, where
   48h-pre blocks Sunday and the long run blocks Monday), the tri generator read the partial answer,
   found the slot unset, and fell back to the literal Monday. **The guard produced the right answer
   and the default overrode it.** A refusal now reduces the session count instead.

**The rule established: the optimizer owns WHICH DAY, the caller owns HOW MANY.** New
`preferences.easy_run_count` (default 1 → every existing caller byte-identical) and
`preferred_days.easy_run_extra`. The count still comes from the builder, so run volume did not move:
of the weeks whose run count fell, **every single one was explained by deleting a stacked session —
zero unexplained losses** (measured, not asserted).

Also: **dispersion is discipline-generic now.** `easyRunAnchorAdjacencyPenalty` was run-only, so easy
bike/swim work was placed first-available with no spacing term; it is now
`easyAnchorAdjacencyPenalty(day, qualityDay, longDay)` with the run version delegating, applied to
easy_bike as well. And the load balancer may no longer stack two sessions of the SAME kind on one day
— the same-day matrix has nothing to say about `easy_run × easy_run`, so once a week carried two, the
balancer consolidated both onto one day and the rest-budget pass then cleared the day and dropped
BOTH ("displaced easy_run + easy_run").

Science: the RULES are cited, the weights are ours. Seiler polarized/80-20 → spread the easy days so
the hard days can be hard. Hickson 1980 concurrent-training interference → lower-body strength clear
of the long run. Bowerman → Daniels hard-easy → the adjacency penalty. The `+4`/`+8` literals are
tuning params, uncited, and labelled as such in code.

Regression locks: `generate-combined-plan/easy-session-placement.test.ts` (bug case + 640-config
sweep + "the builder names no run day of its own"), `generate-triathlon-plan/slot-placement.test.ts`
(every long-run weekday; pin-on-long-run refused; refusal reduces count).

⚠️ Touches `_shared/week-optimizer.ts` — **the `_shared` deploy trap applies.** Not yet deployed.

---

### D-402 — One plan-deletion path, and a teardown failure is a VALUE not an exception (2026-08-07, **committed `65facc83` — not pushed, not deployed**)

Task 3 of `HANDOFF-placement-unification-2026-08-07.md`. Deleting a plan was two paths that disagreed.
`AppContext.deletePlanCascade` is now the only one behind a user-facing delete button: it resolves the
plan's `goal_id` and routes to `delete-goal` when there is one (the robust op — handles standalone,
combined, and rebuild), falling back to `delete-plan` for goal-less plans. The weekly-planner path it
replaces did neither half correctly — it left the goal untouched (the phantom on Focus) **and** it
bulk-deleted COMPLETED workouts by name-matching "Week 1".."Week 4", unscoped to the plan, so any
workout in history with that name went with it. Executed workouts are the athlete's record; a plan
delete does not touch them.

**The phantom-forever mechanism, which is not what the handoff guessed.** The handoff assumed a
dangling plan-ref made the goal undeletable. Traced: no such branch exists — every FK into `goals` is
`ON DELETE SET NULL`, and a goal with no plans is a clean two-step delete. The real cause was that
`invokeFunction`'s `fetch` was unguarded, so a cold start or network blip on the `delete-plan` call at
step 4 threw past the goal delete at step 5 into the outer catch → 500, goal still there, forever,
because the thing that fails is the PLAN teardown while the thing the athlete is removing is the GOAL.
It now returns `_ok: false`. The design already intended this — step 5 runs before the rebuild, and the
`planErrors` message exists to say "goal gone, plan left behind" — but that only holds if a teardown
failure is a value. `delete-plan` also validates `plan_id` as a UUID before the interpolated `.or()`
filter (a non-UUID was a PostgREST 500, i.e. a failed teardown) and treats an already-gone plan as
success.

**Rebuild counts LIVE plans only.** A directly-linked COMPLETED/ENDED combined plan used to contribute
its `goals_served` siblings and could rebuild a season around last year's races.

**Rejected: widening the `goals_served` sweep to every status.** It would have killed the dangling
reference an ended combined plan keeps to a deleted goal — at the cost of deleting a finished season's
plan as a side effect of removing its race. The reference is inert: `GoalsScreen.plansByGoalId`
(`GoalsScreen.tsx:686`) keys by goal id, so an entry for a goal that no longer exists is never looked
up. Asymmetry documented in code instead of "fixed".

Regression lock: `delete-goal/plan-goal-links.test.ts` (16 fixtures; the phantom — goal with zero
linked plans → nothing to tear down, no siblings, no rebuild — is the permanent one). The client
routing has no automated cover; there is no client test runner in this repo.

⚠️ Deploy list: `delete-goal`, `delete-plan`. Client change ships with the Netlify build.

---

### D-403 — ONE planned-session read-model: one duration reader, one discipline vocabulary, one row contract (2026-08-09, **SHIPPED — stage 4 landed in `ae1a099e`**)

> ⚠️ **HEADER CORRECTED 2026-08-10.** It read *"stage 4 in working tree — NOT pushed"* for a day after the work was pushed (`ae1a099e`, "Stage 4 — cleanup + enforcement; planned-session migration complete"). Verified against `git log`. A status line that outlives its own commit is how the next session re-does finished work.

**The problem.** A planned session was represented several ways and they drifted. Every bug in the
discipline-swap work of 2026-08-08/09 was an instance of one class, not three separate defects:

- The swap gate read the root duration; the row printed the steps-sum. Card showed `63:00`, gate
  computed `0`, and the control vanished **on one surface only**.
- The posture map keys the bike as `bike`; the swap's vocabulary says `ride`. The gate read
  `posture['ride']` — always `undefined` — so a **develop** bike was offered a swap it should never
  have had.
- A duplicate calendar session, because `get-week`'s membership key included `type`, and `type`
  stopped being immutable the day the swap shipped.

Each was fixed at its own call site. **The class was not fixed, and the unit tests were green through
all of it** — they tested the readers against row shapes the app does not actually produce.

**The decision.** Collapse onto one read-model, in five stages, each shippable and verified by golden
fixtures pinned BEFORE any migration (`src/lib/planned-session-golden.test.ts`, stage 0).

| what | where | replaced |
|---|---|---|
| `plannedDurationSeconds()` / `plannedDurationMinutes()` | `src/lib/planned-session/duration.ts` | 4 ladders + 6 inline reads |
| `storedPlannedTotalSeconds()` | same file | the badge's narrow contract |
| `normalizeDiscipline()` / `normalizeSessionType()` / `normalizeProviderSport()` / `postureKey()` | `src/lib/discipline.ts` | 6 normalizers + 2 more found in stage 4 |
| the server's `planned_workout` | `get-week:1489 toPlannedWorkout` (+ `duration`) | `mapUnifiedItemToPlanned`, **deleted** |

**⛔ THE FIVE THINGS THAT WOULD HAVE BEEN LOST BY A NAIVE COLLAPSE.** Each was caught by tracing or by
a fixture, not by review, and each is the reason this entry is long:

1. **`normalizeSport` knew `walk`/`hike`/`mobility`.** Pointing it at `normalizeDiscipline` (four
   trainable disciplines) collapsed all three to `''`, so a completed walk ranked **cross-sport**
   against a planned walk: *"Planned session — you did a session"*. Hence TWO accessors —
   `normalizeDiscipline` for anything that **gates**, `normalizeSessionType` for anything that
   **ranks or labels** over `planned_workouts.type`.
2. **Distance-priced steps** lived only in `PlannedWorkoutSummary.computeMinutes`. Without them
   "6 × 800m @ 5k pace" reads as having no duration at all.
3. **`computed` as a JSON string** lived only in `computeMinutes`; `resolveMovingSeconds` returned
   null for it. Not reachable from the server contract, but the direct table readers still see it.
4. **`resolveMovingSeconds` is TWO readers keyed on `workout_status`.** Only the PLANNED branch moved.
   Collapsing both would put executed-time logic behind a planned-session name.
5. **The two row mappers were NOT in a superset relationship**, though the spec said the client's was
   "a shadow of" the server's. Client-only: `duration`, `timing`, `pairing`. Server-only:
   `display_overrides`, `expand_spec`, `pace_annotation`, `workout_title`. Only `duration` was
   load-bearing (a real column `materialize-plan` writes; `get-week` never selected it). `timing` and
   `pairing` were structurally always null.

**Rejected: making `resolvePlannedDurationMinutes` wrap `plannedDurationSeconds`.** It feeds a
displayed badge and a wrong duration on screen is a lie, so its null-on-nothing contract is
deliberate. It wraps `storedPlannedTotalSeconds` — the root total alone. Pinned by a fixture, because
"don't add fallbacks" as a comment is what failed the first time.

**Rejected: defaulting an unknown discipline to `run`.** Two normalizers did, in the code that decides
which planned session a completed activity attaches to. A kayak was offered the athlete's runs. A
discipline we cannot name is `null`.

**Rejected: folding `GarminDataService` onto `normalizeDiscipline`.** Measured: `road_biking`,
`mountain_biking` and `mtb` all answer **null** there (the ladder tests `includes('bike')`, and
"biking" does not contain "bike"). Every MTB and gravel ride would have dropped out of the learning
pipeline silently. Provider vocabulary is a genuinely different question and got its own named
boundary, `normalizeProviderSport`.

**Deliberate behaviour changes — two, both pinned:**
- **The summary now prefers the stored total over the steps-sum.** `computeMinutes` was the only
  reader that preferred the sum; on a row carrying both (root 3600s, steps 2400s) the summary printed
  40 min while the chip you tapped to reach it printed 60. All four surfaces now say 60.
- **`TodaysEffort` drops an item `get-week` could not classify** instead of rendering a nameless
  placeholder card (executed row, no `computed.overall`, no intervals, no logged sets, no planned
  link → status `null`, `get-week:881`). One-line revert if that placeholder mattered.

**⛔ THE ENFORCEMENT IS THE POINT** — `src/lib/planned-session/enforcement.test.ts`. A source scan
(not eslint: a custom rule needs a plugin package, and `CLAUDE.md` forbids speculative npm deps) that
fails on a new `.total_duration_seconds` read, a new discipline substring ladder, a revived client
mapper, or a normalizer that answers `'run'`. Negative-control verified: a file with all three
violations fails all three rules. **Without this, the class regrows** — that is exactly how four
duration ladders came to exist, each individually defensible.

⚠️ **A BASELINE, NOT A CLEAN BILL.** The scan froze **15 pre-existing ladders in 11 files** as known
debt (mostly analysis-side / completed-side, which SPEC §2 scoped out — see Stage 1b below). The list
may only shrink. Honest limit: it is per-FILE, so a new ladder inside one of those 11 still slips.

**What is still OPEN — this decision does not claim continuity is total:**
- **Stage 1b, the analysis-side vocabulary.** `_shared/state-trend/assemble.ts:167` emits `bike` and is
  CORRECT there (`StateDisplayV1` cards are keyed `bike`); `useStateTrends` was deliberately NOT
  migrated. `auto-attach-planned/index.ts:16 sportSubtype` **still returns `'run'` on unknown** — the
  mis-attach defect surviving on the server. Needs its own stage, fixtures and a deploy.
- **The 15 baselined ladders.**

**Verification.** 26 golden fixtures + 8 contract tests + 5 enforcement tests. `workout-mappers.test.ts`
was retargeted at the server's shape and carries a **drift guard** that reads `get-week/index.ts` and
fails if the real mapper loses a field the test mirrors — negative-control checked. `tsc` error count
identical before/after at every stage. **No device verification yet on any stage.**

⚠️ **Deploy list: `get-week` ONLY** — it is on every calendar read, which is why stage 3 went alone.
Everything else is client and ships with the Netlify build.

> **Supersedes the spec doc.** `docs/SPEC-planned-session-consolidation.md` was the build contract for
> this work and is **deleted** per the spec lifecycle in `CLAUDE.md`. Its substance is above; its two
> wrong claims are recorded here rather than lost — §3's "the client's is a shadow of it" (they were
> not comparable) and §1's four-priority duration table (there is a fifth rung, prose-scraping).

---

### D-404 — A strength-purpose block runs the STANDARD assistance templates, not the concurrent chapter (2026-08-09, **SHIPPED — `eee1a86c`**)

> ⚠️ **HEADER CORRECTED 2026-08-10**, verified against `git log` (`eee1a86c`). It claimed uncommitted for a day after it shipped.

**Supersedes the assistance-template half of D-385 and the pull-slot half of D-328. Both are back-annotated.**

**The premise changed; the merits were never re-litigated.** D-328 and D-385 both rest on one clause —
*"the concurrent chapter, which is our athlete."* Wendler's p.86–88 is written for a lifter whose
conditioning is being programmed alongside the lifting, and both entries read Efforts' athlete as that
case, so the concurrent chapter governed the assistance.

**A strength-purpose block is not that case.** The athlete chose to point a stretch at strength; their
running or riding is their own business and is not what the assistance is arranged around. Under that
premise the **standard** templates govern — Triumvirate p.48 and Periodization Bible p.50–51 — and
those two pages say something different from p.86–88.

⚠️ **THIS IS NOT THE CORRECTION D-385 FORBADE, and the distinction is the whole entry.** D-385 closed
with *"Do not 'correct' it to triceps by citing p.51."* It was right to: nothing new has been learned
about p.51 or p.87, and re-deciding them on the merits would be a session overturning a read it cannot
improve on. What changed is **which chapter has jurisdiction**, which is upstream of the merits.

**Two changes, both from that one premise:**

1. **The pull slot no longer crosses the plane.** The p.86 rule (vertical push → horizontal pull) is now
   gated behind `AssistanceTemplate = 'standard' | 'concurrent'`, defaulting to `standard`. The athlete
   keeps chins on the press day; the 25–100 rep scaler is what makes the count survivable for a
   low-capacity athlete, which was already the mechanism handling the "clean max is six" problem the
   swap was reaching for. ⚠️ **`concurrent` has NO production caller** — retained, stated in the code as
   retained, and tested on both branches. If a concurrent or hypertrophy block never arrives, delete it.
2. **The upper-day third slot is ARMS, not core.** p.50–51 closes press day and bench day on **triceps**
   and keeps abs on the two lower days. `ROLE_BY_DAY.upper.single_leg_core: 'core' → 'arm'`.

**Rejected: a fourth slot.** The work order originally asked for an added arm slot. p.50–51 puts triceps
*inside* the day's three, not beside them, and a fourth accessory adds volume to a block whose whole
reframe is that **strength is preserved under high cardio and size is not** (Wilson 2012, AMPK–mTOR) —
so it chases strength and buys no pump volume. Michael's call, 2026-08-09. Three slots stayed three and
**the storage keys never moved** — `AssistancePicks` is untouched, so no migration and no default for
picks saved before today.

⚠️ **Abs were not deleted.** `ROLE_BY_DAY.lower` re-roles the push key to core, so squat day and
deadlift day each close on the trunk — twice a week, which is p.51's own prescription. Pinned by its own
test (*"abs did not vanish: they hold both LOWER days"*) so the swap cannot quietly become a deletion.

⛔ **`isDirectArm()` IS A SECOND ACCESSOR, NOT A SECOND TAXONOMY — and this is the CLAUDE.md
`MovementGroup`-vs-`MovementPattern` shape one axis over.** A triceps pushdown's `pattern` is
`horizontal_push`, and that is **correct**: it genuinely loads the pressing pattern, so it must keep
colliding with a bench press. It is simply blind to *"compound press or direct arm work?"* — the
question the arm slot asks. So `armIsolation?: boolean` was added to `ExerciseConfig` (6 entries) with
`isDirectArm()` sitting **beside** `getMovementFamily()`, each noting which question it answers.
**Adding `arm` to `MovementPattern` would have made a pushdown stop sharing a family with the bench
press and sent the collision rule quietly blind.** `fitsRole('arm')` therefore reads the flag, never
the family — testing `fam === 'push'` would let a compound press fill the arm slot and a pushdown fill
the push slot, shipping a press day with three presses and no isolation.

⚠️ **The arm options had to join the MENU, not just `ROLE_FALLBACK`.** The slot's own list is searched
before the fallback, so a menu with no arm movement would have meant the athlete's pick was overridden
on **every** press day — the app asking a question it could never honour. Four options added to
`single_leg_core` (Diamond Push Up, Tricep Extension, Tricep Pushdown, Close Grip Bench Press),
bodyweight first so the slot is never gated on a cable stack.

**Biceps are selectable, triceps stays the default** (Michael, 2026-08-09). Dumbbell Curl and Hammer
Curl are on the menu **last**, and the ordering IS the default — `resolveRole` takes the first option
that fits the role, so an athlete who never opens the card lands on Diamond Push Up. Put a curl above
the triceps options and every un-picked press day silently becomes a biceps day; a test pins the
ordering for exactly that reason.

⚠️ **The rationale is a preference, not a template quote, and the code says so.** p.50–51 lists
"Triceps" for both press days and no direct biceps work anywhere — because the pull slot already
trains them: a chin-up is elbow flexion under load. Triceps is the arm the block does not otherwise
hit directly. Curls are there because an athlete may want them and the slot honours picks (§5.2b).

⛔ **A CURL NEEDED NO COLLISION EXEMPTION, BECAUSE THERE IS NO COLLISION CHECK LEFT TO EXEMPT IT
FROM — and this is worth recording because it is not what the entry points suggest.** The concern was
reasonable: a curl and a chin-up are both elbow flexion and both family `pull`, so a rule reasoning
about the pull family would read the pairing as redundant and override the pick. But
`sharesMovementFamily` has been **deliberately un-imported** from `assistance-menu.ts` since D-385
(the note sits at the top of the file) — "does this share a family" was the OLD collision question and
it is asked **nowhere** in the resolution path. `fitsRole('arm')` reads `isDirectArm` and nothing else,
so the pick passes through untouched. A test now pins the curl-beside-chin pairing so that stays true
if anyone reintroduces family reasoning into the slot.

⚠️ **`armIsolation` therefore spans BOTH families, which is the point of it being its own axis** —
triceps are `horizontal_push`, curls are `horizontal_pull`, and both answers are correct on the
collision axis. "Direct arm work" is not a question push/pull can answer in either direction.

**A standing D-322 guard was added** while confirming the new names. `getExerciseConfig()` fuzzy-matches,
so an unknown name does not fail — it silently borrows another movement's entry, ratio and display
format. "The name resolves" is not evidence against that (`Nonexistent Widget Press` resolves). The new
test asserts an **exact** `EXERCISE_CONFIG` key for every menu option and every default: 23 names, all
exact, including all six added here.

**Also in this change (copy only, same work order):**
- **The by-feel line names its own subject.** `ASSISTANCE_GUIDANCE` is concatenated straight after the
  main-lift labels (`strength-primary-plan.ts:2174`), so *"Load by feel — about 7 out of 10"* read as
  autoregulate-the-**main-lift**, contradicting the AMRAP the third set is built on. Now opens *"On the
  assistance:"*, which fixes both consumers from one string (the builder card at
  `NonRaceBuilder.tsx:2862` is the second).
- **"Held underneath at maintenance" is gone.** Both emit sites (`strength-primary-plan.ts` ~L592 per
  session, ~L2476 block overview) positioned the plan as the actor and the athlete as the object. Now
  *"Easy by choice this block"* / *"keeps ticking over, all easy"*. The Hickson clause stays — easy
  volume is what holds the base — so the sentence still says why easy is not a throwaway.

**Files:** `src/lib/assistance-menu.ts` (`AssistanceTemplate`, `ROLE_BY_DAY`, `fitsRole`, `RANK`,
`ROLE_FALLBACK`, menu options, `substitutionReason`, `ASSISTANCE_GUIDANCE`), `src/lib/exercise-config.ts`
(`armIsolation`, `isDirectArm`), `supabase/functions/shared/strength-system/strength-primary-plan.ts`
(both narration strings), plus `assistance-collision.test.ts` and `strength-primary-plan.test.ts`.

**Verification.** 293 passing in `shared/strength-system`. ⚠️ **7 pre-existing failures in
`protocols/triathlon_performance.conformance.test.ts` are NOT mine** — confirmed identical with these
changes stashed; a different protocol, untouched. Same for 3 pre-existing type errors under `--check`
and 4 pre-existing lint errors in `exercise-config.ts`. **No device verification.**

⛔ **DEPLOY LIST when this ships:** `src/lib/*` is bundled into edge functions at deploy time, so every
function importing `assistance-menu.ts` or `exercise-config.ts` must be redeployed — `grep -rln
"assistance-menu\|exercise-config" supabase/functions --include=index.ts` before pushing.

---

### D-405 — Leg days are LEG · LEG · ABS. No pull. (2026-08-09, **SHIPPED — `09796193`**)

> ⚠️ **HEADER CORRECTED 2026-08-10**, verified against `git log` (`09796193`, "D-405..408").

**Supersedes the lower-day half of D-385. Same reframe as D-404, one page over.**

D-404 applied the standard-template premise to the upper days. This applies it to the lower days,
where D-385 had reasoned: *"the four main lifts contain no row and no chin, so pulling volume has to
live somewhere, and p.53 pairs 'the squat day with an assistance pulling movement.'"* True of the book
as a whole; **not true of the template this block runs.** p.51 is two explicit lines:

> **Deadlift day → hamstrings, quads, abs. Squat day → low back, quads, abs.**

No pull on either. The pulling lives on the two press days, where p.50 puts it ("Lats or Upper Back"
on both), and that is where the athlete's pull pick runs now.

**`ROLE_BY_DAY.lower.pull: 'pull' → 'leg_match'`.** The new role takes the main lift's OWN leg family,
mirroring `single_leg`, which takes the opposite. Together they are p.51's line: squat (knee) → low
back (hip) + quads (knee); deadlift (hip) → hamstrings (hip) + quads (knee). Reading the main lift's
family rather than a fixed value is what keeps the two lower days different by construction.

⛔ **AND IT CLOSES A DOSE PROBLEM D-404 OPENED — this is the half I would not have found without
printing the block.** Turning off the plane swap left the pull pick standing on all four days. The rep
scaler's floor is **50 and it only scales UP**, so a beginner whose chin max is six was being handed
**50 chins × 4 days = 200 a week** of one movement. Two days halves it to 100 — the exact number
D-328 was written to fix (*"100 reps a week of one movement"*).

⚠️ **The work order assumed the scaler would absorb this** — *"scale chin reps to capacity (the 25–100
scaler already does this)"*. That premise was stale on both halves: D-385 replaced the range with
**50–75**, and it has no downward travel at all. Recorded because the same assumption will look
reasonable to the next reader.

**Files:** `src/lib/assistance-menu.ts` (`AssistanceRole`, `ROLE_BY_DAY`, `fitsRole`, `RANK`,
`ROLE_FALLBACK.leg_match`, `substitutionReason` — which needed a second sentence, since "the opposite
one" is flatly untrue said about a same-family movement), plus both test files.

---

### D-406 — Assistance carries a SUGGESTION, and the prescription is still "by feel" (2026-08-09, **SHIPPED — `09796193`**, plus the `f0273584` follow-up)

> ⚠️ **HEADER CORRECTED 2026-08-10**, verified against `git log`.

**Narrows the load rule at the top of `src/lib/assistance-menu.ts` (Michael, 2026-07-25). Read that
rule before touching this; the exception is narrow on purpose and the rule is otherwise intact.**

**What did NOT change, and this is most of the entry.** `weight` stays `'By feel'`. `load_prescribed`
stays `false`. `percent_1rm` stays absent. Every surface that renders the prescription keeps rendering
"by feel" — including `StrengthCompareTable`, whose own comment is *"'by feel' is not decoration: it is
the prescription."* **The plan still names no assistance load.** *"The absence is the design"* remains
true of the PRESCRIPTION.

**What is new** is `weight_suggested` — a greyed, overwritable starting point in the logger's weight
box, so a beginner facing `Dumbbell Row — 50 total, by feel` is not asked to invent a number from
nothing on their first session.

⛔ **`load_prescribed: false` WAS DELIBERATELY NOT TOUCHED, and that was the whole design constraint.**
The work order originally proposed reversing it for loadable moves. It is not "no weight given" — it is
the **one answer to "is this row assistance?"** (`src/lib/assistance-slot.ts`, D-370), read by the
server matcher (`_shared/strength/match-exercises.ts` Tier 3), the logger, the compare table and the
performance summary. Flipping it would have made those stop recognising the row, and **work the athlete
did would read as a skip**; the main-lift finder at `StrengthLogger.tsx` would have started picking up
curls. A separate field for a separate claim.

**The derivation, with no invented percentage anywhere in it:**

```
accessory e1RM = parent lift's max × ratio        (exercise-config primaryRef + ratio)
suggestion     = weightForReps(accessory e1RM, 12, rir 2)   (Wendler p.32, inverted)
```

⛔ The obvious implementation — *"take 65% of the accessory's max"* — is exactly the **fabricated
intensity `materialize-plan` strips on sight**, and 65 would have been a number nobody could source.
Instead the rep target and the reps-in-reserve are the inputs and the percentage FALLS OUT of Wendler's
own estimator (~68%). `weightForReps` was added **beside** `estimate1RM` in `estimate-1rm.ts` rather
than inlined, so the coefficient the athlete is invited to check has one home.

⚠️ **12 reps is the one judgement call and it is the slot's own number** — a 50-rep total run as
3–5 sets is 10–15 each, and p.51 prescribes "5 sets of 10–20". **RIR 2 is `ASSISTANCE_GUIDANCE`
verbatim** ("a few reps left, never to failure") expressed as arithmetic.

**The four missing coefficients were SOURCED, not estimated** — Strength Level population averages
against its 212 lb average male bench, `confidence: 'low'` on all four because a ratio of averages is
not a within-athlete ratio:

| movement | avg 1RM | ratio | format |
|---|---|---|---|
| Dumbbell Curl | 46 lb per dumbbell | 0.22 | perHand |
| Hammer Curl | 50 lb per dumbbell | 0.24 | perHand |
| Tricep Extension | 45 lb per dumbbell | 0.21 | perHand |
| Tricep Pushdown | 119 lb cable | 0.56 | total |

⚠️ **The file's "known-wrong ratios" warning is now PARTLY STALE and was checked rather than trusted.**
It names two: `Single Leg Hip Thrust` at "two-legged 0.9× deadlift" — **now 0.25, confidence low, fixed
since that was written** — and `Dumbbell Overhead Press` resolving to the barbell entry, **still wrong
(ratio 1.0) but not on this menu**, which uses `Dumbbell Shoulder Press`.

**Three correct silences.** `weight_suggested` is **absent**, never zero, for: bodyweight and band
movements (excluded by `displayFormat`, plus an explicit `Dips` guard — it carries a real 0.9 bench
ratio and would otherwise price); movements with no coefficient; and any athlete with no max on file.

⛔ **BOTH `materialize-plan` WHITELISTS WERE UPDATED (`~2263` and `~2550`) — this is the trap that
stranded `load_prescribed` for four days.** That object is a whitelist; a field not listed reaches
materialize and dies there silently, with no error and no test to catch it.

**The logger never writes it.** `suggestedGhostWeight()` returns the number only while the set is
genuinely empty and uncompleted, and it is painted on top rather than assigned to `set.weight`. ⚠️ If it
were assigned, an untouched suggestion would be **saved as the load the athlete used** — a number nobody
lifted, feeding the e1RM history and eventually the block's own progression.

**Files:** `src/lib/exercise-config.ts` (4 coefficients), `src/lib/estimate-1rm.ts` (`weightForReps`),
`shared/strength-system/strength-primary-plan.ts` (`suggestedAssistanceWeight`, the `weight_suggested`
field on `StrengthExercise`), `supabase/functions/materialize-plan/index.ts` (both whitelists),
`src/components/StrengthLogger.tsx` (carry + ghost render).

**Verification.** 300 passing; 3 new contract tests pin that the prescription is unchanged, that
bodyweight movements never get a number, and that no maxes means no suggestion. `npm run build` clean;
zero net new lint errors. **No device verification** — the ghost render has not been seen on a phone.

---

### D-407 — The deload week eases the ENDURANCE too (2026-08-09, **SHIPPED — `09796193`**)

> ⚠️ **HEADER CORRECTED 2026-08-10**, verified against `git log`. ⛔ And its narration carried a missing space — *"…aerobic base.Deload week —"* — on every deload week until 2026-08-10; see the join fix in `enduranceSession` and `session-description-join.test.ts`.

On weeks 4/8/12 the bar dropped to 40/50/60% and the session to 35 min — and the athlete's hard hill
repeats ran at **full intensity anyway**, alongside full easy volume. A week that removes the barbell
stimulus and keeps the hard running is not a deload; it is a different week with the same name.

⚠️ **INTENSITY FIRST, VOLUME SECOND, AND THE ORDER IS THE RULE.** Interference and fatigue scale with
endurance INTENSITY far more than with duration [Wilson 2012, JSCR], so the hard session is downgraded
before an easy minute is touched. Easy work then trims to **2/3** — the same figure `maintenanceDoseFor`
lands on — and stays on the calendar rather than being deleted: Hickson's trilogy is that cutting
intensity preserves the base while frequency holds, so a week off is a detraining week.

**The hard session is DOWNGRADED, not dropped.** Dropping it hands back a blank day, which `place-week`
already learned is worse than dropping the pin. The day keeps an easy run at the trimmed volume.

⛔ **THE TRIM LIVES INSIDE `enduranceSession`, AFTER THE `??`, AND THE FIRST VERSION WAS WRONG.** I
trimmed `overrideMins` at the four call sites, which looked equivalent and is not — an override is
OPTIONAL, and every caller that omits it falls through to the internal default where a call-site trim
cannot reach. **Caught by printing a deload week and seeing four untouched 35-minute runs.** Recorded
because the bug was invisible in the diff and obvious in the output.

**Verified by fixture, not device.** 12-week run block: week 3 = 140 min endurance across 4 sessions
with Hill Repeats on Thursday; week 4 = **92 min, no hard session**, strength 60 → 35.

---

### D-408 — The AMRAP catch-up proposes; it never writes (2026-08-09, **CORE BUILT + FIXTURED; NOT WIRED — see status**)

`supabase/functions/shared/strength-system/amrap-catch-up.ts` + 9 fixtures.

The fixed +5 upper / +10 lower spine stays. But the anchor cycle's last set is an AMRAP, and an AMRAP
is a **measurement** — an athlete who hits 185×9 has proven a max the schedule will take cycles to
reach. Wendler recalculates at boundaries for exactly this (p.24, p.30-31). **The formula is the
trigger; there is no percentage gate**, because a threshold would be an invented number doing work the
arithmetic already does.

⛔ **IT USES THE APP'S 85%, NOT THE BOOK'S 90%, AND THIS IS THE ENTRY'S REAL CONTENT.** The work order
specified 90% (correctly, per the book). **This app's training max is 85%** — `WORKING_NUMBER_PCT_OF_1RM`,
a documented deliberate deviation: Wendler's own guidance is to lower it when the athlete carries other
physical demands, and an endurance athlete is that case. Building the catch-up at 90% would mean the
first boundary **silently ratchets every athlete from an 85% training max to a 90% one** — a ~6% jump on
top of the fixed increment, arriving disguised as "adopting your AMRAP". A policy change wearing a
measurement's clothes, invisible in a diff. The module imports the constant rather than spelling a number,
and a test pins both the value and the constant.

**Other decisions:** best set chosen **by estimate**, not by weight or reps (185×5 beats 150×12 — neither
column alone answers it, which is why p.32 prints the formula). **Raises only** — reset-on-stall is a
different mechanism with a different trigger (FAILED reps), and letting this path lower the number would
undo the spine's progress after a session the athlete completed. Compares against the **current** TM
including increments already applied, or it re-offers a rise already given. Malformed rows are skipped,
never thrown. No RIR offset — 5/3/1 does not collect it and an AMRAP is to a hard stop by definition.

**WIRED 2026-08-09, three pieces, consent-first throughout:**

1. **Suggest** — `adapt-plan` emits `strength_training_max` per lift, gated on `isCatchUpBoundary`.
   Reads the block's own workouts, not a rolling 4-week window: the question is "the best AMRAP THIS
   BLOCK produced", and a window would make the answer depend on when the athlete opened the app.
   Wrapped in try/catch — a missing catch-up is a quiet nothing, a 500 is a dead screen.
2. **Apply** — `acceptSuggestion` on `str_tm_*`. ⛔ **THE TAP CARRIES ONLY WHICH LIFT, NEVER THE
   NUMBER.** The value is recomputed server-side by the same fixtured function, so a stale card
   cannot write an arbitrary working weight. It **re-checks the boundary** (a card left on screen
   while the week rolled over does not apply) and writes **one key**, plus a `training_max_history`
   entry recording the evidence — spreading a recomputed object would rewrite three lifts the athlete
   did not consent to. Naturally idempotent: once adopted, the proposal no longer beats the TM.
3. **Surface** — rides the existing `plan_adaptation_suggestions` channel into `PlanAdaptationCard`,
   with `reason` carried into `details` because for this suggestion the EVIDENCE is the content. A
   bespoke second surface for one suggestion type would be the doubled disease in miniature.

⚠️ **Already-materialized weeks are NOT rewritten**, deliberately: the next cycle is authored from
`config.training_max`, so the change lands on the cycle the athlete is about to start rather than
reaching back and moving weights under sessions they have already seen.

**Verification.** 15 fixtures, including a `WIRED` case that pins the recompute-don't-trust contract,
the rolled-over-week rejection and the second-tap no-op. `deno check` on `adapt-plan`: **zero errors
in this code** (2 remain, pre-existing, identical with the changes stashed). **No device run.**

---

### D-409 — Endurance FREQUENCY is a required answer, not an optional one (2026-08-10, **PUSHED + DEPLOYED (client); NOT device-verified**)

**Michael, looking at "Runs a week · OPTIONAL · Auto":** *"is it necessary? user has picked miles and
hours already — what's auto?"*

⛔ **"Auto" named a hardcoded literal as though it were a decision.**
`create-goal-and-materialize-plan/index.ts:~2583`:

```js
endurance_frequency: Number(run_days) >= 2 && Number(run_days) <= 4 ? Number(run_days) : 2
```

Two runs a week, chosen by a fallback, presented to the athlete as the app having it handled. At 25
weekly miles that is two 12.5-mile runs — a different plan, not a different phrasing of one.

**The distinction that settles it:** the hard day is a **session you can decline** and the week is
still complete. Frequency is a **parameter that always has a value** — weekly volume ÷ sessions =
session length, which is what decides whether the week is feasible at all. There is no "unanswered"
state, only an answer the athlete gave or one given for them. No plan builder in the field makes it
optional.

**So:** the counts are required and read **"Pick one"** until picked. `Optional` now appears on
exactly one row, the hard day. Both facts are pinned — `SCHEDULE_OPTIONAL_ROWS` is asserted to
contain exactly `hard`, with runs/rides explicitly asserted NOT optional.

⛔ **IT ALSO KILLED A REPORTED TRAP.** With the count unset, `longDayCalledFor` was false, no long run
was demanded, and Continue was LIVE. Picking a count made the long run required and Continue **DIED**
— answering an optional question created a new requirement. The gate asks for the count first now, so
it only ever moves toward enabled, and `schedule-gate.test.ts` pins **monotonicity**: walking the card
in order, once the gate opens it never closes again.

> ⚠️ **THIS DOES NOT REVERSE THE 2026-07-29 NO-PREFILL RULE — read that before "restoring" a default
> here.** That rule (recorded in-line at the entry above, and in `NonRaceBuilder`'s initial state) says
> *do not answer for the athlete*: Michael on lit pills, *"still preselcted"*. A silent server-side 2
> is answering for them **with the answer hidden**, which is the same defect one layer down. The pills
> stay unlit and the row says "Pick one" — the principle is enforced here, not abandoned. Anyone
> reading "counts are now required" as permission to pre-select 3 has inverted it.

**Cross-ref:** Q-270 (the four-layer default chain, INTENTIONAL — the `: 2` stays and now warns),
`src/lib/schedule-gate.ts`, `schedule-gate.test.ts`.

---

### D-410 — The strength session clock: an explicit Start, a persisted wall-clock stamp, an editable duration after (2026-08-10, **PUSHED + DEPLOYED (client); NOT device-verified**)

**The bug it began as.** `StrengthLogger`'s session start was `useState<Date>(new Date())` — a value
that died with the component. Every remount restamped it to now while the DRAFT restored intact, so a
session interrupted once (nav away, cold-start restore, foreground reopen) saved only the length of its
**last stretch**. Strength durations were silently UNDER-counted, and the longer the session the worse
the lie.

**Three decisions, in the order they were made:**

1. **`startedAt` is the authority; elapsed is derived.** The same rule Q-TIMER established for rest
   deadlines, applied one level up. An absolute wall-clock stamp in localStorage, keyed on the draft's
   own identity-scoped session key (D-132), so a remount RESUMES and a backgrounded session counts the
   time away with no reconcile pass of its own.
2. **Opening the logger is not starting a workout.** Michael, after the first version shipped:
   *"it's just going and the only way to stop it is to load a rep."* The athlete opens the logger to
   load plates and swap an exercise; anchoring to mount charged all of that to the session. An explicit
   **Start** tap, matching Strong and Hevy. ⛔ **With a safety net: logging a set IS starting a
   workout**, whatever they tapped — the auto-start watches SET STATE rather than the Done button, so
   it covers the RIR modal, the bulk mark-done, a duration timer expiring, and a restored draft.
   `ensureSessionStart` is idempotent, so the net can fire freely and can never move a running clock.
3. **A start is only RESUMED when the session has logged work**, and **Stop exists**. An abandoned open
   left a stamp that the next open inherited — a running clock with no Start control on screen and no
   way off it. The resume now requires a draft (written only once ≥1 set is completed, D-132 Layer 3)
   and CLEARS the stale slot rather than skipping it. `SESSION_CLOCK_KEY` went `v1 → v2` to orphan every
   mount-stamped start in the field without a migration.

⚠️ **STOP IS AN END, NOT A PAUSE.** A pause means carrying accumulated-elapsed alongside `startedAt`,
which is exactly the derived-value-as-authority shape Q-TIMER was written to remove. The saved duration
is correctable instead — **duration is now visible and editable on the strength performance screen**,
which it never was: `TodaysEffort` blanks it for strength on purpose and strength load is volume-based,
so the number was **write-only** before today.

⚠️ **MOBILITY IS BRANCHED, NOT CARRIED ALONG** — same component, `logger_mode: 'mobility'`. No clock, no
readout, and `floorMinutes: 0` so its saved duration is byte-for-byte what it was. Strength floors at 1,
because 0 reads downstream as "no duration recorded" rather than "a very short session".

**Cross-ref:** `src/lib/strength-session-clock.ts` + 22 fixtures; Q-TIMER; D-132.

---

### D-411 — "Your week" is a disclosure list: every answer visible, one question's controls open (2026-08-10, **PUSHED + DEPLOYED (client); NOT device-verified**)

⛔ **THREE LAYOUTS FAILED ON THIS SCREEN FOR ONE REASON**, and the reason is worth more than the fix:
the card's parts were laid out in a COLUMN, so every part competed with every other for the fold and
whichever lost went off screen.

| version | how it failed |
|---|---|
| three `<select>`s under a nine-rem empty box | day controls below the fold; the box showed no selection at all |
| answer card + shared day row + counts + rationale + terrain, stacked | chips floated with no container; the hard-day rationale ended up hundreds of pixels below the control it explains |

Michael, on the device: *"shouldn't these day chips stay in a box"* and *"description gets totally
lost."* **Both are the same defect** — things that belong together were merely NEAR each other, and
scrolling separated them.

**The answer is not more trimming.** This screen is FIVE questions, and a stack shows all five sets of
controls whether or not they are being answered. A **disclosure list** shows all five ANSWERS and only
the open question's CONTROLS — the settings-screen pattern, and Runna's and Hevy's setup flows.

- **Containment becomes structural.** The chips live inside the open row, which lives inside the card.
  They cannot float, because there is nowhere to float to. The old layout had to *remember* to box
  them; this one cannot forget.
- **A control cannot drift from its explanation.** The hard day's rationale, its (i) and the terrain
  sub-question are inside the hard-day row. The distance is fixed at zero.
- **⛔ THE ROW ORDER IS A RULE, AND IT LIVES IN `SCHEDULE_ROW_ORDER`.** Required first, the declinable
  question last. The hard day was repositioned THREE times before this — a rule re-learned every few
  hours is a rule that was never written down. A fixture asserts the general rule (no optional row above
  a required one), so a legitimate reorder passes and putting the optional question back on top does not.
- The counts became rows too, reversing the previous day's arrangement: "Runs: 3" is an answer exactly
  like "Long run: Sat".

⚠️ **`DaySelect` WAS DELETED, AND ITS REASON KEPT.** Three day questions as three seven-button grids
took three rows and pushed the week off screen — *"you need to be able to click and see everything
without scrolling."* That objection is not reversed: it is answered with ONE row serving whichever
question is open. **`WeekDayRow` was not built for this** — it had shipped since `12d73e19` and was
unreachable from this path only because `scheduleSteps` never pushes the `days` step on Strong Focus.
**Built and starved, not missing.**

⚠️ `DayRole` gained `H` and `LB`. **The `H` is not the `H` reverted on 2026-08-06** — that one
classified a STANDING day the athlete merely told us about (why `C` replaced it); this one is the answer
to a question the app asked outright, so hard is what the slot IS. A fixture pins that both coexist.

---

### D-412 — A finished intake build lands on the Home calendar. Always. (2026-08-10, **PUSHED + DEPLOYED (client); NOT device-verified**)

The athlete fills in nine screens to get a **week**. The build used to land on Focus and raise a green
*"Season plan ready"* card — an acknowledgement between the tap and the result, announcing a plan that
renders a few pixels below it, calling a Strong Focus block a "season plan", and (on a short phone)
pushing the live plan into the region that collapses.

**Two passes.** First the completion card was made optional (`announcePlanReady`, default true) so the
intake could land on Focus with the plan showing while the Arc SEASON wizard — longer, ends in merges
worth acknowledging — keeps its banner. Then Michael, twice more: *take me to the schedule.* **Every
finished build now goes to the Home calendar.**

⚠️ **FOCUS IS STILL THE ROUTE AND IT IS NOT A DETOUR.** `/goals` is where `complete()` navigates and
where the landing state is consumed — closing the embedded builder, refreshing plans and goals, reading
the schedule signals. Bouncing to Home from `complete()` would skip all three. The landing does its work
and hands off in the same pass, via the same teardown the Home tab runs.

> ⛔ **AND THE SIGNALS STORAGE WRITE IS NOW LOAD-BEARING.** A first version held the athlete on Focus
> when a build produced conflicts or trade-offs, so they could be read; **that condition was removed at
> Michael's call.** It is safe only because `persistArcScheduleSignalsNotice` writes them to
> sessionStorage and the recovery branch restores them the next time Focus opens inside the 24h TTL.
> **Deleting that write as redundant would silently drop conflict notices with nothing on screen saying
> so.** Noted in the code at the tempting spot.

### D-413 — The State trend build is timezone-free: it stops blanking every Sunday (2026-08-10, **PUSHED `71b083ab` + DEPLOYED compute-snapshot + VERIFIED (cards returned on device; fixture pins the Sunday instant)**) — closes [Q-252] Stage 1

**The bug ([Q-252]).** `compute-snapshot/index.ts` gated the whole `state_trends_v1` build on
`if (targetWeek === mondayOfToday())`. `mondayOfToday()` reads the runtime clock and edge functions
run in **UTC**, so from 17:00 Pacific every Sunday UTC ticks into Monday, the athlete's current week
fails the equality, the block is skipped, `state_trends_v1` writes **null**, and run/ride/swim/strength
all vanish from State. Nothing threw and nothing logged — the "(non-fatal)" `catch` below it was a red
herring; the code never ran. `coach_cache` masked it until a coach regen, which then wrote the null
over the last good copy.

**Why the gate was wrong, not just its timezone.** The trend build is **now-anchored** — its windows
are `todayISO()` / `isoMinus(...)`, never `targetWeek`. So the calendar week was never what it read;
the gate's only real job is "don't rebuild the rolling trend on a historical recompute." Michael:
*"this section is rolling too."*

**The fix.** A pure, clock-free gate (`compute-snapshot/state-trend-gate.ts`): live callers pass no
`week_start` and always build; only an explicit **past** `week_start` (`recompute-workout`) skips, and
the skip now **logs its reason** (Q-252 step 3 — no more silent skip). Confirmed the split is clean:
`compute-facts` and `backfill` invoke with no `week_start`; only `recompute-workout` passes one.
11 deno fixtures, including the Sunday-seam repro pinned to a real instant (`2026-08-03T00:00Z` =
17:00 Sun Pacific). Ripple: only the `state_trends_v1` block moves; existing rows untouched.

### D-414 — The athlete's timezone is stored and read; the Los Angeles default is dead (2026-08-10, **PUSHED `5f63bdf2` + DEPLOYED compute-snapshot + backfill-strength-load + migration applied + VERIFIED (client wrote `America/Los_Angeles`; server resolves it)**) — closes [Q-252] Stage 2

**The deeper fault under Q-252.** `compute-snapshot:421` read
`body.timezone ? String(body.timezone) : 'America/Los_Angeles'`, and **no server caller ever passed
`timezone`** — so every athlete's ACWR `asOf` day was resolved in one developer's timezone. Latent for
anyone outside Pacific; a user-agnostic violation one line from the Sunday bug.

**Rooted.** New nullable `user_baselines.timezone` (IANA, **no DEFAULT** — null means "not yet
reported", distinct from a real value). `AppContext` reports `Intl.DateTimeFormat().resolvedOptions()
.timeZone` on an authenticated load, only when it changed (same pattern as unit persistence).
`_shared/athlete-timezone.ts` resolves **override → stored → UTC** and never throws (a malformed stored
value degrades to UTC, never a region). `compute-snapshot/acwr-as-of.ts` extracts the `asOf` rule so
the timezone behaviour is fixtured (20 fixtures across the two new files; non-Pacific instants so a
returning LA default fails loudly). `backfill` passes the tz it already reads for free;
`recompute-workout` deliberately does **not** (the callee reads the same column — no redundant
round-trip). **The only live LA literals left are race-*weather* defaults** (`fetch-race-weather-archive`,
`course-strategy`) — a location default, not identity; deliberately untouched.

**No-tz fallback = UTC, decided (Michael, *"no defaults to me"*).** Neutral, self-correcting on the
next authenticated load.

### D-415 — One shared completed-set normalizer; and `resistance_level` is INTENTIONALLY two-in-one — do not collapse it (2026-08-11, **PUSHED `d8520ff2` + DEPLOYED get-week + workout-detail + VERIFIED (Aug-10 Dips shows "−75 lb assist" on device)**)

**The bug.** Band assist (`resistance_level`) was saved on every dip/chin/pull-up set but never rendered
in mobile strength Performance. Five separate layers each rebuilt a completed set by HAND-LISTING
fields — `{reps, weight, rir, completed, prefilled}` — and every one dropped anything off that list.
The object that WINS the client's `completedData` merge (the `workout-detail` scope=workout hydrator,
overriding the get-week row) was one of them, which is why three earlier point-fixes to other layers
changed nothing on the phone.

**The fix.** One shared `src/lib/normalize-strength-set.ts` — **spread-first, then coerce the known
fields** — so any logged field (`resistance_level`, `amrap`, `duration_seconds`, `difficulty`) survives
by default; a reader has to go out of its way to LOSE data, not to keep it. Routed through it:
`get-week`, `workout-detail` (×2), `useWorkouts`, `StrengthPerformanceSummary`, `StrengthCompletedView`.
The D-204 "untouched prefill" rule got its own single home (`isUntouchedPrefill`) — shape and filtering
are separate questions on purpose (the server hydrators carry `prefilled` through and let the client
decide). Deno fixtures pin the band-assist regression (`normalize-strength-set.test.ts`).

**⛔ `resistance_level` IS DELIBERATELY OVERLOADED — a word OR a number — AND BOTH STAY (Michael,
2026-08-11: *"lets not kill that… as long as they dont interfere"*).** The field was born holding
band-TENSION WORDS ("Light"/"Medium"/"Heavy"/"Extra Heavy", `StrengthLogger` `LoggedSet:78`); D-351
repurposed it to also hold the band's pull in POUNDS (a number). Old logged sets carry the words, newer
ones carry pounds — two eras in one box, kept on purpose. **They do not interfere because every reader
checks "is it a number?" before doing math:** pricing (`workload.ts` `priceSet`) prices a word-form set
without trying to subtract a poundage it doesn't have; display (`StrengthCompareTable.fmt`) shows the
"−N lb assist" line only when the value is a finite number, and nothing for a word. The only thing a
word CAN'T do is get subtracted as exact assist load — inherent to it being a word, not a conflict.
**DO NOT "normalize the words away" — legacy sets depend on them, and a set of assisted reps would
start mispricing as band-only work.** Same guard already lives in `canonicalize.ts` (`bandMeansAssistance`).

**Stage 3 (audit the other UTC callers) — done, no code change.** `compute-snapshot:311` (writer) and
`coach:2331` (reader) both key off `mondayOfToday()`, so they **agree** — post-seam they label the row
next-week's Monday but the content is now-anchored and correct, no divergence. `compute-snapshot:698`
`asOf` is a rolling window; a few hours' tz shift never blanks it. The one tz-sensitive spot was the
ACWR `asOf`, fixed above. **Residual, filed not fixed:** a Sunday-evening live compute still *labels*
its snapshot row with the UTC Monday; harmless today (reader agrees), localizable later with the now-stored tz.

### D-416 — Load stays objective, readiness sits beside it: one soft signal stops cascading into three red flags (2026-08-11, **PUSHED `70b46755` + DEPLOYED coach + generate-overall-context; AWAITING DEVICE**)

> **⛔ EXTENDED BY [D-418] (2026-08-12) — this fix was necessary and NOT sufficient.** D-416 corrected the
> readiness string *fed to* the load reconciler, but five other places could still mint "overloaded"
> on their own (the assessment label, the raw readiness tree, `buildVerdict`'s ACWR bands, the inline
> `acwr_status`, and `computeTotalLoadStatus`), so the same soft-signal cascade reappeared on the
> other lanes at ACWR 1.1. D-418 mints the verdict ONCE (`mintOverloadVerdict`,
> `_shared/load-status-reconcile.ts`) and every lane reads it. **`readinessForLoadVerdict` is still
> live and still correct** — it now refines a readiness that is itself gated by the one verdict.
> Everything below stands as history and as the still-valid load-vs-readiness separation.

**The report (Michael, on the State screen).** "'A bit high' for load doesn't track to the work done, and
'a bit harder than usual' feels like a heavy red flag." Both were right, and they were the **same** signal.

**The trace.** A single +0.7 RPE reading (4.6 vs 3.9 typical) set raw `readinessState` to `'fatigued'`
via the catch-all `if (bodySignalsConcerning) return 'fatigued'` (`coach:3119`, one concerning signal is
enough). That one raw value then cascaded three ways:
- **Load verdict** — the reconciler's readiness floor (`load-status-reconcile.ts:303`) raised load to
  `elevated` → "a bit high", even though **ACWR 1.1 bands to `optimal`** on its own (`acwr-state.ts:69`,
  ≤1.3). So the verdict came from the soft signal, not the work.
- **The over-reach accent** — "Load is running 1.1× while readiness reads strained — needs absorbing
  before more load" (`week-accent.ts:103`, fed raw readiness).
- **The BODY RPE row** — rendered **red**, because the color escalation was inverted (see below).

D-232 had already *noticed* the catch-all "over-fires on a single signal" and added a refinement — but
only for the **display chip** (`coach:5821`, → "EFFORT UP"). The load reconciler and the accent still ate
the raw `fatigued`. The label got calm; the verdict never did.

**The decision.** Load is measured from the work; readiness sits beside it and never rewrites the load
label. **Verified against Garmin / TrainingPeaks / Strava** (their own docs + the ACWR literature): all
three keep objective load (ratio / CTL-ATL-TSB) separate from subjective readiness, and none lets a lone
RPE reading relabel the load number. Closest in shape to Garmin (readiness reads *downstream* of load).
ACWR 1.1 sits in the injury-risk sweet spot (0.8–1.3); "high" begins ~1.5.

**What shipped.**
1. **One pure rule** — `readinessForLoadVerdict(readinessState, fatigueLabel)`
   (`_shared/response-model/loaded-legs.ts`): a non-systemic `fatigued` (refined label EFFORT UP /
   LEGS LOADED / LEGS SORE) → `'normal'`; only **systemic** `FATIGUED` (elevated ACWR or ≥2 declining
   signals) or `'overreached'` carry into the load path.
2. **Fed into all four fatigue consumers** in `coach/index.ts`: the load reconciler (D-260 sole
   authority), the over-reach accent, and **both Adjust-tab suggestions** (deload / add-recovery). The
   **safety floor** (`computeSafetyFloor`) and the honest `readiness_state` payload stay on the **raw**
   value — this is verdict-only, safety is untouched.
3. **Adjust-tab suggestions made plan-aware** — they now skip any week the plan is already easing
   (recovery / taper / **planned deload**); a deload week used to fall through and could suggest a deload
   mid-deload.
4. **Un-inverted the BODY RPE tone** (`rpeFeelTone`, `weekly.ts`): "a bit harder" (0.5–1.0) → amber; red
   reserved for "noticeably harder" (≥1.0). Reverses the D-232-era color mapping (which had it backwards).
5. `COACH_PAYLOAD_VERSION` 163 → 164 so cached rows re-source the moved `load_status.status` +
   `visible_signals[].trend_tone`. Client floor **not** moved (raising it early blanked the section
   2026-08-02).

**Why the reconciler itself was NOT touched.** It is the sole verdict authority (D-260); the fix is
UPSTREAM — deciding which readiness string it is fed. Downgrading a non-systemic `fatigued` to `normal`
is coherent across every branch that reads the arg (they all then treat the body as fine, which is what
"not systemic" means), and genuinely systemic fatigue (ACWR ≥1.2 or ≥2 signals) keeps `FATIGUED` and
still raises.

**Fixtures (permanent regressions).** Three D-416 cases in `load-status-reconcile.test.ts` pin the
cascade at the seam (raw `fatigued` @ ACWR 1.1 → `elevated` = the bug; refined → `on_target` = fixed;
systemic FATIGUED → still `elevated`), `readinessForLoadVerdict` cases in `loaded-legs.test.ts`, and the
un-inverted tone cases in `weekly-rpe-verdict.test.ts`. 70 + 87 tests green; touched shared files
typecheck clean.

**Back-annotated:** D-232 (archive) — the glass-box standard stands; its RPE color mapping and its
single-signal-`fatigued` cascade are what D-416 reverses/narrows.

**AWAITING DEVICE:** on an ACWR-1.1 week the load should read **balanced** (not "a bit high"), the
"needs absorbing" line gone, "a bit harder" **amber not red**, and no deload prompt on the Adjust tab.

**Side note (filed, not fixed):** the `caution_ramping_fast` OR-branch on the add-recovery suggestion is
still a load-ramp signal, but it remains gated by `bodyConfirmed` (signals_concerning > 0), so it can't
fire on load alone.

---

### D-418 — One overload source: "are you overloaded" is minted once, plan-aware, from the athlete's own signals (2026-08-12, **PUSHED pending; fixtures green (18 new, 1636 `_shared` total, 0 fail); NOT deployed, NOT device-verified**) — supersedes the parallel-authority half of [D-416], closes the Slice-1 contract

**The report.** One payload contradicting itself six ways. `glance.verdict_code = on_track` beside
`response_model.headline = "Signs of overreaching — consider backing off"`, `load_status = elevated`
("a bit high"), the "needs absorbing" accent, and `training_state.code = overstrained` — on an
**ACWR 1.1, on-plan, week 1 of 12 build week**. Two soft, collinear readings drove all of it: ONE
harder-than-usual RPE (4.8 vs 3.9) and one "lift trending down" (a 5/3/1 weight wave, not a loss).

**Michael's yardstick, which is the whole decision:** *a plan you followed can't be "too much" — the
plan IS the intended load. Flag on what the body reports, never on the numbers the app handed you.*

**The trace — there were SIX overload authorities, not one.** D-416 fixed the *readiness input* to the
reconciler and left every other minting site standing, which is why the alarm survived it:

| authority | where | what it minted from |
|---|---|---|
| `reconcileLoadStatus` | `_shared/load-status-reconcile.ts:200` | the D-260 sole authority — **kept as THE one** |
| `computeAssessment` 'overreaching' | `_shared/response-model/weekly.ts:440` | body-signal COUNT; gated on `acwr_status` by `7809cc12` — still absolute ACWR |
| raw readiness tree | `coach/index.ts:3075-3122` | a bare `signals_concerning > 0` → `'fatigued'` |
| `buildVerdict` | `coach/index.ts:789 / 826` | **pure absolute ACWR** → `recover_overreaching` / `caution_ramping_fast`, which then set readiness AND `training_state` |
| inline `acwr_status` | `weekly.ts:403` | a 4th ACWR classifier → "Load is elevated." subtext |
| `computeTotalLoadStatus` | `_shared/athlete-snapshot/body-response.ts:40` | a 5th — absolute-ACWR bands set the RAW status the reconciler starts from |

**The decision.** The overload verdict is minted in exactly ONE function and every lane reads it.
It is fed by three athlete-owned signals and nothing else:
1. **RPE** — what the athlete reported (internal load).
2. **Measured body metrics** — HR drift, cardiac efficiency, execution (what the body did).
3. **Actual-vs-PLANNED load** — did they do MORE than the plan asked (external load).

It is blind, by construction, to **absolute ACWR** (a ratio the plan itself produces — a build week is
*supposed* to ramp), to **prescribed load** (the app cannot hand you a week and then blame you for
completing it), and to **strength e1RM** (a 5/3/1 wave dips it on schedule in weeks 2-3 and on the
deload; that is the protocol working).

**Two ways to be overloaded, both athlete-owned:**
- **Key A** — exceeded the plan (>25% over planned load, or >25% of the planned week added off-plan)
  **AND** ≥1 declining body signal.
- **Key B** — the body reported **twice**: ≥2 declining signals **with RPE among them**, regardless of
  load. RPE is required because it is the one signal the athlete states directly; the measured markers
  are confoundable (heat, hills, sleep) and two confounded markers are not a witness. This mirrors
  `computeSafetyFloor`'s D-266 rule, so the floor and the mint cannot disagree.

Anything less that still has a declining signal is **`watch`**: it shows, it never prescribes.

**Field-standard backing.** The internal-RPE + external-load pair is the standard monitoring structure
(Foster's session-RPE work), and the load-ratio literature's own caveat is that a ratio without symptom
corroboration is descriptive. It is the same "the ratio DESCRIBES, the body PRESCRIBES" law D-260/D-266
already put inside the reconciler — applied one level up, to every lane at once.

**What shipped.**
1. **The mint** — `mintOverloadVerdict()` + `OverloadVerdict` in `_shared/load-status-reconcile.ts`
   (the existing authority's own file — **no new authority**, Law 5). Returns
   `{ overloaded, level, exceeded_plan, exceeded_plan_pct, strain_signals, basis }`. `basis` is a
   receipt, so a surface can show WHY without re-deciding (Law 4).
2. **Minted ONCE**, inside `computeWeeklyResponse` — the earliest point where the athlete's signals and
   the actual-vs-planned load both exist. Exposed as `WeeklyResponseState.overload` and on the payload
   as `load.overload`.
3. **Every lane reads it**: the assessment label (was `acwr_status`), the week headline's "Load is
   elevated." + the "rest soon" prescription, the readiness state, the load reconciler, the over-reach
   accent (downstream of load+readiness), and `training_state`.
4. **Strength e1RM dropped from the strain set** (`weekly.ts` `computeAssessment`). It still counts as
   an *available* signal — a gaining lift still reads as responding — but a declining e1RM can no
   longer make the athlete look overloaded. **The trend algorithm itself is untouched** (Slice 2).
5. **The readiness tree extracted** to `_shared/response-model/readiness-state.ts`
   (`computeReadinessState`). It was ~45 lines buried in the ~6k-line `@ts-nocheck` coach file, so it
   could not be unit-run — and it was the seam that kept the cascade alive after `7809cc12`. Branch
   ORDER is unchanged; three branches now require the verdict (the bare count, the ACWR corroborator,
   and `buildVerdict`'s codes reaching in to set the BODY state). The `adapting` and `detrained`
   branches are **unchanged** — neither is an overload claim, so ACWR stays a fair input to both.
6. **The reconciler's absolute-ACWR escalators removed**: the cross-training-ACWR block now requires
   `exceeded_plan`, and the `ACWR ≥ 1.2` corroborator on a single declining signal is replaced by "did
   more than planned". The verdict also acts as the second key on the two-key cap, so a raw `high`
   inherited from `computeTotalLoadStatus`'s ACWR bands can no longer wear an overload word unrefuted.
7. **One computation of actual-vs-planned** — `loadVsPlanPct` hoisted in `coach/index.ts` and reused by
   both the mint and `buildBodyResponse` (it was a duplicated inline arithmetic).
   ⚠️ **NOT `wtd_completion_ratio`**: that ratio is clamped to [0,1] (`_shared/adherence-plan.ts:84`),
   so it can never express "did more than the plan asked" — the exact fact this needs.
8. `COACH_PAYLOAD_VERSION` 165 → **166** (verdict values move for any athlete inside their plan's load).

**The fixtures (Law 6) — `_shared/load-continuity-overload.test.ts`, 18 tests.**
- **Fixture A is the bug case and is PERMANENT.** On-plan build week, ACWR 1.1, one RPE bump, a real
  5/3/1-wave e1RM decline → NO overload on any lane; glance stays `on_track`. Includes a
  **non-vacuity proof** that replays the same inputs down the pre-slice path (verdict withheld) and
  asserts it still produces `fatigued` + `elevated` + "needs absorbing" — if that test ever goes
  quiet, the legacy path moved and Fixture A stopped proving anything.
- **Fixture B**: exceeded plan + corroborated measured strain → fires on every lane together. Plus a
  control that changes only the plan-exceed half and watches every lane go quiet.
- Deterministic path (no LLM), so the ≥3-recompute rule does not apply here.

**What was deliberately NOT touched.**
- **The strength trend algorithm** — Slice 2 (protocol-declared gauge: 5/3/1 → all-out rep record).
- **The goal `glance` lane** — `buildVerdict` still reports its ACWR-derived code exactly as before. It
  simply no longer diagnoses the BODY. ⚠️ **It remains a live absolute-ACWR authority for its own
  lane** — an athlete whose PLAN prescribes a hard ramp will still read "Recover" on the glance while
  every other lane says fine. That is the next fracture in this campaign, and it is filed, not fixed.
- **The e1RM formula** (done 2026-08-12), and `computeTotalLoadStatus`'s bands (now capped by the
  verdict rather than rewritten — a smaller blast radius for the same outcome).

**The fail-safe pattern.** Every gate added here is on an OPTIONAL `overload` parameter that defaults
to null ⇒ byte-identical pre-slice behavior. That is the same shape `corroboratedStrain` (D-265) and
`driftUsable` (D-318) use, and it is why all 34 pre-existing reconciler fixtures pass untouched.

---

### D-419 — Strength progress reads the protocol's own gauge: 5/3/1 is the all-out set, not the waved working-set e1RM (2026-08-12, **PUSHED pending; fixtures green (14 new, 1650 `_shared` total, 0 fail); NOT deployed, NOT device-verified**) — closes the Slice-2 contract, extends [D-417] and [D-270]

> **⛔ THE DIRECTION HALF OF THIS ENTRY IS REVERSED BY [D-420] (2026-08-12, built the same day).** The
> substrate call below was right and still stands — a 5/3/1 lift's readings come from the all-out set,
> not from working sets the program itself waves. The OBJECT was wrong: there should be no weekly
> direction verdict at all. Michael's all-out sets run 20-35 reps, above the reliable estimate range
> (D-417 §2), so their estimate slides across the wave too and the "sliding" survived this fix.
> **WHAT SURVIVES:** `readsEffortAs`, `allOutSeriesByLift`, the gauge selection, the 84d/56d windows —
> all of it, now feeding the RECORD, the REP PRs and the CHART instead of a verdict. **WHAT IS GONE:**
> the improving/sliding/needs_data word this entry computed. Everything below stands as history and as
> the still-valid substrate reasoning.

> ⛔ **SUPERSEDED IN PART by [D-420] (2026-08-12, same day).** The DIRECTION half of this entry —
> trending the all-out set to produce a weekly improving/sliding verdict — is retired. No commercial app
> computes a weekly strength direction, and Michael's 20–35-rep all-out sets slide across the 5/3/1 wave,
> so this approach still misread (live "sliding −8.2%" on his deadlift after deploy). Progress is now the
> e1RM **record** + **rep PRs** + the **chart** (D-420; `SCIENCE-strength-e1rm-trust.md` §6). The
> protocol-declared gauge infrastructure (`readsEffortAs`) below **survives**; the weekly verdict it fed
> does not. Everything below is history.

**The report.** State read *"1 lift trending down"* on Michael's bench while he was executing his
5/3/1 block exactly as printed. The working sets went 120×5 → a new-cycle 105×5 — which is the
PROGRAM re-basing the wave, not a strength loss.

**The trace.** `state-trend/strength.ts` classified the e1RM series, and D-417 (correctly) gates that
series to trusted low-rep sets. On a 5/3/1 block that leaves **only the fixed working sets**, whose
weight the program waves 65/75/85 → 70/80/90 → 75/85/95 → re-base. Meanwhile the one set Wendler
actually measures by — the all-out set — runs long (p26: *"often entails performing 10 or more
reps"*) and is therefore excluded from e1RM **by construction**. So the gauge was trending the
prescription and throwing away the measurement. D-417 was right; it just left the measurement homeless.

**What the book says — verified verbatim in the 2nd edition, not paraphrased.**
- **p9** — *"This program allows you to break a wide variety of rep records throughout the entire year."*
- **p10** — *"If your squat goes from 225x6 to 225x9, you've gotten stronger. If you keep setting and
  breaking rep records, you'll get stronger. Don't get stuck just trying to increase your one rep
  max… There's also a simple way of comparing rep maxes that I'll explain later."*
- **p24** — *"in the 4th week (your deload week), you should NOT be going for max reps."*
- **p26** — *"during deload weeks, you'll only be doing the reps listed. Don't go for max reps."*
- **p28** — the training max rises **5 lb upper / 10 lb lower per cycle**, so the all-out set's WEIGHT
  moves between cycles — which is exactly why a raw rep count cannot be the whole comparison.
- **p32** — *"Weight x Reps x .0333 + Weight = Estimated 1RM"* … *"This formula is not necessarily an
  accurate predictor of your 1RM, but it affords you a good general way to gauge your progress."*
  ⚠️ **His own caveat.** It is the CROSS-WEIGHT comparator and nothing else.
- **p66** — *"95%x1+ (all out set)"*.
- **p100** — *"Do I go for max reps on each set or just the last set? **Just the last set of the day
  for the big exercise.**"* and *"Do I go for max reps during my deload week? **No.**"*
- **pp.123-129** — his own logbook carries a **Rep Records** box per lift per cycle.

⚠️ **THREE CITATIONS IN THE SLICE CONTRACT WERE WRONG AND ARE CORRECTED HERE** (they were close, and
two were attached to the right rule on the wrong page): the deload rule is **p24 + p26 + p100**, not
p24/p99 (p99 is the chains/bands FAQ, which does carry the formula again); the *"keep track of the
weight and the reps on the last set"* line attributed to p26 is not on p26 — p26's actual load-bearing
sentence is the 10+ reps one; and p28 is the **TM increment table**, not *"always trying to hit more
reps."* Every rule shipped is sourced to a page whose text is quoted above.

**The decision.** The progress direction is read the way the athlete's **protocol declares** it reads
effort — `protocolEffortRead(profile)` (`strength-profiles.ts:489`), which already returns
`'rir' | 'amrap' | 'none'` and already says `strength_primary → 'amrap'`. Nothing is hardcoded to
"AMRAP" and no new capture was built.

**The gauge = the all-out set's p32 estimate, trended.** At a FIXED weight that estimate is a strictly
increasing function of reps, so it **is** the rep record (p10) exactly; when the weight steps up
between cycles (p28) it is Wendler's own comparator doing the bridging (p32). One value, both cases,
**zero thresholds invented**. It runs through `classifyTrend` — the same shared primitive every other
discipline uses (Law 5: no second classifier).

**Scope — who moves.** Only a **waved main lift** on an `'amrap'` block:
`capabilitiesForExercise(canonical).coached`, true on exactly the `barbell_main` row (D-373) — the
main-lift slots and their variants. That is p100's *"the big exercise."* **Assistance lifts keep the
e1RM read** (they are not waved off a training max and carry no all-out set), and every `'rir'` /
`'none'` protocol is byte-identical — pinned by a fixture that compares verdict, pctChange AND gauge
against the no-options call.

**Three numbers, each derived not chosen.**
1. **Window 84 days** (vs 42 for e1RM). An all-out set is a per-CYCLE measurement — this app
   prescribes it on the anchor cycle's third working set only (`wendler-531.ts:64`) — so a 6-week
   window can hold as few as three and a leader cycle holds none. 84d spans a leader+anchor pair, the
   same span `REP_RECORD_WINDOW_SESSIONS = 40` was widened to for the same reason.
2. **minSessions 3**, explicitly, instead of `resolveThresholds`' cadence scaling (which climbs to 5
   for a 4x/week lifter). That scaling is right for a per-session series and wrong here: no training
   frequency produces more than ~one all-out set per lift per week, so a floor of 5 would silence the
   gauge for the athletes training hardest. 3 is the shared primitive's own lower clamp.
3. **Freshness 56 days** = two four-week cycles (p26/p28). ⚠️ **This one is not cosmetic and the
   fixture caught it:** `resolveThresholds` scales freshness to SESSION cadence — **7 days** for a
   3x/week lifter — so an all-out set performed 8 days ago decayed to `needs_data` and the row went
   blank. The gauge was dead on arrival until this was matched to the measurement's own cadence.

**⛔ NO FALL-BACK TO e1RM WHEN THE ALL-OUT SERIES IS THIN, AND THAT IS THE POINT.** On a leader cycle
(no all-out set prescribed at all) the only thing left to trend is the waved working weight — i.e. the
bug. A waved main lift with fewer than 3 in-window all-out sets reads **`needs_data`** carrying
`directionBasis: "all-out set — N in 12 weeks, needs 3"`. The e1RM number itself still renders as a
per-session receipt; only the arrow goes quiet. **This is a visible product consequence: an athlete
mid-leader-cycle sees no strength arrow until their next anchor.** Honest beats confident (Law 2).

**What shipped.**
1. `allOutSeriesByLift()` in `_shared/strength/all-out-set.ts` — every all-out set per lift, oldest
   first. `lastAllOutByLift` is now **derived from it**, so the "current reading" and the "direction"
   cannot disagree about whether a set was a rep record. Same walk, same history.
2. `computeStrengthState(series, asOf, spw, opts)` — new optional `{ allOutByLift, effortRead,
   phaseByDate }`. Omitted ⇒ byte-identical pre-slice behaviour (the D-265/D-318 fail-safe pattern).
3. Per-lift `directionGauge` (`'amrap' | 'e1rm'`) + `directionBasis` on `StrengthPerLift`, serialized
   to `state_trends_v1` — a surface can now say what it is reading instead of implying every lift is
   judged the same way (Law 3). **Nothing renders them yet; the fields ride the payload.**
4. `compute-snapshot` builds the all-out series from the **same 40-session capture the coach already
   runs** (workouts + their planned rows, for the `set_plan[].amrap` fallback) and resolves the block's
   gauge via `resolveProtocolId` (now exported from `block-identity.ts` — one rule, one place) →
   `resolveProfile` → `protocolEffortRead`.
5. `COACH_PAYLOAD_VERSION` 166 → **167**. ⚠️ The coach only FORWARDS the spine's direction, so this
   change **requires a compute-snapshot recompute** to be visible.

**Why the all-out WEIGHT comes from the logged set, not `strength_facts`.** D-338 records
`amrap_reps` but not the all-out set's own weight; `best_weight` is the session's heaviest set, which
is a *different set* the moment a heavy single follows the AMRAP (the trap `all-out-set.ts` documents
in full). A rep record is "reps AT a weight", so the weight has to be exact.

**The fixtures — `_shared/state-trend/strength-gauge.test.ts`, 14 tests.**
Fixture A (the bug case, **permanent**) with a **non-vacuity proof** that the same working-set series
still reads `sliding` on the old gauge; real progress at the same weight (p10's own 225x6 → 225x9) and
at a heavier weight (p28 step); a real decline still firing; the byte-identical `'rir'`/`'none'`
comparison; assistance-lift scope; the deload exclusion; the trusted-rep cap NOT applying to a long
all-out set; and three capture tests including "the all-out set is found by its flag, never by
`best_weight`". Deterministic — no LLM path, so the ≥3-recompute rule does not apply.

**Not touched:** `mintOverloadVerdict` (D-418 — strength is already out of the overload alarm, which
is what made this a display-accuracy fix with a low blast radius), the e1RM formula and its reserve
gate, the D-417 trusted-rep gate itself, and the goal glance lane.

### D-420 — Strength progress is a record + rep PRs + a chart, NOT a weekly direction verdict (2026-08-12, **BUILT — fixtures green (9 new, 1658 `_shared` total, 0 fail); NOT deployed, NOT device-verified**) — supersedes the *direction* half of [D-419], extends [D-417]

**The realization.** Chasing "1 lift trending down" / "sliding −8.2%" to its root: the weekly per-lift
DIRECTION verdict is a construct **no commercial app** (Strong, Hevy, Boostcamp) computes, and on a
5/3/1 wave it reads the within-cycle weight-wave as a trend. Trending the all-out set (D-419) doesn't
save it — Michael's all-out sets are 20–35 reps, above the reliable estimate range (D-417 §2), so they
slide across the wave too. This was a whole-session chase; the answer was that the *verdict itself* is
the wrong object.

**The decision.** Strength progress is shown as three things, matching the universal app method and
Wendler's own:
1. **e1RM RECORD** — best trusted e1RM to date, per lift. Monotonic — never dragged down by a lighter
   programmed week (a max, not an average).
2. **Rep PRs** — most reps at a weight (Wendler p10). Honest at any rep count; the home for the high-rep
   all-out sets the trusted-rep gate excludes from e1RM.
3. **The e1RM chart** over the block — the human reads the slope.

Any *stated* direction word may only be computed over a window spanning **whole cycles (≥2 waves)**, so
the wave is inside the window, not split across it.

**Reverses:** the direction half of [D-419]. The protocol-declared gauge infrastructure (`readsEffortAs`
on the strength profile, and slice 2's all-out capture) survives; the weekly improving/sliding verdict
it fed is retired.

---

## ✅ BUILT (2026-08-12, slice 3). What landed, and every ripple.

**Killed at the source, in two places** — because there were two independent minting sites, and leaving
either would have let the verdict grow back:
1. **The spine** — `computeStrengthState` (`_shared/state-trend/strength.ts`). A `retireDirection()`
   helper strips the CLAIM off each computed trend and keeps every RECEIPT on it: per-lift `direction`
   is always `'needs_data'`, `pctChange` always `null`, the aggregate is a no-claim. `sampleCount`,
   `newestAgeDays`, the points, and the D-338 deload exclusion that shapes them all survive — they feed
   the record, the rep PRs and the chart.
2. **The weekly response model** — `computeStrength` (`_shared/response-model/weekly.ts`). The
   "N lifts trending up/down" / "Strength stable" headline is gone; it now states the RECORD
   (`Best estimated max NNN lb`). `overall.trend` is `'insufficient_data'`.

**And the path that actually printed "sliding −8.2%":** `perfByDisc.strength` is now **null** — strength
has no performance verdict at all — so `resolveDisciplineCard` gives the card no `headlineVerdict` and
`synthesizeHeadline` has nothing to say about it. Adherence leads the strength card; the row itself
renders the three pillars.

**The dot is NOT the direction and it stays.** `strengthFitness.e1rm` used to be gated on the verdict
existing, so retiring the verdict would have blanked the dot too. It is now emitted whenever there is a
band: `{ verdict: 'needs_data', pctChange: null, range }`. A dot is a POSITION claim (current e1RM ÷
your own baseline), which D-420 never questioned.

**The three pillars, on screen.** Pillars 1 and 3 already rendered. Pillar 2 did not — rep PRs existed
only on the Performance screen's all-out card. The spine now carries `per_lift[].lastAllOut`
(`{date, weight, reps, isRepRecord, priorBestRepsAtWeight}`), built from **slice 2's `allOutSeriesByLift`
walk** — the same walk that card uses, so the two screens cannot disagree about whether a set was a
record. `StrengthFitnessRow` renders `all-out 115 lb × 20` + a `rep PR` badge, and shows `best NNN lb`
when the record is above the latest reading.

⛔ **This is the ONLY home for a long all-out set.** 105 lb × 35 can never mint an e1RM — D-417's
trusted-rep ceiling refuses it, correctly — and it is unambiguously a rep record. Before this, that
measurement had nowhere to land on State.

**RIPPLES — stated, not discovered later.** All three are consequences of removing the verdict, and all
three are correct under D-418/D-420, but none is a no-op:
- **Strength drops out of `computeAssessment`'s available-signal count** (`overall.trend` is now
  `'insufficient_data'`). An athlete with exactly one endurance signal + strength used to reach the
  two-signal floor and now does not, so their weekly assessment reads "not enough data" instead.
- **The D-267 e1RM-declining adherence veto is DELETED** (`computePrimaryAdherence`,
  `_shared/load-status-reconcile.ts`) — not left dormant. It read
  `met = sessionsMet && e1rmDirection !== 'declining'`, so an athlete who did every prescribed session
  was still marked as not meeting their primary discipline if a weekly e1RM direction said "declining".
  Two reasons, either sufficient: **Strong and Hevy have no "you're declining" adherence gate at all**
  (SCIENCE §3 — adherence is whether you did the work; a max is a record beside it), and **nothing can
  produce the input** now that the weekly direction is retired. ⚠️ **Deleted rather than left quiet on
  purpose:** a dead gate that still reads a live field is exactly how a retired verdict grows back — the
  moment any direction is restored upstream it would silently start vetoing again, from a line nobody
  remembers is there. `met` is now precisely "did you do the sessions". **Everything else in D-267
  survives byte-for-byte**: the WTD-prorated count, the tolerance, and the plan-primary invariant (§5,
  `met === true` ⟹ a raw 'under' never survives) — all seven existing D-267 fixtures pass unchanged, and
  a new one asserts no value of `e1rmDirection` (including 'declining') can veto a session-met athlete.
- **The per-lift "· provisional" hedge disappears** (`isProvisionalTrend` returns false for
  `needs_data`). It hedged the confidence of a direction that no longer exists.

**Untouched on purpose:** `mintOverloadVerdict` (D-418), the e1RM formula + reserve gate (D-339), the
D-417 trusted-rep ceiling, the `readsEffortAs` gauge infrastructure (D-419 — it still selects WHICH
measure a lift's readings come from), and the goal glance lane. Also left alone and now doubly dead:
the coach's `str_prog_*` Adjust suggestion (`coach/index.ts:3644`), gated on both an `'improving'`
trend and a `previous_e1rm` delta that has always been null.

**Fixtures — `_shared/state-trend/strength-progress-record.test.ts` (9), Law 6.**
Fixture A is Michael's deadlift cycle (105×35 → 110×25 → 115×20) over a *falling* working-set e1RM
series, asserting: no direction on any lane; **no direction WORD anywhere in the emitted strength
subtree** (a `JSON.stringify` scan of both the spine contract and the display block — the assertion that
catches a verdict leaking back through a field nobody thought to check); no card verdict; the headline
states the record; the record HOLDS at 238 while the latest reading is 215; and the high-rep sets land
in the rep-PR lane. Plus a real cross-cycle record gain (record ticks up, `isPr` true), a rep PR judged
by the real capture walk (225×6 → 225×9, Wendler's own example), and the chart still emitting.
Deterministic — no LLM path.

⚠️ **SIX EXISTING TESTS WERE REWRITTEN, NOT DELETED**, each with a note saying what it used to assert
and why that subject is gone: the three e1RM noise-guard tests (`strength-fitness.test.ts` — the guard
itself is still pinned generically in `classify-noise-guard.test.ts`), the D-338 deload test (now pinned
on the **substrate**: 6 points → 5 once the phase is known — the exclusion is still live), the D-270
per-lift tests (now pin the granularity D-270 got right), and slice 2's gauge fixtures (the gauge
SELECTION is still pinned; only its direction assertions moved).

`COACH_PAYLOAD_VERSION` 167 → **168**. ⚠️ The coach forwards the spine's per-lift block, so this needs a
**compute-snapshot recompute** to be visible.

### ➕ FOLLOW-ON, same day (slice 3b): the RECORD obeys the trusted-rep ceiling

Pillar 1 shipped reading an **ungated** number. The "best NNN lb" this entry put on the strength row is
`allTimeBestE1rm`, and that was built by a separate inline reduce in `compute-snapshot` whose query
selected `canonical_name, estimated_1rm` and **no `best_reps`** — so it could not apply D-417's ceiling,
which the *series* twenty lines above has applied since D-417. On screen: deadlift best **225** (the
105 × 35 set — the exact number D-417 was written to kill), above the 120-150 trusted range printed
beside it. Squat 125 vs 100, bench 170, overhead 110 — every "best" above its own range, which is the tell.

**Fixed by moving the reduce next to the series builder** (`buildAllTimeBestByLift`,
`state-trend/assemble.ts`) and adding `best_reps` to the query, so the two reads of `exercise_log` share
one visible gate (`estimateIsTrusted` — not re-derived). Unknown reps **fail open**, exactly as the series
does, so both read the same population. `count` is gated too — it is the confidence gate behind `isPr`,
and a record shouldn't be backed by history that can never produce a max; **consequence: a lift with
fewer than 3 trusted readings loses its PR badge**, which is the honest read.

**Untouched:** the rep-PR path (105 × 35 is still a rep PR — its correct home), the series gate, the
formula, and the record's all-time (not 6-week) scope. Fixtures: 6 added to
`state-trend/strength-trust-gate.test.ts`, including "Michael's deadlift best is 140, not 225" and the
invariant the screen violated — **the record can never exceed the top of the gated series**.
`COACH_PAYLOAD_VERSION` 168 → **169** (record values move; still needs a compute-snapshot recompute).

**Grounding + evidence:** `docs/SCIENCE-strength-e1rm-trust.md` §6 (with sources); Wendler 5/3/1 2nd ed.
p10 (rep records) + p32 ("Comparing Rep Maxes", the estimate is "best used for motivation"); Strong /
Hevy performance-tracking docs. Not tuned to Michael — the record+PR+chart method and the whole-cycle
window apply to any athlete and any protocol.

---

### D-421 — A pinned lift is a calibration signal, not a stall to engineer away (2026-08-12, **BUILT — fixtures green (3 new, 1987 pass / 1 pre-existing unrelated failure); NOT deployed, NOT device-verified**) — closes slice 4a; the finer-increment premise was REJECTED, see the decision

**The defect.** When a lift's training max reaches 90% of the max on file, the block stops advancing it
and prints byte-identical weeks for the rest of the block. That was already known and already noted in
prose (`strength-primary-plan.ceiling-stall.test.ts`, 2026-07-28). What was NOT known: **the fact never
left the builder.** `placement_compromises` is returned in memory and folded into `description`;
`generate-strength-plan/index.ts` writes `plans.config` and did not carry it. So the one surface that
could act on a pinned lift — a retest/raise offer — had nothing to read.

**⛔ THE REFRAME, AND IT IS THE WHOLE DECISION (Michael, 2026-08-12).** *"The pinning isn't actually a
bug to engineer away."* The 90% ceiling is a **safety bound**: it says *you have climbed to 90% of your
recorded max; before going heavier, confirm that max is real.* When the recorded max is too low it
fires early and says **retest** — which is correct. **So the pin is the system working. The only defect
was that it did it SILENTLY, with no way to act on it.** That reframes the whole slice: nothing needs to
climb further; the signal needs to escape and something needs to answer it.

**The decision.** A pinned lift is a **calibration** question ("is 100 lb still your press max?"), not a
training one, so the builder now emits it as data: `strength_calibration: [{ lift, reason: 'ceiling',
at_cycle, total_cycles, one_rm }]`, persisted to `plans.config.strength_calibration`. The prose note
stays for today's renderer; both are built from the same `ceilingHits`, and a fixture pins that they
cannot disagree about which lift pinned. Absent = nothing pinned; never `[]` for "nobody looked".

**⛔ THE FINDING THAT MATTERS MORE THAN THE FIX — THIS IS NOT A LIGHT-LIFTER EDGE CASE.**
The growth band is 5% of the max (85% → 90%) and the upper-body step is 5 lb, so clearing two cycle
steps needs a 10 lb band — **an overhead press max of 200 lb or more.** Below that the press pins by
cycle 3 for *every* athlete. Measured on the real functions:

| lift | max | base → c2 → c3 | pins? |
|---|---|---|---|
| Overhead press | 100 | 85 → 90 → **90** | yes, cycle 3 |
| Overhead press | 165 *(Wendler's own book lifter presses 165)* | 140 → 145 → **145** | yes, cycle 3 |
| Back squat | 125 | 105 → 110 → **110** | yes, cycle 3 |
| Bench | 150 | 125 → 130 → 135 | no |
| Deadlift | 150 | 125 → 130 → 135 | no |

**Grounding (5/3/1 2nd ed., verified verbatim).** p29, *"Even Smaller Increments?"*: *"A 5 pound
increase in the lower body lifts, for example, or a 2.5 pound increase for the bench and military
press. I haven't done this, but I'd assume it would work well, **provided you have access to 1.25 pound
plates for your upper body movements.** If you'd like to do this, by all means have at it."* Wendler
blesses the finer step and states its equipment condition in the same sentence.
*(Also on p29, and worth recording because slice 2's contract attributed it to p28: "you're always
trying to hit more reps on your last set of each workout.")*

**⛔ WHY THE FINER-INCREMENT PREMISE WAS REJECTED. Three findings, any one of which blocks it.**

1. **The equipment gate does not exist, and it was explicitly abandoned.** Plate inventory is captured
   nowhere: `user_baselines.equipment.strength` is a chip list of nine capability labels
   (`"Barbell + plates"`, `"Dumbbells"`, `"Squat rack / Power cage"`…), plus a `home_gym`/`commercial_gym`
   location and a derived three-value tier — none of which says which plates exist. And
   `docs/BUILD-ORDER-strength-spine.md:292`: *"`5 lb` on the barbell grid (Michael, 2026-07-24 —
   plate-inventory tracking is explicitly abandoned; every barbell app assumes 2.5s exist and that is a
   hardware problem, not a software one)."* Gating on micro plates reverses a standing decision.
2. **The finer TM step barely moves the bar anyway, because SET weights round to 5.** Measured: at TM 85
   the anchor sets are 60 / 70 / 80; at TM 87.5 they are 65 / 70 / 80. **The top set — the all-out set
   that IS the measurement (p66) — does not move at all.** To deliver the intent, the set grid must go
   to 2.5 too, in both writers (`strength-primary-plan.ts:602` and
   `rematerialize-strength-block/index.ts:204`) — which is squarely the plate-inventory territory of (1).
3. **It cannot fix a squat.** p29's finer LOWER-body step is 5 lb, which the 6% increment cap already
   produces. Michael's squat (max 125, band 105→110) is unreachable by granularity at any equipment
   level; it is a calibration case only.

**So the honest scope: the finer increment fixes the press for athletes with micro plates, and nothing
else.** Every other pinned lift — including his squat, and every press under 200 — needs the max on
file to move, which is the calibration offer, not this slice.

**⛔ DECIDED (Michael, 2026-08-12): leave the grid at 5 lb; CALIBRATION carries every pinned lift.**
The 4a remainder is deleted rather than deferred — there is nothing left to build there.

Two alternatives were considered and rejected on the record, so neither gets re-proposed:
- **Add a micro-plate intake question and take the +2.5 step.** Rejected: it reverses the 2026-07-24
  plate-inventory call, it barely moves the bar (finding 2 — the measuring set does not move at all),
  and it cannot fix a squat. *"Bad trade."*
- **Revisit the 85% → 90% band.** Rejected: the ceiling is defensible **as a safety limit**, and once
  calibration closes the loop it stops being a dead end. Not worth reopening a heavily-decided
  invariant to solve a problem that is no longer a dead end.

⚠️ **THIS ENTRY IS ONLY HALF A LOOP UNTIL THE CALIBRATION OFFER EXISTS.** The signal now escapes the
builder and is stored; nothing yet reads it. A pinned lift is still, from the athlete's side, a lift
that stops moving with a sentence attached. **Slice 4b (the retest/raise offer) is what makes this
whole** — it is the consumer this field was shaped for, and it covers every pinned lift including the
squat, which no increment change could reach.

**Untouched:** the 90% ceiling invariant, `INCREMENT_LB`, the e1RM formula and reserve gate, the max on
file. No athlete-facing weight changes in this entry — it adds a field and persists it.
