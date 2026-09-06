# Work order — Account: forgot password, change password, change email, delete account (2026-09-06)

Michael: "We need 'I forgot my password' and 'change my password'. We need an Account section." Today the
app has none of it: sign in is email + password (src/components/LoginForm.tsx, RegisterForm.tsx), Sign Out
lives in the menu, and there is no reset, no change, no delete. Apple's review guideline 5.1.1(v) requires
in-app account deletion for any app that creates accounts, so that ships in the same pass.

Rules that apply: docs/DESIGN-button-shape.md (a border means you can tap it; right chevron = you leave
the screen; no pencils), docs/COPY-VOICE.md (plain words, no idioms, never "priced"), the number-row and
plate construction on Profile (src/components/TrainingBaselines.tsx, src/components/ui/number-row.tsx).

## 1. Forgot password (sign-in screen)

- Under the password field on LoginForm: a plain text link "Forgot password?".
- Tap → the form swaps to one email field and a "Send reset link" pill. Calls
  `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://efforts.work/reset-password' })`.
- Whatever the result, the screen says: "If that address has an account, a reset link is on its way."
  Never confirm or deny that an email exists. "Back to sign in" underneath.

## 2. The reset page (web, /reset-password)

- New route in src/App.tsx. The email link opens it in the phone's browser; that is fine, no deep link
  needed for this pass. AuthWrapper must let this route render without a session and must handle the
  `PASSWORD_RECOVERY` event / the recovery token in the URL the way supabase-js expects.
- Two fields, "New password" and "Again", one pill "Set password". Minimum 8 characters, both match.
  Calls `supabase.auth.updateUser({ password })`.
- On success: "Password set. Open efforts and sign in." Nothing else on the page. On a stale or used
  link: "This link has expired. Request a new one from the sign-in screen." with that link.

## 3. Account plate on Profile

Below the "You" plate, a plate titled ACCOUNT (same section header style, icon `KeyRound` or `Shield`),
rows in this order:

1. **Email** — the sign-in address, plain text (it is already shown in "You"; move it here and drop it
   from "You" so it appears once).
2. **Change password ›** — opens a sheet over the screen: "New password", "Again", "Set password". No
   current-password field (Supabase does not need it while signed in). Confirmation line: "Password
   changed."
3. **Change email ›** — sheet: "New email", "Send confirmation". Calls `updateUser({ email })`. Line:
   "Confirm the change from the link in your new inbox." Supabase sends confirmation to the new
   address (and the old one, per project setting).
4. **Sign out** — a bordered pill, same action as the menu item. Keep the menu item too.
5. **Delete account ›** — the danger variant. Sheet: one paragraph in plain words: "This deletes your
   account and everything in it: workouts, plans, numbers, photo. It cannot be undone." A field: "Type
   DELETE to confirm." The pill is disabled until it matches. Then it calls the edge function below,
   signs out, and lands on the sign-in screen with the line "Your account is deleted."

## 4. The delete-account edge function

`supabase/functions/delete-account/index.ts`, called with the user's own JWT (`requireUser`, the same
guard the other functions use). It:

1. Deletes every object under `avatars/<uid>/` in storage.
2. Calls a SQL function `delete_user_data(uid uuid)` (new migration, SECURITY DEFINER, service role
   only) that loops over `information_schema.columns` for every public table with a `user_id` column
   and runs `DELETE FROM <table> WHERE user_id = uid`. Discovered at run time, so a table added next
   month is covered without editing the function. Migration note: `user_baselines`, `workouts`,
   `planned_workouts`, `plans`, `workout_facts` and about twenty more carry `user_id`; only three tables
   cascade from `auth.users`, so this explicit sweep is required.
3. `auth.admin.deleteUser(uid)` with the service role key.
4. Returns `{ deleted: true }`. Log the uid and the per-table counts.

The migration is applied by Michael in the Supabase SQL editor (repo convention); write it, tell him.

## 5. Supabase dashboard (Michael, one time)

Authentication → URL configuration: Site URL `https://efforts.work`; add `https://efforts.work/reset-password`
to Redirect URLs. Authentication → Email: keep the default templates or set the sender name to "efforts".
The built-in auth mailer is rate-limited (a few emails an hour); before real users, point Auth SMTP at
Resend, which the project already uses for `notify-admin-signup` (RESEND_API_KEY exists as a function
secret). Write the exact dashboard steps in the report so Michael can do them from the phone.

## 6. Verify, then ship

Throwaway account. (1) Change password → sign out → sign in with the new one. (2) Change email → the
row shows the pending state until confirmed. (3) Forgot password: use `auth.admin.generateLink({ type:
'recovery' })` with the service key to get the link without an inbox, open /reset-password with it, set a
password, sign in. (4) Delete: after the call, `auth.admin.getUserById` returns nothing, every table with
a `user_id` column has zero rows for that uid (loop `information_schema` in the check too), the avatars
folder is empty. Lint: no new button-shape findings. `npx tsc --noEmit` clean. Push, wait for Netlify,
`npm run ios`. Report: pushed / web / functions deployed / migration text for the SQL editor / dashboard
steps / iOS synced / what was not device-checked.
