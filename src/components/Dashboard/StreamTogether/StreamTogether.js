import React, { useEffect, useRef, useState, useCallback } from "react";

const SRS_RTC_BASE = "webrtc://srs.streammova.xyz/live";

export default function StreamTogether() {
  const path = window.location.pathname;
  const inviteId = path.split("/invite/")[1];

  if (inviteId) {
    return <GuestView inviteId={inviteId} />;
  }
  return <HostView />;
}

// =========================
// HOST VIEW
// =========================
function HostView() {
  const [guestJoined, setGuestJoined] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const videoHostRef = useRef(null);
  const canvasRef = useRef(null);
  const hostStreamRef = useRef(null);
  const compositedPublisherRef = useRef(null);
  const guestPlayerRef = useRef(null);
  const guestVideoRef = useRef(null);
  const sessionRef = useRef(`room-${Date.now()}`);
  const pollRef = useRef(null);
  const animRef = useRef(null);

  // Draw host + guest side by side on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = 1280;
    canvas.height = 720;

    const frame = () => {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, 1280, 720);

      // Host (left)
      if (videoHostRef.current?.readyState >= 2) {
        ctx.drawImage(videoHostRef.current, 0, 0, 640, 720);
      }

      // Guest (right)
      if (guestVideoRef.current?.readyState >= 2) {
        ctx.drawImage(guestVideoRef.current, 640, 0, 640, 720);
      }

      // Labels
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.font = "18px Arial";
      ctx.fillText("HOST", 20, 30);
      
      if (guestVideoRef.current?.readyState >= 2) {
        ctx.fillText("GUEST", 660, 30);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Waiting for guest to join...", 960, 360);
      }

      animRef.current = requestAnimationFrame(frame);
    };
    frame();
  }, []);

  // Start camera and drawing
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      hostStreamRef.current = stream;
      if (videoHostRef.current) {
        videoHostRef.current.srcObject = stream;
        videoHostRef.current.play().catch(() => {});
      }
      draw();
    } catch (err) {
      console.error("Camera error:", err);
    }
  }, [draw]);

  // Load SRS SDK
  const loadSdk = useCallback(() => {
    return new Promise((resolve) => {
      if (window.SrsRtcPublisherAsync && window.SrsRtcPlayerAsync) {
        return resolve();
      }
      if (document.querySelector("[data-srs]")) {
        return resolve();
      }
      const s = document.createElement("script");
      s.src = "/vendor/srs/srs.sdk.js";
      s.dataset.srs = "1";
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }, []);

  // Wait for guest to publish their stream
  const waitForGuest = useCallback((sid) => {
    if (pollRef.current) clearInterval(pollRef.current);
    
    pollRef.current = setInterval(async () => {
      if (!window.SrsRtcPlayerAsync) return;
      
      try {
        const player = new window.SrsRtcPlayerAsync();
        await player.play(`${SRS_RTC_BASE}/${sid}-guest`);

        const vid = document.createElement("video");
        vid.autoplay = true;
        vid.muted = true;
        vid.playsInline = true;
        vid.srcObject = player.stream;
        vid.play().catch(() => {});

        guestVideoRef.current = vid;
        guestPlayerRef.current = player;
        setGuestJoined(true);
        clearInterval(pollRef.current);
      } catch (e) {
        // Guest not yet connected, keep polling
      }
    }, 3000);
  }, []);

  // Generate invite link and go live
  const goLive = async () => {
    await loadSdk();
    const sid = sessionRef.current;
    setInviteLink(`${window.location.origin}/invite/${sid}`);

    // Publish composited canvas to SRS
    const mixed = canvasRef.current.captureStream(30);
    if (hostStreamRef.current) {
      const audioTrack = hostStreamRef.current.getAudioTracks()[0];
      if (audioTrack) mixed.addTrack(audioTrack);
    }

    try {
      const pub = new window.SrsRtcPublisherAsync();
      await pub.publish(`${SRS_RTC_BASE}/${sid}`, mixed);
      compositedPublisherRef.current = pub;
      setIsLive(true);
      waitForGuest(sid);
    } catch (err) {
      console.error("SRS publish error:", err);
      alert("Failed to publish stream. Is SRS running?");
    }
  };

  // Copy invite link
  const copyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inviteLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  };

  // Stop everything
  const stop = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    compositedPublisherRef.current?.close();
    guestPlayerRef.current?.close();
    guestVideoRef.current?.remove();
    guestVideoRef.current = null;
    hostStreamRef.current?.getTracks().forEach((t) => t.stop());
    setIsLive(false);
    setGuestJoined(false);
    setInviteLink("");
  };

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      hostStreamRef.current?.getTracks().forEach((t) => t.stop());
      compositedPublisherRef.current?.close();
      guestPlayerRef.current?.close();
      guestVideoRef.current?.remove();
    };
  }, [startCamera]);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
      <h2>Stream Together</h2>

      {/* Preview */}
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          borderRadius: 10,
          background: "#111",
          border: isLive ? "2px solid #0f0" : "2px solid #333",
        }}
      />
      {isLive && <p style={{ color: "#0f0", textAlign: "center", fontWeight: "bold" }}>● LIVE</p>}

      {/* Buttons */}
      <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
        {!isLive ? (
          <button
            onClick={goLive}
            style={{
              padding: "10px 30px",
              fontSize: 16,
              cursor: "pointer",
              backgroundColor: "#9146FF",
              color: "#fff",
              border: "none",
              borderRadius: 6,
            }}
          >
            Go Live & Get Invite Link
          </button>
        ) : (
          <button
            onClick={stop}
            style={{
              padding: "10px 30px",
              fontSize: 16,
              cursor: "pointer",
              backgroundColor: "#e74c3c",
              color: "#fff",
              border: "none",
              borderRadius: 6,
            }}
          >
            Stop Stream
          </button>
        )}
      </div>

      {/* Invite Link Section */}
      {inviteLink && (
        <div
          style={{
            marginTop: 24,
            padding: 20,
            background: "#1a1a1a",
            borderRadius: 10,
            border: "1px solid #333",
          }}
        >
          <h3 style={{ marginTop: 0 }}>📋 Invite Guest Link</h3>
          <p style={{ color: "#888", fontSize: 14 }}>
            Share this link with your guest. They will appear on the right side of your stream.
          </p>
          
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input
              value={inviteLink}
              readOnly
              onClick={(e) => e.target.select()}
              style={{
                flex: 1,
                padding: "10px 14px",
                background: "#2a2a2a",
                color: "#fff",
                border: "1px solid #555",
                borderRadius: 6,
                fontSize: 14,
              }}
            />
            <button
              onClick={copyLink}
              style={{
                padding: "10px 20px",
                cursor: "pointer",
                backgroundColor: copied ? "#27ae60" : "#444",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                minWidth: 80,
                fontWeight: "bold",
              }}
            >
              {copied ? "✓ Copied!" : "Copy"}
            </button>
          </div>

          {/* Guest Status */}
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: guestJoined ? "#0a2a0a" : "#2a2a0a",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 20 }}>{guestJoined ? "✅" : "⏳"}</span>
            <span style={{ color: guestJoined ? "#0f0" : "#ff0", fontWeight: "bold" }}>
              {guestJoined ? "Guest connected! Side-by-side active." : "Waiting for guest to join..."}
            </span>
          </div>

          {/* SRS Output Info */}
          {isLive && (
            <div style={{ marginTop: 12, padding: 10, background: "#111", borderRadius: 6 }}>
              <p style={{ color: "#888", fontSize: 12, margin: 0 }}>
                FFmpeg can pull from:{" "}
                <code style={{ background: "#333", padding: "2px 6px", borderRadius: 3, color: "#0ff" }}>
                  {SRS_RTC_BASE}/{sessionRef.current}
                </code>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Hidden host video for compositor */}
      <video ref={videoHostRef} muted playsInline style={{ display: "none" }} />
    </div>
  );
}

