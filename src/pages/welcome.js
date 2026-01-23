import React from 'react';
import { useNavigate } from 'react-router-dom';
import './welcome.css'; // Optional: create separate CSS

function Welcome() {
  const navigate = useNavigate();
  
  const handleGetStarted = () => {
    // For now, navigate to dashboard
    // Later you might want to navigate to signup or onboarding
    navigate('/dashboard');
  };

  const handleSignIn = () => {
    navigate('/login');
  };

  const handleExploreAsGuest = () => {
    // Guest mode - navigate to limited access dashboard
    navigate('/dashboard?guest=true');
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
            
            <button 
              className="guest-btn"
              onClick={handleExploreAsGuest}
            >
              Explore as Guest
            </button>
          </div>
        </div>
        
        <div className="footer-note">
          <p>Ready to explore? Start your journey with us</p>
          <div className="quick-links">
            <span 
              className="link" 
              onClick={() => navigate('/about')}
            >
              About
            </span>
            <span 
              className="link" 
              onClick={() => navigate('/features')}
            >
              Features
            </span>
            <span 
              className="link" 
              onClick={() => navigate('/contact')}
            >
              Contact
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Welcome;