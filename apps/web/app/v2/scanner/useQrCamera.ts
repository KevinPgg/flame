"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type CameraState = "off" | "starting" | "on" | "error";

/**
 * Camera + QR decoding (zxing, already used by the v1 scanner). `onText` fires for every QR read;
 * callers ignore repeats. Stops the camera when `active` turns false or on unmount.
 */
export function useQrCamera(videoRef: RefObject<HTMLVideoElement | null>, active: boolean, onText: (text: string) => void) {
  const [state, setState] = useState<CameraState>("off");
  const [error, setError] = useState<"camera" | "https" | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torch, setTorch] = useState(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!active) {
      setState("off");
      return;
    }
    if (typeof window !== "undefined" && window.location.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
      setError("https");
      setState("error");
      return;
    }
    let cancelled = false;
    let reader: { reset: () => void } | null = null;
    setState("starting");
    setError(null);
    (async () => {
      const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import("@zxing/library");
      if (cancelled || !videoRef.current) return;
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
      const r = new BrowserMultiFormatReader(hints);
      reader = r;
      await r.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        videoRef.current,
        (result) => {
          if (result && !cancelled) onTextRef.current(result.getText());
        }
      );
      if (cancelled) return r.reset();
      const stream = (videoRef.current?.srcObject as MediaStream | null) ?? null;
      streamRef.current = stream;
      const track = stream?.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
      setTorchSupported(Boolean(caps.torch));
      setState("on");
    })().catch(() => {
      if (cancelled) return;
      setError("camera");
      setState("error");
    });
    return () => {
      cancelled = true;
      try {
        reader?.reset();
      } catch {
        /* camera already gone */
      }
      streamRef.current = null;
      setTorch(false);
      setTorchSupported(false);
    };
  }, [active, videoRef]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch((v) => !v);
    } catch {
      /* not supported on this device */
    }
  };

  return { state, error, torchSupported, torch, toggleTorch };
}
