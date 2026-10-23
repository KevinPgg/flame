/**
 * /v2/scanner[?event=<id>][&org=<slug>] — door scanner by account (fase 1b.6). Organizer "Scan" tab,
 * event "Scan tickets now" and Settings → Scan Tickets (signed in) open it. Signed out → the
 * access-code scanner (v1 public mode), the only way without an account.
 */
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { SCANNING_SUPPORTED } from "../../lib/scanner-platform";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";
import { ScannerApp, PUBLIC_SCANNER_HREF } from "../../components/v2/scanner/ScannerApp";
import { Spinner } from "../../components/v2/ui";

export default function ScannerV2Screen() {
  const router = useRouter();
  const { isSignedIn } = useOptionalAuth();
  const params = useLocalSearchParams<{ org?: string }>();
  const org = Array.isArray(params.org) ? params.org[0] : params.org;

  if (!SCANNING_SUPPORTED) return <Redirect href="/" />;
  if (isSignedIn === undefined) return <Spinner />;
  if (!isSignedIn) return <Redirect href={PUBLIC_SCANNER_HREF as Href} />;
  const exit = () =>
    router.canGoBack() ? router.back() : router.replace((org ? `/v2/organizer?org=${encodeURIComponent(org)}` : "/settings") as Href);
  return <ScannerApp onExit={exit} />;
}
