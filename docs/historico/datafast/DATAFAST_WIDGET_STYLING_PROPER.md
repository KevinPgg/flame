# 🎨 Datafast Widget Custom Styling - Proper Implementation

> ⚠️ **LEGACY DOCUMENTATION**: This document describes a deprecated Datafast widget implementation that has been replaced by Stripe Connect. Retained for historical reference only.
> 
> **Current Implementation**: The application now uses Stripe Elements for payment forms. See `app/components/StripePurchaseFlow.tsx`.
> 
> **Related Legacy Docs**: See also `DATAFAST_WIDGET_STYLING.md` which documents an earlier iteration using `!important` overrides (superseded by this approach before both were deprecated).

---

## Overview (Historical)

The Datafast payment widget used the **official corporate styling approach** recommended in the Datafast Implementation Guide Section 5.6 "Estilo del formulario" (Form Styling).

**Key Change:** This approach used `style: "plain"` instead of `style: "card"` which provided a blank canvas to apply custom corporate styles **without** needing `!important` overrides.

---

## Why This Approach?

### ❌ Previous Approach (Not Maintainable):

- Used `style: "card"` (Datafast's default styled widget)
- Fought with their CSS using `!important` everywhere
- Brittle - breaks when Datafast updates their styles
- Hard to maintain and debug

### ✅ New Approach (Datafast Recommended):

- Uses `style: "plain"` (minimal styling from Datafast)
- Apply our own corporate styles cleanly
- No `!important` needed
- Maintainable and follows Datafast best practices
- Officially supported per Guide Section 5.6

---

## Implementation

### 1. **wpwlOptions Configuration**

```typescript
// app/purchase/page.tsx
(window as any).wpwlOptions = {
  onReady: function () {
    /* ... */
  },
  onBeforeSubmitCard: function () {
    /* ... */
  },
  onSubmit: function () {
    /* ... */
  },
  onError: function (error: any) {
    /* ... */
  },

  style: "plain", // ← KEY: Use plain style for corporate styling
  locale: "en",
  labels: {
    cvv: "CVV",
    cardHolder: "Cardholder Name (as shown on card)",
  },
};
```

**From Datafast Guide Section 5.6:**

> "En alguna ocasión se necesita que el formulario se contraste con los colores corporativos, para este caso puede optar con la modalidad 'plana', para esto debe cambiar el parámetro style con el valor plain. Luego puede aplicar sus propias reglas de estilos."

Translation: "Sometimes you need the form to match corporate colors. For this case you can use the 'plain' mode by changing the style parameter to 'plain'. Then you can apply your own style rules."

---

### 2. **CSS Styling (Clean, No !important)**

```css
/* app/styles/components/purchase.css */

/* Labels - match billing field labels */
.purchase-payment-widget .wpwl-label {
  font-size: calc(var(--size-font) * 0.875);
  font-weight: 600;
  color: var(--color-neutral-700);
  display: block;
  margin-bottom: calc(var(--gap) * 0.5);
}

/* Input fields - match billing fields */
.purchase-payment-widget .wpwl-control {
  width: 100%;
  padding: calc(var(--gap) * 0.75);
  border: 1px solid var(--color-neutral-300);
  font-size: calc(var(--size-font) * 0.875);
  color: var(--color-neutral-800);
  background-color: var(--color-neutral-100);
  transition: all 0.2s ease;
  font-family: inherit;
}

/* Focus state - orange glow */
.purchase-payment-widget .wpwl-control:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(255, 76, 36, 0.1);
}

/* Error states */
.purchase-payment-widget .wpwl-has-error .wpwl-control {
  border-color: var(--color-danger);
  background-color: #fff5f5;
}

/* Pay button */
.purchase-payment-widget .wpwl-button-pay {
  width: 100%;
  padding: calc(var(--gap) * 0.75) calc(var(--gap) * 1.5);
  border: none;
  font-size: calc(var(--size-font) * 0.875);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
  margin-top: calc(var(--gap));
}

/* IMPORTANT: Iframe styling for secure fields */
/* Card number and CVV use iframes for PCI compliance */
.purchase-payment-widget iframe {
  width: 100% !important;
  height: 40px !important;
  border: 1px solid var(--color-neutral-300);
  background-color: var(--color-neutral-100);
  display: block;
}

/* Brand dropdown options visibility */
.purchase-payment-widget .wpwl-control-brand option {
  color: var(--color-neutral-800);
  background-color: var(--color-neutral-100);
}
```

**Notice:** No `!important` anywhere except for iframe dimensions (needed because Datafast sets inline styles on iframes). Clean, maintainable CSS.

---

## What Gets Styled

### Widget Elements Styled:

- ✅ `.wpwl-label` - Field labels
- ✅ `.wpwl-control` - Input fields (expiry, cardholder)
- ✅ `.wpwl-control-brand` - Brand selector dropdown
- ✅ `iframe` - **Secure fields (card number, CVV)** - Uses iframes for PCI compliance
- ✅ `.wpwl-button-pay` - Pay button
- ✅ `.wpwl-group` - Field grouping and spacing
- ✅ `.wpwl-hint` - Error messages
- ✅ `.wpwl-has-error` - Error state styling

> **⚠️ Important:** Card number and CVV fields are rendered as **iframes** by Datafast for PCI compliance. They require explicit styling (height, width, border) to be visible and clickable. This is the only place we use `!important` to override Datafast's inline styles.

### Design Tokens Used:

| Element     | Our App Style                 | CSS Variable                                           |
| ----------- | ----------------------------- | ------------------------------------------------------ |
| **Labels**  | Small, bold, dark gray        | `var(--size-font) * 0.875`, `var(--color-neutral-700)` |
| **Inputs**  | White background, gray border | `var(--color-neutral-100)`, `var(--color-neutral-300)` |
| **Focus**   | Orange glow                   | `var(--color-primary)`, `rgba(255, 76, 36, 0.1)`       |
| **Errors**  | Red border, pink background   | `var(--color-danger)`, `#fff5f5`                       |
| **Spacing** | Consistent gaps               | `var(--gap)`                                           |

---

## Benefits of This Approach

### 1. **Maintainability** 🔧

- Clean CSS without specificity wars
- Easy to update and modify
- No fighting with Datafast's styles

### 2. **Performance** ⚡

- Less CSS to parse (no redundant !important rules)
- Faster rendering
- Smaller stylesheet

### 3. **Reliability** ✅

- Won't break when Datafast updates
- Officially supported approach
- Follows best practices

### 4. **Compliance** 📋

- Recommended by Datafast Guide Section 5.6
- PCI-DSS compliant (no card data touched)
- Widget functionality intact

---

## Visual Consistency

All elements now match your app's design system:

```
Billing Fields:          Payment Widget:
┌──────────────────┐     ┌──────────────────┐
│ First Name       │     │ Card Number      │
│ [John Doe    ]   │     │ [4242 4242...]   │
└──────────────────┘     └──────────────────┘
   Same padding            Same padding
   Same borders            Same borders
   Same colors             Same colors
   Same fonts              Same fonts
   Same focus glow         Same focus glow
```

---

## Testing Checklist

### Visual Tests:

- [ ] Widget fields match billing fields exactly
- [ ] No rounded corners (sharp corners everywhere)
- [ ] Same focus effect (orange glow)
- [ ] Labels match in size, weight, color
- [ ] Spacing between fields is consistent
- [ ] Pay button looks like other buttons in app

### Functional Tests:

- [ ] Card number input works
- [ ] CVV input works
- [ ] Expiry date input works
- [ ] Cardholder name validation works
- [ ] Error messages display correctly
- [ ] Payment submission works
- [ ] All callbacks fire properly

---

## Debugging Tips

### If Styles Don't Apply:

1. Check that `style: "plain"` is set in wpwlOptions
2. Check browser DevTools to see which styles are applied
3. Verify your CSS is loading after Datafast's base CSS
4. Check for typos in CSS class names (wpwl-\*)

### If Widget Looks Different:

1. Clear browser cache
2. Check that wpwlOptions is set BEFORE script loads
3. Verify Datafast script loaded successfully
4. Check console for any JavaScript errors

---

## Customization Examples

### Change Input Height:

```css
.purchase-payment-widget .wpwl-control {
  padding: 1rem; /* Increase padding for taller fields */
}
```

### Change Focus Color:

```css
.purchase-payment-widget .wpwl-control:focus {
  border-color: #your-brand-color;
  box-shadow: 0 0 0 3px rgba(your-rgb, 0.1);
}
```

### Style Brand Dropdown:

```css
.purchase-payment-widget .wpwl-control-brand {
  /* Custom dropdown styling */
  background-color: #f9f9f9;
}
```

---

## Migration from Old Approach

If you were using the old approach with `style: "card"` and `!important`:

1. ✅ Change `style: "card"` to `style: "plain"` in wpwlOptions
2. ✅ Remove all `!important` from CSS rules
3. ✅ Test widget displays correctly
4. ✅ Verify all functionality still works

---

## References

1. **Datafast Implementation Guide**

   - Section 5.6: "Estilo del formulario"
   - Section 5.7: "Optimización Móvil"

2. **Datafast Guide Quote:**

   > "En alguna ocasión se necesita que el formulario se contraste con los colores corporativos, para este caso puede optar con la modalidad 'plana'..."

   (Use plain mode for corporate color matching)

---

## Summary

**What:** Use Datafast's official `style: "plain"` for corporate styling
**Why:** Maintainable, reliable, officially supported
**How:** Set `style: "plain"` in wpwlOptions, apply clean CSS
**Result:** Perfect match with app design, no `!important` needed

**Key Takeaway:** Following Datafast's recommended approach (Section 5.6) gives us a maintainable, clean solution that won't break when they update their widget.

---

**Files Modified (Historical):**

- `app/purchase/page.tsx` (wpwlOptions) - No longer contains Datafast code
- `app/styles/components/purchase.css` (clean CSS) - Datafast styles may have been removed

**Breaking Changes:** None (at time of implementation)  
**Status:** ⚠️ Deprecated — Superseded by Stripe Elements  
**Originally Created:** October 20, 2025  
**Added to Repository:** January 2026 (as historical documentation)  
**Datafast Guide Compliance:** ✅ Section 5.6 (Historical)
