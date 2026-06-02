import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

import Welcome from "./pages/welcome";
import Login from "./pages/login";
import Register from "./pages/Register";
import Dashboard from "./components/Dashboard/Dashboard";
import StreamTogether from "./components/Dashboard/StreamTogether/StreamTogether";
import RequireAuth from "./auth/RequireAuth";

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Navigate to="/welcome" replace />} />

        <Route path="/welcome" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />

        {/* Stream Together routes - NO auth required */}
        <Route path="/stream-together" element={<StreamTogether />} />
        <Route path="/cohost-join/:sessionId" element={<StreamTogether />} />
        <Route path="/watch/:sessionId" element={<StreamTogether />} />

        {/* Wildcard MUST be last */}
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </div>
  );
}

export default App;