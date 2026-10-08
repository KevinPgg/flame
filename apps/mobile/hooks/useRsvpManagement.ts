/**
 * RSVP management hooks for organizer dashboard.
 *
 * - useRsvpEvents(): Events with RSVP counts (Supabase direct, RLS-scoped)
 * - useEventRsvps(eventId): RSVPs for a specific event (Supabase direct)
 * - useRsvpActions(): Approve/reject mutations (web API — PATCH)
 *
 * Web source-of-truth:
 *   - GET query: apps/web/app/api/organizer/rsvps/route.ts
 *   - Approve:   apps/web/app/api/organizer/rsvps/[id]/approve/route.ts
 *   - Reject:    apps/web/app/api/organizer/rsvps/[id]/reject/route.ts
 *   - Component: apps/web/app/components/RsvpManagement.tsx
 */

import { Alert } from "react-native";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  formatEventDate,
  buildTimeRange,
  formatCedula,
  formatCentsAsPrice,
  separateEventsByDate,
  getBasePriceFromTicket,
  isValidIanaTimezone,
} from "@project-flame/lib";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { apiPatch, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";
import { useOrgData } from "./useOrgData";
import { useMemberRoleContext } from "../contexts/MemberRoleContext";

// ---------------------------------------------------------------------------
// Types — match Supabase SELECT shapes
// ---------------------------------------------------------------------------

/** Lightweight row for the events-list query (useRsvpEvents). */
interface EventRow {
  id: string;
  name: string;
  image_url: string | null;
  starts_at: string;
  ends_at: string;
  venue: string | null;
  city: string | null;
  timezone: string | null;
  registration_form_config: FormField[] | null;
}

/** Full RSVP row returned by useEventRsvps. */
interface RsvpDetailRow {
  id: string;
  user_id: string;
  event_id: string;
  ticket_tier_id: string;
  requested_quantity: number;
  status: string;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  stage_id: string | null;
  stage_name: string | null;
  stage_price_cents: number | null;
  base_price_cents: number | null;
  fee_percentage: number | null;
  registration_data: Record<string, unknown> | null;
  user:
    | {
        first_name: string | null;
        last_name: string | null;
        document_id: string | null;
        email?: string | null;
      }
    | {
        first_name: string | null;
        last_name: string | null;
        document_id: string | null;
        email?: string | null;
      }[]
    | null;
  ticket_tier:
    | { name: string; price_cents: number }
    | { name: string; price_cents: number }[]
    | null;
}

// ---------------------------------------------------------------------------
// Public types — consumed by screens and components
// ---------------------------------------------------------------------------

export const FormFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.union([
    z.literal("checkbox"),
    z.literal("email"),
    z.literal("number"),
    z.literal("date"),
    z.literal("text"),
    z.string(),
  ]),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  /**
   * Archived fields are hidden from the registrant-facing registration form and from
   * tier `registration_form_fields` pickers for NEW selections, but are still shown
   * in organizer RSVP detail views and XLSX exports so historical answers remain
   * labeled. Toggle via the form builder's archive action — does NOT delete the
   * field or any previously submitted `registration_data`.
   */
  archived: z.boolean().optional(),
});

export type FormField = z.infer<typeof FormFieldSchema>;

export type RsvpStatus = "pending" | "approved" | "rejected" | "expired" | "unknown";

export interface RsvpEventData {
  id: string;
  eventName: string;
  eventImageUrl: string;
  date: string;
  timeRange: string;
  location: string;
  pendingRequests: number;
  starts_at: string;
  ends_at: string;
}

export interface RsvpRequestData {
  id: string;
  personName: string;
  personId: string;
  tierName: string;
  /** Tier + stage for XLSX export (web: "Tier - Stage"). */
  tierExportLine: string;
  ticketCount: number;
  /** Date the RSVP was requested (matches web's "Requested {date}" display). */
  requestDate: string;
  /** ISO timestamp for XLSX export. */
  requestedAtIso: string;
  email: string;
  price: number;
  status: RsvpStatus;
  statusDate?: string;
  registrationData: Record<string, unknown> | null;
}

export interface RsvpDetailStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
}

