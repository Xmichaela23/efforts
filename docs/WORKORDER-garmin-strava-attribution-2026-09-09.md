> **SHIPPED 2026-09-10** incl. §7. Open-Meteo commercial plan = FOUNDATION-READINESS B14 (launch gate).

# Work order — Garmin and Strava attribution on the new screens (2026-09-09)

Michael: "make sure all Garmin and Strava rules are followed on our new screens; I need to send Garmin
screen grabs." Audit against Garmin's API Brand Guidelines v6.30.2025 (PDF read directly 2026-09-09) and
Strava's developer guidelines (developers.strava.com/guidelines, read 2026-09-09).

## Garmin's rules (quoted)

- Title-level / primary displays: "All uses of Garmin device-sourced data within dashboards, activity
  feeds, overview cards or summary views must include a 'Garmin [device model]' attribution."
  "Position the Garmin attribution directly beneath or adjacent to the primary title or heading of the
  data view … above the fold … Never bury the Garmin attribution in tooltips, footnotes or expandable
  containers." Text alone is acceptable: "simply be listed in appropriately sized text: 'Garmin [device
  model].'" Device model unknown: "list Garmin as the data source."
- Secondary screens (detail views, reports, historical views): same attribution. "For multi-entry
  displays, you can apply the attribution globally — such as in a header — or per entry. Screenshots,
  printouts and reports must retain visible Garmin attribution."
- Combined or derived data (analytics, aggregates, blends with other sources): "must include a Garmin
  attribution … list Garmin as a distinct or contributing data source … globally — such as in a header
  or footer — or per entry." Their acceptable wording: "Insights derived in part from Garmin
  device-sourced data."
- Logo: optional; if used, the Garmin tag logo unaltered, never where Garmin data is absent.
- App name when presenting the connection: full "Garmin Connect" name and tile, never abbreviated.

## Strava's rules (quoted)

- "Powered by Strava" or "Compatible with Strava" logo, unaltered, less prominent than the app's own
  brand; never in the app name or icon.
- Links to Strava data: the text "View on Strava", legible as a link (bold, underline or #FC5200).
- No rule on list views or summary cards; attribution is on the data view.
- Garmin-sourced activities arriving through Strava: attribute Garmin per Garmin's guidelines (Strava
  community notice on Garmin attribution).

## What the app shows now (traced 2026-09-09)

| Surface | Garmin data shown | Attribution today | Verdict |
|---|---|---|---|
| Session drawer / detail (`UnifiedWorkoutView.tsx` ~1131–1210) | yes | `Garmin [device]` text; Strava: Powered by Strava logo + View on Strava | OK |
| Today, completed session card (`SessionDeck.tsx` done card) | yes: name, distance, time, four tiles | none (the old pill row had it; the new card dropped it) | FAIL |
| Week tab rows (`WorkoutCalendar.tsx`) | yes: done rows with real numbers | none | FAIL |
| Today header form line; LOAD (State plate, workload bars, fitness/fatigue/form); Performance tiles (workload, execution, drift) | derived from Garmin data | none | FAIL (derived-data rule) |
| Connections (`Connections.tsx`) | the connection itself | tile asset `garmin-connect-tile.png`; messages say "Garmin" | check the connect row reads "Garmin Connect" in full |
| Weather block | no Garmin data | none needed | OK |
| Strava rows from a Garmin device (`getProviderAttribution` shows `via {device}`) | yes | `via Edge 540` style, without the word Garmin | FAIL (Garmin wording) |

## The change

1. **Completed session card on Today**: directly under the session name, small text: `Garmin [device
   model]` (or `Garmin` when unknown) for a Garmin row; `Powered by Strava` (the small logo asset
   `public/icons/strava-powered-by.svg`) for a Strava row, and `Garmin [model] via Strava` when the
   Strava activity's device is a Garmin. Same `getProviderAttribution` reader the drawer uses.
2. **Week tab**: per entry, after the numbers, small: `Garmin [model]` / Strava mark. Where every done row
   in the visible week is Garmin, a single header line `Garmin [model]` under the week header is
   acceptable instead; per entry is simpler and always right. Never in a tooltip or an expandable.
3. **Derived data, one global line**: `Insights derived in part from Garmin device-sourced data.` (Garmin's
   own acceptable wording, verbatim) as a footer line on: the Today header block (under the form line),
   the State screen's load plate, and the Performance tab under the four tiles. Shown only when the
   athlete has a Garmin connection or any Garmin-sourced row in the window; never when no Garmin data
   is present. Strava needs no derived-data line.
4. **Connections**: the Garmin row shows the full name `Garmin Connect` with the tile asset; no
   abbreviation anywhere on that screen.
5. **Strava rows from Garmin devices**: the `via [device]` line becomes `Garmin [device] via Strava` when
   the device name is a Garmin model (the device-name list Garmin's API returns, or a name starting with
   a Garmin family: Forerunner, Fenix, Edge, Venu, Instinct, Epix, Enduro, Vivoactive).
6. Font size for attribution: the app's small label size (12 px), never smaller than the surrounding
   metadata; text colour the muted token, Garmin's `#007CC3` where the drawer already uses it.

## Screenshots for Garmin (Michael takes them after the build)

Today with a done Garmin ride (card shows `Garmin [model]`), the Week tab, the session drawer, State's load
plate with the derived-data line, the Performance tab, Connections. Attribution visible in every one,
nothing behind a tap.

## Verification

- Throwaway account with one Garmin-sourced workout and one Strava-from-Garmin workout: every surface in
  the table shows its line; a throwaway with no Garmin data shows no Garmin line anywhere.
- No new athlete-facing words except the attribution strings above, which are Garmin's and Strava's.

## 7. Weather source credit and the Garmin line's place (Michael, 2026-09-10)

- The Garmin derived-data line on the Today header sits under the weather rows, so it reads as the
  weather's source. Move it directly under the form line (right column), same 12 px, so it credits the
  form number and the week totals, not the weather.
- Weather is Open-Meteo. Its licence requires an on-screen credit for API use: add `Weather by
  Open-Meteo` as the smallest text on the block (11 px, muted), right-aligned on the sunrise line after
  the city, or as a final line under the week totals. Link to open-meteo.com not required on a phone.
- Open-Meteo's free API is non-commercial. Before launch: subscribe to their commercial plan (API key,
  same endpoints) or switch provider. Ledger this in docs/FOUNDATION-READINESS.md as a launch gate.
