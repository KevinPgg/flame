import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { Navbar } from "../../../components";
import RsvpManagement from "../../../components/RsvpManagement";
import { canManageEventRsvps } from "../../../lib/utils/event-rsvp-authz";

interface RsvpPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{ org?: string }>;
}

interface OrgContext {
  id: string;
  name: string;
  slug: string;
  approved: boolean;
}

interface MembershipRow {
  role: string;
  organizations: OrgContext | OrgContext[] | null;
}

/** Normalize the embedded `organizations` join (Supabase returns array or single). */
function unwrapOrg(row: MembershipRow): OrgContext | null {
  const org = row.organizations;
  if (!org) return null;
  return Array.isArray(org) ? (org[0] ?? null) : org;
}

export default async function RsvpPage({ params, searchParams }: RsvpPageProps) {
  const { userId } = await auth();
  const { id: eventId } = await params;
  const params_search = await searchParams;
  const orgSlug = params_search.org;

  if (!userId || !supabaseAdmin) {
    redirect("/");
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, organization_id, name")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    notFound();
  }

  const { data: supabaseUser } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("clerk_id", userId)
    .single();

  if (!supabaseUser) {
    redirect("/");
  }

  // W3-B1: authorize via shared helper. Covers both primary-org members
  // (any role) and cohost-org owner/admins. Mirrors the API routes.
  const authorized = await canManageEventRsvps(
    supabaseAdmin,
    supabaseUser.id,
    event.organization_id,
    event.id,
  );

  if (!authorized) {
    redirect("/?onboarding=true");
  }

  // Resolve the "active" org context for breadcrumbs + cancel-payment URLs.
  // Order of preference:
  //   1. ?org=<slug> param, when it matches one of the user's approved orgs
  //      that actually has access to this event (primary member OR cohost admin).
  //   2. The event's primary org, if user is a member.
  //   3. Any cohost org of theirs that has access (first match wins).
  const { data: rawMemberships } = await supabaseAdmin
    .from("organization_members")
    .select(`role, organizations (id, name, slug, approved)`)
    .eq("user_id", supabaseUser.id);

  const memberships: MembershipRow[] = (rawMemberships ?? []) as MembershipRow[];

  const approvedOrgs = memberships
    .map(m => ({ role: m.role, org: unwrapOrg(m) }))
    .filter((m): m is { role: string; org: OrgContext } => Boolean(m.org?.approved));

  if (approvedOrgs.length === 0) {
    redirect("/?onboarding=true");
  }

  // Which of the user's orgs can manage RSVPs on this event?
  //   - primary-org membership → any role grants access
  //   - cohost-org → only owner/admin grants access
  const { data: cohostAssignments } = await supabaseAdmin
    .from("event_assignments")
    .select("cohost_organization_id")
    .eq("event_id", event.id)
    .not("cohost_organization_id", "is", null);

  const cohostOrgIds = new Set(
    (cohostAssignments ?? [])
      .map(a => a.cohost_organization_id)
      .filter((id): id is string => Boolean(id)),
  );

  const eligibleOrgs = approvedOrgs.filter(({ role, org }) => {
    if (org.id === event.organization_id) return true;
    if (cohostOrgIds.has(org.id) && (role === "owner" || role === "admin")) return true;
    return false;
  });

  if (eligibleOrgs.length === 0) {
    // canManageEventRsvps returned true but no eligible org with approved
    // membership exists — treat as not onboarded.
    redirect("/?onboarding=true");
  }

  let organization: OrgContext | undefined;
  if (orgSlug) {
    organization = eligibleOrgs.find(e => e.org.slug === orgSlug)?.org;
  }
  if (!organization) {
    organization =
      eligibleOrgs.find(e => e.org.id === event.organization_id)?.org
      ?? eligibleOrgs[0].org;
  }

  const hasMultipleOrgs = approvedOrgs.length > 1;
  if (hasMultipleOrgs && (!orgSlug || orgSlug !== organization.slug)) {
    redirect(`/organizer/rsvps/${eventId}?org=${organization.slug}`);
  }

  // Fetch the full event data with ticket tiers. No org_id filter here:
  // authorization is already enforced by canManageEventRsvps + eligibleOrgs.
  const { data: fullEvent, error: fullEventError } = await supabaseAdmin
    .from("events")
    .select(
      `
      *,
      ticket_tiers (
        id,
        name,
        price_cents,
        quantity_total,
        quantity_sold
      )
    `
    )
    .eq("id", eventId)
    .single();

  if (fullEventError || !fullEvent) {
    notFound();
  }

  const { data: rsvpsRaw, error: rsvpsError } = await supabaseAdmin
      .from("rsvps")
      .select(
        `
        id,
        user_id,
        event_id,
        ticket_tier_id,
        requested_quantity,
        status,
        requested_at,
        approved_at,
        approved_by,
        rejected_at,
        rejected_by,
        stage_id,
        stage_name,
        stage_price_cents,
        fee_percentage,
        registration_data,
        base_price_cents,
        total_amount_cents,
        users!user_id (
          first_name,
          last_name,
          email,
          document_id
        ),
        ticket_tiers (
          name,
          price_cents
        )
      `
      )
      .eq("event_id", eventId)
      .order("requested_at", { ascending: false });

  const rsvps =
    rsvpsRaw?.map(rsvp => ({
      ...rsvp,
      users: Array.isArray(rsvp.users) ? rsvp.users[0] : rsvp.users,
      ticket_tiers: Array.isArray(rsvp.ticket_tiers)
        ? rsvp.ticket_tiers[0]
        : rsvp.ticket_tiers,
    })) || [];

  if (rsvpsError) {
    console.error("Error fetching RSVPs:", rsvpsError);
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background">
        <RsvpManagement event={fullEvent} rsvps={rsvps} organization={organization} />
      </div>
    </>
  );
}
