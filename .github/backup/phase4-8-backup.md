## PR Description
Briefly describe the changes included in this PR.

## Migration Phase
Which phase does this PR belong to? (Check one)

- [ ] **Phase 4: UI Design First** (Mobile)
  - [ ] I confirm this PR *only* includes UI, styling, and navigation changes.
  - [ ] I confirm *no functional logic* (real API calls, complex state) has been added.
  - [ ] I followed the Figma-to-Code Implementation Protocol in `.cursor/rules/flame-design-system.mdc`.

- **Phase 5: Logic Integration** (Mobile) — Complete; historical reference only. Do not check — use Phase 7 for active logic ports.
  - *Historical checklist:* Logic porting followed the Web-to-Mobile Logic Porting Protocol (Section 9) and Web Parity Gate (Section 9.1). Source files in `apps/web` were read; logic was ported, not rewritten.
  - **Any PR that changes mobile logic in Phase 5A or Phase 5B** (e.g., bug fixes, edge-case handling) **must still include in the PR description:** Web Source References, API Parity Evidence, Calculation Parity Evidence, Edge Case Verification, and Cross-Platform Behavior Check (Web Parity Gate, Section 9.1).

- [ ] **Phase 6: iOS Polish** (Mobile) — Bug fixes, UX improvements, error resilience.
  - [ ] Generally no web parity required for UI/UX polish; if this PR changes business logic or calculations, include Web Source References, API Parity Evidence, Calculation Parity Evidence, Edge Case Verification, and Cross-Platform Behavior Check per Section 9.1 (Web Parity Gate).

- [ ] **Phase 7: Extra Features** (Mobile)
  - [ ] If this feature has a web equivalent: I followed the Logic Porting Protocol and completed the Web Parity Gate (Section 9.1).
  - [ ] If mobile-only: I added an entry to `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md`.

- [ ] **Phase 8: Testing Audit Fixes** (Mobile)
  - [ ] If this PR touches checkout (P8-1), scanner (P8-3), event management (P8-5), display (P8-6), UX polish (P8-7), or registration form (P8-8): I included the relevant Web Parity Gate / verification block(s) below (required for merge). See `docs/prompts/prompts_phases.md` PR Review Prompt.

- [ ] **Other / General Bug Fix / Shared Package**

## Shared Logic Checklist
- [ ] If I found business logic that should be shared but wasn't in `packages/lib`, I extracted it to `packages/lib` first before using it.

## Testing & Verification
- [ ] Tested on iOS Simulator/Device.
- [ ] (If porting from web) Tested against identical flow on the Web app to ensure 100% parity.

## Web Parity Evidence (Required when porting logic from web — Phase 5 / Phase 7)

### General (all logic ports)
- **Web source files used:** `apps/web/app/...`
- **Mobile files changed:** `apps/mobile/...`
- **API parity check:** methods, endpoints, request/response shape match web.
- **Calculation parity check:** `@project-flame/lib` used; no custom cents math; server amounts override estimates.
- **Edge cases tested:** paid, free, promo, 100% promo, RSVP paid/free, cancellation/retry.
- **Web vs mobile verification notes:** include behavior comparison and any intentional platform-specific differences.

### Phase 8 — OrgPromotionsCard / discount picker (P8-5g; required when this PR touches `OrgPromotionsCard.tsx`)
1. **Web source:** `apps/web/app/components/PromotionsSection.tsx` (lines 1155–1168) — `<select>` with `Array.from({ length: 20 }, (_, i) => (i + 1) * 5)`; `onChange` → `setPromoPercentage(e.target.value)`. Mobile: `showDiscountSelector` → `setDiscountPercentage`.
2. **API parity:** `POST /api/organizer/promotional-codes` — body `event_id`, `code`, `discount_percentage`, `usage_limit`; `useCreatePromoCode.mutateAsync`; validation 5–100 in steps of 5.
3. **Calculation parity:** Identical 20 options (5,10…100); no shared lib; client validation `discountPercentage % 5 === 0`.
4. **Edge-case verification:** Paid/free/promo/RSVP/cancel — N/A (promo creation only); create success → `setShowDiscountPicker(false)` on reset.
5. **Cross-platform behavior:** `showDiscountSelector` branches — iOS: `ActionSheetIOS.showActionSheetWithOptions`; Android: `setShowDiscountPicker(true)` (Modal); both call `setDiscountPercentage`; hardware back → `onRequestClose`.

### Phase 8 — Checkout (P8-1; required when this PR touches checkout flow)
- **Web source:** `EventDetail.tsx`, `StripePaymentForm.tsx`, `create-payment-intent/route.ts`, `holds/create/route.ts`
- **API parity:** Same endpoints, request/response shapes; `promoter_code` in holds/create and PI creation; hold expiry pre-check before PaymentSheet.
- **Calculation parity:** `@project-flame/lib` — `calculateFee`, `calculateFinalPrice`, `formatCentsAsPrice`; server amounts override estimates.
- **Edge cases:** Paid, free, promo, 100% promo, RSVP paid/free, cancellation/retry, free skips PaymentSheet.
- **Cross-platform:** Success state → "View My Tickets"; promo auto-capitalize; existing RSVP validated client-side.

