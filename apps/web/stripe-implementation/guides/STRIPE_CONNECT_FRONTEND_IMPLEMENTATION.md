# Stripe Connect Frontend Implementation Summary

This document summarizes the frontend implementation for the Stripe Connect migration with "Fee-on-Top" logic and RSVP "Auth & Capture" flow.

## ✅ Completed Components

### 1. Organizer Dashboard - Stripe Connect Status

**Files Created:**

- `app/components/StripeConnectStatus.tsx` - Component that displays Stripe Connect account status
- `app/api/stripe/connect/status/route.ts` - API endpoint to fetch Connect account status
- `app/styles/components/stripe-connect.css` - Styling for Connect status cards and notification banners

**Integration:**

- Added to `app/components/organizer/DashboardView.tsx`
- Displays at the top of the organizer dashboard
- Shows three states:
  - **Not Connected**: Prompts organizer to connect with Stripe
  - **Incomplete**: Account connected but needs additional information
  - **Connected**: Fully operational, ready to accept payments

**Features:**

- Real-time status checking
- One-click onboarding flow
- Visual indicators for charges and payouts status
- Error handling and retry functionality
- Success notification banner when Connect onboarding completes
- Error notification banner for failed/cancelled onboarding attempts
  - Automatically dismisses after 5 seconds (success) or 7 seconds (error)
  - Manual dismiss via close button
  - URL parameters are cleared on dismiss to prevent banner re-appearance on page refresh

### 2. Purchase Page - Stripe PaymentElement

**Files Created:**

- `app/components/StripePurchaseFlow.tsx` - Main purchase flow component
- `app/components/StripePaymentForm.tsx` - Reusable payment form with Stripe Elements
- `app/lib/stripe/stripe-client.ts` - Client-side Stripe initialization
- `app/api/holds/details/route.ts` - API to fetch hold session details
- `app/api/rsvp/details/route.ts` - API to fetch RSVP details for payment
- `app/styles/components/stripe-payment.css` - Styling for payment forms and pages

**Features:**

- Unified payment flow for both Hold and RSVP modes
- Real-time payment processing with Stripe Elements
- Support for async payment methods (handles "processing" status)
- Event and order summary display
- Mobile-responsive design
- Error handling and success states
- Secure payment authorization

### 3. RSVP Flow - Payment Authorization Modal

**Files Created:**

- `app/components/modals/RsvpPaymentModal.tsx` - Modal for RSVP payment authorization
- `app/styles/components/rsvp-payment-modal.css` - Modal styling

**Integration:**

- Designed to be integrated into `app/components/EventDetail.tsx`
- Shows before RSVP submission
- Handles "Auth & Capture" flow

**Features:**

- Payment authorization (not immediate charge)
- Event and ticket summary
- Clear messaging about authorization vs. charge
- Integrated with Stripe Elements
- Returns `paymentIntentId` to parent component for RSVP creation
- Clears sensitive state (client secret) ONLY when payment parameters change (eventId, tier, quantity)
- Persists PaymentIntent state across modal close/reopen to prevent orphans

**Backend Integration:**

- RSVP API (`app/api/rsvp/route.ts`) already accepts `paymentIntentId` parameter
- Validates PaymentIntent status is `requires_capture`
- Saves `stripe_payment_intent_id` to RSVP record
- Approval flow triggers capture; no subsequent purchase link required
- `create-payment-intent` accepts `rsvpId` to link PaymentIntents created via token link immediately to the RSVP record

## 📋 Required Package Dependencies

### Installation

For React 18 (recommended), install without version pins to get the latest stable versions:

```bash
pnpm install @stripe/stripe-js @stripe/react-stripe-js
# or with npm
npm install @stripe/stripe-js @stripe/react-stripe-js
# or with yarn
yarn add @stripe/stripe-js @stripe/react-stripe-js
```

### If you must pin versions / React 19

If you need to pin specific versions (e.g., for React 19 compatibility), use:

```bash
pnpm install @stripe/stripe-js@8.6.1 @stripe/react-stripe-js@5.4.1
```

## React 19 Compatibility

`@stripe/react-stripe-js@5.4.1` supports React versions >=16.8.0 and <20.0.0, which includes React 19; however, Stripe has not officially documented full React 19 support as of January 2026.

**Recommendation:** Target React 18 for official support and test thoroughly if using React 19.

