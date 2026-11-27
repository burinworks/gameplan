import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './styles/base.css';
import { createQueryClient } from './api/hooks';
import { startLive } from './api/live';
import { EngineDown } from './shell/EngineDown';
import { applyTheme } from './theme';

applyTheme({ appearance: 'system', accent: '#2F6BF0' });

const queryClient = createQueryClient();
const stopLive = startLive(queryClient);
import.meta.hot?.dispose(stopLive);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <div className="gp-window">
        <EngineDown />
        Gameplan
      </div>
    </QueryClientProvider>
  </StrictMode>,
);
