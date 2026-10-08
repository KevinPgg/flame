# Free Ticket Flow Implementation

> ⚠️ **Payment System Note**: This document describes the free ticket flow which works with both payment systems. The Datafast references below apply to legacy transactions. New implementations use Stripe. See [Stripe Documentation](../../stripe-implementation/) for current payment system details.

## Overview

This document describes the implementation of a free ticket flow that bypasses payment processing when the total amount is $0 (after discounts).

## User Experience

### For Free Events or Fully Discounted Tickets

When a user reaches the purchase page and the total amount is $0 (either because the ticket is free or a promotional code reduces it to $0):

1. **No Billing Information Required**: The billing information section is hidden
2. **"Confirm Free Ticket" Button**: Instead of "Proceed to Payment", the user sees a "Confirm Free Ticket" button
3. **Instant Confirmation**: Clicking the button immediately completes the purchase without any payment processing
4. **Email Confirmation**: User receives their free tickets via email immediately

### For Paid Events

The existing flow remains unchanged:

1. Billing information is required
2. "Proceed to Payment" button shows with the amount
3. Stripe payment UI is loaded (Stripe Connect)
4. Payment is processed through Stripe

> **Note**: The current implementation uses Stripe Connect for payment processing. Historical versions used Datafast (now deprecated). See `docs/PAYMENT_SYSTEMS_EVOLUTION.md` for migration details.

## Technical Implementation

### New API Endpoints

#### 1. `/api/purchase/complete-direct-free/route.ts`

- **Purpose**: Complete RSVP purchases when total is $0
- **Key Features**:
  - Validates the purchase token
  - Creates order with `payment_method: "free"` and `payment_provider: "free"`
  - Generates tickets with QR codes
  - Sends confirmation email
  - Skips all Datafast payment processing
  - Validates that total is actually $0 (security check)

#### 2. `/api/purchase/complete-hold-free/route.ts`

- **Purpose**: Complete hold purchases when total is $0
- **Key Features**:
  - Validates the hold session
  - Uses the `complete_hold_purchase` RPC function (same as paid flow)
  - Updates order with `payment_method: "free"` and `payment_provider: "free"`
  - **Robust Error Handling**: Validates order status updates. QR code generation failures are logged but non-fatal (users receive tickets with placeholder QRs to prevent stranded orders).
  - **Promoter Code Validation**: Returns 400 error for invalid codes instead of ignoring them.
  - Generates tickets with QR codes
  - Sends confirmation email
  - Skips all Datafast payment processing
  - Validates that total is actually $0 (security check)

### Modified Files

#### `/app/components/StripePurchaseFlow.tsx`

**Changes Made**:

1.  **Client-Side Total Calculation**:
    *   Calculates total price from purchase details (tier price * quantity).
    *   Detects if the total is $0.00.

2.  **Conditional UI Rendering**:
    *   **If Total > $0**: Renders `StripePaymentForm` wrapped in `Elements` provider (standard flow).
    *   **If Total = $0**: Renders a "Claim Free Ticket" button instead of the payment form. Skips `create-payment-intent` call to avoid Stripe errors.

3.  **Free Purchase Handler**:
    *   Calls `/api/purchase/complete-direct-free` (for RSVP tokens) or `/api/purchase/complete-hold-free` (for Hold sessions).
    *   Redirects to success page upon completion.

4.  **Success Modal**:
    *   Displays specific "Free Ticket Claimed!" message.
    *   Provides direct link to "My Account".

#### `/app/components/EventDetail.tsx`

**Changes Made**:

1.  **Updated Button Text Logic**:
    *   Dynamically calculates the price of the selected tier/stage.
    *   If price is $0, displays "Claim Free Ticket (X Tickets)".
    *   If price > $0, displays "Continue to Purchase (X Tickets)".

2.  **Instant Free Ticket Claim**:
    *   For free tickets (price = $0), `handleDirectPurchase` now bypasses the redirect to `/purchase`.
    *   It immediately calls `/api/purchase/complete-hold-free` with the created hold session ID.
    *   On success, it displays the success modal directly on the event page.

