import React, { useEffect, useMemo, useRef, useState } from "react";
import "./Dashboard.css";
// Public SRS host (no SSH tunnel)
const SRS_HOST = "84.8.132.222";

// Prefer WHIP over HTTPS from Netlify (recommended)
// If you later put SRS behind your own domain + TLS, replace host with your domain.
const SRS_WHIP_URL = `https://${SRS_HOST}:8080/rtc/v1/whip/?app=live&stream=test`;


function getInitials(nameOrEmail = "") {
  const s = String(nameOrEmail).trim();
  if (!s) return "U";

  // If it's an email, use part before @
  const base = s.includes("@") ? s.split("@")[0] : s;
  const parts = base.replace(/[_\-.]+/g, " ").split(" ").filter(Boolean);

  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Expected localStorage user payload examples:
 * 1) localStorage.setItem("user", JSON.stringify({ displayName:"Mpate", plan:"Pro", photoURL:"..." }))
 * 2) localStorage.setItem("user", JSON.stringify({ name:"Mpate", email:"mpate@mail.com" }))
 */
function readUserFromStorage() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (!u || typeof u !== "object") return null;
    return u;
  } catch {
    return null;
  }
}

function Dashboard() {
  // Sidebar open/close (hamburger hides/shows)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  

  const [isStreaming, setIsStreaming] = useState(false);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState("");

  // Logged-in user UI (from localStorage by default)
  const [user, setUser] = useState(() => readUserFromStorage());

  const [showChannelModal, setShowChannelModal] = useState(false);
  const [connectedChannels, setConnectedChannels] = useState([]);

  const [channelForm, setChannelForm] = useState({
    platform: "",
    streamKey: "",
    title: "",
    testStatus: "idle", // "idle" | "testing" | "connected" | "failed"
    testMessage: "",
  });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const modalRef = useRef(null);
  const pcRef = useRef(null);


  // Platform list + logos
  const availablePlatforms = [
    {
      id: "youtube",
      name: "YouTube",
      icon: "fab fa-youtube",
      color: "#FF0000",
      logo: "https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg",
    },
    {
      id: "facebook",
      name: "Facebook",
      icon: "fab fa-facebook",
      color: "#1877F2",
      logo:
        "https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg",
    },
    {
      id: "instagram",
      name: "Instagram",
      icon: "fab fa-instagram",
      color: "#E4405F",
      logo: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png",
    },
    {
      id: "tiktok",
      name: "TikTok",
      icon: "fab fa-tiktok",
      color: "#000000",
      logo: "https://upload.wikimedia.org/wikipedia/en/a/a9/TikTok_logo.svg",
    },
    {
      id: "twitch",
      name: "Twitch",
      icon: "fab fa-twitch",
      color: "#9147ff",
      logo: "https://upload.wikimedia.org/wikipedia/commons/2/26/Twitch_logo.svg",
    },
    {
      id: "twitter",
      name: "Twitter (X)",
      icon: "fab fa-twitter",
      color: "#1DA1F2",
      logo: "https://upload.wikimedia.org/wikipedia/commons/6/6f/Logo_of_Twitter.svg",
    },
  ];

  const getPlatform = (id) => availablePlatforms.find((p) => p.id === id);

  // If user changes in localStorage (e.g., after login), reflect it
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "user") setUser(readUserFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const displayName =
    user?.displayName || user?.name || user?.fullName || user?.email || "User";
  const planName = user?.plan || user?.subscription || user?.tier || "Free Plan";
  const avatarInitials = useMemo(() => getInitials(displayName), [displayName]);

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
      value: `${connectedChannels.length} Connected`,
      icon: "fas fa-satellite-dish",
      color: "linear-gradient(135deg, #f46b45, #eea849)",
    },
  ];

  const toggleSidebar = () => setIsSidebarOpen((s) => !s);

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setShowChannelModal(false);
      }
    };

    if (showChannelModal) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showChannelModal]);

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

