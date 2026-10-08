# Stripe Checkout Styling Guide

**Date:** January 15, 2026  
**Status:** ✅ Enhanced Appearance Configuration Applied - Matches App Design System

---

## Overview

This guide explains the styling approach for Stripe's payment checkout and the differences from the previous Datafast checkout.

### Your App's Design System

**Border Radius Policy:**
- ❌ **NO rounded corners** on cards, sections, containers, inputs
- ✅ **ONLY `border-radius: 50%`** for circular icons/avatars
- ✅ Small radius (4px) allowed for tiny elements like loading indicators

This is strictly enforced throughout your app to maintain a clean, sharp aesthetic.

## Before vs After Migration

### Datafast Checkout (Previous)
- **Fully custom HTML form** with 10+ fields
- Complete control over all styling via CSS
- Custom validation and error handling
- Required: firstName, lastName, email, phone, address, city, country, documentType, documentId, dateOfBirth

### Stripe Checkout (Current)
- **Stripe PaymentElement** (embedded, hosted by Stripe)
- Styling via Stripe's Appearance API (more limited)
- Built-in validation and security (PCI compliant)
- Only requires: payment card details (handled by Stripe)

---

## Understanding Stripe Elements Customization

Stripe's `PaymentElement` is **not a traditional HTML form** that you can fully style with CSS. It's an embedded iframe component that:

1. **Is hosted and controlled by Stripe** (for PCI compliance and security)
2. **Can be styled via the Appearance API** (with defined variables and rules)
3. **Has limitations** on what can be customized

### What CAN Be Customized ✅

- **Colors**: primary, background, text, borders, danger states
- **Typography**: font family, sizes, weights
- **Spacing**: padding, border radius, spacing units
- **Focus states**: borders, shadows, outlines
- **Component rules**: specific styling for inputs, labels, tabs, errors

### What CANNOT Be Customized ❌

