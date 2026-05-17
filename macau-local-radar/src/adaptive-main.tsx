import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import DesktopMarketUI from './desktop/DesktopMarketUI.tsx';
import './index.css';

const DESKTOP_BREAKPOINT = 1024;

function AdaptiveEntry() {
  const isDesktop =
    typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT : false;

  return isDesktop ? <DesktopMarketUI /> : <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdaptiveEntry />
  </StrictMode>,
);
