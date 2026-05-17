import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdaptiveEntry from './AdaptiveEntry.tsx';
import './index.css';
import { registerServiceWorker } from './registerServiceWorker';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdaptiveEntry />
  </StrictMode>,
);

registerServiceWorker();
