import express from "express";
import cors from "cors";
import axios from "axios";
import { spawn } from "child_process";
import dotenv from "dotenv";
import session from "express-session";

// Import OAuth routes
import facebookOAuthRouter from "./routes/facebook-oauth.js";
import twitchOAuthRouter from "./routes/twitch-oauth.js";
import youtubeOAuthRouter from "./routes/youtube-oauth.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Session middleware for OAuth state
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

const FB_GRAPH_VERSION = "v25.0";
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || "ubuntu_default";
const FFMPEG_IMAGE = process.env.FFMPEG_IMAGE || "jrottenberg/ffmpeg:6.1-alpine";
const DEFAULT_INPUT_URL = process.env.SRS_INPUT_URL || "rtmp://srs:1935/live/test";

const activeFacebookJobs = new Map();
const activeJobs = new Map();

function safeChannelName(channelId) {
  return String(channelId).replace(/[^a-zA-Z0-9_.-]/g, "_");
}

// =========================
// HEALTH CHECK
// =========================
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "StreamMova backend running",
  });
});

// =========================
// MOUNT OAUTH ROUTES
// =========================
app.use("/", facebookOAuthRouter);
app.use("/", twitchOAuthRouter);
app.use("/", youtubeOAuthRouter);

// =========================
// FACEBOOK LIVE START
// =========================
app.post("/api/facebook/live/start", async (req, res) => {
  const { channelId, title, description, pageId, pageAccessToken } = req.body;

  if (!channelId) {
    return res.status(400).json({
      success: false,
      error: "channelId is required",
    });
  }

  if (!pageId || !pageAccessToken) {
    return res.status(400).json({
      success: false,
      error: "pageId and pageAccessToken are required",
    });
  }

  if (activeFacebookJobs.has(channelId)) {
    return res.status(409).json({
      success: false,
      error: "Facebook live stream already running for this channel",
    });
  }

  try {
    const fbResponse = await axios.post(
      `https://graph.facebook.com/${FB_GRAPH_VERSION}/${pageId}/live_videos`,
      null,
      {
        params: {
          status: "LIVE_NOW",
          title: title || "StreamMova Live",
          description: description || "Live stream from StreamMova",
          access_token: pageAccessToken,
        },
      }
    );

    const liveVideoId = fbResponse.data.id;
    const streamUrl = fbResponse.data.secure_stream_url || fbResponse.data.stream_url;

    if (!liveVideoId || !streamUrl) {
      return res.status(500).json({
        success: false,
        error: "Facebook did not return a valid liveVideoId or streamUrl",
      });
    }

    const safeChannelId = safeChannelName(channelId);
    const containerName = `ffmpeg_facebook_${safeChannelId}_${Date.now()}`;

    const dockerArgs = [
      "run",
      "-d",
      "--rm",
      "--network",
      DOCKER_NETWORK,
      "--name",
      containerName,
      FFMPEG_IMAGE,
      "-re",
      "-i",
      DEFAULT_INPUT_URL,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-b:v",
      "2500k",
      "-maxrate",
      "2500k",
      "-bufsize",
      "5000k",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "60",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-f",
      "flv",
      streamUrl,
    ];

    const child = spawn("docker", dockerArgs);

    child.on("error", (err) => {
      console.error("Failed to start Facebook FFmpeg Docker container:", err);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error("Facebook docker run failed");
        activeFacebookJobs.delete(channelId);
      }
    });

    activeFacebookJobs.set(channelId, {
      containerName,
      liveVideoId,
      pageId,
      pageAccessToken,
      inputUrl: DEFAULT_INPUT_URL,
      startedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: "Facebook live stream started",
      channelId,
      liveVideoId,
      pageId,
      containerName,
    });
  } catch (error) {
    console.error("Facebook live start error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to start Facebook live stream",
      details: error.response?.data || error.message,
    });
  }
});

