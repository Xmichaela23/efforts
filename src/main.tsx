
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

function applyRuntimeLayoutOverrides() {
  try {
    const styleId = 'runtime-layout-overrides';
    if (document.getElementById(styleId)) return;
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
  } catch {}
}

applyRuntimeLayoutOverrides();

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);
