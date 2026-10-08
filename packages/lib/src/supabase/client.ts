/**
 * Supabase Client Factory
 *
 * Provides factory functions for creating Supabase clients.
 * These functions are platform-agnostic and can be used in both web and mobile.
 *
 * Note: The actual environment variables are platform-specific:
 * - Web (Next.js): Uses NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - Mobile (Expo): Uses EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
 *
 * Each platform should call these factory functions with their own env vars.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type { SupabaseClient };

/**
 * Configuration for creating a Supabase client
 */
export interface SupabaseClientConfig {
  url: string;
  anonKey: string;
}

/**
 * Configuration for creating a Supabase admin client (server-side only)
 */
export interface SupabaseAdminConfig {
  url: string;
  serviceRoleKey: string;
}

/**
 * Creates a Supabase client for client-side operations
 *
 * @param config - Configuration with URL and anon key
 * @returns Supabase client or null if config is invalid
 *
 * @example
 * // In Next.js
 * const supabase = createSupabaseClient({
 *   url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *   anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
 * });
 *
 * @example
 * // In Expo
 * const supabase = createSupabaseClient({
 *   url: process.env.EXPO_PUBLIC_SUPABASE_URL!,
 *   anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
 * });
 */
export function createSupabaseClient(
  config: SupabaseClientConfig
): SupabaseClient | null {
  if (!config.url || !config.anonKey) {
    console.warn("Supabase client: Missing URL or anon key");
    return null;
  }

  return createClient(config.url, config.anonKey);
}

/**
 * Creates a Supabase admin client for server-side operations
 * This should ONLY be used in API routes or server functions
 *
 * @param config - Configuration with URL and service role key
 * @returns Supabase admin client or null if config is invalid
 *
 * @example
 * // In Next.js API route
 * const supabaseAdmin = createSupabaseAdmin({
 *   url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *   serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
 * });
 */
export function createSupabaseAdmin(
  config: SupabaseAdminConfig
): SupabaseClient | null {
  // Runtime guard: prevent browser usage to avoid leaking service role key
  // Use globalThis to avoid TypeScript errors in Node.js environment
  if (
    typeof globalThis !== "undefined" &&
    "window" in globalThis &&
    typeof (globalThis as { window?: unknown }).window !== "undefined"
  ) {
    throw new Error(
      "createSupabaseAdmin is server-only and cannot be called in browser environments. " +
        "Use createSupabaseClient for client-side operations instead."
    );
  }

  if (!config.url || !config.serviceRoleKey) {
    console.warn("Supabase admin: Missing URL or service role key");
    return null;
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Check if a Supabase client config is valid
 */
export function isSupabaseConfigured(
  config: Partial<SupabaseClientConfig>
): boolean {
  return Boolean(config.url && config.anonKey);
}

/**
 * Check if a Supabase admin config is valid
 */
export function isSupabaseAdminConfigured(
  config: Partial<SupabaseAdminConfig>
): boolean {
  return Boolean(config.url && config.serviceRoleKey);
}
