import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { createAccountLink } from "@/app/lib/stripe/connect";
import { getBaseUrl } from "@/app/lib/utils/url";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const accountId = searchParams.get("account_id");

  if (!accountId) {
    return NextResponse.redirect(
      `${getBaseUrl()}/organizer?error=missing_account_id`
    );
  }

  try {
    // Authentication check - user must be logged in
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(
        `${getBaseUrl()}/sign-in?redirect_url=${encodeURIComponent(req.url)}`
      );
    }

    if (!supabaseAdmin) {
      console.error("Supabase admin client not initialized");
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=server_error`
      );
    }

    // Get the user's Supabase ID
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (userError || !user) {
      if (userError) {
        console.error("User lookup error:", userError);
      }
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=user_not_found`
      );
    }

    // Find org that owns this Stripe account
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("stripe_account_id", accountId)
      .single();

    if (orgError && orgError.code !== "PGRST116") {
      // PGRST116 = "not found" - any other error is unexpected
      console.error("Organization lookup error:", orgError);
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=server_error`
      );
    }

    if (!org) {
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=org_not_found`
      );
    }

    // Verify user is owner/admin of organization - only these roles can access Stripe onboarding
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", org.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=unauthorized`
      );
    }

    // Only allow admin or owner roles to refresh Stripe account link
    const allowedRoles = ["admin", "owner"];
    const safeRole = membership.role ? membership.role.toLowerCase() : "";
    
    if (!allowedRoles.includes(safeRole)) {
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=insufficient_permissions`
      );
    }

    // CRITICAL: Include accountId in return URL so the return route knows which account was onboarded
    // This matches the onboard route's implementation and prevents missing_account_id errors
    const returnPath = `/api/stripe/connect/return?organizationId=${encodeURIComponent(
      org.id
    )}&accountId=${encodeURIComponent(accountId)}`;
    const accountLink = await createAccountLink(accountId, returnPath);

    if (!accountLink?.url) {
      console.error(
        "createAccountLink returned invalid response:",
        accountLink
      );
      return NextResponse.redirect(
        `${getBaseUrl()}/organizer?error=refresh_failed`
      );
    }
    
    return NextResponse.redirect(accountLink.url);
  } catch (error) {
    console.error("Connect Refresh Error:", error);
    return NextResponse.redirect(
      `${getBaseUrl()}/organizer?error=refresh_failed`
    );
  }
}
