# The Standing Plan — pivot rulings, 2026-08-22

**Read with `DECISIONS-2026-08-21-standing-plan.md`. This supersedes its frame choice; everything
else there stands. Stages 1–3 are unaffected — they were built as plan-shape-free libraries and
survive this pivot whole.**

---

## 1. THE FRAME PIVOT — the All Rounder is out as the base

**Michael's ruling:** the All Rounder is the hardest program to software (no primary lifts anywhere
→ every weight rides the ratio table outside its stated range) and it is for the ambivalent —
no gains, no reason to follow it. Out as the base. Stays possible later as a "holding" frame; not built now.

**The product is one week with a dial: WHAT'S LEADING.** Frames, each one Viada program WHOLE
(the no-blending law of 8-21 §3 stands — no week ever mixes two authors' structures):

| Dial position | Frame | Page | Why |
|---|---|---|---|
| Strength leading, runner | **Strength + 5K** | p246 (notes p247 — ⛔ UNREAD, read before stage 4 builds) | 2 ME slots per heavy day, 4 endurance slots, a rest day. Real heavy work on the tested lifts. |
| Strength leading, cyclist | **Cycling: Base** | p278 / notes p280 (read 8-22) | His own words: "progression and not just maintenance"; "best framework for competitive lift training." 3 lifting days (speed days merged — his variant), 6 rides. |
| Endurance leading, runner | **Strength + Half-Marathon** | p250 / p251 (read 8-22) | "Can be run indefinitely"; pivot-ready in his words; marathon-capable (longer NT + LSD). NOT a first program (his gate). |
| Endurance leading, cyclist | Fondo (p279) / Crit (p281) | notes p280 | Later. Crit strength = DE secondary only — his design. |
| Holding | **the taper/deload column of the current frame** | every table | Not a separate plan. His substitution table used as a switch. |

Blocks of ~8–12 weeks; re-ask the dial at block end. Athlete never sees program names.

## 2. SPORT-SLOT ASSIGNMENT (our move, labeled)

Endurance columns list session TYPES; sport per slot is assigned. His permission for this is written
in the All Rounder notes (p275: any power-metered non-impact modality; LSR can be a ride) —
**applying it across programs is OUR transfer, labeled as such.**

- Two hard endurance sessions per week when running is in the mix (his pattern everywhere; Wendler
  independently: 2 hard, 3–5 easy). Up to 3 when bike-dominant.
- **Hard sessions are ASSIGNED BY THE DIAL, not asked:** strength leading → hard sessions on the
  bike (his p280 reasoning: no impact = intensity doesn't tax the lifts). Speed/run leading → on the run.
- A held sport keeps its LONG session (maintenance floor: ~1/3 productive volume ≥1×/wk) and loses
  its hard one. State the cost in copy: base holds, top-end speed decays.
- **Convert, never add** (8-21 §3b stands). The program owns session count; athlete owns sport + level.

## 3. THE WORKING NUMBER — one number, his

- **Viada's working max: 96% of predicted true 1RM, from his 5-rep pretest (p215: two formulas,
  Epley + Brzycki, AVERAGED, × 0.96).** The app walks the p215 protocol as a guided session.
- **NEW stored field. It never touches `plans.config.training_max` (85%, three live readers).**
  The two numbers never convert into each other. Same-word collision documented 8-22.
- Wendler's wave, training max, and AMRAP set are OUT of the new plans. **Get Stronger ships on,
  untouched.**
- ⚠️ Our single-formula e1RM (Epley) reads ~1.6% high vs his average — heavier direction. Use his
  two-formula average for the pretest path.

## 4. PROGRESSION — deterministic, and not a second coach

Michael's constraint: no merging two coaches' techniques. Resolution: what fills Viada's progression
hole is FIELD-STANDARD app mechanics, not Wendler's signature system:

- **Double progression** on his rep ranges (his slots are all ranges): top of range at prescribed
  RIR across sets → weight up next time; below bottom → down.
- **Rate anchors are his:** ~1%/3wk general (p275), **~1%/4wk when running is real (p251)**. Steps
  land on real plates: 5 lb upper / 10 lb lower to start; step size gated by the athlete's declared
  smallest plates (equipment is already declarable).
- **Stall handling (generic, predates any one author):** nothing logged = no evidence = hold
  (never zero); miss → hold; confirmed repeated stall → ~10% back-off and rebuild.
- Deadband rules: never act on a single reading; clamp any single jump; observable freeze (a lift
  unmoved N weeks says so out loud). All thresholds fixed numbers, labeled ours.
- **AI never decides. It narrates what the engine decided.** (Standing law.)

## 5. WENDLER — demoted, not deleted

Three jobs remain: (a) the verdict/stall machinery above, (b) **the beginner rung** — his 3-day
full-body templates for lifting novices (his own audience statement), graduating into the Viada
frames (which are "not a first program" by Viada's own gates), (c) deload permission + the corrected
assistance bands. His brand name stays out of athlete-facing UI
(`StrengthPlansView.tsx:108` prints "5/3/1" — remove when that surface is touched).

## 6. STRENGTH DAYS + THE PICKER (rulings 8-22)

- **The program owns the lifting-day count** (4, or 3 with speed days merged — his variant).
  Not an athlete dial. Athlete choice lives in the EXERCISES.
- Floors therefore always fit under session ceilings at real shapes (4 × <14 ≈ 52 sets vs 30-set
  floor). **Stage 3's gate tests 3- and 4-session weeks, not synthetic 2-session ones.** The
  2-session triage path stays as an internal guard only — never a product surface, no athlete is
  ever offered a muscle-skipping choice.
- **Picker survives whole** (8-21 ruling stands). Core split from single-leg (stage 3). Single-leg
  allowed, dosed against endurance load (his own two programs disagree BY run volume — that's the rule).
- **Focused bodybuilding is native:** HYP slots at his dose (6–12 reps, 0–2 RIR, 8–12 sets/muscle/wk)
  point at athlete-chosen areas (glutes/chest/arms/shoulders); floor beneath, ceiling above.
  Upper-body focus is near-free next to running; leg volume doses against miles.
- "Name the lift you want a number on" → that lift enters the ME slot (his p275 permission).

## 7. POSITIONING (context for copy, not build)

Year-round athlete, not "hybrid" branding. No aesthetic claims — durability, real strength,
pivot-readiness, 40+ benefits (bone density p280, body comp on his own labels). Credit Viada on a
sources page — "informed by", plural sources, never affiliation (HYBRD is his official partner app;
do not read as affiliated). No emojis. Quant-who-trains voice.

## 8. GAPS THE BOOK CANNOT FILL — fill from field practice at stage 4, one line each, labeled ours

rest periods · when 1 ME set becomes 2–3 · plyo dose (n efforts, stop-on-quality-drop) · rotation
cadence for the ME lift pair. ⛔ Decide each AT the point stage 4 needs it; never silently.

## 9. STAGE 4 WIRING (recommended 8-22, unchanged)

Emit the EXISTING session vocabulary (translate stage 1 family names at one edge, one file). Wire
through `generate-strength-plan`'s gate first (strength=develop, no endurance develop = literally
"strength leading"). Endurance-leading position waits until that's proven. The marathon/tri
builders stay closed (banners 8-22).
