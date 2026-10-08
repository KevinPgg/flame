# Next.js Error Fixes

## Summary

Fixed three Next.js/TypeScript errors:

1. Hydration mismatch warning (browser extension interference)
2. Payment verification returning empty object on error
3. TypeScript compilation error: 'supabaseAdmin' is possibly 'null' (January 19, 2026)

---

## Issue 1: Hydration Mismatch Warning

### Error Message

```
A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.
...
- cz-shortcut-listen="true"
```

### Root Cause

Browser extensions (commonly password managers, form fillers, or shortcut tools) inject attributes into the DOM after React has hydrated. The `cz-shortcut-listen="true"` attribute is specifically added by browser extensions and causes React to warn about hydration mismatches.

### Solution

Added `suppressHydrationWarning` to the `<body>` tag in `app/layout.tsx`.

**File**: `app/layout.tsx`

**Change**:

```tsx
<body
  className={`${geistSans.variable} ${geistMono.variable} antialiased`}
  suppressHydrationWarning  // ✅ Added this
>
```

### Why This Works

- The attribute is added by browser extensions, not our code
- It doesn't affect functionality or security
- `suppressHydrationWarning` tells React to ignore attribute mismatches on this element
- This is a [recommended React approach](https://react.dev/reference/react-dom/client/hydrateRoot#suppressing-unavoidable-hydration-mismatch-errors) for third-party script interference

### When This Happens

Common browser extensions that cause this:

- Password managers (LastPass, 1Password, etc.)
- Form autofill tools
- Keyboard shortcut extensions
- Accessibility tools

---

## Issue 2: Payment Verification Empty Object

### Error Message

```
Payment verification failed: {}
```

### Root Cause

The catch block in `/api/datafast/verify-payment/route.ts` was returning a simple error object:

```typescript
return NextResponse.json(
  { error: "Failed to verify payment" },
  { status: 500 }
);
```

But the frontend (`app/purchase/page.tsx`) expects a structured response with:

- `isSuccess: boolean`
- `category: string`
- `action: string`
- `showCard: boolean`
- `error: string`

When these fields were missing, the frontend logged an empty object `{}`.

### Solution

Updated the catch block to return a properly structured error response.

**File**: `app/api/datafast/verify-payment/route.ts`

**Before**:

```typescript
} catch (error) {
  console.error("Error verifying Datafast payment:", error);
  return NextResponse.json(
    { error: "Failed to verify payment" },
    { status: 500 }
  );
}
```

**After**:

```typescript
} catch (error) {
  console.error("Error verifying Datafast payment:", error);

  // Return structured error response that matches frontend expectations
  return NextResponse.json(
    {
      error: "Failed to verify payment. Please try again or contact support.",
      isSuccess: false,
      category: "TECHNICAL",
      action: "CONTACT_SUPPORT",
      showCard: false,
      details: error instanceof Error ? error.message : String(error),
    },
    { status: 500 }
  );
}
```

### Why This Works

1. **Consistent Error Structure**: All error responses now have the same shape
2. **Frontend Compatibility**: The frontend error handler can safely access `verifyData.action`, `verifyData.category`, etc.
3. **Better UX**: Users see "Contact Support" button instead of generic "Browse Events"
4. **Better Debugging**: The `details` field captures the actual error for logs

### Related Code

The frontend handles these fields in `app/purchase/page.tsx`:

```typescript
if (!verifyResponse.ok || !verifyData.isSuccess) {
  const errorCategory = verifyData.category; // ✅ Now always present
  const apiErrorAction = verifyData.action; // ✅ Now always present
  const errorMessage = verifyData.error || "..."; // ✅ Now always present

  setErrorAction(apiErrorAction); // Used to display correct buttons
  // ...
}
```

---

## Testing

### Test Hydration Fix:

1. Open the app in a browser with extensions installed
2. Check the console - hydration warning should be gone ✅

### Test Payment Error Fix:

1. Simulate a network error during payment verification (disable network briefly)
2. Check console - should see structured error, not `{}` ✅
3. Check UI - should show "Contact Support" button ✅

---

## Files Modified

1. **`app/layout.tsx`**

   - Added `suppressHydrationWarning` to `<body>` tag

2. **`app/api/datafast/verify-payment/route.ts`**

   - Updated catch block to return structured error response

3. **`app/api/cron/cleanup-past-event-rsvps/route.ts`** (January 19, 2026)

   - Added non-null assertions to 4 `supabaseAdmin` usages

4. **`app/api/cron/monitor-payment-authorizations/route.ts`** (January 19, 2026)

   - Added non-null assertions to 6 `supabaseAdmin` usages

5. **`docs/guides/FEATURE_DEVELOPMENT_GUIDE.md`** (January 19, 2026)
   - Added TypeScript best practices section for handling nullable `supabaseAdmin`

---

## Impact

### Before

- Console cluttered with hydration warnings
- Payment errors showed empty object `{}`
- Unclear error handling for network/unexpected errors

### After

- ✅ Clean console output
- ✅ Structured error responses
- ✅ Proper error buttons displayed ("Contact Support" for technical errors)
- ✅ Better debugging with error details

---

## Related Documentation

- [React Hydration Mismatch Docs](https://react.dev/reference/react-dom/client/hydrateRoot#suppressing-unavoidable-hydration-mismatch-errors)
- `docs_guides/DATAFAST_ERROR_CATEGORIZATION.md` - Error categorization logic
- `app/lib/datafast-error-handler.ts` - Error handler implementation

---

## Issue 3: TypeScript Compilation Error - 'supabaseAdmin' is possibly 'null'

**Fixed:** January 19, 2026

### Error Message

```
Failed to compile.
./app/api/cron/cleanup-past-event-rsvps/route.ts:93:60
Type error: 'supabaseAdmin' is possibly 'null'.
  91 |   try {
  92 |     // Step 1: Find all events that have ended
> 93 |     const { data: pastEvents, error: eventsError } = await supabaseAdmin
     |                                                            ^
  94 |       .from("events")
  95 |       .select("id, name, ends_at")
  96 |       .lt("ends_at", new Date().toISOString())
```

### Root Cause

`supabaseAdmin` from `app/lib/supabase/server.ts` can be `null` if environment variables (`NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`) aren't configured:

```typescript
export const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, { ... })
    : null;
```

While the POST handlers check for null, TypeScript doesn't track null checks across function boundaries. Helper functions that use `supabaseAdmin` after the null check still trigger the error.

### Solution

Add non-null assertion operator (`!`) to all `supabaseAdmin` usages in helper functions after verifying the null check exists in the main handler.

**Pattern:**

```typescript
// ✅ Main handler checks for null
export async function POST(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Database connection error" },
      { status: 500 }
    );
  }

  // Call helper function
  const results = await helperFunction();
}

// Helper function uses non-null assertion
async function helperFunction() {
  // Use supabaseAdmin! (non-null assertion)
  const { data } = await supabaseAdmin!
    .from("table")
    .select("*");
}
```

### Files Fixed

**1. `/app/api/cron/cleanup-past-event-rsvps/route.ts`**

Changed 4 occurrences:

```typescript
// Line 93 - Find past events
const { data: pastEvents, error: eventsError } = await supabaseAdmin!
  .from("events")

// Line 119 - Find pending RSVPs
const { data: pendingRsvps, error: rsvpsError } = await supabaseAdmin!
  .from("rsvps")

// Line 145 - Update RSVPs to expired
const { data: expiredRsvps, error: updateError } = await supabaseAdmin!
  .from("rsvps")

// Line 178 - Clean up pending requests
const { data: deletedPendingRequests, error: pendingRequestsError } = await supabaseAdmin!
  .from("rsvp_pending_requests")
```

**2. `/app/api/cron/monitor-payment-authorizations/route.ts`**

Changed 6 occurrences:

```typescript
// Line 144 - Query expiring RSVPs
const { data: expiringRsvps, error: queryError } = await supabaseAdmin!
  .from("rsvps")

// Line 303 - Update notification timestamp
const { data: updatedRsvp, error: updateNotifiedError } = await supabaseAdmin!
  .from("rsvps")

// Line 357 - Rollback notification timestamp
const { error: rollbackError } = await supabaseAdmin!
  .from("rsvps")

// Line 382 - Auto-cancel RSVP
const { data: updatedRsvp, error: updateError } = await supabaseAdmin!
  .from("rsvps")

// Line 491 - Rollback auto-cancel
const { error: rollbackError } = await supabaseAdmin!
  .from("rsvps")

// Line 541 - Sync cancelled status
const { data: syncedRsvp, error: syncError } = await supabaseAdmin!
  .from("rsvps")
```

### Why This Works

TypeScript's control flow analysis doesn't track null checks across function boundaries. Even though the POST handler checks `if (!supabaseAdmin)`, helper functions called after that check don't inherit this knowledge. The non-null assertion (`!`) tells TypeScript: "I've already verified this isn't null."

### Verification

**Build Status:** ✅ Passing

```bash
# Clean build test
rm -rf .next && pnpm run build
# Result: ✓ Compiled successfully
```

**TypeScript Check:** ✅ Passing

```bash
pnpm tsc --noEmit
# Result: No errors in cron job files
```

### Impact

**Before:**
- ❌ Build failed with TypeScript compilation errors
- ❌ Couldn't deploy to Vercel
- ❌ Cron jobs wouldn't run

**After:**
- ✅ Clean build with no TypeScript errors
- ✅ Vercel deployment successful
- ✅ Cron jobs functioning correctly

### Best Practice

When using `supabaseAdmin` in API routes:

1. **Always check for null in the main handler:**
```typescript
if (!supabaseAdmin) {
  return NextResponse.json(
    { error: "Database connection error" },
    { status: 500 }
  );
}
```

2. **Use non-null assertion in helper functions:**
```typescript
const { data } = await supabaseAdmin!.from("table").select("*");
```

3. **Alternative: Pass supabaseAdmin as parameter:**
```typescript
// If you prefer not to use non-null assertion
async function helper(db: SupabaseClient) {
  const { data } = await db.from("table").select("*");
}

// Call with verified instance
await helper(supabaseAdmin);
```

### Related Files

- `app/lib/supabase/server.ts` - Defines `supabaseAdmin` and its nullable type
- `docs/guides/FEATURE_DEVELOPMENT_GUIDE.md` - Added TypeScript null check best practices section
