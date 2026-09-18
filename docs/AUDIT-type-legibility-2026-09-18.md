# Type and legibility audit — 2026-09-18

**Measure and propose. Nothing in the app was changed.** Measured on `main` at 5fea9a8d, in a separate
checkout on its own port (another terminal was editing the State screen in the shared working tree at the
time and its half-finished edit broke the live preview). Michael, 2026-09-18: *"it's hard to read across the board."*

Evidence labels used below: **measured** = read off the rendered page this session; **read** = quoted from
the standards page named; **ours** = a number this audit chose, with the reason.

## 1. The standards (read)

| standard | the number | page read |
|---|---|---|
| WCAG 2.2 SC 1.4.3 | text 4.5:1; large text 3:1. Large = 18 pt, or 14 pt bold, "approximately 24px and 18.5px" | w3.org/WAI/WCAG22/Understanding/contrast-minimum |
| WCAG 2.2 SC 1.4.4 | "text can be resized without assistive technology up to 200 percent without loss of content or functionality" | w3.org/WAI/WCAG22/Understanding/resize-text |
| WCAG 2.2 SC 1.4.11 | icons and meaningful graphics 3:1 (from the workorder; this page was not re-read this session) | — |
| Apple HIG, Typography, iOS "Large (default)" | Large Title 34, Title 1 28, Title 2 22, Title 3 20, Headline 17 semibold, Body 17, Callout 16, Subhead 15, Footnote 13, Caption 1 12, Caption 2 11 (points) | developer.apple.com/design/human-interface-guidelines/typography (the page's data file) |
| Apple HIG, same page | iOS default 17 pt, **minimum 11 pt**; "avoid Ultralight, Thin, and Light font weights, which can be difficult to see, especially when text is small"; system text styles give Dynamic Type | same |
| Material 3 type scale | display 57/45/36 · headline 32/28/24 · title 22/16/14 · body 16/14/12 · label 14/12/11 (px; body regular, label medium) | github.com/material-components/material-web `tokens/versions/v0_192/_md-sys-typescale.scss` (m3.material.io would not render to the fetcher) |

In the iOS web view one CSS pixel is one point, so Apple's point sizes are read as px below.

## 2. How it was measured (measured)

- A throwaway account (created for this audit, deleted at the end): a Run + Ride + Strength plan started five
  Mondays ago, six weeks of rides, runs, swims and lifts sent in through the Garmin door, a logged lower-body test.
- Headless Chromium at **390 px** (phone, 2× pixels) and **1440 px** (desktop, 2×), dark mode, fonts confirmed
  loaded (Space Grotesk 300/400/500/600, IBM Plex Mono 500, Rajdhani 300).
- For every visible run of text: its size, weight, colour and the product of every opacity above it.
- **The background is sampled from the rendered pixels, not the colour token**: each view is shot once as-is and
  once with every letter made transparent, so the pixels under each line are the real gradient, dot grid and glow.
  The text colour is blended over each background pixel and the contrast worked per pixel.
- **The verdict uses the worst 10% of the pixels under the text** (the lightest patch of glow it sits on), not the
  average — the average hides the patch where a line is hardest to read. Both numbers are in `measure.jsonl`.
- Screens: Today (planned day and done day), the planned-session sheet (a lift and a run), the strength logger,
  Performance (a ride, a run, a lift), State Status (rows closed, rows open, the ⓘ key), Adjust, Schedule.
  Every screen was scrolled top to bottom. **3,255 text runs**, 585 distinct styles.
- Not measured: drawn icons (chevrons, tab icons, the sport icons) against 1.4.11 — only icons that are text
  characters (ⓘ ✓ ⌄) are in the table. Charts' axis text is included where it is HTML; text drawn inside an SVG is not.

## 3. What was found (measured)

| | phone 390 | desktop 1440 |
|---|---|---|
| text runs | 1,592 | 1,663 |
| fail WCAG 4.5:1 (worst patch) | **292 (18%)** | **271 (16%)** |
| smaller than 12 px (Apple Caption 1) | 365 | 408 |
| smaller than 11 px (Apple's iOS minimum) | 132 | 131 |
| in Light weight (300) | 99 | 99 |

1. **Contrast is the smaller half of the problem.** Four in five lines pass. What makes the app hard to read is
   size, the number of grey levels, and shorthand (section 4). Most failures sit between 3.5 and 4.5:1.
2. **Small grey labels on the glow fail.** The LOAD row (`fitness`, `fatigue`, `form`, `· 6 wk`, `-11`) is 10.5–11 px
   at 45% white; where the top glow sits behind it the worst patch is 3.5–4.4:1.
3. **The separator dot fails everywhere it appears** — `·` at 30–38% white is 2.5–3.4:1. 151 lines contain one.
4. **The bottom bar (HOME / STATE / +) fails on 61 of 96 measurements** — 65% white on the bar's own sport-colour
   glow (#6c5429 behind "HOME"), 3.6–4.0:1. It is the only text on every screen.
5. **Done-session titles on Today fail hardest**: "Upper body: Pull" 17 px orange at 43% → 2.2:1; "Ride" green at
   55% → 2.6:1; "Garmin Forerunner 965" in link blue → 2.8:1 on the orange-tinted card.
6. **Sport and status colours used as text**: run gold at 72% on the Today date card (4.4:1), "optimal" green
   (4.2:1), "high risk" coral at 11 px passes by 0.3 but at any larger size on a lighter patch it fails (3.9:1 in the mock).
7. **Strength charts on State** print their dates and ranges at **10 px** at 30–45% white ("200–205 lb" 2.6:1,
   "as of Sep 14" 3.7:1, "5 weeks of readings" 4.45:1).
8. **The lift Performance screen has the most failures** (82 on phone): column headers and exercise tags at
   11 px / 45% (4.0:1) and "· Sep 14" at 30% (2.5:1). Its set table also runs text into the next column at 390 px
   ("2-4 reps (RIR 2 reps (RIR 2)") — a layout fault, not contrast.
9. **Desktop is the phone layout stretched to 1440 px.** On State the LOAD label sits at the left edge and its
   numbers at the right edge, ~1,400 px apart; Performance cards run the full width.
10. **200% zoom (1.4.4), measured at 195 px and 720 px wide:** desktop keeps everything. Phone clips the State tab
    labels ("Adjust", "Schedul…"), the bottom bar ("HOME", "STATE", the eye icon) and Today's date line.
11. **The phone's text-size setting (Dynamic Type) is ignored.** Every size is written in fixed pixels; `html` sets
    `-webkit-text-size-adjust: 100%`. I grepped `src`, `index.html`, `ios/App/App/*.swift` and `capacitor.config.ts`
    for `apple-system-body`, `TextZoom`, `text-zoom` and `preferredContentSize` and found none.
12. **The logger's number boxes render in a font the app does not ship.** Their computed family is `Inter`
    (tailwind's `font-sans`); Inter is not among the loaded fonts, so the phone draws them in its fallback font.

## 4. The count (measured, plus a source count)

**On screen** (phone): **17 sizes** — 10, 10.5, 11, 11.5, 11.52, 12, 12.5, 13, 13.12, 14, 15, 16, 17, 18, 20, 24,
26 — **4 weights** (300, 400, 500, 600), **24 opacity levels of white** (30, 35, 38, 40, 43, 45, 50, 55, 59, 60, 62,
65, 70, 72, 77, 80, 82, 85, 86, 88, 90, 92, 95, 100%), **4 families** (Space Grotesk; IBM Plex Mono for the bottom
bar; Rajdhani for the logo; Inter-with-fallback in the logger).

**In the source** (`src/**/*.tsx`, grep): 30 distinct fixed sizes (`text-[13px]` ×222, `[12px]` ×197, `[11px]` ×140,
`[15px]` ×47, `[14px]` ×41, `[10px]` ×40, … down to `[8px]` ×3 and `[0.62rem]`) plus 8 named sizes (`text-sm` ×669,
`text-xs` ×542, …); 5 weights (`font-medium` ×336, `font-light` ×324, `font-semibold` ×212, `font-normal` ×50,
`font-bold` ×30); 20 white opacity steps (`/60` ×216, `/50` ×206, `/70` ×197, `/90` ×185, `/40` ×165, `/55` ×134 …).

**Shorthand a reader has to decode** (every one seen on screen this session):

| where | text on screen |
|---|---|
| State LOAD | `fitness 50 +5 · 6 wk · fatigue 75 -11 · 7 d · form −36 · high risk` |
| State BODY | `effort 7.0 of 10 · usual 7.0 · 28 d` · `logged 3 sessions · as of Sep 17` |
| State bike row | `needs data · 5/4 planned` |
| State strength | `e1RM · +5`, `e1RM · +10`, `all-out 290 lb × 6`, `over 5 weeks: 199 lb → 203 lb`, `work sets · up to three days` |
| State run/swim | `swims none last 8wk`, `+6.4–+6.4%`, `dots: one run, pace ÷ heart rate · dashed: the trend` |
| State title | `WK 6`, `Run + Ride + Strength · Week 6 of 12.` |
| Adjust | `205 lb · auto`, `146 bpm · auto`, `210 W · your number` |
| Today | `effort 7.0 of 10 · last 7 days`, `· week 6 of 12`, `22.5 mi · 1:14:40`, `7,450 lb · 8 lifts` |
| Planned sheet | `Back Squat · 1 × 1-5 · 245 lb`, `3 × 6-12 · By feel`, run length `109:00` (minutes as a clock) |
| Logger | `ME · 1-5 reps, stop short of failure.`, `HYP · 6-12 reps · 1 in reserve`, `SKILL · 3-5 reps · 3 to 4 in reserve`, column head `RIR` |
| Performance (lift) | `1 reps (RIR 2)`, `2-4 reps (RIR 3.5)`, `4×2-4 · by feel`, `Vol: 175 lb → 175 lb +0 lb`, `2.0 / 3.5 RIR` |
| Performance (ride/run) | `22.5 MI · 1:14:40`, `10.1 MI · 1:29:40 · 56 → 57°F`, `8:50/mi · raw 8:53/mi`, `line 5%`, `Work intervals: 139W → 139W` |

## 5. Proposal — one scale, three levels (sizes read; opacities and scrim ours)

**Six sizes, three weights.** Every size is an Apple iOS text style; the Material 3 neighbour is given for desktop.

| step | px | weight | Apple (iOS pt) | Material 3 | used for |
|---|---|---|---|---|---|
| 1 | 28 | 600 | Title 1 28 | headline-medium 28 | the one headline number on a card |
| 2 | 20 | 600 | Title 3 20 | title-large 22 | screen and card titles |
| 3 | 17 | 400 / 500 | Body 17, Headline 17 | body-large 16 | sentences; secondary numbers |
| 4 | 15 | 400 | Subhead 15 | body-medium 14 | data rows, list values |
| 5 | 13 | 500 | Footnote 13 | label-large 14 | labels |
| 6 | 12 | 400 | Caption 1 12 | body-small / label-medium 12 | detail — **the floor** |

- **Weights: 400, 500, 600.** Light (300) comes out — Apple's page names it as hard to read when small; it is on
  99 lines on the phone screens today, 61 of them under 14 px. Bold 700 is not needed.
- **Minimum size 12 px** on every screen. Nothing at 10, 10.5, 11 or 11.5 (132 lines are under Apple's 11 today).

**Three levels of text colour** — collapse the 24 opacities to three (**ours**: the three values are the lowest
that clear 4.5:1 on the backgrounds measured, see the next point):

| level | colour | size / weight | existing token it replaces |
|---|---|---|---|
| headline number | white 92% | 28 / 600 (or 17 / 500 beneath it) | `--text-primary` #e8e8e8 |
| label | white 72% | 13 / 500 | `--muted-foreground` (65%) |
| detail | white 60% | 12–15 / 400 | `--text-secondary` #9a9a9a |

**Contrast floor: 4.5:1 against the worst patch of the real rendered background** — the method in section 2, run
as a check. Worked backwards from the measured backgrounds: white 60% clears 4.5:1 on any background at or
darker than #4b3c27 (the LOAD card's glow); the bottom bar (#6c5429) needs 71% and the Today hint pill (#765b63) 79%.

**Where text needs a calmer background:** any text over a patch lighter than about #4b3c27 (relative luminance
0.05, **ours**, it is the patch where 60% white stops passing). Measured places: the bottom bar, the "Tap a session
to open it" pill, the Today date card, the top of the LOAD card, the done-session cards on Today. The fix is a
dark layer under the text (the mock uses black at 30%, **ours**) — the glow stays at the card's edges and top
bleed, it just does not pass behind words.

**Sport and status colours as text** get a text shade that clears 4.5:1: "high risk" coral #c4645f → #d07e79
(measured 5.05:1 in the mock). Gold and green already pass at full strength; they fail today only because they are
drawn at 72% / 43% / 55%. Done-session titles: full colour, not faded.

**Keep:** dark instrument, sport-colour bleed from the top, dot grid, Space Grotesk, lowercase "efforts".
The bottom bar keeps IBM Plex Mono.

**Also in the proposal (read or measured; not built):**
- Desktop: hold content to one readable column rather than 1440 px wide. WCAG 1.4.8 (AAA) asks for lines of no
  more than 80 characters; at 15 px Space Grotesk that is roughly 640 px (**inferring** from the measured glyph widths, not measured).
- Phone text size: sizes in `rem` off one root size, and the root follows the phone's text-size setting — in the
  iOS web view `font: -apple-system-body` on `html` does this, or Capacitor's text-zoom plugin. **Not tried this session.**
- Shorthand: each `·` run becomes words or its own line; windows written out (`6 wk` → `6 weeks`, `7 d` → `7 days`,
  `109:00` → `1h 49m`), and the week's changes (`+5`, `-11`) leave the card. **Every one of these is a copy change
  and needs Michael's yes before it ships.**

## 6. The State LOAD card, before and after (measured, in the preview)

The mock was a throwaway branch inside the LOAD card, drawn only with `?mock=load`, in the separate checkout.
It used the same words the server sends — no new copy. **It has been deleted** (the checkout's `LoadBar.tsx` is back
to 5fea9a8d byte for byte).

| | before | after |
|---|---|---|
| layout | `This week` line, then `LOAD ⓘ`, then one wrapped row: `fitness 50 +5 · 6 wk · fatigue 75 -11 · 7 d`, `form −36 · high risk` | `LOAD ⓘ`; **form −36** as the headline with "high risk" beside it; fitness 50 and fatigue 75 side by side beneath, each with its window under it; `This week` line; Garmin line |
| sizes on the card | 6 (10.5, 11, 12, 12.5, 13, 14) | 5 (12, 13, 15, 17, 28) |
| weights | 300, 400, 600 | 400, 500, 600 |
| weekly changes (`+5`, `-11`) | on the card | off the card |
| text runs failing 4.5:1 | **11 of 20** | **0 of 15** |
| worst line | the `·` separators, 2.55:1 | "high risk", 5.05:1 |
| background | glow behind the text | the same plate with a black 30% layer inside the card |

Screenshots (phone 390 px; kept out of git in `test-outputs/type-audit-2026-09-18/`, which `.gitignore` covers):
`load-before.png`, `load-after.png`, and the full screens `load-before-screen.png`, `load-after-screen.png`.
Also there: one shot per measured screen (`p-*` phone, `d-*` desktop), the 200% zoom shots (`zoom-*`), and the raw
measurements `measure.jsonl` (every text run, both contrast numbers) and `load-mock.jsonl`.

One thing the mock shows: with form as the card's headline, State's title block directly above it already prints
`Form −36 · high risk` at 14 px — the same number twice, 60 px apart.

## 7. Seen while measuring, not pursued

- The deployed State call (`coach`) returned 500 "canceling statement due to statement timeout" three times in a
  row on this account, then loaded on the next try; State showed "Edge Function returned a non-2xx status code"
  meanwhile. It happened five or six times over the session.

## Appendix — the tables

### Phone 390 px — every failing style (78 of 291)

| screen | element (example text) | size / weight | text colour on sampled background | contrast (worst 10%) | WCAG 1.4.3 |
|---|---|---|---|---|---|
| Today | · | 13 px / 300 | white 38% on #322b2f | 3.29 : 1 | **fails** (needs 4.5) |
| Today | State / + | 14 px / 500 | white 65% on #6c5466 | 3.61 : 1 | **fails** (needs 4.5) |
| Today | Tap a session to open it. | 14 px / 400 | white 85% on #765b63 | 4.02 : 1 | **fails** (needs 4.5) |
| Today | optimal | 13 px / 300 | #6fa287 100% on #372f33 | 4.24 : 1 | **fails** (needs 4.5) |
| Today | · week 6 of 12 | 13.12 px / 300 | #ffd700 72% on #433c3e | 4.36 : 1 | **fails** (needs 4.5) |
| Today | Run + Ride + Strength | 11.52 px / 300 | #ffd700 72% on #453d3f | 4.47 : 1 | **fails** (needs 4.5) |
| Today | Home | 14 px / 500 | white 77% on #70582d | 4.48 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Upper body: Pull | 17 px / 600 | #ff8c42 43% on #38221a | 2.18 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Ride | 20 px / 600 | #50c878 55% on #4c2e15 | 2.63 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Garmin Forerunner 965 | 12 px / 300 | #007cc3 100% on #40271a | 2.82 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | · | 13 px / 300 | white 38% on #2f282e | 3.35 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | State / + | 14 px / 500 | white 65% on #6c5466 | 3.61 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Tap a session to open it. | 14 px / 400 | white 85% on #696167 | 3.95 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | ✓ | 13 px / 400 | white 45% on #2d2a3c | 4.01 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | optimal | 13 px / 300 | #6fa287 100% on #352d31 | 4.38 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Run + Ride + Strength | 11.52 px / 300 | #ffd700 72% on #443d3f | 4.47 : 1 | **fails** (needs 4.5) |
| Planned-session sheet (lift) | Skip session… | 13 px / 300 | white 45% on #010101 | 4.42 : 1 | **fails** (needs 4.5) |
| Planned-session sheet (run) | Skip session… | 13 px / 300 | white 45% on #010101 | 4.42 : 1 | **fails** (needs 4.5) |
| Strength logger | State / + | 14 px / 500 | white 65% on #6a5164 | 3.65 : 1 | **fails** (needs 4.5) |
| Strength logger | — | 12 px / 400 | white 40% on #150e19 | 3.73 : 1 | **fails** (needs 4.5) |
| Strength logger | Warm-up | 11 px / 600 | #ff8c42 80% on #422820 | 4.17 : 1 | **fails** (needs 4.5) |
| Strength logger | 1-5 / 6-12 / 3-5 | 17 px / 400 | white 50% on #0c091b | 4.28 : 1 | **fails** (needs 4.5) |
| Performance (ride) | Home / State / + | 14 px / 500 | white 65% on #6b5229 | 3.65 : 1 | **fails** (needs 4.5) |
| Performance (ride) | not done | 13 px / 500 | white 40% on #070816 | 3.74 : 1 | **fails** (needs 4.5) |
| Performance (ride) | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #28252d | 4.16 : 1 | **fails** (needs 4.5) |
| Performance (ride) | Garmin Forerunner 965 | 14 px / 300 | #007cc3 100% on #0e0e08 | 4.18 : 1 | **fails** (needs 4.5) |
| Performance (ride) | View | 12 px / 300 | #007cc3 100% on #0c1112 | 4.19 : 1 | **fails** (needs 4.5) |
| Performance (ride) | Intensity / Pacing / TERRAIN | 11 px / 400 | white 45% on #27211e | 4.19 : 1 | **fails** (needs 4.5) |
| Performance (run) | Home / State / + | 14 px / 500 | white 65% on #6b5227 | 3.67 : 1 | **fails** (needs 4.5) |
| Performance (run) | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #2c2a2e | 4.00 : 1 | **fails** (needs 4.5) |
| Performance (run) | View | 12 px / 300 | #007cc3 100% on #14120d | 4.11 : 1 | **fails** (needs 4.5) |
| Performance (run) | Garmin Forerunner 965 | 14 px / 300 | #007cc3 100% on #140f05 | 4.12 : 1 | **fails** (needs 4.5) |
| Performance (run) | Grade-adjusted pace / Pacing / TERRAIN | 11 px / 400 | white 45% on #272120 | 4.24 : 1 | **fails** (needs 4.5) |
| Performance (lift) | · Sep 14 / · Sep 10 | 11 px / 400 | white 30% on #312e30 | 2.54 : 1 | **fails** (needs 4.5) |
| Performance (lift) | / | 13 px / 400 | white 40% on #47392e | 3.17 : 1 | **fails** (needs 4.5) |
| Performance (lift) | → / RIR | 12 px / 400 | white 40% on #262735 | 3.29 : 1 | **fails** (needs 4.5) |
| Performance (lift) | Home / State / + | 14 px / 500 | white 65% on #6c5329 | 3.65 : 1 | **fails** (needs 4.5) |
| Performance (lift) | Maximal effort / Set / Previous | 11 px / 400 | white 45% on #332e2c | 3.98 : 1 | **fails** (needs 4.5) |
| Performance (lift) | Planned | 12 px / 400 | white 45% on #2c2b31 | 4.03 : 1 | **fails** (needs 4.5) |
| State · Status | · | 11 px / 400 | white 30% on #0d0a10 | 2.55 : 1 | **fails** (needs 4.5) |
| State · Status | fitness / · 6 wk / fatigue | 11 px / 400 | white 45% on #130e14 | 3.51 : 1 | **fails** (needs 4.5) |
| State · Status | Today | 12 px / 400 | white 40% on #060605 | 3.71 : 1 | **fails** (needs 4.5) |
| State · Status | Home / + | 14 px / 500 | white 65% on #6c5429 | 3.79 : 1 | **fails** (needs 4.5) |
| State · Status | ⓘ | 12 px / 400 | white 45% on #281f1c | 4.23 : 1 | **fails** (needs 4.5) |
| State · Status | State | 14 px / 500 | white 77% on #6f5869 | 4.23 : 1 | **fails** (needs 4.5) |
| State · Status | +4 / -9 | 10.5 px / 400 | white 45% on #1c151b | 4.35 : 1 | **fails** (needs 4.5) |
| State · Status | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #0b0918 | 4.47 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | · | 11 px / 400 | white 30% on #0d0a10 | 2.55 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | 200–205 lb / 330–340 lb / 280–290 lb | 10 px / 400 | white 30% on #110e22 | 2.61 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | fitness / · 6 wk / fatigue | 11 px / 400 | white 45% on #130e14 | 3.51 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | Today | 12 px / 400 | white 40% on #060605 | 3.71 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | as of Sep 14 / as of Sep 15 / as of Sep 11 | 10 px / 400 | white 40% on #221924 | 3.72 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | Sep 6 | 11 px / 400 | white 40% on #201720 | 3.77 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | Home / + | 14 px / 500 | white 65% on #6c5429 | 3.79 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | ⓘ / · 3 lifts | 12 px / 400 | white 45% on #281f1c | 4.23 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | · 5/4 planned | 13 px / 400 | white 55% on #46403b | 4.25 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | +4 / -9 | 10.5 px / 400 | white 45% on #1c151b | 4.35 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | 5 weeks of readings / 4 weeks of readings | 10 px / 400 | white 45% on #0b0a10 | 4.45 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #0b0918 | 4.47 : 1 | **fails** (needs 4.5) |
| State · form key | · | 11 px / 400 | white 30% on #332718 | 2.46 : 1 | **fails** (needs 4.5) |
| State · form key | high risk | 11 px / 400 | #c4645f 100% on #393029 | 3.10 : 1 | **fails** (needs 4.5) |
| State · form key | ⓘ | 12 px / 400 | white 45% on #453724 | 3.60 : 1 | **fails** (needs 4.5) |
| State · form key | fitness / · 6 wk / fatigue | 11 px / 400 | white 45% on #3b2e1d | 3.69 : 1 | **fails** (needs 4.5) |
| State · form key | +4 / -9 | 10.5 px / 400 | white 45% on #403528 | 3.69 : 1 | **fails** (needs 4.5) |
| State · form key | Today | 12 px / 400 | white 40% on #060605 | 3.71 : 1 | **fails** (needs 4.5) |
| State · form key | Home / + | 14 px / 500 | white 65% on #6c5429 | 3.79 : 1 | **fails** (needs 4.5) |
| State · form key | This week | 12.5 px / 400 | white 55% on #483a24 | 4.38 : 1 | **fails** (needs 4.5) |
| State · form key | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #0b0a19 | 4.46 : 1 | **fails** (needs 4.5) |
| State · Adjust | no number yet | 14 px / 400 | white 35% on #0c091b | 3.10 : 1 | **fails** (needs 4.5) |
| State · Adjust | Today | 12 px / 400 | white 40% on #060605 | 3.71 : 1 | **fails** (needs 4.5) |
| State · Adjust | Home / + | 14 px / 500 | white 65% on #6c5429 | 3.79 : 1 | **fails** (needs 4.5) |
| State · Adjust | ⓘ | 12 px / 400 | white 45% on #181628 | 4.19 : 1 | **fails** (needs 4.5) |
| State · Adjust | from your lifts, 6 sessions / from your lifts, 7 sessions /  | 12 px / 400 | white 50% on #1d1a2a | 4.30 : 1 | **fails** (needs 4.5) |
| State · Adjust | reorder | 11 px / 400 | white 45% on #030506 | 4.44 : 1 | **fails** (needs 4.5) |
| State · Adjust | tap to add | 14 px / 400 | white 45% on #1c1714 | 4.46 : 1 | **fails** (needs 4.5) |
| State · Schedule | Today | 12 px / 400 | white 40% on #060605 | 3.71 : 1 | **fails** (needs 4.5) |
| State · Schedule | Schedule — rearrange your week: drag a s | 13 px / 400 | white 40% on #090a0a | 3.73 : 1 | **fails** (needs 4.5) |
| State · Schedule | Home / + | 14 px / 500 | white 65% on #6c5429 | 3.79 : 1 | **fails** (needs 4.5) |

### Desktop 1440 px — every failing style (61 of 294)

| screen | element (example text) | size / weight | text colour on sampled background | contrast (worst 10%) | WCAG 1.4.3 |
|---|---|---|---|---|---|
| Today | · | 13 px / 300 | white 38% on #141417 | 3.58 : 1 | **fails** (needs 4.5) |
| Today | State / + | 14 px / 500 | white 65% on #624759 | 4.35 : 1 | **fails** (needs 4.5) |
| Today | · week 6 of 12 | 13.12 px / 300 | #ffd700 72% on #443d3f | 4.37 : 1 | **fails** (needs 4.5) |
| Today | Run + Ride + Strength | 11.52 px / 300 | #ffd700 72% on #453d3f | 4.47 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Upper body: Pull | 17 px / 600 | #ff8c42 43% on #2a1810 | 2.32 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Ride | 20 px / 600 | #50c878 55% on #422811 | 2.82 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Garmin Forerunner 965 | 12 px / 300 | #007cc3 100% on #361f11 | 3.18 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | · | 13 px / 300 | white 38% on #141416 | 3.58 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | ✓ | 13 px / 400 | white 45% on #2b263a | 4.09 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | State / + | 14 px / 500 | white 65% on #624759 | 4.35 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Run + Ride + Strength | 11.52 px / 300 | #ffd700 72% on #453d3f | 4.47 : 1 | **fails** (needs 4.5) |
| Planned-session sheet (lift) | Skip session… | 13 px / 300 | white 45% on #010101 | 4.42 : 1 | **fails** (needs 4.5) |
| Planned-session sheet (run) | Skip session… | 13 px / 300 | white 45% on #010101 | 4.42 : 1 | **fails** (needs 4.5) |
| Strength logger | State / + | 14 px / 500 | white 65% on #5f4457 | 4.45 : 1 | **fails** (needs 4.5) |
| Performance (ride) | not done | 13 px / 500 | white 40% on #060816 | 3.74 : 1 | **fails** (needs 4.5) |
| Performance (ride) | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #2c2521 | 4.17 : 1 | **fails** (needs 4.5) |
| Performance (ride) | Intensity / Pacing / TERRAIN | 11 px / 400 | white 45% on #221d19 | 4.39 : 1 | **fails** (needs 4.5) |
| Performance (ride) | Home / State / + | 14 px / 500 | white 65% on #3f3720 | 4.46 : 1 | **fails** (needs 4.5) |
| Performance (run) | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #322b23 | 4.01 : 1 | **fails** (needs 4.5) |
| Performance (run) | Grade-adjusted pace / Pacing / TERRAIN | 11 px / 400 | white 45% on #1f1a19 | 4.41 : 1 | **fails** (needs 4.5) |
| Performance (run) | Home / State / + | 14 px / 500 | white 65% on #3d361e | 4.47 : 1 | **fails** (needs 4.5) |
| Performance (run) | View | 12 px / 300 | #007cc3 100% on #070600 | 4.48 : 1 | **fails** (needs 4.5) |
| Performance (lift) | · Sep 14 / · Sep 10 | 11 px / 400 | white 30% on #332d28 | 2.49 : 1 | **fails** (needs 4.5) |
| Performance (lift) | / | 13 px / 400 | white 40% on #43352d | 3.26 : 1 | **fails** (needs 4.5) |
| Performance (lift) | → / RIR | 12 px / 400 | white 40% on #212134 | 3.29 : 1 | **fails** (needs 4.5) |
| Performance (lift) | Maximal effort / Set / Previous | 11 px / 400 | white 45% on #302820 | 4.04 : 1 | **fails** (needs 4.5) |
| Performance (lift) | Planned | 12 px / 400 | white 45% on #322a22 | 4.08 : 1 | **fails** (needs 4.5) |
| Performance (lift) | Home / State / + | 14 px / 500 | white 65% on #3f3720 | 4.46 : 1 | **fails** (needs 4.5) |
| State · Status | · | 11 px / 400 | white 30% on #111427 | 2.58 : 1 | **fails** (needs 4.5) |
| State · Status | fitness / · 6 wk / fatigue | 11 px / 400 | white 45% on #0f1426 | 3.70 : 1 | **fails** (needs 4.5) |
| State · Status | Today | 12 px / 400 | white 40% on #050503 | 3.71 : 1 | **fails** (needs 4.5) |
| State · Status | +3 / -15 | 10.5 px / 400 | white 45% on #0d1225 | 4.45 : 1 | **fails** (needs 4.5) |
| State · Status | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #080712 | 4.46 : 1 | **fails** (needs 4.5) |
| State · Status | ⓘ | 12 px / 400 | white 45% on #0d0a10 | 4.49 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | · | 11 px / 400 | white 30% on #111427 | 2.58 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | 200–205 lb / 330–340 lb / 280–290 lb | 10 px / 400 | white 30% on #0c0a1a | 2.58 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | fitness / · 6 wk / fatigue | 11 px / 400 | white 45% on #0f1426 | 3.70 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | Today | 12 px / 400 | white 40% on #050503 | 3.71 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | as of Sep 14 / as of Sep 15 / as of Sep 11 | 10 px / 400 | white 40% on #23181e | 3.74 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | Sep 6 | 11 px / 400 | white 40% on #140d12 | 3.79 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | +3 / -15 | 10.5 px / 400 | white 45% on #0d1225 | 4.45 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | 5 weeks of readings / 4 weeks of readings | 10 px / 400 | white 45% on #070509 | 4.45 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #080712 | 4.46 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | · 5/4 planned | 13 px / 400 | white 55% on #483922 | 4.48 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | ⓘ / · 3 lifts | 12 px / 400 | white 45% on #0d0a10 | 4.49 : 1 | **fails** (needs 4.5) |
| State · form key | · | 11 px / 400 | white 30% on #30374a | 2.47 : 1 | **fails** (needs 4.5) |
| State · form key | high risk | 11 px / 400 | #c4645f 100% on #252d49 | 3.34 : 1 | **fails** (needs 4.5) |
| State · form key | Today | 12 px / 400 | white 40% on #050503 | 3.71 : 1 | **fails** (needs 4.5) |
| State · form key | fitness / · 6 wk / fatigue | 11 px / 400 | white 45% on #2e364a | 3.72 : 1 | **fails** (needs 4.5) |
| State · form key | +3 / -15 | 10.5 px / 400 | white 45% on #2c354b | 3.76 : 1 | **fails** (needs 4.5) |
| State · form key | ⓘ | 12 px / 400 | white 45% on #392d1a | 3.93 : 1 | **fails** (needs 4.5) |
| State · form key | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #050611 | 4.44 : 1 | **fails** (needs 4.5) |
| State · form key | · 5/4 planned | 13 px / 400 | white 55% on #483922 | 4.49 : 1 | **fails** (needs 4.5) |
| State · Adjust | no number yet | 14 px / 400 | white 35% on #0d091c | 3.13 : 1 | **fails** (needs 4.5) |
| State · Adjust | Today | 12 px / 400 | white 40% on #050503 | 3.71 : 1 | **fails** (needs 4.5) |
| State · Adjust | ⓘ | 12 px / 400 | white 45% on #201e2e | 3.89 : 1 | **fails** (needs 4.5) |
| State · Adjust | from your lifts, 6 sessions / from your lifts, 7 sessions /  | 12 px / 400 | white 50% on #282535 | 4.38 : 1 | **fails** (needs 4.5) |
| State · Adjust | reorder | 11 px / 400 | white 45% on #020404 | 4.43 : 1 | **fails** (needs 4.5) |
| State · Adjust | tap to add | 14 px / 400 | white 45% on #1b1712 | 4.47 : 1 | **fails** (needs 4.5) |
| State · Schedule | Today | 12 px / 400 | white 40% on #050503 | 3.71 : 1 | **fails** (needs 4.5) |
| State · Schedule | Schedule — rearrange your week: drag a s | 13 px / 400 | white 40% on #0b0c0c | 3.78 : 1 | **fails** (needs 4.5) |

### Phone 390 px — every distinct text style (291)

| screen | element (example text) | size / weight | text colour on sampled background | contrast (worst 10%) | WCAG 1.4.3 |
|---|---|---|---|---|---|
| Today | Run + Ride + Strength | 11.52 px / 300 | #ffd700 72% on #453d3f | 4.47 : 1 | **fails** (needs 4.5) |
| Today | Maximal effort / Hypertrophy superset / Skill | 12 px / 400 | #ff8c42 100% on #323239 | 5.25 : 1 | passes (needs 4.5) |
| Today | Insights derived in part from Garmin dev | 12 px / 300 | white 60% on #2a2627 | 6.07 : 1 | passes (needs 4.5) |
| Today | · | 13 px / 300 | white 38% on #322b2f | 3.29 : 1 | **fails** (needs 4.5) |
| Today | optimal | 13 px / 300 | #6fa287 100% on #372f33 | 4.24 : 1 | **fails** (needs 4.5) |
| Today | 25–40 min / 245 lb / By feel | 13 px / 400 | white 62% on #293149 | 5.71 : 1 | passes (needs 4.5) |
| Today | form / ⓘ / effort 7.0 of 10 · last 7 days | 13 px / 300 | white 60% on #272027 | 6.09 : 1 | passes (needs 4.5) |
| Today | 2 more | 13 px / 400 | white 55% on #050510 | 6.26 : 1 | passes (needs 4.5) |
| Today | Week | 13 px / 300 | #9ca3af 100% on #151718 | 6.96 : 1 | passes (needs 4.5) |
| Today | Today | 13 px / 300 | white 100% on #22221f | 15.74 : 1 | passes (needs 4.5) |
| Today | · week 6 of 12 | 13.12 px / 300 | #ffd700 72% on #433c3e | 4.36 : 1 | **fails** (needs 4.5) |
| Today | Fri, Sep 18 | 13.12 px / 300 | white 100% on #463e3f | 9.65 : 1 | passes (needs 4.5) |
| Today | State / + | 14 px / 500 | white 65% on #6c5466 | 3.61 : 1 | **fails** (needs 4.5) |
| Today | Tap a session to open it. | 14 px / 400 | white 85% on #765b63 | 4.02 : 1 | **fails** (needs 4.5) |
| Today | Home | 14 px / 500 | white 77% on #70582d | 4.48 : 1 | **fails** (needs 4.5) |
| Today | 1 to 5 reps, stop short of failure. / 8 to 12 reps, 1 to 2 i | 14 px / 400 | white 72% on #2a262b | 7.85 : 1 | passes (needs 4.5) |
| Today | −16 / 69.3 mi / 29,355 lb | 15 px / 300 | white 92% on #2f282d | 11.86 : 1 | passes (needs 4.5) |
| Today | Back Squat / Ground-based Deadlift Machine + Leg Pres / Reve | 16 px / 500 | white 95% on #362c21 | 11.40 : 1 | passes (needs 4.5) |
| Today | Lower body: Push | 20 px / 600 | #ff8c42 100% on #413930 | 4.64 : 1 | passes (needs 4.5) |
| Today (done sessions) | Run + Ride + Strength · week 6 of 12 | 11 px / 400 | #ece9e3 85% on #1a141f | 10.47 : 1 | passes (needs 4.5) |
| Today (done sessions) | Run + Ride + Strength | 11.52 px / 300 | #ffd700 72% on #443d3f | 4.47 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Garmin Forerunner 965 | 12 px / 300 | #007cc3 100% on #40271a | 2.82 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Insights derived in part from Garmin dev | 12 px / 300 | white 60% on #292526 | 6.12 : 1 | passes (needs 4.5) |
| Today (done sessions) | 14 of 17 intervals done / of plan / line 5% | 12 px / 400 | white 59% on #080714 | 7.11 : 1 | passes (needs 4.5) |
| Today (done sessions) | Execution / Duration / Drift | 12 px / 400 | #ece9e3 85% on #0b0915 | 11.67 : 1 | passes (needs 4.5) |
| Today (done sessions) | · | 13 px / 300 | white 38% on #2f282e | 3.35 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | ✓ | 13 px / 400 | white 45% on #2d2a3c | 4.01 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | optimal | 13 px / 300 | #6fa287 100% on #352d31 | 4.38 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | form / effort 7.0 of 10 · last 7 days / ride | 13 px / 300 | white 60% on #272027 | 6.09 : 1 | passes (needs 4.5) |
| Today (done sessions) | Week | 13 px / 300 | #9ca3af 100% on #151718 | 6.96 : 1 | passes (needs 4.5) |
| Today (done sessions) | Today | 13 px / 300 | white 100% on #22221f | 15.74 : 1 | passes (needs 4.5) |
| Today (done sessions) | · week 6 of 12 | 13.12 px / 300 | #ffd700 72% on #3c3539 | 4.54 : 1 | passes (needs 4.5) |
| Today (done sessions) | Yesterday, Sep 17 | 13.12 px / 300 | white 100% on #443e40 | 9.54 : 1 | passes (needs 4.5) |
| Today (done sessions) | State / + | 14 px / 500 | white 65% on #6c5466 | 3.61 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Tap a session to open it. | 14 px / 400 | white 85% on #696167 | 3.95 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Home | 14 px / 500 | white 86% on #715a30 | 5.00 : 1 | passes (needs 4.5) |
| Today (done sessions) | 89 % / 75 of 85 min / 0.2% | 14 px / 400 | #ece9e3 85% on #0e0a16 | 11.49 : 1 | passes (needs 4.5) |
| Today (done sessions) | 22.5 mi · 1:14:40 / 7,450 lb · 8 lifts | 15 px / 400 | white 62% on #2d1a18 | 6.67 : 1 | passes (needs 4.5) |
| Today (done sessions) | −27 / 69.3 mi / 29,355 lb | 15 px / 300 | white 92% on #2c252b | 12.37 : 1 | passes (needs 4.5) |
| Today (done sessions) | Upper body: Pull | 17 px / 600 | #ff8c42 43% on #38221a | 2.18 : 1 | **fails** (needs 4.5) |
| Today (done sessions) | Ride | 20 px / 600 | #50c878 55% on #4c2e15 | 2.63 : 1 | **fails** (needs 4.5) |
| Planned-session sheet (lift) | Maximal effort / Hypertrophy / Skill | 11 px / 300 | white 55% on #030202 | 6.26 : 1 | passes (needs 4.5) |
| Planned-session sheet (lift) | 25–40 min | 12 px / 300 | white 70% on #020202 | 9.90 : 1 | passes (needs 4.5) |
| Planned-session sheet (lift) | Skip session… | 13 px / 300 | white 45% on #010101 | 4.42 : 1 | **fails** (needs 4.5) |
| Planned-session sheet (lift) | Back Squat · 1 × 1-5 · 245 lb / Ground-based Deadlift Machin | 14 px / 300 | #e5e7eb 100% on #020202 | 16.74 : 1 | passes (needs 4.5) |
| Planned-session sheet (lift) | Lower body: Push | 16 px / 500 | #ff8c42 100% on #030302 | 8.92 : 1 | passes (needs 4.5) |
| Planned-session sheet (lift) | Go to workout / Mark as Complete / Close | 16 px / 500 | white 100% on #241b15 | 13.91 : 1 | passes (needs 4.5) |
| Planned-session sheet (run) | 109:00 | 12 px / 300 | white 70% on #020202 | 9.91 : 1 | passes (needs 4.5) |
| Planned-session sheet (run) | Skip session… | 13 px / 300 | white 45% on #010101 | 4.42 : 1 | **fails** (needs 4.5) |
| Planned-session sheet (run) | Easy the whole way. Stopping for a bit i | 14 px / 300 | white 60% on #020202 | 7.36 : 1 | passes (needs 4.5) |
| Planned-session sheet (run) | Easy the whole way. Stopping for a bit i | 14 px / 400 | #a6a6a6 100% on #020202 | 8.52 : 1 | passes (needs 4.5) |
| Planned-session sheet (run) | 1:39:00 @ HR 143–150 / 10:00 / Easy enough to talk in full s | 14 px / 300 | #e5e7eb 100% on #020202 | 16.76 : 1 | passes (needs 4.5) |
| Planned-session sheet (run) | Swap sport | 16 px / 500 | white 85% on #14130c | 13.33 : 1 | passes (needs 4.5) |
| Planned-session sheet (run) | Long Run | 16 px / 500 | #ffd700 100% on #020202 | 14.79 : 1 | passes (needs 4.5) |
| Planned-session sheet (run) | Mark as Complete / Close | 16 px / 500 | white 100% on #000000 | 21.00 : 1 | passes (needs 4.5) |
| Strength logger | Set / Previous / Lb | 10 px / 600 | white 88% on #3d261c | 9.69 : 1 | passes (needs 4.5) |
| Strength logger | Warm-up | 11 px / 600 | #ff8c42 80% on #422820 | 4.17 : 1 | **fails** (needs 4.5) |
| Strength logger | Superset · Ground-based Deadlift Machine | 11 px / 400 | white 55% on #050506 | 6.26 : 1 | passes (needs 4.5) |
| Strength logger | Working sets | 11 px / 600 | #ff8c42 100% on #080718 | 8.58 : 1 | passes (needs 4.5) |
| Strength logger | — | 12 px / 400 | white 40% on #150e19 | 3.73 : 1 | **fails** (needs 4.5) |
| Strength logger | Swap / ME · 1-5 reps, stop short of failure. / HYP · 6-12 re | 12 px / 500 | white 70% on #492b28 | 6.51 : 1 | passes (needs 4.5) |
| Strength logger | plates / 45 lb bar | 12 px / 500 | white 82% on #352022 | 10.17 : 1 | passes (needs 4.5) |
| Strength logger | 2026-09-18 / 6 reps / 3 reps | 12 px / 400 | white 90% on #252425 | 12.47 : 1 | passes (needs 4.5) |
| Strength logger | Add Set | 12 px / 500 | white 85% on #131526 | 13.16 : 1 | passes (needs 4.5) |
| Strength logger | Remove exercise | 12 px / 400 | #ebebeb 100% on #181422 | 14.83 : 1 | passes (needs 4.5) |
| Strength logger | 8 to 12 reps, 1 to 2 in reserve. Reps sl | 12 px / 500 | #ebebeb 100% on #050506 | 16.99 : 1 | passes (needs 4.5) |
| Strength logger | 1 / 2 / 3 | 13 px / 400 | white 70% on #2b1b19 | 8.52 : 1 | passes (needs 4.5) |
| Strength logger | ▸ / Start session | 13 px / 500 | white 100% on #3c3836 | 11.42 : 1 | passes (needs 4.5) |
| Strength logger | State / + | 14 px / 500 | white 65% on #6a5164 | 3.65 : 1 | **fails** (needs 4.5) |
| Strength logger | Home | 14 px / 500 | white 86% on #6f572f | 5.06 : 1 | passes (needs 4.5) |
| Strength logger | Pick planned | 14 px / 500 | white 85% on #262626 | 11.17 : 1 | passes (needs 4.5) |
| Strength logger | Tap Done on a set when you finish it. | 14 px / 400 | white 85% on #241c18 | 12.08 : 1 | passes (needs 4.5) |
| Strength logger | Source: Lower body: Push | 14 px / 400 | #ebebeb 100% on #121213 | 15.68 : 1 | passes (needs 4.5) |
| Strength logger | 1 / 3 to 4 | 15 px / 500 | #ff8c42 85% on #221728 | 5.44 : 1 | passes (needs 4.5) |
| Strength logger | Back Squat / Ground-based Deadlift Machine / Leg Press | 16 px / 500 | white 90% on #654434 | 7.20 : 1 | passes (needs 4.5) |
| Strength logger | [placeholder] Add exercise... | 16 px / 400 | white 70% on #1a1a1a | 8.97 : 1 | passes (needs 4.5) |
| Strength logger | Save Workout | 16 px / 500 | white 100% on #472916 | 12.97 : 1 | passes (needs 4.5) |
| Strength logger | 1-5 / 6-12 / 3-5 | 17 px / 400 | white 50% on #0c091b | 4.28 : 1 | **fails** (needs 4.5) |
| Strength logger | 45 / 5 / 135 | 17 px / 400 | white 100% on #3d2423 | 13.47 : 1 | passes (needs 4.5) |
| Strength logger | Log: Lower body: Push | 20 px / 500 | white 90% on #181615 | 14.44 : 1 | passes (needs 4.5) |
| Performance (ride) | under 158 W / bpm / 151-185 W | 10 px / 400 | #9ca3af 100% on #161319 | 6.60 : 1 | passes (needs 4.5) |
| Performance (ride) | Intensity / Pacing / TERRAIN | 11 px / 400 | white 45% on #27211e | 4.19 : 1 | **fails** (needs 4.5) |
| Performance (ride) | 22.5 mi · 1:14:40 | 11 px / 600 | #50c878 100% on #2b2522 | 6.81 : 1 | passes (needs 4.5) |
| Performance (ride) | Run + Ride + Strength · week 6 of 12 | 11 px / 400 | #ece9e3 100% on #2e2c30 | 10.75 : 1 | passes (needs 4.5) |
| Performance (ride) | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #28252d | 4.16 : 1 | **fails** (needs 4.5) |
| Performance (ride) | View | 12 px / 300 | #007cc3 100% on #0c1112 | 4.19 : 1 | **fails** (needs 4.5) |
| Performance (ride) | Share | 12 px / 300 | white 60% on #020403 | 7.34 : 1 | passes (needs 4.5) |
| Performance (ride) | usual 26–54 / 14 of 17 intervals done / of plan | 12 px / 400 | white 70% on #332d2a | 7.39 : 1 | passes (needs 4.5) |
| Performance (ride) | Workload / Execution / Duration | 12 px / 400 | #ece9e3 100% on #332d2a | 10.99 : 1 | passes (needs 4.5) |
| Performance (ride) | not done | 13 px / 500 | white 40% on #070816 | 3.74 : 1 | **fails** (needs 4.5) |
| Performance (ride) | Fri | 13 px / 400 | white 55% on #060916 | 6.25 : 1 | passes (needs 4.5) |
| Performance (ride) | 139 W | 13 px / 500 | #34d399 100% on #1d1c26 | 8.73 : 1 | passes (needs 4.5) |
| Performance (ride) | Normalized power 0W at IF 0.00 — enduran / Work intervals: 1 | 13 px / 400 | white 85% on #252532 | 10.10 : 1 | passes (needs 4.5) |
| Performance (ride) | 6.0 mi / 0.60 mi / 0.89 mi | 13 px / 400 | #ebebeb 100% on #1e1e2d | 10.10 : 1 | passes (needs 4.5) |
| Performance (ride) | 139 W | 13 px / 500 | #7dd3fc 100% on #1a1924 | 10.19 : 1 | passes (needs 4.5) |
| Performance (ride) | Interval 1 / 20:00 / 128 | 13 px / 500 | #ebebeb 100% on #181519 | 11.46 : 1 | passes (needs 4.5) |
| Performance (ride) | Planned / Watts / Dist | 13 px / 500 | #ece9e3 100% on #1c181b | 13.00 : 1 | passes (needs 4.5) |
| Performance (ride) | Home / State / + | 14 px / 500 | white 65% on #6b5229 | 3.65 : 1 | **fails** (needs 4.5) |
| Performance (ride) | Garmin Forerunner 965 | 14 px / 300 | #007cc3 100% on #0e0e08 | 4.18 : 1 | **fails** (needs 4.5) |
| Performance (ride) | Planned / Details | 14 px / 300 | #9ca3af 100% on #0d1711 | 7.14 : 1 | passes (needs 4.5) |
| Performance (ride) | Delete workout | 14 px / 300 | #fca5a5 85% on #050e08 | 7.58 : 1 | passes (needs 4.5) |
| Performance (ride) | via | 14 px / 400 | #9ca3af 100% on #060702 | 7.87 : 1 | passes (needs 4.5) |
| Performance (ride) | Thursday, September 17 | 14 px / 300 | #d1d5db 100% on #060805 | 13.34 : 1 | passes (needs 4.5) |
| Performance (ride) | Unattach | 14 px / 300 | white 90% on #151d1c | 13.62 : 1 | passes (needs 4.5) |
| Performance (ride) | Performance | 14 px / 300 | white 100% on #0f1b13 | 17.55 : 1 | passes (needs 4.5) |
| Performance (ride) | • | 16 px / 400 | #d1d5db 100% on #0e1212 | 12.63 : 1 | passes (needs 4.5) |
| Performance (ride) | Ride — Ride | 16 px / 300 | white 100% on #141103 | 18.21 : 1 | passes (needs 4.5) |
| Performance (ride) | 54 / 89 % / 75 of 85 min | 18 px / 400 | #ece9e3 100% on #342e2a | 10.88 : 1 | passes (needs 4.5) |
| Performance (run) | bpm | 10 px / 400 | #9ca3af 100% on #04040f | 7.87 : 1 | passes (needs 4.5) |
| Performance (run) | Grade-adjusted pace / Pacing / TERRAIN | 11 px / 400 | white 45% on #272120 | 4.24 : 1 | **fails** (needs 4.5) |
| Performance (run) | 10.1 mi · 1:29:40 · 56 → 57°F | 11 px / 600 | #ffd700 100% on #2d2827 | 9.97 : 1 | passes (needs 4.5) |
| Performance (run) | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #2c2a2e | 4.00 : 1 | **fails** (needs 4.5) |
| Performance (run) | View | 12 px / 300 | #007cc3 100% on #14120d | 4.11 : 1 | **fails** (needs 4.5) |
| Performance (run) | Share | 12 px / 300 | white 60% on #050501 | 7.33 : 1 | passes (needs 4.5) |
| Performance (run) | Mon | 13 px / 400 | white 55% on #060916 | 6.25 : 1 | passes (needs 4.5) |
| Performance (run) | 8:48/mi · raw 8:53/mi / Even pacing. Fastest: Mile 6 at 7:19 | 13 px / 400 | white 85% on #27262f | 11.00 : 1 | passes (needs 4.5) |
| Performance (run) | Planned / Pace / Dist | 13 px / 500 | #ece9e3 100% on #070611 | 16.14 : 1 | passes (needs 4.5) |
| Performance (run) | Lap 1 / 9:15/mi / 40:00 | 13 px / 500 | #ebebeb 100% on #06050f | 16.49 : 1 | passes (needs 4.5) |
| Performance (run) | 4.3 mi / 1.5 mi / 4.2 mi | 13 px / 400 | #ebebeb 100% on #070817 | 16.51 : 1 | passes (needs 4.5) |
| Performance (run) | Home / State / + | 14 px / 500 | white 65% on #6b5227 | 3.67 : 1 | **fails** (needs 4.5) |
| Performance (run) | Garmin Forerunner 965 | 14 px / 300 | #007cc3 100% on #140f05 | 4.12 : 1 | **fails** (needs 4.5) |
| Performance (run) | Planned / Details | 14 px / 300 | #9ca3af 100% on #1c1807 | 6.89 : 1 | passes (needs 4.5) |
| Performance (run) | Delete workout | 14 px / 300 | #fca5a5 85% on #120f00 | 7.52 : 1 | passes (needs 4.5) |
| Performance (run) | via | 14 px / 400 | #9ca3af 100% on #090700 | 7.85 : 1 | passes (needs 4.5) |
| Performance (run) | Saturday, September 12 | 14 px / 300 | #d1d5db 100% on #0b0902 | 13.18 : 1 | passes (needs 4.5) |
| Performance (run) | Unattach | 14 px / 300 | white 90% on #191d1a | 13.53 : 1 | passes (needs 4.5) |
| Performance (run) | Performance | 14 px / 300 | white 100% on #211c08 | 16.75 : 1 | passes (needs 4.5) |
| Performance (run) | • | 16 px / 400 | #d1d5db 100% on #16120c | 12.34 : 1 | passes (needs 4.5) |
| Performance (run) | Run — Long Run | 16 px / 300 | white 100% on #191202 | 17.79 : 1 | passes (needs 4.5) |
| Performance (lift) | · Sep 14 / · Sep 10 | 11 px / 400 | white 30% on #312e30 | 2.54 : 1 | **fails** (needs 4.5) |
| Performance (lift) | Maximal effort / Set / Previous | 11 px / 400 | white 45% on #332e2c | 3.98 : 1 | **fails** (needs 4.5) |
| Performance (lift) | edit / Total Sets / Total Reps | 11 px / 400 | white 50% on #1f2030 | 4.93 : 1 | passes (needs 4.5) |
| Performance (lift) | → / RIR | 12 px / 400 | white 40% on #262735 | 3.29 : 1 | **fails** (needs 4.5) |
| Performance (lift) | Planned | 12 px / 400 | white 45% on #2c2b31 | 4.03 : 1 | **fails** (needs 4.5) |
| Performance (lift) | Vol: | 12 px / 400 | white 50% on #282831 | 4.77 : 1 | passes (needs 4.5) |
| Performance (lift) | Strava | 12 px / 300 | #fc5200 90% on #050402 | 5.11 : 1 | passes (needs 4.5) |
| Performance (lift) | · exercises | 12 px / 400 | #9ca3af 100% on #2e2d32 | 5.22 : 1 | passes (needs 4.5) |
| Performance (lift) | Leaving too much in the tank — increase  | 12 px / 400 | #38bdf8 80% on #1e1c27 | 5.27 : 1 | passes (needs 4.5) |
| Performance (lift) | Completed | 12 px / 500 | #ff8c42 100% on #332b23 | 5.84 : 1 | passes (needs 4.5) |
| Performance (lift) | Going too hard — reduce weight or add re | 12 px / 400 | #fbbf24 80% on #29272e | 5.98 : 1 | passes (needs 4.5) |
| Performance (lift) | 175 lb | 12 px / 400 | white 60% on #272834 | 6.17 : 1 | passes (needs 4.5) |
| Performance (lift) | Share | 12 px / 300 | white 60% on #070605 | 7.31 : 1 | passes (needs 4.5) |
| Performance (lift) | 1 total · by feel / 4×2-4 · by feel / 3×6-12 · by feel | 12 px / 400 | white 70% on #262733 | 7.65 : 1 | passes (needs 4.5) |
| Performance (lift) | + 0 lb | 12 px / 400 | #4ade80 100% on #212133 | 8.96 : 1 | passes (needs 4.5) |
| Performance (lift) | 1 of 1 reps / 175 lb / 360 lb | 12 px / 400 | white 80% on #212133 | 10.03 : 1 | passes (needs 4.5) |
| Performance (lift) | / | 13 px / 400 | white 40% on #47392e | 3.17 : 1 | **fails** (needs 4.5) |
| Performance (lift) | 8 reps / 2 reps (RIR 2) / 6 reps (RIR 2) | 13 px / 400 | white 50% on #322c28 | 4.62 : 1 | passes (needs 4.5) |
| Performance (lift) | 3.5 / 1 | 13 px / 600 | white 60% on #46382d | 5.14 : 1 | passes (needs 4.5) |
| Performance (lift) | Fri | 13 px / 400 | white 55% on #060815 | 6.25 : 1 | passes (needs 4.5) |
| Performance (lift) | 1 / 2 / 3 | 13 px / 400 | white 60% on #2e261d | 6.27 : 1 | passes (needs 4.5) |
| Performance (lift) | 2.0 | 13 px / 600 | #fbbf24 100% on #493a2d | 6.39 : 1 | passes (needs 4.5) |
| Performance (lift) | 1 reps (RIR 2) / 2-4 reps (RIR 3.5) / 2 reps (RIR 2) | 13 px / 400 | white 90% on #282933 | 8.96 : 1 | passes (needs 4.5) |
| Performance (lift) | Pull Up / Kroc Row / Chest Supported Row | 13 px / 500 | white 100% on #322a21 | 13.72 : 1 | passes (needs 4.5) |
| Performance (lift) | 2.0 | 13 px / 600 | white 100% on #292a3e | 13.78 : 1 | passes (needs 4.5) |
| Performance (lift) | Lower body: Push | 13 px / 400 | white 85% on #070918 | 14.12 : 1 | passes (needs 4.5) |
| Performance (lift) | Home / State / + | 14 px / 500 | white 65% on #6c5329 | 3.65 : 1 | **fails** (needs 4.5) |
| Performance (lift) | Planned | 14 px / 300 | #9ca3af 100% on #1e130d | 7.10 : 1 | passes (needs 4.5) |
| Performance (lift) | Run + Ride + Strength · week 6 of 12 | 14 px / 400 | #9ca3af 100% on #140d09 | 7.36 : 1 | passes (needs 4.5) |
| Performance (lift) | Delete workout | 14 px / 300 | #fca5a5 85% on #120904 | 7.67 : 1 | passes (needs 4.5) |
| Performance (lift) | Thursday, September 17 / at / 11:00 AM | 14 px / 300 | #d1d5db 100% on #0c0803 | 12.99 : 1 | passes (needs 4.5) |
| Performance (lift) | Unattach | 14 px / 300 | white 90% on #191c1b | 13.64 : 1 | passes (needs 4.5) |
| Performance (lift) | Performance | 14 px / 300 | white 100% on #1c130d | 18.08 : 1 | passes (needs 4.5) |
| Performance (lift) | Upper body: Pull | 16 px / 300 | white 100% on #191104 | 18.01 : 1 | passes (needs 4.5) |
| Performance (lift) | 6 of 6 / 21 / 126 | 18 px / 600 | white 100% on #332f2e | 13.02 : 1 | passes (needs 4.5) |
| State · Status | +4 / -9 | 10.5 px / 400 | white 45% on #1c151b | 4.35 : 1 | **fails** (needs 4.5) |
| State · Status | · | 11 px / 400 | white 30% on #0d0a10 | 2.55 : 1 | **fails** (needs 4.5) |
| State · Status | fitness / · 6 wk / fatigue | 11 px / 400 | white 45% on #130e14 | 3.51 : 1 | **fails** (needs 4.5) |
| State · Status | high risk | 11 px / 400 | #c4645f 100% on #100c18 | 4.79 : 1 | passes (needs 4.5) |
| State · Status | LOAD / BODY | 11 px / 600 | #ece9e3 100% on #211917 | 9.75 : 1 | passes (needs 4.5) |
| State · Status | bike / strength / run | 11.5 px / 600 | white 70% on #493a25 | 6.11 : 1 | passes (needs 4.5) |
| State · Status | Today | 12 px / 400 | white 40% on #060605 | 3.71 : 1 | **fails** (needs 4.5) |
| State · Status | ⓘ | 12 px / 400 | white 45% on #281f1c | 4.23 : 1 | **fails** (needs 4.5) |
| State · Status | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #0b0918 | 4.47 : 1 | **fails** (needs 4.5) |
| State · Status | trends · last 12 weeks | 12 px / 600 | white 55% on #080806 | 6.26 : 1 | passes (needs 4.5) |
| State · Status | NEXT | 12 px / 600 | #ece9e3 100% on #070610 | 16.51 : 1 | passes (needs 4.5) |
| State · Status | This week | 12.5 px / 400 | white 55% on #423421 | 4.58 : 1 | passes (needs 4.5) |
| State · Status | your number / e1RM · +5 / e1RM · +10 | 12.5 px / 400 | white 65% on #2d354a | 5.93 : 1 | passes (needs 4.5) |
| State · Status | strength 2h 45m · bike 4h 3m | 12.5 px / 400 | white 85% on #3a393c | 8.13 : 1 | passes (needs 4.5) |
| State · Status | Adjust / Schedule | 13 px / 300 | #9ca3af 100% on #151516 | 7.14 : 1 | passes (needs 4.5) |
| State · Status | Sat, 9/19 | 13 px / 400 | white 60% on #0a0917 | 7.27 : 1 | passes (needs 4.5) |
| State · Status | WK 6 | 13 px / 600 | white 65% on #070705 | 8.48 : 1 | passes (needs 4.5) |
| State · Status | 46 / 67 / −31 | 13 px / 400 | #ece9e3 100% on #1a1419 | 10.77 : 1 | passes (needs 4.5) |
| State · Status | Status | 13 px / 300 | white 100% on #141412 | 18.40 : 1 | passes (needs 4.5) |
| State · Status | Home / + | 14 px / 500 | white 65% on #6c5429 | 3.79 : 1 | **fails** (needs 4.5) |
| State · Status | State | 14 px / 500 | white 77% on #6f5869 | 4.23 : 1 | **fails** (needs 4.5) |
| State · Status | FTP / Bench Press / Deadlift | 14 px / 400 | white 85% on #453f38 | 7.76 : 1 | passes (needs 4.5) |
| State · Status | Form −31 · high risk | 14 px / 500 | white 80% on #0a0907 | 12.48 : 1 | passes (needs 4.5) |
| State · Status | 210 W / 205 / 340 | 15 px / 400 | white 90% on #283046 | 10.42 : 1 | passes (needs 4.5) |
| State · Status | Run + Ride + Strength · Week 6 of 12. | 15 px / 500 | white 85% on #0a0b0a | 14.00 : 1 | passes (needs 4.5) |
| State · Status | ⌄ | 16 px / 400 | white 80% on #242c44 | 9.12 : 1 | passes (needs 4.5) |
| State · Status (rows open) | 200–205 lb / 330–340 lb / 280–290 lb | 10 px / 400 | white 30% on #110e22 | 2.61 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | as of Sep 14 / as of Sep 15 / as of Sep 11 | 10 px / 400 | white 40% on #221924 | 3.72 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | 5 weeks of readings / 4 weeks of readings | 10 px / 400 | white 45% on #0b0a10 | 4.45 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | PR / rep PR | 10 px / 600 | #ff8c42 100% on #412b1d | 5.23 : 1 | passes (needs 4.5) |
| State · Status (rows open) | e1RM / sessions / best | 10 px / 400 | #ff8c42 100% on #1d1210 | 6.66 : 1 | passes (needs 4.5) |
| State · Status (rows open) | +4 / -9 | 10.5 px / 400 | white 45% on #1c151b | 4.35 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | · | 11 px / 400 | white 30% on #0d0a10 | 2.55 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | fitness / · 6 wk / fatigue | 11 px / 400 | white 45% on #130e14 | 3.51 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | Sep 6 | 11 px / 400 | white 40% on #201720 | 3.77 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | high risk | 11 px / 400 | #c4645f 100% on #100c18 | 4.79 : 1 | passes (needs 4.5) |
| State · Status (rows open) | all-out 290 lb × 6 / all-out 245 lb × 6 | 11 px / 400 | white 50% on #181015 | 5.25 : 1 | passes (needs 4.5) |
| State · Status (rows open) | 24 logged / 5 logged | 11 px / 400 | white 60% on #283147 | 5.54 : 1 | passes (needs 4.5) |
| State · Status (rows open) | this week's lifting / how long each day takes to recover fro | 11 px / 400 | white 55% on #140f19 | 6.12 : 1 | passes (needs 4.5) |
| State · Status (rows open) | estimated 1-rep max | 11 px / 400 | #ece9e3 100% on #3d3226 | 9.68 : 1 | passes (needs 4.5) |
| State · Status (rows open) | LOAD / BODY | 11 px / 600 | #ece9e3 100% on #211917 | 9.75 : 1 | passes (needs 4.5) |
| State · Status (rows open) | bike / strength / run | 11.5 px / 600 | white 70% on #4b3c27 | 5.96 : 1 | passes (needs 4.5) |
| State · Status (rows open) | Today | 12 px / 400 | white 40% on #060605 | 3.71 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | ⓘ / · 3 lifts | 12 px / 400 | white 45% on #281f1c | 4.23 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #0b0918 | 4.47 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | +6.4–+6.4% | 12 px / 400 | white 50% on #130b1c | 5.31 : 1 | passes (needs 4.5) |
| State · Status (rows open) | trends · last 12 weeks | 12 px / 600 | white 55% on #080806 | 6.00 : 1 | passes (needs 4.5) |
| State · Status (rows open) | › / from your logged sets / building · 4 of 12 weeks | 12 px / 400 | white 55% on #0e0a12 | 6.01 : 1 | passes (needs 4.5) |
| State · Status (rows open) | work sets · up to three days / higher is better / work sets  | 12 px / 400 | white 60% on #0b0c1b | 6.93 : 1 | passes (needs 4.5) |
| State · Status (rows open) | last week against the week before : quad | 12 px / 400 | white 70% on #0b0a1a | 9.59 : 1 | passes (needs 4.5) |
| State · Status (rows open) | 25 / 18 / 21 | 12 px / 400 | white 80% on #120f1e | 11.23 : 1 | passes (needs 4.5) |
| State · Status (rows open) | NEXT | 12 px / 600 | #ece9e3 100% on #070611 | 16.51 : 1 | passes (needs 4.5) |
| State · Status (rows open) | This week | 12.5 px / 400 | white 55% on #423421 | 4.58 : 1 | passes (needs 4.5) |
| State · Status (rows open) | your number / e1RM · +5 / e1RM · +10 | 12.5 px / 400 | white 65% on #2b3344 | 5.96 : 1 | passes (needs 4.5) |
| State · Status (rows open) | strength 2h 45m · bike 4h 3m | 12.5 px / 400 | white 85% on #3a393c | 8.30 : 1 | passes (needs 4.5) |
| State · Status (rows open) | · 5/4 planned | 13 px / 400 | white 55% on #46403b | 4.25 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | needs data / Sat, 9/19 | 13 px / 400 | white 60% on #493b26 | 4.85 : 1 | passes (needs 4.5) |
| State · Status (rows open) | Adjust / Schedule | 13 px / 300 | #9ca3af 100% on #151516 | 7.14 : 1 | passes (needs 4.5) |
| State · Status (rows open) | rides / Upper body: Push / Lower body: Hinge | 13 px / 400 | white 80% on #483923 | 7.52 : 1 | passes (needs 4.5) |
| State · Status (rows open) | WK 6 | 13 px / 600 | white 65% on #070705 | 8.48 : 1 | passes (needs 4.5) |
| State · Status (rows open) | 46 / 67 / −31 | 13 px / 400 | #ece9e3 100% on #1a1419 | 10.77 : 1 | passes (needs 4.5) |
| State · Status (rows open) | over 5 weeks : → / 199 lb / 203 lb | 13 px / 400 | white 85% on #0d0b14 | 13.22 : 1 | passes (needs 4.5) |
| State · Status (rows open) | Status | 13 px / 300 | white 100% on #141412 | 18.40 : 1 | passes (needs 4.5) |
| State · Status (rows open) | Home / + | 14 px / 500 | white 65% on #6c5429 | 3.79 : 1 | **fails** (needs 4.5) |
| State · Status (rows open) | State | 14 px / 500 | white 86% on #715a6b | 4.68 : 1 | passes (needs 4.5) |
| State · Status (rows open) | FTP / Bench Press / Deadlift | 14 px / 400 | white 85% on #47413a | 7.58 : 1 | passes (needs 4.5) |
| State · Status (rows open) | Form −31 · high risk | 14 px / 500 | white 80% on #0a0907 | 12.48 : 1 | passes (needs 4.5) |
| State · Status (rows open) | 205 lb / 6 / 340 lb | 15 px / 400 | #ff8c42 100% on #331f12 | 5.95 : 1 | passes (needs 4.5) |
| State · Status (rows open) | 210 W / 205 / 340 | 15 px / 400 | white 90% on #272f41 | 10.30 : 1 | passes (needs 4.5) |
| State · Status (rows open) | Run + Ride + Strength · Week 6 of 12. | 15 px / 500 | white 85% on #0a0b0a | 14.00 : 1 | passes (needs 4.5) |
| State · Status (rows open) | ⌄ | 16 px / 400 | white 80% on #22293c | 9.02 : 1 | passes (needs 4.5) |
| State · Status (rows open) | 2.080 / +6.4% | 24 px / 400 | #ece9e3 100% on #090813 | 16.32 : 1 | passes (needs 3) |
| State · form key | +4 / -9 | 10.5 px / 400 | white 45% on #403528 | 3.69 : 1 | **fails** (needs 4.5) |
| State · form key | · | 11 px / 400 | white 30% on #332718 | 2.46 : 1 | **fails** (needs 4.5) |
| State · form key | high risk | 11 px / 400 | #c4645f 100% on #393029 | 3.10 : 1 | **fails** (needs 4.5) |
| State · form key | fitness / · 6 wk / fatigue | 11 px / 400 | white 45% on #3b2e1d | 3.69 : 1 | **fails** (needs 4.5) |
| State · form key | LOAD | 11 px / 600 | #ece9e3 100% on #40321d | 9.71 : 1 | passes (needs 4.5) |
| State · form key | bike | 11.5 px / 600 | white 70% on #4c3e28 | 5.86 : 1 | passes (needs 4.5) |
| State · form key | ⓘ | 12 px / 400 | white 45% on #453724 | 3.60 : 1 | **fails** (needs 4.5) |
| State · form key | Today | 12 px / 400 | white 40% on #060605 | 3.71 : 1 | **fails** (needs 4.5) |
| State · form key | Insights derived in part from Garmin dev | 12 px / 300 | white 45% on #0b0a19 | 4.46 : 1 | **fails** (needs 4.5) |
| State · form key | above +25 / transitional / fitness fading | 12 px / 400 | white 55% on #0c0913 | 6.20 : 1 | passes (needs 4.5) |
| State · form key | trends · last 12 weeks | 12 px / 600 | white 55% on #030303 | 6.26 : 1 | passes (needs 4.5) |
| State · form key | Every session earns workload points. Fit / Form is fitness m | 12 px / 400 | white 65% on #26252e | 6.66 : 1 | passes (needs 4.5) |
| State · form key | below −30 / ▸ high risk | 12 px / 400 | white 95% on #070612 | 17.64 : 1 | passes (needs 4.5) |
| State · form key | This week | 12.5 px / 400 | white 55% on #483a24 | 4.38 : 1 | **fails** (needs 4.5) |
| State · form key | your number | 12.5 px / 400 | white 65% on #1b2029 | 6.09 : 1 | passes (needs 4.5) |
| State · form key | strength 2h 45m · bike 4h 3m | 12.5 px / 400 | white 85% on #3d3c3e | 7.89 : 1 | passes (needs 4.5) |
| State · form key | Adjust / Schedule | 13 px / 300 | #9ca3af 100% on #151516 | 7.14 : 1 | passes (needs 4.5) |
| State · form key | WK 6 | 13 px / 600 | white 65% on #070705 | 8.48 : 1 | passes (needs 4.5) |
| State · form key | 46 / 67 / −31 | 13 px / 400 | #ece9e3 100% on #413525 | 9.51 : 1 | passes (needs 4.5) |
| State · form key | Status | 13 px / 300 | white 100% on #141412 | 18.40 : 1 | passes (needs 4.5) |
| State · form key | Home / + | 14 px / 500 | white 65% on #6c5429 | 3.79 : 1 | **fails** (needs 4.5) |
| State · form key | State | 14 px / 500 | white 86% on #715a6b | 4.68 : 1 | passes (needs 4.5) |
| State · form key | FTP | 14 px / 400 | white 85% on #49433b | 7.36 : 1 | passes (needs 4.5) |
| State · form key | Form −31 · high risk | 14 px / 500 | white 80% on #0a0907 | 12.48 : 1 | passes (needs 4.5) |
| State · form key | 210 W | 15 px / 400 | white 90% on #283143 | 10.37 : 1 | passes (needs 4.5) |
| State · form key | Run + Ride + Strength · Week 6 of 12. | 15 px / 500 | white 85% on #0a0b0a | 14.00 : 1 | passes (needs 4.5) |
| State · form key | ⌄ | 16 px / 400 | white 80% on #22293b | 9.57 : 1 | passes (needs 4.5) |
| State · Adjust | reorder | 11 px / 400 | white 45% on #030506 | 4.44 : 1 | **fails** (needs 4.5) |
| State · Adjust | Strength | 11.5 px / 600 | #ff8c42 100% on #211d2f | 6.76 : 1 | passes (needs 4.5) |
| State · Adjust | Bike | 11.5 px / 600 | #50c878 100% on #181626 | 8.11 : 1 | passes (needs 4.5) |
| State · Adjust | The block / Deload | 11.5 px / 600 | white 70% on #080715 | 9.11 : 1 | passes (needs 4.5) |
| State · Adjust | Run | 11.5 px / 600 | #ffd700 100% on #2a2739 | 9.79 : 1 | passes (needs 4.5) |
| State · Adjust | Today | 12 px / 400 | white 40% on #060605 | 3.71 : 1 | **fails** (needs 4.5) |
| State · Adjust | ⓘ | 12 px / 400 | white 45% on #181628 | 4.19 : 1 | **fails** (needs 4.5) |
| State · Adjust | from your lifts, 6 sessions / from your lifts, 7 sessions /  | 12 px / 400 | white 50% on #1d1a2a | 4.30 : 1 | **fails** (needs 4.5) |
| State · Adjust | auto | 12 px / 400 | white 70% on #232838 | 7.69 : 1 | passes (needs 4.5) |
| State · Adjust | Rewrites the sessions you have not start / Max-effort sets b | 13 px / 400 | white 60% on #0f0a19 | 5.97 : 1 | passes (needs 4.5) |
| State · Adjust | Status / Schedule / Run | 13 px / 300 | #9ca3af 100% on #141412 | 7.08 : 1 | passes (needs 4.5) |
| State · Adjust | use 165 W | 13 px / 400 | #50c878 100% on #1e1a31 | 7.62 : 1 | passes (needs 4.5) |
| State · Adjust | Your rides measure 165 W | 13 px / 400 | white 70% on #0e0d1d | 9.37 : 1 | passes (needs 4.5) |
| State · Adjust | Rebuild upcoming sessions / Make week 7 a deload week / Lowe | 13 px / 400 | white 80% on #161522 | 9.58 : 1 | passes (needs 4.5) |
| State · Adjust | Adjust | 13 px / 300 | white 100% on #151516 | 18.13 : 1 | passes (needs 4.5) |
| State · Adjust | no number yet | 14 px / 400 | white 35% on #0c091b | 3.10 : 1 | **fails** (needs 4.5) |
| State · Adjust | Home / + | 14 px / 500 | white 65% on #6c5429 | 3.79 : 1 | **fails** (needs 4.5) |
| State · Adjust | tap to add | 14 px / 400 | white 45% on #1c1714 | 4.46 : 1 | **fails** (needs 4.5) |
| State · Adjust | State | 14 px / 500 | white 86% on #715a6b | 4.68 : 1 | passes (needs 4.5) |
| State · Adjust | Changes here go into the sessions you ha | 14 px / 400 | white 70% on #0a0b0a | 9.63 : 1 | passes (needs 4.5) |
| State · Adjust | Squat / Deadlift / Bench press | 14 px / 400 | white 85% on #292637 | 9.71 : 1 | passes (needs 4.5) |
| State · Adjust | 290 lb · auto / 340 lb · auto / 205 lb · auto | 14 px / 400 | white 90% on #1c111a | 13.90 : 1 | passes (needs 4.5) |
| State · Schedule | Today | 12 px / 400 | white 40% on #060605 | 3.71 : 1 | **fails** (needs 4.5) |
| State · Schedule | Schedule — rearrange your week: drag a s | 13 px / 400 | white 40% on #090a0a | 3.73 : 1 | **fails** (needs 4.5) |
| State · Schedule | Status / Adjust | 13 px / 300 | #9ca3af 100% on #141412 | 7.14 : 1 | passes (needs 4.5) |
| State · Schedule | Schedule | 13 px / 300 | white 100% on #0e1011 | 18.92 : 1 | passes (needs 4.5) |
| State · Schedule | Home / + | 14 px / 500 | white 65% on #6c5429 | 3.79 : 1 | **fails** (needs 4.5) |
| State · Schedule | State | 14 px / 500 | white 86% on #715a6b | 4.68 : 1 | passes (needs 4.5) |
