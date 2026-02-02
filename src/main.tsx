// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { NeonAuthUIProvider } from "@neondatabase/neon-js/auth/react";
import "@neondatabase/neon-js/ui/css";
import App from './App';
import { authClient } from './auth';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <NeonAuthUIProvider authClient={authClient}>
        <App />
      </NeonAuthUIProvider>
    </BrowserRouter>
  </React.StrictMode>
);