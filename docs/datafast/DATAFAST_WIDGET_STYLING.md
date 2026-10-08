# 🎨 Datafast Widget Custom Styling

> ⚠️ **LEGACY DOCUMENTATION**: This document describes a deprecated Datafast widget implementation that has been replaced by Stripe Connect. Retained for historical reference only.
> 
> **Current Implementation**: The application now uses Stripe Elements for payment forms. See `app/components/StripePurchaseFlow.tsx`.
> 
> **Evolution Note**: This document describes an early styling approach using `!important` overrides. This was later superseded by `DATAFAST_WIDGET_STYLING_PROPER.md` which used `style: "plain"` (a cleaner approach). Both implementations are now deprecated in favor of Stripe.

---

## Overview (Historical)

The Datafast payment widget matched the app's design system with consistent styling across all form elements using CSS overrides.

---

## What Was Changed

### Problem:

- Datafast widget had default rounded corners (border-radius)
- Widget fields looked different from billing form fields
- Inconsistent font sizes, colors, and spacing
- Different focus states and button styles

### Solution:

- ✅ Removed all border-radius (sharp corners like rest of app)
- ✅ Matched input field styling to billing fields
- ✅ Consistent focus states with orange glow
- ✅ Same typography and spacing
- ✅ Cohesive design throughout checkout flow

---

## CSS Overrides Applied

### 1. **Remove Border Radius**

```css
/* All widget elements now have sharp corners */
.purchase-payment-widget .wpwl-control,
.purchase-payment-widget .wpwl-button,
.purchase-payment-widget .wpwl-group,
.purchase-payment-widget .wpwl-wrapper,
.purchase-payment-widget .wpwl-form {
  border-radius: 0 !important;
}
```

### 2. **Match Input Field Styling**

```css
.purchase-payment-widget .wpwl-control {
  padding: calc(var(--gap) * 0.75) !important;
  border: 1px solid var(--color-neutral-300) !important;
  font-size: calc(var(--size-font) * 0.875) !important;
  color: var(--color-neutral-800) !important;
  background-color: var(--color-neutral-100) !important;
  transition: all 0.2s ease !important;
  font-family: inherit !important;
}
```

**Result:** Widget inputs look identical to billing form inputs.

### 3. **Consistent Focus States**

```css
.purchase-payment-widget .wpwl-control:focus {
  outline: none !important;
  border-color: var(--color-primary) !important;
  box-shadow: 0 0 0 3px rgba(255, 76, 36, 0.1) !important;
}
```

**Result:** Same orange glow focus effect as billing fields.

### 4. **Match Label Styling**

```css
.purchase-payment-widget .wpwl-label {
  font-size: calc(var(--size-font) * 0.875) !important;
  font-weight: 600 !important;
  color: var(--color-neutral-700) !important;
  margin-bottom: calc(var(--gap) * 0.5) !important;
}
```

**Result:** Widget labels match billing field labels exactly.

### 5. **Payment Button Styling**

```css
.purchase-payment-widget .wpwl-button-pay {
  padding: calc(var(--gap) * 0.75) calc(var(--gap) * 1.5) !important;
  border: none !important;
  font-size: calc(var(--size-font) * 0.875) !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  transition: all 0.2s ease !important;
  font-family: inherit !important;
}
```

**Result:** "Pay Now" button matches your app's button style.

### 6. **Alert Boxes (Test Mode & Errors)**

```css
/* Test mode note - no border radius */
.purchase-payment-test-note {
  border-radius: 0;
  background-color: #fff3cd;
  border: 1px solid #ffc107;
}

/* Widget error messages - no border radius */
.purchase-widget-error {
  border-radius: 0;
  background-color: #fef2f2;
  border: 1px solid #fca5a5;
}
```

**Result:** All alert boxes now have sharp corners matching the app style.

### 7. **Remove Shadows & Add Consistent Spacing**

```css
/* Remove default shadows */
.purchase-payment-widget .wpwl-control,
.purchase-payment-widget .wpwl-button {
  box-shadow: none !important;
}

/* Only show shadow on focus */
.purchase-payment-widget .wpwl-control:focus {
  box-shadow: 0 0 0 3px rgba(255, 76, 36, 0.1) !important;
}

/* Consistent field spacing */
.purchase-payment-widget .wpwl-group-brand,
.purchase-payment-widget .wpwl-group-cardNumber,
.purchase-payment-widget .wpwl-group-expiry,
.purchase-payment-widget .wpwl-group-cvv,
.purchase-payment-widget .wpwl-group-cardHolder {
  margin-bottom: calc(var(--gap) * 1.25) !important;
}
```

**Result:** Clean, minimal look with consistent spacing matching billing fields.

---

## Visual Comparison

### Before:

```text
Billing Fields:
┌─────────────────────┐
│ John Doe           │ ← Sharp corners
└─────────────────────┘

Payment Widget:
╭─────────────────────╮
│ 4242 4242 4242 4242│ ← Rounded corners (didn't match)
╰─────────────────────╯
```

### After:

```text
Billing Fields:
┌─────────────────────┐
│ John Doe           │ ← Sharp corners
└─────────────────────┘

Payment Widget:
┌─────────────────────┐
│ 4242 4242 4242 4242│ ← Sharp corners (matches!)
└─────────────────────┘
```