### Phase 8 — Scanner (P8-3; required when this PR touches `scanner.tsx` or QR verification)
- **Web source:** `apps/web/app/api/qr-scanner/verify/route.ts`, `apps/web/app/api/qr-scanner/checkin/route.ts`, `QRScannerModal.tsx`
- **API parity:** Same verify/checkin endpoints; request/response shapes match.
- **Calculation parity:** N/A (verification only).
- **Edge cases:** Valid/invalid QR, check-in success, post-check-in returns to camera.
- **Cross-platform:** Org selector removed; Access Codes tab; text white on dark; no manual entry; camera avoids wide angle.

### Phase 8 — Event management (P8-5; tier editing, create event, EditEventDetailsTab, LinkableText)
- **Full parity table:** See `docs/fixes/MARCH_2026_FIXES.md` — "Web Parity Gate — P8-5 Batch" (EditableTierCard, EditTiersTab, useUpdateEvent, useCreateEvent, image upload, LinkableText).
- **Web sources:** `ticket-tiers/route.ts` (PATCH), `events/route.ts` (PATCH), `PromotionsSection.tsx` (promo dropdown — see OrgPromotionsCard block above), `CreateEventForm.tsx`.
- **Include:** Web source refs, API parity, `localToUtc`/`formatCentsAsPrice` from lib, edge cases (tier with sales, deleted tier), cross-platform (DateTimePickerField + timezone).

### Phase 8 — Display (P8-6; required when this PR touches event cards, promoter links, org event detail, purchase/sent tickets, or availability polling)
- **Full parity block:** See `docs/fixes/MARCH_2026_FIXES.md` — "Web Parity Gate (entries #402–#408)". Copy the five-part block into this PR description before merge.
- **Web sources:** `EventCard.tsx` (getLowestPrice → `packages/lib`), `api/organizer/data/route.ts` (enrichEventWithStats), `OrganizerDashboard.tsx` (PurchaseDetailsSection, PromotionsSection).
- **API parity:** `GET /api/organizer/data` (single batch); `GET /api/organizer/promoter-links` uses `.in("status", ["completed","paid"])`.
- **Calculation parity:** `getLowestPrice` from `@project-flame/lib`; revenue from `enrichedEvent.totalRevenue` (server-authoritative).
- **Edge cases:** Paid, free, promotional, bank transfer, RSVP, cancellation; availability polling (refetchInterval 10s).
- **Cross-platform:** Event cards "From $X.XX" / "Sold Out" / ranges; promoter link sales; purchase details; sent tickets; availability refresh.

### Phase 8 — UX Polish (P8-7; required when this PR touches QR fullscreen, notification dismiss, cedula/billing removal, or Clerk Manage link)
- **Verification block:** See `docs/fixes/MARCH_2026_FIXES.md` — "P8-7 Verification Block (entries #414–#417)". No full parity gate required (UX polish only).
- **Include verification notes:** QR fullscreen expand works; notification dismiss/clear-all is clean (no glitch); cedula/billing removed from PersonalSettingsTab; Clerk "Manage" link shows Alert directing user to flame.co → Settings (with "Open flame.co" option).
- **Cross-platform:** Web uses `<UserButton>` modal for account management; mobile shows an Alert linking to flame.co for profile management (P8-7d rolled back from `@clerk/expo` v3 — see MARCH_2026_FIXES.md #419).

### Phase 8 — Registration Form (P8-8; required when this PR touches registration form builder)
- **Full parity block:** See `docs/fixes/MARCH_2026_FIXES.md` — "Web Parity Gate — P8-8 (Registration Form Builder)" (entries #427–#430). Copy the five-part block into this PR description before merge.
- **Web sources:** `RegistrationFormModal.tsx` (FormField interface, lines 5–11), `EventDetail.tsx` (registration_form_config usage in RSVP flow), `api/rsvp/route.ts` (registration_data validation), `api/events/route.ts` (POST createEventSchema + PATCH updateEventSchema).
- **API parity:** `POST /api/events` and `PATCH /api/events` accept `registration_form_config` (optional FormField[] or null). Zod schema validates: `id: string`, `label: string`, `type: enum`, `required?: boolean`, `placeholder?: string`.
- **Calculation parity:** FormField interface matches web exactly; no pricing/fee calculations involved; FormFieldSchema Zod validation in `useRsvpManagement.ts` used for parsing.
- **Edge cases:** Empty config (sends nothing), null to clear (PATCH), single/multiple fields, reorder, required vs optional toggle, RSVP disabled clears config, tier-specific `registration_form_fields` filters.
- **Cross-platform:** Mobile-first feature (web has no builder UI yet — logged in `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md` #14). Config shape 100% compatible with web's `RegistrationFormModal.tsx` rendering and `rsvp/route.ts` validation.
