import { selectAllPages } from "./supabase-pagination";

/**
 * Who to notify about an event change. Both lists used to be a single unpaged query, so
 * PostgREST's 1000-row cap silently dropped everyone after the first 1000 orders / tickets.
 */

export interface OrderBuyer {
  id: string;
  email: string;
  name: string;
}

type OrderRow = {
  id: string;
  users: { id: string; email: string; first_name: string | null; last_name: string | null } | null;
};

/** Distinct buyers with a completed order for the event (e-mail recipients). Throws on DB error. */
export async function fetchCompletedOrderBuyers(db: any, eventId: string): Promise<OrderBuyer[]> {
  const rows = await selectAllPages<OrderRow>((from, to) =>
    db
      .from("orders")
      // orders tiene 3 FK a users (user_id, promoter_user_id, original_purchaser_user_id): sin el
      // nombre de la FK, PostgREST responde PGRST201 (relación ambigua) y no se lee nadie.
      .select("id, users!orders_user_id_fkey!inner (id, email, first_name, last_name)")
      .eq("event_id", eventId)
      .eq("status", "completed")
      .order("id", { ascending: true })
      .range(from, to)
  );
  const byUser = new Map<string, OrderBuyer>();
  for (const r of rows) {
    const u = r.users;
    if (!u || byUser.has(u.id)) continue;
    const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email;
    byUser.set(u.id, { id: u.id, email: u.email, name });
  }
  return Array.from(byUser.values());
}

/** Distinct users holding a ticket for the event (push recipients). Throws on DB error. */
export async function fetchTicketHolderIds(db: any, eventId: string): Promise<string[]> {
  const rows = await selectAllPages<{ id: string; user_id: string | null }>((from, to) =>
    db.from("tickets").select("id, user_id").eq("event_id", eventId).order("id", { ascending: true }).range(from, to)
  );
  return Array.from(new Set(rows.map((r) => r.user_id).filter((x): x is string => Boolean(x))));
}

/** Runs `send` for every item, `size` at a time (provider rate limits), never rejecting. */
export async function inBatches<T>(items: T[], size: number, send: (item: T) => Promise<unknown>): Promise<number> {
  let failed = 0;
  for (let i = 0; i < items.length; i += size) {
    const results = await Promise.allSettled(items.slice(i, i + size).map(send));
    failed += results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value === false)).length;
  }
  return failed;
}
