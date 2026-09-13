# Handoff — 2026-09-12 / 13 (the Performance screen, Today on State's bed, one drift rule, the typed-in log, Indoor)

Read the `docs/ENGINE-STATE.md` banner first, then `docs/SESSION-2026-09-11-12-handoff.md` for the night
before. Memory files carry the rules (never use ours; all copy through Michael; smart server dumb client;
never commit -a; deploy every importer of a changed `_shared` file).

## State at close (2026-09-13)
- **PUSHED:** everything. main = `59e0505`; branch `claude/performance-screen-spacing-1mjlz8` is the same
  commit. Netlify builds main.
- **DEPLOYED** — from Michael's other terminal; this chat has no Supabase token and cannot deploy:
  - `workout-detail`, `compute-core-verdict`, `analyze-cycling-workout` after the drift commits
    (`c5037da` → `35c71d4`). `workout-detail` is the only function importing `session-detail/build.ts`;
    `analyze-cycling-workout` needed it for its own deleted "Cardiac drift" insight; `compute-core-verdict`
    was a harmless extra.
  - `workout-detail` again after `d09c854` / `e695c19` — Michael's screenshot shows "85°F · INDOOR", so the
    fed predicate fired.
  - `compute-workout-summary` after `49a41ec` ("thats done").
  - ⛔ **OWED:** `workout-detail` (`c7e62cd` the week label, `311367f` no weather when indoor, `59e0505`
    `block.line`) and `detach-planned` (`006c600`). Until these land: the tile row prints the old label, an
    indoor header still prints a temperature, and Unattach leaves the old analysis in place.
    `supabase functions deploy workout-detail detach-planned --project-ref yyriamwvtvzlkumqrvpm`
- **iOS:** not synced from this chat. Michael saw every screen below in the app on his phone, so the
  Netlify bundle is what he runs.
- **VERIFIED by Michael on his phone (screenshots in the chat):** the tight Performance header and share
  row; Today's bed, the sun, the status rows inside the header card, swipe between days, the + bottom
  right; the log menu; the manual entry form ("Looks good"); the sectioned Performance panels and the
  0.35 grid; "INDOOR" on the header line; the drift tile agreeing with State.
- **NOT verified:** everything under OWED; the step walk ending where movement ended ("12 of 14"); the
  Unattach recompute.

## What shipped

### The Performance screen (all sports)
| Commit | What the athlete sees |
|---|---|
| `f83821c` | No dead space under the tab bar or in the header (tab panels `mt-0`). |
| `c4457b8` | "Heart rate at easy power" is gone from the ride tab — not on a book page. |
| `baf746a` | Share (and Strava, when auto-share is off) on the date row; Recompute only when the analysis failed, as "Try again". |
| `acb0abe` | A lift's header follows the ride's formula: date row, then the plan line. |
| `b7b19cf` `7e5728e` `ca14899` | Sections like State's cards, readings in State's row grammar, the book's lift words (Maximal effort · Dynamic effort · Hypertrophy · Skill); grid at 0.35. |
| `6b7a15f` | No "No all-out set" line; tighter head on a lift. |
| `d09c854` `e695c19` `311367f` | "Indoor" on the header line; the indoor predicate is fed the two columns it reads; no weather on an indoor session. |
| `49a41ec` `c7e62cd` `59e0505` | The tile label is the plan's own name ("Standard Focus · week 2 of 12"), composed on the server, printed by the run, ride and lift alike. |

### Drift — one rule
| Commit | What the athlete sees |
|---|---|
| `c5037da` | A ride's drift is one number: the power-to-heart-rate ratio State already read. |
| `67c488a` | Drift is read on steady runs and rides only (p107). An interval session prints no drift and no heart-rate line. The cycling analyser's "Cardiac drift" insight and `ride-halves-steady.ts` are deleted. |
| `06a885e` | Today's boom line ("Drift under 5 percent, N rides in a row") reads the same function. |
| `35c71d4` | No HR-drift flag on an interval session. |

### Today / Home
| Commit | What the athlete sees |
|---|---|
| `6859b27` `2d70bd1` `300a117` | One sun above the cards; every card wears State's bed, literally; the wash is gone. |
| `0505f1a` `416eb0f` `8ba73fa` | The status rows sit inside the sticky header card under the weather — shorter, not narrower. |
| `b36779a` | Swipe anywhere on Today to slide between days. |
| `f0f9e22` `33c860e` | The floating + is back, bottom right, pinned above the tab bar, logging to the day on screen. |
| `bd53129` | Upload Course and Log Mobility are hidden from the log menu. |
| `768e5b2` `7597029` `77ce7c7` | One typed-in entry for run, ride and swim — distance, time, date, effort — through `recompute-workout`. |

### Plumbing
| Commit | What changed |
|---|---|
| `49a41ec` | The step walk ends where movement ended: a ride stopped after interval 12 reads 12 of 14, not 14 of 14. |
| `006c600` | Unattach re-runs the summary and analysis, as Attach does. |

## Mistakes worth knowing
- `768e5b2` went to main with a broken build because `(npm run build | tail -1) && git commit` read
  `tail`'s exit code. Repaired in `7597029`. Since then: `npm run build > log; B=$?; test $B -eq 0 && …`.
- A first deploy list was built from a grep that matched comments. The real set came from a transitive
  import graph over `supabase/functions`; only `workout-detail` imports `session-detail/build.ts`.
- The first Today lighting pass left the sun's core straddling the panel clip (a bright bar); it sits at
  `top:-16px` now.

## Open
- Q-302 — one ride prints 59:55 on the header and 60 min elsewhere; two stored duration fields, untraced.
- Q-299 / Q-300 / Q-301 carried.
- `compute-snapshot driftReadForPoint` matches the drift rule's precedence by reading, not by import.
