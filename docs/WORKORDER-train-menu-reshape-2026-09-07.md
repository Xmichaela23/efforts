# Work order — Train menu reshape: Strong becomes "Run + Strength" (2026-09-07)

Decided in conversation with Michael, 2026-09-07. Source of every program named here is
`SOURCE-viada-hybrid-athlete.md` Part E0 (the roster) and the pages cited. No hypertrophy tier,
no dose dial, no "Muscle" position anywhere — ruled out for the audience (lean, defined
rider-runners; the default 8–12 sets/muscle dose IS that prescription). Cycling: Base (p278) is
not a prerequisite for our rider (reader-specific advice; it inverts).

## The layout this order builds toward

```
Train
   Standard Focus         All Rounder, p274/275 — live, unchanged
   Run Focus
      Run + Strength      p246/247 — today's "Strong" program, renamed and re-homed   ← THIS ORDER
      Long Run + Strength p250/251 — later; replaces the old marathon builder
      Speed block         p276/277 — later, 4–6 weeks
   Ride Focus
      Ride + Strength     p279 + notes p280 — next order; pages are on disk (see below)
Races                     The Runner p258 for run races — later
```

Off the screen: Strength Focus tile, Athletic Focus tile, the Strong / Heavy tier screen.
The old marathon builder is NOT touched in this order; it goes when Long Run + Strength lands.

## 1. Train screen (`src/components/NonRaceBuilder.tsx`)

- `TRAIN_ORDER` → `['standard', 'run', 'ride']`. The `strength` and `athletic` cards and their
  copy go. `TrainCardId` shrinks with them.
- `TRAIN_GOAL.run` → `'get_stronger'`. The Run Focus card opens the same wizard the Strength
  Focus card opens today, on frame `strength_5k`. `state.focus` for that card is `'run'`
  (it already is the default in `frameOf`).
- The `tier` step (`currentStep === 'tier'`, `TIER_ORDER`, `TIER_COPY`, `StrengthTierId`) is
  removed from `getSteps` and from the render. Strong was a no-op routing into `get_stronger`;
  Heavy was dark. Nothing in the payload reads the tier.
- Copy:
  - Run Focus blurb: `Your running, with the lifting cut around it.` Requirement line under it,
    same string Standard Focus shows (`STANDARD_FOCUS_REQUIREMENT`).
  - Ride Focus stays dimmed (`TRAIN_GOAL.ride = null`) with blurb
    `Your riding, with the lifting cut around it.` until Ride + Strength ships.
  - Standard Focus unchanged.
  - No em dashes, no emojis, no protocol names, Viada not named on the card (the two-mentions
    problem the file header records).

## 2. The programme's name — one source, every screen

- `supabase/functions/_shared/standing-plan/frames.ts` `FRAMES.strength_5k.displayName`
  → `'Run + Strength'`. `programmeName()` already prefers `Frame.displayName`, so every wizard
  step title and the built plan's name pick it up. Today the frame deliberately has none.
- `src/lib/non-race-goal-seeds.ts:11` `get_stronger: 'Strong Focus'` → `'Run + Strength'`.
  Check its readers (`non-race-goal-seeds.test.ts`, `planned-session-golden.test.ts`,
  `wizard-focus-theme.test.ts`) and update the expectations, not the rule.
- `src/components/GoalsScreen.tsx:2345` — the "Strength Focus appears twice" block: both labels
  become the card name the athlete tapped (`Run + Strength` or `Standard Focus`, via the frame),
  since "Strength Focus" no longer exists on the screen.
- `src/components/AppLayout.tsx:1956` comment names Run Focus / Strength Focus — update the words.
- Plans already built keep their stored names. Michael's own account is the only one.

## 3. The ride swap comes off the Run + Strength path

Under this layout a rider gets Ride + Strength, so the per-slot run/ride question on the
`endurance` step is wrong for `strength_5k`: p246 is a run week and the conversion table
(`RIDE_EQUIVALENT`, `sport-slots.ts:140`) is ours, not his, and was measured collapsing both run
quality slots onto one ride family (DESIGN-standard-focus-all-rounder §2).

- Client: on frame `strength_5k` every slot is `run`; the `endurance` step stops offering ride
  (`allowedSlotSports`, `slotSports`, `emptySlotSports`), the ride-hours line and ride
  demonstrated-minutes read are not shown for it.
- Server: `assignSports` / the resolver never assigns a ride slot to `strength_5k`.
- `RIDE_EQUIVALENT` itself: grep whether the `all_rounder` path reaches it
  (`sport-slots.ts:340` is the suspect — the All Rounder's ride days are native to p274 and
  should not need conversion). If nothing live reaches it, delete the table, the import at
  `src/lib/hard-slot-choices.ts:203`, and the three tests that exist only to exercise it
  (`standing-plan-wizard.test.ts`, `standing-plan-sports.test.ts`,
  `variant-pick-travel.test.ts` — the ride cases only). If the All Rounder does reach it,
  fence it to `all_rounder` and say so in the comment; do not leave it reachable from
  `strength_5k`.
- `focus` in the payload stays omitted on this path (byte-identical rule at
  `NonRaceBuilder.tsx:1688`); `create-goal…:3057` and `generate-strength-plan:345` need no change.

## 4. Guards that must still hold

- `pick-wire-frame.test.ts` (D-457, one frame's constants never indexed by the other's rows).
- Standard Focus byte-identical: hash a composed All Rounder block before and after
  (the method in NOTES-stage4 §"GET STRONGER IS BYTE-IDENTICAL").
- Run + Strength week counts unchanged: four lifting days, plyo day 3, four endurance sessions,
  one rest day, test week first.
- The `strength-system/*.test.ts` files that mention "Strength Focus" are the previous
  program's and are untouched.

## 5. Verify, ship

Robot account (service-role admin API, seeded baselines above the entry minimum):
Train → Run Focus → whole wizard → build. Read the export: plan name `Run + Strength`, every
endurance row a run, week one a test week, week two fully priced. Then Standard Focus from the
same account: hash matches the pre-change hash. Delete the robot account.
Client tests, `_shared` deno tests, tsc, eslint at baseline (button-shape lint). Push.
Deploy only what changed: if `_shared/standing-plan/*` was edited, the closure is
`generate-strength-plan`, `coach`, `rematerialize-standing-block` (DESIGN §12h). `npm run ios`.
Report: pushed / web deployed / functions deployed (versions read back) / iOS synced / not
device-checked.

## 6. Out of scope here

Ride + Strength (pp.278–281), Long Run + Strength (pp.250–251), Speed block
(pp.276–277), removal of the old marathon builder, anything hypertrophy.

## 7. The page images

Every Chapter 10 page is already on disk, renamed by page number:
`/Users/michaelambp/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/` (p244–p259, p274–p284).
The next order (Ride + Strength) transcribes p279 and p280 from there into
`SOURCE-viada-hybrid-athlete.md` as a new Part, the way Part E1 did p246/p247. Nothing is
blocked on photographs.