try {
  await publishToSRS_WHIP(stream);
  setIsStreaming(true);
} catch (e) {
  console.error(e);
  setError(
    "Camera started, but failed to publish to SRS. Check SRS WHIP (8080 HTTPS) / firewall / TLS."
  );
  setIsStreaming(false);
}

  };

  async function publishToSRS_WHIP(stream) {
  // Create PeerConnection
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }], // ok for NAT traversal
  });

  pcRef.current = pc;

  // Add tracks
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));

  // Create SDP offer
  const offer = await pc.createOffer({
    offerToReceiveAudio: false,
    offerToReceiveVideo: false,
  });
  await pc.setLocalDescription(offer);

  // Wait for ICE gathering to complete (so offer SDP includes candidates)
  await new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const onState = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", onState);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onState);
  });

  // Send offer SDP to SRS WHIP endpoint
  const res = await fetch(SRS_WHIP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
    },
    body: pc.localDescription.sdp,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WHIP publish failed: ${res.status} ${res.statusText} ${text}`);
  }

  // SRS returns answer SDP
  const answerSdp = await res.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  // Optional: helpful logs
  pc.onconnectionstatechange = () => {
    console.log("PC connectionState:", pc.connectionState);
  };
  pc.oniceconnectionstatechange = () => {
    console.log("PC iceConnectionState:", pc.iceConnectionState);
  };
}


  const stopCamera = () => {

    if (pcRef.current) {
  try { pcRef.current.close(); } catch {}
  pcRef.current = null;
}

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

  const handleOpenChannelModal = () => {
    setShowChannelModal(true);
    setChannelForm({
      platform: "",
      streamKey: "",
      title: "",
      testStatus: "idle",
      testMessage: "",
    });
  };

  const handleCloseChannelModal = () => setShowChannelModal(false);

  const handlePlatformSelect = (platformId) => {
    setChannelForm((prev) => ({
      ...prev,
      platform: platformId,
      testStatus: "idle",
      testMessage: "",
    }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setChannelForm((prev) => ({
      ...prev,
      [name]: value,
      testStatus: name === "streamKey" ? "idle" : prev.testStatus,
      testMessage: name === "streamKey" ? "" : prev.testMessage,
    }));
  };

  const handleTestConnection = async () => {
    if (!channelForm.platform || !channelForm.streamKey) {
      setChannelForm((prev) => ({
        ...prev,
        testStatus: "failed",
        testMessage: "Select a platform and enter a stream key/RTMP URL first.",
      }));
      return;
    }

    const platform = getPlatform(channelForm.platform);

    const alreadyConnected = connectedChannels.some((c) => c.platform === channelForm.platform);
    if (alreadyConnected) {
      setChannelForm((prev) => ({
        ...prev,
        testStatus: "failed",
        testMessage: `${platform.name} is already connected.`,
      }));
      return;
    }

    setChannelForm((prev) => ({
      ...prev,
      testStatus: "testing",
      testMessage: "Testing connection…",
    }));

    await new Promise((r) => setTimeout(r, 900));

    const ok = String(channelForm.streamKey).trim().length >= 8;
    if (!ok) {
      setChannelForm((prev) => ({
        ...prev,
        testStatus: "failed",
        testMessage: "Connection failed. Stream key/URL looks invalid.",
      }));
      return;
    }

    const newChannel = {
      id: Date.now(),
      platform: platform.id,
      name: platform.name,
      icon: platform.icon,
      color: platform.color,
      logo: platform.logo,
      streamKey: channelForm.streamKey,
      title: channelForm.title || `Stream to ${platform.name}`,
      status: "connected",
      addedAt: new Date().toISOString(),
    };

    setConnectedChannels((prev) => [...prev, newChannel]);

    setChannelForm((prev) => ({
      ...prev,
      testStatus: "connected",
      testMessage: "Connected successfully!",
    }));

    setTimeout(() => {
      setShowChannelModal(false);
      setChannelForm({
        platform: "",
        streamKey: "",
        title: "",
        testStatus: "idle",
        testMessage: "",
      });
    }, 500);
  };

  const handleRemoveChannel = (channelId) => {
    setConnectedChannels((prev) => prev.filter((channel) => channel.id !== channelId));
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const selectedPlatform = channelForm.platform ? getPlatform(channelForm.platform) : null;

  return (
    <div className={`streammova-app ${isSidebarOpen ? "" : "sidebar-collapsed"}`}>
      {/* Channel Modal Popup */}
      {showChannelModal && (
        <div className="modal-overlay">
          <div className="channel-modal" ref={modalRef}>
            <div className="modal-header">
              <h3>
                Add Streaming Channel{" "}
                {selectedPlatform && (
                  <span style={{ marginLeft: 10, fontSize: 14, opacity: 0.8 }}>
                    <img
                      src={selectedPlatform.logo}
                      alt={`${selectedPlatform.name} logo`}
                      className="platform-logo-inline"
                    />
                    {selectedPlatform.name}
                  </span>
                )}
              </h3>
              <button className="modal-close" onClick={handleCloseChannelModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Select Platform</label>
                <div className="platform-grid">
                  {availablePlatforms.map((platform) => (
                    <button
                      key={platform.id}
                      type="button"
                      className={`platform-option ${
                        channelForm.platform === platform.id ? "selected" : ""
                      }`}
                      onClick={() => handlePlatformSelect(platform.id)}
                    >
                      <img
                        src={platform.logo}
                        alt={`${platform.name} logo`}
                        className="platform-logo"
                      />
                      <span>{platform.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {channelForm.platform && (
                <>
                  <div className="form-group">
                    <label>Stream Title (Optional)</label>
                    <input
                      type="text"
                      name="title"
                      placeholder={`Enter stream title for ${selectedPlatform?.name}`}
                      value={channelForm.title}
                      onChange={handleInputChange}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label>Stream Key / RTMP URL</label>
                    <input
                      type="password"
                      name="streamKey"
                      placeholder="Paste your stream key or RTMP URL"
                      value={channelForm.streamKey}
                      onChange={handleInputChange}
                      className="form-input"
                    />
                    <small className="help-text">
                      Find this in your {selectedPlatform?.name} streaming settings
                    </small>
                  </div>

                  <div className="connection-test">
                    <button
                      type="button"
                      className="test-btn"
                      onClick={handleTestConnection}
                      disabled={
                        channelForm.testStatus === "testing" ||
                        !channelForm.platform ||
                        !channelForm.streamKey
                      }
                    >
                      <i className="fas fa-plug"></i>
                      {channelForm.testStatus === "testing" ? "Testing..." : "Test Connection"}
                    </button>

                    <span className="test-status">
                      {channelForm.testStatus === "idle" && (
                        <>
                          <i className="fas fa-circle" style={{ color: "#ccc", fontSize: "10px" }}></i>{" "}
                          Not tested
                        </>
                      )}

                      {channelForm.testStatus === "testing" && (
                        <>
                          <i
                            className="fas fa-circle"
                            style={{ color: "#f1c40f", fontSize: "10px" }}
                          ></i>{" "}
                          Testing…
                        </>
                      )}

                      {channelForm.testStatus === "connected" && (
                        <>
                          <i
                            className="fas fa-circle"
                            style={{ color: "#38ef7d", fontSize: "10px" }}
                          ></i>{" "}
                          Connected
                        </>
                      )}

                      {channelForm.testStatus === "failed" && (
                        <>
                          <i
                            className="fas fa-circle"
                            style={{ color: "#FF416C", fontSize: "10px" }}
                          ></i>{" "}
                          Failed
                        </>
                      )}
                    </span>
                  </div>

                  {channelForm.testMessage && (
                    <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
                      {channelForm.testMessage}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseChannelModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleTestConnection}
                disabled={
                  channelForm.testStatus === "testing" ||
                  !channelForm.platform ||
                  !channelForm.streamKey
                }
              >
                <i className="fas fa-plug"></i>
                {channelForm.testStatus === "testing" ? "Testing..." : "Test & Connect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hamburger toggle (now works to HIDE + SHOW sidebar on all screen sizes) */}
      <button className="sidebar-toggle" onClick={toggleSidebar} aria-label="Toggle sidebar">
        {/* Use the StreamMova logo icon when sidebar is collapsed, hamburger when open */}
        {isSidebarOpen ? (
          <i className="fas fa-bars"></i>
        ) : (
          <div className="sidebar-toggle-logo">
            <i className="fas fa-satellite-dish"></i>
          </div>
        )}
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

              {/*Now uses the logged-in user's info (from localStorage "user") */}
              <div className="user-profile">
                <div className="user-avatar">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="User avatar"
                      style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
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

              <button className="btn btn-secondary" onClick={handleOpenChannelModal}>
                <i className="fas fa-plus"></i>
                Add channels
              </button>
            </div>

            {/* Connected Channels Display */}
            {connectedChannels.length > 0 && (
              <div className="connected-channels">
                <h4>Connected Channels ({connectedChannels.length})</h4>
                <div className="channels-list">
                  {connectedChannels.map((channel) => (
                    <div key={channel.id} className="channel-item">
                      <div className="channel-info">
                        <span className="channel-platform-icon">
                          <img
                            src={channel.logo}
                            alt={`${channel.name} logo`}
                            className="channel-logo"
                          />
                        </span>
                        <span className="channel-name">{channel.name}</span>
                      </div>

                      <div className="channel-actions">
                        <span className="channel-status">
                          <i className="fas fa-circle" style={{ color: "#38ef7d", fontSize: "10px" }}></i>
                          Connected
                        </span>

                        <button
                          className="channel-remove"
                          onClick={() => handleRemoveChannel(channel.id)}
                          title="Remove channel"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="hint-text">
              {isStreaming
                ? `Live streaming to ${connectedChannels.length} connected platforms. Click "Stop Streaming" to end broadcast.`
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
      </div>
    </div>
  );
}

export default Dashboard;
