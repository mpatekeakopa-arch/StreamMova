import React from "react";
import "./ChannelModal.css";

function ChannelModal({
  showChannelModal,
  channelForm,
  availablePlatforms,
  modalRef,
  handleCloseChannelModal,
  handlePlatformSelect,
  handleInputChange,
  handleTestConnection,
}) {
  if (!showChannelModal) return null;

  const selectedPlatform = channelForm.platform
    ? availablePlatforms.find((p) => p.id === channelForm.platform)
    : null;

  return (
    <div className="modal-overlay">
      <div className="channel-modal" ref={modalRef}>
        <div className="modal-header">
          <h3>
            Add Streaming Channel{" "}
            {selectedPlatform && (
              <span style={{ marginLeft: 10, fontSize: 14, opacity: 0.8 }}>
                <img
                  src={selectedPlatform.logo}
                  alt={`${selectedPlatform.name} logo`}
                  className="platform-logo-inline"
                />
                {selectedPlatform.name}
              </span>
            )}
          </h3>
          <button className="modal-close" onClick={handleCloseChannelModal}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Select Platform</label>
            <div className="platform-grid">
              {availablePlatforms.map((platform) => (
                <button
                  key={platform.id}
                  type="button"
                  className={`platform-option ${
                    channelForm.platform === platform.id ? "selected" : ""
                  }`}
                  onClick={() => handlePlatformSelect(platform.id)}
                >
                  <img
                    src={platform.logo}
                    alt={`${platform.name} logo`}
                    className="platform-logo"
                  />
                  <span>{platform.name}</span>
                </button>
              ))}
            </div>
          </div>

          {channelForm.platform && (
            <>
              <div className="form-group">
                <label>Stream Title (Optional)</label>
                <input
                  type="text"
                  name="title"
                  placeholder={`Enter stream title for ${selectedPlatform?.name}`}
                  value={channelForm.title}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Stream Key / RTMP URL</label>
                <input
                  type="password"
                  name="streamKey"
                  placeholder="Paste your stream key or RTMP URL"
                  value={channelForm.streamKey}
                  onChange={handleInputChange}
                  className="form-input"
                />
                <small className="help-text">
                  Find this in your {selectedPlatform?.name} streaming settings
                </small>
              </div>

              <div className="connection-test">
                <button
                  type="button"
                  className="test-btn"
                  onClick={handleTestConnection}
                  disabled={
                    channelForm.testStatus === "testing" ||
                    !channelForm.platform ||
                    !channelForm.streamKey
                  }
                >
                  <i className="fas fa-plug"></i>
                  {channelForm.testStatus === "testing" ? "Testing..." : "Test Connection"}
                </button>

                <span className="test-status">
                  {channelForm.testStatus === "idle" && (
                    <>
                      <i className="fas fa-circle" style={{ color: "#ccc", fontSize: "10px" }}></i>{" "}
                      Not tested
                    </>
                  )}

                  {channelForm.testStatus === "testing" && (
                    <>
                      <i
                        className="fas fa-circle"
                        style={{ color: "#f1c40f", fontSize: "10px" }}
                      ></i>{" "}
                      Testing…
                    </>
                  )}

                  {channelForm.testStatus === "connected" && (
                    <>
                      <i
                        className="fas fa-circle"
                        style={{ color: "#38ef7d", fontSize: "10px" }}
                      ></i>{" "}
                      Connected
                    </>
                  )}

                  {channelForm.testStatus === "failed" && (
                    <>
                      <i
                        className="fas fa-circle"
                        style={{ color: "#FF416C", fontSize: "10px" }}
                      ></i>{" "}
                      Failed
                    </>
                  )}
                </span>
              </div>

              {channelForm.testMessage && (
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
                  {channelForm.testMessage}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleCloseChannelModal}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleTestConnection}
            disabled={
              channelForm.testStatus === "testing" ||
              !channelForm.platform ||
              !channelForm.streamKey
            }
          >
            <i className="fas fa-plug"></i>
            {channelForm.testStatus === "testing" ? "Testing..." : "Test & Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChannelModal;