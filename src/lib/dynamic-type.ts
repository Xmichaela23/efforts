/**
 * ⛔ THE PHONE'S TEXT SIZE (2026-09-18, docs/AUDIT-type-legibility-2026-09-18.md).
 *
 * iOS lets a person pick a text size (Settings → Display & Brightness → Text Size; Apple calls it
 * Dynamic Type). A web view does not follow it on its own: every size here is CSS. Two things WebKit
 * on iOS does allow, both checked on the iOS simulator on 2026-09-18:
 *   · `font: -apple-system-body` resolves to the Body size for the chosen setting — 17 px at the
 *     default, 21 px two steps up. Body over 17 is the person's scale.
 *   · `-webkit-text-size-adjust: <percent>` on <html> scales every line of text (px and rem alike)
 *     without moving padding or layout boxes — the same lever Capacitor's text-zoom plugin pulls.
 *
 * iPhone and iPad only: `-webkit-touch-callout` is supported by iOS WebKit alone, and desktop Safari
 * also knows `-apple-system-body` (at a different size), so it must not run there. Everywhere else the
 * sizes are rem and the browser's own text size moves them.
 *
 * Read again whenever the app comes back to the front, since the setting can change while it is away.
 */

// Apple's Body size at the default text size (HIG → Typography, iOS "Large (default)": Body 17 pt).
const APPLE_BODY_DEFAULT_PX = 17;
// OURS — never below 100%: the smaller settings would take the 12 px floor (Caption 1) under Apple's
// 11 pt minimum. And never above xxxLarge, the largest of the seven standard settings (HIG → Typography:
// Body 23 pt at xxxLarge, so 23 ÷ 17 = 135%). The five accessibility sizes past it (Body 28 → 53 pt) need
// the fixed-height header and tab bar to grow — checked on the iOS simulator 2026-09-18: at AX3 the logo
// and the bar's pills clip. Until they grow, those settings read as xxxLarge. Ledger: docs/STATE-SOURCES.md.
const MAX_SCALE = 23 / APPLE_BODY_DEFAULT_PX;

function isIOSWebKit(): boolean {
  try {
    return typeof CSS !== 'undefined' && CSS.supports('-webkit-touch-callout', 'none') && CSS.supports('font', '-apple-system-body');
  } catch {
    return false;
  }
}

function readScale(): number | null {
  const probe = document.createElement('span');
  probe.style.cssText = 'font: -apple-system-body; position: absolute; visibility: hidden; pointer-events: none;';
  probe.textContent = 'x';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  if (!Number.isFinite(px) || px <= 0) return null;
  return Math.min(MAX_SCALE, Math.max(1, px / APPLE_BODY_DEFAULT_PX));
}

function apply(): void {
  const scale = readScale();
  if (scale == null) return;
  const pct = `${Math.round(scale * 100)}%`;
  const html = document.documentElement;
  html.style.setProperty('-webkit-text-size-adjust', pct);
  html.dataset.textScale = pct;
  // OURS — from 110% up the bottom bar stacks its mark over its word (index.css). Worked out, not guessed:
  // "STATE" in 15 px IBM Plex Mono with its 0.16em spacing is 57 px × the scale, plus 24 px of mark and gap,
  // and a third of a 390 px screen leaves 86 px inside the pill — so it stops fitting at 1.09.
  if (scale >= 1.1) html.dataset.textLarge = ''; else delete html.dataset.textLarge;
}

/** Called once from main.tsx. A no-op off iPhone/iPad. */
export function followPhoneTextSize(): void {
  if (typeof document === 'undefined' || !isIOSWebKit()) return;
  apply();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') apply();
  });
}
