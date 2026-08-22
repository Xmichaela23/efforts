# The Standing Plan — decisions, 2026-08-21

**What this is.** One consolidated writeup of a long product session, so the next chat starts from a
document instead of re-deriving it. Michael is deliberately keeping doc overhead low right now —
this replaces a dozen `D-NNN` entries, not adds to them.

**Nothing here is built or specced.** These are rulings and findings. The build sequence is at the
bottom.

---

## 1. The product

**The Standing Plan** is the base program. Named by Michael this session. (Rejected: "Year Round";
"The All Rounder" — Viada's branding. ⛔ **"Base" and "Baseline" are unusable** — `base` is already a
`PhaseKind` from `canonicalizePhaseName`, and "baselines" is the living-baselines concept and screen.)

**The customer, in his words:** 10–30 mile-a-week runners, run-club social runners, weekend cyclists,
maybe a marathon, triathletes burnt out after a couple of Ironmans or 70.3s, people who want to stay
in shape and look good.

**The thesis:** *"our entry-level program — not in your abilities, but in maintaining your fitness,
and growing your speed and strength and being able to maintain your miles so you can pivot into races
or more focused training on your endurance discipline of choice."*

**And the value proposition, bluntly:** strength as a real part of endurance training, so an athlete
in their 50s doesn't have a body torn up by miles. ⛔ **This is supported by the source, not just a
joke** — the All Rounder lists size and body composition as an explicit goal, Viada's own recommended
first program is Hypertrophy + 5K, and p280 notes bone-density loss in obligate cyclists that
lifting and plyos protect against.

### Four consequences

1. **Entry-level is a POSITION, not an ability tier.** Never ship it labelled as a beginner program.
   Viada's All Rounder says intermediate-to-advanced *and* calls itself the place to start.
2. **10–30 miles is a 3× span — levels are the dial, not separate plans.** Same week shape, level 1
   to 3, roughly a 3–4× dose range.
3. ⛔ **THE BASE MUST PRESERVE PIVOT-READINESS.** This is the hard constraint and it is where the
   Standing Plan differs from Strong Focus. Strong Focus says outright *"speed and threshold are not
   maintained by this block"* — it lets them decay. The base cannot, or a pivot becomes a rebuild and
   "so you can pivot" is a lie. Viada's maintenance rule is the floor: ~1/3 of productive volume at
   ≥1×/week holds an adaptation.
4. **The run/ride mix changes what the block can deliver, and the app should say so.** See §3.

---

## 2. Strong Focus — what happens to it

**Finding: it fits no published model at the endurance volume our users want.**

| | lifting | endurance | strength progression |
|---|---|---|---|
| Wendler's running templates (pp.185–191) | 3–4 days | **~4–5 miles/week** | full increment |
| Viada Strength + 5K (p246) | **4 days** | 4 sessions, **running only** | **1% per 3 weeks** |
| **Strong Focus** | 3 days | **6 sessions, two sports, 6h03** | full Wendler increment |

Less lifting, more endurance, spread over two sports — and it expects faster strength gain than the
program with more lifting and less endurance. **Both authors independently slow strength when
running volume is real.** Nobody pairs a developing barbell progression with two-sport endurance.

