/**
 * Organizer "Send tickets" — pure functions shared by web and mobile (Flame 2.0).
 *
 * Two modes, same as v1 (apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx → SendTicketsSection):
 * - "free": complimentary tickets → POST /api/organizer/promotional-tickets (tier only, no stage).
 * - "bank": bank-transfer orders  → POST /api/organizer/bank-transfer-tickets (tier + stage,
 *   optional custom unit price).
 * Validation mirrors those routes, so the form rejects exactly what the server rejects.
 * Neither route blocks on remaining inventory (organizer override, on purpose) → "left" is
 * information for the organizer, never a hard limit here.
 */
import { findFirstAvailableStage } from "../utils/availability";
import { bankOrderNetCents } from "./event-detail";

export type SendMode = "free" | "bank";

/** Both routes accept 1–10 per send. */
export const SEND_MAX_QUANTITY = 10;
/** bank-transfer-tickets rejects a custom unit price above $10,000. */
export const SEND_MAX_CUSTOM_PRICE_CENTS = 1_000_000;

export interface SendStageRow {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  sold_quantity: number;
  order_index?: number;
}

export interface SendTierRow {
  id: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
  quantity_reserved?: number | null;
  is_manually_sold_out?: boolean | null;
  is_hidden?: boolean | null;
  ticket_stages?: SendStageRow[] | null;
}

/** One choice in the "Ticket" step: a tier (free mode / tiers without stages) or a tier stage. */
export interface SendOption {
  /** `tierId` or `tierId:stageId` (same encoding as v1). */
  key: string;
  tierId: string;
  stageId: string | null;
  tierName: string;
  stageName: string | null;
  /** Unit price the buyer would pay (bank mode). Free mode shows "Complimentary" instead. */
  priceCents: number;
  /** Remaining capacity, never negative. */
  left: number;
  /** Marked sold out by the organizer, or no capacity left. Still selectable (override). */
  soldOut: boolean;
  hidden: boolean;
  /** For stages: the stage buyers are currently on (waterfall). */
  current: boolean;
}

const leftOf = (total: number, used: number) => Math.max(0, (total || 0) - (used || 0));

export function sendOptions(tiers: SendTierRow[], mode: SendMode): SendOption[] {
  return tiers.flatMap((t): SendOption[] => {
    const tierLeft = leftOf(t.quantity_total, (t.quantity_sold || 0) + (t.quantity_reserved || 0));
    const manual = Boolean(t.is_manually_sold_out);
    const hidden = Boolean(t.is_hidden);
    const stages = mode === "bank" ? [...(t.ticket_stages ?? [])] : [];
    if (stages.length === 0) {
      return [
        {
          key: t.id,
          tierId: t.id,
          stageId: null,
          tierName: t.name,
          stageName: null,
          priceCents: t.price_cents,
          left: tierLeft,
          soldOut: manual || tierLeft === 0,
          hidden,
          current: true,
        },
      ];
    }
    stages.sort((a, b) => (a.order_index ?? Infinity) - (b.order_index ?? Infinity));
    const currentId = findFirstAvailableStage({ price_cents: t.price_cents, ticket_stages: stages }).stageId;
    return stages.map((s) => {
      const left = Math.min(leftOf(s.quantity, s.sold_quantity), tierLeft);
      return {
        key: `${t.id}:${s.id}`,
        tierId: t.id,
        stageId: s.id,
        tierName: t.name,
        stageName: s.name,
        priceCents: s.price_cents,
        left,
        soldOut: manual || left === 0,
        hidden,
        current: s.id === currentId,
      };
    });
  });
}

/** Preselected option: the first current, available, visible one; else the first available; else the first. */
export function defaultSendOption(options: SendOption[]): SendOption | null {
  return (
    options.find((o) => o.current && !o.soldOut && !o.hidden) ??
    options.find((o) => !o.soldOut) ??
    options[0] ??
    null
  );
}

