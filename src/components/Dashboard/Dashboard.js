import React, { useEffect, useMemo, useRef, useState } from "react";
import "./Dashboard.css";
import { getInitials } from "./utils/helpers";
import { availablePlatforms } from "./utils/constants";
import StreamOutput from "./StreamOutput/StreamOutput";
import QuickActions from "./QuickActions/QuickActions";
import ChannelModal from "./ChannelModal/ChannelModal";
import Sidebar from "./Sidebar/Sidebar";
import Header from "./Header/Header";
import Analytics from "./Analytics/Analytics";
import { useAuth } from "../../auth/AuthProvider";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "https://api.streammova.xyz";

function Dashboard() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("dashboard");

  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState("");
  const [liveStatus, setLiveStatus] = useState("");

  const [facebookLiveActive, setFacebookLiveActive] = useState(false);
  const [twitchLiveActive, setTwitchLiveActive] = useState(false);

  const [facebookPages, setFacebookPages] = useState([]);
  const [selectedFacebookPageId, setSelectedFacebookPageId] = useState("");
  const [facebookConnectStatus, setFacebookConnectStatus] = useState("");

  const [twitchConnected, setTwitchConnected] = useState(false);
  const [twitchUsername, setTwitchUsername] = useState("");
  const [twitchStreamKey, setTwitchStreamKey] = useState("");
  const [twitchRtmpUrl, setTwitchRtmpUrl] = useState("");

  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [youtubeChannelName, setYoutubeChannelName] = useState("");
  const [youtubeStreamKey, setYoutubeStreamKey] = useState("");
  const [youtubeRtmpUrl, setYoutubeRtmpUrl] = useState("");

  const { displayName, authUser, profile } = useAuth();

  const planName = "Free Plan";
  const avatarInitials = useMemo(() => getInitials(displayName), [displayName]);

  const [showChannelModal, setShowChannelModal] = useState(false);
  const [connectedChannels, setConnectedChannels] = useState([]);

  const [channelForm, setChannelForm] = useState({
    platform: "",
    streamKey: "",
    title: "",
    testStatus: "idle",
    testMessage: "",
  });

  const uploadInputRef = useRef(null);
  const [uploadedVideo, setUploadedVideo] = useState(null);
  const [uploadTitle, setUploadTitle] = useState("");

  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState(null);

  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    startAtLocal: "",
  });

  const scheduleTimeoutRef = useRef(null);
  const [scheduleStatus, setScheduleStatus] = useState({
    active: false,
    message: "",
    startAtMs: null,
  });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const modalRef = useRef(null);

  const channelId = authUser?.id || "test";

  const selectedFacebookPage = facebookPages.find(
    (page) => page.id === selectedFacebookPageId
  );
useEffect(() => {
  const saved = localStorage.getItem("streammova_connected_channels");

  if (saved) {
    try {
      const data = JSON.parse(saved);

      setConnectedChannels(data.connectedChannels || []);
      setTwitchConnected(data.twitchConnected || false);
      setTwitchUsername(data.twitchUsername || "");
      setTwitchStreamKey(data.twitchStreamKey || "");
      setTwitchRtmpUrl(data.twitchRtmpUrl || "");

      setYoutubeConnected(data.youtubeConnected || false);
      setYoutubeChannelName(data.youtubeChannelName || "");
      setYoutubeStreamKey(data.youtubeStreamKey || "");
      setYoutubeRtmpUrl(data.youtubeRtmpUrl || "");

      setFacebookPages(data.facebookPages || []);
      setSelectedFacebookPageId(data.selectedFacebookPageId || "");
      setFacebookConnectStatus(data.facebookConnectStatus || "");
    } catch (err) {
      console.error("Failed to load saved channels:", err);
    }
  }
}, []);

