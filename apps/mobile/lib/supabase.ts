import { z } from "zod";
import {
  createSupabaseClient as defaultCreateSupabaseClient,
  type SupabaseClient,
} from "@project-flame/lib";

const envSchema = z.object({
  url: z.string().url("EXPO_PUBLIC_SUPABASE_URL must be a valid URL"),
  anonKey: z.string().min(1, "EXPO_PUBLIC_SUPABASE_ANON_KEY must not be empty"),
});

interface Logger {
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

const defaultLogger: Logger = {
  warn: (msg, ctx) => console.warn(msg, ctx),
  error: (msg, ctx) => console.error(msg, ctx),
};

type CreateClientFn = typeof defaultCreateSupabaseClient;

export function getSupabaseClient(
  deps: {
    logger?: Logger;
    createClient?: CreateClientFn;
  } = {}
): SupabaseClient {
  const logger = deps.logger ?? defaultLogger;
  const createClient = deps.createClient ?? defaultCreateSupabaseClient;

  const parsed = envSchema.safeParse({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(
      `[supabase] Invalid environment config: ${issues}. Check your .env file or EXPO_PUBLIC_ variables.`
    );
  }

  try {
    const client = createClient({
      url: parsed.data.url,
      anonKey: parsed.data.anonKey,
    });

    if (!client) {
      throw new Error(
        "createSupabaseClient returned null despite valid config"
      );
    }

    return client;
  } catch (err) {
    logger.error("[supabase] Client creation failed", {
      url: parsed.data.url,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export const supabase: SupabaseClient = getSupabaseClient();
