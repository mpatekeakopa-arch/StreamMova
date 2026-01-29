import React from 'react';
import { useNavigate } from 'react-router-dom';
import './welcome.css'; 

function Welcome() {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate('/dashboard');
  };

  const handleSignIn = () => {
    navigate('/login');
  };

  // TEMP: Placeholder for Google Auth
  const handleGoogleLogin = () => {
    // Later this will trigger Google OAuth
    console.log('Google login clicked');

    // Temporary redirect (remove once OAuth is connected)
    navigate('/dashboard');
  };

  return (
    <div className="welcome-container">
      <div className="welcome-content">
        <div className="logo-section">
          <h1 className="app-title">StreamMova</h1>
          <div className="tagline">Where Stories Come Alive</div>
        </div>

        <div className="hero-section">
          <div className="hero-text">
            <h2>Welcome to StreamMova</h2>
            <p>Your ultimate destination for endless entertainment</p>
          </div>

          <div className="cta-section">
            <button 
              className="get-started-btn"
              onClick={handleGetStarted}
            >
              Get Started
            </button>

            <button 
              className="sign-in-btn"
              onClick={handleSignIn}
            >
              Sign In
            </button>

            {/* Google Login Button */}
            <button 
              className="google-btn"
              onClick={handleGoogleLogin}
            >
              <img
                src="https://developers.google.com/identity/images/g-logo.png"
                alt="Google"
                className="google-icon"
              />
              Log in with Google
            </button>
          </div>
        </div>

        <div className="footer-note">
          <p>Ready to explore? Start your journey with us</p>
          <div className="quick-links">
            <span className="link" onClick={() => navigate('/about')}>
              About
            </span>
            <span className="link" onClick={() => navigate('/features')}>
              Features
            </span>
            <span className="link" onClick={() => navigate('/contact')}>
              Contact
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Welcome;
