import React, { useEffect, useRef, useState, useCallback } from "react";

const SRS_RTC_BASE = "webrtc://srs.streammova.xyz/live";

export default function StreamTogether() {
  const [mode, setMode] = useState(null); // null, 'host', 'guest'
  const [guestJoined, setGuestJoined] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [roomId, setRoomId] = useState("");

  // Refs for the Host View
  const videoHostRef = useRef(null);
  const videoGuestRef = useRef(null); // The stream player target for the host
  const canvasRef = useRef(null);
  const hostStreamRef = useRef(null);
  
  // Dedicated Ref for the Guest's independent local element preview
  const guestLocalVideoRef = useRef(null); 
  const guestStreamRef = useRef(null);

  const publisherRef = useRef(null);
  const playerRef = useRef(null);
  const pollRef = useRef(null);
  const animRef = useRef(null);
  
  // Audio Mixing Contexts for Host
  const audioContextRef = useRef(null);
  const audioDestinationRef = useRef(null);

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

  // Canvas drawing
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
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "18px Arial";
        ctx.fillText("HOST", 20, 30);
      }

      // Guest right half
      if (videoGuestRef.current?.readyState >= 2) {
        ctx.drawImage(videoGuestRef.current, 640, 0, 640, 720);
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "18px Arial";
        ctx.fillText("GUEST", 660, 30);
      }

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
    setMode("host");
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      hostStreamRef.current = stream;
      if (videoHostRef.current) {
        videoHostRef.current.srcObject = stream;
        videoHostRef.current.play().catch(e => console.error(e));
      }
      startDrawing();

      const id = `room-${Date.now()}`;
      setRoomId(id);
      setInviteLink(`${window.location.origin}/stream-together?room=${id}`);
    } catch (err) {
      alert("Camera access denied. Please allow camera permissions.");
      setMode(null);
    }
  };

  const goLive = async () => {
    await loadSdk();
    
    // 1. Force the canvas capture stream to maintain explicit 720p resolution rules
    const mixed = canvasRef.current.captureStream(30);
    const canvasVideoTrack = mixed.getVideoTracks()[0];
    if (canvasVideoTrack) {
      canvasVideoTrack.applyConstraints({
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }).catch(e => console.warn("Canvas constraint layout failed:", e));
    }

    // 2. Setup Audio Mixer Node Pipeline
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    audioContextRef.current = audioContext;
    
    const destNode = audioContext.createMediaStreamDestination();
    audioDestinationRef.current = destNode;

    // Attach host mic track if present
    if (hostStreamRef.current && hostStreamRef.current.getAudioTracks().length > 0) {
      const hostSource = audioContext.createMediaStreamSource(new MediaStream([hostStreamRef.current.getAudioTracks()[0]]));
      hostSource.connect(destNode);
    }

    // Combine Web Audio output track into the outbound stream canvas
    const mixedAudioTracks = destNode.stream.getAudioTracks();
    if (mixedAudioTracks.length > 0) {
      mixed.addTrack(mixedAudioTracks[0]);
    }

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
        
        vid.onloadedmetadata = () => {
          vid.play().catch(e => console.error(e));
          videoGuestRef.current = vid;
          playerRef.current = player;
          setGuestJoined(true);
          
          // 3. Dynamically inject the newly connected guest audio track into the master composite mix
          if (player.stream && player.stream.getAudioTracks().length > 0 && audioContextRef.current && audioDestinationRef.current) {
            const guestSource = audioContextRef.current.createMediaStreamSource(new MediaStream([player.stream.getAudioTracks()[0]]));
            guestSource.connect(audioDestinationRef.current);
          }
          
          clearInterval(pollRef.current);
        };
      } catch (e) {}
    }, 3000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const stopHost = () => {
    clearInterval(pollRef.current);
    cancelAnimationFrame(animRef.current);
    publisherRef.current?.close();
    playerRef.current?.close();
    hostStreamRef.current?.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    setIsLive(false);
    setGuestJoined(false);
    setMode(null);
    setInviteLink("");
    setRoomId("");
  };

  // ============ GUEST FUNCTIONS ============
  const joinAsGuest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      guestStreamRef.current = stream;

      if (guestLocalVideoRef.current) {
        guestLocalVideoRef.current.srcObject = stream;
        guestLocalVideoRef.current.play().catch(e => console.error(e));
      }

      await loadSdk();
      const pub = new window.SrsRtcPublisherAsync();
      await pub.publish(`${SRS_RTC_BASE}/${roomId}-guest`, stream);
      publisherRef.current = pub;
      setGuestJoined(true);
    } catch (err) {
      console.error(err);
      alert("Failed to join. Check camera permissions.");
    }
  };

  useEffect(() => {
    if (mode === "guest" && guestJoined && guestStreamRef.current && guestLocalVideoRef.current) {
      guestLocalVideoRef.current.srcObject = guestStreamRef.current;
      guestLocalVideoRef.current.play().catch(e => console.error(e));
    }
  }, [mode, guestJoined]);

  const stopGuest = () => {
    if (publisherRef.current) publisherRef.current.close();
    if (guestStreamRef.current) guestStreamRef.current.getTracks().forEach(t => t.stop());
    setGuestJoined(false);
    setMode(null);
    setRoomId("");
  };

  // Global Cleanup
  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (publisherRef.current) publisherRef.current.close();
      if (playerRef.current) playerRef.current.close();
      if (hostStreamRef.current) hostStreamRef.current.getTracks().forEach(t => t.stop());
      if (guestStreamRef.current) guestStreamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

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
              placeholder="Paste room link or ID"
              onChange={(e) => {
                const val = e.target.value;
                const match = val.match(/room=([^&]+)/);
                if (match) setRoomId(match[1]);
                else setRoomId(val);
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

  // ============ GUEST VIEW (BEFORE JOINING) ============
  if (mode === "guest" && !guestJoined) {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>Join Stream</h2>
        <video ref={guestLocalVideoRef} autoPlay muted playsInline style={styles.video} />
        <button onClick={joinAsGuest} style={styles.primaryBtn}>
          Join & Share Camera
        </button>
        <button onClick={() => setMode(null)} style={styles.backBtn}>
          &larr; Back
        </button>
      </div>
    );
  }

  // ============ GUEST VIEW (LIVE) ============
  if (mode === "guest" && guestJoined) {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>&#x2705; You're Live!</h2>
        <p style={{ color: "#0f0" }}>The host can see you now.</p>
        <video ref={guestLocalVideoRef} autoPlay muted playsInline style={styles.video} />
        <button onClick={stopGuest} style={styles.dangerBtn}>
          Leave Stream
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

      {/* Controls */}
      <div style={styles.controls}>
        {!isLive ? (
          <button onClick={goLive} style={styles.primaryBtn}>
            Go Live
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
          <h3>📋 Invite Guest</h3>
          <div style={styles.copyRow}>
            <input value={inviteLink} readOnly onClick={e => e.target.select()} style={styles.input} />
            <button onClick={copyLink} style={styles.copyBtn}>
              {copied ? "✓" : "Copy"}
            </button>
          </div>
          <p style={{ color: guestJoined ? "#0f0" : "#888", marginTop: 12 }}>
            {guestJoined ? "✅ Guest connected" : "⏳ Waiting for guest..."}
          </p>
          {isLive && (
            <p style={styles.srsInfo}>
              SRS Output: <code>{SRS_RTC_BASE}/{roomId}</code>
            </p>
          )}
        </div>
      )}

      {/* Hidden videos for compositor */}
      <video ref={videoHostRef} muted playsInline style={{ display: "none" }} />
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
    marginTop: 12,
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
    color: "#666",
    fontSize: 12,
    marginTop: 12,
  },
};