/**
 * In-memory stand-in for the Supabase query builder, enough for the organizer API routes:
 * select/eq/in/not/is/limit/order + single/maybeSingle/await, and insert/update/delete/upsert
 * (recorded, not applied). Embedded relations are given pre-joined in the fixture rows.
 *
 * Behaves like PostgREST where it matters for correctness tests:
 * - every response is capped at `maxRows` (default 1000, as supabase/config.toml `max_rows`);
 * - `.range(from, to)` pages through the filtered rows; `.order(col)` sorts by that column;
 * - `.neq()` excludes NULLs (SQL `col <> x` is NULL for NULL col);
 * - filters accept embedded paths ("ticket_tiers.event_id").
 */
type Row = Record<string, any>;
export type Call = { table: string; op: string; filters: string[] };

const get = (r: Row, path: string) => path.split(".").reduce<any>((v, k) => (v == null ? v : v[k]), r);

export function fakeSupabase(
  tables: Record<string, Row[]>,
  opts: { failTables?: string[]; maxRows?: number } = {}
) {
  const maxRows = opts.maxRows ?? 1000;
  const calls: Call[] = [];
  const from = (table: string) => {
    const preds: Array<(r: Row) => boolean> = [];
    const desc: string[] = [];
    let op = "select";
    let payload: unknown;
    let limitN: number | undefined;
    let head = false;
    let range: [number, number] | undefined;
    let orderBy: { col: string; asc: boolean } | undefined;
    const run = (mode: "single" | "maybe" | "many") => {
      calls.push({ table, op, filters: desc });
      if (opts.failTables?.includes(table)) return Promise.resolve({ data: null, error: { message: "boom" }, count: null });
      if (op !== "select") {
        const first = Array.isArray(payload) ? payload[0] : payload;
        return Promise.resolve({ data: mode === "many" ? (Array.isArray(payload) ? payload : [payload]) : first ?? null, error: null });
      }
      let rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
      if (head) return Promise.resolve({ data: null, error: null, count: rows.length });
      if (orderBy) {
        const { col, asc } = orderBy;
        rows = [...rows].sort((a, b) => (get(a, col) < get(b, col) ? -1 : get(a, col) > get(b, col) ? 1 : 0) * (asc ? 1 : -1));
      }
      if (range) rows = rows.slice(range[0], range[1] + 1);
      if (limitN !== undefined) rows = rows.slice(0, limitN);
      rows = rows.slice(0, maxRows);
      if (mode === "single")
        return Promise.resolve(
          rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } }
        );
      if (mode === "maybe") return Promise.resolve({ data: rows[0] ?? null, error: null });
      return Promise.resolve({ data: rows, error: null, count: rows.length });
    };
    const api: any = {
      select: (_c?: string, o?: { head?: boolean }) => {
        if (o?.head) head = true;
        return api;
      },
      eq: (c: string, v: unknown) => (preds.push((r) => get(r, c) === v), desc.push(`${c}=${v}`), api),
      neq: (c: string, v: unknown) => (preds.push((r) => get(r, c) != null && get(r, c) !== v), api),
      in: (c: string, vs: unknown[]) => (preds.push((r) => vs.includes(get(r, c))), desc.push(`${c} in ${vs.join("|")}`), api),
      not: (c: string) => (preds.push((r) => get(r, c) !== null && get(r, c) !== undefined), api),
      is: (c: string, v: unknown) => (preds.push((r) => (get(r, c) ?? null) === v), api),
      gt: () => api,
      gte: () => api,
      lt: () => api,
      lte: () => api,
      ilike: () => api,
      or: () => api,
      order: (col: string, o?: { ascending?: boolean; foreignTable?: string }) =>
        o?.foreignTable ? api : ((orderBy = { col, asc: o?.ascending !== false }), api),
      range: (from: number, to: number) => ((range = [from, to]), api),
      limit: (n: number) => ((limitN = n), api),
      insert: (p: unknown) => ((op = "insert"), (payload = p), api),
      update: (p: unknown) => ((op = "update"), (payload = p), api),
      upsert: (p: unknown) => ((op = "upsert"), (payload = p), api),
      delete: () => ((op = "delete"), api),
      single: () => run("single"),
      maybeSingle: () => run("maybe"),
      then: (res: any, rej: any) => run("many").then(res, rej),
    };
    return api;
  };
  return {
    from,
    rpc: async () => ({ data: null, error: null }),
    storage: {
      from: () => ({
        upload: async (path: string) => ({ data: { path }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
        remove: async () => ({ data: [], error: null }),
        list: async () => ({ data: [], error: null }),
      }),
    },
    calls,
    writes: () => calls.filter((c) => c.op !== "select"),
  };
}
