# SPEC — Race Builder + 5/3/1 Marathon Strength Support

**Status:** LOCKED 2026-08-03 (Michael). **NOT built — and it IS a build, not "just wiring."** Scope:
**marathon (run race) only** to start.
**Lifecycle:** build contract. When it ships, fold its substance into a `D-NNN` in `DECISIONS-LOG-2.md` and
**delete this file** (per the SPEC lifecycle in `CLAUDE.md`).

> ⛔ **CORRECTION 2026-08-03 (the PM was wrong, the trace corrected it).** An earlier draft of this file
> claimed "this is wiring, not a build" and "today's 5/3/1 work plugs into it." **Both were unverified and
> both are FALSE.** A trace found the spec's central premise — *"one strength option: Wendler 5/3/1, served
> by the existing `wendler-531.ts`, untouched"* — does not hold: **5/3/1 has NEVER been connected to race
> plans.** Read the REALITY section immediately below before anything else.

---

## ⛔ REALITY — TRACED 2026-08-03 (this is the accurate map; the spec sections below are Michael's INTENT)

### The headline: the spec's biggest item isn't in the spec
Race plans are built by `generate-combined-plan`; its strength comes from **eight non-Wendler protocols**
(durability, triathlon, five_by_five, neural_speed…) via `session-factory.ts:2577`. The 5/3/1 engine is
gated to **non-race, strength-develop-only** plans: `create-goal-and-materialize-plan/index.ts:2432` routes
to 5/3/1 only when strength is `develop` AND no endurance discipline is developing (`target_date: null //
non-race`). **A marathon develops running, so it can NEVER reach 5/3/1 today.** `wendler-531.ts` stays
untouched, but **a marathon plan needs a new ROAD to it. That is the build.**
- **Recommendation:** route the race path through the **existing 5/3/1 composer** (keeps one spine) rather
  than adding a `wendler_531` protocol to the race registry (this codebase already grew four generators).

### Genuinely already built — reuse confirmed
- **`extract-races`** — real, marathon in its distance list, returns multiple races A/B-sorted. ✓
- **The two entry buttons** exist, just named differently: "Add a goal" → Focus (`GoalsScreen.tsx:2334`),
  "Plan a season" → race wizard (`:2343`). **Relabel, not new screens.**
- **5s PRO** — shipped, called a **"leader" cycle**: `setsForWeek('leader', …)` = five reps every set, no
  AMRAP (`wendler-531.ts:52`). A flag, not a build.
