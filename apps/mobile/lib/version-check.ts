/**
 * Version-check primitives for the mobile app's version gate.
 *
 * Two responsibilities:
 *   1. Read the current native version (from Info.plist via expo-application),
 *      with a __DEV__-only override so we can simulate older clients in Metro
 *      builds without rebuilding the binary.
 *   2. Fetch the remote app-config (web /api/mobile/app-config), cache it in
 *      SecureStore with a TTL, and fail open on any error.
 *
 * Why SecureStore instead of AsyncStorage:
 *   AsyncStorage isn't installed in this repo; SecureStore already is (Clerk
 *   token cache). For our non-sensitive ~500-byte cache it works equally well
 *   and avoids adding a new singleton dep that has to be mapped in Metro.
 *
 * The plan calls out the offline-lockout fix explicitly: if the on-device
 * cache is stale (older than CACHE_TTL_MS) AND the network fetch fails, we
 * return SAFE_DEFAULT (which never gates) rather than the stale value. This
 * prevents a rolled-back misconfig from indefinitely blocking offline users.
 * See `docs/guides/EAS_OTA_UPDATES.md` "Version Gating" for the operator
 * runbook.
 */

import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import semver from "semver";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlatformConfig = {
  minimum_version: string;
  latest_version: string;
  store_url: string;
  force_update_title: string;
  force_update_message: string;
  minimum_os_version: string | null;
};

export type AppConfigResponse = {
  ios: PlatformConfig;
  android: PlatformConfig;
};

export type GateStatus = "ok" | "soft" | "hard";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const FETCH_TIMEOUT_MS = 5_000;
const CACHE_KEY = "app_config_cache_v1";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — bounds the offline-lockout window

const SAFE_DEFAULT_PLATFORM: PlatformConfig = {
  minimum_version: "0.0.0",
  latest_version: "0.0.0",
  store_url: "",
  force_update_title: "",
  force_update_message: "",
  minimum_os_version: null,
};

const SAFE_DEFAULT_CONFIG: AppConfigResponse = {
  ios: SAFE_DEFAULT_PLATFORM,
  android: SAFE_DEFAULT_PLATFORM,
};

// __DEV__-only override so we can simulate older clients without rebuilding
// the binary. Production bundles strip this branch (process.env.EXPO_PUBLIC_*
// is dead-coded behind __DEV__). See docs/guides/EAS_OTA_UPDATES.md.
const DEV_VERSION_OVERRIDE = __DEV__
  ? process.env.EXPO_PUBLIC_DEV_VERSION_OVERRIDE
  : undefined;

// ---------------------------------------------------------------------------
// Semver helpers
// ---------------------------------------------------------------------------

/**
 * Returns a canonical semver string. If `raw` is already a valid semver we
 * return it unchanged. If it parses only via coercion (e.g. "1.0" → "1.0.0")
 * we log a warning so silent rounding stays visible — we control app.json
 * version values so coercion firing in production indicates a typo.
 */
export function safeSemver(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (semver.valid(raw)) return raw;
  const coerced = semver.coerce(raw);
  if (!coerced) return null;
  if (__DEV__) {
    console.warn("[version-check] coerced malformed version", {
      raw,
      coerced: coerced.version,
    });
  }
  return coerced.version;
}

/**
 * Returns -1 / 0 / 1 like Array.prototype.sort. Falls back to safeSemver for
 * malformed input; if either side is unparseable we treat them as equal so we
 * NEVER gate the app on garbage input.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = safeSemver(a);
  const right = safeSemver(b);
  if (!left || !right) return 0;
  return semver.compare(left, right) as -1 | 0 | 1;
}

// ---------------------------------------------------------------------------
// Native version
// ---------------------------------------------------------------------------

/**
 * The native binary version (Info.plist CFBundleShortVersionString on iOS,
 * versionName on Android). Crucially, this value does NOT change with OTA
 * updates — it's read directly from the native shell. That's the whole point
 * of the version gate: distinguish App Store binary version from JS bundle
 * version.
 *
 * In dev, EXPO_PUBLIC_DEV_VERSION_OVERRIDE lets us pretend to be on an older
 * version without rebuilding (see test matrix in EAS_OTA_UPDATES.md).
 */
