// src/App.tsx
import React from 'react';
import { Routes, Route } from "react-router-dom";
import {
  AuthView,
  AccountView,
  SignedIn,
  SignedOut,
  UserButton,
} from "@neondatabase/neon-js/auth/react";

function Home() {
  return (
    <>
      <h1>Welcome to StreamMova!</h1>
      <p>Your streaming platform dashboard</p>
    </>
  );
}

function Dashboard() {
  return (
    <>
      <h1>StreamMova Dashboard</h1>
      <p>You are successfully authenticated!</p>
      <UserButton />
    </>
  );
}

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Home />} />
      <Route path="/auth/*" element={<AuthView />} />
      <Route path="/account/*" element={<AccountView />} />
      
      {/* Dashboard route - shows different content based on auth state */}
      <Route path="/dashboard" element={
        <>
          <SignedIn>
            <Dashboard />
          </SignedIn>
          <SignedOut>
            <p>Please sign in to access the dashboard</p>
            <a href="/auth/sign-in">Sign In</a>
          </SignedOut>
        </>
      } />
    </Routes>
  );
}

export default App;