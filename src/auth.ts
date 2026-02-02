// src/auth.ts
import { createAuthClient } from "@neondatabase/neon-js/auth";

const neonAuthUrl = process.env.REACT_APP_NEON_AUTH_URL;

if (!neonAuthUrl && process.env.NODE_ENV === 'development') {
  console.warn('⚠️ REACT_APP_NEON_AUTH_URL is not defined. Check your .env file.');
}

export const authClient = createAuthClient(neonAuthUrl || '');