**Secondary finding: the copy claims a trade the plan doesn't make.** *"Strength leads for 12 weeks"*
then prescribes a full hybrid week unchanged. ⚠️ **The BUILDER does make the trade** ("which endurance
are you keeping", "your holding dose while strength leads") — the defect is that the built week
overshoots the stated hold: 15 miles asked, ~184 min of running built, which is 15 miles only at
12:15/mi.

**Ruling: no separate Strong Focus plan.** The Standing Plan is the base; endurance pivots come off
it. Strength is always present in the base, which is the product identity already written in
`CLAUDE.md`.

---

## 3. The science — settled this session

**The corpus is complete and page-cited.** `docs/SOURCE-viada-hybrid-athlete.md` (Ch.4, 5, 9, 10) and
`docs/REFERENCE-531-forever-pp16-45.md` (+ a new addendum for pp.185–191). **Page images live outside
git** at `~/Efforts_Local_Folder/book-sources/{viada-hybrid-athlete,wendler-531-forever}/`, named by
page, each with an `INDEX.md`.

### Rulings

- **Keep each author whole inside a program. Never blend within a week.** The Standing Plan is
  Viada's week, intents, movements, endurance library and levels.
- **Wendler stops being a plan and becomes the progression authority.** Viada's progression is
  unimplementable as written — *"assume 1% every 3 weeks"*, no miss rule, no stall detection, no
  reset. Wendler's is exact and already built, verified and deployed. **Viada gives the rate;
  Wendler gives the mechanism.** `wendler-531.ts` was extracted pure for exactly this reuse.
- ⚠️ **What is portable is narrower than the whole module.** Portable: the verdict machinery —
  increment, hold, stall after two, 10% reset. **Not portable: the percentage wave.** Wendler's tops
  out near 81% of true 1RM; Viada's ME asks 90–100%. Running his wave in an ME slot gives the wrong
  load, and that must be recorded as a stated deviation rather than disguised.
- ⛔ **Olympic lifting is OUT OF SCOPE** (Michael). That excludes Weightlifting and Running (p282)
  and The Speed Solution's triple-extension day (p276). Does not affect plyos or ordinary barbell work.

### Findings that change the design

- **Deloads: there is no seven-week cycle.** Wendler p.19 — *"not done every seventh week; it's just
  a name."* His cycle is 3 weeks; the 7th Week Protocol is a standalone one-week insert. Our 3:1
  rhythm is already a 4-week endurance mesocycle. The extra deload we add at week 4 is what snaps
  them together, and he permits it explicitly.
- ⛔ **Viada rejects overreach-to-deload for a mechanical reason** (p120, read directly): the two
  disciplines rebound on different timeframes, so *"this 'overreach to deload' will always be
  suboptimal for at least one discipline."* He also rejects heavy monitoring — structural variation
  *"highlights areas of relative weakness without requiring excessive testing/analysis on an ongoing
  basis."* **So the model is: build a week that never digs a hole.** The five buckets are a
  **preventive guardrail on the weekly ramp, NOT a deload detector.** Using them as a detector
  rebuilds the model he rejects.
- **Assistance: our band is not below Wendler.** In his own running-integrated templates 25–50 per
  category is the number for days that carry a run; 50–100 appears only on non-running days; the
  seventh week drops to 0–25. `src/lib/assistance-menu.ts` was corrected this session. **Do not
  re-raise toward 50–100 on the strength of p.24 alone.** Still ours: the *axis* — we scale by the
  week's hard-endurance-day count, he scales by the day's own content.
- ⛔ **Cycling is different from running, and this corrects an earlier claim.** p280: all three
  cycling programs *"can be used to develop strength beyond what is 'needed'"* — progression, not
  just maintenance — and Base/Fondo are *"the best framework for competitive lift training,"* big
  three one-or-two times a week, both ME and DE. Because there is no impact. **Caveats he gives:**
  cycling is surprisingly CNS-taxing, fatigue masks fitness, expect lowered lower-body performance,
  and *"proactively lower your working max by a few more percentage points than usual."* Plyos matter
  more for cyclists (bone mineral density).
  **So a bike-heavy athlete gets real strength progression; a run-heavy athlete at the same hours
  gets maintenance. The plan should say so rather than promising both the same thing.**

### The accessory model is measuring the wrong quantity

- Ours is a **rep total per category**, split however the athlete likes. Nothing counts sets.
- The growth driver is **effective reps per muscle per week** (Viada: 8–12 sets per muscle, 32–48
  effective reps, 8–10 reps at 1–2 RIR, isolation-biased).
- The recovery cost is **work sets per session** — 6–8 recovers in 24–48h, **14+ can cost up to 72h**.
- Neither is expressible in reps-per-category, so we cannot reason about either.
- **No per-muscle floor exists.** Worked from the sample plan: triceps ~8–9 sets, biceps ~8, chest
  ~6, glutes ~3, **quads zero, shoulders zero direct** — because the focus picker decides everything.
  Acceptable when the promise is "hold your strength"; not acceptable when it is body composition.
- ⛔ **Single-leg and core share one slot** (`'push' | 'pull' | 'single_leg_core'`, from Wendler's
  three categories). **Viada separates them** — core gets its own HYP slot in most of his programs.
  That is why abs feel starved: they compete with Bulgarian split squats for one budget.
- **Abs are cheap; single-leg is not.** Abs carry low systemic cost. Single-leg is leg volume on an
  athlete who already runs — different budget, and it belongs on a day that already taxes the legs.
- **The picker stays.** Both authors endorse athlete choice (Wendler p.24 *"it is the work that
  matters"*; Viada encourages rotation and unfamiliar movements). The change is a **floor beneath
  it**, not its removal.

### Open, and not resolvable by more pages

- **The cycling percentage basis** (percent of threshold power) is our inference. p236 states no
  convention; p229 states the running one. Label it as inferred wherever it is used.

---

## 3b. The builder — hard days must CONVERT a session, not ADD one

**The defect.** The athlete asks for 3 runs on the volume step, then picks a hard run on the
intensity step, and the week builds **four** — Mon easy, Tue hill repeats, Wed easy, Sun long. The
quality session was added on top of the three already committed. Same for rides. **This is why the
week fills up, and it is part of why 15 miles asked builds ~20.**

**The fix: intensity is a tag on an existing session, never a new one.** You choose how many runs and
rides; then you choose which of *those* is the hard one. The count never moves.

**Both books structure it this way** — Viada's programs do not say "four easy sessions plus a hard
one." Strength + 5K has four endurance sessions and the NT session **is one of the four**; the All
Rounder has five and MLSS+ and NT are **among** them.

**Consequences**
- ⛔ **The screen-order problem dissolves.** Volume is currently picked before intensity, which feels
  backwards. Under conversion the order stops mattering, because intensity spends nothing new.
- **Gating becomes obvious**: you cannot have more hard sessions than you have sessions; the long run
  is already one of them; **at 3 runs a week that is one long, one hard, one easy.**
- **The floor is Viada's**: one speed session, one subthreshold session, everything else at VT1 or
  below. So at least one session per sport stays easy.
- **Copy changes** from *"Add speed, VO2 max, or threshold work"* to *"which of your runs is the hard
  one"* — the picker lists the athlete's actual sessions and they tag one. If they asked for 2 runs,
  the screen says one is long and one is hard rather than quietly inventing a third.

## 3c. What the builder asks — the PROGRAM owns the count, the ATHLETE owns sport and level

**Decided 2026-08-21.** Asking the athlete about endurance is settled policy (endurance à la carte)
and is what every commercial app does. **But neither author asks for raw volume.** Viada prescribes
the shape — the All Rounder has five endurance sessions in fixed roles — and lets the athlete choose
**which modality fills each slot** (p275 permits any low-impact power-metered device for the cycling
work, elliptical/arc for running, "at least one day" with ground impact) and **what level** (1–3).
Wendler does the same with his 2-, 3- and 4-day scheduling variants.

**So the question becomes:** *this plan has five endurance sessions — which are runs, which are
rides, and how big is your week?*

- **The program owns HOW MANY.**
- **The athlete owns WHICH SPORT and HOW HARD.**

⛔ **This closes a live bug.** Today the volume answer and the program's shape are separate things
that never reconcile — 15 miles asked, ~20 built. If the program owns the count they cannot disagree.

**Pairs with §3b**: the count comes from the program, intensity is a tag on one of those sessions,
and neither the sport picker nor the intensity picker can add a session.

**Swim is unchanged** — offered, opted out by default, never built out. See [[efforts-sport-priorities]].

### ⛔ THE VOLUME NUMBER STAYS — BOUNDED BOTH ENDS ("up to X")

**Michael's call, 2026-08-21, and it beats removing the input.** The athlete still types a number;
the number is **bounded by what the slots can actually deliver**, so it can no longer be a promise the
plan breaks.

- **Cap** = the longest option in every slot, summed
- **Floor** = the shortest option in every slot, summed — the book has one: bouts under 10–15 min do
  not trigger adaptations (p107), and maintenance needs ~1/3 of productive volume at ≥1×/week
- For the All Rounder that band is roughly **4–7 hours of endurance**
- ⚠️ **The cap MOVES with the sport mix** — putting the long day on the bike gives a different
  mileage ceiling than running it. Computed from the athlete's slot assignment, never fixed.

**On screen:** *"up to 25 miles a week on this plan."* Ask for less, get less. Ask for more, it is not
offered — **that is what a pivot is for.**

⚠️ **Not part of the six-stage cleanup.** Changing volume entry changes what Strong Focus builds and
would move the sweep, which stages 4, 5 and 3 were all built not to do. **First piece of the Standing
Plan build**, and cheap, because stage 4 already built the object that carries it.

## 3d. Session lengths are CAPPED at the book's numbers

**Decided 2026-08-21.** No session may exceed the duration its source session specifies. **This
permanently kills the overshoot bug** — 15 miles asked, ~20 built — because nothing can outgrow the
page it came from.

**The resulting envelope, at the All Rounder's own assigned levels:**

| slot | length |
|---|---|
| hard run (MLSS+ L2) | 35–50 min |
| bike hills (Cyc AnA L1) | 35–70 min |
| threshold run (NT L2) | 50–65 min |
| easy ride (Cyc endurance L1) | 60–100 min |
| long day (LSD L2) | 1h – 2.5h |

**≈ 4–7h endurance + 4–4.5h lifting = 8.5–11.5h/week.**
⚠️ He states durations only for the easy runs and the long day; the rest are calculated from his
interval structures plus his warm-ups and cooldowns. Close, not exact.

### ⛔ THE SIZE DIAL IS *WHICH OPTION INSIDE THE SLOT*, NOT THE LEVEL

An earlier note in this file treated levels 1–3 as the athlete-facing dose dial. **That is wrong for
this program.** The All Rounder assigns its own levels per slot and mixes them (MLSS+ 2, Cyc AnA 1,
NT 2, Cyc endurance 1, LSD 2), and p275 says plainly:

> *"resist the urge to add more difficulty or length/level to the endurance work. **Adjusting
> intensity and estimated threshold figures is always better than extending distance or increasing
> level for this program.**"*

**So you do not turn the level up. You get fitter, your threshold moves, and the same session gets
faster.** The range comes from the three or four alternative workouts each session type offers at a
given level — the long day being the biggest lever, a 1-hour easy run versus a 2.5-hour hike, both
the same slot at the same level. **That spans nearly double the weekly hours without touching a
level**, and it stays faithful to p275.

### The plan's promise, as agreed

**Speed, strength, and maintaining enough of your distance.**
- **Strength** — four lifting days, real progression.
- **Speed** — high-intensity intervals and plyometrics, **not sprinting.** The hard run and threshold
  run are the 5K/10K intensities, so it does make you faster; there is no track session. ⚠️ Say so,
  or someone reads "speed" and expects sprints.
- **Distance** — maintenance, and "enough" is defined: ~1/3 of productive volume at ≥1×/week.

**What it costs, and the plan should say it**: a 30-mile-a-week runner will find this light, and the
long day caps near 2.5 hours. Anyone wanting marathon volume **pivots** — which is the design.

## 4. Build sequence

⛔ **The test for "the last engine": if this work produces a `generate-all-rounder` function, it
failed.** `TARGET-ARCHITECTURE.md` says one history-aware path. The Standing Plan's composer should
become *the* composer that other plans are configurations of, not a fifth sibling beside four dead ones.

**Work order re-ordered to 1 · 4 · 5 · 2 · 3 · 6** (`WORKORDER-finish-the-swaps-2026-08-20.md`,
banner at top; ENGINE-STATE banner points the next terminal at stage 4). Michael's ruling:
*"whatever supports the build so we aren't crazy glue and taping it together."*

- **Stage 4 first** — one object for what the athlete asked for. A new composer reading nine names
  for "how many rides" bakes the mess into the final engine.
- **Stage 5 before or with the composer** — adding one while four dead placement engines are
  reachable makes it six. ⛔ **Blocked on a Michael ruling:** does an engine-chosen hard day still
  yield when the week cannot hold it, or is build-and-warn the rule for both? Recommendation in the
  work order: build-and-warn for both.
- **Stages 2 and 3 deferred, not dropped.** The Standing Plan prescribes which endurance sits on
  which day, so the scorer matters less for the base. Still needed for pivots and day-shuffling.

**Then, in dependency order:**

1. **The endurance session library with levels** — the mirror of `wendler-531.ts`. Feeds the base
   *and* every pivot. Highest leverage item.
   ⛔ **Build it as a GENERATOR, not a transcription.** Methods are not ownable and should be cited
   freely; the specific session tables and movement lists are the authors' expression. Generate
   sessions from the rules against the athlete's own thresholds. This is also the better engineering,
   and it matters because Michael intends to write to both authors.
2. **The strength grid** — pattern × category × intent, as an accessor over vocabulary that already
   exists (`protocols/intent-taxonomy.ts` already states "protocols output intents, placement
   policies assign intents to days"; a `MovementPattern` vocabulary exists).
3. **Accessory rework** — set-based dosing, per-muscle floor, core split from single-leg.
4. **The composer**, then levels surfaced in the builder.
5. **Stage 6 (compromise notes) alongside the composer** — the truths it must tell are new: what a
   run-heavy versus bike-heavy mix delivers, and what a level costs.

---

## 5. Still open for Michael

- The stage 5 ruling (hard-day yield vs build-and-warn).
- Device verification of stage 1 — needs a new block built. Also the science acceptance run.
- Whether the Standing Plan's ME slots default to Viada's secondary lifts (as published) or offer
  primaries with Wendler progression (his stated permission, p275).