- **Internal layout/structure** of Stripe Elements
- **Payment method icons** (Visa, Mastercard logos)
- **3D Secure flow** (hosted by Stripe/banks)
- **Deep DOM manipulation** (it's in an iframe)
- **Custom JavaScript behavior** inside Elements

---

## Current Implementation

### Enhanced Appearance Configuration (January 15, 2026)

We've updated `StripePurchaseFlow.tsx` with comprehensive appearance customization that matches your app's design system:

```typescript
appearance: {
  theme: "stripe",
  variables: {
    // Colors (matching your CSS variables)
    colorPrimary: "#ff4c24",           // Your app's primary color
    colorBackground: "#ffffff",
    colorText: "#131313",              // Your app's dark text
    colorDanger: "#ef4444",
    colorTextSecondary: "#818180",     // Your neutral-500
    colorTextPlaceholder: "#cbc8c5",   // Your neutral-400
    
    // Typography
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSizeBase: "16px",
    fontWeightNormal: "400",
    fontWeightMedium: "500",
    fontWeightBold: "600",
    
    // Spacing and borders - NO ROUNDED CORNERS
    spacingUnit: "4px",
    borderRadius: "0px",               // CRITICAL: Matches your design system
    
    // Input styling
    colorInputBackground: "#ffffff",
    colorInputBorder: "#e3e1de",       // Your neutral-300
    colorInputText: "#131313",
    
    // Focus states
    focusBoxShadow: "0 0 0 3px rgba(255, 76, 36, 0.1)",
    focusOutline: "none",
  },
  rules: {
    ".Input": {
      border: "1px solid #e3e1de",
      borderRadius: "0",               // NO rounded corners
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
      padding: "12px",
      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    },
    ".Input:hover": {
      borderColor: "#cbc8c5",
    },
    ".Input:focus": {
      borderColor: "#ff4c24",
      boxShadow: "0 0 0 3px rgba(255, 76, 36, 0.1)",
    },
    ".Label": {
      fontWeight: "500",
      color: "#131313",
      fontSize: "14px",
    },
    ".Tab": {
      border: "1px solid #e3e1de",
      borderRadius: "0",               // NO rounded corners
      padding: "12px 16px",
      transition: "all 0.2s ease",
    },
    ".Tab--selected": {
      borderColor: "#ff4c24",
      backgroundColor: "#fff2f0",
      boxShadow: "0 0 0 1px #ff4c24",
    },
  },
}
```

### Key Improvements

1. **Exact Color Matching**: Uses your app's `#ff4c24` primary color (was `#ff6b35`)
2. **Typography Consistency**: Matches your font family and weights
3. **Border and Spacing**: Uses your neutral colors (#e3e1de, #cbc8c5)
4. **Focus States**: Custom focus rings matching your primary color
5. **Tab Styling**: Selected tab uses your primary-light background (#fff2f0)
6. **Hover Effects**: Subtle transitions matching your app's interactions
7. **🎯 NO Rounded Corners**: `borderRadius: "0"` matches your sharp, clean design system

---

## CSS Enhancements

### Updated `stripe-payment.css`

**All Cards/Sections - NO Rounded Corners:**
```css
.purchase-event-details,
.purchase-summary-card,
.purchase-payment-section,
.purchase-error-card,
.purchase-success-card {
  background: var(--color-neutral-100);
  border-radius: 0;  /* NO rounded corners - matches your design system */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.payment-element-container {
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
}

.payment-amount-summary {
  padding: 1rem 1.25rem;
  background: var(--color-neutral-200);
  border: 1px solid var(--color-neutral-300);
  border-radius: 0;  /* NO rounded corners */
  font-weight: 500;
}

.payment-error-message {
  border-radius: 0;  /* NO rounded corners */
  border: 1px solid var(--color-danger);
}

/* Promo Code Section */
.purchase-promo-input,
.purchase-promo-apply-btn,
.purchase-promo-applied {
  border-radius: 0; /* NO rounded corners */
}
```

**Design Philosophy:**
- Sharp, clean edges throughout
- Only circular icons use `border-radius: 50%`
- Matches your app's existing event cards, catalog, contact forms, etc.

---

## Alternative Approaches (Not Recommended)

### 1. ❌ Custom Card Elements (Deprecated by Stripe)

Stripe previously offered individual `CardElement`, `CardNumberElement`, etc., which allowed more granular control. However:

- **Deprecated** by Stripe in favor of `PaymentElement`
- Missing modern payment methods (Apple Pay, Google Pay, BNPL)
- More maintenance burden
- Less secure (more PCI compliance responsibility)

### 2. ❌ Stripe Checkout (Hosted Page)

Stripe Checkout is a fully hosted payment page:

**Pros:**
- Even less code to maintain
- Stripe handles entire UI

**Cons:**
- **User leaves your site** (redirects to checkout.stripe.com)
- **No control over styling** (only Stripe's themes)
- **Poorer UX** for your users (breaks flow)
- Cannot integrate with your hold/RSVP system

### 3. ✅ Current Approach: PaymentElement with Enhanced Appearance (Recommended)

This is the **best balance** of:
- Security (PCI compliant, handled by Stripe)
- Customization (reasonable styling control)
- Modern features (all payment methods)
- User experience (embedded in your site)

---

## Best Practices

### 1. Use Stripe's Appearance API Fully

We've now implemented:
- ✅ All relevant color variables
- ✅ Typography variables
- ✅ Component-specific rules
- ✅ Focus and hover states

### 2. Keep Surrounding UI Consistent

The container around Stripe Elements should match your app:
- ✅ Purchase summary card styling
- ✅ Event details section
- ✅ Button styling (using your `.btn.is--primary`)

### 3. Test Across Payment Methods

Stripe PaymentElement automatically shows different layouts for:
- Credit/debit cards
- Apple Pay / Google Pay
- Bank transfers
- Buy Now Pay Later (Klarna, Affirm)

Make sure your appearance configuration looks good with all methods.

### 4. Mobile Responsiveness

Your current implementation already handles this well with:
```css
@media (max-width: 768px) {
  .purchase-page-container { padding: 1rem 0.5rem; }
  .purchase-payment-section { padding: 1.5rem; }
}
```

---

## Testing the Updated Styles

### Visual Inspection Checklist

1. **Colors:**
   - [ ] Primary color is your orange (#ff4c24)
   - [ ] Input borders match your neutral-300 (#e3e1de)
   - [ ] Focus states show your primary color

2. **Typography:**
   - [ ] Font matches your app's system font
   - [ ] Labels are medium weight (500)
   - [ ] Text is your dark color (#131313)

3. **Interactions:**
   - [ ] Hover states show subtle color change
   - [ ] Focus shows orange border + subtle shadow
   - [ ] Tabs show your primary-light background when selected

4. **Integration:**
   - [ ] Payment form fits naturally in purchase page
   - [ ] Spacing is consistent with event details and summary
   - [ ] Overall page feels cohesive

### Browser Testing

Test in:
- Chrome/Edge (Chromium)
- Safari
- Firefox
- Mobile browsers (iOS Safari, Chrome Mobile)

---

## Further Customization Options

If you need even more customization, you can:

### 1. Add Custom CSS Around Elements

Wrap the payment section with custom UI:

```tsx
<div className="custom-payment-wrapper">
  <div className="payment-instructions">
    <p>Enter your payment details below. Your information is secure.</p>
  </div>
  
  <PaymentElement />
  
  <div className="payment-trust-badges">
    <img src="/badges/visa.svg" alt="Visa" />
    <img src="/badges/mastercard.svg" alt="Mastercard" />
    <img src="/badges/ssl.svg" alt="SSL Secure" />
  </div>
</div>
```

### 2. Use More Appearance Variables

Stripe supports many variables - see [Stripe Appearance API docs](https://stripe.com/docs/elements/appearance-api):

```typescript
variables: {
  colorSuccess: "#0ba954",
  colorWarning: "#f59e0b",
  spacingTab: "12px",
  spacingGridColumn: "20px",
  spacingGridRow: "20px",
  // ... and more
}
```

### 3. Add Custom Rules for Specific Elements

Target specific Stripe components:

```typescript
rules: {
  ".TabIcon": { /* style payment method icons */ },
  ".TabLabel": { /* style payment method labels */ },
  ".Block": { /* style container blocks */ },
  ".CheckboxInput": { /* style checkboxes */ },
  ".RedirectText": { /* style redirect messages */ },
}
```

---

## Limitations to Accept

Some things will always be controlled by Stripe:

1. **Payment method logos** (Visa, Mastercard, etc.)
2. **3D Secure authentication** (bank-hosted pages)
3. **Apple Pay / Google Pay sheets** (OS-controlled)
4. **Error messages** (Stripe's validation text)
5. **Loading states** (Stripe's spinners)

These are **intentional** for security and compliance. Stripe must control these to maintain PCI compliance and fraud protection.

---

## Summary

### What We've Done ✅

1. **Updated appearance configuration** to match your app's design system exactly
2. **Enhanced CSS** for better integration with your purchase page
3. **Documented** all customization options and limitations

### What You Get 🎉

- Payment form that **closely matches** your app's styling
- **Secure, PCI-compliant** checkout (handled by Stripe)
- **Modern payment methods** (cards, wallets, BNPL)
- **Better UX** than the old 10-field Datafast form

### What You Can't Change 🚫

- Internal Stripe Elements structure
- Payment provider logos and branding
- 3D Secure and bank authentication flows

---

## Cancel Purchase Feature

### Overview

The checkout now includes a **"Cancel Purchase"** button that allows users to cancel their hold and release tickets back to inventory.

### Implementation

**Location:** Displayed within the payment section, below the "Complete Purchase" button (only for hold-based purchases, not RSVP flow)

**Behavior:**
1. Shows confirmation dialog: "Are you sure you want to cancel this purchase? Your tickets will be released."
2. Calls `/api/holds/cancel` endpoint
3. Deletes the hold (releases tickets back to inventory)
4. Revalidates event page cache for immediate availability updates
5. Redirects user back to the event page

**Security:**
- Verifies user ownership before deleting hold
- Prevents cancelling holds that are already converted to orders
- Double-checks ownership at database level

**Styling:**
```css
.purchase-cancel-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-neutral-300);  /* Simple separator */
  text-align: center;
}

.purchase-cancel-btn {
  /* Uses .btn.is--secondary (dark background) */
  width: 100%;
}
```

**Layout:**
- Positioned inside the payment section container
- Separated by a subtle border-top line
- No separate card/container (keeps UI clean)
- Full-width button matching the payment button above

**User Flow:**
```text
Hold Created → Checkout Page → [Complete Purchase or Cancel Purchase] → 
If Cancel: Confirmation Dialog → Hold Deleted → Tickets Released → Redirect to Event Page
```

---

## Handling Incomplete Transactions

You may notice "Incomplete" transactions in your Stripe Dashboard. These occur when a user starts the checkout process (which creates a PaymentIntent) but does not complete the payment (e.g., closes the window).

### Is this a problem?
**No, this is normal behavior.** PaymentIntents are created early in the flow to initialize the Stripe Elements UI.

### Automatic Expiry

PaymentIntents have different auto-expiry behaviors depending on their context:

- **Checkout Session–attached PaymentIntents:** Automatically cancel when the Session expires (24 hours default)
- **Subscription first-invoice PaymentIntents:** Automatically cancel after ~23 hours
- **Manual-capture (`capture_method: "manual"`) PaymentIntents:** Expire after the 7-day authorization window (varies by card network: Visa ~5 days, others ~7 days)
- **Standalone/abandoned PaymentIntents:** Do NOT automatically cancel and remain incomplete unless your Hold cleanup logic or a manual cancellation removes them

Incomplete PaymentIntents from abandoned checkout flows should be cleaned up via your Hold expiration logic (releasing inventory) and will eventually be canceled by Stripe or remain as incomplete.

### Recommended Action
*   **Do nothing** for the PaymentIntents themselves; let Stripe auto-expire them.
*   **Ensure Hold Cleanup:** Ensure your app has a mechanism (cron job or triggered function) to call the hold cleanup logic.
*   **Cancel Button:** The "Cancel Purchase" button we added allows users to manually release the hold and cancel the process immediately.
*   **Pre-Flight Check:** The checkout flow validates that the hold is still active and not expired before allowing payment submission, preventing charges against invalid or expired holds. This validation occurs in the hold validation endpoint (`/api/holds/validate`) before the payment form is submitted.

---

1. **Test the changes** in your development environment
2. **Review the styling** on different screen sizes
3. **Try different payment methods** (if enabled)
4. **Test the cancel button** for hold-based purchases
5. **Gather user feedback** on the checkout experience

If you need further customization, refer to:
- [Stripe Elements Appearance API](https://stripe.com/docs/elements/appearance-api)
- [Stripe PaymentElement Documentation](https://stripe.com/docs/payments/payment-element)

---

**Questions?** Check the Stripe documentation or review this guide's customization examples.
