import React, { useEffect, useRef, useState, useCallback } from "react";

const SRS_RTC_BASE = "webrtc://srs.streammova.xyz/live";

export default function StreamTogether() {
  const [mode, setMode] = useState(null);
  const [guestJoined, setGuestJoined] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const videoHostRef = useRef(null);
  const videoGuestRef = useRef(null);
  const canvasRef = useRef(null);
  const hostStreamRef = useRef(null);
  const guestStreamRef = useRef(null);
  const publisherRef = useRef(null);
  const playerRef = useRef(null);
  const pollRef = useRef(null);
  const animRef = useRef(null);

  // Check URL for guest invite on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      setMode("guest");
      setRoomId(room);
    }
  }, []);

  // Load SRS SDK
  const loadSdk = useCallback(() => {
    return new Promise((resolve) => {
      if (window.SrsRtcPublisherAsync && window.SrsRtcPlayerAsync) return resolve();
      const s = document.createElement("script");
      s.src = "/vendor/srs/srs.sdk.js";
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }, []);

  // Canvas drawing - combines host and guest
  const startDrawing = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    canvas.width = 1280;
    canvas.height = 720;

    const frame = () => {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, 1280, 720);

      // Host left half
      if (videoHostRef.current?.readyState >= 2) {
        ctx.drawImage(videoHostRef.current, 0, 0, 640, 720);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.font = "18px Arial";
        ctx.textAlign = "left";
        ctx.fillText("HOST", 20, 30);
      }

      // Guest right half
      if (videoGuestRef.current?.readyState >= 2) {
        ctx.drawImage(videoGuestRef.current, 640, 0, 640, 720);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.font = "18px Arial";
        ctx.textAlign = "left";
        ctx.fillText("GUEST", 660, 30);
      }

      // Waiting message if no guest
      if (!videoGuestRef.current || videoGuestRef.current.readyState < 2) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Waiting for guest to join...", 960, 360);
      }

      animRef.current = requestAnimationFrame(frame);
    };
    frame();
  }, []);

  // ============ HOST FUNCTIONS ============
  const startAsHost = async () => {
    setLoading(true);
    setError("");
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      
      hostStreamRef.current = stream;
      
      // Wait for video element to be ready
      if (videoHostRef.current) {
        videoHostRef.current.srcObject = stream;
        await videoHostRef.current.play();
      }
      
      startDrawing();
      setMode("host");

      const id = `room-${Date.now()}`;
      setRoomId(id);
      setInviteLink(`${window.location.origin}/stream-together?room=${id}`);
    } catch (err) {
      console.error("Camera error:", err);
      setError("Camera access denied. Please allow camera permissions in your browser settings.");
      setMode(null);
    } finally {
      setLoading(false);
    }
  };

  const goLive = async () => {
    setLoading(true);
    setError("");
    
    try {
      await loadSdk();
      
      const mixed = canvasRef.current.captureStream(30);
      const audioTrack = hostStreamRef.current?.getAudioTracks()[0];
      if (audioTrack) mixed.addTrack(audioTrack);

      const pub = new window.SrsRtcPublisherAsync();
      await pub.publish(`${SRS_RTC_BASE}/${roomId}`, mixed);
      publisherRef.current = pub;
      setIsLive(true);

      // Poll for guest
      pollRef.current = setInterval(async () => {
        if (!window.SrsRtcPlayerAsync) return;
        try {
          const player = new window.SrsRtcPlayerAsync();
          await player.play(`${SRS_RTC_BASE}/${roomId}-guest`);
          
          const vid = document.createElement("video");
          vid.autoplay = true;
          vid.muted = true;
          vid.playsInline = true;
          vid.srcObject = player.stream;
          await vid.play();
          
          videoGuestRef.current = vid;
          playerRef.current = player;
          setGuestJoined(true);
          clearInterval(pollRef.current);
        } catch (e) {
          // Guest not yet connected
        }
      }, 3000);
    } catch (err) {
      console.error("SRS error:", err);
      setError("Failed to publish stream. Check if SRS server is running.");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      // Fallback for older browsers
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const stopHost = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    publisherRef.current?.close();
    playerRef.current?.close();
    hostStreamRef.current?.getTracks().forEach(t => t.stop());
    if (videoHostRef.current) videoHostRef.current.srcObject = null;
    setIsLive(false);
    setGuestJoined(false);
    setMode(null);
    setInviteLink("");
    setRoomId("");
    setError("");
  };

  // ============ GUEST FUNCTIONS ============
  const joinAsGuest = async () => {
    setLoading(true);
    setError("");
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      
      guestStreamRef.current = stream;
      
      // Show preview immediately
      if (videoGuestRef.current) {
        videoGuestRef.current.srcObject = stream;
        await videoGuestRef.current.play();
      }

      await loadSdk();
      const pub = new window.SrsRtcPublisherAsync();
      await pub.publish(`${SRS_RTC_BASE}/${roomId}-guest`, stream);
      publisherRef.current = pub;
      setGuestJoined(true);
    } catch (err) {
      console.error("Join error:", err);
      if (err.name === "NotAllowedError") {
        setError("Camera access was denied. Please allow camera permissions and try again.");
      } else {
        setError("Failed to join. Please check your camera and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const stopGuest = () => {
    publisherRef.current?.close();
    guestStreamRef.current?.getTracks().forEach(t => t.stop());
    if (videoGuestRef.current) videoGuestRef.current.srcObject = null;
    setGuestJoined(false);
    setMode(null);
    setRoomId("");
    setError("");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      publisherRef.current?.close();
      playerRef.current?.close();
      hostStreamRef.current?.getTracks().forEach(t => t.stop());
      guestStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ============ RENDER ============

  // Loading overlay
  if (loading) {
    return (
      <div style={styles.container}>
        <p style={{ color: "#fff", fontSize: 18 }}>Accessing camera...</p>
        <p style={{ color: "#888", fontSize: 14 }}>Please allow camera permissions when prompted.</p>
      </div>
    );
  }

  // Error display
  if (error) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.errorBox, marginBottom: 20 }}>❌ {error}</div>
        <button onClick={() => { setError(""); setMode(null); }} style={styles.primaryBtn}>
          Try Again
        </button>
      </div>
    );
  }

  // ============ CHOOSE MODE SCREEN ============
  if (mode === null) {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>Stream Together</h2>
        <p style={styles.subtext}>Host a room or join as a guest</p>
        
        <div style={styles.buttonGroup}>
          <button onClick={startAsHost} style={styles.primaryBtn}>
            🎥 Start as Host
          </button>
          <div style={styles.divider}>
            <span style={styles.dividerText}>OR</span>
          </div>
          <div style={styles.joinBox}>
            <input
              placeholder="Paste room link or room ID"
              onChange={(e) => {
                const val = e.target.value;
                const match = val.match(/room=([^&]+)/);
                setRoomId(match ? match[1] : val);
              }}
              style={styles.input}
            />
            <button
              onClick={() => roomId && setMode("guest")}
              disabled={!roomId}
              style={{ ...styles.secondaryBtn, opacity: roomId ? 1 : 0.5 }}
            >
              Join as Guest
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ GUEST VIEW ============
  if (mode === "guest") {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>
          {guestJoined ? "✅ You're Live!" : "Join Stream"}
        </h2>
        
        {guestJoined && (
          <p style={{ color: "#0f0", marginBottom: 16 }}>
            The host can see you now. Your camera is on the right side.
          </p>
        )}

        {/* Guest video preview */}
        <video 
          ref={videoGuestRef} 
          autoPlay 
          muted 
          playsInline 
          style={styles.video}
        />

        {!guestJoined ? (
          <div>
            <p style={{ color: "#888", marginBottom: 16 }}>
              Click below to share your camera with the host.
            </p>
            <button onClick={joinAsGuest} style={styles.primaryBtn}>
              Share Camera & Join
            </button>
          </div>
        ) : (
          <button onClick={stopGuest} style={styles.dangerBtn}>
            Leave Stream
          </button>
        )}
        
        <button onClick={() => { stopGuest(); setMode(null); }} style={styles.backBtn}>
          ← Back
        </button>
      </div>
    );
  }

  // ============ HOST VIEW ============
  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Host Stream</h2>

      {/* Preview Canvas */}
      <canvas ref={canvasRef} style={styles.canvas} />
      {isLive && <p style={styles.liveBadge}>● LIVE</p>}

      {/* Host video preview */}
      {!isLive && (
        <div style={{ marginTop: 16 }}>
          <p style={{ color: "#888", fontSize: 14 }}>Your camera preview:</p>
          <video 
            ref={videoHostRef} 
            autoPlay 
            muted 
            playsInline 
            style={{ ...styles.video, maxWidth: 300 }} 
          />
        </div>
      )}

      {/* Controls */}
      <div style={styles.controls}>
        {!isLive ? (
          <button onClick={goLive} style={styles.primaryBtn}>
            Go Live & Get Invite Link
          </button>
        ) : (
          <button onClick={stopHost} style={styles.dangerBtn}>
            Stop Stream
          </button>
        )}
      </div>

      {/* Invite Link */}
      {inviteLink && (
        <div style={styles.inviteBox}>
          <h3 style={{ marginTop: 0 }}>📋 Invite Guest</h3>
          <p style={{ color: "#888", fontSize: 14, marginBottom: 12 }}>
            Share this link. When the guest joins, they will appear on the right side.
          </p>
          <div style={styles.copyRow}>
            <input 
              value={inviteLink} 
              readOnly 
              onClick={e => e.target.select()} 
              style={styles.input} 
            />
            <button onClick={copyLink} style={styles.copyBtn}>
              {copied ? "✓" : "Copy"}
            </button>
          </div>
          
          {/* Guest Status */}
          <div style={{ 
            marginTop: 16, 
            padding: 10, 
            background: guestJoined ? "#0a2a0a" : "#2a2a0a",
            borderRadius: 6,
          }}>
            <span style={{ color: guestJoined ? "#0f0" : "#ff0" }}>
              {guestJoined ? "✅ Guest connected!" : "⏳ Waiting for guest..."}
            </span>
          </div>

          {/* SRS Output Info */}
          {isLive && (
            <div style={styles.srsInfo}>
              <p style={{ color: "#666", fontSize: 12, margin: "8px 0 0 0" }}>
                FFmpeg/VLC: <code style={styles.code}>{SRS_RTC_BASE}/{roomId}</code>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Hidden host video for compositor (used when live) */}
      {isLive && <video ref={videoHostRef} muted playsInline style={{ display: "none" }} />}
    </div>
  );
}

// ============ STYLES ============
const styles = {
  container: {
    maxWidth: 700,
    margin: "0 auto",
    padding: 24,
    fontFamily: "sans-serif",
    textAlign: "center",
    color: "#fff",
    background: "#0a0a0a",
    minHeight: "100vh",
  },
  heading: {
    fontSize: 28,
    marginBottom: 8,
  },
  subtext: {
    color: "#888",
    marginBottom: 32,
  },
  buttonGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    alignItems: "center",
  },
  primaryBtn: {
    padding: "14px 40px",
    fontSize: 18,
    cursor: "pointer",
    backgroundColor: "#9146FF",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: "bold",
  },
  secondaryBtn: {
    padding: "12px 32px",
    fontSize: 16,
    cursor: "pointer",
    backgroundColor: "#444",
    color: "#fff",
    border: "none",
    borderRadius: 8,
  },
  dangerBtn: {
    padding: "12px 32px",
    fontSize: 16,
    cursor: "pointer",
    backgroundColor: "#e74c3c",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    marginTop: 16,
  },
  backBtn: {
    padding: "10px 20px",
    fontSize: 14,
    cursor: "pointer",
    backgroundColor: "transparent",
    color: "#888",
    border: "1px solid #444",
    borderRadius: 6,
    marginTop: 12,
    display: "block",
    margin: "12px auto 0",
  },
  divider: {
    width: "100%",
    borderTop: "1px solid #333",
    margin: "8px 0",
    position: "relative",
  },
  dividerText: {
    position: "absolute",
    top: -10,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#0a0a0a",
    padding: "0 12px",
    color: "#666",
    fontSize: 14,
  },
  joinBox: {
    display: "flex",
    gap: 8,
    width: "100%",
    maxWidth: 500,
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    background: "#1a1a1a",
    color: "#fff",
    border: "1px solid #444",
    borderRadius: 6,
    fontSize: 14,
  },
  video: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 10,
    background: "#111",
    margin: "20px auto",
    display: "block",
  },
  canvas: {
    width: "100%",
    borderRadius: 10,
    background: "#111",
    border: "1px solid #333",
  },
  liveBadge: {
    color: "#0f0",
    fontWeight: "bold",
    marginTop: 8,
  },
  controls: {
    marginTop: 20,
  },
  inviteBox: {
    marginTop: 24,
    padding: 20,
    background: "#1a1a1a",
    borderRadius: 10,
    textAlign: "left",
  },
  copyRow: {
    display: "flex",
    gap: 8,
  },
  copyBtn: {
    padding: "10px 20px",
    cursor: "pointer",
    backgroundColor: "#444",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontWeight: "bold",
  },
  srsInfo: {
    marginTop: 12,
    padding: 10,
    background: "#111",
    borderRadius: 6,
  },
  code: {
    background: "#333",
    padding: "2px 6px",
    borderRadius: 3,
    color: "#0ff",
    fontSize: 12,
  },
  errorBox: {
    padding: 16,
    background: "#2a0a0a",
    border: "1px solid #ff4444",
    borderRadius: 8,
    color: "#ff6666",
    fontSize: 14,
  },
};