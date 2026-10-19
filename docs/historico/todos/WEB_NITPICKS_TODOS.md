# Web Nitpicks TODO List — Phase 9 Design (Mar 12, 2026)

Deferred nitpicks from **Phase 9 Web Design** PR reviews only. For other web or mobile nitpicks, see `NITPICKS_TODOS.md`.

---

## PR Review — Multi-Currency Update (Mar 16, 2026)

### ~~`apps/web/app/components/AdminDashboard.tsx` (lines 134–135) — formatCurrency cents convention~~ ✅ Fixed (MARCH_DESIGN_WEB_UPDATES.md #129)

Also fixed companion bug: `admin/page.tsx` was querying non-existent `price` column (should be `price_cents`), causing `totalRevenue` to always be 0.

### `apps/web/app/lib/email/ticket-notifications.ts` (lines 238–243) — formatCentsAsPrice for PDF/email

The local `formatPrice` in `generateTicketsPDF` and the similar `Intl.NumberFormat` usage in `generateTicketEmailHtml` should be replaced with `formatCentsAsPrice` from `@project-flame/lib`: import `formatCentsAsPrice`, remove local implementation, and call `formatCentsAsPrice(cents, data.currency ?? "USD")` wherever prices are formatted so amounts stay in cents and follow the project's pricing convention. Update both `generateTicketsPDF` and `generateTicketEmailHtml`.

---

## PR Review — Phase 9 Web Design (Mar 12, 2026)

### ~~Design system violations (EventsCatalog, HomeContent)~~ ✅ Fixed (MARCH_DESIGN_WEB_UPDATES.md #49)

The following were design system violations per PR review guide — **fixed in current session**, not nitpicks:
- Inline SVG → react-icons (EventsCatalog EventListCard, SearchHero; HomeContent HomeFeedEventCard, SearchHero, FeaturedEventsCta)
- Raw `<img>` → next/image (EventsCatalog, HomeContent)
- Inline `style={{ marginTop: 50 }}` → `mt-[50px]` (EventsCatalog)
- Gradient hardcoded `#08131A` → `to-surface` (HomeContent)
- Inline `style={{ aspectRatio }}` → `aspect-square` (HomeContent)

**Note:** Search input `bg-[#F6F6F6]` and `text-[#5D5D5D]` remain — no Flame token exists for light search input. Per triage: "hardcoded hex where token exists" only.

### `apps/web/app/components/HomeContent.tsx` (lines 403–418) — Memoize filteredEvents

Wrap the computed `filteredEvents` in `useMemo` to avoid recomputing on every render for large `initialEvents` arrays. Dependencies: `[initialEvents, selectedCity, searchQuery]`. Preserve the same filtering logic (selectedCity, searchQuery against name/venue/city).

### `docs/historico/fixes/` — Changelog filename consolidation

The file `MARCH_DESIGN_WEB_UPDATES.md` does not follow the project convention `docs/historico/fixes/<MONTH>_<YEAR>_FIXES.md`. Consider renaming or migrating contents to `MARCH_2026_FIXES.md` (or add a pointer/redirect) so the canonical monthly fixes log uses the standard pattern. Update internal references accordingly.

### `apps/web/app/components/EventsCatalog.tsx` — Split into subcomponents

EventsCatalog is large and mixes concerns. Extract: (1) **EventsHero** — hero/search UI (searchQuery, setSearchQuery); (2) **FilterPills** — city/organizer chips and filter visibility (cities, organizers, selectedCity, selectedOrganizer, setters); (3) **EventsList** — list rendering (filteredEvents, EventListCard). Keep filtering logic in EventsCatalog and pass derived data/setters as props.

### `apps/web/app/components/discover/DiscoverContent.tsx` — Remove unnecessary "use client"

Remove the "use client" directive so DiscoverContent becomes a server component. Ensure all child components that need client behavior (HeroCarousel, HostBanner, FAQSection) remain client components. Verify props (upcomingEvents, featuredEvents, etc.) are serializable.

### `apps/web/app/components/discover/PartnerLogos.tsx` — Remove "use client"

PartnerLogos uses no hooks or browser APIs; remove "use client" to make it a server component. Verify next/image works in server context.

### `apps/web/app/components/discover/SpotlightCard.tsx` — Remove "use client"

SpotlightCard has no hooks or event handlers (only `new Date()` for isToday); remove "use client" to make it a server component.

### `apps/web/app/components/ExploreOrganizers.tsx` — Remove "use client"

ExploreOrganizers uses no hooks; remove "use client" to reduce client JS.

### `apps/web/app/components/discover/EventsSection.tsx`, `HeroCarousel.tsx` — FlameImage for remote images

Replace `next/image` with shared `FlameImage` for remote event images (source={{ uri: event.image_url }}). FlameImage is built on expo-image; web would need expo-image or a web-specific wrapper. See CRUCIAL_IOS_TO_WEB_TODOS.md #3.

### ~~`apps/web/app/components/discover/FAQSection.tsx` — Shared FAQ data~~ ✅ Fixed (Mar 12, 2026)

`faqs` moved to `@project-flame/lib`; both web and mobile now import from `@project-flame/lib` as single source of truth. See MARCH_2026_FIXES.md.

### `apps/web/app/discover/page.tsx` — Shared types instead of local interfaces

Replace local `DiscoverEvent` and `Organizer` interface declarations in `getDiscoverData` with types imported from `components/discover/types`. Map Supabase row types to UI types instead of force-casting with `as`.