3.  **Success Modal Customization**:
    *   Added `isFreeClaimSuccess` state to customize the modal content.
    *   Displays "Free Ticket Claimed!" and "Visit my account to see your ticket".
    *   "My Account" button redirects to `/account`.

#### `/app/components/UserDashboard.tsx`

**Changes Made**:

1.  **Ticket Modal Price Display**:
    *   Updated logic to use the *currently viewed ticket* (`currentTicket`) instead of the first ticket in the group (`firstTicket`) when calculating price.
    *   This ensures that when tickets from different orders (e.g., one free, one paid) are grouped by tier, the correct price is shown for each specific ticket.
    *   Explicitly checks for `total_cents === 0` (free orders) to display " - FREE".

#### `/app/purchase/page.tsx`

**Changes Made**:

1. **Updated `handleCreateCheckout` function**:

   - Now checks if total is $0 before proceeding
   - If $0, calls `handleCompleteFreeTicket()` instead of creating payment checkout
   - If paid, continues with existing payment flow (Stripe Connect)

2. **Added `handleCompleteFreeTicket` function**:

   - Calls the appropriate free completion endpoint (`complete-direct-free` or `complete-hold-free`)
   - Passes promotional code ID if applicable
   - Redirects to success page on completion
   - Handles errors gracefully

#### 3. `/app/api/organizer/rsvps/[id]/approve/route.ts` (Free RSVP Approval)

**Purpose**: Handles approval of free RSVPs by the organizer.

**Key Features**:
- Validates that the effective price is truly $0
- Creates order and tickets immediately upon approval
- **Sends ticket confirmation email** with QR codes (Crucial step)
- Updates RSVP status to `purchased` (skip payment capture)

> **Historical Note**: Early versions of this documentation referenced "Datafast checkout" and "Datafast flow." The current implementation uses Stripe Connect for all paid transactions.

3. **Conditional Billing Information Section**:

   - Billing section is only shown when `total > 0`
   - Free tickets don't require billing information
   - Reduces friction for free ticket claims

4. **Updated Button Text**:

   - Shows "Confirm Free Ticket" when `total === 0`
   - Shows "Proceed to Payment - $X.XX" when `total > 0`
   - Loading state shows "Confirming..." for free tickets

5. **Updated Confirmation Note**:
   - Free tickets: "You will receive your free tickets via email after confirmation."
   - Paid tickets: "You will receive your tickets via email after payment confirmation."

## Security Considerations

1. **Server-Side Validation**: Both free endpoints validate that the total is actually $0 before processing
2. **Authentication Required**: User must be logged in to complete any purchase
3. **Token/Session Validation**: Purchase tokens and hold sessions are validated
4. **Promotional Code Verification**: If a promo code is applied, it's validated atomically with usage count increment
5. **No Client-Side Trust**: The total calculation is performed server-side to prevent manipulation

## Database Records

### Order Records for Free Tickets

Free ticket orders are stored with:

- `total_cents: 0`
- `payment_method: "free"`
- `payment_provider: "free"`
- `status: "completed"`
- No Datafast transaction IDs (since no payment occurred)

This allows organizers to:

- Track free ticket distribution
- See which promotional codes were used
- Maintain complete order history
- Generate reports on free vs paid tickets

## Testing Scenarios

### Test Case 1: Free Event

1. Create an event with ticket price = $0
2. Purchase flow should show "Confirm Free Ticket"
3. No billing information required
4. Ticket should be generated immediately

### Test Case 2: 100% Discount Promo Code

1. Create an event with ticket price > $0
2. Create a promotional code with 100% discount
3. Apply the promo code
4. Total should become $0
5. Button should change to "Confirm Free Ticket"
6. Billing section should disappear
7. Ticket should be generated immediately

### Test Case 3: Partial Discount (Not Free)

1. Create an event with ticket price > $0
2. Create a promotional code with 50% discount
3. Apply the promo code
4. Total should be > $0
5. Should show "Proceed to Payment" with remaining amount
6. Should require billing information
7. Should go through normal Stripe payment flow

