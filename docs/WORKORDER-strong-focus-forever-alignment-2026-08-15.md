# WORKORDER — Strong Focus: align to 5/3/1 Forever · 2026-08-15

**Decided by Michael 2026-08-15, this chat.** Follow Wendler's Forever structure. The 12-week
container, the four lifts, days per week, and endurance placement are UNTOUCHED. What changes is
the internal shape: 3-week cycles, standalone light weeks, the check moved to rested weeks,
supplemental in the leaders, and assistance/jumps scaling flipped to his direction.

**Sources.** Two primaries, both verified this week:
- *5/3/1, 2nd edition* — PDF at `~/Downloads/531_2nd_Edition_Hard_Copy.pdf` (Michael's licensed
  copy — cite it, never commit it).
- *5/3/1 Forever* — Michael's physical copy. Page photos of pp.16–45 were read in the 2026-08-15
  session. Page numbers below are from those photos. ⚠️ Only pp.16–45 have been read — anything
  attributed to other pages of Forever is still secondary and must be marked so.

**Terminology for this doc:** "leader" = easier building month; "anchor" = hard month;
"7th-week" = his standalone light week (deload / TM-test variants); "supplemental" = second
barbell block on the same lift after the main work; "assistance" = the push/pull/single-leg-core
rep totals; "TM" = the working number (our `training_max`).

---

## 0. The target 12-week map

| weeks | phase | main-lift scheme | supplemental | assistance / jumps |
|---|---|---|---|---|
| 1 | **TM-test week** | 70/80/90%×5, then TM × 3–5 (goal: 5) | none | 25–50 per slot / 10 jumps |
| 2–4 | Leader 1 | 5s PRO (65/75/85 · 70/80/90 · 75/85/95, all ×5, no AMRAP) | FSL 5×5 | 25–50 per slot / ~10 jumps |
| 5–7 | Leader 2 | same, TM +5/+10 | FSL 5×5 | 25–50 per slot / ~10 jumps |
| 8 | **7th-week deload** | 70%×5, 80%×3–5, 90%×1, TM×1 | none | 25–50 per slot, lighter movements |
| 9–11 | Anchor | standard 5/3/1, top set AMRAP (5+/3+/1+) | none (V1) | 50–100 per slot / 15–20 jumps |
| 12 | **TM-test week** | 70/80/90%×5, then TM × 3–5 | none | 25–50 per slot |

Citations: leader/anchor definitions and scaling direction, Forever p.18. 7th-week deload sets
and "always used between your Leader and Anchor template," p.21. TM-test sets and the 3-reps-at-90% /
5-reps-at-85% pass bar, p.20–21. "Prior to any Leader template, I recommend you perform a training
max test week," p.21 (bold in the book). Assistance 50–100 base / 25–50 on 7th-weeks, p.24 + p.23.
2-leaders/1-anchor as his recommendation "for just about every lifter," p.17. FSL-as-leader-
supplemental, p.40 + p.45 (BBB flagged "not a good option for athletes," p.45).

3 + 3 + 1 + 3 + 1 + the opening test week = **12 exactly.** 16-week blocks: add one anchor cycle
(2L/2A, his p.17 second model) → 3+3+1+3+3+1 + opening test = 15, one spare week = a second
deload after the first anchor, or extend by his "may choose to use it after any cycle" license
(p.21). 8-week: test + L + deload + A + test = 9 — over budget, so 8 drops the opening test week
(entry gate 1RM stands in for it, stated in copy). Implement the 12 first; 8/16 follow the same
pieces.

## 1. The changes, in build order

### 1a. Flip the leader/anchor scaling of assistance + jumps (bug fix, do first)
`src/lib/assistance-menu.ts` — `assistanceTotalReps` currently holds anchors at the floor and
lets leaders climb ("volume comes down when the bar goes up"). **Backwards per Forever p.18:**
leaders = less assistance, anchors = more. New numbers, his:
- Leader weeks: 25–50 total reps per slot (base at 25–35, capacity evidence can raise toward 50).
- Anchor weeks: 50–100 per slot (base 50, capacity scaling raises toward 75 as today; 100 is his
  ceiling, we stay ≤75 for the concurrent athlete and say so in a comment — T3, ours).
- 7th-weeks: 25–50, and prefer less intensive movements (p.23 — e.g. the copy suggests swapping
  dips → pushdowns).
Jumps/throws (`strength-primary-plan.ts`, the 10–15 constant): leaders ~10, anchors 15–20,
7th-weeks ~10. p.18 ("less jumps and throws" / "more jumps and throws") + p.22 tables (10 total).

### 1b. Floor the leader count at 1 (bug fix)
`loading/wendler-531.ts` — `leaderCount` `continuous` branch returns 0 → an all-anchor block.
His three models (p.17) are 3/2, 2/2, 2/1; zero leaders is not one of them. `continuous` → 1
leader minimum. Tiers otherwise stay (they choose *among* his shapes, which is our call and
documented as such).

