/**
 * Tier CRUD mutation hooks.
 *
 * Ported from: apps/web/app/api/ticket-tiers/route.ts (POST, PATCH, DELETE handlers)
 * Uses web API via lib/api.ts (write operations needing server-side auth).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiPatch, apiDelete, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

export interface CreateTierInput {
  event_id: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  per_user_limit: number;
  sales_start: string;
  sales_end: string;
  secret_code?: string | null;
  useStages?: boolean;
  stages?: {
    name: string;
    price_cents: number;
    quantity: number;
    order_index: number;
    /** W4-C2 (May 2026) — optional per-stage description (max 120 chars). */
    description?: string | null;
  }[];
  /**
   * Per-tier registration form subset (same semantics as web).
   *   - `null`/omitted → tier inherits all non-archived event fields
   *   - `[]`            → tier collects no fields
   *   - `[ids]`         → only those fields
   * Mirrors `apps/web/app/api/ticket-tiers/schemas.ts` (createTierSchema).
   */
  registration_form_fields?: string[] | null;
  /** W4-C1 (May 2026): organizer toggle. Force the tier to read as sold out
   *  regardless of capacity. */
  is_manually_sold_out?: boolean;
  /** W4-C1 (May 2026): organizer toggle. Hide the tier from attendee surfaces. */
  is_hidden?: boolean;
  /** W4-C2 (May 2026): tier-level organizer description (max 120 chars). When
   *  the active stage has its own description it replaces this one on the
   *  attendee surface. */
  description?: string | null;
}

export interface UpdateTierInput {
  id: string;
  name?: string;
  price_cents?: number;
  quantity_total?: number;
  per_user_limit?: number;
  sales_start?: string;
  sales_end?: string;
  secret_code?: string | null;
  tentative_event_start?: string;
  useStages?: boolean;
  stages?: {
    id?: string;
    name: string;
    price_cents: number;
    quantity: number;
    order_index: number;
    /** W4-C2 (May 2026) — optional per-stage description. */
    description?: string | null;
  }[];
  /** See {@link CreateTierInput.registration_form_fields}. */
  registration_form_fields?: string[] | null;
  /** See {@link CreateTierInput.is_manually_sold_out}. */
  is_manually_sold_out?: boolean;
  /** See {@link CreateTierInput.is_hidden}. */
  is_hidden?: boolean;
  /** See {@link CreateTierInput.description}. */
  description?: string | null;
}

interface TierResponse {
  tier: { id: string; [key: string]: unknown };
}

export function useCreateTier() {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<TierResponse, ApiError, CreateTierInput>({
    mutationFn: (input) =>
      apiPost<TierResponse>("/api/ticket-tiers", input as unknown as Record<string, unknown>, getToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-events"] });
    },
  });
}

export function useUpdateTier() {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<TierResponse, ApiError, UpdateTierInput>({
    mutationFn: (input) =>
      apiPatch<TierResponse>("/api/ticket-tiers", input as unknown as Record<string, unknown>, getToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-events"] });
    },
  });
}

export function useDeleteTier() {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, ApiError, string>({
    mutationFn: (tierId) =>
      apiDelete<{ success: boolean }>(`/api/ticket-tiers?id=${encodeURIComponent(tierId)}`, getToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-events"] });
    },
  });
}

export interface ForceReduceTierInput {
  tierId: string;
  new_quantity_total: number;
}

interface ForceReduceTierResponse {
  tier: { id: string; quantity_total: number };
  cancelled_holds: number;
  rejected_rsvps: number;
}

/**
 * W4-C1 (May 2026) — organizer override that cancels active holds + pending
 * RSVPs to reduce a tier's capacity past the normal `quantity_sold +
 * quantity_reserved` floor. Sold tickets are still a hard lower bound; the
 * server enforces this so a stale client UI cannot wipe out a fresh sale.
 *
 * Source-of-truth: `apps/web/app/api/organizer/tiers/[tierId]/force-reduce/route.ts`.
 */
export function useForceReduceTier() {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<ForceReduceTierResponse, ApiError, ForceReduceTierInput>({
    mutationFn: ({ tierId, new_quantity_total }) =>
      apiPost<ForceReduceTierResponse>(
        `/api/organizer/tiers/${encodeURIComponent(tierId)}/force-reduce`,
        { new_quantity_total },
        getToken,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-events"] });
    },
  });
}
