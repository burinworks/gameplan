import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import { applyTheme } from './theme';

applyTheme({ appearance: 'system', accent: '#2F6BF0' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="gp-window">Gameplan</div>
  </StrictMode>,
);