Track updates here: [stripe/react-stripe-js#540](https://github.com/stripe/react-stripe-js/issues/540) / [CHANGELOG](https://github.com/stripe/react-stripe-js/blob/master/CHANGELOG.md).

## 🔧 Environment Variables Required

Ensure these are set in your environment:

```env
# Stripe API Keys
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...

# Stripe Webhook Secret (for production)
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 🎨 Styling Architecture

All Stripe-related styles follow your existing CSS architecture:

- Imported in `app/globals.css`
- Uses CSS custom properties (variables) from your existing design system
- Mobile-responsive with consistent breakpoints
- Follows your existing component naming conventions

## 🔄 Integration Steps Needed

### 1. Update EventDetail Component for RSVP Flow

In `app/components/EventDetail.tsx`, replace the current RSVP submission flow:

```typescript
// Add state for payment modal
const [showRsvpPaymentModal, setShowRsvpPaymentModal] = useState(false);
const [rsvpPaymentIntentId, setRsvpPaymentIntentId] = useState<string | null>(
  null
);

// Update handleRsvpSubmit to show payment modal first
const handleRsvpSubmit = async (
  secretCode?: string | null,
  formData?: Record<string, any>
) => {
  // Show payment modal instead of submitting directly
  setShowRsvpPaymentModal(true);
  setRegistrationData(formData || null);
};

// Handle successful payment authorization
const handleRsvpPaymentSuccess = async (
  paymentIntentId: string,
  registrationData?: Record<string, any> | null,
  secretCode?: string | null
) => {
  setRsvpPaymentIntentId(paymentIntentId);
  setShowRsvpPaymentModal(false);

  // Now submit RSVP with payment intent ID
  rsvpMutation.mutate({
    event_id: event.id,
    ticket_tier_id: selectedTier,
    quantity: selectedQuantity,
    stage_id: selectedStageId || undefined,
    secret_code: secretCode || verifiedSecretCode || undefined,
    registration_data: registrationData || undefined,
    promoter_code: promoterCode || undefined,
    paymentIntentId: paymentIntentId,
  });
};

// Extract stage information from event data
const selectedStageData = event.stage_pricing?.find(
  s => s.id === selectedStageId
);

// Add modal to render
<RsvpPaymentModal
  isOpen={showRsvpPaymentModal}
  onClose={() => setShowRsvpPaymentModal(false)}
  onSuccess={handleRsvpPaymentSuccess}
  eventId={event.id}
  eventName={event.name}
  eventDate={event.starts_at}
  eventVenue={event.venue}
  ticketTierId={selectedTier}
  ticketTierName={selectedTierData?.name || ""}
  quantity={selectedQuantity}
  stageId={selectedStageId}
  stageName={selectedStageData?.name || ""}
  stagePrice={selectedStageData?.price_cents || 0}
  tierPrice={selectedTierData?.price_cents || 0}
  currency="usd"
  registrationData={registrationData}
  secretCode={verifiedSecretCode}
  promoterCode={promoterCode}
/>;
```

### 2. Replace Purchase Page

Update `app/purchase/page.tsx` to use the new Stripe flow:

```typescript
import StripePurchaseFlow from "../components/StripePurchaseFlow";

export default function PurchasePage() {
  return <StripePurchaseFlow />;
}
```

### 3. Install Dependencies

See **"📋 Required Package Dependencies"** section above for installation instructions.

## 🧪 Testing Checklist

### Frontend Testing

- [ ] Organizer can see Stripe Connect status
- [ ] Organizer can complete Stripe Connect onboarding
- [ ] Direct purchase flow works with Stripe PaymentElement
- [ ] RSVP request shows payment authorization modal
- [ ] Payment authorization UI succeeds and displays confirmation
- [ ] RSVP 3DS redirect stores only pendingRsvpId + PI in sessionStorage
- [ ] `POST /api/rsvp/pending` stores RSVP details server-side
- [ ] Mobile responsive on all screens
- [ ] Error states display correctly
- [ ] Loading states work properly
- [ ] Organizer balance view restricted to admin/owner (UI)
- [ ] Conditional return URLs work for purchase vs. RSVP flows
- [ ] Modal does not create duplicate PaymentIntents when closed and reopened
- [ ] 3D Secure redirects handled via `app/rsvp/success/page.tsx`

### Backend Integration Testing

- [ ] RSVP is created with correct payment intent ID
- [ ] RSVP success uses `pending_rsvp_id` when returning from Stripe redirect
- [ ] Organizer can approve RSVP (captures payment via API)
- [ ] Organizer can reject RSVP (cancels authorization via API)
- [ ] PaymentIntents created via token link are linked to RSVPs
- [ ] Free RSVPs generate tickets on approval
- [ ] Webhook creates orders and tickets correctly
- [ ] Payment failures are handled and RSVPs are updated accordingly
- [ ] Idempotency prevents duplicate orders on webhook retries

## 🔐 Security Notes

- All Stripe operations use server-side API routes
- Client secret is generated server-side only
- PaymentIntent validation happens on the server
- No sensitive Stripe keys exposed to client
- RSVP 3DS flow stores sensitive RSVP details server-side and only keeps a short-lived pending reference in sessionStorage
- Authentication via Clerk; ensure CSRF protection by using SameSite/secure cookie settings for any session cookies and/or implementing anti-CSRF tokens or double-submit cookie patterns on server-side routes, and validate origin/CSRF on endpoints that rely on cookies
- **RBAC**: Financial data endpoints (balance, payouts) restricted to authorized roles

## 📱 Mobile Considerations

All components are fully responsive:

- Payment forms adapt to mobile screens
- Modals are mobile-friendly
- Touch-friendly button sizes
- Optimized for small screens

## 🎯 Next Steps

1. Install Stripe dependencies
2. Set environment variables
3. Integrate RsvpPaymentModal into EventDetail component
4. Replace purchase page with StripePurchaseFlow
5. Test end-to-end flows
6. Deploy and verify webhooks are working

## 📚 Additional Resources

- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Stripe Elements Documentation](https://stripe.com/docs/stripe-js)
- [Payment Intents API](https://stripe.com/docs/api/payment_intents)
