# SLICE 3b — The e1RM RECORD obeys the trusted-rep ceiling (2026-08-12)

**Temporary build contract. Dies on ship → fold into D-420 (or a short D-NNN), delete this file.**
Terminal, one stage. Ships behind a fixture (Constitution Law 6). Small, precise — applies an EXISTING rule (D-417) to one field.

## The bug (verified on the live screen + code, 2026-08-12)
The strength row's new **"best NNN lb"** record shows the untrusted high-rep e1RM — the exact numbers D-417 killed:

| Lift | "best" shown | should be (trusted) | the untrusted source |
|---|---|---|---|
| Deadlift | **225** | 140 | 105×35 (35-rep set → 225, the D-417 poster child) |
| Squat | 125 | 100 | 80×17 |
| Bench | 170 | 120/150 | high-rep set |
| Overhead | 110 | 95/100 | high-rep set |

Every "best" sits **above its own trusted range** printed beside it (deadlift best 225, range 120–150) — the tell that it's ungated.

## Root cause (one query, one file)
`compute-snapshot/index.ts:862-873` builds `allTimeBestByLift` = `Math.max(estimated_1rm)` over **all** logged sets. The query (`:864-866`) selects only `canonical_name, estimated_1rm` — **no `best_reps`** — so it structurally cannot apply the trusted-rep gate. Contrast the *series* right above it (`:855-856`), which feeds `reps` precisely so D-417 can gate it. The record was left ungated when D-417 gated the series.

The client reads this straight through: `allTimeBestE1rm` → `StatePerformanceSection.tsx:571` renders "best NNN lb".

## The fix
1. Add `best_reps` (and `date` if cheap) to the all-time-best query at `compute-snapshot/index.ts:864`.
2. Before `Math.max`, drop any set that fails the trusted-rep ceiling — **reuse `estimateIsTrusted(canonical, reps)` / `trustedMaxReps` from `src/lib/estimate-1rm.ts`** (deadlift ≤5, everything else ≤8). Do NOT re-derive the ceiling; it is the same rule the series uses (`trustedMaxRepsFor` provenance in `wendler-531.ts`).
3. Nothing else. The high-rep set stays a **rep PR** on the row (`lastAllOut` / `isRepRecord`, already built in slice 2/3) — that is its correct home. Only the e1RM *record* stops reading it.

## Fixture (Law 6 — permanent regression)
- **Michael's deadlift:** all-time-best e1RM record = **140** (best trusted, 120×5), **not 225** (105×35). Permanent — this is the number on his screen right now.
- A high-rep set (e.g. 105×35) **cannot** set the e1RM record, but **does** still fire the rep PR.
- A trusted low-rep set that is a genuine all-time high **does** set the record.
- Assert the record is always ≤ the top of the trusted range (record can't exceed what the gated series can produce).

## Do NOT touch
- The rep-PR path (`lastAllOut`/`isRepRecord`) — the high-rep set belongs there.
- The e1RM series gate (already D-417-correct) and the formula.
- The record's "all-time, not 6-week window" scope (2026-07-21) — that stays; only the rep gate is added.

## Acceptance
Rebuild Michael's spine + payload; deadlift "best" reads **140**, no "best" exceeds its trusted range, the 105×35 set still shows as a rep PR. Device pass. Then fold into D-420 (or a short D-NNN) and delete this file.
