import { isOAuthCallbackPath } from "../lib/oauth-callback";

/**
 * Every deep link passes here before Expo Router routes it. The sign-in callback is not a
 * screen: while the app is open it is dropped (null → the router ignores it and the sign-in
 * flow carries on); if it ever opens the app cold, it lands on the home screen instead.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (isOAuthCallbackPath(path)) return initial ? "/" : null;
  return path;
}
