/**
 * Shared utility functions for fetching and processing purchase data
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { extractBasePriceHistorical } from "@project-flame/lib";
import { z, ZodError } from "zod";
import { selectAllPagesByIds } from "./supabase-pagination";

/**
 * Interface for a purchase record
 */
export interface Purchase {
  id: string;
  userName: string;
  email: string;
  tierName: string;
  stageName: string | null;
  quantity: number;
  pricePerTicket: number;
  totalPrice: number; // Full price including service fee
  basePrice: number; // Base price only (what organizer receives) - excludes service fee
  scanned: boolean;
  rsvpStatus: string;
  createdAt: string;
  /**
   * Registration form answers from the matching RSVP, when the event has a
   * `registration_form_config` and we successfully joined an RSVP via
   * `stripe_payment_intent_id`. `null` for non-RSVP events or when the join
   * yielded nothing.
   */
  registrationData?: Record<string, unknown> | null;
}

// Zod schemas for validation
const OrderUserSchema = z.object({
  id: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string(),
});

const OrderTicketTierSchema = z.object({
  id: z.string(),
  name: z.string(),
  price_cents: z.number(),
});

const OrderTicketSchema = z.object({
  id: z.string(),
  checked_in_at: z.string().nullable(),
  metadata: z
    .record(z.string(), z.unknown())
    .nullable()
    .transform((val) => val as { stage_name?: string; [key: string]: unknown } | null),
});

const OrderRowSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  user_id: z.string(),
  quantity: z.number(),
  unit_price_cents: z.number(),
  total_amount_cents: z.number(),
  discount_amount_cents: z.number().nullable(),
  fee_percentage: z.number().nullable(),
  base_price_cents: z.number().nullable(),
  status: z.string(),
  payment_provider: z.string().nullable(),
  stripe_payment_intent_id: z.string().nullable().optional(),
  created_at: z.string(),
  users: OrderUserSchema,
  ticket_tiers: OrderTicketTierSchema,
  tickets: z.array(OrderTicketSchema),
  inferredStageName: z.string().nullable().optional(),
});

type OrderRow = z.infer<typeof OrderRowSchema>;

const StageLookupRowSchema = z.object({
  ticket_tier_id: z.string(),
  price_cents: z.number(),
  name: z.string(),
});

type StageLookupRow = z.infer<typeof StageLookupRowSchema>;

const ORDER_SELECT = `
        id,
        event_id,
        user_id,
        quantity,
        unit_price_cents,
        total_amount_cents,
        discount_amount_cents,
        fee_percentage,
        base_price_cents,
        status,
        payment_provider,
        stripe_payment_intent_id,
        created_at,
        users!orders_user_id_fkey (
          id,
          first_name,
          last_name,
          email
        ),
        ticket_tiers!inner (
          id,
          name,
          price_cents
        ),
        tickets (
          id,
          checked_in_at,
          metadata
        )
      `;

type PurchaseOptions = {
  extractBasePriceHistoricalFn?: typeof extractBasePriceHistorical;
};

/**
 * Fetch completed orders (purchases) for a specific event with user and tier details
 * @param supabaseAdmin - The Supabase admin client
 * @param eventId - The event ID to fetch purchases for
 * @returns Array of purchases or empty array on error
 */
export async function fetchEventPurchases(
  supabaseAdmin: SupabaseClient,
  eventId: string,
  options?: PurchaseOptions & {
    /**
     * When true, fetch matching `rsvps.registration_data` and attach it to
     * each Purchase via `stripe_payment_intent_id`. Skipped for non-RSVP
     * events to keep the query cheap.
     */
    includeRegistrationData?: boolean;
  },
): Promise<Purchase[]> {
  const byEvent = await fetchEventPurchasesForEvents(supabaseAdmin, [eventId], {
    extractBasePriceHistoricalFn: options?.extractBasePriceHistoricalFn,
    registrationEventIds: options?.includeRegistrationData === true ? [eventId] : [],
  });
  return byEvent.get(eventId) ?? [];
}

/**
 * Purchases for many events with a fixed number of queries (orders, stages, registration answers),
 * each paged past PostgREST's 1000-row cap. Same rules as the per-event version it replaces:
 * completed/paid orders, bank transfers excluded, net price per order (stored base price, or the
 * historical extraction for legacy orders), stage from ticket metadata or (tier, price) lookup.
 *
 * Errors never throw: if the orders of a chunk of events can't be read, those events get []
 * (and it is logged) — same as the per-event behavior.
 */