// =========================
// FACEBOOK LIVE STOP
// =========================
app.post("/api/facebook/live/stop", async (req, res) => {
  const { channelId } = req.body;

  if (!channelId) {
    return res.status(400).json({
      success: false,
      error: "channelId is required",
    });
  }

  const job = activeFacebookJobs.get(channelId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: "No active Facebook live stream found for this channel",
    });
  }

  try {
    await new Promise((resolve) => {
      const stopProcess = spawn("docker", ["stop", job.containerName]);
      stopProcess.on("close", () => resolve());
      stopProcess.on("error", () => resolve());
    });

    try {
      await axios.post(
        `https://graph.facebook.com/${FB_GRAPH_VERSION}/${job.liveVideoId}`,
        null,
        {
          params: {
            end_live_video: true,
            access_token: job.pageAccessToken,
          },
        }
      );
    } catch (fbEndError) {
      console.error("Facebook end_live_video warning:", fbEndError.message);
    }

    activeFacebookJobs.delete(channelId);

    return res.json({
      success: true,
      message: "Facebook live stream stopped",
      liveVideoId: job.liveVideoId,
      containerName: job.containerName,
    });
  } catch (error) {
    console.error("Facebook live stop error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to stop Facebook live stream",
    });
  }
});

// =========================
// FACEBOOK LIVE STATUS
// =========================
app.get("/api/facebook/live/status/:channelId", (req, res) => {
  const { channelId } = req.params;
  const job = activeFacebookJobs.get(channelId);

  if (!job) {
    return res.json({
      success: true,
      running: false,
    });
  }

  return res.json({
    success: true,
    running: true,
    liveVideoId: job.liveVideoId,
    pageId: job.pageId,
    inputUrl: job.inputUrl,
    containerName: job.containerName,
    startedAt: job.startedAt,
  });
});

// =========================
// TWITCH LIVE START
// =========================
app.post("/api/twitch/live/start", async (req, res) => {
  const { channelId, streamKey } = req.body;

  if (!channelId) {
    return res.status(400).json({
      success: false,
      error: "channelId is required",
    });
  }

  if (!streamKey) {
    return res.status(400).json({
      success: false,
      error: "streamKey is required",
    });
  }

  if (activeJobs.has(channelId)) {
    return res.status(409).json({
      success: false,
      error: "Twitch stream already running for this channel",
    });
  }

  try {
    const safeChannelId = safeChannelName(channelId);

    const containerName = `ffmpeg_twitch_${safeChannelId}_${Date.now()}`;

    const twitchOutput = `rtmp://live.twitch.tv/app/${streamKey}`;

    const dockerArgs = [
      "run",
      "-d",
      "--rm",
      "--network",
      DOCKER_NETWORK,
      "--name",
      containerName,

      FFMPEG_IMAGE,

      "-re",
      "-i",
      DEFAULT_INPUT_URL,

      "-c:v",
      "libx264",

      "-preset",
      "veryfast",

      "-b:v",
      "2500k",

      "-maxrate",
      "2500k",

      "-bufsize",
      "5000k",

      "-pix_fmt",
      "yuv420p",

      "-g",
      "60",

      "-c:a",
      "aac",

      "-b:a",
      "128k",

      "-ar",
      "44100",

      "-f",
      "flv",

      twitchOutput,
    ];

    const child = spawn("docker", dockerArgs);

    child.on("error", (err) => {
      console.error("Failed to start Twitch FFmpeg Docker container:", err);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error("Twitch docker run failed");
        activeJobs.delete(channelId);
      }
    });

    activeJobs.set(channelId, {
      containerName,
      streamKey,
      inputUrl: DEFAULT_INPUT_URL,
      startedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: "Twitch live stream started",
      channelId,
      containerName,
    });
  } catch (error) {
    console.error("Twitch live start error:", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to start Twitch live stream",
      details: error.message,
    });
  }
});

// =========================
// TWITCH LIVE STOP
// =========================
app.post("/api/twitch/live/stop", async (req, res) => {
  const { channelId } = req.body;

  const job = activeJobs.get(channelId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: "No active Twitch stream found",
    });
  }

  try {
    await new Promise((resolve) => {
      const stopProcess = spawn("docker", ["stop", job.containerName]);

      stopProcess.on("close", () => resolve());

      stopProcess.on("error", () => resolve());
    });

    activeJobs.delete(channelId);

    return res.json({
      success: true,
      message: "Twitch live stream stopped",
    });
  } catch (error) {
    console.error("Twitch stop error:", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to stop Twitch stream",
    });
  }
});

// =========================
// SERVER START
// =========================
app.listen(PORT, () => {
  console.log(`StreamMova backend listening on port ${PORT}`);
});