// src/auth.js
// Simple auth client that works without any external dependencies

const neonAuthUrl = process.env.REACT_APP_NEON_AUTH_URL;

if (!neonAuthUrl && process.env.NODE_ENV === 'development') {
  console.warn('⚠️ REACT_APP_NEON_AUTH_URL is not defined. Check your .env file.');
}

// Remove /neondb/auth from the end if it's there
const baseUrl = neonAuthUrl?.replace('/neondb/auth', '') || '';

export const authClient = {
  signIn: {
    email: async ({ email, password }) => {
      try {
        const response = await fetch(`${baseUrl}/neondb/auth/signin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        
        if (!response.ok) {
          const error = await response.text();
          return { error: { message: error || 'Authentication failed' } };
        }
        
        const data = await response.json();
        return { data };
      } catch (error) {
        return { error: { message: error.message || 'Network error' } };
      }
    },
    oauth: async ({ provider, redirectUrl }) => {
      // For Google OAuth through Neon
      window.location.href = `${baseUrl}/neondb/auth/${provider}?redirect_to=${encodeURIComponent(redirectUrl)}`;
      return {};
    }
  },
  signUp: {
    email: async ({ email, password, name }) => {
      try {
        const response = await fetch(`${baseUrl}/neondb/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });
        
        if (!response.ok) {
          const error = await response.text();
          return { error: { message: error || 'Sign up failed' } };
        }
        
        const data = await response.json();
        return { data };
      } catch (error) {
        return { error: { message: error.message || 'Network error' } };
      }
    }
  },
  // Get current user
  getUser: async () => {
    try {
      const response = await fetch(`${baseUrl}/neondb/auth/user`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        return { user: null };
      }
      
      const data = await response.json();
      return { user: data };
    } catch {
      return { user: null };
    }
  }
};