# BUILD ORDER — the strength spine

**⚠️ LIVING DOC.** Written 2026-07-24, mid-design. Sections marked **OPEN** are unresolved — do not
implement them from this file. Update it as calls get made; it dies when the build lands and its
substance folds into `D-NNN` entries (CLAUDE.md spec lifecycle).

**Companion docs:** `ARCH-strength-spine.md` (**where things live** — read it first; it settles the homes
this doc's layers assume) · `SPEC-get-stronger.md` (the protocol contract) · `D-323` (the scope decisions) ·
`OPEN-QUESTIONS.md` Q-202 (the work ledger — report against it line by line, never by topic).

---

## Why this is a separate doc from the Get Stronger spec

**Get Stronger is the first consumer of this machinery, not its owner.** Michael, 2026-07-24: this is
"going to be the entire backbone of the app," and users may eventually "start at a strength build and
map out longer plans where emphasis shifts."

So layers 1 and 2 below get built as **general strength infrastructure**. If they end up shaped around
Get Stronger's specific needs, the next protocol pays for it — and there will be a next protocol.

---

## ⛔ THE ONE DECISION THAT IS EXPENSIVE TO REVERSE — decide before Layer 1

**Today, strength protocol and discipline emphasis are PLAN-scoped.** `config.strength_protocol`,
`config.source`, and the goal's `per_discipline_posture` are all set once for the whole plan.
`config.phase_structure` carries phases with start/end weeks, but **nothing varies posture or protocol
across them.**

Michael's stated direction — *"longer plans where emphasis shifts"* — is a plan that runs a strength
block, then a build block, with different emphasis in each. **That requires protocol and posture to be
BLOCK-scoped, not plan-scoped.**

Keying it that way now costs little. Retrofitting it later means touching the goal seeds, the plan
config, `create-goal-and-materialize-plan`'s routing branch, `materialize-plan`'s protocol resolution,
the coach, and every consumer of `per_discipline_posture`.

**OPEN — decide now:** does the block/phase become the unit that carries protocol + posture? Everything
below assumes **yes** and is written to be safe either way, but Layer 2's suggestion trigger is the
first place it bites.

---

## ⛔ 2026-07-25 LATE — V1 SCOPE LOCKED. READ THIS BEFORE THE LAYERS BELOW.

The layers below were written before the 5/3/1 research and before Michael's scope calls. **They are still
correct about *where things live*, but V1 needs far less of them than they imply.** Do not build Layers 1
and 2 for V1 — they move to the dumbbell plan (below).

### Two plans at the top of Goals, each with its own flow — Michael, 2026-07-25

| | **Strength Focus — Barbell** | **Strength Focus — Dumbbell** |
|---|---|---|
| status | **V1. Build this.** | later, its own thing |
| progression | the calendar — Wendler's four-week cycle, +5 lb upper / +10 lb lower | **rep ranges** — add a rep, jump when you top out |
| why | fine increments, no ceiling | 5 lb on a 45 lb dumbbell press is 11%; the range absorbs it |
| lower body | barbell squat / deadlift | dumbbell + **single-leg** (half the load needed) |

**Michael's reasons:** ships sooner, keeps V1 from carrying two loading models, and two visible products
market better than one with a hidden branch. Sound.

> **⚠️ Separate on the surface, SHARED underneath.** Two flows in Goals must not become two composers.
> Block structure, endurance side, test, guardrails and logger are identical. The dumbbell plan is a second
> **loading module on the same frame** (`ARCH-strength-spine.md` Layer 2), selected by equipment alongside
> the develop/maintain dose. *This repo's failure mode is exactly this: the same RIR block written twice,
> the same carry defined in two places. Both caused real bugs.*

### What V1 is, and what it is NOT

**V1 = Wendler's classic four-week cycle, at an 80–85% working number.** 8 weeks = two cycles ·
12 = three · 16 = four. Scales by adding a cycle; nothing to redesign.

**FOUR DAYS. Locked, Michael 2026-07-25. No 3-day option in V1.**

One main lift per day, same day every week: bench Mon · squat Tue · press Thu · deadlift Fri.

*Why four:* it is **week-aligned**, and the whole app thinks in weeks. Three days rolls the four lifts
across the calendar — nothing lands on the same day twice and a full cycle stretches from 4 weeks to
~5⅓, so 8 weeks stops being two clean cycles. Four is also Wendler's standard; three is his
accommodation.

> **⚠️ The endurance-squeeze argument for 3 days was OVERSTATED — by me.** I claimed four lifting days
> leave only Sunday clear for a hard endurance session. That used a **24-hour** separation. Robineau's
> actual finding is that **zero** recovery hurt strength and **six hours did not**; the 24h was a
> recommendation before *important* sessions. At six hours, Wednesday and Saturday both work. Do not
> re-derive the 3-day case from my conservative number.

**Each session:** 10–15 jumps or throws → the main lift (3 sets, last one all-out) → **25 reps each of
push, pull, and single-leg/core.** Wendler's assistance range is 25–50; an endurance athlete takes the
bottom (Van Hooren: keep volume low). **There is no row or chin in the four main lifts — the pull
category is where pulling comes from.**

> **The assistance categories ARE the Adjust-tab slots.** Glute focus loads single-leg/core. Hyrox loads
> it with carries and sleds. Pull-up focus loads pull. Add-ons are not bolted on — the programme has three
> designated holes with a rep budget attached, and spending up toward 50 is a cost the app can state.

### Entry, gating and the menu — Michael, 2026-07-25

**The front door has five kinds of thing, and only one belongs on a card:** what you *want* (the focus).
What you *own* and how many days you *have* are capability. What you *add* is Adjust — it can grow
forever without cluttering the door.

**The eventual menu:** Strength · Speed · Distance · Plan a Season. **Maintenance is NOT a card** — it is
the state you are in between focuses. It is a real programmed phase (6–8 weeks between blocks; 2 strength
sessions/week; endurance volume held with intensity pulled back) and block training is what *creates* the
need for it. But asking an athlete to actively choose "nothing in particular" is a strange thing to ask.
The app drops into it when a block ends. On the strength side it is the **same programme at a lower
dose**, which is already the `dose` parameter.

Strength carries an equipment × frequency grid (bb/db × 4d/3d). **Michael is fine with those as four
cards** now that the flow is simple. The pattern does not replicate — speed and distance do not need an
equipment split the way strength does.

> **⛔ NO "WE THOUGHT FOR YOU" GATES.** Michael, 2026-07-25 — an earlier suggestion to grey out cards the
> athlete's stored equipment doesn't support was **rejected**. All cards are pickable. Equipment data goes
> stale; someone may want the dumbbell version because they are travelling or their gym shut. The card
> **states what it needs** ("barbell, rack, bench") and the athlete decides. Choosing a plan is stating
> your situation, not composing the programme — omakase is untouched.

**⛔ THE ONE GATE: no 1RM, no entry.** Not "we decided for you" — an input we cannot invent.

- **All FOUR lifts are required — squat, bench, deadlift, overhead press.** The current check
  (`create-goal-and-materialize-plan:2397`) tests **bench and squat only**. Under this plan, missing
  deadlift or press leaves two of four lifting days with no weight on them. **Fix the check.**
- The message names the missing lift and sends them to the test. The tests already cover it:
  Lower = squat + deadlift, Upper = bench + press, Full Body = all four.
- **This is why the week-1 in-plan baseline test is deleted.** You cannot get in without the numbers, so
  there is nothing to discover in week one.

### Week one is easy, and the plan never says so

The 85% working number means week one is well within them. **That is conservative loading, not an
on-ramp** — real sets at real weights from day one, no technique week, no easing in. Michael:
*"that's so annoying when plans treat you like a baby on the first week."*

**Copy consequence:** someone who doesn't know this system will read week one as too light. State it
**once**, flat, in the plan description — the weights come off 85% of your max, and that buffer is what
makes the last set of every week worth measuring. Once. Not repeated, not apologised for, no
"don't worry, it gets harder."

### The variant grid — watch it

V1 fixes two dimensions: **barbell** and **4-day**. Both have a planned variant (dumbbell; 3-day), each
"its own program we put some thought into" (Michael). **That is a 2×2 — four cards at the top of Goals if
each ships standalone.** Decide before the second one lands whether dumbbell-3-day is a card, a
resolution, or refused.

**V1 does NOT need:** rep ranges (reps are 5/3/1) · the topping-the-range trigger (the calendar moves the
weight) · a plate grid · a beginner on-ramp (out of scope, `SPEC-get-stronger.md` §0) · dumbbell loading ·
anything reactive — **all eight weeks are written the day the plan is created**, exactly as today.

**Deleted by the switch, do not build:** the frozen retest anchor. Under Wendler the last set of every
third week *is* the test, so there is no single end-of-block retest weight to freeze. **The problem
deletes itself.**

**Moved to the dumbbell plan:** Layer 1 (the rep spec) and Layer 2's topping-the-range trigger. They stop
being optional there — that path is entirely rep ranges.

### V1 schema — ZERO database migrations

Everything lands in existing JSONB (`plans.config`, `goals.training_prefs`).

| what | where | note |
|---|---|---|
| **Working number per lift** | `plans.config.training_max` | **The one real addition.** It ratchets on its own schedule (+5/+10 per cycle) independent of the true 1RM. **Must be STORED, not derived** — otherwise the ratchet-up write-back bumping `performance_numbers` drags the working number with it and the controlled progression is lost. Set at creation; every cycle's value computed from it at authoring; nothing writes mid-block. |
| Bike volume | `training_prefs` — hours + days | runners already have miles + `run_days` |
| Swim | `training_prefs` — days + rough length | scheduling courtesy only |
| Quality-session opt-in | `training_prefs` | **extend the existing half-built one** — `NonRaceBuilder.tsx:462+` already asks "keep a fixed hard session?" and writes `preferred_days.quality_*`; nothing reads it. Do not add a second question. |

**`exercise_log.min_reps` was the only true migration on the list. It moves to the dumbbell plan.**

**Decide the shape now even though V1 doesn't need it:** whether protocol + posture hang off the **block**
or the plan (`ARCH-strength-spine.md` §3.4). V1 is a single block, so it doesn't bite — but writing config
block-shaped now costs nothing and avoids a migration later.

### V1 build list

1. Close the door where a dumbbell athlete gets handed a barbell plan — **refuse honestly** until the
   dumbbell plan exists. Ship the registry test with it.
2. Store the working number; author the four-week cycle.
3. Strip Glutes / Hyrox out of the flow (re-home, don't lose — Michael has a live Hyrox plan).
4. The endurance side: bike door, swim slots, the quality opt-in, the volume shapes.
5. Copy, in the `COPY-VOICE.md` register. **The card must say who it's for** — the app cannot tell a
   beginner from an experienced lifter, and the scope cut governs what we build, not who gets in.

---

## Layer 1 — the rep spec

**The problem is not "add rep ranges."** `reps` is a single untyped field currently carrying **nine
different meanings**, and every consumer resolves it with its own `parseInt`:

| shape | examples | what `parseInt` gives | correct |
|---|---|---|---|
| count | `15`, `20` | 15 | ✅ |
| range | `5-8`, `8-12` | 5 | bottom — right for the effort target, wrong for volume |
| per limb | `8/leg`, `12/side` | 8 | should be 16 for volume |
| per limb, ranged | `6-8/leg`, `12-15/leg` | 6 | both problems at once |
| seconds | `40s`, `30-45s` | 40 | **40 REPS of volume** — Q-180, still live in `workload.ts` |
| seconds per side | `20s/side` | 20 | same |
| minutes | `5 min` | 5 | 5 reps |
| metres | `20 m`, `40 m` | 20 | 20 reps |
| open | `AMRAP`, `Max reps` | NaN → **defaults to 8** | unknowable until logged |

**Ranges are the ninth thing in a field that already can't hold the other eight.** Bolting them on makes
it worse. Adding one shared type is what closes **Q-202 line 9** properly — not "make three sites accept
a range" but "delete three parsers."

### The type

```ts
type RepSpec =
  | { kind: 'reps';     min: number; max: number }   // 5 → min=max=5 · 5-8 → 5,8
  | { kind: 'per_side'; min: number; max: number }   // 8/leg · 6-8/leg
  | { kind: 'duration'; sec_min: number; sec_max: number; per_side?: boolean }
  | { kind: 'distance'; metres: number }
  | { kind: 'amrap' }
```

### The accessors — after this, nothing calls `parseInt` on reps again

| accessor | returns | consumer |
|---|---|---|
| `bottomOfRange(spec)` | the day-one prescription | the effort target. **Michael's ruling: the bottom is correct** — it's what they actually do in session one of a phase. |
| `topOfRange(spec)` | what they climb toward | the Layer 2 progression trigger |
| `totalReps(spec, sets)` | volume; per-side doubles; **`null` for duration, distance and amrap** | `workload.ts` |
| `display(spec)` | `"5–8"` · `"8/leg"` · `"40s"` | logger, session card |

**`null` is the load-bearing part.** Volume for a forty-second carry is not a rep count, and today it
silently pretends to be. Every consumer must handle `null` rather than coerce it.

### Storage — no migration

Keep `reps` **exactly as it is**, as the display string. Add `rep_spec` alongside it.

- Author both at plan generation.
- `materialize-plan` fills `rep_spec` for any row lacking one, via the one parser.
- Consumers read `rep_spec`; when absent, they call the same parser on the string.

Old plans heal on next session view. **Same trick D-322 used for the bodyweight rows.** Nothing migrates.

### The three parse sites to delete

`workload.ts:182` and `:245` · `match-exercises.ts` · the RIR derivation in `materialize-plan`
(**two identical copies**, lines ~1948 and ~2190 — the doubled block; collapse them while you're in there).

### Fixed for free

The forty-seconds-as-forty-reps bug. AMRAP defaulting to 8. Per-side lifts under-counting volume by half.
Same root cause, all three.

---

## Layer 2 — the progression engine

**Most of this already exists. It is triggering on the wrong signal.**

`adapt-plan` action=`suggest` (`index.ts:254-345`) already: reads `exercise_log` grouped by lift,
compares recent to earlier, grades against `getTargetRir`, emits `{current_value, suggested_value}`, and
the `accept` path writes `plan_adjustments` + re-materializes. **D-315 already made it consent-first** —
nothing moves without the athlete's tap.

Today's trigger: *estimated 1RM rose ≥ threshold AND RIR deviation shows headroom.*
Double progression's trigger: **every set reached the top of the range.**

### ⛔ Therefore the plan does NOT become reactive

The plan carries a **standing prescription** — "4 × 5–8 at 135" — for the whole phase. Static.
Pre-computed at authoring, exactly as today. The athlete climbs the range in-session. On topping it, the
existing suggestion engine offers the increment; they accept; future rows re-resolve.

**The prescription is a rule, not a number.** The plan holds the rule; the adjustment layer holds the
movement. Those are already two separate systems.

*(This corrects an earlier claim in this conversation that double progression needs a history-aware plan
builder. It does not. That claim would have cost a core rewrite.)*

### One new column

`exercise_log` stores `sets_completed`, `best_reps`, `total_volume`. `best_reps` is the **best** set;
the rule needs the **worst**. Derivable from volume today, but fragile.

Add **`min_reps`** beside `best_reps` in `compute-facts`' `exercise_log` write (`index.ts:1758-1766`).
Trigger becomes one line: `min_reps >= topOfRange(spec)`.

### Increment

`5 lb` on the barbell grid (Michael, 2026-07-24 — plate-inventory tracking is explicitly abandoned; every
barbell app assumes 2.5s exist and that is a hardware problem, not a software one).

**Round DOWN, never to nearest.** Michael's invariant, reaffirmed: overshoot writes a set that can't be
completed; the rep range absorbs an undershoot. On a 5 lb grid the difference is ≤2.5 lb, but the
asymmetry is the point.

**The bar floor survives the plate decision** and is NOT part of this layer. An athlete whose overhead
press max is 55 lb cannot load below the empty 45 lb bar — that's 82% of their max. That needs a
dumbbell/regression branch, isolated from barbell progression logic.

### OPEN

- **Stall handling.** Bottom of range missed twice → drop 10%, resume. Named convention (Starting
  Strength / Texas Method: 5–10%, trigger is missing twice) so it is **T2, not invented**. But: *what
  happens on the second stall?* The source says linear progression is finished for that lift after two
  or three resets. Not specified anywhere in our docs.
- **Stall at the bar floor** — 10% off 45 lb rounds back to 45. The rule is a no-op. Must route to the
  dumbbell branch instead of attempting a drop.

---

## Layer 3 — Get Stronger, as the first consumer

Only starts once Layers 1 and 2 are green. Full contract: `SPEC-get-stronger.md`.

**Ordering within the layer:**

1. **Close the second door.** `seedFromGoal` writes `strength_protocol: 'five_by_five'`;
   `create-goal-and-materialize-plan` ignores it and routes to `strength_primary` — *but only when
   equipment resolves to `commercial_gym`*. Everyone else falls through and gets a real `five_by_five`
   build: back squat, bench, row, OHP, deadlift at %1RM, **to a dumbbell-only athlete**. Ship the
   registry test with it (three hand-maintained lists must agree; `resolveProfile` must log its
   fallback). **Q-192, twice found, root-fixed neither time.**
2. **Author the protocol in `RepSpec`.** Phase array, entry percentages **derived not pasted**
   (peak is 86.5, not 87 — chart value 86.3; secondary entry is **68.0**, not 69 — 69 lands RIR 1.5).
3. **Bodyweight prescription** off tested max — closes Q-202 line 29's inversion.
4. **Retest anchor.** Freeze the weight at plan creation and store it on the row. **Never a percentage**
   — a percentage re-resolves at week 12 against a 1RM the ratchet may have moved, and then "more reps
   than last time" measures nothing. Note: there is **no entry AMRAP** on the normal path (Michael,
   2026-07-24: entry is gated on baselines, the tests live in the Baselines screen), so the source is the
   stored baseline number, not a lifted weight.
5. **Endurance intake** — bike door (hours + days), swim courtesy slots, distribution shapes. Strip the
   Glutes/Hyrox add-ons. Rewire the **existing** "keep a fixed hard session?" question
   (`NonRaceBuilder.tsx:462+`) into the §5 opt-in rather than adding a second one.
6. **Guardrails** — season gate, stall, retest gating, easy-effort drift, quality placement, discipline
   availability.
7. **Copy + science panel**, in the `COPY-VOICE.md` register.

---

## ⛔ 2026-07-25 — WENDLER ALREADY PUBLISHED THE ENDURANCE-ATHLETE CONFIGURATION

Researched after the Frankenstein diagnosis. **Every parameter we spent a day deriving already exists in
5/3/1, specified by its author, for exactly this athlete.** Do not re-derive them.

**Wendler's own periodisation — Leaders and Anchors.** Leaders: lower intensity on the main lift, higher
volume underneath, technical work, two three-week waves. Anchors: higher intensity, less volume, the
all-out set returns, one three-week wave. Ratios 2:1, 3:2 or 2:2. **This replaces the need for Issurin
entirely** — and Issurin-shape-plus-Wendler-test-mechanic is precisely the Frankenstein seam.

**His prescription for someone lifting while running long distance** — working number at **80–85%** of max
(not 90); **keep volume low, avoid heavy eccentrics** (they leave runners' legs sore); two or three days of
conditioning alongside; hard conditioning on the lower-body days. Plus **10–15 jumps or throws before every
session** — the explosive component Van Hooren says heavy lifting alone needs.

> ⛔ **THE CITATION REGISTER IS `SPEC-get-stronger.md` §3 — THE SINGLE HOME. Do not restate sources here.**
> Three of the endurance-athlete lines above are marked **THIN** there: the 80–85% number, the
> lower-body-day placement, and the 2–3 conditioning sessions. Two of the three come from the same page
> that produced a claim already struck as not-Wendler. **None of Wendler's material was read at source —
> the books were not consulted.** Check the register before quoting any of it as "Wendler says."

**Everything we derived independently converges on it:**

| our finding | Wendler already |
|---|---|
| Van Hooren — keep volume low or you build size | "keep volume low" |
| Wilson — running interferes via eccentric loading | "avoid heavy eccentrics" |
| Refalo — don't train near failure for strength | no all-out sets in the build |
| Our round-down conservatism | 80–85% working number — a bigger buffer |
| 3 days beats 4 on the calendar | "three days, one main lift per session" |

**What it does NOT cover, and what is therefore still ours:**
- **How much endurance.** He says "do conditioning" and stops. That is Hickson / Rønnestad / Wilson, and
  it is the half **the app is uniquely placed to answer** because it can see what the athlete actually did.
- **The total beginner.** Out of scope — see `SPEC-get-stronger.md` §0.
- **Conversion to power as a phase.** He has the ingredient, not the phase. Friel/Bompa place it *after*
  Maximum Strength — so it is the **next block**, not a hole in this one.

**The framework layer, for naming and sequencing** (Friel/Bompa, ~30 years standard, in TrainingPeaks):
Anatomical Adaptation → **Maximum Strength** → Conversion to Power → Strength Maintenance, mapped onto
Transition/Prep → **Base** → Build → Peak/Race. **Get Stronger is the Maximum Strength phase**, and
Michael placed it exactly where Friel does — base period, low endurance volume, months from a race.
Friel puts Maximum Strength at 6–8 weeks; Rønnestad's ran 11; twelve is the top of a real range.

> **OPEN — the one live decision.** Friel/Bompa is a *calendar* and is uncontroversial. Inside the
> Maximum Strength box you must pick **one** method: Issurin's block (what the spec currently describes)
> **or** Wendler's Leader/Anchor. They are alternatives, not layers. Wendler's fits eight weeks cleanly
> (two cycles); Issurin's does not — which is currently the only thing blocking the 8-week variant.

---

## Layer 4 — OPEN, and the reason this doc is live

The science review moved faster than the spec. These are unresolved and several point at the design, not
the implementation.

- **The interference premise.** The spec cuts intensity and holds volume. Fyfe 2016 (work-matched) found
  intensity does **not** mediate interference; Wilson's own moderators were modality, frequency and
  duration. Schumann 2022 (43 studies) found **no** interference for max strength or muscle size — only
  explosive strength was attenuated. Hickson showed cutting *intensity* is precisely what loses VO2max.
  **Both goals point the same way: cut volume, keep intensity.** The current design is backwards, and the
  engine's own code comments already cite Fyfe against it.
- **Prilepin is cited and not followed.** None of the four prescriptions sit inside his table; accumulate
  is nearly double his ceiling. Cheapest fix is to drop the claim — his table came from weightlifters
  doing explosive competition lifts and never fit a set of eight bench press.
- **The RIR 2 anchor.** A 2024 meta-regression across 67 strength studies found training closer to
  failure **did not improve strength**; the practical band is 3–5. Van Hooren independently says stop
  well short. Anchoring at 3 costs ~3 percentage points of load and puts the whole block inside the
  recommended band.
- **Accumulate is programmed like a hypertrophy phase.** 5 × 5–8 is the highest-volume block in a
  protocol whose stated intent is strength and neural adaptation. Van Hooren: keep volume low or you
  build size an endurance athlete doesn't want.
- **No explosive work.** Van Hooren: heavy lifting alone can blunt rate of force development; plyometrics
  are the counter. Currently absent entirely.
- **3-day vs 4-day.** On four lifting days, only Sunday is clear of heavy legs for a hard endurance
  session — and Sunday is the long day. On three, Tuesday and Sunday are both free, and each lift comes
  round ~1.5×/week instead of 1×, so a rep range traverses in under three weeks instead of four.
- **Five sets vs three or four.** Van Hooren (volume), Prilepin (if kept), and Rønnestad all point below
  five. Nobody has picked a number that isn't a pick.
- **The 8-week variant may not exist.** Complete arc needs 4 + 3 + 2 + 1 + 1 + 1 = **twelve weeks
  exactly**, at one session per lift per week. Even narrowed, three fixed weeks leave five for three
  phases that each need two. Options: kill the 8-week, or ship it without a taper and label the retest
  confounded. Dropping a block breaks the ATR lineage claim.
- **5/3/1 as an alternative.** Zero invented numbers, every parameter specified by its author, fifteen
  years of field use, three working sets, a measurement every week, and a 90%-of-max working number that
  solves the overshoot problem structurally. It does **not** use reps-in-reserve, which is the loop this
  whole engine is built on. Not a recommendation to switch — a standing argument to **borrow its answers
  wherever we would otherwise invent one**.

### Numbers with no source, per Michael's rule (flag and stop, do not substitute)

Still invented: **the bodyweight floor at max < 6** · **the accessory range 6–10** (though Schoenfeld
2017 puts it inside a band where the exact choice doesn't much matter).
Still absent: **the adherence threshold** that decides whether a retest counts. That one gates a claim
about the athlete's result, so it needs a basis before it ships.

**Newly sourced this session, previously invented:** endurance volume at two-thirds (Hickson) · three
endurance sessions (Hickson) · 24h separation (Robineau — 6h is the real floor) · one quality session
(one HIIT/wk maintains) · the 10% stall reset after two misses (Starting Strength lineage → T2).
**Needs widening:** the 4-week season gate — practitioner consensus is 4–6.

---

## Verification

`feedback_efforts_verification_method`: deno fixtures, not prod. Every bug case becomes a permanent
regression. One Michael-driven acceptance run at the end.

**One harness kept, and it is TRACKED:**

`scripts/audit-strength-block.ts` — runs a full 12-week block through the real composer, weight resolver
and RIR derivation for four athlete sizes (strong → novice) and prints every authored weight and target
week by week, flagging weeks where the load does not change. Run with
`~/.deno/bin/deno run --allow-read scripts/audit-strength-block.ts`.

**Right now it audits the OLD composer** — which is the point: it is the **before** picture. Re-run it
after the 5/3/1 rebuild and the repeated-weight flags should be gone (the % ramp created them; a fixed
working number does not).

> ### ⛔ WHERE VERIFICATION SCRIPTS GO — this is a documented rule, not a preference
> `.gitignore` carries: `scripts/_*` → *"Throwaway local verification/debug scripts."* So:
> - **Keeping it?** `scripts/<name>.ts`, no underscore. Tracked. 1,044 files live there.
> - **Throwaway?** `scripts/_<name>.ts`. Gitignored by rule.
> - **`scratchpad/` is NOT a repo convention.** It is a Claude Code session directory that earlier
>   sessions leaked into the repo.
>
> **Live consequence:** `ENGINE-STATE.md` cites `scratchpad/q202-deployed.ts` as *"the verification
> harness that found the last three bugs."* **That file is not in the repo.** A doc pointing at a
> harness that does not exist is the same rot this session spent the day clearing — if that harness is
> worth the reference, it needs rewriting into `scripts/`.
>
> Four other harnesses were written this session and **deliberately deleted**: they validated *derived
> entry percentages*, and V1 does not derive them — Wendler supplies them. Spent, not lost.

And the D-322 lesson: **read the row, invoke the deployed function.** Asserting from the formula instead
of the output was the shape of every error that session.
