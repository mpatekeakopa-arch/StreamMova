import React, { useEffect, useState, useRef } from "react";
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
  downloadRecording,
  scheduleSession,
  cancelSchedule,
  // Note: startRecording and stopRecording are now handled internally
}) {
  const [activeModal, setActiveModal] = useState(null);
  const [recordingError, setRecordingError] = useState(null);
  const [isRecordingLocally, setIsRecordingLocally] = useState(false);
  const [localRecordedVideo, setLocalRecordedVideo] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  
  // Refs for recording
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const videoPreviewRef = useRef(null);

  const closeModal = () => {
    setActiveModal(null);
    setRecordingError(null);
    setShowPreview(false);
  };

  // ESC key to close
  useEffect(() => {
    const onKeyDown = (e) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Connect video preview when stream is available
  useEffect(() => {
    if (videoPreviewRef.current && mediaStreamRef.current) {
      videoPreviewRef.current.srcObject = mediaStreamRef.current;
    }
  }, [showPreview, isRecordingLocally]);

  const startRecordingDirectly = async () => {
    try {
      setRecordingError(null);
      recordedChunksRef.current = [];
      setShowPreview(true);

      // Request camera and microphone access with higher quality for preview
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        },
        audio: true
      });

      mediaStreamRef.current = stream;

      // Set up MediaRecorder
      const options = { mimeType: 'video/webm;codecs=vp9,opus' };
      let mediaRecorder;

      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (e) {
        // Fallback to vp8 if vp9 is not supported
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
      }

      mediaRecorderRef.current = mediaRecorder;

      // Handle data available event
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        // const url = URL.createObjectURL(blob);
        const filename = `recording-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.webm`;
        
        const videoFile = new File([blob], filename, { type: 'video/webm' });
        setLocalRecordedVideo(videoFile);
        setIsRecordingLocally(false);
        setShowPreview(false);
        
        // Stop all tracks
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }
      };

      // Start recording
      mediaRecorder.start(1000); // Collect data in 1-second chunks
      setIsRecordingLocally(true);
      
    } catch (error) {
      console.error("Failed to start recording:", error);
      
      let errorMessage = "Failed to access camera or microphone";
      
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        errorMessage = "Camera or microphone access was denied. Please grant permissions and try again.";
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        errorMessage = "No camera or microphone found on your device.";
      } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        errorMessage = "Your camera or microphone is already in use by another application.";
      } else if (error.name === "OverconstrainedError") {
        errorMessage = "Camera doesn't support the required settings.";
      }
      
      setRecordingError(errorMessage);
      setIsRecordingLocally(false);
      setShowPreview(false);
    }
  };

  const stopRecordingDirectly = () => {
    if (mediaRecorderRef.current && isRecordingLocally) {
      mediaRecorderRef.current.stop();
    }
  };

  const downloadLocalRecording = () => {
    if (localRecordedVideo) {
      const url = URL.createObjectURL(localRecordedVideo);
      const a = document.createElement('a');
      a.href = url;
      a.download = localRecordedVideo.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleStartRecording = async () => {
    await startRecordingDirectly();
    setActiveModal("record");
  };

  const handleStopRecording = () => {
    stopRecordingDirectly();
  };

  const handleUploadWithModal = (e) => {
    handleUploadSelected(e);
    setActiveModal("upload");
  };

  // Use either the prop recordedVideo or localRecordedVideo
  const currentRecordedVideo = recordedVideo || localRecordedVideo;
  const isCurrentlyRecording = isRecording || isRecordingLocally;

  return (
    <>
      <div className="side-actions-card">
        <div className="section-header">
          <h2>Quick Actions</h2>
          <div className="update-text">Upload • Record • Schedule</div>
        </div>

        <div className="qa-block">
          <button className="qa-button-full" onClick={() => setActiveModal("upload")}>
            <div className="qa-button-content">
              <i className="fas fa-upload"></i>
              <span>Upload Video</span>
            </div>
          </button>
        </div>

        <div className="qa-divider" />

        <div className="qa-block">
          <button className="qa-button-full" onClick={() => setActiveModal("record")}>
            <div className="qa-button-content">
              <i className="fas fa-dot-circle"></i>
              <span>Record Session</span>
            </div>
          </button>
        </div>

        <div className="qa-divider" />

        <div className="qa-block">
          <button className="qa-button-full" onClick={() => setActiveModal("schedule")}>
            <div className="qa-button-content">
              <i className="fas fa-calendar-alt"></i>
              <span>Schedule Session</span>
            </div>
          </button>
        </div>
      </div>

      {/* Upload Modal */}
      {activeModal === "upload" && (
        <div className="quick-actions-modal-overlay" onClick={closeModal}>
          <div className="quick-actions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-back" onClick={closeModal}>
                <i className="fas fa-arrow-left"></i> Back
              </button>
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
                    {uploadedVideo.type} • {(uploadedVideo.size / 1024 / 1024).toFixed(2)} MB
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
                    disabled={!connectedChannels.length}
                  >
                    <i className="fas fa-paper-plane" style={{ marginRight: 8 }}></i>
                    Send to channels
                  </button>
                </div>
              )}

              <div className="help-text" style={{ marginTop: 15 }}>
                Note: sending requires your backend (SRS/FFmpeg).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Modal */}
      {activeModal === "record" && (
        <div className="quick-actions-modal-overlay" onClick={closeModal}>
          <div className="quick-actions-modal record-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-back" onClick={closeModal}>
                <i className="fas fa-arrow-left"></i> Back
              </button>
              <h3>Record Session</h3>
              <button className="modal-close" onClick={closeModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="modal-content">
              {/* Video Preview Section */}
              {(showPreview || isCurrentlyRecording) && (
                <div className="video-preview-container" style={{
                  marginBottom: 20,
                  borderRadius: 8,
                  overflow: "hidden",
                  backgroundColor: "#0a0a0a",
                  position: "relative"
                }}>
                  <video
                    ref={videoPreviewRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: "100%",
                      height: "auto",
                      display: "block",
                      transform: "scaleX(-1)", // Mirror effect for more natural self-view
                    }}
                  />
                  {isCurrentlyRecording && (
                    <div style={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      background: "rgba(0,0,0,0.7)",
                      color: "white",
                      padding: "6px 12px",
                      borderRadius: 20,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 14,
                      backdropFilter: "blur(4px)"
                    }}>
                      <div style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: "#dc2626",
                        animation: "pulse 1.5s infinite"
                      }}></div>
                      <span>REC</span>
                      <span style={{ opacity: 0.8 }}>•</span>
                      <span style={{ opacity: 0.8 }}>Live preview</span>
                    </div>
                  )}
                </div>
              )}

              {/* Camera selection placeholder when no preview */}
              {!showPreview && !isCurrentlyRecording && !recordingError && (
                <div style={{
                  marginBottom: 20,
                  padding: 30,
                  backgroundColor: "#f5f5f5",
                  borderRadius: 8,
                  textAlign: "center",
                  color: "#666"
                }}>
                  <i className="fas fa-video" style={{ fontSize: 32, marginBottom: 10, opacity: 0.5 }}></i>
                  <p style={{ margin: 0 }}>Camera preview will appear here when recording starts</p>
                </div>
              )}

              <div className="qa-row">
                {!isCurrentlyRecording ? (
                  <button 
                    className="btn btn-primary qa-btn" 
                    onClick={handleStartRecording}
                  >
                    <i className="fas fa-circle" style={{ marginRight: 8 }}></i>
                    Start recording
                  </button>
                ) : (
                  <button 
                    className="btn btn-danger qa-btn" 
                    onClick={handleStopRecording}
                  >
                    <i className="fas fa-stop" style={{ marginRight: 8 }}></i>
                    Stop recording
                  </button>
                )}
              </div>

              {recordingError && (
                <div className="error-message" style={{ 
                  marginTop: 12, 
                  padding: 10, 
                  background: "rgba(220, 38, 38, 0.1)", 
                  borderRadius: 6,
                  color: "#dc2626",
                  fontSize: 14 
                }}>
                  <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }}></i>
                  {recordingError}
                </div>
              )}

              {isCurrentlyRecording && (
                <div className="recording-indicator" style={{ 
                  marginTop: 12, 
                  padding: 10, 
                  background: "rgba(239, 68, 68, 0.1)", 
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                }}>
                  <i className="fas fa-info-circle" style={{ color: "#dc2626" }}></i>
                  <span style={{ color: "#dc2626", fontWeight: 500 }}>Recording in progress. Click 'Stop recording' when finished.</span>
                </div>
              )}

              {currentRecordedVideo && !isCurrentlyRecording && (
                <div className="qa-meta">
                  <div className="qa-meta-line">
                    <strong>Recording ready:</strong> {currentRecordedVideo.name}
                  </div>
                  <div className="qa-meta-line" style={{ opacity: 0.75, fontSize: 12, marginBottom: 10 }}>
                    {(currentRecordedVideo.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                  <button className="btn btn-secondary qa-btn" onClick={downloadLocalRecording}>
                    <i className="fas fa-download" style={{ marginRight: 8 }}></i>
                    Save to device
                  </button>
                </div>
              )}

              <div className="help-text" style={{ marginTop: 15 }}>
                <i className="fas fa-info-circle" style={{ marginRight: 6 }}></i>
                Uses your browser's MediaRecorder. You can see yourself in the live preview while recording.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {activeModal === "schedule" && (
        <div className="quick-actions-modal-overlay" onClick={closeModal}>
          <div className="quick-actions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-back" onClick={closeModal}>
                <i className="fas fa-arrow-left"></i> Back
              </button>
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
                  onChange={(e) => setScheduleForm((p) => ({ ...p, title: e.target.value }))}
                  className="form-input"
                  placeholder="e.g., Product Launch Stream"
                />
              </div>

              <div className="form-group" style={{ marginTop: 8 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Start date & time</label>
                <input
                  type="datetime-local"
                  value={scheduleForm.startAtLocal}
                  onChange={(e) => setScheduleForm((p) => ({ ...p, startAtLocal: e.target.value }))}
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
                Notifications require permission. Falls back to alert if blocked.
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        
        .record-modal {
          max-width: 600px !important;
        }
        
        .video-preview-container video {
          aspect-ratio: 16/9;
          object-fit: cover;
        }
      `}</style>
    </>
  );
}

export default QuickActions;