export async function fetchEventPurchasesForEvents(
  supabaseAdmin: SupabaseClient,
  eventIds: string[],
  options?: PurchaseOptions & {
    /** Events whose purchases should carry the RSVP registration answers (events with a form). */
    registrationEventIds?: Iterable<string>;
  },
): Promise<Map<string, Purchase[]>> {
  const result = new Map<string, Purchase[]>();
  for (const id of eventIds) result.set(id, []);
  if (eventIds.length === 0) return result;

  const extractBasePriceHistoricalFn =
    options?.extractBasePriceHistoricalFn ?? extractBasePriceHistorical;
  const registrationEvents = new Set(options?.registrationEventIds ?? []);

  try {
    // Orders for all events, paged; a failing chunk leaves its events empty.
    const rawOrders: unknown[] = [];
    try {
      rawOrders.push(
        ...(await selectAllPagesByIds<unknown>(eventIds, (ids, from, to) =>
          supabaseAdmin
            .from("orders")
            .select(ORDER_SELECT)
            .in("event_id", ids)
            .in("status", ["completed", "paid"])
            // Exclude bank transfer orders from revenue and attendee count
            .neq("payment_provider", "bank_transfer")
            .order("id", { ascending: true })
            .range(from, to),
        )),
      );
    } catch (ordersError) {
      console.error("Error fetching orders for events", eventIds.length, ordersError);
      return result;
    }

    // Use safeParse to filter out invalid records instead of crashing the entire request
    const orders: OrderRow[] = [];
    for (const rawOrder of rawOrders as Array<{ id?: string }>) {
      const parsed = OrderRowSchema.safeParse(rawOrder);
      if (parsed.success) {
        orders.push(parsed.data);
      } else {
        // Log only sanitized metadata - do not expose PII or full error objects
        const issueSummaries = parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));
        console.error(
          `[fetchEventPurchases] Validation failed for order ${rawOrder.id}:`,
          {
            orderId: rawOrder.id,
            issues: issueSummaries,
            issueCount: parsed.error.issues.length,
          },
        );
      }
    }

    // Stage names for orders whose tickets don't carry one: one lookup by tier, filtered
    // in memory to the (tier, unit price) pairs we need.
    const ordersNeedingStageLookup = orders.filter((order) => {
      const firstTicket = order.tickets?.[0];
      return (
        !firstTicket?.metadata?.stage_name &&
        order.ticket_tiers?.id &&
        order.unit_price_cents !== undefined &&
        order.unit_price_cents !== null
      );
    });
    const stageLookupMap = new Map<string, string>();
    if (ordersNeedingStageLookup.length > 0) {
      const uniqueTierPricePairs = new Set(
        ordersNeedingStageLookup.map((o) => `${o.ticket_tiers.id}:${o.unit_price_cents}`),
      );
      const tierIds = Array.from(new Set(ordersNeedingStageLookup.map((o) => o.ticket_tiers.id)));
      let stagesData: unknown[] | null = null;
      try {
        stagesData = await selectAllPagesByIds<unknown>(tierIds, (ids, from, to) =>
          supabaseAdmin
            .from("ticket_stages")
            .select("ticket_tier_id, price_cents, name")
            .in("ticket_tier_id", ids)
            .order("id", { ascending: true })
            .range(from, to),
        );
      } catch (stagesError) {
        // Continue with empty stageLookupMap - orders will have null stage names
        console.error("Error fetching ticket stages for tiers", tierIds, stagesError);
      }
      if (stagesData) {
        let stages: StageLookupRow[] = [];
        try {
          stages = StageLookupRowSchema.array().parse(stagesData);
        } catch (validationError) {
          console.warn("Ticket stage data validation failed for tiers", tierIds, validationError);
        }
        for (const stage of stages) {
          const key = `${stage.ticket_tier_id}:${stage.price_cents}`;
          if (uniqueTierPricePairs.has(key)) stageLookupMap.set(key, stage.name);
        }
      }
    }

    // paymentIntentId → registration_data for events with a registration form. Orders match
    // RSVPs by stripe_payment_intent_id (unique on both tables for paid RSVPs), so a user with
    // several RSVPs for the same event/tier still resolves to the right submission.
    const registrationDataByPaymentIntent = new Map<string, Record<string, unknown>>();
    const paymentIntentIds = Array.from(
      new Set(
        orders
          .filter((o) => registrationEvents.has(o.event_id))
          .map((o) => o.stripe_payment_intent_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    );
    if (paymentIntentIds.length > 0) {
      try {
        const rsvpRows = await selectAllPagesByIds<{
          event_id?: string;
          stripe_payment_intent_id?: string | null;
          registration_data?: unknown;
          status?: unknown;
        }>(paymentIntentIds, (ids, from, to) =>
          supabaseAdmin
            .from("rsvps")
            .select("id, event_id, stripe_payment_intent_id, registration_data, status")
            .in("stripe_payment_intent_id", ids)
            .order("id", { ascending: true })
            .range(from, to),
        );
        // Prefer status='purchased' over 'approved' if both exist for the same payment intent
        // (shouldn't happen — payment intents are unique per RSVP — but guard anyway).
        const statusPriority = (s: unknown): number =>
          s === "purchased" ? 2 : s === "approved" ? 1 : 0;
        const bestByPi = new Map<string, { priority: number; data: Record<string, unknown> }>();
        for (const row of rsvpRows) {
          const pi = row.stripe_payment_intent_id;
          const data = row.registration_data;
          if (!pi || !row.event_id || !registrationEvents.has(row.event_id)) continue;
          if (!data || typeof data !== "object" || Array.isArray(data)) continue;
          const priority = statusPriority(row.status);
          const existing = bestByPi.get(pi);
          if (!existing || priority > existing.priority) {
            bestByPi.set(pi, { priority, data: data as Record<string, unknown> });
          }
        }
        for (const [pi, { data }] of bestByPi.entries()) {
          registrationDataByPaymentIntent.set(pi, data);
        }
      } catch (rsvpError) {
        console.error("Error fetching RSVP registration_data", rsvpError);
      }
    }

    for (const order of orders) {
      const purchases = result.get(order.event_id);
      if (!purchases) continue;
      purchases.push(
        toPurchase(order, stageLookupMap, registrationDataByPaymentIntent, registrationEvents, extractBasePriceHistoricalFn),
      );
    }
    return result;
  } catch (error) {
    console.error("Error in fetchEventPurchasesForEvents:", error);
    return new Map(eventIds.map((id) => [id, []]));
  }
}

