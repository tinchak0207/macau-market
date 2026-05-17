import App from './App.tsx';
import DesktopMarketUI from './desktop/DesktopMarketUI.tsx';

const DESKTOP_BREAKPOINT = 1024;

export default function AdaptiveEntry() {
  const isDesktop =
    typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT : false;

  return isDesktop ? <DesktopMarketUI /> : <App />;
}
