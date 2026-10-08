"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  BrowserMultiFormatReader,
  NotFoundException,
  BarcodeFormat,
  DecodeHintType,
} from "@zxing/library";
import {
  FiCamera,
  FiCheckCircle,
  FiXCircle,
  FiUser,
  FiTag,
  FiCalendar,
  FiClock,
  FiArrowLeft,
  FiAlertTriangle,
  FiLogOut,
  FiRefreshCw,
  FiSun,
} from "react-icons/fi";
import Link from "next/link";
import {
  useTicketVerification,
  useTicketCheckIn,
} from "../lib/hooks/useQRScanner";
import type { TicketDetails, QRData } from "../lib/hooks/useQRScanner";
import EnterCodeModal from "./modals/EnterCodeModal";
import LoadingSpinner from "./LoadingSpinner";
import { debug } from "../lib/utils/debug";
import type {
  ExtendedMediaTrackCapabilities,
  ExtendedMediaTrackConstraints,
  ExtendedSupportedConstraints,
} from "../lib/types/mediastream";

type ScannerState = "idle" | "scanning" | "processing" | "success" | "error";

// Constants
const CAMERA_SWITCH_DELAY_MS = 500;
const ERROR_MESSAGE_DURATION_MS = 2000;

// Helper Component for Ticket Details
const TicketDetailsDisplay = ({
  ticketDetails,
}: {
  ticketDetails: TicketDetails;
}) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="w-full">
      <h2 className="text-white-100 font-poppins-semibold text-xl mb-1">{ticketDetails.attendee_name}</h2>
      <p className="text-white-50 text-sm font-poppins mb-4">{ticketDetails.attendee_email}</p>

      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center gap-2 text-white-80 text-sm font-poppins">
          <FiTag size={16} className="text-white-50 shrink-0" />
          <span>
            Ticket{" "}
            {ticketDetails.order?.quantity && ticketDetails.order.quantity > 1
              ? `${ticketDetails.sequence_number || 1} of ${
                  ticketDetails.order.quantity
                }`
              : "1"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-white-80 text-sm font-poppins">
          <FiUser size={16} className="text-white-50 shrink-0" />
          <span>
            {ticketDetails.ticket_tier.name}
            {ticketDetails.metadata?.stage_name && (
              <span className="text-white-50">
                {" "}
                - {ticketDetails.metadata.stage_name}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 text-white-80 text-sm font-poppins">
          <FiCalendar size={16} className="text-white-50 shrink-0" />
          <span>{formatDate(ticketDetails.events.starts_at)}</span>
        </div>
        <div className="flex items-center gap-2 text-white-80 text-sm font-poppins">
          <FiClock size={16} className="text-white-50 shrink-0" />
          <span>{formatTime(ticketDetails.events.starts_at)}</span>
        </div>
      </div>

      <div className="bg-card border border-white-30 rounded-card p-3">
        <h3 className="text-white-100 font-poppins-semibold text-base">{ticketDetails.events.name}</h3>
        <p className="text-white-50 text-sm font-poppins">{ticketDetails.events.venue}</p>
      </div>
    </div>
  );
};

// Storage keys
const STORAGE_KEYS = {
  CODE: "qr_scanner_code",
  EVENT_ID: "qr_scanner_event_id",
  EVENT_NAME: "qr_scanner_event_name",
  DEVICE_ID: "qr-scanner-device-id",
};

const getCameraDisplayName = (label: string): string => {
  if (!label) return "Camera";

  const lower = label.toLowerCase();

  if (lower.includes("triple")) return "Back (Auto)";
  if (lower.includes("dual wide")) return "Back Dual Wide";
  if (lower.includes("dual")) return "Back Dual";
  if (lower.includes("ultra") && lower.includes("wide")) return "Ultra Wide";
  if (lower.includes("telephoto")) return "Telephoto";
  if (lower.includes("wide")) return "Wide";
  if (lower.includes("back") || lower.includes("environment") || lower.includes("rear")) {
    return "Back";
  }
  if (lower.includes("front") || lower.includes("user") || lower.includes("face")) {
    return "Front";
  }

  return label.replace(/\s*\([^)]*\)\s*$/, "").trim() || "Camera";
};