export function getCurrentNativeVersion(): string {
  if (DEV_VERSION_OVERRIDE) return DEV_VERSION_OVERRIDE;
  return Application.nativeApplicationVersion || "0.0.0";
}

// ---------------------------------------------------------------------------
// Cache (SecureStore-backed)
// ---------------------------------------------------------------------------

type CachedEntry = {
  fetchedAt: number;
  config: AppConfigResponse;
};

async function readCache(): Promise<CachedEntry | null> {
  if (Platform.OS === "web") return null;
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (
      typeof parsed?.fetchedAt !== "number" ||
      typeof parsed?.config !== "object" ||
      !parsed.config
    ) {
      return null;
    }
    return parsed;
  } catch (err) {
    if (__DEV__) console.warn("[version-check] readCache failed", err);
    return null;
  }
}

async function writeCache(config: AppConfigResponse): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const entry: CachedEntry = { fetchedAt: Date.now(), config };
    await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(entry));
  } catch (err) {
    if (__DEV__) console.warn("[version-check] writeCache failed", err);
  }
}

/**
 * Test-only helper exported for the local smoke-test matrix (used to simulate
 * "TTL expired" without waiting an hour). Stripped at compile time in
 * production via the __DEV__ guard at call sites.
 */
export async function _clearVersionCheckCache(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(CACHE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

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

function normalizeResponse(raw: unknown): AppConfigResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (!isRawPlatformConfig(v.ios) || !isRawPlatformConfig(v.android)) return null;
  return {
    ios: withDefaults(v.ios),
    android: withDefaults(v.android),
  };
}

/**
 * Fetch /api/mobile/app-config with a 5s timeout. Resolution policy:
 *   1. Network fetch succeeds → return + cache.
 *   2. Network fetch fails AND cache is fresh (within TTL) → return cached.
 *   3. Network fetch fails AND cache is stale OR missing → SAFE_DEFAULT
 *      (which never gates). Prevents indefinite offline lockout after a
 *      misconfig has already been rolled back upstream.
 */
export async function fetchAppConfig(): Promise<AppConfigResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/api/mobile/app-config`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json();
    const normalized = normalizeResponse(json);
    if (!normalized) {
      throw new Error("malformed app-config response");
    }

    await writeCache(normalized);
    return normalized;
  } catch (err) {
    clearTimeout(timeout);
    if (__DEV__) {
      console.warn("[version-check] fetch failed, checking cache", err);
    }

    const cached = await readCache();
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.config;
    }

    // Stale or no cache → never gate. This is the offline-lockout fix.
    if (__DEV__ && cached) {
      console.warn(
        "[version-check] cache stale (>1h), returning safe-default to prevent lockout",
      );
    }
    return SAFE_DEFAULT_CONFIG;
  }
}

// ---------------------------------------------------------------------------
// Gate resolution
// ---------------------------------------------------------------------------

/**
 * Map (currentVersion, platformConfig) → gate status.
 *
 * - `hard`: current < minimum → show ForceUpdateScreen (non-dismissible).
 * - `soft`: minimum <= current < latest → show UpdateAvailableBanner.
 * - `ok`: current >= latest → render the app normally.
 */
export function resolveGateStatus({
  currentVersion,
  platformConfig,
}: {
  currentVersion: string;
  platformConfig: PlatformConfig;
}): GateStatus {
  if (compareVersions(currentVersion, platformConfig.minimum_version) < 0) {
    return "hard";
  }
  if (compareVersions(currentVersion, platformConfig.latest_version) < 0) {
    return "soft";
  }
  return "ok";
}

/**
 * Pick the right per-platform config for the current OS. Defaults to iOS
 * because that's what we ship today; android key is preserved so it Just
 * Works when Android lands.
 */
export function getPlatformConfig(config: AppConfigResponse): PlatformConfig {
  if (Platform.OS === "android") return config.android;
  return config.ios;
}
