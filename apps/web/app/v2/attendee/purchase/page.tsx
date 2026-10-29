import type { Metadata } from "next";
import { Suspense } from "react";
import { AttendeeShell } from "../AttendeeShell";
import StripePurchaseFlow from "../../../components/StripePurchaseFlow";

/**
 * Flame 2.0 payment screen (fase 3.3), served at /purchase by the middleware rewrite (same URL as
 * v1, so the event page, emails and Stripe return URLs keep working). Same logic as v1
 * (StripePurchaseFlow), Flame 2.0 view. ATTENDEE_V1=true → the v1 page.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout · Flame", robots: { index: false, follow: false } };

export default function PurchasePageV2() {
  return (
    <AttendeeShell active={null} hideTabBar>
      <Suspense fallback={null}>
        <StripePurchaseFlow v2 />
      </Suspense>
    </AttendeeShell>
  );
}
