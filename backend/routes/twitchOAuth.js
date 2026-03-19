const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const router = express.Router();

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.streammova.xyz";

const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";

const SCOPES = ["user:read:email"];

router.get("/api/oauth/twitch/start", (req, res) => {
  const userId = req.session?.user_id;

  if (!userId) {
    return res.redirect(`${FRONTEND_URL}/dashboard?channelError=not_logged_in`);
  }

  const state = crypto.randomBytes(32).toString("hex");

  req.session.twitch_oauth_state = state;
  req.session.twitch_oauth_user_id = userId;

  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: TWITCH_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    force_verify: "true",
  });

  return res.redirect(`${TWITCH_AUTHORIZE_URL}?${params.toString()}`);
});

router.get("/api/oauth/twitch/callback", async (req, res) => {
  const { code, state, error } = req.query;

  const expectedState = req.session?.twitch_oauth_state;
  const userId = req.session?.twitch_oauth_user_id;

  if (error) {
    return res.redirect(`${FRONTEND_URL}/dashboard?channelError=twitch_denied`);
  }

  if (!code || !state || state !== expectedState) {
    return res.redirect(`${FRONTEND_URL}/dashboard?channelError=invalid_state`);
  }

  if (!userId) {
    return res.redirect(`${FRONTEND_URL}/dashboard?channelError=user_missing`);
  }

  try {
    const tokenResponse = await axios.post(TWITCH_TOKEN_URL, null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: TWITCH_REDIRECT_URI,
      },
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const userResponse = await axios.get(TWITCH_USERS_URL, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Client-Id": TWITCH_CLIENT_ID,
      },
    });

    const twitchUser = userResponse.data?.data?.[0];

    if (!twitchUser) {
      return res.redirect(`${FRONTEND_URL}/dashboard?channelError=twitch_user_not_found`);
    }

    const connectedChannel = {
      user_id: userId,
      platform: "twitch",
      platform_user_id: twitchUser.id,
      platform_username: twitchUser.login,
      display_name: twitchUser.display_name,
      email: twitchUser.email || null,
      access_token,
      refresh_token,
      expires_at: new Date(Date.now() + expires_in * 1000),
    };

    console.log("Save this Twitch connection:", connectedChannel);

    // TODO: replace this with your real DB save logic

    delete req.session.twitch_oauth_state;
    delete req.session.twitch_oauth_user_id;

    return res.redirect(`${FRONTEND_URL}/dashboard?connected=twitch`);
  } catch (err) {
    console.error("Twitch OAuth error:", err.response?.data || err.message);
    return res.redirect(`${FRONTEND_URL}/dashboard?channelError=token_exchange_failed`);
  }
});

module.exports = router;