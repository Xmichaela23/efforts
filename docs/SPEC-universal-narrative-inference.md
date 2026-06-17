# SPEC — Universal Narrative Inference (cross-discipline)

**Purpose:** One standard for how EVERY discipline's narrative reasons honestly — run, ride, swim, strength. This exists because narratives have been fixed per-discipline in a vacuum: swim got `SPEC-honest-swim-inference.md` over five iterations, but run/ride/strength never inherited those lessons, so each one re-commits the same class of error (siloed signals, internal contradiction, absolute-not-anchored reads, diagnosing cause). This spec is the shared guardrail. Every narrative is checked against THIS plus its discipline addendum.

**Supersedes-in-scope:** generalizes `SPEC-honest-swim-inference.md` (swim becomes the reference implementation + the swim addendum below).

**Relates to:** the continuity invariant (D-185/D-186 single-sourced numbers + display; this is the same invariant applied to *reasoning*). The narrative-core consolidation work order.

---

## The core principle (applies to all disciplines)

**The app sees behavior, not physiology. It compares the athlete to their own intent and their own history — never to absolute numbers it can't anchor, and never to a cause it can't observe.** Where data runs out, the narrative stays silent. Silence on what can't be known is what makes the rest credible.

A narrative is something the app *says* about a workout, shown on multiple screens. Like every number in the app, it must be single-sourced and internally consistent — it cannot contradict itself across its own sections, and it cannot contradict the numbers on the card.

---

## THE 7 UNIVERSAL RULES

Every narrative, every discipline, must obey all seven.

### 1. Reason ACROSS signals, never in silos
The failure: listing terrain in one section, heat in another, HR drift in a third, and never connecting them. (Run botched this — "terrain didn't pull you into harder work" while separately reporting elevated drift.) Swim botched it pre-D-179 — RPE, HR, rest each stated alone.
**Rule:** signals are reasoned about in *relationship*. An elevated HR drift on rolling terrain at high temp is read together — drift, terrain, and heat as related facts — not as three disconnected observations.

### 2. Never contradict across sections
The failure: the INSIGHTS lead says "controlled, easy" while the HEART RATE section says "drifted higher than typical." Two parts of the same narrative disagreeing.
**Rule:** the narrative is internally consistent. If one section reports elevated drift, the lead cannot call the session uniformly easy. The lead must reconcile what the body sections show.

### 3. Anchor to THIS athlete's data, never absolutes
The failure: "119 bpm = working hard" (absolute HR, no zone anchor). "11:13/mi is slow" (absolute pace, no context).
**Rule:** HR, pace, power, effort are read against this athlete's baselines (zones, threshold, FTP, typical drift, fitness tier). Without the anchor → stay neutral, assert nothing about "high/low/hard/easy."

