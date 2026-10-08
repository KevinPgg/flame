// Main Event interface - all fields are REQUIRED
// NOTE: ends_at is guaranteed to exist due to:
// 1. Database NOT NULL constraint (verified via Supabase MCP)
// 2. Zod schema validation (required, not optional)
// 3. Frontend form validation (required HTML input)
export interface Event {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  city: string;
  venue: string;
  starts_at: string; // REQUIRED - always present
  ends_at: string; // REQUIRED - always present
  description?: string;
  image_url?: string;
  status: "published";
  is_featured?: boolean;
  created_at: string;
  updated_at: string;
  organizations?: {
    name: string;
    slug: string;
  };
  ticket_tiers?: TicketTier[];
}

export interface TicketStage {
  id: string;
  ticket_tier_id: string;
  name: string;
  price_cents: number;
  currency: string;
  quantity: number;
  sold_quantity: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface TicketTier {
  id: string;
  event_id: string;
  name: string;
  price_cents: number; // Kept for backward compatibility, but stages will determine actual pricing
  quantity_total: number;
  quantity_sold: number;
  quantity_reserved?: number; // Count of pending/approved RSVPs (added by events API)
  per_user_limit: number | null;
  sales_start: string | null;
  sales_end: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
  description?: string;
  ticket_stages?: TicketStage[];
}

export interface TicketTierWithStage extends TicketTier {
  current_stage_price?: number;
  current_stage?: {
    id: string;
    name: string;
    price_cents: number;
  };
}
