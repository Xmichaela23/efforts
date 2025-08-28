
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
      /* Pre-seed final targets to avoid first-paint jump */
      :root { --todays-h: 12rem; --cal-cell-h: 150px; }
      .mobile-tabbar {
        padding-top: 8px !important;
        padding-bottom: max(env(safe-area-inset-bottom) - 34px, 0px) !important;
        height: calc(var(--tabbar-h) + max(env(safe-area-inset-bottom) - 34px, 0px)) !important;
      }
      .mobile-main-content {
        height: calc(100svh - var(--header-h) - (var(--tabbar-h) + max(env(safe-area-inset-bottom) - 34px, 0px)) - env(safe-area-inset-top)) !important;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        opacity: 0;
        transition: opacity 140ms ease;
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

    const mainRect = main.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const topOffset = Math.max(0, gridRect.top - mainRect.top);
    let remaining = Math.max(0, mainH - topOffset);

    const cs = getComputedStyle(grid);
    const padTop = parseFloat(cs.paddingTop || '0');
    const padBottom = parseFloat(cs.paddingBottom || '0');
    const borderTop = parseFloat(cs.borderTopWidth || '0');
    const borderBottom = parseFloat(cs.borderBottomWidth || '0');
    const gap = parseFloat((cs as any).rowGap || (cs as any).gap || '0');

    remaining -= (padTop + padBottom + borderTop + borderBottom + gap + 2);

    // Apply directly to cells to bypass any CSS fallback
    const desiredCell = Math.max(118, Math.min(remaining, 150));
    document.documentElement.style.setProperty('--cal-cell-h', `${desiredCell}px`);
    const cells = document.querySelectorAll('.mobile-calendar-cell') as NodeListOf<HTMLElement>;
    cells.forEach((el) => {
      el.style.height = `${desiredCell}px`;
      el.style.minHeight = `${desiredCell}px`;
    });
  } catch {}
}

function alignFrameLine() {
  try {
    const cells = document.querySelectorAll('.mobile-calendar-cell') as NodeListOf<HTMLElement>;
    const tabbar = document.querySelector('.mobile-tabbar') as HTMLElement | null;
    if (!cells || cells.length === 0 || !tabbar) return false;

    const last = cells[cells.length - 1];
    const bottom = last.getBoundingClientRect().bottom;
    const tabTop = tabbar.getBoundingClientRect().top;

    const desiredCushion = 2; // px
    const gap = (tabTop - bottom) - desiredCushion; // positive means space remaining

    if (Math.abs(gap) <= 1) return true; // aligned

    const raw = getComputedStyle(document.documentElement).getPropertyValue('--cal-cell-h').trim();
    const current = raw.endsWith('px') ? parseFloat(raw) : raw.endsWith('rem') ? parseFloat(raw) * 16 : parseFloat(raw);
    if (!isFinite(current)) return false;

    // Light correction only: cap delta to ±6px to avoid visible jumps
    const delta = Math.max(-6, Math.min(gap, 6));
    const next = Math.max(118, Math.min(current + delta, 150));
    document.documentElement.style.setProperty('--cal-cell-h', `${next}px`);
    const els = document.querySelectorAll('.mobile-calendar-cell') as NodeListOf<HTMLElement>;
    els.forEach((el) => { el.style.height = `${next}px`; el.style.minHeight = `${next}px`; });

    return Math.abs(gap) <= 1;
  } catch { return false; }
}

// Single immediate pass to avoid multi-step visual adjustments
function fitAndAlign() {
  fitLayout();
  // Align once shortly after layout to catch fonts/metrics
  requestAnimationFrame(() => {
    alignFrameLine();
    try {
      const main = document.querySelector('.mobile-main-content') as HTMLElement | null;
      if (main) main.style.opacity = '1';
    } catch {}
  });
}

applyRuntimeLayoutOverrides();
// Earlier trigger on DOM ready
document.addEventListener('DOMContentLoaded', () => setTimeout(fitAndAlign, 0));
window.addEventListener('load', () => setTimeout(fitAndAlign, 0));
window.addEventListener('resize', () => setTimeout(fitAndAlign, 0));
window.addEventListener('orientationchange', () => setTimeout(fitAndAlign, 120));

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);
