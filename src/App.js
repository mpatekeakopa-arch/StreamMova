import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import Welcome from './pages/welcome';
import Dashboard from './pages/dashboard';
import Login from "./pages/login";

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Welcome page as the default landing page */}
          <Route path="/welcome" element={<Welcome />} />
          
          {/* Dashboard/main app page */}
          <Route path="/dashboard" element={<Dashboard />} />

          <Route path="/login" element={<Login />} />
          
          {/* Redirect root to welcome page */}
          <Route path="/" element={<Navigate to="/welcome" replace />} />
          
          {/* Optional: Redirect any unknown routes */}
          <Route path="*" element={<Navigate to="/welcome" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;