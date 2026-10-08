/**
 * Send promotional tickets mutation hook.
 *
 * Ported from: apps/web/app/api/organizer/promotional-tickets/route.ts
 * Uses web API via lib/api.ts (write operation needing server-side auth).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

export interface SendTicketsInput {
  event_id: string;
  ticket_tier_id: string;
  quantity?: number;
  /**
   * W7-H2 (3a): exactly one of these identifies the recipient.
   *   • user_id        — an existing Flame account (push-eligible)
   *   • recipient_email — send a comp ticket to a non-Flame email (no push)
   */
  user_id?: string;
  recipient_email?: string;
  recipient_name?: string;
}

interface SendTicketsResponse {
  message: string;
  tickets: {
    id: string;
    qr_token: string;
    email: string;
    customer_name: string;
  }[];
}

export function useSendTickets() {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<SendTicketsResponse, ApiError, SendTicketsInput>({
    mutationFn: (input) =>
      apiPost<SendTicketsResponse>(
        "/api/organizer/promotional-tickets",
        input as unknown as Record<string, unknown>,
        getToken
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-events"] });
      // Refresh the enriched data that feeds the "Sent" list so the newly
      // sent ticket shows without a manual pull-to-refresh.
      queryClient.invalidateQueries({ queryKey: ["org-enriched-data"] });
    },
  });
}
