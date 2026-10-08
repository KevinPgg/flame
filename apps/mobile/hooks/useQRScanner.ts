/**
 * Mobile QR Scanner hook — mirrors web's useQRScanner.ts state machine.
 *
 * Web source: apps/web/app/lib/hooks/useQRScanner.ts
 * Web APIs called:
 *   POST /api/qr-scanner/validate-code  → { code }           → { valid, eventId, eventName }
 *   POST /api/qr-scanner/verify         → { qrData, deviceId, accessCode } → { ticket, isPromotionalTicket }
 *   POST /api/qr-scanner/checkin        → { ticketId, deviceId, isPromotionalTicket, accessCode } → { checked_in_at }
 *
 * All scanner operations are writes (update ticket status, send notifications) so we
 * call the web API endpoints via lib/api.ts rather than querying Supabase directly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Vibration } from "react-native";
import { useMutation } from "@tanstack/react-query";
import type { QRCodeData } from "@project-flame/lib";
import { apiPost, apiPostPublic } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

// ---------------------------------------------------------------------------
// Types — mirrored from web's useQRScanner.ts
// ---------------------------------------------------------------------------

export type ScannerState =
  | "idle"
  | "scanning"
  | "verifying"
  | "verified"
  | "checking_in"
  | "checked_in"
  | "error";

export interface TicketDetails {
  id: string;
  attendee_name: string;
  attendee_email: string;
  status: string;
  checked_in_at: string | null;
  qr_token: string;
  metadata?: {
    stage_id?: string;
    stage_name?: string;
    stage_price_cents?: number;
  } | null;
  ticket_tier: {
    name: string;
    price_cents: number;
  };
  events: {
    name: string;
    starts_at: string;
    venue: string;
  };
  order: {
    quantity: number;
  };
  sequence_number?: number;
}

interface TicketVerificationResponse {
  success: boolean;
  ticket: TicketDetails;
  isPromotionalTicket: boolean;
}

interface TicketCheckInResponse {
  success: boolean;
  message: string;
  checked_in_at: string;
}

interface ValidateCodeResponse {
  valid: boolean;
  eventId: string;
  eventName: string;
}

/**
 * QR data shape used by the web scanner. The shared-lib QRCodeData has all
 * fields required, but the web scanner treats `orderId` as optional for
 * promotional tickets (they have no order). We accept the shared type and
 * handle the promotional-ticket path the same way the web does.
 */
type QRData = QRCodeData;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseQRScannerOptions {
  /** Selected org context for multi-org users. When null, defaults from useUserOrgs are applied by the caller. */
  orgId?: string | null;
  /**
   * When true, all scanner API calls go through the unauthenticated public
   * endpoints. The access code is the only credential — no Clerk Bearer token
   * is sent. Used by the in-settings scanner that's reachable to non-signed-in
   * staff. The web endpoints (verify, checkin, validate-code) all accept the
   * access code in lieu of auth, so this is a transport switch only.
   */
  publicMode?: boolean;
}