### 1c. Restructure the block: 3-week cycles + standalone weeks
This is the core change. `WEEKS_PER_CYCLE` 4 → 3 and the deload row leaves `PCT_BY_WEEK` /
`ANCHOR_REPS` (weeks 1–3 keep their current percentages — identical to his). Add two standalone
week shapes to the composer:
- **`tm_test`**: 70%×5, 80%×5, 90%×5, TM × 3–5 (AMRAP capped at 5 in copy: "5 strong reps, then
  rack it" — p.20 "you can stop the set" / never a true 5RM).
- **`deload_single`**: 70%×5, 80%×3, 90%×1, TM×1. No supplemental, no AMRAP.
Block layout comes from a new week-map builder (per §0) instead of `cyclesForBlock` alone.
`warmupSetsForWeek`'s deload carve-out: the old reasoning ("deload sets ARE the ramp") still
holds for both new week shapes — they ramp from 70%, so no separate warm-up ramp. Verify the
tests that pin 12-week = 3×4-week shapes and rewrite them to pin the new map.

### 1d. Move the verdict to the rested weeks
`verdictFrom95Set` and its callers. The measured event becomes the TM-test week's top set (and
the deload single as a pass/fail-only signal):
- TM test, ≥5 reps at TM → **advance** (+5/+10 into the next cycle/block).
- 3–4 reps → **hold** at current TM (his 3-rep bar is for 90% TMs; ours is 85%, so 5 is the pass —
  p.20–21). Copy explains the difference plainly.
- ≤2 reps → **miss**; recompute TM as 85% of e1RM off that set (p.21: "use the formula… and
  adjust your training max to be 85-90% of that"). This REPLACES the −10% stall drop for
  test-week misses; the two-consecutive-miss stall counter (`STALL_CONFIRM_SESSIONS`) stays for
  in-cycle prescription failures, which are now the anchor's AMRAP prescribed-rep misses only.
- Skipped test week → **hold** (no evidence; unchanged principle).
Week-12's verdict is the block-to-block transition gate (SPEC §1b) — this closes that debt.
The anchor AMRAPs stay measured for e1RM/records exactly as today (trust ceilings unchanged);
they no longer gate the TM.

### 1e. Add FSL supplemental to leader weeks
New rows in the composer between main lift and assistance, leader weeks only:
**same lift, 5×5 @ that week's first-set percentage** (65/70/75% by week). Uses the lift's own
TM — no new maxes, no new equipment. `set_plan` rows carry `load_prescribed: true`, normal
weight math, tagged so the logger groups them under the main lift. Session copy names it
("First Set Last — 5×5 @ 65%"). Workload: count as prescribed load (it is). ⚠️ Session length:
leaders gain ~10–12 min; say it in the plan description once, flat. Fatigue ripple: leader
lower days carry ~25 extra squat/deadlift reps at 65–75% — the Robineau 6h gap rule and the
existing scheduling law are unchanged and already cover it. If an athlete-facing dial is wanted
later, his own fallback is cutting 5×5 → 3×5 (p.44 offers volume adjustments); not in V1.

### 1f. Small pieces
- **3-day pairing**: deadlift + press share a day (his p.22 3-day table); squat and bench get
  their own days. Replaces our bench+press pairing. The pair-ordering logic survives (heavier
  first within the shared day → deadlift first).
- **Capacity standards**: `assistanceTotalReps` gains push + core scaling off
  `performance_numbers` when present, using his 10-minute standards as the reference points
  (push-ups 100, dips 75, chins 50, hanging leg raise 50 — p.33). Pull-up scaling unchanged.
  No new wizard questions; absent numbers → floor, copy says which (existing pattern).
- **Epley vs Brzycki**: record only. One line in DECISIONS-LOG: he uses Epley (`w×r×.0333+w`),
  `compute-facts` uses Brzycki; Brzycki reads slightly low, which is the conservative direction;
  not changing it because it feeds surfaces beyond this block.

## 2. Out of scope (do not drift)
- Boring But Big anywhere (p.45: "not a good option for athletes").
- Olympic lifts, Krypteia, or any other Forever template.
- Any change to endurance placement, the 6h gap, or scheduling law — untouched.
- The triathlon strength path (`STRENGTH-PROTOCOL.md`, Friel) — no Wendler there.
- Changing Brzycki → Epley in `compute-facts`.
- The beginner plan (separate, future — Beginner Prep School pp.38–44 is its likely source
  when it happens; noted, not built).

## 3. Ripple map (walk before shipping)
- `generate-strength-plan/index.ts` — verdict allowlist must accept whatever new verdict values
  1d introduces (it silently discards unlisted values — see the warning in `wendler-531.ts`).
- `rematerialize-strength-block` — must understand the new week map and standalone weeks.
- Forecast vs regeneration: `unknownMeans: 'advance'` stays forecast-only; TM-test weeks give
  regeneration real verdicts sooner (week 1 instead of week 3).
- Logger: FSL rows and TM-test AMRAP rows need correct set grouping + the AMRAP badge on the
  test-week top set; check `all-out-set.ts` picks the right set (it keys off `amrap`).
- Conformance/pin tests under `strength-system/` that assert 4-week cycles, week-3 95% sets,
  deload-in-week-4, and assistance totals all need rewriting to the new map — expect most of the
  work to be test surgery.
- Copy: plan description (85% TM rationale, FSL line, session length), week titles ("TM Test",
  "Deload"), COPY-VOICE rules apply (no imperatives, conditional consequences).
- `docs/SPEC-get-stronger.md` — after ship: fold into a D-NNN, mark §1b's transition debt paid,
  delete per spec lifecycle. Back-annotate D-385/D-387 (assistance direction now cycle-scaled;
  test week restored in a different, rested form — not the 4-day week-3 split D-387 deleted).

## 4. Verification
Deno fixtures, not prod (standing rule): pin the full 12-week map for one athlete (all four
lifts), assert week shapes, FSL presence in leaders only, assistance totals per phase, verdict
transitions (5 reps → advance; 4 → hold; 1 → recompute-from-e1RM; skip → hold), and the 16-week
map. Keep the old frozen-block fixture as a regression. One Michael acceptance pass on device at
the end: build a Strong Focus block, eyeball weeks 1, 4 (leader), 8, 9 (anchor), 12.
