import React from "react";
import "./Header.css";

function Header({ displayName, planName, avatarInitials, user }) {
  return (
    <div className="header">
      <div className="header-title">
        <h1>Dashboard</h1>
        <p>Stream to multiple platforms simultaneously</p>
      </div>

      <div className="header-controls">
        <div className="search-box">
          <i className="fas fa-search"></i>
          <input type="text" placeholder="Search streams, settings..." />
        </div>

        <div className="user-menu">
          <div className="notification-bell">
            <i className="fas fa-bell"></i>
            <div className="notification-badge"></div>
          </div>

          <div className="user-profile">
            <div className="user-avatar">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="User avatar"
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                avatarInitials
              )}
            </div>
            <div>
              <div style={{ fontWeight: "600" }}>{displayName}</div>
              <div style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.6)" }}>
                {planName}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Header;