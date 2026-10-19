# Multi-Currency Support — Implementation Plan

**Date:** March 4, 2026
**Approach:** Industry-standard per-event currency (organizer selects currency when creating an event; all tiers/stages inherit it). No user-facing currency switcher.
**Stripe:** Handles FX conversion and settlement automatically. Our job is to propagate the correct currency through our stack.

---

## Current State

| Layer | Current Behavior |
|---|---|
| **Database** | `ticket_tiers.currency`, `ticket_stages.currency`, `orders.currency` columns exist (default `'USD'`), but are **never set by the API** — always fall back to default. No `currency` column on `events`. |
| **API routes** | 5 files hardcode `"usd"` / `"USD"` when calling Stripe or inserting orders. |
| **`packages/lib`** | `formatCentsAsPrice`, `formatCurrency`, `formatCentsAsCurrency`, `formatPrice` — all hardcoded to USD, no currency parameter. |
| **Web components** | ~10 files use `Intl.NumberFormat("en-US", { currency: "USD" })` or `formatCentsAsPrice` with no currency arg. |
| **Mobile components** | ~7 files use `formatCentsAsPrice` with no currency arg. |
| **Event creation** | No currency field in schema, form, or insert logic. Form labels say `"(USD)"`. |

**Update (Mar 11, 2026):** `markup_fixed_cents` is now set currency-appropriately at event creation time via `getDefaultFixedFeeCents(currency)` from `@project-flame/lib`. The `getEventMarkup` fallback in `apps/web/app/lib/stripe/fees.ts` is also currency-aware. Per-currency defaults are defined in `DEFAULT_FIXED_FEE_BY_CURRENCY` (USD: 99, EUR: 99, GBP: 75, MXN: 1800, DOP: 6000, COP: 420000) — each value is the ~$0.99 USD equivalent in that currency's minor units. The DB column `markup_fixed_cents` stores values in the event's local currency minor units (not always USD cents). See MARCH_2026_FIXES.md #440.

---

## Implementation Steps

### Step 1: Database Migration

**File:** `supabase/migrations/<timestamp>_add_event_currency.sql`

```sql
ALTER TABLE events
  ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'USD';

COMMENT ON COLUMN events.currency IS 'ISO 4217 currency code. All tiers/stages within this event use this currency.';
```

**Post-migration:** Apply via Supabase MCP (`apply_migration`), then rename local file to match remote timestamp per the migration workflow in `project-flame-master.mdc` Section 3.

No new tier/stage columns needed — they already have `currency` columns. The API just needs to populate them from the event's currency on insert.

---

### Step 2: Shared Lib — Currency-Aware Formatting (`packages/lib`)

**Files to change:**
- `packages/lib/src/utils/format.ts`
- `packages/lib/src/pricing/calculations.ts` (if `formatPrice` lives here)

**Changes:**

1. **Add zero-decimal currency set:**

```typescript
export const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA',
  'PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF',
]);
```

2. **Add helper to convert smallest-unit to display amount:**

```typescript
export function centsToAmount(cents: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())
    ? cents
    : cents / 100;
}
```

3. **Make formatting functions currency-aware (backward-compatible):**

```typescript
export function formatCentsAsPrice(cents: number, currency = 'USD'): string {
  const amount = centsToAmount(cents, currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function formatCentsAsCurrency(cents: number, currency = 'USD'): string {
  return formatCurrency(centsToAmount(cents, currency), currency);
}
```

4. **Add Stripe minimum-amount map and validator:**

```typescript
export const STRIPE_MINIMUM_CENTS: Record<string, number> = {
  USD: 50, EUR: 50, GBP: 30, CAD: 50, AUD: 50,
  MXN: 1000, JPY: 50, KRW: 50, DOP: 50, COP: 50,
  // extend as needed
};

export function validateMinimumAmount(cents: number, currency: string): boolean {
  const min = STRIPE_MINIMUM_CENTS[currency.toUpperCase()] ?? 50;
  return cents >= min;
}
```

5. **Add supported-currencies constant (curated list):**

```typescript
export const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'DOP', name: 'Dominican Peso', symbol: 'RD$' },
  { code: 'COP', name: 'Colombian Peso', symbol: '$' },
  // add more as your market requires
] as const;
```

**Tests:** Add tests in `packages/lib` for each formatting function with USD, EUR, JPY (zero-decimal), and DOP. Test `validateMinimumAmount` and `centsToAmount`.

