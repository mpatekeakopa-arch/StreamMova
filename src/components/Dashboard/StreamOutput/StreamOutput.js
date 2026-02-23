import React, { useEffect, useMemo, useRef, useState } from "react";
import "./StreamOutput.css";

/**
 * StreamOutput responsibilities now:
 * 1) Preview cameraStream (from Dashboard) when camera is on.
 * 2) Allow publishing to SRS via WebRTC (WHIP style via SRS sdk).
 * 3) Keep old UI behavior for Start/Stop camera (handleStreamToggle).
 *
 * REQUIREMENT:
 * - Add `cameraStream` prop from Dashboard (state)
 * - Add `openCamera` and `closeCamera` props from Dashboard (optional but recommended)
 *
 * SRS:
 * - Your VM exposes rtc_server UDP 8000 and candidate set.
 * - We'll publish to: webrtc://84.8.132.222/live/test  (change app/stream as desired)
 *
 * NOTE:
 * - This uses SRS JS SDK via dynamic import of script: https://cdn.jsdelivr.net/npm/srs-sdk@latest/srs.sdk.js
 *   If you prefer hosting the sdk yourself, replace the URL below.
 */

function StreamOutput({
  // existing
  isStreaming,
  isCameraOn,
  error,
  uploadedVideo,
  recordedVideo,
  videoRef,
  streamRef,
  connectedChannels,
  handleStreamToggle,
  handleOpenChannelModal,
  handleRemoveChannel,

  // NEW from Dashboard (add these props)
  cameraStream,
  openCamera,
  closeCamera,

  // Optional override if you want to pass VM IP/domain from env later
  srsRtcBaseUrl, // e.g. "webrtc://84.8.132.222/live"
  srsApp, // default "live"
  srsStream, // default "test"
}) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [pubError, setPubError] = useState("");
  const [pubStatus, setPubStatus] = useState("idle"); // idle | connecting | publishing | stopped | failed
  const publisherRef = useRef(null);
  const sdkReadyRef = useRef(false);

  const rtcUrl = useMemo(() => {
    const base = srsRtcBaseUrl || "webrtc://84.8.132.222/live";
    const app = srsApp || "live";
    const stream = srsStream || "test";

    // If user passes full base like webrtc://ip/live, keep it.
    // Otherwise allow base like webrtc://ip and append /app
    if (base.endsWith(`/${app}`)) return `${base}/${stream}`;
    if (base.includes("webrtc://") && base.split("/").length >= 4) {
      // likely already has app, append stream
      return `${base}/${stream}`;
    }
    return `${base.replace(/\/+$/, "")}/${app}/${stream}`;
  }, [srsRtcBaseUrl, srsApp, srsStream]);

  // -----------------------------
  // Load SRS SDK dynamically once
  // -----------------------------
  const loadSrsSdk = async () => {
    if (sdkReadyRef.current) return true;
    if (window.SrsRtcPublisherAsync) {
      sdkReadyRef.current = true;
      return true;
    }

    // Avoid injecting multiple times
    const existing = document.querySelector('script[data-srs-sdk="1"]');
    if (existing) {
      await new Promise((r) => {
        existing.addEventListener("load", r, { once: true });
        existing.addEventListener("error", r, { once: true });
      });
      sdkReadyRef.current = !!window.SrsRtcPublisherAsync;
      return sdkReadyRef.current;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.srsSdk = "1";
    // SRS official sdk is commonly served from jsdelivr. Change if you want.
    script.src = "https://cdn.jsdelivr.net/npm/srs-sdk@latest/srs.sdk.js";

    const ok = await new Promise((resolve) => {
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });

    sdkReadyRef.current = ok && !!window.SrsRtcPublisherAsync;
    return sdkReadyRef.current;
  };

  // -----------------------------------------
  // Preview: attach cameraStream to <video>
  // -----------------------------------------
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    // If camera is off (or no stream), detach
    if (!isCameraOn || !cameraStream) {
      // Only clear srcObject; do NOT touch uploaded/recorded previews (they use video.src)
      if (video.srcObject) video.srcObject = null;
      return;
    }

    // If an upload/recording preview is playing via `video.src`, clear it for live preview
    if (video.src) {
      try {
        video.pause();
      } catch {}
      video.removeAttribute("src");
      video.load();
    }

    video.srcObject = cameraStream;

    const tryPlay = async () => {
      try {
        await video.play();
      } catch (e) {
        console.error("Video play failed:", e);
      }
    };

    tryPlay();

    return () => {
      if (video && video.srcObject === cameraStream) video.srcObject = null;
    };
  }, [isCameraOn, cameraStream, videoRef]);

  // Keep legacy ref compatibility: if Dashboard still updates streamRef, fine.
  // If not, mirror cameraStream into streamRef so recording logic keeps working.
  useEffect(() => {
    if (!streamRef) return;
    if (cameraStream && streamRef.current !== cameraStream) streamRef.current = cameraStream;
    if (!cameraStream && streamRef.current) streamRef.current = null;
  }, [cameraStream, streamRef]);

  // -----------------------------
  // Publish/unpublish to SRS
  // -----------------------------
  const startPublish = async () => {
    setPubError("");

    // Ensure camera is available
    let s = cameraStream || streamRef?.current;
    if (!s) {
      if (openCamera) {
        s = await openCamera();
      } else {
        // fallback: ask user to click Start Multistream first
        setPubError('Turn on the camera first (click "Start Multistream").');
        setPubStatus("failed");
        return;
      }
    }
    if (!s) {
      setPubError("Camera stream not available.");
      setPubStatus("failed");
      return;
    }

    setPubStatus("connecting");
    setIsPublishing(true);

    const ok = await loadSrsSdk();
    if (!ok) {
      setPubError("Failed to load SRS WebRTC SDK (srs.sdk.js).");
      setPubStatus("failed");
      setIsPublishing(false);
      return;
    }

    try {
      // stop existing publisher if any
      if (publisherRef.current) {
        try {
          await publisherRef.current.close?.();
        } catch {}
        publisherRef.current = null;
      }

      const pub = new window.SrsRtcPublisherAsync();

      // Try to use your preview video element (optional)
      // The SDK can also work without binding, but this provides local preview continuity.
      try {
        const video = videoRef?.current;
        if (video) {
          // Some versions expose `publish(url, { video })`, others `publish(url)`
          // We'll just set srcObject for preview ourselves already, so this is optional.
          // pub.attach?.(video); // not always available
        }
      } catch {}

      // Publish to SRS
      // Many SRS SDK versions accept `publish(url, stream)` to use an existing MediaStream.
      // We'll attempt that, and fallback if not supported.
      let res;
      if (pub.publish.length >= 2) {
        res = await pub.publish(rtcUrl, s);
      } else {
        // fallback (SDK will call getUserMedia internally)
        res = await pub.publish(rtcUrl);
      }

      publisherRef.current = pub;
      setPubStatus("publishing");
      setIsPublishing(true);

      // If SDK returns session info, we keep it silent (avoid noisy UI)
      return res;
    } catch (e) {
      console.error(e);
      setPubError(String(e?.message || e));
      setPubStatus("failed");
      setIsPublishing(false);
      try {
        if (publisherRef.current) await publisherRef.current.close?.();
      } catch {}
      publisherRef.current = null;
    }
  };

  const stopPublish = async () => {
    setPubError("");
    setPubStatus("stopped");

    try {
      if (publisherRef.current) {
        await publisherRef.current.close?.();
      }
    } catch (e) {
      console.error(e);
    } finally {
      publisherRef.current = null;
      setIsPublishing(false);
    }
  };

  // If user stops camera, stop publishing automatically (prevents ghost sessions)
  useEffect(() => {
    if (!isCameraOn && isPublishing) {
      stopPublish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraOn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (publisherRef.current) publisherRef.current.close?.();
      } catch {}
      publisherRef.current = null;
    };
  }, []);

  const liveLabel = isPublishing ? "LIVE TO SRS" : isStreaming ? "CAMERA ON" : "READY";

  return (
    <div className="stream-output">
      <div className="section-header">
        <h2>Live Stream Preview</h2>

        <div className={`status-indicator ${isPublishing ? "live" : isStreaming ? "ready" : "ready"}`}>
          {liveLabel}
        </div>
      </div>

      <div className="stream-preview-container">
        <video ref={videoRef} className="video-preview" playsInline muted autoPlay />

        {!isCameraOn && !uploadedVideo?.url && !recordedVideo?.url && (
          <div className="stream-preview-placeholder">
            <i className="fas fa-satellite-dish"></i>
            <h3>Camera Preview</h3>
            <p>Click "Start Multistream" to turn on camera preview</p>
          </div>
        )}
      </div>

      {(error || pubError) && (
        <div className="error-message">
          <i className="fas fa-exclamation-triangle" style={{ marginRight: "8px" }}></i>
          {error || pubError}
        </div>
      )}

      <div className="stream-controls">
        {/* Camera toggle (existing behavior) */}
        <button
          className={`btn ${isStreaming ? "btn-danger" : "btn-primary"}`}
          onClick={handleStreamToggle}
          disabled={pubStatus === "connecting"}
        >
          <i className={`fas fa-${isStreaming ? "stop" : "play"}`}></i>
          {isStreaming ? "Stop Camera" : "Start Multistream"}
        </button>

        {/* Publish toggle (NEW) */}
        <button
          className={`btn ${isPublishing ? "btn-danger" : "btn-primary"}`}
          onClick={isPublishing ? stopPublish : startPublish}
          disabled={pubStatus === "connecting"}
          title={rtcUrl}
          style={{ marginLeft: 10 }}
        >
          <i className={`fas fa-${isPublishing ? "stop" : "broadcast-tower"}`}></i>
          {pubStatus === "connecting"
            ? "Connecting…"
            : isPublishing
            ? "Stop Live (SRS)"
            : "Go Live (SRS)"}
        </button>

        <button className="btn btn-secondary" onClick={handleOpenChannelModal} style={{ marginLeft: 10 }}>
          <i className="fas fa-plus"></i>
          Add channels
        </button>
      </div>

      {/* Quick status row */}
      <div className="hint-text" style={{ marginTop: 10 }}>
        <div>
          <strong>Ingest:</strong> <span style={{ opacity: 0.9 }}>{rtcUrl}</span>
        </div>
        <div style={{ opacity: 0.9 }}>
          {isPublishing
            ? `Publishing to SRS. Verify on VM: curl -s "http://127.0.0.1:1985/api/v1/streams/"`
            : `Turn on camera, then click "Go Live (SRS)" to publish.`}
        </div>
      </div>

      {/* Connected Channels Display (unchanged) */}
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
                    <i
                      className="fas fa-circle"
                      style={{ color: "#38ef7d", fontSize: "10px" }}
                    ></i>
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
        {isPublishing
          ? `Live publishing to SRS. If streams list is empty, check UDP 8000 + SRS candidate IP + browser console.`
          : isStreaming
          ? `Camera is ON. Click "Go Live (SRS)" to push to SRS WebRTC ingest.`
          : 'Camera preview will start when you click "Start Multistream". Make sure to allow camera and microphone permissions.'}
      </div>
    </div>
  );
}

export default StreamOutput;
