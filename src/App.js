import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

import Welcome from "./pages/welcome";
import Login from "./pages/login";
import Register from "./pages/Register"; // IMPORTANT: must match your real filename casing
import Dashboard from "./components/Dashboard/Dashboard";

import RequireAuth from "./auth/RequireAuth";

function App() {
  return (
    <Router>
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

          <Route path="*" element={<Navigate to="/welcome" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
