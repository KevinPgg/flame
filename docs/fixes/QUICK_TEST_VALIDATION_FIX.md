# 🚀 Quick Test Guide: Datafast Validation Fix

## What Was Fixed

Before: Clicking "Pay Now" → Loading screens → Error page saying "go back to events"
After: Clicking "Pay Now" → Validation errors show in iframe → User can correct and retry

---

## 🧪 Quick Tests (5 minutes)

### ✅ Test 1: Missing Cardholder (30 seconds)

1. Go to `/purchase` with valid token
2. Fill billing info, click "Proceed to Payment"
3. Fill card: `4200000000000000`, expiry: `12/25`, CVV: `123`
4. **SKIP cardholder name** (leave empty)
5. Click "Pay Now" button

**✅ PASS IF:**

- No loading screens appear
- Cardholder field gets red border
- Error message shows below iframe: "Please enter the cardholder name..."
- You can type name and try again

**❌ FAIL IF:**

- Loading screen appears
- You're redirected to error page
- Iframe disappears

---

### ✅ Test 2: All Fields Valid (30 seconds)

1. Same setup as Test 1
2. Fill ALL fields including cardholder: `Test User`
3. Click "Pay Now"

**✅ PASS IF:**

- Loading screen appears: "Processing your payment..."
- Page navigates with `resourcePath` parameter
- Payment processes normally

**❌ FAIL IF:**

- Stuck on form
- Validation error appears
- Nothing happens

---

### ✅ Test 3: Multiple Corrections (1 minute)

1. Try to submit with empty cardholder → See error
2. Fill cardholder, leave CVV as "12" (invalid)
3. Try to submit → May see error
4. Fix CVV to "123"
5. Submit → Should process

**✅ PASS IF:**

- Each error shows immediately
- Iframe stays visible throughout
- Can correct and retry without page refresh
- Final submit processes successfully

---

## 📊 What to Look For

### Good Signs ✅

- Errors show **below the iframe** in a red box
- Iframe **never disappears** during validation
- Loading screen **only shows AFTER validation passes**
- You can **correct mistakes** without leaving page
- Helpful message: "Fill in all card details including cardholder name..."

### Bad Signs ❌

- Loading screen shows immediately on "Pay Now" click
- Iframe disappears when there's an error
- Redirected to error page for simple validation errors
- Can't retry without refreshing page

---

## 🔍 Console Logs to Check

Open browser DevTools Console, you should see:

```
=== Setting up Datafast Widget Callbacks ===
✅ wpwlOptions configured
=== Loading Datafast Widget Script ===
✅ Datafast widget script loaded successfully
✅ Datafast widget ready

// When you click "Pay Now" with missing cardholder:
🔍 Datafast validating card before submit...
❌ Validation failed: Cardholder name is required

// When you click "Pay Now" with all fields valid:
🔍 Datafast validating card before submit...
✅ Client-side validation passed
🚀 Datafast form submitted successfully - starting payment processing
```

---

## 🎯 Quick Checklist

- [ ] Can see Datafast payment iframe
- [ ] Submitting with empty cardholder shows error below iframe
- [ ] Error message is clear and actionable
- [ ] Iframe stays visible during validation errors
- [ ] Can correct the error and try again immediately
- [ ] Loading screen only shows when validation passes
- [ ] Successful payments process normally

---

## 💡 Pro Tips

1. **Use DevTools**: Open console to see callback logs
2. **Test Edge Cases**: Try empty fields, invalid formats
3. **Check Mobile**: Test on phone if possible
4. **Multiple Retries**: Make sure you can retry multiple times
5. **Network Tab**: Verify no premature API calls

---

## 📞 If Something's Wrong

### Iframe not showing at all

- Check console for script loading errors
- Verify checkoutId is created successfully
- Check if there's an error message above payment section

### Validation errors still cause redirect

- Verify `onBeforeSubmitCard` returns `false` for invalid input
- Check that `processingPayment` is not set to `true` too early
- Look for console error: "wpwlOptions configured"

### Loading screen shows too early

- Check console: "🚀 Datafast form submitted successfully" should appear BEFORE loading
- Verify `processingPayment && checkoutId` condition in loading screen logic

---

**Status:** ✅ Ready for Testing
**Expected Test Time:** 5 minutes
**Last Updated:** October 20, 2025
