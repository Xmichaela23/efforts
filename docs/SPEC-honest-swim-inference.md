# SPEC — Honest Swim Inference Boundaries

> **Swim addendum + reference implementation under `docs/SPEC-universal-narrative-inference.md`** (the cross-discipline standard — the 7 universal rules every narrative obeys). This doc is the full swim detail; check any swim-narrative change against BOTH.

**Purpose:** Define exactly what the swim narrative/analyzer can honestly infer from the data Efforts actually has — and where inference becomes hallucination. This exists because the swim narrative keeps re-crossing the same lines every few iterations (manufacturing RPE/HR tension, diagnosing the cause of rest, ignoring captured equipment). This doc is the guardrail: any swim-narrative change is checked against it.

**Relates to:** `SPEC-universal-narrative-inference.md` (the cross-discipline standard this is the swim addendum of), D-177 (RPE×HR coherence), D-179 (work:rest in lead), D-182 (single-sourced scalars), D-183 (zone-anchored HR + fin flag), Q-061 (equipment/drill exclusion from trend), D-176/D-180/D-181 (rest-fraction norm + growth reward).

---

## The core principle

**The app sees behavior, not physiology. It compares the athlete to their own intent and their own history — never to absolute numbers it can't anchor, and never to a cause it can't observe.** Swim has thin data (no per-length splits from Strava/FORM-summary), so the honest move is to make the most of what's real and stay silent where the data runs out. Silence on what can't be known is what makes the rest credible.

---

## The data inventory (what's reliably in hand)

Per swim, single-sourced and trustworthy after D-182:

- Distance (scalar, authoritative)
- Moving time + elapsed time → work:rest split
- Pace /100 (blended, scalar-derived — **fin-inclusive**)
- Avg HR + max HR
- RPE + feel (when popup filled)
- Pool length + lengths (when known)
- Equipment per step (D-162 capture; now read by the narrative as of D-183)
- Planned structure — intention, prescribed steps, prescribed rest (planned swims only)
- Athlete profile — HR zones/threshold (if configured/learned), fitness tier, swim history

That is the entire honest universe. Everything below is built only from these.

---

## TIER 1 — Stated facts (no inference)

Distance, duration, pace, HR, lengths. The narrative may state these but **must not restate what the card already shows** (recitation is not insight). These are *inputs* to inference, not insights.

## TIER 2 — Honest single-signal reads (one fact, lightly interpreted)

**Work:rest ratio, read against session intention.**
- ✅ "Rest fraction was typical for a technique/drill session" (against the norm band for that intent).
- ❌ NEVER diagnose the *cause* of the rest ("structured set format," "you were managing fatigue"). The gap is prescribed rest + gear changes + wall time + recovery, indistinguishable. State the ratio; never explain why.

**HR against the athlete's OWN zones.**
- ✅ "Average HR in Zone 2 — easy aerobic" **only when a threshold/zones anchor exists.**
- ❌ Absolute HR means nothing without the anchor. 119 is "easy" only relative to this athlete's threshold.
- ❌ NEVER let the PEAK drive the read. Peaks are noise (one hard length, a fin change, a sensor spike). The **average** characterizes the session; the peak is a momentary high that does not define it.
- **Honesty floor:** no threshold/zones on file → stay neutral. Never assert "elevated" or "working harder than perceived" without the anchor.
- **Swim-specific caveat:** swim HR runs ~10–15 bpm lower than run HR for the same effort (horizontal position, cooler water, smaller muscle mass). A *run* threshold is not a valid swim anchor; a generic/neutral default is safer than borrowing the run number. Do not infer a swim threshold that hasn't been measured.

**Pace, caveated by equipment — DIRECTIONAL, not fins-only.**
Equipment distorts pace in *different directions* depending on what it is. The narrative reads the *direction* of distortion from what was actually used (the app captures equipment per step, D-162) — never quantified.

- **Speeds pace UP (reads optimistic):** fins (large effect), pull buoy (less drag), paddles (more power per stroke). A set with these reads *faster* than unaided.
- **Slows pace DOWN (reads pessimistic):** kickboard / kick sets (arms out — dramatically slower, NOT a swim-pace-comparable number at all), most drills (catch-up, single-arm — deliberately inefficient to groove a mechanic).
- **Roughly neutral:** snorkel (mainly a technique tool; minor drag at most).