## Benefits

1. **Better User Experience**: Free tickets don't require unnecessary billing information
2. **Faster Checkout**: No payment processing delays for free tickets
3. **Clear Communication**: Button text clearly indicates the action
4. **Cost Savings**: No payment processing fees for free tickets
5. **Flexibility**: Supports both free events and promotional code discounts
6. **Consistency**: Success flow and email notifications work the same for free and paid tickets

## Flow Diagram

```
User Clicks "Continue to Purchase"
           ↓
    Load Purchase Page
           ↓
    Calculate Total
           ↓
    Is Total = $0?
       ↙     ↘
     Yes      No
      ↓        ↓
Show "Confirm  Show "Proceed to
Free Ticket"   Payment - $X.XX"
      ↓        ↓
Hide Billing   Show Billing
Information    Information
      ↓        ↓
User Clicks    User Fills
Confirm        Billing & Clicks
      ↓        ↓
Call Free      Create Stripe
Endpoint       Checkout
      ↓        ↓
Generate       Process Payment
Tickets        via Stripe
      ↓        ↓
Send Email     Generate Tickets
      ↓        ↓
Redirect to Success Page
```

## Database Impact

### ✅ NO MIGRATIONS NEEDED

The implementation requires **zero database migrations**:

- `orders.payment_method` accepts any `VARCHAR` value (no constraints)
- `orders.payment_provider` accepts any `TEXT` value (no constraints)
- Free tickets will have `payment_method = 'free'` and `payment_provider = 'free'`

### Payment Transaction Logs

**Important**: Free tickets do NOT create entries in payment processor transaction tables:

**Paid Ticket Flow** (Current - Stripe):

```text
User Purchase → Stripe API Call → Stripe transaction record → Order created
```

**Paid Ticket Flow** (Legacy - Datafast):

```text
User Purchase → Datafast API Call → datafast_transactions entry → Order created
```

**Free Ticket Flow**:

```text
User Purchase → Direct Order Creation → NO payment transaction entry
```

This is **by design** because:

- Payment transaction tables track actual payment processor interactions
- Free tickets don't use payment processors, so no transaction log is needed
- Keeps audit logs clean and payment analytics accurate
- All orders (free and paid) are still tracked in the `orders` table

### Order Tracking

All orders are tracked in the `orders` table:

**Paid Orders** (Current - Stripe):

```sql
payment_method: "stripe"
payment_provider: "stripe"
total_cents: > 0
stripe_payment_intent_id: <actual_id>
status: "paid"
```

**Paid Orders** (Legacy - Datafast):

```sql
payment_method: "datafast"
payment_provider: "datafast"
total_cents: > 0
datafast_transaction_id: <actual_id>
status: "completed"
```

**Free Orders**:

```sql
payment_method: "free"
payment_provider: "free"
total_cents: 0
stripe_payment_intent_id: NULL
datafast_transaction_id: NULL
status: "completed"
```

### Analytics Queries

```sql
-- Total revenue by payment method
SELECT
  payment_method,
  COUNT(*) as order_count,
  SUM(total_cents) / 100.0 as revenue_dollars
FROM orders
WHERE status = 'completed'
GROUP BY payment_method;

-- Free vs Paid ticket distribution
SELECT
  CASE WHEN total_cents = 0 THEN 'Free' ELSE 'Paid' END as type,
  COUNT(*) as order_count,
  SUM(quantity) as total_tickets
FROM orders
WHERE status = 'completed'
GROUP BY type;
```

See [FREE_TICKET_DATABASE_IMPACT.md](./FREE_TICKET_DATABASE_IMPACT.md) for complete database analysis.

## Future Enhancements

1. **Donation Option**: For free events, could add optional donation field
2. **Analytics**: Track conversion rates for free vs paid tickets
3. **Waitlist**: If free tickets run out, offer waitlist option
4. **Social Sharing**: Encourage sharing after claiming free tickets
5. **Payment Method Enum**: Add CHECK constraint for strict validation (optional)
