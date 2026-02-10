import React, { useEffect, useMemo, useRef, useState } from "react";
import "./Dashboard.css";
import { getInitials, readUserFromStorage } from "./utils/helpers";
import { availablePlatforms } from "./utils/constants";
import StreamOutput from "./StreamOutput/StreamOutput";
import QuickActions from "./QuickActions/QuickActions";
import ChannelModal from "./ChannelModal/ChannelModal";
import Sidebar from "./Sidebar/Sidebar";
import Header from "./Header/Header";
import Analytics from "./Analytics/Analytics";

function Dashboard() {
  // Sidebar open/close (hamburger hides/shows)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [isStreaming, setIsStreaming] = useState(false);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState("");

  // Logged-in user UI (from localStorage by default)
  const [user, setUser] = useState(() => readUserFromStorage());

  const [showChannelModal, setShowChannelModal] = useState(false);
  const [connectedChannels, setConnectedChannels] = useState([]);

  const [channelForm, setChannelForm] = useState({
    platform: "",
    streamKey: "",
    title: "",
    testStatus: "idle", // "idle" | "testing" | "connected" | "failed"
    testMessage: "",
  });

  // Upload / Record / Schedule state
  const uploadInputRef = useRef(null);
  const [uploadedVideo, setUploadedVideo] = useState(null);
  const [uploadTitle, setUploadTitle] = useState("");

  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState(null);

  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    startAtLocal: "", // "YYYY-MM-DDTHH:mm"
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

  // If user changes in localStorage (e.g., after login), reflect it
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "user") setUser(readUserFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const displayName =
    user?.displayName || user?.name || user?.fullName || user?.email || "User";
  const planName = user?.plan || user?.subscription || user?.tier || "Free Plan";
  const avatarInitials = useMemo(() => getInitials(displayName), [displayName]);

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
    if (!channelForm.platform || !channelForm.streamKey) {
      setChannelForm((prev) => ({
        ...prev,
        testStatus: "failed",
        testMessage: "Select a platform and enter a stream key/RTMP URL first.",
      }));
      return;
    }

    const platform = availablePlatforms.find((p) => p.id === channelForm.platform);

    const alreadyConnected = connectedChannels.some((c) => c.platform === channelForm.platform);
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

    await new Promise((r) => setTimeout(r, 900));

    const ok = String(channelForm.streamKey).trim().length >= 8;
    if (!ok) {
      setChannelForm((prev) => ({
        ...prev,
        testStatus: "failed",
        testMessage: "Connection failed. Stream key/URL looks invalid.",
      }));
      return;
    }

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

  const handleRemoveChannel = (channelId) => {
    setConnectedChannels((prev) => prev.filter((channel) => channel.id !== channelId));
  };

  // ============ Camera/Stream Functions ============
  const startCamera = async () => {
    try {
      setError("");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: "user",
        },
        audio: true,
      });

      streamRef.current = stream;
      setIsCameraOn(true);
      setIsStreaming(true);
    } catch (err) {
      console.error(err);
      setError("Unable to access camera or microphone. Please allow permissions.");
      setIsCameraOn(false);
      setIsStreaming(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;

    setIsCameraOn(false);
    setIsStreaming(false);
  };

  const handleStreamToggle = () => {
    if (!isStreaming) startCamera();
    else stopCamera();
  };

  // ============ Upload Functions ============
  const openUploadPicker = () => {
    setError("");
    uploadInputRef.current?.click();
  };

  const handleUploadSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic validation
    if (!file.type.startsWith("video/")) {
      setError("Please select a video file (mp4, webm, mov, etc.).");
      e.target.value = "";
      return;
    }

    // revoke previous
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

    // Preview uploaded video in the same preview pane (stop camera if running)
    if (isCameraOn || isStreaming) stopCamera();
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
    if (connectedChannels.length === 0) {
      setError("Connect at least one channel first.");
      return;
    }

    alert(
      `Ready to send "${uploadedVideo.name}" to ${connectedChannels.length} channel(s).\n\nNext step: connect this button to your backend (SRS/FFmpeg) to push to RTMP endpoints.`
    );
  };

  // ============ Recording Functions ============
  const startRecording = () => {
    setError("");

    const stream = streamRef.current;
    if (!stream) {
      setError('Turn on the camera first (click "Start Multistream") to record the session.');
      return;
    }

    if (isRecording) return;

    try {
      recordChunksRef.current = [];

      // Try common mime types in order
      const candidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType = candidates.find((t) => window.MediaRecorder?.isTypeSupported?.(t));
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };

      mr.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: mr.mimeType || "video/webm" });
        recordChunksRef.current = [];

        // revoke previous
        if (recordedVideo?.url) URL.revokeObjectURL(recordedVideo.url);

        const url = URL.createObjectURL(blob);
        const name = `streammova-recording-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.webm`;

        setRecordedVideo({ blob, url, name });

        // Preview recording in the same video element (optional)
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
      mr.start(1000); // collect chunks every ~1s
      setIsRecording(true);
    } catch (e) {
      console.error(e);
      setError("Recording is not supported in this browser, or permission was denied.");
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

  // ============ Schedule Functions ============
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
        body: title ? `It's time to start: ${title}` : "It's time to start streaming!",
      });
    } else {
      // fallback
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

    // Convert local datetime to epoch ms
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

    // Clear previous schedule
    if (scheduleTimeoutRef.current) {
      clearTimeout(scheduleTimeoutRef.current);
      scheduleTimeoutRef.current = null;
    }

    setScheduleStatus({
      active: true,
      message: `Scheduled for ${new Date(startMs).toLocaleString()}`,
      startAtMs: startMs,
    });

    // Set timeout to notify at the scheduled time
    scheduleTimeoutRef.current = setTimeout(async () => {
      await showScheduleNotification(title);
      setScheduleStatus({
        active: false,
        message: "Schedule triggered.",
        startAtMs: null,
      });
      scheduleTimeoutRef.current = null;
    }, startMs - now);

    // Ask permission early (better UX)
    await requestNotificationPermission();
  };

  const cancelSchedule = () => {
    if (scheduleTimeoutRef.current) {
      clearTimeout(scheduleTimeoutRef.current);
      scheduleTimeoutRef.current = null;
    }
    setScheduleStatus({ active: false, message: "Schedule cancelled.", startAtMs: null });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (uploadedVideo?.url) URL.revokeObjectURL(uploadedVideo.url);
      if (recordedVideo?.url) URL.revokeObjectURL(recordedVideo.url);
      if (scheduleTimeoutRef.current) clearTimeout(scheduleTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setShowChannelModal(false);
      }
    };

    if (showChannelModal) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showChannelModal]);

  return (
    <div className={`streammova-app ${isSidebarOpen ? "" : "sidebar-collapsed"}`}>
      {/* Channel Modal Popup */}
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
          user={user}
        />

        <div className="dashboard-content">
          {/* LEFT COLUMN: Stream output */}
          <StreamOutput
            isStreaming={isStreaming}
            isCameraOn={isCameraOn}
            error={error}
            uploadedVideo={uploadedVideo}
            recordedVideo={recordedVideo}
            videoRef={videoRef}
            streamRef={streamRef}
            connectedChannels={connectedChannels}
            handleStreamToggle={handleStreamToggle}
            handleOpenChannelModal={handleOpenChannelModal}
            handleRemoveChannel={handleRemoveChannel}
          />

          {/* MIDDLE CARD: Quick Actions */}
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

          {/* RIGHT COLUMN: Analytics */}
          <Analytics connectedChannels={connectedChannels} />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;