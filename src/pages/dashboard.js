import React, { useState, useRef, useEffect } from "react";
import "./Dashboard.css";

function Dashboard() {
  const [sidebarActive, setSidebarActive] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const analytics = [
    {
      id: 1,
      title: "Total Viewers",
      value: "5,470",
      icon: "fas fa-users",
      color: "linear-gradient(135deg, #6a11cb, #2575fc)",
    },
    {
      id: 2,
      title: "Stream Uptime",
      value: "3h 42m",
      icon: "fas fa-clock",
      color: "linear-gradient(135deg, #FF416C, #FF4B2B)",
    },
    {
      id: 3,
      title: "Avg. Bitrate",
      value: "6,500 kbps",
      icon: "fas fa-tachometer-alt",
      color: "linear-gradient(135deg, #11998e, #38ef7d)",
    },
    {
      id: 4,
      title: "Platforms",
      value: "4 Active",
      icon: "fas fa-satellite-dish",
      color: "linear-gradient(135deg, #f46b45, #eea849)",
    },
  ];

  // Sidebar "Destinations" list (icons like your screenshot)
  const destinations = [
    { id: 1, name: "Twitch", icon: "fab fa-twitch", accent: "#9147ff" },
    { id: 2, name: "YouTube", icon: "fab fa-youtube", accent: "#FF0000" },
    { id: 3, name: "Facebook", icon: "fab fa-facebook", accent: "#1877F2" },
    { id: 4, name: "Twitter", icon: "fab fa-twitter", accent: "#1DA1F2" },
  ];

  const toggleSidebar = () => setSidebarActive((s) => !s);

  // Attach stream to the <video> element whenever camera turns on/off
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;

    if (!video) return;

    if (!isCameraOn || !stream) {
      video.srcObject = null;
      return;
    }

    video.srcObject = stream;

    const tryPlay = async () => {
      try {
        await video.play();
      } catch (e) {
        console.error("Video play failed:", e);
      }
    };

    tryPlay();

    return () => {
      if (video) video.srcObject = null;
    };
  }, [isCameraOn]);

  const startCamera = async () => {
    try {
      setError("");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: "user",
        },
        audio: true,
      });

      streamRef.current = stream;
      setIsCameraOn(true);
      setIsStreaming(true);
    } catch (err) {
      console.error(err);
      setError("Unable to access camera or microphone. Please allow permissions.");
      setIsCameraOn(false);
      setIsStreaming(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;

    setIsCameraOn(false);
    setIsStreaming(false);
  };

  const handleStreamToggle = () => {
    if (!isStreaming) startCamera();
    else stopCamera();
  };

  const handleNavClick = (navItem) => setActiveNav(navItem);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <div className="streammova-app">
      <div className="mobile-toggle" onClick={toggleSidebar}>
        <i className="fas fa-bars"></i>
      </div>

      <div className={`sidebar ${sidebarActive ? "active" : ""}`}>
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

        {/* DESTINATIONS (like your screenshot) */}
        <div className="nav-section">
          <div className="section-title">DESTINATIONS</div>

          {destinations.map((d) => (
            <button
              key={d.id}
              className={`dest-item ${activeNav === `dest:${d.name}` ? "active" : ""}`}
              onClick={() => handleNavClick(`dest:${d.name}`)}
              title={d.name}
            >
              <span className="dest-icon" style={{ color: d.accent }}>
                <i className={d.icon}></i>
              </span>
              <span className="dest-label">{d.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="main-content">
        <div className="header">
          <div className="header-title">
            <h1>Multistream Dashboard</h1>
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
                <div className="user-avatar">JS</div>
                <div>
                  <div style={{ fontWeight: "600" }}>John Streamer</div>
                  <div style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.6)" }}>
                    Pro Plan
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-content">
          <div className="stream-output">
            <div className="section-header">
              <h2>Live Stream Preview</h2>
              <div className={`status-indicator ${isStreaming ? "live" : "ready"}`}>
                {isStreaming ? "LIVE NOW" : "READY TO STREAM"}
              </div>
            </div>

            <div className="stream-preview-container">
              <video ref={videoRef} className="video-preview" playsInline muted autoPlay />

              {!isCameraOn && (
                <div className="stream-preview-placeholder">
                  <i className="fas fa-satellite-dish"></i>
                  <h3>Camera Preview</h3>
                  <p>Click "Start Multistream" to begin broadcasting</p>
                </div>
              )}
            </div>

            {error && (
              <div className="error-message">
                <i className="fas fa-exclamation-triangle" style={{ marginRight: "8px" }}></i>
                {error}
              </div>
            )}

            <div className="stream-controls">
              <button
                className={`btn ${isStreaming ? "btn-danger" : "btn-primary"}`}
                onClick={handleStreamToggle}
              >
                <i className={`fas fa-${isStreaming ? "stop" : "play"}`}></i>
                {isStreaming ? "Stop Streaming" : "Start Multistream"}
              </button>

              <button className="btn btn-secondary">
                <i className="fas fa-cog"></i>
                Stream Settings
              </button>
            </div>

            <div className="hint-text">
              {isStreaming
                ? 'Live streaming to connected platforms. Click "Stop Streaming" to end broadcast.'
                : 'Camera preview will start when you click "Start Multistream". Make sure to allow camera and microphone permissions.'}
            </div>
          </div>

          <div className="analytics-section">
            <div className="section-header">
              <h2>Stream Analytics</h2>
              <div className="update-text">Updated in real-time</div>
            </div>

            <div className="analytics-cards">
              {analytics.map((stat) => (
                <div className="analytics-card" key={stat.id}>
                  <div className="analytics-icon" style={{ background: stat.color }}>
                    <i className={stat.icon}></i>
                  </div>
                  <div className="analytics-content">
                    <h3>{stat.value}</h3>
                    <p>{stat.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Platform Status Section intentionally removed */}
      </div>
    </div>
  );
}

export default Dashboard;
