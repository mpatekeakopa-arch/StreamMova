import React, { useEffect, useMemo, useRef, useState } from "react";
import "./StreamOutput.css";

function StreamOutput({
  isStreaming,
  isCameraOn,
  error,
  uploadedVideo,
  recordedVideo,
  videoRef,
  streamRef,
  connectedChannels = [],
  handleStreamToggle,
  handleOpenChannelModal,
  handleRemoveChannel,

  cameraStream,
  openCamera,

  facebookPages = [],
  selectedFacebookPageId = "",
  setSelectedFacebookPageId = () => {},
  facebookConnectStatus = "",

  twitchConnected = false,
  twitchUsername = "",

  youtubeConnected = false,
  youtubeChannelName = "",

  srsRtcBaseUrl,
  srsApp,
  srsStream,
}) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [pubStatus, setPubStatus] = useState("idle");
  const [pubError, setPubError] = useState("");

  const publisherRef = useRef(null);
  const sdkReadyRef = useRef(false);
  const publishingGuardRef = useRef(false);

  const safeFacebookPages = Array.isArray(facebookPages) ? facebookPages : [];

  const rtcUrl = useMemo(() => {
    const base = srsRtcBaseUrl || "webrtc://srs.streammova.xyz/live";
    const app = srsApp || "live";
    const stream = srsStream || "test";

    if (base.endsWith(`/${app}`)) return `${base}/${stream}`;

    const parts = base.replace(/^webrtc:\/\//, "").split("/");
    if (parts.length >= 2) return `${base.replace(/\/+$/, "")}/${stream}`;

    return `${base.replace(/\/+$/, "")}/${app}/${stream}`;
  }, [srsRtcBaseUrl, srsApp, srsStream]);

  const shouldMirrorPreview = isCameraOn && !!cameraStream;

  const loadSrsSdkOnce = async () => {
    if (sdkReadyRef.current) return true;

    if (window.SrsRtcPublisherAsync) {
      sdkReadyRef.current = true;
      return true;
    }

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

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    if (!isCameraOn || !cameraStream) {
      if (video.srcObject) video.srcObject = null;
      return;
    }

    try {
      video.pause();
    } catch {}

    video.removeAttribute("src");
    video.srcObject = null;

    try {
      video.load();
    } catch {}

    video.srcObject = cameraStream;
    video.muted = true;
    video.playsInline = true;

    video.play().catch((e) => {
      console.warn("Preview play blocked:", e);
    });

    return () => {
      if (video && video.srcObject === cameraStream) {
        video.srcObject = null;
      }
    };
  }, [isCameraOn, cameraStream, videoRef]);

  useEffect(() => {
    if (!streamRef) return;

    if (cameraStream && streamRef.current !== cameraStream) {
      streamRef.current = cameraStream;
    }

    if (!cameraStream && streamRef.current) {
      streamRef.current = null;
    }
  }, [cameraStream, streamRef]);

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

  const startPublish = async () => {
    if (publishingGuardRef.current) return;

    publishingGuardRef.current = true;
    setPubError("");
    setPubStatus("connecting");
    setIsPublishing(true);

    try {
      let stream = cameraStream || streamRef?.current;

      if (!stream && openCamera) {
        stream = await openCamera();
      }

      if (!stream) {
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

      if (typeof pub.publish !== "function") {
        setPubError("SRS publisher object missing publish() method.");
        setPubStatus("failed");
        setIsPublishing(false);
        publishingGuardRef.current = false;
        return;
      }

      try {
        if (pub.publish.length >= 2) {
          await pub.publish(rtcUrl, stream);
        } else {
          await pub.publish(rtcUrl);
        }
      } catch (e) {
        const msg = String(e?.message || e);
        const mixedHint =
          /mixed content|blocked|insecure|http:\/\//i.test(msg)
            ? "\n\nLikely cause: your app is HTTPS, but SRS signaling is not HTTPS."
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

  useEffect(() => {
    if (!isCameraOn && isPublishing) {
      stopPublish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraOn]);

  useEffect(() => {
    return () => {
      try {
        if (publisherRef.current) publisherRef.current.close?.();
      } catch {}

      publisherRef.current = null;
    };
  }, []);

  const liveLabel = isPublishing
    ? "LIVE TO SRS"
    : isStreaming
    ? "CAMERA ON"
    : "READY";

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
        <video
          ref={videoRef}
          className="video-preview"
          playsInline
          muted
          autoPlay
          style={{
            transform: shouldMirrorPreview ? "scaleX(-1)" : "none",
          }}
        />

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
          <i
            className="fas fa-exclamation-triangle"
            style={{ marginRight: "8px" }}
          ></i>
          {error || pubError}
        </div>
      )}

      <div className="stream-controls">
        {safeFacebookPages.length > 0 && (
          <div className="facebook-controls">
            {facebookConnectStatus && (
              <div className="facebook-status">✅ {facebookConnectStatus}</div>
            )}

            <div className="facebook-page-picker">
              <label htmlFor="facebook-page-select">Select Facebook Page</label>

              <select
                id="facebook-page-select"
                className="facebook-page-select"
                value={selectedFacebookPageId}
                onChange={(e) => setSelectedFacebookPageId(e.target.value)}
              >
                {safeFacebookPages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>

              <p className="facebook-page-note">
                StreamMova will publish only to the selected Facebook Page.
              </p>
            </div>
          </div>
        )}

        <div className="streaming-controls">
          <button
            className={`btn ${isStreaming ? "btn-danger" : "btn-primary"}`}
            onClick={handleStreamToggle}
            disabled={isBusy}
          >
            <i className={`fas fa-${isStreaming ? "stop" : "play"}`}></i>
            {isStreaming ? "Stop Camera" : "Start Multistream"}
          </button>

          <button
            className={`btn ${isPublishing ? "btn-danger" : "btn-primary"}`}
            onClick={isPublishing ? stopPublish : startPublish}
            disabled={isBusy}
            title={rtcUrl}
          >
            <i
              className={`fas fa-${isPublishing ? "stop" : "broadcast-tower"}`}
            ></i>
            {isBusy
              ? "Connecting…"
              : isPublishing
              ? "Stop Live (SRS)"
              : "Go Live (SRS)"}
          </button>

          <button className="btn btn-secondary" onClick={handleOpenChannelModal}>
            <i className="fas fa-plus"></i>
            Add channels
          </button>
        </div>
      </div>

      <div className="hint-text" style={{ marginTop: 10 }}>
        <div>
          <strong>Ingest:</strong>{" "}
          <span style={{ opacity: 0.9 }}>{rtcUrl}</span>
        </div>
        <div style={{ opacity: 0.9 }}>
          {isPublishing
            ? `Publishing to SRS. Verify on VM: curl -s "http://127.0.0.1:1985/api/v1/streams/"`
            : `Turn on camera, then click "Go Live (SRS)" to publish.`}
        </div>
      </div>

      {connectedChannels.length > 0 && (
        <div className="connected-channels">
          <h4>Connected Channels ({connectedChannels.length})</h4>

          <div className="channels-list">
            {connectedChannels.map((channel) => (
              <div key={channel.id} className="channel-item">
                <div className="channel-info">
                  <span className="channel-platform-icon">
                    {channel.logo ? (
                      <img
                        src={channel.logo}
                        alt={`${channel.name} logo`}
                        className="channel-logo"
                      />
                    ) : (
                      <i className={channel.icon}></i>
                    )}
                  </span>

                  <span className="channel-name">{channel.name}</span>

                  {channel.displayName && (
                    <span className="channel-display-name">
                      ({channel.displayName})
                    </span>
                  )}

                  {channel.pageName && (
                    <span className="channel-page-name">
                      ({channel.pageName})
                    </span>
                  )}
                </div>

                <div className="channel-actions">
                  <span className="channel-status">
                    <i
                      className="fas fa-circle"
                      style={{ color: "#38ef7d", fontSize: "10px" }}
                    ></i>
                    {channel.status === "live" ? "LIVE" : "Connected"}
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
          : `Camera preview will start when you click "Start Multistream". Make sure to allow camera and microphone permissions.`}
      </div>
    </div>
  );
}

export default StreamOutput;