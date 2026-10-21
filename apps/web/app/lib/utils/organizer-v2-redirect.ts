/**
 * Organizer web → Flame 2.0 (decision 2026-10-16: v2 is the organizer panel from now on).
 *
 * Every link, e-mail and push that still points at a v1 organizer screen lands on its v2
 * screen. The public organizer page
 * (/organizer/[slug]) are left alone. Escape hatch: ORGANIZER_V1=true turns this off.
 *
 * Returns the v2 path + query to redirect to, or null to let the request through.
 */
export function organizerV2Redirect(pathname: string, search: URLSearchParams): string | null {
  const org = search.get("org");
  const q = (extra?: Record<string, string>) => {
    const out = new URLSearchParams();
    if (org) out.set("org", org);
    for (const [k, v] of Object.entries(extra ?? {})) out.set(k, v);
    const s = out.toString();
    return s ? `?${s}` : "";
  };
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/organizer") {
    if (!org) return `/v2/organizer`;
    const tab = search.get("tab");
    if (tab === "create-event") return `/v2/organizer/create${q()}`;
    if (tab === "rsvps") return `/v2/organizer/rsvps${q()}`;
    return `/v2/organizer${q()}`;
  }

  if (path === "/organizer/team") return `/v2/organizer/team${q()}`;

  // Path-style shortcuts people type (/organizer/create?org=…). Only with ?org=, because without it
  // /organizer/<word> is the public page of an organization whose slug could be that word.
  if (org) {
    if (path === "/organizer/create") return `/v2/organizer/create${q()}`;
    if (path === "/organizer/rsvps") return `/v2/organizer/rsvps${q()}`;
    if (path === "/organizer/payouts") return `/v2/organizer/payouts${q()}`;
  }

  // Settings: Organization → v2 organization settings; Personal → /v2/account (the person's own
  // settings, not the organization's); Payouts → its own v2 screen (keeps the
  // ?connect=success flag Stripe onboarding comes back with).
  if (path === "/organizer/settings") {
    const tab = search.get("tab");
    if (tab === "payouts") {
      const connect = search.get("connect");
      return `/v2/organizer/payouts${q(connect ? { connect } : undefined)}`;
    }
    if (tab === "personal") return "/v2/account";
    return `/v2/organizer/settings${q()}`;
  }

  const event = /^\/organizer\/event\/([^/]+)$/.exec(path);
  if (event) return `/v2/organizer/event/${event[1]}${q()}`;

  const rsvp = /^\/organizer\/rsvps\/([^/]+)$/.exec(path);
  if (rsvp) return `/v2/organizer/rsvps/${rsvp[1]}${q()}`;

  return null;
}
