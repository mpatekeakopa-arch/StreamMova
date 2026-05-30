import express from "express";
import axios from "axios";
import crypto from "crypto";

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.streammova.xyz/dashboard";

const SCOPES = [
  "user:read:email",
  "channel:read:stream_key",
  "channel:manage:broadcast",
];

router.get("/api/oauth/twitch/start", (req, res) => {
  const state = crypto.randomBytes(32).toString("hex");

  req.session.twitch_state = state;

  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    redirect_uri: process.env.TWITCH_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    force_verify: "true",
  });

  res.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
});

router.get("/api/oauth/twitch/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error("Twitch OAuth error:", error);
    return res.redirect(`${FRONTEND_URL}/dashboard?error=twitch_denied`);
  }

  if (!code) {
    console.error("Twitch OAuth failed: missing code");
    return res.redirect(`${FRONTEND_URL}/dashboard?error=twitch_missing_code`);
  }

  if (state !== req.session?.twitch_state) {
    console.error("Twitch OAuth failed: invalid state");
    return res.redirect(`${FRONTEND_URL}/dashboard?error=invalid_state`);
  }

  try {
    const tokenResponse = await axios.post(
      "https://id.twitch.tv/oauth2/token",
      null,
      {
        params: {
          client_id: process.env.TWITCH_CLIENT_ID,
          client_secret: process.env.TWITCH_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: process.env.TWITCH_REDIRECT_URI,
        },
      }
    );

    const { access_token, refresh_token } = tokenResponse.data;

    const userResponse = await axios.get("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Client-Id": process.env.TWITCH_CLIENT_ID,
      },
    });

    const twitchUser = userResponse.data?.data?.[0];

    if (!twitchUser?.id) {
      throw new Error("Twitch user ID not found");
    }

    const streamKeyResponse = await axios.get(
      "https://api.twitch.tv/helix/streams/key",
      {
        params: {
          broadcaster_id: twitchUser.id,
        },
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Client-Id": process.env.TWITCH_CLIENT_ID,
        },
      }
    );

    const streamKey = streamKeyResponse.data?.data?.[0]?.stream_key;

    if (!streamKey) {
      throw new Error("Twitch stream key not found");
    }

    const payload = {
      success: true,
      platform: "twitch",
      user: {
        id: twitchUser.id,
        login: twitchUser.login,
        display_name: twitchUser.display_name,
        email: twitchUser.email,
        profile_image_url: twitchUser.profile_image_url,
      },
      stream_key: streamKey,
      rtmp_url: `rtmp://live.twitch.tv/app/${streamKey}`,
      access_token,
      refresh_token,
    };

    const encodedPayload = encodeURIComponent(
      Buffer.from(JSON.stringify(payload)).toString("base64")
    );

    delete req.session.twitch_state;

    return res.redirect(
      `${FRONTEND_URL}/dashboard?twitch_oauth=${encodedPayload}`
    );
  } catch (error) {
    console.error("Twitch OAuth failed:", error.response?.data || error.message);
    return res.redirect(`${FRONTEND_URL}/dashboard?error=twitch_failed`);
  }
});

export default router;