---

### Step 3: API Routes — Read Event Currency, Pass to Stripe

Every API route that touches Stripe or inserts monetary records needs to read the event's currency instead of hardcoding `"usd"`.

| # | File | What to change |
|---|---|---|
| 1 | `apps/web/app/api/purchase/create-payment-intent/route.ts` | Fetch `event.currency` from DB. Pass `currency: event.currency.toLowerCase()` to `stripe.paymentIntents.create()`. Include `currency` in the response `amounts` object. Validate minimum amount per-currency before creating the intent. |
| 2 | `apps/web/app/api/purchase/complete/route.ts` | Use `event.currency` in `orders` insert and `price_data.currency` for Checkout Session. |
| 3 | `apps/web/app/api/organizer/rsvps/[id]/approve/route.ts` | Use event currency in `stripe.transfers.create()`. |
| 4 | `apps/web/app/api/organizer/payouts/create/route.ts` | Payout currency comes from the connected account's balance, not the event. Verify current logic is correct (Stripe auto-converts). |
| 5 | ✅ `apps/web/app/api/events/route.ts` | ~~Accept `currency` in `createEventSchema` (default `'USD'`). Insert into `events.currency`. Propagate to `ticket_tiers.currency` and `ticket_stages.currency` on insert.~~ **Done (Mar 16, 2026 — #488):** `tierInserts` now sets `currency` from event; price-warning formatter updated. |

---

### Step 4: Event Creation Forms — Add Currency Selector

**Web files:**

| File | Change |
|---|---|
| `apps/web/app/components/forms/CreateEventForm.tsx` | Add currency `<select>` using `SUPPORTED_CURRENCIES` from `@project-flame/lib`. Include `currency` in form state and submit payload. Update labels from `"(USD)"` to dynamic `"({selectedCurrency})"`. |
| `apps/web/app/components/organizer/TierInlineForm.tsx` | Update `"(USD)"` label to use event's currency. |
| `apps/web/app/components/modals/EditTicketTierModal.tsx` | Update `"(USD)"` label to use event's currency. |

**Mobile files:**

| File | Change |
|---|---|
| Create-event screen (if exists) | Add currency picker using `SUPPORTED_CURRENCIES`. Include in submit payload. |

---

### Step 5: Display Components — Pass Currency Through

All these files currently call `formatCentsAsPrice(amount)` or `Intl.NumberFormat` with hardcoded `"USD"`. They need to pass the event's currency.

**Web components (~10 files):**

| File | Data source for currency |
|---|---|
| `components/EventCard.tsx` | Event data (add `currency` to query) |
| `components/EventsCatalog.tsx` | Event data |
| ✅ `components/RsvpManagement.tsx` | **Done (#491):** `currency?` added to event prop; `formatPrice` uses `event.currency ?? "USD"`. |
| ✅ `components/OrganizerDashboard.tsx` | **Done (#492):** `formatPrice(cents, currency = "USD")`; all 12 call sites in `EventsTiersView` pass `event.currency`. |
| ✅ `components/AdminDashboard.tsx` | **Done (#493):** `formatCurrency(amount, currency = "USD")`. Aggregate stats default to USD. |
| `components/modals/RsvpPaymentModal.tsx` | Already uses `amounts?.currency` — verify fallback |
| `components/StripePurchaseFlow.tsx` | Already uses `amounts?.currency` — verify fallback |
| `components/StripePaymentForm.tsx` | Already receives `currency` prop — no change |
| ✅ `lib/email/rsvp-notifications.ts` | **Done (#490):** `currency?` added to `RsvpEmailData`; `formatPrice` uses `data.currency ?? "USD"`. |
| `lib/seo-config.ts` | Event data for `priceCurrency` in structured data |

**Mobile components (~7 files):**

| File | Data source for currency |
|---|---|
| `components/event-details/CheckoutMainSheet.tsx` | `amounts.currency` from payment-intent response (already in schema) |
| `components/event-details/TicketTierCard.tsx` | Event/tier data |
| `components/org-dashboard/RsvpRequestCard.tsx` | Event data |
| `components/org-dashboard/OrgEventCard.tsx` | Event data |
| `components/org-dashboard/OrgStatsSection.tsx` | Event data |
| `lib/user-ticket-mappers.ts` | Ticket/order data |
| `components/notifications/NotificationCard.tsx` | Icon only (`currency-usd`) — consider dynamic icon or leave as-is |

**Pattern:** Since `formatCentsAsPrice` defaults to `'USD'`, existing calls won't break. New code should always pass the currency explicitly. Migrate existing calls as you touch each file.

---

### Step 6: Data Flow — Ensure Currency Propagates

Verify that every Supabase query that returns monetary data also returns the currency:

1. **Events queries** — add `currency` to `.select()` wherever events are fetched.
2. **Ticket/order queries** — join to event or read from `orders.currency` / `ticket_tiers.currency`.
3. **Mobile hooks** — `useAppEvents`, `useEventDetails`, `useCheckout`, `useOrgDashboard` all need `currency` in their returned data shape.
4. **Mobile Zod schemas** — `useEventDetails.ts` already has `currency` in `TicketStageSchema`. Verify `EventSchema` / event types include it.

---

## Edge Cases to Handle

| Case | Handling |
|---|---|
| **Zero-decimal currencies (JPY, KRW)** | `centsToAmount()` helper. Never divide by 100 for these. |
| **Stripe minimum amounts** | `validateMinimumAmount()` before `paymentIntents.create()`. Return clear error to user. |
| **Free events / 100% promo** | Currency still matters for display. Store it even if amount is 0. |
| **Existing events (no currency set)** | Migration defaults to `'USD'`. All existing data is correct. |
| **Organizer payout currency mismatch** | Stripe handles FX. No code needed. Document that organizer sees payout in their bank's currency. |
| **Mixed-currency reporting** | If an organizer has events in multiple currencies, dashboard stats can't simply sum them. Defer to `EDGE_CASES_TODOS.md` unless building now. |
| **Fixed fee per currency** | `markup_fixed_cents` stores the fixed platform fee in the event's local minor units. `DEFAULT_FIXED_FEE_BY_CURRENCY` provides ~$0.99 USD-equivalent defaults per currency. The DB column default (99) is USD-centric; new events get the correct value at insert time. Column name is USD-centric but value semantics are local-currency. |

---

## Suggested Order of Execution

1. **Migration** — Add `events.currency` column (Step 1)
2. **Shared lib** — Currency-aware formatting + constants + tests (Step 2)
3. **Event creation API** — Accept and store currency (Step 3, item 5)
4. **Event creation forms** — Currency selector UI (Step 4)
5. **Payment API routes** — Read event currency, pass to Stripe (Step 3, items 1-4)
6. **Display updates** — Web then mobile components (Step 5)
7. **Data flow verification** — Queries return currency (Step 6)

Steps 1-2 are safe to do first with no breaking changes (all defaults remain USD). Steps 3-7 can be done incrementally — each file change is isolated.

---

## Files Inventory (Complete)

### Must Change

| # | File | Type |
|---|---|---|
| 1 | `supabase/migrations/` (new) | Migration |
| 2 | `packages/lib/src/utils/format.ts` | Shared lib |
| 3 | `packages/lib/src/pricing/calculations.ts` | Shared lib |
| 4 | `packages/lib/src/index.ts` | Exports |
| 5 | `apps/web/app/api/events/route.ts` | API |
| 6 | `apps/web/app/api/purchase/create-payment-intent/route.ts` | API |
| 7 | `apps/web/app/api/purchase/complete/route.ts` | API |
| 8 | `apps/web/app/api/organizer/rsvps/[id]/approve/route.ts` | API |
| 9 | `apps/web/app/api/organizer/payouts/create/route.ts` | API (verify) |
| 10 | `apps/web/app/components/forms/CreateEventForm.tsx` | Web UI |
| 11 | `apps/web/app/components/organizer/TierInlineForm.tsx` | Web UI |
| 12 | `apps/web/app/components/modals/EditTicketTierModal.tsx` | Web UI |
| 13 | `apps/web/app/components/EventCard.tsx` | Web display |
| 14 | `apps/web/app/components/EventsCatalog.tsx` | Web display |
| 15 | `apps/web/app/components/RsvpManagement.tsx` | Web display |
| 16 | `apps/web/app/components/OrganizerDashboard.tsx` | Web display |
| 17 | `apps/web/app/components/AdminDashboard.tsx` | Web display |
| 18 | `apps/web/app/components/modals/RsvpPaymentModal.tsx` | Web display |
| 19 | `apps/web/app/components/StripePurchaseFlow.tsx` | Web display |
| 20 | `apps/web/app/lib/email/rsvp-notifications.ts` | Email |
| 21 | `apps/web/app/lib/seo-config.ts` | SEO |
| 22 | `apps/mobile/components/event-details/CheckoutMainSheet.tsx` | Mobile display |
| 23 | `apps/mobile/components/event-details/TicketTierCard.tsx` | Mobile display |
| 24 | `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx` | Mobile display |
| 25 | `apps/mobile/components/org-dashboard/OrgEventCard.tsx` | Mobile display |
| 26 | `apps/mobile/components/org-dashboard/OrgStatsSection.tsx` | Mobile display |
| 27 | `apps/mobile/lib/user-ticket-mappers.ts` | Mobile display |
| 28 | `apps/mobile/hooks/useAppEvents.ts` | Mobile hook |
| 29 | `apps/mobile/hooks/useEventDetails.ts` | Mobile hook |
| 30 | `apps/mobile/hooks/useCheckout.ts` | Mobile hook |

### Must Add Tests

| File | Tests for |
|---|---|
| `packages/lib/__tests__/format.test.ts` (or similar) | `formatCentsAsPrice` with USD, EUR, JPY; `centsToAmount`; `validateMinimumAmount` |

---

## Effort Estimate

| Phase | Effort |
|---|---|
| Migration + shared lib + tests | ~0.5 day |
| API routes (5 files) | ~0.5 day |
| Event creation forms (web + mobile) | ~0.5 day |
| Display components (web ~10, mobile ~7) | ~0.5–1 day |
| Data flow verification + QA | ~0.5 day |
| **Total** | **~2.5–3 days** |

---

## Progress Log

### Mar 16, 2026 — Gaps closed (#488–#494)

The following gaps identified post-launch were fixed:

| # | File | Fix |
|---|---|---|
| #488 | `apps/web/app/api/events/route.ts` | `tierInserts` now sets `currency` from event; fixes RSVP payment in wrong currency for non-USD events. |
| #489 | `apps/web/app/lib/email/ticket-notifications.ts` | `TicketEmailData.currency?` added; both PDF and HTML `formatPrice` use `data.currency ?? "USD"`. |
| #489 | `apps/web/app/lib/orders.ts` | Event SELECT now fetches `currency`; passed to `sendTicketConfirmationEmail`. |
| #489 | `apps/web/app/api/organizer/rsvps/[id]/approve/route.ts` | Both `sendTicketConfirmationEmail` calls pass `rsvp.events.currency`. |
| #489 | `apps/web/app/lib/purchase-tokens.ts` | `currency` added to `RsvpWithDetails.events` interface and SELECT query. |
| #489 | `apps/web/app/api/purchase/complete-direct-free/route.ts` | Passes `rsvpDetails.events.currency` to email. |
| #490 | `apps/web/app/lib/email/rsvp-notifications.ts` | `RsvpEmailData.currency?` added; `formatPrice` uses `data.currency ?? "USD"`. |
| #491 | `apps/web/app/components/RsvpManagement.tsx` | `event.currency?` prop; `formatPrice` uses it. |
| #492 | `apps/web/app/components/OrganizerDashboard.tsx` | `formatPrice(cents, currency = "USD")`. |
| #492 | `apps/web/app/components/organizer/EventsTiersView.tsx` | Prop type updated; all 12 call sites pass `event.currency`. |
| #493 | `apps/web/app/components/AdminDashboard.tsx` | `formatCurrency(amount, currency = "USD")`. |
| #494 | `apps/web/app/api/dev/email-preview/route.ts` | `formatPrice(cents, currency = "USD")`. |

**Remaining open items (backfill migration pending — created locally, apply when ready):**

- `supabase/migrations/20260316000000_backfill_ticket_tier_currency.sql` — sets `ticket_tiers.currency = events.currency` for tiers created before #488 where they differ.

---

## Documentation Updates Required

After implementation, update these docs:

- `docs/historico/fixes/MARCH_2026_FIXES.md` — log each change with numbered entries
- `docs/historico/features/PRICING_INTEGRATION_GUIDE.md` — add multi-currency section
- `docs/historico/project-migrations/IOS_MIGRATION.md` — note currency in mobile data flow
- `.cursor/rules/project-flame-master.mdc` — add currency to DB standards if needed
- Edge cases deferred to `docs/historico/todos/EDGE_CASES_TODOS.md` (mixed-currency reporting, etc.)