export interface UseEventRsvpsResult {
  rsvps: RsvpRequestData[];
  stats: RsvpDetailStats;
  registrationFormConfig: FormField[] | null;
  isPastEvent: boolean;
  currency?: string;
  eventName: string;
  eventTimezone: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unwrapSingle<T>(val: T | T[] | null | undefined): T | null {
  if (Array.isArray(val)) return val[0] ?? null;
  return val ?? null;
}

function buildLocation(venue: string | null, city: string | null): string {
  return [venue, city].filter(Boolean).join(", ");
}

function safeTimezone(tz: string | null | undefined): string {
  const raw = tz ?? "";
  return isValidIanaTimezone(raw) ? raw : "UTC";
}


function formatStatusDate(dateStr: string | null): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getUserName(
  user: RsvpDetailRow["user"]
): string {
  const u = unwrapSingle(user);
  if (!u) return "Unknown";
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unknown";
}

function getDocumentId(user: RsvpDetailRow["user"]): string {
  const u = unwrapSingle(user);
  return formatCedula(u?.document_id ?? null) ?? u?.document_id ?? "N/A";
}

/**
 * Get the display price for an RSVP — mirrors web's getRsvpDisplayPrice in RsvpManagement.tsx.
 *
 * Priority:
 * 1. base_price_cents — already the total (unit price * quantity) with any promo discount applied.
 * 2. Fallback: extract historical base price from stage/tier unit price, then multiply by quantity.
 */
function getDisplayPrice(rsvp: RsvpDetailRow): number {
  if (rsvp.base_price_cents !== null && rsvp.base_price_cents !== undefined) {
    return rsvp.base_price_cents;
  }
  const tier = unwrapSingle(rsvp.ticket_tier);
  const unitPrice = rsvp.stage_price_cents ?? tier?.price_cents ?? 0;
  return (
    getBasePriceFromTicket(unitPrice, rsvp.requested_at, rsvp.fee_percentage) *
    rsvp.requested_quantity
  );
}

// ---------------------------------------------------------------------------
// Supabase SELECT strings — match web's GET /api/organizer/rsvps exactly
// ---------------------------------------------------------------------------

const RSVP_DETAIL_SELECT = `
  id, user_id, event_id, ticket_tier_id, requested_quantity, status,
  requested_at, approved_at, rejected_at,
  stage_id, stage_name, stage_price_cents, base_price_cents, fee_percentage,
  registration_data,
  user:users!rsvps_user_id_fkey(first_name, last_name, document_id, email),
  ticket_tier:ticket_tiers(name, price_cents)
`;

// =========================================================================
// Hook 1: useRsvpEvents — events list with pending RSVP counts
// =========================================================================

/**
 * @param assignedEventIds — controls event filtering:
 *   - undefined: full access, return all org events
 *   - null:      loading/paused, do not run the query yet
 *   - string[]:  organizer-role, filter to these IDs (empty array = no events)
 */
export function useRsvpEvents(assignedEventIds?: string[] | null) {
  const { getToken, isSignedIn, isConfigured, userId } = useOptionalAuth();
  const { selectedOrgId, isOwnerOrAdmin } = useMemberRoleContext();
  const { data: orgData } = useOrgData(selectedOrgId);

  return useQuery<{
    currentEvents: RsvpEventData[];
    pastEvents: RsvpEventData[];
  }>({
    queryKey: [
      "rsvp-events",
      userId,
      orgData?.organizationId,
      isOwnerOrAdmin,
      assignedEventIds ?? null,
    ],
    queryFn: async () => {
      // Organizer with no assigned events — skip the DB round-trip
      if (assignedEventIds !== undefined && assignedEventIds.length === 0) {
        return { currentEvents: [], pastEvents: [] };
      }

      try {
        const client = await getAuthenticatedClient(getToken);

        type CohostEventRow = EventRow & { requires_rsvp?: boolean };
        type CohostAssignmentRow = {
          event_id: string;
          events: CohostEventRow | null;
        };

        // Cohost-org events: only owner/admin of the selected org can manage
        // these (mirrors canManageEventRsvps + the rsvps RLS policy added in
        // 20260519220824_cohost_rsvp_rls_access.sql). Skip the round-trip for
        // non-admin members. Normalizes the embedded `events` relation since
        // PostgREST types it as `T | T[] | null`, but the FK is to-one.
        const fetchCohostEvents = async (): Promise<{
          data: CohostAssignmentRow[];
          error: unknown;
        }> => {
          if (!isOwnerOrAdmin) return { data: [], error: null };
          let q = client
            .from("event_assignments")
            .select(
              `event_id, events:event_id (id, name, image_url, starts_at, ends_at, venue, city, timezone, registration_form_config, requires_rsvp)`
            )
            .eq("cohost_organization_id", orgData!.organizationId);
          if (assignedEventIds && assignedEventIds.length > 0) {
            q = q.in("event_id", assignedEventIds);
          }
          const { data, error } = await q;
          const rows: CohostAssignmentRow[] = (data ?? []).map(
            (row: { event_id: string; events: CohostEventRow | CohostEventRow[] | null }) => ({
              event_id: row.event_id,
              events: Array.isArray(row.events) ? (row.events[0] ?? null) : row.events,
            })
          );
          return { data: rows, error };
        };

        // Primary-org events: any role of the selected org can read these.
        let primaryEventsQuery = client
            .from("events")
            .select(
              "id, name, image_url, starts_at, ends_at, venue, city, timezone, registration_form_config, requires_rsvp"
            )
            .eq("organization_id", orgData!.organizationId)
            .eq("requires_rsvp", true)
            .order("starts_at", { ascending: true });

        if (assignedEventIds && assignedEventIds.length > 0) {
          primaryEventsQuery = primaryEventsQuery.in("id", assignedEventIds);
        }

        const [primaryResult, cohostResult] = await Promise.all([
          primaryEventsQuery,
          fetchCohostEvents(),
        ]);

        if (primaryResult.error) throw primaryResult.error;
        if (cohostResult.error) throw cohostResult.error;

        // Merge + dedupe (an event could in principle appear in both lists if
        // a user's primary org is also a cohost — guard with a Map by id).
        const eventMap = new Map<string, CohostEventRow>();
        for (const e of (primaryResult.data ?? []) as CohostEventRow[]) {
          eventMap.set(e.id, e);
        }
        for (const row of cohostResult.data) {
          const e = row.events;
          // Filter cohost events to requires_rsvp=true here since the join
          // can't apply a WHERE on the embedded table directly.
          if (e && e.requires_rsvp && !eventMap.has(e.id)) {
            eventMap.set(e.id, e);
          }
        }
        const events = Array.from(eventMap.values());
        const eventIds = events.map(e => e.id);

        // Narrow RSVP count query to the resolved event set, and filter to
        // pending at the DB so the loop is a straight count.
        const rsvpsResult = eventIds.length > 0
          ? await client
              .from("rsvps")
              .select("event_id")
              .eq("status", "pending")
              .in("event_id", eventIds)
          : { data: [] as { event_id: string }[], error: null };

        if (rsvpsResult.error) throw rsvpsResult.error;

        const pendingRsvps = (rsvpsResult.data ?? []) as { event_id: string }[];

        // Group pending RSVPs by event_id for the display badge.
        const pendingByEvent = new Map<string, number>();
        for (const r of pendingRsvps) {
          pendingByEvent.set(
            r.event_id,
            (pendingByEvent.get(r.event_id) ?? 0) + 1
          );
        }

        // Include all RSVP-required events (match web — no filter by "has RSVPs")
        const rsvpEvents: RsvpEventData[] = events.map((e) => {
          const tz = safeTimezone(e.timezone);
          return {
          id: e.id,
          eventName: e.name,
          eventImageUrl:
            e.image_url ||
            "https://placehold.co/100x100/1a1a2e/ffffff?text=No+Image",
          date: formatEventDate(e.starts_at, tz),
          timeRange: buildTimeRange(e.starts_at, e.ends_at, tz, e.city),
          location: buildLocation(e.venue, e.city),
          pendingRequests: pendingByEvent.get(e.id) ?? 0,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
        };
        });

        // Sort: most pending first, then by name
        rsvpEvents.sort((a, b) => {
          if (b.pendingRequests !== a.pendingRequests)
            return b.pendingRequests - a.pendingRequests;
          return a.eventName.localeCompare(b.eventName);
        });

        const { currentEvents, pastEvents } = separateEventsByDate(rsvpEvents);

        return { currentEvents, pastEvents };
      } catch (err) {
        console.error("[useRsvpEvents]", {
          action: "queryFn_failed",
          userId,
          error: err instanceof Error ? err.stack : err,
        });
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    // null means "still loading assignments" — hold the query so organizers
    // never temporarily see all org events while useAssignedEvents is in-flight.
    enabled: Boolean(isSignedIn && isConfigured && userId && orgData?.organizationId && assignedEventIds !== null),
  });
}

// =========================================================================
// Hook 2: useEventRsvps — all RSVPs for a specific event
// =========================================================================

export function useEventRsvps(eventId: string | undefined) {
  const { getToken, isSignedIn, isConfigured } = useOptionalAuth();

  return useQuery<UseEventRsvpsResult>({
    queryKey: ["event-rsvps", eventId],
    queryFn: async () => {
      if (!eventId) throw new Error("eventId is required");

      try {
        const client = await getAuthenticatedClient(getToken);

        // Parallel: RSVPs + event's registration_form_config
        const [rsvpsResult, eventResult] = await Promise.all([
          client
            .from("rsvps")
            .select(RSVP_DETAIL_SELECT)
            .eq("event_id", eventId)
            .order("requested_at", { ascending: false }),
          client
            .from("events")
            .select("registration_form_config, ends_at, currency, name, timezone")
            .eq("id", eventId)
            .single(),
        ]);

        if (rsvpsResult.error) throw rsvpsResult.error;
        if (eventResult.error) throw eventResult.error;

        const rawRsvps = (rsvpsResult.data ?? []) as RsvpDetailRow[];

        const configParse = z
          .array(FormFieldSchema)
          .nullable()
          .safeParse(eventResult.data?.registration_form_config ?? null);
        if (!configParse.success) {
          console.warn("[useEventRsvps] registration_form_config failed validation", {
            eventId,
            error: configParse.error.message,
          });
        }
        const registrationFormConfig: FormField[] | null = configParse.success
          ? configParse.data
          : null;

        // Map to component-friendly shape — normalize status here so both
        // the visible cards and the stats loop below use identical values.
        const rsvps: RsvpRequestData[] = rawRsvps.map((r) => {
          const tier = unwrapSingle(r.ticket_tier);
          const tierName = tier?.name ?? "Unknown";
          const stageName = r.stage_name;
          const displayTier = stageName
            ? `${tierName}/ ${stageName}`
            : tierName;
          const tierExportLine = stageName
            ? `${tierName} - ${stageName}`
            : tierName;
          const userRow = unwrapSingle(r.user);

          // Normalize known DB statuses to RsvpStatus. "purchased" is the
          // post-payment state for paid RSVPs and collapses to "approved".
          // Any other unexpected status is "unknown" — never silently "approved".
          let status: RsvpStatus;
          if (r.status === "pending") status = "pending";
          else if (r.status === "rejected") status = "rejected";
          else if (r.status === "expired") status = "expired";
          else if (r.status === "approved" || r.status === "purchased") status = "approved";
          else status = "unknown";

          return {
            id: r.id,
            personName: getUserName(r.user),
            personId: getDocumentId(r.user),
            tierName: displayTier,
            tierExportLine,
            ticketCount: r.requested_quantity,
            requestDate: formatStatusDate(r.requested_at) ?? "",
            requestedAtIso: r.requested_at,
            email: userRow?.email?.trim() || "",
            price: getDisplayPrice(r),
            status,
            statusDate:
              status === "approved"
                ? formatStatusDate(r.approved_at)
                : status === "rejected"
                  ? formatStatusDate(r.rejected_at)
                  : undefined,
            registrationData: r.registration_data,
          };
        });

        // Compute stats from normalized rsvps — guarantees stats and visible
        // cards always reflect the same status values.
        const stats: RsvpDetailStats = { total: 0, pending: 0, approved: 0, rejected: 0, expired: 0 };
        for (const r of rsvps) {
          if (r.status === "pending") stats.pending++;
          else if (r.status === "approved") stats.approved++;
          else if (r.status === "rejected") stats.rejected++;
          else if (r.status === "expired") stats.expired++;
          // "unknown" status is intentionally excluded from all buckets
        }
        stats.total = stats.pending + stats.approved + stats.rejected + stats.expired;

        const ev = eventResult.data as {
          ends_at?: string;
          currency?: string;
          name?: string;
          timezone?: string | null;
        };
        const endsAt = ev.ends_at;
        const isPastEvent = endsAt ? new Date(endsAt) < new Date() : false;

        const currency = ev.currency ?? undefined;
        return {
          rsvps,
          stats,
          registrationFormConfig,
          isPastEvent,
          currency,
          eventName: ev.name ?? "",
          eventTimezone: ev.timezone ?? null,
        };
      } catch (err) {
        console.error("[useEventRsvps]", {
          action: "queryFn_failed",
          eventId,
          error: err instanceof Error ? err.stack : err,
        });
        throw err;
      }
    },
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 15_000,
    retry: false,
    enabled: Boolean(eventId && isSignedIn && isConfigured),
  });
}

// =========================================================================
// Hook 3: useRsvpActions — approve/reject mutations via web API
// =========================================================================

export function useRsvpActions(eventId: string | undefined) {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["event-rsvps", eventId] });
    queryClient.invalidateQueries({ queryKey: ["rsvp-events"] });
    queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
  };

