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