### 4. Observe, don't diagnose CAUSE
The failure: "structured set format" (swim — assigning one cause to rest that has several). "the heat caused your drift" (run — when heat vs. terrain vs. fatigue can't be separated).
**Rule:** state what's observed. Plausible contributors may be named *as plausible* ("on rolling terrain and in the heat, some added drift is expected"), never as proven sole cause. Cause needs information the app doesn't have.

### 5. Average over peak; trend over single session
The failure: a peak HR of 152 read as "the session was taxing" when the average was easy. A single swim's pace read as a fitness verdict.
**Rule:** the AVERAGE characterizes a session; peaks are momentary and don't define it. A SINGLE session is noise; fitness claims require the trend across comparable sessions.

### 6. No fabricated mechanism, no fabricated numbers
The failure: "your VO2 improved," "lactate cleared," quantifying something the data can't support ("fins added 8s/100").
**Rule:** the app describes behavior, not physiology. No physiological mechanism claims. No quantifying a value there's no data to compute — flag direction ("fin-assisted, reads faster") without inventing magnitude.

### 7. Don't restate the card; honest blanks over guesses
The failure: reciting the numbers already on screen as if that's insight. Filling a missing value with a confident guess.
**Rule:** recitation is not insight — the narrative reasons about the numbers, it doesn't repeat them. Where a value or anchor is missing, the narrative omits/stays neutral rather than fabricating.

---

## HOW THIS COMPOSES WITH DISCIPLINE ADDENDA

The 7 rules are universal. Each discipline supplies an **addendum** with:
- **Its signal vocabulary** — what facts it has (run: pace/GAP/grade/heat/HR-drift/cadence; ride: power/NP/IF/W·kg; swim: pace-per-100/work:rest/equipment; strength: e1RM/RIR/volume/load).
- **Its discipline-specific honest reads** — the legitimate interpretations unique to it.
- **Its discipline-specific traps** — the wrong reads it's prone to.

The shared narrative-reasoning core applies the 7 universal rules; the adapter feeds it the discipline's signals; the addendum governs the discipline-specific reasoning. Fix the 7 rules once → all four inherit. Each addendum stays thin and discipline-true.

---

## DISCIPLINE ADDENDA

### SWIM (reference implementation — see SPEC-honest-swim-inference.md for full detail)
- **Signals:** pace/100 (equipment/drill-inclusive), work:rest (moving vs elapsed), avg/max HR, RPE/feel, pool/lengths, equipment-per-step, planned intent.
- **Honest reads:** work:rest vs session-intent norm; RPE×HR coherence (zone-anchored); equipment-flag DIRECTION-only.
- **Equipment is directional, not fins-only:** fins/buoy/paddles speed pace UP (optimistic); kickboard/kick/drill slow it DOWN (pessimistic); snorkel ~neutral. Flag the direction from what was actually used; mixed-equipment sessions have a blended pace pulled both ways and aren't a clean fitness number either way.
- **Traps:** diagnosing cause of rest; absolute HR; peak-driven reads; quantifying equipment effect; pace trend without equipment/drill-flagging (Q-061 — broader than fins: any non-unaided-swimming set).
- **Swim caveat:** swim HR runs ~10–15 bpm below run HR for the same effort; a run threshold is NOT a valid swim anchor.

### RUN
- **Signals:** pace, GAP (grade-adjusted), grade/elevation, temperature, HR + HR drift/decoupling, cadence, planned intent. (Numbers single-sourced via resolveRunScalars, D-185.)
- **Honest reads:** GAP vs raw pace (terrain context); HR drift vs *this athlete's typical* drift; grade + heat as related effort modifiers reasoned together (rule 1); pacing distribution.
- **Traps (the run-specific frame-fucks):**
  - Reporting terrain, heat, and HR drift in separate sections without connecting them (rule 1 violation — the live bug).
  - A "controlled/easy" lead that contradicts an "elevated drift" body section (rule 2 violation — the live bug).
  - Diagnosing that heat OR terrain *caused* drift when they co-occur (rule 4 — name both as plausible contributors).
  - Absolute pace/HR without anchoring to the athlete's zones/typical.

### RIDE
- **Signals:** power, NP, IF, VI, W·kg, HR (secondary when power present), cadence, planned intent. (NP single-sourced via rideComputedNp.)
- **Honest reads:** power is the truth signal — characterize effort from power/NP/IF first; HR is corroborating, secondary; VI for steadiness; W·kg vs the athlete's target for race-readiness context.
- **Traps:**
  - Over-reading HR when power tells the real story (HR is secondary on the bike).
  - Absolute watts without W·kg / FTP anchor.
  - Single-ride fitness claims (rule 5).

### STRENGTH
- **Signals:** e1RM (Brzycki, single-sourced), RIR, volume, load, per-exercise history. NO pace/HR-as-effort.
- **Honest reads:** e1RM trend per exercise (comparison-to-self); RIR as the proximity-to-failure signal; volume/load progression vs prior sessions; progressive-overload read.
- **Traps:**
  - Importing endurance framing (pace/HR/zones don't apply).
  - Single-session strength "fitness" claims without the per-exercise trend (rule 5).
  - Fabricating physiological mechanism (rule 6 — strength is no exception).

---

## THE ARCHITECTURE THIS ENABLES (why it's continuity, not polish)

Today the four narratives are four divergent prompt paths, each fixed in isolation — which is why fixing swim never fixed run. This spec is the standard for a **shared narrative-reasoning core**: one place that enforces the 7 universal rules, fed by per-discipline adapters that supply each discipline's signals and addendum. Same invariant as the scalar resolvers (D-185/D-186): single-source the *logic*, discipline-appropriate *inputs*. Fix the reasoning once → every discipline inherits it → the per-discipline tail-chase ends.

**Single-source the logic, not just the file.** The win is NOT one monolithic function with four `if discipline ==` branches (that's four functions in a trench coat — still editable per-discipline in isolation). The win is one shared reasoning core that cannot be edited for one discipline without affecting the standard for all.

---

## THE LESSON (carried from swim)

Both recurring swim bugs were **captured-but-unconsumed data** (HR zones, equipment), not missing data. Before concluding "the narrative can't say this," check whether the input is captured-but-unread. The honest envelope is wider than it looks. Conversely, do not widen past this spec — the universal rules and the discipline traps are hard boundaries, not suggestions.
