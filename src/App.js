import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import Welcome from './pages/welcome';
import Dashboard from './components/Dashboard/Dashboard';
import Login from "./pages/login";
import Register from "./pages/Register";
import RequireAuth from "./auth/RequireAuth";
import Dashboard from "./components/Dashboard/Dashboard";

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          
          <Route path="/welcome" element={<Welcome />} />
          
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<Dashboard />} />

          <Route path="/login" element={<Login />} />
          
          
          <Route path="/" element={<Navigate to="/welcome" replace />} />
          
          
          <Route path="*" element={<Navigate to="/welcome" replace />} />


          <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
