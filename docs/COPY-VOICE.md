# COPY VOICE — the one template every athlete-facing sentence obeys

**Register: a quant who trains, not a coach who encourages.** Fact-first, plain fluent English, no performance. The app OBSERVES and NAMES; it does not instruct, console, or praise. The user drives.

This is the canonical voice spec. The enforcement seam already exists — `_shared/state-trend/week-accent.ts` exports `voiceViolation(sentence)`, a hard check the week-accent composer runs on every candidate (a sentence that trips it is dropped; silence is legal). **The plan is to lift that check into a shared `_shared/copy-voice.ts`, expand its list to the banned idioms/interrogation/jargon below, and route every composer through it** — so bad copy can't ship, not just this batch. Until then this doc is the contract and rewrites are checked against it by hand + test assertions.

*(Supersedes the ad-hoc lists that lived only in `week-accent.ts` and `posture.test.ts`. History: the posture engine shipped copy like "You said 3 a week. You've been doing about 1.6 a week. That's a trade, not a mistake." — second-person accusatory, a decimal rate, a consoling closer. Reset 2026-07-24.)*

---

## The rules

| # | Rule | Not this | This |
|---|---|---|---|
| 1 | **Subject is the metric or the discipline — never "you."** | "You missed 3 sessions" | "Planned sessions fell short by 3" |
| 2 | **No interrogation.** State the fact; never ask about an unseen cause. | "…What happened?" / "Anything going on?" | (drop the question) |
| 3 | **Cause only if observable, phrased "as a result of".** Never name what we can't see (fatigue, sleep, illness, stress, "lost fitness"). | "surgey power delivery" | "uneven as a result of surging" |
| 4 | **Ongoing state = present participle.** | "pace fades" | "pace fading" |
| 5 | **Quantify the gap.** A number, not an absence word. | "didn't happen" / "missed" | "fell short by 3" |
| 6 | **No filler quantifiers.** | "lots of surging" / "a bit high" | "surging" / "high" |
| 7 | **No imperatives.** Replace with the conditional consequence. | "protect recovery" | "…without absorption blunts the next session" |
| 8 | **No consoling closers.** | "not a problem" / "not a mistake" | (drop it) |
| 9 | **No jargon.** Plain words for every metric. | "aerobic base" / "durability" / "cardiac drift" / "efficiency factor" / "VI" / "Z2" | "pace over distance" / "long-run fade" / "heart-rate drift" / "watts per heartbeat" / "easy runs" |
| 10 | **No idioms, no fortune cookies.** | "move the needle" / "sharpen don't strain" / "dig a deeper hole" / "trust the taper" / "empty the tank" | "builds fitness" / "short and sharp, low volume" |

## Grammar of a good line

**[observable fact], [conditional consequence or reversibility].** No opener about the person, no closer that reassures. A number wherever there is one.

- "Running's at about half the 3-a-week plan. Easy pace drifts slower at lower volume, and picks back up when the running does."
- "Power came in uneven as a result of surging."
- "Load is high versus recent weeks — back-to-back hard days without absorption blunt the next quality session."

## Enforcement

- `voiceViolation(sentence)` returns the first offending token/phrase, or `null` if clean.
- Every deterministic composer gates each candidate through it and drops failures.
- Every template with a fixed skeleton is asserted clean in tests.
- LLM prompt files (`ai-summary.ts`, etc.) must not seed banned vocabulary into examples.

When a metric needs a word the athlete would not use, translate it here first; do not ship the jargon and hope.
