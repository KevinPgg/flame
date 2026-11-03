/** /v2/account-security — password, e-mails and devices with the Clerk SDK (2026-11-02, no browser). */
import { Redirect, type Href } from "expo-router";
import { AccountSecurity } from "../../components/v2/settings/AccountSecurity";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";

export default function AccountSecurityRoute() {
  const { isSignedIn } = useOptionalAuth();
  if (isSignedIn === false) return <Redirect href={"/sign-in" as Href} />;
  return <AccountSecurity />;
}
