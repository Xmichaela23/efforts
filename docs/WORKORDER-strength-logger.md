# WORK ORDER — Strength Logger: Rest-Timer Regression + Session Persistence

**Status:** HELD — for a fresh chat. Two items, both testable on-device **now** (no ride dependency). Read DECISIONS-LOG (D-108–D-139), OPEN-QUESTIONS, ENGINE-STATE before writing code. Reproduce from code first.

> ⚠️ **Doc-vs-work-order reconciliation (read first):** this work order says "Rest timer was deliberately made opt-in (D-139 range)." **ENGINE-STATE / DECISIONS-LOG say the opposite for the *current* state:** the saga was **D-120 auto-start → D-121 opt-in → D-139 AUTO-START + top-pill-only** (D-139 *superseded* the opt-in). So the live baseline is **auto-start on Done via `autoStartRestForSet` (keyed `${id}-${setIndex}`), top-pill the sole surface, in-row rest block REMOVED**. Treat D-139 (auto-start) as the design intent unless the user re-decides. Item 1's "restore opt-in + manual" framing should be reconciled against this — confirm the desired end-state with the user, and open a new D-NNN if it reverts D-139.

---

## Context for the incoming Claude Code instance

Picking up fresh context on **Efforts** (solo-dev hybrid endurance + strength app: React/Vite/Capacitor front end, Supabase/Deno back end).

**Repo conventions — respect these:**
- **"Smart server, dumb client."** Server computes scalars; client renders. Don't recompute server-provided values on-device.
- Institutional memory lives in **DECISIONS-LOG.md** (D-NNN), **OPEN-QUESTIONS.md** (Q-NNN), **ENGINE-STATE.md**. Read the relevant entries before writing code. There is also a full reverse-documentation corpus at **`docs/audit/`** (01–09 + 99-SUMMARY) — area maps of the whole app with file:line, an edge-case protection list (§1), and ground-truth DB schema (09).
- **Reproduce from code first** before proposing a fix. Match against an existing Q/D entry, or open a new one.

**Strength logger is the most heavily documented area. Relevant prior work:**
- Rest timer / RIR / keypad: **D-125–D-139** (rest timer is **AUTO-START** per D-139 — see reconciliation note above; D-121 was the superseded opt-in).
- Resume/reopen + draft persistence: **D-108–D-110**; cross-workout draft bleed: **D-132**.
- Viewport overflow (iOS 393pt): **D-114** (RESOLVED — collapse/expand redesign).

---

## ITEM 1 — Rest-timer regression (REGRESSION — likely touches D-125–D-139)

**Symptom (observed on-device):** When the user taps **Done** on a set's reps, **no rest timer appears.** (The "there was previously a manual timer too" recollection is the **superseded D-121 opt-in** state — D-139 deliberately REMOVED the in-row manual block, so the *only* surface expected today is the D-139 auto-start top pill. The regression is therefore narrowly: **the D-139 auto-start isn't firing/surfacing** — not "two entry points are gone.")

**Why this matters:** the live design (D-139) is auto-start-on-Done into the top pill. Suspicion is the auto-start mount/entry point regressed so nothing surfaces, AND any manual fallback control is gone.

**Investigate (from code first):**
1. Trace the "Done on reps" handler — what it calls to mount/trigger the rest timer (`autoStartRestForSet`, keyed `${id}-${setIndex}`; the pinned top pill `REST m:ss · Skip` is the D-100/D-139 surface).
2. Check the auto-start gate: does it still fire on completing a non-last, non-duration set? Did a refactor break the mount or the key?
3. Find where any manual timer control used to render and why it's no longer in the tree (D-139 deliberately REMOVED the in-row block — confirm whether the user wants a manual fallback re-added).
4. Determine whether this is **one** regression (shared mount point) or **two** (auto gate broke + manual control removed separately).

**Deliverable:** restore the **D-139 auto-start-on-Done into the top pill** (the live design intent). A manual-control fallback is **NOT in scope unless Michael re-decides** — re-adding the in-row manual block reverses D-139 and needs a new superseding D-NNN, not a silent restore. Match to a D-NNN if the regression reverted a known change; else open a new Q-NNN.

---

## ITEM 2 — Logger session persistence across app background/return (NEW)

**Desired behavior:** when the user leaves the app mid-logging (background, app-switch, screen lock) and returns, the **strength logger should still be open** with **all current input preserved in place**.

**Distinct from prior draft work:** D-108–D-110 (resume/reopen) and D-132 (cross-workout draft bleed) covered draft persistence/isolation. This is specifically the **Capacitor app-lifecycle** case — background → foreground — where in-memory React state can be torn down by the OS.

**Investigate / design:**
1. How is in-progress logging state currently held — React state only, or persisted (localStorage / Supabase draft)? If in-memory only, the OS can kill it on background.
2. Hook Capacitor **App lifecycle** events (`App.addListener('appStateChange', …)`) to persist on background and rehydrate on resume.
3. Decide the persistence substrate (local draft vs. server draft) — keep it **consistent with the existing draft system** (D-108–D-110 / D-132) to avoid reintroducing bleed (identity-aware key `..._${plannedId||'adhoc'}`, identity guard on restore, gate-on-Done).
4. Restore both the **open logger view** and the **exact in-progress input** (current exercise, sets entered, partially typed values) on return.

**Watch for:** do not reintroduce cross-workout draft bleed (D-132). Persistence must be scoped to the active workout only.

**Deliverable:** logger survives background/foreground with input intact; open a new Q-NNN / D-NNN documenting the chosen substrate and the lifecycle wiring.

---

## Out of scope / parked — do NOT touch
- **D-198** cycling intent (planned-ride Mode A test pending Saturday; branch `feat/d198-cycling-intent`, committed `ea6d1598`, **not pushed to main**; edge fns + migration ARE live on prod, data-path verified).
- **D-196** Apple Watch send (built, on `main`; on-device tap unconfirmed — WorkoutKit may need Xcode iteration).
- **Q-035** (delete logged strength workout also deletes planned prescription) — still parked awaiting repro; separate from these two items.
- Client-recompute cleanups (StateTab `e1rm_pct`, StrengthCompletedView `volume`) — low-risk single-source cleanups, separate.
