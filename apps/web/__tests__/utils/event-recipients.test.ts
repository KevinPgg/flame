import { describe, expect, it } from "vitest";
import { fetchCompletedOrderBuyers } from "@/app/lib/utils/event-recipients";
import { retrySupabaseOperation } from "@/app/lib/utils/supabase-retry";

/** PGRST201 tal como lo devuelve PostgREST cuando un embed es ambiguo: `details` es un array. */
const AMBIGUOUS = {
  code: "PGRST201",
  message: "Could not embed because more than one relationship was found for 'orders' and 'users'",
  details: [
    { cardinality: "many-to-one", embedding: "orders with users", relationship: "orders_user_id_fkey using orders(user_id) and users(id)" },
    { cardinality: "many-to-one", embedding: "orders with users", relationship: "orders_promoter_user_id_fkey using orders(promoter_user_id) and users(id)" },
  ],
  hint: "Try changing 'users' to one of the following: 'users!orders_user_id_fkey', 'users!orders_promoter_user_id_fkey'.",
};

/** Simula PostgREST: orders tiene varias FK a users, así que el embed sin nombre de FK falla. */
function fakeDb(rows: any[]) {
  return {
    from: () => {
      let columns = "";
      const q: any = {
        select: (c: string) => ((columns = c), q),
        eq: () => q,
        order: () => q,
        range: async (from: number, to: number) =>
          /users!orders_user_id_fkey/.test(columns)
            ? { data: rows.slice(from, to + 1), error: null }
            : { data: null, error: AMBIGUOUS },
      };
      return q;
    },
  };
}

describe("fetchCompletedOrderBuyers", () => {
  it("embebe users por orders_user_id_fkey (orders tiene 3 FK a users) y deduplica", async () => {
    const u = (id: string) => ({ id, email: `${id}@x.com`, first_name: "Ana", last_name: id });
    const buyers = await fetchCompletedOrderBuyers(fakeDb([{ id: "o1", users: u("a") }, { id: "o2", users: u("a") }, { id: "o3", users: u("b") }]), "ev");
    expect(buyers.map((b) => b.id)).toEqual(["a", "b"]);
    expect(buyers[0]).toEqual({ id: "a", email: "a@x.com", name: "Ana a" });
  });
});

describe("retrySupabaseOperation", () => {
  it("con `details` no string devuelve el error real (no TypeError) y no reintenta", async () => {
    let calls = 0;
    const result = await retrySupabaseOperation(async () => (calls++, { data: null, error: AMBIGUOUS }));
    expect(result.error).toBe(AMBIGUOUS);
    expect(calls).toBe(1);
  });

  it("sigue reintentando fallos de red aunque `details` sea un objeto", async () => {
    let calls = 0;
    const result = await retrySupabaseOperation(
      async () => (++calls < 2 ? { data: null, error: { message: "TypeError: fetch failed", details: { x: 1 } } } : { data: [1], error: null }),
      3,
      1
    );
    expect(result.data).toEqual([1]);
    expect(calls).toBe(2);
  });
});
