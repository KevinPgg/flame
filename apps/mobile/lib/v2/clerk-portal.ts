/**
 * Clerk's hosted Account Portal ("manage account": password, e-mails, security) for the app's
 * Settings (decision 2026-10-23: one of the three settings places). The app has no Clerk profile
 * screen, so it opens the portal in the browser. URL derived from the publishable key, which
 * encodes the Frontend API host (Clerk convention):
 *   clerk.flme.co             → https://accounts.flme.co/user        (production, custom domain)
 *   foo-bar-12.clerk.accounts.dev → https://foo-bar-12.accounts.dev/user (development)
 * `EXPO_PUBLIC_CLERK_ACCOUNT_URL` overrides it. null when it can't be worked out.
 */
function decodeBase64(s: string): string | null {
  try {
    if (typeof atob === "function") return atob(s);
  } catch {
    /* fall through */
  }
  try {
    return (globalThis as { Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } } }).Buffer?.from(s, "base64").toString("utf8") ?? null;
  } catch {
    return null;
  }
}

export function clerkAccountPortalUrl(publishableKey: string | undefined | null, override?: string | null): string | null {
  if (override?.trim()) return override.trim();
  const m = /^pk_(?:test|live)_(.+)$/.exec(publishableKey ?? "");
  if (!m) return null;
  const host = decodeBase64(m[1]!)?.replace(/\$$/, "").trim();
  if (!host) return null;
  if (host.endsWith(".clerk.accounts.dev")) return `https://${host.replace(/\.clerk\.accounts\.dev$/, ".accounts.dev")}/user`;
  if (host.startsWith("clerk.")) return `https://accounts.${host.slice("clerk.".length)}/user`;
  return null;
}
