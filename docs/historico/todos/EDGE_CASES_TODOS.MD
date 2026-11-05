# Edge Cases & Optimization TODOs

These items were surfaced in PR reviews but are deferred as non-critical edge cases or
optimizations. Each item references the file, the issue, and a suggested fix.

---

## Mobile — XLSX exports

### Pre-export refetch: handle "transient network failure" surface (Apr 29, 2026)

**Files:**
- `apps/mobile/app/rsvp-detail.tsx` — `handleExportPending`, `await refetch()` then `refetched.data ?? data`.
- `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx` — `onRefetchBeforeExport` callback returns `null` on miss; export proceeds with cached props.

**Context:** APRIL_2026_FIXES.md #144 added a pre-export refetch on both mobile export paths so the sheet always reflects the latest server state. Currently if the device is offline at export time, the refetch silently uses the most recent successful cache — which is correct behaviour 99% of the time, but means an organizer on flaky LTE could export sub-fresh data without any indication.

**Why deferred:** Surfacing a network error mid-export is worse UX than serving the cached fallback in almost every case. Worth revisiting only if support tickets surface around "exported wrong values" — at which point the right fix is probably a small "exported as of HH:MM, may be slightly out of date" badge in the file or a soft toast, not a hard failure.

**Reference (rejected approach):** `refetch({ throwOnError: true })`. This would make the export fail on every transient error even when cached data is fine. Don't do it.

---

## Database / SQL

### 1. `db-mock-events/seed_mock_events.sql` — Extract Cleanup to Stored Procedure

Cleanup logic is duplicated between `seed_mock_events.sql` and `delete_mock_events.sql`.
Extract to a reusable stored procedure to eliminate dual-maintenance risk.

### 2. `supabase/migrations/20260211212924_fix_rls_recursion.sql` — JOIN Optimization

The nested `IN` subquery in `get_user_organizations()` could be replaced with a direct
`JOIN` for clarity, though performance impact is negligible at current scale.

---

## Dependency Management

### 3. `apps/mobile/package.json` — Consistent Version Pinning

Mix of exact pins (`"react": "19.1.0"`), tilde (`"expo": "~54.0.33"`), and caret
(`"@clerk/clerk-expo": "^2.19.22"`). Consider using exact or tilde across all deps
for deterministic builds.

### 4. `apps/mobile/metro.config.js` — Move Symlink Cleanup to postinstall Hook

Symlink deletion runs at Metro startup, meaning symlinks reappear after each
`pnpm install`. A `postinstall` script in `package.json` would ensure cleanup runs
automatically after dependency changes.

---

## Type Safety / Validation

### 5. `packages/lib/src/utils/availability.ts` — Discriminated Union Return Type

`findFirstAvailableStage` could use a discriminated union so `stageName` is guaranteed
when `stageId` is defined, improving type narrowing at call sites.

### 6. ~~`apps/mobile/hooks/useAppEvents.ts` — Zod Validation for Supabase Response~~ ✅ Fixed (FEB_2026_FIXES.md #117/124)

`z.array(EventSchema).safeParse(data)` added in Fix #117; strict null handling fixed in Fix #124.

### 7. `apps/mobile/lib/api.ts` (line 65) — Zod Validation for API Response

`return data as T` bypasses runtime validation. Consider accepting an optional Zod schema
parameter or documenting that callers are responsible for validation.

### 8. `apps/mobile/hooks/useSignInHandlers.ts` (lines 78-80, 112-114) — Zod Schema for Credentials

Current checks only guard for empty strings. A small Zod schema would centralize
email/password rules and keep sign-in/sign-up validation consistent.

---

## Mobile UX / Performance

### 9. `apps/mobile/components/sign-in/SignInBackButton.tsx` — Safe Area Insets

Fixed `top-16` positioning may not account for varying safe area insets across iOS devices.
Consider using `useSafeAreaInsets()` for the absolute top offset.

### 10. `apps/mobile/components/events/EventsList.tsx` — FlatList Virtualization

Using `.map()` renders all items at once. For growing event lists, `FlatList` provides
virtualization and better scroll performance.

### 10a. ScrollToTopContext: ref not re-registered when navigating back from Discover (Mar 5, 2026)

