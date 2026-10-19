# 🛡️ Datafast Error Handling Guide

## 📊 Overview

Your checkout flow now has **comprehensive error handling** for all ~50+ Datafast error codes, organized into 3 smart categories with appropriate user actions.

---

## 🎯 Error Categories & Flow

### 1️⃣ **NON-RECOVERABLE ERRORS** (23 codes)
**What they are:** Card/account issues that cannot be fixed immediately  
**User Action:** `NEW_TRANSACTION` - Use different payment method  
**System Action:** Clear checkout session → Offer to browse events

#### Examples:
- `800.100.165` - Card reported as lost
- `800.100.159` - Card reported as stolen
- `800.100.155` - Insufficient funds
- `100.100.303` - Card expired
- `800.100.170` - Transaction not permitted for this card type
- `800.100.162` - Transaction limit exceeded
- Response `80` - Merchant cancelled (your $5 error!)
- Response `51` - Insufficient funds
- Response `41/43` - Lost/stolen card

**User Experience:**
```
❌ Payment Declined

"Insufficient funds. Please use a different payment method."

[Browse Events]
```

After 1 second, user is prompted:
```
Would you like to browse other events? [OK] [Cancel]
```

---

### 2️⃣ **RETRYABLE ERRORS** (22 codes)
**What they are:** Temporary issues or correctable input errors  
**User Action:** `RETRY` - Try again on same page  
**System Action:** Clear checkout → Keep user on /purchase → Show "Try Again" button

#### Examples:
- `800.100.152` - Generic authorization decline (can retry)
- `800.100.197` - Customer cancelled 3DS/OTP
- `800.100.176` - Temporarily unavailable
- `800.100.157` - Wrong expiry date
- `800.100.151` - Invalid card number
- `900.100.100` - Bank connection error (temporary)
- `900.100.200` - Timeout
- Response `05` - Bank rejected (generic)
- Response `19/88` - Retry transaction
- Response `91` - Bank offline

**User Experience:**
```
❌ Payment Declined

"Transaction declined. Please verify your card details and try again."

[Try Again]  [Browse Events]
```

Clicking "Try Again" reloads the page, user re-fills billing info and tries different card or same card again.

---

### 3️⃣ **TECHNICAL ERRORS** (14 codes)
**What they are:** System/configuration issues requiring admin intervention  
**User Action:** `CONTACT_SUPPORT` - Get help  
**System Action:** Show support contact information

#### Examples:
- `200.100.101` - Invalid request format
- `800.100.190` - Configuration error
- `800.100.199` - Tax calculation error
- `900.100.201` - Gateway connection lost
- `100.400.325` - Risk system unavailable
- Response `ER` - Merchant config error

**User Experience:**
```
❌ Unable to Process Payment

"Payment system configuration error. Please contact support. [ERR-CONFIG]

Please contact support at support@flame-events.com"

[Browse Events]  [Contact Support]
```

---

## 🔄 Error Flow Diagram

```
User submits payment
       ↓
Datafast processes
       ↓
   ┌───────────┐
   │ Error?    │
   └─────┬─────┘
         │
    ┌────┴────┐
    │         │
 SUCCESS    FAILURE
    │         │
    │    Categorize
    │         ↓
    │    ┌────┴────┬──────────┬─────────────┐
    │    │         │          │             │
    │  NON-REC  RETRY    TECHNICAL      UNKNOWN
    │    │         │          │             │
    │    │         │          │             │
    │    ↓         ↓          ↓             ↓
    │  Clear    Clear     Support       Support
    │  Session  Session   Message       Message
    │    +         +          +             +
    │  Prompt   "Try      "Contact      "Contact
    │  Events   Again"    Support"      Support"
    │           Button     Button        Button
    │
    ↓
Complete Purchase
    ↓
Success Page
```

---

## 💻 Technical Implementation

### Backend (`app/api/datafast/verify-payment/route.ts`)

```typescript
// Import error handler
import { handleDatafastError } from "@/app/lib/datafast-error-handler";

// Categorize error
const categorizedError = handleDatafastError({
  code: errorData.result?.code,
  description: errorData.result?.description,
  resultDetails: errorData.resultDetails,
});

// Return with category and action
return NextResponse.json({
  error: categorizedError.userMessage,
  code: errorData.result?.code,
  category: categorizedError.category,    // 'NON_RECOVERABLE' | 'RETRYABLE' | 'TECHNICAL'
  action: categorizedError.action,        // 'NEW_TRANSACTION' | 'RETRY' | 'CONTACT_SUPPORT'
  showCard: categorizedError.showCard,    // true if card info should be shown
  isSuccess: false,
}, { status: 400 });
```

