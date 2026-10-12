import { DEFAULT_LANGUAGE, resolveLanguage, type Language } from "@project-flame/lib";
import { supabaseAdmin } from "../../lib/supabase/server";

/**
 * The signed-in user's UI language from users.language (migration 20261008170000).
 * Never throws: no user, no DB, or the column not migrated yet → English.
 */
export async function getUserLanguage(clerkId: string | null | undefined): Promise<Language> {
  if (!clerkId || !supabaseAdmin) return DEFAULT_LANGUAGE;
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("language")
      .eq("clerk_id", clerkId)
      .maybeSingle();
    if (error) return DEFAULT_LANGUAGE;
    return resolveLanguage((data as { language?: string } | null)?.language);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
