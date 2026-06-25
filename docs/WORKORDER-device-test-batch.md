# WORK ORDER — Batched On-Device Verification Session

**Status:** FILED, NOT STARTED. Future work order — captures a cluster of open items that all require a physical iOS device and mostly collapse onto **one or two** logging sessions. Filed 2026-06-24 from the contradiction/coupling audit. The point of batching: scheduled piecemeal, the device gets picked up 5+ times for what is really one scripted run.

**Why batched:** every item below is blocked on the same thing — a real iOS device in hand, logging a strength session and (separately) a swim. Items 1–4 are literally **one** logging flow.

---

## THE ONE STRENGTH FLOW (clears items 1–4 in a single pass)

Log a **deliberately under-executed, deviating** strength session: edit a set's values, skip an exercise, set RPE — then **background the app and return once** mid-edit, finish, and save. Then **read the DB row** to confirm the save. That single flow exercises:

1. **D-204 prefill-honoring chain (ON-DEVICE TEST owed, 2026-06-22).** Confirm performed sets carry `completed:true`/edited values; untouched prefills stay `prefilled` and are dropped from totals/receipts/narrative; the narrative doesn't fabricate RIR. (ENGINE-STATE "Questioned"; POLISH §1.)
2. **Q-076 — "skipped exercise still shows as done."** The skipped exercise must vanish from receipts. **Read the DB row FIRST** to localize saved-data-vs-display before touching code (suspect a stale on-device bundle or saved data lacking `prefilled`).
3. **WORKORDER-strength-logger Item 2 — lifecycle persistence.** The background+return step is the repro: logger must reopen with all in-progress input intact (the Capacitor app-lifecycle / WKWebView teardown case). Bug A (D-204 data-loss race) only reproduces by backgrounding mid-edit.
4. **Execution-chip color thresholds (POLISH §7).** Because the session is *deliberately under-executed* (missed sets / load under prescribed), it should produce a genuinely low execution score — confirm the amber (≥70) and rose (<70) chip colors render and read correctly (only ever eye-verified on a clean ~100% session).

**Observed along the way (not a separate session):**
- **Q-072 — resume churn.** The auth-expiry / network-flap remount churn surfaces during this device log; observe whether the D-202/D-203/D-209 hardening makes it harmless. ⚠️ Per ENGINE-STATE, Q-072 must stay "pending device" until resume / logout / user-switch pass on a phone — do NOT close it on web/logic verification.
- **WORKORDER-strength-logger Item 1 — rest-timer regression.** Tapping Done should auto-start the D-139 top-pill timer; confirm it fires (this is the regression the strength-logger work order tracks).

## THE SWIM PASS (one logged swim)

5. **D-207 — swim Details tab on-device visual.** The strength-family Details→Performance fold (D-207) is only *structurally* verified for the endurance path; a completed swim's Details/Performance must be eyeballed on device before claiming "verified on device." (POLISH §7.)

---

## Adjacent device items (same device-in-hand, different feature — fold in opportunistically)

- **D-196 Apple Watch send** — on-device tap unconfirmed (WorkoutKit may need Xcode iteration).
- **D-198 cycling-intent** — planned-ride Mode A test pending (branch `feat/d198-cycling-intent`, not on main).

These two are NOT part of the strength/swim flows above; listed only because they need the same device and an Xcode loop. Sequence per the Apple-Watch consolidated work order in ENGINE-STATE.

---

## Discipline

- **Read the DB row before changing code** for Q-076 (localize saved-data vs display).
- Items 1–4 are ONE flow — do not schedule them as four device pickups.
- Do not mark Q-072 closed on this session unless resume / logout / user-switch all pass (the D-205-supersedes-D-202 trap).
- Cross-refs: ENGINE-STATE "Questioned" (D-204) + "Apple Watch week"; POLISH §1 / §7; `WORKORDER-strength-logger.md`; OPEN-QUESTIONS Q-072 / Q-076.
