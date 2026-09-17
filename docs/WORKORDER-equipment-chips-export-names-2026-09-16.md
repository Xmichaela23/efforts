# WORK ORDER — equipment list gaps + plan export names (2026-09-16)

From: PM chat. Architect: Michael. One stage per session. Trace first, report, wait for go.
Never commit -a. Add exact files only.

## Read first
- D-424, D-425 (DECISIONS-LOG-2): assistance picker is equipment-gated; gate only on gear that is
  required AND commonly declarable.
- D-430 (DECISIONS-LOG-3): gate runs at build time, band routes ranked last.
- D-455 (DECISIONS-LOG-3): tagged catalogue; three chips earned; "dip bars" and "glute-ham
  developer" were CUT as gear people could not name; ghd sit up and roman chair sit up dropped from
  prescribing (PRESCRIPTION_EXCLUDED, strength-grid/taxonomy.ts).
- SOURCE-viada-hybrid-athlete.md Part A2: p220–223 movement key, p275 rotation note.

## Item 1 — BUG: exported plan prints book names, not the names the athlete sees
- Evidence: Michael's export (Run + Ride + Strength; home gym, no cable, no machines, bands ticked)
  prints "Rear Delt Machine", "Preacher Curl", "Tricep Pushdown". On screen those resolve through
  executionName / bandRouteName (supabase/functions/_shared/strength-grid/grid.ts) to the home
  versions. standing-plan/golden/home-barbell.txt shows the same split: row name vs "shown as".
- Export lives in src/components/AllPlansInterface.tsx.
- Fix: the export uses the same display name the session screen uses. One source, no second name
  map. Smart server, dumb client: if the display name is not already on the row the server sends,
  put it there rather than recomputing in the client.
- Verify: export a home-gym plan and a commercial-gym plan from throwaway accounts; names in the
  file match the phone, row for row.

## Item 2 — Dip station chip (REVERSES part of D-455)
- D-455 cut "dip bars" as un-nameable. Michael owns rack dip clips and cannot tick them.
- Ask: one chip. Unlocks Dips as owned gear, as the triceps accessory it already is.
- It does NOT fill braced push upper. p221 prints "dip machine/pressdown", the braced machine.
  No change to that slot in this item.
- Chip label is athlete-facing copy. Proposed: "Dip bars". Needs Michael's yes before ship.

## Item 3 — Back extension bench chip (REVERSES part of D-455)
- No chip exists for a Roman chair / 45° back extension / GHD. Michael is buying one.
- p221 braced hinge lower prints: reverse hyperextension (machine), GHD back extension,
  ground-based deadlift machine, machine back extension. Today a home athlete can never reach a
  printed movement in that slot; it lands on the face-down bench reverse hyper (secondary hinge, p220).
- Ask: one chip. Unlocks "machine back extension" (and GHD back extension) in the braced hinge
  slot. Roman chair sit-up stays excluded unless Michael says otherwise.
- Proposed label: "Back extension bench". Needs Michael's yes.

## Item 4 — Questions for Michael, NO BUILD
- Braced upper push at home lands on Dumbbell Bench Press, which no page prints. With a dip chip,
  weighted dips are the closer stand-in for p221's dip machine. That would be OURS and needs a
  STATE-SOURCES ledger row.
- Braced lower push at home lands on Goblet Squat, also unprinted. p275 lets the braced
  asymmetrical rotate with the secondary asymmetrical (split squat), already on the same day.

## Verify (all items)
Fixtures green, goldens regenerated with scripts/print-block.ts and the diff read, then throwaway
accounts with real generated plans. Michael is not the QA loop. Report pushed vs client-deployed vs
edge-functions-deployed at close.
