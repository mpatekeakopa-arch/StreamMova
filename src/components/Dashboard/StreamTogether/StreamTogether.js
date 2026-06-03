import React, { useEffect, useRef, useState, useCallback } from "react";

// Minimal Configuration
const SRS_RTC_BASE = "webrtc://srs.streammova.xyz/live";
const SESSION_ID = `session-${Date.now()}`;

export default function StreamTogether() {
  const [hasUser2, setHasUser2] = useState(false);
  const [isLive, setIsLive] = useState(false);

  // Element Refs
  const video1Ref = useRef(null); // User 1 Hidden Element
  const video2Ref = useRef(null); // User 2 Hidden Element
  const canvasRef = useRef(null); // The combined layouts

  // WebRTC Instance Refs
  const stream1Ref = useRef(null);
  const publisherRef = useRef(null);
  const playerRef = useRef(null);
  const animationRef = useRef(null);

  // 1. Mix User 1 and User 2 Side-by-Side on the canvas (Wrapped to satisfy ESLint)
  const startCanvasComposition = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    canvas.width = 1280;
    canvas.height = 720;

    const draw = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Check if User 2 is present to decide side-by-side vs full screen layout
      if (video2Ref.current && video2Ref.current.readyState >= 2 && hasUser2) {
        // User 1 - Left Half
        ctx.drawImage(video1Ref.current, 0, 0, 640, 720);
        // User 2 - Right Half
        ctx.drawImage(video2Ref.current, 640, 0, 640, 720);
      } else if (video1Ref.current && video1Ref.current.readyState >= 2) {
        // User 1 - Full screen layout until partner arrives
        ctx.drawImage(video1Ref.current, 0, 0, 1280, 720);
      }
      animationRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, [hasUser2]); // Tracks hasUser2 changes to redraw correctly

  // 2. Fire up User 1's Camera & start compositing canvas loop
  const startPreview = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream1Ref.current = stream;
      if (video1Ref.current) {
        video1Ref.current.srcObject = stream;
        video1Ref.current.play().catch(err => console.error("Video play failed:", err));
      }
      startCanvasComposition();
    } catch (err) {
      console.error("Error accessing media devices:", err);
    }
  }, [startCanvasComposition]); // Added dependency here to make CI happy!

  // 3. User 2 simulates arriving via this manual action link
  const simulateUser2Join = async () => {
    if (!window.SrsRtcPlayerAsync) return alert("SRS SDK script missing.");
    
    setHasUser2(true);
    const player = new window.SrsRtcPlayerAsync();
    // Connects to User 2's specific published RTC edge
    await player.play(`${SRS_RTC_BASE}/${SESSION_ID}-user2`);
    
    if (video2Ref.current) {
      video2Ref.current.srcObject = player.stream;
      video2Ref.current.play().catch(err => console.error("User 2 video play failed:", err));
    }
    playerRef.current = player;
  };

  // 4. Send the final side-by-side canvas output to SRS
  const publishToSrs = async () => {
    if (!window.SrsRtcPublisherAsync) return alert("SRS SDK script missing.");

    // Capture the mixed canvas as a 30fps stream
    const mixedStream = canvasRef.current.captureStream(30);
    
    // Append User 1's mic audio track into the composited video stream
    if (stream1Ref.current && stream1Ref.current.getAudioTracks().length > 0) {
      mixedStream.addTrack(stream1Ref.current.getAudioTracks()[0]);
    }

    const publisher = new window.SrsRtcPublisherAsync();
    await publisher.publish(`${SRS_RTC_BASE}/${SESSION_ID}-composited`, mixedStream);
    
    publisherRef.current = publisher;
    setIsLive(true);
  };

  // Cleanup loop on unmount
  useEffect(() => {
    startPreview();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (stream1Ref.current) stream1Ref.current.getTracks().forEach(t => t.stop());
      if (publisherRef.current) publisherRef.current.close();
      if (playerRef.current) playerRef.current.close();
    };
  }, [startPreview]); 

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", textAlign: "center" }}>
      <h2>Minimal Side-by-Side Stream Mixer</h2>
      
      {/* The output display screen showing real-time mixed content */}
      <div style={{ margin: "20px auto" }}>
        <canvas ref={canvasRef} style={{ width: "640px", height: "360px", background: "#111", borderRadius: "8px" }} />
      </div>

      {/* Control Actions */}
      <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
        <button 
          onClick={simulateUser2Join} 
          disabled={hasUser2}
          style={{ padding: "10px 20px", cursor: "pointer" }}
        >
          {hasUser2 ? "User 2 Connected" : "Simulate User 2 Joining"}
        </button>

        <button 
          onClick={publishToSrs} 
          disabled={isLive}
          style={{ padding: "10px 20px", backgroundColor: isLive ? "#aaa" : "#00bcd4", color: "#fff", border: "none", cursor: "pointer" }}
        >
          {isLive ? "Streaming Live to SRS!" : "Send Mixed Output to SRS"}
        </button>
      </div>

      <p style={{ fontSize: "12px", color: "#666" }}>
        Target Output URL: <code style={{ background: "#eee", padding: "2px 4px" }}>{SRS_RTC_BASE}/{SESSION_ID}-composited</code>
      </p>

      {/* Hidden background elements supplying data to the compositor loop */}
      <video ref={video1Ref} muted style={{ display: "none" }} />
      <video ref={video2Ref} muted style={{ display: "none" }} />
    </div>
  );
}