### ~~`apps/web/app/components/EventDetail.tsx` — Stricter registrationData type~~ ✅ Fixed (MARCH_DESIGN_WEB_UPDATES.md #119)

Replaced `Record<string, any>` with `RegistrationData`; useState and all handler signatures updated.

### `apps/web/app/components/EventDetail.tsx` — Extract into sub-components

Component exceeds 100-line guideline (~1480 lines). Extract logical subcomponents: EventHero, EventMeta, TicketTierCard, QuantitySelector, PromoterCodeField, CheckoutCTA. Each extracted component should own its props/interfaces and have unit/visual tests where applicable. Update EventDetailProps and prop drilling to pass only necessary data. EventDetail becomes a thin orchestrator composing these components; preserve function names and identical behavior.

### `apps/web/app/components/EventDetail.tsx` — PR review nitpicks (Phase 9-5)

1. **lines 1246–1273 — maxQuantity IIFE:** Move `maxQuantity` computation out of inline IIFE; create `const maxQuantityForSelected = selectedTierData ? getMaxQuantityForTier(selectedTierData) : 1` before return, then replace IIFE block with JSX referencing `maxQuantityForSelected`.
2. ~~**lines 176–184 — validatePromoter catch block**~~ ✅ Fixed (MARCH_DESIGN_WEB_UPDATES.md #115): Catch now sets `"idle"` so transient errors allow retry.
3. ~~**line 3 — unused useRef**~~ Resolved: useRef is now used for `latestValidateTokenRef` (request-id guard).

---

## PR Review — Phase 9-5 Checkout & RSVP Design (Mar 16, 2026)

### `apps/web/app/rsvp/success/page.tsx` (line 1) — Extract "use client" to child component

The page declares `"use client"` at the top but only `RsvpSuccessContent` requires browser APIs (`useSearchParams`, `useEffect`, `useState`). Remove `"use client"` from `page.tsx` to keep it a server component and extract the client-only logic into a new file (e.g., `RsvpSuccessClient.tsx`) that exports the component with `"use client"`. Import and render it in `page.tsx`, optionally wrapped in `<Suspense>`, so the page stays server-side and streamable while the client component handles browser hooks.

### `apps/web/app/purchase/success/page.tsx` (lines 350–363) — Swap CTA priority

"View My Tickets" (`/account`) should be the primary action and "Browse More Events" (`/discover`) should be secondary. Swap their `className` styling: give `/account` the primary classes (`bg-white-100 text-dark rounded-pill px-6 py-4 font-poppins-semibold text-sm`) and `/discover` the secondary classes (`bg-transparent border border-white-30 text-white-100 rounded-pill px-6 py-3 font-poppins-medium text-sm`), or reorder the links in JSX so `/account` appears first for correct visual hierarchy and focus order.

### `apps/web/app/components/StripePurchaseFlow.tsx` + `apps/web/app/components/modals/RsvpPaymentModal.tsx` — Extract shared `stripeAppearance`

The `stripeAppearance` object (~60 lines) is duplicated nearly identically between the two files. Extract it to a shared constant (e.g., `apps/web/app/lib/stripe/stripe-appearance.ts`) and import it in both. Ensure `fontSizeBase: "16px"` is present in both (already aligned as of #505/#501).

### `apps/web/app/purchase/success/page.tsx` (line ~265) — "Ticket price" label when discount applied

The "Ticket price" breakdown row (inside the price summary IIFE) shows the post-discount amount but always labels it "Ticket price". When `hasDiscount` is true, change the label to "Discounted ticket price" so it reflects the value being shown. Reproduction: complete a purchase with a promo code applied — the row reads "Ticket price" but shows the reduced amount.

---

## P1–P5 Audit — Deferred to P9-7 (Organizer Dashboard scope, Mar 16, 2026)

~~The following components still use old CSS class names (`btn is--primary`, `btn is--secondary`, `btn is--danger`, `loading-spinner-small`, `rsvp-loading-*`) that are no longer defined.~~ ✅ All fixed (MARCH_DESIGN_WEB_UPDATES.md #232–#244)

**Files fixed:**
- ~~`apps/web/app/components/RsvpLoadingPage.tsx`~~ ✅ Fixed (#235)
- ~~`apps/web/app/components/RsvpManagement.tsx`~~ ✅ Fixed (P9-7 #206/#210)
- ~~`apps/web/app/components/QRScannerApp.tsx`~~ ✅ Fixed (#236)
- ~~`apps/web/app/components/forms/CreateEventForm.tsx`~~ ✅ Fixed (#219)
- ~~`apps/web/app/components/StripeConnectStatus.tsx`~~ ✅ Fixed (#232)
- ~~`apps/web/app/components/modals/EditTicketTierModal.tsx`~~ ✅ Fixed (#233)
- ~~`apps/web/app/components/organizer/TierInlineForm.tsx`~~ ✅ Fixed (#243)
- ~~`apps/web/app/components/organizer/RsvpsView.tsx`~~ ✅ Fixed (#210)
- ~~`apps/web/app/components/organizer/EventsTiersView.tsx`~~ ✅ Fixed (#244)
- ~~`apps/web/app/components/UserDashboard.tsx`~~ ✅ Fixed (P9-6)

**Note on `ConfirmationModal.tsx`:** Already fixed (MARCH_DESIGN_WEB_UPDATES.md #151) — it is used in P9-5 scope (EventDetail).
**Note on `LoadingSpinner.tsx`:** Already fixed (MARCH_DESIGN_WEB_UPDATES.md #150) — used in home page, purchase page, organizer loading page.
**Note on `AdminDashboard.tsx`:** Fixed (#237) — ghost classes + inline styles fully replaced with Tailwind.
**Note on `OnboardingModal.tsx`:** Fixed (#234) — ghost classes replaced with dark modal pattern.

---

## PR Review — P9 Fixes Batch (Mar 17, 2026)

### `apps/mobile/components/events/EventsHero.tsx` (line 5) — `DEFAULT_ORG_IMAGE` duplicated inline constant

`DEFAULT_ORG_IMAGE` is hardcoded in `EventsHero.tsx` and duplicated in other components. Extract to a shared exported constant (e.g., from a central constants module or `@project-flame/lib`) backed by a env/config variable so the URL is configurable. Update `EventsHero` and all other duplicating components to import the shared symbol.

### `apps/web/app/about-flame/page.tsx` (lines 12–20) — `proseClasses` duplicated across pages

`proseClasses` is defined locally in `about-flame/page.tsx` and also in `privacy-policy/page.tsx` and `purchase-terms/page.tsx`. Extract to a single exported constant (e.g., `PROSE_CLASSES`) in a shared module and replace all local definitions with an import.

### `apps/web/app/api/auth/sync-current-user/route.ts` (lines 36–37) — `DEFAULT_PROFILE_IMAGE_URL` duplicated

`DEFAULT_PROFILE_IMAGE_URL` literal is declared in both `sync-current-user/route.ts` and `webhooks/clerk/route.ts`. Move to a shared constant module (e.g., `lib/constants.ts` or `@project-flame/lib`) and import in both files.

### `apps/web/app/components/discover/EventsSection.tsx` (lines 38–50) — redundant IIFE for timezone

The IIFE that validated `tz` for the date badge has been replaced with a hoisted `const tz` variable (fixed in this PR). No further action needed — already resolved.

### `apps/web/app/components/ExploreOrganizers.tsx` (line 13) — `DEFAULT_ORG_IMAGE` hardcoded

`DEFAULT_ORG_IMAGE` in `ExploreOrganizers.tsx` duplicates the same string in `EventsHero.tsx` and elsewhere. Replace with a shared exported constant from `@project-flame/lib` (e.g., `DEFAULT_ORG_IMAGE` or `ORGANIZATION_DEFAULT_IMAGE`).

### `apps/web/app/components/forms/ContactForm.tsx` (lines 21–214) — component too large

`ContactForm` mixes UI and logic in one 214-line component. Extract: `validateContactForm` (pure validation helper), `ContactFields`, `SubjectSelect`, `MessageField`, and `SubmitStatus` sub-components. Keep `ContactForm` as the orchestrator with `contactMutation`.

### `apps/web/app/discover/page.tsx` (lines 16–49) — duplicate `DiscoverEvent` interface

A local `DiscoverEvent` interface is declared in `page.tsx` but a canonical version already exists in `apps/web/app/components/discover/types.ts`. Remove the local declaration and import the shared type.

### `apps/web/app/lib/date-utils.ts` — replace `formatDay`/`formatMonth` with shared helpers from `@project-flame/lib`

The local implementations of `formatDay` and `formatMonth` duplicate logic that exists in `@project-flame/lib`. Import and delegate to the shared helpers to avoid divergence.

### `apps/web/app/privacy-policy/page.tsx` (lines 16–277) — component too large

`PrivacyPolicyPage` at 277 lines mixes layout, toggle behavior, and full legal texts. Extract `LanguageToggle` (with `scrollToSection` + `language` state) and a reusable `LegalSection` component. Keep `PrivacyPolicyPage` under 100 lines composing `Navbar`, `LanguageToggle`, mapped `LegalSection` components, divider, and `Footer`.

### `apps/web/app/purchase-terms/page.tsx` (lines 6–14) — duplicated legal-page structure

`purchase-terms` and `privacy-policy` duplicate `proseClasses`, language toggle logic, and bilingual section scaffolding. Extract a reusable `LegalPage` shell component that accepts `title`, content slots, and `currentLanguage/onToggleLanguage`, and a shared `LEGAL_PROSE_CLASSES` constant.

### `apps/web/app/terms-of-use/page.tsx` (lines 1–23) — unnecessary `"use client"` on entire page

The page is fully `"use client"` but only the language toggle needs interactivity. Refactor: make `TermsOfUsePage` a Server Component rendering static legal content, and extract a small `LanguageToggle` (or `TermsToggle`) Client Component for the toggle + scroll. Alternatively replace `scrollToSection` with anchor links to eliminate the client requirement entirely.

---

## PR Review — P9 Fixes Batch 2 (Mar 17, 2026)

### `apps/web/app/api/webhooks/clerk/route.ts` (lines 68–69) — `DEFAULT_PROFILE_IMAGE_URL` hardcoded

The `DEFAULT_PROFILE_IMAGE_URL` string is declared locally in `route.ts`. The same string also appears in `sync-current-user/route.ts`. Move to a shared constant module (e.g., `lib/constants.ts`) and import in both files.

### `apps/web/app/components/forms/ContactForm.tsx` (lines 77–81) — missing structured error log in `onError`

The `onError` callback only calls `setSubmitMessage`. Add a structured `console.error` (or app logging utility) before it that includes the error object and an `action: "submitContactForm"` context field so failures are traceable.

### `apps/web/app/components/forms/ContactForm.tsx` (lines 21–216) — component too large (duplicate of previous entry)

See earlier entry in "PR Review — P9 Fixes Batch (Mar 17, 2026)" above for full decomposition plan.

---

## PR Review — Clerk Webhook + ContactForm + Docs Fixes (Mar 17, 2026)

### `apps/web/app/api/webhooks/clerk/route.ts` (line 68) — `DEFAULT_PROFILE_IMAGE_URL` still hardcoded after #561

The `DEFAULT_PROFILE_IMAGE_URL` constant remains hardcoded in `route.ts`. The same URL also appears in `sync-current-user/route.ts`. Move both to a shared constant (e.g., `lib/constants.ts` or an env-backed config module) and import in both files so the value stays in sync. Suggested: `export const DEFAULT_PROFILE_IMAGE_URL = process.env.DEFAULT_PROFILE_IMAGE_URL ?? "https://…/profile-images/default.jpg"`.

### `apps/web/app/components/EventsCatalog.tsx` (line 62) — inline timezone normalization should be a shared helper

The pattern `const raw = event.timezone?.trim() ?? ""; const tz = isValidIanaTimezone(raw) ? raw : DEFAULT_DISPLAY_TIMEZONE` appears in `EventsCatalog.tsx` and `HomeContent.tsx`. Extract to a `normalizeTimezone(raw?: string | null): string` helper exported from `@project-flame/lib` (or `apps/web/app/lib/date-utils.ts`). The helper should accept the raw timezone string and return a validated IANA timezone string, falling back to `DEFAULT_DISPLAY_TIMEZONE`. Replace all inline occurrences when touching these files.

### `apps/web/app/components/forms/ContactForm.tsx` (lines 21–216) — sub-component decomposition (carried forward)

Now that `validateForm` uses the shared Zod schema, the main remaining size issue is the JSX. Extract: `ContactIdentityFields` (name + email inputs), `ContactSubjectField` (select), `ContactMessageField` (textarea + char count), `SubmitFeedback` (success/error panel). Keep state and logic in `ContactForm`. Pass value, onChange, name, maxLength, submitMessage as props. No behavior change.

### `apps/web/app/lib/date-utils.ts` (lines 13–21) — `safeTimeZoneOptions` should use `isValidIanaTimezone` from lib

`safeTimeZoneOptions` uses a `try/catch Intl.DateTimeFormat` probe to validate the timezone. This duplicates the `isValidIanaTimezone` utility already in `@project-flame/lib`. Replace the try/catch with `import { isValidIanaTimezone } from "@project-flame/lib"` and return `{ timeZone: timezone }` when `isValidIanaTimezone(timezone)` is true, `{}` otherwise. Keep the function signature unchanged.

### `apps/web/app/components/Navbar` — "Organizer Dashboard" shortcut should move to Navbar for organizer/admin users

Currently the "Organizer Dashboard" button is inside `UserDashboard.tsx`'s My Tickets tab — only visible after navigating to `/account`. Industry standard (Airbnb's "Switch to hosting", Eventbrite's organizer mode toggle) is to surface this shortcut in the **Navbar**, always visible regardless of current page, shown only when `roleData.role === "organizer" || "admin"`. Implementation: add a conditional `<Link href="/organizer?org=${slug}">Organizer</Link>` or similar pill to the Navbar's right-hand action area, using the same `useUserRole` + `useUserOrganizations` hooks (already used in `UserDashboard`). The in-dashboard button can remain as a secondary entry point or be removed once the Navbar shortcut is in place. Do NOT use a role-switcher pill (mobile pattern) — web uses full navigation per Airbnb/Eventbrite convention.

---

## PR Review — P9-6 iOS/Web Parity & QR Fixes (Mar 17, 2026)

### `apps/web/app/lib/hooks/useUserProfile.ts` (line 12) — `profile_image_url` should be required-but-nullable

The `UserProfile` interface declares `profile_image_url?: string | null` (optional). The `/api/user/profile` route always selects and returns this field (it is `SELECT`ed and mapped in the response), so the client type should be `profile_image_url: string | null` (required, nullable) to reflect the API contract and eliminate an unnecessary `undefined` case. Change the property declaration from optional (`?`) to required, then run type checks to ensure no callers assume it can be `undefined`.

### `apps/web/app/account/ticket/[id]/page.tsx` (line 57) — round per-ticket cents to avoid fractional display

`pricePerTicket` is computed as `ticket.order.total_cents / ticket.order.quantity`, which can produce a non-integer number of cents (e.g. a 3-ticket order for $3.99 → 133.0̄ cents). Replace with `Math.round(ticket.order.total_cents / ticket.order.quantity)` before passing to `formatCentsAsPrice` so the displayed price is always a whole-cent value. The equivalent fix has already been applied to the identical function in `apps/mobile/app/ticket/[id].tsx`.

### `docs/historico/fixes/MARCH_DESIGN_WEB_UPDATES.md` (line 249) — hyphenate "Sign out button" → "Sign-out button"

Changelog entry #176 reads "Sign out button" — the compound modifier before "button" should be hyphenated: "Sign-out button".

### `apps/web/app/components/UserDashboard.tsx` (lines ~178–179) — add structured error logging to `handleDeleteProfilePhoto`

The `catch` block in `handleDeleteProfilePhoto` only calls `alert(...)` with no logging. Add `console.error` before the alert with structured context:
```ts
console.error("[UserDashboard] deleteProfilePhoto failed", {
  action: "deleteProfilePhoto",
  error: err,
  userId: profile?.id ?? null,
  imageUrl: profile?.profile_image_url ?? null,
});
```
This mirrors the structured logging pattern used in `upload-profile-image/route.ts` and ensures failures are traceable in production logs. Keep `setUploading(false)` in `finally` and the `queryClient.invalidateQueries` on success unchanged.

---

## CSS Migration Backlog — P9-7 (Mar 18, 2026)

### ~~`apps/web/app/components/PromotionsSection.tsx` — global CSS import (orphaned)~~ ✅ Deleted (Mar 18, 2026)

`PromotionsSection.tsx` and `promotions.css` have been deleted. Dead `showPromotions` / `promotionsProps` props removed from `OrganizerDashboard.tsx` `PurchaseDetailsSectionProps`. `forms.css` also deleted (fully migrated to Tailwind in `CreateEventForm.tsx`).

### ~~`apps/web/app/components/organizer/EventsTiersView.tsx` + `EventsTiersView.module.css` — CSS module~~ ✅ Fixed (MARCH_DESIGN_WEB_UPDATES.md #244)

All 185 `styles.*` references replaced with inline Tailwind classes. `EventsTiersView.module.css` deleted.

### ~~`apps/web/app/components/modals/QRScannerModal.tsx` — CSS import removed, module.css deleted~~ ✅ Verified (Mar 18, 2026)

`QRScannerModal.module.css` deleted, no remaining `styles.*` references in `QRScannerModal.tsx`.

---

## Deferred Nitpicks — Post-CSS Audit (Mar 18, 2026)

### `apps/web/app/components/RsvpManagement.tsx` — reject button color (lines ~569–576)

The confirm button uses `bg-red-600` when `confirmationModal.action === "reject"`. Suggestion was to keep `bg-white-100 text-dark` for all variants and convey destructive intent via icon/label only. Deferred: red fill on destructive confirms is standard UX (Airbnb, Eventbrite) and does not violate the Flame CTA rule (which applies to primary, non-destructive actions). Keep `bg-red-600` on destructive confirms.

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — loose `any` types (lines ~585–656)

Replace `(e: any)` in the `useMemo` finder and typed derived constants with a proper `OrganizerEvent` interface. Pure type-safety refactor with no user-facing impact. No `any` introduced by the current change; pre-existing.

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — stale tier state on re-fetch (lines ~214–229)

Add `useEffect` to reset `selectedTierId`/`bankTierId` when `ticketTiers` is refreshed. Low risk — tier data comes from React Query which triggers a re-render. Edge case only in extended sessions with tier edits.

### `apps/web/app/organizer/settings/page.tsx` — `supabaseAdmin!` non-null assertion (lines ~37–42)

Add explicit guard before calling `supabaseAdmin.from(...)`. `supabaseAdmin` is initialized at module level and is always defined in practice; this is over-engineering for a server route. Low priority.

---

## Deferred Nitpicks — P9-7 Organizer Dashboard Review (Mar 18, 2026)

### `apps/web/app/components/organizer/RsvpsView.tsx` — loose `any` types (lines ~8–26)

Replace `any[]` in `RsvpsViewProps.events`, `RsvpEventCard({ event: any })`, and `separateEventsByDate` callback params with a typed interface matching the organizer event shape from `useOrganizerData`. Pure type-safety refactor; no runtime impact.

### `apps/web/app/components/AdminDashboard.tsx` — sidebar layout breaks single-column constraint (lines ~588–645)

The admin layout uses a persistent two-column shell (`w-64` aside + flex main). Refactor to match the project's `max-w-[800px] mx-auto px-4` single-column requirement. Move sidebar navigation items (sidebarItems, user display, Organizer button, openUserProfile) into a top section within the single-column container.

### `apps/web/app/components/StripeConnectStatus.tsx` — large component with repeated markup (lines ~126–157)

Extract `StatusBadge`, `ConnectActionButton`, and `StatusChecklist` subcomponents from `StripeConnectStatus` to reduce its size and eliminate repeated markup. No logic change.

### `apps/web/app/organizer/settings/OrgSettingsClient.tsx` — large component with mixed concerns (lines ~47–197)

Extract `PersonalTab`, `OrganizationTab`, and `PayoutsTab` subcomponents. Keep `OrgSettingsClient` responsible only for tab state and shell rendering. No logic change.

### `apps/web/app/components/organizer/TierInlineForm.tsx` — large component (lines ~370–697)

Extract `TierFormHeader`, `PricingSection`, `StageEditor`, and `FormActions` subcomponents. Move stage-related state/handlers into `StageEditor` props. No logic change.

### `apps/web/app/components/organizer/TierInlineForm.tsx` — `any` types (lines ~45–47)

Replace `tier?: any` in `TierInlineFormProps`, `stage: any` in `.sort`/`.map`, and handler param `any` with `Stage` and `Tier` interfaces imported from the shared lib or types file.

### `apps/web/app/components/organizer/TierInlineForm.tsx` — sales date `min` prevents past-date editing (lines ~519–520)

When editing an existing tier, `min={getDateTimeLocal(0)}` prevents selecting the tier's original (potentially past) `sales_start` or `sales_end` dates. Apply `min` only for new tiers; for existing tiers either omit `min` or set it to the stored date. Apply to both `sales_start` and `sales_end` inputs.

### `apps/web/app/components/RsvpManagement.tsx` — `alert()` usage (lines ~318–322)

Replace `alert()` in the RSVP action error handler with a toast notification or inline error state. The alert interrupts flow and doesn't integrate with the design system.

### `apps/web/app/components/forms/CreateEventForm.tsx` — inline styles and `any` types (lines ~232–1626)

Multiple deferred items:
- Lines ~232–236: `value: any` in `handleStageChange` → use `FormTicketStage[keyof FormTicketStage]`
- Lines ~322–326: `value: any` in `handleTierChange` → make generic with `<K extends keyof TicketTier>`
- Lines ~1101–1104: `style={{ marginTop: "0.5rem" }}` on image error div → use `mt-2` Tailwind class
- Lines ~1342–1351 and ~1507–1513: inline styles on helper text `<p>` elements → convert to Tailwind utilities
- Lines ~1615–1626: inline style on "(Base: ...)" span → use Tailwind `ml-4 font-bold` classes

### `apps/web/app/components/forms/CreateOrganizationForm.tsx` — labels missing `leading-4` (line ~82)

Labels using `text-xs font-poppins-medium` should also include `leading-4` to match the `subtitle2` FlameText mapping. Apply to name, URL slug labels and hint text.

---

## P9-7 Organizer Dashboard PR Review — Deferred Nitpicks

### `apps/web/app/components/AdminDashboard.tsx` (lines ~230–583) — `renderMainContent` too large

Split `renderMainContent` into focused sub-components: `Overview`, `Users`, `Featured`, and `Revenue`. Each should accept only the props it needs (e.g., `Overview`: `globalStats`, `recentUsers`, `isCleaningUp`, `cleanupMessage`, `handleCleanupTickets`, `setCurrentView`; `Users`: `allUsers`, `formatDate`; `Featured`: `featuredEvents`, `featuredEventId`, `loadingEventId`, `setFeaturedEvent`, `formatDate`; `Revenue`: `globalStats`, `formatCurrency`). Replace the `switch` cases in `renderMainContent` with simple component renders (`<Overview {...props} />`). Behavior and state flow must remain identical.

### `apps/web/app/components/forms/CreateEventForm.tsx` (lines ~50–1626) — Multiple inline styles and component splitting

Several deferred items (added to existing entry at line ~318–325 above — see "inline styles and `any` types" entry). Additional items:
- Lines ~1038–1054: Replace inline `style` controlling opacity and cursor with conditional Tailwind classes (`opacity-50`/`opacity-100`, `cursor-not-allowed`/`cursor-pointer`) based on `formData.slug`.
- Lines ~50–52: Extract `ImageUploader` (lines ~1031–1111), `TicketTierCard` (lines ~1258–1631), and `PriceStageCard` (lines ~1461–1605) into separate components to reduce file size.

### `apps/web/app/components/modals/RegistrationFormModal.tsx` (lines ~21–217) — Component too large, should be split

Extract three focused sub-components: `ModalShell` (overlay, header, body scroll/escape logic), `FormField` (renders each field by type, error display), and `ActionButtons` (Cancel + Submit). Keep state/validation logic in `RegistrationFormModal` and pass props down.

### `apps/web/app/components/RsvpManagement.tsx` (lines ~378–650) — Component too large; registration data not validated

- Lines ~378–650: Extract `Header`, `StatsBar`, `RsvpCard`, `ConfirmationModal`, and `ViewModal` sub-components. Keep `RsvpManagement` as the parent orchestrator.
- Lines ~595–625: Validate and normalize `viewModal.registrationData` with a Zod schema before rendering. Define a schema matching the `registrationFormConfig`-driven shape, parse the data, handle parse errors with a fallback empty object, and use the typed result in `Object.entries` calls.

### `apps/web/app/lib/hooks/useOrganizerData.ts` (lines ~40–41) — Untyped `any[]` properties

Replace `bank_transfer_orders?: any[]` and `promoter_links?: any[]` with typed interfaces (`BankTransferOrder` and `PromoterLink`). Also audit `purchases`, `promotional_tickets`, `promotional_codes` for remaining `any[]` occurrences.

### `apps/web/app/components/OrganizerDashboard.tsx` (lines ~164–210, ~495–501) — `any` types and manual UTC offset

Three items:
1. **Lines ~164–177:** `data.events` array and `find` predicate use inferred `any`; `freshPurchases` and `sortedPurchases` callbacks use `(a: any, b: any)`. Define `Event` (with `id: string; name: string; purchases?: Purchase[]; totalRevenue?: number; totalAttendees?: number`) and `Purchase` (with `id: string; createdAt?: string | number`) interfaces (or reuse shared types) and replace the `any` annotations.
2. **Lines ~189–210:** `formatEcuadorTimestamp` applies a manual `ECUADOR_OFFSET_MINUTES` constant (`-5 * 60`) which drifts if DST rules change. Rewrite using `Intl.DateTimeFormat` with `timeZone: 'America/Guayaquil'` to produce the correct "YYYY-MM-DD HH:MM:SS" string without manual arithmetic.
3. **Lines ~495–501:** `data?.events?.map((e: any) => ...)` — replace `any` with a typed interface that includes `id`, `name`, `purchases`, `totalRevenue`, `totalAttendees`.

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (lines ~1233–1937) — Remaining `any` types in event/tier/purchase handlers

Several handler functions and render callbacks still use `any`:
- `updatePayload` object (around event-edit submit, ~line 1233): define `EventUpdatePayload { id: string; starts_at: string; ends_at: string; venue?: string; city?: string; description?: string }`.
- Tier handler params and mapping callbacks (lines ~1271, ~1290, ~1385, ~1393): use existing `TicketTier` type.
- Purchase render functions (lines ~1649, ~1681, ~1715, ~1937): import or define a `Purchase`/`Order` type with the fields actually accessed.

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — Multiple large-scale refactors

- Lines ~1–6: Split component into a server wrapper (data fetching/shaping) and client islands (interactive state). A large file with 1900+ lines mixing data fetching with interactive hooks.
- Lines ~126–127: Improve catch handlers to capture the error, log it with contextual fields (`eventId`, action name, target id), then call `setError` with the existing friendly message.
- Lines ~125, ~445, ~770, ~806: setTimeout calls in sub-components (`PromoCodesSection`, `SendTicketsSection`, `PromoterLinksSection`) that clear `success`/`copiedId` state can update state after unmount. Store timer IDs in `useRef`, clear on new timer creation, and clear all timers in `useEffect` cleanup. Apply the existing `timerRef` pattern (already used in `PromoterLinksSection` for confirm-delete) consistently to all setTimeout usages.

---

## PR Review — P9-7 round 3 (Mar 18, 2026)

### `apps/web/app/admin/page.tsx` (lines ~40–51) — `AdminFeaturedEvent` interface fields not nullable

The `AdminFeaturedEvent` interface (defined inside `AdminPage`) declares `image_url: string` and `organizations: { name: string }` as required non-null. In practice, the Supabase query may return `null` for both (missing image, missing org join). Mark them as nullable to match actual runtime shape:
```ts
image_url?: string | null;
organizations?: { name: string } | null;
```
Also audit any dependent code using `AdminFeaturedEvent` to ensure it handles the added nullability (the `AdminDashboard` component already guards these with optional chaining, so no functional changes are expected there).

### `apps/web/app/admin/page.tsx` (line ~109) — `featuredEvents` assignment lacks type assertion

The `allUsers` assignment uses `as AdminUser[]` but `featuredEvents = events || []` has no cast. Add a typed assertion:
```ts
featuredEvents = (events || []) as AdminFeaturedEvent[];
```
This enforces the same compiler-level shape consistency as the users cast and eliminates an implicit `any[]` widening from the Supabase response.

### `apps/web/app/components/modals/RegistrationFormModal.tsx` (lines ~162–230) — Form rendering block too large; extract `FieldRow` subcomponent

The `formConfig.map(...)` block (checkbox vs text-input branching) plus per-field error handling in the form body exceeds 70 lines. Extract a local `FieldRow` (or `FormField`) component:
- **Props:** `field: FormField`, `value: string | boolean`, `onChange: (value: string | boolean) => void`, `error: string | undefined`, `isSubmitting: boolean`
- **Renders:** label, checkbox or text input (branching), per-field error `<div>` — keeping identical classNames and styling.
- Optionally extract a `SubmissionError` component for the `submissionError` inline banner.
- Keep the action buttons (`Cancel` / `Submit`) in the modal root.
- Target: `RegistrationFormModal` body under 100 lines; `FieldRow` stays self-contained.

---

## Phase 9-9 deferral — `p9-9-polish` / Phase 9 (Web Design Update) (Mar 19, 2026)

### Replace remaining raw `<img>` tags with `next/image` (was `CRUCIAL_IOS_TO_WEB_TODOS.md` `#2`)

Low-impact cleanup. Most web components already use `next/image`. The remaining raw `<img>` tags are:

- `EventCard.tsx` — event poster (only user-facing one that matters)
- `FeaturedEvent.tsx` — likely unused/legacy since P9-3 removed it from home page
- `Navbar.tsx` — logo SVG (local asset, no real benefit from `next/image` blur)
- `EventsTiersView.tsx` — image previews during editing (temporary local blob URLs, blur placeholder N/A)

The `placeholder="blur"` + `blurDataURL` part of the spec would need a `blurhash` column in the `events` table (DB migration + API change) for real per-image blur. The fallback 1x1 dark pixel base64 is visually indistinguishable from the current dark background loading state. Swap `EventCard.tsx` to `next/image` if doing a quick pass; the rest can stay as-is.

---

## Phase 9 PR review — second round (Mar 19, 2026)

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — Replace remaining `any` usages with typed interfaces

Several areas still use `any`: `updatePayload` (event PATCH body), `handleEditTier` signature, tier filter/sort callbacks, and purchase aggregation variables (`soldTickets`, `revenue` reduce callbacks). Define concrete local interfaces — e.g. `EventUpdatePayload { id, starts_at, ends_at, venue, city }`, a `EditTierPayload` type, and lean on the existing `Purchase` type already imported — then replace all `any` casts and inline `: any` annotations with these interfaces. Run the typechecker to confirm no residual mismatches.

**Reproduction:** TypeScript strict mode reports errors on these casts; no runtime impact.

### `apps/web/app/components/RsvpManagement.tsx` (lines ~435–437) — Structured error logging in XLSX export catch block

The catch block in `handleExportRsvps` only calls `console.error("Error exporting RSVPs:", err)`. Improve to include: `eventId` (from `event.id`), organizer identity (e.g. a `organizerId` prop or `currentUser?.id`), and the action label `"export_rsvps"`. Example:
```ts
console.error("[RsvpManagement] export_rsvps failed", { eventId: event.id, error: err });
```
Keep the existing `alert("Failed to export RSVPs. Please try again.")` unchanged. No functional change — diagnostic improvement only.

### `apps/web/app/components/PaymentAccountBanner.tsx` (lines ~47–60) — Extract Stripe status display mapping to shared `@project-flame/lib` helper

The `isFullyConnected`/`isPartial` → `subtitle`/`badgeLabel`/`badgeClasses`/`BadgeIcon` mapping is duplicated between the web and mobile `PaymentAccountBanner` components. Extract a `getStripeConnectionDisplay(status)` helper into `packages/lib` that returns `{ subtitle, badgeLabel, badgeClasses, BadgeIcon }`. Import and call it in both `apps/web/app/components/PaymentAccountBanner.tsx` and `apps/mobile/components/org-dashboard/PaymentAccountBanner.tsx` so both stay in sync automatically.

**Note:** `BadgeIcon` is a React component (`FiCheckCircle`/`FiClock` from `react-icons`, `Ionicons` on mobile) — the helper may need to return a string identifier and let each platform resolve the icon, or export two platform-specific wrappers.

### Legacy Datafast/Ecuador code cleanup (IVA, cédula, Datafast route) — Added Apr 2026

Since migrating to Stripe Connect (Jan 2026), the following Ecuador-specific code is no longer used for new purchases. All files have been annotated with `@legacy` comments. This cleanup can be done incrementally:

**Dead code (safe to delete):**
- `apps/web/app/components/PriceBreakdownDisplay.tsx` — Not imported anywhere. Showed old base+fee+IVA breakdown.
- `apps/web/app/api/datafast/create-checkout/route.ts` — Entire Datafast checkout route. Replaced by `apps/web/app/api/purchase/create-payment-intent/route.ts`.

**Legacy but still referenced (needs migration before removal):**
- `packages/lib/src/pricing/calculations.ts` — `calculateFinalPrice()`, `extractBasePriceHistorical()`, `calculateFeeBreakdownFromTotal()` are used by organizer pages and email receipts to reverse-calculate base prices from pre-Stripe orders that stored total (base+fee+IVA) as `price_cents`. Once all pre-Jan-2026 orders age out of relevance (or are backfilled with `base_price_cents`), these can be removed.
- `packages/lib/src/pricing/constants.ts` — `ECUADOR_IVA_RATE`, `FLAME_MARKUP_PERCENT` used only by the above extraction functions.
- `apps/web/app/lib/email/ticket-notifications.ts` — Conditionally shows `+ IVA` line for old orders where `ivaCents > 0`. Once legacy orders are no longer emailed, the IVA branch can be removed.
- `packages/lib/src/validators/cedula.ts` — `validateCedula`, `formatCedula`, `cleanCedula`. Used by `apps/web/app/api/user/update-cedula/route.ts` and RSVP registration flow. Can be removed once the cédula field is dropped from the user profile edit UI.
- `apps/web/app/api/user/update-cedula/route.ts` — Cédula update endpoint. Can be removed alongside the validator.
- `apps/web/__tests__/pricing-extraction.test.ts` — Tests for the legacy extraction functions. Remove alongside `calculations.ts` cleanup.

**Stale DB function defaults (low priority):**
- `create_ticket_tier_with_stages` RPC: `p_fee_percentage DEFAULT 7.00` should be `10.00`. Code always passes the value explicitly so the default is unreachable, but a migration to update it would keep the schema accurate.
- `create_hold_v2` function: `v_fee_percentage NUMERIC(5,2) := 7.00` initialiser and the `ELSE 7.00` fallback in the `COALESCE` should be `10.00`. Same reasoning — the tier/stage now stores 10 so `COALESCE` always resolves before the fallback.

**Suggested approach:** Delete the dead code first (PriceBreakdownDisplay, Datafast route). For the legacy-but-referenced code, add a `base_price_cents` backfill migration for pre-Stripe orders, then refactor organizer/email code to use the stored value directly instead of reverse-calculating.

---

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (lines ~2296–2303) — Remove `any` from `soldTickets` and `revenue` reduce callbacks

`soldTickets` and `revenue` reduce over `purchases` with inline `: any` annotations. Since `purchases` is now typed as `Purchase[]`, remove the explicit `(sum: number, p: any)` annotations and let TypeScript infer `p` as `Purchase` automatically. Alternatively annotate as `(sum: number, p: Purchase)` for explicitness.

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (lines ~2229–2240) — Validate IANA timezone in `formatInTz` before passing to `toLocaleString`

`formatInTz` (inside `handleExportPurchases`) builds `rawTz = event.timezone?.trim?.() ?? ""` and passes it directly to `toLocaleString` inside a try/catch. Replace the silent catch with an explicit `isValidIanaTimezone(rawTz)` guard (already used in `organizer-xlsx-export.ts`): only include `{ timeZone: rawTz }` when the validator returns true; otherwise omit the `timeZone` option so locale-based formatting is used. Import `isValidIanaTimezone` from `@project-flame/lib`.

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (~line 672) — Redundant ternary in `sentExpanded` toggle label

`{mode === "free" ? "Sent" : "Sent"}` always renders the string `"Sent"` regardless of `mode`. Replace the entire ternary with the constant string `"Sent"` so the expression becomes `"Sent ({filteredTickets.length})"`. No behavior change; keep all other references to `mode` and `filteredTickets` unchanged.

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (~lines 674–676) — Replace unicode chevron characters with `react-icons` components

`{sentExpanded ? "▲" : "▼"}` and the equivalent in the purchase list accordion use raw Unicode triangle characters. Replace with `FiChevronUp` / `FiChevronDown` from `react-icons/fi` (already imported in the file). Apply the same `className` that currently wraps the `<span>` to the icon component, and keep the conditional on `sentExpanded` (and the purchase list's equivalent state) so the correct direction renders. No logic change.
