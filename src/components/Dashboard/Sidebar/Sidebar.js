import React from "react";
import "./Sidebar.css";

function Sidebar({ isSidebarOpen, activeNav, toggleSidebar, handleNavClick }) {
  return (
    <>
      <button className="sidebar-toggle" onClick={toggleSidebar} aria-label="Toggle sidebar">
        <i className={`fas ${isSidebarOpen ? "fa-times" : "fa-bars"}`}></i>
      </button>

      <div className={`sidebar ${isSidebarOpen ? "" : "collapsed"}`}>
        <div className="logo-container">
          <div className="logo">
            <div className="logo-icon">
              <i className="fas fa-satellite-dish"></i>
            </div>
            <div className="logo-text">StreamMova</div>
          </div>
        </div>

        {/* NAVIGATION */}
        <div className="nav-section">
          <div className="section-title">NAVIGATION</div>

          <button
            className={`nav-item ${activeNav === "dashboard" ? "active" : ""}`}
            onClick={() => handleNavClick("dashboard")}
          >
            <i className="nav-icon fas fa-tachometer-alt"></i>
            <span>Dashboard</span>
          </button>

          <button
            className={`nav-item ${activeNav === "multistream" ? "active" : ""}`}
            onClick={() => handleNavClick("multistream")}
          >
            <i className="nav-icon fas fa-broadcast-tower"></i>
            <span>Multistream</span>
          </button>

          <button
            className={`nav-item ${activeNav === "settings" ? "active" : ""}`}
            onClick={() => handleNavClick("settings")}
          >
            <i className="nav-icon fas fa-sliders-h"></i>
            <span>Stream Settings</span>
          </button>
        </div>
      </div>
    </>
  );
}

export default Sidebar;