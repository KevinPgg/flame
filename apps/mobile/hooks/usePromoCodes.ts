/**
 * Promo codes fetch + create hooks.
 *
 * Ported from: apps/web/app/api/organizer/promotional-codes/route.ts
 * Uses web API via lib/api.ts (reads and writes needing server-side auth).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

export interface PromoCode {
  id: string;
  event_id: string;
  code: string;
  discount_percentage: number;
  usage_limit: number;
  usage_count: number;
  created_at: string;
}

interface PromoCodesResponse {
  promotional_codes: PromoCode[];
}

export interface CreatePromoCodeInput {
  event_id: string;
  code: string;
  discount_percentage: number;
  usage_limit: number;
}

export function usePromoCodes(eventId: string | undefined) {
  const { getToken } = useOptionalAuth();

  return useQuery<PromoCode[]>({
    queryKey: ["promo-codes", eventId],
    queryFn: async () => {
      const data = await apiGet<PromoCodesResponse>(
        `/api/organizer/promotional-codes?event_id=${encodeURIComponent(eventId!)}`,
        getToken
      );
      return data.promotional_codes;
    },
    enabled: Boolean(eventId),
    staleTime: 60 * 1000,
  });
}

export function useCreatePromoCode() {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<PromoCode, ApiError, CreatePromoCodeInput>({
    mutationFn: (input) =>
      apiPost<PromoCode>("/api/organizer/promotional-codes", input as unknown as Record<string, unknown>, getToken),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["promo-codes", variables.event_id] });
    },
  });
}

export function useDeletePromoCode() {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, { id: string; eventId: string }>({
    mutationFn: ({ id }) =>
      apiDelete(`/api/organizer/promotional-codes/${id}`, getToken),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["promo-codes", variables.eventId] });
    },
  });
}
