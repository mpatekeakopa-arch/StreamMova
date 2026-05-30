import React from "react";
import "./features.css";

function Features() {
  return (
    <div className="features-page">
      <div className="features-container">
        <header className="features-header">
          <h1>StreamMova Features</h1>
          <p>
            StreamMova gives users the tools they need to prepare, manage, and
            broadcast live streams across multiple platforms from one place.
          </p>
        </header>

        <section className="features-grid">
          <div className="feature-card">
            <h2>Multi-Platform Streaming</h2>
            <p>
              Go live on Facebook, YouTube, Twitch, and other supported
              platforms from a single StreamMova session.
            </p>
          </div>

          <div className="feature-card">
            <h2>Facebook Live Integration</h2>
            <p>
              Connect Facebook Pages, manage permissions, and start Facebook
              Live sessions directly from StreamMova.
            </p>
          </div>

          <div className="feature-card">
            <h2>Stream Together</h2>
            <p>
              Invite co-hosts to join a live session using a shared link,
              making collaborative streaming easier.
            </p>
          </div>

          <div className="feature-card">
            <h2>Live Stream Control</h2>
            <p>
              Start, monitor, and stop live streams from a simple dashboard
              without switching between multiple platforms.
            </p>
          </div>

          <div className="feature-card">
            <h2>Secure Platform Connection</h2>
            <p>
              Use OAuth-based platform connections so users can connect services
              safely without exposing sensitive credentials.
            </p>
          </div>

          <div className="feature-card">
            <h2>Dashboard Management</h2>
            <p>
              Manage stream destinations, connected accounts, stream status,
              and session settings in one clean interface.
            </p>
          </div>

          <div className="feature-card">
            <h2>Future Analytics</h2>
            <p>
              Designed to support future reporting tools for stream views,
              engagement, platform performance, and audience activity.
            </p>
          </div>

          <div className="feature-card">
            <h2>Scalable Streaming Setup</h2>
            <p>
              Built with a streaming architecture that supports growth,
              reliability, and expansion to more platforms.
            </p>
          </div>
        </section>

        <section className="features-highlight">
          <h2>Built for Modern Live Broadcasting</h2>
          <p>
            StreamMova is designed for users who want a simpler way to broadcast
            to multiple audiences. Instead of managing every platform
            separately, users can control their live streaming workflow from one
            central system.
          </p>
        </section>

        <footer className="features-footer">
          <p>© 2026 StreamMova. A product of Newles Technologies.</p>
        </footer>
      </div>
    </div>
  );
}

export default Features;