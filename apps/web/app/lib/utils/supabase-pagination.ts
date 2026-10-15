import { retrySupabaseOperation } from "./supabase-retry";

/**
 * PostgREST caps every response at `max_rows` (1000 in supabase/config.toml and the Supabase
 * default). A query that can return more rows than that is silently truncated — e.g. org-wide
 * orders, which made dashboard revenue under-count (the $8,390 vs $10,060 incident documented in
 * app/organizer/page.tsx). Every multi-event organizer query must go through `selectAllPages`.
 */
export const PAGE_SIZE = 1000;

/** Ids per `.in()` filter, to keep request URLs well under proxy/PostgREST limits. */
export const IN_CHUNK = 100;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Reads every page of a query. `page(from, to)` must return the query with a stable
 * `.order(<unique column>)` and `.range(from, to)` applied. Throws on the first error: partial
 * data here means silently wrong totals, which is worse than an error.
 */
export async function selectAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await retrySupabaseOperation<T[]>(
      async () => (await page(from, from + PAGE_SIZE - 1)) as { data: T[] | null; error: any }
    );
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}

/** `selectAllPages` over chunks of ids (each chunk paged independently), results concatenated. */
export async function selectAllPagesByIds<T>(
  ids: string[],
  page: (idsChunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const unique = Array.from(new Set(ids));
  const out: T[] = [];
  for (const part of chunk(unique, IN_CHUNK)) {
    out.push(...(await selectAllPages<T>((from, to) => page(part, from, to))));
  }
  return out;
}
