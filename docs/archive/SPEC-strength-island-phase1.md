# SPEC — Strength Island, Phase One (typed-phase foundation + real retest fix)

**Status:** APPROVED — implementing. First, smallest, independently revertible phase of the strength-periodization island ([ISLAND-PROPOSAL.md](ISLAND-PROPOSAL.md) Phase 0+1). **Captured:** 2026-06-28.

## Intent
Stop the run engine deciding terminal behavior by sniffing the string `"Taper"`. Introduce a **periodization authority** that answers "is this a rested terminal?" by *typed phase kind*, and route the live run path's terminal consumers through it. The retest then becomes a real hold-and-rebenchmark week **using the taper logic that already exists** — no rename, no imported placeholder numbers. The architectural intent on record: one periodization authority every modality queries (run / tri / combined / future bike); this phase builds the structure and migrates only the live run terminal.

## Why "retest" is broken today (verified — STRENGTH-SCOUT-REPORT.md)
`applyRetestTail` (`base-generator.ts:436-446`) renames `Taper→Retest` in place, changing only `name`/`focus`. Every terminal consumer keys off the literal `'Taper'`, so on a retest week: speedwork stays ON (`sustainable.ts:183`), volume holds at build level (`sustainable.ts:329` `find('Taper')`→undefined), strength runs full load (`strength-overlay.ts:274/586`). Only the day-count helper (`base-generator.ts:679`) was taught the new name. Combined's retest intensities were never wired (grep `0.77` in generate-run-plan = empty).

## The seed module — `supabase/functions/_shared/periodization/`
Phase one seeds the **classification authority** only (not the load logic — that's Phase 2):
- `PhaseKind` enum: `base | speed | build | race_prep | taper | retest | recovery`
- `canonicalizePhaseName(name): PhaseKind` — maps the run engine's capitalized names AND the combined engine's lowercase enum into one kind. This is why the `applyRetestTail` rename stops mattering — nothing downstream reads the name.
- `isRestedTerminal(kind): boolean` — true for `taper | retest`
- `protocolPhaseName(kind): string` — bridge that hands the shared protocol a `'Taper'` name on a rested terminal (mirrors combined `session-factory.ts:2238`)

## The cut — live `approach='sustainable'` path only (4 edits)
| File:line | Today | Phase one |
|---|---|---|
| `sustainable.ts:183` | `phase.name !== 'Taper'` (speedwork gate) | `!isRestedTerminal(canonicalizePhaseName(phase.name))` → speedwork suppressed in retest |
| `sustainable.ts:329` | `find(p => p.name === 'Taper')` (volume anchor) | `find(p => isRestedTerminal(canonicalizePhaseName(p.name)))` → volume backs off across the retest phase |
| `strength-overlay.ts:274` & `:586` | `phase.name === 'Taper'` (step-down trigger) | `isRestedTerminal(canonicalizePhaseName(phase.name))` → strength step-down fires |
| `strength-overlay.ts` → protocol call | passes `'Retest'` → full build sessions | `protocolPhaseName(kind)` → protocol emits taper-shaped sessions |

`applyRetestTail` is left as-is (the rename is now harmless — nothing reads the name).

## Byte-identical guarantee
- **Tri + combined: untouched** (they don't import the new module) — unaffected by construction. Belt-and-suspenders: spot-run one tri plan + the 486 matrix.
- **Run races:** `'Taper'` → `taper` → `isRestedTerminal` true → identical to `=== 'Taper'`. The only shared-surface risk → verification focus: a race run plan before/after must be identical.

## Tests
- Retest terminal week: (a) no speedwork, (b) strength stepped down, (c) volume at taper level — the test that would have caught the live bug.
- Race terminal still = Taper behavior (regression guard).
- Existing `retest-tail.test.ts` + run-plan suite stay green.

## Deferred (named, not dropped)
- Other run generators (`balanced-build`, `performance-build`, `cumulative-load`, …) — same `'Taper'` gates, but NOT on the non-race path (non-race always uses `sustainable`). Convert when their approach goes non-race.
- Phase 2 (relocate taper logic into the authority), Phase 3 (Q-088 frequency cap), Phase 4 (protocol load curves).
- Combined-plan retest volume-floor leak (`science.ts:608`, scout thread D2) — separate combined bug.
- No combined placeholder numbers imported.

## Revert / stash
Self-contained: new `_shared/periodization/` module + 4 edits in one engine. Revert = delete module + 4 reverts. Stash untouched. To record on commit: a new D-NNN (the authority + the architectural intent; supersedes routing-tension thread T-3).
