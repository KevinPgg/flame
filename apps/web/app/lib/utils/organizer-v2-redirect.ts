/**
 * Organizer web → Flame 2.0 (decision 2026-10-16: v2 is the organizer panel from now on).
 *
 * Every link, e-mail and push that still points at a v1 organizer screen lands on its v2
 * screen. Screens without a v2 yet (settings/payouts) and the public organizer page
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

  const event = /^\/organizer\/event\/([^/]+)$/.exec(path);
  if (event) return `/v2/organizer/event/${event[1]}${q()}`;

  const rsvp = /^\/organizer\/rsvps\/([^/]+)$/.exec(path);
  if (rsvp) return `/v2/organizer/rsvps/${rsvp[1]}${q()}`;

  return null;
}