function toPurchase(
  order: OrderRow,
  stageLookupMap: Map<string, string>,
  registrationDataByPaymentIntent: Map<string, Record<string, unknown>>,
  registrationEvents: Set<string>,
  extractBasePriceHistoricalFn: typeof extractBasePriceHistorical,
): Purchase {
  // Stage name from the first ticket's metadata (all tickets in an order share the stage),
  // or from the (tier, unit price) lookup.
  const firstTicket = order.tickets?.[0];
  let stageName: string | null = firstTicket?.metadata?.stage_name || null;
  if (
    !stageName &&
    order.ticket_tiers?.id &&
    order.unit_price_cents !== undefined &&
    order.unit_price_cents !== null
  ) {
    stageName = stageLookupMap.get(`${order.ticket_tiers.id}:${order.unit_price_cents}`) || null;
  }

  const hasScannedTicket = order.tickets?.some((ticket) => !!ticket.checked_in_at);

  // Concatenate first and last name, fall back to email
  const fullName =
    order.users.first_name && order.users.last_name
      ? `${order.users.first_name} ${order.users.last_name}`
      : order.users.first_name || order.users.last_name || order.users.email;

  // Base price the organizer receives. PRIORITY: stored base_price_cents (Stripe Guaranteed
  // Net model, already discounted); otherwise historical extraction for legacy Datafast orders.
  const totalCents = order.total_amount_cents || 0;
  const discountCents = order.discount_amount_cents || 0;
  let actualBasePrice: number;
  if (order.base_price_cents !== null && order.base_price_cents !== undefined) {
    actualBasePrice = order.base_price_cents;
  } else {
    const subtotalBeforeDiscount = totalCents + discountCents;
    const priceBreakdown = extractBasePriceHistoricalFn(
      subtotalBeforeDiscount,
      order.created_at,
      order.fee_percentage,
    );
    // For legacy orders, apply discount proportion to extracted base price
    actualBasePrice = priceBreakdown.basePriceCents;
    if (discountCents > 0 && subtotalBeforeDiscount > 0) {
      const discountProportion = Math.min(Math.max(discountCents / subtotalBeforeDiscount, 0), 1);
      actualBasePrice = Math.max(0, Math.round(priceBreakdown.basePriceCents * (1 - discountProportion)));
    }
  }

  const registrationData =
    registrationEvents.has(order.event_id) && order.stripe_payment_intent_id
      ? registrationDataByPaymentIntent.get(order.stripe_payment_intent_id) ?? null
      : null;

  return {
    id: order.id,
    userName: fullName,
    email: order.users.email,
    tierName: order.ticket_tiers.name,
    stageName,
    quantity: order.quantity,
    pricePerTicket: order.unit_price_cents,
    totalPrice: totalCents,
    basePrice: actualBasePrice, // Base price after discount (what organizer actually receives)
    scanned: hasScannedTicket,
    rsvpStatus: "purchased",
    createdAt: order.created_at,
    registrationData,
  };
}
