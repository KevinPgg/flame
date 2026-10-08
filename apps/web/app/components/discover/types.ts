import type {
  TicketStage,
  TicketTier,
  OrganizationPublic,
} from "@project-flame/lib";

/** Minimal ticket stage shape for discover display. */
export type DiscoverTicketStage = Pick<
  TicketStage,
  "id" | "price_cents" | "quantity" | "sold_quantity" | "order_index"
>;

/** Minimal ticket tier shape for discover display (getLowestPrice compatible). */
export type DiscoverTicketTier = Pick<
  TicketTier,
  | "id"
  | "price_cents"
  | "quantity_total"
  | "quantity_sold"
  | "sales_start"
  | "sales_end"
> & {
  ticket_stages?: DiscoverTicketStage[];
};

/** Event shape returned by the discover page server component. */
export interface DiscoverEvent {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  starts_at: string;
  ends_at: string;
  venue: string;
  city: string;
  timezone: string | null;
  requires_rsvp: boolean;
  currency: string | null;
  is_featured?: boolean;
  main_featured?: boolean;
  description: string | null;
  organizations?:
    | { name: string; slug: string }
    | { name: string; slug: string }[]
    | null;
  ticket_tiers?: DiscoverTicketTier[];
}

/** Organizer shape for ExploreOrganizers. */
export type DiscoverOrganizer = Pick<
  OrganizationPublic,
  "id" | "name" | "slug"
> & {
  logo_url?: string | null;
};

/** FAQ item shape — re-exported from shared lib for discover types. */
export type { FAQItem } from "@project-flame/lib";
