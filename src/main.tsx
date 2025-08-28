
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
    const todays = document.querySelector('.mobile-todays-effort') as HTMLElement | null;
    const grid = document.querySelector('.mobile-calendar') as HTMLElement | null;
    if (!main || !header || !tabbar || !grid) return;

    const vh = window.innerHeight;
    const headerH = header.offsetHeight || 64;
    const tabbarH = tabbar.offsetHeight || 56;
    const safeTop = 0; // env handled by CSS; keep simple at runtime

    const mainH = Math.max(0, vh - headerH - tabbarH - safeTop);
    main.style.height = `${mainH}px`;

    // Compute remaining height for the calendar grid from its top to main bottom
    const mainTop = main.getBoundingClientRect().top;
    const gridTop = grid.getBoundingClientRect().top;
    const offset = Math.max(0, gridTop - mainTop);
    const remaining = Math.max(0, mainH - offset - 2); // small cushion

    // Clamp to reasonable range to avoid tiny/tall extremes
    const desiredCell = Math.max(120, Math.min(remaining, 260));
    document.documentElement.style.setProperty('--cal-cell-h', `${desiredCell}px`);
  } catch {}
}

applyRuntimeLayoutOverrides();
window.addEventListener('load', () => setTimeout(fitLayout, 0));
window.addEventListener('resize', () => setTimeout(fitLayout, 0));
window.addEventListener('orientationchange', () => setTimeout(fitLayout, 100));

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);
