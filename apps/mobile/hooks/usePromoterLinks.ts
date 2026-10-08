/**
 * Promoter links fetch + create hooks.
 *
 * Ported from: apps/web/app/api/organizer/promoter-links/route.ts
 * Uses web API via lib/api.ts (reads and writes needing server-side auth).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

export interface PromoterLink {
  id: string;
  event_id: string;
  promoter_code: string;
  promoter_name: string | null;
  total_tickets_sold: number;
  total_revenue_cents: number;
  created_at: string;
}

interface PromoterLinksResponse {
  promoter_links: PromoterLink[];
}

export interface CreatePromoterLinkInput {
  event_id: string;
  promoter_code: string;
  promoter_name?: string;
}

export function usePromoterLinks(eventId: string | undefined) {
  const { getToken } = useOptionalAuth();

  return useQuery<PromoterLink[]>({
    queryKey: ["promoter-links", eventId],
    queryFn: async () => {
      const data = await apiGet<PromoterLinksResponse>(
        `/api/organizer/promoter-links?event_id=${encodeURIComponent(eventId!)}`,
        getToken
      );
      return data.promoter_links;
    },
    enabled: Boolean(eventId),
    staleTime: 60 * 1000,
  });
}

export function useCreatePromoterLink() {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, CreatePromoterLinkInput>({
    mutationFn: (input) =>
      apiPost<unknown>("/api/organizer/promoter-links", input as unknown as Record<string, unknown>, getToken),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["promoter-links", variables.event_id] });
    },
  });
}

export function useDeletePromoterLink() {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, { id: string; eventId: string }>({
    mutationFn: ({ id }) =>
      apiDelete(`/api/organizer/promoter-links/${id}`, getToken),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["promoter-links", variables.eventId] });
    },
  });
}
