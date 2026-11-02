/**
 * Followers of organizations (fase 4.2). Counts only — who follows whom stays private.
 * Uses the SQL function organization_follower_counts (see migration 20261102150000).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_FOLLOWER_IDS = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** { orgId: followers } for every id asked (0 when nobody follows it). */
export async function followerCounts(db: SupabaseClient, orgIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(orgIds.filter(isUuid))];
  const out: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  if (ids.length === 0) return out;
  const { data, error } = await db.rpc("organization_follower_counts", { p_org_ids: ids });
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ organization_id: string; followers: number | string }>) {
    out[r.organization_id] = Number(r.followers) || 0;
  }
  return out;
}
