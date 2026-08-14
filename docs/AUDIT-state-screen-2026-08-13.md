# STATE SCREEN — status refresh (2026-08-13)

One-page update of [`AUDIT-state-screen-2026-08-01.md`](AUDIT-state-screen-2026-08-01.md) (the full
interweave map — still the reference for HOW the cards couple; read it before touching anything
shared). This page is only WHERE EACH CARD STANDS NOW. Same tags: WIRED / STARVED / DEAD /
DELIBERATE.

**Headline: the screen crossed over.** The 08-01 audit's two named jobs both shipped — Job 1 (State
strength rows read `block-identity`; the root wire, see `StatePerformanceSection.tsx:156`) and the
AMRAP rebuild ([D-378]/[D-379]). The last card that could go silent (bike) closed 2026-08-13
([Q-255]). Remaining items are polish, not repair.

**LLM boundary, verified:** exactly ONE element on the screen touches an LLM — the coach narrative
paragraph (collapsed by default, cached, narration only, decides nothing). Every other card is
deterministic server math rendered verbatim.

## Cards, render order

| Card | Status | Note |
|---|---|---|
| Coach paragraph | WIRED | the one LLM element; copy cached behind `COACH_PAYLOAD_VERSION` |
| Strength per-lift | **WIRED** (was PROTOCOL-BLIND) | block-identity plugged in; verdicts read the all-out set ([D-379]); e1RM trust-gated ([D-417]); main-lifts-only ([D-373]) |
| Pull-up progression row | WIRED | [D-426]; clean vs band-assisted counted separately |
| "From your logged sets" | WIRED | 4 barbell lifts; ⚠ [Q-254] note said its baseline read was stale — verify on current StateTab before trusting either way |
| Run efficiency | WIRED | rebuilt [D-346]; hills normalized, heat fitted off his own runs. Gap: excludes the long run (30–70 min gate) |
| Run decoupling | DELIBERATE (silenced) | [Q-232] — a decision, not a patch; do not reflex-fix |
| Swim | WIRED, minimal FOREVER | Michael 2026-08-13: never propose swim features |
| **Bike** | **WIRED — closed 2026-08-13** | [Q-255]: always-on load floor (CTL/TSB verdict words, Friel bands, `state-trend/load-floor.ts`) + CTL chart when load leads; power sparkline only on a REAL power verdict. Residual filed: power-only stress — HR-only rides score zero (future slice) |
| Body (HR response) | WIRED | gap: "as of" stamp shows the OLDEST contributor — fix the stamp, not the data path |
| Body aerobic fitness | DEAD | coach hardcodes null; render gate can never pass |
| Load / ACWR | WIRED, one client smell | load basis decided (D1 volume-load; bands numbered [D-351]); planned-side gap [Q-251] PARKED by Michael; load headline still composed on the client |
| Cross-training (coach's eye) | WIRED | gap: compares a partial week to a whole-week target |
| Race projections | WIRED, deliberately hidden | needs 8 threshold readings; do not "restore" |
| Next / nudges | WIRED | 1RM update stays consent-first on My Record — by design |
| Adjust lens | WIRED, partial | per-block weight override only; official-max update lives on My Record (design question, not a bug) |

## The remaining gap list (= what "State 100%" means now)

1. [Q-253] accessories have no home on State (opened by [D-374]).
2. [Q-254] residuals: trap-bar → deadlift slot roll-up (small); e1RM set-selection is still
   "most reps at heaviest weight", not the AMRAP set (coincides on clean 5/3/1, wrong if a heavy
   single is added).
3. Run efficiency long-run exclusion; Body "as of" stamp; dead aerobic-fitness row; client-composed
   load headline; cross-training partial-week compare.
4. Bike HR-fallback stress (own slice); load floor for run/swim (one line each, when wanted).

## Trap zone — unchanged from 08-01, still binding

Bike power/efficiency split is design; run decoupling is a decision; per-lift "decline" on a light
week is a display-shape decision; "as of" is a stamp fix; consent-first 1RM is deliberate; the run
row was rebuilt 2026-07-31 — do not re-litigate any of them.
