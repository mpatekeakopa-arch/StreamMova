import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./StreamTogether.css";
import ChannelModal from "../ChannelModal/ChannelModal";

const RAW_API_BASE =
  process.env.REACT_APP_API_BASE_URL || "https://api.streammova.xyz";
const CHANNEL_STORAGE_KEY = "streammova_connected_channels";
const OAUTH_STATUS_KEY = "streammova_channel_oauth_status";
const API_BASE = RAW_API_BASE.endsWith("/api/stream-together")
  ? RAW_API_BASE
  : `${RAW_API_BASE.replace(/\/+$/, "")}/api/stream-together`;
const SRS_RTC_BASE =
  process.env.REACT_APP_SRS_RTC_BASE_URL || "webrtc://srs.streammova.xyz/live";
const STREAM_TOGETHER_HOST_STATE_KEY = "streammova_stream_together_host_state";
const streamTogetherHostRuntime = {
  stream: null,
  publisher: null,
  testPublisher: null,
  cohostPlayer: null,
  session: null,
  cameraActive: false,
  isLive: false,
  title: "",
};

function buildSrsUrl(streamKey) {
  return `${SRS_RTC_BASE.replace(/\/+$/, "")}/${streamKey}`;
}

function makeSessionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function apiFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch (err) {
    throw new Error(`Could not reach the Stream Together API at ${API_BASE}.`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const error = new Error(data.error || data.message || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function isStreamTogetherSessionNotFound(error) {
  return error?.status === 404 && String(error?.message || "").toLowerCase().includes("session not found");
}

function readStoredChannels() {
  try { return JSON.parse(localStorage.getItem(CHANNEL_STORAGE_KEY) || "{}"); } catch { return {}; }
}

function writeStoredChannel(channel, extra = {}) {
  const saved = readStoredChannels();
  const connectedChannels = Array.isArray(saved.connectedChannels) ? saved.connectedChannels : [];
  const exists = connectedChannels.some((item) => item.id === channel.id);
  const nextChannels = exists
    ? connectedChannels.map((item) => (item.id === channel.id ? channel : item))
    : [...connectedChannels, channel];
  localStorage.setItem(CHANNEL_STORAGE_KEY, JSON.stringify({ ...saved, ...extra, connectedChannels: nextChannels }));
}

function decodeOAuthPayload(value) { return JSON.parse(window.atob(decodeURIComponent(value))); }

function formatOAuthError(errorCode) {
  if (!errorCode) return "";
  if (errorCode.endsWith("_oauth_not_configured")) {
    const platform = errorCode.split("_")[0];
    return `${platform} OAuth is not configured in backend/.env yet.`;
  }
  return `Channel connection failed: ${errorCode}`;
}

function writeOAuthStatus(type, message) {
  localStorage.setItem(OAUTH_STATUS_KEY, JSON.stringify({ type, message, updatedAt: Date.now() }));
}

async function loadSrsSdk() {
  if (window.SrsRtcPublisherAsync || window.SrsRtcPlayerAsync) return true;
  const existing = document.querySelector('script[data-srs-sdk="1"]');
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
    });
  }
  const script = document.createElement("script");
  script.src = "/vendor/srs/srs.sdk.js";
  script.async = true;
  script.dataset.srsSdk = "1";
  return new Promise((resolve) => {
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

async function publishToSrs(stream, streamKey) {
  const loaded = await loadSrsSdk();
  if (!loaded || !window.SrsRtcPublisherAsync) throw new Error("SRS SDK is not available.");
  const publisher = new window.SrsRtcPublisherAsync();
  const url = buildSrsUrl(streamKey);
  if (publisher.publish.length >= 2) await publisher.publish(url, stream);
  else await publisher.publish(url);
  return publisher;
}

async function playFromSrs(video, streamKey) {
  const loaded = await loadSrsSdk();
  if (!loaded || !window.SrsRtcPlayerAsync) throw new Error("SRS player SDK is not available.");
  const player = new window.SrsRtcPlayerAsync();
  video.srcObject = player.stream;
  await player.play(buildSrsUrl(streamKey));
  return player;
}

// =========================
// STREAM TOGETHER MAIN
// =========================

function StreamTogether() {
  const navigate = useNavigate();
  const path = window.location.pathname;
  const sessionId = path.split("/").filter(Boolean).pop();
  const goBack = () => {
    if (window.history.length > 1) { navigate(-1); return; }
    navigate("/dashboard");
  };
  if (path.includes("/cohost-join/")) return <CoHostJoin sessionId={sessionId} onBack={goBack} />;
  if (path.includes("/watch/")) return <StreamViewer sessionId={sessionId} onBack={goBack} />;
  return <StreamTogetherHost onBack={goBack} />;
}

// =========================
// STREAM TOGETHER HOST
// =========================

function StreamTogetherHost({ onBack }) {
  const [title, setTitle] = useState("");
  const [session, setSession] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [connectedChannels, setConnectedChannels] = useState([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [ffmpegStatus, setFfmpegStatus] = useState("");

  const hostVideoRef = useRef(null);
  const cohostVideoRef = useRef(null);
  const streamRef = useRef(null);
  const publisherRef = useRef(null);
  const testPublisherRef = useRef(null);
  const cohostPlayerRef = useRef(null);
  const modalRef = useRef(null);

  const cohostLink = session ? `${window.location.origin}/cohost-join/${session.sessionId}` : "";
  const viewerLink = session ? `${window.location.origin}/watch/${session.sessionId}` : "";
  const activePublishers = session?.publishers || [];
  const coHosts = session?.coHosts || [];
  const cohostPublisher = activePublishers.find(p => p.role === "cohost");
  const selectedDestinations = connectedChannels.filter((channel) => selectedChannelIds.includes(String(channel.id)));

  const saveHostRuntime = (next = {}) => {
    Object.assign(streamTogetherHostRuntime, next);
    localStorage.setItem(STREAM_TOGETHER_HOST_STATE_KEY, JSON.stringify({
      session: streamTogetherHostRuntime.session,
      cameraActive: streamTogetherHostRuntime.cameraActive,
      isLive: streamTogetherHostRuntime.isLive,
      title: streamTogetherHostRuntime.title,
    }));
  };

  const loadConnectedChannels = () => {
    try {
      const saved = readStoredChannels();
      const channels = Array.isArray(saved.connectedChannels) ? saved.connectedChannels : [];
      setConnectedChannels(channels);
      setSelectedChannelIds((previous) => {
        const validIds = channels.map((channel) => String(channel.id));
        const kept = previous.filter((id) => validIds.includes(id));
        return kept.length ? kept : validIds;
      });
    } catch (err) {
      console.warn("Failed to load connected channels:", err);
      setConnectedChannels([]);
      setSelectedChannelIds([]);
    }
  };

  // Auto-play co-host stream when they join
  useEffect(() => {
    if (!isLive || !cohostVideoRef.current || !cohostPublisher) return;
    if (cohostPublisher.publishStatus !== "publishing") return;

    const playCoHost = async () => {
      try {
        cohostPlayerRef.current?.close?.();
        cohostPlayerRef.current = await playFromSrs(cohostVideoRef.current, cohostPublisher.streamKey);
        saveHostRuntime({ cohostPlayer: cohostPlayerRef.current });
        console.log("Playing co-host stream:", cohostPublisher.streamKey);
      } catch (err) {
        console.warn("Failed to play co-host stream:", err);
      }
    };
    playCoHost();

    return () => { cohostPlayerRef.current?.close?.(); };
  }, [isLive, cohostPublisher?.streamKey, cohostPublisher?.publishStatus]);

  useEffect(() => {
    const stored = (() => {
      try { return JSON.parse(localStorage.getItem(STREAM_TOGETHER_HOST_STATE_KEY) || "{}"); } catch { return {}; }
    })();
    const restoredSession = streamTogetherHostRuntime.session || stored.session;
    const restoredStream = streamTogetherHostRuntime.stream;
    if (stored.title || streamTogetherHostRuntime.title) setTitle(streamTogetherHostRuntime.title || stored.title || "");
    if (restoredSession?.sessionId) { setSession(restoredSession); setIsLive(Boolean(streamTogetherHostRuntime.isLive || stored.isLive)); }
    if (restoredStream && restoredStream.getTracks().some((track) => track.readyState === "live")) {
      streamRef.current = restoredStream;
      publisherRef.current = streamTogetherHostRuntime.publisher;
      testPublisherRef.current = streamTogetherHostRuntime.testPublisher;
      cohostPlayerRef.current = streamTogetherHostRuntime.cohostPlayer;
      setCameraActive(true);
      if (hostVideoRef.current) { hostVideoRef.current.srcObject = restoredStream; hostVideoRef.current.play().catch(() => {}); }
    }
    loadConnectedChannels();
    // OAuth handling (abbreviated - same as before)
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) { setError(formatOAuthError(oauthError)); writeOAuthStatus("error", formatOAuthError(oauthError)); window.history.replaceState({}, document.title, "/stream-together"); }
    // ... (keep existing OAuth payload handling - same as your current code)
    const handleStorage = (event) => {
      if (event.key === CHANNEL_STORAGE_KEY) loadConnectedChannels();
      if (event.key === OAUTH_STATUS_KEY && event.newValue) {
        try { const status = JSON.parse(event.newValue); if (status?.message) { setError(status.type === "error" ? status.message : ""); if (status.type === "success") loadConnectedChannels(); } } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!isLive || !session?.sessionId) return;
    const timer = setInterval(async () => {
      try { const data = await apiFetch(`/session/${session.sessionId}`); setSession(data.session); } catch (err) { console.warn("Session refresh failed:", err); }
    }, 3000);
    return () => clearInterval(timer);
  }, [isLive, session?.sessionId]);

  const activateCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;
    saveHostRuntime({ stream, cameraActive: true, title: title.trim() || streamTogetherHostRuntime.title });
    if (hostVideoRef.current) { hostVideoRef.current.srcObject = stream; await hostVideoRef.current.play().catch(() => {}); }
    setCameraActive(true);
    return stream;
  };

  const stopLocalMedia = () => {
    publisherRef.current?.close?.(); publisherRef.current = null;
    testPublisherRef.current?.close?.(); testPublisherRef.current = null;
    cohostPlayerRef.current?.close?.(); cohostPlayerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    saveHostRuntime({ stream: null, publisher: null, testPublisher: null, cohostPlayer: null, cameraActive: false, isLive: false });
    if (hostVideoRef.current) hostVideoRef.current.srcObject = null;
    if (cohostVideoRef.current) cohostVideoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const createInviteSession = async () => {
    // ... (keep existing - same as your current code)
    if (session?.sessionId) {
      try { const existing = await apiFetch(`/session/${session.sessionId}`); setSession(existing.session); saveHostRuntime({ session: existing.session, title: title.trim() || existing.session.title || "" }); return existing.session; }
      catch (err) { if (!isStreamTogetherSessionNotFound(err)) throw err; setSession(null); setIsLive(false); setShowInvite(false); saveHostRuntime({ session: null, isLive: false, title: title.trim() }); }
    }
    const sessionId = makeSessionId();
    const created = await apiFetch("/create-session", { method: "POST", body: JSON.stringify({ title: title.trim(), clientSessionId: sessionId, streamKey: sessionId, destinations: selectedDestinations.map((channel) => ({ id: channel.id, platform: channel.platform, name: channel.name, displayName: channel.displayName || channel.pageName || "", status: channel.status })) }) });
    setSession(created.session); saveHostRuntime({ session: created.session, title: title.trim() }); return created.session;
  };

  const startFFmpegForDestinations = async () => {
    const saved = readStoredChannels(); const platformsStarted = [];
    for (const channel of selectedDestinations) {
      try {
        if (channel.platform === "twitch" && saved.twitchStreamKey) { await fetch(`${RAW_API_BASE}/api/twitch/live/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: session?.sessionId || "streamtogether", streamKey: saved.twitchStreamKey }) }); platformsStarted.push("Twitch"); }
        if (channel.platform === "youtube" && saved.youtubeAccessToken) { await fetch(`${RAW_API_BASE}/api/youtube/live/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: session?.sessionId || "streamtogether", accessToken: saved.youtubeAccessToken, refreshToken: saved.youtubeRefreshToken, title: title || "Stream Together Live", description: "Live from Stream Together" }) }); platformsStarted.push("YouTube"); }
        if (channel.platform === "facebook") { const pages = saved.facebookPages || []; const page = pages.find((p) => p.id === saved.selectedFacebookPageId); if (page?.access_token) { await fetch(`${RAW_API_BASE}/api/facebook/live/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: session?.sessionId || "streamtogether", title: title || "Stream Together Live", description: "Live from Stream Together", pageId: page.id, pageAccessToken: page.access_token }) }); platformsStarted.push("Facebook"); } }
      } catch (err) { console.error(`Failed to start FFmpeg for ${channel.platform}:`, err); }
    }
    if (platformsStarted.length > 0) setFfmpegStatus(`Streaming to ${platformsStarted.join(", ")}`);
  };

  const stopFFmpegForDestinations = async () => {
    const stopPromises = [];
    if (selectedDestinations.some((c) => c.platform === "twitch")) stopPromises.push(fetch(`${RAW_API_BASE}/api/twitch/live/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: session?.sessionId || "streamtogether" }) }).catch(() => {}));
    if (selectedDestinations.some((c) => c.platform === "youtube")) stopPromises.push(fetch(`${RAW_API_BASE}/api/youtube/live/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: session?.sessionId || "streamtogether" }) }).catch(() => {}));
    if (selectedDestinations.some((c) => c.platform === "facebook")) stopPromises.push(fetch(`${RAW_API_BASE}/api/facebook/live/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: session?.sessionId || "streamtogether" }) }).catch(() => {}));
    await Promise.allSettled(stopPromises); setFfmpegStatus("");
  };

  const startStream = async () => {
    if (!title.trim()) { setError("Enter a session title first."); return null; }
    setIsBusy(true); setError(""); setFfmpegStatus("");
    try {
      const stream = streamRef.current || (await activateCamera());
      const currentSession = await createInviteSession();
      const hostStreamKey = `${currentSession.sessionId}-host`;
      let publishStatus = "publishing";
      try { const publisher = await publishToSrs(stream, hostStreamKey); publisherRef.current = publisher; saveHostRuntime({ publisher }); } catch (e) { publishStatus = "local-preview"; }
      if (selectedDestinations.length > 0) { try { const testStream = stream.clone(); const tp = await publishToSrs(testStream, "test"); testPublisherRef.current = tp; saveHostRuntime({ testPublisher: tp }); } catch (e) {} }
      await apiFetch(`/register-publisher/${currentSession.sessionId}`, { method: "POST", body: JSON.stringify({ userId: "host", role: "host", streamKey: hostStreamKey, publishStatus }) });
      const started = await apiFetch(`/start-session/${currentSession.sessionId}`, { method: "POST" });
      setSession(started.session); setIsLive(true); saveHostRuntime({ session: started.session, isLive: true, title: title.trim() });
      if (selectedDestinations.length > 0) await startFFmpegForDestinations();
      return started.session;
    } catch (err) { setError(err.message); setIsLive(false); stopLocalMedia(); return null; }
    finally { setIsBusy(false); }
  };

  const stopStream = async () => {
    setIsBusy(true); setError("");
    await stopFFmpegForDestinations();
    try { if (session?.sessionId) await apiFetch(`/stop-session/${session.sessionId}`, { method: "POST" }); } catch (err) { setError(err.message); }
    finally { stopLocalMedia(); setIsLive(false); setShowInvite(false); setIsBusy(false); setSession((prev) => prev ? { ...prev, status: "ended", publishers: [], coHosts: [] } : prev); localStorage.removeItem(STREAM_TOGETHER_HOST_STATE_KEY); saveHostRuntime({ session: null, title: "" }); }
  };

  const openInvite = async () => { if (!title.trim()) { setError("Enter a session title first."); return; } setIsBusy(true); setError(""); try { const s = await createInviteSession(); if (s) setShowInvite(true); } catch (err) { setError(err.message); } finally { setIsBusy(false); } };
  const copy = async (value, label) => { try { await navigator.clipboard.writeText(value); setCopied(`${label} copied`); } catch { setCopied(`${label} could not be copied. Select and copy manually.`); } setTimeout(() => setCopied(""), 1800); };
  const toggleDestination = (id) => { const sid = String(id); setSelectedChannelIds((prev) => prev.includes(sid) ? prev.filter((i) => i !== sid) : [...prev, sid]); };
  const openChannelModal = () => { loadConnectedChannels(); setShowChannelModal(true); };
  const closeChannelModal = () => { setShowChannelModal(false); loadConnectedChannels(); };

  return (
    <div className="stream-together-page">
      <div className="stream-together-shell">
        <StreamTogetherHeader isLive={isLive} onBack={onBack} />
        <div className="stream-together-grid">
          <div className="stream-together-card">
            {/* SIDE-BY-SIDE VIDEO GRID */}
            <div className="stream-together-video-grid">
              <div className="stream-together-video host-video">
                <video ref={hostVideoRef} autoPlay muted playsInline />
                {!cameraActive && (
                  <div className="stream-together-placeholder">
                    <div><i className="fas fa-video"></i><strong>Host Camera</strong><p className="stream-together-muted">Camera is off</p></div>
                  </div>
                )}
                {isLive && <div className="stream-together-live-badge"><span className="stream-together-dot" />HOST</div>}
              </div>
              <div className="stream-together-video cohost-video">
                <video ref={cohostVideoRef} autoPlay playsInline muted />
                {(!cohostPublisher || !isLive) && (
                  <div className="stream-together-placeholder">
                    <div><i className="fas fa-user-friends"></i><strong>Co-host</strong><p className="stream-together-muted">{isLive ? "Waiting for co-host..." : "Start session to invite"}</p></div>
                  </div>
                )}
                {cohostPublisher && isLive && <div className="stream-together-live-badge"><span className="stream-together-dot" />CO-HOST</div>}
              </div>
            </div>

            <div className="stream-together-controls">
              <div className="stream-together-field">
                <label htmlFor="stream-title">Session title</label>
                <input id="stream-title" className="stream-together-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday show with guests" disabled={isLive || isBusy} />
              </div>
              <div className="stream-together-actions">
                <button className="stream-together-button primary" onClick={startStream} disabled={isLive || isBusy || !title.trim()}><i className="fas fa-broadcast-tower"></i>{isBusy ? "Starting..." : "Start Session"}</button>
                <button className="stream-together-button" onClick={openInvite} disabled={isBusy || !title.trim()}><i className="fas fa-user-plus"></i>Invite Co-host</button>
                {isLive && <button className="stream-together-button danger" onClick={stopStream} disabled={isBusy}><i className="fas fa-stop"></i>Stop</button>}
              </div>
            </div>
            {ffmpegStatus && <div className="stream-together-ffmpeg-status"><i className="fas fa-satellite-dish"></i> {ffmpegStatus}</div>}
            {error && <div className="stream-together-error">{error}</div>}
          </div>

          {/* Panel - same as before */}
          <div className="stream-together-panel">
            <h2>Session</h2>
            <div className="stream-together-meta">
              <div className="stream-together-meta-item"><span>Status</span><strong>{isLive ? "Live" : "Ready"}</strong></div>
              <div className="stream-together-meta-item"><span>Session ID</span><span className="stream-together-code">{session?.sessionId || "Not created"}</span></div>
              <div className="stream-together-meta-item"><span>Publishers</span><strong>{activePublishers.length}</strong></div>
              <div className="stream-together-meta-item"><span>Co-hosts</span><strong>{coHosts.length}</strong></div>
              <div className="stream-together-meta-item"><span>Destinations</span><strong>{selectedDestinations.length}</strong></div>
            </div>
            <h3 style={{ marginTop: 22 }}>Destinations</h3>
            <div className="stream-together-destinations">
              {connectedChannels.length === 0 ? <p className="stream-together-muted">No channels connected yet.</p> : connectedChannels.map((channel) => {
                const cid = String(channel.id); const checked = selectedChannelIds.includes(cid);
                return (
                  <label className="stream-together-destination" key={cid}>
                    <input type="checkbox" checked={checked} disabled={isLive} onChange={() => toggleDestination(cid)} />
                    {channel.logo ? <img src={channel.logo} alt="" /> : <i className={channel.icon || "fas fa-satellite-dish"}></i>}
                    <span><strong>{channel.name}</strong>{(channel.displayName || channel.pageName) && <small>{channel.displayName || channel.pageName}</small>}</span>
                  </label>
                );
              })}
              <button className="stream-together-button" type="button" onClick={openChannelModal}><i className="fas fa-plus"></i>Connect Channels</button>
            </div>
            <h3 style={{ marginTop: 22 }}>People</h3>
            <div className="stream-together-meta">
              {activePublishers.length === 0 && <p className="stream-together-muted">No publishers connected yet.</p>}
              {activePublishers.map((p) => (
                <div className="stream-together-person" key={p.streamKey}><span>{p.role === "host" ? "Host" : "Co-host"}</span><span className="stream-together-code">{p.streamKey}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Invite Modal - same as before */}
      {showInvite && session && (
        <div className="stream-together-modal" onClick={() => setShowInvite(false)}>
          <div className="stream-together-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="stream-together-modal-head"><h2>Invite Links</h2><button className="stream-together-button" onClick={() => setShowInvite(false)}><i className="fas fa-times"></i></button></div>
            <InviteLink label="Co-host link" value={cohostLink} onCopy={copy} />
            <InviteLink label="Viewer link" value={viewerLink} onCopy={copy} />
            <p className="stream-together-muted">Co-hosts publish their camera into this session.</p>
            {copied && <div className="stream-together-error">{copied}</div>}
          </div>
        </div>
      )}
      <ChannelModal showChannelModal={showChannelModal} modalRef={modalRef} handleCloseChannelModal={closeChannelModal} handleFacebookOAuth={() => startOAuth("facebook")} handleTwitchOAuth={() => startOAuth("twitch")} handleYouTubeOAuth={() => startOAuth("youtube")} facebookConnectStatus="" twitchConnected={connectedChannels.some(c => c.platform === "twitch")} twitchUsername={connectedChannels.find(c => c.platform === "twitch")?.displayName || ""} youtubeConnected={connectedChannels.some(c => c.platform === "youtube")} youtubeChannelName={connectedChannels.find(c => c.platform === "youtube")?.displayName || ""} />
    </div>
  );
}

// Abbreviated sub-components (keep your existing ones)
function InviteLink({ label, value, onCopy }) {
  return (
    <div className="stream-together-field" style={{ marginBottom: 16 }}>
      <label>{label}</label>
      <div className="stream-together-link-row">
        <input className="stream-together-input" value={value} readOnly />
        <button className="stream-together-button primary" onClick={() => onCopy(value, label)}><i className="fas fa-copy"></i>Copy</button>
      </div>
    </div>
  );
}

function StreamTogetherHeader({ isLive, onBack }) {
  return (
    <div className="stream-together-header">
      <div className="stream-together-title-row">
        <button type="button" className="stream-together-back-button" onClick={onBack} aria-label="Go back"><i className="fas fa-arrow-left"></i></button>
        <div><h1>Stream Together</h1><p>Host a live room, invite co-hosts, and share a viewer link.</p></div>
      </div>
      <span className={`stream-together-status ${isLive ? "live" : "ready"}`}><span className="stream-together-dot" />{isLive ? "Live" : "Ready"}</span>
    </div>
  );
}

// Keep CoHostJoin and StreamViewer exactly as they were - no changes needed
function CoHostJoin({ sessionId, onBack }) {
  // ... (your existing code - unchanged)
  return null; // placeholder - use your existing code
}

function StreamViewer({ sessionId, onBack }) {
  // ... (your existing code - unchanged)
  return null; // placeholder - use your existing code
}

export default StreamTogether;