const isBackCamera = (label: string): boolean => {
  if (!label) return true;
  const lower = label.toLowerCase();
  if (lower.includes("front") || lower.includes("user") || lower.includes("face")) {
    return false;
  }
  if (lower.includes("desk view") || lower.includes("screen") || lower.includes("virtual")) {
    return false;
  }
  return true;
};

const isScanCapableCamera = (label: string): boolean => {
  if (!label) return true;
  const lower = label.toLowerCase();

  if (lower.includes("telephoto")) return false;

  if (lower.includes("triple")) return true;
  if (lower.includes("dual wide")) return true;
  if (lower.includes("ultra") && lower.includes("wide")) return true;

  if (lower.includes("dual")) return false;

  const isStandaloneWide =
    lower.includes("wide") &&
    !lower.includes("ultra") &&
    !lower.includes("dual") &&
    !lower.includes("triple");
  if (isStandaloneWide) return false;

  return true;
};

const filterUsableCameras = (devices: MediaDeviceInfo[]): MediaDeviceInfo[] => {
  const backOnly = devices.filter(d => isBackCamera(d.label));
  const scanCapable = backOnly.filter(d => isScanCapableCamera(d.label));
  if (scanCapable.length > 0) return scanCapable;
  if (backOnly.length > 0) return backOnly;
  return devices;
};

