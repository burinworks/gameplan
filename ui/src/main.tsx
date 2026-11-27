import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './styles/base.css';
import { createQueryClient } from './api/hooks';
import { startLive } from './api/live';
import { App } from './app/App';
import { applyTheme } from './theme';

applyTheme({ appearance: 'system', accent: '#2F6BF0' });

const queryClient = createQueryClient();
startLive(queryClient);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
