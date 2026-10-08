import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { z } from "zod";
import { normalizeTicketTierSecretCode } from "@project-flame/lib";

// Validation schema for code validation
const validateCodeSchema = z.object({
  ticket_tier_id: z.string().uuid(),
  secret_code: z.string().trim().min(3, "Secret code must be at least 3 characters"),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId || !supabaseAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validationResult = validateCodeSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { ticket_tier_id, secret_code: rawSecret } = validationResult.data;
    const secret_code = normalizeTicketTierSecretCode(rawSecret);

    // Fetch the tier and its secret code (server-side only)
    const { data: ticketTier, error: tierError } = await supabaseAdmin
      .from("ticket_tiers")
      .select("id, secret_code")
      .eq("id", ticket_tier_id)
      .single();

    if (tierError || !ticketTier) {
      return NextResponse.json(
        { error: "Ticket tier not found" },
        { status: 404 }
      );
    }

    // Check if tier requires a secret code
    if (!ticketTier.secret_code) {
      return NextResponse.json(
        {
          error: "This ticket tier does not require an access code",
          code: "NO_CODE_REQUIRED",
        },
        { status: 400 }
      );
    }

    if (
      normalizeTicketTierSecretCode(ticketTier.secret_code) !== secret_code
    ) {
      return NextResponse.json(
        {
          error: "Invalid access code",
          code: "INVALID_SECRET_CODE",
        },
        { status: 403 }
      );
    }

    // Code is valid
    return NextResponse.json(
      {
        valid: true,
        message: "Access code verified",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error validating access code:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

