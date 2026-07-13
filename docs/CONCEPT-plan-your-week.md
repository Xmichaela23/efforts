# CONCEPT — "Plan Your Week" (scope only, NOT a build)

Status: **scoping doc, uncommitted.** No code written. Read-only assessment of size + forks so Michael can make the calls. 2026-06-30.

## The shift
Replace the abstract intake questions ("when's your long run?", preferred-day pickers) with a concrete 7-day board. The plan generates its sessions; the athlete DRAGS them onto the days that fit their life, and the science acts as rails that keep any arrangement legal. Verb: "arrange your week," not "answer questions about it."

---

## Honest sizing: **LARGE** (not a Frame-code lift)

The framing assumed Frame gives us the interaction bones. **It largely doesn't — verified by reading `~/Scheduler/src`:**

| Assumed | Actual (Frame source) |
|---|---|
| "drag-to-move blocks" | **No drag anywhere** — zero `onPointer*` / `onTouch*` / `draggable` handlers; no dnd library in `package.json`. |
| weekly board | **Time-of-day within a single day** (hardcoded routine, `6:00–7:00 Morning Pages`…). Different axis: Frame moves a block's *time*, we need to move a session's *day*. |
| move interaction | **Tap a block → `BlockEditor` modal**; conflicts against imported Apple Calendar events → `ConflictModal` → tap "reshuffle" → applies a suggested time via `dateOverrides` (localStorage). |

**What genuinely transfers (a pattern, ~150 lines of ideas, not a drop-in):**
- The **glass-box conflict → suggestion → resolve** loop (`ConflictModal` + `handleReshuffle`) — directly analogous to our science-gate warn-and-suggest.
- The **override/edit persistence model** (`structuredClone(edits)` + `dateOverrides` keyed by `date-blockId`) — a clean shape for "user moved this session off its default day."
- Capacitor 7 / React / Vite parity with Efforts (Frame is React 19 / Vite 8 / Cap 7 — Efforts is a touch behind but same family).

**What's ground-up:**
- The **drag engine** — pointer events + hit-testing 7 day-columns + thumb ergonomics. Neither repo has a dnd lib or drag code; this is new (hand-rolled pointer capture, or adopt `@dnd-kit` — first real drag dependency).
- The **board surface** (7-day layout, session cards, drop targets, phone-first + desktop-readable variants).
- The **client-side rail subset** (see fork 2) and the **validated day-move write path** (see fork 1).

**Size:** a rough, honest v1 (reschedule-only + a ported subset of same-day rules + optimistic client gate) is **M/L**. The full authoritative version (both-sides validation, replaces intake, desktop parity, reshape) is **L/XL**. This is a multi-rock surface, not a week.

---

## The science rails already exist — but server-side, in Deno
The constraints that become the drag rules are real and locked, in `supabase/functions/_shared/`:
- `schedule-session-constraints.ts` (405 lines) — the **same-day compatibility matrix** (`areSameDayCompatible`), `SESSION_FATIGUE`, `SESSION_PRIME_MOVER` (leg/upper), leg-loaded-at-intensity.
- `week-optimizer.ts` (2264 lines) — the **sole placement authority**: `sequentialOk` (adjacent-day rules), `canPlaceWithModifier`, `deriveOptimalWeek`.

These run in edge functions (service-role, authoritative). The **client has none of them.** That's the crux of fork 2.

---

## The forks (my recommendations, your call)

**1. Reschedule-within-week vs reshape-the-plan?**
→ **Reschedule-only for v1.** Moving a session to another day changes only its day assignment — the sessions, loads, and phase stay identical, so **no re-materialization**. The calendar is dated `planned_workouts` (via `get-week`); a "move" re-dates one row, validated against the rails. Reshape (change which sessions exist / the phase curve) is a categorically bigger thing — defer. *This keeps v1 tractable.*

**2. Rails on client, server, or both?**
→ **Both — optimistic client + authoritative server.** Port only the **~4 rules that matter for a day-move** to a shared TS module the client can run for instant thumb feedback: (a) same-day compatibility, (b) U/L/U/L adjacency (no two heavy-lower back-to-back), (c) hard-run-not-adjacent-to-heavy-lower, (d) maintenance-easy spacing. The server (`week-optimizer`) stays the source of truth and validates on commit (smart-server principle). **Do NOT reimplement 2,669 lines client-side** — port the subset, keep one authoritative copy on the server. Risk to name: **rule drift** between the client subset and the server matrix (needs a shared-source or a contract test).

**3. Replace the intake pickers, or sit alongside?**
→ **Alongside first.** The pickers seed sensible default days at generation; the board is a post-generation "now arrange it" step. Ripping out working intake on v1 is gratuitous risk. Once the board proves out, it can absorb the pickers (v2).

**4. Desktop line?**
→ **Mobile-first, desktop-readable.** Phone gets full drag. Desktop **sees** the board (week + phase + counts + rails as annotations) and can move via a per-session day dropdown fallback — readable and functional, not a dead screen, without building mouse-drag parity.

---

## Dependencies on open threads
- **Volume glass-box surfacing** (shipped today) — the board would *show* the maintenance-band note; not blocking, it's ready.
- **Retest→1RM write-back (Q-097)** — **NOT a dependency.** Rescheduling never touches 1RMs.
- **Real dependency: sessions must be readable + a validated move-write path.** The board needs the actual per-week sessions (today `GoalsScreen` holds only `config`, not `sessions_by_week`; `get-week` is the calendar authority). And it needs a "validate + apply this day-move" server entry that runs the `week-optimizer` rails — that endpoint doesn't exist yet as a single-move validator (the optimizer runs at generation, not per-edit). **That validator is the real new backend surface.**

---

## One-paragraph recommendation
Ship it as **reschedule-only, mobile-first, alongside the intake**, with an **optimistic client subset of 4 rails + server-authoritative validation**, reusing Frame's **conflict-resolve pattern** (not its code) and adding a **new per-move validator endpoint** over the existing `week-optimizer`. That's the smallest version that still feels like Efforts (rails you can feel) rather than a generic calendar. Everything past that — reshape, desktop drag, replacing intake — is a deliberate v2.
