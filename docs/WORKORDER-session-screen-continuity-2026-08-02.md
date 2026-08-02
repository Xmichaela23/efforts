# WORK ORDER — ONE VOCABULARY, FOUR SPORTS (2026-08-02)

**Michael, at the close of the 2026-08-01 session:** *"we need it to mirror run with the same or
comprehensible data points… should a fresh chat tackle both simultaneously to ensure visual continuity,
a wide continuity?"*

**Yes, and one session must hold BOTH.** Splitting bike and run across separate sessions is how they
drifted apart in the first place — the deliverable is that they agree, so one pair of eyes has to hold
both at once.

⚠️ **This is not a redesign.** Every screen named here is built. The job is that four sports answer the
same questions with the same words, and that the engine answers shared questions in ONE place.

---

## THE DISEASE, NAMED

Each sport grew its own private answer to a question both were asking. Four instances found in one
night, all in the same evening's tracing:

| the shared question | run's answer | bike's answer (before) |
|---|---|---|
| how long was the planned session? | `computed.total_duration_seconds` | summed the STEPS only → 0 for unstructured |
| which analyzer runs after an attach? | itself | nothing (`if (finalSport === 'run')`) |
| which read leads the row? | — | re-derived on TWO screens, differently |
| does this ride count toward the trend? | — | the trend knew; the session card did not |

**All four are fixed ([D-361], [D-362], [D-363]).** ⛔ **SWIM AND STRENGTH HAVE NEVER BEEN CHECKED FOR
THE SAME DISEASE.** That is the first task, not the last: find the questions before designing the rows.

---

## THE RULES SETTLED (apply these; do not re-derive them)

1. **Score what was prescribed.** Watts prescribed → power governs. "Easy" prescribed → heart rate
   governs. Nothing prescribed but a duration → duration. Never grade against a prescription the
   athlete was not given ([D-362]).
2. **Name the reason, never report an absence.** *"No hard efforts yet"* is a fact about how they
   train; *"too few to read"* is the app announcing its own failure ([D-359] §3).
3. **The server decides, the screen renders.** Lead selection, eligibility, silent-reasons — all
   server-side fields. A client that re-derives a rule will drift the moment the rule changes ([D-359] §5).
4. **One number per fact.** Two tabs printed two elevations for one ride ([D-363]).
5. **A shown number shows its uncertainty** ([D-356]) — and where its bar came from ("est. from your
   max HR").
6. **Cross-block judgements belong to State.** A session page owns the session ([D-363] §1).

---

## TARGET ROW SHAPE — the one vocabulary

The run is the reference implementation. Every sport renders the same row NAMES; the CONTENT is the
sport's own instrument.

| row | run | bike | swim | strength |
|---|---|---|---|---|
| **Insights** | paragraph with cause (heat, climb, RPE, prior session) | ⚠️ ONE SENTENCE — the gap | ? | ? |
| **Pacing** | positive/negative split, fastest mile | exists, fires only on interval rides | ? | ? |
| **Heart rate** | drift over the session | ⚠️ buried inside Efficiency | ? | ? |
| **Terrain** | gain · temp · humidity | gain · temp | n/a | n/a |
| **Efficiency** | — | watts per heartbeat + decoupling | ? | ? |

**Three known bike gaps, all confirmed on a device 2026-08-02:**
1. Insights is one sentence where the run gets reasoning that names causes.
2. HR drift has no row of its own; it hides inside Efficiency.
3. Pacing says nothing on a ride without intervals, though power fade is measurable across halves.

⚠️ **Do NOT close these by copying run's TEXT.** Run's paragraph is generated from a richer fact set
(route history, weather, prior-session context). Check what the bike packet actually holds first — the
failure mode is a bike sentence that asserts a cause it cannot evidence.

---

## CHIPS — the header row

Ride: `Execution · Easy|Power · Duration`. Run: `Execution · Duration · Pace`. Same idea, and the
Power/Easy slot is deliberately exclusive: **a session asks one of those questions, not both**.

⚠️ Swim and strength chip rows have NOT been reviewed against this.

---

## STATE OF PLAY — what is already true (do not re-litigate)

- Attach works for unstructured sessions, for Garmin-pushed sessions, and re-runs the right analyzer
  for the sport ([D-361]).
- Ride execution scores against what was prescribed, with the HR governor for easy rides ([D-362]).
- The ride Performance tab is trimmed to running's shape; fatigue moved to State; a ride the trend
  discards no longer renders its contaminated HR reading ([D-363]).
- Bike direction is gated and floored; the row names its reason ([D-359]).
- Cycling FTP is a choice, honoured by one resolver ([D-360]).

## OPEN, AND WHY THEY WERE LEFT

- **Swim + strength never audited** for the four shared questions above. **Start here.**
- **`completed_steps` reads "0 of 1"** on an unstructured ride. Not on screen anywhere; cosmetic.
- **Our power is ~1.5% under Garmin's** on the same ride (avg 113 vs 115 W, NP 141 vs 143) while max
  power matches EXACTLY (424 W). Same file, different handling — likely the start of the ride or
  zero-power samples. **Filed, not investigated.**
- **`Workload 86` reads as TSS** on the ride readouts (Garmin showed TSS 66.3). Different unit, sitting
  in a grid of power numbers. Label problem.
- **The ±2.0% bike verdict band** sits at or below the measurement error of its own substrate
  ([D-359] §2). The floor is settled; the band is not.
- **A threshold test would replace two estimates at once** — FTP (currently 95% of best-20) and the easy
  HR ceiling (currently 75% of an OBSERVED max, which is a floor on true max, so the ceiling reads low
  and judges harshly). The screen already says "est. from your max HR" so the athlete can see why.

---

## HOW TO WORK IT

1. **Trace before building.** Every row above exists somewhere. `docs/CAPABILITY-MAP.md`, then grep.
2. **One sport's fix is two sports' fix** — if the answer differs per sport, it belongs in `_shared`.
   Three such moves landed on 2026-08-01 (`planned-duration`, `analyze-routing`, `ride-easy-hr`).
3. **Verify on a device, per row.** Every finding in this document came from Michael reading his own
   screen, not from a test. The suite was green through all of it.
