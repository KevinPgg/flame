import type { Metadata } from "next";
import { Suspense } from "react";
import { AttendeeShell } from "../../AttendeeShell";
import { PurchaseSuccessV2 } from "./PurchaseSuccessV2";

/** Flame 2.0 "You're in" (fase 3.3, B5), served at /purchase/success by the middleware rewrite. */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "You’re in · Flame", robots: { index: false, follow: false } };

export default function PurchaseSuccessPageV2() {
  return (
    <AttendeeShell active={null} hideTabBar>
      <Suspense fallback={null}>
        <PurchaseSuccessV2 />
      </Suspense>
    </AttendeeShell>
  );
}
