# SUPERSEDED — strength docs, archived 2026-07-25

⛔ **Do not build from anything in this folder.** These describe the strength approach that was replaced.

**The north star is `docs/SPEC-get-stronger.md`** — Strength Focus (Barbell, 4-day), Wendler's 5/3/1 in
its endurance-athlete configuration, with a full citation register. Sequencing lives in
`docs/BUILD-ORDER-strength-spine.md`; code homes in `docs/ARCH-strength-spine.md`; the decisions in
`D-323`.

They were moved, not deleted — history is worth keeping and git has it either way. **They were moved
because a fresh session would have followed them.** Several contained live build instructions.

| file | why it's here |
|---|---|
| `ROADMAP-strength-engine.md` | a competing roadmap for evolving strength — directly contradicts the arch map |
| `RESUME-5x5-cut4.md` | literally instructs "build Cut 4 fresh after /clear" — an order to build a thing being removed |
| `SPEC-q088-freq4-run-path.md` | 12KB spec for the freq-4 U/L/U/L run path — exactly the wiring being consolidated away |
| `SCOPE-strength-primary-shape.md` | "BUILT (Option B), staged, NOT deployed" from June — stale status on a shape that changed |
| `SPEC-getstronger-contract-row.md` | "APPROVED 2026-06-29" — an approval stamp on the old shape |
| `STATE-nonrace-getstrong-2026-06-29.md` | a June state snapshot presented as current |
| `SPEC-amrap-retest.md` | **a spec-lifecycle violation** — marked BUILT 2026-07-01 (D-224) and never deleted. Also now partly wrong: V1 measures on the top set every week, so there is no separate end-of-block retest |
| `SCIENCE-strength-primary-loading.md` | the science doc **for the loading curve V1 replaces** — the ATR arc, the weekly % ramp, the deload timing. Reads as the justification for what is in the code, and it is about to stop being |
| `ROADMAP-hybrid-strength-addons.md` | the Hyrox / glute / pull-up add-on consolidation. **Add-ons are OUT of the Get Stronger flow (D-323).** ⚠️ **Keep this one findable** — it is the reference for **re-homing them to the Adjust tab**, not dead work |

**Second pass, same day.** The first sweep missed these two, plus a third handled differently:

**`SPEC-strength-focus.md` was NOT archived — it has a disambiguation header instead.** Its name now
collides with the product ("Strength Focus" = the front-door barbell plan since 2026-07-25) but its
content is about **accessory specialisation**, and its claim — *a focus redistributes volume rather than
adding it* — is still good, still unbuilt, and is the right reference when add-ons move to Adjust.

**⚠️ Code comments were repointed at this folder, not left dangling.** Archiving `SPEC-q088-freq4-run-path.md`
in the first pass broke three live references (`frequency-policy.ts`, `strength-focus-split.ts`,
`generate-run-plan/types.ts`); `SCIENCE-strength-primary-loading.md` was referenced from
`strength-primary-plan.ts`. All four now point here. **If you archive another doc, grep the code first.**

**Still live, deliberately not moved:** the `SCIENCE-*.md` docs. `SCIENCE-concurrent-training-interference.md`
is actively useful. The others (`SCIENCE-5x5-linear-progression`, `-minimum-dose-maintenance`,
`-neural-speed-running-economy`, `-upper-aesthetics-hypertrophy`) argue for protocols that may not survive
the registry consolidation — they are reference, not instructions, so they are not dangerous in the same
way. Revisit when the registry shrinks.
