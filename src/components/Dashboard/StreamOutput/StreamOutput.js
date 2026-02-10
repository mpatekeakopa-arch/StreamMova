import React, { useEffect } from "react";
import "./StreamOutput.css";

function StreamOutput({
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
}) {
  // Attach stream to the <video> element whenever camera turns on/off
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video) return;

    if (!isCameraOn || !stream) {
      video.srcObject = null;
      return;
    }

    video.srcObject = stream;

    const tryPlay = async () => {
      try {
        await video.play();
      } catch (e) {
        console.error("Video play failed:", e);
      }
    };

    tryPlay();
    return () => {
      if (video) video.srcObject = null;
    };
  }, [isCameraOn, videoRef, streamRef]);

  return (
    <div className="stream-output">
      <div className="section-header">
        <h2>Live Stream Preview</h2>
        <div className={`status-indicator ${isStreaming ? "live" : "ready"}`}>
          {isStreaming ? "LIVE NOW" : "READY TO STREAM"}
        </div>
      </div>

      <div className="stream-preview-container">
        <video ref={videoRef} className="video-preview" playsInline muted autoPlay />

        {!isCameraOn && !uploadedVideo?.url && !recordedVideo?.url && (
          <div className="stream-preview-placeholder">
            <i className="fas fa-satellite-dish"></i>
            <h3>Camera Preview</h3>
            <p>Click "Start Multistream" to begin broadcasting</p>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          <i className="fas fa-exclamation-triangle" style={{ marginRight: "8px" }}></i>
          {error}
        </div>
      )}

      <div className="stream-controls">
        <button
          className={`btn ${isStreaming ? "btn-danger" : "btn-primary"}`}
          onClick={handleStreamToggle}
        >
          <i className={`fas fa-${isStreaming ? "stop" : "play"}`}></i>
          {isStreaming ? "Stop Streaming" : "Start Multistream"}
        </button>

        <button className="btn btn-secondary" onClick={handleOpenChannelModal}>
          <i className="fas fa-plus"></i>
          Add channels
        </button>
      </div>

      {/* Connected Channels Display */}
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
        {isStreaming
          ? `Live streaming to ${connectedChannels.length} connected platforms. Click "Stop Streaming" to end broadcast.`
          : 'Camera preview will start when you click "Start Multistream". Make sure to allow camera and microphone permissions.'}
      </div>
    </div>
  );
}

export default StreamOutput;