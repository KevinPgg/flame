/**
 * Google / Apple sign-in returns to the app through `<scheme>://callback?created_session_id=…`
 * (project-flame:// or com.projectflame.app://). Clerk's `useSSO` already reads that URL from the
 * auth browser session; Android also hands it to Expo Router, which has no "callback" screen and
 * showed "Unmatched Route" over a sign-in that had worked (reported 2026-10-27; same in
 * production). `app/+native-intent.tsx` uses this to keep it away from the router.
 */
const OAUTH_CALLBACK = /^(?:[a-z][a-z0-9+.-]*:\/\/)?\/*callback(?:[/?#]|$)/i;

export function isOAuthCallbackPath(path: string | null | undefined): boolean {
  return typeof path === "string" && OAUTH_CALLBACK.test(path.trim());
}
