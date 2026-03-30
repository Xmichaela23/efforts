# Strength relayout: ingest auto, fingerprint, telemetry

## Mental model (debugging “why did strength days move?”)

Post-ingest `adapt-plan` with `action: 'auto'` is **safe because it is idempotent by design**, not because we hope the DB rarely changes.

- Strength relayout compares the **current week’s run shape** (derived from `sessions_by_week[current_week]`, endurance rows only) to a **stored fingerprint** in `plan.config.strength_primary_sig_by_week[week]`.
- **Logging a workout does not update** `plans.sessions_by_week` or that fingerprint. So for a typical ingest, **signature matches stored sig → relayout does nothing**.
- Relayout **persists** only when plan data for that week **already differs** from what was last recorded (plan editor, reschedule, generator updates, materialize, first-time seed of `strength_primary_sig_by_week`, etc.). Ingest is just a **timely trigger** to run the same checks as cron.

## `action: 'auto'` response (relayout slice)

In addition to `adaptations`, the function returns:

| Field | Type | Meaning |
| --- | --- | --- |
| `action` | `'auto'` | Discriminator |
| `relayout_applied` | `boolean` | Strength week was rebuilt and written |
| `relayout_week` | `number \| null` | Plan week index that was rewritten |
| `previous_sig` | `string \| null` | Fingerprint before (null if no relayout) |
| `new_sig` | `string \| null` | Fingerprint after (null if no relayout) |
| `sessions_replaced` | `number \| null` | Count of new strength sessions placed in that week when applied |

There is no `adaptation_log` table today; **operational frequency** comes from Supabase function logs: one JSON line per auto invocation with `tag: "adapt_plan_auto"` (grep / log drain).

## `plans.config` fields after relayout

When a relayout **applies** (sessions merged and saved), the server sets:

- `last_relayout_at` — ISO timestamp
- `last_relayout_week` — same 1-based week as `relayout_week`

## Client banner (deferred until volume is known)

Contract for a **one-time dismissible** banner when the athlete opens the app:

1. Show when `config.last_relayout_week === plan.current_week` **and** `config.last_relayout_at` is **newer** than `config.last_relayout_seen_at` (or `last_relayout_seen_at` is absent).
2. Copy example: “Strength days were adjusted to fit your updated schedule.”
3. On dismiss, PATCH active plan `config` with `last_relayout_seen_at` set to the same timestamp as `last_relayout_at` (or to `new Date().toISOString()`).

No push or websocket required; the next app load picks up `plans` as today.

**Recommendation:** Ship telemetry first, measure relayout rate per active user-week, then wire the banner if noise is acceptable.