---

## Design System Consistency

All elements now use:

| Property          | Value                            | Source              |
| ----------------- | -------------------------------- | ------------------- |
| **Border Radius** | `0`                              | App standard        |
| **Input Padding** | `calc(var(--gap) * 0.75)`        | Billing fields      |
| **Border Color**  | `var(--color-neutral-300)`       | Billing fields      |
| **Font Size**     | `calc(var(--size-font) * 0.875)` | Billing fields      |
| **Text Color**    | `var(--color-neutral-800)`       | Billing fields      |
| **Background**    | `var(--color-neutral-100)`       | Billing fields      |
| **Focus Border**  | `var(--color-primary)`           | Primary brand color |
| **Focus Glow**    | `rgba(255, 76, 36, 0.1)`         | Brand orange        |

---

## Why `!important` is Used

Datafast injected its own inline styles and external CSS that had high specificity. `!important` was used to ensure custom styles overrode theirs without conflicts.


**This was safe because:**

- ✅ We're only targeting elements within `.purchase-payment-widget` (scoped)
- ✅ Datafast widget is embedded content (not our native code)
- ✅ No risk of cascading issues to other parts of the app
- ✅ Standard practice for overriding third-party widget styles

---

## Browser Compatibility

These styles work in all modern browsers:

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers

---

## Datafast Compliance ✅

These styling overrides are **fully compliant** with Datafast requirements:

1. ✅ **No modification of secure iframe** - Card data remains in secure iframe
2. ✅ **PCI-DSS safe** - Only styling wrapper elements, not touching card input internals
3. ✅ **Widget functionality intact** - All validation and processing works normally
4. ✅ **No JavaScript changes needed** - Pure CSS overrides

**From Datafast Guide Section 5.6:** "Estilo del formulario" - The guide explicitly supports customization of form styles.

---

## Testing Checklist

### Visual Checks:

- [ ] Widget fields have no border-radius (sharp corners)
- [ ] Input fields match billing fields (same padding, colors, borders)
- [ ] Focus states show orange glow like billing fields
- [ ] Labels match billing field labels (size, weight, color)
- [ ] "Pay Now" button matches app button style
- [ ] All text uses app's font family

### Functional Checks:

- [ ] Card number input still works
- [ ] CVV input still works
- [ ] Expiry date input still works
- [ ] Cardholder name input still works
- [ ] Validation errors still show properly
- [ ] Payment submission still works

---

## Customization Guide

If you want to adjust the styling further, here's what to modify:

### Change Input Field Height

```css
.purchase-payment-widget .wpwl-control {
  padding: YOUR_VALUE !important;
}
```

### Change Focus Color

```css
.purchase-payment-widget .wpwl-control:focus {
  border-color: YOUR_COLOR !important;
  box-shadow: 0 0 0 3px rgba(YOUR_RGB, 0.1) !important;
}
```

### Change Button Style

```css
.purchase-payment-widget .wpwl-button-pay {
  background-color: YOUR_COLOR !important;
  color: YOUR_TEXT_COLOR !important;
}
```

---

## Known Datafast Widget Classes

These are the main classes Datafast uses (useful for further customization):

| Class                      | Element               |
| -------------------------- | --------------------- |
| `.wpwl-form`               | Form container        |
| `.wpwl-control`            | Input fields          |
| `.wpwl-control-cardNumber` | Card number field     |
| `.wpwl-control-cvv`        | CVV field             |
| `.wpwl-control-expiry`     | Expiry field          |
| `.wpwl-control-cardHolder` | Cardholder name field |
| `.wpwl-label`              | Field labels          |
| `.wpwl-button-pay`         | Pay button            |
| `.wpwl-group`              | Field groups          |
| `.wpwl-wrapper`            | Field wrappers        |

---

## Troubleshooting

### Issue: Styles not applying

**Solution:** Check browser DevTools to see if Datafast is loading its CSS after yours. The `!important` should handle this, but you may need to increase specificity.

### Issue: Border-radius still showing

**Solution:** Check if there are additional Datafast elements that need the border-radius override. Add them to the CSS rules.

### Issue: Focus state not working

**Solution:** Ensure the focus pseudo-class is applied correctly. Try adding `:focus-visible` for better keyboard navigation support.

---

## Future Enhancements

Possible improvements:

1. Add dark mode support for widget
2. Add custom error message styling
3. Add loading states for widget
4. Add animation transitions
5. Mobile-specific optimizations

---

## Summary

**What:** Custom CSS to style Datafast widget to match app design
**Why:** Consistent user experience, professional appearance
**How:** CSS overrides with `!important` to beat Datafast's styles
**Impact:** Seamless checkout flow, better brand cohesion
**Risk:** None - pure CSS, no functionality changes

---

**File Referenced:** `docs/datafast/DATAFAST_WIDGET_STYLING.md` (this documentation file)  
**Content:** 359 lines of Markdown documentation  
**Breaking Changes:** None  
**Status:** ⚠️ Deprecated — Historical Documentation  
**Created:** October 20, 2025  
**Added to Repository:** January 2026 (as historical documentation)
