import type { ReactElement } from "react";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Language } from "@project-flame/lib";
import { I18nProvider } from "../../lib/i18n";
import type { EnrichedOrgEvent } from "../../hooks/useOrgEventEnriched";
import type { MyOrganization } from "../../lib/v2/organizer-api";

/** RNTL 14: render is async. */
export async function renderV2(ui: ReactElement, language: Language = "en") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return await render(
    <QueryClientProvider client={client}>
      <I18nProvider initialLanguage={language}>{ui}</I18nProvider>
    </QueryClientProvider>,
  );
}

const DAY = 24 * 60 * 60 * 1000;
export const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

export function event(id: string, name: string, startsInDays: number, extra: Partial<EnrichedOrgEvent> = {}): EnrichedOrgEvent {
  return {
    id,
    name,
    slug: id,
    starts_at: inDays(startsInDays),
    ends_at: inDays(startsInDays + 0.2),
    image_url: null,
    city: "Guayaquil",
    venue: "Club",
    description: null,
    status: "published",
    requires_rsvp: false,
    currency: "USD",
    timezone: "America/Guayaquil",
    ticket_tiers: [],
    purchases: [],
    totalRevenue: 0,
    totalAttendees: 0,
    pending_rsvps: 0,
    promotional_tickets: [],
    bank_transfer_orders: [],
    promotional_codes: [],
    promoter_links: [],
    ...extra,
  };
}

export function org(role: MyOrganization["role"], extra: Partial<MyOrganization> = {}): MyOrganization {
  return {
    id: "org-1",
    name: "Kora Club",
    slug: "kora",
    owner_user_id: "u-owner",
    approved: true,
    logo_url: null,
    role,
    eventCount: 0,
    ...extra,
  };
}
