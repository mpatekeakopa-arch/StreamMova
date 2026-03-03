import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

import Welcome from "./pages/welcome";
import Login from "./pages/login";
import Register from "./pages/Register";
import Dashboard from "./components/Dashboard/Dashboard";
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

        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </div>
  );
}

export default App;