- **80–85% TM** — already the default (85%, top of band, Wendler's reasoning in the comment). Nothing to do.
- **Accessory dose split** — the axis exists: **[D-376]'s `strength-intensity-tier.ts`** (light/loaded/power)
  is exactly the field "never 1×25 on a loaded hinge" needs.
- **Run-specific movements** — all in the catalog (calves, soleus, Nordic, RDL, hip thrust, hamstring curl,
  Copenhagen, clamshell). Only "monster walk" missing.
- **Two-day template** — not built, but the mechanism is: three-day mode already stacks two lifts in one
  session (`strength-primary-plan.ts:884`, comment cites Wendler's two-day version). The dial is typed
  `3 | 4` in four files.

### Three gaps the spec calls "wiring" but AREN'T
1. **Hold-card DOSE has no race-side reader.** Posture output (`per_discipline_posture`) IS read by the race
   generator (plumbing job), but the dose (`target_weekly_ride_hours`, "bike in hours") is read only by the
   strength-focus generator. The race side has never heard of it — needs a new reader.
2. **The triathlon default is worse than an hours screen.** `session-frequency-defaults.ts:262` defaults sport
   to `'triathlon'` and both wizard calls omit sport; `running`/`cycling` **throw** (no matrix rows). So a
   marathon is saved today with 2 swims + 2–3 bikes/wk, treated as a floor
   (`reconcile-athlete-state-week-optimizer.ts:167`). Fix = writing running rows into a reference matrix.
3. **The strength taper REVERSES documented, validator-enforced doctrine.** `STRENGTH-PROTOCOL.md §3.7`
   prescribes a "Taper Priming" session 3–4 days out; `week-builder.ts:129` keeps strength 1×/wk through
   taper. The spec says stop 10–14 days out, empty final fortnight. **Supersedes doctrine + its conformance
   test — needs a D-number, not a quiet edit.**

### Design calls (some the spec flagged, some it didn't)
- ⛔ **TM holds vs climbs — related to [Q-256] but NOT the same call, and it may make Q-256 irrelevant on this
  path.** 5s PRO removes the AMRAP; with no AMRAP every cycle returns "hold" (`cycle-verdicts.ts:113`) and the
  TM **freezes on its own.** So picking 5s PRO **is** choosing "holds" — the ceiling never binds. **RECOMMENDATION
  (terminal's, and I agree): hold the TM for the marathon block and SAY so on screen** ("the bar holds through
  the build; we re-test after the race"). Matches the spec's own logic (marathon is boss, strength is insurance),
  it's what the code already does, and it dodges the AMRAP-in-taper collision. Then Q-256 only serves the Focus path.
  - Comes with three sub-calls: a true all-5s-PRO block is currently impossible (`leaderCount` always leaves the
    last cycle an anchor — new rung needed); if you keep one anchor for the measurement its AMRAP lands week 11
    of 12 — **inside the taper fortnight**; and a fresh block is authored assuming every cycle advances
    (`strength-primary-plan.ts:1285`) — hold it and the plan would promise a climb it can't earn.
- **How 5/3/1 reaches race plans** — see the headline recommendation (call the existing composer).
- **Accessory slots are upper-heavy by construction** (2 of 3 are push/pull) — biasing to legs/hips changes
  the slot set itself, which changes what athletes already picked in existing blocks.
- **FSL 3×5 is genuinely NOT built** (`SPEC-strength-language.md:51` — "reserved, not in use").
- **"Skip the lifting deload, align with the running down week"** collides with the deload being week 4 of
  every 4-week cycle: either block-start snaps to run cadence, or cycle length flexes (which stops being Wendler).

---

---

## Entry and reuse

Goals gets **two entry buttons**:
- **Focus** — the non-race development goals (strength, VO2max, speed, distance). This is the **existing
  non-race / strength-focus builder, used as-is.**
- **Race** — builds a single race or a season of races, and it **reuses the existing goals-build flow**
  rather than a new wizard. Do NOT rebuild what's there.

The **race finder is the existing `extract-races` function**, which already takes a typed race, web-searches
the official name / date / distance, and already returns **multiple races sorted A/B priority** — so a
multi-race "season" is largely wired already.

Be mindful of sport specifics: **start with the marathon only.** The other distances (5k/10k/half, and the
tri set — sprint, olympic, 70.3, ironman) come later behind the same machinery.

## Maintaining other disciplines

For a marathon, the athlete can opt to **maintain bike and swim**, using the **exact same maintenance logic
as strength — the à la carte hold cards already built in the non-race builder.** Opt-in with a clean default
of **run-only**; the athlete sets the dose (**bike in hours, not miles**, per D-323 §6); the engine treats
each held discipline as a **floor**, and it's the **first thing trimmed on a heavy run week.** One consistent
"maintain a secondary thing" mechanic whether that thing is a lift, a bike, or a swim.

⛔ **This fixes the current bug where the hours screen assumes triathlon** — the hours math now keys off
**which disciplines were actually kept.**

## Strength — one protocol, conservative delivery

Exactly **one strength option: Wendler 5/3/1**, loading served by the existing **`wendler-531.ts` layer,
untouched** — percentages, training-max progression, and deload math stay exactly as 5/3/1 prescribes.

- **Frequency drops to 2 days/week** (a NEW rung; the engine currently does 4 or 3), built as Wendler's own
  published **two-day template**: Day 1 Squat + Bench, Day 2 Deadlift + Press — all four main lifts, balanced
  upper/lower.
- Because the marathon is the priority, use Wendler's **conservative low-fatigue variant**, not the aggressive
  one: run **5s PRO** (every main set is five reps, the AMRAP max-rep set removed — the single biggest fatigue
  cut), set the **training max at 80–85%** instead of the default 90%, keep supplemental work minimal
  (**First Set Last 3×5** rather than Boring But Big), and **skip the separate lifting deload**, aligning
  strength down weeks with the running down week instead.

## Accessories

Swap Wendler's general assistance for a **run-specific pool**, dosed minimally per the tagged list.
- **1×25** for high-rep, low-leg-cost movements (calves/soleus, core, glute-band, hamstring curls).
- **2–3×8–12** for loaded ones (RDL, single-leg work, hip thrust) — **never 1×25 on a loaded hinge.**
- Bias the whole pool to **legs, posterior chain, hips**; keep upper-body assistance light (bench and press
  already cover it as main lifts).
- Governing dose rule: **accessories must never leave the legs sore for the next run** — stop 2–3 reps short
  of failure, and accessories are the **first thing trimmed** when a hard run week needs the legs.
- Mark the **Nordic curl as an eccentric-strength movement, not injury-proofing.**

## Governing rule and scheduling

**When a race exists, the race is the boss.** Long runs and quality sessions place first; **strength bends
around them — keep Wendler's numbers, bend Wendler's calendar.** The main lift always runs; only accessories
and placement flex. Where possible, put a tempo/interval run the **day after** a lower-body lift day, not
before, so squat/deadlift fatigue doesn't wreck aerobic pacing.

**Taper the strength out entirely in the final ~2 weeks:** the last (reduced) strength session lands roughly
**10–14 days out**, and the final fortnight is nothing but the run plus optional easy mobility — this costs no
strength (adaptations are durable over two weeks) while removing residual leg fatigue that fights race-day
freshness. **Don't cut it early** — hold the reduced strength until ~two weeks out, then stop.

## Science posture (errs safe, and says so)

Two cleanly separated claims, never blurred:
- **The mechanics are proven** — heavy compound strength twice a week improves running economy and reduces
  overuse injury (Denadai 2017, Blagrove 2018, Lauersen 2014).
- **The delivery is Wendler's own conservative in-season variant, not our invention.**

⛔ There is **no study on the branded 5/3/1 system in marathoners**, so the app must **never claim "5/3/1
makes marathoners faster."** The honest line: heavy strength twice a week improves economy and durability
(proven), delivered as 5/3/1 in its most conservative, run-friendly form so it supports the marathon instead
of competing with it. The one documented practitioner account is EliteFTS "5/3/1 and Run" — useful for how to
organize it, **not proof of outcome.**

---

## ⛔ CONFIRM BEFORE BUILDING (flagged in the spec, not fully traced — these are the trace + decision targets)

1. Plug the run-accessory pool into the **existing assistance-selection engine** (the assistance-collision
   tests) rather than building new plumbing.
2. Adding **2 to the lifting-days dial** touches the block math, not just the UI (the engine does 4 or 3 today;
   2 is a new rung).
3. Reconcile **5/3/1-as-base against the separate "double progression" Get Stronger thread** so they don't
   contradict. *(Note: [D-323]'s "double progression is the one change" is documented WRONG — the protocol was
   replaced; double progression lives on the dumbbell plan and is unbuilt. So no live conflict, but confirm.)*
4. ⛔ **Decide whether the training max HOLDS (true maintenance) or keeps CLIMBING across a long build.** —
   STILL OPEN, and it is the **same decision as [Q-256]** (the stale-1RM ceiling). For a marathon block,
   holding the TM protects the legs; climbing chases strength. Michael's call, and it does double duty with Q-256.
