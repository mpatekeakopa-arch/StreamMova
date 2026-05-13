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

  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState("");
  const [liveStatus, setLiveStatus] = useState("");

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

  const toggleSidebar = () => setIsSidebarOpen((s) => !s);
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

    const alreadyConnected = connectedChannels.some(
      (c) => c.platform === channelForm.platform
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

    await new Promise((r) => setTimeout(r, 700));

    const newChannel = {
      id: Date.now(),
      platform: platform.id,
      name: platform.name,
      icon: platform.icon,
      color: platform.color,
      logo: platform.logo,
      streamKey: "",
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
    setConnectedChannels((prev) =>
      prev.filter((channel) => channel.id !== channelIdToRemove)
    );
  };

  const openCamera = async () => {
    try {
      setError("");

      if (
        cameraStream &&
        cameraStream.getTracks().some((t) => t.readyState === "live")
      ) {
        return cameraStream;
      }

      const preferred = {
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: true,
      };

      let stream = null;

      try {
        stream = await navigator.mediaDevices.getUserMedia(preferred);
      } catch (err) {
        console.error("openCamera failed:", err);

        const debug = `${err?.name || "Error"}: ${
          err?.message || String(err)
        }`;

        const msg =
          err?.name === "NotAllowedError"
            ? "Permission denied. Please allow camera and microphone access."
            : err?.name === "NotFoundError"
            ? "No camera found on this device."
            : err?.name === "NotReadableError"
            ? "Camera is already in use by another app. Close other apps using the camera and try again."
            : err?.name === "OverconstrainedError"
            ? "Camera settings not supported on this phone. Try again."
            : `Unable to access camera/microphone. (${debug})`;

        setError(msg);
        setIsCameraOn(false);
        setIsStreaming(false);
        setCameraStream(null);
        streamRef.current = null;
        return null;
      }

      setCameraStream(stream);
      streamRef.current = stream;
      setIsCameraOn(true);

      return stream;
    } catch (err) {
      console.error("openCamera failed:", err);
      setError("Unable to access camera or microphone. Please allow permissions.");
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

    const s = streamRef.current || cameraStream;
    if (s) s.getTracks().forEach((t) => t.stop());

    streamRef.current = null;
    setCameraStream(null);
    setIsCameraOn(false);
  };

  const startFacebookLive = async () => {
    setError("");
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
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.message || "Failed to start live stream");
    }

    setIsStreaming(true);
    setLiveStatus(`Facebook Live started. Video ID: ${data.liveVideoId}`);
    return data;
  };

  const stopFacebookLive = async () => {
    setLiveStatus("Stopping Facebook Live…");

    const response = await fetch(`${API_BASE_URL}/api/facebook/live/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channelId,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.message || "Failed to stop live stream");
    }

    setIsStreaming(false);
    setLiveStatus("Facebook Live stopped.");
    return data;
  };

  const closeCamera = async () => {
    try {
      if (isStreaming) {
        await stopFacebookLive();
      }
    } catch (err) {
      console.error("stop live failed:", err);
      setError(err.message || "Failed to stop Facebook Live.");
    } finally {
      stopCameraOnly();
      setIsStreaming(false);
    }
  };

  const handleStreamToggle = async () => {
    try {
      setError("");

      if (!isStreaming) {
        const stream = await openCamera();
        if (!stream) return;

        await startFacebookLive();
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
      setError("Please select a video file (mp4, webm, mov, etc.).");
      e.target.value = "";
      return;
    }

    if (uploadedVideo?.url) URL.revokeObjectURL(uploadedVideo.url);

    const url = URL.createObjectURL(file);

    setUploadedVideo({
      file,
      url,
      name: file.name,
      size: file.size,
      type: file.type,
    });

    setUploadTitle((prev) => prev || file.name.replace(/\.[^.]+$/, ""));

    if (isCameraOn || isStreaming) closeCamera();

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
      setError('Turn on the camera first by clicking "Go Live".');
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

      const mimeType = candidates.find((t) =>
        window.MediaRecorder?.isTypeSupported?.(t)
      );

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };

      mr.onstop = () => {
        const blob = new Blob(recordChunksRef.current, {
          type: mr.mimeType || "video/webm",
        });

        recordChunksRef.current = [];

        if (recordedVideo?.url) URL.revokeObjectURL(recordedVideo.url);

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

      mediaRecorderRef.current = mr;
      mr.start(1000);
      setIsRecording(true);
    } catch (e) {
      console.error(e);
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

    const a = document.createElement("a");
    a.href = recordedVideo.url;
    a.download = recordedVideo.name || "recording.webm";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;

    const res = await Notification.requestPermission();
    return res === "granted";
  };

  const showScheduleNotification = async (title) => {
    const ok = await requestNotificationPermission();

    if (ok) {
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
    return () => {
      const s = streamRef.current || cameraStream;
      if (s) s.getTracks().forEach((t) => t.stop());

      streamRef.current = null;

      if (uploadedVideo?.url) URL.revokeObjectURL(uploadedVideo.url);
      if (recordedVideo?.url) URL.revokeObjectURL(recordedVideo.url);
      if (scheduleTimeoutRef.current) clearTimeout(scheduleTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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