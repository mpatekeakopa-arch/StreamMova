import express from "express";
import axios from "axios";
import crypto from "crypto";

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5002";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

router.get("/api/oauth/youtube/start", (req, res) => {
  const state = crypto.randomBytes(32).toString("hex");
  
  req.session.youtube_state = state;

  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID,
    redirect_uri: process.env.YOUTUBE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get("/api/oauth/youtube/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error("YouTube OAuth error:", error);
    return res.redirect(`${FRONTEND_URL}/dashboard?error=youtube_denied`);
  }

  if (state !== req.session?.youtube_state) {
    return res.redirect(`${FRONTEND_URL}/dashboard?error=invalid_state`);
  }

  try {
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.YOUTUBE_REDIRECT_URI,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, refresh_token } = tokenResponse.data;

    const channelResponse = await axios.get(
      "https://www.googleapis.com/youtube/v3/channels",
      {
        params: {
          part: "snippet",
          mine: true,
        },
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const channel = channelResponse.data.items[0];
    
    const payload = {
      success: true,
      platform: "youtube",
      user: {
        id: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description,
        thumbnail: channel.snippet.thumbnails.default.url,
      },
      access_token,
      refresh_token,
    };

    const encodedPayload = encodeURIComponent(
      Buffer.from(JSON.stringify(payload)).toString("base64")
    );

    delete req.session.youtube_state;
    
    return res.redirect(`${FRONTEND_URL}/dashboard?youtube_oauth=${encodedPayload}`);
  } catch (error) {
    console.error("YouTube OAuth failed:", error.response?.data || error.message);
    return res.redirect(`${FRONTEND_URL}/dashboard?error=youtube_failed`);
  }
});

export default router;