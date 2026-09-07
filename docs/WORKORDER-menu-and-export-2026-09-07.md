# Work order — menu order, and "Download your data" (2026-09-07)

## 1. Menu order (src/components/MobileHeader.tsx)

Profile · Account · Connections · Gear · Athletic Record · Import · Help & Support · Admin (admins only).
You and your login, then what you plug in, then your data, then help. **Remove "Export Data" from the
menu**: it has no action and nothing implements it. Export lives on the Account screen (below).

## 2. Download your data (Account screen, src/components/AccountPage.tsx / AccountPlate.tsx)

A row on the Account plate, above Sign out: **Download your data** with the down chevron (a sheet rises).
Sheet copy: "One zip: your workouts, every logged set, your plans and your numbers. Ready in a moment."
One pill, "Build the file". While it builds: "Building…". Done: a pill "Save file" that hands the file to
the phone's share sheet on iOS (Capacitor Share with the downloaded blob written to cache) and a plain
download on the web. The link is good for one hour; say so under the pill.

### The edge function `export-data`

`requireUser` (never a body id). Builds a zip in memory and uploads it to a private bucket `exports` at
`<uid>/efforts-export-<date>.zip`, returns a signed URL (60 min). Contents, all UTF-8 CSV with a header
row, plus one JSON:

- `workouts.csv` — date, sport, name, duration_min, distance_mi, distance_km, avg_hr, max_hr, avg_power,
  normalized_power, avg_pace_min_per_mi, elevation_ft, load, source (garmin/strava/healthkit/manual), notes.
- `sets.csv` — the Strong / Hevy column layout so it opens in either: Date, Workout Name, Exercise Name,
  Set Order, Weight, Weight Unit, Reps, RPE, Distance, Duration, Notes. One row per logged set, from
  `exercise_log` (and the strength rows in workouts if sets live there — check `StrengthLogger` save path
  and use whichever table the logger writes).
- `plans.csv` — plan name, start, end, and one row per planned session: date, sport, name, minutes, done.
- `profile.json` — name, location, birthday, units, height, weight, and the numbers on file (lifts, FTP,
  threshold pace, threshold HR, easy pace, zones), each with its source word, plus `exported_at`.
- No tokens, no connection rows, no photo (the photo is theirs on the share sheet already).

Migration (Michael pastes): private bucket `exports`, owner-read policy on `<uid>/…`, service-role write.
Objects older than a day are removed by the function on its next run for that user (or a daily cron if one
exists; say which).

## 3. Verify, ship

Throwaway account with a few workouts, sets and a plan: build → signed URL → download → unzip → each file
opens, `sets.csv` imports into Hevy's CSV importer format (validate columns against Hevy's template),
counts match the account. Another user's token cannot read the object. Delete the throwaway.
Lint clean (button-shape), tsc clean, push, deploy `export-data`, `npm run ios`. Report: pushed / web /
function / migration text / iOS synced / not device-checked (the iOS share sheet).
