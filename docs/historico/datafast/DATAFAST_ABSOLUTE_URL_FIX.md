# Datafast Absolute URL Fix - OPP_shopperResultUrl

> ⚠️ **LEGACY DOCUMENTATION**: This document describes a deprecated Datafast implementation that has been replaced by Stripe Connect. Retained for historical reference only.
> 
> **Current Implementation**: See `app/purchase/page.tsx` which now uses `StripePurchaseFlow` (Stripe-based payment processing).
> 
> **Migration Context**: See `docs/PAYMENT_SYSTEMS_EVOLUTION.md` for the full transition from Datafast to Stripe.

---

## Issue (Historical - Datafast Widget Implementation)

Datafast requested clarification on `OPP_shopperResultUrl` in our test script CSV. They were confused because:

1. We were using their widget (Phase 1) correctly ✅
2. But our form `action` attribute was using **relative URLs** instead of **absolute URLs** ❌

## Root Cause (Historical)

```typescript
// BEFORE (Relative URL) - DEPRECATED Datafast implementation
<form
  action={`/purchase?token=${token}`}  // ❌ Relative path
  className="paymentWidgets"
>
```

The Datafast widget required an **absolute URL** in the form action to properly redirect after payment processing.

## Solution Implemented (Historical - No Longer in Codebase)

**Note**: This solution was implemented for Datafast but has since been replaced by Stripe Connect.

The historical fix used `getBaseUrl()` for dynamic absolute URLs:

```typescript
// HISTORICAL SOLUTION (No longer in app/purchase/page.tsx)
import { getBaseUrl } from "../lib/utils/url";

function PurchasePageContent() {
  const baseUrl = getBaseUrl(); // e.g., "https://www.flme.co"

  <form
    action={
      mode === "rsvp"
        ? `${baseUrl}/purchase?token=${token}`
        : `${baseUrl}/purchase?session=${holdSessionId}`
    }
    className="paymentWidgets"
    data-brands="VISA MASTER AMEX DINERS DISCOVER"
  ></form>;
}
```

**Current Implementation**: `app/purchase/page.tsx` now uses `<StripePurchaseFlow />` component which handles payment processing through Stripe Connect, not Datafast widgets.

## Benefits

1. ✅ **Proper redirects**: Datafast widget can now redirect correctly after payment
2. ✅ **Environment-aware**: Uses `NEXT_PUBLIC_APP_URL` env variable (production/preview/local)
3. ✅ **Widget compliance**: Follows Phase 1 implementation guide correctly
4. ✅ **Datafast satisfaction**: Clear `OPP_shopperResultUrl` for their records

## For CSV Documentation

Add to `SCRIPT_FILLED_OUT.csv`:

```
OPP_shopperResultUrl: https://www.flme.co/purchase
```

## Technical Details

- **Implementation**: Hybrid approach (Server-to-Server checkout creation + Widget for card capture)
- **Phase**: Phase 1 (Widget) with Phase 2 security (server-side checkout)
- **Redirect URL**: Dynamically constructed using `getBaseUrl()` utility
- **Environment Variables**: Uses `NEXT_PUBLIC_APP_URL` with fallbacks

## Files Modified (Historical)

- `app/purchase/page.tsx` - **REPLACED**: Now uses `StripePurchaseFlow` component (Stripe-based)
- Historical implementation used `getBaseUrl()` for absolute URLs with Datafast widget

## Current State

**Datafast widget code has been removed** from `app/purchase/page.tsx`. The file now contains:

```typescript
// Current implementation (as of Jan 2026)
"use client";
import { Suspense } from "react";
import StripePurchaseFlow from "../components/StripePurchaseFlow";

export default function PurchasePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <StripePurchaseFlow />
    </Suspense>
  );
}
```

## Migration Notes

- Datafast widget implementation was active: October 2025
- Migrated to Stripe Connect: Late 2025 / Early 2026
- See `docs/PAYMENT_SYSTEMS_EVOLUTION.md` for migration details

---

**Date**: October 28, 2025  
**Status**: ⚠️ LEGACY - Replaced by Stripe Connect  
**Last Updated**: January 16, 2026
