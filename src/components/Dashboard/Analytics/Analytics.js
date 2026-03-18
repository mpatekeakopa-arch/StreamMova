import React from "react";
import "./Analytics.css";

function Analytics({ connectedChannels }) {
  const analytics = [
    {
      id: 1,
      title: "Total Viewers",
      value: "5,470",
      icon: "fas fa-users",
      color: "linear-gradient(135deg, #6a11cb, #2575fc)",
    },
    {
      id: 2,
      title: "Stream Uptime",
      value: "3h 42m",
      icon: "fas fa-clock",
      color: "linear-gradient(135deg, #FF416C, #FF4B2B)",
    },
    {
      id: 3,
      title: "Avg. Bitrate",
      value: "6,500 kbps",
      icon: "fas fa-tachometer-alt",
      color: "linear-gradient(135deg, #11998e, #38ef7d)",
    },
    {
      id: 4,
      title: "Platforms",
      value: `${connectedChannels.length} Connected`,
      icon: "fas fa-satellite-dish",
      color: "linear-gradient(135deg, #f46b45, #eea849)",
    },
  ];

  return (
    <div className="analytics-section">
      <div className="section-header">
        <h2>Stream Analytics</h2>
        <div className="update-text">Updated in real-time</div>
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