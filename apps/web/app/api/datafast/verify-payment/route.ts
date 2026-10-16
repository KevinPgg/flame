import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { handleDatafastError } from "@/app/lib/datafast-error-handler";
import {
  captureCheckoutError,
  categorizeDatafastError,
  hashUserId,
  CheckoutErrorCategory,
  CheckoutSeverity,
} from "@/app/lib/utils/sentry-checkout";

// Datafast Configuration - ALL values must be provided via environment variables
// NO HARDCODED CREDENTIALS for security compliance

// Credentials are validated per request (like create-checkout), not at import time: a
// module-level throw broke `next build` on any machine without Datafast credentials
// ("Failed to collect page data for /api/datafast/verify-payment").

// Initialize Supabase admin client for transaction logging
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface VerifyPaymentRequest {
  resourcePath: string;
  checkoutId: string;
}

// Transaction status codes (from Datafast guide section 4.2)
const SUCCESS_CODES = [
  "000.000.000", // Production success - LIVE TRANSACTIONS
  //"000.100.110", // Test mode success (Phase 1) - for reference only
  //"000.100.112", // Test mode success (Phase 2) - for reference only
];

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  const DATAFAST_URL = process.env.DATAFAST_URL;
  const DATAFAST_ENTITY_ID = process.env.DATAFAST_ENTITY_ID;
  const DATAFAST_BEARER_TOKEN = process.env.DATAFAST_BEARER_TOKEN;
  if (!DATAFAST_URL || !DATAFAST_ENTITY_ID || !DATAFAST_BEARER_TOKEN) {
    console.error(
      "❌ Missing required Datafast configuration (DATAFAST_URL, DATAFAST_ENTITY_ID, DATAFAST_BEARER_TOKEN)"
    );
    return NextResponse.json(
      { error: "Payment system configuration error" },
      { status: 500 }
    );
  }
  try {
    const authResult = await auth();
    userId = authResult.userId;

    if (!userId) {
      return NextResponse.json(
        { error: "You must be logged in to verify payment" },
        { status: 401 }
      );
    }

    const body: VerifyPaymentRequest = await req.json();
    const { resourcePath, checkoutId } = body;

    if (!resourcePath) {
      return NextResponse.json(
        { error: "Missing resourcePath parameter" },
        { status: 400 }
      );
    }

    if (!checkoutId) {
      return NextResponse.json(
        { error: "Missing checkoutId parameter" },
        { status: 400 }
      );
    }

    // Get current user's UUID for security checks
    const { data: currentUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!currentUser) {
      console.error("⚠️ User not found in database");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Build verification URL - use checkoutId to verify the transaction
    const verificationUrl = `${DATAFAST_URL}${resourcePath}?entityId=${DATAFAST_ENTITY_ID}`;

    console.log("=== Datafast Payment Verification (PRODUCTION) ===");
    console.log("Environment check:");
    console.log("- DATAFAST_URL:", DATAFAST_URL);
    console.log("- DATAFAST_ENTITY_ID:", DATAFAST_ENTITY_ID);
    console.log("Checkout ID:", checkoutId);
    console.log("Resource Path:", resourcePath);
    console.log("Verification URL:", verificationUrl);
    console.log("Authorization Header:");
    console.log(
      "- Bearer Token:",
      DATAFAST_BEARER_TOKEN
        ? "Present (length: " + DATAFAST_BEARER_TOKEN.length + ")"
        : "Missing"
    );
    console.log(
      "- Token starts with 'Bearer':",
      DATAFAST_BEARER_TOKEN?.startsWith("Bearer")
    );

    // Call Datafast API to verify transaction
    const response = await fetch(verificationUrl, {
      method: "GET",
      headers: {
        Authorization: DATAFAST_BEARER_TOKEN,
      },
    });

    console.log("Datafast response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Datafast verification error response:", errorText);
      console.error("Response status:", response.status);
      console.error(
        "Response headers:",
        Object.fromEntries(response.headers.entries())
      );

      // Log failed verification attempt
      try {
        const errorData = JSON.parse(errorText);

        // Security: Only allow users to update their own transactions
        await supabaseAdmin
          .from("datafast_transactions")
          .update({
            status: "failed",
            transaction_type: "verification_failed",
            error_code: errorData.result?.code || response.status.toString(),
            error_message:
              errorData.result?.description || "Failed to verify payment",
            error_details: errorData,
            verification_request_data: {
              resourcePath,
              checkoutId,
              verificationUrl,
            },
            verified_at: new Date().toISOString(),
          })
          .eq("datafast_checkout_id", checkoutId)
          .eq("user_id", currentUser.id); // Security check

        console.error("Parsed error data:", JSON.stringify(errorData, null, 2));

        // Categorize the error
        const categorizedError = handleDatafastError({
          code: errorData.result?.code,
          description: errorData.result?.description,
          resultDetails: errorData.resultDetails,
        });

        console.log("📊 Error Category:", categorizedError.category);
        console.log("🎯 Recommended Action:", categorizedError.action);

        // 🚨 Track Datafast API errors in Sentry
        const errorCode = errorData.result?.code || response.status.toString();
        const sentryCategory = categorizeDatafastError(errorCode);
        captureCheckoutError(
          `Datafast verification failed: ${
            errorData.result?.description || "Unknown error"
          }`,
          {
            ...sentryCategory,
            checkoutId,
            userIdHash: hashUserId(userId),
            errorCode,
            errorMessage: errorData.result?.description,
            extra: {
              httpStatus: response.status,
              datafastCategory: categorizedError.category,
            },
          }
        );

        return NextResponse.json(
          {
            error: categorizedError.userMessage,
            details: errorData.result?.description || errorText,
            code: errorData.result?.code,
            category: categorizedError.category,
            action: categorizedError.action,
            showCard: categorizedError.showCard,
            isSuccess: false,
          },
          { status: 400 } // Changed from 500 to 400 (client error)
        );
      } catch (parseError) {
        // Log even if we can't parse the error
        // Security: Only allow users to update their own transactions
        await supabaseAdmin
          .from("datafast_transactions")
          .update({
            status: "failed",
            transaction_type: "verification_failed",
            error_code: response.status.toString(),
            error_message: "Failed to verify payment - unparseable response",
            error_details: { errorText },
            verification_request_data: {
              resourcePath,
              checkoutId,
              verificationUrl,
            },
            verified_at: new Date().toISOString(),
          })
          .eq("datafast_checkout_id", checkoutId)
          .eq("user_id", currentUser.id); // Security check

        return NextResponse.json(
          {
            error: "Failed to verify payment with payment provider",
            details: errorText,
          },
          { status: 500 }
        );
      }
    }

    const data = await response.json();

    console.log(
      "╔════════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║  DATAFAST SECTION 3.1.3: Transaction Status JSON Response     ║"
    );
    console.log(
      "╚════════════════════════════════════════════════════════════════╝"
    );
    console.log(JSON.stringify(data, null, 2));
    console.log(
      "────────────────────────────────────────────────────────────────"
    );

    // Check transaction status
    const resultCode = data.result?.code;
    const isSuccess = SUCCESS_CODES.includes(resultCode);

    console.log("📊 Transaction Status Summary:");
    console.log("  • Result Code:", resultCode);
    console.log("  • Description:", data.result?.description);
    console.log("  • Success:", isSuccess ? "✅ YES" : "❌ NO");
    console.log("  • Transaction ID:", data.id);
    console.log("  • Amount:", data.amount, data.currency);
    console.log("  • Payment Type:", data.paymentType);
    console.log("  • Timestamp:", data.timestamp);

    if (data.card) {
      console.log("💳 Card Details:");
      console.log("  • BIN:", data.card.bin);
      console.log("  • Last 4:", data.card.last4Digits);
      console.log("  • Holder:", data.card.holder);
    }

    if (data.resultDetails) {
      console.log("📋 Result Details:");
      console.log("  • Auth Code:", data.resultDetails.AuthCode);
      console.log("  • Reference No:", data.resultDetails.ReferenceNo);
      console.log("  • Acquirer Code:", data.resultDetails.AcquirerCode);
      console.log("  • Card Type:", data.resultDetails.CardType);
    }

    // Extract important transaction details
    const transactionDetails = {
      id: data.id,
      paymentType: data.paymentType,
      amount: data.amount,
      currency: data.currency,
      descriptor: data.descriptor,
      merchantTransactionId: data.merchantTransactionId,
      result: {
        code: resultCode,
        description: data.result?.description,
      },
      resultDetails: data.resultDetails,
      card: data.card,
      timestamp: data.timestamp,
      isSuccess,
    };

    // Update transaction record with verification results (per Datafast guide recommendation)
    console.log("📝 Updating transaction record with verification results...");
    try {
      const updateData: any = {
        datafast_transaction_id: data.id,
        status: isSuccess ? "processing" : "failed", // "processing" until order is completed
        transaction_type: isSuccess ? "payment_verified" : "payment_failed",
        result_code: resultCode,
        result_description: data.result?.description,
        payment_brand: data.paymentBrand,

        // Card information (masked)
        card_bin: data.card?.bin,
        card_last4: data.card?.last4Digits,
        card_holder: data.card?.holder,
        card_expiry_month: data.card?.expiryMonth,
        card_expiry_year: data.card?.expiryYear,
        card_bin_country: data.card?.binCountry,

        // Transaction details from resultDetails
        auth_code: data.resultDetails?.AuthCode,
        reference_no: data.resultDetails?.ReferenceNo,
        reference_nbr: data.resultDetails?.ReferenceNbr, // Full reference (YYMMDD_NNNNNN format)
        batch_no: data.resultDetails?.BatchNo,
        acquirer_code: data.resultDetails?.AcquirerCode,
        card_type: data.resultDetails?.CardType,
        acquirer_response: data.resultDetails?.AcquirerResponse,
        extended_description: data.resultDetails?.ExtendedDescription,
        clearing_institute_name: data.resultDetails?.clearingInstituteName,

        // Risk data
        risk_score: data.risk?.score,

        // Verification data
        verification_request_data: {
          resourcePath,
          checkoutId,
          verificationUrl,
        },
        verification_response_data: data,

        // Timestamps
        payment_attempted_at: data.timestamp,
        verified_at: new Date().toISOString(),
      };

      // If transaction failed, also set error fields
      if (!isSuccess) {
        updateData.error_code = resultCode;
        updateData.error_message = data.result?.description;
      }

      // Security: Only allow users to update their own transactions
      const { error: updateError } = await supabaseAdmin
        .from("datafast_transactions")
        .update(updateData)
        .eq("datafast_checkout_id", checkoutId)
        .eq("user_id", currentUser.id); // Security check: verify user owns this transaction

      if (updateError) {
        console.error("⚠️ Failed to update transaction record:", updateError);
        // Don't fail the request if logging fails
      } else {
        console.log("✅ Transaction record updated successfully");
        console.log("  • Status:", isSuccess ? "processing" : "failed");
        console.log("  • Transaction ID:", data.id);
        console.log("  • Result Code:", resultCode);
      }
    } catch (logError) {
      console.error("⚠️ Error updating transaction record:", logError);
      // Don't fail the request if logging fails
    }

    console.log("=== End Datafast Verification ===");

    // If transaction failed, add categorized error information
    if (!isSuccess) {
      const categorizedError = handleDatafastError({
        code: resultCode,
        description: data.result?.description,
        resultDetails: data.resultDetails,
      });

      console.log("📊 Error Category:", categorizedError.category);
      console.log("🎯 Recommended Action:", categorizedError.action);

      // 🚨 Track payment failures in Sentry for monitoring
      // Provide fallback for undefined resultCode to prevent TypeError
      const errorCode = resultCode || "UNKNOWN";
      const sentryCategory = categorizeDatafastError(errorCode);
      captureCheckoutError(
        `Payment failed: ${data.result?.description || errorCode}`,
        {
          ...sentryCategory,
          checkoutId,
          userIdHash: hashUserId(userId),
          errorCode: errorCode,
          errorMessage: data.result?.description,
          amount: data.amount ? parseFloat(data.amount) * 100 : undefined,
          extra: {
            paymentBrand: data.paymentBrand,
            cardBin: data.card?.bin,
            cardLast4: data.card?.last4Digits,
            riskScore: data.risk?.score,
            datafastCategory: categorizedError.category,
            action: categorizedError.action,
          },
        }
      );

      return NextResponse.json({
        ...transactionDetails,
        error: categorizedError.userMessage,
        category: categorizedError.category,
        action: categorizedError.action,
        showCard: categorizedError.showCard,
      });
    }

    return NextResponse.json(transactionDetails);
  } catch (error) {
    console.error("Error verifying Datafast payment:", error);

    // Track unexpected errors in Sentry
    captureCheckoutError(
      error instanceof Error ? error : new Error(String(error)),
      {
        category: CheckoutErrorCategory.DATAFAST_VERIFICATION_FAILED,
        severity: CheckoutSeverity.HIGH,
        userIdHash: userId ? hashUserId(userId) : undefined,
        extra: {
          errorType: typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      }
    );

    // Return structured error response that matches frontend expectations
    return NextResponse.json(
      {
        error: "Failed to verify payment. Please try again or contact support.",
        isSuccess: false,
        category: "TECHNICAL",
        action: "CONTACT_SUPPORT",
        showCard: false,
        details: "An unexpected error occurred during payment verification",
      },
      { status: 500 }
    );
  }
}
