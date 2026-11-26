import '@fontsource/yatra-one/400.css';
import '@fontsource/eczar/400.css';
import '@fontsource/eczar/600.css';
import './theme/theme.css';
import './theme/game.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './net/store';

if (import.meta.env.DEV) void import('./dev');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
