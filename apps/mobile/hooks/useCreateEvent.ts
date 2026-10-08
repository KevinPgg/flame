/**
 * Create event mutation hook.
 *
 * Ported from: apps/web/app/api/events/route.ts (POST handler)
 * Uses web API via lib/api.ts (write operation needing server-side auth).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

export interface CreateEventTierStageInput {
  name: string;
  price_cents: number;
  quantity: number;
  /** W4-C2 (May 2026): per-stage description (max 120 chars), optional. */
  description?: string | null;
}

export interface CreateEventTierInput {
  /** Client-side stable id for React keys; not sent to API. */
  id?: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  per_user_limit: number;
  /** Local datetime string; empty becomes null on submit (server defaults). */
  sales_start: string;
  sales_end: string;
  secret_code?: string | null;
  useStages?: boolean;
  stages?: CreateEventTierStageInput[];
  /**
   * Per-tier subset of event-level registration form field IDs.
   *   - `null`/omitted → tier inherits all non-archived event fields
   *   - `[]`            → tier collects no fields
   *   - `[ids]`         → only those fields
   * Mirrors `apps/web/app/api/events/route.ts` Zod (ticket_tiers entry).
   */
  registration_form_fields?: string[] | null;
  /** W4-C2 (May 2026): tier-level description (max 120 chars), optional. */
  description?: string | null;
  /** W4-C3 (Jun 2026): set at create-time so organizers can set up access-code
   *  / sold-out / hidden tiers in one step instead of create-then-edit. */
  is_hidden?: boolean;
  is_manually_sold_out?: boolean;
}

/** Tier row sent to POST /api/events (no `id`; `sales_start` may be null). */
export type CreateEventTierApiPayload = Omit<
  CreateEventTierInput,
  "id" | "sales_start"
> & {
  sales_start: string | null;
};

export interface CreateEventInput {
  event: {
    organization_id: string;
    name: string;
    slug: string;
    city: string;
    venue: string;
    starts_at: string;
    ends_at: string;
    description?: string;
    image_url?: string;
    status?: "published";
    requires_rsvp?: boolean;
    currency?: string;
    timezone?: string;
    registration_form_config?: {
      id: string;
      label: string;
      type: string;
      required?: boolean;
      placeholder?: string;
    }[];
  };
  ticket_tiers: Array<CreateEventTierApiPayload & { id?: string }>;
}

interface CreateEventResponse {
  event: { id: string; slug: string; [key: string]: unknown };
  ticket_tiers: { id: string; [key: string]: unknown }[];
}

export function useCreateEvent() {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<CreateEventResponse, ApiError, CreateEventInput>({
    mutationFn: (input) => {
      const { ticket_tiers, ...rest } = input;
      const serverTiers = ticket_tiers.map(({ id: _id, ...tier }) => tier);
      const serverInput = { ...rest, ticket_tiers: serverTiers };
      return apiPost<CreateEventResponse>(
        "/api/events",
        serverInput as unknown as Record<string, unknown>,
        getToken
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-events"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}
