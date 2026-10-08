import { useMutation, useQueryClient } from "@tanstack/react-query";

// Types for RSVP operations
interface RsvpActionParams {
  rsvpId: string;
  action: "approve" | "reject";
}

interface RsvpSubmissionParams {
  event_id?: string;
  ticket_tier_id?: string;
  quantity?: number;
  stage_id?: string; // Optional stage_id for staged tiers
  secret_code?: string; // Optional secret code for protected tiers
  registration_data?: Record<string, any>; // Optional form data
  promoter_code?: string; // Optional promoter tracking code from URL
  paymentIntentId?: string; // Optional payment intent ID for paid RSVP tickets
  promotional_code_id?: string; // Optional promo code ID for free/discounted tickets
  pending_rsvp_id?: string; // Optional server-side pending RSVP reference
}

interface RsvpActionResponse {
  message: string;
  rsvp: {
    id: string;
    status: string;
    approved_at?: string;
    rejected_at?: string;
    approved_by?: string;
    rejected_by?: string;
  };
}

interface RsvpSubmissionResponse {
  message: string;
  rsvp: {
    id: string;
    status: string;
    requested_at: string;
  };
}

// Hook for RSVP approve/reject actions (for organizers)
export function useRsvpAction() {
  const queryClient = useQueryClient();

  return useMutation<RsvpActionResponse, Error, RsvpActionParams>({
    mutationFn: async ({ rsvpId, action }) => {
      const response = await fetch(`/api/organizer/rsvps/${rsvpId}/${action}`, {
        method: "PATCH",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} RSVP`);
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate relevant queries to trigger refetch
      queryClient.invalidateQueries({
        queryKey: ["rsvps"],
      });
      queryClient.invalidateQueries({
        queryKey: ["events"],
      });
      queryClient.invalidateQueries({
        queryKey: ["user-tickets"],
      });
      queryClient.invalidateQueries({
        queryKey: ["organizer-data"],
      });

      console.log(`✅ RSVP ${variables.action}ed successfully:`, data.rsvp.id);
    },
    onError: (error, variables) => {
      console.error(`❌ Failed to ${variables.action} RSVP:`, error.message);
    },
  });
}

// Extended Error type with code property for structured errors
interface ApiError extends Error {
  code?: string;
}

// Hook for RSVP submission (for users)
export function useRsvpSubmission() {
  const queryClient = useQueryClient();

  return useMutation<RsvpSubmissionResponse, ApiError, RsvpSubmissionParams>({
    mutationFn: async ({
      event_id,
      ticket_tier_id,
      quantity,
      stage_id,
      secret_code,
      registration_data,
      promoter_code,
      paymentIntentId,
      promotional_code_id,
      pending_rsvp_id,
    }) => {
      // Runtime validation: require either pending_rsvp_id OR (event_id, ticket_tier_id, quantity)
      // quantity must be > 0 to match backend validation
      if (
        !pending_rsvp_id &&
        (!event_id ||
          !ticket_tier_id ||
          typeof quantity !== "number" ||
          quantity <= 0)
      ) {
        throw new Error(
          "Invalid RSVP submission: Must provide either a pending RSVP ID or event details (event_id, ticket_tier_id, quantity > 0)."
        ) as ApiError;
      }

      const payload: Record<string, any> = {
        ...(pending_rsvp_id && { pending_rsvp_id }),
        ...(event_id && { event_id }),
        ...(ticket_tier_id && { ticket_tier_id }),
        ...(typeof quantity === "number" && { quantity }),
        ...(stage_id && { stage_id }),
        ...(secret_code && { secret_code }),
        ...(registration_data && { registration_data }),
        ...(promoter_code && { promoter_code }),
        ...(paymentIntentId && { paymentIntentId }),
        ...(promotional_code_id && { promotional_code_id }),
      };

      const response = await fetch("/api/rsvp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(
          errorData.error || "Failed to submit RSVP"
        ) as ApiError;
        error.code = errorData.code; // Attach structured error code
        throw error;
      }

      return response.json();
    },
    onSuccess: data => {
      // Invalidate user tickets to show the new RSVP
      queryClient.invalidateQueries({
        queryKey: ["user-tickets"],
      });
      // Also invalidate events to update ticket availability
      queryClient.invalidateQueries({
        queryKey: ["events"],
      });

      console.log("✅ RSVP submitted successfully:", data.rsvp.id);
    },
    onError: error => {
      console.error("❌ Failed to submit RSVP:", error.message);
    },
  });
}

// Export types for use in components
export type {
  RsvpActionParams,
  RsvpSubmissionParams,
  RsvpActionResponse,
  RsvpSubmissionResponse,
  ApiError,
};
