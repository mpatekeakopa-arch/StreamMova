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

  // Draw host + guest side by side on canvas
  const startDrawing = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = 1280;
    canvas.height = 720;

    const draw = () => {
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
        ctx.fillText("Waiting for guest...", 960, 360);
      }

      requestAnimationFrame(draw);
    };
    draw();
  }, []);

  // Start camera
  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: true,
    });
    hostStreamRef.current = stream;
    videoHostRef.current.srcObject = stream;
    videoHostRef.current.play();
    startDrawing();
  };

  // Generate invite link and go live
  const goLive = async () => {
    const sid = sessionRef.current;
    setInviteLink(`${window.location.origin}/invite/${sid}`);

    // Load SRS SDK
    if (!window.SrsRtcPublisherAsync) {
      await loadSdk();
    }

    // Publish composited canvas to SRS
    const mixed = canvasRef.current.captureStream(30);
    if (hostStreamRef.current) {
      mixed.addTrack(hostStreamRef.current.getAudioTracks()[0]);
    }
    const pub = new window.SrsRtcPublisherAsync();
    await pub.publish(`${SRS_RTC_BASE}/${sid}`, mixed);
    compositedPublisherRef.current = pub;
    setIsLive(true);

    // Poll for guest
    waitForGuest(sid);
  };

  // Wait for guest to publish their stream
  const waitForGuest = (sid) => {
    pollRef.current = setInterval(async () => {
      if (guestJoined) return;
      if (!window.SrsRtcPlayerAsync) return;

      try {
        const player = new window.SrsRtcPlayerAsync();
        await player.play(`${SRS_RTC_BASE}/${sid}-guest`);

        const vid = document.createElement("video");
        vid.autoplay = true;
        vid.muted = true;
        vid.playsInline = true;
        vid.srcObject = player.stream;
        vid.play();

        guestVideoRef.current = vid;
        guestPlayerRef.current = player;
        setGuestJoined(true);
        clearInterval(pollRef.current);
      } catch (e) {
        // Guest not yet connected, keep polling
      }
    }, 2000);
  };

  const loadSdk = () => {
    return new Promise((resolve) => {
      if (document.querySelector("[data-srs]")) return resolve();
      const s = document.createElement("script");
      s.src = "/vendor/srs/srs.sdk.js";
      s.dataset.srs = "1";
      s.onload = resolve;
      document.head.appendChild(s);
    });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const stop = () => {
    clearInterval(pollRef.current);
    compositedPublisherRef.current?.close();
    guestPlayerRef.current?.close();
    guestVideoRef.current?.remove();
    hostStreamRef.current?.getTracks().forEach((t) => t.stop());
    setIsLive(false);
    setGuestJoined(false);
    setInviteLink("");
  };

  useEffect(() => {
    startCamera();
    return () => {
      clearInterval(pollRef.current);
      hostStreamRef.current?.getTracks().forEach((t) => t.stop());
      compositedPublisherRef.current?.close();
      guestPlayerRef.current?.close();
      guestVideoRef.current?.remove();
    };
  }, []);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
      <h2>Stream Together</h2>

      {/* Preview */}
      <canvas
        ref={canvasRef}
        style={{ width: "100%", borderRadius: 10, background: "#111", border: isLive ? "2px solid #0f0" : "2px solid #333" }}
      />
      {isLive && <p style={{ color: "#0f0", textAlign: "center" }}>● LIVE</p>}

      {/* Buttons */}
      <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
        {!isLive ? (
          <button onClick={goLive} style={btnStyle("#9146FF")}>
            Go Live
          </button>
        ) : (
          <button onClick={stop} style={btnStyle("#e74c3c")}>
            Stop
          </button>
        )}
      </div>

      {/* Invite Link */}
      {inviteLink && (
        <div style={{ marginTop: 24, padding: 16, background: "#1a1a1a", borderRadius: 10 }}>
          <strong>Invite Guest:</strong>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              value={inviteLink}
              readOnly
              onClick={(e) => e.target.select()}
              style={{
                flex: 1, padding: 10, background: "#2a2a2a", color: "#fff",
                border: "1px solid #444", borderRadius: 6, fontSize: 14,
              }}
            />
            <button onClick={copyLink} style={btnStyle(copied ? "#27ae60" : "#444")}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p style={{ marginTop: 12, color: guestJoined ? "#0f0" : "#888" }}>
            {guestJoined ? "✅ Guest connected" : "Waiting for guest..."}
          </p>
        </div>
      )}

      {/* Hidden host video */}
      <video ref={videoHostRef} muted playsInline style={{ display: "none" }} />
    </div>
  );
}

// =========================
// GUEST VIEW
// =========================
function GuestView({ inviteId }) {
  const [joined, setJoined] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const pubRef = useRef(null);

  const join = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: true,
    });
    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    videoRef.current.play();

    // Load SRS SDK
    if (!window.SrsRtcPublisherAsync) {
      await new Promise((r) => {
        const s = document.createElement("script");
        s.src = "/vendor/srs/srs.sdk.js";
        s.onload = r;
        document.head.appendChild(s);
      });
    }

    const pub = new window.SrsRtcPublisherAsync();
    await pub.publish(`${SRS_RTC_BASE}/${inviteId}-guest`, stream);
    pubRef.current = pub;
    setJoined(true);
  };

  const leave = () => {
    pubRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setJoined(false);
  };

  useEffect(() => () => leave(), []);

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: 20, fontFamily: "sans-serif", textAlign: "center" }}>
      <h2>Join Stream</h2>
      <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", borderRadius: 10, background: "#111" }} />
      {!joined ? (
        <button onClick={join} style={{ ...btnStyle("#9146FF"), marginTop: 20 }}>
          Join as Guest
        </button>
      ) : (
        <>
          <p style={{ color: "#0f0" }}>✅ Connected</p>
          <button onClick={leave} style={{ ...btnStyle("#e74c3c"), marginTop: 10 }}>
            Leave
          </button>
        </>
      )}
    </div>
  );
}

// Shared button style
function btnStyle(bg) {
  return {
    padding: "10px 24px",
    fontSize: 15,
    cursor: "pointer",
    backgroundColor: bg,
    color: "#fff",
    border: "none",
    borderRadius: 6,
  };
}