useEffect(() => {
  localStorage.setItem(
    "streammova_connected_channels",
    JSON.stringify({
      connectedChannels,
      twitchConnected,
      twitchUsername,
      twitchStreamKey,
      twitchRtmpUrl,
      youtubeConnected,
      youtubeChannelName,
      youtubeStreamKey,
      youtubeRtmpUrl,
      facebookPages,
      selectedFacebookPageId,
      facebookConnectStatus,
    })
  );
}, [
  connectedChannels,
  twitchConnected,
  twitchUsername,
  twitchStreamKey,
  twitchRtmpUrl,
  youtubeConnected,
  youtubeChannelName,
  youtubeStreamKey,
  youtubeRtmpUrl,
  facebookPages,
  selectedFacebookPageId,
  facebookConnectStatus,
]);

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const handleNavClick = (navItem) => setActiveNav(navItem);

  const handleOpenChannelModal = () => {
    setShowChannelModal(true);
    setChannelForm({
      platform: "",
      streamKey: "",
      title: "",
      testStatus: "idle",
      testMessage: "",
    });
  };

  const handleCloseChannelModal = () => setShowChannelModal(false);

  const handlePlatformSelect = (platformId) => {
    setChannelForm((prev) => ({
      ...prev,
      platform: platformId,
      testStatus: "idle",
      testMessage: "",
    }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    setChannelForm((prev) => ({
      ...prev,
      [name]: value,
      testStatus: name === "streamKey" ? "idle" : prev.testStatus,
      testMessage: name === "streamKey" ? "" : prev.testMessage,
    }));
  };

  const handleFacebookOAuth = () => {
    window.location.href = `${API_BASE_URL}/api/oauth/facebook/start`;
  };

  const handleTwitchOAuth = () => {
    window.location.href = `${API_BASE_URL}/api/oauth/twitch/start`;
  };

  const handleYouTubeOAuth = () => {
    window.location.href = `${API_BASE_URL}/api/oauth/youtube/start`;
  };

  const handleTestConnection = async () => {
    if (!channelForm.platform) {
      setChannelForm((prev) => ({
        ...prev,
        testStatus: "failed",
        testMessage: "Select a platform first.",
      }));
      return;
    }

    const platform = availablePlatforms.find(
      (p) => p.id === channelForm.platform
    );

    if (!platform) {
      setChannelForm((prev) => ({
        ...prev,
        testStatus: "failed",
        testMessage: "Invalid platform selected.",
      }));
      return;
    }

    const alreadyConnected = connectedChannels.some(
      (channel) => channel.platform === channelForm.platform
    );

    if (alreadyConnected) {
      setChannelForm((prev) => ({
        ...prev,
        testStatus: "failed",
        testMessage: `${platform.name} is already connected.`,
      }));
      return;
    }

    setChannelForm((prev) => ({
      ...prev,
      testStatus: "testing",
      testMessage: "Connecting…",
    }));

    await new Promise((resolve) => setTimeout(resolve, 700));

    const newChannel = {
      id: Date.now(),
      platform: platform.id,
      name: platform.name,
      icon: platform.icon,
      color: platform.color,
      logo: platform.logo,
      streamKey: channelForm.streamKey,
      title: channelForm.title || `Stream to ${platform.name}`,
      status: "connected",
      addedAt: new Date().toISOString(),
    };

    setConnectedChannels((prev) => [...prev, newChannel]);

    setChannelForm((prev) => ({
      ...prev,
      testStatus: "connected",
      testMessage: "Connected successfully!",
    }));

    setTimeout(() => {
      setShowChannelModal(false);
      setChannelForm({
        platform: "",
        streamKey: "",
        title: "",
        testStatus: "idle",
        testMessage: "",
      });
    }, 500);
  };

  const handleRemoveChannel = (channelIdToRemove) => {
    const removedChannel = connectedChannels.find(
      (channel) => channel.id === channelIdToRemove
    );

    setConnectedChannels((prev) =>
      prev.filter((channel) => channel.id !== channelIdToRemove)
    );

    if (removedChannel?.platform === "twitch") {
      setTwitchConnected(false);
      setTwitchUsername("");
      setTwitchStreamKey("");
      setTwitchRtmpUrl("");
      setTwitchLiveActive(false);
    }

    if (removedChannel?.platform === "youtube") {
      setYoutubeConnected(false);
      setYoutubeChannelName("");
      setYoutubeStreamKey("");
      setYoutubeRtmpUrl("");
    }

    if (removedChannel?.platform === "facebook") {
      setFacebookPages([]);
      setSelectedFacebookPageId("");
      setFacebookConnectStatus("");
      setFacebookLiveActive(false);
    }
  };

  const openCamera = async () => {
    try {
      setError("");

      if (
        cameraStream &&
        cameraStream.getTracks().some((track) => track.readyState === "live")
      ) {
        return cameraStream;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: true,
      });

      setCameraStream(stream);
      streamRef.current = stream;
      setIsCameraOn(true);

      return stream;
    } catch (err) {
      console.error("openCamera failed:", err);

      const msg =
        err?.name === "NotAllowedError"
          ? "Permission denied. Please allow camera and microphone access."
          : err?.name === "NotFoundError"
          ? "No camera found on this device."
          : err?.name === "NotReadableError"
          ? "Camera is already in use by another app."
          : "Unable to access camera or microphone.";

      setError(msg);
      setIsCameraOn(false);
      setIsStreaming(false);
      setCameraStream(null);
      streamRef.current = null;

      return null;
    }
  };

  const stopCameraOnly = () => {
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}

      mediaRecorderRef.current = null;
      setIsRecording(false);
    }

    const stream = streamRef.current || cameraStream;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    streamRef.current = null;
    setCameraStream(null);
    setIsCameraOn(false);
  };

  const startFacebookLive = async () => {
    if (!selectedFacebookPage?.id || !selectedFacebookPage?.access_token) {
      return null;
    }

    setLiveStatus("Starting Facebook Live…");

    const response = await fetch(`${API_BASE_URL}/api/facebook/live/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channelId,
        title: "StreamMova Live",
        description: "Live from StreamMova",
        pageId: selectedFacebookPage.id,
        pageAccessToken: selectedFacebookPage.access_token,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.message || "Failed to start Facebook Live");
    }

    setFacebookLiveActive(true);
    setLiveStatus(`Facebook Live started. Video ID: ${data.liveVideoId}`);

    return data;
  };

  const stopFacebookLive = async () => {
    if (!facebookLiveActive) return null;

    setLiveStatus("Stopping Facebook Live…");

    const response = await fetch(`${API_BASE_URL}/api/facebook/live/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channelId }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.message || "Failed to stop Facebook Live");
    }

    setFacebookLiveActive(false);
    setLiveStatus("Facebook Live stopped.");

    return data;
  };

  const startTwitchLive = async () => {
    if (!twitchConnected || !twitchStreamKey) return null;

    setLiveStatus("Starting Twitch Live…");

    const response = await fetch(`${API_BASE_URL}/api/twitch/live/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channelId,
        streamKey: twitchStreamKey,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.message || "Failed to start Twitch Live");
    }

    setTwitchLiveActive(true);
    setLiveStatus(`Twitch Live started. Container: ${data.containerName}`);

    return data;
  };

  const stopTwitchLive = async () => {
    if (!twitchLiveActive) return null;

    setLiveStatus("Stopping Twitch Live…");

    const response = await fetch(`${API_BASE_URL}/api/twitch/live/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channelId }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.message || "Failed to stop Twitch Live");
    }

    setTwitchLiveActive(false);
    setLiveStatus("Twitch Live stopped.");

    return data;
  };

  const closeCamera = async () => {
    try {
      const stopTasks = [];

      if (facebookLiveActive) stopTasks.push(stopFacebookLive());
      if (twitchLiveActive) stopTasks.push(stopTwitchLive());

      if (stopTasks.length > 0) {
        await Promise.allSettled(stopTasks);
      }
    } catch (err) {
      console.error("stop live failed:", err);
      setError(err.message || "Failed to stop live stream.");
    } finally {
      stopCameraOnly();
      setIsStreaming(false);
      setFacebookLiveActive(false);
      setTwitchLiveActive(false);
    }
  };

  const handleStreamToggle = async () => {
    try {
      setError("");

      if (!isStreaming) {
        const stream = await openCamera();
        if (!stream) return;

        const hasFacebook = Boolean(
          selectedFacebookPage?.id && selectedFacebookPage?.access_token
        );
        const hasTwitch = Boolean(twitchConnected && twitchStreamKey);
        const hasYouTube = Boolean(youtubeConnected);

        if (!hasFacebook && !hasTwitch && !hasYouTube) {
          throw new Error("Connect at least one platform before going live.");
        }

        const startTasks = [];

        if (hasFacebook) startTasks.push(startFacebookLive());
        if (hasTwitch) startTasks.push(startTwitchLive());

        const results = await Promise.allSettled(startTasks);
        const failed = results.find((result) => result.status === "rejected");

        if (failed) throw failed.reason;

        setIsStreaming(true);

        const livePlatforms = [];
        if (hasFacebook) livePlatforms.push("Facebook");
        if (hasTwitch) livePlatforms.push("Twitch");
        if (hasYouTube) livePlatforms.push("YouTube");

        setLiveStatus(`Live on ${livePlatforms.join(" and ")}.`);
      } else {
        await closeCamera();
      }
    } catch (err) {
      console.error("stream toggle failed:", err);
      setError(err.message || "Failed to start or stop stream.");
      setIsStreaming(false);
    }
  };

  const openUploadPicker = () => {
    setError("");
    uploadInputRef.current?.click();
  };

  const handleUploadSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setError("Please select a video file.");
      e.target.value = "";
      return;
    }

    if (uploadedVideo?.url) {
      URL.revokeObjectURL(uploadedVideo.url);
    }

    const url = URL.createObjectURL(file);

    setUploadedVideo({
      file,
      url,
      name: file.name,
      size: file.size,
      type: file.type,
    });

    setUploadTitle((prev) => prev || file.name.replace(/\.[^.]+$/, ""));

    if (isCameraOn || isStreaming) {
      closeCamera();
    }

    const video = videoRef.current;

    if (video) {
      video.srcObject = null;
      video.src = url;
      video.muted = false;
      video.controls = true;
      video.play().catch(() => {});
    }
  };

  const handleSendUploadedToChannels = async () => {
    if (!uploadedVideo?.file) {
      setError("Upload a video first.");
      return;
    }

    alert(
      `Ready to send "${uploadedVideo.name}". Upload streaming will be connected to backend later.`
    );
  };

  const startRecording = () => {
    setError("");

    const stream = streamRef.current;

    if (!stream) {
      setError('Turn on the camera first by clicking "Start Multistream".');
      return;
    }

    if (isRecording) return;

    try {
      recordChunksRef.current = [];

      const candidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];

      const mimeType = candidates.find((type) =>
        window.MediaRecorder?.isTypeSupported?.(type)
      );

      const mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordChunksRef.current, {
          type: mediaRecorder.mimeType || "video/webm",
        });

        recordChunksRef.current = [];

        if (recordedVideo?.url) {
          URL.revokeObjectURL(recordedVideo.url);
        }

        const url = URL.createObjectURL(blob);
        const name = `streammova-recording-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.webm`;

        setRecordedVideo({ blob, url, name });

        const video = videoRef.current;

        if (video) {
          video.srcObject = null;
          video.src = url;
          video.controls = true;
          video.muted = false;
          video.play().catch(() => {});
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setError("Recording is not supported in this browser.");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current) return;

    try {
      mediaRecorderRef.current.stop();
    } catch {}

    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  const downloadRecording = () => {
    if (!recordedVideo?.url) return;

    const link = document.createElement("a");
    link.href = recordedVideo.url;
    link.download = recordedVideo.name || "recording.webm";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;

    const result = await Notification.requestPermission();
    return result === "granted";
  };

  const showScheduleNotification = async (title) => {
    const allowed = await requestNotificationPermission();

    if (allowed) {
      new Notification("StreamMova Scheduled Stream", {
        body: title
          ? `It's time to start: ${title}`
          : "It's time to start streaming!",
      });
    } else {
      alert(title ? `It's time to start: ${title}` : "It's time to start streaming!");
    }
  };

  const scheduleSession = async () => {
    setError("");

    const { title, startAtLocal } = scheduleForm;

    if (!startAtLocal) {
      setError("Pick a date/time to schedule.");
      return;
    }

    const startMs = new Date(startAtLocal).getTime();

    if (!Number.isFinite(startMs)) {
      setError("Invalid schedule date/time.");
      return;
    }

    const now = Date.now();

    if (startMs <= now + 2000) {
      setError("Choose a time at least a few seconds in the future.");
      return;
    }

    if (scheduleTimeoutRef.current) {
      clearTimeout(scheduleTimeoutRef.current);
      scheduleTimeoutRef.current = null;
    }

    setScheduleStatus({
      active: true,
      message: `Scheduled for ${new Date(startMs).toLocaleString()}`,
      startAtMs: startMs,
    });

    scheduleTimeoutRef.current = setTimeout(async () => {
      await showScheduleNotification(title);
      setScheduleStatus({
        active: false,
        message: "Schedule triggered.",
        startAtMs: null,
      });
      scheduleTimeoutRef.current = null;
    }, startMs - now);

    await requestNotificationPermission();
  };

  const cancelSchedule = () => {
    if (scheduleTimeoutRef.current) {
      clearTimeout(scheduleTimeoutRef.current);
      scheduleTimeoutRef.current = null;
    }

    setScheduleStatus({
      active: false,
      message: "Schedule cancelled.",
      startAtMs: null,
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const oauthError = params.get("error");
    if (oauthError) {
      setError(`OAuth error: ${oauthError}`);
    }

    const facebookPayload = params.get("facebook_oauth");
    if (facebookPayload) {
      try {
        const decoded = JSON.parse(atob(facebookPayload));
        const pages = decoded?.pages?.data || [];

        if (!Array.isArray(pages) || pages.length === 0) {
          setError("Facebook connected, but no Pages were found.");
          return;
        }

        setFacebookPages(pages);
        setSelectedFacebookPageId(pages[0].id);
        setFacebookConnectStatus(`Facebook connected. ${pages.length} page(s) found.`);

        const facebookChannel = {
          id: "facebook-connected",
          platform: "facebook",
          name: "Facebook",
          icon: "fab fa-facebook",
          color: "#1877F2",
          logo: "https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg",
          status: "connected",
          pageName: pages[0].name,
          addedAt: new Date().toISOString(),
        };

        setConnectedChannels((prev) => {
          const exists = prev.some((c) => c.id === facebookChannel.id);
          return exists ? prev : [...prev, facebookChannel];
        });

        setError("");
        window.history.replaceState({}, document.title, "/dashboard");
      } catch (err) {
        console.error("Failed to read Facebook OAuth result:", err);
        setError("Failed to load Facebook Pages. Please connect Facebook again.");
      }
    }

    const twitchPayload = params.get("twitch_oauth");
    if (twitchPayload) {
      try {
        const decoded = JSON.parse(atob(twitchPayload));

        setTwitchConnected(true);
        setTwitchUsername(decoded.user.display_name);
        setTwitchStreamKey(decoded.stream_key);
        setTwitchRtmpUrl(decoded.rtmp_url);

        const twitchChannel = {
          id: `twitch-${decoded.user.id}`,
          platform: "twitch",
          name: "Twitch",
          displayName: decoded.user.display_name,
          icon: "fab fa-twitch",
          color: "#9146FF",
          logo: "https://cdn4.iconfinder.com/data/icons/social-media-logos-8/512/Twitch-512.png",
          status: "connected",
          streamKey: decoded.stream_key,
          rtmpUrl: decoded.rtmp_url,
          addedAt: new Date().toISOString(),
        };

        setConnectedChannels((prev) => {
          const exists = prev.some((c) => c.id === twitchChannel.id);
          return exists ? prev : [...prev, twitchChannel];
        });

        setError("");
        window.history.replaceState({}, document.title, "/dashboard");
      } catch (err) {
        console.error("Twitch OAuth error:", err);
        setError("Failed to connect Twitch");
      }
    }

    const youtubePayload = params.get("youtube_oauth");
    if (youtubePayload) {
      try {
        const decoded = JSON.parse(atob(youtubePayload));

        setYoutubeConnected(true);
        setYoutubeChannelName(decoded.user.title);
        setYoutubeStreamKey(decoded.stream_key);
        setYoutubeRtmpUrl(decoded.rtmp_url);

        const youtubeChannel = {
          id: `youtube-${decoded.user.id}`,
          platform: "youtube",
          name: "YouTube",
          displayName: decoded.user.title,
          icon: "fab fa-youtube",
          color: "#FF0000",
          logo: "https://cdn2.iconfinder.com/data/icons/social-media-2285/512/1_Youtube_colored_svg-512.png",
          status: "connected",
          streamKey: decoded.stream_key,
          rtmpUrl: decoded.rtmp_url,
          addedAt: new Date().toISOString(),
        };

        setConnectedChannels((prev) => {
          const exists = prev.some((c) => c.id === youtubeChannel.id);
          return exists ? prev : [...prev, youtubeChannel];
        });

        setError("");
        window.history.replaceState({}, document.title, "/dashboard");
      } catch (err) {
        console.error("YouTube OAuth error:", err);
        setError("Failed to connect YouTube");
      }
    }
  }, []);

  useEffect(() => {
    setConnectedChannels((prev) =>
      prev.map((channel) => {
        if (channel.platform === "twitch") {
          return {
            ...channel,
            status: twitchLiveActive ? "live" : "connected",
          };
        }

        if (channel.platform === "facebook") {
          return {
            ...channel,
            status: facebookLiveActive ? "live" : "connected",
          };
        }

        return channel;
      })
    );
  }, [twitchLiveActive, facebookLiveActive]);

  useEffect(() => {
  return () => {
    const stream = streamRef.current || cameraStream;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    streamRef.current = null;

    if (uploadedVideo?.url) {
      URL.revokeObjectURL(uploadedVideo.url);
    }

    if (recordedVideo?.url) {
      URL.revokeObjectURL(recordedVideo.url);
    }

    if (scheduleTimeoutRef.current) {
      clearTimeout(scheduleTimeoutRef.current);
    }
  };
}, []); // Empty dependency array - only runs on unmount

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setShowChannelModal(false);
      }
    };

    if (showChannelModal) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showChannelModal]);

  return (
    <div className={`streammova-app ${isSidebarOpen ? "" : "sidebar-collapsed"}`}>
      <ChannelModal
        showChannelModal={showChannelModal}
        channelForm={channelForm}
        availablePlatforms={availablePlatforms}
        modalRef={modalRef}
        handleCloseChannelModal={handleCloseChannelModal}
        handlePlatformSelect={handlePlatformSelect}
        handleInputChange={handleInputChange}
        handleTestConnection={handleTestConnection}
        handleFacebookOAuth={handleFacebookOAuth}
        handleTwitchOAuth={handleTwitchOAuth}
        handleYouTubeOAuth={handleYouTubeOAuth}
        facebookConnectStatus={facebookConnectStatus}
        twitchConnected={twitchConnected}
        twitchUsername={twitchUsername}
        youtubeConnected={youtubeConnected}
        youtubeChannelName={youtubeChannelName}
      />

      <Sidebar
        isSidebarOpen={isSidebarOpen}
        activeNav={activeNav}
        toggleSidebar={toggleSidebar}
        handleNavClick={handleNavClick}
      />

      <div className="main-content">
        <Header
          displayName={displayName}
          planName={planName}
          avatarInitials={avatarInitials}
          user={{ ...authUser, profile }}
        />

        <div className="dashboard-content">
          <StreamOutput
            isStreaming={isStreaming}
            isCameraOn={isCameraOn}
            error={error || liveStatus}
            uploadedVideo={uploadedVideo}
            recordedVideo={recordedVideo}
            videoRef={videoRef}
            streamRef={streamRef}
            cameraStream={cameraStream}
            openCamera={openCamera}
            closeCamera={closeCamera}
            connectedChannels={connectedChannels}
            handleStreamToggle={handleStreamToggle}
            handleOpenChannelModal={handleOpenChannelModal}
            handleRemoveChannel={handleRemoveChannel}
            facebookPages={facebookPages}
            selectedFacebookPageId={selectedFacebookPageId}
            setSelectedFacebookPageId={setSelectedFacebookPageId}
            facebookConnectStatus={facebookConnectStatus}
            twitchConnected={twitchConnected}
            twitchUsername={twitchUsername}
            youtubeConnected={youtubeConnected}
            youtubeChannelName={youtubeChannelName}
          />

          <QuickActions
            uploadInputRef={uploadInputRef}
            uploadedVideo={uploadedVideo}
            uploadTitle={uploadTitle}
            setUploadTitle={setUploadTitle}
            isRecording={isRecording}
            recordedVideo={recordedVideo}
            scheduleForm={scheduleForm}
            setScheduleForm={setScheduleForm}
            scheduleStatus={scheduleStatus}
            error={error}
            setError={setError}
            connectedChannels={connectedChannels}
            streamRef={streamRef}
            videoRef={videoRef}
            openUploadPicker={openUploadPicker}
            handleUploadSelected={handleUploadSelected}
            handleSendUploadedToChannels={handleSendUploadedToChannels}
            startRecording={startRecording}
            stopRecording={stopRecording}
            downloadRecording={downloadRecording}
            scheduleSession={scheduleSession}
            cancelSchedule={cancelSchedule}
          />

          <Analytics connectedChannels={connectedChannels} />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;