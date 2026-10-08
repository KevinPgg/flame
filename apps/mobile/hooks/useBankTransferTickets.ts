/**
 * Create bank transfer order mutation hook.
 *
 * Ported from: apps/web/app/api/organizer/bank-transfer-tickets/route.ts
 * Uses web API via lib/api.ts (write operation needing server-side auth).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

export interface BankTransferInput {
  event_id: string;
  ticket_tier_id: string;
  quantity: number;
  stage_id?: string;
  /**
   * W7-H2 (3b): exactly one of these identifies the recipient.
   *   • user_id        — an existing Flame account (push-eligible)
   *   • recipient_email — create the order for a non-Flame email (no push)
   */
  user_id?: string;
  recipient_email?: string;
  recipient_name?: string;
  /**
   * W7-H3: optional organizer override of the per-ticket price (in cents). When
   * set, the API replaces the tier/stage price with this amount. Must be > 0.
   */
  unit_price_cents?: number;
}

interface BankTransferResponse {
  success: boolean;
  order: {
    id: string;
    total_cents: number;
  };
  tickets_created: number;
  user: {
    email: string;
    name: string;
  };
}

export function useBankTransferTickets() {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<BankTransferResponse, ApiError, BankTransferInput>({
    mutationFn: (input) =>
      apiPost<BankTransferResponse>(
        "/api/organizer/bank-transfer-tickets",
        input as unknown as Record<string, unknown>,
        getToken
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-events"] });
      // Refresh the enriched data that feeds the "Sent" list so the new order
      // shows without a manual pull-to-refresh.
      queryClient.invalidateQueries({ queryKey: ["org-enriched-data"] });
    },
  });
}
