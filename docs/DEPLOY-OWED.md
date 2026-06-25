# Deploy-Owed / Post-Deploy Verification

Changes committed locally but **not yet pushed/deployed**, plus verifications that can only run **against the deployed code** (not the local working tree). When a push/deploy happens, work this list: deploy the named functions, then run the post-deploy checks here. This is the bucket for "local-verified, deployed-equals-local still owed."

> Convention: nothing here blocks local work. These are the checks that close the loop once code is live.

---

## Owed

### D-212 Cut 2 — coach payload (divergence) → `supabase functions deploy coach`
- **Why:** Cut 2 changed the coach payload (`COACH_PAYLOAD_VERSION` 45→46; new top-level `fitness_verdict_divergence`). The new field doesn't reach the client until the deployed function emits it.
- **On deploy:** `supabase functions deploy coach`. Also re-deploy any function bundling the changed `_shared/arc-context.ts` (divergence is computed there) if you want the field fresh everywhere.
- **Post-deploy verify:** the spine↔projection divergence renders in the State RACE-block verdicts subsection **only on a real disagreement** — currently none exists for the sole athlete, so the render path is verified by reading, not runtime. Confirm on a live divergence when one occurs. (Block-verdict line shows the dormant "needs more comparable sessions" today.)

### D-213 non-race work — the full 486-plan matrix is a post-deploy check
- **Why:** `scripts/plan-generation-matrix.mjs` **POSTs to the deployed `generate-combined-plan`** — it cannot validate undeployed local changes. Pre-deploy, the local `deno test` suite (the in-process generator tests) is the substitute behavioral proof; the 486-matrix is the **final local-equals-deployed confirmation**.
- **⚠ SEQUENCED — these two are dependent, do them in order:**
  1. **(Cut 2) Schema migration** — `supabase db push` to apply `20260625120000_add_target_weeks_to_goals.sql` (adds `goals.target_weeks`). Verified by precondition only (REST creds can't run DDL); additive nullable + NULL-passing CHECK, existing event goals unaffected. **The non-race end-to-end below CANNOT run until this column exists** (the wrapper inserts `target_weeks`).
  2. **(Cut 3b) Non-race end-to-end** — the dependent gate (see the 🔴 item below). Runs only after step 1.
- **On deploy (of any non-race generation cut):** `supabase functions deploy generate-combined-plan` (+ callers per the ingest/recompute fan-out rule). **Cut 3b also touches the wrapper:** `supabase functions deploy create-goal-and-materialize-plan`.
- **🔴 Cut 3b non-race END-TO-END (the gate that closes Cut 3b's loop):** Cut 3b (D-214 — route a non-race goal through `buildCombinedPlan`) is **inspection-verified + deploy-gated**, NOT runtime-verified. Only the extracted E1/E2 decision (`selectGoalsForCombined`) is runtime-proven locally (`non-race-routing.test.ts` — event byte-identity); the entry gates, inserts, E3/E7, and the full wrapper path have **no local runtime oracle** (no Docker → no `supabase functions serve`). **After deploy:** create a real non-race goal (e.g. `goal_type='capacity'`, `sport='run'`, `target_weeks=12`, no `target_date`) and confirm it routes through `buildCombinedPlan` → `generate-combined-plan` and produces a contiguous block plan (base→build→race_specific→taper; retest terminal arrives in Cut 4). Requires the Cut 2 `target_weeks` migration applied first.
- **Post-deploy verify:** `node scripts/plan-generation-matrix.mjs` → expect the matrix to pass (was 486/486; confirm the count). Cut 1 ('retest' vocabulary) is byte-identical to race output by construction, so the matrix should be unchanged after Cut 1 deploys; later cuts (terminal branch, volume anchor) are where it earns its keep.

### Standing — the whole D-212/D-213 arc is committed but unpushed
- Multiple commits on `main` (D-212 Piece 1/4 + Cut 2, the standards SPECs + D-210/D-211/D-212/D-213, the non-race Cut 1) are **not pushed**. `git push origin main` when ready; Netlify auto-deploys the client, edge functions deploy separately (above).

---

## Done
_(move items here once deployed + post-deploy-verified, with the date)_
