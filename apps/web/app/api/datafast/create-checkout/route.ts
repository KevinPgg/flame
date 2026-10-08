/**
 * @legacy — Datafast payment processor checkout route (Ecuador-specific, pre-Stripe).
 * Replaced by Stripe Connect flow in Jan 2026. This entire route is dead code
 * kept only as reference. Do NOT call or extend. See:
 *   apps/web/app/api/purchase/create-payment-intent/route.ts (active Stripe flow)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import * as crypto from "crypto";
import { maskEmail } from "../../../lib/utils/email-mask";
import { extractBasePrice } from "@project-flame/lib";
import {
  captureCheckoutError,
  CheckoutErrorCategory,
  CheckoutSeverity,
  hashUserId,
} from "../../../lib/utils/sentry-checkout";

/**
 * Masks a name for privacy-compliant logging.
 * Keeps only the first character and masks the rest.
 * @param name - The name to mask
 * @returns Masked name in format: "J***" or "" if empty
 */
function maskName(name: string | undefined | null): string {
  if (!name || name.trim().length === 0) {
    return "***";
  }
  const trimmed = name.trim();
  return trimmed.length === 1 ? trimmed : trimmed[0] + "***";
}

// Flame's markup percentage for service fee (taxable at 15% IVA)
const FLAME_MARKUP_PERCENT = parseFloat(
  process.env.NEXT_PUBLIC_FLAME_MARKUP_PERCENT || "10"
);
// Ecuador IVA rate (as of April 2024)
const ECUADOR_IVA_RATE = 0.15;

/**
 * Request body for creating a Datafast checkout session.
 *
 * @property amount - Total amount in cents (e.g., 1050 = $10.50)
 *   - If promo code is applied, this is the discounted total
 *   - For backward compatibility, if subtotal/discount_amount_cents are not provided,
 *     this will be used to extract the price breakdown
 * @property currency - Currency code (e.g., "USD")
 * @property billingInfo - Customer billing information
 * @property billingInfo.dateOfBirth - Date of birth in YYYY-MM-DD format (ISO 8601)
 *   - Server-side validation ensures format is correct and date is valid
 *   - Must be a past date (not in the future)
 *   - Example: "1990-05-15"
 * @property orderDetails - Order details including event and ticket information
 * @property promotional_code_id - Optional promotional code ID for discounts
 * @property subtotal - Optional: Original subtotal in cents BEFORE discount (for accurate tax breakdown)
 * @property discount_amount_cents - Optional: Discount amount in cents (for accurate tax breakdown)
 */
interface CreateCheckoutRequest {
  amount: number; // in cents (final total after discount)
  currency: string;
  billingInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    billingAddress: string;
    billingCity: string;
    billingCountry: string;
    documentType: string;
    documentId: string;
    dateOfBirth: string; // YYYY-MM-DD format (validated server-side)
  };
  orderDetails: {
    orderId?: string;
    eventName: string;
    ticketTierName: string;
    quantity: number;
  };
  promotional_code_id?: string | null;
  purchaseType?: "rsvp" | "hold"; // Indicates whether this is an RSVP-based or hold-based purchase
  subtotal?: number; // Optional: Original subtotal in cents BEFORE discount
  discount_amount_cents?: number; // Optional: Discount amount in cents
}

