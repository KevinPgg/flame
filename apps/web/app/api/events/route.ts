import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "../../lib/supabase/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_TIMEZONES,
  getDefaultFixedFeeCents,
  formatCentsAsPrice,
  normalizeOptionalTicketTierSecretCode,
  MAX_TICKET_TIERS_PER_EVENT,
} from "@project-flame/lib";
import { sendDateChangeEmail } from "../../lib/email/date-change-notifications";
import { fetchCompletedOrderBuyers, inBatches } from "../../lib/utils/event-recipients";
import { sendPushToEventTicketHolders } from "../../lib/push-notifications";
import { notifyFollowersOfNewEvent } from "../../lib/follower-notifications";
import { requireEventAccess } from "@/app/lib/utils/event-access";
import { canCreateEvents, canManageAccessCodes, sanitizeLineup, type OrgMemberRole } from "@project-flame/lib";
import {
  ensureUniquePublishedSlug,
  ExhaustedSlugError,
} from "../../lib/utils/slug-uniqueness";

const currencyCodes = SUPPORTED_CURRENCIES.map((c) => c.code) as [string, ...string[]];
const timezoneValues = SUPPORTED_TIMEZONES.map((t) => t.value) as [string, ...string[]];

// Event creation schema with strict validation
// NOTE: ends_at is REQUIRED (not optional) - this ensures all events have end dates
// Combined with database NOT NULL constraint, it's impossible to create events without ends_at
const createEventSchema = z.object({
  event: z.object({
    organization_id: z.string().uuid(),
    name: z.string().min(1, "Event name is required").max(200),
    slug: z
      .string()
      .min(1, "Slug is required")
      .max(100)
      .regex(
        /^[a-z0-9-]+$/,
        "Slug can only contain lowercase letters, numbers, and hyphens"
      ),
    city: z.string().min(1, "City is required").max(100),
    venue: z.string().min(1, "Venue is required").max(200),
    starts_at: z.string().datetime(), // REQUIRED - no .optional()
    ends_at: z.string().datetime(), // REQUIRED - no .optional()
    description: z.string().optional(),
    image_url: z.string().url().optional().or(z.literal("")),
    status: z.enum(["published"]).default("published"),
    requires_rsvp: z.boolean().default(true), // Whether event requires RSVP approval
    currency: z.enum(currencyCodes).default("USD"),
    timezone: z.enum(timezoneValues).default("America/Guayaquil"),
    // Fase 4.3 line-up: checked and normalized with sanitizeLineup (@project-flame/lib).
    lineup: z.unknown().optional(),
    registration_form_config: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          type: z.enum(["text", "email", "date", "number", "checkbox"]),
          required: z.boolean().optional(),
          placeholder: z.string().optional(),
          archived: z.boolean().optional(),
        })
      )
      .optional(),
  }),
  ticket_tiers: z
    .array(
      z.object({
        name: z.string().min(1, "Tier name is required").max(100),
        price_cents: z.number().int().min(0),
        quantity_total: z.number().int().min(1),
        per_user_limit: z.number().int().min(1).max(50),
        // Optional/null — defaults to server "now" at insert (matches ticket-tiers POST + CreateEventForm)
        sales_start: z.string().datetime().nullable().optional(),
        sales_end: z.string().datetime(),
        secret_code: z
          .string()
          .max(200)
          .nullable()
          .optional()
          .refine(
            (v) => {
              if (v == null) return true;
              const normalized = normalizeOptionalTicketTierSecretCode(v);
              return normalized === null || normalized.length >= 3;
            },
            { message: "Access code must be at least 3 characters." },
          ),
        useStages: z.boolean().default(false),
        stages: z
          .array(
            z.object({
              name: z.string().min(1, "Stage name is required").max(100),
              price_cents: z.number().int().min(0),
              quantity: z.number().int().min(1),
              // W4-C2 (May 2026): per-stage description (max 120 chars).
              description: z.string().max(120).nullable().optional(),
            })
          )
          .optional(),
        registration_form_fields: z
          .array(z.string())
          .max(50)
          .nullable()
          .optional(),
        // W4-C1 (May 2026): organizer toggles. Both default false at the DB level
        // so omitting them in initial event creation is fine.
        is_manually_sold_out: z.boolean().optional(),
        is_hidden: z.boolean().optional(),
        // W4-C2 (May 2026): tier-level description. ticket_tiers.description has
        // existed since baseline; the column was just unused in this surface.
        description: z.string().max(120).nullable().optional(),
      })
    )
    .min(1, "At least one ticket tier is required")
    .max(
      MAX_TICKET_TIERS_PER_EVENT,
      `Maximum ${MAX_TICKET_TIERS_PER_EVENT} tiers allowed per event`,
    ),
});