// =========================
// GUEST VIEW
// =========================
function GuestView({ inviteId }) {
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const pubRef = useRef(null);

  const loadSdk = useCallback(() => {
    return new Promise((resolve) => {
      if (window.SrsRtcPublisherAsync) return resolve();
      if (document.querySelector("[data-srs]")) return resolve();
      const s = document.createElement("script");
      s.src = "/vendor/srs/srs.sdk.js";
      s.dataset.srs = "1";
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }, []);

  const join = async () => {
    setLoading(true);
    try {
      // Get camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Load SDK and publish
      await loadSdk();
      const pub = new window.SrsRtcPublisherAsync();
      await pub.publish(`${SRS_RTC_BASE}/${inviteId}-guest`, stream);
      pubRef.current = pub;
      setJoined(true);
    } catch (err) {
      console.error("Join error:", err);
      alert("Failed to join. Check camera permissions and try again.");
    } finally {
      setLoading(false);
    }
  };

  const leave = () => {
    pubRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setJoined(false);
  };

  useEffect(() => {
    return () => {
      pubRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: 20, fontFamily: "sans-serif", textAlign: "center" }}>
      <h2>🎥 Join as Guest</h2>
      <p style={{ color: "#888" }}>
        You've been invited to join a stream. Your video will appear alongside the host.
      </p>

      {/* Guest preview */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: "100%",
          maxWidth: 400,
          borderRadius: 10,
          background: "#111",
          margin: "20px auto",
          display: "block",
        }}
      />

      {!joined ? (
        <button
          onClick={join}
          disabled={loading}
          style={{
            padding: "12px 40px",
            fontSize: 18,
            cursor: loading ? "not-allowed" : "pointer",
            backgroundColor: loading ? "#666" : "#9146FF",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Connecting..." : "Join Stream"}
        </button>
      ) : (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              padding: 12,
              background: "#0a2a0a",
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            <p style={{ color: "#0f0", fontWeight: "bold", margin: 0 }}>
              ✅ You're live! The host can see you now.
            </p>
          </div>
          <button
            onClick={leave}
            style={{
              padding: "12px 40px",
              fontSize: 16,
              cursor: "pointer",
              backgroundColor: "#e74c3c",
              color: "#fff",
              border: "none",
              borderRadius: 8,
            }}
          >
            Leave Stream
          </button>
        </div>
      )}
    </div>
  );
}