export async function POST(req: NextRequest) {
  console.log("=== START: Datafast Create Checkout ===");
  let userId: string | null = null;
  try {
    // Validate all required credentials are present (INSIDE handler to handle errors gracefully)
    if (
      !process.env.DATAFAST_URL ||
      !process.env.DATAFAST_ENTITY_ID ||
      !process.env.DATAFAST_BEARER_TOKEN ||
      !process.env.DATAFAST_MID ||
      !process.env.DATAFAST_TID ||
      !process.env.DATAFAST_SHOPPER_ECI ||
      !process.env.DATAFAST_SHOPPER_PSERV ||
      !process.env.DATAFAST_SHOPPER_VERSIONDF ||
      !process.env.DATAFAST_RISK_MERCHANT_NAME
    ) {
      console.error("❌ Missing required Datafast configuration");
      return NextResponse.json(
        { error: "Payment system configuration error" },
        { status: 500 }
      );
    }

    const DATAFAST_URL: string = process.env.DATAFAST_URL;
    const DATAFAST_ENTITY_ID: string = process.env.DATAFAST_ENTITY_ID;
    const DATAFAST_BEARER_TOKEN: string = process.env.DATAFAST_BEARER_TOKEN;
    const DATAFAST_MID: string = process.env.DATAFAST_MID;
    const DATAFAST_TID: string = process.env.DATAFAST_TID;
    const DATAFAST_SHOPPER_ECI: string = process.env.DATAFAST_SHOPPER_ECI;
    const DATAFAST_SHOPPER_PSERV: string = process.env.DATAFAST_SHOPPER_PSERV;
    const DATAFAST_SHOPPER_VERSIONDF: string =
      process.env.DATAFAST_SHOPPER_VERSIONDF;
    const DATAFAST_RISK_MERCHANT_NAME: string =
      process.env.DATAFAST_RISK_MERCHANT_NAME;

    const authResult = await auth();
    userId = authResult.userId;
    console.log("User ID:", userId);

    if (!userId) {
      console.log("ERROR: No user ID found");
      return NextResponse.json(
        { error: "You must be logged in to create a checkout session" },
        { status: 401 }
      );
    }

    if (!supabaseAdmin) {
      console.log("ERROR: No supabase admin connection");
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      );
    }

    const body: CreateCheckoutRequest = await req.json();
    console.log("Request body received");
    console.log("- Amount:", body.amount);
    console.log("- Currency:", body.currency);
    console.log("- Billing info present:", !!body.billingInfo);
    console.log("- Order details present:", !!body.orderDetails);
    console.log("- Promotional code ID:", body.promotional_code_id || "none");
    console.log("- Purchase type:", body.purchaseType || "hold (default)");
    console.log("- Subtotal (original):", body.subtotal || "not provided");
    console.log(
      "- Discount amount:",
      body.discount_amount_cents || "not provided"
    );

    const {
      amount,
      currency,
      billingInfo,
      orderDetails,
      promotional_code_id,
      purchaseType,
      subtotal,
      discount_amount_cents,
    } = body;

    // Validate required fields
    if (!amount || !currency || !billingInfo || !orderDetails) {
      console.log("ERROR: Missing required fields");
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get user's database ID for ownership verification and later use
    const { data: user } = await supabaseAdmin!
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      console.log("ERROR: User not found in database");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Validate reservation based on purchase type
    if (orderDetails.orderId) {
      // RSVP-based purchase: validate against rsvps table
      if (purchaseType === "rsvp") {
        console.log("Validating RSVP status for ID:", orderDetails.orderId);
        const { data: rsvp, error: rsvpFetchError } = await supabaseAdmin!
          .from("rsvps")
          .select("*")
          .eq("id", orderDetails.orderId)
          .single();

        if (rsvpFetchError || !rsvp) {
          console.error(
            "❌ RSVP validation failed: RSVP not found or error fetching",
            rsvpFetchError
          );
          return NextResponse.json(
            {
              error:
                "RSVP not found. Please check your email link or try again from My Account.",
            },
            { status: 404 }
          );
        }

        // Verify ownership
        if (rsvp.user_id !== user.id) {
          console.error("❌ RSVP validation failed: User mismatch");
          console.error(`RSVP user: ${rsvp.user_id}, Request user: ${user.id}`);
          return NextResponse.json(
            { error: "Invalid RSVP for this user." },
            { status: 403 }
          );
        }

        // Verify RSVP is approved
        if (rsvp.status !== "approved") {
          console.error(
            "❌ RSVP validation failed: Not approved, status:",
            rsvp.status
          );
          if (rsvp.status === "purchased") {
            return NextResponse.json(
              { error: "This RSVP has already been purchased." },
              { status: 400 }
            );
          }
          return NextResponse.json(
            { error: "Your RSVP is not approved for purchase." },
            { status: 400 }
          );
        }

        console.log("✅ RSVP validated successfully");
      } else {
        // Hold-based purchase (default): validate against holds table
        console.log("Validating hold status for ID:", orderDetails.orderId);
        const { data: hold, error: holdFetchError } = await supabaseAdmin!
          .from("holds")
          .select("*")
          .eq("id", orderDetails.orderId)
          .single();

        if (holdFetchError || !hold) {
          console.error(
            "❌ Hold validation failed: Hold not found or error fetching",
            holdFetchError
          );
          // Return more specific error message
          return NextResponse.json(
            {
              error:
                "Reservation not found. Please return to the event page to create a new reservation.",
            },
            { status: 404 }
          );
        }

        // Verify ownership (optional but recommended security check)
        // Compare Supabase user IDs, not Clerk ID vs Supabase ID
        if (hold.user_id !== user.id) {
          console.error("❌ Hold validation failed: User mismatch");
          console.error(`Hold user: ${hold.user_id}, Request user: ${user.id}`);
          // We return generic error to avoid leaking ownership info
          return NextResponse.json(
            { error: "Invalid reservation for this user." },
            { status: 403 }
          );
        }

        // Verify not used
        if (hold.order_id) {
          console.error("❌ Hold validation failed: Already purchased");
          return NextResponse.json(
            { error: "This reservation has already been paid." },
            { status: 400 }
          );
        }

        // Verify expiration
        const now = new Date();
        const expiresAt = new Date(hold.expires_at);
        if (expiresAt <= now) {
          console.error("❌ Hold validation failed: Expired");
          console.error(
            `Now: ${now.toISOString()}, Expires: ${expiresAt.toISOString()}`
          );
          return NextResponse.json(
            { error: "Reservation time has expired." },
            { status: 400 }
          );
        }

        console.log("✅ Hold validated successfully");
      }
    }

    // Validate date of birth format (YYYY-MM-DD) and validity
    if (!billingInfo.dateOfBirth) {
      console.log("ERROR: Missing date of birth");
      return NextResponse.json(
        { error: "Date of birth is required" },
        { status: 400 }
      );
    }

    // Strict regex for YYYY-MM-DD format
    const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateFormatRegex.test(billingInfo.dateOfBirth)) {
      console.log(
        "ERROR: Invalid date of birth format:",
        billingInfo.dateOfBirth
      );
      return NextResponse.json(
        {
          error:
            "Invalid date of birth format. Expected YYYY-MM-DD (e.g., 1990-05-15)",
        },
        { status: 400 }
      );
    }

    // Parse and validate the date components
    const [yearStr, monthStr, dayStr] = billingInfo.dateOfBirth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    // Create Date object in UTC (month is 0-indexed in JavaScript)
    const dateOfBirth = new Date(Date.UTC(year, month - 1, day));

    // Verify the date components match (catches invalid dates like 2023-02-30)
    if (
      dateOfBirth.getUTCFullYear() !== year ||
      dateOfBirth.getUTCMonth() !== month - 1 ||
      dateOfBirth.getUTCDate() !== day
    ) {
      console.log("ERROR: Invalid date components:", billingInfo.dateOfBirth);
      return NextResponse.json(
        {
          error:
            "Invalid date of birth. Please check the day, month, and year are correct.",
        },
        { status: 400 }
      );
    }

    // Verify date is not in the future (using UTC for consistency)
    const today = new Date();
    const todayUTC = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );
    if (dateOfBirth > todayUTC) {
      console.log(
        "ERROR: Date of birth is in the future:",
        billingInfo.dateOfBirth
      );
      return NextResponse.json(
        { error: "Date of birth cannot be in the future" },
        { status: 400 }
      );
    }

    console.log("✅ Date of birth validated:", billingInfo.dateOfBirth);

    // Get user's IP address
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";
    console.log("User IP Address:", ipAddress);

    // Convert amount from cents to dollars with 2 decimal places
    const amountInDollars = (amount / 100).toFixed(2);
    console.log(
      "Amount conversion - Cents:",
      amount,
      "Dollars:",
      amountInDollars
    );

    // Build request data according to Datafast Phase 2 specification
    // Per Datafast guide 3.2.1.6: merchantTransactionId must be unique per transaction
    // "este identificador debe ser único por transacción así sea rechazada en su primer intento"
    // We include timestamp to ensure uniqueness even for retry attempts on the same hold session
    const merchantTransactionId = `order_${
      orderDetails.orderId || "new"
    }_${Date.now()}_${userId}`;
    console.log("Generated merchantTransactionId:", merchantTransactionId);

    // Tax data - Per Datafast guide 3.2.1.17.1 Datos de Impuestos
    // Per Ecuador tax law: Ticket price is tax-exempt, but Flame's service fee/markup
    // is subject to 15% IVA (VAT). This structure is required by Datafast.
    //
    // Example: $100 ticket with 10% markup:
    //   - BASE0 (tax-exempt): $100.00 (organizer's ticket price)
    //   - BASEIMP (taxable): $10.00 (Flame's 10% markup/service fee)
    //   - IVA (15% tax on markup): $1.50 (15% of $10.00)
    //   - Total customer pays: $111.50
    //
    // When a promo code is applied, we need to calculate the breakdown from the ORIGINAL
    // price, then apply the discount proportionally. This ensures BASE0, BASEIMP, and IVA
    // are calculated correctly for tax reporting purposes.

    let priceBreakdown: ReturnType<typeof extractBasePrice>;
    let base0: string;
    let baseImponible: string;
    let ivaAmountStr: string;
    let totalAmount: number;

    // If subtotal and discount are provided, calculate breakdown from original price
    // then apply discount proportionally (for accurate tax reporting)
    if (
      subtotal !== undefined &&
      discount_amount_cents !== undefined &&
      discount_amount_cents > 0
    ) {
      console.log(
        "💰 Promo code detected - calculating breakdown from original price"
      );
      console.log("- Original subtotal (cents):", subtotal);
      console.log("- Discount amount (cents):", discount_amount_cents);
      console.log("- Final amount (cents):", amount);

      // Calculate breakdown from ORIGINAL subtotal (before discount)
      const originalBreakdown = extractBasePrice(subtotal);
      const originalBase0Cents = originalBreakdown.basePriceCents;
      const originalBaseImponibleCents = originalBreakdown.serviceFeeCents;
      const originalIvaCents = originalBreakdown.ivaCents;
      const originalTotalCents = originalBreakdown.finalPriceCents;

      console.log("Original breakdown (before discount):");
      console.log("- BASE0:", (originalBase0Cents / 100).toFixed(2));
      console.log("- BASEIMP:", (originalBaseImponibleCents / 100).toFixed(2));
      console.log("- IVA:", (originalIvaCents / 100).toFixed(2));
      console.log("- Total:", (originalTotalCents / 100).toFixed(2));

      // Apply discount proportionally to each component
      // This maintains the correct tax structure while applying the discount
      let discountRatio = 0;
      if (originalTotalCents > 0) {
        discountRatio = discount_amount_cents / originalTotalCents;
      } else {
        console.warn(
          "⚠️ Original total is zero or negative, defaulting discount ratio to 0"
        );
      }

      const discountedBase0Cents = Math.round(
        originalBase0Cents * (1 - discountRatio)
      );
      const discountedBaseImponibleCents = Math.round(
        originalBaseImponibleCents * (1 - discountRatio)
      );
      const discountedIvaCents = Math.round(
        originalIvaCents * (1 - discountRatio)
      );

      // Reconcile rounding to ensure components sum to final amount
      const calculatedTotalCents =
        discountedBase0Cents +
        discountedBaseImponibleCents +
        discountedIvaCents;
      const roundingDifference = amount - calculatedTotalCents;

      // Distribute rounding difference to IVA (smallest component, least impact)
      const finalIvaCents = Math.max(
        0,
        discountedIvaCents + roundingDifference
      );
      const finalTotalCents =
        discountedBase0Cents + discountedBaseImponibleCents + finalIvaCents;

      base0 = (discountedBase0Cents / 100).toFixed(2);
      baseImponible = (discountedBaseImponibleCents / 100).toFixed(2);
      ivaAmountStr = (finalIvaCents / 100).toFixed(2);
      totalAmount = finalTotalCents / 100;

      console.log("Discounted breakdown (after promo code):");
      console.log("- BASE0:", base0);
      console.log("- BASEIMP:", baseImponible);
      console.log("- IVA:", ivaAmountStr);
      console.log("- Total:", totalAmount.toFixed(2));

      // Validate that calculated total matches expected amount (allow 1 cent tolerance)
      const amountDifference = Math.abs(totalAmount - amount / 100);
      if (amountDifference > 0.01) {
        console.error("❌ Price calculation mismatch after discount!");
        console.error("- Expected amount (cents):", amount);
        console.error("- Calculated total (dollars):", totalAmount);
        console.error("- Difference (dollars):", amountDifference);
        return NextResponse.json(
          { error: "Price calculation error. Please try again." },
          { status: 500 }
        );
      }

      // Create priceBreakdown object for consistency with rest of code
      priceBreakdown = {
        basePrice: parseFloat(base0),
        serviceFee: parseFloat(baseImponible),
        iva: parseFloat(ivaAmountStr),
        finalPrice: totalAmount,
        basePriceCents: discountedBase0Cents,
        serviceFeeCents: discountedBaseImponibleCents,
        ivaCents: finalIvaCents,
        finalPriceCents: finalTotalCents,
      };
    } else {
      // No promo code or subtotal/discount not provided - use standard extraction
      // Use extractBasePrice to reverse calculate from stored total
      // This ensures BASE0 is what the organizer actually wants to receive
      priceBreakdown = extractBasePrice(amount); // amount is in cents

      // Datafast requires exactly 2 decimal places with format #######.##
      base0 = priceBreakdown.basePrice.toFixed(2); // Tax-exempt ticket price (what organizer receives)
      baseImponible = priceBreakdown.serviceFee.toFixed(2); // Taxable service fee (Flame's commission)
      ivaAmountStr = priceBreakdown.iva.toFixed(2); // 15% IVA on service fee
      totalAmount = priceBreakdown.finalPrice; // Total matches stored price

      // Validate that reverse calculation matches input amount (allow 1 cent tolerance for rounding)
      const amountDifference = Math.abs(totalAmount - amount / 100);
      if (amountDifference > 0.01) {
        console.error("❌ Price calculation mismatch!");
        console.error("- Input amount (cents):", amount);
        console.error("- Calculated total (dollars):", totalAmount);
        console.error("- Difference (dollars):", amountDifference);
        return NextResponse.json(
          { error: "Price calculation error. Please try again." },
          { status: 500 }
        );
      }
    }

    console.log("Tax breakdown (Ecuador IVA 15%):");
    console.log("- BASE0 (ticket price, tax-exempt):", base0);
    console.log(
      "- BASEIMP (service fee " + FLAME_MARKUP_PERCENT + "%, taxable):",
      baseImponible
    );
    console.log("- IVA (15% on service fee):", ivaAmountStr);
    console.log("- Total customer will pay:", totalAmount.toFixed(2));
    console.log(
      "- Verification sum:",
      (
        parseFloat(base0) +
        parseFloat(baseImponible) +
        parseFloat(ivaAmountStr)
      ).toFixed(2)
    );

    // Get user ID for merchantCustomerId
    const merchantCustomerId =
      user?.id?.substring(0, 16) || userId.substring(0, 16);

    const datafastParams = new URLSearchParams({
      entityId: DATAFAST_ENTITY_ID,
      amount: totalAmount.toFixed(2), // Total including BASE0 + BASEIMP + IVA
      currency: currency,
      paymentType: "DB", // Direct debit (purchase)

      // Phase 2: Customer information (required)
      "customer.givenName": billingInfo.firstName,
      "customer.surname": billingInfo.lastName,
      "customer.email": billingInfo.email,
      "customer.ip": ipAddress,
      "customer.phone": billingInfo.phone,
      // Guide 3.2.1.8: "en este caso el valor siempre será IDCARD"
      "customer.identificationDocType": "IDCARD",
      "customer.identificationDocId": billingInfo.documentId
        .padStart(10, "0")
        .substring(0, 10), // Exactly 10 characters
      "customer.merchantCustomerId": merchantCustomerId,

      // Billing address
      "billing.street1": billingInfo.billingAddress,
      "billing.country": billingInfo.billingCountry,

      // Shipping address (same as billing for digital tickets)
      "shipping.street1": billingInfo.billingAddress,
      "shipping.country": billingInfo.billingCountry,

      // Merchant transaction ID (unique identifier)
      merchantTransactionId: merchantTransactionId,

      // Phase 2: Cart items (required)
      "cart.items[0].name": orderDetails.eventName,
      "cart.items[0].description": `${orderDetails.ticketTierName} - ${orderDetails.quantity}x tickets`,
      "cart.items[0].price": totalAmount.toFixed(2), // Total price customer pays
      // FIX: Always send quantity 1 for the line item (it's a bundle of tickets).
      // If we sent actual quantity, Datafast would multiply price * quantity and expect a higher total.
      "cart.items[0].quantity": "1",

      // Phase 2: Tax parameters (required)
      "customParameters[SHOPPER_VAL_BASE0]": base0,
      "customParameters[SHOPPER_VAL_BASEIMP]": baseImponible,
      "customParameters[SHOPPER_VAL_IVA]": ivaAmountStr,

      // Phase 2: Merchant identifiers (required)
      "customParameters[SHOPPER_MID]": DATAFAST_MID,
      "customParameters[SHOPPER_TID]": DATAFAST_TID,

      // Phase 2: Security identifiers (required)
      "customParameters[SHOPPER_ECI]": DATAFAST_SHOPPER_ECI,
      "customParameters[SHOPPER_PSERV]": DATAFAST_SHOPPER_PSERV,
      "customParameters[SHOPPER_VERSIONDF]": DATAFAST_SHOPPER_VERSIONDF,

      // Phase 2: Risk parameters (required)
      "risk.parameters[USER_DATA2]": DATAFAST_RISK_MERCHANT_NAME,
    });

    console.log("Datafast API Request (PRODUCTION):");
    console.log("- URL:", `${DATAFAST_URL}/v1/checkouts`);
    console.log("- Entity ID:", DATAFAST_ENTITY_ID);
    console.log("- MID:", DATAFAST_MID);
    console.log("- TID:", DATAFAST_TID);
    console.log(
      "- Bearer Token:",
      DATAFAST_BEARER_TOKEN
        ? "Present (length: " + DATAFAST_BEARER_TOKEN.length + ")"
        : "Missing"
    );
    console.log(
      "- Payload keys:",
      Array.from(datafastParams.keys()).join(", ")
    );
    console.log("- Payload size:", datafastParams.toString().length, "bytes");

    // Call Datafast API to create checkout session
    console.log("Calling Datafast API...");
    const response = await fetch(`${DATAFAST_URL}/v1/checkouts`, {
      method: "POST",
      headers: {
        Authorization: DATAFAST_BEARER_TOKEN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: datafastParams.toString(),
    });

    console.log(
      "Datafast API Response Status:",
      response.status,
      response.statusText
    );
    console.log("Response Headers: [logged for debugging]");

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Datafast API ERROR Response:", errorText);
      console.error("Status Code:", response.status);

      // Log failed checkout attempt
      try {
        await supabaseAdmin!.from("datafast_transactions").insert({
          merchant_transaction_id: merchantTransactionId,
          status: "failed",
          transaction_type: "checkout_creation_failed",
          amount: totalAmount,
          currency: currency,
          user_id: user?.id,
          customer_email: maskEmail(billingInfo.email),
          customer_first_name: maskName(billingInfo.firstName),
          customer_last_name: maskName(billingInfo.lastName),
          customer_ip: ipAddress,
          promotional_code_id: promotional_code_id || null,
          error_code: response.status.toString(),
          error_message: "Failed to create checkout with Datafast",
          error_details: { errorText, status: response.status },
          checkout_request_data: {
            amount: amountInDollars,
            currency,
            // Redact PII; keep minimal fields necessary for audit/debug
            billingInfo: {
              emailHash: crypto
                .createHash("sha256")
                .update(billingInfo.email)
                .digest("hex"),
              // omit phone, address, documentId entirely
            },
            orderDetails,
          },
        });
      } catch (logError) {
        console.error("⚠️ Failed to log error transaction:", logError);
      }

      // 🚨 Track Datafast checkout creation failure in Sentry
      captureCheckoutError("Datafast checkout creation failed", {
        category: CheckoutErrorCategory.DATAFAST_CHECKOUT_FAILED,
        severity: CheckoutSeverity.HIGH,
        userIdHash: userId ? hashUserId(userId) : undefined,
        errorCode: response.status.toString(),
        amount: totalAmount,
        extra: {
          httpStatus: response.status,
          purchaseType,
          eventName: orderDetails?.eventName,
        },
      });

      return NextResponse.json(
        { error: "Failed to create checkout session with payment provider" },
        { status: 500 }
      );
    }

    const data = await response.json();
    console.log(
      "✅ Datafast API Response Data:",
      JSON.stringify(data, null, 2)
    );

    // Check if checkout was created successfully
    console.log("Checking result code:", data.result?.code);
    if (data.result?.code !== "000.200.100") {
      console.error("❌ Datafast checkout creation failed!");
      console.error("Result Code:", data.result?.code);
      console.error("Result Description:", data.result?.description);
      console.error("Full Response:", data);

      // Log failed checkout with error code from Datafast
      try {
        await supabaseAdmin!.from("datafast_transactions").insert({
          datafast_checkout_id: data.id,
          merchant_transaction_id: merchantTransactionId,
          status: "failed",
          transaction_type: "checkout_creation_failed",
          result_code: data.result?.code,
          result_description: data.result?.description,
          amount: totalAmount,
          currency: currency,
          user_id: user?.id,
          customer_email: maskEmail(billingInfo.email),
          customer_first_name: maskName(billingInfo.firstName),
          customer_last_name: maskName(billingInfo.lastName),
          customer_ip: ipAddress,
          promotional_code_id: promotional_code_id || null,
          error_code: data.result?.code,
          error_message: data.result?.description,
          checkout_request_data: {
            amount: amountInDollars,
            currency,
            // Redact PII; keep minimal fields necessary for audit/debug
            billingInfo: {
              emailHash: crypto
                .createHash("sha256")
                .update(billingInfo.email)
                .digest("hex"),
              // omit phone, address, documentId entirely
            },
            orderDetails,
          },
          checkout_response_data: data,
        });
      } catch (logError) {
        console.error("⚠️ Failed to log error transaction:", logError);
      }

      return NextResponse.json(
        {
          error:
            data.result?.description || "Failed to create checkout session",
          code: data.result?.code,
        },
        { status: 400 }
      );
    }

    console.log("✅ Checkout ID received:", data.id);

    // ⭐ NEW: Protect hold from expiration during payment
    // If this is a hold-based purchase, mark the hold as having payment in progress
    // This prevents the hold from expiring while user completes payment
    // Note: RSVP purchases don't need hold protection since they don't have expiring holds
    // Explicit check for "hold" or undefined (backward compat) to future-proof against new purchase types
    if (orderDetails.orderId && (purchaseType === "hold" || !purchaseType)) {
      console.log("🔒 Protecting hold from expiration during payment...");
      console.log("Hold ID:", orderDetails.orderId);

      try {
        const { data: holdProtectionResult, error: holdProtectionError } =
          await supabaseAdmin!.rpc("mark_hold_payment_started", {
            p_hold_id: orderDetails.orderId,
            p_checkout_id: data.id,
            p_extend_minutes: 10, // Give user 10 extra minutes to complete payment
          });

        if (holdProtectionError) {
          console.error("⚠️ Failed to protect hold:", holdProtectionError);
          // If we can't secure the hold, we shouldn't proceed with payment
          // This prevents "zombie payments" where user pays for an expired/lost hold
          throw new Error(
            `Failed to secure reservation: ${holdProtectionError.message}`
          );
        } else if (holdProtectionResult?.success) {
          console.log("✅ Hold protected from expiration");
          console.log(
            `   Extended expiration by ${holdProtectionResult.extended_by_minutes} minutes`
          );
          console.log(
            "   Old expiration:",
            holdProtectionResult.old_expiration
          );
          console.log(
            "   New expiration:",
            holdProtectionResult.new_expiration
          );
        } else {
          console.error(
            "⚠️ Hold protection failed:",
            holdProtectionResult?.error
          );
          // If hold is missing/expired/used, we MUST NOT let the user pay
          return NextResponse.json(
            {
              error:
                "Reservation timed out or is invalid. Please restart the purchase.",
              details: holdProtectionResult?.error,
            },
            { status: 409 } // Conflict
          );
        }
      } catch (holdProtectionErr) {
        console.error("⚠️ Exception protecting hold:", holdProtectionErr);
        // Re-throw if it's not a response object, or return error
        // The main catch block will handle generic errors
        return NextResponse.json(
          {
            error:
              "Failed to secure reservation. Please try again or contact support.",
          },
          { status: 500 }
        );
      }
    }

    // Update user billing information in database (if user was found earlier)
    if (user) {
      console.log("Updating user billing information in database...");
      await supabaseAdmin!
        .from("users")
        .update({
          phone: billingInfo.phone,
          billing_address: billingInfo.billingAddress,
          billing_city: billingInfo.billingCity,
          billing_country: billingInfo.billingCountry,
          document_type: billingInfo.documentType,
          document_id: billingInfo.documentId,
          date_of_birth: billingInfo.dateOfBirth,
          ip_address: ipAddress,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      console.log("✅ Billing info updated");
    } else {
      console.log("⚠️ User not found in database (billing info not saved)");
    }

    // Log transaction to datafast_transactions table (per Datafast guide recommendation)
    console.log("Logging transaction to datafast_transactions table...");
    const { error: transactionLogError } = await supabaseAdmin!
      .from("datafast_transactions")
      .insert({
        datafast_checkout_id: data.id,
        merchant_transaction_id: merchantTransactionId,
        status: "pending",
        transaction_type: "checkout_created",
        result_code: data.result?.code,
        result_description: data.result?.description,
        amount: totalAmount,
        currency: currency,
        payment_type: "DB",
        user_id: user?.id,
        customer_email: maskEmail(billingInfo.email),
        customer_first_name: maskName(billingInfo.firstName),
        customer_last_name: maskName(billingInfo.lastName),
        customer_ip: ipAddress,
        promotional_code_id: promotional_code_id || null,
        // ⭐ Link transaction to hold (only for hold-based purchases, not RSVPs)
        // Explicit check for "hold" or undefined (backward compat) to future-proof against new purchase types
        hold_id:
          purchaseType === "hold" || !purchaseType
            ? orderDetails.orderId || null
            : null,
        checkout_request_data: {
          amount: totalAmount.toFixed(2),
          currency,
          // Redact PII; keep minimal fields necessary for audit/debug
          billingInfo: {
            emailHash: crypto
              .createHash("sha256")
              .update(billingInfo.email)
              .digest("hex"),
            // omit phone, address, documentId entirely
          },
          orderDetails,
          taxData: {
            base0,
            baseImponible,
            ivaAmount: priceBreakdown.iva,
            note: "Tax breakdown: BASE0 (organizer) + BASEIMP (Flame fee) + IVA (15% on fee)",
          },
        },
        checkout_response_data: data,
        checkout_created_at: new Date().toISOString(),
      });

    if (transactionLogError) {
      console.error("⚠️ Failed to log transaction:", transactionLogError);
      // Don't fail the request if logging fails
    } else {
      console.log("✅ Transaction logged successfully");
    }

    console.log("✅ Returning checkout data to frontend");
    console.log("=== END: Datafast Create Checkout SUCCESS ===");

    // Return checkout ID to frontend
    return NextResponse.json({
      checkoutId: data.id,
      buildNumber: data.buildNumber,
      timestamp: data.timestamp,
      // Return base URL so frontend uses same environment (test/prod) as backend
      // DATAFAST_URL is like "https://eu-test.oppwa.com" or "https://eu-prod.oppwa.com"
      baseUrl: DATAFAST_URL,
    });
  } catch (error) {
    console.error("=== ERROR in Datafast Create Checkout ===");
    console.error("Error type:", typeof error);
    console.error("Error message:", error);
    console.error(
      "Error stack:",
      error instanceof Error ? error.stack : "No stack"
    );

    // 🚨 Track unexpected errors in Sentry
    captureCheckoutError(
      error instanceof Error ? error : new Error(String(error)),
      {
        category: CheckoutErrorCategory.DATAFAST_CHECKOUT_FAILED,
        severity: CheckoutSeverity.HIGH,
        userIdHash: userId ? hashUserId(userId) : undefined,
        extra: {
          errorType: typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      }
    );

    return NextResponse.json(
      {
        error:
          "Failed to create checkout session. Please try again or contact support.",
      },
      { status: 500 }
    );
  }
}