export function useQRScanner(options?: UseQRScannerOptions) {
  const { getToken } = useOptionalAuth();
  const orgId = options?.orgId ?? null;
  const publicMode = options?.publicMode ?? false;

  // State machine — mirrors web: idle → scanning → verifying → verified → checking_in → checked_in / error
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [ticketDetails, setTicketDetails] = useState<TicketDetails | null>(null);
  const [isPromotionalTicket, setIsPromotionalTicket] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [justCheckedIn, setJustCheckedIn] = useState(false);

  // Event access state — mirrors web's access code session
  const [accessCode, setAccessCode] = useState("");
  const [activeEventId, setActiveEventId] = useState("");
  const [activeEventName, setActiveEventName] = useState("");

  const lastScanRef = useRef("");
  const processingRef = useRef(false);
  const confirmingRef = useRef(false);

  // -------------------------------------------------------------------------
  // Validate access code — mirrors web's POST /api/qr-scanner/validate-code
  // -------------------------------------------------------------------------
  const validateCodeMutation = useMutation<ValidateCodeResponse, Error, string>({
    mutationFn: async (code: string) => {
      const body: { code: string; orgId?: string } = { code };
      if (orgId) body.orgId = orgId;
      if (publicMode) {
        return apiPostPublic<ValidateCodeResponse>(
          "/api/qr-scanner/validate-code",
          body,
        );
      }
      return apiPost<ValidateCodeResponse>(
        "/api/qr-scanner/validate-code",
        body,
        getToken,
      );
    },
  });

  const validateAccessCode = useCallback(
    async (code: string): Promise<{ valid: boolean; eventId?: string; eventName?: string; error?: string }> => {
      try {
        const data = await validateCodeMutation.mutateAsync(code);
        if (data.valid) {
          setAccessCode(code);
          setActiveEventId(data.eventId);
          setActiveEventName(data.eventName);
          return { valid: true, eventId: data.eventId, eventName: data.eventName };
        }
        return { valid: false, error: "Invalid code" };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to validate code";
        return { valid: false, error: message };
      }
    },
    [getToken, validateCodeMutation],
  );

  // -------------------------------------------------------------------------
  // Verify ticket — mirrors web's POST /api/qr-scanner/verify
  // Web sends: { qrData, deviceId, accessCode }
  // Web expects: { ticket, isPromotionalTicket }
  // -------------------------------------------------------------------------
  const verifyMutation = useMutation<
    TicketVerificationResponse,
    Error,
    { qrData: QRData; deviceId: string }
  >({
    mutationFn: async ({ qrData, deviceId }) => {
      const body: { qrData: QRData; deviceId: string; accessCode: string; orgId?: string } = {
        qrData,
        deviceId,
        accessCode,
      };
      if (orgId) body.orgId = orgId;
      if (publicMode) {
        return apiPostPublic<TicketVerificationResponse>(
          "/api/qr-scanner/verify",
          body,
        );
      }
      return apiPost<TicketVerificationResponse>(
        "/api/qr-scanner/verify",
        body,
        getToken,
      );
    },
  });

  // -------------------------------------------------------------------------
  // Check-in ticket — mirrors web's POST /api/qr-scanner/checkin
  // Web sends: { ticketId, deviceId, isPromotionalTicket, accessCode }
  // Web expects: { message, checked_in_at }
  // -------------------------------------------------------------------------
  const checkInMutation = useMutation<
    TicketCheckInResponse,
    Error,
    { ticketId: string; deviceId: string; isPromotional: boolean }
  >({
    mutationFn: async ({ ticketId, deviceId, isPromotional }) => {
      const body: {
        ticketId: string;
        deviceId: string;
        isPromotionalTicket: boolean;
        accessCode: string;
        orgId?: string;
      } = {
        ticketId,
        deviceId,
        isPromotionalTicket: isPromotional,
        accessCode,
      };
      if (orgId) body.orgId = orgId;
      if (publicMode) {
        return apiPostPublic<TicketCheckInResponse>(
          "/api/qr-scanner/checkin",
          body,
        );
      }
      return apiPost<TicketCheckInResponse>(
        "/api/qr-scanner/checkin",
        body,
        getToken,
      );
    },
  });

  // -------------------------------------------------------------------------
  // Validate QR data structure — mirrors web's validateQRData
  // -------------------------------------------------------------------------
  const validateQRData = useCallback((qrText: string): QRData | null => {
    try {
      const parsed = JSON.parse(qrText) as QRData;

      const isPromotional = !parsed.orderId && parsed.qrToken;

      if (isPromotional) {
        if (!parsed.eventId || !parsed.qrToken) return null;
        return parsed;
      }

      if (!parsed.orderId || !parsed.eventId || !parsed.ticketNumber) return null;
      return parsed;
    } catch {
      return null;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Handle scanned QR code — mirrors web's handleQRCodeDetected
  // -------------------------------------------------------------------------
  const handleBarcodeScan = useCallback(
    async (qrText: string, deviceId: string) => {
      if (processingRef.current) return;
      if (lastScanRef.current === qrText) return;

      const qrData = validateQRData(qrText);
      if (!qrData) return;

      if (activeEventId && qrData.eventId !== activeEventId) {
        setErrorMessage("This ticket is not for the selected event.");
        setScannerState("error");
        return;
      }

      processingRef.current = true;
      lastScanRef.current = qrText;
      Vibration.vibrate(200);
      setScannerState("verifying");

      try {
        const data = await verifyMutation.mutateAsync({ qrData, deviceId });
        setTicketDetails(data.ticket);
        setIsPromotionalTicket(data.isPromotionalTicket);
        setScannerState("verified");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to verify ticket";
        setErrorMessage(message);
        setScannerState("error");
      } finally {
        processingRef.current = false;
      }
    },
    [activeEventId, verifyMutation, validateQRData],
  );

  // -------------------------------------------------------------------------
  // Confirm check-in — mirrors web's confirmCheckIn
  // -------------------------------------------------------------------------
  const confirmCheckIn = useCallback(
    async (deviceId: string) => {
      if (!ticketDetails) return;
      if (confirmingRef.current) return;

      confirmingRef.current = true;
      setScannerState("checking_in");

      try {
        const data = await checkInMutation.mutateAsync({
          ticketId: ticketDetails.id,
          deviceId,
          isPromotional: isPromotionalTicket,
        });
        setJustCheckedIn(true);
        setTicketDetails(prev =>
          prev ? { ...prev, checked_in_at: data.checked_in_at } : null,
        );
        setScannerState("checked_in");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to check in";
        setErrorMessage(message);
        setScannerState("error");
      } finally {
        confirmingRef.current = false;
      }
    },
    [ticketDetails, isPromotionalTicket, checkInMutation],
  );

  // -------------------------------------------------------------------------
  // Reset scanner — mirrors web's resetScanner
  // -------------------------------------------------------------------------
  const resetScanner = useCallback(() => {
    setTicketDetails(null);
    setIsPromotionalTicket(false);
    setErrorMessage("");
    setScannerState("idle");
    setJustCheckedIn(false);
    lastScanRef.current = "";
    processingRef.current = false;
    confirmingRef.current = false;
  }, []);

  // -------------------------------------------------------------------------
  // Clear event session — mirrors web's handleChangeEvent
  // -------------------------------------------------------------------------
  const clearEventSession = useCallback(() => {
    setAccessCode("");
    setActiveEventId("");
    setActiveEventName("");
    resetScanner();
  }, [resetScanner]);

  // Reset scanner session when orgId changes so verification/check-in cannot use stale session data
  useEffect(() => {
    clearEventSession();
  }, [orgId, clearEventSession]);

  // -------------------------------------------------------------------------
  // Start scanning — transition to scanning state
  // -------------------------------------------------------------------------
  const startScanning = useCallback(() => {
    if (!activeEventId) return;
    setScannerState("scanning");
    setErrorMessage("");
  }, [activeEventId]);

  return {
    // State
    scannerState,
    ticketDetails,
    isPromotionalTicket,
    errorMessage,
    justCheckedIn,
    accessCode,
    activeEventId,
    activeEventName,

    // Mutation loading states
    isVerifying: verifyMutation.isPending,
    isCheckingIn: checkInMutation.isPending,
    isValidatingCode: validateCodeMutation.isPending,

    // Actions
    validateAccessCode,
    handleBarcodeScan,
    confirmCheckIn,
    resetScanner,
    clearEventSession,
    startScanning,
    setScannerState,
  };
}
