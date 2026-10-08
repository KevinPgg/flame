/**
 * GET /api/mobile/app-config
 *
 * Public, unauthenticated, edge-cacheable. Returns the per-platform version
 * gating config from the `app_config` table (single row keyed by `mobile`).
 *
 * Consumed by `apps/mobile/lib/version-check.ts` on launch + on AppState active.
 * See `docs/guides/EAS_OTA_UPDATES.md` "Version Gating" for the operator runbook.
 *
 * Safety:
 *   1. Sanity guard: clamps `minimum_version` down to `latest_version` if a typo
 *      would otherwise lock out every user. Clamping is logged structured-style
 *      so we see it in Vercel logs.
 *   2. Fail-open: on any DB / config error returns `min = latest = "0.0.0"` so
 *      no client gets gated by a 5xx. The mobile client also fails open if the
 *      whole request errors out.
 *   3. No PII. No auth. Safe to cache at the edge.
 */

import { NextResponse } from "next/server";
import semver from "semver";
import { supabaseAdmin } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlatformConfig = {
  minimum_version: string;
  latest_version: string;
  store_url: string;
  force_update_title: string;
  force_update_message: string;
  minimum_os_version: string | null;
};

type AppConfigResponse = {
  ios: PlatformConfig;
  android: PlatformConfig;
};

const SAFE_DEFAULT_PLATFORM: PlatformConfig = {
  minimum_version: "0.0.0",
  latest_version: "0.0.0",
  store_url: "",
  force_update_title: "",
  force_update_message: "",
  minimum_os_version: null,
};

const SAFE_DEFAULT_RESPONSE: AppConfigResponse = {
  ios: SAFE_DEFAULT_PLATFORM,
  android: SAFE_DEFAULT_PLATFORM,
};

const CACHE_HEADER = "public, s-maxage=30, stale-while-revalidate=120";

/**
 * Coerces a possibly-malformed version string into a semver-comparable value.
 * Returns null if it cannot be parsed at all (caller decides the fallback).
 */
function safeSemver(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (semver.valid(raw)) return raw;
  const coerced = semver.coerce(raw);
  return coerced ? coerced.version : null;
}

/**
 * Returns the config exactly as supplied — but if `minimum_version` parses
 * higher than `latest_version`, clamps min down to latest and logs. This
 * prevents a fat-finger SQL update from remotely bricking the app.
 */
function clampPlatform(platform: string, raw: PlatformConfig): PlatformConfig {
  const min = safeSemver(raw.minimum_version);
  const latest = safeSemver(raw.latest_version);

  if (!min || !latest) {
    // One side unparseable — fail safe (no gate). Log for visibility.
    console.warn("[app-config] unparseable version, falling back to safe-default", {
      platform,
      raw_minimum: raw.minimum_version,
      raw_latest: raw.latest_version,
    });
    return { ...raw, minimum_version: "0.0.0", latest_version: "0.0.0" };
  }

  if (semver.gt(min, latest)) {
    console.warn("[app-config] minimum_version > latest_version, clamping", {
      platform,
      requestedMin: raw.minimum_version,
      clampedMin: raw.latest_version,
      latest: raw.latest_version,
    });
    return { ...raw, minimum_version: raw.latest_version };
  }

  return raw;
}

type RawPlatformConfig = Omit<PlatformConfig, "minimum_os_version"> &
  Partial<Pick<PlatformConfig, "minimum_os_version">>;

function isRawPlatformConfig(value: unknown): value is RawPlatformConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.minimum_version === "string" &&
    typeof v.latest_version === "string" &&
    typeof v.store_url === "string" &&
    typeof v.force_update_title === "string" &&
    typeof v.force_update_message === "string"
  );
}

function withDefaults(raw: RawPlatformConfig): PlatformConfig {
  return {
    minimum_version: raw.minimum_version,
    latest_version: raw.latest_version,
    store_url: raw.store_url,
    force_update_title: raw.force_update_title,
    force_update_message: raw.force_update_message,
    minimum_os_version:
      typeof raw.minimum_os_version === "string" ? raw.minimum_os_version : null,
  };
}

export async function GET() {
  if (!supabaseAdmin) {
    console.warn("[app-config] supabaseAdmin not configured — returning safe default");
    return NextResponse.json(SAFE_DEFAULT_RESPONSE, {
      headers: { "Cache-Control": CACHE_HEADER },
    });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("config")
      .eq("platform_key", "mobile")
      .maybeSingle();

    if (error || !data || !data.config) {
      console.warn("[app-config] DB read failed or row missing — returning safe default", {
        hasError: Boolean(error),
        errorCode: error?.code ?? null,
      });
      return NextResponse.json(SAFE_DEFAULT_RESPONSE, {
        headers: { "Cache-Control": CACHE_HEADER },
      });
    }

    const config = data.config as { ios?: unknown; android?: unknown };

    const ios = isRawPlatformConfig(config.ios)
      ? clampPlatform("ios", withDefaults(config.ios))
      : SAFE_DEFAULT_PLATFORM;
    const android = isRawPlatformConfig(config.android)
      ? clampPlatform("android", withDefaults(config.android))
      : SAFE_DEFAULT_PLATFORM;

    return NextResponse.json({ ios, android }, {
      headers: { "Cache-Control": CACHE_HEADER },
    });
  } catch (err) {
    console.error("[app-config] unexpected error — returning safe default", err);
    return NextResponse.json(SAFE_DEFAULT_RESPONSE, {
      headers: { "Cache-Control": CACHE_HEADER },
    });
  }
}
