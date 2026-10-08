import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";
import type { FormField } from "../../components/modals/RegistrationFormModal";

interface TicketTier {
  id: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
  // Active holds + pending/approved RSVP quantities attached to this tier.
  // Server-computed; used by organizer UI to render "· {n} pending" hint.
  quantity_reserved?: number;
  per_user_limit?: number;
  sales_start?: string;
  sales_end?: string;
  // Per-tier registration form subset. `null`/`undefined` = inherit all event
  // fields; `[]` = collect none; `[ids]` = subset (preserves event field order).
  registration_form_fields?: string[] | null;
}

interface Event {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  starts_at: string;
  ends_at: string;
  venue: string;
  city: string;
  image_url: string;
  organization_id: string;
  currency?: string;
  timezone?: string | null;
  pending_rsvps?: number;
  approved_rsvps?: number;
  rejected_rsvps?: number;
  requires_rsvp?: boolean;
  ticket_tiers?: TicketTier[];
  qr_scanner_code?: string;
  registration_form_config?: FormField[] | null;
  // Computed properties added by the dashboard
  totalRevenue?: number;
  totalAttendees?: number;
  purchases?: any[];
  promotional_tickets?: any[];
  promotional_codes?: any[];
  bank_transfer_orders?: any[];
  promoter_links?: any[];
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  owner_user_id: string;
}

/** Cohost event entry — event the current org is a co-host on. Lighter than
 *  primary `events` (no purchases/promo/bank-transfer data). */
interface CohostEventEntry {
  assignment_id: string;
  owner_org_name: string;
  owner_org_slug: string;
  event: Event;
}

/** Owner-side cohost assignment — used to render "Co-host with X" pills on
 *  events the current org owns and has assigned cohorts to. */
interface OwnerCohostAssignment {
  event_id: string;
  cohost_org_name: string;
}

interface OrganizerData {
  organization: Organization;
  events: Event[];
  cohost_events?: CohostEventEntry[];
  owner_cohost_assignments?: OwnerCohostAssignment[];
}

// Hook to fetch organizer's data (organization + events)
export function useOrganizerData(orgSlug?: string | null) {
  const { isSignedIn, isLoaded } = useUser();

  return useQuery<OrganizerData>({
    queryKey: ["organizer-data", orgSlug ?? null],
    queryFn: async () => {
      const url = orgSlug
        ? `/api/organizer/data?org=${encodeURIComponent(orgSlug)}`
        : "/api/organizer/data";
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch organizer data");
      }
      return response.json();
    },
    enabled: isSignedIn && isLoaded,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Hook to create/update ticket tiers
interface TicketTierInput {
  id?: string;
  event_id?: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  per_user_limit: number;
  sales_start: string;
  sales_end: string;
}

export function useTicketTierMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TicketTierInput) => {
      const response = await fetch("/api/ticket-tiers", {
        method: data.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save ticket tier");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizer-data"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

// Hook to delete ticket tier
export function useDeleteTicketTier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tierId: string) => {
      const response = await fetch(`/api/ticket-tiers?id=${tierId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete ticket tier");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizer-data"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export type {
  Event,
  Organization,
  OrganizerData,
  TicketTier,
  TicketTierInput,
  CohostEventEntry,
  OwnerCohostAssignment,
};
