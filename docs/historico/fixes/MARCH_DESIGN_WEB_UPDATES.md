# March Design Web Updates

## 2026-03-19 — Promoter Link Confirmation in Checkout & RSVP Modal

**Files changed:**
- `apps/web/app/components/StripePurchaseFlow.tsx` — Added always-visible "Promoter" section below promo code with an input field and Apply button. If a promoter code was pre-validated (via `purchaseDetails.promoter_code`), it displays with a green checkmark. Users can also manually enter and validate a promoter code, or clear it.
- `apps/web/app/components/modals/RsvpPaymentModal.tsx` — Added same always-visible "Promoter" section below promo code with input + Apply validation. If the `promoterCode` prop is present (from URL), it displays as pre-validated with a green checkmark. Otherwise shows an empty input for manual entry.
- `apps/web/app/api/promoter-validate/route.ts` — New API endpoint for validating promoter codes against the `promoter_links` table.

**Note:** The promoter code input field also remains on the event page (EventDetail.tsx) for initial validation when landing via `?promoter=CODE` URL. The checkout and RSVP modal carry the validated code through and allow further editing via the input + Apply control.

**Spec reference:** `prompts_phases_web_design.md` lines 796-816. Promoter link field must appear below promo code in checkout (direct purchase) and RSVP payment modal.
