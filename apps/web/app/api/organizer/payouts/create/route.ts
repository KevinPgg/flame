import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { stripe } from "@/app/lib/stripe/stripe";
import Stripe from "stripe";
import {
  SUPPORTED_CURRENCIES,
  formatCentsAsPrice,
  payoutMinimumCents,
} from "@project-flame/lib";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!supabaseAdmin) {
      console.error("Supabase admin client not initialized");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Helper for canonicalizing origins
    const getCanonicalOrigin = (urlString: string | null): string | null => {
      if (!urlString) return null;
      try {
        const url = new URL(urlString);
        return `${url.protocol}//${url.hostname}${
          url.port && url.port !== "80" && url.port !== "443"
            ? `:${url.port}`
            : ""
        }`;
      } catch (e) {
        return null;
      }
    };

    // CSRF validation: Validate Origin/Referer header against allowed hosts
    // This protects against cross-site request forgery attacks
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");

    // Get allowed origins from environment and build exact origin strings
    const allowedOriginUrls = [
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      // Allow localhost for development
      process.env.NODE_ENV === "development" ? "http://localhost:3000" : null,
    ].filter(Boolean) as string[];

    // Parse allowed origins into canonical origin strings (protocol://hostname:port)
    const allowedOrigins = new Set<string>();
    for (const urlString of allowedOriginUrls) {
      const canonical = getCanonicalOrigin(urlString);
      if (canonical) {
        allowedOrigins.add(canonical);
      } else {
        console.warn("Invalid URL in allowed origins:", urlString);
      }
    }

    // Detect server misconfiguration: empty allowedOrigins would block all requests
    if (allowedOrigins.size === 0) {
      console.error("CSRF misconfiguration: No valid allowed origins", {
        allowedOriginUrls,
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
        VERCEL_URL: process.env.VERCEL_URL,
        userId,
      });
      return NextResponse.json(
        {
          error:
            "Server configuration error: CSRF protection not properly configured",
        },
        { status: 500 }
      );
    }

    // Validate origin by exact origin equality (no startsWith to prevent subdomain bypass)
    let isValidOrigin = false;
    if (origin) {
      const canonicalOrigin = getCanonicalOrigin(origin);
      if (canonicalOrigin) {
        isValidOrigin = allowedOrigins.has(canonicalOrigin);
      }
    }

    // Validate referer by parsing its origin and exact matching
    let isValidReferer = false;
    if (referer) {
      const refererOrigin = getCanonicalOrigin(referer);
      if (refererOrigin) {
        isValidReferer = allowedOrigins.has(refererOrigin);
      }
    }

    if (!isValidOrigin && !isValidReferer) {
      console.error("CSRF validation failed", {
        origin,
        referer,
        allowedOrigins: Array.from(allowedOrigins),
        userId,
      });
      return NextResponse.json(
        { error: "CSRF validation failed" },
        { status: 403 }
      );
    }

    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch (err) {
      // Log error details server-side for debugging
      console.error("Invalid JSON body in payout request:", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Return generic error to client (don't leak internal error details)
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { organizationId, clientIdempotencyKey, currency: requestedCurrency } = body;
    const validCodes = new Set(SUPPORTED_CURRENCIES.map((c) => c.code.toUpperCase()));
    const payoutCurrency =
      typeof requestedCurrency === "string" &&
      requestedCurrency.length === 3 &&
      validCodes.has(requestedCurrency.toUpperCase())
        ? requestedCurrency.toLowerCase()
        : "usd";

    if (typeof organizationId !== "string" || organizationId.trim() === "") {
      return NextResponse.json(
        { error: "Organization ID required" },
        { status: 400 }
      );
    }

    // Validate and sanitize clientIdempotencyKey before constructing idempotencyKey
    // Stripe has a 255 character limit for idempotency keys
    // Reserve space for prefix "payout-" (7 chars), accountId (acct_ + ~24 chars = ~29 chars), and separator "-" (1 char)
    // Total prefix: 7 + 29 + 1 = 37 chars
    // Max client key: 255 - 37 = 218 chars (use 215 to be safe)
    const MAX_CLIENT_KEY_LENGTH = 215;
    const ALLOWED_CHARS_REGEX = /^[A-Za-z0-9_-]+$/;

    if (
      clientIdempotencyKey !== undefined &&
      clientIdempotencyKey !== null &&
      typeof clientIdempotencyKey !== "string"
    ) {
      return NextResponse.json(
        { error: "Idempotency key must be a string." },
        { status: 400 }
      );
    }

    if (typeof clientIdempotencyKey === "string" && clientIdempotencyKey) {
      if (clientIdempotencyKey.length > MAX_CLIENT_KEY_LENGTH) {
        return NextResponse.json(
          {
            error: `Idempotency key too long. Maximum ${MAX_CLIENT_KEY_LENGTH} characters allowed.`,
          },
          { status: 400 }
        );
      }

      if (!ALLOWED_CHARS_REGEX.test(clientIdempotencyKey)) {
        return NextResponse.json(
          {
            error:
              "Invalid idempotency key. Only alphanumeric characters, hyphens, and underscores are allowed.",
          },
          { status: 400 }
        );
      }
    }

    // Verify membership - only admin or owner can create payouts
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();
      
    if (userError || !user) {
      console.error("Error fetching user for payout:", userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Only allow admin or owner roles to create payouts
    const allowedRoles = ["admin", "owner"];
    if (!allowedRoles.includes(membership.role?.toLowerCase())) {
      return NextResponse.json(
        { error: "Insufficient permissions. Admin or owner role required." },
        { status: 403 }
      );
    }

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("stripe_account_id")
      .eq("id", organizationId)
      .maybeSingle();

    if (orgError) {
        console.error("Error fetching organization for payout:", orgError);
        return NextResponse.json(
            { error: "Organization lookup failed" },
            { status: 500 }
        );
    }

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    if (!org.stripe_account_id) {
      return NextResponse.json(
        { error: "Organization not connected to Stripe" },
        { status: 400 }
      );
    }

    const accountId = org.stripe_account_id;

    // IMPORTANT: Advisory locks have limitations with connection pooling and may not
    // protect the critical section reliably. The primary protection comes from:
    // 1. Stripe's idempotency keys (organization-scoped, not user-scoped)
    // 2. Application-level check for recent pending payouts
    // 3. Stripe's balance validation (will reject if insufficient funds)

    // Check for recent pending/processing payouts to prevent race conditions
    // Look for payouts in the last 5 minutes that are still processing
    try {
      // Query Stripe for recent payouts on this account
      // Using limit 100 (Stripe's maximum) to reduce false negatives in high-activity accounts
      const recentPayouts = await stripe.payouts.list(
        {
          limit: 100,
          created: { gte: Math.floor(Date.now() / 1000) - 300 }, // Last 5 minutes
        },
        { stripeAccount: accountId }
      );

      // Check if any are still pending or in transit
      const inProgressPayout = recentPayouts.data.find(
        p => p.status === "pending" || p.status === "in_transit"
      );

      if (inProgressPayout) {
        return NextResponse.json(
          {
            error:
              "A payout is already in progress. Please wait for it to complete.",
            payoutId: inProgressPayout.id,
          },
          { status: 409 }
        );
      }
    } catch (payoutCheckError) {
      console.error("Error checking recent payouts:", payoutCheckError);
      // Continue anyway - Stripe's idempotency will catch duplicates
    }

    const balance = await stripe.balance.retrieve({ stripeAccount: accountId });
    const available = balance.available.find(b => b.currency === payoutCurrency);

    if (!available || available.amount <= 0) {
      return NextResponse.json(
        { error: `No ${payoutCurrency.toUpperCase()} funds available for payout` },
        { status: 400 }
      );
    }

    // Check Stripe's minimum payout threshold per currency
    const minCents = payoutMinimumCents(payoutCurrency);
    if (available.amount < minCents) {
      const formattedMin = formatCentsAsPrice(minCents, payoutCurrency);
      return NextResponse.json(
        { error: `Minimum payout amount is ${formattedMin}` },
        { status: 400 }
      );
    }

    // Create Payout with organization-scoped idempotency key to prevent duplicates
    // CRITICAL: Do NOT include user.id in the key - this would allow different admins
    // to create concurrent payouts for the same organization with different keys.
    // Use client-provided key if available, otherwise generate a time-windowed key.
    // Time window (5 minutes) matches the recent payout check and prevents rapid duplicate requests.
    // Include available amount so requests with different balances produce distinct keys.
    const timeWindowMinutes = Math.floor(Date.now() / (1000 * 60 * 5)); // 5-minute window
    const idempotencyKey = clientIdempotencyKey
      ? `payout-${accountId}-${clientIdempotencyKey}`
      : `payout-${accountId}-${timeWindowMinutes}-${available.amount}`;

    // Final guard: Ensure idempotency key doesn't exceed Stripe's 255-character limit
    // This protects against edge cases where accountId or other components are unexpectedly long
    const STRIPE_MAX_IDEMPOTENCY_KEY_LENGTH = 255;
    if (idempotencyKey.length > STRIPE_MAX_IDEMPOTENCY_KEY_LENGTH) {
      console.error("Idempotency key exceeds Stripe limit", {
        keyLength: idempotencyKey.length,
        maxLength: STRIPE_MAX_IDEMPOTENCY_KEY_LENGTH,
        accountId,
        organizationId,
      });
      return NextResponse.json(
        { error: "Request parameters too long. Please contact support." },
        { status: 400 }
      );
    }

    const payout = await stripe.payouts.create(
      {
        amount: available.amount,
        currency: payoutCurrency,
      },
      {
        stripeAccount: accountId,
        idempotencyKey: idempotencyKey,
      }
    );

    // Persist payout metadata for audit trails
    // Store payout details for compliance, debugging, and user accountability
    try {
      await supabaseAdmin.from("payout_logs").insert({
        stripe_payout_id: payout.id,
        organization_id: organizationId,
        amount: payout.amount,
        currency: payout.currency,
        requested_by: user.id,
        status: payout.status,
        arrival_date: payout.arrival_date
          ? new Date(payout.arrival_date * 1000).toISOString()
          : null,
        created_at: new Date(payout.created * 1000).toISOString(),
      });
    } catch (logError) {
      // Non-blocking: Log error but don't fail the payout response
      // The payout was successful in Stripe; audit log failure is secondary
      console.error("Failed to persist payout audit log:", {
        error: logError,
        payoutId: payout.id,
        organizationId,
      });
    }

    return NextResponse.json({ payout });
  } catch (error) {
    console.error("Payout Creation Error:", error);

    // Surface specific Stripe error types for better client handling
    if (error instanceof Stripe.errors.StripeRateLimitError) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    if (error instanceof Stripe.errors.StripeError) {
      // Handle specific error codes that should return 400 instead of 500
      if (error.code === "balance_insufficient") {
        return NextResponse.json(
          { error: "Insufficient balance for payout" },
          { status: 400 }
        );
      }

      // Handle other Stripe API/connection errors as 503
      if (
        error.type === "StripeAPIError" ||
        error.type === "StripeConnectionError"
      ) {
        return NextResponse.json(
          { error: "Payment service temporarily unavailable. Please try again later." },
          { status: 503 }
        );
      }

      // Other Stripe errors (invalid request, etc.) return 400
      return NextResponse.json(
        { error: error.message || "Payment processing error" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
