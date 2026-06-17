# SPEC — Honest Swim Inference Boundaries

**Purpose:** Define exactly what the swim narrative/analyzer can honestly infer from the data Efforts actually has — and where inference becomes hallucination. This exists because the swim narrative keeps re-crossing the same lines every few iterations (manufacturing RPE/HR tension, diagnosing the cause of rest, ignoring captured equipment). This doc is the guardrail: any swim-narrative change is checked against it.

**Relates to:** D-177 (RPE×HR coherence), D-179 (work:rest in lead), D-182 (single-sourced scalars), D-183 (zone-anchored HR + fin flag), Q-061 (fin exclusion from trend), D-176/D-180/D-181 (rest-fraction norm + growth reward).

## The core principle

The app sees behavior, not physiology. It compares the athlete to their own intent and their own history — never to absolute numbers it can't anchor, and never to a cause it can't observe. Swim has thin data (no per-length splits from Strava/FORM-summary), so the honest move is to make the most of what's real and stay silent where the data runs out. Silence on what can't be known is what makes the rest credible.

## Data inventory (reliably in hand, single-sourced after D-182)

Distance (authoritative scalar); moving + elapsed time → work:rest; pace/100 (blended, fin-inclusive); avg + max HR; RPE + feel (when popup filled); pool length + lengths (when known); equipment per step (D-162, read since D-183); planned structure/intention/prescribed rest (planned swims); athlete profile — HR zones/threshold if configured/learned, fitness tier, history.

## TIER 1 — Stated facts (no inference)
Distance, duration, pace, HR, lengths. May state but must NOT restate what the card already shows (recitation ≠ insight). Inputs to inference, not insights.

## TIER 2 — Honest single-signal reads
- **Work:rest vs intention:** ✅ "typical for a technique session." ❌ NEVER diagnose the cause (prescribed rest / gear / wall time / recovery are indistinguishable).
- **HR vs the athlete's OWN zones:** ✅ "Zone 2, easy" only WITH a threshold anchor. ❌ Absolute HR means nothing without it. ❌ NEVER let PEAK drive the read — average characterizes; peak is a momentary high. Floor: no threshold on file → stay neutral, never assert "elevated." Swim caveat: swim HR runs ~10-15 bpm below run HR for the same effort; a run threshold is NOT a valid swim anchor — generic/neutral is safer than borrowing it.
- **Pace caveated by equipment:** ✅ "fin-assisted on some sets, reads faster than unaided" (direction only). ❌ NEVER quantify (no per-set splits).

## TIER 3 — Honest convergence reads
- **RPE × HR coherence (done right):** low RPE + avg HR in easy zone → coherent easy; low RPE + avg HR genuinely high for their zones → harder than perceived. Requires the zone anchor.
- **Effort coherence (RPE + HR + work:rest + intention):** did execution match prescribed intent? Compares to intent the app has.

## TIER 4 — Honest trend reads (needs history)
- **Rest fraction shrinking at held pace + held/lower RPE = growth** (the adult-onset signal; D-181 reward; convergence over time, comparison-to-self).
- **Pace trend — ONLY fin-adjusted.** ❌ Raw pace trend is corrupted by equipment. Honest ONLY once finned sessions are flagged/excluded (Q-061). Until then, pace trend must NOT be a fitness claim — that's a current silent lie.

## HARD BOUNDARIES — inference becomes hallucination
The narrative must NEVER: (1) diagnose cause of rest; (2) treat absolute HR as effort; (3) let peak HR define session character; (4) state/quantify unaided pace from a finned swim; (5) assert physiological mechanism (no VO2/lactate/adaptation); (6) claim fitness from one swim; (7) restate the card.

## One-line synthesis
How hard it FELT vs how hard the body WORKED (RPE vs zone-anchored avg HR); how much pool time was SWIMMING vs RESTING (vs the norm for that session type); whether EQUIPMENT is flattering the pace; and over time, comparing the athlete to THEMSELVES, whether they're covering more with less rest at the same effort. Everything beyond that — cause of rest, unaided pace, physiology, single-swim fitness — is unsupported, and the narrative stays silent on it.

## The lesson
Both recurring bugs were captured-but-unconsumed data (HR zones; equipment), not missing data. Before concluding "the data can't support this," check whether it's captured-but-unread. The envelope is wider than it looks — Efforts captures more than its narrative reads. But do not widen past this doc; the hard boundaries are hard.
