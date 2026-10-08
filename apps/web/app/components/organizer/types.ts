// Shared types for organizer components

// Form-specific stage interface (doesn't include database fields like id, created_at, etc.)
export interface FormTicketStage {
  id?: string; // Optional - present when editing existing stage
  name: string;
  price_cents: number;
  quantity: number;
  order_index: number;
  sold_quantity?: number; // Present when editing existing stage
  /** W4-C2 (May 2026): per-stage organizer description. Max 120 chars enforced
   *  by the textarea + the API Zod schema. Optional. */
  description?: string | null;
}

import type { FormField } from "@project-flame/lib";

// Inline Tier Form Component Props
export interface TierInlineFormProps {
  tier?: any;
  eventId?: string;
  tentativeEventStart?: string; // For validation during event editing
  // W0-Q4: event END time (Ecuador-local string) — used to pre-fill a blank
  // tier `sales_end` to the event end, matching the create-event auto-fill.
  tentativeEventEnd?: string;
  /**
   * Event-level registration form fields (non-archived). Pass this so the per-tier
   * "Registration form" row can show how many fields the tier currently collects.
   * If `undefined` or empty, the per-tier row is hidden — the event has no form.
   */
  eventFormFields?: FormField[];
  onSave: () => void;
  onCancel: () => void;
}
