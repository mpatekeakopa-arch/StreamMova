import React, { useEffect, useRef, useState, useCallback } from "react";

const RAW_API_BASE = process.env.REACT_APP_API_BASE_URL || "https://api.streammova.xyz";
const SRS_RTC_BASE = process.env.REACT_APP_SRS_RTC_BASE_URL || "webrtc://srs.streammova.xyz/live";
const CHANNEL_STORAGE_KEY = "streammova_connected_channels";

// =========================
// HELPER FUNCTIONS
// =========================
function readStoredChannels() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHANNEL_STORAGE_KEY) || "{}");
    return Array.isArray(saved.connectedChannels) ? saved.connectedChannels : [];
  } catch {
    return [];
  }
}

// =========================
// AUDIO MIXER ENGINE
// =========================
class AudioMixer {
  constructor() {
    this.audioContext = null;
    this.mixedDestination = null;
    this.sources = new Map(); // id -> source node
  }

  initialize() {
    if (this.audioContext) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass();
    this.mixedDestination = this.audioContext.createMediaStreamDestination();
  }

  addSource(id, stream) {
    if (!this.audioContext || !this.mixedDestination) return;
    if (this.sources.has(id)) return;
    if (!stream || stream.getAudioTracks().length === 0) return;

    try {
      // Isolate the single audio track to mix
      const audioTrack = stream.getAudioTracks()[0];
      const pureAudioStream = new MediaStream([audioTrack]);
      const source = this.audioContext.createMediaStreamSource(pureAudioStream);
      source.connect(this.mixedDestination);
      this.sources.set(id, source);
    } catch (error) {
      console.warn(`Failed to add audio source for ${id}:`, error);
    }
  }

  removeSource(id) {
    if (!this.sources.has(id)) return;
    try {
      this.sources.get(id).disconnect();
    } catch (error) {
      console.warn(`Failed to disconnect audio source for ${id}:`, error);
    }
    this.sources.delete(id);
  }

  getMixedStream() {
    return this.mixedDestination?.stream || null;
  }

  destroy() {
    this.sources.forEach((source) => {
      try {
        source.disconnect();
      } catch (e) {}
    });
    this.sources.clear();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.mixedDestination = null;
  }
}

