import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import {
  createExpressAccount,
  createAccountLink,
  createExpressDashboardLoginLink,
} from "@/app/lib/stripe/connect";
import { stripe } from "@/app/lib/stripe/stripe";
import { isSupportedConnectCountry } from "@project-flame/lib";

export async function POST(req: NextRequest) {
  let accountId: string | null = null;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      console.error("Supabase admin client not initialized");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { organizationId, country } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    // Country is optional for backward compatibility (older mobile clients don't
    // send it — those fall back to Stripe-hosted country selection / recipient
    // default). When provided, it must be a supported Connect country so we can
    // pick the correct service agreement at account creation. Only used on the
    // creation path below; ignored for existing accounts.
    let normalizedCountry: string | undefined;
    if (country !== undefined && country !== null) {
      if (typeof country !== "string" || !isSupportedConnectCountry(country)) {
        return NextResponse.json(
          { error: "Unsupported or invalid country" },
          { status: 400 }
        );
      }
      normalizedCountry = country.toUpperCase();
    }

    // Get the user's Supabase ID
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify user is owner/admin of organization - only these roles can connect Stripe
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Unauthorized access to organization" },
        { status: 403 }
      );
    }

    // Only allow admin or owner roles to connect Stripe account
    const allowedRoles = ["admin", "owner"];
    if (!allowedRoles.includes(membership.role?.toLowerCase())) {
      return NextResponse.json(
        { error: "Only organization admins or owners can connect Stripe" },
        { status: 403 }
      );
    }

    // Fetch organization to check if account already exists
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("stripe_account_id, name, owner_user_id")
      .eq("id", organizationId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    accountId = org.stripe_account_id;

    // If no account exists, create one
    if (!accountId) {
      // Fetch owner email to pre-fill
      const { data: owner } = await supabaseAdmin
        .from("users")
        .select("email")
        .eq("id", org.owner_user_id)
        .single();

      const email = owner?.email;

      if (!email) {
        return NextResponse.json(
          { error: "Organization owner email not found" },
          { status: 400 }
        );
      }

      const account = await createExpressAccount(email, {
        businessName: org.name ?? undefined,
        country: normalizedCountry,
      });
      accountId = account.id;

      // CRITICAL: Save account ID with optimistic locking to prevent race conditions
      // Only update if stripe_account_id is still NULL (prevents concurrent requests from creating duplicate accounts)
      const { data: updatedOrg, error: updateError } = await supabaseAdmin
        .from("organizations")
        .update({ stripe_account_id: accountId })
        .eq("id", organizationId)
        .is("stripe_account_id", null) // Optimistic lock: only update if still null
        .select("stripe_account_id")
        .maybeSingle();

      if (updateError) {
        console.error(
          "Failed to save Stripe account ID to organization:",
          updateError
        );
        // Delete the created Stripe account to avoid orphaned accounts
        try {
          await stripe.accounts.del(accountId);
          console.log("Cleaned up orphaned Stripe account:", accountId);
        } catch (deleteErr) {
          console.error("CRITICAL: Failed to delete orphaned Stripe account:", {
            accountId,
            organizationId,
            error: deleteErr,
          });
        }
        return NextResponse.json(
          { error: "Failed to save Stripe account" },
          { status: 500 }
        );
      }

      // Check if update actually happened (another request might have won the race)
      if (!updatedOrg) {
        // Another request already created and saved an account - delete ours and use theirs
        console.log(
          "Race condition detected: another request created Stripe account first",
          {
            ourAccountId: accountId,
            organizationId,
          }
        );

        // Clean up our orphaned account
        try {
          await stripe.accounts.del(accountId);
          console.log(
            "Cleaned up duplicate Stripe account from race condition:",
            accountId
          );
        } catch (deleteErr) {
          console.error(
            "CRITICAL: Failed to delete duplicate Stripe account:",
            {
              accountId,
              organizationId,
              error: deleteErr,
            }
          );
        }

        // Fetch the winning account ID
        const { data: refetchedOrg } = await supabaseAdmin
          .from("organizations")
          .select("stripe_account_id")
          .eq("id", organizationId)
          .single();

        if (refetchedOrg?.stripe_account_id) {
          accountId = refetchedOrg.stripe_account_id;
          console.log(
            "Using existing Stripe account from concurrent request:",
            accountId
          );
        } else {
          // This should never happen but handle gracefully
          console.error(
            "CRITICAL: Race condition resolution failed - no account found"
          );
          return NextResponse.json(
            { error: "Failed to initialize Stripe account" },
            { status: 500 }
          );
        }
      }
    }

    // Create account link for onboarding or management
    // CRITICAL: Pass accountId in return URL so the return route knows which account was onboarded
    // This prevents issues where the DB account_id might differ from the onboarded account
    if (!accountId) {
        throw new Error("Account ID is missing before creating account link");
    }

    // Express accounts cannot use AccountLinks for dashboard access once fully connected.
    // "account_update" AccountLinks are exclusive to Custom accounts and throw
    // StripeInvalidRequestError on Express accounts. Use a Login Link instead.
    const accountStatus = await stripe.accounts.retrieve(accountId);
    if (accountStatus.charges_enabled && accountStatus.payouts_enabled) {
      const loginLink = await createExpressDashboardLoginLink(accountId);
      return NextResponse.json({ url: loginLink.url });
    }

    const returnParams = new URLSearchParams({ organizationId, accountId });
    const accountLink = await createAccountLink(
      accountId,
      `/api/stripe/connect/return?${returnParams.toString()}`
    );

    return NextResponse.json({ url: accountLink.url });
  } catch (error: any) {
    console.error("Connect Onboarding Error:", error);

    if (error?.type?.startsWith("Stripe")) {
      console.error("Stripe error details:", {
        type: error.type,
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      });

      const SAFE_STRIPE_CODES: Record<string, string> = {
        account_invalid: "Stripe account is invalid or inaccessible. Please contact support.",
        api_key_expired: "Payment configuration error. Please contact support.",
        platform_api_key_expired: "Payment configuration error. Please contact support.",
      };
      const clientMessage =
        SAFE_STRIPE_CODES[error.code] ??
        "A payment processing error occurred. Please try again or contact support.";

      const safeCode = error.code in SAFE_STRIPE_CODES ? error.code : undefined;
      return NextResponse.json(
        { error: clientMessage, ...(safeCode && { code: safeCode }) },
        { status: error.statusCode || 500 }
      );
    }

    if (accountId) {
      try {
        const account = await stripe.accounts.retrieve(accountId);
        const requirements = account.requirements;

        if (
          requirements?.errors?.length ||
          requirements?.currently_due?.length ||
          requirements?.past_due?.length
        ) {
          return NextResponse.json(
            {
              error: "Stripe Account requires information. Please complete the onboarding process.",
              details: {
                currently_due: requirements.currently_due,
                past_due: requirements.past_due,
                errors: requirements.errors,
              },
            },
            { status: 400 }
          );
        }
      } catch (retrieveError) {
        console.error("Failed to retrieve account details for error handling:", retrieveError);
      }
    }

    console.error("Non-Stripe onboard error:", error?.message, error?.stack);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
