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
          
          <Route path="/welcome" element={<Welcome />} />
          
          
          <Route path="/dashboard" element={<Dashboard />} />

          <Route path="/login" element={<Login />} />
          
          
          <Route path="/" element={<Navigate to="/welcome" replace />} />
          
          
          <Route path="*" element={<Navigate to="/welcome" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;