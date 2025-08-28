
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

function applyRuntimeLayoutOverrides() {
  try {
    const styleId = 'runtime-layout-overrides';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
      :root { --todays-h: 10.6rem; --cal-cell-h: 8.6rem; }
      .mobile-tabbar {
        padding-top: 8px !important;
        padding-bottom: max(env(safe-area-inset-bottom) - 12px, 0px) !important;
        height: calc(var(--tabbar-h) + max(env(safe-area-inset-bottom) - 12px, 0px)) !important;
      }
      .mobile-main-content {
        height: calc(100svh - var(--header-h) - (var(--tabbar-h) + max(env(safe-area-inset-bottom) - 12px, 0px)) - env(safe-area-inset-top)) !important;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      `;
      document.head.appendChild(style);
    }
  } catch {}
}

function fitLayout() {
  try {
    const header = document.querySelector('.mobile-header') as HTMLElement | null;
    const tabbar = document.querySelector('.mobile-tabbar') as HTMLElement | null;
    const main = document.querySelector('.mobile-main-content') as HTMLElement | null;
    const grid = document.querySelector('.mobile-calendar') as HTMLElement | null;
    if (!main || !header || !tabbar || !grid) return;

    const vh = window.innerHeight;
    const headerH = header.offsetHeight || 64;
    const tabbarH = tabbar.offsetHeight || 56;

    const mainH = Math.max(0, vh - headerH - tabbarH);
    main.style.height = `${mainH}px`;

    // Compute available height from top of grid to bottom of main, minus grid padding/borders/gaps
    const mainRect = main.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const topOffset = Math.max(0, gridRect.top - mainRect.top);
    let remaining = Math.max(0, mainH - topOffset);

    const cs = getComputedStyle(grid);
    const padTop = parseFloat(cs.paddingTop || '0');
    const padBottom = parseFloat(cs.paddingBottom || '0');
    const borderTop = parseFloat(cs.borderTopWidth || '0');
    const borderBottom = parseFloat(cs.borderBottomWidth || '0');
    const rowGap = parseFloat((cs as any).rowGap || cs.gap || '0');

    // Our grid is 1 row, so subtract padding, borders, and a tiny cushion
    remaining -= (padTop + padBottom + borderTop + borderBottom + rowGap + 2);

    // Final clamp
    const desiredCell = Math.max(118, Math.min(remaining, 280));
    document.documentElement.style.setProperty('--cal-cell-h', `${desiredCell}px`);
  } catch {}
}

function alignFrameLine() {
  try {
    const grid = document.querySelector('.mobile-calendar') as HTMLElement | null;
    const tabbar = document.querySelector('.mobile-tabbar') as HTMLElement | null;
    if (!grid || !tabbar) return;

    const gridRect = grid.getBoundingClientRect();
    const tabRect = tabbar.getBoundingClientRect();
    // Positive gap means grid ends above the tabbar; negative means overlap
    const desiredCushion = 2; // small visual breathing room
    const gap = (tabRect.top - gridRect.bottom) - desiredCushion;

    if (Math.abs(gap) <= 1) return; // already aligned

    const docStyle = getComputedStyle(document.documentElement);
    const raw = docStyle.getPropertyValue('--cal-cell-h').trim();
    const current = raw.endsWith('px') ? parseFloat(raw) : raw.endsWith('rem') ? parseFloat(raw) * 16 : parseFloat(raw);
    if (!isFinite(current)) return;

    // Nudge by the exact gap, but clamp to sane limits
    const next = Math.max(118, Math.min(current + gap, 300));
    document.documentElement.style.setProperty('--cal-cell-h', `${next}px`);
  } catch {}
}

// Wrap fit & align in one pass
function fitAndAlign() {
  fitLayout();
  // Allow layout to settle, then align precisely
  requestAnimationFrame(() => {
    alignFrameLine();
    // One more pass if still off after styles apply
    setTimeout(alignFrameLine, 50);
  });
}

applyRuntimeLayoutOverrides();
window.addEventListener('load', () => setTimeout(fitAndAlign, 0));
window.addEventListener('resize', () => setTimeout(fitAndAlign, 0));
window.addEventListener('orientationchange', () => setTimeout(fitAndAlign, 120));

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);
