# Load System Extension — Scope & Vocabulary

**Status:** Item 0 built (D-261); Items 1–4 designed, not built.
**Not a "v2."** Extensions to the existing pipeline under one architectural law.
**Authority:** THE LAW is D-260. Each item ships its own D-NNN per behavioral change.

---

## THE LAW (D-260)

The reconciled classifier (`_shared/load-status-reconcile.ts`) is the **ONLY** place a
verdict or prescription **word** is minted. Every layer below is an **input** to it, or a
**display of a number** — never a source of advice. Gauges show numbers + band words; only
the reconciler speaks.

### Literature posture (why authority is stripped from the ratio)

ACWR is scientifically **contested, not settled** — cite the split so the choice is
defensible on the record:

- IOC 2016 consensus **endorsed** ACWR.
- A **2025 meta-analysis (22 cohorts)** recommends using it **with caution**.
- A **Bayesian re-analysis** found sRPE-ACWR **no better than a random-denominator control**
  and argues against using it **in isolation**.

Our stance threads the split: **keep the ratio as an honest descriptive number, strip its
authority to prescribe, require body-response corroboration before any cautionary verdict.**
This is the field's own recommended corrective.

### No single grand number

There is deliberately **no "Efforts Score."** The user sees two readings side by side + a
verdict word, each crackable to its witnesses. A collapsed score can't be decomposed, so it
forces trust — the absence of the one number is the design, not a gap. The glass box only
exists because we refuse to collapse.

---

## Vocabulary (LOCKED — applies across every item)

- **WITNESSES** — the inputs. Load, HR/pace decoupling, effort-vs-typical, muscular ledger,
  TRIMP cross-check. Each testifies; none rules. Surfaced in the ⓘ as "what this reading is
  based on."
- **LOAD READING** — the LOAD row. The acute/chronic number + band word, tappable to
  per-domain breakdown + session list. (Item 2 emits this.)
- **RESPONSE** — the BODY row. How the work is landing — a **state** ("responding well" /
  "responding — load landing hard"), **NOT a score**, built from the body-response witnesses.
  (Item 3 key-2 emits this.) Row header may stay "BODY"; "response" is the word in the copy
  and the internal name for the emitted result.
- **THE RECONCILER** — the sole authority. Reads load reading + response, returns a
  classification word (elevated / high / on_target). Off-screen.
- **"ACWR"** — internal-only (code, D-entries, literature legibility). Never a user-facing
  label again — the gauge is a *load reading* now.

Every input carries its **source + uncertainty flag from day one** (enumerated tags, never
free text), so Item 4 has provenance to read rather than re-deriving. The machine tag is not
the sentence — narration is Item 4's job, mapped from the enum server-side.

---

## Items

### Item 0 — Q-136 fix (BUILT, D-261)
Single plan-phase resolver (`_shared/plan-phase.ts`): `phase_by_week` → `config.phases` →
`config.phase_structure.phases` → `'unknown'`. Consumed by coach, compute-snapshot (Q-138),
arc-context (one lineage). `deload → recovery`; unknown phase → `'unknown'` (D-242 fail-safe,
not `build`). Emits enumerated `phase_source`. Strength-phase tolerance deferred → Q-139.

### Item 1 — TRIMP cross-check (sRPE honesty audit) [lit-adjusted]
TRIMP from HR time-series as a cross-check on sRPE, **never a replacement**. Disagreement →
informational flag, visible in provenance, does **NOT** feed the classifier in v1 (revisit
after false-positive rates observed). Constraints:
- **Cardio only.** Do not TRIMP-check strength — HR-to-load is invalid for resistance work
  (poor RPE-to-%HRmax reliability). Strength stays sRPE-only.
- **Intensity-aware threshold.** sRPE-TRIMP agreement is strong at low intensity (r≈0.70),
  degrades at high (r≈0.31). Gate the disagreement flag on the intensity bin from **Item 2** —
  flag mainly when a session binned EASY shows threshold-level HR. (Couples Item 1 → Item 2.)
- Swim: chest-strap only or `'provisional'`; never flag on wrist-optical.
- No HR → no TRIMP → no flag. D-242: no estimated TRIMP, ever.

### Item 2 — Intensity-binned per-domain load
Existing ACWR rolling-window machinery on filtered slices: strength / hard cardio / easy
cardio, binned by **actual** intensity from HR where available (sRPE where not; bin source in
provenance). **Plan label never determines the bin.** Per-domain ratios become **inputs** to
the reconciler — "total 1.6 but the spike is low-intensity swim on thin chronic" becomes
representable inside the one authority. Closes Q-137's substance. No new gauge, no parallel
verdict. **Emits the LOAD READING.**

### Item 3 — Two-key absorption rule [lit-adjusted]
- **Key 1:** load math (total + per-domain ACWR, plan-phase aware post-Q-136).
- **Key 2 (the RESPONSE):** HR/pace decoupling (steady-state aerobic efforts only —
  TrainingPeaks Pa:Hr, <5% good / >10% concerning) + effort-vs-typical + muscular ledger.
  HRV/RHR join as additive corroborators IF the Garmin tier returns them (check first); never
  required.
- **Rule:** the reconciler escalates to a cautionary/prescriptive verdict **only when both
  keys agree.** Load-high + body-fine → `elevated` max, descriptive copy only.
- **Missing-data (designed, not edge case):** decoupling is valid only on steady-state aerobic
  efforts, which a hybrid week frequently lacks. Expect key-2 to run on effort + muscular
  ledger alone often → fall back to load-only **with visible provenance** ("absorption:
  partial — effort + muscular only" / "load-only — absorption unavailable"). Never render
  nothing on a dangerous week; never pretend key-2 voted when it didn't.
- **Carve-outs preserved:** `nDeclining ≥ 2` and overreached/fatigued readiness escalate
  regardless (D-259).

### Item 4 — The "ⓘ" / glass-box affordance
Every minted number gets a tappable ⓘ showing, in plain language, at each level: (1) WHAT we
measured (raw inputs + sources), (2) HOW we combined it (the actual step), (3) WHAT we're
unsure about (learning / provisional / contested / partial flags). Rules: no proprietary
black-box score; no number without a reachable receipt; plain English, no jargon-as-authority;
uncertainty shown, not hidden. **The ⓘ reads the SAME lineage the reconciler used — never
re-computes or re-narrates independently.** It maps the enumerated provenance tags to English
server-side. The receipt IS the product.

---

## Sequence

`0 → (2, then 1 — 2 informs 1's threshold) → 3 → 4.`

Item 4 is last to **build** but considered in each item's **data shape** from day one (every
input carries source + uncertainty enum), so Item 4 has something to read. Each item:
trace/design → show → fixtures → D-NNN per behavioral change → deploy.

## Cross-refs
- D-259 — the reconciler + its two gates (`runNotOverPlan`, build-band).
- D-260 — THE LAW. D-261 — Item 0 (single plan-phase resolver).
- Q-136 (phase resolution, closed by D-261), Q-137 (redline → closed by law + Item 2),
  Q-138 (plan_phase stub → resolved by D-261), Q-139 (strength tolerance seam).
