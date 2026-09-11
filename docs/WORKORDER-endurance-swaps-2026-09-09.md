> **SHIPPED 2026-09-10** incl. §7–8; decisions and writes live in the swap-session edge function (9096bff0).

# Work order — Endurance swaps the book blesses, on the session drawer (2026-09-09)

Michael: "we swap strength in the logger; let's add these when appropriate here." The four swaps below
are the ones the page permits. Offer each only when its page condition holds. Nothing else is offered.

Rules: never use ours (memory feedback_never_use_ours_in_copy); every athlete-facing line waits for
Michael's yes; sessions identified by tag, never name; build what is tapped, warn in a note, never block;
docs/COPY-VOICE.md.

## The four, with their page

1. **Same session, different machine** (p275). A ride on a trainer, rower, ski erg or air bike, "as long as
   you know your threshold on it". A run on an elliptical or arc trainer, "impact with the ground on at
   least one day" a week.
2. **Easy work on any sport** (p137). Cross-train the easy volume freely. "When in doubt, use cross-training
   for easy work, not threshold or sprint work."
3. **Hard run for a hard ride** (p138). Only when running volume is capped: "if you're really pushing the
   limits of your tolerable volume". p137 defines our customer as that runner.
4. **The long day** (p275). "A hike, a long ride, a team sport day, or whatever else is of interest."

## What exists

- `src/lib/session-discipline-swap.ts`: `disciplineSwapOptions()` returns run ↔ ride ↔ swim options for an
  easy or hard session, refuses a long one (`if (band === 'long') return []`, ~line 388), refuses when the
  athlete's declared posture for that sport is not `maintain`, refuses completed and skipped rows.
  `intensityOf()` bands a session easy / hard / long by tag and name. `swappedSessionBlock()` renders the
  swapped structure.
- The drawer on Today and the calendar: `TodaysEffort.tsx` ~2284 (`plannedDrawerStep === 'swap'`), the
  "Swap sport" button ~2349. Same drawer everywhere a planned session opens.
- Ingest already stores Strava's `trainer` flag on a completed ride (`ingest-activity/index.ts` ~560) and
  detects pool / indoor swims (~899). Nothing on a PLANNED row says indoor.
- No `hike` type in the plan vocabulary; Garmin hikes ingest as walks.
- The composed row's tags carry `family:`, `band:` (`vt1_or_easier` / `near` / `above`), `sport:`.

## The change

All on the existing Swap step of the drawer. The sheet lists only the swaps whose condition holds; a
session with none shows no Swap button.

1. **Machine.** For any ride: trainer, rower, ski erg, air bike. For any run: treadmill (ground impact still
   counts), elliptical, arc trainer. Picking one changes nothing in the session (same family, same targets,
   same minutes) and stamps `venue:<machine>` on the row's tags. The card and drawer show the machine
   beside the name. The analysis reads the tag: an indoor ride reports no heat and no hills (the ride card's
   drift read already prints heat and "hills mixed in"; a `venue:` row prints neither). Condition on the
   sheet: always for a ride; for a run, when the week still has one run with no `venue:` tag (p275's
   ground-impact day), otherwise the run machines are not offered.
   Threshold: p275 conditions the machine on knowing your threshold on it. The app holds one FTP and one
   run threshold. The sheet states the condition in Michael's words (pending) and offers the swap; it does
   not hold a second FTP. No new number.
2. **Easy session to another sport.** `band:vt1_or_easier` rows: run ↔ ride ↔ swim as today. Unchanged,
   already built. The p137 sentence goes on the sheet as its one line (Michael's words, pending).
3. **Hard run to a hard ride.** `band:near` and `band:above` runs: offer the ride, as today. Condition (p138)
   is "running volume capped", which p137 grants our customer; the sheet says so in one line (Michael's
   words, pending). The reverse, hard ride to hard run, is NOT on the page: remove it from the options if
   the library offers it today (check `disciplineSwapOptions` for ride → run on a hard band).
4. **The long day.** Remove the `band === 'long'` refusal. Offer: long ride (for a long run), long run (for
   a long ride), hike. A hike is a planned row of type `walk` with the long session's minutes (no new type;
   Garmin hikes already ingest as walks). Team sport day: not offered, the app has no type for it and
   cannot read one back.
5. The posture gate (declared posture must be `maintain`) stays as is.
6. Just-today / rest-of-plan: the same two choices the lift swap offers, on every swap here.

## 7. A swapped session is the library's session, not a shell (Michael, 2026-09-09, go)

Today `swappedSessionBlock` renders `Hard ride, no target` / `Easy run, no pace target` with the OLD
session's minutes: a 3-hour ride becomes a 3-hour run. Replace: a sport swap hands over the session the
composer would have built for the new sport in the same band, at the athlete's level, from the book's
library (`session-vocabulary.ts` families: hard run → `ride_anaerobic` p237; easy run → `ride_endurance`
p239; long run → the frame's long ride; long ride → `run_lsd` p235; easy ride → `run_vt1` p235; hard ride →
NOT offered). Steps, targets and minutes come from that library session, never from the old one. The
level is the athlete's own for that sport (their experience answer, as the composer uses it). The
swapped row carries the new `family:`/`band:`/`sport:` tags and the swap note. Machine swaps (trainer,
treadmill) change nothing but the `venue:` tag, as built.

Confirmation lines APPROVED as written (Michael, 2026-09-09): `Moved to the trainer` / `Moved to the
treadmill` / `Swapped to a hike` / suffix `— this and N later`.

## 8. Device findings and copy, 2026-09-09 evening (APPROVED)

- Ride instead line becomes: `The plan's hard ride. For when running is at your limit but you want to
  push.` (p138). Replaces `Allowed when running is at your limit.`
- A swapped session offers its original as the FIRST option on the Instead sheet: the option name is the
  original session's own name (e.g. `Near-threshold Run`), line under it `Back to the plan.` Restores the
  original row, tags and structure. A machine swap offers `Outdoors`, same line `Back to the plan.`
- The drawer's `No description available` placeholder renders nothing.

## Copy (Michael's words, pending)

Facts per line, one line per swap on the sheet:
- Machine: same session, know your threshold on this machine (p275). Run machines: one run a week stays on
  the ground (p275).
- Easy swap: easy work can be any sport; never the hard work (p137).
- Hard run to hard ride: allowed when running volume is at its limit (p138).
- Long day: a long ride or a hike counts as the long day (p275).
- Machine label beside the session name: `Trainer`, `Rower`, `Ski erg`, `Air bike`, `Treadmill`,
  `Elliptical`, `Arc trainer`.

## Out of scope

- A second threshold per machine.
- A new sport's crash-course warning (p135). Separate, later.
- Team sport day.

## Verification

- Unit: `disciplineSwapOptions` returns the long-day options; returns no hard-ride → hard-run; machine
  options gated by the ground-impact rule.
- Throwaway account on the live server with a built Standard plan: swap the long run to a hike and to a
  long ride, swap a hard run to a ride, mark a ride as trainer; read the rows back; log a trainer ride and
  read its card (no heat, no hills line).
- Michael's account untouched.
