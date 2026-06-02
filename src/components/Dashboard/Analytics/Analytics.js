import React from "react";
import "./Analytics.css";

function Analytics({
  connectedChannels,
  isStreaming,
  isCameraOn,
  isRecording,
  uploadedVideo,
  recordedVideo,
  scheduleStatus,
}) {
  const liveChannels = connectedChannels.filter(
    (channel) => channel.status === "live"
  );
  const nextScheduledStream =
    scheduleStatus?.active && scheduleStatus.startAtMs
      ? new Date(scheduleStatus.startAtMs).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "None";

  const analytics = [
    {
      id: 1,
      title: "Connected Destinations",
      value: connectedChannels.length,
      icon: "fas fa-satellite-dish",
      color: "linear-gradient(135deg, #6a11cb, #2575fc)",
    },
    {
      id: 2,
      title: "Live Destinations",
      value: liveChannels.length,
      icon: "fas fa-broadcast-tower",
      color: "linear-gradient(135deg, #FF416C, #FF4B2B)",
    },
    {
      id: 3,
      title: "Studio Status",
      value: isStreaming
        ? "Live"
        : isRecording
        ? "Recording"
        : isCameraOn
        ? "Camera Ready"
        : "Offline",
      icon: "fas fa-video",
      color: "linear-gradient(135deg, #11998e, #38ef7d)",
    },
    {
      id: 4,
      title: "Next Scheduled Stream",
      value: nextScheduledStream,
      icon: "fas fa-calendar-check",
      color: "linear-gradient(135deg, #f46b45, #eea849)",
    },
    {
      id: 5,
      title: "Prepared Media",
      value: uploadedVideo
        ? "Uploaded"
        : recordedVideo
        ? "Recorded"
        : "None",
      icon: "fas fa-photo-video",
      color: "linear-gradient(135deg, #00c6ff, #0072ff)",
    },
  ];

  return (
    <div className="analytics-section">
      <div className="section-header">
        <h2>Stream Analytics</h2>
        <div className="update-text">Updated from your workspace</div>
      </div>

      <div className="analytics-cards">
        {analytics.map((stat) => (
          <div className="analytics-card" key={stat.id}>
            <div className="analytics-icon" style={{ background: stat.color }}>
              <i className={stat.icon}></i>
            </div>
            <div className="analytics-content">
              <h3>{stat.value}</h3>
              <p>{stat.title}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Analytics;