  const showError = (action: string, err: unknown) => {
    const msg =
      err instanceof ApiError ? err.message : "An unexpected error occurred.";
    const title =
      err instanceof ApiError && err.status === 409
        ? "Already Processed"
        : err instanceof ApiError && err.status === 400
          ? "Cannot Process"
          : "Server Error";
    Alert.alert(title, `Failed to ${action} RSVP: ${msg}`);
  };

  const optimisticUpdate = (rsvpId: string, newStatus: RsvpStatus) => {
    queryClient.setQueryData<UseEventRsvpsResult>(
      ["event-rsvps", eventId],
      (old) => {
        if (!old) return old;
        const prev = old.rsvps.find((r) => r.id === rsvpId);
        const hasPrev = Boolean(prev);
        const prevStatus = prev?.status;
        return {
          ...old,
          rsvps: old.rsvps.map((r) =>
            r.id === rsvpId ? { ...r, status: newStatus } : r
          ),
          // Only update stats when the RSVP is present in the cache;
          // if hasPrev is false we can't compute a valid delta — leave stats
          // unchanged and let onSettled's invalidate correct them.
          stats: hasPrev
            ? {
                total: old.stats.total,
                pending: Math.max(
                  0,
                  old.stats.pending - (prevStatus === "pending" ? 1 : 0)
                ),
                approved:
                  old.stats.approved +
                  (newStatus === "approved" ? 1 : 0) -
                  (prevStatus === "approved" ? 1 : 0),
                rejected:
                  old.stats.rejected +
                  (newStatus === "rejected" ? 1 : 0) -
                  (prevStatus === "rejected" ? 1 : 0),
                expired:
                  old.stats.expired +
                  (newStatus === "expired" ? 1 : 0) -
                  (prevStatus === "expired" ? 1 : 0),
              }
            : old.stats,
        };
      }
    );
  };

