import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { normalizeOptionalTicketTierSecretCode } from "@project-flame/lib";
import { supabaseAdmin } from "../../../lib/supabase/server";

const pendingRsvpSchema = z.object({
  eventId: z.string().uuid(),
  ticketTierId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  stageId: z.string().uuid().nullish(),
  secretCode: z.string().trim().min(3).nullish(),
  promoterCode: z.string().nullish(),
  // Note: z.any() is intentional here because registration forms are dynamic and event-specific.
  // Schema validation happens in the main RSVP endpoint against the event's form config.
  // This endpoint only stores the data temporarily for 3DS redirects.
  registrationData: z.record(z.string(), z.any()).nullish(),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      if (e instanceof SyntaxError) {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 }
        );
      }
      throw e;
    }

    const {
      eventId,
      ticketTierId,
      quantity,
      stageId,
      secretCode,
      promoterCode,
      registrationData,
    } = pendingRsvpSchema.parse(body);

    // Use upsert to handle cases where user retries after a failed payment attempt
    // This prevents duplicate key errors from the unique constraint on (clerk_user_id, event_id)
    const { data, error } = await supabaseAdmin
      .from("rsvp_pending_requests")
      .upsert(
        {
          clerk_user_id: userId,
          event_id: eventId,
          ticket_tier_id: ticketTierId,
          quantity,
          stage_id: stageId ?? null,
          secret_code: normalizeOptionalTicketTierSecretCode(secretCode),
          promoter_code: promoterCode || null,
          registration_data: registrationData ?? null,
          // Reset expiration time on retry
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
        },
        {
          onConflict: "clerk_user_id,event_id", // Update if user+event combination exists
        }
      )
      .select("id")
      .single();

    if (error || !data) {
      console.error("Failed to create/update pending RSVP request:", error);
      return NextResponse.json(
        { error: "Failed to save RSVP details" },
        { status: 500 }
      );
    }

    return NextResponse.json({ pendingRsvpId: data.id });
  } catch (error) {
    console.error("Pending RSVP API error:", error);
    
    // Distinguish validation errors (400) from server errors (500)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: "Invalid request data",
          details: error.issues 
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to save RSVP details" },
      { status: 500 }
    );
  }
}
