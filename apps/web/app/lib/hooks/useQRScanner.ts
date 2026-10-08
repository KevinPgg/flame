import { useMutation } from "@tanstack/react-query";

// Types for QR Scanner operations
interface QRData {
  orderId: string;
  eventId: string;
  userId: string;
  tierName: string;
  eventName: string;
  ticketNumber: number;
  timestamp: string;
  qrToken?: string; // Optional: Used as fallback for promotional tickets
}

interface TicketVerificationParams {
  qrData: QRData;
  deviceId: string;
  accessCode?: string;
}

interface TicketCheckInParams {
  ticketId: string;
  deviceId: string;
  isPromotionalTicket: boolean;
  accessCode?: string;
}

interface TicketDetails {
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
  ticket: TicketDetails;
  isPromotionalTicket: boolean;
}

interface TicketCheckInResponse {
  message: string;
  checked_in_at: string;
}

// Hook for ticket verification
export function useTicketVerification() {
  return useMutation<
    TicketVerificationResponse,
    Error,
    TicketVerificationParams
  >({
    mutationFn: async ({ qrData, deviceId, accessCode }) => {
      const response = await fetch("/api/qr-scanner/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          qrData,
          deviceId,
          accessCode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to verify ticket");
      }

      return response.json();
    },
    onSuccess: data => {
      console.log("✅ Ticket verified successfully:", data.ticket.id);
    },
    onError: error => {
      console.error("❌ Failed to verify ticket:", error.message);
    },
  });
}

// Hook for ticket check-in
export function useTicketCheckIn() {
  return useMutation<TicketCheckInResponse, Error, TicketCheckInParams>({
    mutationFn: async ({
      ticketId,
      deviceId,
      isPromotionalTicket,
      accessCode,
    }) => {
      const response = await fetch("/api/qr-scanner/checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticketId,
          deviceId,
          isPromotionalTicket,
          accessCode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to check in ticket");
      }

      return response.json();
    },
    onSuccess: data => {
      console.log("✅ Ticket checked in successfully at:", data.checked_in_at);
    },
    onError: error => {
      console.error("❌ Failed to check in ticket:", error.message);
    },
  });
}

// Export types for use in components
export type {
  QRData,
  TicketVerificationParams,
  TicketCheckInParams,
  TicketDetails,
  TicketVerificationResponse,
  TicketCheckInResponse,
};
