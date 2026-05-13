import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import "./Header.css";

function Header({ displayName, planName, avatarInitials, user }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <div className="header">
      <div className="header-title">
        <h1>Dashboard</h1>
        <p>Stream to multiple platforms simultaneously</p>
      </div>

      <div className="header-controls">
        <div className="user-menu">
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
              <div
                style={{
                  fontSize: "13px",
                  color: "rgba(255, 255, 255, 0.6)",
                }}
              >
                {planName}
              </div>
            </div>
          </div>

          <div
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginLeft: "20px",
              cursor: "pointer",
              color: "#ccc",
              fontSize: "14px",
            }}
          >
            <i className="fas fa-sign-out-alt"></i>
            Log out
          </div>
        </div>
      </div>
    </div>
  );
}

export default Header;