# SLICE 2 — Strength progress reads the protocol's own gauge (2026-08-12)

**Temporary build contract. Dies on ship → fold into a D-NNN, delete this file.**
Terminal, one stage. Ships behind fixtures (Constitution Law 6). Strength-system change — **ground every rule in the 5/3/1 book, never invent one** (`/Users/michaelambp/Downloads/531_2nd_Edition_Hard_Copy.pdf`).

## The goal, in one line
Strength progress is measured the way the athlete's **protocol** measures it — declared, not hardcoded. 5/3/1 reads the **all-out (AMRAP) top set**; a future RIR/auto-regulated block reads RIR. A week the program made lighter is not a strength loss.

## Why (the fracture)
The strength trend direction (`_shared/state-trend/strength.ts`, `classifyTrend` on the e1RM series, `:227`) reads first-to-last of the logged **e1RM**, and the e1RM series is gated to trusted low-rep sets only (D-417). For a 5/3/1 athlete that leaves **only the fixed working sets** — whose weight the program waves 65→95% by design — so a lighter prescribed week reads as "1 lift trending down." Michael's bench: 120×5 (140) → a new-cycle 105×5 (120) is the wave, not a loss. His actual measurement sets are the all-out sets (20–35 reps), which D-417 correctly excludes from e1RM — so the one thing Wendler measures by is thrown away.

Slice 1 already removed strength from the overload alarm, so this is now a **display-accuracy** fix (the strength trend / "N lifts trending down" / sparkline), not a strain-signal fix. Lower blast radius.

## What the book says (cite these; do not paraphrase into a new rule)
- p9–10: progress **is** rep records on the all-out set — *"if your squat goes from 225x6 to 225x9, you've gotten stronger… if you keep breaking rep records, it'll go up. Don't get stuck trying to increase your one rep max."*
- p26: *"the lifter will keep track of the weight and the reps on the last set."*
- p28: *"always trying to hit more reps on your last set."*
- p66: *"the first all-out set is a strength test."*
- p24 / p99: **deload weeks don't count** — no max reps on deload.
- p32: the `weight × reps × .0333 + weight` estimate is his *"comparing rep maxes"* tool across different weights — secondary, and he says it's imprecise. It is the bridge when the weight progresses cycle-to-cycle (a rep PR at a heavier weight is still a PR); use it ONLY as the cross-weight comparator, never as the primary gauge off the working sets.

## Existing infra — READ before building (do not rebuild)
- **The protocol already declares its gauge:** `_shared/strength-profiles.ts` — `protocolEffortRead(profile)` (`:489`) returns `'rir' | 'amrap' | 'none'`; `strength_primary` (5/3/1) declares `readsEffortAs: 'amrap'` (`:165`). This is the switch. Read it; do not hardcode "AMRAP."
- **The all-out set is already captured:** `strength_facts.amrap_reps` / `.measured` (D-338); the lift snapshot carries `last_all_out` (`weekly.ts:355`); `_shared/strength/all-out-set.ts` builds it.
- **Direction is spine-owned (D-270):** `state-trend/strength.ts` produces per-lift `direction`; `computeStrength` READS it (`weekly.ts:309`), does not re-derive. Change the spine, the coach follows.
- **Trusted-rep gate:** `src/lib/estimate-1rm.ts trustedMaxReps`; `wendler-531.ts trustedMaxRepsFor`. The AMRAP rep-record gauge must NOT be capped by this — it is a rep count, not an e1RM.

## The work
For a lift whose protocol `protocolEffortRead === 'amrap'`, the progress direction reads the **all-out set across cycles**, not the working-set e1RM:
- Gauge = rep record on the all-out set at a given weight (Wendler p10), with the p32 estimate as the cross-weight comparator only when the weight stepped up.
- Deload all-out sets excluded (p24/p99) — the existing `isDeloadWeek` exclusion already exists; keep it.
- For a protocol that declares `'rir'`, behavior is unchanged (its current e1RM/RIR read stands). For `'none'`, unchanged.
- Working-set e1RM stays as a **shown receipt** per session (do not delete it) — it just stops being the progress DIRECTION for a 5/3/1 lift.

## Fixture (Law 6 — permanent regression)
- **Michael's bug case:** a 5/3/1 lift with waved working sets (120×5 then a lighter 105×5) but a **holding-or-rising all-out rep record** → direction is NOT `declining`. Permanent.
- **Real progress:** all-out rep record rises at the same/greater weight → `improving`.
- **Real decline:** all-out rep record genuinely falls cycle-over-cycle → `declining` still fires.
- **RIR protocol untouched:** a `readsEffortAs:'rir'` lift produces the same direction as before this slice (byte-identical fixture).
- Deterministic — no LLM here; if any stochastic path is touched, ≥3 clean recomputes.

## Do NOT touch
- The overload verdict (slice 1, `mintOverloadVerdict`) — strength is already out of it.
- The e1RM formula and the reserve gate (done).
- The goal glance lane (deferred).

## Acceptance
Rebuild Michael's spine + payload; his strength trend no longer shows a lighter week as a decline; the "N lifts trending down" line reflects real all-out-set movement. Device pass. Then fold into a D-NNN and delete this file.