### Frontend (`app/purchase/page.tsx`)

```typescript
// Handle categorized errors
const errorCategory = verifyData.category;
const errorAction = verifyData.action;
const errorMessage = verifyData.error;

// NON_RECOVERABLE: Clear checkout and prompt for events
if (errorAction === 'NEW_TRANSACTION') {
  setCheckoutId(null);
  setError(errorMessage);
  setTimeout(() => {
    if (confirm(`${errorMessage}\n\nWould you like to browse other events?`)) {
      window.location.href = '/events';
    }
  }, 1000);
  return;
}

// RETRYABLE: Clear checkout to allow retry
if (errorAction === 'RETRY') {
  setCheckoutId(null);
  setError(errorMessage);
  return;
}

// CONTACT_SUPPORT: Show support message
if (errorAction === 'CONTACT_SUPPORT') {
  setError(`${errorMessage}\n\nPlease contact support at support@flame-events.com`);
  return;
}
```

### Error Handler (`app/lib/datafast-error-handler.ts`)

Central error categorization logic with:
- **50+ error code mappings**
- **User-friendly messages**
- **Actionable responses**
- **Support for both result codes and Response codes**

---

## 📋 Complete Error Code List

### Non-Recoverable (23)
```
800.100.165, 800.100.159, 800.100.168, 800.100.155, 100.100.303,
800.100.170, 800.100.179, 800.100.171, 800.100.501, 800.100.162,
800.110.100, 600.200.201, 600.200.500, 100.400.147, 100.400.149,
Response 80, 51, 54, 57, 76, 41, 43, 62
```

### Retryable (22)
```
800.100.152, 800.100.197, 800.100.176, 100.400.311, 800.100.157,
800.100.174, 800.100.151, 800.100.402, 100.100.402, 100.100.400,
100.100.100, 800.300.500, 800.300.501, 900.100.100, 900.100.200,
100.380.401, 100.380.501, 100.396.103,
Response 05, 19, 88, 91
```

### Technical (14)
```
200.100.101, 200.100.103, 800.100.190, 800.100.199, 700.300.700,
700.100.200, 700.400.200, 900.100.201, 900.100.300, 100.400.325,
100.390.108, 100.390.112, 100.700.801,
Response ER
```

---

## 🧪 Testing Error Scenarios

### Test Non-Recoverable
Use a card with insufficient funds or an expired card.

**Expected:**
1. Payment fails
2. Error message shows: "Insufficient funds. Please use a different payment method."
3. After 1 second, prompt appears asking to browse events
4. User can click "Browse Events" button

### Test Retryable
Use an incorrect CVV or cancel 3DS authentication.

**Expected:**
1. Payment fails
2. Error message shows: "Transaction declined. Please verify your card details and try again."
3. "Try Again" button appears
4. User can click "Try Again" to reload and retry with different/corrected info

### Test Technical
This would require a system configuration issue (rare in testing).

**Expected:**
1. Payment fails
2. Error message shows: "System error. Please contact support. [ERR-CODE]"
3. Support contact info displayed
4. "Contact Support" button appears

---

## 🎨 UI/UX Features

✅ **Smart Button Display**
- Non-recoverable: Only "Browse Events"
- Retryable: "Try Again" (primary) + "Browse Events" (secondary)
- Technical: "Browse Events" + "Contact Support"

✅ **Clear Messaging**
- User-friendly language
- No technical jargon (except error codes for support)
- Actionable instructions

✅ **Appropriate Actions**
- Automatic checkout clearing for retry
- Prompt before navigation
- Multi-line error message support

✅ **Logging**
- All errors logged to `datafast_transactions` table
- Error category and action logged to console
- Full error details preserved for debugging

---

## 🚀 Benefits

1. **Better UX**: Users know exactly what to do for each error type
2. **Reduced Support Load**: Clear error messages reduce confusion
3. **Higher Conversion**: Retryable errors allow immediate recovery
4. **Easier Debugging**: Categorized errors help identify systemic issues
5. **Compliance**: Professional error handling as expected by payment processors

---

## 📞 Support Information

For any payment errors users should contact:
- **Email:** support@flame-events.com
- **Error Code:** Always displayed in technical errors for reference
- **Transaction ID:** Logged in database for lookup

---

## 🔄 Future Enhancements

Possible improvements:
1. Add retry counter (max 3 attempts before forcing new transaction)
2. Implement exponential backoff for temporary errors
3. Show card brand icons for "showCard" errors
4. Add analytics tracking for error categories
5. Create admin dashboard for error monitoring

---

**Last Updated:** October 17, 2025  
**Version:** 1.0  
**Datafast Guide Compliance:** ✅ Complete
