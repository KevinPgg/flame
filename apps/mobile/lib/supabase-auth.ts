/**
 * Authenticated Supabase client for user-scoped queries.
 *
 * Uses a Clerk-issued JWT (template: "supabase") so RLS policies can verify
 * the user via `auth.jwt() ->> 'sub'` matching `users.clerk_id`.
 *
 * Prerequisites:
 * 1. Create a "supabase" JWT template in Clerk Dashboard → JWT Templates.
 * 2. Set the signing key to your Supabase project's JWT Secret
 *    (Settings → API → JWT Secret in the Supabase Dashboard).
 * 3. Leave the default claims — Clerk sets `sub` to the Clerk user ID,
 *    which matches `users.clerk_id` in RLS policies.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const SUPABASE_JWT_TEMPLATE = "supabase";

/**
 * Creates a Supabase client authenticated with the given Clerk token.
 * The token must be issued via the "supabase" JWT template so Supabase
 * can verify the signature and RLS policies can access `auth.jwt()`.
 */
export function createAuthenticatedClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Obtains a Supabase-compatible JWT from Clerk and returns an authenticated
 * Supabase client. Throws if the user is not signed in or the template is
 * not configured.
 */
export async function getAuthenticatedClient(
  getToken: (options?: { template?: string }) => Promise<string | null>
): Promise<SupabaseClient> {
  let token: string | null;
  try {
    token = await getToken({ template: SUPABASE_JWT_TEMPLATE });
  } catch (err) {
    console.error(
      "[supabase-auth] getToken threw:",
      err instanceof Error ? err.stack ?? err.message : String(err),
    );
    throw new Error(
      `Failed to obtain Supabase token from Clerk: ${err instanceof Error ? err.message : String(err)}. ` +
      'Ensure a "supabase" JWT template is configured in the Clerk Dashboard ' +
      "with your Supabase project's JWT Secret as the signing key."
    );
  }

  if (!token) {
    throw new Error(
      'Failed to obtain Supabase token from Clerk (returned null). ' +
      'Ensure a "supabase" JWT template is configured in the Clerk Dashboard ' +
      "with your Supabase project's JWT Secret as the signing key."
    );
  }

  return createAuthenticatedClient(token);
}
