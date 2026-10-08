/**
 * Shared utility functions for fetching and processing purchase data
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { extractBasePriceHistorical } from "@project-flame/lib";
import { z, ZodError } from "zod";
import { retrySupabaseOperation } from "./supabase-retry";

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

/**
 * Fetch completed orders (purchases) for a specific event with user and tier details
 * @param supabaseAdmin - The Supabase admin client
 * @param eventId - The event ID to fetch purchases for
 * @returns Array of purchases or empty array on error
 */
export async function fetchEventPurchases(
  supabaseAdmin: SupabaseClient,
  eventId: string,
  options?: {
    /**
     * When true, fetch matching `rsvps.registration_data` and attach it to
     * each Purchase via `stripe_payment_intent_id`. Skipped for non-RSVP
     * events to keep the query cheap.
     */
    includeRegistrationData?: boolean;
    extractBasePriceHistoricalFn?: typeof extractBasePriceHistorical;
  },
): Promise<Purchase[]> {
  const extractBasePriceHistoricalFn =
    options?.extractBasePriceHistoricalFn ?? extractBasePriceHistorical;
  const includeRegistrationData = options?.includeRegistrationData === true;
  try {
    // Fetch completed orders with user and tier details
    // Use users!orders_user_id_fkey to specify the user_id relationship (not promoter_user_id)
    const { data: ordersData, error: ordersError } = await retrySupabaseOperation(
      async () =>
        await supabaseAdmin
          .from("orders")
          .select(
            `
        id,
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
      `,
          )
          .eq("event_id", eventId)
          .in("status", ["completed", "paid"])
          .neq("payment_provider", "bank_transfer"),
    ); // Exclude bank transfer orders from revenue and attendee count

    if (ordersError) {
      console.error("Error fetching orders for event", eventId, ordersError);
      return [];
    }

    // Cast the result to our typed interface with Zod validation
    // Use safeParse to filter out invalid records instead of crashing the entire request
    const orders: OrderRow[] = [];
    const rawOrders = ordersData ?? [];
    
    for (const rawOrder of rawOrders) {
      const result = OrderRowSchema.safeParse(rawOrder);
      if (result.success) {
        orders.push(result.data);
      } else {
        // Log only sanitized metadata - do not expose PII or full error objects
        const issueSummaries = result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));
        console.error(
          `[fetchEventPurchases] Validation failed for order ${rawOrder.id}:`,
          {
            orderId: rawOrder.id,
            issues: issueSummaries,
            issueCount: result.error.issues.length,
          }
        );
        // Continue processing other orders
      }
    }

    // Build purchase details from completed orders
    // First, get all unique tier+price combinations that need stage lookup
    const ordersNeedingStageLookup = orders.filter((order) => {
      const firstTicket = order.tickets?.[0];
      return (
        !firstTicket?.metadata?.stage_name &&
        order.ticket_tiers?.id &&
        order.unit_price_cents !== undefined &&
        order.unit_price_cents !== null
      );
    });

    // Fetch all stages in a single query for orders missing stage info
    // Optimized: Only filter by ticket_tier_id to avoid Cartesian product, filter by price in-memory
    const stageLookupMap = new Map<string, string>();
    if (ordersNeedingStageLookup.length > 0) {
      const uniqueTierPricePairs = new Set(
        ordersNeedingStageLookup.map(
          (o) => `${o.ticket_tiers.id}:${o.unit_price_cents}`,
        ),
      );

      const tierIds = Array.from(
        new Set(ordersNeedingStageLookup.map((o) => o.ticket_tiers.id)),
      );

      // Fetch all stages for the required tiers (avoid Cartesian product)
      const { data: stagesData, error: stagesError } = await retrySupabaseOperation(
        async () =>
          await supabaseAdmin
            .from("ticket_stages")
            .select("ticket_tier_id, price_cents, name")
            .in("ticket_tier_id", tierIds),
      );

      // Check for errors and handle missing data
      if (stagesError) {
        console.error(
          "Error fetching ticket stages for event",
          eventId,
          "tiers",
          tierIds,
          stagesError,
        );
        // Continue with empty stageLookupMap - orders will have null stage names
      } else if (!stagesData || !Array.isArray(stagesData)) {
        console.warn(
          "No ticket stages data returned for event",
          eventId,
          "tiers",
          tierIds,
        );
        // Continue with empty stageLookupMap - orders will have null stage names
      } else {
        let stages: StageLookupRow[] = [];
        try {
          stages = StageLookupRowSchema.array().parse(stagesData);
        } catch (validationError) {
          console.warn(
            "Ticket stage data validation failed for event",
            eventId,
            "tiers",
            tierIds,
            validationError,
          );
        }
        // Filter in-memory to only include the specific (tier, price) pairs we need
        stages.forEach((stage) => {
          const key = `${stage.ticket_tier_id}:${stage.price_cents}`;
          // Only include stages that match our needed (tier, price) pairs
          if (uniqueTierPricePairs.has(key)) {
            stageLookupMap.set(key, stage.name);
          }
        });
      }
    }

    // Build a paymentIntentId → registration_data lookup for RSVP events with
    // a registration form. We match orders to RSVPs via stripe_payment_intent_id
    // (unique on both tables for paid RSVPs), so a user with multiple RSVPs for
    // the same event/tier still resolves to the correct submission.
    const registrationDataByPaymentIntent = new Map<
      string,
      Record<string, unknown>
    >();
    if (includeRegistrationData) {
      const paymentIntentIds = Array.from(
        new Set(
          orders
            .map((o) => o.stripe_payment_intent_id)
            .filter((v): v is string => typeof v === "string" && v.length > 0),
        ),
      );
      if (paymentIntentIds.length > 0) {
        const { data: rsvpRows, error: rsvpError } = await retrySupabaseOperation(
          async () =>
            await supabaseAdmin
              .from("rsvps")
              .select("stripe_payment_intent_id, registration_data, status")
              .eq("event_id", eventId)
              .in("stripe_payment_intent_id", paymentIntentIds),
        );
        if (rsvpError) {
          console.error(
            "Error fetching RSVP registration_data for event",
            eventId,
            rsvpError,
          );
        } else {
          // Prefer status='purchased' over 'approved' if both exist for the
          // same payment intent (shouldn't happen — payment intents are unique
          // per RSVP — but guard anyway).
          const statusPriority = (s: unknown): number =>
            s === "purchased" ? 2 : s === "approved" ? 1 : 0;
          const bestByPi = new Map<
            string,
            { priority: number; data: Record<string, unknown> }
          >();
          for (const row of rsvpRows ?? []) {
            const pi = (row as { stripe_payment_intent_id?: string | null })
              .stripe_payment_intent_id;
            const data = (row as { registration_data?: unknown }).registration_data;
            if (
              !pi ||
              !data ||
              typeof data !== "object" ||
              Array.isArray(data)
            ) {
              continue;
            }
            const priority = statusPriority(
              (row as { status?: unknown }).status,
            );
            const existing = bestByPi.get(pi);
            if (!existing || priority > existing.priority) {
              bestByPi.set(pi, {
                priority,
                data: data as Record<string, unknown>,
              });
            }
          }
          for (const [pi, { data }] of bestByPi.entries()) {
            registrationDataByPaymentIntent.set(pi, data);
          }
        }
      }
    }

    // Enrich orders with stage information
    const enrichedOrders = orders.map((order) => {
      // Extract stage name from the first ticket's metadata (all tickets in an order should have the same stage)
      const firstTicket = order.tickets?.[0];
      let stageName = firstTicket?.metadata?.stage_name || null;

      // If stage name is missing from metadata, look it up from our map
      if (
        !stageName &&
        order.ticket_tiers?.id &&
        order.unit_price_cents !== undefined &&
        order.unit_price_cents !== null
      ) {
        const lookupKey = `${order.ticket_tiers.id}:${order.unit_price_cents}`;
        stageName = stageLookupMap.get(lookupKey) || null;
      }

      return {
        ...order,
        inferredStageName: stageName,
      };
    });

    const purchases: Purchase[] = enrichedOrders.reduce<Purchase[]>((acc, order) => {
      // Check if any ticket in this order has been checked in
      const hasScannedTicket = order.tickets?.some(
        (ticket) => !!ticket.checked_in_at,
      );

      // Use inferred stage name (from metadata or price matching)
      const stageName = order.inferredStageName || null;

      // Concatenate first and last name, fall back to email
      const fullName =
        order.users.first_name && order.users.last_name
          ? `${order.users.first_name} ${order.users.last_name}`
          : order.users.first_name ||
            order.users.last_name ||
            order.users.email;

      // Calculate the base price the organizer receives
      // PRIORITY: Use stored base_price_cents if available (Stripe Guaranteed Net model)
      // This field already contains the final discounted base price
      // Otherwise, fall back to historical extraction for legacy Datafast orders
      const totalCents = order.total_amount_cents || 0;
      const discountCents = order.discount_amount_cents || 0;

      let actualBasePrice: number;

      if (
        order.base_price_cents !== null &&
        order.base_price_cents !== undefined
      ) {
        // Stripe Guaranteed Net model: base_price_cents is the final discounted base price
        // This is the source of truth - NO further discount calculation needed
        actualBasePrice = order.base_price_cents;
      } else {
        // Legacy Datafast model: extract base price from total using historical extraction
        const subtotalBeforeDiscount = totalCents + discountCents;
        const priceBreakdown = extractBasePriceHistoricalFn(
          subtotalBeforeDiscount,
          order.created_at,
          order.fee_percentage,
        );

        // For legacy orders, apply discount proportion to extracted base price
        actualBasePrice = priceBreakdown.basePriceCents;
        if (discountCents > 0 && subtotalBeforeDiscount > 0) {
          const discountProportion = Math.min(
            Math.max(discountCents / subtotalBeforeDiscount, 0),
            1,
          );
          actualBasePrice = Math.max(
            0,
            Math.round(priceBreakdown.basePriceCents * (1 - discountProportion)),
          );
        }
      }

      const registrationData =
        includeRegistrationData && order.stripe_payment_intent_id
          ? registrationDataByPaymentIntent.get(order.stripe_payment_intent_id) ?? null
          : null;

      acc.push({
        id: order.id,
        userName: fullName,
        email: order.users.email,
        tierName: order.ticket_tiers.name,
        stageName: stageName,
        quantity: order.quantity,
        pricePerTicket: order.unit_price_cents,
        totalPrice: totalCents,
        basePrice: actualBasePrice, // Base price after discount (what organizer actually receives)
        scanned: hasScannedTicket,
        rsvpStatus: "purchased",
        createdAt: order.created_at,
        registrationData,
      });
      return acc;
    }, []);

    return purchases;
  } catch (error) {
    console.error("Error in fetchEventPurchases:", error);
    return [];
  }
}
