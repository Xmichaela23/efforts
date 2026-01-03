
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'maplibre-gl/dist/maplibre-gl.css'

function applyRuntimeLayoutOverrides() {
  try {
    const styleId = 'runtime-layout-overrides';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
      /* Pre-seed final targets to avoid first-paint jump */
      :root { --todays-h: 14rem; --cal-cell-h: 150px; }
      .mobile-tabbar {
        padding-top: 8px !important;
        padding-bottom: max(env(safe-area-inset-bottom) - 34px, 0px) !important;
        height: calc(var(--tabbar-h) + max(env(safe-area-inset-bottom) - 34px, 0px)) !important;
      }
      `;
      document.head.appendChild(style);
    }
  } catch {}
}

function fitLayout() {
  try {
    const tabbar = document.querySelector('.mobile-tabbar') as HTMLElement | null;
    const main = document.querySelector('.mobile-main-content') as HTMLElement | null;
    const grid = document.querySelector('.mobile-calendar') as HTMLElement | null;
    if (!main || !tabbar || !grid) return;

    // Don't override main content height - let CSS position: fixed with top: 0; bottom: 0 handle it
    // Just clear any previously set inline height
    main.style.height = '';
    
    const mainRect = main.getBoundingClientRect();
    const tabbarH = tabbar.offsetHeight || 56;
    // Main content should extend from its top to the tabbar top
    const mainH = mainRect.height;

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
    const grid = document.querySelector('.mobile-calendar') as HTMLElement | null;
    if (!cells || cells.length === 0 || !tabbar || !grid) return false;

    // Calculate exact available height from grid top to tabbar top
    const gridRect = grid.getBoundingClientRect();
    const tabTop = tabbar.getBoundingClientRect().top;
    const availableHeight = tabTop - gridRect.top - 4; // 4px cushion
    
    // 3 rows in the grid
    const cellHeight = Math.floor(availableHeight / 3);
    // No min/max constraints - fill the space exactly
    const finalHeight = Math.max(100, cellHeight);
    
    document.documentElement.style.setProperty('--cal-cell-h', `${finalHeight}px`);
    cells.forEach((el) => { 
      el.style.height = `${finalHeight}px`; 
      el.style.minHeight = `${finalHeight}px`; 
    });

    return true;
  } catch { return false; }
}

// Single immediate pass to avoid multi-step visual adjustments
function fitAndAlign() {
  fitLayout();
  // Align once shortly after layout to catch fonts/metrics
  requestAnimationFrame(() => {
    alignFrameLine();
  });
}

// Removed opacity gating to avoid blank view on slow devices

applyRuntimeLayoutOverrides();
// Earlier trigger on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(fitAndAlign, 0);
});
window.addEventListener('load', () => {
  setTimeout(fitAndAlign, 0);
});
window.addEventListener('resize', () => setTimeout(fitAndAlign, 0));
window.addEventListener('orientationchange', () => setTimeout(fitAndAlign, 120));

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);
