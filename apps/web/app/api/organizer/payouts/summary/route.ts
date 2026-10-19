import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { canManagePayouts, type OrgMemberRole } from "@project-flame/lib";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { stripe } from "@/app/lib/stripe/stripe";

/**
 * GET /api/organizer/payouts/summary?organizationId= — everything the Payouts screen shows, read
 * live from the organization's Stripe Connect account (owner/admin, like balance/create):
 *   { connected: false }
 *   { connected: true, defaultCurrency, schedule, balance: { available[], pending[] },
 *     payouts: [{ id, amount, currency, status, arrival_date, created, automatic }], bank }
 * Stripe is the source of truth for history (payout_logs only has the ones requested from Flame).
 */
type Bank = { bankName: string | null; last4: string | null; currency: string | null };

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const organizationId = req.nextUrl.searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "Organization ID required" }, { status: 400 });

  const { data: user, error: userError } = await supabaseAdmin.from("users").select("id").eq("clerk_id", userId).maybeSingle();
  if (userError) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (membershipError) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!membership || !canManagePayouts(((membership.role as string) ?? "").toLowerCase() as OrgMemberRole)) {
    return NextResponse.json({ error: "Admin or owner role required" }, { status: 403 });
  }

  const { data: org, error: orgError } = await supabaseAdmin
    .from("organizations")
    .select("stripe_account_id")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!org.stripe_account_id) return NextResponse.json({ connected: false });

  const accountId = org.stripe_account_id as string;
  try {
    const [balance, payouts, account] = await Promise.all([
      stripe.balance.retrieve({}, { stripeAccount: accountId }),
      stripe.payouts.list({ limit: 20 }, { stripeAccount: accountId }),
      stripe.accounts.retrieve(accountId),
    ]);
    const ext = (account as { external_accounts?: { data?: Array<Record<string, unknown>> } }).external_accounts?.data ?? [];
    const first = ext.find((e) => e.default_for_currency) ?? ext[0];
    const bank: Bank | null = first
      ? {
          bankName: (first.bank_name as string | undefined) ?? (first.brand as string | undefined) ?? null,
          last4: (first.last4 as string | undefined) ?? null,
          currency: ((first.currency as string | undefined) ?? null)?.toUpperCase() ?? null,
        }
      : null;
    return NextResponse.json({
      connected: true,
      defaultCurrency: (account.default_currency ?? "usd").toUpperCase(),
      schedule: account.settings?.payouts?.schedule?.interval ?? null,
      balance: {
        available: balance.available.map((b) => ({ amount: b.amount, currency: b.currency })),
        pending: balance.pending.map((b) => ({ amount: b.amount, currency: b.currency })),
      },
      payouts: payouts.data.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        arrival_date: p.arrival_date,
        created: p.created,
        automatic: p.automatic,
      })),
      bank,
    });
  } catch (error) {
    console.error("[payouts/summary] Stripe error", { organizationId, accountId, error });
    return NextResponse.json({ error: "Couldn't load your Stripe balance" }, { status: 502 });
  }
}