/**
 * GET /api/events
 *
 * Retrieves published events with filtering options.
 *
 * Query Parameters:
 * - filter: "active" (default, events that haven't ended) | "all" (all events)
 * - slug: Filter by specific event slug
 * - requires_rsvp: "true" (RSVP-required events) | "false" (direct purchase events)
 *
 * Returns events with their organizations, ticket tiers, and ticket stages.
 */
export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const filterType = searchParams.get("filter");
    const slug = searchParams.get("slug");
    const requiresRsvp = searchParams.get("requires_rsvp");

    // Validate filter parameter if provided
    if (filterType && filterType !== "active" && filterType !== "all") {
      return NextResponse.json(
        {
          error: `Invalid filter parameter: "${filterType}". Must be "active" or "all"`,
        },
        { status: 400 }
      );
    }

    // Validate requires_rsvp parameter if provided
    if (requiresRsvp && requiresRsvp !== "true" && requiresRsvp !== "false") {
      return NextResponse.json(
        {
          error: `Invalid requires_rsvp parameter: "${requiresRsvp}". Must be "true" or "false"`,
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Build query with organizations and ticket tiers (including stages for accurate pricing)
    // NOTE: We can't use a subquery to count pending RSVPs in the Supabase select,
    // so we'll fetch events first, then enrich with RSVP counts
    let query = supabaseAdmin
      .from("events")
      .select(
        `
        id,
        organization_id,
        name,
        slug,
        city,
        venue,
        starts_at,
        ends_at,
        description,
        image_url,
        status,
        requires_rsvp,
        currency,
        timezone,
        created_at,
        updated_at,
        organizations (
          name,
          slug
        ),
        ticket_tiers (
          id,
          name,
          price_cents,
          quantity_total,
          quantity_sold,
          per_user_limit,
          sales_start,
          sales_end,
          is_manually_sold_out,
          is_hidden,
          description,
          ticket_stages (
            id,
            name,
            price_cents,
            quantity,
            sold_quantity,
            order_index,
            description
          )
        )
      `
      )
      .eq("status", "published");

    // Filter by slug if provided
    if (slug) {
      query = query.eq("slug", slug);
    }

    // Filter by RSVP requirement if provided
    if (requiresRsvp) {
      query = query.eq("requires_rsvp", requiresRsvp === "true");
    }

    // Apply date filtering at database level for efficiency
    // Default to "active" unless explicitly set to "all" or slug is provided
    const shouldFilterActive =
      filterType === "active" || (!filterType && !slug);

    if (shouldFilterActive) {
      // Only return events that haven't ended yet (all events have ends_at)
      query = query.gt("ends_at", now);
    }

    // Order by start date
    query = query.order("starts_at", { ascending: true });

    const { data: events, error } = await query;

    if (error) {
      console.error("Error fetching events:", error);
      return NextResponse.json(
        { error: "Failed to fetch events" },
        { status: 500 }
      );
    }

    // Enrich events with pending RSVP counts AND active holds per tier
    if (events && events.length > 0) {
      // Get all tier IDs across all events
      const allTierIds = events.flatMap(
        (event: any) => event.ticket_tiers?.map((tier: any) => tier.id) || []
      );

      if (allTierIds.length > 0) {
        // Count pending/approved RSVPs for each tier
        const { data: rsvpCounts } = await supabaseAdmin
          .from("rsvps")
          .select("ticket_tier_id, requested_quantity")
          .in("ticket_tier_id", allTierIds)
          .in("status", ["pending", "approved"]);

        // Count active (non-expired) holds (tickets in checkout)
        // CRITICAL: Filter by order_id IS NULL to exclude converted holds
        // (converted holds are already counted in quantity_sold via orders)
        const { data: holdCounts } = await supabaseAdmin
          .from("holds")
          .select("tier_id, quantity")
          .in("tier_id", allTierIds)
          .gt("expires_at", new Date().toISOString())
          .is("order_id", null); // Exclude holds that have been converted to orders

        // Aggregate counts by tier_id (RSVPs + active holds)
        const tierReservedMap: Record<string, number> = {};

        // Add RSVPs to reserved count
        if (rsvpCounts) {
          rsvpCounts.forEach((rsvp: any) => {
            tierReservedMap[rsvp.ticket_tier_id] =
              (tierReservedMap[rsvp.ticket_tier_id] || 0) +
              (rsvp.requested_quantity || 0);
          });
        }

        // Add active holds to reserved count
        if (holdCounts) {
          holdCounts.forEach((hold: any) => {
            tierReservedMap[hold.tier_id] =
              (tierReservedMap[hold.tier_id] || 0) + (hold.quantity || 0);
          });
        }

        // Add quantity_reserved to each tier
        events.forEach((event: any) => {
          if (event.ticket_tiers) {
            event.ticket_tiers.forEach((tier: any) => {
              tier.quantity_reserved = tierReservedMap[tier.id] || 0;
            });
          }
        });
      }
    }

    // W4-C1 (May 2026): GET /api/events is the unauthenticated attendee-facing
    // listing endpoint. The web event detail page (/events/[slug]) goes through
    // the get_event_with_tiers RPC which already filters is_hidden tiers; this
    // list endpoint is a direct table read so we strip them in memory before
    // returning. Sold-out badges still work correctly because is_manually_sold_out
    // is forwarded and `isTierAvailable()` honors it.
    if (events) {
      events.forEach((event: any) => {
        if (Array.isArray(event.ticket_tiers)) {
          event.ticket_tiers = event.ticket_tiers.filter(
            (tier: { is_hidden?: boolean }) => tier.is_hidden !== true,
          );
        }
      });
    }

    return NextResponse.json(events || []);
  } catch (error) {
    console.error("Error in GET /api/events:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    // Get the Supabase user
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      return NextResponse.json(
        { error: "User not found in database" },
        { status: 404 }
      );
    }

    // Verify user belongs to the organization
    const body = await req.json();
    const validatedData = createEventSchema.parse(body);

    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("*")
      .eq("user_id", supabaseUser.id)
      .eq("organization_id", validatedData.event.organization_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        {
          error:
            "You don't have permission to create events for this organization",
        },
        { status: 403 }
      );
    }

    // Only owner/admin create events (canCreateEvents) — the web and app already hide the
    // button for organizers; before 2026-10-15 the API accepted any member.
    if (!canCreateEvents((membership.role ?? null) as OrgMemberRole | null)) {
      return NextResponse.json(
        { error: "Only owners and admins can create events for this organization" },
        { status: 403 }
      );
    }

    // Verify organization is approved (exempt admins from this check)
    if (supabaseUser.role !== "admin") {
      const { data: organization } = await supabaseAdmin
        .from("organizations")
        .select("approved")
        .eq("id", validatedData.event.organization_id)
        .single();

      if (!organization?.approved) {
        return NextResponse.json(
          {
            error:
              "Your organization is pending approval. You cannot create events until your organization is approved by our team.",
          },
          { status: 403 }
        );
      }
    }

    // Within-org uniqueness: an organizer trying to reuse their own slug is a
    // UX signal (duplicate event name) — reject so they pick a different name.
    const { data: existingEvent } = await supabaseAdmin
      .from("events")
      .select("id")
      .eq("organization_id", validatedData.event.organization_id)
      .eq("slug", validatedData.event.slug)
      .maybeSingle();

    if (existingEvent) {
      return NextResponse.json(
        { error: "An event with this URL slug already exists" },
        { status: 400 }
      );
    }

    // Cross-org uniqueness: another org may have published an event with the
    // same slug. The public URL /events/{slug} can't disambiguate, so we
    // auto-suffix here. Partial unique index events_slug_unique_published
    // enforces this at the DB level as a race-condition-safe fallback.
    let finalSlug: string;
    try {
      finalSlug = await ensureUniquePublishedSlug(
        validatedData.event.slug,
        supabaseAdmin
      );
    } catch (slugError) {
      // Exhaustion is transient — 5 random suffixes all collided with
      // currently-published slugs. A resubmit rolls fresh suffixes and will
      // almost certainly win. 409 tells the client to retry.
      if (slugError instanceof ExhaustedSlugError) {
        console.warn("Slug suffix exhaustion:", slugError.message);
        return NextResponse.json(
          {
            error:
              "Could not generate a unique URL for this event. Please try again.",
          },
          { status: 409 }
        );
      }
      // Anything else (DB connection drop, RLS misconfiguration, etc.) is a
      // real server error the client can't recover from by retrying alone.
      console.error("Error ensuring unique slug:", slugError);
      return NextResponse.json(
        {
          error:
            "Could not generate a unique URL for this event. Please try again later.",
        },
        { status: 500 }
      );
    }

    // Validate dates - this logic EXACTLY mirrors frontend validation in CreateEventForm.tsx
    // Any changes here MUST be replicated in the frontend to prevent inconsistencies
    const now = new Date();
    const startsAt = new Date(validatedData.event.starts_at);
    const endsAt = new Date(validatedData.event.ends_at);

    // Check if start date is at least 2 hours in the future
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    if (startsAt < twoHoursFromNow) {
      return NextResponse.json(
        { error: "Event start time must be at least 2 hours in the future" },
        { status: 400 }
      );
    }

    if (endsAt <= startsAt) {
      return NextResponse.json(
        { error: "End date must be after start date" },
        { status: 400 }
      );
    }

    // Resolve each tier's effective sales_start once so validation and insertion
    // use the identical timestamp (avoids drift from two separate new Date() calls).
    const resolvedSalesStarts: string[] = validatedData.ticket_tiers.map(
      (tier) => tier.sales_start ?? new Date().toISOString()
    );

    // Validate ticket tier dates and staged pricing
    for (let tierIdx = 0; tierIdx < validatedData.ticket_tiers.length; tierIdx++) {
      const tier = validatedData.ticket_tiers[tierIdx];
      const salesStartIso = resolvedSalesStarts[tierIdx];
      const salesStart = new Date(salesStartIso);
      const salesEnd = new Date(tier.sales_end);

      if (Number.isNaN(salesEnd.getTime())) {
        return NextResponse.json(
          { error: `Ticket tier "${tier.name}": Invalid sales end date` },
          { status: 400 }
        );
      }
      if (Number.isNaN(salesStart.getTime())) {
        return NextResponse.json(
          { error: `Ticket tier "${tier.name}": Invalid sales start date` },
          { status: 400 }
        );
      }
      if (salesEnd <= salesStart) {
        return NextResponse.json(
          { error: "Ticket sales end date must be after start date" },
          { status: 400 }
        );
      }
      if (salesEnd > endsAt) {
        return NextResponse.json(
          {
            error: `Ticket tier "${tier.name}": Sales must end before the event ends`,
          },
          { status: 400 }
        );
      }

      // Validate staged pricing configuration if enabled
      if (tier.useStages && tier.stages && tier.stages.length > 0) {
        // Calculate total quantity across all stages
        const totalStageQuantity = tier.stages.reduce(
          (sum, stage) => sum + stage.quantity,
          0
        );

        // Ensure stage quantities match tier total
        if (totalStageQuantity !== tier.quantity_total) {
          return NextResponse.json(
            {
              error: `Ticket tier "${tier.name}": Stage quantities total (${totalStageQuantity}) must equal tier total quantity (${tier.quantity_total})`,
            },
            { status: 400 }
          );
        }

        // Validate each stage
        for (let i = 0; i < tier.stages.length; i++) {
          const stage = tier.stages[i];

          // Ensure stage has a name
          if (!stage.name || stage.name.trim().length === 0) {
            return NextResponse.json(
              {
                error: `Ticket tier "${tier.name}": Stage ${
                  i + 1
                } must have a name`,
              },
              { status: 400 }
            );
          }

          // Ensure stage has a valid price
          if (stage.price_cents < 0) {
            return NextResponse.json(
              {
                error: `Ticket tier "${tier.name}": Stage "${stage.name}" has invalid price`,
              },
              { status: 400 }
            );
          }

          // Warn about unusually high prices (potential cents vs dollars mistake)
          const PRICE_WARNING_THRESHOLD = 1000000; // $10,000 in cents
          if (stage.price_cents > PRICE_WARNING_THRESHOLD) {
            const dollarAmount = formatCentsAsPrice(stage.price_cents, validatedData.event.currency.toUpperCase());
            console.warn(
              `Ticket tier "${tier.name}": Stage "${stage.name}" has unusually high price of ${dollarAmount} (${stage.price_cents} cents). Please verify this is not a cents vs dollars mistake.`
            );
          }

          // Ensure stage has a valid quantity
          if (stage.quantity <= 0) {
            return NextResponse.json(
              {
                error: `Ticket tier "${tier.name}": Stage "${stage.name}" must have at least 1 ticket`,
              },
              { status: 400 }
            );
          }
        }

        // Optional: Validate that stages are in ascending price order (warn only)
        for (let i = 1; i < tier.stages.length; i++) {
          if (tier.stages[i].price_cents < tier.stages[i - 1].price_cents) {
            console.warn(
              `Ticket tier "${tier.name}": Stage "${tier.stages[i].name}" has a lower price than previous stage. This may confuse buyers.`
            );
          }
        }
      } else if (tier.useStages && (!tier.stages || tier.stages.length === 0)) {
        // useStages is true but no stages provided
        return NextResponse.json(
          {
            error: `Ticket tier "${tier.name}": Must have at least one stage when staged pricing is enabled`,
          },
          { status: 400 }
        );
      }
    }

    const lineupResult = sanitizeLineup(validatedData.event.lineup);
    if ("error" in lineupResult) {
      return NextResponse.json({ error: `Invalid line-up: ${lineupResult.error}` }, { status: 400 });
    }

    // Create event and ticket tiers in a transaction
    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .insert({
        organization_id: validatedData.event.organization_id,
        name: validatedData.event.name,
        slug: finalSlug,
        city: validatedData.event.city,
        venue: validatedData.event.venue,
        starts_at: validatedData.event.starts_at,
        ends_at: validatedData.event.ends_at,
        description: validatedData.event.description || null,
        image_url: validatedData.event.image_url || null,
        status: validatedData.event.status,
        requires_rsvp: validatedData.event.requires_rsvp,
        currency: validatedData.event.currency.toUpperCase(),
        timezone: validatedData.event.timezone,
        markup_fixed_cents: getDefaultFixedFeeCents(validatedData.event.currency),
        ...(lineupResult.lineup.length > 0 && { lineup: lineupResult.lineup }),
        ...(validatedData.event.registration_form_config &&
          validatedData.event.registration_form_config.length > 0 && {
            registration_form_config:
              validatedData.event.registration_form_config,
          }),
      })
      .select()
      .single();

    if (eventError) {
      console.error("Error creating event:", eventError);

      // Two 23505 unique-violation paths can surface here:
      //   1. events_slug_unique_published — race between
      //      ensureUniquePublishedSlug's check and the insert (another org
      //      just published a colliding slug).
      //   2. events_organization_id_slug_key — the suffixed slug picked by
      //      ensureUniquePublishedSlug happens to already exist as a draft
      //      in the caller's own org. Probability is ~0 (4-char base36
      //      suffix ≈ 1.7M combos), but still possible.
      // Both are transient — a resubmit rolls a fresh suffix that will win.
      // Translate to 409 with the same retryable message so the client UX
      // is identical in either case.
      if (
        eventError.code === "23505" &&
        (((eventError as any).constraint === "events_slug_unique_published" ||
          eventError.message?.includes("events_slug_unique_published")) ||
          ((eventError as any).constraint === "events_organization_id_slug_key" ||
            eventError.message?.includes("events_organization_id_slug_key")))
      ) {
        return NextResponse.json(
          {
            error:
              "Another event with this URL was just created. Please try again.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to create event" },
        { status: 500 }
      );
    }

    // Create ticket tiers and their stages
    const tierInserts = validatedData.ticket_tiers.map((tier, index) => ({
      event_id: event.id,
      name: tier.name,
      price_cents: tier.price_cents,
      quantity_total: tier.quantity_total,
      per_user_limit: tier.per_user_limit,
      sales_start: resolvedSalesStarts[index],
      sales_end: tier.sales_end,
      secret_code: normalizeOptionalTicketTierSecretCode(tier.secret_code),
      order_index: index,
      currency: validatedData.event.currency.toUpperCase(),
      registration_form_fields: tier.registration_form_fields ?? null,
      // W4-C1 (May 2026): organizer toggles. DB defaults to false; pass through
      // explicit values when the API consumer sets them.
      ...(tier.is_manually_sold_out !== undefined && {
        is_manually_sold_out: tier.is_manually_sold_out,
      }),
      ...(tier.is_hidden !== undefined && { is_hidden: tier.is_hidden }),
      // W4-C2 (May 2026): tier-level description.
      ...(tier.description !== undefined && {
        description: tier.description ?? null,
      }),
    }));

    const { data: tiers, error: tierError } = await supabaseAdmin
      .from("ticket_tiers")
      .insert(tierInserts)
      .select();

    if (tierError) {
      console.error("Error creating ticket tiers:", tierError);
      // Clean up the event if tier creation failed
      await supabaseAdmin.from("events").delete().eq("id", event.id);
      return NextResponse.json(
        { error: "Failed to create ticket tiers" },
        { status: 500 }
      );
    }

    // Create ticket stages for each tier (only if useStages is enabled)
    const stageInserts: any[] = [];
    tiers.forEach((tier, tierIndex) => {
      const originalTier = validatedData.ticket_tiers[tierIndex];
      if (
        originalTier.useStages &&
        originalTier.stages &&
        originalTier.stages.length > 0
      ) {
        originalTier.stages.forEach((stage, stageIndex) => {
          stageInserts.push({
            ticket_tier_id: tier.id,
            name: stage.name,
            price_cents: stage.price_cents,
            quantity: stage.quantity,
            order_index: stageIndex,
            currency: validatedData.event.currency.toUpperCase(),
            // W4-C2 (May 2026): per-stage description, optional.
            ...(stage.description !== undefined && {
              description: stage.description ?? null,
            }),
          });
        });
      }
    });

    if (stageInserts.length > 0) {
      const { error: stageError } = await supabaseAdmin
        .from("ticket_stages")
        .insert(stageInserts);

      if (stageError) {
        console.error("Error creating ticket stages:", stageError);

        // Clean up the event and tiers if stage creation failed
        let cleanupErrors: string[] = [];

        try {
          const { error: tierCleanupError } = await supabaseAdmin
            .from("ticket_tiers")
            .delete()
            .eq("event_id", event.id);

          if (tierCleanupError) {
            cleanupErrors.push(
              `Failed to delete ticket tiers: ${tierCleanupError.message}`
            );
          }
        } catch (error) {
          cleanupErrors.push(`Exception deleting ticket tiers: ${error}`);
        }

        try {
          const { error: eventCleanupError } = await supabaseAdmin
            .from("events")
            .delete()
            .eq("id", event.id);

          if (eventCleanupError) {
            cleanupErrors.push(
              `Failed to delete event: ${eventCleanupError.message}`
            );
          }
        } catch (error) {
          cleanupErrors.push(`Exception deleting event: ${error}`);
        }

        // Log cleanup errors but don't override the original stage creation error
        if (cleanupErrors.length > 0) {
          console.error(
            "Cleanup errors after stage creation failure:",
            cleanupErrors
          );
        }

        return NextResponse.json(
          {
            error: "Failed to create ticket stages",
            cleanup_errors:
              cleanupErrors.length > 0 ? cleanupErrors : undefined,
          },
          { status: 500 }
        );
      }
    }

    // ⚡ INSTANT UPDATE: Revalidate organizer dashboard cache
    // This makes the new event appear immediately without waiting for 60s cache
    revalidatePath("/organizer");
    revalidatePath("/events");

    // Fase 4.2 (decision of Kevin 2026-11-02): tell the organization's followers. After the
    // response, so publishing does not wait for the fan-out; never fails the request.
    const announce = () => notifyFollowersOfNewEvent(event);
    try {
      after(announce);
    } catch {
      void announce(); // outside a request scope (tests / scripts)
    }

    return NextResponse.json({
      event,
      ticket_tiers: tiers,
    });
  } catch (error) {
    console.error("Error in POST /api/events:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Schema for event updates
const updateEventSchema = z.object({
  id: z.string().uuid(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  venue: z.string().min(1).max(200).optional(),
  city: z.string().min(1).max(100).optional(),
  description: z.string().max(520).optional().or(z.literal("")), // Short description; empty string to clear (matches CreateEventForm maxLength)
  image_url: z.string().url().optional().or(z.literal("")), // Supabase Storage URL or empty string to remove
  qr_scanner_code: z
    .string()
    .min(4)
    .max(8)
    .regex(/^[A-Z0-9]+$/, "Code must be uppercase alphanumeric")
    .optional()
    .or(z.literal("")), // Empty string to clear
  registration_form_config: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        type: z.enum(["text", "email", "date", "number", "checkbox"]),
        required: z.boolean().optional(),
        placeholder: z.string().optional(),
        archived: z.boolean().optional(),
      })
    )
    .optional()
    .or(z.literal(null)), // null to clear
  // Fase 4.3 line-up: [] clears it; checked with sanitizeLineup.
  lineup: z.unknown().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    // Get the Supabase user
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      return NextResponse.json(
        { error: "User not found in database" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const validatedData = updateEventSchema.parse(body);

    // Get the event to verify ownership
    const { data: event } = await supabaseAdmin
      .from("events")
      .select("*, organizations!inner(id)")
      .eq("id", validatedData.id)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Verify user belongs to the organization
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("*")
      .eq("user_id", supabaseUser.id)
      .eq("organization_id", event.organization_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        {
          error:
            "You don't have permission to update events for this organization",
        },
        { status: 403 }
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(supabaseAdmin, supabaseUser.id, event.id, event.organization_id);
    if (denied) return denied;

    // The door access code is owner/admin only (canManageAccessCodes; the app hides it for others).
    if (validatedData.qr_scanner_code !== undefined && !canManageAccessCodes(membership.role)) {
      return NextResponse.json({ error: "Only owners and admins can change the access code" }, { status: 403 });
    }

    // Validate dates if provided
    if (validatedData.starts_at || validatedData.ends_at) {
      const now = new Date();
      const startsAt = validatedData.starts_at
        ? new Date(validatedData.starts_at)
        : new Date(event.starts_at);
      const endsAt = validatedData.ends_at
        ? new Date(validatedData.ends_at)
        : new Date(event.ends_at);

      // Check if start date is at least 2 hours in the future
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      if (startsAt < twoHoursFromNow) {
        return NextResponse.json(
          { error: "Event start time must be at least 2 hours in the future" },
          { status: 400 }
        );
      }

      // Validate that event end time is after start time
      if (endsAt <= startsAt) {
        return NextResponse.json(
          { error: "End date must be after start date" },
          { status: 400 }
        );
      }
    }

    // Build update object with only provided fields
    const updateData: any = {};
    if (validatedData.starts_at) updateData.starts_at = validatedData.starts_at;
    if (validatedData.ends_at) updateData.ends_at = validatedData.ends_at;
    if (validatedData.venue) updateData.venue = validatedData.venue;
    if (validatedData.city) updateData.city = validatedData.city;
    if (validatedData.description !== undefined) {
      updateData.description = validatedData.description || null;
    }
    // Allow updating image_url (including empty string to remove image)
    if (validatedData.image_url !== undefined) {
      updateData.image_url = validatedData.image_url || null;
    }
    if (validatedData.qr_scanner_code !== undefined) {
      updateData.qr_scanner_code = validatedData.qr_scanner_code || null;
    }
    if (validatedData.registration_form_config !== undefined) {
      updateData.registration_form_config =
        validatedData.registration_form_config === null ||
        (Array.isArray(validatedData.registration_form_config) &&
          validatedData.registration_form_config.length === 0)
          ? null
          : validatedData.registration_form_config;
    }

    if (validatedData.lineup !== undefined) {
      const lineupResult = sanitizeLineup(validatedData.lineup);
      if ("error" in lineupResult) {
        return NextResponse.json({ error: `Invalid line-up: ${lineupResult.error}` }, { status: 400 });
      }
      updateData.lineup = lineupResult.lineup;
    }

    // Update the event
    const { data: updatedEvent, error: updateError } = await supabaseAdmin
      .from("events")
      .update(updateData)
      .eq("id", validatedData.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating event:", updateError);

      // Handle unique constraint violation (Postgres error 23505)
      // Check for the specific constraint name (events_qr_scanner_code_unique) or fall back to message content
      const isUniqueConstraintViolation =
        updateError.code === "23505" &&
        ((updateError as any).constraint === "events_qr_scanner_code_unique" ||
          updateError.message?.includes("events_qr_scanner_code_unique") ||
          updateError.message?.includes("qr_scanner_code"));

      if (isUniqueConstraintViolation) {
        return NextResponse.json(
          { error: "This access code is already in use by another event" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to update event" },
        { status: 500 }
      );
    }

    // ⚡ INSTANT UPDATE: Revalidate cache after updating event
    revalidatePath("/organizer");
    revalidatePath("/events");
    revalidatePath(`/events/${event.slug}`); // Also revalidate the specific event page

    // 📧 DATE CHANGE NOTIFICATIONS: Send emails to ticket holders if date changed
    // Convert dates to numeric timestamps for reliable comparison across formats/timezones
    const startsAtChanged =
      validatedData.starts_at && event.starts_at
        ? new Date(validatedData.starts_at).getTime() !==
          new Date(event.starts_at).getTime()
        : false;
    const endsAtChanged =
      validatedData.ends_at && event.ends_at
        ? new Date(validatedData.ends_at).getTime() !==
          new Date(event.ends_at).getTime()
        : false;
    const dateChanged = startsAtChanged || endsAtChanged;

    if (dateChanged) {
      // Every buyer with a completed order (all pages — the old single query stopped at 1000
      // orders), e-mailed in small batches so Brevo isn't hit with thousands of calls at once.
      try {
        const buyers = await fetchCompletedOrderBuyers(supabaseAdmin, validatedData.id);
        if (buyers.length > 0) {
          const { data: organization } = await supabaseAdmin
            .from("organizations")
            .select("name")
            .eq("id", event.organization_id)
            .single();

          const failed = await inBatches(buyers, 10, (user) =>
            sendDateChangeEmail({
              userEmail: user.email,
              userName: user.name,
              eventName: updatedEvent.name,
              eventVenue: updatedEvent.venue,
              oldStartDate: event.starts_at,
              oldEndDate: event.ends_at,
              newStartDate: updatedEvent.starts_at,
              newEndDate: updatedEvent.ends_at,
              eventSlug: updatedEvent.slug,
              organizationName: organization?.name || "Event Organizer",
              eventTimezone: updatedEvent.timezone || "America/Guayaquil",
            })
          );
          console.log(
            `📧 Date change notifications for ${updatedEvent.name}: ${buyers.length - failed}/${buyers.length} sent`
          );
        }
      } catch (err) {
        // The event is already updated; a failed notification must not turn the save into an error.
        console.error("❌ Failed to send date change emails:", err);
      }

      // Push notification: send to all ticket holders (tickets table), not gated by completed orders
      sendPushToEventTicketHolders(
        updatedEvent.id,
        "event_date_changed",
        "Event Date Changed",
        `${updatedEvent.name} has been rescheduled. Check the new dates.`,
        {
          deepLink: `/event/${updatedEvent.slug || updatedEvent.id}`,
          eventId: updatedEvent.id,
        },
      ).catch((err) => console.error("[push] event_date_changed failed:", err));
    }

    return NextResponse.json(updatedEvent);
  } catch (error) {
    console.error("Error in PATCH /api/events:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
