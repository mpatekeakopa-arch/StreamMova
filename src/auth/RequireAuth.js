// src/auth/RequireAuth.js
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function RequireAuth({ children }) {
  const { loading, session } = useAuth();

  if (loading) return null; // or a loader
  if (!session) return <Navigate to="/login" replace />;
  return children;
}