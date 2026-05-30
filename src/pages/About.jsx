import React from "react";
import "./about.css";

function About() {
  return (
    <div className="about-page">
      <div className="about-container">
        <header className="about-header">
          <h1>About StreamMova</h1>
          <p>
            StreamMova is a multi-streaming platform designed to help users go
            live on multiple platforms from one simple dashboard.
          </p>
        </header>

        <section className="about-section">
          <h2>What is StreamMova?</h2>
          <p>
            StreamMova allows users to manage and broadcast live streams to
            supported platforms such as Facebook, YouTube, Twitch, and other
            streaming services. The platform is built to simplify the streaming
            process by bringing stream setup, platform connection, and live
            session control into one place.
          </p>
        </section>

        <section className="about-section highlight-box">
          <h2>Our Purpose</h2>
          <p>
            Our goal is to make live streaming easier, faster, and more
            accessible for businesses, organizations, educators, churches,
            event hosts, and online communities that want to reach audiences
            across different platforms at the same time.
          </p>
        </section>

        <section className="features-grid">
          <div className="feature-card">
            <h3>Multi-Streaming</h3>
            <p>
              Broadcast to several platforms from one StreamMova session.
            </p>
          </div>

          <div className="feature-card">
            <h3>Platform Integration</h3>
            <p>
              Connect supported services such as Facebook Live, YouTube, and
              Twitch.
            </p>
          </div>

          <div className="feature-card">
            <h3>Simple Dashboard</h3>
            <p>
              Manage streams, destinations, and live status from a clean
              interface.
            </p>
          </div>

          <div className="feature-card">
            <h3>Built for Growth</h3>
            <p>
              Designed to support future tools such as subscriptions, analytics,
              and team-based streaming.
            </p>
          </div>
        </section>

        <section className="about-section">
          <h2>Powered by Newles Technologies</h2>
          <p>
            StreamMova is a product of Newles Technologies (Pty) Ltd, a
            technology company based in Maseru, Kingdom of Lesotho. The platform
            reflects our commitment to building practical digital solutions for
            modern communication, online broadcasting, and content delivery.
          </p>
        </section>

        <footer className="about-footer">
          <p>© 2026 StreamMova. A product of Newles Technologies.</p>
        </footer>
      </div>
    </div>
  );
}

export default About;