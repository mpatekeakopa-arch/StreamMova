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
  mixedPublisher: null,
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
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    throw new Error(
      `Could not reach the Stream Together API at ${API_BASE}. Check that the backend is running and REACT_APP_API_BASE_URL points to it.`
    );
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
  return (
    error?.status === 404 &&
    String(error?.message || "")
      .toLowerCase()
      .includes("session not found")
  );
}

function readStoredChannels() {
  try {
    return JSON.parse(localStorage.getItem(CHANNEL_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeStoredChannel(channel, extra = {}) {
  const saved = readStoredChannels();
  const connectedChannels = Array.isArray(saved.connectedChannels)
    ? saved.connectedChannels
    : [];
  const exists = connectedChannels.some((item) => item.id === channel.id);
  const nextChannels = exists
    ? connectedChannels.map((item) => (item.id === channel.id ? channel : item))
    : [...connectedChannels, channel];

  localStorage.setItem(
    CHANNEL_STORAGE_KEY,
    JSON.stringify({
      ...saved,
      ...extra,
      connectedChannels: nextChannels,
    })
  );
}

function decodeOAuthPayload(value) {
  return JSON.parse(window.atob(decodeURIComponent(value)));
}

function formatOAuthError(errorCode) {
  if (!errorCode) return "";

  if (errorCode.endsWith("_oauth_not_configured")) {
    const platform = errorCode.split("_")[0];
    return `${platform} OAuth is not configured in backend/.env yet. Add the client ID, client secret, and redirect URI for that platform.`;
  }

  return `Channel connection failed: ${errorCode}`;
}

function writeOAuthStatus(type, message) {
  localStorage.setItem(
    OAUTH_STATUS_KEY,
    JSON.stringify({
      type,
      message,
      updatedAt: Date.now(),
    })
  );
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
  if (!loaded || !window.SrsRtcPublisherAsync) {
    throw new Error("SRS SDK is not available.");
  }

  const publisher = new window.SrsRtcPublisherAsync();
  const url = buildSrsUrl(streamKey);

  if (publisher.publish.length >= 2) {
    await publisher.publish(url, stream);
  } else {
    await publisher.publish(url);
  }

  return publisher;
}

async function playFromSrs(video, streamKey) {
  const loaded = await loadSrsSdk();
  if (!loaded || !window.SrsRtcPlayerAsync) {
    throw new Error("SRS player SDK is not available.");
  }

  const player = new window.SrsRtcPlayerAsync();
  video.srcObject = player.stream;
  await player.play(buildSrsUrl(streamKey));
  return player;
}

// =========================
// CANVAS COMPOSITOR - Mixes multiple streams into one
// =========================

class StreamCompositor {
  constructor(canvas, width = 1280, height = 720) {
    this.canvas = canvas;
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = canvas.getContext('2d');
    this.videos = [];
    this.animationId = null;
    this.outputStream = null;
    this._canvasStream = null;
    this.audioContext = null;
    this.audioDestination = null;
    this.audioSources = [];
    this.layout = 'side-by-side';
    this.isRunning = false;
    this.onFrame = null;
  }

  addVideo(video, label = '') {
    if (this.videos.find(v => v.video === video)) return;
    
    this.videos.push({ video, label });
    console.log(`Compositor: Added ${label}. Total videos: ${this.videos.length}`);
    
    this._addAudioSource(video);
    this._rebuildOutputStream();
    
    if (!this.isRunning) {
      this._draw();
      this.isRunning = true;
    }
  }

  removeVideo(video) {
    this.videos = this.videos.filter(v => v.video !== video);
    this._removeAudioSource(video);
    console.log(`Compositor: Removed video. Remaining: ${this.videos.length}`);
    this._rebuildOutputStream();
  }

  setLayout(layout) {
    this.layout = layout;
  }

  _addAudioSource(video) {
    if (!video.srcObject) return;
    
    const audioTracks = video.srcObject.getAudioTracks();
    if (audioTracks.length === 0) return;
    
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioDestination = this.audioContext.createMediaStreamDestination();
      }
      
      const audioStream = new MediaStream(audioTracks);
      const audioSource = this.audioContext.createMediaStreamSource(audioStream);
      audioSource.connect(this.audioDestination);
      this.audioSources.push({ source: audioSource, stream: audioStream, video });
      console.log('Compositor: Added audio source');
    } catch (err) {
      console.warn('Compositor: Failed to add audio:', err);
    }
  }

  _removeAudioSource(video) {
    const index = this.audioSources.findIndex(s => s.video === video);
    if (index >= 0) {
      try {
        this.audioSources[index].source.disconnect();
      } catch (e) {}
      this.audioSources.splice(index, 1);
    }
  }

  _rebuildOutputStream() {
    // Create canvas stream ONCE if it doesn't exist
    if (!this._canvasStream) {
      this._canvasStream = this.canvas.captureStream(30);
      console.log('Compositor: Created persistent canvas stream');
    }
    
    if (this.outputStream) {
      const oldTracks = this.outputStream.getTracks();
      oldTracks.forEach(track => {
        track.stop();
        this.outputStream.removeTrack(track);
      });
    } else {
      this.outputStream = new MediaStream();
    }
    
    // Add video track from the persistent canvas stream
    const videoTrack = this._canvasStream.getVideoTracks()[0];
    if (videoTrack && this.outputStream.getVideoTracks().length === 0) {
      this.outputStream.addTrack(videoTrack);
    }
    
    // Remove old audio tracks
    this.outputStream.getAudioTracks().forEach(track => {
      track.stop();
      this.outputStream.removeTrack(track);
    });
    
    // Add mixed audio if available
    if (this.audioDestination && this.audioDestination.stream.getAudioTracks().length > 0) {
      this.audioDestination.stream.getAudioTracks().forEach(track => {
        this.outputStream.addTrack(track);
      });
    } else {
      const firstVideo = this.videos[0]?.video;
      if (firstVideo?.srcObject) {
        const audioTracks = firstVideo.srcObject.getAudioTracks();
        audioTracks.forEach(track => {
          this.outputStream.addTrack(track.clone());
        });
      }
    }
    
    console.log('Compositor: Rebuilt output stream with', {
      videoTracks: this.outputStream.getVideoTracks().length,
      audioTracks: this.outputStream.getAudioTracks().length,
      participants: this.videos.length,
      streamActive: this.outputStream.active
    });
  }

  _draw() {
    const drawFrame = () => {
      if (!this.isRunning) return;

      this.ctx.fillStyle = '#05060a';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      const numVideos = this.videos.length;

      if (numVideos === 0) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Waiting for streams...', this.canvas.width / 2, this.canvas.height / 2);
      } else if (numVideos === 1) {
        this._drawVideoFrame(this.videos[0], 0, 0, this.canvas.width, this.canvas.height);
      } else {
        if (this.layout === 'side-by-side') {
          this._drawSideBySide();
        } else {
          this._drawPIP();
        }
      }

      if (this.onFrame) {
        this.onFrame(this.canvas);
      }

      this.animationId = requestAnimationFrame(drawFrame);
    };

    drawFrame();
  }

  _drawSideBySide() {
    const numVideos = this.videos.length;
    const cols = numVideos <= 2 ? numVideos : 2;
    const rows = Math.ceil(numVideos / cols);
    const cellWidth = this.canvas.width / cols;
    const cellHeight = this.canvas.height / rows;

    this.videos.forEach((videoObj, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * cellWidth;
      const y = row * cellHeight;
      
      this._drawVideoFrame(videoObj, x, y, cellWidth, cellHeight);

      if (videoObj.label) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.font = '14px Arial';
        const textWidth = this.ctx.measureText(videoObj.label).width;
        this.ctx.fillRect(x + 10, y + 10, textWidth + 20, 30);
        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(videoObj.label, x + 20, y + 30);
      }
    });
  }

  _drawPIP() {
    this._drawVideoFrame(this.videos[0], 0, 0, this.canvas.width, this.canvas.height);

    const pipWidth = this.canvas.width * 0.25;
    const pipHeight = this.canvas.height * 0.25;
    const padding = 20;

    for (let i = 1; i < this.videos.length; i++) {
      const pipX = this.canvas.width - pipWidth - padding;
      const pipY = padding + (i - 1) * (pipHeight + padding);
      
      this.ctx.strokeStyle = '#9146FF';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(pipX - 2, pipY - 2, pipWidth + 4, pipHeight + 4);
      
      this._drawVideoFrame(this.videos[i], pipX, pipY, pipWidth, pipHeight);
    }
  }

  _drawVideoFrame(videoObj, x, y, width, height) {
    const video = videoObj.video;
    if (!video || video.readyState < 2) return;

    // Draw without mirroring for broadcast (FIX F)
    this.ctx.drawImage(video, x, y, width, height);
  }

  getOutputStream() {
    if (!this.outputStream || this.outputStream.getVideoTracks().length === 0) {
      this._rebuildOutputStream();
    }
    return this.outputStream;
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this._canvasStream) {
      this._canvasStream.getTracks().forEach(track => track.stop());
      this._canvasStream = null;
    }
    if (this.outputStream) {
      this.outputStream.getTracks().forEach(track => track.stop());
      this.outputStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.audioDestination = null;
    }
    this.audioSources.forEach(s => {
      try { s.source.disconnect(); } catch (e) {}
    });
    this.audioSources = [];
    this.videos = [];
    this.onFrame = null;
  }
}

