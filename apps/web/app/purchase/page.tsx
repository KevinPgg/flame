"use client";

import { Suspense } from "react";
import StripePurchaseFlow from "../components/StripePurchaseFlow";
import LoadingSpinner from "../components/LoadingSpinner";

export default function PurchasePage() {
  return (
    <Suspense fallback={<LoadingSpinner title="Loading..." fullHeight={true} />}>
      <StripePurchaseFlow />
    </Suspense>
  );
}