- **Issue:** Both `HomeScreen` (index.tsx) and `LegacyHomeContent` (Discover screen) register scroll refs via `ScrollToTopContext`. When the user navigates to `/discover`, `LegacyHomeContent`'s ScrollView overwrites the Home screen's ref. On navigating back, React calls `registerScrollRef(null)` during unmount of the Discover screen's ScrollView, but the Home screen's ref is never re-registered (it's still mounted). This leaves `scrollRef.current` as `null`, breaking tap-on-Home-tab scroll-to-top.
- **Files:** `apps/mobile/components/home/LegacyHomeContent.tsx` (lines 31–38), `apps/mobile/app/(tabs)/index.tsx` (lines 136–143).
- **Reproduction:** Navigate to Home tab → scroll down → tap "Featured events, organizer and more" (goes to Discover) → navigate back to Home tab → tap Home tab again — scroll-to-top does nothing.

### 10b. GlowBlob: non-square dimensions render smaller glow than View-based implementation (Mar 5, 2026)

- **Issue:** The radius `r` is computed as `Math.min(width, height) / 2`, which creates a circle inscribed within the canvas. For non-square dimensions, this leaves portions of the canvas empty. Active callers like `app/event/[id].tsx` pass non-square sizes (e.g. 600×700, 500×600) — these render a noticeably smaller glow area compared to the old `View`-based implementation, which filled the entire rounded rectangle. The old behavior was closer to an ellipse/pill shape covering the full `width × height`.
- **Files:** `packages/ui/src/components/GlowBlob.tsx` (lines 47–48, 60–61).
- **Fix:** Use an ellipse (`r.x`, `r.y`) or adjust radius to cover the full bounds for non-square canvases.

### ~~11. `apps/mobile/lib/api.ts` (lines 44-51) — Request Timeout~~ ✅ Fixed

`AbortController` with `DEFAULT_TIMEOUT_MS = 15_000` (15s) and `UPLOAD_TIMEOUT_MS = 30_000` (30s) implemented in `api.ts`. `AbortError` caught and surfaced as `ApiError(0, "Request timed out…")`.

### 12. `apps/mobile/app/_layout.tsx` — Enhanced Font Error Handling

Font loading error is logged but the app continues silently. Consider adding more
informative error context for debugging.

---

## Code Organization / Refactoring

### 13. ~~`apps/mobile/hooks/useAppEvents.ts` — Extract Date Helpers to `@project-flame/lib`~~ ✅ Fixed (FEB_2026_FIXES.md #112)

`formatDay` and `formatMonth` extracted in Fix #112; `isEventActive`/`filterActiveEvents`/`filterPastEvents`/`separateEventsByDate` extracted in Fix #186.

### 14. `apps/mobile/components/event-details/CheckoutMainSheet.tsx` — Extract Subcomponents

File exceeds 100-line guideline. Split into header, promo section, totals, and CTA
subcomponents.

### 15. `apps/mobile/hooks/useCheckout.ts` (lines 256-490) — Split Checkout Flow

`checkout()` manages RSVP, free, paid, and promo-free branches. Extract each into a
focused helper for testability and readability.

### 16. `apps/mobile/app/event/[id].tsx` — Extract Subcomponents

Screen is ~250+ lines. Extract loading/error/not-found states and checkout UI into
smaller components.

### 17. `apps/mobile/app/event/[id].tsx` (lines 129-154) — Contextual Error Logging

Add `eventId`/`userId`/`action` to error logs when event load fails, for debugging
and monitoring.

---

## Design System / Shared Components

### 18. `apps/mobile/components/events/CategoryFilterPills.tsx` — Move to packages/ui

If the pill filter UI is reusable across platforms, place it in `packages/ui` to
centralize the design system.

### 19. `apps/mobile/components/home/Footer.tsx` — Move to packages/ui

Footer looks like a cross-platform design-system component. Placing it in
`packages/ui` would enable web/mobile reuse.

### 20. `apps/mobile/components/home/Footer.tsx` (lines 31-85) — Navigation Link TODOs

Footer navigation links are placeholders. Wire to actual routes before release.

### 21. `apps/mobile/app/events.tsx` (lines 76-80) — Bookmark Handler Placeholder

Handler is a TODO; only logs eventId. Needs API integration and optimistic updates
when the bookmark feature is scoped. (Cross-ref: FEB_2026_FIXES #67)

---

## Data Layer

### 22. `apps/mobile/data/mock.ts` — Decouple Mock Data from UI Type

`FilterCategory` is imported from a UI component file (`CategoryFilterPills.tsx`),
coupling data to UI. Move the type to a shared types module.

### 23. `apps/mobile/components/home/HeroCarousel.tsx` — Error State Scroll Position Sync

When auto-scroll errors, `activeIndexRef` resets to 0 but FlatList scroll position
remains unchanged. Dots indicator and scroll position can desync until the next
manual scroll.

### 24. `apps/mobile/components/menu/MenuOverlay.tsx` — SCREEN_HEIGHT Stale on Dimension Change

~~`SCREEN_HEIGHT` is captured once at module load via `Dimensions.get("window").height`.
If dimensions change (e.g., tablet rotation), the slide animation uses the stale value.
Replace with `useWindowDimensions` hook inside the component and update the Animated.Value
when height changes. Low priority — mobile screens don't resize in normal usage.~~
**Obsolete (Feb 23, 2026):** MenuOverlay replaced by bottom tab navigation (Fix #168). No longer triggered.

### 25. `apps/mobile/components/menu/MenuOverlay.tsx` — onClose Before Navigation Flash

~~`handleItemPress` calls `onClose()` before `router.push()`, which could theoretically
reveal the underlying screen during the close animation before navigation completes.
In practice the 300ms animation and near-instant Expo Router push prevent a visible flash.
If a flash is ever observed, reorder to navigate first or add a short delay.~~
**Obsolete (Feb 23, 2026):** MenuOverlay replaced by bottom tab navigation (Fix #168). No longer triggered.

---

## Multi-Currency

### Zero-decimal currencies (JPY, KRW) — formatPrice / cents conversion (Mar 16, 2026)

- **Issue:** Email and notification `formatPrice` functions use `cents / 100` via `Intl.NumberFormat`. For zero-decimal currencies (JPY, KRW), amounts are stored in whole units (yen, won), not hundredths. Dividing by 100 would produce wrong values (e.g. 1000 JPY displayed as ¥10).
- **Context:** Project does not support JPY/KRW today; no events use them. Multi-currency changes (#488–#494) did not introduce this — the same math was already present.
- **Fix (when zero-decimal currencies are planned):** Migrate all email/notification formatPrice closures to use `formatCentsAsPrice` from `@project-flame/lib`, which correctly handles zero-decimal via `centsToAmount`. Add JPY/KRW to `SUPPORTED_CURRENCIES` and run currency-specific tests.
- **Files:** `apps/web/app/lib/email/ticket-notifications.ts`, `apps/web/app/lib/email/rsvp-notifications.ts`, `apps/web/app/api/dev/email-preview/route.ts`, and any other inline `cents / 100` formatters.

---

## PR Review — Feb 23, 2026 (Org Dashboard Screens)

### 26. `apps/mobile/app/org-event-detail.tsx` — useLocalSearchParams Typed Routes

The type returned by `useLocalSearchParams` is effectively `Partial` in expo-router@6.0.23.
The current code uses `useLocalSearchParams<{ id: string }>()` which works but `id` could
still be `undefined` at runtime. Consider enabling Typed Routes (`experiments.typedRoutes: true`
in app.json) and supplying the route path as generic so `id` is strongly typed. Alternatively,
narrow locally with a runtime assertion. Low priority — already handled by the `if (!event)`
guard downstream.

### 27. `apps/mobile/components/create-event/EventDetailsTab.tsx` — Make Form Inputs Editable & Wire Pressables

**Form inputs:** TextInput instances are hard-coded with `editable={false}` and no `value`/`onChangeText`,
making fields non-interactive. Phase 5 should add local state (useState hooks) for each field,
pass `value` and `onChangeText` to TextInput, and remove `editable={false}` to enable user input. **Pressables:** The image upload area (cloud-upload icon) and Confirm CTA lack onPress handlers. Phase 5 should accept callback props (e.g., `onPickImage`, `onConfirm`) or implement internal handlers (e.g., openImagePicker, handleConfirm) and wire them to the respective Pressable onPress.

### 28. `apps/mobile/components/settings/SettingsTextArea.tsx` — onChangeText Required vs Optional

`SettingsTextAreaProps` defines `value` as required and `onChangeText` as optional, creating a
read-only controlled input when callers omit `onChangeText`. Phase 5 should either make
`onChangeText` required or add internal state as a fallback for uncontrolled usage.

### 29. `apps/mobile/data/mock.ts` — Price Units Convention (cents vs dollars)

Mock data uses numeric price values without specifying units (e.g., `revenue: 140`,
`price: 80`). When real API integration happens in Phase 5, align with the project convention
of storing prices in cents. Add a comment or convert literals accordingly at that time.

### 30. `apps/mobile/components/org-dashboard/OrgStatsSection.tsx` — QR Scanner Handler

The QR Scanner Pressable is missing an `onPress` handler. Phase 5 should add navigation to a
dedicated QR Scanner screen or open a modal with Expo BarCodeScanner/Camera, including
permission checks and memoized handler.

### 31. ~~`apps/mobile/components/create-event/TierCard.tsx` (lines 79–81) — Negative Remaining Availability~~ ✅ Fixed (MARCH_2026_FIXES.md #279)

`tier.totalAvailable - tier.sold` can go negative due to oversell or data inconsistency,
displaying values like "-5/100 available". Guard with `Math.max(0, tier.totalAvailable - tier.sold)`.

### 32. `apps/mobile/components/create-event/TicketTiersTab.tsx` — Phase 5 Form & Handler Wiring

**FormInput:** Currently `editable={false}` with no value/onChangeText. Phase 5: Add `value?: string`, `onChangeText?: (text: string) => void`, `editable?: boolean` (default true) to FormInput; wire Add Tier form fields (tier name, total tickets, sale start/end) to local state. **QuantityStepper:** Add `onChange: (newValue: number) => void` and optional min/max; wire chevron Pressables to decrement/increment; add disabled state at bounds. **CTAs:** Save Tier, Add Stage, and Confirm Pressables lack onPress. Phase 5: Implement handleSaveTier (validate + push tier), handleAddStage (append stage), handleConfirm (validation + submit); add error handling and UI feedback.

### 33. `apps/mobile/components/settings/OrganizationSettingsTab.tsx` — Phase 5 Editable Fields

SettingsTextArea and SettingsField render static values from orgSettingsProfile. Phase 5: Manage local state for description and other editable fields; pass `value` and `onChangeText` to each input; ensure handleSavePress uses updated state when saving.

### 34. `apps/mobile/data/mock.ts` — RsvpRequest.price Units Convention

~~RsvpRequest.price currently stores dollars (e.g., 80) while NotificationItem.price uses cents (e.g., 8000). Phase 5: Either (A) update RsvpRequest to cents convention (80 → 8000) and adjust RsvpRequestCard display to use formatCentsAsPrice, or (B) document the dollars exception on the interface. Add a comment on RsvpRequest.price stating "price in cents" or "price in dollars" and ensure all references (e.g., RsvpRequestCard) use the correct formatter.~~
**Resolved (Feb 23, 2026):** Mock rsvpRequests updated to cents (8000); RsvpRequestCard now uses formatCentsAsPrice.

### 35. `apps/mobile/components/settings/OrganizationSettingsTab.tsx` — Description Field Editable

Description field is read-only (SettingsTextArea has value but no onChangeText). Phase 5: Add onChangeText to update orgSettingsProfile.description so edits persist. See also #33.

### 37. Event Details — `per_user_limit === 0` Web/Mobile UX Divergence (Phase 5A, Feb 24, 2026)

**File:** `apps/web/app/components/EventDetail.tsx` (web `isTierAvailable`), `apps/mobile/hooks/useEventDetails.ts` (`getTierStatus`)
**Issue:** When a tier has `per_user_limit = 0`, mobile marks it `"sold_out"` (correct — aligns with `@project-flame/lib::isTierAvailable`), but the web's local `isTierAvailable` doesn't check `per_user_limit`, so the web shows the tier as "Available" while `maxQuantity` is 0 (user can't add any tickets). This is a web-side UX bug — a "Available" tier with 0 purchasable quantity is confusing.
**Fix when ready:** Update web's local `isTierAvailable` in `EventDetail.tsx` to also check `per_user_limit === 0`, or migrate it to use the shared lib function (which already handles this).

### 38. Event Details — Mobile Missing Real-Time Availability Polling (Phase 5A, Feb 24, 2026)

**File:** `apps/mobile/hooks/useEventDetails.ts`
**Issue:** Web polls `/api/ticket-tiers/{id}/availability` every 10 seconds to detect hold expirations, concurrent purchases, and stage transitions in real time. Mobile uses a 2-minute `staleTime` on React Query — stale data could show a tier as available when it's actually sold out by concurrent purchasers. Additionally, per-stage `quantity_reserved` data (active holds per stage) is not available from the RPC, so `findFirstAvailableStage` may select a stage that is actually full of active holds.
**Fix when ready:** (A) Add a background refetch interval (`refetchInterval: 10_000`) to the `useEventDetails` React Query config once the event detail screen is confirmed performant. (B) If the `get_event_with_tiers` RPC is extended to include stage-level hold counts, update `TicketStageSchema` in `useEventDetails.ts` to include `quantity_reserved` and update `findFirstAvailableStage` in `@project-flame/lib` to factor it in. Until then, the fallback to `sold_quantity` only is acceptable for MVP.

### 39. Event Details — Stage Selection UI: Mobile Shows Tier+CurrentStage vs. Web Shows Each Stage Separately (Phase 5A, Feb 24, 2026)

**File:** `apps/mobile/components/event-details/TicketTierCard.tsx`, `apps/web/app/components/EventDetail.tsx`
**Issue:** Web renders each ticket stage as a separate selectable card (using `getStageDisplayData`). Mobile renders a single `TicketTierCard` per tier with the current stage's price injected via `displayPrice`/`currentStageName`. This means mobile users don't see all stages or their sold-out status — they only see the active stage. For events with multiple stages (e.g. Early Bird / Regular), mobile hides past sold-out stages and future unopened stages.
**Fix when ready:** Phase 5B — expand `TicketTierCard` or `TicketSelection` to optionally render per-stage cards when `tier.ticket_stages.length > 1`, matching web's visual presentation. This is a UI enhancement, not a correctness bug for the current MVP.

### 40. Event Details — Tier Sort Order Divergence: Mobile uses `order_index`, Web uses Price (Phase 5A, Feb 24, 2026)

**File:** `apps/mobile/hooks/useEventDetails.ts` (`.sort((a, b) => order_index)`), `apps/web/app/components/EventDetail.tsx` (`.sort((a, b) => price)`)
**Issue:** Web sorts ticket tiers by price (low to high). Mobile sorts by `order_index` (organizer-defined order). `order_index` is semantically more correct (the organizer chose the display order), but there's a visual inconsistency between platforms. Not a functional bug.
**Fix when ready:** Align with product decision. If price sort is preferred for discovery, update mobile to sort by `Math.min(...stage prices, tier.price_cents)`. If `order_index` is preferred, add a comment in the web code explaining the platform difference.

### ~~41. Checkout — `promoter_code` Not Passed to `/api/holds/create` (Phase 5A, Feb 24, 2026)~~ ✅ Fixed

Full promoter code flow implemented: deep link `?promoter=` param captured in `event/[id].tsx`, validated against `promoter_links` table in `useCheckout`, passed as `promoter_code` to holds/create (line 657), RSVP free (line 511), RSVP paid (line 540), and free checkout (line 675). Editable promoter field rendered via `PreCheckoutCodes` component on event detail screen.

### ~~42. Checkout — No Hold Expiry Pre-Flight Before PaymentSheet (Phase 5A, Feb 24, 2026)~~ ✅ Fixed

Hold validation via `GET /api/holds/validate?session=` added before `presentPaymentSheet` (useCheckout.ts lines 736–780). Detects expired/invalid holds (404/410/400), cancels hold, and surfaces "Your reservation has expired. Please restart checkout." Network/5xx errors rethrow without cancelling so hold remains retryable.

### 43. Checkout — RSVP Paid Cancellation/Retry Creates Orphaned PaymentIntents (Phase 5A, Feb 24, 2026)

**File:** `apps/mobile/hooks/useCheckout.ts` (RSVP paid flow, PaymentSheet cancellation)
**Issue:** The mobile RSVP paid flow creates a PI (with `capture_method: "manual"`) without an RSVP record (RSVP is created after payment). If the user cancels the PaymentSheet, the step returns to `idle`. The next retry creates a NEW PI. The first PI has no `rsvpId` in metadata (since RSVP didn't exist yet) and no `holdId`, so the webhook's orphan cleanup logic may not find it. The authorization holds the user's card limit for ~7 days.
**Impact:** Low frequency (requires deliberate cancellation in RSVP paid flow). No money charged (manual capture, never captured). Card authorization holds are released automatically after ~7 days.
**Fix when ready:** Track the RSVP-flow PI ID in a ref (similar to `activeHoldIdRef`). On cancellation, call `POST /api/holds/cancel` is not applicable here — instead add a dedicated endpoint or re-use existing PI cancel logic via `oldPaymentIntentId` on the next retry to cancel the previous orphaned PI.

### 44. Checkout — `complete-hold-free` Transient Failure After Partial Ticket Creation (Phase 5A, Feb 24, 2026)

**File:** `apps/web/app/api/purchase/complete-hold-free/route.ts`, `apps/mobile/hooks/useCheckout.ts`
**Issue:** If `complete-hold-free` fails mid-execution (after the atomic `complete_hold_purchase` RPC succeeds but before `payment_provider: "free"` update or email), the mobile catch block cancels the hold. However, the order and tickets were already created server-side by the RPC. Cancelling the hold at this point leaves a completed order with an orphaned hold reference. Retrying checkout would create a duplicate order.
**Impact:** Very rare (requires network failure at exact mid-execution point). No financial impact (free order). User would see an error and might buy duplicate tickets.
**Fix when ready:** `complete-hold-free` should be made fully idempotent (check if `order_id` already set on the hold before creating a new order). The catch block in mobile should NOT cancel the hold if the error occurs at or after `completing_free` step — only cancel if step is still `creating_hold` or `creating_payment_intent`.

### 45. Legacy Code — `StripePurchaseFlow.tsx` Token-Based Post-Approval RSVP Payment (Phase 5A, Feb 24, 2026)

**File:** `apps/web/app/components/StripePurchaseFlow.tsx`, `apps/web/app/purchase/page.tsx`, `apps/web/app/api/rsvp/details/route.ts`, `apps/web/app/api/purchase/complete-direct-free/route.ts`
**Issue:** `StripePurchaseFlow.tsx` implements a legacy flow where an organizer approves an RSVP, the user receives an email with a `?token=...` payment link, and lands on `/purchase` to pay. This flow is no longer active: no approval email with payment link is sent, and there is no "Buy Tickets" button in the user dashboard for approved RSVPs. The code still exists but is dead. Several docs (Datafast legacy notes, QR test gap analysis, security analysis, free ticket flow) still reference `StripePurchaseFlow.tsx` as the current payment implementation.
**Impact:** No user impact (code is unreachable). Documentation confusion only — new developers may incorrectly reference `StripePurchaseFlow.tsx` as the RSVP source-of-truth instead of `EventDetail.tsx` → `RsvpPaymentModal.tsx`.
**Fix when ready:** Either (a) remove `StripePurchaseFlow.tsx` and its `/purchase` page entirely if the token-based flow will never be reactivated, or (b) add a prominent `@deprecated` JSDoc comment to the component and file header explaining it's legacy. Also update remaining docs that reference it as "current implementation" (Datafast legacy docs, QR security docs, free ticket flow docs) to point to the correct files.

### 46. Checkout — `resetCheckout` Races with In-Progress `checkout` Run on Navigation-Away (Phase 5A, Feb 24, 2026)

**File:** `apps/mobile/hooks/useCheckout.ts` (`resetCheckout`, `checkout`)
**Issue:** `resetCheckout` unconditionally cancels `activeHoldIdRef` and resets `stepInProgressRef` to `"idle"`, even if a `checkout` async run is still in flight (e.g. `creating_payment_intent` or `presenting_sheet`). If the user triggers `resetCheckout` (e.g. via back navigation) while `checkout` is awaiting a response, two bad outcomes are possible:

1. **Hold cancelled mid-flow:** `resetCheckout` fires `POST /api/holds/cancel` while `checkout` is still awaiting `create-payment-intent` or `presentPaymentSheet`. If the payment later succeeds (Stripe confirms the PI), the server-side webhook finds no valid hold and order creation fails — producing a paid-but-unfulfilled ticket.
2. **State stomped on success:** `checkout` transitions to `"success"` after `resetCheckout` has set `stepInProgressRef.current = "idle"` and cleared `setResult(null)`, so the success state is lost.
   **Mitigating factor (PaymentSheet):** The Stripe PaymentSheet is a full-screen native modal on iOS/Android. The underlying app is non-interactive while the sheet is open, so navigation cannot trigger `resetCheckout` during `presenting_sheet`. This eliminates the highest-risk scenario (paid PI with cancelled hold). The race is only realistically possible during `creating_hold` or `creating_payment_intent` network calls, where a fast back-swipe could beat the response.
   **Reproduction steps:** Start checkout → wait for hold creation → immediately swipe back (before PI creation response) → `resetCheckout` fires → hold is cancelled → if the in-flight PI creation response then arrives and Stripe is called, the hold no longer exists server-side.
   **Fix when ready:** Guard `resetCheckout` with a check against `stepInProgressRef.current`. If a non-terminal step is in progress (i.e., not `"idle"`, `"success"`, or `"error"`), either (a) skip the hold cancel and let `checkout`'s own cancel paths handle cleanup, or (b) set a "reset pending" flag that `checkout` checks on completion to then call `resetCheckout`. Option (a) is simpler but leaves a brief window where the hold is not cancelled; option (b) guarantees cleanup but adds complexity.

### 47. ~~Auth — `sync-current-user` Route Is Unimplemented; New Mobile Users Rely Solely on JIT Sync~~ ✅ Fixed (MARCH_2026_FIXES.md #285)

**Files:** `apps/web/app/api/auth/sync-current-user/route.ts`, `apps/web/app/lib/auth.ts` (`resolveDbUserFromClerkId`), `apps/mobile/hooks/useSignInHandlers.ts`
**Issue:** `POST /api/auth/sync-current-user` is a stub that validates auth and constructs `userData` but does NOT write to Supabase (TODO comment: "implement MCP call"). The web sign-in page never calls it (uses Clerk's hosted UI with no post-auth callbacks). Real user-to-Supabase sync on web is handled by Clerk webhooks (if configured) and JIT sync in `resolveDbUserFromClerkId` (triggered on first protected API call like `/api/holds/create`). Mobile relies entirely on JIT sync because: (a) no Clerk webhook endpoint on mobile, (b) the sync route is a stub. This is fine for the checkout flow (JIT sync runs on hold creation), but a mobile user who signs up and never makes a checkout API call will not have a Supabase user record until they do so. If future features (e.g., profile page, notifications) need the user record before a checkout occurs, they may find no record.
**Fix when ready:** (1) Implement `api/auth/sync-current-user/route.ts` to actually upsert the user into Supabase (replace the TODO stub with a real `supabaseAdmin.from("users").upsert({ clerk_id, email, first_name, last_name }, { onConflict: "clerk_id" })` call). (2) In `useSignInHandlers.ts`, add a fire-and-forget call after `setActive` in `onGoogleAuth` and `onEmailSignIn`/`onEmailSignUp`. Use the project's established error-logging pattern from FEB_2026_FIXES.md #192 Fix C — **do not swallow errors silently**:

```typescript
apiPost("/api/auth/sync-current-user", {}, getToken).catch((err: unknown) =>
  console.error(
    "[useSignInHandlers] sync-current-user fire-and-forget failed",
    err,
  ),
);
```

(3) In the web sign-in page, add a Clerk `afterSignIn` / `afterSignUp` callback or use `useSignIn`'s `onComplete` to fire the same endpoint. Both platforms should call it for consistency.

### 48. ~~Mobile — User Not in `users` Table; No JIT Sync from Mobile~~ ✅ Fixed (MARCH_2026_FIXES.md #285)

When a user signs up on mobile only (never interacted with the web app), they don't have a row in
the `users` table. On web, `resolveDbUserFromClerkId` in `apps/web/app/lib/auth.ts` creates the
row JIT using `supabaseAdmin`. Mobile has no equivalent. Currently, `useUserRole` returns
`role: "user"` and `useUserTickets` returns empty — correct behavior for a new user with no tickets.
However, any future feature requiring a `users.id` (e.g., creating an RSVP, placing an order) will
fail. **Phase 5B:** implement a mobile-side user sync — either via a web API endpoint
(`/api/auth/sync-current-user`) or a Supabase Edge Function that creates the user row using the
Clerk JWT claims (sub, email from Clerk's `useUser()`). The INSERT policy
`"Users can create their own profile"` already allows self-insertion when `clerk_id = jwt.sub`.

### 49. Mobile — `getOrganizerName()` in `user-ticket-mappers.ts` Is Defined but Unused (Feb 25, 2026)

`getOrganizerName()` extracts the organizer name from ticket event data. After removing
`organizations(name)` from the Supabase SELECT queries (fix #211), the function always returns
"Unknown Organizer". It's not called by any component. Either remove the function entirely or
re-add the `organizations(name)` join once the RLS recursion is fully resolved (the DB migration
`#211` should make it safe now — but keeping the join removed is defense-in-depth).

### 50. Mobile — `useUserTickets` Dedup Query Not Batched (Feb 25, 2026)

The web route batches the orders dedup query in chunks of 50 (`BATCH_SIZE = 50`) to stay within
PostgREST URI length limits. The mobile implementation sends all approved-RSVP idempotency keys in
a single `.in("idempotency_key", idempotencyKeys)` call.

For typical users (< 10 approved RSVPs) this is fine. At scale (50+ approved RSVPs), the generated
URI may exceed PostgREST's limit, causing a failed request. With the fix from #214 in place, that
failure now throws and surfaces as a query error rather than silently producing duplicates — so the
impact is a visible error rather than corrupt data.

**File:** `apps/mobile/hooks/useUserTickets.ts` ~line 332  
**Suggested fix:** Chunk `idempotencyKeys` into batches of 50, run queries in parallel with
`Promise.all`, then merge all returned rows into `existingOrderKeys`, mirroring the web route's
`BATCH_SIZE` pattern.

---

### 51. Mobile hooks — replace manual `as` casts with generated Supabase types (Feb 25, 2026)

Several mobile hooks (`useRsvpManagement`, `useUserTickets`, `useUserProfile`, `useUserRole`, `useEventDetails`) use manual `interface` definitions (`EventRow`, `RsvpCountRow`, `RsvpDetailRow`, etc.) and inline `as` casts on Supabase query results. Replacing these with the auto-generated `Database["public"]["Tables"][...]["Row"]` types from `supabase gen types` would improve type safety and automatically surface schema drift.

**Files affected:** `apps/mobile/hooks/useRsvpManagement.ts`, `apps/mobile/hooks/useUserTickets.ts`, `apps/mobile/hooks/useUserProfile.ts`, `apps/mobile/hooks/useUserRole.ts`, `apps/mobile/hooks/useEventDetails.ts`

**Suggested fix:** Run `supabase gen types typescript --local > packages/lib/src/database.types.ts` (or equivalent), import `Database` from there, and type each Supabase query response variable using the generated row/relation types rather than manual interfaces. Remove the corresponding `as` casts once TypeScript can infer the correct shapes.

**Deferral reason:** This is a cross-cutting refactor across five hooks; no functional bug — the manual types match the actual schema and all casts are internally consistent. Safe to defer until a dedicated types-cleanup pass.

---

### 36. `apps/mobile/app/rsvp-management.tsx` + `rsvp-detail.tsx` — Route Param Not Read

`rsvp-management.tsx` pushes `/rsvp-detail?eventId=${event.id}`, but `rsvp-detail.tsx` doesn't
read any route params via `useLocalSearchParams`. This is inert with mock data but will show
the wrong RSVP data once wired to real fetching. Phase 5: Add `useLocalSearchParams<{ eventId: string }>()`
to `rsvp-detail.tsx` and use it to fetch the correct event's RSVP requests, following the `id`
param pattern used in `org-event-detail.tsx`.

---

### 52. `apps/mobile/app/scanner.tsx` — Torch Toggle May Not Work on All Devices

`expo-camera`'s `enableTorch` prop depends on the device hardware. Some older Android devices
or emulators may silently ignore the torch toggle. The web implementation handles this with
`getCapabilities().torch` checks which are not available in `expo-camera`'s API. If users
report torch not working, consider adding a user-facing toast/alert when toggling fails.

**Files affected:** `apps/mobile/app/scanner.tsx`
**Deferral reason:** Device-specific edge case; core scanning flow works without torch.

---

### 53. `apps/mobile/app/scanner.tsx` — Offline Scanning Queue

When scanning in venues with poor connectivity, API calls to `/api/qr-scanner/verify` and
`/api/qr-scanner/checkin` may fail. The web version has no offline support either. Consider
adding a local queue that stores pending check-ins and retries when connectivity returns.

**Files affected:** `apps/mobile/hooks/useQRScanner.ts`, `apps/mobile/app/scanner.tsx`
**Deferral reason:** Matches web behavior (no offline support); would require significant
architectural work (local DB, retry queue, conflict resolution).

---

### 54. `apps/mobile/hooks/useQRScanner.ts` — Zod Runtime Validation for Scanner API Responses

The three scanner API responses (`ValidateCodeResponse`, `TicketVerificationResponse`,
`TicketCheckInResponse`) are typed via TypeScript interfaces but not validated at runtime.
If the web API returns an unexpected shape, fields like `eventId`, `ticket`, or `checked_in_at`
would be silently `undefined`. Add Zod schemas for each response type and parse inside each
mutation's `mutationFn` (consistent with EDGE_CASES_TODOS.md #7 for `lib/api.ts`).

**Files affected:** `apps/mobile/hooks/useQRScanner.ts`
**Deferral reason:** The API is internal and the types are manually verified to match the web
route responses. No functional bug — TypeScript provides compile-time safety. Safe to defer
until a dedicated validation-hardening pass.

---

### 55. `apps/mobile/hooks/useQRScanner.ts` — Event-Mismatch Branch Does Not Call `stopScanning()` Equivalent

In `handleBarcodeScan`, when the event-mismatch check fires, `processingRef.current` is set
to `true` but never reset before entering the "error" state. The web source calls `stopScanning()`
before the event-mismatch check, which halts the camera and prevents further callbacks. On mobile,
`processingRef` blocks further processing (equivalent effect), and `resetScanner()` correctly
resets it when the user taps "Try Again." The camera is not rendered in "error" state, so no
scan callbacks can fire. Functionally equivalent to the web. If future changes introduce a camera
overlay in the error state, reset `processingRef.current = false` explicitly in the mismatch branch.

**Files affected:** `apps/mobile/hooks/useQRScanner.ts` (lines 218–222)
**Deferral reason:** Functionally equivalent to web behavior; "Try Again" → `resetScanner()`
already resets `processingRef`. Only relevant if the error-state UI is changed to show the camera.

---

### 56. `apps/mobile/app/scanner.tsx` — URL `eventId` Param Not Wired to Scanner Session

`OrgStatsSection` passes `eventId` when navigating to `/scanner?eventId=...`, but the scanner
screen ignores it — users still need to enter an access code manually regardless of how they
navigate. The web source has no equivalent URL-based event pre-selection either. A future
enhancement could skip the access code step for authenticated organizers navigating from their
own event dashboard by verifying organizer ownership server-side and automatically setting the
event session via the `eventId` param.

**Files affected:** `apps/mobile/app/scanner.tsx`, `apps/mobile/components/org-dashboard/OrgStatsSection.tsx`
**Deferral reason:** No web equivalent; requires new server-side ownership-check logic. The
scanner still works correctly — users enter the access code as expected.

---

### 57. Task 2D — Date/Time Picker for Event Forms (Feb 26, 2026)

Create/edit event forms currently use raw ISO string TextInput for dates. Users must type ISO datetime strings manually. Add a proper date/time picker component (e.g., `@react-native-community/datetimepicker` or `react-native-modal-datetime-picker`) with Ecuador timezone handling (`ecuadorLocalToUtc` / `utcToEcuadorLocal` from `@project-flame/lib`).

**Files affected:** `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`, `apps/mobile/components/events-management/EditTiersTab.tsx`

### 58. Task 2D — Image Upload for Events (Feb 26, 2026)

Create/edit event forms have placeholder image upload areas but no actual upload functionality. Need a backend image upload endpoint (or Supabase Storage integration) and `expo-image-picker` on mobile.

**Files affected:** `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`

### 59. Task 2D — Tier Inline Edit (PATCH) from Edit Tiers Tab (Feb 26, 2026)

The Edit Tiers tab supports creating and deleting tiers but not inline editing existing tier fields (name, price, quantity, dates, stages). The web's `TierInlineForm.tsx` has full edit support. Port when needed.

**Note (Fix #248b):** `useUpdateTier` and `UpdateTierInput` were removed from `useTierMutations.ts` as dead code (no consumers). When implementing this feature, re-add the hook following the same pattern as `useCreateTier` and `useDeleteTier`.

**Files affected:** `apps/mobile/components/events-management/EditTiersTab.tsx`, `apps/mobile/hooks/useTierMutations.ts`

### 60. Task 2D — expo-clipboard for Promoter Link Copy (Feb 26, 2026)

`OrgPromoterLinksCard` uses Alert fallback instead of clipboard copy. Install `expo-clipboard` and use `Clipboard.setStringAsync()` for proper copy-to-clipboard.

**Files affected:** `apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx`

### 61. Task 2D — Delete Event Functionality (Feb 26, 2026)

The edit event screen previously had a "Delete Event" button (from mock UI) that's been removed in the real-data wiring. Add event deletion via a suitable API endpoint when ready.

**Files affected:** `apps/mobile/components/events-management/EditEventDetailsTab.tsx`

---

### 62. ~~`useStripeConnect.ts` — `Linking.canOpenURL` check before `openURL`~~ ✅ Fixed (FEB_2026_FIXES.md #243)

Implemented in Fix #243 (Feb 26, 2026).

### 63. Org Dashboard — Total Revenue Is Gross Approximation, Not Organizer Net (Feb 27, 2026)

Mobile `OrgStatsSection` computes `totalRevenueCents` from ticket_tiers: `sum(quantity_sold * price_cents)`. Web's `DashboardView` receives `totalRevenue` from `api/organizer/data`, which enriches events via `fetchEventPurchases` and sums `purchase.basePrice` (organizer net after fees, IVA, discounts). For exact parity, mobile could call `GET /api/organizer/data` or a lighter stats endpoint. Deferred — gross approximation is acceptable for dashboard overview.

**Files affected:** `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/components/org-dashboard/OrgStatsSection.tsx`

### 64. Events Screen — Bookmark Button Placeholder (Mar 3, 2026)

The bookmark button on the Events listing screen (`events.tsx`) is a placeholder that only logs in `__DEV__`. Implementing bookmarks requires a backend table (`user_bookmarks` or similar) and corresponding API/RLS. Deferred — remove the button entirely if bookmarks are not planned for launch, or implement when backend is ready.

**Files affected:** `apps/mobile/app/events.tsx`, `apps/mobile/components/events/EventsList.tsx`

### 65. ExploreCategories — Deep-Link Category Filter (Mar 3, 2026)

Category pills on the Home screen navigate to `/events` but don't pass the selected category. To filter by category on arrival, the Events screen would need to read a `category` query param and set `activeCategory` accordingly. Deferred — navigation works, but category filtering on arrival is not connected.

**Files affected:** `apps/mobile/components/home/ExploreCategories.tsx`, `apps/mobile/app/events.tsx`

### 66. Clerk webhook unreachable in local dev — new users not synced (Mar 4, 2026)

The Clerk webhook (`/api/webhooks/clerk`) syncs `user.created` / `user.updated` events to the Supabase `users` table. In local development, Clerk's servers cannot reach `localhost:3000`, so the webhook never fires and users created on the mobile app (or any Clerk-managed sign-up) are missing from the DB. This was confirmed by a 2+ month gap in `users.created_at` (last webhook-synced user: Dec 31 2025). **Mitigation:** All API routes that need a DB user should call `resolveDbUserFromClerkId()` from `auth.ts`, which has JIT sync (auto-creates the user from Clerk data on first access). Routes already using JIT: purchase, checkout, scanner, upload-profile-image. **For full local webhook testing**, configure a tunnel (e.g., ngrok) and set the Clerk Dashboard webhook URL to the tunnel endpoint.

**Files affected:** `apps/web/app/api/webhooks/clerk/route.ts`, `apps/web/app/lib/auth.ts`

### 67. upload-profile-image: orphaned files on profile photo change (Mar 4, 2026)

When a user uploads a new profile photo, the POST handler creates a new file with a unique timestamp (`upsert: false`) and updates the DB to point to the new URL, but it never deletes the previous image file from storage. The old file becomes permanently orphaned since its path is overwritten in `users.profile_image_url` (or `organizations.logo_url`). Every photo change accumulates an unreferenceable file in the `profile-images` bucket. The handler already queries the user record via `resolveUserFromClerk` — it could read the current `profile_image_url`, extract the old storage path, and remove it after a successful upload. Same pattern for company/org logo. **Files affected:** `apps/web/app/api/upload-profile-image/route.ts` (POST handler, lines ~169–225 for personal, ~252–291 for company).

### 68. Per-image BlurHash placeholders for event posters (Mar 3, 2026)

`FlameImage` supports an optional `blurhash` prop, but no events currently have blurhash strings stored. To enable blurry image previews while posters load (like Airbnb/Instagram), add a `blurhash` column to the `events` table and generate the hash on image upload. This would give users a content-aware preview instead of an empty/dark placeholder during the 300ms transition.

**Steps:** (1) Add `blurhash TEXT` column to `events` table via migration. (2) Generate blurhash on image upload in the create/edit event API (use `sharp` or `blurhash` npm package server-side). (3) Backfill existing events with a one-time script. (4) Pass `blurhash` prop to `FlameImage` in all event poster components.

**Files affected:** `supabase/migrations/`, `apps/web/app/api/events/route.ts`, event card/hero components

### 69. ~~push-notifications fetch: AbortController timeout + per-ticket errors~~ ✅ Fixed (MARCH_2026_FIXES.md #121)

### 70. ~~notifications migration: read/created_at NOT NULL~~ ✅ Fixed (MARCH_2026_FIXES.md #286)

Migration `20260304155846_add_push_tokens_and_notifications.sql` leaves `read` and `created_at` nullable. Add ALTER TABLE to set defaults, backfill NULLs, then `ALTER COLUMN ... SET NOT NULL`. If migration has already run, create a new migration for the change.

**Files affected:** `supabase/migrations/`

### 71. ~~push_tokens migration: expo_push_token globally unique~~ ✅ Fixed (MARCH_2026_FIXES.md #286)

Current constraint `UNIQUE(user_id, expo_push_token)` allows the same token across multiple users. Change to globally unique on `expo_push_token`. Dedupe or merge existing duplicates before adding the constraint to avoid migration failures.

**Files affected:** `supabase/migrations/20260304155846_add_push_tokens_and_notifications.sql`

### 72. ~~User ticket dashboard: flat95ona@gmail.com sees inflated ticket quantities~~ ✅ Fixed (MARCH_2026_FIXES.md #223)

Root cause: RLS policy "Organization members can view tickets for their events" OR-combined with "Users can view their own tickets", returning all org tickets. Fixed by explicit order-scoping in `useUserTickets`.

### 73. ~~Multi-org selector in QR scanner~~ ✅ Fixed (MARCH_2026_FIXES.md #222)

Built `useUserOrgs` hook + `OrgSelector` component. Integrated below access code entry on scanner screen.

### 74. `CheckoutMainSheet` — `String()` coercion loses numeric types for number fields (Mar 6, 2026)

`value={String(localFormData[field.id] ?? "")}` coerces all values to strings, including numbers stored in `localFormData`. For fields with `field.type === "number"`, the raw numeric value is converted to a string, which is functionally OK for display, but if a consumer checks `typeof localFormData[field.id]`, it will be `"string"` rather than `"number"`. To preserve type fidelity: check `field.type` before coercing; for number fields, pass the raw numeric value (or empty string when undefined) to `value`; in `onChange`, parse back to `Number` before storing in `localFormData`.

**File:** `apps/mobile/components/event-details/CheckoutMainSheet.tsx` ~line 258

**Deferral reason:** No current consumer checks the type of `localFormData` values — all fields are sent as `registration_data` in the RSVP body where the server handles coercion. Only relevant if strongly-typed numeric validation is added later.

### 76. `NotificationsOverlay` — Production error monitoring for notification actions (Mar 6, 2026)

The `handleDismiss`, `dismissAll`, `markAllAsRead`, and `markAsRead` catch blocks only log in `__DEV__`. In production, failures are silently swallowed. Once a monitoring service (e.g., Sentry) is wired up, each catch block should:
1. Call `captureException(err)` (or equivalent) to surface failures in the error dashboard.
2. Show brief user feedback (e.g., `Alert.alert("Error", "Could not update notification. Please try again.")`) so users know the action failed instead of assuming success.

The current `__DEV__` guard in `handleDismiss` (line ~219) and inline catches for `dismissAll`/`markAllAsRead` (lines ~248, ~261) should be replaced with unconditional error reporting once the monitoring setup is in place.

**File:** `apps/mobile/components/notifications/NotificationsOverlay.tsx` ~lines 216–270
**Deferral reason:** Requires wiring a monitoring service first; no Sentry/equivalent is currently configured in the mobile app. Revisit during the production-readiness hardening pass.

### 75. `CheckoutMainSheet` — `useEffect` sync direction for `registrationData` (Mar 6, 2026)

The `useEffect([visible, registrationData])` that calls `setLocalFormData(registrationData ?? {})` runs on both `visible` changes and `registrationData` changes. This can overwrite in-progress user edits if the parent updates `registrationData` while the modal is open (e.g., parent resets state on promo change). Decide: (A) preserve edits while open — remove `registrationData` from deps and only sync on `visible` changes; (B) always reflect parent updates — keep both in deps and add a comment. Current behavior matches option B, which is the safer default for modal-open state resets but may feel disruptive if parent-driven updates arrive mid-fill.

**File:** `apps/mobile/components/event-details/CheckoutMainSheet.tsx` ~lines 116–120

**Deferral reason:** No known scenario today where the parent updates `registrationData` while the modal is open. Revisit if a promo code or tier switch causes a parent reset while the user is filling the form.

---

## P7-3 Low — Deferred Edge Cases (Mar 6, 2026)

### 77. ~~Revenue calculation differs from web — mobile uses list price × quantity~~ ✅ Fixed (MARCH_2026_FIXES.md #284)

**Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx` (lines 40–53, `computeTierRevenueCents`), `apps/mobile/hooks/useOrgEvents.ts` (lines 54–108), `apps/web/app/api/organizer/data/route.ts` (lines 50–57), `apps/web/app/lib/utils/purchase-data.ts` (lines 280–327, `fetchEventPurchases`)

**Issue:** Mobile computes `totalRevenueCents` via `computeTierRevenueCents()`, which sums `quantity_sold * price_cents` from `ticket_tiers` and `ticket_stages`. This is the gross list-price revenue. Web computes revenue via `fetchEventPurchases()`, which sums actual order `basePrice` values — the organizer net after fees, IVA, discounts, and promo codes. The two values diverge when discounts, promo codes, or different fee models are involved, meaning the mobile org dashboard shows inflated revenue.

**Reproduction:** (1) Create an event with a $50 ticket tier. (2) Purchase a ticket using a 20% promo code (net $40). (3) Open web org dashboard — revenue shows ~$40 (actual base price). (4) Open mobile org dashboard — revenue shows ~$50 (list price × 1).

**Suggested fix:** Either (A) call `GET /api/organizer/data` from mobile to get the web-computed revenue, or (B) replicate `fetchEventPurchases` logic by querying orders directly from Supabase (joining `orders` → `tickets` → `ticket_tiers`) and summing `base_price_cents`. Option A is simpler but adds an API dependency; option B is more complex but keeps mobile as an independent Supabase client. Cross-ref: existing EDGE_CASES_TODOS #63 tracks the same issue from an earlier review.

**Deferral reason:** Gross approximation is acceptable for dashboard overview at MVP scale. Exact parity requires either a new API call or replicating purchase-data logic. Non-blocking for launch.

### 78. Tier editing not implemented — mobile only supports create/delete (Mar 6, 2026)

**Files:** `apps/mobile/components/events-management/EditTiersTab.tsx` (line 11, lines 41–131), `apps/mobile/hooks/useTierMutations.ts` (exports `useCreateTier` and `useDeleteTier` only), `apps/web/app/api/ticket-tiers/route.ts` (lines 50–61 `updateTierSchema`, lines 326–434 PATCH handler)

**Issue:** Mobile's `EditTiersTab` renders existing tiers as read-only via `ExistingTierCard`. The only mutations available are `useCreateTier` (POST) and `useDeleteTier` (DELETE). There is no `useUpdateTier` hook, no `apiPatch` call to `/api/ticket-tiers`, and no edit UI (inline form or modal) for existing tiers. Web has a full PATCH handler supporting updates to `name`, `price_cents`, `quantity_total`, `per_user_limit`, `sales_start`, `sales_end`, `useStages`, and `stages` — including quantity validation, date checks, and stage updates via `update_ticket_stages` RPC.

**Reproduction:** (1) Create an event with a ticket tier on mobile. (2) Navigate to Edit Event → Tiers tab. (3) Observe: existing tier shows name, price, quantity, per-user limit, sold count, and stages — all read-only. No edit button, no inline editing. (4) Compare with web's tier management which allows inline editing of all tier fields.

**Suggested fix:** (1) Re-add `useUpdateTier` and `UpdateTierInput` to `useTierMutations.ts` (removed as dead code in Fix #248b). (2) Implement the hook to call `PATCH /api/ticket-tiers` with the same request body shape as web. (3) Add edit UI to `ExistingTierCard` — either an inline edit form (matching web's `TierInlineForm.tsx`) or a modal. Cross-ref: existing EDGE_CASES_TODOS #59 tracks the same gap.

**Deferral reason:** Non-blocking for launch — organizers can delete and re-create tiers as a workaround. Full edit support requires porting web's `TierInlineForm` interaction patterns.

### 79. Edit event: raw date text input, no image upload (Mar 6, 2026)

**Files:** `apps/mobile/components/events-management/EditEventDetailsTab.tsx` (lines 141–167 date fields, lines 103–120 image display)

**Issue:** (A) Date fields use plain `FilledInput` (a `TextInput` wrapper) with label "Start Date and Time (ISO)" / "End Date and Time (ISO)". Users must type ISO 8601 datetime strings manually (e.g., `2026-03-15T18:00:00Z`), which is error-prone and poor UX. No date/time picker component is used. (B) The image area shows the current event image or a "No image" placeholder but has no picker, upload button, or mechanism to change the image post-creation. The save flow (`handleSave`) updates text fields only — `image_url` is not included.

**Reproduction:** (1) Create an event on mobile. (2) Navigate to Edit Event → Details tab. (3) Observe: start/end date fields show raw ISO strings that must be manually typed. No calendar/time picker. (4) Observe: event image shows but cannot be changed — no upload button or picker.

**Suggested fix:** (A) Install `@react-native-community/datetimepicker` or `react-native-modal-datetime-picker`. Create a `DateTimePickerField` component that opens the native picker and formats the result as ISO 8601. Use `ecuadorLocalToUtc`/`utcToEcuadorLocal` from `@project-flame/lib` for timezone handling. Replace the raw `FilledInput` for dates. (B) Add `expo-image-picker` integration: add an edit overlay button on the image, call `ImagePicker.launchImageLibraryAsync()`, upload via `/api/upload-image`, and PATCH the event's `image_url`. Cross-ref: existing EDGE_CASES_TODOS #57 (date picker) and #58 (image upload).

**Deferral reason:** Both require new dependencies and non-trivial UI work. Events can still be edited with raw ISO strings (functional, just poor UX). Image changes can be made via web. Non-blocking for launch.

### 80. Stripe Connect status not shown on org dashboard (Mar 6, 2026)

**Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx` (lines 194–299), `apps/mobile/components/settings/PayoutsSettingsTab.tsx` (lines 119–283)

**Issue:** The web organizer dashboard prominently displays Stripe Connect status (connected, incomplete, not connected) with an inline CTA to complete setup. On mobile, Stripe Connect UI is exclusively in Settings → Payouts (`PayoutsSettingsTab`), which shows connection status, onboarding button, and account management. The main org dashboard has no mention of Stripe Connect. Organizers who only use the dashboard may not realize their payout setup is incomplete, missing revenue from ticket sales.

**Reproduction:** (1) Sign in as an organizer with Stripe Connect not yet set up. (2) Navigate to the Org Dashboard tab. (3) Observe: dashboard shows stats, events, search — no Stripe Connect status or setup CTA. (4) Navigate to Settings → Payouts tab. (5) Observe: Stripe Connect status and onboarding button are here only.

**Suggested fix:** Add a dismissible `StripeConnectBanner` component to the org dashboard (above or below `OrgStatsSection`) that shows when `stripeConnectStatus !== "complete"`. Display a short message ("Complete your payout setup to receive revenue") with a CTA button that navigates to Settings → Payouts or directly triggers `useStripeConnect.startOnboarding()`. Dismiss state can be stored in `AsyncStorage` per org. Benchmark: Stripe Dashboard and Eventbrite both show prominent setup reminders on the main dashboard.

**Deferral reason:** Non-blocking — organizers can still access Stripe Connect via Settings. Dashboard reminder is a UX improvement, not a functional requirement.

### 81. ~~2-hour event creation rule not validated client-side~~ ✅ Fixed (MARCH_2026_FIXES.md #280)

**Files:** `apps/mobile/app/(tabs)/create-event.tsx` (lines 158–211, `handleSubmit`), `apps/web/app/api/events/route.ts` (lines 335–348, POST validation), `apps/web/app/components/OrganizerDashboard.tsx` (lines 1395–1398)

**Issue:** The web API rejects event creation when `starts_at` is less than 2 hours in the future (returns 400 with "Event start time must be at least 2 hours in the future"). The web frontend (`OrganizerDashboard.tsx`) also validates this client-side before submission. Mobile's `handleSubmit` validates that `starts_at` is a valid date, that `ends_at > starts_at`, and that tiers are present — but does not check the 2-hour rule. Users can fill the entire form and submit, only to get a server-side rejection with no clear UX feedback beyond a generic error.

**Reproduction:** (1) On mobile, navigate to Create Event. (2) Fill in all fields. Set start date to 30 minutes from now. (3) Submit. (4) Observe: the API returns 400 but the mobile error handling shows a generic "Failed to create event" alert without mentioning the 2-hour rule. User has no idea what went wrong.

**Suggested fix:** Add a client-side validation in `handleSubmit` before the API call:
```typescript
const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
if (new Date(eventForm.starts_at) < twoHoursFromNow) {
  Alert.alert("Validation", "Event start time must be at least 2 hours in the future");
  return;
}
```
Consider extracting this to `@project-flame/lib` as `validateEventStartTime(startsAt: string): { valid: boolean; message?: string }` so both web and mobile share the same rule.

**Deferral reason:** Server-side rejection prevents invalid events from being created — functional correctness is maintained. Client-side validation is a UX improvement. Non-blocking for launch.

### 82. ~~401/token expiry — no global handling, retry, or redirect~~ ✅ Fixed (MARCH_2026_FIXES.md #283)

**Files:** `apps/mobile/lib/api.ts` (lines 80–91, response handling; lines 201–206, form data upload)

**Issue:** The mobile API client (`apiGet`, `apiPost`, `apiPatch`, `apiDelete`, `apiUploadFormData`) throws an `ApiError` for any non-2xx response, including 401 Unauthorized. There is no special handling for 401: no token refresh attempt, no automatic retry with a new token, and no redirect to the sign-in screen. If a Clerk JWT expires mid-session (default ~60s with auto-refresh, but edge cases exist — backgrounded app, network interruption during refresh), all API calls fail with 401 and the user sees generic error states across the app with no guidance on how to recover.

**Reproduction:** (1) Sign in on mobile. (2) Background the app for an extended period (or manually invalidate the Clerk session). (3) Return to the app and trigger an API call (e.g., pull-to-refresh on dashboard). (4) Observe: generic error state. No "session expired" message, no redirect to sign-in, no retry.

**Suggested fix:** Add a global 401 interceptor in `api.ts`:
1. On 401 response, attempt to refresh the Clerk token via `getToken({ skipCache: true })`.
2. If refresh succeeds, retry the original request once with the new token.
3. If refresh fails (e.g., session fully expired), emit a global event (e.g., via a React context or event emitter) that triggers navigation to the sign-in screen with a "Session expired" message.
4. Ensure retry logic is idempotent and doesn't double-fire for POST/PATCH calls.

Alternative: Use Clerk's `useAuth().isSignedIn` with a top-level watcher that redirects when the session becomes invalid, combined with TanStack Query's `onError` global handler for 401s.

**Deferral reason:** Clerk's auto-refresh handles most expiry cases. The 401 edge case requires network interruption during token refresh, which is rare. No user reports of session expiry issues. Non-blocking for launch.

### 83. ~~"Unknown Organizer" on ticket detail — `useUserTickets` missing `organizations(name)` join~~ ✅ Fixed (MARCH_2026_FIXES.md #278)

**Files:** `apps/mobile/hooks/useUserTickets.ts` (lines 117–152, `TICKET_SELECT`, `RSVP_SELECT`, `PROMO_SELECT`), `apps/mobile/app/ticket/[id].tsx` (lines 211–215, organizer name resolution), `apps/mobile/lib/user-ticket-mappers.ts` (`getOrganizerName`)

**Issue:** The three Supabase SELECT constants in `useUserTickets` (`TICKET_SELECT`, `RSVP_SELECT`, `PROMO_SELECT`) join `events` but do not include `organizations(name)` in the events join. The web equivalent (`apps/web/app/api/user/tickets/route.ts`) includes `organization:organizations(name)` in all three queries. On mobile, `ticket/[id].tsx` attempts to read `eventInfo?.organization?.name` and `eventInfo?.organizations`, but both are always `undefined` because the data was never fetched. The fallback `"Unknown Organizer"` is displayed for every ticket.

**Reproduction:** (1) Sign in on mobile with a user who has purchased tickets. (2) Navigate to My Tickets → tap any ticket. (3) Observe: "By Unknown Organizer" is shown below the event name. (4) Same ticket on web shows the correct organizer name.

**Suggested fix:** Add `organizations(name)` to the events join in all three SELECT constants:
```ts
event:events(
  id, name, slug, description, image_url, starts_at, ends_at, venue,
  organizations(name)
)
```
**Caution:** The `organizations` join was previously removed as defense-in-depth against RLS recursion (see FEB_2026_FIXES.md #211). The RLS recursion fix migration (`20260225171000_explicit_manage_memberships_rls.sql`) should make this safe now. Test thoroughly that re-adding the join does not trigger RLS recursion. If it does, use a Supabase RPC or Edge Function to fetch the organizer name separately. Cross-ref: existing EDGE_CASES_TODOS #49 (`getOrganizerName` unused).

**Deferral reason:** Functional — tickets display correctly except for the organizer name. Re-adding the join requires RLS recursion regression testing. Non-blocking for launch.

### 84. Real-time notification refresh — fetch-on-mount and pull-to-refresh only (Mar 6, 2026)

**Files:** `apps/mobile/hooks/useNotifications.ts` (lines 234–236, `useEffect` fetch-on-mount), `apps/mobile/components/notifications/NotificationsOverlay.tsx` (lines 355–369, pull-to-refresh)

**Issue:** Notifications are fetched once on mount via `useEffect(() => { fetchNotifications(); }, [fetchNotifications])` and can be refreshed via pull-to-refresh in the `NotificationsOverlay`. There is no Supabase Realtime subscription (e.g., `supabase.channel(...).on('postgres_changes', ...)`) and no polling interval. New notifications only appear after the user manually pulls to refresh or navigates away and back. This means time-sensitive notifications (e.g., RSVP approvals, event reminders, ticket confirmations) may not be seen until the user actively checks.

**Reproduction:** (1) Open the notifications overlay on mobile. (2) From another device/session, trigger a notification (e.g., approve an RSVP for the user). (3) Observe: the notification does not appear in the open overlay. (4) Pull to refresh — notification now appears.

**Suggested fix:** Add one or both of: (A) **Polling:** Set `refetchInterval: 30_000` (30 seconds) on the TanStack Query config for notifications, or add a `setInterval` in `useNotifications` that calls `fetchNotifications()` periodically. (B) **Supabase Realtime:** Subscribe to `postgres_changes` on the `notifications` table filtered by `user_id`, and call `fetchNotifications()` on new inserts. Option B is more efficient but requires Supabase Realtime to be enabled for the `notifications` table. Option A is simpler and sufficient for most use cases. Benchmark: Eventbrite and Ticketmaster use push + polling for notification badges.

**Deferral reason:** Push notifications already deliver time-critical alerts to the device. The in-app overlay is a secondary view. Non-blocking for launch.

### 85. Offline detection — no connectivity monitoring or offline messaging (Mar 6, 2026)

**Files:** Entire `apps/mobile/` codebase — no usage of `@react-native-community/netinfo` or equivalent

**Issue:** The mobile app has no offline detection or connectivity monitoring. When the device loses network connectivity, API calls fail silently or show generic error states. There is no offline banner, no "No internet connection" message, no queue of pending operations, and no automatic retry when connectivity returns. Every data-fetching screen (home, dashboard, tickets, notifications, scanner) degrades to its error state with no indication that the root cause is connectivity.

**Reproduction:** (1) Open the mobile app with data loaded. (2) Enable Airplane Mode. (3) Pull to refresh on any screen. (4) Observe: generic error state ("Failed to load" or similar). No mention of offline/connectivity. (5) Disable Airplane Mode. (6) Observe: no automatic recovery — user must manually retry.

**Suggested fix:** (1) Install `@react-native-community/netinfo`. (2) Create a `useNetworkStatus` hook that monitors connectivity via `NetInfo.addEventListener`. (3) Add a global `OfflineBanner` component (rendered in `_layout.tsx`) that shows "No internet connection" when offline. (4) Optionally integrate with TanStack Query's `onlineManager` to automatically pause/resume queries based on connectivity. (5) For critical write operations (check-in, ticket purchase), consider queuing failed operations and retrying on reconnection.

**Deferral reason:** Matches web behavior (no offline support either). Requires new dependency and cross-cutting UI changes. Non-blocking for launch — users on mobile networks rarely lose connectivity entirely.

### 86. ~~Push token registration — no automatic retry on failure~~ ✅ Fixed (MARCH_2026_FIXES.md #282)

**Files:** `apps/mobile/hooks/useNotificationRegistration.ts` (lines 18–32), `apps/mobile/lib/notifications.ts` (lines 111–126, `registerForPushNotificationsAsync`)

**Issue:** Push token registration is fire-and-forget with a single attempt. `useNotificationRegistration` calls `registerForPushNotificationsAsync(getToken)` once in a `useEffect` on sign-in. If the call fails (network error, server down, rate-limited), it logs a warning and sets `hasRegistered.current = false`. The effect does not re-run on failure because its dependencies (`isSignedIn`, `getToken`) don't change. The user won't receive push notifications until they sign out and back in (which resets `hasRegistered.current`).

**Reproduction:** (1) Sign in on mobile while the server is temporarily unreachable (or throttle the `/api/push-tokens/register` endpoint). (2) Observe: `console.warn("[useNotificationRegistration] Registration failed: ...")` in logs. (3) Navigate the app normally. (4) Observe: no retry. The user never receives push notifications for this session. (5) Sign out and back in — registration succeeds on the second session.

**Suggested fix:** Add exponential backoff retry logic to `useNotificationRegistration`:
```typescript
const retryCount = useRef(0);
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 30000]; // 5s, 15s, 30s

useEffect(() => {
  if (!isSignedIn || hasRegistered.current) return;
  const attempt = async () => {
    try {
      await registerForPushNotificationsAsync(getToken);
      hasRegistered.current = true;
      retryCount.current = 0;
    } catch (err) {
      console.warn("[useNotificationRegistration] attempt failed:", err);
      if (retryCount.current < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount.current] ?? 30000;
        retryCount.current++;
        setTimeout(attempt, delay);
      }
    }
  };
  attempt();
}, [isSignedIn, getToken]);
```
Alternatively, use TanStack Query's `useMutation` with `retry: 3` and `retryDelay` for built-in retry support.

**Deferral reason:** Single-attempt registration succeeds in the vast majority of cases (stable network on sign-in). Failure requires network issues during the specific registration window. Non-blocking for launch.

---

## Database / Migrations

### 87. `notifications.created_at` — legacy NULL rows stamped with migration time (Mar 6, 2026)

**File:** `supabase/migrations/20260306235911_notifications_not_null_and_unique_push_token.sql`

**Issue:** The migration backfills NULL `created_at` values with `now()` (migration time, Mar 6 2026). A PR review (P7-3) noted this overwrites historical NULLs with a misleading timestamp and suggested a selective backfill from an authoritative historical source instead. However, no such source (audit table, original event timestamp column) exists in the schema for the `notifications` table. The migration is already applied.

**Impact:** Any `notifications` row that had a NULL `created_at` before the migration now shows a `created_at` of approximately 2026-03-06T23:59:11Z. This affects display of notification timestamps in the UI (they'll appear to all have been sent at migration time). The NOT NULL constraint itself is correct and desirable.

**Suggested fix:** If a historical source is later added to the schema (e.g., an audit log table), create a follow-up migration to update the stamped rows to their true timestamps. Otherwise, accept the limitation — these were rows with unknown creation times and the migration timestamp is the best available approximation.

**Deferral reason:** No authoritative historical source exists to recover correct timestamps. Migration already applied; cannot change DB state retroactively without a source of truth. Non-blocking for launch.

### 88. Legacy Code — `complete-hold` (Datafast) Route Deprecation (Mar 9, 2026)

**Files:** `apps/web/app/api/purchase/complete-hold/route.ts`, `apps/web/app/api/datafast/*`, `apps/web/app/lib/services/transaction-recovery.ts`

**Issue:** The `complete-hold` route is Datafast-specific: it requires `datafastTransactionId`, stores `payment_method: "datafast"` in orders, and updates `datafast_transactions`. Datafast was superseded by Stripe Connect (see `docs/historico/datafast/DATAFAST_IMPLEMENTATION_SUMMARY.md`). No active frontend or Stripe flow calls `complete-hold`; paid purchases use the Stripe webhook (`payment_intent.succeeded`), and free purchases use `complete-hold-free`. The route may still be reachable from transaction-recovery tooling or legacy Datafast redirect flows.

**How the Datafast/bank_transfer confusion arose:** When `sendTicketReadyEmail` was added (MARCH_2026_FIXES #349e), it supported `paymentMethod: "free" | "bank_transfer"` for lightweight notifications (no PDF). Bank transfer orders (organizer-created via `bank-transfer-tickets`) correctly use `"bank_transfer"`. The `complete-hold` route (Datafast card payments) was wired to the same simple email in #349g and lumped with "bank transfer" as "non-Stripe paid methods." Someone reused `paymentMethod: "bank_transfer"` for complete-hold even though Datafast processes **card** payments, not bank transfers. That semantic mismatch was fixed in #353 (now passes `"datafast"`), but the route itself is legacy.

**Fix when ready:** If Datafast is fully retired and no recovery flows depend on it, consider deprecating or removing: `complete-hold` route, `apps/web/app/api/datafast/*` routes, and any callers in transaction-recovery. Verify no production flows or scheduled jobs use them before removal.

**Status:** Deprecation warning added (Mar 9, 2026): `complete-hold` route logs `console.warn("[DEPRECATED] POST /api/purchase/complete-hold hit...")` at entry. If this appears in production logs, investigate before removal.

### 89. Mobile QR Scanner — Camera Lens Switching (Mar 9, 2026)

**Files:** `apps/mobile/app/scanner.tsx`, `apps/mobile/package.json`

**Issue:** The back camera on some iOS devices defaults to wide-angle, causing QR codes to appear small and hard to scan. The web scanner (`QRScannerApp.tsx`) detects multiple cameras and allows switching between them with `getCameraDisplayName()` labels (Ultra Wide, Wide, Back, Front). The mobile scanner should offer the same lens switching capability.

**Why deferred:** expo-camera `~17.0.10` (Expo SDK 54) does not include the `selectedLens` / `getAvailableLensesAsync()` / `onAvailableLensesChanged` API. This API was merged into expo-camera in April 2025 (expo/expo#36233) and ships in a newer minor version not covered by the `~17.0.10` semver range. Additionally, the feature has known stability issues — a `KERN_INVALID_ADDRESS` crash was reported (expo/expo#37328), and a follow-up stability fix (expo/expo#42916) was submitted in Feb 2026. The feature is iOS-only (no Android support).

**Fix when ready:** After upgrading to a newer Expo SDK that includes the lens selection API:
1. Add `selectedLens` prop to `CameraView` in `scanner.tsx`.
2. Use `onAvailableLensesChanged` to detect available lenses and show a lens toggle button (only when multiple rear lenses exist).
3. Filter out ultra-wide lenses by default for QR scanning (prefer the standard/telephoto lens for closer focus).
4. Show the current lens label at the top of the scanning view, mirroring web's `getCameraDisplayName()` pattern.
5. Test on devices with multiple rear cameras (iPhone 13+, iPhone 15 Pro) to verify stability.

**Current mitigation:** The scanner defaults to `facing="back"` which uses the system's default rear camera. Users can flip to front camera via the camera-reverse button. This is adequate for most QR scanning scenarios.

**Deferral reason:** API not available in current SDK version. Stability concerns in newer versions. Non-blocking for launch — default back camera works for QR scanning.

### 90. Mobile QR Scanner — Manual QR Data Entry (Mar 9, 2026)

**Files:** `apps/mobile/app/scanner.tsx`

**Issue:** The mobile scanner previously had a `ManualCodeEntry` component that allowed pasting raw QR code data when the camera couldn't read it. This was removed in P8-3d because the web scanner does not have this feature — the web relies solely on camera scanning.

**Potential enhancement:** If users report difficulty scanning QR codes in certain lighting conditions or with damaged tickets, consider re-adding a manual entry option. This would allow pasting the JSON QR data string directly. The web version could also benefit from this feature.

**Deferral reason:** Not present in web source of truth. Removed for web parity. Re-evaluate based on user feedback post-launch.

---

### 91. ~~Legacy `markup_fixed_cents=99` for non-USD events — DB backfill if needed~~ ✅ Implemented (Mar 11, 2026)

**Context:** Currency-aware platform fee defaults (MARCH_2026_FIXES.md #440) set `markup_fixed_cents` correctly at event creation. Non-USD events created *before* that fix could have `markup_fixed_cents=99` from the DB column default (MXN/DOP/COP would undercharge).

**Fix implemented:** Migration `20260311033747_backfill_markup_fixed_cents_by_currency.sql` backfills affected rows. See MARCH_2026_FIXES.md #440 for full details. EDGE_CASES_TODOS #91 retained for reference; migration supersedes the manual SQL below.

**Original migration snippet (now in migration file):**
```sql
-- from DEFAULT_FIXED_FEE_BY_CURRENCY['MXN'] in packages/lib/src/pricing/constants.ts
UPDATE events SET markup_fixed_cents = 1800 WHERE currency = 'MXN' AND markup_fixed_cents = 99;
-- from DEFAULT_FIXED_FEE_BY_CURRENCY['DOP'] in packages/lib/src/pricing/constants.ts
UPDATE events SET markup_fixed_cents = 6000 WHERE currency = 'DOP' AND markup_fixed_cents = 99;
-- from DEFAULT_FIXED_FEE_BY_CURRENCY['COP'] in packages/lib/src/pricing/constants.ts
UPDATE events SET markup_fixed_cents = 420000 WHERE currency = 'COP' AND markup_fixed_cents = 99;
```

**Rejected alternative:** Runtime sentinel check (detect `markup_fixed_cents==99` for non-USD and substitute) — would silently override an organizer's explicit choice; 99 is a legitimate value; adds complexity to the payment hot path.

**Status:** Migration implemented. Proactive backfill ensures restored/staging DBs and future non-USD events are corrected.


---

### Contact Form — In-Memory Rate Limiter Not Safe for Multi-Instance Deployments (Mar 17, 2026)

`apps/web/app/api/contact/route.ts` uses an in-memory `Map<string, number[]>` (`submissions`) for rate limiting. This works for single-instance (local dev) but fails in production multi-instance deployments: each instance has its own map, so a user can bypass the 3-requests-per-60s limit by hitting different instances. The map also grows unbounded if the cleanup filter isn't triggered.

**Files affected:** `apps/web/app/api/contact/route.ts` (lines 6–30, `submissions` + `isRateLimited`)

**Suggested fix:** Replace with a shared TTL-backed store (e.g. Redis via Upstash `@upstash/ratelimit`). Use atomic INCR with a 60 s TTL per IP key. The `isRateLimited` function becomes a single `ratelimit.limit(ip)` call; the in-memory `submissions` Map is removed entirely.

**Deferred because:** Requires adding Upstash Redis infrastructure. Contact form is low-volume; multi-instance bypass risk is low for current traffic. Defer until the platform scales or Redis is already provisioned for another feature.

---

---

## P9-7 Organizer Dashboard Review (Mar 18, 2026)

### `TierInlineForm.tsx` — stale `stageBasePrices` when toggling "Use Price Stages" (lines ~150–184)

`handleUseStagesToggle` calls `setStages(...)` to create or collapse stages but does not update `stageBasePrices` in sync, leaving stage price inputs blank or stale when enabling stages. Fix: inside `handleUseStagesToggle`, call `setStageBasePrices(...)` alongside `setStages(...)` — use `formData.price_cents` for both stage entries when enabling, and a single `formData.price_cents` entry when collapsing.

**Files affected:** `apps/web/app/components/organizer/TierInlineForm.tsx` (lines ~150–184)

**Deferred because:** Functional issue in the tier form but low user-facing severity — the organizer can still type prices manually; no data is lost. Tier editing is now primarily via `OrgEventDetailClient.tsx`. Fix before enabling inline tier creation from the dashboard.

---

### OrgEventDetailClient — Stale `selectedTierId`/`bankTierId` after `ticketTiers` prop changes (Mar 18, 2026)

`selectedTierId` and `bankTierId` in the `SendFreeTickets` panel are initialised from `ticketTiers[0]?.id` at mount. If the parent refreshes and the previously-selected tier is deleted or reordered, the IDs become stale — subsequent `handleSendFreeTicket` and `handleSendBankTransfer` calls submit a non-existent tier ID, causing a server 404/400.

**Files affected:** `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (lines ~321–340, ~392, ~424)

**Required fix:** Add a `useEffect` that watches `ticketTiers` and resets `selectedTierId` (and `bankTierId` via `getInitialTierValue()`) whenever the array changes or the currently-selected ID is no longer present in the new array.

**Deferred because:** Requires a specific flow to trigger (delete a tier while the send-tickets panel is open). Core send-tickets flow works correctly; this only affects the edge case where tiers are modified mid-session.

---

### OrgEventDetailClient — No cleanup for in-flight image upload or blob preview URL on unmount (Mar 18, 2026)

`imageUploadAbortController` ref is created at line ~986 but `imageUploadAbortController.current?.abort()` is never called on component unmount. If the user navigates away during an upload, the fetch continues in the background and `setEditingImagePreview`/`setHasPendingImageUpload` state updates fire on an unmounted component. Additionally, the blob URL created for the preview (`editingImagePreview` set to a `blob:` URL) is never revoked, leaking object memory.

**Files affected:** `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (lines ~986–997)

**Required fix:** In the existing `useEffect(() => { return () => { clearTimeout(deleteConfirmationTimerRef.current) } }, [])` cleanup (or a new one), add `imageUploadAbortController.current?.abort()` and `URL.revokeObjectURL(editingImagePreview)` (guarded by `editingImagePreview.startsWith("blob:")`).

**Deferred because:** Unmount-during-upload is uncommon in organizer event management. The memory leak from a single blob URL is small and ephemeral (page navigation cleans it up). Low priority.

---

### Phase 10-1 Edge Cases (Mar 23, 2026)

**`useEventAssignments` — client-supplied `assigned_by` is spoofable**
`apps/mobile/hooks/useEventAssignments.ts` (lines 67–77)

`useAssignUserToEvent` and `useAssignCohostOrg` send `assigned_by` as a client-supplied field in the Supabase INSERT. A malicious owner/admin could attribute an assignment to another user. `assigned_by` is an audit field only — the RLS `get_admin_organizations()` policy already correctly restricts who can INSERT, so there is no permission escalation risk.

**Reproduction:** Owner/admin modifies the client to send a different user's UUID in `assigned_by`.
**Impact:** Mis-attributed audit log only. No data-loss or permission leak.
**Suggested fix (when pursued):** Add a server-side API route (or DB trigger using `auth.jwt() ->> 'sub'`) that derives `assigned_by` from the JWT, ignoring any client-supplied value. Until then, the column is best-effort attribution.

---

**`PreCheckoutCodes` — `promoterEditing` state desync when `promoterCode` is externally cleared**
`apps/mobile/components/event-details/PreCheckoutCodes.tsx` (lines 27–33)

The `useEffect` that syncs `promoterCode` prop to local state only sets `promoterEditing = false` when `promoterCode` is truthy. If the parent clears `promoterCode` to `""` without going through the component's X button (e.g. `resetCheckout` on sheet close), `promoterEditing` stays `false`. However, the "valid" state badge also requires `promoterStatus === "valid"` — if that is also cleared by `resetCheckout`, the render falls through to the input form correctly. The desync is only observable if `promoterStatus` somehow remains `"valid"` while `promoterCode` is cleared.

**Reproduction:** (1) Apply promoter code; (2) trigger `resetCheckout` from an external path that doesn't call `onClearPromoter`; (3) open checkout sheet — `promoterEditing` is false but badge shows nothing because `promoterCode` is empty.
**Suggested fix:** Change the effect to `setPromoterEditing(!promoterCode)` unconditionally instead of only setting `false` when truthy.

---

### Admin Dashboard — Mixed-Currency Revenue Aggregate (Mar 16, 2026)

`admin/page.tsx` aggregates all approved RSVPs into a single `globalStats.totalRevenue` number in cents, then `AdminDashboard.tsx` formats it as USD. If events span multiple currencies, this sum is meaningless (adds EUR cents to USD cents).

**Files affected:** `apps/web/app/admin/page.tsx` (lines 83–96), `apps/web/app/components/AdminDashboard.tsx` (formatCurrency call sites)

**Required fix:** Change `GlobalStats.totalRevenue` from `number` to `Record<string, number>` (currency → total cents). Update the Supabase query in `admin/page.tsx` to join `ticket_tiers → events(currency)` and group by currency. Update `AdminDashboard.tsx` to render one formatted line per currency using `formatCentsAsPrice`.

**Deferred because:** Requires changing the `GlobalStats` interface contract across page and component; admin platform is internal-only and currently all events are USD.

---

## Phase 10-4 PR Review — Deferred (Mar 23, 2026)

### `EventAssignmentSheet` — partial failure on batch save leaves assignments in intermediate state

`apps/mobile/components/org-members/EventAssignmentSheet.tsx` (lines ~144–163)

`Promise.all([...removePromises, ...addPromises])` rejects on first failure, leaving some removes/adds applied and others not. The UI surfaces the error `Alert` and the user can retry, but the intermediate state is not automatically rolled back.

**Suggested fix:** Create a backend `PATCH /api/organizer/event-assignments/batch` endpoint that accepts `{ userId, removeEventIds, addEventIds }` and applies all changes in a single DB transaction, or collect individual results and report which IDs failed.

**Deferred because:** Requires a new backend endpoint (no batch API currently exists). Partial failures are retryable via the error `Alert`; the DB has no cross-table constraint that would be violated in intermediate state. Disproportionate for this UI feature at current scale.

---

### ~~Org-facing notifications not filtered by member role or event assignment~~ ✅ Fixed (Mar 31, 2026)

Added `sendPushToOrgMembersByRole` in `push-notifications.ts` — accepts role filter + optional `eventId` to include assigned organizers. Dispatch updated: `ticket_sold` → owner+admin only; `new_rsvp_request` → owner+admin + assigned organizers; RSVP emails → same filter. Viewers excluded from all org-facing notifications.

---

**`useNotificationRegistration` — add resume timer after cooldown exhaustion + AbortController for post-signout retries**
`apps/mobile/hooks/useNotificationRegistration.ts` — `retriesExhaustedAt`, `attempt`, `retryTimer`

After all 3 retries are exhausted, `retriesExhaustedAt.current = Date.now()` is set and no further attempts are scheduled within the 2-minute cooldown window. The cooldown expires only if a new render triggers the effect (e.g., a re-render from another state change). In low-activity screens this may delay recovery significantly. Additionally, retries scheduled via `setTimeout` inside `attempt` are not cancelled when the user signs out mid-retry — the `!isSignedIn` branch clears `retryTimer.current` for the initial timer but not for in-flight retry chains.

**Suggested fix:**
1. After setting `retriesExhaustedAt.current`, schedule a single `setTimeout(attempt, EXHAUSTED_COOLDOWN_MS)` and store its ID in a dedicated `cooldownTimer` ref so it can be cleared on unmount/sign-out.
2. Introduce a `cancelled` ref (or `AbortController`) inside each `attempt` closure and check it before scheduling the next retry — guards against retries firing after sign-out when the previous timer wasn't cancelled in time.

**Deferred because:** The current implementation already resets `retriesExhaustedAt` to 0 on sign-out (`!isSignedIn` path), so a fresh sign-in starts a clean cycle. The missed-retry window is bounded at 2 minutes. Not blocking any user-facing flow.

---

**`useSignInHandlers` — `sync-current-user` POST may not fire if screen unmounts before `useEffect`**
`apps/mobile/hooks/useSignInHandlers.ts` — `pendingSyncHandler`, `completeAuthAndRedirect`, `router.replace`

`completeAuthAndRedirect` sets `pendingSyncHandler` then `router.replace("/")` is called synchronously. The sign-in screen unmounts immediately via Expo Router. The `useEffect([isSignedIn, pendingSyncHandler])` may not have a chance to run before the component unmounts, so the `/api/auth/sync-current-user` call is never made.

**Why deferred:** `sync-current-user` is documented as a stub — real user sync happens JIT via `resolveDbUserFromClerkId` on every authenticated API call. Missing the explicit sync call has no runtime impact on data correctness.

**Suggested fix if sync becomes non-stub:** Move the `apiPost("/api/auth/sync-current-user")` call to a long-lived provider (e.g., `AuthRedirectContext`) that subscribes to Clerk `onSessionChange` events rather than a per-screen `useEffect`. Or await the call using `getTokenRef.current` inside a non-async `completeAuthAndRedirect` before calling `router.replace`.

---

**RSVP-only events show 0 attendees and $0.00 revenue in OrgEventCard (simplified organizer dashboard)**
`apps/mobile/hooks/useAssignedEvents.ts` — `computeTierAttendees` / `computeTierRevenueCents`
`apps/mobile/components/org-dashboard/OrgEventCard.tsx` — attendees/revenue row (lines 83–96)

`OrgEventCard` always renders `Attendees: X / Revenue: Y` unconditionally. `useAssignedEvents` computes both metrics purely from `ticket_tiers → ticket_stages`, so RSVP-only events (no tiers, or tiers with `price_cents = 0`) display `0 attendees` and `$0.00` — misleading for organizers who do have RSVPs.

**Affected scenarios:**
- An organizer is assigned to an RSVP-only event (requires_rsvp=true, no paid tiers).
- The simplified dashboard shows 0/0 even when many RSVPs exist.

**Suggested fix (two options):**
1. **Suppress stats for RSVP events:** Add `requires_rsvp` to the `useAssignedEvents` Supabase select, surface it through `AssignedEvent` and `OrgEventCardData`, then conditionally hide the attendees/revenue row in `OrgEventCard` when `requires_rsvp = true`.
2. **Use RSVP/order aggregates:** Fetch `total_rsvps` from `events` (already a column) for attendee count, or add a JOIN to `orders` for revenue. Replace the tier-math functions with server-authoritative aggregates, mirroring the `useOrgStats` approach used by the full org dashboard.

**Deferred because:** RSVP-only events in the simplified organizer dashboard are an uncommon combination (most assigned events are ticketed). The fix requires either extending the query shape and threading a new prop through `OrgEventCardData`, or adding a server-side aggregate join. Core functionality (event navigation, badge display) is unaffected.

---

## Apr 8, 2026 PR Review — Deferred Edge Cases

### Co-host enriched data: `useOrgData` membership gate bypasses owner org for co-hosts

**File:** `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/hooks/useOrgEventEnriched.ts`

When a user is a co-host (member of org A, co-hosting an event owned by org B), `useOrgEventEnriched(id, ownerOrgId)` calls `useOrgData(ownerOrgId)` internally. `useOrgData` queries `organization_members` where `user_id = current_user AND organization_id = ownerOrgId`. Since the user is NOT a member of org B, this returns null, `orgSlug` is undefined, and the API call falls back to `/api/organizer/data` (user's own org), where the event is not found. Co-hosts cannot view enriched event data (purchases, promo codes, promoter links).

**Suggested fix:** Add `organization_id, organizations(slug)` to the `useOrgEvents` EVENT_FIELDS select so `event.organization_slug` is available. Update `useOrgEnrichedAll` to accept an optional `orgSlug` param and skip the `useOrgData` lookup when the slug is already known. Thread `event.organizations?.slug` from `org-event-detail.tsx` into the hook.

**Deferred because:** Co-host scenario requires an architectural change to `useOrgEvents` and `useOrgEnrichedAll`. Core event management still works for event owners.

---

### `CityAutocompleteField`: Google Places API key in app bundle (EXPO_PUBLIC)

**File:** `apps/mobile/components/create-event/CityAutocompleteField.tsx`

`EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` is embedded in the JS bundle. Any user who decompiles the app can extract and misuse the key.

**Suggested fix:** Create `apps/web/app/api/places/autocomplete/route.ts` (uses `process.env.GOOGLE_PLACES_API_KEY`, validates input, calls Google Places REST API, returns safe JSON). Update `CityAutocompleteField.tsx` to call `${API_BASE_URL}/api/places/autocomplete?input=...` instead. Restrict the production key in Google Cloud Console to the web domain + the app's bundle ID as a secondary measure.

**Deferred because:** Risk mitigated by restricting the Google API key in Cloud Console to the app's bundle ID. Server proxy is the proper long-term fix but requires a new web route and `API_BASE_URL` config in mobile.

---

### `promoter_links`: `USING (true)` RLS policy allows full table enumeration

**File:** `supabase/migrations/20260408011955_fix_rls_security_lints.sql` (lines 49–60)

The `"Anyone can look up promoter codes for validation"` SELECT policy with `USING (true)` lets any anon or authenticated client retrieve all rows from `promoter_links` without a WHERE clause. Clients can enumerate all promoter codes, names, and stats for all events across all orgs.

**Suggested fix:** Remove the `USING (true)` policy. Create a `SECURITY DEFINER` function (e.g., `check_promoter_code(p_event_id uuid, p_code text) RETURNS boolean`) that does an exact-match lookup and returns only a boolean. Grant EXECUTE to anon via a tight RPC policy. Update `useCheckout.ts` to call the RPC instead of querying the table directly.

**Deferred because:** The exposed data is non-PII (promoter codes and names, no financial/personal data). In practice all queries include `event_id + promoter_code` exact-match WHERE clauses. The proper fix is a new migration + checkout code update that should be done in a dedicated DB security hardening PR.

---

### MemberRoleContext: pre-warm `useOrgData(null)` cache key mismatch

**File:** `apps/mobile/contexts/MemberRoleContext.tsx` (lines 43–48)

When `selectedOrgId` is null on first render, `useOrgData(null)` is called which caches under `["org-data", userId, null]`. When the org resolves and `selectedOrgId` becomes non-null, `useOrgData(orgId)` uses a different key `["org-data", userId, orgId]` — the null-keyed entry is orphaned. Consumers that call `useOrgData()` (no args) use yet another key path (falls back to oldest membership). This is intentional per the code comment ("falls back to oldest membership — same as calling useOrgData() with no arg") but creates 2+ cache entries for what is effectively the same data.

**Suggested fix:** Once `effectiveOrgId` resolves to a non-null value, ensure all callers (including the pre-warm in MemberRoleProvider) use `useOrgData(effectiveOrgId)` consistently so there is only one cache entry. Consider exposing `effectiveOrgId` via context and updating all consumers to pass it explicitly.

**Deferred because:** Intentional design documented in code. The current behavior is a minor inefficiency (extra network request on first load), not a data correctness bug.

---

### `organizations.stripe_account_id` missing UNIQUE constraint

**File:** `supabase/migrations/20260128000000_baseline.sql` (line 4180)

The `stripe_account_id` column on the `organizations` table only has a btree index for performance (`idx_organizations_stripe_account_id`), no UNIQUE constraint. The webhook handler (`handleAccountUpdated`) and connect onboarding routes assume a 1:1 relationship between Stripe Connect account IDs and organizations. If two orgs somehow ended up with the same `stripe_account_id`, a `.maybeSingle()` or `.single()` query on that column would error (multiple rows), and `account.updated` webhooks would fail permanently for both orgs.

**Suggested fix:** Add `ALTER TABLE organizations ADD CONSTRAINT organizations_stripe_account_id_unique UNIQUE (stripe_account_id);` in a new migration, excluding NULL to allow orgs without a Stripe account (`WHERE stripe_account_id IS NOT NULL` — PostgreSQL partial unique index). This is a preventive integrity constraint, not a code fix.

**Deferred because:** No known duplicate exists in production data. The application-layer logic (single onboarding flow per org) prevents duplicates in practice. Fixing requires a DB migration with careful handling of NULL values.

---

### `handleAccountUpdated`: use live Stripe API state instead of payload to guard against out-of-order delivery

**File:** `apps/web/app/api/webhooks/stripe/route.ts` — `handleAccountUpdated`

Stripe webhooks can be delivered out of order. The current handler uses `account.charges_enabled` / `account.payouts_enabled` directly from the event payload. If Stripe delivers an older `account.updated` event after a newer one has already updated the DB, the handler would overwrite the correct newer state with the stale payload values (the idempotency guard only skips when the payload matches the DB, not when the payload is older than what's already stored).

**Suggested fix:** After extracting `accountId`, call `stripe.accounts.retrieve(accountId)` to get the authoritative live account state, then use the retrieved object's `charges_enabled` / `payouts_enabled` for the comparison and DB update. This guarantees the DB always converges to the current Stripe state regardless of delivery order.

**Deferred because:** Out-of-order delivery is uncommon and self-correcting — any future `account.updated` event would overwrite the stale state with the correct one. The fix adds an extra Stripe API call (latency + rate-limit surface) and a new failure mode for a rare scenario. The current behavior is functionally correct for the common case.

---

### `sendRsvpApprovalEmail` missing production baseUrl guard

**File:** `apps/web/app/lib/email/rsvp-notifications.ts` — `sendRsvpApprovalEmail`

`sendTicketReadyEmail` has a guard that returns early if `getBaseUrl()` resolves to a localhost/127.0.0.1 URL in production (preventing broken CTA links). `sendRsvpApprovalEmail` does not have this guard. Of the four RSVP senders, only `generateApprovalEmailHtml` uses `baseUrl` (for the `${baseUrl}/account` CTA). `generateRejectionEmailHtml`, `generatePendingConfirmationEmailHtml`, and `generateOrganizerNotificationEmailHtml` do not construct any `baseUrl`-dependent URLs, so they are not affected.

**Suggested fix:** After `generateApprovalEmailHtml` is refactored to accept `baseUrl` as a parameter (see NITPICKS — a prerequisite), add the localhost guard in `sendRsvpApprovalEmail` and pass the validated `baseUrl` into `generateApprovalEmailHtml`.

**Deferred because:** `NEXT_PUBLIC_APP_URL` must be correctly set for the app to work in production at all (Stripe webhooks, OAuth redirects, etc.). A misconfiguration here would surface in many other places first.

---

### Sign in with Apple — Server-to-Server Notification webhook

**Context:** Added Sign in with Apple in Apr 17, 2026 (APRIL_2026_FIXES.md #106). Apple offers an optional server-to-server notification endpoint that fires on SIWA revocation events (user turns off "Hide My Email" forwarding, revokes SIWA for Flame, permanently deletes their Apple Account).

**Current state:** The endpoint field in Apple Developer Portal (Services ID → Sign In with Apple → Configure) is left blank. Not required by App Store Review. Clerk does not need this to handle SIWA sign-ins.

**Suggested future work:** Build `/api/webhooks/apple-signin` on the web app that verifies Apple's signed JWT, extracts the event type, and for `account_delete` events calls `clerkClient.users.deleteUser()` on the matching user — symmetric with the manual account-delete flow. For `consent_revoked` events, optionally send the user a "your Apple Sign-In was revoked; please re-link or delete your account" email.

**Deferred because:** Not required for compliance. Adds a nontrivial webhook endpoint with Apple JWT verification complexity. Lower impact than the current Delete Account flow, which is the primary deletion path users will use.

---

### Tie `DELETE /api/upload-image` authorization to the stored image path (legacy slug-folder files)

**Context:** `apps/web/app/api/upload-image/route.ts` — DELETE handler.

`DELETE /api/upload-image?path=events/{identifier}/{filename}` currently authorizes deletion by looking up an event with that identifier (UUID or slug) scoped to the caller's `organization_id IN orgIds`. That proves the caller owns *an event with that identifier*, but for **legacy `events/{slug}/...` folders** it does not prove the specific file being deleted belongs to their event — pre-UUID-switch, two orgs that shared a slug could both have written into `events/{slug}/...`, so a legitimately-authorized caller from OrgA could pass a path that points at OrgB's file inside the shared folder.

**Why this is deferred (not fixed now):**

1. `DELETE /api/upload-image` has **zero live callers** — grep-verified. It's only POSTed from `CreateEventForm.tsx`, `OrgEventDetailClient.tsx`, `create-event.tsx` (mobile), and `EditEventDetailsTab.tsx` (mobile). No client ever calls DELETE, so there is no live attack surface today.
2. The UUID branch (the path every new upload goes to) is **already strictly isolated** — event id is globally unique, so the folder cannot be shared across orgs.
3. Only ~20 historical events still live under `events/{slug}/...`, and all are expected to be naturally replaced by new uploads (which land under UUID folders) over time.

**Suggested fix when DELETE is wired up:** Validate that the `rawPath` matches the resolved event's `image_url` column before calling `supabaseAdmin.storage.from("event-images").remove([...])`. Parse the storage path out of `events.image_url` (via the existing `extractStoragePath` helper in `apps/web/app/lib/utils/image-upload.client.ts`), compare to the incoming path, and reject with 403 if they don't match. This ties delete authorization to the specific file the event *points to*, not just the folder it lives in.

---

### Add `country` column to `events` table for SEO geo-targeting

**Context:** Global SEO rewrite in APRIL_2026_FIXES.md #126 removed the hardcoded `addressCountry: "EC"` from `generateEventSchema()` in `apps/web/app/lib/seo-config.ts`. The JSON-LD `PostalAddress` now spreads `event.country` when present and omits it otherwise.

**Current state:** Events have `city` and `venue` but no `country`. Google currently infers country from `addressLocality` — works OK for well-known cities, weaker signal overall. No regression from today, since today's hardcoded `"EC"` would be wrong for any non-Ecuadorian event anyway.

**Suggested fix:**

1. Add `country` `char(2)` column to `events` (ISO 3166-1 alpha-2, e.g. `"EC"`, `"CO"`, `"MX"`). Default null so existing rows don't silently inherit "EC".
2. Add a country picker (or derive from a Google Places lookup already in `CreateEventForm.tsx` / `create-event.tsx` mobile) to both the web and mobile event-create flows.
3. Backfill existing rows — all current events are in Ecuador, so a one-shot `UPDATE events SET country = 'EC' WHERE country IS NULL` migration is safe.
4. Include `country` in the event `select(...)` in `apps/web/app/events/[slug]/page.tsx`'s `getEventBySlug` so `generateEventSchema(event)` receives it.

**Deferred because:** Schema.org treats `addressCountry` as optional; Google's event rich-results panel still renders without it. The global SEO rewrite needed to ship today without waiting on a migration + dual-platform form edit. Revisit when we actually publish the first non-Ecuador event.

**Tracked in:** `APRIL_2026_FIXES.md` entry #116 (DELETE backward compatibility paragraph, updated in #119).

---

### 92. Mobile auth — "No sign up was found with id sua_*" after in-session account deletion + immediate re-signup (Apr 21, 2026)

**Context:** APRIL_2026_FIXES.md #127.2 fixed the common stale-`sua_*` trigger (abandoned SSO name-collection) via `resetClerkSignUp()` in three call sites: `cancelSSONameCollection`, `runSSOFlow` incomplete branch, and defensively at the top of `onEmailSignUp`. That fix covers ~99% of real-world hits.

**Reproduction steps:**

1. Sign up with email/password (or SSO) → account created, session active.
2. Open Settings → **Delete Account** → confirms deletion, signs out.
3. **Without closing/backgrounding the app**, tap "Sign up" and create a new account with any credentials.
4. Clerk rejects with `[auth] email_signup password error [e: No sign up was found with id sua_*]`. User is stuck until they force-quit and reopen the app.

**Root cause:** Clerk's client retains the last successful `sua_*` id in `client.signUp` state after the server-side account destruction. Our defensive `resetClerkSignUp(signUp)` at the start of `onEmailSignUp` calls `signUp.__internal_future.reset()`, but in this specific scenario the reset appears not to be clearing the id that `signUp.password()` then picks up on its next PATCH. This may be because `useSignUp()`'s hook reference is stale relative to the underlying `Clerk.client.signUp` after `user.delete()` invalidates the session. Needs investigation.

**Suggested fix (when picked up):**

1. Reproduce locally and log what `signUp.id` is at each stage (pre-delete, post-delete, post-reset).
2. Try calling `useClerk().client.signUp.reset()` (legacy top-level API) in addition to `signUp.__internal_future.reset()` — the legacy path may reset deeper state the Future API reset skips.
3. If that fails, catch `resource_not_found` / `No sign up was found` in `onEmailSignUp`'s `getClerkErrorMessage` branch, force a full `Clerk.client.clearCache()` (or equivalent), and retry `signUp.password()` once. Avoid blind retries — cap at 1.
4. Add a post-`user.delete()` cleanup hook in whatever component owns the Delete Account UI: explicitly call `resetClerkSignUp()` right after `user.delete()` resolves, so the next signUp starts from a known-clean client.
5. Consider telemetry — log every hit of this code path so we know if it's truly rare before investing further.

**Deferred because:** Delete-then-immediately-re-signup in the same app session is an extremely rare user flow (most users who delete don't immediately re-register, and those who do typically close the app first). Force-quit + relaunch is a working user-facing workaround. The fix in #127.2 covers the common case (abandoned SSO → email signup), which is the path App Store reviewers would hit on a fresh install.

**Related:** `APRIL_2026_FIXES.md` #127.2 (the parent fix and the `resetClerkSignUp` helper).

## April 2026 PR Review — Registration Form / Tier Cap (Apr 22, 2026)

### `apps/web/app/api/ticket-tiers/route.ts` (lines 234–254) — Per-event tier cap enforcement is racy under concurrent requests

The current check reads `COUNT(ticket_tiers WHERE event_id = ...)` and then inserts in a separate statement. Two concurrent requests could both read `count = 9`, both pass the `< 10` check, and both insert — resulting in 11 tiers.

**Reproduction steps:**
1. Set up an event that already has 9 tiers (one below the cap).
2. Fire two concurrent `POST /api/ticket-tiers` requests with the same `event_id` and valid organizer auth — e.g. via `curl` in two terminal tabs simultaneously, or with `ab -n 2 -c 2` / Locust with concurrency 2.
3. Both requests hit line 234 (`SELECT COUNT(*) ... WHERE event_id = ?`) before either insert completes — both see `count = 9`, both pass the `< 10` guard, both insert.
4. **Expected:** second request returns 400 "Maximum 10 tiers allowed". **Actual:** two rows inserted, event ends up with 11 tiers.
5. To reproduce deterministically in a test: add a short `await new Promise(r => setTimeout(r, 50))` between the count check (line 247) and the insert to widen the race window, then fire two parallel requests.

**DB artifacts to inspect:** `SELECT COUNT(*) FROM ticket_tiers WHERE event_id = '<id>'` — should be 10, will be 11. Server logs will show both requests returning 200.

**Suggested fix:** Move the count-and-insert into a single DB transaction with row-level locking (e.g. `SELECT ... FOR UPDATE` on the event row), or add a DB trigger/constraint that enforces `MAX_TICKET_TIERS_PER_EVENT = 10` and surfaces a distinct error the API can map to a 400 response.

**Deferral reason:** Requires DB migration. Race requires two perfectly timed concurrent requests for the same event from the same organizer — very low likelihood in practice. Current application-level check handles the common case correctly.

---

**Edge Case: TOCTOU race on `quantity_reserved` check in `PUT /api/ticket-tiers` (Apr 22, 2026)**

**File:** `apps/web/app/api/ticket-tiers/route.ts` (~line 469)

**Scenario:** The quantity-reduction guard reads `quantity_reserved` (holds + pending RSVPs) in a separate query before the `UPDATE` statement. A concurrent RSVP approval or new hold between these two steps could cause the guard to pass even though the new `quantity_total` would be below the true `sold + reserved` floor.

**Reproduction steps:**
1. Set up a tier with `sold=0, reserved=5, total=10`.
2. Organizer sends `PATCH quantity_total=5` (passes guard: `minAllowedQty=5`, `5 >= 5`).
3. Concurrently, a 6th RSVP is approved, raising `reserved=6`.
4. The `UPDATE` runs and sets `total=5` with `reserved=6` — the DB CHECK constraint `quantity_total_gte_quantity_sold` only covers `sold` and will not fire here (sold is still 0). The tier now has `total=5, reserved=6`.
5. When the 6th RSVP approval later converts `reserved → sold`, `increment_tier_quantity_sold` will attempt `sold=1` against `total=5` — that succeeds. But if all 6 eventually approve, `sold=6 > total=5` → DB CHECK fails and the approval errors silently.

**Suggested fix:** Move the reserved check into a DB RPC or Postgres transaction that atomically reads `held + rsvp` quantities and validates `new_quantity_total >= sold + reserved` before committing the update.

**Deferral reason:** Requires a DB migration and new RPC. The race window is narrow (concurrent RSVP approval + organizer capacity edit at the same instant) and the consequence (approval failure later) has a manual recovery path (increase capacity). The current pre-check provides meaningful protection for the overwhelming majority of cases.

---

**Edge Case: Fully orphaned authorized PaymentIntent — no RSVP row ever created (May 26, 2026)**

**File:** `apps/web/app/api/cron/monitor-payment-authorizations/route.ts`

**Scenario:** The mobile and web RSVP paid flow creates the Stripe PaymentIntent (manual capture) BEFORE the RSVP row exists. The link from PI to RSVP only happens after the client calls `POST /api/rsvp` post-authorization. If that client call never runs (app crash, network failure, user abandons after 3DS), the PI sits in `requires_capture` with NO matching `rsvps.stripe_payment_intent_id` row — fully orphaned. The customer sees a pending hold on their card for up to 7 days (Stripe's auto-expire window) with no ticket and no support visibility.

**Confirmed occurrence:** Amalia Lertora, `pi_3TYuHd1CwyzKTQCT1huajQoD`, May 19 2026 — sat in `requires_capture` for 6+ days until manually canceled in the Stripe dashboard. See `MAY_2026_FIXES.md` #19 for full context.

**Why the current webhook can't fix it directly:** `handlePaymentIntentAmountCapturableUpdated` fires the moment Stripe authorizes the card. At that exact moment, the client may still be in flight to `/api/rsvp` (audit data shows webhook fires in the same millisecond as RSVP row creation for healthy purchases). Immediate auto-cancel from the webhook would race-cancel legitimate purchases. The webhook now logs `error_type: "potentially_orphaned_authorized_payment_intent"` to `order_errors` so ops has visibility, but the cleanup itself has to be deferred.

**Why the current cron doesn't catch it:** `monitor-payment-authorizations` queries the `rsvps` table to find expiring authorizations. If no RSVP row was ever created, the cron never sees the orphaned PI.

**Suggested fix:** Extend `monitor-payment-authorizations` cron with a second sweep that uses `stripe.paymentIntents.list({ created: { lte: now - 30min } })` filtered to platform-account PIs in `requires_capture`. For each PI returned, check (a) no matching `rsvps.stripe_payment_intent_id` row, (b) no matching `holds.order_id` / hold row by PI metadata, and (c) PI metadata has no `rsvpId` or `holdId`. If all three are true and the PI is older than the safe threshold (30 minutes), cancel via `stripe.paymentIntents.cancel(id, { cancellation_reason: "abandoned" })` and update the matching `order_errors` row to `severity: "resolved"` (or insert a new resolution row). Use Stripe `list` pagination and a Stripe-side filter on `created` to bound the work per run.

**Alternative:** Switch the flow so the RSVP row is created BEFORE the PaymentIntent (the way `holds` work for direct purchase). This eliminates the race entirely because the webhook can always find an RSVP by `stripe_payment_intent_id`. Requires schema work (RSVP must allow `pending` state without a confirmed PI, which the existing `pending` status already supports) and refactoring both web `RsvpPaymentModal` and mobile `useCheckout` to create the RSVP first.

**Deferral reason:** Stripe's 7-day auto-expire is a working (if poor-UX) safety net. The webhook now logs an `order_errors` row at the moment of orphan detection so ops can manually cancel via Stripe dashboard until the cron sweep is built. Estimated frequency: very low (1 confirmed case across multiple months of production traffic).

---

**Edge Case: RSVP PaymentIntent not cancelled when mobile `resetCheckout` fires (May 27, 2026)**

**File:** `apps/mobile/hooks/useCheckout.ts` → `resetCheckout`

**Scenario:** In the RSVP paid flow, the PI is created before the RSVP row. When the user closes the checkout sheet (triggering `resetCheckout`), holds are cancelled via `POST /api/holds/cancel`, but `activeRsvpPiRef.current` is silently cleared to `null` without cancelling the PI. On the user's next checkout attempt (same or different session), one of two things happens: (a) if `activeRsvpPiRef` was preserved they'd send `oldPaymentIntentId` and the server cancels the old PI before creating a new one — but because the ref was cleared, it's skipped; (b) the orphaned PI sits in `requires_capture` until it expires.

**Already mitigated:** The `promoterSuffix` fix (MAY_2026_FIXES.md #25) prevents the immediate Stripe idempotency error that surfaced this, and the `monitor-payment-authorizations` cron + the "fully orphaned PI" sweep proposed above provide backend safety nets. Frequency is low because most users complete checkout in one attempt.

**Suggested fix:** In `resetCheckout`, if `activeRsvpPiRef.current` is set, fire-and-forget a `POST /api/rsvp` cancel call (or a dedicated `POST /api/purchase/cancel-payment-intent` endpoint) passing the PI ID, mirroring exactly how holds are cancelled. Clear the ref after scheduling the cancel, not before. This ensures clean slate without orphaned authorizations.

---

**Edge Case: `fetchEventPurchases` un-paginated — single event >1000 orders undercounts on web (Jun 9, 2026)**

**File:** `apps/web/app/lib/utils/purchase-data.ts` → `fetchEventPurchases`

**Scenario:** PostgREST caps every response at 1000 rows by default. `fetchEventPurchases` does a single un-paged `.select()` filtered by `event_id`. Today every event is well under 1000 orders, so it's fine — and it's what both the web event-detail page and the web org dashboard (`enrichEventWithStats`, per event) rely on. But once a single event crosses ~1000 qualifying orders (`status IN (completed, paid)`, not bank_transfer), the response silently truncates and that event's revenue + attendee list undercount everywhere on web.

**Context / why surfaced now:** The mobile org-dashboard equivalent had this exact bug at the **org** level (Hush Experiences, 1,044 orders org-wide → HUSH WHITE PARTY revenue read $8,390 instead of $10,060). Fixed mobile-side by paginating the org-wide query in `useOrgDashboardStats.ts` (JUNE_2026_FIXES.md #3). The web per-event path has the same latent cap one level down.

**Suggested fix:** Paginate `fetchEventPurchases` with `.order("id", { ascending: true })` + `.range(from, from + 999)` in a loop until a short page returns (same pattern used in `useOrgDashboardStats.ts`). Keep the per-row Zod validation + stage-lookup logic unchanged; just accumulate across pages before building `purchases`.

**Deferral reason:** No event is anywhere near 1000 orders yet (largest is ~300). Pure pre-emptive hardening — schedule before any single event is expected to cross ~1000 orders (e.g. a large GA show).

**Edge Case: promoted `role='admin'` persists after removal from `SUPPORT_ADMIN_EMAILS` (W7-H1, Jun 22, 2026)**

**Files:** `apps/web/app/api/admin/_lib.ts` (`requireSupportAdmin` promotes to `role='admin'` on first hit) → interacts with `apps/web/app/api/events/route.ts` ≈385 (`supabaseUser.role !== "admin"` exempts admins from the org-approval gate).

**Scenario:** `requireSupportAdmin` permanently sets `users.role='admin'` the first time an allowlisted email hits an admin route. If that email is later removed from `SUPPORT_ADMIN_EMAILS`, the DB role stays `admin`, so the user keeps the event-creation bypass (can create events for an org without it being approved). Note the bypass still requires the user to be a `membership` of that org (events/route.ts ≈374), so it is not a blanket capability.

**Deferral reason:** No concrete scenario today — the allowlist is a single permanent support account (`support@flme.co`); this only bites when off-boarding a previously-promoted admin. CodeRabbit's suggested fix (call `requireSupportAdmin` inside event creation) wrongly couples the *general* `admin` role to the *support* allowlist — `admin` is a platform role that may be granted by other means later. 

**Suggested fix (when needed):** Add an admin-offboarding step that demotes `role` back to `organizer`/`user` when an email is removed from the allowlist (a small maintenance script or a reconcile on the next `requireSupportAdmin` miss), rather than re-checking the support allowlist inside unrelated endpoints.

**Edge Case: cohost revenue enrichment is an N+1 `fetchEventPurchases` fan-out (Jul 1, 2026)**

**File:** `apps/web/app/api/organizer/data/route.ts` ≈451–486 (cohost enrichment `Promise.all`). **Same pattern also now in `apps/web/app/organizer/page.tsx` ≈265–298** — the SSR first-paint cohost enrichment added in JULY_2026_FIXES.md #9 mirrors the API route's per-event `fetchEventPurchases` fan-out (so first paint matches the poll). Both should be batched together by the same shared helper.

**Scenario:** Cohost `totalRevenue` is computed by calling `fetchEventPurchases(supabaseAdmin, entry.event.id)` once per cohosted event inside a `Promise.all`. That's N orders queries (plus a per-call ticket-stages query) for N cohosted events. A batched path — one `.in("event_id", cohostEventIdList)` orders fetch grouped by `event_id` — would collapse it to a constant number of queries, matching the already-batched RSVP-counts pattern right above it.

**Deferral reason:** (1) The **owner** path has the identical shape — `enrichEventWithStats` (line ≈500/611) also calls `fetchEventPurchases` per event inside a `Promise.all`. Fixing only the cohost branch would leave the two inconsistent; they should be batched together. (2) The calls run in parallel, so wall-clock latency is ~1 round-trip, and cohost counts per org are small today (single digits). (3) **Correctness risk:** a naive DB-side `SUM`/RPC can't replicate `fetchEventPurchases`'s per-order base-price logic (`base_price_cents` when present, else `extractBasePriceHistorical` + proportional discount for legacy Datafast orders). Any batched replacement MUST reuse that shared logic, or it will diverge from the cohost detail view and the owner cards (the exact pricing-helper footgun class in `project-flame-master.mdc` §5).

**Suggested fix (when needed):** Add a batched `fetchEventPurchasesForEvents(supabaseAdmin, eventIds)` in `apps/web/app/lib/utils/purchase-data.ts` that does a single `.in("event_id", …)` orders query + a single stages query, then groups per `event_id` reusing the existing per-order base-price computation. Switch the owner (`enrichEventWithStats`), the API cohost enrichment, AND the SSR cohost enrichment (`organizer/page.tsx`) paths to it so all three stay consistent and keep the shared calc.

---

## Bounded regression test for stalled response bodies (`apps/mobile/lib/api.ts`)

**Deferred from:** CodeRabbit review of W7-H5 (Sep 6, 2026). See `docs/fixes/SEPTEMBER_2026_FIXES.md` #1.

**What was fixed in code:** `clearTimeout(timeoutId)` used to run before `response.json()`, leaving body parsing unbounded — a response whose headers arrived but whose body stalled would hang forever rather than time out. The abort timer now stays armed through parsing in both `executeRequest` and `executeUpload`.

**What is deferred:** the reviewer also asked for a regression test covering delayed JSON-body delivery.

**Deferral reason:** `apps/mobile` has **no test infrastructure at all** — no test runner in `package.json`, no `__tests__` directory, zero `.test.ts*` files anywhere in the app. (`packages/lib` does have tests; the mobile app does not.) Adding this one test means first standing up a harness for the app, which is a separate piece of work and was not appropriate to start mid-incident.

**Suggested fix (when needed):** Stand up Jest + `jest-expo` for `apps/mobile`, then test `executeRequest` against a mocked `fetch` that resolves headers immediately and returns a `json()` promise which never settles. Assert the call rejects with `ApiError` code `0` and the "timed out" message within `timeoutMs`, rather than hanging. Cover `executeUpload` with the same shape ("Upload timed out"). Would also give the `LONG_MUTATION_TIMEOUT_MS` vs server `maxDuration` relationship a place to be asserted.

---

## Superseded PaymentIntent is not cancelled when amount-driving inputs change

**Deferred from:** CodeRabbit review of W7-H6 (Sep 6, 2026). See `docs/fixes/SEPTEMBER_2026_FIXES.md` #3.

**The gap.** `POST /api/purchase/create-payment-intent` keys new-RSVP PaymentIntents on `create_pi_rsvp_new_${userId}_${eventId}_${ticketTierId}_${quantity}_${stage}_${clientKey}_${totalAmountCents}_...`. W7-H6 added `totalAmountCents` so a mid-checkout price edit mints a fresh key instead of returning Stripe's 400. But the **previous** PaymentIntent is not cancelled — if the buyer had already confirmed it, their authorization keeps holding funds with nothing attached to it.

**Not a regression.** Before W7-H6 the same orphan existed; the request simply 400'd on top of it, so the buyer was blocked *and* the hold remained. The change removed the block, not the orphan. An uncaptured authorization still auto-expires within 7 days.

**Why it was not fixed in that PR.** The route already has the machinery — it accepts `oldPaymentIntentId`, strips `holdId` from its metadata, and cancels it (≈ lines 934–961), used today when applying a promo code. What is missing is the **client** passing that id when the amount changes. The `create_pi_rsvp_new_*` path has no `rsvpId` and no DB row yet, so the server cannot discover the prior PaymentIntent on its own. (The `rsvpId` path is already covered by the `cancel_orphan_${rsvpId}_*` logic ≈ line 880.)

Wiring it needs changes to the payment modal on **web and mobile**, plus an OTA. Shipping only the server half — refusing to create a replacement unless cancellation succeeds — would break checkout for every client that does not yet send the id.

**Suggested fix (when scheduled):**
1. Have the payment modal retain the last `paymentIntentId` it received and send it as `oldPaymentIntentId` on any re-request.
2. In the route, when `oldPaymentIntentId` is present and differs from the intent about to be created, cancel it first; if it is not in a cancellable state, log and continue (do **not** block checkout on it).
3. Consider requiring successful cancellation only once both clients are known to send the id.

---

## `createOrder` silently falls back to USD if the events currency lookup fails

**Deferred from:** CodeRabbit review of the Spain/EUR PR (Oct 15, 2026). See `docs/fixes/OCTOBER_2026_FIXES.md` #1.

**File:** `apps/web/app/lib/orders.ts` — `orderCurrency` resolution just before the `orders` insert.

**The gap.** When `paymentInfo.currency` is missing, `createOrder` reads `events.currency` and falls back to `"USD"` without checking the query `error`. A transient Supabase error would record a non-USD order as USD (the bug class fixed in that PR).

**Why deferred.** Unreachable today — every caller passes a currency: the Stripe webhook hold and RSVP paths (`paymentIntent.currency`) and the free RSVP approve path (`rsvp.events.currency`).

**Suggested fix (if a caller ever omits currency):** destructure `error` from the lookup; on error, log and `return false` before inserting. Keep the `"USD"` fallback only for a successful lookup with a null currency.

**Note:** `return false` only prevents the mislabeled order — it does **not** trigger a Stripe retry. The webhook's hold and RSVP callers log a critical `order_errors` row and `return` normally (the webhook responds 200), so the captured payment is left without an order and needs manual resolution from `order_errors`.

---

## Orders sold on manually-closed tiers before the hold-path sold-out guard

**Deferred from:** hold-path `is_manually_sold_out` fix (Oct 16, 2026). See `docs/fixes/OCTOBER_2026_FIXES.md` #2.

**What happened.** Before migration `20261017014559_hold_respect_manual_sold_out.sql`, `/api/holds/create` and `atomic_create_hold_with_stage_validation` ignored the organizer "mark as sold out" flag, so direct-purchase (hold-path) buyers could still pay on a closed tier. The guard is now live; these orders predate it.

**Hold-path orders paid after the tier was closed** (as of Oct 17, 2026):

| Event | Tier | Orders | Tickets | Closed at (UTC) | Orders between (UTC) |
|---|---|---|---|---|---|
| Atrio - Sinners Club | Tier 1 | 2 | 2 | Sep 30 13:42 | Oct 16 20:31 – 20:39 |
| BLOOM EXP | TIER 2 | 5 | 12 | Oct 6 02:48 | Oct 10 01:18 – Oct 11 03:00 |
| BLOOM EXP | VIP 2 | 1 | 2 | Oct 6 02:49 | Oct 11 00:34 |
| ZULU: INDEPENDENCE WEEKEND | 3x2 | 1 | 1 | Oct 2 01:44 | Oct 10 21:53 |
| SONORA 5.0 | TIER 2 | 4 | 7 | Sep 26 19:02 | Sep 26 22:01 – Sep 27 00:39 |

**Decision needed (organizers, not engineering):** honor these tickets or refund them. **Nothing has been refunded or changed.** If a refund is chosen, refund through Stripe and void the tickets through the normal refund flow — do not edit `orders` directly.

**Recorded, no action — RSVP-source orders after close (28 orders).** `source = 'rsvp'` orders paid on tiers after they closed: ABOVE THE CITY / EARLY BIRD (14), 3 DAY BUNDLE / Tier 1 (8) and Early Birds (1), 2 DAY PASS / Early Birds (2), EUPHORIA / EARLY BIRDS (2) and TIER 1 (1). All were created within minutes of the close, consistent with RSVPs approved/paid for requests made before it — expected under the "approved/pending RSVPs are unaffected" rule (W7-H4 gates RSVP *creation* only).

**Excluded — organizer bank transfers (33 orders).** Orders with `source IS NULL` on the same tiers are all `payment_method = 'bank_transfer'` (no Stripe PaymentIntent) — organizer-issued, which is allowed on closed tiers by design.

**Rerun query.** Only tiers with `sold_out_changed_at` after the Aug 27, 2026 review carry an exact close time (earlier flagged tiers were seeded to the review date — see `AUGUST_2026_FIXES.md`):

```sql
select e.name as event, t.name as tier, o.source, count(*) as orders,
       sum(o.quantity) as tickets, min(o.created_at) as first_order,
       max(o.created_at) as last_order, t.sold_out_changed_at
from orders o
join ticket_tiers t on t.id = o.ticket_tier_id
join events e on e.id = o.event_id
where t.is_manually_sold_out = true
  and t.sold_out_changed_at > '2026-08-28'
  and o.created_at > t.sold_out_changed_at
  and o.status in ('paid', 'completed')
group by e.name, t.name, o.source, t.sold_out_changed_at
order by o.source, e.name, t.name;
```

Filter `o.source = 'hold'` for the actionable set. Note a tier can be reopened and re-closed, in which case `sold_out_changed_at` only reflects the latest close — check the organizer's timeline before refunding.
