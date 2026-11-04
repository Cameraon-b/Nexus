import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import LiveWorkspace from './LiveWorkspace';
import './styles.css';
import './refinements.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.pathname.replace(/\/$/, '') === '/demo' ? <App /> : <LiveWorkspace />}
  </React.StrictMode>,
);
