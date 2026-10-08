/**
 * Update event mutation hook.
 *
 * Ported from: apps/web/app/api/events/route.ts (PATCH handler)
 * Uses web API via lib/api.ts (write operation needing server-side auth).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPatch, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

export interface UpdateEventInput {
  id: string;
  starts_at?: string;
  ends_at?: string;
  venue?: string;
  city?: string;
  description?: string | null;
  image_url?: string;
  qr_scanner_code?: string;
  registration_form_config?: {
    id: string;
    label: string;
    type: string;
    required?: boolean;
    placeholder?: string;
    archived?: boolean;
  }[] | null;
}

export function useUpdateEvent() {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<Record<string, unknown>, ApiError, UpdateEventInput>({
    mutationFn: (input) =>
      apiPatch<Record<string, unknown>>("/api/events", input as unknown as Record<string, unknown>, getToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-events"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}
