# HANDOFF — "Your week": athlete pins always win, informed (Strong Focus)

2026-08-25. Michael's ruling, verbatim intent: **"user choice always wins, it's just informed."**
No inviolable science rules — every rule is relaxable with a warning. No blocks, no punitive copy.
Field grounding: Runna (athlete moves freely, plan adjusts), Athletica (warn + suggest, never
refuse), warn-don't-block validation UX. This supersedes the round-2 behavior where the engine's
placement won and the screen explained ("picked Tue, placed Mon").

## The model

1. **A tap is a pin, and a pin is absolute.** The engine arranges only the unpinned remainder,
   minimizing rule violations. It never moves or refuses a pinned day.
2. **Three feedback tiers, never a block:** silent (clean) · trade-off ("hard run sits 24h before
   the long ride — recovery is thin") · breach ("this breaks the 48h heavy-legs spacing — you can
   keep it"). Flat facts, COPY-VOICE, amber not red. The existing collision/compromise vocabulary
   (placement_compromises, "High fatigue risk: N collisions") is the seed.
3. **Rest day** = "a day you can't train" chip row, same pattern. A pinned rest day stays empty.
   Impossible-feeling combinations get trade-off framing, not an error.

## Slices, in order

**Slice 1 — engine.** `_shared/week-model/`: model.ts legality splits into (a) structurally
impossible (nothing to warn about — a week that cannot be expressed) and (b) science rules, ALL of
which become scoreable violations that a pinned week may carry. resolve.ts solves the unpinned
remainder around pins; output = placed week + tiered violation list. day-map.ts rotation logic
becomes the no-pins default, not the ceiling. ⚠️ week-model runs on the client via @shared — the
wizard preview and the server build move together. ⚠️ _shared deploy trap at ship time: grep every
edge function importing week-model (strength-primary-plan at minimum) and redeploy them all.

**Slice 2 — screen** (NonRaceBuilder.tsx). Taps pin; pinned chip visually distinct from
engine-placed chip; master strip + list re-render from the pinned solve; rest-day row added.
The "One day the week could not honour" banner dies — nothing is unhonoured anymore; its slot
shows the tiered notes instead.

**Slice 2b — club can be the long ride** (Michael, 2026-08-25, after field research). A club ride
is a hybrid: ~2.5–3h weekend club rides are routinely an athlete's long ride; hard 1–2h weekday
clubs are intensity. So club stops being hardcoded to "high intensity day": the long-ride row also
takes a club marking, and the club control's role follows the row it's set on (long vs hard). The
existing wire shape (ownership: "club") stays; what's new is that ownership can attach to the long
slot. If the club ride's typical duration falls short of the plan's long-ride target, that is one
informed note ("your long ride comes up ~50m short of the week's target"), not a block.

**Slice 3 — copy.** Warning lines per tier, sourced from the rule that fired (the eight
"How the week is put together" sentences are the same constants — keep them in agreement).

## Rules

- Ruling captured here; fold into a D-entry at the next consolidated docs pass (keep-docs-light).
- No LLM anywhere in this path. Deterministic solve, static copy.
- Edits free; commit/push/deploy wait for Michael. Slice 1 alone is NOT shippable to prod without
  its screen (Slice 2) — land them together on main.
- Verify slices 1 via deno fixtures over week-model (pins honored, violations named), slice 2 in
  the dev preview end to end. Device check by Michael at the end.
