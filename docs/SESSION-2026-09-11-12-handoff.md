# Handoff — 2026-09-11 afternoon / 2026-09-12 (PM chat; no engineer terminal)

Read the `docs/ENGINE-STATE.md` banner first, then `docs/SESSION-2026-09-11-handoff.md` for the morning of
the 11th. Memory files carry the rules (never use ours; all copy through Michael; smart server dumb client;
never commit -a; deploy every importer of a changed `_shared` file).

## State at close (2026-09-12, ~01:00 PT)
- **PUSHED:** everything. main = `10192932`.
- **DEPLOYED** (`supabase functions list`, UTC):
  - 03:08:54 — coach 589, materialize-plan 387, generate-strength-plan 259, rematerialize-standing-block 137,
    endurance-checkpoint 38, compute-session-boom 10 (the `d1fca55b` closure).
  - 03:39:58 — plan-overview 3 (`d28c9907`).
  - 02:49:05 — create-goal-and-materialize-plan 414, swap-session 11. 02:02:04 — get-week 215.
  - `10192932` is client-only; no function needed redeploying.
- **iOS SYNCED** after the last push. The Xcode build is Michael's.
- **VERIFIED:** nothing on a physical device. The visual work was checked in a phone-sized preview
  (375×812) against a real logged-in account, across a ride day, a two-session lift day and a past day
  carrying completed sessions. Everything before that was throwaway accounts and test suites.

## What shipped

### The book's own hard sessions, and the caps (the seven pending decisions closed)
| Commit | What the athlete sees |
|---|---|
| `2074876d` | The three test rows read as the page prints them: the 48-hour rest clause and the citations are off. |
| `e6796bfb` | Every hard workout is the page's own shape at its level (`printedIntervalsByLevel`, `repSecondsByLevel`). Easy ride caps at 2 h, long ride at 3 h 30. |
| `00e7e40d` | A round that ends the way it starts reads as one round, not two and a stub. |

### The endurance step
| Commit | What the athlete sees |
|---|---|
| `f89dcd4e` | Sport is chosen on the face of the row; an unanswered row says "Ride or Run". |
| `cbfe801f` | The long row's length picker sits on the face, like the easy row's. |
| `606c5213` | A rotating hard row states its range ("36–48 min") instead of "length varies week to week". |
| `cd908df7` | The hard row's line sits on the face of the row. |
| `5081ec2a` | The preamble is Michael's two lines. The club sentence is cut until clubs are built. |

### Build focus — the accessory rows
| Commit | What the athlete sees |
|---|---|
| `f14d96b1` | Home-kit accessory rows are the page's like-for-like. ME rows offer p220's secondaries as a **swap in the logger**, not as the default. |
| `b0c874c3` `3aec68f2` | Rows grouped by lifting day; every HYP row on Standard Focus has a picker; arms supersets named; day-4 pair differs from day 1. |
| `fb289c02` | The home leg curl is named for its execution: "Dumbbell Leg Curl". |
| `f15a07cc` | A day names the rows it carries from another day, and names the movements the plan actually built. |
| `214ebe56` | The leg-press row opens on the front squat; its list is three two-leg squats then the single-leg fallbacks. |
| `d1fca55b` | The triceps pushdown was missing from every push row on every kit (the page prints "triceps pushdowns", the catalogue key is `tricep pushdown`, and `canonicalize` keeps them apart). The machine-press row listed the incline dumbbell press twice. |

### The plan's own layout stops being reported as a conflict
| Commit | What the athlete sees |
|---|---|
| `d1fca55b` | p274 prints the anaerobic ride on the heavy hinge day, and the builder was warning about it on every week of every golden. A same-day hard-with-heavy-legs pairing **the frame column itself prints** is now silent. A pairing the athlete's own pins create still speaks. |

### Where a build lands, and what Today says before it opens
| Commit | What the athlete sees |
|---|---|
| `d28c9907` | A finished build lands on **Today**, not the weekly planner. plan-overview sends `starts_on` and `has_started` per plan. |
| `d0317d6f` | Until week one opens, Today prints "Your plan starts <weekday, month day>." in the slot where the session would be. |

### Today's spacing line
| Commit | What the athlete sees |
|---|---|
| `1fce77b4` | "Lift first and keep the run easy" only where the endurance session is VT1 — p144 rule 5 names VT1 endurance as the work that tolerates pre-fatigue, and the line was appearing over a run the plan had just prescribed hard. A lift with no skill and no speed sets beside a non-VT1 session now draws no chevron at all. |

### Home, lit
| Commit | What the athlete sees |
|---|---|
| `10192932` | One lit screen. See D-473. |

## Approved copy this stretch (Michael's yes)
- "Your plan starts <weekday, month day>."
- "Plus the <movements> superset from day <n>." — naming the movements the plan built, not the page's row names.
- "Lift first." / "Lift first. Riding first costs the lift its skill and speed sets."
- The endurance step's two-line preamble: "Hard sessions are set length." / "Easy sessions you set based on
  your current volume."
- "These are your hypertrophy lifts and super sets based on the equipment you have. You can swap on the day
  or adjust now for the plan."

## Unverified — what would settle it
1. **Nothing has been seen on the phone.** Michael rebuilds his plan and walks it. Check: the two-line date
   header; Today's cards; the plan-start line on a plan built for a future Monday; the pushdown appearing on
   the arms rows of a bands kit; a hard day drawing no chevron under the spacing line.
2. **The swipe-deck card** (`CardDeck.tsx:302`) carries the shared bed and cannot render without one, but it
   was never put on screen. Q-300.
3. **An orange-rimmed row on a past day** — see Q-299. Every border in the card path is gone and it persists.
4. Carried from before: a rebuild resets a workout chosen on the day; heavy-set good-news line ordering;
   multi-swim day compares the wrong planned swim; `generate-combined-plan/week-builder.ts decideOrdering`
   is a second copy of day order.
