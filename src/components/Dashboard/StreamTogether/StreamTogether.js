import React, { useEffect, useRef, useState, useCallback } from "react";

// Configuration
const SRS_RTC_BASE = "webrtc://srs.streammova.xyz/live";
const API_BASE = "https://api.streammova.xyz/api/stream-together";
const POLL_INTERVAL = 3000; // 3 seconds - gentle on server, avoids Cloudflare rate limits

export default function StreamTogether() {
  const path = window.location.pathname;
  const inviteId = path.split("/invite/")[1];

  // Route based on URL
  if (inviteId) {
    return <GuestView inviteId={inviteId} />;
  }
  return <HostView />;
}

// =========================
// HOST VIEW
// =========================
function HostView() {
  const [hasGuest, setHasGuest] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const pollTimerRef = useRef(null);

  // Element Refs
  const video1Ref = useRef(null); // Host hidden video
  const video2Ref = useRef(null); // Guest hidden video  
  const canvasRef = useRef(null); // Combined output

  // WebRTC Refs
  const hostStreamRef = useRef(null);
  const compositedPublisherRef = useRef(null);
  const guestPlayerRef = useRef(null);
  const animationRef = useRef(null);
  const guestVideoElRef = useRef(null); // Guest video element (created dynamically)

  // 1. Canvas compositor - draws host + guest side by side
  const startCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    canvas.width = 1280;
    canvas.height = 720;

    const draw = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 1280, 720);

      const hasHost = video1Ref.current && video1Ref.current.readyState >= 2;
      const guestVideo = guestVideoElRef.current;
      const hasGuestVideo = guestVideo && guestVideo.readyState >= 2;

      if (hasGuestVideo) {
        // Side by side
        if (hasHost) ctx.drawImage(video1Ref.current, 0, 0, 640, 720);
        ctx.drawImage(guestVideo, 640, 0, 640, 720);
        
        // Labels
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.font = "20px Arial";
        ctx.fillText("HOST", 20, 40);
        ctx.fillText("GUEST", 660, 40);
      } else if (hasHost) {
        // Full screen host
        ctx.drawImage(video1Ref.current, 0, 0, 1280, 720);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "24px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Waiting for guest to join...", 640, 360);
      } else {
        // No video yet
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "24px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Starting camera...", 640, 360);
      }

      animationRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, []);

  // 2. Start host camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      hostStreamRef.current = stream;
      if (video1Ref.current) {
        video1Ref.current.srcObject = stream;
        video1Ref.current.play().catch(() => {});
      }
      startCanvas();
    } catch (err) {
      console.error("Camera error:", err);
      alert("Could not access camera. Please check permissions.");
    }
  }, [startCanvas]);

  // 3. Create session (minimal API call)
  const createSession = async () => {
    const id = `session-${Date.now()}`;
    
    try {
      // Try to register with backend (gracefully handle if offline)
      await fetch(`${API_BASE}/create-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      }).catch(() => {}); // Fail silently if backend not available
    } catch (e) {
      // Continue offline - SRS still works
    }

    setSessionId(id);
    setInviteLink(`${window.location.origin}/invite/${id}`);
    return id;
  };

  // 4. Poll for guest (gentle polling to avoid Cloudflare blocks)
  const startPolling = useCallback((sId) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      // Try backend first
      try {
        const res = await fetch(`${API_BASE}/session/${sId}`);
        const data = await res.json();
        if (data.session?.guestJoined && !hasGuest) {
          await connectGuest(sId);
        }
      } catch (e) {
        // Backend not available - try direct SRS connection
        if (!hasGuest) {
          await tryDirectGuestConnection(sId);
        }
      }
    }, POLL_INTERVAL);
  }, [hasGuest]);

  // 5. Connect to guest via SRS directly
  const connectGuest = async (sId) => {
    if (!window.SrsRtcPlayerAsync) {
      console.warn("SRS SDK not loaded");
      return;
    }

    try {
      const player = new window.SrsRtcPlayerAsync();
      await player.play(`${SRS_RTC_BASE}/${sId}-guest`);
      
      // Create video element for guest
      const guestVideo = document.createElement("video");
      guestVideo.autoplay = true;
      guestVideo.muted = true;
      guestVideo.playsInline = true;
      guestVideo.srcObject = player.stream;
      guestVideo.play().catch(() => {});
      
      guestVideoElRef.current = guestVideo;
      guestPlayerRef.current = player;
      setHasGuest(true);
    } catch (e) {
      // Guest hasn't published yet, will retry on next poll
    }
  };

  // 5b. Direct SRS connection attempt (bypasses backend)
  const tryDirectGuestConnection = async (sId) => {
    if (!window.SrsRtcPlayerAsync) return;
    
    try {
      const player = new window.SrsRtcPlayerAsync();
      await player.play(`${SRS_RTC_BASE}/${sId}-guest`);
      
      const guestVideo = document.createElement("video");
      guestVideo.autoplay = true;
      guestVideo.muted = true;
      guestVideo.playsInline = true;
      guestVideo.srcObject = player.stream;
      guestVideo.play().catch(() => {});
      
      guestVideoElRef.current = guestVideo;
      guestPlayerRef.current = player;
      setHasGuest(true);
    } catch (e) {
      // Guest not connected yet
    }
  };

  // 6. Publish composited stream to SRS
  const publishToSrs = async () => {
    if (!window.SrsRtcPublisherAsync || !canvasRef.current) return;

    const sId = sessionId || await createSession();
    
    const mixedStream = canvasRef.current.captureStream(30);
    
    // Add host audio
    if (hostStreamRef.current) {
      const audioTrack = hostStreamRef.current.getAudioTracks()[0];
      if (audioTrack) mixedStream.addTrack(audioTrack);
    }

    const publisher = new window.SrsRtcPublisherAsync();
    await publisher.publish(`${SRS_RTC_BASE}/${sId}-composited`, mixedStream);
    compositedPublisherRef.current = publisher;
    
    setIsLive(true);
    startPolling(sId);
  };

  // 7. Copy invite link
  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      cancelAnimationFrame(animationRef.current);
      clearInterval(pollTimerRef.current);
      hostStreamRef.current?.getTracks().forEach(t => t.stop());
      compositedPublisherRef.current?.close();
      guestPlayerRef.current?.close();
      guestVideoElRef.current?.remove();
    };
  }, [startCamera]);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      <h2 style={{ textAlign: "center" }}>Stream Together - Host</h2>

      {/* Combined Preview */}
      <div style={{ textAlign: "center", margin: "20px 0" }}>
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            maxWidth: "640px",
            height: "auto",
            background: "#111",
            borderRadius: "8px",
            border: isLive ? "2px solid #00ff00" : "2px solid #333",
          }}
        />
        {isLive && (
          <div style={{ color: "#00ff00", marginTop: "8px" }}>
            ● LIVE - Streaming to SRS
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
        {!isLive ? (
          <button
            onClick={publishToSrs}
            style={{
              padding: "10px 24px",
              fontSize: "16px",
              cursor: "pointer",
              backgroundColor: "#9146FF",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
            }}
          >
            Go Live & Open Room
          </button>
        ) : (
          <button
            onClick={() => {
              compositedPublisherRef.current?.close();
              setIsLive(false);
            }}
            style={{
              padding: "10px 24px",
              fontSize: "16px",
              cursor: "pointer",
              backgroundColor: "#ff4444",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
            }}
          >
            Stop Streaming
          </button>
        )}
      </div>

      {/* Invite Section */}
      {inviteLink && (
        <div style={{ marginTop: "30px", padding: "20px", background: "#1a1a1a", borderRadius: "12px" }}>
          <h3 style={{ marginTop: 0 }}>Invite Guest</h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={inviteLink}
              readOnly
              style={{
                flex: 1,
                padding: "10px",
                fontSize: "14px",
                background: "#2a2a2a",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: "6px",
              }}
              onClick={(e) => e.target.select()}
            />
            <button
              onClick={copyLink}
              style={{
                padding: "10px 20px",
                cursor: "pointer",
                backgroundColor: copied ? "#00aa00" : "#444",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                minWidth: "80px",
              }}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <p style={{ color: "#888", fontSize: "14px", marginTop: "12px" }}>
            Status: {hasGuest ? "✅ Guest connected" : "⏳ Waiting for guest..."}
          </p>
          {isLive && (
            <p style={{ color: "#888", fontSize: "12px" }}>
              FFmpeg pull URL: <code style={{ background: "#333", padding: "2px 6px" }}>{SRS_RTC_BASE}/{sessionId}-composited</code>
            </p>
          )}
        </div>
      )}

      {/* Hidden videos for compositor */}
      <video ref={video1Ref} muted playsInline style={{ display: "none" }} />
      <video ref={video2Ref} muted playsInline style={{ display: "none" }} />
    </div>
  );
}

// =========================
// GUEST VIEW
// =========================
function GuestView({ inviteId }) {
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const publisherRef = useRef(null);

  const join = async () => {
    setConnecting(true);
    
    try {
      // Get guest camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      streamRef.current = stream;

      // Show preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Load SRS SDK
      if (!window.SrsRtcPublisherAsync) {
        await new Promise((resolve) => {
          const script = document.createElement("script");
          script.src = "/vendor/srs/srs.sdk.js";
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }

      // Publish to SRS
      const publisher = new window.SrsRtcPublisherAsync();
      await publisher.publish(`${SRS_RTC_BASE}/${inviteId}-guest`, stream);
      publisherRef.current = publisher;

      // Notify backend (optional)
      try {
        await fetch(`${API_BASE}/join-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: inviteId }),
        });
      } catch (e) {
        // Backend not required for SRS connection
      }

      setJoined(true);
    } catch (err) {
      console.error("Failed to join:", err);
      alert("Could not join. Check camera permissions and try again.");
    } finally {
      setConnecting(false);
    }
  };

  const leave = () => {
    publisherRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setJoined(false);
  };

  useEffect(() => {
    return () => {
      publisherRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto", textAlign: "center" }}>
      <h2>Join Stream as Guest</h2>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: "100%",
          maxWidth: "400px",
          borderRadius: "8px",
          background: "#111",
          margin: "20px auto",
        }}
      />

      {!joined ? (
        <button
          onClick={join}
          disabled={connecting}
          style={{
            padding: "12px 40px",
            fontSize: "18px",
            cursor: "pointer",
            backgroundColor: connecting ? "#666" : "#9146FF",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
          }}
        >
          {connecting ? "Connecting..." : "Join Stream"}
        </button>
      ) : (
        <div>
          <p style={{ color: "#00ff00", fontSize: "18px" }}>✅ You're live!</p>
          <p style={{ color: "#888" }}>Your camera is being combined with the host's stream.</p>
          <button
            onClick={leave}
            style={{
              padding: "12px 40px",
              fontSize: "16px",
              cursor: "pointer",
              backgroundColor: "#ff4444",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              marginTop: "20px",
            }}
          >
            Leave Stream
          </button>
        </div>
      )}
    </div>
  );
}