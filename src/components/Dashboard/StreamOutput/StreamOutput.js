import React, { useEffect, useMemo, useRef, useState } from "react";
import "./StreamOutput.css";

/**
 * StreamOutput responsibilities:
 * 1) Preview cameraStream (from Dashboard) when camera is on.
 * 2) Publish to SRS via WebRTC using self-hosted SRS SDK: /vendor/srs/srs.sdk.js
 * 3) Keep old UI behavior for Start/Stop camera (handleStreamToggle).
 *
 * IMPORTANT:
 * - Because UI is HTTPS, SRS signaling must also be HTTPS (or browser will block mixed content).
 * - Long term target: webrtc://srs.streammova.xyz/live/test behind Caddy/Nginx HTTPS proxy.
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

  // NEW from Dashboard
  cameraStream,
  openCamera,
  closeCamera,

  // Optional override
  srsRtcBaseUrl, // e.g. "webrtc://srs.streammova.xyz/live" OR "webrtc://84.8.132.222/live"
  srsApp, // default "live"
  srsStream, // default "test"
}) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [pubStatus, setPubStatus] = useState("idle"); // idle | connecting | publishing | stopped | failed
  const [pubError, setPubError] = useState("");

  const publisherRef = useRef(null);
  const sdkReadyRef = useRef(false);
  const publishingGuardRef = useRef(false); // prevents double-click racing

  const rtcUrl = useMemo(() => {
    const base = srsRtcBaseUrl || "webrtc://84.8.132.222/live";
    const app = srsApp || "live";
    const stream = srsStream || "test";

    // If base already ends with /app, append /stream
    if (base.endsWith(`/${app}`)) return `${base}/${stream}`;

    // If base looks like webrtc://host/app already, append /stream
    // e.g. webrtc://host/live -> becomes webrtc://host/live/test
    const parts = base.replace(/^webrtc:\/\//, "").split("/");
    if (parts.length >= 2) return `${base.replace(/\/+$/, "")}/${stream}`;

    // Otherwise, treat as webrtc://host and append /app/stream
    return `${base.replace(/\/+$/, "")}/${app}/${stream}`;
  }, [srsRtcBaseUrl, srsApp, srsStream]);

  // -----------------------------
  // Load SRS SDK (self-hosted)
  // -----------------------------
  const loadSrsSdkOnce = async () => {
    if (sdkReadyRef.current) return true;
    if (window.SrsRtcPublisherAsync) {
      sdkReadyRef.current = true;
      return true;
    }

    // Prevent multiple injections
    const existing = document.querySelector('script[data-srs-sdk="1"]');
    if (existing) {
      const ok = await new Promise((resolve) => {
        existing.addEventListener("load", () => resolve(true), { once: true });
        existing.addEventListener("error", () => resolve(false), { once: true });
      });
      sdkReadyRef.current = ok && !!window.SrsRtcPublisherAsync;
      return sdkReadyRef.current;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.srsSdk = "1";
    script.src = "/vendor/srs/srs.sdk.js";

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

    // Detach camera preview when camera off OR no stream
    if (!isCameraOn || !cameraStream) {
      if (video.srcObject) video.srcObject = null;
      return;
    }

    // If uploaded/recorded preview is playing via video.src, clear it
    if (video.src) {
      try {
        video.pause();
      } catch {}
      video.removeAttribute("src");
      try {
        video.load();
      } catch {}
    }

    video.srcObject = cameraStream;

    (async () => {
      try {
        await video.play();
      } catch (e) {
        // autoplay might be blocked; not fatal
        console.warn("Preview play blocked:", e);
      }
    })();

    return () => {
      if (video && video.srcObject === cameraStream) {
        video.srcObject = null;
      }
    };
  }, [isCameraOn, cameraStream, videoRef]);

  // Mirror cameraStream into legacy streamRef for older recording logic
  useEffect(() => {
    if (!streamRef) return;
    if (cameraStream && streamRef.current !== cameraStream) streamRef.current = cameraStream;
    if (!cameraStream && streamRef.current) streamRef.current = null;
  }, [cameraStream, streamRef]);

  // -----------------------------
  // Stop publish helper
  // -----------------------------
  const stopPublish = async () => {
    setPubError("");
    setPubStatus("stopped");

    try {
      const pub = publisherRef.current;
      if (pub) {
        await pub.close?.();
      }
    } catch (e) {
      console.error("Stop publish error:", e);
    } finally {
      publisherRef.current = null;
      setIsPublishing(false);
      publishingGuardRef.current = false;
    }
  };

  // -----------------------------
  // Start publish
  // -----------------------------
  const startPublish = async () => {
    if (publishingGuardRef.current) return;
    publishingGuardRef.current = true;

    setPubError("");
    setPubStatus("connecting");
    setIsPublishing(true);

    try {
      // Ensure camera stream exists
      let s = cameraStream || streamRef?.current;
      if (!s) {
        if (openCamera) {
          s = await openCamera();
        }
      }
      if (!s) {
        setPubError('Camera stream not available. Click "Start Multistream" first.');
        setPubStatus("failed");
        setIsPublishing(false);
        publishingGuardRef.current = false;
        return;
      }

      const ok = await loadSrsSdkOnce();
      if (!ok) {
        setPubError('Failed to load SRS SDK. Verify "/vendor/srs/srs.sdk.js" is reachable.');
        setPubStatus("failed");
        setIsPublishing(false);
        publishingGuardRef.current = false;
        return;
      }

      // Close any existing publisher first
      if (publisherRef.current) {
        try {
          await publisherRef.current.close?.();
        } catch {}
        publisherRef.current = null;
      }

      const Publisher = window.SrsRtcPublisherAsync;
      if (!Publisher) {
        setPubError("SRS SDK loaded but SrsRtcPublisherAsync is missing.");
        setPubStatus("failed");
        setIsPublishing(false);
        publishingGuardRef.current = false;
        return;
      }

      const pub = new Publisher();

      // Try to publish using existing MediaStream if SDK supports it.
      // Different SDK builds differ; handle both gracefully.
      if (typeof pub.publish !== "function") {
        setPubError("SRS publisher object missing publish() method.");
        setPubStatus("failed");
        setIsPublishing(false);
        publishingGuardRef.current = false;
        return;
      }

      try {
        if (pub.publish.length >= 2) {
          await pub.publish(rtcUrl, s);
        } else {
          await pub.publish(rtcUrl);
        }
      } catch (e) {
        // Provide a useful hint for the very common next blocker:
        // HTTPS app cannot call HTTP signaling endpoints (mixed content).
        const msg = String(e?.message || e);
        const mixedHint =
          /mixed content|blocked|insecure|http:\/\//i.test(msg)
            ? "\n\nLikely cause: your app is HTTPS, but SRS signaling is not HTTPS. Use webrtc://srs.streammova.xyz/... behind HTTPS reverse proxy."
            : "";

        throw new Error(msg + mixedHint);
      }

      publisherRef.current = pub;
      setPubStatus("publishing");
      setIsPublishing(true);
      publishingGuardRef.current = false;
    } catch (e) {
      console.error("Publish error:", e);
      setPubError(String(e?.message || e));
      setPubStatus("failed");
      setIsPublishing(false);
      publishingGuardRef.current = false;

      try {
        if (publisherRef.current) await publisherRef.current.close?.();
      } catch {}
      publisherRef.current = null;
    }
  };

  // If user stops camera, stop publishing automatically
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
  const isBusy = pubStatus === "connecting";

  return (
    <div className="stream-output">
      <div className="section-header">
        <h2>Live Stream Preview</h2>

        <div className={`status-indicator ${isPublishing ? "live" : "ready"}`}>
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
        {/* Camera toggle */}
        <button
          className={`btn ${isStreaming ? "btn-danger" : "btn-primary"}`}
          onClick={handleStreamToggle}
          disabled={isBusy}
        >
          <i className={`fas fa-${isStreaming ? "stop" : "play"}`}></i>
          {isStreaming ? "Stop Camera" : "Start Multistream"}
        </button>

        {/* Publish toggle */}
        <button
          className={`btn ${isPublishing ? "btn-danger" : "btn-primary"}`}
          onClick={isPublishing ? stopPublish : startPublish}
          disabled={isBusy}
          title={rtcUrl}
          style={{ marginLeft: 10 }}
        >
          <i className={`fas fa-${isPublishing ? "stop" : "broadcast-tower"}`}></i>
          {isBusy ? "Connecting…" : isPublishing ? "Stop Live (SRS)" : "Go Live (SRS)"}
        </button>

        <button
          className="btn btn-secondary"
          onClick={handleOpenChannelModal}
          style={{ marginLeft: 10 }}
        >
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
                    <img src={channel.logo} alt={`${channel.name} logo`} className="channel-logo" />
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
