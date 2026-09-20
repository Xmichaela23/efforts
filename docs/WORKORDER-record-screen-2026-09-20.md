# WORKORDER — Stage 3: the Record screen (2026-09-20)

One terminal, one stage. Stages 1 and 2 are on `main` and deployed (`athletic-record` is live at version 7,
2026-09-20 09:48 UTC). Read `docs/AUDIT-athletic-record-2026-09-19.md` §3 and §9 for the layout and
`docs/WORKORDER-record-store-2026-09-20.md` for what the server now returns. **No new numbers in this stage.**
If a number the screen needs is not in the payload, say so — do not compute it on the phone.

## Where it lives — Michael, 2026-09-20

Record comes **off the header menu** and becomes a **fourth tab on the State screen**, beside Status, Adjust and
Schedule (`src/components/context/StateHubTabs.tsx`, lens keys in `src/lib/state-lens.ts`).

- Four tabs, not three. The row's own comment pins the accessibility rule that drove its layout: nothing clipped at
  200% zoom (WCAG 2.2 SC 1.4.4) — it wraps rather than truncates. Four labels will not sit in four equal columns on a
  phone at large text, so solve the layout honestly and check it at 200%.
- The icon follows the same rule the existing three follow: not `Activity` (the app's RUN mark), not `Gauge` (the Focus
  screen's plan-builder glyph). Propose one to Michael with the copy.
- The old route and its menu entry come out in the same change. `AthleticRecordPage.tsx` is the page today
  (`/profile/athletic-record`, opened from `MobileHeader.tsx`); leave nothing behind that opens a second copy.

## What the screen shows

§3 of the audit is the layout. In order: Totals · Running bests · Race results · Cycling · Swimming · Strength.
Milestones' placeholder comes off.

- **Totals** — a Run / Ride / Swim switch; activities, distance, **time in hours** (Michael's call — the rows hold
  minutes, the screen prints hours), elevation; three columns: last 4 weeks as a typical week, this year, all time.
  "All time" is labelled from the athlete's first synced date.
- **Running** — top three at each of the fourteen distances, with the date; tap opens that workout. Longest run.
- **Cycling** — best power at each duration, fastest distances, longest ride, biggest climb, FTP best with its date.
- **Swimming** — nothing yet. Swims are parked (the stored lengths carry no start time). Show the section only when it
  has something, or leave it out of this stage.
- **Strength** — the four working numbers and the "Logged suggests" line as today.

⚠️ **The marathon appears twice and must not read as a contradiction.** The race card shows the chip time
(4:43:48 on his 2026-04-19 marathon); the running best shows the fastest 26.2 inside the run (4:41:27). Both are
right. Decide how the screen makes that obvious and put the words to Michael.

## Rules

- The phone prints. It never ranks, sums, converts a unit the server could have converted, or picks a best.
- **Every line of copy goes to Michael in his words before it ships**, including a section heading and an empty state.
- No emojis. No badges, medals or PR flags anywhere — his ruling, and it holds on this screen too.
- `npm run lint:truth` stays green.

## Verification

Run it in the browser preview against his real account and read the numbers back against the audit's §3 layout and
the figures the endpoint returned on 2026-09-20 (run 171 activities / 914.2 mi / 164.0 h all time; ride 101 /
1,701.5 mi / 129.0 h; swim 35 / 20.4 mi / 15.8 h). Check 200% zoom on the tab row and a phone width. Then the three
states, separately: PUSHED / DEPLOYED / VERIFIED ON A DEVICE.
