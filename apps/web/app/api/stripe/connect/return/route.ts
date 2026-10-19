import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { getAccountStatus } from "@/app/lib/stripe/connect";
import { getBaseUrl } from "@/app/lib/utils/url";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const organizationId = searchParams.get("organizationId");
  const accountId = searchParams.get("accountId");

  if (!organizationId) {
    return NextResponse.redirect(
      `${getBaseUrl()}/organizer?error=missing_org_id`
    );
  }

  // CRITICAL: accountId must be present to prevent fetching wrong account status
  // Without this, we might fetch status for a different account than the one user just onboarded
  if (!accountId) {
    console.error(
      "Missing accountId in connect return - onboarding URL might be from old implementation"
    );
    return NextResponse.redirect(
      `${getBaseUrl()}/organizer?error=missing_account_id`
    );
  }

  if (!supabaseAdmin) {
    console.error("Supabase admin client not initialized");
    return NextResponse.redirect(
      `${getBaseUrl()}/organizer?error=server_error`
    );
  }

  // Best-effort auth check. Web users return inside the same browser session
  // (Clerk cookie present) and we enforce membership + role. Mobile users
  // return via Safari/external browser which has NO Clerk session — they get
  // through this block without a userId. That's intentional: the security
  // boundary for the actual DB sync below is the accountId↔DB match check at
  // line ~129. Without a matching DB row no update can happen, so the URL
  // params alone are not a privilege-escalation vector.
  let userId: string | null = null;
  try {
    const authResult = await auth();
    userId = authResult.userId;
  } catch (err) {
    console.error("Auth error in connect return (continuing as unauthenticated):", err);
  }

  if (userId) {
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (userError || !user) {
      console.error("User not found for connect return:", {
        userId,
        error: userError,
      });
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=user_not_found`
      );
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      console.error("Unauthorized access attempt to connect return:", {
        userId,
        organizationId,
        error: membershipError,
      });
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=unauthorized`
      );
    }

    const allowedRoles = ["admin", "owner"];
    if (!allowedRoles.includes(membership.role?.toLowerCase())) {
      console.error("Insufficient permissions for connect return:", {
        userId,
        organizationId,
        role: membership.role,
      });
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=insufficient_permissions`
      );
    }
  } else {
    console.log("Unauthenticated connect return (mobile onboarding flow):", {
      organizationId,
      accountId,
    });
  }

  try {
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("stripe_account_id")
      .eq("id", organizationId)
      .single();

    if (orgError) {
      console.error("Error fetching organization:", orgError);
      return NextResponse.redirect(`${getBaseUrl()}/organizer?error=db_error`);
    }

    if (!org) {
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=org_not_found`
      );
    }

    // SECURITY: Verify the accountId from URL matches what's in the database
    // This prevents attackers from updating another organization's Stripe status
    // by manipulating the accountId parameter
    if (org.stripe_account_id && org.stripe_account_id !== accountId) {
      console.error("SECURITY: Account ID mismatch detected", {
        organizationId,
        dbAccountId: org.stripe_account_id,
        urlAccountId: accountId,
      });
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=account_mismatch`
      );
    }

    // SECURITY: First-time stripe_account_id binding MUST require an
    // authenticated org admin/owner. The unauthenticated branch above exists
    // only to let mobile-Safari users (no Clerk session) re-sync the status
    // booleans of an already-bound account — never to bind a NEW account.
    // Without this guard, an unauthenticated attacker who knows a target
    // organizationId could pass their own accountId in the URL and bind their
    // Stripe Connect account to that org (line 149 below), redirecting all
    // future payouts to the attacker.
    if (!org.stripe_account_id && !userId) {
      console.error(
        "SECURITY: Unauthenticated attempt to bind a new Stripe account to an org",
        {
          organizationId,
          urlAccountId: accountId,
        }
      );
      return NextResponse.redirect(
        `${getBaseUrl()}/sign-in?redirect_url=${encodeURIComponent(
          "/organizer/settings"
        )}`
      );
    }

    // If the database doesn't have an account ID yet (shouldn't happen with optimistic locking,
    // but handle gracefully), update it with the onboarded account.
    // Reached only when userId is set (authenticated admin/owner) per the
    // guard above.
    if (!org.stripe_account_id) {
      console.log(
        "Database missing stripe_account_id, updating with onboarded account:",
        {
          organizationId,
          accountId,
        }
      );

      const { error: accountUpdateError } = await supabaseAdmin
        .from("organizations")
        .update({ stripe_account_id: accountId })
        .eq("id", organizationId)
        .is("stripe_account_id", null); // Still use optimistic lock

      if (accountUpdateError) {
        console.error(
          "Failed to update missing stripe_account_id:",
          accountUpdateError
        );
        return NextResponse.redirect(
          `${getBaseUrl()}/organizer?error=update_failed`
        );
      }
    }

    // Use the accountId from the onboarding session (URL parameter)
    // This ensures we fetch status for the account the user actually onboarded
    const status = await getAccountStatus(accountId);

    // Update status with optimistic lock to prevent TOCTOU race conditions
    // Ensures accountId hasn't changed between validation and update
    const { data: updatedOrg, error: updateError } = await supabaseAdmin
      .from("organizations")
      .update({
        stripe_charges_enabled: status.chargesEnabled,
        stripe_payouts_enabled: status.payoutsEnabled,
      })
      .eq("id", organizationId)
      .eq("stripe_account_id", accountId) // Ensure accountId still matches
      .select();

    if (updateError) {
      console.error(
        "Failed to update organization Stripe status:",
        updateError
      );
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=update_failed`
      );
    }

    // Verify that the update actually happened (optimistic lock check)
    if (!updatedOrg || updatedOrg.length === 0) {
      console.error("Organization update failed - optimistic lock mismatch or org not found:", {
        organizationId,
        accountId,
        reason: "Zero rows updated"
      });
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=update_failed`
      );
    }

    // Fetch organization slug for redirect URL
    const { data: orgData } = await supabaseAdmin
      .from("organizations")
      .select("slug")
      .eq("id", organizationId)
      .single();

    const orgSlug = orgData?.slug;
    // Back to Payouts (v2 via the organizer redirect; v1 settings if ORGANIZER_V1=true).
    const redirectUrl = orgSlug
      ? `${getBaseUrl()}/organizer/settings?org=${encodeURIComponent(orgSlug)}&tab=payouts&connect=success`
      : `${getBaseUrl()}/organizer?connect=success`;

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("Connect Return Error:", error);
    return NextResponse.redirect(
      `${getBaseUrl()}/organizer?error=connect_failed`
    );
  }
}
