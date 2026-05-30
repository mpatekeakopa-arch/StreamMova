import React from "react";
import "./contacts.css";

function Contacts() {
  return (
    <div className="contact-page">
      <div className="contact-container">
        <header className="contact-header">
          <h1>How can we help?</h1>
          <p>
            Find the right StreamMova support channel for your question.
          </p>
        </header>

        <div className="support-grid">
          <div className="support-card">
            <h2>General Support</h2>
            <p>
              Need help using StreamMova, connecting platforms, or managing your
              live streams?
            </p>
            <a href="mailto:sales@newlestech.co.ls">
              Contact Support
            </a>
          </div>

          <div className="support-card">
            <h2>Facebook Live Help</h2>
            <p>
              Get assistance with Facebook Page connection, permissions, and
              live stream setup.
            </p>
            <a href="mailto:sales@newlestech.co.ls?subject=Facebook Live Support">
              Get Facebook Help
            </a>
          </div>

          <div className="support-card">
            <h2>Billing & Subscription</h2>
            <p>
              Questions about StreamMova plans, subscriptions, payments, or
              account access.
            </p>
            <a href="mailto:sales@newlestech.co.ls?subject=Billing Support">
              Contact Billing
            </a>
          </div>

          <div className="support-card">
            <h2>Business & Partnerships</h2>
            <p>
              For partnership requests, business inquiries, integrations, or
              enterprise support.
            </p>
            <a href="mailto:sales@newlestech.co.ls?subject=Business Inquiry">
              Contact Business Team
            </a>
          </div>
        </div>

        <section className="contact-details">
          <h2>Contact Information</h2>

          <p>
            <strong>Email:</strong> sales@newlestech.co.ls
          </p>

          <p>
            <strong>Application:</strong> app.streammova.xyz
          </p>

          <p>
            <strong>Company:</strong> Newles Technologies (Pty) Ltd
          </p>

          <p>
            <strong>Location:</strong> Maseru, Kingdom of Lesotho
          </p>
        </section>

        <footer className="contact-footer">
          <p>© 2026 StreamMova. A product of Newles Technologies.</p>
        </footer>
      </div>
    </div>
  );
}

export default Contacts;