export default function QRScannerApp() {
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [cameraActive, setCameraActive] = useState(false);
  const [ticketDetails, setTicketDetails] = useState<TicketDetails | null>(
    null
  );
  const [isPromotionalTicket, setIsPromotionalTicket] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [deviceId, setDeviceId] = useState<string>("");
  const [justCheckedIn, setJustCheckedIn] = useState(false);

  // Camera control states
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>(
    []
  );
  const [currentCameraIndex, setCurrentCameraIndex] = useState<number>(0);
  const [currentCameraLabel, setCurrentCameraLabel] = useState<string>("");
  const [currentCameraRawLabel, setCurrentCameraRawLabel] = useState<string>("");
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef<boolean>(true);
  const cameraSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSwitchingCameraRef = useRef<boolean>(false);
  const errorMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Event Access State
  const [accessCode, setAccessCode] = useState<string>("");
  const [activeEventId, setActiveEventId] = useState<string>("");
  const [activeEventName, setActiveEventName] = useState<string>("");
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<string>("");
  const processingRef = useRef(false);

  // React Query mutations for QR Scanner operations
  const verifyTicketMutation = useTicketVerification();
  const checkInTicketMutation = useTicketCheckIn();

  // Check for stored event access code on load
  useEffect(() => {
    const restoreSession = async () => {
      const storedCode = sessionStorage.getItem(STORAGE_KEYS.CODE);
      const storedEventId = sessionStorage.getItem(STORAGE_KEYS.EVENT_ID);

      if (!storedCode || !storedEventId) {
        setIsRestoringSession(false);
        setShowCodeModal(true);
        return;
      }

      try {
        const res = await fetch("/api/qr-scanner/validate-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: storedCode }),
        });

        if (!res.ok) {
          throw new Error("Validation failed");
        }

        const data = await res.json();

        if (data.valid) {
          setAccessCode(storedCode);
          setActiveEventId(data.eventId);
          setActiveEventName(data.eventName);

          // Update storage with fresh data
          sessionStorage.setItem(STORAGE_KEYS.EVENT_ID, data.eventId);
          sessionStorage.setItem(STORAGE_KEYS.EVENT_NAME, data.eventName);
        } else {
          throw new Error("Invalid code");
        }
      } catch (error) {
        console.error("Session restoration failed:", error);
        // Clear invalid session
        sessionStorage.removeItem(STORAGE_KEYS.CODE);
        sessionStorage.removeItem(STORAGE_KEYS.EVENT_ID);
        sessionStorage.removeItem(STORAGE_KEYS.EVENT_NAME);

        setAccessCode("");
        setActiveEventId("");
        setActiveEventName("");
        setShowCodeModal(true);
      } finally {
        setIsRestoringSession(false);
      }
    };

    restoreSession();
  }, []);

  // Initialize with back camera on first mount
  useEffect(() => {
    const initializeCamera = async () => {
      let tempReader: BrowserMultiFormatReader | null = null;
      try {
        tempReader = new BrowserMultiFormatReader();
        const allDevices = await tempReader.listVideoInputDevices();
        const devices = filterUsableCameras(allDevices);

        const preferredOrder = [
          (l: string) => l.includes("triple"),
          (l: string) => l.includes("dual wide"),
          (l: string) => l.includes("dual"),
          (l: string) => l.includes("back") && l.includes("wide") && !l.includes("ultra"),
          (l: string) => l.includes("back") || l.includes("environment") || l.includes("rear"),
        ];

        let preferredIndex = -1;
        for (const matcher of preferredOrder) {
          preferredIndex = devices.findIndex(d => matcher(d.label.toLowerCase()));
          if (preferredIndex !== -1) break;
        }

        if (preferredIndex !== -1) {
          debug("Initializing with preferred camera at index:", preferredIndex, devices[preferredIndex].label);
          setCurrentCameraIndex(preferredIndex);
          setCurrentCameraLabel(getCameraDisplayName(devices[preferredIndex].label));
          setCurrentCameraRawLabel(devices[preferredIndex].label);
        }
        setAvailableCameras(devices);
      } catch (error) {
        console.error("Failed to initialize camera:", error);
      } finally {
        if (tempReader) {
          tempReader.reset();
        }
      }
    };

    initializeCamera();
  }, []); // Run once on mount

  const handleCodeSuccess = (
    code: string,
    eventId: string,
    eventName: string
  ) => {
    setAccessCode(code);
    setActiveEventId(eventId);
    setActiveEventName(eventName);
    sessionStorage.setItem(STORAGE_KEYS.CODE, code);
    sessionStorage.setItem(STORAGE_KEYS.EVENT_ID, eventId);
    sessionStorage.setItem(STORAGE_KEYS.EVENT_NAME, eventName);
    setShowCodeModal(false);
  };

  const handleChangeEvent = () => {
    sessionStorage.removeItem(STORAGE_KEYS.CODE);
    sessionStorage.removeItem(STORAGE_KEYS.EVENT_ID);
    sessionStorage.removeItem(STORAGE_KEYS.EVENT_NAME);
    setAccessCode("");
    setActiveEventId("");
    setActiveEventName("");

    // Reset scanner state
    resetScanner();
    stopScanning();
    setShowCodeModal(true);
  };

  // Generate unique device ID for tracking
  useEffect(() => {
    const storedDeviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (storedDeviceId) {
      setDeviceId(storedDeviceId);
    } else {
      const newDeviceId = `scanner-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`;
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, newDeviceId);
      setDeviceId(newDeviceId);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      // Clear any pending camera switch timeout
      if (cameraSwitchTimeoutRef.current) {
        clearTimeout(cameraSwitchTimeoutRef.current);
        cameraSwitchTimeoutRef.current = null;
      }

      // Clear any pending error message timeout
      if (errorMessageTimeoutRef.current) {
        clearTimeout(errorMessageTimeoutRef.current);
        errorMessageTimeoutRef.current = null;
      }

      // Stop video stream tracks to release camera
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => {
          track.stop();
          debug("Stopped track on unmount:", track.label);
        });
        videoStreamRef.current = null;
      }

      // Also clear video element srcObject if present
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject = null;
      }

      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
    };
  }, []);

  const stopScanning = useCallback(() => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
    }

    // Stop video stream tracks
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(track => track.stop());
      videoStreamRef.current = null;
    }

    // Reset torch state
    setTorchEnabled(false);
    setTorchSupported(false);

    setCameraActive(false);
  }, []);

  // Listen for device changes (hot-plugging cameras)
  useEffect(() => {
    const handleDeviceChange = async () => {
      debug("=== DEVICE CHANGE DETECTED ===");

      if (!navigator.mediaDevices || !codeReaderRef.current) {
        return;
      }

      try {
        const allDevices = await codeReaderRef.current.listVideoInputDevices();
        const devices = filterUsableCameras(allDevices);
        debug("Updated camera list:", devices.length, "cameras found");
        setAvailableCameras(devices);

        // Check if current camera still exists
        if (videoStreamRef.current) {
          const currentTrack = videoStreamRef.current.getVideoTracks()[0];
          const currentDeviceId = currentTrack?.getSettings()?.deviceId;

          if (currentDeviceId) {
            const stillExists = devices.some(
              d => d.deviceId === currentDeviceId
            );

            if (!stillExists) {
              debug("Current camera disconnected, stopping scanner");
              stopScanning();
              setErrorMessage(
                "Camera disconnected. Please click Activate Camera to restart."
              );
              setScannerState("error");
            }
          }
        }
      } catch (error) {
        console.error("Failed to update camera list on device change:", error);
      }
    };

    // Register device change listener
    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener(
        "devicechange",
        handleDeviceChange
      );
      debug("Device change listener registered");
    }

    // Cleanup listener on unmount
    return () => {
      if (navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener(
          "devicechange",
          handleDeviceChange
        );
        debug("Device change listener removed");
      }
    };
  }, [stopScanning]);

  // Validate QR Data structure silently
  const validateQRData = (qrText: string): boolean => {
    try {
      const qrData: QRData = JSON.parse(qrText);

      // Check promotional ticket format
      const isPromotional = !qrData.orderId && qrData.qrToken;

      if (isPromotional) {
        if (!qrData.eventId || !qrData.qrToken) {
          console.warn(
            "Scanned valid JSON but missing promotional fields. Ignoring."
          );
          return false;
        }
        return true;
      }

      // Check regular ticket format
      if (!qrData.orderId || !qrData.eventId || !qrData.ticketNumber) {
        console.warn(
          "Scanned valid JSON but missing regular ticket fields. Ignoring."
        );
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  };

  const handleQRCodeDetected = (qrText: string) => {
    if (!validateQRData(qrText)) {
      return false;
    }

    // Set processing flag immediately
    processingRef.current = true;

    debug("=== VALID QR CODE DETECTED ===");

    // Haptic Feedback (Industry Standard)
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(200);
    }

    // Update State & Stop Scanner
    setScannerState("processing");
    stopScanning();

    // Check if deviceId is available
    if (!deviceId) {
      console.error("Device ID not initialized");
      setErrorMessage("Device ID not initialized. Please refresh the page.");
      setScannerState("error");
      return false;
    }

    // Parse again (safe now because validateQRData passed)
    const qrData: QRData = JSON.parse(qrText);
    const isPromotional = !qrData.orderId && qrData.qrToken;

    // Check if ticket belongs to the selected event
    if (activeEventId && qrData.eventId !== activeEventId) {
      console.error("Ticket event mismatch");
      setErrorMessage("This ticket is not for the selected event.");
      setScannerState("error");
      return false;
    }

    verifyTicketMutation.mutate(
      { qrData, deviceId, accessCode },
      {
        onSuccess: data => {
          debug("Verification successful");
          setTicketDetails(data.ticket);
          setIsPromotionalTicket(data.isPromotionalTicket);
          setScannerState("success");
        },
        onError: error => {
          console.error("Verification failed:", error.message);
          setErrorMessage(error.message || "Failed to verify ticket");
          setScannerState("error");
        },
      }
    );

    return true;
  };

  // Toggle torch/flashlight
  const toggleTorch = async () => {
    if (!videoStreamRef.current) {
      console.warn("No video stream available for torch toggle");
      return;
    }

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getSupportedConstraints
    ) {
      console.warn("MediaDevices API not available");
      return;
    }

    const supportedConstraints =
      navigator.mediaDevices.getSupportedConstraints() as ExtendedSupportedConstraints;
    if (!supportedConstraints.torch) {
      console.warn("Torch constraint not supported by browser");
      return;
    }

    try {
      const videoTrack = videoStreamRef.current.getVideoTracks()[0];
      if (!videoTrack) {
        console.error("No video track available");
        return;
      }

      const capabilities =
        videoTrack.getCapabilities() as ExtendedMediaTrackCapabilities;
      debug("Video track capabilities:", capabilities);

      if (!capabilities.torch) {
        console.warn("Torch not supported by current camera");
        setErrorMessage("Flash not supported on this camera");
        if (errorMessageTimeoutRef.current) {
          clearTimeout(errorMessageTimeoutRef.current);
        }
        errorMessageTimeoutRef.current = setTimeout(() => {
          setErrorMessage("");
          errorMessageTimeoutRef.current = null;
        }, ERROR_MESSAGE_DURATION_MS);
        return;
      }

      try {
        const torchConstraints: ExtendedMediaTrackConstraints = {
          advanced: [{ torch: !torchEnabled }],
        };
        await videoTrack.applyConstraints(
          torchConstraints as MediaTrackConstraints
        );
        setTorchEnabled(!torchEnabled);
        debug("Torch toggled successfully to:", !torchEnabled);
      } catch (constraintError) {
        console.error("Failed to apply torch constraint:", constraintError);
        try {
          const fallbackConstraints: ExtendedMediaTrackConstraints = {
            torch: !torchEnabled,
          };
          await videoTrack.applyConstraints(
            fallbackConstraints as MediaTrackConstraints
          );
          setTorchEnabled(!torchEnabled);
          debug("Torch toggled successfully (fallback) to:", !torchEnabled);
        } catch (fallbackError) {
          console.error("Fallback torch toggle also failed:", fallbackError);
          setErrorMessage("Failed to toggle flash");
          if (errorMessageTimeoutRef.current) {
            clearTimeout(errorMessageTimeoutRef.current);
          }
          errorMessageTimeoutRef.current = setTimeout(() => {
            setErrorMessage("");
            errorMessageTimeoutRef.current = null;
          }, ERROR_MESSAGE_DURATION_MS);
        }
      }
    } catch (error) {
      console.error("Failed to toggle torch:", error);
    }
  };

  const startScanning = useCallback(async () => {
    debug("=== STARTING QR SCANNER ===");
    try {
      if (!deviceId) {
        setErrorMessage("Device ID not ready. Please wait a moment.");
        setScannerState("error");
        return;
      }

      if (!activeEventId) {
        setErrorMessage("No event selected. Please enter an access code.");
        setShowCodeModal(true);
        return;
      }

      if (
        typeof window !== "undefined" &&
        window.location.protocol !== "https:" &&
        !window.location.hostname.includes("localhost")
      ) {
        setErrorMessage("Camera access requires HTTPS.");
        setScannerState("error");
        return;
      }

      setScannerState("scanning");
      setCameraActive(true);
      setErrorMessage("");

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera access not supported");
      }

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);

      if (!codeReaderRef.current) {
        codeReaderRef.current = new BrowserMultiFormatReader(hints);
      }

      const allInputDevices =
        await codeReaderRef.current.listVideoInputDevices();
      const videoInputDevices = filterUsableCameras(allInputDevices);

      if (videoInputDevices.length === 0) {
        throw new Error("No camera devices found.");
      }

      debug("Found cameras:", videoInputDevices.length, videoInputDevices.map(d => d.label));

      setAvailableCameras(videoInputDevices);

      const actualIndex = currentCameraIndex % videoInputDevices.length;
      const selectedCamera = videoInputDevices[actualIndex];
      const selectedDeviceId = selectedCamera.deviceId;
      debug("Using camera:", selectedCamera.label, "at index", actualIndex);

      setCurrentCameraLabel(getCameraDisplayName(selectedCamera.label));
      setCurrentCameraRawLabel(selectedCamera.label);

      const videoConstraints: ExtendedMediaTrackConstraints = {
        deviceId: { exact: selectedDeviceId },
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [
          {
            focusMode: "continuous",
            focusDistance: 0,
          },
        ],
      };

      const constraints: MediaStreamConstraints = {
        video: videoConstraints as MediaTrackConstraints,
      };

      if (!codeReaderRef.current) {
        console.error("Code reader not initialized");
        throw new Error("Code reader not initialized");
      }

      if (!videoRef.current) {
        console.error("Video element not available");
        throw new Error("Video element not mounted");
      }

      await codeReaderRef.current.decodeFromConstraints(
        constraints,
        videoRef.current,
        (result: any, error: any) => {
          if (result) {
            const qrText = result.getText();

            if (processingRef.current) return;
            if (lastScanRef.current === qrText) return;

            const isValid = handleQRCodeDetected(qrText);

            if (isValid) {
              lastScanRef.current = qrText;
            }
          }
        }
      );

      if (videoRef.current && videoRef.current.srcObject) {
        videoStreamRef.current = videoRef.current.srcObject as MediaStream;

        const videoTrack = videoStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities =
            videoTrack.getCapabilities() as ExtendedMediaTrackCapabilities;
          if (capabilities.torch) {
            setTorchSupported(true);
          } else {
            setTorchSupported(false);
          }
        }
      }
    } catch (error) {
      console.error("Failed to start camera:", error);
      let msg = "Failed to access camera. ";
      if (error instanceof Error) msg += error.message;
      setErrorMessage(msg);
      setScannerState("error");
      setCameraActive(false);
    }
  }, [deviceId, activeEventId, accessCode, currentCameraIndex]);

  // Handle camera switching
  useEffect(() => {
    if (!isSwitchingCameraRef.current) {
      return;
    }

    debug("Camera index changed, restarting scanning after delay...");

    if (cameraSwitchTimeoutRef.current) {
      clearTimeout(cameraSwitchTimeoutRef.current);
    }

    cameraSwitchTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        debug("Starting scanning with new camera index:", currentCameraIndex);
        startScanning();
      }
      isSwitchingCameraRef.current = false;
      cameraSwitchTimeoutRef.current = null;
    }, CAMERA_SWITCH_DELAY_MS);

    return () => {
      if (cameraSwitchTimeoutRef.current) {
        clearTimeout(cameraSwitchTimeoutRef.current);
        cameraSwitchTimeoutRef.current = null;
      }
    };
  }, [currentCameraIndex, startScanning]);

  // Switch to next available camera
  const switchCamera = useCallback(() => {
    debug("=== SWITCHING CAMERA ===");

    if (isSwitchingCameraRef.current) {
      debug("Already switching camera, ignoring");
      return;
    }

    stopScanning();

    isSwitchingCameraRef.current = true;

    setCurrentCameraIndex(prev => {
      const nextIndex = prev + 1;
      debug("Switching to camera index:", nextIndex);
      return nextIndex;
    });
  }, [stopScanning]);

  const confirmCheckIn = () => {
    if (!ticketDetails) return;

    checkInTicketMutation.mutate(
      { ticketId: ticketDetails.id, deviceId, isPromotionalTicket, accessCode },
      {
        onSuccess: data => {
          setJustCheckedIn(true);
          setTicketDetails({
            ...ticketDetails,
            checked_in_at: data.checked_in_at,
          });
        },
        onError: error => {
          setErrorMessage(error.message || "Failed to check in");
          setScannerState("error");
        },
      }
    );
  };

  const resetScanner = () => {
    setTicketDetails(null);
    setIsPromotionalTicket(false);
    setErrorMessage("");
    setScannerState("idle");
    setJustCheckedIn(false);
    lastScanRef.current = "";
    processingRef.current = false;
    setTorchEnabled(false);
    setTorchSupported(false);
  };

  // After a scan result, return straight to the live camera scanner (matches
  // mobile) instead of the "Activate Camera" idle screen — the camera was
  // stopped on the hit, so we clear the result and restart scanning in one step.
  const handleScanNext = () => {
    resetScanner();
    startScanning();
  };

  if (isRestoringSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner
          title="Restoring Session..."
          fullHeight={true}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <EnterCodeModal
        isOpen={showCodeModal}
        onSuccess={handleCodeSuccess}
        onClose={() => setShowCodeModal(false)}
      />

      {/* Header */}
      <div className="max-w-[800px] mx-auto px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <Link href="/organizer" className="flex items-center gap-2 text-white-50 hover:text-white-100 transition-colors text-sm font-poppins">
            <FiArrowLeft size={20} />
            <span>Back to Dashboard</span>
          </Link>
          {activeEventId && (
            <button
              onClick={handleChangeEvent}
              className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-4 py-1.5 text-xs hover:bg-white-10 transition-colors flex items-center gap-1.5"
            >
              <FiLogOut size={14} />
              Change Event
            </button>
          )}
        </div>
        <h1 className="text-white-100 font-poppins-bold text-2xl">QR Code Scanner</h1>
        {activeEventName && (
          <p className="text-white-50 text-sm font-poppins mt-1">{activeEventName}</p>
        )}
        {!activeEventName && <p className="text-white-50 text-sm font-poppins mt-1">Verify and check in attendees</p>}
      </div>

      {/* Scanner Interface */}
      <div className="max-w-[800px] mx-auto px-4 pb-8">
        {scannerState === "idle" && (
          <div className="bg-card border border-white-30 rounded-card p-8 flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 rounded-full bg-white-10 flex items-center justify-center">
              <FiCamera size={40} className="text-white-50" />
            </div>
            <h2 className="text-white-100 font-poppins-semibold text-xl">Ready to Scan</h2>
            <p className="text-white-50 text-sm font-poppins max-w-sm">
              Activate your camera to verify and check in attendees with their
              ticket QR codes
            </p>
            {deviceId ? (
              <button
                onClick={startScanning}
                className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-3 hover:opacity-90 transition-opacity mt-2"
              >
                Activate Camera
              </button>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <p className="text-white-50 text-sm font-poppins">Initializing scanner...</p>
                <div className="animate-spin rounded-full w-6 h-6 border-2 border-white-20 border-t-white-100" />
              </div>
            )}
          </div>
        )}

        {scannerState === "scanning" && (
          <div className="flex flex-col gap-4">
            <div className="relative rounded-card overflow-hidden bg-black aspect-square max-w-[480px] mx-auto w-full">
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-2/3 h-2/3 border-2 border-white-100/50 rounded-2xl" />
              </div>

              <div
                className="absolute top-3 left-3 bg-black/60 text-white-100 text-xs font-poppins-medium px-2.5 py-1 rounded-pill max-w-[60%] truncate"
                title={currentCameraRawLabel || "Camera"}
              >
                {currentCameraLabel || "Camera"}
              </div>

              {/* Camera Switch Button */}
              {availableCameras.length > 1 && (
                <button
                  onClick={switchCamera}
                  className="absolute top-3 right-3 bg-black/60 text-white-100 w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                  title="Switch Camera"
                  aria-label="Switch Camera"
                >
                  <FiRefreshCw size={20} />
                </button>
              )}

              {/* Torch Button */}
              <button
                onClick={toggleTorch}
                className={`absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  torchEnabled
                    ? "bg-yellow-400 text-dark"
                    : "bg-black/60 text-white-100 hover:bg-black/80"
                } ${!torchSupported ? "opacity-30 cursor-not-allowed" : ""}`}
                disabled={!torchSupported}
                title={
                  !torchSupported
                    ? "Flash not supported on this camera"
                    : torchEnabled
                    ? "Turn Off Flash"
                    : "Turn On Flash"
                }
                aria-label={
                  !torchSupported
                    ? "Flash not supported on this camera"
                    : torchEnabled
                    ? "Turn Off Flash"
                    : "Turn On Flash"
                }
              >
                <FiSun size={20} />
              </button>
            </div>
            <div className="flex justify-center">
              <button
                onClick={() => {
                  stopScanning();
                  setScannerState("idle");
                  processingRef.current = false;
                }}
                className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-2.5 text-sm hover:bg-white-10 transition-colors flex items-center gap-2"
              >
                <FiXCircle size={18} />
                Cancel
              </button>
            </div>
          </div>
        )}

        {scannerState === "processing" && (
          <div className="bg-card border border-white-30 rounded-card p-8 flex flex-col items-center text-center gap-4">
            <div className="animate-spin rounded-full w-10 h-10 border-2 border-white-20 border-t-white-100" />
            <h2 className="text-white-100 font-poppins-semibold text-xl">Verifying Ticket...</h2>
            <p className="text-white-50 text-sm font-poppins">Please wait while we validate the QR code</p>
          </div>
        )}

        {scannerState === "success" &&
          ticketDetails &&
          (justCheckedIn ? (
            <div className="bg-card border border-green-500/30 rounded-card p-8 flex flex-col items-center text-center gap-4">
              <FiCheckCircle size={64} className="text-green-400" />
              <h2 className="text-white-100 font-poppins-semibold text-xl">Check-In Confirmed!</h2>
              <TicketDetailsDisplay ticketDetails={ticketDetails} />
              <button
                onClick={handleScanNext}
                className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-3 hover:opacity-90 transition-opacity flex items-center gap-2 mt-2"
              >
                <FiCheckCircle size={18} />
                Scan Next Ticket
              </button>
            </div>
          ) : (
            <div className={`bg-card border rounded-card p-8 flex flex-col items-center text-center gap-4 ${
              ticketDetails.checked_in_at ? "border-yellow-500/30" : "border-green-500/30"
            }`}>
              {ticketDetails.checked_in_at ? (
                <FiAlertTriangle size={64} className="text-yellow-400" />
              ) : (
                <FiCheckCircle size={64} className="text-green-400" />
              )}

              <TicketDetailsDisplay ticketDetails={ticketDetails} />

              {ticketDetails.checked_in_at ? (
                <div className="flex flex-col items-center gap-3 w-full">
                  <p className="text-yellow-400 text-sm font-poppins-medium">
                    Already checked in at{" "}
                    {new Date(ticketDetails.checked_in_at).toLocaleString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      }
                    )}
                  </p>
                  <button
                    onClick={handleScanNext}
                    className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-3 hover:opacity-90 transition-opacity flex items-center gap-2"
                  >
                    <FiCheckCircle size={18} />
                    Scan Next Ticket
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                  <button
                    onClick={confirmCheckIn}
                    className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-3 hover:opacity-90 transition-opacity flex items-center gap-2 w-full sm:w-auto justify-center"
                    disabled={checkInTicketMutation.isPending}
                  >
                    <FiCheckCircle size={18} />
                    {checkInTicketMutation.isPending
                      ? "Checking In..."
                      : "Confirm Check-In"}
                  </button>
                  <button
                    onClick={handleScanNext}
                    className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-3 hover:bg-white-10 transition-colors flex items-center gap-2 w-full sm:w-auto justify-center"
                    disabled={checkInTicketMutation.isPending}
                  >
                    <FiXCircle size={18} />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}

        {scannerState === "error" && (
          <div className="bg-card border border-red-500/30 rounded-card p-8 flex flex-col items-center text-center gap-4">
            <FiXCircle size={64} className="text-red-400" />
            <h2 className="text-white-100 font-poppins-semibold text-xl">Scan Failed</h2>
            <p className="text-red-400 text-sm font-poppins">{errorMessage}</p>

            {errorMessage.includes("Camera permission") && (
              <div className="bg-card border border-white-30 rounded-card p-4 text-left w-full">
                <h3 className="text-white-100 font-poppins-semibold text-sm mb-2">Mobile Camera Access:</h3>
                <ul className="text-white-50 text-xs font-poppins flex flex-col gap-1">
                  <li>Tap the camera icon in your browser&apos;s address bar</li>
                  <li>Select &quot;Allow&quot; when prompted for camera access</li>
                  <li>Try refreshing the page if no prompt appears</li>
                  <li>For iOS: Use Safari browser for better compatibility</li>
                </ul>
              </div>
            )}

            {errorMessage.includes("HTTPS") && (
              <div className="bg-card border border-white-30 rounded-card p-4 text-left w-full">
                <h3 className="text-white-100 font-poppins-semibold text-sm mb-2">Secure Connection Required:</h3>
                <p className="text-white-50 text-xs font-poppins">
                  Camera access requires HTTPS. Please access this page through
                  a secure connection or deploy to a hosting service.
                </p>
              </div>
            )}

            <button
              onClick={resetScanner}
              className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-3 hover:opacity-90 transition-opacity mt-2"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