- ✅ "This pace reflects fin/buoy/paddle-assisted sets, so it reads faster than your unaided swimming" (direction only). OR "this session included kick/drill sets, so the blended pace reads slower than your swimming pace."
- ❌ NEVER quantify the effect ("fins added 8 s/100") — no per-set splits exist to support it.
- **Mixed-equipment sessions:** a session with BOTH a fast set (fins) and a slow set (kick) has its blended pace pulled both ways — the blend is NOT a clean fitness-comparable number in *either* direction. Say so; don't pretend the blended pace means fitness.
- The app KNOWS which equipment was on which set (D-162). Flag the *direction* honestly; quantifying is not supported.

## TIER 3 — Honest convergence reads (multiple signals agreeing)

Convergence is defensible where single signals are not.

**RPE × HR coherence (done right).**
- Low RPE + average HR in the easy zone → coherent easy day. ✅
- Low RPE + average HR genuinely high *for this athlete's zones* → a harder day than perceived. ✅ (the honest version)
- Requires the zone anchor to mean anything. Without it → neutral, no coherence claim.

**Effort coherence across RPE + HR + work:rest + intention.**
- Did perceived effort, physiological effort, and rest pattern line up with what the session was *meant* to be? Compares execution to *prescribed intent* (which the app has). ✅
- e.g. a threshold day that reads easy on all three → may not have hit intensity. A technique day that reads easy → executed as intended.

## TIER 4 — Honest trend reads (across comparable swims, needs history)

**Rest fraction shrinking at held pace + held/lower RPE = growth.**
- The adult-onset progress signal ("wall to wall, a tad more each time" — research-backed). Honest because it's convergence over time, comparison-to-self, and the one fitness signal that survives having no splits. (D-181 growth reward — fire on the convergence, conservatively, comparable sessions only.)

**Pace trend — ONLY equipment/drill-adjusted.**
- ❌ Raw pace trend is corrupted by equipment AND drill work. A "faster" trend may just be "more fin/buoy/paddle days"; a "slower" trend may just be "more kick/drill days." Both directions of contamination corrupt the trend.
- Pace trend is honest ONLY once non-unaided-swimming sets (any equipment, any drill) are flagged/excluded from the substrate (Q-061). **Until Q-061 is built, pace trend must NOT be presented as a fitness claim — that is a current silent lie.**
- Q-061 is broader than "fins": it's "sets that aren't unaided full-stroke swimming shouldn't masquerade as fitness pace" — fins/buoy/paddles (fast contamination) and kick/drill (slow contamination) both.

---

## HARD BOUNDARIES — where inference becomes hallucination

The narrative must NEVER:

1. **Diagnose the cause of rest.** Can't separate prescribed rest / gear changes / wall time / fatigue. State the ratio, never the why. *(Was botched as "structured set format.")*
2. **Treat absolute HR as effort.** Meaningless without the athlete's zones. *(Was botched as "119 = working hard.")*
3. **Let peak HR define session character.** Peaks are noise; the average drives the read. *(Was botched as "152 peak = more taxing than it appears.")*
4. **State or quantify unaided pace from an equipment/drill swim.** Can flag the blended number as optimistic (fins/buoy/paddles) or pessimistic (kick/drill) by direction; cannot compute the unaided number.
5. **Assert physiological mechanism.** No "VO2 improved," "lactate," "cardiovascular adaptation." Behavior, not physiology.
6. **Claim fitness from one swim.** A single session is noise; fitness claims require the trend.
7. **Restate the card.** Recitation of on-card numbers is not insight.

---

## The one-line synthesis (what Efforts can honestly tell a swimmer)

> How hard the session **felt** vs. how hard the body **worked** (RPE vs. zone-anchored average HR); how much pool time was **swimming vs. resting** (against the norm for that session type); whether **equipment is flattering** the pace; and — over time, comparing the athlete to **themselves** — whether they're covering **more with less rest at the same effort.**

Everything beyond that — cause of rest, unaided pace, physiology, single-swim fitness — is inference the data cannot support, and the narrative stays silent on it.

---

## The two inputs that were captured-but-ignored (and the lesson)

Both bugs that recurred were **available data the narrative wasn't reading**, not missing data:

- **HR zones** — present in `user_baselines` (or learnable), but the narrative read HR in the absolute until D-183.
- **Equipment** — captured by the D-162 popup into `swim_steps_equipment_confirmed`, but had *zero readers* until D-183.

**Lesson for future swim work:** before concluding "the data can't support this," check whether the data is captured-but-unconsumed. The honest envelope is wider than it looks because Efforts captures more than its narrative currently reads. Conversely, do not widen the envelope past this doc — the hard boundaries are hard.