// =========================
// STREAM TOGETHER MAIN
// =========================

function StreamTogether() {
  const navigate = useNavigate();
  const path = window.location.pathname;
  const sessionId = path.split("/").filter(Boolean).pop();
  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/dashboard");
  };

  if (path.includes("/cohost-join/")) {
    return <CoHostJoin sessionId={sessionId} onBack={goBack} />;
  }

  if (path.includes("/watch/")) {
    return <StreamViewer sessionId={sessionId} onBack={goBack} />;
  }

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
  const [layoutMode, setLayoutMode] = useState("side-by-side");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const publisherRef = useRef(null);
  const mixedPublisherRef = useRef(null);
  const compositorRef = useRef(null);
  const cohostVideoRefs = useRef({});
  const cohostPlayersRef = useRef({});
  const modalRef = useRef(null);

  const cohostLink = session
    ? `${window.location.origin}/cohost-join/${session.sessionId}`
    : "";
  const viewerLink = session ? `${window.location.origin}/watch/${session.sessionId}` : "";

  const activePublishers = session?.publishers || [];
  const coHosts = session?.coHosts || [];
  const selectedDestinations = connectedChannels.filter((channel) =>
    selectedChannelIds.includes(String(channel.id))
  );

  const saveHostRuntime = (next = {}) => {
    Object.assign(streamTogetherHostRuntime, next);

    localStorage.setItem(
      STREAM_TOGETHER_HOST_STATE_KEY,
      JSON.stringify({
        session: streamTogetherHostRuntime.session,
        cameraActive: streamTogetherHostRuntime.cameraActive,
        isLive: streamTogetherHostRuntime.isLive,
        title: streamTogetherHostRuntime.title,
      })
    );
  };

  const loadConnectedChannels = () => {
    try {
      const saved = readStoredChannels();
      const channels = Array.isArray(saved.connectedChannels)
        ? saved.connectedChannels
        : [];

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

  // FIX D: Remove co-host videos when they disconnect
  const removeCoHostStream = (streamKey) => {
    const video = cohostVideoRefs.current[streamKey];
    if (video) {
      if (compositorRef.current) {
        compositorRef.current.removeVideo(video);
      }
      
      const player = cohostPlayersRef.current[streamKey];
      if (player) {
        player.close();
        delete cohostPlayersRef.current[streamKey];
      }
      
      video.srcObject?.getTracks().forEach(t => t.stop());
      video.remove();
      delete cohostVideoRefs.current[streamKey];
      
      console.log(`Removed co-host stream: ${streamKey}`);
    }
  };

  const playCoHostStream = async (publisher) => {
    if (!cohostVideoRefs.current[publisher.streamKey]) {
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.display = 'none';
      document.body.appendChild(video);
      cohostVideoRefs.current[publisher.streamKey] = video;
      
      try {
        const player = await playFromSrs(video, publisher.streamKey);
        cohostPlayersRef.current[publisher.streamKey] = player;
        
        video.addEventListener('loadedmetadata', () => {
          if (compositorRef.current) {
            const label = `Co-host ${Object.keys(cohostVideoRefs.current).length}`;
            compositorRef.current.addVideo(video, label);
            console.log(`Added co-host to compositor: ${publisher.streamKey}`);
          }
        }, { once: true });
        
        await video.play().catch(() => {});
        
        console.log(`Playing co-host stream: ${publisher.streamKey}`);
      } catch (err) {
        console.warn(`Failed to play co-host stream: ${publisher.streamKey}`, err);
      }
    }
  };

  const setupCompositor = () => {
    if (!canvasRef.current) {
      console.warn("Canvas ref not available for compositor");
      return;
    }
    
    if (!compositorRef.current) {
      compositorRef.current = new StreamCompositor(canvasRef.current, 1280, 720);
      
      compositorRef.current.onFrame = (compositorCanvas) => {
        if (previewCanvasRef.current) {
          const previewCtx = previewCanvasRef.current.getContext('2d');
          if (previewCanvasRef.current.width !== compositorCanvas.width ||
              previewCanvasRef.current.height !== compositorCanvas.height) {
            previewCanvasRef.current.width = compositorCanvas.width;
            previewCanvasRef.current.height = compositorCanvas.height;
          }
          previewCtx.drawImage(compositorCanvas, 0, 0);
        }
      };
      
      console.log("Compositor initialized with preview callback");
    }

    if (videoRef.current && videoRef.current.srcObject) {
      compositorRef.current.addVideo(videoRef.current, 'Host');
      console.log("Added host video to compositor");
    }

    Object.entries(cohostVideoRefs.current).forEach(([key, video]) => {
      if (video.srcObject) {
        compositorRef.current.addVideo(video, 'Co-host');
        console.log("Added co-host video to compositor:", key);
      }
    });
  };

  useEffect(() => {
    const stored = (() => {
      try {
        return JSON.parse(
          localStorage.getItem(STREAM_TOGETHER_HOST_STATE_KEY) || "{}"
        );
      } catch {
        return {};
      }
    })();

    const restoredSession = streamTogetherHostRuntime.session || stored.session;
    const restoredStream = streamTogetherHostRuntime.stream;

    if (stored.title || streamTogetherHostRuntime.title) {
      setTitle(streamTogetherHostRuntime.title || stored.title || "");
    }

    if (restoredSession?.sessionId) {
      setSession(restoredSession);
      setIsLive(Boolean(streamTogetherHostRuntime.isLive || stored.isLive));
    }

    if (
      restoredStream &&
      restoredStream.getTracks().some((track) => track.readyState === "live")
    ) {
      streamRef.current = restoredStream;
      publisherRef.current = streamTogetherHostRuntime.publisher;
      mixedPublisherRef.current = streamTogetherHostRuntime.mixedPublisher;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = restoredStream;
        videoRef.current.play().catch(() => {});
      }
    }

    loadConnectedChannels();

    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    const hasOauthResult =
      oauthError ||
      params.has("facebook_oauth") ||
      params.has("twitch_oauth") ||
      params.has("youtube_oauth");

    if (oauthError) {
      const message = formatOAuthError(oauthError);
      setError(message);
      writeOAuthStatus("error", message);
      window.history.replaceState({}, document.title, "/stream-together");
    }

    const facebookPayload = params.get("facebook_oauth");
    const twitchPayload = params.get("twitch_oauth");
    const youtubePayload = params.get("youtube_oauth");

    try {
      if (facebookPayload) {
        const decoded = decodeOAuthPayload(facebookPayload);
        const pages = decoded?.pages?.data || [];

        if (!Array.isArray(pages) || pages.length === 0) {
          setError("Facebook connected, but no Pages were found.");
        } else {
          writeStoredChannel(
            {
              id: "facebook-connected",
              platform: "facebook",
              name: "Facebook",
              icon: "fab fa-facebook",
              color: "#1877F2",
              logo: "https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg",
              status: "connected",
              pageName: pages[0].name,
              addedAt: new Date().toISOString(),
            },
            {
              facebookPages: pages,
              selectedFacebookPageId: pages[0].id,
              facebookConnectStatus: `Facebook connected. ${pages.length} page(s) found.`,
            }
          );
          writeOAuthStatus("success", "Facebook channel connected.");
          loadConnectedChannels();
        }
        window.history.replaceState({}, document.title, "/stream-together");
      }

      if (twitchPayload) {
        const decoded = decodeOAuthPayload(twitchPayload);
        writeStoredChannel(
          {
            id: `twitch-${decoded.user.id}`,
            platform: "twitch",
            name: "Twitch",
            displayName: decoded.user.display_name,
            icon: "fab fa-twitch",
            color: "#9146FF",
            logo: "https://cdn4.iconfinder.com/data/icons/social-media-logos-8/512/Twitch-512.png",
            status: "connected",
            streamKey: decoded.stream_key,
            rtmpUrl: decoded.rtmp_url,
            addedAt: new Date().toISOString(),
          },
          {
            twitchConnected: true,
            twitchUsername: decoded.user.display_name,
            twitchStreamKey: decoded.stream_key,
            twitchRtmpUrl: decoded.rtmp_url,
          }
        );
        writeOAuthStatus("success", "Twitch channel connected.");
        loadConnectedChannels();
        window.history.replaceState({}, document.title, "/stream-together");
      }

      if (youtubePayload) {
        const decoded = decodeOAuthPayload(youtubePayload);
        writeStoredChannel(
          {
            id: `youtube-${decoded.user.id}`,
            platform: "youtube",
            name: "YouTube",
            displayName: decoded.user.title,
            icon: "fab fa-youtube",
            color: "#FF0000",
            logo: "https://cdn2.iconfinder.com/data/icons/social-media-2285/512/1_Youtube_colored_svg-512.png",
            status: "connected",
            streamKey: decoded.stream_key || "",
            rtmpUrl: decoded.rtmp_url || "",
            addedAt: new Date().toISOString(),
          },
          {
            youtubeConnected: true,
            youtubeChannelName: decoded.user.title,
            youtubeStreamKey: decoded.stream_key || "",
            youtubeRtmpUrl: decoded.rtmp_url || "",
            youtubeAccessToken: decoded.access_token || "",
            youtubeRefreshToken: decoded.refresh_token || "",
          }
        );
        writeOAuthStatus("success", "YouTube channel connected.");
        loadConnectedChannels();
        window.history.replaceState({}, document.title, "/stream-together");
      }
    } catch (err) {
      const message =
        "Could not read the channel connection result. Please try again.";
      setError(message);
      writeOAuthStatus("error", message);
      console.error("OAuth payload handling failed:", err);
    }

    if (window.opener && hasOauthResult) {
      setTimeout(() => window.close(), 800);
    }

    const handleStorage = (event) => {
      if (event.key === CHANNEL_STORAGE_KEY) {
        loadConnectedChannels();
      }

      if (event.key === OAUTH_STATUS_KEY && event.newValue) {
        try {
          const status = JSON.parse(event.newValue);
          if (status?.message) {
            setError(status.type === "error" ? status.message : "");
            if (status.type === "success") loadConnectedChannels();
          }
        } catch {}
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      Object.values(cohostVideoRefs.current).forEach(v => {
        v.srcObject?.getTracks().forEach(t => t.stop());
        v.remove();
      });
      cohostVideoRefs.current = {};
    };
  }, []);

  // FIX D: Poll for session changes and clean up disconnected co-hosts
  useEffect(() => {
    if (!isLive || !session?.sessionId) return;

    const timer = setInterval(async () => {
      try {
        const data = await apiFetch(`/session/${session.sessionId}`);
        setSession(data.session);
        
        const currentPublishers = data.session?.publishers || [];
        const currentCoHostKeys = currentPublishers
          .filter(p => p.role === 'cohost')
          .map(p => p.streamKey);
        
        // Remove co-hosts that are no longer in the session (FIX D)
        Object.keys(cohostVideoRefs.current).forEach(streamKey => {
          if (!currentCoHostKeys.includes(streamKey)) {
            console.log(`Co-host disconnected: ${streamKey}`);
            removeCoHostStream(streamKey);
          }
        });
        
        // Play new co-host streams
        const cohostPublishers = currentPublishers.filter(p => p.role === 'cohost');
        for (const publisher of cohostPublishers) {
          await playCoHostStream(publisher);
        }
      } catch (err) {
        console.warn("Session refresh failed:", err);
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [isLive, session?.sessionId]);

  const activateCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    streamRef.current = stream;
    saveHostRuntime({
      stream,
      cameraActive: true,
      title: title.trim() || streamTogetherHostRuntime.title,
    });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
    setCameraActive(true);
    
    if (compositorRef.current) {
      compositorRef.current.addVideo(videoRef.current, 'Host');
    }
    
    return stream;
  };

  const stopLocalMedia = () => {
    compositorRef.current?.stop();
    compositorRef.current = null;
    
    publisherRef.current?.close?.();
    publisherRef.current = null;
    
    if (mixedPublisherRef.current) {
      mixedPublisherRef.current.close();
      mixedPublisherRef.current = null;
    }
    
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    
    Object.values(cohostPlayersRef.current).forEach(player => player?.close?.());
    cohostPlayersRef.current = {};
    Object.values(cohostVideoRefs.current).forEach(v => {
      v.srcObject?.getTracks().forEach(t => t.stop());
      v.remove();
    });
    cohostVideoRefs.current = {};
    
    saveHostRuntime({
      stream: null,
      publisher: null,
      mixedPublisher: null,
      cameraActive: false,
      isLive: false,
    });
    
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const createInviteSession = async () => {
    if (session?.sessionId) {
      try {
        const existing = await apiFetch(`/session/${session.sessionId}`);
        setSession(existing.session);
        saveHostRuntime({
          session: existing.session,
          title: title.trim() || existing.session.title || "",
        });
        return existing.session;
      } catch (err) {
        if (!isStreamTogetherSessionNotFound(err)) throw err;

        setSession(null);
        setIsLive(false);
        setShowInvite(false);
        saveHostRuntime({
          session: null,
          isLive: false,
          title: title.trim(),
        });
      }
    }

    const sessionId = makeSessionId();
    const created = await apiFetch("/create-session", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        clientSessionId: sessionId,
        streamKey: sessionId,
        destinations: selectedDestinations.map((channel) => ({
          id: channel.id,
          platform: channel.platform,
          name: channel.name,
          displayName: channel.displayName || channel.pageName || "",
          status: channel.status,
        })),
      }),
    });

    setSession(created.session);
    saveHostRuntime({
      session: created.session,
      title: title.trim(),
    });
    return created.session;
  };

  // FIX C: FFmpeg consumes mixedStreamKey
  const startFFmpegForDestinations = async (mixedStreamKey) => {
    const saved = readStoredChannels();
    const platformsStarted = [];

    for (const channel of selectedDestinations) {
      try {
        if (channel.platform === "twitch" && saved.twitchStreamKey) {
          await fetch(`${RAW_API_BASE}/api/twitch/live/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelId: session?.sessionId || "streamtogether",
              streamKey: saved.twitchStreamKey,
              srsStreamKey: mixedStreamKey,
            }),
          });
          platformsStarted.push("Twitch");
        }

        if (channel.platform === "youtube" && saved.youtubeAccessToken) {
          await fetch(`${RAW_API_BASE}/api/youtube/live/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelId: session?.sessionId || "streamtogether",
              accessToken: saved.youtubeAccessToken,
              refreshToken: saved.youtubeRefreshToken,
              title: title || "Stream Together Live",
              description: "Live from Stream Together",
              srsStreamKey: mixedStreamKey,
            }),
          });
          platformsStarted.push("YouTube");
        }

        if (channel.platform === "facebook") {
          const pages = saved.facebookPages || [];
          const selectedPageId = saved.selectedFacebookPageId;
          const page = pages.find((p) => p.id === selectedPageId);

          if (page?.access_token) {
            await fetch(`${RAW_API_BASE}/api/facebook/live/start`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                channelId: session?.sessionId || "streamtogether",
                title: title || "Stream Together Live",
                description: "Live from Stream Together",
                pageId: page.id,
                pageAccessToken: page.access_token,
                srsStreamKey: mixedStreamKey,
              }),
            });
            platformsStarted.push("Facebook");
          }
        }
      } catch (err) {
        console.error(`Failed to start FFmpeg for ${channel.platform}:`, err);
      }
    }

    if (platformsStarted.length > 0) {
      setFfmpegStatus(`Streaming to ${platformsStarted.join(", ")}`);
    }
  };

  const stopFFmpegForDestinations = async () => {
    const stopPromises = [];

    if (selectedDestinations.some((c) => c.platform === "twitch")) {
      stopPromises.push(
        fetch(`${RAW_API_BASE}/api/twitch/live/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId: session?.sessionId || "streamtogether" }),
        }).catch(() => {})
      );
    }

    if (selectedDestinations.some((c) => c.platform === "youtube")) {
      stopPromises.push(
        fetch(`${RAW_API_BASE}/api/youtube/live/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId: session?.sessionId || "streamtogether" }),
        }).catch(() => {})
      );
    }

    if (selectedDestinations.some((c) => c.platform === "facebook")) {
      stopPromises.push(
        fetch(`${RAW_API_BASE}/api/facebook/live/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId: session?.sessionId || "streamtogether" }),
        }).catch(() => {})
      );
    }

    await Promise.allSettled(stopPromises);
    setFfmpegStatus("");
  };

  const startStream = async () => {
    if (!title.trim()) {
      setError("Enter a session title first.");
      return null;
    }

    setIsBusy(true);
    setError("");
    setFfmpegStatus("");

    try {
      const stream = streamRef.current || (await activateCamera());
      const currentSession = await createInviteSession();
      const hostStreamKey = `${currentSession.sessionId}-host`;
      // FIX A: Use ${sessionId}-mixed instead of "test"
      const mixedStreamKey = `${currentSession.sessionId}-mixed`;
      let publishStatus = "publishing";

      setupCompositor();

      // 1. Publish RAW HOST stream to session (for co-hosts to see individually)
      try {
        const publisher = await publishToSrs(stream, hostStreamKey);
        publisherRef.current = publisher;
        saveHostRuntime({ publisher });
        console.log("Published raw host stream for co-hosts:", hostStreamKey);
      } catch (publishError) {
        publishStatus = "local-preview";
        console.warn("Host SRS publish failed:", publishError);
      }

      // 2. Publish COMPOSITED stream to mixedStreamKey for FFmpeg and viewers
      if (selectedDestinations.length > 0) {
        try {
          // Wait for compositor to start drawing (at least a few frames)
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Force rebuild to ensure stream is fresh
          if (compositorRef.current) {
            compositorRef.current._rebuildOutputStream();
          }
          
          const compositedStream = compositorRef.current.getOutputStream();
          
          // Verify stream has tracks
          if (compositedStream.getVideoTracks().length === 0) {
            throw new Error("Composited stream has no video track - compositor may not be drawing yet");
          }
          
          console.log('Composited stream ready:', {
            video: compositedStream.getVideoTracks().length,
            audio: compositedStream.getAudioTracks().length,
            active: compositedStream.active,
            videoReadyState: compositedStream.getVideoTracks()[0]?.readyState
          });
          
          // Add host audio if needed
          if (stream.getAudioTracks().length > 0 && compositedStream.getAudioTracks().length === 0) {
            stream.getAudioTracks().forEach(track => {
              compositedStream.addTrack(track.clone());
            });
          }
          
          if (mixedPublisherRef.current) {
            mixedPublisherRef.current.close();
          }
          
          // FIX A: Publish to mixedStreamKey
          const mixedPublisher = await publishToSrs(compositedStream, mixedStreamKey);
          mixedPublisherRef.current = mixedPublisher;
          saveHostRuntime({ mixedPublisher });
          console.log(`Published COMPOSITED stream to '${mixedStreamKey}'`);
          setFfmpegStatus("Composited stream ready for external platforms");
        } catch (mixedPublishError) {
          console.error("Failed to publish composited stream:", mixedPublishError);
          try {
            const fallbackStream = stream.clone();
            const mixedPublisher = await publishToSrs(fallbackStream, mixedStreamKey);
            mixedPublisherRef.current = mixedPublisher;
            console.warn(`Fallback: Publishing raw host stream to ${mixedStreamKey}`);
          } catch (fallbackError) {
            console.error("Even fallback publish failed:", fallbackError);
          }
        }
      }

      // 3. Register host publisher with session
      await apiFetch(`/register-publisher/${currentSession.sessionId}`, {
        method: "POST",
        body: JSON.stringify({
          userId: "host",
          role: "host",
          streamKey: hostStreamKey,
          publishStatus,
        }),
      });

      // 4. Start session
      const started = await apiFetch(`/start-session/${currentSession.sessionId}`, {
        method: "POST",
      });

      setSession(started.session);
      setIsLive(true);
      saveHostRuntime({
        session: started.session,
        isLive: true,
        title: title.trim(),
      });

      // 5. Start FFmpeg with mixedStreamKey (FIX C)
      if (selectedDestinations.length > 0) {
        await startFFmpegForDestinations(mixedStreamKey);
      }

      if (publishStatus === "local-preview") {
        setError(
          "Session started locally, but SRS publishing failed. Co-hosts can still join; check SRS before going public."
        );
      }

      return started.session;
    } catch (err) {
      setError(err.message || "Failed to start Stream Together.");
      setIsLive(false);
      stopLocalMedia();
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const stopStream = async () => {
    setIsBusy(true);
    setError("");

    await stopFFmpegForDestinations();

    try {
      if (session?.sessionId) {
        await apiFetch(`/stop-session/${session.sessionId}`, { method: "POST" });
      }
    } catch (err) {
      setError(err.message || "Failed to stop session.");
    } finally {
      stopLocalMedia();
      setIsLive(false);
      setShowInvite(false);
      setIsBusy(false);
      setSession((prev) =>
        prev ? { ...prev, status: "ended", publishers: [], coHosts: [] } : prev
      );
      localStorage.removeItem(STREAM_TOGETHER_HOST_STATE_KEY);
      saveHostRuntime({
        session: null,
        title: "",
      });
    }
  };

  const openInvite = async () => {
    if (!title.trim()) {
      setError("Enter a session title first.");
      return;
    }

    setIsBusy(true);
    setError("");

    try {
      const currentSession = await createInviteSession();
      if (currentSession) setShowInvite(true);
    } catch (err) {
      setError(err.message || "Failed to create a co-host invite.");
    } finally {
      setIsBusy(false);
    }
  };

  const copy = async (value, label) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(value);
      setCopied(`${label} copied`);
    } catch (err) {
      setCopied(
        `${label} could not be copied automatically. Select the link and copy it manually.`
      );
    }

    setTimeout(() => setCopied(""), 1800);
  };

  const toggleDestination = (channelId) => {
    const id = String(channelId);
    setSelectedChannelIds((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  };

  const openChannelModal = () => {
    loadConnectedChannels();
    setShowChannelModal(true);
  };

  const closeChannelModal = () => {
    setShowChannelModal(false);
    loadConnectedChannels();
  };

  const startOAuth = (platform) => {
    const url = `${RAW_API_BASE.replace(
      /\/+$/,
      ""
    )}/api/oauth/${platform}/start?returnTo=${encodeURIComponent(
      "/stream-together"
    )}`;

    const popupWidth = 560;
    const popupHeight = 720;
    const left = Math.max(0, window.screenX + (window.outerWidth - popupWidth) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - popupHeight) / 2);
    const popup = window.open(
      url,
      "streammova-channel-connect",
      `popup=yes,width=${popupWidth},height=${popupHeight},left=${left},top=${top}`
    );

    if (!popup) {
      setError(
        "Your browser blocked the channel connection popup. Allow popups for this site, then try again."
      );
      return;
    }

    popup.focus();
    setShowChannelModal(false);
  };

  return (
    <div className="stream-together-page">
      <div className="stream-together-shell">
        <StreamTogetherHeader isLive={isLive} onBack={onBack} />

        <div className="stream-together-grid">
          <div className="stream-together-card">
            <canvas 
              ref={canvasRef} 
              style={{ display: 'none' }}
              width="1280" 
              height="720"
            />
            
            <div className="stream-together-video">
              <video ref={videoRef} autoPlay muted playsInline />
              {!cameraActive && (
                <div className="stream-together-placeholder">
                  <div>
                    <i className="fas fa-users"></i>
                    <strong>Host camera is off</strong>
                    <p className="stream-together-muted">
                      Start a Stream Together session to invite co-hosts.
                    </p>
                  </div>
                </div>
              )}
              {isLive && (
                <div className="stream-together-live-badge">
                  <span className="stream-together-dot" />
                  HOST LIVE
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, display: isLive ? 'block' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>Combined Stream (sent to platforms)</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="stream-together-button"
                    onClick={() => {
                      setLayoutMode("side-by-side");
                      compositorRef.current?.setLayout("side-by-side");
                    }}
                    style={{ 
                      padding: '4px 12px', 
                      fontSize: 12, 
                      minHeight: 30,
                      background: layoutMode === 'side-by-side' ? 'rgba(106, 17, 203, 0.5)' : undefined 
                    }}
                  >
                    <i className="fas fa-columns"></i> Side by Side
                  </button>
                  <button
                    className="stream-together-button"
                    onClick={() => {
                      setLayoutMode("pip");
                      compositorRef.current?.setLayout("pip");
                    }}
                    style={{ 
                      padding: '4px 12px', 
                      fontSize: 12, 
                      minHeight: 30,
                      background: layoutMode === 'pip' ? 'rgba(106, 17, 203, 0.5)' : undefined
                    }}
                  >
                    <i className="fas fa-window-restore"></i> PIP
                  </button>
                </div>
              </div>
              <div className="stream-together-video" style={{ maxHeight: 360, border: '2px solid rgba(106, 17, 203, 0.3)', position: 'relative' }}>
                <canvas 
                  ref={previewCanvasRef}
                  width="1280"
                  height="720"
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'contain',
                    display: 'block',
                    backgroundColor: '#05060a'
                  }}
                />
              </div>
            </div>

            <div className="stream-together-controls">
              <div className="stream-together-field">
                <label htmlFor="stream-title">Session title</label>
                <input
                  id="stream-title"
                  className="stream-together-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Friday show with guests"
                  disabled={isLive || isBusy}
                />
              </div>

              <div className="stream-together-actions">
                <button
                  className="stream-together-button primary"
                  onClick={startStream}
                  disabled={isLive || isBusy || !title.trim()}
                >
                  <i className="fas fa-broadcast-tower"></i>
                  {isBusy ? "Starting..." : "Start Session"}
                </button>
                <button
                  className="stream-together-button"
                  onClick={openInvite}
                  disabled={isBusy || !title.trim()}
                >
                  <i className="fas fa-user-plus"></i>
                  Invite Co-host
                </button>
                {isLive && (
                  <button
                    className="stream-together-button danger"
                    onClick={stopStream}
                    disabled={isBusy}
                  >
                    <i className="fas fa-stop"></i>
                    Stop
                  </button>
                )}
              </div>
            </div>

            {ffmpegStatus && (
              <div className="stream-together-ffmpeg-status">
                <i className="fas fa-satellite-dish"></i> {ffmpegStatus}
              </div>
            )}

            {error && <div className="stream-together-error">{error}</div>}
          </div>

          <div className="stream-together-panel">
            <h2>Session</h2>
            <div className="stream-together-meta">
              <div className="stream-together-meta-item">
                <span>Status</span>
                <strong>{isLive ? "Live" : "Ready"}</strong>
              </div>
              <div className="stream-together-meta-item">
                <span>Session ID</span>
                <span className="stream-together-code">
                  {session?.sessionId || "Not created"}
                </span>
              </div>
              <div className="stream-together-meta-item">
                <span>Publishers</span>
                <strong>{activePublishers.length}</strong>
              </div>
              <div className="stream-together-meta-item">
                <span>Co-hosts</span>
                <strong>{coHosts.length}</strong>
              </div>
              <div className="stream-together-meta-item">
                <span>Destinations</span>
                <strong>{selectedDestinations.length}</strong>
              </div>
            </div>

            <h3 style={{ marginTop: 22 }}>Destinations</h3>
            <div className="stream-together-destinations">
              {connectedChannels.length === 0 ? (
                <p className="stream-together-muted">
                  No channels connected yet. Connect Facebook, Twitch, or YouTube
                  before starting if you want this session sent to external
                  platforms.
                </p>
              ) : (
                connectedChannels.map((channel) => {
                  const channelId = String(channel.id);
                  const checked = selectedChannelIds.includes(channelId);

                  return (
                    <label
                      className="stream-together-destination"
                      key={channelId}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isLive}
                        onChange={() => toggleDestination(channelId)}
                      />
                      {channel.logo ? (
                        <img src={channel.logo} alt="" />
                      ) : (
                        <i className={channel.icon || "fas fa-satellite-dish"}></i>
                      )}
                      <span>
                        <strong>{channel.name}</strong>
                        {(channel.displayName || channel.pageName) && (
                          <small>{channel.displayName || channel.pageName}</small>
                        )}
                      </span>
                    </label>
                  );
                })
              )}

              <button
                className="stream-together-button"
                type="button"
                onClick={openChannelModal}
              >
                <i className="fas fa-plus"></i>
                Connect Channels
              </button>
            </div>

            <h3 style={{ marginTop: 22 }}>People</h3>
            <div className="stream-together-meta">
              {activePublishers.length === 0 && (
                <p className="stream-together-muted">No publishers connected yet.</p>
              )}
              {activePublishers.map((publisher) => (
                <div className="stream-together-person" key={publisher.streamKey}>
                  <span>{publisher.role === "host" ? "Host" : "Co-host"}</span>
                  <span className="stream-together-code">{publisher.streamKey}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showInvite && session && (
        <div className="stream-together-modal" onClick={() => setShowInvite(false)}>
          <div
            className="stream-together-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="stream-together-modal-head">
              <h2>Invite Links</h2>
              <button
                className="stream-together-button"
                onClick={() => setShowInvite(false)}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <InviteLink label="Co-host link" value={cohostLink} onCopy={copy} />
            <InviteLink label="Viewer link" value={viewerLink} onCopy={copy} />

            <p className="stream-together-muted">
              Co-hosts publish their camera into this session. Their video will be
              combined with yours into a single stream for external platforms.
            </p>
            {copied && <div className="stream-together-error">{copied}</div>}
          </div>
        </div>
      )}

      <ChannelModal
        showChannelModal={showChannelModal}
        modalRef={modalRef}
        handleCloseChannelModal={closeChannelModal}
        handleFacebookOAuth={() => startOAuth("facebook")}
        handleTwitchOAuth={() => startOAuth("twitch")}
        handleYouTubeOAuth={() => startOAuth("youtube")}
        facebookConnectStatus=""
        twitchConnected={connectedChannels.some(
          (channel) => channel.platform === "twitch"
        )}
        twitchUsername={
          connectedChannels.find((channel) => channel.platform === "twitch")
            ?.displayName || ""
        }
        youtubeConnected={connectedChannels.some(
          (channel) => channel.platform === "youtube"
        )}
        youtubeChannelName={
          connectedChannels.find((channel) => channel.platform === "youtube")
            ?.displayName || ""
        }
      />
    </div>
  );
}

// =========================
// SHARED COMPONENTS
// =========================

function InviteLink({ label, value, onCopy }) {
  return (
    <div className="stream-together-field" style={{ marginBottom: 16 }}>
      <label>{label}</label>
      <div className="stream-together-link-row">
        <input className="stream-together-input" value={value} readOnly />
        <button
          className="stream-together-button primary"
          onClick={() => onCopy(value, label)}
        >
          <i className="fas fa-copy"></i>
          Copy
        </button>
      </div>
    </div>
  );
}

function StreamTogetherHeader({ isLive, onBack }) {
  return (
    <div className="stream-together-header">
      <div className="stream-together-title-row">
        <button
          type="button"
          className="stream-together-back-button"
          onClick={onBack}
          aria-label="Go back"
        >
          <i className="fas fa-arrow-left"></i>
        </button>
        <div>
          <h1>Stream Together</h1>
          <p>Host a live room, invite co-hosts, and share a viewer link.</p>
        </div>
      </div>
      <span className={`stream-together-status ${isLive ? "live" : "ready"}`}>
        <span className="stream-together-dot" />
        {isLive ? "Live" : "Ready"}
      </span>
    </div>
  );
}

function CoHostJoin({ sessionId, onBack }) {
  const [session, setSession] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [joined, setJoined] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [coHostUserId, setCoHostUserId] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const publisherRef = useRef(null);

  useEffect(() => {
    apiFetch(`/session/${sessionId}`)
      .then((data) => setSession(data.session))
      .catch((err) => setError(err.message || "Session not found."));

    return () => {
      publisherRef.current?.close?.();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [sessionId]);

  const activateCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
    setCameraActive(true);
    return stream;
  };

  const join = async () => {
    setIsBusy(true);
    setError("");
    try {
      const stream = streamRef.current || (await activateCamera());
      const userId = `cohost-${Date.now()}`;
      const streamKey = `${sessionId}-${userId}`;

      await apiFetch(`/join-session/${sessionId}`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });

      let publishStatus = "publishing";

      try {
        publisherRef.current = await publishToSrs(stream, streamKey);
      } catch (publishError) {
        publishStatus = "local-preview";
        console.warn("Co-host SRS publish failed:", publishError);
      }

      const data = await apiFetch(`/register-publisher/${sessionId}`, {
        method: "POST",
        body: JSON.stringify({ userId, role: "cohost", streamKey, publishStatus }),
      });

      setSession(data.session);
      setCoHostUserId(userId);
      setJoined(true);
      if (publishStatus === "local-preview") {
        setError(
          "Joined the session, but SRS publishing failed. The host can see you joined; check SRS before going public."
        );
      }
    } catch (err) {
      setError(err.message || "Failed to join as co-host.");
      leaveLocal();
    } finally {
      setIsBusy(false);
    }
  };

  const leaveLocal = async () => {
    publisherRef.current?.close?.();
    publisherRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setCoHostUserId("");
    setJoined(false);
  };

  const leave = async () => {
    try {
      await apiFetch(`/leave-session/${sessionId}`, {
        method: "POST",
        body: JSON.stringify({ userId: coHostUserId }),
      });
    } catch {}
    leaveLocal();
  };

  return (
    <div className="stream-together-page">
      <div className="stream-together-shell">
        <StreamTogetherHeader isLive={joined} onBack={onBack} />
        <div className="stream-together-grid">
          <div className="stream-together-card">
            <div className="stream-together-video">
              <video ref={videoRef} autoPlay muted playsInline />
              {!cameraActive && (
                <div className="stream-together-placeholder">
                  <div>
                    <i className="fas fa-video-slash"></i>
                    <strong>Camera is off</strong>
                    <p className="stream-together-muted">
                      Join when you are ready to publish your camera.
                    </p>
                  </div>
                </div>
              )}
              {joined && (
                <div className="stream-together-live-badge">
                  <span className="stream-together-dot" />
                  CO-HOST LIVE
                </div>
              )}
            </div>
            <div className="stream-together-actions" style={{ marginTop: 18 }}>
              {!joined ? (
                <button
                  className="stream-together-button primary"
                  onClick={join}
                  disabled={isBusy || !session}
                >
                  <i className="fas fa-user-plus"></i>
                  {isBusy ? "Joining..." : "Join as Co-host"}
                </button>
              ) : (
                <button className="stream-together-button danger" onClick={leave}>
                  <i className="fas fa-sign-out-alt"></i>
                  Leave
                </button>
              )}
            </div>
            {error && <div className="stream-together-error">{error}</div>}
          </div>

          <div className="stream-together-panel">
            <h2>{session?.title || "Co-host Invite"}</h2>
            <p className="stream-together-muted">
              Session ID: <span className="stream-together-code">{sessionId}</span>
            </p>
            <p className="stream-together-muted">
              Your video will be combined with the host's stream for external platforms.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// FIX B: Viewer plays mixedStreamKey, not hostStreamKey
function StreamViewer({ sessionId, onBack }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  // FIX B: Use mixed stream key for viewer
  const mixedStreamKey = useMemo(() => `${sessionId}-mixed`, [sessionId]);

  const hostPublisher = useMemo(
    () => session?.publishers?.find((publisher) => publisher.role === "host"),
    [session]
  );

  const coHosts = useMemo(
    () => session?.publishers?.filter((publisher) => publisher.role === "cohost") || [],
    [session]
  );

  useEffect(() => {
    apiFetch(`/session/${sessionId}`)
      .then((data) => setSession(data.session))
      .catch((err) => setError(err.message || "Stream not found."));

    return () => playerRef.current?.close?.();
  }, [sessionId]);

  // FIX B: Play the mixed stream instead of host-only stream
  const play = async () => {
    if (!videoRef.current) {
      setError("Video element not ready.");
      return;
    }

    try {
      setError("");
      playerRef.current?.close?.();
      // Play the mixed/composited stream
      playerRef.current = await playFromSrs(videoRef.current, mixedStreamKey);
      setIsPlaying(true);
      console.log(`Viewer playing mixed stream: ${mixedStreamKey}`);
    } catch (err) {
      // Fallback: try host stream if mixed stream fails
      if (hostPublisher?.streamKey) {
        try {
          console.warn("Mixed stream failed, falling back to host stream");
          playerRef.current = await playFromSrs(videoRef.current, hostPublisher.streamKey);
          setIsPlaying(true);
        } catch (fallbackErr) {
          setError(fallbackErr.message || "Failed to play stream.");
        }
      } else {
        setError(err.message || "Failed to play stream. The host may not be live yet.");
      }
    }
  };

  return (
    <div className="stream-together-page">
      <div className="stream-together-shell">
        <StreamTogetherHeader isLive={session?.status === "live"} onBack={onBack} />
        <div className="stream-together-grid stream-together-viewer-grid">
          <div className="stream-together-card">
            <div className="stream-together-stream-grid">
              <div className="stream-together-stream-primary">
                <div className="stream-together-stream-label">
                  <span>Combined Stream</span>
                  <small>{hostPublisher ? "Live" : "Waiting for host"}</small>
                </div>
                <div className="stream-together-video">
                  <video ref={videoRef} autoPlay playsInline controls />
                  {!isPlaying && (
                    <div className="stream-together-placeholder">
                      <div>
                        <i className="fas fa-play-circle"></i>
                        <strong>{session?.title || "Stream Together"}</strong>
                        <p className="stream-together-muted">
                          Press play to watch the combined stream with host and co-hosts.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="stream-together-stream-secondary">
                <div className="stream-together-stream-label">
                  <span>Participants</span>
                  <small>{coHosts.length + (hostPublisher ? 1 : 0)} active</small>
                </div>
                <div className="stream-together-cohost-list">
                  {hostPublisher && (
                    <div className="stream-together-cohost-item">
                      <strong>Host</strong>
                      <p className="stream-together-muted">Live now</p>
                    </div>
                  )}
                  {coHosts.length === 0 ? (
                    <div className="stream-together-muted">
                      No co-hosts are live yet.
                    </div>
                  ) : (
                    coHosts.map((publisher) => (
                      <div className="stream-together-cohost-item" key={publisher.streamKey}>
                        <strong>{publisher.userId || publisher.streamKey}</strong>
                        <p className="stream-together-muted">
                          {publisher.publishStatus === "publishing" ? "Live now" : "Preview mode"}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="stream-together-actions" style={{ marginTop: 18 }}>
              <button className="stream-together-button primary" onClick={play}>
                <i className="fas fa-play"></i>
                {isPlaying ? "Watching..." : "Play Combined Stream"}
              </button>
            </div>
            {error && <div className="stream-together-error">{error}</div>}
          </div>

          <div className="stream-together-panel">
            <h2>Now Watching</h2>
            <p className="stream-together-muted">
              Session ID: <span className="stream-together-code">{sessionId}</span>
            </p>
            <p className="stream-together-muted" style={{ marginTop: 8 }}>
              Watching the combined stream with host and all co-hosts.
            </p>
            <div className="stream-together-meta">
              <div className="stream-together-meta-item">
                <span>Active participants</span>
                <strong>{session?.publishers?.length || 0}</strong>
              </div>
              <div className="stream-together-meta-item">
                <span>Status</span>
                <strong>{session?.status || "loading"}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StreamTogether;