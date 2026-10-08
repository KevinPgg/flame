/**
 * Fetches organizer revenue per event directly from Supabase.
 *
 * Uses the authenticated mobile Supabase client (RLS-scoped via "Organization
 * members can view orders for their events" policy) to query completed orders
 * for the organization, then computes net base revenue using the same logic as
 * the web: `base_price_cents` for Stripe orders, or `extractBasePriceHistorical`
 * for legacy Datafast orders.
 *
 * Web source-of-truth: apps/web/app/lib/utils/purchase-data.ts → fetchEventPurchases
 * Revenue calculation mirrors: enrichEventWithStats in apps/web/app/api/organizer/data/route.ts
 */

import { useQuery } from "@tanstack/react-query";
import { useOptionalAuth } from "./useOptionalAuth";
import { useMemberRoleContext } from "../contexts/MemberRoleContext";
import { useOrgData } from "./useOrgData";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { calculateOrganizerBasePrice } from "@project-flame/lib";
import { z } from "zod";

const OrderRevenueRowSchema = z.object({
  event_id: z.string(),
  base_price_cents: z.number().nullable(),
  total_amount_cents: z.number(),
  discount_amount_cents: z.number().nullable(),
  fee_percentage: z.number().nullable(),
  created_at: z.string(),
});

export type RevenueMap = Map<string, number>;

export function useOrgDashboardStats(orgId?: string | null) {
  const { getToken, isSignedIn, isConfigured } = useOptionalAuth();
  const { selectedOrgId } = useMemberRoleContext();
  const { data: orgData } = useOrgData(selectedOrgId);

  const effectiveOrgId = orgId ?? orgData?.organizationId;

  const query = useQuery<RevenueMap>({
    queryKey: ["org-dashboard-stats", effectiveOrgId],
    queryFn: async () => {
      const client = await getAuthenticatedClient(getToken);

      // PostgREST caps every response at 1000 rows by default. A high-volume
      // organization easily exceeds that across all its events (e.g. 1044+
      // orders), so a single un-paged `.select()` silently drops the overflow —
      // and because the dropped rows are whichever sort last, a recent event's
      // newest orders get truncated, undercounting its revenue (the $10,060 →
      // $8,390 bug). Page through the full result set ordered by the unique
      // primary key (`id`) so pagination is stable (no skipped/duplicated rows
      // across page boundaries) and every order is summed. Revenue is still
      // computed per-row with the shared `calculateOrganizerBasePrice` helper so
      // legacy Datafast orders (null base_price_cents) keep their historical
      // base-price extraction — identical to the web aggregation.
      const PAGE_SIZE = 1000;
      const allRows: unknown[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from("orders")
          .select(
            "event_id, base_price_cents, total_amount_cents, discount_amount_cents, fee_percentage, created_at"
          )
          .eq("organization_id", effectiveOrgId!)
          .in("status", ["completed", "paid"])
          .neq("payment_provider", "bank_transfer")
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        const batch = data ?? [];
        allRows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }

      const rows = z.array(OrderRevenueRowSchema).parse(allRows);
      const map: RevenueMap = new Map();

      for (const row of rows) {
        const basePrice = calculateOrganizerBasePrice(row);
        map.set(row.event_id, (map.get(row.event_id) ?? 0) + basePrice);
      }

      return map;
    },
    enabled: Boolean(isSignedIn && isConfigured && effectiveOrgId),
    staleTime: 2 * 60 * 1000,
  });

  return query;
}
