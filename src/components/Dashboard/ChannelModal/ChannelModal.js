import React from "react";
import "./ChannelModal.css";

function ChannelModal({
  showChannelModal,
  modalRef,
  handleCloseChannelModal,

  handleFacebookOAuth,
  handleTwitchOAuth,
  handleYouTubeOAuth,

  facebookConnectStatus,
  twitchConnected,
  twitchUsername,
  youtubeConnected,
  youtubeChannelName,
}) {
  if (!showChannelModal) return null;

  return (
    <div className="modal-overlay">
      <div className="channel-modal" ref={modalRef}>
        <div className="modal-header">
          <h3>Add Streaming Channel</h3>

          <button className="modal-close" onClick={handleCloseChannelModal}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Connect a streaming platform</label>

            <div className="oauth-channel-buttons">
              <button
                type="button"
                className="oauth-channel-btn facebook"
                onClick={handleFacebookOAuth}
              >
                <i className="fab fa-facebook"></i>
                Connect Facebook
              </button>

              <button
                type="button"
                className="oauth-channel-btn twitch"
                onClick={handleTwitchOAuth}
              >
                <i className="fab fa-twitch"></i>
                {twitchConnected && twitchUsername
                  ? `Twitch Connected: ${twitchUsername}`
                  : "Connect Twitch"}
              </button>

              <button
                type="button"
                className="oauth-channel-btn youtube"
                onClick={handleYouTubeOAuth}
              >
                <i className="fab fa-youtube"></i>
                {youtubeConnected && youtubeChannelName
                  ? `YouTube Connected: ${youtubeChannelName}`
                  : "Connect YouTube"}
              </button>
            </div>

            {facebookConnectStatus && (
              <small className="help-text">{facebookConnectStatus}</small>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleCloseChannelModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChannelModal;