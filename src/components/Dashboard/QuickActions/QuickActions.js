import React, { useState } from "react";
import "./QuickActions.css";

function QuickActions({
  uploadInputRef,
  uploadedVideo,
  uploadTitle,
  setUploadTitle,
  isRecording,
  recordedVideo,
  scheduleForm,
  setScheduleForm,
  scheduleStatus,
  connectedChannels,
  openUploadPicker,
  handleUploadSelected,
  handleSendUploadedToChannels,
  startRecording,
  stopRecording,
  downloadRecording,
  scheduleSession,
  cancelSchedule,
}) {
  const [activeModal, setActiveModal] = useState(null); // 'upload', 'record', 'schedule'

  const openModal = (modalType) => {
    setActiveModal(modalType);
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  // Handle recording start with modal
  const handleStartRecording = () => {
    startRecording();
    openModal('record');
  };

  // Handle upload selected with modal
  const handleUploadWithModal = (e) => {
    handleUploadSelected(e);
    openModal('upload');
  };

  return (
    <>
      <div className="side-actions-card">
        <div className="section-header">
          <h2>Quick Actions</h2>
          <div className="update-text">Upload • Record • Schedule</div>
        </div>

        {/* Upload Video Button */}
        <div className="qa-block">
          <button 
            className="qa-button-full" 
            onClick={() => openModal('upload')}
          >
            <div className="qa-button-content">
              <i className="fas fa-upload"></i>
              <span>Upload Video</span>
            </div>
          </button>
        </div>

        <div className="qa-divider" />

        {/* Record Session Button */}
        <div className="qa-block">
          <button 
            className="qa-button-full" 
            onClick={() => openModal('record')}
          >
            <div className="qa-button-content">
              <i className="fas fa-dot-circle"></i>
              <span>Record Session</span>
            </div>
          </button>
        </div>

        <div className="qa-divider" />

        {/* Schedule Session Button */}
        <div className="qa-block">
          <button 
            className="qa-button-full" 
            onClick={() => openModal('schedule')}
          >
            <div className="qa-button-content">
              <i className="fas fa-calendar-alt"></i>
              <span>Schedule Session</span>
            </div>
          </button>
        </div>
      </div>

      {/* Upload Video Modal */}
      {activeModal === 'upload' && (
        <div className="quick-actions-modal-overlay" onClick={closeModal}>
          <div className="quick-actions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Upload Video</h3>
              <button className="modal-close" onClick={closeModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="modal-content">
              <input
                ref={uploadInputRef}
                type="file"
                accept="video/*"
                onChange={handleUploadWithModal}
                style={{ display: "none" }}
              />

              <button className="btn btn-secondary qa-btn" onClick={openUploadPicker}>
                Choose video file
              </button>

              {uploadedVideo && (
                <div className="qa-meta">
                  <div className="qa-meta-line">
                    <strong>{uploadedVideo.name}</strong>
                  </div>
                  <div className="qa-meta-line" style={{ opacity: 0.75, fontSize: 12 }}>
                    {uploadedVideo.type} • {(uploadedVideo.size / (1024 * 1024)).toFixed(2)} MB
                  </div>

                  <div className="form-group" style={{ marginTop: 10 }}>
                    <label style={{ fontSize: 12, opacity: 0.8 }}>Title (optional)</label>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      className="form-input"
                      placeholder="Title for uploaded restream"
                    />
                  </div>

                  <button
                    className="btn btn-primary qa-btn"
                    onClick={handleSendUploadedToChannels}
                    disabled={connectedChannels.length === 0}
                    title={
                      connectedChannels.length === 0
                        ? "Connect at least one channel first"
                        : "Send via backend restream"
                    }
                  >
                    <i className="fas fa-paper-plane" style={{ marginRight: 8 }}></i>
                    Send to channels
                  </button>
                </div>
              )}

              <div className="help-text" style={{ marginTop: 15 }}>
                Note: sending a file to RTMP platforms requires your backend (SRS/FFmpeg).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Session Modal */}
      {activeModal === 'record' && (
        <div className="quick-actions-modal-overlay" onClick={closeModal}>
          <div className="quick-actions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Record Session</h3>
              <button className="modal-close" onClick={closeModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="modal-content">
              <div className="qa-row">
                {!isRecording ? (
                  <button className="btn btn-primary qa-btn" onClick={handleStartRecording}>
                    <i className="fas fa-circle" style={{ marginRight: 8 }}></i>
                    Start recording
                  </button>
                ) : (
                  <button className="btn btn-danger qa-btn" onClick={stopRecording}>
                    <i className="fas fa-stop" style={{ marginRight: 8 }}></i>
                    Stop recording
                  </button>
                )}
              </div>

              {recordedVideo && (
                <div className="qa-meta">
                  <div className="qa-meta-line">
                    <strong>Recording ready:</strong> {recordedVideo.name}
                  </div>
                  <button className="btn btn-secondary qa-btn" onClick={downloadRecording}>
                    <i className="fas fa-download" style={{ marginRight: 8 }}></i>
                    Save to device
                  </button>
                </div>
              )}

              <div className="help-text" style={{ marginTop: 15 }}>
                Recording uses your browser (MediaRecorder). Best in Chrome/Edge.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Session Modal */}
      {activeModal === 'schedule' && (
        <div className="quick-actions-modal-overlay" onClick={closeModal}>
          <div className="quick-actions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Schedule Session</h3>
              <button className="modal-close" onClick={closeModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="modal-content">
              <div className="form-group" style={{ marginTop: 8 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Session title (optional)</label>
                <input
                  type="text"
                  value={scheduleForm.title}
                  onChange={(e) =>
                    setScheduleForm((p) => ({
                      ...p,
                      title: e.target.value,
                    }))
                  }
                  className="form-input"
                  placeholder="e.g., Product Launch Stream"
                />
              </div>

              <div className="form-group" style={{ marginTop: 8 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Start date & time</label>
                <input
                  type="datetime-local"
                  value={scheduleForm.startAtLocal}
                  onChange={(e) =>
                    setScheduleForm((p) => ({
                      ...p,
                      startAtLocal: e.target.value,
                    }))
                  }
                  className="form-input"
                />
              </div>

              <div className="qa-row">
                <button className="btn btn-primary qa-btn" onClick={scheduleSession}>
                  <i className="fas fa-bell" style={{ marginRight: 8 }}></i>
                  Schedule & notify
                </button>

                {scheduleStatus.active && (
                  <button className="btn btn-secondary qa-btn" onClick={cancelSchedule}>
                    Cancel
                  </button>
                )}
              </div>

              {scheduleStatus.message && (
                <div className="qa-meta" style={{ marginTop: 8 }}>
                  {scheduleStatus.message}
                </div>
              )}

              <div className="help-text" style={{ marginTop: 15 }}>
                Notifications require permission. If blocked, we fallback to an alert.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default QuickActions;