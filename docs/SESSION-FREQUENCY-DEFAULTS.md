# Session Frequency Defaults — Prescriptive

How the plan engine determines how many swim, bike, and run sessions per week to schedule. Companion to `docs/SCHEDULING-RULES.md` (placement rules) and the Arc wizard (athlete input).

---

## 0. Core principle

**Hours available drives frequency. Experience drives intensity. Limiter drives sport distribution.**

Session frequency is not a preference — it's a constraint derived from the athlete's available training time. An advanced athlete with 7 hours/week gets the same session count as a beginner with 7 hours. What changes is what happens inside each session: zone targets, interval structure, race-pace work.

The wizard should never ask "how many times per week do you want to bike?" It asks hours, reads limiter and swim intent, and computes frequency. The athlete can override, but the default must be derived.

---

## 1. Inputs

| Input | Source | Already exists |
|---|---|---|
| Weekly hours available | Arc wizard (`weekly_hours_available`) | Yes |
| Limiter sport | Arc wizard (`limiter_sport`: swim / bike / run) | Yes |
| Swim intent | Arc wizard (`swim_intent`: race / focus) | Yes |
| Training intent | Arc wizard (`training_intent`: performance / fitness / longevity) | Yes |
| Event distance | Arc wizard (`event_distance`: sprint / olympic / 70.3 / full) | Yes |
| Recent training history | `workouts` table, last 56 days | Yes (wizard reads 90d) |
| Strength intent | Arc wizard (`strength_intent`: co-equal / supplementary / none) | Yes |

No new wizard questions required. All inputs already exist.

---

## 2. Base frequency table (70.3)

The primary lookup. Hours available is the row. All values are sessions per week.

| Hours/week | Swim | Bike | Run | Total S/B/R | Strength | Rest days | Brick (build+) |
|---|---|---|---|---|---|---|---|
| 5–7 | 2 | 2 | 2 | 6 | 0–1 | 1–2 | 0 |
| 8–10 | 2 | 2 | 3 | 7 | 1 | 1 | 1 in build |
| 10–12 | 2 | 3 | 3 | 8 | 1–2 | 0–1 | 1 in build |
| 12–14 | 3 | 3 | 3 | 9 | 1–2 | 0–1 | 1 in build |
| 14+ | 3 | 3 | 3 | 9 | 2 | 0 | 1 in build, 2 in race-specific |

### Science basis

**Swim:** 2× maintains fitness; 3× produces measurable improvement. Below 12 hours/week, 2× is the sustainable default. Above 12, 3× is appropriate. [coaching-convention]

**Bike:** The longest leg of 70.3 by time (~2.5–3.5 hours). Low injury risk — can absorb frequency. 2× is the minimum for race-readiness. 3× adds quality separation (long + quality + easy). Only justified above 10 hours/week where the third session has enough duration to be productive (~45+ min). [consensus]

**Run:** Highest injury risk. Frequency beats volume for technique and injury prevention. 2× is the floor for 70.3 (one long, one quality/easy). 3× adds an easy run that serves as active recovery and aerobic base. 3× is standard above 8 hours/week. 4× only at 14+ hours and with demonstrated tolerance from training history. [consensus]

**Strength:** Co-equal intent = 2× when hours permit (12+). Supplementary = 1×. None = 0×. Strength sessions are 35–50 min, so they compress well into stacked days. [coaching-convention]

**Brick:** 0 in base phase. 1/week in build and taper. 2/week in race-specific (14+ hours only). A brick replaces a standalone long ride + standalone run with one combined session — it doesn't add a new session. [consensus]

---

## 3. Distance scaling

The base table is for 70.3. Other distances modify as follows:

| Distance | Swim modifier | Bike modifier | Run modifier |
|---|---|---|---|
| Sprint | –0 to –1 swim | –1 bike (quality only, no easy) | +0 (keep minimum 2) |
| Olympic | +0 | +0 | +0 |
| 70.3 | base table | base table | base table |
| Full / Ironman | +0–1 swim | +1 bike (long rides are much longer) | +0 (injury risk caps run at 3) |

Sprint and olympic athletes with <8 hours can train effectively at 1 swim, 2 bikes, 2 runs. Full-distance athletes almost always need 10+ hours and get the higher frequency bands naturally.

---

## 4. Limiter sport shift

When the athlete declares a limiter sport, one session shifts toward it. The session is taken from the lowest-injury-risk sport that currently has a "spare" (non-essential) session.

| Limiter | Add | Remove from |
|---|---|---|
| Swim | +1 swim (if not already at 3) | Easy bike (if 3 bikes) or no change |
| Bike | +1 bike (if not already at 3) | Easy swim (if at 3 swims) or no change |
| Run | Do NOT add a 4th run below 14hr/week | Instead: increase quality-run duration or add strides to easy run |

**Run limiter is handled through intensity, not frequency.** Adding run sessions increases injury risk disproportionately. The engine addresses a run limiter by making existing run sessions more productive (longer long run, higher-quality intervals, strides on easy days) rather than adding a 4th session. [consensus]

Exception: at 14+ hours/week with demonstrated run tolerance (no injuries in last 90 days, 4+ runs/week in recent history), a 4th run is permissible.

---

## 5. Swim intent override

`swim_intent` modifies the swim column independently of limiter:

| Swim intent | Effect |
|---|---|
| `race` (race-adequate) | Use base table swim frequency (2× at <12hr, 3× at 12+) |
| `focus` (wants to improve) | Floor of 3× regardless of hours band. If <12hr, add the 3rd swim by stacking with an easy session (Mon swim + easy bike, or Thu swim + easy run). Do not cut a bike or run to make room. |

---

## 6. Training intent effect (intensity, not frequency)

Training intent does NOT change session count. It changes what's inside each session.

| Intent | Base phase | Build phase | Race-specific phase |
|---|---|---|---|
| `performance` | All Z2, one tempo bike, one tempo run | VO2 intervals, threshold work, race-pace long run | Race-pace brick, VO2 maintenance, specificity |
| `fitness` | All Z2, easy quality sessions | Tempo only (no VO2), moderate brick | Shorter race-pace segments, conservative targets |
| `longevity` | All Z1–Z2, no quality sessions | Z2 with occasional tempo, no VO2 | Z2 long sessions, one tempo per week max |

This is already handled by the builder's session content generation. The frequency table doesn't change.

---

## 7. Strength integration

Strength sessions stack onto existing days (same-day pairing). They do not add new training days.

| Strength intent | Sessions/week | Placement rule |
|---|---|---|
| `co-equal` | 2 (1 upper, 1 lower) at 10+ hr/week; 1 full-body at <10hr | Upper pairs with swim day. Lower pairs with easy day or quality run day (per Override 5.2). |
| `supplementary` | 1 (full-body or alternating upper/lower weekly) | Pairs with easiest day in the week. Never displaces a swim/bike/run. |
| `none` | 0 | — |

At <8 hours/week with co-equal intent, the engine should surface a trade-off: "2× strength at your current hours means cutting a swim or shortening rides. We recommend 1× strength or adding 2 hours to your weekly budget."

---

## 8. Recent training history ceiling

When `workouts` data exists (returning user with Garmin/Strava), frequency defaults are capped by recent actual behavior to prevent overreach.

| Metric | Rule |
|---|---|
| Recent sessions/week by sport | Default ≤ recent average + 1 per sport. Don't jump from 1 bike/week to 3 bikes/week. |
| Recent weekly hours | Default TSS budget ≤ 120% of recent average weekly hours × sport-specific TSS/hr. |
| Longest recent long ride | Week 1 long ride ≤ 110% of longest ride in last 8 weeks. |
| Longest recent long run | Week 1 long run ≤ 110% of longest run in last 8 weeks. |

When no training history exists (new user, no connected devices): use the hours-based table directly. No ceiling applied. The ramp cap (§4.18 in SCHEDULING-RULES.md) prevents excessive week-over-week jumps regardless.

---

## 9. Default weekly shapes (70.3, no group ride anchor)

These are the target weekly layouts for each hours band. The optimizer should produce these shapes by default when no group ride, group run, or other anchor is configured.

### 5–7 hours/week
| Day | Session |
|---|---|
| Mon | Swim (technique) |
| Tue | Quality bike |
| Wed | Rest |
| Thu | Swim (endurance) |
| Fri | Quality run |
| Sat | Long ride |
| Sun | Long run |

6 sessions, 1 rest day. No strength. No easy bike or easy run — hours don't support them.

### 8–10 hours/week
| Day | Session |
|---|---|
| Mon | Swim (technique) + Strength |
| Tue | Quality bike |
| Wed | Easy run |
| Thu | Swim (endurance) |
| Fri | Quality run |
| Sat | Long ride |
| Sun | Long run |

7 sessions + 1 strength. No easy bike. The third run (Wed easy) replaces a rest day.

### 10–12 hours/week
| Day | Session |
|---|---|
| Mon | Swim (technique) + Strength (upper) |
| Tue | Easy bike |
| Wed | Quality bike (or group ride if anchored) |
| Thu | Swim (endurance) + Easy run |
| Fri | Quality run + Strength (lower) |
| Sat | Long ride (or brick in build) |
| Sun | Long run |

8 sessions + 2 strength. Easy bike added on Tuesday as recovery buffer between strength Monday and quality bike Wednesday.

### 12–14 hours/week
| Day | Session |
|---|---|
| Mon | Swim (technique) + Strength (upper) |
| Tue | Easy bike + Easy run |
| Wed | Quality bike (or group ride if anchored) |
| Thu | Swim (threshold) + Strength (lower) |
| Fri | Quality run |
| Sat | Long ride (or brick in build) + Swim (easy, optional 3rd) |
| Sun | Long run |

9 sessions + 2 strength. Third swim possible on Saturday (easy/technique, stacked with long ride day as a morning swim before afternoon ride).

### 14+ hours/week
| Day | Session |
|---|---|
| Mon | Swim (technique) + Strength (upper) |
| Tue | Easy bike + Easy run |
| Wed | Quality bike (or group ride) + Swim (easy) |
| Thu | Swim (threshold) + Strength (lower) |
| Fri | Quality run |
| Sat | Brick (build+) or Long ride |
| Sun | Long run |

9+ sessions + 2 strength. Three swims. Easy sessions distributed for recovery.

---

## 10. Group ride / group run anchor modifications

When the athlete pins a group ride or group run, the base shape adjusts:

**Group ride anchored (e.g. Wednesday):**
- Quality bike moves to the group ride day and inherits group ride label + intensity tag.
- The easy bike from the base shape may be dropped (if hours don't support 3 bikes) or retained as recovery.
- If the group ride is tagged `hammer`, recovery the next day must be easy — the engine accounts for this.

**Group run anchored:**
- Quality run moves to the group run day.
- Same adjustment logic as group ride.

These anchors do not change total session frequency. They change which day hosts the quality session.

---

## 11. Implementation

### Where this lives in code

1. **Arc wizard** (`ArcSetupWizard.tsx`): compute `session_frequency_defaults` from `weekly_hours_available`, `limiter_sport`, `swim_intent`, `strength_intent`. Pass to plan engine via `training_prefs`.

2. **Optimizer** (`week-optimizer.ts`): read `session_frequency_defaults` before placement. Use frequencies to determine how many swim, bike, run, strength slots to create. Current behavior places all session types regardless of hours — that needs to change.

3. **Builder** (`week-builder.ts`): respect optimizer slot count. Do not add sessions the optimizer didn't create.

4. **Reconciler** (`reconcile-athlete-state-week-optimizer.ts`): forward `session_frequency_defaults` to both optimizer and builder.

### What changes from current behavior

Currently the optimizer always places: 2 swims, 1 quality bike, 1 easy bike, 1 quality run, 1 easy run, 1 long ride, 1 long run, 1–2 strength = 9–10 sessions. This is hardcoded regardless of hours.

After this spec: session count is derived from hours. A 7-hour athlete gets 6 sessions. A 12-hour athlete gets 9. The optimizer creates only the slots the hours support.

### Athlete override

The athlete can override any default in the wizard. "I know I only have 8 hours but I want 3 bikes" is valid — the engine surfaces a trade-off ("adding a third bike at 8 hours/week means your long ride will be shorter") but honors the override. The default is computed; the final word is the athlete's.

---

## 12. Research references

- **Swim frequency:** Hatzis (220 Triathlon): 1× = maintenance only; 2× = maintain; 3× = improve. Age-group consensus is 2× minimum for 70.3.
- **Bike frequency:** Natasha Van Der Merwe (Scientific Triathlon EP#685): most athletes tolerate 2–3 quality bike sessions/week. Bike is lowest injury risk, absorbs frequency well.
- **Run frequency:** TrainingPeaks (Balancing S/B/R): "Running is hard on the body — add frequency, not volume." Joe Friel (Triathlete's Training Bible): run limiter addressed through quality, not quantity.
- **Time-constrained athletes:** Humango, 2PEAK, Athletica all derive session count from available hours, not self-reported level.
- **Pro distribution:** Aixsurge analysis: elite triathletes do 12–16 sessions/week (swim 4–6×, bike 3–5×, run 4–6×). Age-groupers scale linearly by available hours.
- **MyProCoach tiered plans:** Beginner 7hr/week (2S, 2B, 3R); Intermediate 8.5hr (2S, 2–3B, 3R); Advanced 10hr (3S, 3B, 3–5R).
- **Matt Fitzgerald (Triathlete 20-week):** 3 swims, 3 rides, 3 runs baseline with brick substitution on alternating weeks.

---

End of document.