  const approveMutation = useMutation({
    mutationFn: async (rsvpId: string) => {
      return apiPatch(
        `/api/organizer/rsvps/${rsvpId}/approve`,
        {},
        getToken
      );
    },
    onMutate: async (rsvpId) => {
      await queryClient.cancelQueries({ queryKey: ["event-rsvps", eventId] });
      const previous = queryClient.getQueryData<UseEventRsvpsResult>([
        "event-rsvps",
        eventId,
      ]);
      optimisticUpdate(rsvpId, "approved");
      return { previous };
    },
    onError: (err, _rsvpId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["event-rsvps", eventId], context.previous);
      }
      showError("approve", err);
    },
    onSettled: () => invalidate(),
  });

  const rejectMutation = useMutation({
    mutationFn: async (rsvpId: string) => {
      return apiPatch(
        `/api/organizer/rsvps/${rsvpId}/reject`,
        {},
        getToken
      );
    },
    onMutate: async (rsvpId) => {
      await queryClient.cancelQueries({ queryKey: ["event-rsvps", eventId] });
      const previous = queryClient.getQueryData<UseEventRsvpsResult>([
        "event-rsvps",
        eventId,
      ]);
      optimisticUpdate(rsvpId, "rejected");
      return { previous };
    },
    onError: (err, _rsvpId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["event-rsvps", eventId], context.previous);
      }
      showError("reject", err);
    },
    onSettled: () => invalidate(),
  });

  return {
    approve: approveMutation.mutate,
    reject: rejectMutation.mutate,
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,
    processingId:
      approveMutation.isPending
        ? (approveMutation.variables as string | undefined)
        : rejectMutation.isPending
          ? (rejectMutation.variables as string | undefined)
          : undefined,
  };
}