export const isValidSendQuantity = (n: number) => Number.isInteger(n) && n >= 1 && n <= SEND_MAX_QUANTITY;

export type CustomPriceError = "invalid" | "tooHigh";

/**
 * Organizer-typed unit price (bank mode) → cents. Accepts "25", "25.5", "25,50" (es keyboards).
 * Must be > 0 (free tickets go through "free" mode) and ≤ $10,000, like the API.
 */
export function parseCustomPrice(input: string): { cents: number | null; error: CustomPriceError | null } {
  const raw = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return { cents: null, error: "invalid" };
  const cents = Math.round(Number.parseFloat(raw) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return { cents: null, error: "invalid" };
  if (cents > SEND_MAX_CUSTOM_PRICE_CENTS) return { cents: null, error: "tooHigh" };
  return { cents, error: null };
}

/** "First Last", or the email when the account has no name. */
export function personName(p: { first_name?: string | null; last_name?: string | null; email: string }): string {
  return [p.first_name, p.last_name].map((x) => x?.trim()).filter(Boolean).join(" ") || p.email;
}

/** Avatar initials from a name or an email: "Ana Pinto" → "AP", "dj.guest@mail.com" → "DG". */
export function initialsOf(text: string): string {
  return text
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** search-users matches the stored (lowercase) email exactly. */
export const normalizeEmail = (s: string) => s.trim().toLowerCase();
export const isLikelyEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Comp ticket as returned by /api/organizer/data (one row per ticket). */
export interface SentCompRow {
  id: string;
  email: string;
  customer_name: string | null;
  created_at: string;
  quantity?: number | null;
  ticket_tiers?: { name: string } | null;
}

/** Bank-transfer order as transformed by /api/organizer/data (one row per order). */
export interface SentBankRow {
  id: string;
  email: string;
  customer_name: string | null;
  created_at: string;
  order_quantity?: number | null;
  order_total_cents?: number | null;
  ticket_tiers?: { name: string } | null;
  metadata?: { stage_name?: string | null } | null;
}

export interface SentEntry {
  id: string;
  name: string;
  email: string;
  tierName: string;
  stageName: string | null;
  quantity: number;
  /** Organizer amount for bank orders; null for comps ("Complimentary"). */
  amountCents: number | null;
  createdAt: string;
}

const time = (iso: string) => new Date(iso).getTime() || 0;

/**
 * "Sent" history for the selected mode, newest first.
 * Comps are stored one row per ticket; a send of 3 inserts 3 rows in one statement (same
 * created_at), so they are grouped back into one line "3 × tier" (v1 lists them one by one).
 * Bank amounts use the same legacy-aware base price as v1.
 */
export function sentHistory(
  input: { comps: SentCompRow[]; bankOrders: SentBankRow[] },
  mode: SendMode
): SentEntry[] {
  if (mode === "bank") {
    return input.bankOrders
      .map((o) => ({
        id: o.id,
        name: o.customer_name?.trim() || o.email,
        email: o.email,
        tierName: o.ticket_tiers?.name ?? "",
        stageName: o.metadata?.stage_name ?? null,
        quantity: o.order_quantity || 1,
        amountCents: bankOrderNetCents(o),
        createdAt: o.created_at,
      }))
      .sort((a, b) => time(b.createdAt) - time(a.createdAt));
  }
  const groups = new Map<string, SentEntry>();
  for (const c of input.comps) {
    const tierName = c.ticket_tiers?.name ?? "";
    const key = `${c.email.toLowerCase()}|${tierName}|${c.created_at}`;
    const prev = groups.get(key);
    if (prev) prev.quantity += c.quantity || 1;
    else
      groups.set(key, {
        id: c.id,
        name: c.customer_name?.trim() || c.email,
        email: c.email,
        tierName,
        stageName: null,
        quantity: c.quantity || 1,
        amountCents: null,
        createdAt: c.created_at,
      });
  }
  return [...groups.values()].sort((a, b) => time(b.createdAt) - time(a.createdAt));
}
