import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { getAccountStatus } from "@/app/lib/stripe/connect";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      console.error("Supabase admin client not initialized");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

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

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select(
        "stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled"
      )
      .eq("id", organizationId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    let chargesEnabled = !!org.stripe_charges_enabled;
    let payoutsEnabled = !!org.stripe_payouts_enabled;

    // Self-heal: if the account is linked but our cached booleans show it as
    // not-yet-enabled, verify live with Stripe. Webhooks (`account.updated`)
    // are the primary sync mechanism, but they can be missed during onboarding
    // when the account_id write hasn't committed yet. This cache-aside fetch
    // catches that drift on the next poll. Once both flags are true we trust
    // the cache (steady state) and skip the Stripe call.
    if (org.stripe_account_id && (!chargesEnabled || !payoutsEnabled)) {
      try {
        const live = await getAccountStatus(org.stripe_account_id);
        const liveCharges = !!live.chargesEnabled;
        const livePayouts = !!live.payoutsEnabled;

        if (liveCharges !== chargesEnabled || livePayouts !== payoutsEnabled) {
          const { error: syncError } = await supabaseAdmin
            .from("organizations")
            .update({
              stripe_charges_enabled: liveCharges,
              stripe_payouts_enabled: livePayouts,
            })
            .eq("id", organizationId)
            .eq("stripe_account_id", org.stripe_account_id);

          if (syncError) {
            console.error("Failed to persist self-healed Stripe Connect status (returning live values to caller):", {
              organizationId,
              accountId: org.stripe_account_id,
              error: syncError,
            });
          } else {
            console.log("Self-healed Stripe Connect status:", {
              organizationId,
              accountId: org.stripe_account_id,
              before: { chargesEnabled, payoutsEnabled },
              after: { chargesEnabled: liveCharges, payoutsEnabled: livePayouts },
            });
          }

          // Cache-aside: live Stripe values are the source of truth. Return
          // them to the caller regardless of whether the DB persist succeeded,
          // otherwise a transient write failure causes the UI to keep showing
          // "Action Required" for an account Stripe says is enabled. The next
          // status call will retry the persist since cached is still stale.
          chargesEnabled = liveCharges;
          payoutsEnabled = livePayouts;
        }
      } catch (stripeErr) {
        console.error("Failed to fetch live Stripe account status (returning cached):", {
          organizationId,
          accountId: org.stripe_account_id,
          error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
        });
      }
    }

    return NextResponse.json({
      connected: !!org.stripe_account_id,
      chargesEnabled,
      payoutsEnabled,
      accountId: org.stripe_account_id,
    });
  } catch (error) {
    console.error("Connect Status Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

