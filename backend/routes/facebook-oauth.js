import express from "express";
import axios from "axios";

const router = express.Router();

const FB_GRAPH_VERSION = "v25.0";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

router.get("/api/oauth/facebook/start", (req, res) => {
  const scopes = [
    "public_profile",
    "email",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "publish_video"
  ].join(",");

  const redirectUrl = `https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth` +
    `?client_id=${process.env.FACEBOOK_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.FACEBOOK_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}`;

  res.redirect(redirectUrl);
});

router.get("/api/oauth/facebook/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/dashboard?error=no_code`);
  }

  try {
    const tokenRes = await axios.get(
      `https://graph.facebook.com/${FB_GRAPH_VERSION}/oauth/access_token`,
      {
        params: {
          client_id: process.env.FACEBOOK_APP_ID,
          client_secret: process.env.FACEBOOK_APP_SECRET,
          redirect_uri: process.env.FACEBOOK_REDIRECT_URI,
          code,
        },
      }
    );

    const userAccessToken = tokenRes.data.access_token;

    const userRes = await axios.get("https://graph.facebook.com/me", {
      params: {
        access_token: userAccessToken,
        fields: "id,name,email",
      },
    });

    const pagesRes = await axios.get(
      `https://graph.facebook.com/${FB_GRAPH_VERSION}/me/accounts`,
      {
        params: {
          access_token: userAccessToken,
          fields: "id,name,access_token,category,tasks",
        },
      }
    );

    const payload = {
      success: true,
      user: userRes.data,
      pages: pagesRes.data,
    };

    const encodedPayload = encodeURIComponent(
      Buffer.from(JSON.stringify(payload)).toString("base64")
    );

    return res.redirect(`${FRONTEND_URL}/dashboard?facebook_oauth=${encodedPayload}`);
  } catch (error) {
    console.error("Facebook OAuth failed:", error.response?.data || error.message);
    return res.redirect(`${FRONTEND_URL}/dashboard?error=facebook_failed`);
  }
});

export default router;