// =========================
// MAIN COMPONENT
// =========================
export default function StreamTogether() {
  const [mode, setMode] = useState(null); // null, 'host', 'guest'
  const [guestJoined, setGuestJoined] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [roomId, setRoomId] = useState("");

  // Refs for the Host View
  const videoHostRef = useRef(null);
  const videoGuestRef = useRef(null); 
  const canvasRef = useRef(null);
  const hostStreamRef = useRef(null);
  
  // Dedicated Ref for Guest Preview
  const guestLocalVideoRef = useRef(null); 
  const guestStreamRef = useRef(null);

  // Core SRS & Compositing Engines
  const publisherRef = useRef(null);
  const compositedPublisherRef = useRef(null);
  const playerRef = useRef(null);
  const pollRef = useRef(null);
  const animRef = useRef(null);
  const audioMixerRef = useRef(new AudioMixer());

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

  // Canvas Drawing / Layout Engine
  const startDrawing = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    canvas.width = 1280;
    canvas.height = 720;

    const frame = () => {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, 1280, 720);

      // Host Left Layout Frame
      if (videoHostRef.current?.readyState >= 2) {
        ctx.save();
        ctx.translate(640, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoHostRef.current, 0, 0, 640, 720);
        ctx.restore();

        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(15, 15, 80, 26);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px Arial";
        ctx.fillText("HOST", 34, 33);
      }

      // Guest Right Layout Frame
      if (videoGuestRef.current?.readyState >= 2) {
        ctx.save();
        ctx.translate(1280, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoGuestRef.current, 0, 0, 640, 720);
        ctx.restore();

        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(655, 15, 90, 26);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px Arial";
        ctx.fillText("GUEST", 676, 33);
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
    
    // 1. Build and constrain output stream matrix
    const mixedStream = canvasRef.current.captureStream(30);
    const canvasVideoTrack = mixedStream.getVideoTracks()[0];
    if (canvasVideoTrack) {
      canvasVideoTrack.applyConstraints({
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }).catch(() => {});
    }

    // 2. Instantiate and load audio sources into the mixer
    audioMixerRef.current.initialize();
    if (hostStreamRef.current) {
      audioMixerRef.current.addSource("host", hostStreamRef.current);
    }

    // 3. Inject mixed audio output tracks into canvas stream
    const mixedAudioStream = audioMixerRef.current.getMixedStream();
    if (mixedAudioStream && mixedAudioStream.getAudioTracks().length > 0) {
      mixedStream.addTrack(mixedAudioStream.getAudioTracks()[0]);
    }

    // 4. Publish Streams to SRS Room Points
    const hostStreamKey = `${roomId}-host`;
    const compositedStreamKey = `${roomId}-composited`;

    // Publish primary feed for layout components to grab
    const pubHost = new window.SrsRtcPublisherAsync();
    await pubHost.publish(`${SRS_RTC_BASE}/${hostStreamKey}`, hostStreamRef.current);
    publisherRef.current = pubHost;

    // Publish raw composite stream target for backend/FFmpeg pulls
    const pubComposite = new window.SrsRtcPublisherAsync();
    await pubComposite.publish(`${SRS_RTC_BASE}/${compositedStreamKey}`, mixedStream);
    compositedPublisherRef.current = pubComposite;

    setIsLive(true);

    // 5. Fire external streaming endpoints from storage configurations
    const selectedDestinations = readStoredChannels();
    const savedTokens = JSON.parse(localStorage.getItem(CHANNEL_STORAGE_KEY) || "{}");

    selectedDestinations.forEach(async (channel) => {
      try {
        if (channel.platform === "twitch" && savedTokens.twitchStreamKey) {
          await fetch(`${RAW_API_BASE}/api/twitch/live/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelId: roomId,
              streamKey: savedTokens.twitchStreamKey,
              compositedStreamKey,
            }),
          });
        }

        if (channel.platform === "youtube" && savedTokens.youtubeAccessToken) {
          await fetch(`${RAW_API_BASE}/api/youtube/live/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelId: roomId,
              accessToken: savedTokens.youtubeAccessToken,
              refreshToken: savedTokens.youtubeRefreshToken,
              title: "Stream Together Live",
              description: "Live from Stream Together",
              compositedStreamKey,
            }),
          });
        }

        if (channel.platform === "facebook") {
          const pages = savedTokens.facebookPages || [];
          const selectedPageId = savedTokens.selectedFacebookPageId;
          const page = pages.find((p) => p.id === selectedPageId);

          if (page?.access_token) {
            await fetch(`${RAW_API_BASE}/api/facebook/live/start`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                channelId: roomId,
                title: "Stream Together Live",
                description: "Live from Stream Together",
                pageId: page.id,
                pageAccessToken: page.access_token,
                compositedStreamKey,
              }),
            });
          }
        }
      } catch (err) {
        console.error(`Endpoint push failure for ${channel.platform}:`, err);
      }
    });

    // 6. Monitor room loop to bring in guest streaming links
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
          
          // Connect guest mic stream into our mixer pipeline
          if (player.stream) {
            audioMixerRef.current.addSource("guest", player.stream);
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
    
    // Terminate platform delivery tasks
    fetch(`${RAW_API_BASE}/api/twitch/live/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: roomId }) }).catch(() => {});
    fetch(`${RAW_API_BASE}/api/youtube/live/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: roomId }) }).catch(() => {});
    fetch(`${RAW_API_BASE}/api/facebook/live/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: roomId }) }).catch(() => {});

    publisherRef.current?.close();
    compositedPublisherRef.current?.close();
    playerRef.current?.close();
    
    hostStreamRef.current?.getTracks().forEach(t => t.stop());
    audioMixerRef.current.destroy();

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

  // Global Mounting Cleanup
  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (publisherRef.current) publisherRef.current.close();
      if (compositedPublisherRef.current) compositedPublisherRef.current.close();
      if (playerRef.current) playerRef.current.close();
      if (hostStreamRef.current) hostStreamRef.current.getTracks().forEach(t => t.stop());
      if (guestStreamRef.current) guestStreamRef.current.getTracks().forEach(t => t.stop());
      audioMixerRef.current.destroy();
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

      <canvas ref={canvasRef} style={styles.canvas} />
      {isLive && <p style={styles.liveBadge}>● LIVE</p>}

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
        </div>
      )}

      <video ref={videoHostRef} muted playsInline style={{ display: "none" }} />
    </div>
  );
}

// ============ INLINE COMPONENT STYLES ============
const styles = {
  container: { maxWidth: 700, margin: "0 auto", padding: 24, fontFamily: "sans-serif", textAlign: "center", color: "#fff", background: "#0a0a0a", minHeight: "100vh" },
  heading: { fontSize: 28, marginBottom: 8 },
  subtext: { color: "#888", marginBottom: 32 },
  buttonGroup: { display: "flex", flexDirection: "column", gap: 16, alignItems: "center" },
  primaryBtn: { padding: "14px 40px", fontSize: 18, cursor: "pointer", backgroundColor: "#9146FF", color: "#fff", border: "none", borderRadius: 8, fontWeight: "bold" },
  secondaryBtn: { padding: "12px 32px", fontSize: 16, cursor: "pointer", backgroundColor: "#444", color: "#fff", border: "none", borderRadius: 8 },
  dangerBtn: { padding: "12px 32px", fontSize: 16, cursor: "pointer", backgroundColor: "#e74c3c", color: "#fff", border: "none", borderRadius: 8, marginTop: 16 },
  backBtn: { padding: "10px 20px", fontSize: 14, cursor: "pointer", backgroundColor: "transparent", color: "#888", border: "1px solid #444", borderRadius: 6, marginTop: 12 },
  divider: { width: "100%", borderTop: "1px solid #333", margin: "8px 0", position: "relative" },
  dividerText: { position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#0a0a0a", padding: "0 12px", color: "#666", fontSize: 14 },
  joinBox: { display: "flex", gap: 8, width: "100%", maxWidth: 500 },
  input: { flex: 1, padding: "10px 14px", background: "#1a1a1a", color: "#fff", border: "1px solid #444", borderRadius: 6, fontSize: 14 },
  video: { width: "100%", maxWidth: 400, borderRadius: 10, background: "#111", margin: "20px auto", display: "block" },
  canvas: { width: "100%", borderRadius: 10, background: "#111", border: "1px solid #333" },
  liveBadge: { color: "#0f0", fontWeight: "bold", marginTop: 8 },
  controls: { marginTop: 20 },
  inviteBox: { marginTop: 24, padding: 20, background: "#1a1a1a", borderRadius: 10, textAlign: "left" },
  copyRow: { display: "flex", gap: 8, marginTop: 12 },
  copyBtn: { padding: "10px 20px", cursor: "pointer", backgroundColor: "#444", color: "#fff", border: "none", borderRadius: 6, fontWeight: "bold" }
};