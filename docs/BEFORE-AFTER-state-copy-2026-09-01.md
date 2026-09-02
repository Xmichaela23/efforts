# STATE SCREEN — COPY BEFORE/AFTER + PLAN GATES (proposal, 2026-09-01)

⛔ **PROPOSAL — NOTHING WRITTEN TO CODE YET.** Wording for your approval before it lands (your rule:
no new slop through on the way out). On your go I build exactly this. Client-only, no server change.

## CONDITION 1 — session labels with no plan (traced, reporting)

The weekly-lifting rows label from the logged workout's own name via `spelledIntentLabel`. For a plan
session that's "DE: Upper" → "Speed day, upper body". For a **self-logged** session with no plan, the
name is whatever the athlete/app titled it, and `spelledIntentLabel` returns it UNCHANGED (it only
rewrites the ME/DE/Test tokens). `performedWindow` sets the label to `workout.name ?? date`. **So it
degrades to the athlete's own session name, or the date — honest, never "undefined" or a raw token.**
No fix needed; reporting as asked.

## COPY BEFORE → AFTER

### Verdict words (surface on the bike aerobic/power reads now; become the change-line vocabulary next step)
| where | before | after |
|---|---|---|
| holding (VERDICT / RUN_EFF / BIKE_AEROBIC) | "holding" / "Holding steady" | **(no word, no arrow)** — the row shows the number + count and stops |
| sliding (VERDICT generic) | "easing off" | **"down"** |
| sliding (RUN_EFF) | "Slower at the same effort" | **keep** (already honest) |
| sliding (BIKE_AEROBIC) | "Harder at the same power" | **keep** |
| improving (VERDICT generic) | "improving" | **"up"** |
| improving (RUN_EFF / BIKE_AEROBIC) | "Faster at the same effort" / "Easier at the same power" | **keep** (describes the measurement, not praise) |
| recentlyFlat (RUN_EFF) | "Slower, now holding" | **"Slower, then level"** |
| recentlyFlat (generic) | "settled lower" | **"dropped, then level"** |

⚠️ `VOLUME_WORD` ("up/steady/down") — not named in your ruling; leaving it, flag: "steady" is the same
class as "holding" if you want it gone too.

### Bike load read (the TSB inference — ruling: GOES)
| before | after |
|---|---|
| "fitness 18 · form −13 · from every ride — a few more hard rides add the power read" | **"from your rides — a few more hard rides add the power read"** (the CTL/TSB figures removed) |
| "Bike load {trend} · carrying training fatigue" (`LOAD_FRESHNESS_WORDS.working`) | **the freshness/fatigue clause removed** — no "carrying fatigue", no fresh/fatigued word (all TSB-derived) |

### Load plate imperatives (ruling: no imperatives)
| before | after |
|---|---|
| "add a session" / "you have headroom" / "open for more" | **removed** |
| "build more" (LoadBar verdict word) | **plan + sessions missed → the adherence FACT** (see amendment below); **plan + prescribed-light or no plan → nothing** |
| "pull back" / "back off" | **"high"** (state the condition) |
| "a bit high" | **keep** (a condition, not an imperative) |
| "balanced" / "productive" / "Balanced load" / "Building on plan" | **keep** |

### Labels
| before | after |
|---|---|
| "Points" (LoadBar unit) | **"training load"** (full, per your ruling) |
| "The word" (LoadBar) | **"the load read"** |

### Endurance caution (ruling: cut the clause, keep the fact)
| before | after |
|---|---|
| "one session doesn't tell you much — a hot day or a hilly route moves this more than your fitness does. watch the line over a few weeks." | **"one session doesn't tell you much — a hot day or a hilly route moves this more than your fitness does."** (drop "watch the line over a few weeks") |

## THE PROGRAMME-AWARE LOAD BRANCH (amendment) — client, uses `wsv.week_execution_v1.counts`
- Load low **and** a plan exists **and** sessions missed (done < planned) → state the fact:
  **"{done} of {planned} sessions done this week"**. No imperative.
- Load low **and** prescribed-light (week.intent taper/peak/test) OR **no plan** → **say nothing**.
- Over-target branch: today "a bit high"/"pull back" fire regardless of cause. Proposal: high because
  the athlete ADDED work → state "above the planned week" (fact); high because the week prescribes it
  → nothing. ⚠️ This needs planned-vs-done for the over case too — same client counts. Confirm you
  want the over-branch changed now or left at "a bit high" (a condition, already non-imperative).

## PLAN GATES — absent, not empty (each reads `has_active_plan`, its own data)
| block | today with no plan | gate |
|---|---|---|
| coverage "nothing this week for …" (ViadaWeekCard) | **LIES** — invents a gap with nothing prescribing | gate on `has_active_plan`; **fixture pins it silent with no plan** |
| block-context line (week/phase) | already null when `planWeek==null` ✓ | none needed |
| calibration notice | empty `byLift` without a block → absent (verify) | confirm; gate if it renders a shell |
| NEXT (`StateNextBlock`) | shows **"week complete"** chip when empty → **wrong without a plan** | gate the block on `has_active_plan` → absent |
| programme-aware load branch | n/a (new) | plan-dependent by construction |

⛔ Threading: `has_active_plan` passed from StateTab → StatePerformanceSection → ViadaWeekCard, and to StateNextBlock. No block reads another block's rendered presence.

## PRODUCT FINDING — the no-plan customer (runs+rides, months of history, never built a plan)
After the gates, what a plan-less athlete sees: **load + ACWR, body/soreness, readiness, the strength
lift cards with charts, run & bike efficiency/power/drift with charts, swim volume, and what they
lifted this week.** That is a real, worth-opening screen — it is their measured training, which is
exactly this customer's history. **Not thin.** What correctly disappears: planned-vs-actual, coverage,
NEXT, the week/phase line. ⚠️ One honest gap: with no plan there is no "what's next" — the screen is
purely retrospective for them. That is correct (we don't invent a plan), but it's worth Michael
knowing the plan-less screen is a mirror, not a coach. No placeholder proposed — build the seam.

⛔ On your approval I build all of the above and bring the coverage fixture green; nothing commits
until you've seen it run.
