import React, { useEffect, useRef, useState } from "react";
import "./Dashboard.css";

function Dashboard() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState("");

  const startCamera = async () => {
    try {
      setError("");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: "user",
        },
        audio: true,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraOn(true);
    } catch (err) {
      console.error(err);
      setError(
        "Unable to access camera or microphone. Please allow permissions."
      );
      setIsCameraOn(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraOn(false);
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-brand">
          <h1 className="dash-title">StreamMova</h1>
          <span className="dash-tagline">Camera Preview</span>
        </div>
      </header>

      <main className="dash-main">
        <section className="card preview-card">
          <div className="card-head">
            <h2>Camera Preview</h2>
            <span className="pill">
              {isCameraOn ? "Camera On" : "Camera Off"}
            </span>
          </div>

          <div className="video-shell">
            <video
              ref={videoRef}
              className="video-preview"
              playsInline
              muted
              autoPlay
            />

            {!isCameraOn && (
              <div className="video-overlay">
                <div className="overlay-title">Camera Disabled</div>
                <div className="overlay-sub">
                  Click “Start Camera” to enable preview.
                </div>
              </div>
            )}
          </div>

          {error && <div className="inline-error">{error}</div>}

          <div className="preview-actions">
            {!isCameraOn ? (
              <button className="btn-primary" onClick={startCamera}>
                Start Camera
              </button>
            ) : (
              <button className="btn-ghost" onClick={stopCamera}>
                Stop Camera
              </button>
            )}
          </div>

          <div className="hint">
            Camera preview runs locally in your browser. Streaming will be added
            later.
          </div>
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
