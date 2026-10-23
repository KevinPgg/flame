/**
 * Who has tickets for an event and how many are already scanned (Kevin, 2026-10-23): card
 * sales, bank-transfer orders and free tickets (sent) in one list, each with its origin and
 * "scanned / quantity", plus totals. Shared by the Purchases tab on the web and in the app.
 */
import { bankOrderNetCents } from "./event-detail";

export type AttendanceOrigin = "sale" | "transfer" | "comp";

export interface AttendanceRow {
  id: string;
  origin: AttendanceOrigin;
  name: string;
  email: string;
  tierName: string;
  stageName: string | null;
  quantity: number;
  scanned: number;
  /** What the organizer gets; null for free tickets. */
  amountCents: number | null;
  createdAt: string;
}

export interface AttendanceSale {
  id: string;
  userName: string;
  email: string;
  tierName: string;
  stageName: string | null;
  quantity: number;
  basePrice: number;
  /** Any ticket of the order scanned (older API responses only have this). */
  scanned: boolean;
  /** Tickets of the order already scanned. */
  scannedCount?: number | null;
  createdAt: string;
}

export interface AttendanceTransfer {
  id: string;
  email: string;
  customer_name: string | null;
  created_at: string;
  order_quantity?: number | null;
  order_total_cents?: number | null;
  checked_in_at?: string | null;
  checked_in_count?: number | null;
  ticket_tiers?: { name: string } | null;
  metadata?: { stage_name?: string | null } | null;
}

export interface AttendanceComp {
  id: string;
  email: string;
  customer_name: string | null;
  created_at: string;
  checked_in_at?: string | null;
  quantity?: number | null;
  ticket_tiers?: { name: string } | null;
}

const time = (iso: string) => new Date(iso).getTime() || 0;

export function attendance(input: {
  sales: AttendanceSale[];
  transfers: AttendanceTransfer[];
  comps: AttendanceComp[];
}): { rows: AttendanceRow[]; totals: { tickets: number; scanned: number } } {
  const rows: AttendanceRow[] = [];

  for (const p of input.sales) {
    const quantity = p.quantity || 1;
    rows.push({
      id: p.id,
      origin: "sale",
      name: p.userName,
      email: p.email,
      tierName: p.tierName,
      stageName: p.stageName,
      quantity,
      scanned: Math.min(quantity, p.scannedCount ?? (p.scanned ? 1 : 0)),
      amountCents: p.basePrice,
      createdAt: p.createdAt,
    });
  }

  for (const o of input.transfers) {
    const quantity = o.order_quantity || 1;
    rows.push({
      id: o.id,
      origin: "transfer",
      name: o.customer_name?.trim() || o.email,
      email: o.email,
      tierName: o.ticket_tiers?.name ?? "",
      stageName: o.metadata?.stage_name ?? null,
      quantity,
      scanned: Math.min(quantity, o.checked_in_count ?? (o.checked_in_at ? 1 : 0)),
      amountCents: bankOrderNetCents(o),
      createdAt: o.created_at,
    });
  }

  // Free tickets are stored one row per ticket; one send of 3 = 3 rows with the same created_at.
  const groups = new Map<string, AttendanceRow>();
  for (const c of input.comps) {
    const tierName = c.ticket_tiers?.name ?? "";
    const key = `${c.email.toLowerCase()}|${tierName}|${c.created_at}`;
    const qty = c.quantity || 1;
    const scanned = c.checked_in_at ? qty : 0;
    const prev = groups.get(key);
    if (prev) {
      prev.quantity += qty;
      prev.scanned += scanned;
    } else {
      groups.set(key, {
        id: c.id,
        origin: "comp",
        name: c.customer_name?.trim() || c.email,
        email: c.email,
        tierName,
        stageName: null,
        quantity: qty,
        scanned,
        amountCents: null,
        createdAt: c.created_at,
      });
    }
  }
  rows.push(...groups.values());

  rows.sort((a, b) => time(b.createdAt) - time(a.createdAt));
  return {
    rows,
    totals: {
      tickets: rows.reduce((n, r) => n + r.quantity, 0),
      scanned: rows.reduce((n, r) => n + r.scanned, 0),
    },
  };
}
