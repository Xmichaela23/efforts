# WORK ORDER — Q-252: the Sunday State blackout + the LA-timezone default (2026-08-10)

**Roles:** architect = Michael; PM = this doc; engineer = terminal, one stage per session.
**Anchors:** [Q-252] (OPEN-QUESTIONS), `GAME-PLAN.md:128`, `ENGINE-STATE.md:121`.
Every file:line below was read on 2026-08-10; nothing here is recalled.

## The bug, in one line

`compute-snapshot/index.ts:681` — `if (targetWeek === mondayOfToday())`. `mondayOfToday()` reads the
runtime clock and edge functions run in UTC, so every Sunday at 17:00 Pacific UTC ticks into Monday,
the athlete's current week fails the equality, the whole state-trend build is **skipped**, and
`state_trends_v1` writes `null` — run/ride/swim/strength all vanish from State. Nothing throws,
nothing logs; the `catch` below saying "(non-fatal)" is a red herring (the code never runs). The
`coach_cache` masks it until a coach regen, which then writes `null` over the last good copy.

**Deadline: recurs Sunday 2026-08-16, 17:00 Pacific.** Stage 1 must ship before then.

## What the gate is actually for

The trend build is **now-anchored** — its windows use `todayISO()` / `isoMinus(...)`, not `targetWeek`
(`compute-snapshot/index.ts:~697+`). So the gate is NOT choosing which week's data to read; it only
exists to avoid rebuilding the trend on **historical recomputes**. Confirmed callers:

- **Live:** `compute-facts:2016` invokes with `{ user_id, dry_run }` — **no `week_start`** (defaults to `mondayOfToday()`).
- **Live:** `backfill-strength-load:181` invokes bare — no `week_start`.
- **Historical:** `recompute-workout:180` passes `week_start: mondayOf(workoutDate)` when re-analyzing an old workout.

Readers take the **latest** snapshot, not a specific week (`coach/index.ts:2323` reads max
`week_start ≤ this Monday`), so a historical row is never the one rendered. The only build that
matters is the live one.

---

## STAGE 1 — kill the gate, timezone-free (SUNDAY-CRITICAL)

The rolling read has no business being gated on a calendar week (Michael: *"this section is rolling
too"*). Distinguish live-call vs historical-recompute by the **presence of an explicit past
`week_start`**, not by any clock. No timezone, no calendar Monday, no default.

Replace the equality at `:681` with, in shape:

```ts
// Build the rolling state-trend read on the LIVE call only. A historical recompute
// passes an explicit past week_start (recompute-workout); the live paths pass none.
const isHistoricalRecompute = Boolean(body.week_start) && targetWeek < mondayOfToday();
if (!isHistoricalRecompute) { ... build ... }
```

Note `targetWeek < mondayOfToday()` is a pure string compare on `YYYY-MM-DD` (`mondayOf` returns a
Monday either side of the UTC seam; a genuine past week is unambiguously `<` regardless of the seam,
because a past Monday is never within a day of today). The UTC-Sunday overhang no longer skips the
live call, because the live call has no `week_start` and short-circuits on `!Boolean(body.week_start)`.

**Also (Q-252 step 3): a skipped build must not be silent.** When it skips, log one line naming the
reason (`state_trends_v1 skipped: historical recompute week_start=…`), so nobody loses an hour to the
innocent `catch` again.

**Verify (Stage 1):** deno fixture that pins BOTH outcomes as a permanent regression —
(a) a live call with no `week_start` builds a full contract at any wall-clock, including a simulated
17:00-Pacific/Monday-UTC instant (the exact Sunday-blackout repro); (b) an explicit past `week_start`
skips and logs. Deterministic — no LLM, so no ≥3-recompute rule; one Michael device eyeball on the
next real Sunday (or a forced regen) confirms State stays populated.

**Ship Stage 1 alone.** It fixes the blackout with zero dependence on Stages 2–3.

---

## STAGE 2 — root the timezone (kills the LA default)

`userTz` at `compute-snapshot/index.ts:420` defaults to `'America/Los_Angeles'` and **no server
caller passes `timezone`** — so today *every* athlete's ACWR `asOf` (`:421`, the only consumer) is
computed in Michael's timezone. That is a user-agnostic violation, latent for anyone outside Pacific.
The `body.timezone` field exists but is dead on every server path.

- **Store it, don't default it.** Add `user_baselines.timezone TEXT NULL` (IANA string). Capture it
  client-side — the app already computes `Intl.DateTimeFormat().resolvedOptions().timeZone`
  (`CompletedTab.tsx:756`, `AllPlansInterface.tsx:985`) and carries a `week_boundary.timezone`
  concept — persist it on an authenticated write (copy the existing pattern; do not invent one).
- **Read the stored value** in compute-snapshot; drop the `'America/Los_Angeles'` literal.
- **No-tz fallback = UTC, not LA.** Before the client has reported a tz, use UTC for the `asOf` day
  math — a non-personal neutral, self-correcting on the next authenticated load. (⚠️ architect note:
  UTC chosen because "no defaults to me"; flag if you'd rather refuse the tz-dependent computation
  until known instead.)
- Thread the stored tz through `recompute-workout` / `backfill` invokes too, so headless paths stop
  silently running in UTC-or-LA.

**Verify (Stage 2):** fixture proving the ACWR `asOf` follows a stored non-Pacific tz (e.g. an
athlete in `Europe/London` near local midnight) and that a null tz lands on UTC, never LA.

---

## STAGE 3 — audit the other UTC callers (Q-252 step 4)

`mondayOfToday()` and `todayISO()` (`= new Date().toISOString()`, i.e. UTC) are used as `asOf`
throughout the trend code and elsewhere. Grep every caller and confirm none carries the same
"the server clock is the athlete's clock" assumption now that Stage 2 has a real source. Fix or
file each; a rolling window shifting a few hours is usually harmless (it was the equality gate that
blanked), so this is triage, not a rewrite.

---

## Close-out discipline

- Report **PUSHED / DEPLOYED / VERIFIED** separately at each stage — never "shipped."
- Stage 1 → a `D-NNN` closing the Q-252 blackout; Stage 2 → its own `D-NNN` (the LA default is a
  distinct decision); update `ENGINE-STATE.md:121` and mark Q-252 closed in OPEN-QUESTIONS only when
  all three stages land.
- The `coach-contract.ts` warning about the min-payload-version regen that blanked the good cache
  (Q-252's surfacing note) can come off once Stage 1 is deployed.
